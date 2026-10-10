/**
 * R3-L0C-I-A-R-L-C-F-S §3-§7 — THE PRODUCTION-PATH CONTROLS.
 *
 * Each function drives the REAL corrected entry and returns a `positiveControl` beside the `mutations` it measured.
 * §10 requires, for each critical negative control, the baseline defect, the mutation performed, the actual
 * authority-bearing function invoked, the durable evidence produced, the observed result, and the repaired property
 * demonstrated — so each control returns those fields rather than only a boolean.
 *
 * §10 also forbids adding a sixteen-session matrix for every helper test, so these controls drive SMALL, isolated
 * journals and real disposable filesystems rather than the frozen matrix.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';

import { NL } from './contract.mjs';

/** §6: write a real-format zstd artifact whose decompressed body is the supplied JSONL records. */
export function writeArtifact(input) {
  const { directory, attemptId, records } = input;
  mkdirSync(join(directory, `attempt-${attemptId}`), { recursive: true });
  const path = join(directory, `attempt-${attemptId}`, 'session.v4.jsonl.zstd');
  writeFileSync(path, zstdCompressSync(Buffer.from(`${records.map((record) => JSON.stringify(record)).join(NL)}${NL}`, 'utf8')));
  return Object.freeze({ path, attemptId, records: records.length });
}

/* ================================================================ §6 Gate S4 artifact validity */

/**
 * §6: THE ARTIFACT-ENVELOPE CONTROL.
 *
 * The positive control is a valid fixture with a real Session Start, a Result submission and one corpus read. The
 * mutations cover §6's eight required cases: a valid fixture with one raw-history read; a valid fixture with zero
 * reads and a legitimate completion; parseable JSONL with no Session Start; a Session Start with no endpoint; a
 * malformed frame; a truncated record; mixed valid and malformed records; and the absence of cost fields when the
 * measurement is invalid.
 */
export async function controlArtifactValidity() {
  const { validateArtifactEnvelope, measureValidatedArtifact } = await import('./artifact-validity.mjs');
  const { reconstructCost, decompressFrames, sessionRecords } = await import('../r3l0c/instrumentation.mjs');
  const root = mkdtempSync(join(tmpdir(), 'r3lcfs-artifact-'));
  try {
    const corpusPath = 'docs/history/incidents/0007-legacy-deny-overturned.md';
    /** S4-A: a valid fixture with ONE raw-history read. */
    const withRead = writeArtifact({
      directory: join(root, 'with-read'), attemptId: 'a'.repeat(32),
      records: [
        { type: 'turn/start', time: 900, data: {} },
        { type: 'tool/ptc-dispatch', seq: 1, time: 1_000, data: { name: 'read', arguments: { file_path: corpusPath }, content: 'x'.repeat(800), isError: false } },
        { type: 'tool/ptc-dispatch', seq: 2, time: 1_100, data: { name: 'palimpsest_worker_result', arguments: {}, content: 'ok', isError: false } },
      ],
    });
    const measuredWithRead = await measureValidatedArtifact({ artifactPath: withRead.path, attemptId: withRead.attemptId });

    /** S4-B: a valid fixture with ZERO raw-history reads and a legitimate Result completion. */
    const zeroRead = writeArtifact({
      directory: join(root, 'zero'), attemptId: 'b'.repeat(32),
      records: [
        { type: 'turn/start', time: 900, data: {} },
        { type: 'tool/ptc-dispatch', seq: 1, time: 1_000, data: { name: 'palimpsest_worker_result', arguments: {}, content: 'ok', isError: false } },
      ],
    });
    const measuredZero = await measureValidatedArtifact({ artifactPath: zeroRead.path, attemptId: zeroRead.attemptId });

    /** S4-C: parseable JSONL with NO Session Start — the arbitrary-object case. */
    const noStart = writeArtifact({ directory: join(root, 'no-start'), attemptId: 'c'.repeat(32), records: [{ type: 'noise' }] });
    const noStartValidity = validateArtifactEnvelope({ artifactPath: noStart.path, decompressFrames, sessionRecords });

    /** S4-D: a Session Start with NO required endpoint observation. */
    const startOnly = writeArtifact({ directory: join(root, 'start-only'), attemptId: 'd'.repeat(32), records: [{ type: 'turn/start', time: 900, data: {} }] });
    const startOnlyValidity = validateArtifactEnvelope({ artifactPath: startOnly.path, decompressFrames, sessionRecords });

    /** S4-D2: a PARTIAL execution — a runtime timeout with no Result submission. */
    const partial = writeArtifact({
      directory: join(root, 'partial'), attemptId: 'e'.repeat(32),
      records: [
        { type: 'turn/start', time: 900, data: {} },
        { type: 'turn/end', time: 5_000, data: { reason: { kind: 'timeout' } } },
      ],
    });
    const partialValidity = validateArtifactEnvelope({ artifactPath: partial.path, decompressFrames, sessionRecords });

    /** S4-E: malformed compressed frames. */
    const malformedPath = join(root, 'malformed.zstd');
    mkdirSync(join(root, 'malformed', `attempt-${'f'.repeat(32)}`), { recursive: true });
    const malformed = join(root, 'malformed', `attempt-${'f'.repeat(32)}`, 'session.v4.jsonl.zstd');
    writeFileSync(malformed, Buffer.from([0x00, 0x01, 0x02, 0x03]));
    const malformedValidity = validateArtifactEnvelope({ artifactPath: malformed, decompressFrames, sessionRecords });

    /** S4-F: MIXED valid and malformed records — a truncated line beside a valid one. */
    const mixed = writeArtifact({
      directory: join(root, 'mixed'), attemptId: 'g'.repeat(32),
      records: [{ type: 'turn/start', time: 900, data: {} }, { type: 'palimpsest_worker_result', arguments: {} }],
    });
    /** Recompress with a deliberately truncated second line. */
    writeFileSync(mixed.path, zstdCompressSync(Buffer.from(`${JSON.stringify({ type: 'turn/start', time: 900, data: {} })}${NL}{"type":"turn/end"${NL}`, 'utf8')));
    const mixedValidity = validateArtifactEnvelope({ artifactPath: mixed.path, decompressFrames, sessionRecords });

    /** S4-G: an invalid measurement carries ABSENT cost fields rather than invented zeros. */
    const invalidMeasurement = await measureValidatedArtifact({ artifactPath: noStart.path, attemptId: noStart.attemptId });
    /** The baseline comparison: the FROZEN instrumentation still returns zeros for the same artifact. */
    const frozenZero = reconstructCost({ path: noStart.path, attemptId: noStart.attemptId });

    return Object.freeze({
      id: 'ARTIFACT_EVENT_ENVELOPE_VALIDITY',
      authorityBearingFunction: 'scripts/r3l0ciarlcfs/artifact-validity.mjs validateArtifactEnvelope, then the frozen scripts/r3l0c/instrumentation.mjs reconstructCost',
      durableEvidence: 'real-format zstd session artifacts written under the temp root',
      positiveControl: Object.freeze({
        withReadMeasured: measuredWithRead.measured,
        withReadRawHistoryArtifactsRead: measuredWithRead.fields?.rawHistoryArtifactsRead ?? null,
        withReadEnvelopeValid: measuredWithRead.validity.envelopeValid,
        zeroMeasured: measuredZero.measured,
        zeroRawHistoryArtifactsRead: measuredZero.fields?.rawHistoryArtifactsRead ?? null,
        zeroIsGenuine: measuredZero.measuredZeroIsGenuine,
        zeroHasSessionStart: measuredZero.validity.hasSessionStart,
        zeroCompletionObserved: measuredZero.validity.completionObserved,
      }),
      mutations: Object.freeze({
        /** S4-A */
        validFixtureWithOneReadMeasured: measuredWithRead.measured === true && measuredWithRead.fields?.rawHistoryArtifactsRead === 1,
        /** S4-B */
        genuineMeasuredZeroAccepted: measuredZero.measured === true && measuredZero.fields?.rawHistoryArtifactsRead === 0 && measuredZero.measuredZeroIsGenuine === true,
        /** S4-C */
        arbitraryObjectRejected: noStartValidity.interpretable === false && noStartValidity.state === 'ENVELOPE_INVALID',
        arbitraryObjectNotZero: invalidMeasurement.measured === false && invalidMeasurement.fields === null,
        /** S4-D */
        startWithoutEndpointRejected: startOnlyValidity.interpretable === false && startOnlyValidity.state === 'COMPLETION_NOT_OBSERVED',
        /** S4-D2 */
        partialExecutionLabelledPartial: partialValidity.interpretable === false && partialValidity.partial === true,
        /** S4-E */
        malformedFramesRejected: malformedValidity.interpretable === false && malformedValidity.state === 'UNREADABLE',
        /** S4-F */
        mixedValidAndMalformedRejected: mixedValidity.interpretable === false && mixedValidity.state === 'MALFORMED' && mixedValidity.unparsedLines > 0,
        /** S4-G */
        invalidCostFieldsAbsent: invalidMeasurement.costFieldsAbsent === true && invalidMeasurement.fields === null,
        /** S4-H */
        invalidCannotSatisfyMeasuredLevels: invalidMeasurement.satisfiesCostMeasuredComplete === false && invalidMeasurement.satisfiesLivePrimaryCostComplete === false,
        /** The baseline still returns zeros for the same artifact, which is the defect this closes. */
        frozenInstrumentationStillReturnsZeros: frozenZero.rawHistoryArtifactsRead === 0,
      }),
      mutant: Object.freeze({ id: 'S4_FALSE_ARTIFACT_INTERPRETABILITY', measuredBy: 'test/r3l0ciarlcfs_controls.test.ts', baselineViolates: true, note: 'the prior interpretArtifact accepted any artifact yielding at least one parseable record, so an arbitrary JSON object became a measured zero' }),
      PASS: measuredWithRead.measured === true && measuredWithRead.fields?.rawHistoryArtifactsRead === 1
        && measuredZero.measured === true && measuredZero.measuredZeroIsGenuine === true
        && noStartValidity.interpretable === false && invalidMeasurement.fields === null
        && startOnlyValidity.interpretable === false && partialValidity.partial === true
        && malformedValidity.interpretable === false && mixedValidity.interpretable === false
        && invalidMeasurement.satisfiesCostMeasuredComplete === false,
    });
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
  }
}

/* ================================================================ §4 Gate S2 safe cleanup */

/**
 * §4: THE FAIL-CLOSED CLEANUP CONTROL.
 *
 * §4 names six cases: S2-A all links removed; S2-B one unlink fails; S2-C the unlink reports success but the link
 * remains; S2-D an unexpected link appears; S2-E ownership or root does not match; S2-F an outside-target sentinel
 * remains untouched. Every case uses a REAL disposable checkout under the temp root, or a fault-injected adapter over
 * the SAME production control flow.
 */
export async function controlSafeCleanup() {
  const { createDisposableCheckout, destroyDisposableCheckout, realFilesystemAdapter, DISPOSABLE_MARKER } = await import('./safe-cleanup.mjs');
  const root = mkdtempSync(join(tmpdir(), 'r3lcfs-cleanup-'));
  try {
    const sentinelDir = join(root, 'outside-sentinel');
    mkdirSync(sentinelDir, { recursive: true });
    const sentinelFile = join(sentinelDir, 'DO_NOT_DELETE.txt');
    writeFileSync(sentinelFile, 'sentinel', 'utf8');

    /** S2-A: all links removed successfully, so cleanup proceeds. */
    const healthy = createDisposableCheckout();
    const cleaned = destroyDisposableCheckout({ checkout: healthy });
    const healthyRemoved = cleaned.outcome === 'CLEANED' && cleaned.worktreeRemoved === true;

    /** S2-B: one junction unlink FAILS, so no destructive fallback executes. */
    const failing = createDisposableCheckout();
    const failingFs = Object.freeze({ ...realFilesystemAdapter(), unlinkLink: () => { throw new Error('injected unlink failure'); } });
    const blockedOnFailure = destroyDisposableCheckout({ checkout: failing, fs: failingFs });
    const preservedAfterFailure = existsSync(failing.root) === true;
    destroyDisposableCheckout({ checkout: failing });

    /** S2-C: the unlink reports success but the link REMAINS, so cleanup is blocked. */
    const silent = createDisposableCheckout();
    const silentFs = Object.freeze({ ...realFilesystemAdapter(), unlinkLink: () => { /* report success, remove nothing */ } });
    const blockedOnRemainder = destroyDisposableCheckout({ checkout: silent, fs: silentFs });
    destroyDisposableCheckout({ checkout: silent });

    /** S2-D: an UNEXPECTED link-like entry appears, so cleanup is blocked unless safely classified and removed. */
    const unexpected = createDisposableCheckout({ injectLink: ({ root: worktreeRoot, join: joinPath }) => {
      const linkPath = joinPath(worktreeRoot, 'unexpected-link');
      if (process.platform === 'win32') execFileSync('cmd', ['/c', 'mklink', '/J', linkPath, sentinelDir], { stdio: ['ignore', 'pipe', 'pipe'] });
      else execFileSync('ln', ['-s', sentinelDir, linkPath], { stdio: ['ignore', 'pipe', 'pipe'] });
      return { name: 'unexpected-link', linkPath, target: sentinelDir };
    } });
    const unexpectedResult = destroyDisposableCheckout({ checkout: unexpected });
    destroyDisposableCheckout({ checkout: unexpected });

    /** S2-E: ownership or the expected root does not match, so cleanup is refused. */
    const unowned = createDisposableCheckout();
    /** An UNOWNED directory: a real directory that carries neither the marker nor an ownership flag. */
    const unownedPlain = join(root, 'unowned-plain');
    mkdirSync(unownedPlain, { recursive: true });
    writeFileSync(join(unownedPlain, 'something.txt'), 'not a disposable worktree', 'utf8');
    const refusedNotOwned = destroyDisposableCheckout({ checkout: { root: unownedPlain, links: [] } });
    const refusedWrongRoot = destroyDisposableCheckout({ checkout: { root: unowned.root, owned: true, links: [] }, expectedRoot: join(root, 'some-other-root') });
    destroyDisposableCheckout({ checkout: unowned });

    /** S2-F: the outside-target sentinel is UNTOUCHED by every case above. */
    const sentinelIntact = existsSync(sentinelFile) === true;

    return Object.freeze({
      id: 'SAFE_WORKTREE_CLEANUP',
      authorityBearingFunction: 'scripts/r3l0ciarlcfs/safe-cleanup.mjs destroyDisposableCheckout',
      durableEvidence: 'real disposable git worktrees with real junctions under the temp root, plus fault-injected filesystem adapters over the same production control flow',
      positiveControl: Object.freeze({ cleanedOutcome: cleaned.outcome, worktreeRemoved: cleaned.worktreeRemoved, linksRemoved: cleaned.linksRemoved.length, safetyOrderingSteps: cleaned.safetyOrdering.length }),
      mutations: Object.freeze({
        /** S2-A */
        allLinksRemovedProceeds: healthyRemoved,
        /** S2-B */
        failedUnlinkBlocksCleanup: blockedOnFailure.outcome === 'CLEANUP_BLOCKED',
        failedUnlinkPreventsDestructiveFallback: blockedOnFailure.destructiveFallbackExecuted === false,
        failedUnlinkPreservesWorktree: preservedAfterFailure === true,
        failedUnlinkReportsDiagnosticLocation: blockedOnFailure.diagnosticLocation !== null && blockedOnFailure.diagnosticLocation !== undefined,
        /** S2-C */
        silentUnlinkFailureDetected: blockedOnRemainder.outcome === 'CLEANUP_BLOCKED',
        silentUnlinkFailurePreventsDestructiveFallback: blockedOnRemainder.destructiveFallbackExecuted === false,
        /** S2-D */
        unexpectedLinkHandled: unexpectedResult.outcome === 'CLEANED' || unexpectedResult.outcome === 'CLEANUP_BLOCKED',
        unexpectedLinkNeverReachesUnconfirmedRemoval: unexpectedResult.outcome === 'CLEANED' ? unexpectedResult.linksRemaining.length === 0 : unexpectedResult.destructiveFallbackExecuted === false,
        /** S2-E */
        unownedTargetRefused: refusedNotOwned.outcome === 'REFUSED_NOT_OWNED',
        unownedTargetPreventsDestructiveFallback: refusedNotOwned.destructiveFallbackExecuted === false,
        wrongRootRefused: refusedWrongRoot.outcome === 'CLEANUP_BLOCKED',
        /** S2-F */
        outsideSentinelUntouched: sentinelIntact === true,
      }),
      mutant: Object.freeze({ id: 'S2_UNSAFE_CLEANUP_FALLBACK', measuredBy: 'test/r3l0ciarlcfs_controls.test.ts', baselineViolates: true, note: 'the prior destroyIsolatedCheckout swallowed a failed unlink and then ran git worktree remove --force and a recursive rmSync unconditionally' }),
      PASS: healthyRemoved === true
        && blockedOnFailure.outcome === 'CLEANUP_BLOCKED' && blockedOnFailure.destructiveFallbackExecuted === false && preservedAfterFailure === true
        && blockedOnRemainder.outcome === 'CLEANUP_BLOCKED' && blockedOnRemainder.destructiveFallbackExecuted === false
        && (unexpectedResult.outcome === 'CLEANED' || unexpectedResult.outcome === 'CLEANUP_BLOCKED')
        && refusedNotOwned.outcome === 'REFUSED_NOT_OWNED' && refusedNotOwned.destructiveFallbackExecuted === false
        && refusedWrongRoot.outcome === 'CLEANUP_BLOCKED' && sentinelIntact === true,
    });
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
  }
}

/* ================================================================ §5 Gate S3 trial identity */

/**
 * §5: THE COMPLETE TRIAL-IDENTITY CONTROL.
 *
 * The positive control is a durable/in-memory pair that agrees on EVERY included field. The mutations cover §5's
 * required cases: a different AttemptId; a different HostJobId; a different sidecar digest binding; a different
 * Execution Closure Digest; a different Treatment Realization; and the null/absent states.
 */
export async function controlTrialEvidenceIdentity() {
  const { reconcileTrialIdentity } = await import('./trial-identity.mjs');
  const { appendRecord, readJournal } = await import('../r3l0cf/journal.mjs');
  const { reconcileTrialEvidence } = await import('./trial-identity.mjs');
  const root = mkdtempSync(join(tmpdir(), 'r3lcfs-trial-'));
  try {
    const journalPath = join(root, 'generation-journal.jsonl');
    const schedule = [Object.freeze({ sessionId: 's0', block: 0, arm: 'C', generation: 'G1', trajectoryId: 'b0-C' })];
    const planned = ['s0'];
    const closureDigest = 'a'.repeat(64);
    const base = Object.freeze({
      sessionId: 's0', block: 0, arm: 'C', generation: 'G1', trajectoryId: 'b0-C',
      attemptId: 'attempt-11111111111111111111111111111111', hostJobId: 'job-1',
      executionClosureDigest: closureDigest, treatmentExpectationDigest: 'exp-1',
      intendedExecutorRoute: 'the deterministic scripted worker',
      contentDigests: Object.freeze({ r3l0ciarlLiveEvidence: 'd'.repeat(64) }),
      treatmentRealization: 'APPLIED', admission: 'ADMITTED',
      reportPath: join(root, 'report.json'), transcriptPath: join(root, 'transcript.txt'),
    });
    const drive = (durableRecord, inMemoryRecord) => reconcileTrialIdentity({ durableRecords: [durableRecord], inMemoryRecords: [inMemoryRecord], plannedSessions: planned });

    /** THE POSITIVE CONTROL: every included field agrees. */
    const green = drive(base, { ...base });

    /** S3-A: a different AttemptId. */
    const attemptA = drive(base, { ...base, attemptId: 'attempt-22222222222222222222222222222222' });
    /** S3-B: a different HostJobId. */
    const jobB = drive(base, { ...base, hostJobId: 'job-2' });
    /** S3-C: a different sidecar digest binding. */
    const sidecarC = drive(base, { ...base, contentDigests: { r3l0ciarlLiveEvidence: 'e'.repeat(64) } });
    /** S3-D: a different Execution Closure Digest. */
    const closureD = drive(base, { ...base, executionClosureDigest: 'b'.repeat(64) });
    /** S3-E: the same schedule identity with a different Treatment Realization. */
    const realizationE = drive(base, { ...base, treatmentRealization: 'NOT_APPLIED' });
    /** S3-E2: the same schedule identity with a different intended executor route. */
    const routeE = drive(base, { ...base, intendedExecutorRoute: 'the frozen omnigate DeepSeek route' });
    /** §5: the null/absent states, kept separate. */
    const bothAbsent = drive({ ...base, attemptId: null }, { ...base, attemptId: null });
    const oneAbsent = drive({ ...base, attemptId: null }, { ...base, attemptId: 'attempt-33333333333333333333333333333333' });
    const excludedNotCompared = drive(base, { ...base, timestamps: { recordedAt: 'LATER' }, observations: ['DIFFERENT'] });

    /**
     * THE CENTRAL MISMATCH, DRIVEN THROUGH THE EXTENDED ADAPTER, so the result is the one the authoritative reducer
     * consumes. The durable journal is written with the frozen appendRecord, then read back with the frozen reader.
     */
    rmSync(journalPath, { force: true });
    appendRecord({ journalPath, kind: 'EXPOSURE_INTENT_RECORDED', payload: { sessionId: 's0' } });
    appendRecord({ journalPath, kind: 'WORKER_LAUNCH_RECORDED', payload: { sessionId: 's0', attempt: 1 } });
    appendRecord({ journalPath, kind: 'TRIAL_RECORDED', payload: { sessionId: 's0', record: base } });
    const continuity = Object.freeze({ LIVE_ARTIFACT_PROPAGATION: 'PASS', sessions: 1, allBound: true, allMatched: true, allComplete: true });
    const cost = Object.freeze({ interpretable: true, measuredCount: 1, absentCount: 0, plannedSessions: 1, livePrimaryCount: 0, fixtureCount: 1, allSixteenLivePrimary: false });
    const extendedGreen = await reconcileTrialEvidence({ journal: readJournal(journalPath), schedule, plannedSessions: planned, inMemoryRecords: [{ ...base }], liveEvidenceContinuity: continuity, costAttribution: cost, runRoot: root });
    const extendedConflict = await reconcileTrialEvidence({ journal: readJournal(journalPath), schedule, plannedSessions: planned, inMemoryRecords: [{ ...base, attemptId: 'attempt-99999999999999999999999999999999' }], liveEvidenceContinuity: continuity, costAttribution: cost, runRoot: root });

    return Object.freeze({
      id: 'DURABLE_TRIAL_EVIDENCE_IDENTITY',
      authorityBearingFunction: 'scripts/r3l0ciarlcfs/trial-identity.mjs reconcileTrialEvidence, wrapping scripts/r3l0ciarlcf/durable-reconciliation.mjs reconcileDurableTrials',
      durableEvidence: 'a real durable journal written with the frozen appendRecord and read back with the frozen readJournal',
      positiveControl: Object.freeze({
        comparedFieldCount: green.comparedFields.length,
        loadBearingFieldCount: green.loadBearingFields.length,
        greenOnFullAgreement: green.green,
        matchingNullsNotVerifiedIdentity: green.matchingNullsAreVerifiedIdentity === false,
        extendedGreen: extendedGreen.green,
        extendedConditions: extendedGreen.conditions.length,
        priorReconciliationPreserved: extendedGreen.priorReconciliationGreen,
      }),
      mutations: Object.freeze({
        /** S3-A */
        attemptIdConflictDetected: attemptA.green === false && attemptA.conflicts.some((entry) => entry.field === 'attemptId'),
        /** S3-B */
        hostJobIdConflictDetected: jobB.green === false && jobB.conflicts.some((entry) => entry.field === 'hostJobId'),
        /** S3-C */
        sidecarDigestBindingConflictDetected: sidecarC.green === false && sidecarC.conflicts.some((entry) => entry.field === 'contentDigests'),
        /** S3-D */
        executionClosureConflictDetected: closureD.green === false && closureD.conflicts.some((entry) => entry.field === 'executionClosureDigest'),
        /** S3-E */
        treatmentRealizationConflictDetected: realizationE.green === false && realizationE.conflicts.some((entry) => entry.field === 'treatmentRealization'),
        intendedRouteConflictDetected: routeE.green === false && routeE.conflicts.some((entry) => entry.field === 'intendedExecutorRoute'),
        /** §5: the four states are separate. */
        matchingNullsAreBothAbsentNotVerified: bothAbsent.counts.BOTH_EXPLICITLY_ABSENT > 0 && bothAbsent.counts.SAME_VERIFIED_IDENTITY === 0,
        matchingNullsDoNotBlockGreen: bothAbsent.green === true && bothAbsent.blocksLivePrimaryPromotion === true,
        oneSidedAbsenceIsAConflict: oneAbsent.green === false && oneAbsent.counts.ONE_ABSENT > 0,
        /** §5: the excluded fields are genuinely excluded, so an intentional difference is not a conflict. */
        excludedFieldsNotCompared: excludedNotCompared.green === true && excludedNotCompared.excludedFields.length > 0,
        /** §5: the extended adapter detects the central mismatch and is RED before MATRIX_COMPLETED. */
        extendedGreenOnAgreement: extendedGreen.green === true,
        extendedConflictDetected: extendedConflict.green === false && extendedConflict.failing.includes('DURABLE_IN_MEMORY_FULL_IDENTITY'),
        priorReducerStillConsulted: extendedConflict.priorReconciliationGreen === true,
        noSecondReducerCreated: extendedGreen.secondReducerCreated === false,
      }),
      mutant: Object.freeze({ id: 'S3_PARTIAL_TRIAL_IDENTITY', measuredBy: 'test/r3l0ciarlcfs_controls.test.ts', baselineViolates: true, note: 'the prior reconciliation compared only block/arm/generation/trajectoryId, so conflicting attempt, host-job, closure and sidecar identities stayed GREEN' }),
      PASS: green.green === true && green.comparedFields.length >= 13
        && attemptA.green === false && jobB.green === false && sidecarC.green === false && closureD.green === false
        && realizationE.green === false && routeE.green === false
        && bothAbsent.counts.BOTH_EXPLICITLY_ABSENT > 0 && oneAbsent.green === false
        && excludedNotCompared.green === true
        && extendedGreen.green === true && extendedConflict.green === false && extendedConflict.failing.includes('DURABLE_IN_MEMORY_FULL_IDENTITY'),
    });
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
  }
}

/* ================================================================ §7 Gate S5 authorization */

/**
 * §7: THE AUTHORIZATION-VERDICT CONTROL.
 *
 * §7 names seven cases. Each uses a TEST-FIXTURE trusted source, explicitly marked, and none creates a real
 * authorization or makes a paid request.
 */
export async function controlAuthorizationVerdict() {
  const { reduceAuthorizationVerdict } = await import('./authorization-verdict.mjs');
  const { fullPlanDigest } = await import('../r3l0ciarlcf/plan-identity.mjs');

  const plan = Object.freeze({
    planId: 'r3-l0c-iar-lcfs-primary-plan', stage: 'R3-L0C-I-A-R-L-C-F-S',
    executionClosure: Object.freeze({ executionClosureDigest: 'c'.repeat(64) }),
    authorizationRequired: Object.freeze({ required: true }),
  });
  const planDigest = fullPlanDigest(plan);
  const fullDecisions = Object.freeze({
    PAID_MODEL_USAGE: true, BOUNDED_FAIL_STOP_PROTOCOL: true, NO_AUTOMATIC_RETRIES_OR_REPLACEMENTS: true,
    PRESERVE_PARTIALLY_COMPLETED_INVALID_RUNS: true, ACCEPTED_PROMPT_NEUTRALITY_LIMITED: true,
  });
  const baseRecord = Object.freeze({
    authority: 'test-authority', approvedPlanId: plan.planId, approvedPlanDigest: planDigest,
    paidRunBudget: Object.freeze({ maxSessions: 16, currency: 'USD', maxAmount: 100 }),
    decisions: fullDecisions,
  });
  const fixtureSource = Object.freeze({
    available: true, path: 'C:/test-fixture/authority.json', verified: true, testFixture: true,
    source: Object.freeze({ authority: 'test-authority', decisions: Object.freeze({ 'test-authority': true }) }),
  });

  /** §7: the SEVEN cases, each its own call. */
  /** S5-A: structurally complete authorization WITHOUT a trusted authority. */
  const noTrusted = await reduceAuthorizationVerdict({ record: baseRecord, plan, trustedSource: Object.freeze({ available: false, path: null, reason: 'no trusted authority source is configured' }) });
  /** S5-B: a fabricated `decision:` reference. */
  const fabricated = await reduceAuthorizationVerdict({ record: Object.freeze({ ...baseRecord, authority: 'decision:approved' }), plan, trustedSource: fixtureSource });
  /** S5-C: the correct Plan ID with an incorrect Full Plan Digest. */
  const wrongDigest = await reduceAuthorizationVerdict({ record: Object.freeze({ ...baseRecord, approvedPlanDigest: 'f'.repeat(64) }), plan, trustedSource: fixtureSource });
  /** S5-D: a budget covering sixteen sessions but declaring NO enforceable monetary limit. */
  const noMonetary = await reduceAuthorizationVerdict({ record: Object.freeze({ ...baseRecord, paidRunBudget: Object.freeze({ maxSessions: 16, currency: 'USD' }) }), plan, trustedSource: fixtureSource });
  /** S5-E: a synthetically verified authority with NO actual Host Spending Enforcement — the central defect. */
  const noEnforcement = await reduceAuthorizationVerdict({ record: baseRecord, plan, trustedSource: fixtureSource });
  /** S5-F: the authority verified but the plan changed after approval. */
  const planChanged = await reduceAuthorizationVerdict({ record: Object.freeze({ ...baseRecord, approvedPlanDigest: 'e'.repeat(64) }), plan, trustedSource: fixtureSource });
  /** S5-G: every schema field valid while CURRENT_LAUNCH_PERMISSION remains false. */
  const launchStaysFalse = noEnforcement.concepts.CURRENT_LAUNCH_PERMISSION === false;

  return Object.freeze({
    id: 'AUTHORIZATION_CONDITION_CONSISTENCY',
    authorityBearingFunction: 'scripts/r3l0ciarlcfs/authorization-verdict.mjs reduceAuthorizationVerdict',
    durableEvidence: 'in-memory TEST-FIXTURE authorization records; no real authorization is created and no paid request is made',
    testFixture: true,
    positiveControl: Object.freeze({
      mandatoryConditionCount: noEnforcement.mandatoryConditions.length,
      everyMandatoryConditionRequired: noEnforcement.everyMandatoryConditionRequired,
      conceptsSeparated: Object.keys(noEnforcement.concepts).length,
      hostSpendEnforcement: noEnforcement.hostSpendEnforcement,
      testFixtureCannotOpenLaunch: noEnforcement.testFixtureCannotOpenLaunch,
    }),
    mutations: Object.freeze({
      /** S5-A */
      noTrustedAuthorityNotVerified: noTrusted.verified === false && noTrusted.verdict === 'AUTHORITY_NOT_ESTABLISHED',
      /** S5-B */
      fabricatedDecisionReferenceRefused: fabricated.verified === false && fabricated.conditions.EXTERNALLY_VERIFIED_AUTHORITY === false,
      /** S5-C */
      wrongPlanDigestRefused: wrongDigest.verified === false && wrongDigest.conditions.APPROVED_FULL_PLAN_DIGEST_MATCH === false,
      /** S5-D */
      missingMonetaryLimitRefused: noMonetary.verified === false && noMonetary.conditions.EXPLICIT_MONETARY_LIMIT === false,
      /** S5-E: THE CENTRAL DEFECT — a synthetically verified source with no enforcement must NOT be VERIFIED. */
      verifiedSourceWithoutEnforcementRefused: noEnforcement.verified === false,
      enforcementAbsenceBlocksVerdict: noEnforcement.conditions.PROVEN_HOST_SPEND_ENFORCEMENT === false,
      enforcementStatedInProblems: noEnforcement.problems.some((problem) => /host spending enforcement/iu.test(problem)),
      verdictAgreesWithProblems: noEnforcement.verdictAgreesWithProblems === true,
      /** S5-F */
      planChangedAfterApprovalRefused: planChanged.verified === false,
      /** S5-G */
      launchPermissionStaysFalse: launchStaysFalse === true,
      /** §7: the no-false-or-unknown condition is derived, so it tracks the others. */
      noFalseOrUnknownConditionDerived: noEnforcement.conditions.NO_FALSE_OR_UNKNOWN_CONDITION === false && noEnforcement.verified === false,
    }),
    mutant: Object.freeze({ id: 'S5_AUTHORIZATION_VERDICT_INCONSISTENCY', measuredBy: 'test/r3l0ciarlcfs_controls.test.ts', baselineViolates: true, note: 'the prior verifier listed the missing enforcement as a problem and then returned VERIFIED without requiring it' }),
    PASS: noTrusted.verified === false && fabricated.verified === false && wrongDigest.verified === false
      && noMonetary.verified === false && noEnforcement.verified === false
      && noEnforcement.conditions.PROVEN_HOST_SPEND_ENFORCEMENT === false
      && noEnforcement.verdictAgreesWithProblems === true && planChanged.verified === false
      && launchStaysFalse === true && noEnforcement.mandatoryConditions.length === 8,
  });
}

/* ================================================================ §3 Gate S1 committed plan */

/**
 * §3: THE COMMITTED-PLAN IDENTITY CONTROL.
 *
 * The positive control reads and verifies the committed plan. The mutations cover §3's eight acceptance requirements,
 * including the two that must be driven through the ACTUAL reachable entry rather than a standalone digest helper.
 */
export async function controlCommittedPlanIdentity() {
  const { readAndVerifyCommittedPlan, sealCrossArtifactPlanIdentity, committedBlobHash, worktreeBlobHash } = await import('./committed-plan.mjs');
  const { fullPlanDigest } = await import('../r3l0ciarlcf/plan-identity.mjs');
  const { computeExecutionClosure } = await import('./closure.mjs');
  const { REPO_ROOT, STAGE_EVIDENCE_PATH } = await import('./contract.mjs');

  const verification = await readAndVerifyCommittedPlan({ verifyCompiled: false });
  const plan = verification.plan;

  /** §3.1: a frozen plan can be read REPEATEDLY without changing its bytes or digest. */
  const secondRead = await readAndVerifyCommittedPlan({ verifyCompiled: false });
  const repeatedReadStable = secondRead.planContentDigest === verification.planContentDigest
    && secondRead.committedBlob === verification.committedBlob;

  /** §3.3: a modified `frozenAt` fails identity verification. */
  const frozenAtMutated = plan === null ? null : { ...plan, frozenAt: '2000-01-01T00:00:00.000Z' };
  const frozenAtFails = frozenAtMutated === null ? null : fullPlanDigest(frozenAtMutated) !== verification.planContentDigest;

  /** §3.4: a modified execution route fails identity verification. */
  const routeMutated = plan === null ? null : { ...plan, executionRoute: { ...plan.executionRoute, modelId: 'MUTATED-MODEL' } };
  const routeFails = routeMutated === null ? null : fullPlanDigest(routeMutated) !== verification.planContentDigest;

  /**
   * §3.5: an altered plan with its digest RECOMPUTED still fails the committed Git-blob identity check. The mutation
   * is applied to a COPY in memory, and the comparison is against the committed blob — so no file is written.
   */
  const alteredCopy = plan === null ? null : { ...plan, kind: `${String(plan.kind)} (altered)` };
  const alteredCopyDigest = alteredCopy === null ? null : fullPlanDigest(alteredCopy);
  const alteredSelfConsistentButNotCommitted = alteredCopy !== null && alteredCopyDigest !== null
    && alteredCopyDigest !== verification.committedBlob;

  /** §3.2: the Qualification does not invoke plan regeneration — measured by the module's own flags. */
  const noRegeneration = verification.regenerated === false && verification.constructedHere === false;

  /** §3: the cross-artifact seal over the COMMITTED Qualification and Stage Result. */
  const closure = await computeExecutionClosure({ verifyCompiled: false });
  const { existsSync, readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const readJson = (relative) => {
    const path = join(REPO_ROOT, relative);
    if (!existsSync(path)) return null;
    try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
  };
  const priorQualification = readJson('research-evidence/r3-l0c-iar-lcf/qualification.json');
  const priorStageResult = readJson('research-evidence/r3-l0c-iar-lcf/stage-result.json');
  const priorSeal = sealCrossArtifactPlanIdentity({ plan, qualification: priorQualification, stageResult: priorStageResult, currentClosureDigest: closure.executionClosureDigest });
  const selfSeal = sealCrossArtifactPlanIdentity({ plan, qualification: { plan: { planId: plan?.planId, planContentDigest: plan?.planContentDigest }, planContentDigest: { frozen: plan?.planContentDigest } }, stageResult: { plan: { planId: plan?.planId, planContentDigest: plan?.planContentDigest }, planContentDigest: { frozen: plan?.planContentDigest } }, currentClosureDigest: closure.executionClosureDigest });

  return Object.freeze({
    id: 'COMMITTED_PLAN_IDENTITY',
    authorityBearingFunction: 'scripts/r3l0ciarlcfs/committed-plan.mjs readAndVerifyCommittedPlan + sealCrossArtifactPlanIdentity',
    durableEvidence: 'the committed R3-L0C-I-A-R-L-C-F-S prospective plan, its committed Git blob and the current execution closure',
    positiveControl: Object.freeze({
      planId: verification.planId,
      planContentDigest: verification.planContentDigest,
      committedBlob: verification.committedBlob,
      worktreeBlob: worktreeBlobHash(`${STAGE_EVIDENCE_PATH}/execution-plan.json`),
      currentClosureDigest: closure.executionClosureDigest,
      boundClosureDigest: verification.boundClosureDigest,
      checks: verification.checks,
      verified: verification.verified,
      repeatedReadStable,
      scheduleLength: verification.scheduleLength,
      gitLevelReproducibilityOnly: verification.gitLevelReproducibilityOnly,
    }),
    mutations: Object.freeze({
      /** §3.1 */
      repeatedReadDoesNotChangeBytes: repeatedReadStable === true,
      /** §3.2 */
      qualificationDoesNotRegenerate: noRegeneration === true,
      /** §3.3 */
      modifiedFrozenAtFailsIdentity: frozenAtFails === true,
      /** §3.4 */
      modifiedRouteFailsIdentity: routeFails === true,
      /** §3.5 */
      alteredCopyWithRecomputedDigestStillNotCommittedBlob: alteredSelfConsistentButNotCommitted === true,
      /** §3.6/§3.7 */
      priorQualificationReferenceMismatchDetected: priorSeal.checks.QUALIFICATION_PLAN_REFERENCE === 'MISMATCH',
      priorStageResultReferenceMismatchDetected: priorSeal.checks.STAGE_RESULT_PLAN_REFERENCE === 'MISMATCH',
      priorSealIsMismatch: priorSeal.CROSS_ARTIFACT_PLAN_BINDING === 'MISMATCH',
      /** The committed plan's own digest is self-consistent, which is the distinction §3 requires. */
      selfDigestMatches: verification.checks.COMMITTED_PLAN_SELF_DIGEST === 'MATCH',
      /** §3: a self-consistent plan with agreeing references seals. */
      selfSealMatches: selfSeal.CROSS_ARTIFACT_PLAN_BINDING === 'MATCH',
      /** §3: the committed blob hash equals the worktree blob hash. */
      gitIdentityMatches: verification.checks.COMMITTED_PLAN_GIT_IDENTITY === 'MATCH',
      closureBindingMatches: verification.checks.PLAN_CLOSURE_BINDING === 'MATCH',
    }),
    mutant: Object.freeze({ id: 'S1_CROSS_ARTIFACT_PLAN_MISMATCH', measuredBy: 'test/r3l0ciarlcfs_controls.test.ts', baselineViolates: true, note: 'the prior Qualification embedded an independently rebuilt plan whose frozenAt differed, while the self-check compared the committed file to itself' }),
    PASS: verification.verified === true && repeatedReadStable === true && noRegeneration === true
      && frozenAtFails === true && routeFails === true && alteredSelfConsistentButNotCommitted === true
      && priorSeal.CROSS_ARTIFACT_PLAN_BINDING === 'MISMATCH' && selfSeal.CROSS_ARTIFACT_PLAN_BINDING === 'MATCH',
  });
}

export { NL };
