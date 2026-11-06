/**
 * PNWF-CQ-H — the Direct → Governed basis boundary.
 *
 * A direct commit is a real repository outcome, but it is NOT a governed result. The canonical
 * ProjectIR head must not be advanced to it by Git or by an ordinary plan revision, and a worker must
 * not start from the stale basis while the physical head is ahead. This test proves the CURRENT
 * capability boundary and records it as a fail-closed gap, not as a success story.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installProduct } from "../src/product.js";
import type { ProjectStandard } from "../src/domain/standard.js";
import type { DshToolDefinition, DshToolRunContext } from "../src/tools/dsh_types.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const standard: ProjectStandard = Object.freeze({
  statement: "the declared artifact exists and every write stays inside its task scope",
  clauses: Object.freeze([Object.freeze({ kind: "scope_respected" as const })]),
  derivedFrom: Object.freeze(["PNWF-CQ direct-governed fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

function workspace(): { root: string; repo: string; stateDir: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-pnwf-cq-dg-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "docs"), { recursive: true });
  writeFileSync(join(repo, "README.md"), "# base\n");
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
    { projectId: "pnwf-cq-dg", repository: repo, stateDir, execution: "worktree", standard, toolProfile: "normal" },
  );
  cleanups.push(() => void installed.dispose());
  return installed;
}

async function call(
  installed: ReturnType<typeof install>,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const definition = installed.tools.find((entry) => entry.name === name) as DshToolDefinition | undefined;
  if (definition === undefined) throw new Error(`missing tool ${name}`);
  const context: DshToolRunContext = {
    callId: `c-${name}`,
    rootCallId: `r-${name}`,
    arguments: args,
    name,
    signal: new AbortController().signal,
  };
  return (await definition.execute(args, context)) as Record<string, unknown>;
}

describe("PNWF-CQ-H — a direct commit does not become a governed basis by itself", () => {
  it("shows the head relation, refuses a worker on the stale basis, and writes no promotion", async () => {
    const { repo, stateDir, head } = workspace();
    const installed = install(repo, stateDir);
    await call(installed, "palimpsest_start", {
      projectId: "pnwf-cq-dg",
      goal: "direct outcome exists; a governed continuation is requested",
      headCommit: head,
      tasks: [
        {
          task_id: "governed-next",
          objective: "continue from the direct outcome under a governed worker",
          write_paths: ["docs"],
          required_artifacts: ["docs/next.md"],
        },
      ],
    });

    writeFileSync(join(repo, "docs", "direct.md"), "# direct outcome\n");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "direct commit"], { cwd: repo });
    const direct = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
    expect(direct).not.toBe(head);

    const status = (await call(installed, "palimpsest_work", { action: "status" })) as unknown as {
      headCommit: string;
      directOutcome: { repositoryHead: string; projectHead: string; relation: string };
      nextAction: { kind: string; executable: boolean; detail: string };
    };
    expect(status.headCommit).toBe(head);
    expect(status.directOutcome).toMatchObject({ repositoryHead: direct, projectHead: head, relation: "DIRECT_AHEAD" });
    expect(status.nextAction.kind).toBe("DIRECT_HEAD_AHEAD");
    expect(status.nextAction.executable).toBe(false);
    expect(status.nextAction.detail).toMatch(/not a governed result/iu);

    // The Work owner refuses to start a worker from the stale canonical basis.
    await expect(installed.controller.prepareMutatingWork({ expectedTaskId: "governed-next" })).rejects.toThrow(
      /HEAD_BASIS_MISMATCH/iu,
    );

    // The existing head owner only advances to a PROVEN promotion effect; a direct commit has none.
    const reconciliation = await installed.controller.reconcileProjectHead();
    expect(reconciliation.status).not.toBe("reconciled");
    expect((installed.controller.status() as { headCommit: string }).headCommit).toBe(head);

    // The normal tool's worker path cannot start in this composition (no transport); the Work
    // owner's own admission is the boundary proof above. It must not fall through to a worker.
    const delegated = (await call(installed, "palimpsest_work", {
      action: "delegate",
      taskId: "governed-next",
    })) as unknown as { state: string; detail: string };
    expect(delegated.state).toBe("UNAVAILABLE");
    expect(delegated.detail).toMatch(/no work-worker transport/iu);

    // No ATTEMPT_STARTED, ATTEMPT_COMPLETED or PROMOTION_COMMITTED was fabricated to bridge the gap.
    const types = new Set(
      (
        installed.controller.store.connection
          .prepare("SELECT event_type FROM events WHERE project_id=?")
          .all("pnwf-cq-dg") as Array<{ event_type: string }>
      ).map((row) => row.event_type),
    );
    for (const forbidden of ["ATTEMPT_STARTED", "ATTEMPT_COMPLETED", "PROMOTION_COMMITTED"]) {
      expect(types.has(forbidden)).toBe(false);
    }

    // The honest conclusion is a checkpoint with the basis question open — not DELIVER, not a
    // promotion. The product does not pretend the direct commit is a governed result.
    const concluded = (await call(installed, "palimpsest_work", {
      action: "conclude",
      intent: "CHECKPOINT",
      statement:
        "A direct commit is ahead of the canonical ProjectIR head. The current product cannot admit it as a governed basis; the operator must decide the basis transition.",
      nextStep: "operator decision on how the direct commit becomes a governed basis",
    })) as unknown as { state: string; session?: { mayEnd: boolean } };
    expect(concluded.state).toBe("RECORDED");
    expect(concluded.session?.mayEnd).toBe(true);
  });
});
