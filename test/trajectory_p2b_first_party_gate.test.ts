/**
 * Trajectory-P2-B §5 B0-C2 (C2) — THE CORRECTED FIRST-PARTY NO-MODEL GATE (wrapper).
 *
 * Runs `scripts/trajectory_p2b/level-b-first-party-gate.mjs` and asserts its EXPLICIT outcome. Unlike
 * the P2-A wrapper (B0-F2), this one does NOT treat "did not run" as a pass:
 *
 *   PASS             the real Host Bundle ran, a real Session was created and read through the official
 *                    reader, the identity reached the Parent, and the logical stream has ZERO turns.
 *   SKIPPED          no installed first-party DSH tree — reported as SKIPPED, and the test asserts that
 *                    the SKIPPED outcome is what actually happened (it does not fabricate a pass).
 *   BLOCKED          no built dist.
 *   NOT_ESTABLISHED  the gate ran but did not qualify — a FAILURE of this test.
 *
 * The gate is expensive (it boots DSH), so it runs ONCE and every assertion reads the same result.
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
  readonly testRootContained: boolean;
  readonly testRootIsReparsePoint: boolean;
  readonly testRootCleanup: { readonly cleaned: boolean; readonly reason?: string };
  readonly parentOutcomeKind: string;
  readonly parentFailureDetail: string | null;
  readonly identityObservationCount: number;
  readonly observedSessionId: string | null;
  readonly observedInvocationId: string | null;
  readonly observedSource: string | null;
  readonly observedState: string | null;
  readonly officialSessionMeasurement: {
    readonly readState: string;
    readonly headerSessionId: string | null;
    readonly persistedEventCount: number;
    readonly counts: { readonly turnStart: number; readonly stepStart: number; readonly requestHeader: number } | null;
  };
  readonly hostOwnTelemetry: { readonly hostIdentityTelemetry: string | null; readonly hostWorkerResultLine: string | null };
  readonly modelCallsMade: number;
  readonly privateSessionsAccessed: boolean;
  readonly realFirstPartyDshPathRan: boolean;
}

/**
 * Run the gate once, tolerating its non-zero exit: a non-PASS outcome is what the assertions below
 * decide on, so a thrown exec would hide the result.
 */
const gate: GateResult | null = (() => {
  if (!hasFirstPartyDsh || !hasBuiltDist) return null;
  try {
    const stdout = execFileSync(process.execPath, [join(process.cwd(), "scripts", "trajectory_p2b", "level-b-first-party-gate.mjs")], {
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

describe("P2B C2 §5 B0-C2 — corrected first-party no-model gate", () => {
  it("§5 B0-F2 — the gate reports an explicit outcome; SKIPPED is never counted as a pass", () => {
    if (gate === null) {
      /**
       * The gate could not run because DSH or dist is absent. This is asserted EXPLICITLY as the SKIPPED
       * condition — and the test does NOT claim the runtime route was qualified. On a machine with the
       * first-party tree (the qualification environment) the gate runs and the assertions below apply.
       */
      expect(hasFirstPartyDsh && hasBuiltDist).toBe(false);
      return;
    }
    expect(["PASS", "SKIPPED", "BLOCKED", "NOT_ESTABLISHED"]).toContain(gate.outcome);
    if (gate.outcome === "SKIPPED" || gate.outcome === "BLOCKED") {
      // A gate that did not run must not assert qualification.
      expect(gate.qualified).toBe(false);
      return;
    }
    // On a machine that can run it, the gate MUST qualify.
    expect(gate.outcome).toBe("PASS");
    expect(gate.qualified).toBe(true);
  }, 500_000);

  it("§5 B0-F1 — the no-model claim is measured on the LOGICAL stream, not a UTF-8 scan", () => {
    if (gate === null || gate.outcome !== "PASS") return;
    expect(gate.officialSessionMeasurement.readState).toBe("READ_OK");
    expect(gate.officialSessionMeasurement.counts).not.toBeNull();
    expect(gate.officialSessionMeasurement.counts!.turnStart).toBe(0);
    expect(gate.officialSessionMeasurement.counts!.requestHeader).toBe(0);
    // The session really exists and its header names the observed identity.
    expect(gate.officialSessionMeasurement.headerSessionId).toBe(gate.observedSessionId);
    expect(gate.modelCallsMade).toBe(0);
    expect(gate.privateSessionsAccessed).toBe(false);
  });

  it("§5 B0-C2 — a real Session was created and its ACTUAL identity reached the Parent", () => {
    if (gate === null || gate.outcome !== "PASS") return;
    expect(gate.realFirstPartyDshPathRan).toBe(true);
    expect(gate.identityObservationCount).toBe(1);
    expect(gate.observedSessionId).toMatch(/^worker-[0-9a-f-]{36}$/u);
    expect(gate.observedInvocationId).toMatch(/^wpi-[0-9a-f-]{36}$/u);
    expect(gate.observedSource).toBe("DIRECT_CHILD_IPC_REPORT");
    expect(gate.observedState).toBe("OBSERVED");
  });

  it("§5 B0-F3 — the run directory is uniquely owned, contained, and safely cleaned", () => {
    if (gate === null || gate.outcome !== "PASS") return;
    expect(gate.testRootContained).toBe(true);
    expect(gate.testRootIsReparsePoint).toBe(false);
    expect(gate.testRootCleanup.cleaned).toBe(true);
  });

  it("CHANGED ASSERTION (P2E1 C6b) §5 B0-F4 — Host Failure, the Parent outcome and the Host's own refusal reason stay DISTINCT", () => {
    if (gate === null || gate.outcome !== "PASS") return;
    // The Parent's structured outcome is a HOST_FAILURE.
    expect(gate.parentOutcomeKind).toBe("HOST_FAILURE");
    /**
     * CHANGED ASSERTION (P2E1 C6b). At the P2-B baseline this asserted the Parent's detail contained
     * "worker result has unknown argument" — i.e. it pinned the PRESENCE of the P2-E0 F14 defect: the parent
     * re-read the HOST's own `{kind:"HOST_FAILURE", detail}` diagnostic line as if it were a worker outcome,
     * and the strict parser then rejected the host's own `detail` field. P2-E1 fixed that by making the
     * parent SKIP a HOST_FAILURE line rather than feed it to the worker parser, so the parent now reports the
     * honest fact ("exited ... without reporting an outcome") and no longer conflates the host's refusal
     * reason with a parse failure. The three facts (parent outcome, host refusal reason, session identity)
     * remain DISTINCT — which is B0-F4's actual intent — now by construction rather than as a defect artifact.
     */
    expect(gate.parentFailureDetail).not.toContain("unknown argument");
    expect(gate.parentFailureDetail).toContain("without reporting an outcome");
    // The Host's OWN telemetry carries the actual refusal reason, observed as its own fact.
    expect(gate.hostOwnTelemetry.hostWorkerResultLine).toContain("refusing to run this worker");
    expect(gate.hostOwnTelemetry.hostWorkerResultLine).toContain("p2a_refusal_probe");
    // The parent's detail does NOT leak the host's refusal reason: the two facts stay separate.
    expect(gate.parentFailureDetail).not.toContain("p2a_refusal_probe");
    // And the Host's own identity report was attempted.
    expect(gate.hostOwnTelemetry.hostIdentityTelemetry).toContain('"reported":true');
  });
});
