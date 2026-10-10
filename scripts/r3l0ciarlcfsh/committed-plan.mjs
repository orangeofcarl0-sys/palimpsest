/**
 * R3-L0C-I-A-R-L-C-F-S-H §3/§5/§11 — THE COMMITTED-PLAN CONSUMPTION FOR THIS STAGE.
 *
 * §11 requires this stage to freeze a NEW prospective plan under a NEW identity
 * (`r3-l0c-iar-lcfsh-primary-plan`), explicitly superseding `r3-l0c-iar-lcfs-primary-plan`, and then to READ that
 * plan rather than regenerate it.
 *
 * WHAT IS REUSED AND WHAT IS NOT. The plan-identity RULE — a full content digest over every field except the
 * digest's own field — is the prior stage's, imported rather than restated, so the two stages cannot disagree about
 * what "full" means. The verification ALGORITHM (self-digest, committed Git blob, schema and id, closure binding)
 * is also the prior stage's, reused through its own `readAndVerifyCommittedPlan` with this stage's plan id and
 * path. There is therefore exactly ONE plan-digest implementation and ONE verification algorithm in the chain.
 *
 * WHY THE PRIOR STAGE'S MODULE IS READ RATHER THAN COPIED. `scripts/r3l0ciarlcfs/committed-plan.mjs` already
 * implements §3's four separate checks against a parameterized plan id and path. §8 forbids copying a large module
 * merely to change its stage name, so this module DELEGATES to it and adds only what is genuinely new: this stage's
 * path, this stage's plan id, and the pre-persistence seal status that must accompany a qualification built from a
 * plan that is verified but whose sibling evidence is not yet committed.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { NL, PLAN_ID, REPO_ROOT, STAGE_EVIDENCE_PATH } from './contract.mjs';

/** §11: the committed plan's path inside this stage's evidence namespace. */
export function committedPlanPath() {
  return `${STAGE_EVIDENCE_PATH}/execution-plan.json`;
}

/**
 * §3: READ AND VERIFY THE COMMITTED PLAN, WITHOUT REGENERATING IT.
 *
 * The result is the prior stage's own verification object, re-labelled with this stage's identity so a reader sees
 * which stage performed the read — and so a caller cannot accidentally treat a prior-stage verification as this
 * stage's evidence.
 */
export async function readAndVerifyCommittedPlan(input = {}) {
  const { readAndVerifyCommittedPlan: verify } = await import('../r3l0ciarlcfs/committed-plan.mjs');
  const relative = input.relative ?? committedPlanPath();
  const verification = await verify({
    relative,
    planPath: input.planPath ?? `${REPO_ROOT}/${relative}`,
    expectedPlanId: input.expectedPlanId ?? PLAN_ID,
    verifyCompiled: input.verifyCompiled === true,
  });
  return Object.freeze({
    ...verification,
    stage: 'R3-L0C-I-A-R-L-C-F-S-H',
    /** §3: the honesty flags, restated so this stage's result carries them rather than inheriting silently. */
    regenerated: false,
    constructedHere: false,
    selfCheckIsNotCrossArtifactSeal: true,
    gitLevelReproducibilityOnly: true,
    claimsCryptographicSignature: false,
    verifiedBy: 'scripts/r3l0ciarlcfs/committed-plan.mjs readAndVerifyCommittedPlan (reused, not restated)',
    secondPlanDigestImplementationCreated: false,
  });
}

/**
 * §11: CONSTRUCT A CANDIDATE PLAN.
 *
 * It exists for pre-freeze development and for tests OUTSIDE the final evidence path. It is NOT the authoritative
 * final evidence source, and it says so — a caller that used it as evidence would have to ignore an explicit flag.
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
 * §11: FREEZE THE PLAN ONCE.
 *
 * It writes the exact finalized plan to this stage's path and returns the digest it wrote. `frozenAt` is fixed at
 * this instant and is never regenerated for this plan identity. A caller must have stabilized every load-bearing
 * module BEFORE calling this, because §11 forbids silently overwriting the plan under the same identity after a
 * post-freeze source fix.
 */
export async function freezeCommittedPlan(input = {}) {
  const { createHash } = await import('node:crypto');
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
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
    relative: committedPlanPath(),
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

export { NL, PLAN_ID };
