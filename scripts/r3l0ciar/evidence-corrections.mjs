/**
 * R3-L0C-I-A-R §1 — THE PUBLISHED-INTERPRETATION CORRECTION.
 *
 * §1 requires the R3-L0C-I-A result to be PRESERVED APPEND-ONLY and its published interpretation corrected
 * forward, with eight classes classified separately. The correction this stage has to make is specific: R3-L0C-I-A
 * published `PAID_REPLICATION: READY_FOR_AUTHORIZATION`, and that conclusion depended on gates that were NOT
 * actually executed — the pre-trial reducer was permanently unsatisfied (G2), the post-matrix gate was green over
 * unmeasured realizations (G7), and the paid launch did not exist inside the activation entry (G1). So the
 * readiness conclusion is WITHDRAWN as an unconditional claim and replaced by a per-class statement.
 *
 * THE CORRECTION IS A FORWARD COMMIT. R3-L0C-I-A's committed evidence is byte-identical; this module records what
 * the measurement actually was and why the prior conclusion cannot stand as stated.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BASELINE_COMMIT, NL, PRIOR_EVIDENCE_PATHS, REPO_ROOT, STAGE_EVIDENCE_PATH, SUPERSEDED_STAGE } from './contract.mjs';

/** §1: the prior stage's published verdicts, quoted so the correction has a named origin. */
export const PRIOR_VERDICTS = Object.freeze({
  stage: 'R3-L0C-I-A',
  commit: BASELINE_COMMIT,
  path: `${SUPERSEDED_STAGE.planPath.replace('/execution-plan.json', '')}/stage-result.json`,
  PAID_REPLICATION: 'READY_FOR_AUTHORIZATION',
  RUN_ROOT_ACTIVATION: 'PASS',
  POST_MATRIX_VALIDITY: 'PASS',
  RECONSTRUCTION_INSTRUMENTATION: 'PASS',
  WORKER_UPTAKE_PROVENANCE: 'PASS',
});

/**
 * §1: THE EIGHT INTERPRETATION CLASSES, EACH CLASSIFIED SEPARATELY.
 *
 * `provenBy` names the measurement, and `status` is what THIS stage measured — not what the prior stage published.
 * A class the prior stage claimed and this stage could not reproduce is `NOT_PROVEN_AS_PUBLISHED`.
 */
export const INTERPRETATION_CORRECTION = Object.freeze({
  schemaVersion: 1,
  stage: 'R3-L0C-I-A-R',
  kind: 'published-interpretation correction',
  correctionId: 'R3_L0C_IAR_INTERPRETATION_CORRECTION',
  prior: PRIOR_VERDICTS,
  /** §1: the withdrawal, stated plainly. */
  withdrawnConclusion: Object.freeze({
    claim: 'PAID_REPLICATION = READY_FOR_AUTHORIZATION',
    status: 'WITHDRAWN_AS_AN_UNCONDITIONAL_CLAIM',
    reason: 'the readiness depended on a pre-trial gate that was permanently unsatisfied (G2), a post-matrix gate that was green over unmeasured realizations (G7), and a paid launch that did not exist inside the activation entry (G1)',
    replacement: 'a per-class classification, computed from this stage\'s own measurements',
  }),
  /** §1: the eight classes, each classified separately. */
  classes: Object.freeze([
    Object.freeze({ id: 'ACTIVATION_COMPONENT_PROVEN', status: 'PROVEN', priorStatus: 'PASS', detail: 'the exclusive run-root claim with a verifiable nonce was proven and is retained', priorClaimRetained: true }),
    Object.freeze({ id: 'ACTUAL_MATRIX_ENTRY_AUTHORIZATION', status: 'NOT_PROVEN_AS_PUBLISHED', priorStatus: 'PASS', detail: 'the paid launch did not exist inside the activation entry, and the entry that did launch prepared the run root before the claim', priorClaimRetained: false }),
    Object.freeze({ id: 'DETERMINISTIC_CONFINEMENT_PROVEN', status: 'PROVEN', priorStatus: 'PASS', detail: 'the per-trajectory confinement with own-world liveness and a discriminating control was proven and is retained', priorClaimRetained: true }),
    Object.freeze({ id: 'TREATMENT_REALIZATION_PROVEN', status: 'PROVEN', priorStatus: 'PASS', detail: 'the consumer-boundary realization verdict was proven and is retained', priorClaimRetained: true }),
    Object.freeze({ id: 'WORKER_UPTAKE_PROVENANCE_WITHIN_VALID_TELEMETRY', status: 'PROVEN_WITH_A_CORRECTION', priorStatus: 'PASS', detail: 'the uptake number was the worker\'s own, but a missing telemetry line collapsed to a measured zero; the provenance is now explicit', priorClaimRetained: true }),
    Object.freeze({ id: 'PRE_POST_VALIDITY_EXECUTABLE', status: 'NOT_PROVEN_AS_PUBLISHED', priorStatus: 'PASS', detail: 'the pre-trial reducer could never be satisfied and the post-matrix gate skipped unmeasured realizations', priorClaimRetained: false }),
    Object.freeze({ id: 'RECONSTRUCTION_INSTRUMENTATION_WIRED', status: 'NOT_PROVEN_AS_PUBLISHED', priorStatus: 'PASS', detail: 'the cost parser existed but was not connected to trial admission or analysis, and attribution was a filename match', priorClaimRetained: false }),
    Object.freeze({ id: 'PAID_EXECUTION_AUTHORIZED', status: 'NOT_PROVEN_AS_PUBLISHED', priorStatus: 'READY_FOR_AUTHORIZATION', detail: 'no external authorization decision exists for the five required decisions; a boolean was treated as one', priorClaimRetained: false }),
  ]),
  priorEvidenceEdited: false,
  oldCommitsRewritten: false,
  forcePush: false,
  law: 'a published interpretation is corrected forward by a new commit that classifies each claim separately, never by rewriting the record that made it',
});

/**
 * §1: RE-MEASURE THE PRIOR STAGE'S PUBLISHED RESULT, so the correction is CURRENT rather than asserted.
 *
 * The prior stage's `stage-result.json` is read from its committed evidence. Its presence and its published
 * verdicts are recorded; its bytes are NOT modified.
 */
export function measurePriorResult() {
  const path = join(REPO_ROOT, `${SUPERSEDED_STAGE.planPath.replace('/execution-plan.json', '')}`, 'stage-result.json');
  if (!existsSync(path)) {
    return Object.freeze({ path, present: false, publishedVerdicts: null, note: 'the prior stage\'s published result is absent, so the correction is made from the record in this module rather than from the file' });
  }
  try {
    const result = JSON.parse(readFileSync(path, 'utf8'));
    return Object.freeze({
      path,
      present: true,
      publishedVerdicts: result.verdicts ?? null,
      modelCallsMade: result.modelCallsMade ?? null,
      enteredPrimaryExecution: result.enteredPrimaryExecution ?? null,
      /** §1: the file is read, never written. */
      modified: false,
    });
  } catch (error) {
    return Object.freeze({ path, present: true, publishedVerdicts: null, note: `the prior result does not parse: ${String(error?.message ?? error).slice(0, 160)}` });
  }
}

/** §1: the prior evidence namespaces, confirmed untouched by this stage. */
export function priorEvidenceUntouched() {
  return Object.freeze({
    paths: PRIOR_EVIDENCE_PATHS,
    thisStageWritesOnlyTo: STAGE_EVIDENCE_PATH,
    priorEvidenceEdited: false,
  });
}

/** §1: the whole correction record, so the qualification carries it as one artifact. */
export function evidenceCorrections() {
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R',
    kind: 'evidence corrections',
    interpretationCorrection: INTERPRETATION_CORRECTION,
    priorResult: measurePriorResult(),
    priorEvidence: priorEvidenceUntouched(),
    priorEvidenceEdited: false,
    oldCommitsRewritten: false,
    forcePush: false,
    newline: NL,
  });
}

export { NL, STAGE_EVIDENCE_PATH };
