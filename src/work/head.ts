/**
 * PLMP-LEAN-1 G10-X / SR-2 §十 — the PROJECT HEAD SERVICE: the ONE owner of head reconciliation.
 *
 *     READY@E0  →  G10-X  →  READY@E1
 *
 * The head machinery already had a pure kernel (`deriveProjectHeadStatus`,
 * `compileProjectHeadReconciliation`, `promotionChainBasis` in `src/domain/project_head.ts`) and a
 * fact source (`PromotionManager`'s committed-promotion scan). What it did NOT have was an OWNER:
 * the orchestration — compile a candidate, re-validate it for freshness, refuse an unproven or
 * conflicted advance, and only then ask for the revision — lived inside `ProjectController`,
 * interleaved with the controller's other concerns.
 *
 * This module is that owner. It is deliberately NOT a second head authority:
 *
 *   · it derives the status from the SAME pure kernel, over the SAME committed facts;
 *   · it never writes a head itself — it asks the Work owner's plan-revision entry point to commit
 *     the revision, passing the SAME trusted `headAdvance` shape the controller already validated;
 *   · it refuses exactly what the controller refused, with the same typed errors.
 *
 *     a structurally available transition  ≠  an authorized one
 *
 * ## THE TWO FRESHNESS CHECKS ARE THE POINT
 *
 * `reconcile` compiles a candidate and then RE-READS both the ProjectIR basis and the backing
 * promotion fact before committing. A candidate that was valid when compiled does not authorize a
 * revision later — the same discipline the promotion plane follows, and the reason a stale
 * candidate fails closed with ZERO writes rather than re-anchoring the head to a world that moved.
 *
 * Layer: L2 (`src/work/`). Consumed by the controller's façade, by the continuation composition's
 * canonical port, and by anything else that needs a head answer.
 */
import {
  compileProjectHeadReconciliation,
  ProjectHeadError,
  type ProjectHeadReconciliationCandidate,
  type ProjectHeadStatus,
  type PromotionFact,
} from "../domain/project_head.js";
import { createHash } from "node:crypto";
import { parseNewEvent, type NewEvent, type ProjectIr } from "../schema/index.js";
import { DomainValidationError } from "../domain/errors.js";
import { actionKey } from "../domain/idempotency.js";
import type { OperatorAuthorityPort } from "../domain/operator_authority.js";
import type { CanonicalBasisFacts } from "./unseen_inputs.js";

/** The outcome of one mechanical head reconciliation (the shape the controller's façade returned). */
export interface HeadReconciliationResult {
  readonly status: "reconciled" | "in_sync" | "blocked";
  readonly revision?: number;
  readonly fromHead: string;
  readonly toHead: string;
  readonly blockers: readonly string[];
}

/** The canonical authority picture a governed rework mint is made under. */
export interface HeadTargetFence {
  readonly projectRevision: number;
  readonly projectDigest: string;
  readonly projectHeadCommit: string;
  readonly provenEffectHeadCommit: string;
  readonly latestPromotionEventRef: string | null;
}

/**
 * What the service needs from the rest of the system. Narrow on purpose: the head owner knows the
 * head, the task states and the committed promotion facts — and nothing about promotion
 * eligibility, verification or the execution plane.
 */
export interface ProjectHeadServiceDeps {
  readonly projectId: string;
  /** The canonical ProjectIR as the Work owner reads it. */
  project(): ProjectIr;
  /** Task states, for the quiescence precondition. */
  taskStates(): readonly { readonly taskId: string; readonly state: string }[];
  /** Attempts still holding a lane, for the quiescence precondition. */
  openAttempts(): readonly { readonly attemptId: string; readonly taskId: string; readonly state: string }[];
  /** The committed PROMOTION_COMMITTED facts, in event order. */
  promotionFacts(): readonly PromotionFact[];
  /** The backing event of a promotion, for the "does this fact really back this advance?" check. */
  promotionEvent(eventId: number): { readonly eventType: string; readonly resultingHeadCommit: string; readonly expectedHeadCommit: string } | null;
  /** The proven effect head of the contiguous chain. Throws `head_conflict` on a broken chain. */
  canonicalExpectedHead(): string;
  /**
   * Commit one head-only revision. The SAME trusted entry the controller used; the service passes
   * an already-validated `headAdvance` and never invents one.
   */
  commitHeadAdvance(input: {
    readonly fromHead: string;
    readonly toHead: string;
    readonly fromPromotionEventId: string;
    readonly reason: string;
  }): { readonly revision: number };
}

export interface ProjectHeadService {
  /** The derived head status: ProjectIR head vs the proven effect head. Never git.head(). */
  status(): ProjectHeadStatus;
  /** The proven effect head of the contiguous chain (throws on a broken chain). */
  canonicalExpectedHead(): string;
  /** The pure reconciliation proposal. ZERO writes. */
  candidate(): ProjectHeadReconciliationCandidate;
  /** The canonical authority picture a rework mint is made under. */
  targetFence(): HeadTargetFence;
  /** Reconcile the head, or report why it cannot be reconciled. */
  reconcile(input?: { readonly candidate?: ProjectHeadReconciliationCandidate }): Promise<HeadReconciliationResult>;
  /**
   * Validate a TRUSTED head advance. Returns the head to advance to, or throws.
   *
   * Kept here rather than in the revision path because it is the head owner's judgement: the
   * caller supplies a `toHead`, and this is the one place that may decide whether the head
   * actually backs it.
   */
  validateHeadAdvance(input: {
    readonly current: ProjectIr;
    readonly toHead: string;
    readonly fromPromotionEventId: string;
  }): string;
}

export function makeProjectHeadService(deps: ProjectHeadServiceDeps): ProjectHeadService {
  /** The derived status, over the SAME pure kernel and the SAME committed facts. */
  const status = (): ProjectHeadStatus => {
    const project = deps.project();
    return deriveStatus(project, deps.promotionFacts());
  };

  const candidate = (): ProjectHeadReconciliationCandidate =>
    compileProjectHeadReconciliation({
      project: deps.project(),
      status: status(),
      tasks: deps.taskStates(),
      openAttempts: deps.openAttempts(),
      promotions: deps.promotionFacts(),
    });

  return Object.freeze({
    status,
    canonicalExpectedHead: () => deps.canonicalExpectedHead(),
    candidate,
    targetFence(): HeadTargetFence {
      const project = deps.project();
      const head = status();
      return Object.freeze({
        projectRevision: project.revision,
        projectDigest: project.digest,
        projectHeadCommit: project.head_commit,
        provenEffectHeadCommit: head.provenEffectHeadCommit,
        latestPromotionEventRef: head.latestPromotionEventRef,
      });
    },

    async reconcile(input: { readonly candidate?: ProjectHeadReconciliationCandidate } = {}): Promise<HeadReconciliationResult> {
      const project = deps.project();
      const fromHead = project.head_commit;
      const current = status();
      if (current.state === "IN_SYNC") {
        return { status: "in_sync", fromHead, toHead: fromHead, blockers: [] };
      }
      /**
       * The candidate is ALWAYS re-validated below (freshness) and again inside the revision path
       * (canonical proof), so a SUPPLIED candidate is never a caller-settable head: a stale or
       * forged one fails closed with zero writes.
       */
      const compiled = input.candidate ?? candidate();
      if (!compiled.compilable) {
        return {
          status: "blocked",
          fromHead: compiled.fromHead,
          toHead: compiled.toHead,
          blockers: compiled.blockers.map((blocker) => `${blocker.kind}: ${blocker.detail}`),
        };
      }
      const promotionEventId = compiled.latestPromotionEventId;
      if (promotionEventId === null) {
        throw new ProjectHeadError(
          "head_not_proven",
          "the head drift has no backing promotion fact; refusing an unproven advance",
          [fromHead, compiled.toHead],
        );
      }
      // FRESHNESS, zero writes on failure: the basis and the backing fact must still be exactly
      // what the candidate was compiled from.
      const freshProject = deps.project();
      const freshStatus = status();
      const freshBacking = compiled.promotionChainBasis.at(-1)?.eventId;
      if (
        freshProject.revision !== project.revision ||
        freshProject.digest !== project.digest ||
        freshProject.head_commit !== fromHead ||
        freshStatus.state !== "SYNC_REQUIRED" ||
        freshStatus.provenEffectHeadCommit !== compiled.toHead ||
        freshStatus.latestPromotionEventRef !== promotionEventId ||
        (freshBacking !== undefined && freshBacking !== promotionEventId)
      ) {
        throw new ProjectHeadError(
          "stale_head_reconciliation",
          "the ProjectIR basis or the backing promotion fact changed before the reconciliation committed; no events were written",
          [String(project.revision), String(freshProject.revision), fromHead, freshProject.head_commit],
        );
      }
      const outcome = deps.commitHeadAdvance({
        fromHead,
        toHead: compiled.toHead,
        fromPromotionEventId: promotionEventId,
        reason: `project head reconciliation ${fromHead} -> ${compiled.toHead}`,
      });
      return { status: "reconciled", revision: outcome.revision, fromHead, toHead: compiled.toHead, blockers: [] };
    },

    validateHeadAdvance(input: { readonly current: ProjectIr; readonly toHead: string; readonly fromPromotionEventId: string }): string {
      const refuse = (message: string, refs: readonly string[]): never => {
        throw new ProjectHeadError("caller_head_not_canonical", message, refs);
      };
      const current = status();
      if (current.state !== "SYNC_REQUIRED") {
        refuse(`head advance refused: the canonical head state is ${current.state}, not SYNC_REQUIRED`, [
          current.projectHeadCommit,
          current.provenEffectHeadCommit,
        ]);
      }
      if (current.projectHeadCommit !== input.current.head_commit) {
        refuse(
          `head advance refused: the project head changed under the revision (${input.current.head_commit} -> ${current.projectHeadCommit})`,
          [input.current.head_commit, current.projectHeadCommit],
        );
      }
      const canonical = deps.canonicalExpectedHead();
      if (input.toHead !== canonical || input.toHead !== current.provenEffectHeadCommit) {
        refuse(`head advance refused: toHead ${input.toHead} is not the canonical proven effect head ${canonical}`, [
          input.toHead,
          canonical,
        ]);
      }
      if (current.latestPromotionEventRef === null || input.fromPromotionEventId !== current.latestPromotionEventRef) {
        refuse(
          `head advance refused: fromPromotionEventId ${input.fromPromotionEventId} is not the canonical chain tip`,
          [input.fromPromotionEventId],
        );
      }
      const eventId = Number(input.fromPromotionEventId);
      const backing = Number.isInteger(eventId) ? deps.promotionEvent(eventId) : null;
      if (
        backing === null ||
        backing.eventType !== "PROMOTION_COMMITTED" ||
        backing.resultingHeadCommit !== input.toHead ||
        backing.expectedHeadCommit !== input.current.head_commit
      ) {
        refuse(
          `head advance refused: promotion event ${input.fromPromotionEventId} does not back ${input.current.head_commit} -> ${input.toHead}`,
          [input.fromPromotionEventId],
        );
      }
      return input.toHead;
    },
  });
}

/**
 * The pure kernel, invoked here rather than re-exported from the domain: the service owns the
 * ANSWER, and `deriveProjectHeadStatus` stays the one derivation.
 */
import { deriveProjectHeadStatus } from "../domain/project_head.js";

function deriveStatus(project: ProjectIr, promotions: readonly PromotionFact[]): ProjectHeadStatus {
  return deriveProjectHeadStatus({
    project: { revision: project.revision, headCommit: project.head_commit },
    promotions,
  });
}

// Direct basis admission belongs to the existing Head owner; event writes remain in Work.
export type BasisOperatorAuthority = OperatorAuthorityPort;

export interface DirectBasisAdmission {
  readonly commit: string;
  readonly operator: string;
  readonly reason: string;
}

export function directBasisTarget(input: {
  readonly observeBasis: () => CanonicalBasisFacts | null;
  readonly currentHead: string;
  readonly commit: string;
  readonly operator: string;
  readonly reason: string;
  readonly promotionState: string;
  readonly operatorAuthority: OperatorAuthorityPort | undefined;
}): string {
  const fail = (code: string, detail: string): never => {
    throw new DomainValidationError(`${code}: ${detail}`);
  };
  requireBasisOperator(input.operatorAuthority, input.operator);
  if (input.operator.trim() === "") fail("DIRECT_BASIS_NO_OPERATOR", "a direct basis admission must name the verified operator");
  if (input.reason.trim() === "") fail("DIRECT_BASIS_NO_REASON", "a direct basis admission must state why the commit is an admissible basis");
  if (!/^[0-9a-f]{40}$/u.test(input.commit)) fail("DIRECT_BASIS_NOT_A_COMMIT", `"${input.commit}" is not a full 40-hex commit`);
  if (input.currentHead === input.commit) fail("DIRECT_BASIS_ALREADY_CURRENT", "the canonical ProjectIR head is already at this commit");
  const facts = input.observeBasis();
  if (facts === null) return fail("DIRECT_BASIS_NO_REPOSITORY", "this deployment has no canonical repository to admit a direct basis from");
  const physicalHead = facts.head;
  if (physicalHead === null) return fail("DIRECT_BASIS_WORKTREE_UNOBSERVABLE", "the canonical repository HEAD could not be observed");
  if (physicalHead !== input.commit) {
    fail(
      "DIRECT_BASIS_NOT_CHECKED_OUT",
      `the repository HEAD is ${physicalHead.slice(0, 12)}, not ${input.commit.slice(0, 12)}; a basis must be the commit the canonical tree actually holds`,
    );
  }
  const dirtyPaths = facts.uncommittedPaths;
  if (dirtyPaths === null) {
    return fail("DIRECT_BASIS_WORKTREE_UNOBSERVABLE", "the canonical worktree could not be observed; an unobserved tree is not a clean one");
  }
  if (dirtyPaths.length > 0) {
    fail(
      "DIRECT_BASIS_WORKTREE_DIRTY",
      `the canonical worktree still has uncommitted changes (${dirtyPaths.join(", ")}); admit a committed basis, not a working state`,
    );
  }
  if (input.promotionState === "SYNC_REQUIRED") {
    fail(
      "DIRECT_BASIS_PROMOTION_HEAD_AHEAD",
      "a proven promotion effect is ahead of the canonical ProjectIR head; reconcile that effect before admitting a direct basis",
    );
  }
  if (input.promotionState !== "IN_SYNC") fail("DIRECT_BASIS_HEAD_CONFLICT", "the promotion history is conflicted or unobservable; a direct basis cannot erase it");
  if (facts.descendant !== true) {
    fail(
      "DIRECT_BASIS_NOT_DESCENDANT",
      `the canonical head ${input.currentHead.slice(0, 12)} is not an ancestor of ${input.commit.slice(0, 12)}, or the commit is unknown; a basis advance must not discard the project's history`,
    );
  }
  if (facts.distance === null || !Number.isSafeInteger(facts.distance) || facts.distance < 1) fail("DIRECT_BASIS_NOT_AHEAD", "the target commit adds no history beyond the canonical head");
  return input.commit;
}

export function directBasisApprovalEvent(input: {
  readonly projectId: string;
  readonly expectedProjectRevision: number;
  readonly revision: number;
  readonly admission: DirectBasisAdmission;
}): NewEvent {
  return parseNewEvent({
    schema_version: 1,
    project_id: input.projectId,
    event_type: "MANUAL_APPROVAL_RECORDED",
    payload_version: 1,
    entity_type: "project",
    entity_id: input.projectId,
    payload: {
      approver: input.admission.operator,
      subject_type: "commit",
      subject_id: input.admission.commit,
      subject_digest: createHash("sha256").update(input.admission.commit).digest("hex"),
      risk_summary: input.admission.reason,
    },
    causation_id: null,
    correlation_id: `basis:${input.admission.commit}`,
    idempotency_key: actionKey("direct-basis-approval-v1", {
      project_id: input.projectId,
      revision: input.revision,
      commit: input.admission.commit,
      operator: input.admission.operator,
    }),
    expected_project_revision: input.expectedProjectRevision,
  });
}

export function validatedHeadAdvance(input: {
  readonly current: ProjectIr;
  readonly advance:
    | {
        readonly source?: "PROMOTION" | "DIRECT_BASIS" | undefined;
        readonly fromPromotionEventId?: string | undefined;
        readonly toHead: string;
        readonly operator?: string | undefined;
        readonly reason?: string | undefined;
      }
    | undefined;
  readonly observeBasis: () => CanonicalBasisFacts | null;
  readonly promotionState: string;
  readonly operatorAuthority: OperatorAuthorityPort | undefined;
  readonly validatePromotion: (input: {
    readonly current: ProjectIr;
    readonly toHead: string;
    readonly fromPromotionEventId: string;
  }) => string;
}): string {
  if (input.advance === undefined) return input.current.head_commit;
  if (input.advance.source === "DIRECT_BASIS") {
    return directBasisTarget({
      observeBasis: input.observeBasis,
      currentHead: input.current.head_commit,
      commit: input.advance.toHead,
      operator: input.advance.operator ?? "",
      reason: input.advance.reason ?? "",
      promotionState: input.promotionState,
      operatorAuthority: input.operatorAuthority,
    });
  }
  if (input.advance.fromPromotionEventId === undefined) {
    throw new DomainValidationError("HEAD_ADVANCE_UNPROVEN: a head advance must name either a promotion effect or a direct basis admission");
  }
  return input.validatePromotion({
    current: input.current,
    toHead: input.advance.toHead,
    fromPromotionEventId: input.advance.fromPromotionEventId,
  });
}

/** Append the manual approval that names the exact admitted commit and reason. */
export function appendDirectBasisApproval(
  requests: NewEvent[],
  input: {
    readonly projectId: string;
    readonly expectedProjectRevision: number;
    readonly revision: number;
    readonly commit: string;
    readonly operator: string;
    readonly reason: string;
  },
): void {
  requests.push(
    directBasisApprovalEvent({
      projectId: input.projectId,
      expectedProjectRevision: input.expectedProjectRevision,
      revision: input.revision,
      admission: { commit: input.commit, operator: input.operator, reason: input.reason },
    }),
  );
}

function requireBasisOperator(authority: OperatorAuthorityPort | undefined, actor: string): void {
  const decision = authority?.authorize(actor);
  if (decision?.authorized !== true || decision.role !== "operator") {
    throw new DomainValidationError("DIRECT_BASIS_OPERATOR_REQUIRED: the deployment authority did not authorize this operator");
  }
}

/** Re-read external Git and operator currentness inside the existing event transaction, just before
 * commit. This narrows the race; it cannot lock an uncooperative native writer after the last read.
 * Such later drift is still refused by the normal execution HEAD_BASIS_MISMATCH fence.
 */
export function directBasisCommitFence(input: {
  readonly observeBasis: () => CanonicalBasisFacts | null;
  readonly commit: string;
  readonly operator: string;
  readonly authority: OperatorAuthorityPort | undefined;
  readonly headState: string;
}): void {
  requireBasisOperator(input.authority, input.operator);
  if (input.headState !== "IN_SYNC") throw new DomainValidationError("DIRECT_BASIS_HEAD_CONFLICT");
  const facts = input.observeBasis();
  if (facts?.head !== input.commit || facts.uncommittedPaths === null || facts.uncommittedPaths.length !== 0) {
    throw new DomainValidationError("DIRECT_BASIS_STALE: the checked-out basis changed before revision commit");
  }
}
