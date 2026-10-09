/**
 * R3-L0C-I Gate 6 — THE REGRESSION RECORD.
 *
 * §"Run all deterministic security, containment, Work, API, unit and E2E regressions." This module is the record of
 * that run, with the numbers as measured and the one limit restated rather than smoothed over.
 *
 * THE TEST COUNT IS RECORDED AS MEASURED, and it is the number that matters for Gate 6's first correction: this
 * stage's run reports a count that differs from R3-L0C-F's committed artifact, and the difference is explained by
 * the tests this stage ADDED rather than by a discrepancy in either run.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

const NL = String.fromCharCode(10);

/** Gate 6: the suites, with the command and the observed result. */
export const REGRESSION_SUITES = Object.freeze([
  Object.freeze({ id: 'TYPESCRIPT_BUILD', command: 'tsc -b', result: 'PASS', detail: 'clean build under strict/exactOptionalPropertyTypes/noUncheckedIndexedAccess' }),
  Object.freeze({ id: 'UNIT_SUITE', command: 'vitest run', result: 'PASS', detail: '3959/3959 across 286 files' }),
  Object.freeze({ id: 'E2E', command: 'playwright test', result: 'PASS', detail: '38/38' }),
  Object.freeze({ id: 'ARCHITECTURE', command: 'module-architecture.mjs --check', result: 'PASS', detail: '0 violations, 9 accepted baseline exceptions' }),
  Object.freeze({ id: 'PUBLIC_API', command: 'module-architecture.mjs --check-public-api', result: 'PASS', detail: '0 missing, 0 changed kind, 0 added' }),
  Object.freeze({ id: 'R1_H_CONFINEMENT', command: 'r1h/conformance.mjs', result: 'PASS', detail: 'the read boundary holds on this host' }),
  Object.freeze({ id: 'R1_HR_HOST_HARDENING', command: 'r1hr/conformance.mjs', result: 'PASS', detail: 'disclosed limits HR-17, HR-39b, HR-33' }),
  Object.freeze({ id: 'R1_HC_RESIDUAL_CLOSURE', command: 'r1hc/conformance.mjs', result: 'PASS', detail: 'disclosed limit HC-27 (the known parallel-active-worker limit)' }),
  Object.freeze({ id: 'R1_L_CONSUMER_BOUNDARY', command: 'gates/r1l-live-gate.mjs', result: 'PASS', detail: '§R1-L-LIVE PASS' }),
  Object.freeze({ id: 'R3_S0_GRAPH', command: 'r3s0/graph-audit.mjs', result: 'PASS', detail: '10/10 invariants' }),
  Object.freeze({ id: 'R3_S0_EVENTS', command: 'r3s0/event-audit.mjs', result: 'PASS', detail: '5/5 audit checks' }),
  Object.freeze({ id: 'ANTI_VACUITY', command: 'r2lr/anti-vacuity.mjs', result: 'PASS', detail: '0 unconditional forms' }),
  Object.freeze({ id: 'R3_CONTAINMENT_AND_CONTRACTS', command: 'vitest r3l0b_canary + r3l0b_containment + r3l0c_containment + r3l0c_contract + r3l0c_harness + r3l0c_selection + r3l0cr_boundary + r3l0cr_contract', result: 'PASS', detail: 'included in the 325-test R3 and D-series run' }),
  Object.freeze({ id: 'D2_D4_D5_TESTS', command: 'vitest lean_d2_live_composition + lean_d4c_read_evidence + lean_d5_0_effect_authority + lean_d5d_result_continuation_service', result: 'PASS', detail: 'included in the 325-test run' }),
  Object.freeze({ id: 'HISTORICAL_EVIDENCE_IMMUTABILITY', command: 'r3l0c/immutability.mjs', result: 'PASS', detail: '374 protected files, baseline e51df1f4; no protected mutation' }),
  Object.freeze({ id: 'NEW_GATE_TESTS', command: 'vitest r3l0ci_controls + r3l0ci_gates', result: 'PASS', detail: '32 tests: 15 Gate 1/2 controls and 17 Gate 3/4/5 integration tests' }),
]);

/**
 * Gate 6: THE LIMITS, with the model-request question answered.
 *
 * The live gates are restated here AND in `evidence-corrections.mjs`, because Gate 6 asks for the live-gate record
 * precisely and the regression record is where a reader looks for it. The two carry the same measurement.
 */
export const REGRESSION_LIMITS = Object.freeze([
  Object.freeze({
    id: 'D2_D4_D5_LIVE_GATES_FAIL',
    status: 'PRE_EXISTING',
    scripts: Object.freeze(['scripts/gates/d2-live-gate.mjs', 'scripts/gates/d4-live-gate.mjs', 'scripts/gates/d5-live-gate.mjs']),
    observed: Object.freeze({
      D2: 'FAIL — the worker finished without reporting an outcome, so the attempt never settled (settlement NOT_READY / HOST_FAILURE)',
      D4: 'FAIL — fatal: Not a valid object name null^{commit}; the rig then failed on git diff against a null result commit',
      D5: 'FAIL — delegated attempts returned NOT_READY / HOST_FAILURE, then PlanReconciliationError: plan revision blocked (quiescence_required)',
    }),
    anyModelRequestEmitted: false,
    modelRequestEvidence: 'each gate worker session log contains exactly ONE record (the session header), with no conversation, no tool call and no completion request; the worker transcripts report zero tool actions',
    introducedByThisStage: false,
    whyNotRepaired: 'the gates require a model route and this stage forbids model calls; src/**, host/** and scripts/gates/** are byte-identical to the baseline',
    whatWasRunInstead: 'the D-series TESTS (part of the 325-test R3 and D-series run), which is what the prior stage recorded as its D2/D4/D5 regression',
  }),
  Object.freeze({
    id: 'LIVE_MODEL_MATRIX_NOT_RUN',
    status: 'BY_DESIGN',
    observed: 'the 16-session paid matrix was not run',
    anyModelRequestEmitted: false,
    introducedByThisStage: false,
    whyNotRepaired: 'the ruling ends with a mandatory stop and requires an explicit authorization ruling before the paid run',
  }),
]);

/** Gate 6: the record. */
export function regressionRecord() {
  const failing = REGRESSION_SUITES.filter((suite) => suite.result !== 'PASS').map((suite) => suite.id);
  const introduced = REGRESSION_LIMITS.filter((limit) => limit.introducedByThisStage === true).map((limit) => limit.id);
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I',
    kind: 'regression record',
    suites: REGRESSION_SUITES,
    suiteCount: REGRESSION_SUITES.length,
    failing: Object.freeze(failing),
    limits: REGRESSION_LIMITS,
    REGRESSION: failing.length === 0 && introduced.length === 0 ? 'PASS' : 'FAIL',
    limitsIntroducedByThisStage: Object.freeze(introduced),
    /** Gate 6: the model-request question, answered once for the whole record. */
    anyModelRequestEmitted: false,
    modelCallsMade: 0,
    law: 'report genuine failures and limits rather than smoothing them',
  });
}

export { NL };
