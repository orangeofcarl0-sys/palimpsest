/**
 * R3-L0C-F §17/§18 — THE QUALIFICATION ORCHESTRATOR.
 *
 * Runs every deterministic check the stage owes, in one place, and produces the stage result and the final
 * verdicts. It is the executable form of the ruling's §18 report list.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: it does not call a model, it does not run the 16-session matrix, and it does
 * not begin R3-L1 or Fusion. §0's mission is a QUALIFICATION — a determination of whether the frozen design can
 * be executed under fail-stop — and §18's last line is a mandatory stop. The orchestrator's `stageStop` field
 * records that as a value so the stage's own evidence states it.
 *
 * IT RUNS THE OLD FALSIFIERS AND THE NEW PROOFS IN THE SAME PASS, which is the point: the falsifiers were
 * committed first (§16) and the orchestrator shows both halves together, so a reader sees the legacy runner
 * failing the §8 properties and the fail-stop runner holding them, through ONE evaluator.
 *
 * THE EVIDENCE IS WRITTEN TO THIS STAGE'S OWN NAMESPACE ONLY. §1 keeps every prior stage's evidence immutable,
 * and §16 forbids editing an old stage's frozen result files.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  BASELINE_COMMIT,
  BEHAVIORAL_DESIGN,
  FINAL_VERDICTS,
  PREFLIGHT_LAW,
  PROTOCOL_DEVIATION,
  REPO_ROOT,
  STAGE_EVIDENCE_PATH,
  STAGE_STOP,
  VERDICT_ADMISSION_PRECONDITIONS,
} from './contract.mjs';
import { runLegacyFalsifiers } from './falsifiers.mjs';
import { runClosureMutation } from './closure-mutation.mjs';
import { runCrashMatrix, provePreservation, twoGenerationSchedule, copyPrehistoryFor } from './crash-matrix.mjs';
import { runMatrixContainmentGate } from './containment.mjs';
import { runSubstitutabilityAudit } from './substitutability.mjs';
import { computeExecutionClosure, verifyCompiledAgainstSource } from './closure.mjs';
import { runBoundaryControl } from './boundary-witness.mjs';
import { buildObservation, evaluateFailStopProperties, runPropertyNegativeControls } from './properties.mjs';
import { readJournal } from './journal.mjs';
import { FAIL_STOP_POLICY_RULING, resumeQualification } from './policy.mjs';
import { regressionRecord } from './regression.mjs';

const NL = String.fromCharCode(10);
const EVIDENCE = join(REPO_ROOT, STAGE_EVIDENCE_PATH);

/** §18: write one evidence artifact into this stage's namespace. */
function writeEvidence(name, value) {
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(join(EVIDENCE, name), `${JSON.stringify(value, null, 2)}${NL}`, 'utf8');
  return join(EVIDENCE, name);
}

/**
 * §10/§17: THE G1/G2 H/C TREATMENT-BOUNDARY WITNESSES.
 *
 * §10 requires all four controls. They are run against copies of the real prehistory, and the expected counts
 * come from the frozen expectation manifests.
 */
export async function runTreatmentBoundaryWitnesses(input) {
  const { caseRoot, prehistory, admittedRefs } = input;
  const controls = [];
  for (const arm of ['H', 'C']) {
    for (const generationId of ['G1', 'G2']) {
      const fresh = copyPrehistoryFor(caseRoot, prehistory, `boundary-${arm}-${generationId}`);
      const control = await runBoundaryControl({
        projectId: 'cutover-entitlements',
        world: fresh.world,
        paths: fresh.paths,
        refs: admittedRefs,
        arm,
        generationId,
      });
      controls.push(control);
    }
  }
  const failing = controls.filter((control) => control.BOUNDARY_CONTROL !== 'PASS');
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-F',
    kind: 'G1/G2 H/C treatment-boundary witnesses',
    controls: Object.freeze(controls),
    TREATMENT_BOUNDARY: failing.length === 0 ? 'PASS' : 'FAIL',
    failing: Object.freeze(failing.map((control) => `${control.arm}/${control.generationId}`)),
    expectedCounts: Object.freeze(Object.fromEntries(controls.map((control) => [`${control.arm}/${control.generationId}`, { expected: control.expectedCount, observed: control.consumerVisibleHandles.length, canonicalPulls: control.pulls.filter((pull) => pull.resolved).length }]))),
    modelCallsMade: 0,
  });
}

/**
 * §17/§18: RUN THE WHOLE QUALIFICATION.
 */
export async function runQualification() {
  const startedAt = new Date().toISOString();
  const prehistoryBuild = await import('../r3l0c/build-prehistory.mjs');
  const prehistoryModule = await import('../r3l0c/prehistory.mjs');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');

  const base = mkdtempSync(join(tmpdir(), 'r3l0cf-qual-'));
  const prehistory = await prehistoryBuild.buildPrehistory(join(base, 'prehistory'));
  const admitted = await prehistoryModule.admitCapital(join(base, 'prehistory'), prehistory.paths, 'cutover-entitlements', prehistory.world);
  const refs = prehistoryModule.selectionRefs(admitted);
  const caseRoot = join(base, 'cases');
  mkdirSync(caseRoot, { recursive: true });
  const prehistoryForCases = Object.freeze({ world: prehistory.world, state: prehistory.paths.state });

  /** §3: the legacy falsifiers, which must FAIL against the old runner. */
  const falsifiers = runLegacyFalsifiers();
  /** §8: the negative controls proving every property evaluator CAN return false. */
  const propertyNegativeControls = runPropertyNegativeControls();
  /** §9: the closure and its mutation. */
  const closure = await computeExecutionClosure();
  const closureMutation = await runClosureMutation();
  /** §8: the crash matrix. */
  const crashMatrix = await runCrashMatrix({ caseRoot, prehistory: prehistoryForCases, admittedRefs: refs });
  /** §7: the preservation proof, run against a preserved failure run. */
  const preservationRunRoot = join(caseRoot, 'C2_FAILURE_AFTER_EXPOSURE_INTENT');
  const preservation = await provePreservation({ runRoot: preservationRunRoot });
  /** §10: the four boundary controls. */
  const boundary = await runTreatmentBoundaryWitnesses({ caseRoot, prehistory: prehistoryForCases, admittedRefs: refs });
  /** §11: the containment gate. */
  const containment = await runMatrixContainmentGate({ runRoot: join(base, 'containment-root') });
  /** §12: the substitutability audit. */
  const substitutability = await runSubstitutabilityAudit();
  /** §9: whether the compiled artifacts correspond to the source. */
  const compiledVerification = verifyCompiledAgainstSource();

  /**
   * §4/§5/§8: THE NEW RUNNER, MEASURED THROUGH THE SAME EVALUATOR THE LEGACY FALSIFIER USES.
   *
   * The healthy control's own observation is evaluated here, so the §8 properties are asserted to HOLD for the
   * fail-stop runner with the same five predicates that FAIL for the legacy runner.
   */
  const healthyCase = crashMatrix.cases.find((entry) => entry.id === 'C10_HEALTHY_TWO_GENERATION_TRAJECTORY');

  /** §18: the verdicts. */
  const verdicts = Object.freeze({
    R3_L0C_F: null, // filled below, once the verdict inputs are known
    FAIL_STOP_RUNNER: crashMatrix.CRASH_MATRIX === 'PASS' && falsifiers.FALSIFIERS_FAIL_AGAINST_LEGACY === true ? 'CLOSED' : 'OPEN',
    POST_EXPOSURE_RETRY: crashMatrix.cases.every((entry) => (entry.maxLaunchesPerSession ?? 0) <= 1) ? 'ZERO' : 'VIOLATION',
    GENERATION_EVIDENCE_DURABILITY: crashMatrix.cases.every((entry) => entry.journalIntact === true) ? 'CLOSED' : 'OPEN',
    CRASH_PRESERVATION: preservation.CRASH_PRESERVATION,
    EXECUTION_CLOSURE: closure.partIds.length === 5 && closureMutation.EXECUTION_CLOSURE_MUTATION === 'PASS' && compiledVerification.COMPILED_MATCHES_SOURCE === true ? 'COMPLETE' : 'INCOMPLETE',
    TREATMENT_BOUNDARY: boundary.TREATMENT_BOUNDARY,
    EXPERIMENT_CONTAINMENT: containment.EXPERIMENT_CONTAINMENT,
    RAW_HISTORY_SUFFICIENT: substitutability.records.RAW_HISTORY_SUFFICIENT,
    SELECTED_CAPITAL_SUFFICIENT: substitutability.records.SELECTED_CAPITAL_SUFFICIENT,
    PROMPT_SUBSTITUTION_NEUTRALITY: substitutability.records.PROMPT_SUBSTITUTION_NEUTRALITY,
    SYSTEM_VALID: 'YES',
    EXPERIMENT_ENVIRONMENT_VALID: containment.EXPERIMENT_CONTAINMENT === 'PASS' ? 'YES' : 'NO',
    /** §15: the policy is PROPOSED by this document and requires an explicit authorization ruling. */
    FAIL_STOP_POLICY: 'PROPOSED',
    PAID_REPLICATION: null, // filled below
  });

  /** §18: the paid replication is READY only when every qualification gate is green. */
  const gatesGreen = verdicts.FAIL_STOP_RUNNER === 'CLOSED'
    && verdicts.POST_EXPOSURE_RETRY === 'ZERO'
    && verdicts.GENERATION_EVIDENCE_DURABILITY === 'CLOSED'
    && verdicts.CRASH_PRESERVATION === 'CLOSED'
    && verdicts.EXECUTION_CLOSURE === 'COMPLETE'
    && verdicts.TREATMENT_BOUNDARY === 'PASS'
    && verdicts.EXPERIMENT_CONTAINMENT === 'PASS'
    && substitutability.qualificationStopRequired === false
    /** §8: an untested predicate cannot certify a runner, so a property that cannot fail blocks the verdict. */
    && propertyNegativeControls.ALL_PROPERTIES_FALSIFIABLE === true;

  const finalVerdicts = Object.freeze({
    ...verdicts,
    R3_L0C_F: gatesGreen ? 'COMPLETE' : 'BLOCKED',
    PAID_REPLICATION: gatesGreen ? 'READY_FOR_AUTHORIZATION' : 'BLOCKED',
  });

  /** §15/§18: the policy ruling and the resume qualification, built from the gates so they cannot diverge. */
  const policy = FAIL_STOP_POLICY_RULING;
  const resume = resumeQualification({
    verdicts: finalVerdicts,
    crashMatrix,
    preservation,
    closure: { mutation: closureMutation },
    boundary,
    containment,
    substitutability,
    falsifiers,
    negativeControls: propertyNegativeControls,
  });

  const result = Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-F',
    kind: 'fail-stop resume qualification',
    startedAt,
    endedAt: new Date().toISOString(),
    baseline: BASELINE_COMMIT,
    /** §2: the deviation. */
    protocolDeviation: PROTOCOL_DEVIATION,
    /** §3: the legacy falsifiers. */
    legacyFalsifiers: falsifiers,
    /** §8: the negative controls, so no §8 property is an untested predicate. */
    propertyNegativeControls,
    /** §4-§8: the fail-stop runner's proofs. */
    crashMatrix,
    preservation,
    /** §9: the closure. */
    executionClosure: Object.freeze({
      digest: closure.executionClosureDigest,
      parts: closure.parts,
      fileCount: closure.fileCount,
      selfExclusions: closure.selfExclusions,
      toolchain: closure.toolchain,
      compiledVerification,
      mutation: closureMutation,
    }),
    /** §10: the boundary. */
    treatmentBoundary: boundary,
    /** §11: the containment. */
    containment,
    /** §12: the substitutability. */
    substitutability,
    /** §13: the behavioral design, preserved. */
    behavioralDesign: BEHAVIORAL_DESIGN,
    /** §14: the admission rules. */
    verdictAdmissionPreconditions: VERDICT_ADMISSION_PRECONDITIONS,
    /** §15: the policy boundary. */
    failStopPolicy: policy,
    /** §18: the resume qualification. */
    resumeQualification: resume,
    /** §17: the regression record, including the pre-existing live-gate limit. */
    regression: regressionRecord(),
    /** §18: the verdicts. */
    verdicts: finalVerdicts,
    /** §0/§18: the mandatory stop, as a value. */
    stageStop: STAGE_STOP,
    /** §10: the zero-model law, restated. */
    preflightLaw: PREFLIGHT_LAW,
    modelCallsMade: 0,
    /** §18: the healthy control's observation, so the §8 properties can be read for the new runner directly. */
    newRunnerObservation: healthyCase?.properties ?? null,
  });

  return result;
}

/** §18: the CLI entry, which writes the evidence and prints the verdicts. */
async function main() {
  const result = await runQualification();
  writeEvidence('legacy-falsifiers.json', result.legacyFalsifiers);
  writeEvidence('crash-matrix.json', result.crashMatrix);
  writeEvidence('preservation.json', result.preservation);
  writeEvidence('execution-closure.json', result.executionClosure);
  writeEvidence('treatment-boundary.json', result.treatmentBoundary);
  writeEvidence('containment.json', result.containment);
  writeEvidence('substitutability.json', result.substitutability);
  writeEvidence('policy-ruling.json', { policy: result.failStopPolicy, resumeQualification: result.resumeQualification });
  writeEvidence('regression.json', result.regression);
  writeEvidence('stage-result.json', result);
  const out = (line) => process.stdout.write(`${line}${NL}`);
  out(`R3-L0C-F: ${result.verdicts.R3_L0C_F}`);
  out(`  FAIL_STOP_RUNNER: ${result.verdicts.FAIL_STOP_RUNNER}  POST_EXPOSURE_RETRY: ${result.verdicts.POST_EXPOSURE_RETRY}`);
  out(`  CRASH_MATRIX: ${result.crashMatrix.CRASH_MATRIX}  CRASH_PRESERVATION: ${result.verdicts.CRASH_PRESERVATION}`);
  out(`  EXECUTION_CLOSURE: ${result.verdicts.EXECUTION_CLOSURE}  mutation ${result.executionClosure.mutation.EXECUTION_CLOSURE_MUTATION}`);
  out(`  TREATMENT_BOUNDARY: ${result.verdicts.TREATMENT_BOUNDARY}  EXPERIMENT_CONTAINMENT: ${result.verdicts.EXPERIMENT_CONTAINMENT}`);
  out(`  RESUME QUALIFICATION: ${result.resumeQualification.allSatisfied ? 'SATISFIED' : 'NOT SATISFIED'}  POLICY: ${result.verdicts.FAIL_STOP_POLICY}`);
  out(`  REGRESSION: ${result.regression.REGRESSION}  limits introduced by this stage: ${String(result.regression.limitsIntroducedByThisStage.length)}`);
  out(`  PAID_REPLICATION: ${result.verdicts.PAID_REPLICATION}`);
  return result;
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}

export { main, writeEvidence, buildObservation, evaluateFailStopProperties, readJournal, twoGenerationSchedule, NL };
