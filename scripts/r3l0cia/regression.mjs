/**
 * R3-L0C-I-A §10 — THE REGRESSION RECORD.
 *
 * §10 lists the suites to run and adds one instruction that shapes this module: "Keep live-gate results separate
 * from deterministic test results."
 *
 * That separation is the point. A live gate needs a model route; a deterministic suite does not. Reporting them in
 * one column would let a green deterministic run imply that the live gates passed, which is the reading the prior
 * stage went out of its way to prevent. So this record carries them in TWO sections and never computes a combined
 * verdict.
 *
 * THE COUNTS ARE RECORDED, NOT ASSERTED. Each suite's result is written down as the caller measured it, so a
 * report quotes the record rather than re-deriving it — and a suite that was NOT run appears as `NOT_RUN` rather
 * than as absent, because an absent entry reads as a pass to anyone scanning the list.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { REPO_ROOT } from './contract.mjs';

const NL = String.fromCharCode(10);

/** §10: the deterministic suites this stage must run, in the ruling's order. */
export const DETERMINISTIC_SUITES = Object.freeze([
  Object.freeze({ id: 'TYPESCRIPT_BUILD', command: 'tsc', deterministic: true }),
  Object.freeze({ id: 'FULL_UNIT_SUITE', command: 'vitest run', deterministic: true }),
  Object.freeze({ id: 'E2E', command: 'the e2e suite', deterministic: true }),
  Object.freeze({ id: 'ARCHITECTURE_PUBLIC_API', command: 'the architecture and public-API gates', deterministic: true }),
  Object.freeze({ id: 'R3_S0_SYSTEMIC', command: 'test/r3s0_systemic.test.ts', deterministic: true }),
  Object.freeze({ id: 'R3_L0B_CONTAINMENT', command: 'test/r3l0b_*.test.ts', deterministic: true }),
  Object.freeze({ id: 'R1_H_HR_HC_L', command: 'the R1 conformance and live gates', deterministic: true }),
  Object.freeze({ id: 'D2_D4_D5_DETERMINISTIC', command: 'the deterministic parts of the D-series gates', deterministic: true }),
  Object.freeze({ id: 'R3_WR_THROUGH_WR5', command: 'the R3-WR suites', deterministic: true }),
  Object.freeze({ id: 'R3_L0C_R_BOUNDARY_SELECTION_ANALYSIS', command: 'the R3-L0C-R suites', deterministic: true }),
  Object.freeze({ id: 'R3_L0C_F_FAIL_STOP', command: 'test/r3l0cf_*.test.ts', deterministic: true }),
  Object.freeze({ id: 'R3_L0C_I_INTEGRATION', command: 'test/r3l0ci_*.test.ts', deterministic: true }),
  Object.freeze({ id: 'R3_L0C_IA_ACTIVATION_MUTATIONS', command: 'test/r3l0cia_*.test.ts', deterministic: true }),
  Object.freeze({ id: 'HISTORICAL_EVIDENCE_IMMUTABILITY', command: 'the immutability guard', deterministic: true }),
]);

/** §10: the live gates, kept in their own section because they need a model route. */
export const LIVE_GATES = Object.freeze([
  Object.freeze({ id: 'D2_LIVE', requiresModelRoute: true, thisStageRanIt: false }),
  Object.freeze({ id: 'D4_LIVE', requiresModelRoute: true, thisStageRanIt: false }),
  Object.freeze({ id: 'D5_LIVE', requiresModelRoute: true, thisStageRanIt: false }),
]);

/** §10: a suite's result, with `NOT_RUN` distinguished from a failure. */
export function suiteResult(input) {
  const { id, verdict, detail, tests, files } = input;
  return Object.freeze({
    id,
    verdict: verdict ?? 'NOT_RUN',
    passed: verdict === 'PASS',
    detail: detail ?? null,
    tests: tests ?? null,
    files: files ?? null,
  });
}

/**
 * §10: THE REGRESSION RECORD.
 *
 * It carries the two sections separately and computes NO combined verdict, so no reader can read a green
 * deterministic section as a statement about the live gates.
 */
export function regressionRecord(input = {}) {
  const results = Object.freeze((input.deterministic ?? []).map(suiteResult));
  const live = Object.freeze((input.live ?? []).map(suiteResult));
  const failed = results.filter((result) => result.verdict === 'FAIL');
  const notRun = results.filter((result) => result.verdict === 'NOT_RUN');
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A',
    kind: 'regression record',
    baseline: input.baseline ?? null,
    /** §10: the deterministic section. */
    deterministic: Object.freeze({
      declared: DETERMINISTIC_SUITES.map((suite) => suite.id),
      results,
      passed: results.filter((result) => result.passed).length,
      failed: Object.freeze(failed.map((result) => result.id)),
      notRun: Object.freeze(notRun.map((result) => result.id)),
      ALL_DETERMINISTIC_GREEN: failed.length === 0 && notRun.length === 0,
    }),
    /** §10: the live section, separate and never merged. */
    live: Object.freeze({
      declared: LIVE_GATES.map((gate) => gate.id),
      results: live,
      requiresModelRoute: true,
      /** §10: the disclosure, so the section cannot be read as a pass. */
      status: live.every((result) => result.verdict === 'PASS') ? 'ALL_PASSED' : 'DISCLOSED_NOT_ALL_PASSED',
      note: 'a live gate requires a model route; this stage does not enter primary execution, so its live gates remain disclosed rather than passed',
    }),
    /** §10: the separation, as a value a test can assert. */
    sectionsMerged: false,
    combinedVerdictComputed: false,
    law: 'live-gate results are kept separate from deterministic test results',
  });
}

/** §10: the historical evidence immutability check, from the prior stage's guard. */
export async function immutabilityRecord() {
  const { checkImmutability } = await import('../r3l0c/immutability.mjs');
  const guard = checkImmutability();
  return Object.freeze({
    id: 'HISTORICAL_EVIDENCE_IMMUTABILITY',
    verdict: guard.HISTORICAL_EVIDENCE_IMMUTABLE === 'PASS' ? 'PASS' : 'FAIL',
    detail: `protected namespaces: ${(guard.protectedNamespaces ?? []).length}; working files: ${String(guard.workingFileCount ?? 'UNKNOWN')}`,
    protectedNamespaces: Object.freeze([...(guard.protectedNamespaces ?? [])]),
    workingFileCount: guard.workingFileCount ?? null,
    restoreAvailable: guard.restoreAvailable,
    baselineRevision: guard.baselineRevision,
  });
}

export { NL, REPO_ROOT };
