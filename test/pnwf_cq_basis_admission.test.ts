/**
 * PNWF-CQ-H follow-up — operator-mediated direct basis admission.
 *
 * A direct commit can become the canonical governed basis only through a trusted operator surface:
 * checked-out commit, clean tree, current head is an ancestor, no promotion effect ahead, an audit
 * approval, and the SAME `planReconciled` batch. No ATTEMPT_COMPLETED or PROMOTION_COMMITTED.
 */
import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

import { installProduct, type InstallProductOptions } from "../src/product.js";
import { callbackRuntimeCarrierPort } from "../src/runtime/index.js";
import type { ProjectStandard } from "../src/domain/standard.js";
import { signOperatorToken } from "../src/project_review/index.js";
import { runProductCommand } from "../src/cli_product.js";
import type { OperatorAuthorityPort } from "../src/project_review/types.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const standard: ProjectStandard = Object.freeze({
  statement: "the declared artifact exists and every write stays inside its task scope",
  clauses: Object.freeze([Object.freeze({ kind: "scope_respected" as const })]),
  derivedFrom: Object.freeze(["PNWF-CQ basis fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

function workspace(name: string): { root: string; repo: string; stateDir: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), `palimpsest-pnwf-cq-basis-${name}-`));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "docs"), { recursive: true });
  writeFileSync(join(repo, "README.md"), "# basis base\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "base"], { cwd: repo });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* Windows may still hold a SQLite handle */
    }
  });
  return { root, repo, stateDir: join(root, "state"), head };
}

const authority: OperatorAuthorityPort = { policyRef: { policyId: "test-verified-operator", version: "1" },
  authorize: actor => ({ authorized: actor === "operator:alice", role: actor === "operator:alice" ? "operator" : "unknown" }) };
function install(repo: string, stateDir: string, operatorAuthority: OperatorAuthorityPort | null = authority, advanced?: InstallProductOptions["advanced"]) {
  const installed = installProduct(
    { tools: { register: () => () => undefined } } as never,
    { projectId: "pnwf-cq-basis", repository: repo, stateDir, execution: "worktree", standard, toolProfile: "normal", operatorAuthority: operatorAuthority ?? undefined, advanced },
  );
  cleanups.push(() => void installed.dispose());
  return installed;
}

async function started(installed: ReturnType<typeof install>, head: string): Promise<void> {
  await installed.tools
    .find((entry) => entry.name === "palimpsest_start")!
    .execute(
      {
        projectId: "pnwf-cq-basis",
        goal: "direct outcome then governed continuation",
        headCommit: head,
        tasks: [
          {
            task_id: "governed-next",
            objective: "continue from the direct outcome",
            depends_on: [],
            write_paths: ["docs"],
            required_artifacts: ["docs/next.md"],
          },
        ],
      },
      { callId: "start", rootCallId: "start", arguments: {}, name: "palimpsest_start", signal: new AbortController().signal },
    );
}

function directCommit(repo: string, file: string, body: string): string {
  mkdirSync(join(repo, "docs"), { recursive: true });
  writeFileSync(join(repo, file), body);
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "direct"], { cwd: repo });
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
}

function admit(installed: ReturnType<typeof install>, commit: string, reason = "the direct outcome is the intended basis") {
  const current = installed.controller.work.project();
  return installed.controller.planReconciled(
    { tasks: current.tasks.map((task) => ({ ...task })), reason },
    { headAdvance: { source: "DIRECT_BASIS", toHead: commit, operator: "operator:alice", reason } },
  );
}

describe("PNWF-CQ-H — operator-mediated direct basis admission", () => {
  it("keeps a new governed project free of invented Direct-outcome guidance", async () => {
    const { repo, stateDir, head } = workspace("fresh-governed");
    const installed = install(repo, stateDir);
    await started(installed, head);
    const status = installed.controller.status();
    expect(status.directOutcome?.relation).toBe("IN_SYNC");
    expect(status.nextAction.kind).toBe("EXECUTE_SCHEDULER_STEP");
    expect(status.nextAction.semantic).toBeUndefined();
  });

  it("refuses a conflicted promotion history with zero revision writes", async () => {
    const { repo, stateDir, head } = workspace("conflict");
    const installed = install(repo, stateDir);
    await started(installed, head);
    const commit = directCommit(repo, "docs/direct.md", "direct\n");
    const status = installed.controller.promotions.projectHeadStatusSync();
    const spy = vi.spyOn(installed.controller.promotions, "projectHeadStatusSync").mockReturnValue({ ...status, state: "CONFLICT" });
    try { expect(() => admit(installed, commit)).toThrow(/DIRECT_BASIS_HEAD_CONFLICT/u); }
    finally { spy.mockRestore(); }
    expect(installed.controller.work.project().head_commit).toBe(head);
    expect(installed.controller.store.listEvents("pnwf-cq-basis").some(e => e.event_type === "MANUAL_APPROVAL_RECORDED")).toBe(false);
  });

  it("rejects arbitrary operator strings without deployment authority, and an agent-role decision", async () => {
    for (const port of [null, { policyRef: { policyId: "agent-only", version: "1" }, authorize: () => ({ authorized: true, role: "agent" as const }) }]) {
      const { repo, stateDir, head } = workspace("authority");
      const installed = install(repo, stateDir, port);
      await started(installed, head);
      const commit = directCommit(repo, "docs/direct.md", "direct\n");
      expect(() => admit(installed, commit)).toThrow(/DIRECT_BASIS_OPERATOR_REQUIRED/u);
      expect(installed.controller.work.project().head_commit).toBe(head);
    }
  });

  it("rolls the whole revision back if native HEAD moves immediately before commit", async () => {
    const { repo, stateDir, head } = workspace("head-race");
    const installed = install(repo, stateDir);
    await started(installed, head);
    const c = directCommit(repo, "docs/direct.md", "C\n");
    const store = installed.controller.store;
    const original = store.appendAtomic.bind(store);
    const spy = vi.spyOn(store, "appendAtomic").mockImplementation((requests, options = {}) => original(requests, {
      ...options, faultHook: checkpoint => {
        if (checkpoint === "before_commit") directCommit(repo, "docs/later.md", "D\n");
      },
    }));
    try { expect(() => admit(installed, c)).toThrow(/DIRECT_BASIS_STALE/u); }
    finally { spy.mockRestore(); }
    expect(installed.controller.work.project().head_commit).toBe(head);
    expect(store.listEvents("pnwf-cq-basis").some(e => e.event_type === "MANUAL_APPROVAL_RECORDED")).toBe(false);
  });

  it("rechecks deployment authority immediately before the revision commit", async () => {
    const { repo, stateDir, head } = workspace("authority-race");
    let current = true;
    const installed = install(repo, stateDir, { policyRef: authority.policyRef,
      authorize: () => ({ authorized: current, role: "operator" }) });
    await started(installed, head);
    const commit = directCommit(repo, "docs/direct.md", "C\n");
    const store = installed.controller.store, original = store.appendAtomic.bind(store);
    const spy = vi.spyOn(store, "appendAtomic").mockImplementation((requests, options = {}) => original(requests, {
      ...options, faultHook: checkpoint => { if (checkpoint === "before_commit") current = false; },
    }));
    try { expect(() => admit(installed, commit)).toThrow(/DIRECT_BASIS_OPERATOR_REQUIRED/u); }
    finally { spy.mockRestore(); }
    expect(installed.controller.work.project().head_commit).toBe(head);
    expect(store.listEvents("pnwf-cq-basis").some(e => e.event_type === "MANUAL_APPROVAL_RECORDED")).toBe(false);
  });

  it("detects drift after admission at the existing execution fence", async () => {
    const { repo, stateDir, head } = workspace("after-commit-race");
    const installed = install(repo, stateDir);
    await started(installed, head);
    const c = directCommit(repo, "docs/direct.md", "C\n");
    admit(installed, c);
    directCommit(repo, "docs/later.md", "D\n");
    await expect(installed.controller.prepareMutatingWork({ expectedTaskId: "governed-next" })).rejects.toThrow(/HEAD_BASIS_MISMATCH/u);
    expect(installed.controller.work.project().head_commit).toBe(c);
  });

  it("admits the checked-out direct commit, reauthorizes the task, and writes no promotion", async () => {
    const { repo, stateDir, head } = workspace("success");
    const installed = install(repo, stateDir);
    await started(installed, head);
    const direct = directCommit(repo, "docs/direct.md", "# direct outcome\n");

    const outcome = admit(installed, direct);
    expect(outcome.result.revision).toBe(1);
    const status = installed.controller.status() as {
      headCommit: string;
      directOutcome: { repositoryHead: string; projectHead: string; relation: string };
      tasks: Array<{ task_id: string; state: string }>;
    };
    expect(status.headCommit).toBe(direct);
    expect(status.directOutcome).toMatchObject({ repositoryHead: direct, projectHead: direct, relation: "IN_SYNC" });
    expect(status.tasks.find((task) => task.task_id === "governed-next")?.state).toBe("READY");
    expect(installed.controller.work.taskEnvelope("governed-next")?.base_commit).toBe(direct);

    const types = installed.controller.store.connection
      .prepare("SELECT event_type FROM events WHERE project_id=? ORDER BY rowid")
      .all("pnwf-cq-basis") as Array<{ event_type: string }>;
    const names = types.map((row) => row.event_type);
    expect(names).toContain("MANUAL_APPROVAL_RECORDED");
    expect(names).not.toContain("ATTEMPT_COMPLETED");
    expect(names).not.toContain("PROMOTION_COMMITTED");
    expect(installed.controller.status().promotions).toEqual([]);
    expect(installed.controller.status().nextAction.semantic?.question).toMatch(/direct outcome/iu);

    // The governed worker can now start at the admitted basis.
    const prepared = await installed.controller.prepareMutatingWork({ expectedTaskId: "governed-next" });
    expect(prepared.worldPath).toBeTruthy();
    expect(execFileSync("git", ["rev-parse", "HEAD"], { cwd: prepared.worldPath }).toString().trim()).toBe(direct);
  });

  it("runs a real child worker from the admitted basis through settlement, promotion and dependent continuation", async () => {
    const { repo, stateDir, head } = workspace("vertical");
    const workers: Array<{ pid: number; base: string; result: string; file: string }> = [];
    const installed = install(repo, stateDir, authority, {
      runtimeCarrierPort: callbackRuntimeCarrierPort("pnwf-qualification", {
        onRealize: async request => ({ runtimeAgent: { runtimeAdapter: "pnwf-qualification", agentId: request.activationId },
          session: { runtimeAdapter: "pnwf-qualification", sessionId: request.activationId } }),
        onRelease: async () => undefined,
      }),
      workWorkerPort: () => ({ adapterId: "pnwf-real-node-child", async run({ workDir, context }) {
        const file = context.work.writeScope[0];
        if (file !== "docs/next.md" && file !== "docs/after.md") throw new Error("unexpected worker scope");
        // The child reads its actual basis, produces a scoped artifact and commits it. No synthetic report/events.
        const script = `const fs=require('fs'),cp=require('child_process');
          const git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8'}).trim();
          const base=git('rev-parse','HEAD');fs.readFileSync('docs/direct.md');
          fs.writeFileSync(process.argv[1],'governed child result\\n');git('add','--',process.argv[1]);
          git('-c','user.email=w@w.w','-c','user.name=worker','commit','-qm','governed child');
          process.stdout.write(JSON.stringify({pid:process.pid,base,result:git('rev-parse','HEAD'),file:process.argv[1]}));`;
        workers.push(JSON.parse(execFileSync(process.execPath, ["-e", script, file], { cwd: workDir, encoding: "utf8", timeout: 15000 })));
        return { kind: "READY_FOR_SETTLEMENT" };
      } }),
    });
    await installed.tools.find(t => t.name === "palimpsest_start")!.execute({
      projectId: "pnwf-cq-basis", goal: "two distinct dependent outcomes", headCommit: head, tasks: [
      { task_id: "governed-next", objective: "produce the first governed outcome", depends_on: [], write_paths: ["docs/next.md"], required_artifacts: ["docs/next.md"] },
      { task_id: "governed-after", objective: "continue after promotion", depends_on: ["governed-next"], write_paths: ["docs/after.md"], required_artifacts: ["docs/after.md"] },
    ] }, { callId: "vertical-start", rootCallId: "vertical-start", name: "palimpsest_start", arguments: {}, signal: new AbortController().signal });
    const direct = directCommit(repo, "docs/direct.md", "direct basis\n");
    admit(installed, direct);
    const service = installed.application.work;
    const runWorker = async (taskId: string) => {
      const job = await service.startWorker({ taskId });
      expect(job.state, job.detail).toBe("STARTED");
      let view = (await service.workers()).jobs.find(j => j.jobId === job.jobId);
      const deadline = Date.now() + 60000;
      while (view && !["FINISHED", "HOST_ERROR"].includes(view.phase) && Date.now() < deadline) {
        await new Promise(done => setTimeout(done, 50)); view = (await service.workers()).jobs.find(j => j.jobId === job.jobId);
      }
      expect(view).toMatchObject({ phase: "FINISHED", settlementState: "SETTLED" });
      const attempt = installed.controller.status().attempts.find(a => a.task_id === taskId);
      expect(attempt).toBeDefined();
      return attempt!.attempt_id;
    };
    const attemptId = await runWorker("governed-next");
    expect(workers).toHaveLength(1);
    expect(workers[0]!.pid).not.toBe(process.pid);
    expect(workers[0]!.base).toBe(direct);
    expect(installed.controller.status().attempts.find(a => a.attempt_id === attemptId)?.state).toBe("COMPLETED");
    for (let i = 0; i < 20 && installed.controller.status().tasks.find(t => t.task_id === "governed-next")?.state !== "VERIFYING"; i++) installed.controller.step();
    expect(installed.controller.evaluateAttemptGate("gate-release", attemptId).verdict).toBe("PASS");
    const promotion = await installed.controller.promoteWhenGatePasses(attemptId, workers[0]!.result, direct, "gate-release");
    expect(promotion.promoted).toBe(true);
    if (!promotion.promoted) throw new Error("promotion refused");
    const promotedHead = promotion.result.resultingHeadCommit;
    installed.controller.step();
    await installed.controller.reconcileProjectHead();
    expect(installed.controller.work.project().head_commit).toBe(promotedHead);
    expect(execFileSync("git", ["show", "HEAD:docs/next.md"], { cwd: repo, encoding: "utf8" })).toContain("governed child result");
    // Dependency satisfaction still travels through the scheduler's TASK_READY transition.
    for (let i = 0; i < 20 && installed.controller.status().tasks.find(t => t.task_id === "governed-after")?.state !== "READY"; i++) installed.controller.step();
    expect(installed.controller.status().tasks.find(t => t.task_id === "governed-after")?.state).toBe("READY");
    const nextAttemptId = await runWorker("governed-after");
    expect(workers).toHaveLength(2);
    expect(workers[1]!.base).toBe(promotedHead);
    expect(installed.controller.status().attempts.find(a => a.attempt_id === nextAttemptId)?.state).toBe("COMPLETED");
    const events = installed.controller.store.listEvents("pnwf-cq-basis");
    expect(events.filter(e => e.event_type === "MANUAL_APPROVAL_RECORDED")).toHaveLength(1);
    expect(events.filter(e => e.event_type === "ATTEMPT_COMPLETED")).toHaveLength(2);
    expect(events.filter(e => e.event_type === "PROMOTION_COMMITTED")).toHaveLength(1);
    if (process.env.PNWF_VERTICAL_EVIDENCE) writeFileSync(process.env.PNWF_VERTICAL_EVIDENCE, JSON.stringify({
      schema: "pnwf-basis-vertical/v1", passed: true, paidModelCalls: 0, initialHead: head, direct, promotedHead,
      attemptId, nextAttemptId, workers, events: events.map(e => ({ eventId: e.event_id, type: e.event_type })),
      limitation: "deterministic child workers; no autonomous model behavior or cross-host quiescence claim",
    }, null, 2) + "\n");
  }, 120000);

  it("refuses a dirty canonical worktree, a non-ancestor commit and a task-graph change", async () => {
    const { repo, stateDir, head } = workspace("negatives");
    const first = install(repo, stateDir);
    await started(first, head);
    const direct = directCommit(repo, "docs/direct.md", "# direct outcome\n");
    writeFileSync(join(repo, "dirty.txt"), "uncommitted\n");
    expect(() => admit(first, direct)).toThrow(/DIRECT_BASIS_WORKTREE_DIRTY/iu);
    rmSync(join(repo, "dirty.txt"), { force: true });

    // An orphan commit is checked out but is not a descendant of the canonical head.
    execFileSync("git", ["checkout", "--orphan", "other"], { cwd: repo });
    const orphan = directCommit(repo, "docs/orphan.md", "# orphan\n");
    expect(() => admit(first, orphan)).toThrow(/DIRECT_BASIS_NOT_DESCENDANT/iu);
    execFileSync("git", ["checkout", "-f", direct], { cwd: repo });

    const current = first.controller.work.project();
    expect(() =>
      first.controller.planReconciled(
        {
          tasks: [
            ...current.tasks.map((task) => ({ ...task })),
            {
              task_id: "extra",
              objective: "a task added in the same revision",
              depends_on: [],
              write_paths: ["docs"],
              required_artifacts: [],
            },
          ],
          reason: "change the graph in the same revision",
        },
        { headAdvance: { source: "DIRECT_BASIS", toHead: direct, operator: "operator:alice", reason: "bad" } },
      ),
    ).toThrow(/DIRECT_BASIS_(GRAPH_CHANGED|NOT_DESCENDANT)/iu);
    // The rejected attempt wrote nothing: the canonical head is still the original base.
    expect((first.controller.status() as { headCommit: string }).headCommit).toBe(head);
  });

  it("admits through the signed-operator CLI, and refuses without the credential", async () => {
    const { root, repo, stateDir, head } = workspace("cli");
    const profileFile = join(root, "product-profile.json");
    const tasksFile = join(root, "tasks.json");
    writeFileSync(
      tasksFile,
      JSON.stringify([
        {
          task_id: "governed-next",
          objective: "continue from the direct outcome",
          depends_on: [],
          write_paths: ["docs"],
          required_artifacts: ["docs/next.md"],
        },
      ]),
    );
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const publicPath = join(root, "operator-public.pem");
    writeFileSync(publicPath, publicKey.export({ format: "pem", type: "spki" }).toString());
    const initOptions = new Map<string, string>([
      ["--repo", repo],
      ["--project", "pnwf-cq-basis"],
      ["--state", stateDir],
      ["--goal", "direct outcome then governed continuation"],
      ["--tasks", tasksFile],
      ["--operator", "alice"],
      ["--operator-purpose", "basis"],
      ["--operator-public-key", publicPath],
      ["--profile-file", profileFile],
    ]);
    await runProductCommand("init", initOptions, ["init"]);

    const direct = directCommit(repo, "docs/direct.md", "# direct outcome\n");
    const now = Date.now();
    const token = signOperatorToken({
      claims: {
        operatorId: "alice",
        purpose: "basis",
        issuedAt: new Date(now - 60_000).toISOString(),
        expiresAt: new Date(now + 3_600_000).toISOString(),
        nonce: "basis-test",
      },
      privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    });
    const tokenPath = join(root, "operator.token");
    writeFileSync(tokenPath, token);

    // No credential: the operator surface refuses before any write.
    await expect(
      runProductCommand(
        "basis",
        new Map<string, string>([["--profile-file", profileFile], ["--commit", direct], ["--reason", "direct basis"]]),
        ["basis", "admit"],
      ),
    ).rejects.toThrow(/signed operator credential/iu);

    await runProductCommand(
      "basis",
      new Map<string, string>([
        ["--profile-file", profileFile],
        ["--commit", direct],
        ["--reason", "the direct commit is the intended governed basis"],
        ["--operator-token", tokenPath],
      ]),
      ["basis", "admit"],
    );
    const reopened = install(repo, stateDir);
    const status = reopened.controller.status() as { headCommit: string; tasks: Array<{ task_id: string; state: string }> };
    expect(status.headCommit).toBe(direct);
    expect(status.tasks.find((task) => task.task_id === "governed-next")?.state).toBe("READY");
  });
});
