/**
 * R3-S0 §"Work-loop end-to-end scenario"/§"Knowledge-loop"/§"Collaboration-loop"/§"Evolution-loop"
 * and §"Cross-loop closure scenarios" — THE LOOP CONFORMANCE HARNESS.
 *
 * Every scenario is DETERMINISTIC: no model is called, no benchmark is solved, and the task outcome is
 * irrelevant to the verdict. What is measured is whether the MECHANISM holds on each path.
 *
 * §"Loop conformance matrix": each loop produces a matrix over the six paths with cells
 * `PASS` / `FAIL` / `NOT_APPLICABLE` / `NOT_EXERCISED`. A load-bearing FAIL makes SYSTEM_VALID false, and a
 * load-bearing NOT_EXERCISED is reported as a gap rather than passed silently.
 *
 * §"Mechanism Witness" is used throughout: a scenario that reaches a durable consequence but cannot show the
 * chain says so, and the record distinguishes "the task succeeded" from "the mechanism was demonstrated".
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  LOOP_MATRIX_PLAN,
  MATRIX_CELLS,
  MECHANISM_WITNESS_CHAIN,
  PREREGISTERED_MUTATIONS,
  authorityBearingNodes,
} from './contract.mjs';
import { ADVERSARIAL_ATTEMPTS, SCRIPTED_WORKER_ACTIONS, adversarialWorker, acceptedAttempts, pulledBodyOf, scriptedWorker } from './actors.mjs';
import {
  REPO_ROOT,
  advanceToReady,
  closeTask,
  completionWorker,
  committingWorker,
  driveJob,
  freshRig,
  git,
  installOver,
  load,
  makeProject,
  restartInChildProcess,
  settleScheduler,
  sha256,
  standardFor,
  storePaths,
} from './rig.mjs';
import { makeEvidenceClosure, makeMechanismWitness, makeProjectBehaviorTrace } from './trace.mjs';

const NL = String.fromCharCode(10);

/** A matrix cell record. §"Loop conformance matrix": never collapsed into one score. */
const cell = (path, verdict, detail) => Object.freeze({ path, verdict, detail: String(detail).slice(0, 400) });

/** Build a matrix from a loop's plan and the observed cells. */
function matrixOf(loopId, observed) {
  const plan = LOOP_MATRIX_PLAN[loopId];
  const byPath = new Map(observed.map((entry) => [entry.path, entry]));
  const rows = [];
  for (const path of plan.applies) {
    const found = byPath.get(path);
    rows.push(found ?? cell(path, MATRIX_CELLS.NOT_EXERCISED, 'this path applies to the loop but the harness did not drive it'));
  }
  for (const entry of plan.notApplicable) {
    rows.push(cell(entry.path, MATRIX_CELLS.NOT_APPLICABLE, entry.reason));
  }
  const loadBearingFailures = rows.filter((row) => row.verdict === MATRIX_CELLS.FAIL).map((row) => `${row.path}: ${row.detail}`);
  const notExercised = rows.filter((row) => row.verdict === MATRIX_CELLS.NOT_EXERCISED).map((row) => row.path);
  return Object.freeze({
    loopId,
    name: plan.name,
    rows: Object.freeze(rows),
    loadBearingFailures: Object.freeze(loadBearingFailures),
    loadBearingNotExercised: Object.freeze(notExercised),
    green: loadBearingFailures.length === 0,
  });
}

/* ================================================================ WORK LOOP */

/**
 * §"Work-loop end-to-end scenario": Intent -> Work -> Attempt -> Result -> independent Verification ->
 * Promotion -> canonical project revision, over the accepted, rejected-verification, stale, duplicate/retry
 * and crash/restart paths.
 */
export async function workLoopScenario() {
  const rig = freshRig('work-loop');
  const repo = join(rig, 'repo');
  const head = makeProject(repo, { name: 'r3s0work' });
  const cells = [];
  const evidence = [];
  const delegation = await load('interaction/work_delegation.js');

  /**
   * §"Loop conformance matrix": each path runs its OWN project over its OWN durable stores.
   *
   * `controller.start` is idempotency-guarded per project, so a second `start` for the same project is refused
   * — correctly. Giving each path its own project and store directory is therefore not a convenience but the
   * honest way to drive six independent paths, and it keeps one path's history from being visible to another.
   */
  const perPath = (label) => {
    const dir = join(rig, `state-${label}`);
    mkdirSync(dir, { recursive: true });
    return Object.freeze({
      state: dir,
      orchestration: join(dir, 'orchestration.sqlite'),
      ordarium: join(dir, 'ordarium.sqlite'),
      coordination: join(dir, 'coordination.sqlite'),
      boundary: join(dir, 'boundary.sqlite'),
      association: join(dir, 'assoc.sqlite'),
      journal: join(dir, 'journal.sqlite'),
      proof: join(dir, 'proof.sqlite'),
      proofBlobs: join(dir, 'proof-blobs'),
      cells: join(dir, 'cells.sqlite'),
      procedures: join(dir, 'procedures.sqlite'),
    });
  };

  /**
   * §"Consumer-boundary law": the happy path is measured against CANONICAL STATE after the ORDINARY governed
   * path — mechanical gate, promotion, head reconciliation. The proof is not "the job finished": it is that the
   * attempt reached COMPLETED, the promotion was ELIGIBLE, a PROMOTION_COMMITTED fact exists, and the canonical
   * HEAD moved.
   */
  let happy = null;
  {
    const paths = perPath('happy');
    const project = 'r3s0work-happy';
    const gen = await installOver({ projectId: project, repo, paths });
    gen.controller.start({ projectId: project, goal: 'prove the Work loop', headCommit: head, tasks: [
      { task_id: 't1', objective: 'change src/a.js', depends_on: [], write_paths: ['src/a.js'], required_artifacts: [] },
    ] });
    const service = delegation.makeWorkDelegationService({
      controller: gen.controller,
      workerFor: () => committingWorker({ path: 'src/a.js', text: 'export const a = 2;' + NL }),
    });
    const target = advanceToReady(gen.controller) ?? 't1';
    const { view } = await driveJob(service, { start: { expectedTaskId: target } });
    const attemptId = 'attemptId' in view ? view.attemptId : null;
    const attemptRecord = attemptId === null ? null : gen.controller.attemptWorkRecord(attemptId);
    const closure = attemptId === null ? null : await closeTask(gen, attemptId);
    const canonicalHead = git(repo, ['rev-parse', 'HEAD']);
    const promotions = gen.controller.store.connection
      .prepare("SELECT COUNT(*) AS c FROM events WHERE project_id=? AND event_type='PROMOTION_COMMITTED'")
      .get(project).c;
    const tasks = gen.controller.work.taskStates();
    happy = Object.freeze({
      jobPhase: view.phase,
      attemptId,
      attemptState: attemptRecord?.state ?? null,
      eligible: closure?.eligibility?.eligible ?? null,
      promotionEvents: promotions,
      canonicalHead,
      baseHead: head,
      taskStates: tasks,
    });
    const moved = canonicalHead !== head;
    const attemptCompleted = attemptRecord?.state === 'COMPLETED';
    const promoted = closure?.promoted !== null && closure?.promoted !== undefined;
    cells.push(cell('happy', view.phase === 'FINISHED' && attemptCompleted && promoted && moved ? MATRIX_CELLS.PASS : MATRIX_CELLS.FAIL,
      `phase=${String(view.phase)} attempt=${String(attemptRecord?.state ?? 'none')} eligible=${String(closure?.eligibility?.eligible)} promoted=${String(promoted)} promotions=${String(promotions)} canonicalHeadMoved=${String(moved)} tasks=${tasks.map((task) => `${task.taskId}:${task.state}`).join(',')}`));
    evidence.push({ scenario: 'work/happy', canonicalState: sha256(JSON.stringify({ canonicalHead, tasks, attemptState: attemptRecord?.state ?? null, promotions })) });
    await gen.close();
  }

  /* ---- path: rejection — an attempt that fails its independent gate must NOT promote ---- */
  {
    const paths = perPath('rejection');
    const project = 'r3s0work-reject';
    const gen = await installOver({ projectId: project, repo, paths });
    /**
     * The write path `src/schema` is the DOCUMENTED hard trigger for a REQUIRED independent verification, so
     * this task cannot settle without one. Without that trigger the task would be eligible on its report alone,
     * and the rejection proof would be measuring nothing.
     */
    gen.controller.start({ projectId: project, goal: 'prove the Work loop', headCommit: git(repo, ['rev-parse', 'HEAD']), tasks: [
      { task_id: 't-reject', objective: 'change src/schema.js', depends_on: [], write_paths: ['src/schema.js'], required_artifacts: [] },
    ] });
    const service = delegation.makeWorkDelegationService({
      controller: gen.controller,
      workerFor: () => committingWorker({ path: 'src/schema.js', text: 'export const schema = 9;' + NL }),
    });
    const target = advanceToReady(gen.controller) ?? 't-reject';
    const { view } = await driveJob(service, { start: { expectedTaskId: target } });
    const attemptId = 'attemptId' in view ? view.attemptId : null;
    const headBefore = git(repo, ['rev-parse', 'HEAD']);
    /**
     * §"Mutation testing" M3: the independent gate REFUSES (a non-zero command). Promotion must therefore be
     * ineligible and canonical HEAD must not move. This is the load-bearing rejection proof.
     */
    const closure = attemptId === null ? null : await closeTask(gen, attemptId, { command: ['node', '-e', 'process.exit(1)'] });
    const promotions = gen.controller.store.connection
      .prepare("SELECT COUNT(*) AS c FROM events WHERE project_id=? AND event_type='PROMOTION_COMMITTED'")
      .get(project).c;
    const headAfter = git(repo, ['rev-parse', 'HEAD']);
    const refused = closure?.eligibility?.eligible === false && headAfter === headBefore && promotions === 0;
    cells.push(cell('rejection', refused ? MATRIX_CELLS.PASS : MATRIX_CELLS.FAIL,
      `gateEligible=${String(closure?.eligibility?.eligible)} reason=${String(closure?.eligibility?.reason ?? closure?.eligibility?.detail ?? 'n/a').slice(0, 80)} canonicalHeadMoved=${String(headAfter !== headBefore)} promotions=${String(promotions)}`));
    evidence.push({ scenario: 'work/rejection', canonicalState: sha256(JSON.stringify({ eligibility: closure?.eligibility ?? null, headBefore, headAfter, promotions })) });
    await gen.close();
  }

  /* ---- path: stale — a settlement against a moved head must not be accepted as current ---- */
  {
    const paths = perPath('stale');
    const project = 'r3s0work-stale';
    const gen = await installOver({ projectId: project, repo, paths });
    gen.controller.start({ projectId: project, goal: 'prove the Work loop', headCommit: git(repo, ['rev-parse', 'HEAD']), tasks: [
      { task_id: 't-stale', objective: 'change src/a.js', depends_on: [], write_paths: ['src/a.js'], required_artifacts: [] },
    ] });
    const prepared = await gen.controller.prepareMutatingWork({ expectedTaskId: 't-stale' });
    /** Move canonical HEAD underneath the attempt, which is exactly the stale condition. */
    writeFileSync(join(repo, 'MOVED.md'), 'moved' + NL, 'utf8');
    git(repo, ['add', '-A']);
    git(repo, ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'moved underneath']);
    /** The worker commits in its world; the settlement must notice that the base drifted. */
    writeFileSync(join(prepared.worldPath, 'src', 'a.js'), 'export const a = 3;' + NL, 'utf8');
    git(prepared.worldPath, ['add', '-A']);
    git(prepared.worldPath, ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'stale work']);
    const settlement = await gen.controller.settleMutatingWork({ attemptId: prepared.attemptId, workerOutcome: { kind: 'READY_FOR_SETTLEMENT' } })
      .then((value) => JSON.stringify(value))
      .catch((error) => `THREW ${String(error?.message ?? error)}`);
    /** §"Mutation testing" M4: a stale result must NOT be silently accepted as current. */
    const refusedOrContinued = /BASE_DRIFT|NOT_READY|stale|drift|refus|conflict/iu.test(settlement);
    cells.push(cell('stale', refusedOrContinued ? MATRIX_CELLS.PASS : MATRIX_CELLS.FAIL, `settlement=${settlement.slice(0, 240)}`));
    evidence.push({ scenario: 'work/stale', canonicalState: sha256(settlement) });
    await gen.close();
  }

  /* ---- path: crash / reconciliation — an attempt left RUNNING by a dead host ---- */
  {
    const paths = perPath('crash');
    const project = 'r3s0work-crash';
    const gen = await installOver({ projectId: project, repo, paths });
    gen.controller.start({ projectId: project, goal: 'prove the Work loop', headCommit: git(repo, ['rev-parse', 'HEAD']), tasks: [
      { task_id: 't-crash', objective: 'change src/a.js', depends_on: [], write_paths: ['src/a.js'], required_artifacts: [] },
    ] });
    const prepared = await gen.controller.prepareMutatingWork({ expectedTaskId: 't-crash' });
    /**
     * The host "dies" here: the attempt is prepared and RUNNING, and nothing settles it. The transport's own
     * contract says the orphaned execution stays canonically UNRESOLVED — not failed, not auto-resumed.
     */
    const beforeClose = gen.controller.attemptWorkRecord(prepared.attemptId)?.state ?? null;
    await gen.close();
    const child = await restartInChildProcess({ rig, paths, projectId: project, repo, operations: [{ kind: 'TASK_STATES' }, { kind: 'WORK_PROJECT_TASKS' }] });
    const taskStates = child.report.findings.find((finding) => finding.operation.kind === 'TASK_STATES')?.value ?? [];
    const crashTask = Array.isArray(taskStates) ? taskStates.find((entry) => entry.taskId === 't-crash') : null;
    /** The orphaned execution must not be fabricated into a settled state, and the restart must be a new process. */
    const notFabricated = crashTask === undefined || crashTask.state !== 'SATISFIED';
    cells.push(cell('crash', notFabricated && child.report.pid !== process.pid && beforeClose === 'RUNNING' ? MATRIX_CELLS.PASS : MATRIX_CELLS.FAIL,
      `beforeClose=${String(beforeClose)} afterRestartTaskState=${String(crashTask?.state ?? 'absent')} childPid=${String(child.report.pid)}`));
    evidence.push({ scenario: 'work/crash', canonicalState: sha256(JSON.stringify({ beforeClose, taskStates })) });
  }

  /* ---- path: cold restart — a DIFFERENT process reads only durable truth ---- */
  {
    const paths = perPath('coldrestart');
    const project = 'r3s0work-cold';
    const gen = await installOver({ projectId: project, repo, paths });
    gen.controller.start({ projectId: project, goal: 'survive a process boundary', headCommit: git(repo, ['rev-parse', 'HEAD']), tasks: [
      { task_id: 't1', objective: 'change src/a.js', depends_on: [], write_paths: ['src/a.js'], required_artifacts: [] },
    ] });
    const service = delegation.makeWorkDelegationService({
      controller: gen.controller,
      workerFor: () => committingWorker({ path: 'src/a.js', text: 'export const a = 7;' + NL }),
    });
    const target = advanceToReady(gen.controller) ?? 't1';
    const { view } = await driveJob(service, { start: { expectedTaskId: target } });
    if ('attemptId' in view && view.attemptId !== null) await closeTask(gen, view.attemptId);
    const headBeforeRestart = git(repo, ['rev-parse', 'HEAD']);
    await gen.close();
    const child = await restartInChildProcess({ rig, paths, projectId: project, repo, operations: [{ kind: 'GOAL' }, { kind: 'PROJECT_REVISION' }, { kind: 'TASK_STATES' }] });
    const goal = child.report.findings.find((finding) => finding.operation.kind === 'GOAL');
    const revision = child.report.findings.find((finding) => finding.operation.kind === 'PROJECT_REVISION');
    const taskStates = child.report.findings.find((finding) => finding.operation.kind === 'TASK_STATES');
    /** §"Cold-restart discipline": a DIFFERENT process, reading only durable truth. */
    const realBoundary = child.report.pid !== process.pid;
    const readSucceeded = goal?.ok === true && revision?.ok === true && taskStates?.ok === true;
    cells.push(cell('coldRestart', realBoundary && readSucceeded ? MATRIX_CELLS.PASS : MATRIX_CELLS.FAIL,
      `childPid=${String(child.report.pid)} parentPid=${String(process.pid)} differentProcess=${String(realBoundary)} goal=${JSON.stringify(goal?.value)} revision=${JSON.stringify(revision?.value)} headBeforeRestart=${headBeforeRestart.slice(0, 8)}`));
    evidence.push({ scenario: 'work/coldRestart', canonicalState: sha256(JSON.stringify(child.report)) });
  }

  /* ---- path: next-generation consumption — a LATER attempt under the same project ---- */
  {
    const paths = perPath('nextgen');
    const project = 'r3s0work-nextgen';
    const gen = await installOver({ projectId: project, repo, paths });
    /**
     * Both tasks are declared in ONE canonical plan, because a STRUCTURAL revision requires quiescence: the
     * controller refuses `plan` while any task is ACTIVE. So generation N+1's work is declared up front and
     * driven as a SECOND attempt, which is exactly the property being measured — a later attempt consuming the
     * canonical state its predecessor left behind.
     */
    gen.controller.start({ projectId: project, goal: 'prove the Work loop', headCommit: git(repo, ['rev-parse', 'HEAD']), tasks: [
      { task_id: 't1', objective: 'change src/a.js', depends_on: [], write_paths: ['src/a.js'], required_artifacts: [] },
      { task_id: 't2', objective: 'change src/a.js again', depends_on: ['t1'], write_paths: ['src/a.js'], required_artifacts: [] },
    ] });
    /**
     * The SECOND attempt must make a DIFFERENT edit, or its commit is empty and `git commit` fails — the world
     * is created from the head the first promotion produced, so re-writing identical bytes is not a change.
     * A per-attempt counter is the honest way to script two distinct generations.
     */
    let generation = 0;
    const service = delegation.makeWorkDelegationService({
      controller: gen.controller,
      workerFor: () => {
        generation += 1;
        return committingWorker({ path: 'src/a.js', text: `export const a = ${String(4 + generation)};${NL}` });
      },
    });
    const firstTarget = advanceToReady(gen.controller) ?? 't1';
    const first = await driveJob(service, { start: { expectedTaskId: firstTarget } });
    if ('attemptId' in first.view && first.view.attemptId !== null) await closeTask(gen, first.view.attemptId);
    const headAfterFirst = git(repo, ['rev-parse', 'HEAD']);
    /** Generation N+1 reads the task list back out of CANONICAL state; nothing is carried in memory. */
    /** After the promotion moved HEAD, the dependent task must be re-authorized before it can be delegated. */
    const secondTarget = settleScheduler(gen.controller) ?? 't2';
    const tasksBeforeSecond = gen.controller.work.taskStates();
    const second = await driveJob(service, { start: { expectedTaskId: secondTarget } });
    if ('attemptId' in second.view && second.view.attemptId !== null) await closeTask(gen, second.view.attemptId);
    const headAfterSecond = git(repo, ['rev-parse', 'HEAD']);
    const t2Attempt = 'attemptId' in second.view ? gen.controller.attemptWorkRecord(second.view.attemptId) : null;
    const promotedSecond = headAfterSecond !== headAfterFirst;
    cells.push(cell('nextGeneration',
      first.view.phase === 'FINISHED' && second.view.phase === 'FINISHED' && headAfterFirst !== head && promotedSecond && t2Attempt?.state === 'COMPLETED' ? MATRIX_CELLS.PASS : MATRIX_CELLS.FAIL,
      `first=${String(first.view.phase)} firstTarget=${String(firstTarget)} headAfterFirstMoved=${String(headAfterFirst !== head)} second=${String(second.view.phase)} secondTarget=${String(secondTarget)} secondAttempt=${String(t2Attempt?.state ?? 'none')} headAfterSecondMoved=${String(promotedSecond)}`));
    evidence.push({ scenario: 'work/nextGeneration', canonicalState: sha256(JSON.stringify({ tasksBeforeSecond, headAfterFirst, headAfterSecond })) });
    await gen.close();
  }

  return Object.freeze({
    loopId: 'WORK',
    matrix: matrixOf('WORK', cells),
    cells: Object.freeze(cells),
    happy,
    evidence: Object.freeze(evidence),
  });
}

/* ================================================================ KNOWLEDGE LOOP */

/**
 * §"Knowledge-loop end-to-end scenario": candidate -> admission -> durable capital -> project association ->
 * process exit -> cold restart -> future attempt selection -> actual consumer-visible handle -> governed pull
 * -> current owner materialization.
 *
 * §"Knowledge-loop" requires the ACTUAL PACKAGED DSH/runtime consumer boundary for the final presentation/pull
 * segment, and a deterministic/scripted worker for the primary conformance proof. Both are honoured: the
 * scripted worker observes the consumer boundary the runtime composes, and a separate runtime scenario drives
 * the real subprocess port.
 */
export async function knowledgeLoopScenario() {
  const rig = freshRig('knowledge-loop');
  const repo = join(rig, 'repo');
  const head = makeProject(repo, { name: 'r3s0know' });
  const paths = storePaths(rig);
  const project = 'r3s0know';
  const cells = [];
  const evidence = [];
  const delegation = await load('interaction/work_delegation.js');

  /* ---- generation 1: candidate -> admission -> durable capital -> association ---- */
  const gen1 = await installOver({ projectId: project, repo, paths });
  const proofModule = await load('proof_asset/index.js');
  const { installed } = gen1;
  installed.controller.start({ projectId: project, goal: 'prove the Knowledge loop', headCommit: head, tasks: [
    { task_id: 'k1', objective: 'change src/a.js', depends_on: [], write_paths: ['src/a.js'], required_artifacts: [] },
  ] });

  const imported = await installed.proof.importSource({
    bytes: new TextEncoder().encode('the retry ceiling is three; beyond it the caller must escalate'),
    mediaType: 'text/plain',
    label: 'retry-ceiling',
    provenance: 'LOCAL_IMPORT',
    sourceId: 'retry-ceiling',
  });
  const revisionRef = proofModule.materializeProofSourceRevisionRef({ sourceId: 'retry-ceiling', revision: imported.revision.revision, contentDigest: imported.revision.contentDigest });
  const recorded = await installed.proof.recordEvidence({ sourceRevision: revisionRef, selector: { kind: 'WHOLE_SOURCE' } });
  const candidate = await installed.proof.prepareCandidate({
    claimType: proofModule.PROOF_STATEMENT_TYPE,
    content: { statement: 'retry ceiling is three' },
    supportingEvidenceIds: [recorded.evidenceId],
    origin: 'MANUAL',
  });
  await installed.proof.verify({ candidateId: candidate.candidateId });
  const published = await installed.proof.decidePublication({ candidateId: candidate.candidateId });
  const claimId = published.claimId;

  /** The ASSOCIATION is what makes the capital eligible; omitting it is mutation M5. */
  const association = await installed.projectWorkspace.associateAsset({
    projectId: project,
    assetKind: 'PROOF_CLAIM',
    canonicalRef: { kind: 'PROOF_CLAIM', id: claimId },
    associationKind: 'MANUAL',
    provenance: 'r3s0',
  });

  const durableBeforeExit = Object.freeze({
    claimId,
    candidateId: candidate.candidateId,
    associationId: association.associationId ?? association.digest ?? null,
    canonicalHead: git(repo, ['rev-parse', 'HEAD']),
  });
  await gen1.close();

  /* ---- cold restart: a DIFFERENT process re-resolves the durable references ---- */
  const child = await restartInChildProcess({
    rig, paths, projectId: project, repo,
    operations: [{ kind: 'PROOF_CLAIM', claimId }, { kind: 'ASSET_ASSOCIATIONS' }],
  });
  const claimFinding = child.report.findings.find((finding) => finding.operation.kind === 'PROOF_CLAIM');
  const associationFinding = child.report.findings.find((finding) => finding.operation.kind === 'ASSET_ASSOCIATIONS');
  const claimAfterRestart = claimFinding?.value ?? null;
  const associationsAfterRestart = Array.isArray(associationFinding?.value) ? associationFinding.value : [];
  /**
   * §"Consumer-boundary law": the association is the durable fact that makes the capital selectable, so the
   * proof is that the SAME claim id is present in the association stream read by the CHILD process.
   */
  const associationSurvived = associationsAfterRestart.some((entry) => (entry.canonicalRef?.id ?? entry.canonical_ref?.id ?? entry.canonicalRefId) === claimId)
    || JSON.stringify(associationsAfterRestart).includes(claimId);
  const differentProcess = child.report.pid !== process.pid;
  cells.push(cell('coldRestart', differentProcess && claimFinding?.ok === true && associationSurvived ? MATRIX_CELLS.PASS : MATRIX_CELLS.FAIL,
    `childPid=${String(child.report.pid)} claimResolved=${String(claimFinding?.ok)} associationSurvived=${String(associationSurvived)}`));
  evidence.push({ scenario: 'knowledge/coldRestart', canonicalState: sha256(JSON.stringify({ claimAfterRestart, associationsAfterRestart })) });

  /* ---- generation 2: selection -> consumer-visible handle -> governed pull ---- */
  const gen2 = await installOver({ projectId: project, repo, paths });
  let scriptedObservation = null;
  {
    const service = delegation.makeWorkDelegationService({
      controller: gen2.controller,
      workerFor: () => scriptedWorker({
        adapterId: 'r3s0-knowledge-scripted',
        /**
         * §"Deterministic workers": the canonical form — `if visible handle X exists -> call governed pull(X)`.
         * The handle string is derived from the owner's own convention, and the worker does NOT search for it.
         */
        script: [
          { action: SCRIPTED_WORKER_ACTIONS.PULL_VISIBLE_HANDLE, handle: `@ctx/proof/${claimId}` },
          { action: SCRIPTED_WORKER_ACTIONS.ASSERT_HANDLE_ABSENT, handle: '@ctx/proof/never-admitted' },
        ],
        onObservation: (observation) => { scriptedObservation = observation; },
      }),
    });
    const { view } = await driveJob(service, {
      start: { expectedTaskId: 'k1', knowledge: { proof: [{ claimId }] } },
    });
    const visible = scriptedObservation?.visibleHandles ?? [];
    const handleAtBoundary = visible.includes(`@ctx/proof/${claimId}`);
    const pulled = (scriptedObservation?.pulls ?? []).find((entry) => entry.handle === `@ctx/proof/${claimId}`);
    const body = pulledBodyOf(pulled?.response);
    const bodyResolved = body !== null && body !== undefined && JSON.stringify(body).length > 2;
    const bootClean = !(scriptedObservation?.visibleBootKinds ?? []).includes('proof');
    const absentRefused = (scriptedObservation?.failures ?? []).length === 0;

    cells.push(cell('happy', handleAtBoundary && bodyResolved && bootClean && absentRefused ? MATRIX_CELLS.PASS : MATRIX_CELLS.FAIL,
      `phase=${String(view.phase)} handleAtBoundary=${String(handleAtBoundary)} bodyResolved=${String(bodyResolved)} bootClean=${String(bootClean)} failures=${(scriptedObservation?.failures ?? []).join(',') || 'none'}`));
    evidence.push({ scenario: 'knowledge/happy', canonicalState: sha256(JSON.stringify({ visible, body: body ?? null })) });
  }

  /* ---- paths: rejection and stale, each on its OWN project and attempt ----
   *
   * A manifest is compiled ONCE per attempt and cached, so re-preparing a task whose attempt already exists
   * returns the SAME compiled context. That is correct behaviour and it makes attempt reuse the wrong
   * instrument for these two paths: each needs a genuinely fresh compile. Giving each its own project is the
   * honest way to get one, and it keeps the happy path's selection from masking a refusal.
   */
  const seededProject = async (label, claimIdToSeed) => {
    const dir = join(rig, `state-${label}`);
    mkdirSync(dir, { recursive: true });
    const paths = Object.freeze({
      state: dir,
      orchestration: join(dir, 'orchestration.sqlite'),
      ordarium: join(dir, 'ordarium.sqlite'),
      coordination: join(dir, 'coordination.sqlite'),
      boundary: join(dir, 'boundary.sqlite'),
      association: join(dir, 'assoc.sqlite'),
      journal: join(dir, 'journal.sqlite'),
      proof: join(dir, 'proof.sqlite'),
      proofBlobs: join(dir, 'proof-blobs'),
      cells: join(dir, 'cells.sqlite'),
      procedures: join(dir, 'procedures.sqlite'),
    });
    const projectId = `r3s0know-${label}`;
    const gen = await installOver({ projectId, repo, paths });
    gen.controller.start({ projectId, goal: 'prove the Knowledge loop', headCommit: git(repo, ['rev-parse', 'HEAD']), tasks: [
      { task_id: 'k1', objective: 'change src/a.js', depends_on: [], write_paths: ['src/a.js'], required_artifacts: [] },
    ] });
    /** Seed ONE admitted, associated claim so the project has a legitimate selection available. */
    const importedLocal = await gen.installed.proof.importSource({
      bytes: new TextEncoder().encode(`basis for ${label}`), mediaType: 'text/plain', label: `${label}-basis`, provenance: 'LOCAL_IMPORT', sourceId: `${label}-basis`,
    });
    const refLocal = proofModule.materializeProofSourceRevisionRef({ sourceId: `${label}-basis`, revision: importedLocal.revision.revision, contentDigest: importedLocal.revision.contentDigest });
    const evidenceLocal = await gen.installed.proof.recordEvidence({ sourceRevision: refLocal, selector: { kind: 'WHOLE_SOURCE' } });
    const candidateLocal = await gen.installed.proof.prepareCandidate({
      claimType: proofModule.PROOF_STATEMENT_TYPE, content: { statement: `${label} basis` }, supportingEvidenceIds: [evidenceLocal.evidenceId], origin: 'MANUAL',
    });
    await gen.installed.proof.verify({ candidateId: candidateLocal.candidateId });
    const publishedLocal = await gen.installed.proof.decidePublication({ candidateId: candidateLocal.candidateId });
    await gen.installed.projectWorkspace.associateAsset({
      projectId, assetKind: 'PROOF_CLAIM', canonicalRef: { kind: 'PROOF_CLAIM', id: publishedLocal.claimId }, associationKind: 'MANUAL', provenance: 'r3s0',
    });
    return Object.freeze({ gen, projectId, paths, goodClaimId: publishedLocal.claimId, wanted: claimIdToSeed });
  };

  /* ---- path: rejection (an asset that was never ADMITTED cannot be selected) ---- */
  {
    const seeded = await seededProject('reject', 'pc-never-admitted');
    const attempt = await seeded.gen.controller.prepareMutatingWork({ expectedTaskId: 'k1' }).catch(() => null);
    let refused = false;
    let detail = 'no attempt could be prepared';
    if (attempt !== null) {
      try {
        await seeded.gen.controller.workWorkerAttemptContext(attempt.attemptId, { knowledge: { proof: [{ claimId: seeded.wanted }] } });
        detail = 'the compile ACCEPTED an unadmitted claim';
      } catch (error) {
        const message = String(error?.message ?? error);
        refused = /KNOWLEDGE_NOT_PROJECT_ASSOCIATED|not associated|NOT_ADMITTED|ineligible|KNOWLEDGE_NOT_FOUND/iu.test(message);
        detail = message.slice(0, 220);
      }
    }
    /**
     * The positive control: the SAME project's admitted-and-associated claim compiles cleanly, so the refusal
     * above is attributable to the missing association rather than to the project being unable to select at all.
     */
    let positiveControl = null;
    if (attempt !== null) {
      const fresh = await seeded.gen.controller.prepareMutatingWork({ expectedTaskId: 'k1' }).catch(() => null);
      if (fresh !== null) {
        try {
          const compiled = await seeded.gen.controller.workWorkerAttemptContext(fresh.attemptId, { knowledge: { proof: [{ claimId: seeded.goodClaimId }] } });
          positiveControl = (compiled.compiled?.handles ?? []).length > 0;
        } catch (error) {
          positiveControl = `REFUSED: ${String(error?.message ?? error).slice(0, 120)}`;
        }
      }
    }
    cells.push(cell('rejection', refused && positiveControl === true ? MATRIX_CELLS.PASS : MATRIX_CELLS.FAIL,
      `refused=${String(refused)} positiveControl=${JSON.stringify(positiveControl)} detail=${detail}`));
    evidence.push({ scenario: 'knowledge/rejection', canonicalState: sha256(JSON.stringify({ refused, positiveControl, detail })) });
    await seeded.gen.close();
  }

  /* ---- path: stale (a later admission change must not rewrite the historical binding) ---- */
  {
    const seeded = await seededProject('stale', null);
    const attempt = await seeded.gen.controller.prepareMutatingWork({ expectedTaskId: 'k1' }).catch(() => null);
    let verdict = MATRIX_CELLS.NOT_EXERCISED;
    let detail = 'no attempt could be prepared';
    if (attempt !== null) {
      try {
        await seeded.gen.controller.workWorkerAttemptContext(attempt.attemptId, { knowledge: { proof: [{ claimId: seeded.goodClaimId }] } });
        const handle = `@ctx/proof/${seeded.goodClaimId}`;
        const first = await seeded.gen.controller.fetchContext(attempt.attemptId, handle);
        const bindingAtCompile = first?.binding?.standing_at_compile ?? first?.binding?.standingAtCompile ?? null;
        /**
         * §"Consumer-boundary law": the historical binding is immutable. Re-reading the SAME handle must return
         * the SAME compile-time standing, so a later admission change cannot rewrite what the attempt was told.
         */
        const second = await seeded.gen.controller.fetchContext(attempt.attemptId, handle);
        const bindingAgain = second?.binding?.standing_at_compile ?? second?.binding?.standingAtCompile ?? null;
        const immutable = bindingAtCompile !== null && JSON.stringify(bindingAtCompile) === JSON.stringify(bindingAgain);
        detail = `standingAtCompile=${JSON.stringify(bindingAtCompile)} stable=${String(immutable)}`;
        verdict = immutable ? MATRIX_CELLS.PASS : MATRIX_CELLS.FAIL;
      } catch (error) {
        detail = String(error?.message ?? error).slice(0, 200);
        verdict = MATRIX_CELLS.FAIL;
      }
    }
    cells.push(cell('stale', verdict, detail));
    evidence.push({ scenario: 'knowledge/stale', canonicalState: sha256(detail) });
    await seeded.gen.close();
  }

  /* ---- path: next generation (a LATER attempt consumes the same durable capital) ---- */
  {
    const service = delegation.makeWorkDelegationService({
      controller: gen2.controller,
      workerFor: () => scriptedWorker({ adapterId: 'r3s0-knowledge-nextgen', script: [{ action: SCRIPTED_WORKER_ACTIONS.PULL_VISIBLE_HANDLE, handle: `@ctx/proof/${claimId}` }] }),
    });
    const { view } = await driveJob(service, { start: { expectedTaskId: 'k1', knowledge: { proof: [{ claimId }] } } });
    cells.push(cell('nextGeneration', view.phase === 'FINISHED' ? MATRIX_CELLS.PASS : MATRIX_CELLS.FAIL, `phase=${String(view.phase)}`));
    evidence.push({ scenario: 'knowledge/nextGeneration', canonicalState: sha256(String(view.phase)) });
  }

  await gen2.close();

  /* ---- the Mechanism Witness for the consumer-boundary segment ---- */
  const witness = makeMechanismWitness({
    mechanism: 'CONTEXT_DELIVERY',
    taskOutcome: 'TASK_SUCCESS',
    steps: {
      canonical_precondition: `the proof claim ${claimId} was admitted and associated with ${project}`,
      runtime_projection: 'the Context owner compiled the selection into the attempt manifest',
      actual_consumer_visible_state: scriptedObservation === null ? null : `the consumer saw ${String((scriptedObservation.visibleHandles ?? []).length)} handle(s), including @ctx/proof/${claimId}`,
      allowed_action_or_tool: 'palimpsest_worker_context_pull',
      authorized_owner_interaction: 'controller.fetchContext bound to the prepared attempt',
      durable_consequence: durableBeforeExit.claimId === claimId ? 'the claim and its association survived the process boundary' : null,
    },
  });

  return Object.freeze({
    loopId: 'KNOWLEDGE',
    matrix: matrixOf('KNOWLEDGE', cells),
    cells: Object.freeze(cells),
    durableBeforeExit,
    claimAfterRestart,
    witness,
    evidence: Object.freeze(evidence),
  });
}

/* ================================================================ COLLABORATION LOOP */

/**
 * §"Collaboration-loop end-to-end scenario": local reality/dependency -> Need -> authority -> Commitment ->
 * sovereign remote Work reference -> Fulfillment -> explicit local adoption -> subsequent local Work.
 *
 * §"Collaboration-loop" requires two mechanical proofs:
 *   · `remote Work ownership does not become local Work ownership`
 *   · `Fulfillment without Adoption does not change local canonical project truth`
 */
export async function collaborationLoopScenario() {
  const rig = freshRig('collaboration-loop');
  const repoA = join(rig, 'repo-a');
  const repoB = join(rig, 'repo-b');
  const headA = makeProject(repoA, { name: 'r3s0collaba' });
  const headB = makeProject(repoB, { name: 'r3s0collabb' });
  const paths = storePaths(rig);
  const projectA = 'r3s0collaba';
  const projectB = 'r3s0collabb';
  const cells = [];
  const evidence = [];

  const federationModule = await load('federation/index.js');
  const coordinationModule = await load('coordination/index.js');
  const boundaryModule = await load('boundary_memory/index.js');
  const workspaceModule = await load('project_workspace/index.js');

  const peerA = federationModule.materializePeerRef({ peerId: 'peer-a' });
  const peerB = federationModule.materializePeerRef({ peerId: 'peer-b' });

  /** One shared federation coordination store, two SEPARATE Work ledgers — the shape the loop requires. */
  const coordinationStore = new coordinationModule.SqliteCoordinationStore(paths.coordination);
  const boundaryStore = new boundaryModule.SqliteBoundaryMemoryStore(paths.boundary);

  const needScript = { decision: 'ADMIT', outcome: 'proposal' };
  const install = async (input) => await installOver({
    projectId: input.projectId,
    repo: input.repo,
    paths: input.paths ?? paths,
    localPeer: input.peer,
    coordinationStore,
    boundaryMemoryStore: boundaryStore,
    extra: {
      peerTransportPort: federationModule.callbackPeerTransportPort('r3s0', {
        onSend: async () => ({ transportMessageId: 't', delivered: true }),
        onWake: async () => ({ signaled: true }),
      }),
      peerDirectoryPort: {
        observePeers: async () => ({ state: 'known', value: [federationModule.materializePeerAdvertisement({ peer: peerB, competenceTags: ['calibration'] })] }),
      },
      attemptCatalog: { assertAdmissibleAttempt: async () => {} },
      /**
       * The authoring seam is the UNTRUSTED proposer: it may only suggest tags and a reason, and its `origin`
       * is recorded. The admission seam is the INDEPENDENT authority: it decides, and it must echo the
       * candidate digest it decided on so a later reader can tell which candidate the decision bound to.
       */
      projectCollaborationAuthoring: {
        origin: 'r3s0-author',
        async propose({ ground }) {
          if (needScript.outcome === 'NO_NEED') return { outcome: 'NO_NEED' };
          if (needScript.outcome === 'UNRESOLVED') return { outcome: 'UNRESOLVED' };
          return {
            outcome: 'proposal',
            competenceTags: ['calibration'],
            reason: `grounded in ${ground.kind} ${ground.taskId ?? ground.attemptId}`,
          };
        },
      },
      projectCollaborationAdmission: {
        policyRef: { policyId: 'r3s0-need-authority', version: 'v1' },
        async decide({ candidate }) {
          return {
            decision: needScript.decision,
            candidateDigest: candidate.digest,
            policyRef: { policyId: 'r3s0-need-authority', version: 'v1' },
            provenanceDigest: 'b'.repeat(64),
            detail: `the r3s0 need authority returned ${needScript.decision}`,
          };
        },
      },
    },
  });

  /* ---- local reality -> Need -> authority ---- */
  const a1 = await install({ projectId: projectA, repo: repoA, peer: peerA });
  a1.controller.start({ projectId: projectA, goal: 'prove the Collaboration loop', headCommit: headA, tasks: [
    { task_id: 'dep', objective: 'unmet dependency', depends_on: [], write_paths: ['src/dep.js'], required_artifacts: [] },
    { task_id: 't1', objective: 'calibrate the sensor', depends_on: ['dep'], write_paths: ['src/a.js'], required_artifacts: [] },
  ] });
  const collaboration = a1.installed.projectCollaboration;
  const preparedNeed = await collaboration.prepare({ ground: { kind: 'BLOCKED_TASK', taskId: 't1' } });

  /** The authority REJECTS first, then ADMITS: §"Evolution" style authority separation, applied to needs. */
  needScript.decision = 'REJECT';
  const rejected = await collaboration.admit({ candidate: preparedNeed.candidate });
  needScript.decision = 'ADMIT';
  const admitted = await collaboration.admit({ candidate: preparedNeed.candidate });
  const needId = admitted.contactNeedId;

  cells.push(cell('rejection', rejected.status === 'rejected' ? MATRIX_CELLS.PASS : MATRIX_CELLS.FAIL,
    `rejectedStatus=${String(rejected.status)} admittedStatus=${String(admitted.status)}`));
  evidence.push({ scenario: 'collaboration/rejection', canonicalState: sha256(JSON.stringify({ rejectedStatus: rejected.status, admittedStatus: admitted.status })) });

  /* ---- cold restart IN A CHILD PROCESS, then commitment ---- */
  await a1.close();
  /**
   * §"Cold-restart discipline": the restart is a REAL OS process boundary. The child re-attaches to the same
   * coordination history BY PATH and re-resolves the need itself; nothing from the parent's memory is passed.
   */
  const restartChild = await restartInChildProcess({
    rig, paths, projectId: projectA, repo: repoA, localPeer: peerA,
    operations: [{ kind: 'CONTACT_NEED', needId }],
  });
  const childPid = restartChild.report.pid;
  const differentProcess = childPid !== process.pid;
  const needFinding = restartChild.report.findings.find((finding) => finding.operation.kind === 'CONTACT_NEED');
  const needAfterRestart = needFinding?.ok === true && needFinding.value !== null && needFinding.value !== undefined;

  const a2 = await install({ projectId: projectA, repo: repoA, peer: peerA });
  /** The read returns a VIEW that wraps the durable need; the federation calls take the need itself. */
  const recoveredView = await a2.installed.federation.contactNeed(needId);
  const recovered = recoveredView?.need ?? null;
  await a2.installed.federation.requestContact({ need: recovered, to: peerB });
  const offer = await a2.installed.federation.offerCommitmentForNeed({ contactNeedId: needId, proposedHolder: peerB, statement: 'deliver the calibration statement' });
  await a2.installed.federation.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: peerB });
  const commitment = await a2.installed.federation.commitmentState(offer.commitmentId);

  cells.push(cell('coldRestart', needAfterRestart && commitment?.state === 'ACTIVE' ? MATRIX_CELLS.PASS : MATRIX_CELLS.FAIL,
    `childPid=${String(childPid)} parentPid=${String(process.pid)} differentProcess=${String(differentProcess)} needAfterRestart=${String(needAfterRestart)} commitmentState=${String(commitment?.state)}`));
  evidence.push({ scenario: 'collaboration/coldRestart', canonicalState: sha256(JSON.stringify({ needId, commitmentState: commitment?.state ?? null })) });

  /* ---- sovereign remote Work: B's OWN ledger ---- */
  const b1 = await install({ projectId: projectB, repo: repoB, peer: peerB });
  b1.controller.start({ projectId: projectB, goal: 'fulfil the request', headCommit: headB, tasks: [
    { task_id: 'bt1', objective: 'measure the gain', depends_on: [], write_paths: ['src/b.js'], required_artifacts: [] },
  ] });
  const preparedB = await b1.controller.prepareMutatingWork({ expectedTaskId: 'bt1' });
  writeFileSync(join(preparedB.worldPath, 'src', 'b.js'), 'export const b = 42;' + NL, 'utf8');
  git(preparedB.worldPath, ['add', '-A']);
  git(preparedB.worldPath, ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'remote work']);
  const resultCommitB = git(preparedB.worldPath, ['rev-parse', 'HEAD']);
  b1.controller.report(preparedB.attemptId, {
    workerStatus: 'completed',
    summary: 'measured the gain',
    changedFiles: ['src/b.js'],
    producedArtifacts: ['src/b.js'],
    resultCommit: resultCommitB,
  });
  const attemptB = b1.controller.attemptWorkRecord(preparedB.attemptId);

  /* ---- the mechanical proof: remote Work did NOT become local Work ---- */
  const aTasks = a2.installed.controller.work.taskStates();
  const aSeesB = aTasks.some((task) => task.taskId === 'bt1');
  const bTasks = b1.controller.work.taskStates();
  const bHasBt1 = bTasks.some((task) => task.taskId === 'bt1');
  cells.push(cell('happy', bHasBt1 && attemptB?.state === 'COMPLETED' && !aSeesB ? MATRIX_CELLS.PASS : MATRIX_CELLS.FAIL,
    `B_ownTask=${String(bHasBt1)} B_attempt=${String(attemptB?.state)} A_seesB_task=${String(aSeesB)}`));
  evidence.push({ scenario: 'collaboration/sovereignty', canonicalState: sha256(JSON.stringify({ aTasks, bTasks, attemptB: attemptB?.state ?? null })) });

  /* ---- accepted shared artifact, then Fulfillment ---- */
  const boundaryService = boundaryModule.makeBoundaryMemoryService({ store: boundaryStore, localPeer: peerA });
  await boundaryService.openWorkspace({ workspaceId: 'ws-cal', participants: [peerA, peerB], purpose: 'calibration' });
  await boundaryService.createArtifact({ workspaceId: 'ws-cal', artifactId: 'art-gain', type: { typeId: 'boundary.statement', version: 'v1' }, title: 'gain' });
  const candidateRevision = await boundaryService.proposeRevision({
    workspaceId: 'ws-cal', artifactId: 'art-gain', base: null,
    content: { statement: `the calibrated gain is 42 (from commit ${resultCommitB.slice(0, 8)})`, tags: ['decision'], references: [] },
    requiredAcceptors: [peerA, peerB], intent: 'share the measured gain',
  });
  await boundaryService.acceptRevision({ workspaceId: 'ws-cal', artifactId: 'art-gain', candidateDigest: candidateRevision.digest, authenticatedPeer: peerA, local: true });
  await boundaryService.acceptRevision({ workspaceId: 'ws-cal', artifactId: 'art-gain', candidateDigest: candidateRevision.digest, authenticatedPeer: peerB });
  const acceptedState = await boundaryService.currentAccepted({ workspaceId: 'ws-cal', artifactId: 'art-gain' });
  const acceptedRef = acceptedState.ref;

  /** §"Consumer-boundary law": local canonical truth is snapshotted BEFORE the fulfillment. */
  const irBefore = JSON.stringify(a2.installed.controller.work.project());
  const submission = await a2.installed.federation.submitFulfillment({
    commitmentId: offer.commitmentId,
    outputs: [{ kind: 'boundary_revision', revision: acceptedRef }],
    note: 'delivered',
    authenticatedPeer: peerB,
  });
  /**
   * The install composes no fulfillment authority, so the first decision is UNRESOLVED. A second service over
   * the same coordination store supplies one — that is how the gate proves the authority is independent.
   */
  const noAuthority = await a2.installed.federation.decideFulfillment({ commitmentId: offer.commitmentId, submissionDigest: submission.digest });
  /**
   * The durable contact-need scope guard lives in the federation SERVICE module rather than the barrel, so it
   * is loaded from its own path. It is what refuses a commitment scope that no durable need declared.
   */
  const federationServiceModule = await load('federation/federation_service.js');
  const fulfillmentService = federationModule.makeCommitmentService({
    store: coordinationStore,
    localPeer: peerA,
    allocateCommitmentId: () => 'unused',
    allocateHandoffId: () => 'unused',
    /** §"Collaboration-loop": the scope guard replays the durable need rather than trusting the caller. */
    contactNeedScopeGuard: federationServiceModule.durableContactNeedScopeGuard(coordinationStore),
    /**
     * The fulfillment output admission must VERIFY the accepted revision against the boundary owner. A stub
     * that returned `true` would make the output check vacuous, so the real owner does the admitting.
     */
    fulfillmentOutputs: {
      async admitAcceptedRevision(ref) {
        const boundary = boundaryModule.makeBoundaryMemoryService({ store: boundaryStore, localPeer: peerA });
        await boundary.admitBoundaryRevisionScope(ref);
      },
    },
    fulfillmentAdmission: {
      policyRef: { policyId: 'r3s0-fulfillment-authority', version: 'v1' },
      /**
       * The authority must echo the SUBMISSION DIGEST it decided on. The owner refuses a decision whose digest
       * does not match the submission, which is what binds a decision to the exact delivery it authorized.
       */
      async decide({ submission }) {
        return {
          decision: 'ADMIT',
          submissionDigest: submission.digest,
          policyRef: { policyId: 'r3s0-fulfillment-authority', version: 'v1' },
          provenanceDigest: 'c'.repeat(64),
          detail: 'the r3s0 fulfillment authority ADMITTED',
        };
      },
    },
  });
  await fulfillmentService.decideFulfillment({ commitmentId: offer.commitmentId, submissionDigest: submission.digest });
  const fulfilled = await a2.installed.federation.fulfillment(offer.commitmentId);
  const irAfterFulfillment = JSON.stringify(a2.installed.controller.work.project());

  /**
   * §"Collaboration-loop": Fulfillment WITHOUT Adoption must not change local canonical truth. This is the
   * load-bearing proof, measured before any adoption act so a later comparison cannot conflate the two.
   */
  const fulfillmentOnlyDidNotMutate = irAfterFulfillment === irBefore;
  cells.push(cell('stale', fulfillmentOnlyDidNotMutate ? MATRIX_CELLS.PASS : MATRIX_CELLS.FAIL,
    `unresolvedFirst=${String(noAuthority?.fulfilled === false || noAuthority?.status !== 'FULFILLED')} fulfillment=${String(fulfilled?.state ?? fulfilled?.fulfilled ?? 'present')} localTruthUnchanged=${String(fulfillmentOnlyDidNotMutate)}`));
  evidence.push({ scenario: 'collaboration/fulfillment', canonicalState: sha256(JSON.stringify({ irBefore, irAfterFulfillment, noAuthority })) });

  /* ---- explicit local adoption, then subsequent local Work ---- */
  const journal = await a2.installed.projectWorkspace.recordJournalEntry({
    projectId: projectA,
    kind: 'OPPORTUNITY',
    title: 'apply the measured gain',
    body: 'the peer measured a gain of 42',
    provenance: 'r3s0',
    relatedRefs: [{ kind: 'commitment_fulfillment', id: offer.commitmentId }],
  });
  const promoted = await a2.installed.projectWorkspace.promoteOpportunity({
    projectId: projectA,
    entryId: journal.entryId,
    taskSpec: { task_id: 't-apply', objective: 'apply the gain', depends_on: [], write_paths: ['src/a.js'], required_artifacts: [] },
  });
  const tasksAfter = a2.installed.controller.work.taskStates();
  const localContinuationExists = tasksAfter.some((task) => task.taskId === 't-apply');
  const stillNoRemoteTask = !tasksAfter.some((task) => task.taskId === 'bt1');
  cells.push(cell('nextGeneration', localContinuationExists && stillNoRemoteTask ? MATRIX_CELLS.PASS : MATRIX_CELLS.FAIL,
    `promoted=${JSON.stringify(promoted).slice(0, 120)} localTask=${String(localContinuationExists)} remoteTaskAbsent=${String(stillNoRemoteTask)}`));
  evidence.push({ scenario: 'collaboration/adoption', canonicalState: sha256(JSON.stringify({ journal, promoted, tasksAfter })) });

  const witness = makeMechanismWitness({
    mechanism: 'ADOPTION',
    taskOutcome: 'TASK_SUCCESS',
    steps: {
      canonical_precondition: `the commitment ${offer.commitmentId} was ACTIVE and the need ${needId} was declared`,
      runtime_projection: 'the fulfillment submission carried the accepted boundary revision',
      actual_consumer_visible_state: fulfillmentOnlyDidNotMutate ? 'local canonical truth was byte-identical before and after the fulfillment' : null,
      allowed_action_or_tool: 'projectWorkspace.recordJournalEntry then promoteOpportunity',
      authorized_owner_interaction: 'the local project owner authored the task; the remote peer authored none',
      durable_consequence: localContinuationExists ? `the local task t-apply exists in ${projectA}'s own ledger` : null,
    },
  });

  await a2.close();
  await b1.close();
  return Object.freeze({
    loopId: 'COLLABORATION',
    matrix: matrixOf('COLLABORATION', cells),
    cells: Object.freeze(cells),
    needId,
    commitmentId: offer.commitmentId,
    witness,
    evidence: Object.freeze(evidence),
  });
}

/* ================================================================ EVOLUTION LOOP */

/**
 * §"Evolution-loop end-to-end scenario": basis -> proposal -> independent authority decision -> durable
 * revision receipt -> process restart -> future Work inherits revised intent/organization/runtime state.
 * Also: a REJECTED proposal does not alter future Work.
 */
export async function evolutionLoopScenario() {
  const rig = freshRig('evolution-loop');
  const repo = join(rig, 'repo');
  const head = makeProject(repo, { name: 'r3s0evo' });
  const paths = storePaths(rig);
  const project = 'r3s0evo';
  const cells = [];
  const evidence = [];
  const delegation = await load('interaction/work_delegation.js');
  const proofModule = await load('proof_asset/index.js');

  const authorityScript = { decision: 'ADMIT' };
  const install = async (withAuthority) => await installOver({
    projectId: project, repo, paths,
    extra: withAuthority
      ? {
        projectIntentAdmission: {
          policyRef: { policyId: 'r3s0-intent-authority', version: 'v1' },
          /**
           * The authority must name the EXACT proposal digest it decided on, so a decision cannot be replayed
           * against a different proposal. This is the intent plane's version of the binding the collaboration
           * plane enforces on submissions.
           */
          async decide({ proposal }) {
            return {
              decision: authorityScript.decision,
              proposalDigest: proposal.digest,
              policyRef: { policyId: 'r3s0-intent-authority', version: 'v1' },
              provenanceDigest: 'd'.repeat(64),
              detail: `the r3s0 intent authority returned ${authorityScript.decision}`,
            };
          },
        },
      }
      : {},
  });

  const countRevisions = (controller) => controller.store.connection
    .prepare("SELECT COUNT(*) AS c FROM events WHERE project_id=? AND event_type='PROJECT_REVISED'")
    .get(project).c;

  /* ---- generation 1: the OLD intent, plus a basis ---- */
  const gen1 = await install(true);
  gen1.controller.start({
    projectId: project, goal: 'keep the service fast', headCommit: head,
    requirements: [{ requirement_id: 'R', statement: 'latency <= 10 ms', priority: 'critical', acceptance_refs: [] }],
    tasks: [{ task_id: 't1', objective: 'meet the 10 ms bound', depends_on: [], write_paths: ['src/a.js'], required_artifacts: [] }],
  });

  const imported = await gen1.installed.proof.importSource({
    bytes: new TextEncoder().encode('the measured p99 latency is 18 ms'),
    mediaType: 'text/plain', label: 'latency-measurement', provenance: 'LOCAL_IMPORT', sourceId: 'latency-measurement',
  });
  const revisionRef = proofModule.materializeProofSourceRevisionRef({ sourceId: 'latency-measurement', revision: imported.revision.revision, contentDigest: imported.revision.contentDigest });
  const recorded = await gen1.installed.proof.recordEvidence({ sourceRevision: revisionRef, selector: { kind: 'WHOLE_SOURCE' } });
  const candidate = await gen1.installed.proof.prepareCandidate({
    claimType: proofModule.PROOF_STATEMENT_TYPE,
    content: { statement: 'p99 latency is 18 ms, above the 10 ms bound' },
    supportingEvidenceIds: [recorded.evidenceId], origin: 'MANUAL',
  });
  await gen1.installed.proof.verify({ candidateId: candidate.candidateId });
  const published = await gen1.installed.proof.decidePublication({ candidateId: candidate.candidateId });
  const claimId = published.claimId;
  await gen1.installed.projectWorkspace.associateAsset({
    projectId: project, assetKind: 'PROOF_CLAIM', canonicalRef: { kind: 'PROOF_CLAIM', id: claimId }, associationKind: 'MANUAL', provenance: 'r3s0',
  });
  const negative = await gen1.installed.projectWorkspace.recordJournalEntry({
    projectId: project, kind: 'NEGATIVE_RESULT', title: 'the 10 ms bound was not met', body: 'measured 18 ms', provenance: 'r3s0',
  });

  const prepared = await gen1.installed.intent.prepare({
    changes: [{ kind: 'REQUIREMENT_REVISE', requirement: { requirement_id: 'R', statement: 'latency <= 20 ms', priority: 'critical', acceptance_refs: [] } }],
    grounds: { proof: [{ claimId }], negativeResults: [{ entryId: negative.entryId }] },
    rationale: 'the measured p99 is 18 ms, so the 10 ms bound is not achievable in this cycle',
  });

  /* ---- independent authority: REJECT, then UNRESOLVED, then no authority at all ---- */
  const revisionsBefore = countRevisions(gen1.controller);
  authorityScript.decision = 'REJECT';
  const refusedByReject = await gen1.installed.intent.apply({ proposal: prepared.proposal });
  authorityScript.decision = 'UNRESOLVED';
  const refusedUnresolved = await gen1.installed.intent.apply({ proposal: prepared.proposal });
  const revisionsAfterRefusals = countRevisions(gen1.controller);
  /**
   * §"Evolution-loop": a REJECTED proposal must not alter future Work. Zero PROJECT_REVISED events means the
   * project IR is byte-identical, so no later attempt can observe a change.
   */
  const rejectedChangedNothing = revisionsAfterRefusals === revisionsBefore;
  cells.push(cell('rejection', refusedByReject.status === 'rejected' && rejectedChangedNothing ? MATRIX_CELLS.PASS : MATRIX_CELLS.FAIL,
    `rejectStatus=${String(refusedByReject.status)} unresolvedStatus=${String(refusedUnresolved.status)} revisionsBefore=${String(revisionsBefore)} after=${String(revisionsAfterRefusals)}`));
  evidence.push({ scenario: 'evolution/rejection', canonicalState: sha256(JSON.stringify({ refusedByReject, refusedUnresolved, revisionsBefore, revisionsAfterRefusals })) });

  const noAuthorityInstall = await install(false);
  const noAuthority = await noAuthorityInstall.installed.intent.apply({ proposal: prepared.proposal });
  cells.push(cell('stale', noAuthority.status === 'authority_unresolved' ? MATRIX_CELLS.PASS : MATRIX_CELLS.FAIL,
    `absentAuthorityStatus=${String(noAuthority.status)} (an absent authority must mean UNRESOLVED, never approval)`));
  evidence.push({ scenario: 'evolution/absentAuthority', canonicalState: sha256(JSON.stringify(noAuthority)) });
  await noAuthorityInstall.close();

  /* ---- path: happy — apply through the EXISTING revision path ---- */
  authorityScript.decision = 'ADMIT';
  const applied = await gen1.installed.intent.apply({ proposal: prepared.proposal });
  const requirementAtApply = gen1.controller.work.project().requirements.find((entry) => entry.requirement_id === 'R')?.statement ?? null;
  const receipt = (() => {
    const row = gen1.controller.store.connection
      .prepare("SELECT payload_json FROM events WHERE project_id=? AND event_type='PROJECT_REVISED' ORDER BY event_id DESC LIMIT 1")
      .get(project);
    if (row === undefined) return null;
    return JSON.parse(new TextDecoder().decode(row.payload_json)).intent_reconciliation ?? null;
  })();
  /**
   * §"Consumer-boundary law": the happy path is proven from CANONICAL STATE — the revision actually committed,
   * the receipt carried on it, and the requirement statement the project now holds. An `APPLIED` status alone
   * would be a producer-side claim.
   */
  const appliedMovedCanonical = applied.status === 'APPLIED'
    && receipt !== null && receipt !== undefined
    && String(requirementAtApply).includes('20 ms')
    && countRevisions(gen1.controller) === revisionsBefore + 1;
  cells.push(cell('happy', appliedMovedCanonical ? MATRIX_CELLS.PASS : MATRIX_CELLS.FAIL,
    `status=${String(applied.status)} revision=${String(applied.revision ?? 'n/a')} receiptPresent=${String(receipt !== null && receipt !== undefined)} requirementNow=${JSON.stringify(requirementAtApply)} revisions=${String(countRevisions(gen1.controller))} (was ${String(revisionsBefore)})`));
  evidence.push({ scenario: 'evolution/happy', canonicalState: sha256(JSON.stringify({ applied, receipt, requirementAtApply })) });

  await gen1.close();

  /* ---- cold restart: a DIFFERENT process reads the revised intent and its receipt ---- */
  const child = await restartInChildProcess({
    rig, paths, projectId: project, repo,
    operations: [{ kind: 'REQUIREMENTS' }, { kind: 'INTENT_RECEIPT' }, { kind: 'PROJECT_REVISION' }],
  });
  const requirementsFinding = child.report.findings.find((finding) => finding.operation.kind === 'REQUIREMENTS');
  const receiptFinding = child.report.findings.find((finding) => finding.operation.kind === 'INTENT_RECEIPT');
  const requirementsAfterRestart = Array.isArray(requirementsFinding?.value) ? requirementsFinding.value : [];
  const receiptSurvived = receiptFinding?.ok === true && receiptFinding.value !== null && receiptFinding.value !== undefined;
  const revisedSurvived = requirementsAfterRestart.some((statement) => String(statement).includes('20 ms'));
  const differentProcess = child.report.pid !== process.pid;
  cells.push(cell('coldRestart', differentProcess && revisedSurvived && receiptSurvived ? MATRIX_CELLS.PASS : MATRIX_CELLS.FAIL,
    `childPid=${String(child.report.pid)} revisedIntentSurvived=${String(revisedSurvived)} receiptSurvived=${String(receiptSurvived)} requirements=${JSON.stringify(requirementsAfterRestart)}`));
  evidence.push({ scenario: 'evolution/coldRestart', canonicalState: sha256(JSON.stringify(child.report)) });

  /* ---- future Work actually inherits the revised intent ---- */
  const gen2 = await install(true);
  let deliveredRequirements = [];
  {
    /**
     * §"Evolution-loop": ORDINARY planning authors the replacement Work under the revised intent — the
     * evolution path never creates tasks itself. The revision moved the project, so the original task is no
     * longer the scheduler's next decision; a fresh task is what generation N+1 actually runs.
     */
    const current = gen2.controller.work.project();
    gen2.controller.plan({
      goal: current.goal,
      requirements: current.requirements,
      decisions: current.decisions,
      tasks: [
        ...current.tasks.map((task) => ({ ...task, depends_on: [...task.depends_on], write_paths: [...task.write_paths], required_artifacts: [...task.required_artifacts] })),
        { task_id: 't2', objective: 'meet the revised 20 ms bound', depends_on: [], write_paths: ['src/a.js'], required_artifacts: [] },
      ],
      reason: 'ordinary next plan under the revised intent',
    });
    const service = delegation.makeWorkDelegationService({ controller: gen2.controller, workerFor: () => completionWorker() });
    const target = advanceToReady(gen2.controller) ?? 't2';
    const { view } = await driveJob(service, { start: { expectedTaskId: target, knowledge: { proof: [{ claimId }] } } });
    /** §"Consumer-boundary law": the proof is the requirements the LATER attempt actually received. */
    const project_ = gen2.controller.work.project();
    deliveredRequirements = project_.requirements.map((entry) => entry.statement);
    const inherited = deliveredRequirements.some((statement) => String(statement).includes('20 ms'));
    cells.push(cell('nextGeneration', inherited && view.phase === 'FINISHED' ? MATRIX_CELLS.PASS : MATRIX_CELLS.FAIL,
      `phase=${String(view.phase)} requirements=${JSON.stringify(deliveredRequirements)}`));
    evidence.push({ scenario: 'evolution/nextGeneration', canonicalState: sha256(JSON.stringify(deliveredRequirements)) });
  }

  const witness = makeMechanismWitness({
    mechanism: 'INTENT_EVOLUTION',
    taskOutcome: 'TASK_SUCCESS',
    steps: {
      canonical_precondition: `the project carried requirement R = "latency <= 10 ms" and the basis ${claimId} was admitted`,
      runtime_projection: 'the intent service prepared a proposal and the independent authority ADMITTED it',
      actual_consumer_visible_state: deliveredRequirements.some((statement) => String(statement).includes('20 ms')) ? `a later attempt received ${JSON.stringify(deliveredRequirements)}` : null,
      allowed_action_or_tool: 'controller.planReconciled through the existing revision path',
      authorized_owner_interaction: 'the authority port decided; the intent owner wrote; the Work owner read',
      durable_consequence: receiptSurvived ? 'the accepted reconciliation receipt survived the process boundary on PROJECT_REVISED' : null,
    },
  });

  await gen2.close();
  return Object.freeze({
    loopId: 'EVOLUTION',
    matrix: matrixOf('EVOLUTION', cells),
    cells: Object.freeze(cells),
    claimId,
    receipt,
    witness,
    evidence: Object.freeze(evidence),
  });
}
