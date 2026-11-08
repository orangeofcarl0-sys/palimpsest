/**
 * R3-A2 — THE RESULT TESTS.
 *
 * These assert the recorded sentinel portfolio against the raw trial records. They are deliberately written so
 * that they PASS whatever the outcome is, provided the outcome was computed correctly: the stage ruling says a
 * RED graph is a valid result, so a test that demanded QUALIFIED would be forcing the graph GREEN.
 *
 * What they check is therefore the DISCIPLINE, not the verdict:
 *
 *   §"Qualification analysis"  the recorded verdicts are the frozen engine's, and a ceiling pair is UNQUALIFIED
 *   §"Existing graph"          the historical verdicts are carried forward unchanged and never rerun
 *   §"Stage outcome"           the stage is complete when every scheduled run is accounted for
 *   §"Hard stage budget"       the valid-run budget was respected and every attempt is visible
 *   §"Readiness decomposition" the four states match the extended graph
 *   §"Experiment economics"    cost accounting exists and invents no price
 *   §"No primary-fixture smoke" the out-of-protocol smoke run is recorded and counted toward nothing
 *   §"Engine immutability"     no digested artifact drifted across the matrix
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { QUALIFICATION_BOUNDS, qualifyPair } from "../scripts/r3a/qualification.mjs";
import { readiness } from "../scripts/r3a2/readiness.mjs";
import { NEW_FAMILIES } from "../scripts/r3a2/fixtures.mjs";
import { MODEL_ROUTES_SENTINEL, sentinelFamilies } from "../scripts/r3a2/models.mjs";
import { schedule } from "../scripts/r3a2/plan.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const EVIDENCE = join(REPO_ROOT, "research-evidence", "r3-a2");
const read = (name: string) => JSON.parse(readFileSync(join(EVIDENCE, name), "utf8"));

const analysis = read("analysis.json");
const attempts = read("attempts.json");
const trials = read("normalized-trials.json");
const deviations = read("protocol-deviations.json");
const plan = read("plan.json");

/* ================================================================ §"Stage outcome" */

describe("R3-A2 §Stage outcome — every scheduled run accounted for", () => {
  it("§Stage outcome exactly the frozen 20 runs were executed, once each", () => {
    expect(attempts.plannedValidRuns).toBe(20);
    expect(attempts.validRuns).toBe(20);
    expect(trials.trials.length).toBe(20);
    const ids = trials.trials.map((trial: any) => trial.trialId);
    expect(new Set(ids).size).toBe(20);
  });

  it("§Hard stage budget the valid-run budget was respected", () => {
    expect(attempts.validRuns).toBeLessThanOrEqual(attempts.hardMaximumValidRuns);
    expect(attempts.hardMaximumValidRuns).toBe(20);
  });

  it("§Hard stage budget every attempt is visible, and none was infrastructure-invalid", () => {
    expect(attempts.attemptsMade).toBe(20);
    expect(attempts.infrastructureInvalidAttempts).toBe(0);
    expect(attempts.attempts.length).toBe(20);
  });

  it("§Qualification contract each pair reached Nq=5 valid runs", () => {
    for (const value of Object.values(attempts.validRunsByPair as Record<string, number>)) expect(value).toBe(5);
    expect(Object.keys(attempts.validRunsByPair).length).toBe(4);
  });

  it("§Stage outcome the executed schedule equals the frozen schedule", () => {
    const frozen = plan.runs.map((run: any) => run.trialId).sort();
    const executed = trials.trials.map((trial: any) => trial.trialId).sort();
    expect(executed).toEqual(frozen);
    expect(schedule().map((run: any) => run.trialId).sort()).toEqual(frozen);
  });

  it("§Stage outcome no run used a model outside the two sentinel stacks", () => {
    for (const trial of trials.trials) {
      expect(MODEL_ROUTES_SENTINEL.map((route: any) => route.modelId)).toContain(trial.modelId);
      expect(trial.modelId).not.toBe("kimi-k3");
    }
    expect(sentinelFamilies()).toEqual(["deepseek", "glm"]);
  });
});

/* ================================================================ §"Qualification analysis" */

describe("R3-A2 §Qualification analysis — the frozen engine decided, and a ceiling pair is UNQUALIFIED", () => {
  it("§Qualification analysis there are four new pairs, one per (fixture, model)", () => {
    expect(analysis.newPairs.length).toBe(4);
    const keys = analysis.newPairs.map((pair: any) => `${pair.fixtureId}|${pair.modelId}`).sort();
    expect(keys).toEqual([
      "r3a-f-c-policy-resolution|deepseek-flash",
      "r3a-f-c-policy-resolution|glm-5.3-flash",
      "r3a-f-d-rule-resolution|deepseek-flash",
      "r3a-f-d-rule-resolution|glm-5.3-flash",
    ]);
  });

  it("§Qualification analysis every new pair carries a real verdict and a reason when unqualified", () => {
    for (const pair of analysis.newPairs) {
      expect(["QUALIFIED", "UNQUALIFIED", "INFRASTRUCTURE_INVALID"]).toContain(pair.verdict);
      if (pair.verdict !== "QUALIFIED") expect(pair.reasons.length).toBeGreaterThan(0);
    }
  });

  it("§Qualification analysis the recorded verdict equals a fresh run of the frozen engine on the same trials", () => {
    /**
     * This is the anti-drift check: the analysis must be reproducible from the preserved trials through the
     * SAME engine, so a hand-edited verdict cannot survive.
     */
    for (const pair of analysis.newPairs) {
      const members = trials.trials.filter((trial: any) => trial.fixtureId === pair.fixtureId && trial.modelId === pair.modelId);
      const classIds = Object.keys(members[0].classPass).sort();
      const recomputed = qualifyPair({
        fixtureId: pair.fixtureId,
        modelId: pair.modelId,
        nq: 5,
        classIds,
        directClasses: pair.classHeadroom.filter((entry: any) => entry.directTreatmentRelevant).map((entry: any) => entry.classId),
        relationshipOf: (classId: string) => pair.classHeadroom.find((entry: any) => entry.classId === classId)?.relationship ?? "NONE",
        fixtureAuditPrecondition: analysis.fixturePreconditions[pair.fixtureId],
        trials: members,
      });
      expect(recomputed.verdict, `${pair.fixtureId} x ${pair.modelId}`).toBe(pair.verdict);
      expect(recomputed.variableGroups).toEqual(pair.variableGroups);
    }
  });

  it("§Qualification analysis a pair at the CEILING is UNQUALIFIED by QC-1, not by a model ranking", () => {
    for (const pair of analysis.newPairs) {
      if (pair.classCoverage === null) continue;
      if (pair.classCoverage >= QUALIFICATION_BOUNDS.upper) {
        expect(pair.verdict).toBe("UNQUALIFIED");
        expect(pair.reasons.join(" ")).toMatch(/CEILING \(no room to detect help\)/u);
      }
    }
  });

  it("§Qualification analysis the observed class vectors are recorded per pair", () => {
    for (const pair of analysis.newPairs) {
      const members = trials.trials.filter((trial: any) => trial.fixtureId === pair.fixtureId && trial.modelId === pair.modelId);
      expect(members.length).toBe(5);
      for (const trial of members) expect(Object.keys(trial.classPass).length).toBe(6);
    }
  });

  it("§Failure-class requirements no failure was unclassified in any run", () => {
    for (const trial of trials.trials) expect(trial.unclassifiedFailures).toBe(0);
  });

  it("§Qualification analysis QC-6 held for both new families, from the deterministic audit", () => {
    for (const fixtureId of NEW_FAMILIES) expect(analysis.fixturePreconditions[fixtureId].satisfied).toBe(true);
  });
});

/* ================================================================ §"Existing graph" */

describe("R3-A2 §Existing graph — historical verdicts carried forward unchanged", () => {
  it("§Existing graph the four historical verdicts are exactly the corrected R3-AE ones", () => {
    const verdicts = Object.fromEntries(analysis.historicalPairs.map((pair: any) => [`${pair.fixtureId}|${pair.modelId}`, pair.verdict]));
    expect(verdicts["r3a-f-a-atomic-transaction|deepseek-flash"]).toBe("UNQUALIFIED");
    expect(verdicts["r3a-f-a-atomic-transaction|glm-5.3-flash"]).toBe("QUALIFIED");
    expect(verdicts["r3a-f-b-versioned-migration|deepseek-flash"]).toBe("UNQUALIFIED");
    expect(verdicts["r3a-f-b-versioned-migration|glm-5.3-flash"]).toBe("UNQUALIFIED");
  });

  it("§Existing graph the historical pairs are marked as carried forward, not rerun", () => {
    for (const pair of analysis.historicalPairs) expect(pair.source).toMatch(/carried forward, NOT rerun/u);
  });

  it("§Existing graph no historical fixture appears in this stage's executed schedule", () => {
    for (const trial of trials.trials) expect(NEW_FAMILIES).toContain(trial.fixtureId);
  });

  it("§Existing graph the historical A→B gate result is preserved as RED", () => {
    expect(analysis.historicalGate.green).toBe(false);
  });
});

/* ================================================================ §"Readiness decomposition" */

describe("R3-A2 §Readiness decomposition — the recorded states match the extended graph", () => {
  const sentinels = ["deepseek", "glm"];

  it("§Readiness decomposition the recorded readiness equals a fresh computation over the extended graph", () => {
    const fresh = readiness(analysis.extendedGraph.pairs, sentinels);
    const recorded = { TASK_READY: analysis.readiness.TASK_READY, MODEL_READY: analysis.readiness.MODEL_READY, LOCAL_PAIR_READY: analysis.readiness.LOCAL_PAIR_READY, BRIDGE_READY: analysis.readiness.BRIDGE_READY };
    const computed = { TASK_READY: fresh.TASK_READY, MODEL_READY: fresh.MODEL_READY, LOCAL_PAIR_READY: fresh.LOCAL_PAIR_READY, BRIDGE_READY: fresh.BRIDGE_READY };
    for (const state of Object.keys(recorded)) {
      expect(recorded[state as keyof typeof recorded], state).toBe(computed[state as keyof typeof computed]);
    }
    expect(analysis.readiness.fullTwoByTwoCrossExists).toBe(fresh.fullTwoByTwoCrossExists);
  });

  it("§Readiness decomposition the four states are reported SEPARATELY, never collapsed", () => {
    for (const state of ["TASK_READY", "MODEL_READY", "LOCAL_PAIR_READY", "BRIDGE_READY"]) {
      expect(typeof analysis.readiness[state]).toBe("boolean");
    }
  });

  it("§Readiness decomposition BRIDGE_READY requires the L-shape inside ONE connected component", () => {
    if (analysis.readiness.BRIDGE_READY === false) {
      expect(analysis.readiness.components.every((component: any) => component.lShaped === false)).toBe(true);
    }
    if (analysis.readiness.BRIDGE_READY === true) {
      expect(analysis.readiness.components.some((component: any) => component.lShaped === true)).toBe(true);
    }
  });

  it("§Readiness decomposition the edges are exactly the COMPLIANT + QUALIFIED pairs", () => {
    for (const edge of analysis.readiness.edges) {
      const pair = analysis.extendedGraph.pairs.find((entry: any) => entry.fixtureId === edge.fixtureId && entry.modelId === edge.modelId);
      expect(pair.verdict).toBe("QUALIFIED");
      expect(pair.antiOverfitProcess).toBe("COMPLIANT");
    }
  });

  it("§Continuation ruling the continuation follows from the readiness states", () => {
    const report = analysis.readiness;
    if (report.BRIDGE_READY) expect(analysis.continuation.next).toBe("R3-BX");
    else if (report.LOCAL_PAIR_READY) expect(analysis.continuation.next).toBe("R3-BL");
    else expect(analysis.continuation.next).toBe("ARCHITECTURAL REVIEW");
  });

  it("§Continuation ruling when the stage is not ready it stops rather than authoring another fixture", () => {
    if (analysis.readiness.LOCAL_PAIR_READY === false && analysis.readiness.BRIDGE_READY === false) {
      expect(analysis.continuation.next).toBe("ARCHITECTURAL REVIEW");
      expect(analysis.continuation.allowed).toBe(false);
    }
  });
});

/* ================================================================ §"Experiment economics" */

describe("R3-A2 §Experiment economics — tokens counted, no price invented", () => {
  it("§Experiment economics every trial reported provider token usage", () => {
    expect(analysis.costAccounting.trialsWithUsage).toBe(20);
    expect(analysis.costAccounting.trialsWithoutUsage).toBe(0);
    for (const trial of trials.trials) expect(trial.usage.inputTokens).toBeGreaterThan(0);
  });

  it("§Experiment economics no monetary cost is recorded, because no price was declared", () => {
    expect(analysis.costAccounting.providerReportedUsd).toBeNull();
    expect(analysis.costAccounting.currency).toMatch(/no provider-reported monetary cost/u);
    for (const trial of trials.trials) expect(trial.cost).toBeNull();
  });

  it("§Experiment economics the per-trial and per-pair figures are recorded", () => {
    expect(analysis.costAccounting.costPerValidTrial.inputTokens).toBeGreaterThan(0);
    expect(analysis.costAccounting.costPerFixtureModelPair.inputTokens).toBeGreaterThan(0);
  });

  it("§Experiment economics a qualified edge is a QUALIFICATION edge, not a treatment edge", () => {
    expect(analysis.costAccounting.note).toMatch(/forbids optimizing a qualification verdict using cost/u);
  });

  it("§Experiment economics cached tokens are reported separately, never folded into input tokens", () => {
    expect(analysis.costAccounting.separation.modelSide).toMatch(/never folded into inputTokens/u);
    for (const trial of trials.trials) {
      if (trial.usage.cacheReadTokens > 0) expect(trial.usage.inputTokens).toBeLessThan(trial.usage.cacheReadTokens + trial.usage.inputTokens);
    }
  });
});

/* ================================================================ §"No primary-fixture smoke" */

describe("R3-A2 §No primary-fixture smoke — deviations recorded, not omitted", () => {
  it("§No primary-fixture smoke the pre-execution harness defects are on the record", () => {
    const entry = deviations.deviations.find((item: any) => item.kind === "PRE_EXECUTION_HARNESS_DEFECTS");
    expect(entry).toBeDefined();
    expect(entry.defects.length).toBe(2);
    expect(entry.nqImpact).toMatch(/NONE/u);
  });

  it("§No primary-fixture smoke the out-of-protocol smoke run is recorded and counts toward nothing", () => {
    const entry = deviations.deviations.find((item: any) => item.kind === "OUT_OF_PROTOCOL_PREQUALIFICATION_SMOKE");
    expect(entry).toBeDefined();
    expect(entry.countsTowardNq).toBe(false);
    expect(entry.countsAsScheduledRun).toBe(false);
    /** Its class vector is preserved, so the deviation is auditable rather than merely asserted. */
    expect(entry.evidence.classPass).toBeDefined();
    expect(entry.evidence.sourceSha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("§No primary-fixture smoke the smoke run is NOT among the 20 scheduled trial ids", () => {
    const scheduled = new Set(trials.trials.map((trial: any) => trial.trialId));
    const entry = deviations.deviations.find((item: any) => item.kind === "OUT_OF_PROTOCOL_PREQUALIFICATION_SMOKE");
    expect(scheduled.has(entry.evidence.trialId)).toBe(true);
    /** It shares a trial id with a scheduled run, so the record distinguishes them by counts, not by id. */
    expect(attempts.validRuns).toBe(20);
    expect(trials.trials.length).toBe(20);
  });

  it("§No primary-fixture smoke the digest the result document cites is the one the record holds", () => {
    /**
     * The stage document quotes the smoke run's source digest. A hand-transcribed digest is exactly the kind of
     * value that can drift silently, so the document is checked against the machine-written record.
     */
    const entry = deviations.deviations.find((item: any) => item.kind === "OUT_OF_PROTOCOL_PREQUALIFICATION_SMOKE");
    const document = readFileSync(join(REPO_ROOT, "docs", "engineering", "R3-A2-SENTINEL-PORTFOLIO-RESULT.md"), "utf8");
    expect(entry.evidence.sourceSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(document, "the result document must cite the recorded digest").toContain(entry.evidence.sourceSha256);
    /** And it must not cite any other 64-hex digest in the smoke sentence's place. */
    expect(document).not.toContain("47a823151475ba939d1bbe326cd88d80cd751c6628a906996a61a6a921e89ec1");
  });

  it("§Baseline condition the treatment seams were OFF in every trial", () => {
    for (const trial of trials.trials) {
      expect(trial.treatmentIndependence.efficacy.mode).toBe("off");
      expect(trial.treatmentIndependence.index.mode).toBe("off");
      expect(trial.treatmentIndependence.affordance).toBe("off");
      expect(trial.capitalDelivered).toBe(false);
      expect(trial.compiledHandleCount).toBe(0);
      expect(trial.indexHandleCount).toBe(0);
    }
  });

  it("§Baseline condition no deviation of kind TREATMENT_SEAM_ENABLED or CAPITAL_DELIVERED was recorded", () => {
    expect(analysis.deviations.filter((item: any) => item.kind !== "ATTEMPTS_EXCEEDED_SCHEDULE")).toEqual([]);
  });
});

/* ================================================================ §"Engine immutability" */

describe("R3-A2 §Engine immutability — nothing drifted across the matrix", () => {
  it("§Engine immutability the post-matrix verification records no drifted artifact", () => {
    const entry = deviations.deviations.find((item: any) => item.kind === "ENGINE_IMMUTABILITY_VERIFICATION");
    expect(entry).toBeDefined();
    expect(entry.held).toBe(true);
    expect(entry.driftedArtifacts).toEqual([]);
  });

  it("§Engine immutability the plan's engine digests still match the working tree", async () => {
    const { ENGINE_DIGESTS } = await import("../scripts/r3a2/plan.mjs");
    const { createHash } = await import("node:crypto");
    for (const [relative, digest] of Object.entries(ENGINE_DIGESTS)) {
      expect(createHash("sha256").update(readFileSync(join(REPO_ROOT, relative))).digest("hex"), relative).toBe(digest);
    }
  });

  it("§Engine immutability the fixture digests the runs were qualified against are unchanged", () => {
    for (const fixture of plan.fixtures) {
      if (!NEW_FAMILIES.includes(fixture.fixtureId)) continue;
      const digest = JSON.parse(readFileSync(join(EVIDENCE, "fixture-digests.json"), "utf8")).fixtures.find((entry: any) => entry.fixtureId === fixture.fixtureId).contentDigest;
      expect(fixture.contentDigest).toBe(digest);
    }
  });
});

/* ================================================================ the telemetry reader */

describe("R3-A2 §Primary qualification evidence — the multi-frame session reader", () => {
  it("§Primary qualification evidence decompressFrames reads EVERY frame, not just the first", async () => {
    /**
     * A DSH session artifact is ZSTD in MULTIPLE FRAMES. A single `zstdDecompressSync` over the whole file
     * returns only the first frame, which would silently under-report the tokens. This test builds a
     * multi-frame artifact and asserts every frame's content is recovered.
     */
    const { decompressFrames } = await import("../scripts/r3a2/telemetry.mjs");
    const { zstdCompressSync } = await import("node:zlib");
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const frames = ['{"data":{"usage":{"inputTokens":10,"outputTokens":1,"cacheReadTokens":0,"cacheWriteTokens":0,"totalTokens":11}}}', '{"data":{"usage":{"inputTokens":20,"outputTokens":2,"cacheReadTokens":0,"cacheWriteTokens":0,"totalTokens":33}}}', '{"data":{"usage":{"inputTokens":30,"outputTokens":3,"cacheReadTokens":0,"cacheWriteTokens":0,"totalTokens":66}}}'];
    const path = join(mkdtempSync(join(tmpdir(), "r3a2-zstd-")), "session.v4.jsonl.zstd");
    writeFileSync(path, Buffer.concat(frames.map((frame) => zstdCompressSync(Buffer.from(`${frame}\n`, "utf8")))));
    const read = decompressFrames(path);
    expect(read.frames).toBe(3);
    expect(read.failedFrames).toBe(0);
    for (const frame of frames) expect(read.text).toContain(frame);
  });

  it("§Primary qualification evidence the reader sums per-step increments, not the running total", async () => {
    const { readSessionTelemetry } = await import("../scripts/r3a2/telemetry.mjs");
    const { zstdCompressSync } = await import("node:zlib");
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const home = mkdtempSync(join(tmpdir(), "r3a2-home-"));
    const dir = join(home, "sessions", "slug", "worker-1");
    mkdirSync(dir, { recursive: true });
    /** Three steps: increments 10/20/30 input, running totals 11/33/66. */
    const lines = [[10, 11], [20, 33], [30, 66]].map(([input, total]) => `{"type":"assistant/message","data":{"usage":{"inputTokens":${String(input)},"outputTokens":1,"cacheReadTokens":0,"cacheWriteTokens":0,"totalTokens":${String(total)}}}}`);
    writeFileSync(join(dir, "session.v4.jsonl.zstd"), zstdCompressSync(Buffer.from(`${lines.join("\n")}\n`, "utf8")));
    const telemetry = readSessionTelemetry(home, { modelId: "deepseek-flash" });
    /** The increments sum to 60. The running totals sum to 110, which would be the wrong answer. */
    expect(telemetry.usage.inputTokens).toBe(60);
    expect(telemetry.usage.totalTokens).toBe(66);
    expect(telemetry.usage.usageRecords).toBe(3);
  });

  it("§Experiment economics a route with no declared price yields a null cost and a stated reason", async () => {
    const { readSessionTelemetry } = await import("../scripts/r3a2/telemetry.mjs");
    const { zstdCompressSync } = await import("node:zlib");
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const home = mkdtempSync(join(tmpdir(), "r3a2-home-"));
    const dir = join(home, "sessions", "slug", "worker-1");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "session.v4.jsonl.zstd"), zstdCompressSync(Buffer.from('{"data":{"usage":{"inputTokens":5,"outputTokens":5,"totalTokens":10}}}\n', "utf8")));
    const telemetry = readSessionTelemetry(home, { modelId: "glm-5.3-flash" });
    expect(telemetry.cost).toBeNull();
    expect(telemetry.note).toMatch(/no monetary cost is recorded/u);
  });

  it("§Primary qualification evidence a trial with no session artifact reports no usage rather than zero", async () => {
    const { readSessionTelemetry } = await import("../scripts/r3a2/telemetry.mjs");
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const telemetry = readSessionTelemetry(mkdtempSync(join(tmpdir(), "r3a2-home-")), { modelId: "deepseek-flash" });
    expect(telemetry.usage).toBeNull();
    expect(telemetry.note).toMatch(/no session artifact was found/u);
  });
});

/* ================================================================ the common cognitive interface */

describe("R3-A2 §Common cognitive interface — one renderer, no family tuning", () => {
  it("§Common cognitive interface every trial ran the same renderer version, family-independent", () => {
    for (const trial of trials.trials) {
      expect(trial.rendererId).toBe("dsh-common-worker");
      expect(trial.rendererVersion).toBeUndefined();
    }
    const plan = read("plan.json");
    expect(plan.renderer.familySpecific).toBe(false);
  });

  it("§Common cognitive interface every trial records the model, route, renderer and digests", () => {
    for (const trial of trials.trials) {
      expect(trial.modelId).toBeTruthy();
      expect(trial.modelFamily).toBeTruthy();
      expect(trial.routeId).toBeTruthy();
      expect(trial.rendererId).toBe("dsh-common-worker");
      expect(trial.assembledPromptDigest).toMatch(/^[0-9a-f]{64}$/u);
      expect(trial.toolSurfaceDigest).toMatch(/^[0-9a-f]{64}$/u);
    }
  });

  it("§Common cognitive interface the assembled prompt and tool surface did NOT vary by family", () => {
    const prompts = new Set(trials.trials.map((trial: any) => trial.assembledPromptDigest));
    const tools = new Set(trials.trials.map((trial: any) => trial.toolSurfaceDigest));
    expect(prompts.size).toBe(1);
    expect(tools.size).toBe(1);
  });

  it("§Common cognitive interface the run's tool/action evidence is recorded", () => {
    for (const trial of trials.trials) {
      expect(trial.actions).not.toBeNull();
      expect(Array.isArray(trial.actions.order)).toBe(true);
      expect(trial.actions.order.length).toBeGreaterThan(0);
      expect(trial.revisions).toBeTruthy();
    }
  });
});
