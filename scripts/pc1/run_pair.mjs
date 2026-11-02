/**
 * PC1 S08 — the paired-condition live runner (gated).
 *
 * It refuses to start a model session without an explicit spend authorization, a provider config and
 * a DSH profile. With all three it records a launch plan and (with --execute) invokes the installed
 * dsh CLI. A blocked launch is a RESOURCE fact, not a model failure.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { readJson, writeJson } from "./lib.mjs";

function arg(name, fallback) {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found === undefined ? fallback : found.slice(`--${name}=`.length);
}

const scenario = arg("scenario", "");
const condition = arg("condition", "");
const runDir = resolve(arg("run", scenario === "field-study" ? join(process.cwd(), ".pc1-rig", "field-study") : join(process.cwd(), ".pc1-rig", "sablewick")));
const authorization = arg("spend-authorization", "");
const providerConfig = arg("provider-config", "");
const profile = arg("profile", "");
const runtime = arg("runtime", process.platform === "win32" ? "windows" : "linux");
const model = arg("model", "");
const execute = process.argv.includes("--execute");
if (scenario !== "sablewick" && scenario !== "field-study") {
  process.stderr.write("usage: node run_pair.mjs --scenario=sablewick|field-study --condition=P|F [--spend-authorization=... --provider-config=... --profile=... --execute]\n");
  process.exit(2);
}
if (condition !== "P" && condition !== "F") {
  process.stderr.write("--condition must be P or F\n");
  process.exit(2);
}

const preparedPath = join(runDir, scenario === "sablewick" ? "prepared.json" : "equivalence.json");
if (!existsSync(preparedPath)) {
  writeJson(join(runDir, "run-blocked.json"), {
    schema: "pc1-run/v1",
    scenario,
    condition,
    state: "BLOCKED",
    reason: "scenario_not_prepared",
    detail: `prepare the scenario first; expected ${preparedPath}`,
  });
  console.log(JSON.stringify({ state: "BLOCKED", reason: "scenario_not_prepared" }));
  process.exit(0);
}
const prepared = readJson(preparedPath);
const world = condition === "P" ? prepared.pWorld : prepared.fWorld;
const missing = [];
if (authorization === "") missing.push("spend authorization");
if (providerConfig === "" || !existsSync(providerConfig)) missing.push("provider configuration");
if (profile === "" || !existsSync(profile)) missing.push("DSH profile");
if (runtime !== "linux" && runtime !== "wsl") missing.push("supported Linux/WSL2 runtime");

const record = {
  schema: "pc1-run/v1",
  at: new Date().toISOString(),
  scenario,
  condition,
  world,
  runtime,
  model: model === "" ? null : model,
  providerConfig: providerConfig === "" ? null : providerConfig,
  profile: profile === "" ? null : profile,
  spendAuthorizationRef: authorization === "" ? null : authorization,
  state: missing.length === 0 ? "READY" : "BLOCKED",
  reason: missing.length === 0 ? "all gates satisfied" : "resource_or_environment_blocked",
  missing,
  executed: false,
};

if (missing.length > 0 || !execute) {
  writeJson(join(runDir, `run-${condition}.json`), record);
  console.log(JSON.stringify({ state: record.state, missing, executed: false }));
  process.exit(0);
}

const result = spawnSync("dsh", ["--profile", profile], {
  cwd: world,
  encoding: "utf8",
  env: {
    ...process.env,
    PC1_SCENARIO: scenario,
    PC1_CONDITION: condition,
    PC1_OBSERVATION_TIME: scenario === "sablewick" ? "2026-02-10T09:05:00Z" : "2026-03-02T09:00:00Z",
  },
  timeout: Number(arg("timeout-ms", "600000")),
});
record.executed = true;
record.exitCode = result.status;
record.stdoutTail = (result.stdout ?? "").slice(-4_000);
record.stderrTail = (result.stderr ?? "").slice(-4_000);
record.state = result.status === 0 ? "EXECUTED" : "FAILED";
writeJson(join(runDir, `run-${condition}.json`), record);
console.log(JSON.stringify({ state: record.state, exitCode: result.status }));
