import assert from "node:assert/strict";
import { mkdtempDisposableSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { MaintenanceFailures, repeatedFailure } from "./failure-investigation.mjs";
import { inspectFailureSession, probeCounts } from "./github-failure-evidence.mjs";
import { MaintenanceSlot, sealOf } from "./slot.mjs";

const hash = letter => letter.repeat(64);
const basis = "a".repeat(40);
const release = { candidate: basis, buildSha256: hash("b"), image: "sha256:" + hash("c") };
const input = { project: "maintenance-cases", work: "first", attempt: "first-attempt", release,
  archive: hash("d"), target: { kind: "git", basis, candidate: "e".repeat(40) },
  verdict: { state: "REJECTED", reason: "persisted-candidate" } };
const rejection = (id, codes) => {
  const facts = { case: id, findings: codes.map(code => ({ code, state: "REPRODUCED", blocking: true })) };
  return { facts, seal: sealOf(facts) };
};

test("case intake, immutable investigation receipts, routing and accepted readback survive reopen", () => {
  using root = mkdtempDisposableSync(join(tmpdir(), "maintenance-case-"));
  const path = join(root.path, "slot.sqlite");
  let slot = new MaintenanceSlot(path, { projectId: input.project, mode: "mock", initial: release });
  try {
    let cases = new MaintenanceFailures(slot);
    const id = cases.intake(input);
    assert.equal(cases.intake(input), id);
    assert.throws(() => cases.intake({ ...input, target: { ...input.target, basis: "f".repeat(40) } }),
      /MAINTENANCE_FAILURE_TARGET_REQUIRED/u);
    assert.throws(() => cases.intake({ ...input, target: { ...input.target, candidate: "9".repeat(40) } }),
      /MAINTENANCE_FAILURE_INPUT_CHANGED/u);
    const receipt = rejection(id, ["WRITE_SCOPE"]);
    assert.throws(() => cases.report(id, { ...receipt, seal: hash("0") }), /MAINTENANCE_INVESTIGATION_RECEIPT_CHANGED/u);
    assert.equal(cases.report(id, receipt), true);
    slot.close();
    slot = new MaintenanceSlot(path);
    cases = new MaintenanceFailures(slot);
    assert.equal(cases.report(id, receipt), false);
    assert.equal(cases.route(id, { state: "FOLLOWUP_REGISTERED", work: "repair" }), true);
    assert.equal(cases.route(id, { state: "FOLLOWUP_REGISTERED", work: "repair" }), false);
    assert.throws(() => cases.route(id, { state: "FOLLOWUP_REGISTERED", work: "duplicate" }),
      /MAINTENANCE_INVESTIGATION_STAGE_CHANGED/u);
    assert.equal(cases.close(id, { work: "repair", accepted: release, pass: true }), true);
    assert.equal(cases.close(id, { work: "repair", accepted: release, pass: true }), false);
    assert.deepEqual(cases.list()[0].readback.accepted, release);
    assert.equal(slot.view().events.filter(event => event.type === "MAINTENANCE_INVESTIGATION_QUEUED").length, 1);
    assert.deepEqual(repeatedFailure(receipt, rejection("later", ["COMMIT_ATTRIBUTION", "WRITE_SCOPE"])), ["WRITE_SCOPE"]);
  } finally { slot.close(); }
});

test("offline ledger read distinguishes no call, provider UNKNOWN and settled usage with missing attribution", () => {
  using root = mkdtempDisposableSync(join(tmpdir(), "maintenance-ledger-"));
  const ledger = join(root.path, "request-ledger.sqlite");
  const db = new DatabaseSync(ledger);
  db.exec("CREATE TABLE requests (id TEXT, state TEXT, actual INTEGER)");
  const evidence = { sources: { "request-ledger.sqlite": true } };
  assert.equal(inspectFailureSession(root.path, evidence).accounting.usage, "ZERO_REQUESTS");
  db.prepare("INSERT INTO requests VALUES (?, ?, ?)").run("a", "UNKNOWN", null);
  assert.equal(inspectFailureSession(root.path, evidence).accounting.usage, "UNKNOWN");
  db.exec("UPDATE requests SET state='SETTLED', actual=21");
  db.close();
  writeFileSync(join(root.path, "session.json"), JSON.stringify({ accounting: { confirmed: 21, requests: 1 }, attributionState: "INCOMPLETE" }));
  evidence.sources["session.json"] = true;
  assert.deepEqual(inspectFailureSession(root.path, evidence).accounting, {
    requests: 1, settled: 1, unknown: 0, confirmed: 21, bound: null, usage: "SETTLED", attribution: "INCOMPLETE",
  });
  assert.deepEqual(probeCounts("# tests 4\n# pass 4\n# fail 0\n# skipped 0"), { tests: 4, passed: 4, failed: 0, skipped: 0 });
});
