import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempDisposableSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gzipSync } from "node:zlib";
import test from "node:test";
import { MaintenanceFailures, repeatedFailure } from "./failure-investigation.mjs";
import { readProjectIndex } from "../../../../host/dsh/lib/project_index.js";
import { digest } from "../../energy/contract.mjs";
import { inspectFailureSession, probeCounts, readFailureEvidence, readStoppedDraft } from "./github-failure-evidence.mjs";
import { GitHubMaintenance, githubWindow } from "./github-maintenance.mjs";
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

test("a stopped draft verifies new seals and can attach to the legacy case without changing it", () => {
  using root = mkdtempDisposableSync(join(tmpdir(), "maintenance-draft-bytes-"));
  const work = { id: "first", attempt: input.attempt, releaseAtDispatch: release, state: "PAUSED", reason: "USAGE_UNCONFIRMED",
    spec: { paths: ["fix.mjs"] }, seal: hash("8") };
  const path = join(root.path, "working.patch"), patch = Buffer.from("original draft");
  const untracked = gzipSync(Buffer.alloc(1024));
  writeFileSync(path, patch);
  writeFileSync(join(root.path, "untracked.tar.gz"), untracked);
  mkdirSync(join(root.path, "stages", "MAINTAIN", "state"), { recursive: true });
  writeFileSync(join(root.path, "submission-facts.json"), JSON.stringify({
    submission: { candidate: basis, basis, status: " M fix.mjs", valid: false, bundleSha256: null },
  }));
  const evidence = readFailureEvidence(root.path, work, input.project);
  const recorded = { id: "case", input: evidence, report: rejection("case", ["USAGE_UNKNOWN"]) };
  const current = readStoppedDraft(root.path, work, recorded);
  assert.deepEqual(current.binding.files, { patch: digest(patch), untracked: digest(untracked) });
  assert.equal(current.binding.checkpoint, evidence.checkpoint);
  const sources = { "submission-facts.json": evidence.sources["submission-facts.json"] };
  const legacy = { ...recorded, input: { ...evidence, sources, archive: sealOf({ sources, settlement: null }) } };
  assert.equal(readStoppedDraft(root.path, work, legacy), null);
  const attestation = { case: legacy.id, archive: legacy.input.archive, files: current.binding.files };
  assert.equal(readStoppedDraft(root.path, work, legacy, attestation).binding.archive, legacy.input.archive);
  assert.throws(() => readStoppedDraft(root.path, work, legacy, { ...attestation, archive: hash("0") }),
    /GITHUB_STOPPED_DRAFT_LEGACY_ATTESTATION_CHANGED/u);
  writeFileSync(path, "different draft");
  assert.throws(() => readStoppedDraft(root.path, work, recorded), /GITHUB_FAILURE_ARCHIVE_CHANGED/u);
  assert.throws(() => readStoppedDraft(root.path, work, legacy, attestation), /GITHUB_STOPPED_DRAFT_LEGACY_ATTESTATION_CHANGED/u);
  writeFileSync(join(root.path, "submission-facts.json"), JSON.stringify({
    submission: { candidate: basis, basis, status: "?? outside.mjs", valid: false, bundleSha256: null },
  }));
  const outside = { ...recorded, input: readFailureEvidence(root.path, work, input.project) };
  assert.equal(readStoppedDraft(root.path, work, outside).binding.refusal, "GITHUB_STOPPED_DRAFT_SCOPE_CHANGED");
});

test("UNKNOWN leaves one durable draft handoff across three lost acknowledgements and no paid redispatch", async () => {
  using root = mkdtempDisposableSync(join(tmpdir(), "maintenance-draft-resident-"));
  const path = join(root.path, "slot.sqlite");
  const scope = { projectId: input.project, mode: "mock" };
  let slot = new MaintenanceSlot(path, { projectId: input.project, mode: "mock", initial: release });
  const cuts = ["draft-sealed", "draft-replayed", "draft-handoff-written"];
  const pending = new Set(cuts);
  const capsule = join(root.path, "result.json");
  const published = new Set();
  let isolatedRuns = 0, dispatched = 0;
  const runtime = {
    failureEvidence: work => ({ ...input, work: work.id, attempt: work.attempt, issue: 298,
      target: { kind: "git", basis, candidate: basis }, checkpoint: hash("d"), verdict: { state: "PAUSED", reason: "USAGE_UNCONFIRMED" } }),
    investigateFailure: failure => rejection(failure.id, ["USAGE_UNKNOWN"]),
    captureStoppedDraft: (failure, work) => ({ case: failure.id, archive: failure.input.archive, attempt: work.attempt, release,
      checkpoint: failure.input.checkpoint, investigation: failure.report.seal, contract: work.seal, files: { patch: hash("a"), untracked: hash("b") } }),
    replayStoppedDraft: (failure, _work, draft) => {
      if (existsSync(capsule)) return JSON.parse(readFileSync(capsule));
      isolatedRuns += 1;
      const facts = { case: failure.id, draft: sealOf(draft), basis, paidRequests: 0, frozen: { pass: false }, regression: { pass: false } };
      const receipt = { facts, seal: sealOf(facts) };
      writeFileSync(capsule, JSON.stringify(receipt), { flag: "wx" });
      return receipt;
    },
    projectDraftHandoff: (_failure, _work, next) => { published.add(next.id); },
  };
  const open = () => new GitHubMaintenance({ slot, scope, runtime,
    cut: point => { if (pending.delete(point)) throw Error(point); },
  });
  try {
    let pilot = open();
    pilot.state.register({ id: "first", title: "Repair", source: "direct", paths: ["fix.mjs"] });
    const input = { release, checkpoint: hash("d"), requestWindow: githubWindow, work: "first" };
    const { signal } = slot.enqueueGitHubSession("first", hash("e"), input);
    const authorized = slot.authorizeSession(slot.sessionAdmissionRequest(signal.signalId), { actor: "mock", reason: "first attempt" });
    await slot.dispatch(signal, release, async () => {
      dispatched += 1;
      return { reconciled: false, natural: false, usageState: "UNKNOWN", attributionState: "INCOMPLETE", unresolved: 1, requests: 1 };
    });
    pilot.state.update(pilot.state.list()[0], { state: "PAUSED", reason: "USAGE_UNCONFIRMED", issue: { number: 298 },
      releaseAtDispatch: release, attempt: signal.signalId, admission: authorized.id });
    for (const at of cuts) {
      await assert.rejects(pilot.tick(), new RegExp(at, "u"));
      slot.close();
      slot = new MaintenanceSlot(path);
      pilot = open();
    }
    await pilot.tick();
    const initial = pilot.inspect();
    const failure = initial.failureCases[0], draft = initial.draftContinuations[0];
    assert.equal(failure.disposition.state, "PAUSED");
    assert.equal(draft.work.state, "WAITING_FOR_ADMISSION");
    assert.deepEqual(draft.work.remaining, ["FROZEN_PROBE", "PUBLIC_REGRESSION", "CANDIDATE_BOUND_DELIVERY"]);
    assert.equal(draft.work.origin.case, failure.id);
    assert.equal(draft.work.origin.replay, draft.receipt.seal);
    assert.deepEqual(await pilot.replayDraft(failure.id), draft);
    await assert.rejects(pilot.replayDraft(failure.id, { case: failure.id, archive: failure.input.archive,
      files: { ...draft.input.files, patch: hash("0") } }), /GITHUB_STOPPED_DRAFT_LEGACY_ATTESTATION_CHANGED/u);
    await assert.rejects(pilot.replayDraft("other-case"), /GITHUB_STOPPED_DRAFT_CASE_UNKNOWN/u);
    await pilot.tick();
    assert.deepEqual(pilot.inspect(), initial);
    assert.equal(isolatedRuns, 1);
    assert.equal(dispatched, 1);
    assert.equal(published.size, 1);
    assert.equal(slot.current().blocked, "USAGE_UNCONFIRMED");
    assert.equal(slot.queued()[0].status, "STOPPED");
    assert.equal(slot.view().events.filter(event => event.type === "MAINTENANCE_DRAFT_CONTINUATION_READY").length, 1);
    assert.throws(() => slot.enqueueGitHubSession("not-allowed", hash("7"), input), /GITHUB_SESSION_SLOT_UNAVAILABLE/u);
  } finally { slot.close(); }
});

test("the bounded project index shows new continuation work with older open questions", async () => {
  const pulse = { projectId: input.project, basis: { projectRevision: 2, projectDigest: hash("d"), headCommit: basis },
    goal: "Maintain the project", episode: { state: "OPEN" }, openQuestions: [1, 2, 3, 4, 5].map(i => ({
      id: "journal:" + i, title: i === 5 ? "Resume stopped draft" : "Earlier question " + i, sourceRefs: ["journal:" + i],
    })), blocked: [], negativeFindings: [], recentChanges: [], nextActions: { mechanical: [] }, coverage: { complete: true } };
  const workspace = { pulse: async () => pulse };
  const current = await readProjectIndex(workspace);
  assert.equal(current.state, "CURRENT");
  assert.deepEqual(current.index.open.map(row => row.ref), ["journal:5", "journal:4", "journal:3"]);
  assert.equal(current.index.omitted.open, 2);
  assert.equal((await readProjectIndex(workspace, null, [], current.version)).state, "CURRENT");
  assert.equal(pulse.openQuestions[0].id, "journal:1");
});
