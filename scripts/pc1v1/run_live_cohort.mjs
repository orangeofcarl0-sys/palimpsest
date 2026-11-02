/**
 * PC1-V1 R9 — the gated live-cohort runner.
 *
 * This runner NEVER starts a model session by accident. It requires:
 *   - a frozen cohort file with matched P/F sessions and no oracle material;
 *   - a new, explicit PC1-V1 spend authorization matching that cohort/provider/model;
 *   - a clean code tree at the recorded Code Freeze commit;
 *   - an empty evidence directory (a scored cohort is immutable).
 *
 * Without all of them it writes a BLOCKED record and exits successfully: a resource block is a
 * resource fact, not a model result.
 *
 * Usage:
 *   node scripts/pc1v1/run_live_cohort.mjs \
 *     --cohort=<cohort.json> --authorization=<authorization.json> [--execute]
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "..", "..");
const COHORT_SCHEMA = "pc1v1-live-cohort/v1";
const AUTHORIZATION_SCHEMA = "pc1v1-spend-authorization/v1";

function arg(name, fallback = "") {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found === undefined ? fallback : found.slice(`--${name}=`.length);
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${label} cannot be read as JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function writeJson(path, value) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function git(args) {
  const result = spawnSync("git", args, { cwd: REPO, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function digestFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const cohortPath = arg("cohort");
const authorizationPath = arg("authorization");
const execute = process.argv.includes("--execute");
if (cohortPath === "") {
  process.stderr.write("usage: node scripts/pc1v1/run_live_cohort.mjs --cohort=<cohort.json> --authorization=<authorization.json> [--execute]\n");
  process.exit(2);
}

const cohort = readJson(resolve(cohortPath), "cohort");
const blockers = [];
const notes = [];

if (cohort.schema !== COHORT_SCHEMA) blockers.push(`cohort schema must be ${COHORT_SCHEMA}`);
if (typeof cohort.cohortId !== "string" || cohort.cohortId.trim() === "") blockers.push("cohortId is required");
if (typeof cohort.codeFreeze !== "string" || !/^[0-9a-f]{40}$/u.test(cohort.codeFreeze)) blockers.push("codeFreeze must be a full 40-character commit");
if (cohort.oracleCopied !== false) blockers.push("cohort must declare oracleCopied=false");
if (cohort.provider === undefined || typeof cohort.provider.id !== "string" || typeof cohort.provider.model !== "string") {
  blockers.push("cohort.provider.id and provider.model are required");
}
if (!Array.isArray(cohort.sessions) || cohort.sessions.length === 0) blockers.push("cohort.sessions must be a non-empty array");

const sessions = Array.isArray(cohort.sessions) ? cohort.sessions : [];
const seen = new Set();
const byScenarioStage = new Map();
for (const session of sessions) {
  if (typeof session.id !== "string" || session.id.trim() === "") blockers.push("every session needs an id");
  if (session.scenario !== "sablewick" && session.scenario !== "field-study") blockers.push(`${String(session.id)}: unknown scenario`);
  if (session.condition !== "P" && session.condition !== "F") blockers.push(`${String(session.id)}: condition must be P or F`);
  if (typeof session.stage !== "string" || session.stage.trim() === "") blockers.push(`${String(session.id)}: stage is required`);
  if (!Array.isArray(session.command) || session.command.length === 0) blockers.push(`${String(session.id)}: command must be a non-empty array`);
  const key = `${String(session.scenario)}:${String(session.stage)}:${String(session.condition)}`;
  if (seen.has(key)) blockers.push(`duplicate session identity ${key}`);
  seen.add(key);
  const pairKey = `${String(session.scenario)}:${String(session.stage)}`;
  const pair = byScenarioStage.get(pairKey) ?? new Set();
  pair.add(session.condition);
  byScenarioStage.set(pairKey, pair);
}
for (const [key, conditions] of byScenarioStage) {
  if (!conditions.has("P") || !conditions.has("F")) blockers.push(`matched P/F missing for ${key}`);
}

let authorization = null;
if (authorizationPath === "") {
  blockers.push("no PC1-V1 spend authorization supplied; the prior PC1 authorization is not inherited");
} else if (!existsSync(resolve(authorizationPath))) {
  blockers.push(`authorization file does not exist: ${authorizationPath}`);
} else {
  authorization = readJson(resolve(authorizationPath), "authorization");
  if (authorization.schema !== AUTHORIZATION_SCHEMA) blockers.push(`authorization schema must be ${AUTHORIZATION_SCHEMA}`);
  if (authorization.authorized !== true) blockers.push("authorization.authorized must be true");
  if (authorization.cohortId !== cohort.cohortId) blockers.push("authorization cohortId does not match the frozen cohort");
  if (authorization.provider?.id !== cohort.provider?.id || authorization.provider?.model !== cohort.provider?.model) {
    blockers.push("authorization provider/model does not match the frozen cohort");
  }
  if (!Number.isSafeInteger(authorization.maxTokens) || authorization.maxTokens <= 0) blockers.push("authorization.maxTokens must be a positive integer");
  if (!Array.isArray(authorization.conditions) || !authorization.conditions.includes("P") || !authorization.conditions.includes("F")) {
    blockers.push("authorization.conditions must include both P and F");
  }
}

const head = git(["rev-parse", "HEAD"]);
if (cohort.codeFreeze !== head) blockers.push(`cohort.codeFreeze ${cohort.codeFreeze} is not HEAD ${head}`);
const dirty = git(["status", "--porcelain", "--untracked-files=no", "--", "src", "test", "scripts", "architecture", "package.json"]);
if (dirty !== "") blockers.push("the executable tree is dirty; establish a new Code Freeze before scoring");

const outDir = resolve(REPO, "research-evidence", "pc1v1", "live", cohort.cohortId);
if (execute && existsSync(outDir)) {
  const existing = readdirSync(outDir).filter((entry) => entry !== "BLOCKED.json" && entry !== "run-plan.json");
  if (existing.length > 0) blockers.push(`scored evidence already exists for ${cohort.cohortId}; a cohort is immutable`);
}

const plan = {
  schema: "pc1v1-run-plan/v1",
  cohortId: cohort.cohortId,
  codeFreeze: cohort.codeFreeze,
  head,
  provider: cohort.provider,
  sessionCount: sessions.length,
  sessions: sessions.map((session) => ({
    id: session.id,
    scenario: session.scenario,
    condition: session.condition,
    stage: session.stage,
    subagents: session.subagents === true,
  })),
  matchedPairs: [...byScenarioStage.keys()].sort(),
  blockers,
  state: blockers.length === 0 ? "READY" : "BLOCKED",
  generatedAt: new Date().toISOString(),
};

if (blockers.length > 0) {
  writeJson(join(outDir, "BLOCKED.json"), {
    schema: "pc1v1-blocked/v1",
    cohortId: cohort.cohortId,
    state: "BLOCKED",
    reason: "authorization_or_preflight_gate",
    blockers,
    modelCalls: 0,
    note: "No model session was started. This is a resource/environment fact, not a behavioral result.",
    generatedAt: new Date().toISOString(),
  });
  writeJson(join(outDir, "run-plan.json"), plan);
  console.log(JSON.stringify({ state: "BLOCKED", blockers, modelCalls: 0 }, null, 2));
  process.exit(0);
}

writeJson(join(outDir, "run-plan.json"), plan);
if (!execute) {
  console.log(JSON.stringify({ state: "READY", executed: false, cohortId: cohort.cohortId, sessions: sessions.length }, null, 2));
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });
writeJson(join(outDir, "cohort.json"), {
  schema: COHORT_SCHEMA,
  cohortId: cohort.cohortId,
  codeFreeze: cohort.codeFreeze,
  codeFreezeTree: git(["rev-parse", `${cohort.codeFreeze}^{tree}`]),
  provider: cohort.provider,
  oracleCopied: false,
  cohortDigest: digestFile(resolve(cohortPath)),
  authorizationDigest: digestFile(resolve(authorizationPath)),
  authorization: {
    owner: authorization.owner,
    authorizedAt: authorization.authorizedAt,
    maxTokens: authorization.maxTokens,
    conditions: authorization.conditions,
    note: authorization.note ?? "",
  },
  note: "Frozen cohort identity. Raw session streams are written next to this record; never overwrite them.",
  createdAt: new Date().toISOString(),
});

const results = [];
for (const session of sessions) {
  const sessionDir = join(outDir, String(session.id));
  mkdirSync(sessionDir, { recursive: true });
  const startedAt = new Date().toISOString();
  const environment = {
    ...process.env,
    ...(session.env ?? {}),
    PC1V1_COHORT: cohort.cohortId,
    PC1V1_CODE_FREEZE: cohort.codeFreeze,
    PC1V1_CONDITION: session.condition,
    PC1V1_SCENARIO: session.scenario,
    PC1V1_STAGE: session.stage,
    ...(session.subagents === true ? { PC1V1_SUBAGENTS: "1" } : {}),
  };
  const result = spawnSync(String(session.command[0]), session.command.slice(1).map(String), {
    cwd: resolve(REPO, session.cwd ?? "."),
    env: environment,
    encoding: "buffer",
    timeout: Number.isSafeInteger(session.timeoutMs) ? session.timeoutMs : 900_000,
    maxBuffer: 256 * 1024 * 1024,
  });
  const finishedAt = new Date().toISOString();
  const stdout = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? "");
  const stderr = Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.from(result.stderr ?? "");
  writeFileSync(join(sessionDir, "stdout.raw"), stdout);
  writeFileSync(join(sessionDir, "stderr.raw"), stderr);
  const timedOut = result.error?.code === "ETIMEDOUT";
  const state = timedOut || result.error !== undefined ? "INVALID" : result.status === 0 ? "EXECUTED" : "FAILED";
  const record = {
    schema: "pc1v1-session-run/v1",
    id: session.id,
    scenario: session.scenario,
    condition: session.condition,
    stage: session.stage,
    subagents: session.subagents === true,
    command: session.command.map(String),
    cwd: session.cwd ?? ".",
    startedAt,
    finishedAt,
    exitCode: result.status,
    signal: result.signal ?? null,
    error: result.error === undefined ? null : String(result.error.message ?? result.error),
    state,
    stdoutBytes: stdout.length,
    stderrBytes: stderr.length,
    note: "EXECUTED means the session process exited 0; it is not by itself a behavioral OBSERVED classification.",
  };
  writeJson(join(sessionDir, "run.json"), record);
  results.push(record);
}

writeJson(join(outDir, "cohort-run.json"), {
  schema: "pc1v1-cohort-run/v1",
  cohortId: cohort.cohortId,
  codeFreeze: cohort.codeFreeze,
  provider: cohort.provider,
  sessions: results.map((record) => ({
    id: record.id,
    scenario: record.scenario,
    condition: record.condition,
    stage: record.stage,
    state: record.state,
    exitCode: record.exitCode,
    subagents: record.subagents,
  })),
  modelCalls: results.length,
  note: "Raw stdout/stderr are preserved per session. Behavioral classification and scoring are separate, rubric-bound steps.",
  finishedAt: new Date().toISOString(),
});
console.log(JSON.stringify({ state: "EXECUTED", modelCalls: results.length, outDir }, null, 2));
