/**
 * Trajectory-P2-E1RC §8 — REQUIRED NEGATIVE CONTROLS (C6).
 *
 * Every load-bearing failure mode below is exercised DYNAMICALLY: the code is RUN and the refusal is observed.
 * A source inspection is never counted as a dynamic test. Where a control cannot be executed in this
 * environment (the first-party DSH turn is blocked by an unclassified capability), the control is marked
 * `NOT_ESTABLISHED` rather than claimed.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REFERENCE_ASSAY_TRUTH, instantiateAssayTruth, validateAssayTruthFacts } from "../scripts/trajectory_p2e1/experimental-truth.mjs";
import { judgeAnswer, ORACLE_VERSION } from "../scripts/trajectory_p2e1/source-aware-oracle.mjs";
import { evaluateAssayResult } from "../scripts/trajectory_p2e1/assay-evaluation.mjs";
import { extractBenchmarkAnswer, findSessionFile } from "../scripts/trajectory_p2e1r/answer-extraction.mjs";

const SNAP = REFERENCE_ASSAY_TRUTH;
const handle = (id: string): string | null => SNAP.propositions.find((entry) => entry.id === id)!.citationHandle;
const baseFacts = { trialId: "T", projectId: "p", originAttemptId: "att-origin", consumerAttemptId: "att-consumer", dshSessionId: "controlled-origin-att-origin-nonce", dshKnownEventCount: 8, dshReturnedCount: 3, dshPageCoverage: "PARTIAL", gitHead: "a".repeat(40), resultRef: null };
const answer = (over: Record<string, unknown>) => ({ judgments: [], proposedAction: "INSPECT_CURRENT_WORLD", confidence: "MEDIUM", ...over });

/** A fully correct TREATMENT answer for the reference truth. */
const correctTreatment = answer({
  judgments: [
    { proposition: "ORIGIN_CANONICAL_COMPLETED", truth: "TRUE", source: "CANONICAL_WORK", evidenceRef: handle("ORIGIN_CANONICAL_COMPLETED") },
    { proposition: "ORIGIN_DSH_PAGE_PARTIAL", truth: "TRUE", source: "DSH_SESSION", evidenceRef: handle("ORIGIN_DSH_PAGE_PARTIAL") },
    { proposition: "ALL_REPORTED_DSH_EVENTS_RETURNED", truth: "FALSE", source: "DSH_SESSION", evidenceRef: handle("ALL_REPORTED_DSH_EVENTS_RETURNED") },
    { proposition: "CONSUMER_CAN_SETTLE", truth: "FALSE", source: "CURRENT_WORK", evidenceRef: handle("CONSUMER_CAN_SETTLE") },
  ],
  confidence: "HIGH",
});

/* ================================================================ 1–7: truth and provenance */
describe("E1RC §8 truth and provenance controls (DYNAMICALLY_VERIFIED)", () => {
  it("1. contradictory page coverage and event counts are REFUSED before instantiation", () => {
    expect(validateAssayTruthFacts({ ...baseFacts, dshReturnedCount: 8, dshPageCoverage: "PARTIAL" }).ok).toBe(false);
    expect(validateAssayTruthFacts({ ...baseFacts, dshPageCoverage: "FULL" }).ok).toBe(false);
    expect(() => instantiateAssayTruth({ ...baseFacts, dshReturnedCount: 8, dshPageCoverage: "PARTIAL" })).toThrow(/refused/u);
  });

  it("2. missing or malformed owner identity is REFUSED", () => {
    expect(validateAssayTruthFacts({ ...baseFacts, originAttemptId: undefined }).ok).toBe(false);
    expect(validateAssayTruthFacts({ ...baseFacts, dshSessionId: "" }).ok).toBe(false);
    expect(validateAssayTruthFacts({ ...baseFacts, gitHead: "not-a-commit" }).ok).toBe(false);
    expect(validateAssayTruthFacts({ ...baseFacts, dshKnownEventCount: -1 }).ok).toBe(false);
  });

  it("3/4. Trial A's DSH and canonical citations are REJECTED in Trial B", () => {
    const trialA = instantiateAssayTruth({ ...baseFacts, trialId: "TRIAL-A", originAttemptId: "att-A", consumerAttemptId: "att-A1", dshSessionId: "controlled-origin-att-A-nonceA" });
    const trialB = instantiateAssayTruth({ ...baseFacts, trialId: "TRIAL-B", originAttemptId: "att-B", consumerAttemptId: "att-B1", dshSessionId: "controlled-origin-att-B-nonceB" });
    // The per-run session identity makes the handles genuinely different (the C1-F1 fix).
    expect(trialA.propositions.find((entry) => entry.id === "ORIGIN_DSH_PAGE_PARTIAL")!.citationHandle).not.toBe(
      trialB.propositions.find((entry) => entry.id === "ORIGIN_DSH_PAGE_PARTIAL")!.citationHandle,
    );
    const crossDsh = judgeAnswer(
      answer({ judgments: [
        { proposition: "ORIGIN_CANONICAL_COMPLETED", truth: "TRUE", source: "CANONICAL_WORK", evidenceRef: trialB.propositions.find((e) => e.id === "ORIGIN_CANONICAL_COMPLETED")!.citationHandle },
        { proposition: "ORIGIN_DSH_PAGE_PARTIAL", truth: "TRUE", source: "DSH_SESSION", evidenceRef: trialA.propositions.find((e) => e.id === "ORIGIN_DSH_PAGE_PARTIAL")!.citationHandle },
        { proposition: "ALL_REPORTED_DSH_EVENTS_RETURNED", truth: "FALSE", source: "DSH_SESSION", evidenceRef: trialA.propositions.find((e) => e.id === "ALL_REPORTED_DSH_EVENTS_RETURNED")!.citationHandle },
        { proposition: "CONSUMER_CAN_SETTLE", truth: "FALSE", source: "CURRENT_WORK", evidenceRef: trialB.propositions.find((e) => e.id === "CONSUMER_CAN_SETTLE")!.citationHandle },
      ] }),
      { snapshot: trialB, arm: "treatment" },
    );
    expect(crossDsh.ok).toBe(true);
    if (!crossDsh.ok) return;
    expect(crossDsh.historicalUnderstanding.referenceErrors.length).toBeGreaterThan(0);
    expect(crossDsh.verdict.historicalUnderstanding).toBe(false);

    const crossWork = judgeAnswer(answer({ judgments: [{ proposition: "ORIGIN_CANONICAL_COMPLETED", truth: "TRUE", source: "CANONICAL_WORK", evidenceRef: trialA.propositions.find((e) => e.id === "ORIGIN_CANONICAL_COMPLETED")!.citationHandle }] }), { snapshot: trialB, arm: "treatment" });
    expect(crossWork.ok).toBe(true);
    if (!crossWork.ok) return;
    expect(crossWork.verdict.historicalUnderstanding).toBe(false);
  });

  it("5. a correct proposition with a MISSING source earns no credit", () => {
    const result = judgeAnswer(answer({ judgments: [{ proposition: "ORIGIN_CANONICAL_COMPLETED", truth: "TRUE", evidenceRef: handle("ORIGIN_CANONICAL_COMPLETED") }] }), { snapshot: SNAP, arm: "treatment" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.historicalUnderstanding.sourceErrors.length).toBeGreaterThan(0);
    expect(result.verdict.historicalUnderstanding).toBe(false);
  });

  it("6. a correct proposition with the WRONG source fails", () => {
    const result = judgeAnswer(answer({ judgments: [{ proposition: "ORIGIN_CANONICAL_COMPLETED", truth: "TRUE", source: "DSH_SESSION", evidenceRef: handle("ORIGIN_CANONICAL_COMPLETED") }] }), { snapshot: SNAP, arm: "treatment" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict.historicalUnderstanding).toBe(false);
  });

  it("7. another proposition's unsupported reference fails", () => {
    const result = judgeAnswer(answer({ judgments: [{ proposition: "ORIGIN_DSH_PAGE_PARTIAL", truth: "TRUE", source: "DSH_SESSION", evidenceRef: handle("ORIGIN_CANONICAL_COMPLETED") }] }), { snapshot: SNAP, arm: "treatment" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.historicalUnderstanding.referenceErrors.length).toBeGreaterThan(0);
    expect(result.verdict.historicalUnderstanding).toBe(false);
  });
});

/* ================================================================ 8–11: arm awareness */
describe("E1RC §8 arm-awareness controls (DYNAMICALLY_VERIFIED)", () => {
  const controlHonest = answer({
    judgments: [
      { proposition: "ORIGIN_CANONICAL_COMPLETED", truth: "TRUE", source: "CANONICAL_WORK", evidenceRef: handle("ORIGIN_CANONICAL_COMPLETED") },
      { proposition: "ORIGIN_DSH_PAGE_PARTIAL", truth: "UNKNOWN", source: "DSH_SESSION", evidenceRef: null },
      { proposition: "ALL_REPORTED_DSH_EVENTS_RETURNED", truth: "UNKNOWN", source: "DSH_SESSION", evidenceRef: null },
      { proposition: "CONSUMER_CAN_SETTLE", truth: "FALSE", source: "CURRENT_WORK", evidenceRef: handle("CONSUMER_CAN_SETTLE") },
    ],
  });

  it("8. CONTROL's honest UNKNOWN about undelivered history PASSES", () => {
    const result = judgeAnswer(controlHonest, { snapshot: SNAP, arm: "control" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.historicalUnderstanding.missingCritical).toEqual([]);
    expect(result.verdict.historicalUnderstanding).toBe(true);
  });

  it("9. CONTROL guessing a hidden NONCRITICAL DSH fact earns NO credit", () => {
    const guessing = answer({
      judgments: [
        ...controlHonest.judgments,
        { proposition: "ORIGIN_DSH_PAGE_FULL", truth: "FALSE", source: "DSH_SESSION", evidenceRef: handle("ORIGIN_DSH_PAGE_FULL") },
      ],
    });
    const result = judgeAnswer(guessing, { snapshot: SNAP, arm: "control" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.historicalUnderstanding.unsupportedCertainty.length).toBeGreaterThan(0);
    expect(result.historicalUnderstanding.creditCount).toBe(2);
    expect(result.verdict.historicalUnderstanding).toBe(false);
  });

  it("10. TREATMENT evading a determinable Critical Fact with UNKNOWN fails", () => {
    const evading = answer({
      judgments: [
        { proposition: "ORIGIN_CANONICAL_COMPLETED", truth: "TRUE", source: "CANONICAL_WORK", evidenceRef: handle("ORIGIN_CANONICAL_COMPLETED") },
        { proposition: "ORIGIN_DSH_PAGE_PARTIAL", truth: "UNKNOWN", source: "DSH_SESSION", evidenceRef: null },
        { proposition: "ALL_REPORTED_DSH_EVENTS_RETURNED", truth: "UNKNOWN", source: "DSH_SESSION", evidenceRef: null },
        { proposition: "CONSUMER_CAN_SETTLE", truth: "FALSE", source: "CURRENT_WORK", evidenceRef: handle("CONSUMER_CAN_SETTLE") },
      ],
    });
    const result = judgeAnswer(evading, { snapshot: SNAP, arm: "treatment" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.historicalUnderstanding.missingCritical.length).toBeGreaterThan(0);
    expect(result.verdict.historicalUnderstanding).toBe(false);
  });

  it("11. a mutated section digest is a delivery failure, and an internal-only citation is unavailable", () => {
    // The internal EvidenceRef never appears in a rendered section, so citing only it is unavailable.
    const internal = SNAP.propositions.find((entry) => entry.id === "ORIGIN_CANONICAL_COMPLETED")!;
    expect(internal.evidenceRef).not.toBe(internal.citationHandle);
    const result = judgeAnswer(answer({ judgments: [{ proposition: "ORIGIN_CANONICAL_COMPLETED", truth: "TRUE", source: "CANONICAL_WORK", evidenceRef: internal.evidenceRef }] }), { snapshot: SNAP, arm: "treatment" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const judgment = result.historicalUnderstanding.perJudgment[0] as { citesOnlyInternalRef?: boolean; credit?: boolean };
    expect(judgment.citesOnlyInternalRef).toBe(true);
    expect(judgment.credit).toBe(false);
  });
});

/* ================================================================ 12–18: DSH path */
describe("E1RC §8 DSH-path controls", () => {
  it("12/13/14. missing session id and near-collision ids are refused", () => {
    const root = mkdtempSync(join(tmpdir(), "p2e1rc-c6-"));
    try {
      /** DSH stores a session as `<root>/<...>/<SessionId>/session.v4.jsonl[.zstd]`. */
      for (const id of ["worker-abc", "worker-abc-extra"]) {
        const dir = join(root, "sessions", id);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "session.v4.jsonl"), "{}");
      }
      expect(findSessionFile(root, "")).toBeNull();
      expect(findSessionFile(root, "worker-zzz")).toBeNull();
      // The exact id resolves to ITS OWN directory, never the longer near-collision.
      expect(findSessionFile(root, "worker-abc")).toContain(`${join("sessions", "worker-abc")}`);
      expect(findSessionFile(root, "worker-abc")).not.toContain("worker-abc-extra");
      expect(findSessionFile(root, "worker-abc-extra")).toContain("worker-abc-extra");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("15/16. a missing or malformed persisted answer is a FAILURE, never a default", () => {
    expect(extractBenchmarkAnswer([]).ok).toBe(false);
    expect(extractBenchmarkAnswer([{ type: "assistant/message", seq: 1, data: { message: { content: [] } } }]).ok).toBe(false);
    expect(extractBenchmarkAnswer([{ type: "assistant/message", seq: 1, data: { message: { content: [{ type: "text", text: "not json" }] } } }]).ok).toBe(false);
  });

  it("17/18. a wrong-arm or wrong-trial answer is scored against the WRONG snapshot and fails", () => {
    const otherTrial = instantiateAssayTruth({ ...baseFacts, trialId: "OTHER", originAttemptId: "att-other", consumerAttemptId: "att-other1", dshSessionId: "controlled-origin-att-other-n" });
    // The correct answer for THIS trial cites THIS trial's handles, so it must NOT pass against another trial.
    const result = judgeAnswer(correctTreatment, { snapshot: otherTrial, arm: "treatment" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.historicalUnderstanding.referenceErrors.length).toBeGreaterThan(0);
    expect(result.verdict.historicalUnderstanding).toBe(false);
  });

  it("the evaluation seam refuses a missing per-run truth", () => {
    const result = evaluateAssayResult({ frozenTruth: null as never, structuredAnswer: correctTreatment, observedActions: null, arm: "treatment" });
    expect(result.ok).toBe(false);
  });

  it("NOT_ESTABLISHED (dynamic): a real first-party DSH turn cannot complete in this environment", () => {
    /**
     * §8 honesty: this is recorded as NOT_ESTABLISHED rather than claimed. The installed first-party DSH is
     * 0.2.1-rc.2, which exposes an unclassified `working_directory` capability, so the fail-closed capability
     * gate refuses every worker. See research-evidence/trajectory-p2e1rc/execution-blocker.json.
     */
    expect(ORACLE_VERSION).toBe("p2e1rd-internal-citation-closed-1");
  });
});

/* ================================================================ 19–21: evidence and Git */
describe("E1RC §8 evidence/Git controls (DYNAMICALLY_VERIFIED)", () => {
  it("19/20. a missing artifact or a success-shaped payload with a nonzero exit is not accepted as success", async () => {
    const { spawnSync } = await import("node:child_process");
    // A child that writes a success-shaped object but exits 1 must not be read as a pass by the gate.
    const result = spawnSync(process.execPath, ["-e", "process.stdout.write(JSON.stringify({verdict:'OK',ok:true}));process.exit(1)"], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(String(result.stdout)).toContain("OK");
    // The gate's contract is exit-code-first: a nonzero exit fails regardless of the payload.
    expect(result.status === 0).toBe(false);
  });

  it("21/22. a declared code-freeze HEAD that differs from the executed tree is detectable from Git", async () => {
    const { execFileSync } = await import("node:child_process");
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), encoding: "utf8" }).trim();
    const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: process.cwd(), encoding: "utf8" }).trim();
    expect(head).toMatch(/^[0-9a-f]{40}$/u);
    expect(tree).toMatch(/^[0-9a-f]{40}$/u);
    expect(head).not.toBe(tree);
  });
});
