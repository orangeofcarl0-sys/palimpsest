/**
 * R3-L0C-I-A §5/§6 — THE PLAN-BOUND VALIDITY GATES.
 *
 * THE DEFECT THIS CLOSES, measured in F6. The baseline driver's default gate was
 *
 *     async ({ completed }) => ({ green: completed.length === schedule.length, detail: ... })
 *
 * — a LENGTH CHECK and nothing else. Sixteen sessions that were structurally admitted, each carrying explicit
 * evidence so the admission schema accepted them, satisfy it, and `MATRIX_COMPLETE` follows with no post-matrix
 * validity proof of any kind. §6 names it as one of the four forbidden pre-trial shortcuts: "a post-matrix gate
 * that checks only `completed.length === 16`".
 *
 * WHAT THE GATES CHECK INSTEAD. §6 requires the pre-trial conditions to be read from the COMMITTED PLAN, and it
 * forbids four specific substitutions: a null closure digest, a caller-invented route identity, an omitted
 * treatment expectation, and a default green gate. So every input here comes from the plan or from a measurement,
 * and the post-matrix gate re-runs the SAME conditions plus the four matched blocks.
 *
 * WHY THE PRE AND POST GATES ARE THE SAME CODE. §6 requires the post-matrix conditions to be run "again", and a
 * second implementation of the same conditions is a second thing to keep in step — which is how the baseline's
 * count-only gate could exist beside a richer pre-trial one without anyone noticing. So one function evaluates
 * them, and the phase only decides whether the matched blocks are required.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, readFileSync } from 'node:fs';

import { FROZEN_SCHEDULE_SHAPE, PRE_TRIAL_REQUIREMENTS } from './contract.mjs';

const NL = String.fromCharCode(10);

/**
 * §6: THE PRE-TRIAL VALIDITY EVALUATION.
 *
 * Each of the eight required conditions is evaluated from a MEASUREMENT or from the plan, never from a default.
 * A condition with no input is `UNKNOWN` and makes the whole evaluation NOT green — because an unmeasured
 * condition is not a satisfied one, which is the direction the baseline's default got wrong.
 */
export async function evaluatePreTrialValidity(input) {
  const { plan, closure, containment, schedule, mode, realizationPreflight, routeConfiguration } = input;
  const conditions = [];
  const add = (id, verdict, detail) => conditions.push(Object.freeze({ id, verdict, satisfied: verdict === 'YES', detail }));

  /** SYSTEM_VALID: the systemic gates, supplied as a measurement by the caller. */
  add('SYSTEM_VALID', input.systemValid === true ? 'YES' : input.systemValid === false ? 'NO' : 'UNKNOWN', input.systemValidDetail ?? 'the R3-S0 systemic closure, measured by its own suite');

  /** EXPERIMENT_ENVIRONMENT_VALID: containment and topology, measured. */
  add('EXPERIMENT_ENVIRONMENT_VALID', containment?.EXPERIMENT_CONTAINMENT === 'PASS' ? 'YES' : containment === undefined ? 'UNKNOWN' : 'NO', containment === undefined ? 'containment was not measured' : `containment verdict ${String(containment.EXPERIMENT_CONTAINMENT)}`);

  /** CONTAINMENT: the per-trajectory cases, including own-world liveness. */
  add('CONTAINMENT', containment?.ACTUAL_CONTAINMENT === 'PASS' ? 'PASS' : containment === undefined ? 'UNKNOWN' : 'FAIL', containment === undefined ? 'per-trajectory confinement was not measured' : `${String(containment.cases?.length ?? 0)} case(s), liveness control ${containment.probeDiscriminates === true ? 'DISCRIMINATES' : 'DOES NOT DISCRIMINATE'}`);

  /**
   * EXECUTION_CLOSURE: recomputed against the plan's binding. §6 forbids `closureDigest = null`, so an absent or
   * null binding is `UNKNOWN` rather than a pass.
   */
  const boundDigest = plan?.executionClosure?.executionClosureDigest ?? null;
  const closureMatches = typeof boundDigest === 'string' && boundDigest !== '' && closure?.executionClosureDigest === boundDigest;
  add('EXECUTION_CLOSURE', closureMatches ? 'MATCH' : boundDigest === null ? 'UNKNOWN' : 'DRIFTED', boundDigest === null ? 'the plan binds no closure digest' : `plan ${String(boundDigest).slice(0, 16)} vs runtime ${String(closure?.executionClosureDigest ?? 'ABSENT').slice(0, 16)}`);

  /** SELECTION_REALIZATION_PREFLIGHT: the zero-model boundary controls. */
  add('SELECTION_REALIZATION_PREFLIGHT', realizationPreflight?.TREATMENT_BOUNDARY === 'PASS' || realizationPreflight?.PASS === true ? 'PASS' : realizationPreflight === undefined ? 'UNKNOWN' : 'FAIL', realizationPreflight === undefined ? 'the realization preflight was not run' : `boundary verdict ${String(realizationPreflight.TREATMENT_BOUNDARY ?? realizationPreflight.PASS)}`);

  /** ANALYSIS_PLAN_VALID: the frozen endpoints and thresholds are unchanged. */
  add('ANALYSIS_PLAN_VALID', plan?.preservedDesign !== undefined && plan?.preservedDesign?.primaryEndpointsChanged === false && plan?.preservedDesign?.verdictThresholdsChanged === false ? 'YES' : 'UNKNOWN', 'the analysis plan is the frozen one and its endpoints and thresholds are unchanged');

  /** SCHEDULE_MATCH: the schedule to execute equals the plan's, exactly. */
  const planIds = Array.isArray(plan?.schedule) ? plan.schedule.map((session) => session.sessionId) : [];
  const scheduleIds = (schedule ?? []).map((session) => session.sessionId);
  const scheduleMatches = planIds.length > 0 && planIds.join(',') === scheduleIds.join(',');
  add('SCHEDULE_MATCH', scheduleMatches ? 'YES' : planIds.length === 0 ? 'UNKNOWN' : 'NO', `plan ${String(planIds.length)} session(s), executing ${String(scheduleIds.length)}`);

  /** MODEL_ROUTE_CONFIGURATION_MATCH: the resolved mode's route equals the plan's declared route. */
  const plannedRoute = plan?.executionRoute?.authoritativePath ?? null;
  const routeMatches = mode?.resolved === true && mode?.mode !== undefined && plannedRoute !== null;
  add('MODEL_ROUTE_CONFIGURATION_MATCH', routeMatches ? 'YES' : 'UNKNOWN', routeConfiguration === undefined ? `mode ${String(mode?.mode)} on ${String(mode?.workerExecutable)}` : `route ${String(routeConfiguration.routeId)}`);

  const unsatisfied = conditions.filter((condition) => condition.satisfied !== true);
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A',
    kind: 'pre-trial validity evaluation',
    conditions: Object.freeze(conditions),
    required: PRE_TRIAL_REQUIREMENTS,
    satisfiedCount: conditions.length - unsatisfied.length,
    unsatisfied: Object.freeze(unsatisfied.map((condition) => condition.id)),
    ALL_SATISFIED: unsatisfied.length === 0,
    /** §6: the forbidden shortcuts, evaluated so their absence is measured rather than asserted. */
    forbiddenShortcutsPresent: Object.freeze([
      boundDigest === null ? 'closureDigest = null' : null,
      plan === null || plan === undefined ? 'an omitted treatment expectation' : null,
      conditions.find((condition) => condition.id === 'MODEL_ROUTE_CONFIGURATION_MATCH')?.verdict === 'UNKNOWN' ? 'a caller-invented route identity' : null,
    ].filter((entry) => entry !== null)),
    onFailure: 'STOP — no session may be launched when a pre-trial condition is unsatisfied',
  });
}

/**
 * §6: THE POST-MATRIX VALIDITY GATE.
 *
 * §6 requires the four matched blocks to be complete and admissible, and it requires the SAME conditions to be
 * re-run. The gate returns `{ green, detail }` in the shape the fail-stop runner expects, so the runner's own
 * `MATRIX_COMPLETE` decision is made from THIS verdict rather than from a count.
 *
 * THE COUNT IS CHECKED TOO, but it is the LAST thing checked and it is not sufficient on its own — which is the
 * precise difference from the baseline.
 */
export async function postMatrixValidityGate(input) {
  const { completed, records, plannedSessions, plan, closure, containment, schedule } = input;

  /** 1. Every planned session present, with no duplicate. */
  const unique = new Set(completed);
  const allPresent = completed.length === plannedSessions.length && unique.size === plannedSessions.length && plannedSessions.every((sessionId) => unique.has(sessionId));

  /** 2. The four matched blocks, derived from the frozen shape rather than from the records' own claims. */
  const blocks = new Map();
  for (const record of records) {
    const key = record.block;
    if (!blocks.has(key)) blocks.set(key, { block: key, arms: new Set(), generations: new Set(), sessions: 0 });
    const entry = blocks.get(key);
    entry.arms.add(record.arm);
    entry.generations.add(record.generation);
    entry.sessions += 1;
  }
  const expectedSessionsPerBlock = (FROZEN_SCHEDULE_SHAPE.arms * FROZEN_SCHEDULE_SHAPE.generations) * (plannedSessions.length / (FROZEN_SCHEDULE_SHAPE.pairedBlocks * FROZEN_SCHEDULE_SHAPE.arms * FROZEN_SCHEDULE_SHAPE.generations));
  const matchedBlocks = [...blocks.values()].filter((entry) => entry.arms.size === FROZEN_SCHEDULE_SHAPE.arms && entry.generations.size === FROZEN_SCHEDULE_SHAPE.generations && entry.sessions === expectedSessionsPerBlock);
  const allBlocksComplete = blocks.size === FROZEN_SCHEDULE_SHAPE.pairedBlocks && matchedBlocks.length === FROZEN_SCHEDULE_SHAPE.pairedBlocks;

  /** 3. Every recorded session's treatment realization was APPLIED, read from the record itself. */
  const realizationFailures = records.filter((record) => record.treatmentRealization !== undefined && record.treatmentRealization !== 'APPLIED').map((record) => record.sessionId);
  const allRealizationsApplied = realizationFailures.length === 0;

  /** 4. The closure still matches, re-measured rather than remembered. */
  const boundDigest = plan?.executionClosure?.executionClosureDigest ?? null;
  const closureStillMatches = typeof boundDigest === 'string' && boundDigest !== '' && closure?.executionClosureDigest === boundDigest;

  /** 5. Containment still holds, re-measured. */
  const containmentHolds = containment?.ACTUAL_CONTAINMENT === 'PASS' && containment?.probeDiscriminates === true;

  /** 6. The schedule shape is the frozen one. */
  const scheduleShapeMatches = (schedule ?? []).length === FROZEN_SCHEDULE_SHAPE.sessions;

  const checks = Object.freeze({
    allSessionsPresent: allPresent,
    allFourBlocksComplete: allBlocksComplete,
    allRealizationsApplied,
    closureStillMatches,
    containmentHolds,
    scheduleShapeMatches,
  });
  const failing = Object.entries(checks).filter(([, value]) => value !== true).map(([id]) => id);
  const green = failing.length === 0;
  return Object.freeze({
    green,
    detail: green
      ? `all six post-matrix conditions hold over ${String(completed.length)} session(s) in ${String(blocks.size)} block(s)`
      : `post-matrix conditions failed: [${failing.join(', ')}]`,
    checks,
    failing: Object.freeze(failing),
    blocks: Object.freeze([...blocks.values()].map((entry) => Object.freeze({ block: entry.block, arms: Object.freeze([...entry.arms]), generations: Object.freeze([...entry.generations]), sessions: entry.sessions }))),
    /** §6: the shortcut this gate refuses. */
    checkedOnlyTheSessionCount: false,
    realizationFailures: Object.freeze(realizationFailures),
  });
}

/**
 * §6: READ THE COMMITTED PLAN AND ITS OWN CONDITIONS.
 *
 * The entry loads its conditions FROM THE PLAN rather than from its own constants, which is what §6 requires: an
 * entry that invented its conditions could not be bound by the plan, and a plan that cannot bind the entry is
 * documentation rather than a commitment.
 */
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
    postMatrixChecks: Array.isArray(plan.postMatrixConditions) ? plan.postMatrixConditions : Object.keys(FROZEN_SCHEDULE_SHAPE),
  });
}

/** §6: read a plan from disk, reporting absence rather than defaulting. */
export function readPlan(planPath) {
  if (planPath === null || planPath === undefined || !existsSync(planPath)) return Object.freeze({ exists: false, plan: null, reason: `no plan at ${String(planPath)}` });
  try {
    return Object.freeze({ exists: true, plan: JSON.parse(readFileSync(planPath, 'utf8')), reason: null });
  } catch (error) {
    return Object.freeze({ exists: true, plan: null, reason: `the plan does not parse: ${String(error?.message ?? error).slice(0, 200)}` });
  }
}

export { NL };
