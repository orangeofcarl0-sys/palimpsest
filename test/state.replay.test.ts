import { readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { parseNewEvent, parseSchedulerEvent } from "../src/schema/index.js";
import { EventStore } from "../src/state/event_store.js";
import { snapshotDigest } from "../src/state/snapshot.js";
import { TaskPolicy } from "../src/domain/policy.js";

interface Fixture {
  fixture_version: number;
  scenario: string;
  events: unknown[];
  snapshot_digest: string;
}

const fixture = JSON.parse(
  readFileSync(join(import.meta.dirname, "../fixtures/replay/baseline-v1.json"), "utf8"),
) as Fixture;

const directories: string[] = [];

function tempPath(): string {
  const directory = mkdtempSync(join(tmpdir(), "palimpsest-p0-"));
  directories.push(directory);
  return join(directory, "fixture.db");
}

afterEach(() => {
  // Windows: files stay locked until GC; directories are cleaned by the OS.
  void directories;
});

const FIXTURE_POLICY = new TaskPolicy({
  policy_id: "trusted-default",
  read_paths: ["src"],
  allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
  network_policy: "deny",
  network_allowlist: [],
  timeout_s: 60,
  lease_s: 10,
  attempt_limit: 3,
  candidate_limit: 2,
});

function openStore(path: string): EventStore {
  const store = new EventStore(path, { clock: fakeClock() });
  store.registerPolicy(FIXTURE_POLICY);
  return store;
}

function fakeClock(): () => string {
  // The committed_at values in the fixture already carry the timestamps; the
  // clock only matters for migration applied_at, which the snapshot excludes.
  let tick = 0;
  return () => {
    tick += 1;
    return new Date(Date.UTC(2026, 7, 13, 0, 0, tick)).toISOString();
  };
}

describe("fixture replay through the TS EventStore", () => {
  it("replays every fixture event into a real SQLite store", () => {
    const store = openStore(tempPath());
    try {
      for (const raw of fixture.events) {
        // Validate as a committed event first (digests), then resubmit the
        // NewEvent subset through the append pipeline.
        const committed = parseSchedulerEvent(raw);
        const replayed = store.append(parseNewEvent(committed), { committedAt: committed.committed_at });
        expect(replayed.event_id).toBe(committed.event_id);
        expect(replayed.event_digest).toBe(committed.event_digest);
      }
      store.quickCheck();
    } finally {
      store.close();
    }
  });

  it("snapshot digest equals the Python-computed fixture digest byte-for-byte", () => {
    const store = openStore(tempPath());
    try {
      for (const raw of fixture.events) {
        store.append(parseNewEvent(raw), { committedAt: (raw as { committed_at: string }).committed_at });
      }
      expect(snapshotDigest(store.connection)).toBe(fixture.snapshot_digest);
    } finally {
      store.close();
    }
  });

  it("append is idempotent: resubmitting a stored request returns it unchanged", () => {
    const store = openStore(tempPath());
    try {
      const first = store.append(parseNewEvent(fixture.events[0]), { committedAt: (fixture.events[0] as { committed_at: string }).committed_at });
      const again = store.append(parseNewEvent(fixture.events[0]), { committedAt: (fixture.events[0] as { committed_at: string }).committed_at });
      expect(again.event_id).toBe(first.event_id);
      expect(again.event_digest).toBe(first.event_digest);
      expect(store.listEvents()).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it("reopened store preserves events and projections (crash/restart)", () => {
    const path = tempPath();
    let digests: string[] = [];
    {
      const store = openStore(path);
      try {
        for (const raw of fixture.events.slice(0, 5)) {
          store.append(parseNewEvent(raw), { committedAt: (raw as { committed_at: string }).committed_at });
        }
        digests = store.listEvents().map((event) => event.event_digest);
      } finally {
        store.close();
      }
    }
    {
      const reopened = openStore(path);
      try {
        expect(reopened.listEvents().map((event) => event.event_digest)).toEqual(digests);
        reopened.verifyFull();
        // continue appending the remaining events after "restart"
        for (const raw of fixture.events.slice(5)) {
          reopened.append(parseNewEvent(raw), { committedAt: (raw as { committed_at: string }).committed_at });
        }
        expect(snapshotDigest(reopened.connection)).toBe(fixture.snapshot_digest);
      } finally {
        reopened.close();
      }
    }
  });

  it("rebuild_projections from the bare Event Log reproduces the same snapshot", () => {
    const store = openStore(tempPath());
    try {
      for (const raw of fixture.events) {
        store.append(parseNewEvent(raw), { committedAt: (raw as { committed_at: string }).committed_at });
      }
      const before = snapshotDigest(store.connection);
      store.rebuildProjections();
      expect(snapshotDigest(store.connection)).toBe(before);
      store.verifyFull();
    } finally {
      store.close();
    }
  });

});

describe("task policy parity", () => {
  it("trusted-default policy digest matches the Python fixture's registered policy", () => {
    const policy = new TaskPolicy({
      policy_id: "trusted-default",
      read_paths: ["src"],
      allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
      network_policy: "deny",
      network_allowlist: [],
      timeout_s: 60,
      lease_s: 10,
      attempt_limit: 3,
      candidate_limit: 2,
    });
    // The TASK_CREATED payload embeds policy_digest; take it from the fixture.
    const taskCreated = fixture.events
      .map((raw) => parseSchedulerEvent(raw))
      .find((event) => event.event_type === "TASK_CREATED");
    expect(taskCreated).toBeDefined();
    expect(policy.digest).toBe(taskCreated!.payload.policy_digest);
  });
});
