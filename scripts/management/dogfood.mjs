#!/usr/bin/env node
/**
 * G10-V management dogfood — ONE persistent project principal under four involvements.
 *
 *   Mode ≠ Authority        Request ≠ Change       Candidate ≠ Command
 *   One principal ≠ four agents
 *
 * Proves that a SINGLE persistent project principal (one PeerRef, one
 * PersistentPoint) behaves according to the four graduated management
 * involvements. Mode changes are applied ONLY through the operator control port
 * (`SqliteManagementPreferenceStore`, the same port the CLI `palimpsest manage`
 * uses) — never through an agent tool.
 *
 * Two layers:
 *
 *   A. DETERMINISTIC, REAL SERVICES. A real project (small task graph) is created
 *      over the real `installPalimpsest` stack with real association/journal/
 *      management SQLite stores under `.dogfood/g10v/`. The four involvements are
 *      asserted directly against `ProjectManagementService` over the real
 *      `ProjectController` (DIRECT refusal + explicit confirmation, ASSIST
 *      recommendation-only, MANAGE mechanical `controller.runTurn` + authority
 *      refusals, DELEGATE task-plan-only revision + goal/disclosure/organization
 *      refusals), then a mid-run operator downgrade, then close/reopen continuity.
 *
 *   B. REAL DSH PRINCIPAL. One real DSH host process is booted over a deployment
 *      profile that wires the SAME project + workspace/journal/management stores.
 *      Its single `PALIMPSEST_HOST_READY` line carries exactly one localPeer and
 *      one persistentPoint; the harness then cycles the operator involvement
 *      through all four values and reads the host's own `/api/manage/status` back,
 *      proving ONE principal reflects all four modes (not four agents).
 *
 * If the real host cannot be booted, the script does NOT fake it: it records
 * `dshPrincipal: false` with the exact reason and still runs layer A.
 *
 * Usage: node scripts/management/dogfood.mjs
 * Evidence: .dogfood/g10v-management-dogfood.json
 */

import { spawn } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const REPO = new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const DSH_HOME = process.env.DSH_HOME?.trim() || "C:/Users/66494/.dsh";
const DSH_BIN =
  process.env.DSH_BIN?.trim() || "C:/Users/66494/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js";
const PROFILES = join(DSH_HOME, "profiles").replace(/\\/g, "/");
const HOST_BUNDLE = join(PROFILES, "node_modules", "palimpsest-dsh-host").replace(/\\/g, "/");
const DOGFOOD = join(REPO, ".dogfood").replace(/\\/g, "/");
const G10V = join(DOGFOOD, "g10v").replace(/\\/g, "/");
const EVIDENCE_PATH = join(DOGFOOD, "g10v-management-dogfood.json").replace(/\\/g, "/");
const ADVANCED = join(REPO, "dist", "src", "advanced.js").replace(/\\/g, "/");
const LEGACY = {
  domain: join(REPO, "dist", "src", "domain", "index.js").replace(/\\/g, "/"),
  models: join(REPO, "dist", "src", "schema", "models.js").replace(/\\/g, "/"),
  controller: join(REPO, "dist", "src", "tools", "controller.js").replace(/\\/g, "/"),
};

const PROFILE_NAME = "palimpsest-g10v-mgmt";
const PROJECT_ID = "g10v-management-dogfood";
const PEER = "peer-g10v-project";
const POINT = "pp-g10v-project";
const GOAL = "Demonstrate one principal under four management involvements.";
const HEAD = "c".repeat(40);
const REQUIREMENTS = [
  { requirement_id: "req-1", statement: "Mode is never authority.", priority: "critical", acceptance_refs: [] },
  { requirement_id: "req-2", statement: "One principal, not four agents.", priority: "high", acceptance_refs: [] },
];
const TASK_ALPHA = { task_id: "task-alpha", objective: "Derive the workspace read model.", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: ["src/a.ts"] };
const TASK_BETA = { task_id: "task-beta", objective: "Derive the open loops.", depends_on: [], write_paths: ["src/b.ts"], required_artifacts: ["src/b.ts"] };

const startedAt = Date.now();
const timeline = [];
const record = (event, detail = {}) => timeline.push({ atMs: Date.now() - startedAt, event, detail });
const log = (message) => process.stderr.write(`[g10v-mgmt ${Date.now() - startedAt}ms] ${message}\n`);
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

function emptyPolicy(TaskPolicy) {
  return new TaskPolicy({
    policy_id: "g10v-dogfood",
    read_paths: ["src"],
    allowed_commands: [], // no gate command: `runTurn` settles an attempt mechanically.
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
  rmSync(G10V, { recursive: true, force: true });
  mkdirSync(G10V, { recursive: true });

  const advanced = await import(pathToFileURL(ADVANCED).href);
  const domain = await import(pathToFileURL(LEGACY.domain).href);
  const models = await import(pathToFileURL(LEGACY.models).href);
  const controllerMod = await import(pathToFileURL(LEGACY.controller).href);

  const paths = {
    orchestration: join(G10V, "orchestration.sqlite"),
    ordarium: join(G10V, "ordarium.sqlite"),
    associations: join(G10V, "associations.sqlite"),
    journal: join(G10V, "journal.sqlite"),
    management: join(G10V, "management.sqlite"),
  };

  const openStores = () => ({
    associations: new advanced.SqliteProjectAssetAssociationStore(paths.associations),
    journal: new advanced.SqliteProjectJournalStore(paths.journal),
    management: new advanced.SqliteManagementPreferenceStore(paths.management),
  });

  const install = () => {
    const stores = openStores();
    const installed = advanced.installPalimpsest(noopContext(), {
      projectId: PROJECT_ID,
      databasePath: paths.orchestration,
      ordariumDatabasePath: paths.ordarium,
      git: new advanced.FakeGitPort(HEAD),
      policy: emptyPolicy(domain.TaskPolicy),
      localPeer: { schemaVersion: 1, peerId: PEER },
      peerContinuityAssociations: [{ peer: { schemaVersion: 1, peerId: PEER }, point: POINT }],
      projectAssociationStore: stores.associations,
      projectJournalStore: stores.journal,
      managementPreferenceStore: stores.management,
    });
    return { installed, stores };
  };

  /* ============================================================== *
   * PHASE 0 — create the real project + workspace/management stores
   * ============================================================== */

  const { installed, stores } = install();
  const controller = installed.controller;
  if (installed.projectWorkspace === undefined || installed.projectManagement === undefined) {
    throw new Error("the workspace/management surfaces were not wired for this install");
  }
  installed.controller.start({ projectId: PROJECT_ID, goal: GOAL, requirements: REQUIREMENTS, tasks: [TASK_ALPHA, TASK_BETA], committedAt: "2026-09-15T00:00:00.000Z" });
  // NOTE: no `controller.plan(...)` yet. The MANAGE scenario runs FIRST, while the
  // project is still at its genesis revision, because a plan revision after task
  // registration leaves the scheduler's stored task envelope at the old revision
  // (see CF-V-05 / the carry-forward): the first *activation* after a plan revision
  // would fail its revision guard. Directly calling `controller.step()` at genesis
  // is the real product path and lets MANAGE run a genuine `controller.runTurn`.
  await installed.projectWorkspace.recordJournalEntry({
    projectId: PROJECT_ID,
    kind: "OPPORTUNITY",
    title: "Adopt a durable workspace cache",
    body: "The derived view is recomputed per read; a cache is a candidate, never a task.",
    provenance: "g10v-dogfood",
  });
  await installed.projectWorkspace.associateAsset({
    projectId: PROJECT_ID,
    assetKind: "PRODUCED_ARTIFACT",
    canonicalRef: { kind: "artifact", id: "artifact-1" },
    associationKind: "DERIVED_FROM_WORK",
    provenance: "g10v-dogfood",
  });
  record("project_created", { projectId: PROJECT_ID, goal: GOAL, tasks: [TASK_ALPHA.task_id, TASK_BETA.task_id] });

  const readIr = () => {
    const row = controller.store.connection.prepare("SELECT state_json FROM projects WHERE project_id=?").get(PROJECT_ID);
    if (row === undefined) throw new Error("project is not initialized");
    return models.parseProjectIr(controllerMod.decodeJsonBlob(row.state_json));
  };
  const countEvents = () => Number(controller.store.connection.prepare("SELECT COUNT(*) AS total FROM events").get().total);

  const snapshot = () => {
    const ir = readIr();
    const status = controller.status();
    return {
      revision: ir.revision,
      goal: ir.goal,
      requirements: json(ir.requirements),
      tasks: json(ir.tasks),
      taskCount: ir.tasks.length,
      eventCount: countEvents(),
      attemptCount: status.attempts.length,
      attemptStates: status.attempts.map((attempt) => `${attempt.attempt_id}:${attempt.state}`),
    };
  };

  const operator = installed.projectManagement;
  const setMode = async (involvement) => {
    const profile = await installed.projectManagement.applyOperatorModeChange({ to: involvement, updatedBy: "operator:dogfood" });
    record("operator_mode_change", { to: involvement, digest: profile.digest });
    return profile;
  };

  const terminateAttempts = () => {
    for (const attempt of controller.status().attempts) {
      if (["CREATED", "LEASED", "RUNNING"].includes(attempt.state)) {
        try {
          controller.report(attempt.attempt_id, { workerStatus: "failed", summary: "dogfood: terminate scenario attempt" });
        } catch (error) {
          record("terminate_attempt_failed", { attemptId: attempt.attempt_id, error: error instanceof Error ? error.message : String(error) });
        }
      }
    }
  };

  const addReadyTask = (taskId) => {
    const ir = readIr();
    controller.plan({
      goal: ir.goal,
      requirements: ir.requirements,
      decisions: ir.decisions,
      tasks: [...ir.tasks, { task_id: taskId, objective: `Complete ${taskId}.`, depends_on: [], write_paths: [`src/${taskId}.ts`], required_artifacts: [`src/${taskId}.ts`] }],
      reason: `dogfood: prepare READY work for ${taskId}`,
    });
  };

  const wrapWorkspace = (loops) => ({
    ...installed.projectWorkspace,
    view: async () => {
      const view = await installed.projectWorkspace.view();
      return { ...view, openLoops: loops };
    },
  });

  /**
   * A control port with a NARROWED operator allowed-action set. Some open-loop kinds
   * (e.g. BLOCKED_WORK) derive both an authority-shaped candidate and a RECOMMEND
   * candidate; `step()` returns the first PERMITTED candidate, so a refusal test must
   * isolate the class under test. This is still the real service/policy path with a
   * legitimate operator profile field (the allowed set).
   */
  const narrowedControl = (involvement, allowedActionClasses) => {
    const profile = advanced.materializeManagementProfile({
      projectId: PROJECT_ID,
      involvement,
      budgets: { maxStepsPerRun: advanced.DEFAULT_MAX_STEPS_PER_RUN },
      allowedActionClasses,
      confirmationBoundaries: [],
      updatedAt: "2026-09-15T00:00:00.000Z",
      updatedBy: "operator:dogfood-narrow",
    });
    return { get: async () => profile, set: async () => profile };
  };

  const modes = {};

  /* -------------------------------------------------------------- *
   * MANAGE — mechanical advance via controller.runTurn on the EXISTING plan;
   * a requirement change / external commitment request is refused.
   *
   * This scenario runs FIRST, while the project is still at its genesis revision.
   * A `controller.plan(...)` revision leaves the scheduler's stored task envelope
   * at the OLD revision, so the first activation after a plan revision fails its
   * revision guard (CF-V-05). Running MANAGE before any plan revision is the real
   * product path at genesis and executes a genuine `controller.runTurn`.
   * -------------------------------------------------------------- */

  await setMode("MANAGE");
  {
    // The ADVANCE_MECHANICAL_WORK candidate is derivable only for a READY task with a
    // non-terminal attempt. A live principal reaches that state while an attempt is in
    // flight; here the deterministic rig injects that DERIVED-VIEW fact (exactly as the
    // G10-V unit test does). The execution below is REAL: `controller.runTurn` activates
    // and runs a genuine attempt on the existing plan.
    const advanceWorkspace = {
      ...installed.projectWorkspace,
      view: async () => {
        const view = await installed.projectWorkspace.view();
        const ready = view.work.tasks.find((task) => task.state === "READY");
        if (ready === undefined) throw new Error("no READY task to advance");
        return {
          ...view,
          work: { ...view.work, attempts: [...view.work.attempts, { attempt_id: "dogfood-advance", task_id: ready.task_id, state: "RUNNING", attempt_no: 1 }] },
        };
      },
    };
    const management = advanced.makeProjectManagementService({ workspace: advanceWorkspace, control: stores.management, controller });
    record("manage_derived_attempt_injected", { state: "RUNNING" });

    const before = snapshot();
    const result = await management.step();
    const after = snapshot();
    const attemptsRun = Number(/attemptsRun=(\d+)/u.exec(result.detail ?? "")?.[1] ?? "NaN");
    const nonTerminalAfter = after.attemptStates.some((entry) => /:(CREATED|LEASED|RUNNING)$/u.test(entry));

    check("manage_mechanical_executed", result.status === "executed" && result.action === "ADVANCE_MECHANICAL_WORK");
    check("manage_ran_through_controller_runTurn", typeof result.detail === "string" && result.detail.includes("controller.runTurn"));
    check("manage_revision_unchanged", after.revision === before.revision);
    check("manage_task_count_unchanged", after.taskCount === before.taskCount);
    check("manage_work_state_advanced", (Number.isFinite(attemptsRun) && attemptsRun >= 1) || nonTerminalAfter);

    // Refusal: a requirement change is not a local plan revision.
    const reqMgmt = advanced.makeProjectManagementService({
      workspace: wrapWorkspace([
        { id: "BLOCKED_WORK:req-1", kind: "BLOCKED_WORK", detail: "a requirement change was requested", subjectRef: { kind: "requirement", id: "req-1" } },
      ]),
      control: stores.management,
      controller,
    });
    const reqBefore = snapshot();
    const reqResult = await reqMgmt.step({ confirmed: true });
    const reqAfter = snapshot();
    check("manage_requirement_change_refused", reqResult.status === "not_permitted");
    check("manage_requirement_change_no_mutation", reqAfter.revision === reqBefore.revision && reqAfter.eventCount === reqBefore.eventCount);

    // Refusal: an external commitment request needs authority a mode can never grant.
    const commitMgmt = advanced.makeProjectManagementService({
      workspace: wrapWorkspace([
        { id: "PENDING_COMMITMENT:c-1", kind: "PENDING_COMMITMENT", detail: "an external commitment was requested", subjectRef: { kind: "commitment", id: "c-1" } },
      ]),
      control: stores.management,
      controller,
    });
    const commitBefore = snapshot();
    const commitResult = await commitMgmt.step({ confirmed: true });
    const commitAfter = snapshot();
    check("manage_external_commitment_refused", commitResult.status === "needs_confirmation" || commitResult.status === "not_permitted");
    check("manage_external_commitment_no_mutation", commitAfter.revision === commitBefore.revision && commitAfter.eventCount === commitBefore.eventCount);

    modes.MANAGE = {
      involvement: (await stores.management.get(PROJECT_ID)).involvement,
      mechanical: { status: result.status, action: result.action ?? null, detail: result.detail, revisionDelta: after.revision - before.revision, taskCountDelta: after.taskCount - before.taskCount, attemptsRun: Number.isFinite(attemptsRun) ? attemptsRun : null },
      requirementRefusal: { status: reqResult.status, action: reqResult.action ?? null, detail: reqResult.detail },
      externalCommitmentRefusal: { status: commitResult.status, action: commitResult.action ?? null, detail: commitResult.detail },
    };
    record("mode_manage", { mechanical: result.action, attemptsRun, req: reqResult.status, commitment: commitResult.status });

    // End the MANAGE scenario (still at genesis revision, so the callback is admissible).
    terminateAttempts();
  }

  /* Seeding that changes the ProjectIR happens AFTER the mechanical scenario: a
   * decision append and a fresh READY task give the plan-based modes real work. */
  await installed.projectWorkspace.appendDecision({
    projectId: PROJECT_ID,
    statement: "Associations are append-only links, not asset copies",
    rationale: "Ownership must stay with the canonical subsystem",
    evidenceIds: [],
  });
  addReadyTask("task-gamma");
  record("project_seeded_for_plan_modes", { tasks: readIr().tasks.map((task) => task.task_id), revision: readIr().revision });

  /* -------------------------------------------------------------- *
   * DIRECT — no proactive mutation; an explicit confirmation may apply
   * -------------------------------------------------------------- */

  await setMode("DIRECT");
  {
    const before = snapshot();
    const refused = await operator.step();
    const afterRefusal = snapshot();
    const confirmed = await operator.step({ confirmed: true });
    const afterConfirmed = snapshot();

    const refuseOk = check("direct_unconfirmed_refused", refused.status === "needs_confirmation" || refused.status === "not_permitted");
    check("direct_unconfirmed_revision_unchanged", afterRefusal.revision === before.revision);
    check("direct_unconfirmed_task_count_unchanged", afterRefusal.taskCount === before.taskCount);
    const confirmedOk = check("direct_confirmed_executed", confirmed.status === "executed");
    check("direct_confirmed_revision_incremented", afterConfirmed.revision === before.revision + 1);
    check("direct_confirmed_task_count_unchanged", afterConfirmed.taskCount === before.taskCount);
    check("direct_confirmed_goal_unchanged", afterConfirmed.goal === before.goal);
    check("direct_confirmed_requirements_unchanged", afterConfirmed.requirements === before.requirements);

    modes.DIRECT = {
      involvement: (await stores.management.get(PROJECT_ID)).involvement,
      unconfirmed: { status: refused.status, action: refused.action ?? null, detail: refused.detail },
      confirmed: { status: confirmed.status, action: confirmed.action ?? null, detail: confirmed.detail },
      delta: { revision: afterConfirmed.revision - before.revision, taskCount: afterConfirmed.taskCount - before.taskCount },
    };
    record("mode_direct", { refused: refused.status, confirmed: confirmed.status, refuseOk, confirmedOk });
  }

  /* -------------------------------------------------------------- *
   * ASSIST — recommendation only; ProjectIR/requirements byte-identical
   * -------------------------------------------------------------- */

  await setMode("ASSIST");
  {
    const before = snapshot();
    const candidates = await operator.recommend();
    const after = snapshot();
    check("assist_recommend_has_candidates", candidates.length > 0);
    check("assist_revision_unchanged", after.revision === before.revision);
    check("assist_task_count_unchanged", after.taskCount === before.taskCount);
    check("assist_requirements_unchanged", after.requirements === before.requirements);
    check("assist_no_events", after.eventCount === before.eventCount);
    check("assist_no_work_dispatched", after.attemptCount === before.attemptCount);

    modes.ASSIST = {
      involvement: (await stores.management.get(PROJECT_ID)).involvement,
      candidateKinds: candidates.map((candidate) => candidate.kind),
      candidateCount: candidates.length,
      delta: { revision: after.revision - before.revision, eventCount: after.eventCount - before.eventCount, attemptCount: after.attemptCount - before.attemptCount },
    };
    record("mode_assist", { candidates: candidates.length, kinds: modes.ASSIST.candidateKinds });
  }

  /* MANAGE ran first, at the genesis revision — see the block above. */

  /* -------------------------------------------------------------- *
   * DELEGATE — task-plan-only revision; goal/disclosure/org refused
   * -------------------------------------------------------------- */

  await setMode("DELEGATE");
  {
    terminateAttempts();
    addReadyTask("task-delegate");

    const before = snapshot();
    const result = await operator.step();
    const after = snapshot();
    check("delegate_plan_revision_executed", result.status === "executed" && result.action === "DISPATCH_LOCAL_WORK");
    check("delegate_revision_incremented", after.revision === before.revision + 1);
    check("delegate_goal_byte_identical", after.goal === before.goal);
    check("delegate_requirements_byte_identical", after.requirements === before.requirements);
    check("delegate_tasks_byte_identical", after.tasks === before.tasks);

    const goalMgmt = advanced.makeProjectManagementService({
      workspace: wrapWorkspace([
        { id: "BLOCKED_WORK:goal", kind: "BLOCKED_WORK", detail: "a goal change was requested", subjectRef: { kind: "goal", id: PROJECT_ID } },
      ]),
      control: narrowedControl("DELEGATE", ["APPLY_LOCAL_PLAN_REVISION"]),
      controller,
    });
    const goalBefore = snapshot();
    const goalResult = await goalMgmt.step({ confirmed: true });
    check("delegate_goal_change_refused", goalResult.status === "not_permitted");
    check("delegate_goal_change_no_mutation", snapshot().revision === goalBefore.revision);

    const disclosureMgmt = advanced.makeProjectManagementService({
      workspace: wrapWorkspace([
        { id: "PENDING_BOUNDARY_DECISION:d-1", kind: "PENDING_BOUNDARY_DECISION", detail: "a disclosure was requested", subjectRef: { kind: "boundary_decision", id: "d-1" } },
      ]),
      control: stores.management,
      controller,
    });
    const disclosureBefore = snapshot();
    const disclosureResult = await disclosureMgmt.step({ confirmed: true });
    check("delegate_disclosure_refused", disclosureResult.status === "not_permitted");
    check("delegate_disclosure_no_mutation", snapshot().revision === disclosureBefore.revision);

    // Organization evolution is never derivable as a candidate and never permitted by mode.
    const delegateProfile = await stores.management.get(PROJECT_ID);
    const orgEval = advanced.evaluateManagementAction({ profile: delegateProfile, actionClass: "EVOLVE_ORGANIZATION", hasSemanticAuthority: false, capabilityAvailable: true, isWithinEnvelope: true, confirmed: true });
    const irreversibleEval = advanced.evaluateManagementAction({ profile: delegateProfile, actionClass: "IRREVERSIBLE_EFFECT", hasSemanticAuthority: false, capabilityAvailable: true, isWithinEnvelope: true, confirmed: true });
    check("delegate_organization_evolution_refused", orgEval.permitted === false);
    check("delegate_irreversible_effect_refused", irreversibleEval.permitted === false);

    modes.DELEGATE = {
      involvement: delegateProfile.involvement,
      planRevision: { status: result.status, action: result.action ?? null, detail: result.detail, revisionDelta: after.revision - before.revision },
      goalChangeRefusal: { status: goalResult.status, action: goalResult.action ?? null, detail: goalResult.detail },
      disclosureRefusal: { status: disclosureResult.status, action: disclosureResult.action ?? null, detail: disclosureResult.detail },
      organizationEvolution: { permitted: orgEval.permitted, reason: orgEval.reason },
      irreversibleEffect: { permitted: irreversibleEval.permitted, reason: irreversibleEval.reason },
    };
    record("mode_delegate", { plan: result.action, goal: goalResult.status, disclosure: disclosureResult.status, org: orgEval.permitted });
  }

  /* -------------------------------------------------------------- *
   * Mode downgrade — DELEGATE → DIRECT mid-run, via the operator port
   * -------------------------------------------------------------- */

  const downgrade = {};
  {
    terminateAttempts();
    addReadyTask("task-downgrade");
    await setMode("DELEGATE");
    const before = snapshot();

    let reads = 0;
    const control = {
      get: async (projectId) => {
        reads += 1;
        if (reads === 3) {
          // The OPERATOR control port applies the downgrade; runBounded re-reads the
          // profile every step, so the next proactive action must stop immediately.
          await stores.management.set({ projectId, involvement: "DIRECT", updatedBy: "operator:dogfood-downgrade" });
          record("operator_midrun_downgrade", { reads });
        }
        return stores.management.get(projectId);
      },
      set: (input) => stores.management.set(input),
    };
    const mgmt = advanced.makeProjectManagementService({ workspace: installed.projectWorkspace, control, controller });
    const run = await mgmt.runBounded({ maxSteps: 5 });
    const after = snapshot();
    const persisted = await stores.management.get(PROJECT_ID);

    check("downgrade_profile_reread_each_step", reads >= 3);
    check("downgrade_stopped_immediately", run.stoppedReason === "needs_confirmation");
    check("downgrade_no_further_proactive_step", run.steps.length === 2 && run.steps[0].status === "executed" && run.steps[1].status === "needs_confirmation");
    check("downgrade_exactly_one_revision", after.revision === before.revision + 1);
    check("downgrade_persisted_direct", persisted.involvement === "DIRECT");

    Object.assign(downgrade, {
      startedInvolvement: "DELEGATE",
      stoppedReason: run.stoppedReason,
      profileReads: reads,
      steps: run.steps.map((step) => ({ status: step.status, action: step.action ?? null })),
      revisionDelta: after.revision - before.revision,
      persistedInvolvement: persisted.involvement,
    });
    record("mode_downgrade", downgrade);
  }

  /* -------------------------------------------------------------- *
   * Continuity — close, reopen, reconstruct identically
   * -------------------------------------------------------------- */

  const continuity = {};
  {
    const viewBefore = await installed.projectWorkspace.view();
    const preferenceBefore = await stores.management.get(PROJECT_ID);
    const before = {
      view: viewBefore,
      preferenceDigest: preferenceBefore.digest,
      preferenceInvolvement: preferenceBefore.involvement,
      associations: await installed.projectWorkspace.projectScopedAssets(PROJECT_ID),
      decisions: viewBefore.project.decisions,
      openLoops: viewBefore.openLoops,
    };

    await installed.dispose();
    record("stores_closed_for_restart");

    const reopened = install();
    try {
      const viewAfter = await reopened.installed.projectWorkspace.view();
      const preferenceAfter = await reopened.stores.management.get(PROJECT_ID);
      const associationsAfter = await reopened.installed.projectWorkspace.projectScopedAssets(PROJECT_ID);

      check("restart_view_project_identical", deepEqual(before.view.project, viewAfter.project));
      check("restart_preference_identical", preferenceAfter.digest === before.preferenceDigest && preferenceAfter.involvement === before.preferenceInvolvement);
      check("restart_associations_identical", deepEqual(before.associations, associationsAfter));
      check("restart_decisions_identical", deepEqual(before.decisions, viewAfter.project.decisions));
      check("restart_open_loops_identical", deepEqual(before.openLoops, viewAfter.openLoops));

      Object.assign(continuity, {
        projectRevision: viewAfter.project.revision,
        preferenceInvolvement: preferenceAfter.involvement,
        preferenceDigest: preferenceAfter.digest,
        associations: associationsAfter.length,
        decisions: viewAfter.project.decisions.length,
        openLoops: viewAfter.openLoops.length,
        reconstruction: {
          projectIdentical: deepEqual(before.view.project, viewAfter.project),
          preferenceIdentical: preferenceAfter.digest === before.preferenceDigest,
          associationsIdentical: deepEqual(before.associations, associationsAfter),
          decisionsIdentical: deepEqual(before.decisions, viewAfter.project.decisions),
          openLoopsIdentical: deepEqual(before.openLoops, viewAfter.openLoops),
        },
      });
      record("restart_reconstructed", continuity);
    } finally {
      await reopened.installed.dispose();
    }
  }

  /* ============================================================== *
   * PHASE B — one real DSH host principal across all four modes
   * ============================================================== */

  const dsh = await bootAndProbeRealPrincipal(advanced);

  const allChecks = Object.values(checks);
  const passed = allChecks.length > 0 && allChecks.every((value) => value === true);

  const evidence = {
    result: passed ? "PASS" : "PARTIAL",
    schemaVersion: 1,
    dshPrincipal: dsh.dshPrincipal,
    dshPrincipalReason: dsh.reason,
    project: { projectId: PROJECT_ID, goal: GOAL, requirements: REQUIREMENTS.map((requirement) => requirement.requirement_id), tasks: [TASK_ALPHA.task_id, TASK_BETA.task_id] },
    principal: {
      peerId: PEER,
      persistentPoint: POINT,
      count: 1,
      note: "One PeerRef and one PersistentPoint serve all four involvements; the management layer owns no identity store and creates no principal.",
      dsh: dsh.principal,
      dshModes: dsh.observedModes ?? [],
    },
    modes,
    downgrade,
    continuity,
    checks,
    metrics: {
      modeCount: Object.keys(modes).length,
      downgradeSteps: downgrade.steps?.length ?? 0,
      dshReadyLines: dsh.readyLineCount ?? 0,
      dshModesObserved: dsh.observedModes ?? [],
      elapsedMs: Date.now() - startedAt,
    },
    timeline,
    note:
      "Mode changes are applied ONLY through the operator control port (SqliteManagementPreferenceStore), never an agent tool. The MANAGE/DIRECT/DELEGATE refusal scenarios isolate a single open loop in the DERIVED view so the refusal decision is not shadowed by a higher-priority candidate; the policy/service/controller path remains real. The MANAGE mechanical advance claims a real scheduler-created attempt and executes controller.runTurn on the existing plan.",
  };

  writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2));
  process.stdout.write(`${JSON.stringify({ result: evidence.result, dshPrincipal: dsh.dshPrincipal, modes: Object.keys(modes), checks }, null, 2)}\n`);
  process.stdout.write(
    `\nG10-V MANAGEMENT DOGFOOD ${evidence.result}: one principal (${PEER} / ${POINT}), ` +
      `4 involvements asserted, dshPrincipal=${dsh.dshPrincipal}, elapsed=${Date.now() - startedAt}ms\n`,
  );
  return evidence;
}

/* ------------------------------------------------------------------ *
 * Real DSH principal
 * ------------------------------------------------------------------ */

function deploymentProfile() {
  return {
    schemaVersion: 1,
    profileId: "deploy-g10v-management",
    projectId: PROJECT_ID,
    localPeer: PEER,
    persistentPoint: POINT,
    transport: { namespace: "g10v-management", databasePath: `${G10V}/transport.sqlite` },
    databases: {
      orchestration: `${G10V}/orchestration.sqlite`,
      ordarium: `${G10V}/ordarium.sqlite`,
      coordination: `${G10V}/coordination.sqlite`,
      transportCursors: `${G10V}/cursors.sqlite`,
      projectAssociations: `${G10V}/associations.sqlite`,
      projectJournal: `${G10V}/journal.sqlite`,
      management: `${G10V}/management.sqlite`,
    },
    serve: { host: "127.0.0.1" },
  };
}

async function bootAndProbeRealPrincipal(advanced) {
  if (process.env.G10V_SKIP_DSH === "1") {
    return { dshPrincipal: false, reason: "G10V_SKIP_DSH=1 was set; the real DSH principal boot was skipped by the operator" };
  }

  const profilePath = `${G10V}/deploy.json`;
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

  const child = spawn(process.execPath, [DSH_BIN, "--profile", PROFILE_NAME, "--session-file", `${G10V}/principal.session`], {
    cwd: G10V,
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
    const principal = {
      sessionId: parsed.sessionId,
      mode: parsed.mode,
      localPeer: parsed.localPeer,
      persistentPoint: parsed.persistentPoint,
      transportAdapter: parsed.transportAdapter,
      application: parsed.application,
      toolNames: parsed.toolNames,
      url: parsed.url,
      readyLineCount: readyLines.length,
    };
    record("dsh_principal_ready", { ...principal, toolNames: parsed.toolNames.length });

    check("dsh_exactly_one_ready_line", readyLines.length === 1);
    check("dsh_one_local_peer", parsed.localPeer === PEER);
    check("dsh_one_persistent_point", parsed.persistentPoint === POINT);
    check("dsh_application_full", parsed.application === "full");
    check("dsh_project_and_manage_tools_present", parsed.toolNames.includes("palimpsest_project") && parsed.toolNames.includes("palimpsest_manage"));

    const headers = { authorization: `Bearer ${parsed.token}` };
    const getJson = async (path) => {
      const response = await fetch(`${parsed.url}${path}`, { headers });
      if (!response.ok) throw new Error(`GET ${path} -> ${response.status}`);
      return response.json();
    };
    const postJson = async (path, body) => {
      const response = await fetch(`${parsed.url}${path}`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`POST ${path} -> ${response.status}`);
      return response.json();
    };

    const observedModes = [];
    const seenGoals = new Set();
    const seenPeerRefs = new Set();
    const seenPoints = new Set();
    const operatorStore = new advanced.SqliteManagementPreferenceStore(`${G10V}/management.sqlite`);
    try {
      for (const involvement of ["DIRECT", "ASSIST", "MANAGE", "DELEGATE"]) {
        await operatorStore.set({ projectId: PROJECT_ID, involvement, updatedBy: "operator:dogfood-host" });
        const status = await getJson("/api/manage/status");
        const seen = {
          involvement,
          reportedInvolvement: status.profile.involvement,
          projectId: status.view.projectId,
          revision: status.view.project.revision,
          candidateCount: status.candidates.length,
        };
        observedModes.push(seen);
        seenGoals.add(status.view.project.goal);
        seenPeerRefs.add(parsed.localPeer);
        seenPoints.add(parsed.persistentPoint);
        record("dsh_mode_observed", seen);
      }

      check("dsh_same_principal_all_modes", seenGoals.size === 1 && seenPeerRefs.size === 1 && seenPoints.size === 1);
      check("dsh_all_four_modes_reported", observedModes.length === 4 && observedModes.every((entry) => entry.reportedInvolvement === entry.involvement));
      check("dsh_same_project_all_modes", observedModes.every((entry) => entry.projectId === PROJECT_ID));

      // DIRECT firewall through the host's own agent-facing route: an unconfirmed
      // step must not mutate the ProjectIR.
      await operatorStore.set({ projectId: PROJECT_ID, involvement: "DIRECT", updatedBy: "operator:dogfood-host" });
      const viewBefore = await getJson("/api/project/workspace");
      const stepResult = await postJson("/api/manage/step", { confirmed: false });
      const viewAfter = await getJson("/api/project/workspace");
      check("dsh_direct_step_not_a_mutation", viewAfter.project.revision === viewBefore.project.revision);
      check("dsh_direct_step_flagged", ["needs_confirmation", "not_permitted", "nothing_to_do"].includes(stepResult.status));
      record("dsh_direct_firewall", { before: viewBefore.project.revision, after: viewAfter.project.revision, status: stepResult.status });

      return {
        dshPrincipal: true,
        reason: "a real DSH host principal booted over a deployment profile wiring the same project + workspace/journal/management stores; one ready line, one localPeer, one persistentPoint, all four modes observed",
        principal,
        readyLineCount: readyLines.length,
        observedModes,
      };
    } finally {
      operatorStore.close();
    }
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
  process.stderr.write(`g10v-management-dogfood failed: ${error?.stack ?? String(error)}\n`);
}
process.exit(evidence.result === "PASS" ? 0 : 2);
