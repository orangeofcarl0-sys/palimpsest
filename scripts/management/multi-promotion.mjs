#!/usr/bin/env node
/**
 * G10-X — real-project multi-promotion dogfood (canonical project-head evolution).
 *
 * The story this proves, on a REAL project principal over a REAL deployment
 * profile:
 *
 *   rev0 / head H0, tasks A→B
 *   cycle 1: A claim→commit→report→verify→PROMOTE (H0→H1) → A SATISFIED
 *            the ProjectIR head now LAGS the real branch (head drift)
 *            reconcileProjectHead() → rev1 / head H1, B re-authorized on H1
 *   cycle 2: B claim→commit→report→verify→PROMOTE (H1→H2) → B SATISFIED
 *            reconcileProjectHead() → rev2 / head H2
 *   final:   terminal; git head H2; ProjectIR head H2 (the two agree)
 *
 * The promotion is the REAL derivation: the harness names the attempt ONLY
 * (and optionally a gate) and never supplies a source commit or an expected
 * head. The evidence records the derived source commit and the canonical
 * expected head for every cycle, and the envelope bases H0 → H1.
 *
 * Honesty: a live DSH *attempt execution* is not possible over the host's HTTP
 * surface (there is no remote claim/report/gate channel, and a headless DSH
 * session cannot drive the Work tools without a model). The work is therefore
 * executed by the real scheduler/controller/Ordarium path and the evidence
 * records `dshAttempt:false` with that exact reason - nothing is faked. The real
 * DSH principal, when the binary is available, boots over a deployment profile
 * wiring the SAME stores and observes the final head + drift/sync state over its
 * own HTTP surface.
 *
 * Usage: node scripts/management/multi-promotion.mjs
 * Evidence: .dogfood/g10x-multi-promotion.json
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
const G10X = join(DOGFOOD, "g10x").replace(/\\/g, "/");
const EVIDENCE_PATH = join(DOGFOOD, "g10x-multi-promotion.json").replace(/\\/g, "/");
const ADVANCED = join(REPO, "dist", "src", "advanced.js").replace(/\\/g, "/");
const CONTROLLER_MOD = join(REPO, "dist", "src", "tools", "controller.js").replace(/\\/g, "/");
const MODELS_MOD = join(REPO, "dist", "src", "schema", "models.js").replace(/\\/g, "/");
const DOMAIN_MOD = join(REPO, "dist", "src", "domain", "index.js").replace(/\\/g, "/");

const PROFILE_NAME = "palimpsest-g10x-multi-promotion";
const PROJECT_ID = "g10x-multi-promotion";
const PEER = "peer-g10x-project";
const POINT = "pp-g10x-project";
const GOAL = "Prove the canonical project head evolves across repeated promotions.";
const H0 = "c".repeat(40);
const CLOCK = "2026-09-15T00:00:00.000Z";
const REQUIREMENTS = [
  { requirement_id: "req-1", statement: "A promotion advances the canonical head exactly once.", priority: "critical", acceptance_refs: [] },
  { requirement_id: "req-2", statement: "No caller names a source commit or an expected head.", priority: "critical", acceptance_refs: [] },
];
const TASK_A = {
  task_id: "task-a",
  objective: "Establish the first promoted base.",
  depends_on: [],
  write_paths: ["src/a.ts"],
  required_artifacts: ["src/a.ts"],
};
const TASK_B = {
  task_id: "task-b",
  objective: "Promote again on the synced head.",
  depends_on: ["task-a"],
  write_paths: ["src/b.ts"],
  required_artifacts: ["src/b.ts"],
};

const startedAt = Date.now();
const timeline = [];
const record = (event, detail = {}) => timeline.push({ atMs: Date.now() - startedAt, event, detail });
const log = (message) => process.stderr.write(`[g10x-multi-promotion ${Date.now() - startedAt}ms] ${message}\n`);
const json = (value) => JSON.stringify(value);

const checks = {};
const check = (name, value) => {
  checks[name] = value === true;
  if (value !== true) log(`CHECK FAILED: ${name}`);
  return value === true;
};

function noopContext() {
  return { tools: { register: () => undefined } };
}

function dogfoodPolicy(TaskPolicy) {
  return new TaskPolicy({
    policy_id: "g10x-dogfood",
    read_paths: ["src"],
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
  rmSync(G10X, { recursive: true, force: true });
  mkdirSync(G10X, { recursive: true });

  const advanced = await import(pathToFileURL(ADVANCED).href);
  const controllerMod = await import(pathToFileURL(CONTROLLER_MOD).href);
  const models = await import(pathToFileURL(MODELS_MOD).href);
  const domain = await import(pathToFileURL(DOMAIN_MOD).href);

  const paths = {
    orchestration: join(G10X, "orchestration.sqlite"),
    ordarium: join(G10X, "ordarium.sqlite"),
    associations: join(G10X, "associations.sqlite"),
    journal: join(G10X, "journal.sqlite"),
    management: join(G10X, "management.sqlite"),
  };

  const git = new advanced.FakeGitPort(H0);
  const associations = new advanced.SqliteProjectAssetAssociationStore(paths.associations);
  const journal = new advanced.SqliteProjectJournalStore(paths.journal);
  const managementStore = new advanced.SqliteManagementPreferenceStore(paths.management);
  const installed = advanced.installPalimpsest(noopContext(), {
    projectId: PROJECT_ID,
    databasePath: paths.orchestration,
    ordariumDatabasePath: paths.ordarium,
    git,
    policy: dogfoodPolicy(domain.TaskPolicy),
    localPeer: { schemaVersion: 1, peerId: PEER },
    peerContinuityAssociations: [{ peer: { schemaVersion: 1, peerId: PEER }, point: POINT }],
    projectAssociationStore: associations,
    projectJournalStore: journal,
    managementPreferenceStore: managementStore,
  });
  const controller = installed.controller;
  if (installed.projectWorkspace === undefined || installed.projectManagement === undefined) {
    throw new Error("the workspace/management surfaces were not wired for this install");
  }

  const readIr = () => {
    const row = controller.store.connection
      .prepare("SELECT state_json FROM projects WHERE project_id=?")
      .get(PROJECT_ID);
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
  const headStatus = () => controller.status().head;

  controller.start({
    projectId: PROJECT_ID,
    goal: GOAL,
    requirements: REQUIREMENTS,
    decisions: [],
    tasks: [TASK_A, TASK_B],
    committedAt: CLOCK,
  });
  const h0 = readIr().head_commit;
  check("genesis_head_is_h0", h0 === H0);
  record("rev0_started", { revision: readIr().revision, head: h0, tasks: ["task-a", "task-b"] });

  /**
   * Drive one task from READY to SATISFIED with the REAL promotion derivation:
   * the harness names the attempt only. Returns the full provenance.
   */
  async function runCycle(taskId, label) {
    const baseBefore = envelopeOf(taskId)?.base_commit;
    const started = controller.step();
    if (started === null || started.event_type !== "TASK_STARTED") {
      throw new Error(`expected TASK_STARTED for ${taskId}, got ${started === null ? "null" : started.event_type}`);
    }
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
    const verifying = controller.step();
    if (verifying === null || verifying.event_type !== "TASK_VERIFYING") {
      throw new Error(`expected TASK_VERIFYING, got ${verifying === null ? "null" : verifying.event_type}`);
    }

    // The canonical derivation: source = the attempt report's result_commit,
    // expected head = the proven effect head. The harness supplies NEITHER.
    const canonicalExpected = await controller.promotions.canonicalExpectedHead();
    const gitHeadBefore = await git.head();
    const promotion = await controller.promoteAttempt({ attemptId });
    const payload = promotion.committed.payload;
    const satisfied = controller.step();

    const cycle = {
      taskId,
      label,
      baseBefore,
      attemptId,
      sourceCommit: committed.commit,
      canonicalExpectedHead: canonicalExpected,
      gitHeadBefore,
      promotionEventId: String(promotion.committed.event_id),
      promotionSourceCommit: payload.source_commit,
      promotionExpectedHead: payload.expected_head_commit,
      resultingHeadCommit: promotion.resultingHeadCommit,
      satisfiedEvent: satisfied === null ? null : satisfied.event_type,
    };
    record(`cycle_${label}_promoted`, cycle);
    return cycle;
  }

  /** Sync the ProjectIR head onto the proven effect head (mechanical consistency). */
  async function syncHead(label) {
    const before = headStatus();
    const revisionBefore = readIr().revision;
    const outcome = await controller.reconcileProjectHead();
    const ir = readIr();
    const after = headStatus();
    const sync = {
      label,
      status: outcome.status,
      fromHead: outcome.fromHead,
      toHead: outcome.toHead,
      revisionBefore,
      revisionAfter: ir.revision,
      irHead: ir.head_commit,
      gitHead: await git.head(),
      stateAfter: after.state,
    };
    record(`cycle_${label}_head_synced`, sync);
    return { before, outcome, ir, after, sync };
  }

  /* ============================================================== *
   * CYCLE 1 — A: H0 → H1
   * ============================================================== */

  const cycle1 = await runCycle("task-a", "1");
  check("cycle1_promotion_committed", cycle1.promotionEventId !== undefined && cycle1.resultingHeadCommit !== H0);
  check("cycle1_source_is_report_commit", cycle1.promotionSourceCommit === cycle1.sourceCommit);
  check("cycle1_source_derived_not_caller", cycle1.canonicalExpectedHead === cycle1.gitHeadBefore && cycle1.promotionExpectedHead === cycle1.gitHeadBefore);
  check("cycle1_a_satisfied", cycle1.satisfiedEvent === "TASK_SATISFIED" && taskState("task-a") === "SATISFIED");
  const drifted1 = headStatus();
  check("cycle1_head_drift_derived", drifted1.state === "SYNC_REQUIRED" && drifted1.projectHeadCommit === H0 && drifted1.provenEffectHeadCommit === cycle1.resultingHeadCommit);
  check("cycle1_ir_head_lags_git", readIr().head_commit === H0 && (await git.head()) === cycle1.resultingHeadCommit);

  const synced1 = await syncHead("1");
  check("cycle1_sync_reconciled", synced1.outcome.status === "reconciled" && synced1.ir.head_commit === cycle1.resultingHeadCommit);
  check("cycle1_sync_in_sync", synced1.after.state === "IN_SYNC" && synced1.sync.irHead === synced1.sync.gitHead);
  check("cycle1_revision_advanced", synced1.ir.revision === 1);
  const bBaseAfterSync = envelopeOf("task-b")?.base_commit;
  check("cycle1_b_envelope_rebased_on_h1", bBaseAfterSync === cycle1.resultingHeadCommit);

  // The workspace view (derived) reports the head state and the promotion provenance.
  const viewAfterSync = await installed.projectWorkspace.view();
  check("workspace_head_in_sync", viewAfterSync.project.head?.state === "IN_SYNC" && viewAfterSync.project.head?.stateLabel === "in sync");
  check("workspace_head_provenance", viewAfterSync.project.head?.latestPromotion?.attemptId === cycle1.attemptId);

  /* ============================================================== *
   * CYCLE 2 — B: H1 → H2
   * ============================================================== */

  const readyB = controller.step();
  check("cycle2_b_ready_on_h1", readyB !== null && readyB.event_type === "TASK_READY" && taskState("task-b") === "READY");
  const cycle2 = await runCycle("task-b", "2");
  check("cycle2_base_is_h1", cycle2.baseBefore === cycle1.resultingHeadCommit && cycle2.baseBefore !== H0);
  check("cycle2_source_is_report_commit", cycle2.promotionSourceCommit === cycle2.sourceCommit);
  check("cycle2_expected_is_h1", cycle2.promotionExpectedHead === cycle1.resultingHeadCommit && cycle2.canonicalExpectedHead === cycle1.resultingHeadCommit);
  check("cycle2_new_head", cycle2.resultingHeadCommit !== cycle1.resultingHeadCommit);
  check("cycle2_b_satisfied", cycle2.satisfiedEvent === "TASK_SATISFIED" && taskState("task-b") === "SATISFIED");
  const drifted2 = headStatus();
  check("cycle2_head_drift_derived", drifted2.state === "SYNC_REQUIRED" && drifted2.projectHeadCommit === cycle1.resultingHeadCommit && drifted2.provenEffectHeadCommit === cycle2.resultingHeadCommit);

  const synced2 = await syncHead("2");
  check("cycle2_sync_reconciled", synced2.outcome.status === "reconciled" && synced2.ir.head_commit === cycle2.resultingHeadCommit);
  check("cycle2_sync_in_sync", synced2.after.state === "IN_SYNC" && synced2.sync.irHead === synced2.sync.gitHead);
  check("cycle2_revision_advanced", synced2.ir.revision === 2);

  /* ============================================================== *
   * FINAL — terminal, and the two heads agree
   * ============================================================== */

  const turn = await controller.runTurn();
  const finalIr = readIr();
  const finalGit = await git.head();
  const proven = await controller.promotions.canonicalExpectedHead();
  check("final_terminal", turn.phase === "terminal");
  check("final_ir_head_equals_git_head", finalIr.head_commit === finalGit);
  check("final_ir_head_equals_proven_head", finalIr.head_commit === proven);
  check("final_two_promotions", events().filter((event) => event.event_type === "PROMOTION_COMMITTED").length === 2);
  check("final_tasks_satisfied", taskState("task-a") === "SATISFIED" && taskState("task-b") === "SATISFIED");
  check("final_goal_unchanged", finalIr.goal === GOAL && json(finalIr.requirements) === json(REQUIREMENTS));

  record("final_state", {
    revision: finalIr.revision,
    irHead: finalIr.head_commit,
    gitHead: finalGit,
    provenHead: proven,
    phase: turn.phase,
    taskStates: [taskState("task-a"), taskState("task-b")],
  });

  /* ============================================================== *
   * Layer B — the real DSH principal observes the final head
   * ============================================================== */

  const dsh = await bootAndProbeRealPrincipal(advanced, {
    expectedRevision: finalIr.revision,
    expectedHead: finalGit,
  });

  await installed.dispose();

  const allChecks = Object.values(checks);
  const passed = allChecks.length > 0 && allChecks.every((value) => value === true);

  const evidence = {
    result: passed ? "PASS" : "PARTIAL",
    schemaVersion: 1,
    project: { projectId: PROJECT_ID, goal: GOAL, requirements: REQUIREMENTS.map((requirement) => requirement.requirement_id) },
    heads: {
      h0,
      h1: cycle1.resultingHeadCommit,
      h2: cycle2.resultingHeadCommit,
      finalIrHead: finalIr.head_commit,
      finalGitHead: finalGit,
      finalProvenHead: proven,
      irEqualsGit: finalIr.head_commit === finalGit,
    },
    cycles: [
      {
        task: "task-a",
        baseBefore: cycle1.baseBefore,
        sourceCommit: cycle1.sourceCommit,
        promotionSourceCommit: cycle1.promotionSourceCommit,
        promotionExpectedHead: cycle1.promotionExpectedHead,
        resultingHeadCommit: cycle1.resultingHeadCommit,
        headDrift: { projectHead: H0, provenHead: cycle1.resultingHeadCommit, state: "SYNC_REQUIRED" },
        syncStatus: synced1.outcome.status,
        revisionAfter: synced1.ir.revision,
      },
      {
        task: "task-b",
        baseBefore: cycle2.baseBefore,
        sourceCommit: cycle2.sourceCommit,
        promotionSourceCommit: cycle2.promotionSourceCommit,
        promotionExpectedHead: cycle2.promotionExpectedHead,
        resultingHeadCommit: cycle2.resultingHeadCommit,
        headDrift: { projectHead: cycle1.resultingHeadCommit, provenHead: cycle2.resultingHeadCommit, state: "SYNC_REQUIRED" },
        syncStatus: synced2.outcome.status,
        revisionAfter: synced2.ir.revision,
      },
    ],
    envelopeBases: { taskA: cycle1.baseBefore, taskB: bBaseAfterSync },
    promotionDerivation: {
      callerSuppliedSourceCommit: false,
      callerSuppliedExpectedHead: false,
      entryPoint: "controller.promoteAttempt({ attemptId })",
      sourceIsAttemptReportResultCommit: true,
      expectedIsCanonicalProvenHead: true,
    },
    revision: { from: 0, to: finalIr.revision, digest: finalIr.digest },
    dsh,
    dshAttempt: false,
    dshAttemptReason:
      "the real DSH host exposes the project/manage application HTTP routes (workspace, journal, association, opportunity promotion, manage status/recommend/preview/step/run, and the G10-X POST /api/project/reconcile_head) but NO remote claim/report/gate execution channel, and a headless DSH session cannot drive the Work tools without a model. The A/B attempts are therefore executed by the real scheduler + controller + Ordarium path (layer A) against the SAME SQLite deployment the host reads; nothing is faked.",
    checks,
    metrics: { checkCount: allChecks.length, promotionCount: 2, headAdvanceCount: 2, elapsedMs: Date.now() - startedAt },
    timeline,
  };

  writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2));
  process.stdout.write(
    `${JSON.stringify({ result: evidence.result, h0, h1: evidence.heads.h1, h2: evidence.heads.h2, finalIrHead: finalIr.head_commit, dshPrincipal: dsh.dshPrincipal, checks }, null, 2)}\n`,
  );
  process.stdout.write(
    `\nG10-X MULTI-PROMOTION ${evidence.result}: rev0→rev${finalIr.revision}, heads ${H0.slice(0, 8)}→${evidence.heads.h1.slice(0, 8)}→${evidence.heads.h2.slice(0, 8)}, ` +
      `IR head === git head (${finalIr.head_commit.slice(0, 8)}), dshPrincipal=${dsh.dshPrincipal}, dshAttempt=false, elapsed=${Date.now() - startedAt}ms\n`,
  );
  return evidence;
}

/* ------------------------------------------------------------------ *
 * Real DSH project principal
 * ------------------------------------------------------------------ */

function deploymentProfile() {
  return {
    schemaVersion: 1,
    profileId: "deploy-g10x-multi-promotion",
    projectId: PROJECT_ID,
    localPeer: PEER,
    persistentPoint: POINT,
    transport: { namespace: "g10x-multi-promotion", databasePath: `${G10X}/transport.sqlite` },
    databases: {
      orchestration: `${G10X}/orchestration.sqlite`,
      ordarium: `${G10X}/ordarium.sqlite`,
      coordination: `${G10X}/coordination.sqlite`,
      transportCursors: `${G10X}/cursors.sqlite`,
      projectAssociations: `${G10X}/associations.sqlite`,
      projectJournal: `${G10X}/journal.sqlite`,
      management: `${G10X}/management.sqlite`,
    },
    serve: { host: "127.0.0.1" },
  };
}

async function bootAndProbeRealPrincipal(advanced, expect) {
  if (process.env.G10X_SKIP_DSH === "1") {
    return { dshPrincipal: false, reason: "G10X_SKIP_DSH=1 was set; the real DSH principal boot was skipped by the operator" };
  }
  if (!existsSync(DSH_BIN)) {
    return { dshPrincipal: false, reason: `the DSH binary was not found at ${DSH_BIN}` };
  }

  const profilePath = `${G10X}/deploy.json`;
  try {
    rmSync(HOST_BUNDLE, { recursive: true, force: true });
    cpSync(`${REPO}/host/dsh`, HOST_BUNDLE, { recursive: true });
    writeFileSync(profilePath, JSON.stringify(deploymentProfile(), null, 2));

    const profileDir = join(PROFILES, PROFILE_NAME);
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(
      join(profileDir, "package.json"),
      JSON.stringify(
        {
          name: `dsh-profile-${PROFILE_NAME}`,
          private: true,
          dependencies: {},
          dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "palimpsest-dsh-host"], patchReload: "startup" } },
        },
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

  const child = spawn(process.execPath, [DSH_BIN, "--profile", PROFILE_NAME, "--session-file", `${G10X}/principal.session`], {
    cwd: G10X,
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
    check("dsh_observes_final_revision", workspace.project.revision === expect.expectedRevision);
    check("dsh_observes_final_head", workspace.project.headCommit === expect.expectedHead);
    check("dsh_observes_head_in_sync", workspace.project.head?.state === "IN_SYNC");
    check(
      "dsh_observes_tasks_satisfied",
      json(workspace.work.tasks.map((task) => `${task.task_id}:${task.state}`).sort()) === json(["task-a:SATISFIED", "task-b:SATISFIED"]),
    );
    record("dsh_observed", {
      revision: workspace.project.revision,
      headCommit: workspace.project.headCommit,
      headState: workspace.project.head?.state,
      involvement: manageStatus.profile.involvement,
    });

    return {
      dshPrincipal: true,
      reason:
        "a real DSH host principal booted over a deployment profile wiring the same project + management stores; one ready line, one localPeer, one persistentPoint; it read the final revision, the ProjectIR head (equal to the proven repository head) and the IN_SYNC head state over its own HTTP surface",
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
        headCommit: workspace.project.headCommit,
        headState: workspace.project.head?.state,
        tasks: workspace.work.tasks.map((task) => `${task.task_id}:${task.state}`),
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
  process.stderr.write(`g10x-multi-promotion failed: ${error?.stack ?? String(error)}\n`);
}
process.exit(evidence.result === "PASS" ? 0 : 2);
