/**
 * LHAPE real-host scenario preparation.
 *
 * Test-owned setup: one Git world, one seeded project, one deployment profile and the deterministic
 * Messages scripts. The host, product, SQLite state, worker processes and tool calls are real; the
 * model content is a stand-in and is labelled that way everywhere.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { installProduct, trustedDefaultPolicy } from "../../dist/src/product.js";
import { contributionIdOf } from "../../dist/src/project_contribution/index.js";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const RUN = resolve(String(args.get("run") ?? join(process.env.HOME ?? ".", "lhape-run")));
const SCENARIO = String(args.get("scenario") ?? "main");
const WORLD = join(RUN, "world");
const STATE = join(RUN, "state");
const INPUTS = join(WORLD, ".palimpsest", "inputs");

const STANDARD = {
  statement: "Stay inside the declared write scope, leave the required artifact, and do not treat an unverified source claim as accepted.",
  clauses: [{ kind: "scope_respected" }],
  derivedFrom: ["LHAPE deterministic host scenario"],
  confirmed: true,
  notes: [],
};

function git(cwd, argv, env = {}) {
  return execFileSync("git", ["-c", "user.email=lhape@fixture.invalid", "-c", "user.name=LHAPE fixture", ...argv], {
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
      /**
       * A previous run may still hold a handle, or a read-fenced world directory may refuse deletion.
       * Preserve it under a stale name rather than failing the new run, and never touch the CURRENT
       * root's contents in place.
       */
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
    "sources/capacity.csv",
    [
      "site,unit,min_c,max_c,unit_width_mm,lead_weeks",
      "site_a,Kestrel-900,-20,45,900,8",
      "site_b,Kestrel-900,-15,40,900,8",
      "",
    ].join("\n"),
  );
  write(
    "sources/sites.md",
    [
      "# Sites",
      "",
      "- Site A: design minimum -12 °C; maximum admissible unit width 1200 mm.",
      "- Site B: design minimum -4 °C; the baseline corridor survey assumed 1200 mm.",
      "",
      "The corridor survey is an ASSUMPTION until the measured update is read. Do not treat the baseline width as measured fact.",
      "",
    ].join("\n"),
  );
  write("README.md", "# LHAPE multi-site deployment\n\nSources are under sources/. Deliverables go under deliverables/.\n");
  git(WORLD, ["init", "-q"]);
  const fixedDate = { GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z" };
  git(WORLD, ["add", "-A"], fixedDate);
  git(WORLD, ["commit", "-qm", "scenario base"], fixedDate);
  mkdirSync(INPUTS, { recursive: true });
  /**
   * A retained inactive world. The Windows read fence must cover every sibling under the worlds root,
   * and a fresh project otherwise has none. This is real host state, not project content: it gives the
   * fence a sibling to label and keeps the worker's coverage claim honest.
   */
  const retained = join(WORLD, ".palimpsest", "worlds", "retained-baseline");
  mkdirSync(retained, { recursive: true });
  writeFileSync(join(retained, "README.md"), "Inactive world retained for read-fence sibling coverage.\n");
  return git(WORLD, ["rev-parse", "HEAD"]);
}

function installForSeed(projectId, head, tasks, goal) {
  const installed = installProduct(
    { tools: { register: () => () => undefined } },
    {
      projectId,
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
    projectId,
    goal,
    headCommit: head,
    requirements: [
      {
        requirement_id: "R1",
        statement: "Every deliverable must stay inside its declared write scope.",
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
    tasks,
  });
  return installed;
}

function deploymentProfile(projectId) {
  /**
   * The Windows host addresses the run-owned world/state directly; the WSL host addressed the same
   * layout through its bind mounts at /run/lhape. One profile shape, two path spellings.
   */
  const windows = process.platform === "win32";
  const repository = windows ? WORLD.replace(/\\/gu, "/") : "/run/lhape/world";
  const state = windows ? STATE.replace(/\\/gu, "/") : "/run/lhape/state";
  return {
    schemaVersion: 1,
    profileId: "lhape-host",
    projectId,
    localPeer: "local-operator",
    repository,
    execution: "worktree",
    concurrency: 2,
    toolProfile: "normal",
    policy: { allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] },
    standard: { statement: STANDARD.statement },
    transport: { namespace: "lhape-host", databasePath: `${state}/transport.sqlite` },
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
  'return await tools.palimpsest_worker_result({ kind: "READY_FOR_SETTLEMENT", summary: "wrote and committed the required deliverable" });';

/**
 * The worker's wire is PTC-only: the model writes a program and calls the agent-visible tools through
 * `tools.<name>`. On Windows the shell is `pwsh`; the fallback keeps the same scripts usable if a Linux
 * worker path is ever admitted with `bash`.
 */
function workerProgram(code, description) {
  return { tool_calls: [{ id: `code_${String(Math.random()).slice(2, 8)}`, name: "run_code", input: { description, code } }] };
}

function shellPrelude() {
  return 'const shell = typeof tools.pwsh === "function" ? tools.pwsh : tools.bash;';
}

function workerTurns({ reads = [], writePath, content, marker, extraCommand, parkAfterCommit = false }) {
  const turns = [];
  const readLines = reads.map((file) => `await tools.read({ file_path: ${JSON.stringify(file)} });`);
  const writeCode = [
    shellPrelude(),
    ...readLines,
    `await shell({ command: "New-Item -ItemType Directory -Force -Path deliverables | Out-Null", description: "prepare deliverable directory" });`,
    `await tools.write({ file_path: ${JSON.stringify(writePath)}, content: ${JSON.stringify(content)} });`,
    'return "written";',
  ].join("\n");
  if (extraCommand !== undefined) {
    turns.push(workerProgram(`${shellPrelude()}\n${extraCommand}`, "wait for the controlled scenario step"));
  }
  turns.push(workerProgram(writeCode, `write ${writePath}`));
  /**
   * NO in-world marker after the commit: an uncommitted marker makes the world dirty and settlement
   * correctly refuses it as UNCOMMITTED_WORK. Completion is observed through canonical Attempt state.
   */
  const commitCommand = `git add -A; git -c user.email=lhape@fixture.invalid -c "user.name=LHAPE worker" commit -qm "write ${writePath}"`;
  turns.push(workerProgram(`${shellPrelude()}\nreturn await shell({ command: ${JSON.stringify(commitCommand)}, description: "commit the deliverable before reporting" });`, "commit the deliverable"));
  if (parkAfterCommit) {
    /**
     * Commit FIRST, then park without reporting. The result therefore arrives only after the
     * controlled release, which the operator performs after the plan revision — a genuinely late
     * result whose commit already exists.
     */
    turns.push(
      workerProgram(
        `${shellPrelude()}\nreturn await shell({ command: "while (-not (Test-Path ../../release-baseline)) { Start-Sleep -Milliseconds 200 }", description: "park after the commit until the operator releases" });`,
        "park after the commit",
      ),
    );
  }
  turns.push(workerProgram(RESULT_PROGRAM, "report the worker outcome"));
  turns.push({ text: "WORKER_DONE" });
  return turns;
}

/* ------------------------------------------------------------------ main */

const MAIN_PROJECT = "lhape";
const MAIN_GOAL =
  "Evaluate a multi-site energy deployment and leave a consistent, reviewable package: baseline capacity and cost, a revised package after the measured corridor constraint, and an integrated decision artifact.";

const INITIAL_TASKS = [
  {
    task_id: "capacity",
    objective: "Write the baseline capacity assessment for site A and site B from sources/capacity.csv and sources/sites.md into deliverables/capacity.md.",
    depends_on: [],
    write_paths: ["deliverables/capacity.md"],
    required_artifacts: ["deliverables/capacity.md"],
  },
  {
    task_id: "cost",
    objective: "Write the baseline cost model for the selected 900 mm unit from sources/capacity.csv into deliverables/cost.md.",
    depends_on: [],
    write_paths: ["deliverables/cost.md"],
    required_artifacts: ["deliverables/cost.md"],
  },
];

const REPLANNED_TASKS = [
  {
    task_id: "capacity-v2",
    objective: "Write the revised capacity assessment for the measured 700 mm site-B corridor from sources/capacity.csv and sources/sites.md into deliverables/capacity-v2.md. The measured corridor is 700 mm.",
    depends_on: [],
    write_paths: ["deliverables/capacity-v2.md"],
    required_artifacts: ["deliverables/capacity-v2.md"],
  },
  {
    task_id: "cost-v2",
    objective: "Write the revised cost model for the admissible 700 mm unit from sources/capacity.csv into deliverables/cost-v2.md. The measured corridor is 700 mm, so the 900 mm unit is not admissible.",
    depends_on: [],
    write_paths: ["deliverables/cost-v2.md"],
    required_artifacts: ["deliverables/cost-v2.md"],
  },
  {
    task_id: "integration",
    objective: "Combine the accepted capacity and cost deliverables into deliverables/integration.md, naming both accepted sources.",
    depends_on: ["capacity-v2", "cost-v2"],
    write_paths: ["deliverables/integration.md"],
    required_artifacts: ["deliverables/integration.md"],
  },
];

const CONSTRAINT_FINDING =
  "The measured site-B corridor is 700 mm, so the 900 mm unit used by the baseline cost model is not admissible; the baseline cost assumption is invalid.";
const CONSTRAINT_TASK = "Check whether the measured site-B corridor admits the 900 mm unit.";
const CONSTRAINT_REF = "subagent:constraint-check";

function mainScripts(contributionId) {
  const capacityV1 = workerTurns({
    reads: ["sources/capacity.csv", "sources/sites.md"],
    writePath: "deliverables/capacity.md",
    content:
      "# Baseline capacity assessment\n\nSite A: Kestrel-900 meets -12 °C and 1200 mm. Site B: Kestrel-900 meets -4 °C; the 1200 mm corridor is the BASELINE ASSUMPTION, not measured.\n",
    parkAfterCommit: true,
  });
  const costV1 = workerTurns({
    reads: ["sources/capacity.csv"],
    writePath: "deliverables/cost.md",
    content:
      "# Baseline cost model\n\nOne 900 mm Kestrel-900 unit per site; eight-week lead time. This model depends on the assumed 1200 mm site-B corridor.\n",
    parkAfterCommit: true,
  });
  const capacityV2 = workerTurns({
    reads: ["sources/capacity.csv", "sources/sites.md"],
    writePath: "deliverables/capacity-v2.md",
    content:
      "# Revised capacity assessment\n\nThe measured site-B corridor is 700 mm. The 900 mm unit is NOT admissible at site B; site A remains admissible. The baseline 1200 mm assumption is superseded.\n",
    marker: ".lhape/w3-committed",
  });
  const costV2 = workerTurns({
    reads: ["sources/capacity.csv"],
    writePath: "deliverables/cost-v2.md",
    content:
      "# Revised cost model\n\nThe 900 mm unit is excluded by the measured 700 mm site-B corridor. Use the 700 mm-compatible unit; the baseline cost line is invalid and must not be reused.\n",
    marker: ".lhape/w4-committed",
  });
  const costRework = workerTurns({
    reads: ["sources/capacity.csv", "deliverables/capacity-v2.md"],
    writePath: "deliverables/cost-v2.md",
    content:
      "# Revised cost model (reworked on the current basis)\n\nThe accepted capacity-v2 result excludes the 900 mm unit at site B. The cost model now uses the 700 mm-compatible unit; the baseline cost line is not reused.\n",
    marker: ".lhape/w5-committed",
  });
  const integration = workerTurns({
    reads: ["deliverables/capacity-v2.md", "deliverables/cost-v2.md"],
    writePath: "deliverables/integration.md",
    content:
      "# Integrated deployment decision\n\nThis package is consistent with the accepted capacity-v2 and cost-v2 results: the measured 700 mm site-B corridor excludes the 900 mm unit, and the revised cost model uses the compatible unit. The baseline capacity/cost results are historical and are not part of the accepted package.\n",
    marker: ".lhape/w6-committed",
  });

  return [
    // Reworked cost-v2: the worker prompt carries Continuation context; it must win over the baseline.
    { match: "Continuation context", turns: costRework },
    { match: "Your task: Write the baseline capacity assessment", turns: capacityV1 },
    { match: "Your task: Write the baseline cost model", turns: costV1 },
    { match: "Your task: Write the revised capacity assessment", turns: capacityV2 },
    { match: "Your task: Write the revised cost model", turns: costV2 },
    { match: "Your task: Combine the accepted capacity and cost deliverables", turns: integration },
    /**
     * The Windows read-fence admits ONE active confidential worker per HOST. The project's declared
     * concurrency is 2, so the scenario uses two real hosts with distinct capacity roots: each host
     * contributes one live worker, and both share the canonical project.
     */
    {
      match: "LHAPE_PRINCIPAL_S1A",
      turns: [
        { tool_calls: [{ id: "s1a_pulse", name: "palimpsest_continuity", input: { action: "pulse" } }] },
        { tool_calls: [{ id: "s1a_delegate_a", name: "palimpsest_work", input: { action: "delegate", taskId: "capacity" } }] },
        { tool_calls: [{ id: "s1a_hold", name: "pwsh", input: { command: "Start-Sleep -Seconds 100", description: "keep this host and its real worker alive" } }] },
        { tool_calls: [{ id: "s1a_workers", name: "palimpsest_work", input: { action: "workers" } }] },
        { text: "LHAPE_S1A_DONE" },
      ],
    },
    {
      match: "LHAPE_PRINCIPAL_S1B",
      turns: [
        { tool_calls: [{ id: "s1b_pulse", name: "palimpsest_continuity", input: { action: "pulse" } }] },
        { tool_calls: [{ id: "s1b_delegate_b", name: "palimpsest_work", input: { action: "delegate", taskId: "cost" } }] },
        { tool_calls: [{ id: "s1b_hold", name: "pwsh", input: { command: "Start-Sleep -Seconds 100", description: "keep this host and its parked worker alive" } }] },
        { tool_calls: [{ id: "s1b_workers", name: "palimpsest_work", input: { action: "workers" } }] },
        { text: "LHAPE_S1B_DONE" },
      ],
    },
    {
      match: "LHAPE_PRINCIPAL_S1C",
      turns: [
        { tool_calls: [{ id: "s1c_pulse", name: "palimpsest_continuity", input: { action: "pulse" } }] },
        {
          tool_calls: [
            {
              id: "s1c_subagent",
              name: "subagent",
              input: {
                description: "check the measured corridor",
                prompt:
                  "LHAPE_CHILD_CONSTRAINT Read .palimpsest/inputs/constraint-update.md and sources/sites.md. State whether the 900 mm unit is admissible at site B. Return ONLY the finding in one sentence. Do not edit anything.",
              },
            },
          ],
        },
        {
          tool_calls: [
            {
              id: "s1c_record",
              name: "palimpsest_contribute",
              input: {
                action: "record",
                sourceKind: "NATIVE_SUBAGENT",
                sourceRef: CONSTRAINT_REF,
                task: CONSTRAINT_TASK,
                finding: CONSTRAINT_FINDING,
                declaredReadFootprint: [".palimpsest/inputs/constraint-update.md", "sources/sites.md"],
              },
            },
          ],
        },
        {
          tool_calls: [
            {
              id: "s1c_decide",
              name: "palimpsest_contribute",
              input: {
                action: "decide",
                contributionId,
                decision: "REVISE_PLAN",
                decisionNote:
                  "The measured 700 mm site-B corridor invalidates the 900 mm baseline assumption. Retire both baseline tasks and produce a revised package plus an integration task.",
                reason: "the measured constraint changes the binding task assumptions",
                changeClass: "behavior_change",
                changedIds: ["capacity", "cost"],
                declaredChangedPlan: true,
                tasks: REPLANNED_TASKS,
              },
            },
          ],
        },
        { tool_calls: [{ id: "s1c_delegate_a2", name: "palimpsest_work", input: { action: "delegate", taskId: "capacity-v2" } }] },
        { tool_calls: [{ id: "s1c_hold", name: "pwsh", input: { command: "Start-Sleep -Seconds 60", description: "keep this host and its real worker alive" } }] },
        { tool_calls: [{ id: "s1c_workers", name: "palimpsest_work", input: { action: "workers" } }] },
        { tool_calls: [{ id: "s1c_results", name: "palimpsest_work", input: { action: "results", taskId: "cost" } }] },
        { text: "LHAPE_S1C_DONE" },
      ],
    },
    {
      match: "LHAPE_PRINCIPAL_S1D",
      turns: [
        { tool_calls: [{ id: "s1d_pulse", name: "palimpsest_continuity", input: { action: "pulse" } }] },
        { tool_calls: [{ id: "s1d_delegate_b2", name: "palimpsest_work", input: { action: "delegate", taskId: "cost-v2" } }] },
        { tool_calls: [{ id: "s1d_hold", name: "pwsh", input: { command: "Start-Sleep -Seconds 60", description: "keep this host and its real worker alive" } }] },
        { tool_calls: [{ id: "s1d_workers", name: "palimpsest_work", input: { action: "workers" } }] },
        { tool_calls: [{ id: "s1d_results", name: "palimpsest_work", input: { action: "results", taskId: "cost-v2" } }] },
        { text: "LHAPE_S1D_DONE" },
      ],
    },
    {
      match: "LHAPE_CHILD_CONSTRAINT",
      turns: [
        {
          tool_calls: [
            { id: "child_read_constraint", name: "read", input: { file_path: ".palimpsest/inputs/constraint-update.md" } },
            { id: "child_read_sites", name: "read", input: { file_path: "sources/sites.md" } },
          ],
        },
        { text: CONSTRAINT_FINDING },
      ],
    },
    {
      match: "LHAPE_PRINCIPAL_S2",
      turns: [
        { tool_calls: [{ id: "s2_pulse", name: "palimpsest_continuity", input: { action: "pulse" } }] },
        { tool_calls: [{ id: "s2_results", name: "palimpsest_work", input: { action: "results", taskId: "cost-v2" } }] },
        {
          tool_calls: [
            {
              id: "s2_inspect_stale",
              name: "pwsh",
              input: {
                command: "git show __RESULT_COMMIT__:deliverables/cost-v2.md",
                description: "read the late result that was computed on the retired basis",
              },
            },
          ],
        },
        {
          tool_calls: [
            {
              id: "s2_rework",
              name: "palimpsest_work",
              input: {
                action: "continue",
                taskId: "cost-v2",
                route: "rework",
                expectedAssessmentDigest: "__DIGEST__",
              },
            },
          ],
        },
        {
          tool_calls: [
            {
              id: "s2_wait_worker",
              name: "pwsh",
              input: { command: "Start-Sleep -Seconds 45", description: "keep the host alive while the rework worker finishes" },
            },
          ],
        },
        { tool_calls: [{ id: "s2_workers", name: "palimpsest_work", input: { action: "workers" } }] },
        { tool_calls: [{ id: "s2_results_after", name: "palimpsest_work", input: { action: "results", taskId: "cost-v2" } }] },
        { text: "LHAPE_S2_DONE" },
      ],
    },
    {
      match: "LHAPE_PRINCIPAL_S3",
      turns: [
        { tool_calls: [{ id: "s3_pulse", name: "palimpsest_continuity", input: { action: "pulse" } }] },
        /**
         * The integration task is BLOCKED until its dependencies are SATISFIED; the legal unblock is a
         * scheduler step, not a delegation. `delegate` then starts the task the project actually made next.
         */
        { tool_calls: [{ id: "s3_next", name: "palimpsest_work", input: { action: "next" } }] },
        { tool_calls: [{ id: "s3_delegate_integration", name: "palimpsest_work", input: { action: "delegate", taskId: "integration" } }] },
        {
          tool_calls: [
            {
              id: "s3_wait_worker",
              name: "pwsh",
              input: { command: "Start-Sleep -Seconds 45", description: "keep the host alive while the integration worker finishes" },
            },
          ],
        },
        { tool_calls: [{ id: "s3_workers", name: "palimpsest_work", input: { action: "workers" } }] },
        { text: "LHAPE_S3_DONE" },
      ],
    },
  ];
}

/* ------------------------------------------------------------- interrupt */

const INTERRUPT_PROJECT = "lhape-interrupt";
const INTERRUPT_GOAL = "Recover a delivered candidate after the host process is killed, without re-running the work.";
const INTERRUPT_TASKS = [
  {
    task_id: "interrupted-write",
    objective: "Write the interrupted recovery artifact from sources/sites.md into deliverables/interrupted.md.",
    depends_on: [],
    write_paths: ["deliverables/interrupted.md"],
    required_artifacts: ["deliverables/interrupted.md"],
  },
];

function interruptScripts() {
  return [
    {
      match: "Your task: Write the interrupted recovery artifact",
      turns: [
        workerProgram(
          [
            shellPrelude(),
            'await tools.read({ file_path: "sources/sites.md" });',
            'await shell({ command: "New-Item -ItemType Directory -Force -Path deliverables | Out-Null", description: "prepare deliverable directory" });',
            'await tools.write({ file_path: "deliverables/interrupted.md", content: "# Interrupted recovery artifact\\n\\nThis artifact was written and committed by a real worker before the host was killed. The worker did not report an outcome; the new host observes the world.\\n" });',
            'return await shell({ command: "git add -A; git -c user.email=lhape@fixture.invalid -c \\"user.name=LHAPE worker\\" commit -qm \\"write interrupted artifact\\"; while (-not (Test-Path ../../never-release)) { Start-Sleep -Seconds 1 }", description: "commit and stay alive until the host is killed" });',
          ].join("\n"),
          "write, commit and park the interrupted artifact",
        ),
        { text: "INTERRUPT_WORKER_PARKED" },
      ],
    },
    {
      match: "LHAPE_PRINCIPAL_IR1",
      turns: [
        { tool_calls: [{ id: "ir1_pulse", name: "palimpsest_continuity", input: { action: "pulse" } }] },
        { tool_calls: [{ id: "ir1_delegate", name: "palimpsest_work", input: { action: "delegate", taskId: "interrupted-write" } }] },
        {
          tool_calls: [
            {
              id: "ir1_hold",
              name: "pwsh",
              input: { command: "Start-Sleep -Seconds 120", description: "keep this host alive for the controlled kill" },
            },
          ],
        },
      ],
    },
    {
      match: "LHAPE_PRINCIPAL_IR2",
      turns: [
        { tool_calls: [{ id: "ir2_pulse", name: "palimpsest_continuity", input: { action: "pulse" } }] },
        { tool_calls: [{ id: "ir2_workers", name: "palimpsest_work", input: { action: "workers" } }] },
        { tool_calls: [{ id: "ir2_complete", name: "palimpsest_work", input: { action: "complete", taskId: "interrupted-write", summary: "settle from the committed world after the old host was killed" } }] },
        { tool_calls: [{ id: "ir2_results", name: "palimpsest_work", input: { action: "results", taskId: "interrupted-write" } }] },
        { text: "LHAPE_IR2_DONE" },
      ],
    },
  ];
}

/* ------------------------------------------------------------------- run */

reset(RUN);
mkdirSync(WORLD, { recursive: true });
mkdirSync(STATE, { recursive: true });
const head = seedWorld();

if (SCENARIO === "main") {
  const installed = installForSeed(MAIN_PROJECT, head, INITIAL_TASKS, MAIN_GOAL);
  const ir = installed.controller.work.project();
  const basis = { projectRevision: ir.revision, projectDigest: ir.digest, headCommit: ir.head_commit };
  const contributionId = contributionIdOf({
    projectId: MAIN_PROJECT,
    sourceKind: "NATIVE_SUBAGENT",
    sourceRef: CONSTRAINT_REF,
    task: CONSTRAINT_TASK,
    finding: CONSTRAINT_FINDING,
    basis,
  });
  await installed.dispose();
  writeJson(join(RUN, "deployment.json"), deploymentProfile(MAIN_PROJECT));
  writeJson(join(RUN, "seed.json"), {
    scenario: SCENARIO,
    projectId: MAIN_PROJECT,
    goal: MAIN_GOAL,
    head,
    basis,
    contributionId,
    initialTasks: INITIAL_TASKS,
    replannedTasks: REPLANNED_TASKS,
    finding: CONSTRAINT_FINDING,
  });
  writeJson(join(RUN, "mock-scripts.json"), {
    schema: "lhape-host-scripts/v1",
    note: "Deterministic Messages stand-in. NOT a model. The DSH host, worker subprocesses, tool calls and Git effects are real.",
    scripts: mainScripts(contributionId),
  });
} else if (SCENARIO === "interrupt") {
  const installed = installForSeed(INTERRUPT_PROJECT, head, INTERRUPT_TASKS, INTERRUPT_GOAL);
  await installed.dispose();
  writeJson(join(RUN, "deployment.json"), deploymentProfile(INTERRUPT_PROJECT));
  writeJson(join(RUN, "seed.json"), {
    scenario: SCENARIO,
    projectId: INTERRUPT_PROJECT,
    goal: INTERRUPT_GOAL,
    head,
    tasks: INTERRUPT_TASKS,
  });
  writeJson(join(RUN, "mock-scripts.json"), {
    schema: "lhape-host-scripts/v1",
    note: "Deterministic Messages stand-in. NOT a model. The interrupted host and worker are real processes.",
    scripts: interruptScripts(),
  });
} else {
  throw new Error(`unknown scenario ${SCENARIO}`);
}

process.stdout.write(
  `${JSON.stringify({ run: RUN, scenario: SCENARIO, head, world: WORLD, state: STATE, deployment: join(RUN, "deployment.json") }, null, 2)}\n`,
);
