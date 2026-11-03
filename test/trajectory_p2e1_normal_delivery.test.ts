/**
 * Trajectory-P2-E1 §11 Group E — NORMAL CONSUMER DELIVERY (C6).
 *
 * Proves, from the E1 gate's evidence and the product's own source, that A1's historical delivery comes from
 * the NORMAL product path rather than a hand-built context:
 *
 *   45. A1 comes from canonical Work;
 *   46. A0 comes from governed lineage;
 *   47. `workWorkerAttemptContext(A1)` is actually invoked;
 *   48. the actual Context Owner provider is invoked;
 *   49. actual Capsule admission occurs;
 *   50. a product-generated Presentation is used;
 *   51. the actual Worker Environment is constructed by the supported code;
 *   52. the historical Capsule body is withheld from the Child;
 *   53. the actual DSH Host receives the correct Section;
 *   54. official DSH Persistence contains the actual UserMessage;
 *   55. Capsule, Section and UserMessage digests reconcile;
 *   56. controlled Origin evidence is not mislabeled full first-party Work execution;
 *   57. no model-controlled Origin or Session selector widens authority.
 *
 * The heavy first-party cases read the gate's recorded evidence; the source-shape cases read the product
 * source. Neither runs a model.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REPO = process.cwd();
const readEvidence = (name: string): Record<string, unknown> => {
  const path = join(REPO, "research-evidence", "trajectory-p2e1", name);
  expect(existsSync(path)).toBe(true);
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
};
const readSrc = (relative: string): string => readFileSync(join(REPO, relative), "utf8");

describe("E1-B §11 Group E — normal Consumer delivery", () => {
  it("45/46/47/48. the consumer comes from canonical Work and the context from the REAL Context Owner", () => {
    const gate = readEvidence("normal-consumer-context.json");
    expect(gate.outcome).toBe("PASS");
    expect(gate.realCanonicalWorkRan).toBe(true);
    expect(gate.realGovernedReworkOccurred).toBe(true);
    expect(gate.realContextOwnerDelivery).toBe(true);
    expect(gate.contextOwnerInvoked).toBe(true);
    // The gate invokes the product's own compilation rather than building a context object.
    const source = readSrc("scripts/trajectory_p2e1/normal-consumer-gate.mjs");
    expect(source).toContain("workWorkerAttemptContext(a1)");
    // The CONSUMER context must come from the Context Owner: the gate must NOT construct a
    // `trajectoryCapsule` object by hand (the E0 defect F11).
    expect(source).not.toContain("trajectoryCapsule: {");
    expect(source).not.toContain("recordIdentity(Object.freeze({ hostLocalJobId: \"\", attemptId: a1");
  });

  it("49/50. actual Capsule admission and a PRODUCT-generated Presentation are used", () => {
    const gate = readEvidence("normal-consumer-context.json");
    expect(gate.admissionState).toBe("AUTHORIZED");
    expect(gate.admissionRefusalReason).toBe("NONE");
    expect(gate.contextCarriesTrajectoryCapsule).toBe(true);
    expect(gate.contextPresentationMode).toBe("TREATMENT");
    expect(gate.contextAssignedArm).toBe("TREATMENT");
    expect(gate.contextEligibility).toBe("QUALIFIED");
    expect(gate.contextDeliveryState).toBe("SECTION_RENDERED");
  });

  it("51/52. the actual Worker Environment is built by the product and withholds the raw Capsule body", () => {
    const gate = readEvidence("normal-consumer-context.json");
    expect(gate.realProductPayloadSerialization).toBe(true);
    expect(gate.payloadCarriesTrialRecord).toBe(true);
    expect(gate.payloadAssignedArm).toBe("TREATMENT");
    expect(gate.payloadCarriesRawCapsuleBody).toBe(false);
    expect(gate.payloadContextHasTrajectoryCapsule).toBe(true);
    expect(gate.payloadContextCapsuleBodyWithheld).toBe(true);
    // The product's own serializer is what the gate calls.
    expect(readSrc("scripts/trajectory_p2e1/normal-consumer-gate.mjs")).toContain("workWorkerEnvironmentPayload(context)");
  });

  it("53/54/55. the real DSH user/message carries the section and the digests reconcile", () => {
    const gate = readEvidence("normal-consumer-context.json");
    expect(gate.realFirstPartyDshHostRan).toBe(true);
    expect(gate.realDshUserMessageInspected).toBe(true);
    expect(gate.persistedMessageContainsSection).toBe(true);
    expect(gate.persistedSectionDigestMatchesProduct).toBe(true);
    expect(gate.capsuleConsumerMatchesCanonicalA1).toBe(true);
    expect(gate.workerOutcome).toBe("READY_FOR_SETTLEMENT");
    // The section digest is a real 64-hex digest, not a placeholder.
    expect(String(gate.contextSectionDigest)).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("56. the controlled Origin is NOT mislabeled as a first-party settled Work Result", () => {
    const gate = readEvidence("normal-consumer-context.json");
    expect(gate.originExecutionIsControlledFixture).toBe(true);
    expect(gate.realFirstPartyOriginWorkResult).toBe(false);
    expect(gate.originResultSettledThroughWork).toBe(false);
    expect(gate.firstPartyOriginWorkResult).toBe("NOT_ESTABLISHED");
    expect((gate.evidenceLevels as Record<string, string>).firstPartyOriginSettlement).toBe("NOT_ESTABLISHED");
    // The evidence level names the controlled origin explicitly.
    expect(gate.evidenceLevel).toBe("CONTROLLED_ORIGIN_NORMAL_CONSUMER_DELIVERY");
  });

  it("57. no model-controlled origin or session selector widens authority", () => {
    const source = readSrc("scripts/trajectory_p2e1/normal-consumer-gate.mjs");
    // The consumer id is A1 from canonical Work, and the admission takes only the consumer attempt id.
    expect(source).toContain("capsuleForConsumer({ consumerAttemptId: a1 })");
    expect(source).toContain("workWorkerAttemptContext(a1)");
    // The origin is NOT chosen by a caller-supplied selector anywhere.
    expect(source).not.toContain("requestedOriginAttemptId");
    // The Context Owner port itself accepts no model-supplied origin.
    const service = readSrc("src/context/service.ts");
    expect(service).toContain("trajectoryCapsuleFor?: TrajectoryCapsuleDeliveryProvider");
  });

  it("the gate ran no model, made no paid request and released its owned root", () => {
    const gate = readEvidence("normal-consumer-context.json");
    expect(gate.externalModelRequestOccurred).toBe(false);
    expect(gate.paidModelRequestOccurred).toBe(false);
    expect(gate.stochasticTrialOccurred).toBe(false);
    expect(gate.modelCallsMade).toBe(0);
    expect(gate.ownedRootRemoved).toBe(true);
    expect(gate.dependencyRootPreserved).toBe(true);
  });

  it("the fixture uses a REAL git commit as its basis, not a synthetic id", () => {
    const gate = readEvidence("normal-consumer-context.json");
    expect(gate.realGitHeadIsCommit).toBe(true);
    expect(String(gate.realGitHead)).toMatch(/^[0-9a-f]{40}$/u);
  });
});
