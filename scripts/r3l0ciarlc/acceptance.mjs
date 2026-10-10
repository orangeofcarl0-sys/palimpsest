/**
 * R3-L0C-I-A-R-L-C §3-§6 — THE PRODUCTION-PATH CONTROLS.
 *
 * Each function drives the REAL corrected entry and returns a `positiveControl` beside the `mutations` the control
 * measured. §8 requires, for each critical negative control, the baseline defect, the mutation performed, the
 * actual authority-bearing function invoked, the durable evidence produced, the observed terminal state, whether a
 * causal verdict was issued, and the repaired property demonstrated — so each control returns those fields rather
 * than only a boolean.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NL } from './contract.mjs';
import { writeRealFormatArtifact } from './baseline/legacy-controls.mjs';

/* ================================================================ §3 Gate A the durable cost bridge */

/**
 * §3: THE DURABLE COST BRIDGE CONTROL.
 *
 * A real-format artifact is written, a sidecar is produced from an ACTUAL outcome shape, its digest is bound into
 * a durable `TRIAL_RECORDED` record through `contentDigests`, and the cost is attributed FROM A GENUINE JOURNAL
 * READBACK. The positive control requires a NON-NULL cost; the mutations cover a substituted sidecar, modified
 * artifact bytes, a missing artifact, a missing sidecar, an identity conflict and an ambiguous candidate.
 */
export async function controlDurableCostBridge() {
  const { writeLiveEvidence, liveEvidenceBinding } = await import('../r3l0ciarl/live-evidence.mjs');
  const { appendRecord, JOURNAL_FILE } = await import('../r3l0cf/journal.mjs');
  const { bridgeMatrixCost, attributeSessionFromRecord } = await import('./cost-bridge.mjs');
  const root = mkdtempSync(join(tmpdir(), 'r3l0ciarlc-bridge-'));
  try {
    const runRoot = join(root, 'run');
    const artifactRoot = join(root, 'artifacts');
    mkdirSync(runRoot, { recursive: true });
    const journalPath = join(runRoot, JOURNAL_FILE);
    const sessionId = 'b0-C-G1';
    const attemptId = 'a1b2c3d4e5';
    /** The artifacts live under a SESSION-named directory, as the pipeline's own fixture writes them. */
    const sessionArtifactDir = join(artifactRoot, sessionId);
    const artifact = writeRealFormatArtifact({ directory: sessionArtifactDir, attemptId });

    /** The sidecar, from the ACTUAL generation outcome shape. */
    const sidecar = writeLiveEvidence({
      runRoot, sessionId, sessionArtifactPath: artifact.path,
      hiddenInvariantVector: { failedPrepaidClasses: [], prepaidCoverage: 1 },
      attemptId, hostJobId: 'job-9f8e7d', costProvenance: 'FIXTURE', mode: 'DETERMINISTIC',
    });
    /** The durable TRIAL_RECORDED record, as the frozen runner writes it. */
    const record = {
      sessionId, block: 0, arm: 'C', generation: 'G1', trajectoryId: 'b0-C',
      attemptId, hostJobId: 'job-9f8e7d', intendedExecutorRoute: 'the deterministic scripted worker',
      contentDigests: liveEvidenceBinding(sidecar.digest),
    };
    appendRecord({ journalPath, kind: 'TRIAL_RECORDED', payload: { sessionId, record } });
    appendRecord({ journalPath, kind: 'WORKER_LAUNCH_RECORDED', payload: { sessionId, attempt: 1 } });

    /** THE POSITIVE CONTROL: the cost is attributed from a genuine journal readback. */
    const bridged = await bridgeMatrixCost({ journalPath, runRoot, plannedSessions: [sessionId] });
    const attributed = bridged.perSession[0];

    /** MUTATION 1: the sidecar's bytes are replaced after the record was written. */
    const sidecarPath = join(runRoot, 'private', 'live-evidence', `${sessionId}.json`);
    const originalSidecar = readFileSync(sidecarPath, 'utf8');
    writeFileSync(sidecarPath, originalSidecar.replace('"FIXTURE"', '"LIVE_PRIMARY"'), 'utf8');
    const substitutedSidecar = await attributeSessionFromRecord({ runRoot, record });
    writeFileSync(sidecarPath, originalSidecar, 'utf8');

    /** MUTATION 2: the artifact's bytes are modified after the sidecar recorded their digest. */
    const originalArtifact = readFileSync(artifact.path);
    writeFileSync(artifact.path, Buffer.concat([originalArtifact, Buffer.from('tampered')]));
    const modifiedArtifact = await attributeSessionFromRecord({ runRoot, record });
    writeFileSync(artifact.path, originalArtifact);

    /** MUTATION 3: the artifact is removed. */
    rmSync(artifact.path, { force: true });
    const missingArtifact = await attributeSessionFromRecord({ runRoot, record, artifactRoot });
    writeFileSync(artifact.path, originalArtifact);

    /** MUTATION 4: the sidecar is removed. */
    rmSync(sidecarPath, { force: true });
    const missingSidecar = await attributeSessionFromRecord({ runRoot, record });
    writeFileSync(sidecarPath, originalSidecar, 'utf8');

    /** MUTATION 5: the sidecar's identity is crossed with another attempt's, and the binding is re-established. */
    const crossed = writeLiveEvidence({
      runRoot, sessionId, sessionArtifactPath: artifact.path,
      hiddenInvariantVector: { failedPrepaidClasses: [], prepaidCoverage: 1 },
      attemptId: 'ffffffff', hostJobId: 'job-9f8e7d', costProvenance: 'FIXTURE', mode: 'DETERMINISTIC',
    });
    const crossedRecord = Object.freeze({ ...record, contentDigests: liveEvidenceBinding(crossed.digest) });
    const identityConflict = await attributeSessionFromRecord({ runRoot, record: crossedRecord });
    writeFileSync(sidecarPath, originalSidecar, 'utf8');

    /**
     * MUTATION 6: the sidecar names an artifact that is absent while TWO real artifacts exist for the session, so
     * the absence must report BOTH candidates rather than choosing one by recency.
     */
    const secondArtifact = writeRealFormatArtifact({ directory: sessionArtifactDir, attemptId: 'beeffeed' });
    const absentNamed = writeLiveEvidence({
      runRoot, sessionId, sessionArtifactPath: join(sessionArtifactDir, 'attempt-0000', 'session.v4.jsonl.zstd'),
      hiddenInvariantVector: { failedPrepaidClasses: [], prepaidCoverage: 1 },
      attemptId, hostJobId: 'job-9f8e7d', costProvenance: 'FIXTURE', mode: 'DETERMINISTIC',
    });
    const absentRecord = Object.freeze({ ...record, contentDigests: liveEvidenceBinding(absentNamed.digest) });
    const ambiguous = await attributeSessionFromRecord({ runRoot, record: absentRecord, artifactRoot });
    writeFileSync(sidecarPath, originalSidecar, 'utf8');
    rmSync(secondArtifact.path, { force: true });

    return Object.freeze({
      id: 'DURABLE_COST_BRIDGE',
      authorityBearingFunction: 'scripts/r3l0ciarlc/cost-bridge.mjs bridgeMatrixCost (frozen readJournal → sidecar → artifact → frozen reconstructCost)',
      durableEvidence: 'a TRIAL_RECORDED journal record whose contentDigests binds a live-evidence sidecar, plus a real-format session artifact',
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
        matrixAbsentCount: bridged.absentCount,
        matrixInterpretable: bridged.interpretable,
        matrixProvenance: bridged.provenance,
      }),
      mutations: Object.freeze({
        substitutedSidecarDetected: substitutedSidecar.outcome.id === 'SIDECAR_DIGEST_MISMATCH',
        modifiedArtifactDetected: modifiedArtifact.outcome.id === 'ARTIFACT_DIGEST_MISMATCH',
        missingArtifactDetected: missingArtifact.outcome.id === 'ARTIFACT_ABSENT',
        missingSidecarDetected: missingSidecar.outcome.id === 'SIDECAR_ABSENT',
        identityConflictDetected: identityConflict.outcome.id === 'IDENTITY_CONFLICT',
        ambiguousCandidatesReported: (ambiguous.candidates ?? []).length > 1,
        absentMeasurementsAreNullNotZero: missingArtifact.fields === null && missingSidecar.fields === null,
      }),
      mutant: Object.freeze({
        id: 'LC_A_DURABLE_COST_BRIDGE',
        measuredBy: 'test/r3l0ciarlc_controls.test.ts',
        baselineViolates: true,
        note: 'the prior matrix cost read `record.sessionArtifactPath`, which the durable record does not carry, so every session measured nothing',
      }),
      PASS: attributed.measured === true && attributed.fields !== null && attributed.provenance === 'FIXTURE'
        && substitutedSidecar.outcome.id === 'SIDECAR_DIGEST_MISMATCH'
        && modifiedArtifact.outcome.id === 'ARTIFACT_DIGEST_MISMATCH'
        && missingArtifact.outcome.id === 'ARTIFACT_ABSENT'
        && missingSidecar.outcome.id === 'SIDECAR_ABSENT'
        && identityConflict.outcome.id === 'IDENTITY_CONFLICT'
        && (ambiguous.candidates ?? []).length > 1
        && missingArtifact.fields === null,
    });
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
  }
}

/* ================================================================ §4 Gate B the terminal admission */

/**
 * §4: THE AUTHORITATIVE TERMINAL-ADMISSION CONTROL.
 *
 * The reducer is driven directly with a GREEN and then with each of the eight mutations §4 names, so the RED
 * verdicts are measured rather than asserted. The `authorityBearingFunction` is the reducer itself, which is the
 * function the frozen runner's `validityGate` calls before it writes its completion decision.
 */
export async function controlTerminalAdmission() {
  const { authoritativeTerminalAdmission } = await import('./postmatrix-admission.mjs');
  const { readJournal } = await import('../r3l0cf/journal.mjs');
  const { compareSessionIdentities } = await import('../r3l0ciarl/postflight.mjs');
  const root = mkdtempSync(join(tmpdir(), 'r3l0ciarlc-admission-'));
  try {
    const journalPath = join(root, 'generation-journal.jsonl');
    const planned = ['s0', 's1'];
    const schedule = [
      Object.freeze({ sessionId: 's0', block: 0, arm: 'C', generation: 'G1', trajectoryId: 'b0-C' }),
      Object.freeze({ sessionId: 's1', block: 0, arm: 'H', generation: 'G1', trajectoryId: 'b0-H' }),
    ];
    const records = schedule.map((session) => Object.freeze({ ...session }));
    const closureDigest = 'a'.repeat(64);
    const plan = Object.freeze({ executionClosure: Object.freeze({ executionClosureDigest: closureDigest }) });
    const continuityPass = Object.freeze({ LIVE_ARTIFACT_PROPAGATION: 'PASS', sessions: 2, allBound: true, allMatched: true, allComplete: true });
    const costOk = Object.freeze({ interpretable: true, measuredCount: 2, absentCount: 0, plannedSessions: 2, livePrimaryCount: 0, fixtureCount: 2, allSixteenLivePrimary: false });
    const attestationPass = Object.freeze({ IN_RUN_ATTESTATION: 'PASS', s1MatchesExpectedBundle: true, s2MatchesS1: true, competingWriterDetected: false });
    const validityGreen = Object.freeze({ green: true, detail: 'all nine post-matrix conditions hold' });
    const recomputeMatch = async () => Object.freeze({ closure: Object.freeze({ executionClosureDigest: closureDigest }), route: Object.freeze({ MODEL_ROUTE_IDENTITY: 'MATCH' }) });
    const { appendRecord } = await import('../r3l0cf/journal.mjs');
    for (const session of schedule) {
      appendRecord({ journalPath, kind: 'EXPOSURE_INTENT_RECORDED', payload: { sessionId: session.sessionId } });
      appendRecord({ journalPath, kind: 'WORKER_LAUNCH_RECORDED', payload: { sessionId: session.sessionId, attempt: 1 } });
    }
    const base = { completed: planned, records, plannedSessions: planned, schedule, plan, journalPath, journalReader: readJournal, liveEvidenceContinuity: continuityPass, costAttribution: costOk, recompute: recomputeMatch, attestation: attestationPass, postMatrixValidity: validityGreen };

    /** THE POSITIVE CONTROL: every condition holds, so the reducer is GREEN. */
    const green = await authoritativeTerminalAdmission(base);

    /** MUTATION: the runtime closure drifts after the last admitted trial. */
    const driftedClosure = await authoritativeTerminalAdmission({ ...base, recompute: async () => Object.freeze({ closure: Object.freeze({ executionClosureDigest: 'b'.repeat(64) }), route: Object.freeze({ MODEL_ROUTE_IDENTITY: 'MATCH' }) }) });
    /** MUTATION: the effective route drifts. */
    const driftedRoute = await authoritativeTerminalAdmission({ ...base, recompute: async () => Object.freeze({ closure: Object.freeze({ executionClosureDigest: closureDigest }), route: Object.freeze({ MODEL_ROUTE_IDENTITY: 'DRIFTED' }) }) });
    /** MUTATION: a duplicated launch. */
    appendRecord({ journalPath, kind: 'WORKER_LAUNCH_RECORDED', payload: { sessionId: 's0', attempt: 2 } });
    const duplicated = await authoritativeTerminalAdmission(base);
    const journalAfterDuplicate = readFileSync(journalPath, 'utf8');
    /** Remove the duplicate line so the remaining mutations are measured against a clean journal. */
    writeFileSync(journalPath, journalAfterDuplicate.split(NL).filter((line) => !line.includes('"attempt":2')).join(NL), 'utf8');
    /** MUTATION: an unexpected session. */
    const unexpected = await authoritativeTerminalAdmission({ ...base, records: [...records, Object.freeze({ sessionId: 's9', block: 9, arm: 'C', generation: 'G2', trajectoryId: 'b9-C' })] });
    /** MUTATION: an identity mismatch. */
    const identityMismatch = await authoritativeTerminalAdmission({ ...base, records: [Object.freeze({ ...records[0], arm: 'H' }), records[1]] });
    /** MUTATION: a damaged journal. */
    writeFileSync(journalPath, `${journalAfterDuplicate.split(NL).filter((line) => !line.includes('"attempt":2')).join(NL)}${NL}{torn`, 'utf8');
    const damaged = await authoritativeTerminalAdmission(base);
    writeFileSync(journalPath, journalAfterDuplicate.split(NL).filter((line) => !line.includes('"attempt":2')).join(NL), 'utf8');
    /** MUTATION: a missing required attribution. */
    const missingAttribution = await authoritativeTerminalAdmission({ ...base, costAttribution: Object.freeze({ interpretable: false, measuredCount: 1, absentCount: 1, plannedSessions: 2 }) });
    /** MUTATION: the runtime attestation fails (a competing writer changed the installation between S1 and S2). */
    const attestationFail = await authoritativeTerminalAdmission({ ...base, attestation: Object.freeze({ IN_RUN_ATTESTATION: 'FAIL', s1MatchesExpectedBundle: true, s2MatchesS1: false, competingWriterDetected: true }) });
    /** MUTATION: the sidecar continuity fails. */
    const continuityFail = await authoritativeTerminalAdmission({ ...base, liveEvidenceContinuity: Object.freeze({ LIVE_ARTIFACT_PROPAGATION: 'FAIL', sessions: 2, allBound: true, allMatched: false, allComplete: true }) });

    const reds = Object.freeze({
      closureDrift: driftedClosure, routeDrift: driftedRoute, duplicatedLaunch: duplicated, unexpectedSession: unexpected,
      identityMismatch, damagedJournal: damaged, missingAttribution, attestationFail, continuityFail,
    });
    const allRed = Object.values(reds).every((entry) => entry.green === false && entry.decision === 'RED');
    return Object.freeze({
      id: 'POSTMATRIX_ADMISSION',
      authorityBearingFunction: 'scripts/r3l0ciarlc/postmatrix-admission.mjs authoritativeTerminalAdmission (called by the frozen runFailStopMatrix validityGate before it writes MATRIX_COMPLETED)',
      durableEvidence: 'the generation journal, read at admission by the frozen readJournal',
      positiveControl: Object.freeze({ green: green.green, decision: green.decision, conditions: green.conditions.length, journalReadAtAdmission: green.journalReadAtAdmission, freshClosureDigest: green.freshClosureDigest, routeIdentity: green.routeIdentity }),
      mutations: Object.freeze(Object.fromEntries(Object.entries(reds).map(([name, entry]) => [name, Object.freeze({ green: entry.green, decision: entry.decision, failing: entry.failing })]))),
      mutant: Object.freeze({ id: 'LC_B_POSTMATRIX_ADMISSION', measuredBy: 'test/r3l0ciarlc_controls.test.ts', baselineViolates: true, note: 'the prior postflight ran after the runner had already recorded MATRIX_COMPLETED' }),
      PASS: green.green === true && green.decision === 'GREEN' && allRed,
    });
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
  }
}

/* ================================================================ §5 Gate C the trust boundary */

/**
 * §5: THE PRIMARY TRUST-BOUNDARY CONTROL.
 *
 * A fabricated decision reference, an inadequate budget, a wrong plan digest, a caller-supplied derived
 * measurement and a caller-supplied trusted host input must NOT create launch permission. A structurally complete
 * record passes schema validity but must still not count as trusted authorization.
 */
export async function controlTrustBoundary(input) {
  const { verifyExternalAuthority, enforcePrimaryInputBinding, schemaValidity, planContentDigest, trustedAuthoritySource } = await import('./trust-boundary.mjs');
  const { PRIMARY_REFUSED_INPUTS } = await import('./contract.mjs');
  const decisions = Object.fromEntries(['PAID_MODEL_USAGE', 'BOUNDED_FAIL_STOP_PROTOCOL', 'NO_AUTOMATIC_RETRIES_OR_REPLACEMENTS', 'PRESERVE_PARTIALLY_COMPLETED_INVALID_RUNS', 'ACCEPTED_PROMPT_NEUTRALITY_LIMITED'].map((id) => [id, true]));
  const plan = Object.freeze({ planId: 'r3-l0c-iar-lc-primary-plan', baseline: '6089947', schedule: Object.freeze([Object.freeze({ sessionId: 's0', block: 0, arm: 'C', generation: 'G1', trajectoryId: 'b0-C' })]), preservedDesign: Object.freeze({ experimentalUnit: 'ProjectTrajectory', treatment: 'SELECTION_ONLY', randomizationSeed: '0x524c3002', sessionCount: 16, armOrder: [], exposures: {}, corpusDigest: 'c', capitalBundleDigest: 'k', verdictThresholdsChanged: false, primaryEndpointsChanged: false }), executionClosure: Object.freeze({ executionClosureDigest: 'a'.repeat(64) }), authorizationRequired: Object.freeze({ required: true }) });
  const digest = planContentDigest(plan);
  const complete = { authority: 'decision:external-ruling-2026-10-10', approvedPlanId: plan.planId, approvedPlanDigest: digest, paidRunBudget: { maxSessions: 16, currency: 'USD' }, decisions };

  /** A STRUCTURALLY COMPLETE record: schema-valid, and still NOT trusted, because no trusted source exists. */
  const completeSchema = schemaValidity(complete);
  const completeVerdict = verifyExternalAuthority({ record: complete, plan });
  /** A fabricated decision reference with an inadequate budget. */
  const fabricated = verifyExternalAuthority({ record: { ...complete, authority: 'decision:totally-made-up-by-the-caller', paidRunBudget: { maxSessions: 1, currency: 'USD' } }, plan });
  /** A wrong plan digest. */
  const wrongPlan = verifyExternalAuthority({ record: { ...complete, approvedPlanDigest: 'b'.repeat(64) }, plan });
  /** A caller-supplied derived measurement in PRIMARY. */
  const substituted = enforcePrimaryInputBinding({ mode: 'PRIMARY', provided: Object.fromEntries(PRIMARY_REFUSED_INPUTS.map((name) => [name, 'caller-supplied'])) });
  const clean = enforcePrimaryInputBinding({ mode: 'PRIMARY', provided: {} });
  const deterministic = enforcePrimaryInputBinding({ mode: 'DETERMINISTIC', provided: Object.fromEntries(PRIMARY_REFUSED_INPUTS.map((name) => [name, 'caller-supplied'])) });

  return Object.freeze({
    id: 'PRIMARY_INPUT_INTEGRITY',
    authorityBearingFunction: 'scripts/r3l0ciarlc/trust-boundary.mjs verifyExternalAuthority + enforcePrimaryInputBinding',
    durableEvidence: 'the authorization record and the committed prospective plan',
    positiveControl: Object.freeze({
      completeRecordIsSchemaValid: completeSchema.valid,
      completeRecordIsNotTrusted: completeVerdict.verified === false,
      verdict: completeVerdict.verdict,
      conceptsSeparated: Object.freeze({ ...completeVerdict.concepts }),
      planContentDigestIsSeparateFromClosure: completeVerdict.planContentDigestIsSeparateFromClosure,
      planBindingIsSelfReferential: completeVerdict.planBindingIsSelfReferential,
      trustedSourceAvailable: completeVerdict.trustedSource.available,
      launchProhibited: completeVerdict.launchProhibited,
      deterministicInjectionPermitted: deterministic.refused === false,
      primaryCleanDerivesItsOwn: clean.refused === false && clean.injectionPermitted === false,
    }),
    mutations: Object.freeze({
      fabricatedAuthorityNotTrusted: fabricated.verified === false,
      fabricatedAuthorityVerdict: fabricated.verdict,
      oneSessionBudgetRejected: fabricated.problems.some((problem) => /does not cover the frozen 16-session scope/u.test(problem)),
      wrongPlanDigestRejected: wrongPlan.verified === false,
      wrongPlanDigestReason: wrongPlan.problems,
      primarySubstitutionRefused: substituted.refused === true && substituted.supplied.length === PRIMARY_REFUSED_INPUTS.length,
      trustedHostInputsRefused: substituted.supplied.includes('dshHome') && substituted.supplied.includes('installHostBundle'),
      noTrustedSourceIsHonest: trustedAuthoritySource().available === false,
    }),
    mutant: Object.freeze({ id: 'LC_C_PRIMARY_TRUST_BOUNDARY', measuredBy: 'test/r3l0ciarlc_controls.test.ts', baselineViolates: true, note: 'the prior verifier accepted a `decision:`-prefixed fabricated authority and a one-session budget' }),
    PASS: completeSchema.valid === true && completeVerdict.verified === false
      && fabricated.verified === false && wrongPlan.verified === false
      && substituted.refused === true && clean.refused === false && deterministic.refused === false,
  });
}

/* ================================================================ §6 Gate D the in-run attestation */

/**
 * §6: THE IN-RUN ATTESTATION CONTROL.
 *
 * The three points are sampled around an installation in an ISOLATED DSH home, so the mutation is a real change to
 * a real installation rather than a transient rewrite of a shared file. The mutation is applied BETWEEN S1 and S2,
 * which is exactly the window §6 names, and the verdict must report a competing writer even though this run
 * installed.
 */
export async function controlInRunAttestation(input) {
  const { sampleInstallationDigest, competingWriterVerdict, inRunAttestation, treeDigests } = await import('./attestation.mjs');
  const { installHostBundle } = await import('../gates/env.mjs');
  const root = mkdtempSync(join(tmpdir(), 'r3l0ciarlc-attest-'));
  try {
    const dshHomePath = join(root, '.dsh');
    mkdirSync(join(dshHomePath, 'profiles', 'node_modules'), { recursive: true });
    /** S0: before this run's own installation. */
    const s0 = sampleInstallationDigest({ dshHomePath });
    /** The run's own installation, into the ISOLATED home. */
    installHostBundle({ repo: input.repo ?? process.cwd(), realDshHome: dshHomePath });
    /** S1: after installation, before the matrix. */
    const s1 = sampleInstallationDigest({ dshHomePath });
    /**
     * THE POSITIVE CONTROL IS MEASURED BEFORE THE MUTATION, so the bundle comparison is a clean measurement of the
     * installed bundle against the repository rather than a measurement of the mutation.
     */
    const cleanAttestation = await inRunAttestation({ dshHomePath, s0Digest: s0, s1Digest: s1, s2Digest: s1, installedDuringRun: true, compiledVerification: input.compiledVerification ?? null });
    const fileDigests = treeDigests(join(dshHomePath, 'profiles', 'node_modules', 'palimpsest-dsh-host'));
    /** THE MUTATION: another writer changes an installed file between S1 and S2. */
    const installedFile = join(dshHomePath, 'profiles', 'node_modules', 'palimpsest-dsh-host', 'lib', 'runner.js');
    const mutated = existsSync(installedFile);
    if (mutated) writeFileSync(installedFile, `${readFileSync(installedFile, 'utf8')}${NL}/* competing writer */`, 'utf8');
    /** S2: after the matrix, before final admission. */
    const s2 = sampleInstallationDigest({ dshHomePath });

    const writer = competingWriterVerdict({ s0Digest: s0, s1Digest: s1, s2Digest: s2, installedDuringRun: true });
    const attestation = await inRunAttestation({ dshHomePath, s0Digest: s0, s1Digest: s1, s2Digest: s2, installedDuringRun: true, compiledVerification: input.compiledVerification ?? null });
    /** A clean installation, so the positive control's S1/S2 comparison is measured too. */
    const cleanWriter = competingWriterVerdict({ s0Digest: s0, s1Digest: s1, s2Digest: s1, installedDuringRun: true });

    return Object.freeze({
      id: 'IN_RUN_ATTESTATION',
      authorityBearingFunction: 'scripts/r3l0ciarlc/attestation.mjs inRunAttestation + competingWriterVerdict (called inside the terminal-admission callback)',
      durableEvidence: 'three installation digests S0/S1/S2 and a file-by-file comparison of the installed bundle against the repository',
      positiveControl: Object.freeze({
        s0DiffersFromS1: s0 !== s1,
        cleanS1MatchesS2: cleanWriter.competingWriterDetected === false,
        cleanAttestationVerdict: cleanAttestation.IN_RUN_ATTESTATION,
        installedBundleIdentical: cleanAttestation.expectedBundle.allIdentical,
        comparedFileByFile: cleanAttestation.expectedBundle.comparedFileByFile,
        installedFileCount: Object.keys(fileDigests).length,
        coverageLimitationsDisclosed: cleanAttestation.coverageLimitations.length > 0,
        installerIsMitigationNotProof: cleanAttestation.installerIsMitigationNotProof,
      }),
      mutations: Object.freeze({
        mutationApplied: mutated,
        competingWriterDetectedDespiteOwnInstall: writer.competingWriterDetected === true,
        installedDuringRunSuppressesDetection: writer.installedDuringRunSuppressesDetection,
        s2DiffersFromS1: s2 !== s1,
        attestationFailsOnACompetingWriter: attestation.IN_RUN_ATTESTATION === 'FAIL' || attestation.compiledVerificationSkipped === true,
        skippedCompiledVerificationIsNotAPass: attestation.compiledVerificationSkipped === true ? attestation.IN_RUN_ATTESTATION === 'FAIL' : true,
      }),
      mutant: Object.freeze({ id: 'LC_D_INRUN_ATTESTATION', measuredBy: 'test/r3l0ciarlc_controls.test.ts', baselineViolates: true, note: 'the prior verdict suppressed competing-writer detection whenever installedDuringRun was true' }),
      PASS: s0 !== s1 && cleanWriter.competingWriterDetected === false
        && cleanAttestation.expectedBundle.allIdentical === true
        && writer.competingWriterDetected === true && writer.installedDuringRunSuppressesDetection === false,
    });
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
  }
}

export { NL, createHash, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync };
