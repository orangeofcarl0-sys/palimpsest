/**
 * R2-M §1/§6/§21/§22/§26 — THE FROZEN DECISION-RELEVANCE DESIGN.
 *
 * §21 requires five randomized blocks per scenario, each containing M0 and M1, in an order derived from ONE
 * FROZEN DETERMINISTIC SEED. The seed lives HERE as a literal and the ordering is derived from it, so a
 * hand-edited schedule would show up as a diff to this file rather than as an unremarkable change.
 *
 * §26: THE VERDICT CRITERIA ARE DEFINED HERE, BEFORE ANY TRIAL RUNS, so the decision cannot be made after
 * seeing which criteria the data would satisfy.
 *
 * R2-M ASKS ONE QUESTION. Does decision-relevant, owner-grounded metadata about ALREADY-SELECTED capital
 * increase VOLUNTARY use of the existing governed pull channel? It is not an efficacy stage, not an
 * availability stage, not a relevance-selection stage, and it does not test the pull tool's wording.
 *
 * §17: EVERY PRIMARY TRIAL IS CAPITAL-PRESENT. There is no K0 arm. Both arms select the SAME capital set,
 * so the only difference between M0 and M1 is the BYTES OF THE INDEX.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

/** §21: the ONE frozen seed. Never changed after the first trial exists. */
export const PROTOCOL_SEED = 0x52_4d_03_01;

/** §6: the two primary conditions. */
export const CONDITIONS = Object.freeze(['M0', 'M1']);

/** §6/§7: what each arm is, stated as data so a report can name it without re-deriving. */
export const ARMS = Object.freeze({
  M0: 'the current production presentation: [kind] handle, no extra metadata, no extra reminder',
  M1: 'the same selected capital and handles, plus owner-grounded decision metadata and a bounded deterministic preview',
});

/** §21: 2 scenarios × 2 conditions × 5 repetitions = 20 primary trials. */
export const REPETITIONS = 5;
export const SCENARIO_IDS = Object.freeze(['C', 'D']);
export const EXPECTED_TRIALS = SCENARIO_IDS.length * CONDITIONS.length * REPETITIONS;

/**
 * §21: the per-block condition ordering, derived from the frozen seed.
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

/* ---------------------------------------------------------------- §26 the verdict, defined in advance */

/** §26: the pre-declared decision-relevance verdicts. */
export const DECISION_RELEVANCE_VERDICTS = Object.freeze({
  REPLICATED: 'R2-M DECISION RELEVANCE: REPLICATED',
  PARTIAL: 'R2-M DECISION RELEVANCE: PARTIAL',
  NOT_IMPROVED: 'R2-M DECISION RELEVANCE: NOT_IMPROVED',
});

/** The three capital kinds, in the fixed order the index renders them. */
export const KINDS = Object.freeze(['proof', 'reasoning', 'procedure']);

/**
 * §22/§23: the arm summary. The PRIMARY quantity is the governed-pull rate — the fraction of trials in
 * which the worker voluntarily pulled at least one selected handle. Per-kind rates are mandatory because
 * the M1 decision surfaces have DIFFERENT semantic provenance (§8), so a Procedure-only movement must not
 * be reported as a general metadata effect.
 *
 * @param {readonly object[]} trials normalized trials
 */
export function armSummary(trials) {
  const n = trials.length;
  const pulled = trials.filter((trial) => trial.pulledCount > 0).length;
  const rate = (count) => (n === 0 ? 0 : count / n);
  const kindPulled = (kind) => trials.filter((trial) => (trial.pulledKinds ?? []).includes(kind)).length;
  return Object.freeze({
    analysed: n,
    pulledTrials: pulled,
    pullRate: rate(pulled),
    pulled: `${String(pulled)}/${String(n)}`,
    proofPullRate: rate(kindPulled('proof')),
    reasoningPullRate: rate(kindPulled('reasoning')),
    procedurePullRate: rate(kindPulled('procedure')),
    proofPulled: `${String(kindPulled('proof'))}/${String(n)}`,
    reasoningPulled: `${String(kindPulled('reasoning'))}/${String(n)}`,
    procedurePulled: `${String(kindPulled('procedure'))}/${String(n)}`,
    /** §14: an M1 trial whose derivation did not produce every entry is not a clean treatment observation. */
    treatmentNotApplied: trials.filter((trial) => trial.treatmentApplied === false).length,
  });
}

/**
 * §26: the frozen verdict.
 *
 *   REPLICATED    BOTH scenarios: M1's governed-pull rate is STRICTLY GREATER than M0's, with at least one
 *                 actual M1 pull in each scenario
 *   PARTIAL       exactly one scenario increases, or both show weak/noisy directional improvement
 *   NOT_IMPROVED  neither scenario shows increased voluntary governed uptake
 *
 * §26: task-success improvement is NOT required. All three outcomes are valid.
 *
 * @param {{ [scenario: string]: { m0: any, m1: any } }} byScenario
 */
export function analyseDecisionRelevance(byScenario) {
  const scenarios = {};
  for (const [scenario, arms] of Object.entries(byScenario)) {
    const m0 = arms.m0;
    const m1 = arms.m1;
    const m1Higher = m1.pullRate > m0.pullRate;
    const m1PulledSomething = m1.pulledTrials > 0;
    const m1HigherByCount = m1.pulledTrials > m0.pulledTrials;
    scenarios[scenario] = Object.freeze({
      m0,
      m1,
      m1Higher,
      m1PulledSomething,
      /** §26: strict rate increase AND at least one real M1 pull. */
      improved: m1Higher && m1PulledSomething,
      /** Reported separately: a count increase with equal rates is a different fact. */
      m1HigherByCount,
      treatmentApplied: m1.treatmentNotApplied === 0 && m1.analysed > 0,
    });
  }

  const ids = Object.keys(scenarios);
  const improved = ids.filter((id) => scenarios[id].improved && scenarios[id].treatmentApplied);
  const directional = ids.filter((id) => scenarios[id].m1Higher || scenarios[id].m1HigherByCount);

  let verdict;
  if (ids.length === 0) verdict = 'INCOMPLETE';
  else if (improved.length === ids.length) verdict = DECISION_RELEVANCE_VERDICTS.REPLICATED;
  else if (improved.length > 0 || directional.length > 0) verdict = DECISION_RELEVANCE_VERDICTS.PARTIAL;
  else verdict = DECISION_RELEVANCE_VERDICTS.NOT_IMPROVED;

  return Object.freeze({ verdict, scenarios, improvedScenarios: improved, directionalScenarios: directional });
}

/**
 * §14: THE PREVIEW LEAKAGE CHECK, expressed as data so the gate and the tests share one definition.
 *
 * R2-M asks whether METADATA causes retrieval — not whether the preview gives away the solution. A preview
 * that reproduced the whole selected asset would make any uptake increase uninterpretable, because the
 * worker would have received the answer without pulling.
 *
 * The check is mechanical: a rendered preview may not contain the full source field, may not contain the
 * scenario's hidden acceptance text, and must be bounded.
 *
 * @param {{ previewText: string, sourceField: string, forbidden: readonly string[] }} input
 */
export function previewLeakage(input) {
  const problems = [];
  const preview = String(input.previewText ?? '');
  const source = String(input.sourceField ?? '');
  if (source.length > 0 && preview.length >= source.length && preview.includes(source)) {
    problems.push('the rendered preview reproduces the complete source field');
  }
  for (const needle of input.forbidden ?? []) {
    if (typeof needle === 'string' && needle.length > 8 && preview.includes(needle)) {
      problems.push(`the rendered preview contains forbidden content: ${needle.slice(0, 40)}`);
    }
  }
  return Object.freeze({ leaked: problems.length > 0, problems: Object.freeze(problems) });
}
