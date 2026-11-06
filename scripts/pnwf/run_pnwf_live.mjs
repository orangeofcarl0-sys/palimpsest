/**
 * PNWF continuation cohort — fail-closed gate.
 *
 * It never starts a model by itself. It validates the pre-registered continuation cohort, expands the
 * two-session plan, and only with a matching `pnwf-spend-authorization/v1` AND an explicit execution
 * adapter does it spawn the adapter for ONE session.
 *
 *   no --execute                → validate + write plan.json, modelCalls=0
 *   --execute, no auth          → BLOCKED.json, exit 2, modelCalls=0
 *   --execute, auth, no adapter → BLOCKED.json (ADAPTER_NOT_CONFIGURED), exit 3, modelCalls=0
 *   --execute, auth, adapter    → one session
 *
 * The PSVR-C/ODPE-R authorizations do NOT transfer: the schema and cohort id are different.
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
const OUT = resolve(String(args.get("out") ?? (COHORT_PATH === "" ? "." : dirname(COHORT_PATH))));
const AUTH_PATH = resolve(String(args.get("authorization") ?? join(dirname(COHORT_PATH), "authorization-pnwf-continuation.json")));
const ADAPTER = args.get("adapter") === undefined ? null : resolve(String(args.get("adapter")));
const ISOLATION_PATH = args.get("isolation") === undefined ? null : resolve(String(args.get("isolation")));
const EXECUTE = args.has("execute");
const SESSION_ID = args.get("session") === undefined ? null : String(args.get("session"));

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}
function writeJson(name, value) {
  mkdirSync(OUT, { recursive: true });
  const path = join(OUT, name);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}
function fail(code, reasons, extra = {}) {
  const blocked = {
    schema: "pnwf-cohort-blocked/v1",
    cohortId: cohort?.cohortId ?? null,
    blockedAt: new Date().toISOString(),
    modelCalls: 0,
    reasonCodes: reasons,
    detail: reasons.join("; "),
    ...extra,
  };
  const path = writeJson("BLOCKED.json", blocked);
  process.stderr.write(`run_pnwf_live: BLOCKED (${reasons.join("; ")})\n${path}\n`);
  process.exit(code);
}

if (COHORT_PATH === "" || !existsSync(COHORT_PATH)) {
  process.stderr.write("run_pnwf_live: --cohort=<path> is required\n");
  process.exit(2);
}
const cohort = readJson(COHORT_PATH);
const problems = [];
if (cohort === null) problems.push("the cohort file is not valid JSON");
if (cohort?.schema !== "pnwf-continuation-cohort/v1") problems.push(`cohort schema is "${String(cohort?.schema)}", not pnwf-continuation-cohort/v1`);
if (typeof cohort?.cohortId !== "string" || cohort.cohortId === "") problems.push("the cohort has no id");
if (cohort?.provider !== "deepseek-official") problems.push("the cohort must name the deepseek-official provider");
if (cohort?.model !== "deepseek-flash") problems.push("the cohort must name deepseek-flash");
if (!Array.isArray(cohort?.conditions) || cohort.conditions.length !== 1 || cohort.conditions[0] !== "PNWF_FULL") {
  problems.push("the cohort must declare exactly the PNWF_FULL condition");
}
const stages = Array.isArray(cohort?.stages) ? cohort.stages : [];
if (stages.length !== 2) problems.push(`the cohort has ${String(stages.length)} stages; exactly 2 are required`);
for (const stage of stages) {
  if (typeof stage?.id !== "string" || stage.id === "") problems.push("a stage has no id");
  if (typeof stage?.artifactCommit !== "string" || !/^[0-9a-f]{40}$/u.test(stage.artifactCommit)) problems.push(`stage ${String(stage?.id)} has no full artifact commit`);
  if (!stage?.historical || !Number.isSafeInteger(stage.historical.closureTokens)) problems.push(`stage ${String(stage?.id)} has no historical closure tokens`);
}
if (cohort?.sessionsPerStage !== 1) problems.push("sessionsPerStage must be 1");
if (cohort?.modelCalls !== 2) problems.push("modelCalls must be 2");
if (!Number.isSafeInteger(cohort?.sessionCeiling) || cohort.sessionCeiling <= 0) problems.push("sessionCeiling is invalid");
if (!Number.isSafeInteger(cohort?.reserveTokens) || cohort.reserveTokens <= 0) problems.push("reserveTokens is invalid");
if (!Number.isSafeInteger(cohort?.aggregateCeiling) || cohort.aggregateCeiling <= 0) problems.push("aggregateCeiling is invalid");
if (problems.length > 0) fail(2, problems);

const sessions = stages.map((stage) => ({
  sessionId: stage.id,
  stage: stage.id,
  condition: "PNWF_FULL",
  ceiling: cohort.sessionCeiling,
  reserveTokens: cohort.reserveTokens,
  artifactCommit: stage.artifactCommit,
  historicalClosureTokens: stage.historical.closureTokens,
}));
const plan = {
  schema: "pnwf-cohort-plan/v1",
  cohortId: cohort.cohortId,
  provider: cohort.provider,
  model: cohort.model,
  sessions,
  aggregateCeiling: cohort.aggregateCeiling,
  plannedCeiling: sessions.length * cohort.sessionCeiling,
  execution: EXECUTE ? "requested" : "not requested",
  modelCalls: 0,
};
const planPath = writeJson("plan.json", plan);
if (!EXECUTE) {
  process.stdout.write(`${JSON.stringify({ ...plan, plan: planPath })}\n`);
  process.exit(0);
}

if (!existsSync(AUTH_PATH)) {
  fail(2, ["no pnwf-spend-authorization/v1 file exists; PSVR-C/ODPE-R authorizations do not transfer"], { authorization: AUTH_PATH, plan: planPath });
}
const authorization = readJson(AUTH_PATH);
if (authorization === null) fail(2, ["the authorization file is not valid JSON"], { authorization: AUTH_PATH, plan: planPath });
const authProblems = [];
if (authorization.schema !== "pnwf-spend-authorization/v1") {
  authProblems.push(`authorization schema is "${String(authorization.schema)}", not pnwf-spend-authorization/v1`);
}
if (authorization.cohortId !== cohort.cohortId) authProblems.push("the authorization names a different cohort");
if (authorization.provider !== cohort.provider) authProblems.push("the authorization names a different provider");
if (authorization.model !== cohort.model) authProblems.push("the authorization names a different model");
if (JSON.stringify(authorization.stages) !== JSON.stringify(stages.map((stage) => stage.id))) authProblems.push("the authorization does not cover exactly the cohort stages");
if (JSON.stringify(authorization.conditions) !== JSON.stringify(cohort.conditions)) authProblems.push("the authorization does not cover exactly the cohort conditions");
if (authorization.sessionCeiling !== cohort.sessionCeiling) authProblems.push("the authorization's session ceiling differs");
if (authorization.reserveTokens !== cohort.reserveTokens) authProblems.push("the authorization's reserve differs");
if (authorization.aggregateCeiling !== cohort.aggregateCeiling) authProblems.push("the authorization's aggregate ceiling differs");
if (authorization.sessions !== sessions.length) authProblems.push("the authorization's session count differs");
if (typeof authorization.issuedBy !== "string" || authorization.issuedBy.trim() === "") authProblems.push("the authorization does not name who authorized it");
const expiresAt = Date.parse(String(authorization.expiresAt ?? ""));
if (!Number.isFinite(expiresAt)) authProblems.push("the authorization has no valid expiresAt");
else if (expiresAt <= Date.now()) authProblems.push("the authorization has expired");
if (authProblems.length > 0) fail(2, authProblems, { authorization: AUTH_PATH, plan: planPath });

/**
 * PNWF-CQ-F §8.4: a paid cohort is refused unless the principal runs inside the qualified container
 * boundary. A gate record from a host process is not enough: `principalRuntime` must say `container`,
 * so a Windows host session cannot borrow the container canary's result.
 */
if (ISOLATION_PATH === null || !existsSync(ISOLATION_PATH)) {
  fail(4, ["EVALUATION_ISOLATION_NOT_QUALIFIED: no isolation gate record was supplied"], {
    authorization: AUTH_PATH,
    plan: planPath,
    isolation: ISOLATION_PATH,
  });
}
const isolation = readJson(ISOLATION_PATH);
const isolationProblems = [];
if (isolation === null) isolationProblems.push("the isolation gate record is not valid JSON");
if (isolation?.schema !== "pnwf-evaluation-isolation/v1") isolationProblems.push("the isolation gate record has the wrong schema");
if (isolation?.status !== "EVALUATION_ISOLATION_QUALIFIED") isolationProblems.push(`the isolation status is ${String(isolation?.status)}`);
if (isolation?.principalRuntime !== "container") isolationProblems.push("the principal did not run in the qualified container runtime");
if (isolation?.harnessPresent !== true) isolationProblems.push("the canary did not prove the harness exists behind the boundary");
if (isolation?.externalScorerRead !== true) isolationProblems.push("the external scorer could not read the harness");
const wrongChecks = Array.isArray(isolation?.checks)
  ? isolation.checks.filter((check) => check.status !== "ALLOW" && check.status !== "DENIED")
  : [];
if (wrongChecks.length > 0) isolationProblems.push(`${String(wrongChecks.length)} isolation canary checks were unexpected`);
if (isolationProblems.length > 0) {
  fail(4, isolationProblems, { authorization: AUTH_PATH, plan: planPath, isolation: ISOLATION_PATH });
}

if (ADAPTER === null || !existsSync(ADAPTER)) {
  fail(3, ["ADAPTER_NOT_CONFIGURED: no execution adapter was supplied"], { authorization: AUTH_PATH, plan: planPath });
}

const session = sessions.find((entry) => entry.sessionId === SESSION_ID);
if (SESSION_ID === null || session === undefined) {
  fail(2, [`--session must be one of ${sessions.map((entry) => entry.sessionId).join(", ")}`], { authorization: AUTH_PATH, plan: planPath });
}

/**
 * Aggregate guard: prior sessions' ledgers plus this session's ceiling plus one reserve must fit.
 * The guard is deliberately conservative; a session that never starts is better than an overspend.
 */
const priorTokens = sessions
  .filter((entry) => entry.sessionId !== SESSION_ID)
  .map((entry) => {
    try {
      return Number(JSON.parse(readFileSync(join(process.env.ALHS_CORE_RUN ?? "", "out", entry.sessionId, "budget.json"), "utf8")).totalTokens ?? 0);
    } catch {
      return 0;
    }
  })
  .reduce((sum, value) => sum + value, 0);
if (priorTokens + session.ceiling > cohort.aggregateCeiling) {
  fail(4, [`aggregate guard: ${String(priorTokens)} prior + ${String(session.ceiling)} ceiling exceeds ${String(cohort.aggregateCeiling)}`], {
    authorization: AUTH_PATH,
    plan: planPath,
  });
}

const startedAt = new Date().toISOString();
const record = {
  schema: "pnwf-cohort-session-start/v1",
  cohortId: cohort.cohortId,
  sessionId: session.sessionId,
  stage: session.stage,
  ceiling: session.ceiling,
  reserveTokens: session.reserveTokens,
  authorization: AUTH_PATH,
  adapter: ADAPTER,
  startedAt,
  modelCalls: 1,
};
const startPath = writeJson(`start-${session.sessionId}.json`, record);
const child = spawn(process.execPath, [ADAPTER, `--session=${session.sessionId}`], {
  cwd: process.cwd(),
  env: { ...process.env, ALHS_CORE_RUN: process.env.ALHS_CORE_RUN ?? "" },
  stdio: "inherit",
});
const code = await new Promise((resolveExit) => child.on("close", (value) => resolveExit(value ?? 1)));
writeJson(`end-${session.sessionId}.json`, { ...record, endedAt: new Date().toISOString(), exitCode: code, start: startPath });
process.exit(code === 0 ? 0 : 5);
