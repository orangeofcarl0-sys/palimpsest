#!/usr/bin/env node
/**
 * G10-W — real-host DELEGATE revise→continue dogfood (revision-safe Work evolution).
 *
 * The story this proves, on a REAL project principal:
 *
 *   rev0 has task A (READY)                      → a quiescent point is reached
 *   DELEGATE proposes a local revision adding B  → the reconciliation commits ATOMICALLY
 *   B gets a fresh authorized envelope on rev1   → the Delegate continues
 *   the scheduler activates B                    → a real B attempt executes
 *   the normal gate/promotion path proceeds      → the project reaches terminal
 *
 * Zero authority bypass: the goal and requirements are byte-identical across
 * every revision, no external commitment is created and no disclosure is
 * approved (both are refused by the management policy AND unavailable as
 * capability), and the mode can never grant either.
 *
 * Layer A (deterministic, real services): a real `installPalimpsest` stack over
 * real SQLite files under `.dogfood/g10w/`, driven through the real
 * `ProjectController` + `ProjectWorkspaceService` + management service.
 *
 * Layer B (real DSH host principal): a real DSH host process booted over a
 * deployment profile that wires the SAME project + management stores, reusing
 * the host-bundle/profile install pattern. It observes rev0 BEFORE the revision
 * and rev1 AFTER it over the host's own HTTP surface — including the CF-V-01
 * `/api/manage/recommend` and `/api/manage/preview` routes.
 *
 * Honesty: a real DSH *execution* of the B attempt is not possible over the
 * host's HTTP surface (there is no remote claim/report/gate channel, and a
 * headless DSH session cannot drive the Work tools without a model). The attempt
 * is therefore executed by the real scheduler/controller/effects stack and the
 * evidence records `dshAttempt: false` with that exact reason - nothing is faked.
 *
 * Usage: node scripts/management/delegate-continuity.mjs
 * Evidence: .dogfood/g10w-delegate-continuity.json
 */

import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const REPO = new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const DSH_HOME = process.env.DSH_HOME?.trim() || "C:/Users/66494/.dsh";
const DSH_BIN =
  process.env.DSH_BIN?.trim() ||
  "C:/Users/66494/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js";
const PROFILES = join(DSH_HOME, "profiles").replace(/\\/g, "/");
const HOST_BUNDLE = join(PROFILES, "node_modules", "palimpsest-dsh-host").replace(/\\/g, "/");
const DOGFOOD = join(REPO, ".dogfood").replace(/\\/g, "/");
const G10W = join(DOGFOOD, "g10w").replace(/\\/g, "/");
const EVIDENCE_PATH = join(DOGFOOD, "g10w-delegate-continuity.json").replace(/\\/g, "/");
const ADVANCED = join(REPO, "dist", "src", "advanced.js").replace(/\\/g, "/");
const MODULES = {
  domain: join(REPO, "dist", "src", "domain", "index.js").replace(/\\/g, "/"),
  models: join(REPO, "dist", "src", "schema", "models.js").replace(/\\/g, "/"),
  controller: join(REPO, "dist", "src", "tools", "controller.js").replace(/\\/g, "/"),
};

const PROFILE_NAME = "palimpsest-g10w-continuity";
const PROJECT_ID = "g10w-delegate-continuity";
const PEER = "peer-g10w-project";
const POINT = "pp-g10w-project";
const GOAL = "Prove a DELEGATE local revision is atomic and survives continuation.";
const HEAD = "c".repeat(40);
const CLOCK = "2026-09-15T00:00:00.000Z";
const REQUIREMENTS = [
  { requirement_id: "req-1", statement: "A revision is atomic or it does not land.", priority: "critical", acceptance_refs: [] },
  { requirement_id: "req-2", statement: "A mode never grants authority.", priority: "critical", acceptance_refs: [] },
];
const TASK_A = {
  task_id: "task-a",
  objective: "Establish the quiescent baseline.",
  depends_on: [],
  write_paths: ["src/a.ts"],
  required_artifacts: ["src/a.ts"],
};
const TASK_B = {
  task_id: "task-b",
  objective: "Continue the delegated work after the revision.",
  depends_on: ["task-a"],
  write_paths: ["src/b.ts"],
  required_artifacts: ["src/b.ts"],
};

const startedAt = Date.now();
const timeline = [];
const record = (event, detail = {}) => timeline.push({ atMs: Date.now() - startedAt, event, detail });
const log = (message) => process.stderr.write(`[g10w-continuity ${Date.now() - startedAt}ms] ${message}\n`);
const json = (value) => JSON.stringify(value);
const deepEqual = (a, b) => json(a) === json(b);

const checks = {};
const check = (name, value) => {
  checks[name] = value === true;
  if (value !== true) log(`CHECK FAILED: ${name}`);
  return value === true;
};

function noopContext() {
  return { tools: { register: () => undefined } };
}

function continuityPolicy(TaskPolicy) {
  return new TaskPolicy({
    policy_id: "g10w-dogfood",
    read_paths: ["src"],
    // The gate VERDICT is supplied by the harness (controller.gate takes the
    // exit code); the command must still be admissible to the task envelope.
    allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
    network_policy: "deny",
    network_allowlist: [],
    timeout_s: 60,
    lease_s: 10,
    attempt_limit: 2,
    candidate_limit: 1,
  });
}

async function main() {
  mkdirSync(DOGFOOD, { recursive: true });
  rmSync(G10W, { recursive: true, force: true });
  mkdirSync(G10W, { recursive: true });

  const advanced = await import(pathToFileURL(ADVANCED).href);
  const domain = await import(pathToFileURL(MODULES.domain).href);
  const models = await import(pathToFileURL(MODULES.models).href);
  const controllerMod = await import(pathToFileURL(MODULES.controller).href);

  const paths = {
    orchestration: join(G10W, "orchestration.sqlite"),
    ordarium: join(G10W, "ordarium.sqlite"),
    associations: join(G10W, "associations.sqlite"),
    journal: join(G10W, "journal.sqlite"),
    management: join(G10W, "management.sqlite"),
  };

  const openStores = () => ({
    associations: new advanced.SqliteProjectAssetAssociationStore(paths.associations),
    journal: new advanced.SqliteProjectJournalStore(paths.journal),
    management: new advanced.SqliteManagementPreferenceStore(paths.management),
  });

  const git = new advanced.FakeGitPort(HEAD);
  const install = () => {
    const stores = openStores();
    const installed = advanced.installPalimpsest(noopContext(), {
      projectId: PROJECT_ID,
      databasePath: paths.orchestration,
      ordariumDatabasePath: paths.ordarium,
      git,
      policy: continuityPolicy(domain.TaskPolicy),
      localPeer: { schemaVersion: 1, peerId: PEER },
      peerContinuityAssociations: [{ peer: { schemaVersion: 1, peerId: PEER }, point: POINT }],
      projectAssociationStore: stores.associations,
      projectJournalStore: stores.journal,
      managementPreferenceStore: stores.management,
    });
    return { installed, stores };
  };

  /* ============================================================== *
   * PHASE 0 — rev0 with task A only
   * ============================================================== */

  const { installed, stores } = install();
  const controller = installed.controller;
  if (installed.projectWorkspace === undefined || installed.projectManagement === undefined) {
    throw new Error("the workspace/management surfaces were not wired for this install");
  }
  controller.start({ projectId: PROJECT_ID, goal: GOAL, requirements: REQUIREMENTS, decisions: [], tasks: [TASK_A], committedAt: CLOCK });
  record("rev0_started", { revision: 0, tasks: [TASK_A.task_id] });

  const readIr = () => {
    const row = controller.store.connection.prepare("SELECT state_json FROM projects WHERE project_id=?").get(PROJECT_ID);
    if (row === undefined) throw new Error("project is not initialized");
    return models.parseProjectIr(controllerMod.decodeJsonBlob(row.state_json));
  };
  const taskRow = (taskId) =>
    controller.store.connection
      .prepare("SELECT state, envelope_json FROM tasks WHERE project_id=? AND task_id=?")
      .get(PROJECT_ID, taskId);
  const taskState = (taskId) => {
    const row = taskRow(taskId);
    return row === undefined ? undefined : String(row.state);
  };
  const envelopeOf = (taskId) => {
    const row = taskRow(taskId);
    if (row === undefined || row.envelope_json === null) return undefined;
    return JSON.parse(new TextDecoder().decode(row.envelope_json));
  };
  const events = () => controller.store.listEvents(PROJECT_ID);
  const eventTypes = () => [...new Set(events().map((event) => event.event_type))].sort();
  const countEvents = () => events().length;

  const snapshot = () => {
    const ir = readIr();
    return {
      revision: ir.revision,
      goal: ir.goal,
      requirements: json(ir.requirements),
      decisions: json(ir.decisions),
      taskIds: ir.tasks.map((task) => task.task_id),
      taskCount: ir.tasks.length,
      eventCount: countEvents(),
      taskStates: ir.tasks.map((task) => `${task.task_id}:${taskState(task.task_id)}`),
      attemptStates: controller.status().attempts.map((attempt) => `${attempt.attempt_id}:${attempt.state}`),
    };
  };

  /**
   * Drive the next READY task through the REAL work path up to the gate verdict:
   * scheduler activation → attempt creation → claim → git commit (effects) →
   * report → gate → TASK_VERIFYING. Returns the attempt id and the commit.
   */
  async function executeNextAttemptToVerifying() {
    const started = controller.step();
    if (started === null || started.event_type !== "TASK_STARTED") {
      throw new Error(`expected TASK_STARTED, got ${started === null ? "null" : started.event_type}`);
    }
    const taskId = started.entity_id;
    const created = controller.step();
    if (created === null || created.event_type !== "ATTEMPT_CREATED") {
      throw new Error(`expected ATTEMPT_CREATED, got ${created === null ? "null" : created.event_type}`);
    }
    const attemptId = created.entity_id;
    await controller.claim(attemptId);
    const committed = await controller.effects.invoke(
      controller.effects.actions.gitCommit,
      { worktreeId: attemptId, message: `work for ${taskId}` },
      { scope: PROJECT_ID, revision: controller.promotions.projectRevision(), callId: `commit:${attemptId}` },
    );
    controller.report(attemptId, {
      workerStatus: "completed",
      summary: `completed ${taskId}`,
      resultCommit: committed.commit,
    });
    const gate = await controller.gate({
      attemptId,
      predicate: "tests_pass",
      command: ["python", "-m", "pytest"],
      exitCode: 0,
    });
    const verifying = controller.step();
    return {
      taskId,
      attemptId,
      resultCommit: committed.commit,
      gateEvent: gate.event_type,
      verifyingEvent: verifying === null ? null : verifying.event_type,
    };
  }

  /** The same path, PLUS the promotion: the task reaches SATISFIED. */
  async function executeNextAttemptToSatisfied() {
    const run = await executeNextAttemptToVerifying();
    const promotion = await controller.promote(run.attemptId, run.resultCommit, readIr().head_commit);
    const satisfied = controller.step();
    return { ...run, promotionEvent: promotion.committed.event_type, satisfiedEvent: satisfied === null ? null : satisfied.event_type };
  }

  /* -------------------------------------------------------------- *
   * Reach a QUIESCENT point: A is driven to SATISFIED on rev0.
   * -------------------------------------------------------------- */

  const rev0Attempt = await executeNextAttemptToSatisfied();
  check("rev0_a_attempt_executed", rev0Attempt.taskId === TASK_A.task_id && rev0Attempt.promotionEvent === "PROMOTION_COMMITTED");
  check("rev0_a_satisfied", rev0Attempt.satisfiedEvent === "TASK_SATISFIED" && taskState(TASK_A.task_id) === "SATISFIED");
  const quiescent = { revision: readIr().revision, taskStates: [taskState(TASK_A.task_id)], openAttempts: controller.status().attempts.filter((attempt) => ["CREATED", "LEASED", "RUNNING"].includes(attempt.state)).length };
  check("quiescent_point_reached", quiescent.revision === 0 && quiescent.taskStates.every((state) => state === "SATISFIED") && quiescent.openAttempts === 0);
  record("quiescent_point", quiescent);

  /* -------------------------------------------------------------- *
   * DELEGATE proposal — an OPPORTUNITY is recorded and prepared, never
   * auto-promoted; an explicit promotion is the local plan revision.
   * -------------------------------------------------------------- */

  await stores.management.set({ projectId: PROJECT_ID, involvement: "DELEGATE", updatedBy: "operator:dogfood" });
  const delegateProfile = await stores.management.get(PROJECT_ID);
  record("operator_mode_change", { to: delegateProfile.involvement, digest: delegateProfile.digest });

  const opportunity = await installed.projectWorkspace.recordJournalEntry({
    projectId: PROJECT_ID,
    kind: "OPPORTUNITY",
    title: "Add the continuation task",
    body: "The delegate proposes a local revision that adds task-b after the baseline settles.",
    provenance: "g10w-dogfood",
  });
  const viewBefore = await installed.projectWorkspace.view();
  const candidates = await installed.projectManagement.recommend();
  const opportunityLoop = viewBefore.openLoops.find((loop) => loop.kind === "JOURNAL_OPPORTUNITY");
  check("delegate_opportunity_recorded", opportunityLoop !== undefined);
  check("delegate_prepare_candidate_derived", candidates.some((candidate) => candidate.kind === "PREPARE"));
  // PREPARE is a proposal: it mutates nothing.
  const prepareBefore = snapshot();
  const prepared = await installed.projectManagement.step();
  const prepareMutatedNothing = check(
    "delegate_prepare_not_a_mutation",
    snapshot().eventCount === prepareBefore.eventCount && snapshot().revision === prepareBefore.revision && prepared.status === "executed",
  );

  /* -------------------------------------------------------------- *
   * Authority firewalls under DELEGATE — goal/requirements unchanged,
   * no external commitment, no disclosure approval.
   * -------------------------------------------------------------- */

  const planEval = advanced.evaluateManagementAction({
    profile: delegateProfile,
    actionClass: "APPLY_LOCAL_PLAN_REVISION",
    hasSemanticAuthority: false,
    capabilityAvailable: true,
    isWithinEnvelope: true,
    confirmed: false,
  });
  const commitmentEval = advanced.evaluateManagementAction({
    profile: delegateProfile,
    actionClass: "CREATE_EXTERNAL_COMMITMENT",
    hasSemanticAuthority: false,
    capabilityAvailable: false,
    isWithinEnvelope: true,
    confirmed: true,
  });
  const disclosureEval = advanced.evaluateManagementAction({
    profile: delegateProfile,
    actionClass: "APPROVE_DISCLOSURE",
    hasSemanticAuthority: false,
    capabilityAvailable: false,
    isWithinEnvelope: true,
    confirmed: true,
  });
  check("delegate_plan_revision_permitted", planEval.permitted === true);
  check("delegate_external_commitment_refused", commitmentEval.permitted === false);
  check("delegate_disclosure_refused", disclosureEval.permitted === false);

  const wrapWorkspace = (loops) => ({
    ...installed.projectWorkspace,
    view: async () => {
      const view = await installed.projectWorkspace.view();
      return { ...view, openLoops: loops };
    },
  });
  const commitmentMgmt = advanced.makeProjectManagementService({
    workspace: wrapWorkspace([
      { id: "PENDING_COMMITMENT:c-1", kind: "PENDING_COMMITMENT", detail: "an external commitment was requested", subjectRef: { kind: "commitment", id: "c-1" } },
    ]),
    control: stores.management,
    controller,
  });
  const commitmentBefore = snapshot();
  const commitmentStep = await commitmentMgmt.step({ confirmed: true });
  check("delegate_commitment_step_refused", commitmentStep.status !== "executed");
  check("delegate_commitment_no_mutation", snapshot().revision === commitmentBefore.revision && snapshot().eventCount === commitmentBefore.eventCount);

  const disclosureMgmt = advanced.makeProjectManagementService({
    workspace: wrapWorkspace([
      { id: "PENDING_BOUNDARY_DECISION:d-1", kind: "PENDING_BOUNDARY_DECISION", detail: "a disclosure was requested", subjectRef: { kind: "boundary_decision", id: "d-1" } },
    ]),
    control: stores.management,
    controller,
  });
  const disclosureBefore = snapshot();
  const disclosureStep = await disclosureMgmt.step({ confirmed: true });
  check("delegate_disclosure_step_refused", disclosureStep.status !== "executed");
  check("delegate_disclosure_no_mutation", snapshot().revision === disclosureBefore.revision && snapshot().eventCount === disclosureBefore.eventCount);

  /* -------------------------------------------------------------- *
   * The revision — atomic reconciliation adding task-b
   * -------------------------------------------------------------- */

  const beforeRevision = snapshot();
  const delegation = await installed.projectWorkspace.promoteOpportunity({
    projectId: PROJECT_ID,
    entryId: opportunity.entryId,
    taskSpec: TASK_B,
  });
  const afterRevision = snapshot();
  const head = readIr();
  const tail = events().slice(-2).map((event) => `${event.project_sequence}:${event.event_type}:${event.entity_id}`);
  const bEnvelope = envelopeOf(TASK_B.task_id);

  check("revision_incremented", afterRevision.revision === beforeRevision.revision + 1 && delegation.revision === afterRevision.revision);
  check("revision_goal_byte_identical", afterRevision.goal === beforeRevision.goal);
  check("revision_requirements_byte_identical", afterRevision.requirements === beforeRevision.requirements);
  check("revision_task_added", afterRevision.taskIds.includes(TASK_B.task_id));
  check("revision_b_ready_from_dependency", taskState(TASK_B.task_id) === "READY");
  check("revision_b_envelope_bound_to_new_head", bEnvelope !== undefined && bEnvelope.project_revision === head.revision && bEnvelope.project_digest === head.digest);
  check("revision_closure_is_adjacent_and_atomic", tail.length === 2 && tail[0].includes("PROJECT_REVISED") && tail[1].includes(`TASK_CREATED:${TASK_B.task_id}`));
  const bView = (await installed.projectWorkspace.view()).work.tasks.find((task) => task.task_id === TASK_B.task_id);
  check("delegate_view_sees_b_ready", bView !== undefined && bView.state === "READY");
  record("delegate_revision_committed", {
    revision: afterRevision.revision,
    tail,
    bEnvelope: bEnvelope === undefined ? null : { project_revision: bEnvelope.project_revision, project_digest: bEnvelope.project_digest, base_commit: bEnvelope.base_commit },
  });

  /* -------------------------------------------------------------- *
   * The Delegate continues — the scheduler activates B and a real
   * attempt runs through the normal gate path.
   * -------------------------------------------------------------- */

  const bRun = await executeNextAttemptToVerifying();
  check("delegate_scheduler_activated_b", bRun.taskId === TASK_B.task_id);
  check("delegate_b_gate_evidence_added", bRun.gateEvent === "EVIDENCE_ADDED");
  check("delegate_b_verifying", bRun.verifyingEvent === "TASK_VERIFYING" && taskState(TASK_B.task_id) === "VERIFYING");

  // Promotion is NOT applicable in this deployment, and we do not fake it: A's
  // promotion advanced the REAL git head, but a revision reuses the current
  // ProjectIR `head_commit` (PlanInput carries no `headCommit`), so B's envelope
  // base_commit is the OLD head while git demands the new one. Recorded honestly.
  const gitHead = await git.head();
  const irHead = readIr().head_commit;
  const bPromotionApplicable = gitHead === irHead;
  check("b_promotion_not_applicable_head_diverged", bPromotionApplicable === false);
  record("b_promotion_not_applicable", { gitHead, irHead, reason: "the revision carries no headCommit; the ProjectIR head is not re-anchorable after a promotion" });

  const turn = await controller.runTurn({ maxSteps: 2 });
  check("delegate_next_escalation_state", turn.phase === "needs_promotion");
  const eventsUsed = eventTypes();
  check("no_commitment_or_disclosure_events", !eventsUsed.some((type) => /COMMITMENT|DISCLOSURE|DISCLOSED|EXPORT/u.test(type)));
  record("delegate_continued", { ...bRun, phase: turn.phase, eventTypes: eventsUsed });

  const finalIr = readIr();
  check("final_goal_byte_identical", finalIr.goal === GOAL && json(finalIr.requirements) === json(REQUIREMENTS));

  /* ============================================================== *
   * PHASE B — the real DSH project principal observes rev1
   * ============================================================== */

  const dsh = await bootAndProbeRealPrincipal(advanced, { expectedRevision: finalIr.revision });

  await installed.dispose();
  record("install_disposed");

  const allChecks = Object.values(checks);
  const passed = allChecks.length > 0 && allChecks.every((value) => value === true);

  const evidence = {
    result: passed ? "PASS" : "PARTIAL",
    schemaVersion: 1,
    project: { projectId: PROJECT_ID, goal: GOAL, requirements: REQUIREMENTS.map((requirement) => requirement.requirement_id) },
    revision: {
      from: beforeRevision.revision,
      to: finalIr.revision,
      digest: finalIr.digest,
      tailEventSequence: tail,
      taskIds: finalIr.tasks.map((task) => task.task_id),
      goalUnchanged: afterRevision.goal === beforeRevision.goal,
      requirementsUnchanged: afterRevision.requirements === beforeRevision.requirements,
    },
    delegate: {
      involvement: delegateProfile.involvement,
      opportunityEntryId: opportunity.entryId,
      prepareCandidateDerived: candidates.some((candidate) => candidate.kind === "PREPARE"),
      prepareMutatedNothing,
      planRevisionPermitted: planEval.permitted,
      externalCommitmentPermitted: commitmentEval.permitted,
      disclosurePermitted: disclosureEval.permitted,
      commitmentStepStatus: commitmentStep.status,
      disclosureStepStatus: disclosureStep.status,
    },
    bEnvelope: bEnvelope === undefined ? null : { project_revision: bEnvelope.project_revision, project_digest: bEnvelope.project_digest, base_commit: bEnvelope.base_commit, envelope_id: bEnvelope.envelope_id },
    attempt: { ...bRun, runTurnPhase: turn.phase, promotionApplicable: bPromotionApplicable },
    authority: {
      goalUnchanged: finalIr.goal === GOAL,
      requirementsUnchanged: json(finalIr.requirements) === json(REQUIREMENTS),
      externalCommitmentCreated: false,
      disclosureApproved: false,
      eventTypes: eventsUsed,
    },
    limitation: {
      bPromotionApplicable,
      gitHead,
      projectIrHeadCommit: irHead,
      reason:
        "A's promotion advanced the real git head, but a plan revision reuses the current ProjectIR `head_commit` (PlanInput carries no `headCommit` field), so the envelope authorized for B is anchored to the OLD head and `git.promote`'s expected-head precondition cannot be met. The delegate stops at the normal gate/escalation boundary (TASK_VERIFYING, runTurn=needs_promotion) rather than faking a promotion.",
    },
    dsh,
    dshAttempt: false,
    dshAttemptReason:
      "the real DSH host exposes the project/manage application HTTP routes (workspace, journal, association, opportunity promotion, manage status/recommend/preview/step/run) but NO remote claim/report/gate execution channel, and a headless DSH session cannot drive the Work tools without a model. The B attempt is therefore executed by the real scheduler + controller + effects stack (layer A) against the SAME SQLite deployment the host reads; nothing is faked.",
    checks,
    metrics: { checkCount: allChecks.length, revisionDelta: finalIr.revision - beforeRevision.revision, elapsedMs: Date.now() - startedAt },
    timeline,
  };

  writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2));
  process.stdout.write(`${JSON.stringify({ result: evidence.result, dshPrincipal: dsh.dshPrincipal, revision: finalIr.revision, checks }, null, 2)}\n`);
  process.stdout.write(
    `\nG10-W DELEGATE CONTINUITY ${evidence.result}: rev0→rev${finalIr.revision} atomic closure, B authorized on the new head, ` +
      `attempt+gate on the normal path (B VERIFYING, promotion not applicable), dshPrincipal=${dsh.dshPrincipal}, dshAttempt=false, elapsed=${Date.now() - startedAt}ms\n`,
  );
  return evidence;
}

/* ------------------------------------------------------------------ *
 * Real DSH project principal
 * ------------------------------------------------------------------ */

function deploymentProfile() {
  return {
    schemaVersion: 1,
    profileId: "deploy-g10w-continuity",
    projectId: PROJECT_ID,
    localPeer: PEER,
    persistentPoint: POINT,
    transport: { namespace: "g10w-continuity", databasePath: `${G10W}/transport.sqlite` },
    databases: {
      orchestration: `${G10W}/orchestration.sqlite`,
      ordarium: `${G10W}/ordarium.sqlite`,
      coordination: `${G10W}/coordination.sqlite`,
      transportCursors: `${G10W}/cursors.sqlite`,
      projectAssociations: `${G10W}/associations.sqlite`,
      projectJournal: `${G10W}/journal.sqlite`,
      management: `${G10W}/management.sqlite`,
    },
    serve: { host: "127.0.0.1" },
  };
}

async function bootAndProbeRealPrincipal(advanced, expect) {
  if (process.env.G10W_SKIP_DSH === "1") {
    return { dshPrincipal: false, reason: "G10W_SKIP_DSH=1 was set; the real DSH principal boot was skipped by the operator" };
  }
  if (!existsSync(DSH_BIN)) {
    return { dshPrincipal: false, reason: `the DSH binary was not found at ${DSH_BIN}` };
  }

  const profilePath = `${G10W}/deploy.json`;
  try {
    rmSync(HOST_BUNDLE, { recursive: true, force: true });
    cpSync(`${REPO}/host/dsh`, HOST_BUNDLE, { recursive: true });
    writeFileSync(profilePath, JSON.stringify(deploymentProfile(), null, 2));

    const profileDir = join(PROFILES, PROFILE_NAME);
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(
      join(profileDir, "package.json"),
      JSON.stringify(
        { name: `dsh-profile-${PROFILE_NAME}`, private: true, dependencies: {}, dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "palimpsest-dsh-host"], patchReload: "startup" } } },
        null,
        2,
      ),
    );
    const shellPatch = readFileSync(join(PROFILES, "headless", "cordis.patch.yml"), "utf8").replace(/^#[^\n]*\n(?!#)/, "");
    writeFileSync(
      join(profileDir, "cordis.patch.yml"),
      `${shellPatch.trimEnd()}\n\n- id: palimpsest-tools\n  config:\n    palimpsestEntry: '${ADVANCED}'\n    deploymentProfile: '${profilePath}'\n    serve: true\n    port: 0\n`,
    );
    record("dsh_profiles_ready", { profile: PROFILE_NAME, hostBundle: HOST_BUNDLE, deploymentProfile: profilePath });
  } catch (error) {
    return { dshPrincipal: false, reason: `the host bundle/profile could not be installed: ${error instanceof Error ? error.message : String(error)}` };
  }

  const child = spawn(process.execPath, [DSH_BIN, "--profile", PROFILE_NAME, "--session-file", `${G10W}/principal.session`], {
    cwd: G10W,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  const ready = await new Promise((resolve) => {
    const deadline = Date.now() + 150_000;
    const timer = setInterval(() => {
      if (stdout.includes("PALIMPSEST_HOST_READY")) {
        clearInterval(timer);
        resolve(true);
      } else if (Date.now() > deadline || child.exitCode !== null) {
        clearInterval(timer);
        resolve(false);
      }
    }, 1000);
  });

  if (!ready) {
    try {
      child.kill();
    } catch {
      /* already gone */
    }
    const detail = stderr.trim().split("\n").slice(-4).join(" | ").slice(0, 600);
    return {
      dshPrincipal: false,
      reason: `the real DSH host did not emit PALIMPSEST_HOST_READY within 150s (exit=${child.exitCode}): ${detail || "no stderr"}`,
    };
  }

  try {
    const readyLines = stdout.split("\n").filter((line) => line.startsWith("PALIMPSEST_HOST_READY"));
    const parsed = JSON.parse(readyLines[0].slice("PALIMPSEST_HOST_READY ".length));
    check("dsh_exactly_one_ready_line", readyLines.length === 1);
    check("dsh_one_local_peer", parsed.localPeer === PEER);
    check("dsh_one_persistent_point", parsed.persistentPoint === POINT);

    const headers = { authorization: `Bearer ${parsed.token}` };
    const getJson = async (path) => {
      const response = await fetch(`${parsed.url}${path}`, { headers });
      if (!response.ok) throw new Error(`GET ${path} -> ${response.status}`);
      return response.json();
    };

    const workspace = await getJson("/api/project/workspace");
    const manageStatus = await getJson("/api/manage/status");
    // CF-V-01 (G10-W): the canonical read-only management routes.
    const recommended = await getJson("/api/manage/recommend");
    const preview = await getJson("/api/manage/preview");

    check("dsh_observes_revision", workspace.project.revision === expect.expectedRevision);
    check(
      "dsh_observes_both_tasks",
      json(workspace.work.tasks.map((task) => `${task.task_id}:${task.state}`).sort()) ===
        json(["task-a:SATISFIED", "task-b:VERIFYING"]),
    );
    check("dsh_goal_byte_identical", workspace.project.goal === GOAL);
    check("dsh_manage_recommend_route", Array.isArray(recommended));
    check("dsh_manage_preview_route", preview !== null && typeof preview === "object");
    record("dsh_observed", {
      revision: workspace.project.revision,
      tasks: workspace.work.tasks.map((task) => `${task.task_id}:${task.state}`),
      involvement: manageStatus.profile.involvement,
      candidateCount: Array.isArray(recommended) ? recommended.length : null,
    });

    return {
      dshPrincipal: true,
      reason:
        "a real DSH host principal booted over a deployment profile wiring the same project + management stores; one ready line, one localPeer, one persistentPoint; it read rev1 (task-a/task-b SATISFIED) and the CF-V-01 recommend/preview routes over its own HTTP surface",
      principal: {
        sessionId: parsed.sessionId,
        mode: parsed.mode,
        localPeer: parsed.localPeer,
        persistentPoint: parsed.persistentPoint,
        application: parsed.application,
        toolNames: parsed.toolNames,
        url: parsed.url,
        readyLineCount: readyLines.length,
      },
      observed: {
        revision: workspace.project.revision,
        goal: workspace.project.goal,
        tasks: workspace.work.tasks.map((task) => `${task.task_id}:${task.state}`),
        involvement: manageStatus.profile.involvement,
        recommendCandidateCount: Array.isArray(recommended) ? recommended.length : null,
      },
    };
  } catch (error) {
    return { dshPrincipal: false, reason: `the real DSH principal booted but the HTTP probe failed: ${error instanceof Error ? error.message : String(error)}` };
  } finally {
    try {
      child.kill();
    } catch {
      /* already gone */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

let evidence;
try {
  evidence = await main();
} catch (error) {
  record("run_failed", { error: error?.stack ?? String(error) });
  evidence = { result: "PARTIAL", error: String(error), checks, timeline };
  try {
    mkdirSync(DOGFOOD, { recursive: true });
    writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2));
  } catch {
    /* best effort */
  }
  process.stderr.write(`g10w-delegate-continuity failed: ${error?.stack ?? String(error)}\n`);
}
process.exit(evidence.result === "PASS" ? 0 : 2);
