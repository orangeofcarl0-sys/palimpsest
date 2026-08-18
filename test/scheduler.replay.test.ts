import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseSchedulerEvent } from "../src/schema/index.js";
import { canonicalDatetime } from "../src/schema/index.js";
import { EventStore, snapshotDigest } from "../src/state/index.js";
import { Scheduler } from "../src/scheduler/index.js";
import { DomainValidationError } from "../src/domain/index.js";

import {
  FakeClock,
  makeProject,
  makeReport,
  setupScheduler,
  taskSpec,
  tempStatePath,
  trustedDefaultPolicy,
} from "./helpers.js";

interface Fixture {
  fixture_version: number;
  scenario: string;
  events: unknown[];
  snapshot_digest: string;
}

const fixture = JSON.parse(
  readFileSync(join(import.meta.dirname, "../fixtures/replay/baseline-v1.json"), "utf8"),
) as Fixture;

/**
 * The exact call sequence of the Python generate_baseline_fixture.populate().
 * Side effects only; the resulting Event Log is compared below.
 */
function populate(store: ReturnType<typeof tempStore>, projectId: string): void {
  const scheduler = setupScheduler(
    store,
    makeProject([taskSpec()]),
    trustedDefaultPolicy({ attempt_limit: 3, candidate_limit: 2 }),
  );
  const project = makeProject([taskSpec()]);
  scheduler.registerTask(
    trustedDefaultPolicy({ attempt_limit: 3, candidate_limit: 2 }).authorize(project, "task-1"),
  );
  scheduler.runOnce(); // TASK_STARTED
  const attempts = [scheduler.runOnce()!, scheduler.runOnce()!]; // 2× ATTEMPT_CREATED
  const first = attempts[0]!;
  const second = attempts[1]!;
  scheduler.startAttempt(first.entity_id);
  scheduler.startAttempt(second.entity_id);
  scheduler.recordCallback(first.entity_id, "ATTEMPT_FAILED", makeReport(store, first.entity_id, "failed"));
  scheduler.recordCallback(second.entity_id, "ATTEMPT_FAILED", makeReport(store, second.entity_id, "failed"));
  scheduler.runOnce(); // TASK_READY (budget remaining)
  scheduler.runOnce(); // TASK_STARTED
  const third = scheduler.runOnce()!; // ATTEMPT_CREATED #3
  scheduler.startAttempt(third.entity_id);
  scheduler.recordCallback(third.entity_id, "ATTEMPT_FAILED", makeReport(store, third.entity_id, "failed"));
  scheduler.runOnce(); // TASK_FAILED
}

function tempStore(): EventStore {
  return new EventStore(tempStatePath(), { clock: new FakeClock().next });
}

describe("fixture regeneration through the TS Scheduler", () => {
  it("reproduces the full Event Log byte-for-byte from scratch", () => {
    const store = tempStore();
    try {
      populate(store, "scheduler-project");
      const regenerated = store.listEvents();
      expect(regenerated).toHaveLength(fixture.events.length);
      for (let index = 0; index < regenerated.length; index += 1) {
        const ours = regenerated[index]!;
        const theirs = parseSchedulerEvent(fixture.events[index]!);
        expect(ours.event_type).toBe(theirs.event_type);
        // The same canonical clock yields identical committed_at micro form.
        expect(canonicalDatetime(ours.committed_at)).toBe(canonicalDatetime(theirs.committed_at));
        expect(ours.previous_event_digest).toBe(theirs.previous_event_digest);
        expect(ours.request_digest).toBe(theirs.request_digest);
        expect(ours.event_digest).toBe(theirs.event_digest);
      }
    } finally {
      store.close();
    }
  });

  it("snapshot digest regenerated from the Scheduler matches the Python fixture", () => {
    const store = tempStore();
    try {
      populate(store, "scheduler-project");
      expect(snapshotDigest(store.connection)).toBe(fixture.snapshot_digest);
      store.verifyFull();
    } finally {
      store.close();
    }
  });

  it("restart after a partial run resumes deterministically without duplicate work", () => {
    const path = tempStatePath();
    const firstClock = new FakeClock();
    {
      const store = new EventStore(path, { clock: firstClock.next });
      try {
        const scheduler = setupScheduler(
          store,
          makeProject([taskSpec()]),
          trustedDefaultPolicy({ attempt_limit: 3, candidate_limit: 2 }),
        );
        scheduler.registerTask(
          trustedDefaultPolicy({ attempt_limit: 3, candidate_limit: 2 }).authorize(
            makeProject([taskSpec()]),
            "task-1",
          ),
        );
        scheduler.runOnce();
      } finally {
        store.close();
      }
    }
    const secondClock = new FakeClock();
    secondClock.next(); // consume the same initial applied_at tick
    {
      const reopened = new EventStore(path, { clock: secondClock.next });
      try {
        // Continue from where the first process stopped: the next decision is
        // ATTEMPT_CREATED #1, deterministically recomputed.
        const scheduler = new Scheduler(reopened, "scheduler-project");
        scheduler.registerPolicy(trustedDefaultPolicy({ attempt_limit: 3, candidate_limit: 2 }));
        const next = scheduler.runOnce();
        expect(next?.event_type).toBe("ATTEMPT_CREATED");
        // No duplicate TASK_STARTED was appended on resume.
        expect(
          reopened.listEvents().filter((event) => event.event_type === "TASK_STARTED"),
        ).toHaveLength(1);
        reopened.verifyFull();
      } finally {
        reopened.close();
      }
    }
  });

  it("a direct TASK_SATISFIED without a matching promotion is rejected", () => {
    const store = tempStore();
    try {
      const project = makeProject([taskSpec()]);
      const trusted = trustedDefaultPolicy();
      const scheduler = setupScheduler(store, project, trusted);
      scheduler.registerTask(trusted.authorize(project, "task-1"));
      scheduler.runOnce();
      const created = scheduler.runOnce()!;
      scheduler.startAttempt(created.entity_id);
      scheduler.recordCallback(
        created.entity_id,
        "ATTEMPT_COMPLETED",
        makeReport(store, created.entity_id, "completed"),
      );
      scheduler.runOnce(); // VERIFYING
      const task = store.connection.prepare("SELECT * FROM tasks").get() as {
        task_id: string;
        last_event_id: number;
      };
      expect(() =>
        store.append(
          {
            schema_version: 1,
            project_id: project.project_id,
            event_type: "TASK_SATISFIED",
            payload_version: 1,
            entity_type: "task",
            entity_id: task.task_id,
            payload: {
              previous_state: "VERIFYING",
              new_state: "SATISFIED",
              reason: "worker claimed success",
              batch_activation_event_id: 3,
            },
            causation_id: task.last_event_id,
            correlation_id: "direct-satisfied",
            idempotency_key: "0".repeat(64),
            expected_project_revision: 0,
          } as never,
          { committedAt: "2026-08-13T00:00:09Z" },
        ),
      ).toThrow(DomainValidationError);
    } finally {
      store.close();
    }
  });
});
