/** Restore the exact draft from the sealed 64-request stop. */
import assert from "node:assert/strict";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { readStream } from "../../analyze_energy_trajectory.mjs";
import { digest, readJson, writeJson } from "../../energy/contract.mjs";
import { PAID_MODE } from "../../bounded_provider.mjs";
import { copyDatabases, makeEvidence, manifest, offline, projectId, source, success, verifiedArchiveDigest, verifyInstallation } from "./workspace.mjs";
import { sealOf } from "./slot.mjs";
import { window } from "./session.mjs";

export const resumeWindow = { ...window, maxRequests: 256 };
export const resumeGoal = "接续 Palimpsest 维护项目的未完成工作。基于当前原稿和封存的交接运行，定位仍会影响下一位工作的缺口，验证实际效果，提交可复核的成果。原始证据在 evidence/。";
const recordBase = "1c0807c39e1c711faa35d7fb289b45425e84b95e";
const archive = "research-evidence/pnwf-software/2026-11-22/self-evolution/live";
const state = "first/stages/MAINTAIN/state";
const out = "first/out/MAINTAIN";
const json = (root, path) => readJson(join(root, path));

function assertLimitStop(ledger, run, cohort) {
  assert(run.mode === PAID_MODE && run.killedBy === "request_limit" && run.natural === false && run.stopped === true &&
    run.error === null && run.exitCode !== 0 && run.usage?.unresolvedRequests === 0, "PRIOR_EXIT_NOT_RECONCILED_LIMIT_STOP");
  assert(cohort.cohortId === run.cohortId && ledger.cohortId === run.cohortId && cohort.maxRequests === window.maxRequests &&
    cohort.wallClockMs === window.wallClockMs && cohort.requestTimeoutMs === window.requestTimeoutMs && cohort.billingCeiling === null &&
    ledger.aggregateCeiling === null, "PRIOR_CONTRACT_MISMATCH");
  const lane = ledger.sessions.find(entry => entry.id === run.sessionId);
  assert(ledger.state === "STOPPED" && ledger.reason === "REQUEST_LIMIT" && ledger.unresolvedRequests === 0 &&
    lane?.state === "STOPPED" && lane.requestCount === window.maxRequests && lane.unresolvedRequests === 0 &&
    run.paidRequestsAdmitted === window.maxRequests && ledger.requests.length === window.maxRequests &&
    ledger.requests.every(request => request.session === run.sessionId && request.state === "SETTLED" && Number.isSafeInteger(request.actual)),
    "PRIOR_REQUESTS_NOT_ALL_SETTLED");
  assert.equal(new Set(ledger.requests.map(request => request.id)).size, window.maxRequests);
  assert.equal(ledger.confirmed, ledger.requests.reduce((total, request) => total + request.actual, 0));
  assert.equal(run.usage.confirmedTokens, ledger.confirmed);
  assert(ledger.refusals.some(refusal => refusal.reason === "REQUEST_LIMIT" && refusal.sessionId === run.sessionId &&
    refusal.requestCount === window.maxRequests), "LIMIT_REFUSAL_NOT_OBSERVED");
}

export function stoppedDraft(directory) {
  const oldRecord = json(directory, "candidate.json");
  const session = json(directory, "first/session.json");
  const run = json(directory, out + "/run.json");
  const ledger = json(directory, out + "/request-accounting.json");
  const cohort = json(directory, "first/cohort.json");
  const { submission } = oldRecord;
  assert(oldRecord.frozen.source === source && oldRecord.frozen.projectId === projectId && !oldRecord.passed &&
    oldRecord.reconciled && !submission.valid && !submission.bundleSha256 && submission.candidate === submission.basis &&
    submission.basis === oldRecord.predecessor.candidate && submission.status &&
    submission.status.split("\n").every(line => /^ ?M /u.test(line)), "REQUIRE_TRACKED_UNCOMMITTED_DRAFT");
  assert.deepEqual(session.execution, run);
  assert(session.reconciled && session.requestBinding?.boundRequests === window.maxRequests && !session.conclusion, "PRIOR_TRAJECTORY_NOT_RECONCILED");
  assertLimitStop(ledger, run, cohort);

  const stream = "first/runtime-MAINTAIN/sessions/" + session.trajectory.stream;
  const patch = "first/working.patch";
  const files = Object.fromEntries([
    "source.json", "slot.json", "candidate.json", "initial-build/build.json", "first/session.json", "first/cohort.json",
    "first/request-ledger.sqlite", out + "/run.json", out + "/request-accounting.json", out + "/request-observations.jsonl",
    patch, "first/untracked.tar.gz", state + "/journal.sqlite", state + "/palimpsest.sqlite", stream,
  ].map(path => [path, verifiedArchiveDigest(directory, recordBase, archive, path)]));
  assert(gunzipSync(readFileSync(join(directory, "first/untracked.tar.gz"))).every(byte => byte === 0), "UNTRACKED_DRAFT_NOT_COVERED");
  verifyInstallation(join(directory, "initial-build"), oldRecord.predecessor);
  const sourceInfo = json(directory, "source.json");
  assert.equal(digest(readFileSync(join(directory, "source.tar"))), sourceInfo.archiveSha256, "SOURCE_EXPORT_DRIFT");
  const entries = manifest(join(directory, state)).filter(([name]) => name.endsWith(".sqlite"));
  const proof = { schema: "palimpsest-maintenance-draft-resume/v1", historyCommit: recordBase, source, projectId,
    installation: oldRecord.predecessor.buildSha256, basis: submission.basis, signalId: oldRecord.signalId,
    cohortId: run.cohortId, reason: ledger.reason, requests: ledger.requests.length, unresolved: ledger.unresolvedRequests,
    confirmed: ledger.confirmed, files, checkpoint: sealOf(entries), stateFiles: entries };
  return { directory, oldRecord, ledger, session, patch, stream, state, proof };
}

export function prepareDraftInputs(prior, root, input, successorInput) {
  const { directory, oldRecord, session, stream, patch, proof } = prior;
  for (const name of ["source.json", "source.tar", "source.bundle", "initial-build"]) {
    cpSync(join(directory, name), join(root, name), { recursive: true });
  }
  const original = makeEvidence(input, "first");
  assert.deepEqual(original, oldRecord.evidence, "ORIGINAL_COLD_HANDOVER_EVIDENCE_DRIFT");
  const inherited = join(input, "prior-run");
  mkdirSync(inherited);
  const principal = session.attribution.traces.find(trace => trace.role === "principal");
  const events = readStream(join(directory, stream), principal.digest);
  writeFileSync(join(inherited, "session.jsonl"), events.map(event => JSON.stringify(event)).join("\n") + "\n");
  for (const name of [patch, out + "/run.json", out + "/request-accounting.json"]) {
    cpSync(join(directory, name), join(inherited, name.split("/").at(-1)));
  }
  const nextEvidence = makeEvidence(successorInput, "next");
  assert.deepEqual(nextEvidence, oldRecord.nextEvidence, "NEXT_TICKET_EVIDENCE_DRIFT");
  const entries = manifest(input);
  const evidence = { entries, sha256: sealOf(entries) };
  writeJson(join(root, "prior-stop.json"), proof);
  return { source: json(root, "source.json"), evidence, nextEvidence, prior: proof };
}

export function restoreDraft(prior, world, prepared) {
  copyDatabases(join(prior.directory, prior.state), prepared.state);
  const files = manifest(prepared.state);
  assert.deepEqual(files, prior.proof.stateFiles, "DRAFT_OWNER_CHECKPOINT_CHANGED");
  const basis = success(offline(world, "git apply /previous.patch && git diff --binary | cmp -s - /previous.patch && git rev-parse HEAD",
    [join(prior.directory, prior.patch) + ":/previous.patch:ro"]));
  assert.equal(basis, prior.proof.basis, "DRAFT_BASE_MISMATCH");
  const status = success(offline(world, "git status --porcelain --untracked-files=all"));
  assert.equal(status, prior.oldRecord.submission.status, "DRAFT_STATUS_DRIFT");
  return { basis, status, patchSha256: prior.proof.files[prior.patch], checkpoint: prior.proof.checkpoint };
}

export function checkStopRefusals(prior) {
  const { ledger, session } = prior;
  const cohort = json(prior.directory, "first/cohort.json");
  assert.throws(() => assertLimitStop({ ...ledger, unresolvedRequests: 1 }, session.execution, cohort), /NOT_ALL_SETTLED/u);
  assert.throws(() => assertLimitStop(ledger, { ...session.execution, killedBy: "wall_clock" }, cohort), /PRIOR_EXIT/u);
  assert.throws(() => assertLimitStop(ledger, session.execution, { ...cohort, maxRequests: resumeWindow.maxRequests }), /PRIOR_CONTRACT/u);
  return ["unknown usage", "different stop reason", "rewritten historical limit"];
}
