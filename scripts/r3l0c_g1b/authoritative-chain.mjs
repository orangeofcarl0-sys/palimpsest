/**
 * R3-L0C-G1-B §9 — THE AUTHORITATIVE LOCAL INTEGRATION CHAIN.
 *
 * §9 requires the full bounded chain, in one run, over the REAL product stack and the REAL frozen journal:
 *
 *   Real Work Preparation → Canonical AttemptId → Host-local JobId → Real Deployment Port → One Port
 *   InvocationId → Real Local Node Spawn → Real PID / Exit Observation → Host-private Correlation → Recorder
 *   Ingestion → Per-invocation Durable Evidence → Readback Validation → Real-format RUN_STARTED / TRIAL_RECORDED
 *   → Verified Run Claim → RUN_ATTEMPT_CORRELATED
 *
 * WHY IT IS SEPARATE FROM `acceptance.mjs`. `acceptance.mjs` proves the PRODUCER (G1). This module proves the
 * BINDING (G1-B): that the produced evidence survives the durable write, the real journal and the claim check, and
 * that each negative mutation fails. Keeping them separate means the G1 producer evidence is not overwritten by
 * the G1-B binding evidence, which §1 requires.
 *
 * SAFETY. A local, non-model Node child only. No DSH binary, provider route or remote service. `modelCallsMade: 0`.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NL } from './contract.mjs';
import * as correlationModule from '../r3l0c_g1/observation-correlation.mjs';
import {
  buildObservationRecord,
  correlateObservationRecord,
  createObservationRecorder,
  readObservationRecord,
  writeObservationRecord,
} from '../r3l0c_g1/observation-correlation.mjs';

/** §9: a local, non-model Node stub that commits inside the world it was handed. */
function writeStub(directory) {
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

/** §9: a fresh repository with one declared task. */
function prepareProject(root) {
  const repo = join(root, 'repo');
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src', 'a.ts'), 'export const a = 1;\n');
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['add', '-A'], { cwd: repo });
  execFileSync('git', ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'H0'], { cwd: repo });
  return { repo, head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim() };
}

/**
 * §9: RUN THE POSITIVE CHAIN, returning every measured value the report must carry.
 *
 * `mutate` lets a negative control alter the chain at a named point WITHOUT re-implementing the run, so every
 * negative test travels the SAME real path rather than a helper's shortcut.
 */
export async function runAuthoritativeChain(input = {}) {
  const { installPalimpsest, trustedDefaultPolicy } = await import('../../dist/src/install.js');
  const { GitCliPort } = await import('../../dist/src/effects/index.js');
  const { makeWorkDelegationService } = await import('../../dist/src/interaction/work_delegation.js');
  const { dshSubprocessWorkWorkerPort } = await import('../../dist/src/deployment/work_worker.js');
  const journal = await import('../r3l0cf/journal.mjs');
  const failStop = await import('../r3l0cf/fail-stop.mjs');

  const root = mkdtempSync(join(tmpdir(), 'r3l0c-g1b-chain-'));
  const runRoot = join(root, 'run');
  const sessionId = input.sessionId ?? 's1';
  const runId = input.runId ?? 'run-g1b-chain';
  try {
    const { repo, head } = prepareProject(root);
    const standard = Object.freeze({
      statement: 'tests pass and scope respected',
      clauses: Object.freeze([
        Object.freeze({ kind: 'command_succeeds', command: Object.freeze(['node', '-e', 'process.exit(0)']), predicate: 'tests_pass' }),
        Object.freeze({ kind: 'scope_respected' }),
      ]),
      derivedFrom: Object.freeze(['G1-B §9 fixture']),
      confirmed: true,
      notes: Object.freeze([]),
    });
    const installed = installPalimpsest({ tools: { register: () => () => undefined } }, {
      projectId: 'g1b',
      databasePath: join(repo, '.palimpsest', 'p.sqlite'),
      ordariumDatabasePath: join(repo, '.palimpsest', 'o.sqlite'),
      repository: repo,
      git: new GitCliPort(repo, join(repo, '.palimpsest', 'worlds')),
      execution: 'worktree',
      standard,
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: 'node', argv_prefix: ['-e', 'process.exit(0)'] }] }),
    });
    const controller = installed.controller;
    const call = async (name, args) => {
      const tool = installed.tools.find((entry) => entry.name === name);
      return await tool.execute(args, { callId: `c-${name}`, rootCallId: `r-${name}`, name, arguments: args, signal: new AbortController().signal });
    };
    await call('palimpsest_start', {
      projectId: 'g1b',
      goal: 'tidy the project',
      headCommit: head,
      tasks: [{ task_id: 't1', objective: 'tidy a', depends_on: [], write_paths: ['src/a.ts'], required_artifacts: [] }],
    });

    /** §6: the REAL run root is claimed BEFORE anything is recorded, so the claim nonce exists to verify. */
    mkdirSync(runRoot, { recursive: true });
    const claim = failStop.claimRunRoot({ runRoot, runId });
    if (claim.claimed !== true) throw new Error(`the run root could not be claimed: ${JSON.stringify(claim.inspection)}`);
    const claimNonce = claim.claimNonce;
    const journalPath = join(runRoot, journal.JOURNAL_FILE);

    const stubPath = writeStub(join(root, 'stub'));
    const correlated = [];
    const service = makeWorkDelegationService({
      controller,
      workerFor: () => ({
        adapterId: 'g1b-observing-worker',
        async run(runInput) {
          const port = dshSubprocessWorkWorkerPort({ dshBin: stubPath, profile: 'g1b', timeoutMs: 30_000 });
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
    const attemptId = view !== null && 'attemptId' in view ? view.attemptId : null;

    /** §6: a REAL-format RUN_STARTED, then the trial the product's own settlement produced. */
    journal.appendRecord({ journalPath, kind: 'RUN_STARTED', payload: { runId, runRoot, plannedSessions: [sessionId], claimNonce } });
    const trialRecord = {
      sessionId,
      attemptId,
      hostJobId: started.jobId,
      resultState: view !== null && 'settlement' in view && view.settlement !== null ? 'SETTLED' : null,
    };
    journal.appendRecord({ journalPath, kind: 'TRIAL_RECORDED', payload: { sessionId, record: { ...trialRecord, sessionId } } });

    /** §5: recorder ingestion bound to the invocation the PORT produced. */
    const invocationId = correlated[0]?.invocationId ?? null;
    const recorder = createObservationRecorder({ invocationId: invocationId ?? 'wpi-none' });
    for (const entry of correlated) recorder.sink(entry.observation);
    const record = buildObservationRecord({ recorder, hostLocalJobId: started.jobId, attemptId, runId, sessionId, source: 'LOCAL_NONMODEL_PRODUCER' });

    /** §9 negative injection: a caller can mutate the record or the journal at a NAMED point. */
    const mutated = typeof input.mutate === 'function' ? input.mutate({ record, journalPath, runRoot, attemptId, sessionId, runId, claimNonce, journal }) : null;
    const finalRecord = mutated?.record ?? record;
    const finalRunRoot = mutated?.runRoot ?? runRoot;
    const finalClaimNonce = mutated?.claimNonce ?? claimNonce;
    const finalJournalPath = mutated?.journalPath ?? journalPath;

    const write = writeObservationRecord({ runRoot: finalRunRoot, record: finalRecord });
    const readBack = readObservationRecord({ runRoot: finalRunRoot, invocationId: finalRecord.invocationId, expected: { attemptId, hostLocalJobId: started.jobId } });
    const read = journal.readJournal(finalJournalPath);

    const correlation = await correlateObservationRecord({
      record: finalRecord,
      journalRecords: read.records,
      journalPath: finalJournalPath,
      runRoot: finalRunRoot,
      claimNonce: finalClaimNonce,
      expectedInvocationId: invocationId,
      trustedIngestion: input.trustedIngestion ?? true,
    });

    const spawned = correlated.find((entry) => entry.observation.eventKind === 'DIRECT_CHILD_SPAWN_OBSERVED');
    const exited = correlated.find((entry) => entry.observation.eventKind === 'DIRECT_CHILD_EXIT_OBSERVED');

    return Object.freeze({
      schemaVersion: 1,
      stage: 'R3-L0C-G1-B',
      kind: 'authoritative local integration chain',
      ranRealProductStack: true,
      modelCallsMade: 0,
      usedLocalStub: true,
      stubInvokedDshOrProvider: false,
      jobId: started.jobId,
      attemptId,
      canonicalAttemptId: attemptId,
      jobPhase: view !== null && 'phase' in view ? view.phase : null,
      invocationId,
      correlatedInvocationIds: Object.freeze([...new Set(correlated.map((entry) => entry.invocationId))]),
      observationInvocationIds: Object.freeze([...new Set(correlated.map((entry) => entry.observation.invocationId))]),
      invocationIdentityConsistent: correlated.every((entry) => entry.invocationId === entry.observation.invocationId),
      observationCount: correlated.length,
      eventKinds: Object.freeze([...new Set(correlated.map((entry) => entry.observation.eventKind))]),
      directChildPidObserved: typeof spawned?.observation.directChildPid === 'number' ? spawned.observation.directChildPid : null,
      processRole: spawned?.observation.processRole ?? null,
      exitObserved: exited !== undefined,
      exitCode: exited?.observation.exitCode ?? null,
      exitPid: exited?.observation.directChildPid ?? null,
      pidCoherent: spawned !== undefined && exited !== undefined && spawned.observation.directChildPid === exited.observation.directChildPid,
      acceptedEventCount: finalRecord.acceptedEventCount,
      rejectedEventCount: finalRecord.rejectedCount,
      persistedEventCount: finalRecord.eventCount,
      readBackEventCount: readBack?.record.events.length ?? null,
      lifecycle: finalRecord.lifecycle,
      recordWritten: write.written === true,
      recordConflict: write.conflict === true,
      recordDurabilityVerified: write.durabilityVerified === true,
      recordDigestOkOnReadBack: readBack?.digestOk === true,
      recordIdentityMatches: readBack?.identityMatches === true,
      journalExists: read.exists === true,
      journalIntact: read.JOURNAL_INTACT === true,
      journalRecordCount: read.records.length,
      correlation,
      runId,
      sessionId,
      law: 'one actual local port invocation produced real process observations, bound them to the Work Owner AttemptId and the Host JobId, preserved the exact non-empty events, and correlated them through an intact frozen journal and a verified Run Claim',
    });
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* OS reaps it */ }
  }
}

/** §9: the six negative mutations, each travelling the SAME real chain. */
export const NEGATIVE_MUTATIONS = Object.freeze([
  Object.freeze({ id: 'N1_SECOND_INVOCATION_IDENTITY', detail: 'the record names a different invocation than the port produced' }),
  Object.freeze({ id: 'N2_EVENT_REMOVED', detail: 'one persisted event is removed, breaking the lifecycle' }),
  Object.freeze({ id: 'N3_ATTEMPT_ID_CHANGED', detail: 'the durable AttemptId is changed' }),
  Object.freeze({ id: 'N4_WRONG_CLAIM_NONCE', detail: 'the Run Claim nonce is wrong' }),
  Object.freeze({ id: 'N5_DUPLICATE_TRIAL', detail: 'a duplicate Trial is appended' }),
  Object.freeze({ id: 'N6_FORGED_ORIGIN_SUBSTITUTION', detail: 'a record with an apparently valid Origin Marker replaces the real evidence' }),
]);

/** §9: run one negative mutation through the real chain and report whether it failed to attain a positive state. */
export async function runNegativeMutation(id) {
  /**
   * §9: each mutation recomputes the record digest, so the control exercises the SPECIFIC check it names rather
   * than stopping at the content-integrity gate. A mutation that also broke the digest would prove only that the
   * digest works, which N6 and the P3-G falsifier already cover.
   */
  const reseal = (record) => {
    const { recordDigest: _ignored, ...rest } = record;
    return { ...rest, recordDigest: correlationModule.recordDigest(rest) };
  };
  const mutations = {
    N1_SECOND_INVOCATION_IDENTITY: ({ record }) => ({ record: reseal({ ...record, invocationId: `${record.invocationId}-other` }) }),
    N2_EVENT_REMOVED: ({ record }) => ({ record: reseal({ ...record, events: record.events.slice(0, 2), eventCount: 2, acceptedEventCount: 2 }) }),
    N3_ATTEMPT_ID_CHANGED: ({ record }) => ({ record: reseal({ ...record, attemptId: `attempt-${'f'.repeat(32)}` }) }),
    N4_WRONG_CLAIM_NONCE: () => ({ claimNonce: 'not-the-real-nonce' }),
    N5_DUPLICATE_TRIAL: ({ journal, journalPath, sessionId, attemptId, jobId }) => {
      journal.appendRecord({ journalPath, kind: 'TRIAL_RECORDED', payload: { sessionId, record: { sessionId, attemptId, hostJobId: jobId } } });
      return {};
    },
    N6_FORGED_ORIGIN_SUBSTITUTION: ({ record }) => ({
      record: {
        ...record,
        events: [],
        eventCount: 0,
        acceptedEventCount: 0,
        origin: 'G1_LOCAL_RECORDER',
      },
    }),
  };
  const mutate = mutations[id];
  if (mutate === undefined) throw new Error(`unknown negative mutation ${id}`);
  const result = await runAuthoritativeChain({
    mutate: (context) => mutate({ ...context, jobId: context.jobId }),
    /** N6 also removes trusted ingestion, because the forged record was never delivered by the live sink. */
    trustedIngestion: id !== 'N6_FORGED_ORIGIN_SUBSTITUTION',
  });
  return Object.freeze({
    id,
    attainedPositiveCorrelation: result.correlation.state === 'RUN_ATTEMPT_CORRELATED' && result.correlation.correlated === true,
    state: result.correlation.state,
    problems: result.correlation.problems,
    refused: result.correlation.state !== 'RUN_ATTEMPT_CORRELATED',
  });
}

export { NL, readFileSync };
