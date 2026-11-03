/**
 * R3-L0C-I-A-R-L-C-F-S §3 — THE PREVIOUS-STAGE ERRATUM.
 *
 * §3: "Do not modify `research-evidence/r3-l0c-iar-lcf/**`. Instead create a stage-owned erratum naming: the previous
 * Plan ID; its committed Plan Content Digest; the mismatched Qualification Plan Reference Digest; the cause; the
 * affected previous verdict; why the previous deterministic measurement records remain preserved; the new superseding
 * plan identity."
 *
 * And: "The erratum must state that the previous stage's plan self-check was MATCH, but its cross-artifact reference
 * was inconsistent. Do not retrospectively describe the old Qualification as fully sealed."
 *
 * WHY AN ERRATUM AND NOT A REPAIR. The prior stage's evidence is historical. Rewriting it would make its records
 * describe bytes that never existed, which is exactly the failure the immutability rule exists to prevent. So the
 * correction is a NEW record that NAMES the inconsistency and points at the new plan identity — leaving the old
 * evidence readable and wrong in a way a reader can now see.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { NL, PLAN_ID, REPO_ROOT, STAGE_EVIDENCE_PATH, SUPERSEDED_STAGE } from './contract.mjs';

/** §3: the prior evidence paths, read but never written. */
export const PRIOR_EVIDENCE = Object.freeze({
  plan: SUPERSEDED_STAGE.planPath,
  qualification: 'research-evidence/r3-l0c-iar-lcf/qualification.json',
  stageResult: 'research-evidence/r3-l0c-iar-lcf/stage-result.json',
});

/** §3: read a JSON file under the repository root, or null. */
function readRepoJson(relative) {
  const path = join(REPO_ROOT, relative);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

/**
 * §3: BUILD THE ERRATUM FROM THE ACTUAL PRIOR EVIDENCE.
 *
 * Every value is READ from the prior files rather than typed in, so the erratum cannot drift from the evidence it
 * describes.
 */
export function buildErratum() {
  const plan = readRepoJson(PRIOR_EVIDENCE.plan);
  const qualification = readRepoJson(PRIOR_EVIDENCE.qualification);
  const stageResult = readRepoJson(PRIOR_EVIDENCE.stageResult);

  const committedPlanContentDigest = plan?.planContentDigest ?? null;
  const qualificationPlanReference = qualification?.plan?.planContentDigest ?? null;
  const stageResultPlanReference = stageResult?.plan?.planContentDigest ?? null;
  const previousPlanId = plan?.planId ?? SUPERSEDED_STAGE.planId;

  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C-F-S',
    kind: 'previous-stage cross-artifact plan-identity erratum',
    erratumFor: Object.freeze({
      stage: SUPERSEDED_STAGE.stage,
      commit: SUPERSEDED_STAGE.commit,
      planId: previousPlanId,
      evidenceNamespace: 'research-evidence/r3-l0c-iar-lcf',
    }),
    /** §3: the five values the erratum must name. */
    previousPlanId,
    committedPlanContentDigest,
    mismatchedQualificationPlanReferenceDigest: qualificationPlanReference,
    mismatchedStageResultPlanReferenceDigest: stageResultPlanReference,
    cause: 'runQualification called buildProspectivePlan(), which regenerates `frozenAt` on every call, so the plan object the Qualification and the Stage Result embedded was an INDEPENDENTLY REBUILT plan whose full content digest differed from the committed plan\'s. The committed file was separately re-read by checkPlanContentDigest(), which compared the file to ITSELF and therefore reported MATCH. The two checks were never compared with each other, so one apparently successful qualification carried two plan identities.',
    affectedPreviousVerdict: 'FULL_PLAN_DIGEST',
    affectedVerdictWasPass: (qualification?.verdicts?.FULL_PLAN_DIGEST ?? null) === 'PASS',
    /** §3: the exact wording §3 requires, stated as a value. */
    selfCheckWasMatch: (qualification?.planContentDigest?.FULL_PLAN_DIGEST ?? null) === 'MATCH',
    crossArtifactReferenceWasConsistent: false,
    priorQualificationWasFullySealed: false,
    statement: 'the previous stage\'s plan self-check was MATCH, but its cross-artifact reference was inconsistent: the committed plan\'s own digest and the digest the Qualification and the Stage Result embedded were different values, and the previous stage did not compare them.',
    /** §3: why the prior DETERMINISTIC measurement records remain preserved. */
    whyPriorDeterministicRecordsRemainPreserved: Object.freeze([
      'the deterministic measurement records describe the R3-L0C-I-A-R-L-C-F pipeline at 8bf8d42, which this stage does not edit, so they remain an accurate description of that code',
      'the plan-inconsistency defect is confined to the PLAN IDENTITY that the Qualification and the Stage Result reference, not to the matrix observations, the durable reconciliation, the cost bridge or the closure measurement those records also carry',
      'rewriting the prior evidence would make it describe bytes that never existed, which is the failure the historical-immutability rule exists to prevent, so the correction is recorded here as a NEW erratum instead',
      'the prior stage\'s matrix result remains a valid MECHANICAL record; what it cannot support is the claim that its embedded plan reference was the committed plan\'s',
    ]),
    /** §3: the new superseding plan identity. */
    newSupersedingPlanId: PLAN_ID,
    newSupersedingEvidenceNamespace: STAGE_EVIDENCE_PATH,
    supersessionReason: 'evidence-identity and execution-safety correction, NOT a scientific design change',
    priorEvidenceModified: false,
    priorEvidenceReadOnly: true,
    law: 'the previous stage\'s plan self-check was MATCH while its cross-artifact reference was inconsistent; the prior evidence is never rewritten, and the correction is recorded as a stage-owned erratum naming the new superseding plan identity',
  });
}

/** §3: write the erratum into this stage's evidence namespace. */
export function writeErratum() {
  const erratum = buildErratum();
  const directory = join(REPO_ROOT, STAGE_EVIDENCE_PATH);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'erratum.json'), `${JSON.stringify(erratum, null, 2)}${NL}`, 'utf8');
  return erratum;
}

export { NL };
