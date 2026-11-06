/** Zero-paid qualification of the real adapter and recorded worlds. No production credential read. */
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ExecutionBudget } from "./execution_budget.mjs";
import { startMockProvider } from "./mock_provider.mjs";

const args = new Map(process.argv.slice(2).map(arg => { const [key, ...v] = arg.replace(/^--/u, "").split("="); return [key, v.join("=")]; }));
const repo = process.cwd();
const evidence = resolve(args.get("out") ?? "research-evidence/pnwf-cq-r1/2026-11-07/container");
mkdirSync(dirname(evidence), { recursive: true });
mkdirSync(evidence); // Never replace a previous qualification, including a failed one.
const write = (p, value) => writeFileSync(p, JSON.stringify(value, null, 2) + "\n");
const read = path => JSON.parse(readFileSync(path, "utf8"));
const spawnNode = (argv, env) => new Promise((resolveExit, reject) => {
  const child = spawn(process.execPath, argv, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; }); child.stderr.on("data", chunk => { stderr += chunk; });
  child.once("error", reject); child.once("close", code => resolveExit({ code, stdout, stderr }));
});
async function scenario(name) {
  const broken = name === "broken-alternates";
  const run = mkdtempSync(join(tmpdir(), "pnwf-r1-" + name + "-"));
  const out = join(evidence, name); mkdirSync(out, { recursive: true });
  execFileSync(process.execPath, ["scripts/pnwf/prepare_continuation.mjs", "--run=" + run, "--repo=" + repo], { stdio: "pipe", timeout: 60000 });
  const core = read(join(run, "core.json")); core.cohortId = "pnwf-r1-" + name;
  core.sessions.forEach(s => { s.killAfterMs = 60000; }); write(join(run, "core.json"), core);
  const ceiling = name === "large-request" ? 200000 : name === "late-usage-next-request" ? 400000 : 1000000;
  const reserve = 1000;
  const config = { schema: "pnwf-request-budget/v1", cohortId: core.cohortId, aggregateCeiling: ceiling * 2,
    sessions: core.sessions.map(s => ({ id: s.id, ceiling, softCeiling: ceiling - reserve })) };
  const budgetPath = join(run, "request-budget.sqlite");
  ExecutionBudget.initialize(budgetPath, config).close();
  const cohort = { schema: "pnwf-qualification-cohort/v1", cohortId: core.cohortId,
    stages: core.sessions.map(s => ({ id: s.id })), sessionCeiling: ceiling, reserveTokens: reserve, aggregateCeiling: ceiling * 2 };
  const cohortPath = join(run, "cohort.json"); write(cohortPath, cohort);
  if (broken) {
    const worlds = join(run, "stages/software/world/.palimpsest/worlds");
    const attempt = readdirSync(worlds, { withFileTypes: true }).find(e => e.isDirectory());
    writeFileSync(join(worlds, attempt.name, ".git/objects/info/alternates"), "C:/unavailable-original-host/.git/objects\n");
  }
  const mock = await startMockProvider({ delayMs: 150, fault: name === "interrupted-stream" ? "interrupt" : null,
    reply: (_input, index) => name === "large-response" ? [{ type: "text", text: "x".repeat(300000) }]
      : index % 2 === 0 ? [{ type: "tool_use", id: "qualification_status_" + index, name: "palimpsest_work", input: { action: "status" } }]
      : [{ type: "text", text: "Deterministic status observation complete." }],
  });
  const providerFile = join(run, "mock-instance.json"); write(providerFile, mock.config);
  const env = { ALHS_CORE_RUN: run, PNWF_BUDGET_DB: budgetPath, PNWF_PROVIDER_CONFIG: providerFile };
  const outcomes = [];
  try {
    for (const session of core.sessions) {
      const result = await spawnNode(["scripts/pnwf/run_pnwf_live.mjs", "--cohort=" + cohortPath, "--mode=mock",
        "--out=" + join(run, "out/gate"), "--adapter=" + join(repo, "scripts/pnwf/container_adapter.mjs"), "--execute", "--session=" + session.id], env);
      outcomes.push({ sessionId: session.id, exitCode: result.code });
      writeFileSync(join(out, session.id + "-runner.log"), result.stdout + result.stderr);
      for (const file of ["qualification.json", "run.json", "budget.json", "request-accounting.json", "run.log", "run.err"]) {
        try { copyFileSync(join(run, "out", session.id, file), join(out, session.id + "-" + file)); } catch { /* pre-spawn rejection */ }
      }
      if (result.code !== 0) break; // actual cohort orchestration stops here
    }
    const budget = new ExecutionBudget(budgetPath);
    const accounting = budget.snapshot(); budget.close();
    const expected = mock.calls.reduce((n, call) => n + call.total, 0);
    const stopped = outcomes.length === 1 && outcomes[0].exitCode !== 0 && accounting.state === "STOPPED" && accounting.sessions[1].state === "NOT_STARTED";
    const invariant = accounting.confirmed + accounting.reserved <= config.aggregateCeiling && accounting.sessions.every(s => s.confirmed + s.reserved <= s.softCeiling);
    const observedStatuses = mock.calls.flatMap(call => call.toolResults).filter(result => !result.isError && result.statusObserved).length;
    const passed = invariant && (name === "recorded-worlds"
      ? outcomes.length === 2 && outcomes.every(s => s.exitCode === 0) && mock.calls.length === 4 && observedStatuses === 2 && accounting.confirmed === expected && accounting.reserved === 0
      : stopped && (broken || name === "large-request" ? mock.requests.length === 0
        : name === "late-usage-next-request" ? mock.requests.length === 1 && accounting.confirmed === expected && accounting.reserved === 0 && accounting.reason === "BUDGET_EXHAUSTED"
        : mock.requests.length === 1 && accounting.confirmed === 0 && accounting.reserved > 0));
    const record = { schema: "pnwf-container-qualification/v1", name, passed, run, outcomes, mockRequests: mock.calls.length,
      attemptedRequests: mock.requests, calls: mock.calls, observedStatuses, mockTokenTotal: expected, invariant, paidModelCalls: 0, accounting };
    write(join(out, "result.json"), record);
    return record;
  } finally { await mock.close(); }
}
const results = [];
for (const name of args.has("negative-only") ? ["broken-alternates"] : ["recorded-worlds", "broken-alternates", "large-request", "late-usage-next-request", "interrupted-stream", "large-response"]) {
  const result = await scenario(name);
  results.push(result); process.stdout.write(JSON.stringify({ name, passed: result.passed, mockRequests: result.mockRequests, run: result.run }) + "\n");
  if (!result.passed) break;
}
write(join(evidence, "summary.json"), { schema: "pnwf-container-qualification-summary/v1", paidModelCalls: 0, results });
process.exitCode = results.every(r => r.passed) ? 0 : 1;
