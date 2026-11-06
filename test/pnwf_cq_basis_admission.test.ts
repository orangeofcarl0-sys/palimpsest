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

import { afterAll, describe, expect, it } from "vitest";

import { installProduct } from "../src/product.js";
import type { ProjectStandard } from "../src/domain/standard.js";
import { signOperatorToken } from "../src/project_review/index.js";
import { runProductCommand } from "../src/cli_product.js";

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

function install(repo: string, stateDir: string) {
  const installed = installProduct(
    { tools: { register: () => () => undefined } } as never,
    { projectId: "pnwf-cq-basis", repository: repo, stateDir, execution: "worktree", standard, toolProfile: "normal" },
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

    // The governed worker can now start at the admitted basis.
    const prepared = await installed.controller.prepareMutatingWork({ expectedTaskId: "governed-next" });
    expect(prepared.worldPath).toBeTruthy();
    expect(execFileSync("git", ["rev-parse", "HEAD"], { cwd: prepared.worldPath }).toString().trim()).toBe(direct);
  });

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
