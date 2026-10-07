/**
 * R3-S0 — THE SYSTEMIC CONFORMANCE TESTS (COMMIT 2).
 *
 * These exercise the harness the way the ruling asks for: the DETERMINISTIC ACTORS are driven directly, the
 * MUTATIONS are run and must be DETECTED, and the recorded conformance run is checked against the invariants
 * the contract froze in commit 1.
 *
 * The tests are written so a green result means the MECHANISM held, not that a task succeeded. §"Constitutional
 * law" is enforced in the tests themselves: nothing here asserts on a benchmark outcome.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ADVERSARIAL_ATTEMPTS, SCRIPTED_WORKER_ACTIONS, adversarialWorker, acceptedAttempts, pulledBodyOf, refusedAttempts, scriptedWorker } from "../scripts/r3s0/actors.mjs";
import { MATRIX_CELLS, MUTATION_VERDICTS, PREREGISTERED_MUTATIONS } from "../scripts/r3s0/contract.mjs";
import { makeBypassWitness, makeMechanismWitness, makeProjectBehaviorTrace } from "../scripts/r3s0/trace.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const EVIDENCE = join(REPO_ROOT, "research-evidence", "r3-s0");

const runScript = (relative: string): string =>
  execFileSync(process.execPath, [join(REPO_ROOT, relative)], { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/* ================================================================ §"Deterministic workers" */

describe("R3-S0 §Deterministic workers — the ScriptedWorker cannot infer", () => {
  const context = (handles: string[]) => ({ compiled: { handles: handles.map((handle) => ({ handle })), boot: [{ kind: "project" }] } });

  it("§Deterministic workers the canonical script pulls a VISIBLE handle through the governed channel", async () => {
    const pulls: string[] = [];
    const worker = scriptedWorker({
      script: [{ action: SCRIPTED_WORKER_ACTIONS.PULL_VISIBLE_HANDLE, handle: "@ctx/proof/pc-1" }],
    });
    const outcome = await worker.run({
      workDir: REPO_ROOT,
      context: context(["@ctx/proof/pc-1"]),
      contextPull: async (handle: string) => { pulls.push(handle); return { body: { statement: "resolved" } }; },
    });
    expect(outcome.kind).toBe("READY_FOR_SETTLEMENT");
    expect(pulls).toEqual(["@ctx/proof/pc-1"]);
    expect(pulledBodyOf({ body: { statement: "x" } })).toEqual({ statement: "x" });
  });

  it("§Deterministic workers a handle that did NOT reach the boundary FAILS the script rather than searching the filesystem", async () => {
    let pulled = false;
    const worker = scriptedWorker({
      script: [{ action: SCRIPTED_WORKER_ACTIONS.PULL_VISIBLE_HANDLE, handle: "@ctx/proof/absent" }],
    });
    const outcome = await worker.run({
      workDir: REPO_ROOT,
      context: context([]),
      contextPull: async () => { pulled = true; return {}; },
    });
    /** The worker must NOT have pulled, and it must have reported the absence. */
    expect(pulled).toBe(false);
    expect(outcome.kind).toBe("NEEDS_ESCALATION");
    expect(outcome.detail).toMatch(/HANDLE_NOT_AT_CONSUMER_BOUNDARY/u);
    expect(worker.observations[0].failures).toContain("HANDLE_NOT_AT_CONSUMER_BOUNDARY:@ctx/proof/absent");
  });

  it("§Deterministic workers a LEAKED handle fails the script, so leakage is not shrugged off", async () => {
    const worker = scriptedWorker({
      script: [{ action: SCRIPTED_WORKER_ACTIONS.ASSERT_HANDLE_ABSENT, handle: "@ctx/proof/should-not-be-here" }],
    });
    const outcome = await worker.run({
      workDir: REPO_ROOT,
      context: context(["@ctx/proof/should-not-be-here"]),
      contextPull: async () => ({}),
    });
    expect(outcome.kind).toBe("NEEDS_ESCALATION");
    expect(outcome.detail).toMatch(/HANDLE_LEAKED_TO_CONSUMER/u);
  });

  it("§Deterministic workers the worker never reads the filesystem: its only read is the governed pull", async () => {
    const worker = scriptedWorker({ script: [{ action: SCRIPTED_WORKER_ACTIONS.NOOP_READY }] });
    const outcome = await worker.run({ workDir: REPO_ROOT, context: context([]), contextPull: undefined });
    expect(outcome.kind).toBe("READY_FOR_SETTLEMENT");
    /** No pull was bound and none was attempted, so no failure was recorded. */
    expect(worker.observations[0].failures).toEqual([]);
  });

  it("§Deterministic workers a scripted action with no handle is reported, not silently skipped", async () => {
    const worker = scriptedWorker({ script: [{ action: SCRIPTED_WORKER_ACTIONS.PULL_VISIBLE_HANDLE }] });
    const outcome = await worker.run({ workDir: REPO_ROOT, context: context([]), contextPull: async () => ({}) });
    expect(outcome.detail).toMatch(/SCRIPT_MISSING_HANDLE/u);
  });
});

describe("R3-S0 §Deterministic workers — the AdversarialWorker attempts and records", () => {
  it("§Deterministic workers an unlisted handle is refused and recorded as REFUSED", async () => {
    const worker = adversarialWorker({
      attempts: [ADVERSARIAL_ATTEMPTS.UNLISTED_CONTEXT_PULL],
      unlistedHandle: "@ctx/proof/never-listed",
    });
    await worker.run({
      workDir: REPO_ROOT,
      context: { compiled: { handles: [], boot: [] } },
      contextPull: async () => null,
    });
    const attempt = worker.attempts.find((entry: any) => entry.attempt === ADVERSARIAL_ATTEMPTS.UNLISTED_CONTEXT_PULL);
    expect(attempt).toBeDefined();
    expect(attempt!.outcome).toBe("REFUSED");
    expect(refusedAttempts(worker.attempts)).toContain(ADVERSARIAL_ATTEMPTS.UNLISTED_CONTEXT_PULL);
  });

  it("§Deterministic workers a RESOLVED unlisted handle is recorded as not refused, so a bypass is visible", async () => {
    const worker = adversarialWorker({
      attempts: [ADVERSARIAL_ATTEMPTS.UNLISTED_CONTEXT_PULL],
      unlistedHandle: "@ctx/proof/leaked",
    });
    await worker.run({
      workDir: REPO_ROOT,
      context: { compiled: { handles: [], boot: [] } },
      contextPull: async () => ({ body: { statement: "leaked" } }),
    });
    const attempt = worker.attempts[0];
    expect(attempt.outcome).toBe("RESOLVED");
    expect(acceptedAttempts(worker.attempts).length).toBe(1);
    expect(refusedAttempts(worker.attempts)).toEqual([]);
  });

  it("§Deterministic workers the adversarial actor never claims success", async () => {
    const worker = adversarialWorker({ attempts: [] });
    const outcome = await worker.run({ workDir: REPO_ROOT, context: { compiled: { handles: [], boot: [] } }, contextPull: async () => null });
    expect(outcome.kind).toBe("NEEDS_ESCALATION");
  });

  it("§Deterministic workers a throwing seam is recorded as REFUSED rather than propagating", async () => {
    const worker = adversarialWorker({
      attempts: [ADVERSARIAL_ATTEMPTS.UNAUTHORIZED_CANONICAL_MUTATION],
      unauthorizedMutation: async () => { throw new Error("authority required"); },
    });
    await worker.run({ workDir: REPO_ROOT, context: { compiled: { handles: [], boot: [] } }, contextPull: async () => null });
    expect(worker.attempts[0].outcome).toBe("REFUSED");
    expect(worker.attempts[0].detail).toMatch(/authority required/u);
  });

  it("§Deterministic workers the actors are NOT canonical Agent types: they are never registered anywhere", () => {
    /** The docstring wraps and carries comment markers, so strip both before matching. */
    const source = readFileSync(join(REPO_ROOT, "scripts", "r3s0", "actors.mjs"), "utf8")
      .split(String.fromCharCode(10))
      .map((line) => line.replace(/^\s*\*?\s?/u, ""))
      .join(" ");
    expect(source).toMatch(/TEST ACTORS, not canonical\s+Agent types/u);
    /** They live under scripts/, never under src/, so no package surface can reach them. */
    expect(existsSync(join(REPO_ROOT, "src", "r3s0"))).toBe(false);
  });
});

/* ================================================================ §"Mechanism Witness" end to end */

describe("R3-S0 §Mechanism Witness — the law holds on the recorded scenarios", () => {
  it("§Mechanism Witness a witness built from REAL scenario facts is DEMONSTRATED", () => {
    const witness = makeMechanismWitness({
      mechanism: "PROMOTION",
      taskOutcome: "TASK_SUCCESS",
      steps: {
        canonical_precondition: "a verified attempt existed",
        runtime_projection: "the runtime prepared the promotion",
        actual_consumer_visible_state: "the canonical HEAD moved",
        allowed_action_or_tool: "controller.promote",
        authorized_owner_interaction: "the effects owner performed the git promote",
        durable_consequence: "PROMOTION_COMMITTED is in the ledger",
      },
    });
    expect(witness.verdict).toBe("MECHANISM_DEMONSTRATED");
    expect(witness.taskSuccessWithoutWitness).toBe(false);
  });

  it("§Mechanism Witness a witness missing the DURABLE step is NOT demonstrated even on task success", () => {
    const witness = makeMechanismWitness({
      mechanism: "PROMOTION",
      taskOutcome: "TASK_SUCCESS",
      steps: {
        canonical_precondition: "a verified attempt existed",
        runtime_projection: "the runtime prepared the promotion",
        actual_consumer_visible_state: "the canonical HEAD moved",
        allowed_action_or_tool: "controller.promote",
        authorized_owner_interaction: "the effects owner performed the git promote",
      },
    });
    expect(witness.verdict).toBe("MECHANISM_NOT_DEMONSTRATED");
    expect(witness.taskSuccessWithoutWitness).toBe(true);
    expect(witness.missingSteps).toEqual(["durable_consequence"]);
  });

  it("§Mechanism Witness the trace records itself as non-canonical and digests its own content", () => {
    const trace = makeProjectBehaviorTrace({ projectId: "p", canonicalNodeRefs: ["WORK:Promotion"] });
    expect(trace.canonical).toBe(false);
    expect(trace.traceDigest).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("§Forbidden-bypass witness an OPEN bypass yields the honest claim, never the blocked one", () => {
    const witness = makeBypassWitness({ results: [{ id: "NO_AUTHORITY_BYPASS", blocked: false }] });
    expect(witness.claim).toBe("KNOWN_BYPASSES_OPEN");
    expect(witness.claim).not.toBe("KNOWN_BYPASSES_BLOCKED");
    expect(witness.claimScope).toMatch(/not a proof/u);
  });
});

/* ================================================================ §"Mutation testing" — the real suite */

describe("R3-S0 §Mutation testing — every preregistered mutation is DETECTED", () => {
  it("§Mutation testing the recorded conformance run reports all six mutations DETECTED with passing controls", () => {
    const record = JSON.parse(readFileSync(join(EVIDENCE, "conformance-run.json"), "utf8"));
    const byId = Object.fromEntries(record.mutations.map((mutation: any) => [mutation.id, mutation]));
    for (const mutation of PREREGISTERED_MUTATIONS) {
      const result = byId[mutation.id];
      expect(result, `${mutation.id} is missing from the recorded run`).toBeDefined();
      expect(result.verdict, `${mutation.id} escaped`).toBe(MUTATION_VERDICTS.DETECTED);
      /** A mutation is only DETECTED if the UNMUTATED control was green: otherwise the gate was red anyway. */
      expect(result.controlGreen, `${mutation.id} control was not green`).toBe(true);
      expect(result.mutantRed, `${mutation.id} mutant did not turn the gate red`).toBe(true);
    }
    expect(record.gates.S3.green).toBe(true);
    expect(record.gates.S3.escaped).toEqual([]);
  });

  it("§Mutation testing each mutation names the systemic invariant that catches it", () => {
    const record = JSON.parse(readFileSync(join(EVIDENCE, "conformance-run.json"), "utf8"));
    for (const result of record.mutations) expect(result.detectedBy, result.id).toBeTruthy();
    for (const mutation of PREREGISTERED_MUTATIONS) {
      const result = record.mutations.find((entry: any) => entry.id === mutation.id);
      expect(result.detectedBy).toBe(mutation.detectedBy);
    }
  });
});

/* ================================================================ §"Loop conformance matrix" — the recorded matrices */

describe("R3-S0 §Loop conformance matrix — the recorded matrices are green and complete", () => {
  const record = JSON.parse(readFileSync(join(EVIDENCE, "conformance-run.json"), "utf8"));

  it("§Loop conformance matrix every loop matrix has NO load-bearing FAIL", () => {
    for (const matrix of record.loopMatrices) {
      expect(matrix.loadBearingFailures, matrix.loopId).toEqual([]);
      expect(matrix.green, matrix.loopId).toBe(true);
    }
  });

  it("§Loop conformance matrix every loop matrix has NO load-bearing NOT_EXERCISED", () => {
    for (const matrix of record.loopMatrices) expect(matrix.loadBearingNotExercised, matrix.loopId).toEqual([]);
    expect(record.loadBearingNotExercised).toEqual([]);
  });

  it("§Loop conformance matrix every cell uses one of the four allowed values, and nothing is collapsed", () => {
    const allowed = Object.values(MATRIX_CELLS);
    for (const matrix of record.loopMatrices) {
      for (const row of matrix.rows) expect(allowed, `${matrix.loopId}/${row.path}`).toContain(row.verdict);
      /** NOT_APPLICABLE cells must carry a reason, which is what makes them auditable. */
      for (const row of matrix.rows.filter((entry: any) => entry.verdict === MATRIX_CELLS.NOT_APPLICABLE)) {
        expect(row.detail.length, `${matrix.loopId}/${row.path}`).toBeGreaterThan(30);
      }
    }
  });

  it("§Loop conformance matrix the Work loop drove ALL SIX paths", () => {
    const work = record.loopMatrices.find((matrix: any) => matrix.loopId === "WORK");
    expect(work.rows.length).toBe(6);
    expect(work.rows.filter((row: any) => row.verdict === MATRIX_CELLS.PASS).length).toBe(6);
  });

  it("§Loop conformance matrix the four loops are all present", () => {
    expect(record.loopMatrices.map((matrix: any) => matrix.loopId).sort()).toEqual(["COLLABORATION", "EVOLUTION", "KNOWLEDGE", "WORK"]);
  });
});

/* ================================================================ §"Cross-loop closure scenarios" */

describe("R3-S0 §Cross-loop closure scenarios — all three seams are load-bearing and green", () => {
  const record = JSON.parse(readFileSync(join(EVIDENCE, "conformance-run.json"), "utf8"));

  it("§Cross-loop closure all three declared seams appear in the recorded run", () => {
    const paths = record.closures.map((entry: any) => entry.path);
    expect(paths).toContain("WORK->KNOWLEDGE->FUTURE_WORK");
    expect(paths).toContain("EVOLUTION->FUTURE_WORK");
    expect(paths).toContain("COLLABORATION->LOCAL_WORK");
  });

  it("§Cross-loop closure every closure seam is PASS", () => {
    for (const entry of record.closures) expect(entry.verdict, entry.path).toBe(MATRIX_CELLS.PASS);
  });

  it("§Cross-loop closure WORK->KNOWLEDGE->FUTURE_WORK crossed a REAL process boundary", () => {
    const entry = record.closures.find((cell: any) => cell.path === "WORK->KNOWLEDGE->FUTURE_WORK");
    expect(entry.detail).toMatch(/differentProcess=true/u);
    expect(entry.detail).toMatch(/capitalSurvived=true/u);
    expect(entry.detail).toMatch(/bodyResolved=true/u);
  });

  it("§Cross-loop closure EVOLUTION->FUTURE_WORK changed the LATER attempt's input", () => {
    const entry = record.closures.find((cell: any) => cell.path === "EVOLUTION->FUTURE_WORK");
    expect(entry.detail).toMatch(/20 ms/u);
    expect(entry.detail).toMatch(/oldRequirementGone=true/u);
  });

  it("§Cross-loop closure COLLABORATION->LOCAL_WORK is proven inside the Collaboration loop, and says so", () => {
    const entry = record.closures.find((cell: any) => cell.path === "COLLABORATION->LOCAL_WORK");
    expect(entry.verdict).toBe(MATRIX_CELLS.PASS);
    expect(entry.detail).toMatch(/inside the Collaboration loop/u);
  });
});

/* ================================================================ §"Cold-restart discipline" */

describe("R3-S0 §Cold-restart discipline — a REAL process boundary, not an in-process re-install", () => {
  const record = JSON.parse(readFileSync(join(EVIDENCE, "conformance-run.json"), "utf8"));

  it("§Cold-restart discipline every cold-restart cell names a child pid DIFFERENT from the parent", () => {
    const restartCells = record.loopMatrices.flatMap((matrix: any) => matrix.rows.filter((row: any) => row.path === "coldRestart"));
    expect(restartCells.length).toBeGreaterThanOrEqual(3);
    for (const row of restartCells) {
      expect(row.verdict).toBe(MATRIX_CELLS.PASS);
      expect(row.detail).toMatch(/differentProcess=true|childPid=\d+/u);
    }
  });

  it("§Cold-restart discipline the Knowledge and Evolution continuity proofs both cross the boundary", () => {
    for (const loopId of ["KNOWLEDGE", "EVOLUTION"]) {
      const matrix = record.loopMatrices.find((entry: any) => entry.loopId === loopId);
      const row = matrix.rows.find((entry: any) => entry.path === "coldRestart");
      expect(row.verdict, loopId).toBe(MATRIX_CELLS.PASS);
    }
  });

  it("§Cold-restart discipline the rig restarts in a CHILD PROCESS, not a module re-import", () => {
    const source = readFileSync(join(REPO_ROOT, "scripts", "r3s0", "rig.mjs"), "utf8");
    expect(source).toMatch(/execFileSync\(process\.execPath/u);
    expect(source).toMatch(/a real OS\s+\*?\s*process boundary|real process boundary/iu);
  });
});

/* ================================================================ §"Runtime conformance" */

describe("R3-S0 §Runtime conformance — the shipped runtime path", () => {
  const record = JSON.parse(readFileSync(join(EVIDENCE, "conformance-run.json"), "utf8"));

  it("§Runtime conformance every runtime check passes", () => {
    expect(record.runtimeConformance.cell.verdict).toBe(MATRIX_CELLS.PASS);
    for (const row of record.runtimeConformance.rows) expect(row.pass, row.check).toBe(true);
  });

  it("§Runtime conformance the context index IS forwarded, which is the R1-L/R2-U historical defect", () => {
    const row = record.runtimeConformance.rows.find((entry: any) => entry.check === "CONTEXT_INDEX_FORWARDED");
    expect(row.pass).toBe(true);
    expect(row.detail).toMatch(/contextIndexText present/u);
  });

  it("§Runtime conformance the experimental flags are OFF by default", () => {
    const row = record.runtimeConformance.rows.find((entry: any) => entry.check === "DEFAULT_FLAGS_OFF");
    expect(row.pass).toBe(true);
    expect(row.detail).toMatch(/efficacy=unset/u);
    expect(row.detail).toMatch(/index=unset/u);
  });

  it("§Runtime conformance no identity divergence was observed, so nothing is INFRASTRUCTURE_INVALID", () => {
    expect(record.runtimeConformance.cell.detail).not.toMatch(/INFRASTRUCTURE_INVALID/u);
  });
});

/* ================================================================ §"Historical-defect regression" */

describe("R3-S0 §Historical-defect regression — each historical defect is caught by a named invariant", () => {
  const record = JSON.parse(readFileSync(join(EVIDENCE, "conformance-run.json"), "utf8"));

  it("§Historical-defect regression all three historical defect classes are CAUGHT", () => {
    expect(record.historicalDefects.length).toBe(3);
    for (const entry of record.historicalDefects) {
      expect(entry.caught, `${entry.id} was not caught by ${entry.caughtBy}`).toBe(true);
      expect(entry.evidence.length).toBeGreaterThan(10);
    }
  });

  it("§Historical-defect regression the index-forwarding defect is caught by the consumer-boundary proof", () => {
    const entry = record.historicalDefects.find((item: any) => item.id === "R1L_R2U_MISSING_INDEX_FORWARDING");
    expect(entry.caughtBy).toBe("CONSUMER_BOUNDARY_PROOF");
    expect(entry.evidence).toMatch(/index bytes=294/u);
  });

  it("§Historical-defect regression the vacuous-gate defect is caught by the anti-vacuity scan", () => {
    const entry = record.historicalDefects.find((item: any) => item.id === "VACUOUS_CONDITION_OR_TRUE_GATE");
    expect(entry.caughtBy).toBe("ANTI_VACUITY_SCAN");
    expect(entry.evidence).toMatch(/PASS/u);
  });

  it("§Historical-defect regression the nested-classPass defect is caught by driving the engine with real records", () => {
    const entry = record.historicalDefects.find((item: any) => item.id === "R3A_NESTED_CLASSPASS_INTEGRATION");
    expect(entry.caughtBy).toBe("EVIDENCE_CORRECTNESS_INTEGRATION");
    expect(entry.evidence).toMatch(/tests pass/u);
  });
});

/* ================================================================ §"Evidence correctness" */

describe("R3-S0 §Evidence correctness — the digest closure is complete for every scenario", () => {
  const record = JSON.parse(readFileSync(join(EVIDENCE, "conformance-run.json"), "utf8"));

  it("§Evidence correctness every scenario carries a COMPLETE digest closure", () => {
    expect(record.evidenceClosures.length).toBeGreaterThanOrEqual(6);
    for (const closure of record.evidenceClosures) {
      expect(closure.complete, `${closure.scenario} closure is incomplete: missing ${closure.missing.join(", ")}`).toBe(true);
      expect(closure.missing).toEqual([]);
    }
  });

  it("§Evidence correctness the tested source bytes are digested, not left ephemeral", () => {
    expect(record.testedSourceDigest).toMatch(/^[0-9a-f]{64}$/u);
    for (const closure of record.evidenceClosures) expect(closure.digests.testedSourceBytes).toBe(record.testedSourceDigest);
  });

  it("§Evidence correctness the contract itself is digested, so the run is bound to the frozen contract", () => {
    expect(record.contractDigest).toMatch(/^[0-9a-f]{64}$/u);
  });
});

/* ================================================================ §"Gate structure" — S4 */

describe("R3-S0 §Gate structure — S4 and the final verdicts", () => {
  const record = JSON.parse(readFileSync(join(EVIDENCE, "conformance-run.json"), "utf8"));

  it("§Gate structure S1 is green", () => {
    expect(record.gates.S1.green).toBe(true);
    expect(record.gates.S1.detail).toMatch(/10\/10/u);
  });

  it("§Gate structure S2 is green with zero load-bearing failures and zero unexercised paths", () => {
    expect(record.gates.S2.green).toBe(true);
    expect(record.gates.S2.loadBearingFailures).toEqual([]);
    expect(record.gates.S2.loadBearingNotExercised).toEqual([]);
  });

  it("§Gate structure S3 is green with zero escaped mutations and zero open bypasses", () => {
    expect(record.gates.S3.green).toBe(true);
    expect(record.gates.S3.escaped).toEqual([]);
    expect(record.gates.S3.openBypasses).toEqual([]);
  });

  it("§Gate structure S4 sets SYSTEM_VALID only with all six categories green", () => {
    expect(record.gates.S4.SYSTEM_VALID).toBe(true);
    expect(record.gates.S4.notGreen).toEqual([]);
    for (const category of record.gates.S4.categories) expect(category.green, category.id).toBe(true);
  });

  it("§Forbidden-bypass witness the recorded bypass witness claims only KNOWN_BYPASSES_BLOCKED", () => {
    expect(record.bypass.claim).toBe("KNOWN_BYPASSES_BLOCKED");
    expect(record.bypass.open).toEqual([]);
    expect(record.bypass.claimScope).toMatch(/not a proof that no unknown bypass exists/u);
  });
});

/* ================================================================ the gates run green from a cold start */

describe("R3-S0 the audit gates are runnable and green", () => {
  it("§Gate structure S1 runs green from a cold start", () => {
    const output = runScript(join("scripts", "r3s0", "graph-audit.mjs"));
    expect(output).toMatch(/10\/10 invariant\(s\) PASS/u);
    expect(output).not.toMatch(/^FAIL/mu);
  });

  it("§Event audit the durable event audit runs green from a cold start", () => {
    const output = runScript(join("scripts", "r3s0", "event-audit.mjs"));
    expect(output).toMatch(/5\/5 audit check\(s\) PASS/u);
  });
});
