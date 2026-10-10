/**
 * R3-L0C-G1-B §9 — THE AUTHORITATIVE LOCAL INTEGRATION CHAIN AND ITS NEGATIVE MUTATIONS.
 *
 * §9 requires the full bounded chain over the REAL product stack and the REAL frozen journal, plus negative
 * mutations that travel the SAME path and fail to attain a trusted correlation. Every test here runs a real local
 * non-model Node child; no DSH binary, provider route or remote service is invoked.
 */
import { describe, expect, it } from "vitest";

import { NEGATIVE_MUTATIONS, runAuthoritativeChain, runNegativeMutation } from "../scripts/r3l0c_g1b/authoritative-chain.mjs";
import { EVIDENCE_STATE } from "../scripts/r3l0c_g1/contract.mjs";

describe("R3-L0C-G1-B §9 — the positive authoritative chain", () => {
  it("binds one real port invocation to the Work Attempt and reaches RUN_ATTEMPT_CORRELATED", async () => {
    const result = await runAuthoritativeChain();

    expect(result.ranRealProductStack).toBe(true);
    expect(result.usedLocalStub).toBe(true);
    expect(result.stubInvokedDshOrProvider).toBe(false);
    expect(result.modelCallsMade).toBe(0);

    // §4 B1: ONE invocation identity across the whole chain.
    expect(result.invocationIdentityConsistent).toBe(true);
    expect(result.correlatedInvocationIds).toHaveLength(1);
    expect(result.observationInvocationIds).toHaveLength(1);
    expect(result.correlatedInvocationIds[0]).toBe(result.observationInvocationIds[0]);

    // §5: a real pid and a real exit, with a coherent process identity.
    expect(typeof result.directChildPidObserved).toBe("number");
    expect(result.processRole).toBe("DIRECT_CHILD");
    expect(result.exitObserved).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.pidCoherent).toBe(true);

    // §5: the real events were accepted, persisted and read back.
    expect(result.acceptedEventCount).toBeGreaterThan(0);
    expect(result.rejectedEventCount).toBe(0);
    expect(result.persistedEventCount).toBe(result.acceptedEventCount);
    expect(result.readBackEventCount).toBe(result.persistedEventCount);
    expect(result.lifecycle.complete).toBe(true);

    // §5/§6: durable, verified, and correlated through the real journal and claim.
    expect(result.recordWritten).toBe(true);
    expect(result.recordDurabilityVerified).toBe(true);
    expect(result.recordIdentityMatches).toBe(true);
    expect(result.journalExists).toBe(true);
    expect(result.journalIntact).toBe(true);
    expect(result.correlation.state).toBe(EVIDENCE_STATE.RUN_ATTEMPT_CORRELATED);
    expect(result.correlation.correlated).toBe(true);
    // §8: correlation is never live-primary provenance.
    expect(result.correlation.livePrimary).toBe(false);
  }, 120_000);

  it("appends only the chain labels whose relations were actually checked", async () => {
    const result = await runAuthoritativeChain();
    const chain = result.correlation.chain;
    for (const label of [
      "TRUSTED_LOCAL_RECORDER_INGESTION",
      "CONTENT_INTEGRITY_VERIFIED",
      "NONEMPTY_PROCESS_OBSERVATION",
      "PROCESS_EVENT_SEQUENCE_VALID",
      "JOURNAL_INTEGRITY_VERIFIED",
      "RUN_STARTED",
      "RUN_CLAIM_VERIFIED",
      "DURABLE_TRIAL_ATTEMPT_IDENTITY",
      "HOST_JOB_ASSOCIATION_VERIFIED",
    ]) {
      expect(chain).toContain(label);
    }
    // §8: the canonical AttemptId comes from the Work Owner.
    expect(result.canonicalAttemptId).toMatch(/^attempt-[0-9a-f]{32}$/u);
  }, 120_000);
});

describe("R3-L0C-G1-B §9 — the negative mutations all fail to attain a trusted correlation", () => {
  it("declares the six required mutations", () => {
    expect(NEGATIVE_MUTATIONS.map((entry) => entry.id)).toEqual([
      "N1_SECOND_INVOCATION_IDENTITY",
      "N2_EVENT_REMOVED",
      "N3_ATTEMPT_ID_CHANGED",
      "N4_WRONG_CLAIM_NONCE",
      "N5_DUPLICATE_TRIAL",
      "N6_FORGED_ORIGIN_SUBSTITUTION",
    ]);
  });

  it("N1: a second invocation identity at the correlation boundary is refused", async () => {
    const result = await runNegativeMutation("N1_SECOND_INVOCATION_IDENTITY");
    expect(result.refused).toBe(true);
    expect(result.attainedPositiveCorrelation).toBe(false);
    expect(result.state).toBe(EVIDENCE_STATE.PROVENANCE_CONFLICT);
    expect(result.problems.join(" ")).toContain("second invocation identity");
  }, 120_000);

  it("N2: removing one persisted event leaves the lifecycle incomplete and uncorrelated", async () => {
    const result = await runNegativeMutation("N2_EVENT_REMOVED");
    expect(result.refused).toBe(true);
    expect(result.state).toBe(EVIDENCE_STATE.PROVENANCE_INCOMPLETE);
  }, 120_000);

  it("N3: a changed durable AttemptId is refused", async () => {
    const result = await runNegativeMutation("N3_ATTEMPT_ID_CHANGED");
    expect(result.refused).toBe(true);
    expect(result.state).toBe(EVIDENCE_STATE.PROVENANCE_CONFLICT);
    expect(result.problems.join(" ")).toContain("disagrees with the durable trial's AttemptId");
  }, 120_000);

  it("N4: a wrong Run Claim nonce is refused", async () => {
    const result = await runNegativeMutation("N4_WRONG_CLAIM_NONCE");
    expect(result.refused).toBe(true);
    expect(result.state).toBe(EVIDENCE_STATE.PROVENANCE_CONFLICT);
    expect(result.problems.join(" ")).toContain("run claim did not verify");
  }, 120_000);

  it("N5: a duplicate Trial for one session is refused", async () => {
    const result = await runNegativeMutation("N5_DUPLICATE_TRIAL");
    expect(result.refused).toBe(true);
    expect(result.state).toBe(EVIDENCE_STATE.PROVENANCE_CONFLICT);
    expect(result.problems.join(" ")).toContain("duplicate TRIAL_RECORDED");
  }, 120_000);

  it("N6: a record with a copied Origin Marker is not host origin", async () => {
    const result = await runNegativeMutation("N6_FORGED_ORIGIN_SUBSTITUTION");
    expect(result.refused).toBe(true);
    expect(result.state).toBe(EVIDENCE_STATE.ORIGIN_NOT_ESTABLISHED);
    expect(result.problems.join(" ")).toContain("not delivered through a live recorder handle");
  }, 120_000);
});
