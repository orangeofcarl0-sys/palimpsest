/** Offline Energy attribution by provider response ID; emits no request bodies or transcript text. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { zstdDecompressSync } from "node:zlib";
import { briefPulse } from "./energy/context-variants.mjs";

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const FIELDS = {
  fresh: ["input_tokens", "inputTokens"],
  cacheRead: ["cache_read_input_tokens", "cacheReadTokens"],
  cacheWrite: ["cache_creation_input_tokens", "cacheWriteTokens"],
  output: ["output_tokens", "outputTokens"],
};
const json = path => JSON.parse(readFileSync(path, "utf8"));
const optionalJson = path => existsSync(path) ? json(path) : null;
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
const messageText = message => typeof message?.content === "string" ? message.content :
  (message?.content ?? []).filter(block => block.type === "text").map(block => block.text).join("");

function contextActivity(timeline, eventBySeq) {
  const paired = new Map(timeline.results.map(result => [result.callId, result]));
  return timeline.calls.flatMap(call => {
    const result = paired.get(call.callId);
    const message = eventBySeq.get(result?.seq)?.data?.message;
    const text = messageText(message);
    const name = call.kind.split(" ", 1)[0];
    let kind;
    if (name === "palimpsest_revision_review") kind = call.args?.path ? "file-expansion" : "receipt";
    else if (name === "work:run" && text.includes("pnwf-energy-revision-receipt/v1")) kind = "receipt";
    else if (name === "continuity:pulse") kind = call.args?.detail === "full" ? "pulse-expansion" :
      /"presentation"\s*:\s*"brief"/u.test(text) ? "brief-pulse" : "pulse";
    else if (name === "bash" && /^diff --git /mu.test(text)) {
      kind = /^diff --git a\/deliverables\//mu.test(text) ? "revision-patch" : "other-patch";
    }
    else if (name === "bash" && /\bgit\s+[^\n;]*\bdiff\b[^\n;]*--\s+deliverables\/vendor-compliance\.md\s*(?:;|$)/u.test(call.args?.command)) {
      kind = "certificate-diff";
    } else if (name === "bash" && /\b(?:cat|for)\b[^\n;]*(?:deliverables|sources)\/\*/u.test(call.args?.command)) kind = "bulk-read";
    else if (name === "read" && /(?:^|\/)(?:deliverables|sources|updates)\//u.test(call.args?.file_path)) kind = "file-read";
    else return [];
    const ok = result?.ok === true && result.refusal === null;
    let binding;
    if (ok && (kind === "receipt" || kind === "file-expansion")) {
      const value = JSON.parse(text);
      const { basis, candidate } = value.revisionReceipt ?? value;
      assert(/^[a-f0-9]{40}$/u.test(basis) && /^[a-f0-9]{40}$/u.test(candidate), "Missing commit binding in revision review");
      if (kind === "file-expansion") assert(basis === call.args.basis && candidate === call.args.candidate && value.path === call.args.path,
        "File expansion differs from the requested binding");
      binding = { basis, candidate };
    }
    return [{ kind, callId: call.callId, callSeq: call.seq, resultSeq: result?.seq ?? null, ok, textBytes: messageBytes(message),
      ...(binding ? { binding } : {}),
      ...(kind === "pulse-expansion" && ok ? { offlineBriefBytes: bytes(JSON.stringify(briefPulse(JSON.parse(text)), null, 2)) } : {}),
      ...(kind === "file-read" ? { path: call.args.file_path.replace(/^\/run\/stage\/world\//u, "") } : {}),
      ...(kind === "file-expansion" ? { path: call.args.path } : {}),
    }];
  });
}

function analyzeSession(trial, arm, session, originalT1) {
  const stage = join(trial, "live", arm, session);
  const out = join(stage, "out", session);
  const context = originalT1 === undefined;
  const original = arm === "P" && session === "T1" ? join(originalT1, "live/P/T1") : stage;
  const result = json(join(stage, "result.json"));
  assert((context || result.passed) && result.evidence.usageQualified);
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
  const roots = [join(original, `runtime-${session}`, "sessions"), ...result.evidence.workerReceipts.map(receipt =>
    join(out, `worker-${receipt.attemptId}`, "home", "sessions"))];
  const files = roots.filter(path => !context || existsSync(path)).flatMap(streams);
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
      ...(context ? { activity: contextActivity(timeline, eventBySeq), failedJobs: timeline.failedJobs.map(job => ({
        callSeq: job.callSeq, resultSeq: job.resultSeq, settledSeq: job.settledSeq, reason: job.reason,
      })), toolIssues: timeline.results.filter(row => row.refusal !== null || !row.ok).map(row => ({
        callId: row.callId, callSeq: row.callSeq, resultSeq: row.seq, kind: row.callKind, state: row.state,
        refusal: row.refusal, reason: row.refusalReason ?? null,
      })) } : {}),
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

function mockQualification(root) {
  const sessions = ["T1", "T2", "T3"].map(session => {
    const result = json(join(root, "mock/P", session, "result.json"));
    assert(result.passed && result.evidence.valid && result.evidence.mode === "mock");
    return { session, requests: result.evidence.requests, checks: result.checks,
      ...(session === "T2" ? { context: result.evidence.traces.map(trace => ({ role: trace.role, actions: trace.contextActions })) } : {}),
    };
  });
  return { paidModelCalls: 0, sessions };
}

function compareT2([control, ...trials]) {
  assert(control, "Provide the successful T2 control followed by any context trials");
  const resultSha256 = createHash("sha256").update(readFileSync(join(control, "live/P/T2/result.json"))).digest("hex");
  const reference = json(join(control, "live/P/T2/result.json"));
  assert(reference.passed && reference.evidence.valid, "T2 control must be qualified and successful");
  const names = new Set();
  const comparisons = [control, ...trials].map((root, index) => {
    const stage = join(root, "live/P/T2");
    const contract = json(join(root, "contract.json"));
    const treatment = index === 0 ? "control" : contract.contextVariant?.name;
    assert(treatment && !names.has(treatment), "Missing or duplicate T2 treatment");
    names.add(treatment);
    const qualification = json(join(root, "qualification.json"));
    if (index > 0) assert(qualification.passed && qualification.paidModelCalls === 0 &&
      contract.contextVariant.approvedBasis === reference.basis && contract.contextVariant.controlResultSha256 === resultSha256,
      "Treatment differs from its qualified T2 control");
    const resultPath = join(stage, "result.json");
    const result = json(resultPath);
    assert(result.basis === reference.basis && result.mode === "paid-usage-only" && result.arm === "P" && result.session === "T2");
    const candidate = optionalJson(join(stage, "candidate.json"));
    const acceptance = optionalJson(join(root, "live/P/T3/acceptance.json"));
    if (acceptance) assert(candidate && acceptance.approvedCandidate === candidate.commit);
    if (candidate) assert(result.passed && candidate.basis === reference.basis && candidate.commit === result.business.commit);
    const recount = optionalJson(join(stage, "offline-candidate-verification.json"));
    if (recount) assert(!result.passed && recount.originalResultSha256 === createHash("sha256").update(readFileSync(resultPath)).digest("hex") &&
      recount.basis === result.basis && result.evidence.workerReceipts.some(row => row.result === recount.commit));
    const evidence = result.evidence;
    const attribution = evidence?.usageQualified ? analyzeSession(root, "P", "T2") : null;
    if (candidate && attribution) for (const trace of attribution.traces) for (const action of trace.activity) {
      if (action.binding) assert.deepEqual(action.binding, { basis: candidate.basis, candidate: candidate.commit });
    }
    const fallback = evidence ? null : optionalJson(join(stage, "out/T2/request-accounting.json"));
    return { treatment, seal: qualification.seal, promptSha256: contract.revisionScope.workT2Prompt,
      ...(index > 0 ? { qualification: mockQualification(root) } : {}),
      result: result.passed ? "PASSED" : "STOPPED", reason: result.reason ?? null, checks: result.checks,
      conclusion: result.facts?.conclusion?.intent ?? null, canonicalHead: result.facts?.head ?? null,
      elapsedMs: evidence?.elapsedMs ?? null,
      ledger: evidence ? { requests: evidence.requests, unresolved: evidence.unresolvedRequests, qualified: evidence.usageQualified,
        confirmedTokens: evidence.knownTokens, usage: evidence.usage } : fallback ? { requests: fallback.requests.length,
        unresolved: fallback.unresolvedRequests, qualified: false, confirmedTokens: fallback.confirmed, usage: null } : null,
      workers: (evidence?.workerReceipts ?? []).map(({ attemptId, basis, result, paths, outcome, exit }) =>
        ({ attemptId, basis, result, paths, outcome, exit })),
      candidate: candidate ? { commit: candidate.commit, gate: candidate.gate, tree: candidate.tree, readyAt: candidate.readyAt,
        changedPaths: candidate.changedPaths, certificateBlob: candidate.artifacts["deliverables/vendor-compliance.md"],
        north: candidate.recommendation.north, harbor: candidate.recommendation.harbor, totalUsd: candidate.recommendation.totalUsd,
        schedule: result.business.schedule,
        workerExit: candidate.receipt.exit, workerResult: candidate.receipt.outcome } : null,
      ...(recount ? { offlineCandidateVerification: recount } : {}),
      acceptance: acceptance ? { approvedCandidate: acceptance.approvedCandidate, approvedHead: acceptance.approvedHead, waitMs: acceptance.waitMs } : null,
      attribution,
    };
  });
  const contract = json(join(control, "contract.json"));
  return { schema: "pnwf-energy-t2-context-comparison/v1", binding: "provider-response-id", basis: reference.basis,
    model: contract.model, dsh: contract.dsh, image: contract.image, scorer: contract.scorer, window: contract.window,
    controlResultSha256: resultSha256, comparisons };
}

const [trial, originalT1, ...more] = process.argv.slice(2);
if (trial === "--t2-context") {
  console.log(JSON.stringify(compareT2([originalT1, ...more]), null, 2));
} else {
  assert(trial && originalT1, "Usage: node scripts/pnwf/analyze_energy_trajectory.mjs <paired-run> <original-T1-run>");
  const sessions = ["T1", "T2", "T3"].flatMap(session => ["P", "F"].map(arm => analyzeSession(trial, arm, session, originalT1)));
  console.log(JSON.stringify({ schema: "pnwf-energy-trajectory-attribution/v1", binding: "provider-response-id",
    boundRequests: sessions.reduce((n, session) => n + session.boundRequests, 0), sessions }, null, 2));
}
