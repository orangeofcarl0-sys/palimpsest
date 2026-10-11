/**
 * Trajectory-V0S-H0 §6.4 (C2) — ROLE-SPECIFIC ATTEMPT RELATION ADMISSION.
 *
 * Positive and negative coverage for the four Attempt-scoped Work relations, over the REAL canonical
 * Work stack (controller, EventStore, promotion, governed reopening) plus controlled projection
 * fixtures for the shapes the product workflow cannot produce on demand.
 *
 * The governing property (H0 §15):
 *
 *     an Attempt-scoped consumer must admit exactly the relations justified by canonical source
 *     evidence — neither fewer, by losing genuine cross-entity relations, nor more, by accepting
 *     unrelated or shared-endpoint evidence.
 *
 * Every legitimate relation is asserted to remain VISIBLE in the correct Attempt's Preview; no
 * negative test is satisfied by suppressing relations globally.
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
import { composeTrajectoryInputs } from "../src/composition/trajectory.js";
import { buildProjectTrajectory } from "../src/trajectory/projection.js";
import {
  makeOwnerReference,
  makeTrajectoryNode,
  selectAttemptWorkRelations,
  type AttemptRelationContext,
  type TrajectoryEdge,
  type TrajectoryProjection,
} from "../src/trajectory/index.js";
import { FakeClock, taskSpec } from "./helpers.js";

const HEAD = "c".repeat(40);
const CLOCK = "2026-10-12T00:00:00Z";
const PROJECT = "h0b";
const HEX = (seed: string): string => seed.repeat(64).slice(0, 64);
const ATTEMPT_A = `attempt-${"a".repeat(32)}`;
const ATTEMPT_B = `attempt-${"b".repeat(32)}`;

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

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
  declared_by: "h0b-spec",
  reason: "two tasks must reach VERIFYING together so one can be promoted while the other is reopened",
};

const PROMOTED = "task-a";
const REWORKED = "task-b";

interface Rig {
  readonly store: EventStore;
  readonly controller: ProjectController;
  readonly inputs: ReturnType<typeof composeTrajectoryInputs>;
  readonly attempts: { a0: string; a1: string | null; promoted: string };
  events(): ReturnType<EventStore["listEvents"]>;
  drive(taskId: string): Promise<string>;
  reopen(taskId: string, originAttemptId: string): void;
  close(): Promise<void>;
}

async function rig(): Promise<Rig> {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-h0b-"));
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
  controller.declareRoleTable({ roles: [{ role: "implementer", slots: 2 }], hardCap: 2, declaredBy: "h0b-spec" });

  const row = (taskId: string): { last_event_id: number; state_json: Uint8Array } =>
    store.connection.prepare("SELECT last_event_id, state_json FROM tasks WHERE project_id=? AND task_id=?").get(PROJECT, taskId) as {
      last_event_id: number;
      state_json: Uint8Array;
    };
  const activationOf = (taskId: string): number => {
    const anchor = JSON.parse(new TextDecoder().decode(row(taskId).state_json)) as { batch_activation_event_id?: number };
    if (anchor.batch_activation_event_id === undefined) throw new Error(`${taskId} has no batch anchor`);
    return Number(anchor.batch_activation_event_id);
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
    const request = {
      schema_version: 1,
      project_id: PROJECT,
      event_type: "TASK_READY",
      payload_version: 1,
      entity_type: "task",
      entity_id: taskId,
      payload: { previous_state: "VERIFYING", new_state: "READY", reason: "rework-admitted", batch_activation_event_id: activationId },
      causation_id: Number(row(taskId).last_event_id),
      correlation_id: `task:${taskId}:rework`,
      idempotency_key: actionKey("task-batch-settle-v1", { project_id: PROJECT, task_id: taskId, batch_activation_event_id: activationId, target_state: "READY" }),
      expected_project_revision: 0,
    };
    const envelope = JSON.parse(
      new TextDecoder().decode((store.connection.prepare("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?").get(PROJECT, taskId) as { envelope_json: Uint8Array }).envelope_json),
    ) as { envelope_id: string };
    const permit = ReworkAdmissionPermit.issue({
      projectId: PROJECT, taskId,
      originResultSubjectKind: "attempt_result", originResultSubjectRef: originAttemptId,
      originBasisDigest: HEX("a"), targetObservationDigest: HEX("b"),
      currentEnvelopeId: envelope.envelope_id, batchActivationEventId: activationId,
      reason: "INCOMPATIBLE", targetFence: controller.reworkTargetFence(),
    });
    store.appendReworkReopening(request as never, permit, { assessmentDigest: HEX("d") });
  };

  const inputs = composeTrajectoryInputs({
    projectId: PROJECT, controller, promotions: controller.promotions,
    reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
  });

  return {
    store, controller, inputs, attempts,
    events: () => store.listEvents(PROJECT),
    drive, reopen,
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

/** The full real scenario: A0 → result → promotion → governed reopening of a SIBLING → E1 → A1. */
async function fullScenario(): Promise<Rig> {
  const r = await rig();
  r.attempts.promoted = await r.drive(PROMOTED);
  r.attempts.a0 = await r.drive(REWORKED);
  const resultCommit = (
    r.store.listEvents(PROJECT).find((event) => event.event_type === "ATTEMPT_COMPLETED" && event.entity_id === r.attempts.promoted)!.payload as {
      attempt_report: { result_commit: string };
    }
  ).attempt_report.result_commit;
  await r.controller.promote(r.attempts.promoted, resultCommit, HEAD);
  expect(r.controller.step()!.event_type).toBe("TASK_SATISFIED");
  r.reopen(REWORKED, r.attempts.a0);
  r.controller.step();
  const created = r.controller.step()!;
  expect(created.event_type).toBe("ATTEMPT_CREATED");
  r.attempts.a1 = created.entity_id;
  return r;
}

/** §6.3: the real relation context, built exactly as the composition adapter builds it. */
function relationContext(
  events: readonly { event_type: string; entity_type: string; entity_id: string; event_id: number; payload?: unknown }[],
  attemptId: string,
): AttemptRelationContext {
  const attemptEvents = events.filter((event) => event.entity_type === "attempt" && event.entity_id === attemptId);
  const created = events.find((event) => event.event_type === "ATTEMPT_CREATED" && event.entity_id === attemptId);
  const terminalEvents = attemptEvents.filter((event) => event.event_type === "ATTEMPT_COMPLETED" || event.event_type === "ATTEMPT_FAILED");
  const completed = terminalEvents.find((event) => event.event_type === "ATTEMPT_COMPLETED") ?? null;
  const envelopeId = created === undefined ? null : ((created.payload as { envelope_id?: unknown } | undefined)?.envelope_id ?? null);
  const authorization =
    typeof envelopeId === "string"
      ? events.find((event) => {
          if (event.event_type !== "TASK_CREATED" && event.event_type !== "TASK_REAUTHORIZED") return false;
          const envelope = (event.payload as { task_envelope?: { envelope_id?: unknown } } | undefined)?.task_envelope;
          return envelope?.envelope_id === envelopeId;
        })
      : undefined;
  const canonicalEventIds = new Set<string>(attemptEvents.map((event) => String(event.event_id)));
  if (created !== undefined) canonicalEventIds.add(String(created.event_id));
  for (const event of terminalEvents) canonicalEventIds.add(String(event.event_id));
  if (authorization !== undefined) canonicalEventIds.add(String(authorization.event_id));
  return {
    projectId: PROJECT, attemptId,
    creationEventId: created === undefined ? null : String(created.event_id),
    authorizationEventId: authorization === undefined ? null : String(authorization.event_id),
    authorizationEnvelopeId: typeof envelopeId === "string" ? envelopeId : null,
    terminalEventIds: terminalEvents.map((event) => String(event.event_id)),
    completedEventId: completed === null ? null : String(completed.event_id),
    canonicalEventIds,
  };
}

/* ------------------------------------------------------------------ *
 * Controlled projection fixtures (source-grounded shapes)
 * ------------------------------------------------------------------ */

function workNode(canonicalId: string, sequence: number, label: string) {
  return makeTrajectoryNode({
    reference: makeOwnerReference({ ownerPlane: "WORK", ownerScope: PROJECT, canonicalId, sourceSequence: sequence, sourceDigest: HEX(canonicalId.slice(-1)), projectId: PROJECT, verification: "VERIFIED_AGAINST_OWNER", verificationDetail: "fixture" }),
    authenticity: "OWNER_RECORDED", epistemicStatus: "RECORDED", currentness: "CURRENT", completeness: "COMPLETE", label,
  });
}

function projectionOf(nodes: readonly ReturnType<typeof workNode>[], edges: readonly TrajectoryEdge[]): TrajectoryProjection {
  return {
    schemaVersion: 1, rootId: "tr-fixture", projectId: PROJECT,
    basisVector: { completeness: "COMPLETE", work: { projectSequence: 99, eventDigest: HEX("9"), projectIrRevision: 0 }, reasoning: [], proof: null, journal: [], world: [], unavailable: [] } as never,
    nodes, edges,
    sourceCoverage: [], unresolved: [], conflicts: [], currentness: [], asOf: null,
    hostObservationAdmission: "NOT_APPLICABLE", semanticDigest: HEX("8"), readOnly: true,
  };
}

/* ================================================================== POSITIVE: real owners */

describe("H0 §6.4 positive — genuine relations remain visible (real canonical Work)", () => {
  it("real Authorization, Result, Promotion and Governed Rework are all admitted for their own Attempt", async () => {
    const r = await fullScenario();
    try {
      const projection = await buildProjectTrajectory(r.inputs);

      /** The promoted attempt: authorization + result + promotion. */
      const promoted = selectAttemptWorkRelations(projection, relationContext(r.events(), r.attempts.promoted));
      const promotedRelations = promoted.selected.map((relation) => relation.relation);
      expect(promotedRelations).toContain("TASK_AUTHORIZED_ATTEMPT");
      expect(promotedRelations).toContain("ATTEMPT_PRODUCED_RESULT");
      expect(promotedRelations).toContain("RESULT_PROMOTED");
      for (const relation of promoted.selected) expect(relation.evidenceState).toBe("ESTABLISHED_BY_OWNER_REFERENCE");

      /** A0: authorization + result + the governed reopening that cites A0's result. */
      const a0 = selectAttemptWorkRelations(projection, relationContext(r.events(), r.attempts.a0));
      const a0Relations = a0.selected.map((relation) => relation.relation);
      expect(a0Relations).toContain("TASK_AUTHORIZED_ATTEMPT");
      expect(a0Relations).toContain("ATTEMPT_PRODUCED_RESULT");
      expect(a0Relations).toContain("ATTEMPT_REOPENED_FOR_REWORK");

      /** A1: its OWN authorization — and NOT A0's. */
      const a1 = selectAttemptWorkRelations(projection, relationContext(r.events(), r.attempts.a1!));
      expect(a1.selected.map((relation) => relation.relation)).toContain("TASK_AUTHORIZED_ATTEMPT");
      expect(a1.selected.map((relation) => relation.relation)).not.toContain("ATTEMPT_REOPENED_FOR_REWORK");
    } finally {
      await r.close();
    }
  }, 60_000);
});

/* ================================================================== NEGATIVE: role violations */

describe("H0 §6.4 negative — role violations are excluded with a reason", () => {
  const context: AttemptRelationContext = {
    projectId: PROJECT, attemptId: ATTEMPT_A,
    creationEventId: "20", authorizationEventId: "10", authorizationEnvelopeId: "env-a",
    terminalEventIds: ["30"], completedEventId: "30",
    canonicalEventIds: new Set(["20", "30", "10"]),
  };

  it("shared authorization, wrong Attempt: the OTHER Attempt's relation is not admitted", () => {
    const auth = workNode("10", 1, "TASK_CREATED task-a");
    const aCreated = workNode("20", 2, `ATTEMPT_CREATED ${ATTEMPT_A}`);
    const bCreated = workNode("21", 3, `ATTEMPT_CREATED ${ATTEMPT_B}`);
    const edge = (to: ReturnType<typeof workNode>): TrajectoryEdge => ({
      schemaVersion: 1, relation: "TASK_AUTHORIZED_ATTEMPT", fromNodeId: auth.nodeId, toNodeId: to.nodeId,
      evidenceState: "ESTABLISHED_BY_OWNER_REFERENCE",
      evidence: { byReference: auth.reference, carryingField: "ATTEMPT_CREATED.payload.envelope_id", compared: { envelopeId: "env-a" } },
      detail: "authorized by TASK_CREATED at event_id 10",
    });
    const result = selectAttemptWorkRelations(projectionOf([auth, aCreated, bCreated], [edge(aCreated), edge(bCreated)]), context);
    expect(result.selected.filter((relation) => relation.relation === "TASK_AUTHORIZED_ATTEMPT").length).toBe(1);
    expect(result.quarantined.some((relation) => relation.reason.includes("destination is not this attempt's creation event"))).toBe(true);
  });

  it("correct relation type but wrong destination: excluded", () => {
    const created = workNode("20", 1, `ATTEMPT_CREATED ${ATTEMPT_A}`);
    const otherTerminal = workNode("99", 2, `ATTEMPT_COMPLETED ${ATTEMPT_B}`);
    const edge: TrajectoryEdge = {
      schemaVersion: 1, relation: "ATTEMPT_PRODUCED_RESULT", fromNodeId: created.nodeId, toNodeId: otherTerminal.nodeId,
      evidenceState: "ESTABLISHED_BY_OWNER_REFERENCE",
      evidence: { byReference: otherTerminal.reference, carryingField: "ATTEMPT_COMPLETED.payload.attempt_report.attempt_id", compared: { attemptId: ATTEMPT_B } },
      detail: "another attempt's result",
    };
    const result = selectAttemptWorkRelations(projectionOf([created, otherTerminal], [edge]), context);
    expect(result.selected.length).toBe(0);
    expect(result.quarantined.some((relation) => relation.reason.includes("not this attempt's terminal result event"))).toBe(true);
  });

  it("a promotion naming ANOTHER attempt is excluded even though its source is this attempt's result", () => {
    const completed = workNode("30", 1, `ATTEMPT_COMPLETED ${ATTEMPT_A}`);
    const promotion = workNode("40", 2, "PROMOTION_COMMITTED promo-1");
    const edge: TrajectoryEdge = {
      schemaVersion: 1, relation: "RESULT_PROMOTED", fromNodeId: completed.nodeId, toNodeId: promotion.nodeId,
      evidenceState: "ESTABLISHED_BY_OWNER_REFERENCE",
      evidence: { byReference: promotion.reference, carryingField: "PROMOTION_COMMITTED.payload.attempt_id", compared: { attemptId: ATTEMPT_B, promotionId: "promo-1" } },
      detail: "promotes another attempt",
    };
    const result = selectAttemptWorkRelations(projectionOf([completed, promotion], [edge]), context);
    expect(result.selected.length).toBe(0);
    expect(result.quarantined.some((relation) => relation.reason.includes(`names attempt ${ATTEMPT_B}`))).toBe(true);
  });

  it("a reopening citing ANOTHER attempt's result is excluded", () => {
    const completed = workNode("30", 1, `ATTEMPT_COMPLETED ${ATTEMPT_A}`);
    const ready = workNode("50", 2, "TASK_READY task-b");
    const edge: TrajectoryEdge = {
      schemaVersion: 1, relation: "ATTEMPT_REOPENED_FOR_REWORK", fromNodeId: completed.nodeId, toNodeId: ready.nodeId,
      evidenceState: "ESTABLISHED_BY_OWNER_REFERENCE",
      evidence: { byReference: ready.reference, carryingField: "TASK_READY.payload.rework_provenance.origin_result_subject.ref", compared: { originRef: ATTEMPT_B, taskId: "task-b" } },
      detail: "reopens against another attempt",
    };
    const result = selectAttemptWorkRelations(projectionOf([completed, ready], [edge]), context);
    expect(result.selected.length).toBe(0);
    expect(result.quarantined.some((relation) => relation.reason.includes(`origin result ${ATTEMPT_B}`))).toBe(true);
  });

  it("evidence from another project is excluded", () => {
    const auth = workNode("10", 1, "TASK_CREATED task-a");
    const created = workNode("20", 2, `ATTEMPT_CREATED ${ATTEMPT_A}`);
    const foreignReference = makeOwnerReference({ ownerPlane: "WORK", ownerScope: "other-project", canonicalId: "10", sourceSequence: 1, sourceDigest: HEX("1"), projectId: "other-project", verification: "VERIFIED_AGAINST_OWNER", verificationDetail: "fixture" });
    const edge: TrajectoryEdge = {
      schemaVersion: 1, relation: "TASK_AUTHORIZED_ATTEMPT", fromNodeId: auth.nodeId, toNodeId: created.nodeId,
      evidenceState: "ESTABLISHED_BY_OWNER_REFERENCE",
      evidence: { byReference: foreignReference, carryingField: "ATTEMPT_CREATED.payload.envelope_id", compared: { envelopeId: "env-a" } },
      detail: "a foreign authorization",
    };
    const result = selectAttemptWorkRelations(projectionOf([auth, created], [edge]), context);
    expect(result.selected.length).toBe(0);
    expect(result.quarantined.some((relation) => relation.reason.includes("belongs to project other-project"))).toBe(true);
  });

  it("a missing evidence carrier is excluded", () => {
    const created = workNode("20", 1, `ATTEMPT_CREATED ${ATTEMPT_A}`);
    const auth = workNode("10", 2, "TASK_CREATED task-a");
    const edge: TrajectoryEdge = {
      schemaVersion: 1, relation: "TASK_AUTHORIZED_ATTEMPT", fromNodeId: auth.nodeId, toNodeId: created.nodeId,
      evidenceState: "ESTABLISHED_BY_OWNER_REFERENCE", evidence: null, detail: "no evidence",
    };
    const result = selectAttemptWorkRelations(projectionOf([auth, created], [edge]), context);
    expect(result.selected.length).toBe(0);
  });

  it("DECLARED_ONLY, TEMPORAL_ONLY, UNRESOLVED_SOURCE and CONFLICTING_SOURCE are all excluded", () => {
    for (const state of ["DECLARED_ONLY", "TEMPORAL_ONLY", "UNRESOLVED_SOURCE", "CONFLICTING_SOURCE"] as const) {
      const auth = workNode("10", 1, "TASK_CREATED task-a");
      const created = workNode("20", 2, `ATTEMPT_CREATED ${ATTEMPT_A}`);
      const edge: TrajectoryEdge = {
        schemaVersion: 1, relation: "TASK_AUTHORIZED_ATTEMPT", fromNodeId: auth.nodeId, toNodeId: created.nodeId,
        evidenceState: state, evidence: null, detail: `an ${state} edge`,
      };
      const result = selectAttemptWorkRelations(projectionOf([auth, created], [edge]), context);
      expect(result.selected.length, `state ${state} must not be admitted`).toBe(0);
      expect(result.quarantined.length).toBeGreaterThan(0);
    }
  });

  it("label-only identity agreement cannot admit a relation", () => {
    /** The label CONTAINS the attempt id, but the canonical id is a different entity's event. */
    const auth = workNode("10", 1, `TASK_CREATED ${ATTEMPT_A}`);
    const foreign = workNode("77", 2, `ATTEMPT_CREATED ${ATTEMPT_A}`);
    const edge: TrajectoryEdge = {
      schemaVersion: 1, relation: "TASK_AUTHORIZED_ATTEMPT", fromNodeId: auth.nodeId, toNodeId: foreign.nodeId,
      evidenceState: "ESTABLISHED_BY_OWNER_REFERENCE",
      evidence: { byReference: auth.reference, carryingField: "ATTEMPT_CREATED.payload.envelope_id", compared: { envelopeId: "env-a" } },
      detail: "a label match on a foreign node",
    };
    const result = selectAttemptWorkRelations(projectionOf([auth, foreign], [edge]), context);
    expect(result.selected.length).toBe(0);
  });

  it("a legitimate relation for Attempt B is not selected through Attempt A", async () => {
    const r = await fullScenario();
    try {
      const projection = await buildProjectTrajectory(r.inputs);
      /** Ask for the promoted attempt, and confirm A0's rework does NOT appear. */
      const promoted = selectAttemptWorkRelations(projection, relationContext(r.events(), r.attempts.promoted));
      expect(promoted.selected.map((relation) => relation.relation)).not.toContain("ATTEMPT_REOPENED_FOR_REWORK");
      /** And ask for A0, confirming the promoted attempt's promotion does NOT appear. */
      const a0 = selectAttemptWorkRelations(projection, relationContext(r.events(), r.attempts.a0));
      expect(a0.selected.map((relation) => relation.relation)).not.toContain("RESULT_PROMOTED");
    } finally {
      await r.close();
    }
  }, 60_000);
});

/* ================================================================== QUARANTINE scoping */

describe("H0 §6.2 — quarantine is scoped to the requested Attempt", () => {
  it("an unrelated unresolved relation is not reported as this Attempt's fact", () => {
    const auth = workNode("10", 1, "TASK_CREATED task-a");
    const created = workNode("20", 2, `ATTEMPT_CREATED ${ATTEMPT_A}`);
    /** A ground relation between two UNRELATED nodes, with T0's known-incomplete verifier. */
    const unrelatedFrom = workNode("80", 3, "PROJECT_REVISED rev-1");
    const unrelatedTo = workNode("81", 4, "RECEIPT_ACCEPTED receipt-1");
    const unrelated: TrajectoryEdge = {
      schemaVersion: 1, relation: "RECEIPT_REFERENCED_GROUND", fromNodeId: unrelatedFrom.nodeId, toNodeId: unrelatedTo.nodeId,
      evidenceState: "ESTABLISHED_BY_OWNER_REFERENCE",
      evidence: { byReference: unrelatedFrom.reference, carryingField: "x", compared: {} },
      detail: "an unrelated ground relation",
    };
    const result = selectAttemptWorkRelations(projectionOf([auth, created, unrelatedFrom, unrelatedTo], [unrelated]), {
      projectId: PROJECT, attemptId: ATTEMPT_A,
      creationEventId: "20", authorizationEventId: "10", authorizationEnvelopeId: "env-a",
      terminalEventIds: [], completedEventId: null,
      canonicalEventIds: new Set(["20", "10"]),
    });
    // §6.2: it does not concern this attempt, so it is not reported as its unresolved fact.
    expect(result.quarantined.filter((relation) => relation.relation === "RECEIPT_REFERENCED_GROUND").length).toBe(0);
  });

  it("a known-incomplete relation that DOES concern this Attempt is quarantined", () => {
    const created = workNode("20", 1, `ATTEMPT_CREATED ${ATTEMPT_A}`);
    const revised = workNode("80", 2, "PROJECT_REVISED rev-1");
    const edge: TrajectoryEdge = {
      schemaVersion: 1, relation: "REVISION_SUCCEEDED_REVISION", fromNodeId: created.nodeId, toNodeId: revised.nodeId,
      evidenceState: "ESTABLISHED_BY_OWNER_REFERENCE",
      evidence: { byReference: created.reference, carryingField: "x", compared: {} },
      detail: "a revision relation touching this attempt",
    };
    const result = selectAttemptWorkRelations(projectionOf([created, revised], [edge]), {
      projectId: PROJECT, attemptId: ATTEMPT_A,
      creationEventId: "20", authorizationEventId: null, authorizationEnvelopeId: null,
      terminalEventIds: [], completedEventId: null,
      canonicalEventIds: new Set(["20"]),
    });
    expect(result.selected.length).toBe(0);
    expect(result.quarantined.some((relation) => relation.relation === "REVISION_SUCCEEDED_REVISION")).toBe(true);
  });
});
