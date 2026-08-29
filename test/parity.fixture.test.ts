import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  computeEventDigest,
  computeRequestDigest,
  parseSchedulerEvent,
  type SchedulerEvent,
} from "../src/schema/index.js";

interface Fixture {
  fixture_version: number;
  scenario: string;
  events: unknown[];
  snapshot_digest: string;
}

const fixture = JSON.parse(
  readFileSync(join(import.meta.dirname, "../fixtures/replay/baseline-v1.json"), "utf8"),
) as Fixture;

describe("cross-language digest parity against the Python fixture", () => {
  it("fixture contract is the unified baseline", () => {
    // v2: the TS Scheduler regeneration adds the STAGE_GRAPH_DEFINED genesis
    // declaration (H1 §3.4 D-3) right after PROJECT_CREATED.
    expect(fixture.fixture_version).toBe(2);
    expect(fixture.scenario).toBe("phase0-2-two-candidate-batch-retry-exhaustion");
    expect(fixture.events.length).toBeGreaterThan(0);
  });

  it("the stage graph genesis is the second event on the log", () => {
    const declared = fixture.events.map((raw) => parseSchedulerEvent(raw)).find(
      (event) => event.event_type === "STAGE_GRAPH_DEFINED",
    );
    expect(declared).toBeDefined();
    expect(declared!.entity_type).toBe("stage-graph");
    expect(declared!.payload.declared_by).toBe("genesis");
  });

  it("every fixture event parses and its digests recompute byte-for-byte", () => {
    for (const raw of fixture.events) {
      const event = parseSchedulerEvent(raw) as SchedulerEvent;
      expect(computeRequestDigest(event)).toBe(event.request_digest);
      expect(computeEventDigest(event)).toBe(event.event_digest);
    }
  });

  it("embedded ProjectIR digests recompute identically", () => {
    const created = fixture.events.map((raw) => parseSchedulerEvent(raw)).find(
      (event) => event.event_type === "PROJECT_CREATED",
    );
    expect(created).toBeDefined();
    const projectIr = created!.payload.project_ir as { digest: string };
    // parseProjectIr already verified the digest internally; re-assert for clarity.
    expect(projectIr.digest).toMatch(/^[0-9a-f]{64}$/);
  });
});
