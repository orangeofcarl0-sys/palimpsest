import assert from "node:assert/strict";
import {existsSync, readFileSync} from "node:fs";
import {join, resolve} from "node:path";
import {readJson, writeJson} from "../energy/contract.mjs";

const root = resolve(process.argv[2]);
const matrix = readJson(join(root, "matrix.json"));
const rows = matrix.order.map(({task, arm}) => {
  const name = task + "-" + arm;
  const dir = join(root, name);
  if (!matrix.started.some(s => s.name === name)) return {name, state: "NOT_STARTED"};
  const result = readJson(join(dir, "result.json"));
  const t = readJson(join(dir, "trajectory.json"));
  const ledger = readJson(join(dir, "out/REVIEW/request-accounting.json"));
  const obs = readFileSync(join(dir, "out/REVIEW/request-observations.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
  const receipts = join(dir, "out/REVIEW/worker-receipts.json");
  const draft = existsSync(join(dir, "draft.json")) ? readJson(join(dir, "draft.json")) : null;
  const settled = ledger.requests.filter(r => r.state === "SETTLED");
  const terminal = obs.filter(o => o.kind === "TERMINAL");
  assert.equal(terminal.length, settled.length);
  const byId = new Map(terminal.map(o => [o.requestId, o]));
  for (const r of settled) assert.deepEqual(r.usage, byId.get(r.id)?.usage);
  const roles = t.traces.map(trace => ({
    role: trace.role, id: trace.session, requests: t.bindings.filter(b => b.session === trace.session).length,
    usage: Object.fromEntries(Object.keys(t.usage).map(key => [key, t.bindings
      .filter(b => b.session === trace.session).reduce((sum, b) => sum + b.usage[key], 0)])),
    tools: trace.calls.length, paired: trace.calls.filter(c => c.resultSeq !== null).length,
    refusals: trace.calls.filter(c => c.refusal || c.ok === false).map(c => ({seq: c.seq, tool: c.tool, refusal: c.refusal})),
    coordination: trace.calls.filter(c => /^(subagent|workflow|palimpsest_)/.test(c.tool))
      .map(c => ({seq: c.seq, tool: c.tool, action: c.input?.action, intent: c.input?.intent, resultSeq: c.resultSeq})),
  }));
  const money = field => terminal.length > 0 && terminal.every(o => Number.isFinite(o.providerBilling?.[field]))
    ? terminal.reduce((sum, o) => sum + o.providerBilling[field], 0) : null;
  return {name, state: result.natural ? "NATURAL" : "STOPPED", basis: result.basis, candidate: result.candidate,
    checks: result.grade.checks, automatedPass: result.grade.automatedPass, changes: result.changed, commits: result.commits,
    workingDraft: draft ? {diagnostic: draft.diagnostic, paths: draft.paths, checks: draft.grade.checks} : null,
    clean: !result.status.trim(), conclusion: result.conclusion?.intent ?? null, stop: result.stop, roles,
    workers: existsSync(receipts) ? readJson(receipts) : [], admitted: ledger.requests.length, settled: settled.length,
    unknown: ledger.unresolvedRequests, confirmed: ledger.confirmed, total: ledger.unresolvedRequests ? null : ledger.confirmed,
    usage: t.usage, elapsedMs: t.elapsedMs, providerCostForSettled: money("cost"), providerListCostForSettled: money("listCost"),
    billingSources: [...new Set(terminal.map(o => o.providerBilling?.billingSource))]};
});
const totalsByArm = Object.fromEntries(["P", "F"].map(arm => {
  const launched = rows.filter(r => r.name.endsWith("-" + arm) && r.state !== "NOT_STARTED");
  const sum = field => launched.reduce((n, r) => n + r[field], 0);
  const usage = Object.fromEntries(["input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens", "output_tokens"]
    .map(key => [key, launched.reduce((n, r) => n + r.usage[key], 0)]));
  return [arm, {started: launched.length, admitted: sum("admitted"), settled: sum("settled"), unknown: sum("unknown"),
    confirmed: sum("confirmed"), total: sum("unknown") ? null : sum("confirmed"), usage, elapsedMs: sum("elapsedMs"),
    pairedTools: launched.flatMap(r => r.roles).reduce((n, r) => n + r.paired, 0)}];
}));
writeJson(join(root, "comparison.json"), {base: matrix.base, window: matrix.window, rows, totalsByArm});
