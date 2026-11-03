/**
 * R3-L0C-I-A-R-L-C-F §2 — THE FAILING CONTROLS.
 *
 * §2 requires the failing controls to be committed BEFORE the correction. These tests CALL the real `c8cd220`
 * functions and assert that each defect is PRESENT, so the corrections are checked against the same properties the
 * baseline violates rather than against properties invented afterwards.
 *
 * After the correction the same properties are asserted to hold on the corrected path, in
 * `test/r3l0ciarlcf_gates.test.ts`.
 *
 * §10: the ONE full authoritative-path matrix in this file is F1's, because F1's defect IS a property of the
 * default branch of the real pipeline and cannot be measured by a helper. Every other control is a bounded call to
 * the real function.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { buildPrehistory } from "../scripts/r3l0c/build-prehistory.mjs";
import { admitCapital, selectionRefs } from "../scripts/r3l0c/prehistory.mjs";
import { installHostBundle, dshHome } from "../scripts/gates/env.mjs";
import { computeExecutionClosure } from "../scripts/r3l0ciarlc/closure.mjs";
import { runPerTrajectoryConfinement } from "../scripts/r3l0ciar/confinement.mjs";
import { frozenPrimarySchedule } from "../scripts/r3l0ciar/primary-adapter.mjs";
import { buildProspectivePlan } from "../scripts/r3l0ciarlc/prospective-plan.mjs";
import { deterministicArtifactFixture } from "../scripts/r3l0ciarlc/qualification.mjs";
import { verifyCompiledSource } from "../scripts/r3l0ciarlc/attestation.mjs";
import {
  MEASUREMENT_GAP_IDS,
  MEASUREMENT_GAPS,
  BASELINE_COMMIT,
  ATTEMPT_ID,
  FRESHNESS_BASIS,
  ARTIFACT_DISCOVERY_OUTCOMES,
  EXECUTION_WITNESS,
  DURABLE_RECONCILIATION_CONDITIONS,
  COST_COMPLETENESS_LEVELS,
  CAUSAL_PREREQUISITES,
  BUDGET_CONCEPTS,
  PLAN_DIGEST_COVERAGE,
  COMPILER_CACHE_INPUTS,
  PRESERVED_DESIGN,
  UNEARNED_VERDICTS,
  READINESS_STATEMENTS,
  contractSummary,
} from "../scripts/r3l0ciarlcf/contract.mjs";
import {
  controlCapturedNotFresh,
  controlUnverifiedLivePrimary,
  controlDividedIdentities,
  controlPartialPlanAndBudget,
  controlUnboundCompilerCache,
  runBaselineControls,
  BASELINE_SOURCE,
} from "../scripts/r3l0ciarlcf/baseline/legacy-controls.mjs";
const BASE = join(tmpdir(), `palimpsest-r3l0ciarlcf-controls-${String(process.pid)}`);
let common: Record<string, unknown> | null = null;
/**
 * §10: THE BASELINE CONTROL SET IS RUN ONCE. F1's defect is a property of the real pipeline's default branch, so
 * its control drives one full sixteen-session DETERMINISTIC matrix; re-running the aggregate would pay for a second
 * identical matrix for the same measurement. The individual tests read this shared result.
 */
let baselineControls: Awaited<ReturnType<typeof runBaselineControls>> | null = null;

beforeAll(async () => {
  try { rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
  mkdirSync(BASE, { recursive: true });
  const built = await buildPrehistory(join(BASE, "prehistory"));
  const admitted = await admitCapital(join(BASE, "prehistory"), built.paths, "cutover-entitlements", built.world);
  const refs = selectionRefs(admitted);
  const schedule = await frozenPrimarySchedule();
  const trajectoryIds = [...new Set(schedule.map((session) => session.trajectoryId))].sort();
  const closure = await computeExecutionClosure({ verifyCompiled: false });
  const containment = await runPerTrajectoryConfinement({ runRoot: join(BASE, "containment"), trajectoryIds });
  const plan = await buildProspectivePlan({ closure, verifyCompiled: false });
  const artifactRoot = join(BASE, "artifacts");
  mkdirSync(artifactRoot, { recursive: true });
  const artifactFixture = await deterministicArtifactFixture({ artifactRoot });
  const compiledVerification = await verifyCompiledSource();
  common = {
    prehistory: { world: built.world, state: built.paths.state }, admittedRefs: refs,
    installHostBundle, dshHome: () => join(BASE, "isolated-home", ".dsh"),
    authorizedBy: "r3-l0c-iar-lc-primary-plan", caller: "r3-l0c-iar-lc-primary-plan",
    plan, closure, containment, mode: "DETERMINISTIC", systemValid: true, artifactRoot, artifactFixture,
    terminalCompiledVerification: compiledVerification,
  };
  baselineControls = await runBaselineControls({ base: BASE, common });
}, 1_200_000);

/** §10: the one measured control by id, from the shared set. */
function measured(id: string) {
  const found = baselineControls?.controls.find((control) => control.id === id);
  if (found === undefined) throw new Error(`the baseline control set did not measure ${id}`);
  return found;
}

describe("R3-L0C-I-A-R-L-C-F — the contract declares the five gaps and the fifteen verdicts", () => {
  it("names the baseline, the gaps, the completeness levels and the readiness statements", () => {
    expect(BASELINE_COMMIT).toBe("c8cd220fea86d3bdb2d7d2a72e0326be8f99cb74");
    expect(MEASUREMENT_GAPS.length).toBe(5);
    expect(MEASUREMENT_GAP_IDS).toEqual([
      "F1_CAPTURED_NOT_FRESH", "F2_UNVERIFIED_LIVE_PRIMARY", "F3_DIVIDED_IDENTITIES",
      "F4_PARTIAL_PLAN_AND_BUDGET", "F5_UNBOUND_COMPILER_CACHE",
    ]);
    expect(MEASUREMENT_GAPS.map((gap) => gap.id)).toEqual([...MEASUREMENT_GAP_IDS]);
    /** §3: the freshness basis is a vocabulary, not a boolean. */
    expect(Object.keys(FRESHNESS_BASIS)).toContain("RECOMPUTED_AT_ADMISSION");
    expect(Object.keys(FRESHNESS_BASIS)).toContain("CAPTURED_PREFLIGHT_OBJECT");
    /** §4: the canonical attempt id and its path-derived form, compared exactly. */
    expect(ATTEMPT_ID.canonicalExample).toBe("attempt-dd64ac801a0e56a0c07b97a5ccc07c7c");
    expect(ATTEMPT_ID.pathDerivedExample).toBe("dd64ac801a0e56a0c07b97a5ccc07c7c");
    expect(ATTEMPT_ID.substringMatchingPermitted).toBe(false);
    expect(ARTIFACT_DISCOVERY_OUTCOMES.length).toBe(5);
    expect(EXECUTION_WITNESS.declarationsAreNotObservations).toBe(true);
    expect(EXECUTION_WITNESS.newCanonicalOwnerCreated).toBe(false);
    /** §5: the durable conditions, the three completeness levels and the causal prerequisites. */
    expect(DURABLE_RECONCILIATION_CONDITIONS.length).toBe(8);
    expect(COST_COMPLETENESS_LEVELS.map((level) => level.id)).toEqual(["CostAccountingComplete", "CostMeasuredComplete", "LivePrimaryCostComplete"]);
    expect(CAUSAL_PREREQUISITES).toContain("COST_MEASUREMENT_LIVE_PRIMARY_COMPLETE");
    expect(CAUSAL_PREREQUISITES.length).toBeGreaterThan(5);
    /** §6: the five separated budget concepts and the full-digest coverage. */
    expect(BUDGET_CONCEPTS.length).toBe(5);
    expect(PLAN_DIGEST_COVERAGE).toContain("executionRoute");
    expect(PLAN_DIGEST_COVERAGE).toContain("pipelineOrder");
    expect(PLAN_DIGEST_COVERAGE).toContain("authorizationDecisions");
    expect(PLAN_DIGEST_COVERAGE).toContain("preservedDesign");
    /** §7: the inputs a compiler cache must be bound to. */
    expect(COMPILER_CACHE_INPUTS).toContain("sourceDigests");
    expect(COMPILER_CACHE_INPUTS).toContain("compiledDigests");
    /** §8: the frozen design, unchanged. */
    expect(PRESERVED_DESIGN.sessions).toBe(16);
    expect(PRESERVED_DESIGN.treatment).toBe("SELECTION_ONLY");
    expect(PRESERVED_DESIGN.randomizationSeed).toBe("1380724738");
    expect(PRESERVED_DESIGN.armOrder).toEqual([["C", "H"], ["H", "C"], ["C", "H"], ["C", "H"]]);
    expect(PRESERVED_DESIGN.treatmentSurfaceChanged).toBe(false);
    expect(PRESERVED_DESIGN.sampleSizeIncreased).toBe(false);
    /** §12: the verdicts this stage cannot promote, and the four separate readiness statements. */
    expect(UNEARNED_VERDICTS.LIVE_PRIMARY_PROVENANCE).toBe("NOT_ESTABLISHED");
    expect(UNEARNED_VERDICTS.PAID_EXECUTION).toBe("NOT_RUN");
    expect(UNEARNED_VERDICTS.CAUSAL_RESULT).toBe("NOT_EVALUABLE");
    expect(READINESS_STATEMENTS.map((entry) => entry.id)).toEqual([
      "DETERMINISTIC_MEASUREMENT_QUALIFIED", "REAL_ARTIFACT_COMPATIBILITY_ESTABLISHED",
      "PRIMARY_EXECUTION_AUTHORIZED", "PRIMARY_CAUSAL_DATA_AVAILABLE",
    ]);
    const summary = contractSummary();
    expect(summary.stage).toBe("R3-L0C-I-A-R-L-C-F");
    expect(summary.gaps).toBe(5);
    expect(summary.verdicts).toBe(15);
    expect(summary.modelCallsMade).toBe(0);
  });
});

describe("R3-L0C-I-A-R-L-C-F — every corrected property is violated at c8cd220", () => {
  it("F2: fabricated route and mode claims yield LIVE_PRIMARY, and a prefix collision is not a conflict", () => {
    const control = measured("F2_UNVERIFIED_LIVE_PRIMARY");
    expect(control.defectPresent).toBe(true);
    expect(control.observed.fabricatedIsLive).toBe(true);
    expect(control.observed.fabricatedProvenance).toBe("LIVE_PRIMARY");
    expect(control.observed.independentExecutionWitnessRequired).toBe(false);
    /** `attempt-abcdef` names a DIFFERENT attempt from `attempt-abcdef0123456789`, and it is accepted. */
    expect(control.observed.substringCollisionAccepted).toBe(true);
    expect(control.observed.substringCollisionPathId).toBe("abcdef");
    expect(control.observed.substringCollisionRecordId).toBe("attempt-abcdef0123456789");
  });

  it("F3: a durable trial whose identity differs from the schedule leaves the gate GREEN", () => {
    const control = measured("F3_DIVIDED_IDENTITIES");
    expect(control.defectPresent).toBe(true);
    expect(control.observed.terminalAdmissionGreen).toBe(true);
    expect(control.observed.reducerIdentitiesExact).toBe(true);
    expect(control.observed.durableArmForS1).not.toBe(control.observed.scheduledArmForS1);
  });

  it("F4: a material plan change does not move the digest, and DECLARED_ONLY is reported as enforceable", () => {
    const control = measured("F4_PARTIAL_PLAN_AND_BUDGET");
    expect(control.defectPresent).toBe(true);
    /** The route, the pipeline order and the authorization decisions are all outside the digest. */
    expect(control.observed.modelRouteChangeMovesDigest).toBe(false);
    expect(control.observed.providerChangeMovesDigest).toBe(false);
    expect(control.observed.settingsChangeMovesDigest).toBe(false);
    expect(control.observed.pipelineOrderChangeMovesDigest).toBe(false);
    expect(control.observed.terminalConditionsChangeMovesDigest).toBe(false);
    expect(control.observed.authorizationDecisionsChangeMovesDigest).toBe(false);
    expect(control.observed.executionPathDeviationsChangeMovesDigest).toBe(false);
    expect(control.observed.reusedModulesChangeMovesDigest).toBe(false);
    expect(control.observed.stageStopChangeMovesDigest).toBe(false);
    /** The fields that DO move it, so the control is not measuring a digest that never moves. */
    expect(control.observed.scheduleChangeMovesDigest).toBe(true);
    expect(control.observed.closureChangeMovesDigest).toBe(true);
    /** The budget contradiction. */
    expect(control.observed.budgetEnforceableField).toBe("DECLARED_ONLY");
    expect(control.observed.budgetDeclaredOnly).toBe(true);
    expect(control.observed.conceptsEnforceableBudget).toBe(true);
    expect(control.observed.recordIsSchemaValid).toBe(true);
  });

  it("F5: the compiled-verification cache records no input identity", () => {
    const control = measured("F5_UNBOUND_COMPILER_CACHE");
    expect(control.defectPresent).toBe(true);
    expect(control.observed.carriesInputIdentity).toBe(false);
    expect(control.observed.secondCallIsTheSameObject).toBe(true);
    expect(control.observed.cacheKeyIsTheAbsenceOfAValue).toBe(true);
  });

  it("F1: the DETERMINISTIC default returns the captured preflight closure and records no measurement basis", () => {
    const control = measured("F1_CAPTURED_NOT_FRESH");
    expect(control.defectPresent).toBe(true);
    expect(control.observed.admissionEqualsPreflight).toBe(true);
    expect(control.observed.measurementBasisRecorded).toBe(false);
  });

  it("reports every declared property violated by the baseline", () => {
    expect(baselineControls?.declared).toBe(5);
    expect(baselineControls?.measuredProperties).toBe(5);
    expect(baselineControls?.ALL_DEFECTS_VIOLATED_BY_BASELINE).toBe(true);
    expect([...(baselineControls?.violated ?? [])].sort()).toEqual([...MEASUREMENT_GAP_IDS].sort());
    expect(baselineControls?.notViolated).toEqual([]);
    expect(baselineControls?.modelCallsMade).toBe(0);
    expect(baselineControls?.baseline).toBe(BASELINE_SOURCE.revision);
  });
});
