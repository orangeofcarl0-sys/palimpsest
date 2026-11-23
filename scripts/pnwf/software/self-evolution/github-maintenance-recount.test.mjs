
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { digest } from "../../energy/contract.mjs";
import { inspectArchivedDelivery } from "./github-maintenance-recount.mjs";

const repo = resolve(import.meta.dirname, "../../../..");
const evidence = join(repo, "evidence");
const summary = JSON.parse(readFileSync(join(evidence, "git-runtime-original-result.json")));
const trace = JSON.parse(readFileSync(join(evidence, "git-runtime-paired-facts.json")));

function concluded(candidate, eventId = "conclusion-new", path = "maintenance/git-runtime-handoff.md") {
  return {
    intent: "DELIVER",
    eventId,
    body: "<!-- pc1-episode-conclusion:v1 -->\n" + JSON.stringify({
      schema: "pc1-episode-conclusion/v1",
      intent: "DELIVER",
      artifacts: [path],
      check: { artifacts: [{ path, commit: candidate, committed: true }] },
    }),
  };
}

test("the retained archive separates original pass, settlement, natural exit, candidate and pulse", () => {
  const facts = inspectArchivedDelivery(summary, trace);
  assert.deepEqual(facts, {
    originalPass: true,
    natural: true,
    candidateSaved: true,
    candidate: "248a97730fb3e74948d0b56239876fcd01bbee4a",
    projectReadCall: "call_163cdeb6f06442c08e7f9bb2",
    delivery: null,
  });
  assert.equal(trace.usageState, "SETTLED");
  assert.equal(trace.attributionState, "COMPLETE");
  assert.equal(trace.accounting.unresolved, 0);
  assert.equal(summary.conclusion, null);
  assert.equal(trace.conclusion, null);
});

test("a DELIVER binds only when its artifact commit is the retained candidate", () => {
  const candidate = summary.submission.candidate;
  const correct = { ...trace, conclusion: concluded(candidate) };
  assert.equal(inspectArchivedDelivery(summary, correct).delivery, "conclusion-new");
  const prior = { ...trace, conclusion: concluded(candidate), previousConclusion: "conclusion-new" };
  assert.equal(inspectArchivedDelivery(summary, prior).delivery, null);
  const wrong = { ...trace, conclusion: concluded("f".repeat(40)) };
  assert.equal(inspectArchivedDelivery(summary, wrong).delivery, null);
  const uncommitted = concluded(candidate);
  uncommitted.body = uncommitted.body.replace('"committed":true', '"committed":false');
  assert.equal(inspectArchivedDelivery(summary, { ...trace, conclusion: uncommitted }).delivery, null);
  const unrelated = concluded(candidate);
  unrelated.body = unrelated.body.replace('"artifacts":["maintenance/git-runtime-handoff.md"]',
    '"artifacts":["maintenance/git-runtime-handoff.md","maintenance/other.md"]');
  assert.equal(inspectArchivedDelivery(summary, { ...trace, conclusion: unrelated }).delivery, null);
});

test("the summary copy is read when the paired trace has no conclusion", () => {
  const candidate = summary.submission.candidate;
  assert.equal(inspectArchivedDelivery({ ...summary, conclusion: concluded(candidate) }, trace).delivery, "conclusion-new");
});

test("only a successful actual pulse call counts as the project read", () => {
  const calls = [
    { tool: "palimpsest_work", action: "conclusion", callId: "work-call", ok: true },
    { tool: "palimpsest_continuity", action: "pulse", callId: "failed-pulse", ok: false },
    { tool: "palimpsest_continuity", action: "pulse", callId: "actual-pulse", ok: true },
  ];
  assert.equal(inspectArchivedDelivery(summary, { ...trace, calls }).projectReadCall, "actual-pulse");
  assert.equal(inspectArchivedDelivery(summary, { ...trace, calls: calls.slice(0, 2) }).projectReadCall, null);
});

test("the retained evidence bytes still match the evidence index", () => {
  const manifest = JSON.parse(readFileSync(join(evidence, "sources.json")));
  assert.equal(manifest.task, "delivery-readback");
  for (const source of manifest.sources) {
    assert.equal(digest(readFileSync(join(evidence, source.file))), source.sha256);
  }
});
