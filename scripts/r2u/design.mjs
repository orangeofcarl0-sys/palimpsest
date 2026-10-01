/**
 * R2-U §5/§15/§20/§25 — THE FROZEN EXPERIMENTAL DESIGN.
 *
 * §15 requires five randomized blocks per scenario, each containing exactly the four cells, in an order
 * derived from ONE FROZEN DETERMINISTIC SEED. The point is stated in the ruling: "Do not run all affordance
 * trials after all passive trials." A design that ran K0A0 and K1A0 first and the A1 cells last would let
 * any slow drift in the host, the model or the machine load land entirely on one factor.
 *
 * The seed lives HERE, as a literal, and the ordering is derived from it rather than typed, so a block
 * order that was edited by hand would show up as a diff to this file rather than as an unremarkable change
 * to a schedule.
 *
 * §20: THE VERDICT CRITERIA ARE DEFINED HERE, BEFORE ANY TRIAL RUNS, so the decision cannot be made after
 * seeing which criteria the data would satisfy.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

/** §15: the ONE frozen seed. Never changed after the first trial exists. */
export const PROTOCOL_SEED = 0x52_32_55_01;

/** §5: the four cells of the 2 × 2 factorial, in the canonical (non-randomized) order. */
export const CELLS = Object.freeze(['K0A0', 'K1A0', 'K0A1', 'K1A1']);

/** §5: the two factors, so a report can name them without re-deriving from the cell string. */
export const FACTORS = Object.freeze({
  K: Object.freeze({ K0: 'no selected inherited capital', K1: 'full relevant capital selected (Proof + Reasoning + Procedure)' }),
  A: Object.freeze({ A0: 'PASSIVE — current production presentation', A1: 'EXPLICIT REVIEW — the frozen uptake clause is appended' }),
});

/** §14: 2 scenarios × 4 cells × 5 repetitions = 40 primary trials. */
export const REPETITIONS = 5;
export const SCENARIO_IDS = Object.freeze(['C', 'D']);
export const EXPECTED_TRIALS = SCENARIO_IDS.length * CELLS.length * REPETITIONS;

/**
 * §15: the per-block cell ordering, derived from the frozen seed.
 *
 * xorshift32, seeded with `PROTOCOL_SEED` XORed with the block index so that successive blocks get
 * DIFFERENT permutations rather than the same one five times. Fisher–Yates over a copy of `CELLS`.
 */
export function blockOrder(blocks, scenarioId = '') {
  /** A per-scenario, per-block stream: the same seed for every scenario would give C and D the same order. */
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
    const order = [...CELLS];
    for (let index = order.length - 1; index > 0; index -= 1) {
      const swap = next() % (index + 1);
      [order[index], order[swap]] = [order[swap], order[index]];
    }
    out.push(Object.freeze({ block, order: Object.freeze(order) }));
  }
  return Object.freeze(out);
}

/**
 * The full 40-trial schedule, as data. Written to the rig so the executed plan can be compared against the
 * frozen one rather than taken on trust.
 */
export function trialPlan(repetitions = REPETITIONS, scenarioIds = SCENARIO_IDS) {
  const trials = [];
  for (const scenarioId of scenarioIds) {
    for (const block of blockOrder(repetitions, scenarioId)) {
      for (const cell of block.order) {
        trials.push(Object.freeze({ scenarioId, block: block.block, repetition: block.block, cell }));
      }
    }
  }
  return Object.freeze(trials);
}

/* ---------------------------------------------------------------- §20 the verdict, defined in advance */

/**
 * §20: the pre-declared uptake verdicts. The ruling fixes the criteria; this object is their executable
 * form, and `analyseUptake` applies exactly these and nothing else.
 */
export const UPTAKE_VERDICTS = Object.freeze({
  REPLICATED: 'R2-U CAPITAL UPTAKE: REPLICATED',
  PARTIAL: 'R2-U CAPITAL UPTAKE: PARTIAL',
  NOT_IMPROVED: 'R2-U CAPITAL UPTAKE: NOT_IMPROVED',
});

/**
 * §20: `P(any relevant pull)` per cell is the primary metric. "Relevant" means a pull of one of the
 * attempt's OWN compiled handles, which the harness records as `pulledHandles` — the parent only counts a
 * pull there when the resolver returned `resolved`, so a refused or not-found handle never counts.
 *
 * @param {readonly any[]} trials normalized trial records
 * @returns {{ [cell: string]: { n: number, pulled: number, rate: number } }}
 */
export function pullRates(trials) {
  const out = {};
  for (const cell of CELLS) {
    const members = trials.filter((trial) => trial.cell === cell);
    const pulled = members.filter((trial) => trial.pulledCount > 0).length;
    out[cell] = Object.freeze({ n: members.length, pulled, rate: members.length === 0 ? 0 : pulled / members.length });
  }
  return Object.freeze(out);
}

/**
 * §20/§28: THE UPTAKE VERDICT.
 *
 * `REPLICATED`  BOTH scenarios show K1A1 pull rate > K1A0 pull rate, with actual governed body pulls, and
 *               the effect is not explained by a comparable placebo shift in K0.
 * `PARTIAL`     exactly one scenario shows a clear increase, or both show a weak/noisy directional one.
 * `NOT_IMPROVED` the explicit affordance does not increase capital use in either scenario.
 *
 * THE PLACEBO CONDITION IS PART OF THE CRITERION, not a footnote: an A1 arm that raises pulling in K0 as
 * much as in K1 has not shown that the affordance helps a worker USE capital — it has shown that the
 * instruction changes behaviour in general, which is a different (and uninteresting) claim.
 *
 * @param {{ [scenario: string]: { K0A0: any, K1A0: any, K0A1: any, K1A1: any } }} byScenario
 */
export function analyseUptake(byScenario) {
  const scenarios = {};
  for (const [scenario, cells] of Object.entries(byScenario)) {
    const k1Increase = cells.K1A1.rate > cells.K1A0.rate;
    const k0Shift = cells.K0A1.rate - cells.K0A0.rate;
    const k1Shift = cells.K1A1.rate - cells.K1A0.rate;
    /** The interaction: the A1 effect where capital exists, minus the A1 effect where it does not. */
    const interaction = k1Shift - k0Shift;
    const governedBodiesPulled = cells.K1A1.pulled + cells.K1A0.pulled;
    scenarios[scenario] = Object.freeze({
      cells,
      k1Increase,
      k0Shift,
      k1Shift,
      interaction,
      governedBodiesPulled,
      /** A scenario counts as showing the effect only with a real increase AND an observed governed pull. */
      clear: k1Increase && governedBodiesPulled > 0,
      /** A placebo explanation: the instruction moved K0 as much as it moved K1. */
      placeboExplained: k1Increase && k0Shift >= k1Shift,
    });
  }

  const ids = Object.keys(scenarios);
  const clearCount = ids.filter((id) => scenarios[id].clear && !scenarios[id].placeboExplained).length;
  const directionalCount = ids.filter((id) => scenarios[id].k1Increase).length;

  let verdict;
  if (ids.length === 0) verdict = 'INCOMPLETE';
  else if (clearCount === ids.length) verdict = UPTAKE_VERDICTS.REPLICATED;
  else if (clearCount === 1 || directionalCount > 0) verdict = UPTAKE_VERDICTS.PARTIAL;
  else verdict = UPTAKE_VERDICTS.NOT_IMPROVED;

  return Object.freeze({ verdict, scenarios, clearCount, directionalCount });
}
