/**
 * R3-L0C-I-A-R-L-C §3-§6 — THE PRODUCTION-PATH GATES.
 *
 * Every test drives the REAL corrected entry — the admission-closure pipeline, the durable cost bridge, the
 * terminal-admission reducer, the trust boundary, the in-run attestation — and asserts the value that came back.
 * The mutants are the controls measured against `6089947` in `r3l0ciarlc_controls.test.ts`; each gate names its
 * control rather than re-running it.
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
import { computeExecutionClosure, proveClosureMutations, REUSED_MODULES, STAGE_HARNESS_MODULES } from "../scripts/r3l0ciarlc/closure.mjs";
import { runPerTrajectoryConfinement } from "../scripts/r3l0ciar/confinement.mjs";
import { frozenPrimarySchedule, PRIMARY_FAULTS } from "../scripts/r3l0ciar/primary-adapter.mjs";
import { runAdmissionClosureMatrix, deriveProvenance } from "../scripts/r3l0ciarlc/pipeline.mjs";
import { buildProspectivePlan, writeProspectivePlan, checkPlanClosure, PLAN_ID } from "../scripts/r3l0ciarlc/prospective-plan.mjs";
import { assertAuthoritativePath } from "../scripts/r3l0ciarlc/modes.mjs";
import { enforcePrimaryInputBinding, verifyExternalAuthority, planContentDigest, trustedAuthoritySource, schemaValidity, enforceableBudget } from "../scripts/r3l0ciarlc/trust-boundary.mjs";
import { bridgeMatrixCost, attributeSessionFromRecord } from "../scripts/r3l0ciarlc/cost-bridge.mjs";
import { authoritativeTerminalAdmission } from "../scripts/r3l0ciarlc/postmatrix-admission.mjs";
import { competingWriterVerdict, inRunAttestation, sampleInstallationDigest, compareInstalledBundle } from "../scripts/r3l0ciarlc/attestation.mjs";
import { verifyCompiledSource } from "../scripts/r3l0ciarlc/attestation.mjs";
import { verifyCompiledSourceIsolated, COMPILED_PAIRS } from "../scripts/r3l0ciarlc/compiled-verification.mjs";
import { verifyCompiledSource as frozenVerifyCompiledSource } from "../scripts/r3l0ciarl/attestation.mjs";
import { controlDurableCostBridge, controlTerminalAdmission, controlTrustBoundary, controlInRunAttestation } from "../scripts/r3l0ciarlc/acceptance.mjs";
import { deterministicArtifactFixture } from "../scripts/r3l0ciarlc/qualification.mjs";
import { writeRealFormatArtifact } from "../scripts/r3l0ciarlc/baseline/legacy-controls.mjs";
import {
  CONTROL_GATE_IDS, PRIMARY_DERIVED_INPUTS, PRIMARY_REFUSED_INPUTS, TRUSTED_HOST_INPUTS, EXPERIMENTAL_INPUTS,
  TERMINAL_ADMISSION_CONDITIONS, ATTESTATION_RULES, LIVE_PRIMARY_EVIDENCE, FROZEN_SESSION_SCOPE,
} from "../scripts/r3l0ciarlc/contract.mjs";

const BASE = join(tmpdir(), `palimpsest-r3l0ciarlc-gates-${String(process.pid)}`);
let prehistory: { world: string; state: string };
let refs: readonly unknown[];
let closure: Awaited<ReturnType<typeof computeExecutionClosure>>;
let containment: Awaited<ReturnType<typeof runPerTrajectoryConfinement>>;
let schedule: Awaited<ReturnType<typeof frozenPrimarySchedule>>;
let plan: Awaited<ReturnType<typeof buildProspectivePlan>>;
let compiledVerification: Awaited<ReturnType<typeof verifyCompiledSource>>;
let healthyRun: Awaited<ReturnType<typeof runAdmissionClosureMatrix>> | null = null;

beforeAll(async () => {
  try { rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
  mkdirSync(BASE, { recursive: true });
  const built = await buildPrehistory(join(BASE, "prehistory"));
  const admitted = await admitCapital(join(BASE, "prehistory"), built.paths, "cutover-entitlements", built.world);
  prehistory = { world: built.world, state: built.paths.state };
  refs = selectionRefs(admitted);
  schedule = await frozenPrimarySchedule();
  const trajectoryIds = [...new Set(schedule.map((session) => session.trajectoryId))].sort();
  closure = await computeExecutionClosure({ verifyCompiled: false });
  containment = await runPerTrajectoryConfinement({ runRoot: join(BASE, "containment"), trajectoryIds });
  plan = await buildProspectivePlan({ closure, verifyCompiled: false });
  /** Measured ONCE, because it emits at the repository root and runs a full compiler invocation. */
  compiledVerification = await verifyCompiledSource();
}, 900_000);

afterAll(() => {
  try { rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
});

/**
 * The common matrix inputs, with an ISOLATED DSH home per case.
 *
 * §6 requires the attestation mutations to run "in an isolated DSH installation environment, not by transiently
 * rewriting files shared by parallel test processes". An isolated home per case also removes the contention the
 * shared installation would otherwise create between the matrices this suite runs.
 *
 * THE SOURCE-TO-COMPILED VERIFICATION IS COMPUTED ONCE, in `beforeAll`, and injected. It writes a probe
 * configuration and an emit directory at the repository root and runs a full `tsc`, so re-running it per matrix
 * would both cost minutes and race the frozen R3-L0C-F tests that use the same probe path. It is a property of the
 * repository rather than of a run, so one measurement is the right one; the seam is DETERMINISTIC-only and refused
 * in PRIMARY.
 */
async function matrixInputs(runId: string, extra: Record<string, unknown> = {}) {
  const caseRoot = join(BASE, runId);
  const artifactRoot = join(caseRoot, "artifacts");
  const isolatedHome = join(caseRoot, ".dsh");
  mkdirSync(artifactRoot, { recursive: true });
  mkdirSync(join(isolatedHome, "profiles", "node_modules"), { recursive: true });
  const artifactFixture = await deterministicArtifactFixture({ artifactRoot });
  return {
    prehistory, admittedRefs: refs, installHostBundle, dshHome: () => isolatedHome,
    authorizedBy: PLAN_ID, caller: PLAN_ID, plan, closure, containment,
    mode: "DETERMINISTIC", systemValid: true, artifactRoot, artifactFixture,
    terminalCompiledVerification: compiledVerification,
    runId, runRoot: caseRoot, isolatedHome, ...extra,
  };
}

describe("R3-L0C-I-A-R-L-C — the authoritative path", () => {
  it("guards the authoritative path and quarantines the prior pipelines", () => {
    expect(() => assertAuthoritativePath({ caller: "r3-l0c-iar-l-primary-plan", authorizedBy: "r3-l0c-iar-l-primary-plan" })).toThrow(/not the authoritative execution path/u);
    const guard = assertAuthoritativePath({ caller: PLAN_ID, authorizedBy: PLAN_ID });
    expect(guard.authorized).toBe(true);
    expect(guard.priorPipelinesQuarantined).toBe(true);
    expect(guard.priorPipelinesStillExecutable).toBe(true);
  });

  it("§3 Gate A: attributes a non-null reconstruction cost from a genuine journal readback", async () => {
    const control = await controlDurableCostBridge();
    expect(control.PASS).toBe(true);
    expect(control.positiveControl.measured).toBe(true);
    expect(control.positiveControl.provenance).toBe("FIXTURE");
    expect(control.positiveControl.fieldsNonNull).toBe(true);
    expect(control.positiveControl.rawHistoryArtifactsRead).toBe(1);
    expect(control.positiveControl.matrixInterpretable).toBe(true);
    expect(control.mutations.substitutedSidecarDetected).toBe(true);
    expect(control.mutations.modifiedArtifactDetected).toBe(true);
    expect(control.mutations.missingArtifactDetected).toBe(true);
    expect(control.mutations.missingSidecarDetected).toBe(true);
    expect(control.mutations.identityConflictDetected).toBe(true);
    expect(control.mutations.ambiguousCandidatesReported).toBe(true);
    expect(control.mutations.absentMeasurementsAreNullNotZero).toBe(true);
  }, 600_000);

  it("§3: a legitimate measured zero is distinguishable from missing evidence", async () => {
    const root = mkdtempSync(join(tmpdir(), "r3l0ciarlc-zero-"));
    try {
      const runRoot = join(root, "run");
      mkdirSync(runRoot, { recursive: true });
      /** An artifact with NO corpus read, so the count is a genuine zero rather than an absence. */
      const { writeFileSync } = await import("node:fs");
      const { zstdCompressSync } = await import("node:zlib");
      const artifactPath = join(root, "attempt-aaaaaaaaaaaa", "session.v4.jsonl.zstd");
      mkdirSync(join(root, "attempt-aaaaaaaaaaaa"), { recursive: true });
      writeFileSync(artifactPath, zstdCompressSync(Buffer.from(`${JSON.stringify({ type: "turn/start", time: 1, data: {} })}\n`, "utf8")));
      const { writeLiveEvidence, liveEvidenceBinding } = await import("../scripts/r3l0ciarl/live-evidence.mjs");
      const sidecar = writeLiveEvidence({ runRoot, sessionId: "s0", sessionArtifactPath: artifactPath, hiddenInvariantVector: { failedPrepaidClasses: [], prepaidCoverage: 1 }, attemptId: "aaaaaaaaaaaa", hostJobId: "job-1", costProvenance: "FIXTURE", mode: "DETERMINISTIC" });
      const record = { sessionId: "s0", attemptId: "aaaaaaaaaaaa", hostJobId: "job-1", intendedExecutorRoute: "the deterministic scripted worker", contentDigests: liveEvidenceBinding(sidecar.digest) };
      const measured = await attributeSessionFromRecord({ runRoot, record });
      expect(measured.measured).toBe(true);
      expect(measured.fields?.rawHistoryArtifactsRead).toBe(0);
      expect(measured.measuredZeroIsDistinguishableFromAbsence).toBe(true);
      /** A missing artifact yields NULL fields, not zeros. */
      const missing = await attributeSessionFromRecord({ runRoot, record: { ...record, contentDigests: liveEvidenceBinding("deadbeef") } });
      expect(missing.measured).toBe(false);
      expect(missing.fields).toBeNull();
    } finally {
      try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
    }
  }, 300_000);

  it("§3: provenance is derived from verified evidence, not a caller label", async () => {
    /** A PRIMARY label with a deterministic route must NOT be LIVE_PRIMARY. */
    const fixture = deriveProvenance({ mode: "DETERMINISTIC", artifactPath: "x.zstd", artifactExists: true });
    expect(fixture).toBe("FIXTURE");
    const noArtifact = deriveProvenance({ mode: "PRIMARY", artifactPath: null, artifactExists: false });
    expect(noArtifact).toBe("NO_ARTIFACT");
    expect(LIVE_PRIMARY_EVIDENCE.modeLabelAloneIsInsufficient).toBe(true);
    expect(LIVE_PRIMARY_EVIDENCE.fileExistenceAloneIsInsufficient).toBe(true);
    /** The bridge's own derivation: a deterministic record route cannot be LIVE_PRIMARY even if the sidecar says PRIMARY. */
    const { deriveBridgeProvenance } = await import("../scripts/r3l0ciarlc/cost-bridge.mjs");
    const derived = deriveBridgeProvenance({ record: { intendedExecutorRoute: "the deterministic scripted worker" }, sidecar: { mode: "PRIMARY" }, artifactDigestVerified: true });
    expect(derived.provenance).toBe("FIXTURE");
    expect(derived.live).toBe(false);
    expect(derived.basis.recordRouteIsPrimary).toBe(false);
  });

  it("§4 Gate B: the terminal-admission reducer is GREEN on a healthy matrix and RED on each mutation", async () => {
    const control = await controlTerminalAdmission();
    expect(control.PASS).toBe(true);
    expect(control.positiveControl.green).toBe(true);
    expect(control.positiveControl.decision).toBe("GREEN");
    expect(control.positiveControl.conditions).toBe(9);
    expect(control.positiveControl.journalReadAtAdmission).toBe(true);
    for (const name of ["closureDrift", "routeDrift", "duplicatedLaunch", "unexpectedSession", "identityMismatch", "damagedJournal", "missingAttribution", "attestationFail", "continuityFail"]) {
      expect(control.mutations[name].decision).toBe("RED");
    }
    expect(TERMINAL_ADMISSION_CONDITIONS.length).toBe(9);
  }, 600_000);

  it("§5 Gate C: schema validity is not authority, and no trusted source yields AUTHORITY_NOT_ESTABLISHED", async () => {
    const control = await controlTrustBoundary();
    expect(control.PASS).toBe(true);
    expect(control.positiveControl.completeRecordIsSchemaValid).toBe(true);
    expect(control.positiveControl.completeRecordIsNotTrusted).toBe(true);
    expect(control.positiveControl.verdict).toBe("AUTHORITY_NOT_ESTABLISHED");
    expect(control.positiveControl.conceptsSeparated.SCHEMA_VALIDITY).toBe(true);
    expect(control.positiveControl.conceptsSeparated.EXTERNALLY_VERIFIED_AUTHORITY).toBe(false);
    expect(control.positiveControl.conceptsSeparated.CURRENT_LAUNCH_PERMISSION).toBe(false);
    expect(control.positiveControl.planContentDigestIsSeparateFromClosure).toBe(true);
    expect(control.positiveControl.planBindingIsSelfReferential).toBe(false);
    expect(control.positiveControl.launchProhibited).toBe(true);
    expect(control.mutations.fabricatedAuthorityNotTrusted).toBe(true);
    expect(control.mutations.oneSessionBudgetRejected).toBe(true);
    expect(control.mutations.wrongPlanDigestRejected).toBe(true);
    expect(control.mutations.primarySubstitutionRefused).toBe(true);
    expect(control.mutations.trustedHostInputsRefused).toBe(true);
    expect(control.mutations.noTrustedSourceIsHonest).toBe(true);
  }, 300_000);

  it("§5: the input categories are separate, and the plan content digest is separate from the closure", () => {
    expect(TRUSTED_HOST_INPUTS).toContain("dshHome");
    expect(TRUSTED_HOST_INPUTS).toContain("installHostBundle");
    expect(PRIMARY_DERIVED_INPUTS).toContain("plan");
    expect(PRIMARY_DERIVED_INPUTS).toContain("closure");
    expect(PRIMARY_DERIVED_INPUTS).toContain("validityGate");
    /** The frozen experimental inputs are NOT refused, or the boundary would refuse a legitimate run. */
    for (const name of EXPERIMENTAL_INPUTS) expect(PRIMARY_REFUSED_INPUTS).not.toContain(name);
    for (const name of TRUSTED_HOST_INPUTS) expect(PRIMARY_REFUSED_INPUTS).toContain(name);
    /** The plan content digest is separate from the execution closure. */
    expect(planContentDigest(plan)).not.toBe(closure.executionClosureDigest);
    expect(plan.planContentDigest).toBe(planContentDigest(plan));
    expect(FROZEN_SESSION_SCOPE).toBe(16);
  });

  it("§5: a budget below the frozen scope and a wrong plan digest are both refused", () => {
    const decisions = Object.fromEntries(["PAID_MODEL_USAGE", "BOUNDED_FAIL_STOP_PROTOCOL", "NO_AUTOMATIC_RETRIES_OR_REPLACEMENTS", "PRESERVE_PARTIALLY_COMPLETED_INVALID_RUNS", "ACCEPTED_PROMPT_NEUTRALITY_LIMITED"].map((id) => [id, true]));
    const base = { authority: "decision:x", approvedPlanId: plan.planId, approvedPlanDigest: plan.planContentDigest, paidRunBudget: { maxSessions: 16, currency: "USD" }, decisions };
    const small = enforceableBudget({ paidRunBudget: { maxSessions: 1, currency: "USD" } });
    expect(small.coversFrozenScope).toBe(false);
    expect(small.enforceable).toBe("DECLARED_ONLY");
    const wrong = verifyExternalAuthority({ record: { ...base, approvedPlanDigest: "b".repeat(64) }, plan });
    expect(wrong.verified).toBe(false);
    expect(wrong.problems.some((problem) => /content digest/u.test(problem))).toBe(true);
    expect(schemaValidity(base).valid).toBe(true);
    expect(trustedAuthoritySource().available).toBe(false);
  }, 300_000);

  it("§6 Gate D: S1 is the post-installation baseline and a competing writer is detected despite this run's install", async () => {
    const control = await controlInRunAttestation({ repo: process.cwd(), compiledVerification });
    expect(control.PASS).toBe(true);
    expect(control.positiveControl.s0DiffersFromS1).toBe(true);
    expect(control.positiveControl.cleanS1MatchesS2).toBe(true);
    expect(control.positiveControl.installedBundleIdentical).toBe(true);
    expect(control.positiveControl.comparedFileByFile).toBe(true);
    expect(control.positiveControl.coverageLimitationsDisclosed).toBe(true);
    expect(control.mutations.competingWriterDetectedDespiteOwnInstall).toBe(true);
    expect(control.mutations.installedDuringRunSuppressesDetection).toBe(false);
    expect(control.mutations.s2DiffersFromS1).toBe(true);
    expect(ATTESTATION_RULES.installedDuringRunDoesNotSuppressDetection).toBe(true);
    expect(ATTESTATION_RULES.s0ToS2IsNotTheCompetingWriterTest).toBe(true);
  }, 900_000);

  it("§6: the isolated verification agrees with the frozen method, so the restatement cannot drift", async () => {
    const isolated = verifyCompiledSourceIsolated();
    expect(isolated.DETERMINISTIC).toBe("SUPPORTED");
    expect(isolated.COMPILED_MATCHES_SOURCE).toBe(true);
    expect(isolated.pairs).toBe(COMPILED_PAIRS.length);
    expect(isolated.diverged).toEqual([]);
    expect(isolated.probeIsolation).toContain("unique directory");
    /** The frozen method must agree on the verdict and the pair count, or the restatement has drifted. */
    const frozen = await frozenVerifyCompiledSource();
    expect(frozen.COMPILED_MATCHES_SOURCE).toBe(isolated.COMPILED_MATCHES_SOURCE);
    expect(frozen.pairs).toBe(isolated.pairs);
  }, 900_000);

  it("§6: a skipped compiled verification is not an attestation pass", async () => {
    const home = join(BASE, "attest-home", ".dsh");
    mkdirSync(join(home, "profiles", "node_modules"), { recursive: true });
    installHostBundle({ repo: process.cwd(), realDshHome: home });
    const s1 = sampleInstallationDigest({ dshHomePath: home });
    const skipped = await inRunAttestation({ dshHomePath: home, s1Digest: s1, s2Digest: s1, installedDuringRun: true, compiledVerification: null });
    expect(skipped.compiledVerificationSkipped).toBe(true);
    expect(skipped.IN_RUN_ATTESTATION).toBe("FAIL");
    expect(compareInstalledBundle({ dshHomePath: home }).allIdentical).toBe(true);
  }, 600_000);
});

describe("R3-L0C-I-A-R-L-C — the authoritative matrix through the real runner", () => {
  it("completes a healthy deterministic matrix with GREEN terminal admission and a measured cost", async () => {
    healthyRun = await runAdmissionClosureMatrix(await matrixInputs("healthy"));
    expect(healthyRun.PIPELINE).toBe("COMPLETED");
    expect(healthyRun.terminalState).toBe("MATRIX_COMPLETE");
    expect(healthyRun.matrixCompleted).toBe(true);
    expect(healthyRun.completedSessions?.length).toBe(16);
    expect(healthyRun.maxLaunchesPerSession).toBe(1);
    /** §4 Gate B: the terminal admission decided GREEN before the runner completed. */
    expect(healthyRun.validityGate?.green).toBe(true);
    expect(healthyRun.validityGate?.decision).toBe("GREEN");
    expect(healthyRun.validityGate?.journalReadAtAdmission).toBe(true);
    /** §3 Gate A: the cost is attributed from the durable journal for every session. */
    expect(healthyRun.costBridge?.measuredCount).toBe(16);
    expect(healthyRun.costBridge?.absentCount).toBe(0);
    expect(healthyRun.costBridge?.provenance).toBe("FIXTURE");
    expect(healthyRun.costBridge?.interpretable).toBe(true);
    /** §1: the live evidence survived. */
    expect(healthyRun.liveEvidenceContinuity?.LIVE_ARTIFACT_PROPAGATION).toBe("PASS");
    /** §6 Gate D: the in-run attestation holds. */
    expect(healthyRun.finalAttestation?.IN_RUN_ATTESTATION).toBe("PASS");
    expect(healthyRun.finalAttestation?.s2MatchesS1).toBe(true);
    expect(healthyRun.finalAttestation?.competingWriterDetected).toBe(false);
    /** The identities are exact and there are no retries or replacements. */
    expect(healthyRun.sessionIdentities?.allIdentitiesExact).toBe(true);
    expect(healthyRun.journalCounts?.retries).toBe(0);
    expect(healthyRun.journalCounts?.replacements).toBe(0);
    /** §6/§7: a fixture cost blocks the causal verdict. */
    expect(healthyRun.run?.causalVerdictIssued).toBe(false);
    expect(healthyRun.costBridge?.allSixteenLivePrimary).toBe(false);
    expect(healthyRun.costBridge?.blocksCausalVerdict).toBe(true);
  }, 900_000);

  it("§4 CRITICAL MUTATION: a runtime change after the last trial refuses completion", async () => {
    const run = await runAdmissionClosureMatrix(await matrixInputs("mutation", {
      terminalRecompute: async () => ({ closure: { executionClosureDigest: "f".repeat(64) }, route: { MODEL_ROUTE_IDENTITY: "MATCH" } }),
    }));
    expect(run.terminalState).toBe("ABORT_PRESERVED");
    expect(run.matrixCompleted).toBe(false);
    expect(run.validityGate?.decision).toBe("RED");
    expect(run.validityGate?.failing).toContain("CLOSURE_FRESH_MATCH");
    expect(run.run?.causalVerdictIssued).toBe(false);
    /** The durable journal must carry NO MATRIX_COMPLETED event. */
    const journal = readFileSync(join(run.runRoot, "generation-journal.jsonl"), "utf8");
    expect(journal.includes("MATRIX_COMPLETED")).toBe(false);
    expect(journal.includes("MATRIX_ABORTED")).toBe(true);
    /** No later worker launch: the launch count is exactly the sixteen planned sessions. */
    expect((journal.match(/WORKER_LAUNCH_RECORDED/gu) ?? []).length).toBe(16);
  }, 900_000);

  it("§4: a route drift after the last trial also refuses completion", async () => {
    const run = await runAdmissionClosureMatrix(await matrixInputs("route-drift", {
      terminalRecompute: async () => ({ closure: { executionClosureDigest: closure.executionClosureDigest }, route: { MODEL_ROUTE_IDENTITY: "DRIFTED" } }),
    }));
    expect(run.terminalState).toBe("ABORT_PRESERVED");
    expect(run.matrixCompleted).toBe(false);
    expect(run.validityGate?.failing).toContain("ROUTE_FRESH_MATCH");
    expect(readFileSync(join(run.runRoot, "generation-journal.jsonl"), "utf8").includes("MATRIX_COMPLETED")).toBe(false);
  }, 900_000);

  it("§6 Gate D MUTATION: a competing writer between S1 and S2 refuses completion at the terminal gate", async () => {
    const { writeFileSync: writeFile } = await import("node:fs");
    const inputs = await matrixInputs("competing-writer");
    const isolatedHome = inputs.isolatedHome as string;
    const run = await runAdmissionClosureMatrix({
      ...inputs,
      /** The mutation fires inside the gate, between the post-installation baseline S1 and the S2 sample. */
      terminalMutation: () => {
        const installedFile = join(isolatedHome, "profiles", "node_modules", "palimpsest-dsh-host", "lib", "runner.js");
        writeFile(installedFile, `${readFileSync(installedFile, "utf8")}\n/* competing writer */`, "utf8");
      },
    });
    /** The authoritative matrix must REFUSE valid completion. */
    expect(run.terminalState).toBe("ABORT_PRESERVED");
    expect(run.matrixCompleted).toBe(false);
    expect(run.validityGate?.decision).toBe("RED");
    expect(run.validityGate?.failing).toContain("RUNTIME_ATTESTED");
    expect(run.run?.causalVerdictIssued).toBe(false);
    /** §6: the negative control verifies the ACTUAL terminal evidence, not only the helper's return value. */
    const journal = readFileSync(join(run.runRoot, "generation-journal.jsonl"), "utf8");
    expect(journal.includes("MATRIX_COMPLETED")).toBe(false);
    expect(journal.includes("MATRIX_ABORTED")).toBe(true);
    expect(run.finalAttestation?.competingWriterDetected).toBe(true);
  }, 900_000);

  it("§8: the fail-stop protocol still holds under every fault position", async () => {
    const cases = [];
    for (const position of ["FIRST", "MIDDLE", "LAST"]) {
      const run = await runAdmissionClosureMatrix(await matrixInputs(`fault-${position.toLowerCase()}`, { faultAt: position, faultKind: PRIMARY_FAULTS.REPORT_MISSING }));
      cases.push(run);
      expect(run.terminalState).toBe("ABORT_PRESERVED");
      expect(run.maxLaunchesPerSession).toBe(1);
      expect(run.sessionsAfterFault).toEqual([]);
    }
    expect(cases.every((run) => run.terminalState === "ABORT_PRESERVED")).toBe(true);
  }, 900_000);

  it("§8: report-then-hang is preserved as UNCERTAIN, never as a completed exit", async () => {
    const run = await runAdmissionClosureMatrix(await matrixInputs("hang", { faultAt: "FIRST", faultKind: PRIMARY_FAULTS.REPORT_THEN_HANG, timeoutMs: 4_000 }));
    expect(run.terminalState).toBe("UNCERTAIN_PRESERVED");
    expect(run.run?.causalVerdictIssued).toBe(false);
  }, 900_000);
});

describe("R3-L0C-I-A-R-L-C — the PRIMARY launch boundary stays closed", () => {
  it("refuses a caller-substituted measurement before any launch", async () => {
    const inputs = await matrixInputs("primary-substitution");
    const run = await runAdmissionClosureMatrix({ ...inputs, mode: "PRIMARY" });
    expect(run.PIPELINE).toBe("REFUSED");
    expect(run.refusedAt).toBe("PRIMARY_INPUT_BINDING");
    expect(run.launches).toEqual([]);
    expect(run.modelCallsMade ?? 0).toBe(0);
  }, 300_000);

  it("refuses a PRIMARY run with no authorization decision before exposure", async () => {
    /** A PRIMARY run supplying none of the refused inputs: the plan is read from the committed evidence. */
    const run = await runAdmissionClosureMatrix({
      prehistory, admittedRefs: refs, mode: "PRIMARY",
      authorizedBy: PLAN_ID, caller: PLAN_ID, runId: "primary-noauth", runRoot: join(BASE, "primary-noauth"),
    });
    expect(run.PIPELINE).toBe("REFUSED");
    /** The refusal must happen at or before the pre-exposure checks, and no session may be launched. */
    const preExposureStages = ["VERIFY_COMMITTED_PLAN", "VERIFY_RUNTIME_AND_CLOSURE", "CHECK_RUN_IDENTITY_AND_SCHEDULE", "ACQUIRE_EXCLUSIVE_RUN_ROOT", "PRE_EXPOSURE_CHECKS"];
    expect(preExposureStages).toContain(String(run.refusedAt));
    expect(run.launches).toEqual([]);
    expect(run.modelCallsMade ?? 0).toBe(0);
  }, 300_000);

  it("refuses a structurally complete but untrusted authorization at the launch boundary", async () => {
    /** Commit the plan so the PRIMARY path can read it, then supply a fabricated decision reference. */
    await writeProspectivePlan({ verifyCompiled: false });
    const decisions = Object.fromEntries(["PAID_MODEL_USAGE", "BOUNDED_FAIL_STOP_PROTOCOL", "NO_AUTOMATIC_RETRIES_OR_REPLACEMENTS", "PRESERVE_PARTIALLY_COMPLETED_INVALID_RUNS", "ACCEPTED_PROMPT_NEUTRALITY_LIMITED"].map((id) => [id, true]));
    const committed = JSON.parse(readFileSync(join(process.cwd(), "research-evidence", "r3-l0c-iar-lc", "execution-plan.json"), "utf8"));
    const run = await runAdmissionClosureMatrix({
      prehistory, admittedRefs: refs, mode: "PRIMARY", authorizedBy: PLAN_ID, caller: PLAN_ID,
      runId: "primary-fabricated", runRoot: join(BASE, "primary-fabricated"),
      authorizationDecision: { authority: "decision:totally-made-up", approvedPlanId: committed.planId, approvedPlanDigest: committed.planContentDigest, paidRunBudget: { maxSessions: 16, currency: "USD" }, decisions },
    });
    expect(run.PIPELINE).toBe("REFUSED");
    expect(run.refusedAt).toBe("PRE_EXPOSURE_CHECKS");
    expect(run.reason).toBe("AUTHORIZATION_NOT_VERIFIED");
    expect(run.launches).toEqual([]);
    expect(run.modelCallsMade ?? 0).toBe(0);
  }, 900_000);
});

describe("R3-L0C-I-A-R-L-C — the closure covers the live path", () => {
  it("binds this stage's harness and the reused prior modules", async () => {
    const computed = await computeExecutionClosure({ verifyCompiled: false });
    expect(computed.CLOSURE_COMPLETE).toBe(true);
    expect(computed.stageHarness.missing).toEqual([]);
    expect(computed.reusedModules.missing).toEqual([]);
    expect(computed.partIds).toContain("STAGE_HARNESS_CLOSURE");
    expect(computed.partIds).toContain("REUSED_MODULES_CLOSURE");
    expect(computed.partIds).toContain("RUNTIME_MANIFEST_CLOSURE");
    expect(STAGE_HARNESS_MODULES.length).toBeGreaterThan(10);
    expect(REUSED_MODULES.length).toBeGreaterThan(15);
    const mutations = await proveClosureMutations();
    expect(mutations.ALL_MUTATIONS_PROVEN).toBe(true);
    expect(mutations.treeMutated).toBe(false);
    expect(mutations.arms.map((arm) => arm.id)).toEqual(["NEW_STAGE_PIPELINE_MODULE", "REUSED_PRIOR_ADMISSION_MODULE", "RUNTIME_MANIFEST_DYNAMIC_MODULE", "EXECUTION_CONFIGURATION_OR_TOOLCHAIN"]);
    for (const arm of mutations.arms) expect(arm.PROPERTY_PROVEN).toBe(true);
  }, 600_000);

  it("the plan binds the closure and the plan closure matches", async () => {
    const planClosure = await checkPlanClosure({ verifyCompiled: false });
    expect(planClosure.EXECUTION_CLOSURE).toBe("MATCH");
    expect(plan.planSupersession.supersedes.planId).toBe("r3-l0c-iar-l-primary-plan");
    expect(plan.planSupersession.amendedPriorPlan).toBe(false);
    expect(plan.planSupersession.priorPlanEdited).toBe(false);
  }, 300_000);
});
