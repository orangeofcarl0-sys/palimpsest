#!/usr/bin/env node
/**
 * R3-L0 §13/§14/§15/§24/§26 — THE FROZEN LONGITUDINAL EXPERIMENT PLAN.
 *
 * §26 requires the SECOND commit to contain the model stack, the System Validity Envelope, N=4 paired blocks,
 * the exact 24-session schedule, the randomization, the qualification/verdict logic, the retry policy, the trial
 * schema, the analysis code digests and the historical-evidence digest baseline — and requires it all to exist
 * BEFORE any primary worker run.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ARMS, bundleDigest } from './capital.mjs';
import { DIAGNOSTIC_CLASSES, GENERATIONS, PREPAID_EXPOSURES, eligiblePrepaidExposures, trajectoryEligibleExposures } from './project.mjs';

import { REPO_ROOT, STAGE_EVIDENCE_PATH, digestHistoricalEvidence, systemValidityEnvelope } from './envelope.mjs';

const NL = String.fromCharCode(10);
const sha256 = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');
const digestOfFile = (relative) => (existsSync(join(REPO_ROOT, relative)) ? sha256(readFileSync(join(REPO_ROOT, relative), 'utf8')) : 'MISSING');

/* ================================================================ §13 the model stack */

/**
 * §13: ONE low-cost sentinel model stack.
 *
 * `DeepSeek Flash` is frozen because its route was VERIFIED STABLE AND AVAILABLE at plan freeze: the dummy
 * plumbing check drove a real worker end-to-end through it and the worker edited the world. §13 forbids
 * switching model family after trial 1, so the choice is recorded here with the evidence for it.
 */
export const PRIMARY_EXECUTOR = Object.freeze({
  routeId: 'deepseek-direct',
  providerId: 'deepseek-route',
  modelId: 'deepseek-flash',
  displayName: 'DeepSeek Flash',
  modelFamily: 'deepseek',
  api: 'openai-completions',
  baseURL: 'https://api.deepseek.com',
  apiKeyEnv: 'DEEPSEEK_API_KEY',
  contextWindow: 131072,
  maxTokens: 8192,
  /** §13: the availability evidence, from the plumbing check run BEFORE this plan was frozen. */
  availabilityEvidence: 'the dummy-fixture plumbing check drove a real worker end-to-end: the worker set answer=42, the visible oracle passed, transcript 1904 bytes',
  /** §13: no model-specific prompt tuning anywhere. */
  modelSpecificPromptTuning: false,
  /** §13: switching family after trial 1 is forbidden, so the frozen choice is recorded as final. */
  switchableAfterTrial1: false,
});

/** §13: the alternative, recorded but NOT used, because the primary was available. */
export const ALTERNATIVE_EXECUTOR = Object.freeze({
  routeId: 'glm-via-omnigate',
  modelId: 'glm-5.3-flash',
  modelFamily: 'glm',
  status: 'AVAILABLE BUT NOT USED — §13 prefers DeepSeek Flash and it was stable at plan freeze',
  availabilityEvidence: 'the same dummy plumbing check also drove GLM end-to-end successfully',
});

/* ================================================================ §14/§15 the schedule */

/**
 * §14: FOUR MATCHED BLOCKS, each with one H and one C trajectory of three generations = 24 sessions.
 *
 * §14 requires the H/C EXECUTION ORDER within each block to be RANDOMIZED BEFORE TRIAL 1. The randomization is
 * computed here from a frozen seed and recorded in the plan, so the order cannot be chosen after seeing anything.
 */
export const BLOCK_COUNT = 4;
export const GENERATIONS_PER_TRAJECTORY = 3;
export const SESSIONS_PER_BLOCK = 2 * GENERATIONS_PER_TRAJECTORY;
export const TOTAL_SESSIONS = BLOCK_COUNT * SESSIONS_PER_BLOCK;

/** A small deterministic PRNG, so the randomization is reproducible from the seed alone. */
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const RANDOMIZATION_SEED = 0x52_4c_30_01;

/** §14: the arm order per block, randomized before trial 1 and frozen. */
export function armOrderPerBlock() {
  const random = mulberry32(RANDOMIZATION_SEED);
  const order = [];
  for (let block = 0; block < BLOCK_COUNT; block += 1) {
    order.push(random() < 0.5 ? ['H', 'C'] : ['C', 'H']);
  }
  return Object.freeze(order.map((entry) => Object.freeze(entry)));
}

/**
 * §14: THE EXACT SCHEDULE.
 *
 * Blocks run in order. Within a block the randomized arm order decides which trajectory runs first, and a
 * trajectory's generations are STRICTLY SEQUENTIAL (§14), because generation N+1 starts from what N promoted.
 */
export function schedule() {
  const order = armOrderPerBlock();
  const sessions = [];
  for (let block = 0; block < BLOCK_COUNT; block += 1) {
    for (const arm of order[block]) {
      for (const generation of GENERATIONS) {
        sessions.push(Object.freeze({
          block,
          arm,
          armName: ARMS[arm].name,
          generation: generation.id,
          sessionId: `b${String(block)}-${arm}-${generation.id}`,
          trajectoryId: `b${String(block)}-${arm}`,
          orderInBlock: order[block].indexOf(arm),
          generationIndex: generation.generation - 1,
        }));
      }
    }
  }
  return Object.freeze(sessions);
}

/* ================================================================ §15 retry and budget */

export const RUN_BUDGET = Object.freeze({
  intendedValidSessions: TOTAL_SESSIONS,
  hardMaximumValidSessions: TOTAL_SESSIONS,
  /** §15: infrastructure-invalid attempts stay visible and follow the existing retry policy. */
  retryPolicy: Object.freeze({
    rule: 'a valid generation outcome is NEVER retried; an infrastructure-invalid generation is retried only to reach the scheduled session count',
    infrastructureInvalidDefinition: 'the child failed to run, the worker failed to spawn, or the host lost the job — NOT a bad model outcome',
    validOutcomeIsFinal: true,
    maxAttemptsPerSession: 4,
  }),
  /** §14: no adaptive stopping. */
  adaptiveStopping: false,
  addRepetitionsIfAmbiguous: false,
});

/* ================================================================ §24 the verdicts */

/**
 * §24: THE TRAJECTORY UTILITY VERDICT, frozen before primary execution.
 *
 * §24 gives exact thresholds. They are recorded as data so the analysis cannot restate them loosely, and §24
 * forbids p-values at n=4.
 */
export const UTILITY_VERDICT_RULES = Object.freeze({
  POSITIVE_SIGNAL: Object.freeze({
    requirement: 'C cumulative PERR < H cumulative PERR in at least 3 of 4 matched blocks; terminal diagnostic quality in C is not worse than H in at least 3 of 4 blocks; governed capital consumption demonstrated in EVERY C trajectory',
    perrBlocksRequired: 3,
    qualityBlocksRequired: 3,
    requiresConsumptionInEveryCTrajectory: true,
  }),
  ADVERSE_SIGNAL: Object.freeze({
    requirement: 'C cumulative PERR is worse in at least 3 of 4 blocks, OR terminal diagnostic quality shows a similarly consistent adverse direction',
    perrBlocksRequired: 3,
  }),
  MIXED: Object.freeze({ requirement: 'directional effects exist but do not satisfy either stable criterion' }),
  NO_SIGNAL: Object.freeze({ requirement: 'no meaningful paired directional difference' }),
  pValues: 'NOT REPORTED — §24 forbids p-values at n=4',
  costOverridesPerr: false,
});

/** §23: THE CAPITAL-UPTAKE VERDICT, frozen before primary execution. */
export const UPTAKE_VERDICT_RULES = Object.freeze({
  CLOSED: 'every CAPITALIZED trajectory contains at least one actual governed capital consumption event, AND the intended capital is consumed in the generations where its declared lesson is exposed',
  LIMITED: 'at least one CAPITALIZED trajectory consumes capital, but not in every trajectory or not in every generation where the lesson is exposed',
  ABSENT: 'no CAPITALIZED trajectory contains a governed capital consumption event',
  /** §23: content use must NOT be inferred from task success. */
  inferFromTaskSuccess: false,
});

/* ================================================================ §16 the trial schema */

export const SESSION_SCHEMA = Object.freeze({
  required: Object.freeze(['sessionId', 'block', 'arm', 'generation', 'pid', 'startingHead', 'finalHead', 'jobPhase', 'attemptId', 'promoted', 'sourceDigest', 'diagnostic', 'visibleOracle']),
  capitalWitness: Object.freeze(['assetRevisionExists', 'projectAssociationExists', 'selectionAttemptBound', 'consumerVisibleHandles', 'selectedHandleDigest', 'governedPullInvoked', 'attemptAllowlistAuthorized', 'canonicalOwnerBodyDigest', 'noBypass']),
  historyOnlyWitness: Object.freeze(['ordinaryHistoryExists', 'selectedCapitalSetEmpty', 'modelVisibleCapitalIndexAbsent', 'noCapitalBodyInPrompt', 'noProhibitedDiscovery']),
  cost: Object.freeze(['inputTokens', 'outputTokens', 'cachedTokens', 'contextPullCalls', 'bodyBytesDelivered', 'toolCalls', 'oracleInvocations', 'revisions', 'elapsedMs']),
});

/* ================================================================ the plan */

export function buildPlan() {
  const sessions = schedule();
  const envelope = systemValidityEnvelope();
  const historical = digestHistoricalEvidence();
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0',
    kind: 'frozen longitudinal experiment plan',
    frozenBefore: 'the first primary L0 worker session',
    researchQuestion: 'does governed cognitive capital derived from already-paid historical experience reduce repeated cognitive errors and/or repeated cognitive effort across multiple fresh worker generations, holding durable Project history and ordinary project continuity constant?',
    experimentalUnit: 'ProjectTrajectory',
    primaryExecutor: PRIMARY_EXECUTOR,
    alternativeExecutor: ALTERNATIVE_EXECUTOR,
    systemValidityEnvelope: envelope,
    arms: ARMS,
    armOrderPerBlock: armOrderPerBlock(),
    randomizationSeed: RANDOMIZATION_SEED,
    blockCount: BLOCK_COUNT,
    generationsPerTrajectory: GENERATIONS_PER_TRAJECTORY,
    totalSessions: TOTAL_SESSIONS,
    runBudget: RUN_BUDGET,
    utilityVerdictRules: UTILITY_VERDICT_RULES,
    uptakeVerdictRules: UPTAKE_VERDICT_RULES,
    sessionSchema: SESSION_SCHEMA,
    capitalBundleDigest: bundleDigest(),
    diagnosticClasses: DIAGNOSTIC_CLASSES,
    prepaidExposures: PREPAID_EXPOSURES,
    eligiblePerGeneration: Object.freeze(Object.fromEntries(Object.keys(PREPAID_EXPOSURES).map((generation) => [generation, eligiblePrepaidExposures(generation)]))),
    trajectoryEligibleExposures: trajectoryEligibleExposures(),
    generationRequirementDigests: Object.freeze(Object.fromEntries(GENERATIONS.map((entry) => [entry.id, sha256(entry.requirement)]))),
    /** §26: the digests of the code the plan is frozen against. */
    analysisCodeDigests: Object.freeze({
      'scripts/r3l0/envelope.mjs': digestOfFile('scripts/r3l0/envelope.mjs'),
      'scripts/r3l0/project.mjs': digestOfFile('scripts/r3l0/project.mjs'),
      'scripts/r3l0/diagnostic.mjs': digestOfFile('scripts/r3l0/diagnostic.mjs'),
      'scripts/r3l0/capital.mjs': digestOfFile('scripts/r3l0/capital.mjs'),
      'scripts/r3l0/trajectory.mjs': digestOfFile('scripts/r3l0/trajectory.mjs'),
      'scripts/r3l0/prehistory.mjs': digestOfFile('scripts/r3l0/prehistory.mjs'),
      'scripts/r3l0/generation-child.mjs': digestOfFile('scripts/r3l0/generation-child.mjs'),
      'scripts/r3l0/matrix.mjs': digestOfFile('scripts/r3l0/matrix.mjs'),
      'scripts/r3l0/analyse.mjs': digestOfFile('scripts/r3l0/analyse.mjs'),
      'scripts/r3l0/witness.mjs': digestOfFile('scripts/r3l0/witness.mjs'),
      'scripts/gates/d2-live-tee-worker.mjs': digestOfFile('scripts/gates/d2-live-tee-worker.mjs'),
    }),
    /** §2/§26: the historical-evidence baseline the immutability guard compares against. */
    historicalEvidenceBaseline: Object.freeze({ protectedRoot: historical.protectedRoot, excludedStagePath: historical.excludedStagePath, fileCount: historical.fileCount, treeDigest: historical.treeDigest }),
    stageEvidencePath: STAGE_EVIDENCE_PATH,
    sessions,
    /** §27: the only place a project worker meets a generation. */
    smokePolicy: 'no G1/G2/G3 project worker may run before this plan commit; plumbing checks use dummy fixtures only; an accidental out-of-schedule generation is a protocol deviation and contributes zero to N',
    /** §22: system validity precedes behavioural claims. */
    systemValidityPrecedence: 'if any load-bearing graph/loop/runtime/mutation gate becomes red, SYSTEM_VALID = NO and BEHAVIORAL MECHANISM CLAIM = INVALID, even if task outcomes favour C',
  });
}

async function main() {
  const plan = buildPlan();
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync(join(REPO_ROOT, STAGE_EVIDENCE_PATH), { recursive: true });
  writeFileSync(join(REPO_ROOT, STAGE_EVIDENCE_PATH, 'plan.json'), `${JSON.stringify(plan, null, 2)}${NL}`, 'utf8');
  process.stdout.write(`R3-L0 PLAN — ${String(plan.sessions.length)} sessions across ${String(BLOCK_COUNT)} blocks${NL}`);
  process.stdout.write(`  executor: ${plan.primaryExecutor.modelId} (${plan.primaryExecutor.modelFamily})${NL}`);
  process.stdout.write(`  arm order: ${plan.armOrderPerBlock.map((entry) => entry.join('/')).join('  ')}${NL}`);
  process.stdout.write(`  eligible prepaid exposures: ${String(plan.trajectoryEligibleExposures)}${NL}`);
  process.stdout.write(`  capital bundle digest: ${plan.capitalBundleDigest.slice(0, 16)}${NL}`);
  process.stdout.write(`  SYSTEM_VALID: ${String(plan.systemValidityEnvelope !== undefined)}${NL}`);
  for (const session of plan.sessions.slice(0, 6)) process.stdout.write(`    ${session.sessionId}${NL}`);
  process.stdout.write(`    … ${String(plan.sessions.length - 6)} more${NL}`);
  return plan;
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}
