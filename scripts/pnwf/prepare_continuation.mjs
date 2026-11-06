/**
 * PNWF continuation preparation — copy the recorded PSVR-C post-kill states and build the two
 * continuation sessions. Nothing in the original run directory is modified.
 *
 * The state already contains the direct outcome (software 453aa7f, energy e631160), an ACTIVE formal
 * task and a RUNNING attempt with no worker. The prompt is the EXACT PSVR-C A2 continuation prompt;
 * it does not mention CHECKPOINT, conclude, plan or the expected exit.
 *
 * Usage: node scripts/pnwf/prepare_continuation.mjs --run=<dir> --repo=<repo>
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const RUN = resolve(String(args.get("run") ?? join(process.env.USERPROFILE ?? ".", "pnwf-continuation")));
const REPO = resolve(String(args.get("repo") ?? process.cwd()));
const COHORT = "pnwf-continuation-2026-11";
const BASES = {
  software: {
    source: "C:/Users/66494/AppData/Local/Temp/psvr-c-real/run-2026-11-05",
    projectId: "psvr-c",
    deployment: "C:/Users/66494/AppData/Local/Temp/psvr-c-real/run-2026-11-05/deployments/A.json",
    prompt: join(REPO, "research-evidence/psvr/2026-11-05/c/prompts/A2.txt"),
    artifact: "453aa7f005edb7612cf4edc1d8ec3b68efed5b4d",
  },
  energy: {
    source: "C:/Users/66494/AppData/Local/Temp/psvr-e-real/run-2026-11-05",
    projectId: "psvr-c-energy",
    deployment: "C:/Users/66494/AppData/Local/Temp/psvr-e-real/run-2026-11-05/deployments/A.json",
    prompt: join(REPO, "research-evidence/psvr/2026-11-05/c-energy/prompts/A2.txt"),
    artifact: "e631160f03d40709a9f9b67746ecd8e7708c2f81",
  },
};
const windows = process.platform === "win32";
const pathOf = (path) => (windows ? path.replace(/\\/gu, "/") : path);
const git = (cwd, argv) => execFileSync("git", ["-C", cwd, ...argv], { encoding: "utf8" }).trim();

mkdirSync(RUN, { recursive: true });
mkdirSync(join(RUN, "prompts"), { recursive: true });
mkdirSync(join(RUN, "out"), { recursive: true });
const sessions = [];
for (const [stage, input] of Object.entries(BASES)) {
  const root = join(RUN, "stages", stage);
  const world = join(root, "world");
  const state = join(root, "state");
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  cpSync(join(input.source, "worlds", "A"), world, { recursive: true });
  cpSync(join(input.source, "state-A"), state, { recursive: true });
  const head = git(world, ["rev-parse", "HEAD"]);
  if (head !== input.artifact) throw new Error(`${stage}: copied world HEAD ${head} is not the recorded artifact ${input.artifact}`);
  if (!existsSync(join(world, ".palimpsest", "worlds"))) throw new Error(`${stage}: the copied world has no attempt worlds`);

  const original = JSON.parse(readFileSync(input.deployment, "utf8"));
  const deployment = {
    schemaVersion: 1,
    profileId: `pnwf-cont-${stage}`,
    projectId: input.projectId,
    localPeer: "local-operator",
    repository: pathOf(world),
    execution: "worktree",
    concurrency: 2,
    toolProfile: "normal",
    policy: original.policy,
    standard: original.standard,
    transport: { namespace: `pnwf-cont-${stage}`, databasePath: `${pathOf(state)}/transport.sqlite` },
    databases: {
      orchestration: `${pathOf(state)}/palimpsest.sqlite`,
      ordarium: `${pathOf(state)}/ordarium.sqlite`,
      coordination: `${pathOf(state)}/coordination.sqlite`,
      transportCursors: `${pathOf(state)}/transport-cursors.sqlite`,
      projectJournal: `${pathOf(state)}/journal.sqlite`,
      projectAssociations: `${pathOf(state)}/associations.sqlite`,
      management: `${pathOf(state)}/management.sqlite`,
    },
    reasoning: {},
  };
  writeFileSync(join(root, "deployment.json"), `${JSON.stringify(deployment, null, 2)}\n`);

  const promptPath = join(RUN, "prompts", `${stage}.txt`);
  writeFileSync(promptPath, readFileSync(input.prompt, "utf8"));
  sessions.push({
    id: stage,
    condition: "PNWF_FULL",
    stage,
    world,
    state,
    home: join(RUN, `home-${stage}`),
    promptPath,
    out: join(RUN, "out", stage),
    maxTokens: 2_500_000,
    reserveTokens: 125_000,
    injectAtMs: null,
    killAfterMs: 3_600_000,
    injectionRel: null,
    deployment: join(root, "deployment.json"),
  });
  process.stdout.write(`${stage}: HEAD ${head.slice(0, 12)}, state copied\n`);
}

writeFileSync(
  join(RUN, "core.json"),
  `${JSON.stringify(
    {
      schema: "pnwf-continuation-prep/v1",
      cohortId: COHORT,
      stage: "pnwf-continuation",
      mode: "PNWF_REAL_MODEL",
      sessions,
      budget: { perSession: 2_500_000, reserve: 125_000, aggregate: 5_000_000, sessions: 2 },
      note: "Two recorded-state continuations; the prompt is the exact PSVR-C A2 text; no injection and no evaluator material.",
    },
    null,
    2,
  )}\n`,
);
process.stdout.write(`${JSON.stringify({ run: RUN, sessions: sessions.map((session) => session.id) })}\n`);
