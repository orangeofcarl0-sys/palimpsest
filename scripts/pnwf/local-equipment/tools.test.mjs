import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { apply, readJson } from "./tools.mjs";

const file = "equipment-review.xlsx";
const oldSession = resolve(import.meta.dirname, "../../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review-live/sufficient/initial/session.json");

async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "local-equipment-tools-"));
  t.after(() => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    rmSync(root, { recursive: true, force: true });
  });
  const draft = join(root, file);
  const publicFacts = join(root, "facts.json");
  const workbookModule = join(root, "workbook.mjs");
  writeFileSync(draft, '{"logger":["便携记录器","A","上一版",null,"供应商资料"]}');
  writeFileSync(publicFacts, '{"requirement":{"minimumMinutes":480}}');
  writeFileSync(workbookModule, `import { readFileSync, writeFileSync } from "node:fs";
export const readWorkbook = (path) => JSON.parse(readFileSync(path, "utf8"));
export const editWorkbook = (path, {choice,status,minutes,evidence}) =>
  writeFileSync(path, JSON.stringify({logger:["便携记录器",choice,status,minutes,evidence]}));`);
  let tool;
  await apply({ tools: { register: (definition) => { tool = definition; } }, palimpsestHost: {
    profile: { projectId: "equipment", localAssetCheckpoints: { root, paths: [file] } },
    deployment: { transport: { adapterId: "disabled" }, installed: { application: { projectWorkspace: {
      localAssetCheckpoints: { latest: () => null }, journal: async () => [],
    } } } },
  } }, { workbookModule, publicFacts, file, receiptPath: join(root, "receipt.json") });
  return { tool, draft };
}

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
