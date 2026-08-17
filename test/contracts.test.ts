import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CanonicalizationError,
  canonicalDigest,
  canonicalJsonBytes,
  parseProjectIr,
  parseNewEvent,
} from "../src/schema/index.js";
import {
  ATTEMPT_ALLOWED_SOURCES,
  TASK_ALLOWED_SOURCES,
  validateTaskGraph,
} from "../src/domain/state_machine.js";
import { MIGRATION_1_SQL } from "../src/state/migrations.js";

describe("canonical JSON", () => {
  it("sorts keys, rejects floats and NFC collisions", () => {
    expect(new TextDecoder().decode(canonicalJsonBytes({ b: 1, a: 2 }))).toBe('{"a":2,"b":1}');
    expect(() => canonicalJsonBytes({ x: 0.5 })).toThrow(CanonicalizationError);
    expect(() => canonicalJsonBytes({ "é": 1, "e\u0301": 2 })).toThrow(CanonicalizationError);
    expect(canonicalDigest({ s: "e\u0301" })).toBe(canonicalDigest({ s: "é" }));
  });

  it("sorts keys by code points, not UTF-16 units", () => {
    // U+10000 sorts AFTER U+E000 by code point, but its UTF-16 lead unit
    // (0xD800) sorts BEFORE U+E000. Python sorts by code point; so must we.
    const bytes = new TextDecoder().decode(
      canonicalJsonBytes({ "\u{10000}": 1, "\ue000": 2 }),
    );
    const parsed = JSON.parse(bytes) as Record<string, number>;
    expect(Object.keys(parsed)).toEqual(["\ue000", "\u{10000}"]);
  });

  it("rejects integers outside the signed 64-bit range", () => {
    expect(() => canonicalJsonBytes({ x: 2 ** 63 })).toThrow(CanonicalizationError);
    expect(() =>
      canonicalJsonBytes({ x: Number.MAX_SAFE_INTEGER + 1 }),
    ).toThrow(CanonicalizationError);
  });
});

describe("migration SQL identity", () => {
  it("inlined MIGRATION_1_SQL matches the Python resource checksum", () => {
    const pythonResource = readFileSync(
      join(import.meta.dirname, "../src/state/migration_files/0001_unified_baseline.sql"),
      "utf8",
    );
    expect(createHash("sha256").update(MIGRATION_1_SQL, "utf8").digest("hex")).toBe(
      createHash("sha256").update(pythonResource, "utf8").digest("hex"),
    );
  });
});

describe("state machine tables", () => {
  it("task transitions only start from allowed sources", () => {
    expect(TASK_ALLOWED_SOURCES.TASK_STARTED).toEqual(new Set(["READY"]));
    expect(TASK_ALLOWED_SOURCES.TASK_SATISFIED).toEqual(new Set(["VERIFYING"]));
    expect(ATTEMPT_ALLOWED_SOURCES.ATTEMPT_LATE_RESULT).toEqual(new Set(["EXPIRED"]));
  });

  it("task graph rejects cycles, self-loops and unknown dependencies", () => {
    expect(() => validateTaskGraph([{ task_id: "a", depends_on: ["a"] }])).toThrow(/itself/);
    expect(() =>
      validateTaskGraph([
        { task_id: "a", depends_on: ["b"] },
        { task_id: "b", depends_on: ["a"] },
      ]),
    ).toThrow(/cycle/);
    expect(() => validateTaskGraph([{ task_id: "a", depends_on: ["ghost"] }])).toThrow(
      /unknown dependencies: ghost/,
    );
  });
});

describe("schema validators fail closed", () => {
  const COMMIT = "c".repeat(40);
  const base = {
    schema_version: 1,
    project_id: "p",
    revision: 0,
    parent_revision: null,
    parent_digest: null,
    goal: "g",
    requirements: [],
    decisions: [],
    tasks: [
      { task_id: "t", objective: "o", depends_on: [], write_paths: ["src/t.py"], required_artifacts: [] },
    ],
    head_commit: COMMIT,
    committed_at: "2026-08-13T00:00:00Z",
  };

  it("ProjectIR recomputes and enforces its digest", () => {
    const data = {
      ...base,
      digest: canonicalDigest({ ...base, committed_at: "2026-08-13T00:00:00.000000Z" }),
    };
    const project = parseProjectIr(data);
    expect(project.digest).toBe(data.digest);
    expect(() => parseProjectIr({ ...data, goal: "changed" })).toThrow(/digest mismatch/);
  });

  it("rejects naive datetimes in embedded contracts", () => {
    expect(() =>
      parseNewEvent({
        schema_version: 1,
        project_id: "p",
        event_type: "PROJECT_CREATED",
        payload_version: 1,
        entity_type: "project",
        entity_id: "p",
        payload: {
          project_ir: { ...base, committed_at: "2026-08-13T00:00:00", digest: "0".repeat(64) },
        },
        causation_id: null,
        correlation_id: "c",
        idempotency_key: "0".repeat(64),
        expected_project_revision: null,
      }),
    ).toThrow(/UTC offset/);
  });
});
