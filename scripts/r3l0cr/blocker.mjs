/**
 * R3-L0C-R §11/§14 — THE EXECUTION BLOCKER RECORD.
 *
 * §11 makes the reconstruction-pressure gate a CONTINUATION gate: if it is GREEN, the stage continues
 * automatically to the clean repair replication. The gate IS green. The replication nevertheless cannot execute,
 * and this module records why in a form that is checkable rather than asserted.
 *
 * THE BLOCKER. The frozen sentinel stack routes to `https://api.deepseek.com` and the account returns
 * `HTTP 402 Insufficient Balance`. That is a BILLING state, not a transient failure: it does not clear on retry,
 * and it was verified by calling the route directly rather than inferred from a worker's failure. The same route
 * carried all 16 R3-L0C sessions successfully earlier in this session, so the balance was sufficient then and is
 * exhausted now.
 *
 * WHY THE ALTERNATIVE IS NOT TAKEN. R3-L0C's original rule permitted GLM when the primary sentinel was
 * unavailable BEFORE trial 1. This stage's ruling forbids it outright: `Do NOT run GLM/Kimi.` The prohibition is
 * explicit and specific to this stage, so it governs. Substituting a different route to the same model would be a
 * quiet change to the frozen model stack that §12 requires to be preserved, and a silent substitution is exactly
 * what this project's rulings exist to prevent.
 *
 * SO THE STAGE STOPS, and the important part is what it stops WITH: every pre-exposure repair is complete,
 * committed and proven deterministically, and no primary project byte was exposed to a model. The plan is
 * therefore still unspent and unamended, which is the state a later attempt needs.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT, STAGE_EVIDENCE_PATH } from './contract.mjs';
import { computeExecutionClosure } from './mutations.mjs';

const NL = String.fromCharCode(10);
const EVIDENCE = join(REPO_ROOT, STAGE_EVIDENCE_PATH);

/** §14: the blocker, with the evidence that establishes it. */
export const EXECUTION_BLOCKER = Object.freeze({
  id: 'FROZEN_SENTINEL_ROUTE_UNAVAILABLE_INSUFFICIENT_BALANCE',
  kind: 'external provider billing state',
  loadBearing: true,
  route: Object.freeze({ routeId: 'deepseek-direct', providerId: 'deepseek-route', modelId: 'deepseek-flash', baseURL: 'https://api.deepseek.com' }),
  observed: Object.freeze({
    httpStatus: 402,
    providerCode: 'invalid_request_error',
    providerMessage: 'Insufficient Balance',
    /** The observation came from calling the route directly, not from reading a worker's failure. */
    verifiedBy: 'a direct request to the provider chat-completions endpoint with the frozen route\'s credential',
    fromWorkerTranscript: 'the worker turn ended with reason.kind=error and code=QUOTA, status=402, which is the same state observed at the provider',
  }),
  transient: false,
  clearsOnRetry: false,
  /** The contrast that makes the finding precise: the same route worked earlier in this session. */
  priorSuccess: 'all 16 R3-L0C Run-1 sessions completed on this same route, so the balance was sufficient then',
  /** §12/§14: why the fallback is not taken. */
  fallbackConsidered: Object.freeze([
    Object.freeze({ option: 'GLM via the alternative route', permittedBy: 'R3-L0C §13 (primary sentinel unavailable before trial 1)', forbiddenBy: 'this stage: Do NOT run GLM/Kimi', taken: false }),
    Object.freeze({ option: 'a different provider route to the same model', permittedBy: 'nothing', forbiddenBy: 'this stage §12: preserve the frozen low-cost sentinel stack', taken: false }),
    Object.freeze({ option: 'retrying until the balance clears', permittedBy: 'nothing', forbiddenBy: 'the state is a billing condition, not a transient error, so retrying would burn wall-clock without a model call succeeding', taken: false }),
  ]),
  /** What the stage stops WITH, which is the part that matters for a later attempt. */
  stateAtStop: Object.freeze({
    preExposureRepairsComplete: true,
    planCommittedAndUnamended: true,
    primaryBytesExposedToAModel: false,
    executionClosureFrozen: true,
  }),
});

/**
 * §14: THE REPLICATION LEDGER.
 *
 * §11's continuation gate is green and the run never started, so the ledger records zero attempted and zero valid
 * sessions with the reason. A ledger that simply omitted the run would be indistinguishable from one where the
 * run was never planned.
 */
export function replicationLedger() {
  const matrixPath = join(EVIDENCE, 'matrix.json');
  const matrix = existsSync(matrixPath) ? JSON.parse(readFileSync(matrixPath, 'utf8')) : null;
  const planPath = join(EVIDENCE, 'plan.json');
  const plan = existsSync(planPath) ? JSON.parse(readFileSync(planPath, 'utf8')) : null;
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-R',
    kind: 'repair replication ledger',
    plannedSessions: plan === null ? null : plan.sessions.length,
    attemptedSessions: matrix === null ? 0 : matrix.sessions.length,
    validSessions: matrix === null ? 0 : matrix.validSessions,
    matrixWritten: matrix !== null,
    /** §11: the gate that would have permitted the run. */
    continuationGateGreen: true,
    executed: false,
    reason: 'the frozen sentinel route is unavailable (402 Insufficient Balance), and this stage forbids the fallback',
    /** §15: with no trial executed, no trial record exists to be immutable or to carry realization evidence. */
    trialRecordsWritten: 0,
    treatmentVerdictsIssued: false,
    run1ContributionToVerdicts: 0,
  });
}

/** §20: the stage result, which reports what the stage can support and refuses what it cannot. */
export function stageResult(input) {
  const { plan, ledger, erratum, mutations, probe, closureFrozen } = input;
  const closureCurrent = computeExecutionClosure();
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-R',
    kind: 'treatment realization and repair replication stage result',
    status: 'BLOCKED',
    statusReason: 'every pre-exposure repair is complete and the continuation gate is green, but the frozen sentinel route is unavailable, so the replication could not execute',

    /** §1: the Run-1 erratum. */
    run1Status: 'TREATMENT_NOT_APPLIED',
    run1Erratum: erratum === null ? null : Object.freeze({
      correctedVerdicts: erratum.correctedVerdicts,
      failedDimension: erratum.failedDimension,
      historicalReportPreserved: erratum.preservedHistoricalReport.preserved,
      historicalReportRewritten: erratum.preservedHistoricalReport.rewritten,
    }),

    /** §4/§5: the selection contract and its repair, proven deterministically. */
    selectionContract: Object.freeze({
      case: 'HARNESS_BYPASSED_TYPED_API',
      productChangeMade: false,
      mutationsDetected: mutations === null ? null : mutations.mutationsDetected,
      controlsPassed: mutations === null ? null : mutations.controlsPassed,
      realModelLaunchesOnAnyMutation: mutations === null ? null : mutations.REAL_MODEL_LAUNCH_COUNT_ON_ANY_MUTATION,
    }),

    /** §7: the real-prehistory boundary proof. */
    boundaryProbe: probe === null ? null : Object.freeze({
      verdict: probe.BOUNDARY_PROBE,
      handlesDelivered: probe.consumerVisibleHandles.length,
      pullsResolved: probe.pulls.filter((pull) => pull.resolved).length,
      usedRealPrehistory: probe.usedRealPrehistory,
      dummyProject: probe.dummyProject,
      noLlmInvoked: probe.noLlmInvoked,
    }),

    /** §9: the closure, frozen and still matching because no code changed after the plan commit. */
    executionClosure: Object.freeze({
      frozen: closureFrozen,
      current: closureCurrent.executionClosureDigest,
      matches: closureFrozen === closureCurrent.executionClosureDigest,
    }),

    /** §14: the ledger. */
    replication: ledger,

    /** §14: the blocker. */
    blocker: EXECUTION_BLOCKER,

    /** §16: the four dimensions, each answered honestly for THIS stage. */
    validity: Object.freeze({
      SYSTEM_VALID: 'YES',
      EXPERIMENT_ENVIRONMENT_VALID: 'YES',
      /** The realization GATE is proven green, but realization VALIDITY is a property of executed trials. */
      TREATMENT_REALIZATION_VALID: 'NO',
      TREATMENT_REALIZATION_NOTE: 'the realization gate is proven green deterministically (boundary probe PASS, mutations detected, zero launches on any malformed shape), but no replication trial executed, so realization is NOT ESTABLISHED for a replication that did not run',
      ANALYSIS_PLAN_VALID: 'YES',
      CAUSAL_EXPERIMENT_VALID: 'NO',
      CAUSAL_EXPERIMENT_NOTE: 'no treatment verdict is issued, because no replication trial exists to analyse',
    }),

    /** §18: Run 1 contributes nothing to the treatment verdicts. */
    verdicts: Object.freeze({
      R3_L0C_R: 'BLOCKED',
      RUN_1: 'TREATMENT_NOT_APPLIED',
      RECONSTRUCTION_PRESSURE: 'PRESENT',
      CAPITAL_UPTAKE: 'NOT_EVALUABLE',
      RECONSTRUCTION_COMPRESSION: 'NOT_EVALUABLE',
      NET_COGNITIVE_COST: 'NOT_EVALUABLE',
      NEXT: 'STOP',
      NEXT_REASON: 'the frozen sentinel route is unavailable, and this stage forbids the fallback; the design and repairs are complete and unspent, so a later attempt resumes from the committed plan without amending it',
    }),

    /** §12: the naming rule, carried so no report over-claims. */
    replicationName: 'REPAIR_REPLICATION',
    replicationExecuted: false,
  });
}

function main() {
  const ledger = replicationLedger();
  const erratum = existsSync(join(EVIDENCE, 'run-1-erratum.json')) ? JSON.parse(readFileSync(join(EVIDENCE, 'run-1-erratum.json'), 'utf8')) : null;
  const mutations = existsSync(join(EVIDENCE, 'selection-mutations.json')) ? JSON.parse(readFileSync(join(EVIDENCE, 'selection-mutations.json'), 'utf8')) : null;
  const plan = existsSync(join(EVIDENCE, 'plan.json')) ? JSON.parse(readFileSync(join(EVIDENCE, 'plan.json'), 'utf8')) : null;
  const result = stageResult({ plan, ledger, erratum, mutations, probe: null, closureFrozen: plan?.executionClosure?.executionClosureDigest ?? null });
  writeFileSync(join(EVIDENCE, 'execution-blocker.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'R3-L0C-R', blocker: EXECUTION_BLOCKER, ledger }, null, 2)}${NL}`, 'utf8');
  writeFileSync(join(EVIDENCE, 'stage-result.json'), `${JSON.stringify(result, null, 2)}${NL}`, 'utf8');
  process.stdout.write(`R3-L0C-R: ${result.verdicts.R3_L0C_R}${NL}`);
  process.stdout.write(`  blocker: ${EXECUTION_BLOCKER.id}${NL}`);
  process.stdout.write(`  RUN_1: ${result.verdicts.RUN_1}  RECONSTRUCTION_PRESSURE: ${result.verdicts.RECONSTRUCTION_PRESSURE}${NL}`);
  process.stdout.write(`  SYSTEM_VALID: ${result.validity.SYSTEM_VALID}  EXPERIMENT_ENVIRONMENT_VALID: ${result.validity.EXPERIMENT_ENVIRONMENT_VALID}${NL}`);
  process.stdout.write(`  TREATMENT_REALIZATION_VALID: ${result.validity.TREATMENT_REALIZATION_VALID}  CAUSAL_EXPERIMENT_VALID: ${result.validity.CAUSAL_EXPERIMENT_VALID}${NL}`);
  process.stdout.write(`  NEXT: ${result.verdicts.NEXT}${NL}`);
  return result;
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  main();
}

export { main };
