/**
 * Request-budgeted provider entry. Legacy credential/environment-only launch is refused.
 * A paid provider must first acquire a provable executable bound; none is qualified today.
 * This compatibility filename remains for old callers, which now fail closed before any network call.
 */
import { readFileSync } from "node:fs";
import { ExecutionBudget } from "../pnwf/execution_budget.mjs";
import { startBoundedProxy } from "../pnwf/bounded_provider.mjs";

let budget;
try {
  if (!process.env.PNWF_BUDGET_DB || !process.env.PNWF_PROVIDER_CONFIG || !process.env.PNWF_SESSION_ID || !process.env.PNWF_SESSION_KEY) {
    throw new Error("REQUEST_BUDGET_REQUIRED: legacy provider-only launch is disabled; use the qualified PNWF runner");
  }
  budget = new ExecutionBudget(process.env.PNWF_BUDGET_DB);
  const proxy = await startBoundedProxy({
    provider: JSON.parse(readFileSync(process.env.PNWF_PROVIDER_CONFIG, "utf8")),
    budget, sessionId: process.env.PNWF_SESSION_ID, sessionKey: process.env.PNWF_SESSION_KEY,
    port: Number(process.env.C6R_PROXY_PORT ?? 0),
  });
  process.stdout.write(JSON.stringify({ status: "READY", url: proxy.url, paidProvider: false }) + "\n");
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, async () => {
    await proxy.close(); budget.close(); process.exit(0);
  });
} catch (error) {
  budget?.close();
  process.stderr.write((error.code ?? "PROVIDER_NOT_QUALIFIED") + ": " + error.message + "\n");
  process.exitCode = 2;
}
