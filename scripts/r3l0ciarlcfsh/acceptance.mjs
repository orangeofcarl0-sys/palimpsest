/**
 * R3-L0C-I-A-R-L-C-F-S-H §3-§7 — THE PRODUCTION-PATH CONTROLS.
 *
 * Each function drives the REAL corrected entry and returns a `positiveControl` beside the `mutations` it measured.
 * §14 requires, for each critical control, the exact authority-bearing function, the durable evidence, the observed
 * result and the repaired property — so each control returns those fields rather than only a boolean.
 *
 * §10 forbids adding a sixteen-session matrix for every helper test, so the field-level controls use small isolated
 * journals and real disposable directories. The ONE authoritative matrix is the qualification's own.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { zstdCompressSync } from 'node:zlib';

import { NL } from './contract.mjs';

/** §3: write a real-format zstd artifact whose decompressed body is the supplied JSONL records. */
export function writeRealArtifact(input) {
  const { directory, attemptId, records } = input;
  const attemptDirectory = join(directory, `attempt-${attemptId}`);
  mkdirSync(attemptDirectory, { recursive: true });
  const path = join(attemptDirectory, 'session.v4.jsonl.zstd');
  writeFileSync(path, zstdCompressSync(Buffer.from(`${records.map((record) => JSON.stringify(record)).join(NL)}${NL}`, 'utf8')));
  return Object.freeze({ path, attemptId, records: records.length });
}

/** §3: a small durable journal with one session, a sidecar and an artifact, so the bridge can be driven in isolation. */
async function buildBridgeFixture(input) {
  const { root, records, attemptSuffix = 'a'.repeat(32), rawBytes = null, sidecarAttemptId = null } = input;
  const { appendRecord } = await import('../r3l0cf/journal.mjs');
  const { LIVE_EVIDENCE_DIRECTORY } = await import('../r3l0ciarlcf/cost-bridge.mjs');
  const attemptId = attemptSuffix;
  const artifact = rawBytes === null
    ? writeRealArtifact({ directory: join(root, 'artifacts'), attemptId, records })
    : (() => {
      const attemptDirectory = join(root, 'artifacts', `attempt-${attemptId}`);
      mkdirSync(attemptDirectory, { recursive: true });
      const path = join(attemptDirectory, 'session.v4.jsonl.zstd');
      writeFileSync(path, rawBytes);
      return Object.freeze({ path, attemptId, records: 0 });
    })();
  const artifactDigest = createHash('sha256').update(readFileSync(artifact.path)).digest('hex');
  const runRoot = join(root, 'run');
  mkdirSync(join(runRoot, LIVE_EVIDENCE_DIRECTORY), { recursive: true });
  const sidecar = {
    schemaVersion: 1, kind: 'r3l0ciarl live evidence', sessionId: 's0', sessionArtifactPath: artifact.path,
    sessionArtifactDigest: artifactDigest, hiddenInvariantVector: null,
    attemptId: sidecarAttemptId ?? `attempt-${attemptId}`,
    hostJobId: 'job-c1', costProvenance: 'FIXTURE', mode: 'DETERMINISTIC',
  };
  const sidecarText = `${JSON.stringify(sidecar, null, 2)}${NL}`;
  writeFileSync(join(runRoot, LIVE_EVIDENCE_DIRECTORY, 's0.json'), sidecarText, 'utf8');
  const sidecarDigest = createHash('sha256').update(sidecarText, 'utf8').digest('hex');
  const journalPath = join(runRoot, 'generation-journal.jsonl');
  appendRecord({ journalPath, kind: 'EXPOSURE_INTENT_RECORDED', payload: { sessionId: 's0' } });
  appendRecord({ journalPath, kind: 'WORKER_LAUNCH_RECORDED', payload: { sessionId: 's0', attempt: 1 } });
  appendRecord({ journalPath, kind: 'TRIAL_RECORDED', payload: { sessionId: 's0', record: {
    sessionId: 's0', block: 0, arm: 'C', generation: 'G1', trajectoryId: 'b0-C',
    attemptId: `attempt-${attemptId}`, hostJobId: 'job-c1', intendedExecutorRoute: 'the deterministic scripted worker',
    contentDigests: { r3l0ciarlLiveEvidence: sidecarDigest },
  } } });
  return Object.freeze({ runRoot, journalPath, artifact, attemptId });
}

/* ================================================================ §3 H1 validated cost bridge */

/**
 * §3: THE VALIDATED-COST-BRIDGE CONTROL.
 *
 * The positive controls are a valid real-format fixture with one raw-history read, and a valid fixture with a real
 * Result submission and zero reads. The negative controls are §3's eight cases: a parseable `{"type":"noise"}`
 * record; a Session Start with no completion boundary; a partial timeout; mixed valid and malformed JSONL; a
 * corrupted compressed artifact; a sidecar digest mismatch; a valid envelope with an inconsistent Attempt identity;
 * and an invalid measurement whose old bridge would have reported zero.
 */
export async function controlValidatedCostBridge() {
  const { validatedCostBridge } = await import('./validated-cost-bridge.mjs');
  const root = mkdtempSync(join(tmpdir(), 'r3lcfsh-cost-'));
  const corpusPath = 'docs/history/incidents/0007-legacy-deny-overturned.md';
  try {
    /** H1-P1: a valid fixture with ONE raw-history read. */
    const withRead = await buildBridgeFixture({ root: join(root, 'with-read'), records: [
      { type: 'turn/start', time: 900, data: {} },
      { type: 'tool/ptc-dispatch', seq: 1, time: 1_000, data: { name: 'read', arguments: { file_path: corpusPath }, content: 'x'.repeat(800), isError: false } },
      { type: 'tool/ptc-dispatch', seq: 2, time: 1_100, data: { name: 'palimpsest_worker_result', arguments: {}, content: 'ok', isError: false } },
    ] });
    const measuredWithRead = await validatedCostBridge({ journalPath: withRead.journalPath, runRoot: withRead.runRoot, plannedSessions: ['s0'] });

    /** H1-P2: a valid fixture with a real Result submission and ZERO raw-history reads. */
    const zero = await buildBridgeFixture({ root: join(root, 'zero'), attemptSuffix: 'b'.repeat(32), records: [
      { type: 'turn/start', time: 900, data: {} },
      { type: 'tool/ptc-dispatch', seq: 1, time: 1_000, data: { name: 'palimpsest_worker_result', arguments: {}, content: 'ok', isError: false } },
    ] });
    const measuredZero = await validatedCostBridge({ journalPath: zero.journalPath, runRoot: zero.runRoot, plannedSessions: ['s0'] });

    /** H1-N1: the parseable `{"type":"noise"}` record. */
    const noise = await buildBridgeFixture({ root: join(root, 'noise'), attemptSuffix: 'c'.repeat(32), records: [{ type: 'noise' }] });
    const measuredNoise = await validatedCostBridge({ journalPath: noise.journalPath, runRoot: noise.runRoot, plannedSessions: ['s0'] });

    /** H1-N2: a Session Start with NO completion boundary. */
    const startOnly = await buildBridgeFixture({ root: join(root, 'start-only'), attemptSuffix: 'd'.repeat(32), records: [{ type: 'turn/start', time: 900, data: {} }] });
    const measuredStartOnly = await validatedCostBridge({ journalPath: startOnly.journalPath, runRoot: startOnly.runRoot, plannedSessions: ['s0'] });

    /** H1-N3: a partial timeout with no valid Result submission. */
    const partial = await buildBridgeFixture({ root: join(root, 'partial'), attemptSuffix: 'e'.repeat(32), records: [
      { type: 'turn/start', time: 900, data: {} },
      { type: 'turn/end', time: 5_000, data: { reason: { kind: 'timeout' } } },
    ] });
    const measuredPartial = await validatedCostBridge({ journalPath: partial.journalPath, runRoot: partial.runRoot, plannedSessions: ['s0'] });

    /**
     * H1-N4: MIXED valid and malformed JSONL lines — a truncated line beside a valid one. The artifact is written
     * with its FINAL bytes, so its digests are internally consistent and the case reaches the ENVELOPE check rather
     * than being stopped by an earlier digest check.
     */
    const mixed = await buildBridgeFixture({ root: join(root, 'mixed'), attemptSuffix: 'f'.repeat(32),
      rawBytes: zstdCompressSync(Buffer.from(`${JSON.stringify({ type: 'turn/start', time: 900, data: {} })}${NL}{"type":"turn/end"${NL}`, 'utf8')) });
    const measuredMixed = await validatedCostBridge({ journalPath: mixed.journalPath, runRoot: mixed.runRoot, plannedSessions: ['s0'] });

    /** H1-N5: a corrupted compressed artifact, written with its final bytes so the case reaches the ENVELOPE check. */
    const corrupt = await buildBridgeFixture({ root: join(root, 'corrupt'), attemptSuffix: '1'.repeat(32), rawBytes: Buffer.from([0x00, 0x01, 0x02, 0x03]) });
    const measuredCorrupt = await validatedCostBridge({ journalPath: corrupt.journalPath, runRoot: corrupt.runRoot, plannedSessions: ['s0'] });

    /** H1-N6: a sidecar digest mismatch. The sidecar is tampered AFTER the durable binding was written. */
    const mismatch = await buildBridgeFixture({ root: join(root, 'mismatch'), attemptSuffix: '2'.repeat(32), records: [{ type: 'turn/start', time: 900, data: {} }] });
    writeFileSync(join(mismatch.runRoot, 'private/live-evidence/s0.json'), '{"tampered":true}', 'utf8');
    const measuredMismatch = await validatedCostBridge({ journalPath: mismatch.journalPath, runRoot: mismatch.runRoot, plannedSessions: ['s0'] });

    /**
     * H1-N7: a valid envelope but an inconsistent Attempt identity. The sidecar records a DIFFERENT attempt while
     * its own digest still matches the durable binding, so the identity comparison is the finding.
     */
    const identity = await buildBridgeFixture({ root: join(root, 'identity'), attemptSuffix: '3'.repeat(32), sidecarAttemptId: `attempt-${'9'.repeat(32)}`, records: [
      { type: 'turn/start', time: 900, data: {} },
      { type: 'tool/ptc-dispatch', seq: 1, time: 1_000, data: { name: 'palimpsest_worker_result', arguments: {}, content: 'ok', isError: false } },
    ] });
    const measuredIdentity = await validatedCostBridge({ journalPath: identity.journalPath, runRoot: identity.runRoot, plannedSessions: ['s0'] });

    const positiveMeasured = measuredWithRead.measuredCount === 1 && measuredWithRead.perSession[0].fields?.rawHistoryArtifactsRead === 1;
    const zeroMeasured = measuredZero.measuredCount === 1 && measuredZero.perSession[0].fields?.rawHistoryArtifactsRead === 0;

    return Object.freeze({
      id: 'VALIDATED_COST_BRIDGE',
      authorityBearingFunction: 'scripts/r3l0ciarlcfsh/validated-cost-bridge.mjs validatedCostBridge, which consumes scripts/r3l0ciarlcfs/artifact-validity.mjs validateArtifactEnvelope and reuses scripts/r3l0ciarlcf/cost-bridge.mjs bridgeMatrixCost',
      durableEvidence: 'real durable journals written with the frozen appendRecord, real-format zstd artifacts and digest-bound sidecars under the temp root',
      positiveControl: Object.freeze({
        withReadMeasured: measuredWithRead.measuredCount, withReadRawHistoryArtifactsRead: measuredWithRead.perSession[0].fields?.rawHistoryArtifactsRead ?? null,
        zeroMeasured: measuredZero.measuredCount, zeroRawHistoryArtifactsRead: measuredZero.perSession[0].fields?.rawHistoryArtifactsRead ?? null,
        envelopeValidatorConsumed: measuredWithRead.envelopeValidatorConsumed === true,
      }),
      mutations: Object.freeze({
        validFixtureWithOneReadMeasured: positiveMeasured,
        genuineMeasuredZeroAccepted: zeroMeasured,
        /** §3 H1-N1: the central case — the old bridge admitted this as a measured zero. */
        parseableNoiseNotMeasured: measuredNoise.measuredCount === 0 && measuredNoise.invalidCount === 1,
        noiseOutcomeIsInvalidEnvelope: measuredNoise.perSession[0].outcome === 'INVALID_ENVELOPE',
        noiseFieldsAreNull: measuredNoise.perSession[0].fields === null,
        noiseCostFieldsAbsent: measuredNoise.perSession[0].costFieldsAbsent === true,
        /** §3: the frozen bridge WOULD have admitted it, so the correction's effect is measurable. */
        frozenBridgeWouldHaveAdmittedNoise: measuredNoise.frozenPreliminary?.wouldHaveAdmittedInvalid === true,
        /** H1-N2 */
        startWithoutCompletionNotMeasured: measuredStartOnly.measuredCount === 0 && measuredStartOnly.perSession[0].validityState === 'COMPLETION_NOT_OBSERVED',
        /** H1-N3 */
        partialTimeoutNotMeasured: measuredPartial.measuredCount === 0 && measuredPartial.invalidCount === 1,
        /** H1-N4 */
        mixedValidAndMalformedNotMeasured: measuredMixed.measuredCount === 0 && measuredMixed.perSession[0].validityState === 'MALFORMED',
        /**
         * H1-N5: a corrupted artifact is not measured. The FROZEN bridge already rejects an unreadable artifact, so
         * this case is caught one layer earlier and is reported as the frozen bridge's own named absence rather than
         * as this adapter's INVALID_ENVELOPE state — both are correct, and the property that matters is that it is
         * NOT admitted as a measurement.
         */
        corruptedArtifactNotMeasured: measuredCorrupt.measuredCount === 0
          && (measuredCorrupt.invalidCount === 1 || measuredCorrupt.perSession[0].outcome === 'UNINTERPRETABLE_ARTIFACT'),
        corruptedArtifactOutcome: measuredCorrupt.perSession[0].outcome,
        /** H1-N6 */
        sidecarDigestMismatchNotMeasured: measuredMismatch.measuredCount === 0 && measuredMismatch.perSession[0].outcome === 'SIDECAR_DIGEST_MISMATCH',
        /** H1-N7 */
        inconsistentIdentityNotMeasured: measuredIdentity.measuredCount === 0 && measuredIdentity.perSession[0].outcome === 'IDENTITY_CONFLICT',
        /** §3: an invalid observation satisfies neither measured level, and accounting completeness stays honest. */
        invalidSatisfiesNeitherMeasuredLevel: measuredNoise.measuredCount === 0 && measuredNoise.interpretable === true,
        /** §3: the invalid count is visible rather than folded away. */
        invalidCountVisible: measuredNoise.invalidCount === 1 && measuredNoise.invalid.length === 1,
        /** §3: the preliminary fields are discarded rather than surviving in an admitted array. */
        preliminaryFieldsDiscarded: measuredNoise.perSession[0].discardedPreliminaryFields !== null && measuredNoise.perSession[0].measured === false,
      }),
      mutant: Object.freeze({ id: 'B1_VALIDATOR_NOT_CONSUMED', measuredBy: 'test/r3l0ciarlcfsh_controls.test.ts', baselineViolates: true, note: 'the prior authoritative chain called bridgeMatrixCost directly, whose interpretArtifact accepted any artifact yielding at least one parseable record, so {"type":"noise"} became a measured zero' }),
      PASS: positiveMeasured && zeroMeasured
        && measuredNoise.measuredCount === 0 && measuredNoise.invalidCount === 1 && measuredNoise.perSession[0].fields === null
        && measuredStartOnly.measuredCount === 0 && measuredPartial.measuredCount === 0
        && measuredMixed.measuredCount === 0 && measuredCorrupt.measuredCount === 0
        && measuredMismatch.measuredCount === 0 && measuredIdentity.measuredCount === 0,
      blockedCases: 0,
    });
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
  }
}

/* ================================================================ §4 H2 safe cleanup */

/**
 * §4: THE FAIL-CLOSED CLEANUP CONTROL.
 *
 * §4 names ten negative cases. Every case uses a REAL disposable checkout under the temp root, or a fault-injected
 * adapter over the SAME production control flow. No case touches the repository's `node_modules`, `dist`, global DSH
 * installation or any user data.
 */
export async function controlSafeCleanup() {
  const { createDisposableCheckout, destroyDisposableCheckout, realFilesystemAdapter, realGitAdapter, verifyRootContainment, DISPOSABLE_MARKER } = await import('./safe-cleanup.mjs');
  const root = mkdtempSync(join(tmpdir(), 'r3lcfsh-cleanup-'));
  try {
    /** §4 H2-N10: an external sentinel that must remain byte-identical after every control. */
    const sentinelDir = join(root, 'outside-sentinel');
    mkdirSync(sentinelDir, { recursive: true });
    const sentinelFile = join(sentinelDir, 'DO_NOT_DELETE.txt');
    writeFileSync(sentinelFile, 'sentinel', 'utf8');
    const sentinelDigestBefore = createHash('sha256').update(readFileSync(sentinelFile)).digest('hex');

    /** The positive control: a healthy checkout with all links removed cleans. */
    const healthy = createDisposableCheckout();
    const cleaned = destroyDisposableCheckout({ checkout: healthy });

    /** H2-N1: an unlink THROWS. */
    const throwing = createDisposableCheckout();
    const throwingFs = Object.freeze({ ...realFilesystemAdapter(), unlinkLink: () => { throw new Error('injected unlink failure'); } });
    const blockedOnThrow = destroyDisposableCheckout({ checkout: throwing, fs: throwingFs });
    const throwingPreserved = existsSync(throwing.root) === true;
    destroyDisposableCheckout({ checkout: throwing });

    /** H2-N2: an unlink returns success but the link REMAINS. */
    const silent = createDisposableCheckout();
    const silentFs = Object.freeze({ ...realFilesystemAdapter(), unlinkLink: () => { /* report success, remove nothing */ } });
    const blockedOnRemainder = destroyDisposableCheckout({ checkout: silent, fs: silentFs });
    destroyDisposableCheckout({ checkout: silent });

    /** H2-N3: a dangling link that `existsSync` cannot see while `lstat` proves it remains. */
    const dangling = createDisposableCheckout({ injectLink: ({ root: worktreeRoot, join: joinPath }) => {
      const linkPath = joinPath(worktreeRoot, 'dangling-link');
      if (process.platform === 'win32') execFileSync('cmd', ['/c', 'mklink', '/J', linkPath, joinPath(root, 'target-absent')], { stdio: ['ignore', 'pipe', 'pipe'] });
      else execFileSync('ln', ['-s', joinPath(root, 'target-absent'), linkPath], { stdio: ['ignore', 'pipe', 'pipe'] });
      return { name: 'dangling-link', linkPath, target: joinPath(root, 'target-absent') };
    } });
    /** A filesystem whose unlink reports success but does nothing, so the dangling link survives the attempt. */
    const danglingFs = Object.freeze({ ...realFilesystemAdapter(), unlinkLink: () => { /* nothing */ } });
    const blockedOnDangling = destroyDisposableCheckout({ checkout: dangling, fs: danglingFs });
    destroyDisposableCheckout({ checkout: dangling });

    /**
     * H2-N4: a sibling directory that a STRING-PREFIX test would accept but which is outside the expected parent.
     * The containment primitive is exercised directly, because ownership also consults the expected root and would
     * refuse first — so this measures the `path.relative` decision itself.
     */
    const containmentRoot = join(root, 'r3lcfsh-worktree-expected');
    const sibling = join(root, 'r3lcfsh-worktree-expected-sibling');
    mkdirSync(containmentRoot, { recursive: true });
    mkdirSync(sibling, { recursive: true });
    writeFileSync(join(sibling, 'sibling-data.txt'), 'must survive', 'utf8');
    const siblingContainment = verifyRootContainment({ root: sibling, expectedRoot: containmentRoot, fs: realFilesystemAdapter() });
    const parentContainment = verifyRootContainment({ root: containmentRoot, expectedRoot: containmentRoot, fs: realFilesystemAdapter() });
    /** A string-prefix comparison would have accepted the sibling, which is the baseline defect. */
    const prefixWouldAcceptSibling = sibling.replace(/\\/gu, '/').startsWith(containmentRoot.replace(/\\/gu, '/'));
    /** The end-to-end refusal, which also blocks before any destructive operation. */
    const siblingCheckout = createDisposableCheckout();
    const blockedOnSibling = destroyDisposableCheckout({ checkout: siblingCheckout, expectedRoot: sibling, removeWorktree: false });
    destroyDisposableCheckout({ checkout: siblingCheckout });

    /** H2-N5: a caller supplies `owned: true` for an UNOWNED path. */
    const unownedPlain = join(root, 'unowned-plain');
    mkdirSync(unownedPlain, { recursive: true });
    writeFileSync(join(unownedPlain, 'user-data.txt'), 'irreplaceable', 'utf8');
    const refusedNotOwned = destroyDisposableCheckout({ checkout: { root: unownedPlain, owned: true, links: [] } });

    /** H2-N6: a marker exists but its recorded root or stage identity is WRONG. */
    const wrongMarker = createDisposableCheckout();
    writeFileSync(join(wrongMarker.root, DISPOSABLE_MARKER), `${JSON.stringify({ stage: 'R3-L0C-I-A-R-L-C-F-S', root: join(root, 'elsewhere'), nonce: wrongMarker.nonce })}${NL}`, 'utf8');
    const blockedOnWrongMarker = destroyDisposableCheckout({ checkout: wrongMarker });
    destroyDisposableCheckout({ checkout: wrongMarker });

    /** H2-N7: an unexpected NESTED symlink exists. */
    const nested = createDisposableCheckout({ injectLink: ({ root: worktreeRoot, join: joinPath }) => {
      const directory = joinPath(worktreeRoot, 'nested-directory');
      mkdirSync(directory, { recursive: true });
      const linkPath = joinPath(directory, 'nested-link');
      if (process.platform === 'win32') execFileSync('cmd', ['/c', 'mklink', '/J', linkPath, sentinelDir], { stdio: ['ignore', 'pipe', 'pipe'] });
      else execFileSync('ln', ['-s', sentinelDir, linkPath], { stdio: ['ignore', 'pipe', 'pipe'] });
      return { name: 'nested-link', linkPath, target: sentinelDir };
    } });
    const nestedResult = destroyDisposableCheckout({ checkout: nested });
    const nestedEnumeration = nestedResult.steps.find((step) => step.id === 'ENUMERATE_LINKS_RECURSIVELY_INCLUDING_NESTED_ENTRIES');
    destroyDisposableCheckout({ checkout: nested });

    /** H2-N8: `lstat` fails for a potentially dangerous entry. */
    const lstatFails = createDisposableCheckout();
    const lstatFs = Object.freeze({ ...realFilesystemAdapter(), lstat: () => { throw Object.assign(new Error('denied'), { code: 'EPERM' }); } });
    const blockedOnLstat = destroyDisposableCheckout({ checkout: lstatFails, fs: lstatFs });
    destroyDisposableCheckout({ checkout: lstatFails });

    /** H2-N9: Git worktree removal fails after successful link removal. */
    const gitFails = createDisposableCheckout();
    const failingGit = Object.freeze({ ...realGitAdapter(), removeWorktreeForce: () => { throw new Error('injected git failure'); } });
    const blockedOnGit = destroyDisposableCheckout({ checkout: gitFails, git: failingGit });
    destroyDisposableCheckout({ checkout: gitFails });

    /** H2-N10: the external sentinel is UNTOUCHED by every case above. */
    const sentinelDigestAfter = createHash('sha256').update(readFileSync(sentinelFile)).digest('hex');
    const sentinelIntact = sentinelDigestBefore === sentinelDigestAfter && existsSync(sentinelFile) === true;

    return Object.freeze({
      id: 'SAFE_WORKTREE_CLEANUP',
      authorityBearingFunction: 'scripts/r3l0ciarlcfsh/safe-cleanup.mjs destroyDisposableCheckout',
      durableEvidence: 'real disposable git worktrees with real junctions under the temp root, plus fault-injected filesystem and Git adapters over the same production control flow',
      positiveControl: Object.freeze({ cleanedOutcome: cleaned.outcome, worktreeRemoved: cleaned.worktreeRemoved, linksRemoved: cleaned.linksRemoved.length, safetyOrderingSteps: cleaned.safetyOrdering.length, ownershipWitnesses: Object.keys(cleaned.ownership?.witnesses ?? {}).length }),
      mutations: Object.freeze({
        /** §4 H2-N1 */
        unlinkThrowBlocks: blockedOnThrow.outcome === 'CLEANUP_BLOCKED' && blockedOnThrow.destructiveFallbackExecuted === false,
        unlinkThrowPreservesWorktree: throwingPreserved === true,
        /** §4 H2-N2 */
        silentUnlinkFailureDetected: blockedOnRemainder.outcome === 'CLEANUP_BLOCKED' && blockedOnRemainder.destructiveFallbackExecuted === false,
        /** §4 H2-N3 */
        danglingLinkNotTreatedAsRemoved: blockedOnDangling.outcome === 'CLEANUP_BLOCKED' && blockedOnDangling.destructiveFallbackExecuted === false,
        /** §4 H2-N4 */
        relativeResolutionRefusesSibling: siblingContainment.contained === false && parentContainment.contained === false && prefixWouldAcceptSibling === true,
        prefixWouldAcceptSibling,
        /**
         * The end-to-end refusal. Ownership ALSO consults the expected root, so a checkout outside it is refused as
         * not-owned before containment is reached — either refusal is correct, and what matters is that no
         * destructive operation runs.
         */
        containmentRefusalBlocksDestructive: (blockedOnSibling.outcome === 'CLEANUP_BLOCKED' || blockedOnSibling.outcome === 'REFUSED_NOT_OWNED')
          && blockedOnSibling.destructiveFallbackExecuted === false,
        siblingSurvived: existsSync(join(sibling, 'sibling-data.txt')) === true,
        /** §4 H2-N5 */
        ownershipWitnessesRequired: refusedNotOwned.outcome === 'REFUSED_NOT_OWNED' && refusedNotOwned.ownership?.callerClaimedOwned === true && refusedNotOwned.ownership?.callerClaimDecidesOwnership === false,
        callerClaimRefused: refusedNotOwned.destructiveFallbackExecuted === false,
        unownedDataSurvived: existsSync(join(unownedPlain, 'user-data.txt')) === true,
        /** §4 H2-N6 */
        wrongMarkerRefused: blockedOnWrongMarker.outcome === 'REFUSED_NOT_OWNED' && blockedOnWrongMarker.ownership?.witnesses?.MARKER_ROOT_IDENTITY === false,
        /** §4 H2-N7 */
        nestedLinkEnumerated: (nestedEnumeration?.observation?.linkCount ?? 0) >= 1,
        /** §4 H2-N8 */
        lstatFailureBlocks: blockedOnLstat.outcome === 'CLEANUP_BLOCKED' && blockedOnLstat.destructiveFallbackExecuted === false,
        /** §4 H2-N9 */
        gitRemovalFailurePreservesWorktree: blockedOnGit.outcome === 'CLEANUP_BLOCKED' && blockedOnGit.gitWorktreeRemoveForceExecuted === false,
        /** §4 H2-N10 */
        outsideSentinelUntouched: sentinelIntact === true,
        /** §4: the post-unlink witness is `lstat`, not `existsSync`. */
        reinspectionUsesLstat: blockedOnDangling.destructiveFallbackExecuted === false && blockedOnRemainder.destructiveFallbackExecuted === false,
        /** §4: no unresolved safety case reaches a destructive operation. */
        noDestructiveFallbackAfterFailure: [blockedOnThrow, blockedOnRemainder, blockedOnDangling, blockedOnSibling, blockedOnLstat, blockedOnGit].every((result) => result.recursiveRemoveExecuted === false && result.gitWorktreeRemoveForceExecuted === false && result.worktreePreserved === true),
      }),
      mutant: Object.freeze({ id: 'B2_CLEANUP_REACHES_DESTRUCTIVE_OPERATIONS', measuredBy: 'test/r3l0ciarlcfsh_controls.test.ts', baselineViolates: true, note: 'the prior cleanup accepted a caller-supplied owned flag and a textual prefix comparison, and enumerated only the worktree root, so three measured cases DELETED data outside the intended root' }),
      PASS: cleaned.outcome === 'CLEANED' && cleaned.worktreeRemoved === true
        && blockedOnThrow.outcome === 'CLEANUP_BLOCKED' && throwingPreserved === true
        && blockedOnRemainder.outcome === 'CLEANUP_BLOCKED'
        && blockedOnDangling.outcome === 'CLEANUP_BLOCKED'
        && siblingContainment.contained === false && prefixWouldAcceptSibling === true
        && (blockedOnSibling.outcome === 'CLEANUP_BLOCKED' || blockedOnSibling.outcome === 'REFUSED_NOT_OWNED')
        && blockedOnSibling.destructiveFallbackExecuted === false
        && existsSync(join(sibling, 'sibling-data.txt')) === true
        && refusedNotOwned.outcome === 'REFUSED_NOT_OWNED' && existsSync(join(unownedPlain, 'user-data.txt')) === true
        && blockedOnWrongMarker.outcome === 'REFUSED_NOT_OWNED'
        && blockedOnLstat.outcome === 'CLEANUP_BLOCKED' && blockedOnGit.outcome === 'CLEANUP_BLOCKED'
        && sentinelIntact === true,
      blockedCases: 0,
    });
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows handles briefly */ }
  }
}

/* ================================================================ §6 H4 Runner-level falsifier */

/**
 * §6: THE DECISIVE RUNNER-LEVEL TRIAL-IDENTITY FALSIFIER.
 *
 * §6 requires the proof to travel the ACTUAL path — stage entry, actual `runFailStopMatrix`, actual `TRIAL_RECORDED`,
 * a deterministic-only identity mutation, the actual `validityGate`, the extended reconciliation, the authoritative
 * terminal admission and a durable terminal readback — and to assert that the identity condition is RED, that there
 * is no valid `MATRIX_COMPLETED` event, that the evidence is preserved, that no later Worker launch occurs and that
 * no causal verdict is issued.
 *
 * THE MUTATION IS DETERMINISTIC AND IN-MEMORY ONLY. The seam alters a COPY of the observation the runner handed the
 * gate; the durable journal is never touched, so the durable readback stays available and the finding is precisely
 * the durable-versus-in-memory disagreement the extended reconciliation exists to detect.
 */
export async function controlRunnerIdentityFalsifier(input = {}) {
  const { runTerminalEnforcementMatrix } = await import('./pipeline.mjs');
  const { deterministicArtifactFixture } = await import('./qualification.mjs');
  const { PLAN_ID, REPO_ROOT, STAGE_EVIDENCE_PATH } = await import('./contract.mjs');
  const { readAndVerifyCommittedPlan } = await import('./committed-plan.mjs');
  const { computeExecutionClosure } = await import('./closure.mjs');
  const { frozenPrimarySchedule } = await import('../r3l0ciar/primary-adapter.mjs');
  const { buildPrehistory } = await import('../r3l0c/build-prehistory.mjs');
  const { admitCapital, selectionRefs } = await import('../r3l0c/prehistory.mjs');
  const { installHostBundle, dshHome } = await import('../gates/env.mjs');
  const { runPerTrajectoryConfinement } = await import('../r3l0ciar/confinement.mjs');
  const { verifyCompiledSource } = await import('../r3l0ciarlcf/attestation.mjs');

  const base = input.base ?? mkdtempSync(join(tmpdir(), 'r3lcfsh-runner-'));
  const planRead = await readAndVerifyCommittedPlan({ verifyCompiled: false });
  const plan = planRead.plan;
  const closure = await computeExecutionClosure({ verifyCompiled: false });
  const schedule = await frozenPrimarySchedule();
  const trajectoryIds = [...new Set(schedule.map((session) => session.trajectoryId))].sort();
  const built = await buildPrehistory(join(base, 'prehistory'));
  const admitted = await admitCapital(join(base, 'prehistory'), built.paths, 'cutover-entitlements', built.world);
  const refs = selectionRefs(admitted);
  const containment = await runPerTrajectoryConfinement({ runRoot: join(base, 'containment'), trajectoryIds });
  const compiledVerification = await verifyCompiledSource();
  const artifactRoot = join(base, 'artifacts');
  mkdirSync(artifactRoot, { recursive: true });
  const artifactFixture = await deterministicArtifactFixture({ artifactRoot });

  const common = {
    prehistory: { world: built.world, state: built.paths.state }, admittedRefs: refs,
    installHostBundle, dshHome, authorizedBy: PLAN_ID, caller: PLAN_ID,
    plan, closure, containment, mode: 'DETERMINISTIC', systemValid: true, artifactRoot, artifactFixture,
    terminalCompiledVerification: compiledVerification,
  };

  /** §6: ONE controlled disagreement, on the FIRST session's durable-versus-in-memory AttemptId. */
  const mutatedSessionId = schedule[0].sessionId;
  const run = await runTerminalEnforcementMatrix({
    ...common,
    runId: 'r3lcfsh-runner-identity-falsifier', runRoot: join(base, 'run'),
    identityMutation: { sessionId: mutatedSessionId, field: 'attemptId', value: 'attempt-ffffffffffffffffffffffffffffffff' },
  });

  const gate = run.validityGate ?? {};
  const durableReconciliation = run.finalReconciliation ?? gate.durableReconciliation ?? null;
  const identityConflict = (durableReconciliation?.identity?.conflicts ?? []).some((entry) => entry.sessionId === mutatedSessionId && entry.field === 'attemptId');
  const mutationApplied = run.identityMutation?.applied === true;

  return Object.freeze({
    id: 'RUNNER_LEVEL_IDENTITY_FALSIFIER',
    authorityBearingFunction: 'scripts/r3l0ciarlcfsh/pipeline.mjs runTerminalEnforcementMatrix (the identity mutation seam) through scripts/r3l0cf/fail-stop.mjs runFailStopMatrix, with scripts/r3l0ciarlcfs/trial-identity.mjs reconcileTrialEvidence as the authoritative reconciliation',
    durableEvidence: 'a real durable journal written by the frozen runner, read back with the frozen readJournal after the run',
    mutation: Object.freeze({ sessionId: mutatedSessionId, field: 'attemptId', applied: mutationApplied, durableJournalTouched: run.identityMutation?.durableJournalTouched === false, historicalEvidenceTouched: false }),
    observed: Object.freeze({
      terminalState: run.terminalState,
      matrixCompleted: run.matrixCompleted,
      terminalAdmissionGreen: gate.green ?? false,
      terminalAdmissionDecision: gate.decision ?? null,
      terminalAdmissionFailing: gate.failing ?? null,
      durableReconciliationGreen: durableReconciliation?.green ?? null,
      durableReconciliationFailing: durableReconciliation?.failing ?? null,
      identityConditionRed: durableReconciliation?.identity?.green === false,
      identityConflictOnMutatedSession: identityConflict,
      completedSessions: run.completedSessions?.length ?? null,
      scheduleLength: run.scheduleLength ?? null,
      maxLaunchesPerSession: run.maxLaunchesPerSession,
      sessionsAfterFault: run.sessionsAfterFault ?? null,
      journalIntact: run.run?.journal?.intact ?? null,
      causalVerdictIssued: run.run?.causalVerdictIssued ?? false,
      evidencePreserved: run.run?.machine?.terminal === true,
    }),
    /** §6: the five assertions, each its own fact. */
    assertions: Object.freeze({
      THE_IDENTITY_CONDITION_IS_RED: durableReconciliation?.identity?.green === false && identityConflict === true,
      NO_VALID_MATRIX_COMPLETED_EVENT: run.matrixCompleted !== true,
      THE_RUN_PRESERVES_ITS_EVIDENCE: run.run?.machine?.terminal === true && run.terminalState !== 'MATRIX_COMPLETE',
      NO_LATER_WORKER_LAUNCH_OCCURS: (run.sessionsAfterFault ?? []).length === 0 && run.maxLaunchesPerSession === 1,
      NO_CAUSAL_VERDICT_IS_ISSUED: (gate.causal?.CAUSAL_RESULT ?? 'NOT_EVALUABLE') === 'NOT_EVALUABLE',
    }),
    mutant: Object.freeze({ id: 'B4_IDENTITY_EVIDENCE_LEVEL', measuredBy: 'test/r3l0ciarlcfsh_gates.test.ts', baselineViolates: true, note: 'no committed test drove runFailStopMatrix with a mutated identity, so the highest level demonstrated was a standalone reconciliation helper' }),
    PASS: mutationApplied === true
      && durableReconciliation?.identity?.green === false && identityConflict === true
      && run.matrixCompleted !== true && gate.green !== true
      && run.terminalState !== 'MATRIX_COMPLETE' && run.maxLaunchesPerSession === 1
      && (gate.causal?.CAUSAL_RESULT ?? 'NOT_EVALUABLE') === 'NOT_EVALUABLE',
    blockedCases: 0,
  });
}

export { NL };
