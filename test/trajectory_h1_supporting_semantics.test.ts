/**
 * Trajectory-H1 §9 (C5) — SUPPORTING EVIDENCE SEMANTICS.
 *
 * The lower-priority H1 work, kept strictly bounded:
 *
 *   §9.1  the relation selector's T0 TRUST BOUNDARY, made explicit and tested
 *   §9.2  quarantine PRECISION: stable edge identity and exact Attempt scope
 *   §9.3  host observation coverage kept separate from provenance
 *   §9.5  the projection failure taxonomy, with an unknown origin reported as unknown
 *
 * §9.4 (T0 `traceAttempt`) is deliberately NOT implemented: it requires new T0 domain structure and
 * is deferred to an independently reviewable T0 correctness slice. Its finding is recorded in
 * `test/trajectory_h1_falsifiers.test.ts` (F9) and in the evidence package.
 *
 * No model is invoked, no provider is contacted and no personal session is touched.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { makeOwnerReference, makeTrajectoryNode, type TrajectoryEdge, type TrajectoryProjection } from "../src/trajectory/index.js";
import { selectAttemptWorkRelations, type AttemptRelationContext } from "../src/trajectory/relation_admission.js";
import { buildHandoffPreview, type HandoffPreviewInput } from "../src/trajectory/handoff_preview.js";
import { classifyHostObservation } from "../src/trajectory/execution.js";

const PROJECT = "h1e";
const ATTEMPT_A = `attempt-${"a".repeat(32)}`;
const ATTEMPT_B = `attempt-${"b".repeat(32)}`;
const HEX = (seed: string): string => seed.repeat(64).slice(0, 64);

function source(relative: string): string {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

function workNode(canonicalId: string, sequence: number, label: string) {
  return makeTrajectoryNode({
    reference: makeOwnerReference({
      ownerPlane: "WORK", ownerScope: PROJECT, canonicalId, sourceSequence: sequence,
      sourceDigest: HEX(canonicalId.slice(-1)), projectId: PROJECT,
      verification: "VERIFIED_AGAINST_OWNER", verificationDetail: "fixture",
    }),
    authenticity: "OWNER_RECORDED", epistemicStatus: "RECORDED", currentness: "CURRENT", completeness: "COMPLETE", label,
  });
}

function projectionOf(nodes: readonly ReturnType<typeof workNode>[], edges: readonly TrajectoryEdge[]): TrajectoryProjection {
  return {
    schemaVersion: 1, rootId: "tr-fixture", projectId: PROJECT,
    basisVector: { completeness: "COMPLETE", work: { projectSequence: 3, eventDigest: HEX("9"), projectIrRevision: 0 }, reasoning: [], proof: null, journal: [], world: [], unavailable: [] } as never,
    nodes, edges, sourceCoverage: [], unresolved: [], conflicts: [], currentness: [], asOf: null,
    hostObservationAdmission: "NOT_APPLICABLE", semanticDigest: HEX("8"), readOnly: true,
  };
}

const CONTEXT: AttemptRelationContext = {
  projectId: PROJECT, attemptId: ATTEMPT_A,
  creationEventId: "20", authorizationEventId: "10", authorizationEnvelopeId: "env-a",
  terminalEventIds: ["30"], completedEventId: "30",
  canonicalEventIds: new Set(["10", "20", "30"]),
};

/* ================================================================== §9.1 */

describe("H1 §9.1 — the relation selector's T0 trust boundary", () => {
  it("the selector is a selector over a T0-validated projection, and the assumption is documented", () => {
    /**
     * SOURCE_DEMONSTRATED. The trust boundary is recorded IN THE MODULE so a future reader cannot
     * mistake this function for a standalone validator of arbitrary externally supplied projections.
     * The ruling explicitly permits this interpretation and asks that it be made explicit.
     */
    const code = source("src/trajectory/relation_admission.ts");
    // Whitespace-normalized, so the assertion survives line wrapping. The `*` comment prefix is
    // stripped as well, because a sentence spans several comment lines.
    const flat = code.replace(/\r?\n\s*\*?/gu, " ").replace(/\s+/gu, " ");
    expect(flat).toContain("SELECTOR OVER A T0-VALIDATED PROJECTION");
    expect(flat).toContain("NOT a standalone validator of arbitrary externally supplied");
    // It still enforces, on its own authority, the Attempt-scoped role requirement.
    expect(code).toContain('if (by.ownerPlane !== "WORK")');
    expect(code).toContain('if (by.canonicalId === null)');
    expect(code).toContain("if (by.projectId !== null && by.projectId !== context.projectId)");
    // And it does NOT become a second Work Relation Builder: no projection build, no edge synthesis.
    expect(code).not.toContain("await buildProjectTrajectory");
    expect(code).not.toContain("new TrajectoryEdge");
    expect(code).not.toContain("by.verification");
  });

  it("the composition path the selector actually runs on is the real T0 projection", () => {
    const composition = source("src/composition/trajectory_v0.ts");
    expect(composition).toContain("projection = await buildProjectTrajectory(inputs);");
    expect(composition).toContain("selectAttemptWorkRelations(projection, context)");
  });
});

/* ================================================================== §9.2 */

describe("H1 §9.2 — quarantine precision", () => {
  it("two DISTINCT rejected edges of one relation both remain visible with their own reasons", () => {
    /**
     * CONTROLLED_PROJECTION. Two ATTEMPT_PRODUCED_RESULT edges from this attempt's creation to two
     * DIFFERENT non-terminal destinations both fail their role check. Under H0's relation-name dedup
     * only the first survived; H1 keeps both because the key is the stable edge identity.
     */
    const created = workNode("20", 2, `ATTEMPT_CREATED ${ATTEMPT_A}`);
    const otherA = workNode("41", 4, `TASK_READY task-x`);
    const otherB = workNode("42", 5, `TASK_READY task-y`);
    const edgeTo = (to: ReturnType<typeof workNode>): TrajectoryEdge => ({
      schemaVersion: 1, relation: "ATTEMPT_PRODUCED_RESULT", fromNodeId: created.nodeId, toNodeId: to.nodeId,
      evidenceState: "ESTABLISHED_BY_OWNER_REFERENCE",
      evidence: { byReference: to.reference, carryingField: "TASK_READY.payload", compared: { attemptId: ATTEMPT_A } },
      detail: "not a terminal result event",
    });
    const result = selectAttemptWorkRelations(projectionOf([created, otherA, otherB], [edgeTo(otherA), edgeTo(otherB)]), CONTEXT);
    const quarantined = result.quarantined.filter((entry) => entry.relation === "ATTEMPT_PRODUCED_RESULT");
    // BOTH rejected edges are reported, each with its own stable edge identity.
    expect(quarantined.length).toBe(2);
    expect(new Set(quarantined.map((entry) => entry.edgeId)).size).toBe(2);
    for (const entry of quarantined) expect(entry.reason).toContain("not this attempt's terminal result event");
  });

  it("a shared authorization node does NOT make another Attempt's rejected relation this Attempt's fact", () => {
    /**
     * CONTROLLED_PROJECTION. Attempt B's TASK_AUTHORIZED_ATTEMPT edge touches the SHARED authorization
     * node and B's own creation. The shared node is inside A's broad scope set, but NOT inside A's own
     * identities, so the edge is not A's quarantined fact.
     */
    const auth = workNode("10", 1, "TASK_CREATED task-a");
    const aCreated = workNode("20", 2, `ATTEMPT_CREATED ${ATTEMPT_A}`);
    const bCreated = workNode("21", 3, `ATTEMPT_CREATED ${ATTEMPT_B}`);
    const edge = (to: ReturnType<typeof workNode>): TrajectoryEdge => ({
      schemaVersion: 1, relation: "TASK_AUTHORIZED_ATTEMPT", fromNodeId: auth.nodeId, toNodeId: to.nodeId,
      evidenceState: "ESTABLISHED_BY_OWNER_REFERENCE",
      evidence: { byReference: auth.reference, carryingField: "ATTEMPT_CREATED.payload.envelope_id", compared: { envelopeId: "env-a" } },
      detail: "authorized by TASK_CREATED at event_id 10",
    });
    const result = selectAttemptWorkRelations(projectionOf([auth, aCreated, bCreated], [edge(aCreated), edge(bCreated)]), CONTEXT);
    expect(result.selected.length).toBe(1);
    expect(result.quarantined.length).toBe(0);
  });

  it("a genuinely rejected edge OF THIS attempt is still reported", () => {
    // The scope narrowing must not silence this attempt's OWN failures.
    const created = workNode("20", 2, `ATTEMPT_CREATED ${ATTEMPT_A}`);
    const notTerminal = workNode("41", 4, "TASK_READY task-x");
    const edge: TrajectoryEdge = {
      schemaVersion: 1, relation: "ATTEMPT_PRODUCED_RESULT", fromNodeId: created.nodeId, toNodeId: notTerminal.nodeId,
      evidenceState: "ESTABLISHED_BY_OWNER_REFERENCE",
      evidence: { byReference: notTerminal.reference, carryingField: "TASK_READY.payload", compared: { attemptId: ATTEMPT_A } },
      detail: "not a terminal result event",
    };
    const result = selectAttemptWorkRelations(projectionOf([created, notTerminal], [edge]), CONTEXT);
    expect(result.quarantined.length).toBe(1);
    expect(result.quarantined[0]!.reason).toContain("not this attempt's terminal result event");
  });
});

/* ================================================================== §9.3 */

describe("H1 §9.3 — host observation coverage is separate from provenance", () => {
  const basePage = {
    schemaVersion: 1 as const, readState: "READ_OK" as const, sessionId: "s", header: null,
    sourceIdentity: "fixture", sourceEvidenceClass: "DSH_QUERY_PORT_FIXTURE" as const,
    throughSeq: null, knownEventCount: 0, inheritedEventCount: 0, requestedFromSeq: 0, requestedMaxEvents: 50,
    returnedCount: 0, pageBounded: true as const, diskIoBounded: false,
    durabilityProvenance: "PERSISTED_AND_SYNTHETIC_SEPARATED" as const, persistedEventCount: 0, syntheticRecoveryEventCount: 0,
    events: Object.freeze([]), knownParentSession: null, proves: Object.freeze([]), doesNotProve: Object.freeze([]),
    detail: "a fixture page",
  };

  function input(provenance: HandoffPreviewInput["binding"]["hostObservationProvenance"], coverage: "SPAWN_AND_EXIT" | "SPAWN_ONLY" | "EXIT_ONLY" | "NONE"): HandoffPreviewInput {
    return {
      projectId: PROJECT, attemptId: ATTEMPT_A,
      binding: {
        schemaVersion: 1 as const, projectId: PROJECT, attemptId: ATTEMPT_A, viewId: "tv-x",
        historicalWorkBasis: { basisDigest: null, capturedAtRevision: null, taskId: "t1" },
        hostLocalJobId: "job-1", portInvocationId: "inv-1",
        dshSessionId: null, claimedSessionId: null,
        hostObservationProvenance: provenance,
        sessionSource: "NONE" as const, sessionBindingStatus: "SESSION_UNBOUND" as const,
        sessionReadAdmission: "NOT_REQUESTED" as const, bindingEvidenceRefs: Object.freeze([]), detail: "x",
      },
      canonical: {
        attemptState: "COMPLETED", taskId: "t1", workState: null, envelopeId: "env-1", basisDigest: null, capturedAtRevision: null,
        authorizationDetail: "x", resultRefs: [], resultDetail: "x", verificationState: "NOT_RUN",
        promotionState: "NOT_PROMOTED", promotionId: null, reworkState: "NONE", reworkDetail: "x",
      },
      host: { hostLocalJobId: "job-1", portInvocationId: "inv-1", processLifecycle: "RUNNING", processDetail: "x", observedEventKinds: [], lifecycleCoverage: coverage, originLimitation: "x" },
      projectEvolution: { projectionRootId: null, projectionSemanticDigest: null, workSequence: null, workEventDigest: null, projectIrRevision: null, selectedRelations: [], quarantinedRelations: [], unresolvedReferences: [], currentnessCaveats: [], basisCompleteness: null, failureOrigin: null },
      sessionPage: basePage as never,
    };
  }

  it("provenance alone does not establish lifecycle coverage", () => {
    // A producer-established observation with a SPAWN only is PARTIAL.
    expect(buildHandoffPreview(input("LOCAL_PORT_OBSERVATION", "SPAWN_ONLY")).attribution.processObservation).toBe("PARTIAL");
    // The same provenance covering both phases is COMPLETE.
    expect(buildHandoffPreview(input("LOCAL_PORT_OBSERVATION", "SPAWN_AND_EXIT")).attribution.processObservation).toBe("COMPLETE");
    // A caller declaration is PARTIAL regardless of what it claims to have covered.
    expect(buildHandoffPreview(input("CALLER_DECLARATION", "SPAWN_AND_EXIT")).attribution.processObservation).toBe("PARTIAL");
    // No observation at all is NOT_OBSERVED.
    expect(buildHandoffPreview(input("NOT_OBSERVED", "NONE")).attribution.processObservation).toBe("NOT_OBSERVED");
    // A contradiction is CONFLICTING.
    expect(buildHandoffPreview(input("CONFLICTING_SOURCE", "SPAWN_AND_EXIT")).attribution.processObservation).toBe("CONFLICTING");
  });

  it("a caller's exited flag is not independent proof of exit — coverage follows the observed kinds", () => {
    const composition = source("src/composition/trajectory_v0.ts");
    // The coverage is derived from observed spawn/exit facts, and the code says so.
    expect(composition).toContain("const observedSpawn = kinds.includes(\"DIRECT_CHILD_SPAWN_OBSERVED\");");
    expect(composition).toContain("const observedExit = record.exited === true;");
    expect(composition).toContain('observedSpawn && observedExit ? "SPAWN_AND_EXIT"');
  });

  it("an IPC report is not proof of Work settlement", () => {
    // Work outcome is read from the canonical owner, not from any host observation.
    const composition = source("src/composition/trajectory_v0.ts");
    expect(composition).toContain("canonicalFactsOf({ events, attemptId: request.attemptId, record, basis, promotions, admitted })");
  });
});

/* ================================================================== §9.5 */

describe("H1 §9.5 — the projection failure taxonomy", () => {
  it("an unattributable projection failure is reported as UNKNOWN, never as an optional owner", () => {
    const composition = source("src/composition/trajectory_v0.ts");
    expect(composition).not.toContain("an optional cross-owner plane could not be projected");
    expect(composition).toContain('"UNKNOWN_SOURCE_STAGE" as const');
    expect(composition).toContain("NOT attributed to an optional owner");
    // A TrajectoryRefusal is still named as the canonical Work source failure.
    expect(composition).toContain('"CANONICAL_WORK_VALIDATION" as const');
    expect(composition).toContain("the CANONICAL WORK SOURCE failed T0 validation");
  });

  it("the failure origin travels structurally into the Preview", () => {
    const preview = source("src/trajectory/handoff_preview.ts");
    expect(preview).toContain("projectionFailureOrigin: input.projectEvolution.failureOrigin ?? null");
    expect(preview).toContain("readonly projectionFailureOrigin:");
  });

  it("the Preview reports the structured origin, not a caveat-text guess", () => {
    const build = (origin: "CANONICAL_WORK_VALIDATION" | "UNKNOWN_SOURCE_STAGE" | null): HandoffPreviewInput => ({
      projectId: PROJECT, attemptId: ATTEMPT_A,
      binding: {
        schemaVersion: 1 as const, projectId: PROJECT, attemptId: ATTEMPT_A, viewId: "tv-x",
        historicalWorkBasis: { basisDigest: null, capturedAtRevision: null, taskId: "t1" },
        hostLocalJobId: null, portInvocationId: null, dshSessionId: null, claimedSessionId: null,
        hostObservationProvenance: "NOT_OBSERVED" as const, sessionSource: "NONE" as const,
        sessionBindingStatus: "SESSION_UNBOUND" as const, sessionReadAdmission: "NOT_REQUESTED" as const,
        bindingEvidenceRefs: Object.freeze([]), detail: "x",
      },
      canonical: {
        attemptState: "COMPLETED", taskId: "t1", workState: null, envelopeId: "env-1", basisDigest: null, capturedAtRevision: null,
        authorizationDetail: "x", resultRefs: [], resultDetail: "x", verificationState: "NOT_RUN",
        promotionState: "NOT_PROMOTED", promotionId: null, reworkState: "NONE", reworkDetail: "x",
      },
      host: { hostLocalJobId: null, portInvocationId: null, processLifecycle: "NOT_OBSERVED", processDetail: "x", observedEventKinds: [], lifecycleCoverage: "NONE" as const, originLimitation: "x" },
      projectEvolution: {
        projectionRootId: null, projectionSemanticDigest: null, workSequence: null, workEventDigest: null, projectIrRevision: null,
        selectedRelations: [], quarantinedRelations: [], unresolvedReferences: [], currentnessCaveats: [], basisCompleteness: null, failureOrigin: origin,
      },
    });
    expect(buildHandoffPreview(build("CANONICAL_WORK_VALIDATION")).projectContext.projectionFailureOrigin).toBe("CANONICAL_WORK_VALIDATION");
    expect(buildHandoffPreview(build("UNKNOWN_SOURCE_STAGE")).projectContext.projectionFailureOrigin).toBe("UNKNOWN_SOURCE_STAGE");
    // A successful projection reports no failure origin.
    expect(buildHandoffPreview(build(null)).projectContext.projectionFailureOrigin).toBeNull();
  });
});
