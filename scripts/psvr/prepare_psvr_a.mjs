/**
 * PSVR-A deterministic real-host preparation — the REST→gRPC migration project.
 *
 * The host, worker processes, Git effects, execution worlds and Palimpsest calls are real. The model
 * content is a labelled Messages stand-in (`scripts/psvr/build_mock_a.mjs`): this verifies the real
 * product path on a runnable project, not autonomous model behaviour.
 *
 * The scenario repo is seeded from `fixtures/psvr/grpc-migration` (baseline only — the migration is
 * NOT present). The project declares three tasks with a real dependency chain:
 *
 *   contract  proto + wire codec + codec tests
 *   server    the gRPC server, adjusted when the fleet compatibility fact arrives
 *   client    the production client + the integration test + the migration notes
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
const RUN = resolve(String(args.get("run") ?? join(process.env.HOME ?? ".", "psvr-a")));
const REPO = resolve(String(args.get("repo") ?? process.cwd()));
const WORLD = join(RUN, "world");
const STATE = join(RUN, "state");
const PROJECT = "psvr-a";
const SEED = join(REPO, "fixtures", "psvr", "grpc-migration");
const INPUT_PATH = "updates/2026-11-03/compat-streaming.md";

const STANDARD = Object.freeze({
  statement: "The suite runs, the declared artifacts exist, and every write stays inside the task's scope.",
  clauses: Object.freeze([
    Object.freeze({ kind: "command_succeeds", command: Object.freeze(["node", "--test"]), predicate: "tests_pass" }),
    Object.freeze({ kind: "scope_respected" }),
    Object.freeze({ kind: "files_exist", paths: Object.freeze([]) }),
  ]),
  derivedFrom: Object.freeze(["package.json:scripts.test", "fixture policy"]),
  confirmed: true,
  notes: Object.freeze([]),
});

const TASKS = [
  {
    task_id: "contract",
    objective: "Declare the gRPC contract and the wire codec for the site readings service.",
    depends_on: [],
    write_paths: ["proto", "service/wire.js", "test/wire.test.js"],
    required_artifacts: ["proto/energy.proto", "service/wire.js", "test/wire.test.js"],
    role: "implementer",
  },
  {
    task_id: "server",
    objective: "Implement the gRPC server for the site readings service.",
    depends_on: ["contract"],
    write_paths: ["proto/energy.proto", "service/wire.js", "service/grpc_server.js", "test/wire.test.js", "test/server.test.js"],
    required_artifacts: ["service/grpc_server.js", "test/server.test.js"],
    role: "implementer",
  },
  {
    task_id: "client",
    objective: "Deliver the gRPC client, the integration test and the migration notes.",
    depends_on: ["server"],
    write_paths: ["service/grpc_client.js", "test/integration.test.js", "MIGRATION.md"],
    required_artifacts: ["service/grpc_client.js", "test/integration.test.js", "MIGRATION.md"],
    role: "implementer",
  },
];

function git(cwd, argv, extraEnv = {}) {
  return execFileSync("git", ["-C", cwd, ...argv], {
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  }).trim();
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function seedWorld() {
  rmSync(WORLD, { recursive: true, force: true });
  mkdirSync(WORLD, { recursive: true });
  for (const entry of ["README.md", "TASK.md", "package.json", ".gitignore", "service", "test"]) {
    cpSync(join(SEED, entry), join(WORLD, entry), { recursive: true });
  }
  git(WORLD, ["init", "-q"]);
  const fixed = { GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z" };
  git(WORLD, ["add", "-A"], fixed);
  git(WORLD, ["commit", "-qm", "scenario base: REST service"], fixed);
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
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["--test"] }] }),
      toolProfile: "normal",
      standard: STANDARD,
      advanced: { concurrency: 1 },
    },
  );
  installed.controller.start({
    projectId: PROJECT,
    goal:
      "Migrate the site readings service from REST to gRPC without breaking the dispatch console, " +
      "keep the suite runnable, and deliver the migration as accepted, reviewable assets.",
    headCommit: head,
    tasks: TASKS,
  });
  installed.dispose();
  return head;
}

function deploymentProfile() {
  const windows = process.platform === "win32";
  const repository = windows ? WORLD.replace(/\\/gu, "/") : "/run/psvr-a/world";
  const state = windows ? STATE.replace(/\\/gu, "/") : "/run/psvr-a/state";
  return {
    schemaVersion: 1,
    profileId: "psvr-a-host",
    projectId: PROJECT,
    localPeer: "local-operator",
    repository,
    execution: "worktree",
    concurrency: 1,
    toolProfile: "normal",
    policy: { allowed_commands: [{ executable: "node", argv_prefix: ["--test"] }] },
    standard: { statement: STANDARD.statement },
    transport: { namespace: "psvr-a-host", databasePath: `${state}/transport.sqlite` },
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
  schema: "psvr-a-seed/v1",
  projectId: PROJECT,
  world: WORLD,
  head,
  tasks: TASKS.map((task) => ({ taskId: task.task_id, dependsOn: task.depends_on, writePaths: task.write_paths })),
  standard: STANDARD,
  input: INPUT_PATH,
  baselineTests: existsSync(join(WORLD, "test", "rest.test.js")),
});
process.stdout.write(`${JSON.stringify({ world: WORLD, head, projectId: PROJECT, input: INPUT_PATH })}\n`);
