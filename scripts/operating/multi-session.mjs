/**
 * G10-AB §37/§44 — multi-session posture and crash-honest management activity.
 *
 * Session 1 (this process): the project starts at the safe default FOCUS + DIRECT
 * (no stored state), the operator sets EXPLORE + VERIFY and then MANAGE, and
 * management selects and executes one action.
 *
 * Session 2 (a SEPARATE child process): reopens the SAME deployment-local stores
 * and proves the Work Mode preference, the management involvement, both mode
 * histories and the durable management activity all survived the restart.
 *
 * Crash case (§44): a child process is killed the instant the SELECTED activity
 * record is written and before the governed action runs. A later session must
 * find the record unresolved - never a fabricated success.
 *
 * Usage: node scripts/operating/multi-session.mjs
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..", "..");
const mod = (...segments) => pathToFileURL(join(REPO, ...segments)).href;
const PROJECT = "operating-dogfood";
const CLOCK = "2026-09-16T00:00:00Z";

const taskSpec = (taskId) => ({
  task_id: taskId,
  objective: `Complete ${taskId}.`,
  depends_on: [],
  write_paths: [`src/${taskId}.py`],
  required_artifacts: [`src/${taskId}.py`],
});

class FixedClock {
  next = () => CLOCK;
}

async function load() {
  const { EventStore } = await import(mod("dist/src/state/index.js"));
  const { createPalimpsestEffects, FakeGitPort } = await import(mod("dist/src/effects/index.js"));
  const { ProjectController } = await import(mod("dist/src/tools/index.js"));
  const { TaskPolicy } = await import(mod("dist/src/domain/index.js"));
  const { builtinRecipeRegistry } = await import(mod("dist/src/recipes/index.js"));
  const { SqliteManagementPreferenceStore, makeProjectManagementService } = await import(
    mod("dist/src/project_management/index.js")
  );
  const { makeProjectWorkspaceService } = await import(mod("dist/src/project_workspace/index.js"));
  const { SqliteWorkModePreferenceStore, SqliteManagementActivityStore } = await import(
    mod("dist/src/project_operating/index.js")
  );
  return {
    EventStore,
    createPalimpsestEffects,
    FakeGitPort,
    ProjectController,
    TaskPolicy,
    builtinRecipeRegistry,
    SqliteManagementPreferenceStore,
    makeProjectManagementService,
    makeProjectWorkspaceService,
    SqliteWorkModePreferenceStore,
    SqliteManagementActivityStore,
  };
}

async function makeRig(dir, { crashOnTerminalActivity = false } = {}) {
  const {
    EventStore,
    createPalimpsestEffects,
    FakeGitPort,
    ProjectController,
    TaskPolicy,
    builtinRecipeRegistry,
    SqliteManagementPreferenceStore,
    makeProjectManagementService,
    makeProjectWorkspaceService,
    SqliteWorkModePreferenceStore,
    SqliteManagementActivityStore,
  } = await load();

  const store = new EventStore(join(dir, "p.sqlite"), { clock: new FixedClock().next });
  const effects = createPalimpsestEffects({
    databasePath: join(dir, "o.sqlite"),
    git: new FakeGitPort("c".repeat(40)),
  });
  const controller = new ProjectController({
    store,
    effects,
    projectId: PROJECT,
    policy: new TaskPolicy({
      policy_id: "trusted-default",
      read_paths: ["src"],
      allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
      network_policy: "deny",
      network_allowlist: [],
      timeout_s: 60,
      lease_s: 10,
      attempt_limit: 3,
      candidate_limit: 1,
    }),
    clock: () => CLOCK,
  });

  const operatingPath = join(dir, "project_operating.sqlite");
  const managementPath = join(dir, "management.sqlite");
  const realActivity = new SqliteManagementActivityStore(operatingPath);
  let appends = 0;
  const activity = crashOnTerminalActivity
    ? new Proxy(realActivity, {
        get(target, property) {
          if (property === "append") {
            return (input) => {
              appends += 1;
              const record = target.append(input);
              // Die the instant the SELECTED record is durable and before the
              // governed action can run: the genuine "crash between the phases".
              if (appends === 1) process.kill(process.pid, "SIGKILL");
              return record;
            };
          }
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      })
    : realActivity;

  return {
    store,
    effects,
    controller,
    managementStore: new SqliteManagementPreferenceStore(managementPath, { clock: () => CLOCK }),
    workMode: new SqliteWorkModePreferenceStore(operatingPath, { clock: () => CLOCK }),
    activity,
    realActivity,
    registry: builtinRecipeRegistry(),
    makeProjectManagementService,
    makeProjectWorkspaceService,
    async close() {
      await effects.close();
      store.close();
      this.managementStore.close();
      this.workMode.close();
    },
  };
}

function managementOf(rig) {
  const workspace = rig.makeProjectWorkspaceService({ controller: rig.controller });
  return rig.makeProjectManagementService({
    workspace,
    control: rig.managementStore,
    controller: rig.controller,
    workMode: rig.workMode,
    activity: rig.activity,
    registry: rig.registry,
    clock: () => CLOCK,
  });
}

/** Session 1: operator posture changes and one executed management action. */
async function session1(dir) {
  const rig = await makeRig(dir);
  try {
    rig.controller.start({ projectId: PROJECT, goal: "durable operating posture", tasks: [taskSpec("task-a")] });
    const management = managementOf(rig);

    const start = await management.posture();
    const before = {
      workMode: start.workMode.preferred.baseMode,
      modifiers: [...start.workMode.preferred.modifiers],
      source: start.workMode.preferred.source,
      involvement: start.management.involvement,
    };

    await management.setWorkModePreference({
      baseMode: "EXPLORE",
      modifiers: ["VERIFY"],
      updatedBy: "operator:session1",
    });
    await management.applyOperatorModeChange({ to: "MANAGE", updatedBy: "operator:session1" });
    const step = await management.step({ confirmed: true });
    const posture = await management.posture();

    console.log(
      JSON.stringify(
        {
          phase: "session1",
          before,
          after: {
            workMode: posture.workMode.preferred.baseMode,
            modifiers: [...posture.workMode.preferred.modifiers],
            source: posture.workMode.preferred.source,
            involvement: posture.management.involvement,
            capabilityWarnings: posture.workMode.capabilityWarnings,
          },
          step: { status: step.status, action: step.action, typedReasonCode: step.typedReasonCode },
          activity: rig.activity.list(PROJECT).map((record) => ({
            actionClass: record.actionClass,
            decision: record.decision,
            refs: record.canonicalOutcomeRefs.map((ref) => `${ref.kind}:${ref.ref}`),
          })),
          session1InitialSafeDefault: before.source === "safe_default" && before.workMode === "FOCUS",
        },
        null,
        2,
      ),
    );
  } finally {
    await rig.close();
  }
}

/** Session 2 (child): reopen the same stores and report what survived. */
async function session2(dir) {
  const rig = await makeRig(dir);
  try {
    const management = managementOf(rig);
    const posture = await management.posture();
    const activity = await management.activity();
    const history = await management.operatingHistory();
    console.log(
      JSON.stringify(
        {
          phase: "session2",
          workMode: posture.workMode.preferred.baseMode,
          modifiers: [...posture.workMode.preferred.modifiers],
          source: posture.workMode.preferred.source,
          involvement: posture.management.involvement,
          workModeModeChanges: posture.workMode.historySummary.changes,
          managementModeChanges: posture.management.historySummary.changes,
          activityRecords: activity.length,
          activityDecisions: activity.map((record) => record.decision),
          unresolvedActivity: (await management.unresolvedActivity()).length,
          historyCounts: history.counts,
          chainOk: rig.realActivity.verifyChain(PROJECT).ok,
        },
        null,
        2,
      ),
    );
  } finally {
    await rig.close();
  }
}

/** Crash case: die between the SELECTED record and the governed action. */
async function crashBetweenPhases(dir) {
  const rig = await makeRig(dir, { crashOnTerminalActivity: true });
  rig.controller.start({ projectId: PROJECT, goal: "crash honesty", tasks: [taskSpec("task-a")] });
  const management = managementOf(rig);
  await management.step({ confirmed: true });
  console.log(JSON.stringify({ phase: "crash", crashSeam: "NOT_TRIGGERED" }));
  process.exit(3);
}

/** After the crash: the record must be unresolved, never a success. */
async function afterCrash(dir) {
  const rig = await makeRig(dir);
  try {
    const management = managementOf(rig);
    const unresolved = await management.unresolvedActivity();
    const all = await management.activity();
    console.log(
      JSON.stringify(
        {
          phase: "after_crash",
          total: all.length,
          unresolved: unresolved.length,
          decisions: all.map((record) => record.decision),
          anyFabricatedSuccess: all.some((record) => record.decision === "executed"),
          chainOk: rig.realActivity.verifyChain(PROJECT).ok,
          honest: all.every((record) => record.decision !== "executed") && unresolved.length === 1,
        },
        null,
        2,
      ),
    );
  } finally {
    await rig.close();
  }
}

const mode = process.argv[2] ?? "all";
// The session proof and the crash proof use SEPARATE workspaces: the crash child
// must not collide with an already-initialized project.
const dir = process.argv[3] ?? mkdtempSync(join(tmpdir(), "palimpsest-ab-"));
const crashDir = process.argv[4] ?? mkdtempSync(join(tmpdir(), "palimpsest-ab-crash-"));
const self = fileURLToPath(import.meta.url);
const run = (args) => spawnSync(process.execPath, [self, ...args, dir], { encoding: "utf8" });
const runCrash = (args) => spawnSync(process.execPath, [self, ...args, crashDir], { encoding: "utf8" });

if (mode === "all") {
  const s1 = run(["session1"]);
  process.stdout.write(s1.stdout ?? "");
  process.stderr.write(s1.stderr ?? "");
  if (s1.status !== 0) process.exit(2);

  const s2 = run(["session2"]);
  process.stdout.write(s2.stdout ?? "");
  process.stderr.write(s2.stderr ?? "");
  if (s2.status !== 0) process.exit(3);

  const crash = runCrash(["crash"]);
  const crashSurvived = (crash.stdout ?? "").includes("NOT_TRIGGERED");
  const crashStderr = (crash.stderr ?? "").trim();
  console.log(
    JSON.stringify({
      phase: "crash_seam",
      crashSurvived,
      childExitStatus: crash.status,
      childStderrHead:
        crashStderr.length === 0
          ? null
          : crashStderr.split(String.fromCharCode(10))[0],
    }),
  );
  if (crashSurvived || crashStderr.length > 0) {
    console.error("the crash seam did not fire cleanly - the crash proof is not trustworthy");
    process.exit(4);
  }

  const after = runCrash(["after_crash"]);
  process.stdout.write(after.stdout ?? "");
  process.stderr.write(after.stderr ?? "");
  console.log(`
workspaces retained for inspection: ${dir} | ${crashDir}`);
  process.exit(after.status ?? 1);
} else if (mode === "session1") {
  await session1(dir);
} else if (mode === "session2") {
  await session2(dir);
} else if (mode === "crash") {
  await crashBetweenPhases(dir);
} else if (mode === "after_crash") {
  await afterCrash(dir);
} else {
  throw new Error(`unknown mode ${mode}`);
}
