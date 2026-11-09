import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { BULLETIN, REVISION_PATHS, blob, commitAll, git, injectCorrection, makeSeed, normalizeSiteRows, readJson } from "./contract.mjs";
import { makeWorkerBroker, validateWorkerResult } from "./container-worker.mjs";
import { briefPulseTool } from "./context-variants.mjs";
import { revisionReviewTool } from "./revision-review.mjs";
import { CERTIFICATES, DELIVERABLES } from "./revision-scope.mjs";
import { guardRevisionWork, SETTLED_GUIDANCE } from "./revision-work.mjs";

const fixture = fileURLToPath(new URL("../../../fixtures/psvr/energy-deployment", import.meta.url));

test("the six-file T2 declaration is refused before changing Work or dispatching a Worker", async () => {
  let tasks = [{ task_id: "revise-hf-capacity", write_paths: DELIVERABLES }];
  const executed = [];
  const tool = guardRevisionWork({
    description: "Work",
    async execute(input) {
      executed.push(input.action);
      if (input.action === "plan") tasks = input.tasks;
    },
  }, () => tasks);
  for (const paths of [DELIVERABLES, ["deliverables"], REVISION_PATHS.slice(1), [...REVISION_PATHS.slice(1), REVISION_PATHS[1]]]) {
    await assert.rejects(tool.execute({ action: "plan", tasks: [{ write_paths: paths }] }), /ENERGY_REVISION_SCOPE_MISMATCH.*vendor-compliance\.md/u);
  }
  await assert.rejects(tool.execute({ action: "delegate", taskId: "revise-hf-capacity" }), /ENERGY_REVISION_SCOPE_MISMATCH/u);
  await assert.rejects(tool.execute({ action: "run" }), /ENERGY_REVISION_SCOPE_MISMATCH/u);
  assert.deepEqual(executed, []);
  await tool.execute({ action: "plan", tasks: [{ ...tasks[0], write_paths: [...REVISION_PATHS].reverse() }] });
  await tool.execute({ action: "delegate", taskId: "revise-hf-capacity" });
  assert.deepEqual(executed, ["plan", "delegate"]);
});

test("the broker rejects a mismatched Attempt context before allocating a peer", async () => {
  const out = mkdtempSync(join(tmpdir(), "pnwf-energy-scope-"));
  const basis = "a".repeat(40);
  const broker = makeWorkerBroker({ out, basis });
  const result = await broker.dispatch({
    workDir: "/run/stage/world/.palimpsest/worlds/revise-hf-capacity",
    context: { work: { baseCommit: basis, writeScope: DELIVERABLES } },
  });
  await broker.close();
  assert.equal(result.kind, "HOST_FAILURE");
  assert.match(result.detail, /ENERGY_REVISION_SCOPE_MISMATCH/u);
  assert.deepEqual(readdirSync(out), ["worker-receipts.json"]);
  assert.equal(readJson(join(out, "worker-receipts.json"))[0].containerId, undefined);
});

test("one Work query observes settlement and suggests the legal next action without executing it", async () => {
  const actions = [];
  let job = { jobId: "wdj-test", taskId: "revision", phase: "RUNNING", settlementState: null };
  const tool = guardRevisionWork({
    description: "Work",
    async execute(input) {
      actions.push(input.action);
      const snapshot = { ...job };
      job = { ...job, phase: "FINISHED", settlementState: "SETTLED" };
      return { jobs: [snapshot] };
    },
  }, () => [], { waitMs: 2000, pollMs: 1 });
  const view = await tool.execute({ action: "workers", taskId: "revision" });
  assert.equal(view.jobs[0].settlementState, "SETTLED");
  assert.equal(view.guidance, SETTLED_GUIDANCE);
  assert.deepEqual(actions, ["workers", "workers"]);
});

test("worker result transport checks exact basis and rejects non-deliverable paths", () => {
  const world = mkdtempSync(join(tmpdir(), "pnwf-energy-contract-"));
  const seed = makeSeed(world, fixture);
  const basis = injectCorrection(world);
  assert.equal(git(world, "diff", "--name-only", seed, basis), BULLETIN);
  assert.throws(() => validateWorkerResult(world, basis, seed), /WORKER_RESULT_BASIS_MISMATCH/u);
  mkdirSync(join(world, "deliverables"));
  writeFileSync(join(world, REVISION_PATHS[0]), "bounded revision\n");
  const result = commitAll(world, "Produce scoped candidate");
  assert.deepEqual(validateWorkerResult(world, basis, result), [REVISION_PATHS[0]]);
  writeFileSync(join(world, CERTIFICATES), "rewritten certificates\n");
  assert.throws(() => validateWorkerResult(world, basis, result), /WORKER_WORLD_DIRTY/u);
  const escaped = commitAll(world, "Modify a protected input");
  assert.throws(() => validateWorkerResult(world, basis, escaped), /WORKER_RESULT_OUTSIDE_SCOPE/u);
});

test("a receipt and its file expansion refer to the same clean candidate and preserve the certificate", async () => {
  const repo = mkdtempSync(join(tmpdir(), "pnwf-energy-review-"));
  makeSeed(repo, fixture);
  mkdirSync(join(repo, "deliverables"));
  for (const path of DELIVERABLES) writeFileSync(join(repo, path), "previous result\n");
  const basis = commitAll(repo, "Record approved review basis");
  for (const path of REVISION_PATHS) writeFileSync(join(repo, path), `new ${path}\n`);
  const candidate = commitAll(repo, "Record five changed artifacts");
  const tool = revisionReviewTool(() => ({ repo, basis, candidate, settlement: "SETTLED" }));
  const receipt = await tool.execute({});
  assert.equal(receipt.basis, basis);
  assert.equal(receipt.candidate, candidate);
  assert.deepEqual(new Set(receipt.paths), new Set(REVISION_PATHS));
  assert.deepEqual(receipt.certificate, { path: CERTIFICATES, blob: blob(repo, basis, CERTIFICATES), unchanged: true });
  assert.equal(Object.hasOwn(receipt, "diff"), false);
  await assert.rejects(tool.execute({ path: REVISION_PATHS[0] }), /REVISION_REVIEW_EXACT_SHA_REQUIRED/u);
  await assert.rejects(tool.execute({ basis: candidate, candidate, path: REVISION_PATHS[0] }), /REVISION_REVIEW_SHA_MISMATCH/u);
  await assert.rejects(tool.execute({ basis, candidate: basis, path: REVISION_PATHS[0] }), /REVISION_REVIEW_SHA_MISMATCH/u);
  await assert.rejects(tool.execute({ basis, candidate, path: CERTIFICATES }), /REVISION_REVIEW_PATH_OUTSIDE_SCOPE/u);
  const file = await tool.execute({ basis, candidate, path: REVISION_PATHS[0] });
  assert.match(file.diff, /new deliverables\/technical-capacity\.md/u);
  assert(!REVISION_PATHS.slice(1).some(path => file.diff.includes(path)));
  writeFileSync(join(repo, CERTIFICATES), "altered certificate\n");
  await assert.rejects(tool.execute({}), /WORKER_WORLD_DIRTY/u);
  const changed = commitAll(repo, "Attempt to rewrite certificate");
  await assert.rejects(tool.execute({}), /REVISION_REVIEW_CANDIDATE_MISMATCH/u);
  const tampered = revisionReviewTool(() => ({ repo, basis, candidate: changed, settlement: "SETTLED" }));
  await assert.rejects(tampered.execute({}), /WORKER_RESULT_OUTSIDE_SCOPE/u);
});

test("brief pulse keeps current authorization facts and can expand the original", async () => {
  const conclusion = { conclusionId: "old", intent: "WAIT_FOR_OPERATOR", basis: { headCommit: "before" },
    recordedAt: "2026-11-09", statement: "the old candidate needs review" };
  const readiness = { awaitingOperator: ["task:current"], blockers: ["worker not observed"] };
  const queue = [{ who: "OPERATOR", detail: "inspect the current result", advisory: true }];
  const full = { digest: "full-view-digest", basis: { headCommit: "now" }, episode: {
    state: "REOPENED", current: false, conclusion, readiness, changedSince: ["new material arrived"],
  }, decisionQueue: queue, execution: { attempts: [{ hostObserved: false }] },
  nextActions: { mechanical: ["workers"], decisionRelevant: ["operator: inspect the current result"] },
  coverage: { complete: false, unavailable: ["other source"], omitted: [] } };
  const inputs = [];
  const tool = briefPulseTool({ parameters: { properties: {} }, async execute(input) { inputs.push(input); return full; } });
  const brief = await tool.execute({ action: "pulse" });
  assert.equal(brief.sourcePulseDigest, full.digest);
  assert.equal(brief.episode.conclusion.conclusionId, conclusion.conclusionId);
  assert.equal(Object.hasOwn(brief.episode.conclusion, "statement"), false);
  assert.deepEqual(brief.episode.readiness, readiness);
  assert.deepEqual(brief.episode.changedSince, full.episode.changedSince);
  assert.deepEqual(brief.execution, full.execution);
  assert.deepEqual(brief.decisionQueue, queue);
  assert.deepEqual(brief.nextActions.mechanical, full.nextActions.mechanical);
  assert.equal(Object.hasOwn(brief.nextActions, "decisionRelevant"), false);
  assert.deepEqual(brief.coverage.unavailable, full.coverage.unavailable);
  assert.equal(brief.coverage.omitted.length, 2);
  assert.deepEqual(await tool.execute({ action: "pulse", detail: "full" }), full);
  assert.deepEqual(inputs, [{ action: "pulse" }, { action: "pulse" }]);
  full.episode = { ...full.episode, state: "WAITING_FOR_OPERATOR", current: true };
  assert.deepEqual((await tool.execute({ action: "pulse" })).episode.conclusion, conclusion);
});

test("the scorer accepts only unambiguous site aliases and retains all other data", () => {
  const rows = [{ site: "North Ridge", model: "K-900" }, { site: "Harbor Flats", model: "S-1080" }];
  assert.deepEqual(normalizeSiteRows(rows), [{ site: "NR", model: "K-900" }, { site: "HF", model: "S-1080" }]);
  assert.equal(rows[0].site, "North Ridge");
  assert.throws(() => normalizeSiteRows([{ site: "NR" }, { site: "North Ridge" }]), /SITE_ROWS_DUPLICATE/u);
  assert.throws(() => normalizeSiteRows([{ site: "NR" }, { site: "Harbor" }]), /SITE_ROWS_UNKNOWN_OR_INCOMPLETE/u);
});
