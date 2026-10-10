/**
 * R3-L0C-I-A-R-L-C-F §3-§7 — THE PRODUCTION-PATH CONTROLS.
 *
 * Each function drives the REAL corrected entry and returns a `positiveControl` beside the `mutations` the control
 * measured. §10 requires, for each critical negative control, the baseline defect, the mutation performed, the
 * actual authority-bearing function invoked, the durable evidence produced, the observed result, and the repaired
 * property demonstrated — so each control returns those fields rather than only a boolean.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NL } from './contract.mjs';
import { writeRealFormatArtifact } from './baseline/legacy-controls.mjs';

/* ================================================================ §4 Gate F2 artifact identity and provenance */

/**
 * §4: THE ARTIFACT-IDENTITY AND PROVENANCE CONTROL.
 *
 * A real-format artifact is written under a session-scoped DSH home with the CANONICAL attempt identity, its
 * sidecar is bound into a durable record, and the cost is attributed from a genuine journal readback. The mutations
 * cover: a prefix-collision attempt id; a conflicting host job id; a missing artifact; an ambiguous artifact set; a
 * corrupted artifact; a deterministic artifact with fabricated PRIMARY route and mode claims; and the FIXTURE
 * measurement producing no live verdict.
 */
export async function controlArtifactIdentity(input) {
  const { writeLiveEvidence, liveEvidenceBinding } = await import('../r3l0ciarl/live-evidence.mjs');
  const { appendRecord, JOURNAL_FILE } = await import('../r3l0cf/journal.mjs');
  const { bridgeMatrixCost, attributeSessionFromRecord } = await import('./cost-bridge.mjs');
  const { attemptIdentityEquals, discoverScheduledArtifact, corroborateExecutionWitness } = await import('./artifact-identity.mjs');
  const root = mkdtempSync(join(tmpdir(), 'r3lcf-identity-'));
  try {
    const runRoot = join(root, 'run');
    const dshHome = join(root, '.dsh');
    mkdirSync(runRoot, { recursive: true });
    const journalPath = join(runRoot, JOURNAL_FILE);
    const sessionId = 'b0-C-G1';
    /** §4: the CANONICAL attempt id, and its BARE path form — the exact normalization contract. */
    const canonicalAttemptId = 'attempt-dd64ac801a0e56a0c07b97a5ccc07c7c';
    const bareAttemptId = 'dd64ac801a0e56a0c07b97a5ccc07c7c';
    const artifact = writeRealFormatArtifact({ directory: join(dshHome, sessionId), attemptId: bareAttemptId });

    const sidecar = writeLiveEvidence({
      runRoot, sessionId, sessionArtifactPath: artifact.path,
      hiddenInvariantVector: { failedPrepaidClasses: [], prepaidCoverage: 1 },
      attemptId: canonicalAttemptId, hostJobId: 'job-9f8e7d', costProvenance: 'FIXTURE', mode: 'DETERMINISTIC',
    });
    const record = {
      sessionId, block: 0, arm: 'C', generation: 'G1', trajectoryId: 'b0-C', runId: 'r3lcf-control',
      attemptId: canonicalAttemptId, hostJobId: 'job-9f8e7d', intendedExecutorRoute: 'the deterministic scripted worker',
      contentDigests: liveEvidenceBinding(sidecar.digest),
    };
    appendRecord({ journalPath, kind: 'TRIAL_RECORDED', payload: { sessionId, record } });
    appendRecord({ journalPath, kind: 'WORKER_LAUNCH_RECORDED', payload: { sessionId, attempt: 1 } });

    /** THE POSITIVE CONTROL: the cost is attributed from a genuine journal readback, by exact identity. */
    const bridged = await bridgeMatrixCost({ journalPath, runRoot, plannedSessions: [sessionId], dshHomePath: dshHome });
    const attributed = bridged.perSession[0];

    /** MUTATION F2-A: the canonical and path-normalized identities AGREE under exact comparison. */
    const identitiesAgree = attemptIdentityEquals(canonicalAttemptId, bareAttemptId);

    /** MUTATION F2-B: a PREFIX/substring attempt id collision is refused. */
    const prefixCollision = attemptIdentityEquals('attempt-abcdef', 'attempt-abcdef0123456789');
    const crossed = writeLiveEvidence({
      runRoot, sessionId, sessionArtifactPath: artifact.path,
      hiddenInvariantVector: { failedPrepaidClasses: [], prepaidCoverage: 1 },
      attemptId: 'attempt-ffffffffffffffffffffffffffffffff', hostJobId: 'job-9f8e7d', costProvenance: 'FIXTURE', mode: 'DETERMINISTIC',
    });
    const crossedRecord = Object.freeze({ ...record, contentDigests: liveEvidenceBinding(crossed.digest) });
    const identityConflict = await attributeSessionFromRecord({ runRoot, record: crossedRecord, dshHomePath: dshHome });

    /** MUTATION F2-C: a conflicting host job id is refused. */
    const jobCrossed = writeLiveEvidence({
      runRoot, sessionId, sessionArtifactPath: artifact.path,
      hiddenInvariantVector: { failedPrepaidClasses: [], prepaidCoverage: 1 },
      attemptId: canonicalAttemptId, hostJobId: 'job-different', costProvenance: 'FIXTURE', mode: 'DETERMINISTIC',
    });
    const jobRecord = Object.freeze({ ...record, contentDigests: liveEvidenceBinding(jobCrossed.digest) });
    const jobConflict = await attributeSessionFromRecord({ runRoot, record: jobRecord, dshHomePath: dshHome });

    /**
     * MUTATION F2-D1: an artifact that is ABSENT and NOT DISCOVERABLE is refused.
     *
     * The record's attempt identity is one that does NOT exist under the scoped home, so neither the sidecar's named
     * path nor the discovery finds it.
     */
    const absentIdentity = 'attempt-00000000000000000000000000000000';
    const absent = writeLiveEvidence({
      runRoot, sessionId, sessionArtifactPath: join(dshHome, sessionId, absentIdentity, 'session.v4.jsonl.zstd'),
      hiddenInvariantVector: { failedPrepaidClasses: [], prepaidCoverage: 1 },
      attemptId: absentIdentity, hostJobId: 'job-9f8e7d', costProvenance: 'FIXTURE', mode: 'DETERMINISTIC',
    });
    const absentRecord = Object.freeze({ ...record, attemptId: absentIdentity, contentDigests: liveEvidenceBinding(absent.digest) });
    const missingArtifact = await attributeSessionFromRecord({ runRoot, record: absentRecord, dshHomePath: dshHome });

    /**
     * MUTATION F2-D2: a named-but-absent artifact with a UNIQUE discoverable candidate IS recovered — the §4
     * discovery improvement — and an AMBIGUOUS set is refused rather than chosen by recency.
     */
    const stalePath = writeLiveEvidence({
      runRoot, sessionId, sessionArtifactPath: join(dshHome, sessionId, 'attempt-00000000000000000000000000000000', 'session.v4.jsonl.zstd'),
      hiddenInvariantVector: { failedPrepaidClasses: [], prepaidCoverage: 1 },
      attemptId: canonicalAttemptId, hostJobId: 'job-9f8e7d', costProvenance: 'FIXTURE', mode: 'DETERMINISTIC',
    });
    const staleRecord = Object.freeze({ ...record, contentDigests: liveEvidenceBinding(stalePath.digest) });
    const recoveredByDiscovery = await attributeSessionFromRecord({ runRoot, record: staleRecord, dshHomePath: dshHome });
    /** A second artifact with the SAME canonical identity makes the set ambiguous. */
    const second = writeRealFormatArtifact({ directory: join(dshHome, sessionId, 'duplicate'), attemptId: bareAttemptId });
    const ambiguous = await attributeSessionFromRecord({ runRoot, record: staleRecord, dshHomePath: dshHome });
    rmSync(second.path, { force: true });

    /**
     * MUTATION F2-E: a corrupted artifact is NOT measured as zero.
     *
     * The sidecar's recorded digest is RE-STAMPED to the corrupted bytes, so the digest check passes and the
     * interpretability check is the one under test — which is the distinction §4 requires ("Do not treat empty or
     * unreadable session content as measured zero merely because the parser did not throw").
     */
    const originalBytes = readFileSync(artifact.path);
    writeFileSync(artifact.path, Buffer.from([0x00, 0x01, 0x02, 0x03]));
    const corruptPath = writeLiveEvidence({
      runRoot, sessionId, sessionArtifactPath: artifact.path,
      hiddenInvariantVector: { failedPrepaidClasses: [], prepaidCoverage: 1 },
      attemptId: canonicalAttemptId, hostJobId: 'job-9f8e7d', costProvenance: 'FIXTURE', mode: 'DETERMINISTIC',
    });
    const corruptRecord = Object.freeze({ ...record, contentDigests: liveEvidenceBinding(corruptPath.digest) });
    const corrupted = await attributeSessionFromRecord({ runRoot, record: corruptRecord, dshHomePath: dshHome });
    writeFileSync(artifact.path, originalBytes);

    /**
     * MUTATION F2-E2: an artifact whose bytes no longer match the sidecar's recorded digest is refused.
     *
     * The sidecar is re-stamped from the RESTORED artifact first, so the sidecar binding holds and the
     * artifact-digest check is the one under test. Only then are the artifact's bytes modified.
     */
    writeFileSync(artifact.path, originalBytes);
    const restoredSidecar = writeLiveEvidence({
      runRoot, sessionId, sessionArtifactPath: artifact.path,
      hiddenInvariantVector: { failedPrepaidClasses: [], prepaidCoverage: 1 },
      attemptId: canonicalAttemptId, hostJobId: 'job-9f8e7d', costProvenance: 'FIXTURE', mode: 'DETERMINISTIC',
    });
    const restoredRecord = Object.freeze({ ...record, contentDigests: liveEvidenceBinding(restoredSidecar.digest) });
    writeFileSync(artifact.path, Buffer.concat([originalBytes, Buffer.from('tampered')]));
    const tampered = await attributeSessionFromRecord({ runRoot, record: restoredRecord, dshHomePath: dshHome });
    writeFileSync(artifact.path, originalBytes);
    /** The original sidecar is restored, so the remaining mutations read the clean evidence. */
    writeFileSync(join(runRoot, 'private', 'live-evidence', `${sessionId}.json`), `${JSON.stringify(sidecar.sidecar, null, 2)}${NL}`, 'utf8');

    /** MUTATION F2-F: a deterministic artifact with FABRICATED PRIMARY route and mode claims is NOT LIVE_PRIMARY. */
    const fabricated = writeLiveEvidence({
      runRoot, sessionId, sessionArtifactPath: artifact.path,
      hiddenInvariantVector: { failedPrepaidClasses: [], prepaidCoverage: 1 },
      attemptId: canonicalAttemptId, hostJobId: 'job-9f8e7d', costProvenance: 'LIVE_PRIMARY', mode: 'PRIMARY',
    });
    const fabricatedRecord = Object.freeze({ ...record, contentDigests: liveEvidenceBinding(fabricated.digest), intendedExecutorRoute: 'the frozen omnigate DeepSeek route' });
    const fabricatedAttribution = await attributeSessionFromRecord({ runRoot, record: fabricatedRecord, dshHomePath: dshHome });
    writeFileSync(join(runRoot, 'private', 'live-evidence', `${sessionId}.json`), `${JSON.stringify(sidecar.sidecar, null, 2)}${NL}`, 'utf8');

    /** MUTATION F2-H: discovery is scoped to the session's own DSH home. */
    const discovery = discoverScheduledArtifact({ dshHomePath: dshHome, sessionId, expectedAttemptId: canonicalAttemptId });
    const discoveryAbsent = discoverScheduledArtifact({ dshHomePath: join(root, 'no-such-home'), sessionId, expectedAttemptId: canonicalAttemptId });
    const witness = corroborateExecutionWitness({ witness: null });

    return Object.freeze({
      id: 'ARTIFACT_IDENTITY_DISCOVERY',
      authorityBearingFunction: 'scripts/r3l0ciarlcf/artifact-identity.mjs + scripts/r3l0ciarlcf/cost-bridge.mjs bridgeMatrixCost',
      durableEvidence: 'a TRIAL_RECORDED journal record whose contentDigests binds a live-evidence sidecar, plus a real-format session artifact under the session-scoped DSH home',
      positiveControl: Object.freeze({
        measured: attributed.measured,
        provenance: attributed.provenance,
        outcome: attributed.outcome.id,
        fieldsNonNull: attributed.fields !== null,
        rawHistoryArtifactsRead: attributed.fields?.rawHistoryArtifactsRead ?? null,
        rawHistoryBytesReturned: attributed.fields?.rawHistoryBytesReturned ?? null,
        capitalPullActions: attributed.fields?.capitalPullActions ?? null,
        attemptId: attributed.identity?.attemptId ?? null,
        hostJobId: attributed.identity?.hostJobId ?? null,
        matrixMeasuredCount: bridged.measuredCount,
        matrixInterpretable: bridged.interpretable,
        matrixProvenance: bridged.provenance,
        identitiesAgree,
        discoveryOutcome: discovery.id,
        discoverySelectedAttempt: discovery.selected?.attemptId ?? null,
        comparison: attributed.identity?.comparison ?? null,
      }),
      mutations: Object.freeze({
        /** F2-A */
        canonicalAndPathNormalizedAgree: identitiesAgree === true,
        /** F2-B */
        prefixCollisionRefused: prefixCollision === false,
        identityConflictDetected: identityConflict.outcome.id === 'IDENTITY_CONFLICT',
        /** F2-C */
        hostJobIdConflictDetected: jobConflict.outcome.id === 'IDENTITY_CONFLICT',
        /** F2-D */
        missingArtifactDetected: missingArtifact.outcome.id === 'ARTIFACT_ABSENT',
        absentArtifactFieldsNull: missingArtifact.fields === null,
        discoveryRecoversUniqueCandidate: recoveredByDiscovery.measured === true && recoveredByDiscovery.discovery?.id === 'DISCOVERED_UNIQUE',
        ambiguousRefused: ambiguous.outcome.id === 'AMBIGUOUS_ARTIFACTS',
        ambiguousNotResolvedByRecency: ambiguous.outcome.id !== 'MEASURED_FIXTURE',
        /** F2-E */
        corruptedNotMeasuredAsZero: corrupted.outcome.id === 'UNINTERPRETABLE_ARTIFACT' && corrupted.fields === null,
        corruptedReportedUnreadable: corrupted.interpretability?.state === 'UNREADABLE',
        tamperedDigestRefused: tampered.outcome.id === 'ARTIFACT_DIGEST_MISMATCH',
        /** F2-F */
        fabricatedPrimaryNotLivePrimary: fabricatedAttribution.provenance === 'FIXTURE' && fabricatedAttribution.corroboration?.corroborated === false,
        fabricatedDeclarationCarriedButNotDecisive: fabricatedAttribution.provenanceBasis?.declarationsDecideProvenance === false,
        /** F2-H */
        discoveryScopeUnavailableWithoutHome: discoveryAbsent.id === 'SCOPE_UNAVAILABLE',
        noWitnessIsNotEstablished: witness.verdict === 'NOT_ESTABLISHED',
      }),
      /** §4: LIVE_PRIMARY provenance cannot be established without a paid launch, and is reported as such. */
      livePrimaryProvenance: Object.freeze({
        verdict: 'NOT_ESTABLISHED',
        reason: 'no authentic current-run execution witness exists without entering a paid PRIMARY execution, which §0 forbids',
      }),
      mutant: Object.freeze({ id: 'F2_UNVERIFIED_LIVE_PRIMARY', measuredBy: 'test/r3l0ciarlcf_controls.test.ts', baselineViolates: true, note: 'the prior derivation produced LIVE_PRIMARY from a route regex, a sidecar mode and a digest, and compared identities by substring' }),
      PASS: attributed.measured === true && attributed.provenance === 'FIXTURE'
        && identitiesAgree === true && prefixCollision === false
        && identityConflict.outcome.id === 'IDENTITY_CONFLICT' && jobConflict.outcome.id === 'IDENTITY_CONFLICT'
        && missingArtifact.outcome.id === 'ARTIFACT_ABSENT' && missingArtifact.fields === null
        && recoveredByDiscovery.measured === true && ambiguous.outcome.id === 'AMBIGUOUS_ARTIFACTS'
        && corrupted.outcome.id === 'UNINTERPRETABLE_ARTIFACT' && corrupted.fields === null
        && tampered.outcome.id === 'ARTIFACT_DIGEST_MISMATCH'
        && fabricatedAttribution.provenance === 'FIXTURE'
        && discoveryAbsent.id === 'SCOPE_UNAVAILABLE' && witness.verdict === 'NOT_ESTABLISHED',
    });
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
  }
}

/* ================================================================ §5 Gate F3 durable reconciliation */

/**
 * §5: THE DURABLE-RECONCILIATION CONTROL.
 *
 * The reducer is driven with a GREEN durable/in-memory pair and then with each mutation §5 names: a durable/in-memory
 * identity conflict, a duplicate durable trial, a planned session with no durable trial, a damaged journal, and an
 * explicit absence that satisfies accounting but not measurement.
 */
export async function controlDurableReconciliation() {
  const { authoritativeTerminalAdmission } = await import('./postmatrix-admission.mjs');
  const { reconcileDurableTrials, costCompleteness, causalEvaluability } = await import('./durable-reconciliation.mjs');
  const { admissionTimeMeasurement } = await import('./freshness.mjs');
  const { appendRecord, readJournal } = await import('../r3l0cf/journal.mjs');
  const root = mkdtempSync(join(tmpdir(), 'r3lcf-durable-'));
  try {
    const journalPath = join(root, 'generation-journal.jsonl');
    const planned = ['s0', 's1'];
    const schedule = [
      Object.freeze({ sessionId: 's0', block: 0, arm: 'C', generation: 'G1', trajectoryId: 'b0-C' }),
      Object.freeze({ sessionId: 's1', block: 0, arm: 'H', generation: 'G1', trajectoryId: 'b0-H' }),
    ];
    const closureDigest = 'a'.repeat(64);
    const plan = Object.freeze({ executionClosure: Object.freeze({ executionClosureDigest: closureDigest }) });
    const writeCleanJournal = () => {
      rmSync(journalPath, { force: true });
      for (const session of schedule) {
        appendRecord({ journalPath, kind: 'EXPOSURE_INTENT_RECORDED', payload: { sessionId: session.sessionId } });
        appendRecord({ journalPath, kind: 'WORKER_LAUNCH_RECORDED', payload: { sessionId: session.sessionId, attempt: 1 } });
        appendRecord({ journalPath, kind: 'TRIAL_RECORDED', payload: { sessionId: session.sessionId, record: { ...session } } });
      }
    };
    writeCleanJournal();
    const records = schedule.map((session) => Object.freeze({ ...session, treatmentRealization: 'APPLIED', workerUptakeCount: 0 }));
    const continuity = Object.freeze({ LIVE_ARTIFACT_PROPAGATION: 'PASS', sessions: 2, allBound: true, allMatched: true, allComplete: true });
    const cost = Object.freeze({ interpretable: true, measuredCount: 2, absentCount: 0, plannedSessions: 2, livePrimaryCount: 0, fixtureCount: 2, allSixteenLivePrimary: false });
    const fresh = await admissionTimeMeasurement({ mode: 'DETERMINISTIC', boundClosureDigest: closureDigest, preflightClosureDigest: closureDigest, preflightRouteIdentity: 'MATCH', recompute: async () => ({ closure: { executionClosureDigest: closureDigest }, route: { MODEL_ROUTE_IDENTITY: 'MATCH' } }) });
    const attestation = Object.freeze({ IN_RUN_ATTESTATION: 'PASS', s1MatchesExpectedBundle: true, s2MatchesS1: true, competingWriterDetected: false });
    const validityGreen = Object.freeze({ green: true, detail: 'all nine post-matrix conditions hold' });
    const drive = async (overrides = {}) => {
      const journal = readJournal(journalPath);
      const reconciliation = reconcileDurableTrials({ journal, schedule, plannedSessions: planned, inMemoryRecords: overrides.inMemory ?? records, liveEvidenceContinuity: continuity, costAttribution: overrides.cost ?? cost });
      return await authoritativeTerminalAdmission({
        completed: planned, records: overrides.inMemory ?? records, plannedSessions: planned, schedule, plan,
        journalPath, journalReader: readJournal, liveEvidenceContinuity: continuity, costAttribution: overrides.cost ?? cost,
        durableReconciliation: reconciliation, freshness: fresh, attestation, postMatrixValidity: validityGreen,
      });
    };

    /** THE POSITIVE CONTROL: every condition holds, so the reducer is GREEN. */
    const green = await drive();

    /** MUTATION F3-A: a durable TRIAL whose identity differs from the in-memory observation. */
    writeCleanJournal();
    rmSync(journalPath, { force: true });
    for (const session of schedule) {
      appendRecord({ journalPath, kind: 'EXPOSURE_INTENT_RECORDED', payload: { sessionId: session.sessionId } });
      appendRecord({ journalPath, kind: 'WORKER_LAUNCH_RECORDED', payload: { sessionId: session.sessionId, attempt: 1 } });
    }
    appendRecord({ journalPath, kind: 'TRIAL_RECORDED', payload: { sessionId: 's0', record: { ...schedule[0] } } });
    /** s1's durable trial says arm C / b0-C while the schedule and in-memory record say H / b0-H. */
    appendRecord({ journalPath, kind: 'TRIAL_RECORDED', payload: { sessionId: 's1', record: { sessionId: 's1', block: 0, arm: 'C', generation: 'G1', trajectoryId: 'b0-C' } } });
    const durableInMemoryConflict = await drive();

    /** MUTATION F3-B: a DUPLICATE durable TRIAL_RECORDED. */
    writeCleanJournal();
    appendRecord({ journalPath, kind: 'TRIAL_RECORDED', payload: { sessionId: 's0', record: { ...schedule[0] } } });
    const duplicate = await drive();

    /** MUTATION F3-C: a planned session with NO durable trial. */
    rmSync(journalPath, { force: true });
    for (const session of schedule) {
      appendRecord({ journalPath, kind: 'EXPOSURE_INTENT_RECORDED', payload: { sessionId: session.sessionId } });
      appendRecord({ journalPath, kind: 'WORKER_LAUNCH_RECORDED', payload: { sessionId: session.sessionId, attempt: 1 } });
    }
    appendRecord({ journalPath, kind: 'TRIAL_RECORDED', payload: { sessionId: 's0', record: { ...schedule[0] } } });
    const missingTrial = await drive();

    /** MUTATION F3-D: a DAMAGED journal. */
    writeCleanJournal();
    const cleanText = readFileSync(journalPath, 'utf8');
    writeFileSync(journalPath, `${cleanText}{torn`, 'utf8');
    const damagedJournal = await drive();
    writeFileSync(journalPath, cleanText, 'utf8');

    /** MUTATION F3-E: an explicit ABSENCE satisfies accounting but not measurement. */
    const absentCost = Object.freeze({ interpretable: true, measuredCount: 1, absentCount: 1, plannedSessions: 2, livePrimaryCount: 0, fixtureCount: 1, allSixteenLivePrimary: false });
    const completeness = costCompleteness(absentCost);

    /** MUTATION F3-F/G: a forged allSixteenLivePrimary cannot produce evaluability when admission or provenance is RED. */
    const forgedCausal = causalEvaluability({
      authoritativeAdmission: Object.freeze({ green: false }), costAttribution: Object.freeze({ interpretable: true, measuredCount: 2, absentCount: 0, plannedSessions: 2, livePrimaryCount: 2, allSixteenLivePrimary: true }),
      records, durableReconciliation: Object.freeze({ green: true }), analysisPlanUnchanged: true, replacements: 0, retries: 0, freshness: fresh, attestation,
    });
    const fixtureCausal = causalEvaluability({
      authoritativeAdmission: Object.freeze({ green: true }), costAttribution: cost,
      records, durableReconciliation: Object.freeze({ green: true }), analysisPlanUnchanged: true, replacements: 0, retries: 0, freshness: fresh, attestation,
    });

    return Object.freeze({
      id: 'DURABLE_TRIAL_CONSISTENCY',
      authorityBearingFunction: 'scripts/r3l0ciarlcf/postmatrix-admission.mjs authoritativeTerminalAdmission + scripts/r3l0ciarlcf/durable-reconciliation.mjs reconcileDurableTrials',
      durableEvidence: 'the generation journal, read at admission by the frozen readJournal, reconciled against the runner\'s in-memory observation',
      positiveControl: Object.freeze({ green: green.green, decision: green.decision, conditions: green.conditions.length, journalReadAtAdmission: green.journalReadAtAdmission, durableTrialConsistency: green.durableTrialConsistency, measurementBasis: green.measurementBasis }),
      mutations: Object.freeze({
        durableInMemoryConflictRed: durableInMemoryConflict.green === false,
        durableInMemoryConflictFailing: durableInMemoryConflict.failing,
        duplicateDurableTrialRed: duplicate.green === false,
        missingDurableTrialRed: missingTrial.green === false,
        damagedJournalRed: damagedJournal.green === false,
        absenceSatisfiesAccountingNotMeasurement: completeness.CostAccountingComplete === true && completeness.CostMeasuredComplete === false && completeness.LivePrimaryCostComplete === false,
        forgedAllSixteenCannotOverrideRedAdmission: forgedCausal.CAUSAL_RESULT === 'NOT_EVALUABLE',
        fixtureMatrixNotEvaluable: fixtureCausal.CAUSAL_RESULT === 'NOT_EVALUABLE',
      }),
      mutant: Object.freeze({ id: 'F3_DIVIDED_IDENTITIES', measuredBy: 'test/r3l0ciarlcf_controls.test.ts', baselineViolates: true, note: 'the prior reducer computed IDENTITIES_EXACT from the in-memory records while the cost bridge read the durable journal, so a durable/in-memory disagreement left the gate GREEN' }),
      PASS: green.green === true && green.decision === 'GREEN'
        && durableInMemoryConflict.green === false && duplicate.green === false && missingTrial.green === false && damagedJournal.green === false
        && completeness.CostAccountingComplete === true && completeness.CostMeasuredComplete === false
        && forgedCausal.CAUSAL_RESULT === 'NOT_EVALUABLE' && fixtureCausal.CAUSAL_RESULT === 'NOT_EVALUABLE',
    });
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
  }
}

/* ================================================================ §6 Gate F4 plan identity and budget */

/**
 * §6: THE PLAN-IDENTITY AND BUDGET CONTROL.
 *
 * The FULL-plan digest must move on every material change, and the five budget concepts must be separate with
 * DECLARED_ONLY never implying an enforceable budget.
 */
export async function controlPlanIdentityAndBudget() {
  const { fullPlanDigest, proveFullPlanDigestMoves, planDigestCoverage } = await import('./plan-identity.mjs');
  const { verifyExternalAuthority, budgetSemantics, schemaValidity, trustedAuthoritySource } = await import('./trust-boundary.mjs');
  const planPath = join(REPO_ROOT_FOR_PLAN(), 'research-evidence', 'r3-l0c-iar-lc', 'execution-plan.json');
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  const mutations = proveFullPlanDigestMoves(plan);
  const coverage = planDigestCoverage(plan);
  const decisions = Object.fromEntries(['PAID_MODEL_USAGE', 'BOUNDED_FAIL_STOP_PROTOCOL', 'NO_AUTOMATIC_RETRIES_OR_REPLACEMENTS', 'PRESERVE_PARTIALLY_COMPLETED_INVALID_RUNS', 'ACCEPTED_PROMPT_NEUTRALITY_LIMITED'].map((id) => [id, true]));
  const record = Object.freeze({ authority: 'decision:x', approvedPlanId: plan.planId, approvedPlanDigest: fullPlanDigest(plan), paidRunBudget: Object.freeze({ maxSessions: 16, currency: 'USD' }), decisions });
  const verdict = verifyExternalAuthority({ record, plan });
  const budget = budgetSemantics(record);
  return Object.freeze({
    id: 'FULL_PLAN_DIGEST',
    authorityBearingFunction: 'scripts/r3l0ciarlcf/plan-identity.mjs fullPlanDigest + scripts/r3l0ciarlcf/trust-boundary.mjs budgetSemantics',
    durableEvidence: 'the committed LC prospective plan, read rather than rewritten',
    positiveControl: Object.freeze({
      fullDigestDiffersFromPartialDigest: fullPlanDigest(plan) !== plan.planContentDigest,
      coveredFields: coverage.coveredCount,
      missingMaterialFields: coverage.missingMaterialFields,
      allMutationsMove: mutations.allMutationsMove,
      mutationCount: mutations.mutations.length,
      unmoved: mutations.unmoved,
      budgetConceptsSeparated: Object.keys(verdict.concepts).length >= 5,
      declaredOnlyIsNotEnforceable: budget.declaredOnlyImpliesEnforceable === false,
      hostEnforcedBudget: budget.concepts.ACTUAL_HOST_ENFORCED_BUDGET,
      spendEnforcement: budget.SPEND_ENFORCEMENT,
      schemaValid: schemaValidity(record).valid,
      noTrustedSource: trustedAuthoritySource().available === false,
      authorityVerdict: verdict.verdict,
    }),
    mutations: Object.freeze({
      modelRouteMovesDigest: mutations.mutations.find((entry) => entry.id === 'MODEL_PROVIDER_ROUTE')?.moved === true,
      settingsMovesDigest: mutations.mutations.find((entry) => entry.id === 'EXECUTION_SETTINGS_VALUE')?.moved === true,
      scheduleMovesDigest: mutations.mutations.find((entry) => entry.id === 'SESSION_SCHEDULE')?.moved === true,
      treatmentMovesDigest: mutations.mutations.find((entry) => entry.id === 'TREATMENT_EXPOSURE')?.moved === true,
      endpointMovesDigest: mutations.mutations.find((entry) => entry.id === 'FROZEN_ENDPOINT_OR_THRESHOLD')?.moved === true,
      authorizationScopeMovesDigest: mutations.mutations.find((entry) => entry.id === 'AUTHORIZATION_SCOPE')?.moved === true,
      pipelineOrderMovesDigest: mutations.mutations.find((entry) => entry.id === 'PIPELINE_ORDER')?.moved === true,
      declaredOnlyImpliesEnforceable: budget.declaredOnlyImpliesEnforceable,
      enforceableBudgetConcept: verdict.concepts.ENFORCEABLE_BUDGET,
    }),
    mutant: Object.freeze({ id: 'F4_PARTIAL_PLAN_AND_BUDGET', measuredBy: 'test/r3l0ciarlcf_controls.test.ts', baselineViolates: true, note: 'the prior digest hashed a selected projection and the prior ENFORCEABLE_BUDGET concept was true for a DECLARED_ONLY budget' }),
    PASS: mutations.allMutationsMove === true && coverage.missingMaterialFields.length === 0
      && budget.declaredOnlyImpliesEnforceable === false && budget.concepts.ACTUAL_HOST_ENFORCED_BUDGET === false
      && verdict.concepts.ENFORCEABLE_BUDGET === false && verdict.verdict === 'AUTHORITY_NOT_ESTABLISHED',
  });
}

/** The repository root, resolved from this module's position. */
function REPO_ROOT_FOR_PLAN() {
  return new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
}

export { NL, createHash, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync };
