/**
 * Canonical project-head evolution (G10-X).
 *
 * The ProjectIR carries ONE canonical head commit (`head_commit`), and the
 * promotion ledger carries the effect facts (`PROMOTION_COMMITTED`) that
 * actually moved the git branch. Historically the two never met: the promotion
 * recorded a `resulting_head_commit` while `projects.head_commit` stayed at the
 * genesis commit, and callers passed an ambient `git.head()` as the "expected"
 * head - so the authorization basis on the log and the live branch could
 * diverge silently.
 *
 * This module is the PURE kernel that makes the evolution canonical:
 *
 *   - `deriveProjectHeadStatus` reconstructs the CONTIGUOUS promotion chain
 *     starting at the project head and reports whether the project head is in
 *     sync with the proven effect head. It never "takes the last resulting
 *     head": a promotion whose `expectedHeadCommit` does not match the running
 *     chain head is a CONFLICT, never skipped.
 *   - `compileProjectHeadReconciliation` turns that status into a proposal
 *     (with explicit blockers) to advance the ProjectIR head onto the proven
 *     effect head. It performs ZERO writes.
 *   - `ProjectHeadError` is the single typed fail-closed surface for every
 *     caller that would otherwise fabricate a head.
 *
 * Invariants:
 *   - PURE: no I/O, no clock, no database handle. The only dependency is the
 *     already-materialized ProjectIR plus the canonical promotion facts.
 *   - There is NO second ProjectIR, NO git-head database and NO second
 *     promotion ledger: the status is derived from ProjectIR + canonical
 *     promotion events only. `git.head()` is a diagnostic, never an input.
 *   - The head advance lands only when the world is quiescent (no ACTIVE or
 *     VERIFYING task, no open attempt): a promoted task must reach SATISFIED
 *     before its effect head can become the authorization basis of the next
 *     revision.
 */

import type { ProjectIr } from "../schema/index.js";

/** Whether the ProjectIR head agrees with the proven effect head. */
export type ProjectHeadState = "IN_SYNC" | "SYNC_REQUIRED" | "CONFLICT";

export interface ProjectHeadStatus {
  readonly schemaVersion: 1;
  readonly projectRevision: number;
  readonly projectHeadCommit: string;
  /** The last chained `resultingHeadCommit` (the project head when no promotion). */
  readonly provenEffectHeadCommit: string;
  /** The event ref of the last CHAINED promotion (null when none is chained). */
  readonly latestPromotionEventRef: string | null;
  readonly state: ProjectHeadState;
}

/**
 * One committed promotion fact, in event order. Only `PROMOTION_COMMITTED`
 * events become facts: a PREPARED intent or a FAILED verdict never advances
 * the head.
 */
export interface PromotionFact {
  readonly eventId: string;
  readonly promotionId: string;
  readonly attemptId: string;
  readonly sourceCommit: string;
  readonly expectedHeadCommit: string;
  readonly resultingHeadCommit: string;
}

export type ProjectHeadBlockerKind =
  | "head_not_proven"
  | "head_conflict"
  | "quiescence_required"
  | "no_drift";

export interface ProjectHeadBlocker {
  readonly kind: ProjectHeadBlockerKind;
  readonly detail: string;
  readonly refs: readonly string[];
}

/**
 * The pure proposal to advance the ProjectIR head onto the proven effect head.
 * `compilable` is true only when no blocker applies - a caller that commits on
 * a `true` candidate knows every precondition was mechanically proven.
 */
export interface ProjectHeadReconciliationCandidate {
  readonly schemaVersion: 1;
  readonly projectBasis: {
    readonly revision: number;
    readonly digest: string;
    readonly headCommit: string;
  };
  readonly latestPromotionEventId: string | null;
  readonly fromHead: string;
  readonly toHead: string;
  readonly promotionChainBasis: readonly {
    readonly promotionId: string;
    readonly eventId: string;
    readonly from: string;
    readonly to: string;
  }[];
  readonly currentWorkState: {
    readonly activeTaskIds: readonly string[];
    readonly verifyingTaskIds: readonly string[];
    readonly openAttemptIds: readonly string[];
    readonly runnableTaskIds: readonly string[];
  };
  readonly blockers: readonly ProjectHeadBlocker[];
  readonly compilable: boolean;
}

/** Every typed, fail-closed head/authority error kind. */
export type ProjectHeadErrorKind =
  | "head_not_proven"
  | "head_conflict"
  | "quiescence_required"
  | "no_drift"
  | "external_head_divergence"
  | "stale_head_reconciliation"
  | "caller_head_not_canonical"
  | "caller_source_not_canonical";

/** The single typed, fail-closed head/authority error surface. */
export class ProjectHeadError extends Error {
  readonly kind: ProjectHeadErrorKind;
  readonly refs: readonly string[] | undefined;

  constructor(kind: ProjectHeadErrorKind, message: string, refs?: readonly string[]) {
    super(message);
    this.name = "ProjectHeadError";
    this.kind = kind;
    this.refs = refs;
  }
}

const ACTIVE_TASK_STATES: ReadonlySet<string> = new Set(["ACTIVE", "VERIFYING"]);
const VERIFYING_TASK_STATES: ReadonlySet<string> = new Set(["VERIFYING"]);
const OPEN_ATTEMPT_STATES: ReadonlySet<string> = new Set(["CREATED", "LEASED", "RUNNING"]);
const RUNNABLE_TASK_STATES: ReadonlySet<string> = new Set(["READY", "BLOCKED"]);

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Scan the canonical facts for the chain APPLICABLE to `headCommit`.
 *
 * "Applicable" is precise: the chain starts at the first promotion whose
 * `expectedHeadCommit` equals the current project head, then runs forward
 * contiguously. Leading promotions are history - once a reconciliation has
 * absorbed them, the project head EQUALS their resulting head and no later
 * fact is anchored on it, so they are simply not part of the moving chain and
 * must not be misread as a conflict. A mismatch AFTER the chain has started is
 * always a conflict (we never skip it), and a fact that is neither anchored on
 * the head nor an absorbed tip proves nothing.
 */
function scanChain(
  headCommit: string,
  promotions: readonly PromotionFact[],
): {
  chained: PromotionFact[];
  conflict: boolean;
  absorbed: PromotionFact | undefined;
} {
  const start = promotions.findIndex((fact) => fact.expectedHeadCommit === headCommit);
  if (start < 0) {
    let absorbed: PromotionFact | undefined;
    for (const fact of promotions) {
      if (fact.resultingHeadCommit === headCommit) absorbed = fact;
    }
    const tip = promotions.at(-1);
    // The head is absorbed history iff the LAST fact produced it (there is no
    // later fact trying and failing to chain onto the head).
    const conflict = promotions.length > 0 && !(absorbed !== undefined && absorbed === tip);
    return { chained: [], conflict, absorbed };
  }
  const chained: PromotionFact[] = [];
  let chainHead = headCommit;
  let conflict = false;
  for (let index = start; index < promotions.length; index += 1) {
    const fact = promotions[index] as PromotionFact;
    if (fact.expectedHeadCommit !== chainHead) {
      conflict = true;
      break;
    }
    chained.push(fact);
    chainHead = fact.resultingHeadCommit;
  }
  return { chained, conflict, absorbed: undefined };
}

/**
 * Build the CONTIGUOUS promotion chain applicable to `project.headCommit` and
 * report the proven effect head.
 *
 * The chain rule is strict:
 *   - the first applicable promotion must have `expectedHeadCommit ===` the
 *     project head;
 *   - every next promotion must have `expectedHeadCommit ===` the previous
 *     `resultingHeadCommit`;
 *   - a promotion whose expected head does not match the running chain head is
 *     a CONFLICT: the scan stops there and the later facts are NEVER adopted
 *     ("take the last resulting head" is exactly the bug this replaces).
 */
export function deriveProjectHeadStatus(input: {
  project: { revision: number; headCommit: string };
  promotions: readonly PromotionFact[];
}): ProjectHeadStatus {
  const head = input.project.headCommit;
  const { chained, conflict, absorbed } = scanChain(head, input.promotions);

  let proven = head;
  let latestRef: string | null = null;
  for (const fact of chained) {
    proven = fact.resultingHeadCommit;
    latestRef = fact.eventId;
  }

  let state: ProjectHeadState;
  if (conflict) {
    state = "CONFLICT";
  } else if (chained.length > 0) {
    state = proven === head ? "IN_SYNC" : "SYNC_REQUIRED";
  } else {
    state = "IN_SYNC";
    if (latestRef === null && absorbed !== undefined) latestRef = absorbed.eventId;
  }

  return Object.freeze({
    schemaVersion: 1 as const,
    projectRevision: input.project.revision,
    projectHeadCommit: head,
    provenEffectHeadCommit: proven,
    latestPromotionEventRef: latestRef,
    state,
  });
}

/** The contiguous chain basis applicable to `projectHeadCommit`. */
export function promotionChainBasis(
  projectHeadCommit: string,
  promotions: readonly PromotionFact[],
): Array<{ promotionId: string; eventId: string; from: string; to: string }> {
  return scanChain(projectHeadCommit, promotions).chained.map((fact) => ({
    promotionId: fact.promotionId,
    eventId: fact.eventId,
    from: fact.expectedHeadCommit,
    to: fact.resultingHeadCommit,
  }));
}

/**
 * Compile the pure reconciliation candidate for one project.
 *
 * Blockers, in the order they are checked:
 *   - `no_drift`: the state is IN_SYNC - nothing to advance.
 *   - `head_conflict`: the promotion chain is broken; the project head cannot
 *     be trusted and no automatic advance is offered.
 *   - `head_not_proven` (SYNC_REQUIRED only): there is no committed promotion
 *     fact backing `toHead`.
 *   - `quiescence_required` (SYNC_REQUIRED only): an ACTIVE/VERIFYING task or
 *     an open attempt exists - the promoted task must reach SATISFIED first.
 *
 * `compilable` is true iff there are no blockers. The function writes nothing.
 */
export function compileProjectHeadReconciliation(input: {
  project: ProjectIr;
  status: ProjectHeadStatus;
  tasks: readonly { taskId: string; state: string }[];
  openAttempts: readonly { attemptId: string; taskId: string; state: string }[];
  /**
   * The canonical committed facts backing the status. When supplied, the
   * candidate's `promotionChainBasis` is the provable chain and
   * `head_not_proven` also verifies that the backing event really produced
   * `toHead`. When absent the basis is empty (the status alone cannot name the
   * promotion id of the backing event).
   */
  promotions?: readonly PromotionFact[];
}): ProjectHeadReconciliationCandidate {
  const activeTaskIds = sortedUnique(
    input.tasks.filter((row) => ACTIVE_TASK_STATES.has(row.state)).map((row) => row.taskId),
  );
  const verifyingTaskIds = sortedUnique(
    input.tasks.filter((row) => VERIFYING_TASK_STATES.has(row.state)).map((row) => row.taskId),
  );
  const openAttemptIds = sortedUnique(
    input.openAttempts
      .filter((attempt) => OPEN_ATTEMPT_STATES.has(attempt.state))
      .map((attempt) => attempt.attemptId),
  );
  const runnableTaskIds = sortedUnique(
    input.tasks.filter((row) => RUNNABLE_TASK_STATES.has(row.state)).map((row) => row.taskId),
  );

  const fromHead = input.project.head_commit;
  const toHead = input.status.provenEffectHeadCommit;
  const basis =
    input.promotions === undefined
      ? []
      : promotionChainBasis(fromHead, input.promotions);

  const blockers: ProjectHeadBlocker[] = [];
  if (input.status.state === "IN_SYNC") {
    blockers.push(
      Object.freeze({
        kind: "no_drift" as const,
        detail:
          "the project head already equals the proven effect head; no reconciliation is needed",
        refs: Object.freeze([fromHead]),
      }),
    );
  } else if (input.status.state === "CONFLICT") {
    blockers.push(
      Object.freeze({
        kind: "head_conflict" as const,
        detail:
          "the promotion chain is broken: a PROMOTION_COMMITTED expected a different head than the running chain head; the project head cannot be advanced automatically",
        refs: Object.freeze([fromHead, toHead, input.status.latestPromotionEventRef ?? ""].filter((ref) => ref !== "")),
      }),
    );
  } else {
    // SYNC_REQUIRED: prove the backing fact, then require quiescence.
    const backingProven =
      input.status.latestPromotionEventRef !== null &&
      (input.promotions === undefined ||
        input.promotions.some(
          (fact) =>
            fact.eventId === input.status.latestPromotionEventRef &&
            fact.resultingHeadCommit === toHead,
        ));
    if (!backingProven) {
      blockers.push(
        Object.freeze({
          kind: "head_not_proven" as const,
          detail:
            "the project head is behind the proven effect head but no committed promotion fact backs the target head",
          refs: Object.freeze([fromHead, toHead]),
        }),
      );
    }
    const inFlight = sortedUnique([...activeTaskIds, ...openAttemptIds]);
    if (inFlight.length > 0) {
      blockers.push(
        Object.freeze({
          kind: "quiescence_required" as const,
          detail:
            "the project must be quiescent before the head advances: every ACTIVE/VERIFYING task and open attempt must settle (a promoted task must reach SATISFIED first)",
          refs: Object.freeze(inFlight),
        }),
      );
    }
  }

  return Object.freeze({
    schemaVersion: 1 as const,
    projectBasis: Object.freeze({
      revision: input.project.revision,
      digest: input.project.digest,
      headCommit: fromHead,
    }),
    latestPromotionEventId: input.status.latestPromotionEventRef,
    fromHead,
    toHead,
    promotionChainBasis: Object.freeze(basis.map((entry) => Object.freeze(entry))),
    currentWorkState: Object.freeze({
      activeTaskIds: Object.freeze(activeTaskIds),
      verifyingTaskIds: Object.freeze(verifyingTaskIds),
      openAttemptIds: Object.freeze(openAttemptIds),
      runnableTaskIds: Object.freeze(runnableTaskIds),
    }),
    blockers: Object.freeze(blockers),
    compilable: blockers.length === 0,
  });
}
