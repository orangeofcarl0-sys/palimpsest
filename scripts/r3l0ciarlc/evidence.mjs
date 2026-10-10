/**
 * R3-L0C-I-A-R-L-C §10/§12 — THE STAGE RESULT, DERIVED FROM THE QUALIFICATION.
 *
 * §12 requires the final report to carry the measured verdicts, the real evidence flow and the remaining blockers.
 * This module writes the machine-readable form of that: it DERIVES the stage result from the qualification record
 * rather than restating it, so the two cannot disagree, and it carries the three verdicts this stage cannot earn as
 * their honest values rather than promoting them.
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
    stage: 'R3-L0C-I-A-R-L-C',
    kind: 'authoritative causal admission closure stage result',
    baseline: BASELINE_COMMIT,
    verdicts: qualification.verdicts,
    modelCallsMade: STAGE_STOP.modelCallsMade,
    enteredPrimaryExecution: false,
    correctionGates: Object.freeze({
      declared: qualification.correctionGates.declared,
      allViolatedByBaseline: qualification.correctionGates.allViolated,
      violated: qualification.correctionGates.violated,
      notViolated: qualification.correctionGates.notViolated,
    }),
    admissionClosurePipeline: Object.freeze({
      pipeline: qualification.primaryMatrix.pipeline,
      mode: qualification.primaryMatrix.mode,
      terminalState: qualification.primaryMatrix.terminalState,
      matrixCompleted: qualification.primaryMatrix.matrixCompleted,
      completedSessions: qualification.primaryMatrix.completedSessions,
      maxLaunchesPerSession: qualification.primaryMatrix.maxLaunchesPerSession,
      terminalAdmissionDecision: qualification.primaryMatrix.terminalAdmissionDecision,
      terminalAdmissionGreen: qualification.primaryMatrix.terminalAdmissionGreen,
      journalRetries: qualification.primaryMatrix.journalRetries,
      journalReplacements: qualification.primaryMatrix.journalReplacements,
      allIdentitiesExact: qualification.primaryMatrix.allIdentitiesExact,
    }),
    durableCostBridge: Object.freeze({
      measuredCount: qualification.primaryMatrix.costMeasured,
      absentCount: qualification.primaryMatrix.costAbsent,
      provenance: qualification.primaryMatrix.costProvenance,
      interpretable: qualification.primaryMatrix.costInterpretable,
      allSixteenLivePrimary: qualification.primaryMatrix.costAllSixteenLivePrimary,
    }),
    liveEvidence: Object.freeze({
      sessions: qualification.primaryMatrix.liveEvidenceSessions,
      propagation: qualification.primaryMatrix.liveEvidencePropagation,
    }),
    attestation: qualification.attestation,
    authority: qualification.authority,
    faultInjection: qualification.faultInjection,
    executionClosure: qualification.executionClosure,
    planClosure: qualification.planClosure,
    immutability: Object.freeze({ verdict: qualification.immutability.verdict, protectedNamespaces: qualification.immutability.protectedNamespaces.length, restoreAvailable: qualification.immutability.restoreAvailable }),
    plan: qualification.plan,
    measurementReadiness: qualification.measurementReadiness,
    /** §11: the stop conditions, stated so the stage's own record carries them. */
    stageStop: Object.freeze({
      ranPaidMatrix: false,
      beganR3L1: false,
      beganFusion: false,
      modelCallsMade: 0,
      enteredPrimaryExecution: false,
    }),
    /** §12: the answer to the final acceptance question, from the measured evidence. */
    finalAcceptanceQuestion: Object.freeze({
      question: 'Can a missing, corrupted, stale, misattributed or caller-substituted experimental measurement still result in an apparently valid MATRIX_COMPLETED and an admitted causal result through the authoritative execution path?',
      answer: qualification.verdicts.POSTMATRIX_ADMISSION === 'PASS' && qualification.verdicts.DURABLE_COST_BRIDGE === 'PASS' ? 'NO — measured' : 'YES_OR_UNKNOWN',
      basis: 'the terminal-admission reducer is the single decision point, and it is RED for a drifted closure, a drifted route, a duplicated launch, an unexpected session, an identity mismatch, a damaged journal, a missing attribution, a failed attestation and a broken sidecar continuity; a fixture or absent cost blocks the causal verdict',
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
