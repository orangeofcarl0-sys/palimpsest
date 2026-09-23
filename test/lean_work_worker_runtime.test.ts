/**
 * PLMP-LEAN-1 §D2-c — the WORK WORKER RUNTIME, deterministic half.
 *
 *     Give the Worker a powerful execution world, not powerful authority.
 *
 * The live half (a real DSH worker with PTC presentation, doing real engineering in the prepared
 * worktree) is the rig `rs-test/lean-d2c-worker-gate.mjs`. What a unit test CAN pin, and what this file
 * pins, is the boundary the runtime exists to hold — because these are the properties that would
 * otherwise be "true by prompt":
 *
 *   1. the outcome vocabulary: a worker reports `READY_FOR_SETTLEMENT`, never `COMPLETED`, and cannot
 *      assert a changed file, a result commit, a passing test, an evidence id, a gate or a promotion;
 *   2. the context: canonical and task-sufficient, and NOT the principal's conversation, the
 *      scheduler's sequence, the attempt id, gate ids or lease state;
 *   3. the environment: ONE Palimpsest tool (its own result tool), no principal surface at all;
 *   4. failure honesty: a timeout, a crash and a silent worker are all `HOST_FAILURE` — a fact about a
 *      process, never a Work outcome, and never a fabricated `READY_FOR_SETTLEMENT`.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  WORK_WORKER_OUTCOME_KINDS,
  WORK_WORKER_RESULT_PREFIX,
  WORK_WORKER_RESULT_TOOL_NAME,
  dshSubprocessWorkWorkerPort,
  parseWorkWorkerResult,
  workWorkerEnvironmentPayload,
  workWorkerResultToolDefinition,
  type WorkWorkerTaskContext,
} from "../src/deployment/work_worker.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const CONTEXT: WorkWorkerTaskContext = {
  projectGoal: "make the project tidy",
  requirements: ["no behaviour change"],
  decisions: ["keep the public API"],
  objective: "rewrite dedupe with a Set",
  writeScope: ["src/dedupe.ts"],
  requiredArtifacts: ["src/dedupe.ts"],
  baseCommit: "a".repeat(40),
  completionChecks: ["run `node -e process.exit(0)` and it must succeed (tests_pass)"],
  independentVerificationRequired: false,
};

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-d2c-"));
  cleanups.push(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows keeps the directory busy while a handle is open; the OS reaps it.
    }
  });
  return dir;
}

describe("§D2-c 1. outcome != fact: the vocabulary a worker may use", () => {
  it("offers exactly two outcome kinds, and neither of them is COMPLETED", () => {
    expect([...WORK_WORKER_OUTCOME_KINDS]).toEqual(["READY_FOR_SETTLEMENT", "NEEDS_ESCALATION"]);
    // The words a worker may NOT say. `COMPLETED` is the attempt's terminal state, owned by the Work
    // owner: a model deciding "now a canonical terminal fact may exist" is the confusion D2-c prevents.
    expect(WORK_WORKER_OUTCOME_KINDS).not.toContain("COMPLETED" as never);
    expect(WORK_WORKER_OUTCOME_KINDS).not.toContain("SUCCESS" as never);
  });

  it("the result tool's schema has nowhere to put a claim about the work", () => {
    const definition = workWorkerResultToolDefinition();
    const properties = (definition.parameters as { properties: Record<string, unknown> }).properties;
    expect(Object.keys(properties).sort()).toEqual(["kind", "proposedAction", "reason", "summary"]);
    expect((definition.parameters as { additionalProperties: boolean }).additionalProperties).toBe(false);
    // Everything the product observes for itself is ABSENT by construction.
    for (const forbidden of ["attemptId", "changedFiles", "resultCommit", "testsPassed", "evidence", "gateId", "verification", "promotion"]) {
      expect(Object.keys(properties)).not.toContain(forbidden);
    }
  });

  it("refuses an outcome that asserts completion, an unknown argument, and an escalation without a reason", () => {
    // Driven through the SHIPPED parser — the one the port reads a reported payload back with — so this
    // is the rule as enforced, not a parallel stub.
    const completed = parseWorkWorkerResult({ kind: "COMPLETED", summary: "done" });
    expect(completed.ok).toBe(false);
    if (completed.ok) return;
    expect(completed.detail).toMatch(/never that the work IS complete/u);

    const smuggled = parseWorkWorkerResult({ kind: "READY_FOR_SETTLEMENT", summary: "done", changedFiles: ["src/dedupe.ts"] });
    expect(smuggled.ok).toBe(false);
    if (!smuggled.ok) expect(smuggled.detail).toMatch(/unknown argument/u);

    // An escalation without a reason is useless to the principal, so it is refused.
    const reasonless = parseWorkWorkerResult({ kind: "NEEDS_ESCALATION", summary: "stuck" });
    expect(reasonless.ok).toBe(false);
    if (!reasonless.ok) expect(reasonless.detail).toMatch(/must state WHY/u);

    const accepted = parseWorkWorkerResult({ kind: "READY_FOR_SETTLEMENT", summary: "rewrote dedupe with a Set" });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.outcome.kind).toBe("READY_FOR_SETTLEMENT");
  });

  it("carries an escalation's proposal without turning it into authority", () => {
    const parsed = parseWorkWorkerResult({
      kind: "NEEDS_ESCALATION",
      summary: "the fix needs a file outside the scope",
      reason: "src/dedupe.ts cannot be fixed without changing src/index.ts",
      proposedAction: "widen write scope to src/index.ts",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.outcome.kind).toBe("NEEDS_ESCALATION");
    expect(parsed.outcome.proposedAction).toContain("widen write scope");
    // Proposing is not authorizing: nothing in the outcome grants anything.
    expect(Object.keys(parsed.outcome).sort()).toEqual(["kind", "proposedAction", "reason", "summary"]);
  });
});

describe("§D2-c 2/3. the context is sufficient, and the environment has no principal", () => {
  it("gives the worker the canonical task context and nothing about orchestration", () => {
    const payload = workWorkerEnvironmentPayload(CONTEXT);
    expect(payload.context).toEqual(CONTEXT);
    const serialized = JSON.stringify(payload);
    // No principal conversation, no scheduler sequence, no attempt id, no gate id, no lease state.
    for (const forbidden of ["attemptId", "scheduler", "lease", "gateId", "conversation", "scratchpad", "sessionId"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("the payload carries the context, the ONE tool and nothing else", () => {
    const payload = workWorkerEnvironmentPayload(CONTEXT);
    expect(Object.keys(payload).sort()).toEqual(["context", "deniedAuthorityPrefix", "resultTool"]);
    // The authority surface is closed by PREFIX, enumerated by the host at run time — not by a
    // hard-coded list, which `restrict()` would reject the moment a deployment composed a different
    // Palimpsest surface, and which would silently stop covering tools added later.
    expect(payload.deniedAuthorityPrefix).toBe("palimpsest_");
    expect(payload.resultTool.name).toBe(WORK_WORKER_RESULT_TOOL_NAME);
  });

  it("hands the worker no principal capability at all", () => {
    const payload = workWorkerEnvironmentPayload(CONTEXT);
    // Keys, not prose: the tool's own description legitimately NAMES the things a worker must not
    // claim, so the assertion has to be about the shape of what it is handed.
    expect(Object.keys(payload.context).sort()).toEqual(
      [
        "baseCommit",
        "completionChecks",
        "decisions",
        "independentVerificationRequired",
        "objective",
        "projectGoal",
        "requiredArtifacts",
        "requirements",
        "writeScope",
      ].sort(),
    );
    for (const capability of ["deployment", "installed", "federation", "transport", "attention", "proof", "monitor", "principalTools"]) {
      expect(Object.keys(payload)).not.toContain(capability);
    }
  });
});

describe("§D2-c 4. failure honesty: a host fact is never a Work outcome", () => {
  function scriptedWorker(script: string): { port: ReturnType<typeof dshSubprocessWorkWorkerPort>; workDir: string } {
    const root = tempDir();
    const workDir = join(root, "world");
    mkdirSync(workDir, { recursive: true });
    const scriptPath = join(root, "worker.mjs");
    writeFileSync(scriptPath, script, "utf8");
    return {
      port: dshSubprocessWorkWorkerPort({
        dshBin: scriptPath,
        profile: "d2c-test",
        timeoutMs: 20_000,
        nodeExecPath: process.execPath,
      }),
      workDir,
    };
  }

  const line = (payload: unknown): string =>
    `process.stdout.write(${JSON.stringify(WORK_WORKER_RESULT_PREFIX)} + JSON.stringify(${JSON.stringify(payload)}) + String.fromCharCode(10));`;

  it("passes a real reported outcome through unchanged", async () => {
    const { port, workDir } = scriptedWorker(`${line({ kind: "READY_FOR_SETTLEMENT", summary: "rewrote dedupe" })}\n`);
    const outcome = await port.run({ workDir, context: CONTEXT });
    expect(outcome.kind).toBe("READY_FOR_SETTLEMENT");
    if (outcome.kind === "HOST_FAILURE") throw new Error(outcome.detail);
    expect(outcome.summary).toBe("rewrote dedupe");
  });

  it("a worker that dies is HOST_FAILURE — never a fabricated READY, never ATTEMPT_FAILED", async () => {
    const { port, workDir } = scriptedWorker("process.exit(3);\n");
    const outcome = await port.run({ workDir, context: CONTEXT });
    expect(outcome.kind).toBe("HOST_FAILURE");
    if (outcome.kind !== "HOST_FAILURE") return;
    expect(outcome.detail).toMatch(/exited 3 without reporting an outcome/u);
  });

  it("a worker that reports nonsense is HOST_FAILURE, and the nonsense is named", async () => {
    const { port, workDir } = scriptedWorker(`${line({ kind: "COMPLETED", summary: "I declare this done" })}\n`);
    const outcome = await port.run({ workDir, context: CONTEXT });
    expect(outcome.kind).toBe("HOST_FAILURE");
    if (outcome.kind !== "HOST_FAILURE") return;
    expect(outcome.detail).toMatch(/unusable outcome/u);
  });

  it("a silent worker is HOST_FAILURE rather than an assumed success", async () => {
    const { port, workDir } = scriptedWorker("// says nothing\n");
    const outcome = await port.run({ workDir, context: CONTEXT });
    expect(outcome.kind).toBe("HOST_FAILURE");
  });

  it("a hung worker hits its budget as HOST_FAILURE", async () => {
    const root = tempDir();
    const workDir = join(root, "world");
    mkdirSync(workDir, { recursive: true });
    const scriptPath = join(root, "hang.mjs");
    writeFileSync(scriptPath, "setInterval(() => {}, 1 << 30);\n", "utf8");
    const port = dshSubprocessWorkWorkerPort({
      dshBin: scriptPath,
      profile: "d2c-test",
      timeoutMs: 1_500,
      nodeExecPath: process.execPath,
    });
    const outcome = await port.run({ workDir, context: CONTEXT });
    expect(outcome.kind).toBe("HOST_FAILURE");
    if (outcome.kind !== "HOST_FAILURE") return;
    expect(outcome.detail).toMatch(/did not finish within 1500ms/u);
  });
});
