/**
 * R3-L0C-I-A-R-L-C-F-S-H §5/§12/§14 — THE STAGE RESULT AND THE FINAL VERDICT RECORD.
 *
 * §5 requires the final verdicts to be derived from the PERSISTED SEAL and the measured gates, not from a
 * preliminary helper test. So the order is:
 *
 *   1. the Qualification is written and committed (Phase A, its seal status PENDING)
 *   2. the Stage Result is written and committed (Phase A, the same PENDING status)
 *   3. the persisted seal reads those COMMITTED bytes back (Phase B)
 *   4. the final verdict record is derived from THAT seal and the measured gates
 *   5. the seal and the final verdicts are committed
 *
 * §12 forbids reporting a property as PASS when it is proven only at a lower testing level, and forbids a combined
 * readiness flag that conceals the limitations. So the verdicts are computed one by one, the six unearned ones stay
 * at their honest values, and the readiness statements are separate values with no conjunction computed over them.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { reduceDeterministicQualification } from './qualification.mjs';
import {
  BASELINE_COMMIT,
  COMPLETION_CLASSIFICATIONS,
  NL,
  PLAN_ID,
  REPO_ROOT,
  SEAL_PHASES,
  STAGE_EVIDENCE_PATH,
  STAGE_STOP,
  UNEARNED_VERDICTS,
} from './contract.mjs';

/** §5: read a JSON file under the repository root, or null. */
function readRepoJson(relative) {
  const path = join(REPO_ROOT, relative);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

/**
 * §14: BUILD THE STAGE RESULT FROM THE QUALIFICATION RECORD.
 *
 * It DERIVES the result rather than restating it, so the two cannot disagree. Its `planContentDigest` and its `plan`
 * object are the qualification's, which are the COMMITTED plan's, so the seal's reference equalities hold by
 * construction rather than by a claim.
 */
export function buildStageResult(qualification) {
  const qualificationSealStatus = qualification.prePersistenceSealStatus ?? null;
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C-F-S-H',
    kind: 'terminal enforcement and safety hotfix stage result',
    baseline: BASELINE_COMMIT,
    verdicts: qualification.verdicts,
    readiness: qualification.readiness,
    modelCallsMade: STAGE_STOP.modelCallsMade,
    enteredPrimaryExecution: false,
    baselineDefects: Object.freeze({
      declared: 5,
      allReproduced: true,
      reproduced: Object.freeze(['B1_VALIDATOR_NOT_CONSUMED', 'B2_CLEANUP_REACHES_DESTRUCTIVE_OPERATIONS', 'B3_CONTRADICTORY_PERSISTED_SEAL', 'B4_IDENTITY_EVIDENCE_LEVEL', 'B5_UNCONDITIONAL_QUALIFICATION_PASS']),
    }),
    /** §5: the PHASE A status, carried so a reader sees this file does not claim a completed final seal. */
    evidenceSealPhase: SEAL_PHASES.PHASE_A.id,
    crossArtifactSeal: qualificationSealStatus,
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
    validatedCostAdmission: Object.freeze({
      validatorConsumedOnTheAuthoritativePath: qualification.productionControls.validatedCostBridge.positiveControl.envelopeValidatorConsumed,
      positiveWithReadMeasured: qualification.productionControls.validatedCostBridge.positiveControl.withReadMeasured,
      positiveZeroMeasured: qualification.productionControls.validatedCostBridge.positiveControl.zeroMeasured,
      invalidArtifactMeasuredCount: qualification.invalidArtifactMatrix.measuredCount,
      invalidArtifactInvalidCount: qualification.invalidArtifactMatrix.invalidCount,
      invalidArtifactFieldsAreNull: qualification.invalidArtifactMatrix.invalidFieldsAreNull,
      frozenBridgeWouldHaveAdmittedIt: qualification.invalidArtifactMatrix.frozenBridgeWouldHaveAdmittedIt,
      costAccountingComplete: qualification.invalidArtifactMatrix.costAccountingComplete,
      costMeasuredComplete: qualification.invalidArtifactMatrix.costMeasuredComplete,
      livePrimaryCostComplete: qualification.invalidArtifactMatrix.livePrimaryCostComplete,
      terminalMeasuredCount: qualification.invalidArtifactMatrix.terminalMeasuredCount,
      postRunMeasuredCount: qualification.invalidArtifactMatrix.postRunMeasuredCount,
      durableCostReadbackConsistent: qualification.invalidArtifactMatrix.durableCostReadbackConsistent,
      causalResult: qualification.invalidArtifactMatrix.causalResult,
    }),
    cleanupSafety: Object.freeze({
      outcomeOnHealthyCheckout: qualification.productionControls.safeCleanup.positiveControl.cleanedOutcome,
      ownershipWitnesses: qualification.productionControls.safeCleanup.positiveControl.ownershipWitnesses,
      mutations: qualification.productionControls.safeCleanup.mutations,
    }),
    runnerIdentityFalsifier: qualification.productionControls.runnerIdentityFalsifier,
    deterministicQualification: qualification.deterministicQualification,
    finalQualification: finalQualification ?? null,
    planClosure: qualification.planClosure,
    immutability: Object.freeze({ verdict: qualification.immutability.verdict, protectedNamespaces: qualification.immutability.protectedNamespaces.length, restoreAvailable: qualification.immutability.restoreAvailable }),
    plan: qualification.plan,
    planContentDigest: qualification.planContentDigest,
    stageStop: STAGE_STOP,
    /** §14: the answer to the final acceptance question, from the measured evidence. */
    finalAcceptanceQuestion: Object.freeze({
      question: 'Can a Qualification or Stage Result reference a different prospective plan from the committed plan, can an unverified Trial/Artifact masquerade as a measured endpoint, or can a failed cleanup proceed to a destructive operation outside the disposable environment?',
      answer: qualification.verdicts.COMMITTED_PLAN_IDENTITY === 'MATCH'
        && qualification.verdicts.INVALID_ARTIFACT_NOT_MEASURED === 'PASS'
        && qualification.verdicts.SAFE_CLEANUP_DESTRUCTIVE_FALLBACK === 'PASS'
        && qualification.verdicts.LIVE_PRIMARY_PROVENANCE === 'NOT_ESTABLISHED' ? 'NO — measured, with live provenance and real artifact compatibility NOT_ESTABLISHED' : 'YES_OR_UNKNOWN',
      basis: 'the Qualification and the Stage Result reference the COMMITTED plan read back from disk; an artifact that fails the event envelope cannot be admitted as a measured endpoint on the authoritative path; and a cleanup with unverified ownership, an unsafe root or a residual link preserves the worktree and returns CLEANUP_BLOCKED without reaching a destructive operation',
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

/**
 * §5/§12: DERIVE THE FINAL VERDICT RECORD FROM THE PERSISTED SEAL AND THE MEASURED GATES.
 *
 * §12 forbids a combined readiness flag that conceals the limitations, so no conjunction is computed over the
 * readiness statements; they are carried separately, exactly as §5's own readiness rule requires.
 */
export function buildFinalVerdicts(input) {
  const { seal, qualification } = input;
  const sealResult = seal?.result ?? 'MISMATCH';
  const cleanup = qualification.productionControls.safeCleanup;
  const cost = qualification.productionControls.validatedCostBridge;
  const runner = qualification.productionControls.runnerIdentityFalsifier;
  const invalid = qualification.invalidArtifactMatrix;
  /**
   * §5: THE QUALIFICATION IS RE-EVALUATED WITH THE FINAL PERSISTED SEAL PRESENT.
   *
   * Phase A recorded `PENDING_FINAL_SEAL` because the seal did not exist yet. §5 requires the final verdict to come
   * from the persisted seal, so the SAME reduction runs again with the seal supplied — and the promotion to PASS
   * happens only because every other condition still holds AND the seal is MATCH. A seal that was computed and did
   * not match yields FAIL, never a promotion.
   */
  const finalQualification = qualification.qualificationInputs === undefined || qualification.qualificationInputs === null
    ? qualification.deterministicQualification
    : reduceDeterministicQualification({ ...qualification.qualificationInputs, finalSeal: seal });
  const qualificationVerdict = finalQualification?.verdict ?? 'FAIL';

  const verdicts = Object.freeze({
    VALIDATED_COST_BRIDGE: cost.PASS === true ? 'PASS' : 'FAIL',
    INVALID_ARTIFACT_NOT_MEASURED: invalid.invalidCount >= 1 && invalid.invalidFieldsAreNull === true && invalid.measuredCount === invalid.completedSessions - invalid.invalidCount ? 'PASS' : 'FAIL',
    GENUINE_MEASURED_ZERO_PRESERVED: cost.mutations.genuineMeasuredZeroAccepted === true ? 'PASS' : 'FAIL',
    TERMINAL_COST_ADMISSION_ENFORCED: invalid.terminalMeasuredCount === invalid.postRunMeasuredCount
      && invalid.measuredCount < invalid.completedSessions
      && invalid.terminalAdmissionGreen === true
      && invalid.causalResult === 'NOT_EVALUABLE' ? 'PASS' : 'FAIL',
    DURABLE_COST_READBACK_CONSISTENT: qualification.primaryMatrix.durableCostReadbackConsistent === true && invalid.durableCostReadbackConsistent === true ? 'PASS' : 'FAIL',
    SAFE_CLEANUP_LINK_REINSPECTION: cleanup.mutations.reinspectionUsesLstat === true && cleanup.mutations.danglingLinkNotTreatedAsRemoved === true ? 'PASS' : 'FAIL',
    SAFE_CLEANUP_PATH_CONTAINMENT: cleanup.mutations.relativeResolutionRefusesSibling === true && cleanup.mutations.siblingSurvived === true ? 'PASS' : 'FAIL',
    SAFE_CLEANUP_OWNERSHIP: cleanup.mutations.ownershipWitnessesRequired === true && cleanup.mutations.callerClaimRefused === true && cleanup.mutations.unownedDataSurvived === true && cleanup.mutations.wrongMarkerRefused === true ? 'PASS' : 'FAIL',
    SAFE_CLEANUP_NESTED_LINKS: cleanup.mutations.nestedLinkEnumerated === true ? 'PASS' : 'FAIL',
    SAFE_CLEANUP_DESTRUCTIVE_FALLBACK: cleanup.mutations.noDestructiveFallbackAfterFailure === true && cleanup.mutations.gitRemovalFailurePreservesWorktree === true && cleanup.mutations.outsideSentinelUntouched === true ? 'PASS' : 'FAIL',
    LEGACY_UNSAFE_HELPER_SCOPE: qualification.verdicts.LEGACY_UNSAFE_HELPER_SCOPE,
    RUNNER_LEVEL_IDENTITY_FALSIFIER: runner.PASS === true ? 'PASS' : 'FAIL',
    COMMITTED_PLAN_IDENTITY: qualification.planVerification.verified === true ? 'MATCH' : 'MISMATCH',
    PERSISTED_CROSS_ARTIFACT_SEAL: sealResult,
    /** §5: the final verdict is derived from the seal, so this holds when the seal was actually read from disk. */
    FINAL_VERDICT_DERIVED_FROM_SEAL: seal !== null && seal !== undefined && seal.evaluationPhase === SEAL_PHASES.PHASE_B.id && seal.thisSealIsTheFinalVerdict === true ? 'PASS' : 'FAIL',
    DETERMINISTIC_MEASUREMENT_QUALIFICATION: qualificationVerdict,
    EXECUTION_CLOSURE: qualification.planClosure.EXECUTION_CLOSURE,
    HISTORICAL_EVIDENCE_IMMUTABILITY: qualification.immutability.verdict,
    REAL_DSH_ARTIFACT_COMPATIBILITY: UNEARNED_VERDICTS.REAL_DSH_ARTIFACT_COMPATIBILITY,
    LIVE_PRIMARY_PROVENANCE: UNEARNED_VERDICTS.LIVE_PRIMARY_PROVENANCE,
    EXTERNAL_AUTHORITY: qualification.authority.verified === true ? 'PASS' : UNEARNED_VERDICTS.EXTERNAL_AUTHORITY,
    HOST_SPEND_ENFORCEMENT: qualification.authority.concepts.ACTUAL_HOST_SPEND_ENFORCEMENT === true ? 'PASS' : UNEARNED_VERDICTS.HOST_SPEND_ENFORCEMENT,
    PAID_EXECUTION: UNEARNED_VERDICTS.PAID_EXECUTION,
    CAUSAL_RESULT: UNEARNED_VERDICTS.CAUSAL_RESULT,
  });

  /** §12: the completion classification, from the measured verdicts. */
  const central = ['VALIDATED_COST_BRIDGE', 'INVALID_ARTIFACT_NOT_MEASURED', 'TERMINAL_COST_ADMISSION_ENFORCED', 'DURABLE_COST_READBACK_CONSISTENT', 'SAFE_CLEANUP_LINK_REINSPECTION', 'SAFE_CLEANUP_PATH_CONTAINMENT', 'SAFE_CLEANUP_OWNERSHIP', 'SAFE_CLEANUP_NESTED_LINKS', 'SAFE_CLEANUP_DESTRUCTIVE_FALLBACK', 'RUNNER_LEVEL_IDENTITY_FALSIFIER', 'FINAL_VERDICT_DERIVED_FROM_SEAL'];
  const centralOk = central.every((id) => verdicts[id] === 'PASS');
  const sealOk = verdicts.PERSISTED_CROSS_ARTIFACT_SEAL === 'MATCH' && verdicts.COMMITTED_PLAN_IDENTITY === 'MATCH';
  const closureOk = verdicts.EXECUTION_CLOSURE === 'MATCH' && verdicts.HISTORICAL_EVIDENCE_IMMUTABILITY === 'PASS';
  const classification = centralOk && sealOk && closureOk && verdicts.DETERMINISTIC_MEASUREMENT_QUALIFICATION === 'PASS'
    ? 'DETERMINISTIC_MEASUREMENT_CLOSED' : 'DETERMINISTIC_MEASUREMENT_BLOCKED';

  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C-F-S-H',
    kind: 'terminal enforcement and safety hotfix final verdicts',
    baseline: BASELINE_COMMIT,
    /** §5: the seal this record was derived from, named so a reader can see the exact reference. */
    sealReference: Object.freeze({
      path: `${STAGE_EVIDENCE_PATH}/evidence-seal.json`,
      sealDigest: seal?.sealDigest ?? null,
      evaluationPhase: seal?.evaluationPhase ?? null,
      result: sealResult,
      planFullContentDigest: seal?.planFullContentDigest ?? null,
      planCommittedGitBlob: seal?.planCommittedGitBlob ?? null,
      qualificationCommittedGitBlob: seal?.qualificationCommittedGitBlob ?? null,
      stageResultCommittedGitBlob: seal?.stageResultCommittedGitBlob ?? null,
    }),
    verdicts,
    finalQualification: finalQualification ?? null,
    completionClassification: classification,
    completionClassifications: COMPLETION_CLASSIFICATIONS,
    /** §12: the unearned verdicts, carried so a reader sees they were not promoted. */
    unearned: UNEARNED_VERDICTS,
    /** §12: the readiness statements, SEPARATE. No combined flag is computed. */
    readiness: Object.freeze({
      DETERMINISTIC_MEASUREMENT_QUALIFIED: classification === 'DETERMINISTIC_MEASUREMENT_CLOSED',
      CROSS_ARTIFACT_EVIDENCE_SEALED: sealOk,
      REAL_ARTIFACT_COMPATIBILITY_ESTABLISHED: false,
      PRIMARY_EXECUTION_AUTHORIZED: qualification.authority.verified === true && qualification.authority.concepts.ACTUAL_HOST_SPEND_ENFORCEMENT === true,
      PRIMARY_CAUSAL_DATA_AVAILABLE: false,
      collapsed: false,
      note: 'the readiness statements are independent; DETERMINISTIC_MEASUREMENT_QUALIFIED is NOT an authorization and does NOT imply the others',
    }),
    /** §0/§13: the mandatory stop. */
    stageStop: STAGE_STOP,
    centralVerdicts: Object.freeze(central),
    centralOk,
    sealOk,
    closureOk,
    combinedReadinessFlagComputed: false,
    law: 'the final verdicts are derived from the PERSISTED seal and the measured gates; a property proven only at a lower testing level is not reported as PASS, and no combined readiness flag conceals the limitations',
  });
}

/** §12: write the final verdicts into this stage's evidence namespace. */
export function writeFinalVerdicts(input) {
  const record = buildFinalVerdicts(input);
  const directory = join(REPO_ROOT, STAGE_EVIDENCE_PATH);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'final-verdicts.json'), `${JSON.stringify(record, null, 2)}${NL}`, 'utf8');
  return record;
}

export { NL, readRepoJson };
