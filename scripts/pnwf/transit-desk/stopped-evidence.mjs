// Account only for observed responses in a stopped session, including isolated native reviewers. Keep the missing terminal explicit.
import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {join} from "node:path";
import {attribute} from "../energy/evidence.mjs";
import {readJson} from "../energy/contract.mjs";
import {readStream} from "../analyze_energy_trajectory.mjs";
import {PAID_MODE} from "../bounded_provider.mjs";

export function stoppedEvidence(run, ledger) {
  const out = join(run, "out/REVIEW");
  const measured = attribute(run, "REVIEW", PAID_MODE);
  assert(!measured.valid && !measured.usageQualified && measured.requestIdsBound && measured.tupleMatch);
  assert(measured.principalId && measured.traces.filter(t => t.id === measured.principalId).length === 1 && !measured.workerRequests);
  const rows = ledger.requests, known = rows.filter(r => r.state === "SETTLED"), missing = rows.filter(r => r.state === "UNKNOWN");
  assert(ledger.state === "STOPPED" && missing.length && missing.length === ledger.unresolvedRequests);
  assert.equal(rows.length, known.length + missing.length);
  assert.equal(known.length, measured.traceRequests);
  assert.equal(ledger.confirmed, measured.traceTotal);
  const obs = readFileSync(join(out, "request-observations.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
  const terminal = obs.filter(o => o.kind === "TERMINAL");
  assert.deepEqual(obs.filter(o => o.kind === "ADMITTED").map(o => o.requestId), rows.map(r => r.id));
  assert.equal(known.length, terminal.length);
  for (const r of missing) assert(r.actual === null && r.usage === null && !terminal.some(o => o.requestId === r.id));
  const root = join(run, "runtime-REVIEW/sessions");
  const streams = readdirSync(root, {recursive: true}).filter(f => f.endsWith(".jsonl.zstd")).sort();
  assert.equal(streams.length, measured.traces.length);
  const bindings = [], seen = new Set();
  const traces = streams.map((file, index) => {
    const trace = measured.traces[index], events = readStream(join(root, file), trace.digest);
    const session = events[0].id, role = trace.role, answers = [];
    assert.equal(session, trace.id);
    for (const e of events.filter(e => e.type === "assistant/message" && e.data.usage)) {
      const u = e.data.usage, message = e.data.message;
      const usage = {input_tokens: u.inputTokens, output_tokens: u.outputTokens,
        cache_read_input_tokens: u.cacheReadTokens ?? 0, cache_creation_input_tokens: u.cacheWriteTokens ?? 0};
      const ids = (message.source?.replayState?.blocks ?? []).map(b => b.signature).filter(id => typeof id === "string" && id.startsWith("msg_"));
      const candidates = terminal.filter(o => o.actor === "principal-container" && Object.keys(usage).every(k => o.usage[k] === usage[k]) &&
        (!ids.length || ids.includes(o.messageId)));
      assert.equal(candidates.length, 1);
      const id = candidates[0].requestId, r = known.find(r => r.id === id);
      assert(r && !seen.has(id));
      assert.deepEqual(r.usage, usage);
      assert.equal(r.actual, Object.values(usage).reduce((a, b) => a + b, 0));
      seen.add(id);
      bindings.push({role, session, seq: e.seq, id, method: ids.length ? "response-id" : "unique-usage", usage});
      const text = message.content.filter(b => b.type === "text").map(b => b.text).join("\n");
      if (text) answers.push({seq: e.seq, text});
    }
    const timeline = readJson(join(out, "attribution", String(index) + ".timeline.json")).summary;
    const bySeq = new Map(events.map(e => [e.seq, e]));
    const calls = timeline.calls.map(c => {
      const e = bySeq.get(c.seq), r = timeline.results.find(r => r.callId === c.callId && r.callSeq === c.seq);
      let input = e.data.arguments;
      try { input = JSON.parse(input); } catch {}
      return {seq: c.seq, at: e.time, callId: c.callId, tool: e.data.name, input, resultSeq: r?.seq ?? null,
        ok: r?.ok ?? null, refusal: r?.refusal ?? null, reply: (bySeq.get(r?.seq)?.data.message.content ?? [])
          .filter(b => b.type === "text").map(b => b.text).join("\n").slice(0, 4200)};
    });
    return {role, session, calls, answers,
      tools: events.find(e => e.type === "request/header")?.data.header.tools.map(t => t.name) ?? []};
  });
  assert.equal(seen.size, known.length);
  return {requests: rows.length, unknown: missing.length, missing, total: null, usage: measured.usage, confirmed: ledger.confirmed,
    elapsedMs: measured.elapsedMs, usageQualified: false, bindings, traces};
}
