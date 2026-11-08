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
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ExecutionBudget, USAGE_ONLY_SCHEMA, tokens } from "./execution_budget.mjs";
import { DEEPSEEK_MESSAGES, DEEPSEEK_MODEL, PAID_COHORT_SCHEMA, PAID_MODE } from "./bounded_provider.mjs";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const RUN = resolve(String(args.get("run") ?? join(process.env.USERPROFILE ?? ".", "pnwf-continuation")));
const REPO = resolve(String(args.get("repo") ?? process.cwd()));
const PAID = args.get("mode") === PAID_MODE;
const COHORT = PAID ? args.get("cohort-id") : "pnwf-continuation-2026-11";
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

const selection = args.get("session");
let maxRequests, wallClockMs;
if (PAID) {
  if (!args.get("run") || !/^[\w.-]+$/u.test(COHORT ?? "") || !Object.hasOwn(BASES, selection)) throw new Error("PAID_PREPARATION_REQUIRES_NEW_RUN_COHORT_AND_SESSION");
  maxRequests = tokens(Number(args.get("max-requests") ?? 64), "max requests", false);
  wallClockMs = tokens(Number(args.get("wall-clock-ms") ?? 1800000), "wall clock ms", false);
  if (wallClockMs > 3600000) throw new Error("INVALID_PAID_SESSION_WINDOW");
  mkdirSync(RUN); // No reinitialization of a partially observed or previously run trial.
} else mkdirSync(RUN, { recursive: true });
mkdirSync(join(RUN, "prompts"), { recursive: true });
mkdirSync(join(RUN, "out"), { recursive: true });
const sessions = [];
for (const [stage, input] of PAID ? [[selection, BASES[selection]]] : Object.entries(BASES)) {
  const root = join(RUN, "stages", stage);
  const world = join(root, "world");
  const state = join(root, "state");
  if (existsSync(root)) throw new Error(`${stage}: preparation requires a fresh run directory; existing state must not be overwritten`);
  mkdirSync(root, { recursive: true });
  cpSync(join(input.source, "worlds", "A"), world, { recursive: true });
  cpSync(join(input.source, "state-A"), state, { recursive: true });
  /**
   * PNWF-CQ-F: an attempt world borrows the canonical object store through an ABSOLUTE alternates
   * path (`C:/.../worlds/A/.git/objects`). A copied world mounted in a Linux container would point at
   * a host path that does not exist, so Git operations on the attempt world fail and a model can
   * mistake that for work. Rewrite every attempt world's alternates to the COPIED canonical objects.
   */
  const copiedObjects = "../../../../../.git/objects";
  const worldsDir = join(world, ".palimpsest", "worlds");
  if (existsSync(worldsDir)) {
    for (const entry of readdirSync(worldsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const alternates = join(worldsDir, entry.name, ".git", "objects", "info", "alternates");
      if (existsSync(alternates)) writeFileSync(alternates, `${copiedObjects}\n`);
    }
  }
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
    expectedHead: head,
    state,
    home: join(RUN, `home-${stage}`),
    promptPath,
    out: join(RUN, "out", stage),
    maxTokens: PAID ? null : 2_500_000,
    reserveTokens: PAID ? null : 125_000,
    injectAtMs: null,
    killAfterMs: PAID ? wallClockMs : 3_600_000,
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
      mode: PAID ? "PNWF_PAID_USAGE_ONLY" : "PNWF_REAL_MODEL",
      sessions,
      budget: PAID ? null : { perSession: 2_500_000, reserve: 125_000, aggregate: 5_000_000, sessions: 2 },
      note: "Recorded-state continuation; the prompt is the exact PSVR-C A2 text; no injection and no evaluator material.",
    },
    null,
    2,
  )}\n`,
);
if (PAID) {
  const reference = JSON.parse(readFileSync(join(REPO, "research-evidence/pnwf-cq/live/2026-11-07/cohort.json"), "utf8"));
  const stage = reference.stages.find(s => s.id === selection);
  writeFileSync(join(RUN, "cohort.json"), JSON.stringify({ schema: PAID_COHORT_SCHEMA, cohortId: COHORT,
    billingCeiling: null, maxRequests, wallClockMs, model: DEEPSEEK_MODEL, providerUpstream: DEEPSEEK_MESSAGES,
    stages: [{ id: selection, artifactCommit: stage.artifactCommit, historical: stage.historical }] }, null, 2) + "\n");
  ExecutionBudget.initialize(join(RUN, "request-usage.sqlite"), { schema: USAGE_ONLY_SCHEMA, cohortId: COHORT, aggregateCeiling: null,
    sessions: [{ id: selection, ceiling: null, softCeiling: null, maxRequests }] }).close();
}
process.stdout.write(`${JSON.stringify({ run: RUN, sessions: sessions.map((session) => session.id) })}\n`);
