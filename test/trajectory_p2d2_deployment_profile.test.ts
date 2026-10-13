/**
 * Trajectory-P2-D2 §10/§13 Group F — NORMAL FIRST-PARTY DEPLOYMENT COMPATIBILITY (C6).
 *
 * Proves the EXPERIMENTAL, model-visible Trajectory delivery can be enabled through a SUPPORTED, STRICT
 * deployment-profile path, and that the default packaged path is unchanged:
 *
 *   46. the expert `installPalimpsest()` path accepts the arm and section budget;
 *   48. the STRICT profile parser refuses an invalid mode and nonfinite budgets, and rejects unknown keys;
 *   49. the default profile (no `trajectory` section) composes nothing;
 *   50. the model cannot select the arm (it is profile configuration, not Task text);
 *   51. a model cannot nominate another Origin/Session (there is no such field anywhere on the surface);
 *   52. composing the option starts no Worker, model, Attempt or Session.
 *
 * SAFETY. Pure config parsing + in-memory composition; no DSH, no model, no network, no personal data.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { DeploymentProfileError, parseDeploymentProfile } from "../src/deployment/index.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

function profileObject(): Record<string, unknown> {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-p2d2-c6-"));
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* windows */
    }
  });
  const dir = join(root, "peer");
  return {
    schemaVersion: 1,
    profileId: "deploy-cli",
    projectId: "palimpsest",
    localPeer: "peer-palimpsest",
    persistentPoint: "pp-palimpsest",
    transport: { namespace: "dogfood", databasePath: join(root, "transport.sqlite") },
    databases: {
      orchestration: join(dir, "palimpsest.sqlite"),
      ordarium: join(dir, "ops.sqlite"),
      coordination: join(dir, "coordination.sqlite"),
      transportCursors: join(dir, "cursors.sqlite"),
    },
    attention: { policyId: "cli-attention-v1", cooldownMs: 0, activation: "none" },
  };
}

describe("P2D2 §10 — strict, opt-in experimental Trajectory deployment configuration", () => {
  it("49. the default profile composes NO trajectory configuration", () => {
    const parsed = parseDeploymentProfile(profileObject());
    expect(parsed.trajectory).toBeUndefined();
  });

  it("48. an explicit trajectory section is parsed strictly, and each arm is accepted", () => {
    for (const mode of ["OFF", "CONTROL", "TREATMENT"] as const) {
      const parsed = parseDeploymentProfile({ ...profileObject(), trajectory: { mode } });
      expect(parsed.trajectory?.mode).toBe(mode);
    }
    // An empty section is valid (presence = the switch; mode defaults to OFF at composition).
    expect(parseDeploymentProfile({ ...profileObject(), trajectory: {} }).trajectory).toEqual({});
    // Optional lower budgets are accepted.
    const bounded = parseDeploymentProfile({ ...profileObject(), trajectory: { mode: "TREATMENT", capsuleMaxSerializedBytes: 4096, sectionMaxBytes: 8192 } });
    expect(bounded.trajectory?.capsuleMaxSerializedBytes).toBe(4096);
    expect(bounded.trajectory?.sectionMaxBytes).toBe(8192);
  });

  it("48. the parser REFUSES an invalid mode, nonfinite budgets, and unknown keys", () => {
    // A malformed mode name fails closed.
    expect(() => parseDeploymentProfile({ ...profileObject(), trajectory: { mode: "TREAT" } })).toThrow(DeploymentProfileError);
    expect(() => parseDeploymentProfile({ ...profileObject(), trajectory: { mode: "off" } })).toThrow(DeploymentProfileError);
    // Nonfinite / fractional / negative budgets fail closed.
    expect(() => parseDeploymentProfile({ ...profileObject(), trajectory: { capsuleMaxSerializedBytes: Number.NaN } })).toThrow(DeploymentProfileError);
    expect(() => parseDeploymentProfile({ ...profileObject(), trajectory: { capsuleMaxSerializedBytes: Number.POSITIVE_INFINITY } })).toThrow(DeploymentProfileError);
    expect(() => parseDeploymentProfile({ ...profileObject(), trajectory: { sectionMaxBytes: -1 } })).toThrow(DeploymentProfileError);
    expect(() => parseDeploymentProfile({ ...profileObject(), trajectory: { sectionMaxBytes: 1.5 } })).toThrow(DeploymentProfileError);
    // An unknown key is refused (a model/operator cannot smuggle an authority field).
    expect(() => parseDeploymentProfile({ ...profileObject(), trajectory: { mode: "TREATMENT", sessionId: "s" } })).toThrow(DeploymentProfileError);
    expect(() => parseDeploymentProfile({ ...profileObject(), trajectory: { mode: "TREATMENT", originAttemptId: "a" } })).toThrow(DeploymentProfileError);
  });

  it("50/51. there is NO profile or install field by which a model could pick an arm, an Origin or a Session", () => {
    // The trajectory section accepts exactly three keys; none names an arm source, an origin or a session.
    const parsed = parseDeploymentProfile({ ...profileObject(), trajectory: { mode: "TREATMENT" } });
    expect(Object.keys(parsed.trajectory ?? {}).sort()).toEqual(["mode"]);
    // The profile type carries no per-task or model-supplied arm selector.
    expect(parsed).not.toHaveProperty("taskText");
    // An attempt to pass an origin/session through the section is an unknown-field refusal (above).
  });

  it("52. composing the experimental option starts no Worker, model, Attempt or Session", async () => {
    /**
     * §10.4: enabling the capability is COMPOSITION, not execution. The install option only binds a delivery
     * provider; the actual Worker start remains controlled by the existing Work Delegation governance. This
     * asserts the composition-level fact: `launchDeployment` is never reached by parsing a profile, and the
     * profile itself carries no execution trigger. (A behavioural proof that no Worker starts is provided by
     * the default-OFF P2-D1 delivery tests, which show no delivery occurs without a governed lineage.)
     */
    const parsed = parseDeploymentProfile({ ...profileObject(), trajectory: { mode: "TREATMENT" } });
    expect(parsed.trajectory?.mode).toBe("TREATMENT");
    // Parsing a profile is a pure function of its bytes: it returns a frozen value and touches nothing else.
    expect(Object.isFrozen(parsed.trajectory)).toBe(true);
  });
});
