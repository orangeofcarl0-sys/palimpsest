/**
 * PNWF continuation scorer — MECHANICAL facts from the streams, the state database and Git.
 *
 * It does not look for a string the prompt told the model to say. It answers:
 *   · how many `complete` calls, `conclude` calls and typed plan revisions actually occurred;
 *   · whether an episode conclusion was RECORDED;
 *   · whether the canonical artifact commit moved and whether any promotion was fabricated;
 *   · the ledger tokens and the session exit, against the historical A-2 closure.
 *
 * Usage: node scripts/pnwf/score_continuation.mjs --run=<dir> --cohort=<cohort.json>
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const RUN = resolve(String(args.get("run") ?? ""));
const COHORT_PATH = resolve(String(args.get("cohort") ?? ""));
if (RUN === "" || COHORT_PATH === "") {
  process.stderr.write("--run and --cohort are required\n");
  process.exit(2);
}
const cohort = JSON.parse(readFileSync(COHORT_PATH, "utf8"));
const REPO = process.cwd();
const ATTR = join(REPO, "scripts", "psvr", "session_attribution.mjs");

function git(cwd, argv) {
  try {
    return execFileSync("git", ["-C", cwd, ...argv], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).trim();
  } catch {
    return null;
  }
}
function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function streams(home) {
  const dir = join(home, "sessions");
  if (!existsSync(dir)) return [];
  const found = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name.endsWith(".zstd")) found.push(path);
    }
  };
  walk(dir);
  return found;
}

function attribute(stream, prefix) {
  try {
    execFileSync(process.execPath, [ATTR, stream, prefix], { encoding: "utf8", timeout: 120_000 });
    return readJson(`${prefix}.timeline.json`);
  } catch {
    return null;
  }
}

function journalIntent(stateDir) {
  const path = join(stateDir, "journal.sqlite");
  if (!existsSync(path)) return { intent: null, typedRetire: false, conclusion: null };
  const db = new DatabaseSync(path);
  const rows = db.prepare("SELECT seq, type, payload_json FROM project_journal_events ORDER BY seq").all();
  let intent = null;
  let conclusion = null;
  for (const row of rows) {
    let payload = null;
    try {
      payload = JSON.parse(String(row.payload_json ?? ""));
    } catch {
      payload = null;
    }
    const body = String(payload?.entry?.body ?? "");
    const title = String(payload?.entry?.title ?? "");
    const match =
      /"intent"\s*:\s*"(DELIVER|CHECKPOINT|WAIT_FOR_OPERATOR|WAIT_FOR_EXTERNAL_EVENT|REPLAN|CONTINUE)"/u.exec(body) ??
      /Episode conclusion:\s*(DELIVER|CHECKPOINT|WAIT_FOR_OPERATOR|WAIT_FOR_EXTERNAL_EVENT|REPLAN|CONTINUE)/u.exec(title);
    if (match !== null) {
      intent = match[1];
      conclusion = { seq: row.seq, type: row.type, intent };
    }
  }
  return { intent, typedRetire: false, conclusion };
}

const stages = [];
for (const stage of cohort.stages) {
  const home = join(RUN, `home-${stage.id}`);
  const world = join(RUN, "stages", stage.id, "world");
  const stateDir = join(RUN, "stages", stage.id, "state");
  const outDir = join(RUN, "out", stage.id);
  const run = readJson(join(outDir, "run.json")) ?? {};
  const budget = readJson(join(outDir, "budget.json")) ?? {};
  const snapshot = readJson(join(outDir, "snapshot.json")) ?? {};
  const streamFiles = streams(home);
  const prefixDir = join(RUN, "out", "attribution");
  mkdirSync(prefixDir, { recursive: true });
  const attributions = streamFiles.map((file, index) => ({ file, timeline: attribute(file, join(prefixDir, `${stage.id}-${index}`)) }));
  const principal =
    attributions.find((entry) => {
      const cwd = String(entry.timeline?.summary?.session?.cwd ?? "").replaceAll("\\", "/").toLowerCase();
      return cwd === world.replaceAll("\\", "/").toLowerCase();
    }) ?? attributions.sort((a, b) => (b.timeline?.rows?.length ?? 0) - (a.timeline?.rows?.length ?? 0))[0] ?? null;

  const byKind = principal?.timeline?.summary?.byKind ?? {};
  const calls = principal?.timeline?.summary?.calls ?? [];
  const completeCalls = Number(byKind["work:complete"] ?? 0);
  const concludeCalls = Number(byKind["work:conclude"] ?? 0);
  const readinessCalls = Number(byKind["work:readiness"] ?? 0);
  const finalizeCalls = Number(byKind["work:finalize"] ?? 0);
  const relayCalls = Number(byKind["work:relay"] ?? 0);
  const stopCalls = Number(byKind["work:stop"] ?? 0);
  const planCalls = Number(byKind["work:plan"] ?? 0);
  const typedPlanCalls = calls.filter((call) => call.kind === "work:plan" && call.args?.changeClass !== undefined).length;
  const errors = Number(principal?.timeline?.summary?.counts?.toolErrors ?? 0);

  const state = { tasks: [], attempts: [], promotions: 0, projectRevised: 0, promotionCommitted: 0 };
  try {
    const db = new DatabaseSync(join(stateDir, "palimpsest.sqlite"));
    state.tasks = db.prepare("SELECT task_id, state FROM tasks ORDER BY task_id").all().map((row) => ({ taskId: String(row.task_id), state: String(row.state) }));
    state.attempts = db.prepare("SELECT attempt_id, task_id, state FROM attempts ORDER BY last_event_id").all().map((row) => ({ attemptId: String(row.attempt_id), taskId: row.task_id === null ? null : String(row.task_id), state: String(row.state) }));
    state.promotions = Number(db.prepare("SELECT COUNT(*) AS n FROM promotions").get().n);
    state.projectRevised = Number(db.prepare("SELECT COUNT(*) AS n FROM events WHERE event_type='PROJECT_REVISED'").get().n);
    state.promotionCommitted = Number(db.prepare("SELECT COUNT(*) AS n FROM events WHERE event_type='PROMOTION_COMMITTED'").get().n);
  } catch {
    /* absent state */
  }
  const journal = journalIntent(stateDir);
  const head = git(world, ["rev-parse", "HEAD"]);
  const status = git(world, ["status", "--porcelain"]);
  const totalTokens = Number(run.usage?.totalTokens ?? budget.totalTokens ?? 0);
  const natural = run.natural === true;
  const stopped = run.stopped === true;
  const historical = stage.historical;

  const conclusionOrRetirement = journal.intent !== null || state.projectRevised > 0;
  const noRepeatedComplete = completeCalls <= 1;
  const noPromotion = state.promotions === 0 && state.promotionCommitted === 0;
  const headUnchanged = head === stage.artifactCommit;
  const tokensBelow = totalTokens > 0 && totalTokens < historical.closureTokens;
  const facts = {
    completeAtMostOnce: noRepeatedComplete,
    conclusionOrRetirement,
    noPromotion,
    headUnchanged,
    tokensBelowHistoricalClosure: tokensBelow,
    sessionEnded: natural || conclusionOrRetirement,
  };
  const score = Object.values(facts).filter(Boolean).length;
  const primary =
    facts.completeAtMostOnce &&
    facts.conclusionOrRetirement &&
    facts.noPromotion &&
    facts.headUnchanged &&
    totalTokens > 0;
  stages.push({
    stage: stage.id,
    sessionId: stage.id,
    historical,
    tokens: { total: totalTokens, max: budget.maxTokens ?? null, reserve: budget.reserveTokens ?? null, softStopAt: budget.softCeiling ?? null },
    exit: { natural, stopped, killedBy: run.killedBy ?? null, exitCode: run.exitCode ?? null },
    calls: {
      complete: completeCalls,
      conclude: concludeCalls,
      readiness: readinessCalls,
      finalize: finalizeCalls,
      relay: relayCalls,
      stop: stopCalls,
      plan: planCalls,
      typedPlan: typedPlanCalls,
      toolErrors: errors,
      total: principal?.timeline?.summary?.counts?.toolCalls ?? 0,
    },
    state: {
      tasks: state.tasks,
      attempts: state.attempts,
      promotions: state.promotions,
      promotionCommitted: state.promotionCommitted,
      projectRevised: state.projectRevised,
      episodeIntent: journal.intent,
      conclusion: journal.conclusion,
      head,
      status,
    },
    facts,
    score,
    primary,
    stream: principal?.file ?? null,
  });
}

const payload = {
  schema: "pnwf-continuation-score/v1",
  cohortId: cohort.cohortId,
  scoredAt: new Date().toISOString(),
  stages,
  comparison: {
    primaryPassed: stages.filter((stage) => stage.primary).length,
    stages: stages.length,
    completeCalls: Object.fromEntries(stages.map((stage) => [stage.stage, stage.calls.complete])),
    concludeCalls: Object.fromEntries(stages.map((stage) => [stage.stage, stage.calls.conclude])),
    tokens: Object.fromEntries(stages.map((stage) => [stage.stage, stage.tokens.total])),
    historicalClosure: Object.fromEntries(stages.map((stage) => [stage.stage, stage.historical.closureTokens])),
    note:
      "The score is descriptive and mechanical; it does not turn a CHECKPOINT into project completion, acceptance or promotion. The historical sessions are the PSVR-C A-2 closures on the same states.",
  },
};
mkdirSync(join(RUN, "out"), { recursive: true });
writeFileSync(join(RUN, "out", "score.json"), `${JSON.stringify(payload, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
