/** Pair each DSH stream independently, then reconcile actor usage with the common gateway ledger. */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { USAGE_FIELDS } from "../execution_budget.mjs";
import { assert, digest, readJson } from "./contract.mjs";

const ATTRIBUTION = fileURLToPath(new URL("../../psvr/session_attribution.mjs", import.meta.url));
const streams = path => !existsSync(path) ? [] : readdirSync(path, { recursive: true })
  .filter(file => file.endsWith(".jsonl.zstd")).sort().map(file => join(path, file));

function principalSession(path, arm) {
  if (!existsSync(path)) return null;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/u)) {
    if (arm === "P" && line.startsWith("PALIMPSEST_HOST_READY ")) return JSON.parse(line.slice("PALIMPSEST_HOST_READY ".length)).sessionId;
    if (arm !== "F" || !line.startsWith("{")) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === "session" && typeof event.sessionId === "string") return event.sessionId;
    } catch { /* unrelated runner output */ }
  }
  return null;
}

const DSH_USAGE = { input_tokens: "inputTokens", cache_read_input_tokens: "cacheReadTokens",
  cache_creation_input_tokens: "cacheWriteTokens", output_tokens: "outputTokens" };
const tokenKey = usage => USAGE_FIELDS.map(key => usage[key] ?? 0).join("/");

export function attribute(run, id, mode) {
  const out = join(run, "out", id);
  const dir = join(out, "attribution");
  mkdirSync(dir);
  const execution = readJson(join(out, "run.json"));
  const principalId = principalSession(join(out, "run.log"), execution.condition);
  const accounting = readJson(join(out, "request-accounting.json"));
  const path = join(out, "request-observations.jsonl");
  const gateway = existsSync(path) ? readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
  const workerReceipts = existsSync(join(out, "worker-receipts.json")) ? readJson(join(out, "worker-receipts.json")) : [];
  const workerPaths = workerReceipts.filter(row => row.attemptId).flatMap(row => streams(join(out, `worker-${row.attemptId}`, "home", "sessions")));
  const inputs = [...streams(join(run, `runtime-${id}`, "sessions")), ...workerPaths];
  const traces = inputs.map((input, index) => {
    const prefix = join(dir, String(index));
    execFileSync(process.execPath, [ATTRIBUTION, input, prefix], { stdio: ["ignore", "ignore", "pipe"], timeout: 15000 });
    const trace = readJson(`${prefix}.timeline.json`).summary;
    const role = workerPaths.includes(input) ? "worker" : trace.session.id === principalId ? "principal" : "native-child";
    const counts = trace.counts;
    return { id: trace.session.id, cwd: trace.session.cwd, role, digest: digest(readFileSync(input)), counts,
      refs: trace.results.filter(result => result.refusal !== null || !result.ok).map(result => ({ callId: result.callId, seq: result.seq,
        kind: result.callKind, state: result.state, reason: result.refusalReason, detail: result.refusalDetail })),
      failedJobs: trace.failedJobs, modelSteps: trace.modelSteps, byKind: trace.byKind };
  });
  const terminal = new Map(gateway.filter(row => row.kind === "TERMINAL").map(row => [row.requestId, row]));
  const admitted = new Map(gateway.filter(row => row.kind === "ADMITTED").map(row => [row.requestId, row]));
  const requestIdsBound = accounting.requests.every(row => admitted.has(row.id) && (row.state !== "SETTLED" || terminal.has(row.id))) &&
    admitted.size === accounting.requests.length && terminal.size === accounting.requests.filter(row => row.state === "SETTLED").length;
  const usageByRole = {};
  for (const trace of traces) {
    const role = usageByRole[trace.role] ??= { requests: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0, total: 0 };
    for (const step of trace.modelSteps) {
      role.requests += 1;
      for (const [field, key] of Object.entries({ input: "inputTokens", cacheRead: "cacheReadTokens", cacheWrite: "cacheWriteTokens", output: "outputTokens", total: "totalTokens" })) {
        role[field] += step.usage[key] ?? 0;
      }
    }
  }
  const workerRequests = [...admitted.values()].filter(row => row.actor === "worker").length;
  const usage = Object.fromEntries(USAGE_FIELDS.map(key => [key, [...terminal.values()].reduce((sum, row) => sum + (row.usage?.[key] ?? 0), 0)]));
  const traceTotal = Object.values(usageByRole).reduce((sum, role) => sum + role.total, 0);
  const traceRequests = Object.values(usageByRole).reduce((sum, role) => sum + role.requests, 0);
  const tupleMatch = ["worker", "principal-container"].every(actor => {
    const ledger = [...terminal.values()].filter(row => row.actor === actor).map(row => tokenKey(row.usage)).sort();
    const observed = traces.filter(trace => (trace.role === "worker") === (actor === "worker")).flatMap(trace => trace.modelSteps)
      .map(step => tokenKey(Object.fromEntries(USAGE_FIELDS.map(key => [key, step.usage[DSH_USAGE[key]]])))).sort();
    return ledger.length === observed.length && ledger.every((entry, index) => entry === observed[index]);
  });
  const usageQualified = requestIdsBound && accounting.unresolvedRequests === 0 && traceTotal === accounting.confirmed &&
    traceRequests === accounting.requests.length && (usageByRole.worker?.requests ?? 0) === workerRequests && tupleMatch;
  const principalFound = traces.filter(trace => trace.role === "principal").length === 1;
  const valid = principalFound && usageQualified && execution.natural;
  return { valid, principalId, usageQualified, requestIdsBound, tupleMatch, mode, requests: accounting.requests.length,
    knownTokens: accounting.confirmed, totalTokens: accounting.unresolvedRequests === 0 ? accounting.confirmed : null,
    unresolvedRequests: accounting.unresolvedRequests, usage, usageByRole, traceTotal, traceRequests, workerRequests,
    elapsedMs: Date.parse(execution.endedAt) - Date.parse(execution.startedAt), natural: execution.natural, stop: execution.killedBy,
    error: execution.error, workerReceipts, traces };
}

export function requireUsage(evidence) {
  assert(evidence.valid, `SESSION_EVIDENCE_INCOMPLETE natural=${evidence.natural} trace=${evidence.traceTotal} ledger=${evidence.knownTokens} requests=${evidence.traceRequests}/${evidence.requests} worker=${evidence.workerRequests} error=${evidence.error}`);
}
