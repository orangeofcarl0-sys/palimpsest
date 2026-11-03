/**
 * Trajectory-P2-C §11 (C6) — REAL COLD-RECOVERED PRODUCT PREVIEW (wrapper).
 *
 * Runs `scripts/trajectory_p2c/cold-preview-gate.mjs`, which drives TWO INDEPENDENT PROCESSES through the
 * NORMAL product composition. Process A starts real work and durably records the association; Process B
 * recomposes the product and presents ACTUAL DSH events through the read-only attributed Preview.
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
  readonly normalProductCompositionUsed: boolean;
  readonly processA: { readonly outcome: string; readonly attemptId: string | null; readonly sessionId: string | null; readonly attemptStates: readonly string[]; readonly promotionCount: number };
  readonly processB: { readonly outcome: string; readonly selectionState: string | null; readonly sessionId: string | null; readonly eventCount: number | null; readonly eventTypes: readonly string[] | null; readonly coverage: string | null };
  readonly testRootContained: boolean;
  readonly testRootCleanup: { readonly cleaned: boolean };
  readonly modelCallsMade: number;
  readonly privateSessionsAccessed: boolean;
}

const gate: GateResult | null = (() => {
  if (!hasFirstPartyDsh || !hasBuiltDist) return null;
  try {
    const stdout = execFileSync(process.execPath, [join(process.cwd(), "scripts", "trajectory_p2c", "cold-preview-gate.mjs")], {
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

describe("P2C C6 §11 — real cold-recovered attributed product preview", () => {
  it("§11.1/§11.2 — Process A records and Process B recovers, through NORMAL product composition", () => {
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
    expect(gate.normalProductCompositionUsed).toBe(true);
    expect(gate.processA.outcome).toBe("PASS");
    expect(gate.processB.outcome).toBe("PASS");
  }, 500_000);

  it("§11.3 — the Preview contains ACTUAL attributed DSH events, with no fabricated settlement", () => {
    if (gate === null || gate.outcome !== "PASS") return;
    // A real canonical attempt, left nonterminal: source observation grants no settlement.
    expect(gate.processA.attemptId).toMatch(/^attempt-[0-9a-f]{32}$/u);
    expect(gate.processA.attemptStates).toEqual(["RUNNING"]);
    expect(gate.processA.promotionCount).toBe(0);
    // Process B selected the unique qualified invocation and admitted real events.
    expect(gate.processB.selectionState).toBe("SELECTED_UNIQUE");
    expect(gate.processB.sessionId).toMatch(/^worker-[0-9a-f-]{36}$/u);
    expect(gate.processB.sessionId).toBe(gate.processA.sessionId);
    expect(gate.processB.eventCount).toBeGreaterThan(0);
    expect(gate.processB.coverage).toBe("FULL");
    expect(gate.modelCallsMade).toBe(0);
    expect(gate.privateSessionsAccessed).toBe(false);
  });

  it("§5 B0-F3 — the run directory is owned, contained and safely cleaned", () => {
    if (gate === null || gate.outcome !== "PASS") return;
    expect(gate.testRootContained).toBe(true);
    expect(gate.testRootCleanup.cleaned).toBe(true);
  });
});
