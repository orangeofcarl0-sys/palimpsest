import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { installProduct, inspectWorkRevision, type InstallProductOptions, type InstalledProduct } from "../src/product.js";

const taskId = "revise";
const obligations = { schemaVersion: 1 as const, mayWrite: ["b.txt", "a.txt"], mustChange: ["a.txt"],
  mustExist: ["b.txt", "a.txt"], mustPreserve: ["protected.txt"] };
const task = { task_id: taskId, objective: "Revise the committed artifact.", depends_on: [],
  write_paths: obligations.mayWrite, required_artifacts: obligations.mustExist };
const owner = "operator:mock";
const standard = { statement: "Verify scope.", confirmed: true, derivedFrom: [], notes: [],
  clauses: [{ kind: "scope_respected" as const }] };
const dispose: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of dispose.splice(0).reverse()) await cleanup();
});

function git(repo: string, ...args: string[]) {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function commit(repo: string) {
  git(repo, "add", "-A");
  git(repo, "-c", "user.email=fixture@example.invalid", "-c", "user.name=Fixture", "commit", "-qm", "fixture");
  return git(repo, "rev-parse", "HEAD");
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-work-revision-"));
  dispose.push(() => {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 3 }); }
    catch (error) {
      if (process.platform !== "win32" || !["EPERM", "EBUSY"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
      // The suite's temp hygiene retries after Node/SQLite have released native handles.
    }
  });
  const repository = join(root, "repo");
  mkdirSync(repository);
  git(repository, "init", "-q");
  for (const path of [...obligations.mayWrite, ...obligations.mustPreserve]) writeFileSync(join(repository, path), "basis\n");
  const basis = commit(repository);
  const options: InstallProductOptions = {
    projectId: "revision", repository, stateDir: join(root, "state"), execution: "worktree", standard,
    taskObligations: { [taskId]: obligations },
    operatorAuthority: { policyRef: { policyId: "mock", version: "1" },
      authorize: actor => ({ authorized: actor === owner, role: actor === owner ? "operator" : "agent" }) },
  };
  const open = (withRules = true) => {
    const product = installProduct({ tools: { register: () => undefined } }, {
      ...options, ...(withRules ? {} : { taskObligations: undefined }),
    });
    let closed = false;
    const close = async () => {
      if (closed) return;
      closed = true;
      await product.dispose();
    };
    dispose.push(close);
    return { product, close };
  };
  return { open, repository, basis };
}

function start(product: InstalledProduct, basis: string) {
  product.controller.start({ projectId: "revision", goal: task.objective, headCommit: basis, tasks: [task] });
}

const submit = (product: InstalledProduct, attemptId: string, candidate?: string) => product.controller.settleMutatingWork({
  attemptId, workerOutcome: { kind: "READY_FOR_SETTLEMENT" },
  observation: { path: "WORKER", expectedResultCommit: candidate },
});

test("rejects a broad plan before events and refuses a wrong basis before creating an attempt", async () => {
  const { open, repository, basis } = fixture();
  const { product } = open();
  const controller = product.controller;
  expect(() => controller.start({ projectId: "revision", goal: task.objective, headCommit: basis,
    tasks: [{ ...task, write_paths: ["a.txt", "protected.txt"] }] })).toThrow(/TASK_OBLIGATION_SCOPE_MISMATCH/u);
  expect(controller.store.listEvents("revision")).toHaveLength(0);
  start(product, basis);
  writeFileSync(join(repository, "a.txt"), "wrong basis\n");
  commit(repository);
  await expect(controller.prepareMutatingWork()).rejects.toThrow(/HEAD_BASIS_MISMATCH/u);
  expect(controller.status().attempts).toHaveLength(0);
});

test("previews and rejects missing, unchanged and protected paths in the same isolated world", async () => {
  const { open, basis } = fixture();
  const { product } = open();
  start(product, basis);
  const prepared = await product.controller.prepareMutatingWork();
  const { attemptId, worldPath } = prepared;
  const binding = (await product.controller.workWorkerAttemptContext(attemptId)).revision!;
  rmSync(join(worldPath, "b.txt"));
  const missing = commit(worldPath);
  expect(inspectWorkRevision(worldPath, binding, missing).checks.filter(check => !check.passed))
    .toMatchObject([{ kind: "MUST_CHANGE", path: "a.txt" }, { kind: "MUST_EXIST", path: "b.txt" }]);
  expect(await submit(product, attemptId, missing)).toMatchObject({ state: "NOT_READY",
    refusal: { reason: "REQUIRED_FILE_MISSING", paths: ["a.txt", "b.txt"], nextAction: "FIX_CANDIDATE" } });
  writeFileSync(join(worldPath, "a.txt"), "revised\n");
  writeFileSync(join(worldPath, "b.txt"), "basis\n");
  writeFileSync(join(worldPath, "protected.txt"), "basis\n# changed comment\n");
  const outside = commit(worldPath);
  expect(await submit(product, attemptId, outside)).toMatchObject({ state: "NOT_READY", reason: "PROTECTED_FILE_CHANGED" });
  expect(await product.application.work.relay({ taskId, route: "takeover", declareExecutorAbandoned: true }))
    .toMatchObject({ state: "NOT_READY", refusal: { reason: "PROTECTED_FILE_CHANGED", paths: ["protected.txt"] } });
  expect(() => product.controller.report(attemptId, { workerStatus: "completed", summary: "claimed success" }))
    .toThrow(/PROTECTED_FILE_CHANGED/u);
  expect(product.controller.attemptWorkRecord(attemptId)?.state).toBe("RUNNING");
});

test("reauthorizes a retained task from its persisted obligations after a restart without configuration", async () => {
  const { open, basis } = fixture();
  const { product, close } = open();
  start(product, basis);
  const first = product.controller.work.taskEnvelope(taskId)!;
  expect(first.required_artifacts).toEqual(task.required_artifacts);
  await close();
  const reopened = open(false).product;
  reopened.controller.planReconciled({ tasks: [task], goal: "Update the project's goal.", reason: "Retain the task." });
  const second = reopened.controller.work.taskEnvelope(taskId)!;
  expect(second.obligations).toEqual(first.obligations);
  expect(second.project_revision).toBeGreaterThan(first.project_revision);
  const prepared = await reopened.controller.prepareMutatingWork();
  expect((await reopened.controller.workWorkerAttemptContext(prepared.attemptId)).revision?.obligations).toEqual(first.obligations);
});

test("pins final report, deduplicates settlement and accepts the exact persisted receipt after reopening", async () => {
  const { open, repository, basis } = fixture();
  const { product, close } = open();
  start(product, basis);
  const { attemptId, worldPath } = await product.controller.prepareMutatingWork();
  writeFileSync(join(worldPath, "a.txt"), "candidate A\n");
  const candidate = commit(worldPath);
  const report = product.controller.report.bind(product.controller);
  const drift = vi.spyOn(product.controller, "report").mockImplementationOnce((...args) => {
    writeFileSync(join(worldPath, "a.txt"), "candidate B\n");
    commit(worldPath);
    return report(...args);
  });
  try {
    expect(await submit(product, attemptId, candidate)).toMatchObject({ state: "NOT_READY", reason: "RESULT_DRIFT" });
    expect(product.controller.attemptWorkRecord(attemptId)?.state).toBe("RUNNING");
  } finally { drift.mockRestore(); }
  git(worldPath, "checkout", "--quiet", "--detach", candidate);
  const binding = (await product.controller.workWorkerAttemptContext(attemptId)).revision!;
  const preview = inspectWorkRevision(worldPath, binding);
  const results = await Promise.all([submit(product, attemptId, candidate), submit(product, attemptId, candidate)]);
  for (const result of results) expect(result).toMatchObject({
    state: "SETTLED", receipt: { ...preview, phase: "SETTLED" },
  });
  expect(await submit(product, attemptId, candidate)).toMatchObject({ replayed: true });
  expect(await submit(product, attemptId, basis)).toMatchObject({ reason: "RESULT_ALREADY_RECORDED" });
  expect(product.controller.store.listEvents("revision").filter(event => event.event_type === "ATTEMPT_COMPLETED")).toHaveLength(1);
  while (product.controller.status().tasks[0]?.state !== "VERIFYING") expect(product.controller.step()).not.toBeNull();
  await close();
  const reopened = open(false).product;
  const receipt = reopened.revision.readReceipt({ attemptId });
  expect(receipt).toEqual({ ...preview, phase: "SETTLED" });
  expect(() => reopened.revision.readReceipt({ attemptId, path: "a.txt" })).toThrow(/REVISION_RECEIPT_SHA_MISMATCH/u);
  expect(reopened.revision.readReceipt({ attemptId, basis, candidate, path: "a.txt" }).checks.every(check => check.path === "a.txt")).toBe(true);
  const approval = { attemptId, actor: owner, basis, candidate, receiptId: receipt.receiptId };
  await expect(reopened.controller.promoteAttempt({ attemptId })).rejects.toThrow(/REVISION_APPROVAL_REQUIRED/u);
  await expect(reopened.revision.accept({ ...approval, candidate: basis })).rejects.toThrow(/APPROVAL_SHA_MISMATCH/u);
  await expect(reopened.revision.accept({ ...approval, actor: "agent:mock" })).rejects.toThrow(/OPERATOR_APPROVAL_REQUIRED/u);
  expect(git(repository, "rev-parse", "HEAD")).toBe(basis);
  const accepted = await reopened.revision.accept(approval);
  expect(await reopened.revision.accept(approval)).toEqual(accepted);
  await expect(reopened.revision.accept({ ...approval, candidate: basis })).rejects.toThrow(/APPROVAL_SHA_MISMATCH/u);
  expect(reopened.controller.work.project().head_commit).toBe(accepted.resultingHeadCommit);
  expect(reopened.controller.store.listEvents("revision").filter(event => event.event_type === "PROMOTION_COMMITTED")).toHaveLength(1);
  expect(() => reopened.controller.store.verifyFull()).not.toThrow();
});
