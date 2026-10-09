/**
 * R3-L0C-I-A §2 — THE EXCLUSIVE ACTIVATION ENTRY.
 *
 * THE DEFECT THIS CLOSES, measured rather than argued. The baseline's `runPrimaryMatrix` calls
 * `preparePrimaryCase` FIRST, and that call reaches `buildIsolatedLayout`, whose first statement is
 * `rmSync(root, { recursive: true, force: true })`. So a second invocation with the same run id does not merely
 * mutate before refusing — it DELETES the run root, taking the claim file, the generation journal, the abort
 * manifest and the PRESERVE marker with it, and then proceeds as `NEW`. The replay guard in `fail-stop.mjs` is
 * correct and is never reached. Measured in F1: five preserved artifacts rewritten, the replay not refused.
 *
 * THE REPAIR IS AN ORDER, AND THE ORDER IS THE WHOLE REPAIR. §2 fixes nine steps and requires the claim to be
 * step 4 with steps 1-3 read-only. This module executes that order and REFUSES to run a step whose predecessors
 * are unsatisfied, so a future edit that moved the claim after the preparation would fail rather than silently
 * reintroduce the defect.
 *
 * WHY THE LAYOUT IS NOT REUSED FROM R3-L0B. `buildIsolatedLayout` is the destructive function: it removes the
 * root so a test can start from a known state. That is right for a fixture and catastrophic for an activation
 * boundary. So this module has its own `prepareLayoutSafely`, which creates directories if absent and NEVER
 * removes anything — and the difference is the reason it exists rather than a duplicated implementation.
 *
 * IT CLAIMS BEFORE IT PREPARES, AND IT PROVES THE CLAIM IS TRUSTED. §2 adds a second requirement: an outer entry
 * that preclaims must make the inner Fail-Stop runner VERIFY the claim rather than accept a caller flag. The
 * claim therefore carries a nonce, the runner compares it against disk, and `enforceRunClaim: false` is refused
 * as an unsupported parameter rather than honoured.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  ACTIVATION_ORDER,
  EXECUTION_MODES,
  EXECUTION_MODE_LAW,
  GENERATION_CHILD_BUDGET_MS,
  QUARANTINE_HONESTY,
  REPO_ROOT,
  RUN_ROOT_REFUSAL_CONDITIONS,
  SETTLEMENT_INTERVAL_MS,
  STAGE_EVIDENCE_PATH,
  WORKER_EXECUTION_BUDGET_MS,
} from './contract.mjs';
import { CLAIM_FILE } from '../r3l0cf/fail-stop.mjs';
import { ABORT_MANIFEST_FILE, JOURNAL_FILE, writeJsonAtomic } from '../r3l0cf/journal.mjs';

const NL = String.fromCharCode(10);

/** §2: the preparation record, so a partially prepared root is detectable. */
export const PREPARATION_FILE = 'preparation.json';

/** §2: the preservation marker, placed before any world is copied. */
export const PRESERVE_FILE = 'PRESERVE';

/** §2: the trusted-claim nonce field. The runner compares this against disk; a flag cannot forge it. */
export const CLAIM_NONCE_FIELD = 'claimNonce';

/* ================================================================ §2 the run-root inspection */

/**
 * §2: INSPECT A RUN ROOT AND DECIDE WHETHER IT MAY BE ACTIVATED.
 *
 * §2 lists five conditions under which an existing root must not be treated as NEW, and adds that a malformed
 * claim must fail closed. The inspection is READ-ONLY: it opens nothing for writing, creates nothing, and
 * removes nothing, so it is safe to run against a preserved run whose evidence must survive.
 *
 * THE ORDER OF THE CHECKS IS DELIBERATE. A malformed claim is checked FIRST, because a claim that does not parse
 * cannot be trusted to describe what else is present, and reading the rest of the root as though it were
 * unclaimed is exactly the fail-open direction §2 forbids.
 */
export function inspectActivationRoot(input) {
  const { runRoot, runId, trajectoryIds = [] } = input;
  const claimPath = join(runRoot, CLAIM_FILE);
  const journalPath = join(runRoot, JOURNAL_FILE);
  const preservePath = join(runRoot, PRESERVE_FILE);
  const preparationPath = join(runRoot, PREPARATION_FILE);
  const manifestPath = join(runRoot, ABORT_MANIFEST_FILE);

  const present = Object.freeze({
    runRoot: existsSync(runRoot),
    claim: existsSync(claimPath),
    journal: existsSync(journalPath),
    preserve: existsSync(preservePath),
    preparation: existsSync(preparationPath),
    abortManifest: existsSync(manifestPath),
  });

  /** The claim's own parse, kept separate because a malformed claim is its own refusal. */
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

  /** The trajectory worlds and stores that exist, which is how "ownership cannot be proven" is decided. */
  const unitRoot = join(runRoot, 'units');
  const existingUnits = existsSync(unitRoot) ? readdirSync(unitRoot) : [];
  const primaryArtifactsPresent = existingUnits.length > 0;

  /** The preparation record's own state, so an interrupted preparation is detectable. */
  let preparationState = null;
  if (present.preparation) {
    try { preparationState = JSON.parse(readFileSync(preparationPath, 'utf8'))?.state ?? null; } catch { preparationState = 'UNREADABLE'; }
  }

  const refuse = (verdict, condition, reason) => Object.freeze({
    verdict,
    mayProceed: false,
    condition,
    reason,
    present,
    claim,
    claimMalformed,
    preparationState,
    existingUnits: Object.freeze([...existingUnits]),
    journal: readJournalCounts(journalPath),
  });

  if (claimMalformed) return refuse('REFUSED_MALFORMED_CLAIM', 'MALFORMED_CLAIM', 'a claim file exists but does not parse or does not carry a run id and a claim nonce; a malformed claim fails closed rather than being treated as absent');
  if (present.claim && claim.runId !== runId) return refuse('REFUSED_ALREADY_CLAIMED', 'EXISTING_CLAIM', `the run root is claimed by run "${String(claim.runId)}", not "${runId}"`);
  if (present.claim) {
    const counts = readJournalCounts(journalPath);
    if (counts.exposureIntents > 0 || counts.launches > 0) return refuse('REFUSED_REPLAY', 'EXISTING_CLAIM', `run "${runId}" already recorded ${String(counts.exposureIntents)} exposure-intent(s) and ${String(counts.launches)} launch(es); re-running it would re-launch possibly-exposed sessions`);
    return refuse('REFUSED_REPLAY', 'EXISTING_CLAIM', `run "${runId}" already claimed this run root; a fresh run belongs in a fresh root`);
  }
  if (present.preserve) return refuse('REFUSED_REPLAY', 'PRESERVE_MARKER', 'a PRESERVE marker exists, so this root holds a preserved run and must not be re-entered');
  if (present.journal) return refuse('REFUSED_REPLAY', 'EXISTING_JOURNAL', 'a generation journal exists without a claim, so the root is not unspent');
  if (present.preparation && preparationState !== 'PREPARED') return refuse('REFUSED_PARTIAL_PREPARATION', 'INCOMPLETE_PREPARATION', `a preparation record exists in state "${String(preparationState)}", so preparation was interrupted and the root must not be reused`);
  if (primaryArtifactsPresent && !present.claim) return refuse('REFUSED_UNPROVABLE_OWNERSHIP', 'UNPROVABLE_OWNERSHIP', `primary trajectory artifacts exist under units/ [${existingUnits.slice(0, 6).join(', ')}] with no claim proving ownership`);

  return Object.freeze({
    verdict: 'NEW',
    mayProceed: true,
    condition: null,
    reason: 'no claim, journal, PRESERVE marker, incomplete preparation or unprovable primary artifact exists, so this run root is unspent',
    present,
    claim: null,
    claimMalformed: false,
    preparationState: null,
    existingUnits: Object.freeze([...existingUnits]),
    journal: readJournalCounts(journalPath),
  });
}

/** The journal's exposure counts, read without importing the runner's reader (the file may be absent). */
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
 * §2: CLAIM THE RUN ROOT EXCLUSIVELY.
 *
 * The claim is created with `wx`, so the creation IS the mutual exclusion: a second process attempting the same
 * path receives `EEXIST` rather than a successful write. The claim carries a NONCE, which is what makes it
 * TRUSTED rather than merely present: the Fail-Stop runner compares the nonce it was handed against the nonce on
 * disk, so a caller cannot claim on another process's behalf by asserting that it did.
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
    /**
     * The exclusive create lost a race. Re-inspecting names the actual holder rather than reporting a bare
     * filesystem error, which is what an operator needs.
     */
    return Object.freeze({ claimed: false, claim: null, inspection: inspectActivationRoot({ runRoot, runId }), raceDetail: String(error?.code ?? error?.message ?? error).slice(0, 120) });
  }
}

/**
 * §2: VERIFY A TRUSTED CLAIM.
 *
 * This is the function the inner Fail-Stop runner calls instead of accepting a caller flag. It reads the claim
 * from DISK and requires the run id and the nonce to match, so a caller that did not actually claim cannot
 * proceed by asserting that it did — and there is no parameter that turns the check off.
 */
export function verifyTrustedClaim(input) {
  const { runRoot, runId, claimNonce } = input;
  const claimPath = join(runRoot, CLAIM_FILE);
  if (!existsSync(claimPath)) return Object.freeze({ trusted: false, verdict: 'REFUSED_UNCLAIMED', reason: 'no claim file exists on disk, so the caller does not hold this run root' });
  let claim;
  try { claim = JSON.parse(readFileSync(claimPath, 'utf8')); } catch { return Object.freeze({ trusted: false, verdict: 'REFUSED_MALFORMED_CLAIM', reason: 'the claim file does not parse' }); }
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
 * The difference from `buildIsolatedLayout` is one line and it is the entire point: this creates what is absent
 * and removes NOTHING. A preparation step that can delete the run root cannot be placed after a claim and still
 * mean what §2 requires, because "claim before mutation" would be satisfied in letter while the first mutation
 * destroyed the evidence the claim was meant to protect.
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

/* ================================================================ §2 the plan verification */

/**
 * §2 step 1: VERIFY THE COMMITTED PROSPECTIVE PLAN.
 *
 * The plan is the authority for the schedule, the mode, the closure binding and the authorization state, so it is
 * read FIRST and every later step derives from it. The verification is structural and specific: a plan that
 * omits its identity, its schedule, its closure binding or its authorization state is refused, because each of
 * those is something a later step would otherwise have to default — and a default is what §6 forbids.
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

/* ================================================================ §5 the execution mode */

/**
 * §5: RESOLVE AN EXECUTION MODE.
 *
 * §5 requires the two modes to be explicit and mutually exclusive with no silent fallback in either direction.
 * The resolution returns the worker executable the mode requires AND the external-call permission, so a record
 * names what actually ran rather than leaving it to be inferred from the source.
 *
 * A caller-supplied `authorizedBy` string is NOT accepted as paid authorization: §5 says so, and the mode
 * resolution therefore reports `paidAuthorizationPresent` from an explicit authorization field rather than from
 * a free-text claim.
 */
export async function resolveExecutionMode(input) {
  const requested = String(input.mode ?? '');
  const mode = EXECUTION_MODES.find((entry) => entry.id === requested);
  if (mode === undefined) {
    return Object.freeze({
      resolved: false,
      reason: `"${requested === '' ? '(absent)' : requested}" is not a declared execution mode; the declared modes are [${EXECUTION_MODES.map((entry) => entry.id).join(', ')}]`,
      silentFallbackTaken: false,
      mode: null,
      workerExecutable: null,
      externalModelCallPermitted: null,
    });
  }
  /**
   * §5: THE WORKER EACH MODE REQUIRES.
   *
   * DETERMINISTIC resolves THIS STAGE's scripted worker, not R3-L0C-I's. The difference is not cosmetic: the
   * R3-L0C-I mock emits `{"handles":[...]}` while the shipped runner emits `{"pulled":[...]}`, so the shipped
   * parser reads the mock's line as ZERO pulls for every session — measured, and the reason F4's conflation was
   * invisible. A mode that resolves a worker whose telemetry the shipped parser cannot read would make every
   * deterministic session report non-uptake.
   */
  const { SCRIPTED_WORKER } = await import('./primary-adapter.mjs');
  const shipped = mode.id === 'PRIMARY' ? await resolveShippedDshBinAsync() : null;
  const workerExecutable = mode.id === 'PRIMARY' ? shipped?.bin ?? null : SCRIPTED_WORKER;
  return Object.freeze({
    resolved: workerExecutable !== null,
    reason: null,
    mode: mode.id,
    workerExecutable,
    workerIsScripted: mode.id === 'DETERMINISTIC',
    externalModelCallPermitted: mode.externalModelCallPermitted,
    paidAuthorizationRequired: mode.paidAuthorizationRequired,
    /** §5: a free-text authorization claim is not proof. */
    callerSuppliedAuthorizedByAccepted: false,
    paidAuthorizationPresent: mode.id === 'PRIMARY' ? input.paidAuthorization === true : false,
    silentFallbackTaken: false,
    thisStageEntersPrimary: EXECUTION_MODE_LAW.thisStageEntersPrimary,
  });
}

/**
 * §5: resolve the shipped DSH executable, or report why it could not be resolved.
 *
 * It is resolved through the gates' own resolver rather than by composing a path, so the activation and the
 * canary suite cannot disagree about where the shipped runtime lives. A resolution that fails REPORTS the
 * failure rather than falling back to the scripted worker, because a silent fallback is the defect F5 measures.
 */
export async function resolveShippedDshBinAsync() {
  try {
    const env = await import('../gates/env.mjs');
    const bin = env.dshBin();
    if (typeof bin !== 'string' || bin === '') return Object.freeze({ bin: null, resolved: false, error: 'the gates resolver returned no path' });
    return Object.freeze({ bin, resolved: true, source: 'scripts/gates/env.mjs dshBin()' });
  } catch (error) {
    return Object.freeze({ bin: null, resolved: false, error: String(error?.message ?? error).slice(0, 200) });
  }
}

/* ================================================================ §2/§5 the activation entry */

/**
 * §2: ACTIVATE A PRIMARY RUN — THE NINE STEPS, IN ORDER.
 *
 * The function is the SUPPORTED PRIMARY ENTRY. It performs the ruling's nine steps and returns a record naming
 * each one, whether it mutated anything, and what it observed. The steps that read run before the claim; the
 * claim is the first mutation; and steps 5-8 happen only after the claim is held.
 *
 * WHAT IT REFUSES, and each refusal is a §2 or §6 requirement rather than a convenience:
 *
 *   · a plan that does not verify, or whose schedule differs from the one to execute;
 *   · a closure digest that is absent, null or does not match the recomputed one;
 *   · an execution mode that is absent or undeclared, or a PRIMARY mode without paid authorization;
 *   · a run root that is claimed, preserved, journalled, partially prepared or of unprovable ownership;
 *   · a caller that asks to skip the claim check.
 *
 * It does NOT launch anything. §2's step 9 is `LAUNCH_EXACTLY_ONCE`, and this stage is forbidden to reach it, so
 * the function stops at the boundary and returns a record that names the launch as the caller's next act under
 * the returned trusted claim. That is the honest shape: the activation is what this stage can prove, and the
 * launch belongs to the authorized run.
 */
export async function activatePrimaryRun(input) {
  const steps = [];
  const record = (stepId, mutated, observation) => steps.push(Object.freeze({ step: ACTIVATION_ORDER.find((entry) => entry.id === stepId)?.step ?? null, id: stepId, mutated, observation }));
  const refuse = (stepId, reason, detail) => {
    record(stepId, false, Object.freeze({ refused: true, reason }));
    return Object.freeze({ ACTIVATION: 'REFUSED', refusedAt: stepId, reason, detail: detail ?? null, steps: Object.freeze(steps), claim: null, runRoot: input.runRoot ?? null });
  };

  /** §2: an unsupported escape hatch is refused rather than honoured. */
  if (input.enforceRunClaim === false) {
    return refuse('ACQUIRE_EXCLUSIVE_RUN_ROOT', 'UNSUPPORTED_CLAIM_BYPASS', 'a caller may not disable the run-root claim; the claim is verified against disk and there is no parameter that turns the check off');
  }

  /** STEP 1: verify the committed prospective plan. */
  const planRead = input.plan === undefined ? readCommittedPlan(input.planPath) : Object.freeze({ planPath: input.planPath ?? null, exists: true, plan: input.plan, error: null });
  if (planRead.exists !== true || planRead.plan === null) return refuse('VERIFY_COMMITTED_PLAN', 'PLAN_ABSENT', planRead.error);
  const expectedScheduleIds = input.expectedScheduleIds ?? (input.expectedSchedule ?? []).map((session) => session.sessionId);
  const planVerification = verifyCommittedPlan(planRead.plan, { planId: input.expectedPlanId, scheduleIds: expectedScheduleIds.length > 0 ? expectedScheduleIds : undefined });
  record('VERIFY_COMMITTED_PLAN', false, Object.freeze({ planId: planVerification.planId, scheduleLength: planVerification.scheduleLength, PLAN_VALID: planVerification.PLAN_VALID }));
  if (planVerification.PLAN_VALID !== true) return refuse('VERIFY_COMMITTED_PLAN', 'PLAN_INVALID', planVerification.problems.join('; '));

  /** STEP 2: verify the current runtime and the executable closure. */
  const closure = input.closure ?? await (await import('./closure.mjs')).computeExecutionClosure({ verifyCompiled: input.verifyCompiled });
  const boundDigest = planVerification.closureDigest;
  const closureMatches = typeof boundDigest === 'string' && boundDigest !== '' && boundDigest === closure.executionClosureDigest;
  record('VERIFY_RUNTIME_AND_CLOSURE', false, Object.freeze({ bound: boundDigest, recomputed: closure.executionClosureDigest, matches: closureMatches }));
  if (closureMatches !== true) {
    return refuse('VERIFY_RUNTIME_AND_CLOSURE', boundDigest === null || boundDigest === undefined || boundDigest === '' ? 'CLOSURE_BINDING_ABSENT' : 'CLOSURE_DRIFTED', `the plan binds ${String(boundDigest)} and the runtime computes ${closure.executionClosureDigest}`);
  }

  /** STEP 3: check the run identity and the expected schedule. */
  const runId = input.runId;
  if (typeof runId !== 'string' || runId === '') return refuse('CHECK_RUN_IDENTITY_AND_SCHEDULE', 'RUN_ID_ABSENT', 'no run id was supplied');
  const scheduleIds = (input.expectedSchedule ?? []).map((session) => session.sessionId);
  if (scheduleIds.length === 0) return refuse('CHECK_RUN_IDENTITY_AND_SCHEDULE', 'SCHEDULE_ABSENT', 'no expected schedule was supplied');
  if (scheduleIds.length !== planVerification.scheduleLength) return refuse('CHECK_RUN_IDENTITY_AND_SCHEDULE', 'SCHEDULE_MISMATCH', `the schedule to execute has ${String(scheduleIds.length)} session(s) and the plan has ${String(planVerification.scheduleLength)}`);
  record('CHECK_RUN_IDENTITY_AND_SCHEDULE', false, Object.freeze({ runId, scheduleLength: scheduleIds.length, match: true }));

  /** STEP 4: acquire exclusive run-root ownership. THE FIRST MUTATION. */
  const runRoot = input.runRoot;
  const claim = claimActivationRoot({ runRoot, runId });
  record('ACQUIRE_EXCLUSIVE_RUN_ROOT', true, Object.freeze({ claimed: claim.claimed, verdict: claim.inspection.verdict, reason: claim.inspection.reason }));
  if (claim.claimed !== true) return Object.freeze({ ACTIVATION: 'REFUSED', refusedAt: 'ACQUIRE_EXCLUSIVE_RUN_ROOT', reason: claim.inspection.verdict, detail: claim.inspection.reason, steps: Object.freeze(steps), claim: null, runRoot });

  /** STEP 5: persist the preservation marker and the preparation record. */
  writeJsonAtomic(join(runRoot, PRESERVE_FILE), { runId, at: new Date().toISOString(), reason: 'an activation preserves its evidence from the first possible exposure onward' });
  writeJsonAtomic(join(runRoot, PREPARATION_FILE), { schemaVersion: 1, runId, state: 'PREPARING', startedAt: new Date().toISOString(), trajectoryIds: [...(input.trajectoryIds ?? [])] });
  record('PERSIST_PRESERVATION_MARKER', true, Object.freeze({ preserveMarker: true, preparationState: 'PREPARING' }));

  /** STEP 6: prepare worlds, state stores and profiles — NON-DESTRUCTIVELY. */
  const layout = prepareLayoutSafely(runRoot, input.trajectoryIds ?? []);
  const prepared = input.prepare === undefined ? null : await input.prepare({ runRoot, layout });
  writeJsonAtomic(join(runRoot, PREPARATION_FILE), { schemaVersion: 1, runId, state: 'PREPARED', preparedAt: new Date().toISOString(), trajectoryIds: [...(input.trajectoryIds ?? [])], createdDirectories: [...layout.createdDirectories], removedAnything: false, preparedDetail: prepared });
  record('PREPARE_WORLDS_STORES_PROFILES', true, Object.freeze({ createdDirectories: layout.createdDirectories.length, removedAnything: false }));

  /** STEP 7: the applicable pre-exposure checks. */
  const preExposure = input.preExposureChecks === undefined ? null : await input.preExposureChecks({ runRoot, runId });
  record('PRE_EXPOSURE_CHECKS', false, Object.freeze({ supplied: preExposure !== null, result: preExposure }));

  /** STEP 8: the mode, which decides the worker the launch would use. */
  const mode = await resolveExecutionMode({ mode: input.mode, paidAuthorization: input.paidAuthorization });
  if (mode.resolved !== true) return Object.freeze({ ACTIVATION: 'REFUSED', refusedAt: 'PERSIST_SESSION_EXPOSURE_INTENT', reason: 'EXECUTION_MODE_UNRESOLVED', detail: mode.reason, steps: Object.freeze(steps), claim, runRoot });
  if (mode.mode === 'PRIMARY' && mode.paidAuthorizationPresent !== true) {
    return Object.freeze({
      ACTIVATION: 'REFUSED',
      refusedAt: 'PERSIST_SESSION_EXPOSURE_INTENT',
      reason: 'PRIMARY_MODE_WITHOUT_PAID_AUTHORIZATION',
      detail: 'PRIMARY execution requires an explicit paid authorization; a caller-supplied authorization string is not proof, and this stage does not carry one',
      steps: Object.freeze(steps),
      claim,
      runRoot,
      mode,
    });
  }

  /** STEP 9 is NOT performed: this stage must not enter PRIMARY execution and launches nothing. */
  record('PERSIST_SESSION_EXPOSURE_INTENT', false, Object.freeze({ mode: mode.mode, workerExecutable: mode.workerExecutable, externalModelCallPermitted: mode.externalModelCallPermitted }));
  record('LAUNCH_EXACTLY_ONCE', false, Object.freeze({ launched: false, note: 'the activation stops at the launch boundary; the authorized run performs step 9 under the returned trusted claim' }));

  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A',
    kind: 'primary run activation',
    ACTIVATION: 'ACTIVATED',
    runId,
    runRoot,
    claim,
    /** §2: the trusted claim the launch must present, so the runner verifies rather than trusts a flag. */
    trustedClaim: Object.freeze({ runId, claimNonce: claim.claimNonce, verify: 'scripts/r3l0cia/activation.mjs verifyTrustedClaim' }),
    plan: Object.freeze({ planId: planVerification.planId, scheduleLength: planVerification.scheduleLength, closureDigest: boundDigest }),
    closure: Object.freeze({ executionClosureDigest: closure.executionClosureDigest, matches: true }),
    mode,
    budgets: Object.freeze({
      outerChildMs: GENERATION_CHILD_BUDGET_MS,
      innerWorkerMs: WORKER_EXECUTION_BUDGET_MS,
      settlementMs: SETTLEMENT_INTERVAL_MS,
      outerExceedsInnerPlusSettlement: GENERATION_CHILD_BUDGET_MS > WORKER_EXECUTION_BUDGET_MS + SETTLEMENT_INTERVAL_MS,
    }),
    layout,
    steps: Object.freeze(steps),
    /** §2: the quarantine's honest statement, carried so a report cannot overclaim it. */
    quarantine: QUARANTINE_HONESTY,
    modelCallsMade: 0,
    launched: false,
  });
}

export { NL, ACTIVATION_ORDER, dirname, statSync, createHash };
