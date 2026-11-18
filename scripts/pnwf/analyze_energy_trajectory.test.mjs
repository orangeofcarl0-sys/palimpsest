import { deepStrictEqual, equal, throws } from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { zstdCompressSync } from "node:zlib";
import { analyzeAttributedStage } from "./analyze_energy_trajectory.mjs";
import { OPENCODE_GO_MESSAGES } from "./opencode_go.mjs";

const providerFields = ["input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens", "output_tokens"];
const dshFields = ["inputTokens", "cacheReadTokens", "cacheWriteTokens", "outputTokens"];
const usage = (fields, values) => Object.fromEntries(fields.map((name, i) => [name, values[i]]));
const session = "session-principal";

function fixture(t, { tuples = [[100, 0, 40, 9], [100, 40, 0, 9]], dsh = tuples, openCode = true, signatures = [],
  observationOrder = [0, 1, 2, 3], unresolved = 0, misrecord = false } = {}) {
  const stage = mkdtempSync(join(tmpdir(), "pnwf-attribution-"));
  t.after(() => rmSync(stage, { recursive: true, force: true }));
  const source = join(stage, "runtime-T3", "sessions", session);
  const out = join(stage, "out", "T3");
  mkdirSync(source, { recursive: true });
  mkdirSync(join(out, "attribution"), { recursive: true });
  const actor = "principal-container";
  const observations = tuples.flatMap((tuple, i) => [
    { kind: "ADMITTED", requestId: `req-${i}`, actor },
    { kind: "TERMINAL", requestId: `req-${i}`, actor, messageId: `msg_${i}`, usage: usage(providerFields, tuple) },
  ]);
  const events = dsh.map((tuple, i) => ({ type: "assistant/message", seq: i + 1, data: {
    usage: usage(dshFields, tuple), message: { source: { replayState: {
      blocks: (signatures[i] ?? []).map(signature => ({ signature })),
    } } },
  } }));
  const raw = Buffer.concat(events.map(event => zstdCompressSync(JSON.stringify(event) + "\n")));
  writeFileSync(join(source, "messages.jsonl.zstd"), raw);
  writeFileSync(join(out, "request-observations.jsonl"), observationOrder.map(i => JSON.stringify(observations[i])).join("\n"));
  writeFileSync(join(out, "request-accounting.json"), JSON.stringify({ unresolvedRequests: unresolved,
    requests: observations.filter(row => row.kind === "TERMINAL").map((row, i) => ({ id: row.requestId,
      state: "SETTLED", usage: misrecord && i === 1 ? { ...row.usage, output_tokens: 10 } : row.usage })) }));
  writeFileSync(join(out, "attribution", "0.timeline.json"), JSON.stringify({ summary: {
    session: { id: session }, modelSteps: events.map(({ seq }) => ({ seq })), results: [],
  } }));
  const result = { seal: openCode ? { provider: "opencode-go", route: OPENCODE_GO_MESSAGES } : { provider: "deepseek" }, evidence: {
    usageQualified: true, requests: tuples.length, unresolvedRequests: unresolved, workerReceipts: [],
    usage: usage(providerFields, providerFields.map((_, i) => tuples.reduce((n, tuple) => n + tuple[i], 0))),
    traces: [{ id: session, role: "principal", digest: createHash("sha256").update(raw).digest("hex") }],
  } };
  return () => analyzeAttributedStage(stage, "T3", { result });
}

test("attributes an OpenCode Go stream without replay IDs by unique four-field usage", t => {
  const result = fixture(t)();
  equal(result.boundRequests, 2);
  deepStrictEqual(result.totals, { fresh: 200, cacheRead: 40, cacheWrite: 40, output: 18 });
  deepStrictEqual(result.traces[0].requests.map(({ requestId, bindingMethod, providerResponseId }) =>
    [requestId, bindingMethod, providerResponseId]), [
    ["req-0", "unique-usage-tuple", "msg_0"], ["req-1", "unique-usage-tuple", "msg_1"],
  ]);
});

test("preserves ID attribution when usage duplicates, including for OpenCode Go", t => {
  const tuples = [[100, 40, 0, 9], [100, 40, 0, 9]];
  const signatures = [["msg_1"], ["msg_0"]];
  for (const openCode of [true, false]) {
    const result = fixture(t, { tuples, signatures, openCode })();
    deepStrictEqual(result.traces[0].requests.map(row => row.requestId), ["req-1", "req-0"]);
  }
  throws(fixture(t, { tuples, signatures: [["msg_0"]] }), /Ambiguous OpenCode Go usage tuple/u);
});

test("refuses an incomplete, mismatched or ambiguous binding", t => {
  throws(fixture(t, { openCode: false }), /no unique provider response ID/u);
  throws(fixture(t, { signatures: [["msg_0", "msg_1"], ["msg_1"]] }), /no unique provider response ID/u);
  throws(fixture(t, { signatures: [["msg_other"], []] }), /unmatched provider response ID/u);
  throws(fixture(t, { dsh: [[100, 0, 40], [100, 40, 0, 9]] }), /Missing or invalid outputTokens/u);
  throws(fixture(t, { dsh: [[100, 0, 39, 10], [100, 40, 0, 9]] }), /No exact OpenCode Go usage tuple/u);
  throws(fixture(t, { unresolved: 1 }), /requires a single Principal stream and a settled ledger/u);
  throws(fixture(t, { misrecord: true }), /Expected values to be strictly deep-equal/u);
});

test("requires corroborating replay order and sequential gateway requests", t => {
  throws(fixture(t, { dsh: [[100, 40, 0, 9], [100, 0, 40, 9]] }), /out of sequence/u);
  throws(fixture(t, { observationOrder: [0, 2, 1, 3] }), /requires sequential Principal requests/u);
});
