/**
 * R3-L0C-I-A-R-L-C-F §3-§7 — THE MEASUREMENT-FIDELITY GATES.
 *
 * Every test drives the REAL corrected entry — the measurement-fidelity pipeline, the artifact-identity discovery,
 * the durable reconciliation, the plan-identity digest, the input-bound compiler verification — and asserts the value
 * that came back. The mutants are the controls measured against `c8cd220` in `r3l0ciarlcf_controls.test.ts`; each
 * gate names its control rather than re-running it.
 *
 * §10: THE THREE TEST LEVELS ARE KEPT APART. T1 primitive tests are pure-function assertions; T2 integration tests
 * drive the reducer and the bridge over a real journal; T3 authoritative-path tests drive the real Pipeline through
 * the frozen Runner. A T1 test is not evidence that T3 has passed, and the T3 tests are the ones marked as such.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildPrehistory } from "../scripts/r3l0c/build-prehistory.mjs";
import { admitCapital, selectionRefs } from "../scripts/r3l0c/prehistory.mjs";
import { installHostBundle, dshHome } from "../scripts/gates/env.mjs";
import { computeExecutionClosure, proveClosureMutations } from "../scripts/r3l0ciarlcf/closure.mjs";
import { runPerTrajectoryConfinement } from "../scripts/r3l0ciar/confinement.mjs";
import { frozenPrimarySchedule, PRIMARY_FAULTS } from "../scripts/r3l0ciar/primary-adapter.mjs";
import { runMeasurementFidelityMatrix, deriveProvenance } from "../scripts/r3l0ciarlcf/pipeline.mjs";
import { buildProspectivePlan, checkPlanClosure, checkPlanContentDigest, PLAN_ID } from "../scripts/r3l0ciarlcf/prospective-plan.mjs";
import { assertAuthoritativePath } from "../scripts/r3l0ciarlcf/modes.mjs";
import { deterministicArtifactFixture } from "../scripts/r3l0ciarlcf/qualification.mjs";
import {
  fullPlanDigest, proveFullPlanDigestMoves, planDigestCoverage,
} from "../scripts/r3l0ciarlcf/plan-identity.mjs";
import {
  verifyExternalAuthority, budgetSemantics, enforcePrimaryInputBinding, trustedAuthoritySource, planBinding, schemaValidity,
} from "../scripts/r3l0ciarlcf/trust-boundary.mjs";
import {
  normalizeAttemptId, attemptIdentityEquals, attemptIdFromPath, discoverScheduledArtifact, corroborateExecutionWitness,
} from "../scripts/r3l0ciarlcf/artifact-identity.mjs";
import { bridgeMatrixCost, attributeSessionFromRecord, interpretArtifact } from "../scripts/r3l0ciarlcf/cost-bridge.mjs";
import { authoritativeTerminalAdmission, REQUIRED_TERMINAL_CONDITIONS } from "../scripts/r3l0ciarlcf/postmatrix-admission.mjs";
import { reconcileDurableTrials, costCompleteness, causalEvaluability, REQUIRED_DURABLE_CONDITIONS } from "../scripts/r3l0ciarlcf/durable-reconciliation.mjs";
import { admissionTimeMeasurement } from "../scripts/r3l0ciarlcf/freshness.mjs";
import { inRunAttestation, sampleInstallationDigest, compareInstalledBundle, competingWriterVerdict } from "../scripts/r3l0ciarlcf/attestation.mjs";
import {
  verifyCompiledSourceBoundToInputs, compiledVerificationInputIdentity, compilerCacheSize, clearCompilerCache,
  COMPILED_PAIRS,
} from "../scripts/r3l0ciarlcf/compiler-cache.mjs";
import { verifyCompiledSource as frozenVerifyCompiledSource } from "../scripts/r3l0ciarlc/attestation.mjs";
import { controlArtifactIdentity, controlDurableReconciliation, controlPlanIdentityAndBudget } from "../scripts/r3l0ciarlcf/acceptance.mjs";
import { writeRealFormatArtifact } from "../scripts/r3l0ciarlcf/baseline/legacy-controls.mjs";
import { proveRealClosureChangeDetection, proveRealRouteChangeDetection } from "../scripts/r3l0ciarlcf/isolated-mutation.mjs";
import {
  MEASUREMENT_GAP_IDS, MEASUREMENT_GAPS, ATTEMPT_ID, FRESHNESS_BASIS, FRESHNESS_FIELDS,
  ARTIFACT_DISCOVERY_OUTCOMES, EXECUTION_WITNESS, COST_COMPLETENESS_LEVELS, CAUSAL_PREREQUISITES,
  BUDGET_CONCEPTS, DURABLE_RECONCILIATION_CONDITIONS, COMPILER_CACHE_INPUTS, UNEARNED_VERDICTS,
  READINESS_STATEMENTS, PRESERVED_DESIGN, FINAL_VERDICTS,
} from "../scripts/r3l0ciarlcf/contract.mjs";

const BASE = join(tmpdir(), `palimpsest-r3l0ciarlcf-gates-${String(process.pid)}`);
let prehistory: { world: string; state: string };
let refs: readonly unknown[];
let closure: Awaited<ReturnType<typeof computeExecutionClosure>>;
let containment: Awaited<ReturnType<typeof runPerTrajectoryConfinement>>;
let schedule: Awaited<ReturnType<typeof frozenPrimarySchedule>>;
let plan: Awaited<ReturnType<typeof buildProspectivePlan>>;
let compiledVerification: Awaited<ReturnType<typeof verifyCompiledSourceBoundToInputs>>;

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
  /** §7: measured ONCE — the input-bound cache makes a repeat cheap, and the identity is checked. */
  compiledVerification = verifyCompiledSourceBoundToInputs();
}, 1_200_000);

afterAll(() => {
  try { rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
});

/** The common matrix inputs, with an ISOLATED DSH home per case. */
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

/* ================================================================ T1: primitive */

describe("R3-L0C-I-A-R-L-C-F T1 — primitives: identity, digest, cache, classification", () => {
  it("§4: the canonical attempt id and its path-derived form compare by EXACT normalization", () => {
    expect(normalizeAttemptId(ATTEMPT_ID.canonicalExample)).toBe(ATTEMPT_ID.pathDerivedExample);
    expect(normalizeAttemptId(ATTEMPT_ID.pathDerivedExample)).toBe(ATTEMPT_ID.pathDerivedExample);
    /** A prefix/substring collision is a DIFFERENT identity. */
    expect(attemptIdentityEquals("attempt-abcdef", "attempt-abcdef0123456789")).toBe(false);
    expect(attemptIdentityEquals("attempt-abcdef", "abcdef")).toBe(true);
    expect(attemptIdentityEquals("attempt-abcdef0123456789", "abcdef0123456789")).toBe(true);
    expect(ATTEMPT_ID.substringMatchingPermitted).toBe(false);
    /** The path form is `attempt-<hex>/`, and a filename substring is NOT an identity. */
    expect(attemptIdFromPath("x/attempt-dd64ac801a0e56a0c07b97a5ccc07c7c/session.v4.jsonl.zstd")).toBe("dd64ac801a0e56a0c07b97a5ccc07c7c");
    expect(attemptIdFromPath("x/dd64ac801a0e56a0c07b97a5ccc07c7c/session.v4.jsonl.zstd")).toBe(null);
  });

  it("§6: the full-plan digest covers every plan field and moves on each material change", () => {
    const mutations = proveFullPlanDigestMoves(plan);
    expect(mutations.PROVEN).toBe(true);
    expect(mutations.allMutationsMove).toBe(true);
    expect(mutations.unmoved).toEqual([]);
    expect(mutations.computedByOverride).toBe(true);
    expect(mutations.planWritten).toBe(false);
    /** §6's own list, each present. */
    for (const id of ["MODEL_PROVIDER_ROUTE", "EXECUTION_SETTINGS_VALUE", "SESSION_SCHEDULE", "TREATMENT_EXPOSURE", "FROZEN_ENDPOINT_OR_THRESHOLD", "AUTHORIZATION_SCOPE"]) {
      expect(mutations.mutations.find((entry) => entry.id === id)?.moved).toBe(true);
    }
    const coverage = planDigestCoverage(plan);
    expect(coverage.missingMaterialFields).toEqual([]);
    expect(coverage.coversEveryPlanField).toBe(true);
    expect(coverage.exclusionIsByNameNotByProjection).toBe(true);
    /** §6: the full digest is separate from the closure digest. */
    expect(fullPlanDigest(plan)).not.toBe(closure.executionClosureDigest);
    expect(plan.planContentDigest).toBe(fullPlanDigest(plan));
  });

  it("§7: the compiled-verification cache is bound to its input identity", async () => {
    const identity = compiledVerificationInputIdentity();
    expect(identity.pairCount).toBe(COMPILED_PAIRS.length);
    expect(Object.keys(identity.sourceDigests).length).toBe(COMPILED_PAIRS.length);
    expect(Object.keys(identity.compiledDigests).length).toBe(COMPILED_PAIRS.length);
    expect(typeof identity.compilerOptionsDigest).toBe("string");
    expect(typeof identity.toolchainIdentity).toBe("string");
    expect(identity.toolchainIdentity).not.toContain("UNRESOLVED");
    for (const field of COMPILER_CACHE_INPUTS) expect(Object.keys(identity)).toContain(field === "pairCount" ? "pairCount" : field);
    const first = verifyCompiledSourceBoundToInputs();
    expect(first.COMPILED_MATCHES_SOURCE).toBe(true);
    expect(first.inputIdentity).toBe(identity.identity);
    expect(first.verifiedInputs).toBeDefined();
    const second = verifyCompiledSourceBoundToInputs();
    expect(second.cacheHit).toBe(true);
    expect(compilerCacheSize()).toBeGreaterThan(0);
    /** The frozen method must agree on the verdict and the pair count, or the restatement has drifted. */
    expect((await frozenVerifyCompiledSource() as { pairs: number }).pairs).toBe(first.pairs);
  }, 900_000);

  it("§3: the measurement basis vocabulary distinguishes a recomputation from a capture", async () => {
    expect(Object.keys(FRESHNESS_BASIS)).toContain("RECOMPUTED_AT_ADMISSION");
    expect(Object.keys(FRESHNESS_BASIS)).toContain("CAPTURED_PREFLIGHT_OBJECT");
    const recomputed = await admissionTimeMeasurement({
      mode: "DETERMINISTIC", boundClosureDigest: "a".repeat(64), preflightClosureDigest: "a".repeat(64), preflightRouteIdentity: "MATCH",
      recompute: async () => ({ closure: { executionClosureDigest: "a".repeat(64) }, route: { MODEL_ROUTE_IDENTITY: "MATCH" } }),
    });
    expect(recomputed.basis).toBe("RECOMPUTED_AT_ADMISSION");
    expect(recomputed.fresh).toBe(true);
    expect(recomputed.closureMatchesPlan).toBe(true);
    expect(recomputed.preflightClosureDigest).toBe("a".repeat(64));
    expect(recomputed.fieldsPresent).toEqual([]);
    /** An omitted recomputation is a FAILURE, never a captured value. */
    const omitted = await admissionTimeMeasurement({ mode: "DETERMINISTIC", boundClosureDigest: "a".repeat(64), preflightClosureDigest: "a".repeat(64) });
    expect(omitted.basis).toBe("RECOMPUTATION_FAILED");
    expect(omitted.fresh).toBe(false);
    /** An injected measurement is labelled, and REFUSED in PRIMARY. */
    const injected = await admissionTimeMeasurement({ mode: "DETERMINISTIC", injection: { closure: { executionClosureDigest: "b".repeat(64) }, route: { MODEL_ROUTE_IDENTITY: "MATCH" } } });
    expect(injected.basis).toBe("INJECTED_BY_TEST");
    expect(injected.injectionUsed).toBe(true);
    const refused = await admissionTimeMeasurement({ mode: "PRIMARY", injection: { closure: { executionClosureDigest: "b".repeat(64) } } });
    expect(refused.refused).toBe(true);
    expect(refused.fresh).toBe(false);
    /** A drift is classified rather than merely observed. */
    const drifted = await admissionTimeMeasurement({
      mode: "DETERMINISTIC", boundClosureDigest: "a".repeat(64), preflightClosureDigest: "a".repeat(64),
      recompute: async () => ({ closure: { executionClosureDigest: "c".repeat(64) }, route: { MODEL_ROUTE_IDENTITY: "MATCH" } }),
    });
    expect(drifted.drifted).toBe(true);
    expect(drifted.closureMatchesPlan).toBe(false);
    expect(FRESHNESS_FIELDS.every((field) => field in drifted)).toBe(true);
  });

  it("§5: the three cost-completeness levels are separate, and an absence satisfies only accounting", () => {
    expect(COST_COMPLETENESS_LEVELS.map((level) => level.id)).toEqual(["CostAccountingComplete", "CostMeasuredComplete", "LivePrimaryCostComplete"]);
    const accountingOnly = costCompleteness({ interpretable: true, measuredCount: 14, absentCount: 2, livePrimaryCount: 0, plannedSessions: 16 });
    expect(accountingOnly.CostAccountingComplete).toBe(true);
    expect(accountingOnly.CostMeasuredComplete).toBe(false);
    expect(accountingOnly.LivePrimaryCostComplete).toBe(false);
    expect(accountingOnly.absenceSatisfiesMeasuredRequirement).toBe(false);
    const measured = costCompleteness({ interpretable: true, measuredCount: 16, absentCount: 0, livePrimaryCount: 0, fixtureCount: 16, plannedSessions: 16 });
    expect(measured.CostMeasuredComplete).toBe(true);
    expect(measured.LivePrimaryCostComplete).toBe(false);
    const live = costCompleteness({ interpretable: true, measuredCount: 16, absentCount: 0, livePrimaryCount: 16, plannedSessions: 16 });
    expect(live.LivePrimaryCostComplete).toBe(true);
  });

  it("§5: causal evaluability requires every prerequisite, not allSixteenLivePrimary alone", () => {
    const base = {
      records: [{ treatmentRealization: "APPLIED" }], durableReconciliation: { green: true },
      analysisPlanUnchanged: true, replacements: 0, retries: 0,
      freshness: { closureMatchesPlan: true, routeMatchesPlan: true }, attestation: { IN_RUN_ATTESTATION: "PASS" },
    };
    const fixture = causalEvaluability({ ...base, authoritativeAdmission: { green: true }, costAttribution: { interpretable: true, measuredCount: 16, absentCount: 0, livePrimaryCount: 0, fixtureCount: 16, plannedSessions: 16 } });
    expect(fixture.CAUSAL_RESULT).toBe("NOT_EVALUABLE");
    expect(fixture.failing).toContain("COST_MEASUREMENT_LIVE_PRIMARY_COMPLETE");
    /** §5: a FORGED allSixteenLivePrimary cannot override a RED admission. */
    const forged = causalEvaluability({ ...base, authoritativeAdmission: { green: false }, costAttribution: { interpretable: true, measuredCount: 16, absentCount: 0, livePrimaryCount: 16, allSixteenLivePrimary: true, plannedSessions: 16 } });
    expect(forged.CAUSAL_RESULT).toBe("NOT_EVALUABLE");
    expect(forged.failing).toContain("AUTHORITATIVE_ADMISSION_GREEN");
    const live = causalEvaluability({ ...base, authoritativeAdmission: { green: true }, costAttribution: { interpretable: true, measuredCount: 16, absentCount: 0, livePrimaryCount: 16, plannedSessions: 16 } });
    expect(live.CAUSAL_RESULT).toBe("EVALUABLE");
    expect(CAUSAL_PREREQUISITES.length).toBe(9);
  });
});

/* ================================================================ T2: integration */

describe("R3-L0C-I-A-R-L-C-F T2 — integration: journal → sidecar → artifact → cost → admission", () => {
  it("§4: attributes a cost from a genuine journal readback and refuses each identity failure", async () => {
    const control = await controlArtifactIdentity();
    expect(control.PASS).toBe(true);
    expect(control.positiveControl.measured).toBe(true);
    expect(control.positiveControl.provenance).toBe("FIXTURE");
    expect(control.positiveControl.attemptId).toBe(ATTEMPT_ID.pathDerivedExample);
    expect(control.positiveControl.comparison).toBe("EXACT_NORMALIZED_EQUALITY");
    expect(control.mutations.canonicalAndPathNormalizedAgree).toBe(true);
    expect(control.mutations.prefixCollisionRefused).toBe(true);
    expect(control.mutations.identityConflictDetected).toBe(true);
    expect(control.mutations.hostJobIdConflictDetected).toBe(true);
    expect(control.mutations.missingArtifactDetected).toBe(true);
    expect(control.mutations.ambiguousRefused).toBe(true);
    expect(control.mutations.corruptedNotMeasuredAsZero).toBe(true);
    expect(control.mutations.tamperedDigestRefused).toBe(true);
    expect(control.mutations.fabricatedPrimaryNotLivePrimary).toBe(true);
    expect(control.mutations.discoveryScopeUnavailableWithoutHome).toBe(true);
    expect(control.mutations.noWitnessIsNotEstablished).toBe(true);
    /** §4: with no authentic execution witness, LIVE_PRIMARY provenance is NOT_ESTABLISHED. */
    expect(control.livePrimaryProvenance?.verdict).toBe("NOT_ESTABLISHED");
  }, 600_000);

  it("§5: the reducer is GREEN on a coherent durable/in-memory pair and RED on each inconsistency", async () => {
    const control = await controlDurableReconciliation();
    expect(control.PASS).toBe(true);
    expect(control.positiveControl.green).toBe(true);
    expect(control.positiveControl.decision).toBe("GREEN");
    expect(control.positiveControl.durableTrialConsistency).toBe(true);
    expect(control.positiveControl.measurementBasis).toBe("RECOMPUTED_AT_ADMISSION");
    expect(control.mutations.durableInMemoryConflictRed).toBe(true);
    expect(control.mutations.duplicateDurableTrialRed).toBe(true);
    expect(control.mutations.missingDurableTrialRed).toBe(true);
    expect(control.mutations.damagedJournalRed).toBe(true);
    expect(control.mutations.absenceSatisfiesAccountingNotMeasurement).toBe(true);
    expect(control.mutations.forgedAllSixteenCannotOverrideRedAdmission).toBe(true);
    expect(control.mutations.fixtureMatrixNotEvaluable).toBe(true);
    expect(REQUIRED_DURABLE_CONDITIONS.length).toBe(8);
  }, 600_000);

  it("§6: the plan identity and the five budget concepts are correct", async () => {
    const control = await controlPlanIdentityAndBudget();
    expect(control.PASS).toBe(true);
    expect(control.positiveControl.fullDigestDiffersFromPriorProjection).toBe(true);
    expect(control.positiveControl.fullDigestDiffersFromClosureDigest).toBe(true);
    expect(control.positiveControl.missingMaterialFields).toEqual([]);
    expect(control.positiveControl.allMutationsMove).toBe(true);
    expect(control.positiveControl.declaredOnlyIsNotEnforceable).toBe(true);
    expect(control.positiveControl.hostEnforcedBudget).toBe(false);
    expect(control.positiveControl.spendEnforcement).toBe("NOT_ESTABLISHED");
    expect(control.positiveControl.authorityVerdict).toBe("AUTHORITY_NOT_ESTABLISHED");
    expect(BUDGET_CONCEPTS.length).toBe(5);
  }, 600_000);

  it("§4: a legitimate measured zero is distinguishable from an unreadable artifact", async () => {
    const root = mkdtempSync(join(tmpdir(), "r3lcf-zero-"));
    try {
      const runRoot = join(root, "run");
      const dshHome = join(root, ".dsh");
      mkdirSync(runRoot, { recursive: true });
      /** An artifact with NO corpus read: a genuine measured zero. */
      const { writeFileSync } = await import("node:fs");
      const { zstdCompressSync } = await import("node:zlib");
      const artifactPath = join(dshHome, "attempt-aaaaaaaaaaaaaaaa", "session.v4.jsonl.zstd");
      mkdirSync(join(dshHome, "attempt-aaaaaaaaaaaaaaaa"), { recursive: true });
      writeFileSync(artifactPath, zstdCompressSync(Buffer.from(`${JSON.stringify({ type: "turn/start", time: 1, data: {} })}\n`, "utf8")));
      const { writeLiveEvidence, liveEvidenceBinding } = await import("../scripts/r3l0ciarl/live-evidence.mjs");
      const sidecar = writeLiveEvidence({ runRoot, sessionId: "s0", sessionArtifactPath: artifactPath, hiddenInvariantVector: { failedPrepaidClasses: [], prepaidCoverage: 1 }, attemptId: "attempt-aaaaaaaaaaaaaaaa", hostJobId: "job-1", costProvenance: "FIXTURE", mode: "DETERMINISTIC" });
      const record = { sessionId: "s0", attemptId: "attempt-aaaaaaaaaaaaaaaa", hostJobId: "job-1", intendedExecutorRoute: "the deterministic scripted worker", contentDigests: liveEvidenceBinding(sidecar.digest) };
      const measured = await attributeSessionFromRecord({ runRoot, record, dshHomePath: dshHome });
      expect(measured.measured).toBe(true);
      expect(measured.fields?.rawHistoryArtifactsRead).toBe(0);
      expect(measured.measuredZeroIsDistinguishableFromAbsence).toBe(true);
      expect(measured.interpretability?.state).toBe("INTERPRETABLE");
      expect(measured.interpretability?.zeroIsAGenuineObservation).toBe(true);
      /** An EMPTY artifact is UNREADABLE, not a measured zero. */
      writeFileSync(artifactPath, Buffer.alloc(0));
      const emptySidecar = writeLiveEvidence({ runRoot, sessionId: "s0", sessionArtifactPath: artifactPath, hiddenInvariantVector: null, attemptId: "attempt-aaaaaaaaaaaaaaaa", hostJobId: "job-1", costProvenance: "FIXTURE", mode: "DETERMINISTIC" });
      const empty = await attributeSessionFromRecord({ runRoot, record: { ...record, contentDigests: liveEvidenceBinding(emptySidecar.digest) }, dshHomePath: dshHome });
      expect(empty.outcome.id).toBe("UNINTERPRETABLE_ARTIFACT");
      expect(empty.fields).toBe(null);
      expect(empty.interpretability?.state).toBe("UNREADABLE");
    } finally {
      try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
    }
  }, 300_000);

  it("§4: discovery is scoped, exact and refuses ambiguity", async () => {
    const root = mkdtempSync(join(tmpdir(), "r3lcf-discovery-"));
    try {
      const home = join(root, ".dsh");
      mkdirSync(home, { recursive: true });
      const canonical = "attempt-dd64ac801a0e56a0c07b97a5ccc07c7c";
      const bare = "dd64ac801a0e56a0c07b97a5ccc07c7c";
      const artifact = writeRealFormatArtifact({ directory: join(home, "b0-C-G1"), attemptId: bare });
      const unique = discoverScheduledArtifact({ dshHomePath: home, sessionId: "b0-C-G1", expectedAttemptId: canonical });
      expect(unique.id).toBe("DISCOVERED_UNIQUE");
      expect(unique.selected?.attemptId).toBe(bare);
      expect(unique.selectedLatestByMtime).toBe(false);
      /** A DIFFERENT canonical identity finds nothing, and the near miss is reported. */
      const wrong = discoverScheduledArtifact({ dshHomePath: home, sessionId: "b0-C-G1", expectedAttemptId: "attempt-ffffffffffffffffffffffffffffffff" });
      expect(wrong.id).toBe("NO_CANDIDATE");
      expect(wrong.nearMisses).toContain(bare);
      /** A duplicate makes the set ambiguous, and NO artifact is selected. */
      writeRealFormatArtifact({ directory: join(home, "b0-C-G1", "dup"), attemptId: bare });
      const ambiguous = discoverScheduledArtifact({ dshHomePath: home, sessionId: "b0-C-G1", expectedAttemptId: canonical });
      expect(ambiguous.id).toBe("AMBIGUOUS_CANDIDATES");
      expect(ambiguous.selected).toBe(null);
      expect(ambiguous.candidates.length).toBe(2);
      rmSync(artifact.path, { force: true });
      expect(ARTIFACT_DISCOVERY_OUTCOMES.length).toBe(5);
      expect(EXECUTION_WITNESS.newCanonicalOwnerCreated).toBe(false);
    } finally {
      try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
    }
  }, 300_000);

  it("§4: a declaration is not a witness — a fabricated witness is refused on its missing observations", () => {
    /** A route string and a mode alone corroborate NOTHING. */
    const declarationOnly = corroborateExecutionWitness({ witness: { declaredRoute: "the frozen omnigate DeepSeek route", declaredMode: "PRIMARY", routeDeclaredOnly: true, modeDeclaredOnly: true } });
    expect(declarationOnly.corroborated).toBe(false);
    expect(declarationOnly.verdict).toBe("NOT_ESTABLISHED");
    expect(declarationOnly.declarationsAcceptedAsObservations).toBe(false);
    expect(declarationOnly.routeStringAloneSufficient).toBe(false);
    /** A witness whose OBSERVED attempt is not the scheduled one is refused. */
    const wrongAttempt = corroborateExecutionWitness({
      witness: { runId: "r", sessionId: "s", workerProcessId: 42, observedAttemptId: "attempt-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", observedHostJobId: "job-1", observedRouteId: "route-1" },
      scheduledRunId: "r", scheduledSessionId: "s", expectedAttemptId: "attempt-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      discovery: { id: "DISCOVERED_UNIQUE", discovered: true, ambiguous: false, detail: "x", home: "/h", candidates: ["/h/a"], selected: null }, artifactDigestVerified: true,
    });
    expect(wrongAttempt.corroborated).toBe(false);
    expect(wrongAttempt.missing).toContain("observedWorkerAttemptHostJobRelationship");
  });

  it("§7: the attestation compares S2 against S1 and reports the input-bound compiled verification", async () => {
    const home = join(BASE, "attest-gate", ".dsh");
    mkdirSync(join(home, "profiles", "node_modules"), { recursive: true });
    installHostBundle({ repo: process.cwd(), realDshHome: home });
    const s0 = sampleInstallationDigest({ dshHomePath: home });
    const s1 = sampleInstallationDigest({ dshHomePath: home });
    expect(compareInstalledBundle({ dshHomePath: home }).allIdentical).toBe(true);
    const clean = await inRunAttestation({ dshHomePath: home, s0Digest: s0, s1Digest: s1, s2Digest: s1, installedDuringRun: true, compiledVerification });
    expect(clean.IN_RUN_ATTESTATION).toBe("PASS");
    expect(clean.compiledBoundToInputs).toBe(true);
    expect(clean.compiledInputIdentity).toBe(compiledVerification.inputIdentity);
    expect(clean.installedDuringRunSuppressesDetection).toBe(false);
    expect(clean.coverageLimitations.length).toBeGreaterThan(0);
    /** A skipped compiled verification is a FAIL, never a pass. */
    const skipped = await inRunAttestation({ dshHomePath: home, s0Digest: s0, s1Digest: s1, s2Digest: s1, installedDuringRun: true, compiledVerification: null });
    expect(skipped.compiledVerificationSkipped).toBe(true);
    expect(skipped.IN_RUN_ATTESTATION).toBe("FAIL");
    /** A competing writer between S1 and S2 is detected even though this run installed. */
    const writer = competingWriterVerdict({ s0Digest: s0, s1Digest: s1, s2Digest: `${s1}-changed`, installedDuringRun: true });
    expect(writer.competingWriterDetected).toBe(true);
    expect(writer.installedDuringRunSuppressesDetection).toBe(false);
  }, 900_000);

  it("§5: the reducer is GREEN on a coherent durable/in-memory pair and RED on a durable conflict", async () => {
    const { appendRecord, readJournal } = await import("../scripts/r3l0cf/journal.mjs");
    const root = mkdtempSync(join(tmpdir(), "r3lcf-reducer-"));
    try {
      const journalPath = join(root, "generation-journal.jsonl");
      const planned = ["s0", "s1"];
      const smallSchedule = [
        Object.freeze({ sessionId: "s0", block: 0, arm: "C", generation: "G1", trajectoryId: "b0-C" }),
        Object.freeze({ sessionId: "s1", block: 0, arm: "H", generation: "G1", trajectoryId: "b0-H" }),
      ];
      const digest = "a".repeat(64);
      const smallPlan = Object.freeze({ executionClosure: Object.freeze({ executionClosureDigest: digest }) });
      for (const session of smallSchedule) {
        appendRecord({ journalPath, kind: "EXPOSURE_INTENT_RECORDED", payload: { sessionId: session.sessionId } });
        appendRecord({ journalPath, kind: "WORKER_LAUNCH_RECORDED", payload: { sessionId: session.sessionId, attempt: 1 } });
      }
      appendRecord({ journalPath, kind: "TRIAL_RECORDED", payload: { sessionId: "s0", record: { ...smallSchedule[0] } } });
      appendRecord({ journalPath, kind: "TRIAL_RECORDED", payload: { sessionId: "s1", record: { ...smallSchedule[1] } } });
      const records = smallSchedule.map((session) => Object.freeze({ ...session, treatmentRealization: "APPLIED", workerUptakeCount: 0 }));
      const continuity = Object.freeze({ LIVE_ARTIFACT_PROPAGATION: "PASS", sessions: 2, allBound: true, allMatched: true, allComplete: true });
      const cost = Object.freeze({ interpretable: true, measuredCount: 2, absentCount: 0, plannedSessions: 2, livePrimaryCount: 0, fixtureCount: 2, allSixteenLivePrimary: false });
      const fresh = await admissionTimeMeasurement({ mode: "DETERMINISTIC", boundClosureDigest: digest, preflightClosureDigest: digest, preflightRouteIdentity: "MATCH", recompute: async () => ({ closure: { executionClosureDigest: digest }, route: { MODEL_ROUTE_IDENTITY: "MATCH" } }) });
      const attestation = Object.freeze({ IN_RUN_ATTESTATION: "PASS", s1MatchesExpectedBundle: true, s2MatchesS1: true, competingWriterDetected: false });
      const drive = async (journal: Readonly<Record<string, any>>, inMemory: readonly Readonly<Record<string, any>>[]) => {
        const reconciliation = reconcileDurableTrials({ journal, schedule: smallSchedule, plannedSessions: planned, inMemoryRecords: inMemory, liveEvidenceContinuity: continuity, costAttribution: cost });
        return await authoritativeTerminalAdmission({
          completed: planned, records: inMemory, plannedSessions: planned, schedule: smallSchedule, plan: smallPlan,
          journalPath, journalReader: readJournal, liveEvidenceContinuity: continuity, costAttribution: cost,
          durableReconciliation: reconciliation, freshness: fresh, attestation, postMatrixValidity: Object.freeze({ green: true, detail: "ok" }),
        });
      };
      const green = await drive(readJournal(journalPath), records);
      expect(green.green).toBe(true);
      expect(green.decision).toBe("GREEN");
      expect(green.measurementBasis).toBe("RECOMPUTED_AT_ADMISSION");
      expect(green.conditions.length).toBe(REQUIRED_TERMINAL_CONDITIONS.length);
      /**
       * §5 CRITICAL: the DURABLE record disagrees with the in-memory observation while the in-memory observation
       * still matches the schedule — the exact case the baseline reported GREEN.
       */
      appendRecord({ journalPath, kind: "TRIAL_RECORDED", payload: { sessionId: "s1", record: { sessionId: "s1", block: 0, arm: "C", generation: "G1", trajectoryId: "b0-C" } } });
      const conflicted = await drive(readJournal(journalPath), records);
      expect(conflicted.green).toBe(false);
      expect(conflicted.failing).toContain("DURABLE_TRIAL_CONSISTENCY");
      expect(conflicted.durableTrialConsistency).toBe(false);
    } finally {
      try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
    }
  }, 300_000);
});

/* ================================================================ T3: authoritative path */

describe("R3-L0C-I-A-R-L-C-F T3 — the authoritative path through the real runner", () => {
  it("completes a healthy deterministic matrix with a RECOMPUTED admission, GREEN admission and a measured cost", async () => {
    const run = await runMeasurementFidelityMatrix(await matrixInputs("healthy"));
    expect(run.PIPELINE).toBe("COMPLETED");
    expect(run.terminalState).toBe("MATRIX_COMPLETE");
    expect(run.matrixCompleted).toBe(true);
    expect(run.completedSessions?.length).toBe(16);
    expect(run.maxLaunchesPerSession).toBe(1);
    /** §3 Gate F1: the DEFAULT path recomputed and recorded its basis. */
    expect(run.validityGate?.measurementBasis).toBe("RECOMPUTED_AT_ADMISSION");
    expect(run.validityGate?.freshness?.fresh).toBe(true);
    expect(run.validityGate?.freshClosureDigest).toBe(closure.executionClosureDigest);
    expect(run.validityGate?.preflightClosureDigest).toBe(closure.executionClosureDigest);
    /** §5 Gate F3: the durable reconciliation was green over the real run. */
    expect(run.validityGate?.durableReconciliation?.green).toBe(true);
    expect(run.finalReconciliation?.green).toBe(true);
    /** §4 Gate F2: the cost is attributed from the durable journal for every session. */
    expect(run.costBridge?.measuredCount).toBe(16);
    expect(run.costBridge?.absentCount).toBe(0);
    expect(run.costBridge?.provenance).toBe("FIXTURE");
    expect(run.costBridge?.interpretable).toBe(true);
    /** §5: the completeness levels. */
    expect(run.costCompleteness?.CostAccountingComplete).toBe(true);
    expect(run.costCompleteness?.CostMeasuredComplete).toBe(true);
    expect(run.costCompleteness?.LivePrimaryCostComplete).toBe(false);
    /** §4 Gate B: the terminal admission decided GREEN before the runner completed. */
    expect(run.validityGate?.green).toBe(true);
    expect(run.validityGate?.decision).toBe("GREEN");
    expect(run.validityGate?.journalReadAtAdmission).toBe(true);
    /** §1: the live evidence survived. */
    expect(run.liveEvidenceContinuity?.LIVE_ARTIFACT_PROPAGATION).toBe("PASS");
    /** §7: the in-run attestation holds, with the input-bound compiled verification. */
    expect(run.finalAttestation?.IN_RUN_ATTESTATION).toBe("PASS");
    expect(run.finalAttestation?.compiledBoundToInputs).toBe(true);
    expect(run.finalAttestation?.competingWriterDetected).toBe(false);
    expect(run.journalCounts?.retries).toBe(0);
    expect(run.journalCounts?.replacements).toBe(0);
    /** §5/§7: a FIXTURE matrix is mechanically valid and NOT causally evaluable. */
    expect(run.validityGate?.causal?.CAUSAL_RESULT).toBe("NOT_EVALUABLE");
    expect(run.validityGate?.causal?.failing).toEqual(["COST_MEASUREMENT_LIVE_PRIMARY_COMPLETE"]);
    expect(run.run?.causalVerdictIssued).toBe(false);
  }, 900_000);

  it("§3 CRITICAL: a closure change at the admission instant refuses completion", async () => {
    const run = await runMeasurementFidelityMatrix(await matrixInputs("mutation", {
      terminalMeasurement: { closure: { executionClosureDigest: "f".repeat(64) }, route: { MODEL_ROUTE_IDENTITY: "MATCH" } },
    }));
    expect(run.terminalState).toBe("ABORT_PRESERVED");
    expect(run.matrixCompleted).toBe(false);
    expect(run.validityGate?.decision).toBe("RED");
    expect(run.validityGate?.failing).toContain("CLOSURE_FRESH_MATCH");
    expect(run.run?.causalVerdictIssued).toBe(false);
    const journal = readFileSync(join(run.runRoot as string, "generation-journal.jsonl"), "utf8");
    expect(journal.includes("MATRIX_COMPLETED")).toBe(false);
    expect(journal.includes("MATRIX_ABORTED")).toBe(true);
    expect((journal.match(/WORKER_LAUNCH_RECORDED/gu) ?? []).length).toBe(16);
  }, 900_000);

  it("§3: a route drift at the admission instant also refuses completion", async () => {
    const run = await runMeasurementFidelityMatrix(await matrixInputs("route-drift", {
      terminalMeasurement: { closure: { executionClosureDigest: closure.executionClosureDigest }, route: { MODEL_ROUTE_IDENTITY: "DRIFTED" } },
    }));
    expect(run.terminalState).toBe("ABORT_PRESERVED");
    expect(run.matrixCompleted).toBe(false);
    expect(run.validityGate?.failing).toContain("ROUTE_FRESH_MATCH");
    expect(readFileSync(join(run.runRoot as string, "generation-journal.jsonl"), "utf8").includes("MATRIX_COMPLETED")).toBe(false);
  }, 900_000);

  it("§7 MUTATION: a competing writer between S1 and S2 refuses completion at the terminal gate", async () => {
    const { writeFileSync: writeFile } = await import("node:fs");
    const inputs = await matrixInputs("competing-writer");
    const isolatedHome = inputs.isolatedHome as string;
    const run = await runMeasurementFidelityMatrix({
      ...inputs,
      terminalMutation: () => {
        const installedFile = join(isolatedHome, "profiles", "node_modules", "palimpsest-dsh-host", "lib", "runner.js");
        writeFile(installedFile, `${readFileSync(installedFile, "utf8")}\n/* competing writer */`, "utf8");
      },
    });
    expect(run.terminalState).toBe("ABORT_PRESERVED");
    expect(run.matrixCompleted).toBe(false);
    expect(run.validityGate?.decision).toBe("RED");
    expect(run.validityGate?.failing).toContain("RUNTIME_ATTESTED");
    expect(run.run?.causalVerdictIssued).toBe(false);
    const journal = readFileSync(join(run.runRoot as string, "generation-journal.jsonl"), "utf8");
    expect(journal.includes("MATRIX_COMPLETED")).toBe(false);
    expect(journal.includes("MATRIX_ABORTED")).toBe(true);
    expect(run.finalAttestation?.competingWriterDetected).toBe(true);
  }, 900_000);

  it("§8: the fail-stop protocol still holds: a fault at the first session stops with no later launch", async () => {
    const run = await runMeasurementFidelityMatrix(await matrixInputs("fault-first", { faultAt: "FIRST", faultKind: PRIMARY_FAULTS.REPORT_MISSING }));
    expect(run.terminalState).toBe("ABORT_PRESERVED");
    expect(run.maxLaunchesPerSession).toBe(1);
    expect(run.sessionsAfterFault).toEqual([]);
    expect(run.run?.causalVerdictIssued).toBe(false);
  }, 900_000);

  it("§8: report-then-hang is preserved as UNCERTAIN, never as a completed exit", async () => {
    const run = await runMeasurementFidelityMatrix(await matrixInputs("hang", { faultAt: "FIRST", faultKind: PRIMARY_FAULTS.REPORT_THEN_HANG, timeoutMs: 4_000 }));
    expect(run.terminalState).toBe("UNCERTAIN_PRESERVED");
    expect(run.run?.causalVerdictIssued).toBe(false);
  }, 900_000);
});

/* ================================================================ §3 real mutations, isolated */

describe("R3-L0C-I-A-R-L-C-F §3 — real byte mutations in an isolated checkout", () => {
  it("F1-B: a real closure change is detected by actual recomputation, with the shared tree untouched", async () => {
    const proof = await proveRealClosureChangeDetection();
    expect(proof.PROVEN).toBe(true);
    expect(proof.checkoutReproducesCommittedBytes).toBe(true);
    expect(proof.mutationApplied).toBe(true);
    expect(proof.digestMoved).toBe(true);
    expect(proof.detectedByActualRecomputation).toBe(true);
    expect(proof.sharedTreeUnchanged).toBe(true);
    expect(proof.injectedFakeDigest).toBe(false);
  }, 900_000);

  it("F1-C: a real route change is detected by actual recomputation", async () => {
    const proof = await proveRealRouteChangeDetection();
    expect(proof.PROVEN).toBe(true);
    expect(proof.mutationApplied).toBe(true);
    expect(proof.effectiveIdentityMoved).toBe(true);
    expect(proof.detectedByActualRecomputation).toBe(true);
    expect(proof.injectedFakeDigest).toBe(false);
  }, 900_000);
});

/* ================================================================ the PRIMARY launch boundary */

describe("R3-L0C-I-A-R-L-C-F — the PRIMARY launch boundary stays closed", () => {
  it("guards the authoritative path and quarantines the prior pipelines", () => {
    expect(() => assertAuthoritativePath({ caller: "r3-l0c-iar-lc-primary-plan", authorizedBy: "r3-l0c-iar-lc-primary-plan" })).toThrow(/not the authoritative execution path/u);
    const guard = assertAuthoritativePath({ caller: PLAN_ID, authorizedBy: PLAN_ID });
    expect(guard.authorized).toBe(true);
    expect(guard.priorPipelinesQuarantined).toBe(true);
    expect(guard.priorPipelinesStillExecutable).toBe(true);
  });

  it("refuses a caller-substituted measurement before any launch", async () => {
    const inputs = await matrixInputs("primary-substitution");
    const run = await runMeasurementFidelityMatrix({ ...inputs, mode: "PRIMARY" });
    expect(run.PIPELINE).toBe("REFUSED");
    expect(run.refusedAt).toBe("PRIMARY_INPUT_BINDING");
    expect(run.launches).toEqual([]);
    expect(run.modelCallsMade ?? 0).toBe(0);
  }, 300_000);

  it("refuses a structurally complete but untrusted authorization at the launch boundary", async () => {
    /**
     * The committed plan is READ, never rewritten: it is frozen evidence, and a test that regenerated it would move
     * `frozenAt` and make the frozen artifact describe a different moment than the one it was committed for.
     */
    const committed = JSON.parse(readFileSync(join(process.cwd(), "research-evidence", "r3-l0c-iar-lcf", "execution-plan.json"), "utf8"));
    expect(committed.planId).toBe(PLAN_ID);
    const decisions = Object.fromEntries(["PAID_MODEL_USAGE", "BOUNDED_FAIL_STOP_PROTOCOL", "NO_AUTOMATIC_RETRIES_OR_REPLACEMENTS", "PRESERVE_PARTIALLY_COMPLETED_INVALID_RUNS", "ACCEPTED_PROMPT_NEUTRALITY_LIMITED"].map((id) => [id, true]));
    const run = await runMeasurementFidelityMatrix({
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

  it("§6: a fabricated authority and an unenforceable budget create no permission", () => {
    const decisions = Object.fromEntries(["PAID_MODEL_USAGE", "BOUNDED_FAIL_STOP_PROTOCOL", "NO_AUTOMATIC_RETRIES_OR_REPLACEMENTS", "PRESERVE_PARTIALLY_COMPLETED_INVALID_RUNS", "ACCEPTED_PROMPT_NEUTRALITY_LIMITED"].map((id) => [id, true]));
    const base = { authority: "decision:x", approvedPlanId: plan.planId, approvedPlanDigest: fullPlanDigest(plan), paidRunBudget: { maxSessions: 16, currency: "USD" }, decisions };
    expect(schemaValidity(base).valid).toBe(true);
    const verdict = verifyExternalAuthority({ record: base, plan });
    expect(verdict.verified).toBe(false);
    expect(verdict.verdict).toBe("AUTHORITY_NOT_ESTABLISHED");
    expect(verdict.concepts.EXTERNALLY_VERIFIED_AUTHORITY).toBe(false);
    expect(verdict.concepts.ENFORCEABLE_BUDGET).toBe(false);
    expect(verdict.concepts.CURRENT_LAUNCH_PERMISSION).toBe(false);
    expect(verdict.launchProhibited).toBe(true);
    expect(trustedAuthoritySource().available).toBe(false);
    /** A one-session budget does not cover the frozen scope. */
    const small = budgetSemantics({ paidRunBudget: { maxSessions: 1, currency: "USD" } });
    expect(small.sessionScopeCoverage).toBe(false);
    expect(small.declaredOnlyImpliesEnforceable).toBe(false);
    /** The full digest is separate from the closure digest. */
    expect(planBinding(plan).planContentDigestIsSeparateFromClosure).toBe(true);
    expect(planBinding(plan).planBindingIsSelfReferential).toBe(false);
    /** The plan content digest binding is the FULL digest, not the prior stage's projection. */
    expect(plan.planContentDigest).toBe(fullPlanDigest(plan));
  });
});

/* ================================================================ the closure and the contract */

describe("R3-L0C-I-A-R-L-C-F — the closure covers the live path and the contract is complete", () => {
  it("binds this stage's harness and the reused prior modules, and the four arms are proven", async () => {
    const computed = await computeExecutionClosure({ verifyCompiled: false });
    expect(computed.CLOSURE_COMPLETE).toBe(true);
    expect(computed.stageHarness.missing).toEqual([]);
    expect(computed.reusedModules.missing).toEqual([]);
    expect(computed.partIds).toContain("STAGE_HARNESS_CLOSURE");
    expect(computed.partIds).toContain("REUSED_MODULES_CLOSURE");
    expect(computed.partIds).toContain("RUNTIME_MANIFEST_CLOSURE");
    const mutations = await proveClosureMutations();
    expect(mutations.ALL_MUTATIONS_PROVEN).toBe(true);
    expect(mutations.treeMutated).toBe(false);
    expect(mutations.arms.map((arm) => arm.id)).toEqual(["NEW_STAGE_PIPELINE_MODULE", "REUSED_PRIOR_ADMISSION_MODULE", "RUNTIME_MANIFEST_DYNAMIC_MODULE", "EXECUTION_CONFIGURATION_OR_TOOLCHAIN"]);
    for (const arm of mutations.arms) expect(arm.PROPERTY_PROVEN).toBe(true);
  }, 600_000);

  it("the plan binds the closure and the FULL content digest, and the prior plan is untouched", async () => {
    const planClosure = await checkPlanClosure({ verifyCompiled: false });
    expect(planClosure.EXECUTION_CLOSURE).toBe("MATCH");
    const planContent = checkPlanContentDigest();
    expect(planContent.FULL_PLAN_DIGEST).toBe("MATCH");
    expect(plan.planSupersession.supersedes.planId).toBe("r3-l0c-iar-lc-primary-plan");
    expect(plan.planSupersession.amendedPriorPlan).toBe(false);
    expect(plan.planSupersession.priorPlanEdited).toBe(false);
  }, 600_000);

  it("declares the five gaps, the fifteen verdicts and the four separate readiness statements", () => {
    expect(MEASUREMENT_GAPS.length).toBe(5);
    expect(MEASUREMENT_GAP_IDS).toEqual(["F1_CAPTURED_NOT_FRESH", "F2_UNVERIFIED_LIVE_PRIMARY", "F3_DIVIDED_IDENTITIES", "F4_PARTIAL_PLAN_AND_BUDGET", "F5_UNBOUND_COMPILER_CACHE"]);
    expect(Object.keys(FINAL_VERDICTS).length).toBe(15);
    expect(UNEARNED_VERDICTS.LIVE_PRIMARY_PROVENANCE).toBe("NOT_ESTABLISHED");
    expect(UNEARNED_VERDICTS.EXTERNAL_AUTHORITY).toBe("NOT_ESTABLISHED");
    expect(UNEARNED_VERDICTS.SPEND_ENFORCEMENT).toBe("NOT_ESTABLISHED");
    expect(UNEARNED_VERDICTS.PAID_EXECUTION).toBe("NOT_RUN");
    expect(UNEARNED_VERDICTS.CAUSAL_RESULT).toBe("NOT_EVALUABLE");
    expect(READINESS_STATEMENTS.map((entry) => entry.id)).toEqual(["DETERMINISTIC_MEASUREMENT_QUALIFIED", "REAL_ARTIFACT_COMPATIBILITY_ESTABLISHED", "PRIMARY_EXECUTION_AUTHORIZED", "PRIMARY_CAUSAL_DATA_AVAILABLE"]);
    /** §8: the frozen design is carried and unchanged. */
    expect(PRESERVED_DESIGN.sessions).toBe(16);
    expect(PRESERVED_DESIGN.treatment).toBe("SELECTION_ONLY");
    expect(PRESERVED_DESIGN.treatmentSurfaceChanged).toBe(false);
    expect(PRESERVED_DESIGN.sampleSizeIncreased).toBe(false);
    expect(PRESERVED_DESIGN.corpusCapitalExposuresOracleEndpointsThresholdsChanged).toBe(false);
    /** §4: the seam that must not exist in PRIMARY is declared. */
    expect(enforcePrimaryInputBinding({ mode: "PRIMARY", provided: {} }).refused).toBe(false);
    expect(enforcePrimaryInputBinding({ mode: "PRIMARY", provided: { terminalMeasurement: 1 } }).refused).toBe(true);
  });
});
