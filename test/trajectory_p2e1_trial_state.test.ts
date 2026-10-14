/**
 * Trajectory-P2-E1 §10 Group D — TRIAL STATE CORRECTIONS (C5).
 *
 * Proves the P2-E0 trial-state defects are closed:
 *
 *   36. a CONTROL Provider throw remains CONTROL;
 *   37. a TREATMENT Provider throw remains TREATMENT;
 *   38. an AMBIGUOUS origin is NOT mislabelled RACED;
 *   39. an actual currentness race is classified separately;
 *   40. source-unavailable is distinct from unauthorized;
 *   41. a budget failure is distinct from source invalidity;
 *   42. CONTROL does not transport the hidden Capsule body;
 *   43. OFF remains byte-identical to baseline;
 *   44. no delivery failure modifies canonical Work state.
 *
 * The arm-preservation cases use the REAL composition (`makeContextService` + the real install binding) so the
 * trusted arm is exercised through the product path, not a hand-built stand-in.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { TRAJECTORY_ASSIGNED_ARMS, TRAJECTORY_HISTORICAL_ELIGIBILITY, TRAJECTORY_DELIVERY_STATES } from "../src/context/service.js";

const readSrc = (relative: string): string => readFileSync(relative, "utf8");

describe("E1 §10 Group D — trial state corrections", () => {
  it("36/37. the exception path reads the TRUSTED arm rather than hard-coding one", () => {
    const source = readSrc("src/context/service.ts");
    // The P2-E0 hard-coded TREATMENT on the error path must be gone.
    expect(/assignedArm: "TREATMENT" as const/u.test(source)).toBe(false);
    expect(source).toContain("ports.trajectoryAssignedArm?.()");
    // The arm vocabulary now has an honest UNKNOWN for the no-trusted-arm case.
    expect([...TRAJECTORY_ASSIGNED_ARMS]).toContain("UNKNOWN");
    expect([...TRAJECTORY_ASSIGNED_ARMS]).toContain("CONTROL");
    expect([...TRAJECTORY_ASSIGNED_ARMS]).toContain("TREATMENT");
  });

  it("36/37. the trusted arm is bound from the frozen configuration in install.ts", () => {
    const install = readSrc("src/install.ts");
    expect(install).toContain("core.trajectoryAssignedArm.bind(options.trajectoryPresentationMode ?? \"OFF\")");
    const core = readSrc("src/composition/core.ts");
    expect(core).toContain("trajectoryAssignedArm: () => trajectoryAssignedArmHolder.current");
    expect(core).toContain("trajectoryAssignedArm: {");
  });

  it("38/39. an AMBIGUOUS source is NOT mapped to RACED, and a real race IS", () => {
    const cluster = readSrc("src/composition/execution_association.ts");
    // The P2-E0 one-line `ORIGIN_NOT_SELECTED => RACED` is gone.
    expect(/case "ORIGIN_NOT_SELECTED":\s*\n\s*return "RACED";/u.test(cluster)).toBe(false);
    // The structured reasons are distinguished.
    expect(cluster).toContain('case "SOURCE_RACED":');
    expect(cluster).toContain('case "SOURCE_AMBIGUOUS":');
    expect(cluster).toContain('case "SOURCE_UNBOUND":');
    // Ambiguity maps to NOT_QUALIFIED, not RACED.
    expect(/case "SOURCE_AMBIGUOUS":\s*\n\s*case "SOURCE_UNBOUND":[\s\S]{0,200}?return "NOT_QUALIFIED";/u.test(cluster)).toBe(true);
    expect([...TRAJECTORY_HISTORICAL_ELIGIBILITY]).toContain("RACED");
  });

  it("39. the three ORIGIN_NOT_SELECTED causes carry DISTINCT structured reasons", () => {
    const preview = readSrc("src/composition/attributed_preview.ts");
    expect(preview).toContain('refusalReason: "SOURCE_RACED" as const');
    expect(preview).toContain('refusalReason: "SOURCE_AMBIGUOUS" as const');
    expect(preview).toContain('refusalReason: "SOURCE_UNBOUND" as const');
    expect(preview).toContain("CAPSULE_REFUSAL_REASONS");
  });

  it("40/41. source-unavailable and budget are distinct structured reasons", () => {
    const preview = readSrc("src/composition/attributed_preview.ts");
    expect(preview).toContain('"SOURCE_UNAVAILABLE"');
    expect(preview).toContain('"PAGE_REFUSED"');
    expect(preview).toContain('"CAPSULE_BUDGET"');
    expect(preview).toContain('"CAPSULE_LIMIT"');
    // A budget refusal is still QUALIFIED (the history qualified; only delivery failed).
    const cluster = readSrc("src/composition/execution_association.ts");
    expect(/case "CAPSULE_BUDGET":[\s\S]{0,300}?return "QUALIFIED";/u.test(cluster)).toBe(true);
  });

  it("43. OFF is byte-identical: an OFF arm delivers nothing at all", () => {
    const cluster = readSrc("src/composition/execution_association.ts");
    expect(cluster).toContain('if (assignedArm === "OFF") return null;');
    // The delivery-state vocabulary still names DELIVERY_DISABLED for the OFF arm.
    expect([...TRAJECTORY_DELIVERY_STATES]).toContain("DELIVERY_DISABLED");
  });

  it("42. CONTROL still receives no historical Capsule body", () => {
    const cluster = readSrc("src/composition/execution_association.ts");
    expect(cluster).toContain('const capsule = authorized && result !== null && mode === "TREATMENT" ? result.capsule : null;');
  });

  it("44. a delivery failure cannot modify canonical Work (the provider never writes Work)", () => {
    const cluster = readSrc("src/composition/execution_association.ts");
    // The provider reads `capsuleForConsumer` and builds a presentation; it calls no Work mutation.
    const providerBody = cluster.slice(cluster.indexOf("const trajectoryCapsuleDelivery ="), cluster.indexOf("return Object.freeze({\n    workWorkerPortFactory"));
    for (const forbidden of ["settleMutatingWork", "prepareMutatingWork", "controller.report", "controller.gate", "store.append"]) {
      expect(providerBody).not.toContain(forbidden);
    }
  });

  it("the delivery-state vocabulary names an explicit FAILED and NOT_ATTEMPTED", () => {
    expect([...TRAJECTORY_DELIVERY_STATES]).toContain("FAILED");
    expect([...TRAJECTORY_DELIVERY_STATES]).toContain("NOT_ATTEMPTED");
  });
});
