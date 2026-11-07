/**
 * PNWF execution admission. Old isolation JSON and arbitrary adapters grant no permission.
 * Zero-cost qualification: --mode=mock --execute --session=<id>, using a preinitialized shared ledger.
 * Explicit real continuation: --mode=paid-usage-only --execute with a fresh metered cohort.
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { ExecutionBudget } from "./execution_budget.mjs";
import { PAID_MODE, PAID_COHORT_SCHEMA, readDeepSeekKey, verifyMock } from "./bounded_provider.mjs";

const args = new Map(process.argv.slice(2).map(arg => {
  const [key, ...value] = arg.replace(/^--/u, "").split("="); return [key, value.join("=")];
}));
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(args.get("out") ?? ".");
const write = (name, value) => { mkdirSync(out, { recursive: true }); writeFileSync(join(out, name), JSON.stringify(value, null, 2) + "\n"); };
const mode = args.get("mode") ?? "paid";
const paid = mode === PAID_MODE;
let budget, sessionStarted = false, sessionId = args.get("session");
try {
  if (!args.get("cohort")) throw new Error("COHORT_REQUIRED");
  const cohort = JSON.parse(readFileSync(resolve(args.get("cohort")), "utf8"));
  if (!/^[\w.-]+$/u.test(cohort.cohortId ?? "") || !Array.isArray(cohort.stages) || !cohort.stages.length) throw new Error("INVALID_COHORT");
  if (paid) {
    if (cohort.schema !== PAID_COHORT_SCHEMA || cohort.billingCeiling !== null || cohort.stages.length !== 1 ||
        !Number.isSafeInteger(cohort.maxRequests) || cohort.maxRequests <= 0 ||
        !Number.isSafeInteger(cohort.wallClockMs) || cohort.wallClockMs <= 0 || cohort.wallClockMs > 3600000) throw new Error("INVALID_PAID_COHORT");
  } else if (!["pnwf-continuation-cohort/v1", "pnwf-qualification-cohort/v1"].includes(cohort.schema) ||
      !Number.isSafeInteger(cohort.aggregateCeiling) || cohort.aggregateCeiling <= 0 ||
      !Number.isSafeInteger(cohort.sessionCeiling) || !Number.isSafeInteger(cohort.reserveTokens) ||
      cohort.sessionCeiling <= cohort.reserveTokens || cohort.reserveTokens < 0) throw new Error("INVALID_COHORT");
  const ids = cohort.stages.map(s => s.id);
  if (new Set(ids).size !== ids.length || ids.some(id => !/^[\w.-]+$/u.test(id))) throw new Error("INVALID_SESSION_IDS");
  write("plan.json", { schema: "pnwf-cohort-plan/v2", cohortId: cohort.cohortId, sessions: ids, modelCalls: 0,
    mode, aggregateCeiling: paid ? null : cohort.aggregateCeiling,
    ...(paid && { billingCeiling: null, maxRequests: cohort.maxRequests, wallClockMs: cohort.wallClockMs }) });
  if (!args.has("execute")) {
    process.stdout.write("PLAN_ONLY: no model call\n");
  } else {
    if (!paid && mode !== "mock") throw new Error("PROVIDER_BOUND_UNQUALIFIED: bounded execution only supports Mock; paid execution requires an explicit paid-usage-only cohort");
    const expectedAdapter = realpathSync(join(here, "container_adapter.mjs"));
    if (!args.get("adapter") || !existsSync(args.get("adapter")) || realpathSync(resolve(args.get("adapter"))) !== expectedAdapter) throw new Error("ADAPTER_NOT_QUALIFIED");
    if (!ids.includes(sessionId)) throw new Error("INVALID_SESSION");
    if (!process.env.ALHS_CORE_RUN || !process.env.PNWF_BUDGET_DB || (!paid && !process.env.PNWF_PROVIDER_CONFIG)) throw new Error("QUALIFICATION_CONFIGURATION_REQUIRED");
    const core = JSON.parse(readFileSync(join(process.env.ALHS_CORE_RUN, "core.json"), "utf8"));
    if (core.cohortId !== cohort.cohortId || JSON.stringify(core.sessions.map(s => s.id)) !== JSON.stringify(ids)) throw new Error("PREPARATION_COHORT_MISMATCH");
    budget = new ExecutionBudget(process.env.PNWF_BUDGET_DB);
    if (budget.usageOnly !== paid || budget.config.cohortId !== cohort.cohortId ||
        JSON.stringify(budget.config.sessions.map(s => s.id)) !== JSON.stringify(ids)) throw new Error("BUDGET_COHORT_MISMATCH");
    if (paid) {
      if (core.budget !== null || core.sessions[0].killAfterMs !== cohort.wallClockMs || budget.config.sessions[0].maxRequests !== cohort.maxRequests) throw new Error("METERING_COHORT_MISMATCH");
      readDeepSeekKey();
    } else {
      if (budget.config.aggregateCeiling !== cohort.aggregateCeiling ||
          budget.config.sessions.some(s => s.ceiling !== cohort.sessionCeiling || s.softCeiling !== cohort.sessionCeiling - cohort.reserveTokens)) throw new Error("BUDGET_COHORT_MISMATCH");
      await verifyMock(JSON.parse(readFileSync(process.env.PNWF_PROVIDER_CONFIG, "utf8")));
    }
    budget.startSession(sessionId); sessionStarted = true;
    write("start-" + sessionId + ".json", { schema: "pnwf-cohort-session-start/v2", cohortId: cohort.cohortId,
      sessionId, adapter: expectedAdapter, mode, budgetDigest: budget.digest, paidModelCalls: 0, startedAt: new Date().toISOString() });
    const child = spawn(process.execPath, [expectedAdapter, "--session=" + sessionId, "--mode=" + mode], { stdio: "inherit",
      env: { ...process.env, ALHS_CORE_RUN: resolve(process.env.ALHS_CORE_RUN) } });
    const code = await new Promise((resolveExit, reject) => { child.once("error", reject); child.once("close", code => resolveExit(code ?? 1)); });
    const state = budget.snapshot();
    if (code !== 0 || state.state !== "OPEN" || state.sessions.find(s => s.id === sessionId)?.state !== "ENDED") throw new Error("SESSION_FAILED: all later sessions are blocked");
    write("end-" + sessionId + ".json", { schema: "pnwf-cohort-session-end/v2", cohortId: cohort.cohortId,
      sessionId, exitCode: code, accounting: state, paidModelCalls: paid ? state.requests.length : 0 });
  }
} catch (error) {
  let ledgerError = null;
  let paidModelCalls = sessionStarted && paid ? null : 0;
  if (sessionStarted) {
    try {
      budget.stop(error.code ?? error.message);
      const observed = budget.snapshot();
      if (paid && observed.unresolvedRequests === 0) paidModelCalls = observed.requests.length;
    } catch (failure) { ledgerError = failure.code ?? failure.message; }
  }
  write("BLOCKED.json", { schema: "pnwf-cohort-blocked/v2", sessionId: sessionId ?? null,
    reason: error.code ?? error.message, detail: error.message, ledgerError, paidModelCalls, blockedAt: new Date().toISOString() });
  process.stderr.write("run_pnwf_live: " + error.message + "\n");
  process.exitCode = 5;
} finally { budget?.close(); }
