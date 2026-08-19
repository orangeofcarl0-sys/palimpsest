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