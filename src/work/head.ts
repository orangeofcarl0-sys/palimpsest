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
import type { ProjectIr } from "../schema/index.js";

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
