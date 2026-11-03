/**
 * R3-L0C-I-A-R-L-C-F §12/§14 — THE STAGE RESULT, DERIVED FROM THE QUALIFICATION.
 *
 * §14 requires the final report to carry the measured verdicts, the evidence flow, the readiness statements and the
 * remaining blockers. This module writes the machine-readable form of that: it DERIVES the stage result from the
 * qualification record rather than restating it, so the two cannot disagree, and it carries the verdicts this stage
 * cannot earn as their honest values rather than promoting them.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { BASELINE_COMMIT, NL, REPO_ROOT, STAGE_EVIDENCE_PATH, STAGE_STOP } from './contract.mjs';

/** §12: build the stage result from the qualification record. */
export function buildStageResult(qualification) {
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C-F',
    kind: 'measurement fidelity and pre-authorization closure stage result',
    baseline: BASELINE_COMMIT,
    verdicts: qualification.verdicts,
    readiness: qualification.readiness,
    modelCallsMade: STAGE_STOP.modelCallsMade,
    enteredPrimaryExecution: false,
    correctionGaps: Object.freeze({
      declared: qualification.correctionGates.declared,
      allViolatedByBaseline: qualification.correctionGates.allViolated,
      violated: qualification.correctionGates.violated,
      notViolated: qualification.correctionGates.notViolated,
    }),
    measurementFidelityPipeline: Object.freeze({
      pipeline: qualification.primaryMatrix.pipeline,
      mode: qualification.primaryMatrix.mode,
      terminalState: qualification.primaryMatrix.terminalState,
      matrixCompleted: qualification.primaryMatrix.matrixCompleted,
      completedSessions: qualification.primaryMatrix.completedSessions,
      maxLaunchesPerSession: qualification.primaryMatrix.maxLaunchesPerSession,
      measurementBasis: qualification.primaryMatrix.measurementBasis,
      terminalAdmissionDecision: qualification.primaryMatrix.terminalAdmissionDecision,
      terminalAdmissionGreen: qualification.primaryMatrix.terminalAdmissionGreen,
      terminalAdmissionConditions: qualification.primaryMatrix.terminalAdmissionConditions,
      durableReconciliationGreen: qualification.primaryMatrix.durableReconciliationGreen,
      journalRetries: qualification.primaryMatrix.journalRetries,
      journalReplacements: qualification.primaryMatrix.journalReplacements,
    }),
    costBridge: Object.freeze({
      measuredCount: qualification.primaryMatrix.costMeasured,
      absentCount: qualification.primaryMatrix.costAbsent,
      provenance: qualification.primaryMatrix.costProvenance,
      interpretable: qualification.primaryMatrix.costInterpretable,
      allSixteenLivePrimary: qualification.primaryMatrix.costAllSixteenLivePrimary,
      costAccountingComplete: qualification.primaryMatrix.costAccountingComplete,
      costMeasuredComplete: qualification.primaryMatrix.costMeasuredComplete,
      livePrimaryCostComplete: qualification.primaryMatrix.livePrimaryCostComplete,
    }),
    causalReduction: Object.freeze({
      CAUSAL_RESULT: qualification.primaryMatrix.causalResult,
      failingPrerequisites: qualification.primaryMatrix.causalFailing,
    }),
    realMutations: qualification.realMutations,
    liveEvidence: Object.freeze({
      sessions: qualification.primaryMatrix.liveEvidenceSessions,
      propagation: qualification.primaryMatrix.liveEvidencePropagation,
    }),
    attestation: qualification.attestation,
    authority: qualification.authority,
    faultInjection: qualification.faultInjection,
    executionClosure: qualification.executionClosure,
    planClosure: qualification.planClosure,
    planContentDigest: qualification.planContentDigest,
    immutability: Object.freeze({ verdict: qualification.immutability.verdict, protectedNamespaces: qualification.immutability.protectedNamespaces.length, restoreAvailable: qualification.immutability.restoreAvailable }),
    plan: qualification.plan,
    /** §13: the stop conditions, stated so the stage's own record carries them. */
    stageStop: Object.freeze({
      ranPaidMatrix: false,
      beganR3L1: false,
      beganFusion: false,
      modelCallsMade: 0,
      enteredPrimaryExecution: false,
      paidExecution: 'NOT_RUN',
      realPrimaryCausalResult: 'NOT_EVALUABLE',
    }),
    /** §14: the answer to the final acceptance question, from the measured evidence. */
    finalAcceptanceQuestion: Object.freeze({
      question: 'Can the authoritative execution path still confuse a cached observation with a fresh measurement, a route declaration with real Worker provenance, an explicitly absent cost with a measured endpoint, or a partial Plan Digest with the full authorized experiment?',
      answer: qualification.verdicts.NORMAL_PATH_FRESHNESS === 'PASS'
        && qualification.verdicts.CAUSAL_ADMISSION_INTEGRITY === 'PASS'
        && qualification.verdicts.FULL_PLAN_DIGEST === 'PASS'
        && qualification.verdicts.LIVE_PRIMARY_PROVENANCE === 'NOT_ESTABLISHED' ? 'NO — measured, with the live-provenance capability NOT_ESTABLISHED' : 'YES_OR_UNKNOWN',
      basis: 'the default path now recomputes the closure and the route at admission and records its basis; a route declaration and a sidecar mode cannot produce LIVE_PRIMARY without a corroborated execution witness; an explicit absence satisfies only the accounting level and not a measured endpoint; the full-plan digest covers every plan field except its own and moves on each material change; and the causal reduction requires every prerequisite rather than allSixteenLivePrimary alone',
    }),
  });
}

/** §12: write the stage result into this stage's evidence namespace. */
export function writeStageResult(qualification) {
  const result = buildStageResult(qualification);
  const directory = join(REPO_ROOT, STAGE_EVIDENCE_PATH);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'stage-result.json'), `${JSON.stringify(result, null, 2)}${NL}`, 'utf8');
  return result;
}

export { NL };
