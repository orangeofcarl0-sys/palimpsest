/**
 * Trajectory-P2-D1 §11 — ATTEMPT-BOUND MECHANICAL DELIVERY (no model).
 *
 * §11.1: the consumer identity is the Host's own attempt scope — the attempt the Context Owner is compiling —
 * never a model choice. §11.2: the qualified Capsule is materialized into that attempt's worker context
 * through the EXISTING Context boundary. §11.5: the capability is DEFAULT OFF, so a default deployment's
 * worker context is byte-identical to production.
 *
 * This test drives the REAL product machinery: a real governed A0→A1 chain, the real Context Owner
 * (`workWorkerContext`), and the real delivery wiring the install composes. It proves the correct bounded
 * material reaches the trusted Worker Context boundary — `CAPSULE_RENDERED_FOR_WORKER` — and NEVER claims
 * `MODEL_CONSUMED_CAPSULE`. No model request occurs.
 *
 * The origin's Execution Association is a CONTROLLED FIXTURE (a real durable record built through the real
 * Recorder and read through a controlled DSH reader fixture), stated explicitly.
 *
 * SAFETY. Temp SQLite; controlled ports; no DSH, no model, no network, no personal data.
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
import { normalizeEventPayload, parseNewEvent, parseTaskEnvelope } from "../src/schema/index.js";

import { FakeClock, taskSpec } from "./helpers.js";

const HEAD = "c".repeat(40);
const CLOCK = "2026-10-11T00:00:00Z";
const PROJECT = "p2d1c6";
const HEX = (seed: string): string => seed.repeat(64).slice(0, 64);
const PROMOTED = "task-a";
const REWORKED = "task-b";

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
  declared_by: "p2d1c6-spec",
  reason: "two tasks must reach VERIFYING together so one can be promoted while the other is reopened",
};

type DeliveryProvider = (input: { readonly attemptId: string }) => Promise<{ readonly capsule: unknown; readonly serializedBytes: number; readonly contentDigest: string; readonly originAttemptId: string; readonly framing: "HISTORICAL_DATA_NOT_INSTRUCTIONS"; readonly authority: "READ_ONLY_INSPECTION"; readonly schemaVersion: number } | null>;

interface Rig {
  readonly store: EventStore;
  readonly controller: ProjectController;
  readonly effects: ReturnType<typeof createPalimpsestEffects>;
  readonly a0: string;
  readonly a1: string;
  readonly deliveryHolder: { current: DeliveryProvider | undefined };
  close(): Promise<void>;
}

/** A real governed A0→A1 chain on a controller whose Context Owner reads the delivery provider through a holder. */
async function governedRig(projectId: string): Promise<Rig> {
  const dir = mkdtempSync(join(tmpdir(), `palimpsest-${projectId}-`));
  cleanups.push(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* windows keeps the directory busy; the OS reaps it */
    }
  });
  const store = new EventStore(join(dir, "p.sqlite"), { clock: new FakeClock().next });
  const git = new FakeGitPort(HEAD);
  const effects = createPalimpsestEffects({ databasePath: join(dir, "o.sqlite"), git, clock: new ManualClock().now, leaseMs: 50 });
  const policy = new TaskPolicy({
    policy_id: "trusted-default", read_paths: ["src"], allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
    network_policy: "deny", network_allowlist: [], timeout_s: 3600, lease_s: 60, attempt_limit: 3, candidate_limit: 1,
  });
  /**
   * §11.1: the delivery provider is LATE-BOUND through a holder, exactly as the install binds it. The
   * controller's Context Owner holds the read-through provider, so a binding made after construction is
   * visible to `workWorkerContext`.
   */
  const deliveryHolder: { current: DeliveryProvider | undefined } = { current: undefined };
  const controller = new ProjectController({
    store, effects, projectId, policy, clock: () => CLOCK,
    /** §11: the Context Owner derives the task half from the confirmed standard, so the rig states one. */
    standard: Object.freeze({
      statement: "tests pass and scope respected",
      clauses: Object.freeze([
        Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze(["python", "-m", "pytest"]), predicate: "tests_pass" as const }),
        Object.freeze({ kind: "scope_respected" as const }),
      ]),
      derivedFrom: Object.freeze([`${projectId} fixture`]),
      confirmed: true,
      notes: Object.freeze([]),
    }),
    trajectoryCapsuleFor: () => deliveryHolder.current,
  } as never);
  controller.start({ projectId, goal: "g", tasks: [taskSpec(PROMOTED), taskSpec(REWORKED)], stageGraph: DECLARED_GRAPH });
  controller.declareRoleTable({ roles: [{ role: "implementer", slots: 2 }], hardCap: 2, declaredBy: `${projectId}-spec` });

  const row = (taskId: string) => store.connection.prepare("SELECT last_event_id, state_json FROM tasks WHERE project_id=? AND task_id=?").get(projectId, taskId) as { last_event_id: number; state_json: Uint8Array };
  const activationOf = (taskId: string): number => Number((JSON.parse(new TextDecoder().decode(row(taskId).state_json)) as { batch_activation_event_id: number }).batch_activation_event_id);
  const readEnvelope = (taskId: string) => {
    const task = store.connection.prepare("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?").get(projectId, taskId) as { envelope_json: Uint8Array };
    return parseTaskEnvelope(JSON.parse(new TextDecoder().decode(task.envelope_json)));
  };
  const drive = async (taskId: string): Promise<string> => {
    controller.step();
    const created = controller.step()!;
    const attemptId = created.entity_id;
    await controller.claim(attemptId);
    const committed = await effects.invoke(effects.actions.gitCommit, { worktreeId: attemptId, message: "work" }, { scope: projectId, revision: controller.promotions.projectRevision(), callId: `c:${attemptId}` });
    controller.report(attemptId, { workerStatus: "completed", summary: "done", resultCommit: committed.commit });
    await controller.gate({ attemptId, predicate: "tests_pass", command: ["python", "-m", "pytest"] });
    expect(controller.step()!.event_type).toBe("TASK_VERIFYING");
    return attemptId;
  };

  const promotedAttempt = await drive(PROMOTED);
  const a0 = await drive(REWORKED);
  const resultCommit = (store.listEvents(projectId).find((event) => event.event_type === "ATTEMPT_COMPLETED" && event.entity_id === promotedAttempt)!.payload as { attempt_report: { result_commit: string } }).attempt_report.result_commit;
  await controller.promote(promotedAttempt, resultCommit, HEAD);
  expect(controller.step()!.event_type).toBe("TASK_SATISFIED");

  const activationId = activationOf(REWORKED);
  const request = parseNewEvent({
    schema_version: 1, project_id: projectId, event_type: "TASK_READY", payload_version: 1, entity_type: "task", entity_id: REWORKED,
    payload: normalizeEventPayload("TASK_READY", { previous_state: "VERIFYING", new_state: "READY", reason: "rework-admitted", batch_activation_event_id: activationId }),
    causation_id: Number(row(REWORKED).last_event_id),
    correlation_id: `task:${REWORKED}:rework`,
    idempotency_key: actionKey("task-batch-settle-v1", { project_id: projectId, task_id: REWORKED, batch_activation_event_id: activationId, target_state: "READY" }),
    expected_project_revision: 0,
  });
  const permit = ReworkAdmissionPermit.issue({
    projectId, taskId: REWORKED, originResultSubjectKind: "attempt_result", originResultSubjectRef: a0,
    originBasisDigest: HEX("a"), targetObservationDigest: HEX("b"),
    currentEnvelopeId: readEnvelope(REWORKED).envelope_id, batchActivationEventId: activationId, reason: "INCOMPATIBLE", targetFence: controller.reworkTargetFence(),
  });
  store.appendReworkReopening(request, permit, { assessmentDigest: HEX("d") });
  controller.step();
  const a1 = controller.step()!.entity_id;
  expect(a1).not.toBe(a0);

  return {
    store, controller, effects, a0, a1, deliveryHolder,
    close: async () => {
      try {
        store.close();
      } catch {
        /* already closed */
      }
      await effects.close();
    },
  };
}

/** The product delivery provider, exactly as the cluster builds it, over a controlled-fixture origin. */
async function buildDelivery(rig: Rig, projectId: string): Promise<DeliveryProvider> {
  const { composeAttributedPreview } = await import("../src/composition/attributed_preview.js");
  const { makeCapsuleAuthorization } = await import("../src/composition/execution_association.js");
  const { SqliteExecutionAssociationStore, computeTrustedSourceBasis, createExecutionAssociationRecorder, makeAssociationQualifier, registryFromSingleBasis } = await import("../src/execution_association/index.js");
  const { canonicalDigest } = await import("../src/schema/canonical.js");

  const store = new SqliteExecutionAssociationStore(":memory:");
  cleanups.push(() => store.close());
  const basis = computeTrustedSourceBasis({ adapterId: "a", workerBin: "/bin/dsh.js", nodeExecPath: "/bin/node.exe" });
  const recorder = createExecutionAssociationRecorder({ store, projectId, sourceBasis: basis, sourceKind: "FIRST_PARTY_DSH_HOST" });
  recorder.recordIdentity(Object.freeze({ hostLocalJobId: "", attemptId: rig.a0, observation: Object.freeze({ invocationId: "wpi-a0", dshSessionId: "worker-a0", reportedSessionId: "worker-a0", source: "DIRECT_CHILD_IPC_REPORT", sourceQualification: "FIRST_PARTY_DSH_QUALIFIED", directChildPid: 7 }) }));
  recorder.finalizeInvocation({ attemptId: rig.a0, invocationId: "wpi-a0", closeReason: "CHILD_EXIT_OBSERVED" });

  const qualifier = makeAssociationQualifier({
    store,
    registry: registryFromSingleBasis(basis, "FIRST_PARTY_DSH_HOST"),
    work: { readAttempt: ({ attemptId }: { readonly attemptId: string }) => {
      const record = rig.controller.attemptWorkRecord(attemptId);
      return record === null ? { ok: false as const, reason: "no canonical attempt" } : { ok: true as const, taskId: record.taskId, state: record.state, creationEventId: "ev-1" };
    } },
    dsh: { async readHeaderIdentity(sessionId: string) { return { readState: "READ_OK" as const, header: { sessionId, version: 4, createdAt: 1, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null }, detail: "fixture" }; } },
  });
  const service = composeAttributedPreview({
    projectId,
    controller: rig.controller as never,
    promotions: rig.controller.promotions as never,
    qualifier,
    store,
    sessionReader: {
      sourceIdentity: "fixture", evidenceClass: "DSH_QUERY_PORT_FIXTURE",
      async readEvents(request: { readonly sessionId: string }) {
        return { schemaVersion: 1, readState: "READ_OK" as const, sessionId: request.sessionId, header: null, sourceIdentity: "fixture", sourceEvidenceClass: "DSH_QUERY_PORT_FIXTURE" as const, throughSeq: 2, knownEventCount: 3, inheritedEventCount: 0, requestedFromSeq: 0, requestedMaxEvents: 50, returnedCount: 3, pageBounded: true, diskIoBounded: true, durabilityProvenance: "PERSISTED_AND_SYNTHETIC_SEPARATED" as const, persistedEventCount: 3, syntheticRecoveryEventCount: 0, events: Array.from({ length: 3 }, (_, index) => ({ sessionId: request.sessionId, seq: index, type: "turn/start", inherited: false, durability: "PERSISTED_DSH_EVENT", time: index, surface: null, summary: `historical step ${String(index)}`, durationMs: null, observedStatus: null })), knownParentSession: null, proves: [], doesNotProve: [], detail: "fixture" } as never;
      },
    } as never,
    capsuleAuthorization: makeCapsuleAuthorization({ projectId, store: rig.store, controller: rig.controller, contextService: rig.controller.context }),
    projectEvolutionOf: async () => ({ projectionRootId: null, projectionSemanticDigest: null, workSequence: null, workEventDigest: null, projectIrRevision: null, selectedRelations: [], quarantinedRelations: [], unresolvedReferences: [], currentnessCaveats: [], basisCompleteness: null, failureOrigin: null, failureKind: null }) as never,
  });

  // The EXACT provider shape the cluster composes (§11).
  return async (input: { readonly attemptId: string }) => {
    const result = await service.capsuleForConsumer({ consumerAttemptId: input.attemptId });
    if (result.state !== "AUTHORIZED" || result.capsule === null) return null;
    return Object.freeze({
      schemaVersion: result.capsule.schemaVersion,
      capsule: result.capsule,
      serializedBytes: Buffer.byteLength(JSON.stringify(result.capsule), "utf8"),
      contentDigest: canonicalDigest(result.capsule),
      originAttemptId: result.capsule.originAttemptId,
      framing: "HISTORICAL_DATA_NOT_INSTRUCTIONS" as const,
      authority: "READ_ONLY_INSPECTION" as const,
    });
  };
}

/* ================================================================== §11.5 default OFF */

describe("P2D1 §11.5 — the experimental delivery is DEFAULT OFF", () => {
  it("57. with no provider bound, the worker context carries NO Capsule", async () => {
    const rig = await governedRig("p2d1c6-off");
    try {
      const context = await rig.controller.context.workWorkerContext(rig.a1);
      expect(context.compiled.trajectoryCapsule).toBeUndefined();
      // The ordinary compiled half is present.
      expect(context.compiled.manifestId).toBeTruthy();
    } finally {
      await rig.close();
    }
  });
});

/* ================================================================== §11.1/§11.2 delivery ON */

describe("P2D1 §11.1/§11.2 — the Attempt-bound Capsule reaches the Worker Context boundary", () => {
  it("52/53/54/56. the correct consumer receives the bounded read-only Capsule before any model turn", async () => {
    const rig = await governedRig("p2d1c6-on");
    try {
      const delivery = await buildDelivery(rig, "p2d1c6-on");
      rig.deliveryHolder.current = delivery;

      // 52: the consumer identity is the attempt being COMPILED — the Host's own scope.
      const context = await rig.controller.context.workWorkerContext(rig.a1);
      const capsule = context.compiled.trajectoryCapsule;
      expect(capsule).toBeDefined();
      expect(capsule!.originAttemptId).toBe(rig.a0);
      expect(capsule!.framing).toBe("HISTORICAL_DATA_NOT_INSTRUCTIONS");
      expect(capsule!.authority).toBe("READ_ONLY_INSPECTION");
      // 54: only the ALLOWED origin is materialized, and the material is bounded with a digest.
      expect(capsule!.serializedBytes).toBeGreaterThan(0);
      expect(capsule!.serializedBytes).toBeLessThanOrEqual(16_384);
      expect(capsule!.contentDigest).toMatch(/^[0-9a-f]{64}$/u);
      const inner = capsule!.capsule as { readonly consumerAttemptId: string; readonly historicalExecution: { readonly events: readonly unknown[] } };
      expect(inner.consumerAttemptId).toBe(rig.a1);
      expect(inner.historicalExecution.events.length).toBeGreaterThan(0);
    } finally {
      await rig.close();
    }
  });

  it("53. the WRONG consumer does not receive A0's Capsule, and A0 itself is not authorized", async () => {
    const rig = await governedRig("p2d1c6-wrong");
    try {
      const delivery = await buildDelivery(rig, "p2d1c6-wrong");
      rig.deliveryHolder.current = delivery;

      // A1 receives its permitted Capsule.
      const forA1 = await delivery({ attemptId: rig.a1 });
      expect(forA1).not.toBeNull();
      // A0 has no lineage, so compiling A0's worker context delivers NOTHING.
      const a0Context = await rig.controller.context.workWorkerContext(rig.a0);
      expect(a0Context.compiled.trajectoryCapsule).toBeUndefined();
      // And the provider returns null for A0 directly.
      expect(await delivery({ attemptId: rig.a0 })).toBeNull();
    } finally {
      await rig.close();
    }
  });

  it("55. a forged / unknown attempt id resolves to no delivery, never a fabricated Capsule", async () => {
    const rig = await governedRig("p2d1c6-forged");
    try {
      const delivery = await buildDelivery(rig, "p2d1c6-forged");
      rig.deliveryHolder.current = delivery;
      expect(await delivery({ attemptId: `attempt-${"f".repeat(32)}` })).toBeNull();
    } finally {
      await rig.close();
    }
  });
});
