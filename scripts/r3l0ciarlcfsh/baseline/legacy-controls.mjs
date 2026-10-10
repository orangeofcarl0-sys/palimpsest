/**
 * R3-L0C-I-A-R-L-C-F-S-H §2 — THE MEASURED BASELINE CONTROLS.
 *
 * §2 requires each suspected defect to be REPRODUCED against the actual committed implementation before any
 * correction exists, and explicitly forbids marking a defect confirmed by assertion: "If a suspected baseline
 * defect cannot be reproduced, do not mark it confirmed by assertion. Report the actual evidence and narrow the
 * corrective work accordingly."
 *
 * Every control below therefore CALLS the real function at `80823c4` and returns its ACTUAL return value. The
 * controls that must exercise a dangerous filesystem branch use small disposable directories under the system temp
 * root, never the repository's own `node_modules`, `dist`, global DSH installation or any user data.
 *
 * The measurements are the frozen ones: this file is committed BEFORE the corrections, and it is not edited
 * afterwards, so a later reader can see the defect the correction was aimed at rather than a restatement of it.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';

import { BASELINE_COMMIT, NL, REPO_ROOT } from '../contract.mjs';

/** §2: the exact revision the controls were measured against, so a reader can re-run them there. */
export const BASELINE_SOURCE = Object.freeze({
  revision: BASELINE_COMMIT,
  stage: 'R3-L0C-I-A-R-L-C-F-S',
  files: Object.freeze([
    'scripts/r3l0ciarlcfs/pipeline.mjs',
    'scripts/r3l0ciarlcfs/safe-cleanup.mjs',
    'scripts/r3l0ciarlcfs/qualification.mjs',
    'scripts/r3l0ciarlcfs/acceptance.mjs',
    'scripts/r3l0ciarlcf/cost-bridge.mjs',
    'scripts/r3l0c/instrumentation.mjs',
  ]),
  note: 'the controls CALL these committed functions; the measurement is their actual return value',
});

/** §2: write a real-format zstd session artifact whose decompressed body is the supplied JSONL records. */
export function writeRealArtifact(input) {
  const { directory, attemptId, records } = input;
  const attemptDirectory = join(directory, `attempt-${attemptId}`);
  mkdirSync(attemptDirectory, { recursive: true });
  const path = join(attemptDirectory, 'session.v4.jsonl.zstd');
  writeFileSync(path, zstdCompressSync(Buffer.from(`${records.map((record) => JSON.stringify(record)).join(NL)}${NL}`, 'utf8')));
  return Object.freeze({ path, attemptId, records: records.length });
}

/** §2: a file's sha256, used to build an internally consistent sidecar binding. */
function digestOfFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * §2 B1 — THE ARTIFACT VALIDATOR IS NOT CONSUMED BY THE AUTHORITATIVE COST PATH.
 *
 * §2 requires a real-format artifact containing only `{"type":"noise"}`, with an internally consistent sidecar
 * digest and artifact identity, and requires the control to show whether the EXISTING cost bridge treats it as
 * measured and returns zero reconstruction-cost fields — and then to distinguish the old bridge's response from the
 * new standalone validator's response. §2 also states the defect to establish is not that the validator is
 * incorrect but that the authoritative cost-admission consumer does not use it.
 */
export async function controlValidatorNotConsumed() {
  const { bridgeMatrixCost, LIVE_EVIDENCE_DIRECTORY } = await import('../../r3l0ciarlcf/cost-bridge.mjs');
  const { validateArtifactEnvelope } = await import('../../r3l0ciarlcfs/artifact-validity.mjs');
  const { decompressFrames, reconstructCost, sessionRecords } = await import('../../r3l0c/instrumentation.mjs');
  const { appendRecord } = await import('../../r3l0cf/journal.mjs');

  const root = mkdtempSync(join(tmpdir(), 'r3lcfsh-b1-'));
  try {
    const attemptId = 'a'.repeat(32);
    const artifact = writeRealArtifact({ directory: join(root, 'artifacts'), attemptId, records: [{ type: 'noise' }] });
    const artifactDigest = digestOfFile(artifact.path);

    const runRoot = join(root, 'run');
    mkdirSync(join(runRoot, LIVE_EVIDENCE_DIRECTORY), { recursive: true });
    const sidecar = {
      schemaVersion: 1, kind: 'r3l0ciarl live evidence', sessionId: 's0', sessionArtifactPath: artifact.path,
      sessionArtifactDigest: artifactDigest, hiddenInvariantVector: null, attemptId: `attempt-${attemptId}`,
      hostJobId: 'job-b1', costProvenance: 'FIXTURE', mode: 'DETERMINISTIC',
    };
    const sidecarText = `${JSON.stringify(sidecar, null, 2)}${NL}`;
    writeFileSync(join(runRoot, LIVE_EVIDENCE_DIRECTORY, 's0.json'), sidecarText, 'utf8');
    const sidecarDigest = createHash('sha256').update(sidecarText, 'utf8').digest('hex');

    const journalPath = join(runRoot, 'generation-journal.jsonl');
    appendRecord({ journalPath, kind: 'EXPOSURE_INTENT_RECORDED', payload: { sessionId: 's0' } });
    appendRecord({ journalPath, kind: 'WORKER_LAUNCH_RECORDED', payload: { sessionId: 's0', attempt: 1 } });
    appendRecord({ journalPath, kind: 'TRIAL_RECORDED', payload: { sessionId: 's0', record: {
      sessionId: 's0', block: 0, arm: 'C', generation: 'G1', trajectoryId: 'b0-C',
      attemptId: `attempt-${attemptId}`, hostJobId: 'job-b1',
      intendedExecutorRoute: 'the deterministic scripted worker',
      contentDigests: { r3l0ciarlLiveEvidence: sidecarDigest },
    } } });

    /** THE MEASUREMENT: the REAL authoritative bridge, over a real durable journal and a digest-bound sidecar. */
    const bridge = await bridgeMatrixCost({ journalPath, runRoot, plannedSessions: ['s0'], artifactRoot: null });
    const attributed = bridge.perSession[0];
    /** The new validator's INDEPENDENT response to the same bytes. */
    const validator = validateArtifactEnvelope({ artifactPath: artifact.path, decompressFrames, sessionRecords });
    /** The frozen instrumentation's own answer, so the zero is attributable rather than assumed. */
    const frozenCost = reconstructCost({ path: artifact.path, attemptId });

    return Object.freeze({
      id: 'B1_VALIDATOR_NOT_CONSUMED',
      requirement: 'H1',
      authorityBearingFunction: 'scripts/r3l0ciarlcf/cost-bridge.mjs bridgeMatrixCost -> attributeSessionFromRecord -> interpretArtifact -> scripts/r3l0c/instrumentation.mjs reconstructCost',
      durableEvidence: 'a real durable journal written with the frozen appendRecord, a real zstd artifact and a digest-bound sidecar under the temp root',
      validatorIsAbsentFromTheChain: true,
      observed: Object.freeze({
        oldBridgeOutcome: attributed.outcome.id,
        oldBridgeMeasured: attributed.measured === true,
        oldBridgeRawHistoryArtifactsRead: attributed.fields?.rawHistoryArtifactsRead ?? null,
        oldBridgeMeasuredCount: bridge.measuredCount,
        oldBridgeInterpretable: bridge.interpretable === true,
        newValidatorState: validator.state,
        newValidatorInterpretable: validator.interpretable === true,
        frozenReconstructCostRawHistoryArtifactsRead: frozenCost.rawHistoryArtifactsRead,
      }),
      /** §2: the defect is the missing CONSUMER, not an incorrect validator. */
      defectPresent: attributed.measured === true
        && attributed.fields?.rawHistoryArtifactsRead === 0
        && validator.interpretable === false,
      defectDetail: attributed.measured === true
        ? 'the authoritative bridge admits an ENVELOPE_INVALID artifact as a measured observation with zero cost fields, while the standalone validator correctly rejects it — so the validator is not on the authoritative path'
        : 'the authoritative bridge did not admit the invalid artifact, so this defect was NOT reproduced and the corrective work must be narrowed',
      correctionMustLiveIn: 'scripts/r3l0ciarlcfsh/validated-cost-bridge.mjs validatedCostBridge',
    });
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

/** §2: create a Windows junction or a POSIX symlink, reporting whether the platform permitted it. */
function makeLink(linkPath, target) {
  try {
    if (process.platform === 'win32') execFileSync('cmd', ['/c', 'mklink', '/J', linkPath, target], { stdio: ['ignore', 'pipe', 'pipe'] });
    else execFileSync('ln', ['-s', target, linkPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    return true;
  } catch { return false; }
}

/**
 * §2 B2 — THE CLEANUP IMPLEMENTATION REACHES DESTRUCTIVE OPERATIONS.
 *
 * §2 names five things to measure with isolated tests: a dangling symlink that satisfies `existsSync === false`
 * while `lstat` proves the link exists; a string-prefix path check that accepts a sibling; a caller-provided
 * `checkout.owned === true` substituted for verified ownership; nested link-like entries outside a root-only
 * enumeration; and a sequence that reaches a destructive operation without proving every link was removed.
 *
 * §2 also requires: "Do not endanger actual `node_modules`, `dist`, user worktrees or real shared directories."
 * Every target below is a small disposable directory under the system temp root.
 *
 * Four independent measurements, each against the committed `destroyDisposableCheckout`:
 *
 *   N1  a path with NO marker but a caller-supplied `owned: true`
 *   N2  a sibling directory whose name shares a textual prefix with the expected root
 *   N3  a dangling junction, where `existsSync` is false and `lstat` proves the link remains
 *   N4  a link nested below the worktree root, which a root-only enumeration does not see
 */
export async function controlCleanupDefects() {
  const { destroyDisposableCheckout, createDisposableCheckout, DISPOSABLE_MARKER } = await import('../../r3l0ciarlcfs/safe-cleanup.mjs');
  const { existsSync: exists, lstatSync } = await import('node:fs');
  const root = mkdtempSync(join(tmpdir(), 'r3lcfsh-b2-'));
  const findings = {};
  try {
    /** N1: a caller-supplied ownership claim on a directory this stage never created. */
    const unowned = join(root, 'unowned-but-claimed');
    mkdirSync(unowned, { recursive: true });
    writeFileSync(join(unowned, 'user-data.txt'), 'irreplaceable', 'utf8');
    const claimed = destroyDisposableCheckout({ checkout: { root: unowned, owned: true, links: [] } });
    findings.callerSuppliedOwnership = Object.freeze({
      outcome: claimed.outcome,
      destructiveFallbackExecuted: claimed.destructiveFallbackExecuted === true,
      directorySurvived: exists(unowned) === true,
      userFileSurvived: exists(join(unowned, 'user-data.txt')) === true,
    });

    /** N2: a sibling directory accepted by a textual prefix comparison. */
    const expectedRoot = join(root, 'r3lcfs-worktree-expected');
    const sibling = join(root, 'r3lcfs-worktree-expected-sibling');
    mkdirSync(expectedRoot, { recursive: true });
    mkdirSync(sibling, { recursive: true });
    writeFileSync(join(sibling, DISPOSABLE_MARKER), `${JSON.stringify({ stage: 'R3-L0C-I-A-R-L-C-F-S' })}${NL}`, 'utf8');
    writeFileSync(join(sibling, 'sibling-data.txt'), 'must survive', 'utf8');
    const prefix = destroyDisposableCheckout({ checkout: { root: sibling, links: [] }, expectedRoot });
    findings.prefixSibling = Object.freeze({
      outcome: prefix.outcome,
      destructiveFallbackExecuted: prefix.destructiveFallbackExecuted === true,
      siblingSurvived: exists(sibling) === true,
      siblingFileSurvived: exists(join(sibling, 'sibling-data.txt')) === true,
    });

    /** N3: a dangling junction. `existsSync` follows the link; `lstat` describes the link itself. */
    const dangling = join(root, 'dangling-junction');
    const danglingCreated = makeLink(dangling, join(root, 'target-that-does-not-exist'));
    let lstatSucceeds = false;
    try { lstatSync(dangling); lstatSucceeds = true; } catch { lstatSucceeds = false; }
    findings.danglingLink = Object.freeze({
      linkCreated: danglingCreated,
      existsSyncFalseWhileLinkRemains: danglingCreated === true && exists(dangling) === false && lstatSucceeds === true,
      existsSync: exists(dangling),
      lstatSucceeds,
      note: danglingCreated === true
        ? 'a dangling link reports existsSync === false while lstat still proves the link exists, so existsSync is not a valid post-unlink witness'
        : 'the platform did not permit the disposable link to be created, so this branch was NOT measured here and is reported as such',
    });

    /** N4: a link nested BELOW the worktree root, which the root-only enumeration cannot see. */
    const checkout = createDisposableCheckout();
    const nestedDirectory = join(checkout.root, 'a-nested-directory');
    mkdirSync(nestedDirectory, { recursive: true });
    const nestedLink = join(nestedDirectory, 'nested-link');
    const nestedCreated = makeLink(nestedLink, root);
    const nestedResult = destroyDisposableCheckout({ checkout });
    const enumeration = nestedResult.steps.find((step) => step.id === 'ENUMERATE_LINKS_AND_UNEXPECTED_LINK_LIKE_ENTRIES');
    findings.nestedLink = Object.freeze({
      nestedLinkCreated: nestedCreated,
      seenByRootOnlyEnumeration: (enumeration?.observation?.unexpected ?? []).length,
      outcome: nestedResult.outcome,
      destructiveFallbackExecuted: nestedResult.destructiveFallbackExecuted === true,
      note: 'the enumeration reads only the worktree root, so a link below it is invisible to the safety check',
    });

    const defectPresent = findings.callerSuppliedOwnership.destructiveFallbackExecuted === true
      && findings.callerSuppliedOwnership.userFileSurvived === false
      && findings.prefixSibling.destructiveFallbackExecuted === true
      && findings.prefixSibling.siblingFileSurvived === false
      && findings.nestedLink.seenByRootOnlyEnumeration === 0;

    return Object.freeze({
      id: 'B2_CLEANUP_REACHES_DESTRUCTIVE_OPERATIONS',
      requirement: 'H2',
      authorityBearingFunction: 'scripts/r3l0ciarlcfs/safe-cleanup.mjs destroyDisposableCheckout',
      durableEvidence: 'disposable directories and junctions under the system temp root; no shared dependency, user worktree or real directory is touched',
      observed: Object.freeze(findings),
      defectPresent,
      defectDetail: defectPresent
        ? 'a caller-supplied ownership flag and a textual prefix comparison each authorised a destructive cleanup that DELETED a directory outside the intended disposable root, and a nested link was invisible to the safety enumeration'
        : 'not every named cleanup defect was reproduced on this host; the corrective work must be narrowed to the branches actually measured',
      correctionMustLiveIn: 'scripts/r3l0ciarlcfsh/safe-cleanup.mjs destroyDisposableCheckout',
    });
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

/** §2: read a committed JSON evidence file, or null. */
function readEvidence(relative) {
  const path = join(REPO_ROOT, relative);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

/**
 * §2 B3 — THE CONTRADICTORY PERSISTED SEAL STATE.
 *
 * §2 requires the control to prove the contradiction exists IN COMMITTED EVIDENCE, not merely in memory, and to
 * determine the exact calculation order and sources of each field. So this reads the committed Qualification from
 * disk and reports the three fields §2 names, plus the source line that produced each.
 */
export function controlContradictoryPersistedSeal() {
  const qualification = readEvidence('research-evidence/r3-l0c-iar-lcfs/qualification.json');
  const sealBinding = qualification?.crossArtifactSeal?.CROSS_ARTIFACT_PLAN_BINDING ?? null;
  const sealSealed = qualification?.crossArtifactSeal?.sealed ?? null;
  const verdictBinding = qualification?.verdicts?.CROSS_ARTIFACT_PLAN_BINDING ?? null;
  const readinessSealed = qualification?.readiness?.CROSS_ARTIFACT_EVIDENCE_SEALED ?? null;
  const contradiction = sealBinding === 'MISMATCH' && verdictBinding === 'MATCH' && readinessSealed === true;

  return Object.freeze({
    id: 'B3_CONTRADICTORY_PERSISTED_SEAL',
    requirement: 'H3',
    authorityBearingFunction: 'scripts/r3l0ciarlcfs/qualification.mjs runQualification (the seal at :260 and the verdict at :268)',
    durableEvidence: 'the COMMITTED research-evidence/r3-l0c-iar-lcfs/qualification.json, read from disk rather than reconstructed in memory',
    observed: Object.freeze({
      crossArtifactSealBinding: sealBinding,
      crossArtifactSealSealed: sealSealed,
      verdictCrossArtifactPlanBinding: verdictBinding,
      readinessCrossArtifactEvidenceSealed: readinessSealed,
      sealWasComputedWithNullInputs: qualification?.crossArtifactSeal?.qualificationPlanReference === null
        && qualification?.crossArtifactSeal?.stageResultPlanReference === null,
    }),
    calculationOrder: Object.freeze([
      'scripts/r3l0ciarlcfs/qualification.mjs:260 calls sealCrossArtifactPlanIdentity with `qualification: null` and `stageResult: null`, because the files do not exist yet at that point',
      'scripts/r3l0ciarlcfs/committed-plan.mjs:264-268 therefore records QUALIFICATION_PLAN_REFERENCE, STAGE_RESULT_PLAN_REFERENCE and PLAN_ID_AGREEMENT as MISMATCH, and :287 sets CROSS_ARTIFACT_PLAN_BINDING = MISMATCH',
      'scripts/r3l0ciarlcfs/qualification.mjs:268 derives verdicts.CROSS_ARTIFACT_PLAN_BINDING from `planControl.PASS`, which is the SEPARATE production control that seals in-memory objects built from the plan\'s own identity',
      'scripts/r3l0ciarlcfs/qualification.mjs:294 derives readiness.CROSS_ARTIFACT_EVIDENCE_SEALED from those same verdicts, not from the persisted seal',
      'the two sources are never compared, so one committed artifact carries a MISMATCH and a MATCH for the same property',
    ]),
    defectPresent: contradiction === true,
    defectDetail: contradiction
      ? 'the committed Qualification records crossArtifactSeal.CROSS_ARTIFACT_PLAN_BINDING = MISMATCH with sealed = false while verdicts.CROSS_ARTIFACT_PLAN_BINDING = MATCH and readiness.CROSS_ARTIFACT_EVIDENCE_SEALED = true'
      : 'the contradiction was not found in the committed evidence, so this defect was NOT reproduced and the corrective work must be narrowed',
    correctionMustLiveIn: 'scripts/r3l0ciarlcfsh/evidence-seal.mjs sealPersistedEvidence',
  });
}

/**
 * §2 B4 — THE TRIAL-IDENTITY EVIDENCE LEVEL.
 *
 * §2 requires the control to determine WHICH call the existing negative controls use — `reconcileTrialIdentity()`
 * directly, `reconcileTrialEvidence()` with a real journal, or the actual `runFailStopMatrix()` through its
 * terminal callback — and to record the precise evidence level currently demonstrated. So this inspects the
 * committed sources rather than asserting a level.
 */
export function controlIdentityEvidenceLevel() {
  const read = (relative) => { try { return readFileSync(join(REPO_ROOT, relative), 'utf8'); } catch { return ''; } };
  const acceptance = read('scripts/r3l0ciarlcfs/acceptance.mjs');
  const pipeline = read('scripts/r3l0ciarlcfs/pipeline.mjs');
  const controlsTest = read('test/r3l0ciarlcfs_controls.test.ts');
  const gatesTest = read('test/r3l0ciarlcfs_gates.test.ts');
  const runnerTest = read('test/r3l0cf_fail_stop.test.ts');

  const usesDirectHelper = /reconcileTrialIdentity\(/u.test(acceptance);
  const usesExtendedAdapter = /reconcileTrialEvidence\(/u.test(acceptance);
  const stagePipelineCallsRunner = /runFailStopMatrix/u.test(pipeline);
  const stageTestsDriveRunner = /runFailStopMatrix/u.test(controlsTest) || /runFailStopMatrix/u.test(gatesTest);

  return Object.freeze({
    id: 'B4_IDENTITY_EVIDENCE_LEVEL',
    requirement: 'H4',
    authorityBearingFunction: 'scripts/r3l0ciarlcfs/acceptance.mjs controlTrialEvidenceIdentity',
    durableEvidence: 'the COMMITTED stage sources and tests, read from disk',
    observed: Object.freeze({
      directHelperUsed: usesDirectHelper,
      extendedAdapterUsed: usesExtendedAdapter,
      stagePipelineImportsTheRunner: stagePipelineCallsRunner,
      stageTestsDriveTheRunner: stageTestsDriveRunner,
      frozenRunnerIsExercisedByItsOwnStage: /runFailStopMatrix/u.test(runnerTest),
    }),
    evidenceLevelDemonstrated: Object.freeze({
      T1_primitive: usesDirectHelper,
      T2_integration: usesExtendedAdapter,
      T3_authoritative: stageTestsDriveRunner,
    }),
    highestLevelDemonstrated: stageTestsDriveRunner ? 'T3' : (usesExtendedAdapter ? 'T2' : 'T1'),
    defectPresent: stageTestsDriveRunner !== true,
    defectDetail: stageTestsDriveRunner === true
      ? 'the stage already drives the frozen Runner, so no new Runner-level control is required'
      : 'the committed stage exercises `reconcileTrialIdentity()` directly (T1) and `reconcileTrialEvidence()` over a real journal (T2), but no test drives `runFailStopMatrix()` with a mutated identity, so no full Trial Evidence identity conflict is demonstrated to affect the actual frozen Runner\'s terminal decision',
    correctionMustLiveIn: 'scripts/r3l0ciarlcfsh/pipeline.mjs (the identity mutation seam) driven through scripts/r3l0cf/fail-stop.mjs runFailStopMatrix',
  });
}

/**
 * §2 B5 — THE UNCONDITIONAL DETERMINISTIC QUALIFICATION.
 *
 * §2 requires the control to determine whether the assignment depends on the relevant measured terminal and
 * evidence-seal conditions or is assigned a literal PASS. So this reads the committed source and the committed
 * evidence, and reports both.
 */
export function controlUnconditionalQualification() {
  const qualificationSource = (() => { try { return readFileSync(join(REPO_ROOT, 'scripts/r3l0ciarlcfs/qualification.mjs'), 'utf8'); } catch { return ''; } })();
  const qualification = readEvidence('research-evidence/r3-l0c-iar-lcfs/qualification.json');
  const assignment = /DETERMINISTIC_MEASUREMENT_QUALIFICATION:\s*'PASS'/u.test(qualificationSource);
  const committedVerdict = qualification?.verdicts?.DETERMINISTIC_MEASUREMENT_QUALIFICATION ?? null;
  const committedSeal = qualification?.crossArtifactSeal?.sealed ?? null;

  return Object.freeze({
    id: 'B5_UNCONDITIONAL_QUALIFICATION_PASS',
    requirement: 'H5',
    authorityBearingFunction: 'scripts/r3l0ciarlcfs/qualification.mjs runQualification (the verdict at :280)',
    durableEvidence: 'the COMMITTED scripts/r3l0ciarlcfs/qualification.mjs and research-evidence/r3-l0c-iar-lcfs/qualification.json',
    observed: Object.freeze({
      literalPassAssignmentInSource: assignment,
      committedVerdict,
      committedCrossArtifactSealSealed: committedSeal,
      verdictCoexistsWithAFailedSeal: committedVerdict === 'PASS' && committedSeal === false,
    }),
    defectPresent: assignment === true && committedVerdict === 'PASS' && committedSeal === false,
    defectDetail: assignment === true
      ? 'the deterministic-qualification verdict is a literal `\'PASS\'`, and the committed artifact records it as PASS in the same file that carries crossArtifactSeal.sealed = false'
      : 'the verdict is not a literal in the committed source, so this defect was NOT reproduced and the corrective work must be narrowed',
    correctionMustLiveIn: 'scripts/r3l0ciarlcfsh/qualification.mjs reduceDeterministicQualification',
  });
}

/** §2: run every baseline control and report, per defect, whether it was reproduced. */
export async function runBaselineControls() {
  const a = await controlValidatorNotConsumed();
  const b = await controlCleanupDefects();
  const c = controlContradictoryPersistedSeal();
  const d = controlIdentityEvidenceLevel();
  const e = controlUnconditionalQualification();
  const controls = Object.freeze([a, b, c, d, e]);
  const reproduced = controls.filter((control) => control.defectPresent === true);
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C-F-S-H',
    kind: 'measured baseline defects against the R3-L0C-I-A-R-L-C-F-S baseline',
    baseline: BASELINE_SOURCE.revision,
    source: BASELINE_SOURCE,
    controls,
    declared: 5,
    reproduced: reproduced.length,
    ALL_DEFECTS_REPRODUCED: reproduced.length === controls.length,
    reproducedIds: Object.freeze(reproduced.map((control) => control.id)),
    notReproduced: Object.freeze(controls.filter((control) => control.defectPresent !== true).map((control) => control.id)),
    modelCallsMade: 0,
    law: 'each control CALLS the committed 80823c4 function and reports its actual return value; a defect that cannot be reproduced is reported as not reproduced rather than marked confirmed by assertion',
  });
}

export { NL };
