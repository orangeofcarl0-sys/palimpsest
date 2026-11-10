import { deepStrictEqual, equal, ok, rejects } from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  installProduct, inspectWorkRevision, WorkRevisionError,
  type InstallProductOptions, type TaskObligations, type WorkRevisionReceipt,
} from "palimpsest-dsh/product";

interface Fixture {
  readonly projectId: string;
  readonly taskId: string;
  readonly basis: string;
  readonly repository: string;
  readonly stateDir: string;
  readonly obligations: TaskObligations;
  readonly files: Readonly<Record<string, string>>;
  readonly correctionPath: string;
  readonly attemptId?: string;
}

const [mode, path] = process.argv.slice(2);
const fixture = JSON.parse(readFileSync(path!, "utf8")) as Fixture;
const { repository, projectId, taskId, basis, obligations, files } = fixture;
const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
const actor = "operator:mock";
const options: InstallProductOptions = {
  projectId, repository, stateDir: fixture.stateDir, execution: "worktree",
  standard: { statement: "Verify the revision scope.", confirmed: true, derivedFrom: [], notes: [],
    clauses: [{ kind: "scope_respected" }] },
  operatorAuthority: { policyRef: { policyId: "qualification-mock", version: "1" },
    authorize: identity => ({ authorized: identity === actor, role: identity === actor ? "operator" : "unknown" }) },
};
let worker: { pid: number; candidate: string; preview: WorkRevisionReceipt } | undefined;
const context = { tools: { register: () => undefined } };
const product = installProduct(context, mode === "prepare" ? {
  ...options, taskObligations: { [taskId]: obligations },
  workWorkerPort: () => ({ adapterId: "packaged-revision-fixture", async run({ workDir, context: attempt }) {
    const binding = attempt.revision;
    ok(binding);
    equal(binding.basis, basis);
    const isolated = join(fixture.stateDir, "fixture-worker", binding.attemptId);
    mkdirSync(isolated, { recursive: true });
    git(isolated, "clone", "--no-local", "--no-hardlinks", "--no-checkout", "--", repository, ".");
    git(isolated, "remote", "remove", "origin");
    git(isolated, "checkout", "--quiet", "--detach", basis);
    const child = `
      const fs = require('node:fs'), cp = require('node:child_process'), path = require('node:path');
      const input = JSON.parse(process.argv[1]);
      fs.readFileSync(input.correctionPath);
      for (const [file, content] of Object.entries(input.files)) {
        fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file,content);
      }
      cp.execFileSync('git',['add','--',...Object.keys(input.files)]);
      cp.execFileSync('git',['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','Mock revision']);
      process.stdout.write(String(process.pid));
    `;
    const pid = Number(execFileSync(process.execPath, ["-e", child, JSON.stringify({ files, correctionPath: fixture.correctionPath })],
      { cwd: isolated, encoding: "utf8" }));
    ok(pid > 0 && pid !== process.pid);
    const preview = inspectWorkRevision(isolated, binding);
    ok(preview.checks.every(check => check.passed));
    worker = { pid, candidate: preview.candidate, preview };
    git(workDir, "fetch", "--no-tags", "--", isolated, "HEAD");
    git(workDir, "checkout", "--quiet", "--detach", preview.candidate);
    return { kind: "READY_FOR_SETTLEMENT" };
  } }),
} : options);

try {
  if (mode === "prepare") {
    product.controller.start({ projectId, goal: "Apply and verify a source correction.", headCommit: basis, tasks: [] });
    product.application.work.control("plan", [{ reason: "A committed correction applies.", tasks: [{
      task_id: taskId, objective: "Commit the affected files and preserve protected inputs.", depends_on: [],
      write_paths: [...obligations.mayWrite], required_artifacts: [...obligations.mustExist],
    }] }]);
    const work = product.application.work;
    const job = await work.startWorker({ taskId });
    equal(job.state, "STARTED", job.detail);
    const deadline = Date.now() + 45_000;
    let found = (await work.workers()).jobs.find(row => row.jobId === job.jobId);
    while (found && !["FINISHED", "HOST_ERROR"].includes(found.phase) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100));
      found = (await work.workers()).jobs.find(row => row.jobId === job.jobId);
    }
    equal(found?.settlementState, "SETTLED", found?.settlementDetail ?? found?.hostError ?? "");
    ok(found?.receipt && worker);
    await work.control("run", [8]);
    const receipt = product.revision.readReceipt({ attemptId: found.receipt.attemptId });
    deepStrictEqual(receipt, { ...worker.preview, phase: "SETTLED" });
    equal(git(repository, "rev-parse", "HEAD"), basis);
    console.log(JSON.stringify({ receipt, worker }));
  } else if (mode === "accept") {
    ok(fixture.attemptId);
    const receipt = product.revision.readReceipt({ attemptId: fixture.attemptId });
    const request = { attemptId: receipt.attemptId, actor, basis, candidate: receipt.candidate, receiptId: receipt.receiptId };
    await rejects(product.revision.accept({ ...request, candidate: basis }),
      error => error instanceof WorkRevisionError && error.refusal.reason === "APPROVAL_SHA_MISMATCH");
    equal(git(repository, "rev-parse", "HEAD"), basis);
    const result = await product.revision.accept(request);
    deepStrictEqual(await product.revision.accept(request), result);
    console.log(JSON.stringify({ receipt, promotionId: result.promotionId, acceptedHead: result.resultingHeadCommit, wrongShaRefused: true }));
  } else {
    equal(mode, "read");
    ok(fixture.attemptId);
    const receipt = product.revision.readReceipt({ attemptId: fixture.attemptId });
    const acceptedHead = product.controller.work.project().head_commit;
    equal(git(repository, "rev-parse", "HEAD"), acceptedHead);
    equal(git(repository, "rev-parse", "HEAD^{tree}"), git(repository, "rev-parse", receipt.candidate + "^{tree}"));
    console.log(JSON.stringify({ receipt, acceptedHead }));
  }
} finally {
  await product.dispose();
}
