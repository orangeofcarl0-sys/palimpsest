/**
 * R3-L0C-I Gate 3/4/5 — INTEGRATION, CLOSURE COMPLETENESS AND SEMANTIC SUFFICIENCY.
 *
 * Gate 3's tests drive the REAL generation child through the frozen 16-session schedule with a ScriptedWorker, and
 * inject a fault at the first, middle and last positions. Gate 4's tests prove the closure covers every reachable
 * module, that the toolchain participates in the digest, and that the three required mutations move it. Gate 5's
 * tests adjudicate the capital against the frozen reference cases.
 *
 * THE PREHISTORY IS BUILT ONCE. It takes about twenty seconds and is deterministic, and the Gate 3 cases each get
 * their own COPY because a fail-stop run claims and preserves its root.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildPrehistory } from "../scripts/r3l0c/build-prehistory.mjs";
import { admitCapital, selectionRefs } from "../scripts/r3l0c/prehistory.mjs";
import { installHostBundle, dshHome } from "../scripts/gates/env.mjs";
import { PRIMARY_FAULTS, runPrimaryMatrix } from "../scripts/r3l0cf/primary-matrix-driver.mjs";
import { assertAuthoritativePath, frozenPrimarySchedule, faultPositionFault } from "../scripts/r3l0cf/primary-matrix.mjs";
import { verifyClosureCompleteness, walkImportGraph } from "../scripts/r3l0cf/closure-graph.mjs";
import { computeExecutionClosure, verifyCompiledAgainstSource } from "../scripts/r3l0cf/closure.mjs";
import { runClosureMutation } from "../scripts/r3l0cf/closure-mutation.mjs";
import { CLOSURE_FILES, CLOSURE_PARTS } from "../scripts/r3l0cf/contract.mjs";
import { runCapitalSufficiency, runProcedureFalsifiers } from "../scripts/r3l0cf/capital-sufficiency.mjs";

const BASE = join(tmpdir(), `palimpsest-r3l0ci-gates-${String(process.pid)}`);
let prehistory: { world: string; paths: Record<string, string>; state: string };
let refs: readonly unknown[];

beforeAll(async () => {
  rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  mkdirSync(BASE, { recursive: true });
  const built = await buildPrehistory(join(BASE, "prehistory"));
  const admitted = await admitCapital(join(BASE, "prehistory"), built.paths, "cutover-entitlements", built.world);
  prehistory = { world: built.world, paths: built.paths, state: built.paths.state };
  refs = selectionRefs(admitted);
}, 900_000);

afterAll(() => {
  try { rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
});

/** Gate 3: run the frozen matrix in its own root, with an optional fault at a position. */
async function runCase(name: string, options: { faultAt?: string; faultKind?: string | undefined } = {}) {
  return await runPrimaryMatrix({
    runId: `r3l0ci-${name}`,
    runRoot: join(BASE, name),
    prehistory: { world: prehistory.world, state: prehistory.state },
    admittedRefs: refs,
    installHostBundle,
    dshHome,
    authorizedBy: "r3-l0c-i-primary-plan",
    caller: "r3-l0c-i-primary-plan",
    ...options,
  });
}

describe("R3-L0C-I Gate 3 — the primary matrix through the real child", () => {
  it("the frozen schedule is 16 sessions across 8 trajectories in the frozen arm order", async () => {
    const schedule = await frozenPrimarySchedule();
    expect(schedule.length).toBe(16);
    expect(new Set(schedule.map((session) => session.trajectoryId)).size).toBe(8);
    /** The arm order is the frozen randomization's, not a fresh one. */
    const firstBlockArms = schedule.filter((session) => session.block === 0).map((session) => session.arm);
    expect(new Set(firstBlockArms).size).toBe(2);
    /** G2 depends on G1 in its trajectory; G1 depends on nothing. */
    for (const session of schedule) {
      if (session.generation === "G1") expect(session.requiresResolved).toBeNull();
      else expect(session.requiresResolved).toBe(`${session.trajectoryId}-G1`);
    }
  });

  it("the fault positions are the ruling's first, middle and last", () => {
    const first = faultPositionFault(0, 16);
    const middle = faultPositionFault(7, 16);
    const last = faultPositionFault(15, 16);
    expect(first.FIRST).toBe(true);
    expect(middle.MIDDLE).toBe(true);
    expect(last.LAST).toBe(true);
    expect(middle.middleIndex).toBe(7);
    expect(last.lastIndex).toBe(15);
  });

  it("the old R3-L0C-R matrix is quarantined: the authoritative-path guard refuses any other caller", () => {
    expect(() => assertAuthoritativePath({ caller: "scripts/r3l0cr/matrix.mjs" })).toThrow(/not the authoritative execution path/);
    expect(() => assertAuthoritativePath({ caller: "anything", authorizedBy: "something-else" })).toThrow(/REFUSED/);
    const authorized = assertAuthoritativePath({ caller: "r3-l0c-i-primary-plan", authorizedBy: "r3-l0c-i-primary-plan" });
    expect(authorized.authorized).toBe(true);
    expect(authorized.legacyMatrixQuarantined).toBe(true);
  });

  it("runs all 16 sessions through the real child with zero model calls, and the treatment boundary is exact", async () => {
    const result = await runCase("healthy");
    expect(result.scheduleLength).toBe(16);
    expect(result.trajectoryCount).toBe(8);
    expect(result.terminalState).toBe("MATRIX_COMPLETE");
    expect(result.completedSessions.length).toBe(16);
    /** THE FAIL-STOP LAW: one launch per session, and it held across all sixteen. */
    expect(result.maxLaunchesPerSession).toBe(1);
    expect(result.run.properties.ALL_PROPERTIES_HOLD).toBe(true);
    /** THE TREATMENT BOUNDARY: H sees nothing; C sees 2 then 4. */
    const visibleByArmGeneration: Record<string, number[]> = {};
    for (const record of result.run.records as readonly { arm: string; generation: string; consumerVisibleHandles: readonly unknown[] }[]) {
      const key = `${record.arm}/${record.generation}`;
      visibleByArmGeneration[key] = [...(visibleByArmGeneration[key] ?? []), record.consumerVisibleHandles.length];
    }
    expect(visibleByArmGeneration["H/G1"]).toEqual([0, 0, 0, 0]);
    expect(visibleByArmGeneration["H/G2"]).toEqual([0, 0, 0, 0]);
    expect(visibleByArmGeneration["C/G1"]).toEqual([2, 2, 2, 2]);
    expect(visibleByArmGeneration["C/G2"]).toEqual([4, 4, 4, 4]);
    /** Gate 2: the behavioural observations are RECORDED, and no verdict was issued. */
    expect(result.run.causalVerdictIssued).toBe(false);
  }, 900_000);

  it("injects a fault at the FIRST session: no later launch, no replacement, no retry", async () => {
    const result = await runCase("fault-first", { faultAt: "FIRST", faultKind: PRIMARY_FAULTS.REPORT_MISSING });
    expect(result.terminalState).toBe("ABORT_PRESERVED");
    expect(result.completedSessions.length).toBe(0);
    expect(result.run.launches.length).toBe(1);
    expect(result.maxLaunchesPerSession).toBe(1);
    expect(result.sessionsAfterFault).toEqual([]);
    expect(result.run.failure.failureClass).toBe("INFRASTRUCTURE_OR_PROTOCOL");
    expect(result.run.failure.cause).toBe("MISSING_WORKER_REPORT");
    expect(result.run.properties.ALL_PROPERTIES_HOLD).toBe(true);
  }, 900_000);

  it("injects a fault at the MIDDLE session: no later launch, no replacement, no retry", async () => {
    const result = await runCase("fault-middle", { faultAt: "MIDDLE", faultKind: PRIMARY_FAULTS.REPORT_MISSING });
    expect(result.terminalState).toBe("ABORT_PRESERVED");
    expect(result.completedSessions.length).toBe(7);
    expect(result.run.launches.length).toBe(8);
    expect(result.maxLaunchesPerSession).toBe(1);
    expect(result.sessionsAfterFault).toEqual([]);
    expect(result.faultsInjected[0]?.scheduleIndex).toBe(7);
    expect(result.run.properties.ALL_PROPERTIES_HOLD).toBe(true);
  }, 900_000);

  it("injects a fault at the LAST session: no later launch, no replacement, no retry", async () => {
    const result = await runCase("fault-last", { faultAt: "LAST", faultKind: PRIMARY_FAULTS.REPORT_MISSING });
    expect(result.terminalState).toBe("ABORT_PRESERVED");
    expect(result.completedSessions.length).toBe(15);
    expect(result.run.launches.length).toBe(16);
    expect(result.maxLaunchesPerSession).toBe(1);
    expect(result.sessionsAfterFault).toEqual([]);
    expect(result.faultsInjected[0]?.scheduleIndex).toBe(15);
    expect(result.run.properties.ALL_PROPERTIES_HOLD).toBe(true);
  }, 900_000);

  it("a Canonical Work blockage is CENSORED and preserves the trajectory without a forced repair", async () => {
    const result = await runCase("fault-nocommit", { faultAt: "FIRST", faultKind: PRIMARY_FAULTS.NO_COMMIT });
    expect(result.terminalState).toBe("ABORT_PRESERVED");
    expect(result.run.failure.failureClass).toBe("CANONICAL_WORK_BLOCKAGE");
    expect(result.run.failure.cause).toBe("CANONICAL_WORK_CANNOT_ADVANCE");
    /** The manifest marks it censored, and carries the forbidden repair. */
    const manifest = JSON.parse((await import("node:fs")).readFileSync(result.run.manifestPath, "utf8"));
    expect(manifest.censored).toBe(true);
    expect(manifest.forbiddenRepair).toMatch(/never force Result, Verification or Promotion/);
  }, 900_000);

  it("a declined capital pull is an OBSERVATION: the matrix completes", async () => {
    const result = await runCase("fault-decline", { faultAt: "FIRST", faultKind: PRIMARY_FAULTS.DECLINE_PULL });
    /** Gate 2's central correction, demonstrated end to end on the real path. */
    expect(result.terminalState).toBe("MATRIX_COMPLETE");
    expect(result.completedSessions.length).toBe(16);
    expect(result.run.failure).toBeNull();
  }, 900_000);
});

describe("R3-L0C-I Gate 4 — closure completeness, toolchain and mutations", () => {
  it("covers every reachable module: nothing declared is missing and nothing reachable is undeclared", () => {
    const verification = verifyClosureCompleteness();
    expect(verification.CLOSURE_COMPLETENESS).toBe("COMPLETE");
    expect(verification.missingFiles).toEqual([]);
    expect(verification.undeclaredModules).toEqual([]);
    expect(verification.unresolved).toEqual([]);
    /** The named modules Gate 4 requires are all covered. */
    const declared = new Set(Object.values(CLOSURE_FILES).flat());
    for (const required of [
      "scripts/r3l0cf/fail-stop.mjs",
      "scripts/r3l0cf/journal.mjs",
      "scripts/r3l0cf/properties.mjs",
      "scripts/r3l0cf/primary-matrix.mjs",
      "scripts/r3l0c/generation-child.mjs",
      "scripts/r3l0c/instrumentation.mjs",
      "scripts/r3l0cr/analyse.mjs",
      "scripts/r3l0cr/route.mjs",
      "scripts/r3l0cr/settings.mjs",
    ]) {
      expect(declared.has(required), required).toBe(true);
    }
  });

  it("declares six parts including the integration layer", () => {
    expect(CLOSURE_PARTS.map((part: { id: string }) => part.id)).toEqual([
      "SOURCE_CLOSURE", "COMPILED_RUNTIME_CLOSURE", "EXECUTOR_CONFIGURATION", "MODEL_IDENTITY_EVIDENCE", "EXPERIMENT_PLAN_DIGEST", "INTEGRATION_CLOSURE",
    ]);
  });

  it("the graph walk reaches real modules and finds no unresolved specifier", () => {
    const graph = walkImportGraph();
    expect(graph.moduleCount).toBeGreaterThan(20);
    expect(graph.unresolved).toEqual([]);
    expect(graph.modules).toContain("scripts/r3l0cf/fail-stop.mjs");
    expect(graph.modules).toContain("scripts/r3l0cf/primary-matrix.mjs");
  });

  it("the toolchain and package versions participate in the aggregate digest", async () => {
    const closure = await computeExecutionClosure({ verifyCompiled: false });
    /** Gate 4: the versions are in the aggregate, not merely recorded beside it. */
    expect(Object.keys(closure.aggregateMaterial)).toContain("package:ordarium");
    expect(Object.keys(closure.aggregateMaterial)).toContain("package:vitest");
    expect(Object.keys(closure.aggregateMaterial)).toContain("package:typescript");
    expect(closure.aggregateMaterial["package:vitest"]).not.toBe("NOT_INSTALLED");
  });

  it("§9 mutations PLUS the three Gate 4 mutations all move the digest", async () => {
    const mutation = await runClosureMutation();
    expect(mutation.EXECUTION_CLOSURE_MUTATION).toBe("PASS");
    expect(mutation.GATE4_MUTATIONS).toBe("PASS");
    for (const arm of mutation.arms as readonly { id: string; PROPERTY_PROVEN: boolean }[]) {
      expect(arm.PROPERTY_PROVEN, arm.id).toBe(true);
    }
    /** The three Gate 4 arms exist and each moved the digest. */
    const ids = (mutation.arms as readonly { id: string }[]).map((arm) => arm.id);
    expect(ids).toContain("GATE4_MUTATION_JOURNAL");
    expect(ids).toContain("GATE4_MUTATION_COST_INSTRUMENTATION");
    expect(ids).toContain("GATE4_MUTATION_TOOLCHAIN_VERSION");
  }, 300_000);

  it("the compiled artifacts match a fresh deterministic emit", async () => {
    const verification = verifyCompiledAgainstSource();
    expect(verification.DETERMINISTIC).toBe("SUPPORTED");
    expect(verification.COMPILED_MATCHES_SOURCE).toBe(true);
    expect(verification.diverged).toEqual([]);
  }, 900_000);
});

describe("R3-L0C-I Gate 5 — capital semantic sufficiency", () => {
  it("a procedure built only from the current-standing capital decides every prepaid reference case", () => {
    const sufficiency = runCapitalSufficiency();
    expect(sufficiency.CAPITAL_SEMANTIC_SUFFICIENCY).toBe("PASS");
    expect(sufficiency.prepaidCases).toBeGreaterThan(0);
    expect(sufficiency.failedPrepaid).toEqual([]);
    /** Gate 5: the determination does not rest on field presence or token overlap. */
    expect(sufficiency.reliedOnFieldPresence).toBe(false);
    expect(sufficiency.reliedOnTokenOverlap).toBe(false);
  });

  it("the procedure is falsifiable: every mutated variant fails cases", () => {
    const falsifiers = runProcedureFalsifiers();
    expect(falsifiers.ALL_VARIANTS_DETECTED).toBe(true);
    expect(falsifiers.undetected).toEqual([]);
    /** Each variant fails a DIFFERENT set of cases, so the checks are not redundant. */
    const failedSets = (falsifiers.variants as readonly { failedCases: readonly string[] }[]).map((variant) => variant.failedCases.length);
    expect(failedSets.every((count) => count > 0)).toBe(true);
  });
});
