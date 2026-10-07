#!/usr/bin/env node
/**
 * R3-L0 §27 — THE DUMMY CHILD.
 *
 * The plumbing check needs the SAME worker path a real generation uses — the shipped port, the real model route,
 * the payload capture, the governed pull, and the ordinary gate/promotion/reconciliation — but against a
 * throwaway project rather than the experimental family. This program is that path with the ledger-specific
 * planning replaced by a single seeded task.
 *
 * §27: it is a DUMMY fixture. It writes no trajectory record and contributes nothing to N.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const NL = String.fromCharCode(10);
const sha256 = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');
const git = (cwd, args) => execFileSync('git', [...args], { cwd, encoding: 'utf8' }).trim();

const spec = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const DIST = join(spec.repoRoot, 'dist', 'src');
const load = async (relative) => await import(pathToFileURL(join(DIST, relative)).href);

/**
 * The tee wrapper re-execs the REAL DSH bin, so it needs both environment variables BEFORE the port spawns it.
 * Without them the wrapper exits 2 and the "worker" produces nothing, which is exactly the failure this check
 * exists to catch.
 */
process.env.PALIMPSEST_REAL_DSH_BIN = spec.realDshBin;
process.env.PALIMPSEST_LIVE_GATE_TRANSCRIPT = spec.transcript;
/**
 * DSH_HOME must point at THIS generation's home, or the DSH bin resolves the profile against the real user home
 * and refuses with "profile does not exist". The profile is per-trajectory, so this is per-process state.
 */
process.env.DSH_HOME = spec.dshHome;

const report = { schemaVersion: 1, stage: 'R3-L0', kind: 'dummy plumbing child', pid: process.pid, steps: [] };
let installed = null;
try {
  const advanced = await load('advanced.js');
  const delegation = await load('interaction/work_delegation.js');
  const workWorker = await load('deployment/work_worker.js');

  installed = advanced.installPalimpsest(
    { tools: { register: () => () => undefined } },
    {
      projectId: spec.projectId,
      databasePath: spec.paths.orchestration,
      ordariumDatabasePath: spec.paths.ordarium,
      repository: spec.repo,
      execution: 'worktree',
      standard: spec.standard,
      policy: advanced.trustedDefaultPolicy({
        read_paths: ['src', 'test', 'README.md'],
        allowed_commands: [{ executable: 'node', argv_prefix: ['-e', 'process.exit(0)'] }],
      }),
    },
  );
  const controller = installed.controller;
  const head = git(spec.repo, ['rev-parse', 'HEAD']);
  report.head = head;

  controller.start({
    projectId: spec.projectId,
    goal: spec.projectGoal,
    headCommit: head,
    requirements: [{ requirement_id: 'D', statement: spec.requirement, priority: 'critical', acceptance_refs: [] }],
    tasks: [{ task_id: spec.taskId, objective: spec.objective, depends_on: [], write_paths: spec.writePaths, required_artifacts: [] }],
  });
  for (let index = 0; index < 24; index += 1) {
    const preview = controller.preview();
    if (preview.decision !== 'next' || preview.eventType !== 'TASK_READY') break;
    controller.step();
  }
  const states = controller.work.taskStates();
  const target = states.find((task) => task.state === 'READY')?.taskId ?? spec.taskId;
  report.target = target;

  const workerFor = () => {
    const port = workWorker.dshSubprocessWorkWorkerPort({ dshBin: spec.teePath, profile: spec.profile, timeoutMs: 900_000 });
    return {
      adapterId: port.adapterId,
      async run(input) {
        writeFileSync(spec.payloadSink, JSON.stringify({
          compiledHandleCount: (input.context?.compiled?.handles ?? []).length,
          handles: (input.context?.compiled?.handles ?? []).map((entry) => ({ kind: entry.kind, handle: entry.handle })),
          requirements: input.context?.work?.requirements ?? [],
          contextIndexText: input.context?.contextIndexText ?? null,
        }, null, 2), 'utf8');
        return await port.run(input);
      },
    };
  };
  const service = delegation.makeWorkDelegationService({ controller, workerFor });
  const started = await service.start({ expectedTaskId: target });
  let view = await service.followup({ jobId: started.jobId });
  for (let index = 0; index < 2_000 && (view.phase === 'QUEUED' || view.phase === 'RUNNING'); index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    view = await service.followup({ jobId: started.jobId });
  }
  report.jobPhase = view.phase;
  report.attemptId = 'attemptId' in view ? view.attemptId : null;
  report.hostError = 'hostError' in view ? view.hostError : null;

  if (report.attemptId !== null) {
    for (let index = 0; index < 12; index += 1) {
      const preview = controller.preview();
      if (preview.decision !== 'next') break;
      controller.step();
    }
    await controller.gate({ attemptId: report.attemptId, predicate: 'tests_pass', command: ['node', '-e', 'process.exit(0)'] });
    for (let index = 0; index < 12; index += 1) {
      const preview = controller.preview();
      if (preview.decision !== 'next') break;
      controller.step();
    }
    const record = controller.attemptWorkRecord(report.attemptId);
    const eligibility = controller.promotionEligibility(report.attemptId);
    report.attemptState = record?.state ?? null;
    report.eligible = eligibility.eligible;
    if (eligibility.eligible && record?.report !== null && record?.report !== undefined) {
      await controller.promote(report.attemptId, String(record.report.result_commit), eligibility.canonicalExpectedHead);
      controller.step();
      report.promoted = true;
    } else {
      report.promoted = false;
    }
    await controller.reconcileProjectHead({ operator: true });
  }

  report.finalHead = git(spec.repo, ['rev-parse', 'HEAD']);
  report.source = git(spec.repo, ['show', 'HEAD:src/dummy.mjs']).trim();
  report.sourceDigest = sha256(report.source);
  report.payload = existsSync(spec.payloadSink) ? JSON.parse(readFileSync(spec.payloadSink, 'utf8')) : null;
  report.transcriptBytes = existsSync(spec.transcript) ? readFileSync(spec.transcript).length : 0;

  try {
    const output = execFileSync('node', ['test/check.js'], { cwd: spec.repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 });
    report.visibleOracle = { ok: /ok/u.test(output), detail: output.trim().slice(0, 200) };
  } catch (error) {
    report.visibleOracle = { ok: false, detail: String(error?.stdout ?? error?.message ?? error).slice(0, 200) };
  }
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.error = String(error?.stack ?? error).slice(0, 3000);
} finally {
  if (installed !== null) await installed.dispose().catch(() => undefined);
}
writeFileSync(spec.reportPath, JSON.stringify(report, null, 2), 'utf8');
process.stdout.write(`DUMMY_DONE ok=${String(report.ok)} phase=${String(report.jobPhase)}${NL}`);
