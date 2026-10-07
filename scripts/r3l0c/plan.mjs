#!/usr/bin/env node
/**
 * R3-L0C §12/§19-§22/§23 — THE FROZEN RECONSTRUCTION EXPERIMENT PLAN.
 *
 * §23 requires the second commit to contain the schedule, the model stack, the validity envelopes, the
 * randomization, the verdict logic and the retry policy BEFORE any primary worker run. This module builds that
 * record, and `matrix.mjs` REFUSES to start unless the committed plan matches the schedule it would execute —
 * so no session can precede the plan commit.
 *
 * §23 ALSO FIXES THE IMMUTABILITY RULE: any real-model invocation against primary project bytes activates plan
 * immutability, and there is no plan amendment afterwards. The plan therefore records the digests of the code it
 * was frozen against, so a post-exposure edit is detectable.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT, STAGE_EVIDENCE_PATH } from './contract.mjs';
import {
  ARMS,
  BLOCK_COUNT,
  COMPRESSION_VERDICT_RULES,
  CORRECTNESS_INTERPRETATION,
  CORPUS_DIFFICULTY,
  GENERATIONS,
  GENERATIONS_PER_TRAJECTORY,
  NET_COST_VERDICT_RULES,
  OUTCOME_SCHEMA,
  PROJECT,
  RANDOMIZATION_SEED,
  RECONSTRUCTION_COST_RULES,
  RUN_BUDGET,
  STAGE_LAWS,
  TOTAL_SESSIONS,
  VALIDITY_PREREQUISITES,
  INVARIANTS,
} from './contract.mjs';
import { bundleDigest, frozenBundle, frozenHandlesFor } from './capital.mjs';
import { corpusCoverage, corpusDigestMaterial, declaredCorpusPaths } from './corpus.mjs';
import { DIAGNOSTIC_CLASSES, INVARIANT_EXPOSURES, eligibleClasses, instrumentedInvariants, uninstrumentedInvariants } from './diagnostic.mjs';
import { worldDigest } from './prehistory.mjs';

const NL = String.fromCharCode(10);
const sha256 = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');
const digestOfFile = (relative) => (existsSync(join(REPO_ROOT, relative)) ? sha256(readFileSync(join(REPO_ROOT, relative), 'utf8')) : 'MISSING');

/* ================================================================ §12 the model stack */

/**
 * §12: THE FROZEN SENTINEL STACK.
 *
 * §12 prefers DeepSeek Flash if available and stable, and forbids switching family after trial 1. The choice is
 * recorded with the evidence for it, and the alternative is recorded as NOT USED rather than omitted.
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
  availabilityEvidence: 'the R3-L0 dummy-fixture plumbing check and the 24 R3-L0 primary sessions all drove this route end-to-end; it is the frozen low-cost sentinel',
  modelSpecificPromptTuning: false,
  switchableAfterTrial1: false,
});

export const ALTERNATIVE_EXECUTOR = Object.freeze({
  routeId: 'glm-via-omnigate',
  modelId: 'glm-5.3-flash',
  modelFamily: 'glm',
  status: 'AVAILABLE BUT NOT USED — §12 prefers DeepSeek Flash and it is stable; no GLM run is authorized in this stage',
});

/* ================================================================ §12 the schedule */

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

/** §12: the arm order per block, randomized before trial 1 and frozen. */
export function armOrderPerBlock() {
  const random = mulberry32(RANDOMIZATION_SEED);
  const order = [];
  for (let block = 0; block < BLOCK_COUNT; block += 1) order.push(random() < 0.5 ? ['H', 'C'] : ['C', 'H']);
  return Object.freeze(order.map((entry) => Object.freeze(entry)));
}

/**
 * §12: THE EXACT SCHEDULE.
 *
 * Blocks run in order. Within a block the randomized arm order decides which trajectory runs first, and a
 * trajectory's generations are STRICTLY SEQUENTIAL, because G2 starts from what G1 promoted.
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

/* ================================================================ the frozen handles */

/**
 * §8/§12: THE FROZEN SELECTED HANDLE SET.
 *
 * §8 requires the selected-handle set to be frozen BEFORE trial 1, and §12 requires the selection to be the only
 * difference between the arms. The handles are derived from the admitted capital at RUN time (the owners mint
 * their own ids), so the plan freezes the SELECTION RULE and the EXPECTED COUNT rather than ids that do not exist
 * yet. `matrix.mjs` records the actual handles it selected, and the analysis compares against these counts.
 */
export function frozenHandlePlan() {
  const perArm = {};
  for (const arm of Object.keys(ARMS)) {
    perArm[arm] = Object.freeze(Object.fromEntries(GENERATIONS.map((generation) => [
      generation.id,
      Object.freeze({
        /** H selects NOTHING; C selects one reasoning claim and one procedure revision per exposed invariant. */
        expectedHandles: arm === 'H' ? 0 : generation.requires.length * 2,
        exposedInvariants: Object.freeze([...generation.requires]),
        selectionRule: arm === 'H'
          ? 'the selected set is EMPTY; the knowledge field is omitted entirely rather than sent empty'
          : 'one admitted current ReasoningClaim and one active Procedure revision per invariant this generation exposes; the backing Proof claim is never selected',
      }),
    ])));
  }
  return Object.freeze(perArm);
}

/* ================================================================ the plan */

export function buildPlan() {
  const sessions = schedule();
  const coverage = corpusCoverage();
  const bundle = frozenBundle();
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C',
    kind: 'frozen project-specific reconstruction experiment plan',
    frozenBefore: 'the first primary L0C worker session',
    researchQuestion: 'when the correct project-specific operating knowledge is recoverable from a substantial raw Project history, does governed current-standing cognitive capital reduce the cost and unreliability of reconstructing that knowledge?',
    experimentalUnit: 'ProjectTrajectory',
    primaryExecutor: PRIMARY_EXECUTOR,
    alternativeExecutor: ALTERNATIVE_EXECUTOR,

    /** §1/§26: the validity prerequisites, recorded before trial 1. */
    validityPrerequisites: VALIDITY_PREREQUISITES,

    /** §3-§6: the project family and its invariants. */
    project: PROJECT,
    invariants: INVARIANTS.map((entry) => Object.freeze({
      id: entry.id,
      name: entry.name,
      historicalInitialRule: entry.historicalInitialRule,
      revisions: entry.revisions,
      currentStanding: entry.currentStanding,
      applicability: entry.applicability,
      limitations: entry.limitations,
      genericPriorCannotDetermine: entry.genericPriorCannotDetermine,
      historicalArtifacts: entry.historicalArtifacts,
    })),

    /** §5: the corpus, frozen by digest. */
    corpus: Object.freeze({
      documents: coverage.documents,
      totalBytes: coverage.totalBytes,
      byCategory: coverage.byCategory,
      complete: coverage.complete,
      missingRequiredCategories: coverage.missingRequiredCategories,
      declaredPaths: declaredCorpusPaths(),
      corpusDigest: sha256(corpusDigestMaterial()),
      difficulty: CORPUS_DIFFICULTY,
    }),

    /** §15: the diagnostics that instrument the invariants, and any gap stated as a gap. */
    diagnosticClasses: DIAGNOSTIC_CLASSES,
    invariantExposures: INVARIANT_EXPOSURES,
    eligiblePerGeneration: Object.freeze(Object.fromEntries(GENERATIONS.map((generation) => [generation.id, eligibleClasses(generation.id)]))),
    instrumentedInvariants: instrumentedInvariants(),
    uninstrumentedInvariants: uninstrumentedInvariants(),

    /** §6/§8: the frozen current-standing bundle. */
    capitalBundleDigest: bundleDigest(bundle),
    capitalBundle: Object.freeze({
      invariants: Object.keys(bundle.invariants),
      minimalityLaw: bundle.minimalityLaw,
      leakage: bundle.leakage,
      owners: bundle.owners,
      newAssetKindCreated: bundle.newAssetKindCreated,
    }),

    /** §9/§12: the arms and the selection rule. */
    arms: ARMS,
    treatment: Object.freeze({ kind: 'SELECTION_ONLY', bothArmsIdenticalCapitalPlane: true, rawHistoryAvailableToBothArms: true, dynamicRelevanceRanker: false, hostMediatedForcedPrework: false }),
    frozenHandlePlan: frozenHandlePlan(),

    /** §12: the schedule and its randomization. */
    armOrderPerBlock: armOrderPerBlock(),
    randomizationSeed: RANDOMIZATION_SEED,
    blockCount: BLOCK_COUNT,
    generationsPerTrajectory: GENERATIONS_PER_TRAJECTORY,
    totalSessions: TOTAL_SESSIONS,
    runBudget: RUN_BUDGET,

    /** §13-§16: the outcome schema and its counting rules. */
    outcomeSchema: OUTCOME_SCHEMA,
    reconstructionCostRules: RECONSTRUCTION_COST_RULES,

    /** §19-§22: the verdicts, frozen before execution. */
    compressionVerdictRules: COMPRESSION_VERDICT_RULES,
    netCostVerdictRules: NET_COST_VERDICT_RULES,
    correctnessInterpretation: CORRECTNESS_INTERPRETATION,

    /** §23-§25: the laws. */
    stageLaws: STAGE_LAWS,

    /** §11: the world both arms receive. */
    worldDigest: worldDigest(),

    /** §23: the digests of the code the plan is frozen against, so a post-exposure edit is detectable. */
    analysisCodeDigests: Object.freeze({
      'scripts/r3l0c/contract.mjs': digestOfFile('scripts/r3l0c/contract.mjs'),
      'scripts/r3l0c/corpus.mjs': digestOfFile('scripts/r3l0c/corpus.mjs'),
      'scripts/r3l0c/project.mjs': digestOfFile('scripts/r3l0c/project.mjs'),
      'scripts/r3l0c/diagnostic.mjs': digestOfFile('scripts/r3l0c/diagnostic.mjs'),
      'scripts/r3l0c/capital.mjs': digestOfFile('scripts/r3l0c/capital.mjs'),
      'scripts/r3l0c/prehistory.mjs': digestOfFile('scripts/r3l0c/prehistory.mjs'),
      'scripts/r3l0c/trajectory.mjs': digestOfFile('scripts/r3l0c/trajectory.mjs'),
      'scripts/r3l0c/generation-child.mjs': digestOfFile('scripts/r3l0c/generation-child.mjs'),
      'scripts/r3l0c/matrix.mjs': digestOfFile('scripts/r3l0c/matrix.mjs'),
      'scripts/r3l0c/analyse.mjs': digestOfFile('scripts/r3l0c/analyse.mjs'),
      'scripts/r3l0c/witness.mjs': digestOfFile('scripts/r3l0c/witness.mjs'),
      'scripts/r3l0c/evidence-mode.mjs': digestOfFile('scripts/r3l0c/evidence-mode.mjs'),
      'scripts/r3l0c/immutability.mjs': digestOfFile('scripts/r3l0c/immutability.mjs'),
      'scripts/r3l0c/run-root.mjs': digestOfFile('scripts/r3l0c/run-root.mjs'),
      'scripts/gates/d2-live-tee-worker.mjs': digestOfFile('scripts/gates/d2-live-tee-worker.mjs'),
    }),

    generationRequirementDigests: Object.freeze(Object.fromEntries(GENERATIONS.map((entry) => [entry.id, sha256(entry.requirement)]))),
    stageEvidencePath: STAGE_EVIDENCE_PATH,
    sessions,
    /** §23/§24: the smoke and immutability policy. */
    smokePolicy: 'no project worker may run before this plan commit; no primary-fixture smoke; dummy fixtures only for plumbing; a real-model invocation against primary project bytes activates plan immutability and there is no amendment afterwards',
    onDefectAfterExposure: STAGE_LAWS.onDefectAfterExposure,
  });
}

async function main() {
  const plan = buildPlan();
  mkdirSync(join(REPO_ROOT, STAGE_EVIDENCE_PATH), { recursive: true });
  writeFileSync(join(REPO_ROOT, STAGE_EVIDENCE_PATH, 'plan.json'), `${JSON.stringify(plan, null, 2)}${NL}`, 'utf8');
  process.stdout.write(`R3-L0C PLAN — ${String(plan.sessions.length)} sessions across ${String(BLOCK_COUNT)} blocks${NL}`);
  process.stdout.write(`  executor: ${plan.primaryExecutor.modelId} (${plan.primaryExecutor.modelFamily})${NL}`);
  process.stdout.write(`  arm order: ${plan.armOrderPerBlock.map((entry) => entry.join('/')).join('  ')}${NL}`);
  process.stdout.write(`  invariants: ${plan.invariants.map((entry) => entry.id).join(', ')}${NL}`);
  process.stdout.write(`  corpus: ${String(plan.corpus.documents)} documents, ${String(plan.corpus.totalBytes)} bytes, complete=${String(plan.corpus.complete)}${NL}`);
  process.stdout.write(`  capital bundle digest: ${plan.capitalBundleDigest.slice(0, 16)}${NL}`);
  process.stdout.write(`  instrumented invariants: ${plan.instrumentedInvariants.join(', ')}; uninstrumented: ${plan.uninstrumentedInvariants.join(', ') || 'none'}${NL}`);
  process.stdout.write(`  world digest: ${plan.worldDigest.slice(0, 16)}${NL}`);
  for (const session of plan.sessions) process.stdout.write(`    ${session.sessionId}${NL}`);
  return plan;
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}
