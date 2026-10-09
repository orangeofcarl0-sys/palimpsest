/**
 * R3-L0C-I-A-R-L §Final — THE SUPERSEDING PROSPECTIVE EXECUTION PLAN.
 *
 * §Final requires the plan to supersede the R3-L0C-I-A-R plan without amending it, and to be committed after the
 * implementation and before any paid exposure. The prior plan's file stays byte-identical and still names itself.
 *
 * WHAT IT CHANGES. Only the execution path, and only where this stage measured a defect (L1-L4). The research
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
  AUTHORIZATION_RECORD_FIELDS,
  BASELINE_COMMIT,
  CORRECTION_GATES,
  LIVE_EVIDENCE,
  NL,
  PRIMARY_DERIVED_INPUTS,
  REPO_ROOT,
  STAGE_EVIDENCE_PATH,
  SUPERSEDED_STAGE,
} from './contract.mjs';
import { computeExecutionClosure, REUSED_MODULES, STAGE_HARNESS_MODULES } from './closure.mjs';

const sha256 = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');

/** §Final: this stage's plan identity, so the guard and the plan agree on the name. */
export const PLAN_ID = 'r3-l0c-iar-l-primary-plan';

/** §Final: the supersession, recorded as data. */
export const PLAN_SUPERSESSION = Object.freeze({
  id: 'R3_L0C_IAR_L_SUPERSEDES_R3_L0C_IAR_PLAN',
  supersedes: Object.freeze({
    planId: SUPERSEDED_STAGE.planId,
    path: SUPERSEDED_STAGE.planPath,
    stage: SUPERSEDED_STAGE.stage,
    commit: SUPERSEDED_STAGE.commit,
    pipeline: 'scripts/r3l0ciar/pipeline.mjs',
    disposition: SUPERSEDED_STAGE.disposition,
  }),
  newPlan: Object.freeze({
    planId: PLAN_ID,
    pipeline: 'scripts/r3l0ciarl/pipeline.mjs',
    modes: 'scripts/r3l0ciarl/modes.mjs',
    liveEvidence: 'scripts/r3l0ciarl/live-evidence.mjs',
    postflight: 'scripts/r3l0ciarl/postflight.mjs',
    primaryBinding: 'scripts/r3l0ciarl/primary-binding.mjs',
    attestation: 'scripts/r3l0ciarl/attestation.mjs',
    closure: 'scripts/r3l0ciarl/closure.mjs',
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

/** §Final: the execution-path deviations, each traced to the gate it closes. */
export const EXECUTION_PATH_DEVIATIONS = Object.freeze(CORRECTION_GATES.map((gate) => Object.freeze({
  gateId: gate.id,
  section: gate.section,
  gap: gate.gap,
  property: gate.property,
  closedIn: gate.id.startsWith('L1') ? 'scripts/r3l0ciarl/live-evidence.mjs'
    : gate.id.startsWith('L2') ? 'scripts/r3l0ciarl/postflight.mjs'
      : gate.id.startsWith('L3') ? 'scripts/r3l0ciarl/primary-binding.mjs'
        : 'scripts/r3l0ciarl/attestation.mjs',
})));

/** §Final: the preserved design, each element with the evidence that it is the frozen one. */
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

/** §Final: build the plan, binding the freshly computed closure. */
export async function buildProspectivePlan(input = {}) {
  const closure = input.closure ?? await computeExecutionClosure({ verifyCompiled: input.verifyCompiled });
  const design = await preservedDesign();
  const { plannedRouteConfiguration } = await import('../r3l0ciar/preflight.mjs');
  const plannedRoute = await plannedRouteConfiguration();
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L',
    kind: 'live measurement closure prospective primary execution plan',
    planId: PLAN_ID,
    baseline: BASELINE_COMMIT,
    frozenBefore: 'the first primary model exposure',
    planSupersession: PLAN_SUPERSESSION,
    executionPathDeviations: EXECUTION_PATH_DEVIATIONS,
    pipelineOrder: Object.freeze([
      'primary input binding', 'committed plan', 'executable closure', 'exclusive run claim', 'PRESERVE',
      'world preparation', 'authorization verification', 'pretrial validity', 'exposure intent',
      'single child launch', 'trial admission', 'live-evidence sidecar', 'per-generation journal',
      'fresh postflight', 'frozen analysis',
    ]),
    /** §1: the live-evidence mechanism the plan binds. */
    liveEvidence: LIVE_EVIDENCE,
    /** §3: the inputs a PRIMARY run must derive, and the authorization record's required fields. */
    primaryDerivedInputs: PRIMARY_DERIVED_INPUTS,
    authorizationRecordFields: AUTHORIZATION_RECORD_FIELDS,
    authorizationDecisions: AUTHORIZATION_REQUIREMENTS,
    /** §4: the reused modules, named so the reuse is visible in the plan. */
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
      pipeline: 'scripts/r3l0ciarl/pipeline.mjs',
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
      what: 'an explicit external authorization decision record identifying the approved plan, the paid-run budget and all five fail-stop decisions',
      thisStageProvidesIt: false,
      authorityStringAloneIsNotProof: true,
      verifiedAtLaunchBoundary: true,
    }),
    stageStop: Object.freeze({ ranPaidMatrix: false, beganR3L1: false, beganFusion: false, modelCallsMade: 0 }),
    frozenAt: new Date().toISOString(),
    orderingLaw: 'the plan is committed AFTER every integration fix and BEFORE any primary model exposure',
  });
}

/** §Final: write the plan into this stage's evidence namespace. */
export async function writeProspectivePlan(input = {}) {
  const plan = await buildProspectivePlan(input);
  const directory = join(REPO_ROOT, STAGE_EVIDENCE_PATH);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'execution-plan.json'), `${JSON.stringify(plan, null, 2)}${NL}`, 'utf8');
  return plan;
}

/** §Final: recompute the closure and compare it against the frozen plan's binding. */
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
  process.stdout.write(`R3-L0C-I-A-R-L PLAN — ${String(plan.preservedDesign.sessionCount)} sessions${NL}`);
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
