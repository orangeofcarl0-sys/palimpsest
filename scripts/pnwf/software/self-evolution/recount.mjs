/** Re-read paired tool calls, request terminals and the exact release decision from an archive. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { analyzeAttributedStage } from "../../analyze_energy_trajectory.mjs";
import { OPENCODE_GO_MESSAGES } from "../../opencode_go.mjs";
import { digest, readJson } from "../../energy/contract.mjs";
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

function verifyCandidate(phase) {
  const file = join(phase, "candidate.json");
  if (!existsSync(file)) return;
  const row = readJson(file);
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
    if (row.resume) assert.deepEqual(readJson(join(phase, "candidate-probes/checks.json")), row.verification.probes);
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

for (const phase of ["mock", "live"]) {
  const folder = join(root, phase);
  if (!existsSync(folder)) continue;
  for (const file of readdirSync(folder, { recursive: true }).filter(file => basename(file) === "session.json").sort()) {
    verifyRun(join(folder, file, ".."));
  }
  verifyCandidate(folder);
}
assert(rows.length > 0, "NO_ARCHIVED_RUNS");
console.log(JSON.stringify(rows, null, 2));
