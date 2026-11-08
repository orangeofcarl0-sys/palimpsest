import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { zstdCompressSync } from "node:zlib";

const script = fileURLToPath(new URL("./session_attribution.mjs", import.meta.url));
const start = 1794070100000;
const event = (type, data) => ({ type, data });
const call = (callId, name = "bash", args = {}) => event("tool/call", { callId, name, arguments: JSON.stringify(args) });
const reply = (callId, content, { legacy = false, isError = false } = {}) => event("tool/result", {
  ...(legacy && { toolCallId: callId }),
  message: {
    ...(!legacy && { toolCallId: callId }),
    content: [{ type: "text", text: typeof content === "string" ? content : JSON.stringify(content) }],
    isError,
  },
});
const register = (jobId, callId) => event("job/registered", {
  jobId, kind: "bash", startedAt: start, toolCall: { callId },
});
const settle = (jobId, status, detail, duration = 50) => event("job/settled", {
  jobId, kind: "bash", status, detail, startedAt: start, finishedAt: start + duration,
});

function replay(events) {
  const directory = mkdtempSync(join(tmpdir(), "psvr-attribution-"));
  const input = join(directory, "session.zstd");
  const prefix = join(directory, "replay");
  const stream = [
    { type: "session", version: 4, id: "fixture", cwd: "/run/stage/world", createdAt: start },
    ...events.map((entry, i) => ({ ...entry, seq: i + 1, time: start + i * 100 })),
  ];
  try {
    writeFileSync(input, Buffer.concat(stream.map(entry => zstdCompressSync(Buffer.from(JSON.stringify(entry) + "\n")))));
    execFileSync(process.execPath, [script, input, prefix], { stdio: "pipe", timeout: 10000 });
    return {
      ...JSON.parse(readFileSync(prefix + ".timeline.json", "utf8")),
      markdown: readFileSync(prefix + ".timeline.md", "utf8"),
    };
  } finally {
    for (const path of [input, prefix + ".timeline.json", prefix + ".timeline.md"]) rmSync(path, { force: true });
    rmdirSync(directory);
  }
}

test("pairs parallel results by nested DSH v4 or legacy ID and exposes conflicting IDs", () => {
  const conflict = reply("inspect", "ambiguous");
  conflict.data.toolCallId = "read";
  const { summary } = replay([
    call("inspect", "palimpsest_work", { action: "status" }), call("read", "read"),
    reply("read", "file contents", { legacy: true }), reply("inspect", { state: "OK" }),
    conflict,
  ]);
  assert.deepEqual(summary.results.map(r => [r.callId, r.callSeq, r.callKind]), [
    ["read", 2, "read"], ["inspect", 1, "work:status"], [null, null, null],
  ]);
  assert.equal(summary.counts.pairedToolResults, 2);
  assert.equal(summary.counts.unpairedToolResults, 1);
});

test("distinguishes dirty World and zero delta refusals, counting only repeat reasons on the same target", () => {
  const relay = (id, taskId = "grpc-contract") => call(id, "palimpsest_work", { action: "relay", taskId, relayRoute: "takeover" });
  const dirty = { state: "NOT_READY", detail: "NOT_READY: the world still holds work that is not committed: README.md" };
  const empty = { state: "NOT_READY", detail: "NOT_READY: the world holds no observable change against its base, so there is nothing to settle" };
  const { summary, markdown } = replay([
    relay("dirty"), reply("dirty", dirty), relay("empty"), reply("empty", empty),
    relay("other", "grpc-service"), reply("other", empty), relay("repeat"), reply("repeat", empty),
  ]);
  assert.deepEqual(summary.results.map(r => [r.refusal, r.refusalReason, r.refusalDetail]), [
    ["NOT_READY", "UNCOMMITTED_WORK", dirty.detail],
    ...Array.from({ length: 3 }, () => ["NOT_READY", "NO_SETTLEABLE_DELTA", empty.detail]),
  ]);
  assert.equal(summary.counts.domainRefusals, 4);
  assert.equal(summary.counts.repeatedRefusals, 1);
  assert.match(markdown, /REFUSED \(UNCOMMITTED_WORK\)/u);
  assert.match(markdown, /REFUSED \(NO_SETTLEABLE_DELTA\)/u);
});

test("attributes a killed probe with an earlier stderr exception to its Bash call", () => {
  const { summary, markdown } = replay([
    call("probe"), register("probe-job", "probe"),
    reply("probe", "[stderr]\nError [ERR_STREAM_WRITE_AFTER_END]: write after end\n[still running after 120000ms; moved to background job probe-job]"),
    call("stop", "job_kill"), reply("stop", "requested cancellation"),
    settle("probe-job", "killed", "signal: SIGTERM", 121500),
    call("server"), register("server-job", "server"),
    reply("server", "[stderr]\nlistening\n[stdout]\nError [EXPECTED_DIAGNOSTIC]: simulated"),
    settle("server-job", "killed", "signal: SIGTERM"),
  ]);
  assert.equal(summary.counts.toolErrors, 0);
  assert.equal(summary.counts.jobFailures, 1);
  assert.equal(summary.counts.noProgressToolCalls, 1);
  assert.deepEqual(summary.failedJobs, [{
    jobId: "probe-job", status: "killed", reason: "ERR_STREAM_WRITE_AFTER_END", callId: "probe", callSeq: 1,
    callKind: "bash", resultSeq: 3, settledSeq: 6, durationMs: 121500,
  }]);
  assert.match(markdown, /JOB_FAILED: ERR_STREAM_WRITE_AFTER_END/u);
});

test("counts a failed process and its tool error as one no-progress call", () => {
  const { summary } = replay([
    call("test"), register("test-job", "test"), settle("test-job", "completed", "exit code: 1"),
    reply("test", "the command failed", { isError: true }),
    call("stop"), register("stop-job", "stop"), settle("stop-job", "killed", "signal: SIGTERM"),
    reply("stop", "cancelled", { isError: true }),
  ]);
  assert.equal(summary.counts.toolErrors, 2);
  assert.equal(summary.counts.jobFailures, 1);
  assert.equal(summary.counts.noProgressToolCalls, 2);
  assert.equal(summary.failedJobs[0].reason, "NONZERO_EXIT");
  assert.equal(summary.failedJobs[0].callSeq, 1);
});
