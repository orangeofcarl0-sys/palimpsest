/** Re-read paired tool calls, request terminals and the exact release decision from an archive. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { analyzeAttributedStage } from "../../analyze_energy_trajectory.mjs";
import { OPENCODE_GO_MESSAGES } from "../../opencode_go.mjs";
import { digest, readJson } from "../../energy/contract.mjs";
import { verifyInterrupted } from "./interruption.mjs";
import { trajectory } from "./session.mjs";
import { manifest } from "./workspace.mjs";

const [directory] = process.argv.slice(2);
assert(directory, "Usage: self-evolution/recount.mjs <archive>");
const root = resolve(directory);
const rows = [];

function verifyRun(run) {
  const row = readJson(join(run, "session.json"));
  const out = join(run, "out/MAINTAIN");
  const ledger = readJson(join(out, "request-accounting.json"));
  assert.deepEqual(row.execution, readJson(join(out, "run.json")));
  assert.deepEqual(row.accounting, { requests: ledger.requests.length, unresolved: ledger.unresolvedRequests, confirmed: ledger.confirmed });
  if (row.trajectory) assert.deepEqual(trajectory({ run }, row.attribution), row.trajectory);
  if (row.requestBinding) assert.deepEqual(analyzeAttributedStage(run, "MAINTAIN", {
    arm: "P", result: { evidence: row.attribution, seal: { provider: "opencode-go", route: OPENCODE_GO_MESSAGES } },
  }), row.requestBinding);
  const recorded = row.trajectory?.calls.filter(call => call.recorded).map(call => ({ intent: call.intent, call: call.call, result: call.result })) ?? [];
  rows.push({ phase: row.mode, run: run.slice(root.length + 1).replaceAll("\\", "/"), ...row.accounting,
    natural: row.execution.natural, paidRequests: row.execution.paidRequestsAdmitted, recorded, latestJournalIntent: row.conclusion?.intent ?? null,
    boundRequests: row.requestBinding?.boundRequests ?? null, source: row.trajectory?.sha256 ?? null });
}

function verifyRejection(phase, stem, proof, status) {
  const wake = readJson(join(phase, stem + "-wake.json"));
  const seal = digest(JSON.stringify(proof));
  assert.deepEqual(readJson(join(phase, stem + ".json")), proof);
  assert.equal(wake.reconciliationDigest, seal);
  const slot = readJson(join(phase, "slot.json"));
  const event = slot.events.find(entry => entry.type === "REJECTION_PUBLISHED" && entry.detail.id === wake.signalId);
  assert.equal(event.detail.prior, proof.signalId);
  assert.equal(event.detail.candidate, proof.candidate);
  assert.equal(event.detail.proof, seal);
  assert.deepEqual(event.detail.receipts, proof.receipts.map(receipt => receipt.id));
  const job = slot.inbox.find(entry => entry.id === wake.signalId);
  assert.equal(job.seal, seal);
  if (status) assert.equal(job.status, status);
  return wake.signalId;
}

function verifyReceiptIntake(phase, prior, status) {
  const { rejection } = prior;
  assert.deepEqual(prior, readJson(join(phase, "prior-rejection.json")));
  const checkpoint = manifest(join(root, "checkpoint/owners"));
  assert.deepEqual(checkpoint, prior.states);
  assert.equal(digest(JSON.stringify(checkpoint)), prior.checkpoint);
  const wakeId = verifyRejection(phase, "incoming", rejection, status);
  const intake = readJson(join(phase, "first/intake.json"));
  assert.equal(intake.basis, rejection.basis);
  assert.equal(intake.head, rejection.candidate);
  const entry = intake.journal.find(item => item.refs.some(ref => ref.id === wakeId));
  for (const receipt of rejection.receipts) {
    const { id, ...material } = receipt;
    assert.equal(id, "maintenance-rejection-" + digest(JSON.stringify(material)));
    assert(entry.refs.some(ref => ref.id === id));
    const packet = join(phase, "receipts", receipt.arm.toLowerCase());
    assert.deepEqual(readJson(join(packet, "receipt.json")), receipt);
    assert.equal(digest(readFileSync(join(packet, "session.json"))), receipt.sessionSha256);
    assert.equal(digest(readFileSync(join(packet, "observation.json"))), receipt.observationSha256);
  }
  return wakeId;
}

function verifyRework(phase, row) {
  const prior = row.rework.prior;
  const { rejection } = prior;
  assert.equal(row.predecessor.candidate, rejection.basis);
  assert.equal(row.predecessor.buildSha256, rejection.installation);
  assert.equal(row.submission.basis, rejection.candidate);
  assert.notEqual(row.session.cohortId, rejection.cohortId);
  assert.equal(verifyReceiptIntake(phase, prior, null), row.signalId);
  if (row.mode === "paid-usage-only") {
    const cohort = readJson(join(phase, "first/cohort.json"));
    assert.equal(cohort.cohortId, row.session.cohortId);
    for (const [key, value] of Object.entries(row.frozen.window)) assert.equal(cohort[key], value);
  }
}

function verifyInterruptedRun(phase, file) {
  const observation = verifyInterrupted(phase, readJson(file));
  const prior = readJson(join(phase, "prior-rejection.json"));
  const wakeId = verifyReceiptIntake(phase, prior, "STOPPED");
  assert.notEqual(observation.usage.cohortId, prior.rejection.cohortId);
  const before = readJson(join(phase, "slot-before-interruption.json"));
  const after = readJson(join(phase, "slot.json"));
  assert(before.slot.writer && !after.slot.writer && after.slot.blocked === "USAGE_UNCONFIRMED");
  assert.deepEqual(after.slot.active, before.slot.active);
  assert.deepEqual(after.inbox.filter(job => job.id !== wakeId), before.inbox.filter(job => job.id !== wakeId));
  assert.equal(after.events.at(-1).type, "WAKE_STOPPED");
  assert.equal(after.events.at(-1).detail.proof, digest(JSON.stringify(observation)));
  assert.equal(after.events.at(-1).detail.id, wakeId);
  for (const name of ["candidate.json", "approval-request.json", "activation.json", "successor.json"]) assert(!existsSync(join(phase, name)));
  return { phase: "paid-usage-only", run: "live/first", requests: observation.usage.admitted, unresolved: observation.usage.unresolved,
    confirmed: observation.usage.confirmed, natural: false, paidRequests: observation.usage.admitted,
    recorded: [], source: observation.trajectory.sha256, interrupted: true, boundRequests: observation.usage.settled };
}

function verifyCandidate(phase) {
  const file = join(phase, "candidate.json");
  if (!existsSync(file)) {
    const interrupted = join(phase, "interruption.json");
    if (existsSync(interrupted)) rows.push(verifyInterruptedRun(phase, interrupted));
    return;
  }
  const row = readJson(file);
  if (row.rework) verifyRework(phase, row);
  if (row.resume) {
    const { prior, restoration } = row.resume;
    assert.deepEqual(prior, readJson(join(phase, "prior-stop.json")));
    assert.deepEqual(restoration, readJson(join(phase, "draft-restoration.json")));
    assert(prior.reason === "REQUEST_LIMIT" && prior.requests === 64 && prior.unresolved === 0);
    assert.equal(restoration.patchSha256, prior.files["first/working.patch"]);
    assert.equal(restoration.checkpoint, prior.checkpoint);
    const checkpoint = manifest(join(root, "checkpoint/owners"));
    assert.deepEqual(checkpoint, prior.stateFiles);
    assert.equal(digest(JSON.stringify(checkpoint)), prior.checkpoint);
    assert.equal(row.submission.basis, prior.basis);
    assert.notEqual(row.session.cohortId, prior.cohortId);
    if (row.mode === "paid-usage-only") {
      const cohort = readJson(join(phase, "first/cohort.json"));
      assert.equal(cohort.cohortId, row.session.cohortId);
      for (const [key, value] of Object.entries(row.frozen.window)) assert.equal(cohort[key], value);
    }
  }
  if (row.submission.bundleSha256) {
    const bundle = join(phase, "first/candidate.bundle");
    assert.equal(digest(readFileSync(bundle)), row.submission.bundleSha256);
    const heads = execFileSync("git", ["bundle", "list-heads", bundle], { encoding: "utf8", timeout: 5000 });
    assert(heads.includes(`${row.submission.candidate} HEAD`));
  }
  if (row.release) {
    assert.equal(digest(JSON.stringify(row.verification)), row.qualification);
    const build = readJson(join(phase, "accepted-build/build.json"));
    assert.deepEqual(build, row.release);
    assert.equal(build.candidate, row.submission.candidate);
    assert.equal(build.buildSha256, row.verification.buildSha256);
    const artifact = join(phase, "accepted-build/runtime.tar.gz");
    if (existsSync(artifact)) assert.equal(digest(readFileSync(artifact)), build.tarSha256);
    assert.equal(digest(JSON.stringify({ tarSha256: build.tarSha256, files: build.files })), build.buildSha256);
    if (row.resume || row.rework) assert.deepEqual(readJson(join(phase, "candidate-probes/checks.json")), row.verification.probes);
  }
  const supplemental = join(phase, "candidate-extra");
  if (existsSync(supplemental)) {
    const checks = readJson(join(supplemental, "results.json"));
    assert.equal(checks.candidate, row.submission.candidate);
    assert.equal(checks.basis, row.submission.basis);
    assert.equal(checks.inheritedPatchSha256, row.resume.restoration.patchSha256);
    assert.equal(checks.changeSha256, digest(readFileSync(join(supplemental, "from-draft.patch"))));
    assert.equal(checks.paidRequests, 0);
    const delivery = readJson(join(supplemental, "delivery-binding.json"));
    const conclusion = readJson(join(phase, "first/session.json")).conclusion;
    const receipt = JSON.parse(conclusion.body.split("<!-- pc1-episode-conclusion:v1 -->\n").at(-1));
    assert.equal(delivery.candidate, row.submission.candidate);
    assert.equal(delivery.journalEvent, conclusion.eventId);
    assert.equal(delivery.intent, receipt.intent);
    const artifacts = receipt.check.artifacts.map(({ commit, committed, path, digest }) => {
      assert(commit === delivery.candidate && committed);
      return { path, digest };
    });
    assert.deepEqual(delivery.artifacts, artifacts);
  }
  if (!row.passed) {
    const rejectionFile = join(phase, "rejection.json");
    if (existsSync(rejectionFile)) {
      const proof = readJson(rejectionFile);
      assert.equal(proof.candidate, row.submission.candidate);
      assert.equal(proof.buildSha256, row.release.buildSha256);
      assert.equal(proof.qualification, row.qualification);
      assert.equal(proof.checkpoint, row.stateCheckpoint);
      for (const receipt of proof.receipts) assert(row.verification.probes.rows.some(probe =>
        JSON.stringify(probe) === JSON.stringify(receipt.observation)));
      verifyRejection(phase, "rejection", proof, "PENDING");
    }
    const draft = join(phase, "offline/offline-recheck.json");
    if (existsSync(draft)) {
      const observed = readJson(draft);
      const patchSha256 = digest(readFileSync(join(phase, "first/working.patch")));
      assert.equal(observed.patchSha256, patchSha256);
      assert.equal(observed.basis, row.submission.basis);
      assert.equal(observed.status, row.submission.status);
      assert.equal(observed.paidRequests, 0);
      const serial = readJson(join(phase, "offline/draft-pnwf-product.json"));
      assert.equal(serial.patchSha256, patchSha256);
      assert.equal(serial.paidRequests, 0);
    }
    assert(!existsSync(join(phase, "activation.json")) && !existsSync(join(phase, "successor.json")));
    return;
  }
  const build = row.release;
  const path = join(phase, "activation.json");
  if (!existsSync(path)) return;
  const { active, old, readByNew, accepted } = readJson(path);
  assert.deepEqual(old, readByNew);
  assert.equal(accepted.basis, build.candidate);
  assert.equal(active.approval.release.candidate, build.candidate);
  assert.equal(active.approval.release.buildSha256, build.buildSha256);
  assert.equal(active.approval.qualification, row.qualification);
  if (row.resume) assert(old.journal.some(entry => entry.refs?.some(ref => ref.id === row.resume.prior.signalId)));
  if (row.mode === "paid-usage-only") assert.deepEqual(readJson(join(phase, "owner-approval.json")).approval, active.approval);
}

for (const phase of ["mock", "live", "mock-fix"]) {
  const folder = join(root, phase);
  if (!existsSync(folder)) continue;
  const sessions = readdirSync(folder, { recursive: true }).filter(file =>
    basename(file) === "session.json" && file.split(/[\\/]/u)[0] !== "receipts").sort();
  for (const file of sessions) {
    verifyRun(join(folder, file, ".."));
  }
  verifyCandidate(folder);
}
assert(rows.length > 0, "NO_ARCHIVED_RUNS");
console.log(JSON.stringify(rows, null, 2));
