/**
 * R3-L0C-I-A-R-L §1-§4 — THE PRODUCTION-PATH CONTROLS.
 *
 * Each function drives the REAL repaired entry and returns a `positiveControl` beside the `mutant` the controls
 * test measured at `36ada58`. The mutants are not re-run here: `r3l0ciarl_controls.test.ts` already measured them,
 * and re-deriving them would be a second measurement of the same fact.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NL, PRIMARY_DERIVED_INPUTS } from './contract.mjs';

/* ================================================================ §1 the live-evidence continuity */

/**
 * §1: THE LIVE-EVIDENCE CONTINUITY CONTROL.
 *
 * A real-format artifact is written, a sidecar is produced from an ACTUAL outcome shape, its digest is bound into
 * a record's `contentDigests`, and the whole chain is read back. The positive control requires every field to
 * survive and the digest to match; the mutations are a SUBSTITUTED sidecar (the digest must not match) and a
 * MISSING sidecar (the read must report absence).
 */
export async function controlLiveEvidence(input) {
  const { writeRealFormatArtifact } = await import('./baseline/legacy-controls.mjs');
  const { writeLiveEvidence, verifyLiveEvidenceContinuity, readLiveEvidence, liveEvidenceBinding, bindingOf } = await import('./live-evidence.mjs');
  const root = mkdtempSync(join(tmpdir(), 'r3l0ciarl-live-'));
  try {
    const runRoot = join(root, 'run');
    mkdirSync(runRoot, { recursive: true });
    const artifactRoot = join(root, 'artifacts');
    const sessionIds = ['b0-C-G1', 'b0-C-G2'];
    const records = [];
    for (const [index, sessionId] of sessionIds.entries()) {
      const artifact = writeRealFormatArtifact({ directory: artifactRoot, attemptId: `a${String(index)}b2c3d4e5` });
      const sidecar = writeLiveEvidence({
        runRoot, sessionId,
        sessionArtifactPath: artifact.path,
        hiddenInvariantVector: { failedPrepaidClasses: [], prepaidCoverage: 1 },
        attemptId: artifact.attemptId,
        hostJobId: `job-${String(index)}f8e7d`,
        costProvenance: 'FIXTURE',
        mode: 'DETERMINISTIC',
      });
      records.push(Object.freeze({ sessionId, contentDigests: liveEvidenceBinding(sidecar.digest) }));
    }
    const continuity = verifyLiveEvidenceContinuity({ runRoot, records });

    /** The mutation: the sidecar's bytes are replaced AFTER the record was written. */
    const firstPath = join(runRoot, 'private', 'live-evidence', `${sessionIds[0]}.json`);
    const original = readFileSync(firstPath, 'utf8');
    writeFileSync(firstPath, original.replace('"FIXTURE"', '"LIVE_PRIMARY"'), 'utf8');
    const substituted = readLiveEvidence({ runRoot, sessionId: sessionIds[0], binding: bindingOf(records[0]) });
    writeFileSync(firstPath, original, 'utf8');

    /** The mutation: no sidecar at all. */
    const missing = readLiveEvidence({ runRoot, sessionId: 'b9-Z-G9', binding: 'deadbeef' });

    return Object.freeze({
      id: 'LIVE_ARTIFACT_PROPAGATION',
      positiveControl: Object.freeze({
        sessions: continuity.sessions,
        allBound: continuity.allBound,
        allMatched: continuity.allMatched,
        allComplete: continuity.allComplete,
        verdict: continuity.LIVE_ARTIFACT_PROPAGATION,
        perSession: continuity.perSession,
        /** §1: the fields actually recovered from the durable binding. */
        recoveredArtifactPaths: Object.freeze(continuity.perSession.map((entry) => entry.artifactPath)),
        recoveredHiddenVectors: continuity.perSession.every((entry) => entry.hiddenVectorPresent === true),
        recoveredAttemptIds: Object.freeze(continuity.perSession.map((entry) => entry.attemptId)),
        recoveredHostJobIds: Object.freeze(continuity.perSession.map((entry) => entry.hostJobId)),
      }),
      mutations: Object.freeze({
        substitutedSidecarDetected: substituted.matchesBinding === false && substituted.reason === 'DIGEST_MISMATCH',
        missingSidecarReported: missing.found === false && missing.reason === 'NO_SIDECAR',
      }),
      mutant: Object.freeze({ id: 'L1_LIVE_ARTIFACT_CONTINUITY', measuredBy: 'test/r3l0ciarl_controls.test.ts', baselineViolates: true, note: 'the frozen journal carried neither sessionArtifactPath nor hiddenInvariantVector' }),
      PASS: continuity.LIVE_ARTIFACT_PROPAGATION === 'PASS'
        && substituted.matchesBinding === false
        && missing.found === false,
    });
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
  }
}

/* ================================================================ §2 the postflight freshness */

/**
 * §2: THE POSTFLIGHT FRESHNESS CONTROL.
 *
 * A plan binds a digest; the recomputation returns a DIFFERENT one, which must fail causal admission. Then the
 * recomputation returns the bound one, which must pass. And the counts are derived from a synthetic journal that
 * contains a duplicate launch, so the retry count is a derivation rather than a caller number.
 */
export async function controlPostflightFreshness(input) {
  const { freshPostflight, deriveCountsFromJournal, compareSessionIdentities } = await import('./postflight.mjs');
  const bound = 'a'.repeat(64);
  const plan = Object.freeze({ executionClosure: Object.freeze({ executionClosureDigest: bound }) });
  /** The mutation: the runtime moved after preflight. */
  const drifted = await freshPostflight({ plan, preflightClosureDigest: bound, recompute: async () => Object.freeze({ closure: Object.freeze({ executionClosureDigest: 'b'.repeat(64) }), route: Object.freeze({ MODEL_ROUTE_IDENTITY: 'MATCH' }) }) });
  /** The positive control: the runtime is unchanged. */
  const fresh = await freshPostflight({ plan, preflightClosureDigest: bound, recompute: async () => Object.freeze({ closure: Object.freeze({ executionClosureDigest: bound }), route: Object.freeze({ MODEL_ROLE_IDENTITY: undefined, MODEL_ROUTE_IDENTITY: 'MATCH' }) }) });

  /** The counts, from a journal that shows one session launched twice. */
  const journalRecords = [
    ...Array.from({ length: 16 }, (_unused, index) => Object.freeze({ kind: 'WORKER_LAUNCH_RECORDED', payload: Object.freeze({ sessionId: `s${String(index)}` }) })),
    Object.freeze({ kind: 'WORKER_LAUNCH_RECORDED', payload: Object.freeze({ sessionId: 's3' }) }),
  ];
  const counts = deriveCountsFromJournal({ journalRecords, plannedSessions: Array.from({ length: 16 }, (_unused, index) => `s${String(index)}`) });

  /** The identities, from records whose block/arm/generation disagree with the plan. */
  const schedule = Array.from({ length: 16 }, (_unused, index) => Object.freeze({ sessionId: `s${String(index)}`, block: Math.floor(index / 4), arm: index % 2 === 0 ? 'C' : 'H', generation: index % 2 === 0 ? 'G1' : 'G2', trajectoryId: `b${String(Math.floor(index / 4))}-${index % 2 === 0 ? 'C' : 'H'}` }));
  const goodRecords = schedule.map((session) => Object.freeze({ ...session }));
  const badRecords = goodRecords.map((record, index) => index === 0 ? Object.freeze({ ...record, arm: 'H', generation: 'G2', trajectoryId: 'b9-Z' }) : record);
  const identities = compareSessionIdentities({ records: goodRecords, schedule });
  const mismatched = compareSessionIdentities({ records: badRecords, schedule });

  return Object.freeze({
    id: 'POSTFLIGHT_FRESHNESS',
    positiveControl: Object.freeze({
      freshClosureMatchesPlan: fresh.closureMatchesPlan,
      freshVerdict: fresh.POSTFLIGHT_FRESHNESS,
      freshRouteIdentity: fresh.routeIdentity,
      countsRetries: counts.retries,
      countsReplacements: counts.replacements,
      countsDerivedFromJournal: counts.derivedFromCallerSuppliedNumbers === false,
      identitiesExact: identities.allIdentitiesExact,
      allSixteenUnique: identities.allSixteenUnique,
      eightTrajectories: identities.eightTrajectories,
      fourBlocks: identities.fourBlocks,
    }),
    mutations: Object.freeze({
      driftDetected: drifted.POSTFLIGHT_FRESHNESS === 'FAIL' && drifted.runtimeMovedAfterPreflight === true,
      duplicateLaunchIsARetry: counts.retries === 1,
      identityMismatchDetected: mismatched.allIdentitiesExact === false && mismatched.identityMismatches.length > 0,
    }),
    mutant: Object.freeze({ id: 'L2_POSTFLIGHT_FRESHNESS', measuredBy: 'test/r3l0ciarl_controls.test.ts', baselineViolates: true, note: 'the prior gate compared the closure captured before the matrix' }),
    PASS: fresh.POSTFLIGHT_FRESHNESS === 'PASS' && drifted.POSTFLIGHT_FRESHNESS === 'FAIL' && counts.retries === 1 && mismatched.allIdentitiesExact === false,
  });
}

/* ================================================================ §3 the primary input binding */

/**
 * §3: THE PRIMARY INPUT BINDING CONTROL.
 *
 * A DETERMINISTIC invocation supplying every derived input must be PERMITTED (test injection); a PRIMARY
 * invocation supplying any must be REFUSED. The authorization record is verified: an arbitrary authority string
 * fails, and a complete record approving the executing plan passes.
 */
export async function controlPrimaryBinding() {
  const { enforcePrimaryInputBinding, verifyAuthorizationRecord } = await import('./primary-binding.mjs');
  const provided = Object.fromEntries(PRIMARY_DERIVED_INPUTS.map((name) => [name, 'caller-supplied']));
  const deterministic = enforcePrimaryInputBinding({ mode: 'DETERMINISTIC', provided });
  const primary = enforcePrimaryInputBinding({ mode: 'PRIMARY', provided });
  const clean = enforcePrimaryInputBinding({ mode: 'PRIMARY', provided: {} });

  const decisions = Object.fromEntries(['PAID_MODEL_USAGE', 'BOUNDED_FAIL_STOP_PROTOCOL', 'NO_AUTOMATIC_RETRIES_OR_REPLACEMENTS', 'PRESERVE_PARTIALLY_COMPLETED_INVALID_RUNS', 'ACCEPTED_PROMPT_NEUTRALITY_LIMITED'].map((id) => [id, true]));
  const arbitrary = verifyAuthorizationRecord({ record: { authority: 'because I said so', decisions }, executingPlanId: 'p', executingPlanDigest: 'd' });
  const complete = verifyAuthorizationRecord({
    record: { authority: 'decision:external-ruling-2026-10-10', approvedPlanId: 'p', approvedPlanDigest: 'd', paidRunBudget: { maxSessions: 16, currency: 'USD' }, decisions },
    executingPlanId: 'p', executingPlanDigest: 'd',
  });
  const wrongPlan = verifyAuthorizationRecord({
    record: { authority: 'decision:external-ruling-2026-10-10', approvedPlanId: 'other', approvedPlanDigest: 'd', paidRunBudget: { maxSessions: 16, currency: 'USD' }, decisions },
    executingPlanId: 'p', executingPlanDigest: 'd',
  });
  const noBudget = verifyAuthorizationRecord({
    record: { authority: 'decision:external-ruling-2026-10-10', approvedPlanId: 'p', approvedPlanDigest: 'd', decisions },
    executingPlanId: 'p', executingPlanDigest: 'd',
  });

  return Object.freeze({
    id: 'PRIMARY_INPUT_BINDING',
    positiveControl: Object.freeze({
      deterministicInjectionPermitted: deterministic.refused === false && deterministic.injectionPermitted === true,
      primarySubstitutionRefused: primary.refused === true && primary.supplied.length === PRIMARY_DERIVED_INPUTS.length,
      primaryCleanDerivesItsOwn: clean.refused === false && clean.injectionPermitted === false,
      completeRecordVerified: complete.verified === true,
      completeRecordVerifiedAtLaunchBoundary: complete.verifiedAtLaunchBoundary === true,
    }),
    mutations: Object.freeze({
      arbitraryAuthorityRefused: arbitrary.verified === false,
      arbitraryAuthorityReason: arbitrary.problems,
      wrongPlanRefused: wrongPlan.verified === false,
      missingBudgetRefused: noBudget.verified === false,
    }),
    mutant: Object.freeze({ id: 'L3_PRIMARY_INPUT_BINDING', measuredBy: 'test/r3l0ciarl_controls.test.ts', baselineViolates: true, note: 'the prior pipeline permitted caller substitution in every mode and accepted an arbitrary authority string' }),
    PASS: deterministic.refused === false && primary.refused === true && clean.refused === false
      && complete.verified === true && arbitrary.verified === false && wrongPlan.verified === false && noBudget.verified === false,
  });
}

/* ================================================================ §4 the attestation */

/**
 * §4: THE RUNTIME ATTESTATION CONTROL.
 *
 * Source-to-compiled verification is completed; the installed bundle is compared file-by-file; and a competing
 * writer is detected from two samples. The mutations are a modified installed file (the comparison must differ)
 * and a changed sample with no install in between (a competing writer must be reported).
 */
export async function controlAttestation(input) {
  const { verifyCompiledSource, attestInstalledBundle, competingWriterVerdict, treeDigests } = await import('./attestation.mjs');
  const compiled = await verifyCompiledSource();
  const bundle = attestInstalledBundle({ dshHomePath: input.dshHomePath });

  /** The mutation: an installed file is modified, so the comparison must report a difference. */
  const root = mkdtempSync(join(tmpdir(), 'r3l0ciarl-attest-'));
  let modifiedDetected = false;
  try {
    const source = join(root, 'source');
    const installed = join(root, 'installed');
    mkdirSync(source, { recursive: true });
    mkdirSync(installed, { recursive: true });
    writeFileSync(join(source, 'a.js'), 'export const a = 1;\n', 'utf8');
    writeFileSync(join(installed, 'a.js'), 'export const a = 2;\n', 'utf8');
    const sourceDigests = treeDigests(source);
    const installedDigests = treeDigests(installed);
    modifiedDetected = Object.keys(sourceDigests).some((name) => installedDigests[name] !== sourceDigests[name]);
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
  }

  const writer = competingWriterVerdict({ beforeDigest: 'before', afterDigest: 'after', installedDuringRun: false });
  const ownInstall = competingWriterVerdict({ beforeDigest: 'before', afterDigest: 'after', installedDuringRun: true });

  return Object.freeze({
    id: 'EXECUTABLE_RUNTIME_ATTESTATION',
    positiveControl: Object.freeze({
      compiledVerificationRequested: compiled.requested,
      compiledVerificationEvaluated: compiled.evaluated,
      compiledDeterministic: compiled.deterministic,
      compiledMatchesSource: compiled.COMPILED_MATCHES_SOURCE,
      installedBundleIdentical: bundle.allIdentical,
      comparedFileByFile: bundle.comparedFileByFile,
      targets: Object.freeze(bundle.targets.map((target) => Object.freeze({ installedName: target.installedName, identical: target.identical, files: target.sourceFileCount }))),
      installerIsMitigationNotProof: bundle.installerIsMitigationNotProof,
    }),
    mutations: Object.freeze({
      modifiedInstalledFileDetected: modifiedDetected,
      competingWriterDetected: writer.competingWriterDetected === true,
      ownInstallIsNotACompetingWriter: ownInstall.competingWriterDetected === false,
    }),
    mutant: Object.freeze({ id: 'L4_RUNTIME_ATTESTATION', measuredBy: 'test/r3l0ciarl_controls.test.ts', baselineViolates: true, note: 'the prior stage skipped source-to-compiled verification and never read the installed bundle' }),
    PASS: compiled.COMPILED_MATCHES_SOURCE === true && bundle.allIdentical === true && modifiedDetected === true && writer.competingWriterDetected === true,
  });
}

/* ================================================================ helpers */

/** A digest over a run root's files, for the "no mutation before refusal" property. */
export function digestRoot(root) {
  const digests = [];
  const walk = (dir, depth) => {
    if (depth > 5) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path, depth + 1);
      else if (entry.isFile()) {
        const relative = path.slice(root.length + 1).replace(/\\/gu, '/');
        try { digests.push(`${relative}:${createHash('sha256').update(readFileSync(path)).digest('hex')}`); } catch { digests.push(`${relative}:UNREADABLE`); }
      }
    }
  };
  walk(root, 0);
  return createHash('sha256').update(digests.sort().join(NL), 'utf8').digest('hex');
}

export { NL, tmpdir, readFileSync, existsSync };
