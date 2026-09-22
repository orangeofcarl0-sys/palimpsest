/**
 * PLMP-LEAN-1 §C.12 — the async branch-host seam, at the lowest level.
 *
 * This test deliberately separates two questions that would otherwise be confused later:
 *
 *   async SEAM correctness      (here)
 *   actual D1 delegation concurrency   (the delegation slice)
 *
 * If a delegation test ever fails, this file should already have ruled out the subprocess seam.
 *
 * The seam's contract is small: `start` returns a handle BEFORE the host settles, and `run` is nothing
 * but that same handle's completion — one subprocess implementation, two interaction lifecycles.
 * (`palimpsest_collaborate` keeps the blocking `run`; `palimpsest_delegate` will use `start`.)
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  DSH_BRANCH_RESULT_PREFIX,
  dshSubprocessBranchExecutionPort,
  type BranchExecutionResult,
} from "../src/reasoning_cell/branch_execution.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

function fixture(): { workDir: string; hostScript: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-seam-"));
  const workDir = join(root, "repo");
  mkdirSync(workDir, { recursive: true });
  // A scripted host: it prints exactly one result line, which is all the port reads.
  const hostScript = join(root, "host.mjs");
  writeFileSync(
    hostScript,
    `console.log(${JSON.stringify(DSH_BRANCH_RESULT_PREFIX)} + JSON.stringify({ status: "completed", statement: "found the race" }));\n`,
  );
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Windows keeps the directory busy while a handle is open; the OS reaps it.
    }
  });
  return { workDir, hostScript };
}

function portOver(f: { workDir: string; hostScript: string }) {
  return dshSubprocessBranchExecutionPort({
    dshBin: f.hostScript,
    profile: "seam-test",
    workDir: f.workDir,
    nodeExecPath: process.execPath,
  });
}

describe("C.12: one subprocess implementation, two interaction lifecycles", () => {
  it("start returns BEFORE the host settles, and its completion is what run returns", async () => {
    const f = fixture();
    const port = portOver(f);

    let settled = false;
    const job = port.start({ brief: { objective: "investigate the race" } });
    void job.completion.then(() => {
      settled = true;
    });
    // The whole point of the seam: the caller has a handle and can go do something else. The child
    // has been spawned but cannot possibly have exited and been parsed yet.
    expect(settled).toBe(false);

    const viaStart = await job.completion;
    const viaRun = (await port.run({ brief: { objective: "investigate the race" } })) as BranchExecutionResult;

    // Same scripted outcome, same normalized result — `run` adds nothing of its own.
    expect(viaStart).toEqual(viaRun);
    expect(viaStart.status).toBe("completed");
    // The seam's contract is that the two paths AGREE, not what the host said: `detail` is the
    // normalized default ("branch completed"), and asserting the host's prose here would be testing
    // the scripted fixture rather than the seam.
    expect(viaStart.detail).toBe(viaRun.detail);
  });

  it("cancel() stops a job without waiting for it, and the outcome is honest rather than fabricated", async () => {
    const root = mkdtempSync(join(tmpdir(), "palimpsest-seam-"));
    const workDir = join(root, "repo");
    mkdirSync(workDir, { recursive: true });
    const hostScript = join(root, "slow.mjs");
    // A host that never prints a result: it just stays alive until killed.
    writeFileSync(hostScript, "setTimeout(() => {}, 60000);\n");
    cleanups.push(() => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        /* windows handle */
      }
    });

    const port = dshSubprocessBranchExecutionPort({
      dshBin: hostScript,
      profile: "seam-test",
      workDir,
      nodeExecPath: process.execPath,
      timeoutMs: 30_000,
    });
    const job = port.start({ brief: { objective: "never finishes" } });
    job.cancel();
    const result = await job.completion;
    // A cancelled job reports a failure — it never invents a candidate.
    expect(result.status).not.toBe("completed");
    expect(result.candidateCount).toBe(0);
  }, 60000);

  it("a pre-flight failure yields a handle too, so a caller has one shape to handle", async () => {
    const f = fixture();
    const port = portOver(f);
    const controller = new AbortController();
    controller.abort();
    const job = port.start({ brief: { objective: "already aborted" }, signal: controller.signal });
    const result = await job.completion;
    expect(result.status).toBe("failed");
    expect(result.candidateCount).toBe(0);
    // And cancel on an unstarted job is a no-op rather than a throw.
    expect(() => job.cancel()).not.toThrow();
  });
});

