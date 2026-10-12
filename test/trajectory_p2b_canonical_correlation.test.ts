/**
 * Trajectory-P2-B §5 B0-C2 (C3) — REAL CANONICAL WORK → REAL DSH SESSION (wrapper).
 *
 * Runs `scripts/trajectory_p2b/canonical-correlation-gate.mjs` and asserts the FULL chain from ONE run:
 * canonical Work AttemptId → Work Delegation JobId → Parent InvocationId → real DSH SessionId, with no
 * model turn, no fabricated settlement, and a qualified durable association.
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
  readonly canonicalAttemptId: string | null;
  readonly canonicalAttemptIdShape: boolean | null;
  readonly hostLocalJobId: string | null;
  readonly invocationId: string | null;
  readonly dshSessionId: string | null;
  readonly source: string | null;
  readonly attemptStatesAfter: readonly string[];
  readonly officialSessionMeasurement: { readonly readState: string; readonly counts: { readonly turnStart: number; readonly requestHeader: number } | null };
  readonly durableTypes: readonly string[];
  readonly qualificationSummary: { readonly qualifiedCount: number } | null;
  readonly qualifiedAssociation: string | null;
  readonly testRootContained: boolean;
  readonly testRootCleanup: { readonly cleaned: boolean };
}

const gate: GateResult | null = (() => {
  if (!hasFirstPartyDsh || !hasBuiltDist) return null;
  try {
    const stdout = execFileSync(process.execPath, [join(process.cwd(), "scripts", "trajectory_p2b", "canonical-correlation-gate.mjs")], {
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

describe("P2B C3 §5 B0-C2 — real canonical Work Attempt → real first-party DSH Session", () => {
  it("§5 B0-C2 — the whole chain is established from ONE run", () => {
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
  }, 500_000);

  it("§5 B0-C2 — the correlated observation names the canonical Attempt, the Parent Invocation and the real Session", () => {
    if (gate === null || gate.outcome !== "PASS") return;
    // §5 B0-C2: the AttemptId came from canonical Work (prepareMutatingWork), not a fabricated value.
    expect(gate.canonicalAttemptIdShape).toBe(true);
    expect(gate.canonicalAttemptId).toMatch(/^attempt-[0-9a-f]{32}$/u);
    // The host-local JobId is Work Delegation's own.
    expect(gate.hostLocalJobId).toMatch(/^wdj-[0-9a-f-]{36}$/u);
    // The invocation is the Parent port's own.
    expect(gate.invocationId).toMatch(/^wpi-[0-9a-f-]{36}$/u);
    // The session is the real DSH one, reported by the direct child.
    expect(gate.dshSessionId).toMatch(/^worker-[0-9a-f-]{36}$/u);
    expect(gate.source).toBe("DIRECT_CHILD_IPC_REPORT");
  });

  it("§5 B0-C2 — no model turn, and no fabricated settlement", () => {
    if (gate === null || gate.outcome !== "PASS") return;
    expect(gate.officialSessionMeasurement.readState).toBe("READ_OK");
    expect(gate.officialSessionMeasurement.counts!.turnStart).toBe(0);
    expect(gate.officialSessionMeasurement.counts!.requestHeader).toBe(0);
    // §5 B0-C2: source observation does NOT grant settlement — the Attempt stays nonterminal.
    expect(gate.attemptStatesAfter).toEqual(["RUNNING"]);
    expect(gate.attemptStatesAfter).not.toContain("COMPLETED");
    expect(gate.attemptStatesAfter).not.toContain("FAILED");
  });

  it("§7 — the observation is durably recorded and qualified, and the test root is safely cleaned", () => {
    if (gate === null || gate.outcome !== "PASS") return;
    expect(gate.durableTypes).toEqual(["SESSION_IDENTITY_OBSERVED", "INVOCATION_OBSERVATION_FINALIZED"]);
    expect(gate.qualificationSummary!.qualifiedCount).toBe(1);
    expect(gate.qualifiedAssociation).toBe("ASSOCIATION_QUALIFIED");
    expect(gate.testRootContained).toBe(true);
    expect(gate.testRootCleanup.cleaned).toBe(true);
  });
});
