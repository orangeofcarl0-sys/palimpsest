/**
 * R3-L0C-I-A-R-L §Final — THE REGRESSION RECORD.
 *
 * §Final lists the regressions to run and requires the live gates to stay in their own section, as the prior two
 * stages established: a live gate needs a model route, a deterministic suite does not, and reporting them in one
 * column would let a green deterministic run imply the live gates passed.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { NL } from './contract.mjs';

/** §Final: the deterministic suites this stage must run. */
export const DETERMINISTIC_SUITES = Object.freeze([
  Object.freeze({ id: 'TYPESCRIPT_BUILD', deterministic: true }),
  Object.freeze({ id: 'FULL_UNIT_SUITE', deterministic: true }),
  Object.freeze({ id: 'E2E', deterministic: true }),
  Object.freeze({ id: 'SECURITY', deterministic: true }),
  Object.freeze({ id: 'CONTAINMENT', deterministic: true }),
  Object.freeze({ id: 'WORK_LOOP', deterministic: true }),
  Object.freeze({ id: 'ANALYSIS', deterministic: true }),
  Object.freeze({ id: 'ARCHITECTURE_PUBLIC_API', deterministic: true }),
  Object.freeze({ id: 'R1_H_HR_HC_L', deterministic: true }),
  Object.freeze({ id: 'R3_S0_SYSTEMIC', deterministic: true }),
  Object.freeze({ id: 'R3_L0B_CONTAINMENT', deterministic: true }),
  Object.freeze({ id: 'R3_L0C_R', deterministic: true }),
  Object.freeze({ id: 'R3_L0C_F', deterministic: true }),
  Object.freeze({ id: 'R3_L0C_I', deterministic: true }),
  Object.freeze({ id: 'R3_L0C_IA', deterministic: true }),
  Object.freeze({ id: 'R3_L0C_IAR', deterministic: true }),
  Object.freeze({ id: 'R3_L0C_IAR_L', deterministic: true }),
  Object.freeze({ id: 'HISTORICAL_EVIDENCE_IMMUTABILITY', deterministic: true }),
]);

/** §Final: the live gates, kept separate because they need a model route. */
export const LIVE_GATES = Object.freeze([
  Object.freeze({ id: 'D2_LIVE', requiresModelRoute: true, thisStageRanIt: false }),
  Object.freeze({ id: 'D4_LIVE', requiresModelRoute: true, thisStageRanIt: false }),
  Object.freeze({ id: 'D5_LIVE', requiresModelRoute: true, thisStageRanIt: false }),
]);

/** §Final: a suite's result, with `NOT_RUN` distinguished from a failure. */
export function suiteResult(input) {
  const { id, verdict, detail, tests, files } = input;
  return Object.freeze({ id, verdict: verdict ?? 'NOT_RUN', passed: verdict === 'PASS', detail: detail ?? null, tests: tests ?? null, files: files ?? null });
}

/** §Final: the regression record, two sections, no combined verdict. */
export function regressionRecord(input = {}) {
  const results = Object.freeze((input.deterministic ?? []).map(suiteResult));
  const live = Object.freeze((input.live ?? []).map(suiteResult));
  const failed = results.filter((result) => result.verdict === 'FAIL');
  const notRun = results.filter((result) => result.verdict === 'NOT_RUN');
  return Object.freeze({
    schemaVersion: 1, stage: 'R3-L0C-I-A-R-L', kind: 'regression record', baseline: input.baseline ?? null,
    deterministic: Object.freeze({
      declared: DETERMINISTIC_SUITES.map((suite) => suite.id), results,
      passed: results.filter((result) => result.passed).length,
      failed: Object.freeze(failed.map((result) => result.id)),
      notRun: Object.freeze(notRun.map((result) => result.id)),
      ALL_DETERMINISTIC_GREEN: failed.length === 0 && notRun.length === 0,
    }),
    live: Object.freeze({
      declared: LIVE_GATES.map((gate) => gate.id), results, requiresModelRoute: true,
      status: live.every((result) => result.verdict === 'PASS') ? 'ALL_PASSED' : 'DISCLOSED_NOT_ALL_PASSED',
      note: 'a live gate requires a model route; this stage does not enter primary execution, so its live gates remain disclosed rather than passed',
    }),
    sectionsMerged: false,
    combinedVerdictComputed: false,
    law: 'live-gate results are kept separate from deterministic test results',
  });
}

/** §Final: the historical evidence immutability check, from the frozen guard. */
export async function immutabilityRecord() {
  const { checkImmutability } = await import('../r3l0c/immutability.mjs');
  const guard = checkImmutability();
  return Object.freeze({
    id: 'HISTORICAL_EVIDENCE_IMMUTABILITY',
    verdict: guard.HISTORICAL_EVIDENCE_IMMUTABLE === 'PASS' ? 'PASS' : 'FAIL',
    detail: `protected namespaces: ${(guard.protectedNamespaces ?? []).length}; working files: ${String(guard.workingFileCount ?? 'UNKNOWN')}`,
    protectedNamespaces: Object.freeze([...(guard.protectedNamespaces ?? [])]),
    workingFileCount: guard.workingFileCount ?? null,
    changed: Object.freeze([...(guard.changed ?? [])]),
    removed: Object.freeze([...(guard.removed ?? [])]),
    unexpectedAdditions: Object.freeze([...(guard.unexpectedAdditions ?? [])]),
    restoreAvailable: guard.restoreAvailable,
    baselineRevision: guard.baselineRevision,
  });
}

export { NL };
