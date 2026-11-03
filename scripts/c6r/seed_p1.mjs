/**
 * C6-R3 — neutral P1 world initializer.
 *
 * It reuses COG-6's legitimate historical seeding and STOPS before any decision under evaluation:
 *
 *   · two genuine D2 historical results (technical-fit, cost-schedule) promoted and reconciled;
 *   · the historical Journal (negative result, open question, dismissed opportunity);
 *   · one READY technical-refresh task;
 *   · the pre-candidate canonical source;
 *   · a T1 inbox with only the three events visible at 2026-02-10T09:05Z.
 *
 * It does NOT create the intake task, does NOT accept Candidate A, does NOT reveal Candidate B, and
 * does NOT copy any evaluator oracle. The deployment profile it writes points at the seeded stores so
 * the real Palimpsest DSH host can open them.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CANDIDATE_A,
  GOAL,
  PRE_CANDIDATE_CAPABILITIES_DIGEST,
  REQUIREMENTS,
  SCENARIO,
  SEEDED_TASKS,
  STAGE_GRAPH,
  TASKS,
  attemptOf,
  buildWorld,
  createInstall,
  digestTree,
  driveTask,
  planWithExtraTask,
  policyFor,
  projectSnapshot,
  promote,
  reconcile,
  resultOf,
  seedJournal,
  seedProject,
  sha256File,
  standardFor,
  worldHead,
} from "../cog6/rig6.mjs";
import { materializeInboxAsOf, T1, treeDigest } from "./staging.mjs";

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found === undefined ? fallback : found.slice(prefix.length);
}

const RUN = arg("run", join(process.cwd(), "c6r-p1"));
const SANDBOX_ROOT = arg("sandbox-root", "/run/p1");
const P1 = join(RUN, "p1");
const WORLD = join(P1, "world");
const STATE = join(P1, "state");
const INBOX = join(P1, "inbox");
mkdirSync(P1, { recursive: true });

buildWorld(WORLD);
const staged = materializeInboxAsOf({ source: join(SCENARIO, "inbox"), observationTime: T1, destination: INBOX });

const installed = await createInstall({ projectId: "sablewick", workDir: WORLD, stateDir: STATE });
const record = { at: new Date().toISOString(), observationTime: T1, initialHead: worldHead(WORLD) };

record.seed = await seedProject(installed, {
  projectId: "sablewick",
  goal: GOAL,
  requirements: REQUIREMENTS,
  tasks: SEEDED_TASKS,
  headCommit: record.initialHead,
  stageGraph: STAGE_GRAPH,
});

const fit = await driveTask(installed, "technical-fit");
const fitAttempt = attemptOf(installed, "technical-fit");
const fitResult = resultOf(installed, fitAttempt?.attemptId ?? "");
record.technicalFit = {
  drive: fit,
  attempt: fitAttempt,
  result: fitResult,
  promotion: await promote(installed, fitAttempt.attemptId, fitResult.resultCommit, record.initialHead),
  reconcile: await reconcile(installed),
};

const cost = await driveTask(installed, "cost-schedule");
const costAttempt = attemptOf(installed, "cost-schedule");
const costResult = resultOf(installed, costAttempt?.attemptId ?? "");
record.costSchedule = {
  drive: cost,
  attempt: costAttempt,
  result: costResult,
  promotion: await promote(installed, costAttempt.attemptId, costResult.resultCommit, installed.controller.work.project().head_commit),
  reconcile: await reconcile(installed),
};

record.journal = await seedJournal(installed);
record.currentTask = await planWithExtraTask(installed, TASKS.technicalRefresh, "seed: add the current technical refresh");
record.snapshot = await projectSnapshot(installed, WORLD);
record.candidateOnDisk = CANDIDATE_A;
record.inboxVisible = staged;
record.sourceTreeDigest = digestTree(join(WORLD, "sources"));
record.inboxTreeDigest = treeDigest(INBOX);
record.canonicalCapabilitiesDigest = sha256File(join(WORLD, "sources", "vendor-capabilities.csv"));

if (record.canonicalCapabilitiesDigest !== PRE_CANDIDATE_CAPABILITIES_DIGEST) {
  throw new Error(`the seeded capability file is ${record.canonicalCapabilitiesDigest}, expected ${PRE_CANDIDATE_CAPABILITIES_DIGEST}`);
}
if (record.snapshot.tasks.some((task) => task.taskId === TASKS.intake.task_id)) {
  throw new Error("the neutral P1 world must not contain the intake task");
}
if (!existsSync(join(INBOX, "2026-02-10", "vendor-capabilities.csv"))) {
  throw new Error("the T1 inbox is missing the material candidate");
}
if (existsSync(join(INBOX, "2026-02-14"))) {
  throw new Error("the T1 inbox must not contain the future event directory");
}

const deployment = {
  schemaVersion: 1,
  profileId: "sablewick-p1",
  projectId: "sablewick",
  localPeer: "local-operator",
  /* These are the paths INSIDE the model sandbox. The seeded files live at the host paths, but the
     host only ever opens them through the `/run/p1` bind; naming host paths here would make the
     sandbox create a second, empty deployment under its own `/home`. */
  repository: `${SANDBOX_ROOT}/world`,
  execution: "worktree",
  concurrency: 2,
  policy: policyFor(),
  standard: { statement: standardFor().statement },
  transport: { namespace: "sablewick-p1", databasePath: `${SANDBOX_ROOT}/state/transport.sqlite` },
  databases: {
    orchestration: `${SANDBOX_ROOT}/state/palimpsest.sqlite`,
    ordarium: `${SANDBOX_ROOT}/state/ordarium.sqlite`,
    coordination: `${SANDBOX_ROOT}/state/coordination.sqlite`,
    transportCursors: `${SANDBOX_ROOT}/state/transport-cursors.sqlite`,
    projectJournal: `${SANDBOX_ROOT}/state/journal.sqlite`,
    projectAssociations: `${SANDBOX_ROOT}/state/associations.sqlite`,
  },
};
writeFileSync(join(P1, "deployment.json"), JSON.stringify(deployment, null, 2));

record.deployment = deployment;
record.stateDir = STATE;
record.world = WORLD;
record.inbox = INBOX;
record.readyTasks = record.snapshot.tasks.filter((task) => task.state === "READY").map((task) => task.taskId);
record.satisfiedTasks = record.snapshot.tasks.filter((task) => task.state === "SATISFIED").map((task) => task.taskId);
record.projectRevision = record.snapshot.revision;
record.projectHead = record.snapshot.head;
record.liveHead = record.snapshot.liveHead;
record.requirementsDigest = record.snapshot.requirementsDigest;

await installed.close?.();
writeFileSync(join(P1, "initial-state.json"), JSON.stringify(record, null, 2));
process.stdout.write(
  `${JSON.stringify(
    {
      world: WORLD,
      state: STATE,
      inbox: INBOX,
      projectHead: record.projectHead,
      revision: record.projectRevision,
      ready: record.readyTasks,
      satisfied: record.satisfiedTasks,
      visibleSetDigest: staged.visibleSetDigest,
      candidateOnDisk: record.candidateOnDisk.digest,
    },
    null,
    2,
  )}\n`,
);
