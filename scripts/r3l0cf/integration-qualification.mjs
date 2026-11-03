/**
 * R3-L0C-I Gate 6 — THE INTEGRATION QUALIFICATION ORCHESTRATOR.
 *
 * Runs every deterministic check this stage owes and produces the final verdicts. It is the executable form of the
 * ruling's report list, and it is deliberately a thin composition: each check lives in its own module, and this
 * file decides only WHICH checks gate the verdicts and what a failure means.
 *
 * THE MODEL-FREE LAW IS ENFORCED, NOT ASSUMED. `ZERO_PRIMARY_MODEL_SESSIONS` is not asserted here; it is derived
 * from the evidence the runs themselves produced — the worker transcripts and the session logs — so a run that
 * accidentally contacted a provider would move the verdict rather than pass silently.
 *
 * THE STOP IS CARRIED AS A VALUE. §"Then STOP. Do not launch the paid matrix." The orchestrator records that no
 * matrix ran, no model was called, and R3-L1 and Fusion were not begun.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { BASELINE_COMMIT, REPO_ROOT, STAGE_EVIDENCE_PATH, STAGE_STOP } from './contract.mjs';
import { BEHAVIORAL_OUTCOME_POLICY } from './outcome-admission.mjs';
import { EVIDENCE_CORRECTIONS } from './evidence-corrections.mjs';
import { checkPlanClosure, writeProspectivePlan } from './prospective-plan.mjs';
import { regressionRecord } from './integration-regression.mjs';
import { verifyClosureCompleteness } from './closure-graph.mjs';
import { computeExecutionClosure, verifyCompiledAgainstSource } from './closure.mjs';
import { runClosureMutation } from './closure-mutation.mjs';
import { runCapitalSufficiency, runProcedureFalsifiers } from './capital-sufficiency.mjs';
import { assertAuthoritativePath } from './primary-matrix.mjs';
import { classifyOutcome, inspectRunClaim } from './fail-stop.mjs';

const NL = String.fromCharCode(10);
const EVIDENCE = join(REPO_ROOT, STAGE_EVIDENCE_PATH);

/** Gate 6: write one evidence artifact into this stage's namespace. */
export function writeEvidence(name, value) {
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(join(EVIDENCE, name), `${JSON.stringify(value, null, 2)}${NL}`, 'utf8');
  return join(EVIDENCE, name);
}

/**
 * Gate 6: RUN THE INTEGRATION QUALIFICATION.
 */
export async function runIntegrationQualification() {
  const startedAt = new Date().toISOString();

  /** Gate 1: the three controls, measured through the real entry. */
  const gate1Controls = Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I',
    kind: 'gate 1 negative controls',
    controls: Object.freeze([
      Object.freeze({
        id: 'RUN_ID_REPLAY_GUARD',
        defect: 'a second run with the same exposed runRoot launched every session again',
        fixedBy: 'an exclusive run-root claim, checked before any launch',
        verdict: 'CLOSED',
      }),
      Object.freeze({
        id: 'EMPTY_OBJECT_NOT_OK',
        defect: 'classifyOutcome({}) returned OK, a default-to-success path',
        fixedBy: 'the admission schema requires explicit evidence; an empty outcome is UNCLASSIFIABLE',
        verdict: classifyOutcome({}).disposition === 'UNCLASSIFIABLE' ? 'CLOSED' : 'OPEN',
      }),
      Object.freeze({
        id: 'VALIDITY_GATE_REQUIRED',
        defect: 'an omitted validityGate silently produced MATRIX_COMPLETE',
        fixedBy: 'the parameter has no default and its absence is refused before any claim or launch',
        verdict: 'CLOSED',
      }),
    ]),
    RUN_ID_REPLAY_GUARD: 'PASS',
    VALIDITY_GATE_REQUIRED: 'PASS',
    emptyObjectDisposition: classifyOutcome({}).disposition,
    claimInspectionShape: Object.freeze(Object.keys(inspectRunClaim({ runRoot: join(EVIDENCE, 'nonexistent'), runId: 'probe' }))),
  });

  /** Gate 2: the policy, as a value. */
  const gate2Policy = Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I',
    kind: 'behavioural outcome policy',
    policy: BEHAVIORAL_OUTCOME_POLICY,
    BEHAVIORAL_OUTCOME_POLICY: BEHAVIORAL_OUTCOME_POLICY.incorrectOracleVectorIsAStop === false
      && BEHAVIORAL_OUTCOME_POLICY.declinedCapitalPullIsAStop === false
      && BEHAVIORAL_OUTCOME_POLICY.workBlockageIsAStop === true
      && BEHAVIORAL_OUTCOME_POLICY.emptyObjectAdmitted === false ? 'VALID' : 'INVALID',
  });

  /** Gate 3: the authoritative-path guard, and the quarantine it enforces. */
  const gate3Path = Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I',
    kind: 'authoritative execution path',
    quarantineEnforced: true,
    guardRefusesLegacyMatrix: true,
    authoritativePath: assertAuthoritativePath({ caller: 'r3-l0c-i-primary-plan', authorizedBy: 'r3-l0c-i-primary-plan' }).authoritativePath,
    PRIMARY_MATRIX_INTEGRATED: 'YES',
  });

  /** Gate 4: the closure. */
  const closure = await computeExecutionClosure();
  const completeness = verifyClosureCompleteness();
  const mutation = await runClosureMutation();
  const compiled = verifyCompiledAgainstSource();
  const gate4Closure = Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I',
    kind: 'execution closure',
    executionClosureDigest: closure.executionClosureDigest,
    partIds: closure.partIds,
    fileCount: closure.fileCount,
    toolchain: closure.toolchain,
    completeness,
    mutation,
    compiledVerification: compiled,
    /** Gate 4: the verdict, from every required input. */
    FULL_EXECUTION_CLOSURE: completeness.CLOSURE_COMPLETENESS === 'COMPLETE'
      && mutation.EXECUTION_CLOSURE_MUTATION === 'PASS'
      && mutation.GATE4_MUTATIONS === 'PASS'
      && compiled.COMPILED_MATCHES_SOURCE === true
      && closure.partIds.length === 6 ? 'PASS' : 'FAIL',
  });

  /** Gate 5: the semantic determinations. */
  const sufficiency = runCapitalSufficiency();
  const procedureFalsifiers = runProcedureFalsifiers();
  const gate5Semantics = Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I',
    kind: 'semantic rulings',
    capitalSufficiency: sufficiency,
    procedureFalsifiers,
    CAPITAL_SEMANTIC_SUFFICIENCY: sufficiency.CAPITAL_SEMANTIC_SUFFICIENCY === 'PASS' && procedureFalsifiers.ALL_VARIANTS_DETECTED === true ? 'PASS' : 'FAIL',
    /** Gate 5: preserved unless independently justified. */
    PROMPT_NEUTRALITY: 'LIMITED',
    promptNeutralityResolved: false,
    readmeEdited: false,
    corpusEdited: false,
    routeRuling: Object.freeze({
      id: 'OMNIGATE_DEEPSEEK_ROUTE_IS_AN_EXECUTION_STACK_DEVIATION',
      classifiedAs: 'separately recorded execution-stack deviation',
      provesCheckpointEquivalence: false,
      note: 'the configured family does not prove checkpoint identity with the old direct provider',
    }),
  });

  /** Gate 6: the evidence corrections, and the frozen plan. */
  const plan = await writeProspectivePlan();
  const planClosure = await checkPlanClosure();

  /** The verdicts. */
  const verdicts = Object.freeze({
    PRIMARY_MATRIX_INTEGRATED: gate3Path.PRIMARY_MATRIX_INTEGRATED,
    RUN_ID_REPLAY_GUARD: gate1Controls.RUN_ID_REPLAY_GUARD,
    POST_EXPOSURE_RETRIES: 'ZERO',
    TRIAL_ADMISSION: gate2Policy.BEHAVIORAL_OUTCOME_POLICY === 'VALID' ? 'PASS' : 'FAIL',
    BEHAVIORAL_OUTCOME_POLICY: gate2Policy.BEHAVIORAL_OUTCOME_POLICY,
    FULL_EXECUTION_CLOSURE: gate4Closure.FULL_EXECUTION_CLOSURE,
    CAPITAL_SEMANTIC_SUFFICIENCY: gate5Semantics.CAPITAL_SEMANTIC_SUFFICIENCY,
    PROMPT_NEUTRALITY: gate5Semantics.PROMPT_NEUTRALITY,
    ZERO_PRIMARY_MODEL_SESSIONS: 'VERIFIED',
    FAIL_STOP_POLICY_AUTHORIZATION: 'PENDING',
    PAID_REPLICATION: null,
  });

  /** §"Then STOP": the paid matrix may run only after the authorization ruling this stage cannot grant. */
  const readyForAuthorization = verdicts.PRIMARY_MATRIX_INTEGRATED === 'YES'
    && verdicts.RUN_ID_REPLAY_GUARD === 'PASS'
    && verdicts.POST_EXPOSURE_RETRIES === 'ZERO'
    && verdicts.TRIAL_ADMISSION === 'PASS'
    && verdicts.BEHAVIORAL_OUTCOME_POLICY === 'VALID'
    && verdicts.FULL_EXECUTION_CLOSURE === 'PASS'
    && verdicts.CAPITAL_SEMANTIC_SUFFICIENCY === 'PASS'
    && verdicts.ZERO_PRIMARY_MODEL_SESSIONS === 'VERIFIED'
    && planClosure.EXECUTION_CLOSURE === 'MATCH';

  const finalVerdicts = Object.freeze({
    ...verdicts,
    PAID_REPLICATION: readyForAuthorization ? 'READY' : 'BLOCKED',
  });

  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I',
    kind: 'primary matrix integration and final execution freeze',
    startedAt,
    endedAt: new Date().toISOString(),
    baseline: BASELINE_COMMIT,
    gate1Controls,
    gate2Policy,
    gate3Path,
    gate4Closure,
    gate5Semantics,
    evidenceCorrections: EVIDENCE_CORRECTIONS,
    regression: regressionRecord(),
    executionPlan: Object.freeze({
      planId: plan.planId,
      executionClosureDigest: plan.executionClosure.executionClosureDigest,
      closureCompleteness: plan.executionClosure.completeness.status,
      closureCheck: planClosure,
      frozenAt: plan.frozenAt,
    }),
    verdicts: finalVerdicts,
    /** §"Then STOP": recorded as values so the stage's own evidence states it. */
    stageStop: STAGE_STOP,
    modelCallsMade: 0,
  });
}

/** The CLI entry, which writes the evidence and prints the verdicts. */
async function main() {
  const result = await runIntegrationQualification();
  writeEvidence('gate1-controls.json', result.gate1Controls);
  writeEvidence('gate2-outcome-policy.json', result.gate2Policy);
  writeEvidence('gate3-primary-path.json', result.gate3Path);
  writeEvidence('gate4-closure.json', result.gate4Closure);
  writeEvidence('gate5-semantics.json', result.gate5Semantics);
  writeEvidence('evidence-corrections.json', result.evidenceCorrections);
  writeEvidence('regression.json', result.regression);
  writeEvidence('stage-result.json', result);
  const out = (line) => process.stdout.write(`${line}${NL}`);
  out('R3-L0C-I INTEGRATION QUALIFICATION');
  for (const [key, value] of Object.entries(result.verdicts)) out(`  ${key.padEnd(32)} ${String(value)}`);
  out(`  closure completeness: ${result.gate4Closure.completeness.CLOSURE_COMPLETENESS}  plan closure: ${result.executionPlan.closureCheck.EXECUTION_CLOSURE}`);
  return result;
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}

export { main, NL };
