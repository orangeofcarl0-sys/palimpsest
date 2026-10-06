#!/usr/bin/env node
/**
 * R3-A2 §"Baseline condition"/§"Primary qualification evidence" — ONE SENTINEL QUALIFICATION TRIAL.
 *
 * §"Baseline condition": this harness is TREATMENT-INDEPENDENT and is the R3-A0 harness's baseline condition
 * reproduced for the two new families. Every worker receives
 *
 *   NO selected inherited capital
 *   NO project-capital index
 *   NO M1 preview
 *   NO host-mediated capital prework
 *
 * so the only thing measured is the model's own baseline behaviour on the fixture. The job is started with
 * `expectedTaskId` only — no `knowledge` selection — exactly as `scripts/r3a/trial.mjs` does.
 *
 * WHY THIS IS A COPY RATHER THAN A CALL INTO THE R3-A0 HARNESS. The R3-A0 trial script resolves its fixture
 * through the R3-A0 registry and branches on `fixtureId.includes('f-a')` to pick the oracle exports. Neither
 * works for F-C/F-D, and rewriting the R3-A0 script would change the harness digest the R3-A0 plan was frozen
 * against. So the R3-A2 harness is its own file with its own digest, and it reads the oracle generically.
 *
 * §"Primary qualification evidence": each trial records the failure-class vector, class coverage, full solve,
 * unclassified failures, visible-oracle invocations, tool/action counts, revisions, wall time, and — where
 * the provider exposes them — input/output/cached tokens. §"Experiment economics" forbids inventing a cost
 * value a provider did not report, so a cost is recorded ONLY when a route declares a price AND the trial
 * reported the tokens it applies to.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { dshBin, dshHome, installHostBundle } from '../gates/env.mjs';
import { COMBINED_SPECS, materialize, oracleOf } from './fixtures.mjs';
import { MODEL_ROUTES_SENTINEL, rendererRecordFor } from './models.mjs';
import { readSessionTelemetry } from './telemetry.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, '').split('=');
  return [key, rest.join('=')];
}));
const FIXTURE_ID = String(args.get('fixture') ?? '');
const MODEL_ID = String(args.get('model') ?? '');
const REPETITION = Number(args.get('repetition') ?? '0');
const RIG = args.get('rig');
const SPEC = COMBINED_SPECS.find((entry) => entry.fixtureId === FIXTURE_ID);
const ROUTE = MODEL_ROUTES_SENTINEL.find((entry) => entry.modelId === MODEL_ID);
if (SPEC === undefined) throw new Error(`--fixture must name a frozen fixture: ${COMBINED_SPECS.map((entry) => entry.fixtureId).join(', ')}`);
if (ROUTE === undefined) throw new Error(`--model must name a frozen sentinel route: ${MODEL_ROUTES_SENTINEL.map((entry) => entry.modelId).join(', ')}`);
if (typeof RIG !== 'string' || RIG === '') throw new Error('--rig=<dir> is required');

const TRIAL_ID = `${SPEC.name}-${ROUTE.routeId}-q${String(REPETITION)}`;
const DIR = join(RIG, TRIAL_ID);
const PROJECT = join(DIR, 'repo');
const STATE = join(DIR, 'state');
const HOME = join(DIR, 'home');
const OUT = join(DIR, 'out');
const SCRATCH = join(DIR, 'judge');
const PROFILE = `r3a2${SPEC.shortId ?? SPEC.name.slice(-1).toLowerCase()}${ROUTE.routeId.replace(/[^a-z0-9]/gu, '').slice(0, 8)}${String(REPETITION)}`;
const REAL_DSH = dshHome();
const DSH_BIN = dshBin();
const TEE = new URL('../gates/d2-live-tee-worker.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const WORKER_TIMEOUT_MS = 1_800_000;

const git = (cwd, list) => execFileSync('git', [...list], { cwd, encoding: 'utf8' }).trim();

const advanced = await import(new URL(`file:///${join(REPO_ROOT, 'dist', 'src', 'advanced.js').replace(/\\/gu, '/')}`).href);
const delegation = await import(new URL(`file:///${join(REPO_ROOT, 'dist', 'src', 'interaction', 'work_delegation.js').replace(/\\/gu, '/')}`).href);
const workWorker = await import(new URL(`file:///${join(REPO_ROOT, 'dist', 'src', 'deployment', 'work_worker.js').replace(/\\/gu, '/')}`).href);

/** §"Failure-class requirements": build the world from the fixture spec's own bytes. */
function buildWorld() {
  rmSync(PROJECT, { recursive: true, force: true });
  mkdirSync(PROJECT, { recursive: true });
  for (const [relative, content] of Object.entries(SPEC.files)) {
    if (relative.endsWith('acceptance.mjs')) continue; // the hidden oracle is NEVER copied into a world
    const target = join(PROJECT, relative);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  execFileSync('git', ['init', '-q'], { cwd: PROJECT });
  execFileSync('git', ['add', '-A'], { cwd: PROJECT });
  execFileSync('git', ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'H0'], { cwd: PROJECT });
  return git(PROJECT, ['rev-parse', 'HEAD']);
}

/** Prove the hidden acceptance is unreachable from the world, by CONTENT and not by layout. */
function assertOracleInaccessible() {
  const needles = SPEC.hiddenNeedles;
  const acceptanceText = SPEC.files[SPEC.acceptanceFile];
  const found = [];
  for (const entry of git(PROJECT, ['ls-files']).split('\n').filter((line) => line !== '')) {
    const text = readFileSync(join(PROJECT, entry), 'utf8');
    for (const needle of needles) if (acceptanceText.includes(needle) && text.includes(needle)) found.push(`${entry}:${needle}`);
  }
  if (found.length > 0) throw new Error(`VIOLATION: the hidden acceptance is reachable from the world at ${found.join(', ')}`);
  return Object.freeze({ checked: git(PROJECT, ['ls-files']).split('\n').filter((line) => line !== '').length, needles: [...needles] });
}

const started = Date.now();
mkdirSync(OUT, { recursive: true });
const head = buildWorld();
const inaccessible = assertOracleInaccessible();

const task = Object.freeze({
  task_id: 't1',
  objective: SPEC.taskObjective,
  depends_on: Object.freeze([]),
  write_paths: Object.freeze([SPEC.sourceFile]),
  required_artifacts: Object.freeze([]),
});

/* ---------------------------------------------------------------- §"Baseline condition" the run */

mkdirSync(join(HOME, 'profiles', PROFILE), { recursive: true });
installHostBundle({ repo: REPO_ROOT, realDshHome: REAL_DSH });
execFileSync('cmd', ['/c', 'mklink', '/J', `${HOME.replace(/\//gu, '\\')}\\profiles\\node_modules`, `${REAL_DSH.replace(/\//gu, '\\')}\\profiles\\node_modules`], { stdio: 'ignore' });
/** §"Common cognitive interface": the SAME settings shape for every family — the route is the only difference. */
writeFileSync(join(HOME, 'settings.yaml'), ['agent-default-model:', `  provider: ${ROUTE.providerId}`, `  model: ${ROUTE.modelId}`, 'locale:', '  preference: en', ''].join('\n'));
copyFileSync(join(REAL_DSH, '.credentials.yaml'), join(HOME, '.credentials.yaml'));
writeFileSync(
  join(HOME, 'profiles', PROFILE, 'package.json'),
  `${JSON.stringify({ name: `dsh-profile-${PROFILE}`, private: true, dependencies: {}, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'palimpsest-dsh-host'], patchReload: 'startup' } } }, null, 2)}\n`,
);
writeFileSync(
  join(HOME, 'profiles', PROFILE, 'cordis.patch.yml'),
  [
    '- id: llm-pi-ai',
    '  name: "@deepseek-ai/dsh-llm-pi-ai"',
    '  config:',
    '    providers:',
    `      ${ROUTE.providerId}:`,
    `        displayName: ${ROUTE.displayName}`,
    `        apiKeyEnv: ${ROUTE.apiKeyEnv}`,
    `        api: ${ROUTE.api}`,
    `        baseURL: ${ROUTE.baseURL}`,
    '        models:',
    `          - id: ${ROUTE.modelId}`,
    `            name: ${ROUTE.displayName}`,
    `            contextWindow: ${String(ROUTE.contextWindow)}`,
    `            maxTokens: ${String(ROUTE.maxTokens)}`,
    '',
    '- id: palimpsest-tools',
    '  config:',
    `    palimpsestEntry: '${REPO_ROOT}/dist/src/advanced.js'`,
    `    deploymentProfile: '${join(HOME, 'profiles', PROFILE, 'deployment.json')}'`,
    '    serve: false',
    '    openDashboard: false',
    '',
  ].join('\n'),
);
writeFileSync(
  join(HOME, 'profiles', PROFILE, 'deployment.json'),
  `${JSON.stringify({ schemaVersion: 1, profileId: PROFILE, projectId: SPEC.fixtureId, localPeer: `${PROFILE}-peer`, persistentPoint: `pp-${PROFILE}`, repository: PROJECT, transport: { namespace: PROFILE, databasePath: join(STATE, 'transport.sqlite') }, databases: { orchestration: join(STATE, 'orchestration.sqlite'), ordarium: join(STATE, 'ordarium.sqlite'), coordination: join(STATE, 'coordination.sqlite'), transportCursors: join(STATE, 'cursors.sqlite') }, reasoning: {}, execution: 'worktree', concurrency: 1, policy: { allowed_commands: [{ executable: 'node', argv_prefix: ['test/check.js'] }] }, standard: { statement: 'the visible oracle passes' } }, null, 2)}\n`,
);

const transcript = join(OUT, 'worker-transcript.txt');
/** The control payload goes to the SYSTEM TEMP tree, never anywhere a worker can walk to. */
const payloadSink = join(tmpdir(), `palimpsest-r3a2-control-${TRIAL_ID}.json`);
const previousHome = process.env.DSH_HOME;
process.env.DSH_HOME = HOME;
process.env.PALIMPSEST_REAL_DSH_BIN = DSH_BIN;
process.env.PALIMPSEST_LIVE_GATE_TRANSCRIPT = transcript;

const record = {
  schemaVersion: 1,
  stage: 'R3-A2',
  trialId: TRIAL_ID,
  fixtureId: SPEC.fixtureId,
  fixtureRevision: SPEC.fixtureRevision,
  fixtureName: SPEC.name,
  mechanismFamily: SPEC.mechanismFamily,
  modelId: ROUTE.modelId,
  modelFamily: ROUTE.modelFamily,
  providerId: ROUTE.providerId,
  routeId: ROUTE.routeId,
  repetition: REPETITION,
  /** §"Common cognitive interface": the renderer record every trial carries. */
  renderer: rendererRecordFor(ROUTE),
  capitalDelivered: false,
  worldHead: head,
  oracleInaccessible: inaccessible,
  classPass: {},
  finalAcceptance: { passed: null, total: null, failures: [], note: 'JUDGING_NOT_REACHED' },
};

let view;
let hostFailure = null;
try {
  const installed = advanced.installPalimpsest(
    { tools: { register: () => () => undefined } },
    {
      projectId: SPEC.fixtureId,
      databasePath: join(STATE, 'orchestration.sqlite'),
      ordariumDatabasePath: join(STATE, 'ordarium.sqlite'),
      repository: PROJECT,
      execution: 'worktree',
      standard: { statement: 'the visible oracle passes', clauses: [{ kind: 'scope_respected' }], derivedFrom: ['r3-a2 fixture'], confirmed: true, notes: [] },
      policy: advanced.trustedDefaultPolicy({ read_paths: ['src', 'test', 'README.md'], allowed_commands: [{ executable: 'node', argv_prefix: ['test/check.js'] }] }),
    },
  );
  installed.controller.start({ projectId: SPEC.fixtureId, goal: SPEC.projectGoal, headCommit: head, tasks: [task] });
  const service = delegation.makeWorkDelegationService({
    controller: installed.controller,
    workerFor: () => {
      const port = workWorker.dshSubprocessWorkWorkerPort({ dshBin: TEE, profile: PROFILE, timeoutMs: WORKER_TIMEOUT_MS });
      return {
        adapterId: port.adapterId,
        async run(input) {
          writeFileSync(payloadSink, JSON.stringify(workWorker.workWorkerEnvironmentPayload(input.context), null, 2), 'utf8');
          return await port.run(input);
        },
      };
    },
  });

  /**
   * §"Baseline condition": NO CAPITAL. The job is started with `expectedTaskId` only — no `knowledge`
   * selection, so the compile binds nothing, no index section is composed, and no prework runs.
   */
  const jobStarted = await service.start({ expectedTaskId: 't1' });
  record.jobId = jobStarted.jobId;
  view = await service.followup({ jobId: jobStarted.jobId });
  for (let i = 0; i < 6_000 && (view.phase === 'QUEUED' || view.phase === 'RUNNING'); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    view = await service.followup({ jobId: jobStarted.jobId });
  }
  record.jobPhase = view.phase;
  record.hostError = view.hostError ?? null;
  record.attemptId = view.attemptId ?? null;

  /* -- §"Common cognitive interface": the assembled prompt and tool-surface digests ---------------- */
  const crypto = await import('node:crypto');
  if (existsSync(payloadSink)) {
    const payload = JSON.parse(readFileSync(payloadSink, 'utf8'));
    record.prompt = {
      compiledHandleCount: (payload?.context?.compiled?.handles ?? []).length,
      indexHandleCount: (typeof payload?.contextIndexText === 'string' ? payload.contextIndexText : '').split(String.fromCharCode(10)).filter((line) => line.includes('@ctx/')).length,
      assembledPromptDigest: crypto.createHash('sha256').update(String(payload?.contextIndexText ?? ''), 'utf8').digest('hex'),
      toolSurfaceDigest: crypto.createHash('sha256').update(JSON.stringify({
        resultTool: payload?.resultTool?.name ?? null,
        contextPullTool: payload?.contextPullTool?.name ?? null,
        channel: payload?.contextPullChannel ?? null,
        allowedPullHandles: payload?.allowedPullHandles ?? [],
      }), 'utf8').digest('hex'),
    };
  }

  const lines = existsSync(transcript) ? readFileSync(transcript, 'utf8').split(/\r?\n/u) : [];
  const lineOf = (prefix) => lines.filter((line) => line.startsWith(prefix)).pop() ?? '';
  if (existsSync(transcript)) {
    const text = readFileSync(transcript, 'utf8');
    record.worker = {
      outcomeKind: /"kind":"([A-Z_]+)"/u.exec(lineOf('PALIMPSEST_WORK_RESULT'))?.[1] ?? 'UNKNOWN',
      escalationReason: /"reason":"((?:[^"\\]|\\.)*)"/u.exec(lineOf('PALIMPSEST_WORK_RESULT'))?.[1]?.slice(0, 400) ?? '',
      transcriptBytes: Buffer.byteLength(text, 'utf8'),
    };
    record.confidentiality = {
      capacity: lineOf('PALIMPSEST_WORKER_CAPACITY') === '' ? null : JSON.parse(lineOf('PALIMPSEST_WORKER_CAPACITY').slice(lineOf('PALIMPSEST_WORKER_CAPACITY').indexOf('{'))),
      boundary: lineOf('PALIMPSEST_WORKER_READ_BOUNDARY') === '' ? null : JSON.parse(lineOf('PALIMPSEST_WORKER_READ_BOUNDARY').slice(lineOf('PALIMPSEST_WORKER_READ_BOUNDARY').indexOf('{'))),
    };
    /** §"Primary qualification evidence": the tool/action counts, from the ordered action log. */
    const actionsLine = lineOf('PALIMPSEST_WORKER_ACTIONS');
    record.actions = actionsLine === '' ? null : JSON.parse(actionsLine.slice(actionsLine.indexOf('{')));
    const efficacyLine = lineOf('PALIMPSEST_WORKER_EFFICACY');
    const indexLine = lineOf('PALIMPSEST_WORKER_INDEX');
    const envLine = lineOf('PALIMPSEST_WORKER_ENV');
    /** §"Baseline condition": the treatment-independence proof, read from the worker's own telemetry. */
    record.treatmentIndependence = {
      efficacy: efficacyLine === '' ? null : JSON.parse(efficacyLine.slice(efficacyLine.indexOf('{'))),
      index: indexLine === '' ? null : JSON.parse(indexLine.slice(indexLine.indexOf('{'))),
      affordance: envLine === '' ? null : (JSON.parse(envLine.slice(envLine.indexOf('{'))).affordance ?? null),
      indexMode: envLine === '' ? null : (JSON.parse(envLine.slice(envLine.indexOf('{'))).index ?? null),
    };
  }

  /* -- phase 3: judge the candidate per FAILURE CLASS --------------------------------------------- */
  const world = view.attemptId === undefined || view.attemptId === null ? null : (() => { try { return installed.controller.observeAttemptResult(view.attemptId); } catch { return null; } })();
  record.worldObserved = world !== null && world !== undefined;
  if (world !== null && world !== undefined) {
    const workDir = world.workDir;
    record.workDir = workDir;
    const source = git(workDir, ['show', `HEAD:${SPEC.sourceFile}`]);
    writeFileSync(join(OUT, 'final-source.txt'), source, 'utf8');
    record.sourceBytes = Buffer.byteLength(source, 'utf8');
    record.revisions = git(workDir, ['rev-list', '--count', 'HEAD']).trim();

    /** §"Failure-class requirements": judge against the fixture's OWN hidden acceptance, from OUTSIDE the world. */
    const scratch = join(SCRATCH, 'final');
    rmSync(scratch, { recursive: true, force: true });
    mkdirSync(join(scratch, 'src'), { recursive: true });
    writeFileSync(join(scratch, SPEC.sourceFile), source, 'utf8');
    const acceptanceCopy = join(SCRATCH, `${SPEC.name}-acceptance.mjs`);
    writeFileSync(acceptanceCopy, SPEC.files[SPEC.acceptanceFile], 'utf8');
    const oracle = await oracleOf(SPEC, new URL(`file:///${acceptanceCopy.replace(/\\/gu, '/')}`).href);
    const candidate = await import(new URL(`file:///${join(scratch, SPEC.sourceFile).replace(/\\/gu, '/')}?v=${String(Date.now())}`).href);
    const judgement = oracle.runCases(candidate[SPEC.exportName], oracle.cases);

    /** §"Primary qualification evidence": the failure-class vector — one boolean per class. */
    record.classPass = Object.fromEntries(oracle.classIds.map((classId) => [classId, judgement.results.filter((result) => result.failureClass === classId).every((result) => result.pass)]));
    record.classDetail = Object.fromEntries(oracle.classIds.map((classId) => [classId, judgement.results.filter((result) => result.failureClass === classId).map((result) => ({ id: result.id, pass: result.pass, detail: result.failureClass_detail ?? null }))]));
    record.finalAcceptance = { passed: judgement.passed, total: judgement.total, failures: judgement.results.filter((result) => !result.pass).map((result) => `${result.id}:${result.failureClass_detail ?? 'FAIL'}`) };
    record.unclassifiedFailures = judgement.results.filter((result) => !result.pass && !oracle.classIds.includes(result.failureClass)).length;
    record.classCoverage = oracle.classIds.filter((classId) => record.classPass[classId]).length / oracle.classIds.length;
    record.fullSolve = judgement.passed === judgement.total;
  } else {
    record.finalAcceptance = { passed: 0, total: 0, failures: ['NO_WORLD'] };
    record.fullSolve = false;
  }
  await installed.dispose().catch(() => undefined);
} catch (error) {
  hostFailure = error?.stack ?? String(error);
} finally {
  if (previousHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = previousHome;
}

record.hostFailure = hostFailure;
record.timedOut = view !== undefined && (view.phase === 'QUEUED' || view.phase === 'RUNNING');
record.infrastructureInvalid = hostFailure !== null || record.timedOut === true;
record.elapsedMs = Date.now() - started;

/**
 * §"Primary qualification evidence": the provider-reported token counts, read from the durable session
 * artifact. §"Experiment economics": a cost is recorded ONLY when the route declares a price AND the tokens
 * it applies to were reported. A route with no declared price records `null` with the reason, never a guess.
 */
const telemetry = readSessionTelemetry(HOME, ROUTE);
record.usage = telemetry.usage;
record.cost = telemetry.cost;
record.usageNote = telemetry.note;

writeFileSync(join(OUT, 'trial.json'), JSON.stringify(record, null, 2), 'utf8');
const covered = Object.values(record.classPass).filter(Boolean).length;
const shown = (value) => (value === null || value === undefined ? 'NONE' : String(value));
process.stdout.write(`${TRIAL_ID} phase=${record.jobPhase ?? 'HOST_ERROR'} classes=${String(covered)}/${String(Object.keys(record.classPass).length)} final=${shown(record.finalAcceptance?.passed)}/${shown(record.finalAcceptance?.total)} model=${ROUTE.modelId}${record.hostFailure === null ? '' : ' HOST_FAILURE'}\n`);
process.exit(0);
