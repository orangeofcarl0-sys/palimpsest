/**
 * ALHS-C core preparation — two matched worlds for F (strong native DSH) and A (adaptive Palimpsest).
 *
 * The sources are byte-identical. The measured site-B constraint is NOT in either world: the session
 * adapter injects it while session 1 is running. The prompts do not disclose the hidden dependency,
 * the expected replan or the acceptance rule.
 *
 * A has the FULL Palimpsest product available (pulse, contributions, Work, governed Worlds, the
 * episode conclusion) but no formal task and no instruction to use any of it. F has plain DSH,
 * native tools/subagents and Git.
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
const RUN = resolve(String(args.get("run") ?? join(process.env.USERPROFILE ?? ".", "alhs-core")));
const COHORT = String(args.get("cohort") ?? "alhs-c-2026-11-04");
const STAGE = String(args.get("stage") ?? "core");
if (!["core", "repeat", "diagnostic"].includes(STAGE)) throw new Error(`unknown stage "${STAGE}"`);
const CODE_FREEZE = String(args.get("codeFreeze") ?? "");
const PROJECT = "alhs-core";
const CONDITIONS = STAGE === "diagnostic" ? ["L", "G"] : ["F", "A"];

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
  ".gitignore": ["inbox/", ""].join("\n"),
};

const PROMPTS = {
  F: [
    "ALHS_CORE_F You are the principal for a community energy deployment. The repository is your world.",
    "Read TASK.md, sources/ and inbox/. Produce deliverables/package.md as the single reviewable package described in TASK.md.",
    "You may use native subagents when they genuinely help; do not force a fixed collaboration topology.",
    "Re-check inbox/ for any newly arrived measured data before you finalize. Use Git and Markdown. Work only inside this repository.",
  ].join(" "),
  F2: [
    "ALHS_CORE_F_S2 This is a continuation of the same project after the previous session was interrupted. The repository is your world.",
    "Read the current files, Git state and inbox/. Finish deliverables/package.md as the single reviewable package described in TASK.md.",
    "Do not assume anything that is not present in the repository. Re-check inbox/ before finalizing.",
    "You may use native subagents when they genuinely help. Work only inside this repository, and state your final judgement when you are done.",
  ].join(" "),
  A: [
    "ALHS_CORE_A You are the principal for a community energy deployment. The repository is your world.",
    "This is an ongoing Palimpsest project. Call palimpsest_continuity action=pulse first.",
    "The project tools, native subagents and the governed Work/World path are available when they genuinely help. Choose the collaboration topology yourself; do not force a fixed number of Agents or a governed task.",
    "Read TASK.md, sources/ and inbox/. Produce deliverables/package.md as the single reviewable package described in TASK.md.",
    "Re-check inbox/ for any newly arrived measured data before you finalize. Use Git and Markdown. Work only inside this repository.",
  ].join(" "),
  A2: [
    "ALHS_CORE_A_S2 This is a continuation of the same Palimpsest project after the previous session was interrupted.",
    "Read the pulse and the current files. Do not assume anything that is not present in the project state.",
    "Finish deliverables/package.md as the single reviewable package described in TASK.md, and record your final episode judgement in the project when the work is done.",
    "Re-check inbox/ before finalizing. Work only inside this repository.",
  ].join(" "),
  L: [
    "ALHS_CORE_L You are the principal for a community energy deployment. The repository is your world.",
    "This is an ongoing Palimpsest project with lightweight project context. Call palimpsest_continuity action=pulse first; use the project tools only when they genuinely help.",
    "Do not create a formal Work task or a governed World unless you have a concrete reason; this is the lightweight path.",
    "Read TASK.md, sources/ and inbox/. Produce deliverables/package.md as the single reviewable package described in TASK.md.",
    "Re-check inbox/ for any newly arrived measured data before you finalize. Use Git and Markdown. Work only inside this repository.",
  ].join(" "),
  L2: [
    "ALHS_CORE_L_S2 This is a continuation of the same lightweight Palimpsest project after the previous session was interrupted.",
    "Read the pulse and the current files. Do not assume anything that is not present in the project state.",
    "Finish deliverables/package.md as the single reviewable package described in TASK.md, and record your final episode judgement in the project when the work is done.",
    "Re-check inbox/ before finalizing. Work only inside this repository.",
  ].join(" "),
  G: [
    "ALHS_CORE_G You are the principal for a community energy deployment. The repository is your world.",
    "This is a governed Palimpsest project with a confirmed completion standard. Call palimpsest_continuity action=pulse first.",
    "Use the governed Work path for the package deliverable. Workers settle through the product; an operator decides acceptance — do not promote or accept your own result.",
    "Read TASK.md, sources/ and inbox/. The package must satisfy TASK.md.",
    "Re-check inbox/ for any newly arrived measured data before you finalize. Use Git and Markdown. Work only inside this repository.",
  ].join(" "),
  G2: [
    "ALHS_CORE_G_S2 This is a continuation of the same governed Palimpsest project after the previous session was interrupted.",
    "Read the pulse and the current execution state. Do not assume anything that is not present in the project state.",
    "Recover the committed work if there is any, finish the package through the governed path, and record the episode state for operator acceptance. Do not promote or accept your own result.",
    "Re-check inbox/ before finalizing. Work only inside this repository.",
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

const STANDARD = {
  statement: "Stay inside the declared write scope and leave the required package artifact.",
  clauses: [{ kind: "scope_respected" }],
  derivedFrom: ["ALHS-C core standard"],
  confirmed: true,
  notes: [],
};

function git(cwd, argv, env = {}) {
  return execFileSync("git", ["-c", "user.email=alhs@fixture.invalid", "-c", "user.name=ALHS fixture", ...argv], {
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
for (const condition of CONDITIONS) {
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

const states = {};
const PACKAGE_TASK = {
  task_id: "package",
  objective:
    "Produce the complete multi-site energy deployment package in deliverables/package.md, including capacity, vendor compliance, cost, schedule, risk and an integrated decision.",
  depends_on: [],
  write_paths: ["deliverables/package.md"],
  required_artifacts: ["deliverables/package.md"],
};

// F: no Palimpsest. A: full product, goal-only, no formal task. L: lightweight Palimpsest, goal-only,
// in-place, no standard and no governed Worlds. G: forced governed, one formal task + standard +
// isolated world.
for (const condition of CONDITIONS) {
  if (condition === "F") continue;
  const state = join(RUN, `state-${condition}`);
  const l = condition === "L";
  const tasks = condition === "G" ? [PACKAGE_TASK] : [];
  const installed = installProduct(
    { tools: { register: () => () => undefined } },
    {
      projectId: PROJECT,
      repository: worlds[condition].world,
      stateDir: state,
      execution: "in-place",
      policy: trustedDefaultPolicy({ allowed_commands: [] }),
      toolProfile: "normal",
      ...(l ? {} : { standard: STANDARD }),
      advanced: { concurrency: 2 },
    },
  );
  installed.controller.start({ projectId: PROJECT, goal: GOAL, headCommit: worlds[condition].head, requirements: REQUIREMENTS, tasks });
  await installed.dispose();
  states[condition] = state;
}

function deployment(condition) {
  const state = states[condition];
  const windows = process.platform === "win32";
  const world = windows ? worlds[condition].world.replaceAll("\\", "/") : `/run/alhs/worlds/${condition}`;
  const statePath = windows ? state.replaceAll("\\", "/") : `/run/alhs/state-${condition}`;
  return {
    schemaVersion: 1,
    profileId: `alhs-core-${condition.toLowerCase()}`,
    projectId: PROJECT,
    localPeer: "local-operator",
    repository: world,
    execution: condition === "L" ? "in-place" : "worktree",
    concurrency: 2,
    toolProfile: "normal",
    policy: { allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] },
    ...(condition === "L" ? {} : { standard: { statement: STANDARD.statement } }),
    transport: { namespace: `alhs-core-${condition.toLowerCase()}`, databasePath: `${statePath}/transport.sqlite` },
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

for (const condition of CONDITIONS) {
  if (condition === "F") continue;
  writeJson(join(RUN, "deployments", `${condition}.json`), deployment(condition));
}
write(join(RUN, "constraint.md"), CONSTRAINT);
for (const [name, text] of Object.entries(PROMPTS)) write(join(RUN, "prompts", `${name}.txt`), `${text}\n`);

const SUFFIX = STAGE === "repeat" ? "b" : "";
const sessions = (
  STAGE === "diagnostic"
    ? [
        { id: "L-1", condition: "L", index: 1, prompt: "L", injectAtMs: 60_000, killAfterMs: 900_000, killAtTokens: 400_000 },
        { id: "L-2", condition: "L", index: 2, prompt: "L2", injectAtMs: null, killAfterMs: 900_000 },
        { id: "G-1", condition: "G", index: 1, prompt: "G", injectAtMs: 60_000, killAfterMs: 900_000, killAtTokens: 400_000 },
        { id: "G-2", condition: "G", index: 2, prompt: "G2", injectAtMs: null, killAfterMs: 900_000 },
      ]
    : [
        { id: `F-1${SUFFIX}`, condition: "F", index: 1, prompt: "F", injectAtMs: 60_000, killAfterMs: STAGE === "repeat" ? 900_000 : 240_000 },
        { id: `F-2${SUFFIX}`, condition: "F", index: 2, prompt: "F2", injectAtMs: null, killAfterMs: 720_000 },
        { id: `A-1${SUFFIX}`, condition: "A", index: 1, prompt: "A", injectAtMs: 60_000, killAfterMs: STAGE === "repeat" ? 900_000 : 240_000 },
        { id: `A-2${SUFFIX}`, condition: "A", index: 2, prompt: "A2", injectAtMs: null, killAfterMs: 720_000 },
      ]
).map((session) => ({
  ...session,
  maxTokens:
    STAGE === "diagnostic"
      ? 2_500_000
      : STAGE === "repeat" && session.index === 1
        ? 1_500_000
        : STAGE === "repeat"
          ? 2_500_000
          : 3_000_000,
  reserveTokens: STAGE === "diagnostic" ? 125_000 : 150_000,
  ...(STAGE === "repeat" && session.index === 1 ? { killAtTokens: 400_000 } : {}),
  world: worlds[session.condition].world,
  state: states[session.condition] ?? null,
  home: join(RUN, `home-${session.id}`),
  promptPath: join(RUN, "prompts", `${session.prompt}.txt`),
  out: join(RUN, "out", session.id),
}));

writeJson(join(RUN, "core.json"), {
  schema: "alhs-core-prep/v1",
  cohortId: COHORT,
  stage: STAGE,
  codeFreeze: CODE_FREEZE,
  mode:
    STAGE === "diagnostic"
      ? "REAL_MODEL_DIAGNOSTIC"
      : STAGE === "repeat"
        ? "REAL_MODEL_REPEAT_CORE"
        : "REAL_MODEL_CORE",
  conditions: CONDITIONS,
  goal: GOAL,
  requirements: REQUIREMENTS,
  worlds: Object.fromEntries(Object.entries(worlds).map(([condition, value]) => [condition, value.world])),
  heads: Object.fromEntries(Object.entries(worlds).map(([condition, value]) => [condition, value.head])),
  states,
  constraint: join(RUN, "constraint.md"),
  sessions,
  budget:
    STAGE === "diagnostic"
      ? { perSession: 2_500_000, reserve: 125_000, softStop: 2_375_000, killAtTokens: 400_000, aggregate: 10_000_000, sessions: 4 }
      : STAGE === "repeat"
        ? { session1: 1_500_000, session2: 2_500_000, reserve: 150_000, killAtTokens: 400_000, aggregate: 8_000_000, sessions: 4 }
        : { perSession: 3_000_000, reserve: 150_000, softStop: 2_850_000, aggregate: 12_000_000, sessions: 4 },
  note:
    STAGE === "diagnostic"
      ? "L and G share byte-identical sources. The constraint is injected at T+60s in session 1. Session 1 is killed at the same 400,000-token milestone in both conditions; session 2 is a new principal session on the same project state. L has no formal task; G has one formal package task and a confirmed standard."
      : STAGE === "repeat"
      ? "F and A share byte-identical sources. The constraint is injected at T+60s in session 1. Session 1 is killed at the same reported token milestone (400,000) in both conditions, with a wall-clock backstop; session 2 is a new principal session on the same project state."
      : "F and A share byte-identical sources. The constraint is injected at T+60s in session 1 and is not in the initial world. Session 1 is killed at T+240s if the host is still running; session 2 is a new principal session on the same project state.",
});
process.stdout.write(`${JSON.stringify({ run: RUN, worlds: Object.keys(worlds), sessions: sessions.map((s) => s.id) })}\n`);
