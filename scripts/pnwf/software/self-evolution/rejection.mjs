/** Transport independently observed closeout failures back to the maintenance project. */
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readStream } from "../../analyze_energy_trajectory.mjs";
import { PAID_MODE } from "../../bounded_provider.mjs";
import { digest, readJson, sha, writeJson } from "../../energy/contract.mjs";
import { conclusion } from "../../energy/product.mjs";
import { stoppedDraft } from "./draft-resume.mjs";
import { sealOf } from "./slot.mjs";
import { manifest, projectId, source, verifiedArchiveDigest } from "./workspace.mjs";

const history = "c7509663dcd909d94d41da06ba737e2a01553586";
const archive = "research-evidence/pnwf-software/2026-11-22/draft-resume/live";
const rejected = "91b5bc0ca6690d673118af3d753056b26a7ab460";
const previousState = "first/stages/MAINTAIN/state";
const out = "out/MAINTAIN";
const read = (directory, path) => readJson(join(directory, path));
const fileDigest = (directory, path) => digest(readFileSync(join(directory, path)));
const replayPath = (directory, arm) => join(directory, "candidate-probes", `${arm}-clean`);
const tracePath = session => "runtime-MAINTAIN/sessions/" + session.trajectory.stream;

export const rejectionGoal = "接续 Palimpsest 维护项目。根据封存的工作成果和复验记录，复现仍会影响下一位工作的缺口，设计并运行验证，提交可复核的改进。原始资料在 evidence/。";

export function rejectionOf(row, directory) {
  const { probes } = row.verification;
  if (row.passed || probes.pass || probes.errors.length || !row.reconciled || !row.session.natural || row.accounting.unresolved) return null;
  const clean = probes.rows.filter(probe => probe.condition === "clean");
  assert.deepEqual(clean.map(probe => probe.arm), ["WITHOUT", "WITH"]);
  const failed = clean.filter(probe => !probe.delivered || probe.recorded.length !== 1);
  if (failed.length === 0) return null;
  assert.equal(row.qualification, sealOf(row.verification));
  assert(row.submission.valid && sha(row.submission.candidate) && row.submission.candidate === row.release.candidate);
  const receipts = failed.map(observation => {
    const replay = replayPath(directory, observation.arm);
    assert.deepEqual(read(replay, "observation.json"), observation);
    const session = read(replay, "session.json");
    assert(observation.paidRequests === 0 && observation.natural && observation.reconciled &&
      !observation.mockErrors.length && session.reconciled && session.execution.natural && session.accounting.unresolved === 0,
    "REPLAY_FAILURE_NOT_INDEPENDENTLY_OBSERVED");
    assert.equal(session.accounting.requests, observation.requests);
    const detail = {
      schema: "palimpsest-maintenance-replay-rejection/v1", arm: observation.arm, candidate: row.submission.candidate,
      buildSha256: row.release.buildSha256, qualification: row.qualification,
      expected: { committedArtifact: "MAINTENANCE-REVIEW.md", commit: observation.head, deliveryRecords: 1 },
      observation, traceSha256: session.trajectory.sha256, sessionSha256: fileDigest(replay, "session.json"),
      observationSha256: fileDigest(replay, "observation.json"),
    };
    return { id: `maintenance-rejection-${sealOf(detail)}`, ...detail };
  });
  return {
    schema: "palimpsest-maintenance-rejection/v1", projectId, signalId: row.signalId,
    cohortId: row.session.cohortId, requests: row.accounting.requests, unresolved: row.accounting.unresolved,
    basis: row.predecessor.candidate, installation: row.predecessor.buildSha256, checkpoint: row.stateCheckpoint,
    candidate: row.submission.candidate, buildSha256: row.release.buildSha256, qualification: row.qualification, receipts,
  };
}

export function archivedRejection(directory) {
  const row = read(directory, "candidate.json");
  const session = read(directory, "first/session.json");
  const ledger = read(directory, `first/${out}/request-accounting.json`);
  assert(row.frozen.source === source && row.frozen.projectId === projectId && row.mode === PAID_MODE &&
    row.submission.candidate === rejected && row.verification.exactSha === rejected && !row.passed && !row.verification.pass,
  "REQUIRE_ARCHIVED_REJECTED_CANDIDATE");
  for (const name of ["approval-request.json", "owner-approval.json", "activation.json", "successor.json"]) {
    assert(!existsSync(join(directory, name)), "REJECTED_INSTALLATION_ALREADY_ADVANCED: " + name);
  }
  assert.deepEqual(row.session, session.execution);
  assert.deepEqual(row.session, read(directory, `first/${out}/run.json`));
  assert.deepEqual(row.accounting, session.accounting);
  const lane = ledger.sessions.find(entry => entry.id === row.session.sessionId);
  assert(ledger.cohortId === row.session.cohortId && session.reconciled && row.session.natural &&
    lane?.state === "ENDED" && ledger.unresolvedRequests === 0 && ledger.requests.every(entry => entry.state === "SETTLED") &&
    session.requestBinding?.boundRequests === ledger.requests.length && ledger.requests.length === row.accounting.requests,
  "REJECTED_SESSION_NOT_RECONCILED");
  const artifacts = [
    ["candidate.json"], ["source.json"], ["slot.json"], ["initial-build/build.json"], ["accepted-build/build.json"],
    ["accepted-build/runtime.tar.gz"], ["first/candidate.bundle"], ["first/candidate.patch"],
    ["first/session.json"], ["first/cohort.json"], ["first/request-ledger.sqlite"], [`first/${out}/run.json`],
    [`first/${out}/request-accounting.json`], [`first/${tracePath(session)}`],
    [`${previousState}/journal.sqlite`], [`${previousState}/palimpsest.sqlite`], ["candidate-probes/checks.json"],
  ];
  for (const arm of ["WITHOUT", "WITH"]) {
    const probe = replayPath(directory, arm);
    const probeSession = read(probe, "session.json");
    for (const file of ["session.json", "observation.json", `${out}/run.json`, `${out}/request-accounting.json`, tracePath(probeSession)]) {
      artifacts.push([`candidate-probes/${arm}-clean/${file}`, `candidate-probes/${arm.toLowerCase()}/${file}`]);
    }
  }
  const archivedFiles = Object.fromEntries(artifacts.map(([actual, sealed = actual]) => [
    sealed, verifiedArchiveDigest(directory, history, archive, actual, sealed),
  ]));
  const states = manifest(join(directory, previousState)).filter(([name]) => name.endsWith(".sqlite"));
  assert.equal(sealOf(states), row.stateCheckpoint, "REJECTED_PROJECT_CHECKPOINT_DRIFT");
  assert.deepEqual(conclusion(join(directory, previousState)), session.conclusion, "REJECTED_PROJECT_CONCLUSION_DRIFT");
  const origin = read(directory, "resume-origin.json");
  const draft = stoppedDraft(resolve(origin.previousRun));
  assert.equal(origin.stopProof, sealOf(row.resume.prior), "ARCHIVED_DRAFT_ORIGIN_CHANGED");
  assert.deepEqual(draft.proof, row.resume.prior);
  const rejection = rejectionOf(row, directory);
  assert.equal(rejection?.receipts.length, 2, "REQUIRE_BOTH_ARCHIVED_FAILURES");
  assert(rejection.receipts.every(receipt => !receipt.observation.delivered && receipt.observation.recorded.length === 0));
  assert.deepEqual(read(directory, "candidate-probes/checks.json"), row.verification.probes);
  return { directory, draft, row, session, rejection, snapshot: read(directory, "slot.json"),
    proof: { history, archive, archivedFiles, states, checkpoint: row.stateCheckpoint, rejection } };
}

function retainReplay(directory, target, session) {
  mkdirSync(target, { recursive: true });
  const stream = join(directory, tracePath(session));
  const events = readStream(stream, session.trajectory.sha256);
  writeFileSync(join(target, "session.jsonl"), events.map(event => JSON.stringify(event)).join("\n") + "\n");
  for (const name of ["session.json", `${out}/run.json`, `${out}/request-accounting.json`]) cpSync(join(directory, name), join(target, name.split("/").at(-1)));
}

export function prepareRejectionInputs(prior, root) {
  const { directory, row, session, rejection } = prior;
  const info = read(directory, "source.json");
  assert.equal(fileDigest(directory, "source.tar"), info.archiveSha256, "SOURCE_EXPORT_DRIFT");
  for (const name of ["source.json", "source.tar", "source.bundle", "initial-build", "next-seal"]) {
    cpSync(join(directory, name), join(root, name), { recursive: true });
  }
  assert.deepEqual(manifest(join(root, "next-seal")), row.nextEvidence.entries, "NEXT_TICKET_EVIDENCE_DRIFT");
  const inputs = join(root, "input-first");
  cpSync(join(directory, "input-first"), inputs, { recursive: true });
  assert.deepEqual(manifest(inputs), row.evidence.entries, "PARENT_SEALED_INPUT_CHANGED");
  const packet = join(inputs, "rejection");
  mkdirSync(packet);
  writeJson(join(packet, "index.json"), rejection);
  const previous = join(packet, "previous-session");
  retainReplay(join(directory, "first"), previous, session);
  cpSync(join(directory, "first/candidate.patch"), join(previous, "candidate.patch"));
  for (const receipt of rejection.receipts) {
    const replay = replayPath(directory, receipt.arm);
    const target = join(packet, receipt.arm.toLowerCase());
    retainReplay(replay, target, read(replay, "session.json"));
    cpSync(join(replay, "observation.json"), join(target, "observation.json"));
    writeJson(join(target, "receipt.json"), receipt);
  }
  const entries = manifest(inputs);
  return { source: info, evidence: { entries, sha256: sealOf(entries) }, nextEvidence: row.nextEvidence, prior: prior.proof };
}

export function verifyRejectionSlot(snapshot, current, rejection) {
  assert.deepEqual(current.slot, snapshot.slot, "PREDECESSOR_SLOT_CHANGED");
  assert.deepEqual(current.inbox.slice(0, snapshot.inbox.length), snapshot.inbox, "PREDECESSOR_INBOX_CHANGED");
  assert.deepEqual(current.events.slice(0, snapshot.events.length), snapshot.events, "PREDECESSOR_EVENTS_CHANGED");
  const pending = current.inbox.slice(snapshot.inbox.length);
  const events = current.events.slice(snapshot.events.length);
  if (pending.length === 0) return assert.equal(events.length, 0, "PREDECESSOR_SLOT_CHANGED");
  const seal = sealOf(rejection);
  assert(pending.length === 1 && pending[0].status === "PENDING" && pending[0].seal === seal && events.length === 2 &&
    events[0].type === "REJECTION_PUBLISHED" && events[0].detail.id === pending[0].id && events[0].detail.proof === seal &&
    events[1].type === "EVIDENCE_READY" && events[1].detail.signalId === pending[0].id, "REJECTION_ALREADY_CONSUMED_OR_SLOT_CHANGED");
}
