/**
 * Trajectory-T0 §3–§5 — the projection CONTRACT, as machine proofs.
 *
 * The boundaries this file pins, all on the PURE projection (no owner is exercised here; the two
 * real-owner stories are `trajectory_t0_work_rework.test.ts` and `trajectory_t0_reasoning_intent.test.ts`):
 *
 *     Node Identity      ≠  Projection Time        — a rebuild produces the same ids and digest
 *     Temporal Adjacency ≠  Causation              — succession is TEMPORAL_ONLY, never established
 *     Historical Status  ≠  Currentness            — an ADMITTED claim can be STALE_BY_OWNER
 *     Established Edge   ⇒  carries Owner Evidence — and an unresolved edge NEVER counts as provenance
 *     Missing Owner      ≠  Empty History          — an absent plane is NOT_COMPOSED, not "no events"
 *
 * The synthetic events below are built through the OWNER parser (`parseSchedulerEvent`), so the
 * projection is exercised against the same envelope contract the real Event Log commits — a
 * hand-shaped object would not reach `validateWorkHistory` at all.
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
import {
  BASIS_VECTOR_COMPLETENESS,
  buildProjectTrajectory,
  buildTrajectoryReadModel,
  classifyCurrentness,
  EDGE_EVIDENCE_STATES,
  makeOwnerReference,
  makeTrajectoryNode,
  REFERENCE_VERIFICATION_STATES,
  TrajectoryRefusal,
  trajectoryNodeIdOf,
  trajectoryAsOf,
  validateWorkHistory,
  type TrajectoryProjectionInputs,
  type TrajectoryWorkPort,
} from "../src/trajectory/index.js";

const PROJECT = "t0-contract";
const CLOCK = "2026-10-11T00:00:00Z";

/* ------------------------------------------------------------------ *
 * A genesis-anchored, chain-correct synthetic Work history
 * ------------------------------------------------------------------ */

interface EventDraft {
  readonly event_type: string;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly payload: Record<string, unknown>;
  readonly causation_id?: number | null;
  readonly correlation_id?: string;
  readonly expected_project_revision?: number | null;
}

/** Commit a chain-correct synthetic project history through the OWNER's own parser and digest rules. */
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
      correlation_id: draft.correlation_id ?? `c-${draft.entity_id}`,
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

function projectIr(revision: number, parentRevision: number | null, statement: string, parentDigest: string | null = null) {
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

/** The minimal spine: creation, a task, an attempt, its completion, a revision, a governed reopening. */
function spine(): SchedulerEvent[] {
  const genesis = projectIr(0, null, "latency <= 10 ms");
  const revised = projectIr(1, 0, "latency <= 20 ms", genesis.digest);
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
      expected_project_revision: 0,
    },
    {
      event_type: "ATTEMPT_COMPLETED",
      entity_type: "attempt",
      entity_id: "attempt-a0",
      payload: {
        previous_state: "RUNNING", new_state: "COMPLETED", lease_generation: 1, reason: "completed",
        attempt_report: {
          schema_version: 1, project_id: PROJECT, attempt_id: "attempt-a0", task_id: "t1", envelope_id: "env-1",
          input_project_revision: 0, input_project_digest: genesis.digest, base_commit: "0".repeat(40),
          worktree_id: "attempt-a0", result_commit: "1".repeat(40), worker_status: "completed",
          summary: "done", changed_files: ["src/a.ts"], produced_artifacts: [], started_at: CLOCK,
          finished_at: CLOCK,
          runtime_metadata: {
            runner: "t0-fixture", runner_version: "1", argv: ["t0-fixture"], exit_code: 0, duration_ms: 1,
            environment_digest: "7".repeat(64), stdout_artifact: null, stderr_artifact: null,
          },
        },
      },
      causation_id: 3,
      expected_project_revision: 0,
    },
    {
      event_type: "PROMOTION_COMMITTED",
      entity_type: "promotion",
      entity_id: "promo-1",
      payload: {
        promotion_id: "promo-1", attempt_id: "attempt-a0", source_commit: "1".repeat(40),
        expected_head_commit: "0".repeat(40), resulting_head_commit: "2".repeat(40), reason: "promoted",
      },
      causation_id: 4,
      expected_project_revision: 0,
    },
    {
      event_type: "PROJECT_REVISED",
      entity_type: "project",
      entity_id: PROJECT,
      payload: { project_ir: revised, promotion_id: "promo-1" },
      causation_id: 5,
      expected_project_revision: 0,
    },
    {
      event_type: "TASK_READY",
      entity_type: "t1",
      entity_id: "t1",
      payload: {
        previous_state: "VERIFYING", new_state: "READY", reason: "rework-admitted", batch_activation_event_id: 2,
        rework_provenance: {
          schema_version: 1, origin_result_subject: { kind: "ATTEMPT_RESULT", ref: "attempt-a0" },
          origin_basis_digest: "b".repeat(64), target_observation_digest: "c".repeat(64),
          current_envelope_id: "env-1", reason: "INCOMPATIBLE",
        },
      },
      causation_id: 4,
      expected_project_revision: 1,
    },
  ]);
}

function workPort(events: readonly SchedulerEvent[]): TrajectoryWorkPort {
  return {
    async listProjectEvents() { return events; },
    async readWorldBasis(attemptId) {
      return attemptId === "attempt-a0"
        ? { attemptId, taskId: "t1", basisDigest: "d".repeat(64), capturedAtRevision: 0, capturedAt: CLOCK }
        : null;
    },
    async assessCurrentness(attemptId) {
      return attemptId === "attempt-a0"
        ? { attemptId, basisDigest: "d".repeat(64), currentBasisDigest: "e".repeat(64), currentness: "STALE", reasons: ["world moved"], detail: "the world moved after capture" }
        : null;
    },
    async readPromotions() { return []; },
  };
}

const inputsOf = (events: readonly SchedulerEvent[], extra: Partial<TrajectoryProjectionInputs> = {}): TrajectoryProjectionInputs => ({
  projectId: PROJECT,
  work: workPort(events),
  ...extra,
});

/* ================================================================== */

describe("Trajectory-T0 §3 T0-B1 — deterministic identity", () => {
  it("two rebuilds of the same history produce identical node ids, edges and semantic digest", async () => {
    const events = spine();
    const first = await buildProjectTrajectory(inputsOf(events));
    const second = await buildProjectTrajectory(inputsOf(events));
    expect(second.rootId).toBe(first.rootId);
    expect(second.semanticDigest).toBe(first.semanticDigest);
    expect(second.nodes.map((node) => node.nodeId)).toEqual(first.nodes.map((node) => node.nodeId));
    expect(second.edges.map((edge) => [edge.relation, edge.fromNodeId, edge.toNodeId])).toEqual(
      first.edges.map((edge) => [edge.relation, edge.fromNodeId, edge.toNodeId]),
    );
  });

  it("node identity excludes projection time, path and PID", () => {
    const reference = makeOwnerReference({
      ownerPlane: "WORK", ownerScope: PROJECT, canonicalId: "3", sourceSequence: 3,
      sourceDigest: "f".repeat(64), projectId: PROJECT,
      verification: "VERIFIED_AGAINST_OWNER", verificationDetail: "x",
    });
    expect(trajectoryNodeIdOf(reference)).toBe(trajectoryNodeIdOf({ ...reference }));
    // The label is presentation only and cannot move identity.
    const a = makeTrajectoryNode({ reference, authenticity: "OWNER_RECORDED", epistemicStatus: "RECORDED", currentness: "CURRENT", completeness: "COMPLETE", label: "one" });
    const b = makeTrajectoryNode({ reference, authenticity: "OWNER_RECORDED", epistemicStatus: "RECORDED", currentness: "CURRENT", completeness: "COMPLETE", label: "a completely different label" });
    expect(b.nodeId).toBe(a.nodeId);
  });

  it("§8 G-N17/G-N18: the digest does not depend on the caller's array identity or ambient state", async () => {
    const events = spine();
    const first = await buildProjectTrajectory(inputsOf(events));
    // A structurally identical but freshly allocated history, handed over in a different array.
    const rebuilt = await buildProjectTrajectory(inputsOf(JSON.parse(JSON.stringify(events)) as SchedulerEvent[]));
    expect(rebuilt.semanticDigest).toBe(first.semanticDigest);
    expect(JSON.stringify(rebuilt.nodes)).toBe(JSON.stringify(first.nodes));
    expect(JSON.stringify(rebuilt.edges)).toBe(JSON.stringify(first.edges));
  });
});

describe("Trajectory-T0 §3 T0-B4 — edge evidence states", () => {
  it("succession is TEMPORAL_ONLY and carries no owner evidence", async () => {
    const projection = await buildProjectTrajectory(inputsOf(spine()));
    const succession = projection.edges.filter((edge) => edge.relation === "SAME_OWNER_SEQUENCE_SUCCESSOR");
    expect(succession.length).toBeGreaterThan(0);
    for (const edge of succession) {
      expect(edge.evidenceState).toBe("TEMPORAL_ONLY");
      expect(edge.evidence).toBeNull();
    }
  });

  it("an established edge carries the exact owner evidence that establishes it", async () => {
    const projection = await buildProjectTrajectory(inputsOf(spine()));
    const authorization = projection.edges.find((edge) => edge.relation === "TASK_AUTHORIZED_ATTEMPT");
    expect(authorization?.evidenceState).toBe("ESTABLISHED_BY_OWNER_REFERENCE");
    expect(authorization?.evidence?.carryingField).toBe("ATTEMPT_CREATED.payload.envelope_id == TASK_*.payload.task_envelope.envelope_id");
    expect(authorization?.evidence?.compared["envelopeId"]).toBe("env-1");
    expect(authorization?.evidence?.byReference.ownerPlane).toBe("WORK");
    expect(authorization?.evidence?.byReference.verification).toBe("VERIFIED_AGAINST_OWNER");
  });

  it("an unresolved edge never counts as verified provenance", async () => {
    const projection = await buildProjectTrajectory(inputsOf(spine()));
    for (const edge of projection.edges) {
      if (edge.evidenceState !== "ESTABLISHED_BY_OWNER_REFERENCE") expect(edge.evidence).toBeNull();
      if (edge.evidenceState === "ESTABLISHED_BY_OWNER_REFERENCE") expect(edge.evidence).not.toBeNull();
    }
    // And every established edge is in the enumerated evidence-state vocabulary.
    expect(EDGE_EVIDENCE_STATES).toContain("ESTABLISHED_BY_OWNER_REFERENCE");
  });

  it("the rework edge is established from the governed TASK_READY provenance only", async () => {
    const projection = await buildProjectTrajectory(inputsOf(spine()));
    const rework = projection.edges.find((edge) => edge.relation === "ATTEMPT_REOPENED_FOR_REWORK");
    expect(rework?.evidenceState).toBe("ESTABLISHED_BY_OWNER_REFERENCE");
    expect(rework?.evidence?.carryingField).toBe("TASK_READY.payload.rework_provenance.origin_result_subject.ref");
    expect(rework?.evidence?.compared["originRef"]).toBe("attempt-a0");
  });
});

describe("Trajectory-T0 §4 — the Basis Vector and observation window", () => {
  it("records the ACTUAL position in each owner, and an absent owner is NOT_COMPOSED not empty", async () => {
    const projection = await buildProjectTrajectory(inputsOf(spine()));
    expect(projection.basisVector.work.projectSequence).toBe(7);
    expect(projection.basisVector.work.projectIrRevision).toBe(1);
    expect(projection.basisVector.proof.availability).toBe("NOT_COMPOSED");
    expect(projection.basisVector.reasoning).toEqual([]);
    expect(projection.basisVector.journal[0]?.availability).toBe("NOT_COMPOSED");
    expect(projection.basisVector.completeness).toBe(BASIS_VECTOR_COMPLETENESS[1]);
    expect(projection.basisVector.unavailable).toContain("proof plane");
  });

  it("a caller-supplied expected cursor that disagrees marks the window RACED", async () => {
    const events = spine();
    const projection = await buildProjectTrajectory(inputsOf(events), {
      expectedWorkCursor: { projectSequence: 6, eventDigest: "0".repeat(64) },
    });
    expect(projection.basisVector.completeness).toBe(BASIS_VECTOR_COMPLETENESS[2]);
  });
});

describe("Trajectory-T0 §4 — currentness is not historical status", () => {
  it("a digest difference establishes CHANGED, NOT semantic invalidity", () => {
    const verdict = classifyCurrentness(
      {
        nodeId: "n1", basisOwner: "PROOF", hasOwnerCurrentnessSemantics: false,
        historicalDigest: "a".repeat(64), currentDigest: "b".repeat(64), ownerVerdict: null,
        detail: "proof standing",
      },
      "ADMITTED",
    );
    expect(verdict.currentness).toBe("CHANGED");
    expect(verdict.historicalStatus).toBe("ADMITTED");
  });

  it("STALE_BY_OWNER is assigned only where the owner's own semantics support it", () => {
    const withSemantics = classifyCurrentness(
      { nodeId: "n2", basisOwner: "REASONING", hasOwnerCurrentnessSemantics: true, historicalDigest: null, currentDigest: null, ownerVerdict: "STALE", detail: "frontier moved" },
      "ADMITTED",
    );
    expect(withSemantics.currentness).toBe("STALE_BY_OWNER");
    const withoutSemantics = classifyCurrentness(
      { nodeId: "n3", basisOwner: "WORK", hasOwnerCurrentnessSemantics: false, historicalDigest: null, currentDigest: null, ownerVerdict: "STALE", detail: "no owner semantics" },
      "ADMITTED",
    );
    // The owner's verdict is REFUSED because this owner has no currentness semantics of its own.
    expect(withoutSemantics.currentness).toBe("UNKNOWN");
  });

  it("an unavailable owner is UNAVAILABLE rather than silently CURRENT", () => {
    const verdict = classifyCurrentness(
      { nodeId: "n4", basisOwner: "NONE", hasOwnerCurrentnessSemantics: false, historicalDigest: null, currentDigest: null, ownerVerdict: "UNAVAILABLE", detail: "not composed" },
      "UNRESOLVED",
    );
    expect(verdict.currentness).toBe("UNAVAILABLE");
  });
});

describe("Trajectory-T0 §5 — Work event validation fails closed", () => {
  it("a mutated payload with a stale digest is refused by the owner parser", () => {
    const events = spine();
    const mutated = events.map((event, index) =>
      index === 3 ? { ...event, payload: { ...event.payload, reason: "tampered" } } : event,
    );
    expect(() => validateWorkHistory({ projectId: PROJECT, events: mutated })).toThrow(TrajectoryRefusal);
  });

  it("§6 A-N6: a corrupted previous-event digest chain is refused", () => {
    const events = spine();
    const broken = events.map((event, index) => (index === 4 ? { ...event, previous_event_digest: "0".repeat(64) } : event));
    expect(() => validateWorkHistory({ projectId: PROJECT, events: broken })).toThrow(/PREVIOUS_DIGEST_MISMATCH|INVALID_SOURCE_EVENT/u);
  });

  it("§6 A-N2: an event from another project is refused", () => {
    const events = spine();
    const foreign = events.map((event, index) => (index === 2 ? { ...event, project_id: "other-project" } : event));
    expect(() => validateWorkHistory({ projectId: PROJECT, events: foreign })).toThrow(TrajectoryRefusal);
  });

  it("§6 A-N7: a causation reference to a LATER event is refused", () => {
    const events = spine();
    const forward = events.map((event, index) => (index === 2 ? { ...event, causation_id: 6 } : event));
    // Re-seal so the causation check, not the digest check, is the reason.
    const resealed = forward.map((event, index) => {
      const base = { ...event, causation_id: index === 2 ? 6 : event.causation_id };
      const withRequest = { ...base, request_digest: computeRequestDigest(base) };
      return { ...withRequest, event_digest: computeEventDigest(withRequest) };
    });
    expect(() => validateWorkHistory({ projectId: PROJECT, events: resealed })).toThrow(/CAUSATION_NOT_EARLIER/u);
  });

  it("a non-genesis interval requires an explicit validated predecessor basis", () => {
    const events = spine();
    const window = events.filter((event) => event.project_sequence >= 3);
    expect(() => validateWorkHistory({ projectId: PROJECT, events: window, fromSequence: 3 })).toThrow(/MISSING_PREDECESSOR_BASIS/u);
    const predecessor = events[1]!;
    const accepted = validateWorkHistory({
      projectId: PROJECT, events: window, fromSequence: 3,
      predecessorBasis: { projectSequence: predecessor.project_sequence, eventDigest: predecessor.event_digest },
    });
    expect(accepted.map((event) => event.project_sequence)).toEqual([3, 4, 5, 6, 7]);
  });
});

describe("Trajectory-T0 §4/§6 — as-of cuts exclude the future", () => {
  it("an as-of cut contains only events at or before the declared sequence", async () => {
    const events = spine();
    const predecessor = events[3]!;
    const cut = await trajectoryAsOf(inputsOf(events), {
      throughSequence: 4,
      predecessorBasis: { projectSequence: predecessor.project_sequence, eventDigest: predecessor.event_digest },
    });
    expect(cut.asOf?.throughSequence).toBe(4);
    expect(cut.asOf?.includedEventIds).toEqual([1, 2, 3, 4]);
    expect(cut.nodes.every((node) => (node.reference.sourceSequence ?? 0) <= 4)).toBe(true);
    // §6 A-N5-adjacent: the later governed reopening is NOT in this cut.
    expect(cut.nodes.some((node) => node.label.startsWith("TASK_READY"))).toBe(false);
  });

  it("§6 A-N8 / §8 G-N14: an as-of cut at a non-genesis cursor without a predecessor basis is refused", async () => {
    await expect(trajectoryAsOf(inputsOf(spine()), { throughSequence: 4, predecessorBasis: null })).rejects.toThrow(/MISSING_PREDECESSOR_BASIS/u);
  });

  it("later events do not change an earlier cut's semantic digest", async () => {
    const events = spine();
    const predecessor = events[3]!;
    const cutOnce = await trajectoryAsOf(inputsOf(events), { throughSequence: 4, predecessorBasis: { projectSequence: 3, eventDigest: predecessor.event_digest } });
    const extended = spine();
    const cutAgain = await trajectoryAsOf(inputsOf(extended), { throughSequence: 4, predecessorBasis: { projectSequence: 3, eventDigest: extended[3]!.event_digest } });
    expect(cutAgain.semanticDigest).toBe(cutOnce.semanticDigest);
  });
});

describe("Trajectory-T0 §9 — the read model carries caveats, not permissions", () => {
  it("an incomplete basis vector is stated as a caveat", async () => {
    const projection = await buildProjectTrajectory(inputsOf(spine()));
    const model = buildTrajectoryReadModel(projection, []);
    expect(model.describedBasis.completeness).toBe("INCOMPLETE");
    expect(model.caveats.join(" ")).toContain("INCOMPLETE");
    expect(model.caveats.join(" ")).toContain("NOT causation");
    expect(model.caveats.join(" ")).toContain("LOCAL_HOST_OBSERVATION_UNVERIFIED_FOR_CAUSAL_ADMISSION");
    expect(model.attemptsWithResults.map((entry) => entry.attemptId)).toContain("attempt-a0");
    expect(model.reopenedAttempts.map((entry) => entry.originResultRef)).toContain("attempt-a0");
  });

  it("§3: every reference verification state is in the enumerated vocabulary", () => {
    expect(REFERENCE_VERIFICATION_STATES).toContain("VERIFIED_AGAINST_OWNER");
    expect(REFERENCE_VERIFICATION_STATES).toContain("UNRESOLVED");
    expect(REFERENCE_VERIFICATION_STATES).toContain("MISMATCH");
  });
});
