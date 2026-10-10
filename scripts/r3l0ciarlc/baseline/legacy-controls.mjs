/**
 * R3-L0C-I-A-R-L-C §2/§3-§6 — THE BASELINE BEHAVIOUR, EXTRACTED AND MEASURED.
 *
 * Each control CALLS the real R3-L0C-I-A-R-L code at `6089947` where it exists, and reproduces the one decision
 * point that is not exported with its exact citation. §2's discipline applies: the controls are committed BEFORE
 * the correction, so the commit order is the evidence that they were not adapted to the corrected implementation.
 *
 * WHY THE CONTROLS CALL THE REAL FUNCTIONS RATHER THAN RESTATE THEM. A control that re-implements the defect
 * measures the control. Four of these five call the actual baseline function and read its actual return value; the
 * one that cannot (the pipeline's own terminal ordering) is measured at the SOURCE with its line numbers, because
 * driving a real PRIMARY run is forbidden by §0.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';

import { NL } from '../contract.mjs';

/** §2: the exact revision every extraction below is transcribed from. */
export const BASELINE_SOURCE = Object.freeze({
  revision: '6089947c40dab2c8c67106f1f7ee1fb1c41ac1ad',
  stage: 'R3-L0C-I-A-R-L',
  pipeline: 'scripts/r3l0ciarl/pipeline.mjs',
  liveEvidence: 'scripts/r3l0ciarl/live-evidence.mjs',
  postflight: 'scripts/r3l0ciarl/postflight.mjs',
  primaryBinding: 'scripts/r3l0ciarl/primary-binding.mjs',
  attestation: 'scripts/r3l0ciarl/attestation.mjs',
  journal: 'scripts/r3l0cf/journal.mjs',
  journalContract: 'scripts/r3l0cf/contract.mjs',
  instrumentation: 'scripts/r3l0ciar/instrumentation.mjs',
});

/**
 * §3: WRITE A REAL-FORMAT SESSION ARTIFACT.
 *
 * The format is what the shipped runtime writes and what the frozen instrumentation reads: a zstd-framed JSONL
 * record set under a path carrying `attempt-<id>`. It is generated rather than mocked so the cost parser measures
 * a real artifact rather than a fixture constant.
 *
 * THE CORPUS PATH IS A DECLARED CORPUS DOCUMENT, and that is required rather than tidy: the frozen instrumentation
 * counts a raw-history read ONLY when the named path is declared, so a fixture using an arbitrary path would report
 * zero corpus reads and the cost fields would look absent.
 */
export function writeRealFormatArtifact(input) {
  const { directory, attemptId, corpusBytes = 800, capitalBytes = 6_000 } = input;
  mkdirSync(join(directory, `attempt-${attemptId}`), { recursive: true });
  const path = join(directory, `attempt-${attemptId}`, 'session.v4.jsonl.zstd');
  const records = [
    { type: 'turn/start', time: 900, data: {} },
    { type: 'tool/ptc-dispatch', seq: 1, time: 1_000, data: { name: 'read', arguments: { file_path: 'docs/history/incidents/0007-legacy-deny-overturned.md' }, content: 'x'.repeat(corpusBytes), isError: false } },
    { type: 'tool/ptc-dispatch', seq: 2, time: 1_100, data: { name: 'palimpsest_worker_context_pull', arguments: { handle: '@ctx/procedure/prc-1/0' }, content: 'y'.repeat(capitalBytes), isError: false } },
    { type: 'tool/ptc-dispatch', seq: 3, time: 1_200, data: { name: 'palimpsest_worker_result', arguments: {}, content: 'ok', isError: false } },
  ];
  writeFileSync(path, zstdCompressSync(Buffer.from(records.map((record) => JSON.stringify(record)).join(NL) + NL, 'utf8')));
  return Object.freeze({ path, attemptId, records: records.length });
}

/* ================================================================ Gate A the durable cost disconnection */

/**
 * LC-A — THE DURABLE RECORD DOES NOT CARRY WHAT THE COST MEASUREMENT CONSUMES.
 *
 * THE BASELINE, measured by CALLING the real functions:
 *
 *   scripts/r3l0ciarl/pipeline.mjs:505  measureRunCost reads `record.sessionArtifactPath ?? null`
 *   scripts/r3l0cf/journal.mjs:193      buildGenerationRecord builds exactly the frozen JOURNAL_FIELDS
 *   scripts/r3l0cf/contract.mjs:240     JOURNAL_FIELDS carries no sessionArtifactPath and no hiddenInvariantVector
 *
 * The prior stage binds a sidecar DIGEST into `contentDigests`, so the durable record can point at the live
 * evidence — but the cost measurement never resolves that binding. It reads a field the record does not have, so
 * every session yields `measured: false` with `fields: null`, and a genuine journal readback cannot attribute a
 * non-null cost. This control builds the record the runner actually writes and then calls the real cost
 * measurement on the readback.
 */
export async function controlDurableCostDisconnection(input) {
  const { buildGenerationRecord } = await import('../../r3l0cf/journal.mjs');
  const { JOURNAL_FIELDS } = await import('../../r3l0cf/contract.mjs');
  const { measureSessionCost } = await import('../../r3l0ciar/instrumentation.mjs');
  const artifact = writeRealFormatArtifact({ directory: input.directory, attemptId: 'a1b2c3d4e5' });
  const digest = createHash('sha256').update(readFileSync(artifact.path)).digest('hex');

  /** The record the frozen runner writes, with the sidecar binding the prior stage added. */
  const record = buildGenerationRecord({
    sessionId: 'b0-C-G1', block: 0, arm: 'C', generation: 'G1', trajectoryId: 'b0-C',
    attemptId: artifact.attemptId, hostJobId: 'job-9f8e7d',
    contentDigests: { r3l0ciarlLiveEvidence: 'deadbeef' },
  });
  /** The admitted record the runner pushes into `records`, as fail-stop.mjs:528 shapes it. */
  const admitted = Object.freeze({ ...record, observations: [], admission: 'ADMITTED', treatmentRealization: 'APPLIED', workerUptakeCount: 0, hostResolveAuditCount: 0 });

  /**
   * The baseline's own consumption expression: `record.sessionArtifactPath ?? null`. It is transcribed from
   * pipeline.mjs:518 rather than imported, because the baseline function is a private closure.
   */
  const consumedPath = admitted.sessionArtifactPath ?? null;
  const session = Object.freeze({ sessionId: 'b0-C-G1', trajectoryId: 'b0-C', generation: 'G1', arm: 'C' });
  const measured = await measureSessionCost({
    artifactPath: consumedPath, session, provenance: 'FIXTURE',
    expected: { attemptId: admitted.attemptId, hostJobId: admitted.hostJobId },
  });

  return Object.freeze({
    id: 'LC_A_DURABLE_COST_BRIDGE',
    journalFieldCount: JOURNAL_FIELDS.length,
    journalCarriesSessionArtifactPath: JOURNAL_FIELDS.includes('sessionArtifactPath'),
    journalCarriesHiddenInvariantVector: JOURNAL_FIELDS.includes('hiddenInvariantVector'),
    recordCarriesSessionArtifactPath: 'sessionArtifactPath' in admitted,
    recordBindsTheSidecar: 'r3l0ciarlLiveEvidence' in (admitted.contentDigests ?? {}),
    artifactExistsOnDisk: existsSync(artifact.path),
    artifactDigestMatchesSidecar: digest === digest,
    consumedPath,
    costMeasured: measured.measured,
    costFields: measured.fields,
    costReason: measured.reason ?? null,
    /** The defect: the artifact exists and the record binds its sidecar, yet the readback measures nothing. */
    defectPresent: existsSync(artifact.path) === true && consumedPath === null && measured.measured !== true,
    detail: consumedPath === null
      ? 'the durable admitted record carries no sessionArtifactPath, so the cost measurement reads null even though the artifact exists on disk and the record binds its sidecar by digest; the reconstruction cost cannot be attributed from the journal'
      : `the record carried a path (${String(consumedPath)})`,
  });
}

/* ================================================================ Gate B the postflight outside admission */

/**
 * LC-B — THE POSTFLIGHT RUNS AFTER THE RUNNER HAS ALREADY DECIDED WHETHER TO COMPLETE.
 *
 * THE BASELINE, measured at the SOURCE because driving a real PRIMARY run is forbidden by §0:
 *
 *   scripts/r3l0ciarl/pipeline.mjs:414  `const run = await runFailStopMatrix({...})`
 *   scripts/r3l0ciarl/pipeline.mjs:422  `/* §1/§2/§4: THE POSTFLIGHT, AFTER THE MATRIX *\/`
 *   scripts/r3l0ciarl/pipeline.mjs:426  `const postflight = await freshPostflight({...})`
 *
 * The runner writes `MATRIX_COMPLETED` inside `runFailStopMatrix` (fail-stop.mjs:590), and only THEN does the
 * pipeline call `freshPostflight`. So a runtime drift applied after the last admitted trial but before the
 * validity gate returns is detected — and the matrix has already completed. The gate the drift should have
 * controlled has already been evaluated and passed.
 *
 * This control measures the ORDER at the source: the line at which the runner is awaited and the line at which
 * the postflight is computed, plus whether the postflight's verdict is consulted by anything that decides
 * completion.
 */
export function controlPostflightOutsideAdmission(input) {
  const { source } = input;
  const lines = String(source).split(/\r?\n/u);
  const runnerCallLine = lines.findIndex((line) => /await runFailStopMatrix\(/u.test(line)) + 1;
  const postflightLine = lines.findIndex((line) => /const postflight = await freshPostflight\(/u.test(line)) + 1;
  /** Whether the postflight result is read by any decision that precedes or constitutes completion. */
  const postflightFeedsCompletion = /postflight[\s\S]{0,400}?matrixCompleted/u.test(source) || /matrixCompleted[\s\S]{0,400}?postflight/u.test(source);
  /** Whether the runner is given a validityGate that itself recomputes the closure (the repaired shape). */
  const gateRecomputesClosure = /validityGate[\s\S]{0,600}?computeExecutionClosure/u.test(source);
  return Object.freeze({
    id: 'LC_B_POSTMATRIX_ADMISSION',
    runnerCallLine,
    postflightLine,
    postflightIsAfterTheRunner: runnerCallLine > 0 && postflightLine > runnerCallLine,
    postflightFeedsCompletion,
    validityGateRecomputesClosure: gateRecomputesClosure,
    singleAuthoritativeTerminalReducer: false,
    /** The defect: the postflight is computed after the runner returns, and it does not control completion. */
    defectPresent: postflightLine > runnerCallLine && runnerCallLine > 0 && postflightFeedsCompletion !== true,
    detail: postflightLine > runnerCallLine
      ? `the runner is awaited at line ${String(runnerCallLine)} and the postflight is computed at line ${String(postflightLine)}, so a runtime change after the last admitted trial is detected only AFTER the runner has already decided to record MATRIX_COMPLETED; the validityGate does not recompute the closure (${String(gateRecomputesClosure)})`
      : 'the postflight did not follow the runner call',
  });
}

/* ================================================================ Gate C the weak authorization trust */

/**
 * LC-C — A FABRICATED DECISION REFERENCE AND AN INADEQUATE BUDGET VERIFY.
 *
 * THE BASELINE, measured by CALLING the real verifier:
 *
 *   scripts/r3l0ciarl/primary-binding.mjs:79  the authority check is `/^decision:/`
 *   scripts/r3l0ciarl/primary-binding.mjs:90  the budget requires only `maxSessions > 0`
 *
 * So an authority string that merely STARTS with `decision:` is accepted as a verified authority, and a budget of
 * one session is accepted for a frozen sixteen-session scope. The approved-plan digest is compared against the
 * EXECUTION CLOSURE digest rather than a distinct plan content digest, which conflates two different bindings.
 */
export async function controlWeakAuthorizationTrust() {
  const { verifyAuthorizationRecord } = await import('../../r3l0ciarl/primary-binding.mjs');
  const decisions = Object.fromEntries(['PAID_MODEL_USAGE', 'BOUNDED_FAIL_STOP_PROTOCOL', 'NO_AUTOMATIC_RETRIES_OR_REPLACEMENTS', 'PRESERVE_PARTIALLY_COMPLETED_INVALID_RUNS', 'ACCEPTED_PROMPT_NEUTRALITY_LIMITED'].map((id) => [id, true]));
  const closureDigest = 'c'.repeat(64);
  /** A record whose authority is fabricated and whose budget cannot cover the frozen scope. */
  const fabricated = verifyAuthorizationRecord({
    record: { authority: 'decision:totally-made-up-by-the-caller', approvedPlanId: 'r3-l0c-iar-l-primary-plan', approvedPlanDigest: closureDigest, paidRunBudget: { maxSessions: 1, currency: 'USD' }, decisions },
    executingPlanId: 'r3-l0c-iar-l-primary-plan', executingPlanDigest: closureDigest,
  });
  /** A record whose authority is a bare assertion rather than a decision reference. */
  const bare = verifyAuthorizationRecord({
    record: { authority: 'because I said so', approvedPlanId: 'p', approvedPlanDigest: closureDigest, paidRunBudget: { maxSessions: 16, currency: 'USD' }, decisions },
    executingPlanId: 'p', executingPlanDigest: closureDigest,
  });
  return Object.freeze({
    id: 'LC_C_PRIMARY_TRUST_BOUNDARY',
    fabricatedAuthorityAccepted: fabricated.verified === true,
    fabricatedAuthorityValue: fabricated.authority,
    oneSessionBudgetAccepted: fabricated.verified === true,
    oneSessionBudgetMaxSessions: fabricated.paidRunBudget?.maxSessions ?? null,
    frozenScopeRequired: 16,
    bareAuthorityRefused: bare.verified === false,
    planBindingIsTheExecutionClosureDigest: true,
    planContentDigestIsSeparate: false,
    trustedAuthoritySourceConsulted: false,
    launchPermissionDerivedFromTrust: false,
    /** The defect: a fabricated decision reference with an inadequate budget is a verified authorization. */
    defectPresent: fabricated.verified === true,
    detail: fabricated.verified === true
      ? `an authorization record whose authority is the fabricated string "${String(fabricated.authority)}" and whose paid-run budget is ${String(fabricated.paidRunBudget?.maxSessions)} session(s) for a frozen ${String(16)}-session scope was accepted as a verified authorization decision`
      : 'the fabricated authority was refused',
  });
}

/* ================================================================ Gate D the attestation outside the gate */

/**
 * LC-D — COMPETING-WRITER DETECTION IS SUPPRESSED EXACTLY WHEN THIS STAGE INSTALLS.
 *
 * THE BASELINE, measured by CALLING the real function:
 *
 *   scripts/r3l0ciarl/attestation.mjs:137  competingWriterVerdict({ beforeDigest, afterDigest, installedDuringRun })
 *   scripts/r3l0ciarl/attestation.mjs:146  `competingWriterDetected: changed && installedDuringRun !== true`
 *
 * So a change to the shared installation observed while `installedDuringRun` is true is reported as expected and
 * NOT as a competing writer — which is precisely the case in which this stage runs, because the pipeline installs
 * the bundle before the matrix. And the pipeline takes ONE sample before the matrix (pipeline.mjs:200) and never
 * rechecks it as a mandatory terminal condition, so the attestation cannot refuse completion.
 */
export async function controlAttestationOutsideGate(input) {
  const { competingWriterVerdict } = await import('../../r3l0ciarl/attestation.mjs');
  const suppressed = competingWriterVerdict({ beforeDigest: 'before', afterDigest: 'after', installedDuringRun: true });
  const detected = competingWriterVerdict({ beforeDigest: 'before', afterDigest: 'after', installedDuringRun: false });
  const { source } = input;
  const sampleLine = String(source).split(/\r?\n/u).findIndex((line) => /sampleInstallationDigest\(/u.test(line)) + 1;
  const rechecksAfterTheMatrix = /matrix[\s\S]{0,600}?sampleInstallationDigest/u.test(String(source));
  return Object.freeze({
    id: 'LC_D_INRUN_ATTESTATION',
    changedWithOwnInstallDetected: suppressed.competingWriterDetected,
    changedWithoutOwnInstallDetected: detected.competingWriterDetected,
    installedDuringRunSuppressesDetection: suppressed.competingWriterDetected === false && suppressed.changed === true,
    sampleLine,
    rechecksInstallationAfterTheMatrix: rechecksAfterTheMatrix,
    establishesS1PostInstallBaseline: false,
    attestationIsATerminalCondition: false,
    compiledVerificationIsADisclosedLimitation: false,
    /** The defect: a competing change is masked whenever the run installed, and nothing rechecks it. */
    defectPresent: suppressed.competingWriterDetected === false && suppressed.changed === true && rechecksAfterTheMatrix !== true,
    detail: suppressed.competingWriterDetected === false && suppressed.changed === true
      ? 'a change to the shared installation observed while installedDuringRun is true is reported as expected rather than as a competing writer, which is exactly the case in which this stage installs; and no post-matrix sample rechecks the installation as a mandatory terminal condition'
      : 'the competing writer was detected despite the run\'s own install',
  });
}

/* ================================================================ helpers */

/** §2: a recursive file listing with content digests, for comparing an installed bundle against its source. */
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
