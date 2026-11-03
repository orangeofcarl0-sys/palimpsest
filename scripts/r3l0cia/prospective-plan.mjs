/**
 * R3-L0C-I-A §9 — THE CORRECTED PROSPECTIVE EXECUTION PLAN.
 *
 * §9 requires the plan to be committed AFTER every integration change and BEFORE any paid model exposure, and it
 * requires one thing of the relationship to the prior plan: "It must explicitly supersede, not amend, the
 * R3-L0C-I execution plan."
 *
 * SUPERSEDE RATHER THAN AMEND, AND THE REASON IS THE WHOLE DISCIPLINE OF THIS PROJECT. R3-L0C-I's plan is bound
 * into that stage's evidence and its closure digest covers the code its plan named. Amending it would make that
 * stage's record describe a plan that no longer exists — the same error as editing a frozen module, and the same
 * reason R3-L0C-I quarantined R3-L0C-R's matrix instead of deleting it. So this plan is a NEW artifact in this
 * stage's own namespace, it names what it supersedes, and the superseded plan stays byte-identical.
 *
 * WHAT IT CHANGES. Only the EXECUTION PATH, and only where this stage measured a defect:
 *
 *   · the adapter's treatment realization now comes from consumer evidence rather than from a field the child
 *     never writes (F3);
 *   · worker uptake is measured from the worker's own telemetry rather than from the host's audit (F4);
 *   · the execution mode is explicit and the primary driver can select a real model worker (F5);
 *   · the post-matrix validity gate is plan-bound rather than a session count (F6);
 *   · the closure is enforced at launch rather than optional (F7);
 *   · the outer budget exceeds the inner one plus the settlement interval (F8);
 *   · the run root is claimed before anything is prepared (F1);
 *   · the protected roots are per-trajectory (F2).
 *
 * WHAT IT PRESERVES, and the preservation is what keeps the replication comparable: the research question, the
 * treatment, the experimental unit, the corpus, the invariants, the oracle, the capital, the arm order, the seed,
 * the exposures, the verdict thresholds and the primary endpoints are all the FROZEN ones.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ACTIVATION_ORDER,
  BASELINE_COMMIT,
  ESCAPED_DEFECTS,
  EXECUTION_MODES,
  GENERATION_CHILD_BUDGET_MS,
  PRE_TRIAL_REQUIREMENTS,
  PULL_LAYERS,
  QUARANTINE_HONESTY,
  REPO_ROOT,
  SETTLEMENT_INTERVAL_MS,
  STAGE_EVIDENCE_PATH,
  WORKER_EXECUTION_BUDGET_MS,
} from './contract.mjs';
import { computeExecutionClosure } from './closure.mjs';

const NL = String.fromCharCode(10);
const sha256 = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');

/** §9: this stage's plan identity, so the quarantine guard and the plan agree on the name. */
export const PLAN_ID = 'r3-l0c-ia-primary-plan';

/**
 * §9: THE SUPERSESSION, RECORDED AS DATA.
 *
 * It names the plan it replaces, the file that was its execution path, and the disposition of each — so a reader
 * can see exactly what changed and check that the superseded artifacts are untouched.
 */
export const PLAN_SUPERSESSION = Object.freeze({
  id: 'R3_L0C_IA_SUPERSEDES_R3_L0C_I_PLAN',
  supersedes: Object.freeze({
    planId: 'r3-l0c-i-primary-plan',
    path: `${'research-evidence/r3-l0c-i'}/execution-plan.json`,
    adapter: 'scripts/r3l0cf/primary-matrix.mjs',
    driver: 'scripts/r3l0cf/primary-matrix-driver.mjs',
    disposition: 'SUPERSEDED — byte-identical, no longer the authorized entry point',
  }),
  newPlan: Object.freeze({
    planId: PLAN_ID,
    adapter: 'scripts/r3l0cia/primary-adapter.mjs',
    driver: 'scripts/r3l0cia/primary-driver.mjs',
    activation: 'scripts/r3l0cia/activation.mjs',
    confinement: 'scripts/r3l0cia/confinement.mjs',
    treatment: 'scripts/r3l0cia/treatment.mjs',
    validity: 'scripts/r3l0cia/validity.mjs',
    closure: 'scripts/r3l0cia/closure.mjs',
  }),
  amendedPriorPlan: false,
  priorPlanEdited: false,
  /** §2: the honest statement about the quarantine, carried so no report can overclaim it. */
  quarantine: QUARANTINE_HONESTY,
});

/** §9: the execution-path deviations, each traced to the defect it closes. */
export const EXECUTION_PATH_DEVIATIONS = Object.freeze(ESCAPED_DEFECTS.map((defect) => Object.freeze({
  defectId: defect.id,
  gap: defect.gap,
  property: defect.property,
  closedIn: defect.id.startsWith('F1') ? 'scripts/r3l0cia/activation.mjs'
    : defect.id.startsWith('F2') ? 'scripts/r3l0cia/confinement.mjs'
      : defect.id.startsWith('F3') || defect.id.startsWith('F4') ? 'scripts/r3l0cia/treatment.mjs'
        : defect.id.startsWith('F5') || defect.id.startsWith('F8') ? 'scripts/r3l0cia/primary-adapter.mjs'
          : 'scripts/r3l0cia/validity.mjs',
})));

/**
 * §9: THE PRESERVED DESIGN, each element with the evidence that it is the frozen one.
 */
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
    /** §9: the schedule itself, so the plan binds the exact session ids. */
    schedule: Object.freeze(schedule.map((session) => Object.freeze({ ...session }))),
  });
}

/**
 * §9: BUILD THE PLAN.
 *
 * The closure digest is bound in, so a post-freeze code change is detectable as a drift rather than as a silent
 * difference between the plan and the code that runs it.
 */
export async function buildProspectivePlan(input = {}) {
  const closure = input.closure ?? await computeExecutionClosure({ verifyCompiled: input.verifyCompiled });
  const design = await preservedDesign();
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A',
    kind: 'corrected prospective primary execution plan',
    planId: PLAN_ID,
    baseline: BASELINE_COMMIT,
    frozenBefore: 'the first primary model exposure',
    /** §9: the supersession, and what it supersedes. */
    planSupersession: PLAN_SUPERSESSION,
    /** §9: each defect, its property, and the module that closes it. */
    executionPathDeviations: EXECUTION_PATH_DEVIATIONS,
    /** §2: the activation order the entry performs. */
    activationOrder: ACTIVATION_ORDER,
    /** §5: the two modes and the timeout hierarchy. */
    executionModes: EXECUTION_MODES,
    budgets: Object.freeze({
      outerChildMs: GENERATION_CHILD_BUDGET_MS,
      innerWorkerMs: WORKER_EXECUTION_BUDGET_MS,
      settlementMs: SETTLEMENT_INTERVAL_MS,
      outerExceedsInnerPlusSettlement: GENERATION_CHILD_BUDGET_MS > WORKER_EXECUTION_BUDGET_MS + SETTLEMENT_INTERVAL_MS,
    }),
    /** §4: the three separated pull layers. */
    pullLayers: PULL_LAYERS,
    /** §6: the conditions the pre- and post-matrix gates evaluate. */
    preTrialConditions: PRE_TRIAL_REQUIREMENTS,
    postMatrixConditions: Object.freeze([
      'allSessionsPresent', 'allFourBlocksComplete', 'allRealizationsApplied', 'closureStillMatches', 'containmentHolds', 'scheduleShapeMatches',
    ]),
    /** §9: the preserved design, with the schedule bound so the plan names the exact sessions. */
    preservedDesign: design,
    schedule: design.schedule,
    /** §7: the closure, bound in. */
    executionClosure: Object.freeze({
      executionClosureDigest: closure.executionClosureDigest,
      partIds: closure.partIds,
      fileCount: closure.fileCount,
      toolchain: closure.toolchain,
      compiledVerification: closure.compiledVerification,
      runtimeManifest: closure.runtimeManifest,
      closureComplete: closure.CLOSURE_COMPLETE,
    }),
    /** §9: the execution route. */
    executionRoute: Object.freeze({
      activation: 'scripts/r3l0cia/activation.mjs',
      runner: 'scripts/r3l0cf/fail-stop.mjs',
      adapter: 'scripts/r3l0cia/primary-adapter.mjs',
      driver: 'scripts/r3l0cia/primary-driver.mjs',
      child: 'scripts/r3l0c/generation-child.mjs',
      workerReplacementForDeterministicRuns: 'scripts/r3l0cia/scripted-worker.mjs',
      realWorkerForThePaidRun: 'the shipped DSH worker on the authorized executor route',
      authoritativePath: PLAN_ID,
      legacyMatrixQuarantined: true,
      legacyMatrixStillExecutable: true,
    }),
    /** §9: what the paid run requires before it may start. */
    authorizationRequired: Object.freeze({
      required: true,
      what: 'an explicit authorization ruling for the fail-stop protocol and for the paid matrix',
      thisStageProvidesIt: false,
      /** §5: a caller-supplied string is not proof. */
      callerSuppliedStringIsNotProof: true,
    }),
    /** §10: the stop. */
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
  process.stdout.write(`R3-L0C-I-A PLAN — ${String(plan.preservedDesign.sessionCount)} sessions${NL}`);
  process.stdout.write(`  plan id: ${plan.planId}${NL}`);
  process.stdout.write(`  supersedes: ${plan.planSupersession.supersedes.planId}${NL}`);
  process.stdout.write(`  execution closure: ${plan.executionClosure.executionClosureDigest.slice(0, 16)} over ${String(plan.executionClosure.fileCount)} files${NL}`);
  process.stdout.write(`  closure complete: ${String(plan.executionClosure.closureComplete)}${NL}`);
  process.stdout.write(`  arm order: ${plan.preservedDesign.armOrder.map((entry) => entry.join('/')).join('  ')}${NL}`);
  return plan;
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}

export { NL };
