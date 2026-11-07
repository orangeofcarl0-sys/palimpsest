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
import { join, resolve, dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { zstdDecompressSync } from "node:zlib";
import { PAID_COHORT_SCHEMA } from "./bounded_provider.mjs";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const RUN = resolve(String(args.get("run") ?? ""));
const COHORT_PATH = resolve(String(args.get("cohort") ?? ""));
const OUT_PATH = resolve(String(args.get("out") ?? join(RUN, "out", "score.json")));
if (RUN === "" || COHORT_PATH === "") {
  process.stderr.write("--run and --cohort are required\n");
  process.exit(2);
}
const cohort = JSON.parse(readFileSync(COHORT_PATH, "utf8"));
const metered = cohort.schema === PAID_COHORT_SCHEMA;
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

/**
 * The budget ledger is a SAMPLE; the stream is the provider's per-step usage. The PSVR-C F-2
 * reconciliation showed the last step can arrive after the ledger's observedAt. Prefer the stream sum
 * and fall back to the ledger only when the stream is unreadable.
 *
 * PNWF-CQ-G §9.3: an unreadable stream is NOT a trustworthy zero. The caller must see the status and
 * the breakdown (cache read, fresh input, output), not just one total.
 */
function streamUsage(file) {
  const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
  try {
    const bytes = readFileSync(file);
    const starts = [];
    for (let i = 0; i + 3 < bytes.length; i += 1) {
      if (bytes[i] === MAGIC[0] && bytes[i + 1] === MAGIC[1] && bytes[i + 2] === MAGIC[2] && bytes[i + 3] === MAGIC[3]) starts.push(i);
    }
    let total = 0;
    let input = 0;
    let output = 0;
    let cacheRead = 0;
    let cacheWrite = 0;
    let steps = 0;
    for (let k = 0; k < starts.length; k += 1) {
      const end = k + 1 < starts.length ? starts[k + 1] : bytes.length;
      for (const line of zstdDecompressSync(bytes.subarray(starts[k], end)).toString("utf8").split("\n")) {
        if (line === "") continue;
        const event = JSON.parse(line);
        if (event.type === "assistant/message" && event.data?.usage) {
          steps += 1;
          total += Number(event.data.usage.totalTokens ?? 0);
          input += Number(event.data.usage.inputTokens ?? 0);
          output += Number(event.data.usage.outputTokens ?? 0);
          cacheRead += Number(event.data.usage.cacheReadTokens ?? 0);
          cacheWrite += Number(event.data.usage.cacheWriteTokens ?? 0);
        }
      }
    }
    return steps === 0
      ? { status: "UNREADABLE", steps, total: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      : { status: "READ", steps, total, input, output, cacheRead, cacheWrite };
  } catch {
    return { status: "UNREADABLE", steps: 0, total: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  }
}

function journalIntent(stateDir) {
  const path = join(stateDir, "journal.sqlite");
  if (!existsSync(path)) return { intent: null, typedRetire: false, conclusion: null };
  const db = new DatabaseSync(path, { readOnly: true });
  let rows;
  try { rows = db.prepare("SELECT seq, type, payload_json FROM project_journal_events ORDER BY seq").all(); }
  finally { db.close(); }
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
  const world = join(RUN, "stages", stage.id, "world");
  const stateDir = join(RUN, "stages", stage.id, "state");
  const outDir = join(RUN, "out", stage.id);
  const run = readJson(join(outDir, "run.json")) ?? {};
  const home = run.home ?? join(RUN, `home-${stage.id}`);
  const budget = readJson(join(outDir, "budget.json")) ?? {};
  const snapshot = readJson(join(outDir, "snapshot.json")) ?? {};
  const streamFiles = streams(home);
  const prefixDir = join(RUN, "out", "attribution");
  mkdirSync(prefixDir, { recursive: true });
  const attributions = streamFiles.map((file, index) => ({ file, timeline: attribute(file, join(prefixDir, `${stage.id}-${index}`)) }));
  const principal =
    attributions.find((entry) => {
      const cwd = String(entry.timeline?.summary?.session?.cwd ?? "").replaceAll("\\", "/").toLowerCase();
      return cwd === world.replaceAll("\\", "/").toLowerCase() || (run.principalRuntime === "container" && cwd === "/run/stage/world");
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
  const domainRefusals = Number(principal?.timeline?.summary?.counts?.domainRefusals ?? 0);
  const repeatedRefusals = Number(principal?.timeline?.summary?.counts?.repeatedRefusals ?? 0);
  const noProgressToolCalls = Number(principal?.timeline?.summary?.counts?.noProgressToolCalls ?? errors + domainRefusals);

  const state = { tasks: [], attempts: [], promotions: 0, projectRevised: 0, promotionCommitted: 0 };
  let stateDb;
  try {
    stateDb = new DatabaseSync(join(stateDir, "palimpsest.sqlite"), { readOnly: true });
    state.tasks = stateDb.prepare("SELECT task_id, state FROM tasks ORDER BY task_id").all().map((row) => ({ taskId: String(row.task_id), state: String(row.state) }));
    state.attempts = stateDb.prepare("SELECT attempt_id, task_id, state FROM attempts ORDER BY last_event_id").all().map((row) => ({ attemptId: String(row.attempt_id), taskId: row.task_id === null ? null : String(row.task_id), state: String(row.state) }));
    state.promotions = Number(stateDb.prepare("SELECT COUNT(*) AS n FROM promotions").get().n);
    state.projectRevised = Number(stateDb.prepare("SELECT COUNT(*) AS n FROM events WHERE event_type='PROJECT_REVISED'").get().n);
    state.promotionCommitted = Number(stateDb.prepare("SELECT COUNT(*) AS n FROM events WHERE event_type='PROMOTION_COMMITTED'").get().n);
  } catch {
    /* absent state */
  } finally { stateDb?.close(); }
  const journal = journalIntent(stateDir);
  const head = git(world, ["rev-parse", "HEAD"]);
  const status = git(world, ["status", "--porcelain"]);
  const usage = streamUsage(principal?.file ?? "");
  const ledgerTokens = metered ? (run.usage?.totalTokens ?? null) : Number(run.usage?.totalTokens || budget.totalTokens || 0);
  const totalTokens = metered ? ledgerTokens : usage.status === "READ" ? usage.total : ledgerTokens;
  const tokenEvidenceQualified = metered
    ? run.usage?.source === "PROVIDER_TERMINAL_USAGE_LEDGER" && run.usage?.unresolvedRequests === 0 && Number.isSafeInteger(ledgerTokens) && ledgerTokens > 0
    : usage.status === "READ" && usage.total > 0;
  const natural = run.natural === true;
  const stopped = run.stopped === true;
  const exitKind =
    natural
      ? "NATURAL_EXIT"
      : run.error !== null && run.error !== undefined
        ? "HOST_FAILURE"
        : run.signal !== null && run.signal !== undefined
          ? "KILLED"
          : stopped
            ? ({ wall_clock: "WALL_CLOCK_STOPPED", request_limit: "REQUEST_LIMIT_STOPPED", usage_unobservable: "USAGE_UNOBSERVABLE" })[run.killedBy] ?? (metered ? "STOPPED" : "BUDGET_STOPPED")
            : run.exitCode !== 0 && run.exitCode !== null && run.exitCode !== undefined
              ? "ABNORMAL_EXIT"
              : "UNKNOWN";
  const historical = stage.historical;

  /**
   * PNWF-CQ-G §9.1: these are five different facts. A recorded conclusion or a retired task is not a
   * natural session exit, and a budget stop is not a closure. They are reported separately and the
   * pre-registered primary endpoint requires the natural exit explicitly.
   */
  const conclusionRecorded = journal.intent !== null;
  const taskRetired = state.tasks.some((task) => task.state === "STALE");
  const noRepeatedComplete = completeCalls <= 1;
  const noPromotion = state.promotions === 0 && state.promotionCommitted === 0;
  const headUnchanged = head === stage.artifactCommit;
  const tokensBelow = totalTokens > 0 && totalTokens < historical.closureTokens;
  const facts = {
    completeAtMostOnce: noRepeatedComplete,
    episodeConclusionRecorded: conclusionRecorded,
    taskRetired,
    noPromotion,
    headUnchanged,
    tokensBelowHistoricalClosure: tokensBelow,
    sessionNaturalExit: exitKind === "NATURAL_EXIT",
    tokenEvidenceQualified,
  };
  const score = Object.values(facts).filter(Boolean).length;
  const primary =
    facts.completeAtMostOnce &&
    facts.episodeConclusionRecorded &&
    facts.noPromotion &&
    facts.headUnchanged &&
    totalTokens > 0 &&
    facts.sessionNaturalExit &&
    facts.tokenEvidenceQualified && (!metered || Boolean(principal?.timeline));
  stages.push({
    stage: stage.id,
    sessionId: stage.id,
    historical,
    tokens: {
      total: totalTokens,
      max: budget.maxTokens ?? null,
      reserve: budget.reserveTokens ?? null,
      softStopAt: budget.softCeiling ?? null,
      stream: usage,
      ledgerSnapshot: ledgerTokens,
      delta: usage.status === "READ" && ledgerTokens !== null ? usage.total - ledgerTokens : null,
      evidenceQualified: tokenEvidenceQualified,
    },
    exit: { natural, stopped, kind: exitKind, killedBy: run.killedBy ?? null, exitCode: run.exitCode ?? null, signal: run.signal ?? null, error: run.error ?? null },
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
      domainRefusals,
      repeatedRefusals,
      noProgressToolCalls,
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
mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
