import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { commitAll, configureGit, git } from "../energy/contract.mjs";
import { REQUIRED, RETAINED, SCOPE } from "./contract.mjs";
import { guardSoftwareSettlement, guardSoftwareWork } from "./work-policy.mjs";

test("gRPC Work refuses an overbroad plan and a legacy delegation before dispatch", async () => {
  let executions = 0;
  const scope = [...SCOPE, RETAINED[0]];
  const task = { task_id: "fleet", write_paths: scope, required_artifacts: REQUIRED };
  const tool = guardSoftwareWork({ description: "Work", execute: () => ++executions }, () => ({
    work: { project: () => ({ tasks: [task] }) },
  }));
  for (const input of [{ action: "plan", tasks: [task] }, { action: "delegate", taskId: "fleet" }, { action: "run" }]) {
    const result = await tool.execute(input);
    assert.equal(result.reason, "SOFTWARE_REVISION_SCOPE_MISMATCH");
    assert.match(result.detail, /including comments/u);
  }
  assert.equal(executions, 0);
  await tool.execute({ action: "plan", tasks: [{ ...task, write_paths: REQUIRED }] });
  assert.equal(executions, 1);
});

test("takeover rejects a legacy broad envelope and comment-only drift before settlement", async t => {
  const repo = mkdtempSync(join(tmpdir(), "pnwf-software-scope-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  git(repo, "init", "-q");
  configureGit(repo);
  for (const path of [...SCOPE, ...RETAINED]) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), "// original\n");
  }
  const base = commitAll(repo, "Basis");
  for (const path of REQUIRED) writeFileSync(join(repo, path), "// revision\n");
  const candidate = commitAll(repo, "In scope");
  writeFileSync(join(repo, RETAINED[0]), "// changed comment\n");
  const outside = commitAll(repo, "Outside scope");
  const record = { state: "RUNNING", envelope: { base_commit: base, write_paths: [...SCOPE, RETAINED[0]] } };
  const observed = { workDir: repo, observedHead: outside };
  const settled = [];
  const controller = {
    attemptWorkRecord: () => record,
    observeAttemptResult: () => observed,
    settleMutatingWork: input => { settled.push(input); return { state: "SETTLED" }; },
  };
  guardSoftwareSettlement(controller);
  const takeover = { attemptId: "attempt-fleet", workerOutcome: { kind: "READY_FOR_SETTLEMENT" },
    observation: { path: "PRINCIPAL", takeover: { livenessBasis: "OBSERVED_EXIT" } } };
  assert.equal((await controller.settleMutatingWork(takeover)).reason, "SOFTWARE_REVISION_SCOPE_MISMATCH");
  record.envelope.write_paths = SCOPE;
  assert.equal((await controller.settleMutatingWork(takeover)).reason, "SOFTWARE_RESULT_OUTSIDE_SCOPE");
  assert.equal(settled.length, 0);
  git(repo, "checkout", "--quiet", "--detach", candidate);
  observed.observedHead = candidate;
  assert.equal((await controller.settleMutatingWork(takeover)).state, "SETTLED");
  assert.deepEqual(settled[0].observation, { ...takeover.observation, expectedResultCommit: candidate });
});
