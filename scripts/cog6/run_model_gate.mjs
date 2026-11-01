/**
 * COG-6 model gate runner — no model is started here.
 *
 *   node scripts/cog6/run_model_gate.mjs --selftest=<dir>
 *       Exercises the budget controller against a local dummy child.
 *
 *   node scripts/cog6/run_model_gate.mjs --gate=<probe-result.json> --run=<dir>
 *       Reads the recorded provider gate. When it is BLOCKED, writes a BLOCKED campaign record and
 *       starts nothing. It never re-probes the provider on its own.
 */
import { join } from "node:path";
import { budgetSelfTest, readProviderGate, runCampaign, writeJson } from "./model_conditions.mjs";

function parse(argv) {
  const options = { selftest: null, gate: null, run: null };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--selftest=")) options.selftest = arg.slice("--selftest=".length);
    else if (arg.startsWith("--gate=")) options.gate = arg.slice("--gate=".length);
    else if (arg.startsWith("--run=")) options.run = arg.slice("--run=".length);
    else throw new Error(`unknown argument ${arg}`);
  }
  return options;
}

const options = parse(process.argv);

if (options.selftest !== null) {
  const result = await budgetSelfTest(options.selftest);
  writeJson(join(options.selftest, "budget-self-test.json"), result);
  console.log(JSON.stringify({ ok: result.killed === true, ...result }, null, 2));
}

if (options.gate !== null) {
  if (options.run === null) throw new Error("--run=<dir> is required with --gate");
  const gate = readProviderGate(options.gate);
  const record = await runCampaign({ providerGatePath: options.gate, runDir: options.run });
  console.log(JSON.stringify({ gate: gate.state, campaign: record.state, startedSessions: record.startedSessions }, null, 2));
}
