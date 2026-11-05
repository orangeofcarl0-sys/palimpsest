/**
 * ALHS deterministic real-host preparation.
 *
 * Test-owned setup for the Windows DSH host: one Git world, one seeded project, one deployment
 * profile and the deterministic Messages scripts. The host, worker processes, SQLite state, Git
 * effects and Palimpsest product calls are real; the model content is a labelled stand-in.
 *
 * The scenario is deliberately narrow so one run can prove four things end to end:
 *   - a worker produces a baseline cost artifact and parks before reporting (a genuinely late result);
 *   - a measured constraint retires the baseline plan and a replacement task changes the world;
 *   - a NEW session inspects the late result, sees which paths are reusable/conflicted, writes a
 *     governed task that reuses the valid pricing, and runs it;
 *   - the episode concludes WAIT_FOR_OPERATOR after delivery, a promotion moves the world, and a
 *     later session records DELIVER and ends naturally (no kill, no budget stop).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { installProduct, trustedDefaultPolicy } from "../../dist/src/product.js";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const RUN = resolve(String(args.get("run") ?? join(process.env.HOME ?? ".", "alhs-run")));
const WORLD = join(RUN, "world");
const STATE = join(RUN, "state");
const PROJECT = "alhs";

const STANDARD = {
  statement:
    "Stay inside the declared write scope, leave the required artifact, and do not treat an unverified source claim as accepted.",
  clauses: [{ kind: "scope_respected" }],
  derivedFrom: ["ALHS deterministic host scenario"],
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

function reset(root) {
  if (existsSync(root)) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      renameSync(root, `${root}-stale-${String(Date.now())}`);
    }
  }
  mkdirSync(root, { recursive: true });
}

function write(relative, content) {
  const path = join(WORLD, relative);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

function writeJson(absolute, value) {
  mkdirSync(join(absolute, ".."), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`);
}

function seedWorld() {
  write(
    "TASK.md",
    [
      "# Multi-site energy deployment",
      "",
      "Produce `deliverables/capacity.md` and `deliverables/cost-v2.md`, a reviewable package for sites A and B.",
      "",
      "Sources are under `sources/`. New measured updates may appear under `.palimpsest/inputs/`; re-check it before finalizing.",
      "Do not treat an assumed corridor width as a measured fact.",
      "",
    ].join("\n"),
  );
  write(
    "sources/sites.md",
    [
      "# Sites",
      "",
      "- Site A: design minimum -12 C; maximum admissible unit width 1200 mm.",
      "- Site B: design minimum -4 C; the baseline corridor survey ASSUMED 1200 mm. This is not a measurement.",
      "",
    ].join("\n"),
  );
  write(
    "sources/vendors.md",
    ["# Vendors", "", "- Kestrel-900: unit width 900 mm; unit price 1200 EUR; lead time 8 weeks.", ""].join("\n"),
  );
  write("README.md", "# ALHS multi-site deployment\n\nSources under sources/, deliverables under deliverables/.\n");
  git(WORLD, ["init", "-q"]);
  const fixedDate = { GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z" };
  git(WORLD, ["add", "-A"], fixedDate);
  git(WORLD, ["commit", "-qm", "scenario base"], fixedDate);
  mkdirSync(join(WORLD, ".palimpsest", "inputs"), { recursive: true });
  const retained = join(WORLD, ".palimpsest", "worlds", "retained-baseline");
  mkdirSync(retained, { recursive: true });
  writeFileSync(join(retained, "README.md"), "Inactive world retained for read-fence sibling coverage.\n");
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
      policy: trustedDefaultPolicy({ allowed_commands: [] }),
      toolProfile: "normal",
      standard: STANDARD,
      advanced: { concurrency: 2 },
    },
  );
  installed.controller.start({
    projectId: PROJECT,
    goal:
      "Produce a technically defensible capacity and cost package for sites A and B. New measured facts supersede assumptions, and old results are not accepted wholesale.",
    headCommit: head,
    requirements: [
      {
        requirement_id: "R1",
        statement: "Every deliverable stays inside its declared write scope.",
        priority: "critical",
        acceptance_refs: [],
      },
      {
        requirement_id: "R2",
        statement: "A measured constraint supersedes an assumed one; do not silently keep the assumption.",
        priority: "critical",
        acceptance_refs: [],
      },
    ],
    tasks: [
      {
        task_id: "cost",
        objective: "Write the baseline cost model and the baseline assumptions.",
        depends_on: [],
        write_paths: ["deliverables/cost.md", "deliverables/assumptions.md"],
        required_artifacts: ["deliverables/cost.md", "deliverables/assumptions.md"],
      },
      {
        task_id: "capacity",
        objective: "Write the baseline capacity assessment and the baseline assumptions.",
        depends_on: [],
        write_paths: ["deliverables/capacity.md", "deliverables/assumptions.md"],
        required_artifacts: ["deliverables/capacity.md", "deliverables/assumptions.md"],
      },
    ],
  });
  return git(WORLD, ["rev-parse", "HEAD"]);
}

function deploymentProfile() {
  const windows = process.platform === "win32";
  const repository = windows ? WORLD.replace(/\\/gu, "/") : "/run/alhs/world";
  const state = windows ? STATE.replace(/\\/gu, "/") : "/run/alhs/state";
  return {
    schemaVersion: 1,
    profileId: "alhs-host",
    projectId: PROJECT,
    localPeer: "local-operator",
    repository,
    execution: "worktree",
    concurrency: 2,
    toolProfile: "normal",
    policy: { allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] },
    standard: { statement: STANDARD.statement },
    transport: { namespace: "alhs-host", databasePath: `${state}/transport.sqlite` },
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

const RESULT_PROGRAM =
  'return await tools.palimpsest_worker_result({ kind: "READY_FOR_SETTLEMENT", summary: "wrote and committed the required deliverables" });';

function workerProgram(code, description) {
  return { tool_calls: [{ id: `code_${String(Math.random()).slice(2, 8)}`, name: "run_code", input: { description, code } }] };
}

function shellPrelude() {
  return 'const shell = typeof tools.pwsh === "function" ? tools.pwsh : tools.bash;';
}

const COST_BASELINE = [
  "# Cost model (baseline)",
  "",
  "Vendor: Kestrel-900.",
  "Unit price: 1200 EUR.",
  "Lead time: 8 weeks.",
  "",
  "## Assumptions",
  "",
  "The site-B corridor is assumed to be 1200 mm; this is not a measurement.",
  "",
].join("\n");

const ASSUMPTIONS_BASELINE = [
  "# Baseline assumptions",
  "",
  "- Site B corridor: 1200 mm (assumed, not measured).",
  "- Unit: Kestrel-900, 900 mm width.",
  "",
].join("\n");

const CAPACITY_V2 = [
  "# Capacity assessment (revision 2)",
  "",
  "Measured site-B corridor: 700 mm (2026-11-03).",
  "",
  "The baseline 900 mm unit is NOT admissible at site B. No listed unit is width-admissible at site B.",
  "",
].join("\n");

const ASSUMPTIONS_V2 = [
  "# Revised assumptions",
  "",
  "- Site B corridor: 700 mm (measured 2026-11-03). The 1200 mm baseline is superseded.",
  "- The 900 mm unit is not admissible at site B.",
  "",
].join("\n");

function writeFiles(files, subject, { park = false } = {}) {
  const turns = [];
  const code = [
    shellPrelude(),
    'await shell({ command: "New-Item -ItemType Directory -Force -Path deliverables | Out-Null", description: "prepare the deliverable directory" });',
    ...files.map(
      ([path, content]) =>
        `await tools.write({ file_path: ${JSON.stringify(path)}, content: ${JSON.stringify(content)} });`,
    ),
    'return "written";',
  ].join("\n");
  turns.push(workerProgram(code, `write ${files.map(([path]) => path).join(", ")}`));
  const commit = `git add -A; git -c user.email=alhs@fixture.invalid -c "user.name=ALHS worker" commit -qm ${JSON.stringify(subject)}`;
  turns.push(workerProgram(`${shellPrelude()}\nreturn await shell({ command: ${JSON.stringify(commit)}, description: "commit the deliverables before reporting" });`, "commit the deliverables"));
  if (park) {
    // The PTC run has a 120s execution deadline; park in bounded checks and repeat the turn so a
    // genuinely late report survives a slow replacement worker.
    const park =
      'const shell = typeof tools.pwsh === "function" ? tools.pwsh : tools.bash;\n' +
      'const deadline = Date.now() + 100000;\n' +
      'while (Date.now() < deadline) {\n' +
      '  const r = await shell({ command: "Test-Path ../../release-cost", description: "check the release marker" });\n' +
      '  if (r.kind === "foreground" && /True/i.test(r.stdout.text)) return "released";\n' +
      '  await shell({ command: "Start-Sleep -Seconds 2", description: "wait for the release marker" });\n' +
      '}\n' +
      'return "still-parked";';
    turns.push(workerProgram(park, "park after the commit (1/3)"));
    turns.push(workerProgram(park, "park after the commit (2/3)"));
    turns.push(workerProgram(park, "park after the commit (3/3)"));
  }
  turns.push(workerProgram(RESULT_PROGRAM, "report the worker outcome"));
  turns.push({ text: "WORKER_DONE" });
  return turns;
}

function costV2Turns() {
  const code = [
    shellPrelude(),
    'const old = await shell({ command: "git show __TASK_COMMIT__:deliverables/cost.md", description: "read the unaffected cost model from the older result commit" });',
    'const oldText = old.kind === "foreground" ? old.stdout.text : "";',
    'const vendor = oldText.split("## Assumptions")[0].trim();',
    'const content = "# Cost model v2\\n\\nReused vendor pricing from result commit `__TASK_COMMIT__`.\\n\\n" + vendor + "\\n\\n## Revised assumptions\\n\\nCorridor measured at 700 mm on 2026-11-03. The baseline 900 mm assumption is superseded.\\n";',
    'await tools.write({ file_path: "deliverables/cost-v2.md", content });',
    'return "written";',
  ].join("\n");
  const turns = [workerProgram(code, "reuse the unaffected cost model and recompute the assumptions")];
  const commit =
    'git add -A; git -c user.email=alhs@fixture.invalid -c "user.name=ALHS worker" commit -qm "write reused cost model"';
  turns.push(workerProgram(`${shellPrelude()}\nreturn await shell({ command: ${JSON.stringify(commit)}, description: "commit the reused cost model" });`, "commit the cost v2 deliverable"));
  turns.push(workerProgram(RESULT_PROGRAM, "report the worker outcome"));
  turns.push({ text: "WORKER_DONE" });
  return turns;
}

function hostHold(path) {
  return {
    tool_calls: [
      {
        id: `hold_${String(Math.random()).slice(2, 8)}`,
        name: "pwsh",
        input: {
          // The DSH pwsh tool moves >120s commands to a background job, which would let the
          // principal session end and kill a parked worker. Bound every wait below that ceiling and
          // return as soon as the operator releases; the script repeats the turn for longer waits.
          command:
            `$deadline=(Get-Date).AddSeconds(100); while (-not (Test-Path ${path}) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 200 }`,
          description: "keep this principal host alive until the operator releases it",
        },
      },
    ],
  };
}

function scripts() {
  return {
    scripts: [
      {
        match: "Your task: Write the baseline cost model",
        turns: writeFiles(
          [
            ["deliverables/cost.md", COST_BASELINE],
            ["deliverables/assumptions.md", ASSUMPTIONS_BASELINE],
          ],
          "write cost baseline",
          { park: true },
        ),
      },
      {
        match: "Your task: Write the revised capacity assessment",
        turns: writeFiles(
          [
            ["deliverables/capacity.md", CAPACITY_V2],
            ["deliverables/assumptions.md", ASSUMPTIONS_V2],
          ],
          "write revised capacity",
        ),
      },
      {
        match: "Your task: Reuse the vendor pricing",
        turns: costV2Turns(),
      },
      {
        match: "ALHS_PRINCIPAL_A1",
        turns: [
          { tool_calls: [{ id: "a1_pulse", name: "palimpsest_continuity", input: { action: "pulse" } }] },
          { tool_calls: [{ id: "a1_delegate", name: "palimpsest_work", input: { action: "delegate", taskId: "cost" } }] },
          hostHold(".palimpsest/release-host-a1"),
          hostHold(".palimpsest/release-host-a1"),
          hostHold(".palimpsest/release-host-a1"),
          { tool_calls: [{ id: "a1_workers", name: "palimpsest_work", input: { action: "workers" } }] },
          { text: "ALHS_A1_DONE" },
        ],
      },
      {
        match: "ALHS_PRINCIPAL_A2",
        turns: [
          { tool_calls: [{ id: "a2_pulse", name: "palimpsest_continuity", input: { action: "pulse" } }] },
          {
            tool_calls: [
              {
                id: "a2_record",
                name: "palimpsest_contribute",
                input: {
                  action: "record",
                  sourceKind: "EXPLORATION",
                  sourceRef: ".palimpsest/inputs/corridor-measurement",
                  task: "Check the measured site-B corridor against the baseline assumption.",
                  finding:
                    "The measured corridor is 700 mm; the 900 mm unit is not admissible at site B. The 1200 mm baseline is superseded.",
                  declaredReadFootprint: [".palimpsest/inputs/corridor-measurement.md", "sources/sites.md"],
                },
              },
            ],
          },
          {
            tool_calls: [
              {
                id: "a2_decide",
                name: "palimpsest_contribute",
                input: {
                  action: "decide",
                  contributionId: "__CONTRIBUTION_ID__",
                  decision: "REVISE_PLAN",
                  decisionNote:
                    "The measured 700 mm site-B corridor invalidates both baseline tasks; retire them and write the revised capacity assessment on the measured basis.",
                  reason: "the measured constraint changes the binding task assumptions",
                  changeClass: "behavior_change",
                  changedIds: ["cost", "capacity"],
                  declaredChangedPlan: true,
                  tasks: [
                    {
                      task_id: "capacity-v2",
                      objective: "Write the revised capacity assessment after the measured corridor constraint.",
                      depends_on: [],
                      write_paths: ["deliverables/capacity.md", "deliverables/assumptions.md"],
                      required_artifacts: ["deliverables/capacity.md", "deliverables/assumptions.md"],
                    },
                  ],
                },
              },
            ],
          },
          { tool_calls: [{ id: "a2_delegate", name: "palimpsest_work", input: { action: "delegate", taskId: "capacity-v2" } }] },
          hostHold(".palimpsest/release-host-a2"),
          hostHold(".palimpsest/release-host-a2"),
          hostHold(".palimpsest/release-host-a2"),
          { tool_calls: [{ id: "a2_workers", name: "palimpsest_work", input: { action: "workers" } }] },
          { text: "ALHS_A2_DONE" },
        ],
      },
      {
        match: "ALHS_PRINCIPAL_A3",
        turns: [
          { tool_calls: [{ id: "a3_pulse", name: "palimpsest_continuity", input: { action: "pulse" } }] },
          { tool_calls: [{ id: "a3_results", name: "palimpsest_work", input: { action: "results", taskId: "cost" } }] },
          {
            tool_calls: [
              {
                id: "a3_plan",
                name: "palimpsest_work",
                input: {
                  action: "plan",
                  reason:
                    "The late cost result still holds valid vendor pricing, but its baseline assumptions conflict with the measured corridor. Add a governed task that reuses the unaffected cost model and recomputes the assumptions.",
                  tasks: [
                    {
                      task_id: "capacity-v2",
                      objective: "Write the revised capacity assessment after the measured corridor constraint.",
                      depends_on: [],
                      write_paths: ["deliverables/capacity.md", "deliverables/assumptions.md"],
                      required_artifacts: ["deliverables/capacity.md", "deliverables/assumptions.md"],
                    },
                    {
                      task_id: "cost-v2",
                      objective:
                        "Reuse the vendor pricing recorded in result commit __RESULT_COMMIT__ and recompute the assumptions affected by the measured corridor. Write deliverables/cost-v2.md.",
                      depends_on: [],
                      write_paths: ["deliverables/cost-v2.md"],
                      required_artifacts: ["deliverables/cost-v2.md"],
                    },
                  ],
                },
              },
            ],
          },
          { tool_calls: [{ id: "a3_delegate", name: "palimpsest_work", input: { action: "delegate", taskId: "cost-v2" } }] },
          hostHold(".palimpsest/release-host-a3"),
          hostHold(".palimpsest/release-host-a3"),
          hostHold(".palimpsest/release-host-a3"),
          { tool_calls: [{ id: "a3_run", name: "palimpsest_work", input: { action: "run", maxSteps: 8 } }] },
          {
            tool_calls: [
              {
                id: "a3_conclude",
                name: "palimpsest_work",
                input: {
                  action: "conclude",
                  intent: "WAIT_FOR_OPERATOR",
                  statement: "The reused cost package is delivered and awaits the operator's acceptance decision.",
                  waitingOn: "operator acceptance of the delivered cost-v2 result",
                  evidenceRefs: ["commit:reused-cost"],
                },
              },
            ],
          },
          { text: "ALHS_A3_DONE" },
        ],
      },
      {
        match: "ALHS_PRINCIPAL_A4",
        turns: [
          { tool_calls: [{ id: "a4_pulse", name: "palimpsest_continuity", input: { action: "pulse" } }] },
          {
            tool_calls: [
              {
                id: "a4_conclude",
                name: "palimpsest_work",
                input: {
                  action: "conclude",
                  intent: "DELIVER",
                  statement:
                    "The measured capacity assessment and the reused cost package are both accepted; the package is complete for this episode.",
                  artifacts: ["deliverables/capacity.md", "deliverables/cost-v2.md"],
                },
              },
            ],
          },
          { text: "ALHS_A4_DONE" },
        ],
      },
    ],
  };
}

reset(RUN);
const head = seedWorld();
seedProject(head);
writeJson(join(RUN, "deployment.json"), deploymentProfile());
writeJson(join(RUN, "mock-scripts.json"), scripts());
writeJson(join(RUN, "seed.json"), {
  schema: "alhs-host-seed/v1",
  projectId: PROJECT,
  head,
  world: WORLD,
  state: STATE,
  note: "Deterministic ALHS host scenario. The model content is a stand-in; host, workers, Git and product state are real.",
});
process.stdout.write(`${JSON.stringify({ run: RUN, head, project: PROJECT })}\n`);
