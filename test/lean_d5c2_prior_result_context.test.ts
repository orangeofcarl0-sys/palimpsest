/**
 * PLMP-LEAN-1 §D5-c2 — the PRIOR RESULT CONTEXT, as machine proofs.
 *
 *     Rework history says WHY            (durable rework_provenance on the governed TASK_READY)
 *     ContextManifest says WHAT A1 got   (the optional `continuation` block, compiled per attempt)
 *     Worker transport merely delivers it (D5-c3)
 *
 * The frozen boundaries these proofs pin:
 *
 *     CurrentBasis          ≠  PriorResultContext   — the block never enters the ProjectWorldBasis, the
 *                                                     TaskEnvelope, or the Work semantic identity
 *     TaskLatestContext     ≠  AttemptCompiledContext — fetch(A0) is M0 forever, even after M1 exists
 *     ContextManifest       ≠  Evidence ≠ Admission  — compiled presentation, never authority
 *     Verification(R0)      ⇏  Verification(R1)      — R0's PASS rides as HISTORY, never A1's qualification
 *
 * Every fact the context carries is read from an owner that already holds it: the Event Log (the durable
 * lineage synthesized from the permit), the attempt's own record, the ProjectVerificationStore, and the
 * promotion facts. Nothing is taken from a caller.
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
import {
  ReworkAdmissionError,
  ReworkAdmissionPermit,
  reworkProvenanceFromPermit,
} from "../src/domain/rework_admission.js";
import {
  attemptResultSubjectDigestOf,
  type ProjectVerificationRun,
} from "../src/project_verification/artifacts.js";
import { SqliteProjectVerificationStore } from "../src/project_verification/store.js";
import {
  attemptReportDigestOf,
  normalizeEventPayload,
  parseAttemptReport,
  parseNewEvent,
  parseProjectIr,
  parseTaskEnvelope,
} from "../src/schema/index.js";
import { semanticProjectionDigestOf } from "../src/project_world/index.js";
import { distributeContext } from "../src/context/distribution.js";

import { FakeClock, taskSpec } from "./helpers.js";

const HEAD = "c".repeat(40); // H0
const CLOCK = "2026-09-16T00:00:00Z";
const PROJECT = "d5c2";
const TASKS = ["task-a", "task-b", "task-c"] as const;
const HEX = (seed: string): string => seed.repeat(64).slice(0, 64);

/**
 * The DECLARED topology (D4-0: capacity is what the plan declares). Three tasks must reach VERIFYING
 * together — the frozen genesis graph holds one task per stage, which stalls the second drive — so the
 * deployment declares what it needs, including the D5-b2 rework edge. No new semantics.
 */
const DECLARED_GRAPH: StageGraphDefinition = {
  stages: [
    { id: "active", state: "ACTIVE", concurrency: 3 },
    { id: "verifying", state: "VERIFYING", concurrency: 3 },
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
  declared_by: "d5c2-spec",
  reason: "three tasks must reach VERIFYING together for the prior-result-context proofs",
};

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

/* ================================================================== *
 * Rig — the D5-c1 chain plus A1 and both manifests
 * ================================================================== */

interface Rig {
  readonly store: EventStore;
  readonly controller: ProjectController;
  readonly git: FakeGitPort;
  readonly effects: ReturnType<typeof createPalimpsestEffects>;
  readonly policy: TaskPolicy;
  readonly dir: string;
  attempts: Record<string, string>;
  taskState(taskId: string): string;
  lastEventId(taskId: string): number;
  batchActivationId(taskId: string): number;
  ir(): ReturnType<typeof parseProjectIr>;
  envelopeOf(taskId: string): ReturnType<typeof parseTaskEnvelope>;
  /** The origin attempt's historical envelope (owner: the attempt-authorization resolver). */
  attemptEnvelope(attemptId: string): ReturnType<typeof parseTaskEnvelope> | undefined;
  events(): ReturnType<EventStore["listEvents"]>;
  eventCount(): number;
  resultCommitOf(attemptId: string): string;
  drive(taskId: string): Promise<string>;
  reopen(taskId: string, assessmentDigest?: string): void;
  permit(taskId: string): ReworkAdmissionPermit;
  readyEvent(taskId: string): ReturnType<typeof parseNewEvent>;
  close(): Promise<void>;
}

async function rig(): Promise<Rig> {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-d5c2-"));
  cleanups.push(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows keeps the directory busy while a handle is open; the OS reaps it.
    }
  });
  const store = new EventStore(join(dir, "p.sqlite"), { clock: new FakeClock().next });
  const git = new FakeGitPort(HEAD);
  const effects = createPalimpsestEffects({
    databasePath: join(dir, "o.sqlite"),
    git,
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
  controller.start({
    projectId: PROJECT,
    goal: "g",
    tasks: TASKS.map((taskId) => taskSpec(taskId)),
    stageGraph: DECLARED_GRAPH,
  });
  // Activation rides THREE declared gates: the two stage latches and the role table.
  controller.declareRoleTable({
    roles: [{ role: "implementer", slots: 3 }],
    hardCap: 3,
    declaredBy: "d5c2-spec",
  });

  const row = (taskId: string): { state: string; last_event_id: number; state_json: Uint8Array } =>
    store.connection
      .prepare("SELECT state, last_event_id, state_json FROM tasks WHERE project_id=? AND task_id=?")
      .get(PROJECT, taskId) as { state: string; last_event_id: number; state_json: Uint8Array };
  const activationOf = (taskId: string): number => {
    const anchor = JSON.parse(new TextDecoder().decode(row(taskId).state_json)) as {
      batch_activation_event_id?: number;
    };
    if (anchor.batch_activation_event_id === undefined) {
      throw new Error(`task ${taskId} has no batch anchor`);
    }
    return Number(anchor.batch_activation_event_id);
  };
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

  const attempts: Record<string, string> = {};
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

  return {
    store,
    controller,
    git,
    effects,
    policy,
    dir,
    attempts,
    taskState: (taskId) => String(row(taskId).state),
    lastEventId: (taskId) => Number(row(taskId).last_event_id),
    batchActivationId: (taskId) => activationOf(taskId),
    ir,
    envelopeOf: readEnvelope,
    attemptEnvelope: (attemptId) => {
      const record = controller.attemptWorkRecord(attemptId);
      return record?.envelope === undefined || record?.envelope === null
        ? undefined
        : parseTaskEnvelope(record.envelope);
    },
    events: () => store.listEvents(PROJECT),
    eventCount: () => store.listEvents(PROJECT).length,
    resultCommitOf: (attemptId) => {
      const event = store
        .listEvents(PROJECT)
        .find((entry) => entry.event_type === "ATTEMPT_COMPLETED" && entry.entity_id === attemptId);
      if (event === undefined) throw new Error(`attempt ${attemptId} has no completion`);
      const report = (event.payload as { attempt_report: { result_commit: string } }).attempt_report;
      return report.result_commit;
    },
    drive,
    reopen: (taskId, assessmentDigest) => {
      store.appendReworkReopening(readyEventFor(taskId), permitFor(taskId), {
        ...(assessmentDigest === undefined ? {} : { assessmentDigest }),
      });
    },
    permit: (taskId) => permitFor(taskId),
    readyEvent: (taskId) => readyEventFor(taskId),
    close: async () => {
      try {
        store.close();
      } catch {
        // A test that simulated a restart already closed this store.
      }
      await effects.close();
    },
  };

  function readyEventFor(taskId: string): ReturnType<typeof parseNewEvent> {
    const activationId = activationOf(taskId);
    return parseNewEvent({
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
  }

  function permitFor(taskId: string): ReworkAdmissionPermit {
    return ReworkAdmissionPermit.issue({
      projectId: PROJECT,
      taskId,
      originResultSubjectKind: "attempt_result",
      // The REAL origin attempt when the chain has driven it:
      originResultSubjectRef: attempts[taskId] ?? "origin-" + taskId,
      originBasisDigest: HEX("a"),
      targetObservationDigest: HEX("b"),
      // Bound to the envelope the task ACTUALLY carries:
      currentEnvelopeId: readEnvelope(taskId).envelope_id,
      batchActivationEventId: activationOf(taskId),
      reason: "INCOMPATIBLE",
    });
  }
}

/**
 * The full D5-c2 chain: three tasks VERIFYING at H0, task-a promoted (drift to H1), task-b governed-reopened
 * with a recorded assessment digest, task-c reopened too (quiescence), G10-X head reconciliation, and A1 for
 * task-b started at E1.
 */
async function fullChain(assessmentDigest?: string): Promise<Rig> {
  const r = await rig();
  r.attempts["task-a"] = await r.drive("task-a");
  const a0 = await r.drive("task-b");
  r.attempts["task-b"] = a0;
  r.attempts["task-c"] = await r.drive("task-c");
  await r.controller.promote(r.attempts["task-a"]!, r.resultCommitOf(r.attempts["task-a"]!), HEAD);
  expect(r.controller.step()!.event_type).toBe("TASK_SATISFIED");
  r.reopen("task-b", assessmentDigest);
  r.reopen("task-c");
  const reconciled = await r.controller.reconcileProjectHead();
  expect(reconciled.status).toBe("reconciled");
  // A1 for task-b, on the new basis:
  r.controller.step();
  const created = r.controller.step()!;
  expect(created.event_type).toBe("ATTEMPT_CREATED");
  r.attempts["A1"] = created.entity_id;
  return r;
}

/* ================================================================== *
 * 1–2. The durable lineage: synthesized, crash-safe, no new EventType
 * ================================================================== */

describe("§D5-c2 the governed reopening writes durable lineage — synthesized from the permit", () => {
  it("the landed TASK_READY carries the permit-derived provenance, and a caller-supplied one is DISCARDED", async () => {
    const r = await rig();
    try {
      r.attempts["task-a"] = await r.drive("task-a");
      r.attempts["task-b"] = await r.drive("task-b");
      r.attempts["task-c"] = await r.drive("task-c");
      await r.controller.promote(
        r.attempts["task-a"]!,
        r.resultCommitOf(r.attempts["task-a"]!),
        HEAD,
      );
      r.controller.step();

      // A caller tries to splice its own lineage onto the governed event:
      const forged = r.readyEvent("task-b");
      (forged.payload as Record<string, unknown>).rework_provenance = {
        schema_version: 1,
        origin_result_subject: { kind: "attempt_result", ref: "FORGED-REF" },
        origin_basis_digest: HEX("f"),
        target_observation_digest: HEX("f"),
        current_envelope_id: "FORGED-ENVELOPE",
        reason: "UNKNOWN",
      };
      const permit = r.permit("task-b");
      const landed = r.store.appendReworkReopening(forged, permit, { assessmentDigest: HEX("7") });

      const carried = (landed.payload as { rework_provenance: Record<string, unknown> })
        .rework_provenance;
      const expected = reworkProvenanceFromPermit(permit, HEX("7"));
      // Exactly the permit's lineage — the FORGED record never survived:
      expect(carried).toEqual(expected);
      expect((carried.origin_result_subject as { ref: string }).ref).toBe(r.attempts["task-b"]);
      expect(carried.current_envelope_id).not.toBe("FORGED-ENVELOPE");
      expect(carried.current_envelope_id).toBe(r.envelopeOf("task-b").envelope_id);
      expect(carried.continuation_assessment_digest).toBe(HEX("7"));
    } finally {
      await r.close();
    }
  }, 180_000);

  it("CRASH-SAFE: a fresh EventStore over the same log compiles A1's context with the full lineage", async () => {
    const r = await fullChain(HEX("7"));
    try {
      // Simulate restart: the store closes; a NEW one opens over the same file. The permit is gone from
      // anyone's hands — the compiler must resolve the lineage from the LOG alone.
      const storePath = join(r.dir, "p.sqlite");
      const eventCount = r.store.listEvents(PROJECT).length;
      r.store.close();
      const reopened = new EventStore(storePath, { clock: new FakeClock().next });
      const controller = new ProjectController({
        store: reopened,
        effects: r.effects,
        projectId: PROJECT,
        policy: r.policy,
        clock: () => CLOCK,
      });
      expect(reopened.listEvents(PROJECT)).toHaveLength(eventCount);

      const compiled = await controller.compileTaskContext(r.attempts["A1"]!);
      const continuation = compiled.manifest.continuation;
      expect(continuation).toBeDefined();
      expect(continuation?.lineage.reason).toBe("INCOMPATIBLE");
      expect(continuation?.origin_result.subject.ref).toBe(r.attempts["task-b"]);
      expect(continuation?.lineage.target_observation_digest).toBe(HEX("b"));
      expect(continuation?.lineage.continuation_assessment_digest).toBe(HEX("7"));
      // The lineage's own event is on the log, pointing back:
      const reworkEvent = reopened
        .listEvents(PROJECT)
        .find((event) => event.event_id === continuation?.lineage.rework_event_id);
      expect(reworkEvent?.event_type).toBe("TASK_READY");
      reopened.close();
    } finally {
      await r.close();
    }
  }, 180_000);

  it("NO new EventType: the whole chain rides TASK_READY and CONTEXT_MANIFEST_ADDED only", async () => {
    const r = await fullChain();
    try {
      const compiled = await r.controller.compileTaskContext(r.attempts["A1"]!);
      expect(compiled.manifest.continuation).toBeDefined();
      for (const event of r.events()) {
        expect(event.event_type).not.toMatch(/REWORK|PRIOR_RESULT|CONTINUATION/u);
      }
      // And the canonical vocabulary grew an optional field, not a type:
      const models = readFileSync(join(import.meta.dirname, "../src/schema/models.ts"), "utf8");
      expect(models).not.toMatch(/"(WORK_REWORK_AUTHORIZED|PRIOR_RESULT_CONTEXT_ADDED|CONTINUATION_ADDED)":/u);
    } finally {
      await r.close();
    }
  }, 180_000);
});

/* ================================================================== *
 * 3. Caller cannot splice lineage
 * ================================================================== */

describe("§D5-c2 a caller cannot splice rework lineage", () => {
  it("a VERIFYING task's TASK_READY with forged provenance and NO permit is refused", async () => {
    const r = await rig();
    try {
      r.attempts["task-a"] = await r.drive("task-a");
      r.attempts["task-b"] = await r.drive("task-b");
      r.attempts["task-c"] = await r.drive("task-c");
      const forged = r.readyEvent("task-b");
      (forged.payload as Record<string, unknown>).rework_provenance = reworkProvenanceFromPermit(
        r.permit("task-b"),
      );
      const before = r.eventCount();
      expect(() => r.store.append(forged)).toThrow(ReworkAdmissionError);
      expect(r.eventCount()).toBe(before);
    } finally {
      await r.close();
    }
  }, 180_000);

  it("the admission SPLICE GUARD: provenance on an ordinary (non-VERIFYING) TASK_READY is refused by name", async () => {
    const r = await rig();
    try {
      // task-b is READY — an ordinary task. A syntactically valid TASK_READY
      // for it carries no legal provenance; the event parses, the admission
      // refuses. (No batch anchor is needed: validateAdmission runs before any
      // settlement logic, which is exactly where the guard sits.)
      const permit = ReworkAdmissionPermit.issue({
        projectId: PROJECT,
        taskId: "task-b",
        originResultSubjectKind: "attempt_result",
        originResultSubjectRef: "A0",
        originBasisDigest: HEX("a"),
        targetObservationDigest: HEX("b"),
        currentEnvelopeId: "envelope-hypothetical",
        batchActivationEventId: 1,
        reason: "INCOMPATIBLE",
      });
      const spliced = parseNewEvent({
        schema_version: 1,
        project_id: PROJECT,
        event_type: "TASK_READY",
        payload_version: 1,
        entity_type: "task",
        entity_id: "task-b",
        payload: normalizeEventPayload("TASK_READY", {
          previous_state: "VERIFYING",
          new_state: "READY",
          reason: "rework-admitted",
          batch_activation_event_id: null,
          rework_provenance: reworkProvenanceFromPermit(permit),
        }),
        causation_id: null,
        correlation_id: "splice-probe",
        idempotency_key: HEX("9"),
        expected_project_revision: 0,
      });
      // Asserted at the shipped admission seam the guard lives in:
      expect(() =>
        r.store.aggregateValidator.validateAdmission(r.store.connection, spliced, {}),
      ).toThrow(/only legal on the governed VERIFYING/u);
    } finally {
      await r.close();
    }
  }, 180_000);
});

/* ================================================================== *
 * 4–6. Context is not basis; manifests are per-attempt; no time travel
 * ================================================================== */

describe("§D5-c2 the compiled context: additive, per-attempt, time-travel-free", () => {
  it("CONTEXT NOT BASIS: compiling A1's manifest leaves the Work identity and the basis untouched", async () => {
    const r = await fullChain();
    try {
      const irBefore = r.ir();
      const semanticBefore = semanticProjectionDigestOf(r.envelopeOf("task-b"));
      const eventsBefore = r.eventCount();

      const compiled = await r.controller.compileTaskContext(r.attempts["A1"]!);
      expect(compiled.manifest.continuation).toBeDefined();

      expect(semanticProjectionDigestOf(r.envelopeOf("task-b"))).toBe(semanticBefore);
      expect(r.ir()).toEqual(irBefore);
      // Exactly ONE event was written, and it is the manifest:
      expect(r.eventCount()).toBe(eventsBefore + 1);
      expect(r.events().at(-1)!.event_type).toBe("CONTEXT_MANIFEST_ADDED");
    } finally {
      await r.close();
    }
  }, 180_000);

  it("MANIFEST PER ATTEMPT: M0 has no continuation, M1 does, both deterministic, ids distinct", async () => {
    const r = await fullChain();
    try {
      const m0 = (await r.controller.compileTaskContext(r.attempts["task-b"]!)).manifest;
      const m1 = (await r.controller.compileTaskContext(r.attempts["A1"]!)).manifest;
      expect(m0.continuation).toBeUndefined();
      expect(m1.continuation).toBeDefined();
      expect(m0.manifest_id).not.toBe(m1.manifest_id);
      // Deterministic: recompiling is idempotent by manifest identity.
      const m1again = (await r.controller.compileTaskContext(r.attempts["A1"]!)).manifest;
      expect(m1again).toEqual(m1);
    } finally {
      await r.close();
    }
  }, 180_000);

  it("NO TIME TRAVEL: fetch(A0) is M0's world even after M1 exists — and dies with M0", async () => {
    const r = await fullChain();
    try {
      const m0 = (await r.controller.compileTaskContext(r.attempts["task-b"]!)).manifest;
      await r.controller.compileTaskContext(r.attempts["A1"]!);
      // Exact references always boot, so an artifact handle exists for M0:
      const handle = `@ctx/exact/${m0.exact[0]!.ref}`;
      expect(distributeContext(m0).boot.some((entry) => entry.handle === handle)).toBe(true);
      const viaA0 = await r.controller.fetchContext(r.attempts["task-b"]!, handle!);
      expect(viaA0).toBeDefined();

      // THE DIFFERENTIAL: with M0's row gone, a task-latest lookup would still
      // answer from M1 — the attempt-bound lookup must honestly return nothing.
      r.store.connection
        .prepare("DELETE FROM context_manifests WHERE project_id=? AND manifest_id=?")
        .run(PROJECT, m0.manifest_id);
      const afterLoss = await r.controller.fetchContext(r.attempts["task-b"]!, handle!);
      expect(afterLoss).toBeUndefined();
      // And A1 still reads its own manifest:
      expect(await r.controller.fetchContext(r.attempts["A1"]!, handle!)).toBeDefined();
    } finally {
      await r.close();
    }
  }, 180_000);
});

/* ================================================================== *
 * 7–9. Interpretation is labelled; verification is historical; coordinates only
 * ================================================================== */

describe("§D5-c2 the continuation block: labelled interpretation, historical verification, coordinates", () => {
  it("the origin worker's summary rides as worker_summary — an interpretation, never evidence", async () => {
    const r = await fullChain();
    try {
      const compiled = await r.controller.compileTaskContext(r.attempts["A1"]!);
      const continuation = compiled.manifest.continuation!;
      expect(continuation.prior_execution?.worker_summary).toBe("done");
      expect(Array.isArray(continuation.prior_execution?.observed_changed_files)).toBe(true);
      // It is presentation inside the manifest, NOT a member of the evidence list:
      expect(compiled.manifest.evidence).not.toContain(continuation.prior_execution?.worker_summary);
    } finally {
      await r.close();
    }
  }, 180_000);

  it("HISTORICAL VERIFICATION: R0's PASS rides as history, and A1's own qualification stays empty", async () => {
    const r = await fullChain();
    try {
      const a0 = r.attempts["task-b"]!;
      const e0 = r.envelopeOf("task-b");
      const resultCommit = r.resultCommitOf(a0);
      const reportRaw = r.store.connection
        .prepare("SELECT report_json FROM attempts WHERE project_id=? AND attempt_id=?")
        .get(PROJECT, a0) as { report_json: Uint8Array };
      const report = parseAttemptReport(JSON.parse(new TextDecoder().decode(reportRaw.report_json)));
      const subjectBase = {
        schemaVersion: 1 as const,
        kind: "ATTEMPT_RESULT" as const,
        projectId: PROJECT,
        taskId: "task-b",
        attemptId: a0,
        envelopeId: e0.envelope_id,
        baseCommit: e0.base_commit,
        resultCommit,
        reportDigest: attemptReportDigestOf(report),
      };
      const subject = { ...subjectBase, digest: attemptResultSubjectDigestOf(subjectBase) };
      const store = new SqliteProjectVerificationStore(join(r.dir, "pv.sqlite"));
      const started = store.appendStart({
        projectId: PROJECT,
        requestRef: "req-r0",
        requestDigest: HEX("3"),
        subject,
        verifierRef: "mechanical-v1",
        verifierDefinitionDigest: HEX("4"),
        independence: "MECHANICAL_INDEPENDENT",
        startedAt: CLOCK,
      });
      store.appendCompletion({
        projectId: PROJECT,
        runId: started.runId,
        verdict: "PASS",
        freshness: "CURRENT",
        resultDigest: HEX("5"),
        finishedAt: CLOCK,
      });

      const compiled = await r.controller.compileTaskContext(r.attempts["A1"]!, {
        verificationHistory: store,
      });
      const history = compiled.manifest.continuation!.verification;
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        run_id: started.runId,
        verifier_ref: "mechanical-v1",
        verdict: "PASS",
        freshness: "CURRENT",
        independence: "MECHANICAL_INDEPENDENT",
      });
      // A1's own subject has NO runs: R0's PASS is not A1's qualification.
      const a1Runs = store
        .list(PROJECT)
        .filter(
          (run: ProjectVerificationRun) =>
            run.subject.kind === "ATTEMPT_RESULT" && run.subject.attemptId === r.attempts["A1"],
        );
      expect(a1Runs).toHaveLength(0);
      store.close();
    } finally {
      await r.close();
    }
  }, 180_000);

  it("NO VERIFICATION HISTORY declared ⇒ the block carries none (honest absence, never fabrication)", async () => {
    const r = await fullChain();
    try {
      const compiled = await r.controller.compileTaskContext(r.attempts["A1"]!);
      expect(compiled.manifest.continuation!.verification).toEqual([]);
    } finally {
      await r.close();
    }
  }, 180_000);

  it("WORLD COORDINATES ONLY: refs are carried, no merge machinery exists in the compiler", async () => {
    const r = await fullChain();
    try {
      const compiled = await r.controller.compileTaskContext(r.attempts["A1"]!);
      const transition = compiled.manifest.continuation!.world_transition;
      expect(transition.from_head).toBe(HEAD);
      expect(transition.to_head).toBe(r.ir().head_commit);
      expect(transition.to_head).not.toBe(HEAD);
      expect(transition.promotion_event_refs.length).toBeGreaterThan(0);
      // Coordinates, not interpretations: compiling is idempotent with zero new events...
      const before = r.eventCount();
      await r.controller.compileTaskContext(r.attempts["A1"]!);
      expect(r.eventCount()).toBe(before);
      // ...and the compiler carries no merge/apply machinery at all:
      const module = readFileSync(join(import.meta.dirname, "../src/context/prior_result.ts"), "utf8");
      for (const forbidden of ["cherry-pick", "git apply", "execFileSync", "spawnSync"]) {
        expect(module).not.toContain(forbidden);
      }
    } finally {
      await r.close();
    }
  }, 180_000);
});

/* ================================================================== *
 * 10. Ordinary attempts are byte-compatibly unchanged
 * ================================================================== */

describe("§D5-c2 ordinary attempts: the manifest shape is unchanged", () => {
  it("a non-rework attempt's manifest has NO continuation and round-trips the closed parser", async () => {
    const r = await fullChain();
    try {
      const m0 = (await r.controller.compileTaskContext(r.attempts["task-a"]!)).manifest;
      expect(m0.continuation).toBeUndefined();
      // Round-trip through the closed contract parser via the projected row:
      const row = r.store.connection
        .prepare("SELECT manifest_json FROM context_manifests WHERE project_id=? AND manifest_id=?")
        .get(PROJECT, m0.manifest_id) as { manifest_json: Uint8Array };
      const reparsed = JSON.parse(new TextDecoder().decode(row.manifest_json)) as Record<string, unknown>;
      expect(reparsed).toEqual(m0);
    } finally {
      await r.close();
    }
  }, 180_000);
});

/* ================================================================== *
 * The slice adds no product surface beyond the two declared blocks
 * ================================================================== */

describe("§D5-c2 adds no product surface beyond the declared blocks", () => {
  it("the context module imports no authority plane", () => {
    const module = readFileSync(join(import.meta.dirname, "../src/context/prior_result.ts"), "utf8");
    for (const forbidden of [
      "promotion_eligibility",
      "promotion_terminal_admission",
      "rework_admission",
      "effects/",
      "state/event_store",
    ]) {
      expect(module, `prior_result.ts must not import ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("the guard planes do not read the context block", () => {
    for (const file of [
      "src/domain/promotion_eligibility.ts",
      "src/domain/promotion_terminal_admission.ts",
      "src/domain/rework_admission.ts",
      "src/effects/promotion.ts",
    ]) {
      const text = readFileSync(join(import.meta.dirname, "..", file), "utf8");
      expect(text, `${file} must not consume PriorResultContext`).not.toContain("prior_result");
      expect(text, `${file} must not consume PriorResultContext`).not.toContain("PriorResultContext");
    }
  });
});
