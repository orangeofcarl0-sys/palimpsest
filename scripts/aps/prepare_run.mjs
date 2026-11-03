/**
 * APS real-host run — prepare one deterministic world, one seeded project and three principal
 * sessions over the REAL Palimpsest product. The script is test-owned setup, not the subject under
 * test. It runs from the staged Linux product because the host will run the same dist.
 *
 * The mock model scripts are generated HERE so the contribution decision in session 2 can name the
 * contribution id that session 1 will create. The id is a pure function of the project basis and
 * the finding; no result is read back or fed forward.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { installProduct, trustedDefaultPolicy } from "../../dist/src/product.js";
import { contributionIdOf } from "../../dist/src/project_contribution/index.js";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const RUN = resolve(String(args.get("run") ?? join(process.env.HOME ?? ".", "aps-run")));
const WORLD = join(RUN, "world");
const STATE = join(RUN, "state");

const PROJECT = "aps";
const GOAL = "Select a defensible vendor for each site and leave a reviewable selection artifact, respecting every stated site constraint.";
const REQUIREMENTS = [
  { requirement_id: "R1", statement: "Each site selection must name the vendor and the deciding constraint.", priority: "critical", acceptance_refs: [] },
  { requirement_id: "R2", statement: "A coastal-rated warranty is binding for site B.", priority: "critical", acceptance_refs: [] },
];

const INITIAL_TASKS = [
  {
    task_id: "site-a",
    objective: "Select the site-A vendor from sources/vendor-capabilities.csv and sources/sites.md, and record the deciding constraint in deliverables/site-a.md.",
    depends_on: [],
    write_paths: ["deliverables/site-a.md"],
    required_artifacts: ["deliverables/site-a.md"],
  },
  {
    task_id: "site-b",
    objective: "Select the site-B vendor and record the selection in deliverables/site-b.md.",
    depends_on: [],
    write_paths: ["deliverables/site-b.md"],
    required_artifacts: ["deliverables/site-b.md"],
  },
];

const FINDING =
  "The capacity table exposes only a 2024 coastal column, and every entry is 'no'. No 2026 coastal rating is present in the declared source.";
const DELEGATED_TASK = "Check whether the 2026 coastal rating is present for the site-B vendor.";
const SOURCE_REF = "subagent:coastal-check";
const FINDING_2 =
  "Site A allows a unit up to 1200 mm wide; the Kestrel V2 is 900 mm, so width is not its binding constraint. Its design minimum is the binding constraint.";
const DELEGATED_TASK_2 = "Check whether unit width or the design minimum is the binding constraint for site A.";
const SOURCE_REF_2 = "subagent:width-check";

const REPLANNED_TASKS = [
  INITIAL_TASKS[0],
  {
    task_id: "site-b-coastal",
    objective: "Select a coastal-rated vendor for site B and record the exact rating source in deliverables/site-b-coastal.md.",
    depends_on: [],
    write_paths: ["deliverables/site-b-coastal.md"],
    required_artifacts: ["deliverables/site-b-coastal.md"],
  },
  {
    task_id: "capacity-refresh",
    objective: "Re-read sources/vendor-capabilities.csv and record whether a 2026 coastal rating is present in deliverables/capacity-refresh.md.",
    depends_on: ["site-b-coastal"],
    write_paths: ["deliverables/capacity-refresh.md"],
    required_artifacts: ["deliverables/capacity-refresh.md"],
  },
];

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

function write(relative, content) {
  const path = join(WORLD, relative);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

function writeJson(relative, value) {
  writeFileSync(join(RUN, relative), `${JSON.stringify(value, null, 2)}\n`);
}

reset(RUN);
mkdirSync(WORLD, { recursive: true });
mkdirSync(STATE, { recursive: true });

write(
  "sources/vendor-capabilities.csv",
  [
    "vendor,chemistry,min_c,max_c,warranty_years,coastal_2024,width_mm,lead_weeks",
    "Kestrel,V2,-20,45,5,no,900,8",
    "Solaris,V3,-15,40,7,no,800,10",
    "Halcyon,V4,-10,35,10,no,850,12",
    "",
  ].join("\n"),
);
write(
  "sources/sites.md",
  [
    "# Sites",
    "",
    "- Site A — design minimum -12 °C; a unit no wider than 1200 mm. No coastal requirement.",
    "- Site B — design minimum -4 °C; a COASTAL-RATED warranty is binding. A 2024 rating is not a 2026 rating.",
    "",
    "The source table has a coastal_2024 column. Do not treat a 2024 rating as a current 2026 rating.",
    "",
  ].join("\n"),
);
write("README.md", "# APS vendor selection\n\nThe programme repository. Sources are under sources/. Deliverables go under deliverables/.\n");

git(WORLD, ["init", "-q"]);
const fixedDate = { GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z" };
git(WORLD, ["add", "-A"], fixedDate);
git(WORLD, ["commit", "-qm", "scenario base"], fixedDate);
const head = git(WORLD, ["rev-parse", "HEAD"]);

const installed = installProduct(
  { tools: { register: () => () => undefined } },
  {
    projectId: PROJECT,
    repository: WORLD,
    stateDir: STATE,
    execution: "in-place",
    policy: trustedDefaultPolicy({ allowed_commands: [] }),
    toolProfile: "normal",
    standard: {
      statement: "Each selection must stay inside its declared write scope, name the vendor, and record the deciding constraint.",
      clauses: [{ kind: "scope_respected" }],
      derivedFrom: ["APS run profile"],
      confirmed: true,
      notes: [],
    },
  },
);
installed.controller.start({
  projectId: PROJECT,
  goal: GOAL,
  headCommit: head,
  requirements: REQUIREMENTS,
  tasks: INITIAL_TASKS,
});
const ir = installed.controller.work.project();
const basis = { projectRevision: ir.revision, projectDigest: ir.digest, headCommit: ir.head_commit };
const contributionId = contributionIdOf({
  projectId: PROJECT,
  sourceKind: "NATIVE_SUBAGENT",
  sourceRef: SOURCE_REF,
  task: DELEGATED_TASK,
  finding: FINDING,
  basis,
});
const contributionId2 = contributionIdOf({
  projectId: PROJECT,
  sourceKind: "NATIVE_SUBAGENT",
  sourceRef: SOURCE_REF_2,
  task: DELEGATED_TASK_2,
  finding: FINDING_2,
  basis,
});
await installed.dispose();

const deployment = {
  schemaVersion: 1,
  profileId: "aps-host",
  projectId: PROJECT,
  localPeer: "local-operator",
  repository: "/run/aps/world",
  execution: "in-place",
  concurrency: 1,
  toolProfile: "normal",
  policy: {
    allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }],
  },
  standard: {
    statement: "Each selection must stay inside its declared write scope, name the vendor, and record the deciding constraint.",
  },
  transport: { namespace: "aps-host", databasePath: "/run/aps/state/transport.sqlite" },
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
writeJson("deployment.json", deployment);
writeJson("seed.json", {
  projectId: PROJECT,
  goal: GOAL,
  head,
  basis,
  contributionId,
  finding: FINDING,
  delegatedTask: DELEGATED_TASK,
  sourceRef: SOURCE_REF,
  contributionId2,
  finding2: FINDING_2,
  delegatedTask2: DELEGATED_TASK_2,
  sourceRef2: SOURCE_REF_2,
  initialTasks: INITIAL_TASKS,
  replannedTasks: REPLANNED_TASKS,
});

const mockScripts = {
  schema: "aps-host-scripts/v1",
  note: "Deterministic Messages stand-in. NOT a model. The native DSH subagent is real; its content is scripted.",
  scripts: [
    {
      match: "APS_PRINCIPAL_SESSION_1",
      turns: [
        {
          tool_calls: [
            { id: "s1_pulse", name: "palimpsest_continuity", input: { action: "pulse" } },
            {
              id: "s1_subagent",
              name: "subagent",
              input: {
                description: "check coastal rating",
                prompt:
                  "APS_CHILD_COASTAL Read /run/aps/world/sources/vendor-capabilities.csv and /run/aps/world/sources/sites.md. State whether a 2026 coastal rating is present for the site-B vendor. Return ONLY the finding, in one sentence. Do not edit anything.",
              },
            },
            {
              id: "s1_subagent_width",
              name: "subagent",
              input: {
                description: "check site A constraint",
                prompt:
                  "APS_CHILD_WIDTH Read /run/aps/world/sources/vendor-capabilities.csv and /run/aps/world/sources/sites.md. State whether unit width or the design minimum is the binding constraint for site A. Return ONLY the finding, in one sentence. Do not edit anything.",
              },
            },
          ],
        },
        {
          tool_calls: [
            {
              id: "s1_record",
              name: "palimpsest_contribute",
              input: {
                action: "record",
                sourceKind: "NATIVE_SUBAGENT",
                sourceRef: SOURCE_REF,
                task: DELEGATED_TASK,
                finding: FINDING,
                declaredReadFootprint: ["sources/vendor-capabilities.csv", "sources/sites.md"],
              },
            },
            {
              id: "s1_record_width",
              name: "palimpsest_contribute",
              input: {
                action: "record",
                sourceKind: "NATIVE_SUBAGENT",
                sourceRef: SOURCE_REF_2,
                task: DELEGATED_TASK_2,
                finding: FINDING_2,
                declaredReadFootprint: ["sources/vendor-capabilities.csv", "sources/sites.md"],
              },
            },
          ],
        },
        { text: "APS_S1_DONE" },
      ],
    },
    {
      match: "APS_CHILD_COASTAL",
      turns: [
        {
          tool_calls: [
            { id: "child_read_caps", name: "read", input: { file_path: "/run/aps/world/sources/vendor-capabilities.csv" } },
            { id: "child_read_sites", name: "read", input: { file_path: "/run/aps/world/sources/sites.md" } },
          ],
        },
        { text: FINDING },
      ],
    },
    {
      match: "APS_CHILD_WIDTH",
      turns: [
        {
          tool_calls: [
            { id: "child_width_caps", name: "read", input: { file_path: "/run/aps/world/sources/vendor-capabilities.csv" } },
            { id: "child_width_sites", name: "read", input: { file_path: "/run/aps/world/sources/sites.md" } },
          ],
        },
        { text: FINDING_2 },
      ],
    },
    {
      match: "APS_PRINCIPAL_SESSION_2",
      turns: [
        {
          tool_calls: [
            { id: "s2_pulse", name: "palimpsest_continuity", input: { action: "pulse" } },
            {
              id: "s2_decide",
              name: "palimpsest_contribute",
              input: {
                action: "decide",
                contributionId,
                decision: "REVISE_PLAN",
                decisionNote:
                  "The 2026 coastal rating is not in the declared source. Replace the site-B task with a coastal-rated selection and add an explicit capacity-refresh task before either selection is treated as complete.",
                reason: "the subagent finding changes the site-B requirement",
                changeClass: "behavior_change",
                changedIds: ["site-b"],
                declaredChangedPlan: true,
                tasks: REPLANNED_TASKS,
              },
            },
          ],
        },
        {
          tool_calls: [
            { id: "s2_start", name: "palimpsest_work", input: { action: "start" } },
            { id: "s2_mkdir", name: "bash", input: { command: "mkdir -p /run/aps/world/deliverables", description: "prepare deliverable directory" } },
          ],
        },
        {
          tool_calls: [
            {
              id: "s2_write",
              name: "write",
              input: {
                file_path: "/run/aps/world/deliverables/site-a.md",
                content:
                  "# Site A selection\n\nVendor: Kestrel (V2).\nDeciding constraint: the unit is rated to -20 °C, below the -12 °C design minimum, and is 900 mm wide, within the 1200 mm limit. The table has no 2026 coastal row; site A has no coastal requirement.\n",
              },
            },
          ],
        },
        {
          tool_calls: [
            {
              id: "s2_commit",
              name: "bash",
              input: {
                command:
                  'git -C /run/aps/world add -A && git -C /run/aps/world -c user.email=aps@fixture.invalid -c user.name="APS fixture" commit -qm "site-a selection"',
                description: "commit the deliverable before completion",
              },
            },
          ],
        },
        {
          tool_calls: [
            { id: "s2_complete", name: "palimpsest_work", input: { action: "complete", summary: "site-A selection recorded with its deciding constraint" } },
          ],
        },
        { text: "APS_S2_DONE" },
      ],
    },
    {
      match: "APS_PRINCIPAL_SESSION_3",
      turns: [
        { tool_calls: [{ id: "s3_pulse", name: "palimpsest_continuity", input: { action: "pulse" } }] },
        { text: "APS_S3_DONE" },
      ],
    },
  ],
};
writeJson("mock-scripts.json", mockScripts);
process.stdout.write(`${JSON.stringify({ run: RUN, head, contributionId, deployment: "deployment.json" }, null, 2)}\n`);
