/**
 * R3-L0C-I-A-R §1 — THE EIGHT ACTUAL ESCAPED-BOUNDARY FALSIFIERS.
 *
 * §1 requires each defect this stage corrects to be MEASURED against `dbe6beb` and to FAIL against it. This
 * module runs the measurements in `baseline/legacy-activation.mjs` and reports, per defect, the observation and
 * whether the defect is present.
 *
 * WHAT "FAIL AGAINST THE BASELINE" MEANS HERE. The falsifier is a property the repaired implementation must
 * satisfy, and against `dbe6beb` the property is VIOLATED. So each entry reports `PROPERTY_VIOLATED_BY_BASELINE`
 * with the evidence that violates it, and the repaired implementation is measured against the SAME property by the
 * acceptance suite. That is what makes the two halves commensurable rather than two different tests.
 *
 * THE FALSIFIERS ARE COMMITTED BEFORE THE REPAIRS. §1's discipline, inherited from R3-L0C-I-A §1 and R3-L0C-F §16,
 * is that the commit order is the evidence: freeze the falsifiers, then repair.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  BASELINE_SOURCE,
  legacyAdmissionGap,
  legacyAttribution,
  legacyBooleanAuthorization,
  legacyDescendantExitClassification,
  legacyPostMatrixGate,
  legacyPreTrialReducer,
  legacyPrepareBeforeClaim,
  legacyRouteIdentity,
  legacyUptakeCollapse,
} from './baseline/legacy-activation.mjs';

const NL = String.fromCharCode(10);

/** §1: the healthy pre-trial inputs, so the reducer is measured with every real condition satisfied. */
export function healthyPreTrialInputs(input) {
  const { schedule, closure, containment } = input;
  return Object.freeze({
    plan: Object.freeze({
      planId: 'r3-l0c-ia-primary-plan',
      schedule,
      executionClosure: Object.freeze({ executionClosureDigest: closure.executionClosureDigest }),
      executionRoute: Object.freeze({ authoritativePath: 'r3-l0c-ia-primary-plan', routeId: 'omnigate2api-deepseek-v41-flash', providerId: 'omnigate-route', modelId: 'deepseek-v4.1-flash' }),
      authorizationRequired: Object.freeze({ required: true }),
      preservedDesign: Object.freeze({ primaryEndpointsChanged: false, verdictThresholdsChanged: false }),
    }),
    closure,
    containment,
    schedule,
    mode: Object.freeze({ resolved: true, mode: 'DETERMINISTIC', workerExecutable: 'scripts/r3l0cia/scriptar-worker.mjs' }),
    realizationPreflight: Object.freeze({ TREATMENT_BOUNDARY: 'PASS' }),
    systemValid: true,
    systemValidDetail: 'the R3-S0 systemic closure, measured by its own suite',
  });
}

/** §1: the transcript fixtures G5 needs, so the three telemetry cases are the same bytes each run. */
export function uptakeFixtures() {
  const dir = mkdtempSync(join(tmpdir(), 'r3l0ciar-g5-'));
  const paths = {
    NO_TELEMETRY_LINE: join(dir, 'no-line.txt'),
    EXPLICIT_ZERO_PULLS: join(dir, 'explicit-zero.txt'),
    MALFORMED_TELEMETRY_LINE: join(dir, 'malformed.txt'),
  };
  writeFileSync(paths.NO_TELEMETRY_LINE, `PALIMPSEST_WORK_RESULT ${JSON.stringify({ kind: 'READY_FOR_SETTLEMENT', summary: 'done' })}${NL}`, 'utf8');
  writeFileSync(paths.EXPLICIT_ZERO_PULLS, `PALIMPSEST_WORKER_PULL ${JSON.stringify({ pulled: [] })}${NL}`, 'utf8');
  writeFileSync(paths.MALFORMED_TELEMETRY_LINE, `PALIMPSEST_WORKER_PULL {not json${NL}`, 'utf8');
  return Object.freeze({ dir, paths: Object.freeze(paths) });
}

/**
 * §1: RUN ALL EIGHT FALSIFIERS AGAINST `dbe6beb`.
 *
 * The result is this stage's record of what was wrong, and it is what the repairs are checked against: each entry
 * names the property, and the repaired implementation must satisfy the SAME property.
 */
export async function runCorrectionFalsifiers(input) {
  const { schedule, closure, containment, trajectoryIds } = input;
  const healthy = healthyPreTrialInputs({ schedule, closure, containment });
  const fixtures = uptakeFixtures();
  const report = Object.freeze({ governedPulls: Object.freeze([]) });
  try {
    const g1 = await legacyPrepareBeforeClaim({ trajectoryIds });
    const g2 = await legacyPreTrialReducer({ healthy });
    const g3 = await legacyRouteIdentity({
      driftedRoute: healthy,
      effectiveRoute: Object.freeze({ providerId: 'some-other-provider', modelId: 'some-other-model', settingsDigest: 'drifted' }),
      plannedRoute: Object.freeze({ providerId: 'omnigate-route', modelId: 'deepseek-v4.1-flash' }),
    });
    const g4 = await legacyAdmissionGap({});
    const g5 = await legacyUptakeCollapse({ report, paths: fixtures.paths });
    const g6 = await legacyAttribution({});
    const g7 = await legacyPostMatrixGate({ schedule, plan: healthy.plan, closure, containment });
    const g8a = legacyDescendantExitClassification({ timedOut: true, workerFinished: true });
    const g8b = await legacyBooleanAuthorization();

    const falsifiers = Object.freeze([
      withViolation(g1, g1.mutatedBeforeClaim === true),
      withViolation(g2, g2.ALL_SATISFIED_withAllEightHealthy === false),
      withViolation(g3, g3.conditionSatisfied === true && g3.identitiesCompared.length === 0),
      withViolation(g4, g4.fiveEvidenceCarryingControlsAdmitted === true),
      withViolation(g5, g5.missingAndZeroIndistinguishable === true && g5.malformedAlsoBecomesZero === true),
      withViolation(g6, g6.attributed === true && g6.identityFieldsCorroborated.length === 0),
      withViolation(g7, g7.greenWithAllRealizationsUndefined === true),
      withViolation({ ...g8a, id: 'G8_TIMEOUT_RESULT_LINE_AS_EXIT' }, g8a.defectPresent === true),
      withViolation(g8b, g8b.booleanTreatedAsAuthorizationDecision === true),
    ]);
    const violated = falsifiers.filter((entry) => entry.PROPERTY_VIOLATED_BY_BASELINE === true);
    return Object.freeze({
      schemaVersion: 1,
      stage: 'R3-L0C-I-A-R',
      kind: 'escaped-boundary falsifiers against the R3-L0C-I-A baseline',
      baseline: BASELINE_SOURCE.revision,
      source: BASELINE_SOURCE,
      falsifiers,
      declaredDefects: 8,
      /** G8 is two properties (exit classification and authorization), so the count is 9 measurements over 8 defects. */
      measuredProperties: falsifiers.length,
      PROPERTIES_VIOLATED_BY_BASELINE: violated.length,
      ALL_PROPERTIES_VIOLATED_BY_BASELINE: violated.length === falsifiers.length,
      violated: Object.freeze(violated.map((entry) => entry.id)),
      notViolated: Object.freeze(falsifiers.filter((entry) => entry.PROPERTY_VIOLATED_BY_BASELINE !== true).map((entry) => entry.id)),
      modelCallsMade: 0,
      law: 'each falsifier names a property the repaired implementation must satisfy; against dbe6beb the property is violated',
    });
  } finally {
    try { rmSync(fixtures.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
  }
}

/** Attach the violation verdict, so every entry has the same shape. */
function withViolation(entry, violated) {
  return Object.freeze({ ...entry, PROPERTY_VIOLATED_BY_BASELINE: violated === true });
}

export { NL, tmpdir };
