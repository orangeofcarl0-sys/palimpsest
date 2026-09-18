/**
 * SR-1 §10 — the recorded reasons for every exception in the architecture baseline.
 *
 * These live in code (not only in the generated JSON) so that `--write` is deterministic
 * and a reviewer sees a reason appear or change in the diff. An exception without a reason
 * is not allowed to exist: `baselineFrom()` falls back to a "historical" marker and the
 * check reports how many exceptions are un-reasoned.
 */

/** Forbidden layer edges that exist at the SR-1 baseline, keyed `Lx->Ly`. */
export const BASELINE_EDGE_REASONS: ReadonlyMap<string, string> = new Map([
  [
    "L2->L3",
    "Four capability modules read a PROJECTION or the durable operating posture: monitor/driver.ts reads " +
      "project_operating/{posture,work_mode_profile}, and project_workspace/view.ts + tools/controller.ts read the " +
      "orchestration graph projection in tools/graph.ts. These are real upward edges, not misclassifications; the " +
      "direction is recorded here so that no NEW one may appear. Removing them is SR-2 work (the projection should " +
      "depend on the owner, not the other way round), not part of a structural refactor that must not change " +
      "semantics.",
  ],
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
