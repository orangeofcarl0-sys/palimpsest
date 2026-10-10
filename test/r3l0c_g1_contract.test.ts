/**
 * R3-L0C-G1 §3/§12 C1 — THE SOURCE-GROUNDED CONTRACT AND THE MEASURED PRODUCER GAPS.
 *
 * §12 C1: "Record the source-level producer gaps and the exact observer guarantees. Commit the failing or
 * absence-demonstrating controls before implementation." This file asserts the contract as data and asserts
 * that each declared gap is MEASURED against the real baseline source — so C2 has a fixed reference to flip.
 *
 * Every control is read-only over source text or runs the real parser. No model, provider or remote service.
 */
import { describe, expect, it } from "vitest";

import {
  BASELINE_COMMIT,
  CLOSURE_CONSEQUENCE,
  CORRELATION_CHAIN,
  EVIDENCE_STATES,
  FINAL_VERDICTS,
  LOCAL_EVIDENCE_CLASS,
  OBSERVATION_DOES_NOT_PROVE,
  OBSERVATION_EVENT_KINDS,
  OBSERVATION_PROVES,
  PRODUCER_GAPS,
  PRODUCER_HIERARCHY,
  PROHIBITIONS,
  STUB_BOUNDARY,
  UNEARNED_VERDICTS,
  VERDICT_STATES,
  contractSummary,
} from "../scripts/r3l0c_g1/contract.mjs";
import { runAbsenceControls } from "../scripts/r3l0c_g1/baseline/absence-controls.mjs";

describe("R3-L0C-G1 §0/§1 — the contract binds the exact baseline and the additive claim", () => {
  it("binds the exact G1 baseline", () => {
    expect(BASELINE_COMMIT).toBe("fe18441de2ac40921ac4dcabe112a7670363b24a");
  });

  it("declares no canonical owner, no evidence store and no scheduler", () => {
    const summary = contractSummary();
    expect(summary.addsCanonicalOwner).toBe(false);
    expect(summary.addsEvidenceStore).toBe(false);
    expect(summary.addsScheduler).toBe(false);
  });

  it("names exactly one canonical owner per canonical fact", () => {
    const canonical = PRODUCER_HIERARCHY.filter((row) => row.canonical === true);
    expect(canonical.map((row) => row.fact)).toEqual([
      "Work AttemptId",
      "Prepared execution world path",
      "Attempt terminal state / settlement",
    ]);
    // §G1-I1: G1 owns NONE of them.
    expect(PRODUCER_HIERARCHY.every((row) => row.g1Owns === false)).toBe(true);
  });

  it("records the Host-local JobId as noncanonical and nondurable", () => {
    const job = PRODUCER_HIERARCHY.find((row) => row.fact === "Host-local JobId");
    expect(job?.canonical).toBe(false);
    expect(job?.durable).toBe(false);
  });
});

describe("R3-L0C-G1 §3 — the producer gaps are measured, not asserted", () => {
  it("measures all five declared gaps against the unmodified baseline source", async () => {
    const measured = await runAbsenceControls();
    expect(measured.controls).toHaveLength(PRODUCER_GAPS.length);
    expect(measured.measuredGapIds).toEqual(["GAP-1", "GAP-2", "GAP-3", "GAP-4", "GAP-5"]);
    expect(measured.allDeclaredGapsMeasured).toBe(true);
    expect(measured.modelCallsMade).toBe(0);
  });

  it("GAP-1: the port spawns a child but its outcome carries no process identity", async () => {
    const measured = await runAbsenceControls();
    const control = measured.controls.find((entry) => entry.id === "GAP-1");
    expect(control?.observed.portCallsSpawn).toBe(true);
    expect(control?.observed.outcomeTypeMentionsPid).toBe(false);
    expect(control?.gapPresent).toBe(true);
  });

  it("GAP-4: the two real parsers disagree on the same real path", async () => {
    const measured = await runAbsenceControls();
    const control = measured.controls.find((entry) => entry.id === "GAP-4");
    expect(control?.observed.segmentAnchoredResult).toBeNull();
    expect(control?.observed.substringResult).toBe("a07384dd03aa9f5c4597b61e8f929771");
    expect(control?.observed.disagree).toBe(true);
  });

  it("GAP-5: the frozen journal carries no runId", async () => {
    const measured = await runAbsenceControls();
    const control = measured.controls.find((entry) => entry.id === "GAP-5");
    expect(control?.observed.journalCarriesAttemptId).toBe(true);
    expect(control?.observed.journalCarriesRunId).toBe(false);
    expect(control?.gapPresent).toBe(true);
  });
});

describe("R3-L0C-G1 §4/§6/§8 — the guarantees the observer must hold", () => {
  it("names only events the host can actually observe", () => {
    expect(OBSERVATION_EVENT_KINDS).toEqual([
      "DIRECT_CHILD_SPAWN_ATTEMPTED",
      "DIRECT_CHILD_SPAWN_OBSERVED",
      "DIRECT_CHILD_SPAWN_ERROR",
      "DIRECT_CHILD_EXIT_OBSERVED",
      "DIRECT_CHILD_EXIT_UNCONFIRMED",
      "DIRECT_CHILD_TIMEOUT_REQUESTED",
      "DIRECT_CHILD_ABORT_REQUESTED",
    ]);
  });

  it("states what a direct-child observation does NOT prove", () => {
    expect(OBSERVATION_DOES_NOT_PROVE).toContain("that a downstream wrapper spawned the genuine DSH binary");
    expect(OBSERVATION_DOES_NOT_PROVE).toContain("that the provider/model route actually executed");
    expect(OBSERVATION_DOES_NOT_PROVE).toContain("that the Work Attempt was canonically completed");
    expect(OBSERVATION_PROVES).toHaveLength(2);
  });

  it("keeps the trust-boundary states separate", () => {
    expect(EVIDENCE_STATES).toEqual([
      "DECLARATION_ONLY",
      "LOCAL_HOST_OBSERVED",
      "RUN_ATTEMPT_CORRELATED",
      "PROVENANCE_INCOMPLETE",
      "PROVENANCE_CONFLICT",
      "LIVE_PRIMARY_NOT_ESTABLISHED",
    ]);
  });

  it("binds the correlation chain to its real producers", () => {
    expect(CORRELATION_CHAIN.map((step) => step.step)).toEqual([
      "RUN_STARTED",
      "VALIDATED_RUN_CLAIM",
      "FROZEN_SCHEDULED_SESSION",
      "DURABLE_TRIAL_ATTEMPT_IDENTITY",
      "HOST_LOCAL_JOB_ASSOCIATION",
      "HOST_PRIVATE_PORT_INVOCATION",
      "OBSERVED_DIRECT_CHILD_LIFECYCLE",
    ]);
  });

  it("never promotes an unearned verdict", () => {
    expect(UNEARNED_VERDICTS).toEqual([
      "REAL_DSH_ARTIFACT_COMPATIBILITY",
      "REAL_DSH_WORKER_PROCESS_ATTESTED",
      "ACTUAL_ROUTE_ATTESTED",
      "LIVE_PRIMARY_PROVENANCE",
      "EXTERNAL_AUTHORITY",
      "HOST_SPEND_ENFORCEMENT",
    ]);
    expect(FINAL_VERDICTS).toHaveLength(22);
    expect(VERDICT_STATES).toContain("NOT_ESTABLISHED");
  });

  it("labels the local producer at its own limited evidence class", () => {
    expect(LOCAL_EVIDENCE_CLASS.PASS).toBe("PASS_LOCAL_NONMODEL");
    expect(LOCAL_EVIDENCE_CLASS.doesNotProve).toContain("genuine DSH worker");
  });

  it("states the non-model stub boundary and the closure consequence", () => {
    expect(STUB_BOUNDARY.modelCallsMade).toBe(0);
    expect(STUB_BOUNDARY.forbidden).toContain("@deepseek-ai/dsh");
    expect(CLOSURE_CONSEQUENCE.CURRENT_G1_EXECUTION_CLOSURE).toBe("NEW_CODE_STATE");
    expect(CLOSURE_CONSEQUENCE.G1_PRIMARY_PLAN_FROZEN).toBe(false);
  });

  it("records the prohibitions as data", () => {
    expect(PROHIBITIONS).toContain("launch a genuine DSH model worker");
    expect(PROHIBITIONS).toContain("manufacture a trusted execution witness");
    expect(PROHIBITIONS).toContain("merge into main");
  });
});
