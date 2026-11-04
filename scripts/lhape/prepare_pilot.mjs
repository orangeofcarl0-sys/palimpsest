/**
 * LHAPE-C bounded pilot — three matched Windows worlds, one real-model session per condition.
 *
 * F: plain DSH + Git/Markdown + native subagents, no Palimpsest.
 * L: F + Palimpsest Lightweight project context/contribution/pulse, in-place.
 * G: L + a governed Work task/standard in an isolated world, settled through the product.
 *
 * The measured site-B corridor constraint is NOT in the initial world: the runner injects it while
 * the session is running. The prompt only says to re-check inbox/ before finalizing; it does not
 * disclose the hidden dependency or the expected replan.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { installProduct, trustedDefaultPolicy } from "../../dist/src/product.js";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const RUN = resolve(String(args.get("run") ?? join(process.env.USERPROFILE ?? ".", "lhape-pilot")));
const COHORT = String(args.get("cohort") ?? "lhape-c-pilot-2026-11-04");
const CODE_FREEZE = String(args.get("codeFreeze") ?? "");

const GOAL =
  "Evaluate a multi-site energy deployment and produce ONE reviewable package covering technical capacity, vendor compliance, cost, implementation schedule, risk/uncertainty, and an integrated decision. Respect every binding requirement. Do not treat an unverified claim as accepted. Do not approve expenditure without authority.";
const REQUIREMENTS = [
  { requirement_id: "R1", statement: "The package must name the deciding constraint for each site.", priority: "critical", acceptance_refs: [] },
  { requirement_id: "R2", statement: "A 2024 coastal column is not a current coastal certificate; an expected certificate is not a current certificate.", priority: "critical", acceptance_refs: [] },
];

const SOURCES = {
  "TASK.md": [
    "# Multi-site energy deployment",
    "",
    "Produce `deliverables/package.md` — one reviewable package covering:",
    "- technical capacity assessment;",
    "- vendor compliance assessment;",
    "- cost / budget model;",
    "- implementation schedule;",
    "- risk and uncertainty review;",
    "- integrated decision.",
    "",
    "Sources are under `sources/`. New measured updates may appear in `inbox/`; re-check `inbox/` before finalizing.",
    "Do not treat an unverified claim as an accepted fact. Do not approve expenditure without authority.",
    "Work only inside this repository.",
    "",
  ].join("\n"),
  "sources/sites.md": [
    "# Sites",
    "",
    "- Site A: design minimum -12 °C; maximum admissible unit width 1200 mm; no coastal requirement.",
    "- Site B: design minimum -4 °C; a coastal-rated warranty is binding. The baseline corridor value of 1200 mm is an ASSUMPTION, not a measurement.",
    "",
    "A 2024 coastal column is not a current 2026 certificate. An expected certificate is not a certificate on file.",
    "",
  ].join("\n"),
  "sources/capacity.csv": [
    "unit,min_c,max_c,unit_width_mm,lead_weeks",
    "Kestrel-900,-20,45,900,8",
    "Solaris-800,-15,40,800,10",
    "Halcyon-850,-10,35,850,12",
    "",
  ].join("\n"),
  "sources/vendors.md": [
    "# Vendors",
    "",
    "- Kestrel: 5-year warranty; no coastal certification in the declared sources.",
    "- Solaris: 7-year warranty; no coastal certification in the declared sources.",
    "- Halcyon: 10-year warranty; says a 2026 coastal certificate is 'expected', but no certificate is on file. Treat the claim as unverified.",
    "",
  ].join("\n"),
  "inbox/README.md": [
    "# Inbox",
    "",
    "Measured updates may arrive here while the work is in progress. Re-check this directory before finalizing.",
    "An inbox item is evidence only to the extent its own text states; a claim about a future certificate is not a certificate.",
    "",
  ].join("\n"),
};

const PROMPTS = {
  F: [
    "You are the principal for a community energy deployment. The repository is your world.",
    "Read TASK.md, sources/ and inbox/. Produce deliverables/package.md as the single reviewable package described in TASK.md.",
    "You may use native subagents when they genuinely help; do not force a fixed collaboration topology.",
    "Re-check inbox/ for any newly arrived measured data before you finalize. Use Git and Markdown. Work only inside this repository.",
  ].join(" "),
  L: [
    "You are the principal for a community energy deployment. The repository is your world.",
    "This is an ongoing Palimpsest project. Call palimpsest_continuity action=pulse first; use the project tools only when they help.",
    "Read TASK.md, sources/ and inbox/. Produce deliverables/package.md as the single reviewable package described in TASK.md.",
    "You may use native subagents when they genuinely help; do not force a fixed collaboration topology.",
    "Re-check inbox/ for any newly arrived measured data before you finalize. Use Git and Markdown. Work only inside this repository.",
  ].join(" "),
  G: [
    "You are the principal for a community energy deployment. The repository is your world.",
    "This is a governed Palimpsest project with a confirmed completion standard. Call palimpsest_continuity action=pulse first.",
    "Use the governed Work path for the package deliverable. Workers settle through the product; an operator decides acceptance — do not promote or accept your own result.",
    "Read TASK.md, sources/ and inbox/. The package must satisfy TASK.md.",
    "Re-check inbox/ for any newly arrived measured data before you finalize. Use Git and Markdown. Work only inside this repository.",
  ].join(" "),
};

const CONSTRAINT = [
  "# Measured site-B corridor",
  "",
  "Measured width: 700 mm (survey performed 2026-11-03).",
  "",
  "The earlier 1200 mm corridor value was an assumption, not a measurement. It is superseded.",
  "The 900 mm unit is NOT admissible at site B.",
  "",
].join("\n");

function git(cwd, argv, env = {}) {
  return execFileSync("git", ["-c", "user.email=lhape@fixture.invalid", "-c", "user.name=LHAPE fixture", ...argv], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  }).trim();
}

function write(path, content) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

function writeJson(path, value) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function reset(root) {
  if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
}

reset(RUN);
const worlds = {};
for (const condition of ["F", "L", "G"]) {
  const world = join(RUN, "worlds", condition);
  mkdirSync(world, { recursive: true });
  for (const [relative, content] of Object.entries(SOURCES)) write(join(world, relative), content);
  git(world, ["init", "-q"]);
  const fixed = { GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z" };
  git(world, ["add", "-A"], fixed);
  git(world, ["commit", "-qm", "scenario base"], fixed);
  mkdirSync(join(world, ".palimpsest", "inputs"), { recursive: true });
  const retained = join(world, ".palimpsest", "worlds", "retained-baseline");
  mkdirSync(retained, { recursive: true });
  writeFileSync(join(retained, "README.md"), "Inactive world retained for read-fence sibling coverage.\n");
  worlds[condition] = { world, head: git(world, ["rev-parse", "HEAD"]) };
}

const standard = {
  statement: "Stay inside the declared write scope and leave the required package artifact.",
  clauses: [{ kind: "scope_respected" }],
  derivedFrom: ["LHAPE-C pilot G standard"],
  confirmed: true,
  notes: [],
};

// L: goal-only project, no formal tasks, no standard.
const lState = join(RUN, "state-L");
const lInstalled = installProduct(
  { tools: { register: () => () => undefined } },
  {
    projectId: "lhape-pilot",
    repository: worlds.L.world,
    stateDir: lState,
    execution: "in-place",
    policy: trustedDefaultPolicy({ allowed_commands: [] }),
    toolProfile: "normal",
  },
);
lInstalled.controller.start({ projectId: "lhape-pilot", goal: GOAL, headCommit: worlds.L.head, requirements: REQUIREMENTS, tasks: [] });
await lInstalled.dispose();

// G: one governed package task in an isolated world, plus the operator-owned standard.
const gState = join(RUN, "state-G");
const gInstalled = installProduct(
  { tools: { register: () => () => undefined } },
  {
    projectId: "lhape-pilot",
    repository: worlds.G.world,
    stateDir: gState,
    execution: "in-place",
    policy: trustedDefaultPolicy({ allowed_commands: [] }),
    toolProfile: "normal",
    standard,
    advanced: { concurrency: 2 },
  },
);
gInstalled.controller.start({
  projectId: "lhape-pilot",
  goal: GOAL,
  headCommit: worlds.G.head,
  requirements: REQUIREMENTS,
  tasks: [
    {
      task_id: "package",
      objective: "Produce the complete multi-site energy deployment package in deliverables/package.md, including capacity, compliance, cost, schedule, risk and an integrated decision.",
      depends_on: [],
      write_paths: ["deliverables/package.md"],
      required_artifacts: ["deliverables/package.md"],
    },
  ],
});
await gInstalled.dispose();

function deployment(condition) {
  const windows = process.platform === "win32";
  const world = windows ? worlds[condition].world.replaceAll("\\", "/") : "/run/lhape/world";
  const state = windows ? join(RUN, `state-${condition}`).replaceAll("\\", "/") : "/run/lhape/state";
  return {
    schemaVersion: 1,
    profileId: `lhape-pilot-${condition.toLowerCase()}`,
    projectId: "lhape-pilot",
    localPeer: "local-operator",
    repository: world,
    execution: condition === "G" ? "worktree" : "in-place",
    concurrency: 2,
    toolProfile: "normal",
    policy: { allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] },
    ...(condition === "G" ? { standard: { statement: standard.statement } } : {}),
    transport: { namespace: `lhape-pilot-${condition.toLowerCase()}`, databasePath: `${state}/transport.sqlite` },
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

writeJson(join(RUN, "deployments", "L.json"), deployment("L"));
writeJson(join(RUN, "deployments", "G.json"), deployment("G"));
write(join(RUN, "constraint.md"), CONSTRAINT);
for (const condition of ["F", "L", "G"]) write(join(RUN, "prompts", `${condition}.txt`), `${PROMPTS[condition]}\n`);

const cohort = {
  schema: "lhape-live-cohort/v1",
  cohortId: COHORT,
  codeFreeze: CODE_FREEZE,
  provider: { id: "deepseek-official", model: "deepseek-flash" },
  conditions: ["F", "L", "G"],
  oracleCopied: false,
  hiddenDependenciesDisclosed: false,
  sessions: ["F", "L", "G"].map((condition) => ({
    id: `pilot-${condition.toLowerCase()}-1`,
    condition,
    maxTokens: 2_500_000,
    command: ["node", join("scripts", "lhape", "run_condition.mjs"), `--condition=${condition}`, `--run=${RUN}`],
    cwd: process.cwd(),
    sessionRoot: join(RUN, `home-${condition}`, "sessions"),
    env: { LHAPE_PILOT_RUN: RUN },
    timeoutMs: 1_800_000,
  })),
};
writeJson(join(RUN, "cohort.json"), cohort);
writeJson(join(RUN, "pilot.json"), {
  schema: "lhape-pilot-prep/v1",
  cohortId: COHORT,
  codeFreeze: CODE_FREEZE,
  mode: "REAL_MODEL_PILOT",
  goal: GOAL,
  requirements: REQUIREMENTS,
  worlds: Object.fromEntries(Object.entries(worlds).map(([condition, value]) => [condition, value.world])),
  homes: Object.fromEntries(["F", "L", "G"].map((condition) => [condition, join(RUN, `home-${condition}`)])),
  constraints: join(RUN, "constraint.md"),
  budget: { perCondition: 2_500_000, aggregate: 7_500_000 },
  sessions: cohort.sessions,
});
process.stdout.write(`${JSON.stringify({ run: RUN, cohortId: COHORT, worlds: Object.keys(worlds) }, null, 2)}\n`);
