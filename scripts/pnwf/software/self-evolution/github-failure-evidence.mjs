/** Re-derive a stopped GitHub session's facts from host-owned evidence. */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { readStream } from "../../analyze_energy_trajectory.mjs";
import { digest, readJson } from "../../energy/contract.mjs";
import { sealOf } from "./slot.mjs";
import { manifest } from "./workspace.mjs";

const files = ["submission-facts.json", "session.json", "request-ledger.sqlite", "candidate.bundle",
  "candidate.patch", "out/MAINTAIN/request-accounting.json", "out/MAINTAIN/run.json"];
const hashFile = path => digest(readFileSync(path));

function trajectoryPath(session) {
  const name = session?.trajectory?.stream;
  if (!name) return null;
  assert(!name.split("/").some(part => !part || part === "." || part === "..") &&
    /^[\w./-]+\.jsonl\.zstd$/u.test(name), "GITHUB_FAILURE_TRAJECTORY_PATH_INVALID");
  return "runtime-MAINTAIN/sessions/" + name;
}

export function readFailureEvidence(directory, work, project) {
  const get = name => existsSync(join(directory, name)) ? readJson(join(directory, name)) : null;
  const submission = get("submission-facts.json");
  const session = get("session.json");
  const ledger = "request-ledger.sqlite";
  const wal = ledger + "-wal";
  const hasWal = existsSync(join(directory, wal)) && readFileSync(join(directory, wal)).length > 0;
  if (work.settlement?.archive) assert(!hasWal, "GITHUB_FAILURE_SEALED_LEDGER_HAS_PENDING_WRITES");
  const tape = trajectoryPath(session);
  const captured = [...files, ...(tape ? [tape] : []), ...(hasWal ? [wal] : [])];
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
  return {
    project, attempt: work.attempt, work: work.id, issue: work.issue?.number ?? null,
    archive: work.settlement?.archive ?? sealOf({ sources, settlement: work.settlement ?? null }),
    release: work.releaseAtDispatch,
    target: { kind: "git", basis: work.releaseAtDispatch.candidate, candidate: submission?.submission.candidate ?? null },
    verdict: { state: work.state, reason: work.reason, review: work.review ?? null },
    checkpoint: existsSync(state) ? sealOf(manifest(state)) : null,
    sources,
  };
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
        state: answer?.state ?? null, blockers: answer?.check?.deliveryBlockers ?? [] };
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
