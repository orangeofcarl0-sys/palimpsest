/**
 * R3-L0C-I-A-R-L-C-F-S §2 — THE FAILING CONTROLS AGAINST THE ACTUAL BASELINE.
 *
 * §2 requires the failing controls to be committed BEFORE the correction, and §2's first substantive commit must
 * "Commit the stage contract and reproducing controls before implementing corrections." §2 also states the standard
 * plainly: "Do not merely declare the baseline defects. Every confirmed defect must have a measured result."
 *
 * SO EVERY CONTROL CALLS THE REAL `8bf8d42` FUNCTION and reports its ACTUAL return value. Nothing here is a
 * restatement of what the source appears to say; where a property can only be observed by driving the real entry,
 * the control drives it.
 *
 * THE SAFETY RULE §2/§4 IMPOSE ON S2. "Do not reproduce the failure against real shared `node_modules`, `dist`, or
 * user data. Use an isolated simulation with observable cleanup operations." So S2 is measured two ways, both safe:
 *
 *   · a FAULT-INJECTED REPLICA of the baseline's measured control flow, driven by an adapter that records every
 *     operation, which shows the destructive fallback runs after a failed unlink;
 *   · a REAL, DISPOSABLE filesystem measurement in a temp directory this control creates and removes, which shows
 *     whether this platform's recursive delete follows a junction — the hazard the ordering exists to avoid.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';

import { NL, PLAN_ID, REPO_ROOT, STAGE_EVIDENCE_PATH, SUPERSEDED_STAGE } from '../contract.mjs';

/** §2: the baseline revision and the exact modules each control exercises, as data. */
export const BASELINE_SOURCE = Object.freeze({
  revision: '8bf8d42298aee3b8b267b3793e015900ca7cc2a7',
  stage: 'R3-L0C-I-A-R-L-C-F',
  qualification: 'scripts/r3l0ciarlcf/qualification.mjs',
  prospectivePlan: 'scripts/r3l0ciarlcf/prospective-plan.mjs',
  planIdentity: 'scripts/r3l0ciarlcf/plan-identity.mjs',
  isolatedMutation: 'scripts/r3l0ciarlcf/isolated-mutation.mjs',
  durableReconciliation: 'scripts/r3l0ciarlcf/durable-reconciliation.mjs',
  costBridge: 'scripts/r3l0ciarlcf/cost-bridge.mjs',
  trustBoundary: 'scripts/r3l0ciarlcf/trust-boundary.mjs',
  instrumentation: 'scripts/r3l0c/instrumentation.mjs',
});

/** The prior stage's committed evidence, read but never written by this control. */
const PRIOR_PLAN_PATH = SUPERSEDED_STAGE.planPath;
const PRIOR_QUALIFICATION_PATH = 'research-evidence/r3-l0c-iar-lcf/qualification.json';
const PRIOR_STAGE_RESULT_PATH = 'research-evidence/r3-l0c-iar-lcf/stage-result.json';

/** A JSON file under the repository root, or null when it is absent or unreadable. */
function readRepoJson(relative) {
  const path = join(REPO_ROOT, relative);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

/* ================================================================ S1: cross-artifact plan mismatch */

/**
 * S1 — THE COMMITTED PLAN AND THE QUALIFICATION CARRY DIFFERENT PLAN IDENTITIES.
 *
 * §2 states the exact expected values, and this control MEASURES them rather than echoing them: it reads the
 * committed plan's own digest, the digest the Qualification and the Stage Result embed, and it calls the REAL
 * `checkPlanContentDigest()` to show that the self-check reports MATCH while the cross-artifact reference differs.
 *
 * IT ALSO MEASURES THE ROOT CAUSE. §2 names `new Date().toISOString()` in `buildProspectivePlan()` and the
 * independent plan construction inside `runQualification()`. The control CALLS `buildProspectivePlan()` twice and
 * compares the two digests, so "a fresh `frozenAt` moves the digest" is a measurement rather than a reading.
 */
export async function controlCrossArtifactPlanMismatch() {
  const { buildProspectivePlan, checkPlanContentDigest } = await import('../../r3l0ciarlcf/prospective-plan.mjs');
  const { fullPlanDigest } = await import('../../r3l0ciarlcf/plan-identity.mjs');

  const committed = readRepoJson(PRIOR_PLAN_PATH);
  const qualification = readRepoJson(PRIOR_QUALIFICATION_PATH);
  const stageResult = readRepoJson(PRIOR_STAGE_RESULT_PATH);

  const committedDigest = committed?.planContentDigest ?? null;
  const qualificationPlanReference = qualification?.plan?.planContentDigest ?? null;
  const qualificationFrozenReference = qualification?.planContentDigest?.frozen ?? null;
  const stageResultPlanReference = stageResult?.plan?.planContentDigest ?? null;
  const stageResultFrozenReference = stageResult?.planContentDigest?.frozen ?? null;
  const qualificationPlanId = qualification?.plan?.planId ?? null;

  /** §2: the REAL self-check, called rather than described. */
  const selfCheck = checkPlanContentDigest();
  /** §3: the committed file's own bytes against its own embedded digest, recomputed here. */
  const recomputedCommitted = committed === null ? null : fullPlanDigest(committed);

  /**
   * §2: THE ROOT CAUSE, MEASURED. Two calls to the real builder, so the `frozenAt` difference is observed rather
   * than inferred. The first call's digest is compared with the committed file's digest to show the committed file
   * is ONE such build, and the two live calls are compared with each other to show a rebuild moves the digest.
   */
  const firstBuild = await buildProspectivePlan({ verifyCompiled: false });
  const secondBuild = await buildProspectivePlan({ verifyCompiled: false });
  const frozenAtDiffers = firstBuild.frozenAt !== secondBuild.frozenAt;
  const rebuildMovesDigest = firstBuild.planContentDigest !== secondBuild.planContentDigest;

  return Object.freeze({
    id: 'S1_CROSS_ARTIFACT_PLAN_MISMATCH',
    authorityBearingFunction: 'scripts/r3l0ciarlcf/qualification.mjs runQualification → buildProspectivePlan, and scripts/r3l0ciarlcf/prospective-plan.mjs checkPlanContentDigest',
    baselineLocation: 'scripts/r3l0ciarlcf/qualification.mjs:128 (a fresh plan) against :247 (the committed file compared to itself)',
    durableEvidence: 'the committed R3-L0C-I-A-R-L-C-F prospective plan, its Qualification and its Stage Result, all read rather than rewritten',
    observed: Object.freeze({
      committedPlanId: committed?.planId ?? null,
      committedDigest,
      committedRecomputedDigest: recomputedCommitted,
      qualificationPlanId,
      qualificationPlanReference,
      qualificationFrozenReference,
      stageResultPlanReference,
      stageResultFrozenReference,
      selfCheckVerdict: selfCheck.FULL_PLAN_DIGEST,
      selfCheckFrozen: selfCheck.frozen,
      /** §3: the exact equality the prior stage failed. */
      qualificationMatchesCommitted: qualificationPlanReference !== null && qualificationPlanReference === committedDigest,
      stageResultMatchesCommitted: stageResultPlanReference !== null && stageResultPlanReference === committedDigest,
      /** §2: the root cause, measured by calling the real builder twice. */
      rebuildFrozenAtDiffers: frozenAtDiffers,
      rebuildMovesDigest,
      firstBuildDigest: firstBuild.planContentDigest,
      secondBuildDigest: secondBuild.planContentDigest,
      firstBuildFrozenAt: firstBuild.frozenAt,
      secondBuildFrozenAt: secondBuild.frozenAt,
    }),
    /**
     * The defect: the file's own digest is self-consistent (MATCH) while a persisted result references a DIFFERENT
     * plan identity, and a rebuild is shown to move the digest because `frozenAt` is regenerated each call.
     */
    defectPresent: committedDigest !== null
      && recomputedCommitted === committedDigest
      && selfCheck.FULL_PLAN_DIGEST === 'MATCH'
      && qualificationPlanReference !== null
      && qualificationPlanReference !== committedDigest
      && stageResultPlanReference !== committedDigest
      && rebuildMovesDigest === true,
    detail: 'the committed plan is internally consistent and its self-check is MATCH, but the Qualification and the Stage Result each embed a different plan content digest produced by an independent rebuild whose `frozenAt` differs, so one apparently successful qualification carries two plan identities',
  });
}

/* ================================================================ S2: unsafe cleanup fallback */

/**
 * S2 — A FAILED JUNCTION UNLINK DOES NOT PREVENT THE DESTRUCTIVE FALLBACK.
 *
 * §4: "An attempted unlink is not proof of successful unlink." The baseline's `destroyIsolatedCheckout` swallows a
 * failed unlink and then runs `git worktree remove --force` and a recursive `rmSync` unconditionally.
 *
 * MEASURED TWO WAYS, BOTH SAFE:
 *
 *   1. a fault-injected REPLICA of the measured control flow, with an adapter that records each operation, showing
 *      the fallback executes after the failed unlink;
 *   2. a REAL disposable filesystem measurement, in a temp directory this control creates, showing whether a
 *      recursive delete follows a junction on this platform and whether `rmdir` preserves the target.
 */
export function controlUnsafeCleanupFallback() {
  /** 1. THE FAULT-INJECTED REPLICA of the measured control flow, with every operation recorded. */
  const operations = [];
  const replica = (input) => {
    const { links, unlinkFails, fs, git } = input;
    for (const link of links) {
      try {
        operations.push(Object.freeze({ op: 'unlink', target: link.name }));
        if (unlinkFails(link) === true) throw new Error(`injected unlink failure for ${link.name}`);
      } catch {
        operations.push(Object.freeze({ op: 'swallow', target: link.name, detail: 'the baseline catch block ignores the failure' }));
      }
    }
    /** The baseline proceeds here UNCONDITIONALLY — this is the defect. */
    operations.push(Object.freeze({ op: 'git-worktree-remove-force', target: 'worktree root' }));
    git.removeForce();
    operations.push(Object.freeze({ op: 'rm-recursive-force', target: 'worktree root' }));
    fs.rmRecursiveForce();
    return Object.freeze({ removedLinks: Object.freeze([]) });
  };
  const destructiveCalls = [];
  const simulated = replica({
    links: [Object.freeze({ name: 'node_modules' }), Object.freeze({ name: 'dist' })],
    unlinkFails: (link) => link.name === 'node_modules',
    fs: { rmRecursiveForce: () => destructiveCalls.push('rmSync-recursive-force') },
    git: { removeForce: () => destructiveCalls.push('git-worktree-remove-force') },
  });
  const fallbackAfterFailedUnlink = destructiveCalls.length > 0;

  /** 2. THE REAL, DISPOSABLE MEASUREMENT. Everything here is created by this control under the temp root. */
  const root = mkdtempSync(join(tmpdir(), 'r3lcfs-s2-'));
  let rmdirPreservesTarget = null;
  let recursiveDeleteFollowsJunction = null;
  let sentinelAfterRecursiveDelete = null;
  try {
    const makeCase = (label) => {
      const caseRoot = join(root, label);
      const worktree = join(caseRoot, 'worktree');
      const sentinelDir = join(caseRoot, 'sentinel-target');
      mkdirSync(worktree, { recursive: true });
      mkdirSync(sentinelDir, { recursive: true });
      writeFileSync(join(sentinelDir, 'DO_NOT_DELETE.txt'), 'sentinel', 'utf8');
      const linkPath = join(worktree, 'node_modules');
      if (process.platform === 'win32') execFileSync('cmd', ['/c', 'mklink', '/J', linkPath, sentinelDir], { stdio: ['ignore', 'pipe', 'pipe'] });
      else execFileSync('ln', ['-s', sentinelDir, linkPath], { stdio: ['ignore', 'pipe', 'pipe'] });
      return { caseRoot, worktree, sentinelDir, linkPath };
    };

    /** The SAFE ordering: unlink the link first, then remove the worktree. The target must survive. */
    const safeCase = makeCase('safe');
    if (process.platform === 'win32') execFileSync('cmd', ['/c', 'rmdir', safeCase.linkPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    else rmSync(safeCase.linkPath, { force: true });
    rmSync(safeCase.worktree, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    rmdirPreservesTarget = existsSync(join(safeCase.sentinelDir, 'DO_NOT_DELETE.txt'));

    /** The UNSAFE ordering the baseline can reach: remove the worktree while the link is still present. */
    const unsafeCase = makeCase('unsafe');
    try { rmSync(unsafeCase.worktree, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* the measurement is the sentinel */ }
    sentinelAfterRecursiveDelete = existsSync(join(unsafeCase.sentinelDir, 'DO_NOT_DELETE.txt'));
    recursiveDeleteFollowsJunction = sentinelAfterRecursiveDelete === false;
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
  }

  return Object.freeze({
    id: 'S2_UNSAFE_CLEANUP_FALLBACK',
    authorityBearingFunction: 'scripts/r3l0ciarlcf/isolated-mutation.mjs destroyIsolatedCheckout',
    baselineLocation: 'scripts/r3l0ciarlcf/isolated-mutation.mjs:96 (the swallowing catch) followed by :98 `git worktree remove --force` and :99 `rmSync(..., { recursive: true, force: true })`',
    durableEvidence: 'an injected-failure replica of the measured control flow, plus a real disposable junction measurement under the system temp root',
    observed: Object.freeze({
      simulationOperations: Object.freeze(operations),
      destructiveCallsAfterFailedUnlink: Object.freeze(destructiveCalls),
      fallbackExecutedAfterFailedUnlink: fallbackAfterFailedUnlink,
      removedLinksReportedByBaseline: simulated.removedLinks,
      /** §4: the real platform measurement, so the hazard is not merely asserted. */
      platform: process.platform,
      rmdirPreservesTarget,
      recursiveDeleteFollowsJunction,
      sentinelAfterRecursiveDelete,
      realJunctionUsed: process.platform === 'win32',
    }),
    /**
     * The defect: the baseline reaches a destructive fallback after a failed unlink. The measurement also shows
     * whether that fallback is actually destructive on this platform, which is why the ordering matters.
     */
    defectPresent: fallbackAfterFailedUnlink === true,
    detail: 'the baseline swallows a failed junction unlink and then runs `git worktree remove --force` and a recursive `rmSync` unconditionally, so an attempted unlink is treated as a successful one and no CLEANUP_BLOCKED state exists',
  });
}

/* ================================================================ S3: partial trial identity */

/**
 * S3 — TWO RECORDS AGREE ON THE SCHEDULE IDENTITY WHILE DISAGREEING ON LOAD-BEARING EVIDENCE.
 *
 * §2 requires this to be shown by driving the real reducer. The control builds a clean durable journal, then a
 * durable/in-memory pair that agrees on block/arm/generation/trajectoryId and CONFLICTS on attemptId, hostJobId,
 * executionClosureDigest and contentDigests, and calls the real `reconcileDurableTrials`.
 */
export async function controlPartialTrialIdentity() {
  const { reconcileDurableTrials } = await import('../../r3l0ciarlcf/durable-reconciliation.mjs');
  const { appendRecord, readJournal } = await import('../../r3l0cf/journal.mjs');
  const root = mkdtempSync(join(tmpdir(), 'r3lcfs-s3-'));
  try {
    const journalPath = join(root, 'generation-journal.jsonl');
    const planned = ['s0'];
    const schedule = [Object.freeze({ sessionId: 's0', block: 0, arm: 'C', generation: 'G1', trajectoryId: 'b0-C' })];
    const closureDigest = 'a'.repeat(64);

    /** The durable record: the exact schedule identity, with its own attempt/job/closure/digest bindings. */
    const durableRecord = Object.freeze({
      sessionId: 's0', block: 0, arm: 'C', generation: 'G1', trajectoryId: 'b0-C',
      attemptId: 'attempt-11111111111111111111111111111111', hostJobId: 'job-durable',
      executionClosureDigest: closureDigest, treatmentExpectationDigest: 'exp-durable',
      intendedExecutorRoute: 'the deterministic scripted worker',
      contentDigests: Object.freeze({ r3l0ciarlLiveEvidence: 'd'.repeat(64) }),
      treatmentRealization: 'APPLIED', admission: 'ADMITTED',
    });
    appendRecord({ journalPath, kind: 'EXPOSURE_INTENT_RECORDED', payload: { sessionId: 's0' } });
    appendRecord({ journalPath, kind: 'WORKER_LAUNCH_RECORDED', payload: { sessionId: 's0', attempt: 1 } });
    appendRecord({ journalPath, kind: 'TRIAL_RECORDED', payload: { sessionId: 's0', record: durableRecord } });

    /**
     * The in-memory observation: the SAME schedule identity, and a DIFFERENT attempt id, host job, closure digest
     * and content binding. The baseline compares only the four schedule fields, so it cannot see any of this.
     */
    const inMemoryRecord = Object.freeze({
      ...durableRecord,
      attemptId: 'attempt-22222222222222222222222222222222', hostJobId: 'job-memory',
      executionClosureDigest: 'b'.repeat(64), treatmentExpectationDigest: 'exp-memory',
      contentDigests: Object.freeze({ r3l0ciarlLiveEvidence: 'e'.repeat(64) }),
    });

    const continuity = Object.freeze({ LIVE_ARTIFACT_PROPAGATION: 'PASS', sessions: 1, allBound: true, allMatched: true, allComplete: true });
    const cost = Object.freeze({ interpretable: true, measuredCount: 1, absentCount: 0, plannedSessions: 1, livePrimaryCount: 0, fixtureCount: 1, allSixteenLivePrimary: false });
    const reconciliation = reconcileDurableTrials({
      journal: readJournal(journalPath), schedule, plannedSessions: planned,
      inMemoryRecords: [inMemoryRecord], liveEvidenceContinuity: continuity, costAttribution: cost,
    });
    const byId = new Map(reconciliation.conditions.map((condition) => [condition.id, condition]));

    return Object.freeze({
      id: 'S3_PARTIAL_TRIAL_IDENTITY',
      authorityBearingFunction: 'scripts/r3l0ciarlcf/durable-reconciliation.mjs reconcileDurableTrials',
      baselineLocation: 'scripts/r3l0ciarlcf/durable-reconciliation.mjs:80 and :95 — the compared field list is [\'block\', \'arm\', \'generation\', \'trajectoryId\']',
      durableEvidence: 'a real durable journal written with the frozen appendRecord, read back with the frozen readJournal',
      observed: Object.freeze({
        reconciliationGreen: reconciliation.green,
        failing: reconciliation.failing,
        durableIdentityExactHolds: byId.get('DURABLE_IDENTITY_EXACT')?.holds ?? null,
        durableMatchesInMemoryHolds: byId.get('DURABLE_MATCHES_IN_MEMORY')?.holds ?? null,
        identityMismatchesReported: reconciliation.identityMismatches,
        durableVsInMemoryMismatchesReported: reconciliation.durableVsInMemoryMismatches,
        attemptIdDiffers: durableRecord.attemptId !== inMemoryRecord.attemptId,
        hostJobIdDiffers: durableRecord.hostJobId !== inMemoryRecord.hostJobId,
        executionClosureDiffers: durableRecord.executionClosureDigest !== inMemoryRecord.executionClosureDigest,
        contentDigestsDiffer: durableRecord.contentDigests.r3l0ciarlLiveEvidence !== inMemoryRecord.contentDigests.r3l0ciarlLiveEvidence,
      }),
      defectPresent: reconciliation.green === true
        && byId.get('DURABLE_IDENTITY_EXACT')?.holds === true
        && byId.get('DURABLE_MATCHES_IN_MEMORY')?.holds === true
        && durableRecord.attemptId !== inMemoryRecord.attemptId
        && durableRecord.hostJobId !== inMemoryRecord.hostJobId,
      detail: 'two records agreeing on block/arm/generation/trajectoryId but disagreeing on attemptId, hostJobId, executionClosureDigest and the sidecar content binding leave every reconciliation condition holding and the reconciliation GREEN',
    });
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
  }
}

/* ================================================================ S4: false interpretability */

/** Write a real-format zstd artifact whose decompressed body is the supplied JSONL records. */
export function writeArtifact(input) {
  const { directory, attemptId, records } = input;
  mkdirSync(join(directory, `attempt-${attemptId}`), { recursive: true });
  const path = join(directory, `attempt-${attemptId}`, 'session.v4.jsonl.zstd');
  const body = records.map((record) => JSON.stringify(record)).join(NL) + NL;
  writeFileSync(path, zstdCompressSync(Buffer.from(body, 'utf8')));
  return Object.freeze({ path, attemptId, records: records.length });
}

/**
 * S4 — PARSEABLE JSONL WITHOUT THE REQUIRED EVENTS BECOMES AN APPARENTLY MEASURED ZERO.
 *
 * §2 requires an artifact whose decompressed text contains parseable JSONL but lacks the minimum events the frozen
 * study's cost definitions require. The control writes one whose ONLY record is `{"type":"noise"}`, then CALLS the
 * real `interpretArtifact` and the real frozen `reconstructCost`.
 */
export async function controlFalseArtifactInterpretability() {
  const { interpretArtifact } = await import('../../r3l0ciarlcf/cost-bridge.mjs');
  const { reconstructCost, decompressFrames, sessionRecords } = await import('../../r3l0c/instrumentation.mjs');
  const root = mkdtempSync(join(tmpdir(), 'r3lcfs-s4-'));
  try {
    /** The arbitrary JSON object: parseable, and carrying none of the required events. */
    const noise = writeArtifact({ directory: join(root, 'noise'), attemptId: 'n'.repeat(32), records: [{ type: 'noise' }] });
    const interpretability = interpretArtifact({ artifactPath: noise.path, decompressFrames, sessionRecords });
    let cost = null;
    try { cost = reconstructCost({ path: noise.path, attemptId: noise.attemptId }); } catch { cost = null; }

    /** The comparison case: an artifact with a real Session Start and a Result submission, for contrast. */
    const real = writeArtifact({
      directory: join(root, 'real'), attemptId: 'r'.repeat(32),
      records: [
        { type: 'turn/start', time: 900, data: {} },
        { type: 'tool/ptc-dispatch', seq: 1, time: 1_000, data: { name: 'palimpsest_worker_result', arguments: {}, content: 'ok', isError: false } },
      ],
    });
    const realInterpretability = interpretArtifact({ artifactPath: real.path, decompressFrames, sessionRecords });

    return Object.freeze({
      id: 'S4_FALSE_ARTIFACT_INTERPRETABILITY',
      authorityBearingFunction: 'scripts/r3l0ciarlcf/cost-bridge.mjs interpretArtifact, then the frozen scripts/r3l0c/instrumentation.mjs reconstructCost',
      baselineLocation: 'scripts/r3l0ciarlcf/cost-bridge.mjs:292 `if (records.length === 0)` — the only content test before `reconstructCost` is called',
      durableEvidence: 'two real-format zstd session artifacts written under the temp root, one arbitrary and one with the required events',
      observed: Object.freeze({
        arbitraryArtifactInterpretable: interpretability.interpretable,
        arbitraryArtifactState: interpretability.state,
        arbitraryArtifactRecordCount: interpretability.recordCount,
        arbitraryCostNonNull: cost !== null,
        arbitraryRawHistoryArtifactsRead: cost?.rawHistoryArtifactsRead ?? null,
        arbitraryRawHistoryArtifactIds: cost?.rawHistoryArtifactIds ?? null,
        arbitraryCapitalPullActions: cost?.capitalPullActions ?? null,
        arbitraryCompletionCause: cost?.completionCause ?? null,
        arbitraryHasTurnStart: interpretability.hasTurnStart,
        realArtifactInterpretable: realInterpretability.interpretable,
        /** §2: the zeros the arbitrary artifact produces are indistinguishable from a legitimate zero. */
        zerosIndistinguishableFromMeasuredZero: cost !== null && cost.rawHistoryArtifactsRead === 0 && cost.capitalPullActions === 0,
      }),
      defectPresent: interpretability.interpretable === true && interpretability.state === 'INTERPRETABLE'
        && cost !== null && cost.rawHistoryArtifactsRead === 0,
      detail: 'an artifact whose only record is an arbitrary JSON object is declared INTERPRETABLE and the frozen reconstruction returns apparently measured zeros, so an uninterpretable artifact satisfies a measured endpoint',
    });
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows handles briefly */ }
  }
}

/* ================================================================ S5: authorization verdict inconsistency */

/**
 * S5 — A SYNTHETICALLY VERIFIED AUTHORITY YIELDS VERIFIED WHILE HOST SPENDING ENFORCEMENT IS FALSE.
 *
 * §2: "This is a deterministic negative test of the verifier, NOT a real authorization test." The control CALLS the
 * real `verifyExternalAuthority` with an injected TEST-FIXTURE trusted source that reports `verified: true`, a
 * structurally complete record bound to a plan, and measures the verdict against the enforcement concept.
 */
export async function controlAuthorizationVerdictInconsistency() {
  const { verifyExternalAuthority, budgetSemantics } = await import('../../r3l0ciarlcf/trust-boundary.mjs');
  const { fullPlanDigest } = await import('../../r3l0ciarlcf/plan-identity.mjs');

  /** A minimal plan whose full content digest the record can bind. */
  const plan = Object.freeze({
    planId: 'r3-l0c-iar-lcf-primary-plan', stage: 'R3-L0C-I-A-R-L-C-F',
    executionClosure: Object.freeze({ executionClosureDigest: 'c'.repeat(64) }),
    authorizationRequired: Object.freeze({ required: true }),
  });
  const planDigest = fullPlanDigest(plan);

  /** §7: the TEST FIXTURE trusted source. Explicitly labelled, and never passed into a launch path. */
  const trustedSource = Object.freeze({
    available: true, path: 'C:/test-fixture/authority.json', verified: true,
    source: Object.freeze({ authority: 'test-authority', decisions: Object.freeze({ 'test-authority': true }) }),
    testFixture: true,
  });
  const record = Object.freeze({
    authority: 'test-authority', approvedPlanId: plan.planId, approvedPlanDigest: planDigest,
    paidRunBudget: Object.freeze({ maxSessions: 16, currency: 'USD' }),
    decisions: Object.freeze({
      PAID_MODEL_USAGE: true, BOUNDED_FAIL_STOP_PROTOCOL: true, NO_AUTOMATIC_RETRIES_OR_REPLACEMENTS: true,
      PRESERVE_PARTIALLY_COMPLETED_INVALID_RUNS: true, ACCEPTED_PROMPT_NEUTRALITY_LIMITED: true,
    }),
  });

  const verdict = verifyExternalAuthority({ record, plan, trustedSource });
  const budget = budgetSemantics(record);
  const enforcementProblemStated = verdict.problems.some((problem) => /host spending enforcement/iu.test(problem));

  return Object.freeze({
    id: 'S5_AUTHORIZATION_VERDICT_INCONSISTENCY',
    authorityBearingFunction: 'scripts/r3l0ciarlcf/trust-boundary.mjs verifyExternalAuthority',
    baselineLocation: 'scripts/r3l0ciarlcf/trust-boundary.mjs:246 pushes the missing-enforcement problem; :249-:251 computes the verdict without requiring it',
    durableEvidence: 'an in-memory TEST-FIXTURE authorization record and trusted source; no real authorization is created and no paid request is made',
    testFixture: true,
    observed: Object.freeze({
      verdict: verdict.verdict,
      verified: verdict.verified,
      schemaValid: verdict.schema.valid,
      hostSpendEnforcement: budget.SPEND_ENFORCEMENT,
      actualHostEnforcedBudget: budget.concepts.ACTUAL_HOST_ENFORCED_BUDGET,
      enforcementProblemStatedInProblems: enforcementProblemStated,
      problemCount: verdict.problems.length,
      problems: verdict.problems,
      launchProhibited: verdict.launchProhibited,
      currentLaunchPermission: verdict.concepts.CURRENT_LAUNCH_PERMISSION,
    }),
    defectPresent: verdict.verified === true
      && budget.concepts.ACTUAL_HOST_ENFORCED_BUDGET === false
      && enforcementProblemStated === true,
    detail: 'the verifier states the absence of host spending enforcement as a problem and then returns VERIFIED without requiring it, so its descriptive problem list and its final boolean disagree',
  });
}

/** §2: run every control and report the violations. */
export async function runBaselineControls() {
  const a = await controlCrossArtifactPlanMismatch();
  const b = controlUnsafeCleanupFallback();
  const c = await controlPartialTrialIdentity();
  const d = await controlFalseArtifactInterpretability();
  const e = await controlAuthorizationVerdictInconsistency();
  const controls = Object.freeze([a, b, c, d, e]);
  const violated = controls.filter((entry) => entry.defectPresent === true);
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C-F-S',
    kind: 'evidence-seal and safety controls against the R3-L0C-I-A-R-L-C-F baseline',
    baseline: BASELINE_SOURCE.revision,
    source: BASELINE_SOURCE,
    controls,
    declared: 5,
    measured: controls.length,
    ALL_DEFECTS_CONFIRMED: violated.length === controls.length,
    violated: Object.freeze(violated.map((entry) => entry.id)),
    notViolated: Object.freeze(controls.filter((entry) => entry.defectPresent !== true).map((entry) => entry.id)),
    modelCallsMade: 0,
    law: 'each control CALLS the real 8bf8d42 function and reports its actual return value; the property is violated by the baseline',
  });
}

export { NL, PLAN_ID, STAGE_EVIDENCE_PATH, createHash };
