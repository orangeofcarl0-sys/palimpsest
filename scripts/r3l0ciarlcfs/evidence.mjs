/**
 * R3-L0C-I-A-R-L-C-F-S §3/§14 — THE STAGE RESULT AND THE FINAL CROSS-ARTIFACT SEAL.
 *
 * §14 requires the final report to carry the measured verdicts, the evidence flow, the readiness statements and the
 * remaining blockers. This module writes the machine-readable form of that: it DERIVES the stage result from the
 * qualification record rather than restating it, so the two cannot disagree.
 *
 * §3 REQUIRES THE SEAL TO BE COMPUTED OVER THE PERSISTED FILES, not over in-memory objects. So `sealCommittedEvidence`
 * reads the committed plan, the WRITTEN qualification and the WRITTEN stage result back from disk, and reports each
 * of the five identity checks separately. That is what makes the seal a measurement of the evidence rather than a
 * claim about it.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { BASELINE_COMMIT, NL, REPO_ROOT, STAGE_EVIDENCE_PATH, STAGE_STOP } from './contract.mjs';

/** §14: build the stage result from the qualification record. */
export function buildStageResult(qualification) {
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C-F-S',
    kind: 'frozen evidence seal and safety closure stage result',
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
    /** §3: the committed-plan identity, carried whole so a reader sees every check rather than one MATCH. */
    planIdentity: Object.freeze({
      planId: qualification.plan.planId,
      planContentDigest: qualification.plan.planContentDigest,
      committedBlob: qualification.planVerification.committedBlob,
      worktreeBlob: qualification.planVerification.worktreeBlob,
      boundClosureDigest: qualification.planVerification.boundClosureDigest,
      currentClosureDigest: qualification.planVerification.currentClosureDigest,
      checks: qualification.planVerification.checks,
      verified: qualification.planVerification.verified,
      regenerated: qualification.planVerification.regenerated,
    }),
    evidenceSeal: Object.freeze({
      committedPlanId: qualification.plan.planId,
      committedFullPlanDigest: qualification.plan.planContentDigest,
      committedGitBlob: qualification.planVerification.committedBlob,
      executionClosureDigest: qualification.executionClosure.digest,
      qualificationPlanReference: qualification.plan.planContentDigest,
      stageResultPlanReference: qualification.plan.planContentDigest,
    }),
    evidenceSealPipeline: Object.freeze({
      pipeline: qualification.primaryMatrix.pipeline,
      guardPassed: qualification.primaryMatrix.guardPassed,
      terminalState: qualification.primaryMatrix.terminalState,
      matrixCompleted: qualification.primaryMatrix.matrixCompleted,
      completedSessions: qualification.primaryMatrix.completedSessions,
      maxLaunchesPerSession: qualification.primaryMatrix.maxLaunchesPerSession,
      measurementBasis: qualification.primaryMatrix.measurementBasis,
      terminalAdmissionGreen: qualification.primaryMatrix.terminalAdmissionGreen,
      terminalAdmissionConditions: qualification.primaryMatrix.terminalAdmissionConditions,
      durableReconciliationGreen: qualification.primaryMatrix.durableReconciliationGreen,
      durableFullIdentityGreen: qualification.primaryMatrix.durableFullIdentityGreen,
      primaryRefusedAt: qualification.primaryRefusal.refusedAt,
      primaryLaunched: qualification.primaryRefusal.launched,
      modelCallsMade: qualification.primaryMatrix.modelCallsMade,
    }),
    costBridge: Object.freeze({
      measuredCount: qualification.primaryMatrix.costMeasured,
      absentCount: qualification.primaryMatrix.costAbsent,
      provenance: qualification.primaryMatrix.costProvenance,
      interpretable: qualification.primaryMatrix.costInterpretable,
    }),
    causalReduction: Object.freeze({ CAUSAL_RESULT: qualification.primaryMatrix.causalResult, failingPrerequisites: qualification.primaryMatrix.causalFailing }),
    authority: qualification.authority,
    erratum: Object.freeze({
      erratumFor: qualification.erratum.erratumFor,
      previousPlanId: qualification.erratum.previousPlanId,
      committedPlanContentDigest: qualification.erratum.committedPlanContentDigest,
      mismatchedQualificationPlanReferenceDigest: qualification.erratum.mismatchedQualificationPlanReferenceDigest,
      affectedPreviousVerdict: qualification.erratum.affectedPreviousVerdict,
      selfCheckWasMatch: qualification.erratum.selfCheckWasMatch,
      crossArtifactReferenceWasConsistent: qualification.erratum.crossArtifactReferenceWasConsistent,
      priorQualificationWasFullySealed: qualification.erratum.priorQualificationWasFullySealed,
      newSupersedingPlanId: qualification.erratum.newSupersedingPlanId,
      priorEvidenceModified: qualification.erratum.priorEvidenceModified,
    }),
    legacyHelperQuarantine: qualification.legacyHelperQuarantine,
    faultInjection: qualification.faultInjection,
    executionClosure: qualification.executionClosure,
    planClosure: qualification.planClosure,
    immutability: Object.freeze({ verdict: qualification.immutability.verdict, protectedNamespaces: qualification.immutability.protectedNamespaces.length, restoreAvailable: qualification.immutability.restoreAvailable }),
    plan: qualification.plan,
    /** §3: the frozen plan reference, so the Stage Result carries the same shape the seal reads from the Qualification. */
    planContentDigest: qualification.planContentDigest,
    /** §13: the stop conditions, stated so the stage's own record carries them. */
    stageStop: Object.freeze({
      paidExecution: STAGE_STOP.paidExecution,
      primaryAuthorization: STAGE_STOP.primaryAuthorization,
      realPrimaryCausalResult: STAGE_STOP.realPrimaryCausalResult,
      ranPaidMatrix: false, beganR3L1: false, beganFusion: false,
      modelCallsMade: 0, enteredPrimaryExecution: false,
    }),
    /** §14: the answer to the final acceptance question, from the measured evidence. */
    finalAcceptanceQuestion: Object.freeze({
      question: 'Can a Qualification or Stage Result reference a different prospective plan from the committed plan, can an unverified Trial/Artifact masquerade as a measured endpoint, or can a failed cleanup proceed to a destructive operation outside the disposable environment?',
      answer: qualification.verdicts.CROSS_ARTIFACT_PLAN_BINDING === 'MATCH'
        && qualification.verdicts.DURABLE_TRIAL_EVIDENCE_IDENTITY === 'PASS'
        && qualification.verdicts.ARTIFACT_EVENT_ENVELOPE_VALIDITY === 'PASS'
        && qualification.verdicts.SAFE_WORKTREE_CLEANUP === 'PASS'
        && qualification.verdicts.LIVE_PRIMARY_PROVENANCE === 'NOT_ESTABLISHED' ? 'NO — measured, with live provenance and real artifact compatibility NOT_ESTABLISHED' : 'YES_OR_UNKNOWN',
      basis: 'the Qualification and the Stage Result now reference the COMMITTED plan read back from disk; the durable trial reconciliation compares every load-bearing identity field; an artifact must satisfy a real event envelope before the frozen reconstruction runs; and a failed link unlink preserves the worktree and returns CLEANUP_BLOCKED without reaching git worktree remove --force or a recursive delete',
    }),
  });
}

/** §14: write the stage result into this stage's evidence namespace. */
export function writeStageResult(qualification) {
  const result = buildStageResult(qualification);
  const directory = join(REPO_ROOT, STAGE_EVIDENCE_PATH);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'stage-result.json'), `${JSON.stringify(result, null, 2)}${NL}`, 'utf8');
  return result;
}

/** §3: read a JSON file under the repository root, or null. */
function readRepoJson(relative) {
  const path = join(REPO_ROOT, relative);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

/**
 * §3: THE FINAL SEAL, COMPUTED OVER THE PERSISTED FILES.
 *
 * It reads the committed plan, the WRITTEN qualification and the WRITTEN stage result back from disk and reports each
 * of §3's five identity checks separately. A self-consistent plan is insufficient if another persisted result
 * references a different plan — so this is the check that closes S1, and it is a measurement of the evidence on disk
 * rather than a claim about objects in memory.
 */
export async function sealCommittedEvidence(input = {}) {
  const { sealCrossArtifactPlanIdentity, readAndVerifyCommittedPlan } = await import('./committed-plan.mjs');
  const { computeExecutionClosure } = await import('./closure.mjs');

  const planVerification = await readAndVerifyCommittedPlan({ expectedPlanId: input.expectedPlanId, verifyCompiled: false });
  const plan = planVerification.plan;
  const qualification = readRepoJson(`${STAGE_EVIDENCE_PATH}/qualification.json`);
  const stageResult = readRepoJson(`${STAGE_EVIDENCE_PATH}/stage-result.json`);
  const closure = await computeExecutionClosure({ verifyCompiled: false });

  const seal = sealCrossArtifactPlanIdentity({ plan, qualification, stageResult, currentClosureDigest: closure.executionClosureDigest });
  return Object.freeze({
    ...seal,
    planVerification: Object.freeze({
      checks: planVerification.checks,
      verified: planVerification.verified,
      committedBlob: planVerification.committedBlob,
      worktreeBlob: planVerification.worktreeBlob,
      problems: planVerification.problems,
    }),
    qualificationReadFromDisk: qualification !== null,
    stageResultReadFromDisk: stageResult !== null,
    recomputedClosureDigest: closure.executionClosureDigest,
    /** §3: the five relevant identity checks, each shown rather than reduced to one MATCH. */
    identityChecks: Object.freeze({
      COMMITTED_PLAN_SELF_DIGEST: planVerification.checks.COMMITTED_PLAN_SELF_DIGEST,
      COMMITTED_PLAN_GIT_IDENTITY: planVerification.checks.COMMITTED_PLAN_GIT_IDENTITY,
      QUALIFICATION_PLAN_REFERENCE: seal.checks.QUALIFICATION_PLAN_REFERENCE,
      STAGE_RESULT_PLAN_REFERENCE: seal.checks.STAGE_RESULT_PLAN_REFERENCE,
      PLAN_CLOSURE_AGREEMENT: seal.checks.PLAN_CLOSURE_AGREEMENT,
    }),
    sealed: seal.sealed === true && planVerification.verified === true && qualification !== null && stageResult !== null,
  });
}

export { NL };
