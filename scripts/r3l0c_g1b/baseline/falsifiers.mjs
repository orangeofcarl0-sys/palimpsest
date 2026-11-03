/**
 * R3-L0C-G1-B §3/§11 C1 — THE MEASURED BASELINE FALSIFIERS.
 *
 * §3 requires the five defects to be MEASURED against the unmodified G1 baseline before any correction, and
 * requires each control to distinguish an observed baseline failure from an inferred vulnerability or an
 * environmental limitation. Every control here drives the real G1 code — the real product stack for F1/F2, the
 * real frozen journal for F3, the real correlator for F4 and the real locator for F5 — and reports the actual
 * observed values.
 *
 * WHY THESE ARE FALSIFIERS AND NOT FAILING TESTS. The G1 baseline is not "broken" in the sense of throwing; it
 * ANSWERS, and the answer is wrong. A falsifier therefore asserts the OLD behaviour is present, so C2..C4 can flip
 * each one and the difference is the correction.
 *
 * SAFETY. Local, non-model Node children only. No DSH binary, provider route or remote service. `modelCallsMade: 0`.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NL } from '../contract.mjs';

/** §3: a local, non-model Node stub that commits inside the world it was handed. */
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

/** §3: a fresh repository with one declared task, so the product prepares a real attempt. */
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
 * §3 F1/F2: RUN THE REAL PRODUCT STACK and capture the correlated events.
 *
 * Returns the raw material both falsifiers need, so the run happens once.
 */
export async function runRealStack() {
  const { installPalimpsest, trustedDefaultPolicy } = await import('../../../dist/src/install.js');
  const { GitCliPort } = await import('../../../dist/src/effects/index.js');
  const { makeWorkDelegationService } = await import('../../../dist/src/interaction/work_delegation.js');
  const { dshSubprocessWorkWorkerPort } = await import('../../../dist/src/deployment/work_worker.js');

  const root = mkdtempSync(join(tmpdir(), 'g1b-stack-'));
  try {
    const { repo, head } = prepareProject(root);
    const standard = Object.freeze({
      statement: 'tests pass and scope respected',
      clauses: Object.freeze([
        Object.freeze({ kind: 'command_succeeds', command: Object.freeze(['node', '-e', 'process.exit(0)']), predicate: 'tests_pass' }),
        Object.freeze({ kind: 'scope_respected' }),
      ]),
      derivedFrom: Object.freeze(['G1-B fixture']),
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
    return Object.freeze({
      jobId: started.jobId,
      attemptId,
      jobPhase: view !== null && 'phase' in view ? view.phase : null,
      correlated: Object.freeze(correlated),
      modelCallsMade: 0,
    });
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* OS reaps it */ }
  }
}

/**
 * §3 F1: TWO INVOCATION ID PRODUCERS.
 *
 * Measured: the Work Delegation correlation wrapper generates its own `wpi-...` while the Deployment Port emits a
 * DIFFERENT `wpi-...` on every observation, so `entry.invocationId !== entry.observation.invocationId`.
 */
export function falsifierTwoInvocationProducers(stack) {
  const correlated = stack.correlated;
  const pairs = correlated.map((entry) => Object.freeze({
    entryInvocationId: entry.invocationId,
    observationInvocationId: entry.observation.invocationId,
    equal: entry.invocationId === entry.observation.invocationId,
  }));
  const distinctEntryIds = [...new Set(correlated.map((entry) => entry.invocationId))];
  const distinctObservationIds = [...new Set(correlated.map((entry) => entry.observation.invocationId))];
  return Object.freeze({
    id: 'F1_TWO_INVOCATION_PRODUCERS',
    requirement: 'B1 — one Port Invocation Identity per port execution',
    observed: Object.freeze({
      correlatedEventCount: correlated.length,
      pairs: Object.freeze(pairs),
      distinctEntryInvocationIds: Object.freeze(distinctEntryIds),
      distinctObservationInvocationIds: Object.freeze(distinctObservationIds),
      anyPairMismatched: pairs.some((pair) => pair.equal !== true),
      entryAndObservationProducersDiffer: distinctEntryIds.length === 1 && distinctObservationIds.length === 1 && distinctEntryIds[0] !== distinctObservationIds[0],
    }),
    /** §3: the defect is PRESENT when a correlated entry and its own observation disagree on the invocation. */
    defectPresent: correlated.length > 0 && pairs.some((pair) => pair.equal !== true),
    classification: 'OBSERVED_BASELINE_FAILURE',
    evidenceClass: 'REAL_PRODUCT_STACK_LOCAL_NONMODEL',
  });
}

/**
 * §3 F2: FALSE DURABILITY SUCCESS.
 *
 * Measured with the G1 recorder: it rejects every real observation (because the invocation ids disagree), and the
 * resulting zero-event record still writes successfully and reports `durabilityVerified: true`.
 */
export async function falsifierFalseDurability(stack) {
  const correlation = await import('../../r3l0c_g1/observation-correlation.mjs');
  /**
   * R3-L0C-G1-B §5: the recorder is bound to the INVOCATION THE PORT PRODUCED. Under the G1 baseline the wrapper
   * and the port minted different ids, so this recorder rejected every event; after the B1 correction they are the
   * same id and the real events are accepted. The falsifier reports whichever actually happened.
   */
  const recorder = correlation.createObservationRecorder({ invocationId: stack.correlated[0]?.invocationId ?? 'wpi-none' });
  for (const entry of stack.correlated) recorder.sink(entry.observation);
  const record = correlation.buildObservationRecord({
    recorder,
    hostLocalJobId: stack.jobId,
    attemptId: stack.attemptId,
    runId: null,
    sessionId: null,
  });
  const runRoot = mkdtempSync(join(tmpdir(), 'g1b-f2-'));
  try {
    const write = correlation.writeObservationRecord({ runRoot, record });
    const readBack = correlation.readObservationRecord({ runRoot, invocationId: record.invocationId });
    return Object.freeze({
      id: 'F2_FALSE_DURABILITY_SUCCESS',
      requirement: 'B2 — a successfully written empty record must never count as process evidence',
      observed: Object.freeze({
        inMemoryObservations: stack.correlated.length,
        recorderAcceptedCount: recorder.captured().length,
        recorderRejectedCount: recorder.rejected().length,
        durableEventCount: record.eventCount,
        durableEventsLength: record.events.length,
        written: write.written === true,
        durabilityVerified: write.durabilityVerified === true,
        readBackEventCount: readBack?.record.events.length ?? null,
        readBackDigestOk: readBack?.digestOk === true,
      }),
      /** §3: the defect is PRESENT when a zero-event record reports successful, verified durability. */
      defectPresent: recorder.captured().length === 0
        && stack.correlated.length > 0
        && write.written === true
        && write.durabilityVerified === true
        && (readBack?.record.events.length ?? -1) === 0,
      classification: 'OBSERVED_BASELINE_FAILURE',
      evidenceClass: 'REAL_PRODUCT_STACK_LOCAL_NONMODEL',
    });
  } finally {
    try { rmSync(runRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* OS reaps it */ }
  }
}

/**
 * §3 F3: WRONG JOURNAL SCHEMA.
 *
 * Measured against the REAL frozen journal: G1's readers match flattened `type/runId` fields, so on real
 * `{seq, kind, at, payload, digest}` records they return MISSING_RUN_STARTED and an empty trial map.
 */
export async function falsifierWrongJournalSchema() {
  const journal = await import('../../r3l0cf/journal.mjs');
  const correlation = await import('../../r3l0c_g1/observation-correlation.mjs');
  const runRoot = mkdtempSync(join(tmpdir(), 'g1b-f3-'));
  const journalPath = join(runRoot, 'generation-journal.jsonl');
  try {
    journal.appendRecord({ journalPath, kind: 'RUN_STARTED', payload: { runId: 'run-f3' } });
    journal.appendRecord({ journalPath, kind: 'TRIAL_RECORDED', payload: { sessionId: 's1', record: { attemptId: `attempt-${'a'.repeat(32)}`, hostJobId: 'wdj-1' } } });
    const read = journal.readJournal(journalPath);
    const g1Run = correlation.readRunIdentity({ journalRecords: read.records });
    const g1Trials = correlation.readTrialIdentities({ journalRecords: read.records });
    const g1TrialMap = g1Trials?.bySession instanceof Map ? g1Trials.bySession : g1Trials;
    return Object.freeze({
      id: 'F3_WRONG_JOURNAL_SCHEMA',
      requirement: 'B3 — consume the real frozen kind/payload journal structure',
      observed: Object.freeze({
        realRecordFields: Object.freeze(Object.keys(read.records[0] ?? {})),
        realKind: read.records[0]?.kind ?? null,
        realPayloadRunId: read.records[0]?.payload?.runId ?? null,
        journalIntact: read.JOURNAL_INTACT === true,
        g1RunIdentityVerdict: g1Run.verdict,
        g1RunIdentityRunId: g1Run.runId,
        g1TrialMapSize: g1TrialMap instanceof Map ? g1TrialMap.size : (g1Trials?.total ?? 0),
      }),
      /** §3: the defect is PRESENT when the G1 readers cannot read a real, intact journal. */
      defectPresent: read.JOURNAL_INTACT === true
        && read.records.length === 2
        && g1Run.ok !== true
        && g1Trials.size === 0,
      classification: 'OBSERVED_BASELINE_FAILURE',
      evidenceClass: 'REAL_FROZEN_JOURNAL',
    });
  } finally {
    try { rmSync(runRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* OS reaps it */ }
  }
}

/**
 * §3 F4: FORGED ORIGIN.
 *
 * Measured: a caller-built record carrying the copied origin marker, a correctly recomputed digest and an EMPTY
 * event array reaches RUN_ATTEMPT_CORRELATED against a matching journal.
 */
export async function falsifierForgedOrigin() {
  const correlation = await import('../../r3l0c_g1/observation-correlation.mjs');
  const attemptId = `attempt-${'a'.repeat(32)}`;
  const forged = {
    schemaVersion: 1,
    kind: 'G1 host process observation record',
    stage: 'R3-L0C-G1',
    origin: 'G1_LOCAL_RECORDER',
    attemptId,
    hostLocalJobId: 'wdj-forged',
    runId: 'run-f4',
    sessionId: 's1',
    invocationId: 'wpi-forged',
    source: 'LOCAL_NONMODEL_PRODUCER',
    eventCount: 0,
    rejectedCount: 0,
    rejected: [],
    events: [],
    proves: [],
    doesNotProve: [],
    trustedLocalRecorder: true,
    independentlySigned: false,
    trustLimitation: 'forged',
  };
  const forgedWithDigest = { ...forged, recordDigest: correlation.recordDigest(forged) };
  const flatJournal = [
    { type: 'RUN_STARTED', runId: 'run-f4' },
    { type: 'TRIAL_RECORDED', sessionId: 's1', attemptId },
  ];
  const result = correlation.correlateObservationRecord({ record: forgedWithDigest, journalRecords: flatJournal });
  return Object.freeze({
    id: 'F4_FORGED_ORIGIN_ACCEPTED',
    requirement: 'B4 — a copied origin marker plus a recomputed hash must not qualify as host origin',
    observed: Object.freeze({
      copiedOriginMarker: forged.origin,
      recomputedDigestValid: forgedWithDigest.recordDigest === correlation.recordDigest(forgedWithDigest),
      eventCount: forged.events.length,
      correlatorState: result.state,
      correlatorCorrelated: result.correlated === true,
      chain: result.chain,
    }),
    /** §3: the defect is PRESENT when a forged, empty record is admitted as correlated host evidence. */
    defectPresent: result.state === 'RUN_ATTEMPT_CORRELATED' && result.correlated === true,
    classification: 'OBSERVED_BASELINE_FAILURE',
    evidenceClass: 'REAL_CORRELATOR_WITH_CALLER_BUILT_INPUT',
  });
}

/**
 * §3 F5: ARTIFACT LOCATOR MISMATCH.
 *
 * Measured: the canonical `attempt-<32hex>` returns ABSENT (the comparison expects bare hex), and a candidate
 * below the scan bound returns ABSENT with no incomplete-discovery signal.
 */
export function falsifierLocatorMismatch() {
  return import('../../r3l0c_g1/artifact-locator.mjs').then((locator) => {
    const SLUG = '--C-x-repo-.palimpsest-worlds-attempt-a07384dd03aa9f5c4597b61e8f929771--';
    const hex = 'a07384dd03aa9f5c4597b61e8f929771';
    const home = mkdtempSync(join(tmpdir(), 'g1b-f5-'));
    try {
      const dir = join(home, 'sessions', SLUG, 'worker-a');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'session.v4.jsonl.zstd'), 'x');
      const bare = locator.discoverScheduledArtifact({ dshHomePath: home, expectedAttemptId: hex });
      const canonical = locator.discoverScheduledArtifact({ dshHomePath: home, expectedAttemptId: `attempt-${hex}` });

      /** §3: a candidate deeper than the default bound, to measure the incomplete-scan behaviour. */
      const deepHome = mkdtempSync(join(tmpdir(), 'g1b-f5d-'));
      try {
        let cursor = join(deepHome, 'sessions');
        for (let index = 0; index < 9; index += 1) cursor = join(cursor, `d${index}`);
        const deepDir = join(cursor, SLUG, 'worker-a');
        mkdirSync(deepDir, { recursive: true });
        writeFileSync(join(deepDir, 'session.v4.jsonl.zstd'), 'x');
        const deep = locator.discoverScheduledArtifact({ dshHomePath: deepHome, expectedAttemptId: hex });
        return Object.freeze({
          id: 'F5_LOCATOR_CANONICAL_MISMATCH',
          requirement: 'B5 — accept the canonical attempt-<32hex> identity and fail closed on incomplete discovery',
          observed: Object.freeze({
            bareHexOutcome: bare.outcome,
            bareHexDiscovered: bare.discovered === true,
            canonicalOutcome: canonical.outcome,
            canonicalDiscovered: canonical.discovered === true,
            deepCandidateOutcome: deep.outcome,
            deepCandidateReportsIncomplete: deep.outcome === 'DISCOVERY_INCOMPLETE' || deep.discoveryIncomplete === true,
          }),
          /** §3: the defect is PRESENT when canonical is rejected AND an incomplete scan is reported as absent. */
          defectPresent: bare.discovered === true
            && canonical.discovered !== true
            && deep.outcome !== 'DISCOVERY_INCOMPLETE'
            && deep.discoveryIncomplete !== true,
          classification: 'OBSERVED_BASELINE_FAILURE',
          evidenceClass: 'REAL_LOCATOR_WITH_FIXTURE_PATHS',
        });
      } finally {
        try { rmSync(deepHome, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* OS reaps it */ }
      }
    } finally {
      try { rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* OS reaps it */ }
    }
  });
}

/** §3: run every falsifier against the unmodified baseline. */
export async function runBaselineFalsifiers() {
  const stack = await runRealStack();
  const controls = [
    falsifierTwoInvocationProducers(stack),
    await falsifierFalseDurability(stack),
    await falsifierWrongJournalSchema(),
    await falsifierForgedOrigin(),
    await falsifierLocatorMismatch(),
  ];
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-G1-B',
    kind: 'measured baseline falsifiers',
    controls: Object.freeze(controls),
    measuredDefectIds: Object.freeze(controls.filter((control) => control.defectPresent === true).map((control) => control.id)),
    allDefectsMeasured: controls.every((control) => control.defectPresent === true),
    modelCallsMade: 0,
    law: 'each control distinguishes an observed baseline failure from an inferred vulnerability; the defect is reported PRESENT only when the actual G1 code produced the actual wrong answer',
  });
}

export { NL };
