/**
 * R3-L0C-I-A-R-L-C-F-S-H §5 H3 — ONE PERSISTED FINAL EVIDENCE SEAL.
 *
 * THE DEFECT THIS CLOSES, measured by `baseline/legacy-controls.mjs controlContradictoryPersistedSeal` against the
 * committed `80823c4` evidence: `qualification.mjs:260` computed a cross-artifact seal with `qualification: null`
 * and `stageResult: null` — because the files did not exist yet at that point — and recorded the resulting
 * `MISMATCH` and `sealed: false` inside the final Qualification. A SEPARATE source (`planControl.PASS`, sealing
 * in-memory objects built from the plan's own identity) produced `verdicts.CROSS_ARTIFACT_PLAN_BINDING = MATCH`, and
 * `readiness.CROSS_ARTIFACT_EVIDENCE_SEALED` was derived from those verdicts. The two were never compared, so one
 * committed artifact carried a MISMATCH and a MATCH for the same property.
 *
 * THE TWO PHASES §5 REQUIRES, kept apart so a pre-persistence status can never become a final verdict:
 *
 *   PHASE A   `preSealStatus()` — before persistence. The Qualification and the Stage Result are constructed from
 *             the same verified committed plan, and cross-artifact sealing has NOT been performed. The status is
 *             `PENDING_PERSISTED_EVIDENCE`, which is explicitly NOT a PASS and explicitly NOT a failed final seal.
 *             §5: "Do not record the not-yet-created Qualification and Stage Result as a failed final seal."
 *   PHASE B   `sealPersistedEvidence()` — after persistence. It reads the committed Plan, Qualification and Stage
 *             Result back FROM DISK, verifies their identities and actual bytes, recomputes the closure, and only
 *             then produces the final authoritative seal.
 *
 * THE FINAL SEAL CARRIES the fifteen fields §5 names, including the evaluation phase and the exact source files, so
 * a reader can see which bytes the verdict describes. The seal's own digest is EXCLUDED from the material it hashes
 * (`SEAL_SELF_FIELD`), so there is no circular dependency: the material is the evidence, and the digest names it.
 *
 * WHY THERE IS NO CIRCULARITY BETWEEN QUALIFICATION, STAGE RESULT, SEAL AND VERDICTS. The Qualification and the
 * Stage Result are written and COMMITTED first; they reference the PLAN, not the seal. The seal then reads those
 * committed bytes and records a verdict ABOUT them. The final verdict record references the seal. Nothing in that
 * order hashes anything that contains it, so each record's digest is stable.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  NL,
  PLAN_ID,
  REPO_ROOT,
  SEAL_PHASES,
  SEAL_REQUIRED_FIELDS,
  SEAL_SELF_FIELD,
  STAGE_EVIDENCE_PATH,
} from './contract.mjs';

/** §5: read a JSON file under the repository root, or null. */
function readRepoJson(relative) {
  const path = join(REPO_ROOT, relative);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

/** §5: the sha256 of a file's RAW bytes, or null when it is absent. */
function fileDigest(relative) {
  const path = join(REPO_ROOT, relative);
  if (!existsSync(path)) return null;
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** §5: the Git blob hash of a path at HEAD, or null when the path is not committed. */
function committedBlobHash(relative) {
  try { return execFileSync('git', ['rev-parse', `HEAD:${relative}`], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch { return null; }
}

/** §5: the Git blob hash of a worktree file's RAW bytes, or null. */
function worktreeBlobHash(relative) {
  try { return execFileSync('git', ['hash-object', '--', relative], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch { return null; }
}

/** §5: a digest over a canonical rendering of an object, so key order does not change the material. */
function digestOf(value) {
  const canonical = (entry) => {
    if (entry === null || entry === undefined) return 'null';
    if (Array.isArray(entry)) return `[${entry.map(canonical).join(',')}]`;
    if (typeof entry === 'object') return `{${Object.keys(entry).sort().map((key) => `${JSON.stringify(key)}:${canonical(entry[key])}`).join(',')}}`;
    return JSON.stringify(entry);
  };
  return createHash('sha256').update(canonical(value), 'utf8').digest('hex');
}

/**
 * §5 PHASE A — THE PRE-PERSISTENCE STATUS.
 *
 * §5 requires an explicit status such as `PENDING_PERSISTED_EVIDENCE` or `NOT_EVALUATED`, and requires that the
 * not-yet-created Qualification and Stage Result are NOT recorded as a failed final seal and that a final persisted
 * seal is NOT claimed to have already passed.
 */
export function preSealStatus(input = {}) {
  const { plan } = input;
  const committedDigest = plan?.planContentDigest ?? null;
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C-F-S-H',
    kind: 'pre-persistence cross-artifact seal status',
    evaluationPhase: SEAL_PHASES.PHASE_A.id,
    isFinalVerdict: false,
    planId: plan?.planId ?? null,
    committedPlanContentDigest: committedDigest,
    /** §5: the seal has NOT been performed, because the files it must read are not yet committed. */
    sealed: null,
    CROSS_ARTIFACT_PLAN_BINDING: 'NOT_EVALUATED',
    qualificationPlanReference: null,
    stageResultPlanReference: null,
    /** §5: the explicit statements §5 requires, so a reader cannot mistake this for a verdict. */
    isNotAFailedFinalSeal: true,
    isNotAPassedFinalSeal: true,
    reason: 'the Qualification and the Stage Result are constructed from the verified committed plan, but they are not yet written or committed, so no cross-artifact seal can be computed over them yet',
    onPromotion: 'a pre-persistence status must never be promoted to a final PASS; only sealPersistedEvidence() may produce the final authoritative verdict',
    law: 'cross-artifact sealing has not been performed at this phase; the not-yet-created Qualification and Stage Result are not a failed final seal',
  });
}

/**
 * §5 PHASE B — THE FINAL AUTHORITATIVE SEAL OVER THE PERSISTED, COMMITTED EVIDENCE.
 *
 * It reads the committed plan, the committed Qualification and the committed Stage Result, verifies their
 * identities and their actual bytes, recomputes the closure, and reports every equality as its own check.
 */
export async function sealPersistedEvidence(input = {}) {
  const { readAndVerifyCommittedPlan } = await import('./committed-plan.mjs');
  const { computeExecutionClosure } = await import('./closure.mjs');

  const planRelative = `${STAGE_EVIDENCE_PATH}/execution-plan.json`;
  const qualificationRelative = `${STAGE_EVIDENCE_PATH}/qualification.json`;
  const stageResultRelative = `${STAGE_EVIDENCE_PATH}/stage-result.json`;

  const planVerification = await readAndVerifyCommittedPlan({ expectedPlanId: input.expectedPlanId ?? PLAN_ID, verifyCompiled: false });
  const plan = planVerification.plan;
  const qualification = readRepoJson(qualificationRelative);
  const stageResult = readRepoJson(stageResultRelative);
  const closure = await computeExecutionClosure({ verifyCompiled: false });

  const committedDigest = plan?.planContentDigest ?? null;
  const committedPlanId = plan?.planId ?? null;
  const boundClosure = plan?.executionClosure?.executionClosureDigest ?? null;

  /** §5: the plan-reference equalities, each its own check rather than one collapsed MATCH. */
  const planReferenceEqualities = Object.freeze({
    COMMITTED_PLAN_SELF_DIGEST: planVerification.checks.COMMITTED_PLAN_SELF_DIGEST,
    QUALIFICATION_PLAN_REFERENCE: qualification?.plan?.planContentDigest === committedDigest && committedDigest !== null ? 'MATCH' : 'MISMATCH',
    QUALIFICATION_FROZEN_REFERENCE: qualification?.planContentDigest?.frozen === committedDigest && committedDigest !== null ? 'MATCH' : 'MISMATCH',
    STAGE_RESULT_PLAN_REFERENCE: stageResult?.plan?.planContentDigest === committedDigest && committedDigest !== null ? 'MATCH' : 'MISMATCH',
    STAGE_RESULT_FROZEN_REFERENCE: stageResult?.planContentDigest?.frozen === committedDigest && committedDigest !== null ? 'MATCH' : 'MISMATCH',
  });
  const planIdEqualities = Object.freeze({
    PLAN_ID_AGREEMENT: qualification?.plan?.planId === committedPlanId && stageResult?.plan?.planId === committedPlanId && committedPlanId !== null ? 'MATCH' : 'MISMATCH',
    PLAN_ID_IS_THE_STAGE_PLAN: committedPlanId === PLAN_ID ? 'MATCH' : 'MISMATCH',
  });
  const closureEqualities = Object.freeze({
    PLAN_CLOSURE_BINDING: planVerification.checks.PLAN_CLOSURE_BINDING,
    RECOMPUTED_CLOSURE_AGREES: boundClosure !== null && boundClosure === closure.executionClosureDigest ? 'MATCH' : 'DRIFTED',
    QUALIFICATION_CLOSURE_AGREES: qualification?.executionClosure?.digest === boundClosure && boundClosure !== null ? 'MATCH' : 'DRIFTED',
  });

  const allChecks = Object.freeze({ ...planReferenceEqualities, ...planIdEqualities, ...closureEqualities });
  const failing = Object.freeze(Object.entries(allChecks).filter(([, verdict]) => verdict !== 'MATCH').map(([id]) => id));

  /** §5: the committed-blob identities, so the seal names the exact bytes it read. */
  const blobs = Object.freeze({
    planCommittedGitBlob: committedBlobHash(planRelative),
    planWorktreeGitBlob: worktreeBlobHash(planRelative),
    qualificationCommittedGitBlob: committedBlobHash(qualificationRelative),
    stageResultCommittedGitBlob: committedBlobHash(stageResultRelative),
  });
  /** §5: a committed file that differs from the worktree file is a finding, not a detail. */
  const worktreeMatchesCommitted = Object.freeze({
    PLAN: blobs.planCommittedGitBlob !== null && blobs.planCommittedGitBlob === blobs.planWorktreeGitBlob,
    QUALIFICATION: blobs.qualificationCommittedGitBlob !== null && blobs.qualificationCommittedGitBlob === worktreeBlobHash(qualificationRelative),
    STAGE_RESULT: blobs.stageResultCommittedGitBlob !== null && blobs.stageResultCommittedGitBlob === worktreeBlobHash(stageResultRelative),
  });
  const uncommitted = Object.freeze(Object.entries(worktreeMatchesCommitted).filter(([, matches]) => matches !== true).map(([id]) => id));

  const result = failing.length === 0 && uncommitted.length === 0 && planVerification.verified === true && qualification !== null && stageResult !== null
    ? 'MATCH' : 'MISMATCH';

  /** §5: the seal's material EXCLUDES its own digest field, so there is no circular dependency. */
  const material = Object.freeze({
    planId: committedPlanId,
    planFullContentDigest: committedDigest,
    planCommittedGitBlob: blobs.planCommittedGitBlob,
    qualificationCommittedGitBlob: blobs.qualificationCommittedGitBlob,
    stageResultCommittedGitBlob: blobs.stageResultCommittedGitBlob,
    qualificationContentDigest: fileDigest(qualificationRelative),
    stageResultContentDigest: fileDigest(stageResultRelative),
    executionClosureDigest: boundClosure,
    recomputedClosureDigest: closure.executionClosureDigest,
    planReferenceEqualities,
    planIdEqualities,
    closureEqualities,
    evaluationPhase: SEAL_PHASES.PHASE_B.id,
    isFinalVerdict: true,
    sourceFiles: Object.freeze({ plan: planRelative, qualification: qualificationRelative, stageResult: stageResultRelative }),
    result,
  });

  const seal = Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C-F-S-H',
    kind: 'persisted cross-artifact evidence seal',
    ...material,
    sealDigest: digestOf(material),
    sealDigestExcludesItself: true,
    selfFieldExcluded: SEAL_SELF_FIELD,
    requiredFieldsPresent: SEAL_REQUIRED_FIELDS.every((field) => field in material),
    missingRequiredFields: Object.freeze(SEAL_REQUIRED_FIELDS.filter((field) => !(field in material))),
    checks: allChecks,
    failing,
    uncommittedEvidenceFiles: uncommitted,
    planVerification: Object.freeze({ checks: planVerification.checks, verified: planVerification.verified, problems: planVerification.problems }),
    qualificationReadFromDisk: qualification !== null,
    stageResultReadFromDisk: stageResult !== null,
    qualificationGitBlobMatchesWorktree: worktreeMatchesCommitted.QUALIFICATION,
    stageResultGitBlobMatchesWorktree: worktreeMatchesCommitted.STAGE_RESULT,
    /** §5: the seal is the ONLY source of the final binding verdict. */
    thisSealIsTheFinalVerdict: true,
    prePersistenceStatusIsNotAVerdict: true,
    /** §5: the seal does not hash the final verdict record, so the two are not circular. */
    circularDependencyWithVerdicts: false,
    law: 'the final evidence-seal verdict is derived from the persisted, committed Plan, Qualification and Stage Result read back from disk; a pre-persistence status cannot become an authoritative final verdict',
  });
  return seal;
}

/** §5: write the final seal into this stage's evidence namespace. */
export async function writePersistedSeal(input = {}) {
  const seal = await sealPersistedEvidence(input);
  const directory = join(REPO_ROOT, STAGE_EVIDENCE_PATH);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'evidence-seal.json'), `${JSON.stringify(seal, null, 2)}${NL}`, 'utf8');
  return seal;
}

/** §5: read the persisted seal back from disk, or null when it is missing. */
export function readPersistedSeal() {
  return readRepoJson(`${STAGE_EVIDENCE_PATH}/evidence-seal.json`);
}

export { NL };
