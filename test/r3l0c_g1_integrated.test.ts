/**
 * R3-L0C-G1 §12 C4 — INTEGRATED NON-MODEL VALIDATION OVER THE REAL PRODUCT STACK.
 *
 * §12 C4 requires a real local child-process stub driven through the ACTUAL product port and Work Delegation
 * interface, demonstrating observed PID, HostJob/Attempt correlation, observation persistence and negative
 * controls. This file asserts exactly those, plus the §9 compatibility properties.
 *
 * SAFETY. The stub is local and non-model. No DSH binary, provider route or remote service is invoked.
 */
import { describe, expect, it } from "vitest";

import { runIntegratedValidation } from "../scripts/r3l0c_g1/acceptance.mjs";
import { EVIDENCE_STATE, LOCAL_EVIDENCE_CLASS } from "../scripts/r3l0c_g1/contract.mjs";

describe("R3-L0C-G1 §12 C4 — the real product stack produces a host observation", () => {
  it("C4: a real direct child is observed with its actual pid, correlated to the product's own AttemptId", async () => {
    const result = await runIntegratedValidation();

    expect(result.ranRealProductStack).toBe(true);
    expect(result.usedLocalStub).toBe(true);
    expect(result.stubInvokedDshOrProvider).toBe(false);
    expect(result.modelCallsMade).toBe(0);

    // §4: a real OS pid, and the role is DIRECT_CHILD — never a promoted DSH worker.
    expect(typeof result.directChildPidObserved).toBe("number");
    expect(result.directChildPidObserved).toBeGreaterThan(0);
    expect(result.processRole).toBe("DIRECT_CHILD");

    // §4: a real close event with a real exit code.
    expect(result.exitObserved).toBe(true);
    expect(result.exitCode).toBe(0);

    // §5: the correlation names exactly the AttemptId the product minted.
    expect(result.attemptId).toMatch(/^attempt-[0-9a-f]{32}$/u);
    expect(result.correlationIsExact).toBe(true);
    expect(result.hostLocalJobIdMatches).toBe(true);
    expect(result.jobPhase).toBe("FINISHED");
  });

  it("C4: the observation record is durable, re-read and content-verified", async () => {
    const result = await runIntegratedValidation();
    expect(result.recordWritten).toBe(true);
    expect(result.recordDurabilityVerified).toBe(true);
    expect(result.recordDigestOkOnReadBack).toBe(true);
    expect(result.recordContentBindingFailed).toBe(false);
  });

  it("C4: the observation carries only the events the host actually observed", async () => {
    const result = await runIntegratedValidation();
    expect(result.eventKinds).toEqual([
      "DIRECT_CHILD_SPAWN_ATTEMPTED",
      "DIRECT_CHILD_SPAWN_OBSERVED",
      "DIRECT_CHILD_EXIT_OBSERVED",
    ]);
    // §4: an observed exit means NO unconfirmed-exit event for this invocation.
    expect(result.eventKinds).not.toContain("DIRECT_CHILD_EXIT_UNCONFIRMED");
  });

  it("C4: the correlation of an uncorroborated record is NOT live-primary provenance", async () => {
    const result = await runIntegratedValidation();
    // §6: with no journal supplied, the record cannot reach RUN_ATTEMPT_CORRELATED — and never LIVE_PRIMARY.
    expect([EVIDENCE_STATE.PROVENANCE_INCOMPLETE, EVIDENCE_STATE.PROVENANCE_CONFLICT]).toContain(result.correlation.state);
    expect(result.correlation.livePrimary).toBeUndefined();
    expect(result.recordProvesNothingAboutPrimary).toBe(true);
  });

  it("C4: the evidence class is the LIMITED local non-model class", () => {
    expect(LOCAL_EVIDENCE_CLASS.PASS).toBe("PASS_LOCAL_NONMODEL");
    expect(LOCAL_EVIDENCE_CLASS.doesNotProve).toContain("genuine DSH worker");
  });
});

describe("R3-L0C-G1 §9 — product compatibility is preserved", () => {
  it("C4: the Work Attempt settles normally with the observer attached", async () => {
    const result = await runIntegratedValidation();
    // The product's OWN settlement ran and completed the attempt; the observer did not cause or prevent it.
    expect(result.jobPhase).toBe("FINISHED");
    expect(result.attemptId).not.toBeNull();
  });

  it("C4: a second run yields a different pid, AttemptId and job — nothing is cached or merged", async () => {
    const first = await runIntegratedValidation();
    const second = await runIntegratedValidation();
    expect(second.attemptId).not.toBe(first.attemptId);
    expect(second.jobId).not.toBe(first.jobId);
  });
});
