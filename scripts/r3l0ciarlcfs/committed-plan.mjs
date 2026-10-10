/**
 * R3-L0C-I-A-R-L-C-F-S §3 Gate S1 — THE IMMUTABLE COMMITTED-PLAN IDENTITY.
 *
 * THE DEFECT THIS CLOSES, measured by `baseline/legacy-controls.mjs controlCrossArtifactPlanMismatch` against the
 * real `8bf8d42` code: `runQualification` called `buildProspectivePlan()` — which regenerates `frozenAt` on every
 * call — so the Qualification embedded a plan content digest that did NOT equal the committed plan's, while
 * `checkPlanContentDigest()` separately re-read the committed file and compared it to ITSELF and reported MATCH.
 * One apparently successful qualification therefore carried two distinct plan identities.
 *
 * THE THREE OPERATIONS §3 REQUIRES, SEPARATED:
 *
 *   PLAN CONSTRUCTION  `constructCandidatePlan()` — may produce a CANDIDATE before freeze. It is NOT the final
 *                      evidence source, and it says so on its result.
 *   PLAN FREEZE        `freezeCommittedPlan()` — writes the exact finalized plan ONCE, after every load-bearing
 *                      module is stable, with `frozenAt` fixed at that instant.
 *   PLAN CONSUMPTION   `readAndVerifyCommittedPlan()` — reads and validates the ALREADY COMMITTED plan WITHOUT
 *                      regeneration. This is the operation the final Qualification must use.
 *
 * WHAT `readAndVerifyCommittedPlan` CHECKS, EACH A SEPARATE FACT rather than one collapsed boolean:
 *
 *   1. the file's recomputed FULL content digest equals the digest the file carries  (`COMMITTED_PLAN_SELF_DIGEST`)
 *   2. the worktree file's bytes equal the committed Git blob, by blob-hash equality (`COMMITTED_PLAN_GIT_IDENTITY`)
 *   3. the plan's schema and its expected stage Plan ID are correct
 *   4. the current execution closure matches the closure the plan binds
 *
 * WHY THE GIT-BLOB CHECK IS NOT A CRYPTOGRAPHIC SIGNATURE. §3 requires the plan to be verified "against the
 * committed Git object" and explicitly says: "This is a Git-level reproducibility check, not a claim of
 * cryptographic signature or independently trusted external authorization." So the result records that limitation.
 *
 * WHY THE BLOB COMPARISON USES `git hash-object` AND `git rev-parse`. `git show HEAD:<path>` applies the host's
 * line-ending conversion on output, so reading its bytes and hashing them is not a byte-exact comparison — measured
 * in the prior stage. `git rev-parse HEAD:<path>` on the commit and `git hash-object -- <path>` on the worktree file
 * both return a Git blob hash over the RAW bytes, so their equality is exact.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { NL, PLAN_ID, REPO_ROOT, STAGE_EVIDENCE_PATH } from './contract.mjs';

/** §3: the committed plan's path inside this stage's evidence namespace. */
export function committedPlanPath() {
  return join(REPO_ROOT, STAGE_EVIDENCE_PATH, 'execution-plan.json');
}

/** §3: the FULL plan content digest, imported from the reused prior-stage module rather than restated. */
async function fullDigestOf(plan) {
  const { fullPlanDigest } = await import('../r3l0ciarlcf/plan-identity.mjs');
  return fullPlanDigest(plan);
}

/** §3: run a git command in a directory and return its trimmed stdout, or null. */
function git(cwd, args) {
  try { return execFileSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch { return null; }
}

/** §3: the Git blob hash of a path at HEAD, or null when the path is not committed. */
export function committedBlobHash(relative) {
  return git(REPO_ROOT, ['rev-parse', `HEAD:${relative}`]);
}

/** §3: the Git blob hash of a worktree file's RAW bytes, or null. */
export function worktreeBlobHash(relative) {
  return git(REPO_ROOT, ['hash-object', '--', relative]);
}

/**
 * §3: READ AND VERIFY THE COMMITTED PLAN, WITHOUT REGENERATING IT.
 *
 * This is the operation the final Qualification uses. It NEVER constructs a plan, so it cannot produce a digest
 * that differs from the committed file's. Every check is returned separately, and the returned `plan` object is the
 * PARSED COMMITTED BYTES rather than a rebuilt equivalent.
 */
export async function readAndVerifyCommittedPlan(input = {}) {
  const relative = input.relative ?? `${STAGE_EVIDENCE_PATH}/execution-plan.json`;
  const path = input.planPath ?? join(REPO_ROOT, relative);
  const expectedPlanId = input.expectedPlanId ?? PLAN_ID;
  const expectedClosureDigest = input.expectedClosureDigest ?? null;

  if (!existsSync(path)) {
    return Object.freeze({
      PLAN_SOURCE: 'COMMITTED_FILE', planPath: path, exists: false, plan: null, verified: false,
      checks: Object.freeze({ COMMITTED_PLAN_SELF_DIGEST: 'NOT_ESTABLISHED', COMMITTED_PLAN_GIT_IDENTITY: 'NOT_ESTABLISHED', PLAN_SCHEMA_AND_ID: 'NOT_ESTABLISHED', PLAN_CLOSURE_BINDING: 'NOT_ESTABLISHED' }),
      problems: Object.freeze([`the committed prospective plan is absent at ${path}, so no session may start`]),
      regenerated: false,
      reason: 'no committed plan exists',
    });
  }

  let plan = null;
  let parseError = null;
  try { plan = JSON.parse(readFileSync(path, 'utf8')); } catch (error) { parseError = String(error?.message ?? error).slice(0, 200); }
  if (plan === null) {
    return Object.freeze({
      PLAN_SOURCE: 'COMMITTED_FILE', planPath: path, exists: true, plan: null, verified: false,
      checks: Object.freeze({ COMMITTED_PLAN_SELF_DIGEST: 'NOT_ESTABLISHED', COMMITTED_PLAN_GIT_IDENTITY: 'NOT_ESTABLISHED', PLAN_SCHEMA_AND_ID: 'FAIL', PLAN_CLOSURE_BINDING: 'NOT_ESTABLISHED' }),
      problems: Object.freeze([`the committed prospective plan does not parse: ${String(parseError)}`]),
      regenerated: false,
      reason: 'the committed plan does not parse',
    });
  }

  const problems = [];

  /** 1. THE SELF-DIGEST: the recomputed full content digest against the digest the file carries. */
  const recomputed = await fullDigestOf(plan);
  const stored = plan.planContentDigest ?? null;
  const selfDigestMatches = typeof stored === 'string' && stored !== '' && recomputed === stored;
  if (!selfDigestMatches) problems.push(`the committed plan's recomputed full content digest ${String(recomputed).slice(0, 16)} does not equal the digest it carries ${String(stored).slice(0, 16)}`);

  /** 2. THE GIT IDENTITY: the worktree bytes against the committed blob, by blob-hash equality. */
  const committedBlob = committedBlobHash(relative);
  const worktreeBlob = worktreeBlobHash(relative);
  const gitIdentityMatches = committedBlob !== null && worktreeBlob !== null && committedBlob === worktreeBlob;
  if (!gitIdentityMatches) problems.push(`the worktree plan's blob ${String(worktreeBlob).slice(0, 16)} does not equal the committed blob ${String(committedBlob).slice(0, 16)}`);

  /** 3. THE SCHEMA AND THE EXPECTED PLAN ID. */
  const schemaProblems = [];
  if (typeof plan.planId !== 'string' || plan.planId === '') schemaProblems.push('the plan carries no planId');
  if (plan.planId !== expectedPlanId) schemaProblems.push(`the plan id is "${String(plan.planId)}" but "${String(expectedPlanId)}" was required`);
  if (!Array.isArray(plan.schedule) || plan.schedule.length === 0) schemaProblems.push('the plan carries no schedule');
  if (typeof plan.executionClosure?.executionClosureDigest !== 'string') schemaProblems.push('the plan binds no execution-closure digest');
  if (plan.executionRoute === null || typeof plan.executionRoute !== 'object') schemaProblems.push('the plan declares no execution route');
  if (typeof plan.authorizationRequired?.required !== 'boolean') schemaProblems.push('the plan does not state whether authorization is required');
  const schemaValid = schemaProblems.length === 0;
  for (const problem of schemaProblems) problems.push(problem);

  /** 4. THE CLOSURE BINDING: the plan's bound closure against the CURRENT recomputed closure. */
  const boundClosureDigest = plan.executionClosure?.executionClosureDigest ?? null;
  let closureDigest = expectedClosureDigest;
  let closureRecomputedHere = false;
  if (closureDigest === null) {
    const { computeExecutionClosure } = await import('./closure.mjs');
    const closure = await computeExecutionClosure({ verifyCompiled: input.verifyCompiled });
    closureDigest = closure.executionClosureDigest;
    closureRecomputedHere = true;
  }
  const closureMatches = typeof boundClosureDigest === 'string' && boundClosureDigest !== '' && boundClosureDigest === closureDigest;
  if (!closureMatches) problems.push(`the plan binds closure ${String(boundClosureDigest).slice(0, 16)} and the current runtime computes ${String(closureDigest).slice(0, 16)}`);

  const checks = Object.freeze({
    COMMITTED_PLAN_SELF_DIGEST: selfDigestMatches ? 'MATCH' : 'DRIFTED',
    COMMITTED_PLAN_GIT_IDENTITY: gitIdentityMatches ? 'MATCH' : 'DRIFTED',
    PLAN_SCHEMA_AND_ID: schemaValid ? 'PASS' : 'FAIL',
    PLAN_CLOSURE_BINDING: closureMatches ? 'MATCH' : 'DRIFTED',
  });

  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C-F-S',
    kind: 'committed prospective plan verification',
    PLAN_SOURCE: 'COMMITTED_FILE',
    planPath: path,
    relative,
    exists: true,
    /** §3: the PARSED COMMITTED BYTES, never a rebuilt equivalent. */
    plan: Object.freeze(plan),
    planId: plan.planId,
    planContentDigest: stored,
    recomputedPlanContentDigest: recomputed,
    committedBlob,
    worktreeBlob,
    boundClosureDigest,
    currentClosureDigest: closureDigest,
    closureRecomputedHere,
    scheduleLength: Array.isArray(plan.schedule) ? plan.schedule.length : 0,
    checks,
    problems: Object.freeze(problems),
    verified: problems.length === 0,
    /** §3: the honesty flags. */
    regenerated: false,
    constructedHere: false,
    selfCheckIsNotCrossArtifactSeal: true,
    gitLevelReproducibilityOnly: true,
    claimsCryptographicSignature: false,
    claimsTrustedExternalAuthority: false,
    onFailure: 'STOP — no session may be launched against a plan that does not verify, and no evidence may reference an unverified plan',
    law: 'the committed plan is read and validated WITHOUT regeneration; its self-digest, its committed Git blob identity, its schema and id, and its closure binding are four separate facts',
  });
}

/**
 * §3: CONSTRUCT A CANDIDATE PLAN.
 *
 * It exists for pre-freeze development and for tests OUTSIDE the final evidence path. It is NOT the authoritative
 * final evidence source, and it says so — a caller that uses it as evidence has to ignore an explicit flag.
 */
export async function constructCandidatePlan(input = {}) {
  const { buildProspectivePlan } = await import('./prospective-plan.mjs');
  const plan = await buildProspectivePlan(input);
  return Object.freeze({
    plan,
    CANDIDATE_ONLY: true,
    isAuthoritativeEvidence: false,
    regeneratesFrozenAt: true,
    forbiddenAsFinalEvidence: 'a candidate plan carries a fresh frozenAt, so it must never be the plan a Qualification or a Stage Result references',
  });
}

/**
 * §3: FREEZE THE PLAN ONCE.
 *
 * It writes the exact finalized plan to the stage-owned path and returns the digest it wrote. `frozenAt` is fixed
 * at this instant and is never regenerated for this plan identity. A caller must have stabilized every load-bearing
 * module BEFORE calling this, because §9 forbids silently regenerating the same frozen Plan ID after a post-freeze
 * source fix.
 */
export async function freezeCommittedPlan(input = {}) {
  const { buildProspectivePlan } = await import('./prospective-plan.mjs');
  const plan = await buildProspectivePlan(input);
  const directory = join(REPO_ROOT, STAGE_EVIDENCE_PATH);
  mkdirSync(directory, { recursive: true });
  const path = join(directory, 'execution-plan.json');
  const bytes = `${JSON.stringify(plan, null, 2)}${NL}`;
  writeFileSync(path, bytes, 'utf8');
  const sha256 = createHash('sha256').update(bytes, 'utf8').digest('hex');
  return Object.freeze({
    path,
    plan,
    planId: plan.planId,
    planContentDigest: plan.planContentDigest,
    frozenAt: plan.frozenAt,
    executionClosureDigest: plan.executionClosure?.executionClosureDigest ?? null,
    fileSha256: sha256,
    writtenOnce: true,
    law: 'the plan is frozen once; a post-freeze source fix requires a NEW supersession or versioned plan identity, never a silent rewrite of this one',
  });
}

/**
 * §3: THE CROSS-ARTIFACT SEAL.
 *
 * Let P be the committed plan, Q the committed Qualification and E the committed Stage Result. §3 requires:
 *
 *   P.planContentDigest === D(P)
 *   Q.plan.planContentDigest === P.planContentDigest
 *   Q.planContentDigest.frozen === P.planContentDigest
 *   E.plan.planContentDigest === P.planContentDigest
 *   E.planContentDigest.frozen === P.planContentDigest
 *
 * plus agreement of every recorded Plan ID and Execution Closure Digest. This function computes all of them and
 * returns each as its own check, so a report shows five results rather than one MATCH.
 */
export function sealCrossArtifactPlanIdentity(input) {
  const { plan, qualification = null, stageResult = null } = input;
  const committedDigest = plan?.planContentDigest ?? null;
  const committedPlanId = plan?.planId ?? null;
  const committedClosure = plan?.executionClosure?.executionClosureDigest ?? null;

  const qualificationPlanReference = qualification?.plan?.planContentDigest ?? null;
  const qualificationFrozenReference = qualification?.planContentDigest?.frozen ?? null;
  const qualificationPlanId = qualification?.plan?.planId ?? null;
  const stageResultPlanReference = stageResult?.plan?.planContentDigest ?? null;
  const stageResultFrozenReference = stageResult?.planContentDigest?.frozen ?? null;
  const stageResultPlanId = stageResult?.plan?.planId ?? null;

  const equal = (left, right) => left !== null && left !== undefined && right !== null && right !== undefined && left === right;

  const checks = Object.freeze({
    COMMITTED_PLAN_SELF_DIGEST: equal(plan?.planContentDigest, input.recomputedDigest ?? plan?.planContentDigest) ? 'MATCH' : 'DRIFTED',
    QUALIFICATION_PLAN_REFERENCE: equal(qualificationPlanReference, committedDigest) ? 'MATCH' : 'MISMATCH',
    QUALIFICATION_FROZEN_REFERENCE: equal(qualificationFrozenReference, committedDigest) ? 'MATCH' : 'MISMATCH',
    STAGE_RESULT_PLAN_REFERENCE: equal(stageResultPlanReference, committedDigest) ? 'MATCH' : 'MISMATCH',
    STAGE_RESULT_FROZEN_REFERENCE: equal(stageResultFrozenReference, committedDigest) ? 'MATCH' : 'MISMATCH',
    PLAN_ID_AGREEMENT: equal(qualificationPlanId, committedPlanId) && equal(stageResultPlanId, committedPlanId) ? 'MATCH' : 'MISMATCH',
    PLAN_CLOSURE_AGREEMENT: equal(input.currentClosureDigest ?? committedClosure, committedClosure) ? 'MATCH' : 'DRIFTED',
  });

  const failing = Object.entries(checks).filter(([, verdict]) => verdict !== 'MATCH').map(([id]) => id);
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C-F-S',
    kind: 'cross-artifact plan identity seal',
    committedPlanId,
    committedPlanContentDigest: committedDigest,
    committedClosureDigest: committedClosure,
    qualificationPlanReference,
    qualificationFrozenReference,
    stageResultPlanReference,
    stageResultFrozenReference,
    checks,
    failing: Object.freeze(failing),
    sealed: failing.length === 0,
    CROSS_ARTIFACT_PLAN_BINDING: failing.length === 0 ? 'MATCH' : 'MISMATCH',
    selfConsistentPlanIsInsufficient: true,
    law: 'a self-consistent plan is insufficient if another persisted result references a different plan; every recorded plan id and closure digest must agree with the committed plan',
  });
}

export { NL };
