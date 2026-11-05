/**
 * ALHS-C fail-closed cohort gate.
 *
 * This process NEVER starts a model by itself. It validates the pre-registered cohort, expands the
 * per-session budget plan, and only when a current `alhs-spend-authorization/v1` covers the exact
 * cohort/provider/stage/conditions/ceilings AND an explicit execution adapter is configured does it
 * spawn the adapter — one session at a time.
 *
 *   no --execute            → validate + write the plan, modelCalls=0
 *   --execute, no auth      → BLOCKED.json, exit 2, modelCalls=0
 *   --execute, auth, no adapter → BLOCKED.json (ADAPTER_NOT_CONFIGURED), exit 3, modelCalls=0
 *
 * The LHAPE-C pilot authorization does not transfer: the schema and cohort id are different.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const COHORT_PATH = resolve(String(args.get("cohort") ?? ""));
const STAGE_ID = String(args.get("stage") ?? "core");
const EXECUTE = args.has("execute");
const OUT = resolve(String(args.get("out") ?? dirname(COHORT_PATH)));
const AUTH_PATH = resolve(String(args.get("authorization") ?? join(dirname(COHORT_PATH), "authorization.json")));
const ADAPTER = args.get("adapter") === undefined ? null : resolve(String(args.get("adapter")));

if (COHORT_PATH === "" || !existsSync(COHORT_PATH)) {
  process.stderr.write("run_cohort: --cohort=<path> is required\n");
  process.exit(2);
}

function writeJson(name, value) {
  mkdirSync(OUT, { recursive: true });
  const path = join(OUT, name);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function fail(code, reasons, extra = {}) {
  const blocked = {
    schema: "alhs-cohort-blocked/v1",
    cohortId: cohort?.cohortId ?? null,
    stage: STAGE_ID,
    blockedAt: new Date().toISOString(),
    modelCalls: 0,
    reasonCodes: reasons,
    detail: reasons.join("; "),
    ...extra,
  };
  writeJson("BLOCKED.json", blocked);
  process.stderr.write(`ALHS-C BLOCKED: ${blocked.detail}\n`);
  process.exit(code);
}

const cohort = readJson(COHORT_PATH);
if (cohort === null) fail(2, ["the cohort file is not valid JSON"]);
if (cohort.schema !== "alhs-cohort/v1") fail(2, [`unknown cohort schema "${String(cohort.schema)}"`]);
if (typeof cohort.cohortId !== "string" || cohort.cohortId === "") fail(2, ["cohortId is required"]);

const stage = Array.isArray(cohort.stages) ? cohort.stages.find((entry) => entry.id === STAGE_ID) : undefined;
if (stage === undefined) fail(2, [`unknown stage "${STAGE_ID}"; known: ${(cohort.stages ?? []).map((entry) => entry.id).join(", ")}`]);

const problems = [];
if (!Array.isArray(stage.conditions) || stage.conditions.length === 0) problems.push("the stage names no conditions");
for (const condition of stage.conditions ?? []) {
  if (cohort.conditions?.[condition] === undefined) problems.push(`condition "${condition}" is not defined`);
}
const hasSessionPlan = Array.isArray(stage.sessionPlan) && stage.sessionPlan.length > 0;
if (!hasSessionPlan && (!Number.isSafeInteger(stage.sessionsPerCondition) || stage.sessionsPerCondition < 1)) {
  problems.push("sessionsPerCondition must be a positive integer (or supply sessionPlan)");
}
if (!Number.isSafeInteger(stage.sessionCeiling) || stage.sessionCeiling < 1) {
  problems.push("sessionCeiling must be a positive integer");
}
if (!Number.isSafeInteger(stage.reserveTokens) || stage.reserveTokens < 0 || stage.reserveTokens >= stage.sessionCeiling) {
  problems.push("reserveTokens must be a non-negative integer below sessionCeiling");
}
if (!Number.isSafeInteger(stage.aggregateCeiling) || stage.aggregateCeiling < 1) {
  problems.push("aggregateCeiling must be a positive integer");
}
if (!Number.isSafeInteger(cohort.localHardCap) || cohort.localHardCap < 1) {
  problems.push("localHardCap must be a positive integer");
}
const sessions = hasSessionPlan
  ? stage.sessionPlan.map((entry, index) => {
      const condition = String(entry.condition ?? "");
      const ceiling = Number(entry.ceiling ?? stage.sessionCeiling);
      const reserveTokens = Number(entry.reserveTokens ?? stage.reserveTokens);
      if (!(stage.conditions ?? []).includes(condition)) problems.push(`sessionPlan[${String(index)}] names condition "${condition}" outside the stage`);
      if (!Number.isSafeInteger(ceiling) || ceiling < 1) problems.push(`sessionPlan[${String(index)}].ceiling must be a positive integer`);
      if (!Number.isSafeInteger(reserveTokens) || reserveTokens < 0 || reserveTokens >= ceiling) {
        problems.push(`sessionPlan[${String(index)}].reserveTokens must be below its ceiling`);
      }
      if (entry.killAtTokens !== undefined && (!Number.isSafeInteger(entry.killAtTokens) || entry.killAtTokens < 1 || entry.killAtTokens >= ceiling)) {
        problems.push(`sessionPlan[${String(index)}].killAtTokens must be a positive integer below its ceiling`);
      }
      return {
        sessionId: String(entry.sessionId ?? `${condition}-${String(index + 1)}`),
        condition,
        index: Number(entry.index ?? index + 1),
        ceiling,
        reserveTokens,
        softStopAt: ceiling - reserveTokens,
        ...(entry.killAtTokens === undefined ? {} : { killAtTokens: entry.killAtTokens }),
        profile: cohort.conditions?.[condition]?.profile ?? null,
      };
    })
  : (stage.conditions ?? []).flatMap((condition) =>
      Array.from({ length: stage.sessionsPerCondition ?? 0 }, (_, index) => ({
        sessionId: `${String(condition)}-${String(index + 1)}`,
        condition,
        index: index + 1,
        ceiling: stage.sessionCeiling,
        reserveTokens: stage.reserveTokens,
        softStopAt: stage.sessionCeiling - stage.reserveTokens,
        profile: cohort.conditions?.[condition]?.profile ?? null,
      })),
    );
const plannedCeiling = sessions.reduce((sum, session) => sum + session.ceiling, 0);
if (plannedCeiling > stage.aggregateCeiling) {
  problems.push(`the expanded session ceilings (${String(plannedCeiling)}) exceed the stage aggregate (${String(stage.aggregateCeiling)})`);
}
if (plannedCeiling > cohort.localHardCap) {
  problems.push(`the expanded session ceilings (${String(plannedCeiling)}) exceed the local hard cap (${String(cohort.localHardCap)})`);
}
if (sessions.length === 0) problems.push("the stage expands to zero sessions");
if (problems.length > 0) fail(2, problems);

const plan = {
  schema: "alhs-cohort-plan/v1",
  cohortId: cohort.cohortId,
  stage: STAGE_ID,
  codeFreeze: cohort.codeFreeze ?? null,
  provider: cohort.provider ?? null,
  generatedAt: new Date().toISOString(),
  modelCalls: 0,
  sessions,
  totals: {
    sessions: sessions.length,
    plannedCeiling,
    plannedReserve: sessions.reduce((sum, session) => sum + session.reserveTokens, 0),
    effectiveStopSum: sessions.reduce((sum, session) => sum + session.softStopAt, 0),
    aggregateCeiling: stage.aggregateCeiling,
    localHardCap: cohort.localHardCap,
  },
  note:
    "A plan only. Each session stops at `softStopAt`, leaving its reserve for the in-flight message. Child sessions are counted through the whole session root.",
};
const planPath = writeJson("run-plan.json", plan);
if (!EXECUTE) {
  process.stdout.write(`${JSON.stringify({ plan: planPath, modelCalls: 0, sessions: sessions.length, plannedCeiling })}\n`);
  process.exit(0);
}

// ── AUTHORIZATION ────────────────────────────────────────────────────────────────────────────────
if (!existsSync(AUTH_PATH)) {
  fail(2, ["no alhs-spend-authorization/v1 file exists; the LHAPE-C authorization does not transfer"], { authorization: AUTH_PATH, plan: planPath });
}
const authorization = readJson(AUTH_PATH);
if (authorization === null) fail(2, ["the authorization file is not valid JSON"], { authorization: AUTH_PATH, plan: planPath });

const authProblems = [];
if (authorization.schema !== "alhs-spend-authorization/v1") {
  authProblems.push(`authorization schema is "${String(authorization.schema)}", not alhs-spend-authorization/v1`);
}
if (authorization.cohortId !== cohort.cohortId) authProblems.push("the authorization names a different cohort");
if (authorization.provider !== cohort.provider) authProblems.push("the authorization names a different provider");
if (typeof authorization.authorizedBy !== "string" || authorization.authorizedBy.trim() === "") {
  authProblems.push("the authorization does not name who authorized it");
}
const expiresAt = Date.parse(String(authorization.expiresAt ?? ""));
if (!Number.isFinite(expiresAt)) authProblems.push("the authorization has no valid expiresAt");
else if (expiresAt <= Date.now()) authProblems.push("the authorization has expired");
const authorizedStages = Array.isArray(authorization.stages) ? authorization.stages : [];
if (!authorizedStages.includes(STAGE_ID)) authProblems.push(`the authorization does not cover stage "${STAGE_ID}"`);
const authorizedConditions = Array.isArray(authorization.conditions) ? authorization.conditions : [];
for (const condition of stage.conditions) {
  if (!authorizedConditions.includes(condition)) authProblems.push(`the authorization does not cover condition "${condition}"`);
}
if (!Number.isSafeInteger(authorization.aggregateTokens) || authorization.aggregateTokens < stage.aggregateCeiling) {
  authProblems.push("the authorization aggregate is below this stage's aggregate ceiling");
}
if (!Number.isSafeInteger(authorization.perSessionCeiling) || authorization.perSessionCeiling < stage.sessionCeiling) {
  authProblems.push("the authorization per-session ceiling is below this stage's session ceiling");
}
if (!Number.isSafeInteger(authorization.reserveTokens) || authorization.reserveTokens < stage.reserveTokens) {
  authProblems.push("the authorization reserve is below this stage's reserve");
}
if (!Number.isSafeInteger(authorization.maxSessions) || authorization.maxSessions < sessions.length) {
  authProblems.push("the authorization does not cover this many sessions");
}
if (authProblems.length > 0) fail(2, authProblems, { authorization: AUTH_PATH, plan: planPath });

// ── EXECUTION ADAPTER ────────────────────────────────────────────────────────────────────────────
const configuredAdapter = ADAPTER ?? (typeof cohort.executionAdapter === "string" ? resolve(cohort.executionAdapter) : null);
if (configuredAdapter === null || !existsSync(configuredAdapter)) {
  fail(3, ["ADAPTER_NOT_CONFIGURED: an authorized cohort still needs an explicit per-session execution adapter; no model was started"], {
    authorization: AUTH_PATH,
    plan: planPath,
  });
}

const runState = {
  schema: "alhs-cohort-run-state/v1",
  cohortId: cohort.cohortId,
  stage: STAGE_ID,
  authorization: AUTH_PATH,
  adapter: configuredAdapter,
  startedAt: new Date().toISOString(),
  sessions: [],
};
for (const session of sessions) {
  const sessionPath = writeJson(`session-${session.sessionId}.json`, {
    schema: "alhs-cohort-session/v1",
    cohortId: cohort.cohortId,
    stage: STAGE_ID,
    ...session,
  });
  const exit = await new Promise((resolve) => {
    const child = spawn(process.execPath, [configuredAdapter, `--session=${sessionPath}`, `--cohort=${COHORT_PATH}`, `--stage=${STAGE_ID}`], {
      stdio: "inherit",
      env: {
        ...process.env,
        ALHS_COHORT_ID: cohort.cohortId,
        ALHS_STAGE: STAGE_ID,
        ALHS_SESSION_ID: session.sessionId,
        ALHS_CONDITION: session.condition,
        ALHS_MAX_TOKENS: String(session.ceiling),
        ALHS_RESERVE_TOKENS: String(session.reserveTokens),
        ALHS_CURRENT_HEAD: cohort.codeFreeze ?? "",
      },
    });
    child.on("error", () => resolve(127));
    child.on("exit", (code) => resolve(code ?? 1));
  });
  runState.sessions.push({ ...session, exitCode: exit, endedAt: new Date().toISOString() });
  writeJson("run-state.json", runState);
  if (exit !== 0) break;
}
writeJson("run-state.json", { ...runState, endedAt: new Date().toISOString() });
process.stdout.write(`${JSON.stringify({ runState: join(OUT, "run-state.json"), sessions: runState.sessions.length })}\n`);
