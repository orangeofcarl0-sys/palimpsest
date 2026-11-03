/**
 * APS-C bounded pilot — prepare three matched worlds (F/L/G), one session each.
 *
 * F: plain Git/Markdown + native DSH tools/subagents, no Palimpsest.
 * L: F plus the lightweight Palimpsest project (goal-only state, normal tools).
 * G: L plus a formal Work plan and a confirmed completion standard.
 *
 * The world contains the same visible sources and no expected answer. The scorer lives outside the
 * world and is never mounted.
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
const RUN = resolve(String(args.get("run") ?? join(process.env.HOME ?? ".", "aps-pilot")));
const REPO = String(args.get("repo") ?? "/mnt/f/Codex_Work_Space/Palimpsest/palimpsest-sr1");
const CODE_FREEZE = String(args.get("codeFreeze") ?? "unknown");
const COHORT = "aps-pilot-2026-11-03";

const GOAL =
  "Produce a defensible vendor selection or a grounded decision to withhold a selection for each site, respecting the stated constraints and the declared sources.";
const REQUIREMENTS = [
  { requirement_id: "R1", statement: "A selection or withholding decision must name the deciding constraint.", priority: "critical", acceptance_refs: [] },
  { requirement_id: "R2", statement: "A coastal-rated warranty is binding for site B; a 2024 rating is not a 2026 rating.", priority: "critical", acceptance_refs: [] },
];

const SOURCES = {
  "sources/vendor-capabilities.csv": [
    "vendor,chemistry,min_c,max_c,warranty_years,coastal_2024,width_mm,lead_weeks",
    "Kestrel,V2,-20,45,5,no,900,8",
    "Solaris,V3,-15,40,7,no,800,10",
    "Halcyon,V4,-10,35,10,no,850,12",
    "",
  ].join("\n"),
  "sources/sites.md": [
    "# Sites",
    "",
    "- Site A — design minimum -12 °C; a unit no wider than 1200 mm. No coastal requirement.",
    "- Site B — design minimum -4 °C; a COASTAL-RATED warranty is binding. A 2024 rating is not a 2026 rating.",
    "",
    "The source table has a coastal_2024 column. Do not treat a 2024 rating as a current 2026 rating.",
    "",
  ].join("\n"),
  "inbox/2026-02-10/vendor-update.md": [
    "# Vendor update — 2026-02-10",
    "",
    "Halcyon V4: the manufacturer says a 2026 coastal certificate is expected, but the certificate is NOT on file.",
    "Treat this as an unverified claim, not a current coastal rating. A 2024 column is not a 2026 certificate.",
    "",
  ].join("\n"),
  "TASK.md": [
    "# Community battery vendor selection",
    "",
    "Produce `deliverables/selection.md`. For each site, either name a vendor and its deciding constraint, or state a grounded reason the selection cannot be made from the declared sources.",
    "",
    "Sources are under `sources/`. The inbox contains material that arrived by the observation time; reading it is not accepting it.",
    "",
    "Site A: design minimum -12 °C, maximum width 1200 mm, no coastal requirement.",
    "Site B: design minimum -4 °C, a coastal-rated warranty is binding. A 2024 rating is not a 2026 rating.",
    "",
    "Do not claim an unverified certificate is current. Work only inside this repository.",
    "",
  ].join("\n"),
};

const PROMPTS = {
  F: [
    "You are the planning agent for a community battery programme. The repository is at /run/aps/world.",
    "Read TASK.md, sources/ and inbox/. Produce deliverables/selection.md with a defensible vendor selection or a grounded decision to withhold a selection for each site.",
    "Name the deciding constraints and cite the sources you used. You may use the native subagent tool for an independent check when it genuinely helps; do not force it.",
    "Use Git and Markdown. Work only inside /run/aps/world. Do not claim an unverified certificate is current.",
  ].join(" "),
  L: [
    "You are the planning agent for a community battery programme. The repository is at /run/aps/world.",
    "Read TASK.md, sources/ and inbox/. Produce deliverables/selection.md with a defensible vendor selection or a grounded decision to withhold a selection for each site.",
    "This is an ongoing project with prior state. The project tools are available; palimpsest_continuity action=pulse is the first read.",
    "Use them only when they help; ordinary research does not need formal Work. You may use the native subagent tool for an independent check when it genuinely helps; do not force it.",
    "Name the deciding constraints and cite the sources you used. Use Git and Markdown. Work only inside /run/aps/world. Do not claim an unverified certificate is current.",
  ].join(" "),
  G: [
    "You are the planning agent for a community battery programme. The repository is at /run/aps/world.",
    "Read TASK.md, sources/ and inbox/. Produce the governed selection artifact.",
    "This deliverable is governed. Use the project Work path for the selection and the independent check; leave the artifacts in the declared write scope for operator acceptance.",
    "You may use the native subagent tool for an independent check when it genuinely helps; do not force it. Name the deciding constraints and cite the sources you used.",
    "Use Git and Markdown. Work only inside /run/aps/world. Do not claim an unverified certificate is current.",
  ].join(" "),
};

function git(cwd, args, env = {}) {
  return execFileSync("git", ["-c", "user.email=aps@fixture.invalid", "-c", "user.name=APS fixture", ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  }).trim();
}

function reset(root) {
  if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
}

function write(path, content) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

reset(RUN);
mkdirSync(RUN, { recursive: true });
const worlds = {};
for (const condition of ["F", "L", "G"]) {
  const world = join(RUN, "worlds", condition);
  mkdirSync(world, { recursive: true });
  for (const [relative, content] of Object.entries(SOURCES)) write(join(world, relative), content);
  git(world, ["init", "-q"]);
  const fixedDate = { GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z" };
  git(world, ["add", "-A"], fixedDate);
  git(world, ["commit", "-qm", "scenario base"], fixedDate);
  worlds[condition] = { world, head: git(world, ["rev-parse", "HEAD"]) };
}

// L: goal-only project, no formal tasks, no confirmed standard.
const lState = join(RUN, "state-L");
const lInstalled = installProduct(
  { tools: { register: () => () => undefined } },
  {
    projectId: "aps",
    repository: worlds.L.world,
    stateDir: lState,
    execution: "in-place",
    policy: trustedDefaultPolicy({ allowed_commands: [] }),
    toolProfile: "normal",
  },
);
lInstalled.controller.start({
  projectId: "aps",
  goal: GOAL,
  headCommit: worlds.L.head,
  requirements: REQUIREMENTS,
  tasks: [],
});
await lInstalled.dispose();

// G: formal Work plan plus a confirmed completion standard.
const gState = join(RUN, "state-G");
const gInstalled = installProduct(
  { tools: { register: () => () => undefined } },
  {
    projectId: "aps",
    repository: worlds.G.world,
    stateDir: gState,
    execution: "in-place",
    policy: trustedDefaultPolicy({ allowed_commands: [] }),
    toolProfile: "normal",
    standard: {
      statement: "Each selection or withholding decision must stay inside its declared write scope and cite the deciding constraint.",
      clauses: [{ kind: "scope_respected" }],
      derivedFrom: ["APS pilot G standard"],
      confirmed: true,
      notes: [],
    },
  },
);
gInstalled.controller.start({
  projectId: "aps",
  goal: GOAL,
  headCommit: worlds.G.head,
  requirements: REQUIREMENTS,
  tasks: [
    {
      task_id: "selection",
      objective: "Produce the site-by-site selection or withholding decision in deliverables/selection.md.",
      depends_on: [],
      write_paths: ["deliverables/selection.md"],
      required_artifacts: ["deliverables/selection.md"],
    },
    {
      task_id: "independent-check",
      objective: "Independently check the coastal-rating status and record the result in reviews/coastal.md.",
      depends_on: [],
      write_paths: ["reviews/coastal.md"],
      required_artifacts: ["reviews/coastal.md"],
    },
  ],
});
await gInstalled.dispose();

function deployment(condition) {
  return {
    schemaVersion: 1,
    profileId: `aps-pilot-${condition.toLowerCase()}`,
    projectId: "aps",
    localPeer: "local-operator",
    repository: "/run/aps/world",
    execution: "in-place",
    concurrency: 1,
    toolProfile: "normal",
    policy: {
      allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }],
    },
    ...(condition === "G"
      ? { standard: { statement: "Each selection or withholding decision must stay inside its declared write scope and cite the deciding constraint." } }
      : {}),
    transport: { namespace: `aps-pilot-${condition.toLowerCase()}`, databasePath: "/run/aps/state/transport.sqlite" },
    databases: {
      orchestration: "/run/aps/state/palimpsest.sqlite",
      ordarium: "/run/aps/state/ordarium.sqlite",
      coordination: "/run/aps/state/coordination.sqlite",
      transportCursors: "/run/aps/state/transport-cursors.sqlite",
      projectJournal: "/run/aps/state/journal.sqlite",
      projectAssociations: "/run/aps/state/associations.sqlite",
      management: "/run/aps/state/management.sqlite",
    },
  };
}
mkdirSync(join(RUN, "deployments"), { recursive: true });
writeJson(join(RUN, "deployments", "L.json"), deployment("L"));
writeJson(join(RUN, "deployments", "G.json"), deployment("G"));
mkdirSync(join(RUN, "prompts"), { recursive: true });
for (const condition of ["F", "L", "G"]) write(join(RUN, "prompts", `${condition}.txt`), `${PROMPTS[condition]}\n`);

const cohort = {
  schema: "aps-live-cohort/v1",
  cohortId: COHORT,
  codeFreeze: CODE_FREEZE,
  provider: { id: "deepseek-official", model: "deepseek-flash" },
  conditions: ["F", "L", "G"],
  oracleCopied: false,
  sessions: ["F", "L", "G"].map((condition) => ({
    id: `pilot-${condition.toLowerCase()}-1`,
    condition,
    maxTokens: 2_500_000,
    command: ["bash", join(REPO, "scripts", "aps", "session_pilot.sh"), condition],
    cwd: RUN,
    sessionRoot: join(RUN, `home-${condition}`, "sessions"),
    env: {
      APS_PILOT_RUN: RUN,
      APS_PILOT_REPO: REPO,
      APS_PILOT_CONDITION: condition,
    },
    timeoutMs: 900_000,
  })),
};
writeJson(join(RUN, "cohort.json"), cohort);
writeJson(join(RUN, "authorization.json"), {
  schema: "aps-spend-authorization/v1",
  authorized: true,
  owner: "Owner (authorized 2026-11-03)",
  cohortId: COHORT,
  authorizedAt: new Date().toISOString(),
  expiresAt: "2026-11-10T00:00:00.000Z",
  provider: { id: "deepseek-official", model: "deepseek-flash" },
  maxTokens: 7_500_000,
  conditions: ["F", "L", "G"],
  note: "Bounded APS-C pilot: 3 matched sessions, 2.5M tokens per session, 7.5M aggregate. The PC1-V1 authorization is not reused.",
});
writeJson(join(RUN, "pilot.json"), {
  schema: "aps-pilot-prep/v1",
  cohortId: COHORT,
  codeFreeze: CODE_FREEZE,
  mode: "REAL_MODEL_PILOT",
  worlds: Object.fromEntries(Object.entries(worlds).map(([condition, value]) => [condition, value.world])),
  sessions: cohort.sessions,
  budget: { perSession: 2_500_000, aggregate: 7_500_000 },
});
process.stdout.write(`${JSON.stringify({ run: RUN, cohortId: COHORT, worlds: Object.keys(worlds) }, null, 2)}\n`);
