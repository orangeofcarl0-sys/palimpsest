/**
 * PC1 S07 — doctor, usage accounting, budget gate and process-tree stop.
 */
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { canStartSession, classifyRun, dedupeUsage, sumUsage, terminateProcessTree, runDoctor, type UsageEntry } from "../src/runtime/index.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

function entry(seq: number, input: number, output: number, sessionId = "s1"): UsageEntry {
  return { sessionId, seq, provider: "deepseek-official", model: "deepseek-flash", inputTokens: input, outputTokens: output, cacheReadTokens: 10, cacheWriteTokens: 2 };
}

describe("PC1 S07: doctor reports installed facts and refuses to invent availability", () => {
  it("reports the real platform, git, dsh and blocked live model", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "palimpsest-pc1-doctor-"));
    cleanups.push(() => {
      try {
        rmSync(stateDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    });
    const report = runDoctor({ repository: process.cwd(), stateDir, spendAuthorizationRef: null, toolProfile: "normal" });
    const ids = report.checks.map((check) => check.id);
    expect(ids).toContain("node");
    expect(ids).toContain("git");
    expect(ids).toContain("repository");
    expect(ids).toContain("dsh");
    expect(ids).toContain("sandbox");
    expect(ids).toContain("live-model");
    expect(report.liveModel).toBe("BLOCKED");
    expect(report.supportedStack).toMatch(/Linux|Windows/u);
    expect(report.checks.find((check) => check.id === "repository")?.status).toBe("PASS");
    // A missing provider path is UNKNOWN, not PASS.
    expect(report.checks.find((check) => check.id === "provider")?.status).toBe("UNKNOWN");
    expect(JSON.stringify(report)).not.toMatch(/api[_-]?key|bearer|sk-[a-z0-9]/iu);
  });
});

describe("PC1 S07: usage is deduped, split, and classified honestly", () => {
  it("dedupes by session+seq and sums input/output/cache separately", () => {
    const entries = [entry(1, 100, 10), entry(2, 200, 20), entry(1, 100, 10)];
    const deduped = dedupeUsage(entries);
    expect(deduped).toHaveLength(2);
    const totals = sumUsage(entries);
    expect(totals.inputTokens).toBe(300);
    expect(totals.outputTokens).toBe(30);
    expect(totals.cacheReadTokens).toBe(20);
    expect(totals.cacheWriteTokens).toBe(4);
    expect(totals.reportedTokens).toBe(330);
  });

  it("does not let a conflicting replay overwrite a counter", () => {
    expect(() => dedupeUsage([entry(1, 100, 10), entry(1, 999, 10)])).toThrow(/conflicting usage/u);
  });

  it("records a missing usage counter as missing, not zero", () => {
    const missing: UsageEntry = { sessionId: "s2", seq: 1, provider: "p", model: "m", inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null };
    const totals = sumUsage([entry(1, 5, 5), missing]);
    expect(totals.missingUsage).toBe(1);
    expect(totals.inputTokens).toBe(5);
  });

  it("classifies a provider failure after a turn as INVALID and a pre-turn failure as BLOCKED", () => {
    expect(classifyRun({ assistantMessages: 3, providerErrors: 0, timedOut: false }).classification).toBe("OBSERVED");
    expect(classifyRun({ assistantMessages: 3, providerErrors: 1, timedOut: false })).toMatchObject({ classification: "INVALID", reason: "provider_error_during_turn" });
    expect(classifyRun({ assistantMessages: 0, providerErrors: 6, timedOut: false })).toMatchObject({ classification: "BLOCKED", reason: "provider_error_before_first_turn" });
    expect(classifyRun({ assistantMessages: 2, providerErrors: 0, timedOut: true })).toMatchObject({ classification: "INVALID", reason: "timeout_during_turn" });
  });

  it("refuses a launch that would break the pair reservation or the stop threshold", () => {
    const window = { reportedTokensMax: 1_000, stopNewLaunchesAt: 700, inFlightReserveTokens: 100, maxSessions: 3 };
    expect(canStartSession(window, { reportedTokens: 200, sessionsStarted: 1, inFlightTokens: 100 }, 300).allowed).toBe(true);
    expect(canStartSession(window, { reportedTokens: 700, sessionsStarted: 1, inFlightTokens: 0 }, 10)).toMatchObject({ allowed: false, reason: "stop_threshold_reached" });
    expect(canStartSession(window, { reportedTokens: 200, sessionsStarted: 1, inFlightTokens: 100 }, 800)).toMatchObject({ allowed: false, reason: "pair_reservation_would_exceed_cap" });
    expect(canStartSession(window, { reportedTokens: 0, sessionsStarted: 3, inFlightTokens: 0 }, 1)).toMatchObject({ allowed: false, reason: "session_cap_reached" });
  });
});

describe("PC1 S07: the process tree is stopped as a tree", () => {
  it("terminates a child and its descendant", async () => {
    const script = [
      "const { spawn } = require('node:child_process');",
      "const grand = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });",
      "process.stdout.write(String(grand.pid) + '\\n');",
      "setInterval(()=>{},1000);",
    ].join(" ");
    const child = spawn(process.execPath, ["-e", script], { detached: true, stdio: ["ignore", "pipe", "ignore"] });
    const grandchildPid = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no grandchild pid")), 5_000);
      child.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString().trim();
        const pid = Number(text.split("\n")[0]);
        if (Number.isSafeInteger(pid) && pid > 0) {
          clearTimeout(timer);
          resolve(pid);
        }
      });
      child.on("error", reject);
    });
    const stopped = terminateProcessTree(child.pid!);
    expect(stopped.ok).toBe(true);
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.on("exit", () => resolve());
      setTimeout(() => resolve(), 3_000);
    });
    // The direct child is gone; the descendant was included by taskkill /T or the process group.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const alive = (() => {
      try {
        process.kill(grandchildPid, 0);
        return true;
      } catch {
        return false;
      }
    })();
    expect(alive).toBe(false);
  }, 15_000);
});
