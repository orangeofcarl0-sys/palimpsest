#!/usr/bin/env node
/**
 * APS-C — fail-closed live cohort runner.
 *
 * There is NO APS spend authorization in this delivery. This runner therefore refuses to start any
 * model session unless a current, exact authorization covers THIS cohort, provider and aggregate
 * token ceiling. It also enforces a local hard cap independent of the authorization file, because the
 * prior programme's 40M reservation exceeded its recorded ceiling.
 *
 * With `--execute` it starts each session behind `budget_guard.mjs`, which reads the real DSH usage
 * stream and terminates the target when the session's token ceiling is exceeded. Without
 * `--execute` it only validates and writes a plan; it starts nothing.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "..", "..");
const HARD_CAP_TOKENS = 8_000_000;
const CONDITIONS = ["F", "L", "G"];

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const cohortPath = String(args.get("cohort") ?? "");
const authorizationPath = String(args.get("authorization") ?? process.env.APS_SPEND_AUTHORIZATION ?? "");
const execute = args.get("execute") === "true" || args.get("execute") === "1";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function fail(blockers) {
  const cohortId = (() => {
    try {
      return readJson(cohortPath).cohortId;
    } catch {
      return "unknown";
    }
  })();
  const dir = join(REPO, "research-evidence", "aps", "live", String(cohortId));
  mkdirSync(dir, { recursive: true });
  const record = {
    schema: "aps-live-run-state/v1",
    state: "BLOCKED",
    cohortPath,
    authorizationPath: authorizationPath === "" ? null : authorizationPath,
    modelCalls: 0,
    blockers,
    at: new Date().toISOString(),
  };
  writeFileSync(join(dir, "BLOCKED.json"), `${JSON.stringify(record, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(record)}\n`);
  process.exit(2);
}

if (cohortPath === "" || !existsSync(cohortPath)) fail(["a cohort JSON path is required"]);
const cohort = readJson(cohortPath);
const blockers = [];
if (cohort.schema !== "aps-live-cohort/v1") blockers.push("cohort.schema must be aps-live-cohort/v1");
if (typeof cohort.cohortId !== "string" || cohort.cohortId.trim() === "") blockers.push("cohort.cohortId is required");
if (typeof cohort.codeFreeze !== "string" || !/^[0-9a-f]{40}$/u.test(cohort.codeFreeze)) blockers.push("cohort.codeFreeze must be a 40-hex commit");
if (!Array.isArray(cohort.conditions) || cohort.conditions.length !== 3 || CONDITIONS.some((condition) => !cohort.conditions.includes(condition))) {
  blockers.push("cohort.conditions must contain exactly F, L and G");
}
if (cohort.oracleCopied !== false) blockers.push("cohort.oracleCopied must be false");
const provider = cohort.provider;
if (typeof provider !== "object" || provider === null || typeof provider.id !== "string" || typeof provider.model !== "string") {
  blockers.push("cohort.provider must name an id and model");
}
if (!Array.isArray(cohort.sessions) || cohort.sessions.length < 3) {
  blockers.push("cohort.sessions needs at least one session per condition");
} else {
  const seen = new Set();
  for (const session of cohort.sessions) {
    if (typeof session.id !== "string" || session.id.trim() === "") blockers.push("each session needs an id");
    if (!CONDITIONS.includes(session.condition)) blockers.push(`session ${String(session.id)} has an unknown condition`);
    if (!Number.isSafeInteger(session.maxTokens) || session.maxTokens < 1) blockers.push(`session ${String(session.id)} needs a positive maxTokens`);
    if (!Array.isArray(session.command) || session.command.length === 0) blockers.push(`session ${String(session.id)} needs a command array`);
    if (typeof session.sessionRoot !== "string" || session.sessionRoot.trim() === "") blockers.push(`session ${String(session.id)} needs a sessionRoot`);
    seen.add(session.condition);
  }
  for (const condition of CONDITIONS) {
    if (!seen.has(condition)) blockers.push(`no session covers condition ${condition}`);
  }
}
const requestedTokens = Array.isArray(cohort.sessions)
  ? cohort.sessions.reduce((total, session) => total + (Number.isSafeInteger(session.maxTokens) ? session.maxTokens : 0), 0)
  : 0;
if (requestedTokens > HARD_CAP_TOKENS) {
  blockers.push(`the cohort requests ${String(requestedTokens)} tokens, above the local hard cap ${String(HARD_CAP_TOKENS)}`);
}

let head = "unknown";
try {
  head = execFileSync("git", ["-C", REPO, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
} catch {
  blockers.push("the current Git HEAD could not be read");
}
if (typeof cohort.codeFreeze === "string" && cohort.codeFreeze !== head) {
  blockers.push(`cohort.codeFreeze ${cohort.codeFreeze} is not the current HEAD ${head}; freeze the exact build before a live run`);
}

if (authorizationPath === "" || !existsSync(authorizationPath)) {
  blockers.push("no APS spend authorization is present; a PC1-V1 authorization does not transfer");
} else {
  const authorization = readJson(authorizationPath);
  if (authorization.schema !== "aps-spend-authorization/v1") blockers.push("authorization.schema must be aps-spend-authorization/v1");
  if (authorization.authorized !== true) blockers.push("authorization.authorized must be true");
  if (typeof authorization.owner !== "string" || authorization.owner.trim() === "") blockers.push("authorization.owner is required");
  if (authorization.cohortId !== cohort.cohortId) blockers.push("authorization.cohortId does not match this cohort");
  if (authorization.provider?.id !== provider?.id || authorization.provider?.model !== provider?.model) {
    blockers.push("authorization.provider does not match this cohort");
  }
  if (!Array.isArray(authorization.conditions) || CONDITIONS.some((condition) => !authorization.conditions.includes(condition))) {
    blockers.push("authorization.conditions must cover F, L and G");
  }
  if (!Number.isSafeInteger(authorization.maxTokens) || authorization.maxTokens < 1) {
    blockers.push("authorization.maxTokens must be a positive integer");
  } else if (requestedTokens > authorization.maxTokens) {
    blockers.push(`the cohort requests ${String(requestedTokens)} tokens, above the authorized ${String(authorization.maxTokens)}`);
  }
  if (typeof authorization.expiresAt !== "string" || Date.parse(authorization.expiresAt) <= Date.now()) {
    blockers.push("authorization.expiresAt must be a future timestamp");
  }
}

if (blockers.length > 0) fail(blockers);

const stateDir = join(REPO, "research-evidence", "aps", "live", cohort.cohortId);
mkdirSync(stateDir, { recursive: true });
const plan = {
  schema: "aps-live-run-plan/v1",
  cohortId: cohort.cohortId,
  codeFreeze: cohort.codeFreeze,
  requestedTokens,
  hardCapTokens: HARD_CAP_TOKENS,
  execute,
  sessions: cohort.sessions.map((session) => ({
    id: session.id,
    condition: session.condition,
    maxTokens: session.maxTokens,
    command: session.command,
    sessionRoot: session.sessionRoot,
  })),
  budgetGuard: "scripts/aps/budget_guard.mjs watches the real DSH usage stream and terminates the target above its session ceiling",
  startedAt: new Date().toISOString(),
};
writeFileSync(join(stateDir, "run-plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
if (!execute) {
  process.stdout.write(`${JSON.stringify({ state: "READY", modelCalls: 0, requestedTokens, plan: join(stateDir, "run-plan.json") })}\n`);
  process.exit(0);
}

async function runSession(session) {
  const ledger = join(stateDir, `${session.id}-budget.json`);
  const stopped = join(stateDir, `${session.id}-STOPPED.json`);
  const child = spawn(session.command[0], session.command.slice(1), {
    cwd: session.cwd ?? REPO,
    env: { ...process.env, ...(session.env ?? {}) },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const log = [];
  child.stdout.on("data", (chunk) => log.push(chunk.toString()));
  child.stderr.on("data", (chunk) => log.push(chunk.toString()));
  const guard = spawn(process.execPath, [
    join(REPO, "scripts", "aps", "budget_guard.mjs"),
    `--session-root=${session.sessionRoot}`,
    `--max-tokens=${session.maxTokens}`,
    `--target-pid=${child.pid}`,
    `--ledger=${ledger}`,
    `--stopped=${stopped}`,
  ], { stdio: "ignore" });
  const outcome = await new Promise((resolvePromise) => {
    child.on("exit", (code, signal) => resolvePromise({ code, signal }));
  });
  guard.kill("SIGTERM");
  let usage = null;
  try {
    usage = readJson(ledger);
  } catch {
    usage = null;
  }
  writeFileSync(join(stateDir, `${session.id}-run.log`), log.join(""));
  return { sessionId: session.id, condition: session.condition, ...outcome, usage, stopped: existsSync(stopped) };
}

const results = [];
for (const session of cohort.sessions) results.push(await runSession(session));
const record = {
  schema: "aps-live-run-state/v1",
  state: results.some((result) => result.stopped) ? "STOPPED_BY_BUDGET" : "COMPLETED",
  cohortId: cohort.cohortId,
  codeFreeze: cohort.codeFreeze,
  requestedTokens,
  modelCalls: results.length,
  results,
  at: new Date().toISOString(),
};
writeFileSync(join(stateDir, "run-state.json"), `${JSON.stringify(record, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ state: record.state, modelCalls: record.modelCalls, results: results.map((result) => ({ sessionId: result.sessionId, code: result.code, stopped: result.stopped })) })}\n`);
