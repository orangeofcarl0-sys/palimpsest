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

describe("R3-L0C-G1-B §3 — the five baseline defects are MEASURED, not asserted", () => {
  it("measures all five falsifiers against the unmodified G1 code", async () => {
    const measured = await runBaselineFalsifiers();
    expect(measured.controls).toHaveLength(5);
    expect(measured.measuredDefectIds).toEqual([
      "F1_TWO_INVOCATION_PRODUCERS",
      "F2_FALSE_DURABILITY_SUCCESS",
      "F3_WRONG_JOURNAL_SCHEMA",
      "F4_FORGED_ORIGIN_ACCEPTED",
      "F5_LOCATOR_CANONICAL_MISMATCH",
    ]);
    expect(measured.allDefectsMeasured).toBe(true);
    expect(measured.modelCallsMade).toBe(0);
  }, 120_000);

  it("F1: one port execution carried TWO different invocation identities", async () => {
    const measured = await runBaselineFalsifiers();
    const control = measured.controls.find((entry) => entry.id === "F1_TWO_INVOCATION_PRODUCERS");
    expect(control?.observed.anyPairMismatched).toBe(true);
    expect(control?.observed.entryAndObservationProducersDiffer).toBe(true);
    expect(control?.defectPresent).toBe(true);
  }, 120_000);

  it("F2: a zero-event record reported successful, verified durability", async () => {
    const measured = await runBaselineFalsifiers();
    const control = measured.controls.find((entry) => entry.id === "F2_FALSE_DURABILITY_SUCCESS");
    expect(control?.observed.inMemoryObservations).toBeGreaterThan(0);
    expect(control?.observed.recorderAcceptedCount).toBe(0);
    expect(control?.observed.durableEventCount).toBe(0);
    expect(control?.observed.written).toBe(true);
    expect(control?.observed.durabilityVerified).toBe(true);
    expect(control?.defectPresent).toBe(true);
  }, 120_000);

  it("F3: the G1 readers could not read a real, intact frozen journal", async () => {
    const measured = await runBaselineFalsifiers();
    const control = measured.controls.find((entry) => entry.id === "F3_WRONG_JOURNAL_SCHEMA");
    expect(control?.observed.realRecordFields).toEqual(["seq", "kind", "at", "payload", "digest"]);
    expect(control?.observed.journalIntact).toBe(true);
    expect(control?.observed.g1RunIdentityVerdict).toBe("MISSING_RUN_STARTED");
    expect(control?.observed.g1TrialMapSize).toBe(0);
    expect(control?.defectPresent).toBe(true);
  }, 120_000);

  it("F4: a forged origin marker with a recomputed digest and NO events was admitted", async () => {
    const measured = await runBaselineFalsifiers();
    const control = measured.controls.find((entry) => entry.id === "F4_FORGED_ORIGIN_ACCEPTED");
    expect(control?.observed.copiedOriginMarker).toBe("G1_LOCAL_RECORDER");
    expect(control?.observed.recomputedDigestValid).toBe(true);
    expect(control?.observed.eventCount).toBe(0);
    expect(control?.observed.correlatorState).toBe("RUN_ATTEMPT_CORRELATED");
    expect(control?.defectPresent).toBe(true);
  }, 120_000);

  it("F5: canonical AttemptId was rejected and an incomplete scan reported as absent", async () => {
    const measured = await runBaselineFalsifiers();
    const control = measured.controls.find((entry) => entry.id === "F5_LOCATOR_CANONICAL_MISMATCH");
    expect(control?.observed.bareHexDiscovered).toBe(true);
    expect(control?.observed.canonicalDiscovered).toBe(false);
    expect(control?.observed.deepCandidateReportsIncomplete).toBe(false);
    expect(control?.defectPresent).toBe(true);
  }, 120_000);
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
