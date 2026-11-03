/**
 * R3-L0C-I-A-R §3/§7 — THE PRE-TRIAL VALIDITY REDUCER AND THE POST-MATRIX CAUSAL GATE.
 *
 * THE TWO DEFECTS THESE CLOSE, measured in G2, G3 and G7.
 *
 * G2. R3-L0C-I-A's reducer wrote `satisfied: verdict === 'YES'`, but three conditions legitimately report other
 * verdicts — CONTAINMENT (`PASS`), EXECUTION_CLOSURE (`MATCH`) and SELECTION_REALIZATION_PREFLIGHT (`PASS`) — so
 * `ALL_SATISFIED` was permanently false, and `activation.mjs:447` ran the pre-exposure checks WITHOUT requiring
 * it. A permanently-false gate that nothing consults is not a gate. The repair is an explicit condition-specific
 * success mapping into an internal PASS / FAIL / NOT_EVALUATED vocabulary, and the activation now REQUIRES
 * `ALL_SATISFIED === true` before exposure.
 *
 * G3. `MODEL_ROUTE_CONFIGURATION_MATCH` tested only that a mode resolved and that the plan carried an
 * authoritative-path STRING. It read no provider, model, route or settings identity, so a drifted effective route
 * was reported as a match. The repair compares the ACTUAL effective identities against the plan.
 *
 * G7. The post-matrix gate skipped a record whose realization was `undefined` (`!== undefined &&`), and checked
 * none of trajectory legitimacy, telemetry interpretability, system/environment validity, route match, analysis
 * plan invariance or zero replacements. The repair requires all NINE conditions mechanically, and every failure
 * yields the interrupted-matrix verdicts.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, readFileSync } from 'node:fs';

import {
  CONDITION_SUCCESS,
  CONDITION_VOCABULARY,
  FROZEN_SCHEDULE_SHAPE,
  INTERRUPTED_MATRIX_VERDICTS,
  POST_MATRIX_CONDITIONS,
  PRE_TRIAL_REQUIREMENTS,
} from './contract.mjs';

const NL = String.fromCharCode(10);

/** §3: map one condition's observed value into the internal PASS / FAIL / NOT_EVALUATED vocabulary. */
export function conditionOutcome(conditionId, observed) {
  const mapping = CONDITION_SUCCESS[conditionId];
  if (mapping === undefined) return Object.freeze({ verdict: 'NOT_EVALUATED', detail: `no success mapping is declared for ${conditionId}` });
  const value = observed === null || observed === undefined ? null : String(observed);
  if (value === null) return Object.freeze({ verdict: 'NOT_EVALUATED', detail: `no value was observed for ${conditionId}` });
  if (mapping.pass.includes(value)) return Object.freeze({ verdict: 'PASS', detail: `${conditionId} observed ${value}` });
  if (mapping.fail.includes(value)) return Object.freeze({ verdict: 'FAIL', detail: `${conditionId} observed ${value}` });
  return Object.freeze({ verdict: 'NOT_EVALUATED', detail: `${conditionId} observed ${value}, which is neither a declared success nor a declared failure` });
}

/* ================================================================ §3 the pre-trial reducer */

/**
 * §3: THE PRE-TRIAL VALIDITY EVALUATION.
 *
 * Each condition is evaluated from a MEASUREMENT or from the plan, mapped through `CONDITION_SUCCESS` into the
 * internal vocabulary, and only `PASS` is satisfied. `NOT_EVALUATED` is NEVER satisfied — an unmeasured condition
 * is not a satisfied one, which is the direction the R3-L0C-I-A default got wrong.
 */
export async function evaluatePreTrialValidity(input) {
  const { plan, closure, containment, schedule, mode, realizationPreflight, routeConfiguration } = input;
  const conditions = [];
  const add = (id, observed, detail) => {
    const outcome = conditionOutcome(id, observed);
    conditions.push(Object.freeze({
      id,
      observed: observed === undefined ? null : observed,
      verdict: outcome.verdict,
      satisfied: outcome.verdict === 'PASS',
      detail: detail ?? outcome.detail,
    }));
  };

  /** SYSTEM_VALID: the systemic gates, supplied as a measurement by the caller. */
  add('SYSTEM_VALID', input.systemValid === true ? 'PASS' : input.systemValid === false ? 'FAIL' : null, input.systemValidDetail ?? 'the R3-S0 systemic closure, measured by its own suite');
  /** EXPERIMENT_ENVIRONMENT_VALID: containment and topology, measured. */
  const environmentObserved = containment?.EXPERIMENT_ENVIRONMENT_VALID ?? containment?.EXPERIMENT_CONTAINMENT ?? null;
  add('EXPERIMENT_ENVIRONMENT_VALID', environmentObserved, containment === undefined ? 'containment was not measured' : `environment verdict ${String(environmentObserved)}`);
  /** CONTAINMENT: the per-trajectory cases, including own-world liveness. */
  add('CONTAINMENT', containment?.ACTUAL_CONTAINMENT ?? null, containment === undefined ? 'per-trajectory confinement was not measured' : `${String(containment.cases?.length ?? 0)} case(s), liveness control ${containment.probeDiscriminates === true ? 'DISCRIMINATES' : 'DOES NOT DISCRIMINATE'}`);

  /**
   * EXECUTION_CLOSURE: recomputed against the plan's binding. An absent or null binding is NOT_EVALUATED rather
   * than a pass, which is what §6's forbidden `closureDigest = null` would have produced.
   */
  const boundDigest = plan?.executionClosure?.executionClosureDigest ?? null;
  const closureObserved = typeof boundDigest === 'string' && boundDigest !== '' ? (closure?.executionClosureDigest === boundDigest ? 'MATCH' : 'DRIFTED') : null;
  add('EXECUTION_CLOSURE', closureObserved, boundDigest === null ? 'the plan binds no closure digest' : `plan ${String(boundDigest).slice(0, 16)} vs runtime ${String(closure?.executionClosureDigest ?? 'ABSENT').slice(0, 16)}`);

  /** SELECTION_REALIZATION_PREFLIGHT: the zero-model boundary controls. */
  add('SELECTION_REALIZATION_PREFLIGHT', realizationPreflight === undefined ? null : (realizationPreflight.TREATMENT_BOUNDARY ?? (realizationPreflight.PASS === true ? 'PASS' : realizationPreflight.PASS === false ? 'FAIL' : null)), realizationPreflight === undefined ? 'the realization preflight was not run' : `boundary verdict ${String(realizationPreflight.TREATMENT_BOUNDARY ?? realizationPreflight.PASS)}`);

  /** ANALYSIS_PLAN_VALID: the frozen endpoints and thresholds are unchanged. */
  add('ANALYSIS_PLAN_VALID', plan?.preservedDesign !== undefined ? (plan.preservedDesign.primaryEndpointsChanged === false && plan.preservedDesign.verdictThresholdsChanged === false ? 'PASS' : 'FAIL') : null, 'the analysis plan is the frozen one and its endpoints and thresholds are unchanged');

  /** SCHEDULE_MATCH: the schedule to execute equals the plan's, exactly. */
  const planIds = Array.isArray(plan?.schedule) ? plan.schedule.map((session) => session.sessionId) : [];
  const scheduleIds = (schedule ?? []).map((session) => session.sessionId);
  add('SCHEDULE_MATCH', planIds.length === 0 ? null : (planIds.join(',') === scheduleIds.join(',') ? 'MATCH' : 'MISMATCH'), `plan ${String(planIds.length)} session(s), executing ${String(scheduleIds.length)}`);

  /**
   * MODEL_ROUTE_CONFIGURATION_MATCH: THE ACTUAL EFFECTIVE IDENTITIES VERSUS THE PLAN.
   *
   * This is the G3 repair. It reads the resolved mode's effective provider, model, route id and settings digest
   * and compares each against the plan's declared route. A missing effective identity is `UNKNOWN` (a failure, not
   * a pass), and any mismatch is `DRIFTED`.
   */
  const plannedRoute = plan?.executionRoute ?? null;
  const effective = routeConfiguration?.effective ?? null;
  const compared = [];
  let routeObserved = null;
  if (plannedRoute === null) {
    routeObserved = null;
  } else if (effective === null || effective === undefined) {
    routeObserved = 'UNKNOWN';
  } else {
    for (const field of ['providerId', 'modelId', 'routeId']) {
      const planned = plannedRoute[field] ?? null;
      const actual = effective[field] ?? null;
      const matches = planned !== null && actual !== null && String(planned) === String(actual);
      compared.push(Object.freeze({ field, planned, actual, matches }));
    }
    const settingsMatches = plannedRoute.settingsDigest === undefined || effective.settingsDigest === undefined ? null : plannedRoute.settingsDigest === effective.settingsDigest;
    if (settingsMatches !== null) compared.push(Object.freeze({ field: 'settingsDigest', planned: plannedRoute.settingsDigest, actual: effective.settingsDigest, matches: settingsMatches }));
    const anyUnknown = compared.some((entry) => entry.planned === null || entry.actual === null);
    routeObserved = anyUnknown ? 'UNKNOWN' : compared.every((entry) => entry.matches === true) ? 'MATCH' : 'DRIFTED';
  }
  add('MODEL_ROUTE_CONFIGURATION_MATCH', routeObserved, routeObserved === null ? 'the plan declares no execution route' : `effective route ${String(effective?.providerId ?? 'ABSENT')}/${String(effective?.modelId ?? 'ABSENT')} compared against the plan`);

  const unsatisfied = conditions.filter((condition) => condition.satisfied !== true);
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R',
    kind: 'pre-trial validity evaluation',
    vocabulary: CONDITION_VOCABULARY,
    conditions: Object.freeze(conditions),
    required: PRE_TRIAL_REQUIREMENTS,
    routeIdentityComparison: Object.freeze(compared),
    satisfiedCount: conditions.length - unsatisfied.length,
    unsatisfied: Object.freeze(unsatisfied.map((condition) => condition.id)),
    ALL_SATISFIED: unsatisfied.length === 0,
    /** §3: the forbidden shortcuts, evaluated so their absence is measured rather than asserted. */
    forbiddenShortcutsPresent: Object.freeze([
      boundDigest === null ? 'closureDigest = null' : null,
      plan === null || plan === undefined ? 'an omitted treatment expectation' : null,
      /**
       * §3: the G3 shortcut is a route DECLARED but never compared — not a route that could not be read. An
       * unreadable identity is `UNKNOWN`, which is its own fact and is reported as such by `modelRouteIdentity`.
       */
      plannedRoute !== null && plannedRoute !== undefined && compared.length === 0 ? 'a caller-invented route identity, declared but never compared against an effective route' : null,
    ].filter((entry) => entry !== null)),
    onFailure: 'STOP — no session may be launched when a pre-trial condition is unsatisfied',
  });
}

/** §3: the model-route verdict, named for the final report. */
export function modelRouteIdentity(evaluation) {
  const condition = evaluation.conditions.find((entry) => entry.id === 'MODEL_ROUTE_CONFIGURATION_MATCH');
  return condition?.verdict === 'PASS' ? 'MATCH' : condition?.verdict === 'FAIL' ? 'DRIFTED' : 'UNKNOWN';
}

/* ================================================================ §7 the post-matrix gate */

/**
 * §7: THE POST-MATRIX CAUSAL GATE.
 *
 * NINE conditions, all required. A complete schedule is not enough: the trajectories must be legitimate, the
 * treatment must have been APPLIED for every session (an `undefined` realization is a FAILURE, not a skip), the
 * uptake and cost telemetry must be interpretable, the system and environment must still be valid, the closure and
 * route must still match, the analysis plan must be unchanged, and there must be zero replacements or retries.
 */
export async function postMatrixValidityGate(input) {
  const {
    completed, records, plannedSessions, plan, closure, containment, schedule,
    systemValid = null, environmentValid = null, costAttribution = null, routeConfiguration = null,
    analysisPlanUnchanged = null, replacements = 0, retries = 0, expectedTrajectoryCount = FROZEN_SCHEDULE_SHAPE.trajectories,
  } = input;

  /** 1. Every planned session present, uniquely. */
  const unique = new Set(completed);
  const allPresent = completed.length === plannedSessions.length && unique.size === plannedSessions.length && plannedSessions.every((sessionId) => unique.has(sessionId));

  /** 2. Exactly eight legitimate trajectories, all from the schedule. */
  const scheduledTrajectories = new Set((schedule ?? []).map((session) => session.trajectoryId));
  const recordTrajectories = new Set(records.map((record) => record.trajectoryId));
  const eightLegitimateTrajectories = recordTrajectories.size === expectedTrajectoryCount
    && [...recordTrajectories].every((trajectoryId) => scheduledTrajectories.has(trajectoryId));

  /** 3. The four matched blocks, derived from the frozen shape. */
  const blocks = new Map();
  for (const record of records) {
    const key = record.block;
    if (!blocks.has(key)) blocks.set(key, { block: key, arms: new Set(), generations: new Set(), sessions: 0 });
    const entry = blocks.get(key);
    entry.arms.add(record.arm);
    entry.generations.add(record.generation);
    entry.sessions += 1;
  }
  const expectedSessionsPerBlock = FROZEN_SCHEDULE_SHAPE.arms * FROZEN_SCHEDULE_SHAPE.generations;
  const matchedBlocks = [...blocks.values()].filter((entry) => entry.arms.size === FROZEN_SCHEDULE_SHAPE.arms && entry.generations.size === FROZEN_SCHEDULE_SHAPE.generations && entry.sessions === expectedSessionsPerBlock);
  const allFourBlocksComplete = blocks.size === FROZEN_SCHEDULE_SHAPE.pairedBlocks && matchedBlocks.length === FROZEN_SCHEDULE_SHAPE.pairedBlocks;

  /** 4. Every realization APPLIED — an undefined one is a FAILURE, not a skip (the G7 repair). */
  const realizationFailures = records.filter((record) => record.treatmentRealization !== 'APPLIED').map((record) => record.sessionId);
  const everyTreatmentApplied = realizationFailures.length === 0;

  /**
   * 5. Uptake telemetry interpretable for every session.
   *
   * The signal is `workerUptakeCount !== null`, which is what the repaired adapter produces: it carries `null`
   * when the worker layer's provenance is not an OBSERVED one, so a missing or malformed telemetry line cannot be
   * read as a measured zero here either.
   */
  const uninterpretableUptake = records.filter((record) => record.workerUptakeCount === null || record.workerUptakeCount === undefined).map((record) => record.sessionId);
  const uptakeTelemetryInterpretable = uninterpretableUptake.length === 0;

  /**
   * 6. Cost telemetry interpretable — the ATTRIBUTION MACHINERY accounts for every planned session.
   *
   * The mechanical condition is that every session is either measured or carries an EXPLICIT, labelled absence, so
   * the coverage is interpretable. Whether those records are genuine primary observations is a different question,
   * decided by the causal-admission rule below: a deterministic run produces no DSH session artifacts at all, so
   * requiring live records HERE would make the mechanical gate permanently red and hide the machinery's behaviour.
   */
  const costTelemetryInterpretable = costAttribution === null ? false : costAttribution.interpretable === true && costAttribution.rejectedCount === 0;
  /** §6: the cost provenance, so a fixture measurement is never read as a live causal observation. */
  const costProvenance = costAttribution?.allSixteenLivePrimary === true ? 'LIVE_PRIMARY'
    : costAttribution?.livePrimaryCount === plannedSessions.length ? 'LIVE_PRIMARY'
      : costAttribution?.fixtureCount === plannedSessions.length ? 'FIXTURE'
        : costAttribution?.absentCount === plannedSessions.length ? 'ABSENT'
          : costAttribution === null ? 'ABSENT' : 'MIXED_OR_PARTIAL';

  /** 7. System and environment validity still established. */
  const systemEnvironmentValid = systemValid === 'PASS' && environmentValid === 'PASS';

  /** 8. The closure and the effective route still match the plan. */
  const boundDigest = plan?.executionClosure?.executionClosureDigest ?? null;
  const closureStillMatches = typeof boundDigest === 'string' && boundDigest !== '' && closure?.executionClosureDigest === boundDigest;
  const routeStillMatches = routeConfiguration === null ? false : routeConfiguration.MODEL_ROUTE_IDENTITY === 'MATCH';
  const closureAndRouteMatch = closureStillMatches && routeStillMatches;

  /** 9. The analysis plan is unchanged, and no session was replaced or retried. */
  const analysisPlanUnchangedAndNoReplacements = analysisPlanUnchanged === true && replacements === 0 && retries === 0;

  const checks = Object.freeze({
    allSessionsPresent: allPresent,
    eightLegitimateTrajectories,
    allFourBlocksComplete,
    everyTreatmentApplied,
    uptakeTelemetryInterpretable,
    costTelemetryInterpretable,
    systemEnvironmentValid,
    closureAndRouteMatch,
    analysisPlanUnchangedAndNoReplacements,
  });
  const failing = Object.entries(checks).filter(([, value]) => value !== true).map(([id]) => id);
  const green = failing.length === 0;
  /**
   * §6/§7: A GREEN GATE OVER FIXTURE COST DATA IS NOT A LIVE CAUSAL ADMISSION.
   *
   * The nine conditions are MECHANICAL: they hold over whatever cost measurement was supplied. The CAUSAL verdict
   * additionally requires that the cost records be genuine primary observations, so a deterministic run whose
   * cost attribution is labelled FIXTURE passes the gate and still yields CAUSAL_EXPERIMENT_VALID = NO. That is
   * what keeps a fixture measurement from being read as a model observation.
   */
  const livePrimaryCost = costProvenance === 'LIVE_PRIMARY';
  return Object.freeze({
    green,
    detail: green
      ? `all nine post-matrix conditions hold over ${String(completed.length)} session(s) in ${String(blocks.size)} block(s)`
      : `post-matrix conditions failed: [${failing.join(', ')}]`,
    checks,
    failing: Object.freeze(failing),
    requiredConditions: POST_MATRIX_CONDITIONS.map((entry) => entry.id),
    blocks: Object.freeze([...blocks.values()].map((entry) => Object.freeze({ block: entry.block, arms: Object.freeze([...entry.arms]), generations: Object.freeze([...entry.generations]), sessions: entry.sessions }))),
    checkedOnlyTheSessionCount: false,
    realizationFailures: Object.freeze(realizationFailures),
    uninterpretableUptake: Object.freeze(uninterpretableUptake),
    costProvenance,
    /** §7: every failed input yields the interrupted-matrix verdicts. */
    causalAdmission: green && livePrimaryCost
      ? Object.freeze({ CAUSAL_EXPERIMENT_VALID: 'YES', RECONSTRUCTION_COMPRESSION: 'EVALUABLE', NET_COGNITIVE_COST: 'EVALUABLE' })
      : Object.freeze({
        ...INTERRUPTED_MATRIX_VERDICTS,
        ...(green && !livePrimaryCost ? { note: 'the gate is mechanically green but the cost attribution is not a live primary observation, so the causal verdict is NOT_EVALUABLE' } : {}),
      }),
  });
}

/** §7: the causal verdicts a gate result implies. */
export function causalAdmissionFrom(gate) {
  return gate.causalAdmission ?? INTERRUPTED_MATRIX_VERDICTS;
}

/** §3/§7: read a plan from disk, reporting absence rather than defaulting. */
export function readPlan(planPath) {
  if (planPath === null || planPath === undefined || !existsSync(planPath)) return Object.freeze({ exists: false, plan: null, reason: `no plan at ${String(planPath)}` });
  try {
    return Object.freeze({ exists: true, plan: JSON.parse(readFileSync(planPath, 'utf8')), reason: null });
  } catch (error) {
    return Object.freeze({ exists: true, plan: null, reason: `the plan does not parse: ${String(error?.message ?? error).slice(0, 200)}` });
  }
}

/** §3: the plan's own conditions, so an entry that invented its conditions could not be bound by the plan. */
export function planConditions(plan) {
  if (plan === null || plan === undefined) return Object.freeze({ available: false, reason: 'no plan was supplied' });
  return Object.freeze({
    available: true,
    planId: plan.planId ?? null,
    scheduleLength: Array.isArray(plan.schedule) ? plan.schedule.length : 0,
    closureDigest: plan.executionClosure?.executionClosureDigest ?? null,
    authorizationRequired: plan.authorizationRequired?.required === true,
    route: plan.executionRoute ?? null,
    preTrialRequirements: Array.isArray(plan.preTrialConditions) ? plan.preTrialConditions : PRE_TRIAL_REQUIREMENTS,
    postMatrixChecks: Array.isArray(plan.postMatrixConditions) ? plan.postMatrixConditions : POST_MATRIX_CONDITIONS.map((entry) => entry.id),
  });
}

export { NL };
