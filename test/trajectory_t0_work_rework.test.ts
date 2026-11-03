/**
 * Trajectory-T0 §6 (T0-E) — REAL OWNER REPLAY SCENARIO A: `Work Result → Rework → New Attempt`.
 *
 *     A0 authorized by E0  →  A0 produced a result  →  result promoted  →  governed reopening with
 *     actual rework_provenance  →  E1 authorizes A1
 *
 * The history here is produced by the REAL product machinery (`ProjectController`, `EventStore`, the
 * Effects runtime, the governed `appendReworkReopening` seam) — NOT by hand-authored `TrajectoryNode`
 * objects. The Trajectory projection is then asked to reconstruct that history from the owners, and
 * the negative controls below each corrupt exactly ONE owner fact and require a NAMED refusal.
 *
 * The boundary this file exists to prove, in the ruling's words:
 *
 *     A0 is NEVER rebound to E1, and a historical as-of cut excludes future A1 events.
 *
 * No model executes. No DSH worker launches. No PRIMARY route is enabled.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";
import { ManualClock } from "@ordarium/testing";

import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy, actionKey, type StageGraphDefinition } from "../src/domain/index.js";
import { ReworkAdmissionPermit } from "../src/domain/rework_admission.js";
import {
  computeEventDigest,
  computeRequestDigest,
  normalizeEventPayload,
  parseNewEvent,
  parseTaskEnvelope,
  type SchedulerEvent,
} from "../src/schema/index.js";
import { composeTrajectoryInputs } from "../src/composition/trajectory.js";
import { EMPTY_PREVIOUS_EVENT_DIGEST } from "../src/state/index.js";
import {
  buildProjectTrajectory,
  buildTrajectoryReadModel,
  EDGE_EVIDENCE_STATES,
  trajectoryAsOf,
  validateWorkHistory,
  type TrajectoryProjectionInputs,
} from "../src/trajectory/index.js";

import { FakeClock, taskSpec } from "./helpers.js";

const HEAD = "c".repeat(40);
const CLOCK = "2026-10-11T00:00:00Z";
const PROJECT = "t0a";
const HEX = (seed: string): string => seed.repeat(64).slice(0, 64);

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

/** The declared topology: two tasks reach VERIFYING together; one is promoted, the other reopened. */
const DECLARED_GRAPH: StageGraphDefinition = {
  stages: [
    { id: "active", state: "ACTIVE", concurrency: 2 },
    { id: "verifying", state: "VERIFYING", concurrency: 2 },
    { id: "blocked", state: "BLOCKED" },
    { id: "ready", state: "READY" },
  ],
  transitions: [
    { from: "active", event: "TASK_VERIFYING", to: "VERIFYING", when: "batch-completed-candidate" },
    { from: "active", event: "TASK_READY", to: "READY", when: "batch-failed-budget-remaining" },
    { from: "active", event: "TASK_FAILED", to: "FAILED", when: "attempt-limit-exhausted" },
    { from: "verifying", event: "TASK_SATISFIED", to: "SATISFIED", when: "promotion-committed" },
    { from: "verifying", event: "TASK_READY", to: "READY", when: "rework-admitted" },
    { from: "blocked", event: "TASK_READY", to: "READY", when: "dependencies-satisfied" },
    { from: "ready", event: "TASK_STARTED", to: "ACTIVE", when: "always" },
  ],
  guards: {},
  declared_by: "t0a-spec",
  reason: "two tasks must reach VERIFYING together so one can be promoted while the other is reopened",
};

/** The task the scenario promotes (task-a) and the task it reworks (task-b). */
const PROMOTED = "task-a";
const REWORKED = "task-b";

interface Rig {
  readonly store: EventStore;
  readonly controller: ProjectController;
  readonly inputs: TrajectoryProjectionInputs;
  readonly dir: string;
  readonly attempts: { a0: string; a1: string | null; promoted: string };
  events(): SchedulerEvent[];
  drive(taskId: string): Promise<string>;
  reopen(taskId: string, originAttemptId: string): void;
  close(): Promise<void>;
}

async function rig(): Promise<Rig> {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-t0a-"));
  cleanups.push(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* windows keeps the directory busy while a handle is open; the OS reaps it */
    }
  });
  const store = new EventStore(join(dir, "p.sqlite"), { clock: new FakeClock().next });
  const git = new FakeGitPort(HEAD);
  const effects = createPalimpsestEffects({ databasePath: join(dir, "o.sqlite"), git, clock: new ManualClock().now, leaseMs: 50 });
  const policy = new TaskPolicy({
    policy_id: "trusted-default",
    read_paths: ["src"],
    allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
    network_policy: "deny",
    network_allowlist: [],
    timeout_s: 3600,
    lease_s: 60,
    attempt_limit: 3,
    candidate_limit: 1,
  });
  const controller = new ProjectController({ store, effects, projectId: PROJECT, policy, clock: () => CLOCK });
  controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec(PROMOTED), taskSpec(REWORKED)], stageGraph: DECLARED_GRAPH });
  controller.declareRoleTable({ roles: [{ role: "implementer", slots: 2 }], hardCap: 2, declaredBy: "t0a-spec" });

  const row = (taskId: string): { last_event_id: number; state_json: Uint8Array } =>
    store.connection
      .prepare("SELECT last_event_id, state_json FROM tasks WHERE project_id=? AND task_id=?")
      .get(PROJECT, taskId) as { last_event_id: number; state_json: Uint8Array };
  const activationOf = (taskId: string): number => {
    const anchor = JSON.parse(new TextDecoder().decode(row(taskId).state_json)) as { batch_activation_event_id?: number };
    if (anchor.batch_activation_event_id === undefined) throw new Error(`${taskId} has no batch anchor`);
    return Number(anchor.batch_activation_event_id);
  };
  const readEnvelope = (taskId: string): ReturnType<typeof parseTaskEnvelope> => {
    const task = store.connection
      .prepare("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?")
      .get(PROJECT, taskId) as { envelope_json: Uint8Array };
    return parseTaskEnvelope(JSON.parse(new TextDecoder().decode(task.envelope_json)));
  };

  const attempts: { a0: string; a1: string | null; promoted: string } = { a0: "", a1: null, promoted: "" };

  const drive = async (taskId: string): Promise<string> => {
    controller.step();
    const created = controller.step()!;
    const attemptId = created.entity_id;
    await controller.claim(attemptId);
    const committed = await effects.invoke(
      effects.actions.gitCommit,
      { worktreeId: attemptId, message: "work" },
      { scope: PROJECT, revision: controller.promotions.projectRevision(), callId: `c:${attemptId}` },
    );
    controller.report(attemptId, { workerStatus: "completed", summary: "done", resultCommit: committed.commit });
    await controller.gate({ attemptId, predicate: "tests_pass", command: ["python", "-m", "pytest"] });
    expect(controller.step()!.event_type).toBe("TASK_VERIFYING");
    return attemptId;
  };

  const reopen = (taskId: string, originAttemptId: string): void => {
    const activationId = activationOf(taskId);
    const request = parseNewEvent({
      schema_version: 1,
      project_id: PROJECT,
      event_type: "TASK_READY",
      payload_version: 1,
      entity_type: "task",
      entity_id: taskId,
      payload: normalizeEventPayload("TASK_READY", {
        previous_state: "VERIFYING",
        new_state: "READY",
        reason: "rework-admitted",
        batch_activation_event_id: activationId,
      }),
      causation_id: Number(row(taskId).last_event_id),
      correlation_id: `task:${taskId}:rework`,
      idempotency_key: actionKey("task-batch-settle-v1", {
        project_id: PROJECT,
        task_id: taskId,
        batch_activation_event_id: activationId,
        target_state: "READY",
      }),
      expected_project_revision: 0,
    });
    const permit = ReworkAdmissionPermit.issue({
      projectId: PROJECT,
      taskId,
      originResultSubjectKind: "attempt_result",
      originResultSubjectRef: originAttemptId,
      originBasisDigest: HEX("a"),
      targetObservationDigest: HEX("b"),
      currentEnvelopeId: readEnvelope(taskId).envelope_id,
      batchActivationEventId: activationId,
      reason: "INCOMPATIBLE",
      targetFence: controller.reworkTargetFence(),
    });
    store.appendReworkReopening(request, permit, { assessmentDigest: HEX("d") });
  };

  const inputs = composeTrajectoryInputs({
    projectId: PROJECT,
    controller,
    promotions: controller.promotions,
    reasoning: undefined,
    proof: undefined,
    projectWorkspace: undefined,
    journalStore: undefined,
    associationStore: undefined,
  });

  return {
    store,
    controller,
    inputs,
    dir,
    attempts,
    events: () => store.listEvents(PROJECT),
    drive,
    reopen,
    close: async () => {
      try {
        store.close();
      } catch {
        /* a test that simulated a restart already closed this store */
      }
      await effects.close();
    },
  };
}

/** The full scenario: A0 → result → promotion → governed reopening of a SIBLING → E1 → A1. */
async function fullScenario(): Promise<Rig> {
  const r = await rig();
  // Both tasks reach VERIFYING together (the declared batch topology).
  r.attempts.promoted = await r.drive(PROMOTED);
  r.attempts.a0 = await r.drive(REWORKED);
  const resultCommit = (r.store.listEvents(PROJECT).find((event) => event.event_type === "ATTEMPT_COMPLETED" && event.entity_id === r.attempts.promoted)!.payload as { attempt_report: { result_commit: string } }).attempt_report.result_commit;
  await r.controller.promote(r.attempts.promoted, resultCommit, HEAD);
  expect(r.controller.step()!.event_type).toBe("TASK_SATISFIED");
  // §6: a REAL governed reopening carrying the actual rework_provenance, against A0's result.
  r.reopen(REWORKED, r.attempts.a0);
  // E1: the reauthorization that gives A1 its OWN authorization.
  r.controller.step();
  const created = r.controller.step()!;
  expect(created.event_type).toBe("ATTEMPT_CREATED");
  r.attempts.a1 = created.entity_id;
  return r;
}

/**
 * Re-seal a mutated history from `index` onward.
 *
 * Mutating one event changes its `event_digest`, so every LATER event's `previous_event_digest` and
 * `event_digest` must be recomputed — otherwise the control would trip the chain check instead of
 * the check it is meant to exercise.
 */
function mutateAndReseal(events: readonly SchedulerEvent[], index: number, patch: Partial<SchedulerEvent>): SchedulerEvent[] {
  const out: SchedulerEvent[] = [...events];
  const base = { ...out[index]!, ...patch };
  out[index] = { ...base, request_digest: computeRequestDigest(base), event_digest: "" };
  out[index] = { ...out[index]!, event_digest: computeEventDigest(out[index]!) };
  for (let cursor = index + 1; cursor < out.length; cursor += 1) {
    const linked = { ...out[cursor]!, previous_event_digest: out[cursor - 1]!.event_digest };
    out[cursor] = { ...linked, event_digest: computeEventDigest(linked) };
  }
  return out;
}

/**
 * Reconstruct the history as if the matching events had NEVER existed.
 *
 * Removing an event breaks two invariants that are NOT the relation under test: the per-project
 * sequence must stay contiguous, and no surviving event may cite a removed event as its cause. This
 * helper repairs exactly those two, so the projection reaches the relation it is supposed to find
 * missing. Renumbering does not alter the events' own identity or content.
 */
function removeAndResequence(events: readonly SchedulerEvent[], remove: (event: SchedulerEvent) => boolean): SchedulerEvent[] {
  const removedIds = new Set(events.filter(remove).map((event) => event.event_id));
  const kept = events.filter((event) => !remove(event));
  const out: SchedulerEvent[] = [];
  let previousDigest = EMPTY_PREVIOUS_EVENT_DIGEST;
  for (let index = 0; index < kept.length; index += 1) {
    const original = kept[index]!;
    const causation = original.causation_id !== null && removedIds.has(original.causation_id) ? null : original.causation_id;
    const renumbered = {
      ...original,
      project_sequence: index + 1,
      causation_id: causation,
      previous_event_digest: previousDigest,
    };
    const withRequest = { ...renumbered, request_digest: computeRequestDigest(renumbered), event_digest: "" };
    const sealed = { ...withRequest, event_digest: computeEventDigest(withRequest) };
    out.push(sealed);
    previousDigest = sealed.event_digest;
  }
  return out;
}

/* ================================================================== positive assertions */

describe("Trajectory-T0 §6 T0-E — Work Result → Rework → New Attempt (real owners)", () => {
  it("A0 and A1 are distinct attempts, each pointing at its OWN authorization", async () => {
    const r = await fullScenario();
    try {
      const projection = await buildProjectTrajectory(r.inputs);
      const authorizations = projection.edges.filter((edge) => edge.relation === "TASK_AUTHORIZED_ATTEMPT");
      // Two attempts were created for the reworked task (A0 and A1) plus one for the promoted task.
      expect(authorizations.length).toBeGreaterThanOrEqual(2);
      for (const edge of authorizations) expect(edge.evidenceState).toBe("ESTABLISHED_BY_OWNER_REFERENCE");

      const a0Node = projection.nodes.find((node) => node.label.startsWith("ATTEMPT_CREATED") && node.label.includes(r.attempts.a0));
      const a1Node = projection.nodes.find((node) => node.label.startsWith("ATTEMPT_CREATED") && node.label.includes(r.attempts.a1!));
      expect(a0Node).toBeDefined();
      expect(a1Node).toBeDefined();
      expect(a0Node!.nodeId).not.toBe(a1Node!.nodeId);

      /**
       * §6 "A0 is never rebound to E1": A0's authorization is resolved from A0's OWN recorded
       * envelope_id, and A0's authorizing event precedes A1's creation in the canonical sequence.
       */
      const a0Authorization = authorizations.find((edge) => edge.toNodeId === a0Node!.nodeId)!;
      const a1Authorization = authorizations.find((edge) => edge.toNodeId === a1Node!.nodeId)!;
      const a0AuthSequence = projection.nodes.find((node) => node.nodeId === a0Authorization.fromNodeId)!.reference.sourceSequence!;
      const a1CreatedSequence = a1Node!.reference.sourceSequence!;
      expect(a0AuthSequence).toBeLessThan(a1CreatedSequence);
      // A0's authorization is derived from A0's own ATTEMPT_CREATED payload, not from today's task row.
      const a0Event = r.events().find((event) => event.event_type === "ATTEMPT_CREATED" && event.entity_id === r.attempts.a0)!;
      expect(a0Authorization.evidence!.compared["envelopeId"]).toBe((a0Event.payload as { envelope_id: string }).envelope_id);
      void a1Authorization;
    } finally {
      await r.close();
    }
  });

  it("§6: a LATER change to the task's current envelope does not rebind A0's historical authorization", async () => {
    const r = await fullScenario();
    try {
      const before = await buildProjectTrajectory(r.inputs);
      const a0Node = before.nodes.find((node) => node.label.startsWith("ATTEMPT_CREATED") && node.label.includes(r.attempts.a0))!;
      const beforeEdge = before.edges.find((edge) => edge.relation === "TASK_AUTHORIZED_ATTEMPT" && edge.toNodeId === a0Node.nodeId)!;

      /**
       * Simulate a later reauthorization by rewriting the task's CURRENT envelope row to a new id.
       * The historical event log is untouched — which is exactly the situation T0 must survive.
       */
      const currentEnvelope = parseTaskEnvelope(
        JSON.parse(
          new TextDecoder().decode(
            (r.store.connection.prepare("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?").get(PROJECT, REWORKED) as { envelope_json: Uint8Array }).envelope_json,
          ),
        ),
      );
      r.store.connection
        .prepare("UPDATE tasks SET envelope_json=? WHERE project_id=? AND task_id=?")
        .run(new TextEncoder().encode(JSON.stringify({ ...currentEnvelope, envelope_id: "env-reauthorized-later" })), PROJECT, REWORKED);

      const after = await buildProjectTrajectory(r.inputs);
      const afterEdge = after.edges.find((edge) => edge.relation === "TASK_AUTHORIZED_ATTEMPT" && edge.toNodeId === a0Node.nodeId)!;
      // §6 / T0-I4: the historical basis cannot be silently rebased.
      expect(afterEdge.evidence!.compared).toEqual(beforeEdge.evidence!.compared);
      expect(afterEdge.evidence!.compared["envelopeId"]).not.toBe("env-reauthorized-later");
    } finally {
      await r.close();
    }
  });

  it("the rework edge references the PROPER origin result, from the governed TASK_READY provenance", async () => {
    const r = await fullScenario();
    try {
      const projection = await buildProjectTrajectory(r.inputs);
      const rework = projection.edges.filter((edge) => edge.relation === "ATTEMPT_REOPENED_FOR_REWORK");
      expect(rework).toHaveLength(1);
      expect(rework[0]!.evidenceState).toBe("ESTABLISHED_BY_OWNER_REFERENCE");
      expect(rework[0]!.evidence!.carryingField).toBe("TASK_READY.payload.rework_provenance.origin_result_subject.ref");
      // §6: the origin is A0's actual completed result — not a fabricated or unrelated attempt.
      expect(rework[0]!.evidence!.compared["originRef"]).toBe(r.attempts.a0);
      const originNode = projection.nodes.find((node) => node.nodeId === rework[0]!.fromNodeId)!;
      expect(originNode.label).toContain("ATTEMPT_COMPLETED");
      expect(originNode.label).toContain(r.attempts.a0);
    } finally {
      await r.close();
    }
  });

  it("the promotion relation appears only where the actual source events support it", async () => {
    const r = await fullScenario();
    try {
      const projection = await buildProjectTrajectory(r.inputs);
      const promotions = projection.edges.filter((edge) => edge.relation === "RESULT_PROMOTED");
      expect(promotions).toHaveLength(1);
      expect(promotions[0]!.evidenceState).toBe("ESTABLISHED_BY_OWNER_REFERENCE");
      expect(promotions[0]!.evidence!.compared["attemptId"]).toBe(r.attempts.promoted);
      // The promotion event really is in the canonical history.
      expect(r.events().some((event) => event.event_type === "PROMOTION_COMMITTED")).toBe(true);
    } finally {
      await r.close();
    }
  });

  it("project evolution preserves its actual event sequence, and the read model reports it", async () => {
    const r = await fullScenario();
    try {
      const projection = await buildProjectTrajectory(r.inputs);
      const workNodes = projection.nodes.filter((node) => node.reference.ownerPlane === "WORK");
      const sequences = workNodes.map((node) => node.reference.sourceSequence!);
      // The projected Work nodes are in strictly increasing canonical sequence order.
      expect([...sequences].sort((a, b) => a - b)).toEqual(sequences);
      // §9: the read model answers "which events changed the project?" from actual owner facts.
      const model = buildTrajectoryReadModel(projection, []);
      expect(model.projectChangingEvents.some((entry) => entry.eventType === "PROJECT_CREATED")).toBe(true);
      expect(model.attemptsWithResults.map((entry) => entry.attemptId)).toContain(r.attempts.a0);
      expect(model.reopenedAttempts.map((entry) => entry.originResultRef)).toContain(r.attempts.a0);
    } finally {
      await r.close();
    }
  });

  it("a historical as-of cut excludes future A1 events, and later events do not move its digest", async () => {
    const r = await fullScenario();
    try {
      const events = r.events();
      const reworkEvent = events.find((event) => event.event_type === "TASK_READY" && (event.payload as { rework_provenance?: unknown }).rework_provenance !== undefined)!;
      const predecessor = events.find((event) => event.project_sequence === reworkEvent.project_sequence - 1)!;
      // A cut taken BEFORE A1 was created.
      const cut = await trajectoryAsOf(r.inputs, {
        throughSequence: reworkEvent.project_sequence,
        predecessorBasis: { projectSequence: predecessor.project_sequence, eventDigest: predecessor.event_digest },
      });
      const a1Sequence = events.find((event) => event.event_type === "ATTEMPT_CREATED" && event.entity_id === r.attempts.a1)!.project_sequence;
      expect(cut.asOf!.throughSequence).toBeLessThan(a1Sequence);
      expect(cut.nodes.some((node) => node.label.includes(r.attempts.a1!))).toBe(false);
      // §6: new events do not alter the old projection's semantic digest.
      const again = await trajectoryAsOf(r.inputs, {
        throughSequence: reworkEvent.project_sequence,
        predecessorBasis: { projectSequence: predecessor.project_sequence, eventDigest: predecessor.event_digest },
      });
      expect(again.semanticDigest).toBe(cut.semanticDigest);
    } finally {
      await r.close();
    }
  });

  it("§8 G-N16: querying Trajectory does not change the owner's event count or chain", async () => {
    const r = await fullScenario();
    try {
      const before = r.events().length;
      const lastDigestBefore = r.events()[before - 1]!.event_digest;
      await buildProjectTrajectory(r.inputs);
      await buildProjectTrajectory(r.inputs);
      const after = r.events().length;
      const lastDigestAfter = r.events()[after - 1]!.event_digest;
      expect(after).toBe(before);
      expect(lastDigestAfter).toBe(lastDigestBefore);
      // The owner's own chain verifier still passes.
      expect(() => r.store.verifyFull()).not.toThrow();
    } finally {
      await r.close();
    }
  });
});

/* ================================================================== negative controls A-N1..A-N8 */

/**
 * Each control corrupts exactly ONE owner fact in an otherwise valid history and requires a NAMED
 * refusal, an unresolved reference or a conflict. No fabricated successful edge is acceptable.
 */
describe("Trajectory-T0 §6 — negative controls A-N1…A-N8", () => {
  /** Re-seal a mutated event and every event after it, so a control exercises its OWN check. */
  const reseal = (event: SchedulerEvent, patch: Partial<SchedulerEvent>): SchedulerEvent => {
    const base = { ...event, ...patch };
    const withRequest = { ...base, request_digest: computeRequestDigest(base) };
    return { ...withRequest, event_digest: computeEventDigest(withRequest) };
  };

  it("A-N1: replacing A0's authorization with the CURRENT Task Envelope is refused", async () => {
    const r = await fullScenario();
    try {
      const events = r.events();
      const currentEnvelopeId = parseTaskEnvelope(
        JSON.parse(
          new TextDecoder().decode(
            (r.store.connection.prepare("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?").get(PROJECT, REWORKED) as { envelope_json: Uint8Array }).envelope_json,
          ),
        ),
      ).envelope_id;
      // Point A0's ATTEMPT_CREATED at an envelope id that no TASK_CREATED event carries.
      const index = events.findIndex((event) => event.event_type === "ATTEMPT_CREATED" && event.entity_id === r.attempts.a0);
      const mutated = mutateAndReseal(events, index, {
        payload: { ...events[index]!.payload, envelope_id: `${currentEnvelopeId}-rebound` },
      });
      const projection = await buildProjectTrajectory({ ...r.inputs, work: { ...r.inputs.work, async listProjectEvents() { return mutated; } } });
      const a0Node = projection.nodes.find((node) => node.label.includes(r.attempts.a0) && node.label.startsWith("ATTEMPT_CREATED"))!;
      const authorization = projection.edges.find((edge) => edge.relation === "TASK_AUTHORIZED_ATTEMPT" && edge.toNodeId === a0Node.nodeId)!;
      expect(authorization.evidenceState).toBe("UNRESOLVED_SOURCE");
      expect(projection.unresolved.some((entry) => entry.relation === "TASK_AUTHORIZED_ATTEMPT")).toBe(true);
    } finally {
      await r.close();
    }
  });

  it("A-N2: an event from another project is refused outright", async () => {
    const r = await fullScenario();
    try {
      const events = r.events();
      // ATTEMPT_CREATED carries no embedded project identity, so the ONLY reason left to refuse it
      // is the project check in `validateWorkHistory` — which is the control's subject.
      const index = events.findIndex((event) => event.event_type === "ATTEMPT_CREATED");
      const foreign = mutateAndReseal(events, index, { project_id: "some-other-project" });
      expect(() => validateWorkHistory({ projectId: PROJECT, events: foreign })).toThrow(/FOREIGN_PROJECT_EVENT/u);
    } finally {
      await r.close();
    }
  });

  it("A-N3: a forged Rework relation without the governed provenance is NOT established", async () => {
    const r = await fullScenario();
    try {
      const events = r.events();
      // Remove the governed provenance from the TASK_READY event, keeping everything else valid.
      const index = events.findIndex((event) => event.event_type === "TASK_READY" && (event.payload as { rework_provenance?: unknown }).rework_provenance !== undefined);
      const payload = { ...(events[index]!.payload as Record<string, unknown>) };
      delete payload["rework_provenance"];
      const stripped = mutateAndReseal(events, index, { payload });
      const projection = await buildProjectTrajectory({ ...r.inputs, work: { ...r.inputs.work, async listProjectEvents() { return stripped; } } });
      // With no provenance there is no rework edge at all — a forged relation cannot be invented.
      expect(projection.edges.filter((edge) => edge.relation === "ATTEMPT_REOPENED_FOR_REWORK")).toHaveLength(0);
    } finally {
      await r.close();
    }
  });

  it("A-N4: removing the event a relation depends on leaves the relation unresolved", async () => {
    const r = await fullScenario();
    try {
      const events = r.events();
      // Remove the ATTEMPT_COMPLETED event that the promotion and rework both reference, and repair
      // the sequence/causation invariants so the missing SOURCE is the only thing left to find.
      const withoutCompletion = removeAndResequence(
        events,
        (event) => event.event_type === "ATTEMPT_COMPLETED" && event.entity_id === r.attempts.promoted,
      );
      const projection = await buildProjectTrajectory({ ...r.inputs, work: { ...r.inputs.work, async listProjectEvents() { return withoutCompletion; } } });
      // The promotion edge degrades to an unresolved source; no fabricated successful edge appears.
      const promotions = projection.edges.filter((edge) => edge.relation === "RESULT_PROMOTED");
      for (const edge of promotions) expect(edge.evidenceState).toBe("UNRESOLVED_SOURCE");
    } finally {
      await r.close();
    }
  });

  it("A-N5: a mutated payload with an un-updated digest is refused by the owner parser", async () => {
    const r = await fullScenario();
    try {
      const events = r.events();
      const mutated = events.map((event) =>
        event.event_type === "PROMOTION_COMMITTED" ? { ...event, payload: { ...event.payload, resulting_head_commit: "9".repeat(40) } } : event,
      );
      expect(() => validateWorkHistory({ projectId: PROJECT, events: mutated })).toThrow(/INVALID_SOURCE_EVENT/u);
    } finally {
      await r.close();
    }
  });

  it("A-N6: a corrupted previous-event digest chain is refused", async () => {
    const r = await fullScenario();
    try {
      const events = r.events();
      const broken = events.map((event, index) => (index === 4 ? reseal(event, { previous_event_digest: "0".repeat(64) }) : event));
      expect(() => validateWorkHistory({ projectId: PROJECT, events: broken })).toThrow(/PREVIOUS_DIGEST_MISMATCH/u);
    } finally {
      await r.close();
    }
  });

  it("A-N7: a causation reference to a LATER event is refused", async () => {
    const r = await fullScenario();
    try {
      const events = r.events();
      const lastId = events[events.length - 1]!.event_id;
      const forward = mutateAndReseal(events, 2, { causation_id: lastId });
      expect(() => validateWorkHistory({ projectId: PROJECT, events: forward })).toThrow(/CAUSATION_NOT_EARLIER/u);
    } finally {
      await r.close();
    }
  });

  it("A-N8: a stale/missing World Basis is presented as unavailable, never as current", async () => {
    const r = await fullScenario();
    try {
      const projection = await buildProjectTrajectory({
        ...r.inputs,
        work: { ...r.inputs.work, async readWorldBasis() { return null; }, async assessCurrentness() { return null; } },
      });
      // §6: with no recorded basis the world component is EMPTY — an explicit absence, not a pass.
      const a0World = projection.basisVector.world.find((entry) => entry.attemptId === r.attempts.a0)!;
      expect(a0World.availability).toBe("EMPTY");
      expect(a0World.basisDigest).toBeNull();
      // And the read model still surfaces the attempt's result from the Work owner.
      const model = buildTrajectoryReadModel(projection, []);
      expect(model.attemptsWithResults.map((entry) => entry.attemptId)).toContain(r.attempts.a0);
    } finally {
      await r.close();
    }
  });

  it("every non-established edge carries no owner evidence, in the real scenario too", async () => {
    const r = await fullScenario();
    try {
      const projection = await buildProjectTrajectory(r.inputs);
      for (const edge of projection.edges) {
        if (edge.evidenceState === "ESTABLISHED_BY_OWNER_REFERENCE") expect(edge.evidence).not.toBeNull();
        else expect(edge.evidence).toBeNull();
      }
      expect(EDGE_EVIDENCE_STATES.length).toBe(5);
    } finally {
      await r.close();
    }
  });
});
