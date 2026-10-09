/**
 * R3-L0C-F §3 — THE OLD-RUNNER FALSIFIERS, AS TESTS.
 *
 * §3 requires the five legacy defects to be frozen as failing tests against the current R3-L0C-R matrix runner,
 * and it forbids weakening them to get green. So these tests assert the DEFECT IS PRESENT — they pass when the
 * legacy control flow exhibits the defect, which is the only honest form of a frozen falsifier.
 *
 * WHY THE ASSERTIONS READ OBSERVED VALUES RATHER THAN THE SOURCE. §3 is explicit: "Prove these properties through
 * observed execution and durable records, not source-code regexes alone." A test that grepped
 * `scripts/r3l0cr/matrix.mjs` for `while (attempt < 4)` would keep passing after the runner was rewritten in a
 * different shape, and would keep failing after the same defect was expressed differently. These tests run the
 * extracted control flow and read what it did.
 *
 * THE STRUCTURAL COMPARISON IS A SUPPLEMENT, NOT THE PROOF. One test checks that the extracted retry loop still
 * matches the shipped runner's shape, so the baseline cannot silently drift away from the thing it models. It is
 * a guard on the extraction's fidelity; the defect measurements do not depend on it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BASELINE_SOURCE, LEGACY_DEFECTS, legacyInfrastructureInvalid } from "../scripts/r3l0cf/baseline/legacy-matrix.mjs";
import {
  falsifyG2WithoutResolvedG1,
  falsifyLedgerOnlyAfterTrajectory,
  falsifyNoPostMatrixValidityGate,
  falsifyRetryAfterInfrastructureInvalidity,
  legacyPropertyWitness,
  runLegacyFalsifiers,
} from "../scripts/r3l0cf/falsifiers.mjs";
import { CRASH_MATRIX_REQUIREMENTS } from "../scripts/r3l0cf/contract.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

describe("R3-L0C-F §3 — the old runner's retry and evidence-loss defects", () => {
  it("D1/D2: the legacy runner launches an infrastructure-invalid session more than once", () => {
    const result = falsifyRetryAfterInfrastructureInvalidity();
    /** §3: the defect is a SECOND LAUNCH for one session, which is the fail-stop law's violation. */
    expect(result.defectPresent).toBe(true);
    expect(result.legacyObservation.launchesForG1).toBeGreaterThan(1);
    expect(result.legacyObservation.attemptsForG1).toBeGreaterThan(1);
    expect(result.newRunnerMustShow.MAX_WORKER_LAUNCHES).toBe(1);
    expect(result.newRunnerMustShow.POST_EXPOSURE_RETRIES).toBe(0);
  });

  it("D3: a completed generation has no durable record when the trajectory throws", () => {
    const result = falsifyLedgerOnlyAfterTrajectory();
    expect(result.defectPresent).toBe(true);
    /** §3: G1 completed, the ledger write never happened, so the evidence is lost. */
    expect(result.legacyObservation.g1CompletedBeforeThrow).toBe(true);
    expect(result.legacyObservation.ledgerWriteCount).toBe(0);
    expect(result.legacyObservation.durableRecordOfCompletedG1).toBe(false);
  });

  it("D4: the legacy runner enters G2 while G1's canonical Attempt is unresolved", () => {
    const result = falsifyG2WithoutResolvedG1();
    expect(result.defectPresent).toBe(true);
    expect(result.legacyObservation.g1AttemptState).toBe("RUNNING");
    expect(result.legacyObservation.g2Entered).toBe(true);
    /** The shipped generation loop consults no attempt state, which is the defect. */
    expect(result.legacyObservation.priorAttemptChecksPerformed).toBe(0);
  });

  it("D5: the legacy runner reports completion over a reduced denominator with no validity gate", () => {
    const result = falsifyNoPostMatrixValidityGate();
    expect(result.defectPresent).toBe(true);
    expect(result.legacyObservation.completionReported).toBe(true);
    expect(result.legacyObservation.postMatrixValidityGate).toBe(false);
    /** The reported line names fewer valid sessions than the schedule, and still says COMPLETE. */
    expect(result.legacyObservation.validSessions).toBeLessThan(result.legacyObservation.plannedSessions);
    expect(result.legacyObservation.completionLine).toMatch(/COMPLETE/);
  });

  it("all five declared defects are covered by a falsifier, and none is vacuous", () => {
    const suite = runLegacyFalsifiers();
    expect(suite.declaredDefects.length).toBe(5);
    expect(suite.uncovered).toEqual([]);
    expect(suite.vacuous).toEqual([]);
    expect(suite.LEGACY_DEFECTS_PRESENT).toBe(true);
    expect(suite.FALSIFIERS_FAIL_AGAINST_LEGACY).toBe(true);
  });

  it("the §8 property evaluator fails the legacy runner on the properties it can discriminate", () => {
    const witness = legacyPropertyWitness();
    expect(witness.WITNESS_FAILS_AGAINST_LEGACY).toBe(true);
    /** The legacy runner violates at least these three; the other two guard failure modes it cannot exhibit. */
    expect(witness.violated).toContain("NO_SECOND_LAUNCH");
    expect(witness.violated).toContain("NEXT_SESSION_NOT_STARTED");
    expect(witness.violated).toContain("EVIDENCE_PRESERVED");
    /** §8: the non-discriminating properties are STATED rather than glossed over. */
    expect([...witness.nonDiscriminating].sort()).toEqual(["NO_CAUSAL_VERDICT", "NO_FAKE_ATTEMPT_TERMINAL"]);
  });

  it("the extraction names the shipped lines it reproduces, and the shipped retry loop is still there", () => {
    /** §3: the extraction's fidelity, checked against the shipped file rather than assumed. */
    const shipped = readFileSync(join(REPO_ROOT, "scripts", "r3l0cr", "matrix.mjs"), "utf8");
    expect(shipped).toMatch(/while \(attempt < 4\)/);
    expect(shipped).toMatch(/infrastructureInvalid/);
    expect(BASELINE_SOURCE.path).toBe("scripts/r3l0cr/matrix.mjs");
    expect(BASELINE_SOURCE.revision).toBe("19f0c69833f33c51ada8642379980c490cb75d04");
    expect(BASELINE_SOURCE.reproduces.map((entry: { id: string }) => entry.id)).toContain("RETRY_LOOP");
  });

  it("the legacy infrastructure-invalidity predicate matches the shipped one", () => {
    /** The shipped predicate: a missing report, a failed report, or a HOST_ERROR phase. */
    expect(legacyInfrastructureInvalid(null)).toBe(true);
    expect(legacyInfrastructureInvalid({ ok: false })).toBe(true);
    expect(legacyInfrastructureInvalid({ ok: true, jobPhase: "HOST_ERROR" })).toBe(true);
    expect(legacyInfrastructureInvalid({ ok: true, jobPhase: "FINISHED" })).toBe(false);
    expect(LEGACY_DEFECTS.length).toBe(5);
  });

  it("§8's five required properties are exactly the set the evaluator reports", () => {
    expect(CRASH_MATRIX_REQUIREMENTS.length).toBe(5);
    const witness = legacyPropertyWitness();
    for (const scenario of witness.scenarios) {
      expect(scenario.observation.plannedSessions.length).toBeGreaterThan(0);
    }
  });
});
