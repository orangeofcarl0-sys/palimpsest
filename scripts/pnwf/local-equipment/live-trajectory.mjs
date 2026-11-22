import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readStream } from "../analyze_energy_trajectory.mjs";
import { USAGE_FIELDS } from "../execution_budget.mjs";
import { digest } from "./tools.mjs";

const replayFields = ["inputTokens", "cacheReadTokens", "cacheWriteTokens", "outputTokens"];
const text = (message) => (message?.content ?? []).filter((block) => block.type === "text").map((block) => block.text).join("");

export function readEquipmentTrace(path, goal) {
  const streamSha256 = digest(readFileSync(path));
  const events = readStream(path, streamSha256);
  const user = events.filter((event) => event.type === "user/message" && event.data.source?.kind === "user");
  const toolSets = events.filter((event) => event.type === "request/header").map(({ data }) =>
    data.header.tools.map((tool) => tool.name).sort());
  const results = events.filter((event) => event.type === "tool/result");
  const byId = new Map(results.map((event) => [event.data.message.toolCallId, event]));
  assert.equal(byId.size, results.length, "duplicate tool results");
  const ids = new Set();
  const calls = events.filter((event) => event.type === "tool/call").map(({ seq, data }) => {
    const id = data.callId;
    assert(id && !ids.has(id), "missing or duplicate tool call ID");
    ids.add(id);
    const result = byId.get(id);
    assert(!result || result.seq > seq, "tool result precedes the call");
    const output = text(result?.data.message);
    let value = output;
    try { value = JSON.parse(output); } catch { /* Many ordinary DSH tools return text. */ }
    return { id, seq, name: data.name, args: JSON.parse(data.arguments), resultSeq: result?.seq ?? null,
      ok: result ? !result.data.message.isError : false, result: value };
  });
  const steps = events.filter((event) => event.type === "assistant/message" && event.data.usage);
  const completions = events.filter((event) => event.type === "turn/end" && event.data.reason?.kind === "completed");
  return { streamSha256, sessionId: events.find((event) => event.type === "session")?.id,
    goalMatches: user.length === 1 && text(user[0].data).endsWith(goal), toolSets, calls,
    orphanResults: [...byId.keys()].filter((id) => !ids.has(id)), steps, completed: completions.length === 1,
    finalText: text(steps.at(-1)?.data.message) };
}

export function reconcileEquipmentUsage(ledger, observed, trace) {
  const admitted = observed.filter((row) => row.kind === "ADMITTED");
  const terminal = observed.filter((row) => row.kind === "TERMINAL");
  const starts = new Map(admitted.map((row) => [row.requestId, row]));
  const ends = new Map(terminal.map((row) => [row.requestId, row]));
  assert.equal(starts.size, admitted.length, "duplicate provider admission");
  assert.equal(ends.size, terminal.length, "duplicate provider terminal");
  assert.equal(starts.size, ledger.requests.length, "provider admissions differ from SQLite");
  const totals = Object.fromEntries(USAGE_FIELDS.map((field) => [field, 0]));
  const requests = [];
  for (const [index, row] of ledger.requests.entries()) {
    const start = starts.get(row.id);
    assert.equal(start?.actor, "principal-container");
    const end = ends.get(row.id);
    assert.equal(end !== undefined, row.state === "SETTLED", "terminal settlement differs from SQLite");
    if (end) {
      assert.equal(end.actor, start.actor);
      assert.deepEqual(row.usage, end.usage);
      for (const field of USAGE_FIELDS) totals[field] += row.usage[field];
    }
    requests.push({ ordinal: index + 1, id: row.id, state: row.state, reason: row.reason, actual: row.actual, usage: row.usage,
      providerResponseId: end?.messageId ?? null, elapsedMs: end ? end.atMs - start.atMs : null,
      providerBilling: end?.providerBilling ?? null });
  }
  assert.equal(requests.filter((row) => row.state === "SETTLED").length, terminal.length);
  assert.equal(Object.values(totals).reduce((n, value) => n + value, 0), ledger.confirmed);

  let bindingError = null;
  const bindings = [];
  if (ledger.unresolvedRequests === 0 && trace) {
    try {
      assert.equal(trace.steps.length, requests.length, "DSH step count differs from settled requests");
      const byResponse = new Map(requests.map((row) => [row.providerResponseId, row]));
      assert(byResponse.size === requests.length && !byResponse.has(null) && !byResponse.has(""), "provider response IDs are incomplete");
      const used = new Set();
      for (const [i, step] of trace.steps.entries()) {
        const usage = Object.fromEntries(USAGE_FIELDS.map((field, index) => [field, step.data.usage[replayFields[index]]]));
        const blocks = step.data.message.source?.replayState?.blocks ?? [];
        const signatures = blocks.map((block) => block.signature).filter((value) => typeof value === "string");
        const ids = [...new Set(signatures.filter((id) => byResponse.has(id)))];
        assert(ids.length <= 1, "DSH step has multiple provider response IDs");
        let match = byResponse.get(ids[0]);
        if (!match) {
          assert(!signatures.some((value) => value.startsWith("msg_")), "DSH replay has an unmatched provider response ID");
          assert.equal(observed.length, 2 * requests.length, "tuple fallback requires complete observations");
          assert(requests.every((row, j) => observed[2 * j] === starts.get(row.id) && observed[2 * j + 1] === ends.get(row.id)),
            "tuple fallback requires sequential admission and terminal observations");
          const matches = requests.filter((row) => USAGE_FIELDS.every((field) => row.usage[field] === usage[field]));
          assert(matches.length === 1 && matches[0] === requests[i], "missing, ambiguous, or reordered usage tuple");
          match = matches[0];
        }
        assert.deepEqual(usage, match.usage);
        assert(!used.has(match.id), "provider request already attributed to a DSH step");
        used.add(match.id);
        bindings.push({ ordinal: match.ordinal, requestId: match.id, seq: step.seq, method: ids.length ? "response-id" : "unique-usage-tuple" });
      }
    } catch (error) { bindingError = error.message; }
  }
  return { requests, totals, confirmed: ledger.confirmed, unresolved: ledger.unresolvedRequests, bindings, bindingError };
}
