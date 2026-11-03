/**
 * Trajectory-P2-D1 §10.5 — REAL FIRST-PARTY NON-MODEL INTEGRATION (wrapper).
 *
 * Runs `scripts/trajectory_p2d1/real-integration-gate.mjs` and asserts the STRONGEST SAFE combination of
 * real evidence, with the evidence levels reported SEPARATELY and the combined chain explicitly NOT claimed.
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
  readonly processA: { readonly outcome: string; readonly attemptId: string | null; readonly attemptStates: readonly string[] | null };
  readonly processB: {
    readonly outcome: string;
    readonly selectionState: string | null;
    readonly eventCount: number | null;
    readonly arbitraryAttemptCapsuleState: string | null;
    readonly capsuleBuildOk: boolean | null;
    readonly capsuleSerializedBytes: number | null;
    readonly capsuleWithinBudget: boolean | null;
  };
  readonly evidenceLevels: {
    readonly level1_realFirstPartyDshColdRecovery: string;
    readonly level4_combinedRealDshAndRealGovernedSingleChain: string;
  };
  readonly combinedChainClaimed: boolean;
  readonly modelCallsMade: number;
  readonly realFirstPartyDshRan: boolean;
  readonly testRootContained: boolean;
  readonly testRootCleanup: { readonly cleaned: boolean };
}

const gate: GateResult | null = (() => {
  if (!hasFirstPartyDsh || !hasBuiltDist) return null;
  try {
    const stdout = execFileSync(process.execPath, [join(process.cwd(), "scripts", "trajectory_p2d1", "real-integration-gate.mjs")], {
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

describe("P2D1 §10.5 — real first-party non-model integration", () => {
  it("the real cold-recovered chain passes and the test root is safely cleaned", () => {
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
    expect(gate.testRootContained).toBe(true);
    expect(gate.testRootCleanup.cleaned).toBe(true);
  }, 500_000);

  it("the Attempt stays NONTERMINAL: no fabricated settlement", () => {
    if (gate === null || gate.outcome !== "PASS") return;
    expect(gate.processA.attemptStates).toEqual(["RUNNING"]);
    expect(gate.processA.attemptStates).not.toContain("COMPLETED");
  });

  it("the real recovered evidence is qualified and an arbitrary attempt is refused", () => {
    if (gate === null || gate.outcome !== "PASS") return;
    expect(gate.processB.selectionState).toBe("SELECTED_UNIQUE");
    expect(gate.processB.eventCount).toBeGreaterThan(0);
    expect(gate.processB.arbitraryAttemptCapsuleState).toBe("NO_LINEAGE");
    expect(gate.processB.capsuleBuildOk).toBe(true);
    expect(gate.processB.capsuleWithinBudget).toBe(true);
  });

  it("the evidence levels are reported separately and the combined chain is NOT claimed", () => {
    if (gate === null || gate.outcome !== "PASS") return;
    expect(gate.evidenceLevels.level1_realFirstPartyDshColdRecovery).toBe("ESTABLISHED");
    expect(gate.evidenceLevels.level4_combinedRealDshAndRealGovernedSingleChain).toBe("NOT_ESTABLISHED");
    expect(gate.combinedChainClaimed).toBe(false);
    expect(gate.modelCallsMade).toBe(0);
    expect(gate.realFirstPartyDshRan).toBe(true);
  }, 500_000);
});
