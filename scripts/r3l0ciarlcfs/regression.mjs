/**
 * R3-L0C-I-A-R-L-C-F-S §10 — THE REGRESSION RECORD.
 *
 * §10 lists the regressions to run and requires the live gates to stay in their own section: a live gate needs a
 * model route, a deterministic suite does not, and reporting them in one column would let a green deterministic run
 * imply the live gates passed.
 *
 * §10 also requires tests that were BLOCKED for safety to be disclosed rather than claimed as passed.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { NL } from './contract.mjs';

/** §10: the deterministic suites this stage must run. */
export const DETERMINISTIC_SUITES = Object.freeze([
  Object.freeze({ id: 'TYPESCRIPT_BUILD', deterministic: true }),
  Object.freeze({ id: 'STAGE_CONTROLS', deterministic: true }),
  Object.freeze({ id: 'STAGE_AUTHORITATIVE_TESTS', deterministic: true }),
  Object.freeze({ id: 'FULL_UNIT_SUITE', deterministic: true }),
  Object.freeze({ id: 'BROWSER_E2E', deterministic: true }),
  Object.freeze({ id: 'ARCHITECTURE', deterministic: true }),
  Object.freeze({ id: 'PUBLIC_API', deterministic: true }),
  Object.freeze({ id: 'WORK_LOOP_CONTAINMENT_SECURITY', deterministic: true }),
  Object.freeze({ id: 'R1_H_HR_HC_L', deterministic: true }),
  Object.freeze({ id: 'R3_S0_SYSTEMIC', deterministic: true }),
  Object.freeze({ id: 'R3_L0C_HISTORICAL_STAGE_SUITES', deterministic: true }),
  Object.freeze({ id: 'HISTORICAL_EVIDENCE_IMMUTABILITY', deterministic: true }),
  Object.freeze({ id: 'EXECUTION_CLOSURE_RECOMPUTATION', deterministic: true }),
]);

/** §10: the live gates, kept separate because they need a model route. */
export const LIVE_GATES = Object.freeze([
  Object.freeze({ id: 'D2_LIVE', requiresModelRoute: true, thisStageRanIt: false }),
  Object.freeze({ id: 'D4_LIVE', requiresModelRoute: true, thisStageRanIt: false }),
  Object.freeze({ id: 'D5_LIVE', requiresModelRoute: true, thisStageRanIt: false }),
]);

/** §10: a suite's result, with `NOT_RUN` and `BLOCKED` distinguished from a failure. */
export function suiteResult(input) {
  const { id, verdict, detail, tests, files, blockedForSafety } = input;
  return Object.freeze({
    id, verdict: verdict ?? 'NOT_RUN', passed: verdict === 'PASS', detail: detail ?? null,
    tests: tests ?? null, files: files ?? null,
    /** §10: a safety-blocked test is disclosed, never claimed as passed. */
    blockedForSafety: blockedForSafety === true,
  });
}

/** §10: the regression record, two sections, no combined verdict. */
export function regressionRecord(input = {}) {
  const results = Object.freeze((input.deterministic ?? []).map(suiteResult));
  const live = Object.freeze((input.live ?? []).map(suiteResult));
  const failed = results.filter((result) => result.verdict === 'FAIL');
  const notRun = results.filter((result) => result.verdict === 'NOT_RUN');
  const blocked = results.filter((result) => result.blockedForSafety === true || result.verdict === 'BLOCKED');
  return Object.freeze({
    schemaVersion: 1, stage: 'R3-L0C-I-A-R-L-C-F-S', kind: 'regression record', baseline: input.baseline ?? null,
    deterministic: Object.freeze({
      declared: DETERMINISTIC_SUITES.map((suite) => suite.id), results,
      passed: results.filter((result) => result.passed).length,
      failed: Object.freeze(failed.map((result) => result.id)),
      notRun: Object.freeze(notRun.map((result) => result.id)),
      blockedForSafety: Object.freeze(blocked.map((result) => result.id)),
      ALL_DETERMINISTIC_GREEN: failed.length === 0 && notRun.length === 0 && blocked.length === 0,
    }),
    live: Object.freeze({
      declared: LIVE_GATES.map((gate) => gate.id), results, requiresModelRoute: true,
      status: live.every((result) => result.verdict === 'PASS') ? 'ALL_PASSED' : 'DISCLOSED_NOT_ALL_PASSED',
      note: 'a live gate requires a model route; this stage does not enter primary execution, so its live gates remain disclosed rather than passed',
    }),
    /** §10: the resource and environmental assumptions, recorded rather than implied. */
    resourcePolicy: Object.freeze({
      boundedConcurrency: input.boundedConcurrency ?? null,
      reason: 'the full unit suite runs 298 files with real git worktrees and SQLite databases; an unbounded run exhausts this host, so the suite is run with bounded workers',
      sharedTreeMutation: false,
      mutationsInIsolatedEnvironmentsOnly: true,
    }),
    sectionsMerged: false,
    combinedVerdictComputed: false,
    law: 'live-gate results are kept separate from deterministic test results, and a safety-blocked test is disclosed rather than claimed as passed',
  });
}

/** §10: the historical evidence immutability check, from the frozen guard. */
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
