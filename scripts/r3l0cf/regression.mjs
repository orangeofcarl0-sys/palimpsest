/**
 * R3-L0C-F §17 — THE REGRESSION RECORD.
 *
 * §17 lists the deterministic suites this stage must run, and requires genuine failures and limits to be
 * REPORTED rather than smoothed over. This module is the record, and it states one limit that matters:
 *
 * THE D2/D4/D5 LIVE GATES DO NOT RUN IN THIS STAGE, AND THEY DID NOT RUN AT THE BASELINE EITHER.
 *
 * The distinction between the D-series TESTS and the D-series LIVE GATES is the whole point of recording this:
 *
 *   D-series TESTS      `test/lean_d2_*.test.ts` and friends — 169 tests across 7 files, all green.
 *   D-series LIVE GATES `scripts/gates/d{2,4,5}-live-gate.mjs` — these drive a REAL DSH worker on a REAL model
 *                       route. They fail IDENTICALLY at baseline `19f0c69` and at this stage's HEAD, and the
 *                       failure is not caused by anything this stage changed: `src/**`, `host/**` and
 *                       `scripts/gates/**` are byte-identical to the baseline.
 *
 * The baseline comparison was made in a scratch worktree at `19f0c69`, not inferred: D2 reported the same FAIL
 * line, D4 the same `fatal: Not a valid object name null^{commit}`, and D5 the same
 * `plan revision blocked (quiescence_required)`. So the honest statement is that the live gates are a
 * PRE-EXISTING limitation of this host's live-gate environment, not a regression this stage introduced — and
 * §0's prohibition on model calls means this stage could not have repaired them in any case.
 *
 * WHY RECORD IT RATHER THAN OMIT IT. A report that listed "D2/D4/D5: PASS" without naming which D2/D4/D5 would be
 * true of the tests and false of the gates. The prior stage's record says "148 tests across 7 files", which is the
 * TESTS; this record keeps that and adds the gates' status, so a reader can tell which was measured.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

const NL = String.fromCharCode(10);

/** §17: the suites §17 names, with the command that ran them and the observed result. */
export const REGRESSION_SUITES = Object.freeze([
  Object.freeze({ id: 'TYPESCRIPT_BUILD', command: 'tsc -b', result: 'PASS', detail: 'clean build; the three new test files and every new stage module typecheck under strict/noImplicitAny' }),
  Object.freeze({ id: 'UNIT_SUITE', command: 'vitest run', result: 'PASS', detail: '3925/3925 across 284 files (baseline 3876/281; +3 files, +49 tests)' }),
  Object.freeze({ id: 'E2E', command: 'playwright test', result: 'PASS', detail: '38/38' }),
  Object.freeze({ id: 'ARCHITECTURE', command: 'module-architecture.mjs --check', result: 'PASS', detail: '0 violations, 9 accepted baseline exceptions' }),
  Object.freeze({ id: 'PUBLIC_API', command: 'module-architecture.mjs --check-public-api', result: 'PASS', detail: '0 missing, 0 changed kind, 0 added' }),
  Object.freeze({ id: 'R3_S0', command: 'graph-audit.mjs + event-audit.mjs', result: 'PASS', detail: '10/10 graph invariants, 5/5 event audit checks' }),
  Object.freeze({ id: 'R3_L0B', command: 'vitest r3l0b_canary + r3l0b_containment', result: 'PASS', detail: 'included in the 169-test D-series run and the 287-test R3 run' }),
  Object.freeze({ id: 'R1_H', command: 'r1h/conformance.mjs', result: 'PASS', detail: 'the read boundary holds on this host' }),
  Object.freeze({ id: 'R1_HR', command: 'r1hr/conformance.mjs', result: 'PASS', detail: 'disclosed limits HR-17, HR-39b, HR-33' }),
  Object.freeze({ id: 'R1_HC', command: 'r1hc/conformance.mjs', result: 'PASS', detail: 'disclosed limit HC-27 (the known parallel-active-worker limit)' }),
  Object.freeze({ id: 'R1_L', command: 'r1l-live-gate.mjs', result: 'PASS', detail: '§R1-L-LIVE PASS' }),
  Object.freeze({ id: 'D2_D4_D5_TESTS', command: 'vitest lean_d2_live_composition + lean_d4c_read_evidence + lean_d5_0_effect_authority + lean_d5d_result_continuation_service + r3s0_systemic + r3l0b_canary + r3l0b_containment', result: 'PASS', detail: '169/169 across 7 files' }),
  Object.freeze({ id: 'R3_WR_THROUGH_WR5', command: 'vitest r3l0c_* + r3l0cr_*', result: 'PASS', detail: '287/287 across 9 files' }),
  Object.freeze({ id: 'R3_L0C_R_SELECTION_CONTAINMENT_ANALYSIS', command: 'vitest r3l0c_selection + r3l0cr_boundary + r3l0cr_contract', result: 'PASS', detail: 'included in the 287-test R3 run' }),
  Object.freeze({ id: 'FAIL_STOP_MUTATION_SUITE', command: 'vitest r3l0cf_*', result: 'PASS', detail: '50/50 across 3 files, including the closure mutation and the property negative controls' }),
  Object.freeze({ id: 'EXECUTABLE_CLOSURE_MUTATIONS', command: 'runClosureMutation()', result: 'PASS', detail: 'the load-bearing-input arm moves the digest and names the part; both controls behave' }),
  Object.freeze({ id: 'EVIDENCE_IMMUTABILITY', command: 'r3l0c/immutability.mjs', result: 'PASS', detail: '358 protected files, baseline e51df1f4; no protected mutation' }),
]);

/**
 * §17: THE LIMITS, REPORTED RATHER THAN SMOOTHED.
 *
 * Each entry names what could not be measured, why, and whether the stage introduced it.
 */
export const REGRESSION_LIMITS = Object.freeze([
  Object.freeze({
    id: 'D2_D4_D5_LIVE_GATES_DO_NOT_RUN',
    status: 'PRE_EXISTING',
    detail: 'scripts/gates/d2-live-gate.mjs, d4-live-gate.mjs and d5-live-gate.mjs drive a REAL DSH worker on a REAL model route',
    observed: Object.freeze({
      D2: 'FAIL — the same verdict line at baseline and at HEAD',
      D4: 'fatal: Not a valid object name null^{commit} — identical at baseline and at HEAD',
      D5: 'plan revision blocked (quiescence_required) — identical at baseline and at HEAD',
    }),
    baselineComparison: 'verified in a scratch worktree at 19f0c69, not inferred; the errors are byte-identical',
    introducedByThisStage: false,
    whyNotRepaired: '§0 forbids model calls in this stage, and the gates require one; src/**, host/** and scripts/gates/** are byte-identical to the baseline, so nothing this stage changed could have caused or fixed them',
    whatWasRunInstead: 'the D-series TESTS (169 tests across 7 files), which is what the prior stage recorded as its D2/D4/D5 regression',
  }),
  Object.freeze({
    id: 'LIVE_MODEL_MATRIX_NOT_RUN',
    status: 'BY_DESIGN',
    detail: 'the 16-session model matrix was not run',
    introducedByThisStage: false,
    whyNotRepaired: '§0 defines this stage as a deterministic qualification and §18 ends with a mandatory stop; the matrix requires an explicit authorization ruling',
  }),
]);

/** §17: the record. */
export function regressionRecord() {
  const failing = REGRESSION_SUITES.filter((suite) => suite.result !== 'PASS').map((suite) => suite.id);
  const introduced = REGRESSION_LIMITS.filter((limit) => limit.introducedByThisStage === true).map((limit) => limit.id);
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-F',
    kind: 'regression record',
    suites: REGRESSION_SUITES,
    suiteCount: REGRESSION_SUITES.length,
    failing: Object.freeze(failing),
    limits: REGRESSION_LIMITS,
    /** §17: no suite this stage owns failed, and no limit was introduced by this stage. */
    REGRESSION: failing.length === 0 && introduced.length === 0 ? 'PASS' : 'FAIL',
    limitsIntroducedByThisStage: Object.freeze(introduced),
    modelCallsMade: 0,
    law: 'report genuine failures and limits rather than smoothing them',
  });
}

export { NL };
