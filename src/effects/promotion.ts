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
  type Action,
  type JsonValue,
} from "@ordarium/core";

import { actionKey, stableEntityId } from "../domain/index.js";
import { parseNewEvent, type SchedulerEvent } from "../schema/index.js";
import type { EventStore } from "../state/index.js";
import { DomainValidationError } from "../domain/errors.js";
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

  constructor(store: EventStore, effects: PalimpsestEffectsRuntime, projectId: string) {
    this.#store = store;
    this.#effects = effects;
    this.projectId = projectId;
  }

  projectRevision(): number {
    const row = this.#store.connection
      .prepare("SELECT revision FROM projects WHERE project_id=?")
      .get(this.projectId) as { revision: number } | undefined;
    if (row === undefined) {
      throw new DomainValidationError("project does not exist");
    }
    return row.revision;
  }

  async promote(options: PromoteOptions): Promise<PromoteResult> {
    const promotionId = promotionIdFor(this.projectId, options.attemptId);
    const existing = this.#terminal(promotionId);
    if (existing !== undefined) {
      if (existing.event_type !== "PROMOTION_COMMITTED") {
        throw new DomainValidationError(`promotion ${promotionId} already failed`);
      }
      const payload = existing.payload;
      return {
        promotionId,
        committed: existing,
        resultingHeadCommit: String(payload.resulting_head_commit),
      };
    }

    this.#appendPrepared(promotionId, options);
    const revision = this.projectRevision();

    try {
      const outcome = await this.#effects.invoke(
        this.#effects.actions.gitPromote,
        {
          promotionId,
          sourceCommit: options.sourceCommit,
          expectedHeadCommit: options.expectedHeadCommit,
        },
        { scope: this.projectId, callId: `promote:${promotionId}`, revision: revision },
      );
      return {
        promotionId,
        committed: this.#appendCommitted({
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
      if (!isTransientOperationError(error)) {
        this.#appendFailed({
          promotionId,
          attemptId: options.attemptId,
          sourceCommit: options.sourceCommit,
          expectedHeadCommit: options.expectedHeadCommit,
          reason: (error as Error).message,
        });
      }
      throw error;
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
    try {
      const outcome = await this.#effects.invoke(this.#effects.actions.gitPromote, input, intent);
      this.#appendCommitted({
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

  #appendPrepared(
    promotionId: string,
    options: PromoteOptions,
  ): SchedulerEvent {
    const revision = this.projectRevision();
    return this.#store.append(
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
    );
  }

  #appendCommitted(arg: {
    promotionId: string;
    attemptId: string;
    sourceCommit: string;
    expectedHeadCommit: string;
    resultingHeadCommit: string;
    reason: string;
  }): SchedulerEvent {
    return this.#store.append(
      parseNewEvent({
        schema_version: 1,
        project_id: this.projectId,
        event_type: "PROMOTION_COMMITTED",
        payload_version: 1,
        entity_type: "promotion",
        entity_id: arg.promotionId,
        payload: {
          promotion_id: arg.promotionId,
          attempt_id: arg.attemptId,
          source_commit: arg.sourceCommit,
          expected_head_commit: arg.expectedHeadCommit,
          resulting_head_commit: arg.resultingHeadCommit,
          reason: arg.reason,
        },
        causation_id: null,
        correlation_id: `promotion:${arg.promotionId}`,
        idempotency_key: actionKey("promotion-committed-v1", {
          project_id: this.projectId,
          promotion_id: arg.promotionId,
        }),
        expected_project_revision: this.projectRevision(),
      }),
    );
  }

  #appendFailed(arg: {
    promotionId: string;
    attemptId: string;
    sourceCommit: string;
    expectedHeadCommit: string;
    reason: string;
  }): SchedulerEvent {
    const revision = this.projectRevision();
    return this.#store.append(
      parseNewEvent({
        schema_version: 1,
        project_id: this.projectId,
        event_type: "PROMOTION_FAILED",
        payload_version: 1,
        entity_type: "promotion",
        entity_id: arg.promotionId,
        payload: {
          promotion_id: arg.promotionId,
          attempt_id: arg.attemptId,
          source_commit: arg.sourceCommit,
          expected_head_commit: arg.expectedHeadCommit,
          resulting_head_commit: null,
          reason: arg.reason,
        },
        causation_id: null,
        correlation_id: `promotion:${arg.promotionId}`,
        idempotency_key: actionKey("promotion-failed-v1", {
          project_id: this.projectId,
          promotion_id: arg.promotionId,
        }),
        expected_project_revision: revision,
      }),
    );
  }
}
