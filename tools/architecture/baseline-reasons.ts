/**
 * SR-1 §10, repaired by SR-1C §4 — the recorded reason for every exception in the architecture
 * baseline.
 *
 * Exceptions are keyed by CONCRETE IMPORT EDGE (`from -> to`), never by layer pair, so that a
 * fifth upward import cannot slip in under the same layer pair. The reasons live in code (not
 * only in the generated JSON) so that `--write` is deterministic and a reason change shows up in
 * the diff. An exception without a reason is not allowed to exist.
 */

const UPWARD_EDGE_REASON =
  "One of the four historical upward imports recorded at the SR-1 baseline: a capability module reads a PROJECTION or " +
  "the durable operating posture. These are real edges, not misclassifications, and each is enumerated individually so " +
  "that no NEW one may appear. Removing them is SR-2 work (the projection should depend on the owner, not the other way " +
  "round), not part of a structural refactor that must not change semantics.";

/**
 * SR-2 §五 — the edge the checker's old BARREL fallback was hiding.
 *
 * `src/continuation/**` was UNCLASSIFIED, and an unclassified directory used to fall back to
 * BARREL, whose allowed-target set is "everything". So this edge was never REPORTED — not
 * because it was permitted, but because nobody had classified the module that creates it.
 * Classifying continuation as L3 (SR-2 §五: it is cross-kernel orchestration, not World
 * Consistency) made it visible.
 *
 * It is recorded rather than fixed here because SR-2.0 is the tooling slice and changes no
 * product implementation: moving the observer port to a consumer-owned location is SR-2a's
 * first act ("先立接口墙，再拆实现"), whose machine proofs name this exact edge
 * (`service.ts !→ deployment/source_change_observer.ts`). The edge is TYPE-ONLY today — the
 * service never runs the observer, it only names its port — so recording it changes no
 * behavior, and SR-2a removes it.
 */
const NEWLY_EXPOSED_EDGE_REASON =
  "Newly EXPOSED, not newly created: this edge existed since D5-d but was invisible because " +
  "src/continuation/** was unclassified and fell back to BARREL. SR-2 §五 classified it as L3, " +
  "which surfaced the edge. It is type-only (the service names the observer's port, never runs " +
  "it) and it is removed by SR-2a, whose machine proofs name this exact edge. Recorded here so " +
  "it is visible and cannot grow, rather than silently re-baselined.";

/** Forbidden import edges that exist at the SR-1 baseline, keyed `fromFile -> toFile`. */
export const BASELINE_EDGE_REASONS: ReadonlyMap<string, string> = new Map([
  ["src/monitor/driver.ts -> src/project_operating/posture.ts", UPWARD_EDGE_REASON],
  ["src/monitor/driver.ts -> src/project_operating/work_mode_profile.ts", UPWARD_EDGE_REASON],
  ["src/project_workspace/view.ts -> src/tools/graph.ts", UPWARD_EDGE_REASON],
  ["src/tools/controller.ts -> src/tools/graph.ts", UPWARD_EDGE_REASON],
  ["src/continuation/service.ts -> src/deployment/source_change_observer.ts", NEWLY_EXPOSED_EDGE_REASON],
]);


/** Cycles that exist at the SR-1 baseline, keyed by the sorted file list joined with `|`. */
export const BASELINE_CYCLE_REASONS: ReadonlyMap<string, string> = new Map([
  [
    ["src/canvas/derive.ts", "src/tools/controller.ts", "src/tools/graph.ts"].sort().join("|"),
    "cross-layer cycle (L3→L2→L3): tools/graph.ts imports canvas/derive.ts, tools/controller.ts imports the graph " +
      "projection, and canvas/derive.ts reads the controller. Recorded so that it cannot grow; unwinding it is a " +
      "canonical SR-2 candidate because it spans the Work orchestration owner and a derived projection.",
  ],
]);
