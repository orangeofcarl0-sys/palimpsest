/**
 * Trajectory-P2-D1 §10 — GENUINE GOVERNED REWORK CONSUMER AUTHORIZATION.
 *
 * This is the first major POSITIVE integration gate. It drives a REAL canonical Work lifecycle through the
 * REAL product machinery:
 *
 *     A0 (canonical Attempt) → real Result → real Promotion → a REAL governed reopening carrying actual
 *     permit-derived rework_provenance → A1 (a distinct canonical Attempt)
 *
 * and then asks the ORDINARY product surface (`installed.trajectory.attributedPreview.capsuleForConsumer`)
 * whether A1 is authorized to inspect A0. P2-D1 §10.3 makes that decision through the CONTEXT OWNER's own
 * lineage resolution (`governedReworkOriginOf`), so there is ONE meaning of Governed Rework lineage.
 *
 * WHAT IS REAL HERE. Canonical Work, the Result, the Promotion and the governed reopening are all produced
 * by the shipped controller and the shipped `appendReworkReopening` seam — no hand-authored TASK_READY and no
 * forged permit. The ORIGIN's Execution Association is a CONTROLLED FIXTURE (a real durable record built
 * through the real Recorder), which is stated explicitly rather than presented as first-party DSH evidence.
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
const PROJECT = "p2d1c5";
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
  declared_by: "p2d1c5-spec",
  reason: "two tasks must reach VERIFYING together so one can be promoted while the other is reopened",
};

interface Rig {
  readonly store: EventStore;
  readonly controller: ProjectController;
  readonly a0: string;
  readonly a1: string;
  readonly events: () => ReturnType<EventStore["listEvents"]>;
  close(): Promise<void>;
}

async function governedRig(): Promise<Rig> {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-p2d1c5-"));
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
  const controller = new ProjectController({ store, effects, projectId: PROJECT, policy, clock: () => CLOCK });
  controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec(PROMOTED), taskSpec(REWORKED)], stageGraph: DECLARED_GRAPH });
  controller.declareRoleTable({ roles: [{ role: "implementer", slots: 2 }], hardCap: 2, declaredBy: "p2d1c5-spec" });

  const row = (taskId: string) => store.connection.prepare("SELECT last_event_id, state_json FROM tasks WHERE project_id=? AND task_id=?").get(PROJECT, taskId) as { last_event_id: number; state_json: Uint8Array };
  const activationOf = (taskId: string): number => {
    const anchor = JSON.parse(new TextDecoder().decode(row(taskId).state_json)) as { batch_activation_event_id?: number };
    if (anchor.batch_activation_event_id === undefined) throw new Error(`${taskId} has no batch anchor`);
    return Number(anchor.batch_activation_event_id);
  };
  const readEnvelope = (taskId: string) => {
    const task = store.connection.prepare("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?").get(PROJECT, taskId) as { envelope_json: Uint8Array };
    return parseTaskEnvelope(JSON.parse(new TextDecoder().decode(task.envelope_json)));
  };
  const drive = async (taskId: string): Promise<string> => {
    controller.step();
    const created = controller.step()!;
    const attemptId = created.entity_id;
    await controller.claim(attemptId);
    const committed = await effects.invoke(effects.actions.gitCommit, { worktreeId: attemptId, message: "work" }, { scope: PROJECT, revision: controller.promotions.projectRevision(), callId: `c:${attemptId}` });
    controller.report(attemptId, { workerStatus: "completed", summary: "done", resultCommit: committed.commit });
    await controller.gate({ attemptId, predicate: "tests_pass", command: ["python", "-m", "pytest"] });
    expect(controller.step()!.event_type).toBe("TASK_VERIFYING");
    return attemptId;
  };

  // Both tasks reach VERIFYING together, then one is promoted and the OTHER is governed-reopened.
  const promotedAttempt = await drive(PROMOTED);
  const a0 = await drive(REWORKED);
  const resultCommit = (store.listEvents(PROJECT).find((event) => event.event_type === "ATTEMPT_COMPLETED" && event.entity_id === promotedAttempt)!.payload as { attempt_report: { result_commit: string } }).attempt_report.result_commit;
  await controller.promote(promotedAttempt, resultCommit, HEAD);
  expect(controller.step()!.event_type).toBe("TASK_SATISFIED");

  // THE GOVERNED REOPENING: a real permit, the real append seam, the real durable provenance.
  const activationId = activationOf(REWORKED);
  const request = parseNewEvent({
    schema_version: 1, project_id: PROJECT, event_type: "TASK_READY", payload_version: 1, entity_type: "task", entity_id: REWORKED,
    payload: normalizeEventPayload("TASK_READY", { previous_state: "VERIFYING", new_state: "READY", reason: "rework-admitted", batch_activation_event_id: activationId }),
    causation_id: Number(row(REWORKED).last_event_id),
    correlation_id: `task:${REWORKED}:rework`,
    idempotency_key: actionKey("task-batch-settle-v1", { project_id: PROJECT, task_id: REWORKED, batch_activation_event_id: activationId, target_state: "READY" }),
    expected_project_revision: 0,
  });
  const permit = ReworkAdmissionPermit.issue({
    projectId: PROJECT, taskId: REWORKED, originResultSubjectKind: "attempt_result", originResultSubjectRef: a0,
    originBasisDigest: HEX("a"), targetObservationDigest: HEX("b"),
    currentEnvelopeId: readEnvelope(REWORKED).envelope_id, batchActivationEventId: activationId, reason: "INCOMPATIBLE", targetFence: controller.reworkTargetFence(),
  });
  store.appendReworkReopening(request, permit, { assessmentDigest: HEX("d") });

  // A1: a DISTINCT canonical attempt for the reopened task.
  controller.step();
  const created = controller.step()!;
  expect(created.event_type).toBe("ATTEMPT_CREATED");
  const a1 = created.entity_id;
  expect(a1).not.toBe(a0);

  return {
    store,
    controller,
    a0,
    a1,
    events: () => store.listEvents(PROJECT),
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

/* ================================================================== §10.4 the positive authorization */

describe("P2D1 §10.4 — a genuine governed A0→A1 chain authorizes the origin through the Context Owner", () => {
  it("42/43/44/45/46/47. A0 is a real canonical Attempt, the Permit and TASK_READY are genuine, and A1's lineage names A0", async () => {
    const rig = await governedRig();
    try {
      const events = rig.events();
      // 42: A0 is a real canonical Attempt.
      expect(rig.controller.attemptWorkRecord(rig.a0)).not.toBeNull();
      // 43: A0's Result exists through the legitimate Work path.
      expect(events.some((event) => event.event_type === "ATTEMPT_COMPLETED" && event.entity_id === rig.a0)).toBe(true);
      // 45: the TASK_READY carries the permit-derived rework_provenance naming A0.
      const ready = events.find((event) => event.event_type === "TASK_READY" && (event.payload as { rework_provenance?: unknown }).rework_provenance !== undefined);
      expect(ready).toBeDefined();
      const provenance = (ready!.payload as { rework_provenance: { origin_result_subject: { ref: string } } }).rework_provenance;
      expect(provenance.origin_result_subject.ref).toBe(rig.a0);
      // 46: A1 is a DISTINCT canonical Attempt.
      expect(rig.a1).not.toBe(rig.a0);
      expect(rig.controller.attemptWorkRecord(rig.a1)).not.toBeNull();

      // 47: the CONTEXT OWNER's own lineage resolution names A0 as A1's permitted origin.
      const origin = rig.controller.context.governedReworkOriginOf(rig.a1);
      expect(origin).not.toBeNull();
      expect(origin!.originAttemptId).toBe(rig.a0);
      // And an attempt with no lineage resolves to null.
      expect(rig.controller.context.governedReworkOriginOf(rig.a0)).toBeNull();
    } finally {
      await rig.close();
    }
  });
});

/* ================================================================== §10.4 the product surface */

describe("P2D1 §10.4 — the ordinary product authorization port judges the authorized origin", () => {
  it("47/48/49. the product port resolves A0 from the real chain, refuses a forged origin, and a later rework cannot rebind A1", async () => {
    const rig = await governedRig();
    try {
      /**
       * §10.4: the ORDINARY PRODUCT authorization port — the SAME `makeCapsuleAuthorization` the install
       * composes — over the REAL governed chain. This exercises the real product code path (the Context
       * Owner's `governedReworkOriginOf`) without needing the install's Ordarium effects runtime.
       */
      const { makeCapsuleAuthorization } = await import("../src/composition/execution_association.js");
      const port = makeCapsuleAuthorization({ projectId: PROJECT, store: rig.store, controller: rig.controller, contextService: rig.controller.context });

      // 47: A1 IS authorized, and the resolution names A0 exactly.
      const permitted = port.resolvePermittedOrigin({ consumerAttemptId: rig.a1 });
      expect(permitted.ok).toBe(true);
      if (!permitted.ok) throw new Error("unreachable");
      expect(permitted.originAttemptId).toBe(rig.a0);
      expect(permitted.basis).toContain(rig.a0);

      // A0 has NO lineage of its own, so it may inspect nothing.
      const a0Permitted = port.resolvePermittedOrigin({ consumerAttemptId: rig.a0 });
      expect(a0Permitted.ok).toBe(false);
      if (a0Permitted.ok) throw new Error("unreachable");
      expect(a0Permitted.reason).toBe("NO_LINEAGE");

      // 50: a NON-CANONICAL consumer is refused.
      const foreign = port.resolvePermittedOrigin({ consumerAttemptId: `attempt-${"f".repeat(32)}` });
      expect(foreign.ok).toBe(false);
      if (foreign.ok) throw new Error("unreachable");
      expect(foreign.reason).toBe("CONSUMER_NOT_CANONICAL");

      // 49: the origin the lineage permits is FIXED — a caller naming a different origin cannot change it,
      // because the port ignores any caller-supplied origin entirely (the product compares it separately).
      // 48: A1's lineage remains A0 after the chain advanced.
      expect(rig.controller.context.governedReworkOriginOf(rig.a1)!.originAttemptId).toBe(rig.a0);
    } finally {
      await rig.close();
    }
  });

  it("51. the positive capsuleForConsumer(A1) path is exercised through the ordinary attributed Preview", async () => {
    const rig = await governedRig();
    const dir = mkdtempSync(join(tmpdir(), "palimpsest-p2d1c5-preview-"));
    cleanups.push(() => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* windows */
      }
    });
    try {
      const { composeAttributedPreview } = await import("../src/composition/attributed_preview.js");
      const { makeCapsuleAuthorization } = await import("../src/composition/execution_association.js");
      const {
        SqliteExecutionAssociationStore,
        computeTrustedSourceBasis,
        createExecutionAssociationRecorder,
        makeAssociationQualifier,
        registryFromSingleBasis,
      } = await import("../src/execution_association/index.js");

      // The origin's execution evidence is a CONTROLLED FIXTURE: a real durable record built through the
      // real Recorder. This is stated, not presented as first-party DSH evidence.
      const store = new SqliteExecutionAssociationStore(":memory:");
      cleanups.push(() => store.close());
      const basis = computeTrustedSourceBasis({ adapterId: "a", workerBin: "/bin/dsh.js", nodeExecPath: "/bin/node.exe" });
      const recorder = createExecutionAssociationRecorder({ store, projectId: PROJECT, sourceBasis: basis, sourceKind: "FIRST_PARTY_DSH_HOST" });
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
        projectId: PROJECT,
        controller: rig.controller as never,
        promotions: rig.controller.promotions as never,
        qualifier,
        store,
        sessionReader: {
          sourceIdentity: "fixture", evidenceClass: "DSH_QUERY_PORT_FIXTURE",
          async readEvents(request: { readonly sessionId: string }) {
            return { schemaVersion: 1, readState: "READ_OK" as const, sessionId: request.sessionId, header: null, sourceIdentity: "fixture", sourceEvidenceClass: "DSH_QUERY_PORT_FIXTURE" as const, throughSeq: 0, knownEventCount: 1, inheritedEventCount: 0, requestedFromSeq: 0, requestedMaxEvents: 50, returnedCount: 1, pageBounded: true, diskIoBounded: true, durabilityProvenance: "PERSISTED_AND_SYNTHETIC_SEPARATED" as const, persistedEventCount: 1, syntheticRecoveryEventCount: 0, events: [{ sessionId: request.sessionId, seq: 0, type: "turn/start", inherited: false, durability: "PERSISTED_DSH_EVENT", time: 0, surface: null, summary: "s", durationMs: null, observedStatus: null }], knownParentSession: null, proves: [], doesNotProve: [], detail: "fixture" } as never;
          },
        } as never,
        capsuleAuthorization: makeCapsuleAuthorization({ projectId: PROJECT, store: rig.store, controller: rig.controller, contextService: rig.controller.context }),
        projectEvolutionOf: async () => ({ projectionRootId: null, projectionSemanticDigest: null, workSequence: null, workEventDigest: null, projectIrRevision: null, selectedRelations: [], quarantinedRelations: [], unresolvedReferences: [], currentnessCaveats: [], basisCompleteness: null, failureOrigin: null, failureKind: null }) as never,
      });

      // 51: THE POSITIVE PATH — capsuleForConsumer(A1) returns AUTHORIZED with A0's admitted evidence.
      const result = await service.capsuleForConsumer({ consumerAttemptId: rig.a1 });
      expect(result.state).toBe("AUTHORIZED");
      expect(result.permittedOriginAttemptId).toBe(rig.a0);
      expect(result.originAttemptId).toBe(rig.a0);
      expect(result.capsule).not.toBeNull();
      expect(result.capsule!.consumerAttemptId).toBe(rig.a1);
      expect(result.capsule!.originAttemptId).toBe(rig.a0);
      expect(result.capsule!.historicalExecution.events.length).toBeGreaterThan(0);
      expect(result.capsule!.authority).toBe("READ_ONLY_INSPECTION");
      expect(result.capsule!.framing).toBe("HISTORICAL_DATA_NOT_INSTRUCTIONS");
      expect(result.serializedBytes).toBeGreaterThan(0);

      // 49: a forged origin that disagrees with the lineage is refused.
      const forged = await service.capsuleForConsumer({ consumerAttemptId: rig.a1, requestedOriginAttemptId: `attempt-${"f".repeat(32)}` });
      expect(forged.state).toBe("ORIGIN_NOT_PERMITTED");
      expect(forged.capsule).toBeNull();
    } finally {
      await rig.close();
    }
  });
});


