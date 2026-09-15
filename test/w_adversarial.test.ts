/**
 * G10-W — Revision-safe Work evolution (adversarial + firewall suite).
 *
 * Two jobs:
 *
 *   1. Adversarial behaviour: a caller who does not go through `plan()` must
 *      still be unable to forge a partial/half-valid revision closure, cannot
 *      use typed invalidation as a blanket "settle everything" escape, cannot
 *      rebind an ACTIVE task's envelope, and a refused revision must leave the
 *      canonical store fully intact and integrity-green.
 *   2. Source firewall: the projector is the ONLY envelope writer and imports no
 *      policy; there is exactly one scheduler, one EventStore/ProjectIR truth;
 *      `src/project_workspace/service.ts` still routes every ProjectIR change
 *      through `controller.plan(`/`appendAtomic` and owns no second truth.
 */

import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ProjectController,
  buildProjectIr,
} from "../src/tools/index.js";
import { EventStore, RevisionConflict, snapshotDigest } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy, actionKey } from "../src/domain/index.js";
import { parseNewEvent, parseProjectIr, type ProjectIr } from "../src/schema/index.js";
import { PlanReconciliationError } from "../src/advanced.js";

import { FakeClock, taskSpec } from "./helpers.js";

const HEAD = "c".repeat(40);
const CLOCK = "2026-09-15T00:00:00Z";
const PROJECT = "scheduler-project";

interface Rig {
  readonly dir: string;
  readonly store: EventStore;
  readonly controller: ProjectController;
  cleanup(): Promise<void>;
}

async function rig(): Promise<Rig> {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-wadv-"));
  const store = new EventStore(join(dir, "p.sqlite"), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({
    databasePath: join(dir, "o.sqlite"),
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
    clock: () => CLOCK,
  });
  return {
    dir,
    store,
    controller,
    cleanup: async () => {
      await effects.close();
      try {
        store.close();
      } catch {
        // already closed
      }
    },
  };
}

function readIr(store: EventStore): ProjectIr {
  const row = store.connection
    .prepare("SELECT state_json FROM projects WHERE project_id=?")
    .get(PROJECT) as { state_json: Uint8Array | null } | undefined;
  if (row === undefined || row.state_json === null) throw new Error("project is not initialized");
  return parseProjectIr(JSON.parse(new TextDecoder().decode(row.state_json)));
}

function eventCount(store: EventStore): number {
  return store.listEvents(PROJECT).length;
}

function taskState(store: EventStore, taskId: string): string | undefined {
  const row = store.connection
    .prepare("SELECT state FROM tasks WHERE project_id=? AND task_id=?")
    .get(PROJECT, taskId) as { state: string } | undefined;
  return row === undefined ? undefined : String(row.state);
}

function planError(run: () => unknown): PlanReconciliationError {
  try {
    run();
  } catch (error) {
    if (error instanceof PlanReconciliationError) return error;
    throw error;
  }
  throw new Error("expected PlanReconciliationError, but the call returned normally");
}

/** The `PROJECT_REVISED` request for the given next ProjectIR. */
function revisedRequest(current: ProjectIr, next: ProjectIr) {
  return parseNewEvent({
    schema_version: 1,
    project_id: PROJECT,
    event_type: "PROJECT_REVISED",
    payload_version: 1,
    entity_type: "project",
    entity_id: PROJECT,
    payload: {
      project_ir: next,
      promotion_id: `promotion-plan-r${next.revision}`,
    },
    causation_id: null,
    correlation_id: `plan:${next.revision}`,
    idempotency_key: actionKey("plan-revision-v1", { project_id: PROJECT, revision: next.revision }),
    expected_project_revision: current.revision,
  });
}

describe("G10-W adversarial revision attempts", () => {
  it("a refused revision leaves the canonical store fully intact and integrity-green", async () => {
    const r = await rig();
    try {
      r.controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec("task-a")] });
      r.controller.step(); // ACTIVE
      const created = r.controller.step()!; // open attempt
      await r.controller.claim(created.entity_id);
      const digestBefore = snapshotDigest(r.store.connection);
      const eventsBefore = eventCount(r.store);

      const blocked = planError(() => r.controller.plan({ tasks: [taskSpec("task-a")] }));
      expect(blocked.kind).toBe("quiescence_required");
      expect(eventCount(r.store)).toBe(eventsBefore);
      expect(snapshotDigest(r.store.connection)).toBe(digestBefore);
      // The refusal is not a "failed" store state: integrity stays green.
      expect(() => r.store.quickCheck()).not.toThrow();
      expect(() => r.store.verifyFull()).not.toThrow();
      expect(() => r.controller.plan({ tasks: [taskSpec("task-a")] })).toThrow(PlanReconciliationError);
      expect(() => r.store.quickCheck()).not.toThrow();
    } finally {
      await r.cleanup();
    }
  });

  it("a forged revision closure cannot bind an envelope to the OLD revision", async () => {
    const r = await rig();
    try {
      r.controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec("task-a")] });
      r.controller.planReconciled({ tasks: [taskSpec("task-a")] }); // rev1
      const current = readIr(r.store);
      expect(current.revision).toBe(1);
      const next = buildProjectIr({
        projectId: PROJECT,
        revision: 2,
        parentRevision: 1,
        parentDigest: current.digest,
        goal: current.goal,
        requirements: current.requirements,
        decisions: current.decisions,
        tasks: [taskSpec("task-a"), taskSpec("task-b", ["task-a"])],
        headCommit: current.head_commit,
        committedAt: CLOCK,
      });
      // The envelope is deliberately authorized against the OLD ProjectIR head
      // (rev1) while the batch raises the head to rev2. A fresh idempotency key
      // keeps this a revision-guard rejection rather than a partial-batch one.
      const staleEnvelope = {
        ...r.controller.policy.authorize(current, "task-a").envelope,
        idempotency_key: "f".repeat(64),
      };
      const eventsBefore = eventCount(r.store);
      expect(() =>
        r.store.appendAtomic([
          revisedRequest(current, next),
          parseNewEvent({
            schema_version: 1,
            project_id: PROJECT,
            event_type: "TASK_REAUTHORIZED",
            payload_version: 1,
            entity_type: "task",
            entity_id: "task-a",
            payload: {
              task_envelope: staleEnvelope,
              policy_id: r.controller.policy.policy_id,
              policy_digest: r.controller.policy.digest,
            },
            causation_id: null,
            correlation_id: "task:task-a:reauthorized",
            idempotency_key: staleEnvelope.idempotency_key,
            expected_project_revision: staleEnvelope.project_revision,
          }),
        ]),
      ).toThrow(RevisionConflict);
      expect(eventCount(r.store)).toBe(eventsBefore);
      expect(readIr(r.store).revision).toBe(1);
    } finally {
      await r.cleanup();
    }
  });

  it("a forged TASK_CREATED whose initial_state contradicts its dependencies is rejected", async () => {
    const r = await rig();
    try {
      r.controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec("task-a")] });
      r.controller.planReconciled({ tasks: [taskSpec("task-a")] }); // rev1, task-a READY
      const current = readIr(r.store);
      const next = buildProjectIr({
        projectId: PROJECT,
        revision: 2,
        parentRevision: 1,
        parentDigest: current.digest,
        goal: current.goal,
        requirements: current.requirements,
        decisions: current.decisions,
        tasks: [taskSpec("task-a"), taskSpec("task-b", ["task-a"])],
        headCommit: current.head_commit,
        committedAt: CLOCK,
      });
      const envelope = r.controller.policy.authorize(next, "task-b").envelope;
      const eventsBefore = eventCount(r.store);
      expect(() =>
        r.store.appendAtomic([
          revisedRequest(current, next),
          parseNewEvent({
            schema_version: 1,
            project_id: PROJECT,
            event_type: "TASK_CREATED",
            payload_version: 1,
            entity_type: "task",
            entity_id: "task-b",
            payload: {
              task_envelope: envelope,
              // task-a is READY, not SATISFIED: the honest initial state is BLOCKED.
              initial_state: "READY",
              policy_id: r.controller.policy.policy_id,
              policy_digest: r.controller.policy.digest,
            },
            causation_id: null,
            correlation_id: "task:task-b",
            idempotency_key: envelope.idempotency_key,
            expected_project_revision: envelope.project_revision,
          }),
        ]),
      ).toThrow(/initial state does not match dependencies/);
      expect(eventCount(r.store)).toBe(eventsBefore);
      expect(taskState(r.store, "task-b")).toBeUndefined();
    } finally {
      await r.cleanup();
    }
  });

  it("a forged TASK_REAUTHORIZED cannot rebind an ACTIVE task's envelope", async () => {
    const r = await rig();
    try {
      r.controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec("task-a")] });
      r.controller.step(); // task-a is ACTIVE
      expect(taskState(r.store, "task-a")).toBe("ACTIVE");
      const current = readIr(r.store);
      const next = buildProjectIr({
        projectId: PROJECT,
        revision: 1,
        parentRevision: 0,
        parentDigest: current.digest,
        goal: current.goal,
        requirements: current.requirements,
        decisions: current.decisions,
        tasks: [taskSpec("task-a")],
        headCommit: current.head_commit,
        committedAt: CLOCK,
      });
      const envelope = r.controller.policy.authorize(next, "task-a").envelope;
      const eventsBefore = eventCount(r.store);
      expect(() =>
        r.store.appendAtomic([
          revisedRequest(current, next),
          parseNewEvent({
            schema_version: 1,
            project_id: PROJECT,
            event_type: "TASK_REAUTHORIZED",
            payload_version: 1,
            entity_type: "task",
            entity_id: "task-a",
            payload: {
              task_envelope: envelope,
              policy_id: r.controller.policy.policy_id,
              policy_digest: r.controller.policy.digest,
            },
            causation_id: null,
            correlation_id: "task:task-a:reauthorized",
            idempotency_key: envelope.idempotency_key,
            expected_project_revision: envelope.project_revision,
          }),
        ]),
      ).toThrow(/TASK_REAUTHORIZED requires a READY or BLOCKED task/);
      expect(eventCount(r.store)).toBe(eventsBefore);
      expect(readIr(r.store).revision).toBe(0);
    } finally {
      await r.cleanup();
    }
  });

  it("typed invalidation is not a blanket escape: UNAffected in-flight work still blocks", async () => {
    const r = await rig();
    try {
      // Two INDEPENDENT tasks: task-c is running, task-a is the declared change.
      r.controller.start({
        projectId: PROJECT,
        goal: "g",
        tasks: [taskSpec("task-a"), taskSpec("task-c")],
      });
      // Start task-c (declaration order is task-a first, so start a then c).
      r.controller.step(); // TASK_STARTED task-a
      const createdA = r.controller.step()!; // ATTEMPT_CREATED task-a
      await r.controller.claim(createdA.entity_id);
      // Now declare a contract-breaking change on task-a only; task-a is settled
      // by the typed invalidation, but task-c is untouched by it.
      const outcome = r.controller.planReconciled({
        tasks: [taskSpec("task-a"), taskSpec("task-c")],
        changeClass: "contract_breaking",
        changedIds: ["task-a"],
      });
      expect(outcome.result.revision).toBe(1);
      expect(taskState(r.store, "task-a")).toBe("STALE");
      expect(taskState(r.store, "task-c")).toBe("READY");

      // A SECOND revision while task-c is running: task-c is not affected by the
      // change set, so it must block - the typed act cannot settle it.
      r.controller.step(); // TASK_STARTED task-c
      const createdC = r.controller.step()!; // ATTEMPT_CREATED task-c
      await r.controller.claim(createdC.entity_id);
      const before = eventCount(r.store);
      const blocked = planError(() =>
        r.controller.plan({
          tasks: [taskSpec("task-a"), taskSpec("task-c")],
          changeClass: "contract_breaking",
          changedIds: ["task-a"],
        }),
      );
      expect(blocked.kind).toBe("quiescence_required");
      expect(blocked.refs).toContain("task-c");
      expect(blocked.refs).toContain(createdC.entity_id);
      expect(blocked.refs).not.toContain("task-a");
      expect(eventCount(r.store)).toBe(before);
      expect(readIr(r.store).revision).toBe(1);
    } finally {
      await r.cleanup();
    }
  });

  it("an added task with an unregistered dependency blocks the whole closure with zero events", async () => {
    const r = await rig();
    try {
      r.controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec("task-a")] });
      const before = eventCount(r.store);
      const blocked = planError(() =>
        r.controller.plan({
          tasks: [taskSpec("task-a"), taskSpec("task-b", ["task-does-not-exist"])],
        }),
      );
      expect(blocked.kind).toBe("missing_registration");
      expect(blocked.refs).toContain("task-b");
      expect(blocked.refs).toContain("task-does-not-exist");
      // The retained task-a was NOT reauthorized either: all-or-nothing.
      expect(eventCount(r.store)).toBe(before);
      expect(readIr(r.store).revision).toBe(0);
    } finally {
      await r.cleanup();
    }
  });

  it("a revision replays to a byte-identical projection (rebuild reproduces the snapshot)", async () => {
    const r = await rig();
    try {
      r.controller.start({
        projectId: PROJECT,
        goal: "g",
        tasks: [taskSpec("task-a"), taskSpec("task-b", ["task-a"])],
      });
      r.controller.planReconciled({
        tasks: [taskSpec("task-a"), taskSpec("task-b", ["task-a"]), taskSpec("task-c")],
      });
      const before = snapshotDigest(r.store.connection);
      r.store.rebuildProjections();
      expect(snapshotDigest(r.store.connection)).toBe(before);
      r.store.verifyFull();
      expect(snapshotDigest(r.store.connection)).toBe(before);
    } finally {
      await r.cleanup();
    }
  });
});

/* ------------------------------------------------------------------ *
 * Source firewall
 * ------------------------------------------------------------------ */

function sourceFiles(): string[] {
  const root = new URL("../src", import.meta.url);
  const base = root.pathname.replace(/^\/([A-Za-z]:)/, "$1");
  return readdirSync(base, { recursive: true })
    .map((entry) => String(entry).replaceAll("\\", "/"))
    .filter((entry) => entry.endsWith(".ts"))
    .map((entry) => join(base, entry));
}

function readSource(relative: string): string {
  const file = new URL(`../src/${relative}`, import.meta.url);
  return readFileSync(file, "utf8");
}

describe("G10-W source firewall", () => {
  it("the projector imports no policy and is the ONLY writer of envelope_json", () => {
    const projector = readSource("state/projector.ts");
    expect(projector).not.toMatch(/domain\/policy/);
    expect(projector).not.toMatch(/TaskPolicy/);

    const envelopeWriters: string[] = [];
    const envelopeOwners: string[] = [];
    for (const file of sourceFiles()) {
      const source = readFileSync(file, "utf8");
      if (source.includes("envelope_json")) envelopeOwners.push(file.replaceAll("\\", "/"));
      if (/UPDATE\s+tasks[\s\S]{0,200}?envelope_json/i.test(source)) {
        envelopeWriters.push(file.replaceAll("\\", "/"));
      }
    }
    expect(envelopeWriters).toHaveLength(1);
    expect(envelopeWriters[0]!.endsWith("src/state/projector.ts")).toBe(true);
    // Only the projector (write), the schema/migrations (shape) and the
    // controller (read) may name the column - no third, shadow envelope cache.
    for (const owner of envelopeOwners) {
      expect(owner).toMatch(/(state\/projector|state\/migrations|state\/migration_files|schema\/|tools\/controller|domain\/aggregate|scheduler\/scheduler|cli\.ts)/);
    }
  });

  it("there is exactly one scheduler, one CoreProjector and no second ProjectIR truth", () => {
    const schedulers: string[] = [];
    const projectors: string[] = [];
    for (const file of sourceFiles()) {
      const source = readFileSync(file, "utf8");
      if (source.includes("new Scheduler(")) schedulers.push(file.replaceAll("\\", "/"));
      if (source.includes("new CoreProjector(")) projectors.push(file.replaceAll("\\", "/"));
    }
    expect(schedulers).toHaveLength(1);
    expect(schedulers[0]!.endsWith("src/tools/controller.ts")).toBe(true);
    expect(projectors).toHaveLength(1);
    expect(projectors[0]!.endsWith("src/state/event_store.ts")).toBe(true);

    // The revision contract has ONE user-facing entry and no legacy fallback.
    const controller = readSource("tools/controller.ts");
    expect(controller).not.toContain("planLegacy");
    expect(controller).toMatch(/plan\(input: PlanInput\): SchedulerEvent \{\s*return this\.planReconciled\(input\)\.event;/);
  });

  it("src/project_workspace/service.ts keeps its structural tokens and owns no second truth", () => {
    const service = readSource("project_workspace/service.ts");
    expect(service).toContain("ProjectController");
    expect(service).toContain(".appendAtomic(");
    expect(service).toContain("controller.plan(");
    // It never writes the Work projections or envelopes itself.
    expect(service).not.toMatch(/UPDATE\s+tasks/i);
    expect(service).not.toContain("envelope_json");
    expect(service).not.toContain("new Scheduler(");
  });
});
