/** Re-derive a stopped GitHub session's facts from host-owned evidence. */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { readStream } from "../../analyze_energy_trajectory.mjs";
import { digest, readJson } from "../../energy/contract.mjs";
import { regularDraftFiles } from "./queue-draft.mjs";
import { sealOf } from "./slot.mjs";
import { manifest } from "./workspace.mjs";

const files = ["submission-facts.json", "session.json", "request-ledger.sqlite", "candidate.bundle",
  "candidate.patch", "out/MAINTAIN/request-accounting.json", "out/MAINTAIN/run.json"];
const hashFile = path => digest(readFileSync(path));
const draftFiles = ["working.patch", "untracked.tar.gz"];

function trajectoryPath(session) {
  const name = session?.trajectory?.stream;
  if (!name) return null;
  assert(!name.split("/").some(part => !part || part === "." || part === "..") &&
    /^[\w./-]+\.jsonl\.zstd$/u.test(name), "GITHUB_FAILURE_TRAJECTORY_PATH_INVALID");
  return "runtime-MAINTAIN/sessions/" + name;
}

export function readFailureEvidence(directory, work, project, sealed) {
  const get = name => existsSync(join(directory, name)) ? readJson(join(directory, name)) : null;
  const submission = get("submission-facts.json");
  const session = get("session.json");
  const ledger = "request-ledger.sqlite";
  const wal = ledger + "-wal";
  const hasWal = existsSync(join(directory, wal)) && readFileSync(join(directory, wal)).length > 0;
  if (work.settlement?.archive) assert(!hasWal, "GITHUB_FAILURE_SEALED_LEDGER_HAS_PENDING_WRITES");
  const tape = trajectoryPath(session);
  const captured = [...files, ...draftFiles.filter(file => !sealed || Object.hasOwn(sealed.sources, file)),
    ...(tape ? [tape] : []), ...(hasWal ? [wal] : [])];
  const sources = Object.fromEntries(captured.filter(file => existsSync(join(directory, file)))
    .map(file => [file, hashFile(join(directory, file))]));
  if (tape) assert.equal(sources[tape], session.trajectory.sha256, "GITHUB_FAILURE_TRAJECTORY_CHANGED");
  if (work.settlement?.archive) {
    assert(submission?.work === work.id && sealOf(submission.release) === sealOf(work.releaseAtDispatch) &&
      submission.checkpoint === work.input.checkpoint && sources[ledger] && sources["session.json"],
    "GITHUB_FAILURE_WRONG_SESSION");
    assert.equal(sealOf({ ledger: sources[ledger], report: submission, session: sources["session.json"] }),
      work.settlement.archive, "GITHUB_FAILURE_ARCHIVE_CHANGED");
  }
  const state = join(directory, "stages", "MAINTAIN", "state");
  const result = {
    project, attempt: work.attempt, work: work.id, issue: work.issue?.number ?? null,
    archive: work.settlement?.archive ?? sealOf({ sources, settlement: work.settlement ?? null }),
    release: work.releaseAtDispatch,
    target: { kind: "git", basis: work.releaseAtDispatch.candidate, candidate: submission?.submission.candidate ?? null },
    verdict: { state: work.state, reason: work.reason, review: work.review ?? null },
    checkpoint: existsSync(state) ? sealOf(manifest(state)) : null,
    sources,
  };
  if (sealed) assert.deepEqual(result, sealed, "GITHUB_FAILURE_ARCHIVE_CHANGED");
  return result;
}

export function readStoppedDraft(directory, work, failure, legacy) {
  const { input, report } = failure;
  if (input.verdict.state !== "PAUSED" || input.target.kind !== "git" || !input.checkpoint ||
      input.target.candidate !== input.target.basis || !report) return null;
  const captured = draftFiles.map(file => input.sources[file]);
  if (!captured[0] && !captured[1] && !legacy) return null;
  readFailureEvidence(directory, work, input.project, input);
  const { submission } = readJson(join(directory, "submission-facts.json"));
  if (!submission.status || submission.valid || submission.bundleSha256) return null;
  const patch = readFileSync(join(directory, draftFiles[0])), untracked = readFileSync(join(directory, draftFiles[1]));
  const hashes = { patch: digest(patch), untracked: digest(untracked) };
  if (captured.some(Boolean)) {
    assert.deepEqual([hashes.patch, hashes.untracked], captured, "GITHUB_STOPPED_DRAFT_BYTES_CHANGED");
  } else {
    assert.deepEqual(legacy, { case: failure.id, archive: input.archive, files: hashes },
      "GITHUB_STOPPED_DRAFT_LEGACY_ATTESTATION_CHANGED");
  }
  const paths = submission.status.split("\n").filter(line => line.startsWith("?? ")).map(line => line.slice(3));
  let refusal = paths.some(path => !work.spec.paths.includes(path)) ? "GITHUB_STOPPED_DRAFT_SCOPE_CHANGED" : null;
  let entries = [];
  if (!refusal) {
    try { entries = regularDraftFiles(untracked, paths); }
    catch (error) {
      if (!["ERR_ASSERTION", "Z_DATA_ERROR", "Z_BUF_ERROR", "ERR_BUFFER_TOO_LARGE"].includes(error.code)) throw error;
      refusal = "GITHUB_STOPPED_DRAFT_UNTRACKED_REFUSED";
    }
  }
  assert(patch.length || paths.length || refusal, "GITHUB_STOPPED_DRAFT_EMPTY");
  const binding = { case: failure.id, archive: input.archive, attempt: input.attempt, release: input.release,
    checkpoint: input.checkpoint, investigation: report.seal, contract: work.seal, files: hashes, entries,
    ...(refusal ? { refusal } : {}) };
  return { binding, patch, untracked };
}

export function inspectFailureSession(directory, evidence) {
  const session = evidence.sources["session.json"] ? readJson(join(directory, "session.json")) : null;
  const submission = evidence.sources["submission-facts.json"] ? readJson(join(directory, "submission-facts.json")) : null;
  const recorded = evidence.sources["out/MAINTAIN/request-accounting.json"]
    ? readJson(join(directory, "out/MAINTAIN/request-accounting.json")) : null;
  let rows;
  if (evidence.sources["request-ledger.sqlite"]) {
    const ledger = new DatabaseSync(join(directory, "request-ledger.sqlite"), { readOnly: true });
    try { rows = ledger.prepare("SELECT id, state, actual FROM requests ORDER BY rowid").all(); }
    finally { ledger.close(); }
    if (recorded) {
      assert.deepEqual(rows.map(({ id, state, actual }) => [id, state, actual]),
        recorded.requests.map(({ id, state, actual }) => [id, state, actual]), "GITHUB_FAILURE_LEDGER_SNAPSHOT_CHANGED");
    }
  }
  const requests = rows?.length ?? null;
  const unknown = rows?.filter(row => row.state === "UNKNOWN").length ?? null;
  const settled = rows?.filter(row => row.state === "SETTLED").length ?? null;
  const confirmed = rows?.reduce((sum, row) => sum + (row.actual ?? 0), 0) ?? null;
  if (session?.accounting && rows) {
    assert.equal(session.accounting.requests, requests, "GITHUB_FAILURE_REQUEST_COUNT_CHANGED");
    assert.equal(session.accounting.confirmed, confirmed, "GITHUB_FAILURE_CONFIRMED_USAGE_CHANGED");
  }
  const calls = session?.trajectory?.calls ?? [];
  const tape = trajectoryPath(session);
  let attempted = [];
  if (tape) {
    const trace = readStream(join(directory, tape), evidence.sources[tape]);
    attempted = calls.filter(call => call.tool === "palimpsest_work" && call.action === "conclude").map(call => {
      const answers = trace.filter(event => event.type === "tool/result" && event.data.message.toolCallId === call.callId);
      assert(answers.length <= 1 && (answers[0]?.seq ?? null) === call.result, "GITHUB_FAILURE_CONCLUSION_PAIR_CHANGED");
      let answer;
      try { answer = JSON.parse((answers[0]?.data.message.content ?? []).map(block => block.text ?? "").join("\n")); }
      catch { /* A non-JSON response has no structured conclusion evidence. */ }
      return { intent: call.intent, request: call.request, callId: call.callId, result: call.result,
        state: answer?.state ?? null, blockers: answer?.blockers ?? answer?.readiness?.deliveryBlockers ?? answer?.check?.deliveryBlockers ?? [],
        ...(answer?.state === "REFUSED" && answer.readiness ? { openTasks: answer.readiness.openTasks,
          openAttempts: answer.readiness.openAttempts } : {}) };
    });
  }
  return {
    accounting: { requests, settled, unknown, confirmed, bound: session?.requestBinding?.boundRequests ?? null,
      usage: unknown > 0 ? "UNKNOWN" : requests === 0 ? "ZERO_REQUESTS"
        : requests !== null && settled === requests ? "SETTLED" : "UNCONFIRMED",
      attribution: session?.attributionState ?? null },
    delivery: { natural: session?.execution?.natural ?? null, saved: submission?.facts.candidateSaved ?? null,
      formal: submission?.facts.delivery ?? null, previous: session?.conclusion?.eventId ?? null,
      intent: session?.conclusion?.intent ?? null, attempted,
      readinessCalls: calls.filter(call => call.tool === "palimpsest_work" && call.action === "readiness").length },
  };
}

export function probeCounts(output) {
  const count = name => {
    const match = new RegExp("^(?:#|ℹ) " + name + " (\\d+)\\s*$", "mu").exec(output);
    return match ? Number(match[1]) : null;
  };
  return { tests: count("tests"), passed: count("pass"), failed: count("fail"), skipped: count("skipped") };
}
