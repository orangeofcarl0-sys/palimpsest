/**
 * PSVR-C energy stage preparation — the cross-domain decision package, F (native) and A (adaptive).
 *
 * Same mechanics as the software stage: byte-identical worlds, the field survey injected at T+60s as
 * an UNTRACKED file, F with one finish-and-commit instruction, A with the product available and no
 * pre-seeded project or task graph.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const RUN = resolve(String(args.get("run") ?? join(process.env.USERPROFILE ?? ".", "psvr-c-energy")));
const REPO = resolve(String(args.get("repo") ?? process.cwd()));
const COHORT = String(args.get("cohort") ?? "psvr-c-2026-11");
const CODE_FREEZE = String(args.get("codeFreeze") ?? "");
const SEED = join(REPO, "fixtures", "psvr", "energy-deployment");
const PROJECT = "psvr-c-energy";
const CONDITIONS = ["F", "A"];
const INPUT_REL = "updates/2026-11-04/corridor-survey.md";

const CONSTRAINT = `# Harbor Flats service corridor — field survey 2026-11-04

Measured corridor width: 1050 mm (clear width at both ends, after the cable tray installation).

This supersedes drawing HF-A-114 (2024), which showed 1,250 mm. The drawing predates the cable tray;
the measured clear width is the value in force.

Surveyed by: field engineering team, 2026-11-04.
`;

const GOAL = [
  "Prepare the two-site deployment decision package described in TASK.md: technical capacity, vendor",
  "compliance, cost model, implementation schedule, risk and evidence review, and an integrated",
  "recommendation. The package must be internally consistent and must not rest on a superseded or",
  "unverified source. Do not approve expenditure.",
].join(" ");

const PROMPTS = {
  F: [
    "ALHS_CORE_F",
    "You are working in this repository.",
    GOAL,
    "",
    "Use any tools you need. When the package is complete, commit it and stop working; do not keep",
    "polling or waiting for further instructions.",
  ].join("\n"),
  F2: [
    "ALHS_CORE_F",
    "This is a continuation of the same work after your previous session was interrupted.",
    "Read the repository state before deciding anything; do not assume work that is not present.",
    GOAL,
    "",
    "Finish the package, commit it and stop working.",
  ].join("\n"),
  A: [
    "ALHS_CORE_A",
    "You are the principal of the project in this repository.",
    GOAL,
    "",
    "Decide how to do the work. The Palimpsest tools are available and may be used when they help; use",
    "your judgement about whether to work directly, delegate, or run a governed project. Work within the",
    "repository. When the result is complete and acceptable, record the state that lets the work end and",
    "stop calling tools.",
  ].join("\n"),
  A2: [
    "ALHS_CORE_A",
    "This is a continuation of the same project after your previous session was interrupted.",
    "Read the project state before deciding anything; do not assume work that is not present.",
    GOAL,
    "",
    "Continue the work, bring it to a state you can defend, and record the state that lets it end.",
  ].join("\n"),
};

const git = (cwd, argv, extraEnv = {}) =>
  execFileSync("git", ["-C", cwd, ...argv], { encoding: "utf8", env: { ...process.env, ...extraEnv } }).trim();
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

function seedWorld(condition) {
  const world = join(RUN, "worlds", condition);
  rmSync(world, { recursive: true, force: true });
  mkdirSync(world, { recursive: true });
  for (const entry of ["README.md", "TASK.md", "package.json", ".gitignore", "check.mjs", "sources"]) {
    cpSync(join(SEED, entry), join(world, entry), { recursive: true });
  }
  mkdirSync(join(world, "deliverables"), { recursive: true });
  writeFileSync(join(world, "deliverables", ".gitkeep"), "");
  git(world, ["init", "-q"]);
  const fixed = { GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z" };
  git(world, ["add", "-A"], fixed);
  git(world, ["commit", "-qm", "scenario base: sources and checker"], fixed);
  mkdirSync(join(world, ".palimpsest", "inputs"), { recursive: true });
  return { world, head: git(world, ["rev-parse", "HEAD"]) };
}

function deployment(condition, state) {
  const windows = process.platform === "win32";
  const world = windows ? seedWorlds[condition].world.replace(/\\/gu, "/") : `/run/psvr-c-energy/worlds/${condition}`;
  const statePath = windows ? state.replace(/\\/gu, "/") : `/run/psvr-c-energy/state-${condition}`;
  return {
    schemaVersion: 1,
    profileId: `psvr-c-energy-${condition.toLowerCase()}`,
    projectId: PROJECT,
    localPeer: "local-operator",
    repository: world,
    execution: "worktree",
    concurrency: 2,
    toolProfile: "normal",
    policy: { allowed_commands: [{ executable: "node", argv_prefix: ["check.mjs"] }] },
    standard: { statement: "The package checker passes on the accepted head and every write stays inside its task's scope." },
    transport: { namespace: `psvr-c-energy-${condition.toLowerCase()}`, databasePath: `${statePath}/transport.sqlite` },
    databases: {
      orchestration: `${statePath}/palimpsest.sqlite`,
      ordarium: `${statePath}/ordarium.sqlite`,
      coordination: `${statePath}/coordination.sqlite`,
      transportCursors: `${statePath}/transport-cursors.sqlite`,
      projectJournal: `${statePath}/journal.sqlite`,
      projectAssociations: `${statePath}/associations.sqlite`,
      management: `${statePath}/management.sqlite`,
    },
    reasoning: {},
  };
}

mkdirSync(join(RUN, "prompts"), { recursive: true });
mkdirSync(join(RUN, "deployments"), { recursive: true });
mkdirSync(join(RUN, "out"), { recursive: true });
for (const [name, text] of Object.entries(PROMPTS)) writeFileSync(join(RUN, "prompts", `${name}.txt`), `${text}\n`);
writeFileSync(join(RUN, "constraint.md"), CONSTRAINT);

const seedWorlds = {};
const states = {};
for (const condition of CONDITIONS) {
  seedWorlds[condition] = seedWorld(condition);
  const state = join(RUN, `state-${condition}`);
  rmSync(state, { recursive: true, force: true });
  mkdirSync(state, { recursive: true });
  states[condition] = state;
}
writeJson(join(RUN, "deployments", "A.json"), deployment("A", states.A));

const sessions = [
  { id: "F-1", condition: "F", index: 1, prompt: "F", injectAtMs: 60_000, killAfterMs: 3_600_000, killAtTokens: 400_000 },
  { id: "F-2", condition: "F", index: 2, prompt: "F2", injectAtMs: null, killAfterMs: 3_600_000 },
  { id: "A-1", condition: "A", index: 1, prompt: "A", injectAtMs: 60_000, killAfterMs: 3_600_000, killAtTokens: 400_000 },
  { id: "A-2", condition: "A", index: 2, prompt: "A2", injectAtMs: null, killAfterMs: 3_600_000 },
].map((session) => ({
  ...session,
  maxTokens: 2_500_000,
  reserveTokens: 125_000,
  world: seedWorlds[session.condition].world,
  state: states[session.condition] ?? null,
  home: join(RUN, `home-${session.id}`),
  promptPath: join(RUN, "prompts", `${session.prompt}.txt`),
  out: join(RUN, "out", session.id),
  injectionRel: INPUT_REL,
}));

writeJson(join(RUN, "core.json"), {
  schema: "alhs-core-prep/v1",
  cohortId: COHORT,
  stage: "psvr-c-energy",
  codeFreeze: CODE_FREEZE,
  mode: "PSVR_C_ENERGY_REAL_MODEL",
  conditions: CONDITIONS,
  goal: GOAL,
  scenario: "energy-package",
  worlds: Object.fromEntries(CONDITIONS.map((condition) => [condition, seedWorlds[condition].world])),
  heads: Object.fromEntries(CONDITIONS.map((condition) => [condition, seedWorlds[condition].head])),
  states,
  constraint: join(RUN, "constraint.md"),
  sessions,
  budget: { perSession: 2_500_000, reserve: 125_000, killAtTokens: 400_000, aggregate: 12_000_000, sessions: 4 },
  note:
    "PSVR-C cross-domain stage. F is native DSH with ONE finish-and-commit instruction. A is the adaptive product path with no pre-seeded project. The field survey arrives at T+60s as an UNTRACKED file; no prompt names the corridor value, the certificate rule or any product route.",
});
process.stdout.write(`${JSON.stringify({ run: RUN, worlds: Object.keys(seedWorlds), sessions: sessions.map((session) => session.id) })}\n`);
