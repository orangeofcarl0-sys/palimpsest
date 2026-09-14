#!/usr/bin/env node
/**
 * G10-R empirical campaign.
 *
 * Builds three experiments, runs them with REAL DSH principals where the design
 * calls for it (single locus, artificial role split, federated peers) and a
 * deterministic SCRIPTED_MECHANICAL simulation for the reasoning-cell scenario,
 * then persists every definition, run, evaluation and one structural
 * intervention into the compiled OrganizationMemory service.
 *
 * Honesty rules enforced here:
 *   - a failed/timed-out run is RETAINED (never retried to success);
 *   - an unobserved token bucket is UNAVAILABLE, never 0;
 *   - `estimatedCost` is ALWAYS unavailable;
 *   - proxy metrics are labelled `*Proxy` and carry a `proxy` provenance;
 *   - the campaign has a wall-clock budget and skips (as a recorded TIMEOUT)
 *     rather than faking a completed run.
 *
 * Usage: node scripts/experiments/run-campaign.mjs
 *   env CAMPAIGN_BUDGET_MS  wall-clock budget (default 27 minutes)
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import * as host from './lib/host.mjs';

/* ------------------------------------------------------------------ *
 * Config
 * ------------------------------------------------------------------ */

const RUN_POLICY = Object.freeze({
  minRunsPerVariantPerScenario: 3,
  maxRuns: 60,
  maxWallClockMs: 600000,
  maxModelCalls: 400,
  maxAttemptsPerRun: 1,
  randomizeOrder: true,
  seed: 20260914,
});

const CAMPAIGN_BUDGET_MS = Number(process.env.CAMPAIGN_BUDGET_MS ?? 27 * 60 * 1000);
const campaignStart = Date.now();
const remaining = () => CAMPAIGN_BUDGET_MS - (Date.now() - campaignStart);

const SINGLE_TIMEOUT_MS = 180000;
const ROLE_TIMEOUT_MS = 240000;
const FEDERATION_TIMEOUT_MS = 300000;
const PLAN_ONLY = process.env.G10R_PLAN_ONLY === '1';

const OM_PATH = process.env.G10R_OM_PATH ?? `${host.REPO}/.dogfood/g10r-om.sqlite`;
const BUNDLE_PATH = process.env.G10R_BUNDLE_PATH ?? `${host.REPO}/.dogfood/g10r-bundle.json`;
const SUMMARY_PATH = process.env.G10R_SUMMARY_PATH ?? `${host.REPO}/.dogfood/g10r-campaign-summary.json`;

const REPORT_VALIDATOR_REF = 'artifactValidator:report-json-v1';
const EVIDENCE_VALIDATOR_REF = 'artifactValidator:federation-evidence-v1';

/* ------------------------------------------------------------------ *
 * Provenance constants
 * ------------------------------------------------------------------ */

const PALIMPSEST_SHA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: host.REPO, encoding: 'utf8' }).trim();
const HOST_VERSION = host.dshVersion();
const ORDARIUM_VERSION = host.packageVersion(`${host.REPO}/node_modules/@ordarium/core/package.json`);
const REPO_SHAS = Object.freeze([{ repo: 'palimpsest', sha: PALIMPSEST_SHA }]);

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const sha256File = (path) => (existsSync(path) ? sha256(readFileSync(path)) : 'unreported');
const safeId = (text) => text.replace(/[^A-Za-z0-9._:-]/g, '-');
const nowIso = () => new Date().toISOString();

const A = await host.loadAdvanced();
const {
  materializeMetric,
  unavailableMetric,
  unavailableTelemetry,
  materializeExperiment,
  materializeScenario,
  materializeVariant,
  materializeIntervention,
  buildRunResult,
  evaluate,
  planRuns,
  artifactValidator,
  SqliteOrganizationMemoryStore,
  makeOrganizationMemoryService,
} = A;

/* ------------------------------------------------------------------ *
 * Metric construction
 * ------------------------------------------------------------------ */

const TOKEN_IDS = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens'];

function knownCount(metricId, value, provenance, measurementClass = 'DIRECTLY_OBSERVED') {
  return materializeMetric({ metricId, unit: 'count', measurementClass, state: 'known', value, provenance });
}
function knownText(metricId, text, provenance) {
  return materializeMetric({ metricId, unit: 'text', measurementClass: 'DIRECTLY_OBSERVED', state: 'known', text, provenance });
}
function knownToken(metricId, value, provenance) {
  return materializeMetric({ metricId, unit: 'tokens', measurementClass: 'DIRECTLY_OBSERVED', state: 'known', value, provenance });
}
function unavailable(metricId, unit, detail, provenance) {
  return unavailableMetric({ metricId, unit, detail, provenance });
}

const METRIC_ORDER = Object.freeze([
  'agentTurns', 'agentSteps', 'toolCalls', 'modelCalls',
  'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens',
  'provider', 'model', 'estimatedCost',
  'wallClockLatencyMs', 'attentionActivations', 'crossPeerMessagesProxy', 'coordinationProxyCalls',
  'userInterventions', 'qualityScore',
  'branches', 'duplicateClaims', 'unresolvedRate', 'verificationOverhead',
]);

/**
 * Assemble the per-run measurement set. `obs` carries only what was actually
 * observed; every absent bucket becomes UNAVAILABLE.
 */
function buildMeasurements(obs) {
  const bag = new Map();
  const telemetry = obs.telemetry;
  const tq = 'dsh.session.events';

  if (telemetry !== undefined) {
    bag.set('agentTurns', knownCount('agentTurns', telemetry.turns, tq));
    bag.set('agentSteps', knownCount('agentSteps', telemetry.steps, tq));
    bag.set('toolCalls', knownCount('toolCalls', telemetry.toolCalls, tq));
    bag.set('modelCalls', materializeMetric({ metricId: 'modelCalls', unit: 'count', measurementClass: 'DERIVED_MECHANICALLY', state: 'known', value: telemetry.steps, provenance: `${tq}:steps_as_model_call_proxy` }));
    for (const id of TOKEN_IDS) {
      const value = telemetry.usage?.[id];
      bag.set(id, typeof value === 'number' && Number.isSafeInteger(value) ? knownToken(id, value, tq) : unavailable(id, 'tokens', `${id} not reported by the host for this session`, tq));
    }
  } else {
    bag.set('agentTurns', obs.stdoutTurns != null ? knownCount('agentTurns', obs.stdoutTurns, 'dsh.host.stdout.turn-lines') : unavailable('agentTurns', 'count', 'no session telemetry and no turn line', 'g10r.host'));
    bag.set('agentSteps', unavailable('agentSteps', 'count', 'no dsh session JSONL readable for this run', 'g10r.host'));
    bag.set('toolCalls', obs.stdoutToolCalls != null ? knownCount('toolCalls', obs.stdoutToolCalls, 'dsh.host.stdout.turn-lines') : unavailable('toolCalls', 'count', 'no session telemetry and no turn line', 'g10r.host'));
    bag.set('modelCalls', unavailable('modelCalls', 'count', 'no dsh session JSONL readable for this run', 'g10r.host'));
    for (const id of TOKEN_IDS) bag.set(id, unavailable(id, 'tokens', 'no dsh session JSONL readable for this run', 'g10r.host'));
  }

  bag.set('provider', knownText('provider', obs.provider ?? 'deepseek-official', 'g10r.config+session'));
  bag.set('model', knownText('model', obs.model ?? 'deepseek-flash', 'g10r.config+session'));
  bag.set('estimatedCost', unavailable('estimatedCost', 'usd', 'host exposes no dollar cost; no observed token pricing', 'g10r.host'));
  bag.set('wallClockLatencyMs', knownCount('wallClockLatencyMs', Math.round(obs.wallClockMs), 'g10r.harness.clock'));
  bag.set(
    'attentionActivations',
    obs.attentionActivations != null ? knownCount('attentionActivations', obs.attentionActivations, 'dsh.host.stdout.activation-lines') : unavailable('attentionActivations', 'count', 'activation count not observed for this variant', 'g10r.host'),
  );
  bag.set('crossPeerMessagesProxy', materializeMetric({ metricId: 'crossPeerMessagesProxy', unit: 'count', measurementClass: 'DERIVED_MECHANICALLY', state: 'known', value: obs.crossPeerMessages ?? 0, provenance: 'proxy:dsh.session.tool-calls:palimpsest_federation.message' }));
  bag.set('coordinationProxyCalls', materializeMetric({ metricId: 'coordinationProxyCalls', unit: 'count', measurementClass: 'DERIVED_MECHANICALLY', state: 'known', value: obs.coordinationProxyCalls ?? 0, provenance: 'proxy:dsh.session.tool-calls:palimpsest_*' }));
  bag.set('userInterventions', knownCount('userInterventions', obs.userInterventions ?? 0, 'g10r.harness.non-interactive'));

  if (obs.quality?.measured) bag.set('qualityScore', knownCount('qualityScore', obs.quality.score, 'g10r.validator.artifact-rubric'));
  else bag.set('qualityScore', unavailable('qualityScore', 'score_0_100', obs.quality?.detail ?? 'no deterministic validator applies to this variant', 'g10r.validator'));

  for (const extra of obs.extraMetrics ?? []) bag.set(extra.metricId, extra);

  const ordered = [];
  for (const id of METRIC_ORDER) if (bag.has(id)) ordered.push(bag.get(id));
  for (const [id, metric] of bag) if (!METRIC_ORDER.includes(id)) ordered.push(metric);
  return ordered;
}

/* ------------------------------------------------------------------ *
 * Session observation
 * ------------------------------------------------------------------ */

async function observeSessions(sessionIds) {
  const entries = [];
  let palimpsestCalls = 0;
  let federationMessages = 0;
  for (const id of sessionIds ?? []) {
    const telemetry = await host.readSessionTelemetry(id);
    entries.push(telemetry);
    if (telemetry !== undefined) {
      const stats = host.sessionToolCallStats(telemetry.events);
      palimpsestCalls += stats.palimpsestCalls;
      federationMessages += stats.federationMessages;
    }
  }
  return { combined: host.combineTelemetry(entries), sessionsRead: entries.filter((entry) => entry !== undefined).length, palimpsestCalls, federationMessages };
}

/* ------------------------------------------------------------------ *
 * Artifact / evidence checks (deterministic rubrics)
 * ------------------------------------------------------------------ */

function checkReportFile(path) {
  if (!path || !existsSync(path)) return { ok: false, detail: 'report.json was not produced' };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return { ok: false, detail: `report.json did not parse: ${error.message}` };
  }
  if (!Array.isArray(parsed.findings) || parsed.findings.length === 0 || !parsed.findings.every((item) => typeof item === 'string' && item.trim() !== '')) {
    return { ok: false, detail: 'findings must be a non-empty array of non-empty strings' };
  }
  if (typeof parsed.recommendation !== 'string' || parsed.recommendation.trim() === '') {
    return { ok: false, detail: 'recommendation must be a non-empty string' };
  }
  return { ok: true, detail: 'report.json present with required keys' };
}

function checkEvidenceFile(path) {
  if (!path || !existsSync(path)) return { ok: false, detail: 'federation evidence JSON was not produced' };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return { ok: false, detail: `federation evidence did not parse: ${error.message}` };
  }
  for (const key of ['result', 'milestones', 'metrics', 'timeline']) {
    if (!(key in parsed)) return { ok: false, detail: `federation evidence missing key ${key}` };
  }
  return { ok: true, detail: `federation evidence result=${parsed.result}` };
}

function reportValidator() {
  return artifactValidator({
    validatorRef: REPORT_VALIDATOR_REF,
    check: (input) => checkReportFile(input.artifactRefs?.[0] ?? (input.workspacePath ? join(input.workspacePath, 'report.json') : undefined)),
  });
}
function evidenceValidator() {
  return artifactValidator({
    validatorRef: EVIDENCE_VALIDATOR_REF,
    check: (input) => checkEvidenceFile(input.artifactRefs?.[0] ?? input.workspacePath),
  });
}

/* ------------------------------------------------------------------ *
 * Task text
 * ------------------------------------------------------------------ */

const ANTI_NOTE =
  'Bounded analysis question: an organisation split one small, single-file analysis into two artificial roles (planner and reviewer). Cycle time rose by roughly 40% while the defect rate was unchanged; the evidence is limited to this one case.';
const FED_NOTE =
  'Two projects: a producer owns a durable StateChangeFeed and its schema; a consumer owns a reset/observation cursor policy. Decide under what observable conditions a persistent peer boundary is worth its coordination cost, given both projects context.';

function reportDeliverable() {
  return 'Deliverable: write a JSON file named report.json in the current working directory with exactly two keys: findings (an array of at least two short strings) and recommendation (one short string). Do not use any palimpsest tools. Reply DONE when the file is written.';
}

function singleTask(note) {
  return `You are ONE analysis locus. ${note}\n${reportDeliverable()}`;
}

function plannerTask(note) {
  return `You are the PLANNER principal (localPeer "peer-palimpsest"). Shared context: ${note}\nDo this now:\n1) Call palimpsest_federation with action "contact" and reason "anti-agentification analysis".\n2) Call palimpsest_federation with action "message", to "peer-ordarium", threadId "anti-agentification", body = a JSON string with keys draftFindings (an array of 2 short strings) and draftRecommendation (one short string).\nDo NOT write report.json. Reply DONE.`;
}

function reviewerTask() {
  return 'You are the REVIEWER principal (localPeer "peer-ordarium"). If no palimpsest inbox message carries a JSON object with key "draftFindings", reply WAITING and do NOT write any file. When you receive a palimpsest attention about a message from peer-palimpsest: call palimpsest_federation action "inbox", take the latest message body (a JSON object with draftFindings and draftRecommendation), then write report.json in the current working directory with keys findings (an array of strings, you may copy or amend the draft) and recommendation (string). Reply DONE.';
}

/* ------------------------------------------------------------------ *
 * Executors
 * ------------------------------------------------------------------ */

function failureExecution(reason, classification) {
  return {
    outcome: classification === 'TIMEOUT' ? 'FAIL' : 'ERROR',
    failureClassification: classification,
    measurements: unavailableTelemetry(reason),
    artifactRefs: [],
    workspacePath: undefined,
    profileDigest: 'unreported',
    provider: undefined,
    model: undefined,
    real: true,
    skipped: false,
  };
}

function skippedExecution() {
  return {
    outcome: 'FAIL',
    failureClassification: 'TIMEOUT',
    measurements: unavailableTelemetry('campaign wall-clock budget exhausted before this run could launch'),
    artifactRefs: [],
    workspacePath: undefined,
    profileDigest: 'unreported',
    provider: undefined,
    model: undefined,
    real: false,
    skipped: true,
  };
}

/** ONE DSH principal writes report.json. */
async function singleLocusExecution(spec, note) {
  const runKey = safeId(`${spec.experiment.experimentId}-${spec.variant.variantId}-r${spec.orderIndex}-${Date.now()}`);
  const runDir = `${host.CAMPAIGN_ROOT}/${runKey}`;
  const timeoutMs = Math.max(5000, Math.min(SINGLE_TIMEOUT_MS, remaining() - 8000));
  const obs = await host.singleLocusRun({ task: singleTask(note), runDir, namespace: `g10r-${runKey}`, runKey, timeoutMs });
  const artifactPath = join(runDir, 'report.json');
  const sess = await observeSessions([obs.sessionId]);
  const check = checkReportFile(artifactPath);
  const quality = { measured: true, score: check.ok ? 100 : 0, detail: check.detail };
  const stdoutToolCalls = host.countToolCalls(obs.turns);
  const measurements = buildMeasurements({
    telemetry: sess.combined,
    stdoutTurns: obs.turns.length,
    stdoutToolCalls,
    wallClockMs: obs.wallClockMs,
    attentionActivations: host.countActivations(obs.activations),
    crossPeerMessages: sess.federationMessages,
    coordinationProxyCalls: sess.palimpsestCalls,
    userInterventions: 0,
    quality,
    provider: sess.combined?.provider,
    model: sess.combined?.model,
  });
  const outcome = obs.timedOut ? 'FAIL' : obs.exitCode !== 0 ? 'ERROR' : check.ok ? 'PASS' : 'FAIL';
  const failureClassification = obs.timedOut ? 'TIMEOUT' : obs.exitCode !== 0 ? 'HOST_FAILURE' : check.ok ? 'NONE' : 'VALIDATION_FAILED';
  return {
    outcome,
    failureClassification,
    measurements,
    artifactRefs: [artifactPath],
    workspacePath: runDir,
    profileDigest: sha256File(join(runDir, 'p.json')),
    provider: sess.combined?.provider,
    model: sess.combined?.model,
    real: true,
    skipped: false,
  };
}

/** TWO DSH principals with an artificial planner/reviewer split over transport. */
async function roleSplitExecution(spec, note) {
  const runKey = safeId(`${spec.experiment.experimentId}-role-split-r${spec.orderIndex}-${Date.now()}`);
  const runDir = `${host.CAMPAIGN_ROOT}/${runKey}`;
  const namespace = `g10r-${runKey}`;
  const plannerProfile = host.deploymentProfile({ who: 'palimpsest', other: 'ordarium', dataDir: runDir, namespace, runKey });
  const reviewerProfile = host.deploymentProfile({ who: 'ordarium', other: 'palimpsest', dataDir: runDir, namespace, runKey });
  host.writeHostProfiles([
    { name: host.EXPERIMENT_PROFILE_P, deployment: plannerProfile, deploymentPath: join(runDir, 'p.json') },
    { name: host.EXPERIMENT_PROFILE_O, deployment: reviewerProfile, deploymentPath: join(runDir, 'o.json') },
  ]);

  const started = Date.now();
  const deadline = started + Math.max(10000, Math.min(ROLE_TIMEOUT_MS, remaining() - 8000));
  const planner = host.launchPrincipal({ profileName: host.EXPERIMENT_PROFILE_P, task: plannerTask(note), cwd: runDir, sessionFile: join(runDir, 'p.session'), once: true });
  const plannerExit = await host.awaitExit(planner, Math.max(5000, deadline - Date.now()));
  const plannerTimedOut = plannerExit === undefined;
  if (plannerTimedOut) host.killPrincipal(planner);

  let reviewer = null;
  let artifactSeen = false;
  if (!plannerTimedOut || remaining() > 20000) {
    reviewer = host.launchPrincipal({ profileName: host.EXPERIMENT_PROFILE_O, task: reviewerTask(), cwd: runDir, sessionFile: join(runDir, 'o.session'), idleMs: 1000 });
    await host.awaitReady(reviewer, Math.max(5000, deadline - Date.now()));
    const artifactPath = join(runDir, 'report.json');
    const seen = await host.waitFor(() => {
      if (!existsSync(artifactPath)) return undefined;
      try {
        JSON.parse(readFileSync(artifactPath, 'utf8'));
        return true;
      } catch {
        return undefined;
      }
    }, Math.max(3000, deadline - Date.now()), 2000);
    artifactSeen = seen === true;
    host.killPrincipal(reviewer);
    await host.sleep(400);
  }

  const sessionIds = [planner.ready?.sessionId, reviewer?.ready?.sessionId].filter(Boolean);
  const sess = await observeSessions(sessionIds);
  const artifactPath = join(runDir, 'report.json');
  const check = artifactSeen ? checkReportFile(artifactPath) : { ok: false, detail: 'report.json was not produced before the role-split deadline' };
  const quality = { measured: true, score: check.ok ? 100 : 0, detail: check.detail };
  const stdoutTurns = planner.turns.length + (reviewer?.turns.length ?? 0);
  const stdoutToolCalls = host.countToolCalls(planner.turns) + host.countToolCalls(reviewer?.turns ?? []);
  const measurements = buildMeasurements({
    telemetry: sess.combined,
    stdoutTurns,
    stdoutToolCalls,
    wallClockMs: Date.now() - started,
    attentionActivations: host.countActivations(planner.activations) + host.countActivations(reviewer?.activations ?? []),
    crossPeerMessages: sess.federationMessages,
    coordinationProxyCalls: sess.palimpsestCalls,
    userInterventions: 0,
    quality,
    provider: sess.combined?.provider,
    model: sess.combined?.model,
  });
  const timedOut = plannerTimedOut || !artifactSeen;
  const outcome = timedOut ? 'FAIL' : check.ok ? 'PASS' : 'FAIL';
  const failureClassification = timedOut ? 'TIMEOUT' : check.ok ? 'NONE' : 'VALIDATION_FAILED';
  return {
    outcome,
    failureClassification,
    measurements,
    artifactRefs: [artifactPath],
    workspacePath: runDir,
    profileDigest: sha256File(join(runDir, 'p.json')),
    provider: sess.combined?.provider,
    model: sess.combined?.model,
    real: true,
    skipped: false,
  };
}

/** FEDERATED_PEERS: reuse the working real-host federation dogfood. */
async function federatedExecution(spec) {
  const runKey = safeId(`${spec.experiment.experimentId}-federated-r${spec.orderIndex}-${Date.now()}`);
  const outPath = `${host.CAMPAIGN_ROOT}/${runKey}/evidence.json`;
  const timeoutMs = Math.max(10000, Math.min(FEDERATION_TIMEOUT_MS, remaining() - 15000));
  const obs = await host.federationRun({ outPath, timeoutMs, cwd: host.REPO });
  const evidence = obs.evidence;
  const sessionIds = [evidence?.peers?.p?.sessionId, evidence?.peers?.o?.sessionId].filter((id) => typeof id === 'string');
  const sess = await observeSessions(sessionIds);
  const check = evidence !== null ? checkEvidenceFile(outPath) : { ok: false, detail: obs.timedOut ? 'federation subprocess timed out with no evidence' : 'federation produced no evidence JSON' };
  const quality = { measured: true, score: check.ok ? 100 : 0, detail: check.detail };
  const milestones = evidence?.milestones ?? {};
  const achieved = ['oReceived', 'pPending', 'pAccepted', 'offered', 'decidedByO', 'reconstructed'].filter((key) => milestones[key] != null).length;
  const measurements = buildMeasurements({
    telemetry: sess.combined,
    wallClockMs: obs.wallClockMs,
    attentionActivations: typeof evidence?.metrics?.activations === 'number' ? evidence.metrics.activations : null,
    crossPeerMessages: achieved,
    coordinationProxyCalls: sess.palimpsestCalls,
    userInterventions: 0,
    quality,
    provider: sess.combined?.provider,
    model: sess.combined?.model,
    extraMetrics: [
      materializeMetric({ metricId: 'federationMilestonesProxy', unit: 'count', measurementClass: 'DERIVED_MECHANICALLY', state: 'known', value: achieved, provenance: 'proxy:dogfood.evidence.milestones' }),
    ],
  });
  const timedOut = obs.timedOut;
  const outcome = timedOut ? 'FAIL' : evidence?.result === 'PASS' ? 'PASS' : 'FAIL';
  const failureClassification = timedOut ? 'TIMEOUT' : evidence?.result === 'PASS' ? 'NONE' : 'QUALITY_FAILED';
  return {
    outcome,
    failureClassification,
    measurements,
    artifactRefs: [outPath],
    workspacePath: outPath,
    profileDigest: sha256File('C:/Users/66494/.dsh/palimpsest-dogfood/real-host/p.json'),
    provider: sess.combined?.provider,
    model: sess.combined?.model,
    real: true,
    skipped: false,
  };
}

/** SCRIPTED_MECHANICAL deterministic reasoning-cell simulation (NO LLM). */
function xorshift(seed) {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
}

function reasoningCellExecution(spec) {
  const started = Date.now();
  const rng = xorshift((spec.seed ^ (spec.orderIndex * 2654435761)) >>> 0);
  const isCell = spec.variant.kind === 'REASONING_CELL';
  const branches = isCell ? 5 + (rng() % 4) : 3 + (rng() % 3);
  const duplicateClaims = isCell ? rng() % 2 : (rng() % 3 === 0 ? 1 : 0);
  const unresolved = isCell ? rng() % 2 : 1 + (rng() % 2);
  const verificationOverhead = isCell ? 2 + (rng() % 3) : 0;
  const unresolvedRate = Math.round((100 * unresolved) / branches);
  const wallClockMs = Math.max(0, Date.now() - started);
  const extraMetrics = [
    materializeMetric({ metricId: 'branches', unit: 'count', measurementClass: 'DERIVED_MECHANICALLY', state: 'known', value: branches, provenance: 'scripted-mechanical:reasoning-simulation' }),
    materializeMetric({ metricId: 'duplicateClaims', unit: 'count', measurementClass: 'DERIVED_MECHANICALLY', state: 'known', value: duplicateClaims, provenance: 'scripted-mechanical:reasoning-simulation' }),
    materializeMetric({ metricId: 'unresolvedRate', unit: 'percent', measurementClass: 'DERIVED_MECHANICALLY', state: 'known', value: unresolvedRate, provenance: 'scripted-mechanical:reasoning-simulation' }),
    materializeMetric({ metricId: 'verificationOverhead', unit: 'count', measurementClass: 'DERIVED_MECHANICALLY', state: 'known', value: verificationOverhead, provenance: 'scripted-mechanical:reasoning-simulation' }),
  ];
  const measurements = buildMeasurements({
    telemetry: undefined,
    stdoutTurns: undefined,
    stdoutToolCalls: undefined,
    wallClockMs,
    attentionActivations: null,
    crossPeerMessages: 0,
    coordinationProxyCalls: isCell ? verificationOverhead : 0,
    userInterventions: 0,
    quality: { measured: false, score: null, detail: 'no deterministic validator applies to the scripted reasoning simulation' },
    provider: 'scripted-mechanical',
    model: 'scripted-mechanical',
    extraMetrics,
  });
  return {
    outcome: 'PASS',
    failureClassification: 'NONE',
    measurements,
    artifactRefs: [],
    workspacePath: undefined,
    profileDigest: sha256('scripted-mechanical:no-host-profile'),
    provider: 'scripted-mechanical',
    model: 'scripted-mechanical',
    real: false,
    skipped: false,
  };
}

/* ------------------------------------------------------------------ *
 * Run orchestration (planRuns + buildRunResult so REAL provenance is carried;
 * executeRuns cannot, because it hardcodes hostVersion/SHAs to "unreported")
 * ------------------------------------------------------------------ */

function provenanceFor(execution) {
  const unknowns = [];
  if (execution.provider === undefined) unknowns.push('provider');
  if (execution.model === undefined) unknowns.push('model');
  if (execution.profileDigest === undefined || execution.profileDigest === 'unreported') unknowns.push('profileDigest');
  unknowns.push('tokenCost');
  return {
    provider: execution.provider ?? 'unreported',
    model: execution.model ?? 'unreported',
    hostVersion: HOST_VERSION,
    palimpsestSha: PALIMPSEST_SHA,
    ordariumVersion: ORDARIUM_VERSION,
    profileDigest: execution.profileDigest ?? 'unreported',
    repoShas: REPO_SHAS,
    unknowns: [...new Set(unknowns)].sort(),
  };
}

async function runOne(spec, executor, validator) {
  const startedAt = nowIso();
  let execution;
  if (PLAN_ONLY) {
    execution = skippedExecution();
  } else if (remaining() <= 5000) {
    execution = skippedExecution();
  } else {
    try {
      execution = await executor(spec);
    } catch (error) {
      execution = failureExecution(error instanceof Error ? error.message : 'executor threw', 'HOST_FAILURE');
    }
  }

  const provenance = provenanceFor(execution);
  const provisional = buildRunResult({
    spec,
    provenance,
    execution: { ...execution, validatorResults: [] },
    startedAt,
    endedAt: nowIso(),
  });

  let verdicts = [];
  if (validator !== undefined && execution.skipped !== true) {
    try {
      const verdict = await validator.validate({
        runRef: provisional.runRef,
        ...(execution.workspacePath === undefined ? {} : { workspacePath: execution.workspacePath }),
        ...(execution.artifactRefs.length === 0 ? {} : { artifactRefs: execution.artifactRefs }),
      });
      verdicts = [verdict];
      if (execution.outcome === 'PASS' && verdict.verdict === 'FAIL') {
        execution = { ...execution, outcome: 'FAIL', failureClassification: 'VALIDATION_FAILED' };
      }
    } catch (error) {
      verdicts = [{ validatorRef: validator.validatorRef, verdict: 'ERROR', detail: error instanceof Error ? error.message : 'validator threw' }];
    }
  }

  const run = buildRunResult({
    spec,
    provenance,
    execution: { ...execution, validatorResults: verdicts },
    startedAt,
    endedAt: nowIso(),
  });
  return {
    run,
    meta: { real: execution.real === true, skipped: execution.skipped === true, provider: execution.provider, model: execution.model },
  };
}

/* ------------------------------------------------------------------ *
 * Definitions
 * ------------------------------------------------------------------ */

function scenarioDef(input) {
  return materializeScenario({
    scenarioId: input.scenarioId,
    scenarioRevision: 1,
    kind: input.kind,
    classification: input.classification,
    task: input.task,
    allowedHumanIntervention: [],
    successCriteria: input.successCriteria,
    validatorRefs: input.validatorRefs ?? [],
    bounds: { maxWallClockMs: 600000, maxModelCalls: 400, maxRunsPerVariant: 60 },
  });
}
function variantDef(input) {
  return materializeVariant({ variantId: input.variantId, kind: input.kind, description: input.description, configRefs: input.configRefs });
}
function experimentDef(input) {
  return materializeExperiment({
    experimentId: input.experimentId,
    revision: 1,
    objective: input.objective,
    scenarioRefs: [{ scenarioId: input.scenario.scenarioId, scenarioRevision: input.scenario.scenarioRevision, digest: input.scenario.digest }],
    variantRefs: input.variants.map((variant) => ({ variantId: variant.variantId, digest: variant.digest })),
    measurementPlan: { metricIds: input.metricIds, primaryValidatorRef: input.primaryValidatorRef, objectives: input.objectives, objectiveNote: 'decision_aid_not_truth' },
    runPolicy: RUN_POLICY,
  });
}

const COMMON_METRIC_IDS = [
  'wallClockLatencyMs', 'agentTurns', 'agentSteps', 'toolCalls', 'modelCalls',
  'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens',
  'attentionActivations', 'crossPeerMessagesProxy', 'coordinationProxyCalls',
  'userInterventions', 'qualityScore', 'estimatedCost',
];

const definitions = [];

/* --- exp-anti-agentification ------------------------------------- */
{
  const scenario = scenarioDef({
    scenarioId: 'scn-anti-agentification',
    kind: 'ANTI_AGENTIFICATION',
    classification: 'SCAFFOLDED',
    task: `${ANTI_NOTE} ${reportDeliverable()}`,
    successCriteria: ['report.json parses', 'findings is a non-empty array of strings', 'recommendation is a non-empty string'],
    validatorRefs: [REPORT_VALIDATOR_REF],
  });
  const variants = [
    variantDef({ variantId: 'var-single-locus', kind: 'SINGLE_LOCUS', description: 'One DSH principal performs the bounded analysis and writes report.json.', configRefs: ['profile:palimpsest-exp-p', 'executor:single-locus'] }),
    variantDef({ variantId: 'var-role-split', kind: 'ARTIFICIAL_ROLE_SPLIT', description: 'Two DSH principals with an artificial planner/reviewer split on the same task and context, coordinating over the Palimpsest transport.', configRefs: ['profile:palimpsest-exp-p', 'profile:palimpsest-exp-o', 'executor:planner-reviewer'] }),
  ];
  const experiment = experimentDef({
    experimentId: 'exp-anti-agentification',
    objective: 'Does an artificial role split reduce coordination cost or just add overhead?',
    scenario,
    variants,
    metricIds: COMMON_METRIC_IDS,
    objectives: ['quality', 'latency', 'cost', 'coordinationCost', 'humanIntervention'],
    primaryValidatorRef: REPORT_VALIDATOR_REF,
  });
  definitions.push({
    experiment,
    scenario,
    variants,
    validators: { 'var-single-locus': reportValidator(), 'var-role-split': reportValidator() },
    executors: {
      'var-single-locus': (spec) => singleLocusExecution(spec, ANTI_NOTE),
      'var-role-split': (spec) => roleSplitExecution(spec, ANTI_NOTE),
    },
  });
}

/* --- exp-federation ---------------------------------------------- */
{
  const scenario = scenarioDef({
    scenarioId: 'scn-interface-negotiation',
    kind: 'S2_INTERFACE_NEGOTIATION',
    classification: 'SCAFFOLDED',
    task: `${FED_NOTE} ${reportDeliverable()}`,
    successCriteria: ['report.json parses with required keys', 'federation evidence JSON produced (federated variant)'],
    validatorRefs: [REPORT_VALIDATOR_REF, EVIDENCE_VALIDATOR_REF],
  });
  const variants = [
    variantDef({ variantId: 'var-single-locus', kind: 'SINGLE_LOCUS', description: 'One DSH principal given both projects context writes report.json.', configRefs: ['profile:palimpsest-exp-p', 'executor:single-locus'] }),
    variantDef({ variantId: 'var-federated-peers', kind: 'FEDERATED_PEERS', description: 'Two real DSH host-backed peer principals negotiate a boundary interface over the durable transport ledger.', configRefs: ['script:scripts/dogfood/real-host-federation.mjs'] }),
  ];
  const experiment = experimentDef({
    experimentId: 'exp-federation',
    objective: 'Under what observable conditions is a persistent peer boundary worth its coordination cost?',
    scenario,
    variants,
    metricIds: [...COMMON_METRIC_IDS, 'federationMilestonesProxy'],
    objectives: ['quality', 'latency', 'cost', 'coordinationCost', 'humanIntervention'],
    primaryValidatorRef: REPORT_VALIDATOR_REF,
  });
  definitions.push({
    experiment,
    scenario,
    variants,
    validators: { 'var-single-locus': reportValidator(), 'var-federated-peers': evidenceValidator() },
    executors: {
      'var-single-locus': (spec) => singleLocusExecution(spec, FED_NOTE),
      'var-federated-peers': (spec) => federatedExecution(spec),
    },
  });
}

/* --- exp-reasoning-cell ------------------------------------------ */
{
  const scenario = scenarioDef({
    scenarioId: 'scn-reasoning-decomposition',
    kind: 'REASONING_DECOMPOSITION',
    classification: 'SCRIPTED_MECHANICAL',
    task: 'Deterministic simulation of branch/claim/admission counts for a single locus versus an explicit reasoning cell. No LLM is involved; counts are produced by a seeded deterministic simulation.',
    successCriteria: ['branch/claim/admission counts recorded'],
    validatorRefs: [],
  });
  const variants = [
    variantDef({ variantId: 'var-single-locus', kind: 'SINGLE_LOCUS', description: 'Deterministic single-locus reasoning simulation (SCRIPTED_MECHANICAL).', configRefs: ['executor:scripted-reasoning-simulation'] }),
    variantDef({ variantId: 'var-reasoning-cell', kind: 'REASONING_CELL', description: 'Deterministic reasoning-cell decomposition simulation (SCRIPTED_MECHANICAL).', configRefs: ['executor:scripted-reasoning-simulation'] }),
  ];
  const experiment = experimentDef({
    experimentId: 'exp-reasoning-cell',
    objective: 'Does explicit reasoning decomposition change branch, duplicate-claim and unresolved-claim counts versus a single locus?',
    scenario,
    variants,
    metricIds: [
      'branches', 'duplicateClaims', 'unresolvedRate', 'verificationOverhead',
      'wallClockLatencyMs', 'agentTurns', 'agentSteps', 'toolCalls', 'modelCalls',
      'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens',
      'crossPeerMessagesProxy', 'coordinationProxyCalls', 'userInterventions', 'qualityScore', 'estimatedCost',
    ],
    objectives: ['quality', 'latency', 'cost', 'coordinationCost'],
    primaryValidatorRef: 'none:scripted-mechanical',
  });
  definitions.push({
    experiment,
    scenario,
    variants,
    validators: {},
    executors: {
      'var-single-locus': (spec) => reasoningCellExecution(spec),
      'var-reasoning-cell': (spec) => reasoningCellExecution(spec),
    },
  });
}

/* ------------------------------------------------------------------ *
 * Campaign
 * ------------------------------------------------------------------ */

async function main() {
  mkdirSync(`${host.REPO}/.dogfood`, { recursive: true });
  const store = new SqliteOrganizationMemoryStore(OM_PATH);
  const om = makeOrganizationMemoryService({ store });

  const results = [];
  for (const def of definitions) {
    const { experiment, scenario, variants, executors } = def;
    process.stdout.write(`\n[campaign] ${experiment.experimentId} (${scenario.scenarioId}) remaining=${Math.round(remaining() / 1000)}s\n`);

    await om.recordExperiment(experiment);
    await om.recordScenario(experiment.experimentId, scenario);
    for (const variant of variants) await om.recordVariant(experiment.experimentId, variant);

    const plan = planRuns({ experiment, scenarios: [scenario], variants });
    const runs = [];
    const metas = new Map();
    for (const spec of plan) {
      const executor = executors[spec.variant.variantId];
      const validator = def.validators[spec.variant.variantId];
      process.stdout.write(`[campaign]   run ${spec.variant.variantId} order=${spec.orderIndex} attempt=${spec.attempt} ... `);
      const started = Date.now();
      const { run, meta } = await runOne(spec, executor, validator);
      runs.push(run);
      metas.set(run.runRef, meta);
      await om.recordRun(experiment.experimentId, run);
      process.stdout.write(`${run.outcome}/${run.failureClassification} in ${Math.round((Date.now() - started) / 1000)}s\n`);
    }

    const evaluation = evaluate({ experiment, runs, scenarios: [scenario] });
    await om.recordEvaluation(experiment.experimentId, evaluation);
    results.push({ experiment, scenario, variants, runs, metas, evaluation });
  }

  /* --- one structural intervention record ------------------------- */
  const intervention = materializeIntervention({
    subjectRefs: ['exp-federation'],
    rationale:
      'Structural choice under observation: a persistent federated peer boundary (two real host-backed principals negotiating over a durable transport ledger) versus a single locus given both projects context. Recorded to make the structural history explicit and independent of any single evaluation.',
    observationBasis: 'G10-R campaign runs for exp-federation: crossPeerMessagesProxy and coordinationProxyCalls observed from real DSH session tool-call events, plus the federation evidence JSON.',
    recordedAt: nowIso(),
  });
  await om.recordIntervention(intervention);

  /* --- reproducibility bundle (NO secrets) ------------------------ */
  const bundleExperiments = [];
  for (const result of results) {
    const persistedRuns = await om.runs(result.experiment.experimentId);
    bundleExperiments.push({
      experiment: await om.experiment(result.experiment.experimentId),
      scenarios: await om.scenarios(result.experiment.experimentId),
      variants: await om.variants(result.experiment.experimentId),
      runPolicy: result.experiment.runPolicy,
      runs: persistedRuns.map((run) => ({
        runRef: run.runRef,
        variantRef: run.variantRef,
        scenarioRef: run.scenarioRef,
        outcome: run.outcome,
        failureClassification: run.failureClassification,
        provenance: run.provenance,
        measurements: run.measurements,
        validatorVerdicts: run.validatorVerdicts,
      })),
      evaluationRef: result.evaluation.evaluationRef,
      warnings: result.evaluation.warnings,
      pareto: result.evaluation.pareto,
    });
  }
  const bundle = {
    schemaVersion: 1,
    generatedAt: nowIso(),
    description: 'G10-R empirical campaign reproducibility bundle. Definitions, scenario versions, variant configs, provenance, run refs, validator refs. No secrets or credentials.',
    host: { dshVersion: HOST_VERSION, provider: 'deepseek-official', model: 'deepseek-flash' },
    shas: { palimpsest: PALIMPSEST_SHA, ordariumVersion: ORDARIUM_VERSION, repoShas: REPO_SHAS },
    runPolicy: RUN_POLICY,
    experiments: bundleExperiments,
    interventions: await om.interventions(),
  };
  writeFileSync(BUNDLE_PATH, JSON.stringify(bundle, null, 2));

  /* --- summary ---------------------------------------------------- */
  let realCompleted = 0;
  let realFailed = 0;
  let scripted = 0;
  let skipped = 0;
  const tokenAvailability = Object.fromEntries(TOKEN_IDS.map((id) => [id, { known: 0, unavailable: 0 }]));
  const failures = [];

  const experimentSummaries = results.map((result) => {
    const realCountsByVariant = {};
    for (const run of result.runs) {
      const meta = result.metas.get(run.runRef);
      const bucket = (realCountsByVariant[run.variantRef.variantId] ??= { realRuns: 0, scriptedRuns: 0, skippedRuns: 0, pass: 0, fail: 0, error: 0 });
      if (meta?.skipped) {
        bucket.skippedRuns += 1;
        skipped += 1;
      } else if (meta?.real) {
        bucket.realRuns += 1;
        if (run.outcome === 'PASS') realCompleted += 1;
        else realFailed += 1;
      } else {
        bucket.scriptedRuns += 1;
        scripted += 1;
      }
      if (run.outcome === 'PASS') bucket.pass += 1;
      else if (run.outcome === 'FAIL') bucket.fail += 1;
      else bucket.error += 1;

      const isReal = meta?.real && !meta?.skipped;
      for (const id of TOKEN_IDS) {
        const measurement = run.measurements.find((candidate) => candidate.metricId === id);
        if (measurement?.state === 'known') tokenAvailability[id].known += 1;
        else tokenAvailability[id].unavailable += 1;
      }
      if (run.outcome !== 'PASS' && !meta?.skipped) {
        failures.push({
          experimentId: result.experiment.experimentId,
          variantId: run.variantRef.variantId,
          orderIndex: run.provenance.orderIndex,
          outcome: run.outcome,
          failureClassification: run.failureClassification,
          validatorVerdicts: run.validatorVerdicts,
          real: isReal === true,
        });
      }
    }
    return {
      experimentId: result.experiment.experimentId,
      objective: result.experiment.objective,
      scenarioId: result.scenario.scenarioId,
      classification: result.scenario.classification,
      variantStats: result.evaluation.variantStats,
      warnings: result.evaluation.warnings,
      pareto: result.evaluation.pareto,
      pairwise: result.evaluation.pairwise,
      sampleSize: result.evaluation.sampleSize,
      realCountsByVariant,
    };
  });

  const summary = {
    generatedAt: nowIso(),
    runPolicy: RUN_POLICY,
    budgetMs: CAMPAIGN_BUDGET_MS,
    elapsedMs: Date.now() - campaignStart,
    database: OM_PATH,
    bundle: BUNDLE_PATH,
    counts: { realCompleted, realFailed, scripted, skipped, totalRuns: experimentSummaries.reduce((acc, item) => acc + item.variantStats.reduce((a, v) => a + v.runs, 0), 0) },
    tokenMetricAvailability: tokenAvailability,
    failures,
    experiments: experimentSummaries,
  };
  writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));

  store.close();
  process.stdout.write(`\n[campaign] summary -> ${SUMMARY_PATH}\n`);
  process.stdout.write(JSON.stringify({ counts: summary.counts, tokenMetricAvailability: summary.tokenMetricAvailability, pareto: summary.experiments.map((e) => ({ experimentId: e.experimentId, pareto: e.pareto.frontier, warnings: e.warnings })) }, null, 2) + '\n');
  return summary;
}

if (process.env.G10R_SELF_TEST === '1') {
  for (const kind of ['SINGLE_LOCUS', 'REASONING_CELL']) {
    const execution = reasoningCellExecution({ seed: 20260914, orderIndex: 0, variant: { kind } });
    process.stdout.write(`[self-test] ${kind} -> ${execution.outcome} ${JSON.stringify(execution.measurements.map((m) => [m.metricId, m.state === 'known' ? (m.value ?? m.text) : m.state]))}\n`);
  }
  process.exit(0);
}

main().then(
  () => process.exit(0),
  (error) => {
    process.stderr.write(`[campaign] FATAL ${error?.stack ?? String(error)}\n`);
    process.exit(1);
  },
);
