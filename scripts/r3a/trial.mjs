#!/usr/bin/env node
/**
 * R3-A0 §10/§11/§15 — ONE BASELINE QUALIFICATION TRIAL.
 *
 * §10: this harness is TREATMENT-INDEPENDENT. It runs with
 *
 *   NO capital selected
 *   NO inherited-capital index
 *   NO metadata preview
 *   NO controlled prework
 *
 * so the only thing measured is the model's own baseline behaviour on the fixture. §20 forbids using the
 * eventual treatment arm to qualify a benchmark; this is the other side of that rule.
 *
 * WHAT ONE TRIAL DOES
 *
 *   Phase 0  build the world from the frozen fixture revision and record its content digest
 *   Phase 1  drive the REAL DSH stochastic worker under the frozen model route and the COMMON renderer (§9)
 *   Phase 2  read the session artifact and the committed source
 *   Phase 3  judge the candidate per FAILURE CLASS against the fixture's own hidden acceptance
 *   Phase 4  write the trial record
 *
 * §5/§15: the fixture is not modified between runs. The only per-trial difference is the model session.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { dshBin, dshHome, installHostBundle } from '../gates/env.mjs';
import { SCENARIOS } from '../r2u/scenarios.mjs';
import { FIXTURE_SPECS } from './fixture-content.mjs';
import { MODEL_ROUTES } from './models.mjs';
import { CAPITAL_RELATIONSHIPS } from './capital.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, '').split('=');
  return [key, rest.join('=')];
}));
const FIXTURE_ID = String(args.get('fixture') ?? '');
const MODEL_ID = String(args.get('model') ?? '');
const REPETITION = Number(args.get('repetition') ?? '0');
const RIG = args.get('rig');
const SPEC = FIXTURE_SPECS.find((entry) => entry.fixtureId === FIXTURE_ID);
const ROUTE = MODEL_ROUTES.find((entry) => entry.modelId === MODEL_ID);
if (SPEC === undefined) throw new Error(`--fixture must name a frozen fixture: ${FIXTURE_SPECS.map((entry) => entry.fixtureId).join(', ')}`);
if (ROUTE === undefined) throw new Error(`--model must name a frozen model route: ${MODEL_ROUTES.map((entry) => entry.modelId).join(', ')}`);
if (typeof RIG !== 'string' || RIG === '') throw new Error('--rig=<dir> is required');

const TRIAL_ID = `${SPEC.name}-${ROUTE.routeId}-q${String(REPETITION)}`;
const DIR = join(RIG, TRIAL_ID);
const PROJECT = join(DIR, 'repo');
const STATE = join(DIR, 'state');
const HOME = join(DIR, 'home');
const OUT = join(DIR, 'out');
const SCRATCH = join(DIR, 'judge');
const PROFILE = `r3a${SPEC.name.slice(-1).toLowerCase()}${ROUTE.routeId.replace(/[^a-z0-9]/gu, '').slice(0, 8)}${String(REPETITION)}`;
const REAL_DSH = dshHome();
const DSH_BIN = dshBin();
const TEE = new URL('../gates/d2-live-tee-worker.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const WORKER_TIMEOUT_MS = 1_800_000;

const git = (cwd, list) => execFileSync('git', [...list], { cwd, encoding: 'utf8' }).trim();

const advanced = await import(new URL(`file:///${join(REPO_ROOT, 'dist', 'src', 'advanced.js').replace(/\\/gu, '/')}`).href);
const delegation = await import(new URL(`file:///${join(REPO_ROOT, 'dist', 'src', 'interaction', 'work_delegation.js').replace(/\\/gu, '/')}`).href);
const workWorker = await import(new URL(`file:///${join(REPO_ROOT, 'dist', 'src', 'deployment', 'work_worker.js').replace(/\\/gu, '/')}`).href);

/** §4/§5: build the world from the fixture spec's own bytes, exactly as `construct-fixtures.mjs` wrote them. */
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

/** §6: PROVE the hidden acceptance is unreachable from the world, by CONTENT and not by layout. */
function assertOracleInaccessible() {
  const needles = SPEC.hiddenNeedles;
  const acceptanceText = SPEC.files['acceptance.mjs'];
  const found = [];
  const walk = (dir, prefix) => {
    for (const entry of execFileSync('git', ['ls-files'], { cwd: dir, encoding: 'utf8' }).trim().split('\n').filter((line) => line !== '')) {
      const text = readFileSync(join(dir, entry), 'utf8');
      for (const needle of needles) if (acceptanceText.includes(needle) && text.includes(needle)) found.push(`${prefix}${entry}:${needle}`);
    }
  };
  walk(PROJECT, '');
  if (found.length > 0) throw new Error(`§6 VIOLATION: the hidden acceptance is reachable from the world at ${found.join(', ')}`);
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

/* ---------------------------------------------------------------- §10 the treatment-independent run */

mkdirSync(join(HOME, 'profiles', PROFILE), { recursive: true });
installHostBundle({ repo: REPO_ROOT, realDshHome: REAL_DSH });
execFileSync('cmd', ['/c', 'mklink', '/J', `${HOME.replace(/\//gu, '\\')}\\profiles\\node_modules`, `${REAL_DSH.replace(/\//gu, '\\')}\\profiles\\node_modules`], { stdio: 'ignore' });
/** §9: the SAME settings shape for every model family — the route is the only difference. */
writeFileSync(join(HOME, 'settings.yaml'), ['agent-default-model:', `  provider: ${ROUTE.providerId}`, `  model: ${ROUTE.modelId}`, 'locale:', '  preference: en', ''].join('\n'));
copyFileSync(join(REAL_DSH, '.credentials.yaml'), join(HOME, '.credentials.yaml'));
writeFileSync(
  join(HOME, 'profiles', PROFILE, 'package.json'),
  `${JSON.stringify({ name: `dsh-profile-${PROFILE}`, private: true, dependencies: {}, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'palimpsest-dsh-host'], patchReload: 'startup' } } }, null, 2)}\n`,
);
/**
 * §9: THE COMMON RENDERER AND THE FROZEN MODEL ROUTE. Every model family runs this SAME profile shape; the
 * only difference is the provider route the settings name. No family-specific prompt tuning exists here.
 */
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
/** §23 (R2-S): the control payload goes to the SYSTEM TEMP tree, never anywhere a worker can walk to. */
const payloadSink = join(tmpdir(), `palimpsest-r3a-control-${TRIAL_ID}.json`);
const previousHome = process.env.DSH_HOME;
process.env.DSH_HOME = HOME;
process.env.PALIMPSEST_REAL_DSH_BIN = DSH_BIN;
process.env.PALIMPSEST_LIVE_GATE_TRANSCRIPT = transcript;

const record = {
  schemaVersion: 1,
  stage: 'R3-A0',
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
  /** §9: the renderer record every trial carries. */
  renderer: { rendererId: 'dsh-common-worker', rendererVersion: 1, familySpecific: false },
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
      standard: { statement: 'the visible oracle passes', clauses: [{ kind: 'scope_respected' }], derivedFrom: ['r3-a0 fixture'], confirmed: true, notes: [] },
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
   * §10: NO CAPITAL. The job is started with `expectedTaskId` only — no `knowledge` selection, so the
   * compile binds nothing, no index section is composed, and no prework runs.
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

  if (existsSync(payloadSink)) {
    const payload = JSON.parse(readFileSync(payloadSink, 'utf8'));
    record.prompt = {
      compiledHandleCount: (payload?.context?.compiled?.handles ?? []).length,
      indexHandleCount: (typeof payload?.contextIndexText === 'string' ? payload.contextIndexText : '').split(String.fromCharCode(10)).filter((line) => line.includes('@ctx/')).length,
      toolCatalogDigest: (await import('node:crypto')).createHash('sha256').update(JSON.stringify([payload?.contextPullTool?.name ?? null, payload?.resultTool?.name ?? null]), 'utf8').digest('hex'),
    };
  }

  if (existsSync(transcript)) {
    const text = readFileSync(transcript, 'utf8');
    const lines = text.split(/\r?\n/u);
    const outcomeLine = lines.filter((line) => line.startsWith('PALIMPSEST_WORK_RESULT')).pop() ?? '';
    const capacityLine = lines.filter((line) => line.startsWith('PALIMPSEST_WORKER_CAPACITY')).pop() ?? '';
    const boundaryLine = lines.filter((line) => line.startsWith('PALIMPSEST_WORKER_READ_BOUNDARY')).pop() ?? '';
    record.worker = {
      outcomeKind: /"kind":"([A-Z_]+)"/u.exec(outcomeLine)?.[1] ?? 'UNKNOWN',
      escalationReason: /"reason":"((?:[^"\\]|\\.)*)"/u.exec(outcomeLine)?.[1]?.slice(0, 400) ?? '',
      transcriptBytes: Buffer.byteLength(text, 'utf8'),
    };
    record.confidentiality = {
      capacity: capacityLine === '' ? null : JSON.parse(capacityLine.slice(capacityLine.indexOf('{'))),
      boundary: boundaryLine === '' ? null : JSON.parse(boundaryLine.slice(boundaryLine.indexOf('{'))),
    };
  }

  /* -- phase 3: judge the candidate per FAILURE CLASS ------------------------- */
  const world = view.attemptId === undefined || view.attemptId === null ? null : (() => { try { return installed.controller.observeAttemptResult(view.attemptId); } catch { return null; } })();
  record.worldObserved = world !== null && world !== undefined;
  if (world !== null && world !== undefined) {
    const workDir = world.workDir;
    record.workDir = workDir;
    const source = git(workDir, ['show', `HEAD:${SPEC.sourceFile}`]);
    writeFileSync(join(OUT, 'final-source.txt'), source, 'utf8');
    record.sourceBytes = Buffer.byteLength(source, 'utf8');

    /** §11: judge against the fixture's OWN hidden acceptance, in a scratch tree holding only the candidate. */
    const scratch = join(SCRATCH, 'final');
    rmSync(scratch, { recursive: true, force: true });
    mkdirSync(join(scratch, 'src'), { recursive: true });
    writeFileSync(join(scratch, SPEC.sourceFile), source, 'utf8');
    /** The acceptance module is imported from a temp copy OUTSIDE the world, never from inside it. */
    const acceptanceCopy = join(SCRATCH, `${SPEC.name}-acceptance.mjs`);
    writeFileSync(acceptanceCopy, SPEC.files['acceptance.mjs'], 'utf8');
    const acceptanceModule = await import(new URL(`file:///${acceptanceCopy.replace(/\\/gu, '/')}`).href);
    const candidate = await import(new URL(`file:///${join(scratch, SPEC.sourceFile).replace(/\\/gu, '/')}?v=${String(Date.now())}`).href);
    const cases = SPEC.fixtureId.includes('f-a') ? acceptanceModule.FA_CASES : acceptanceModule.FB_CASES;
    const judgement = acceptanceModule.runCases(candidate[SPEC.exportName], cases);

    const classIds = SPEC.fixtureId.includes('f-a') ? acceptanceModule.FA_CLASSES.map((entry) => entry.id) : acceptanceModule.FB_CLASSES.map((entry) => entry.id);
    /** §11: the failure-class vector — one boolean per class, a class passing only if EVERY case of it passed. */
    record.classPass = Object.fromEntries(classIds.map((classId) => [classId, judgement.results.filter((result) => result.failureClass === classId).every((result) => result.pass)]));
    record.classDetail = Object.fromEntries(classIds.map((classId) => [classId, judgement.results.filter((result) => result.failureClass === classId).map((result) => ({ id: result.id, pass: result.pass, detail: result.failureClass_detail ?? null }))]));
    record.finalAcceptance = { passed: judgement.passed, total: judgement.total, failures: judgement.results.filter((result) => !result.pass).map((result) => `${result.id}:${result.failureClass_detail ?? 'FAIL'}`) };
    record.unclassifiedFailures = judgement.results.filter((result) => !result.pass && result.failureClass === 'UNKNOWN').length;
    record.classCoverage = classIds.filter((classId) => record.classPass[classId]).length / classIds.length;
  } else {
    record.finalAcceptance = { passed: 0, total: 0, failures: ['NO_WORLD'] };
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

writeFileSync(join(OUT, 'trial.json'), JSON.stringify(record, null, 2), 'utf8');
const covered = Object.values(record.classPass).filter(Boolean).length;
const shown = (value) => (value === null || value === undefined ? 'NONE' : String(value));
process.stdout.write(`${TRIAL_ID} phase=${record.jobPhase ?? 'HOST_ERROR'} classes=${String(covered)}/${String(Object.keys(record.classPass).length)} final=${shown(record.finalAcceptance?.passed)}/${shown(record.finalAcceptance?.total)} model=${ROUTE.modelId}${record.hostFailure === null ? '' : ' HOST_FAILURE'}\n`);
process.exit(0);
