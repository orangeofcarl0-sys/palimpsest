/**
 * PLMP-LEAN-1 §D5-b2 — GOVERNED rework admission, as machine proofs.
 *
 *     VERIFYING@E_0  →  READY@E_1
 *
 * §D5-b measured that the aggregate ALREADY accepted `TASK_READY` on a VERIFYING task, because the state
 * machine lists VERIFYING among `TASK_READY`'s allowed sources. Declaring the stage-graph edge without a gate
 * would therefore have let any internal caller reopen verified work with no continuation assessment at all.
 * This file proves what §D5-b2 actually closed, and — just as importantly — what it did NOT.
 *
 * ## What is proven live
 *
 *   the `TASK_READY` half is GOVERNED. A fully and correctly caused append — right `previous_state`, right
 *   `causation_id`, the batch's own activation id, the deterministic settlement key, an attempt budget left —
 *   is refused by name without a closure pass, and accepted with one. That refusal is the whole point:
 *   everything structural already matched, and the only missing thing was AUTHORITY.
 *
 * ## What is proven NOT reachable, and why the honest reading is §D5-c rather than a bug here
 *
 *   the `TASK_REAUTHORIZED` half cannot be appended for a VERIFYING task, so the admission branch that guards
 *   it is unreachable code. TWO independent structural refusals stand in front of it:
 *
 *     1. `#validateTaskReauthorized` admits only READY/BLOCKED, and it runs in `validate()` — before
 *        admissions are examined at all;
 *     2. even past (1), no fresh envelope EXISTS. `TASK_REAUTHORIZED` must carry an envelope matching the
 *        CURRENT ProjectIR, while `envelope_id` and `idempotency_key` are digests over exactly (project, task,
 *        revision, digest, policy). The projects row advances only through PROJECT_REVISED, which
 *        `planReconciled` gates on quiescence — which a VERIFYING task blocks.
 *
 *   So `E_1` is unobtainable exactly when a rework needs it, and the closure is neither completable nor
 *   breakable as specified. The tests below PIN that, so the gap cannot be quietly forgotten or mistaken for
 *   working code.
 *
 * ## The trust boundary (the same one the promotion permits declare)
 *
 * These proofs defend against a generic `EventStore.append` caller, a module writer, an accidental alternate
 * ingestion path. They do not defend against arbitrary code already running in this process.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  ReworkAdmissionError,
  ReworkAdmissionPermit,
  ReworkClosurePass,
  consumeReworkClosureSlot,
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
  /** Drive one task to a COMPLETED candidate sitting in VERIFYING, as the real pipeline does. */
  drive(taskId: string): Promise<void>;
  policyEnvelope(taskId?: string): ReturnType<typeof parseTaskEnvelope>;
  /** A structurally complete, correctly caused TASK_READY — what a generic caller could build. */
  readyEvent(): ReturnType<typeof parseNewEvent>;
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
  const activationOf = (taskId: string): number =>
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
    drive: driveToVerifying,
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
    close: async () => {
      await effects.close();
      store.close();
    },
  };
}

/** A permit for this rig's task, well-formed in every field. */
function permitFor(r: Rig, freshEnvelopeId: string, taskId = TASK) {
  return ReworkAdmissionPermit.issue({
    projectId: PROJECT,
    taskId,
    originResultSubjectKind: "attempt_result",
    originResultSubjectRef: "attempt-0",
    originBasisDigest: "a".repeat(64),
    targetObservationDigest: "b".repeat(64),
    freshEnvelopeId,
    freshEnvelopeDigest: "c".repeat(64),
    reason: "INCOMPATIBLE",
  });
}

const passFor = (r: Rig, freshEnvelopeId: string, taskId = TASK) =>
  ReworkClosurePass.issue({ permit: permitFor(r, freshEnvelopeId, taskId), targetObservationDigest: "b".repeat(64) });

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

  it("the SAME event is ACCEPTED through the governed closure — the difference is authority, not shape", async () => {
    const r = await rig();
    try {
      await r.drive(TASK);
      const event = r.readyEvent();

      // Refused on the generic surface...
      expect(() => r.store.append(event)).toThrow(ReworkAdmissionError);

      // ...and accepted through the governed path with a pass for this task and envelope.
      const pass = passFor(r, r.envelopeOf().envelope_id);
      const landed = r.store.appendReworkClosure([event], pass);
      expect(landed.map((entry) => entry.event_type)).toEqual(["TASK_READY"]);
      expect(r.taskState()).toBe("READY");
    } finally {
      await r.close();
    }
  }, 180_000);

  it("ordinary Work revision is UNTOUCHED: the structural guard still ADMITS a READY task", async () => {
    const r = await rig();
    try {
      // task-b is READY, which is plan reconciliation's retained set — the gate must not reach it.
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
});

/* ================================================================== *
 * 2. A capability cannot be forged
 * ================================================================== */

describe("§D5-b2 a rework pass cannot be forged or copied", () => {
  it("a plain object shaped like a pass is refused", async () => {
    const r = await rig();
    try {
      await r.drive(TASK);
      const genuine = passFor(r, r.envelopeOf().envelope_id);
      const forged = {
        projectId: PROJECT,
        taskId: TASK,
        permitDigest: "d".repeat(64),
        targetObservationDigest: "b".repeat(64),
        freshEnvelopeId: r.envelopeOf().envelope_id,
        passDigest: "e".repeat(64),
        consumeSlot: () => undefined,
      };
      let error: unknown;
      try {
        r.store.appendReworkClosure([r.readyEvent()], forged as never);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(ReworkAdmissionError);
      expect((error as ReworkAdmissionError).kind).toBe("capability_not_issued");
      expect(r.taskState()).toBe("VERIFYING");
      void genuine;
    } finally {
      await r.close();
    }
  }, 180_000);

  it("a STRUCTURAL COPY of a genuine pass is refused — the registry, not the shape, is the authority", async () => {
    const r = await rig();
    try {
      await r.drive(TASK);
      const genuine = passFor(r, r.envelopeOf().envelope_id);

      /**
       * A spread copies the brand symbol, because the brand is an own enumerable property. It does NOT
       * produce an instance this module minted, so the registry refuses it — which is exactly why the
       * guarantee is a `WeakSet` of issued instances rather than a property check.
       */
      const copy = { ...genuine } as unknown as ReworkClosurePass;
      expect(() => r.store.appendReworkClosure([r.readyEvent()], copy)).toThrow(ReworkAdmissionError);

      // And the prototype route is refused the same way.
      const viaPrototype = Object.create(Object.getPrototypeOf(genuine)) as ReworkClosurePass;
      expect(() => r.store.appendReworkClosure([r.readyEvent()], viaPrototype)).toThrow(ReworkAdmissionError);

      // The GENUINE pass still works, which is what makes the two refusals above meaningful.
      expect(r.store.appendReworkClosure([r.readyEvent()], genuine)).toHaveLength(1);
      expect(r.taskState()).toBe("READY");
    } finally {
      await r.close();
    }
  }, 180_000);

  it("a pass is bound to ONE task: another task's pass is refused", async () => {
    const r = await rig();
    try {
      await r.drive(TASK);
      const foreign = passFor(r, r.envelopeOf().envelope_id, "task-b");
      let error: unknown;
      try {
        r.store.appendReworkClosure([r.readyEvent()], foreign);
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
 * 3. One admission reopens exactly one Work
 * ================================================================== */

describe("§D5-b2 one admission reopens one Work exactly once", () => {
  it("the same pass cannot reopen twice", async () => {
    const r = await rig();
    try {
      await r.drive(TASK);
      const pass = passFor(r, r.envelopeOf().envelope_id);
      r.store.appendReworkClosure([r.readyEvent()], pass);
      expect(r.taskState()).toBe("READY");

      // The TASK_READY slot is spent, and a second use of it is refused by the very path the aggregate
      // calls. Asserted on the consumption function because a second full append would first fail the
      // task's `previous_state` check (the task is READY now), which is a different fact.
      expect(pass.remainingSlots()).not.toContain("TASK_READY");
      let error: unknown;
      try {
        consumeReworkClosureSlot(pass, {
          projectId: PROJECT,
          taskId: TASK,
          eventType: "TASK_READY",
          freshEnvelopeId: null,
        });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(ReworkAdmissionError);
      expect((error as ReworkAdmissionError).kind).toBe("rework_closure_slot_unavailable");
    } finally {
      await r.close();
    }
  }, 180_000);

  it("the reauthorization slot is bound to the pass's OWN fresh envelope", () => {
    /**
     * PROVEN AT THE MODULE, because the event that would exercise it end-to-end is unreachable (§4). The
     * binding is still real and still refuses: a pass minted for envelope E does not authorize rebinding to
     * any other envelope, which is what stops a pass from being reused for a different basis.
     */
    const pass = ReworkClosurePass.issue({
      permit: ReworkAdmissionPermit.issue({
        projectId: PROJECT,
        taskId: TASK,
        originResultSubjectKind: "attempt_result",
        originResultSubjectRef: "attempt-0",
        originBasisDigest: "a".repeat(64),
        targetObservationDigest: "b".repeat(64),
        freshEnvelopeId: "E1",
        freshEnvelopeDigest: "c".repeat(64),
        reason: "INCOMPATIBLE",
      }),
      targetObservationDigest: "b".repeat(64),
    });
    const expectSlot = (envelopeId: string): void =>
      consumeReworkClosureSlot(pass, {
        projectId: PROJECT,
        taskId: TASK,
        eventType: "TASK_REAUTHORIZED",
        freshEnvelopeId: envelopeId,
      });

    // The wrong envelope is refused...
    expect(() => expectSlot("E2")).toThrow(ReworkAdmissionError);
    expect(() => expectSlot("E2")).toThrow(/authorizes rebinding to envelope E1/u);
    // ...and the slot survives that refusal, so a mismatch cannot spend it.
    expect(pass.remainingSlots()).toContain("TASK_REAUTHORIZED");
    expect(() => expectSlot("E1")).not.toThrow();
    // Spent once, and never again.
    expect(() => expectSlot("E1")).toThrow(/does not authorize another TASK_REAUTHORIZED/u);
  });

  it("a faulted governed append still SPENDS the slot — a rollback does not resurrect authority", async () => {
    const r = await rig();
    try {
      await r.drive(TASK);
      const pass = passFor(r, r.envelopeOf().envelope_id);
      const before = r.store.listEvents(PROJECT).length;

      expect(() =>
        r.store.appendReworkClosure([r.readyEvent()], pass, {
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
      expect(pass.remainingSlots()).not.toContain("TASK_READY");
      expect(() => r.store.appendReworkClosure([r.readyEvent()], pass)).toThrow(/does not authorize another/u);
    } finally {
      await r.close();
    }
  }, 180_000);
});

/* ================================================================== *
 * 4. The reauthorization half is NOT reachable — pinned, not hidden
 * ================================================================== */

describe("§D5-b2 the TASK_REAUTHORIZED half of the closure is not yet reachable", () => {
  it("the structural guard refuses it — and it runs BEFORE admissions are examined", async () => {
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
        // DELIBERATELY not `envelope.idempotency_key`: the event store resolves a reused key BEFORE the
        // aggregate validator runs, and that refusal would mask the state guard this test measures.
        idempotency_key: "e".repeat(64),
        expected_project_revision: envelope.project_revision,
      });

      // The refusal comes from `validate()`, which runs first — so the admission branch never sees this event.
      let error: unknown;
      try {
        r.store.appendReworkClosure([event], passFor(r, envelope.envelope_id));
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

  it("no FRESH envelope can exist for a VERIFYING task, which is why the half is unobtainable", async () => {
    const r = await rig();
    try {
      await r.drive(TASK);
      const current = r.envelopeOf();
      const currentIr = r.ir();

      /**
       * THE STRUCTURAL REASON, asserted rather than argued. The policy's envelope is a pure function of
       * (project, task, revision, digest, policy), so for an UNCHANGED ProjectIR it reproduces the task's
       * existing envelope byte for byte — including its idempotency key, which `TASK_CREATED` already spent.
       */
      const reauthorized = r.policyEnvelope();
      expect(reauthorized.envelope_id).toBe(current.envelope_id);
      expect(reauthorized.idempotency_key).toBe(current.idempotency_key);

      // And the ProjectIR cannot have moved: nothing but PROJECT_REVISED writes those columns, and
      // plan reconciliation gates it on quiescence, which this VERIFYING task denies.
      const project = r.store.connection
        .prepare("SELECT revision, digest, head_commit FROM projects WHERE project_id=?")
        .get(PROJECT) as { revision: number; digest: string; head_commit: string };
      expect(Number(project.revision)).toBe(currentIr.revision);
      expect(String(project.digest)).toBe(currentIr.digest);
      expect(reauthorized.project_revision).toBe(currentIr.revision);
      expect(reauthorized.project_digest).toBe(currentIr.digest);
      expect(reauthorized.base_commit).toBe(String(project.head_commit));

      // So `E_1` is unobtainable exactly when the rework needs it: E_0 is the only envelope that can be named.
      const projector = source("src/state/projector.ts");
      expect(projector).toContain("SET revision=?, digest=?, head_commit=?");
      expect(source("src/domain/plan_reconciliation.ts")).toContain('const RUNNABLE_TASK_STATES: ReadonlySet<string> = new Set(["READY", "BLOCKED"])');
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
    // The edge is declared because the governed closure exists — not as a licence for the scheduler.
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

  it("NO new canonical vocabulary: the closure is expressed with the two events that already existed", () => {
    const models = source("src/schema/models.ts");
    // The reopening is `TASK_REAUTHORIZED` + `TASK_READY`; no rework-specific EventType was invented.
    expect(models).toContain('TASK_REAUTHORIZED: ["task_envelope", "policy_id", "policy_digest"]');
    expect(models).not.toMatch(/WORK_REWORK_AUTHORIZED|REWORK_ADMITTED|TASK_REWORK/u);
  });

  it("the admission module is a CAPABILITY, not a store: no database, no clock, no writes", () => {
    const text = source("src/domain/rework_admission.ts");
    for (const forbidden of ["DatabaseSync", "INSERT", "UPDATE", "DELETE", "randomUUID", "new Date"]) {
      expect(text, `rework_admission.ts must not contain "${forbidden}"`).not.toContain(forbidden);
    }
    // And nothing agent-facing reaches the governed append.
    for (const file of ["src/tools/controller.ts", "src/interaction/work_delegation.ts"]) {
      expect(source(file), `${file} must not reach appendReworkClosure`).not.toContain("appendReworkClosure(");
    }
  });
});

/* ================================================================== *
 * 6. The reauthorization guard still protects what it always did
 * ================================================================== */

describe("§D5-b2 the READY/BLOCKED guard is unchanged for every other state", () => {
  it("rebinding an ACTIVE task is still refused — D5-b2 relaxed nothing", async () => {
    const r = await rig();
    try {
      r.controller.step(); // task-a is ACTIVE
      r.controller.step(); // task-b cannot start: the single-active latch holds
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
