import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readStream } from "../analyze_energy_trajectory.mjs";
import { grade } from "./judge.mjs";
import { digest, readJson } from "./tools.mjs";

const directory = process.argv[2];
assert(directory, "Usage: local-equipment/verify.mjs <evidence-directory>");
const root = resolve(directory);
const hash = (path) => digest(readFileSync(path));
const frozen = readJson(join(root, "frozen.json"));
const original = readJson(join(root, "frozen-original.json"));
assert.equal(hash(join(root, "frozen-original.json")), frozen.firstFreeze);
assert.deepEqual(original.inputs, frozen.inputs);
for (const [name, expected] of Object.entries(frozen.source)) {
  let actual = hash(join(import.meta.dirname, name));
  if (actual !== expected && name === "tools.mjs") {
    const repo = resolve(import.meta.dirname, "../../..");
    actual = digest(execFileSync("git", ["show", "4ae167a2:scripts/pnwf/local-equipment/tools.mjs"], { cwd: repo, windowsHide: true }));
  }
  assert.equal(actual, expected, "frozen source differs: " + name);
  if (!["tools.mjs", "workbook.mjs"].includes(name)) assert.equal(original.source[name], expected);
}
for (const [name, digest] of Object.entries(frozen.inputs)) assert.equal(hash(join(root, "inputs", name)), digest);

const evidence = readJson(join(root, "mock", "evidence.json"));
assert.deepEqual(evidence.receipt, readJson(join(root, "mock", "gap", "receipt.json")));
const contract = readJson(join(import.meta.dirname, "contract.json"));
const result = readJson(join(root, "mock", "result.json"));
assert.deepEqual(grade(contract, evidence), { pass: result.pass, checks: result.checks });
assert(result.pass && evidence.controls.workspaceFileScope && result.actualPaidRequests === 0);
if (result.controls.toolOwnedReceiptCitation !== undefined) {
  const { pending, resumed, decision, receipt, versionHistory } = evidence;
  assert(result.controls.decisionOnlyRestore && result.controls.reviewSupersession && result.controls.toolOwnedReceiptCitation);
  assert.equal(decision.revision, pending.saved.basis.revision + 1);
  assert.deepEqual(resumed.restored, pending.saved);
  assert.equal(resumed.saved.basis.revision, decision.revision);
  const write = resumed.calls.find((call) => call.args.action === "write_recommendation");
  const resolve = resumed.calls.find((call) => call.args.action === "resolve_review");
  assert.deepEqual([write.args.receiptId, write.args.evidence, write.result.logger[4]], [receipt.id, "", receipt.id]);
  assert.deepEqual(write.result.next.at(-1).args, resolve.args);
  assert.equal(versionHistory.replacement.resolution.detail, receipt.id + " applied in " + resumed.saved.id);
}

let settled = 0;
for (const [relative, recorded] of [
  ["sufficient/initial", evidence.direct],
  ["gap/initial", evidence.pending],
  ["gap/resumed", evidence.resumed],
]) {
  const stage = join(root, "mock", relative);
  assert.deepEqual(readJson(join(stage, "session.json")), recorded);
  const path = join(stage, "session.jsonl.zstd");
  const events = new Map(readStream(path, hash(path)).map((event) => [event.seq, event]));
  const userTurns = [...events.values()].filter((event) => event.type === "user/message" && event.data.source.kind === "user");
  assert.equal(userTurns.length, 1);
  assert(userTurns[0].data.content.map((block) => block.text).join("").endsWith(contract.goal));
  for (const call of recorded.calls) {
    const observed = events.get(call.actualCall);
    const returned = events.get(call.actualResult);
    assert.equal(observed.type, "tool/call");
    assert.equal(observed.data.callId, call.id);
    assert.equal(observed.data.name, call.name);
    assert.deepEqual(JSON.parse(observed.data.arguments), call.args);
    assert.equal(returned.type, "tool/result");
    assert.equal(returned.data.message.toolCallId, call.id);
    assert(!returned.data.message.isError);
    assert.deepEqual(JSON.parse(returned.data.message.content.map((block) => block.text).join("")), call.result);
  }
  const ledger = readJson(join(stage, "request-accounting.json"));
  assert(ledger.unresolvedRequests === 0 && ledger.requests.every((request) => request.state === "SETTLED"));
  assert.equal(ledger.requests.length, recorded.mockRequests);
  assert.equal(ledger.confirmed, recorded.ledger.confirmed);
  settled += ledger.requests.length;
  assert.equal(hash(join(stage, contract.workbook)), recorded.final.digest);
}
assert.equal(settled, result.mockRequests);
console.log(JSON.stringify({ pass: true, checks: Object.keys(result.checks).length, settled, actualPaidRequests: 0 }));
