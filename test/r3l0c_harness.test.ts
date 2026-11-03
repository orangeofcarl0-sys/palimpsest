/**
 * R3-L0C — THE HARNESS LOGIC TESTS.
 *
 * These exercise the instrumentation, the analysis and the witness against SYNTHETIC inputs, so the verdict
 * logic is pinned independently of what the primary run later produces. That independence is the point: if the
 * analysis were only tested against the real matrix, a wrong verdict would be indistinguishable from a wrong
 * result.
 *
 * The load-bearing assertions are the ones that would let a bad result look good:
 *
 *   · a cost win that hides an excess completion failure must NOT be POSITIVE_SIGNAL (§19's fifth condition);
 *   · a cost win with worse invariant quality must NOT be POSITIVE_SIGNAL (§15's reliability constraint);
 *   · a capital body must never count as a raw-history byte (§13);
 *   · H must be the ABSENCE of a selection, not an empty one (§9).
 */
import { describe, expect, it } from "vitest";

import { COMPRESSION, DIRECTIONS, NET_COST, compressionVerdict, netCostVerdict, pairBlock, reliabilityReport } from "../scripts/r3l0c/analyse.mjs";
import { classifyInformationPath, historyOnlyWitness, capitalWitness } from "../scripts/r3l0c/witness.mjs";
import { isDeclaredCorpusPath } from "../scripts/r3l0c/corpus.mjs";
import { frozenHandlesFor, selectionFor } from "../scripts/r3l0c/capital.mjs";

/** A synthetic session row, so the analysis can be exercised without a run. */
function session(overrides: Record<string, unknown>) {
  return {
    sessionId: "s", block: 0, arm: "H", generation: "G1",
    rawHistoryArtifactsRead: 0, rawHistoryBytesReturned: 0,
    actionsBeforeFirstResult: 0, elapsedToFirstResultMs: 0,
    finalPrepaidCoverage: 1, firstCandidatePrepaidCoverage: 1,
    projectVerificationOk: true, completionCause: "RESULT_SUBMITTED",
    consumptionClosed: false, informationPath: "HISTORY_RECONSTRUCTION",
    ...overrides,
  };
}

/** A pair of blocks where C is strictly cheaper and no worse in quality. */
function cheapButSound() {
  const rows: Record<string, unknown>[] = [];
  for (let block = 0; block < 4; block += 1) {
    rows.push(session({ sessionId: `b${String(block)}-H-G1`, block, arm: "H", rawHistoryArtifactsRead: 8, rawHistoryBytesReturned: 9000, actionsBeforeFirstResult: 20, elapsedToFirstResultMs: 100_000, finalPrepaidCoverage: 1, consumptionClosed: true, informationPath: "HISTORY_RECONSTRUCTION" }));
    rows.push(session({ sessionId: `b${String(block)}-C-G1`, block, arm: "C", rawHistoryArtifactsRead: 2, rawHistoryBytesReturned: 2000, actionsBeforeFirstResult: 8, elapsedToFirstResultMs: 40_000, finalPrepaidCoverage: 1, consumptionClosed: true, informationPath: "CAPITAL_THEN_EDIT" }));
  }
  return rows;
}

describe("R3-L0C §13/§19 — the reconstruction-cost pairing", () => {
  it("§13 a block pair compares C against its matched H", () => {
    const pair = pairBlock(0, cheapButSound());
    expect(pair.hBytes).toBe(9000);
    expect(pair.cBytes).toBe(2000);
    expect(pair.bytesDirection).toBe(DIRECTIONS.C_LOWER);
    expect(pair.artifactsDirection).toBe(DIRECTIONS.C_LOWER);
  });

  it("§19 a cheaper, no-worse, fully-consumed matrix is POSITIVE_SIGNAL", () => {
    const rows = cheapButSound();
    const pairs = [0, 1, 2, 3].map((block) => pairBlock(block, rows));
    const verdict = compressionVerdict(pairs);
    expect(verdict.verdict).toBe(COMPRESSION.POSITIVE_SIGNAL);
    expect(verdict.failedConditions).toEqual([]);
  });

  it("§19 a cost win that HIDES an excess completion failure is NOT positive", () => {
    /**
     * This is the condition the R3-L0 b0-C-G3 event made necessary: a cheaper trace with an exhausted budget
     * must not be reported as an improvement.
     */
    const rows = cheapButSound().map((row) => (row.arm === "C" && row.block === 2 ? { ...row, completionCause: "MAX_TOKENS" } : row));
    const pairs = [0, 1, 2, 3].map((block) => pairBlock(block, rows));
    const verdict = compressionVerdict(pairs);
    expect(verdict.verdict).not.toBe(COMPRESSION.POSITIVE_SIGNAL);
    expect(verdict.failedConditions).toContain("NO_HIDDEN_COMPLETION_FAILURE");
  });

  it("§15 a cost win with WORSE invariant quality is NOT positive", () => {
    const rows = cheapButSound().map((row) => (row.arm === "C" ? { ...row, finalPrepaidCoverage: 0.5 } : row));
    const pairs = [0, 1, 2, 3].map((block) => pairBlock(block, rows));
    const verdict = compressionVerdict(pairs);
    expect(verdict.verdict).not.toBe(COMPRESSION.POSITIVE_SIGNAL);
    expect(verdict.failedConditions).toContain("QUALITY_NOT_WORSE");
  });

  it("§19 a C trajectory without governed consumption is NOT positive", () => {
    const rows = cheapButSound().map((row) => (row.arm === "C" && row.block === 3 ? { ...row, consumptionClosed: false } : row));
    const pairs = [0, 1, 2, 3].map((block) => pairBlock(block, rows));
    const verdict = compressionVerdict(pairs);
    expect(verdict.verdict).not.toBe(COMPRESSION.POSITIVE_SIGNAL);
    expect(verdict.failedConditions).toContain("CONSUMPTION_IN_EVERY_C_TRAJECTORY");
  });

  it("§19 C consistently MORE expensive is ADVERSE_SIGNAL", () => {
    const rows = cheapButSound().map((row) => (row.arm === "C" ? { ...row, rawHistoryBytesReturned: 20_000, rawHistoryArtifactsRead: 15 } : row));
    const pairs = [0, 1, 2, 3].map((block) => pairBlock(block, rows));
    expect(compressionVerdict(pairs).verdict).toBe(COMPRESSION.ADVERSE_SIGNAL);
  });

  it("§19 no consistent direction is MIXED, and no direction at all is NO_SIGNAL", () => {
    const mixed = cheapButSound().map((row) => (row.arm === "C" && Number(row.block) % 2 === 1 ? { ...row, rawHistoryBytesReturned: 20_000 } : row));
    const mixedPairs = [0, 1, 2, 3].map((block) => pairBlock(block, mixed));
    expect(compressionVerdict(mixedPairs).verdict).toBe(COMPRESSION.MIXED);
    const flat = cheapButSound().map((row) => (row.arm === "C" ? { ...row, rawHistoryBytesReturned: 9000, rawHistoryArtifactsRead: 8 } : row));
    const flatPairs = [0, 1, 2, 3].map((block) => pairBlock(block, flat));
    expect(compressionVerdict(flatPairs).verdict).toBe(COMPRESSION.NO_SIGNAL);
  });

  it("§19 no p-values are reported", () => {
    const pairs = [0, 1, 2, 3].map((block) => pairBlock(block, cheapButSound()));
    expect(compressionVerdict(pairs).pValues).toContain("n=4");
  });
});

describe("R3-L0C §20 — the net-cost verdict is separate", () => {
  it("§20 it reports LOWER/HIGHER/MIXED and never overwrites the compression verdict", () => {
    const pairs = [0, 1, 2, 3].map((block) => pairBlock(block, cheapButSound()));
    const net = netCostVerdict(pairs);
    expect(net.verdict).toBe(NET_COST.LOWER);
    expect(net.overridesCompressionVerdict).toBe(false);
    expect(net.law).toContain("must not silently overwrite");
  });

  it("§20 disagreeing dimensions yield MIXED", () => {
    const rows = cheapButSound().map((row) => (row.arm === "C" ? { ...row, actionsBeforeFirstResult: 50 } : row));
    const pairs = [0, 1, 2, 3].map((block) => pairBlock(block, rows));
    const net = netCostVerdict(pairs);
    expect(net.verdict).toBe(NET_COST.MIXED);
  });
});

describe("R3-L0C §15 — the reliability report", () => {
  it("§15 it reports both arms separately so a cost win with a quality loss is visible", () => {
    const report = reliabilityReport(cheapButSound());
    expect(report.H.meanFinalPrepaidCoverage).toBe(1);
    expect(report.C.meanFinalPrepaidCoverage).toBe(1);
    expect(report.law).toContain("wrong current standing");
  });
});

describe("R3-L0C §13 — the corpus counting rule", () => {
  it("§13 only declared corpus documents count, and a capital handle never does", () => {
    expect(isDeclaredCorpusPath("docs/history/decisions/0044-post-cutover-tenants-exempt.md")).toBe(true);
    expect(isDeclaredCorpusPath("@ctx/reasoning/cell/claim")).toBe(false);
    expect(isDeclaredCorpusPath("src/entitlements.mjs")).toBe(false);
    expect(isDeclaredCorpusPath("@ctx/procedure/prc/0")).toBe(false);
  });
});

describe("R3-L0C §17/§18 — the witness and the information path", () => {
  it("§17 a C chain is CLOSED only when every link holds", () => {
    const report = { payload: { handles: [{ kind: "REASONING_CLAIM", handle: "h1" }] }, governedPulls: [{ handle: "h1", resolved: true, bodyBytes: 100, bodyDigest: "d" }] };
    const witness = capitalWitness({ sessionId: "s", arm: "C", block: 0, generation: "G1", report, admitted: { reasoning: [{}], procedure: [{}] }, expectedHandles: ["h1"], associationsPresent: true });
    expect(witness.chain).toBe("CLOSED");
    expect(witness.consumed).toBe(true);
    expect(witness.openLinks).toEqual([]);
  });

  it("§17 a C chain is OPEN when the pull did not resolve, and names the open link", () => {
    const report = { payload: { handles: [{ kind: "REASONING_CLAIM", handle: "h1" }] }, governedPulls: [{ handle: "h1", resolved: false }] };
    const witness = capitalWitness({ sessionId: "s", arm: "C", block: 0, generation: "G1", report, admitted: { reasoning: [{}], procedure: [{}] }, expectedHandles: ["h1"], associationsPresent: true });
    expect(witness.chain).toBe("OPEN");
    expect(witness.openLinks).toContain("GOVERNED_PULL");
    expect(witness.consumed).toBe(false);
  });

  it("§17 an absent selection is an OPEN chain, not a pass", () => {
    const witness = capitalWitness({ sessionId: "s", arm: "C", block: 0, generation: "G1", report: { payload: { handles: [] }, governedPulls: [] }, admitted: { reasoning: [{}], procedure: [{}] }, expectedHandles: ["h1"], associationsPresent: true });
    expect(witness.chain).toBe("OPEN");
    expect(witness.openLinks).toContain("ATTEMPT_SELECTION");
  });

  it("§17 the H negative witness proves the absences", () => {
    const witness = historyOnlyWitness({ sessionId: "s", arm: "H", block: 0, generation: "G1", report: { payload: { handles: [], contextIndexText: "no handles", allowedPullHandles: [] } }, expectedHandles: [] });
    expect(witness.chain).toBe("CLOSED");
    expect(witness.selectedCapitalSetEmpty).toBe(true);
    expect(witness.expectedHandlesWereEmpty).toBe(true);
  });

  it("§17 the H witness FAILS if a capital handle reached the surface", () => {
    const witness = historyOnlyWitness({ sessionId: "s", arm: "H", block: 0, generation: "G1", report: { payload: { handles: [{ kind: "PROOF_CLAIM", handle: "@ctx/proof/x" }], contextIndexText: "see @ctx/reasoning/cell/claim", allowedPullHandles: ["@ctx/proof/x"] } }, expectedHandles: [] });
    expect(witness.chain).toBe("OPEN");
    expect(witness.openLinks).toContain("MODEL_VISIBLE_CAPITAL_INDEX_ABSENT");
    expect(witness.openLinks).toContain("SELECTED_CAPITAL_SET_EMPTY");
  });

  it("§17 use is never inferred from the task outcome", () => {
    const report = { payload: { handles: [] }, governedPulls: [] };
    const witness = capitalWitness({ sessionId: "s", arm: "C", block: 0, generation: "G1", report, admitted: { reasoning: [{}], procedure: [{}] }, expectedHandles: [], associationsPresent: true });
    expect(witness.inferredFromTaskSuccess).toBe(false);
    expect(historyOnlyWitness({ sessionId: "s", arm: "H", block: 0, generation: "G1", report, expectedHandles: [] }).inferredFromTaskSuccess).toBe(false);
  });

  it("§18 the path classification uses observable order only", () => {
    expect(classifyInformationPath({ capitalContentReturned: true, historyReads: 0, firstEditStep: 10, firstCapitalStep: 5, resultSubmitted: true })).toBe("CAPITAL_THEN_EDIT");
    expect(classifyInformationPath({ capitalContentReturned: true, historyReads: 3, firstEditStep: 10, firstCapitalStep: 5, resultSubmitted: true })).toBe("CAPITAL_THEN_HISTORY");
    expect(classifyInformationPath({ capitalContentReturned: false, historyReads: 4, firstEditStep: 20, firstCapitalStep: null, resultSubmitted: true })).toBe("HISTORY_RECONSTRUCTION");
    expect(classifyInformationPath({ capitalContentReturned: false, historyReads: 0, firstEditStep: 3, firstCapitalStep: null, resultSubmitted: true })).toBe("DIRECT_EDIT_WITHOUT_HISTORY");
    expect(classifyInformationPath({ capitalContentReturned: false, historyReads: 2, firstEditStep: null, firstCapitalStep: null, resultSubmitted: false })).toBe("NO_RESULT");
  });
});

/* ================================================================ §9 the selection SHAPE */

describe("R3-L0C §9 — the selection shape, which failed silently once", () => {
  const refs = [
    { invariant: "I1", kind: "REASONING_CLAIM", handle: "@ctx/reasoning/cell-a/cl-1", ref: { cellId: "cell-a", claimId: "cl-1" } },
    { invariant: "I1", kind: "PROCEDURE", handle: "@ctx/procedure/prc-a/0", ref: { procedureId: "prc-a", revision: 0, reason: "the method" } },
    { invariant: "I2", kind: "REASONING_CLAIM", handle: "@ctx/reasoning/cell-b/cl-2", ref: { cellId: "cell-b", claimId: "cl-2" } },
  ];

  it("§9 the selection uses the OWNER shape, never a bare handle list", () => {
    /**
     * THE DEFECT THIS PINS. A first version sent `{ handles: [...] }`. The host contract
     * `KnowledgeSelectionRequest` is `{ proof?, reasoning?, procedure? }`, so the unknown field was IGNORED: the
     * selection was accepted, the attempt reported `knowledgeSelected: true`, and NO handle was compiled. All 16
     * sessions of the first run therefore executed with an empty capital surface, and the treatment was never
     * delivered. The failure was silent to every host-side signal and was caught only by the consumer-boundary
     * payload.
     *
     * The shape is asserted field by field, so a future refactor cannot quietly reintroduce a shape the owner
     * does not read.
     */
    const selection = selectionFor("C", "G1", refs) as { proof: readonly Record<string, unknown>[]; reasoning: readonly Record<string, unknown>[]; procedure: readonly Record<string, unknown>[] };
    expect(Object.keys(selection).sort()).toEqual(["procedure", "proof", "reasoning"]);
    expect(selection).not.toHaveProperty("handles");
    expect(selection.reasoning[0]).toEqual({ cellId: "cell-a", claimId: "cl-1" });
    expect(selection.procedure[0]).toEqual({ procedureId: "prc-a", revision: 0, reason: "the method" });
    expect(selection.proof).toEqual([]);
  });

  it("§9 the selection carries ONLY the invariants the generation exposes", () => {
    const selection = selectionFor("C", "G1", refs) as { proof: readonly Record<string, unknown>[]; reasoning: readonly Record<string, unknown>[]; procedure: readonly Record<string, unknown>[] };
    expect(selection.reasoning.length).toBe(1);
    expect(selection.reasoning[0]!.cellId).toBe("cell-a");
    const g2 = selectionFor("C", "G2", refs) as { reasoning: readonly Record<string, unknown>[] };
    expect(g2.reasoning.length).toBe(2);
  });

  it("§9 the expected handle set matches the selection one-for-one", () => {
    const handles = frozenHandlesFor("C", "G1", refs);
    const selection = selectionFor("C", "G1", refs) as { proof: readonly Record<string, unknown>[]; reasoning: readonly Record<string, unknown>[]; procedure: readonly Record<string, unknown>[] };
    expect(handles.length).toBe(selection.reasoning.length + selection.procedure.length + selection.proof.length);
    expect(handles).toEqual(["@ctx/reasoning/cell-a/cl-1", "@ctx/procedure/prc-a/0"]);
  });

  it("§9 H is the ABSENCE of a selection, not an empty one", () => {
    expect(selectionFor("H", "G1", refs)).toBeUndefined();
    expect(frozenHandlesFor("H", "G1", refs)).toEqual([]);
  });
});
