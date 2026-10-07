/**
 * R3-L0C §10/§23 — THE DUMMY PLUMBING CHECK.
 *
 * §10 requires the containment canaries before trial 1 and §23 forbids a primary-fixture smoke. So the plumbing —
 * the child-process spawn, the shipped worker port, the payload capture, the governed pull, the ordinary
 * gate/promotion path — is proven against a THROWAWAY project that is not the experimental family.
 *
 * It writes NOTHING into research-evidence and contributes nothing to N. A dummy run is not a session.
 *
 * WHY IT IS WORTH RUNNING AT ALL. Every one of these seams has failed silently before in this project: a missing
 * environment variable made a worker produce nothing, an unwired procedure store made a selected handle
 * unresolvable, and an absent reasoning policy made the capability disappear. A plumbing check is what turns
 * those from a lost primary session into a preflight failure.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { REPO_ROOT } from './contract.mjs';
import { containmentEnvironment } from './trajectory.mjs';

const NL = String.fromCharCode(10);

/** §10: the dummy project, deliberately trivial and NOT the experimental family. */
const DUMMY_SOURCE = ['/** A dummy module. Set `answer` to 42. */', 'export const answer = 0;', ''].join(NL);
const DUMMY_ORACLE = [
  'import assert from "node:assert/strict";',
  'import { answer } from "../src/dummy.mjs";',
  'assert.equal(answer, 42, "answer must be 42");',
  'process.stdout.write("ok" + String.fromCharCode(10));',
  '',
].join(NL);

/** §10: the dummy child, which drives ONE real worker through a throwaway world. */
const DUMMY_CHILD = [
  '#!/usr/bin/env node',
  'import { execFileSync } from "node:child_process";',
  'import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";',
  'import { join } from "node:path";',
  'import { pathToFileURL } from "node:url";',
  'const NL = String.fromCharCode(10);',
  'const spec = JSON.parse(readFileSync(process.argv[2], "utf8"));',
  'const DIST = join(spec.repoRoot, "dist", "src");',
  'const load = async (relative) => await import(pathToFileURL(join(DIST, relative)).href);',
  'process.env.PALIMPSEST_REAL_DSH_BIN = spec.realDshBin;',
  'process.env.PALIMPSEST_LIVE_GATE_TRANSCRIPT = spec.transcript;',
  'process.env.DSH_HOME = spec.dshHome;',
  'if (typeof spec.protectedRoots === "string" && spec.protectedRoots !== "") process.env.PALIMPSEST_WORKER_PROTECTED_ROOTS = spec.protectedRoots;',
  'const report = { schemaVersion: 1, stage: "R3-L0C", kind: "dummy plumbing child", pid: process.pid, steps: [] };',
  'let installed = null;',
  'try {',
  '  const advanced = await load("advanced.js");',
  '  const delegation = await load("interaction/work_delegation.js");',
  '  const workWorker = await load("deployment/work_worker.js");',
  '  installed = advanced.installPalimpsest({ tools: { register: () => () => undefined } }, {',
  '    projectId: spec.projectId,',
  '    databasePath: spec.paths.orchestration,',
  '    ordariumDatabasePath: spec.paths.ordarium,',
  '    repository: spec.repo,',
  '    execution: "worktree",',
  '    standard: { statement: "the dummy oracle passes", clauses: [{ kind: "scope_respected" }], derivedFrom: ["r3l0c plumbing"], confirmed: true, notes: [] },',
  '    policy: advanced.trustedDefaultPolicy({ read_paths: ["src", "test"], allowed_commands: [{ executable: "node", argv_prefix: ["test/check.js"] }] }),',
  '  });',
  '  const controller = installed.controller;',
  '  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: spec.repo, encoding: "utf8" }).trim();',
  '  controller.start({ projectId: spec.projectId, goal: "make the dummy oracle pass", headCommit: head, requirements: [{ requirement_id: "P1", statement: "answer must be 42", priority: "critical", acceptance_refs: [] }], tasks: [{ task_id: "t1", objective: "set answer to 42", depends_on: [], write_paths: ["src/dummy.mjs"], required_artifacts: [] }] });',
  '  for (let i = 0; i < 24; i += 1) { const preview = controller.preview(); if (preview.decision !== "next" || preview.eventType !== "TASK_READY") break; controller.step(); }',
  '  const states = controller.work.taskStates();',
  '  const target = states.find((t) => t.state === "READY")?.taskId ?? states.find((t) => t.state === "ACTIVE")?.taskId ?? "t1";',
  '  const port = workWorker.dshSubprocessWorkWorkerPort({ dshBin: spec.teePath, profile: spec.profile, timeoutMs: 900_000 });',
  '  const workerFor = () => ({ adapterId: port.adapterId, async run(input) {',
  '    writeFileSync(spec.payloadSink, JSON.stringify({ compiledHandleCount: (input.context?.compiled?.handles ?? []).length, allowedPullHandles: workWorker.workWorkerEnvironmentPayload(input.context).allowedPullHandles }, null, 2), "utf8");',
  '    return await port.run(input);',
  '  } });',
  '  const service = delegation.makeWorkDelegationService({ controller, workerFor });',
  '  const started = await service.start({ expectedTaskId: target });',
  '  let view = await service.followup({ jobId: started.jobId });',
  '  for (let i = 0; i < 4000 && (view.phase === "QUEUED" || view.phase === "RUNNING"); i += 1) { await new Promise((r) => setTimeout(r, 500)); view = await service.followup({ jobId: started.jobId }); }',
  '  report.jobPhase = view.phase;',
  '  report.attemptId = "attemptId" in view ? view.attemptId : null;',
  '  if (report.attemptId !== null) {',
  '    for (let i = 0; i < 12; i += 1) { const preview = controller.preview(); if (preview.decision !== "next") break; controller.step(); }',
  '    await controller.gate({ attemptId: report.attemptId, predicate: "tests_pass", command: ["node", "test/check.js"] });',
  '    for (let i = 0; i < 12; i += 1) { const preview = controller.preview(); if (preview.decision !== "next") break; controller.step(); }',
  '    const record = controller.attemptWorkRecord(report.attemptId);',
  '    const eligibility = controller.promotionEligibility(report.attemptId);',
  '    report.eligible = eligibility.eligible;',
  '    if (eligibility.eligible && record?.report) { await controller.promote(report.attemptId, String(record.report.result_commit), eligibility.canonicalExpectedHead); controller.step(); report.promoted = true; }',
  '    await controller.reconcileProjectHead({ operator: true });',
  '  }',
  '  report.finalHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: spec.repo, encoding: "utf8" }).trim();',
  '  report.source = execFileSync("git", ["show", "HEAD:src/dummy.mjs"], { cwd: spec.repo, encoding: "utf8" });',
  '  try { const out2 = execFileSync("node", ["test/check.js"], { cwd: spec.repo, encoding: "utf8" }); report.visibleOracle = /ok/u.test(out2); } catch { report.visibleOracle = false; }',
  '  report.payload = existsSync(spec.payloadSink) ? JSON.parse(readFileSync(spec.payloadSink, "utf8")) : null;',
  '  report.transcriptBytes = existsSync(spec.transcript) ? readFileSync(spec.transcript).length : 0;',
  '  report.ok = true;',
  '} catch (error) { report.ok = false; report.error = String(error?.stack ?? error).slice(0, 2000); }',
  'finally { if (installed !== null) await installed.dispose().catch(() => undefined); }',
  'writeFileSync(spec.reportPath, JSON.stringify(report, null, 2), "utf8");',
  'process.stdout.write("DUMMY_DONE ok=" + String(report.ok) + NL);',
  '',
].join(NL);

/**
 * §10: RUN THE PLUMBING CHECK.
 *
 * It uses a real worker against a throwaway world, and reports whether the answer was actually changed — the only
 * proof that the whole path works end to end rather than merely composing.
 */
export async function runPlumbing(input) {
  const runRoot = input.runRoot;
  const route = input.route;
  const root = join(runRoot, 'preflight', 'plumbing');
  mkdirSync(root, { recursive: true });
  const repo = join(root, 'world');
  mkdirSync(join(repo, 'src'), { recursive: true });
  mkdirSync(join(repo, 'test'), { recursive: true });
  writeFileSync(join(repo, 'README.md'), `# dummy${NL}`, 'utf8');
  writeFileSync(join(repo, 'package.json'), `${JSON.stringify({ name: 'dummy', private: true, type: 'module' }, null, 2)}${NL}`, 'utf8');
  writeFileSync(join(repo, 'src', 'dummy.mjs'), DUMMY_SOURCE, 'utf8');
  writeFileSync(join(repo, 'test', 'check.js'), DUMMY_ORACLE, 'utf8');
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['add', '-A'], { cwd: repo });
  execFileSync('git', ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'H0'], { cwd: repo });

  const home = join(root, 'home');
  mkdirSync(home, { recursive: true });
  const state = join(root, 'state');
  mkdirSync(state, { recursive: true });
  const paths = Object.freeze({ state, orchestration: join(state, 'orchestration.sqlite'), ordarium: join(state, 'ordarium.sqlite') });

  const { installHostBundle, dshHome, dshBin } = await import('../gates/env.mjs');
  const { makeProfile, TEE_PATH } = await import('./trajectory.mjs');
  const profile = 'r3l0cdummy';
  makeProfile(home, route, profile, installHostBundle, dshHome);

  const childPath = join(root, 'dummy-child.mjs');
  writeFileSync(childPath, DUMMY_CHILD, 'utf8');
  const specPath = join(root, 'spec.json');
  const reportPath = join(root, 'report.json');
  const payloadSink = join(root, 'payload.json');
  const transcript = join(root, 'transcript.txt');
  writeFileSync(specPath, JSON.stringify({
    repoRoot: REPO_ROOT, projectId: 'r3l0c-dummy', repo, paths, dshHome: home, realDshBin: dshBin(), profile,
    teePath: TEE_PATH, payloadSink, transcript, reportPath,
    protectedRoots: containmentEnvironment(runRoot, {}).PALIMPSEST_WORKER_PROTECTED_ROOTS,
  }, null, 2), 'utf8');

  let threw = null;
  try {
    execFileSync(process.execPath, [childPath, specPath], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, timeout: 1_200_000, env: containmentEnvironment(runRoot, process.env) });
  } catch (error) {
    threw = String(error?.message ?? error).slice(0, 300);
  }
  const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
  const ok = report !== null && report.ok === true && report.visibleOracle === true && /answer = 42/u.test(String(report.source ?? ''));
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C',
    kind: 'dummy plumbing check',
    ok,
    detail: report === null
      ? `the dummy child produced no report${threw === null ? '' : ` (${threw})`}`
      : `phase=${String(report.jobPhase)} promoted=${String(report.promoted)} visibleOracle=${String(report.visibleOracle)} answer42=${String(/answer = 42/u.test(String(report.source ?? '')))}`,
    jobPhase: report?.jobPhase ?? null,
    promoted: report?.promoted ?? null,
    visibleOracle: report?.visibleOracle ?? null,
    payload: report?.payload ?? null,
    transcriptBytes: report?.transcriptBytes ?? null,
    contributesToN: false,
    note: 'a dummy run is not a session and touches no primary bytes',
  });
}
