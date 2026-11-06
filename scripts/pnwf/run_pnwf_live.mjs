/**
 * PNWF execution admission. Old isolation JSON and arbitrary adapters grant no permission.
 * Paid providers are deliberately blocked until a request-bound contract is qualified.
 * Zero-cost qualification: --mode=mock --execute --session=<id>, using a preinitialized shared ledger.
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { ExecutionBudget } from "./execution_budget.mjs";
import { verifyMock } from "./bounded_provider.mjs";

const args = new Map(process.argv.slice(2).map(arg => {
  const [key, ...value] = arg.replace(/^--/u, "").split("="); return [key, value.join("=")];
}));
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(args.get("out") ?? ".");
const write = (name, value) => { mkdirSync(out, { recursive: true }); writeFileSync(join(out, name), JSON.stringify(value, null, 2) + "\n"); };
let budget, sessionStarted = false, sessionId = args.get("session");
try {
  if (!args.get("cohort")) throw new Error("COHORT_REQUIRED");
  const cohort = JSON.parse(readFileSync(resolve(args.get("cohort")), "utf8"));
  if (!["pnwf-continuation-cohort/v1", "pnwf-qualification-cohort/v1"].includes(cohort.schema) ||
      !/^[\w.-]+$/u.test(cohort.cohortId ?? "") || !Array.isArray(cohort.stages) || !cohort.stages.length ||
      !Number.isSafeInteger(cohort.aggregateCeiling) || cohort.aggregateCeiling <= 0 ||
      !Number.isSafeInteger(cohort.sessionCeiling) || !Number.isSafeInteger(cohort.reserveTokens) ||
      cohort.sessionCeiling <= cohort.reserveTokens || cohort.reserveTokens < 0) throw new Error("INVALID_COHORT");
  const ids = cohort.stages.map(s => s.id);
  if (new Set(ids).size !== ids.length || ids.some(id => !/^[\w.-]+$/u.test(id))) throw new Error("INVALID_SESSION_IDS");
  write("plan.json", { schema: "pnwf-cohort-plan/v2", cohortId: cohort.cohortId, sessions: ids, modelCalls: 0,
    mode: args.get("mode") ?? "paid", aggregateCeiling: cohort.aggregateCeiling });
  if (!args.has("execute")) {
    process.stdout.write("PLAN_ONLY: no model call\n");
  } else {
    if (args.get("mode") !== "mock") throw new Error("PROVIDER_BOUND_UNQUALIFIED: paid execution requires a proven request bound and new owner authorization; neither old authorization nor isolation JSON enables it");
    const expectedAdapter = realpathSync(join(here, "container_adapter.mjs"));
    if (!args.get("adapter") || !existsSync(args.get("adapter")) || realpathSync(resolve(args.get("adapter"))) !== expectedAdapter) throw new Error("ADAPTER_NOT_QUALIFIED");
    if (!ids.includes(sessionId)) throw new Error("INVALID_SESSION");
    if (!process.env.ALHS_CORE_RUN || !process.env.PNWF_BUDGET_DB || !process.env.PNWF_PROVIDER_CONFIG) throw new Error("QUALIFICATION_CONFIGURATION_REQUIRED");
    const core = JSON.parse(readFileSync(join(process.env.ALHS_CORE_RUN, "core.json"), "utf8"));
    if (core.cohortId !== cohort.cohortId || JSON.stringify(core.sessions.map(s => s.id)) !== JSON.stringify(ids)) throw new Error("PREPARATION_COHORT_MISMATCH");
    const provider = JSON.parse(readFileSync(process.env.PNWF_PROVIDER_CONFIG, "utf8"));
    await verifyMock(provider);
    budget = new ExecutionBudget(process.env.PNWF_BUDGET_DB);
    if (budget.config.cohortId !== cohort.cohortId || budget.config.aggregateCeiling !== cohort.aggregateCeiling ||
        JSON.stringify(budget.config.sessions.map(s => s.id)) !== JSON.stringify(ids) ||
        budget.config.sessions.some(s => s.ceiling !== cohort.sessionCeiling || s.softCeiling !== cohort.sessionCeiling - cohort.reserveTokens)) throw new Error("BUDGET_COHORT_MISMATCH");
    budget.startSession(sessionId); sessionStarted = true;
    write("start-" + sessionId + ".json", { schema: "pnwf-cohort-session-start/v2", cohortId: cohort.cohortId,
      sessionId, adapter: expectedAdapter, budgetDigest: budget.digest, paidModelCalls: 0, startedAt: new Date().toISOString() });
    const child = spawn(process.execPath, [expectedAdapter, "--session=" + sessionId], { stdio: "inherit",
      env: { ...process.env, ALHS_CORE_RUN: resolve(process.env.ALHS_CORE_RUN) } });
    const code = await new Promise((resolveExit, reject) => { child.once("error", reject); child.once("close", code => resolveExit(code ?? 1)); });
    const state = budget.snapshot();
    if (code !== 0 || state.state !== "OPEN" || state.sessions.find(s => s.id === sessionId)?.state !== "ENDED") throw new Error("SESSION_FAILED: all later sessions are blocked");
    write("end-" + sessionId + ".json", { schema: "pnwf-cohort-session-end/v2", cohortId: cohort.cohortId,
      sessionId, exitCode: code, accounting: state, paidModelCalls: 0 });
  }
} catch (error) {
  let ledgerError = null;
  if (sessionStarted) { try { budget.stop(error.code ?? error.message); } catch (failure) { ledgerError = failure.code ?? failure.message; } }
  write("BLOCKED.json", { schema: "pnwf-cohort-blocked/v2", sessionId: sessionId ?? null,
    reason: error.code ?? error.message, detail: error.message, ledgerError, paidModelCalls: 0, blockedAt: new Date().toISOString() });
  process.stderr.write("run_pnwf_live: " + error.message + "\n");
  process.exitCode = 5;
} finally { budget?.close(); }
