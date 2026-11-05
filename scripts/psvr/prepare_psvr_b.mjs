/**
 * PSVR-B deterministic real-host preparation — the cross-domain deployment decision package.
 *
 * Same real host/product/worker/Git path as PSVR-A; the domain is NOT software engineering. The
 * repository holds sources, a real arithmetic consistency checker, and no deliverables. Three tasks
 * depend on each other:
 *
 *   technical       constraints, unit selection, certificate standing
 *   commercial      cost model, schedule — and a REVISION of the technical selection when the field
 *                   survey supersedes the drawing
 *   recommendation  the risk review and the integrated decision
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { installProduct, trustedDefaultPolicy } from "../../dist/src/product.js";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const RUN = resolve(String(args.get("run") ?? join(process.env.HOME ?? ".", "psvr-b")));
const REPO = resolve(String(args.get("repo") ?? process.cwd()));
const WORLD = join(RUN, "world");
const STATE = join(RUN, "state");
const PROJECT = "psvr-b";
const SEED = join(REPO, "fixtures", "psvr", "energy-deployment");
const INPUT_PATH = "updates/2026-11-04/corridor-survey.md";

const COMMAND = ["node", "check.mjs"];
const STANDARD = Object.freeze({
  statement: "The package is consistent with its sources as the checker derives them, the artifacts exist, and every write stays in scope.",
  clauses: Object.freeze([
    Object.freeze({ kind: "command_succeeds", command: Object.freeze(COMMAND), predicate: "tests_pass" }),
    Object.freeze({ kind: "scope_respected" }),
    Object.freeze({ kind: "files_exist", paths: Object.freeze([]) }),
  ]),
  derivedFrom: Object.freeze(["package.json:scripts.test", "fixture policy"]),
  confirmed: true,
  notes: Object.freeze([]),
});

const TASKS = [
  {
    task_id: "technical",
    objective: "Assess the site constraints, select the units, and record certificate standing.",
    depends_on: [],
    write_paths: ["deliverables"],
    required_artifacts: ["deliverables/technical-capacity.md", "deliverables/vendor-compliance.md"],
    role: "analyst",
  },
  {
    task_id: "commercial",
    objective: "Produce the cost model and the implementation schedule, revising the selection if a measured fact supersedes it.",
    depends_on: ["technical"],
    write_paths: ["deliverables", "updates/2026-11-04"],
    required_artifacts: ["deliverables/cost-model.json", "deliverables/schedule.md", "deliverables/technical-capacity.md"],
    role: "analyst",
  },
  {
    task_id: "recommendation",
    objective: "Review the risks and record the integrated recommendation over the current technical and commercial package.",
    depends_on: ["commercial"],
    write_paths: ["deliverables"],
    required_artifacts: ["deliverables/risk-review.md", "deliverables/recommendation.md"],
    role: "analyst",
  },
];

function git(cwd, argv, extraEnv = {}) {
  return execFileSync("git", ["-C", cwd, ...argv], { encoding: "utf8", env: { ...process.env, ...extraEnv } }).trim();
}

const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

function seedWorld() {
  rmSync(WORLD, { recursive: true, force: true });
  mkdirSync(WORLD, { recursive: true });
  for (const entry of ["README.md", "TASK.md", "package.json", ".gitignore", "check.mjs", "sources"]) {
    cpSync(join(SEED, entry), join(WORLD, entry), { recursive: true });
  }
  mkdirSync(join(WORLD, "deliverables"), { recursive: true });
  writeFileSync(join(WORLD, "deliverables", ".gitkeep"), "");
  git(WORLD, ["init", "-q"]);
  const fixed = { GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z" };
  git(WORLD, ["add", "-A"], fixed);
  git(WORLD, ["commit", "-qm", "scenario base: sources and checker"], fixed);
  mkdirSync(join(WORLD, ".palimpsest", "inputs"), { recursive: true });
  return git(WORLD, ["rev-parse", "HEAD"]);
}

function seedProject(head) {
  const installed = installProduct(
    { tools: { register: () => () => undefined } },
    {
      projectId: PROJECT,
      repository: WORLD,
      stateDir: STATE,
      execution: "in-place",
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: COMMAND[0], argv_prefix: COMMAND.slice(1) }] }),
      toolProfile: "normal",
      standard: STANDARD,
      advanced: { concurrency: 1 },
    },
  );
  installed.controller.start({
    projectId: PROJECT,
    goal:
      "Prepare a two-site deployment decision package whose technical, compliance, cost, schedule, risk and " +
      "recommendation artifacts agree with the current sources, including a field survey that supersedes a drawing.",
    headCommit: head,
    tasks: TASKS,
  });
  installed.dispose();
  return head;
}

function deploymentProfile() {
  const windows = process.platform === "win32";
  const repository = windows ? WORLD.replace(/\\/gu, "/") : "/run/psvr-b/world";
  const state = windows ? STATE.replace(/\\/gu, "/") : "/run/psvr-b/state";
  return {
    schemaVersion: 1,
    profileId: "psvr-b-host",
    projectId: PROJECT,
    localPeer: "local-operator",
    repository,
    execution: "worktree",
    concurrency: 1,
    toolProfile: "normal",
    policy: { allowed_commands: [{ executable: COMMAND[0], argv_prefix: COMMAND.slice(1) }] },
    standard: { statement: STANDARD.statement },
    transport: { namespace: "psvr-b-host", databasePath: `${state}/transport.sqlite` },
    databases: {
      orchestration: `${state}/palimpsest.sqlite`,
      ordarium: `${state}/ordarium.sqlite`,
      coordination: `${state}/coordination.sqlite`,
      transportCursors: `${state}/transport-cursors.sqlite`,
      projectJournal: `${state}/journal.sqlite`,
      projectAssociations: `${state}/associations.sqlite`,
      management: `${state}/management.sqlite`,
    },
    reasoning: {},
  };
}

mkdirSync(RUN, { recursive: true });
rmSync(STATE, { recursive: true, force: true });
mkdirSync(STATE, { recursive: true });
const head = seedWorld();
seedProject(head);
writeJson(join(RUN, "deployment.json"), deploymentProfile());
writeJson(join(RUN, "seed.json"), {
  schema: "psvr-b-seed/v1",
  projectId: PROJECT,
  world: WORLD,
  head,
  tasks: TASKS.map((task) => ({ taskId: task.task_id, dependsOn: task.depends_on, writePaths: task.write_paths })),
  standard: STANDARD,
  input: INPUT_PATH,
  checker: existsSync(join(WORLD, "check.mjs")),
});
process.stdout.write(`${JSON.stringify({ world: WORLD, head, projectId: PROJECT, input: INPUT_PATH })}\n`);
