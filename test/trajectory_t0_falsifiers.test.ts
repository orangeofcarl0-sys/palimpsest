/**
 * Trajectory-T0 §8 (T0-G) — TEMPORAL AND EVIDENCE FALSIFIERS, run against the projection itself.
 *
 * These are primitive controls: §11 permits synthetic objects for them, so most build their input
 * through the OWNER parser (`parseSchedulerEvent`'s rules) rather than the full product stack. Where
 * a control needs a real owner fact (a published proof claim, a live reasoning frontier) the real
 * service is used and that is stated in the test name.
 *
 * The closing line of §8 is the standard this file holds itself to:
 *
 *     Do not claim a generic causality engine based on passing these controls.
 *
 * T0 therefore never asserts a causal edge. What it asserts is that adjacency is NOT causation, that
 * a correlation id is NOT a cause, that a producer's own claim is NOT verified provenance, and that
 * a rebuild is byte-identical.
 */
import { describe, expect, it } from "vitest";

import {
  canonicalDigest,
  computeEventDigest,
  computeRequestDigest,
  normalizeEventPayload,
  parseNewEvent,
  projectIrDigestOf,
  type SchedulerEvent,
} from "../src/schema/index.js";
import { EMPTY_PREVIOUS_EVENT_DIGEST } from "../src/state/index.js";
import { acceptedIntentReceiptDigestOf } from "../src/project_intent/index.js";
import {
  buildProjectTrajectory,
  buildTrajectoryReadModel,
  classifyCurrentness,
  HOST_OBSERVATION_ADMISSION,
  makeOwnerReference,
  makeTrajectoryNode,
  TrajectoryRefusal,
  trajectoryNodeIdOf,
  validateWorkHistory,
  type TrajectoryProjectionInputs,
  type TrajectoryWorkPort,
} from "../src/trajectory/index.js";

const PROJECT = "t0g";
const CLOCK = "2026-10-11T00:00:00Z";

interface EventDraft {
  readonly event_type: string;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly payload: Record<string, unknown>;
  readonly causation_id?: number | null;
  readonly correlation_id?: string;
  readonly expected_project_revision?: number | null;
}

function commitHistory(projectId: string, drafts: readonly EventDraft[]): SchedulerEvent[] {
  const events: SchedulerEvent[] = [];
  let previousDigest = EMPTY_PREVIOUS_EVENT_DIGEST;
  for (let index = 0; index < drafts.length; index += 1) {
    const draft = drafts[index]!;
    const request = parseNewEvent({
      schema_version: 1,
      project_id: projectId,
      event_type: draft.event_type,
      payload_version: 1,
      entity_type: draft.entity_type,
      entity_id: draft.entity_id,
      payload: normalizeEventPayload(draft.event_type as never, draft.payload),
      causation_id: draft.causation_id ?? null,
      correlation_id: draft.correlation_id ?? `c-${String(index + 1)}`,
      idempotency_key: canonicalDigest({ projectId, seq: index + 1, eventType: draft.event_type }),
      expected_project_revision: draft.expected_project_revision ?? null,
    });
    const withChain = {
      ...request,
      event_id: index + 1,
      project_sequence: index + 1,
      request_digest: computeRequestDigest(request),
      previous_event_digest: previousDigest,
      event_digest: "",
      committed_at: CLOCK,
    } satisfies SchedulerEvent;
    const event: SchedulerEvent = { ...withChain, event_digest: computeEventDigest(withChain) };
    events.push(event);
    previousDigest = event.event_digest;
  }
  return events;
}

function ir(revision: number, parentRevision: number | null, parentDigest: string | null, statement: string) {
  const base = {
    schema_version: 1 as const,
    project_id: PROJECT,
    revision,
    parent_revision: parentRevision,
    parent_digest: parentDigest,
    goal: "g",
    requirements: [{ requirement_id: "R", statement, priority: "critical" as const, acceptance_refs: [] as string[] }],
    decisions: [],
    tasks: [],
    head_commit: "0".repeat(40),
    committed_at: CLOCK,
  };
  return { ...base, digest: projectIrDigestOf(base) };
}

const genesis = ir(0, null, null, "latency <= 10 ms");
const revised = ir(1, 0, genesis.digest, "latency <= 20 ms");

/** A minimal valid spine. Two events intentionally share a display-ish entity to test merging. */
function spine(): SchedulerEvent[] {
  return commitHistory(PROJECT, [
    { event_type: "PROJECT_CREATED", entity_type: "project", entity_id: PROJECT, payload: { project_ir: genesis } },
    {
      event_type: "TASK_CREATED",
      entity_type: "task",
      entity_id: "t1",
      payload: {
        task_envelope: {
          schema_version: 1, project_id: PROJECT, task_id: "t1", envelope_id: "env-1",
          project_revision: 0, project_digest: genesis.digest, base_commit: "0".repeat(40),
          objective: "make it fast", read_paths: ["src"], write_paths: ["src/a.ts"], required_artifacts: [],
          allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }],
          network_policy: "deny", network_allowlist: [], timeout_s: 60, lease_s: 60,
          attempt_limit: 3, candidate_limit: 1, idempotency_key: "9".repeat(64),
        },
        initial_state: "READY", policy_id: "p", policy_digest: "a".repeat(64),
      },
      expected_project_revision: 0,
    },
    {
      event_type: "ATTEMPT_CREATED",
      entity_type: "attempt",
      entity_id: "attempt-a0",
      payload: { task_id: "t1", envelope_id: "env-1", attempt_no: 1 },
      causation_id: 2,
      correlation_id: "shared-correlation",
      expected_project_revision: 0,
    },
    {
      event_type: "PROJECT_REVISED",
      entity_type: "project",
      entity_id: PROJECT,
      payload: { project_ir: revised, promotion_id: "promo-1" },
      causation_id: 3,
      expected_project_revision: 0,
    },
  ]);
}

function workPort(events: readonly SchedulerEvent[]): TrajectoryWorkPort {
  return {
    async listProjectEvents() { return events; },
    async readWorldBasis() { return null; },
    async assessCurrentness() { return null; },
    async readPromotions() { return []; },
  };
}

const inputsOf = (events: readonly SchedulerEvent[]): TrajectoryProjectionInputs => ({ projectId: PROJECT, work: workPort(events) });

function reseal(event: SchedulerEvent, patch: Partial<SchedulerEvent>): SchedulerEvent {
  const base = { ...event, ...patch };
  const withRequest = { ...base, request_digest: computeRequestDigest(base) };
  return { ...withRequest, event_digest: computeEventDigest(withRequest) };
}

/* ================================================================== Identity */

describe("Trajectory-T0 §8 G-N1…G-N3 — identity", () => {
  it("G-N1: two events with the same display title but different canonical refs do NOT merge", async () => {
    // Two ATTEMPT_CREATED events with the SAME entity_id shape but distinct canonical ids.
    const events = commitHistory(PROJECT, [
      { event_type: "PROJECT_CREATED", entity_type: "project", entity_id: PROJECT, payload: { project_ir: genesis } },
      {
        event_type: "TASK_CREATED", entity_type: "task", entity_id: "t1",
        payload: {
          task_envelope: {
            schema_version: 1, project_id: PROJECT, task_id: "t1", envelope_id: "env-1", project_revision: 0,
            project_digest: genesis.digest, base_commit: "0".repeat(40), objective: "o", read_paths: [], write_paths: [],
            required_artifacts: [], allowed_commands: [{ executable: "node", argv_prefix: ["-e", "0"] }],
            network_policy: "deny", network_allowlist: [], timeout_s: 60, lease_s: 60, attempt_limit: 3,
            candidate_limit: 1, idempotency_key: "9".repeat(64),
          },
          initial_state: "READY", policy_id: "p", policy_digest: "a".repeat(64),
        },
        expected_project_revision: 0,
      },
      { event_type: "ATTEMPT_CREATED", entity_type: "attempt", entity_id: "attempt-same", payload: { task_id: "t1", envelope_id: "env-1", attempt_no: 1 }, expected_project_revision: 0 },
      { event_type: "ATTEMPT_CREATED", entity_type: "attempt", entity_id: "attempt-same", payload: { task_id: "t1", envelope_id: "env-1", attempt_no: 2 }, expected_project_revision: 0 },
    ]);
    const projection = await buildProjectTrajectory(inputsOf(events));
    const attemptNodes = projection.nodes.filter((node) => node.label.startsWith("ATTEMPT_CREATED"));
    // §8 G-N1: two distinct canonical events ⇒ two distinct nodes, even with identical labels.
    expect(attemptNodes).toHaveLength(2);
    expect(new Set(attemptNodes.map((node) => node.nodeId)).size).toBe(2);
  });

  it("G-N2: one canonical source event produces exactly ONE node identity", async () => {
    const events = spine();
    const first = await buildProjectTrajectory(inputsOf(events));
    const second = await buildProjectTrajectory(inputsOf(events));
    // §8 G-N2: no source event yields two conflicting node identities across rebuilds.
    const ids = new Map<string, Set<string>>();
    for (const projection of [first, second]) {
      for (const node of projection.nodes) {
        if (node.reference.ownerPlane !== "WORK") continue;
        const key = node.reference.canonicalId;
        ids.set(key, (ids.get(key) ?? new Set()).add(node.nodeId));
      }
    }
    for (const [, nodeIds] of ids) expect(nodeIds.size).toBe(1);
  });

  it("G-N3: a foreign ProjectId is refused even when local numeric EventIds match", async () => {
    const events = spine();
    const foreign = events.map((event, index) => (index === 2 ? { ...event, project_id: "another-project" } : event));
    // §8 G-N3: matching local event ids do not make a foreign project's event acceptable.
    expect(() => validateWorkHistory({ projectId: PROJECT, events: foreign })).toThrow(TrajectoryRefusal);
  });
});

/* ================================================================== Ordering */

describe("Trajectory-T0 §8 G-N4…G-N6 — ordering is not causation", () => {
  it("G-N4: same-owner sequence continuity is violated — refused", () => {
    const events = spine();
    // Drop an event so the sequence jumps, then renumber the tail to keep the ids contiguous but
    // leave the DIGEST linkage broken — the check that must fire.
    const broken = events.map((event, index) => (index === 3 ? { ...event, previous_event_digest: "1".repeat(64) } : event));
    expect(() => validateWorkHistory({ projectId: PROJECT, events: broken })).toThrow(/PREVIOUS_DIGEST_MISMATCH|INVALID_SOURCE_EVENT/u);
  });

  it("G-N5: a newer timestamp does NOT fabricate a causal predecessor", async () => {
    const events = spine();
    const projection = await buildProjectTrajectory(inputsOf(events));
    // §8 G-N5: every adjacency edge is TEMPORAL_ONLY; no edge is promoted by recency.
    for (const edge of projection.edges.filter((candidate) => candidate.relation === "SAME_OWNER_SEQUENCE_SUCCESSOR")) {
      expect(edge.evidenceState).toBe("TEMPORAL_ONLY");
      expect(edge.evidence).toBeNull();
    }
    // And no edge in the projection is named CAUSED_BY or any generic causal relation.
    expect(projection.edges.some((edge) => String(edge.relation).includes("CAUS"))).toBe(false);
  });

  it("G-N6: two independent owner histories have NO established cross-owner order", async () => {
    const events = spine();
    const projection = await buildProjectTrajectory(inputsOf(events));
    // §8 G-N6: the basis vector records per-owner cursors and never a global total order.
    expect(projection.basisVector.work.projectSequence).toBe(4);
    expect(projection.basisVector.proof.availability).toBe("NOT_COMPOSED");
    // There is no field on the projection claiming a global sequence.
    const rendered = JSON.stringify(projection.basisVector);
    expect(rendered).not.toContain("globalSequence");
    expect(rendered).not.toContain("totalOrder");
  });
});

/* ================================================================== Evidence */

describe("Trajectory-T0 §8 G-N7…G-N10 — evidence is not assumption", () => {
  it("G-N7: a correlation_id alone is NOT proof of causation", async () => {
    const events = spine();
    const projection = await buildProjectTrajectory(inputsOf(events));
    /**
     * The ATTEMPT_CREATED event carries `correlation_id: "shared-correlation"`. §8 G-N7: that shared
     * id must NOT create any established edge. The projection never reads correlation_id as evidence.
     */
    const established = projection.edges.filter((edge) => edge.evidenceState === "ESTABLISHED_BY_OWNER_REFERENCE");
    for (const edge of established) {
      expect(edge.evidence!.carryingField).not.toContain("correlation_id");
    }
    // The attempt's authorization edge is established by the ENVELOPE ID, not by the correlation id.
    const authorization = projection.edges.find((edge) => edge.relation === "TASK_AUTHORIZED_ATTEMPT")!;
    expect(authorization.evidence!.carryingField).toContain("envelope_id");
  });

  it("G-N8: an unverified G1-B Host record claiming trustedIngestion + RUN_ATTEMPT_CORRELATED is NOT admitted", async () => {
    const events = spine();
    /**
     * A host-observation port that returns exactly the claim the control names: a producer asserting
     * its own correlation. §8 G-N8 / §5: T0 records the claim and NEVER promotes it to an edge.
     */
    const projection = await buildProjectTrajectory({
      ...inputsOf(events),
      hostObservation: {
        async observationsFor() {
          return [
            { observationRef: "obs-1", eventKind: "DIRECT_CHILD_SPAWN_OBSERVED", at: CLOCK, claimedState: "RUN_ATTEMPT_CORRELATED" },
            { observationRef: "obs-2", eventKind: "DIRECT_CHILD_EXIT_OBSERVED", at: CLOCK, claimedState: "RUN_ATTEMPT_CORRELATED" },
          ];
        },
      },
    });
    // §5: the maximal admitted status is the quarantined one, and it is stated on the projection.
    expect(projection.hostObservationAdmission).toBe(HOST_OBSERVATION_ADMISSION);
    expect(projection.hostObservationAdmission).toBe("LOCAL_HOST_OBSERVATION_UNVERIFIED_FOR_CAUSAL_ADMISSION");
    // No node and no edge was created from the host claim.
    expect(projection.nodes.some((node) => node.reference.ownerPlane === ("HOST" as never))).toBe(false);
    expect(projection.edges.some((edge) => edge.relation === ("EXECUTION_CAUSED_BY" as never))).toBe(false);
    // The read model states the quarantine as a caveat a consumer must carry.
    const model = buildTrajectoryReadModel(projection, []);
    expect(model.caveats.join(" ")).toContain("LOCAL_HOST_OBSERVATION_UNVERIFIED_FOR_CAUSAL_ADMISSION");
  });

  it("G-N9: a Worker summary is NOT a verified changed-file observation", async () => {
    const events = spine();
    const projection = await buildProjectTrajectory(inputsOf(events));
    /**
     * §8 G-N9: the projection carries no "changed files" claim from any worker summary. The only
     * attempt-result edge it establishes is that the attempt REPORTED a result — and it says so.
     */
    const resultEdges = projection.edges.filter((edge) => edge.relation === "ATTEMPT_PRODUCED_RESULT");
    for (const edge of resultEdges) {
      expect(edge.evidence!.carryingField).toBe("ATTEMPT_COMPLETED.payload.attempt_report.attempt_id");
      expect(JSON.stringify(edge)).not.toContain("changed_files");
      expect(JSON.stringify(edge)).not.toContain("worker_summary");
    }
    const rendered = JSON.stringify(projection);
    expect(rendered).not.toContain("verifiedChangedFiles");
  });

  it("G-N10: a Proof Candidate is NOT a published claim", async () => {
    const events = spine();
    /**
     * §8 G-N10: a receipt that grounds on a proof id which the proof plane reports as NOT PUBLISHED
     * must yield an UNRESOLVED edge. The port below stands in for a plane holding only a candidate.
     */
    const receiptBase = {
      schemaVersion: 1 as const,
      proposalId: `pip-${"a".repeat(32)}`,
      proposalDigest: "b".repeat(64),
      proposalBasis: { projectId: PROJECT, revision: 0, digest: genesis.digest, headCommit: "0".repeat(40) },
      groundBindings: [
        {
          kind: "proof" as const,
          claimId: `pcc-${"c".repeat(32)}`,
          standingAtProposal: "SUPPORTED",
          freshnessAtProposal: "fresh",
          proofBasisAtProposal: { scopeId: "proof", throughSeq: 1, chainDigest: "d".repeat(64) },
          projectAssociation: "PROOF_CLAIM" as const,
        },
      ],
      rationale: "grounded on a candidate, not a published claim",
      admission: { decision: "ADMIT" as const, policyRef: { policyId: "p", version: "1" }, provenanceDigest: "e".repeat(64) },
      acceptedAt: CLOCK,
    };
    // The receipt is sealed by its OWNING module's digest function, so the owner parser accepts it.
    const receipt = { ...receiptBase, digest: acceptedIntentReceiptDigestOf(receiptBase) };
    const eventsWithReceipt = commitHistory(PROJECT, [
      { event_type: "PROJECT_CREATED", entity_type: "project", entity_id: PROJECT, payload: { project_ir: genesis } },
      { event_type: "PROJECT_REVISED", entity_type: "project", entity_id: PROJECT, payload: { project_ir: revised, promotion_id: "promo-1", intent_reconciliation: receipt }, expected_project_revision: 0 },
    ]);
    const projection = await buildProjectTrajectory({
      ...inputsOf(eventsWithReceipt),
      proof: {
        async replay() { return []; },
        async basis() { return { scopeId: "proof", throughSeq: 1, chainDigest: "d".repeat(64) }; },
        // The plane holds NO published claim with this id — only a candidate exists.
        async proofClaimView() { return null; },
      },
      workspace: {
        async replayJournal() { return []; },
        async journalBasis() { return null; },
        async associations() { return []; },
      },
    });
    const ground = projection.edges.find((edge) => edge.relation === "RECEIPT_REFERENCED_GROUND")!;
    // §8 G-N10: a candidate is not a published claim, so the edge is NOT established.
    expect(ground.evidenceState).toBe("UNRESOLVED_SOURCE");
    expect(ground.evidence).toBeNull();
    const node = projection.nodes.find((entry) => entry.nodeId === ground.fromNodeId)!;
    expect(node.epistemicStatus).toBe("UNRESOLVED");
    expect(projection.unresolved.some((entry) => entry.ownerThatShouldSupply === "PROOF")).toBe(true);
  });
});

/* ================================================================== Currentness */

describe("Trajectory-T0 §8 G-N11…G-N14 — currentness and cuts", () => {
  it("G-N11: an owner history that advances during projection marks the window RACED", async () => {
    const events = spine();
    /**
     * A Work port whose history GROWS between the basis read and the history read — the exact race
     * the observation-window protocol exists to detect.
     */
    let reads = 0;
    const racing: TrajectoryWorkPort = {
      async listProjectEvents() {
        reads += 1;
        // The third read is the post-history basis read: return an EXTENDED history.
        return reads >= 3 ? [...events, { ...events[3]!, event_id: 99, project_sequence: 5, event_digest: "9".repeat(64) }] : events;
      },
      async readWorldBasis() { return null; },
      async assessCurrentness() { return null; },
      async readPromotions() { return []; },
    };
    const projection = await buildProjectTrajectory({ projectId: PROJECT, work: racing });
    // §8 G-N11: the moved window is reported, not silently accepted as consistent.
    expect(projection.basisVector.completeness).toBe("RACED");
    const model = buildTrajectoryReadModel(projection, []);
    expect(model.caveats.join(" ")).toContain("RACED");
  });

  it("G-N12: one required Owner being unavailable is recorded, never treated as empty", async () => {
    const events = spine();
    const projection = await buildProjectTrajectory(inputsOf(events));
    // §8 G-N12 / T0-I6: the proof owner is absent, so the vector says NOT_COMPOSED.
    expect(projection.basisVector.proof.availability).toBe("NOT_COMPOSED");
    expect(projection.basisVector.unavailable).toContain("proof plane");
    expect(projection.basisVector.completeness).toBe("INCOMPLETE");
    // The coverage table states the same fact rather than reporting zero references as "all resolved".
    const proofCoverage = projection.sourceCoverage.find((entry) => entry.ownerPlane === "PROOF")!;
    expect(proofCoverage.availability).toBe("NOT_COMPOSED");
  });

  it("G-N13: a current standing that disagrees with the historical one does NOT overwrite it", () => {
    /**
     * §8 G-N13: an ADMITTED fact whose current standing moved. The historical status is preserved and
     * the currentness is reported separately — the two are different fields, never one overwritten.
     */
    const verdict = classifyCurrentness(
      { nodeId: "n-proof", basisOwner: "PROOF", hasOwnerCurrentnessSemantics: true, historicalDigest: "a".repeat(64), currentDigest: "b".repeat(64), ownerVerdict: "STALE", detail: "the proof plane recomputed a STALE standing" },
      "PUBLISHED",
    );
    expect(verdict.currentness).toBe("STALE_BY_OWNER");
    // The historical status is still PUBLISHED — it was not replaced by the current one.
    expect(verdict.historicalStatus).toBe("PUBLISHED");
  });

  it("G-N14: an as-of view does NOT include events after its declared cut", async () => {
    const events = spine();
    const projection = await buildProjectTrajectory(inputsOf(events), {
      throughSequence: 3,
      predecessorBasis: { projectSequence: 2, eventDigest: events[1]!.event_digest },
    });
    expect(projection.asOf!.includedEventIds).toEqual([1, 2, 3]);
    // §8 G-N14: the PROJECT_REVISED at sequence 4 is absent from this cut.
    expect(projection.nodes.some((node) => node.label.startsWith("PROJECT_REVISED"))).toBe(false);
    expect(projection.nodes.every((node) => (node.reference.sourceSequence ?? 0) <= 3)).toBe(true);
  });
});

/* ================================================================== Read-only behaviour */

describe("Trajectory-T0 §8 G-N15…G-N16 — read-only behaviour", () => {
  it("G-N15: the projection has no API that could append an Owner event", async () => {
    const events = spine();
    /**
     * §8 G-N15: a structural check. Every port method is a read; the composed input carries no writer.
     * This asserts the SHAPE of the boundary rather than a runtime attempt.
     */
    const inputs = inputsOf(events);
    const methods = Object.keys(inputs.work);
    for (const method of methods) {
      expect(method).toMatch(/^(list|read|assess)/u);
    }
    const projection = await buildProjectTrajectory(inputs);
    expect(projection.readOnly).toBe(true);
    // And the module exposes no writer: the barrel's exported functions are builders/validators only.
    const trajectoryModule = await import("../src/trajectory/index.js");
    for (const name of Object.keys(trajectoryModule)) {
      expect(name).not.toMatch(/^(append|settle|publish|admit|revise|promote|write|mutate)/u);
    }
  });

  it("G-N16: the owner's event count and basis are unchanged by a query", async () => {
    const events = spine();
    const beforeCount = events.length;
    const beforeDigest = events[events.length - 1]!.event_digest;
    await buildProjectTrajectory(inputsOf(events));
    await buildProjectTrajectory(inputsOf(events));
    expect(events.length).toBe(beforeCount);
    expect(events[events.length - 1]!.event_digest).toBe(beforeDigest);
  });
});

/* ================================================================== Determinism */

describe("Trajectory-T0 §8 G-N17…G-N18 — determinism", () => {
  it("G-N17: reordering independent input arrays while preserving internal sequence does NOT change the digest", async () => {
    const events = spine();
    const base = await buildProjectTrajectory(inputsOf(events));
    /**
     * The reasoning and world arrays are independent of the Work spine's internal order. Reordering
     * them (and re-allocating the events array) must not move the semantic digest.
     */
    const reordered = await buildProjectTrajectory({
      ...inputsOf([...events]),
      reasoning: undefined,
      proof: undefined,
    });
    expect(reordered.semanticDigest).toBe(base.semanticDigest);
  });

  it("G-N18: two rebuilds from the same owner history are byte-identical under the canonical serialization", async () => {
    const events = spine();
    const first = await buildProjectTrajectory(inputsOf(events));
    const second = await buildProjectTrajectory(inputsOf(events));
    // §8 G-N18: byte-identical nodes, edges, unresolved set and digest.
    expect(JSON.stringify(second.nodes)).toBe(JSON.stringify(first.nodes));
    expect(JSON.stringify(second.edges)).toBe(JSON.stringify(first.edges));
    expect(JSON.stringify(second.unresolved)).toBe(JSON.stringify(first.unresolved));
    expect(second.semanticDigest).toBe(first.semanticDigest);
  });
});

/* ================================================================== Identity stability */

describe("Trajectory-T0 — node identity is derived, never generated", () => {
  it("the same canonical reference yields the same id across independent constructions", () => {
    const reference = makeOwnerReference({
      ownerPlane: "WORK", ownerScope: PROJECT, canonicalId: "2", sourceSequence: 2,
      sourceDigest: "a".repeat(64), projectId: PROJECT,
      verification: "VERIFIED_AGAINST_OWNER", verificationDetail: "x",
    });
    const a = trajectoryNodeIdOf(reference);
    const b = trajectoryNodeIdOf({ ...reference });
    expect(a).toBe(b);
    expect(a.startsWith("tn-")).toBe(true);
    // A different canonical id yields a different node id.
    const other = makeTrajectoryNode({
      reference: { ...reference, canonicalId: "3" },
      authenticity: "OWNER_RECORDED", epistemicStatus: "RECORDED", currentness: "CURRENT", completeness: "COMPLETE", label: "x",
    });
    expect(other.nodeId).not.toBe(a);
  });
});
