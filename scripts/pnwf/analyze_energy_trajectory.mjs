/** Offline attribution for the six completed energy sessions; emits no request bodies or transcript text. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { zstdDecompressSync } from "node:zlib";

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const FIELDS = {
  fresh: ["input_tokens", "inputTokens"],
  cacheRead: ["cache_read_input_tokens", "cacheReadTokens"],
  cacheWrite: ["cache_creation_input_tokens", "cacheWriteTokens"],
  output: ["output_tokens", "outputTokens"],
};
const [trial, originalT1] = process.argv.slice(2);
assert(trial && originalT1, "Usage: node scripts/pnwf/analyze_energy_trajectory.mjs <paired-run> <original-T1-run>");
const json = path => JSON.parse(readFileSync(path, "utf8"));
const lines = text => text.split(/\r?\n/u).filter(line => line.trim()).map(line => JSON.parse(line));
const bytes = value => Buffer.byteLength(value);
const projectUsage = (usage, source) => Object.fromEntries(Object.entries(FIELDS).map(([key, fields]) => {
  const value = usage?.[fields[source]];
  assert(Number.isSafeInteger(value) && value >= 0, `Missing or invalid ${fields[source]}`);
  return [key, value];
}));
const sum = steps => Object.fromEntries(Object.keys(FIELDS).map(key => [key, steps.reduce((n, step) => n + step[key], 0)]));

// DSH v4 writes one independent zstd frame per event.
function readStream(path, digest) {
  const source = readFileSync(path);
  assert.equal(createHash("sha256").update(source).digest("hex"), digest, "Stream differs from attributed evidence");
  const events = [];
  for (let start = 0; start < source.length;) {
    assert(source.subarray(start, start + MAGIC.length).equals(MAGIC), "Invalid DSH stream frame");
    const next = source.indexOf(MAGIC, start + MAGIC.length);
    const end = next === -1 ? source.length : next;
    events.push(...lines(zstdDecompressSync(source.subarray(start, end)).toString("utf8")));
    start = end;
  }
  return events;
}

const streams = root => readdirSync(root, { recursive: true }).filter(file => file.endsWith(".jsonl.zstd")).sort()
  .map(file => join(root, file));
const messageBytes = message => typeof message?.content === "string" ? bytes(message.content) :
  (message?.content ?? []).reduce((n, block) => n + (block.type === "text" ? bytes(block.text) : 0), 0);

function analyzeSession(arm, session) {
  const stage = join(trial, "live", arm, session);
  const out = join(stage, "out", session);
  const original = arm === "P" && session === "T1" ? join(originalT1, "live/P/T1") : stage;
  const result = json(join(stage, "result.json"));
  assert(result.passed && result.evidence.usageQualified);
  const observations = lines(readFileSync(join(out, "request-observations.jsonl"), "utf8"));
  const admitted = new Map(observations.filter(row => row.kind === "ADMITTED").map(row => [row.requestId, row]));
  const terminal = new Map(observations.filter(row => row.kind === "TERMINAL").map(row => [row.messageId, row]));
  const ledger = json(join(out, "request-accounting.json"));
  const requests = new Map(ledger.requests.map(row => [row.id, row]));
  const expected = result.evidence.requests;
  assert.equal(terminal.size, expected);
  assert.equal(requests.size, expected);
  assert.equal(admitted.size, expected);
  assert.equal(observations.length, expected * 2);
  const timelines = readdirSync(join(out, "attribution")).filter(file => file.endsWith(".timeline.json"))
    .map(file => json(join(out, "attribution", file)).summary);
  const files = [...streams(join(original, `runtime-${session}`, "sessions")), ...result.evidence.workerReceipts.flatMap(receipt =>
    streams(join(out, `worker-${receipt.attemptId}`, "home", "sessions")))];
  const bound = new Set();
  const traces = files.map(file => {
    const id = basename(dirname(file));
    const trace = result.evidence.traces.find(entry => entry.id === id);
    const timeline = timelines.find(entry => entry.session.id === id);
    assert(trace && timeline, "Stream has no recorded attribution");
    const events = readStream(file, trace.digest);
    const eventBySeq = new Map(events.map(event => [event.seq, event]));
    const results = timeline.results.map(row => ({ kind: row.callKind, callSeq: row.callSeq, seq: row.seq,
      textBytes: messageBytes(eventBySeq.get(row.seq)?.data?.message) }));
    let previous = -Infinity;
    const steps = events.filter(event => event.type === "assistant/message" && event.data?.usage).map((event, i) => {
      // For this DSH DeepSeek replay format, the provider response ID is recorded as a replay signature.
      const ids = [...new Set((event.data.message.source?.replayState?.blocks ?? []).map(block => block.signature)
        .filter(id => terminal.has(id)))];
      assert.equal(ids.length, 1, "Model step has no unique provider response ID");
      const observed = terminal.get(ids[0]);
      const record = requests.get(observed.requestId);
      const actor = trace.role === "worker" ? "worker" : "principal-container";
      assert.equal(admitted.get(observed.requestId)?.actor, actor);
      assert.equal(observed.actor, actor);
      assert.equal(record?.state, "SETTLED");
      assert(!bound.has(observed.requestId), "Request bound to more than one model step");
      bound.add(observed.requestId);
      const usage = projectUsage(observed.usage, 0);
      assert.deepEqual(projectUsage(record.usage, 0), usage);
      assert.deepEqual(projectUsage(event.data.usage, 1), usage);
      assert.equal(timeline.modelSteps[i]?.seq, event.seq);
      const precedingResults = results.filter(row => row.seq > previous && row.seq < event.seq);
      previous = event.seq;
      return { step: i + 1, seq: event.seq, requestId: observed.requestId, ...usage, precedingResults };
    });
    assert.equal(steps.length, timeline.modelSteps.length);
    const headers = events.filter(event => event.type === "request/header").map(event => {
      const tools = event.data.header.tools;
      const productTools = tools.filter(tool => tool.name.startsWith("palimpsest_"));
      return { seq: event.seq, tools: tools.length, toolManifestBytes: bytes(JSON.stringify(tools)),
        productTools: productTools.length, productToolBytes: productTools.reduce((n, tool) => n + bytes(JSON.stringify(tool)), 0) };
    });
    return { role: trace.role, sessionId: id, streamSha256: trace.digest, headers,
      systemTextBytes: events.filter(event => event.type === "system/message").map(event => messageBytes(event.data.message)),
      counts: timeline.counts, byKind: timeline.byKind, totals: sum(steps),
      requests: steps.map(({ precedingResults, ...step }) => step),
      largestFresh: [...steps].sort((a, b) => b.fresh - a.fresh).slice(0, 4).map(({ precedingResults, ...step }) => ({
        ...step, precedingResults, precedingTextBytes: precedingResults.reduce((n, row) => n + row.textBytes, 0),
      })),
    };
  });
  assert.equal(bound.size, expected);
  assert.equal(traces.length, result.evidence.traces.length);
  const totals = sum(traces.map(trace => trace.totals));
  assert.deepEqual(totals, projectUsage(result.evidence.usage, 0));
  return { arm, session, boundRequests: bound.size, totals, traces };
}

const sessions = ["T1", "T2", "T3"].flatMap(session => ["P", "F"].map(arm => analyzeSession(arm, session)));
console.log(JSON.stringify({ schema: "pnwf-energy-trajectory-attribution/v1", binding: "provider-response-id",
  boundRequests: sessions.reduce((n, session) => n + session.boundRequests, 0), sessions }, null, 2));
