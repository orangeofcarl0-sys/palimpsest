/**
 * R3-S0 §"Loop conformance matrix" — THE SHARED DETERMINISTIC RIG.
 *
 * Every loop scenario needs the same three things: a real packaged install over PATH-BASED durable stores, a
 * real git project, and a way to make a COLD RESTART that is a genuine process boundary. This module supplies
 * them once so the scenarios contain the mechanism rather than the plumbing.
 *
 * §"Cold-restart discipline" is the reason `restart()` exists in the shape it does. The existing gates perform
 * a cold restart by disposing an installation and composing a new one IN THE SAME PROCESS. That is a real
 * store boundary — nothing in memory crosses — but it is not a real PROCESS boundary, and the ruling says:
 *
 *     No JS object, model transcript, session-local id or in-memory cache from generation N may be required by
 *     generation N+1. Durable references must be re-resolved from canonical/project-owned truth.
 *
 * So this rig's restart is a CHILD NODE PROCESS. Generation N+1 runs in a different OS process, reads only the
 * durable paths, and returns what it found. If a scenario needed anything from generation N's memory, the
 * child would not have it and the scenario would fail — which is the property being proven.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { gateRepoRoot, gateRoot } from '../gates/env.mjs';

export const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
export const DIST = join(REPO_ROOT, 'dist', 'src');
const NL = String.fromCharCode(10);

/** The rig root, inside the user profile so the WRITE_DAC host constraint is respected. */
export function rigRoot(name) {
  return join(gateRoot(), 'r3s0', name);
}

/** A unique run directory per invocation, so a stale rig cannot be mistaken for a fresh one. */
export function freshRig(name) {
  const dir = join(rigRoot(name), `run-${new Date().toISOString().replace(/[:.]/gu, '-')}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Load a compiled module from `dist/src`. */
export async function load(relative) {
  return await import(pathToFileURL(join(DIST, relative)).href);
}

/** The digest of a string, for the evidence closure. */
export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** A git helper bound to a repository. */
export function git(cwd, args) {
  return execFileSync('git', [...args], { cwd, encoding: 'utf8' }).trim();
}

/**
 * §"Loop conformance matrix": build a REAL git project with one committed file, and return its head.
 *
 * `extraFiles` lets a scenario seed additional content without a second helper.
 */
export function makeProject(dir, input = {}) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'test'), { recursive: true });
  writeFileSync(join(dir, 'README.md'), `# ${input.name ?? 'r3s0'}${NL}`, 'utf8');
  writeFileSync(join(dir, 'src', 'a.js'), input.source ?? `export const a = 1;${NL}`, 'utf8');
  writeFileSync(join(dir, 'test', 'check.js'), [
    'import { a } from "../src/a.js";',
    'if (typeof a !== "number") throw new Error("a must be a number");',
    `process.stdout.write("ok" + String.fromCharCode(10));${NL}`,
  ].join(NL), 'utf8');
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: input.name ?? 'r3s0', private: true, type: 'module', scripts: { test: 'node test/check.js' } }, null, 2)}${NL}`, 'utf8');
  for (const [relative, content] of Object.entries(input.extraFiles ?? {})) {
    const target = join(dir, relative);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'H0'], { cwd: dir });
  return git(dir, ['rev-parse', 'HEAD']);
}

/** §"Loop conformance matrix": the completion standard every scenario uses, so no scenario drifts. */
export function standardFor(statement = 'the visible oracle passes') {
  return Object.freeze({
    statement,
    clauses: Object.freeze([Object.freeze({ kind: 'scope_respected' })]),
    derivedFrom: Object.freeze(['r3s0 systemic conformance']),
    confirmed: true,
    notes: Object.freeze([]),
  });
}

/**
 * §"Loop conformance matrix": THE DURABLE STORE PATHS.
 *
 * Everything is PATH-BASED, which is what makes a process-boundary restart meaningful: the child process is
 * handed these same paths and nothing else.
 */
export function storePaths(rig) {
  const state = join(rig, 'state');
  mkdirSync(state, { recursive: true });
  return Object.freeze({
    state,
    orchestration: join(state, 'orchestration.sqlite'),
    ordarium: join(state, 'ordarium.sqlite'),
    coordination: join(state, 'coordination.sqlite'),
    boundary: join(state, 'boundary.sqlite'),
    association: join(state, 'assoc.sqlite'),
    journal: join(state, 'journal.sqlite'),
    proof: join(state, 'proof.sqlite'),
    proofBlobs: join(state, 'proof-blobs'),
    cells: join(state, 'cells.sqlite'),
    procedures: join(state, 'procedures.sqlite'),
  });
}

/**
 * §"Loop conformance matrix": compose ONE packaged install over the given durable paths.
 *
 * Every optional store is injected through the documented install options; a scenario that needs a narrower
 * seam passes `extra`.
 */
export async function installOver(input) {
  const advanced = await load('advanced.js');
  const workspaceModule = await load('project_workspace/index.js');
  const coordinationModule = await load('coordination/index.js');
  const proofModule = await load('proof_asset/index.js');
  const reasoningModule = await load('reasoning_cell/index.js');
  const federationModule = await load('federation/index.js');

  const paths = input.paths;
  const options = {
    projectId: input.projectId,
    databasePath: paths.orchestration,
    ordariumDatabasePath: paths.ordarium,
    repository: input.repo,
    execution: 'worktree',
    standard: standardFor(),
    policy: advanced.trustedDefaultPolicy({
      read_paths: ['src', 'test', 'README.md'],
      /**
       * §"Loop conformance matrix": BOTH gate outcomes are authorized up front, because the rejection path
       * needs a gate that genuinely FAILS. Authorizing only the passing command would make the rejection proof
       * impossible to run through the governed path, and reaching around the gate instead would defeat it.
       */
      allowed_commands: [
        { executable: 'node', argv_prefix: ['-e', 'process.exit(0)'] },
        { executable: 'node', argv_prefix: ['-e', 'process.exit(1)'] },
      ],
    }),
    projectAssociationStore: new workspaceModule.SqliteProjectAssetAssociationStore(paths.association),
    projectJournalStore: new workspaceModule.SqliteProjectJournalStore(paths.journal),
    proofEvidenceStore: new proofModule.SqliteProofEvidenceStore(paths.proof),
    proofBlobStore: proofModule.localProofBlobStore(paths.proofBlobs),
    reasoningCellStore: new reasoningModule.SqliteReasoningCellStore(paths.cells),
    reasoningCellStoreOwned: false,
    ...(input.extra ?? {}),
  };
  if (input.localPeer !== undefined) options.localPeer = input.localPeer;
  if (input.coordinationStore !== undefined) options.coordinationStore = input.coordinationStore;
  if (input.boundaryMemoryStore !== undefined) options.boundaryMemoryStore = input.boundaryMemoryStore;

  const installed = advanced.installPalimpsest({ tools: { register: () => () => undefined } }, options);
  return Object.freeze({
    installed,
    controller: installed.controller,
    module: { advanced, workspaceModule, coordinationModule, proofModule, reasoningModule, federationModule },
    paths,
    close: () => installed.dispose(),
  });
}

/** §"Loop conformance matrix": the deterministic completion seam the standard requires. */
export function completionWorker(input = {}) {
  return Object.freeze({
    adapterId: input.adapterId ?? 'r3s0-completion-worker',
    async run() {
      return Object.freeze({ kind: 'READY_FOR_SETTLEMENT', detail: 'completed the envelope' });
    },
  });
}

/** §"Loop conformance matrix": a worker that commits a file into its world, then reports ready. */
export function committingWorker(input) {
  const adapterId = input.adapterId ?? 'r3s0-committing-worker';
  return Object.freeze({
    adapterId,
    async run({ workDir }) {
      writeFileSync(join(workDir, input.path), input.text, 'utf8');
      execFileSync('git', ['add', '-A'], { cwd: workDir });
      execFileSync('git', ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', input.message ?? 'work'], { cwd: workDir });
      return Object.freeze({ kind: 'READY_FOR_SETTLEMENT', detail: 'committed' });
    },
  });
}

/** §"Loop conformance matrix": drive one delegation job to a terminal phase. */
export async function driveJob(service, input = {}) {
  const started = await service.start(input.start ?? {});
  let view = await service.followup({ jobId: started.jobId });
  for (let index = 0; index < 4_000 && (view.phase === 'QUEUED' || view.phase === 'RUNNING'); index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    view = await service.followup({ jobId: started.jobId });
  }
  return Object.freeze({ started, view });
}

/* ================================================================ the process-boundary restart */

/**
 * §"Cold-restart discipline": THE CHILD-PROCESS RESTART.
 *
 * The child is spawned with ONLY the durable paths and a small operation descriptor. It composes its own
 * installation, performs the requested READ, and prints what it found as JSON. Nothing from the parent's
 * memory is passed: if generation N+1 needed an in-memory object, this child would not have it.
 *
 * The child writes its script to the rig and runs it with the SAME node binary, so the restart is a real OS
 * process boundary rather than a module re-import.
 *
 * @param {{rig: string, paths: object, projectId: string, repo: string, operations: readonly object[]}} input
 * @returns {Promise<object>} the child's parsed report
 */
export async function restartInChildProcess(input) {
  const scriptPath = join(input.rig, `generation-${String(Date.now())}.mjs`);
  const reportPath = join(input.rig, `generation-report-${String(Date.now())}.json`);
  const specPath = join(input.rig, `generation-spec-${String(Date.now())}.json`);
  writeFileSync(specPath, JSON.stringify({
    repoRoot: REPO_ROOT,
    paths: input.paths,
    projectId: input.projectId,
    repo: input.repo,
    localPeer: input.localPeer ?? null,
    /** The federation stores are passed by PATH, never by object: the child re-attaches to the same history. */
    coordinationPath: input.paths?.coordination ?? null,
    boundaryPath: input.paths?.boundary ?? null,
    operations: input.operations,
    reportPath,
  }, null, 2), 'utf8');

  writeFileSync(scriptPath, CHILD_GENERATION_SCRIPT, 'utf8');
  const output = execFileSync(process.execPath, [scriptPath, specPath], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, PALIMPSEST_R3S0_CHILD: '1' },
  });
  if (!existsSync(reportPath)) throw new Error(`the generation child produced no report; stdout was: ${output.slice(0, 400)}`);
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  return Object.freeze({ report, scriptPath, reportPath, stdout: output });
}

/**
 * The child's program. It is deliberately SMALL and explicit: it composes one installation over the durable
 * paths and performs only the reads it was asked for. It never imports anything the parent held.
 */
const CHILD_GENERATION_SCRIPT = `
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const spec = JSON.parse(readFileSync(process.argv[2], "utf8"));
const DIST = join(spec.repoRoot, "dist", "src");
const load = async (relative) => await import(pathToFileURL(join(DIST, relative)).href);

const advanced = await load("advanced.js");
const workspaceModule = await load("project_workspace/index.js");
const proofModule = await load("proof_asset/index.js");
const reasoningModule = await load("reasoning_cell/index.js");

const options = {
  projectId: spec.projectId,
  databasePath: spec.paths.orchestration,
  ordariumDatabasePath: spec.paths.ordarium,
  repository: spec.repo,
  execution: "worktree",
  standard: { statement: "the visible oracle passes", clauses: [{ kind: "scope_respected" }], derivedFrom: ["r3s0 child"], confirmed: true, notes: [] },
  policy: advanced.trustedDefaultPolicy({ read_paths: ["src", "test", "README.md"], allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }, { executable: "node", argv_prefix: ["-e", "process.exit(1)"] }] }),
  projectAssociationStore: new workspaceModule.SqliteProjectAssetAssociationStore(spec.paths.association),
  projectJournalStore: new workspaceModule.SqliteProjectJournalStore(spec.paths.journal),
  proofEvidenceStore: new proofModule.SqliteProofEvidenceStore(spec.paths.proof),
  proofBlobStore: proofModule.localProofBlobStore(spec.paths.proofBlobs),
  reasoningCellStore: new reasoningModule.SqliteReasoningCellStore(spec.paths.cells),
  reasoningCellStoreOwned: false,
};
if (spec.localPeer !== null) options.localPeer = spec.localPeer;
/**
 * A federation read needs the coordination store, which is PATH-BASED like every other durable store, so the
 * child attaches to the SAME coordination history the parent wrote. Without this the child could not see a
 * declared need at all, and a restart proof would be measuring nothing.
 */
if (spec.coordinationPath !== undefined) {
  const coordinationModule = await load("coordination/index.js");
  options.coordinationStore = new coordinationModule.SqliteCoordinationStore(spec.coordinationPath);
  /**
   * The federation service is composed ONLY when the full collaboration wiring is supplied: localPeer,
   * coordinationStore, a transport, a directory and an attempt catalog. The child must supply ALL of them or
   * installed.federation is absent and a federation read cannot be attempted at all. The ports here are the
   * same deterministic ones the parent used, rebuilt from nothing but the durable paths.
   */
  const federationModule = await load("federation/index.js");
  options.peerTransportPort = federationModule.callbackPeerTransportPort("r3s0-child", {
    onSend: async () => ({ transportMessageId: "t", delivered: true }),
    onWake: async () => ({ signaled: true }),
  });
  options.peerDirectoryPort = { observePeers: async () => ({ state: "known", value: [] }) };
  options.attemptCatalog = { assertAdmissibleAttempt: async () => {} };
}
if (spec.boundaryPath !== undefined) {
  const boundaryModule = await load("boundary_memory/index.js");
  options.boundaryMemoryStore = new boundaryModule.SqliteBoundaryMemoryStore(spec.boundaryPath);
}

const installed = advanced.installPalimpsest({ tools: { register: () => () => undefined } }, options);
const findings = [];
for (const operation of spec.operations) {
  try {
    if (operation.kind === "REQUIREMENTS") {
      const project = installed.controller.work.project();
      findings.push({ operation, ok: true, value: project.requirements.map((entry) => entry.statement) });
    } else if (operation.kind === "GOAL") {
      findings.push({ operation, ok: true, value: installed.controller.work.project().goal });
    } else if (operation.kind === "PROJECT_REVISION") {
      const project = installed.controller.work.project();
      findings.push({ operation, ok: true, value: { revision: project.revision, digest: project.digest } });
    } else if (operation.kind === "INTENT_RECEIPT") {
      const row = installed.controller.store.connection
        .prepare("SELECT payload_json FROM events WHERE project_id=? AND event_type='PROJECT_REVISED' ORDER BY event_id DESC LIMIT 1")
        .get(spec.projectId);
      const payload = row === undefined ? null : JSON.parse(new TextDecoder().decode(row.payload_json));
      findings.push({ operation, ok: true, value: payload?.intent_reconciliation ?? null });
    } else if (operation.kind === "ASSET_ASSOCIATIONS") {
      /**
       * The association READ path is the store's own replay plus the owner's projection: the workspace service
       * does not publish an associationsFor read on the install surface, so the child reads the durable
       * association stream exactly as the owner's own projection does.
       */
      const store = new workspaceModule.SqliteProjectAssetAssociationStore(spec.paths.association);
      const associations = workspaceModule.associatedAssetsOf(await store.replay(spec.projectId));
      store.close();
      findings.push({ operation, ok: true, value: associations });
    } else if (operation.kind === "PROOF_CLAIM") {
      findings.push({ operation, ok: true, value: await installed.proof.proofAssetView(operation.claimId) });
    } else if (operation.kind === "CONTACT_NEED") {
      findings.push({ operation, ok: true, value: await installed.federation.contactNeed(operation.needId) });
    } else if (operation.kind === "COMMITMENT_STATE") {
      findings.push({ operation, ok: true, value: await installed.federation.commitmentState(operation.commitmentId) });
    } else if (operation.kind === "FULFILLMENT") {
      findings.push({ operation, ok: true, value: await installed.federation.fulfillment(operation.commitmentId) });
    } else if (operation.kind === "TASK_STATES") {
      findings.push({ operation, ok: true, value: installed.controller.work.taskStates() });
    } else if (operation.kind === "WORK_PROJECT_TASKS") {
      findings.push({ operation, ok: true, value: installed.controller.work.project().tasks.map((task) => task.task_id) });
    } else {
      findings.push({ operation, ok: false, value: "UNKNOWN_OPERATION" });
    }
  } catch (error) {
    findings.push({ operation, ok: false, value: String(error?.message ?? error) });
  }
}
await installed.dispose().catch(() => undefined);
writeFileSync(spec.reportPath, JSON.stringify({ pid: process.pid, findings }, null, 2), "utf8");
process.stdout.write("GENERATION_CHILD_DONE" + String.fromCharCode(10));
`;

export { CHILD_GENERATION_SCRIPT };

/* ================================================================ the governed Work helpers */

/**
 * §"Work-loop end-to-end scenario": ADVANCE THE SCHEDULER to the task it genuinely makes next.
 *
 * `expectedTaskId` is an ASSERTION, not a scheduling command: a delegation bootstraps the task the project
 * itself makes next. A freshly planned project first moves its tasks to READY, so the harness takes those
 * decisions — and only those — then asks for the task that is genuinely next. This mirrors the shipped
 * gate's own helper rather than reaching around the scheduler.
 */
export function advanceToReady(controller) {
  for (let index = 0; index < 24; index += 1) {
    const preview = controller.preview();
    if (preview.decision !== 'next' || preview.eventType !== 'TASK_READY') break;
    controller.step();
  }
  return controller.work.taskStates().find((task) => task.state === 'READY')?.taskId ?? null;
}

/**
 * §"Work-loop end-to-end scenario": CLOSE A TASK THROUGH THE ORDINARY GOVERNED PATH.
 *
 * mechanical gate -> scheduler steps -> promotion (only when eligible) -> head reconciliation. This is what
 * every real operator does, and the harness never reaches around it. The returned eligibility record is what
 * makes the "no promotion without verification" proof checkable.
 */
export async function closeTask(rig, attemptId, input = {}) {
  const controller = rig.controller ?? rig.installed.controller;
  for (let index = 0; index < 12; index += 1) {
    const preview = controller.preview();
    if (preview.decision !== 'next') break;
    controller.step();
  }
  /**
   * The independent mechanical gate: the standard's own predicate, run as a REAL command whose exit code is
   * the observation. The canonical schema requires the predicate to agree with the observed exit code — a
   * passing process requires exit 0 and a failing one requires `tests_fail` — so the predicate is chosen from
   * the command rather than passed independently. That rule is the schema refusing to let a caller mislabel a
   * failed run, which is exactly the kind of honesty this stage is measuring.
   */
  const command = input.command ?? ['node', '-e', 'process.exit(0)'];
  const fails = String(command[command.length - 1]).includes('exit(1)');
  await controller.gate({ attemptId, predicate: input.predicate ?? (fails ? 'tests_fail' : 'tests_pass'), command });
  for (let index = 0; index < 12; index += 1) {
    const preview = controller.preview();
    if (preview.decision !== 'next') break;
    controller.step();
  }
  const report = controller.attemptWorkRecord(attemptId)?.report;
  const eligibility = controller.promotionEligibility(attemptId);
  let promoted = null;
  if (eligibility.eligible && report !== null && report !== undefined) {
    promoted = await controller.promote(attemptId, String(report.result_commit), eligibility.canonicalExpectedHead);
    controller.step();
  }
  await controller.reconcileProjectHead({ operator: true });
  return Object.freeze({ eligibility, promoted, report: report ?? null });
}

/**
 * §"Work-loop end-to-end scenario": SETTLE THE SCHEDULER, then name the task it makes next.
 *
 * After a promotion moves canonical HEAD, a dependent task's envelope is bound to the OLD head, so the
 * scheduler must first re-authorize it (a fresh envelope on the new head) before it can be delegated. Stepping
 * until the scheduler has no further decision is what an operator does; skipping the step would leave the task
 * BLOCKED and make a later delegation fail for the wrong reason.
 */
export function settleScheduler(controller, limit = 32) {
  /**
   * Stepping until the scheduler has no further decision can leave a task in ACTIVE rather than READY: the
   * scheduler's own TASK_STARTED step is a decision too. So the target is the task the scheduler makes next,
   * whether it has reached READY or has already been started — both are delegable, and asking for neither is
   * what a caller must not do.
   */
  for (let index = 0; index < limit; index += 1) {
    const preview = controller.preview();
    if (preview.decision !== 'next') break;
    controller.step();
  }
  const states = controller.work.taskStates();
  const delegable = states.find((task) => task.state === 'READY') ?? states.find((task) => task.state === 'ACTIVE');
  return delegable?.taskId ?? null;
}
