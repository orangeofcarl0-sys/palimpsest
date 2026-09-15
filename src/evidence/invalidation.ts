/**
 * Typed invalidation — semantic compatibility calculus (Research line R2,
 * raw-notes 预算.txt §23–32).
 *
 * The frozen baseline is conservatively strict: any revision change marks
 * related work stale. R2 refines this with change classes and dependency
 * edge sensitivity so invalidation is precise instead of wholesale:
 *
 *   - metadata_only / backward_compatible changes do not invalidate
 *     downstream dependents;
 *   - behavior_change / contract_breaking changes propagate along edges
 *     whose sensitivity intersects the change class;
 *   - late results are classified (current / compatible / informative /
 *     unsafe) instead of the blanket "stale".
 *
 * This module is pure: it computes invalidations and classification from
 * data; the controller turns the results into TASK_STALE / EVIDENCE_STALE
 * events.
 */

import { DomainValidationError } from "../domain/errors.js";

export const CHANGE_CLASSES = [
  "metadata_only",
  "backward_compatible",
  "behavior_change",
  "contract_breaking",
] as const;

export type ChangeClass = (typeof CHANGE_CLASSES)[number];

/** The minimum class a delta must carry to invalidate downstream work. */
const INVALIDATING_CLASSES: ReadonlySet<ChangeClass> = new Set([
  "behavior_change",
  "contract_breaking",
]);

export interface RevisionDelta {
  readonly from: number;
  readonly to: number;
  readonly change_class: ChangeClass;
  /** Logical ids whose revision changed (e.g. ARCH_ROUTING@7 -> @8). */
  readonly changed_ids: readonly string[];
}

/** A dependency/correlation edge with class-level sensitivity. */
export interface DependencyEdge {
  readonly from: string;
  readonly to: string;
  /** Which change classes propagate across this edge. */
  readonly sensitive_to: readonly ChangeClass[];
}

/**
 * Typed BFS: the minimal invalidation closure of a delta. The changed
 * logical ids are invalidated themselves (their live work is superseded),
 * and the change travels across every edge whose sensitivity intersects the
 * delta's class. `metadata_only` and `backward_compatible` changes never
 * propagate (edge-insensitive by definition).
 */
export function computeInvalidationSet(
  delta: RevisionDelta,
  edges: readonly DependencyEdge[],
): Set<string> {
  if (delta.from >= delta.to) {
    throw new DomainValidationError(
      `delta must move forward: ${delta.from} -> ${delta.to}`,
    );
  }
  if (delta.changed_ids.length === 0) {
    return new Set();
  }
  if (!INVALIDATING_CLASSES.has(delta.change_class)) {
    return new Set();
  }
  const invalid = new Set<string>(delta.changed_ids);
  const adjacency = new Map<string, DependencyEdge[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.from) ?? [];
    list.push(edge);
    adjacency.set(edge.from, list);
  }
  const queue = [...delta.changed_ids];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const edge of adjacency.get(current) ?? []) {
      if (edge.sensitive_to.includes(delta.change_class)) {
        invalid.add(edge.to);
        queue.push(edge.to);
      }
    }
  }
  return invalid;
}

export type LateResultClass =
  | "current"
  | "compatible"
  | "stale_but_informative"
  | "unsafe_stale";

/**
 * Classify an attempt that returned after its input world may have changed
 * (§29): exact-current stays; compatible may revalidate; behavior_change
 * keeps the result only as informative history; contract_breaking is unsafe
 * and must not be selected.
 */
export function classifyLateResult(
  attemptInputRevision: number,
  currentRevision: number,
  delta: RevisionDelta,
): LateResultClass {
  if (attemptInputRevision === currentRevision) return "current";
  if (attemptInputRevision !== delta.from) {
    // The attempt predates this delta; treat conservatively.
    return delta.change_class === "metadata_only" || delta.change_class === "backward_compatible"
      ? "compatible"
      : "unsafe_stale";
  }
  switch (delta.change_class) {
    case "metadata_only":
    case "backward_compatible":
      return "compatible";
    case "behavior_change":
      return "stale_but_informative";
    case "contract_breaking":
      return "unsafe_stale";
  }
}

/** Does a change of this class require invalidating a subject at all? */
export function changeClassInvalidates(changeClass: ChangeClass): boolean {
  return INVALIDATING_CLASSES.has(changeClass);
}

/* -------------------------------------------------------------------------- *
 * G10-Y: canonical Work-Evidence invalidation
 *
 * Work Evidence carries GATE AUTHORITY: `GateEngine` reads ONLY evidence whose
 * current projection status is `active`, so `status` is not cosmetic metadata -
 * it IS the current authority to satisfy a gate. A revision that retires the
 * work an Evidence item supported must therefore revoke that item's authority in
 * the SAME durable transaction, or a crash can leave a new Work world that is
 * still backed by authority from the superseded one.
 *
 *   EvidenceHistory  ≠  CurrentEvidenceAuthority
 *   EVIDENCE_STALE   ≠  EvidenceWasFalse / DeleteEvidence
 *   TaskStale        ≠  EvidenceStale by accident - only by the declared policy
 * -------------------------------------------------------------------------- */

/** The subject kinds an `EvidenceAtom` may be bound to. */
export type EvidenceSubjectType = "attempt" | "commit" | "task";

/** One ACTIVE Work Evidence item, as read from the evidence projection. */
export interface ActiveWorkEvidence {
  readonly evidenceId: string;
  readonly subjectType: EvidenceSubjectType;
  readonly subjectId: string;
}

/** The typed `(subject_type, subject_id)` pair - matched as an EXACT pair. */
export interface EvidenceSubjectPair {
  readonly subjectType: EvidenceSubjectType;
  readonly subjectId: string;
}

/**
 * The pure, typed plan of which Work Evidence loses authority in one revision.
 * Compiled BEFORE any mutation: the compiler performs no I/O and writes nothing.
 */
export interface EvidenceInvalidationPlan {
  readonly schemaVersion: 1;
  readonly projectId: string;
  /** The world being revoked: the basis the revision moves away from. */
  readonly basis: { readonly revision: number; readonly digest: string };
  /** The revision that supersedes it. */
  readonly targetRevision: number;
  readonly affectedTaskIds: readonly string[];
  readonly affectedAttemptIds: readonly string[];
  /** The exact typed pairs selected for revocation (sorted, deduplicated). */
  readonly subjects: readonly EvidenceSubjectPair[];
  /** The `EVIDENCE_STALE` entities, sorted by evidence id. */
  readonly evidenceIds: readonly string[];
  /** The stable, deterministic reason carried by every generated event. */
  readonly reason: string;
  /** Evidence excluded because its subject kind is outside the declared policy. */
  readonly excludedBySubjectType: readonly EvidenceSubjectPair[];
}

export interface CompileEvidenceInvalidationInput {
  readonly projectId: string;
  readonly basis: { readonly revision: number; readonly digest: string };
  readonly targetRevision: number;
  /** The tasks whose Work this revision retires (they are staled in the batch). */
  readonly affectedTaskIds: readonly string[];
  /** Every attempt belonging to an affected task. */
  readonly affectedAttemptIds: readonly string[];
  /** The change class that triggered the revision (`null` for a plan removal). */
  readonly changeClass: ChangeClass | null;
  /** ACTIVE Work Evidence of the project, read before any mutation. */
  readonly activeEvidence: readonly ActiveWorkEvidence[];
}

/**
 * The deterministic reason string shared by every event of one revision. It
 * names the exact semantic trigger, so a retry of the same revision converges on
 * the same identity and a different trigger fails closed instead of being read
 * as a replay.
 */
export function evidenceInvalidationReason(
  changeClass: ChangeClass | null,
  targetRevision: number,
): string {
  return changeClass === null
    ? `work retirement on revision ${targetRevision}`
    : `typed invalidation (${changeClass}) on revision ${targetRevision}`;
}

/**
 * Compile the typed Evidence invalidation plan for one revision (pure).
 *
 * Scope is the DECLARED policy, not a global sweep: only Evidence bound to the
 * exact tasks this revision retires - and to their attempts - loses authority.
 * "Retires" is deliberately the SAME set the batch marks `TASK_STALE`, whether
 * those tasks fall out by typed invalidation or by removal from the new
 * ProjectIR. There is one rule, not two: a task this revision declares dead
 * cannot keep work evidence that grants gate authority to its old work.
 *
 * Subjects are matched as EXACT `(subject_type, subject_id)` pairs; a bare
 * `subject_id` match is refused because two subject kinds can share an id space.
 *
 * `commit`-subject Evidence is deliberately OUT of the automatic policy: a
 * commit is a repository artifact, not a Work node in the ProjectIR task graph,
 * so the declared typed policy carries no rule that retires it. Such items are
 * reported in `excludedBySubjectType` rather than silently dropped.
 */
export function compileEvidenceInvalidation(
  input: CompileEvidenceInvalidationInput,
): EvidenceInvalidationPlan {
  const taskIds = new Set(input.affectedTaskIds);
  const attemptIds = new Set(input.affectedAttemptIds);
  const selectedEvidenceIds: string[] = [];
  const subjects = new Map<string, EvidenceSubjectPair>();
  const excluded = new Map<string, EvidenceSubjectPair>();

  for (const item of input.activeEvidence) {
    const inScope =
      item.subjectType === "task"
        ? taskIds.has(item.subjectId)
        : item.subjectType === "attempt"
          ? attemptIds.has(item.subjectId)
          : false;
    const pair: EvidenceSubjectPair = {
      subjectType: item.subjectType,
      subjectId: item.subjectId,
    };
    if (inScope) {
      selectedEvidenceIds.push(item.evidenceId);
      subjects.set(`${pair.subjectType}\u0000${pair.subjectId}`, pair);
    } else if (item.subjectType === "commit") {
      excluded.set(`${pair.subjectType}\u0000${pair.subjectId}`, pair);
    }
  }

  const byPair = (left: EvidenceSubjectPair, right: EvidenceSubjectPair): number =>
    left.subjectType === right.subjectType
      ? left.subjectId < right.subjectId
        ? -1
        : left.subjectId > right.subjectId
          ? 1
          : 0
      : left.subjectType < right.subjectType
        ? -1
        : 1;

  return Object.freeze({
    schemaVersion: 1 as const,
    projectId: input.projectId,
    basis: Object.freeze({ ...input.basis }),
    targetRevision: input.targetRevision,
    affectedTaskIds: Object.freeze([...taskIds].sort()),
    affectedAttemptIds: Object.freeze([...attemptIds].sort()),
    subjects: Object.freeze([...subjects.values()].sort(byPair)),
    evidenceIds: Object.freeze(selectedEvidenceIds.sort()),
    reason: evidenceInvalidationReason(input.changeClass, input.targetRevision),
    excludedBySubjectType: Object.freeze([...excluded.values()].sort(byPair)),
  });
}
