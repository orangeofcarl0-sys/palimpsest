/**
 * Trajectory-P2-B §10 (C6) — REAL COLD RECOVERY (wrapper).
 *
 * Runs `scripts/trajectory_p2b/cold-recovery-gate.mjs`, which drives TWO INDEPENDENT processes: one that
 * records a real first-party execution association, and a second that starts fresh and recovers it from
 * durable records alone. This wrapper asserts the gate's explicit outcome.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const DSH_HOME = (process.env["DSH_HOME"] ?? join(process.env["USERPROFILE"] ?? "", ".dsh")).replace(/\\/g, "/");
const hasFirstPartyDsh = existsSync(join(DSH_HOME, "profiles", "node_modules", "@deepseek-ai", "dsh-session"));
const hasBuiltDist = existsSync(join(process.cwd(), "dist", "src", "advanced.js"));

interface GateResult {
  readonly outcome: string;
  readonly qualified: boolean;
  readonly independentProcesses: boolean;
  readonly processA: { readonly outcome: string; readonly recordedSessionId: string | null; readonly durableEventCount: number | null };
  readonly processB: { readonly outcome: string; readonly recoveredSessionId: string | null; readonly matches: boolean | null };
  readonly testRootContained: boolean;
  readonly testRootCleanup: { readonly cleaned: boolean };
  readonly modelCallsMade: number;
  readonly privateSessionsAccessed: boolean;
}

const gate: GateResult | null = (() => {
  if (!hasFirstPartyDsh || !hasBuiltDist) return null;
  try {
    const stdout = execFileSync(process.execPath, [join(process.cwd(), "scripts", "trajectory_p2b", "cold-recovery-gate.mjs")], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      timeout: 480_000,
    });
    return JSON.parse(stdout) as GateResult;
  } catch (error) {
    const candidate = (error as { readonly stdout?: unknown }).stdout;
    if (typeof candidate === "string" && candidate.trim() !== "") {
      try {
        return JSON.parse(candidate) as GateResult;
      } catch {
        return null;
      }
    }
    return null;
  }
})();

describe("P2B C6 §10 — real cold recovery in an independent process", () => {
  it("§10.1 — Process A records and Process B recovers, in TWO separate processes", () => {
    if (gate === null) {
      expect(hasFirstPartyDsh && hasBuiltDist).toBe(false);
      return;
    }
    if (gate.outcome === "SKIPPED" || gate.outcome === "BLOCKED") {
      expect(gate.qualified).toBe(false);
      return;
    }
    expect(gate.outcome).toBe("PASS");
    expect(gate.qualified).toBe(true);
    expect(gate.independentProcesses).toBe(true);
    expect(gate.processA.outcome).toBe("PASS");
    expect(gate.processB.outcome).toBe("PASS");
  }, 500_000);

  it("§10.2 — the recovered association has the SAME semantic identity, without Process A's memory", () => {
    if (gate === null || gate.outcome !== "PASS") return;
    // Process A committed two durable records; Process B replayed exactly those.
    expect(gate.processA.durableEventCount).toBe(2);
    // The recovered SessionId is the one Process A recorded — recomputed, not remembered.
    expect(gate.processB.matches).toBe(true);
    expect(gate.processB.recoveredSessionId).toBe(gate.processA.recordedSessionId);
    expect(gate.processB.recoveredSessionId).toMatch(/^worker-[0-9a-f-]{36}$/u);
    expect(gate.modelCallsMade).toBe(0);
    expect(gate.privateSessionsAccessed).toBe(false);
  });

  it("§5 B0-F3 — the run directory is owned, contained and safely cleaned", () => {
    if (gate === null || gate.outcome !== "PASS") return;
    expect(gate.testRootContained).toBe(true);
    expect(gate.testRootCleanup.cleaned).toBe(true);
  });
});
