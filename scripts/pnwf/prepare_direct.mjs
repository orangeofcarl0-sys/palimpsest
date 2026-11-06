/**
 * PNWF direct-host preparation — a REAL DSH-host scenario with NO formal Task.
 *
 * The world starts at a committed baseline. The first principal only writes an uncommitted draft and
 * exits; the second principal reads it, commits the direct outcome, inspects the product's guidance,
 * and records a DELIVER conclusion; the third reads the pulse from a new session. No worker, no formal
 * attempt and no fixture-written final artifact: every byte reaches the repository through the
 * session's own native tools.
 *
 * Usage: node scripts/pnwf/prepare_direct.mjs --run=<dir> --repo=<repo> [--fixture=grpc]
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { installProduct } from "../../dist/src/product.js";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const RUN = resolve(String(args.get("run") ?? join(process.env.USERPROFILE ?? ".", "pnwf-direct")));
const REPO = resolve(String(args.get("repo") ?? process.cwd()));
const SEED = join(REPO, "fixtures", "psvr", "grpc-migration");
const WORLD = join(RUN, "world");
const STATE = join(RUN, "state");
const PROJECT = "pnwf-direct";
const HEAD = "0".repeat(40);

rmSync(WORLD, { recursive: true, force: true });
rmSync(STATE, { recursive: true, force: true });
mkdirSync(WORLD, { recursive: true });
mkdirSync(STATE, { recursive: true });
mkdirSync(join(RUN, "out"), { recursive: true });
mkdirSync(join(RUN, "prompts"), { recursive: true });

for (const entry of ["README.md", "TASK.md", "package.json", ".gitignore", "service", "test"]) {
  const source = join(SEED, entry);
  if (existsSync(source)) cpSync(source, join(WORLD, entry), { recursive: true });
}
mkdirSync(join(WORLD, "docs"), { recursive: true });
writeFileSync(join(WORLD, "docs", "result.md"), "# Result\n\nDirect outcome, in progress.\n");

const git = (argv) => execFileSync("git", ["-C", WORLD, ...argv], { encoding: "utf8" }).trim();
git(["init", "-q"]);
git(["add", "-A"]);
git(["-c", "user.email=pnwf@example.invalid", "-c", "user.name=PNWF", "commit", "-qm", "baseline: REST service"]);
const head = git(["rev-parse", "HEAD"]);

const standard = {
  statement: "The direct outcome is committed and the suite still runs.",
  clauses: [{ kind: "scope_respected" }],
  derivedFrom: ["PNWF direct-host fixture"],
  confirmed: true,
  notes: [],
};

const installed = installProduct(
  { tools: { register: () => () => undefined } },
  {
    projectId: PROJECT,
    repository: WORLD,
    stateDir: STATE,
    execution: "in-place",
    toolProfile: "normal",
    standard,
  },
);
const startTool = installed.tools.find((entry) => entry.name === "palimpsest_start");
const started = await startTool.execute(
  { projectId: PROJECT, goal: "Finish and deliver the existing direct work without inventing a formal task.", headCommit: head, tasks: [] },
  { callId: "pnwf-start", rootCallId: "pnwf-start", arguments: {}, name: "palimpsest_start", signal: new AbortController().signal },
);
await installed.dispose();

const windows = process.platform === "win32";
const pathOf = (path) => (windows ? path.replace(/\\/gu, "/") : path);
writeFileSync(
  join(RUN, "deployment.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      profileId: "pnwf-direct-host",
      projectId: PROJECT,
      localPeer: "local-operator",
      repository: pathOf(WORLD),
      execution: "in-place",
      concurrency: 1,
      toolProfile: "normal",
      policy: { allowed_commands: [{ executable: "node", argv_prefix: ["--test"] }] },
      standard: { statement: standard.statement },
      transport: { namespace: "pnwf-direct-host", databasePath: `${pathOf(STATE)}/transport.sqlite` },
      databases: {
        orchestration: `${pathOf(STATE)}/palimpsest.sqlite`,
        ordarium: `${pathOf(STATE)}/ordarium.sqlite`,
        coordination: `${pathOf(STATE)}/coordination.sqlite`,
        transportCursors: `${pathOf(STATE)}/transport-cursors.sqlite`,
        projectJournal: `${pathOf(STATE)}/journal.sqlite`,
        projectAssociations: `${pathOf(STATE)}/associations.sqlite`,
        management: `${pathOf(STATE)}/management.sqlite`,
      },
      reasoning: {},
    },
    null,
    2,
  )}\n`,
);

const prompts = {
  P0: [
    "PNWF_DIRECT_P0",
    "You are working in this repository. Write a short draft note at docs/draft.md describing the",
    "direct outcome, but do NOT commit it. Then stop.",
  ].join("\n"),
  P1: [
    "PNWF_DIRECT_P1",
    "This is a continuation after the previous session was interrupted. Read the existing draft at",
    "docs/draft.md, finish docs/result.md and the draft, commit them with Git, then inspect the",
    "project status and record the honest conclusion for the work you already committed. Do not",
    "create or delegate a formal task for work that is already done.",
  ].join("\n"),
  P2: [
    "PNWF_DIRECT_P2",
    "Read the project pulse. Report the previous episode's conclusion and the commit that the",
    "delivered artifact actually names. Do not edit anything.",
  ].join("\n"),
};
for (const [name, text] of Object.entries(prompts)) writeFileSync(join(RUN, "prompts", `${name}.txt`), `${text}\n`);

const script = {
  scripts: [
    {
      match: "PNWF_DIRECT_P0",
      turns: [
        {
          tool_calls: [
            {
              id: "p0-draft",
              name: "pwsh",
              input: {
                description: "write an uncommitted draft",
                command:
                  "Set-Content -Path docs/draft.md -Value \"# Draft`n`nThe direct outcome is nearly ready.`n\" -NoNewline; Get-Content docs/draft.md",
              },
            },
          ],
        },
        { text: "PNWF_DIRECT_P0_DONE" },
      ],
    },
    {
      match: "PNWF_DIRECT_P1",
      turns: [
        {
          tool_calls: [
            {
              id: "p1-read",
              name: "pwsh",
              input: { description: "read the existing draft", command: "Get-Content docs/draft.md" },
            },
          ],
        },
        {
          tool_calls: [
            {
              id: "p1-commit",
              name: "pwsh",
              input: {
                description: "finish the direct outcome and commit it",
                command:
                  "Set-Content -Path docs/result.md -Value \"# Result`n`nDirect outcome, finished in the second session.`n\" -NoNewline; " +
                  "Set-Content -Path docs/draft.md -Value \"# Draft`n`nFinished by the continuation; no formal task was created.`n\" -NoNewline; " +
                  "git add -A; git -c user.email=pnwf@example.invalid -c user.name=PNWF commit -m 'direct outcome from native work'; git log --oneline -2",
              },
            },
          ],
        },
        {
          tool_calls: [{ id: "p1-status", name: "palimpsest_work", input: { action: "status" } }],
        },
        {
          tool_calls: [
            {
              id: "p1-conclude",
              name: "palimpsest_work",
              input: {
                action: "conclude",
                intent: "DELIVER",
                statement:
                  "The direct outcome was finished and committed by the native Git path; no formal task or attempt was invented for it.",
                artifacts: ["docs/result.md", "docs/draft.md"],
              },
            },
          ],
        },
        { text: "PNWF_DIRECT_P1_DONE" },
      ],
    },
    {
      match: "PNWF_DIRECT_P2",
      turns: [
        { tool_calls: [{ id: "p2-pulse", name: "palimpsest_continuity", input: { action: "pulse" } }] },
        { text: "PNWF_DIRECT_P2_DONE" },
      ],
    },
  ],
};
writeFileSync(join(RUN, "mock-scripts.json"), `${JSON.stringify(script, null, 2)}\n`);
writeFileSync(
  join(RUN, "core.json"),
  `${JSON.stringify({ schema: "pnwf-direct-prep/v1", projectId: PROJECT, head, world: WORLD, state: STATE, started }, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify({ run: RUN, world: WORLD, head, projectId: PROJECT })}\n`);
