#!/usr/bin/env node
/**
 * R3-A2 §"Three-commit evidence structure" (second commit) — FREEZE THE QUALIFICATION PLAN.
 *
 * The second commit must contain: the exact DeepSeek/GLM model-stack identities, the fixture digests, the
 * qualification-engine digest, the renderer digest, the tool-surface digest, the bounds, Nq=5, the exact
 * 20-run schedule, the trial schema, the analysis schema, the readiness definitions, the retry policy and the
 * hard run budget. §"No primary-fixture smoke" adds that NO primary model run may exist before this commit.
 *
 * The plan is written to `research-evidence/r3-a2/plan.json` at commit time so the committed plan and the
 * executed plan can be compared byte-for-byte. This is the direct remedy for R3-A0's
 * `PREREGISTRATION_CHECKPOINT_MISSING`, carried forward from the R3-A1 preregistration requirement.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { COMBINED_SPECS, NEW_FAMILIES, allContentDigests } from './fixtures.mjs';
import { COMMON_RENDERER, EXCLUDED_MODEL_IDS, MODEL_ROUTES_SENTINEL, SENTINEL_MODEL_IDS, sentinelFamilies } from './models.mjs';
import { MIN_CLASS_HEADROOM, PAIR_VERDICTS, QUALIFICATION_BOUNDS } from '../r3a/qualification.mjs';
import { PORTFOLIO_CAPITAL_RELATIONSHIPS, PORTFOLIO_CAPITAL_ITEMS, SOURCE_ANALOGUES } from './capital.mjs';
import { PORTFOLIO_MANIFESTS } from './manifest.mjs';
import { READINESS_STATES } from './readiness.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const NL = String.fromCharCode(10);
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, '').split('=');
  return [key, rest.join('=')];
}));
const RIG = args.get('rig') ?? join(homedir(), '.palimpsest-r3a2', 'qualification');

const digestOfFile = (relative) => createHash('sha256').update(readFileSync(join(REPO_ROOT, relative)), 'utf8').digest('hex');

/**
 * §"Engine immutability": the digests of the code the plan is frozen against. If any of these changes after
 * primary trial 1, the stage is in the STOP condition rather than free to patch and continue.
 */
export const ENGINE_DIGESTS = Object.freeze({
  'scripts/r3a/qualification.mjs': digestOfFile('scripts/r3a/qualification.mjs'),
  'scripts/r3a/fixture-manifest.mjs': digestOfFile('scripts/r3a/fixture-manifest.mjs'),
  'scripts/r3a2/fixtures.mjs': digestOfFile('scripts/r3a2/fixtures.mjs'),
  'scripts/r3a2/models.mjs': digestOfFile('scripts/r3a2/models.mjs'),
  'scripts/r3a2/readiness.mjs': digestOfFile('scripts/r3a2/readiness.mjs'),
  'scripts/r3a2/telemetry.mjs': digestOfFile('scripts/r3a2/telemetry.mjs'),
  'scripts/r3a2/trial.mjs': digestOfFile('scripts/r3a2/trial.mjs'),
  'scripts/r3a2/qualify.mjs': digestOfFile('scripts/r3a2/qualify.mjs'),
  'scripts/r3a2/analyse.mjs': digestOfFile('scripts/r3a2/analyse.mjs'),
  'scripts/r3a/fixture-content-r3a2.mjs': digestOfFile('scripts/r3a/fixture-content-r3a2.mjs'),
  'scripts/gates/d2-live-tee-worker.mjs': digestOfFile('scripts/gates/d2-live-tee-worker.mjs'),
});

/**
 * §"Qualification contract": the exact 20-run schedule.
 *
 * `F-C × DeepSeek × 5`, `F-C × GLM × 5`, `F-D × DeepSeek × 5`, `F-D × GLM × 5`. The order is family-major so
 * a reader can see the four blocks; nothing about the order affects a verdict.
 */
export function schedule() {
  const runs = [];
  for (const fixtureId of NEW_FAMILIES) {
    /** §"Qualification contract": the trial directory name is derived HERE, once, and carried in the plan. */
    const spec = COMBINED_SPECS.find((entry) => entry.fixtureId === fixtureId);
    for (const route of MODEL_ROUTES_SENTINEL) {
      for (let repetition = 0; repetition < MIN_CLASS_HEADROOM.Nq; repetition += 1) {
        runs.push(Object.freeze({
          fixtureId,
          fixtureName: spec.name,
          modelId: route.modelId,
          modelFamily: route.modelFamily,
          routeId: route.routeId,
          repetition,
          trialId: `${spec.name}-${route.routeId}-q${String(repetition)}`,
        }));
      }
    }
  }
  return Object.freeze(runs);
}

/** The fixture digests the plan freezes, for the NEW families and for the two carried-forward ones. */
export function fixtureDigests() {
  const digests = allContentDigests();
  return COMBINED_SPECS.map((spec) => Object.freeze({
    fixtureId: spec.fixtureId,
    fixtureRevision: spec.fixtureRevision,
    mechanismFamily: spec.mechanismFamily,
    contentDigest: digests[spec.fixtureId],
    files: Object.freeze(Object.keys(spec.files).sort()),
    /** §"Stage outcome": which families this stage executes and which it carries forward. */
    role: NEW_FAMILIES.includes(spec.fixtureId) ? 'R3-A2_NEW' : 'CARRIED_FORWARD',
  }));
}

/** §"Second commit": the plan, derived ONLY from the frozen specs — no run data enters it. */
export function buildPlan() {
  const runs = schedule();
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-A2',
    kind: 'frozen sentinel portfolio qualification plan',
    frozenBefore: 'the first R3-A2 baseline worker run',
    /** §"Research ruling": the two laws this stage freezes prospectively. */
    laws: Object.freeze({
      portfolioQualificationNotBridgeHunting: 'Portfolio Qualification != Bridge Hunting — a RED graph is a valid result and the graph is not to be forced GREEN',
      noFixtureAuthoredAfterFirstRun: 'no additional fixture may be authored in this stage after the first new baseline worker run',
      historicalVerdictsUnchanged: 'the historical R3-A/R3-AE verdicts remain unchanged and are carried forward, not rerun',
      fusionOutOfScope: 'Fusion is a future host/runtime policy over Attempts, not a canonical owner or authority mechanism',
    }),
    sentinelModelIds: SENTINEL_MODEL_IDS,
    excludedModelIds: EXCLUDED_MODEL_IDS,
    sentinelFamilies: sentinelFamilies(),
    models: MODEL_ROUTES_SENTINEL.map((route) => Object.freeze({
      modelId: route.modelId,
      modelFamily: route.modelFamily,
      routeId: route.routeId,
      providerId: route.providerId,
      vendor: route.vendor,
      api: route.api,
      baseURL: route.baseURL,
      apiKeyEnv: route.apiKeyEnv,
      contextWindow: route.contextWindow,
      maxTokens: route.maxTokens,
      materialDistinctness: route.materialDistinctness,
      /** §"Common cognitive interface": DeepSeek and GLM are different stacks; no pure-architecture claim. */
      isolationCaveat: 'the two routes differ in vendor, tool-use post-training lineage and reasoning formatting, and GLM reaches the harness through a local gateway, so this is NOT pure model-architecture isolation',
    })),
    renderer: COMMON_RENDERER,
    bounds: QUALIFICATION_BOUNDS,
    nq: MIN_CLASS_HEADROOM.Nq,
    pairVerdicts: PAIR_VERDICTS,
    /** §"Readiness decomposition": the four states, frozen as names before execution. */
    readinessStates: READINESS_STATES,
    readinessDefinitions: Object.freeze({
      TASK_READY: 'at least one model stack is qualified on at least two structurally distinct task families',
      MODEL_READY: 'at least one frozen fixture family is qualified on both sentinel model families',
      LOCAL_PAIR_READY: 'both sentinel model families have at least one qualified fixture AND at least two task families are represented overall; supports pair-local mechanism replication only',
      BRIDGE_READY: 'within one connected qualified component, at least one model spans >=2 task families AND at least one task family spans >=2 model families',
    }),
    fixtures: fixtureDigests(),
    engineDigests: ENGINE_DIGESTS,
    capitalItems: PORTFOLIO_CAPITAL_ITEMS,
    capitalRelationships: PORTFOLIO_CAPITAL_RELATIONSHIPS,
    sourceAnalogues: SOURCE_ANALOGUES,
    fixtureManifests: PORTFOLIO_MANIFESTS,
    /** §"No primary-fixture smoke": the schedule is the ONLY place a new fixture meets a model. */
    smokePolicy: 'no F-C or F-D run on either model before this schedule; plumbing tests use dummy fixtures only; an accidental new-fixture worker run is a protocol deviation and does NOT count toward Nq',
    retryPolicy: Object.freeze({
      rule: 'a valid bad model outcome is NEVER retried; an infrastructure-invalid attempt remains visible and is retried only to reach Nq valid runs for that pair',
      infrastructureInvalidDefinition: 'hostFailure or timeout; it is not a model outcome and not a verdict',
      validOutcomeIsFinal: true,
    }),
    runBudget: Object.freeze({
      intendedValidPrimaryRuns: runs.length,
      hardMaximumValidPrimaryRuns: 20,
      note: 'infrastructure-invalid attempts are visible and do not consume the valid-run budget, but the valid runs may never exceed 20',
    }),
    treatment: 'NONE — treatment-independent baseline',
    baselineCondition: Object.freeze({
      selectedInheritedCapital: false,
      projectCapitalIndex: false,
      m1Preview: false,
      hostMediatedCapitalPrework: false,
      startCall: "service.start({ expectedTaskId: 't1' })",
    }),
    trialSchema: Object.freeze({
      required: Object.freeze(['trialId', 'fixtureId', 'fixtureRevision', 'modelId', 'modelFamily', 'providerId', 'routeId', 'repetition', 'renderer', 'capitalDelivered', 'classPass', 'classCoverage', 'fullSolve', 'unclassifiedFailures', 'finalAcceptance', 'worldHead', 'oracleInaccessible', 'elapsedMs', 'infrastructureInvalid']),
      commonInterface: Object.freeze(['modelId', 'modelFamily', 'providerId', 'routeId', 'renderer.rendererId', 'renderer.rendererVersion', 'prompt.assembledPromptDigest', 'prompt.toolSurfaceDigest']),
      evidence: Object.freeze(['actions', 'revisions', 'usage', 'cost', 'treatmentIndependence']),
    }),
    analysisSchema: Object.freeze({
      perPair: Object.freeze(['fixtureId', 'modelId', 'verdict', 'reasons', 'classHeadroom', 'classGroups', 'variableGroups', 'variableDirectGroups', 'classCoverage', 'diagnostics', 'fixtureAuditPrecondition', 'antiOverfitProcess', 'claimCeiling']),
      stage: Object.freeze(['pairs', 'historicalPairs', 'extendedGraph', 'readiness', 'continuation', 'costAccounting', 'deviations']),
    }),
    expectedRuns: runs.length,
    runs,
    runsDir: null,
  });
}

async function main() {
  const plan = buildPlan();
  mkdirSync(RIG, { recursive: true });
  const runsDir = join(RIG, `runs-${new Date().toISOString().replace(/[:.]/gu, '-')}`);
  mkdirSync(runsDir, { recursive: true });
  const withDir = { ...plan, runsDir };
  writeFileSync(join(RIG, 'plan.json'), `${JSON.stringify(withDir, null, 2)}${NL}`, 'utf8');
  mkdirSync(join(REPO_ROOT, 'research-evidence', 'r3-a2'), { recursive: true });
  writeFileSync(join(REPO_ROOT, 'research-evidence', 'r3-a2', 'plan.json'), `${JSON.stringify(withDir, null, 2)}${NL}`, 'utf8');

  process.stdout.write(`R3-A2 SENTINEL PORTFOLIO — ${String(plan.runs.length)} runs planned${NL}`);
  process.stdout.write(`  fixtures: ${NEW_FAMILIES.join(', ')}${NL}`);
  process.stdout.write(`  models:   ${MODEL_ROUTES_SENTINEL.map((route) => `${route.modelId} (${route.modelFamily})`).join(', ')}${NL}`);
  process.stdout.write(`  excluded: ${EXCLUDED_MODEL_IDS.join(', ')}${NL}`);
  process.stdout.write(`  Nq=${String(plan.nq)}  bounds=(${String(QUALIFICATION_BOUNDS.lower)}, ${String(QUALIFICATION_BOUNDS.upper)})  renderer=${COMMON_RENDERER.rendererId}${NL}`);
  process.stdout.write(`  budget:   ${String(plan.runBudget.hardMaximumValidPrimaryRuns)} valid primary runs maximum${NL}`);
  process.stdout.write(`  runsDir:  ${runsDir}${NL}`);
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}
