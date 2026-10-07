/**
 * R3-L0C-R — THE CORRECTED CONTRACT, HARDENING AND GATE TESTS.
 *
 * These pin the corrections this stage exists to make: the split validity dimensions, the five telemetry fields,
 * the fail-closed selection builder, the permanent mutations, the expectation manifest, the topology derivation,
 * the closure digest, and the Run-1 baseline calibration with its pressure gate.
 *
 * §5's mutation test is the load-bearing one: it reproduces the exact escaped defect and requires
 * `INVALID_SELECTION_SHAPE` with ZERO real-model launches, so a future regression fails here rather than in a
 * primary run.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CLAIM_ADMISSION,
  EXECUTION_CLOSURE_INPUTS,
  SELECTION_CONTRACT_FINDING,
  STAGE_EVIDENCE_PATH,
  TELEMETRY_FIELDS,
  TELEMETRY_READING_RULE,
  VALIDITY_DIMENSIONS,
  buildExpectationManifest,
  causalExperimentValidFrom,
  closureDigest,
  expectationDigest,
  treatmentTelemetry,
  verifyClosure,
  verifyRealization,
} from "../scripts/r3l0cr/contract.mjs";
import { KIND_FIELDS, SELECTION_REFUSALS, SUPPORTED_KINDS, attemptSelection, buildSelection, selectionIsEmpty, selectionItemCount, validateSelection } from "../scripts/r3l0cr/selection.mjs";
import { MUTATION_IDS, computeExecutionClosure, runSelectionMutations } from "../scripts/r3l0cr/mutations.mjs";
import { HOST_PRIVATE_KINDS, buildTopologyManifest, canaryPlan, topologyDigest } from "../scripts/r3l0cr/topology.mjs";
import { PRESSURE_GATE, calibrateRun, evaluatePressureGate, median, proveEmptyCapitalSurface } from "../scripts/r3l0cr/baseline.mjs";
import { FROZEN_VERDICT_SURFACE } from "../scripts/r3l0cr/analyse.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const EVIDENCE = join(REPO_ROOT, STAGE_EVIDENCE_PATH);
const R3L0C_EVIDENCE = join(REPO_ROOT, "research-evidence", "r3-l0c");
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const plan = existsSync(join(EVIDENCE, "plan.json")) ? read(join(EVIDENCE, "plan.json")) : null;

/** Owner refs, shaped as the admission produces them. */
const REFS = [
  { invariant: "I1", kind: "REASONING_CLAIM", handle: "@ctx/reasoning/cell-i1/cl-i1", ref: { cellId: "cell-i1", claimId: "cl-i1" } },
  { invariant: "I1", kind: "PROCEDURE", handle: "@ctx/procedure/prc-i1/0", ref: { procedureId: "prc-i1", revision: 0, reason: "the method for I1" } },
  { invariant: "I2", kind: "REASONING_CLAIM", handle: "@ctx/reasoning/cell-i2/cl-i2", ref: { cellId: "cell-i2", claimId: "cl-i2" } },
  { invariant: "I2", kind: "PROCEDURE", handle: "@ctx/procedure/prc-i2/0", ref: { procedureId: "prc-i2", revision: 0, reason: "the method for I2" } },
];
const EXPOSURES = { G1: ["I1"], G2: ["I1", "I2"] };

/* ================================================================ §1/§2 validity */

describe("R3-L0C-R §1/§2 — the corrected validity semantics", () => {
  it("§2 names the four separable dimensions, replacing the single ambiguous gate", () => {
    expect(VALIDITY_DIMENSIONS.map((entry: { id: string }) => entry.id)).toEqual([
      "SYSTEM_VALID",
      "EXPERIMENT_ENVIRONMENT_VALID",
      "TREATMENT_REALIZATION_VALID",
      "ANALYSIS_PLAN_VALID",
    ]);
    expect(CLAIM_ADMISSION.conjunctionName).toBe("CAUSAL_EXPERIMENT_VALID");
  });

  it("§2 the conjunction requires ALL four, and names what failed", () => {
    const all = causalExperimentValidFrom({ SYSTEM_VALID: true, EXPERIMENT_ENVIRONMENT_VALID: true, TREATMENT_REALIZATION_VALID: true, ANALYSIS_PLAN_VALID: true });
    expect(all.CAUSAL_EXPERIMENT_VALID).toBe(true);
    expect(all.failing).toEqual([]);
    for (const definition of VALIDITY_DIMENSIONS as readonly { id: string }[]) {
      const oneFailing = causalExperimentValidFrom(Object.fromEntries(VALIDITY_DIMENSIONS.map((entry: { id: string }) => [entry.id, entry.id !== definition.id])));
      expect(oneFailing.CAUSAL_EXPERIMENT_VALID, `${definition.id} must invalidate the conjunction`).toBe(false);
      expect(oneFailing.failing).toEqual([definition.id]);
    }
  });

  it("§2 RUN 1'S EXACT STATE is nameable: sound environment, unapplied treatment", () => {
    /**
     * This is the correction the stage exists for. Run 1 had a sound environment and an absent treatment. A single
     * `EXPERIMENT_VALID` would have reported YES — the environment was valid — and a reader would have concluded
     * the experiment was sound while the treatment was missing.
     */
    const run1 = causalExperimentValidFrom({ SYSTEM_VALID: true, EXPERIMENT_ENVIRONMENT_VALID: true, TREATMENT_REALIZATION_VALID: false, ANALYSIS_PLAN_VALID: true });
    expect(run1.CAUSAL_EXPERIMENT_VALID).toBe(false);
    expect(run1.failing).toEqual(["TREATMENT_REALIZATION_VALID"]);
    expect(String(run1.onFailure)).toContain("no reconstruction-compression");
  });

  it("§2 the task outcome is not an input, in either direction", () => {
    expect(CLAIM_ADMISSION.taskOutcomeIsAnInput).toBe(false);
    const withFavorable = causalExperimentValidFrom({ SYSTEM_VALID: false, EXPERIMENT_ENVIRONMENT_VALID: false, TREATMENT_REALIZATION_VALID: false, ANALYSIS_PLAN_VALID: false });
    expect(withFavorable.CAUSAL_EXPERIMENT_VALID).toBe(false);
  });

  it("§1 the Run-1 erratum is recorded in the frozen plan", () => {
    expect(plan).not.toBeNull();
    expect(plan.run1Status).toBe("TREATMENT_NOT_APPLIED");
    expect(plan.run1Contribution).toContain("ZERO observations");
  });
});

/* ================================================================ §3 telemetry */

describe("R3-L0C-R §3 — the corrected treatment telemetry", () => {
  it("§3 records the five fields separately", () => {
    expect(TELEMETRY_FIELDS.map((entry: { id: string }) => entry.id)).toEqual(["selectionRequested", "selectionCompiled", "consumerVisible", "pullInvoked", "bodyResolved"]);
  });

  it("§3 RUN 1'S SIGNAL IS A DELIVERY FAILURE, not an uptake observation", () => {
    /**
     * The exact Run-1 state: a selection was requested and zero handles were compiled. §3 requires this to read as
     * a delivery/treatment failure, and the test pins that reading so it cannot be restated as "capital was not
     * consumed".
     */
    const run1Shape = treatmentTelemetry({
      requestedSelection: { proof: [], reasoning: [{ cellId: "c", claimId: "k" }], procedure: [] },
      payload: { compiledHandleCount: 0, handles: [] },
      governedPulls: [],
    });
    expect(run1Shape.selectionRequested).toBe(true);
    expect(run1Shape.selectionCompiled).toBe(false);
    expect(run1Shape.consumerVisible).toBe(false);
    expect(run1Shape.pullInvoked).toBe(false);
    expect(run1Shape.bodyResolved).toBe(false);
    expect(run1Shape.reading).toBe("DELIVERY_FAILURE_REQUESTED_BUT_NOT_COMPILED");
    expect(run1Shape.rule).toContain("NOT an uptake failure");
  });

  it("§3 the per-kind counts are recorded separately", () => {
    const telemetry = treatmentTelemetry({
      requestedSelection: { proof: [], reasoning: [{ cellId: "c", claimId: "k" }], procedure: [{ procedureId: "p", revision: 0, reason: "r" }] },
      payload: { compiledHandleCount: 2, handles: [{ kind: "reasoning", handle: "@ctx/reasoning/c/k" }, { kind: "procedure", handle: "@ctx/procedure/p/0" }] },
      governedPulls: [{ handle: "@ctx/reasoning/c/k", resolved: true, bodyDigest: "a".repeat(64) }],
    });
    expect(telemetry.requestedCounts).toEqual({ proof: 0, reasoning: 1, procedure: 1 });
    expect(telemetry.compiledCounts).toEqual({ proof: 0, reasoning: 1, procedure: 1 });
    expect(telemetry.reading).toBe("SELECTION_COMPILED");
    expect(telemetry.bodyResolved).toBe(true);
  });

  it("§3 an absent selection reads as NO_SELECTION_REQUESTED, which is the legitimate H state", () => {
    const h = treatmentTelemetry({ requestedSelection: undefined, payload: { compiledHandleCount: 0, handles: [] }, governedPulls: [] });
    expect(h.selectionRequested).toBe(false);
    expect(h.reading).toBe("NO_SELECTION_REQUESTED");
  });
});

/* ================================================================ §4/§5 selection hardening */

describe("R3-L0C-R §4/§5 — the fail-closed selection builder", () => {
  it("§4 records WHICH case applies, and that no product change was made", () => {
    expect(SELECTION_CONTRACT_FINDING.case).toBe("HARNESS_BYPASSED_TYPED_API");
    expect(SELECTION_CONTRACT_FINDING.productChangeMade).toBe(false);
    expect(SELECTION_CONTRACT_FINDING.productChangeRequired).toBe(false);
    expect(String(SELECTION_CONTRACT_FINDING.repair)).toContain("canonical");
  });

  it("§4 the finding's evidence names the type rejection and the untyped harness", () => {
    const ids = (SELECTION_CONTRACT_FINDING.evidence as readonly { id: string }[]).map((entry) => entry.id);
    expect(ids).toContain("TS_REJECTS_ESCAPED_SHAPE");
    expect(ids).toContain("HARNESS_IS_UNTYPED");
    expect(ids).toContain("SILENT_DEGRADATION");
    const ts = (SELECTION_CONTRACT_FINDING.evidence as readonly { id: string; detail: string }[]).find((entry) => entry.id === "TS_REJECTS_ESCAPED_SHAPE");
    expect(String(ts!.detail)).toContain("TS2353");
  });

  it("§4 the supported shape is the owner-kind structure", () => {
    expect([...SUPPORTED_KINDS]).toEqual(["proof", "reasoning", "procedure"]);
    expect(KIND_FIELDS.reasoning).toEqual(["cellId", "claimId"]);
    expect(KIND_FIELDS.procedure).toEqual(["procedureId", "revision", "reason"]);
  });

  it("§5 the ESCAPED defect is REFUSED, and never converted to an empty selection", () => {
    const escaped = attemptSelection(() => validateSelection({ handles: ["@ctx/reasoning/cell/cl"] }));
    expect(escaped.refusal).toBe(SELECTION_REFUSALS.UNKNOWN_KEY);
    expect(escaped.refusal).toBe("INVALID_SELECTION_SHAPE");
    expect(escaped.TREATMENT_REALIZATION_GATE).toBe("FAIL");
    expect(escaped.realModelLaunchCount).toBe(0);
  });

  it("§5 malformed item shapes and unknown kinds are refused too", () => {
    expect(attemptSelection(() => validateSelection({ reasoning: [{ cellId: "c" }] })).refusal).toBe(SELECTION_REFUSALS.MALFORMED_ITEM);
    expect(attemptSelection(() => validateSelection({ reasoning: [{ cellId: "c", claimId: "k", extra: 1 }] })).refusal).toBe(SELECTION_REFUSALS.MALFORMED_ITEM);
    expect(attemptSelection(() => validateSelection({ procedure: [{ procedureId: "p", revision: "0", reason: "r" }] })).refusal).toBe(SELECTION_REFUSALS.MALFORMED_ITEM);
    expect(attemptSelection(() => validateSelection({ reasoning: [{ cellId: "c", claimId: "k" }], bogus: [] })).refusal).toBe(SELECTION_REFUSALS.UNKNOWN_KEY);
    /** An ARRAY is refused too: it is not a plain object, and the product expects one. */
    expect(attemptSelection(() => validateSelection(["not", "an", "object"])).refusal).toBe(SELECTION_REFUSALS.NOT_AN_OBJECT);
  });

  it("§4 an ABSENT selection and an EMPTY one are both legitimate, because H depends on them", () => {
    expect(validateSelection(undefined)).toBeUndefined();
    expect(selectionIsEmpty(undefined)).toBe(true);
    expect(selectionIsEmpty({})).toBe(true);
    expect(selectionIsEmpty({ proof: [], reasoning: [], procedure: [] })).toBe(true);
    expect(selectionItemCount({})).toBe(0);
  });

  it("§6 the builder produces the owner shape for C and the ABSENCE for H", () => {
    const c = buildSelection({ arm: "C", generationId: "G1", admittedRefs: REFS, generationExposures: EXPOSURES });
    expect(Object.keys(c as object).sort()).toEqual(["procedure", "proof", "reasoning"]);
    expect((c as { reasoning: readonly unknown[] }).reasoning.length).toBe(1);
    expect((c as { procedure: readonly unknown[] }).procedure.length).toBe(1);
    expect(buildSelection({ arm: "H", generationId: "G1", admittedRefs: REFS, generationExposures: EXPOSURES })).toBeUndefined();
  });

  it("§5 the builder REFUSES an empty C selection for a generation that exposes invariants", () => {
    const refused = attemptSelection(() => buildSelection({ arm: "C", generationId: "G1", admittedRefs: [], generationExposures: EXPOSURES }));
    expect(refused.ok).toBe(false);
    expect(refused.refusal).toBe(SELECTION_REFUSALS.EMPTY_AFTER_VALIDATION);
  });
});

/* ================================================================ §5 the mutations */

describe("R3-L0C-R §5 — the permanent selection mutations", () => {
  it("§5 the malformed-handles mutation is DETECTED with zero launches", () => {
    const result = runSelectionMutations({ admittedRefs: REFS, generationId: "G1" });
    const mutation = (result.mutations as readonly { id: string; detected: boolean; REAL_MODEL_LAUNCH_COUNT: number; observed: string }[]).find((entry) => entry.id === MUTATION_IDS.MALFORMED_HANDLES_FIELD);
    expect(mutation).toBeDefined();
    expect(mutation!.detected).toBe(true);
    expect(mutation!.observed).toBe("INVALID_SELECTION_SHAPE");
    expect(mutation!.REAL_MODEL_LAUNCH_COUNT).toBe(0);
  });

  it("§5 both positive controls PASS", () => {
    const result = runSelectionMutations({ admittedRefs: REFS, generationId: "G1" });
    expect(result.controlsPassed).toBe(true);
    for (const control of result.controls as readonly { id: string; passed: boolean }[]) expect(control.passed, control.id).toBe(true);
    expect(result.TREATMENT_REALIZATION_GATE).toBe("PASS");
  });

  it("§5 the C control carries EXACTLY the expected handles and H carries zero", () => {
    const result = runSelectionMutations({ admittedRefs: REFS, generationId: "G1" });
    const cControl = (result.controls as readonly { id: string; items: number; expectedItems: number }[]).find((entry) => entry.id === MUTATION_IDS.C_POSITIVE_CONTROL);
    const hControl = (result.controls as readonly { id: string; items: number; requestIsUndefined: boolean }[]).find((entry) => entry.id === MUTATION_IDS.H_POSITIVE_CONTROL);
    expect(cControl!.items).toBe(cControl!.expectedItems);
    expect(cControl!.items).toBe(2);
    expect(hControl!.items).toBe(0);
    expect(hControl!.requestIsUndefined).toBe(true);
  });

  it("§5 NO mutation permits a model launch", () => {
    const result = runSelectionMutations({ admittedRefs: REFS, generationId: "G1" });
    expect(result.REAL_MODEL_LAUNCH_COUNT_ON_ANY_MUTATION).toBe(0);
  });
});

/* ================================================================ §6 expectation */

describe("R3-L0C-R §6 — the exact treatment expectation manifest", () => {
  it("§6 the expectation is frozen per generation and NOT inferred from runtime", () => {
    const g1 = buildExpectationManifest({ generationId: "G1", arm: "C", admittedRefs: REFS, generationExposures: EXPOSURES });
    const g2 = buildExpectationManifest({ generationId: "G2", arm: "C", admittedRefs: REFS, generationExposures: EXPOSURES });
    expect(g1.inferredFromRuntime).toBe(false);
    expect(g1.expectedConsumerVisibleHandles.length).toBe(2);
    expect(g2.expectedConsumerVisibleHandles.length).toBe(4);
    expect(g1.expectedCounts).toEqual({ proof: 0, reasoning: 1, procedure: 1, total: 2 });
  });

  it("§6 H's expectation is empty on every field", () => {
    const h = buildExpectationManifest({ generationId: "G2", arm: "H", admittedRefs: REFS, generationExposures: EXPOSURES });
    expect(h.expectedConsumerVisibleHandles).toEqual([]);
    expect(h.expectedCounts.total).toBe(0);
    expect(String(h.expectationRule)).toContain("empty");
  });

  it("§6 a mismatch yields TREATMENT_NOT_APPLIED and forbids the launch", () => {
    const expectation = buildExpectationManifest({ generationId: "G1", arm: "C", admittedRefs: REFS, generationExposures: EXPOSURES });
    const run1Like = treatmentTelemetry({ requestedSelection: { reasoning: [{ cellId: "c", claimId: "k" }] }, payload: { compiledHandleCount: 0, handles: [] }, governedPulls: [] });
    const mismatch = verifyRealization(expectation, run1Like);
    expect(mismatch.TREATMENT_REALIZATION).toBe("NOT_APPLIED");
    expect(mismatch.modelLaunchPermitted).toBe(false);
    expect(String(mismatch.onMismatch)).toContain("TREATMENT_NOT_APPLIED");
  });

  it("§6 an exact match is APPLIED", () => {
    const expectation = buildExpectationManifest({ generationId: "G1", arm: "C", admittedRefs: REFS, generationExposures: EXPOSURES });
    const telemetry = treatmentTelemetry({
      requestedSelection: { proof: [], reasoning: [{ cellId: "cell-i1", claimId: "cl-i1" }], procedure: [{ procedureId: "prc-i1", revision: 0, reason: "r" }] },
      payload: { compiledHandleCount: 2, handles: expectation.expectedConsumerVisibleHandles.map((handle: string) => ({ handle })) },
      governedPulls: expectation.expectedConsumerVisibleHandles.map((handle: string) => ({ handle, resolved: true, bodyDigest: "a".repeat(64) })),
    });
    const matched = verifyRealization(expectation, telemetry);
    expect(matched.TREATMENT_REALIZATION).toBe("APPLIED");
    expect(matched.modelLaunchPermitted).toBe(true);
  });

  it("§6 the expectation digest is stable and bound into the plan", () => {
    const expectation = buildExpectationManifest({ generationId: "G1", arm: "C", admittedRefs: REFS, generationExposures: EXPOSURES });
    expect(expectationDigest(expectation)).toMatch(/^[0-9a-f]{64}$/u);
    expect(expectationDigest(expectation)).toBe(expectationDigest(buildExpectationManifest({ generationId: "G1", arm: "C", admittedRefs: REFS, generationExposures: EXPOSURES })));
  });
});

/* ================================================================ §8 topology */

describe("R3-L0C-R §8 — the topology-derived containment", () => {
  const units = ["b0-C", "b0-H", "b1-C", "b1-H"];
  const manifest = buildTopologyManifest({ runRoot: "C:/tmp/run-topology", units });

  it("§8 the manifest is DERIVED from the schedule, never enumerated", () => {
    expect(manifest.derivedFromSchedule).toBe(true);
    expect(manifest.manuallyEnumerated).toBe(false);
    expect(manifest.unitIds).toEqual([...units].sort());
  });

  it("§8 every unit protects every OTHER unit's world and NOT its own", () => {
    for (const unit of manifest.perUnit as readonly { unitId: string; workerReadable: readonly string[]; siblingWorlds: readonly { unitId: string }[] }[]) {
      expect(unit.siblingWorlds.length).toBe(units.length - 1);
      expect(unit.siblingWorlds.map((entry) => entry.unitId)).not.toContain(unit.unitId);
      for (const sibling of unit.siblingWorlds) expect(unit.workerReadable.join(" ")).not.toContain(sibling.unitId);
    }
  });

  it("§8 every unit protects the host-private roots and its OWN state", () => {
    const kinds = (manifest.hostPrivate as readonly { id: string }[]).map((entry) => entry.id);
    for (const required of HOST_PRIVATE_KINDS.map((entry) => entry.id)) expect(kinds).toContain(required);
    for (const unit of manifest.perUnit as readonly { protectedRoots: readonly string[]; ownStateProtected: string }[]) {
      expect(unit.protectedRoots).toContain(unit.ownStateProtected);
    }
  });

  it("§8 the units root is NEVER protected, because it is an ancestor of the world", () => {
    for (const unit of manifest.perUnit as readonly { protectedRoots: readonly string[]; unitsRootExcluded: string }[]) {
      expect(unit.protectedRoots).not.toContain(unit.unitsRootExcluded);
    }
    expect(String(manifest.unitsRootNeverProtected)).toContain("ancestor");
  });

  it("§8 the digest is stable and the canary plan covers every forbidden root", () => {
    expect(topologyDigest(manifest)).toBe(manifest.topologyDigest);
    const planFor = canaryPlan(manifest);
    expect(planFor.length).toBe(units.length);
    for (const entry of planFor as readonly { forbidden: readonly { kind: string }[] }[]) {
      expect(entry.forbidden.length).toBeGreaterThanOrEqual(HOST_PRIVATE_KINDS.length);
      expect(entry.forbidden.map((item) => item.kind)).toContain("SIBLING_WORLD");
      expect(entry.forbidden.map((item) => item.kind)).toContain("DIAGNOSTIC_ORACLE");
      expect(entry.forbidden.map((item) => item.kind)).toContain("OWN_STATE");
    }
  });

  it("§8 a new unit is protected automatically, which is the point of derivation", () => {
    const bigger = buildTopologyManifest({ runRoot: "C:/tmp/run-topology", units: [...units, "b4-C"] });
    expect(bigger.unitIds.length).toBe(units.length + 1);
    for (const unit of bigger.perUnit as readonly { siblingWorlds: readonly unknown[] }[]) expect(unit.siblingWorlds.length).toBe(units.length);
  });
});

/* ================================================================ §9 closure */

describe("R3-L0C-R §9 — the execution-closure digest", () => {
  it("§9 covers every load-bearing category", () => {
    const closure = computeExecutionClosure();
    expect(Object.keys(closure.byCategory).sort()).toEqual([...EXECUTION_CLOSURE_INPUTS].sort());
    expect(closure.executionClosureDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(closure.coversCodeNotResults).toBe(true);
  });

  it("§9 the frozen plan records it", () => {
    expect(plan).not.toBeNull();
    expect(plan.executionClosure.executionClosureDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(plan.closureInputs.length).toBe(EXECUTION_CLOSURE_INPUTS.length);
  });

  it("§9 a drift is detected and names the changed category", () => {
    const frozen = { 'project/corpus': "a".repeat(64), oracle: "b".repeat(64) };
    const drifted = { 'project/corpus': "a".repeat(64), oracle: "c".repeat(64) };
    const check = verifyClosure(frozen, drifted);
    expect(check.EXECUTION_CLOSURE).toBe("DRIFTED");
    expect(check.changed).toEqual(["oracle"]);
    expect(String(check.onMismatch)).toContain("STOP");
    expect(verifyClosure(frozen, frozen).EXECUTION_CLOSURE).toBe("MATCH");
  });

  it("§9 the closure digest is a pure function of the category digests", () => {
    expect(closureDigest({ a: "1", b: "2" })).toBe(closureDigest({ b: "2", a: "1" }));
    expect(closureDigest({ a: "1" })).not.toBe(closureDigest({ a: "2" }));
  });
});

/* ================================================================ §10/§11 baseline */

describe("R3-L0C-R §10/§11 — the Run-1 baseline and the pressure gate", () => {
  const matrix = read(join(R3L0C_EVIDENCE, "matrix.json"));
  const sessions = calibrateRun(matrix.runRoot, matrix);

  it("§10 the capital surface was EMPTY for all 16 sessions, proven mechanically", () => {
    const proof = proveEmptyCapitalSurface(matrix);
    expect(proof.sessions).toBe(16);
    expect(proof.emptyForEverySession).toBe(true);
    expect(proof.sessionsWithCompiledHandles).toBe(0);
    expect(proof.cSelectionRequestedButNotCompiled).toBe(8);
    expect(String(proof.reading)).toContain("TREATMENT_REALIZATION_FAILURE");
  });

  it("§10 the calibration covers 16 sessions with every required metric", () => {
    expect(sessions.length).toBe(16);
    for (const session of sessions as readonly Record<string, unknown>[]) {
      for (const field of ["rawHistoryArtifactsRead", "distinctRawHistoryCategories", "rawHistoryBytesReturned", "historyReadActions", "actionsBeforeFirstResult", "completionCause"]) {
        expect(session, `${String(session.sessionId)} is missing ${field}`).toHaveProperty(field);
      }
    }
  });

  it("§10 the calibration does NOT group by the H/C labels", () => {
    /** §10 forbids the label comparison, because the C label describes an intent that was not realized. */
    const byArm = sessions.filter((session: { arm: string }) => session.arm === "C").length;
    expect(byArm).toBe(8);
    /** The metrics are reported as ONE sample; a grouping would need a per-arm summary, which this stage does not produce. */
    const gate = evaluatePressureGate(sessions);
    expect(PRESSURE_GATE.kind).toContain("NOT a treatment-effect result");
    expect(gate.correctnessIsNotAnInput).toBe(true);
  });

  it("§11 the pressure gate has the three frozen thresholds", () => {
    expect(PRESSURE_GATE.sessionsAccessingAtLeastOneArtifact.required).toBe(12);
    expect(PRESSURE_GATE.medianDistinctArtifacts.required).toBe(2);
    expect(PRESSURE_GATE.sessionsAccessingAtLeastTwoCategories.required).toBe(8);
    expect(PRESSURE_GATE.correctnessAtCeilingIsNotAFailure).toBe(true);
  });

  it("§11 the gate evaluates all three conditions and reports the verdict", () => {
    const gate = evaluatePressureGate(sessions);
    expect(gate.conditions.length).toBe(3);
    expect(typeof gate.RECONSTRUCTION_PRESSURE_PRESENT).toBe("boolean");
    for (const condition of gate.conditions as readonly { satisfied: boolean; detail: string }[]) expect(condition.detail.length).toBeGreaterThan(10);
  });

  it("§11 a hypothetical no-reading run would FAIL the gate, so the gate is not vacuous", () => {
    const noReads = sessions.map((session: Record<string, unknown>) => ({ ...session, rawHistoryArtifactsRead: 0, distinctRawHistoryCategories: 0 }));
    const gate = evaluatePressureGate(noReads);
    expect(gate.RECONSTRUCTION_PRESSURE_PRESENT).toBe(false);
    expect(gate.failedConditions.length).toBeGreaterThan(0);
  });

  it("§11 the median helper is correct", () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

/* ================================================================ §17/§18 frozen rules */

describe("R3-L0C-R §17/§18 — the verdict rules are unchanged", () => {
  it("§18 the verdict surface is RE-EXPORTED, not redefined", () => {
    expect(FROZEN_VERDICT_SURFACE.REEXPORTED_FROM).toBe("scripts/r3l0c/analyse.mjs");
    expect(FROZEN_VERDICT_SURFACE.addedRules).toBe(false);
  });

  it("§12 the plan attests the frozen design is unchanged", () => {
    expect(plan).not.toBeNull();
    expect(plan.frozenDesignUnchanged).toBe(true);
    expect(plan.frozenDesign.seedRechosen).toBe(false);
    expect(plan.frozenDesign.corpus.unchanged).toBe(true);
    expect(plan.frozenDesign.invariants.unchanged).toBe(true);
    expect(plan.frozenDesign.verdictThresholds.redefined).toBe(false);
  });

  it("§14 the plan reuses the original arm order and reruns both arms", () => {
    expect(plan).not.toBeNull();
    expect(plan.armOrderPerBlock).toEqual([["C", "H"], ["H", "C"], ["C", "H"], ["C", "H"]]);
    expect(plan.armOrderBalance.balanced).toBe(true);
    expect(plan.totalSessions).toBe(16);
    expect(plan.pairsOldWithNew).toBe(false);
    expect(plan.freshRunIds).toBe(true);
  });

  it("§12 the replication is named REPAIR_REPLICATION and not something stronger", () => {
    expect(plan).not.toBeNull();
    expect(plan.replicationName).toBe("REPAIR_REPLICATION");
    expect(plan.namingRule).toContain("do NOT call it pristine held-out replication");
  });
});
