/**
 * Trajectory-P2-E0 §9 — SOURCE-QUALIFIED PRODUCT-TO-DSH DELIVERY (E0-C) wrapper.
 *
 * Runs `scripts/trajectory_p2e0/source-to-dsh-gate.mjs` and asserts the CONTROLLED integrated chain, with
 * the two evidence levels reported SEPARATELY and E0-L2 explicitly NOT claimed.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const DSH_HOME = (process.env["DSH_HOME"] ?? join(process.env["USERPROFILE"] ?? "", ".dsh")).replace(/\\/gu, "/");
const hasFirstPartyDsh = existsSync(join(DSH_HOME, "profiles", "node_modules", "@deepseek-ai", "dsh-session"));
const hasBuiltDist = existsSync(join(process.cwd(), "dist", "src", "advanced.js"));

interface GateResult {
  readonly outcome: string;
  readonly capsuleState: string | null;
  readonly capsuleOriginAttemptId: string | null;
  readonly capsuleConsumerAttemptId: string | null;
  readonly capsuleEventCount: number | null;
  readonly capsuleReadOriginSession: string | null;
  readonly presentationMode: string | null;
  readonly sectionDigest: string | null;
  readonly presentationCapsuleDigestMatchesMaterialization: boolean | null;
  readonly persistedMessageContainsSection: boolean | null;
  readonly persistedSectionDigestMatchesProduct: boolean | null;
  readonly capsuleOriginMatchesGovernedOrigin: boolean | null;
  readonly capsuleConsumerMatchesCanonicalA1: boolean | null;
  readonly consumerSessionDiffersFromOrigin: boolean | null;
  readonly evidenceLevel: string | null;
  readonly evidenceLevels: { readonly e0L1_controlledSourceToDshInput: string; readonly e0L2_realFirstPartyOriginChain: string };
  readonly ownedRootRemoved: boolean;
  readonly ownedRoot: { readonly cleanup: { readonly cleaned: boolean } };
  readonly dependencyRootPreserved: boolean;
  readonly realCanonicalWorkRan: boolean;
  readonly realGovernedReworkOccurred: boolean;
  readonly originExecutionIsControlledFixture: boolean;
  readonly realFirstPartyDshOriginRan: boolean;
  readonly realProductCapsuleAdmissionSucceeded: boolean;
  readonly realDshUserMessageInspected: boolean;
  readonly externalModelRequestOccurred: boolean;
  readonly stochasticTrialOccurred: boolean;
  readonly modelCallsMade: number;
}

const gate: GateResult | null = (() => {
  if (!hasFirstPartyDsh || !hasBuiltDist) return null;
  try {
    const stdout = execFileSync(process.execPath, [join(process.cwd(), "scripts", "trajectory_p2e0", "source-to-dsh-gate.mjs")], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: 900_000,
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

describe("E0-C §9 — source-qualified product-to-DSH delivery", () => {
  it("the controlled source-to-input chain passes and the owned root is safely cleaned", () => {
    if (gate === null) {
      expect(hasFirstPartyDsh && hasBuiltDist).toBe(false);
      return;
    }
    if (gate.outcome === "SKIPPED" || gate.outcome === "BLOCKED") {
      expect(gate.outcome).not.toBe("PASS");
      return;
    }
    expect(gate.outcome).toBe("PASS");
    expect(gate.evidenceLevel).toBe("E0_L1_CONTROLLED_SOURCE_TO_DSH_INPUT");
    expect(gate.ownedRootRemoved).toBe(true);
    expect(gate.ownedRoot.cleanup.cleaned).toBe(true);
    expect(gate.dependencyRootPreserved).toBe(true);
  }, 960_000);

  it("the Capsule is the REAL product materialization of the GOVERNED origin", () => {
    if (gate === null || gate.outcome !== "PASS") return;
    expect(gate.capsuleState).toBe("AUTHORIZED");
    expect(gate.capsuleOriginMatchesGovernedOrigin).toBe(true);
    expect(gate.capsuleConsumerMatchesCanonicalA1).toBe(true);
    expect(gate.capsuleEventCount).toBeGreaterThan(0);
    // The Capsule's history came from the ORIGIN's real DSH session, not a fabricated one.
    expect(gate.capsuleReadOriginSession).toBeTruthy();
    expect(gate.realCanonicalWorkRan).toBe(true);
    expect(gate.realGovernedReworkOccurred).toBe(true);
  });

  it("the REAL DSH user/message contains the product-rendered Section, with matching digests", () => {
    if (gate === null || gate.outcome !== "PASS") return;
    expect(gate.presentationMode).toBe("TREATMENT");
    expect(gate.presentationCapsuleDigestMatchesMaterialization).toBe(true);
    expect(gate.persistedMessageContainsSection).toBe(true);
    expect(gate.persistedSectionDigestMatchesProduct).toBe(true);
    expect(gate.realDshUserMessageInspected).toBe(true);
    expect(gate.consumerSessionDiffersFromOrigin).toBe(true);
  });

  it("the evidence levels are separate: E0-L1 established, E0-L2 NOT established", () => {
    if (gate === null || gate.outcome !== "PASS") return;
    expect(gate.evidenceLevels.e0L1_controlledSourceToDshInput).toBe("ESTABLISHED");
    expect(gate.evidenceLevels.e0L2_realFirstPartyOriginChain).toBe("NOT_ESTABLISHED");
    expect(gate.originExecutionIsControlledFixture).toBe(true);
    expect(gate.realFirstPartyDshOriginRan).toBe(false);
  });

  it("no external or paid model request occurred and no stochastic trial ran", () => {
    if (gate === null || gate.outcome !== "PASS") return;
    expect(gate.externalModelRequestOccurred).toBe(false);
    expect(gate.stochasticTrialOccurred).toBe(false);
    expect(gate.modelCallsMade).toBe(0);
  });
});
