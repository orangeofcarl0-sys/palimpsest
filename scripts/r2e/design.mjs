/**
 * R2-E §6/§14/§18/§24 — THE FROZEN EFFICACY DESIGN.
 *
 * §14 requires five randomized blocks per scenario, each containing E0 and E1, in an order derived from ONE
 * FROZEN DETERMINISTIC SEED. The seed lives HERE as a literal and the ordering is derived from it, so a
 * hand-edited schedule would show up as a diff to this file rather than as an unremarkable change.
 *
 * §18: THE VERDICT CRITERIA ARE DEFINED HERE, BEFORE ANY TRIAL RUNS, so the decision cannot be made after
 * seeing which criteria the data would satisfy.
 *
 * R2-E IS AN EFFICACY STAGE, NOT AN AFFORDANCE STAGE. It deliberately removes voluntary uptake as a
 * variable: E1 capital is delivered through the governed pull channel by the host, so "did the worker
 * choose to pull" is no longer part of the comparison. §20 forbids optimizing uptake here, and §19 forbids
 * splitting the capital kinds into separate arms.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

/** §14: the ONE frozen seed. Never changed after the first trial exists. */
export const PROTOCOL_SEED = 0x52_45_02_01;

/** §6: the two primary conditions. */
export const CONDITIONS = Object.freeze(['E0', 'E1']);

/** §6: what each arm is, stated as data so a report can name it without re-deriving. */
export const ARMS = Object.freeze({
  E0: 'no inherited capital — the control presentation, same section boundary, no capital of any kind',
  E1: 'governed capital consumed — Proof + Reasoning + Procedure materialized through the attempt-bound pull channel before the first engineering turn',
});

/** §14: 2 scenarios × 2 conditions × 5 repetitions = 20 primary trials. */
export const REPETITIONS = 5;
export const SCENARIO_IDS = Object.freeze(['C', 'D']);
export const EXPECTED_TRIALS = SCENARIO_IDS.length * CONDITIONS.length * REPETITIONS;

/**
 * §14: the per-block condition ordering, derived from the frozen seed.
 *
 * xorshift32 seeded with `PROTOCOL_SEED` XORed with a per-scenario term, so the two scenarios get
 * DIFFERENT permutations rather than the same one five times.
 */
export function blockOrder(blocks, scenarioId = '') {
  let state = (PROTOCOL_SEED ^ (scenarioId === 'D' ? 0x00_d0_d0_00 : 0x00_c0_c0_00)) >>> 0;
  const next = () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
  const out = [];
  for (let block = 0; block < blocks; block += 1) {
    const order = [...CONDITIONS];
    for (let index = order.length - 1; index > 0; index -= 1) {
      const swap = next() % (index + 1);
      [order[index], order[swap]] = [order[swap], order[index]];
    }
    out.push(Object.freeze({ block, order: Object.freeze(order) }));
  }
  return Object.freeze(out);
}

/** The full 20-trial schedule, as data, so the executed plan can be compared against the frozen one. */
export function trialPlan(repetitions = REPETITIONS, scenarioIds = SCENARIO_IDS) {
  const trials = [];
  for (const scenarioId of scenarioIds) {
    for (const block of blockOrder(repetitions, scenarioId)) {
      for (const condition of block.order) {
        trials.push(Object.freeze({ scenarioId, block: block.block, repetition: block.block, condition }));
      }
    }
  }
  return Object.freeze(trials);
}

/* ---------------------------------------------------------------- §18 the verdict, defined in advance */

/** §18/§27: the pre-declared efficacy verdicts. */
export const EFFICACY_VERDICTS = Object.freeze({
  REPLICATED: 'R2-E CAPITAL EFFICACY: REPLICATED',
  PARTIAL: 'R2-E CAPITAL EFFICACY: PARTIAL',
  NOT_OBSERVED: 'R2-E CAPITAL EFFICACY: NOT_OBSERVED',
});

/**
 * §18: `directionalBenefit` per scenario, exactly as pre-declared:
 *
 *     E1 repeats the pre-paid mistake LESS often than E0
 *     AND E1's mechanical outcome is not worse than E0's
 *
 * with the additional §9 requirement that every ANALYSED E1 trial actually consumed its capital. A trial
 * whose prework did not materialize every selected handle is excluded from the analysis and reported as
 * EFFICACY_PRECONDITION_NOT_MET, because counting it would attribute to capital a run where capital never
 * arrived.
 *
 * @param {{ [scenario: string]: { e0: any, e1: any } }} byScenario
 */
export function analyseEfficacy(byScenario) {
  const scenarios = {};
  for (const [scenario, arms] of Object.entries(byScenario)) {
    const e0 = arms.e0;
    const e1 = arms.e1;
    /** §18: recurrence first — the primary textbook-effect measure. */
    const e1FewerMistakes = e1.mistakeRecurrenceRate < e0.mistakeRecurrenceRate;
    /** §18: "mechanical outcome not worse" — E1 must not lose solves to gain mistake avoidance. */
    const e1OutcomeNotWorse = e1.fullSolveRate >= e0.fullSolveRate;
    scenarios[scenario] = Object.freeze({
      e0,
      e1,
      e1FewerMistakes,
      e1OutcomeNotWorse,
      directionalBenefit: e1FewerMistakes && e1OutcomeNotWorse,
      /** §9: the precondition — every analysed E1 trial consumed all its selected handles. */
      preconditionMet: e1.preconditionNotMet === 0 && e1.analysed > 0,
    });
  }

  const ids = Object.keys(scenarios);
  const benefitting = ids.filter((id) => scenarios[id].directionalBenefit && scenarios[id].preconditionMet);
  const directional = ids.filter((id) => scenarios[id].directionalBenefit);

  let verdict;
  if (ids.length === 0) verdict = 'INCOMPLETE';
  else if (benefitting.length === ids.length) verdict = EFFICACY_VERDICTS.REPLICATED;
  else if (benefitting.length > 0 || directional.length > 0) verdict = EFFICACY_VERDICTS.PARTIAL;
  else verdict = EFFICACY_VERDICTS.NOT_OBSERVED;

  return Object.freeze({ verdict, scenarios, benefittingScenarios: benefitting, directionalScenarios: directional });
}

/**
 * §17: the BEHAVIOURAL PROCEDURE MARKER, measured from the candidate's SOURCE and behaviour rather than
 * from the fact that a Procedure was delivered. "Procedure effective" is not a delivery claim.
 *
 * Each marker is a predicate over the candidate implementation that only the mature method satisfies:
 *
 *   C  replay validity established before the caller's state is mutated — the marker probes the ORDERING
 *      behaviourally, by handing the candidate an invalid log against a non-empty caller state and checking
 *      that the state survived, and by handing it a valid log in a non-canonical array order.
 *   D  the affected closure frozen before any mutation — probed by giving a cache whose dependent chain
 *      must be invalidated together with the changed node.
 *
 * A marker that merely inspected source text would be gameable by a comment; these run the candidate.
 */
export function procedureMarkerFor(scenarioId, fn) {
  if (scenarioId === 'C') {
    const probes = [
      { id: 'm01', why: 'a refused log must leave the caller\'s state untouched', state: { keep: 1 }, input: [{ id: 'ok', seq: 0, op: 'SET', v: 1 }, { id: 'bad', seq: 3, op: 'SET', v: 2 }] },
      { id: 'm02', why: 'a valid log must be applied in the log\'s own sequence order', state: {}, input: [{ id: 'a', seq: 1, op: 'SET', v: 9 }, { id: 'a', seq: 0, op: 'SET', v: 1 }] },
    ];
    const violations = [];
    for (const probe of probes) {
      const state = structuredClone(probe.state);
      const before = JSON.stringify(state);
      let threw = false;
      try {
        fn(state, probe.input);
      } catch {
        threw = true;
      }
      if (probe.id === 'm01') {
        if (!threw) violations.push({ probe: probe.id, why: probe.why, detail: 'the invalid log was accepted' });
        else if (JSON.stringify(state) !== before) violations.push({ probe: probe.id, why: probe.why, detail: 'the caller\'s state was mutated before the refusal' });
      } else {
        if (threw) violations.push({ probe: probe.id, why: probe.why, detail: 'a valid log was refused for arriving out of order' });
        else if (state.a !== 9) violations.push({ probe: probe.id, why: probe.why, detail: `the state reflects array order rather than sequence order (a=${JSON.stringify(state.a)})` });
      }
    }
    return Object.freeze({ marker: 'validatesWholeHistoryBeforeMutating', reflected: violations.length === 0, violations, probesRun: probes.length });
  }
  if (scenarioId === 'D') {
    const violations = [];
    /** m01/m02: the closure direction — the changed node and its TRANSITIVE DEPENDENTS go, ancestors stay. */
    const state = { a: { value: 1, deps: [] }, b: { value: 2, deps: ['a'] }, c: { value: 3, deps: ['b'] }, free: { value: 4, deps: [] } };
    try {
      fn(state, ['a']);
      for (const id of ['a', 'b', 'c']) {
        if (Object.hasOwn(state, id)) violations.push({ probe: 'm01', why: 'the changed node and its transitive dependents must be invalidated', detail: `"${id}" survived` });
      }
      if (!Object.hasOwn(state, 'free')) violations.push({ probe: 'm02', why: 'an unaffected entry must be preserved', detail: '"free" was discarded' });
    } catch (error) {
      violations.push({ probe: 'm01', why: 'a valid invalidation must not be refused', detail: error?.message ?? String(error) });
    }
    /**
     * m03: the unresolvable-dependency clause. This is one of the Procedure's own steps (forced by D3), so a
     * marker that ignored it would report "the method was reflected" for a candidate that skipped the very
     * clause the observation forced — which is the delivery-not-effect claim §17 forbids.
     */
    const orphanState = { a: { value: 1, deps: [] }, orphan: { value: 2, deps: ['gone'] }, free: { value: 3, deps: [] } };
    try {
      fn(orphanState, []);
      if (Object.hasOwn(orphanState, 'orphan')) violations.push({ probe: 'm03', why: 'an entry naming a dependency the cache does not hold cannot be shown to be current', detail: '"orphan" survived' });
      if (!Object.hasOwn(orphanState, 'free')) violations.push({ probe: 'm03', why: 'an unaffected entry must be preserved', detail: '"free" was discarded' });
    } catch (error) {
      violations.push({ probe: 'm03', why: 'an empty change set with a resolvable cache must not be refused', detail: error?.message ?? String(error) });
    }
    return Object.freeze({ marker: 'freezesAffectedClosureBeforeMutating', reflected: violations.length === 0, violations, probesRun: 3 });
  }
  throw new Error(`no procedure marker for scenario ${scenarioId}`);
}

/**
 * §18: the rates the verdict consumes, computed from normalized trial records. Kept here rather than in the
 * analyzer so the criteria and the quantities they read are in one file.
 */
export function armSummary(trials) {
  const n = trials.length;
  const solved = trials.filter((trial) => trial.finalAcceptanceSolved).length;
  const firstSolved = trials.filter((trial) => trial.firstCandidateSolved).length;
  const recurred = trials.filter((trial) => trial.knownFailureRecurred === true).length;
  const marker = trials.filter((trial) => trial.procedureMarkerReflected === true).length;
  return Object.freeze({
    analysed: n,
    fullSolveRate: n === 0 ? 0 : solved / n,
    firstCandidateSolveRate: n === 0 ? 0 : firstSolved / n,
    mistakeRecurrenceRate: n === 0 ? 0 : recurred / n,
    procedureMarkerRate: n === 0 ? 0 : marker / n,
    fullSolved: `${String(solved)}/${String(n)}`,
    firstCandidateSolved: `${String(firstSolved)}/${String(n)}`,
    mistakeRecurred: `${String(recurred)}/${String(n)}`,
    procedureMarkerReflected: `${String(marker)}/${String(n)}`,
    /** §9: E1 trials whose prework did not materialize every selected handle. */
    preconditionNotMet: trials.filter((trial) => trial.preconditionMet === false).length,
  });
}
