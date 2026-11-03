/**
 * PC1-V1 R9 — the live runner must refuse without a new explicit authorization.
 *
 * These are gate tests only. They start no model session and make no provider call.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REPO = join(import.meta.dirname, "..");

function head(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim();
}

function cohort(): Record<string, unknown> {
  const session = (id: string, scenario: string, condition: "P" | "F") => ({
    id,
    scenario,
    condition,
    stage: "t1",
    subagents: false,
    cwd: ".",
    command: ["node", "-e", "process.exit(0)"],
    env: {},
    timeoutMs: 10_000,
  });
  return {
    schema: "pc1v1-live-cohort/v1",
    cohortId: `pc1v1-runner-gate-${process.pid}`,
    codeFreeze: head(),
    provider: { id: "test-provider", model: "test-model" },
    oracleCopied: false,
    sessions: [
      session("sablewick-p-t1", "sablewick", "P"),
      session("sablewick-f-t1", "sablewick", "F"),
      session("field-study-p-t1", "field-study", "P"),
      session("field-study-f-t1", "field-study", "F"),
    ],
  };
}

function run(args: string[]): { state: string; modelCalls: number; blockers: string[] } {
  const output = execFileSync(process.execPath, ["scripts/pc1v1/run_live_cohort.mjs", ...args], {
    cwd: REPO,
    encoding: "utf8",
  });
  return JSON.parse(output) as { state: string; modelCalls: number; blockers: string[] };
}

describe("PC1-V1 R9: the live runner is fail-closed", () => {
  it("blocks without a PC1-V1 authorization and starts no session", () => {
    const root = mkdtempSync(join(tmpdir(), "pc1v1-runner-"));
    const cohortPath = join(root, "cohort.json");
    const value = cohort();
    writeFileSync(cohortPath, `${JSON.stringify(value, null, 2)}\n`);
    try {
      const result = run([`--cohort=${cohortPath}`]);
      expect(result.state).toBe("BLOCKED");
      expect(result.modelCalls).toBe(0);
      expect(result.blockers.join(" ")).toMatch(/spend authorization/iu);
      const blockedPath = join(REPO, "research-evidence", "pc1v1", "live", String(value.cohortId), "BLOCKED.json");
      expect(existsSync(blockedPath)).toBe(true);
      const blocked = JSON.parse(readFileSync(blockedPath, "utf8")) as { modelCalls: number; state: string };
      expect(blocked.state).toBe("BLOCKED");
      expect(blocked.modelCalls).toBe(0);
      rmSync(join(REPO, "research-evidence", "pc1v1", "live", String(value.cohortId)), { recursive: true, force: true });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("blocks a mismatched or false authorization before execution", () => {
    const root = mkdtempSync(join(tmpdir(), "pc1v1-runner-"));
    const cohortPath = join(root, "cohort.json");
    const authPath = join(root, "authorization.json");
    const value = cohort();
    writeFileSync(cohortPath, `${JSON.stringify(value, null, 2)}\n`);
    writeFileSync(
      authPath,
      `${JSON.stringify({
        schema: "pc1v1-spend-authorization/v1",
        authorized: false,
        owner: "test-fixture-not-an-authorization",
        cohortId: value.cohortId,
        authorizedAt: "2026-11-03T00:00:00.000Z",
        provider: value.provider,
        maxTokens: 1,
        conditions: ["P", "F"],
        note: "negative-control fixture; authorized is false",
      }, null, 2)}\n`,
    );
    try {
      const result = run([`--cohort=${cohortPath}`, `--authorization=${authPath}`]);
      expect(result.state).toBe("BLOCKED");
      expect(result.modelCalls).toBe(0);
      expect(result.blockers.join(" ")).toMatch(/authorized must be true/iu);
      rmSync(join(REPO, "research-evidence", "pc1v1", "live", String(value.cohortId)), { recursive: true, force: true });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
