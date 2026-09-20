/**
 * PromotionManager: turn an accepted attempt into a real promotion.
 *
 * The Python baseline treated PROMOTION_COMMITTED as an injected fact. P1
 * elevates it to a real flow: the manager appends a durable PREPARED intent,
 * executes the git.promote Safe Action on the shared Ordarium ledger, and
 * only then records PROMOTION_COMMITTED with the *action's* resulting head
 * commit. Runtime crash windows are recovered by Ordarium's reconcilable
 * semantics:
 *
 *   - Crash A (before the merge): reconcile sees head unchanged → absent,
 *     retrySafe → the operation re-dispatches and the promotion lands once.
 *   - Crash B (merge landed, ledger write lost): reconcile sees the source
 *     applied → succeeded → PROMOTION_COMMITTED is recorded, and git.promote
 *     is never executed a second time.
 *
 * Idempotency keys are deterministic per promotion, so replay after a crash
 * never double-commits.
 */

import {
  operationIdentityPreview,
  OrdariumError,
  SimulatedProcessCrash,
  type Action,
  type JsonValue,
} from "@ordarium/core";

import { actionKey, stableEntityId } from "../domain/index.js";
import {
  parseNewEvent,
  parseAttemptReport,
  parseTaskEnvelope,
  type SchedulerEvent,
} from "../schema/index.js";
import type { EventStore } from "../state/index.js";
import { DomainValidationError } from "../domain/errors.js";
import {
  deriveProjectHeadStatus,
  ProjectHeadError,
  type ProjectHeadStatus,
  type PromotionFact,
} from "../domain/project_head.js";
import { GateEngine, type GateResult } from "../evidence/gate_dsl.js";
import {
  readPromotionEligibilityInput,
  readPromotionFenceRows,
} from "../domain/promotion_eligibility_read.js";
import {
  assessPromotionEligibility,
  PromotionEligibilityError,
  type PromotionBlocker,
  type PromotionEligibilityAssessment,
  type PromotionFenceRow,
} from "../domain/promotion_eligibility.js";
import {
  PromotionIntentPermit,
  PromotionOutcomeWitness,
  type PromotionOutcomeWitnessInput,
} from "../domain/promotion_terminal_admission.js";
import type { PromotionOutcomeBasis } from "../domain/promotion_terminal.js";
import { canonicalDigest } from "../schema/canonical.js";
import { isTransientOperationError } from "./errors.js";
import { orchestrationAuthorization, type PalimpsestEffectsRuntime } from "./runtime.js";
import type { PromotionRecoveryOutcome, RecoveryReport } from "../recovery/recovery.js";

/**
 * Safe error codes that justify terminalizing a promotion during recovery.
 * Anything else (infrastructure doubt) leaves the promotion PREPARED and
 * lands in the blocked report - a fabricated verdict is worse than none.
 */
const DETERMINISTIC_FAILURE_CODES = new Set([
  "OPERATION_FAILED",
  "ACTION_DENIED",
  "AUTHORIZATION_REQUIRED",
  "AUTHORIZATION_CONFLICT",
  "CONTRACT_DRIFT",
]);

export interface PromoteOptions {
  attemptId: string;
  sourceCommit: string;
  expectedHeadCommit: string;
  reason?: string | undefined;
}

export interface PromoteResult {
  promotionId: string;
  committed: SchedulerEvent;
  resultingHeadCommit: string;
}

export function promotionIdFor(projectId: string, attemptId: string): string {
  return stableEntityId(
    "promotion",
    actionKey("promotion-v1", { project_id: projectId, attempt_id: attemptId }),
  );
}

export class PromotionManager {
  readonly #store: EventStore;
  readonly #effects: PalimpsestEffectsRuntime;
  readonly projectId: string;

  /**
   * @param execution - where attempts work. "worktree" (default): the promotion merges the
   *   attempt's worktree commit into the canonical branch, and the repository head must equal the
   *   proven effect head for that merge to be the effect it claims to be. "in-place": the agent's
   *   commits ARE the canonical tree, so the repository head is already the recorded commit and the
   *   merge is a no-op ("Already up to date"); the git effect still runs — the audit trail records
   *   a real effect with a real outcome — but the head it is performed AGAINST is the repository's,
   *   not the chain's. Measured live: passing the chain head there made every in-place promotion
   *   fail its precondition, because the agent's own commit had already moved the repository head.
   */
  constructor(
    store: EventStore,
    effects: PalimpsestEffectsRuntime,
    projectId: string,
    execution: "worktree" | "in-place" = "worktree",
  ) {
    this.#store = store;
    this.#effects = effects;
    this.projectId = projectId;
    this.#execution = execution;
  }

  readonly #execution: "worktree" | "in-place";

  projectRevision(): number {
    const row = this.#store.connection
      .prepare("SELECT revision FROM projects WHERE project_id=?")
      .get(this.projectId) as { revision: number } | undefined;
    if (row === undefined) {
      throw new DomainValidationError("project does not exist");
    }
    return row.revision;
  }

  // -------------------------------------------------------------------------
  // Canonical project-head derivation (G10-X)
  //
  // The read model is derived EXCLUSIVELY from the ProjectIR head plus the
  // canonical PROMOTION_COMMITTED facts, in event order. Node's SQLite handle
  // is synchronous, so the derivation is synchronous under the hood; the public
  // promises are the sanctioned async surface, and the `…Sync` variants exist
  // only so the synchronous revision path (planReconciled) can validate a
  // trusted head advance without I/O.
  // -------------------------------------------------------------------------

  /** The canonical committed promotion facts, in event order. */
  promotionFacts(): Promise<readonly PromotionFact[]> {
    return Promise.resolve(this.promotionFactsSync());
  }

  promotionFactsSync(): readonly PromotionFact[] {
    return this.#store
      .listEvents(this.projectId)
      .filter((event) => event.event_type === "PROMOTION_COMMITTED")
      .map((event) => {
        const payload = event.payload;
        return {
          eventId: String(event.event_id),
          promotionId: String(payload.promotion_id),
          attemptId: String(payload.attempt_id),
          sourceCommit: String(payload.source_commit),
          expectedHeadCommit: String(payload.expected_head_commit),
          resultingHeadCommit: String(payload.resulting_head_commit),
        };
      });
  }

  /** The ProjectIR head plus the derived effect-head status. */
  projectHeadStatus(): Promise<ProjectHeadStatus> {
    return Promise.resolve(this.projectHeadStatusSync());
  }

  projectHeadStatusSync(): ProjectHeadStatus {
    const project = this.#projectHeadRow();
    return deriveProjectHeadStatus({
      project: { revision: project.revision, headCommit: project.headCommit },
      promotions: this.promotionFactsSync(),
    });
  }

  /**
   * The ONLY sanctioned expected head: the proven effect head of the
   * contiguous promotion chain, falling back to the ProjectIR head when no
   * promotion is chained. A broken chain is a hard `head_conflict` - there is
   * no ambient fallback.
   */
  canonicalExpectedHead(): Promise<string> {
    return Promise.resolve(this.canonicalExpectedHeadSync());
  }

  canonicalExpectedHeadSync(): string {
    const status = this.projectHeadStatusSync();
    if (status.state === "CONFLICT") {
      throw new ProjectHeadError(
        "head_conflict",
        "the promotion chain is broken; the canonical expected head cannot be determined",
        [status.projectHeadCommit, status.provenEffectHeadCommit].concat(
          status.latestPromotionEventRef === null ? [] : [status.latestPromotionEventRef],
        ),
      );
    }
    return status.provenEffectHeadCommit;
  }

  /**
   * The canonical source commit for one attempt: the `result_commit` of its
   * stored AttemptReport. The caller never supplies this - an attempt without a
   * completed report (or with a null result commit) fails closed.
   */
  canonicalAttemptResultCommit(attemptId: string): string {
    const row = this.#store.connection
      .prepare("SELECT report_json FROM attempts WHERE project_id=? AND attempt_id=?")
      .get(this.projectId, attemptId) as { report_json: Uint8Array | null } | undefined;
    if (row === undefined) {
      throw new ProjectHeadError(
        "caller_source_not_canonical",
        `attempt ${attemptId} does not exist; the promotion source can only be canonical`,
        [attemptId],
      );
    }
    if (row.report_json === null) {
      throw new ProjectHeadError(
        "caller_source_not_canonical",
        `attempt ${attemptId} has no completed report; the promotion source can only be canonical`,
        [attemptId],
      );
    }
    const report = parseAttemptReport(JSON.parse(new TextDecoder().decode(row.report_json)));
    if (report.result_commit === null) {
      throw new ProjectHeadError(
        "caller_source_not_canonical",
        `attempt ${attemptId} report has no result_commit; the promotion source can only be canonical`,
        [attemptId],
      );
    }
    return report.result_commit;
  }

  /**
   * §32 idempotent terminal replay: an attempt whose promotion already reached a
   * terminal fact is answered from HISTORY, before any question of current
   * authority is asked. A replay is not fresh authority, it never re-executes the
   * external effect, and it is deliberately not refused for a Work state that
   * the promotion itself produced (the task is SATISFIED afterwards).
   */
  #terminalReplay(attemptId: string): PromoteResult | undefined {
    const promotionId = promotionIdFor(this.projectId, attemptId);
    const existing = this.#terminal(promotionId);
    if (existing === undefined) return undefined;
    if (existing.event_type !== "PROMOTION_COMMITTED") {
      throw new DomainValidationError(`promotion ${promotionId} already failed`);
    }
    return {
      promotionId,
      committed: existing,
      resultingHeadCommit: String(existing.payload.resulting_head_commit),
    };
  }

  /**
   * High-level promotion: the caller names the attempt (and optionally a gate),
   * never the commits. The source is the attempt's canonical result commit and
   * the expected head is the canonical proven effect head.
   *
   * G10-Z: the canonical derivations alone are NOT authority. The attempt must
   * additionally pass the shared eligibility assessment, which proves that the
   * Work authorizing the result is still current - completed candidate of the
   * task's CURRENT batch, a current VERIFYING task, an input world matching the
   * current ProjectIR, and a head compatible with the supported protocol.
   */
  async promoteAttempt(input: {
    attemptId: string;
    gateId?: string | undefined;
    reason?: string | undefined;
  }): Promise<PromoteResult> {
    const replay = this.#terminalReplay(input.attemptId);
    if (replay !== undefined) return replay;
    const assessment = this.assessEligibility(input.attemptId, {
      ...(input.gateId === undefined ? {} : { gateId: input.gateId }),
    });
    if (!assessment.eligible) {
      throw new PromotionEligibilityError(input.attemptId, assessment.blockers);
    }
    if (assessment.sourceCommit === null) {
      throw new PromotionEligibilityError(input.attemptId, [
        Object.freeze({
          kind: "result_commit_missing" as const,
          detail: `attempt ${input.attemptId} has no result_commit`,
          refs: [input.attemptId],
        }),
      ]);
    }
    const expectedHeadCommit = await this.canonicalExpectedHead();
    return this.promote({
      attemptId: input.attemptId,
      sourceCommit: assessment.sourceCommit,
      expectedHeadCommit,
      ...(input.reason === undefined ? {} : { reason: input.reason }),
    });
  }

  // -------------------------------------------------------------------------
  // G10-Z: promotion eligibility (current effect authority)
  // -------------------------------------------------------------------------

  /**
   * The pending promotion intents, derived from canonical events only.
   *
   *   PREPARED            - an external-effect intent with no terminal fact
   *   COMMITTED_UNSETTLED - the effect is recorded but the owning Work was never
   *                         admitted (no TASK_SATISFIED caused by it)
   *
   * No separate store and no lock table: this is a read over the promotion
   * events and the attempts projection.
   */
  promotionFenceRows(): readonly PromotionFenceRow[] {
    return readPromotionFenceRows(this.#store.connection, this.projectId);
  }

  /**
   * The current promotion-eligibility assessment for one attempt. READ-ONLY: it
   * performs no write and starts no effect, so it is safe to expose for
   * preview/explanation (§41).
   *
   * The read model comes from the ONE shared reader, and the current-batch fact
   * from the aggregate validator's OWN derivation - never a second
   * interpretation of the batch anchor.
   */
  assessEligibility(
    attemptId: string,
    options: { gateId?: string | undefined } = {},
  ): PromotionEligibilityAssessment {
    return assessPromotionEligibility(this.#eligibilityInput(attemptId, options.gateId));
  }

  #eligibilityInput(
    attemptId: string,
    gateId?: string | undefined,
  ): Parameters<typeof assessPromotionEligibility>[0] {
    let gate: { gateId: string; verdict: string } | null = null;
    if (gateId !== undefined) {
      // Y semantics carry into promotion admission unchanged: Evidence that lost
      // its authority cannot keep a gate PASS, so it cannot authorize an effect.
      const verdict: GateResult = new GateEngine().evaluate(
        this.#store,
        this.projectId,
        "attempt",
        attemptId,
        gateId,
      );
      gate = { gateId, verdict: verdict.verdict };
    }
    const promotionId = promotionIdFor(this.projectId, attemptId);
    return readPromotionEligibilityInput({
      connection: this.#store.connection,
      projectId: this.projectId,
      attemptId,
      currentBatch: (taskRow) => {
        const [activationEventId, , attempts] = this.#store.aggregateValidator.currentBatch(
          this.#store.connection,
          taskRow,
        );
        return {
          activationEventId,
          attemptIds: attempts.map((row) => String(row.attempt_id)),
        };
      },
      gate,
      considerPendingPromotion: true,
      // An outstanding intent for THIS attempt is the promotion this call would
      // retry, not a new one: a retry re-enters the same Ordarium operation
      // identity and must not be refused as fresh authority.
      retryOfPromotionId: promotionId,
    });
  }

  /**
   * G10-AA §19/§20: the deterministic Ordarium operation identity and input
   * digest for one promotion. Reuses `operationIdentityPreview` - there is no
   * second identity algorithm - so a witness is bound to the exact operation the
   * effect was dispatched under.
   */
  #operationRefOf(input: {
    promotionId: string;
    sourceCommit: string;
    expectedHeadCommit: string;
  }): { operationId: string; inputDigest: string } {
    const actionInput = {
      promotionId: input.promotionId,
      sourceCommit: input.sourceCommit,
      expectedHeadCommit: input.expectedHeadCommit,
    };
    return {
      operationId: operationIdentityPreview(this.#effects.actions.gitPromote, actionInput, {
        source: "palimpsest",
        scope: this.projectId,
        callId: `promote:${input.promotionId}`,
      }).operationId,
      inputDigest: canonicalDigest({ domain: "palimpsest.promote-input.v1", ...actionInput }),
    };
  }

  /** The PREPARED event this promotion was admitted by, when it exists. */
  #preparedEventRefOf(promotionId: string): string | null {
    const row = this.#store.connection
      .prepare(
        "SELECT event_id FROM events WHERE project_id=? AND event_type='PROMOTION_PREPARED' AND entity_id=? ORDER BY event_id LIMIT 1",
      )
      .get(this.projectId, promotionId) as { event_id: number } | undefined;
    return row === undefined ? null : String(row.event_id);
  }

  #projectHeadRow(): { revision: number; digest: string; headCommit: string } {    const row = this.#store.connection
      .prepare("SELECT revision, digest, head_commit FROM projects WHERE project_id=?")
      .get(this.projectId) as
      | { revision: number; digest: string; head_commit: string }
      | undefined;
    if (row === undefined) {
      throw new DomainValidationError("project does not exist");
    }
    return {
      revision: Number(row.revision),
      digest: String(row.digest),
      headCommit: String(row.head_commit),
    };
  }

  async promote(options: PromoteOptions): Promise<PromoteResult> {
    // §32 first: a terminal promotion is answered from history before any
    // question of current authority is asked.
    const replay = this.#terminalReplay(options.attemptId);
    if (replay !== undefined) return replay;
    const promotionId = promotionIdFor(this.projectId, options.attemptId);

    // G10-Z: CURRENT effect authority, checked before anything is written and
    // before any external effect can start. The expert path is not an authority
    // bypass: it must pass the SAME assessment as the product path.
    const assessment = this.assessEligibility(options.attemptId);
    if (!assessment.eligible) {
      throw new PromotionEligibilityError(options.attemptId, assessment.blockers);
    }

    // G10-X: the caller-supplied source and expected head are STRICTLY
    // validated against the canonical derivations before anything is appended -
    // there is no free choice. A broken promotion chain fails with head_conflict
    // (canonicalExpectedHeadSync) before any write.
    const canonicalSource = this.canonicalAttemptResultCommit(options.attemptId);
    if (options.sourceCommit !== canonicalSource) {
      throw new ProjectHeadError(
        "caller_source_not_canonical",
        `source commit ${options.sourceCommit} does not match the canonical AttemptReport.result_commit ${canonicalSource}`,
        [options.attemptId, options.sourceCommit, canonicalSource],
      );
    }
    const canonicalHead = this.canonicalExpectedHeadSync();
    if (options.expectedHeadCommit !== canonicalHead) {
      throw new ProjectHeadError(
        "caller_head_not_canonical",
        `expected head ${options.expectedHeadCommit} does not match the canonical proven effect head ${canonicalHead}`,
        [options.expectedHeadCommit, canonicalHead],
      );
    }

    this.#appendPrepared(promotionId, options);
    const revision = this.projectRevision();

    try {
      // The head the merge is performed AGAINST. Worktree: the proven effect head, because the
      // worktree's commit is not on the canonical branch yet. In-place: the repository's own head,
      // which the controller has already proven equals the attempt's recorded commit — so the
      // merge is git's honest "Already up to date" rather than a refusal.
      const mergeExpectedHead =
        this.#execution === "in-place" ? options.sourceCommit : options.expectedHeadCommit;
      const outcome = await this.#effects.invoke(
        this.#effects.actions.gitPromote,
        {
          promotionId,
          sourceCommit: options.sourceCommit,
          expectedHeadCommit: mergeExpectedHead,
        },
        { scope: this.projectId, callId: `promote:${promotionId}`, revision: revision },
      );
      return {
        promotionId,
        committed: this.#appendCommitted({
          basis: "invoke_result",
          promotionId,
          attemptId: options.attemptId,
          sourceCommit: options.sourceCommit,
          expectedHeadCommit: options.expectedHeadCommit,
          resultingHeadCommit: outcome.resultingHeadCommit,
          reason: options.reason ?? "promoted via Ordarium git.promote",
        }),
        resultingHeadCommit: outcome.resultingHeadCommit,
      };
    } catch (error) {
      // Crash windows and uncertain outcomes must NOT terminalize the
      // promotion: a restart reclaims the operation and reconciles. Only a
      // deterministic failure records PROMOTION_FAILED.
      //
      // G10-X external divergence: the live branch differs from the canonical
      // expected head AND the source commit did not land - the promotion failed
      // because someone moved the branch outside the canonical ledger. Never
      // adopt the ambient head and never fabricate a PROMOTION_COMMITTED; the
      // PREPARED intent stays for a head-reconciled retry. A genuine crash
      // window (SimulatedProcessCrash) is exempt: it is a recovery signal, not
      // a divergence verdict.
      if (!(error instanceof SimulatedProcessCrash)) {
        const liveHead = await this.#gitHeadOrUndefined();
        if (liveHead !== undefined && liveHead !== options.expectedHeadCommit) {
          const contained = await this.#gitContainsOrUndefined(options.sourceCommit);
          if (contained === false) {
            throw new ProjectHeadError(
              "external_head_divergence",
              `the live git head ${liveHead} differs from the canonical expected head ${options.expectedHeadCommit}; refusing to adopt the ambient head`,
              [options.expectedHeadCommit, liveHead],
            );
          }
        }
      }
      if (isTransientOperationError(error)) throw error;
      this.#appendFailed({
        basis: "deterministic_failure",
        promotionId,
        attemptId: options.attemptId,
        sourceCommit: options.sourceCommit,
        expectedHeadCommit: options.expectedHeadCommit,
        reason: (error as Error).message,
      });
      throw error;
    }
  }

  /** Diagnostic-only live head; a failing git port yields undefined. */
  async #gitHeadOrUndefined(): Promise<string | undefined> {
    try {
      return await this.#effects.git.head();
    } catch {
      return undefined;
    }
  }

  /** Diagnostic-only ancestry probe; a failing git port yields undefined. */
  async #gitContainsOrUndefined(commit: string): Promise<boolean | undefined> {
    try {
      return await this.#effects.git.contains(commit);
    } catch {
      return undefined;
    }
  }

  /**
   * Startup reconciliation (H1 spec §3.1): every PREPARED promotion without a
   * terminal event is driven to a terminal state from Ordarium's ledger - the
   * single source of truth for whether the git operation happened. Succeeded
   * records are backfilled from the receipt; failed records from the safe
   * error; uncertain records run the action's own reconcile query (head vs
   * expected -> succeeded / failed / absent-retrySafe -> redispatch); in-flight
   * records are reported untouched; a missing record is redispatched (the
   * PREPARED intent was written but the invocation never started).
   */
  async reconcileAll(): Promise<RecoveryReport> {
    const report: RecoveryReport = { prepared: 0, terminal: [], inFlight: [], blocked: [] };
    for (const entry of this.#preparedPromotions()) {
      report.prepared += 1;
      const outcome = await this.#reconcileOne(entry);
      if (outcome.outcome === "in-flight") report.inFlight.push(outcome);
      else if (outcome.outcome === "blocked") report.blocked.push(outcome);
      else report.terminal.push(outcome);
    }
    return report;
  }

  #preparedPromotions(): Array<{
    promotion_id: string;
    attempt_id: string;
    source_commit: string;
    expected_head_commit: string;
  }> {
    const rows = this.#store.connection
      .prepare(
        `SELECT payload_json AS payload FROM events
         WHERE project_id=? AND event_type='PROMOTION_PREPARED'
           AND entity_id NOT IN (
             SELECT entity_id FROM events
             WHERE project_id=? AND event_type IN ('PROMOTION_COMMITTED','PROMOTION_FAILED')
           )
         ORDER BY event_id`,
      )
      .all(this.projectId, this.projectId) as Array<{ payload: Uint8Array }>;
    return rows.map((row) => {
      const payload = JSON.parse(new TextDecoder().decode(row.payload)) as Record<string, unknown>;
      return {
        promotion_id: String(payload.promotion_id),
        attempt_id: String(payload.attempt_id),
        source_commit: String(payload.source_commit),
        expected_head_commit: String(payload.expected_head_commit),
      };
    });
  }

  async #reconcileOne(entry: {
    promotion_id: string;
    attempt_id: string;
    source_commit: string;
    expected_head_commit: string;
  }): Promise<PromotionRecoveryOutcome> {
    const promotionId = entry.promotion_id;
    const input = {
      promotionId,
      sourceCommit: entry.source_commit,
      expectedHeadCommit: entry.expected_head_commit,
    };
    const intent = {
      scope: this.projectId,
      callId: `promote:${promotionId}`,
      revision: this.projectRevision(),
    };
    const operationId = operationIdentityPreview(
      this.#effects.actions.gitPromote,
      input,
      { source: "palimpsest", scope: intent.scope, callId: intent.callId },
    ).operationId;
    const record = await this.#effects.runtime.ledger.get(operationId);

    // G10-Z §27: recovery must RE-CHECK current promotion authority before it
    // dispatches or redispatches anything. An intent prepared while the Work was
    // current does not license an effect after that Work was retired - the
    // authority follows the Work, never the stored intent.
    //
    // §28 exception: when Ordarium PROVES the effect already occurred, reality is
    // recorded rather than hidden. Effect truth is not Work admission, and a
    // retired task is never auto-satisfied by it.
    const effectProven =
      record !== undefined && (record.state === "succeeded" || record.state === "reconciled");
    if (!effectProven) {
      const authority = this.assessEligibility(entry.attempt_id).blockers;
      if (authority.length > 0) {
        const summary = authority.map((item) => item.kind).join(", ");
        if (record === undefined) {
          // The invocation provably never started AND the authorizing Work is
          // gone: FAILED is the materially honest terminal fact (the promotion
          // did not and cannot happen). Never dispatch under revoked authority.
          const reason = `promotion authority was revoked before the effect started (${summary})`;
          this.#appendFailed({
            basis: "authority_revoked_before_dispatch",
            promotionId,
            attemptId: entry.attempt_id,
            sourceCommit: entry.source_commit,
            expectedHeadCommit: entry.expected_head_commit,
            reason,
          });
          return { promotionId, outcome: "failed", reason };
        }
        // The effect may or may not have begun. Palimpsest does not reimplement
        // Ordarium's recovery evaluator, and it will not fabricate success or
        // failure: the intent stays unresolved and surfaces for the engine.
        return {
          promotionId,
          outcome: "blocked",
          reason: `promotion_effect_resolution_required: ${summary}`,
        };
      }
    }

    if (record === undefined) {
      // PREPARED was written but the invocation never started: run it now.
      return this.#redispatch(entry, input, intent);
    }
    if (record.state === "succeeded" || record.state === "reconciled") {
      // Crash B: the merge landed, the ledger write did not survive.
      const receipt = record.receipt as { resultingHeadCommit?: unknown } | null;
      const head = receipt === null ? undefined : receipt.resultingHeadCommit;
      if (typeof head !== "string") {
        return {
          promotionId,
          outcome: "blocked",
          reason: "succeeded record without a resulting head",
        };
      }
      this.#appendCommitted({
        basis: "ledger_receipt",
        promotionId,
        attemptId: entry.attempt_id,
        sourceCommit: entry.source_commit,
        expectedHeadCommit: entry.expected_head_commit,
        resultingHeadCommit: head,
        reason: "recovered: Ordarium operation already succeeded",
      });
      return { promotionId, outcome: "committed", resultingHeadCommit: head, via: "receipt" };
    }
    if (record.state === "failed" || record.state === "denied") {
      const reason = record.error?.message ?? `operation ${record.state} (recovered)`;
      this.#appendFailed({
        basis: record.state === "denied" ? "denied" : "deterministic_failure",
        promotionId,
        attemptId: entry.attempt_id,
        sourceCommit: entry.source_commit,
        expectedHeadCommit: entry.expected_head_commit,
        reason,
      });
      return { promotionId, outcome: "failed", reason };
    }
    if (record.state === "cancelled") {
      const reason = "operation cancelled (recovered)";
      this.#appendFailed({
        basis: "cancelled",
        promotionId,
        attemptId: entry.attempt_id,
        sourceCommit: entry.source_commit,
        expectedHeadCommit: entry.expected_head_commit,
        reason,
      });
      return { promotionId, outcome: "failed", reason };
    }
    // proposed / authorized / claimed / dispatched / uncertain: drive the
    // engine with a normal-mode invocation and let its recovery evaluator
    // decide (H1 §3.1: the host never re-implements recovery semantics).
    // A live lease refuses with OPERATION_BUSY (reported in-flight); an
    // expired lease reclaims and reconciles; Crash A redispatches; Crash B
    // resolves from the reconcile query without re-executing git.promote.
    try {
      const outcome = await this.#effects.invoke(this.#effects.actions.gitPromote, input, intent);
      this.#appendCommitted({
        basis: "reconciled_result",
        promotionId,
        attemptId: entry.attempt_id,
        sourceCommit: entry.source_commit,
        expectedHeadCommit: entry.expected_head_commit,
        resultingHeadCommit: outcome.resultingHeadCommit,
        reason: "recovered: Ordarium reconciled the interrupted operation",
      });
      return {
        promotionId,
        outcome: "committed",
        resultingHeadCommit: outcome.resultingHeadCommit,
        via: "reconcile",
      };
    } catch (error) {
      if (!isTransientOperationError(error)) {
        if (error instanceof OrdariumError && DETERMINISTIC_FAILURE_CODES.has(error.code)) {
          const reason = `recovered failure: ${error.message}`;
          this.#appendFailed({
            basis: "deterministic_failure",
            promotionId,
            attemptId: entry.attempt_id,
            sourceCommit: entry.source_commit,
            expectedHeadCommit: entry.expected_head_commit,
            reason,
          });
          return { promotionId, outcome: "failed", reason };
        }
        return {
          promotionId,
          outcome: "blocked",
          reason: `reconciliation failed: ${(error as Error).message}`,
        };
      }
      const state =
        (
          await this.#effects.runtime.ledger.get(
            operationIdentityPreview(this.#effects.actions.gitPromote, input, {
              source: "palimpsest",
              scope: intent.scope,
              callId: intent.callId,
            }).operationId,
          )
        )?.state ?? "unknown";
      if (state === "uncertain") {
        return {
          promotionId,
          outcome: "blocked",
          reason: "promotion stays uncertain after reconciliation",
        };
      }
      return { promotionId, outcome: "in-flight", ordariumState: state };
    }
  }

  async #redispatch(
    entry: {
      promotion_id: string;
      attempt_id: string;
      source_commit: string;
      expected_head_commit: string;
    },
    input: { promotionId: string; sourceCommit: string; expectedHeadCommit: string },
    intent: { scope: string; callId: string; revision: number },
  ): Promise<PromotionRecoveryOutcome> {
    // §27: the last gate before a NEW external dispatch. `#reconcileOne` already
    // refuses when authority is gone, so this is defence in depth for the case
    // where the record was absent and the world moved underneath the call.
    const authority = this.assessEligibility(entry.attempt_id).blockers;
    if (authority.length > 0) {
      const reason = `promotion authority was revoked before redispatch (${authority
        .map((item) => item.kind)
        .join(", ")})`;
      this.#appendFailed({
        basis: "authority_revoked_before_dispatch",
        promotionId: entry.promotion_id,
        attemptId: entry.attempt_id,
        sourceCommit: entry.source_commit,
        expectedHeadCommit: entry.expected_head_commit,
        reason,
      });
      return { promotionId: entry.promotion_id, outcome: "failed", reason };
    }
    try {
      const outcome = await this.#effects.invoke(this.#effects.actions.gitPromote, input, intent);
      this.#appendCommitted({
        basis: "invoke_result",
        promotionId: entry.promotion_id,
        attemptId: entry.attempt_id,
        sourceCommit: entry.source_commit,
        expectedHeadCommit: entry.expected_head_commit,
        resultingHeadCommit: outcome.resultingHeadCommit,
        reason: "recovered: operation record absent, redispatched",
      });
      return {
        promotionId: entry.promotion_id,
        outcome: "committed",
        resultingHeadCommit: outcome.resultingHeadCommit,
        via: "redispatch",
      };
    } catch (error) {
      if (!isTransientOperationError(error)) {
        const reason = (error as Error).message;
        this.#appendFailed({
          basis: "deterministic_failure",
          promotionId: entry.promotion_id,
          attemptId: entry.attempt_id,
          sourceCommit: entry.source_commit,
          expectedHeadCommit: entry.expected_head_commit,
          reason,
        });
        return { promotionId: entry.promotion_id, outcome: "failed", reason };
      }
      // Transient during redispatch: either another owner holds the operation
      // (in-flight) or the operation stayed uncertain (blocked). The ledger
      // state tells them apart - reporting in-flight for an uncertain record
      // would promise progress that is not happening.
      const state =
        (
          await this.#effects.runtime.ledger.get(
            operationIdentityPreview(this.#effects.actions.gitPromote, input, {
              source: "palimpsest",
              scope: intent.scope,
              callId: intent.callId,
            }).operationId,
          )
        )?.state ?? "unknown";
      if (state === "uncertain") {
        return {
          promotionId: entry.promotion_id,
          outcome: "blocked",
          reason: "promotion stays uncertain after redispatch",
        };
      }
      return { promotionId: entry.promotion_id, outcome: "in-flight", ordariumState: state };
    }
  }

  #terminal(promotionId: string): SchedulerEvent | undefined {
    const existing = this.#store.connection
      .prepare(
        "SELECT event_id FROM events WHERE project_id=? AND event_type IN ('PROMOTION_COMMITTED','PROMOTION_FAILED') AND entity_id=?",
      )
      .get(this.projectId, promotionId) as { event_id: number } | undefined;
    if (existing === undefined) return undefined;
    const event = this.#store.getEvent(existing.event_id);
    if (event === undefined) {
      throw new DomainValidationError("terminal promotion Event is missing");
    }
    return event;
  }

  /**
   * Append the admitted intent. The permit is minted HERE, after the caller has
   * already passed Z's eligibility assessment, and consumed by live admission -
   * so a structurally perfect PREPARED appended through the generic surface is
   * refused, and no other module can manufacture a revision fence.
   */
  #appendPrepared(promotionId: string, options: PromoteOptions): SchedulerEvent {
    const revision = this.projectRevision();
    const permit = PromotionIntentPermit.issue({
      projectId: this.projectId,
      promotionId,
      attemptId: options.attemptId,
      sourceCommit: options.sourceCommit,
      expectedHeadCommit: options.expectedHeadCommit,
      basis: "eligibility_passed",
    });
    return this.#store.appendPromotionIntent(
      parseNewEvent({
        schema_version: 1,
        project_id: this.projectId,
        event_type: "PROMOTION_PREPARED",
        payload_version: 1,
        entity_type: "promotion",
        entity_id: promotionId,
        payload: {
          promotion_id: promotionId,
          attempt_id: options.attemptId,
          source_commit: options.sourceCommit,
          expected_head_commit: options.expectedHeadCommit,
          resulting_head_commit: null,
          reason: "promotion intent recorded before git.promote",
        },
        causation_id: null,
        correlation_id: `promotion:${promotionId}`,
        idempotency_key: actionKey("promotion-prepare-v1", {
          project_id: this.projectId,
          promotion_id: promotionId,
        }),
        expected_project_revision: revision,
      }),
      permit,
    );
  }

  /**
   * Record a terminal SUCCESS from its real outcome basis. The witness records
   * where the resulting head came from (a live invocation, a ledger receipt, or
   * a reconciled operation) and binds it to the operation, the input, and the
   * head itself - so a witness for H1 cannot authorize a COMMITTED claiming H2.
   */
  #appendCommitted(arg: {
    promotionId: string;
    attemptId: string;
    sourceCommit: string;
    expectedHeadCommit: string;
    resultingHeadCommit: string;
    reason: string;
    basis: PromotionOutcomeBasis;
    outcomeDigest?: string | undefined;
  }): SchedulerEvent {
    return this.#appendTerminal("PROMOTION_COMMITTED", arg);
  }

  #appendFailed(arg: {
    promotionId: string;
    attemptId: string;
    sourceCommit: string;
    expectedHeadCommit: string;
    reason: string;
    basis: PromotionOutcomeBasis;
    outcomeDigest?: string | undefined;
  }): SchedulerEvent {
    return this.#appendTerminal("PROMOTION_FAILED", arg);
  }

  #appendTerminal(
    eventType: "PROMOTION_COMMITTED" | "PROMOTION_FAILED",
    arg: {
      promotionId: string;
      attemptId: string;
      sourceCommit: string;
      expectedHeadCommit: string;
      reason: string;
      basis: PromotionOutcomeBasis;
      resultingHeadCommit?: string | undefined;
      outcomeDigest?: string | undefined;
    },
  ): SchedulerEvent {
    const resultingHeadCommit = arg.resultingHeadCommit ?? null;
    const { operationId, inputDigest } = this.#operationRefOf({
      promotionId: arg.promotionId,
      sourceCommit: arg.sourceCommit,
      expectedHeadCommit: arg.expectedHeadCommit,
    });
    const witness = PromotionOutcomeWitness.issue({
      projectId: this.projectId,
      promotionId: arg.promotionId,
      attemptId: arg.attemptId,
      operationId,
      inputDigest,
      outcomeKind: eventType === "PROMOTION_COMMITTED" ? "COMMITTED" : "FAILED",
      basis: arg.basis,
      sourceCommit: arg.sourceCommit,
      expectedHeadCommit: arg.expectedHeadCommit,
      resultingHeadCommit,
      outcomeDigest: arg.outcomeDigest ?? null,
      preparedEventRef: this.#preparedEventRefOf(arg.promotionId),
    } satisfies PromotionOutcomeWitnessInput & { outcomeKind: "COMMITTED" | "FAILED" });
    const committed = eventType === "PROMOTION_COMMITTED";
    return this.#store.appendPromotionTerminal(
      parseNewEvent({
        schema_version: 1,
        project_id: this.projectId,
        event_type: eventType,
        payload_version: 1,
        entity_type: "promotion",
        entity_id: arg.promotionId,
        payload: {
          promotion_id: arg.promotionId,
          attempt_id: arg.attemptId,
          source_commit: arg.sourceCommit,
          expected_head_commit: arg.expectedHeadCommit,
          resulting_head_commit: resultingHeadCommit,
          reason: arg.reason,
          // G10-AA durable provenance (optional, non-secret): correlates the
          // canonical Event to its Ordarium operation without asking Ordarium.
          operation_id: operationId,
          outcome_basis: arg.basis,
          outcome_digest: committed ? (arg.outcomeDigest ?? inputDigest) : inputDigest,
        },
        causation_id: null,
        correlation_id: `promotion:${arg.promotionId}`,
        idempotency_key: actionKey(
          committed ? "promotion-committed-v1" : "promotion-failed-v1",
          { project_id: this.projectId, promotion_id: arg.promotionId },
        ),
        expected_project_revision: this.projectRevision(),
      }),
      witness,
    );
  }

}
