#!/usr/bin/env node
/**
 * R3-L0 §27 — THE DUMMY-FIXTURE PLUMBING CHECK.
 *
 * §27 requires dummy runtime fixtures for plumbing checks and forbids running a G1/G2/G3 project worker before
 * the frozen plan commit. This script drives ONE real DSH worker through a throwaway project that is NOT the
 * experimental family, purely to prove the NEW harness works before the 24-session budget is committed:
 *
 *   · the child-process spawn and its durable re-attachment;
 *   · the real model route and the shipped worker port;
 *   · the model-visible payload and its governed pull;
 *   · the ordinary gate -> promotion -> reconciliation path.
 *
 * It writes NOTHING into research-evidence and produces no trajectory record: a dummy run is not a session and
 * cannot contribute to N.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { dshBin } from '../gates/env.mjs';
import { CHILD_PROGRAM, TEE_PATH, makeProfile, trajectoryPaths, trajectoryRoot } from './trajectory.mjs';
import { REPO_ROOT, sha256 } from './envelope.mjs';

const NL = String.fromCharCode(10);

/** The dummy project: deliberately trivial, and NOT the experimental family. */
const DUMMY_SOURCE = ['/** A dummy module. Set `answer` to 42. */', 'export const answer = 0;', ''].join(NL);
const DUMMY_ORACLE = ['import assert from "node:assert/strict";', 'import { answer } from "../src/dummy.mjs";', 'assert.equal(answer, 42, "answer must be 42");', 'process.stdout.write("ok" + String.fromCharCode(10));', ''].join(NL);

export async function dummyPlumbingCheck(route, label) {
  const root = trajectoryRoot(`dummy-${label}`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  const repo = join(root, 'repo');
  mkdirSync(join(repo, 'src'), { recursive: true });
  mkdirSync(join(repo, 'test'), { recursive: true });
  writeFileSync(join(repo, 'README.md'), '# dummy' + NL, 'utf8');
  writeFileSync(join(repo, 'src', 'dummy.mjs'), DUMMY_SOURCE, 'utf8');
  writeFileSync(join(repo, 'test', 'check.js'), DUMMY_ORACLE, 'utf8');
  writeFileSync(join(repo, 'package.json'), `${JSON.stringify({ name: 'r3l0-dummy', private: true, type: 'module', scripts: { test: 'node test/check.js' } }, null, 2)}${NL}`, 'utf8');
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['add', '-A'], { cwd: repo });
  execFileSync('git', ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'H0'], { cwd: repo });

  const home = join(root, 'home');
  mkdirSync(home, { recursive: true });
  const profile = makeProfile(home, route, `r3l0dummy${label}`);
  const paths = trajectoryPaths(root);

  const specPath = join(root, 'spec.json');
  const reportPath = join(root, 'report.json');
  const payloadSink = join(root, 'payload.json');
  const transcript = join(root, 'transcript.txt');

  /**
   * The dummy spec drives the SAME child program the experiment uses, but with the project's own trivial
   * requirement and a one-line edit. The child cannot tell the difference, which is the point: if the harness
   * is broken, this fails.
   */
  writeFileSync(specPath, JSON.stringify({
    repoRoot: REPO_ROOT,
    projectId: 'r3l0-dummy',
    repo,
    paths,
    profile,
    teePath: TEE_PATH,
    payloadSink,
    transcript,
    workRoot: root,
    reportPath,
    realDshBin: dshBin(),
    dshHome: home,
    arm: 'PLUMBING',
    block: 0,
    generation: 'DUMMY',
    requirement: 'Set `answer` in src/dummy.mjs to 42.',
    objective: 'set answer to 42',
    projectGoal: 'make the dummy oracle pass',
    /** §7: the plumbing check also exercises the CAPITALIZED path shape, with no real capital. */
    knowledge: null,
    standard: { statement: 'the visible oracle passes', clauses: [{ kind: 'scope_respected' }], derivedFrom: ['r3l0 dummy'], confirmed: true, notes: [] },
    supportFiles: {},
  }, null, 2), 'utf8');

  /**
   * The dummy project has no ledger, so the child's own requirement/planning path would not apply. Instead the
   * child is given a `seed` step: this check drives the SAME worker port, payload capture and governed pull, and
   * skips only the ledger-specific planning.
   */
  const seedPath = join(root, 'seed.json');
  writeFileSync(seedPath, JSON.stringify({
    repoRoot: REPO_ROOT,
    projectId: 'r3l0-dummy',
    repo,
    paths,
    profile,
    teePath: TEE_PATH,
    payloadSink,
    transcript,
    reportPath,
    realDshBin: dshBin(),
    dshHome: home,
    taskId: 'dummy-task',
    requirement: 'Set `answer` in src/dummy.mjs to 42.',
    objective: 'set answer to 42',
    projectGoal: 'make the dummy oracle pass',
    writePaths: ['src/dummy.mjs'],
    standard: { statement: 'the visible oracle passes', clauses: [{ kind: 'scope_respected' }], derivedFrom: ['r3l0 dummy'], confirmed: true, notes: [] },
  }, null, 2), 'utf8');

  const output = execFileSync(process.execPath, [join(REPO_ROOT, 'scripts', 'r3l0', 'dummy-child.mjs'), seedPath], {
    cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, timeout: 900_000,
  });
  const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
  return Object.freeze({
    label,
    route: route.modelId,
    modelFamily: route.modelFamily,
    ok: report?.ok === true,
    phase: report?.jobPhase ?? null,
    hostError: report?.hostError ?? null,
    sourceAfter: report?.source ?? null,
    visibleOracle: report?.visibleOracle ?? null,
    payloadHandles: report?.payload?.compiledHandleCount ?? null,
    transcriptBytes: report?.transcriptBytes ?? null,
    stdout: output.trim().split(NL).slice(-3).join(' | '),
  });
}

/** The routes §13 considers, in the ruling's preference order. */
export const SENTINEL_ROUTES = Object.freeze([
  Object.freeze({ routeId: 'deepseek-direct', providerId: 'deepseek-route', modelId: 'deepseek-flash', displayName: 'DeepSeek Flash', modelFamily: 'deepseek', api: 'openai-completions', baseURL: 'https://api.deepseek.com', apiKeyEnv: 'DEEPSEEK_API_KEY', contextWindow: 131072, maxTokens: 8192 }),
  Object.freeze({ routeId: 'glm-via-omnigate', providerId: 'omnigate', modelId: 'glm-5.3-flash', displayName: 'GLM 5.3 Flash', modelFamily: 'glm', api: 'openai-completions', baseURL: 'http://127.0.0.1:7866/v1', apiKeyEnv: 'CA2A_API_KEY', contextWindow: 131072, maxTokens: 8192 }),
]);

async function main() {
  const results = [];
  for (const route of SENTINEL_ROUTES) {
    process.stdout.write(`--- dummy plumbing: ${route.modelId} ---${NL}`);
    try {
      const result = await dummyPlumbingCheck(route, route.modelFamily);
      results.push(result);
      process.stdout.write(`  ok=${String(result.ok)} phase=${String(result.phase)} oracle=${JSON.stringify(result.visibleOracle)} handles=${String(result.payloadHandles)}${NL}`);
      process.stdout.write(`  source after: ${JSON.stringify(result.sourceAfter)}${NL}`);
      if (result.hostError !== null) process.stdout.write(`  hostError: ${String(result.hostError).slice(0, 200)}${NL}`);
    } catch (error) {
      results.push({ label: route.modelFamily, route: route.modelId, ok: false, error: String(error?.message ?? error).slice(0, 300) });
      process.stdout.write(`  FAILED: ${String(error?.message ?? error).slice(0, 300)}${NL}`);
    }
  }
  const dir = join(REPO_ROOT, 'research-evidence', 'r3-l0');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'dummy-plumbing.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'R3-L0', kind: 'dummy-fixture plumbing check (§27)', contributesToN: false, results }, null, 2)}${NL}`, 'utf8');
  process.stdout.write(`${NL}dummy plumbing: ${String(results.filter((entry) => entry.ok).length)}/${String(results.length)} route(s) OK${NL}`);
  return results;
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}
