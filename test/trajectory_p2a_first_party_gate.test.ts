/**
 * Trajectory-P2A §9 Level C — THE REAL HOST BUNDLE -> PARENT NO-MODEL INTEGRATION GATE.
 *
 * This suite runs the gate in `scripts/trajectory_p2a/level-c-first-party-gate.mjs`, which boots the
 * CURRENT branch's host bundle in a TEST-OWNED DSH home and drives the SHIPPED worker port. It is the
 * mandatory full P2-A acceptance: the strongest evidence class in this stage.
 *
 * THE CLAIM IT ESTABLISHES (and nothing more): a real first-party DSH Agent Session was created, the
 * Host reported its ACTUAL SessionId on the existing IPC channel, the Parent received it from the
 * child it launched and stamped its OWN invocation, and NO model turn ran.
 *
 * IT DOES NOT ESTABLISH: a durable Attempt -> Session binding, cold recovery, a model turn, capability
 * admission, promotion or automatic Handoff.
 *
 * SAFETY. The gate uses a test-owned DSH home and session root; it loads no personal profile, copies
 * no credential, and invokes no paid model. The no-model stop is the SHIPPED capability refusal, made
 * deterministic by a test-owned probe tool that is unreachable in production.
 *
 * The gate is expensive (it boots DSH), so it runs ONCE and every assertion reads the same result.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const DSH_HOME = (process.env["DSH_HOME"] ?? join(process.env["USERPROFILE"] ?? "", ".dsh")).replace(/\\/g, "/");
const hasFirstPartyDsh = existsSync(join(DSH_HOME, "profiles", "node_modules", "@deepseek-ai", "dsh-agent-loop"));
const hasBuiltDist = existsSync(join(process.cwd(), "dist", "src", "advanced.js"));

interface GateResult {
  readonly verdict: string;
  readonly evidenceClass: string;
  readonly observations: {
    readonly outcomeKind: string;
    readonly identityObservationCount: number;
    readonly observedSessionId: string | null;
    readonly observedInvocationId: string | null;
    readonly observedSource: string | null;
    readonly observedSourceQualification: string | null;
    readonly observedState: string | null;
    readonly observedDirectChildPid: number | null;
    readonly sessionsWrittenByHost: number;
    readonly hostSessionIdsMatchObservation: boolean;
    readonly turnEventCountInWrittenSessions: number;
  };
  readonly corroboratingRun: { readonly hostTelemetry: string | null; readonly workerResult: string | null; readonly captured: boolean };
  readonly realFirstPartyDshPathRan: boolean;
  readonly modelCallsMade: number;
  readonly privateSessionsAccessed: boolean;
}

/**
 * Run the gate once, tolerating its non-zero exit: the gate exits 1 when it does NOT qualify, and the
 * assertions below are what decide whether that happened — so a thrown exec would hide the result.
 */
const gate: GateResult | null = (() => {
  if (!hasFirstPartyDsh || !hasBuiltDist) return null;
  try {
    const stdout = execFileSync(process.execPath, [join(process.cwd(), "scripts", "trajectory_p2a", "level-c-first-party-gate.mjs")], {
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

describe("P2A C5 §9 Level C — the real Host Bundle -> Parent identity route, without a model", () => {
  it("qualifies: a real DSH Session is created and its ACTUAL identity reaches the Parent", () => {
    if (gate === null) {
      // No first-party DSH tree or no built dist on this machine: the gate cannot run, and the
      // assertion states that rather than fabricating a pass.
      expect(hasFirstPartyDsh && hasBuiltDist).toBe(false);
      return;
    }
    expect(gate.evidenceClass).toBe("REAL_HOST_PARENT_INTEGRATION_NO_MODEL");
    expect(gate.verdict).toBe("REAL_HOST_PARENT_IDENTITY_ROUTE_QUALIFIED_NO_MODEL");
    expect(gate.realFirstPartyDshPathRan).toBe(true);
    expect(gate.observations.identityObservationCount).toBe(1);
    expect(gate.observations.observedSessionId).toMatch(/^worker-[0-9a-f-]{36}$/u);
    expect(gate.observations.observedState).toBe("OBSERVED");
  }, 500_000);

  it("the observed identity is a session the Host ACTUALLY wrote, and the Parent stamped its OWN invocation", () => {
    if (gate === null) return;
    expect(gate.observations.sessionsWrittenByHost).toBeGreaterThanOrEqual(1);
    // §9 Level C step 5: the identity the parent recorded names a session that really exists on disk.
    expect(gate.observations.hostSessionIdsMatchObservation).toBe(true);
    // §7.2: the invocation is the PARENT's own wpi- identity, never a payload-supplied value.
    expect(gate.observations.observedInvocationId).toMatch(/^wpi-[0-9a-f-]{36}$/u);
    // §7.3: the source is the direct-child IPC report, and the child pid is a real number.
    expect(gate.observations.observedSource).toBe("DIRECT_CHILD_IPC_REPORT");
    expect(typeof gate.observations.observedDirectChildPid).toBe("number");
    expect(gate.observations.observedSourceQualification).toBe("FIRST_PARTY_DSH_QUALIFIED");
  });

  it("§9.2 — NO model turn ran: zero turn/request events in the written session", () => {
    if (gate === null) return;
    /**
     * A model turn appends turn/start and request/header events. Zero such events is the MEASUREMENT;
     * the structural exclusion (the refusal precedes the only `followup` call) is the source-level
     * guarantee. The claim never rests on an absent provider or a failed request.
     */
    expect(gate.observations.turnEventCountInWrittenSessions).toBe(0);
    expect(gate.modelCallsMade).toBe(0);
    expect(gate.privateSessionsAccessed).toBe(false);
  });

  it("the SHIPPED capability refusal is what stopped the worker — not an unrelated crash", () => {
    if (gate === null) return;
    expect(gate.corroboratingRun.captured).toBe(true);
    // The worker's OWN result line names the fail-closed refusal.
    expect(gate.corroboratingRun.workerResult).toContain("refusing to run this worker");
    expect(gate.corroboratingRun.workerResult).toContain("p2a_refusal_probe");
    // And the host's own telemetry shows the identity report was attempted.
    expect(gate.corroboratingRun.hostTelemetry).toContain('"reported":true');
    // §6.5: SESSION_CREATED was crossed, and the outcome is a HOST_FAILURE, never a Work success.
    expect(gate.observations.outcomeKind).toBe("HOST_FAILURE");
  });
});
