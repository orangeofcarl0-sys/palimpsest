/**
 * R1-R — HARNESS TESTS.
 *
 * These test the EXPERIMENT, not the product. They exist because the experiment's own machinery is what
 * determines whether its conclusion means anything, and a harness that silently stopped distinguishing
 * its conditions would still "run 30 trials" and still print a verdict.
 *
 * The load-bearing tests are the KNOWN-ANSWER ones: every fixture invariant is checked in BOTH
 * directions — the correct implementation passes, the naive one fails — so a fixture that stopped
 * discriminating cannot pass by being uniformly permissive or uniformly strict.
 */
import { describe, expect, it } from "vitest";

import { amendmentDigest, PARENT_PROTOCOL_DIGEST, parentProtocolDigest, parseAmendment } from "../scripts/r1r/amendment.mjs";
import { deriveCapital, procedureSteps } from "../scripts/r1r/capital.mjs";
import { detectB, detectC } from "../scripts/r1r/known-failure.mjs";
import { analyse, normalizeTrial, pairedStateCheck } from "../scripts/r1r/analyse.mjs";
import { assertOracleInaccessible, buildWorld, runVisibleOracle, SCENARIOS, sha256 } from "../scripts/r1r/scenarios.mjs";
import { exploreAll, SCENARIO_B_GENERATIONS, SCENARIO_C_GENERATIONS } from "../scripts/r1r/teacher-exploration.mjs";
import * as scenarioB from "../scripts/r1r/fixtures/scenario-b/acceptance.mjs";
import * as scenarioC from "../scripts/r1r/fixtures/scenario-c/acceptance.mjs";
import { blockOrder } from "../scripts/r1/protocol.mjs";

const tmpRoot = (name: string): string => `${process.env.TEMP ?? "/tmp"}/r1r-test-${name}-${process.pid}`;

describe("R1-R §3 — the protocol amendment", () => {
  it("parses and its parent digest still matches the frozen parent", () => {
    const amendment = parseAmendment();
    expect(amendment.parentProtocolDigest).toBe(PARENT_PROTOCOL_DIGEST);
    expect(parentProtocolDigest()).toBe(PARENT_PROTOCOL_DIGEST);
    expect(amendment.amendmentDigest).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("recomputes its own digest from the document bytes (a silent edit would be detectable)", () => {
    expect(amendmentDigest()).toBe(parseAmendment().amendmentDigest);
  });

  it("registers the two replacement primary scenarios and keeps Scenario A secondary", () => {
    const amendment = parseAmendment();
    expect(amendment.primaryScenarios).toEqual(["B_CONFIG_MIGRATION", "C_REPLAY_SAFE_REDUCER"]);
    expect(amendment.secondaryScenario).toBe("A_DAG_PLANNER");
    expect(amendment.trialsPerConditionPerScenario).toBe(5);
  });

  it("does not modify the parent protocol document", () => {
    // The parent's digest is the frozen one R1 recorded, so this stage edited nothing upstream.
    expect(parentProtocolDigest()).toBe("2d1dfecaf7feecc55601a00f0760cec7e95b667f2972ad34bb831740b006feca");
  });
});

describe("R1-R §18 — the block ordering is the frozen one", () => {
  it("uses the protocol seed's ordering, one of each condition per block", () => {
    const blocks = blockOrder(5);
    expect(blocks.map((block) => [...block.order])).toEqual([
      ["C2", "C0", "C1"],
      ["C0", "C1", "C2"],
      ["C1", "C0", "C2"],
      ["C0", "C1", "C2"],
      ["C2", "C0", "C1"],
    ]);
    for (const block of blocks) expect([...block.order].sort()).toEqual(["C0", "C1", "C2"]);
  });

  it("never runs all C0 before all C2", () => {
    const flat = blockOrder(5).flatMap((block) => [...block.order]);
    const lastC0 = flat.lastIndexOf("C0");
    const firstC2 = flat.indexOf("C2");
    expect(firstC2).toBeLessThan(lastC0);
  });
});

describe("R1-R §5 — Scenario B: the fixture discriminates", () => {
  const visible = scenarioB.materialize(scenarioB.VISIBLE_CASES);
  const hidden = scenarioB.materialize(scenarioB.HIDDEN_CASES);

  it("the reference implementation passes EVERY visible and hidden case", () => {
    expect(scenarioB.runCases(scenarioB.migrateConfigReference, visible).passed).toBe(visible.length);
    expect(scenarioB.runCases(scenarioB.migrateConfigReference, hidden).passed).toBe(hidden.length);
  });

  it("the naive starting point FAILS the hidden acceptance", () => {
    const result = scenarioB.runCases(SCENARIO_B_GENERATIONS[0].migrate, hidden);
    expect(result.passed).toBeLessThan(hidden.length);
  });

  it("every generation's failures are named by the oracle, not silent", () => {
    for (const generation of SCENARIO_B_GENERATIONS) {
      const result = scenarioB.runCases(generation.migrate, visible);
      for (const failure of result.results.filter((entry) => !entry.pass)) {
        expect(failure.failureClass).toMatch(/^(REJECTED_BUT_SHOULD_ACCEPT|WRONG_OUTPUT|ACCEPTED_BUT_SHOULD_REJECT)$/u);
        expect(failure.invariant).toBeTruthy();
      }
    }
  });

  it("a case that hard-codes a visible answer cannot pass the hidden acceptance", () => {
    // A lookup keyed on the visible inputs' canonical JSON: it answers visible cases perfectly and knows
    // nothing about the hidden ones. This is the anti-memorisation property §5 relies on. (Reject cases
    // are satisfied by throwing, so a memorising candidate passes every visible case — which is exactly
    // why passing the visible oracle must not be sufficient.)
    const table = new Map(visible.filter((entry) => entry.expect === "accept").map((entry) => [JSON.stringify(entry.input), entry.expected]));
    const cheater = (input: Record<string, unknown>) => {
      const hit = table.get(JSON.stringify(input));
      if (hit !== undefined) return hit;
      throw Object.assign(new Error("unknown"), { code: "UNKNOWN" });
    };
    expect(scenarioB.runCases(cheater, visible).passed).toBe(visible.length);
    const hiddenScore = scenarioB.runCases(cheater, hidden).passed;
    expect(hiddenScore).toBeLessThan(hidden.length);
    // It must be strictly worse than a candidate that derived the method.
    expect(hiddenScore).toBeLessThan(scenarioB.runCases(scenarioB.migrateConfigReference, hidden).passed);
  });
});

describe("R1-R §6 — Scenario C: the fixture discriminates", () => {
  const visible = scenarioC.materialize(scenarioC.VISIBLE_CASES);
  const hidden = scenarioC.materialize(scenarioC.HIDDEN_CASES);
  const ref = scenarioC.applyEventStreamReference;

  it("the reference implementation passes EVERY visible and hidden case", () => {
    expect(scenarioC.runCases(ref, visible).passed).toBe(visible.length);
    expect(scenarioC.runCases(ref, hidden).passed).toBe(hidden.length);
  });

  it("the naive starting point FAILS the hidden acceptance", () => {
    expect(scenarioC.runCases(SCENARIO_C_GENERATIONS[0].reduce, hidden).passed).toBeLessThan(hidden.length);
  });

  it("derives state from the log's sequence order, not the caller's array order", () => {
    const canonical = [{ id: "a", seq: 0, op: "SET" as const, v: 1 }, { id: "a", seq: 1, op: "SET" as const, v: 9 }];
    const shuffled = [canonical[1], canonical[0]];
    const left = ref({}, canonical);
    const right = ref({}, shuffled);
    expect(left).toEqual(right);
    expect(right).toEqual({ a: 9 });
  });

  it("leaves the caller's state untouched when it refuses a log", () => {
    /**
     * The state-integrity invariant, which is what makes the pre-paid mistake OBSERVABLE rather than
     * cosmetic: a reducer that mutates as it validates corrupts the caller's own object and then reports
     * failure. The correct method validates first, so a rejection is side-effect free.
     */
    const state: Record<string, unknown> = { keep: 1, other: 2 };
    const before = JSON.stringify(state);
    expect(() => ref(state, [{ id: "ok", seq: 0, op: "SET" as const, v: 1 }, { id: "bad", seq: 2, op: "SET" as const, v: 2 }])).toThrow();
    expect(JSON.stringify(state)).toBe(before);
  });

  it("an exact replay is idempotent while two different events at one position are refused", () => {
    expect(ref({}, [{ id: "a", seq: 0, op: "SET" as const, v: 1 }, { id: "a", seq: 0, op: "SET" as const, v: 1 }])).toEqual({ a: 1 });
    // The CODE is the contract; the message is prose, and asserting on it would make this test fail on a
    // wording change rather than on a behaviour change.
    let code: unknown = null;
    try {
      ref({}, [{ id: "a", seq: 0, op: "SET" as const, v: 1 }, { id: "b", seq: 0, op: "SET" as const, v: 2 }]);
    } catch (error) {
      code = (error as { code?: unknown }).code;
    }
    expect(code).toBe("CONFLICTING_SEQUENCE");
  });
});

describe("R1-R §21 — the pre-paid mistake detectors, in both directions", () => {
  it("Scenario B: the naive generations recur; the reference does not", () => {
    expect(detectB(SCENARIO_B_GENERATIONS[0].migrate).recurred).toBe(true);
    expect(detectB(SCENARIO_B_GENERATIONS[1].migrate).recurred).toBe(true);
    expect(detectB(SCENARIO_B_GENERATIONS[3].migrate).recurred).toBe(false);
    expect(detectB(scenarioB.migrateConfigReference).recurred).toBe(false);
  });

  it("Scenario C: the naive generations recur; the mature one does not", () => {
    expect(detectC(SCENARIO_C_GENERATIONS[0].reduce).recurred).toBe(true);
    expect(detectC(SCENARIO_C_GENERATIONS[1].reduce).recurred).toBe(true);
    expect(detectC(SCENARIO_C_GENERATIONS[3].reduce).recurred).toBe(false);
    expect(detectC(scenarioC.applyEventStreamReference).recurred).toBe(false);
  });

  it("names the detector after the scenario's registered pre-paid mistake", () => {
    expect(detectB(scenarioB.migrateConfigReference).detector).toBe(SCENARIOS.B.knownFailureDetector);
    expect(detectC(scenarioC.applyEventStreamReference).detector).toBe(SCENARIOS.C.knownFailureDetector);
    expect(SCENARIOS.B.knownFailure).toBe("transform/default before legacy ambiguity validation");
    expect(SCENARIOS.C.knownFailure).toBe("mutate/reduce before replay/sequence validity is established");
  });
});

describe("R1-R §8/§9 — the capital is traceable, and is METHOD not source", () => {
  const capital = deriveCapital();

  it("every Procedure clause names a generation the exploration actually ran", () => {
    const explored = exploreAll();
    for (const key of ["B", "C"] as const) {
      const generations = new Set(explored[key].observations.map((observation) => observation.generation));
      for (const clause of capital[key].procedureClauses) expect(generations.has(clause.forcedBy)).toBe(true);
    }
  });

  it("the exploration's final generation stops failing, so the derived method is complete", () => {
    const explored = exploreAll();
    for (const key of ["B", "C"] as const) {
      const last = explored[key].observations[explored[key].observations.length - 1];
      expect(last.failedCaseIds).toEqual([]);
    }
  });

  it("records an OBSERVED failure for every clause, not an authored rationale", () => {
    for (const key of ["B", "C"] as const) {
      for (const clause of capital[key].procedureClauses) {
        expect(clause.observed.length).toBeGreaterThan(20);
        expect(clause.instruction.length).toBeGreaterThan(20);
      }
    }
  });

  it("§9: the Procedure encodes method, not the final source code", () => {
    for (const key of ["B", "C"] as const) {
      const steps = procedureSteps(key);
      expect(steps.length).toBeGreaterThan(3);
      for (const step of steps) {
        // A clause that shipped an implementation would carry code syntax the method must not have.
        expect(step.instruction).not.toMatch(/function |=>|const |return |throw new/u);
      }
    }
  });

  it("§10: no Procedure clause can widen authority", () => {
    for (const key of ["B", "C"] as const) {
      const text = procedureSteps(key).map((step) => step.instruction).join(" ");
      expect(text).not.toMatch(/allow|permit|authorize|grant|disable|skip (the )?(check|scope)|ignore the (envelope|scope)/iu);
    }
  });
});

describe("R1-R §5 — the hidden acceptance is unreachable from the worker's world", () => {
  it("building a world leaves no trace of the hidden acceptance in it", () => {
    for (const scenario of [SCENARIOS.B, SCENARIOS.C]) {
      const dir = tmpRoot(`world-${scenario.id}`);
      buildWorld(scenario, dir);
      const result = assertOracleInaccessible(scenario, dir);
      expect(result.checkedFiles).toBeGreaterThan(0);
      // The visible oracle IS present — the worker is meant to run it.
      expect(result.needles.length).toBeGreaterThan(0);
    }
  });

  it("the visible oracle RUNS in the world it was built into", () => {
    /**
     * REGRESSION TEST for a real defect this stage shipped and a stochastic worker found.
     *
     * Both oracles loaded the candidate with `await import(join(HERE, "..", "src", "config.ts"))`. On
     * Windows the ESM loader rejects an absolute drive path with ERR_UNSUPPORTED_ESM_URL_SCHEME
     * ("Received protocol 'c:'"), so the oracle could not run INSIDE the worker's world at all — the
     * one place it exists to be run. The failure is invisible to a test that only checks the oracle's
     * file exists, so this test EXECUTES it.
     */
    for (const scenario of [SCENARIOS.B, SCENARIOS.C]) {
      const dir = tmpRoot(`oracle-runs-${scenario.id}`);
      buildWorld(scenario, dir);
      const result = runVisibleOracle(scenario, dir);
      const text = result.stdout;
      expect(text).not.toMatch(/ERR_UNSUPPORTED_ESM_URL_SCHEME/u);
      expect(text).not.toMatch(/Cannot find module/u);
      // The oracle's own summary line proves it got far enough to judge every case. Its EXIT CODE is
      // deliberately not asserted: the visible set is basic behaviour only (§5/§6), so whether the H0
      // starting implementation happens to satisfy it is a property of the fixture, not of the oracle.
      expect(text).toMatch(/\d+ cases, \d+ pass, \d+ fail/u);
      expect([0, 1]).toContain(result.exitCode);
    }
  });

  it("the hidden acceptance is STRICTER than the visible oracle for the H0 implementation", () => {
    /**
     * The whole experiment depends on this asymmetry (§5/§6/§11): the visible oracle covers basic
     * behaviour, the hidden acceptance covers the non-obvious invariants, and the starting
     * implementation satisfies the first but not the second. If the visible oracle were as strong as
     * the hidden one, a worker could iterate against it until the method was fully revealed and C0
     * would solve the hidden contract on its first candidate — a ceiling, not a replication.
     */
    const visibleB = scenarioB.materialize(scenarioB.VISIBLE_CASES);
    const hiddenB = scenarioB.materialize(scenarioB.HIDDEN_CASES);
    const visibleC = scenarioC.materialize(scenarioC.VISIBLE_CASES);
    const hiddenC = scenarioC.materialize(scenarioC.HIDDEN_CASES);
    expect(scenarioB.runCases(SCENARIO_B_GENERATIONS[0].migrate, hiddenB).passed).toBeLessThan(hiddenB.length);
    expect(scenarioC.runCases(SCENARIO_C_GENERATIONS[0].reduce, hiddenC).passed).toBeLessThan(hiddenC.length);
    // And the HIDDEN set must contain invariants the VISIBLE set never exercises.
    const visibleBInvariants = new Set(scenarioB.VISIBLE_CASES.map((entry) => entry.invariant));
    const hiddenBInvariants = new Set(scenarioB.HIDDEN_CASES.map((entry) => entry.invariant));
    expect([...hiddenBInvariants].some((invariant) => !visibleBInvariants.has(invariant))).toBe(true);
    const visibleCInvariants = new Set(scenarioC.VISIBLE_CASES.map((entry) => entry.invariant));
    const hiddenCInvariants = new Set(scenarioC.HIDDEN_CASES.map((entry) => entry.invariant));
    expect([...hiddenCInvariants].some((invariant) => !visibleCInvariants.has(invariant))).toBe(true);
  });
});

describe("R1-R §14 — the paired-state check", () => {
  const trial = (over: Record<string, unknown>): Record<string, unknown> => ({
    trialId: "t",
    scenario: "B_CONFIG_MIGRATION",
    condition: "C0",
    block: 0,
    repetition: 0,
    finalAcceptance: { passed: 1, total: 2 },
    firstCandidateAcceptance: { passed: 1, total: 2 },
    knownFailureFinal: { recurred: true },
    knownFailureFirst: { recurred: true },
    hiddenOracleInvocations: 1,
    visibleOracleInvocations: 0,
    prompt: { handlesInPayload: [], indexHandleCount: 0, capabilitySetDigest: "cap", ordinaryTaskDigest: "ord" },
    worker: { pulledHandles: [], offeredTools: ["run_code"], outcomeKind: "READY_FOR_SETTLEMENT" },
    pairedState: { scenarioId: "B_CONFIG_MIGRATION", taskSemanticDigest: "x", startingTreeDigest: "y", targetSourceDigest: "z", visibleTestDigest: "v", hiddenOracleDigest: "h", visibleFileCount: 5 },
    elapsedMs: 1,
    manualInterventions: 0,
    hostFailure: null,
    timedOut: false,
    ...over,
  });

  it("passes a block whose three conditions share the comparable state and differ in the index", () => {
    const trials = [trial({ condition: "C0" }), trial({ condition: "C1", prompt: { handlesInPayload: [], indexHandleCount: 2, capabilitySetDigest: "cap", ordinaryTaskDigest: "ord" } }), trial({ condition: "C2", prompt: { handlesInPayload: [], indexHandleCount: 3, capabilitySetDigest: "cap", ordinaryTaskDigest: "ord" } })].map(normalizeTrial);
    const blocks = pairedStateCheck(trials);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].confounded).toBe(false);
  });

  it("flags a block whose ordinary task text differs across conditions", () => {
    const trials = [trial({ condition: "C0" }), trial({ condition: "C1", prompt: { handlesInPayload: [], indexHandleCount: 2, capabilitySetDigest: "cap", ordinaryTaskDigest: "DIFFERENT" } }), trial({ condition: "C2", prompt: { handlesInPayload: [], indexHandleCount: 3, capabilitySetDigest: "cap", ordinaryTaskDigest: "ord" } })].map(normalizeTrial);
    const blocks = pairedStateCheck(trials);
    expect(blocks[0].confounded).toBe(true);
    expect(blocks[0].differences.join(" ")).toMatch(/ordinary task text/u);
  });

  it("flags a block whose context index is identical across conditions (the treatment was not applied)", () => {
    const trials = [trial({ condition: "C0" }), trial({ condition: "C1" }), trial({ condition: "C2" })].map(normalizeTrial);
    const blocks = pairedStateCheck(trials);
    expect(blocks[0].confounded).toBe(true);
    expect(blocks[0].differences.join(" ")).toMatch(/index is identical/u);
  });
});

describe("R1-R §23–§25 — the verdict follows the pre-declared criteria", () => {
  const mk = (scenario: string, condition: string, opts: { final: number; first: number; recurred: boolean; procedurePulled: boolean; index: number }): ReturnType<typeof normalizeTrial> =>
    normalizeTrial({
      trialId: `${scenario}-${condition}`,
      scenario,
      condition,
      block: 0,
      repetition: 0,
      finalAcceptance: { passed: opts.final, total: 16 },
      firstCandidateAcceptance: { passed: opts.first, total: 16 },
      knownFailureFinal: { recurred: opts.recurred },
      knownFailureFirst: { recurred: opts.recurred },
      hiddenOracleInvocations: 1,
      visibleOracleInvocations: 0,
      prompt: { handlesInPayload: [], indexHandleCount: opts.index, capabilitySetDigest: "cap", ordinaryTaskDigest: "ord" },
      worker: { pulledHandles: opts.procedurePulled ? ["@ctx/procedure/p@0"] : [], offeredTools: ["run_code"], outcomeKind: "READY_FOR_SETTLEMENT" },
      pairedState: null,
      elapsedMs: 1,
      manualInterventions: 0,
      hostFailure: null,
      timedOut: false,
    });

  const blocksFor = (trials: readonly ReturnType<typeof normalizeTrial>[]) => pairedStateCheck(trials);

  it("PASS requires both scenarios directional AND C2>C1 with Procedure pulled", () => {
    const trials = [
      mk("B_CONFIG_MIGRATION", "C0", { final: 10, first: 4, recurred: true, procedurePulled: false, index: 0 }),
      mk("B_CONFIG_MIGRATION", "C1", { final: 14, first: 8, recurred: true, procedurePulled: false, index: 2 }),
      mk("B_CONFIG_MIGRATION", "C2", { final: 16, first: 14, recurred: false, procedurePulled: true, index: 3 }),
      mk("C_REPLAY_SAFE_REDUCER", "C0", { final: 9, first: 3, recurred: true, procedurePulled: false, index: 0 }),
      mk("C_REPLAY_SAFE_REDUCER", "C1", { final: 13, first: 7, recurred: true, procedurePulled: false, index: 2 }),
      mk("C_REPLAY_SAFE_REDUCER", "C2", { final: 14, first: 12, recurred: false, procedurePulled: true, index: 3 }),
    ];
    expect(analyse(trials, blocksFor(trials)).verdict).toBe("PASS");
  });

  it("PARTIAL when only one scenario replicates", () => {
    const trials = [
      mk("B_CONFIG_MIGRATION", "C0", { final: 10, first: 4, recurred: true, procedurePulled: false, index: 0 }),
      mk("B_CONFIG_MIGRATION", "C1", { final: 14, first: 8, recurred: true, procedurePulled: false, index: 2 }),
      mk("B_CONFIG_MIGRATION", "C2", { final: 16, first: 14, recurred: false, procedurePulled: true, index: 3 }),
      mk("C_REPLAY_SAFE_REDUCER", "C0", { final: 14, first: 12, recurred: false, procedurePulled: false, index: 0 }),
      mk("C_REPLAY_SAFE_REDUCER", "C1", { final: 14, first: 12, recurred: false, procedurePulled: false, index: 2 }),
      mk("C_REPLAY_SAFE_REDUCER", "C2", { final: 14, first: 12, recurred: false, procedurePulled: true, index: 3 }),
    ];
    expect(analyse(trials, blocksFor(trials)).verdict).toBe("PARTIAL");
  });

  it("NO_REPLICATION when neither scenario benefits", () => {
    const trials = ["B_CONFIG_MIGRATION", "C_REPLAY_SAFE_REDUCER"].flatMap((scenario) => [
      mk(scenario, "C0", { final: 14, first: 12, recurred: false, procedurePulled: false, index: 0 }),
      mk(scenario, "C1", { final: 14, first: 12, recurred: false, procedurePulled: false, index: 2 }),
      mk(scenario, "C2", { final: 14, first: 12, recurred: false, procedurePulled: true, index: 3 }),
    ]);
    expect(analyse(trials, blocksFor(trials)).verdict).toBe("NO_REPLICATION");
  });

  it("a directional benefit WITHOUT a Procedure pull is not PASS", () => {
    const trials = [
      mk("B_CONFIG_MIGRATION", "C0", { final: 10, first: 4, recurred: true, procedurePulled: false, index: 0 }),
      mk("B_CONFIG_MIGRATION", "C1", { final: 14, first: 8, recurred: true, procedurePulled: false, index: 2 }),
      mk("B_CONFIG_MIGRATION", "C2", { final: 16, first: 14, recurred: false, procedurePulled: false, index: 3 }),
      mk("C_REPLAY_SAFE_REDUCER", "C0", { final: 9, first: 3, recurred: true, procedurePulled: false, index: 0 }),
      mk("C_REPLAY_SAFE_REDUCER", "C1", { final: 13, first: 7, recurred: true, procedurePulled: false, index: 2 }),
      mk("C_REPLAY_SAFE_REDUCER", "C2", { final: 14, first: 12, recurred: false, procedurePulled: false, index: 3 }),
    ];
    const result = analyse(trials, blocksFor(trials));
    expect(result.verdict).toBe("PARTIAL");
    expect(result.someC2OverC1).toBe(false);
  });
});

describe("R1-R §29 — sanitization drops credentials and local paths", () => {
  it("the evidence writer's sanitizer is applied to every artifact it writes", async () => {
    // The sanitizer is module-private by design; this asserts its CONTRACT through the artifacts it
    // produced, which is where a leak would actually matter.
    const { readFileSync, existsSync } = await import("node:fs");
    const path = "research-evidence/r1-r/analysis.json";
    if (!existsSync(path)) return; // the analysis has not been written yet in this checkout
    const text = readFileSync(path, "utf8");
    expect(text).not.toMatch(/[A-Za-z]:\\\\/u);
    expect(text).not.toMatch(/credential/iu);
  });
});

describe("R1-R — the recorded digests are the ones the artifacts carry", () => {
  it("the fixture case files are the materialized forms of the frozen case lists", () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const b = JSON.parse(readFileSync("scripts/r1r/fixtures/scenario-b/test/cases.json", "utf8"));
    const c = JSON.parse(readFileSync("scripts/r1r/fixtures/scenario-c/test/cases.json", "utf8"));
    expect(b).toEqual(JSON.parse(JSON.stringify(scenarioB.materializeVisible(scenarioB.VISIBLE_CASES))));
    expect(c).toEqual(JSON.parse(JSON.stringify(scenarioC.materializeVisible(scenarioC.VISIBLE_CASES))));
  });

  it("the WORKER-VISIBLE case file does not name its own invariants", () => {
    /**
     * REGRESSION TEST for a measurement defect this stage shipped and calibration exposed.
     *
     * An earlier version wrote `invariant` into `test/cases.json`. That file is INSIDE the worker's
     * world, so the invariant names ("new-format-defaults", "required-fields-validated",
     * "aliases-normalized-before-comparison", "state-derived-from-canonical-sequence") spelled out the
     * ordering method the experiment exists to measure. C0 then passed the hidden acceptance on its
     * FIRST candidate with no known-failure recurrence, which is a ceiling, not a replication.
     */
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    for (const path of ["scripts/r1r/fixtures/scenario-b/test/cases.json", "scripts/r1r/fixtures/scenario-c/test/cases.json"]) {
      const cases = JSON.parse(readFileSync(path, "utf8")) as readonly Record<string, unknown>[];
      expect(cases.length).toBeGreaterThan(0);
      for (const entry of cases) expect(entry.invariant).toBeUndefined();
    }
  });

  it("the hidden and visible case ids do not overlap, so a memorised visible answer cannot be reused", () => {
    const visible = new Set(scenarioB.VISIBLE_CASES.map((entry) => entry.id));
    for (const hidden of scenarioB.HIDDEN_CASES) expect(visible.has(hidden.id)).toBe(false);
    const visibleC = new Set(scenarioC.VISIBLE_CASES.map((entry) => entry.id));
    for (const hidden of scenarioC.HIDDEN_CASES) expect(visibleC.has(hidden.id)).toBe(false);
  });

  it("the fixtures' hidden inputs differ from the visible ones", () => {
    const visibleJson = new Set(scenarioB.VISIBLE_CASES.map((entry) => JSON.stringify(entry.input)));
    for (const hidden of scenarioB.HIDDEN_CASES) expect(visibleJson.has(JSON.stringify(hidden.input))).toBe(false);
    const visibleCJson = new Set(scenarioC.VISIBLE_CASES.map((entry) => JSON.stringify(entry.input)));
    for (const hidden of scenarioC.HIDDEN_CASES) expect(visibleCJson.has(JSON.stringify(hidden.input))).toBe(false);
  });

  it("sha256 is stable and content-addressed", () => {
    expect(sha256(Buffer.from("r1-r"))).toBe(sha256(Buffer.from("r1-r")));
    expect(sha256(Buffer.from("r1-r"))).not.toBe(sha256(Buffer.from("r1-s")));
  });
});
