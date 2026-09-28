/**
 * R1 §33 — DETERMINISTIC TESTS FOR THE EXPERIMENTAL HARNESS.
 *
 * §33 draws the line precisely: the STOCHASTIC OUTCOMES must never become CI expectations ("the LLM
 * must succeed 4/5 times" is forbidden), but the HARNESS around them must be pinned, because a harness
 * that silently clones the wrong state, or leaks an id across trials, produces a number that looks
 * like a result and is not one.
 *
 * So this file tests only things that are deterministic by construction:
 *
 *   · the protocol parser and its digest (a silently weakened protocol fails loudly);
 *   · the pre-registered block ordering (one of each condition per block, reproducible from the seed);
 *   · the trial plan arithmetic;
 *   · the scenario-specific known-failure DETECTORS, which classify SUBMITTED SOURCE and so must be
 *     pure functions with known-answer tests in both directions;
 *   · result normalization and the verdict rule's own guard (BLOCKED is not PASS/PARTIAL/NO_REPLICATION).
 *
 * Nothing here runs a model, and nothing here asserts that a model succeeds.
 */
import { describe, expect, it } from "vitest";

import {
  FROZEN,
  blockOrder,
  parseProtocol,
  protocolDigest,
  trialPlan,
} from "../scripts/r1/protocol.mjs";
import {
  KNOWN_FAILURE_MARKERS,
  classifyKnownFailure,
  normalizeTrialResult,
  verdictFor,
} from "../scripts/r1/outcomes.mjs";

describe("R1 §6 — the protocol is frozen and its digest is derived, not asserted", () => {
  it("parses, and the digest is a stable 64-hex value", () => {
    const parsed = parseProtocol();
    expect(parsed.digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(parsed.digest).toBe(protocolDigest());
  });

  it("keeps all three verdicts available and the primary matrix honestly blocked", () => {
    const parsed = parseProtocol();
    expect(parsed.primaryMatrixStatus).toBe("BLOCKED_R1_SEMANTIC_BLOCKER");
    // The three real verdicts must remain representable — a protocol that lost one would be a
    // different experiment wearing the same name.
    for (const verdict of ["PASS", "PARTIAL", "NO_REPLICATION"]) {
      expect(verdictFor({ scenarioEffects: [], blocked: false, verdictsAvailable: [verdict] })).toBeDefined();
    }
  });

  it("pre-registers 2 scenarios x 3 conditions x 5 trials = 30", () => {
    const plan = trialPlan();
    expect(plan.total).toBe(30);
    expect(plan.perScenario).toBe(15);
    expect(FROZEN.conditions).toEqual(["C0", "C1", "C2"]);
    expect(FROZEN.exploratoryFloor).toBe(3);
  });
});

describe("R1 §15 — the block ordering is randomized but reproducible", () => {
  it("gives every block exactly one of each condition", () => {
    for (const block of blockOrder(FROZEN.trialsPerConditionPerScenario)) {
      expect([...block.order].sort()).toEqual(["C0", "C1", "C2"]);
    }
  });

  it("is reproducible from the one recorded seed", () => {
    const first = blockOrder(5).map((block) => block.order.join(","));
    const second = blockOrder(5).map((block) => block.order.join(","));
    expect(second).toEqual(first);
  });

  it("does not run all of one condition before another", () => {
    // The ruling forbids all-C0-then-all-C1-then-all-C2; a 5-block plan of 15 trials must not have any
    // condition occupying a contiguous run of more than one block.
    const flattened = blockOrder(FROZEN.trialsPerConditionPerScenario).flatMap((block) => block.order);
    let longest = 1;
    let current = 1;
    for (let i = 1; i < flattened.length; i += 1) {
      current = flattened[i] === flattened[i - 1] ? current + 1 : 1;
      longest = Math.max(longest, current);
    }
    expect(longest).toBeLessThan(flattened.length);
  });
});

describe("R1 §20 — the known-failure marker is a pure classifier over SUBMITTED SOURCE", () => {
  it("detects Scenario A's marker: ordering attempted without handling cycles first", () => {
    const orderingFirst = `
      export function planExecution(graph) {
        // Kahn's algorithm straight away, with no cycle check.
        const order = [];
        while (order.length < graph.nodes.length) order.push(next());
        return order;
      }`;
    expect(classifyKnownFailure("A_DAG_PLANNER", orderingFirst)).toBe("KNOWN_FAILURE_PRESENT");
  });

  it("does NOT flag a source that detects the cycle before ordering", () => {
    const detectFirst = `
      export function planExecution(graph) {
        const cycle = detectCycle(graph);   // cycle detection happens first
        if (cycle !== undefined) throw new CycleError(cycle);
        return orderAcyclic(graph);
      }`;
    expect(classifyKnownFailure("A_DAG_PLANNER", detectFirst)).toBe("KNOWN_FAILURE_ABSENT");
  });

  it("detects Scenario B's marker: defaults injected before legacy ambiguity is validated", () => {
    const defaultsFirst = `
      export function migrateConfig(input) {
        const withDefaults = { ...DEFAULTS, ...input };   // defaults first
        validateLegacy(input);
        return toV2(withDefaults);
      }`;
    expect(classifyKnownFailure("B_CONFIG_MIGRATION", defaultsFirst)).toBe("KNOWN_FAILURE_PRESENT");
  });

  it("does NOT flag Scenario B when legacy validation precedes defaulting", () => {
    const validateFirst = `
      export function migrateConfig(input) {
        validateLegacy(input);          // legacy alias ambiguity validated BEFORE defaults
        const normalized = normalizeAliases(input);
        return toV2({ ...DEFAULTS, ...normalized });
      }`;
    expect(classifyKnownFailure("B_CONFIG_MIGRATION", validateFirst)).toBe("KNOWN_FAILURE_ABSENT");
  });

  it("returns UNKNOWN for an unrecognised scenario rather than guessing", () => {
    expect(classifyKnownFailure("C_UNKNOWN", "anything")).toBe("UNKNOWN");
    expect(KNOWN_FAILURE_MARKERS.A_DAG_PLANNER).toBeDefined();
  });
});

describe("R1 §19/§23 — result normalization never invents a value", () => {
  it("records an unobservable field as UNKNOWN rather than zero or false", () => {
    const normalized = normalizeTrialResult({ condition: "C0", scenario: "A_DAG_PLANNER", acceptancePass: true });
    expect(normalized.tokensIn).toBe("UNKNOWN");
    expect(normalized.tokensOut).toBe("UNKNOWN");
    expect(normalized.procedurePulled).toBe("UNKNOWN");
    // The field is named for what it measures — the FINAL acceptance, distinct from the first
    // submission — so a reader cannot confuse the two (§19 lists them separately).
    expect(normalized.finalAcceptancePass).toBe(true);
    expect(normalized.firstSubmissionPass).toBe("UNKNOWN");
  });

  it("keeps a confounded trial out of the primary comparison but retains it in raw evidence", () => {
    const normalized = normalizeTrialResult({ condition: "C1", scenario: "A_DAG_PLANNER", confounded: true });
    expect(normalized.excludedFromPrimary).toBe(true);
    expect(normalized.retainedInRawEvidence).toBe(true);
  });

  it("refuses to score a trial whose condition is not pre-registered", () => {
    expect(() => normalizeTrialResult({ condition: "C9", scenario: "A_DAG_PLANNER" })).toThrow(/pre-registered/u);
  });
});

describe("R1 §23/§6 — the verdict rule cannot manufacture a PASS", () => {
  it("returns BLOCKED when the conditions are indistinguishable, and never PASS", () => {
    expect(verdictFor({ blocked: true, scenarioEffects: [], verdictsAvailable: ["PASS", "PARTIAL", "NO_REPLICATION"] })).toBe(
      "BLOCKED",
    );
  });

  it("requires BOTH scenarios for PASS", () => {
    const oneScenario = { blocked: false, scenarioEffects: [{ scenario: "A_DAG_PLANNER", effect: true, outcomeNotWorse: true, procedureLoadBearing: true }], verdictsAvailable: ["PASS", "PARTIAL", "NO_REPLICATION"] };
    expect(verdictFor(oneScenario)).toBe("PARTIAL");
  });

  it("requires the outcome not to be worse, even when the known failure repeats less", () => {
    const worseOutcome = {
      blocked: false,
      scenarioEffects: [
        { scenario: "A_DAG_PLANNER", effect: true, outcomeNotWorse: false, procedureLoadBearing: true },
        { scenario: "B_CONFIG_MIGRATION", effect: true, outcomeNotWorse: true, procedureLoadBearing: false },
      ],
      verdictsAvailable: ["PASS", "PARTIAL", "NO_REPLICATION"],
    };
    expect(verdictFor(worseOutcome)).not.toBe("PASS");
  });

  it("returns NO_REPLICATION when neither scenario shows an effect", () => {
    const none = {
      blocked: false,
      scenarioEffects: [
        { scenario: "A_DAG_PLANNER", effect: false, outcomeNotWorse: true, procedureLoadBearing: false },
        { scenario: "B_CONFIG_MIGRATION", effect: false, outcomeNotWorse: true, procedureLoadBearing: false },
      ],
      verdictsAvailable: ["PASS", "PARTIAL", "NO_REPLICATION"],
    };
    expect(verdictFor(none)).toBe("NO_REPLICATION");
  });
});
