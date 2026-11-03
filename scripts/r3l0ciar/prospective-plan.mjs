/**
 * R3-L0C-I-A-R §9 — THE SUPERSEDING PROSPECTIVE EXECUTION PLAN.
 *
 * §9 requires the new plan to be committed AFTER every integration change and BEFORE any paid model exposure, and
 * it requires one thing of the relationship to the prior plan: it must explicitly SUPERSEDE the R3-L0C-I-A plan,
 * and it must NOT modify it.
 *
 * SUPERSEDE RATHER THAN AMEND, AND THE REASON IS THE DISCIPLINE OF THIS PROJECT. R3-L0C-I-A's plan is bound into
 * that stage's evidence and its closure digest covers the code its plan named. Amending it would make that stage's
 * record describe a plan that no longer exists — the same error as editing a frozen module, and the same reason
 * R3-L0C-I-A quarantined R3-L0C-R's matrix instead of deleting it. So this plan is a NEW artifact in this stage's
 * own namespace, it names what it supersedes, and the superseded plan stays byte-identical.
 *
 * WHAT IT CHANGES. Only the EXECUTION PATH, and only where this stage measured a defect (G1-G8). The research
 * question, the treatment, the experimental unit, the corpus, the invariants, the oracle, the capital, the arm
 * order, the seed, the exposures, the verdict thresholds and the primary endpoints are all the FROZEN ones.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  AUTHORIZATION_REQUIREMENTS,
  BASELINE_COMMIT,
  CORRECTION_DEFECTS,
  GENERATION_CHILD_BUDGET_MS,
  INTERPRETATION_CLASSES,
  NL,
  POST_MATRIX_CONDITIONS,
  PRE_TRIAL_REQUIREMENTS,
  REPO_ROOT,
  SETTLEMENT_INTERVAL_MS,
  STAGE_EVIDENCE_PATH,
  SUPERSEDED_STAGE,
  WORKER_EXECUTION_BUDGET_MS,
} from './contract.mjs';
import { computeExecutionClosure } from './closure.mjs';

const sha256 = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');

/** §9: this stage's plan identity, so the quarantine guard and the plan agree on the name. */
export const PLAN_ID = 'r3-l0c-iar-primary-plan';

/**
 * §9: THE SUPERSESSION, RECORDED AS DATA.
 */
export const PLAN_SUPERSESSION = Object.freeze({
  id: 'R3_L0C_IAR_SUPERSEDES_R3_L0C_IA_PLAN',
  supersedes: Object.freeze({
    planId: SUPERSEDED_STAGE.planId,
    path: SUPERSEDED_STAGE.planPath,
    stage: SUPERSEDED_STAGE.stage,
    commit: SUPERSEDED_STAGE.commit,
    pipeline: 'scripts/r3l0cia/primary-driver.mjs + scripts/r3l0cia/activation.mjs (two entry points)',
    disposition: SUPERSEDED_STAGE.disposition,
  }),
  newPlan: Object.freeze({
    planId: PLAN_ID,
    pipeline: 'scripts/r3l0ciar/pipeline.mjs',
    activation: 'scripts/r3l0ciar/activation.mjs',
    modes: 'scripts/r3l0ciar/modes.mjs',
    adapter: 'scripts/r3l0ciar/primary-adapter.mjs',
    treatment: 'scripts/r3l0ciar/treatment.mjs',
    admission: 'scripts/r3l0ciar/admission.mjs',
    validity: 'scripts/r3l0ciar/validity.mjs',
    instrumentation: 'scripts/r3l0ciar/instrumentation.mjs',
    confinement: 'scripts/r3l0ciar/confinement.mjs',
    closure: 'scripts/r3l0ciar/closure.mjs',
  }),
  amendedPriorPlan: false,
  priorPlanEdited: false,
  priorEvidenceAppendOnly: true,
  /** §2: the honest statement about the quarantine. */
  quarantine: Object.freeze({
    priorMatricesRemainPhysicallyExecutable: true,
    quarantineIsAGuardNotAnImpossibility: true,
    forbiddenClaim: 'do not claim the prior matrices have become physically unexecutable merely because the new pipeline checks a string',
  }),
});

/** §9: the execution-path deviations, each traced to the defect it closes. */
export const EXECUTION_PATH_DEVIATIONS = Object.freeze(CORRECTION_DEFECTS.map((defect) => Object.freeze({
  defectId: defect.id,
  section: defect.section,
  gap: defect.gap,
  property: defect.property,
  closedIn: defect.id.startsWith('G1') || defect.id.startsWith('G2') && defect.section === '§3' ? 'scripts/r3l0ciar/pipeline.mjs'
    : defect.id.startsWith('G2') || defect.id.startsWith('G3') ? 'scripts/r3l0ciar/validity.mjs'
      : defect.id.startsWith('G4') ? 'scripts/r3l0ciar/admission.mjs'
        : defect.id.startsWith('G5') ? 'scripts/r3l0ciar/treatment.mjs'
          : defect.id.startsWith('G6') ? 'scripts/r3l0ciar/instrumentation.mjs'
            : defect.id.startsWith('G7') ? 'scripts/r3l0ciar/validity.mjs'
              : 'scripts/r3l0ciar/primary-adapter.mjs',
})));

/** §9: the preserved design, each element with the evidence that it is the frozen one. */
export async function preservedDesign() {
  const plan = await import('../r3l0c/plan.mjs');
  const contract = await import('../r3l0c/contract.mjs');
  const capital = await import('../r3l0c/capital.mjs');
  const analyse = await import('../r3l0cr/analyse.mjs');
  const schedule = plan.schedule();
  return Object.freeze({
    researchQuestion: 'when the correct project-specific operating knowledge is recoverable from a substantial raw Project history, does governed current-standing cognitive capital reduce the cost and unreliability of reconstructing that knowledge?',
    experimentalUnit: 'ProjectTrajectory',
    treatment: 'SELECTION_ONLY — the only difference between the arms is whether the frozen handles are selected',
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

/** §9: BUILD THE PLAN. The closure digest is bound in, so a post-freeze code change is detectable as a drift. */
export async function buildProspectivePlan(input = {}) {
  const closure = input.closure ?? await computeExecutionClosure({ verifyCompiled: input.verifyCompiled });
  const design = await preservedDesign();
  const { plannedRouteConfiguration } = await import('./preflight.mjs');
  const plannedRoute = await plannedRouteConfiguration();
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R',
    kind: 'final activation wiring prospective primary execution plan',
    planId: PLAN_ID,
    baseline: BASELINE_COMMIT,
    frozenBefore: 'the first primary model exposure',
    planSupersession: PLAN_SUPERSESSION,
    executionPathDeviations: EXECUTION_PATH_DEVIATIONS,
    /** §2: the pipeline's own order, so the plan names the steps the entry performs. */
    pipelineOrder: Object.freeze([
      'committed plan', 'executable closure', 'exclusive run claim', 'PRESERVE', 'world preparation',
      'pretrial validity', 'exposure intent', 'single child launch', 'trial admission',
      'per-generation journal', 'post-matrix validity', 'frozen analysis',
    ]),
    budgets: Object.freeze({
      outerChildMs: GENERATION_CHILD_BUDGET_MS,
      innerWorkerMs: WORKER_EXECUTION_BUDGET_MS,
      settlementMs: SETTLEMENT_INTERVAL_MS,
      outerExceedsInnerPlusSettlement: GENERATION_CHILD_BUDGET_MS > WORKER_EXECUTION_BUDGET_MS + SETTLEMENT_INTERVAL_MS,
    }),
    preTrialConditions: PRE_TRIAL_REQUIREMENTS,
    postMatrixConditions: POST_MATRIX_CONDITIONS.map((entry) => entry.id),
    /** §1: the published-interpretation classes this stage reports separately. */
    interpretationClasses: INTERPRETATION_CLASSES,
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
      pipeline: 'scripts/r3l0ciar/pipeline.mjs',
      runner: 'scripts/r3l0cf/fail-stop.mjs',
      adapter: 'scripts/r3l0ciar/primary-adapter.mjs',
      child: 'scripts/r3l0c/generation-child.mjs',
      workerReplacementForDeterministicRuns: 'scripts/r3l0ciar/scripted-worker.mjs',
      realWorkerForThePaidRun: 'the shipped DSH worker on the authorized executor route',
      authoritativePath: PLAN_ID,
      /** §3: the ACTUAL effective route identities the plan binds, so a drift is detectable rather than assumed. */
      routeId: plannedRoute.routeId,
      providerId: plannedRoute.providerId,
      modelId: plannedRoute.modelId,
      settingsDigest: plannedRoute.settingsDigest,
      priorMatricesQuarantined: true,
      priorMatricesStillExecutable: true,
    }),
    /** §8: what the paid run requires before it may start. */
    authorizationRequired: Object.freeze({
      required: true,
      decisions: AUTHORIZATION_REQUIREMENTS,
      what: 'an explicit external authorization decision for all five listed decisions',
      thisStageProvidesIt: false,
      booleanIsAConfigurationSignalNotADecision: true,
      callerSuppliedStringIsNotProof: true,
    }),
    stageStop: Object.freeze({ ranPaidMatrix: false, beganR3L1: false, beganFusion: false, modelCallsMade: 0 }),
    frozenAt: new Date().toISOString(),
    orderingLaw: 'the plan is committed AFTER every integration fix and BEFORE any primary model exposure',
  });
}

/** §9: write the plan into this stage's evidence namespace. */
export async function writeProspectivePlan(input = {}) {
  const plan = await buildProspectivePlan(input);
  const directory = join(REPO_ROOT, STAGE_EVIDENCE_PATH);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'execution-plan.json'), `${JSON.stringify(plan, null, 2)}${NL}`, 'utf8');
  return plan;
}

/** §9: recompute the closure and compare it against the frozen plan's binding. */
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

async function main() {
  const plan = await writeProspectivePlan({ verifyCompiled: false });
  process.stdout.write(`R3-L0C-I-A-R PLAN — ${String(plan.preservedDesign.sessionCount)} sessions${NL}`);
  process.stdout.write(`  plan id: ${plan.planId}${NL}`);
  process.stdout.write(`  supersedes: ${plan.planSupersession.supersedes.planId}${NL}`);
  process.stdout.write(`  execution closure: ${plan.executionClosure.executionClosureDigest.slice(0, 16)} over ${String(plan.executionClosure.fileCount)} files${NL}`);
  process.stdout.write(`  closure complete: ${String(plan.executionClosure.closureComplete)}${NL}`);
  return plan;
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}

export { NL };
