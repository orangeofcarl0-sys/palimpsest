/**
 * R3-L0C-I-A-R-L-C-F-S-H §9/§11 — THE SUPERSEDING PROSPECTIVE EXECUTION PLAN.
 *
 * §11 requires a NEW plan identity that explicitly supersedes `r3-l0c-iar-lcfs-primary-plan`, with the supersession
 * explaining that the reason is TERMINAL ENFORCEMENT AND EXECUTION SAFETY, "not a scientific design change".
 *
 * THE PLAN'S OWN IDENTITY reuses the prior stage's full-content-digest rule
 * (`../r3l0ciarlcf/plan-identity.mjs`), so the two stages cannot disagree about what "full" means.
 *
 * WHAT IT CHANGES. Only the measurement-evidence path and the cleanup safety, and only where this stage measured a
 * defect. The research question, the treatment, the experimental unit, the corpus, the invariants, the oracle, the
 * capital, the arm order, the seed, the exposures, the verdict thresholds and the primary endpoints are all FROZEN.
 *
 * THE FREEZE RULE. §11 requires the sequence: complete every load-bearing source change, stabilize the modules,
 * compute the final closure, construct the plan, freeze `frozenAt` ONCE, compute the digest, write and commit the
 * plan once, read it back, and qualify against THAT plan. `buildProspectivePlan` is the constructor and is marked
 * CANDIDATE-ONLY by `committed-plan.mjs`; `freezeCommittedPlan` is the one writer; the Qualification uses
 * `readAndVerifyCommittedPlan`. So a fresh `frozenAt` can never reach the final evidence.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';

import {
  BASELINE_COMMIT,
  BASELINE_DEFECTS,
  CLEANUP_SAFETY_STEPS,
  CLEANUP_THREAT_MODEL,
  COST_COMPLETENESS_LEVELS,
  LEGACY_HELPER_QUARANTINE,
  NL,
  OWNERSHIP_WITNESSES,
  PLAN_ID,
  PRESERVED_DESIGN,
  PROTECTED_NAMESPACES,
  QUALIFICATION_CONDITIONS,
  RUNNER_MUTATION_FIELDS,
  SEAL_PHASES,
  SEAL_REQUIRED_FIELDS,
  STAGE_STOP,
  SUPERSEDED_STAGE,
  VALIDATED_COST_CHAIN,
} from './contract.mjs';
/**
 * §8: the authorization conditions and authority concepts are the FROZEN prior stage's, so they are IMPORTED
 * rather than restated — there is exactly one definition of what a future paid authorization must satisfy.
 */
import { AUTHORITY_CONCEPTS, AUTHORIZATION_CONDITIONS } from '../r3l0ciarlcfs/contract.mjs';
import { computeExecutionClosure, REUSED_MODULES, STAGE_HARNESS_MODULES } from './closure.mjs';
import { PIPELINE_ORDER } from './pipeline.mjs';

const sha256 = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');

/** §11: the supersession, recorded as data. */
export const PLAN_SUPERSESSION = Object.freeze({
  id: 'R3_L0C_IAR_LCFSH_SUPERSEDES_R3_L0C_IAR_LCFS_PLAN',
  supersedes: Object.freeze({
    planId: SUPERSEDED_STAGE.planId,
    path: SUPERSEDED_STAGE.planPath,
    qualificationPath: SUPERSEDED_STAGE.qualificationPath,
    stageResultPath: SUPERSEDED_STAGE.stageResultPath,
    stage: SUPERSEDED_STAGE.stage,
    commit: SUPERSEDED_STAGE.commit,
    pipeline: SUPERSEDED_STAGE.pipeline,
    disposition: SUPERSEDED_STAGE.disposition,
  }),
  newPlan: Object.freeze({
    planId: PLAN_ID,
    pipeline: 'scripts/r3l0ciarlcfsh/pipeline.mjs',
    validatedCostBridge: 'scripts/r3l0ciarlcfsh/validated-cost-bridge.mjs',
    safeCleanup: 'scripts/r3l0ciarlcfsh/safe-cleanup.mjs',
    evidenceSeal: 'scripts/r3l0ciarlcfsh/evidence-seal.mjs',
    qualification: 'scripts/r3l0ciarlcfsh/qualification.mjs',
  }),
  reason: 'TERMINAL ENFORCEMENT AND EXECUTION SAFETY — not a scientific design change',
  reasonDetail: 'the prior stage added a correct artifact-envelope validator that its own authoritative cost-admission path never called, so an artifact whose only record was {"type":"noise"} was admitted as a measured zero; its cleanup could still reach a destructive operation after a caller-supplied ownership claim, a textual prefix root comparison, or an unenumerated nested link — and three of those cases were measured DELETING data outside the intended root; and a pre-persistence seal recording MISMATCH coexisted inside its committed Qualification with a MATCH verdict derived from a different source, beside an unconditional deterministic-qualification PASS. None of those is a scientific change.',
  amendedPriorPlan: false,
  priorPlanEdited: false,
  priorEvidenceAppendOnly: true,
  priorEvidenceRewritten: false,
  quarantine: LEGACY_HELPER_QUARANTINE,
});

/** §11: the measurement-path deviations, each traced to the defect it closes. */
export const MEASUREMENT_PATH_DEVIATIONS = Object.freeze(BASELINE_DEFECTS.map((defect) => Object.freeze({
  defectId: defect.id,
  requirement: defect.requirement,
  section: defect.section,
  gap: defect.gap,
  defectToClose: defect.defectToClose,
  closedIn: defect.authoritativePath,
})));

/** §9: the preserved design, each element with the evidence that it is the frozen one. */
export async function preservedDesign() {
  const plan = await import('../r3l0c/plan.mjs');
  const contract = await import('../r3l0c/contract.mjs');
  const capital = await import('../r3l0c/capital.mjs');
  const analyse = await import('../r3l0cr/analyse.mjs');
  const schedule = plan.schedule();
  return Object.freeze({
    researchQuestion: PRESERVED_DESIGN.researchQuestion,
    experimentalUnit: PRESERVED_DESIGN.experimentalUnit,
    treatment: PRESERVED_DESIGN.treatment,
    armOrder: plan.armOrderPerBlock(),
    randomizationSeed: contract.RANDOMIZATION_SEED,
    seedRechosen: false,
    exposures: capital.GENERATION_EXPOSURES,
    sessionCount: schedule.length,
    blockCount: contract.BLOCK_COUNT,
    generationsPerTrajectory: contract.GENERATIONS_PER_TRAJECTORY,
    compressionVerdictSource: 'scripts/r3l0c/analyse.mjs (re-exported by scripts/r3l0cr/analyse.mjs, unchanged)',
    netCostVerdictSource: 'scripts/r3l0c/analyse.mjs (re-exported by scripts/r3l0cr/analyse.mjs, unchanged)',
    verdictThresholdsChanged: false,
    primaryEndpointsChanged: false,
    corpusDigest: sha256((await import('../r3l0c/corpus.mjs')).corpusDigestMaterial()),
    capitalBundleDigest: capital.bundleDigest(),
    frozenVerdictSurface: analyse.FROZEN_VERDICT_SURFACE,
    schedule: Object.freeze(schedule.map((session) => Object.freeze({ ...session }))),
  });
}

/**
 * §11: BUILD THE PLAN, binding the freshly computed closure and the FULL plan content digest.
 *
 * §3: this is PLAN CONSTRUCTION. It may produce a candidate before freeze. It is NOT the authoritative final
 * evidence source, and `committed-plan.mjs constructCandidatePlan` marks it as such.
 */
export async function buildProspectivePlan(input = {}) {
  const closure = input.closure ?? await computeExecutionClosure({ verifyCompiled: input.verifyCompiled });
  const design = await preservedDesign();
  const { plannedRouteConfiguration } = await import('../r3l0ciar/preflight.mjs');
  const plannedRoute = await plannedRouteConfiguration();
  const plan = Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C-F-S-H',
    kind: 'terminal enforcement and safety hotfix prospective primary execution plan',
    planId: PLAN_ID,
    baseline: BASELINE_COMMIT,
    frozenBefore: 'the first primary model exposure',
    planSupersession: PLAN_SUPERSESSION,
    measurementPathDeviations: MEASUREMENT_PATH_DEVIATIONS,
    pipelineOrder: PIPELINE_ORDER,
    protectedNamespaces: PROTECTED_NAMESPACES,
    validatedCostChain: VALIDATED_COST_CHAIN,
    costCompletenessLevels: COST_COMPLETENESS_LEVELS,
    cleanupSafetySteps: CLEANUP_SAFETY_STEPS,
    ownershipWitnesses: OWNERSHIP_WITNESSES,
    cleanupThreatModel: CLEANUP_THREAT_MODEL,
    sealPhases: SEAL_PHASES,
    sealRequiredFields: SEAL_REQUIRED_FIELDS,
    runnerMutationFields: RUNNER_MUTATION_FIELDS,
    qualificationConditions: QUALIFICATION_CONDITIONS,
    authorizationDecisions: AUTHORIZATION_CONDITIONS,
    authorityConcepts: AUTHORITY_CONCEPTS,
    legacyHelperQuarantine: LEGACY_HELPER_QUARANTINE,
    reusedModules: REUSED_MODULES,
    stageHarnessModules: STAGE_HARNESS_MODULES,
    preservedDesign: design,
    schedule: design.schedule,
    executionClosure: Object.freeze({
      executionClosureDigest: closure.executionClosureDigest,
      partIds: closure.partIds,
      fileCount: closure.fileCount,
      toolchain: closure.toolchain,
      compiledVerification: closure.compiledVerification,
      runtimeManifest: closure.runtimeManifest,
      closureComplete: closure.CLOSURE_COMPLETE,
    }),
    executionRoute: Object.freeze({
      pipeline: 'scripts/r3l0ciarlcfsh/pipeline.mjs',
      runner: 'scripts/r3l0cf/fail-stop.mjs',
      adapter: 'scripts/r3l0ciar/primary-adapter.mjs',
      child: 'scripts/r3l0c/generation-child.mjs',
      workerReplacementForDeterministicRuns: 'scripts/r3l0ciar/scripted-worker.mjs',
      realWorkerForThePaidRun: 'the shipped DSH worker on the authorized executor route',
      authoritativePath: PLAN_ID,
      routeId: plannedRoute.routeId,
      providerId: plannedRoute.providerId,
      modelId: plannedRoute.modelId,
      settingsDigest: plannedRoute.settingsDigest,
      priorPipelinesQuarantined: true,
      priorPipelinesStillExecutable: true,
    }),
    authorizationRequired: Object.freeze({
      required: true,
      decisions: AUTHORIZATION_CONDITIONS,
      what: 'an explicit external authorization decision record identifying the approved plan by its FULL content digest, the paid-run budget and all five fail-stop decisions, verified against a separately controlled trusted source that supplies a verifiable issuer identity, independent control and revocation rules, with PROVEN host spending enforcement',
      thisStageProvidesIt: false,
      authorityStringAloneIsNotProof: true,
      hostSpendEnforcementRequired: true,
      verifiedAtLaunchBoundary: true,
      trustedSourceRequired: true,
      budgetEnforcementRequired: true,
    }),
    stageStop: Object.freeze({ ranPaidMatrix: false, beganR3L1: false, beganFusion: false, modelCallsMade: 0 }),
    frozenAt: new Date().toISOString(),
    orderingLaw: 'the plan is committed AFTER every integration fix and BEFORE any primary model exposure, and is then READ rather than regenerated',
  });
  const { fullPlanDigest } = await import('../r3l0ciarlcf/plan-identity.mjs');
  return Object.freeze({ ...plan, planContentDigest: fullPlanDigest(plan) });
}

/** §9: recompute the closure and compare it against the frozen plan's binding. */
export async function checkPlanClosure(input = {}) {
  const { existsSync, readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { REPO_ROOT, STAGE_EVIDENCE_PATH } = await import('./contract.mjs');
  const planPath = input.planPath ?? join(REPO_ROOT, STAGE_EVIDENCE_PATH, 'execution-plan.json');
  if (!existsSync(planPath)) return Object.freeze({ EXECUTION_CLOSURE: 'NO_FROZEN_PLAN', frozen: null, current: null });
  const frozen = JSON.parse(readFileSync(planPath, 'utf8'));
  const current = await computeExecutionClosure({ verifyCompiled: input.verifyCompiled });
  const matches = frozen.executionClosure?.executionClosureDigest === current.executionClosureDigest;
  return Object.freeze({
    EXECUTION_CLOSURE: matches ? 'MATCH' : 'DRIFTED',
    frozen: frozen.executionClosure?.executionClosureDigest ?? null,
    current: current.executionClosureDigest,
    onMismatch: 'STOP — a pre-exposure repair must create a NEW plan commit',
  });
}

export { NL, STAGE_STOP };
