/**
 * R3-L0C-G1 §12 C4 — INTEGRATED NON-MODEL VALIDATION.
 *
 * §12 C4: "Run a real local child-process stub through the actual product port and Work Delegation interface.
 * Demonstrate observed PID, HostJob/Attempt correlation, observation persistence and negative controls."
 *
 * This harness drives the REAL stack — `installPalimpsest` → the real controller → the real
 * `makeWorkDelegationService` → the real `dshSubprocessWorkWorkerPort` — with a LOCAL, NON-MODEL Node child that
 * commits inside the execution world it is handed. The observed pid is a real OS pid; the AttemptId is one the
 * product minted; the record is written to disk and re-read.
 *
 * SAFETY. The stub never invokes `@deepseek-ai/dsh`, a provider route or any remote service. `modelCallsMade: 0`.
 * Every temp directory is under the system temp root.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NL } from './contract.mjs';
import {
  buildObservationRecord,
  correlateObservationRecord,
  createObservationRecorder,
  readObservationRecord,
  writeObservationRecord,
} from './observation-correlation.mjs';

/** §4: a local, non-model Node stub that edits and commits inside the world it was handed. */
export function writeCommittingStub(directory) {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, 'stub.cjs');
  writeFileSync(path, [
    'const fs = require("node:fs");',
    'const cp = require("node:child_process");',
    'fs.writeFileSync("src/a.ts", "export const a = 2;\\n");',
    'cp.execFileSync("git", ["add", "-A"]);',
    'cp.execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "worker commit"]);',
    'process.stdout.write("PALIMPSEST_WORK_RESULT " + JSON.stringify({ kind: "READY_FOR_SETTLEMENT", summary: "done" }) + "\\n");',
    'process.exit(0);',
  ].join(NL), 'utf8');
  return path;
}

/** §4: a local, non-model Node stub that hangs, so the timeout branch is reachable. */
export function writeHangingStub(directory) {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, 'hang.cjs');
  writeFileSync(path, 'setTimeout(() => {}, 60_000);\n', 'utf8');
  return path;
}

/** §4: a real repository with one task declared, so the product can prepare an attempt. */
export function prepareProject(root) {
  const repo = join(root, 'repo');
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src', 'a.ts'), 'export const a = 1;\n');
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['add', '-A'], { cwd: repo });
  execFileSync('git', ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'H0'], { cwd: repo });
  return { repo, head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim() };
}

/**
 * §12 C4: RUN THE INTEGRATED NON-MODEL VALIDATION.
 *
 * Returns the measured facts, so a test or a report can assert them without re-deriving the run.
 */
export async function runIntegratedValidation(input = {}) {
  const { installPalimpsest, trustedDefaultPolicy } = await import('../../dist/src/install.js');
  const { GitCliPort } = await import('../../dist/src/effects/index.js');
  const { makeWorkDelegationService } = await import('../../dist/src/interaction/work_delegation.js');
  const { dshSubprocessWorkWorkerPort } = await import('../../dist/src/deployment/work_worker.js');

  const root = mkdtempSync(join(tmpdir(), 'r3l0c-g1-c4-'));
  const runRoot = join(root, 'run');
  const cleanups = [];
  const cleanup = () => { for (const fn of cleanups.reverse()) { try { fn(); } catch { /* OS reaps it */ } } };

  try {
    const { repo, head } = prepareProject(root);
    const standard = Object.freeze({
      statement: 'tests pass and scope respected',
      clauses: Object.freeze([
        Object.freeze({ kind: 'command_succeeds', command: Object.freeze(['node', '-e', 'process.exit(0)']), predicate: 'tests_pass' }),
        Object.freeze({ kind: 'scope_respected' }),
      ]),
      derivedFrom: Object.freeze(['G1 C4 fixture']),
      confirmed: true,
      notes: Object.freeze([]),
    });
    const installed = installPalimpsest({ tools: { register: () => () => undefined } }, {
      projectId: 'g1c4',
      databasePath: join(repo, '.palimpsest', 'p.sqlite'),
      ordariumDatabasePath: join(repo, '.palimpsest', 'o.sqlite'),
      repository: repo,
      git: new GitCliPort(repo, join(repo, '.palimpsest', 'worlds')),
      execution: 'worktree',
      standard,
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: 'node', argv_prefix: ['-e', 'process.exit(0)'] }] }),
    });
    cleanups.push(() => void installed.dispose());
    const controller = installed.controller;
    const call = async (name, args) => {
      const tool = installed.tools.find((entry) => entry.name === name);
      return await tool.execute(args, { callId: `c-${name}`, rootCallId: `r-${name}`, name, arguments: args, signal: new AbortController().signal });
    };
    await call('palimpsest_start', {
      projectId: 'g1c4',
      goal: 'tidy the project',
      headCommit: head,
      tasks: [{ task_id: 't1', objective: 'tidy a', depends_on: [], write_paths: ['src/a.ts'], required_artifacts: [] }],
    });

    const stubPath = writeCommittingStub(join(root, 'stub'));
    const correlated = [];
    const service = makeWorkDelegationService({
      controller,
      workerFor: () => ({
        adapterId: 'g1-c4-observing-worker',
        async run(runInput) {
          const port = dshSubprocessWorkWorkerPort({ dshBin: stubPath, profile: 'g1-c4', timeoutMs: 30_000 });
          return port.run({ workDir: runInput.workDir, context: runInput.context, contextPull: runInput.contextPull, observe: runInput.observe });
        },
      }),
      onCorrelatedObservation: (entry) => { correlated.push(entry); },
    });

    const started = await service.start({ expectedTaskId: 't1' });
    let view = null;
    for (let attempt = 0; attempt < 400; attempt += 1) {
      const candidate = await service.followup({ jobId: started.jobId });
      if ('phase' in candidate && candidate.phase === 'FINISHED') { view = candidate; break; }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    /** §6: preserve the observation set durably, then re-read and verify it. */
    const recorder = createObservationRecorder({ invocationId: correlated[0]?.invocationId ?? 'wpi-c4' });
    for (const entry of correlated) recorder.sink(entry.observation);
    const attemptId = view !== null && 'attemptId' in view ? view.attemptId : null;
    const record = buildObservationRecord({
      recorder,
      hostLocalJobId: started.jobId,
      attemptId,
      runId: input.runId ?? null,
      sessionId: input.sessionId ?? null,
      source: 'LOCAL_NONMODEL_PRODUCER',
    });
    const write = writeObservationRecord({ runRoot, record });
    const readBack = readObservationRecord({ runRoot });

    const spawned = correlated.find((entry) => entry.observation.eventKind === 'DIRECT_CHILD_SPAWN_OBSERVED');
    const exited = correlated.find((entry) => entry.observation.eventKind === 'DIRECT_CHILD_EXIT_OBSERVED');

    return Object.freeze({
      schemaVersion: 1,
      stage: 'R3-L0C-G1',
      kind: 'integrated non-model producer validation',
      ranRealProductStack: true,
      modelCallsMade: 0,
      usedLocalStub: true,
      stubInvokedDshOrProvider: false,
      jobId: started.jobId,
      attemptId,
      jobPhase: view !== null && 'phase' in view ? view.phase : null,
      observationCount: correlated.length,
      eventKinds: Object.freeze([...new Set(correlated.map((entry) => entry.observation.eventKind))]),
      directChildPidObserved: typeof spawned?.observation.directChildPid === 'number' ? spawned.observation.directChildPid : null,
      processRole: spawned?.observation.processRole ?? null,
      exitObserved: exited !== undefined,
      exitCode: exited?.observation.exitCode ?? null,
      correlationIsExact: correlated.length > 0 && correlated.every((entry) => entry.attemptId === attemptId),
      hostLocalJobIdMatches: correlated.every((entry) => entry.hostLocalJobId === started.jobId),
      recordWritten: write.written === true,
      recordDurabilityVerified: write.durabilityVerified === true,
      recordDigestOkOnReadBack: readBack?.digestOk === true,
      recordContentBindingFailed: readBack?.contentBindingFailed === true,
      recordProvesNothingAboutPrimary: true,
      correlation: correlateObservationRecord({ record, journalRecords: input.journalRecords ?? [] }),
      law: 'a real direct child on this host exercised the actual product port and the actual Work Delegation interface; the observation is LOCAL evidence, never LIVE_PRIMARY provenance',
    });
  } finally {
    cleanup();
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* OS reaps it */ }
  }
}

export { NL };
