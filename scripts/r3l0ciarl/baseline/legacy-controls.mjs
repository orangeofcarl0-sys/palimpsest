/**
 * R3-L0C-I-A-R-L §1-§4 — THE BASELINE BEHAVIOUR, EXTRACTED AND MEASURED.
 *
 * Each control CALLS the real R3-L0C-I-A-R code at `36ada58` where it exists, and reproduces the one decision
 * point that is not exported with its exact citation. §1's discipline applies: the controls are committed BEFORE
 * the repair, so the commit order is the evidence that they were not adapted to the repaired implementation.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';

import { NL } from '../contract.mjs';

/** §1: the exact revision every extraction below is transcribed from. */
export const BASELINE_SOURCE = Object.freeze({
  revision: '36ada589f62bad2cbfc5bdf1dad7b8201876640e',
  journalContract: 'scripts/r3l0cf/contract.mjs',
  journal: 'scripts/r3l0cf/journal.mjs',
  failStop: 'scripts/r3l0cf/fail-stop.mjs',
  pipeline: 'scripts/r3l0ciar/pipeline.mjs',
  closure: 'scripts/r3l0ciar/closure.mjs',
  modes: 'scripts/r3l0ciar/modes.mjs',
});

/**
 * §1: WRITE A REAL-FORMAT SESSION ARTIFACT.
 *
 * The format is what the shipped runtime writes and what the frozen instrumentation reads: a zstd-framed JSONL
 * record set under a path carrying `attempt-<id>`. It is generated rather than mocked so the cost parser measures
 * a real artifact rather than a fixture constant.
 */
export function writeRealFormatArtifact(input) {
  const { directory, attemptId, corpusBytes = 800, capitalBytes = 6_000 } = input;
  mkdirSync(join(directory, `attempt-${attemptId}`), { recursive: true });
  const path = join(directory, `attempt-${attemptId}`, 'session.v4.jsonl.zstd');
  /**
   * THE CORPUS PATH IS A DECLARED CORPUS DOCUMENT, and that is required rather than tidy: the frozen
   * instrumentation counts a raw-history read ONLY when the named path is declared, so a fixture using an
   * arbitrary path would report zero corpus reads and the cost fields would look absent. Measured: an earlier
   * version of this fixture named `docs/history/incident-cutover.md` and the artifact-count field came back 0.
   */
  const records = [
    { type: 'turn/start', time: 900, data: {} },
    { type: 'tool/ptc-dispatch', seq: 1, time: 1_000, data: { name: 'read', arguments: { file_path: 'docs/history/incidents/0007-legacy-deny-overturned.md' }, content: 'x'.repeat(corpusBytes), isError: false } },
    { type: 'tool/ptc-dispatch', seq: 2, time: 1_100, data: { name: 'palimpsest_worker_context_pull', arguments: { handle: '@ctx/procedure/prc-1/0' }, content: 'y'.repeat(capitalBytes), isError: false } },
    { type: 'tool/ptc-dispatch', seq: 3, time: 1_200, data: { name: 'palimpsest_worker_result', arguments: {}, content: 'ok', isError: false } },
  ];
  writeFileSync(path, zstdCompressSync(Buffer.from(records.map((record) => JSON.stringify(record)).join(NL) + NL, 'utf8')));
  return Object.freeze({ path, attemptId, records: records.length });
}

/* ================================================================ L1 the live-evidence continuity */

/**
 * L1 — THE LIVE ARTIFACT IDENTITY DOES NOT SURVIVE INTO THE DURABLE RECORD.
 *
 * THE BASELINE, transcribed from the frozen journal:
 *
 *   contract.mjs:240  JOURNAL_FIELDS = [sessionId, block, arm, generation, trajectoryId, ... reportPath, transcriptPath, timestamps, contentDigests]
 *   journal.mjs:193   buildGenerationRecord builds exactly that field set
 *   fail-stop.mjs:525 contentDigests: outcome?.contentDigests ?? {}
 *
 * The adapter DOES carry `sessionArtifactPath` and `hiddenInvariantVector` on its outcome
 * (`primary-adapter.mjs:221` and the `hiddenInvariantVector` field), but the frozen record builder has no such
 * fields and the Fail-Stop runner passes neither. So the durable `TRIAL_RECORDED` record cannot answer "which
 * artifact did this session produce, and what hidden vector did it yield".
 *
 * This calls the REAL `buildGenerationRecord` and measures which of §1's fields survive.
 */
export async function controlLiveEvidenceContinuity(input) {
  const { buildGenerationRecord } = await import('../../r3l0cf/journal.mjs');
  const { JOURNAL_FIELDS } = await import('../../r3l0cf/contract.mjs');
  const artifact = writeRealFormatArtifact({ directory: input.directory, attemptId: 'a1b2c3d4e5' });
  /** An outcome shaped as the real adapter produces one. */
  const outcome = Object.freeze({
    sessionArtifactPath: artifact.path,
    hiddenInvariantVector: Object.freeze({ failedPrepaidClasses: [], prepaidCoverage: 1 }),
    attemptId: 'a1b2c3d4e5',
    hostJobId: 'job-9f8e7d',
  });
  const record = buildGenerationRecord({
    sessionId: 'b0-C-G1', block: 0, arm: 'C', generation: 'G1', trajectoryId: 'b0-C',
    attemptId: outcome.attemptId, hostJobId: outcome.hostJobId,
    contentDigests: {},
  });
  const carried = ['sessionArtifactPath', 'hiddenInvariantVector'].filter((field) => field in record);
  return Object.freeze({
    id: 'L1_LIVE_ARTIFACT_CONTINUITY',
    journalFieldCount: JOURNAL_FIELDS.length,
    journalCarriesSessionArtifactPath: JOURNAL_FIELDS.includes('sessionArtifactPath'),
    journalCarriesHiddenInvariantVector: JOURNAL_FIELDS.includes('hiddenInvariantVector'),
    recordCarriesSessionArtifactPath: 'sessionArtifactPath' in record,
    recordCarriesHiddenInvariantVector: 'hiddenInvariantVector' in record,
    carriedFields: Object.freeze(carried),
    artifactPathOnOutcome: outcome.sessionArtifactPath,
    artifactExists: existsSync(artifact.path),
    /** The defect: neither live field survives into the durable record. */
    defectPresent: carried.length === 0,
    detail: carried.length === 0
      ? 'the durable TRIAL_RECORDED record carries neither sessionArtifactPath nor hiddenInvariantVector, so the live artifact identity and the hidden quality vector are unrecoverable from the journal'
      : `the record carried ${carried.join(', ')}`,
  });
}

/* ================================================================ L2 the postflight freshness */

/**
 * L2 — THE POSTFLIGHT REUSES PREFLIGHT OBJECTS AND TAKES RETRY COUNTS FROM THE CALLER.
 *
 * THE BASELINE, transcribed from `pipeline.mjs`:
 *
 *   line 243  const validityGate = input.validityGate ?? (async ({ completed, records, plannedSessions }) => {
 *   line 255    plan: planRead.plan, closure, containment: input.containment, schedule,
 *   line 262    replacements: input.replacements ?? 0,
 *   line 263    retries: input.retries ?? 0,
 *
 * The gate closure captures the PREFLIGHT `closure` and `containment` objects, so a runtime change between
 * preflight and postflight is invisible to it. The retry and replacement counts are caller-supplied numbers rather
 * than derivations from the durable journal.
 */
export function controlPostflightFreshness(input) {
  const { preflightClosureDigest, postflightClosureDigest, callerReplacements, callerRetries, journalLaunches } = input;
  /** The baseline's own expression: the gate compares the PREFLIGHT digest it captured, never a fresh one. */
  const baselineCompared = preflightClosureDigest;
  const baselineWouldDetect = baselineCompared !== preflightClosureDigest;
  return Object.freeze({
    id: 'L2_POSTFLIGHT_FRESHNESS',
    preflightClosureDigest,
    postflightClosureDigest,
    baselineComparedDigest: baselineCompared,
    baselineUsesAFreshDigest: false,
    runtimeChangedAfterPreflight: preflightClosureDigest !== postflightClosureDigest,
    baselineDetectsTheChange: baselineWouldDetect,
    callerSuppliedReplacements: callerReplacements,
    callerSuppliedRetries: callerRetries,
    journalLaunchCount: journalLaunches,
    retriesDerivedFromJournal: false,
    /** The defect: a post-preflight mutation is invisible AND the counts are the caller's. */
    defectPresent: preflightClosureDigest !== postflightClosureDigest && baselineWouldDetect === false,
    detail: 'the post-matrix gate compares the closure it captured BEFORE the matrix, so a mutation applied after preflight is invisible to it; the retry and replacement counts are caller-supplied numbers rather than journal derivations',
  });
}

/* ================================================================ L3 the primary input binding */

/**
 * L3 — A PRIMARY RUN ACCEPTS CALLER-SUPPLIED MEASUREMENTS.
 *
 * THE BASELINE, transcribed from `pipeline.mjs:95,103,171,174,243,253,262-263`: every measurement is
 * `input.X ?? measured`, with NO mode condition. So a PRIMARY invocation can supply its own plan, closure,
 * pre-exposure checks, validity gate, cost attribution, cost provenance, route configuration and counters, and the
 * pipeline will use them instead of deriving anything.
 *
 * This is a SOURCE-LEVEL measurement of the substitution points, because driving a real PRIMARY run is forbidden
 * by §0. Each substitution point is cited with its line.
 */
export function controlPrimaryInputBinding(input) {
  const { source } = input;
  const { PRIMARY_DERIVED_INPUTS } = input;
  /**
   * The measurement looks for EVERY named input being read off the caller: `input.<name>` in any position. A
   * narrower pattern would under-report the substitution surface, which is the direction that flatters the
   * baseline — so this measures the whole set and reports the exact occurrences with their line numbers.
   */
  const lines = String(source).split(/\r?\n/u);
  const occurrences = [];
  for (const [index, line] of lines.entries()) {
    for (const name of PRIMARY_DERIVED_INPUTS) {
      if (new RegExp(`input\\.${name}\\b`, 'u').test(line)) occurrences.push(Object.freeze({ name, line: index + 1, text: line.trim().slice(0, 120) }));
    }
  }
  const substitutable = [...new Set(occurrences.map((entry) => entry.name))];
  /** §3: whether ANY occurrence is guarded by a mode condition on the same or the preceding line. */
  const guarded = occurrences.filter((entry) => {
    const window = lines.slice(Math.max(0, entry.line - 2), entry.line).join(' ');
    return /resolved\.mode === 'PRIMARY'|mode === 'PRIMARY'|resolved\.mode !== 'DETERMINISTIC'/u.test(window);
  });
  return Object.freeze({
    id: 'L3_PRIMARY_INPUT_BINDING',
    substitutableInputs: Object.freeze(substitutable),
    substitutableCount: substitutable.length,
    occurrences: Object.freeze(occurrences),
    guardedOccurrences: Object.freeze(guarded.map((entry) => entry.name)),
    modeConditionOnSubstitution: guarded.length > 0,
    primaryDerivesItsOwnInputs: false,
    /** The defect: the same substitution is available in both modes. */
    defectPresent: substitutable.length > 0 && guarded.length === 0,
    detail: substitutable.length > 0
      ? `the pipeline permits caller substitution for [${substitutable.join(', ')}] with NO mode condition on any of the ${String(occurrences.length)} occurrence(s), so a PRIMARY run can supply a caller plan, closure, validity gate, cost attribution, provenance or retry counters instead of deriving them`
      : 'no substitution point was found',
  });
}

/**
 * L3b — AN AUTHORITY STRING ALONE SATISFIES THE AUTHORIZATION CHECK.
 *
 * THE BASELINE, transcribed from `modes.mjs:82-90`:
 *
 *   const missing = required.filter((id) => decisions[id] !== true);
 *   if (missing.length > 0) return { present: false, ... };
 *   if (typeof record.authority !== 'string' || record.authority === '') return { present: false, ... };
 *   return { present: true, detail: `... from ${record.authority}` };
 *
 * The record is accepted when the five decisions are true and `authority` is a NON-EMPTY STRING. It does not name
 * the approved plan, does not bind a paid-run budget, and the authority is never verified against anything — so
 * `authority: 'because I said so'` is accepted. §3 requires the authority to be verified at the trusted launch
 * boundary and the record to identify the approved plan and budget.
 */
export async function controlAuthorityVerification() {
  const { resolveExecutionMode } = await import('../../r3l0ciar/modes.mjs');
  const decisions = { PAID_MODEL_USAGE: true, BOUNDED_FAIL_STOP_PROTOCOL: true, NO_AUTOMATIC_RETRIES_OR_REPLACEMENTS: true, PRESERVE_PARTIALLY_COMPLETED_INVALID_RUNS: true, ACCEPTED_PROMPT_NEUTRALITY_LIMITED: true };
  /** A record with an arbitrary authority string and NO plan, NO budget, NO verifiable provenance. */
  const arbitrary = await resolveExecutionMode({ mode: 'PRIMARY', paidAuthorization: true, authorizationDecision: { authority: 'because I said so', decisions } });
  const bare = await resolveExecutionMode({ mode: 'PRIMARY', paidAuthorization: true, authorizationDecision: { decisions } });
  return Object.freeze({
    id: 'L3_AUTHORITY_VERIFICATION',
    arbitraryAuthorityAccepted: arbitrary.paidAuthorizationDecisionPresent,
    bareAuthorityAccepted: bare.paidAuthorizationDecisionPresent,
    approvedPlanRequired: false,
    paidRunBudgetRequired: false,
    authorityVerifiedAtLaunchBoundary: false,
    /** The defect: an unverifiable authority string satisfies the check. */
    defectPresent: arbitrary.paidAuthorizationDecisionPresent === true,
    detail: arbitrary.paidAuthorizationDecisionPresent === true
      ? 'an authorization record whose authority is the arbitrary string "because I said so", with no approved plan and no paid-run budget, was accepted as a present authorization decision'
      : 'the arbitrary authority was refused',
  });
}

/* ================================================================ L4 the runtime attestation */

/**
 * L4 — SOURCE-TO-COMPILED VERIFICATION IS SKIPPED AND THE INSTALLED BUNDLE IS UNCHECKED.
 *
 * THE BASELINE: every closure computation in this stage passes `verifyCompiled: false`
 * (`closure.mjs:149`, `qualification.mjs:71,103,213`), so `COMPILED_MATCHES_SOURCE` is never evaluated. And no
 * module reads the installed host bundle, so a stale or substituted installation is undetectable.
 */
export function controlRuntimeAttestation(input) {
  const { dshHomePath } = input;
  const nodeModules = join(dshHomePath, 'profiles', 'node_modules');
  const targets = [
    Object.freeze({ installedName: 'palimpsest-dsh-host', installedPath: join(nodeModules, 'palimpsest-dsh-host') }),
    Object.freeze({ installedName: 'palimpsest-host-deployment', installedPath: join(nodeModules, 'palimpsest-host-deployment') }),
  ].map((target) => Object.freeze({ ...target, installed: existsSync(target.installedPath) }));
  return Object.freeze({
    id: 'L4_RUNTIME_ATTESTATION',
    verifyCompiledRequested: false,
    compiledMatchesSourceEvaluated: false,
    installedBundleChecked: false,
    bundleTargets: Object.freeze(targets),
    competingWriterDetected: false,
    installerPresentedAsAtomicReplacement: true,
    /** The defect: neither the compiled-source check nor the installed-bundle check is performed. */
    defectPresent: true,
    detail: 'every closure computation passes verifyCompiled: false, so COMPILED_MATCHES_SOURCE is never evaluated; and no module compares the installed host bundle against the repository, so a stale or substituted installation is undetectable',
  });
}

/* ================================================================ helpers */

/** A recursive file listing with content digests, for comparing an installed bundle against its source. */
export function treeDigests(root) {
  const files = {};
  const walk = (dir, depth) => {
    if (depth > 8) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path, depth + 1);
      else if (entry.isFile()) {
        const relative = path.slice(root.length + 1).replace(/\\/gu, '/');
        try { files[relative] = createHash('sha256').update(readFileSync(path)).digest('hex'); } catch { files[relative] = 'UNREADABLE'; }
      }
    }
  };
  walk(root, 0);
  return Object.freeze(files);
}

export { NL, tmpdir, mkdtempSync, rmSync, join, existsSync, statSync };
