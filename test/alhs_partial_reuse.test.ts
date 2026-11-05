/**
 * ALHS-B — path-level reuse facts over the existing continuation authority.
 *
 * The product does not carry anything here. It reports which paths a result changed that the current
 * world left alone (reusable planning evidence), which it also changed (must be recomputed), and which
 * already hold the same bytes. A principal uses these facts to write a new governed task; acceptance
 * stays with Promotion.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installProduct } from "../src/product.js";
import type { ProjectStandard } from "../src/domain/standard.js";
import { makeWorkDelegationService, type WorkWorkerRunPort } from "../src/interaction/work_delegation.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const standard: ProjectStandard = Object.freeze({
  statement: "stay inside the declared write scope and leave the required artifact",
  clauses: Object.freeze([Object.freeze({ kind: "scope_respected" as const })]),
  derivedFrom: Object.freeze(["ALHS reuse fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();
}

function commitFile(cwd: string, relative: string, contents: string, message = `write ${relative}`): string {
  mkdirSync(dirname(join(cwd, relative)), { recursive: true });
  writeFileSync(join(cwd, relative), contents);
  git(cwd, ["add", "-A"]);
  git(cwd, ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", message]);
  return git(cwd, ["rev-parse", "HEAD"]);
}

function workspace(name: string): { root: string; repo: string; stateDir: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), `palimpsest-alhs-reuse-${name}-`));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "docs"), { recursive: true });
  writeFileSync(join(repo, "README.md"), "# base\n");
  git(repo, ["init", "-q"]);
  const head = commitFile(repo, "docs/seed.md", "# seed\n", "init");
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* Windows may still hold a SQLite handle */
    }
  });
  return { root, repo, stateDir: join(root, "state"), head };
}

async function waitFor<T>(read: () => Promise<T> | T, done: (value: T) => boolean, label: string, timeoutMs = 30_000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe("ALHS-B partial reuse facts", () => {
  it("separates unaffected, conflicted and already-present result paths after the world moves", async () => {
    const { repo, head, stateDir } = workspace("paths");
    const installed = installProduct(
      { tools: { register: () => () => undefined } } as never,
      {
        projectId: "alhs-reuse",
        repository: repo,
        stateDir,
        execution: "worktree",
        standard,
        toolProfile: "normal",
      },
    );
    cleanups.push(() => void installed.dispose());

    await installed.tools
      .find((tool) => tool.name === "palimpsest_start")!
      .execute(
        {
          projectId: "alhs-reuse",
          goal: "produce a package whose cost and capacity can be partially reused",
          headCommit: head,
          tasks: [
            {
              task_id: "package",
              objective: "Write the vendor, capacity and cost notes.",
              depends_on: [],
              write_paths: ["docs/vendors.md", "docs/capacity.md", "docs/cost.md"],
              required_artifacts: ["docs/vendors.md", "docs/capacity.md", "docs/cost.md"],
            },
          ],
        },
        { callId: "start", rootCallId: "start", arguments: {}, name: "palimpsest_start", signal: new AbortController().signal },
      );

    const workerFor = (): WorkWorkerRunPort => ({
      adapterId: "alhs-reuse-worker",
      async run({ workDir }) {
        commitFile(workDir, "docs/vendors.md", "# Vendors\n\nUnit price: 1200 EUR.\n");
        commitFile(workDir, "docs/capacity.md", "# Capacity\n\nAssumed corridor: 900 mm.\n");
        commitFile(workDir, "docs/cost.md", "# Cost\n\nTotal: 48,000 EUR.\n");
        return { kind: "READY_FOR_SETTLEMENT" as const, summary: "wrote the three notes" };
      },
    });
    const delegation = makeWorkDelegationService({ controller: installed.controller, workerFor });
    const started = await delegation.start({ expectedTaskId: "package" });
    expect(started.state).toBe("STARTED");
    await waitFor(
      () => delegation.jobs(),
      (jobs) => jobs.length === 1 && jobs[0]!.phase === "FINISHED",
      "package worker to settle",
    );

    // The canonical world moves: a new measurement changes capacity and restates the cost identically.
    commitFile(repo, "docs/capacity.md", "# Capacity\n\nMeasured corridor: 700 mm.\n", "record 700 mm measurement");
    commitFile(repo, "docs/cost.md", "# Cost\n\nTotal: 48,000 EUR.\n", "restate cost");

    const results = await installed.application.work.results({ taskId: "package" });
    expect(results.state).toBe("OK");
    const result = results.results[0]!;
    expect(result.reuse).not.toBeNull();
    const reuse = result.reuse!;
    expect([...reuse.resultPaths].sort()).toEqual(["docs/capacity.md", "docs/cost.md", "docs/vendors.md"]);
    expect(reuse.unaffectedPaths).toEqual(["docs/vendors.md"]);
    expect(reuse.conflictedPaths).toEqual(["docs/capacity.md"]);
    expect(reuse.alreadyPresentPaths).toEqual(["docs/cost.md"]);
    expect(reuse.currentRevision).toBe(git(repo, ["rev-parse", "HEAD"]));
    // A planning fact is not an acceptance: nothing was promoted by inspecting it.
    expect(installed.controller.status().promotions).toHaveLength(0);
  });
});
