/**
 * R3-L0C-G1-B §3/§11 C1 — THE MEASURED BASELINE FALSIFIERS AND THE CORRECTIVE CONTRACT.
 *
 * §11 C1 requires the measured F1–F5 controls and the corrective contract to be committed BEFORE any fix. Each
 * assertion here describes the OLD behaviour of the unmodified G1 code, so C2..C4 can flip it and the difference
 * is the correction. No model, provider or remote service is involved.
 */
import { describe, expect, it } from "vitest";

import {
  BASELINE_COMMIT,
  CANONICAL_ATTEMPT,
  COMPLETE_LIFECYCLE_REQUIREMENTS,
  CORRECTIONS,
  EVIDENCE_STATES,
  FINAL_VERDICTS,
  G1_COMMITS,
  INVOCATION_IDENTITY_OWNER,
  INVOCATION_INVARIANTS,
  JOURNAL_RECORD_SHAPE,
  JOURNAL_VERIFICATION_REQUIREMENTS,
  LIFECYCLE_ORDER,
  LOCAL_TRUST_MODEL,
  LOCATOR_OUTCOMES,
  ORIGIN_LAYERS,
  PROHIBITIONS,
  UNEARNED_VERDICTS,
  VERDICT_STATES,
  contractSummary,
} from "../scripts/r3l0c_g1b/contract.mjs";
import { runBaselineFalsifiers } from "../scripts/r3l0c_g1b/baseline/falsifiers.mjs";

describe("R3-L0C-G1-B §0/§1 — the corrective contract binds the exact baseline", () => {
  it("binds the exact G1-B baseline and the five G1 commits", () => {
    expect(BASELINE_COMMIT).toBe("43ca525599031d431796cb37d0c182d265597d84");
    expect(G1_COMMITS).toHaveLength(5);
    expect(G1_COMMITS[4]).toBe(BASELINE_COMMIT);
  });

  it("declares the five corrections, each with a measured baseline defect", () => {
    expect(CORRECTIONS.map((entry) => entry.id)).toEqual(["B1", "B2", "B3", "B4", "B5"]);
    expect(CORRECTIONS.every((entry) => entry.baselineDefect.length > 0)).toBe(true);
  });

  it("adds no canonical owner, evidence store, scheduler or pipeline", () => {
    const summary = contractSummary();
    expect(summary.addsCanonicalOwner).toBe(false);
    expect(summary.addsEvidenceStore).toBe(false);
    expect(summary.addsScheduler).toBe(false);
    expect(summary.addsPipeline).toBe(false);
  });

  it("names the Deployment Port as the sole InvocationId producer", () => {
    expect(INVOCATION_IDENTITY_OWNER.producer).toBe("DeploymentPort");
    expect(INVOCATION_IDENTITY_OWNER.notProducedBy).toEqual(["WorkOwner", "WorkDelegation"]);
    expect(INVOCATION_INVARIANTS).toContain("entry.invocationId === entry.observation.invocationId for every correlated event");
  });
});

describe("R3-L0C-G1-B §3/§11 — the baseline falsifiers, and that C2..C4 CLOSED each one", () => {
  /**
   * §11 C1 committed these controls while the defects were PRESENT. After the corrections they report
   * `defectPresent: false`, which is the measurement of the fix. The BASELINE values each control recorded are
   * preserved in `baselineDefect` on the contract and in `research-evidence/r3-l0c-g1b/baseline-defects.json`,
   * so the correction is a measured difference rather than an assertion.
   */
  it("re-measures all five controls; B1..B4 are CLOSED and F5 is C4's remaining work", async () => {
    const measured = await runBaselineFalsifiers();
    expect(measured.controls).toHaveLength(5);
    /**
     * §11 sequences the locator correction into C4, so at the C2/C3 boundary exactly ONE defect remains open.
     * The C4 commit updates this to `[]`.
     */
    expect(measured.measuredDefectIds).toEqual(["F5_LOCATOR_CANONICAL_MISMATCH"]);
    expect(measured.allDefectsMeasured).toBe(false);
    expect(measured.modelCallsMade).toBe(0);
    // The baseline observation each control captured is still carried, so the before/after is auditable.
    for (const control of measured.controls) {
      expect(control.observed).toBeTruthy();
      expect(control.classification).toBe("OBSERVED_BASELINE_FAILURE");
    }
  }, 180_000);

  it("F1 CLOSED: one port execution now carries ONE invocation identity", async () => {
    const measured = await runBaselineFalsifiers();
    const control = measured.controls.find((entry) => entry.id === "F1_TWO_INVOCATION_PRODUCERS");
    expect(control?.defectPresent).toBe(false);
    expect(control?.observed.anyPairMismatched).toBe(false);
    expect(control?.observed.entryAndObservationProducersDiffer).toBe(false);
  }, 180_000);

  it("F2 CLOSED: the real events are accepted, and a zero-event record is no longer the positive case", async () => {
    const measured = await runBaselineFalsifiers();
    const control = measured.controls.find((entry) => entry.id === "F2_FALSE_DURABILITY_SUCCESS");
    expect(control?.defectPresent).toBe(false);
    expect(control?.observed.inMemoryObservations).toBeGreaterThan(0);
    expect(control?.observed.recorderAcceptedCount).toBeGreaterThan(0);
    expect(control?.observed.durableEventCount).toBeGreaterThan(0);
    expect(control?.observed.durableEventCount).toBe(control?.observed.recorderAcceptedCount);
    expect(control?.observed.readBackEventCount).toBe(control?.observed.durableEventCount);
  }, 180_000);

  it("F3 CLOSED: the correlator reads the real frozen journal schema", async () => {
    const measured = await runBaselineFalsifiers();
    const control = measured.controls.find((entry) => entry.id === "F3_WRONG_JOURNAL_SCHEMA");
    expect(control?.defectPresent).toBe(false);
    expect(control?.observed.realRecordFields).toEqual(["seq", "kind", "at", "payload", "digest"]);
    expect(control?.observed.g1RunIdentityVerdict).toBe("SINGLE_RUN_IDENTITY");
    expect(control?.observed.g1RunIdentityRunId).toBe("run-f3");
    expect(control?.observed.g1TrialMapSize).toBe(1);
  }, 180_000);

  it("F4 CLOSED: a forged origin marker with no events is REFUSED", async () => {
    const measured = await runBaselineFalsifiers();
    const control = measured.controls.find((entry) => entry.id === "F4_FORGED_ORIGIN_ACCEPTED");
    expect(control?.defectPresent).toBe(false);
    expect(control?.observed.copiedOriginMarker).toBe("G1_LOCAL_RECORDER");
    expect(control?.observed.recomputedDigestValid).toBe(true);
    expect(control?.observed.correlatorCorrelated).toBe(false);
    expect(control?.observed.correlatorState).not.toBe("RUN_ATTEMPT_CORRELATED");
  }, 180_000);

  it("F5 STILL OPEN at C1..C3: the locator correction is C4's work", async () => {
    const measured = await runBaselineFalsifiers();
    const control = measured.controls.find((entry) => entry.id === "F5_LOCATOR_CANONICAL_MISMATCH");
    /**
     * §11 sequences the locator correction into C4. Until it lands this control stays PRESENT — asserted here so
     * the C1..C3 state is honest rather than silently green.
     */
    expect(control?.defectPresent).toBe(true);
  }, 180_000);
});

describe("R3-L0C-G1-B §5/§6/§7/§8 — the corrected guarantees, declared", () => {
  it("declares the complete local lifecycle and its requirements", () => {
    expect(LIFECYCLE_ORDER).toEqual([
      "DIRECT_CHILD_SPAWN_ATTEMPTED",
      "DIRECT_CHILD_SPAWN_OBSERVED",
      "DIRECT_CHILD_EXIT_OBSERVED",
    ]);
    expect(COMPLETE_LIFECYCLE_REQUIREMENTS).toContain("no contradictory SPAWN_ERROR");
    expect(COMPLETE_LIFECYCLE_REQUIREMENTS).toContain("an actually observed exit code");
  });

  it("binds the real frozen journal record shape", () => {
    expect(JOURNAL_RECORD_SHAPE.fields).toEqual(["seq", "kind", "at", "payload", "digest"]);
    expect(JOURNAL_RECORD_SHAPE.runIdPath).toBe("payload.runId");
    expect(JOURNAL_RECORD_SHAPE.trialAttemptPath).toBe("payload.record.attemptId");
    expect(JOURNAL_VERIFICATION_REQUIREMENTS).toContain("JOURNAL_INTACT === true");
    expect(JOURNAL_VERIFICATION_REQUIREMENTS).toContain("the claim nonce matches the independently held claim witness");
  });

  it("separates the three origin trust layers", () => {
    expect(ORIGIN_LAYERS.map((entry) => entry.layer)).toEqual([
      "UNTRUSTED_RECORD_INSPECTION",
      "TRUSTED_LOCAL_RECORDER_INGESTION",
      "VERIFIED_LOCAL_PERSISTENT_READBACK",
    ]);
    expect(ORIGIN_LAYERS[0]?.mayPromote).toBe(false);
    expect(EVIDENCE_STATES).toContain("ORIGIN_NOT_ESTABLISHED");
  });

  it("declares the canonical AttemptId grammar and the incomplete-discovery outcome", () => {
    expect(CANONICAL_ATTEMPT.prefix).toBe("attempt-");
    expect(CANONICAL_ATTEMPT.hexLength).toBe(32);
    expect(LOCATOR_OUTCOMES.DISCOVERY_INCOMPLETE).toBe("DISCOVERY_INCOMPLETE");
  });

  it("states the local trust model limitation", () => {
    expect(LOCAL_TRUST_MODEL.independentAuthentication).toBe("INDEPENDENT_HOST_ORIGIN_AUTHENTICATION = NOT_ESTABLISHED");
    expect(LOCAL_TRUST_MODEL.selfSignedCredentialCreated).toBe(false);
  });

  it("never promotes an unearned verdict and keeps the verdict vocabulary qualified", () => {
    expect(UNEARNED_VERDICTS).toContain("INDEPENDENT_HOST_ORIGIN_AUTHENTICATION");
    expect(UNEARNED_VERDICTS).toContain("LIVE_PRIMARY_PROVENANCE");
    expect(FINAL_VERDICTS).toHaveLength(30);
    expect(VERDICT_STATES).toContain("PASS_LOCAL_NONMODEL");
    expect(VERDICT_STATES).toContain("PASS_REAL_JOURNAL_FORMAT_FIXTURE");
  });

  it("records the prohibitions as data", () => {
    expect(PROHIBITIONS).toContain("launch the real DSH worker");
    expect(PROHIBITIONS).toContain("introduce a general-purpose TrajectoryStore, EvidenceStore or new Canonical Owner");
    expect(PROHIBITIONS).toContain("merge into main");
  });
});
