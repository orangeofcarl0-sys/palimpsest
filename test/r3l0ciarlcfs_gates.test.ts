/**
 * R3-L0C-I-A-R-L-C-F-S §3-§12 — THE CORRECTED-PATH GATES.
 *
 * These tests assert the properties the §2 controls measured the baseline VIOLATING. Each calls the real corrected
 * function, and the authoritative-path tests drive the ACTUAL entry rather than a standalone helper.
 *
 * §10: the tests are classified T1 (primitive), T2 (integration) and T3 (authoritative path). No test here adds a
 * sixteen-session matrix for a helper: the ONE authoritative matrix is the qualification's own, and the field-level
 * controls use small isolated journals and real disposable directories.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { BASELINE_COMMIT, PLAN_ID, PLAN_IDENTITY_CHECKS, IDENTITY_STATES, ARTIFACT_VALIDITY_STATES, LEGACY_HELPER_QUARANTINE, EVIDENCE_GAPS } from "../scripts/r3l0ciarlcfs/contract.mjs";
import {
  readAndVerifyCommittedPlan,
  sealCrossArtifactPlanIdentity,
  committedBlobHash,
  worktreeBlobHash,
  constructCandidatePlan,
} from "../scripts/r3l0ciarlcfs/committed-plan.mjs";
import { destroyDisposableCheckout, createDisposableCheckout, realFilesystemAdapter, classifyEntry } from "../scripts/r3l0ciarlcfs/safe-cleanup.mjs";
import { reconcileTrialIdentity, reconcileTrialEvidence } from "../scripts/r3l0ciarlcfs/trial-identity.mjs";
import { validateArtifactEnvelope, measureValidatedArtifact } from "../scripts/r3l0ciarlcfs/artifact-validity.mjs";
import { reduceAuthorizationVerdict } from "../scripts/r3l0ciarlcfs/authorization-verdict.mjs";
import { assertCommittedPlanIdentity, assertAuthoritativePath } from "../scripts/r3l0ciarlcfs/modes.mjs";
import { computeExecutionClosure, proveClosureMutations } from "../scripts/r3l0ciarlcfs/closure.mjs";
import { buildErratum } from "../scripts/r3l0ciarlcfs/erratum.mjs";
import { buildProspectivePlan } from "../scripts/r3l0ciarlcfs/prospective-plan.mjs";
import { writeArtifact } from "../scripts/r3l0ciarlcfs/acceptance.mjs";

const EVIDENCE = "research-evidence/r3-l0c-iar-lcfs";

/* ================================================================ T1: committed-plan identity */

describe("R3-L0C-I-A-R-L-C-F-S §3 T1 — committed-plan identity", () => {
  it("binds the exact baseline and the new plan identity", () => {
    expect(BASELINE_COMMIT).toBe("8bf8d42298aee3b8b267b3793e015900ca7cc2a7");
    expect(PLAN_ID).toBe("r3-l0c-iar-lcfs-primary-plan");
    expect(PLAN_IDENTITY_CHECKS).toHaveLength(6);
  });

  it("reads the committed plan repeatedly without changing its bytes or digest", async () => {
    const first = await readAndVerifyCommittedPlan({ verifyCompiled: false });
    const second = await readAndVerifyCommittedPlan({ verifyCompiled: false });
    expect(first.exists).toBe(true);
    expect(first.planContentDigest).toBe(second.planContentDigest);
    expect(first.committedBlob).toBe(second.committedBlob);
    expect(first.regenerated).toBe(false);
    expect(first.constructedHere).toBe(false);
  });

  it("reports the four identity facts separately", async () => {
    const verification = await readAndVerifyCommittedPlan({ verifyCompiled: false });
    expect(verification.checks.COMMITTED_PLAN_SELF_DIGEST).toBe("MATCH");
    expect(verification.checks.COMMITTED_PLAN_GIT_IDENTITY).toBe("MATCH");
    expect(verification.checks.PLAN_SCHEMA_AND_ID).toBe("PASS");
    expect(verification.checks.PLAN_CLOSURE_BINDING).toBe("MATCH");
    expect(verification.gitLevelReproducibilityOnly).toBe(true);
    expect(verification.claimsCryptographicSignature).toBe(false);
  });

  it("proves the worktree bytes equal the committed blob by blob-hash equality", () => {
    expect(committedBlobHash(`${EVIDENCE}/execution-plan.json`)).toBe(worktreeBlobHash(`${EVIDENCE}/execution-plan.json`));
  });

  it("marks a constructed plan as a candidate, never as authoritative evidence", async () => {
    const candidate = await constructCandidatePlan({ verifyCompiled: false });
    expect(candidate.CANDIDATE_ONLY).toBe(true);
    expect(candidate.isAuthoritativeEvidence).toBe(false);
    expect(candidate.regeneratesFrozenAt).toBe(true);
  });

  it("does not invoke plan regeneration while verifying", async () => {
    const verification = await readAndVerifyCommittedPlan({ verifyCompiled: false });
    const candidate = await constructCandidatePlan({ verifyCompiled: false });
    /** The committed plan's digest is stable; a rebuilt candidate's is not, which is exactly why consumption is separate. */
    expect(verification.planContentDigest).toBe(verification.recomputedPlanContentDigest);
    expect(candidate.plan.planContentDigest).not.toBe(verification.planContentDigest);
  });
});

/* ================================================================ T2: cross-artifact seal */

describe("R3-L0C-I-A-R-L-C-F-S §3 T2 — the cross-artifact seal", () => {
  it("detects a modified frozenAt", async () => {
    const verification = await readAndVerifyCommittedPlan({ verifyCompiled: false });
    const { fullPlanDigest } = await import("../scripts/r3l0ciarlcf/plan-identity.mjs");
    const mutated = { ...verification.plan, frozenAt: "2000-01-01T00:00:00.000Z" };
    expect(fullPlanDigest(mutated)).not.toBe(verification.planContentDigest);
  });

  it("detects a modified execution route", async () => {
    const verification = await readAndVerifyCommittedPlan({ verifyCompiled: false });
    const { fullPlanDigest } = await import("../scripts/r3l0ciarlcf/plan-identity.mjs");
    const mutated = { ...verification.plan, executionRoute: { ...verification.plan.executionRoute, modelId: "MUTATED" } };
    expect(fullPlanDigest(mutated)).not.toBe(verification.planContentDigest);
  });

  it("rejects a Qualification referencing a different plan digest", async () => {
    const verification = await readAndVerifyCommittedPlan({ verifyCompiled: false });
    const seal = sealCrossArtifactPlanIdentity({
      plan: verification.plan,
      qualification: { plan: { planId: PLAN_ID, planContentDigest: "0".repeat(64) }, planContentDigest: { frozen: "0".repeat(64) } },
      stageResult: { plan: { planId: PLAN_ID, planContentDigest: verification.planContentDigest }, planContentDigest: { frozen: verification.planContentDigest } },
    });
    expect(seal.checks.QUALIFICATION_PLAN_REFERENCE).toBe("MISMATCH");
    expect(seal.CROSS_ARTIFACT_PLAN_BINDING).toBe("MISMATCH");
  });

  it("rejects a Stage Result referencing a different plan digest", async () => {
    const verification = await readAndVerifyCommittedPlan({ verifyCompiled: false });
    const seal = sealCrossArtifactPlanIdentity({
      plan: verification.plan,
      qualification: { plan: { planId: PLAN_ID, planContentDigest: verification.planContentDigest }, planContentDigest: { frozen: verification.planContentDigest } },
      stageResult: { plan: { planId: PLAN_ID, planContentDigest: "1".repeat(64) }, planContentDigest: { frozen: "1".repeat(64) } },
    });
    expect(seal.checks.STAGE_RESULT_PLAN_REFERENCE).toBe("MISMATCH");
    expect(seal.CROSS_ARTIFACT_PLAN_BINDING).toBe("MISMATCH");
  });

  it("detects a plan id disagreement", async () => {
    const verification = await readAndVerifyCommittedPlan({ verifyCompiled: false });
    const seal = sealCrossArtifactPlanIdentity({
      plan: verification.plan,
      qualification: { plan: { planId: "some-other-plan", planContentDigest: verification.planContentDigest }, planContentDigest: { frozen: verification.planContentDigest } },
      stageResult: { plan: { planId: PLAN_ID, planContentDigest: verification.planContentDigest }, planContentDigest: { frozen: verification.planContentDigest } },
    });
    expect(seal.checks.PLAN_ID_AGREEMENT).toBe("MISMATCH");
  });

  it("seals when every reference agrees", async () => {
    const verification = await readAndVerifyCommittedPlan({ verifyCompiled: false });
    const self = { plan: { planId: PLAN_ID, planContentDigest: verification.planContentDigest }, planContentDigest: { frozen: verification.planContentDigest } };
    const seal = sealCrossArtifactPlanIdentity({ plan: verification.plan, qualification: self, stageResult: self });
    expect(seal.CROSS_ARTIFACT_PLAN_BINDING).toBe("MATCH");
    expect(seal.failing).toEqual([]);
  });

  it("records the previous stage's mismatch as an erratum without rewriting it", () => {
    const erratum = buildErratum();
    expect(erratum.previousPlanId).toBe("r3-l0c-iar-lcf-primary-plan");
    expect(erratum.selfCheckWasMatch).toBe(true);
    expect(erratum.crossArtifactReferenceWasConsistent).toBe(false);
    expect(erratum.priorQualificationWasFullySealed).toBe(false);
    expect(erratum.priorEvidenceModified).toBe(false);
    expect(erratum.newSupersedingPlanId).toBe(PLAN_ID);
    expect(erratum.mismatchedQualificationPlanReferenceDigest).not.toBe(erratum.committedPlanContentDigest);
  });
});

/* ================================================================ T3: the authoritative entry refuses a plan mismatch */

describe("R3-L0C-I-A-R-L-C-F-S §3 T3 — the authoritative entry refuses a plan mismatch", () => {
  it("refuses when the committed plan is absent", async () => {
    const guard = await assertCommittedPlanIdentity({ planPath: join(tmpdir(), "no-such-plan.json"), expectedPlanId: PLAN_ID });
    expect(guard.passed).toBe(false);
    expect(guard.regeneratesPlan).toBe(false);
  });

  it("dominates the execution entry and refuses before any exposure", async () => {
    const { runEvidenceSealMatrix } = await import("../scripts/r3l0ciarlcfs/pipeline.mjs");
    const run = await runEvidenceSealMatrix({
      mode: "DETERMINISTIC", runId: "r3lcfs-gates-mismatch", runRoot: join(tmpdir(), `r3lcfs-gates-${String(process.pid)}`),
      planPath: join(tmpdir(), "no-such-plan.json"), expectedPlanId: PLAN_ID,
    });
    expect(run.PIPELINE).toBe("REFUSED");
    expect(run.refusedAt).toBe("COMMITTED_PLAN_PREFLIGHT_GUARD");
    expect(run.launches).toEqual([]);
    expect(run.modelCallsMade).toBe(0);
    /** The guard is the FIRST recorded step, so it dominates everything below it. */
    expect(run.steps[0].id).toBe("COMMITTED_PLAN_PREFLIGHT_GUARD");
  });

  it("refuses a PRIMARY invocation at the prohibition, after the guard has passed", async () => {
    const { runEvidenceSealMatrix } = await import("../scripts/r3l0ciarlcfs/pipeline.mjs");
    const run = await runEvidenceSealMatrix({
      mode: "PRIMARY", runId: "r3lcfs-gates-primary", runRoot: join(tmpdir(), `r3lcfs-gates-primary-${String(process.pid)}`),
      authorizedBy: PLAN_ID, caller: PLAN_ID,
    });
    expect(run.PIPELINE).toBe("REFUSED");
    expect(run.refusedAt).toBe("PRIMARY_PROHIBITION");
    expect(run.launched).toBe(false);
    expect(run.modelCallsMade).toBe(0);
    expect(run.guard.passed).toBe(true);
  });

  it("throws when a non-authoritative caller invokes the guard", () => {
    expect(() => assertAuthoritativePath({ caller: "some-other-stage", authorizedBy: "some-other-plan" })).toThrow(/not the authoritative execution path/u);
  });
});

/* ================================================================ T1/T2: fail-closed cleanup */

describe("R3-L0C-I-A-R-L-C-F-S §4 — fail-closed cleanup", () => {
  it("S2-A: removes every link and the worktree when all unlinks succeed", () => {
    const checkout = createDisposableCheckout();
    const result = destroyDisposableCheckout({ checkout });
    expect(result.outcome).toBe("CLEANED");
    expect(result.worktreeRemoved).toBe(true);
    expect(existsSync(checkout.root)).toBe(false);
  });

  it("S2-B: a failed unlink blocks cleanup and never reaches the destructive fallback", () => {
    const checkout = createDisposableCheckout();
    const failing = Object.freeze({ ...realFilesystemAdapter(), unlinkLink: () => { throw new Error("injected unlink failure"); } });
    const result = destroyDisposableCheckout({ checkout, fs: failing });
    expect(result.outcome).toBe("CLEANUP_BLOCKED");
    expect(result.destructiveFallbackExecuted).toBe(false);
    expect(result.gitWorktreeRemoveForceExecuted).toBe(false);
    expect(result.recursiveRemoveExecuted).toBe(false);
    expect(existsSync(checkout.root)).toBe(true);
    expect(result.diagnosticLocation).toBe(checkout.root);
    destroyDisposableCheckout({ checkout });
  });

  it("S2-C: an unlink that reports success but leaves the link blocks cleanup", () => {
    const checkout = createDisposableCheckout();
    const silent = Object.freeze({ ...realFilesystemAdapter(), unlinkLink: () => { /* reports success, removes nothing */ } });
    const result = destroyDisposableCheckout({ checkout, fs: silent });
    expect(result.outcome).toBe("CLEANUP_BLOCKED");
    expect(result.destructiveFallbackExecuted).toBe(false);
    expect(result.linksRemaining.length).toBeGreaterThan(0);
    destroyDisposableCheckout({ checkout });
  });

  it("S2-E: refuses a target that is not an owned disposable worktree", () => {
    const root = mkdtempSync(join(tmpdir(), "r3lcfs-unowned-"));
    try {
      const result = destroyDisposableCheckout({ checkout: { root, links: [] } });
      expect(result.outcome).toBe("REFUSED_NOT_OWNED");
      expect(result.destructiveFallbackExecuted).toBe(false);
      expect(existsSync(root)).toBe(true);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("S2-E: refuses a worktree outside the expected disposable root", () => {
    const checkout = createDisposableCheckout();
    const result = destroyDisposableCheckout({ checkout, expectedRoot: join(tmpdir(), "some-other-root") });
    expect(result.outcome).toBe("CLEANUP_BLOCKED");
    expect(result.destructiveFallbackExecuted).toBe(false);
    destroyDisposableCheckout({ checkout });
  });

  it("classifies an entry by lstat without traversing it", () => {
    const root = mkdtempSync(join(tmpdir(), "r3lcfs-classify-"));
    try {
      const classification = classifyEntry({ path: root, fs: realFilesystemAdapter() });
      expect(classification.kind).toBe("directory");
      expect(classification.isLink).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

/* ================================================================ T1/T2: trial identity */

describe("R3-L0C-I-A-R-L-C-F-S §5 — complete trial identity", () => {
  const base = Object.freeze({
    sessionId: "s0", block: 0, arm: "C", generation: "G1", trajectoryId: "b0-C",
    attemptId: "attempt-11111111111111111111111111111111", hostJobId: "job-1",
    executionClosureDigest: "a".repeat(64), treatmentExpectationDigest: "exp-1",
    intendedExecutorRoute: "the deterministic scripted worker",
    contentDigests: Object.freeze({ r3l0ciarlLiveEvidence: "d".repeat(64) }),
    treatmentRealization: "APPLIED", admission: "ADMITTED",
  });
  const drive = (inMemory: any) => reconcileTrialIdentity({ durableRecords: [base], inMemoryRecords: [inMemory], plannedSessions: ["s0"] });

  it("compares every included field with a documented rationale", () => {
    const result = drive({ ...base });
    expect(result.comparedFields.length).toBeGreaterThanOrEqual(13);
    expect(result.loadBearingFields).toContain("attemptId");
    expect(result.excludedFields.length).toBeGreaterThan(0);
    expect(result.green).toBe(true);
  });

  it("S3-A: detects a different AttemptId", () => {
    expect(drive({ ...base, attemptId: "attempt-22222222222222222222222222222222" }).green).toBe(false);
  });

  it("S3-B: detects a different HostJobId", () => {
    expect(drive({ ...base, hostJobId: "job-2" }).green).toBe(false);
  });

  it("S3-C: detects a different sidecar digest binding", () => {
    expect(drive({ ...base, contentDigests: { r3l0ciarlLiveEvidence: "e".repeat(64) } }).green).toBe(false);
  });

  it("S3-D: detects a different Execution Closure Digest", () => {
    expect(drive({ ...base, executionClosureDigest: "b".repeat(64) }).green).toBe(false);
  });

  it("S3-E: detects a different Treatment Realization with the same schedule identity", () => {
    const result = drive({ ...base, treatmentRealization: "NOT_APPLIED" });
    expect(result.green).toBe(false);
    expect(result.conflicts.some((entry) => entry.field === "treatmentRealization")).toBe(true);
  });

  it("keeps the four null/absent states separate", () => {
    const bothAbsent = reconcileTrialIdentity({ durableRecords: [{ ...base, attemptId: null }], inMemoryRecords: [{ ...base, attemptId: null }], plannedSessions: ["s0"] });
    /**
     * `attemptId` is both-absent. The record also carries no `reportPath`/`transcriptPath`, which are INCLUDED as
     * evidence references, so they are both-absent too — a DIFFERENT and weaker fact than verified identity.
     */
    const absentFields = bothAbsent.bothAbsentFields.map((entry) => entry.field).sort();
    expect(absentFields).toEqual(["attemptId", "reportPath", "transcriptPath"]);
    expect(bothAbsent.counts.BOTH_EXPLICITLY_ABSENT).toBe(3);
    expect(bothAbsent.counts.SAME_VERIFIED_IDENTITY).toBeGreaterThan(0);
    expect(bothAbsent.matchingNullsAreVerifiedIdentity).toBe(false);
    expect(bothAbsent.blocksLivePrimaryPromotion).toBe(true);
    const oneAbsent = reconcileTrialIdentity({ durableRecords: [{ ...base, attemptId: null }], inMemoryRecords: [{ ...base, attemptId: "attempt-3".padEnd(40, "3") }], plannedSessions: ["s0"] });
    expect(oneAbsent.counts.ONE_ABSENT).toBe(1);
    expect(oneAbsent.green).toBe(false);
    expect(Object.keys(IDENTITY_STATES)).toHaveLength(4);
  });

  it("does not compare the intentionally-different excluded fields", () => {
    const result = drive({ ...base, timestamps: { recordedAt: "LATER" }, observations: ["DIFFERENT"] });
    expect(result.green).toBe(true);
  });

  it("S3-F: refuses a duplicate durable trial and a missing trial", async () => {
    const { appendRecord, readJournal } = await import("../scripts/r3l0cf/journal.mjs");
    const root = mkdtempSync(join(tmpdir(), "r3lcfs-trial-gate-"));
    try {
      const journalPath = join(root, "generation-journal.jsonl");
      const continuity = Object.freeze({ LIVE_ARTIFACT_PROPAGATION: "PASS", sessions: 1, allBound: true, allMatched: true, allComplete: true });
      const cost = Object.freeze({ interpretable: true, measuredCount: 1, absentCount: 0, plannedSessions: 1, livePrimaryCount: 0, fixtureCount: 1, allSixteenLivePrimary: false });
      appendRecord({ journalPath, kind: "TRIAL_RECORDED", payload: { sessionId: "s0", record: { ...base } } });
      appendRecord({ journalPath, kind: "TRIAL_RECORDED", payload: { sessionId: "s0", record: { ...base } } });
      const duplicate = await reconcileTrialEvidence({ journal: readJournal(journalPath), schedule: [{ sessionId: "s0", block: 0, arm: "C", generation: "G1", trajectoryId: "b0-C" }], plannedSessions: ["s0"], inMemoryRecords: [{ ...base }], liveEvidenceContinuity: continuity, costAttribution: cost, runRoot: root });
      expect(duplicate.green).toBe(false);
      expect(duplicate.failing).toContain("DURABLE_TRIAL_UNIQUE");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("S3-G: the extended adapter is RED on a mismatch and preserves the prior reconciliation", async () => {
    const { appendRecord, readJournal } = await import("../scripts/r3l0cf/journal.mjs");
    const root = mkdtempSync(join(tmpdir(), "r3lcfs-trial-ext-"));
    try {
      const journalPath = join(root, "generation-journal.jsonl");
      appendRecord({ journalPath, kind: "EXPOSURE_INTENT_RECORDED", payload: { sessionId: "s0" } });
      appendRecord({ journalPath, kind: "WORKER_LAUNCH_RECORDED", payload: { sessionId: "s0", attempt: 1 } });
      appendRecord({ journalPath, kind: "TRIAL_RECORDED", payload: { sessionId: "s0", record: { ...base } } });
      const continuity = Object.freeze({ LIVE_ARTIFACT_PROPAGATION: "PASS", sessions: 1, allBound: true, allMatched: true, allComplete: true });
      const cost = Object.freeze({ interpretable: true, measuredCount: 1, absentCount: 0, plannedSessions: 1, livePrimaryCount: 0, fixtureCount: 1, allSixteenLivePrimary: false });
      const green = await reconcileTrialEvidence({ journal: readJournal(journalPath), schedule: [{ sessionId: "s0", block: 0, arm: "C", generation: "G1", trajectoryId: "b0-C" }], plannedSessions: ["s0"], inMemoryRecords: [{ ...base }], liveEvidenceContinuity: continuity, costAttribution: cost, runRoot: root });
      expect(green.green).toBe(true);
      const conflict = await reconcileTrialEvidence({ journal: readJournal(journalPath), schedule: [{ sessionId: "s0", block: 0, arm: "C", generation: "G1", trajectoryId: "b0-C" }], plannedSessions: ["s0"], inMemoryRecords: [{ ...base, attemptId: "attempt-99999999999999999999999999999999" }], liveEvidenceContinuity: continuity, costAttribution: cost, runRoot: root });
      expect(conflict.green).toBe(false);
      expect(conflict.failing).toContain("DURABLE_IN_MEMORY_FULL_IDENTITY");
      /** The prior reducer alone would have stayed green, which is the defect. */
      expect(conflict.priorReconciliationGreen).toBe(true);
      expect(conflict.secondReducerCreated).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

/* ================================================================ T1/T2: artifact envelope */

describe("R3-L0C-I-A-R-L-C-F-S §6 — artifact event-envelope validity", () => {
  let root: string;
  beforeAll(() => { root = mkdtempSync(join(tmpdir(), "r3lcfs-envelope-")); });

  it("S4-A: accepts a valid fixture with one raw-history read", async () => {
    const artifact = writeArtifact({ directory: join(root, "a"), attemptId: "a".repeat(32), records: [
      { type: "turn/start", time: 900, data: {} },
      { type: "tool/ptc-dispatch", seq: 1, time: 1_000, data: { name: "read", arguments: { file_path: "docs/history/incidents/0007-legacy-deny-overturned.md" }, content: "x", isError: false } },
      { type: "tool/ptc-dispatch", seq: 2, time: 1_100, data: { name: "palimpsest_worker_result", arguments: {}, content: "ok", isError: false } },
    ] });
    const measured = await measureValidatedArtifact({ artifactPath: artifact.path, attemptId: artifact.attemptId });
    expect(measured.measured).toBe(true);
    expect(measured.fields?.rawHistoryArtifactsRead).toBe(1);
  });

  it("S4-B: accepts a genuine measured zero from a real start and completion", async () => {
    const artifact = writeArtifact({ directory: join(root, "b"), attemptId: "b".repeat(32), records: [
      { type: "turn/start", time: 900, data: {} },
      { type: "tool/ptc-dispatch", seq: 1, time: 1_000, data: { name: "palimpsest_worker_result", arguments: {}, content: "ok", isError: false } },
    ] });
    const measured = await measureValidatedArtifact({ artifactPath: artifact.path, attemptId: artifact.attemptId });
    expect(measured.measured).toBe(true);
    expect(measured.fields?.rawHistoryArtifactsRead).toBe(0);
    expect(measured.measuredZeroIsGenuine).toBe(true);
  });

  it("S4-C: rejects parseable JSONL with no Session Start", async () => {
    const artifact = writeArtifact({ directory: join(root, "c"), attemptId: "c".repeat(32), records: [{ type: "noise" }] });
    const validity = validateArtifactEnvelope({ artifactPath: artifact.path, ...await instrumentation() });
    expect(validity.interpretable).toBe(false);
    expect(validity.state).toBe("ENVELOPE_INVALID");
  });

  it("S4-D: rejects a Session Start with no endpoint observation", async () => {
    const artifact = writeArtifact({ directory: join(root, "d"), attemptId: "d".repeat(32), records: [{ type: "turn/start", time: 900, data: {} }] });
    const validity = validateArtifactEnvelope({ artifactPath: artifact.path, ...await instrumentation() });
    expect(validity.interpretable).toBe(false);
    expect(validity.state).toBe("COMPLETION_NOT_OBSERVED");
  });

  it("S4-D2: labels a partial execution as partial rather than completed", async () => {
    const artifact = writeArtifact({ directory: join(root, "e"), attemptId: "e".repeat(32), records: [
      { type: "turn/start", time: 900, data: {} },
      { type: "turn/end", time: 5_000, data: { reason: { kind: "timeout" } } },
    ] });
    const validity = validateArtifactEnvelope({ artifactPath: artifact.path, ...await instrumentation() });
    expect(validity.interpretable).toBe(false);
    expect(validity.partial).toBe(true);
  });

  it("S4-E: rejects malformed compressed frames", async () => {
    const artifact = writeArtifact({ directory: join(root, "f"), attemptId: "f".repeat(32), records: [{ type: "turn/start", time: 900, data: {} }] });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(artifact.path, Buffer.from([0, 1, 2, 3]));
    const validity = validateArtifactEnvelope({ artifactPath: artifact.path, ...await instrumentation() });
    expect(validity.interpretable).toBe(false);
    expect(validity.state).toBe("UNREADABLE");
  });

  it("S4-G: an invalid observation carries absent cost fields, not invented zeros", async () => {
    const artifact = writeArtifact({ directory: join(root, "g"), attemptId: "g".repeat(32), records: [{ type: "noise" }] });
    const measured = await measureValidatedArtifact({ artifactPath: artifact.path, attemptId: artifact.attemptId });
    expect(measured.measured).toBe(false);
    expect(measured.fields).toBeNull();
    expect(measured.costFieldsAbsent).toBe(true);
  });

  it("S4-H: an invalid observation satisfies neither measured level", async () => {
    const artifact = writeArtifact({ directory: join(root, "h"), attemptId: "h".repeat(32), records: [{ type: "noise" }] });
    const measured = await measureValidatedArtifact({ artifactPath: artifact.path, attemptId: artifact.attemptId });
    expect(measured.satisfiesCostMeasuredComplete).toBe(false);
    expect(measured.satisfiesLivePrimaryCostComplete).toBe(false);
  });

  it("declares the validity states as data", () => {
    expect(ARTIFACT_VALIDITY_STATES.length).toBeGreaterThanOrEqual(6);
    expect(ARTIFACT_VALIDITY_STATES.filter((entry) => entry.interpretable === false).length).toBeGreaterThanOrEqual(4);
  });
});

/* ================================================================ T1/T2: authorization verdict */

describe("R3-L0C-I-A-R-L-C-F-S §7 — authorization condition consistency", () => {
  const plan = Object.freeze({ planId: PLAN_ID, stage: "R3-L0C-I-A-R-L-C-F-S", executionClosure: Object.freeze({ executionClosureDigest: "c".repeat(64) }), authorizationRequired: Object.freeze({ required: true }) });
  const fixtureSource = Object.freeze({ available: true, path: "C:/test-fixture/authority.json", verified: true, testFixture: true, source: Object.freeze({ authority: "test-authority", decisions: Object.freeze({ "test-authority": true }) }) });
  let record: any;
  beforeAll(async () => {
    const { fullPlanDigest } = await import("../scripts/r3l0ciarlcf/plan-identity.mjs");
    record = Object.freeze({
      authority: "test-authority", approvedPlanId: PLAN_ID, approvedPlanDigest: fullPlanDigest(plan),
      paidRunBudget: Object.freeze({ maxSessions: 16, currency: "USD", maxAmount: 100 }),
      decisions: Object.freeze({ PAID_MODEL_USAGE: true, BOUNDED_FAIL_STOP_PROTOCOL: true, NO_AUTOMATIC_RETRIES_OR_REPLACEMENTS: true, PRESERVE_PARTIALLY_COMPLETED_INVALID_RUNS: true, ACCEPTED_PROMPT_NEUTRALITY_LIMITED: true }),
    });
  });

  it("S5-E: a synthetically verified authority with no enforcement is NOT VERIFIED", async () => {
    const verdict = await reduceAuthorizationVerdict({ record, plan, trustedSource: fixtureSource });
    expect(verdict.verified).toBe(false);
    expect(verdict.conditions.PROVEN_HOST_SPEND_ENFORCEMENT).toBe(false);
    expect(verdict.verdictAgreesWithProblems).toBe(true);
    expect(verdict.problems.some((problem) => /host spending enforcement/iu.test(problem))).toBe(true);
  });

  it("S5-A: no trusted authority is AUTHORITY_NOT_ESTABLISHED", async () => {
    const verdict = await reduceAuthorizationVerdict({ record, plan, trustedSource: Object.freeze({ available: false, path: null, reason: "none configured" }) });
    expect(verdict.verified).toBe(false);
    expect(verdict.verdict).toBe("AUTHORITY_NOT_ESTABLISHED");
  });

  it("S5-B: a fabricated decision reference is refused", async () => {
    const verdict = await reduceAuthorizationVerdict({ record: { ...record, authority: "decision:approved" }, plan, trustedSource: fixtureSource });
    expect(verdict.verified).toBe(false);
    expect(verdict.conditions.EXTERNALLY_VERIFIED_AUTHORITY).toBe(false);
  });

  it("S5-C: a wrong Full Plan Digest is refused", async () => {
    const verdict = await reduceAuthorizationVerdict({ record: { ...record, approvedPlanDigest: "f".repeat(64) }, plan, trustedSource: fixtureSource });
    expect(verdict.verified).toBe(false);
    expect(verdict.conditions.APPROVED_FULL_PLAN_DIGEST_MATCH).toBe(false);
  });

  it("S5-D: a session ceiling without a monetary limit is refused", async () => {
    const verdict = await reduceAuthorizationVerdict({ record: { ...record, paidRunBudget: { maxSessions: 16, currency: "USD" } }, plan, trustedSource: fixtureSource });
    expect(verdict.verified).toBe(false);
    expect(verdict.conditions.EXPLICIT_MONETARY_LIMIT).toBe(false);
  });

  it("S5-F: a plan changed after approval is refused", async () => {
    const verdict = await reduceAuthorizationVerdict({ record: { ...record, approvedPlanDigest: "e".repeat(64) }, plan, trustedSource: fixtureSource });
    expect(verdict.verified).toBe(false);
  });

  it("S5-G: the launch permission stays false even when every schema field is valid", async () => {
    const verdict = await reduceAuthorizationVerdict({ record, plan, trustedSource: fixtureSource });
    expect(verdict.concepts.CURRENT_LAUNCH_PERMISSION).toBe(false);
    expect(verdict.launchProhibited).toBe(true);
    expect(verdict.testFixtureCannotOpenLaunch).toBe(true);
  });

  it("requires every one of the eight mandatory conditions", async () => {
    const verdict = await reduceAuthorizationVerdict({ record, plan, trustedSource: fixtureSource });
    expect(verdict.mandatoryConditions).toHaveLength(8);
    expect(verdict.everyMandatoryConditionRequired).toBe(true);
    expect(verdict.conditions.NO_FALSE_OR_UNKNOWN_CONDITION).toBe(false);
  });
});

/* ================================================================ T1: closure and contract */

describe("R3-L0C-I-A-R-L-C-F-S §9 — closure and contract", () => {
  it("computes a complete closure with every module present", async () => {
    const closure = await computeExecutionClosure({ verifyCompiled: false });
    expect(closure.CLOSURE_COMPLETE).toBe(true);
    expect(closure.stageHarness.missing).toEqual([]);
    expect(closure.reusedModules.missing).toEqual([]);
  });

  it("proves all four mutation arms by override, without writing the tree", async () => {
    const mutations = await proveClosureMutations();
    expect(mutations.ALL_MUTATIONS_PROVEN).toBe(true);
    expect(mutations.arms).toHaveLength(4);
    expect(mutations.treeMutated).toBe(false);
    expect(mutations.computedByOverride).toBe(true);
  });

  it("declares the five gaps and discloses the legacy helper quarantine", () => {
    expect(EVIDENCE_GAPS).toHaveLength(5);
    expect(LEGACY_HELPER_QUARANTINE.physicallyUnexecutable).toBe(false);
    expect(LEGACY_HELPER_QUARANTINE.quarantineIsAGuardNotAnImpossibility).toBe(true);
  });

  it("builds a plan whose schedule is the frozen sixteen-session design", async () => {
    const plan = await buildProspectivePlan({ verifyCompiled: false });
    expect(plan.schedule).toHaveLength(16);
    expect(plan.preservedDesign.treatment).toBe("SELECTION_ONLY");
    expect(String(plan.preservedDesign.randomizationSeed)).toBe("1380724738");
    expect(plan.planSupersession.supersedes.planId).toBe("r3-l0c-iar-lcf-primary-plan");
    expect(plan.planSupersession.amendedPriorPlan).toBe(false);
  });
});

/* ================================================================ T2: the seal over constructed evidence */

describe("R3-L0C-I-A-R-L-C-F-S §3 — the cross-artifact seal over the real plan", () => {
  it("seals the committed plan against evidence built from its OWN identity", async () => {
    const verification = await readAndVerifyCommittedPlan({ verifyCompiled: false });
    const closure = await computeExecutionClosure({ verifyCompiled: false });
    const self = { plan: { planId: verification.planId, planContentDigest: verification.planContentDigest }, planContentDigest: { frozen: verification.planContentDigest } };
    const seal = sealCrossArtifactPlanIdentity({ plan: verification.plan, qualification: self, stageResult: self, currentClosureDigest: closure.executionClosureDigest });
    expect(seal.checks.COMMITTED_PLAN_SELF_DIGEST).toBe("MATCH");
    expect(seal.checks.QUALIFICATION_PLAN_REFERENCE).toBe("MATCH");
    expect(seal.checks.STAGE_RESULT_PLAN_REFERENCE).toBe("MATCH");
    expect(seal.checks.QUALIFICATION_FROZEN_REFERENCE).toBe("MATCH");
    expect(seal.checks.STAGE_RESULT_FROZEN_REFERENCE).toBe("MATCH");
    expect(seal.checks.PLAN_ID_AGREEMENT).toBe("MATCH");
    expect(seal.checks.PLAN_CLOSURE_AGREEMENT).toBe("MATCH");
    expect(seal.CROSS_ARTIFACT_PLAN_BINDING).toBe("MATCH");
  });

  it("is MISMATCH for the previous stage's real persisted pair", async () => {
    const verification = await readAndVerifyCommittedPlan({ verifyCompiled: false });
    const priorPlan = JSON.parse(readFileSync(join("research-evidence", "r3-l0c-iar-lcf", "execution-plan.json"), "utf8"));
    const priorQualification = JSON.parse(readFileSync(join("research-evidence", "r3-l0c-iar-lcf", "qualification.json"), "utf8"));
    const priorStageResult = JSON.parse(readFileSync(join("research-evidence", "r3-l0c-iar-lcf", "stage-result.json"), "utf8"));
    /** The prior stage's OWN plan, against its OWN persisted references — which is where the defect lived. */
    const priorSeal = sealCrossArtifactPlanIdentity({ plan: priorPlan, qualification: priorQualification, stageResult: priorStageResult });
    expect(priorSeal.checks.COMMITTED_PLAN_SELF_DIGEST).toBe("MATCH");
    expect(priorSeal.checks.QUALIFICATION_PLAN_REFERENCE).toBe("MISMATCH");
    expect(priorSeal.checks.STAGE_RESULT_PLAN_REFERENCE).toBe("MISMATCH");
    expect(priorSeal.CROSS_ARTIFACT_PLAN_BINDING).toBe("MISMATCH");
    expect(verification.verified).toBe(true);
  });
});

/** §6: the frozen instrumentation functions the envelope validator consumes. */
async function instrumentation() {
  const { decompressFrames, sessionRecords } = await import("../scripts/r3l0c/instrumentation.mjs");
  return { decompressFrames, sessionRecords };
}
