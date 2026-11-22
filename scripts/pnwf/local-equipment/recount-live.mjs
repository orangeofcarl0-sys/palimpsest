import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { readStream } from "../analyze_energy_trajectory.mjs";
import { readEquipmentTrace, reconcileEquipmentUsage } from "./live-trajectory.mjs";
import { archivedUnknown } from "./prior-unknown.mjs";
import { digest, readJson, receiptId } from "./tools.mjs";

assert(process.argv.length === 3, "Usage: local-equipment/recount-live.mjs <live-evidence-directory>");
const root = resolve(process.argv[2]);
const sha = (path) => digest(readFileSync(path));
const contract = readJson(join(root, "contract.json"));
const frozen = readJson(join(root, "frozen.json"));
const result = readJson(join(root, "result.json"));
const original = join(root, "../equipment-review");
const goal = readFileSync(join(original, "inputs/prompt.txt"), "utf8");
const scenario = readJson(join(import.meta.dirname, "contract.json"));
assert.equal(sha(join(original, "frozen.json")), frozen.firstFreeze);
assert.deepEqual(readJson(join(original, "frozen.json")).inputs, frozen.inputs);
assert.equal(contract.frozenSha256, sha(join(root, "frozen.json")));
assert.equal(contract.qualificationSha256, sha(join(root, "live-profile-mock.json")));
assert.equal(contract.goalSha256, frozen.inputs["prompt.txt"]);
for (const [name, expected] of Object.entries(frozen.inputs)) assert.equal(sha(join(original, "inputs", name)), expected);
if (contract.priorUnknownSha256 !== undefined) {
  const seal = join(root, "prior-unknown-13.json");
  assert.equal(sha(seal), contract.priorUnknownSha256);
  assert.deepEqual(readJson(seal), archivedUnknown());
}

function bindSettledPrefix(ledger, observations, trace) {
  if (!trace || ledger.unresolvedRequests === 0) return null;
  const index = ledger.requests.findIndex((request) => request.state !== "SETTLED");
  if (index < 1) return null;
  const cutoff = observations.findIndex((row) => row.kind === "ADMITTED" && row.requestId === ledger.requests[index].id);
  if (cutoff < 0) return null;
  const firstUnsettled = observations[cutoff];
  const steps = trace.steps.filter((row) => row.time < firstUnsettled.atMs);
  if (steps.length !== index) return null;
  const requests = ledger.requests.slice(0, index);
  const confirmed = requests.reduce((total, row) => total + row.actual, 0);
  const prefix = reconcileEquipmentUsage({ ...ledger, requests, confirmed, unresolvedRequests: 0 }, observations.slice(0, cutoff), { ...trace, steps });
  return { bound: prefix.bindings.length, confirmed, bindings: prefix.bindings, bindingError: prefix.bindingError,
    dshAfterCutoff: trace.steps.filter((row) => row.time >= firstUnsettled.atMs).map((row) => ({ seq: row.seq, usage: row.data.usage })) };
}

function readPhase(dir) {
  const summaryPath = join(dir, "session.json");
  if (!existsSync(summaryPath)) return null;
  const session = readJson(summaryPath);
  const ledger = readJson(join(dir, "request-accounting.json"));
  const ledgerUrl = pathToFileURL(join(dir, "ledger.sqlite"));
  ledgerUrl.searchParams.set("immutable", "1");
  const db = new DatabaseSync(ledgerUrl.href, { readOnly: true });
  try {
    const requests = db.prepare("SELECT * FROM requests ORDER BY rowid").all()
      .map((row) => ({ ...row, usage: row.usage === null ? null : JSON.parse(row.usage) }));
    assert.deepEqual(requests, ledger.requests);
  } finally { db.close(); }
  const path = join(dir, "session.jsonl.zstd");
  const trace = existsSync(path) ? readEquipmentTrace(path, goal) : null;
  if (trace) {
    assert.equal(trace.sessionId, session.readiness.sessionId);
    assert.deepEqual(trace.calls, session.trace.calls);
    assert.equal(trace.streamSha256, session.trace.streamSha256);
    assert.equal(trace.goalMatches, session.trace.goalMatches);
    assert.equal(trace.completed, session.trace.completed);
  }
  const observed = readFileSync(join(dir, "request-observations.jsonl"), "utf8").split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
  const usage = reconcileEquipmentUsage(ledger, observed, trace);
  assert.deepEqual(usage, session.usage);
  if (session.state.final) assert.equal(sha(join(dir, scenario.workbook)), session.state.final.digest);
  const turnEnd = trace && readStream(path, trace.streamSha256).findLast((row) => row.type === "turn/end");
  const prefix = bindSettledPrefix(ledger, observed, trace);
  return { session, trace, ledger, usage, prefix, turnEnd: turnEnd ? { seq: turnEnd.seq, reason: turnEnd.data.reason } : null };
}

const successful = (run, name, action) => run?.trace?.calls.filter((call) => call.ok && call.name === name && call.args.action === action) ?? [];
const workbookRow = (row) => row === undefined ? null : { B5: row[1], C5: row[2], D5: row[3], E5: row[4] };

function summary(run) {
  if (!run) return null;
  const { session, trace, ledger, usage, prefix, turnEnd } = run;
  const draft = session.state.final;
  return { sessionId: session.readiness?.sessionId ?? null, natural: session.natural, stopReason: session.stopReason,
    durationMs: session.durationMs, requests: ledger.requests.length, settled: ledger.requests.filter((row) => row.state === "SETTLED").length,
    bound: usage.bindings.length, bindingError: usage.bindingError, totals: usage.totals, confirmed: ledger.confirmed, unknown: ledger.unresolvedRequests,
    settledPrefix: prefix, turnEnd, lastUnsettled: usage.requests.findLast((row) => row.state !== "SETTLED") ?? null,
    toolCalls: trace?.calls.length ?? 0, paired: trace?.calls.filter((call) => call.resultSeq !== null).length ?? 0,
    errors: trace?.calls.filter((call) => !call.ok).map(({ name, args, seq, resultSeq, result }) => ({ name, action: args.action, seq, resultSeq, result })) ?? [],
    final: workbookRow(draft?.logger), scannerPreserved: draft ? isDeepStrictEqual(draft.scanner, scenario.expected.retainedRow) : null,
    snapshotCurrent: draft ? session.state.checkpoint?.digest === draft.digest : null,
    workspace: { files: session.state.workspaceFiles, noGit: session.state.noGit, noA2A: session.state.noA2A },
    exactUserGoal: trace?.goalMatches ?? null };
}

function revisionHistory(run) {
  const journal = run?.session.state.journal ?? [];
  const bindingOf = (entry) => entry.relatedRefs.find((ref) => ref.kind === "local_equipment_review")?.id;
  return journal.flatMap(({ entry, resolution }) => {
    const checkpointId = bindingOf(entry);
    if (!entry.supersedes || !checkpointId) return [];
    const old = journal.find((row) => row.entry.entryId === entry.supersedes);
    assert(old && old.resolution?.status === "DISMISSED" && old.resolution.detail.includes(entry.entryId));
    const oldCheckpoint = bindingOf(old.entry);
    assert(oldCheckpoint && oldCheckpoint !== checkpointId);
    return [{ requestId: entry.entryId, checkpointId, state: resolution?.status ?? "PENDING", supersedes: old.entry.entryId,
      oldCheckpoint, oldDigest: old.entry.digest }];
  });
}

const outcomes = {};
for (const arm of ["sufficient", "gap"]) {
  const dir = join(root, arm);
  const before = readPhase(join(dir, "initial"));
  const after = readPhase(join(dir, "resumed"));
  const outcome = { initial: summary(before), resumed: summary(after) };
  const inspection = successful(before, "equipment_review", "inspect")[0];
  const ask = successful(before, "equipment_review", "request_review")[0];
  const firstProvisional = successful(before, "equipment_review", "write_recommendation").find((call) => call.args.status === "待复核");
  outcome.evidence = { publicFactsAt: inspection?.resultSeq ?? null, publicCondition: inspection?.result?.facts?.measurement?.condition ?? null,
    firstProvisionalAt: firstProvisional?.seq ?? null, principalRequestAt: ask?.seq ?? null, request: ask?.result ?? null };
  if (contract.journalFix) outcome.revisions = { initial: revisionHistory(before), resumed: revisionHistory(after) };
  if (after) {
    const cold = readJson(join(dir, "cold-start.json"));
    const requested = cold.question ?? cold.pending.find((entry) => entry.checkpointId !== null) ?? null;
    const receiptPath = join(dir, "receipt.json");
    const receipt = existsSync(receiptPath) ? readJson(receiptPath) : null;
    assert(before && before.session.home !== after.session.home && before.session.readiness.sessionId !== after.session.readiness.sessionId);
    if (receipt) {
      const { id, ...body } = receipt;
      assert.equal(id, receiptId(body));
      assert.equal(body.sourceSha256, frozen.inputs["bench.json"]);
      assert.deepEqual(body.measurement, readJson(join(original, "inputs/bench.json")));
      assert.equal(body.requestId, cold.question.id);
      assert.equal(body.checkpointId, cold.checkpoint.id);
      assert.equal(body.projectId, after.session.projectId);
      assert.equal(body.reviewer, "bench-custodian");
    }
    const restore = successful(after, "palimpsest_asset_checkpoint", "restore").find((call) =>
      cold.usableCheckpoint && call.args.checkpointId === cold.checkpoint.id && call.result.digest === cold.draftDigest);
    const observed = after.trace?.calls.find((call) => call.ok && requested &&
      [call.result?.review, call.result?.request].some((item) => item?.id === requested.id && item.state === "PENDING"));
    const read = successful(after, "equipment_review", "read_receipt").find((call) =>
      receipt !== null && call.result?.receipt?.id === receipt.id);
    const resolved = successful(after, "equipment_review", "resolve_review").find((call) =>
      call.result.id === requested?.id && call.result.state === "RESOLVED");
    const writes = successful(after, "equipment_review", "write_recommendation");
    const write = writes.find((call) =>
      read && call.seq > read.resultSeq && call.result?.logger?.[1] === after.session.state.final?.logger?.[1]);
    const beforeChoice = before.session.state.final?.logger[1] ?? null;
    const beforeReceiptChoice = read ? (writes.findLast((call) => call.resultSeq < read.resultSeq)?.result.logger[1] ?? beforeChoice) : null;
    const afterChoice = after.session.state.final?.logger[1] ?? null;
    const finalEvidence = after.session.state.final?.logger[4];
    outcome.cold = { draftAbsentAtLaunch: cold.draftAbsentAtLaunch, stoppedDraftMatches: cold.stoppedDraftMatches,
      usableCheckpoint: cold.usableCheckpoint, restoredAt: restore?.resultSeq ?? null, readBackSameQuestionAt: observed?.resultSeq ?? null,
      pendingRequest: requested?.id ?? null, pendingRequestCheckpoint: requested?.checkpointId ?? null,
      checkpointAtColdStart: cold.checkpoint?.id ?? null,
      receipt: receipt?.id ?? null, receiptAt: read?.resultSeq ?? null, wroteFinalChoiceAfterReceiptAt: write?.resultSeq ?? null,
      resolvedAt: resolved?.resultSeq ?? null, beforeChoice, beforeReceiptChoice, afterChoice,
      receiptBoundInWorkbook: receipt !== null && typeof finalEvidence === "string" && finalEvidence.includes(receipt.id),
      changedB5AfterReceipt: beforeReceiptChoice !== null && afterChoice !== null && beforeReceiptChoice !== afterChoice && Boolean(write),
      ...(contract.journalFix ? { measurementCitedAtChange: Boolean(write && receipt &&
        typeof write.result?.logger?.[4] === "string" && write.result.logger[4].includes(receipt.measurement.id)) } : {}),
    };
  }
  outcomes[arm] = outcome;
}
console.log(JSON.stringify({ blocked: result.blocked, originalInputsPreserved: result.originalInputsPreserved, outcomes }, null, 2));
