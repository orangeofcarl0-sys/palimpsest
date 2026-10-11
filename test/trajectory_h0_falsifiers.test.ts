/**
 * Trajectory-V0S-H0 §5 (C1) — BASELINE FALSIFIERS F1–F12, MEASURED AGAINST THE EXACT V0S BASELINE.
 *
 * This file reproduces the remaining consumer defects BEFORE any production correction. Each falsifier
 * is classified honestly:
 *
 *   DYNAMICALLY_REPRODUCED  executed against real code or a real canonical Work scenario
 *   SOURCE_DEMONSTRATED     proven by reading the baseline source, not executed
 *   NOT_ESTABLISHED         the evidence did not support the claim either way
 *
 * Where a falsifier needs real canonical Work state it reuses the T0 Work/Rework rig pattern (real
 * controller, EventStore, promotion and governed reopening) rather than inventing a second Work
 * implementation. Where the product workflow cannot produce the precise setup, it uses a source-grounded
 * projection fixture and SAYS SO.
 *
 * Evidence classes used below:
 *   REAL_CANONICAL_WORK      the scenario runs the real product Work stack
 *   CONTROLLED_PROJECTION    a hand-built TrajectoryProjection fixture
 *   CONTROLLED_FIXTURE       a unit/contract fixture
 *   SOURCE_ONLY              a source-text reading
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
  type AttemptRelationContext,
  type TrajectoryEdge,
  type TrajectoryProjection,
} from "../src/trajectory/index.js";
import {
  classifyHostObservation,
  type HostObservationProvenance,
} from "../src/trajectory/execution.js";
import {
  buildHandoffPreview,
  type HandoffPreviewInput,
} from "../src/trajectory/handoff_preview.js";
import { selectAttemptWorkRelations } from "../src/trajectory/relation_admission.js";
import { FakeClock, taskSpec } from "./helpers.js";

const HEAD = "c".repeat(40);
const CLOCK = "2026-10-12T00:00:00Z";
const PROJECT = "h0a";
const HEX = (seed: string): string => seed.repeat(64).slice(0, 64);

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
  declared_by: "h0a-spec",
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
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-h0a-"));
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
  controller.declareRoleTable({ roles: [{ role: "implementer", slots: 2 }], hardCap: 2, declaredBy: "h0a-spec" });

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
      payload: {
        previous_state: "VERIFYING",
        new_state: "READY",
        reason: "rework-admitted",
        batch_activation_event_id: activationId,
      },
      causation_id: Number(row(taskId).last_event_id),
      correlation_id: `task:${taskId}:rework`,
      idempotency_key: actionKey("task-batch-settle-v1", {
        project_id: PROJECT,
        task_id: taskId,
        batch_activation_event_id: activationId,
        target_state: "READY",
      }),
      expected_project_revision: 0,
    };
    const envelope = JSON.parse(
      new TextDecoder().decode(
        (store.connection.prepare("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?").get(PROJECT, taskId) as { envelope_json: Uint8Array }).envelope_json,
      ),
    ) as { envelope_id: string };
    const permit = ReworkAdmissionPermit.issue({
      projectId: PROJECT,
      taskId,
      originResultSubjectKind: "attempt_result",
      originResultSubjectRef: originAttemptId,
      originBasisDigest: HEX("a"),
      targetObservationDigest: HEX("b"),
      currentEnvelopeId: envelope.envelope_id,
      batchActivationEventId: activationId,
      reason: "INCOMPATIBLE",
      targetFence: controller.reworkTargetFence(),
    });
    store.appendReworkReopening(request as never, permit, { assessmentDigest: HEX("d") });
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

const SOURCE_FILES = {
  composition: "src/composition/trajectory_v0.ts",
  relation: "src/trajectory/relation_admission.ts",
  projection: "src/trajectory/projection.ts",
  reader: "scripts/trajectory_v0/dsh-session-reader.mjs",
  preview: "src/trajectory/handoff_preview.ts",
} as const;

function source(relative: string): string {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

/**
 * §5: the exact relation context the H0 composition adapter hands the selector.
 *
 * This mirrors `buildRelationContext` in the composition adapter: every identity is resolved from the
 * attempt's OWN records. It exists here so the falsifiers can drive the selector with the real shape.
 */
function h0RelationContext(
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
    projectId: PROJECT,
    attemptId,
    creationEventId: created === undefined ? null : String(created.event_id),
    authorizationEventId: authorization === undefined ? null : String(authorization.event_id),
    authorizationEnvelopeId: typeof envelopeId === "string" ? envelopeId : null,
    terminalEventIds: terminalEvents.map((event) => String(event.event_id)),
    completedEventId: completed === null ? null : String(completed.event_id),
    canonicalEventIds,
  };
}

/* ================================================================== F1 */

describe("H0 F1 — shared authorization contamination", () => {
  it("F1 (corrected): a shared authorization event no longer admits the OTHER Attempt's relation", () => {
    /**
     * CONTROLLED_PROJECTION. The ordinary product workflow mints a distinct envelope per activation,
     * so two attempts sharing one authorization event is not naturally producible; the ruling permits
     * a source-grounded projection fixture for exactly this case.
     *
     * ------------------------------------------------------------------ CHANGED ASSERTION (C2)
     *
     * The baseline assertion was `expect(authRelations.length).toBe(2)`: it pinned the DEFECT, that a
     * shared authorization admitted BOTH attempts' relations. The counterexample is that attempt A's
     * Preview then carried attempt B's authorization.
     *
     * The corrected contract requires the edge's SOURCE to be the requested attempt's OWN
     * authorization event id, so exactly ONE relation is admitted and attempt B's is quarantined with
     * a reason. This test is the negative half of H0-I1; the positive half is in the H0 relation suite.
     */
    const authNode = makeTrajectoryNode({
      reference: makeOwnerReference({ ownerPlane: "WORK", ownerScope: PROJECT, canonicalId: "10", sourceSequence: 1, sourceDigest: HEX("1"), projectId: PROJECT, verification: "VERIFIED_AGAINST_OWNER", verificationDetail: "fixture" }),
      authenticity: "OWNER_RECORDED", epistemicStatus: "RECORDED", currentness: "CURRENT", completeness: "COMPLETE", label: "TASK_CREATED task-a",
    });
    const attemptA = `attempt-${"a".repeat(32)}`;
    const attemptB = `attempt-${"b".repeat(32)}`;
    const aCreated = makeTrajectoryNode({
      reference: makeOwnerReference({ ownerPlane: "WORK", ownerScope: PROJECT, canonicalId: "20", sourceSequence: 2, sourceDigest: HEX("2"), projectId: PROJECT, verification: "VERIFIED_AGAINST_OWNER", verificationDetail: "fixture" }),
      authenticity: "OWNER_RECORDED", epistemicStatus: "RECORDED", currentness: "CURRENT", completeness: "COMPLETE", label: `ATTEMPT_CREATED ${attemptA}`,
    });
    const bCreated = makeTrajectoryNode({
      reference: makeOwnerReference({ ownerPlane: "WORK", ownerScope: PROJECT, canonicalId: "21", sourceSequence: 3, sourceDigest: HEX("3"), projectId: PROJECT, verification: "VERIFIED_AGAINST_OWNER", verificationDetail: "fixture" }),
      authenticity: "OWNER_RECORDED", epistemicStatus: "RECORDED", currentness: "CURRENT", completeness: "COMPLETE", label: `ATTEMPT_CREATED ${attemptB}`,
    });
    const authEdge = (to: typeof aCreated): TrajectoryEdge => ({
      schemaVersion: 1,
      relation: "TASK_AUTHORIZED_ATTEMPT",
      fromNodeId: authNode.nodeId,
      toNodeId: to.nodeId,
      evidenceState: "ESTABLISHED_BY_OWNER_REFERENCE",
      evidence: { byReference: authNode.reference, carryingField: "ATTEMPT_CREATED.payload.envelope_id", compared: { envelopeId: "env-shared" } },
      detail: "authorized by TASK_CREATED at event_id 10",
    });
    const projection: TrajectoryProjection = {
      schemaVersion: 1, rootId: "tr-fixture", projectId: PROJECT,
      basisVector: { completeness: "COMPLETE", work: { projectSequence: 3, eventDigest: HEX("9"), projectIrRevision: 0 }, reasoning: [], proof: null, journal: [], world: [], unavailable: [] } as never,
      nodes: [authNode, aCreated, bCreated],
      edges: [authEdge(aCreated), authEdge(bCreated)],
      sourceCoverage: [], unresolved: [], conflicts: [], currentness: [], asOf: null,
      hostObservationAdmission: "NOT_APPLICABLE", semanticDigest: HEX("8"), readOnly: true,
    };

    /** Attempt A's OWN authorization is event 10; its creation is 20. */
    const context: AttemptRelationContext = {
      projectId: PROJECT, attemptId: attemptA,
      creationEventId: "20", authorizationEventId: "10", authorizationEnvelopeId: "env-shared",
      terminalEventIds: [], completedEventId: null,
      canonicalEventIds: new Set(["20", "10"]),
    };
    const result = selectAttemptWorkRelations(projection, context);
    const authRelations = result.selected.filter((relation) => relation.relation === "TASK_AUTHORIZED_ATTEMPT");
    // Exactly ONE authorization relation is admitted — attempt A's own.
    expect(authRelations.length).toBe(1);
    // Attempt B's relation is reported as excluded, with a role reason.
    const bExcluded = result.quarantined.filter((relation) => relation.relation === "TASK_AUTHORIZED_ATTEMPT");
    expect(bExcluded.length).toBe(1);
    expect(bExcluded[0]!.reason).toContain("destination is not this attempt's creation event");
  });
});

/* ================================================================== F2 */

describe("H0 F2 — legitimate Promotion preserved", () => {
  it("F2 (corrected): T0 establishes RESULT_PROMOTED and the selector now ADMITS it", async () => {
    /**
     * ------------------------------------------------------------------ CHANGED ASSERTION (C2)
     *
     * The baseline assertion was `expect(selectedPromotions.length).toBe(0)` plus
     * `expect(quarantinedPromotions.length).toBeGreaterThan(0)`: it pinned the DEFECT, that a genuine
     * promotion was excluded because its carrier is a PROMOTION_COMMITTED (a different entity type).
     *
     * The corrected contract admits a promotion whose SOURCE is this attempt's completed result and
     * whose own `attempt_id` field names this attempt — the carrier's entity type is irrelevant
     * (H0-I2). The positive half is here; the wrong-Attempt negative is in the H0 relation suite.
     */
    const r = await fullScenario();
    try {
      const projection = await buildProjectTrajectory(r.inputs);
      const promotionEdges = projection.edges.filter((edge) => edge.relation === "RESULT_PROMOTED");
      expect(promotionEdges.length).toBeGreaterThan(0);
      expect(promotionEdges[0]!.evidenceState).toBe("ESTABLISHED_BY_OWNER_REFERENCE");
      expect(promotionEdges[0]!.evidence).not.toBeNull();

      const context = h0RelationContext(r.events(), r.attempts.promoted);
      const selection = selectAttemptWorkRelations(projection, context);
      const selectedPromotions = selection.selected.filter((relation) => relation.relation === "RESULT_PROMOTED");
      expect(selectedPromotions.length).toBeGreaterThan(0);
      expect(selectedPromotions[0]!.evidenceState).toBe("ESTABLISHED_BY_OWNER_REFERENCE");
    } finally {
      await r.close();
    }
  });
});

/* ================================================================== F3 */

describe("H0 F3 — legitimate Governed Rework preserved", () => {
  it("F3 (corrected): T0 establishes ATTEMPT_REOPENED_FOR_REWORK and the selector now ADMITS it", async () => {
    /**
     * ------------------------------------------------------------------ CHANGED ASSERTION (C2)
     *
     * The baseline assertion was `expect(selected.length).toBe(0)`: it pinned the DEFECT, that a
     * genuine governed reopening was excluded because its carrier is a TASK_READY (a TASK entity).
     *
     * The corrected contract admits a reopening whose SOURCE is this attempt's terminal result and
     * whose provenance `originRef` names this attempt (H0-I2).
     */
    const r = await fullScenario();
    try {
      const projection = await buildProjectTrajectory(r.inputs);
      const reworkEdges = projection.edges.filter((edge) => edge.relation === "ATTEMPT_REOPENED_FOR_REWORK");
      expect(reworkEdges.length).toBeGreaterThan(0);
      expect(reworkEdges[0]!.evidenceState).toBe("ESTABLISHED_BY_OWNER_REFERENCE");

      const context = h0RelationContext(r.events(), r.attempts.a0);
      const selection = selectAttemptWorkRelations(projection, context);
      const selected = selection.selected.filter((relation) => relation.relation === "ATTEMPT_REOPENED_FOR_REWORK");
      expect(selected.length).toBeGreaterThan(0);
    } finally {
      await r.close();
    }
  });
});

/* ================================================================== F4 */

describe("H0 F4 — caller-selected Session still triggers I/O", () => {
  it("F4: previewAttempt with a claimedSessionId performs header and event reads (source-demonstrated)", () => {
    /**
     * SOURCE_DEMONSTRATED. The composition adapter calls `reader.readHeaderIdentity(claimedSessionId)`
     * and `reader.readEvents(...)` whenever a session is claimed, regardless of whether any producer
     * establishes the binding. The dynamic reproduction of this is in the V0S admission suite, which
     * asserts a claim is not ADMITTED; H0 changes the requirement to ZERO reads.
     */
    const code = source(SOURCE_FILES.composition);
    expect(code).toContain("await reader.readHeaderIdentity(claimedSessionId)");
    expect(code).toContain("await reader.readEvents({ sessionId: claimedSessionId })");
  });
});

/* ================================================================== F5 */

describe("H0 F5 — reader source identity exposes a local path", () => {
  it("F5: the successful page's sourceIdentity is built from the local package root (source-demonstrated)", () => {
    /**
     * SOURCE_DEMONSTRATED. `sourceIdentity` interpolates the resolved local package root, so a
     * consumer-visible SUCCESSFUL page carries an absolute installation path. Error-message
     * sanitization does not cover this field.
     */
    const code = source(SOURCE_FILES.reader);
    expect(code).toContain("sourceIdentity = `dsh-session-persistence-jsonl@${packageRoot}`");
    expect(code).toContain("sourceIdentity,");
  });
});

/* ================================================================== F6 */

describe("H0 F6 — caller-controlled Host identifiers overstate provenance", () => {
  it("F6: a caller record with a matching attemptId and a HostJobId becomes LOCAL_PORT_OBSERVATION", () => {
    /**
     * CONTROLLED_FIXTURE. `classifyHostObservation` promotes a record to LOCAL_PORT_OBSERVATION from
     * caller-supplied fields alone: nothing in the classification is produced by a host component the
     * caller does not control.
     */
    const classification = classifyHostObservation({ recordPresent: true, attemptMatches: true, hasLocalIdentity: true, conflictDetail: null });
    expect(classification.provenance as HostObservationProvenance).toBe("LOCAL_PORT_OBSERVATION");
  });
});

/* ================================================================== F7 */

describe("H0 F7 — an incomplete Session page can satisfy COMPLETE", () => {
  it("F7: a page whose known count exceeds its returned coverage still yields COMPLETE", () => {
    /**
     * CONTROLLED_FIXTURE. This models the consumer state a verified binding would produce; it does NOT
     * claim a real binding producer exists.
     */
    const page = {
      schemaVersion: 1 as const, readState: "READ_OK" as const, sessionId: "session-partial",
      header: { sessionId: "session-partial", version: 4, createdAt: 1, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null },
      sourceIdentity: "fixture", sourceEvidenceClass: "DSH_QUERY_PORT_FIXTURE" as const,
      throughSeq: 49, knownEventCount: 200, inheritedEventCount: 0,
      requestedFromSeq: 0, requestedMaxEvents: 50, returnedCount: 50,
      pageBounded: true as const, diskIoBounded: false,
      durabilityProvenance: "DURABILITY_UNRESOLVED" as const, persistedEventCount: null, syntheticRecoveryEventCount: null,
      events: Object.freeze([]), knownParentSession: null, proves: Object.freeze([]), doesNotProve: Object.freeze([]),
      detail: "a partial page",
    };
    const input: HandoffPreviewInput = {
      projectId: PROJECT, attemptId: `attempt-${"a".repeat(32)}`,
      binding: {
        schemaVersion: 1 as const, projectId: PROJECT, attemptId: `attempt-${"a".repeat(32)}`, viewId: "tv-x",
        historicalWorkBasis: { basisDigest: null, capturedAtRevision: null, taskId: "t1" },
        hostLocalJobId: null, portInvocationId: null,
        dshSessionId: "session-partial", claimedSessionId: "session-partial",
        hostObservationProvenance: "NOT_OBSERVED" as const,
        sessionSource: "CANONICAL_ATTEMPT_BINDING" as const, sessionBindingStatus: "BOUND_VERIFIED" as const,
        sessionReadAdmission: "ADMITTED_TO_ATTEMPT" as const, bindingEvidenceRefs: Object.freeze([]), detail: "fixture",
      },
      canonical: {
        attemptState: "COMPLETED", taskId: "t1", workState: null, envelopeId: "env-1", basisDigest: null, capturedAtRevision: null,
        authorizationDetail: "x", resultRefs: ["1".repeat(40)], resultDetail: "x", verificationState: "NOT_RUN",
        promotionState: "NOT_PROMOTED", promotionId: null, reworkState: "NONE", reworkDetail: "x",
      },
      host: { hostLocalJobId: null, portInvocationId: null, processLifecycle: "NOT_OBSERVED", processDetail: "x", observedEventKinds: [], originLimitation: "x" },
      sessionPage: page as never,
      projectEvolution: { projectionRootId: "tr-x", projectionSemanticDigest: null, workSequence: 1, workEventDigest: null, projectIrRevision: 0, selectedRelations: [], quarantinedRelations: [], unresolvedReferences: [], currentnessCaveats: [] },
    };
    const preview = buildHandoffPreview(input);
    // The defect: 50 of 200 events read, and the Preview still reports COMPLETE.
    expect(preview.completeness).toBe("COMPLETE");
  });
});

/* ================================================================== F8 */

describe("H0 F8 — exit chronology inferred without ordering proof", () => {
  it("F8: abort + exit flags produce a 'LATER observed' chronology with no ordering evidence (source-demonstrated)", () => {
    /**
     * SOURCE_DEMONSTRATED. `hostSummaryOf` asserts the exit was observed AFTER the termination request
     * from the mere presence of both flags; the record carries no ordering proof.
     */
    const code = source(SOURCE_FILES.composition);
    expect(code).toContain("and an exit was LATER observed");
    expect(code).toContain("record.exited && (requestedAbort || requestedTimeout)");
  });
});

/* ================================================================== F9 */

describe("H0 F9 — unscoped global event probe", () => {
  it("F9: an unknown attempt triggers a full cross-project scan (source-demonstrated)", () => {
    /**
     * SOURCE_DEMONSTRATED. When the project-scoped lookup fails, the adapter calls
     * `controller.store.listEvents()` with NO project scope to distinguish FOREIGN_ATTEMPT from
     * ATTEMPT_NOT_FOUND. This is an architectural cost/privacy boundary finding, not a proven
     * security vulnerability.
     */
    const code = source(SOURCE_FILES.composition);
    // Whitespace-normalized, so the assertion survives formatting and line-ending changes.
    const flat = code.replace(/\s+/gu, " ");
    expect(flat).toContain("controller.store .listEvents()");
    expect(flat).toContain("foreignAttemptExists");
  });
});

/* ================================================================== F10 */

describe("H0 F10 — existing T0 label matcher", () => {
  it("F10: traceAttempt() selects by display-label substring (source-demonstrated)", () => {
    /**
     * SOURCE_DEMONSTRATED. T0's public `traceAttempt()` uses `node.label.includes(attemptId)`. T0 is
     * NOT modified in H0; the defect is recorded for a separate forward-only T0 slice.
     */
    const code = source(SOURCE_FILES.projection);
    expect(code).toContain("node.label.includes(attemptId)");
  });
});

/* ================================================================== F11 */

describe("H0 F11 — cold-read provenance race", () => {
  it("F11: the durability boundary is located by a SECOND read (source-demonstrated)", () => {
    /**
     * SOURCE_DEMONSTRATED. `readColdSessionLog` and `readStoredPrefix` are two separate reads, so a
     * concurrent append between them could classify an event against a boundary from a different
     * snapshot. A source-structural race is not a dynamically reproduced failure.
     */
    const code = source(SOURCE_FILES.reader);
    expect(code).toContain("await readColdSessionLog(persistence, SessionId(request.sessionId))");
    expect(code).toContain("await readStoredPrefix(persistence, request.sessionId, SessionId)");
  });
});

/* ================================================================== F12 */

describe("H0 F12 — canonical Work read integrity", () => {
  it("F12: a failed T0 projection is reported as an optional-owner absence (source-demonstrated)", () => {
    /**
     * SOURCE_DEMONSTRATED. `projectEvolutionOf` catches EVERY projection failure and returns a summary
     * whose only caveat is that the projection "could not be built". A corrupted canonical Work source
     * is therefore indistinguishable from an uncomposed optional owner.
     */
    const code = source(SOURCE_FILES.composition);
    expect(code).toContain("catch {");
    expect(code).toContain("the T0 project-evolution projection could not be built for this project");
    // The canonical Work facts themselves come from the owner directly, so they are NOT lost; the
    // PROJECT CONTEXT is what degrades silently.
    expect(code).toContain("const canonical = canonicalFactsOf");
  });
});
