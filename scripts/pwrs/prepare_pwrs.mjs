/**
 * PWRS deterministic real-host preparation.
 *
 * Test-owned setup for the Windows DSH host: one Git world, one seeded project, one worktree
 * deployment profile and the deterministic Messages scripts. The host, worker processes, SQLite
 * state, Git effects and Palimpsest product calls are real; the model content is a labelled stand-in.
 *
 * The scenario is the ALHS diagnostic's G case, made explicit:
 *   P1  a real worker commits a partial package and parks (it never reports);
 *   KILL the host tree — the worker dies with it, leaving a RUNNING attempt and a retained world;
 *   NEW REALITY a measured corridor constraint appears in .palimpsest/inputs/;
 *   P2  a NEW principal inspects the retained world, reuses the still-valid vendor pricing, recomputes
 *       the invalid assumption, commits the synthesis IN the world, declares the takeover, and
 *       concludes WAIT_FOR_OPERATOR;
 *   OPERATOR promotes the candidate through the existing path;
 *   P3  a later session records DELIVER over the canonical asset.
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
const RUN = resolve(String(args.get("run") ?? join(process.env.HOME ?? ".", "pwrs-run")));
const WORLD = join(RUN, "world");
const STATE = join(RUN, "state");
const PROJECT = "pwrs";

const STANDARD = {
  statement:
    "Stay inside the declared write scope, leave the required artifact, and do not treat an unverified source claim as accepted.",
  clauses: [{ kind: "scope_respected" }],
  derivedFrom: ["PWRS deterministic host scenario"],
  confirmed: true,
  notes: [],
};

function git(cwd, argv, env = {}) {
  return execFileSync("git", ["-c", "user.email=pwrs@fixture.invalid", "-c", "user.name=PWRS fixture", ...argv], {
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
      "Produce `deliverables/package.md`: a reviewable package for sites A and B that states the current",
      "measured basis, the vendor pricing it relies on, and the assumptions it does not rely on.",
      "",
      "Sources are under `sources/`. New measured updates appear under `.palimpsest/inputs/`.",
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
  write("README.md", "# PWRS multi-site deployment\n\nSources under sources/, deliverables under deliverables/.\n");
  // The product's own state root is not project content; keeping it ignored makes the canonical
  // tree's cleanliness a real fact rather than an artifact of the fixture.
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
      "Produce a defensible deployment package for sites A and B. A measured constraint supersedes an assumption, and an unfinished worker's work may be continued rather than redone.",
    headCommit: head,
    requirements: [
      {
        requirement_id: "R1",
        statement: "The package states the measured corridor basis and does not rely on the superseded assumption.",
        priority: "critical",
        acceptance_refs: [],
      },
    ],
    tasks: [
      {
        task_id: "package",
        objective:
          "Write the package deliverable from the supplied sources, commit it, and report when done.",
        depends_on: [],
        write_paths: ["deliverables"],
        required_artifacts: ["deliverables/package.md"],
      },
    ],
  });
  return head;
}

function deploymentProfile() {
  const windows = process.platform === "win32";
  const repository = windows ? WORLD.replace(/\\/gu, "/") : "/run/pwrs/world";
  const state = windows ? STATE.replace(/\\/gu, "/") : "/run/pwrs/state";
  return {
    schemaVersion: 1,
    profileId: "pwrs-host",
    projectId: PROJECT,
    localPeer: "local-operator",
    repository,
    execution: "worktree",
    concurrency: 1,
    toolProfile: "normal",
    policy: { allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] },
    standard: { statement: STANDARD.statement },
    transport: { namespace: "pwrs-host", databasePath: `${state}/transport.sqlite` },
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
  'return await tools.palimpsest_worker_result({ kind: "READY_FOR_SETTLEMENT", summary: "wrote and committed the package deliverable" });';

function workerProgram(code, description) {
  return { tool_calls: [{ id: `code_${String(Math.random()).slice(2, 8)}`, name: "run_code", input: { description, code } }] };
}

function shellPrelude() {
  return 'const shell = typeof tools.pwsh === "function" ? tools.pwsh : tools.bash;';
}

const PARTIAL = [
  "# Vendor pricing (worker-produced)",
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

/** The worker commits a REAL partial package, then parks without reporting (the host is killed). */
function workerTurns() {
  const code = [
    shellPrelude(),
    'await shell({ command: "New-Item -ItemType Directory -Force -Path deliverables | Out-Null", description: "prepare the deliverable directory" });',
    `await tools.write({ file_path: "deliverables/partial.md", content: ${JSON.stringify(PARTIAL)} });`,
    'return "written";',
  ].join("\n");
  const commit =
    'git add -A; git -c user.email=pwrs@fixture.invalid -c "user.name=PWRS worker" commit -qm "write worker pricing partial"';
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
    workerProgram(code, "write the partial package"),
    workerProgram(`${shellPrelude()}\nreturn await shell({ command: ${JSON.stringify(commit)}, description: "commit the partial package" });`, "commit the partial package"),
    workerProgram(park, "park after the commit (1/3)"),
    workerProgram(park, "park after the commit (2/3)"),
    workerProgram(park, "park after the commit (3/3)"),
    workerProgram(RESULT_PROGRAM, "report the worker outcome"),
    { text: "WORKER_DONE" },
  ];
}

/** P2: inspect the retained world by its own path, reuse the valid pricing, recompute the invalid assumption. */
function synthesisTurns() {
  /**
   * A PRINCIPAL session has no PTC (`run_code`) — only the real shell. The synthesis is therefore a
   * real shell action: locate the retained world, READ the worker's bytes, compose the package from
   * that text plus the measured constraint, write it into the SAME world and commit it there.
   */
  const command = [
    "$ErrorActionPreference='Stop'",
    "$worlds = Get-ChildItem -Directory '.palimpsest/worlds' | Select-Object -ExpandProperty FullName",
    "$world = $null",
    "foreach ($w in $worlds) { if (Test-Path -LiteralPath ($w + '/deliverables/partial.md')) { $world = $w; break } }",
    "if ($null -eq $world) { Write-Output 'NO_RETAINED_WORLD'; exit 3 }",
    "$partial = Get-Content -Raw -LiteralPath ($world + '/deliverables/partial.md')",
    "$measured = Get-Content -Raw -LiteralPath 'sources/measured-corridor.md'",
    "$pricing = ($partial -split '## Assumptions')[0].Trim()",
    "$content = \"# Deployment package (synthesized)`n`n\" + $pricing + \"`n`n## Current measured basis`n`n\" + $measured.Trim() + \"`n`n## Reuse note`n`nThe vendor pricing above is inherited from the retained worker commit; the baseline corridor assumption is NOT carried forward.`n\"",
    "Set-Content -LiteralPath ($world + '/deliverables/package.md') -Value $content -Encoding utf8",
    "git -C $world add -A",
    "git -C $world -c user.email=pwrs@fixture.invalid -c 'user.name=PWRS principal' commit -qm 'principal synthesis from retained worker work'",
    "Write-Output ('WORLD=' + $world)",
    "git -C $world rev-parse HEAD",
  ].join("; ");
  return [{ tool_calls: [{ id: "p2_synthesize", name: "pwsh", input: { command, description: "reuse the retained pricing and recompute the measured basis" } }] }];
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

function scripts() {
  return {
    scripts: [
      { match: "Your task: Write the package deliverable", turns: workerTurns() },
      {
        match: "PWRS_PRINCIPAL_P1",
        turns: [
          { tool_calls: [{ id: "p1_pulse", name: "palimpsest_continuity", input: { action: "pulse" } }] },
          { tool_calls: [{ id: "p1_delegate", name: "palimpsest_work", input: { action: "delegate", taskId: "package" } }] },
          hostHold(".palimpsest/release-host-p1"),
          hostHold(".palimpsest/release-host-p1"),
          hostHold(".palimpsest/release-host-p1"),
          { tool_calls: [{ id: "p1_workers", name: "palimpsest_work", input: { action: "workers" } }] },
          { text: "PWRS_P1_DONE" },
        ],
      },
      {
        match: "PWRS_PRINCIPAL_P2",
        turns: [
          { tool_calls: [{ id: "p2_pulse", name: "palimpsest_continuity", input: { action: "pulse" } }] },
          { tool_calls: [{ id: "p2_workers", name: "palimpsest_work", input: { action: "workers" } }] },
          ...synthesisTurns(),
          {
            tool_calls: [
              {
                id: "p2_relay",
                name: "palimpsest_work",
                input: {
                  action: "relay",
                  taskId: "package",
                  relayRoute: "takeover",
                  declareExecutorAbandoned: true,
                  acknowledgeInputs: true,
                  summary: "the killed worker's world was continued by the principal under the measured basis",
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
                    "The killed worker's retained pricing was reused, the superseded corridor assumption was recomputed on the measured basis, and the synthesized candidate awaits operator acceptance.",
                  waitingOn: "operator acceptance of the synthesized package candidate",
                  artifacts: ["deliverables/package.md"],
                },
              },
            ],
          },
          hostHold(".palimpsest/release-host-p2"),
          hostHold(".palimpsest/release-host-p2"),
          hostHold(".palimpsest/release-host-p2"),
          { tool_calls: [{ id: "p2_workers_end", name: "palimpsest_work", input: { action: "workers" } }] },
          { text: "PWRS_P2_DONE" },
        ],
      },
      {
        match: "PWRS_PRINCIPAL_P3",
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
                    "The operator accepted the synthesized package; the measured basis and the reused vendor pricing are in the canonical asset.",
                  artifacts: ["deliverables/package.md"],
                },
              },
            ],
          },
          { text: "PWRS_P3_DONE" },
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
  schema: "pwrs-host-seed/v1",
  projectId: PROJECT,
  head,
  world: WORLD,
  state: STATE,
  note: "Deterministic PWRS host scenario. The model content is a stand-in; host, workers, Git, Work, relay, journal and promotion are real.",
});
process.stdout.write(`${JSON.stringify({ run: RUN, head, project: PROJECT })}\n`);
