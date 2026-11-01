/**
 * C6-R3/R4 — run identity and state isolation.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  allowedNext,
  createRun,
  loadRun,
  RUN_STATES,
  setCondition,
  transition,
  validateRunId,
} from "../scripts/c6r/runner.mjs";

const COMMIT = "a".repeat(40);
const TREE = "b".repeat(40);

function freshRoot(): string {
  return mkdtempSync(join(tmpdir(), "palimpsest-c6r-run-"));
}

describe("C6-R3 run identity and state machine", () => {
  it("creates a run with an immutable identity and refuses reuse", () => {
    const root = freshRoot();
    try {
      const run = createRun({ root, runId: "run-001", codeFreeze: COMMIT, codeTree: TREE, t1: "2026-02-10T09:05:00Z", t2: "2026-02-14T09:10:00Z" });
      expect(run.state).toBe("P1_PREPARED");
      expect(loadRun(run.dir).runId).toBe("run-001");
      expect(() =>
        createRun({ root, runId: "run-001", codeFreeze: COMMIT, codeTree: TREE, t1: "2026-02-10T09:05:00Z", t2: "2026-02-14T09:10:00Z" }),
      ).toThrow(/already in use/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts only the pre-registered transitions", () => {
    const root = freshRoot();
    try {
      const run = createRun({ root, runId: "run-002", codeFreeze: COMMIT, codeTree: TREE, t1: "2026-02-10T09:05:00Z", t2: "2026-02-14T09:10:00Z" });
      transition(run, "P1_RUNNING", { reason: "launch" });
      transition(run, "P1_FINISHED", { reason: "session exited" });
      expect(run.state).toBe("P1_FINISHED");
      expect(() => transition(run, "T1_EFFECTS")).toThrow(/illegal transition/);
      transition(run, "AUTHORIZATION_REVIEW", { reason: "operator review" });
      transition(run, "T1_EFFECTS", { reason: "approved" });
      transition(run, "T2_RELEASED", { reason: "new session" });
      transition(run, "P3_RUNNING", { reason: "fresh continuation" });
      transition(run, "EVALUATED", { reason: "scored" });
      expect(allowedNext(run)).toEqual([]);
      expect(() => transition(run, "P1_RUNNING")).toThrow(/illegal transition/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("records a provider failure as BLOCKED and a contaminated observation as INVALID", () => {
    const root = freshRoot();
    try {
      const blocked = createRun({ root, runId: "run-003", codeFreeze: COMMIT, codeTree: TREE, t1: "2026-02-10T09:05:00Z", t2: "2026-02-14T09:10:00Z" });
      transition(blocked, "BLOCKED", { reason: "provider quota" });
      expect(blocked.state).toBe("BLOCKED");

      const invalid = createRun({ root, runId: "run-004", codeFreeze: COMMIT, codeTree: TREE, t1: "2026-02-10T09:05:00Z", t2: "2026-02-14T09:10:00Z" });
      transition(invalid, "INVALID", { reason: "future event leaked into the staged inbox" });
      expect(invalid.state).toBe("INVALID");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps conditions in separate records and persists them", () => {
    const root = freshRoot();
    try {
      const run = createRun({ root, runId: "run-005", codeFreeze: COMMIT, codeTree: TREE, t1: "2026-02-10T09:05:00Z", t2: "2026-02-14T09:10:00Z" });
      setCondition(run, "P1", { sessionId: "session-p1", classification: "OBSERVED" });
      setCondition(run, "F1", { sessionId: "session-f1", classification: "OBSERVED" });
      const reloaded = loadRun(run.dir);
      expect(reloaded.conditions.P1.sessionId).toBe("session-p1");
      expect(reloaded.conditions.F1.sessionId).toBe("session-f1");
      expect(reloaded.conditions.P3.sessionId).toBeNull();
      expect(JSON.parse(readFileSync(join(run.dir, "run.json"), "utf8")).state).toBe("P1_PREPARED");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("validates the run id and the state vocabulary", () => {
    expect(validateRunId("c6r-2026-02-10-p1")).toBe("c6r-2026-02-10-p1");
    expect(() => validateRunId("Bad ID")).toThrow(/run id/);
    expect(() => validateRunId("../escape")).toThrow(/run id/);
    expect(RUN_STATES).toContain("T2_RELEASED");
    expect(RUN_STATES).not.toContain("GOAL_SATISFIED");
  });
});
