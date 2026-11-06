/**
 * PNWF-CQ-H — Direct → Governed host fixture.
 *
 * The world starts at B with a formal task. The first session commits a direct outcome C with native
 * Git and invents no Work. The second session asks the product to continue the formal task and then
 * records a CHECKPOINT. The product must show DIRECT_HEAD_AHEAD, refuse a worker on the stale basis,
 * and never advance the canonical head or fabricate a promotion.
 *
 * Usage: node scripts/pnwf/prepare_direct_governed.mjs --run=<dir> --repo=<repo>
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { installProduct, trustedDefaultPolicy } from "../../dist/src/product.js";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const RUN = resolve(String(args.get("run") ?? join(process.env.USERPROFILE ?? ".", "pnwf-direct-governed")));
const REPO = resolve(String(args.get("repo") ?? process.cwd()));
const SEED = join(REPO, "fixtures", "psvr", "grpc-migration");
const WORLD = join(RUN, "world");
const STATE = join(RUN, "state");
const PROJECT = "pnwf-direct-governed";

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
writeFileSync(join(WORLD, "docs", "result.md"), "# Result\n\nBase artifact.\n");

const git = (argv) => execFileSync("git", ["-C", WORLD, ...argv], { encoding: "utf8" }).trim();
git(["init", "-q"]);
git(["add", "-A"]);
git(["-c", "user.email=pnwf@example.invalid", "-c", "user.name=PNWF", "commit", "-qm", "baseline"]);
const head = git(["rev-parse", "HEAD"]);

const standard = {
  statement: "The governed continuation starts from the canonical basis and leaves its declared artifact.",
  clauses: [{ kind: "scope_respected" }],
  derivedFrom: ["PNWF-CQ direct-governed fixture"],
  confirmed: true,
  notes: [],
};

const installed = installProduct(
  { tools: { register: () => () => undefined } },
  {
    projectId: PROJECT,
    repository: WORLD,
    stateDir: STATE,
    execution: "worktree",
    toolProfile: "normal",
    standard,
    policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["--test"] }] }),
  },
);
await installed.tools
  .find((entry) => entry.name === "palimpsest_start")
  .execute(
    {
      projectId: PROJECT,
      goal: "A direct outcome exists; a governed continuation is requested.",
      headCommit: head,
      tasks: [
        {
          task_id: "governed-next",
          objective: "Continue from the direct outcome with a governed worker.",
          depends_on: [],
          write_paths: ["docs"],
          required_artifacts: ["docs/next.md"],
        },
      ],
    },
    { callId: "dg-start", rootCallId: "dg-start", arguments: {}, name: "palimpsest_start", signal: new AbortController().signal },
  );
await installed.dispose();

const pathOf = (path) => path.replace(/\\/gu, "/");
writeFileSync(
  join(RUN, "deployment.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      profileId: "pnwf-direct-governed-host",
      projectId: PROJECT,
      localPeer: "local-operator",
      repository: pathOf(WORLD),
      execution: "worktree",
      concurrency: 1,
      toolProfile: "normal",
      policy: { allowed_commands: [{ executable: "node", argv_prefix: ["--test"] }] },
      standard: { statement: standard.statement },
      transport: { namespace: "pnwf-direct-governed-host", databasePath: `${pathOf(STATE)}/transport.sqlite` },
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
    "PNWF_DG_P0",
    "You are working in this repository. Commit a direct outcome at docs/direct.md using native Git.",
    "Do not create or delegate a formal task. Then stop.",
  ].join("\n"),
  P1: [
    "PNWF_DG_P1",
    "Inspect the project status. Then try to continue the existing formal task with a governed worker.",
    "If the product refuses because the repository is ahead of the canonical basis, record a CHECKPOINT",
    "that states the operator must decide the basis transition. Do not advance the head and do not",
    "fabricate a worker result.",
  ].join("\n"),
  P2: [
    "PNWF_DG_P2",
    "Read the project pulse and status. Report the canonical head, the direct head relation and the",
    "previous conclusion. Do not edit anything.",
  ].join("\n"),
};
for (const [name, text] of Object.entries(prompts)) writeFileSync(join(RUN, "prompts", `${name}.txt`), `${text}\n`);

const script = {
  scripts: [
    {
      match: "PNWF_DG_P0",
      turns: [
        {
          tool_calls: [
            {
              id: "dg-direct",
              name: "pwsh",
              input: {
                description: "commit a direct outcome with native Git",
                command:
                  "Set-Content -Path docs/direct.md -Value \"# Direct outcome`n`nCommitted before any governed worker.`n\" -NoNewline; " +
                  "git add -A; git -c user.email=pnwf@example.invalid -c user.name=PNWF commit -m 'direct outcome'; git rev-parse HEAD",
              },
            },
          ],
        },
        { text: "PNWF_DG_P0_DONE" },
      ],
    },
    {
      match: "PNWF_DG_P1",
      turns: [
        { tool_calls: [{ id: "dg-status", name: "palimpsest_work", input: { action: "status" } }] },
        {
          tool_calls: [
            {
              id: "dg-delegate",
              name: "palimpsest_work",
              input: { action: "delegate", taskId: "governed-next" },
            },
          ],
        },
        {
          tool_calls: [
            {
              id: "dg-checkpoint",
              name: "palimpsest_work",
              input: {
                action: "conclude",
                intent: "CHECKPOINT",
                statement:
                  "A direct commit is ahead of the canonical ProjectIR head. The product refused to start the governed worker on the stale basis, so the operator must decide how the direct outcome becomes a governed basis.",
                nextStep: "operator basis-transition decision",
              },
            },
          ],
        },
        { text: "PNWF_DG_P1_DONE" },
      ],
    },
    {
      match: "PNWF_DG_P2",
      turns: [
        {
          tool_calls: [
            { id: "dg-pulse", name: "palimpsest_continuity", input: { action: "pulse" } },
            { id: "dg-status-2", name: "palimpsest_work", input: { action: "status" } },
          ],
        },
        { text: "PNWF_DG_P2_DONE" },
      ],
    },
  ],
};
writeFileSync(join(RUN, "mock-scripts.json"), `${JSON.stringify(script, null, 2)}\n`);
writeFileSync(
  join(RUN, "core.json"),
  `${JSON.stringify({ schema: "pnwf-direct-governed-prep/v1", projectId: PROJECT, head, world: WORLD, state: STATE }, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify({ run: RUN, world: WORLD, head, projectId: PROJECT })}\n`);
