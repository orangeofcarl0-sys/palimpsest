/**
 * G9-F2 residual closure (spec 35 addendum): DURABLE-PARSE-A01..A05 - the
 * ledger never accepts a declaration that a canonical reader would consider
 * structurally invalid (WIRE-INV-3). Full grammar validation lives at the
 * shared durable seam (normalizeEventPayload, inside the append
 * transaction), so controller paths, direct append paths, and replay all
 * enforce it; a rejected declaration writes zero event/projection state.
 */
import { describe, expect, it } from "vitest";
import { join } from "node:path";

import {
  DEFAULT_STAGE_GRAPH,
  parseGateDefinition,
  parseStageGraphDefinition,
} from "../src/domain/index.js";
import { parseNewEvent } from "../src/schema/index.js";
import { EventStore, snapshotDigest } from "../src/state/index.js";
import { ProjectController } from "../src/tools/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";
import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);
const PROJECT = "declaration-project";

const makeRig = () => {
  const statePath = tempStatePath();
  const store = new EventStore(statePath, { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({
    databasePath: join(tempStatePath(), "ops.sqlite"),
    git: new FakeGitPort(HEAD),
  });
  const controller = new ProjectController({
    store,
    effects,
    projectId: PROJECT,
    policy: new TaskPolicy({
      policy_id: "trusted-default",
      read_paths: ["src"],
      allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
      network_policy: "deny",
      network_allowlist: [],
      timeout_s: 60,
      lease_s: 10,
      attempt_limit: 3,
      candidate_limit: 1,
    }),
    clock: () => "2026-09-08T00:00:00Z",
  });
  return { statePath, store, controller, cleanup: () => Promise.all([effects.close(), store.close()]) };
};

const eventCount = (store: EventStore): number => {
  const row = store.connection.prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number };
  return Number(row.n);
};

const canonicalGate = {
  gate_id: "gate-release",
  version: 1,
  subject_type: "attempt" as const,
  require: { mode: "all" as const, chain: [{ exists: { predicate: "tests_pass" } }] },
};

const canonicalStageGraph = () =>
  parseStageGraphDefinition({
    ...DEFAULT_STAGE_GRAPH,
    guards: { "ready:TASK_STARTED:ACTIVE": [{ exists: { predicate: "tests_pass" } }] },
    declared_by: "g9-f2-test",
    reason: "durable declaration probe",
  });

describe("durable declaration validation (G9-F2 DURABLE-PARSE)", () => {
  it("DURABLE-PARSE-A01: a malformed gate declaration is rejected at the lowest append seam, writing nothing", async () => {
    const rig = makeRig();
    try {
      rig.controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec("task-1")] });
      const beforeCount = eventCount(rig.store);
      const beforeSnapshot = JSON.stringify(snapshotDigest(rig.store.connection));
      // Clause typo inside the CANONICAL face, via the direct EventStore seam.
      const malformed = {
        ...canonicalGate,
        require: { mode: "all", chain: [{ exists: { predicate: "tests_pass", wheer: {} } }] },
      };
      expect(() =>
        rig.controller.declareGate(malformed as never, "audit"),
      ).toThrow(/unknown field 'wheer' inside the exists clause/);
      expect(eventCount(rig.store)).toBe(beforeCount);
      expect(JSON.stringify(snapshotDigest(rig.store.connection))).toBe(beforeSnapshot);
      // Same typo through declareGate (public controller seam): rejected too.
      expect(() =>
        rig.controller.declareGate(
          { ...canonicalGate, require: { mode: "all", chain: [{ exists: { predicate: "nope_not_known" } }] } } as never,
          "audit",
        ),
      ).toThrow(/unknown evidence predicate/);
      expect(eventCount(rig.store)).toBe(beforeCount);
      expect(
        (rig.store.connection.prepare("SELECT COUNT(*) AS n FROM gate_registry").get() as { n: number }).n,
      ).toBe(0);
    } finally {
      await rig.cleanup();
    }
  });

  it("DURABLE-PARSE-A02: a malformed stage graph is rejected before commit", async () => {
    const rig = makeRig();
    try {
      rig.controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec("task-1")] });
      const beforeCount = eventCount(rig.store);
      const beforeSnapshot = JSON.stringify(snapshotDigest(rig.store.connection));
      const revision = rig.controller.promotions.projectRevision();
      const base = canonicalStageGraph();
      // Unknown stage-graph nested field (stage typo).
      const typo = {
        ...base,
        stages: [...base.stages.slice(0, 3), { id: "ready", state: "READY", concurency: 2 }, base.stages[3]!],
      };
      expect(() => rig.controller.declareStageGraph(typo as never, 1)).toThrow(
        /unknown stage graph field 'concurency'/,
      );
      // Invalid transition target through the direct append seam.
      expect(() =>
        rig.store.append(
          parseNewEvent({
            schema_version: 1,
            project_id: PROJECT,
            event_type: "STAGE_GRAPH_DEFINED",
            payload_version: 1,
            entity_type: "stage-graph",
            entity_id: PROJECT,
            payload: {
              ...base,
              transitions: [
                { from: "active", event: "TASK_FAILED", to: "DONE", when: "attempt-limit-exhausted" },
              ],
            },
            causation_id: null,
            correlation_id: "durable-probe",
            idempotency_key: "a".repeat(64),
            expected_project_revision: revision,
          }),
        ),
      ).toThrow(/does not match the target state/);
      expect(eventCount(rig.store)).toBe(beforeCount);
      expect(JSON.stringify(snapshotDigest(rig.store.connection))).toBe(beforeSnapshot);
    } finally {
      await rig.cleanup();
    }
  });

  it("DURABLE-PARSE-A03: a valid gate declaration replays identically after reopen", async () => {
    const rig = makeRig();
    let event: ReturnType<typeof rig.controller.declareGate> | undefined;
    try {
      rig.controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec("task-1")] });
      event = rig.controller.declareGate(parseGateDefinition({
        gate_id: "gate-release",
        version: 1,
        subject_type: "attempt",
        require: { all: [{ exists: { predicate: "tests_pass" } }] },
      }), "g9-f2-test");
      const stored = event.payload as { gate: unknown };
      expect(stored.gate).toEqual(canonicalGate);
    } finally {
      await rig.cleanup();
    }
    // Reopen the SAME ledger: the canonical reader must accept and re-derive
    // the exact stored form (replay = clean full revalidation).
    const reopened = new EventStore(rig.statePath, { clock: new FakeClock().next });
    try {
      reopened.verifyFull();
      const replayed = reopened
        .listEvents(PROJECT)
        .find((candidate) => candidate.event_type === "GATE_DEFINED");
      expect(replayed).toBeDefined();
      expect((replayed!.payload as { gate: unknown }).gate).toEqual(canonicalGate);
      expect(replayed!.event_digest).toBe(event!.event_digest);
    } finally {
      await reopened.close();
    }
  });

  it("DURABLE-PARSE-A04: a valid stage graph replays identically after reopen", async () => {
    const rig = makeRig();
    let event: ReturnType<typeof rig.controller.start> | undefined;
    let declared: unknown;
    try {
      rig.controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec("task-1")] });
      const graph = canonicalStageGraph();
      // Genesis already declared version 1; supersede with version 2.
      event = rig.controller.declareStageGraph(graph, 2);
      declared = (event.payload as { stages: unknown; transitions: unknown }).transitions;
    } finally {
      await rig.cleanup();
    }
    const reopened = new EventStore(rig.statePath, { clock: new FakeClock().next });
    try {
      reopened.verifyFull();
      const replayed = reopened
        .listEvents(PROJECT)
        .filter((candidate) => candidate.event_type === "STAGE_GRAPH_DEFINED")
        .at(-1);
      expect(replayed).toBeDefined();
      expect((replayed!.payload as { transitions: unknown }).transitions).toEqual(declared);
      expect(replayed!.event_digest).toBe(event!.event_digest);
      // The stored form is still a valid StageGraphDefinition on read.
      expect(parseStageGraphDefinition(replayed!.payload)).toEqual(replayed!.payload);
    } finally {
      await reopened.close();
    }
  });

  it("DURABLE-PARSE-A05: a rejected declaration leaves zero partial event/projection state", async () => {
    const rig = makeRig();
    try {
      rig.controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec("task-1")] });
      const beforeCount = eventCount(rig.store);
      const beforeSnapshot = JSON.stringify(snapshotDigest(rig.store.connection));
      const beforeRegistry = (
        rig.store.connection.prepare("SELECT COUNT(*) AS n FROM gate_registry").get() as { n: number }
      ).n;
      // Authoring face is NOT the durable face - appending it must fail and
      // leave nothing behind (no event row, no projection row, no cursor move).
      expect(() =>
        rig.controller.declareGate(
          {
            gate_id: "gate-authoring",
            version: 1,
            subject_type: "attempt",
            require: { all: [{ exists: { predicate: "tests_pass" } }] },
          } as never,
          "audit",
        ),
      ).toThrow(/unknown canonical gate require field 'all'/);
      expect(eventCount(rig.store)).toBe(beforeCount);
      expect(JSON.stringify(snapshotDigest(rig.store.connection))).toBe(beforeSnapshot);
      expect(
        (rig.store.connection.prepare("SELECT COUNT(*) AS n FROM gate_registry").get() as { n: number }).n,
      ).toBe(beforeRegistry);
      // The project keeps accepting new work - the seam is not wedged.
      rig.controller.pause("after-rejected-declaration");
      expect(eventCount(rig.store)).toBe(beforeCount + 1);
    } finally {
      await rig.cleanup();
    }
  });
});
