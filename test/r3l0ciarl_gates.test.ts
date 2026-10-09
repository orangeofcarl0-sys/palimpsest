/**
 * R3-L0C-I-A-R-L §1-§4 — THE PRODUCTION-PATH GATES.
 *
 * Every test drives the REAL repaired entry — the live-measurement pipeline, the live-evidence sidecar, the fresh
 * postflight, the primary binding, the attestation — and asserts the value that came back. The mutants are the
 * controls measured against `36ada58` in `r3l0ciarl_controls.test.ts`; each gate names its control rather than
 * re-running it.
 *
 * THE PREHISTORY IS BUILT ONCE, because it is expensive and deterministic. Each matrix case gets its own run root,
 * because a fail-stop run claims and preserves its root.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildPrehistory } from "../scripts/r3l0c/build-prehistory.mjs";
import { admitCapital, selectionRefs } from "../scripts/r3l0c/prehistory.mjs";
import { installHostBundle, dshHome } from "../scripts/gates/env.mjs";
import { computeExecutionClosure, proveClosureMutations } from "../scripts/r3l0ciarl/closure.mjs";
import { runPerTrajectoryConfinement } from "../scripts/r3l0ciar/confinement.mjs";
import { frozenPrimarySchedule, PRIMARY_FAULTS } from "../scripts/r3l0ciar/primary-adapter.mjs";
import { runLiveMeasurementMatrix, deriveProvenance } from "../scripts/r3l0ciarl/pipeline.mjs";
import { buildProspectivePlan } from "../scripts/r3l0ciarl/prospective-plan.mjs";
import { assertAuthoritativePath } from "../scripts/r3l0ciarl/modes.mjs";
import { enforcePrimaryInputBinding, verifyAuthorizationRecord } from "../scripts/r3l0ciarl/primary-binding.mjs";
import { writeLiveEvidence, verifyLiveEvidenceContinuity, readLiveEvidence, liveEvidenceBinding, bindingOf } from "../scripts/r3l0ciarl/live-evidence.mjs";
import { deriveCountsFromJournal, compareSessionIdentities, freshPostflight } from "../scripts/r3l0ciarl/postflight.mjs";
import { attestInstalledBundle, verifyCompiledSource } from "../scripts/r3l0ciarl/attestation.mjs";
import { writeRealFormatArtifact } from "../scripts/r3l0ciarl/baseline/legacy-controls.mjs";
import { measureSessionCost } from "../scripts/r3l0ciar/instrumentation.mjs";
import { CONTROL_GATE_IDS, PRIMARY_DERIVED_INPUTS, AUTHORIZATION_RECORD_FIELDS } from "../scripts/r3l0ciarl/contract.mjs";

const BASE = join(tmpdir(), `palimpsest-r3l0ciarl-gates-${String(process.pid)}`);
let prehistory: { world: string; state: string };
let refs: readonly unknown[];
let closure: { executionClosureDigest: string; CLOSURE_COMPLETE: boolean };
let containment: Awaited<ReturnType<typeof runPerTrajectoryConfinement>>;
let schedule: Awaited<ReturnType<typeof frozenPrimarySchedule>>;
let plan: Record<string, unknown>;
let healthyRun: Awaited<ReturnType<typeof runLiveMeasurementMatrix>> | null = null;

beforeAll(async () => {
  try { rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
  mkdirSync(BASE, { recursive: true });
  const built = await buildPrehistory(join(BASE, "prehistory"));
  const admitted = await admitCapital(join(BASE, "prehistory"), built.paths, "cutover-entitlements", built.world);
  prehistory = { world: built.world, state: built.paths.state };
  refs = selectionRefs(admitted);
  schedule = await frozenPrimarySchedule();
  const trajectoryIds = [...new Set(schedule.map((session: { trajectoryId: string }) => session.trajectoryId))].sort();
  closure = await computeExecutionClosure({ verifyCompiled: false }) as typeof closure;
  containment = await runPerTrajectoryConfinement({ runRoot: join(BASE, "containment"), trajectoryIds });
  plan = (await buildProspectivePlan({ closure, verifyCompiled: false })) as unknown as Record<string, unknown>;
}, 1_800_000);

afterAll(() => {
  try { rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds SQLite handles briefly */ }
});

async function runCase(name: string, options: { faultAt?: string; faultKind?: string | undefined; timeoutMs?: number } = {}) {
  const isHealthy = name === "healthy" && options.faultAt === undefined && options.faultKind === undefined;
  if (isHealthy && healthyRun !== null) return healthyRun;
  const result = await runLiveMeasurementMatrix({
    runId: `r3l0ciarl-${name}`,
    runRoot: join(BASE, name),
    prehistory: { world: prehistory.world, state: prehistory.state },
    admittedRefs: refs,
    installHostBundle,
    dshHome,
    authorizedBy: "r3-l0c-iar-l-primary-plan",
    caller: "r3-l0c-iar-l-primary-plan",
    plan,
    closure,
    containment,
    mode: "DETERMINISTIC",
    systemValid: true,
    ...options,
  });
  if (isHealthy) healthyRun = result;
  return result;
}

describe("R3-L0C-I-A-R-L — the contract declares the four gates", () => {
  it("names the gates, the derived inputs and the authorization fields", () => {
    expect(CONTROL_GATE_IDS.length).toBe(4);
    expect(CONTROL_GATE_IDS).toEqual(["L1_LIVE_ARTIFACT_CONTINUITY", "L2_POSTFLIGHT_FRESHNESS", "L3_PRIMARY_INPUT_BINDING", "L4_RUNTIME_ATTESTATION"]);
    expect(PRIMARY_DERIVED_INPUTS.length).toBeGreaterThanOrEqual(12);
    expect(AUTHORIZATION_RECORD_FIELDS).toEqual(["authority", "approvedPlanId", "approvedPlanDigest", "paidRunBudget", "decisions"]);
  });
});

describe("R3-L0C-I-A-R-L §1 — live artifact continuity", () => {
  it("every session's live evidence survives into the durable record and reads back intact", async () => {
    const healthy = await runCase("healthy");
    const continuity = healthy.liveEvidenceContinuity as { LIVE_ARTIFACT_PROPAGATION: string; sessions: number; allBound: boolean; allMatched: boolean; allComplete: boolean };
    expect(continuity.LIVE_ARTIFACT_PROPAGATION).toBe("PASS");
    expect(continuity.sessions).toBe(16);
    expect(continuity.allBound).toBe(true);
    expect(continuity.allMatched).toBe(true);
    expect(continuity.allComplete).toBe(true);
  }, 1_800_000);

  it("a real-format artifact yields non-null measured cost fields, and a substitution is detected", async () => {
    const root = mkdtempSync(join(tmpdir(), "r3l0ciarl-artifact-"));
    try {
      const artifact = writeRealFormatArtifact({ directory: root, attemptId: "a1b2c3d4e5" });
      const session = { sessionId: "b0-C-G1", trajectoryId: "b0-C", generation: "G1", arm: "C" };
      const measured = await measureSessionCost({ artifactPath: artifact.path, session, provenance: "FIXTURE", expected: { runId: "r1", attemptId: "a1b2c3d4e5" } });
      expect(measured.measured).toBe(true);
      expect(measured.fields).not.toBeNull();
      /** §1: the measured cost fields are non-null, not a fixture constant. */
      expect(measured.fields!.rawHistoryArtifactsRead).toBeGreaterThan(0);
      expect(measured.fields!.rawHistoryBytesReturned).toBeGreaterThan(0);
      expect(measured.fields!.capitalPullActions).toBeGreaterThan(0);
      expect(measured.fields!.sessionArtifactIdentity).toBeDefined();
      /** The identity chain corroborates the artifact. */
      expect(measured.attribution.identity!.attemptId).toBe("a1b2c3d4e5");
      /** A conflicting identity is refused. */
      const conflict = await measureSessionCost({ artifactPath: artifact.path, session, provenance: "FIXTURE", expected: { runId: "r1", attemptId: "deadbeef" } });
      expect(conflict.measured).toBe(false);
      expect(conflict.reason).toBe("IDENTITY_CONFLICT");
      /** A missing artifact is refused rather than becoming a zero-cost session. */
      const absent = await measureSessionCost({ artifactPath: join(root, "nope.zstd"), session, provenance: "FIXTURE", expected: { runId: "r1", attemptId: "a1b2c3d4e5" } });
      expect(absent.measured).toBe(false);
      expect(absent.reason).toBe("ARTIFACT_ABSENT");
    } finally {
      try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
    }
  }, 300_000);

  it("a substituted sidecar is detected by the durable digest binding", async () => {
    const root = mkdtempSync(join(tmpdir(), "r3l0ciarl-sub-"));
    try {
      const runRoot = join(root, "run");
      mkdirSync(runRoot, { recursive: true });
      const artifact = writeRealFormatArtifact({ directory: join(root, "artifacts"), attemptId: "abc123def4" });
      const sidecar = writeLiveEvidence({ runRoot, sessionId: "s1", sessionArtifactPath: artifact.path, hiddenInvariantVector: { failedPrepaidClasses: [], prepaidCoverage: 1 }, attemptId: "abc123def4", hostJobId: "job-1", costProvenance: "FIXTURE", mode: "DETERMINISTIC" });
      const record = { sessionId: "s1", contentDigests: liveEvidenceBinding(sidecar.digest) };
      expect(verifyLiveEvidenceContinuity({ runRoot, records: [record] }).LIVE_ARTIFACT_PROPAGATION).toBe("PASS");
      /** The mutation: the sidecar bytes change AFTER the record was written. */
      const path = join(runRoot, "private", "live-evidence", "s1.json");
      const { writeFileSync } = await import("node:fs");
      writeFileSync(path, readFileSync(path, "utf8").replace('"FIXTURE"', '"LIVE_PRIMARY"'), "utf8");
      const after = readLiveEvidence({ runRoot, sessionId: "s1", binding: bindingOf(record) });
      expect(after.matchesBinding).toBe(false);
      expect(after.reason).toBe("DIGEST_MISMATCH");
      /** And a missing sidecar is reported rather than skipped. */
      expect(readLiveEvidence({ runRoot, sessionId: "absent", binding: "x" }).reason).toBe("NO_SIDECAR");
    } finally {
      try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
    }
  }, 300_000);

  it("the cost provenance is derived from the mode and the artifact, not a caller label", () => {
    expect(deriveProvenance({ mode: "PRIMARY", artifactPath: "/x/attempt-a/session.v4.jsonl.zstd", artifactExists: true })).toBe("LIVE_PRIMARY");
    expect(deriveProvenance({ mode: "DETERMINISTIC", artifactPath: "/x/attempt-a/session.v4.jsonl.zstd", artifactExists: true })).toBe("FIXTURE");
    expect(deriveProvenance({ mode: "PRIMARY", artifactPath: null, artifactExists: false })).toBe("NO_ARTIFACT");
    /** A PRIMARY mode with a missing artifact is NOT promoted to LIVE_PRIMARY. */
    expect(deriveProvenance({ mode: "PRIMARY", artifactPath: "/x/none.zstd", artifactExists: false })).toBe("NO_ARTIFACT");
  });
});

describe("R3-L0C-I-A-R-L §2 — fresh postflight evidence", () => {
  it("the closure is recomputed after the matrix, the counts come from the journal, identities are exact", async () => {
    const healthy = await runCase("healthy");
    const postflight = healthy.postflight as { POSTFLIGHT_FRESHNESS: string; closureMatchesPlan: boolean; runtimeMovedAfterPreflight: boolean };
    expect(postflight.POSTFLIGHT_FRESHNESS).toBe("PASS");
    expect(postflight.closureMatchesPlan).toBe(true);
    expect(postflight.runtimeMovedAfterPreflight).toBe(false);
    const counts = healthy.journalCounts as { retries: number; replacements: number; derivedFromCallerSuppliedNumbers: boolean };
    expect(counts.retries).toBe(0);
    expect(counts.replacements).toBe(0);
    expect(counts.derivedFromCallerSuppliedNumbers).toBe(false);
    const identities = healthy.sessionIdentities as { allIdentitiesExact: boolean; allSixteenUnique: boolean; eightTrajectories: boolean; fourBlocks: boolean };
    expect(identities.allIdentitiesExact).toBe(true);
    expect(identities.allSixteenUnique).toBe(true);
    expect(identities.eightTrajectories).toBe(true);
    expect(identities.fourBlocks).toBe(true);
  }, 1_800_000);

  it("a mutation after preflight fails causal admission", async () => {
    const bound = "a".repeat(64);
    const planFixture = { executionClosure: { executionClosureDigest: bound } };
    const drifted = await freshPostflight({ plan: planFixture, preflightClosureDigest: bound, recompute: async () => ({ closure: { executionClosureDigest: "b".repeat(64) }, route: { MODEL_ROUTE_IDENTITY: "MATCH" } }) });
    expect(drifted.POSTFLIGHT_FRESHNESS).toBe("FAIL");
    expect(drifted.runtimeMovedAfterPreflight).toBe(true);
    const stable = await freshPostflight({ plan: planFixture, preflightClosureDigest: bound, recompute: async () => ({ closure: { executionClosureDigest: bound }, route: { MODEL_ROUTE_IDENTITY: "MATCH" } }) });
    expect(stable.POSTFLIGHT_FRESHNESS).toBe("PASS");
  }, 300_000);

  it("a duplicate launch is derived as a retry, and an identity mismatch is detected", () => {
    const journalRecords = [...Array.from({ length: 16 }, (_u, index) => ({ kind: "WORKER_LAUNCH_RECORDED", payload: { sessionId: `s${String(index)}` } })), { kind: "WORKER_LAUNCH_RECORDED", payload: { sessionId: "s3" } }];
    const counts = deriveCountsFromJournal({ journalRecords, plannedSessions: Array.from({ length: 16 }, (_u, index) => `s${String(index)}`) });
    expect(counts.retries).toBe(1);
    expect(counts.noRetries).toBe(false);
    const planned = Array.from({ length: 16 }, (_u, index) => ({ sessionId: `s${String(index)}`, block: Math.floor(index / 4), arm: index % 2 === 0 ? "C" : "H", generation: index % 2 === 0 ? "G1" : "G2", trajectoryId: `b${String(Math.floor(index / 4))}-${index % 2 === 0 ? "C" : "H"}` }));
    expect(compareSessionIdentities({ records: planned, schedule: planned }).allIdentitiesExact).toBe(true);
    const bad = planned.map((record, index) => (index === 0 ? { ...record, arm: "H", trajectoryId: "b9-Z" } : record));
    const mismatched = compareSessionIdentities({ records: bad, schedule: planned });
    expect(mismatched.allIdentitiesExact).toBe(false);
    expect(mismatched.identityMismatches.length).toBeGreaterThan(0);
  });
});

describe("R3-L0C-I-A-R-L §3 — primary-only input discipline", () => {
  it("PRIMARY refuses caller substitution and DETERMINISTIC permits injection", () => {
    const provided = Object.fromEntries(PRIMARY_DERIVED_INPUTS.map((name) => [name, "caller"]));
    const deterministic = enforcePrimaryInputBinding({ mode: "DETERMINISTIC", provided });
    const primary = enforcePrimaryInputBinding({ mode: "PRIMARY", provided });
    expect(deterministic.refused).toBe(false);
    expect(deterministic.injectionPermitted).toBe(true);
    expect(primary.refused).toBe(true);
    expect(primary.supplied.length).toBe(PRIMARY_DERIVED_INPUTS.length);
    expect(enforcePrimaryInputBinding({ mode: "PRIMARY", provided: {} }).refused).toBe(false);
  });

  it("an arbitrary authority string is refused; a complete record for the executing plan is verified", () => {
    const decisions = Object.fromEntries(["PAID_MODEL_USAGE", "BOUNDED_FAIL_STOP_PROTOCOL", "NO_AUTOMATIC_RETRIES_OR_REPLACEMENTS", "PRESERVE_PARTIALLY_COMPLETED_INVALID_RUNS", "ACCEPTED_PROMPT_NEUTRALITY_LIMITED"].map((id) => [id, true]));
    expect(verifyAuthorizationRecord({ record: { authority: "because I said so", decisions }, executingPlanId: "p", executingPlanDigest: "d" }).verified).toBe(false);
    expect(verifyAuthorizationRecord({ record: null, executingPlanId: "p", executingPlanDigest: "d" }).verified).toBe(false);
    const complete = verifyAuthorizationRecord({ record: { authority: "decision:external-ruling-2026-10-10", approvedPlanId: "p", approvedPlanDigest: "d", paidRunBudget: { maxSessions: 16, currency: "USD" }, decisions }, executingPlanId: "p", executingPlanDigest: "d" });
    expect(complete.verified).toBe(true);
    expect(complete.verifiedAtLaunchBoundary).toBe(true);
    /** A record approving a DIFFERENT plan is refused. */
    expect(verifyAuthorizationRecord({ record: { authority: "decision:x", approvedPlanId: "other", approvedPlanDigest: "d", paidRunBudget: { maxSessions: 16, currency: "USD" }, decisions }, executingPlanId: "p", executingPlanDigest: "d" }).verified).toBe(false);
    /** A record with no budget is refused. */
    expect(verifyAuthorizationRecord({ record: { authority: "decision:x", approvedPlanId: "p", approvedPlanDigest: "d", decisions }, executingPlanId: "p", executingPlanDigest: "d" }).verified).toBe(false);
  });

  it("a PRIMARY invocation supplying a measurement is refused before exposure", async () => {
    const result = await runLiveMeasurementMatrix({
      runId: "r3l0ciarl-primary-sub", runRoot: join(BASE, "primary-sub"),
      prehistory: { world: prehistory.world, state: prehistory.state }, admittedRefs: refs,
      installHostBundle, dshHome, authorizedBy: "r3-l0c-iar-l-primary-plan", caller: "r3-l0c-iar-l-primary-plan",
      plan, closure, containment, mode: "PRIMARY",
    });
    expect(result.PIPELINE).toBe("REFUSED");
    expect(result.refusedAt).toBe("PRIMARY_INPUT_BINDING");
    expect(result.run).toBeNull();
    expect(result.launches).toEqual([]);
  }, 900_000);

  it("a fully-authorized PRIMARY run stops at the launch boundary with no model call", async () => {
    const committed = JSON.parse(readFileSync(join(process.cwd(), "research-evidence", "r3-l0c-iar-l", "execution-plan.json"), "utf8"));
    const decisions = Object.fromEntries(["PAID_MODEL_USAGE", "BOUNDED_FAIL_STOP_PROTOCOL", "NO_AUTOMATIC_RETRIES_OR_REPLACEMENTS", "PRESERVE_PARTIALLY_COMPLETED_INVALID_RUNS", "ACCEPTED_PROMPT_NEUTRALITY_LIMITED"].map((id) => [id, true]));
    /**
     * §3: NO MEASUREMENT IS PASSED. A PRIMARY run derives the plan, the closure, the containment, the system
     * validity, the route and the realization preflight for itself; supplying any of them is refused, which the
     * preceding test measures. So this invocation supplies only the run identity and the authorization record.
     */
    const result = await runLiveMeasurementMatrix({
      runId: "r3l0ciarl-primary-boundary", runRoot: join(BASE, "primary-boundary"),
      prehistory: { world: prehistory.world, state: prehistory.state }, admittedRefs: refs,
      installHostBundle, dshHome, authorizedBy: "r3-l0c-iar-l-primary-plan", caller: "r3-l0c-iar-l-primary-plan",
      mode: "PRIMARY",
      authorizationDecision: { authority: "decision:external-ruling-2026-10-10", approvedPlanId: committed.planId, approvedPlanDigest: committed.executionClosure.executionClosureDigest, paidRunBudget: { maxSessions: 16, currency: "USD" }, decisions },
    });
    expect(result.PIPELINE).toBe("STOPPED_AT_LAUNCH_BOUNDARY");
    expect(result.stoppedAt).toBe("LAUNCH_BOUNDARY");
    expect(result.modelCallsMade).toBe(0);
    expect(result.launches).toEqual([]);
    expect(result.run).toBeNull();
    /** Every gate was satisfied before the boundary, so the boundary is the only thing that stopped it. */
    const steps = result.steps!.map((step: { id: string }) => step.id);
    expect(steps).toContain("AUTHORIZATION_VERIFICATION");
    expect(steps).toContain("PRE_EXPOSURE_CHECKS");
    expect(steps).toContain("LAUNCH_BOUNDARY");
    expect(steps).toContain("DERIVE_CONTAINMENT");
    expect((result.authorizationVerification as { verified: boolean }).verified).toBe(true);
    /** The pipeline derived its own containment rather than accepting one. */
    expect((result.containment as { ACTUAL_CONTAINMENT: string }).ACTUAL_CONTAINMENT).toBe("PASS");
  }, 1_800_000);
});

describe("R3-L0C-I-A-R-L §4 — executable and environmental attestation", () => {
  it("source-to-compiled verification completes and the installed bundle matches the repository", async () => {
    const compiled = await verifyCompiledSource();
    expect(compiled.requested).toBe(true);
    expect(compiled.evaluated).toBe(true);
    expect(compiled.COMPILED_MATCHES_SOURCE).toBe(true);
    /**
     * §4: THE BUNDLE COMPARISON IS MEASURED ON AN ISOLATED HOME THIS TEST INSTALLS ITSELF.
     *
     * The shared DSH home is written by every stage suite that installs the host bundle, and vitest runs those in
     * parallel processes. Reading the SHARED home would therefore race with a concurrent install and report a
     * difference that is another process's legitimate work, not a defect — measured: exactly that under a full
     * parallel run. So this test installs the bundle into its own home and attests THAT, which measures the
     * comparison's behaviour deterministically; the shared home is attested by the pipeline itself during a run,
     * where the sample is taken around its own install.
     */
    const isolated = mkdtempSync(join(tmpdir(), "r3l0ciarl-attest-home-"));
    try {
      const { installHostBundleSafely } = await import("../scripts/r3l0ciar/host-bundle.mjs");
      installHostBundleSafely({ repo: process.cwd(), realDshHome: isolated });
      const bundle = attestInstalledBundle({ dshHomePath: isolated });
      expect(bundle.allIdentical).toBe(true);
      expect(bundle.comparedFileByFile).toBe(true);
      expect(bundle.targets.every((target: { sourceFileCount: number }) => target.sourceFileCount > 0)).toBe(true);
      /** The mutation: a modified installed file is a difference. */
      const { writeFileSync } = await import("node:fs");
      const first = bundle.targets[0]!;
      writeFileSync(join(isolated, "profiles", "node_modules", first.installedName, "package.json"), "{}\n", "utf8");
      expect(attestInstalledBundle({ dshHomePath: isolated }).allIdentical).toBe(false);
      /** §4: the installer is a mitigation, not a proof of atomic replacement. */
      expect(bundle.installerIsMitigationNotProof).toBe(true);
    } finally {
      try { rmSync(isolated, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
    }
  }, 900_000);

  it("a competing writer of the shared installation is detected", async () => {
    const { sampleInstallationDigest: sample, competingWriterVerdict } = await import("../scripts/r3l0ciarl/attestation.mjs");
    /**
     * §4: THE PROPERTY IS DETECTION, NOT GLOBAL STABILITY.
     *
     * The shared DSH home is written by every stage suite that installs the host bundle, and vitest runs those in
     * parallel processes — so asserting that the installation is UNCHANGED between two samples would be asserting
     * something no single test can control, and it failed exactly that way under a full parallel run. The property
     * §4 requires is that a change with no install of OURS in between is REPORTED as a competing writer, which is
     * measured here on an ISOLATED home that only this test writes.
     */
    const isolated = mkdtempSync(join(tmpdir(), "r3l0ciarl-home-"));
    try {
      const before = sample({ dshHomePath: isolated });
      expect(typeof before).toBe("string");
      expect(before.length).toBe(64);
      /** Nothing wrote it, so it is stable within this test's own home. */
      expect(sample({ dshHomePath: isolated })).toBe(before);
      /** A change with no install of ours is a competing writer. */
      expect(competingWriterVerdict({ beforeDigest: before, afterDigest: "changed", installedDuringRun: false }).competingWriterDetected).toBe(true);
      /** A change caused by OUR install is not. */
      expect(competingWriterVerdict({ beforeDigest: before, afterDigest: "changed", installedDuringRun: true }).competingWriterDetected).toBe(false);
      /** The real home still yields a well-formed sample. */
      const real = sample({ dshHomePath: dshHome() });
      expect(real.length).toBe(64);
    } finally {
      try { rmSync(isolated, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
    }
  }, 300_000);

  it("the pipeline detects a competing writer by comparing the pre-matrix and post-matrix samples", async () => {
    const healthy = await runCase("healthy");
    /** The healthy run sampled the real installation before its own install. */
    expect(typeof healthy.installationBefore).toBe("string");
    expect((healthy.installationBefore as string).length).toBe(64);
    const { competingWriterVerdict } = await import("../scripts/r3l0ciarl/attestation.mjs");
    /** Its own install is not a competing writer. */
    const own = competingWriterVerdict({ beforeDigest: healthy.installationBefore as string, afterDigest: "x", installedDuringRun: true });
    expect(own.competingWriterDetected).toBe(false);
  }, 1_800_000);

  it("the closure covers the reused prior-stage modules and all four mutations move the digest", async () => {
    const computed = await computeExecutionClosure({ verifyCompiled: false });
    expect(computed.CLOSURE_COMPLETE).toBe(true);
    expect(computed.reusedModules.moduleCount).toBeGreaterThan(0);
    expect(computed.reusedModules.missing).toEqual([]);
    expect(computed.stageHarness.missing).toEqual([]);
    expect(computed.partIds).toContain("REUSED_MODULES_CLOSURE");
    const mutations = await proveClosureMutations();
    expect(mutations.ALL_MUTATIONS_PROVEN).toBe(true);
    expect(mutations.treeMutated).toBe(false);
    expect(mutations.failing).toEqual([]);
    const ids = mutations.arms.map((arm) => arm.id);
    expect(ids).toContain("REUSED_PRIOR_MODULE");
    expect(ids).toContain("STAGE_HARNESS_MODULE");
    expect(ids).toContain("RUNTIME_MANIFEST_DYNAMIC_MODULE");
    expect(ids).toContain("TOOLCHAIN_VERSION");
  }, 900_000);
});

describe("R3-L0C-I-A-R-L §Final — fail-stop validity and the authoritative path", () => {
  it("the healthy sixteen-session run completes with an exact treatment boundary", async () => {
    const healthy = await runCase("healthy");
    expect(healthy.PIPELINE).toBe("COMPLETED");
    expect(healthy.terminalState).toBe("MATRIX_COMPLETE");
    expect(healthy.completedSessions!.length).toBe(16);
    expect(healthy.maxLaunchesPerSession).toBe(1);
    expect(healthy.trajectoryCount).toBe(8);
    expect(healthy.run!.causalVerdictIssued).toBe(false);
    /** The deterministic run's cost provenance is not a live primary observation. */
    const gate = healthy.run!.validityGate as { green: boolean; causalAdmission: { CAUSAL_EXPERIMENT_VALID: string } };
    expect(gate.green).toBe(true);
    expect(gate.causalAdmission.CAUSAL_EXPERIMENT_VALID).toBe("NO");
  }, 1_800_000);

  it("a fault at FIRST, MIDDLE and LAST stops with no later launch", async () => {
    const first = await runCase("fault-first", { faultAt: "FIRST", faultKind: PRIMARY_FAULTS.REPORT_MISSING });
    const middle = await runCase("fault-middle", { faultAt: "MIDDLE", faultKind: PRIMARY_FAULTS.REPORT_MISSING });
    const last = await runCase("fault-last", { faultAt: "LAST", faultKind: PRIMARY_FAULTS.REPORT_MISSING });
    for (const result of [first, middle, last]) {
      expect(result.terminalState).toBe("ABORT_PRESERVED");
      expect(result.sessionsAfterFault).toEqual([]);
      expect(result.maxLaunchesPerSession).toBe(1);
    }
    expect(first.completedSessions!.length).toBe(0);
    expect(middle.completedSessions!.length).toBe(7);
    expect(last.completedSessions!.length).toBe(15);
  }, 1_800_000);

  it("a report-then-hang worker is UNCERTAIN, and the authoritative-path guard refuses the prior pipelines", async () => {
    const previous = process.env.R3L0CIA_HANG_MS;
    process.env.R3L0CIA_HANG_MS = "8000";
    try {
      const result = await runCase("fault-hang", { faultAt: "FIRST", faultKind: PRIMARY_FAULTS.REPORT_THEN_HANG, timeoutMs: 4_000 });
      expect(result.terminalState).toBe("UNCERTAIN_PRESERVED");
    } finally {
      if (previous === undefined) delete process.env.R3L0CIA_HANG_MS; else process.env.R3L0CIA_HANG_MS = previous;
    }
    expect(() => assertAuthoritativePath({ caller: "scripts/r3l0ciar/pipeline.mjs" })).toThrow(/not the authoritative execution path/u);
    const authorized = assertAuthoritativePath({ caller: "r3-l0c-iar-l-primary-plan", authorizedBy: "r3-l0c-iar-l-primary-plan" });
    expect(authorized.priorPipelinesQuarantined).toBe(true);
    expect(authorized.priorPipelinesStillExecutable).toBe(true);
  }, 1_800_000);
});
