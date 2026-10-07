/**
 * R3-L0C-R §17/§18 — THE REPAIR-REPLICATION ANALYSIS.
 *
 * §18 is explicit: use the ORIGINAL frozen R3-L0C `RECONSTRUCTION_COMPRESSION` and `NET_COGNITIVE_COST` rules
 * UNCHANGED, and Run 1 contributes ZERO observations to them. §17 is equally explicit: use the already-frozen
 * R3-L0C outcomes and add no new primary endpoint after seeing Run 1.
 *
 * SO THIS MODULE ADDS NO VERDICT LOGIC. It RE-EXPORTS the frozen rules and verdict functions and supplies only
 * what the replication needs that Run 1 did not have: the treatment-realization check per trial, and the
 * pre-condition that every analysed trial satisfies all four validity dimensions.
 *
 * WHY THE PRE-CONDITION IS THE LOAD-BEARING PART. Run 1 had a sound environment and an absent treatment, and it
 * produced 16 sessions that LOOKED like data. The check that stops that from recurring is not in the verdict
 * logic — it is in the admission gate: a trial whose treatment realization mismatched is INVALID and triggers a
 * STOP, not a retry and not an observation.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import {
  COMPRESSION,
  DIRECTIONS,
  NET_COST,
  compressionVerdict,
  netCostVerdict,
  pairAllBlocks,
  pairBlock,
  reliabilityReport,
  completionReport,
} from '../r3l0c/analyse.mjs';
import { INFORMATION_PATHS } from '../r3l0c/contract.mjs';
import { classifyInformationPath } from '../r3l0c/witness.mjs';
import { causalExperimentValidFrom, verifyRealization } from './contract.mjs';

const NL = String.fromCharCode(10);

/**
 * §17/§18: THE FROZEN VERDICT SURFACE, re-exported so a reader can see this stage added no rule.
 *
 * `REEXPORTED_FROM` names the source module, and the closure digest covers it, so a change to the frozen rules
 * would be visible as a drift rather than as a silent redefinition.
 */
export const FROZEN_VERDICT_SURFACE = Object.freeze({
  REEXPORTED_FROM: 'scripts/r3l0c/analyse.mjs',
  addedRules: false,
  compression: COMPRESSION,
  netCost: NET_COST,
  directions: DIRECTIONS,
  informationPaths: INFORMATION_PATHS,
});

export { compressionVerdict, netCostVerdict, pairAllBlocks, pairBlock, reliabilityReport, completionReport, classifyInformationPath, COMPRESSION, NET_COST, DIRECTIONS };

/**
 * §16: ADMIT A TRIAL FOR ANALYSIS.
 *
 * §16 requires every analysed trial to satisfy all four dimensions. A trial that fails treatment realization is
 * INVALID, and §15 says the response is a STOP rather than a retry as a model outcome.
 */
export function admitTrialForAnalysis(input) {
  const { trial, expectation } = input;
  const realization = verifyRealization(expectation, trial.telemetry);
  const dimensions = Object.freeze({
    SYSTEM_VALID: input.systemValid === true,
    EXPERIMENT_ENVIRONMENT_VALID: input.environmentValid === true,
    TREATMENT_REALIZATION_VALID: realization.TREATMENT_REALIZATION === 'APPLIED',
    ANALYSIS_PLAN_VALID: input.analysisPlanValid === true,
  });
  const validity = causalExperimentValidFrom(dimensions);
  return Object.freeze({
    sessionId: trial.sessionId,
    realization,
    validity,
    admitted: validity.CAUSAL_EXPERIMENT_VALID === true,
    /** §15: a realization mismatch is INVALID and stops the run; it is never retried as a model outcome. */
    onRealizationMismatch: realization.TREATMENT_REALIZATION === 'APPLIED' ? null : 'STOP — the trial is INVALID and is not retried as a model outcome',
  });
}

/**
 * §15/§16: ADMIT THE WHOLE REPLICATION.
 *
 * Returns the admitted trials and the refused ones separately, plus the dimensions' verdicts. If ANY trial is
 * refused, `CAUSAL_EXPERIMENT_VALID` is NO and no treatment verdict is issued.
 */
export function admitReplication(input) {
  const { sessions, expectations, systemValid, environmentValid, analysisPlanValid } = input;
  const admissions = sessions.map((session) => admitTrialForAnalysis({
    trial: session,
    expectation: expectations[session.sessionId],
    systemValid,
    environmentValid,
    analysisPlanValid,
  }));
  const refused = admissions.filter((admission) => !admission.admitted);
  const allValid = refused.length === 0 && admissions.length > 0;
  return Object.freeze({
    schemaVersion: 1,
    kind: 'replication admission',
    trials: admissions.length,
    admitted: admissions.length - refused.length,
    refused: Object.freeze(refused.map((admission) => admission.sessionId)),
    refusals: Object.freeze(refused),
    CAUSAL_EXPERIMENT_VALID: allValid,
    dimensions: Object.freeze({
      SYSTEM_VALID: systemValid === true,
      EXPERIMENT_ENVIRONMENT_VALID: environmentValid === true,
      TREATMENT_REALIZATION_VALID: refused.every((admission) => admission.validity.failing.includes('TREATMENT_REALIZATION_VALID')) === false,
      ANALYSIS_PLAN_VALID: analysisPlanValid === true,
    }),
    /** §16: the consequence. */
    verdictsIssued: allValid,
    onFailure: 'no reconstruction-compression or net-cost treatment verdict is issued',
  });
}

/**
 * §17/§18: THE FROZEN ANALYSIS over the admitted sessions.
 *
 * It delegates every number to the frozen functions and reports the treatment realization alongside, so a reader
 * can see the realization state and the verdict together.
 */
export function analyseReplication(input) {
  const admission = admitReplication(input);
  if (admission.CAUSAL_EXPERIMENT_VALID !== true) {
    return Object.freeze({
      kind: 'repair replication analysis',
      admission,
      CAUSAL_EXPERIMENT_VALID: false,
      verdictsIssued: false,
      reason: 'not every analysed trial satisfied all four validity dimensions',
    });
  }
  const sessions = input.sessions;
  const pairs = pairAllBlocks(sessions);
  return Object.freeze({
    kind: 'repair replication analysis',
    admission,
    CAUSAL_EXPERIMENT_VALID: true,
    verdictsIssued: true,
    pairs,
    compression: compressionVerdict(pairs),
    netCost: netCostVerdict(pairs),
    reliability: reliabilityReport(sessions),
    completion: completionReport(sessions),
    informationPaths: Object.freeze(sessions.map((session) => Object.freeze({ sessionId: session.sessionId, arm: session.arm, path: session.informationPath }))),
    realizationByTrial: Object.freeze(admission.trials === 0 ? [] : sessions.map((session, index) => Object.freeze({ sessionId: session.sessionId, realization: admission.refusals.length === 0 ? 'APPLIED' : null, index }))),
  });
}

export { NL };
