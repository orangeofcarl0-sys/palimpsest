/**
 * ODPE-C deterministic real-host preparation (CROSS-DOMAIN scenario).
 *
 * Test-owned setup for the Windows DSH host. The host, worker processes, SQLite state, Git effects
 * and Palimpsest product calls are real; the model content is a labelled Messages stand-in.
 *
 * The scenario is a software migration — deliberately NOT the energy deployment and NOT
 * `inbox/`/`700 mm`, so the product cannot be passing by recognizing the earlier fixture:
 *
 *   P1  a real worker commits a partial migration plan and parks; the host tree is KILLED;
 *   NEW REALITY a measured payload fact appears as an UNTRACKED project path after the basis;
 *   P2  a NEW principal succeeds the retained attempt, delegates a NEW attempt, and the worker
 *       receives the measured fact through the CONTEXT PULL (no principal copy);
 *       the worker writes/commits the plan from the pulled bytes, then exits WITHOUT reporting;
 *       the principal derives readiness, finalizes the observed candidate, concludes
 *       WAIT_FOR_OPERATOR;
 *   OPERATOR promotes the candidate through the existing path;
 *   P3  a later session records DELIVER over the accepted asset.
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
const RUN = resolve(String(args.get("run") ?? join(process.env.HOME ?? ".", "odpe-run")));
const WORLD = join(RUN, "world");
const STATE = join(RUN, "state");
const PROJECT = "odpe";
const TASK = "billing-cutover";
const INPUT_PATH = "updates/2026-11-03/payload-measurement.md";

const STANDARD = {
  statement:
    "Stay inside the declared write scope, leave the required artifact, and do not rely on an assumption the current measured basis contradicts.",
  clauses: [{ kind: "scope_respected" }],
  derivedFrom: ["ODPE deterministic host scenario"],
  confirmed: true,
  notes: [],
};

function git(cwd, argv, env = {}) {
  return execFileSync("git", ["-c", "user.email=odpe@fixture.invalid", "-c", "user.name=ODPE fixture", ...argv], {
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
      "# Billing cutover",
      "",
      "Produce `deliverables/migration-plan.md`: a reviewable plan for moving the billing service from",
      "REST to gRPC across the orders, billing and gateway modules, stating the current measured basis",
      "and the assumptions it does NOT rely on.",
      "",
      "Sources are under `services/` and `docs/`. New measured updates appear as untracked project paths.",
      "",
    ].join("\n"),
  );
  write(
    "services/billing/README.md",
    [
      "# Billing service",
      "",
      "- Batch endpoint: `POST /batch` accepts a JSON array of invoice lines.",
      "- The batch path is the only high-volume REST endpoint.",
      "- Unit tests cover 100 and 500 invoice lines.",
      "",
    ].join("\n"),
  );
  write(
    "services/orders/README.md",
    ["# Orders service", "", "- Calls billing synchronously; no batch payload of its own.", ""].join("\n"),
  );
  write(
    "docs/interface.md",
    [
      "# Interface notes",
      "",
      "- The legacy gateway is ASSUMED to cap unary messages at 64 KiB. This is an assumption, not a measurement.",
      "- The gRPC migration is expected to keep one method per endpoint.",
      "",
    ].join("\n"),
  );
  write("README.md", "# ODPE billing cutover\n\nSources under services/ and docs/, deliverables under deliverables/.\n");
  // The product's own state root is not project content. Note what is NOT ignored: an untracked
  // measurement under `updates/` must remain observable as a project input.
  write(".gitignore", ".palimpsest/\n");
  git(WORLD, ["init", "-q"]);
  const fixedDate = { GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z" };
  git(WORLD, ["add", "-A"], fixedDate);
  git(WORLD, ["commit", "-qm", "scenario base"], fixedDate);
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
      policy: trustedDefaultPolicy({ allowed_commands: [] }),
      toolProfile: "normal",
      standard: STANDARD,
      advanced: { concurrency: 1 },
    },
  );
  installed.controller.start({
    projectId: PROJECT,
    goal:
      "Produce a defensible billing migration plan. A measured payload fact supersedes the gateway assumption, and an unfinished worker's work may be continued rather than redone.",
    headCommit: head,
    requirements: [
      {
        requirement_id: "R1",
        statement: "The plan states the measured payload basis and does not rely on the superseded 64 KiB assumption.",
        priority: "critical",
        acceptance_refs: [],
      },
    ],
    tasks: [
      {
        task_id: TASK,
        objective: "Produce the migration plan for the billing cutover.",
        depends_on: [],
        write_paths: ["deliverables"],
        required_artifacts: ["deliverables/migration-plan.md"],
      },
    ],
  });
  return head;
}

function deploymentProfile() {
  const windows = process.platform === "win32";
  const repository = windows ? WORLD.replace(/\\/gu, "/") : "/run/odpe/world";
  const state = windows ? STATE.replace(/\\/gu, "/") : "/run/odpe/state";
  return {
    schemaVersion: 1,
    profileId: "odpe-host",
    projectId: PROJECT,
    localPeer: "local-operator",
    repository,
    execution: "worktree",
    concurrency: 1,
    toolProfile: "normal",
    policy: { allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] },
    standard: { statement: STANDARD.statement },
    transport: { namespace: "odpe-host", databasePath: `${state}/transport.sqlite` },
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

function workerProgram(code, description) {
  return { tool_calls: [{ id: `code_${String(Math.random()).slice(2, 8)}`, name: "run_code", input: { description, code } }] };
}

function shellPrelude() {
  return 'const shell = typeof tools.pwsh === "function" ? tools.pwsh : tools.bash;';
}

const PARTIAL_PLAN = [
  "# Billing cutover — migration plan (partial)",
  "",
  "## Proposed approach",
  "",
  "Move the billing batch endpoint to a unary gRPC method. The batch payload is assumed to be well",
  "under the legacy 64 KiB gateway limit, so no streaming is needed.",
  "",
  "## Open items",
  "",
  "- gateway limits",
  "- rollout order",
  "",
].join("\n");

/** P1 worker: commit a REAL partial plan, then park without reporting (the host is killed). */
function partialWorkerTurns() {
  const code = [
    shellPrelude(),
    'await shell({ command: "New-Item -ItemType Directory -Force -Path deliverables | Out-Null", description: "prepare the deliverable directory" });',
    `await tools.write({ file_path: "deliverables/migration-plan.md", content: ${JSON.stringify(PARTIAL_PLAN)} });`,
    'return "written";',
  ].join("\n");
  const commit =
    'git add -A; git -c user.email=odpe@fixture.invalid -c "user.name=ODPE worker" commit -qm "write worker migration plan partial"';
  const park =
    'const shell = typeof tools.pwsh === "function" ? tools.pwsh : tools.bash;\n' +
    'const deadline = Date.now() + 100000;\n' +
    'while (Date.now() < deadline) {\n' +
    '  const r = await shell({ command: "Test-Path ../../release-worker", description: "check the release marker" });\n' +
    '  if (r.kind === "foreground" && /True/i.test(r.stdout.text)) return "released";\n' +
    '  await shell({ command: "Start-Sleep -Seconds 2", description: "wait for the release marker" });\n' +
    '}\n' +
    'return "still-parked";';
  return [
    workerProgram(code, "write the partial migration plan"),
    workerProgram(`${shellPrelude()}\nreturn await shell({ command: ${JSON.stringify(commit)}, description: "commit the partial plan" });`, "commit the partial plan"),
    workerProgram(park, "park after the commit (1/3)"),
    workerProgram(park, "park after the commit (2/3)"),
    workerProgram(park, "park after the commit (3/3)"),
    { text: "WORKER_PARKED" },
  ];
}

/**
 * P2 worker: PULL the measured input through the product's own context handle, write the plan FROM
 * THE PULLED BYTES, commit, and exit WITHOUT calling the result tool. The missing report is the
 * deterministic analogue of the R2/R4 missing settlement; the world is clean and observable.
 */
function measuredWorkerTurns() {
  const code = [
    shellPrelude(),
    "const measured = __INPUT_TEXT_JSON__;",
    'if (typeof measured !== "string" || measured.trim() === "") { throw new Error("the measured input did not arrive through the context pull"); }',
    'await shell({ command: "New-Item -ItemType Directory -Force -Path deliverables | Out-Null", description: "prepare the deliverable directory" });',
    'const plan = [',
    '  "# Billing cutover — migration plan",',
    '  "",',
    '  "## Current measured basis",',
    '  "",',
    "  measured.trim(),",
    '  "",',
    '  "## Decision",',
    '  "",',
    '  "Use client-streaming RPCs for the batch path. A unary call is not admissible at the measured payload size.",',
    '  "",',
    '  "## Modules in scope",',
    '  "",',
    '  "- orders: keep the existing REST facade; no payload change.",',
    '  "- billing: replace the batch REST endpoint with a streaming gRPC method; tests cover the measured sizes.",',
    '  "- gateway: enable streaming passthrough; the legacy assumption is not part of the new path.",',
    '  "",',
    '].join("\\n");',
    'await tools.write({ file_path: "deliverables/migration-plan.md", content: plan });',
    'return "written from the pulled input";',
  ].join("\n");
  const commit =
    'git add -A; git -c user.email=odpe@fixture.invalid -c "user.name=ODPE worker" commit -qm "commit the migration plan on the measured basis"';
  return [
    // Only `run_code` is directly callable in the worker environment; the pull tool is reached
    // through the program's `tools` bridge, which is the SAME governed execute a model would use.
    {
      tool_calls: [
        {
          id: "pull_measured",
          name: "run_code",
          input: {
            description: "pull the measured input through this attempt's context handle",
            code: `return await tools.palimpsest_worker_context_pull({ handle: "@ctx/input/${INPUT_PATH}" });`,
          },
        },
      ],
    },
    workerProgram(code, "write the plan from the pulled measured input"),
    workerProgram(`${shellPrelude()}\nreturn await shell({ command: ${JSON.stringify(commit)}, description: "commit the plan" });`, "commit the plan"),
    // A text-only turn ends the session WITHOUT `palimpsest_worker_result` — the host observes the
    // child exit but no settlement is attempted.
    { text: "WORKER_EXITED_WITHOUT_REPORT" },
  ];
}

function hostHold(path) {
  return {
    tool_calls: [
      {
        id: `hold_${String(Math.random()).slice(2, 8)}`,
        name: "pwsh",
        input: {
          command:
            `$deadline=(Get-Date).AddSeconds(100); while (-not (Test-Path ${path}) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 200 }`,
          description: "keep this principal host alive until the operator releases it",
        },
      },
    ],
  };
}

/** Wait for the new worker's commit, then let its process exit so the job is terminal. */
function waitForMeasuredCommit() {
  const command = [
    "$deadline=(Get-Date).AddSeconds(180)",
    "$found=$false",
    "while (-not $found -and (Get-Date) -lt $deadline) {",
    "  foreach ($w in Get-ChildItem -Directory '.palimpsest/worlds' -ErrorAction SilentlyContinue) {",
    "    $subject = (git -C $w.FullName log -1 --format=%s 2>$null)",
    "    if ($subject -like '*measured basis*') { $found=$true }",
    "  }",
    "  if (-not $found) { Start-Sleep -Milliseconds 300 }",
    "}",
    "Start-Sleep -Seconds 5",
    "Write-Output ('MEASURED_COMMIT=' + $found)",
  ].join("; ");
  return { tool_calls: [{ id: "p2_wait_commit", name: "pwsh", input: { command, description: "wait for the worker commit and observed process exit" } }] };
}

function scripts() {
  return {
    scripts: [
      // The measured worker is matched FIRST: its prompt carries the input handle, which the partial
      // worker's prompt does not.
      { match: `@ctx/input/${INPUT_PATH}`, turns: measuredWorkerTurns() },
      { match: "Your task: Produce the migration plan", turns: partialWorkerTurns() },
      {
        match: "ODPE_PRINCIPAL_P1",
        turns: [
          { tool_calls: [{ id: "p1_pulse", name: "palimpsest_continuity", input: { action: "pulse" } }] },
          { tool_calls: [{ id: "p1_delegate", name: "palimpsest_work", input: { action: "delegate", taskId: TASK } }] },
          hostHold(".palimpsest/release-host-p1"),
          hostHold(".palimpsest/release-host-p1"),
          hostHold(".palimpsest/release-host-p1"),
          { tool_calls: [{ id: "p1_workers", name: "palimpsest_work", input: { action: "workers" } }] },
          { text: "ODPE_P1_DONE" },
        ],
      },
      {
        match: "ODPE_PRINCIPAL_P2",
        turns: [
          { tool_calls: [{ id: "p2_pulse", name: "palimpsest_continuity", input: { action: "pulse" } }] },
          { tool_calls: [{ id: "p2_workers", name: "palimpsest_work", input: { action: "workers" } }] },
          {
            tool_calls: [
              {
                id: "p2_successor",
                name: "palimpsest_work",
                input: {
                  action: "relay",
                  taskId: TASK,
                  relayRoute: "successor",
                  acknowledgeInputs: true,
                  summary: "the killed worker's attempt is closed; the new attempt continues at the same basis",
                },
              },
            ],
          },
          { tool_calls: [{ id: "p2_delegate", name: "palimpsest_work", input: { action: "delegate", taskId: TASK } }] },
          waitForMeasuredCommit(),
          { tool_calls: [{ id: "p2_readiness", name: "palimpsest_work", input: { action: "readiness", taskId: TASK } }] },
          {
            tool_calls: [
              {
                id: "p2_finalize",
                name: "palimpsest_work",
                input: {
                  action: "finalize",
                  taskId: TASK,
                  expectedObservationDigest: "__OBSERVATION_DIGEST__",
                  acknowledgeInputs: true,
                  summary: "the measured worker left a clean committed candidate; settle it without a second model pass",
                },
              },
            ],
          },
          {
            tool_calls: [
              {
                id: "p2_conclude",
                name: "palimpsest_work",
                input: {
                  action: "conclude",
                  intent: "WAIT_FOR_OPERATOR",
                  statement:
                    "The new attempt received the measured payload fact through the context pull, the plan was committed on that basis, and the candidate awaits operator acceptance.",
                  waitingOn: "operator acceptance of the migration plan candidate",
                  artifacts: ["deliverables/migration-plan.md"],
                },
              },
            ],
          },
          hostHold(".palimpsest/release-host-p2"),
          hostHold(".palimpsest/release-host-p2"),
          hostHold(".palimpsest/release-host-p2"),
          { tool_calls: [{ id: "p2_workers_end", name: "palimpsest_work", input: { action: "workers" } }] },
          { text: "ODPE_P2_DONE" },
        ],
      },
      {
        match: "ODPE_PRINCIPAL_P3",
        turns: [
          { tool_calls: [{ id: "p3_pulse", name: "palimpsest_continuity", input: { action: "pulse" } }] },
          {
            tool_calls: [
              {
                id: "p3_conclude",
                name: "palimpsest_work",
                input: {
                  action: "conclude",
                  intent: "DELIVER",
                  statement:
                    "The operator accepted the migration plan; the measured payload basis and the streaming decision are in the canonical asset.",
                  artifacts: ["deliverables/migration-plan.md"],
                },
              },
            ],
          },
          { text: "ODPE_P3_DONE" },
        ],
      },
    ],
  };
}

reset(RUN);
mkdirSync(join(RUN, "out"), { recursive: true });
const head = seedWorld();
seedProject(head);
writeJson(join(RUN, "deployment.json"), deploymentProfile());
writeJson(join(RUN, "mock-scripts.json"), scripts());
writeJson(join(RUN, "seed.json"), {
  schema: "odpe-host-seed/v1",
  projectId: PROJECT,
  taskId: TASK,
  inputPath: INPUT_PATH,
  head,
  world: WORLD,
  state: STATE,
  note: "Deterministic ODPE host scenario (cross-domain software migration). The model content is a stand-in; host, workers, Git, context delivery, Work, settlement, episode and promotion are real.",
});
process.stdout.write(`${JSON.stringify({ run: RUN, head, project: PROJECT, task: TASK, inputPath: INPUT_PATH })}\n`);
