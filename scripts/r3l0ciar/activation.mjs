/**
 * R3-L0C-I-A-R §2 — THE EXCLUSIVE RUN-ROOT CLAIM, INSIDE THE AUTHORITATIVE PIPELINE.
 *
 * THE DEFECT THIS CLOSES, measured in G1. The R3-L0C-I-A matrix driver (`primary-driver.mjs:126`) called
 * `preparePrimaryCase` — which creates `units/<trajectory>/world`, `state`, `home`, `private/**` and copies the
 * prehistory into them — BEFORE the Fail-Stop runner inspected and claimed the root at `:224`. So a refused replay
 * through the real launching entry had already mutated the run root. The R3-L0C-I-A activation entry did claim
 * first, but it stopped at the launch boundary and never ran the matrix: there were TWO entry points and only one
 * was ordered correctly.
 *
 * THE REPAIR IS ONE ENTRY, AND THE CLAIM IS ITS FIRST MUTATION. The pipeline in `pipeline.mjs` claims here at step
 * 3, after the read-only plan and closure checks and before anything is created. Steps 1-2 open nothing for
 * writing; step 3 creates the claim file with `wx`; steps 4+ may mutate. A refusal at any step leaves the root
 * exactly as it found it, and the acceptance suite measures that as a byte digest.
 *
 * WHY THE CLAIM CARRIES A NONCE. §2 requires that a caller-controlled flag or a nonce read from another run's
 * evidence cannot create paid-run authority. The nonce is generated HERE, written to disk, and handed to the
 * Fail-Stop runner, which re-reads it from disk and compares. A caller that did not claim cannot produce it.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { NL, REPO_ROOT, STAGE_EVIDENCE_PATH } from './contract.mjs';

/** §2: the claim file, matching the Fail-Stop runner's own name so the two cannot disagree. */
export const CLAIM_FILE = 'run-claim.json';

/** §2: the nonce field the runner verifies. */
export const CLAIM_NONCE_FIELD = 'claimNonce';

/** §2: the preservation marker and the preparation record. */
export const PRESERVE_FILE = 'PRESERVE';
export const PREPARATION_FILE = 'preparation.json';

/** §2: the journal the runner writes, read here without importing its reader (the file may be absent). */
export const JOURNAL_FILE = 'generation-journal.jsonl';

/** §2: the abort manifest the runner writes. */
export const ABORT_MANIFEST_FILE = 'abort-manifest.json';

/* ================================================================ §2 inspection */

/**
 * §2: INSPECT A RUN ROOT AND DECIDE WHETHER IT MAY BE ACTIVATED.
 *
 * READ-ONLY. It opens nothing for writing, creates nothing and removes nothing, so it is safe against a preserved
 * run whose evidence must survive. A malformed claim is checked FIRST, because a claim that does not parse cannot
 * be trusted to describe what else is present.
 */
export function inspectActivationRoot(input) {
  const { runRoot, runId } = input;
  const claimPath = join(runRoot, CLAIM_FILE);
  const journalPath = join(runRoot, JOURNAL_FILE);
  const present = Object.freeze({
    runRoot: existsSync(runRoot),
    claim: existsSync(claimPath),
    journal: existsSync(journalPath),
    preserve: existsSync(join(runRoot, PRESERVE_FILE)),
    preparation: existsSync(join(runRoot, PREPARATION_FILE)),
    abortManifest: existsSync(join(runRoot, ABORT_MANIFEST_FILE)),
  });

  let claim = null;
  let claimMalformed = false;
  if (present.claim) {
    try {
      claim = JSON.parse(readFileSync(claimPath, 'utf8'));
      if (typeof claim?.runId !== 'string' || claim.runId === '' || typeof claim?.[CLAIM_NONCE_FIELD] !== 'string') claimMalformed = true;
    } catch {
      claimMalformed = true;
    }
  }

  const unitRoot = join(runRoot, 'units');
  const existingUnits = existsSync(unitRoot) ? readdirSync(unitRoot) : [];
  const primaryArtifactsPresent = existingUnits.length > 0;

  let preparationState = null;
  if (present.preparation) {
    try { preparationState = JSON.parse(readFileSync(join(runRoot, PREPARATION_FILE), 'utf8'))?.state ?? null; } catch { preparationState = 'UNREADABLE'; }
  }

  const journal = readJournalCounts(journalPath);
  const refuse = (verdict, condition, reason) => Object.freeze({
    verdict, mayProceed: false, condition, reason, present, claim, claimMalformed, preparationState,
    existingUnits: Object.freeze([...existingUnits]), journal,
  });

  if (claimMalformed) return refuse('REFUSED_MALFORMED_CLAIM', 'MALFORMED_CLAIM', 'a claim file exists but does not parse or does not carry a run id and a claim nonce; a malformed claim fails closed rather than being treated as absent');
  if (present.claim && claim.runId !== runId) return refuse('REFUSED_ALREADY_CLAIMED', 'EXISTING_CLAIM', `the run root is claimed by run "${String(claim.runId)}", not "${runId}"`);
  if (present.claim) {
    if (journal.exposureIntents > 0 || journal.launches > 0) return refuse('REFUSED_REPLAY', 'EXISTING_CLAIM', `run "${runId}" already recorded ${String(journal.exposureIntents)} exposure-intent(s) and ${String(journal.launches)} launch(es); re-running it would re-launch possibly-exposed sessions`);
    return refuse('REFUSED_REPLAY', 'EXISTING_CLAIM', `run "${runId}" already claimed this run root; a fresh run belongs in a fresh root`);
  }
  if (present.preserve) return refuse('REFUSED_REPLAY', 'PRESERVE_MARKER', 'a PRESERVE marker exists, so this root holds a preserved run and must not be re-entered');
  if (present.journal) return refuse('REFUSED_REPLAY', 'EXISTING_JOURNAL', 'a generation journal exists without a claim, so the root is not unspent');
  if (present.preparation && preparationState !== 'PREPARED') return refuse('REFUSED_PARTIAL_PREPARATION', 'INCOMPLETE_PREPARATION', `a preparation record exists in state "${String(preparationState)}", so preparation was interrupted and the root must not be reused`);
  if (primaryArtifactsPresent) return refuse('REFUSED_UNPROVABLE_OWNERSHIP', 'UNPROVABLE_OWNERSHIP', `primary trajectory artifacts exist under units/ [${existingUnits.slice(0, 6).join(', ')}] with no claim proving ownership`);

  return Object.freeze({
    verdict: 'NEW', mayProceed: true, condition: null,
    reason: 'no claim, journal, PRESERVE marker, incomplete preparation or unprovable primary artifact exists, so this run root is unspent',
    present, claim: null, claimMalformed: false, preparationState: null,
    existingUnits: Object.freeze([...existingUnits]), journal,
  });
}

/** The journal's exposure counts, read without importing the runner's reader. */
function readJournalCounts(journalPath) {
  if (!existsSync(journalPath)) return Object.freeze({ exists: false, total: 0, exposureIntents: 0, launches: 0 });
  let records = [];
  try {
    records = readFileSync(journalPath, 'utf8').split(NL).filter((line) => line.trim() !== '').map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter((record) => record !== null);
  } catch { records = []; }
  return Object.freeze({
    exists: true,
    total: records.length,
    exposureIntents: records.filter((record) => record.kind === 'EXPOSURE_INTENT_RECORDED').length,
    launches: records.filter((record) => record.kind === 'WORKER_LAUNCH_RECORDED').length,
  });
}

/* ================================================================ §2 the exclusive claim */

/**
 * §2: CLAIM THE RUN ROOT EXCLUSIVELY. THE FIRST MUTATION OF THE PIPELINE.
 *
 * The claim is created with `wx`, so the creation IS the mutual exclusion. The nonce makes it verifiable rather
 * than merely present.
 */
export function claimActivationRoot(input) {
  const { runRoot, runId } = input;
  const inspection = inspectActivationRoot({ runRoot, runId });
  if (inspection.mayProceed !== true) return Object.freeze({ claimed: false, inspection, claim: null });
  mkdirSync(runRoot, { recursive: true });
  const claimPath = join(runRoot, CLAIM_FILE);
  const claimNonce = randomUUID();
  const record = { schemaVersion: 1, runId, claimedAt: new Date().toISOString(), pid: process.pid, exclusive: true, [CLAIM_NONCE_FIELD]: claimNonce };
  try {
    const handle = openSync(claimPath, 'wx');
    try { writeFileSync(handle, `${JSON.stringify(record, null, 2)}${NL}`, 'utf8'); } finally { closeSync(handle); }
    return Object.freeze({ claimed: true, claim: Object.freeze(record), claimNonce, claimPath, inspection });
  } catch (error) {
    return Object.freeze({ claimed: false, claim: null, inspection: inspectActivationRoot({ runRoot, runId }), raceDetail: String(error?.code ?? error?.message ?? error).slice(0, 120) });
  }
}

/**
 * §2: VERIFY A TRUSTED CLAIM AGAINST DISK.
 *
 * The runner calls this rather than accepting a caller flag. There is no parameter that turns the check off.
 */
export function verifyTrustedClaim(input) {
  const { runRoot, runId, claimNonce } = input;
  const claimPath = join(runRoot, CLAIM_FILE);
  if (!existsSync(claimPath)) return Object.freeze({ trusted: false, verdict: 'REFUSED_UNCLAIMED', reason: 'no claim file exists on disk, so the caller does not hold this run root' });
  let claim;
  try { claim = JSON.parse(readFileSync(claimPath, 'utf8')); } catch { return Object.freeze({ trusted: false, verdict: 'REFUSED_MALFORMED_CLAIM', reason: 'the claim file does not parse' }); }
  if (typeof claim?.[CLAIM_NONCE_FIELD] !== 'string' || claim[CLAIM_NONCE_FIELD] === '') return Object.freeze({ trusted: false, verdict: 'REFUSED_MALFORMED_CLAIM', reason: 'the on-disk claim carries no claim nonce, so it cannot be verified', claim });
  if (claim.runId !== runId) return Object.freeze({ trusted: false, verdict: 'REFUSED_ALREADY_CLAIMED', reason: `the on-disk claim names run "${String(claim.runId)}", not "${runId}"`, claim });
  if (typeof claimNonce !== 'string' || claimNonce === '' || claim[CLAIM_NONCE_FIELD] !== claimNonce) {
    return Object.freeze({ trusted: false, verdict: 'REFUSED_UNTRUSTED_CLAIM', reason: 'the caller-supplied claim nonce does not match the nonce on disk, so the caller cannot prove it holds this run root', claim });
  }
  return Object.freeze({ trusted: true, verdict: 'TRUSTED', claim, reason: 'the on-disk claim names this run and the nonce matches' });
}

/* ================================================================ §2 the safe layout */

/**
 * §2: PREPARE THE LAYOUT WITHOUT DESTROYING ANYTHING.
 *
 * The R3-L0B `buildIsolatedLayout` removes the root so a fixture starts clean; that is catastrophic after a claim.
 * This creates what is absent and removes NOTHING.
 */
export function prepareLayoutSafely(runRoot, trajectoryIds) {
  const created = [];
  const ensure = (path) => {
    if (existsSync(path)) return false;
    mkdirSync(path, { recursive: true });
    created.push(path);
    return true;
  };
  ensure(runRoot);
  for (const trajectoryId of trajectoryIds) {
    ensure(join(runRoot, 'units', trajectoryId, 'world'));
    ensure(join(runRoot, 'units', trajectoryId, 'state'));
    ensure(join(runRoot, 'units', trajectoryId, 'home'));
    ensure(join(runRoot, 'private', 'units', trajectoryId));
  }
  for (const dir of ['oracle', 'control', 'reference', 'evidence']) ensure(join(runRoot, 'private', dir));
  return Object.freeze({
    runRoot,
    trajectoryIds: Object.freeze([...trajectoryIds]),
    createdDirectories: Object.freeze(created),
    removedAnything: false,
    law: 'the activation preparation creates what is absent and removes nothing, because a destructive preparation cannot be placed after a claim',
  });
}

/* ================================================================ §2 the committed plan */

/**
 * §2 step 1: VERIFY THE COMMITTED PROSPECTIVE PLAN.
 *
 * The plan is the authority for the schedule, the closure binding and the route, so it is read FIRST.
 */
export function verifyCommittedPlan(plan, expected = {}) {
  const problems = [];
  if (plan === null || plan === undefined || typeof plan !== 'object') problems.push('the plan is absent or is not an object');
  else {
    if (typeof plan.planId !== 'string' || plan.planId === '') problems.push('the plan carries no planId');
    if (!Array.isArray(plan.schedule) || plan.schedule.length === 0) problems.push('the plan carries no schedule');
    if (plan.executionClosure === null || typeof plan.executionClosure?.executionClosureDigest !== 'string') problems.push('the plan binds no execution-closure digest');
    if (plan.executionRoute === null || typeof plan.executionRoute !== 'object') problems.push('the plan declares no execution route');
    if (plan.authorizationRequired === null || typeof plan.authorizationRequired?.required !== 'boolean') problems.push('the plan does not state whether authorization is required');
    if (expected.planId !== undefined && plan.planId !== expected.planId) problems.push(`the plan id is "${String(plan.planId)}" but "${String(expected.planId)}" was required`);
  }
  if (expected.scheduleIds !== undefined) {
    const actual = Array.isArray(plan?.schedule) ? plan.schedule.map((session) => session.sessionId) : [];
    if (actual.join(',') !== expected.scheduleIds.join(',')) problems.push('the plan schedule does not match the schedule to be executed');
  }
  return Object.freeze({
    PLAN_VALID: problems.length === 0,
    problems: Object.freeze(problems),
    planId: plan?.planId ?? null,
    scheduleLength: Array.isArray(plan?.schedule) ? plan.schedule.length : 0,
    closureDigest: plan?.executionClosure?.executionClosureDigest ?? null,
    onFailure: 'STOP — no session may be launched against a plan that does not verify',
  });
}

/** §2 step 1: read the committed plan from this stage's evidence namespace. */
export function readCommittedPlan(planPath = join(REPO_ROOT, STAGE_EVIDENCE_PATH, 'execution-plan.json')) {
  if (!existsSync(planPath)) return Object.freeze({ planPath, exists: false, plan: null, error: `the committed prospective plan is absent at ${planPath}, so no primary session may start` });
  try {
    return Object.freeze({ planPath, exists: true, plan: JSON.parse(readFileSync(planPath, 'utf8')), error: null });
  } catch (error) {
    return Object.freeze({ planPath, exists: true, plan: null, error: `the committed prospective plan does not parse: ${String(error?.message ?? error).slice(0, 200)}` });
  }
}

export { NL };
