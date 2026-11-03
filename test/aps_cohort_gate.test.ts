/**
 * APS-C — the paid-cohort gate is fail-closed, and the budget guard really terminates a target.
 *
 * These tests start NO model provider and no DSH session. They use a long-running inert child for the
 * guard test and a synthetic usage stream, so the enforcement point is exercised without spend.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zstdCompressSync } from "node:zlib";

import { afterAll, describe, expect, it } from "vitest";

const REPO = join(import.meta.dirname, "..");
const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

function head(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim();
}

function tempRoot(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `aps-${name}-`));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function cohort(root: string): { path: string; value: Record<string, unknown> } {
  const sessionRoot = join(root, "sessions");
  mkdirSync(sessionRoot, { recursive: true });
  const value = {
    schema: "aps-live-cohort/v1",
    cohortId: `aps-gate-${process.pid}`,
    codeFreeze: head(),
    provider: { id: "fixture-provider", model: "fixture-model" },
    conditions: ["F", "L", "G"],
    oracleCopied: false,
    sessions: ["F", "L", "G"].map((condition, index) => ({
      id: `${condition.toLowerCase()}-1`,
      condition,
      maxTokens: 1000,
      command: [process.execPath, "-e", "setTimeout(() => {}, 1000)"],
      cwd: root,
      sessionRoot,
      timeoutMs: 5_000,
      index,
    })),
  };
  const path = join(root, "cohort.json");
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return { path, value };
}

function authorization(root: string, value: Record<string, unknown>, overrides: Record<string, unknown> = {}): string {
  const path = join(root, "authorization.json");
  writeFileSync(
    path,
    `${JSON.stringify({
      schema: "aps-spend-authorization/v1",
      authorized: true,
      owner: "test-fixture-not-a-real-owner",
      cohortId: value.cohortId,
      authorizedAt: "2026-11-03T00:00:00.000Z",
      expiresAt: "2030-01-01T00:00:00.000Z",
      provider: value.provider,
      maxTokens: 3000,
      conditions: ["F", "L", "G"],
      note: "test fixture; never a live authorization",
      ...overrides,
    }, null, 2)}\n`,
  );
  return path;
}

function run(args: string[]): { state: string; modelCalls: number; blockers: string[] } {
  const result = spawnSync(process.execPath, ["scripts/aps/run_cohort.mjs", ...args], {
    cwd: REPO,
    encoding: "utf8",
  });
  const line = String(result.stdout).trim().split(/\n/u).pop() ?? "";
  if (line === "") throw new Error(`the cohort runner produced no JSON: ${String(result.stderr)}`);
  return JSON.parse(line) as { state: string; modelCalls: number; blockers: string[] };
}

describe("APS-C: the live cohort refuses without a current exact authorization", () => {
  it("blocks without an authorization and starts no session", () => {
    const root = tempRoot("gate-none");
    const c = cohort(root);
    const result = run([`--cohort=${c.path}`]);
    expect(result.state).toBe("BLOCKED");
    expect(result.modelCalls).toBe(0);
    expect(result.blockers.join(" ")).toMatch(/no APS spend authorization/iu);
    const blockedPath = join(REPO, "research-evidence", "aps", "live", String(c.value.cohortId), "BLOCKED.json");
    expect(existsSync(blockedPath)).toBe(true);
    rmSync(join(REPO, "research-evidence", "aps", "live", String(c.value.cohortId)), { recursive: true, force: true });
  });

  it("blocks an authorization below the requested cumulative ceiling", () => {
    const root = tempRoot("gate-budget");
    const c = cohort(root);
    const auth = authorization(root, c.value, { maxTokens: 2999 });
    const result = run([`--cohort=${c.path}`, `--authorization=${auth}`]);
    expect(result.state).toBe("BLOCKED");
    expect(result.modelCalls).toBe(0);
    expect(result.blockers.join(" ")).toMatch(/above the authorized/iu);
    rmSync(join(REPO, "research-evidence", "aps", "live", String(c.value.cohortId)), { recursive: true, force: true });
  });

  it("blocks a cohort frozen at a different commit", () => {
    const root = tempRoot("gate-freeze");
    const c = cohort(root);
    const tampered: Record<string, unknown> = { ...c.value, codeFreeze: "0".repeat(40) };
    const path = join(root, "cohort-tampered.json");
    writeFileSync(path, `${JSON.stringify(tampered, null, 2)}\n`);
    const auth = authorization(root, tampered);
    const result = run([`--cohort=${path}`, `--authorization=${auth}`]);
    expect(result.state).toBe("BLOCKED");
    expect(result.modelCalls).toBe(0);
    expect(result.blockers.join(" ")).toMatch(/not the current HEAD/iu);
    rmSync(join(REPO, "research-evidence", "aps", "live", String(tampered.cohortId)), { recursive: true, force: true });
  });

  it("a complete exact authorization is READY, and does not start a session without --execute", () => {
    const root = tempRoot("gate-ready");
    const c = cohort(root);
    const auth = authorization(root, c.value);
    const result = run([`--cohort=${c.path}`, `--authorization=${auth}`]);
    expect(result.state).toBe("READY");
    expect(result.modelCalls).toBe(0);
    const dir = join(REPO, "research-evidence", "aps", "live", String(c.value.cohortId));
    const plan = JSON.parse(readFileSync(join(dir, "run-plan.json"), "utf8")) as { requestedTokens: number; hardCapTokens: number };
    expect(plan.requestedTokens).toBe(3000);
    expect(plan.hardCapTokens).toBe(8_000_000);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("APS-C: the budget guard reads real usage and terminates the target", () => {
  it("stops a target whose synthetic session reports more tokens than its ceiling", async () => {
    const root = tempRoot("guard");
    const sessionRoot = join(root, "sessions", "s1");
    mkdirSync(sessionRoot, { recursive: true });
    const frames = [
      { type: "assistant/message", seq: 1, data: { usage: { totalTokens: 10 } } },
      { type: "assistant/message", seq: 2, data: { usage: { totalTokens: 20 } } },
    ]
      .map((row) => zstdCompressSync(Buffer.from(`${JSON.stringify(row)}\n`, "utf8")))
      .reduce((all, frame) => Buffer.concat([all, frame]), Buffer.alloc(0));
    writeFileSync(join(sessionRoot, "session.v4.jsonl.zstd"), frames);
    const target = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    cleanups.push(() => target.kill("SIGKILL"));
    const ledger = join(root, "ledger.json");
    const stopped = join(root, "STOPPED.json");
    const guard = spawn(
      process.execPath,
      [
        join(REPO, "scripts", "aps", "budget_guard.mjs"),
        `--session-root=${join(root, "sessions")}`,
        "--max-tokens=15",
        `--target-pid=${target.pid}`,
        `--ledger=${ledger}`,
        `--stopped=${stopped}`,
        "--poll-ms=100",
      ],
      { stdio: "ignore" },
    );
    cleanups.push(() => guard.kill("SIGKILL"));
    const exit = await new Promise<{ code: number | null; signal: string | null }>((resolvePromise) => {
      target.on("exit", (code, signal) => resolvePromise({ code, signal }));
    });
    expect(existsSync(stopped)).toBe(true);
    expect(exit.signal === "SIGTERM" || exit.signal === "SIGKILL" || exit.code !== 0).toBe(true);
    const stop = JSON.parse(readFileSync(stopped, "utf8")) as { maxTokens: number; reason: string };
    expect(stop.maxTokens).toBe(15);
    expect(stop.reason).toMatch(/exceeded/iu);
    const value = JSON.parse(readFileSync(ledger, "utf8")) as { totalTokens: number; state: string };
    expect(value.totalTokens).toBeGreaterThan(15);
    expect(value.state).toBe("STOPPED");
  }, 15_000);
});
