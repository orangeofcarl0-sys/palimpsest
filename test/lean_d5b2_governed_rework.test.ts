/**
 * PLMP-LEAN-1 §D5-b2 — GOVERNED REWORK ADMISSION, as machine proofs.
 *
 *     VERIFYING@E_0  →  READY@E_0     requires a governed ReworkAdmissionPermit
 *
 * The closed proposition, and deliberately the whole of it:
 *
 * > A completed result sitting in VERIFYING cannot be set aside and reopened by ordinary append; reopening
 * > requires an unforgeable, one-shot, CURRENT-STATE-BOUND rework authority.
 *
 * §D5-b measured that the aggregate ALREADY accepted `TASK_READY` on a VERIFYING task, because the state
 * machine lists VERIFYING among `TASK_READY`'s allowed sources. Declaring the stage-graph edge without a gate
 * would have let any internal caller reopen verified work with no continuation assessment at all. This file
 * proves the gate, and it proves what the permit does NOT own.
 *
 * ## What is proven live
 *
 *   a fully and correctly caused `TASK_READY` — right `previous_state`, right `causation_id`, the batch's own
 *   activation id, the deterministic settlement key, an attempt budget left — is refused by name without a
 *   permit and accepted with one. The refusal is about AUTHORITY, not about the event being malformed.
 *
 * ## What is proven NOT owned by rework
 *
 *   basis advance. An earlier draft bound the permit to a future envelope E_1 and gated a two-event closure
 *   `TASK_REAUTHORIZED(E_1)` + `TASK_READY` behind one shared pass. Measured against the shipped system that
 *   draft was unbuildable — no fresh envelope can exist for a VERIFYING task, because envelope identity is a
 *   digest over state only `PROJECT_REVISED` can advance, and plan reconciliation's quiescence is broken by
 *   the very task being reopened — and the measurement is a refutation: E_1 is not rework's to promise. The
 *   draft's pass, its second slot and its reauthorization branch were DELETED, not kept "until reachable";
 *   had the branch stayed, a reauthorization arriving after the reopening would have seen an ordinary READY
 *   task and never spent its slot — a two-step bypass waiting for an ordering bug.
 *
 *   So this suite also pins the OWNERSHIP LINE: rebinding retained Work to the new basis is owned by the
 *   existing head reconciliation authority (G10-X), whose structural guard (READY/BLOCKED only) is unchanged.
 *
 * ## The trust boundary (the same one the promotion permits declare)
 *
 * These proofs defend against a generic `EventStore.append` caller, a module writer, an accidental alternate
 * ingestion path. They do not defend against arbitrary code already running in this process.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";
import { ManualClock } from "@ordarium/testing";
import { SimulatedProcessCrash } from "@ordarium/core";

import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy, actionKey } from "../src/domain/index.js";
import {
  consumeReworkAdmissionPermit,
  ReworkAdmissionError,
  ReworkAdmissionPermit,
} from "../src/domain/rework_admission.js";
import {
  DEFAULT_STAGE_GRAPH,
  STAGE_WHEN_SOURCE_STATES,
} from "../src/domain/stage_graph.js";
import { normalizeEventPayload, parseNewEvent, parseProjectIr, parseTaskEnvelope } from "../src/schema/index.js";

import { FakeClock, taskSpec } from "./helpers.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (relative: string): string =>
  execFileSync(
    process.execPath,
    ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, relative))},'utf8'))`],
    { encoding: "utf8" },
  );

const HEAD = "c".repeat(40);
const CLOCK = "2026-09-16T00:00:00Z";
const PROJECT = "d5b2";
const TASK = "task-a";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

/* ================================================================== *
 * Rig
 * ================================================================== */

interface Rig {
  readonly store: EventStore;
  readonly controller: ProjectController;
  readonly effects: ReturnType<typeof createPalimpsestEffects>;
  readonly policy: TaskPolicy;
  taskState(taskId?: string): string;
  lastEventId(taskId?: string): number;
  batchActivationId(taskId?: string): number;
  ir(): ReturnType<typeof parseProjectIr>;
  envelopeOf(taskId?: string): ReturnType<typeof parseTaskEnvelope>;
  policyEnvelope(taskId?: string): ReturnType<typeof parseTaskEnvelope>;
  /** A structurally complete, correctly caused TASK_READY — what a generic caller could build. */
  readyEvent(): ReturnType<typeof parseNewEvent>;
  /** Drive one task to a COMPLETED candidate sitting in VERIFYING, as the real pipeline does. */
  drive(taskId: string): Promise<void>;
  /** A permit for THIS rig's task, bound to the envelope and batch that actually exist right now. */
  permit(taskId?: string): ReworkAdmissionPermit;
  close(): Promise<void>;
}

async function rig(): Promise<Rig> {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-d5b2-"));
  cleanups.push(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows keeps the directory busy while a handle is open; the OS reaps it.
    }
  });
  const store = new EventStore(join(dir, "p.sqlite"), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({
    databasePath: join(dir, "o.sqlite"),
    git: new FakeGitPort(HEAD),
    clock: new ManualClock().now,
    leaseMs: 50,
  });
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
  controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec(TASK), taskSpec("task-b")] });

  const row = (taskId: string): { state: string; last_event_id: number; state_json: Uint8Array } =>
    store.connection
      .prepare("SELECT state, last_event_id, state_json FROM tasks WHERE project_id=? AND task_id=?")
      .get(PROJECT, taskId) as { state: string; last_event_id: number; state_json: Uint8Array };
  const stateOf = (taskId: string = TASK): string => String(row(taskId).state);
  const activationOf = (taskId: string = TASK): number =>
    Number((JSON.parse(new TextDecoder().decode(row(taskId).state_json)) as { batch_activation_event_id: number }).batch_activation_event_id);

  const ir = (): ReturnType<typeof parseProjectIr> => {
    const project = store.connection
      .prepare("SELECT state_json FROM projects WHERE project_id=?")
      .get(PROJECT) as { state_json: Uint8Array };
    return parseProjectIr(JSON.parse(new TextDecoder().decode(project.state_json)));
  };
  const readEnvelope = (taskId: string): ReturnType<typeof parseTaskEnvelope> => {
    const task = store.connection
      .prepare("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?")
      .get(PROJECT, taskId) as { envelope_json: Uint8Array };
    return parseTaskEnvelope(JSON.parse(new TextDecoder().decode(task.envelope_json)));
  };

  /** Drive one task to a COMPLETED candidate sitting in VERIFYING, exactly as the real pipeline does. */
  const driveToVerifying = async (taskId: string): Promise<void> => {
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
  };

  return {
    store,
    controller,
    effects,
    policy,
    taskState: stateOf,
    lastEventId: (taskId = TASK) => Number(row(taskId).last_event_id),
    batchActivationId: (taskId = TASK) => activationOf(taskId),
    ir,
    envelopeOf: (taskId = TASK) => readEnvelope(taskId),
    policyEnvelope: (taskId = TASK) => policy.authorize(ir(), taskId).envelope,
    readyEvent: () => {
      const activationId = activationOf(TASK);
      return parseNewEvent({
        schema_version: 1,
        project_id: PROJECT,
        event_type: "TASK_READY",
        payload_version: 1,
        entity_type: "task",
        entity_id: TASK,
        payload: normalizeEventPayload("TASK_READY", {
          previous_state: "VERIFYING",
          new_state: "READY",
          reason: "rework-admitted",
          batch_activation_event_id: activationId,
        }),
        // Every structural precondition the aggregate checks, satisfied:
        causation_id: Number(row(TASK).last_event_id),
        correlation_id: `task:${TASK}:rework`,
        idempotency_key: actionKey("task-batch-settle-v1", {
          project_id: PROJECT,
          task_id: TASK,
          batch_activation_event_id: activationId,
          target_state: "READY",
        }),
        expected_project_revision: 0,
      });
    },
    drive: driveToVerifying,
    permit: (taskId = TASK) =>
      ReworkAdmissionPermit.issue({
        projectId: PROJECT,
        taskId,
        originResultSubjectKind: "attempt_result",
        originResultSubjectRef: "attempt-0",
        originBasisDigest: "a".repeat(64),
        targetObservationDigest: "b".repeat(64),
        // Bound to what EXISTS at admission time: the envelope the task still carries and the batch whose
        // completed candidate is being set aside. Never a future envelope.
        currentEnvelopeId: readEnvelope(taskId).envelope_id,
        // A task that never ran has no batch anchor; naming the driven task's batch there keeps a cross-task
        // permit STRUCTURALLY valid, so its refusal is about identity rather than a malformed capability.
        batchActivationEventId: taskId === TASK ? activationOf(taskId) : activationOf(TASK),
        reason: "INCOMPATIBLE",
      }),
    close: async () => {
      await effects.close();
      store.close();
    },
  };
}

/* ================================================================== *
 * 1. The bypass §D5-b measured is CLOSED
 * ================================================================== */

describe("§D5-b2 the generic surface refuses to reopen verified work", () => {
  it("a STRUCTURALLY PERFECT TASK_READY on a VERIFYING task is refused by name", async () => {
    const r = await rig();
    try {
      await r.drive(TASK);
      expect(r.taskState()).toBe("VERIFYING");
      const before = r.store.listEvents(PROJECT).length;

      /**
       * THE MEASURED BYPASS, ASSERTED CLOSED. §D5-b drove this exact shape and the aggregate ACCEPTED it.
       * Nothing is missing from the request — state, causation, the batch anchor and the settlement key all
       * match — so a refusal here can only be about authority.
       */
      let error: unknown;
      try {
        r.store.append(r.readyEvent());
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(ReworkAdmissionError);
      expect((error as ReworkAdmissionError).kind).toBe("rework_admission_required");
      // Fail closed: no event, no state change, no half-reopened Work.
      expect(r.store.listEvents(PROJECT)).toHaveLength(before);
      expect(r.taskState()).toBe("VERIFYING");
    } finally {
      await r.close();
    }
  }, 180_000);

  it("the SAME event is ACCEPTED through the governed reopening — the difference is authority, not shape", async () => {
    const r = await rig();
    try {
      await r.drive(TASK);
      const event = r.readyEvent();

      // Refused on the generic surface...
      expect(() => r.store.append(event)).toThrow(ReworkAdmissionError);

      // ...and accepted through the governed path with a permit bound to what exists now.
      const landed = r.store.appendReworkReopening(event, r.permit());
      expect(landed.event_type).toBe("TASK_READY");
      expect(r.taskState()).toBe("READY");
    } finally {
      await r.close();
    }
  }, 180_000);
});

/* ================================================================== *
 * 2. One permit reopens one Work, exactly once
 * ================================================================== */

describe("§D5-b2 one admission reopens one Work exactly once", () => {
  it("the same permit cannot reopen twice", async () => {
    const r = await rig();
    try {
      await r.drive(TASK);
      const permit = r.permit();
      r.store.appendReworkReopening(r.readyEvent(), permit);
      expect(r.taskState()).toBe("READY");
      // One-shot: the capability is dead after the reopening it authorized. Asserted at the SAME seam the
      // aggregate consumes through, because a second full append of the identical request would legitimately
      // short-circuit at the event store's idempotency resolution — a retry, not a new admission.
      expect(ReworkAdmissionPermit.isLive(permit)).toBe(false);
      let error: unknown;
      try {
        consumeReworkAdmissionPermit(permit, {
          projectId: PROJECT,
          taskId: TASK,
          currentEnvelopeId: r.envelopeOf().envelope_id,
          batchActivationEventId: r.batchActivationId(),
        });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(ReworkAdmissionError);
      expect((error as ReworkAdmissionError).kind).toBe("capability_not_issued");
    } finally {
      await r.close();
    }
  }, 180_000);

  it("a faulted governed append still SPENDS the permit — a rollback does not resurrect authority", async () => {
    const r = await rig();
    try {
      await r.drive(TASK);
      const permit = r.permit();
      const before = r.store.listEvents(PROJECT).length;

      expect(() =>
        r.store.appendReworkReopening(r.readyEvent(), permit, {
          faultHook: (checkpoint) => {
            if (checkpoint === "after_event_insert") throw new SimulatedProcessCrash("between insert and commit");
          },
        }),
      ).toThrow(SimulatedProcessCrash);

      // The transaction rolled back cleanly...
      expect(r.store.listEvents(PROJECT)).toHaveLength(before);
      expect(r.taskState()).toBe("VERIFYING");
      /**
       * ...but the capability did NOT come back. Authority is consumed where it is EXERCISED, so a caller that
       * wants to retry must obtain a fresh admission rather than replay a spent one. Failing closed here is the
       * point: a capability that survived a failed attempt would be a capability that could be retried forever.
       */
      expect(ReworkAdmissionPermit.isLive(permit)).toBe(false);
      expect(() => r.store.appendReworkReopening(r.readyEvent(), permit)).toThrow(/or was already consumed/u);
    } finally {
      await r.close();
    }
  }, 180_000);
});

/* ================================================================== *
 * 3. A capability cannot be forged and is bound to what exists now
 * ================================================================== */

describe("§D5-b2 a rework permit cannot be forged, copied or spent on another request", () => {
  it("a plain object, a STRUCTURAL COPY and a prototype-derived object are all refused", async () => {
    const r = await rig();
    try {
      await r.drive(TASK);
      const genuine = r.permit();
      const forged = {
        projectId: PROJECT,
        taskId: TASK,
        originResultSubjectKind: "attempt_result",
        originResultSubjectRef: "attempt-0",
        originBasisDigest: "a".repeat(64),
        targetObservationDigest: "b".repeat(64),
        currentEnvelopeId: r.envelopeOf().envelope_id,
        batchActivationEventId: r.batchActivationId(),
        reason: "INCOMPATIBLE",
        permitDigest: "d".repeat(64),
      };

      /**
       * A spread copies the brand symbol, because the brand is an own enumerable property. It does NOT
       * produce an instance this module minted, so the registry refuses it — which is exactly why the
       * guarantee is a `WeakSet` of issued instances rather than a property check.
       */
      expect(() => r.store.appendReworkReopening(r.readyEvent(), forged as never)).toThrow(
        /or was already consumed/u,
      );
      const viaPrototype = Object.create(Object.getPrototypeOf(genuine)) as ReworkAdmissionPermit;
      expect(() => r.store.appendReworkReopening(r.readyEvent(), viaPrototype)).toThrow(
        /or was already consumed/u,
      );

      // The GENUINE permit still works, which is what makes the two refusals above meaningful.
      expect(r.store.appendReworkReopening(r.readyEvent(), genuine).event_type).toBe("TASK_READY");
      expect(r.taskState()).toBe("READY");
    } finally {
      await r.close();
    }
  }, 180_000);

  it("a permit for ANOTHER TASK cannot spend here", async () => {
    const r = await rig();
    try {
      await r.drive(TASK);
      let error: unknown;
      try {
        r.store.appendReworkReopening(r.readyEvent(), r.permit("task-b"));
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(ReworkAdmissionError);
      expect((error as ReworkAdmissionError).kind).toBe("capability_binding_mismatch");
      expect(r.taskState()).toBe("VERIFYING");
    } finally {
      await r.close();
    }
  }, 180_000);

  it("a permit bound to a DIFFERENT CURRENT ENVELOPE cannot spend — the set-aside authority is named, not assumed", async () => {
    const r = await rig();
    try {
      await r.drive(TASK);
      const stale = ReworkAdmissionPermit.issue({
        projectId: PROJECT,
        taskId: TASK,
        originResultSubjectKind: "attempt_result",
        originResultSubjectRef: "attempt-0",
        originBasisDigest: "a".repeat(64),
        targetObservationDigest: "b".repeat(64),
        currentEnvelopeId: "envelope-not-what-the-task-carries",
        batchActivationEventId: r.batchActivationId(),
        reason: "INCOMPATIBLE",
      });
      let error: unknown;
      try {
        r.store.appendReworkReopening(r.readyEvent(), stale);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(ReworkAdmissionError);
      expect((error as ReworkAdmissionError).kind).toBe("capability_binding_mismatch");
      expect(String((error as Error).message)).toContain("currentEnvelopeId");
      expect(r.taskState()).toBe("VERIFYING");
    } finally {
      await r.close();
    }
  }, 180_000);

  it("a permit bound to ANOTHER BATCH cannot spend — the set-aside candidate's batch is named", async () => {
    const r = await rig();
    try {
      await r.drive(TASK);
      const wrongBatch = ReworkAdmissionPermit.issue({
        projectId: PROJECT,
        taskId: TASK,
        originResultSubjectKind: "attempt_result",
        originResultSubjectRef: "attempt-0",
        originBasisDigest: "a".repeat(64),
        targetObservationDigest: "b".repeat(64),
        currentEnvelopeId: r.envelopeOf().envelope_id,
        batchActivationEventId: r.batchActivationId() + 1000,
        reason: "INCOMPATIBLE",
      });
      let error: unknown;
      try {
        r.store.appendReworkReopening(r.readyEvent(), wrongBatch);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(ReworkAdmissionError);
      expect((error as ReworkAdmissionError).kind).toBe("capability_binding_mismatch");
      expect(r.taskState()).toBe("VERIFYING");
    } finally {
      await r.close();
    }
  }, 180_000);
});

/* ================================================================== *
 * 4. The ownership line: rebinding is NOT rework's to authorize
 * ================================================================== */

describe("§D5-b2 the ownership line — basis advance belongs to the existing head authority", () => {
  it("a VERIFYING task cannot be reauthorized at all — the structural guard (READY/BLOCKED) is unchanged", async () => {
    const r = await rig();
    try {
      await r.drive(TASK);
      const envelope = r.envelopeOf();
      const event = parseNewEvent({
        schema_version: 1,
        project_id: PROJECT,
        event_type: "TASK_REAUTHORIZED",
        payload_version: 1,
        entity_type: "task",
        entity_id: TASK,
        payload: {
          task_envelope: envelope,
          policy_id: r.policy.policy_id,
          policy_digest: r.policy.digest,
        },
        causation_id: null,
        correlation_id: `task:${TASK}:reauthorized`,
        // Deliberately NOT `envelope.idempotency_key`: the event store resolves a reused key BEFORE the
        // aggregate validator runs, and that refusal would mask the state guard this test measures.
        idempotency_key: "e".repeat(64),
        expected_project_revision: envelope.project_revision,
      });

      // Refused by the structural guard — NOT by a rework admission. Rebinding is head-reconciliation's act,
      // and no rework permit can produce it. Asserted on the generic surface: the governed reopening path
      // only accepts a TASK_READY at all, which is its own scope proof.
      let error: unknown;
      try {
        r.store.append(event);
      } catch (caught) {
        error = caught;
      }
      expect(error).not.toBeInstanceOf(ReworkAdmissionError);
      expect(String((error as Error).message)).toMatch(/TASK_REAUTHORIZED requires a READY or BLOCKED task/u);
      expect(r.taskState()).toBe("VERIFYING");
    } finally {
      await r.close();
    }
  }, 180_000);

  it("the deleted abstraction stays deleted: no two-slot pass, no future envelope, no rework reauthorization", () => {
    /**
     * The two-event closure was measured to be unbuildable and its second slot was a bypass waiting for an
     * ordering bug (a reauthorization arriving AFTER the reopening would see an ordinary READY task and never
     * spend its slot). This pins the deletion, so the shape cannot quietly return.
     */
    const module = source("src/domain/rework_admission.ts");
    expect(module).not.toContain("ReworkClosurePass");
    expect(module).not.toContain("consumeReworkClosureSlot");
    expect(module).not.toContain("freshEnvelope");
    for (const file of ["src/domain/aggregate.ts", "src/state/event_store.ts"]) {
      expect(source(file), `${file} must not reference the deleted pass`).not.toContain("ReworkClosurePass");
      expect(source(file), `${file} must not reference the deleted pass`).not.toContain("reworkPass");
    }
    // And the ONE consumption call site binds the set-aside authority (E_0) and its batch — it has nothing
    // to say about a reauthorization, which is head reconciliation's act.
    const aggregate = source("src/domain/aggregate.ts");
    const callSite = aggregate.slice(
      aggregate.indexOf("consumeReworkAdmissionPermit("),
      aggregate.indexOf("consumeReworkAdmissionPermit(") + 340,
    );
    expect(callSite).toContain("currentEnvelopeId");
    expect(callSite).toContain("batchActivationEventId");
    expect(callSite).not.toContain("TASK_REAUTHORIZED");
  });

  it("the structural path is UNTOUCHED: the guard still ADMITS a READY task", async () => {
    const r = await rig();
    try {
      // A READY task's reauthorization passes the structural guard — head reconciliation's ordinary act.
      expect(r.taskState("task-b")).toBe("READY");
      const envelope = r.policyEnvelope("task-b");
      const event = parseNewEvent({
        schema_version: 1,
        project_id: PROJECT,
        event_type: "TASK_REAUTHORIZED",
        payload_version: 1,
        entity_type: "task",
        entity_id: "task-b",
        payload: {
          task_envelope: envelope,
          policy_id: r.policy.policy_id,
          policy_digest: r.policy.digest,
        },
        causation_id: null,
        correlation_id: "task:task-b:reauthorized",
        idempotency_key: envelope.idempotency_key,
        expected_project_revision: envelope.project_revision,
      });
      /**
       * Asserted at the VALIDATOR, deliberately. A full `append` would be refused by the event store's
       * idempotency resolution — this envelope is the one `TASK_CREATED` already used, because the ProjectIR
       * has not moved — and that refusal would say nothing about the state guard this test is about.
       */
      expect(() => r.store.aggregateValidator.validate(r.store.connection, event)).not.toThrow();
    } finally {
      await r.close();
    }
  }, 180_000);

  it("rebinding an ACTIVE task is still REFUSED — an in-flight attempt is not rework's to disturb", async () => {
    const r = await rig();
    try {
      r.controller.step(); // task-a is ACTIVE
      expect(r.taskState()).toBe("ACTIVE");
      const envelope = r.policyEnvelope();
      expect(() =>
        r.store.append(
          parseNewEvent({
            schema_version: 1,
            project_id: PROJECT,
            event_type: "TASK_REAUTHORIZED",
            payload_version: 1,
            entity_type: "task",
            entity_id: TASK,
            payload: { task_envelope: envelope, policy_id: r.policy.policy_id, policy_digest: r.policy.digest },
            causation_id: null,
            correlation_id: `task:${TASK}:reauthorized`,
            // Again deliberately NOT `envelope.idempotency_key`: the idempotency short-circuit runs first.
            idempotency_key: "e".repeat(64),
            expected_project_revision: envelope.project_revision,
          }),
        ),
      ).toThrow(/TASK_REAUTHORIZED requires a READY or BLOCKED task/u);
    } finally {
      await r.close();
    }
  }, 180_000);
});

/* ================================================================== *
 * 5. The declaration matches the runtime
 * ================================================================== */

describe("§D5-b2 the declared topology says exactly what the runtime does", () => {
  it("the genesis graph DECLARES the governed backward edge, with VERIFYING as its only source", () => {
    const reworkEdges = DEFAULT_STAGE_GRAPH.transitions.filter((entry) => entry.when === "rework-admitted");
    expect(reworkEdges).toHaveLength(1);
    expect(reworkEdges[0]).toMatchObject({ from: "verifying", event: "TASK_READY", to: "READY" });
    expect([...STAGE_WHEN_SOURCE_STATES["rework-admitted"]]).toEqual(["VERIFYING"]);
    expect(Object.keys(STAGE_WHEN_SOURCE_STATES)).toContain("rework-admitted");
  });

  it("the scheduler still does NOT reopen on its own: VERIFYING only ever seeks TASK_SATISFIED", () => {
    const lines = source("src/scheduler/scheduler.ts").split(/\r?\n/u);
    // The DEFINITION, not a call site: the signature line is the one that ends with an open paren.
    const at = lines.findIndex((line) => line.includes("#advanceVerifyingStage(") && line.trim().endsWith("("));
    expect(at).toBeGreaterThan(-1);
    const advancing = lines.slice(at, at + 12).join("\n");
    expect(advancing).toContain('"TASK_SATISFIED"');
    expect(advancing).not.toContain('"TASK_READY"');
  });

  it("NO new canonical vocabulary: the reopening is expressed by the event that already existed", () => {
    const models = source("src/schema/models.ts");
    // §D5-c2 extended the TASK_READY payload with the OPTIONAL durable rework
    // provenance — still the same event type, no new canonical vocabulary:
    expect(models).toContain(
      'TASK_READY: ["previous_state", "new_state", "reason", "batch_activation_event_id", "rework_provenance"]',
    );
    expect(models).not.toMatch(/WORK_REWORK_AUTHORIZED|REWORK_ADMITTED|TASK_REWORK/u);
  });

  it("the admission module is a CAPABILITY, not a store: no database, no clock, no writes", () => {
    const text = source("src/domain/rework_admission.ts");
    for (const forbidden of ["DatabaseSync", "INSERT", "UPDATE", "DELETE", "randomUUID", "new Date"]) {
      expect(text, `rework_admission.ts must not contain "${forbidden}"`).not.toContain(forbidden);
    }
    // And nothing agent-facing reaches the governed append.
    for (const file of ["src/tools/controller.ts", "src/interaction/work_delegation.ts"]) {
      expect(source(file), `${file} must not reach appendReworkReopening`).not.toContain("appendReworkReopening(");
    }
  });
});
