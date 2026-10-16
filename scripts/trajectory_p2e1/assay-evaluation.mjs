/**
 * Trajectory-P2-E1R §9 — THE ONE OFFICIAL ASSAY EVALUATION SEAM (C4).
 *
 * WHY THIS EXISTS (F11/F12/F20). E1 had two graders: the E0 fixture still scored answers with the LEGACY
 * keyword oracle (`mechanical-oracle.mjs`, `GROUND_TRUTH_KEY`), while the new source-aware oracle was only
 * exercised in a separate proof. Nothing forced the ACTIVE benchmark to use the official oracle, and the
 * dry-run never ran the official oracle over a fixture-produced answer at all.
 *
 * This module is the SINGLE evaluation entry the active assay uses. Its inputs come from independent sources
 * (§9.3): the frozen per-run truth is instantiated from the fixture's OWN Owner reads, the structured answer
 * comes from the evaluated agent, and the observation comes from the harness — the evaluated agent NEVER
 * supplies its own truth.
 *
 * The legacy keyword oracle is preserved for historical reproduction only and is marked LEGACY_REPRODUCTION_ONLY.
 *
 * NOT a product component. PLAIN JAVASCRIPT (`.mjs`), bare node. No model, no network, no I/O.
 */
import { judgeAnswer, ORACLE_VERSION } from "./source-aware-oracle.mjs";

/** §9.1: the legacy oracle is retained for reproducing the E0 records, never for a new evaluation. */
export const LEGACY_ORACLE_STATUS = Object.freeze({
  module: "scripts/trajectory_p2e0/mechanical-oracle.mjs",
  classification: "LEGACY_REPRODUCTION_ONLY",
  usedByActiveAssay: false,
  why: "it graded load-bearing judgments by keyword co-occurrence and its answer key was cross-owner-broken; it exists only so the P2-E0 evidence can be reproduced byte-identically",
});

/** §9.3: the official oracle the active assay uses, named once so no caller can drift. */
export const OFFICIAL_ORACLE = Object.freeze({
  module: "scripts/trajectory_p2e1/source-aware-oracle.mjs",
  version: ORACLE_VERSION,
  entry: "evaluateAssayResult",
});

/**
 * §9.3: THE UNIFIED EVALUATION CONTRACT.
 *
 *   frozenTruth      the per-run FrozenAssayTruth instantiated from the fixture's Owner reads (never the agent)
 *   structuredAnswer the evaluated agent's answer (validated by the official schema)
 *   observedActions  the harness's ACTUAL execution evidence, or null (yielding NOT_MEASURED)
 *   arm              which experimental arm produced the answer (selects the arm's critical requirements)
 *
 * Returns the official oracle's dimension-level verdict, tagged with the oracle version and truth digest so a
 * result names the exact instrument and answer key that produced it.
 */
export function evaluateAssayResult(input) {
  const { frozenTruth, structuredAnswer, observedActions = null, arm = "treatment" } = input;
  if (frozenTruth === undefined || frozenTruth === null) {
    /** §9.3: never fall back to a global truth when a per-run snapshot was required. */
    return Object.freeze({ ok: false, detail: "a per-run frozen assay truth is required; the evaluated agent may not supply its own truth", oracleVersion: ORACLE_VERSION });
  }
  const result = judgeAnswer(structuredAnswer, { snapshot: frozenTruth, arm, observation: observedActions });
  if (!result.ok) return result;
  return Object.freeze({ ...result, officialOracle: OFFICIAL_ORACLE.module, truthDigest: frozenTruth.digest });
}
