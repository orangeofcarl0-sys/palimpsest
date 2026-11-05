/**
 * PSVR-C fail-closed cohort gate.
 *
 * This process NEVER starts a model by itself. It validates the pre-registered cohort, expands the
 * per-session budget plan, and only when a current `psvr-spend-authorization/v1` covers the exact
 * cohort/provider/stage/conditions/ceilings AND an explicit execution adapter is configured does it
 * spawn the adapter — one session at a time.
 *
 *   no --execute               → validate + write the plan, modelCalls=0
 *   --execute, no auth         → BLOCKED.json, exit 2, modelCalls=0
 *   --execute, auth, no adapter → BLOCKED.json (ADAPTER_NOT_CONFIGURED), exit 3, modelCalls=0
 *   --execute, auth, adapter    → one session per invocation
 *
 * The ALHS and ODPE-R authorizations do NOT transfer: the schema and the cohort id are different.
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
const STAGE_ID = String(args.get("stage") ?? "psvr-c");
const EXECUTE = args.has("execute");
const OUT = resolve(String(args.get("out") ?? dirname(COHORT_PATH)));
const AUTH_PATH = resolve(String(args.get("authorization") ?? join(dirname(COHORT_PATH), "authorization.json")));
const ADAPTER = args.get("adapter") === undefined ? null : resolve(String(args.get("adapter")));

if (COHORT_PATH === "" || !existsSync(COHORT_PATH)) {
  process.stderr.write("run_psvr_c: --cohort=<path> is required\n");
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

const cohort = readJson(COHORT_PATH);

function fail(code, reasons, extra = {}) {
  const blocked = {
    schema: "psvr-cohort-blocked/v1",
    cohortId: cohort?.cohortId ?? null,
    stage: STAGE_ID,
    blockedAt: new Date().toISOString(),
    modelCalls: 0,
    reasonCodes: reasons,
    detail: reasons.join("; "),
    ...extra,
  };
  const path = writeJson("BLOCKED.json", blocked);
  process.stderr.write(`run_psvr_c: BLOCKED (${reasons.join("; ")})\n${path}\n`);
  process.exit(code);
}

// ── the pre-registration must be complete before anything else is checked ────────────────────────

const problems = [];
if (cohort === null) problems.push("the cohort file is not valid JSON");
if (cohort?.schema !== "psvr-cohort/v1") problems.push(`cohort schema is "${String(cohort?.schema)}", not psvr-cohort/v1`);
if (typeof cohort?.cohortId !== "string" || cohort.cohortId === "") problems.push("the cohort has no id");
if (typeof cohort?.provider !== "string" || cohort.provider === "") problems.push("the cohort names no provider");

const conditions = cohort?.conditions ?? {};
for (const id of ["F", "A"]) {
  if (conditions[id] === undefined) problems.push(`condition ${id} is not defined`);
  else if (typeof conditions[id].definition !== "string" || conditions[id].definition.length < 40) {
    problems.push(`condition ${id} has no substantive definition`);
  }
}
if (conditions.G !== undefined && !/diagnostic/iu.test(String(conditions.G.definition))) {
  problems.push("condition G exists but is not marked diagnostic");
}

const hypotheses = Array.isArray(cohort?.hypotheses) ? cohort.hypotheses : [];
if (hypotheses.length < 3) problems.push(`the cohort pre-registers ${String(hypotheses.length)} hypotheses; at least 3 are required`);
for (const hypothesis of hypotheses) {
  if (typeof hypothesis?.id !== "string" || typeof hypothesis?.statement !== "string") problems.push("a hypothesis is missing its id or statement");
  if (typeof hypothesis?.null !== "string") problems.push(`hypothesis ${String(hypothesis?.id)} has no null result`);
  if (!Array.isArray(hypothesis?.observable) || hypothesis.observable.length === 0) {
    problems.push(`hypothesis ${String(hypothesis?.id)} has no observable`);
  }
}

const metrics = Array.isArray(cohort?.metrics) ? cohort.metrics : [];
if (metrics.length < 10) problems.push(`the cohort names ${String(metrics.length)} metrics; at least 10 are required`);

const scenarios = Array.isArray(cohort?.scenarios) ? cohort.scenarios : [];
if (scenarios.length < 2) problems.push(`the cohort has ${String(scenarios.length)} scenarios; at least 2 are required`);
for (const scenario of scenarios) {
  if (typeof scenario?.acceptance?.join !== "function" || scenario.acceptance.length === 0) {
    problems.push(`scenario ${String(scenario?.id)} has no executable acceptance`);
  }
}

const stage = (cohort?.stages ?? []).find((entry) => entry?.id === STAGE_ID);
if (stage === undefined) problems.push(`the cohort has no stage "${STAGE_ID}"`);
else {
  if (!Array.isArray(stage.conditions) || !stage.conditions.includes("F") || !stage.conditions.includes("A")) {
    problems.push(`stage ${STAGE_ID} does not run F and A`);
  }
  if (!Number.isSafeInteger(stage.sessionCeiling) || stage.sessionCeiling <= 0) problems.push("the stage has no valid session ceiling");
  if (!Number.isSafeInteger(stage.aggregateCeiling) || stage.aggregateCeiling <= 0) problems.push("the stage has no valid aggregate ceiling");
  const controls = stage.interruptionControls ?? {};
  if (controls.MATCHED_TOKEN === undefined || controls.MATCHED_WORK_STATE === undefined) {
    problems.push("the stage does not declare both interruption controls");
  }
}

if (problems.length > 0) fail(2, problems);

// ── the plan (no model calls) ───────────────────────────────────────────────────────────────────

const sessions = [];
for (const condition of ["F", "A"]) {
  for (let index = 1; index <= stage.sessionsPerCondition; index += 1) {
    sessions.push({
      sessionId: `${condition}-${String(index)}`,
      condition,
      index,
      ceiling: stage.sessionCeiling,
      reserveTokens: stage.reserveTokens,
      interruption: index === 1 ? Object.keys(stage.interruptionControls) : [],
    });
  }
}
const plan = {
  schema: "psvr-cohort-plan/v1",
  cohortId: cohort.cohortId,
  stage: STAGE_ID,
  provider: cohort.provider,
  scenarios: [stage.scenario ?? scenarios[0]?.id ?? null].filter((id) => id !== null),
  sessions,
  aggregateCeiling: stage.aggregateCeiling,
  plannedCeiling: sessions.length * stage.sessionCeiling,
  execution: EXECUTE ? "requested" : "not requested",
  modelCalls: 0,
};
const planPath = writeJson("plan.json", plan);

if (!EXECUTE) {
  process.stdout.write(`${JSON.stringify({ ...plan, plan: planPath })}\n`);
  process.exit(0);
}

// ── the authorization ──────────────────────────────────────────────────────────────────────────

if (!existsSync(AUTH_PATH)) {
  fail(2, ["no psvr-spend-authorization/v1 file exists; the ALHS and ODPE-R authorizations do not transfer"], { authorization: AUTH_PATH, plan: planPath });
}
const authorization = readJson(AUTH_PATH);
if (authorization === null) fail(2, ["the authorization file is not valid JSON"], { authorization: AUTH_PATH, plan: planPath });

const authProblems = [];
if (authorization.schema !== "psvr-spend-authorization/v1") {
  authProblems.push(`authorization schema is "${String(authorization.schema)}", not psvr-spend-authorization/v1`);
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
for (const condition of ["F", "A"]) {
  if (!authorizedConditions.includes(condition)) authProblems.push(`the authorization does not cover condition ${condition}`);
}
if (!Number.isSafeInteger(authorization.perSessionCeiling) || authorization.perSessionCeiling < stage.sessionCeiling) {
  authProblems.push(`the authorization's per-session ceiling (${String(authorization.perSessionCeiling)}) is below the stage's (${String(stage.sessionCeiling)})`);
}
if (!Number.isSafeInteger(authorization.aggregateTokens) || authorization.aggregateTokens < plan.plannedCeiling) {
  authProblems.push(`the authorization's aggregate (${String(authorization.aggregateTokens)}) is below the planned (${String(plan.plannedCeiling)})`);
}
if (Number.isSafeInteger(authorization.maxSessions) && authorization.maxSessions < sessions.length) {
  authProblems.push(`the authorization allows ${String(authorization.maxSessions)} sessions; the stage plans ${String(sessions.length)}`);
}
if (authProblems.length > 0) fail(2, authProblems, { authorization: AUTH_PATH, plan: planPath });

// ── the adapter ────────────────────────────────────────────────────────────────────────────────

if (ADAPTER === null) {
  fail(3, ["ADAPTER_NOT_CONFIGURED: an authorization is present but no execution adapter was named; this gate does not contain one"], {
    authorization: AUTH_PATH,
    plan: planPath,
  });
}
if (!existsSync(ADAPTER)) fail(3, [`ADAPTER_NOT_FOUND: ${ADAPTER}`], { authorization: AUTH_PATH, plan: planPath });

// ── execute exactly one session through the named adapter ──────────────────────────────────────

const requestedSession = args.get("session") === undefined ? null : String(args.get("session"));
const sessionIndex =
  requestedSession === null
    ? Math.max(0, Math.min(sessions.length - 1, Number(args.get("sessionIndex") ?? 0)))
    : sessions.findIndex((entry) => entry.sessionId === requestedSession);
if (sessionIndex < 0) fail(2, [`the stage has no session "${String(requestedSession)}"`], { plan: planPath });
const session = sessions[sessionIndex];
const child = spawn(process.execPath, [ADAPTER, `--cohort=${COHORT_PATH}`, `--stage=${STAGE_ID}`, `--session=${session.sessionId}`], {
  stdio: "inherit",
  env: { ...process.env, PSVR_AUTHORIZATION: AUTH_PATH, PSVR_COHORT: COHORT_PATH, PSVR_STAGE: STAGE_ID, PSVR_SESSION: session.sessionId },
});
const code = await new Promise((resolveExit) => child.on("close", (value) => resolveExit(value ?? 1)));
writeJson("executed.json", { schema: "psvr-cohort-executed/v1", cohortId: cohort.cohortId, stage: STAGE_ID, session: session.sessionId, adapter: ADAPTER, exitCode: code, at: new Date().toISOString() });
process.exit(code);
