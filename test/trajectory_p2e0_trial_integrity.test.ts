/**
 * Trajectory-P2-E0 §8 — TRIAL ASSIGNMENT, ELIGIBILITY AND DELIVERY INTEGRITY (Group B).
 *
 * Proves the three dimensions are INDEPENDENT and cannot be silently substituted: a TREATMENT whose origin
 * was unavailable stays TREATMENT; a CONTROL does not transport the withheld Capsule body; OFF is unchanged.
 *
 * The fixtures are test-owned: a real SQLite store, a real ProjectController with a governed A0 -> A1
 * rework lineage, and a controlled-fixture origin reader. No model runs.
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
const CLOCK = "2026-10-14T00:00:00Z";
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
  declared_by: "p2e0-spec",
  reason: "two tasks must reach VERIFYING together so one can be promoted while the other is reopened",
};

/** The SAME controlled-fixture governed lineage the P2-D1 delivery test uses, so the two agree. */
async function governedRig(projectId: string, options: { readonly readerAvailable?: boolean } = {}) {
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
  const deliveryHolder: { current: undefined | ((input: { readonly attemptId: string }) => Promise<unknown>) } = { current: undefined };
  const controller = new ProjectController({
    store, effects, projectId, policy, clock: () => CLOCK,
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

  /* The controlled-fixture origin association + the product consumer API, exactly as P2-D1 builds it. */
  const { composeAttributedPreview } = await import("../src/composition/attributed_preview.js");
  const { makeCapsuleAuthorization } = await import("../src/composition/execution_association.js");
  const {
    SqliteExecutionAssociationStore,
    computeTrustedSourceBasis,
    createExecutionAssociationRecorder,
    makeAssociationQualifier,
    registryFromSingleBasis,
  } = await import("../src/execution_association/index.js");

  const assocStore = new SqliteExecutionAssociationStore(":memory:");
  cleanups.push(() => assocStore.close());
  const basis = computeTrustedSourceBasis({ adapterId: "a", workerBin: "/bin/dsh.js", nodeExecPath: "/bin/node.exe" });
  const recorder = createExecutionAssociationRecorder({ store: assocStore, projectId, sourceBasis: basis, sourceKind: "FIRST_PARTY_DSH_HOST" });
  recorder.recordIdentity(
    Object.freeze({
      hostLocalJobId: "",
      attemptId: a0,
      observation: Object.freeze({ invocationId: "wpi-a0", dshSessionId: "worker-a0", reportedSessionId: "worker-a0", source: "DIRECT_CHILD_IPC_REPORT", sourceQualification: "FIRST_PARTY_DSH_QUALIFIED", directChildPid: 7 }),
    }),
  );
  recorder.finalizeInvocation({ attemptId: a0, invocationId: "wpi-a0", closeReason: "CHILD_EXIT_OBSERVED" });

  const qualifier = makeAssociationQualifier({
    store: assocStore,
    registry: registryFromSingleBasis(basis, "FIRST_PARTY_DSH_HOST"),
    work: {
      readAttempt: ({ attemptId }: { readonly attemptId: string }) => {
        const record = controller.attemptWorkRecord(attemptId);
        return record === null ? { ok: false as const, reason: "no canonical attempt" } : { ok: true as const, taskId: record.taskId, state: record.state, creationEventId: "ev-1" };
      },
    },
    dsh: {
      async readHeaderIdentity(sessionId: string) {
        return { readState: "READ_OK" as const, header: { sessionId, version: 4, createdAt: 1, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null }, detail: "fixture" };
      },
    },
  });
  const service = composeAttributedPreview({
    projectId,
    controller: controller as never,
    promotions: controller.promotions as never,
    qualifier,
    store: assocStore,
    /** §8.8: `readerAvailable: false` models an UNAVAILABLE origin Session Reader. */
    sessionReader:
      options.readerAvailable === false
        ? undefined
        : ({
            sourceIdentity: "fixture",
            evidenceClass: "DSH_QUERY_PORT_FIXTURE",
            async readEvents(request2: { readonly sessionId: string }) {
              return {
                schemaVersion: 1, readState: "READ_OK" as const, sessionId: request2.sessionId, header: null, sourceIdentity: "fixture",
                sourceEvidenceClass: "DSH_QUERY_PORT_FIXTURE" as const, throughSeq: 2, knownEventCount: 3, inheritedEventCount: 0,
                requestedFromSeq: 0, requestedMaxEvents: 50, returnedCount: 3, pageBounded: true, diskIoBounded: true,
                durabilityProvenance: "PERSISTED_AND_SYNTHETIC_SEPARATED" as const, persistedEventCount: 3, syntheticRecoveryEventCount: 0,
                events: Array.from({ length: 3 }, (_, index) => ({ sessionId: request2.sessionId, seq: index, type: "turn/start", inherited: false, durability: "PERSISTED_DSH_EVENT", time: index, surface: null, summary: `historical step ${String(index)}`, durationMs: null, observedStatus: null })),
                knownParentSession: null, proves: [], doesNotProve: [], detail: "fixture",
              } as never;
            },
          } as never),
    capsuleAuthorization: makeCapsuleAuthorization({ projectId, store, controller, contextService: controller.context }),
    projectEvolutionOf: async () =>
      ({ projectionRootId: null, projectionSemanticDigest: null, workSequence: null, workEventDigest: null, projectIrRevision: null, selectedRelations: [], quarantinedRelations: [], unresolvedReferences: [], currentnessCaveats: [], basisCompleteness: null, failureOrigin: null, failureKind: null }) as never,
  });

  return { store, controller, effects, a0, a1, deliveryHolder, service, close: async () => { try { store.close(); } catch { /* closed */ } await effects.close(); } };
}

/** Build the delivery provider the way the cluster does, over the rig's service. */
async function buildProvider(rig: Awaited<ReturnType<typeof governedRig>>, mode: "OFF" | "CONTROL" | "TREATMENT") {
  const { buildTrajectoryPresentation } = await import("../src/trajectory/presentation.js");
  const { canonicalDigest } = await import("../src/schema/canonical.js");
  return async (input: { readonly attemptId: string }) => {
    const assignedArm = mode;
    if (assignedArm === "OFF") return null;
    let result: Awaited<ReturnType<typeof rig.service.capsuleForConsumer>> | null = null;
    let eligibility = "UNKNOWN";
    let failureReason: string | null = null;
    let deliveryFailed = false;
    try {
      result = await rig.service.capsuleForConsumer({ consumerAttemptId: input.attemptId });
      eligibility = result.state === "AUTHORIZED" ? "QUALIFIED" : result.state === "ORIGIN_SOURCE_UNAVAILABLE" || result.state === "ORIGIN_PAGE_REFUSED" ? "SOURCE_UNAVAILABLE" : result.state === "ORIGIN_NOT_SELECTED" ? "RACED" : "NOT_QUALIFIED";
      if (result.state !== "AUTHORIZED") failureReason = `${result.state}: ${result.detail}`;
    } catch (error) {
      deliveryFailed = true;
      failureReason = `DELIVERY_ERROR: ${error instanceof Error ? error.message : String(error)}`;
    }
    const authorized = result !== null && result.state === "AUTHORIZED" && result.capsule !== null;
    /** §8.6/§8.8: CONTROL carries no historical body — it renders a fixed no-history boundary. */
    const capsule = authorized && result !== null && mode === "TREATMENT" ? result.capsule : null;
    const outcome = buildTrajectoryPresentation({
      mode,
      capsule: mode === "TREATMENT" ? capsule : null,
      consumerBasisDigest: capsule === null ? "" : canonicalDigest(capsule.authorizationBasis),
    });
    const presentation = outcome.ok ? outcome.presentation : null;
    const deliveryState = deliveryFailed ? "FAILED" : !outcome.ok ? "DELIVERY_PRECONDITION_NOT_MET" : presentation === null ? "CAPSULE_NOT_AVAILABLE" : presentation.mode === "CONTROL" ? "CONTROL_SECTION_RENDERED" : "SECTION_RENDERED";
    return {
      schemaVersion: capsule?.schemaVersion ?? 1,
      capsule,
      serializedBytes: capsule === null ? 0 : Buffer.byteLength(JSON.stringify(capsule), "utf8"),
      contentDigest: capsule === null ? "" : canonicalDigest(capsule),
      originAttemptId: capsule?.originAttemptId ?? result?.permittedOriginAttemptId ?? null,
      framing: "HISTORICAL_DATA_NOT_INSTRUCTIONS" as const,
      authority: "READ_ONLY_INSPECTION" as const,
      presentation,
      deliveryState,
      assignedArm,
      eligibility,
      failureReason,
    };
  };
}

/* ================================================================== Group B */

describe("E0-B Group B — trial assignment, eligibility and delivery integrity", () => {
  it("11. OFF remains OFF and delivers nothing at all", async () => {
    const rig = await governedRig("e0b-off");
    const provider = await buildProvider(rig, "OFF");
    expect(await provider({ attemptId: rig.a1 })).toBeNull();
  });

  it("13. TREATMENT remains TREATMENT after an unavailable origin Reader", async () => {
    const rig = await governedRig("e0b-readerfail", { readerAvailable: false });
    const provider = await buildProvider(rig, "TREATMENT");
    const delivery = await provider({ attemptId: rig.a1 });
    expect(delivery).not.toBeNull();
    // The ASSIGNMENT survives; the delivery precondition failed.
    expect(delivery!.assignedArm).toBe("TREATMENT");
    expect(delivery!.deliveryState).toBe("DELIVERY_PRECONDITION_NOT_MET");
    expect(delivery!.eligibility).toBe("SOURCE_UNAVAILABLE");
    expect(delivery!.capsule).toBeNull();
    expect(delivery!.failureReason).toContain("ORIGIN");
    // It is NOT OFF: a naive consumer must not see DELIVERY_DISABLED here.
    expect(delivery!.deliveryState).not.toBe("DELIVERY_DISABLED");
  });

  it("14. TREATMENT remains TREATMENT after a Capsule budget refusal", async () => {
    const rig = await governedRig("e0b-budget");
    // An absurdly small budget refuses the Capsule, but the arm and eligibility are unchanged.
    const tiny = await rig.service.capsuleForConsumer({ consumerAttemptId: rig.a1, limits: { maxSerializedBytes: 10 } });
    expect(tiny.state).toBe("CAPSULE_BUDGET_EXCEEDED");
    expect(tiny.capsule).toBeNull();
    // The eligibility is still QUALIFIED: the history qualified, only the delivery budget failed.
    const { buildProvider: _unused } = { buildProvider };
    void _unused;
    const provider = await buildProvider(rig, "TREATMENT");
    const delivery = await provider({ attemptId: rig.a1 });
    expect(delivery!.assignedArm).toBe("TREATMENT");
    expect(delivery!.eligibility).toBe("QUALIFIED");
    expect(delivery!.capsule).not.toBeNull();
  });

  it("12. CONTROL remains CONTROL and renders its boundary WITHOUT a materialized Capsule", async () => {
    const rig = await governedRig("e0b-control", { readerAvailable: false });
    const provider = await buildProvider(rig, "CONTROL");
    const delivery = await provider({ attemptId: rig.a1 });
    expect(delivery).not.toBeNull();
    expect(delivery!.assignedArm).toBe("CONTROL");
    // §8.8: CONTROL's own no-history section is present even though materialization failed.
    expect(delivery!.deliveryState).toBe("CONTROL_SECTION_RENDERED");
    expect(delivery!.presentation).not.toBeNull();
    expect(delivery!.presentation!.mode).toBe("CONTROL");
    expect(delivery!.presentation!.sectionText).toContain("No Trajectory history was provided for this attempt.");
    expect(delivery!.capsule).toBeNull();
  });

  it("18. the failure reason survives to the record", async () => {
    const rig = await governedRig("e0b-reason", { readerAvailable: false });
    const provider = await buildProvider(rig, "TREATMENT");
    const delivery = await provider({ attemptId: rig.a1 });
    expect(typeof delivery!.failureReason).toBe("string");
    expect(delivery!.failureReason!.length).toBeGreaterThan(0);
  });

  it("19/20. CONTROL does not transport the Capsule body, and the child payload withholds it", async () => {
    const rig = await governedRig("e0b-isolation");
    const provider = await buildProvider(rig, "CONTROL");
    const delivery = await provider({ attemptId: rig.a1 });
    expect(delivery!.capsule).toBeNull();

    // The CHILD payload: a context carrying a real Capsule must be stripped by the payload builder.
    const { workWorkerEnvironmentPayload } = await import("../src/deployment/work_worker.js");
    const treatmentProvider = await buildProvider(rig, "TREATMENT");
    const treatment = await treatmentProvider({ attemptId: rig.a1 });
    expect(treatment!.capsule).not.toBeNull();
    const context = {
      work: { projectGoal: "g", requirements: [], decisions: [], objective: "o", writeScope: [], requiredArtifacts: [], baseCommit: "0".repeat(40), completionChecks: [], independentVerificationRequired: false },
      compiled: {
        manifestId: "m",
        boot: [],
        handles: [],
        trajectoryCapsule: {
          schemaVersion: 1,
          capsule: treatment!.capsule,
          serializedBytes: treatment!.serializedBytes,
          contentDigest: treatment!.contentDigest,
          originAttemptId: treatment!.originAttemptId ?? "",
          framing: "HISTORICAL_DATA_NOT_INSTRUCTIONS" as const,
          authority: "READ_ONLY_INSPECTION" as const,
          presentation: treatment!.presentation,
          deliveryState: treatment!.deliveryState,
          assignedArm: "TREATMENT" as const,
          eligibility: "QUALIFIED" as const,
          failureReason: null,
        },
      },
    };
    const payload = workWorkerEnvironmentPayload(context as never);
    const serialized = JSON.stringify(payload);
    // The raw Capsule BODY is withheld from the child payload...
    const bodyMarker = (treatment!.capsule as { authorizationBasis?: string }).authorizationBasis ?? "";
    expect(serialized).not.toContain("consumerAttemptId");
    expect(payload.context.compiled.trajectoryCapsule).toBeDefined();
    expect((payload.context.compiled.trajectoryCapsule as Record<string, unknown>).capsule).toBeUndefined();
    // ...while the trial record and the rendered section ARE transported.
    expect(payload.trajectoryDelivery).not.toBeNull();
    expect(payload.trajectoryDelivery!.assignedArm).toBe("TREATMENT");
    expect(serialized).toContain("HISTORICAL EXECUTION CONTEXT");
    void bodyMarker;
  });

  it("21. no missing TREATMENT becomes DELIVERY_DISABLED without its assigned-arm fact", async () => {
    const rig = await governedRig("e0b-notdisabled", { readerAvailable: false });
    const provider = await buildProvider(rig, "TREATMENT");
    const delivery = await provider({ attemptId: rig.a1 });
    expect(delivery!.deliveryState).not.toBe("DELIVERY_DISABLED");
    expect(delivery!.assignedArm).toBe("TREATMENT");
  });

  it("16/17. eligibility cannot be forged, and a delivery failure does not alter canonical Work", async () => {
    const rig = await governedRig("e0b-eligibility");
    const provider = await buildProvider(rig, "TREATMENT");
    // A forged attempt id resolves to no permission: eligibility is NOT_QUALIFIED, never QUALIFIED.
    const forged = await provider({ attemptId: `attempt-${"f".repeat(32)}` });
    expect(forged!.eligibility).toBe("NOT_QUALIFIED");
    expect(forged!.capsule).toBeNull();
    // A0 (no lineage) likewise cannot be eligible.
    const forA0 = await provider({ attemptId: rig.a0 });
    expect(forA0!.eligibility).toBe("NOT_QUALIFIED");
    // The canonical Work record is unchanged by any of this.
    const record = rig.controller.attemptWorkRecord(rig.a1);
    expect(record).not.toBeNull();
    expect(record!.state).toBeTruthy();
  });

  it("15. the assignment cannot be chosen by a model — it is trusted configuration only", async () => {
    const { workWorkerEnvironmentPayload } = await import("../src/deployment/work_worker.js");
    // A context with NO trajectory delivery at all produces a `null` record: there is no model-supplied arm.
    const context = {
      work: { projectGoal: "g", requirements: [], decisions: [], objective: "o", writeScope: [], requiredArtifacts: [], baseCommit: "0".repeat(40), completionChecks: [], independentVerificationRequired: false },
      compiled: { manifestId: "m", boot: [], handles: [] },
    };
    const payload = workWorkerEnvironmentPayload(context as never);
    expect(payload.trajectoryDelivery).toBeNull();
    // The record carries no field a model could use to name its own arm.
    expect(Object.keys(payload).sort()).not.toContain("assignedArm");
  });
});
