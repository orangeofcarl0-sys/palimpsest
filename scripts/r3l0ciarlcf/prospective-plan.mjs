/**
 * R3-L0C-I-A-R-L-C-F §11 — THE SUPERSEDING PROSPECTIVE EXECUTION PLAN.
 *
 * §11 requires the plan to supersede the R3-L0C-I-A-R-L-C plan without amending it, and to be committed after the
 * implementation and before any paid exposure. The prior plan's file stays byte-identical and still names itself.
 *
 * WHAT IT CHANGES. Only the measurement-evidence path, and only where this stage measured a defect. The research
 * question, the treatment, the experimental unit, the corpus, the invariants, the oracle, the capital, the arm
 * order, the seed, the exposures, the verdict thresholds and the primary endpoints are all the FROZEN ones.
 *
 * THE PLAN IDENTITY IS THE FULL-PLAN DIGEST. §6 requires the plan to bind by a digest over its complete canonical
 * content, excluding only the digest's own field, and to remain distinct from the ExecutionClosureDigest.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  AUTHORIZATION_RECORD_FIELDS,
  AUTHORIZATION_REQUIREMENTS,
  BASELINE_COMMIT,
  DURABLE_RECONCILIATION_CONDITIONS,
  BUDGET_CONCEPTS,
  COST_COMPLETENESS_LEVELS,
  CAUSAL_PREREQUISITES,
  MEASUREMENT_GAPS,
  NL,
  PRESERVED_DESIGN,
  REPO_ROOT,
  STAGE_EVIDENCE_PATH,
  SUPERSEDED_STAGE,
} from './contract.mjs';
import { computeExecutionClosure, REUSED_MODULES, STAGE_HARNESS_MODULES } from './closure.mjs';
import { fullPlanDigest } from './plan-identity.mjs';
import { PRIMARY_DERIVED_INPUTS, PRIMARY_REFUSED_INPUTS } from './trust-boundary.mjs';
import { REQUIRED_TERMINAL_CONDITIONS } from './postmatrix-admission.mjs';

const sha256 = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');

/** §11: this stage's plan identity, so the guard and the plan agree on the name. */
export const PLAN_ID = 'r3-l0c-iar-lcf-primary-plan';

/** §11: the supersession, recorded as data. */
export const PLAN_SUPERSESSION = Object.freeze({
  id: 'R3_L0C_IAR_LCF_SUPERSEDES_R3_L0C_IAR_LC_PLAN',
  supersedes: Object.freeze({
    planId: SUPERSEDED_STAGE.planId,
    path: SUPERSEDED_STAGE.planPath,
    stage: SUPERSEDED_STAGE.stage,
    commit: SUPERSEDED_STAGE.commit,
    pipeline: SUPERSEDED_STAGE.pipeline,
    disposition: SUPERSEDED_STAGE.disposition,
  }),
  newPlan: Object.freeze({
    planId: PLAN_ID,
    pipeline: 'scripts/r3l0ciarlcf/pipeline.mjs',
    modes: 'scripts/r3l0ciarlcf/modes.mjs',
    freshness: 'scripts/r3l0ciarlcf/freshness.mjs',
    artifactIdentity: 'scripts/r3l0ciarlcf/artifact-identity.mjs',
    costBridge: 'scripts/r3l0ciarlcf/cost-bridge.mjs',
    durableReconciliation: 'scripts/r3l0ciarlcf/durable-reconciliation.mjs',
    terminalAdmission: 'scripts/r3l0ciarlcf/postmatrix-admission.mjs',
    planIdentity: 'scripts/r3l0ciarlcf/plan-identity.mjs',
    trustBoundary: 'scripts/r3l0ciarlcf/trust-boundary.mjs',
    attestation: 'scripts/r3l0ciarlcf/attestation.mjs',
    compilerCache: 'scripts/r3l0ciarlcf/compiler-cache.mjs',
    closure: 'scripts/r3l0ciarlcf/closure.mjs',
  }),
  amendedPriorPlan: false,
  priorPlanEdited: false,
  priorEvidenceAppendOnly: true,
  quarantine: Object.freeze({
    priorPipelinesRemainPhysicallyExecutable: true,
    quarantineIsAGuardNotAnImpossibility: true,
    forbiddenClaim: 'do not claim the prior pipelines have become physically unexecutable merely because the new pipeline checks a string',
  }),
});

/** §11: the measurement-path deviations, each traced to the gap it closes. */
export const MEASUREMENT_PATH_DEVIATIONS = Object.freeze(MEASUREMENT_GAPS.map((gap) => Object.freeze({
  gapId: gap.id,
  section: gap.section,
  gap: gap.gap,
  property: gap.property,
  closedIn: gap.authoritativePath,
})));

/** §8: the preserved design, each element with the evidence that it is the frozen one. */
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

/** §11: build the plan, binding the freshly computed closure and the FULL plan content digest. */
export async function buildProspectivePlan(input = {}) {
  const closure = input.closure ?? await computeExecutionClosure({ verifyCompiled: input.verifyCompiled });
  const design = await preservedDesign();
  const { plannedRouteConfiguration } = await import('../r3l0ciar/preflight.mjs');
  const plannedRoute = await plannedRouteConfiguration();
  const plan = Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C-F',
    kind: 'measurement fidelity and pre-authorization closure prospective primary execution plan',
    planId: PLAN_ID,
    baseline: BASELINE_COMMIT,
    frozenBefore: 'the first primary model exposure',
    planSupersession: PLAN_SUPERSESSION,
    measurementPathDeviations: MEASUREMENT_PATH_DEVIATIONS,
    pipelineOrder: Object.freeze([
      'primary input binding', 'committed plan', 'executable closure', 'exclusive run claim', 'PRESERVE',
      'world preparation', 'S0 before install', 'bundle install', 'S1 after install', 'trusted host configuration',
      'authority verification', 'pretrial validity', 'exposure intent', 'single child launch', 'trial admission',
      'live-evidence sidecar', 'per-generation journal',
      'terminal admission reducer (journal read, durable reconciliation, ADMISSION-TIME RECOMPUTATION of the closure ' +
      'and the effective route, S2 sample, input-bound in-run attestation, frozen post-matrix validity)',
      'durable cost bridge (exact attempt identity, scoped artifact discovery, corroborated execution witness)',
      'causal evaluability reduction (all prerequisites, not allSixteenLivePrimary alone)', 'frozen analysis',
    ]),
    primaryDerivedInputs: PRIMARY_DERIVED_INPUTS,
    primaryRefusedInputs: PRIMARY_REFUSED_INPUTS,
    authorizationRecordFields: AUTHORIZATION_RECORD_FIELDS,
    authorizationDecisions: AUTHORIZATION_REQUIREMENTS,
    terminalAdmissionConditions: REQUIRED_TERMINAL_CONDITIONS,
    durableReconciliationConditions: DURABLE_RECONCILIATION_CONDITIONS,
    costCompletenessLevels: COST_COMPLETENESS_LEVELS,
    causalPrerequisites: CAUSAL_PREREQUISITES,
    budgetConcepts: BUDGET_CONCEPTS,
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
      pipeline: 'scripts/r3l0ciarlcf/pipeline.mjs',
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
      decisions: AUTHORIZATION_REQUIREMENTS,
      recordFields: AUTHORIZATION_RECORD_FIELDS,
      what: 'an explicit external authorization decision record identifying the approved plan by its FULL content digest, the paid-run budget and all five fail-stop decisions, verified against a separately controlled trusted source that supplies a verifiable issuer identity, independent control and revocation rules',
      thisStageProvidesIt: false,
      authorityStringAloneIsNotProof: true,
      verifiedAtLaunchBoundary: true,
      trustedSourceRequired: true,
      budgetEnforcementRequired: true,
    }),
    stageStop: Object.freeze({ ranPaidMatrix: false, beganR3L1: false, beganFusion: false, modelCallsMade: 0 }),
    frozenAt: new Date().toISOString(),
    orderingLaw: 'the plan is committed AFTER every integration fix and BEFORE any primary model exposure',
  });
  /**
   * §6: THE PLAN'S OWN FULL CONTENT DIGEST, SEPARATE FROM THE EXECUTION CLOSURE.
   *
   * It is computed FROM the plan and written onto the plan. It is NOT self-referential: the digest excludes its own
   * field and nothing hashes the plan-with-its-digest.
   */
  return Object.freeze({ ...plan, planContentDigest: fullPlanDigest(plan) });
}

/** §11: write the plan into this stage's evidence namespace. */
export async function writeProspectivePlan(input = {}) {
  const plan = await buildProspectivePlan(input);
  const directory = join(REPO_ROOT, STAGE_EVIDENCE_PATH);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'execution-plan.json'), `${JSON.stringify(plan, null, 2)}${NL}`, 'utf8');
  return plan;
}

/** §11: recompute the closure and compare it against the frozen plan's binding. */
export async function checkPlanClosure(input = {}) {
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

/** §6: recompute the FULL plan content digest and compare it against the frozen plan's own binding. */
export function checkPlanContentDigest(input = {}) {
  const planPath = input.planPath ?? join(REPO_ROOT, STAGE_EVIDENCE_PATH, 'execution-plan.json');
  if (!existsSync(planPath)) return Object.freeze({ FULL_PLAN_DIGEST: 'NO_FROZEN_PLAN', frozen: null, current: null });
  const frozen = JSON.parse(readFileSync(planPath, 'utf8'));
  const current = fullPlanDigest(frozen);
  return Object.freeze({
    FULL_PLAN_DIGEST: current === frozen.planContentDigest ? 'MATCH' : 'DRIFTED',
    frozen: frozen.planContentDigest ?? null,
    current,
  });
}

async function main() {
  const plan = await writeProspectivePlan({ verifyCompiled: false });
  process.stdout.write(`R3-L0C-I-A-R-L-C-F PLAN — ${String(plan.preservedDesign.sessionCount)} sessions${NL}`);
  process.stdout.write(`  plan id: ${plan.planId}${NL}`);
  process.stdout.write(`  supersedes: ${plan.planSupersession.supersedes.planId}${NL}`);
  process.stdout.write(`  execution closure: ${plan.executionClosure.executionClosureDigest.slice(0, 16)} over ${String(plan.executionClosure.fileCount)} files${NL}`);
  process.stdout.write(`  full plan content digest: ${String(plan.planContentDigest).slice(0, 16)}${NL}`);
  return plan;
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}

export { NL };
