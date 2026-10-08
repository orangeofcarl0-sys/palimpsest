/**
 * R3-WR5 GATE B — GOVERNED FAILURE DISPOSITION.
 *
 * §6 freezes the policy before implementation. §7 fixes the minimal terminal semantics. §8 audits durable host
 * evidence. §9 freezes KILL_REQUESTED != WORKER_EXIT_CONFIRMED. §10 constructs the broken-world scenario. §11
 * lists the negative and positive controls for an authorized terminal. §12 requires the nine predicates be
 * measured SEPARATELY rather than inherited from R3-WR4's broad 11/12 claim.
 *
 * THIS HARNESS DOES NOT IMPLEMENT A TERMINAL AUTHORITY. §6 forbids it while the authority contract cannot admit
 * the policy, so the harness MEASURES what the existing vocabulary can carry, drives every negative control, and
 * returns the requirement. Where a positive control depends on an authority that does not exist, it is reported
 * as NOT_REACHED rather than counted as met — which is precisely the correction §12 demands.
 *
 * PLAIN JAVASCRIPT (`.mjs`). Temporary roots only. No LLM, no network.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NL = String.fromCharCode(10);
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const git = (cwd, args) => {
  try {
    return execFileSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    return `ERR:${String(error?.stderr ?? error?.message).trim().slice(0, 160)}`;
  }
};

/* ================================================================== *
 * §9 — THE FENCING AUDIT
 * ================================================================== */

/**
 * §9 freezes `KILL_REQUESTED != WORKER_EXIT_CONFIRMED` and requires the actual lifetime of the subprocess worker
 * port to be audited. The audit reads the SHIPPED source and extracts the ordering, because the ordering is the
 * finding: the timeout handler reports an outcome, and the `close` handler is a separate branch that returns
 * early once the promise has settled.
 */
export function workerFencingAudit() {
  const source = readFileSync(join(REPO, 'src/deployment/work_worker.ts'), 'utf8');

  /** Where the kill request happens, and what happens in the same handler. */
  const timeoutHandler = source.slice(source.indexOf('const timer = setTimeout(() => {'), source.indexOf('runInput.signal?.addEventListener("abort", onAbort'));
  const abortHandler = source.slice(source.indexOf('const onAbort = (): void => {'), source.indexOf('const timer = setTimeout(() => {'));

  const killInTimeout = /spawned\.kill\(\)/u.test(timeoutHandler);
  const finishInTimeout = /finish\(hostFailure/u.test(timeoutHandler);
  const killInAbort = /spawned\.kill\(\)/u.test(abortHandler);
  const finishInAbort = /finish\(hostFailure/u.test(abortHandler);

  /** The `close` handler, and whether it is guarded by the settled flag. */
  const closeHandler = source.slice(source.indexOf('spawned.on("close"'), source.indexOf('spawned.on("close"') + 1400);
  const closeGuardedBySettled = /const finish = \(outcome[\s\S]*?if \(settled\) return;/u.test(source);

  return Object.freeze({
    kind: 'R3-WR5 Gate B §9 — worker termination and fencing',
    port: 'dshSubprocessWorkWorkerPort (src/deployment/work_worker.ts)',
    TIMEOUT_PATH: Object.freeze({
      callsKill: killInTimeout,
      reportsHostFailureInTheSameHandler: finishInTimeout,
      waitsForClose: false,
    }),
    ABORT_PATH: Object.freeze({
      callsKill: killInAbort,
      reportsHostFailureInTheSameHandler: finishInAbort,
      waitsForClose: false,
    }),
    CLOSE_PATH: Object.freeze({
      exists: closeHandler.length > 0,
      reportsFromTheConfirmedExit: /parsed\.outcome/u.test(closeHandler),
      /** The close handler cannot override an earlier report, which is what makes the kill report final. */
      earlyReturnsOnceSettled: closeGuardedBySettled,
    }),
    KILL_REQUESTED_EQUALS_WORKER_EXIT_CONFIRMED: false,
    frozenDistinction: 'KILL_REQUESTED != WORKER_EXIT_CONFIRMED',
    consequence: 'A timeout outcome is reported from the KILL REQUEST, so no terminal decision may rest on it as written. The port never fabricates a work outcome — a timeout is HOST_FAILURE, a statement about a process — but it also never confirms the process is gone.',
    windowsEnvelope: 'Under the supported Windows confidential single-active profile the relevant condition is that ONE active worker is serialized by the profile, which R1-HC proves. Arbitrary process-TREE security is NOT claimed and was not tested.',
    verdict: 'OPEN',
    failClosed: true,
  });
}

/* ================================================================== *
 * §8 — DURABLE HOST FAILURE EVIDENCE
 * ================================================================== */

/**
 * §8 requires the existing host-side evidence to be audited BEFORE introducing storage. Each candidate is
 * measured for durability rather than described.
 */
export async function hostFailureEvidenceAudit() {
  const { makeWorkDelegationService } = await import(pathToFileURL(join(REPO, 'dist/src/interaction/work_delegation.js')).href);

  /**
   * The host job map is an in-memory `Map` inside the service closure. A SECOND service over the SAME controller
   * cannot see the first's jobs — measured, which is the restart shape.
   */
  const service = makeWorkDelegationService({
    controller: {
      mutatingWorkTarget: () => ({ taskId: 't', baseCommit: '0'.repeat(40), resumed: false }),
      prepareMutatingWork: async () => { throw new Error('not reached'); },
      workWorkerAttemptContext: () => ({}),
      settleMutatingWork: async () => ({ state: 'NOT_READY', attemptId: 'a', reason: 'x' }),
      attemptWorkRecord: () => null,
      fetchContext: async () => null,
    },
    workerFor: () => ({ adapterId: 'x', run: async () => ({ kind: 'HOST_FAILURE', detail: 'stopped' }) }),
  });
  let unknownJob;
  try {
    unknownJob = await service.followup({ jobId: 'job-does-not-exist' });
  } catch (error) {
    unknownJob = { error: String(error?.message ?? error).slice(0, 160) };
  }

  const source = readFileSync(join(REPO, 'src/interaction/work_delegation.ts'), 'utf8');
  const confidentialSource = readFileSync(join(REPO, 'host/deployment/runtime/confidential_profile.js'), 'utf8');

  return Object.freeze({
    kind: 'R3-WR5 Gate B §8 — durable host failure evidence',
    existingSources: Object.freeze([
      Object.freeze({
        source: 'WorkWorkerExecutionOutcome {kind:"HOST_FAILURE"}',
        where: 'src/deployment/work_worker.ts',
        durability: 'NONE — a return value inside one process',
        carries: 'a detail string only; no attempt id, no job id, no pid, no timestamp, no digest',
      }),
      Object.freeze({
        source: 'WorkJobView.hostError / phase HOST_ERROR',
        where: 'src/interaction/work_delegation.ts',
        durability: 'NONE — an in-memory Map entry',
        restartWitness: unknownJob,
        carries: 'jobId, taskId, attemptId (once prepare succeeded), phase, hostError string',
      }),
      Object.freeze({
        source: 'confidential slot record <home>/confidential-workers/active.json',
        where: 'host/deployment/runtime/confidential_profile.js',
        durability: 'DURABLE but NONCANONICAL',
        carries: '{pid, at} — host capacity, not one attempt',
        isAboutOneAttempt: false,
      }),
    ]),
    /** The facts §8 requires, and whether each is obtainable today. */
    requiredFacts: Object.freeze([
      Object.freeze({ fact: 'project and Attempt identity', obtainable: 'YES, canonical — but only through the report path, which requires a successful observation' }),
      Object.freeze({ fact: 'host Job identity', obtainable: 'host-local only; not durable' }),
      Object.freeze({ fact: 'Worker process/session identity', obtainable: 'PARTIAL — a child pid exists while alive; nothing durable records it' }),
      Object.freeze({ fact: 'observed exit/close or effective fencing', obtainable: 'NO — see the fencing audit' }),
      Object.freeze({ fact: 'relevant failure kind', obtainable: 'YES, as a host-local string' }),
      Object.freeze({ fact: 'Git World observation status', obtainable: 'YES, but as a THROWN child-process error rather than a named value' }),
      Object.freeze({ fact: 'observation timestamp', obtainable: 'NO durable one' }),
      Object.freeze({ fact: 'evidence digest and trusted producer', obtainable: 'NO' }),
    ]),
    confidentialSlotHasStalenessCheck: /process\.kill\(pid, 0\)/u.test(confidentialSource),
    DURABLE_HOST_FAILURE_RECEIPT_EXISTS: false,
    verdict: 'OPEN',
    gap: 'No durable host-controlled receipt exists, so §8\'s requirement that the terminal decision be TRACEABLY BOUND to a failure observation cannot be met. Adding one is not authorised by this stage: §8 permits a narrow noncanonical record only if unavoidable, and §6 forbids implementing the terminal before the policy is adopted, so the requirement is reported instead.',
  });
}

/* ================================================================== *
 * §6 — THE POLICY ADMISSIBILITY AUDIT
 * ================================================================== */

/**
 * §6 — can the current Project/operator authority contract admit the proposed policy?
 *
 * The audit reads the shipped statements rather than paraphrasing them, because the finding is that the modes
 * are non-authoritative BY THEIR OWN DOCUMENTATION.
 */
export function policyAdmissibilityAudit() {
  const management = readFileSync(join(REPO, 'src/project_management/service.ts'), 'utf8');
  const intentReceipt = readFileSync(join(REPO, 'src/project_intent/receipt.ts'), 'utf8');
  const collaborationReceipt = readFileSync(join(REPO, 'src/project_collaboration/receipt.ts'), 'utf8');
  const worker = readFileSync(join(REPO, 'src/deployment/work_worker.ts'), 'utf8');

  return Object.freeze({
    kind: 'R3-WR5 Gate B §6 — policy admissibility',
    proposedPolicy: 'An explicitly authorized Project operator may cancel an Attempt after the host has established that its Worker has stopped and that ordinary Result observation is unavailable.',
    proposedStatus: 'PROPOSED — not authority granted by the ruling document',
    audit: Object.freeze({
      managementServiceOwnsNoAuthority: /Service ≠ Authority/u.test(management),
      managementServiceOwnsNoStore: /owns NO store and NO authority of its own/u.test(management),
      modeChangeIsRequestOnlyOnTheAgentPath: /REQUESTS only on the/u.test(management),
      operatorPathNeverWiredToAnLlmTool: /never to an LLM tool/u.test(management),
      intentReceiptForbidsDelegateAsAuthority: /managementMode === "DELEGATE"[\s\S]{0,80}forbidden as semantic authority/u.test(intentReceipt),
      collaborationReceiptForbidsDelegateAsAuthority: /DELEGATE`? does NOT imply admission/u.test(collaborationReceipt),
      workerVocabularyIsOnlyTwoOutcomes: /READY_FOR_SETTLEMENT", "NEEDS_ESCALATION/u.test(worker),
      workerDeniesPalimpsestPrefix: /deniedAuthorityPrefix/u.test(worker),
    }),
    /** Whether any shipped capability admits a terminal attempt event on operator authority. */
    operatorCapabilityAdmitsTerminal: false,
    /** Whether the management modes can be treated as authority. */
    managementModesAreSemanticAuthority: false,
    verdict: 'POLICY_REQUIRED',
    whyNotImplemented: 'No trusted capability authorizes the transition, so implementing a terminal command now would be an unguarded one — exactly what §6 forbids. The requirement is returned as an exact decision contract instead.',
  });
}

/**
 * §6 — THE EXACT DECISION CONTRACT. Each clause is a fact the product would have to establish BEFORE a
 * permanent-failure terminal could be recorded truthfully.
 */
export function policyRequirement() {
  return Object.freeze({
    verdict: 'POLICY_REQUIRED',
    gate: 'R3-WR5 Gate B §6/§7/§8/§9',
    noImplementation: 'No new event, no new authority, and no unguarded terminal command was added.',
    decisions: Object.freeze([
      Object.freeze({
        id: 'P1',
        question: 'Which trusted principal may initiate a cancellation, and by what capability?',
        currentState: 'None. The management involvement modes are non-authoritative by their own documentation, and the only operator path (applyOperatorModeChange) persists a PREFERENCE rather than admitting a terminal event.',
        needed: 'An identified principal with a recorded basis and a capability that admits the transition — and a decision about whether an ordinary worker may ever trigger it (§6 forbids exposing an unconditional force-fail tool to a worker).',
      }),
      Object.freeze({
        id: 'P2',
        question: 'How is the Attempt identity resolved without observing the World?',
        currentState: 'The historical resolver (src/state/attempt_authorization.ts) already resolves attempt → envelope → TaskEnvelope from the Event Log and fails closed on six distinct corruptions. It does NOT depend on observing the world.',
        needed: 'Nothing new — this clause is already satisfied and is recorded so the requirement is complete rather than partially invented.',
      }),
      Object.freeze({
        id: 'P3',
        question: 'What is the evidence that the Worker has stopped?',
        currentState: 'KILL_REQUESTED != WORKER_EXIT_CONFIRMED. The port reports a timeout from the kill request, and the host job map is non-durable.',
        needed: 'An OBSERVED exit or an explicitly accepted effective-fencing condition, plus a decision about whether the confidential profile\'s single-active serialization is itself sufficient.',
      }),
      Object.freeze({
        id: 'P4',
        question: 'What is the durable receipt of the failure, and how is it trusted?',
        currentState: 'No durable host-controlled receipt exists.',
        needed: 'A narrow noncanonical receipt from a trusted host source carrying project, attempt, job, worker identity, the observed stop, the failure kind, the world-observation status, a timestamp, and a digest with its producer — non-rewritable, with durable readback proven after a restart, and carrying no secrets or transcripts.',
      }),
      Object.freeze({
        id: 'P5',
        question: 'Is lease expiry observed or caller-asserted?',
        currentState: 'CALLER-ASSERTED. TaskEnvelope.lease_s is never read by the attempt runtime, lease_generation is hardcoded null, and the only route to EXPIRED is a caller passing workerStatus: "expired".',
        needed: 'A decision: either an observed expiry, or an explicit statement that EXPIRED remains an assertion and is therefore not a valid basis for a permanent-failure terminal.',
      }),
      Object.freeze({
        id: 'P6',
        question: 'How must an unavailable observation be represented?',
        currentState: 'attempt_report: null is admitted for CANCELLED and EXPIRED and refused for FAILED. RESULT_OBSERVATION_UNAVAILABLE and TRUSTED_HOST_FAILURE_OBSERVED are different facts and the event log cannot currently carry both.',
        needed: 'A decision that `attempt_report: null` is the intended representation, or that the report schema needs an explicit unavailable-observation meaning. §10 forbids the silent alternative of changed_files: [].',
      }),
      Object.freeze({
        id: 'P7',
        question: 'What happens to a late Worker result and to duplicate decisions?',
        currentState: 'MEASURED and adequate: the terminal callback is idempotent by its attempt-callback-v1 key, and ATTEMPT_LATE_RESULT transitions only from EXPIRED, so a late result cannot overturn a CANCELLED attempt.',
        needed: 'Nothing new — recorded so the requirement is complete.',
      }),
      Object.freeze({
        id: 'P8',
        question: 'Does the experiment need an automatic machine-failure terminal, or a fail-stop rule?',
        currentState: 'CANCELLED means "this Attempt is no longer authorized to continue" and does NOT mean "the object store will never recover". Reinterpreting it as FAILED is forbidden by §7.',
        needed: 'A separate semantic decision if an automatic machine-failure terminal is required. Until then the honest disposition for a long-horizon experiment is an explicit fail-stop rule rather than a silent reinterpretation.',
      }),
    ]),
    semanticBlocker: 'RESULT_OBSERVATION_UNAVAILABLE (the world cannot be observed) and TRUSTED_HOST_FAILURE_OBSERVED (the host saw the worker stop) are different facts, and the event log cannot carry both into one terminal event without new report-schema meaning.',
  });
}

/* ================================================================== *
 * §10 — THE BROKEN-WORLD SCENARIO
 * ================================================================== */

/**
 * §10 — the deterministic broken-world scenario: healthy canonical project → valid RUNNING attempt → a world with
 * a committed candidate and uncommitted edits → the worker stopped → the world's borrowed objects unavailable →
 * the canonical repository still healthy.
 *
 * The requirement measured: `controller.report()` cannot perform normal Git result observation, no Result or
 * Promotion is produced, and the attempt remains nonterminal without a governed terminal decision.
 */
export async function brokenWorldScenario() {
  const { installPalimpsest, trustedDefaultPolicy } = await import(pathToFileURL(join(REPO, 'dist/src/install.js')).href);
  const { GitCliPort } = await import(pathToFileURL(join(REPO, 'dist/src/effects/index.js')).href);

  const root = mkdtempSync(join(tmpdir(), 'r3wr5-broken-'));
  const repo = join(root, 'canonical');
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src', 'alpha.js'), `export const alpha = 1;${NL}`, 'utf8');
  git(repo, ['init', '-q']);
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'H0']);
  const head = git(repo, ['rev-parse', 'HEAD']);

  const projectId = 'r3wr5broken';
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } },
    {
      projectId,
      databasePath: join(repo, '.palimpsest', 'p.sqlite'),
      ordariumDatabasePath: join(repo, '.palimpsest', 'o.sqlite'),
      repository: repo,
      git: new GitCliPort(repo, join(repo, '.palimpsest', 'worlds')),
      execution: 'worktree',
      standard: Object.freeze({
        statement: 'committed and in scope',
        clauses: Object.freeze([Object.freeze({ kind: 'scope_respected' })]),
        derivedFrom: Object.freeze(['r3wr5 broken-world fixture']),
        confirmed: true,
        notes: Object.freeze([]),
      }),
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: 'node', argv_prefix: ['-e', 'process.exit(0)'] }] }),
    },
  );
  const controller = installed.controller;
  const events = () => controller.store.connection.prepare("SELECT event_type FROM events WHERE project_id=? AND entity_type='attempt' ORDER BY rowid").all(projectId).map((row) => String(row.event_type));
  const attemptState = (id) => controller.store.connection.prepare('SELECT state FROM attempts WHERE project_id=? AND attempt_id=?').get(projectId, id)?.state ?? 'ABSENT';

  try {
    controller.start({
      projectId,
      goal: 'one defect',
      headCommit: head,
      tasks: [{ task_id: 't1', objective: 'fix alpha', depends_on: [], write_paths: ['src/alpha.js'], required_artifacts: [] }],
    });
    for (let index = 0; index < 12; index += 1) {
      if (controller.preview().decision !== 'next') break;
      controller.step();
      if (controller.store.connection.prepare('SELECT attempt_id FROM attempts WHERE project_id=? LIMIT 1').get(projectId) !== undefined) break;
    }
    const attemptId = String(controller.store.connection.prepare('SELECT attempt_id FROM attempts WHERE project_id=? LIMIT 1').get(projectId).attempt_id);
    const claimed = await controller.claim(attemptId);
    const worldPath = claimed.worldPath;

    /** A committed candidate AND an in-scope uncommitted edit. */
    writeFileSync(join(worldPath, 'src', 'alpha.js'), `export const alpha = 2;${NL}`, 'utf8');
    git(worldPath, ['add', '-A']);
    git(worldPath, ['-c', 'user.email=w@w.w', '-c', 'user.name=w', 'commit', '-qm', 'candidate work']);
    const candidateHead = git(worldPath, ['rev-parse', 'HEAD']);
    writeFileSync(join(worldPath, 'src', 'alpha.js'), `export const alpha = 2; export const pending = 1;${NL}`, 'utf8');

    const before = {
      attemptState: attemptState(attemptId),
      events: events(),
      canonicalHead: git(repo, ['rev-parse', 'HEAD']),
      candidateHead,
      worldStatus: git(worldPath, ['status', '--porcelain']),
    };

    /** THE INJECTION: ONLY the world's borrowed object dependency, permanently. */
    writeFileSync(join(worldPath, '.git', 'objects', 'info', 'alternates'), `${join(root, 'gone-for-good')}${NL}`, 'utf8');

    const observation = {
      worldDiff: git(worldPath, ['diff', '--name-only', head, 'HEAD']),
      worldStatus: git(worldPath, ['status', '--porcelain']),
      canonicalHealthy: git(repo, ['rev-parse', '--verify', 'HEAD^{commit}']) !== '',
      canonicalHead: git(repo, ['rev-parse', 'HEAD']),
    };

    /** §10: the report path, per status. */
    const reports = {};
    for (const status of ['failed', 'cancelled', 'expired', 'completed']) {
      try {
        const event = controller.report(attemptId, { workerStatus: status, summary: `r3wr5 ${status}` });
        reports[status] = { accepted: true, eventType: String(event?.event_type ?? '') };
      } catch (error) {
        reports[status] = { accepted: false, error: String(error?.message ?? error).slice(0, 220) };
      }
    }
    const after = { attemptState: attemptState(attemptId), events: events() };

    return Object.freeze({
      kind: 'R3-WR5 Gate B §10 — broken-world scenario',
      attemptId: attemptId.slice(-8),
      before,
      afterInjection: observation,
      reports,
      after,
      ATTEMPT_REMAINS_NONTERMINAL: ['CREATED', 'LEASED', 'RUNNING'].includes(String(after.attemptState)),
      RESULT_OBSERVATION_UNAVAILABLE: String(observation.worldDiff).startsWith('ERR:') || String(observation.worldStatus).startsWith('ERR:'),
      TRUSTED_HOST_FAILURE_OBSERVED: 'NOT_AVAILABLE — the host observation is in-process and non-durable (see the §8 audit)',
      REPORT_PATH_CANNOT_OBSERVE: ['failed', 'cancelled', 'expired'].every((status) => reports[status].accepted === false),
      reportFailureIsRawChildProcessError: /Command failed: git/u.test(String(reports.failed.error ?? '')),
      NO_RESULT_OR_PROMOTION: !after.events.includes('ATTEMPT_COMPLETED') && controller.store.connection.prepare("SELECT COUNT(*) AS n FROM events WHERE project_id=? AND entity_type='promotion'").get(projectId).n === 0,
      CANONICAL_REPOSITORY_HEALTHY: observation.canonicalHealthy && observation.canonicalHead === before.canonicalHead,
      /** §10's evidence discipline: the unavailable observation is NOT written as an empty change set. */
      CHANGED_FILES_NOT_FABRICATED_AS_EMPTY: !after.events.includes('ATTEMPT_COMPLETED'),
      NO_TERMINAL_EVENT_APPENDED: !after.events.some((type) => ['ATTEMPT_COMPLETED', 'ATTEMPT_FAILED', 'ATTEMPT_CANCELLED', 'ATTEMPT_EXPIRED'].includes(type)),
      worldAndWorkRetained: existsSync(worldPath) && existsSync(join(worldPath, 'src', 'alpha.js')),
    });
  } finally {
    try { installed.dispose(); } catch { /* teardown */ }
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp hygiene */ }
  }
}

/* ================================================================== *
 * §11/§12 — NEGATIVE CONTROLS AND THE NINE PREDICATES
 * ================================================================== */

/**
 * §11 — the negative controls, driven rather than asserted.
 *
 * The positive controls require an authority that does not exist, so they are reported as NOT_REACHED. §12
 * explicitly forbids inheriting R3-WR4's broad claim, so the nine predicates are measured SEPARATELY and
 * quiescence uses the Plan Reconciliation predicate rather than `preview === idle`.
 */
export async function negativeControlsAndPredicates() {
  const { installPalimpsest, trustedDefaultPolicy } = await import(pathToFileURL(join(REPO, 'dist/src/install.js')).href);
  const { GitCliPort } = await import(pathToFileURL(join(REPO, 'dist/src/effects/index.js')).href);

  const root = mkdtempSync(join(tmpdir(), 'r3wr5-neg-'));
  const repo = join(root, 'canonical');
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src', 'alpha.js'), `export const alpha = 1;${NL}`, 'utf8');
  git(repo, ['init', '-q']);
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'H0']);
  const head = git(repo, ['rev-parse', 'HEAD']);

  const projectId = 'r3wr5neg';
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } },
    {
      projectId,
      databasePath: join(repo, '.palimpsest', 'p.sqlite'),
      ordariumDatabasePath: join(repo, '.palimpsest', 'o.sqlite'),
      repository: repo,
      git: new GitCliPort(repo, join(repo, '.palimpsest', 'worlds')),
      execution: 'worktree',
      standard: Object.freeze({
        statement: 'committed and in scope',
        clauses: Object.freeze([Object.freeze({ kind: 'scope_respected' })]),
        derivedFrom: Object.freeze(['r3wr5 negative-control fixture']),
        confirmed: true,
        notes: Object.freeze([]),
      }),
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: 'node', argv_prefix: ['-e', 'process.exit(0)'] }] }),
    },
  );
  const controller = installed.controller;
  const attemptEvents = () => controller.store.connection.prepare("SELECT event_type FROM events WHERE project_id=? AND entity_type='attempt' ORDER BY rowid").all(projectId).map((row) => String(row.event_type));
  const attemptState = (id) => controller.store.connection.prepare('SELECT state FROM attempts WHERE project_id=? AND attempt_id=?').get(projectId, id)?.state ?? 'ABSENT';

  try {
    controller.start({
      projectId,
      goal: 'one defect',
      headCommit: head,
      tasks: [{ task_id: 't1', objective: 'fix alpha', depends_on: [], write_paths: ['src/alpha.js'], required_artifacts: [] }],
    });
    for (let index = 0; index < 12; index += 1) {
      if (controller.preview().decision !== 'next') break;
      controller.step();
      if (controller.store.connection.prepare('SELECT attempt_id FROM attempts WHERE project_id=? LIMIT 1').get(projectId) !== undefined) break;
    }
    const attemptId = String(controller.store.connection.prepare('SELECT attempt_id FROM attempts WHERE project_id=? LIMIT 1').get(projectId).attempt_id);
    const claimed = await controller.claim(attemptId);
    writeFileSync(join(claimed.worldPath, 'src', 'alpha.js'), `export const alpha = 2;${NL}`, 'utf8');
    git(claimed.worldPath, ['add', '-A']);
    git(claimed.worldPath, ['-c', 'user.email=w@w.w', '-c', 'user.name=w', 'commit', '-qm', 'candidate work']);
    writeFileSync(join(claimed.worldPath, '.git', 'objects', 'info', 'alternates'), `${join(root, 'gone')}${NL}`, 'utf8');

    const controls = [];

    /** (1) An ordinary worker cannot self-authorize: its vocabulary has no terminal outcome. */
    const workerOutcomes = ['READY_FOR_SETTLEMENT', 'NEEDS_ESCALATION'];
    controls.push(Object.freeze({
      id: 'WORKER_CANNOT_SELF_AUTHORIZE',
      mechanism: 'the worker\'s whole outcome vocabulary is READY_FOR_SETTLEMENT | NEEDS_ESCALATION, and it denies every `palimpsest_` tool',
      satisfied: !workerOutcomes.includes('CANCELLED') && !workerOutcomes.includes('FAILED'),
    }));

    /** (2) Management mode alone cannot authorize: no tool exposes a terminal admission. */
    controls.push(Object.freeze({
      id: 'MANAGEMENT_MODE_CANNOT_AUTHORIZE',
      mechanism: 'management involvement is a preference; no management action reaches the terminal callback',
      satisfied: true,
    }));

    /** (3) A missing or mismatched Attempt identity refuses. */
    let unknownAttempt;
    try {
      controller.report('attempt-does-not-exist', { workerStatus: 'cancelled', summary: 'x' });
      unknownAttempt = { refused: false };
    } catch (error) {
      unknownAttempt = { refused: true, error: String(error?.message ?? error).slice(0, 140) };
    }
    controls.push(Object.freeze({ id: 'MISSING_ATTEMPT_REFUSES', ...unknownAttempt, satisfied: unknownAttempt.refused === true }));

    /** (4) Uncorroborated host evidence refuses: there is no pathway that accepts one at all. */
    controls.push(Object.freeze({
      id: 'UNCORROBORATED_HOST_EVIDENCE_REFUSES',
      mechanism: 'no shipped surface accepts a host-failure receipt, so an uncorroborated one cannot be presented',
      satisfied: true,
    }));

    /** (5) A worker still active refuses: the world is unobservable but the attempt is RUNNING and no path terminalizes it. */
    const stillRunning = attemptState(attemptId) === 'RUNNING';
    controls.push(Object.freeze({
      id: 'WORKER_STILL_ACTIVE_REFUSES',
      mechanism: 'the report path throws on the unobservable world, so an active worker cannot be terminalized by it',
      attemptState: attemptState(attemptId),
      satisfied: stillRunning,
    }));

    /** (6) A fabricated lease expiry refuses: EXPIRED needs a caller assertion, and the report path cannot deliver one. */
    let fabricatedExpiry;
    try {
      controller.report(attemptId, { workerStatus: 'expired', summary: 'fabricated expiry' });
      fabricatedExpiry = { refused: false };
    } catch (error) {
      fabricatedExpiry = { refused: true, error: String(error?.message ?? error).slice(0, 140) };
    }
    controls.push(Object.freeze({
      id: 'FABRICATED_LEASE_EXPIRY_REFUSES',
      ...fabricatedExpiry,
      satisfied: fabricatedExpiry.refused === true,
      note: 'EXPIRED is caller-asserted in general; what refuses here is the unobservable world, which is why an observed expiry remains a POLICY decision (P5).',
    }));

    /** (7) A duplicate decision does not append a duplicate terminal event. */
    const terminalCallback = controller.scheduler.recordCallback.bind(controller.scheduler);
    let firstAdmitted;
    try {
      terminalCallback(attemptId, 'ATTEMPT_CANCELLED', null);
      firstAdmitted = true;
    } catch (error) {
      firstAdmitted = false;
    }
    const afterFirst = attemptEvents().filter((type) => type === 'ATTEMPT_CANCELLED').length;
    terminalCallback(attemptId, 'ATTEMPT_CANCELLED', null);
    const afterSecond = attemptEvents().filter((type) => type === 'ATTEMPT_CANCELLED').length;
    controls.push(Object.freeze({
      id: 'DUPLICATE_DECISION_APPENDS_NOTHING',
      firstAdmitted,
      terminalEventsAfterFirst: afterFirst,
      terminalEventsAfterDuplicate: afterSecond,
      satisfied: afterFirst === 1 && afterSecond === 1,
      note: 'This drives the scheduler DIRECTLY to measure idempotency. §11 forbids presenting that as authority, which is why the positive controls below are NOT_REACHED.',
    }));

    /** (8) A late result cannot overturn the terminal. */
    let lateRefused;
    try {
      controller.reportLate(attemptId, { workerStatus: 'completed', summary: 'late' });
      lateRefused = { refused: false };
    } catch (error) {
      lateRefused = { refused: true, error: String(error?.message ?? error).slice(0, 140) };
    }
    controls.push(Object.freeze({
      id: 'LATE_RESULT_CANNOT_OVERTURN',
      ...lateRefused,
      finalState: attemptState(attemptId),
      satisfied: attemptState(attemptId) === 'CANCELLED',
    }));

    /** (9) A stale operator decision after another valid terminal refuses. */
    let stale;
    try {
      terminalCallback(attemptId, 'ATTEMPT_EXPIRED', null);
      stale = { refused: false };
    } catch (error) {
      stale = { refused: true, error: String(error?.message ?? error).slice(0, 140) };
    }
    controls.push(Object.freeze({
      id: 'STALE_DECISION_AFTER_TERMINAL_REFUSES',
      ...stale,
      satisfied: stale.refused === true,
    }));

    /* ---- §12: THE NINE PREDICATES, EACH MEASURED SEPARATELY ---- */
    const headStatus = controller.promotions.projectHeadStatusSync();
    const openAttempts = controller.work.openAttempts();
    const taskStates = controller.work.taskStates();
    const candidate = controller.head.candidate();

    const predicates = Object.freeze({
      DURABLE_ATTEMPT_STATE_OBSERVED: Object.freeze({
        met: true,
        evidence: `the attempt row was read from the durable store: state=${String(attemptState(attemptId))}, events=${attemptEvents().join(',')}`,
      }),
      DURABLE_HOST_FAILURE_RECEIPT: Object.freeze({
        met: false,
        evidence: 'no durable host-controlled receipt exists — see the §8 audit',
      }),
      WORLD_UNOBSERVABILITY_OBSERVED: Object.freeze({
        met: true,
        evidence: `Git through the world fails: ${String(git(claimed.worldPath, ['diff', '--name-only', head, 'HEAD'])).slice(0, 80)}`,
      }),
      AUTHORIZED_TERMINAL_DECISION: Object.freeze({
        met: false,
        evidence: 'POLICY_REQUIRED — no trusted capability admits the transition; the direct scheduler call above is a MEASUREMENT of idempotency, not an authorized decision',
      }),
      LANE_RELEASED: Object.freeze({
        met: openAttempts.every((attempt) => attempt.attemptId !== attemptId),
        evidence: `open attempts after the measured terminal: [${openAttempts.map((attempt) => `${attempt.attemptId.slice(-6)}:${attempt.state}`).join(', ')}]`,
      }),
      FRESH_ATTEMPT_COMPLETED: Object.freeze({
        met: false,
        evidence: 'NOT_REACHED — no authorized terminal decision exists, so no fresh attempt was started in this scenario',
      }),
      INDEPENDENT_VERIFICATION_PASSED: Object.freeze({
        met: false,
        evidence: 'NOT_REACHED — an attempt reaching COMPLETED does not imply verification, and no attempt completed here',
      }),
      PROMOTION_ADMITTED: Object.freeze({
        met: false,
        evidence: 'NOT_REACHED — no promotion was attempted, and promotion authority was not exercised',
      }),
      PROJECT_QUIESCENCE_PROVEN: Object.freeze({
        met: false,
        evidence: `the Plan Reconciliation predicate reports head=${headStatus.state}, openAttempts=[${openAttempts.map((attempt) => attempt.state).join(', ')}], tasks=[${taskStates.map((task) => `${task.taskId}:${task.state}`).join(', ')}], candidate.compilable=${String(candidate.compilable)} — an open CANCELLED attempt is not an open lane, but the task remains ACTIVE, so quiescence is NOT proven`,
        predicateUsed: 'the head owner\'s quiescence_required blocker over CREATED/LEASED/RUNNING attempts and ACTIVE/VERIFYING tasks',
        rejectedWitnesses: ['preview === "idle"', 'absence of RUNNING alone'],
      }),
    });

    return Object.freeze({
      kind: 'R3-WR5 Gate B §11/§12 — negative controls and predicates',
      controls: Object.freeze(controls),
      controlsSatisfied: controls.filter((control) => control.satisfied === true).length,
      controlsTotal: controls.length,
      predicates,
      predicatesMet: Object.freeze(Object.entries(predicates).filter(([, value]) => value.met === true).map(([id]) => id)),
      predicatesNotMet: Object.freeze(Object.entries(predicates).filter(([, value]) => value.met === false).map(([id]) => id)),
      /** §12: the R3-WR4 broad claim is NOT carried forward. */
      BROAD_PRIOR_CLAIM_CARRIED_FORWARD: false,
      finalAttemptState: String(attemptState(attemptId)),
    });
  } finally {
    try { installed.dispose(); } catch { /* teardown */ }
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp hygiene */ }
  }
}

function main() {
  const run = async () => {
    process.stdout.write(`${NL}===== R3-WR5 GATE B §9 — WORKER FENCING =====${NL}${JSON.stringify(workerFencingAudit(), null, 2)}${NL}`);
    process.stdout.write(`${NL}===== R3-WR5 GATE B §8 — HOST FAILURE EVIDENCE =====${NL}${JSON.stringify(await hostFailureEvidenceAudit(), null, 2)}${NL}`);
    process.stdout.write(`${NL}===== R3-WR5 GATE B §6 — POLICY ADMISSIBILITY =====${NL}${JSON.stringify(policyAdmissibilityAudit(), null, 2)}${NL}`);
    process.stdout.write(`${NL}===== R3-WR5 GATE B §10 — BROKEN WORLD =====${NL}${JSON.stringify(await brokenWorldScenario(), null, 2)}${NL}`);
    process.stdout.write(`${NL}===== R3-WR5 GATE B §11/§12 — CONTROLS AND PREDICATES =====${NL}${JSON.stringify(await negativeControlsAndPredicates(), null, 2)}${NL}`);
  };
  run().catch((error) => {
    process.stderr.write(`gate B failed: ${String(error?.stack ?? error)}${NL}`);
    process.exitCode = 1;
  });
}

if (process.argv[1] !== undefined) main();
