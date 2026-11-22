import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { apply, digest, publishReviewReceipt, readJson, receiptId } from "./tools.mjs";

const file = "equipment-review.xlsx";
const oldSession = resolve(import.meta.dirname, "../../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review-live/sufficient/initial/session.json");
const priorRun = resolve(import.meta.dirname, "../../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review-contract-rerun");
const revisionRun = resolve(priorRun, "../equipment-review-revision-rerun");
const benchPath = join(priorRun, "../equipment-review/inputs/bench.json");

async function fixture(t, persistent = false) {
  const root = mkdtempSync(join(tmpdir(), "local-equipment-tools-"));
  let journal;
  t.after(async () => {
    journal?.close();
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  });
  const draft = join(root, file);
  const publicFacts = join(root, "facts.json");
  const workbookModule = join(root, "workbook.mjs");
  const receiptPath = join(root, "receipt.json");
  writeFileSync(draft, '{"logger":["便携记录器","A","上一版",null,"供应商资料"]}');
  writeFileSync(publicFacts, '{"requirement":{"minimumMinutes":480}}');
  writeFileSync(workbookModule, `import { readFileSync, writeFileSync } from "node:fs";
export const readWorkbook = (path) => JSON.parse(readFileSync(path, "utf8"));
export const editWorkbook = (path, {choice,status,minutes,evidence}) =>
  writeFileSync(path, JSON.stringify({logger:["便携记录器",choice,status,minutes,evidence]}));`);
  const profile = { projectId: "equipment", localAssetCheckpoints: { root, paths: [file] } };
  async function open() {
    let workspace = { localAssetCheckpoints: { latest: () => null }, journal: async () => [] };
    if (persistent) {
      const { buildProjectIr, DEFAULT_HEAD_COMMIT } = await import("../../../dist/src/tools/controller.js");
      const { makeProjectWorkspaceService, SqliteProjectJournalStore } = await import("../../../dist/src/project_workspace/index.js");
      const { projectId } = profile;
      const ir = buildProjectIr({ projectId, goal: "设备维护", requirements: [], decisions: [], tasks: [],
        headCommit: DEFAULT_HEAD_COMMIT, committedAt: "2026-11-22T00:00:00Z" });
      const controller = { projectId, store: { connection: { prepare: () => ({ get: () => ({ state_json: Buffer.from(JSON.stringify(ir)) }) }) } } };
      journal = new SqliteProjectJournalStore(join(root, "journal.sqlite"));
      const service = makeProjectWorkspaceService({ controller, journal, localAssetCheckpoints: { ...profile.localAssetCheckpoints,
        databasePath: join(root, "checkpoints.sqlite") } });
      workspace = { ...service, recordJournalEntry: (input) => service.recordJournalEntry({ ...input, projectId }),
        resolveJournalEntry: (input) => service.resolveJournalEntry({ ...input, projectId }) };
    }
    const deployment = { transport: { adapterId: "disabled" }, installed: { application: { projectWorkspace: workspace } } };
    let tool;
    await apply({ tools: { register: (definition) => { tool = definition; } }, palimpsestHost: { profile, deployment } },
      { workbookModule, publicFacts, file, receiptPath });
    return { tool, workspace };
  }
  return { ...await open(), root, draft, receiptPath, reopen: async () => {
    journal.close();
    journal = undefined;
    return open();
  } };
}

test("the gap cold trace restores the exact prior checkpoint after the recorded project decision", async t => {
  const { root, draft } = await fixture(t);
  renameSync(draft, draft + ".fixture");
  const prior = readJson(join(revisionRun, "checkpoint-basis.json")).arms.gap;
  const recorded = readJson(join(revisionRun, "gap/resumed/session.json")).trace.calls.find((call) => call.seq === prior.restore.callSeq);
  assert(!recorded.ok && /checkpoint bytes or project basis/u.test(recorded.result));
  const state = join(revisionRun, "gap/state");
  const dbPath = join(root, "orchestration.sqlite");
  const databasePath = join(root, "local-asset-checkpoints.sqlite");
  copyFileSync(join(state, "orchestration.sqlite"), dbPath);
  copyFileSync(join(state, "local-asset-checkpoints.sqlite"), databasePath);
  const { EventStore } = await import("../../../dist/src/state/event_store.js");
  const { makeProjectWorkspaceService } = await import("../../../dist/src/project_workspace/index.js");
  const store = new EventStore(dbPath);
  try {
    const { projectId, basis } = prior.storedCheckpoint;
    const revised = store.listEvents(projectId).find((event) => event.event_type === "PROJECT_REVISED");
    assert.equal(revised.payload.project_ir.revision, basis.revision + 1);
    assert.equal(revised.payload.project_ir.decisions.length, 1);
    const checkpoints = makeProjectWorkspaceService({ controller: { projectId, store },
      localAssetCheckpoints: { root, paths: [file], databasePath } }).localAssetCheckpoints;
    const { path, checkpointId } = recorded.args;
    assert(!existsSync(draft));
    assert.deepEqual(checkpoints.restore(path, checkpointId), prior.storedCheckpoint);
    assert.deepEqual(readFileSync(draft), readFileSync(join(revisionRun, "gap/initial", file)));
    assert.deepEqual(checkpoints.latest(file), prior.storedCheckpoint);
  } finally { store.close(); }
});

test("inspect discloses the configured relative workbook path including before a cold restore", async t => {
  const { tool, draft } = await fixture(t);
  const before = await tool.execute({ action: "inspect" });
  assert.equal(before.workbookPath, file);
  assert(before.draft && before.checkpoint === null);
  renameSync(draft, draft + ".stopped");
  const cold = await tool.execute({ action: "inspect" });
  assert.equal(cold.workbookPath, file);
  assert.equal(cold.draft, null);
});

test("the old refused writes report their exact missing fields and preserve the draft", async t => {
  const { tool, draft } = await fixture(t);
  const before = readFileSync(draft);
  assert.match(tool.parameters.properties.minutes.description, /Required for write_recommendation/u);
  const oldCalls = readJson(oldSession).trace.calls.filter((call) => call.args.action === "write_recommendation");
  assert.equal(oldCalls.length, 3);
  for (const [i, { args }] of oldCalls.entries()) {
    await assert.rejects(tool.execute(args), i < 2 ? /write_recommendation requires minutes .*explicit null/u
      : /write_recommendation requires status, minutes, evidence/u);
    assert.deepEqual(readFileSync(draft), before);
  }
  const ask = readJson(oldSession).trace.calls.find((call) => call.args.action === "request_review");
  await assert.rejects(tool.execute(ask.args), /request_review requires checkpointId/u);
});

test("write accepts measured minutes and explicit null and identifies invalid values", async t => {
  const { tool } = await fixture(t);
  const args = { action: "write_recommendation", choice: "A", status: "建议", evidence: "PUBLIC-P17" };
  await assert.rejects(tool.execute({ ...args, minutes: -1 }), /INVALID_EQUIPMENT_RECOMMENDATION: minutes/u);
  assert.equal((await tool.execute({ ...args, minutes: 540 })).logger[3], 540);
  assert.equal((await tool.execute({ ...args, status: "待复核", minutes: null })).logger[3], null);
});

function makeReceipt(request) {
  const body = { projectId: "equipment", requestId: request.id, checkpointId: request.checkpointId,
    reviewer: "bench-custodian", sourceSha256: digest(readFileSync(benchPath)), measurement: readJson(benchPath) };
  return { id: receiptId(body), ...body };
}

for (const arm of ["sufficient", "gap"]) {
  test(`the recorded ${arm} reissue replaces its old checkpoint and refuses the old receipt after restart`, async t => {
    const rig = await fixture(t, true);
    const { tool, workspace } = rig;
    const calls = readJson(join(priorRun, arm, "initial/session.json")).trace.calls;
    const registered = calls.find((call) => call.args.action === "request_review" && call.ok);
    const rejected = calls.find((call) => call.args.action === "request_review" && !call.ok);
    assert.match(rejected.result, /OPEN_REVIEW_ALREADY_EXISTS/u);
    assert.notEqual(registered.args.checkpointId, rejected.args.checkpointId);
    const original = workspace.localAssetCheckpoints.save(file);
    const old = await tool.execute({ ...registered.args, checkpointId: original.id });
    const originalRow = (await workspace.journal()).find(({ entry }) => entry.entryId === old.id).entry;
    const olderReceipt = makeReceipt(old);
    publishReviewReceipt(rig.receiptPath, olderReceipt);
    assert.deepEqual((await tool.execute({ action: "read_receipt", requestId: old.id, checkpointId: original.id })).receipt, olderReceipt);

    const recordedWrites = calls.filter((call) => call.seq > registered.seq && call.seq < rejected.seq && call.args.action === "write_recommendation" && call.ok);
    assert(recordedWrites.length > 0);
    for (const { args } of recordedWrites) await tool.execute(args);
    const current = workspace.localAssetCheckpoints.save(file);
    const newDraft = readFileSync(rig.draft);
    assert.notEqual(current.id, original.id);
    assert.equal((await tool.execute({ action: "inspect" })).reviewBasis.state, "STALE");
    const newArgs = { ...rejected.args, checkpointId: current.id };
    const [replacement, same] = await Promise.all([tool.execute(newArgs), tool.execute(newArgs)]);
    assert.deepEqual(replacement, same);
    assert.equal(replacement.supersedes, old.id);
    await assert.rejects(tool.execute({ ...newArgs, question: "另一项核对" }), /OPEN_REVIEW_ALREADY_EXISTS/u);
    const { tool: cold, workspace: restarted } = await rig.reopen();
    const history = await restarted.journal();
    assert.equal(history.length, 2);
    assert.deepEqual(history[0].entry, originalRow);
    assert.equal(history[0].resolution.status, "DISMISSED");
    assert.equal(history[1].entry.supersedes, old.id);
    const historical = (await cold.execute({ action: "inspect", requestId: old.id })).review;
    assert.equal(historical.state, "SUPERSEDED");
    assert.equal(historical.supersededBy, replacement.id);
    assert.deepEqual((await cold.execute({ action: "inspect" })).review, replacement);
    await assert.rejects(cold.execute({ action: "read_receipt", requestId: old.id, checkpointId: original.id }), /REVIEW_REQUEST_SUPERSEDED/u);
    await assert.rejects(cold.execute({ action: "resolve_review", requestId: old.id, receiptId: olderReceipt.id }), /REVIEW_REQUEST_SUPERSEDED/u);
    const writeArgs = { action: "write_recommendation", choice: "B", status: "建议", minutes: 550 };
    await assert.rejects(cold.execute({ ...writeArgs, evidence: "实测依据 " + olderReceipt.id }), /REVIEW_RECEIPT_BINDING_MISMATCH/u);
    assert.deepEqual(readFileSync(rig.draft), newDraft);
    assert.equal((await cold.execute({ action: "read_receipt", requestId: replacement.id, checkpointId: current.id })).receipt, null);
    const nextReceipt = makeReceipt(replacement);
    publishReviewReceipt(rig.receiptPath, nextReceipt);
    assert.deepEqual(readJson(join(dirname(rig.receiptPath), "receipts", old.id + ".json")), olderReceipt);
    assert.deepEqual((await cold.execute({ action: "read_receipt", requestId: replacement.id, checkpointId: current.id })).receipt, nextReceipt);
    await assert.rejects(cold.execute({ ...writeArgs, evidence: olderReceipt.measurement.id, receiptId: olderReceipt.id }),
      /REVIEW_RECEIPT_BINDING_MISMATCH/u);
    assert.deepEqual(readFileSync(rig.draft), newDraft);
    const evidence = arm === "gap" ? "联机台架实测 550 分钟，依据 " + nextReceipt.id : nextReceipt.id;
    await cold.execute({ ...writeArgs, evidence });
    restarted.localAssetCheckpoints.save(file);
    assert.equal((await cold.execute({ action: "resolve_review", requestId: replacement.id, receiptId: nextReceipt.id })).state, "RESOLVED");
  });
}

test("the sufficient cold trace adopts its measurement narrative with a tool-written receipt ID and closes", async t => {
  const rig = await fixture(t, true);
  const calls = readJson(join(revisionRun, "sufficient/resumed/session.json")).trace.calls;
  const before = calls.find((call) => call.args.action === "read_receipt" && call.result?.receipt);
  const write = calls.find((call) => call.seq > before.resultSeq && call.args.action === "write_recommendation" && call.ok);
  const failure = calls.findLast((call) => call.args.action === "resolve_review" && /EVIDENCE_MISMATCH/u.test(call.result));
  assert.equal(failure.args.receiptId, before.result.receipt.id);
  assert(write.args.evidence.includes(before.result.receipt.measurement.id));
  assert(!write.args.evidence.includes(failure.args.receiptId));
  const { tool, workspace } = rig;
  const source = workspace.localAssetCheckpoints.save(file);
  const request = await tool.execute({ action: "request_review", checkpointId: source.id, question: before.result.request.question });
  const receipt = makeReceipt(request);
  publishReviewReceipt(rig.receiptPath, receipt);
  const read = await tool.execute({ ...before.args, requestId: request.id, checkpointId: source.id });
  assert.deepEqual(read.receipt, receipt);
  assert.deepEqual(read.adopt.args, { action: "write_recommendation", receiptId: receipt.id });
  const close = { ...failure.args, requestId: request.id, receiptId: receipt.id };

  const original = readFileSync(rig.draft);
  await assert.rejects(tool.execute({ ...write.args, receiptId: failure.args.receiptId }), /REVIEW_RECEIPT_BINDING_MISMATCH/u);
  await assert.rejects(tool.execute({ ...write.args, receiptId: receipt.id.slice(0, 30) }), /REVIEW_RECEIPT_BINDING_MISMATCH/u);
  assert.deepEqual(readFileSync(rig.draft), original);
  await tool.execute(write.args);
  workspace.localAssetCheckpoints.save(file);
  await assert.rejects(tool.execute(close), /saved evidence must include the full receipt ID/u);
  assert.equal((await workspace.journal())[0].resolution, undefined);

  renameSync(rig.draft, rig.draft + ".unbound");
  workspace.localAssetCheckpoints.restore(file, source.id);
  assert.deepEqual(workspace.localAssetCheckpoints.save(file), source);
  const applied = await tool.execute({ ...write.args, ...read.adopt.args });
  assert.deepEqual(applied.logger.slice(1, 4), ["B", "建议", 550]);
  assert.equal(applied.logger[4], write.args.evidence + "\n复核回执 " + receipt.id);
  await assert.rejects(tool.execute(close), /save the revised workbook/u);
  const saved = workspace.localAssetCheckpoints.save(file);
  assert.deepEqual(applied.next[1].args, close);
  assert.equal((await tool.execute(close)).state, "RESOLVED");
  const { workspace: reopened } = await rig.reopen();
  assert.equal((await reopened.journal())[0].resolution.detail, receipt.id + " applied in " + saved.id);
});
