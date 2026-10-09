/**
 * R3-L0C-I Gate 6 — THE FINAL PROSPECTIVE EXECUTION PLAN.
 *
 * §"Commit the final prospective execution plan AFTER all integration fixes and BEFORE any primary model exposure."
 *
 * WHAT THIS PLAN IS. The authoritative description of how the 16-session paid matrix WILL be executed: which
 * runner, which adapter, which admission policy, which closure, which fault dispositions. It is written AFTER the
 * integration fixes so it describes code that exists, and it is committed BEFORE any model exposure so nothing in
 * it can be shaped by a result.
 *
 * WHY IT IS NOT A COPY OF R3-L0C-R's PLAN. That plan described an execution route with an infrastructure retry
 * loop. This one replaces the route and records the replacement as the deviation it is — §"Remove the old
 * infrastructure retry behavior from the new execution pathway, without editing historical frozen files." The old
 * plan stays byte-identical and is QUARANTINED; this plan is the authoritative one, and the quarantine guard is
 * what enforces the distinction rather than a reader's care.
 *
 * WHAT IT PRESERVES, and the preservation is the point of a prospective plan. The research question, the treatment,
 * the experimental unit, the corpus, the invariants, the oracle, the capital, the arm order, the seed, the
 * exposures, the verdict thresholds and the primary endpoints are all the FROZEN ones. This plan changes HOW the
 * matrix is executed, never WHAT it measures.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { BASELINE_COMMIT, REPO_ROOT, STAGE_EVIDENCE_PATH } from './contract.mjs';
import { BEHAVIORAL_OUTCOME_POLICY } from './outcome-admission.mjs';
import { PROTOCOL_DEVIATION } from './contract.mjs';
import { computeExecutionClosure } from './closure.mjs';
import { verifyClosureCompleteness } from './closure-graph.mjs';

const NL = String.fromCharCode(10);
const sha256 = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');

/** Gate 6: the plan's own identity, so the quarantine guard and the plan agree on the name. */
export const PLAN_ID = 'r3-l0c-i-primary-plan';

/**
 * Gate 6: THE EXECUTION-PATH DEVIATION, RECORDED AS DATA.
 *
 * The old path retried an infrastructure-invalid session up to four times. The new path launches each session
 * exactly once. The deviation is recorded rather than implied, and the OLD plan is named so a reader can see
 * exactly what was superseded.
 */
export const EXECUTION_PATH_DEVIATION = Object.freeze({
  id: 'INFRASTRUCTURE_RETRY_REMOVED_FROM_THE_NEW_PATHWAY',
  supersedes: Object.freeze({
    planId: 'R3-L0C-R REPAIR_REPLICATION',
    path: 'scripts/r3l0cr/matrix.mjs',
    retryRule: 'while (attempt < 4) { ... if (!result.infrastructureInvalid) break; }',
    disposition: 'QUARANTINED — byte-identical, no longer an authorized entry point',
  }),
  newPathway: Object.freeze({
    runner: 'scripts/r3l0cf/fail-stop.mjs',
    adapter: 'scripts/r3l0cf/primary-matrix.mjs',
    driver: 'scripts/r3l0cf/primary-matrix-driver.mjs',
    child: 'scripts/r3l0c/generation-child.mjs',
    retryRule: 'exactly one launch per session; MAX_WORKER_LAUNCHES = 1, POST_EXPOSURE_RETRIES = 0',
  }),
  historicalFileEdited: false,
  /** Gate 6: the quarantine mechanism, named so a reader can check it rather than trust it. */
  quarantineEnforcedBy: 'assertAuthoritativePath in scripts/r3l0cf/primary-matrix.mjs',
});

/**
 * Gate 6: THE PRESERVED DESIGN, each element with the digest that proves it is the frozen one.
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
  });
}

/**
 * Gate 6: BUILD THE PLAN.
 *
 * The closure digest is bound in, so a post-freeze code change is detectable as a drift rather than as a silent
 * difference between the plan and the code that runs it.
 */
export async function buildProspectivePlan() {
  const closure = await computeExecutionClosure();
  const completeness = verifyClosureCompleteness();
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I',
    kind: 'final prospective primary execution plan',
    planId: PLAN_ID,
    baseline: BASELINE_COMMIT,
    frozenBefore: 'the first primary model exposure',
    /** Gate 6: the deviation, and what it supersedes. */
    executionPathDeviation: EXECUTION_PATH_DEVIATION,
    /** §2 of R3-L0C-F, carried so the retry rule cannot drift. */
    protocolDeviation: PROTOCOL_DEVIATION,
    /** Gate 2: the admission policy the runner will apply. */
    outcomePolicy: BEHAVIORAL_OUTCOME_POLICY,
    /** Gate 6: the preserved design. */
    preservedDesign: await preservedDesign(),
    /** Gate 4: the closure, bound in. */
    executionClosure: Object.freeze({
      executionClosureDigest: closure.executionClosureDigest,
      partIds: closure.partIds,
      fileCount: closure.fileCount,
      toolchain: closure.toolchain,
      compiledVerification: closure.compiledVerification,
      completeness: Object.freeze({ status: completeness.CLOSURE_COMPLETENESS, declared: completeness.declaredCount, reachable: completeness.reachableCount }),
    }),
    /** Gate 3: the execution route. */
    executionRoute: Object.freeze({
      runner: 'scripts/r3l0cf/fail-stop.mjs',
      adapter: 'scripts/r3l0cf/primary-matrix.mjs',
      driver: 'scripts/r3l0cf/primary-matrix-driver.mjs',
      child: 'scripts/r3l0c/generation-child.mjs',
      workerReplacementForDeterministicRuns: 'scripts/r3l0cf/scripted-primary-worker.mjs',
      realWorkerForThePaidRun: 'the shipped DSH worker on the authorized executor route',
      authoritativePath: PLAN_ID,
      legacyMatrixQuarantined: true,
    }),
    /** Gate 5: the semantic determinations. */
    semanticRulings: Object.freeze({
      capitalSemanticSufficiency: 'verified against the frozen reference cases by a capital-derived procedure',
      promptSubstitutionNeutrality: 'LIMITED — preserved from R3-L0C-F unless an independently justified interpretation resolves it',
      promptNeutralityResolved: false,
      readmeEdited: false,
      corpusEdited: false,
    }),
    /** Gate 6: what the paid run requires before it may start. */
    authorizationRequired: Object.freeze({
      required: true,
      what: 'an explicit authorization ruling for the fail-stop protocol and for the paid matrix',
      thisStageProvidesIt: false,
    }),
    /** §0/§18: the stop. */
    stageStop: Object.freeze({ ranModelMatrix: false, beganR3L1: false, beganFusion: false, modelCallsMade: 0 }),
    frozenAt: new Date().toISOString(),
    /** Gate 6: the ordering law, carried so it cannot be inverted. */
    orderingLaw: 'the plan is committed AFTER every integration fix and BEFORE any primary model exposure',
  });
}

/** Gate 6: write the plan into this stage's evidence namespace. */
export async function writeProspectivePlan() {
  const plan = await buildProspectivePlan();
  const directory = join(REPO_ROOT, STAGE_EVIDENCE_PATH);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'execution-plan.json'), `${JSON.stringify(plan, null, 2)}${NL}`, 'utf8');
  return plan;
}

/** Gate 6: recompute the closure and compare it against the frozen plan's binding. */
export async function checkPlanClosure() {
  const planPath = join(REPO_ROOT, STAGE_EVIDENCE_PATH, 'execution-plan.json');
  if (!existsSync(planPath)) return Object.freeze({ EXECUTION_CLOSURE: 'NO_FROZEN_PLAN', frozen: null, current: null });
  const frozen = JSON.parse(readFileSync(planPath, 'utf8'));
  const current = await computeExecutionClosure();
  const matches = frozen.executionClosure?.executionClosureDigest === current.executionClosureDigest;
  return Object.freeze({
    EXECUTION_CLOSURE: matches ? 'MATCH' : 'DRIFTED',
    frozen: frozen.executionClosure?.executionClosureDigest ?? null,
    current: current.executionClosureDigest,
    onMismatch: 'STOP — a pre-exposure repair must create a NEW plan commit',
  });
}

async function main() {
  const plan = await writeProspectivePlan();
  process.stdout.write(`R3-L0C-I PLAN — ${String(plan.preservedDesign.sessionCount)} sessions${NL}`);
  process.stdout.write(`  plan id: ${plan.planId}${NL}`);
  process.stdout.write(`  execution closure: ${plan.executionClosure.executionClosureDigest.slice(0, 16)} over ${String(plan.executionClosure.fileCount)} files${NL}`);
  process.stdout.write(`  closure completeness: ${plan.executionClosure.completeness.status}${NL}`);
  process.stdout.write(`  arm order: ${plan.preservedDesign.armOrder.map((entry) => entry.join('/')).join('  ')}${NL}`);
  return plan;
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}

export { NL };
