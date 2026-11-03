/**
 * R3-L0C-I-A-R-L-C-F-S-H §5/§11 — THE PREVIOUS-STAGE ERRATUM.
 *
 * §1 freezes every previous `research-evidence/**` namespace and says: "Historical evidence may be inspected, never
 * rewritten." §11 requires this stage to supersede the prior plan rather than amend it.
 *
 * So the correction for the prior stage's contradictory persisted seal is a NEW record that NAMES the inconsistency
 * and points at the new plan identity — leaving the old evidence readable and wrong in a way a reader can now see.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { NL, PLAN_ID, REPO_ROOT, STAGE_EVIDENCE_PATH, SUPERSEDED_STAGE } from './contract.mjs';

/** §5: the prior evidence paths, read but never written. */
export const PRIOR_EVIDENCE = Object.freeze({
  plan: SUPERSEDED_STAGE.planPath,
  qualification: SUPERSEDED_STAGE.qualificationPath,
  stageResult: SUPERSEDED_STAGE.stageResultPath,
});

/** §5: read a JSON file under the repository root, or null. */
function readRepoJson(relative) {
  const path = join(REPO_ROOT, relative);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

/**
 * §5: BUILD THE ERRATUM FROM THE ACTUAL PRIOR EVIDENCE.
 *
 * Every value is READ from the prior files rather than typed in, so the erratum cannot drift from the evidence it
 * describes.
 */
export function buildErratum() {
  const plan = readRepoJson(PRIOR_EVIDENCE.plan);
  const qualification = readRepoJson(PRIOR_EVIDENCE.qualification);
  const stageResult = readRepoJson(PRIOR_EVIDENCE.stageResult);

  const committedPlanContentDigest = plan?.planContentDigest ?? null;
  const sealBinding = qualification?.crossArtifactSeal?.CROSS_ARTIFACT_PLAN_BINDING ?? null;
  const sealSealed = qualification?.crossArtifactSeal?.sealed ?? null;
  const verdictBinding = qualification?.verdicts?.CROSS_ARTIFACT_PLAN_BINDING ?? null;
  const readinessSealed = qualification?.readiness?.CROSS_ARTIFACT_EVIDENCE_SEALED ?? null;
  const qualificationVerdict = qualification?.verdicts?.DETERMINISTIC_MEASUREMENT_QUALIFICATION ?? null;

  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C-F-S-H',
    kind: 'previous-stage persisted-seal and qualification erratum',
    erratumFor: Object.freeze({
      stage: SUPERSEDED_STAGE.stage,
      commit: SUPERSEDED_STAGE.commit,
      planId: plan?.planId ?? SUPERSEDED_STAGE.planId,
      evidenceNamespace: 'research-evidence/r3-l0c-iar-lcfs',
    }),
    previousPlanId: plan?.planId ?? SUPERSEDED_STAGE.planId,
    committedPlanContentDigest,
    /** §5: the contradiction, read from the committed artifact rather than restated. */
    crossArtifactSealBinding: sealBinding,
    crossArtifactSealSealed: sealSealed,
    verdictCrossArtifactPlanBinding: verdictBinding,
    readinessCrossArtifactEvidenceSealed: readinessSealed,
    deterministicQualificationVerdict: qualificationVerdict,
    contradictionPresent: sealBinding === 'MISMATCH' && verdictBinding === 'MATCH' && readinessSealed === true,
    cause: 'runQualification called sealCrossArtifactPlanIdentity with `qualification: null` and `stageResult: null`, because at that point the two files did not exist yet. The resulting MISMATCH and sealed = false were recorded INSIDE the final Qualification as though they were a comparable final verdict. A separate source — the production plan control, sealing in-memory objects built from the plan\'s own identity — produced verdicts.CROSS_ARTIFACT_PLAN_BINDING = MATCH, and readiness.CROSS_ARTIFACT_EVIDENCE_SEALED was derived from those verdicts. The two sources were never compared, so one committed artifact carried a MISMATCH and a MATCH for the same property.',
    affectedPreviousVerdicts: Object.freeze(['CROSS_ARTIFACT_PLAN_BINDING', 'DETERMINISTIC_MEASUREMENT_QUALIFICATION']),
    /** §5: the exact statements §5 requires, stated as values. */
    prePersistenceCheckWasRecordedAsAFinalVerdict: true,
    deterministicQualificationWasALiteralPass: qualificationVerdict === 'PASS',
    /** §5: why the prior DETERMINISTIC measurement records remain preserved. */
    whyPriorDeterministicRecordsRemainPreserved: Object.freeze([
      'the deterministic measurement records describe the R3-L0C-I-A-R-L-C-F-S pipeline at 80823c4, which this stage does not edit, so they remain an accurate description of that code',
      'the defects this stage closes are confined to the EVIDENCE ADMISSION path — the missing envelope consumer, the cleanup safety branches and the seal/verdict derivation — not to the matrix observations, the durable reconciliation or the closure measurement those records also carry',
      'rewriting the prior evidence would make it describe bytes that never existed, which is the failure the historical-immutability rule exists to prevent, so the correction is recorded here as a NEW erratum instead',
      'the prior stage\'s matrix result remains a valid MECHANICAL record; what it cannot support is the claim that its cost admission was validated and its qualification verdict derived',
    ]),
    newSupersedingPlanId: PLAN_ID,
    newSupersedingEvidenceNamespace: STAGE_EVIDENCE_PATH,
    supersessionReason: 'terminal enforcement and execution safety, NOT a scientific design change',
    priorEvidenceModified: false,
    priorEvidenceReadOnly: true,
    law: 'the previous stage recorded a pre-persistence MISMATCH as a final verdict beside a MATCH derived from a different source; the prior evidence is never rewritten, and the correction is recorded as a stage-owned erratum naming the new superseding plan identity',
  });
}

/** §5: write the erratum into this stage's evidence namespace. */
export function writeErratum() {
  const erratum = buildErratum();
  const directory = join(REPO_ROOT, STAGE_EVIDENCE_PATH);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'erratum.json'), `${JSON.stringify(erratum, null, 2)}${NL}`, 'utf8');
  return erratum;
}

export { NL };
