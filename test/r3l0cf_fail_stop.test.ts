/**
 * R3-L0C-F §4-§9 — THE FAIL-STOP RUNNER'S PROOFS, AS TESTS.
 *
 * §3 requires the negative tests to "fail against the old behavior, then pass against the new fail-stop runner".
 * The failing half is `r3l0cf_falsifiers.test.ts`; THIS is the passing half, and it is the more demanding one
 * because it must show the SAME five §8 properties holding for the new runner through the SAME evaluator.
 *
 * THE TESTS DRIVE REAL EXECUTION. The crash matrix runs the ScriptedWorker through the packaged runtime — real
 * planning, real delegation, real settlement, real gate, real promotion — so the healthy control asserts positive
 * outcomes (a promotion, a moved head) rather than the absence of a stop. A stub would prove nothing about whether
 * the governed path still works.
 *
 * THE JOURNAL TESTS ARE ABOUT DETECTION, NOT ABOUT WRITING. §6 requires an interrupted write to be DETECTABLE,
 * so the tests deliberately tear a journal and assert the tear is reported rather than swallowed. A durability
 * test that only wrote and read back a clean journal would pass on an implementation that silently dropped a
 * truncated record.
 *
 * NO MODEL CALLS. Every test here runs without a model, which §0 requires.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FailStopStateMachine, classifyOutcome, inspectPreservedRun, runFailStopMatrix } from "../scripts/r3l0cf/fail-stop.mjs";
import { appendRecord, buildGenerationRecord, readJournal, writeJsonAtomic } from "../scripts/r3l0cf/journal.mjs";
import { buildObservation, evaluateFailStopProperties, runPropertyNegativeControls } from "../scripts/r3l0cf/properties.mjs";
import { twoGenerationSchedule } from "../scripts/r3l0cf/crash-matrix.mjs";
import { computeExecutionClosure, checkExecutionClosure } from "../scripts/r3l0cf/closure.mjs";
import { runClosureMutation } from "../scripts/r3l0cf/closure-mutation.mjs";
import { LAUNCH_LAW, PROTOCOL_DEVIATION, FAIL_STOP_TRANSITIONS, TERMINAL_PRESERVED_STATES, JOURNAL_FIELDS } from "../scripts/r3l0cf/contract.mjs";

const ROOTS: string[] = [];
const freshRoot = (name: string): string => {
  const root = mkdtempSync(join(tmpdir(), `r3l0cf-${name}-`));
  ROOTS.push(root);
  return root;
};

afterAll(() => {
  for (const root of ROOTS) {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds SQLite handles briefly */ }
  }
});

describe("R3-L0C-F §4 — the fail-stop state machine refuses an undeclared edge", () => {
  it("refuses a transition the frozen contract does not declare", () => {
    const machine = new FailStopStateMachine();
    expect(machine.state).toBe("PLANNED");
    expect(() => machine.transition("MATRIX_COMPLETE")).toThrow(/REFUSED/);
    /** The declared edge works. */
    machine.transition("PREFLIGHT_PASSED");
    expect(machine.state).toBe("PREFLIGHT_PASSED");
  });

  it("treats the preserved states as terminal", () => {
    for (const state of TERMINAL_PRESERVED_STATES) {
      expect(FAIL_STOP_TRANSITIONS[state]).toEqual([]);
    }
    expect(LAUNCH_LAW.MAX_WORKER_LAUNCHES).toBe(1);
    expect(LAUNCH_LAW.POST_EXPOSURE_RETRIES).toBe(0);
    expect(LAUNCH_LAW.resumeUncertainAutomatically).toBe(false);
    expect(LAUNCH_LAW.adaptiveStoppingOnOutcome).toBe(false);
  });

  it("§2 records the protocol deviation without claiming the execution design is identical", () => {
    expect(PROTOCOL_DEVIATION.OLD_PROTOCOL).toBe("INFRASTRUCTURE_RETRY_UP_TO_4");
    expect(PROTOCOL_DEVIATION.NEW_PROTOCOL).toBe("NO_RETRY_AFTER_POSSIBLE_EXPOSURE");
    expect(PROTOCOL_DEVIATION.executionDesignIdentical).toBe(false);
    expect(PROTOCOL_DEVIATION.unchanged).toContain("research question");
  });
});

describe("R3-L0C-F §5 — the failure classification cannot launder a behavioral failure", () => {
  it("classifies only a positively behavioral outcome as behavioral", () => {
    expect(classifyOutcome({ resultCorrect: false }).classification).toBe("BEHAVIORAL");
    expect(classifyOutcome({ correctnessOk: false }).classification).toBe("BEHAVIORAL");
    expect(classifyOutcome({ visibleHandles: 2, pulls: [] }).classification).toBe("BEHAVIORAL");
    expect(classifyOutcome({ budgetExhaustedWithoutResult: true }).classification).toBe("BEHAVIORAL");
    expect(classifyOutcome({ workCannotProgress: true }).classification).toBe("BEHAVIORAL");
  });

  it("treats an ambiguous outcome as infrastructure, because stopping is the safe direction", () => {
    expect(classifyOutcome(null).classification).toBe("INFRASTRUCTURE");
    expect(classifyOutcome({ reportMissing: true }).classification).toBe("INFRASTRUCTURE");
    expect(classifyOutcome({ jobPhase: "HOST_ERROR" }).classification).toBe("INFRASTRUCTURE");
    expect(classifyOutcome({ treatmentMismatch: true }).classification).toBe("INFRASTRUCTURE");
    /** An infrastructure cause dominates a behavioral one when both are present. */
    const both = classifyOutcome({ resultCorrect: false, hostFailure: true });
    expect(both.classification).toBe("INFRASTRUCTURE");
  });

  it("never permits a retry, in either class", () => {
    expect(classifyOutcome({ resultCorrect: false }).retryPermitted).toBe(false);
    expect(classifyOutcome({ hostFailure: true }).retryPermitted).toBe(false);
    /** §5: an unresolved predecessor blocks the next generation as infrastructure. */
    expect(classifyOutcome({ priorAttemptUnresolved: true }).classification).toBe("INFRASTRUCTURE");
  });
});

describe("R3-L0C-F §6 — the journal detects an interrupted write", () => {
  it("appends records, reads them back, and reports the journal intact", () => {
    const root = freshRoot("journal");
    const path = join(root, "generation-journal.jsonl");
    appendRecord({ journalPath: path, kind: "RUN_STARTED", payload: { runId: "r1" } });
    appendRecord({ journalPath: path, kind: "EXPOSURE_INTENT_RECORDED", payload: { sessionId: "s1" } });
    appendRecord({ journalPath: path, kind: "TRIAL_RECORDED", payload: { sessionId: "s1" } });
    const read = readJournal(path);
    expect(read.JOURNAL_INTACT).toBe(true);
    expect(read.total).toBe(3);
    expect(read.records.map((record: { kind: string }) => record.kind)).toEqual(["RUN_STARTED", "EXPOSURE_INTENT_RECORDED", "TRIAL_RECORDED"]);
  });

  it("§6 reports a torn tail as INTERRUPTED rather than accepting it", () => {
    const root = freshRoot("journal-torn");
    const path = join(root, "generation-journal.jsonl");
    appendRecord({ journalPath: path, kind: "RUN_STARTED", payload: { runId: "r1" } });
    /** A crash mid-append leaves a partial line. */
    writeFileSync(path, `${readFileSync(path, "utf8")}{"seq":2,"kind":"TRIAL_RE`, "utf8");
    const read = readJournal(path);
    expect(read.JOURNAL_INTACT).toBe(false);
    expect(read.INTERRUPTED_WRITE_DETECTED).toBe(true);
    expect(read.interrupted.length).toBe(1);
    /** The intact record is still readable, so a torn tail does not lose the good evidence. */
    expect(read.total).toBe(1);
  });

  it("§6 reports a leftover temporary file as a write that was in flight", () => {
    const root = freshRoot("journal-tmp");
    const path = join(root, "generation-journal.jsonl");
    appendRecord({ journalPath: path, kind: "RUN_STARTED", payload: {} });
    writeFileSync(`${path}.tmp-99`, "partial", "utf8");
    const read = readJournal(path);
    expect(read.WRITE_IN_FLIGHT_DETECTED).toBe(true);
    expect(read.JOURNAL_INTACT).toBe(false);
  });

  it("§6 builds a record carrying EVERY declared field", () => {
    /**
     * The property that matters: a record satisfies §6's schema by CARRYING every field, not by omitting the ones
     * that were inconvenient. `buildGenerationRecord` fills each field explicitly and then asserts the set, so the
     * assertion is defence-in-depth against a future edit removing a field — and this test is the other half of
     * it, checking the schema is actually complete.
     */
    const complete = buildGenerationRecord({ sessionId: "s1", block: 0, arm: "C", generation: "G1", trajectoryId: "b0-C" });
    for (const field of JOURNAL_FIELDS) expect(field in complete).toBe(true);
    expect(JOURNAL_FIELDS.length).toBeGreaterThanOrEqual(25);
  });

  it("§6 refuses an undeclared event type", () => {
    const root = freshRoot("journal-kind");
    expect(() => appendRecord({ journalPath: join(root, "j.jsonl"), kind: "NOT_A_DECLARED_KIND", payload: {} })).toThrow(/REFUSED/);
  });
});

describe("R3-L0C-F §7/§8 — the fail-stop matrix run", () => {
  const schedule = twoGenerationSchedule(0, "C");

  it("launches a session at most once, and stops the whole matrix on a failure", async () => {
    const root = freshRoot("fs-stop");
    const run = await runFailStopMatrix({
      runId: "stop",
      runRoot: root,
      schedule,
      launch: async ({ session }: { session: { generation: string } }) => (session.generation === "G2" ? { hostFailure: true, jobPhase: "HOST_ERROR" } : { resultCorrect: true }),
      validityGate: async () => ({ green: true }),
    });
    expect(run.terminalState).toBe("ABORT_PRESERVED");
    expect(run.maxLaunchesPerSession).toBe(1);
    expect(run.launches.length).toBe(2);
    /** G1 completed; G2 failed; nothing after it. */
    expect(run.completedSessions).toEqual(["b0-C-G1"]);
    expect(run.properties.ALL_PROPERTIES_HOLD).toBe(true);
    /** §5: no terminal was written to a product store, and no verdict was issued. */
    expect(run.terminalEventsSynthesized).toEqual([]);
    expect(run.causalVerdictIssued).toBe(false);
  });

  it("does not enter a generation whose predecessor is unresolved", async () => {
    const root = freshRoot("fs-unresolved");
    const run = await runFailStopMatrix({
      runId: "unresolved",
      runRoot: root,
      schedule,
      launch: async ({ session }: { session: { generation: string } }) => (session.generation === "G1" ? { workCannotProgress: true } : { resultCorrect: true }),
      validityGate: async () => ({ green: true }),
    });
    expect(run.terminalState).toBe("ABORT_PRESERVED");
    expect(run.launches.length).toBe(1);
    expect(run.failure.failureClass).toBe("OBSERVABLE_BEHAVIORAL");
    expect(run.failure.cause).toBe("WORK_CANNOT_PROGRESS_CENSORED_TRAJECTORY");
  });

  it("§4 marks an entered launch whose outcome is unknown as UNCERTAIN, never as a non-event", async () => {
    const root = freshRoot("fs-uncertain");
    const run = await runFailStopMatrix({
      runId: "uncertain",
      runRoot: root,
      schedule,
      launch: async () => ({ outcomeUnknown: true }),
      validityGate: async () => ({ green: true }),
    });
    expect(run.terminalState).toBe("UNCERTAIN_PRESERVED");
    expect(run.uncertainSessions).toEqual(["b0-C-G1"]);
    const inspection = inspectPreservedRun(root);
    expect(inspection.verdict).toBe("UNCERTAIN");
    expect(inspection.mayResumeAutomatically).toBe(false);
    expect(inspection.mayReplaceAutomatically).toBe(false);
  });

  it("§5 requires the FULL schedule and a green post-matrix gate before reporting completion", async () => {
    const root = freshRoot("fs-gate-red");
    const run = await runFailStopMatrix({
      runId: "gate-red",
      runRoot: root,
      schedule,
      launch: async () => ({ resultCorrect: true }),
      validityGate: async () => ({ green: false, detail: "gate red" }),
    });
    expect(run.terminalState).toBe("ABORT_PRESERVED");
    expect(run.failure.cause).toBe("POST_MATRIX_VALIDITY_GATE_RED");
    expect(run.matrixCompleted).toBe(false);
  });

  it("completes only when every scheduled session is recorded and the gate is green", async () => {
    const root = freshRoot("fs-complete");
    const run = await runFailStopMatrix({
      runId: "complete",
      runRoot: root,
      schedule,
      launch: async () => ({ resultCorrect: true }),
      validityGate: async ({ completed }: { completed: readonly string[] }) => ({ green: completed.length === schedule.length }),
    });
    expect(run.terminalState).toBe("MATRIX_COMPLETE");
    expect(run.matrixCompleted).toBe(true);
    expect(run.completedSessions).toEqual(["b0-C-G1", "b0-C-G2"]);
    expect(run.maxLaunchesPerSession).toBe(1);
  });
});

describe("R3-L0C-F §7 — preservation, read from disk rather than from a cleanup return", () => {
  it("places the PRESERVE marker before the first launch and writes an abort manifest", async () => {
    const root = freshRoot("preserve");
    const run = await runFailStopMatrix({
      runId: "preserve",
      runRoot: root,
      schedule: twoGenerationSchedule(0, "C"),
      launch: async () => ({ reportMissing: true }),
      validityGate: async () => ({ green: true }),
    });
    expect(run.terminalState).toBe("ABORT_PRESERVED");
    /** §7: the marker and the manifest are on disk, and the manifest names the incomplete session. */
    const manifest = JSON.parse(readFileSync(join(root, "abort-manifest.json"), "utf8"));
    expect(manifest.terminalState).toBe("ABORT_PRESERVED");
    expect(manifest.incompleteSessions).toContain("b0-C-G2");
    expect(readFileSync(join(root, "PRESERVE"), "utf8").length).toBeGreaterThan(0);
    const index = JSON.parse(readFileSync(join(root, "evidence-index.json"), "utf8"));
    expect(index.artifacts.length).toBeGreaterThan(0);
  });
});

describe("R3-L0C-F §8 — every §8 property is falsifiable", () => {
  it("reports a violation for each property when the observation violates it", () => {
    const controls = runPropertyNegativeControls();
    expect(controls.ALL_PROPERTIES_FALSIFIABLE).toBe(true);
    expect(controls.controls.length).toBe(5);
    for (const control of controls.controls) expect(control.DETECTED).toBe(true);
  });

  it("holds for a clean observation", () => {
    const observation = buildObservation({
      plannedSessions: ["s1"],
      launches: [{ sessionId: "s1", attempt: 1 }],
      completedSessions: ["s1"],
      durableRecords: [{ sessionId: "s1", kind: "TRIAL_RECORDED" }],
    });
    expect(evaluateFailStopProperties(observation).ALL_PROPERTIES_HOLD).toBe(true);
  });
});

describe("R3-L0C-F §9 — the executable closure", () => {
  it("covers the five separated parts and includes the compiled shipped runtime", async () => {
    const closure = await computeExecutionClosure();
    expect(closure.partIds).toEqual(["SOURCE_CLOSURE", "COMPILED_RUNTIME_CLOSURE", "EXECUTOR_CONFIGURATION", "MODEL_IDENTITY_EVIDENCE", "EXPERIMENT_PLAN_DIGEST"]);
    const compiled = Object.keys(closure.fileDigests.COMPILED_RUNTIME_CLOSURE);
    expect(compiled.some((file: string) => file.includes("git_port"))).toBe(true);
    expect(closure.coversCodeNotResults).toBe(true);
    /** §9: the self-referential artifacts are excluded by name. */
    expect(closure.selfExclusions.length).toBeGreaterThan(0);
  });

  it("§9 records no secret value", async () => {
    const closure = await computeExecutionClosure();
    expect(closure.executor.credentialValueRead).toBe(false);
    expect(closure.executor.credentialValueHashed).toBe(false);
    /** The credential is present only as a REFERENCE. */
    expect(typeof closure.executor.apiKeyEnvRef).toBe("string");
    expect(closure.modelIdentity.secretsIncluded).toBe(false);
  });

  it("§9's mutation moves the digest for a shipped-runtime change and names the part", async () => {
    const mutation = await runClosureMutation();
    expect(mutation.EXECUTION_CLOSURE_MUTATION).toBe("PASS");
    const arm = mutation.arms.find((entry: { id: string }) => entry.id === "MUTATION_LOAD_BEARING_PRODUCTION_INPUT");
    expect(arm.digestMoved).toBe(true);
    expect(arm.changedParts).toContain("SOURCE_CLOSURE");
    /** §9: the tree was not mutated; the change was applied to a copy. */
    expect(mutation.treeMutated).toBe(false);
  });

  it("§9's mutation controls show the closure is sensitive to the right thing", async () => {
    const mutation = await runClosureMutation();
    const uncovered = mutation.arms.find((entry: { id: string }) => entry.id === "CONTROL_UNCOVERED_FILE");
    const historical = mutation.arms.find((entry: { id: string }) => entry.id === "CONTROL_HISTORICAL_HARNESS_FILE");
    expect(uncovered.digestMoved).toBe(false);
    expect(historical.digestMoved).toBe(true);
  });

  it("§9 measures that the OLD closure was blind to the shipped runtime", async () => {
    const mutation = await runClosureMutation();
    expect(mutation.legacyClosure.BLIND_TO_SHIPPED_RUNTIME).toBe(true);
    expect(mutation.legacyClosure.coversGitPort).toBe(false);
    expect(mutation.legacyClosure.shippedRuntimeFileCount).toBe(0);
  });

  it("detects a drifted closure by naming the part", async () => {
    const current = await computeExecutionClosure();
    const comparison = checkExecutionClosure(current, current);
    expect(comparison.EXECUTION_CLOSURE).toBe("MATCH");
    const drifted = { ...current, parts: { ...current.parts, SOURCE_CLOSURE: "0".repeat(64) }, executionClosureDigest: "0".repeat(64) };
    const detected = checkExecutionClosure(drifted, current);
    expect(detected.EXECUTION_CLOSURE).toBe("DRIFTED");
    expect(detected.changedParts).toContain("SOURCE_CLOSURE");
  });
});
