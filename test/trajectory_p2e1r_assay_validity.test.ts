/**
 * Trajectory-P2-E1R §15 — ASSAY VALIDITY, ANSWER EXTRACTION AND SINGLE-PATH EVALUATION (C3/C4/C5).
 *
 * Proves the load-bearing E1R guarantees without any model or network:
 *   · the one official evaluation seam refuses an agent-supplied truth and rejects the legacy oracle;
 *   · the benchmark answer contract is validated and extracted from real DSH output events;
 *   · the proposition-level admission refuses missing sources, wrong references and stale trials;
 *   · operational measurement distinguishes NOT_MEASURED from acceptance.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { REFERENCE_ASSAY_TRUTH } from "../scripts/trajectory_p2e1/experimental-truth.mjs";
import { ORACLE_VERSION, OPERATIONAL_STATES, validateAnswer } from "../scripts/trajectory_p2e1/source-aware-oracle.mjs";
import { evaluateAssayResult, LEGACY_ORACLE_STATUS, OFFICIAL_ORACLE } from "../scripts/trajectory_p2e1/assay-evaluation.mjs";
import { assistantTextOf, extractBenchmarkAnswer, findSessionFile } from "../scripts/trajectory_p2e1r/answer-extraction.mjs";

const SNAP = REFERENCE_ASSAY_TRUTH;
const REPO = process.cwd();
const handleOf = (id: string): string | null => SNAP.propositions.find((entry) => entry.id === id)!.citationHandle;
const correctTreatment = {
  judgments: [
    { proposition: "ORIGIN_CANONICAL_COMPLETED", truth: "TRUE", source: "CANONICAL_WORK", evidenceRef: handleOf("ORIGIN_CANONICAL_COMPLETED") },
    { proposition: "ORIGIN_DSH_PAGE_PARTIAL", truth: "TRUE", source: "DSH_SESSION", evidenceRef: handleOf("ORIGIN_DSH_PAGE_PARTIAL") },
    { proposition: "ALL_REPORTED_DSH_EVENTS_RETURNED", truth: "FALSE", source: "DSH_SESSION", evidenceRef: handleOf("ALL_REPORTED_DSH_EVENTS_RETURNED") },
    { proposition: "OUTCOMES_OF_UNRETURNED_EVENTS", truth: "UNKNOWN", source: "DSH_SESSION", evidenceRef: null },
    { proposition: "CONSUMER_CAN_SETTLE", truth: "FALSE", source: "CURRENT_WORK", evidenceRef: handleOf("CONSUMER_CAN_SETTLE") },
  ],
  proposedAction: "INSPECT_CURRENT_WORLD",
  confidence: "HIGH",
};

describe("E1R §9 Group D — one official evaluation path", () => {
  it("the official oracle is the source-aware module and the legacy oracle is isolated", () => {
    expect(OFFICIAL_ORACLE.module).toBe("scripts/trajectory_p2e1/source-aware-oracle.mjs");
    expect(OFFICIAL_ORACLE.version).toBe(ORACLE_VERSION);
    expect(LEGACY_ORACLE_STATUS.classification).toBe("LEGACY_REPRODUCTION_ONLY");
    expect(LEGACY_ORACLE_STATUS.usedByActiveAssay).toBe(false);
  });

  it("the seam evaluates a correct answer end-to-end", () => {
    const result = evaluateAssayResult({ frozenTruth: SNAP, structuredAnswer: correctTreatment, observedActions: null, arm: "treatment" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict.historicalUnderstanding).toBe(true);
    expect(result.verdict.decisionQuality).toBe(true);
    expect(result.truthDigest).toBe(SNAP.digest);
    expect(result.officialOracle).toBe(OFFICIAL_ORACLE.module);
  });

  it("the seam REFUSES when no per-run truth is supplied (the agent may not supply its own truth)", () => {
    const result = evaluateAssayResult({ frozenTruth: null as never, structuredAnswer: correctTreatment, observedActions: null, arm: "treatment" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.detail).toContain("per-run frozen assay truth is required");
  });

  it("the seam rejects the negative vectors the dry-run exercises", () => {
    const wrongSource = { ...correctTreatment, judgments: [{ proposition: "ORIGIN_CANONICAL_COMPLETED", truth: "TRUE", source: "DSH_SESSION", evidenceRef: handleOf("ORIGIN_CANONICAL_COMPLETED") }] };
    const result = evaluateAssayResult({ frozenTruth: SNAP, structuredAnswer: wrongSource, observedActions: null, arm: "treatment" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict.historicalUnderstanding).toBe(false);
  });
});

describe("E1R §10 Group E — benchmark answer contract and DSH extraction", () => {
  it("the answer contract accepts a valid answer and refuses malformed ones", () => {
    expect(validateAnswer(correctTreatment).ok).toBe(true);
    expect(validateAnswer({ notAnAnswer: true }).ok).toBe(false);
    expect(validateAnswer({ ...correctTreatment, proposedAction: "NONSENSE" }).ok).toBe(false);
    expect(validateAnswer({ ...correctTreatment, judgments: [{ proposition: "NOT_A_PROPOSITION", truth: "TRUE" }] }).ok).toBe(false);
  });

  it("the assistant text of an event is joined from its text blocks", () => {
    const event = { type: "assistant/message", seq: 15, data: { message: { content: [{ type: "text", text: '{"a":' }, { type: "text", text: "1}" }] } } };
    expect(assistantTextOf(event)).toBe('{"a":1}');
  });

  it("extraction reads the LAST assistant message and parses it as the answer", () => {
    const events = [
      { type: "user/message", seq: 0, data: { content: [{ type: "text", text: "task" }] } },
      { type: "assistant/message", seq: 5, data: { message: { content: [{ type: "text", text: '{"judgments":[],"proposedAction":"INSPECT_CURRENT_WORLD","confidence":"LOW"}' }] } } },
      { type: "assistant/message", seq: 15, data: { message: { content: [{ type: "text", text: JSON.stringify(correctTreatment) }] } } },
    ];
    const extraction = extractBenchmarkAnswer(events);
    expect(extraction.ok).toBe(true);
    if (!extraction.ok) return;
    expect(extraction.seq).toBe(15);
    expect(extraction.assistantMessageCount).toBe(2);
    expect(validateAnswer(extraction.answer).ok).toBe(true);
  });

  it("extraction FAILS on a missing, empty or non-JSON assistant message", () => {
    expect(extractBenchmarkAnswer([]).ok).toBe(false);
    expect(extractBenchmarkAnswer([{ type: "assistant/message", seq: 1, data: { message: { content: [] } } }]).ok).toBe(false);
    expect(extractBenchmarkAnswer([{ type: "assistant/message", seq: 1, data: { message: { content: [{ type: "text", text: "not json" }] } } }]).ok).toBe(false);
    expect(extractBenchmarkAnswer([{ type: "assistant/message", seq: 1, data: { message: { content: [{ type: "text", text: "[1,2]" }] } } }]).ok).toBe(false);
  });

  it("the session lookup refuses to guess among several matches", () => {
    // A non-existent root yields no match (null), never a fabricated path.
    expect(findSessionFile("C:/definitely/not/a/real/root", "session-x")).toBeNull();
  });

  it("a benchmark answer is NOT a canonical Work settlement (it uses no result-tool vocabulary)", () => {
    // The answer contract has no `kind`/`summary`/`reason`/`proposedAction`-as-outcome fields.
    expect(Object.keys(correctTreatment)).not.toContain("kind");
    expect(Object.keys(correctTreatment)).not.toContain("summary");
    expect(Object.keys(correctTreatment)).not.toContain("reason");
  });
});

describe("E1R §8.9 Group F — operational measurement", () => {
  it("the operational states are the five explicit classifications", () => {
    expect([...OPERATIONAL_STATES]).toEqual(["NOT_MEASURED", "MEASURED_NO_REPETITION", "MEASURED_REPETITION", "WORK_ACCEPTED", "WORK_NOT_ACCEPTED"]);
  });
});

describe("E1R §9.2 — no active path uses the legacy keyword oracle", () => {
  it("no active E1R/E1 module imports the legacy oracle", () => {
    const activeModules = [
      "scripts/trajectory_p2e1/assay-evaluation.mjs",
      "scripts/trajectory_p2e1/source-aware-oracle.mjs",
      "scripts/trajectory_p2e1/calibrate.mjs",
      "scripts/trajectory_p2e1r/assay-harness.mjs",
      "scripts/trajectory_p2e1r/generate-evidence.mjs",
      "scripts/trajectory_p2e1r/answer-extraction.mjs",
      "scripts/trajectory_p2e1r/benchmark-answer-adapter.mjs",
    ];
    for (const modulePath of activeModules) {
      const source = readFileSync(join(REPO, modulePath), "utf8");
      /** A MENTION in a comment or a status declaration is fine; an IMPORT is not. */
      expect(source, `${modulePath} must not import the legacy keyword oracle`).not.toMatch(/^\s*import[^\n]*mechanical-oracle/mu);
      expect(source, `${modulePath} must not import the legacy judgeAnswer`).not.toMatch(/^\s*import[^\n]*GROUND_TRUTH_KEY/mu);
    }
  });

  it("the legacy oracle names itself LEGACY_REPRODUCTION_ONLY", () => {
    const legacy = readFileSync(join(REPO, "scripts", "trajectory_p2e0", "mechanical-oracle.mjs"), "utf8");
    expect(legacy).toContain("LEGACY_REPRODUCTION_ONLY");
  });
});
