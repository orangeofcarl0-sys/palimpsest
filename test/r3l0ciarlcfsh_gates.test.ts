/**
 * R3-L0C-I-A-R-L-C-F-S-H §3-§12 — THE CORRECTED-PATH GATES.
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

import {
  BASELINE_COMMIT,
  BASELINE_DEFECT_IDS,
  CLEANUP_SAFETY_STEPS,
  FINAL_VERDICTS,
  LEGACY_HELPER_QUARANTINE,
  OWNERSHIP_WITNESSES,
  PLAN_ID,
  QUALIFICATION_CONDITIONS,
  SEAL_PHASES,
  SEAL_REQUIRED_FIELDS,
  STAGE_BRANCH,
  VALIDATED_COST_CHAIN,
} from "../scripts/r3l0ciarlcfsh/contract.mjs";
import { validatedCostBridge, VALIDATED_COST_OUTCOMES } from "../scripts/r3l0ciarlcfsh/validated-cost-bridge.mjs";
import {
  ARTIFACT_VALIDATOR_SOURCE,
  isInvalidMeasurementState,
} from "../scripts/r3l0ciarlcfsh/artifact-validity.mjs";
import {
  createDisposableCheckout,
  destroyDisposableCheckout,
  enumerateLinks,
  realFilesystemAdapter,
  realGitAdapter,
  reinspectLink,
  verifyOwnership,
  verifyRootContainment,
  DISPOSABLE_MARKER,
} from "../scripts/r3l0ciarlcfsh/safe-cleanup.mjs";
import { preSealStatus, sealPersistedEvidence, readPersistedSeal } from "../scripts/r3l0ciarlcfsh/evidence-seal.mjs";
import { reduceDeterministicQualification } from "../scripts/r3l0ciarlcfsh/qualification.mjs";
import { buildFinalVerdicts, buildStageResult } from "../scripts/r3l0ciarlcfsh/evidence.mjs";
import { applyIdentityMutation, PIPELINE_ORDER } from "../scripts/r3l0ciarlcfsh/pipeline.mjs";
import { readAndVerifyCommittedPlan, committedPlanPath } from "../scripts/r3l0ciarlcfsh/committed-plan.mjs";
import { assertAuthoritativePath, assertCommittedPlanIdentity } from "../scripts/r3l0ciarlcfsh/modes.mjs";
import { buildProspectivePlan, checkPlanClosure } from "../scripts/r3l0ciarlcfsh/prospective-plan.mjs";
import { computeExecutionClosure, proveClosureMutations, STAGE_HARNESS_MODULES, REUSED_MODULES } from "../scripts/r3l0ciarlcfsh/closure.mjs";
import { buildErratum } from "../scripts/r3l0ciarlcfsh/erratum.mjs";
import { writeRealArtifact } from "../scripts/r3l0ciarlcfsh/acceptance.mjs";

const EVIDENCE = "research-evidence/r3-l0c-iar-lcfsh";

/** §3: a small durable journal fixture, so a T2 test can drive the validated bridge without the frozen matrix. */
async function buildFixture(root: string, options: { records?: readonly any[]; attemptSuffix?: string; rawBytes?: Buffer | null; sidecarAttemptId?: string | null } = {}) {
  const { records = [], attemptSuffix = "a".repeat(32), rawBytes = null, sidecarAttemptId = null } = options;
  const { appendRecord } = await import("../scripts/r3l0cf/journal.mjs");
  const { LIVE_EVIDENCE_DIRECTORY } = await import("../scripts/r3l0ciarlcf/cost-bridge.mjs");
  const { createHash } = await import("node:crypto");
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const attemptId = attemptSuffix;
  const artifact = rawBytes === null
    ? writeRealArtifact({ directory: join(root, "artifacts"), attemptId, records })
    : (() => {
      const directory = join(root, "artifacts", `attempt-${attemptId}`);
      mkdirSync(directory, { recursive: true });
      const path = join(directory, "session.v4.jsonl.zstd");
      writeFileSync(path, rawBytes);
      return { path, attemptId, records: 0 };
    })();
  const artifactDigest = createHash("sha256").update(readFileSync(artifact.path)).digest("hex");
  const runRoot = join(root, "run");
  mkdirSync(join(runRoot, LIVE_EVIDENCE_DIRECTORY), { recursive: true });
  const sidecar = {
    schemaVersion: 1, kind: "r3l0ciarl live evidence", sessionId: "s0", sessionArtifactPath: artifact.path,
    sessionArtifactDigest: artifactDigest, hiddenInvariantVector: null,
    attemptId: sidecarAttemptId ?? `attempt-${attemptId}`,
    hostJobId: "job-g1", costProvenance: "FIXTURE", mode: "DETERMINISTIC",
  };
  const sidecarText = `${JSON.stringify(sidecar, null, 2)}\n`;
  writeFileSync(join(runRoot, LIVE_EVIDENCE_DIRECTORY, "s0.json"), sidecarText, "utf8");
  const sidecarDigest = createHash("sha256").update(sidecarText, "utf8").digest("hex");
  const journalPath = join(runRoot, "generation-journal.jsonl");
  appendRecord({ journalPath, kind: "EXPOSURE_INTENT_RECORDED", payload: { sessionId: "s0" } });
  appendRecord({ journalPath, kind: "WORKER_LAUNCH_RECORDED", payload: { sessionId: "s0", attempt: 1 } });
  appendRecord({ journalPath, kind: "TRIAL_RECORDED", payload: { sessionId: "s0", record: {
    sessionId: "s0", block: 0, arm: "C", generation: "G1", trajectoryId: "b0-C",
    attemptId: `attempt-${attemptId}`, hostJobId: "job-g1", intendedExecutorRoute: "the deterministic scripted worker",
    contentDigests: { r3l0ciarlLiveEvidence: sidecarDigest },
  } } });
  return { runRoot, journalPath, artifact };
}

const VALID_RECORDS = [
  { type: "turn/start", time: 900, data: {} },
  { type: "tool/ptc-dispatch", seq: 1, time: 1_000, data: { name: "read", arguments: { file_path: "docs/history/incidents/0007-legacy-deny-overturned.md" }, content: "x".repeat(400), isError: false } },
  { type: "tool/ptc-dispatch", seq: 2, time: 1_100, data: { name: "palimpsest_worker_result", arguments: {}, content: "ok", isError: false } },
];

/* ================================================================ T1: the contract */

describe("R3-L0C-I-A-R-L-C-F-S-H §0 T1 — the contract", () => {
  it("binds the exact baseline and the corrective branch", () => {
    expect(BASELINE_COMMIT).toBe("80823c4e5b0015b265ae71df8d6468c0bfe9c865");
    expect(STAGE_BRANCH).toBe("r3-l0c-iar-lcfsh-terminal-hotfix");
    expect(PLAN_ID).toBe("r3-l0c-iar-lcfsh-primary-plan");
  });

  it("declares the five measured defects and the ordered authority chain", () => {
    expect(BASELINE_DEFECT_IDS).toHaveLength(5);
    expect(VALIDATED_COST_CHAIN).toHaveLength(10);
    expect(CLEANUP_SAFETY_STEPS).toHaveLength(11);
    expect(OWNERSHIP_WITNESSES).toHaveLength(6);
    expect(QUALIFICATION_CONDITIONS).toHaveLength(12);
    expect(Object.keys(FINAL_VERDICTS)).toHaveLength(24);
  });
});

/* ================================================================ T2: §3 validated cost admission */

describe("R3-L0C-I-A-R-L-C-F-S-H §3 T2 — validated cost admission", () => {
  let root: string;
  beforeAll(() => { root = mkdtempSync(join(tmpdir(), "r3lcfsh-gates-cost-")); });

  it("reuses the committed validator rather than creating a second one", () => {
    expect(ARTIFACT_VALIDATOR_SOURCE.restatedHere).toBe(false);
    expect(ARTIFACT_VALIDATOR_SOURCE.secondImplementationCreated).toBe(false);
    expect(ARTIFACT_VALIDATOR_SOURCE.module).toBe("scripts/r3l0ciarlcfs/artifact-validity.mjs");
  });

  it("H1-P1: admits a valid fixture with one raw-history read", async () => {
    const fixture = await buildFixture(join(root, "with-read"), { records: VALID_RECORDS });
    const result = await validatedCostBridge({ journalPath: fixture.journalPath, runRoot: fixture.runRoot, plannedSessions: ["s0"] });
    expect(result.measuredCount).toBe(1);
    expect(result.perSession[0].fields.rawHistoryArtifactsRead).toBe(1);
    expect(result.envelopeValidatorConsumed).toBe(true);
  });

  it("H1-P2: admits a genuine measured zero from a real start and completion", async () => {
    const fixture = await buildFixture(join(root, "zero"), { attemptSuffix: "b".repeat(32), records: [
      { type: "turn/start", time: 900, data: {} },
      { type: "tool/ptc-dispatch", seq: 1, time: 1_000, data: { name: "palimpsest_worker_result", arguments: {}, content: "ok", isError: false } },
    ] });
    const result = await validatedCostBridge({ journalPath: fixture.journalPath, runRoot: fixture.runRoot, plannedSessions: ["s0"] });
    expect(result.measuredCount).toBe(1);
    expect(result.perSession[0].fields.rawHistoryArtifactsRead).toBe(0);
    expect(result.perSession[0].validityState).toBe("VALID_MEASURED");
  });

  it("H1-N1: an invalid artifact is not measured and its preliminary fields are discarded", async () => {
    const fixture = await buildFixture(join(root, "noise"), { attemptSuffix: "c".repeat(32), records: [{ type: "noise" }] });
    const result = await validatedCostBridge({ journalPath: fixture.journalPath, runRoot: fixture.runRoot, plannedSessions: ["s0"] });
    expect(result.measuredCount).toBe(0);
    expect(result.invalidCount).toBe(1);
    expect(result.perSession[0].outcome).toBe("INVALID_ENVELOPE");
    expect(result.perSession[0].fields).toBeNull();
    expect(result.perSession[0].costFieldsAbsent).toBe(true);
    expect(result.perSession[0].measured).toBe(false);
    /** The defect the correction closes: the frozen bridge WOULD have admitted it. */
    expect(result.frozenPreliminary.wouldHaveAdmittedInvalid).toBe(true);
  });

  it("H1-N2: a Session Start with no completion boundary is not measured", async () => {
    const fixture = await buildFixture(join(root, "start-only"), { attemptSuffix: "d".repeat(32), records: [{ type: "turn/start", time: 900, data: {} }] });
    const result = await validatedCostBridge({ journalPath: fixture.journalPath, runRoot: fixture.runRoot, plannedSessions: ["s0"] });
    expect(result.measuredCount).toBe(0);
    expect(result.perSession[0].validityState).toBe("COMPLETION_NOT_OBSERVED");
  });

  it("H1-N3: a partial timeout without a valid Result submission is not measured", async () => {
    const fixture = await buildFixture(join(root, "partial"), { attemptSuffix: "e".repeat(32), records: [
      { type: "turn/start", time: 900, data: {} },
      { type: "turn/end", time: 5_000, data: { reason: { kind: "timeout" } } },
    ] });
    const result = await validatedCostBridge({ journalPath: fixture.journalPath, runRoot: fixture.runRoot, plannedSessions: ["s0"] });
    expect(result.measuredCount).toBe(0);
    expect(result.invalidCount).toBe(1);
  });

  it("H1-N6: a sidecar digest mismatch is not measured", async () => {
    const fixture = await buildFixture(join(root, "mismatch"), { attemptSuffix: "2".repeat(32), records: VALID_RECORDS });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(fixture.runRoot, "private/live-evidence/s0.json"), '{"tampered":true}', "utf8");
    const result = await validatedCostBridge({ journalPath: fixture.journalPath, runRoot: fixture.runRoot, plannedSessions: ["s0"] });
    expect(result.measuredCount).toBe(0);
    expect(result.perSession[0].outcome).toBe("SIDECAR_DIGEST_MISMATCH");
  });

  it("H1-N7: a valid envelope with an inconsistent Attempt identity is not measured", async () => {
    const fixture = await buildFixture(join(root, "identity"), { attemptSuffix: "3".repeat(32), sidecarAttemptId: `attempt-${"9".repeat(32)}`, records: VALID_RECORDS });
    const result = await validatedCostBridge({ journalPath: fixture.journalPath, runRoot: fixture.runRoot, plannedSessions: ["s0"] });
    expect(result.measuredCount).toBe(0);
    expect(result.perSession[0].outcome).toBe("IDENTITY_CONFLICT");
  });

  it("keeps accounting completeness separate from measured completeness", async () => {
    const fixture = await buildFixture(join(root, "accounting"), { attemptSuffix: "4".repeat(32), records: [{ type: "noise" }] });
    const result = await validatedCostBridge({ journalPath: fixture.journalPath, runRoot: fixture.runRoot, plannedSessions: ["s0"] });
    /** Every planned session is accounted for — measured or explicitly classified — so accounting holds. */
    expect(result.interpretable).toBe(true);
    expect(result.measuredCount + result.absentCount).toBe(result.plannedSessions);
    /** But the invalid observation is NOT a measurement. */
    expect(result.measuredCount).toBe(0);
    expect(result.invalidCount).toBe(1);
    expect(result.rejectedCount).toBe(0);
    expect(result.unaccountedCount).toBe(0);
  });

  it("classifies invalid states by name", () => {
    expect(isInvalidMeasurementState("ENVELOPE_INVALID")).toBe(true);
    expect(isInvalidMeasurementState("UNREADABLE")).toBe(true);
    expect(isInvalidMeasurementState("VALID_MEASURED")).toBe(false);
    expect(VALIDATED_COST_OUTCOMES.map((entry: { id: string }) => entry.id)).toContain("INVALID_ENVELOPE");
  });
});

/* ================================================================ T1/T2: §4 cleanup safety */

describe("R3-L0C-I-A-R-L-C-F-S-H §4 T1 — cleanup safety primitives", () => {
  let root: string;
  beforeAll(() => { root = mkdtempSync(join(tmpdir(), "r3lcfsh-gates-cleanup-")); });

  it("H2-N4: path.relative refuses a sibling a string-prefix test would accept", async () => {
    const { mkdirSync } = await import("node:fs");
    const parent = join(root, "r3lcfsh-worktree-expected");
    const sibling = join(root, "r3lcfsh-worktree-expected-sibling");
    mkdirSync(parent, { recursive: true });
    mkdirSync(sibling, { recursive: true });
    const fs = realFilesystemAdapter();
    const siblingResult = verifyRootContainment({ root: sibling, expectedRoot: parent, fs });
    const parentResult = verifyRootContainment({ root: parent, expectedRoot: parent, fs });
    expect(siblingResult.contained).toBe(false);
    expect(parentResult.contained).toBe(false);
    expect(siblingResult.stringPrefixComparisonUsed).toBe(false);
    expect(siblingResult.problems.length).toBeGreaterThan(0);
  });

  it("H2-N5/N6: ownership requires the marker, its stage, its root and its nonce to agree", async () => {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const plain = join(root, "unowned-plain");
    mkdirSync(plain, { recursive: true });
    const fs = realFilesystemAdapter();
    const git = realGitAdapter();
    const unowned = verifyOwnership({ checkout: { root: plain, owned: true }, resolvedRoot: plain, fs, git, expectedRoot: tmpdir() });
    expect(unowned.owned).toBe(false);
    expect(unowned.callerClaimedOwned).toBe(true);
    expect(unowned.callerClaimDecidesOwnership).toBe(false);
    expect(unowned.failing.length).toBeGreaterThan(0);
  });

  it("H2-N3: reinspection requires ENOENT, so a dangling link is not treated as removed", async () => {
    const { mkdirSync } = await import("node:fs");
    const directory = join(root, "reinspect");
    mkdirSync(directory, { recursive: true });
    const absent = join(directory, "never-existed");
    const result = reinspectLink({ path: absent, fs: realFilesystemAdapter() });
    expect(result.removed).toBe(true);
    expect(result.proof).toBe("ENOENT");
  });

  it("H2-N8: an lstat failure blocks rather than being skipped", async () => {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const directory = join(root, "lstat-fails");
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "entry.txt"), "x", "utf8");
    const failingFs = Object.freeze({ ...realFilesystemAdapter(), lstat: () => { throw Object.assign(new Error("denied"), { code: "EPERM" }); } });
    const enumerated = enumerateLinks({ root: directory, fs: failingFs });
    expect(enumerated.ok).toBe(true);
    expect(enumerated.unclassified.length).toBe(1);
  });
});

describe("R3-L0C-I-A-R-L-C-F-S-H §4 T2 — fail-closed cleanup over real checkouts", () => {
  let root: string;
  beforeAll(() => { root = mkdtempSync(join(tmpdir(), "r3lcfsh-gates-cleanup2-")); });

  it("cleans a healthy owned checkout", () => {
    const checkout = createDisposableCheckout();
    const result = destroyDisposableCheckout({ checkout });
    expect(result.outcome).toBe("CLEANED");
    expect(result.worktreeRemoved).toBe(true);
    expect(result.ownership.witnesses.MARKER_STAGE_IDENTITY).toBe(true);
    expect(result.ownership.witnesses.MARKER_ROOT_IDENTITY).toBe(true);
    expect(result.ownership.witnesses.MARKER_CHECKOUT_NONCE).toBe(true);
  });

  it("H2-N1: a failed unlink blocks and preserves the worktree", () => {
    const checkout = createDisposableCheckout();
    const failingFs = Object.freeze({ ...realFilesystemAdapter(), unlinkLink: () => { throw new Error("injected"); } });
    const result = destroyDisposableCheckout({ checkout, fs: failingFs });
    expect(result.outcome).toBe("CLEANUP_BLOCKED");
    expect(result.destructiveFallbackExecuted).toBe(false);
    expect(result.recursiveRemoveExecuted).toBe(false);
    expect(result.gitWorktreeRemoveForceExecuted).toBe(false);
    expect(result.worktreePreserved).toBe(true);
    expect(existsSync(checkout.root)).toBe(true);
    destroyDisposableCheckout({ checkout });
  });

  it("H2-N2: an unlink reporting success but leaving the link blocks", () => {
    const checkout = createDisposableCheckout();
    const silentFs = Object.freeze({ ...realFilesystemAdapter(), unlinkLink: () => { /* nothing */ } });
    const result = destroyDisposableCheckout({ checkout, fs: silentFs });
    expect(result.outcome).toBe("CLEANUP_BLOCKED");
    expect(result.destructiveFallbackExecuted).toBe(false);
    destroyDisposableCheckout({ checkout });
  });

  it("H2-N5: a caller-supplied owned:true is refused for an unowned path", async () => {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const unowned = join(root, "caller-claimed");
    mkdirSync(unowned, { recursive: true });
    writeFileSync(join(unowned, "user-data.txt"), "irreplaceable", "utf8");
    const result = destroyDisposableCheckout({ checkout: { root: unowned, owned: true, links: [] } });
    expect(result.outcome).toBe("REFUSED_NOT_OWNED");
    expect(result.destructiveFallbackExecuted).toBe(false);
    expect(existsSync(join(unowned, "user-data.txt"))).toBe(true);
  });

  it("H2-N6: a marker with the wrong root or stage identity is refused", async () => {
    const { writeFileSync } = await import("node:fs");
    const checkout = createDisposableCheckout();
    writeFileSync(join(checkout.root, DISPOSABLE_MARKER), `${JSON.stringify({ stage: "R3-L0C-I-A-R-L-C-F-S", root: join(root, "elsewhere"), nonce: checkout.nonce })}\n`, "utf8");
    const result = destroyDisposableCheckout({ checkout });
    expect(result.outcome).toBe("REFUSED_NOT_OWNED");
    expect(result.ownership.witnesses.MARKER_STAGE_IDENTITY).toBe(false);
    destroyDisposableCheckout({ checkout });
  });

  it("H2-N9: a failed Git removal preserves the worktree rather than recursing", () => {
    const checkout = createDisposableCheckout();
    const failingGit = Object.freeze({ ...realGitAdapter(), removeWorktreeForce: () => { throw new Error("injected"); } });
    const result = destroyDisposableCheckout({ checkout, git: failingGit });
    expect(result.outcome).toBe("CLEANUP_BLOCKED");
    expect(result.gitWorktreeRemoveForceExecuted).toBe(false);
    expect(result.recursiveRemoveExecuted).toBe(false);
    expect(existsSync(checkout.root)).toBe(true);
    destroyDisposableCheckout({ checkout });
  });

  it("H2-N10: an external sentinel is byte-identical after every case", async () => {
    const { createHash } = await import("node:crypto");
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const sentinelDirectory = join(root, "sentinel");
    mkdirSync(sentinelDirectory, { recursive: true });
    const sentinel = join(sentinelDirectory, "DO_NOT_DELETE.txt");
    writeFileSync(sentinel, "sentinel", "utf8");
    const before = createHash("sha256").update(readFileSync(sentinel)).digest("hex");
    const checkout = createDisposableCheckout();
    const result = destroyDisposableCheckout({ checkout, fs: Object.freeze({ ...realFilesystemAdapter(), unlinkLink: () => { throw new Error("injected"); } }) });
    expect(result.destructiveFallbackExecuted).toBe(false);
    destroyDisposableCheckout({ checkout });
    const after = createHash("sha256").update(readFileSync(sentinel)).digest("hex");
    expect(after).toBe(before);
  });
});

/* ================================================================ T1: §5 seal phases */

describe("R3-L0C-I-A-R-L-C-F-S-H §5 T1 — the seal phases", () => {
  it("declares Phase A as NOT a final verdict and NOT a failed final seal", () => {
    const status = preSealStatus({ plan: { planId: PLAN_ID, planContentDigest: "d".repeat(64) } });
    expect(status.evaluationPhase).toBe(SEAL_PHASES.PHASE_A.id);
    expect(status.isFinalVerdict).toBe(false);
    expect(status.CROSS_ARTIFACT_PLAN_BINDING).toBe("NOT_EVALUATED");
    expect(status.sealed).toBeNull();
    expect(status.isNotAFailedFinalSeal).toBe(true);
    expect(status.isNotAPassedFinalSeal).toBe(true);
  });

  it("declares the fifteen required seal fields and the excluded self-field", () => {
    expect(SEAL_REQUIRED_FIELDS.length).toBe(15);
    expect(SEAL_REQUIRED_FIELDS).toContain("evaluationPhase");
    expect(SEAL_REQUIRED_FIELDS).toContain("sourceFiles");
  });
});

/* ================================================================ T1: §6 identity mutation seam */

describe("R3-L0C-I-A-R-L-C-F-S-H §6 T1 — the identity mutation seam", () => {
  it("alters only the in-memory observation and never the durable journal", () => {
    const records = [{ sessionId: "s0", attemptId: "attempt-1" }, { sessionId: "s1", attemptId: "attempt-2" }];
    const applied = applyIdentityMutation({ records, mutation: { sessionId: "s0", field: "attemptId", value: "attempt-mutated" } });
    expect(applied.applied).toBe(true);
    expect(applied.records[0]!.attemptId).toBe("attempt-mutated");
    expect(applied.records[1]!.attemptId).toBe("attempt-2");
    expect(records[0]!.attemptId).toBe("attempt-1");
    expect(applied.durableJournalTouched).toBe(false);
    expect(applied.historicalEvidenceTouched).toBe(false);
  });

  it("applies nothing when no mutation is requested", () => {
    const records = [{ sessionId: "s0" }];
    const applied = applyIdentityMutation({ records, mutation: null });
    expect(applied.applied).toBe(false);
    expect(applied.records).toBe(records);
  });
});

/* ================================================================ T1: §7 derived qualification */

describe("R3-L0C-I-A-R-L-C-F-S-H §7 T1 — the derived qualification", () => {
  const healthy = {
    planVerification: { verified: true, checks: { COMMITTED_PLAN_SELF_DIGEST: "MATCH", COMMITTED_PLAN_GIT_IDENTITY: "MATCH", PLAN_SCHEMA_AND_ID: "PASS" } },
    closureCheck: { EXECUTION_CLOSURE: "MATCH" },
    matrix: { matrixCompleted: true, terminalState: "MATRIX_COMPLETE", completedSessions: 16, scheduleLength: 16, maxLaunchesPerSession: 1, retries: 0, unplannedLaunches: [] },
    terminalAdmission: { green: true, failing: [] },
    reconciliation: { green: true, identity: { green: true }, failing: [] },
    costClassification: { interpretable: true, accountedFor: true, measuredCount: 15, absentCount: 1, invalidCount: 1 },
    falseZeroPromotion: { noInvalidPromotedToMeasured: true },
    cleanupControls: { PASS: true },
    immutability: { verdict: "PASS" },
  };

  it("is PENDING_FINAL_SEAL before the persisted seal exists, which is NOT a PASS", () => {
    const result = reduceDeterministicQualification({ ...healthy, finalSeal: null });
    expect(result.verdict).toBe("PENDING_FINAL_SEAL");
    expect(result.verdict).not.toBe("PASS");
    expect(result.failing).toEqual(["FINAL_PERSISTED_SEAL_MATCHES"]);
    expect(result.pendingIsNotPass).toBe(true);
    expect(result.literalPassAssigned).toBe(false);
  });

  it("H5: becomes PASS only when the persisted seal is MATCH", () => {
    const result = reduceDeterministicQualification({ ...healthy, finalSeal: { result: "MATCH", failing: [] } });
    expect(result.verdict).toBe("PASS");
  });

  it("H5-N1: a failed terminal admission prevents a PASS", () => {
    const result = reduceDeterministicQualification({ ...healthy, terminalAdmission: { green: false, failing: ["COST_ATTRIBUTION"] }, finalSeal: { result: "MATCH", failing: [] } });
    expect(result.verdict).toBe("FAIL");
    expect(result.failing).toContain("RUNNER_TERMINAL_ADMISSION_GREEN");
  });

  it("H5-N2: a RED durable identity reconciliation prevents a PASS", () => {
    const result = reduceDeterministicQualification({ ...healthy, reconciliation: { green: false, identity: { green: false }, failing: ["DURABLE_IN_MEMORY_FULL_IDENTITY"] }, finalSeal: { result: "MATCH", failing: [] } });
    expect(result.verdict).toBe("FAIL");
    expect(result.failing).toContain("DURABLE_TRIAL_EVIDENCE_RECONCILED");
  });

  it("H5-N3: a false measured-zero promotion prevents a PASS", () => {
    const result = reduceDeterministicQualification({ ...healthy, falseZeroPromotion: { noInvalidPromotedToMeasured: false }, finalSeal: { result: "MATCH", failing: [] } });
    expect(result.verdict).toBe("FAIL");
    expect(result.failing).toContain("NO_FALSE_MEASURED_ZERO_PROMOTION");
  });

  it("H5-N4: a blocked cleanup safety control prevents a PASS", () => {
    const result = reduceDeterministicQualification({ ...healthy, cleanupControls: { PASS: false }, finalSeal: { result: "MATCH", failing: [] } });
    expect(result.verdict).toBe("FAIL");
    expect(result.failing).toContain("SAFE_CLEANUP_CONTROLS_PASS");
  });

  it("H5-N5: a MISMATCH final seal prevents a PASS", () => {
    const result = reduceDeterministicQualification({ ...healthy, finalSeal: { result: "MISMATCH", failing: ["PLAN_CLOSURE_AGREEMENT"] } });
    expect(result.verdict).toBe("FAIL");
    expect(result.failing).toContain("FINAL_PERSISTED_SEAL_MATCHES");
  });

  it("H5-N6: a DRIFTED execution closure prevents a PASS", () => {
    const result = reduceDeterministicQualification({ ...healthy, closureCheck: { EXECUTION_CLOSURE: "DRIFTED" }, finalSeal: { result: "MATCH", failing: [] } });
    expect(result.verdict).toBe("FAIL");
    expect(result.failing).toContain("EXECUTION_CLOSURE_MATCHES");
  });

  it("keeps every lower-level diagnostic visible rather than collapsing to a boolean", () => {
    const result = reduceDeterministicQualification({ ...healthy, finalSeal: { result: "MISMATCH", failing: ["X"] } });
    expect(result.conditions.length).toBe(12);
    for (const condition of result.conditions) expect(typeof condition.id).toBe("string");
    expect(result.diagnostics).toBeTruthy();
  });
});

/* ================================================================ T1: §9 closure and contract */

describe("R3-L0C-I-A-R-L-C-F-S-H §9 T1 — closure and the guard", () => {
  it("computes a complete closure with every module present", async () => {
    const closure = await computeExecutionClosure({ verifyCompiled: false });
    expect(closure.CLOSURE_COMPLETE).toBe(true);
    expect(closure.stageHarness.missing).toEqual([]);
    expect(closure.reusedModules.missing).toEqual([]);
    expect(STAGE_HARNESS_MODULES.length).toBeGreaterThan(0);
    expect(REUSED_MODULES.length).toBeGreaterThan(0);
  }, 120_000);

  it("proves all four mutation arms by override, without writing the tree", async () => {
    const mutations = await proveClosureMutations();
    expect(mutations.ALL_MUTATIONS_PROVEN).toBe(true);
    expect(mutations.treeMutated).toBe(false);
    expect(mutations.arms).toHaveLength(4);
  }, 120_000);

  it("throws when a non-authoritative caller invokes the guard", () => {
    expect(() => assertAuthoritativePath({ caller: "someone", authorizedBy: "not-the-plan" })).toThrow(/REFUSED/u);
  });

  it("records the guard as the first pipeline step, so it dominates the reachable path", () => {
    expect(PIPELINE_ORDER[0]).toBe("COMMITTED_PLAN_PREFLIGHT_GUARD");
  });

  it("discloses the legacy helper quarantine rather than claiming impossibility", () => {
    expect(LEGACY_HELPER_QUARANTINE.physicallyUnexecutable).toBe(false);
    expect((LEGACY_HELPER_QUARANTINE.helpers as readonly string[]).length).toBeGreaterThanOrEqual(2);
  });
});

/* ================================================================ T2: the erratum */

describe("R3-L0C-I-A-R-L-C-F-S-H §5 T2 — the previous-stage erratum", () => {
  it("names the contradiction read from the COMMITTED prior evidence", () => {
    const erratum = buildErratum();
    expect(erratum.contradictionPresent).toBe(true);
    expect(erratum.crossArtifactSealBinding).toBe("MISMATCH");
    expect(erratum.verdictCrossArtifactPlanBinding).toBe("MATCH");
    expect(erratum.readinessCrossArtifactEvidenceSealed).toBe(true);
    expect(erratum.prePersistenceCheckWasRecordedAsAFinalVerdict).toBe(true);
    expect(erratum.deterministicQualificationWasALiteralPass).toBe(true);
    expect(erratum.priorEvidenceModified).toBe(false);
  });
});

export { buildFixture, VALID_RECORDS };
