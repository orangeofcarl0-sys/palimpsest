import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ProjectController } from "../src/tools/index.js";
import {
  actionKey,
  DEFAULT_STAGE_GRAPH,
  DomainValidationError,
  parseStageGraphDefinition,
  stableEntityId,
  type StageGraphDefinition,
} from "../src/domain/index.js";
import { Scheduler } from "../src/scheduler/index.js";
import { EventStore } from "../src/state/index.js";
import { canonicalDigest, parseNewEvent, type EvidenceAtom } from "../src/schema/index.js";
import type { AllocationEstimates } from "../src/allocate/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";

import {
  createProjectRequest,
  FakeClock,
  makeProject,
  setupScheduler,
  taskSpec,
  tempStatePath,
  trustedDefaultPolicy,
} from "./helpers.js";

const HEAD = "c".repeat(40);

const BASE: AllocationEstimates = {
  uncertainty: "high",
  verifiability: "deterministic",
  impact: "low",
  evidenceDeficit: 0,
  critical: false,
  expensiveExecution: false,
};

/** H1-D4: a declared graph whose READY stage is scanned before ACTIVE. */
const READY_FIRST_GRAPH: StageGraphDefinition = {
  stages: [
    { id: "queued", state: "READY" },
    { id: "work", state: "ACTIVE" },
    { id: "review", state: "VERIFYING" },
    { id: "waiting", state: "BLOCKED" },
  ],
  transitions: [
    { from: "work", event: "TASK_VERIFYING", to: "VERIFYING", when: "batch-completed-candidate" },
    { from: "work", event: "TASK_READY", to: "READY", when: "batch-failed-budget-remaining" },
    { from: "work", event: "TASK_FAILED", to: "FAILED", when: "attempt-limit-exhausted" },
    { from: "review", event: "TASK_SATISFIED", to: "SATISFIED", when: "promotion-committed" },
    { from: "waiting", event: "TASK_READY", to: "READY", when: "dependencies-satisfied" },
    { from: "queued", event: "TASK_STARTED", to: "ACTIVE", when: "always" },
  ],
  guards: {},
  declared_by: "host-operator",
  reason: "scan order declared ready-first",
};

/** H1-D4: activation is gated on a declared task-evidence guard. */
const GUARDED_GRAPH: StageGraphDefinition = {
  ...READY_FIRST_GRAPH,
  guards: {
    "queued:TASK_STARTED:ACTIVE": [{ exists: { predicate: "tests_pass" } }],
  },
  reason: "activation gated on declared task evidence",
};

/** H1-D4: a declared graph that deliberately omits the activation transition. */
const NO_ACTIVATE_GRAPH: StageGraphDefinition = {
  ...READY_FIRST_GRAPH,
  transitions: [
    { from: "work", event: "TASK_VERIFYING", to: "VERIFYING", when: "batch-completed-candidate" },
    { from: "work", event: "TASK_READY", to: "READY", when: "batch-failed-budget-remaining" },
    { from: "work", event: "TASK_FAILED", to: "FAILED", when: "attempt-limit-exhausted" },
    { from: "review", event: "TASK_SATISFIED", to: "SATISFIED", when: "promotion-committed" },
    { from: "waiting", event: "TASK_READY", to: "READY", when: "dependencies-satisfied" },
  ],
  reason: "no declared way out of the READY stage",
};

/** H1-D6: a renamed topology declared at runtime by the host operator. */
const RENAMED_GRAPH: StageGraphDefinition = {
  stages: [
    { id: "work", state: "ACTIVE" },
    { id: "review", state: "VERIFYING" },
    { id: "waiting", state: "BLOCKED" },
    { id: "queued", state: "READY" },
  ],
  transitions: [
    { from: "work", event: "TASK_VERIFYING", to: "VERIFYING", when: "batch-completed-candidate" },
    { from: "work", event: "TASK_READY", to: "READY", when: "batch-failed-budget-remaining" },
    { from: "work", event: "TASK_FAILED", to: "FAILED", when: "attempt-limit-exhausted" },
    { from: "review", event: "TASK_SATISFIED", to: "SATISFIED", when: "promotion-committed" },
    { from: "waiting", event: "TASK_READY", to: "READY", when: "dependencies-satisfied" },
    { from: "queued", event: "TASK_STARTED", to: "ACTIVE", when: "always" },
  ],
  guards: {},
  declared_by: "host-operator",
  reason: "renamed topology declared at runtime without code change",
};

function makeRig() {
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-h1sg-")), "ops.sqlite"),
    git: new FakeGitPort(HEAD),
  });
  const controller = new ProjectController({
    store,
    effects,
    projectId: "scheduler-project",
    policy: new TaskPolicy({
      policy_id: "trusted-default",
      read_paths: ["src"],
      allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
      network_policy: "deny",
      network_allowlist: [],
      timeout_s: 60,
      lease_s: 10,
      attempt_limit: 8,
      candidate_limit: 4,
    }),
    clock: () => "2026-08-13T00:00:00Z",
  });
  return {
    store,
    controller,
    cleanup: async () => {
      await effects.close();
      store.close();
    },
  };
}

/** Raw Scheduler rig: genesis project + genesis stage graph, no controller. */
function rawRig(taskIds: readonly string[]) {
  const clock = new FakeClock();
  const store = new EventStore(tempStatePath(), { clock: clock.next });
  const project = makeProject(taskIds.map((id) => taskSpec(id)));
  const policy = trustedDefaultPolicy({ attempt_limit: 3, candidate_limit: 2 });
  const scheduler = setupScheduler(store, project, policy);
  for (const id of taskIds) {
    scheduler.registerTask(policy.authorize(project, id));
  }
  return {
    store,
    clock,
    project,
    scheduler,
    cleanup: async () => {
      store.close();
    },
  };
}

function appendStageGraph(
  store: EventStore,
  projectId: string,
  graph: StageGraphDefinition,
  version: number,
): void {
  store.append(
    parseNewEvent({
      schema_version: 1,
      project_id: projectId,
      event_type: "STAGE_GRAPH_DEFINED",
      payload_version: 1,
      entity_type: "stage-graph",
      entity_id: projectId,
      payload: {
        stages: graph.stages,
        transitions: graph.transitions,
        guards: graph.guards,
        declared_by: graph.declared_by,
        reason: graph.reason,
      },
      causation_id: null,
      correlation_id: `stage-graph:${projectId}`,
      idempotency_key: actionKey("stage-graph-v1", { project_id: projectId, version }),
      expected_project_revision: 0,
    }),
  );
}

/** Raw EVIDENCE_ADDED with a task subject: guards evaluate against these views. */
function appendTaskEvidence(
  store: EventStore,
  clock: () => string,
  projectId: string,
  projectDigest: string,
  taskId: string,
): void {
  const evidenceId = stableEntityId(
    "evidence",
    actionKey("evidence-v1", { project_id: projectId, task_id: taskId, predicate: "tests_pass" }),
  );
  const evidence: EvidenceAtom = {
    schema_version: 1,
    project_id: projectId,
    evidence_id: evidenceId,
    subject_type: "task",
    subject_id: taskId,
    subject_digest: canonicalDigest({ task_id: taskId }),
    predicate: "tests_pass",
    value: { exit_code: 0 },
    project_revision: 0,
    input_fingerprint: projectDigest,
    command: ["python", "-m", "pytest"],
    exit_code: 0,
    environment_digest: "e".repeat(64),
    dependency_digest: null,
    observed_artifacts: [],
    producer: "h1-stagegraph-test",
    created_at: clock(),
    status: "active",
  };
  store.append(
    parseNewEvent({
      schema_version: 1,
      project_id: projectId,
      event_type: "EVIDENCE_ADDED",
      payload_version: 1,
      entity_type: "evidence",
      entity_id: evidenceId,
      payload: { evidence },
      causation_id: null,
      correlation_id: `evidence:${evidenceId}`,
      idempotency_key: actionKey("evidence-v1", {
        project_id: projectId,
        task_id: taskId,
        predicate: "tests_pass",
      }),
      expected_project_revision: 0,
    }),
  );
}

function eventCount(store: EventStore): number {
  const row = store.connection.prepare("SELECT COUNT(*) AS total FROM events").get() as {
    total: number;
  };
  return row.total;
}

describe("H1-D3: the default pipeline is a verbatim on-chain declaration (spec 3.4 D-3)", () => {
  it("start() declares the genesis stage graph right after the genesis role table", async () => {
    const { store, controller, cleanup } = makeRig();
    try {
      controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1")],
      });
      const types = (
        store.connection
          .prepare("SELECT event_type FROM events ORDER BY rowid")
          .all() as Array<{ event_type: string }>
      ).map((row) => row.event_type);
      expect(types.slice(0, 3)).toEqual([
        "PROJECT_CREATED",
        "ROLE_TABLE_DEFINED",
        "STAGE_GRAPH_DEFINED",
      ]);
      expect(types).toHaveLength(4); // + TASK_CREATED for task-1

      const row = store.connection
        .prepare("SELECT entity_type, entity_id, payload_json FROM events WHERE event_type='STAGE_GRAPH_DEFINED'")
        .get() as { entity_type: string; entity_id: string; payload_json: Uint8Array };
      expect(row.entity_type).toBe("stage-graph");
      expect(row.entity_id).toBe("scheduler-project");
      const payload = JSON.parse(new TextDecoder().decode(row.payload_json)) as Record<string, unknown>;
      expect(payload.declared_by).toBe("genesis");
      expect(payload.stages).toEqual(DEFAULT_STAGE_GRAPH.stages);
      expect(payload.transitions).toEqual(DEFAULT_STAGE_GRAPH.transitions);
      expect(payload.guards).toEqual(DEFAULT_STAGE_GRAPH.guards);
      expect(payload.reason).toBe(DEFAULT_STAGE_GRAPH.reason);
    } finally {
      await cleanup();
    }
  });

  it("the scheduler runs the default pipeline purely from the declared graph", async () => {
    const { controller, cleanup } = makeRig();
    try {
      controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1")],
      });
      // queued → work activation rides the declared "always" transition.
      const started = controller.step()!;
      expect(started.event_type).toBe("TASK_STARTED");
      const attempts = Array.from({ length: 4 }, () => controller.step()!);
      for (const attempt of attempts) {
        expect(attempt.event_type).toBe("ATTEMPT_CREATED");
      }
      for (let index = 0; index < attempts.length; index += 1) {
        // Interleave claim and report: the claim path enforces role slots
        // (genesis implementer has 2), and a completed attempt frees its slot.
        await controller.claim(attempts[index]!.entity_id);
        controller.report(attempts[index]!.entity_id, {
          workerStatus: "completed",
          summary: `candidate ${index + 1}`,
        });
      }
      // work → review rides the declared "batch-completed-candidate" transition.
      const verifying = controller.step()!;
      expect(verifying.event_type).toBe("TASK_VERIFYING");
      expect(verifying.entity_id).toBe("task-1");
    } finally {
      await cleanup();
    }
  });
});

describe("H1-D4: the scheduler interprets the declared graph (spec 3.4 D-3)", () => {
  it("activation exists only if the declared graph declares it", async () => {
    const { store, project, scheduler, cleanup } = rawRig(["task-1"]);
    try {
      // The declared graph has no way out of READY: the READY task is skipped
      // and the tick is idle — the hardcoded pipeline is gone.
      appendStageGraph(store, project.project_id, NO_ACTIVATE_GRAPH, 2);
      expect(scheduler.runOnce()).toBeNull();

      // Declaring the activation transition brings the pipeline alive.
      appendStageGraph(store, project.project_id, READY_FIRST_GRAPH, 3);
      const started = scheduler.runOnce()!;
      expect(started.event_type).toBe("TASK_STARTED");
      expect(started.entity_id).toBe("task-1");
      expect(scheduler.runOnce()!.event_type).toBe("ATTEMPT_CREATED");
      // The batch is planned at 2 (candidate_limit): after that, the ACTIVE
      // latch stalls the tick — and a second activation is impossible anyway,
      // since a project may have only one active logical Task at a time.
      expect(scheduler.runOnce()!.event_type).toBe("ATTEMPT_CREATED");
      expect(scheduler.runOnce()).toBeNull();
    } finally {
      await cleanup();
    }
  });

  it("declared guards stall activation until the evidence exists (fail-closed)", async () => {
    const { store, clock, project, scheduler, cleanup } = rawRig(["task-1"]);
    try {
      appendStageGraph(store, project.project_id, GUARDED_GRAPH, 2);
      // No evidence: the declared guard is unresolved — a stall, never a pass.
      expect(scheduler.runOnce()).toBeNull();
      // Evidence for a different subject does not unlock task-1's guard.
      appendTaskEvidence(store, clock.next, project.project_id, project.digest, "task-other");
      expect(scheduler.runOnce()).toBeNull();
      // The declared task evidence arrives: the declared transition fires.
      appendTaskEvidence(store, clock.next, project.project_id, project.digest, "task-1");
      const started = scheduler.runOnce()!;
      expect(started.event_type).toBe("TASK_STARTED");
      expect(started.entity_id).toBe("task-1");
    } finally {
      await cleanup();
    }
  });
});

describe("H1-D5: governance and fail-closed defaults (spec 3.4 G4)", () => {
  it("declareStageGraph rejects a topology that strands an occupied state and appends nothing", async () => {
    const { store, controller, cleanup } = makeRig();
    try {
      controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1")],
      });
      controller.step(); // task-1 occupies ACTIVE
      const before = eventCount(store);

      // No ACTIVE stage at all: the occupied state would be stranded.
      const stranded: StageGraphDefinition = {
        stages: [
          { id: "queued", state: "READY" },
          { id: "review", state: "VERIFYING" },
          { id: "waiting", state: "BLOCKED" },
        ],
        transitions: [
          { from: "review", event: "TASK_SATISFIED", to: "SATISFIED", when: "promotion-committed" },
          { from: "waiting", event: "TASK_READY", to: "READY", when: "dependencies-satisfied" },
        ],
        guards: {},
        declared_by: "host-operator",
        reason: "drops the occupied ACTIVE stage",
      };
      expect(() => controller.declareStageGraph(stranded, 2)).toThrow(
        /does not declare the occupied state 'ACTIVE'/,
      );

      // The ACTIVE stage exists but declares no way out of it.
      const deadEnd: StageGraphDefinition = {
        stages: [
          { id: "queued", state: "READY" },
          { id: "work", state: "ACTIVE" },
          { id: "review", state: "VERIFYING" },
        ],
        transitions: [
          { from: "queued", event: "TASK_STARTED", to: "ACTIVE", when: "always" },
          { from: "review", event: "TASK_SATISFIED", to: "SATISFIED", when: "promotion-committed" },
        ],
        guards: {},
        declared_by: "host-operator",
        reason: "work stage cannot reach a terminal state",
      };
      expect(() => controller.declareStageGraph(deadEnd, 2)).toThrow(
        /cannot reach a terminal state through declared transitions/,
      );

      // One-vote veto: neither rejected declaration reached the log.
      expect(eventCount(store)).toBe(before);
      expect(() =>
        controller.declareStageGraph(stranded, 2),
      ).toThrow(DomainValidationError);
    } finally {
      await cleanup();
    }
  });

  it("a scheduler without a declared stage graph fails closed", async () => {
    const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
    try {
      const project = makeProject([taskSpec("task-1")]);
      store.append(createProjectRequest(project) as never);
      const scheduler = new Scheduler(store, project.project_id);
      scheduler.registerPolicy(trustedDefaultPolicy());
      scheduler.registerTask(trustedDefaultPolicy().authorize(project, "task-1"));
      // No STAGE_GRAPH_DEFINED anywhere: deciding is refused, not defaulted.
      expect(() => scheduler.runOnce()).toThrow("stage graph is not declared");
    } finally {
      store.close();
    }
  });

  it("parseStageGraphDefinition rejects malformed declarations with exact errors", () => {
    const base = (): StageGraphDefinition => ({
      stages: DEFAULT_STAGE_GRAPH.stages.map((stage) => ({ ...stage })),
      transitions: DEFAULT_STAGE_GRAPH.transitions.map((transition) => ({ ...transition })),
      guards: {},
      declared_by: "test",
      reason: "unit",
    });
    const cases: Array<{ name: string; graph: unknown; message: string }> = [
      { name: "null definition", graph: null, message: "stage graph definition must be an object" },
      { name: "string definition", graph: "nope", message: "stage graph definition must be an object" },
      { name: "no stages", graph: { ...base(), stages: [] }, message: "stage graph stages must be a non-empty array" },
      {
        name: "unknown stage state",
        graph: { ...base(), stages: [{ id: "a", state: "PAUSED" }] },
        message: "stage state must be a declared task state, got 'PAUSED'",
      },
      {
        name: "duplicate stage id",
        graph: { ...base(), stages: [{ id: "a", state: "ACTIVE" }, { id: "a", state: "VERIFYING" }] },
        message: "duplicate stage id 'a'",
      },
      {
        name: "duplicate stage state",
        graph: { ...base(), stages: [{ id: "a", state: "READY" }, { id: "b", state: "READY" }] },
        message: "duplicate stage state 'READY'",
      },
      {
        name: "no transitions",
        graph: { ...base(), transitions: [] },
        message: "stage graph transitions must be a non-empty array",
      },
      {
        name: "unknown from stage",
        graph: {
          ...base(),
          transitions: base().transitions.map((transition) =>
            transition.from === "ready" ? { ...transition, from: "nope" } : transition,
          ),
        },
        message: "transition from 'nope' is not a declared stage id",
      },
      {
        name: "unknown event",
        graph: {
          ...base(),
          transitions: [{ from: "ready", event: "TASK_NAP", to: "ACTIVE", when: "always" }],
        },
        message: "unknown task event 'TASK_NAP'",
      },
      {
        name: "to does not match the event target",
        graph: {
          ...base(),
          transitions: [{ from: "ready", event: "TASK_STARTED", to: "VERIFYING", when: "always" }],
        },
        message: "transition to 'VERIFYING' does not match the target state of 'TASK_STARTED'",
      },
      {
        name: "to state has no stage",
        graph: {
          ...base(),
          stages: base().stages.filter((stage) => stage.state !== "ACTIVE"),
          transitions: [
            { from: "ready", event: "TASK_STARTED", to: "ACTIVE", when: "always" },
            {
              from: "verifying",
              event: "TASK_SATISFIED",
              to: "SATISFIED",
              when: "promotion-committed",
            },
          ],
        },
        message: "transition to 'ACTIVE' requires a declared stage with that state",
      },
      {
        name: "unknown when",
        graph: {
          ...base(),
          transitions: [{ from: "ready", event: "TASK_STARTED", to: "ACTIVE", when: "sometimes" }],
        },
        message: "unknown transition when 'sometimes'",
      },
      {
        name: "when invalid from state",
        graph: {
          ...base(),
          transitions: [...base().transitions, { from: "active", event: "TASK_STARTED", to: "ACTIVE", when: "always" }],
        },
        message: "transition when 'always' is not valid from state 'ACTIVE'",
      },
      {
        name: "duplicate transition",
        graph: {
          ...base(),
          transitions: [...base().transitions, { from: "ready", event: "TASK_STARTED", to: "ACTIVE", when: "always" }],
        },
        message: "duplicate transition 'ready:TASK_STARTED:ACTIVE'",
      },
      { name: "guards not an object", graph: { ...base(), guards: [] }, message: "stage graph guards must be an object" },
      {
        name: "guard key not a declared transition",
        graph: {
          ...base(),
          guards: { "nope:TASK_STARTED:ACTIVE": [{ exists: { predicate: "tests_pass" } }] },
        },
        message: "guard key 'nope:TASK_STARTED:ACTIVE' does not reference a declared transition",
      },
      {
        name: "guard value not an array",
        graph: {
          ...base(),
          guards: { "ready:TASK_STARTED:ACTIVE": { exists: { predicate: "tests_pass" } } },
        },
        message: "guard 'ready:TASK_STARTED:ACTIVE' must be a clause array",
      },
      { name: "empty declared_by", graph: { ...base(), declared_by: "" }, message: "declared_by must be a non-empty string" },
      { name: "empty reason", graph: { ...base(), reason: "" }, message: "reason must be a non-empty string" },
    ];
    for (const testCase of cases) {
      expect(() => parseStageGraphDefinition(testCase.graph as StageGraphDefinition), testCase.name).toThrow(
        testCase.message,
      );
    }
  });
});

describe("H1-D6: self-rebuild by declaration (spec 3.4 G4)", () => {
  it("a new role and a renamed topology come alive by declaration alone, no code change", async () => {
    const { store, controller, cleanup } = makeRig();
    try {
      controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1"), { ...taskSpec("task-2"), role: "reviewer" }],
      });
      // The reviewer role is not declared yet: host-side allocation fails closed.
      expect(() => controller.allocateFor("task-2", BASE)).toThrow(
        /not declared in the role table/,
      );

      // Declarations only — a new role slot and a renamed stage graph.
      controller.declareRoleTable({
        roles: [
          { role: "implementer", slots: 2 },
          { role: "tester", slots: 1 },
          { role: "verifier", slots: 1 },
          { role: "scout", slots: 2 },
          { role: "analyst", slots: 2 },
          { role: "reviewer", slots: 1 },
        ],
        hardCap: 20,
        declaredBy: "host-operator",
      });
      controller.declareStageGraph(RENAMED_GRAPH, 2);
      const concurrency = controller.allocateFor("task-2", BASE);
      expect(concurrency.concurrency).toMatchObject({ role: "reviewer", slotOfRole: 1 });

      // task-1 runs the renamed pipeline end to end: queued → work → review → SATISFIED.
      const started = controller.step()!;
      expect(started.event_type).toBe("TASK_STARTED");
      expect(started.entity_id).toBe("task-1");
      const attempts = Array.from({ length: 4 }, () => controller.step()!);
      for (const attempt of attempts) {
        expect(attempt.event_type).toBe("ATTEMPT_CREATED");
      }
      const commits: string[] = [];
      for (const attempt of attempts) {
        await controller.claim(attempt.entity_id);
        const committed = await controller.effects.invoke(
          controller.effects.actions.gitCommit,
          { worktreeId: attempt.entity_id, message: `work ${attempt.entity_id}` },
          {
            scope: controller.projectId,
            revision: controller.promotions.projectRevision(),
            callId: `commit:${attempt.entity_id}`,
          },
        );
        commits.push(committed.commit);
        controller.report(attempt.entity_id, {
          workerStatus: "completed",
          summary: "done",
          resultCommit: committed.commit,
        });
      }
      expect(controller.step()!.event_type).toBe("TASK_VERIFYING");
      const gate = await controller.gate({
        attemptId: attempts[0]!.entity_id,
        predicate: "tests_pass",
        command: ["python", "-m", "pytest"],
        exitCode: 0,
      });
      expect(gate.event_type).toBe("EVIDENCE_ADDED");
      const promotion = await controller.promote(attempts[0]!.entity_id, commits[0]!, HEAD);
      expect(promotion.committed.event_type).toBe("PROMOTION_COMMITTED");
      expect(controller.step()!.event_type).toBe("TASK_SATISFIED");

      // task-2 — the new reviewer role — activates under the renamed graph.
      const reviewer = controller.step()!;
      expect(reviewer.event_type).toBe("TASK_STARTED");
      expect(reviewer.entity_id).toBe("task-2");

      // The log carries both declarations; the second supersedes the first.
      const graphs = store.connection
        .prepare(
          "SELECT payload_json FROM events WHERE event_type='STAGE_GRAPH_DEFINED' ORDER BY rowid",
        )
        .all() as Array<{ payload_json: Uint8Array }>;
      expect(graphs).toHaveLength(2);
      const latest = JSON.parse(new TextDecoder().decode(graphs[1]!.payload_json)) as {
        declared_by: string;
        stages: Array<{ id: string }>;
      };
      expect(latest.declared_by).toBe("host-operator");
      expect(latest.stages.map((stage) => stage.id)).toEqual(["work", "review", "waiting", "queued"]);
    } finally {
      await cleanup();
    }
  });
});
