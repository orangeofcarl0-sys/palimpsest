#!/usr/bin/env node
/**
 * R3-A2 §"No primary-fixture smoke" — THE DUMMY-FIXTURE PLUMBING CHECK.
 *
 * §"No primary-fixture smoke" requires plumbing tests to use DUMMY FIXTURES ONLY, and forbids running F-C or
 * F-D before the frozen schedule. This script drives one real DSH worker against a throwaway fixture that is
 * NOT in the portfolio registry, purely to prove the route, the profile, the credential plane and the tool
 * surface still work before the 20-run budget is spent.
 *
 * It writes NOTHING into research-evidence/ and produces NO qualification record: a dummy run is not a trial
 * and cannot contribute to Nq.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { dshBin, dshHome, installHostBundle } from '../gates/env.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const MODEL_ID = String(process.argv[2] ?? 'deepseek-flash');
const RIG = join(homedir(), '.palimpsest-r3a2', 'dummy', MODEL_ID);
const DIR = join(RIG, 'run');
const PROJECT = join(DIR, 'repo');
const STATE = join(DIR, 'state');
const HOME = join(DIR, 'home');
const PROFILE = `r3a2dummy${MODEL_ID.replace(/[^a-z0-9]/gu, '').slice(0, 10)}`;

const ROUTES = {
  'deepseek-flash': { providerId: 'deepseek-route', apiKeyEnv: 'DEEPSEEK_API_KEY', api: 'openai-completions', baseURL: 'https://api.deepseek.com', displayName: 'DeepSeek Flash' },
  'glm-5.3-flash': { providerId: 'omnigate', apiKeyEnv: 'CA2A_API_KEY', api: 'openai-completions', baseURL: 'http://127.0.0.1:7866/v1', displayName: 'GLM 5.3 Flash' },
};
const ROUTE = ROUTES[MODEL_ID];
if (ROUTE === undefined) throw new Error(`unknown sentinel model ${MODEL_ID}`);

const REAL_DSH = dshHome();
const DSH_BIN = dshBin();
const TEE = new URL('../gates/d2-live-tee-worker.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const NL = String.fromCharCode(10);

rmSync(PROJECT, { recursive: true, force: true });
mkdirSync(join(PROJECT, 'src'), { recursive: true });
mkdirSync(join(PROJECT, 'test'), { recursive: true });
writeFileSync(join(PROJECT, 'README.md'), ['# dummy', '', 'Set `answer` in src/dummy.mjs to 42.', ''].join(NL), 'utf8');
writeFileSync(join(PROJECT, 'src', 'dummy.mjs'), `export const answer = 0;${NL}`, 'utf8');
writeFileSync(join(PROJECT, 'test', 'check.js'), ['import { answer } from "../src/dummy.mjs";', 'if (answer !== 42) throw new Error("answer must be 42");', 'process.stdout.write("ok" + String.fromCharCode(10));', ''].join(NL), 'utf8');
writeFileSync(join(PROJECT, 'package.json'), `${JSON.stringify({ name: 'dummy', private: true, type: 'module', scripts: { test: 'node test/check.js' } }, null, 2)}${NL}`, 'utf8');
execFileSync('git', ['init', '-q'], { cwd: PROJECT });
execFileSync('git', ['add', '-A'], { cwd: PROJECT });
execFileSync('git', ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'H0'], { cwd: PROJECT });
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: PROJECT, encoding: 'utf8' }).trim();

mkdirSync(join(HOME, 'profiles', PROFILE), { recursive: true });
installHostBundle({ repo: REPO_ROOT, realDshHome: REAL_DSH });
execFileSync('cmd', ['/c', 'mklink', '/J', `${HOME.replace(/\//gu, '\\')}\\profiles\\node_modules`, `${REAL_DSH.replace(/\//gu, '\\')}\\profiles\\node_modules`], { stdio: 'ignore' });
writeFileSync(join(HOME, 'settings.yaml'), ['agent-default-model:', `  provider: ${ROUTE.providerId}`, `  model: ${MODEL_ID}`, 'locale:', '  preference: en', ''].join(NL));
copyFileSync(join(REAL_DSH, '.credentials.yaml'), join(HOME, '.credentials.yaml'));
writeFileSync(join(HOME, 'profiles', PROFILE, 'package.json'), `${JSON.stringify({ name: `dsh-profile-${PROFILE}`, private: true, dependencies: {}, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'palimpsest-dsh-host'], patchReload: 'startup' } } }, null, 2)}${NL}`);
writeFileSync(join(HOME, 'profiles', PROFILE, 'cordis.patch.yml'), [
  '- id: llm-pi-ai', '  name: "@deepseek-ai/dsh-llm-pi-ai"', '  config:', '    providers:', `      ${ROUTE.providerId}:`,
  `        displayName: ${ROUTE.displayName}`, `        apiKeyEnv: ${ROUTE.apiKeyEnv}`, `        api: ${ROUTE.api}`, `        baseURL: ${ROUTE.baseURL}`,
  '        models:', `          - id: ${MODEL_ID}`, `            name: ${ROUTE.displayName}`, '            contextWindow: 131072', '            maxTokens: 8192', '',
  '- id: palimpsest-tools', '  config:', `    palimpsestEntry: '${REPO_ROOT}/dist/src/advanced.js'`,
  `    deploymentProfile: '${join(HOME, 'profiles', PROFILE, 'deployment.json')}'`, '    serve: false', '    openDashboard: false', '',
].join(NL));
writeFileSync(join(HOME, 'profiles', PROFILE, 'deployment.json'), `${JSON.stringify({ schemaVersion: 1, profileId: PROFILE, projectId: 'r3a2-dummy', localPeer: `${PROFILE}-peer`, persistentPoint: `pp-${PROFILE}`, repository: PROJECT, transport: { namespace: PROFILE, databasePath: join(STATE, 'transport.sqlite') }, databases: { orchestration: join(STATE, 'orchestration.sqlite'), ordarium: join(STATE, 'ordarium.sqlite'), coordination: join(STATE, 'coordination.sqlite'), transportCursors: join(STATE, 'cursors.sqlite') }, reasoning: {}, execution: 'worktree', concurrency: 1, policy: { allowed_commands: [{ executable: 'node', argv_prefix: ['test/check.js'] }] }, standard: { statement: 'the visible oracle passes' } }, null, 2)}${NL}`);

const transcript = join(DIR, 'worker-transcript.txt');
process.env.DSH_HOME = HOME;
process.env.PALIMPSEST_REAL_DSH_BIN = DSH_BIN;
process.env.PALIMPSEST_LIVE_GATE_TRANSCRIPT = transcript;

const advanced = await import(new URL(`file:///${join(REPO_ROOT, 'dist', 'src', 'advanced.js').replace(/\\/gu, '/')}`).href);
const delegation = await import(new URL(`file:///${join(REPO_ROOT, 'dist', 'src', 'interaction', 'work_delegation.js').replace(/\\/gu, '/')}`).href);
const workWorker = await import(new URL(`file:///${join(REPO_ROOT, 'dist', 'src', 'deployment', 'work_worker.js').replace(/\\/gu, '/')}`).href);

const installed = advanced.installPalimpsest(
  { tools: { register: () => () => undefined } },
  {
    projectId: 'r3a2-dummy',
    databasePath: join(STATE, 'orchestration.sqlite'),
    ordariumDatabasePath: join(STATE, 'ordarium.sqlite'),
    repository: PROJECT,
    execution: 'worktree',
    standard: { statement: 'the visible oracle passes', clauses: [{ kind: 'scope_respected' }], derivedFrom: ['r3a2 dummy'], confirmed: true, notes: [] },
    policy: advanced.trustedDefaultPolicy({ read_paths: ['src', 'test', 'README.md'], allowed_commands: [{ executable: 'node', argv_prefix: ['test/check.js'] }] }),
  },
);
installed.controller.start({ projectId: 'r3a2-dummy', goal: 'make the dummy oracle pass', headCommit: head, tasks: [{ task_id: 't1', objective: 'set answer to 42', depends_on: [], write_paths: ['src/dummy.mjs'], required_artifacts: [] }] });
const service = delegation.makeWorkDelegationService({
  controller: installed.controller,
  workerFor: () => {
    const port = workWorker.dshSubprocessWorkWorkerPort({ dshBin: TEE, profile: PROFILE, timeoutMs: 600_000 });
    return { adapterId: port.adapterId, run: (input) => port.run(input) };
  },
});
const job = await service.start({ expectedTaskId: 't1' });
let view = await service.followup({ jobId: job.jobId });
for (let i = 0; i < 1_200 && (view.phase === 'QUEUED' || view.phase === 'RUNNING'); i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  view = await service.followup({ jobId: job.jobId });
}
const text = existsSync(transcript) ? readFileSync(transcript, 'utf8') : '';
const actionLine = text.split(/\r?\n/u).filter((line) => line.startsWith('PALIMPSEST_WORKER_ACTIONS')).pop() ?? '';
let finalSource = null;
try {
  const world = installed.controller.observeAttemptResult(view.attemptId);
  finalSource = execFileSync('git', ['show', 'HEAD:src/dummy.mjs'], { cwd: world.workDir, encoding: 'utf8' }).trim();
} catch { /* no world */ }
await installed.dispose().catch(() => undefined);
process.stdout.write(`${MODEL_ID} dummy phase=${view.phase} actions=${actionLine.slice(actionLine.indexOf('{'), actionLine.indexOf('{') + 90)}${NL}`);
process.stdout.write(`  final dummy source: ${JSON.stringify(finalSource)}${NL}`);
