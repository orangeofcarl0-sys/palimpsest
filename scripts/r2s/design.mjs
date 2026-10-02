/**
 * R2-S §1/§9/§11/§14/§15/§19/§20 — THE FROZEN CAPITAL-SELECTIVITY DESIGN.
 *
 * R2-M ESTABLISHED A CEILING, NOT AN EFFECT. Once the selected index was actually model-visible, the
 * opaque 3-handle control pulled 20/20 and the metadata arm pulled 20/20 — so the previous uptake metric
 * has no headroom and cannot distinguish the arms. R2-S therefore asks a DIFFERENT question:
 *
 *     When a worker sees a BROADER set of selected project capital
 *     (3 TARGET items it needs + 3 DISTRACTOR items it does not),
 *     does item-level decision metadata improve SELECTIVE retrieval
 *     rather than simply causing pull-all?
 *
 * This is a SELECTIVITY experiment, not another uptake experiment. The primary outcomes are per-trial
 * `target_pulls ∈ [0,3]` and `distractor_pulls ∈ [0,3]`, and the primary comparison is
 * `S1 distractor pull rate < S0` WITHOUT losing `S1 target recall >= S0` (§15).
 *
 * §20: THE VERDICT CRITERIA ARE DEFINED HERE, BEFORE ANY TRIAL RUNS, so the decision cannot be made after
 * seeing which criteria the data would satisfy.
 *
 * §11: POSITION CAN INFLUENCE ATTENTION, so the candidate-set orders are frozen. The production compiler
 * orders the index by content-addressed identity, which the harness may not touch (§25: no canonical
 * change). The ONE lawful lever on order is WHICH distractor items are selected, so five distinct
 * candidate sets per scenario are frozen from the seed, chosen so the target/distractor POSITION pattern
 * is balanced as far as the lawful candidate universe admits. §11's "as far as practical" is honoured by
 * MEASURING the achieved balance in the analysis rather than by asserting it here.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

/** §19: the ONE frozen seed. Never changed after the first trial exists. */
export const PROTOCOL_SEED = 0x52_53_02_01;

/** §9: the two conditions. S0 is the opaque broad index; S1 adds the frozen R2-M metadata treatment. */
export const CONDITIONS = Object.freeze(['S0', 'S1']);

/**
 * §9/§12: S0 and S1 map EXACTLY onto the already-frozen R2-M presentation modes. S0 is the production
 * opaque presentation (`m0`), S1 is the frozen metadata treatment (`m1`). Reusing the existing mode tokens
 * means the experimental renderer is the ONLY host change and the production default stays `off`.
 */
export const MODE_OF = Object.freeze({ S0: 'm0', S1: 'm1' });

/** §9: what each arm is, as data, so a report can name it without re-deriving. */
export const ARMS = Object.freeze({
  S0: 'the opaque broad index: six `[kind] handle` entries, the current production presentation',
  S1: 'the same six handles, the same order, the same bodies, plus the frozen R2-M decision metadata',
});

/** §19: 2 scenarios × 2 conditions × 5 repetitions = 20 primary trials. */
export const REPETITIONS = 5;
export const SCENARIO_IDS = Object.freeze(['C', 'D']);
export const EXPECTED_TRIALS = SCENARIO_IDS.length * CONDITIONS.length * REPETITIONS;

/** §6: the three capital kinds, in the fixed order the compiler renders them. */
export const KINDS = Object.freeze(['proof', 'reasoning', 'procedure']);

/** §6: exactly 3 target items and 3 distractor items, one of each kind. */
export const ITEMS_PER_KIND = 2;
export const TARGET_COUNT = 3;
export const DISTRACTOR_COUNT = 3;
export const CANDIDATE_SET_SIZE = TARGET_COUNT + DISTRACTOR_COUNT;

/** §6/§7: the TARGET is the scenario's OWN capital bundle. */
export const TARGET_BUNDLE = Object.freeze({ C: 'C', D: 'D' });

/**
 * §7: THE DISTRACTOR POOL — the independent, valid, mature capital bundles a scenario may draw distractors
 * from. The sibling scenario's bundle is always present; the third bundle (B, the config-migration ladder
 * from R1-R) is a genuinely different domain.
 *
 * §7's LITERAL "first attempt" is a WHOLE-BUNDLE distractor (C's task takes D's bundle; D's task takes C's
 * bundle). That construction admits exactly ONE index order per scenario, because the compiler orders by
 * content-addressed identity and a single bundle fixes all three distractor identities. §11 requires FIVE
 * distinct frozen candidate sets per scenario, so the pool is used PER KIND: each block draws one proof,
 * one reasoning and one procedure distractor from the pool. Every drawn item is still a real, mature,
 * admitted, project-associated capital item; no content is authored and no canonical rule is touched.
 *
 * The pool is SORTED so the schedule is reproducible, and it always excludes the target bundle.
 */
export const DISTRACTOR_POOL = Object.freeze({ C: Object.freeze(['B', 'D']), D: Object.freeze(['B', 'C']) });

/**
 * §20: the pre-declared selectivity verdicts.
 *
 *   REPLICATED    BOTH scenarios: S1's distractor pull rate is STRICTLY LOWER than S0's, S1's target
 *                 recall is >= S0's, and actual target retrieval remains non-zero in S1
 *   PARTIAL       exactly one scenario clearly satisfies the criterion, or both show weak/noisy
 *                 directional selectivity improvement
 *   NOT_IMPROVED  neither scenario improves selective retrieval
 */
export const SELECTIVITY_VERDICTS = Object.freeze({
  REPLICATED: 'R2-S SELECTIVITY: REPLICATED',
  PARTIAL: 'R2-S SELECTIVITY: PARTIAL',
  NOT_IMPROVED: 'R2-S SELECTIVITY: NOT_IMPROVED',
});

/* ---------------------------------------------------------------- §11/§19 the frozen schedule */

/**
 * §19: the per-block condition ordering, derived from the frozen seed. `S0`/`S1` are interleaved rather
 * than grouped, so the two scenarios get different permutations.
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

/** A tiny deterministic PRNG so the distractor schedule is reproducible from the seed alone. */
function seededStream(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
}

/**
 * §11: THE FROZEN DISTRACTOR SET PER BLOCK.
 *
 * For each scenario and block, one distractor bundle is drawn per kind from the scenario's pool, so the
 * six-item candidate set is `3 targets + 3 distractors`. The sets are made PAIRWISE DISTINCT so the five
 * blocks exercise five different candidate-set orders; a deterministic fallback advances the stream when a
 * draw would repeat an earlier set, so the schedule is a pure function of the seed.
 */
export function distractorSchedule(scenarioId, blocks = REPETITIONS) {
  const pool = DISTRACTOR_POOL[scenarioId];
  if (pool === undefined) throw new Error(`no distractor pool for scenario ${scenarioId}`);
  const next = seededStream(PROTOCOL_SEED ^ (scenarioId === 'D' ? 0x00_5d_5d_00 : 0x00_5c_5c_00));
  const seen = new Set();
  const out = [];
  for (let block = 0; block < blocks; block += 1) {
    let set;
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const candidate = {};
      for (const kind of KINDS) candidate[kind] = pool[next() % pool.length];
      const key = KINDS.map((kind) => candidate[kind]).join('|');
      if (!seen.has(key) || attempt === 63) {
        set = candidate;
        seen.add(key);
        break;
      }
    }
    out.push(Object.freeze({ block, set: Object.freeze(set), key: KINDS.map((kind) => set[kind]).join('|') }));
  }
  return Object.freeze(out);
}

/** The full 20-trial schedule, as data, so the executed plan can be compared against the frozen one. */
export function trialPlan(repetitions = REPETITIONS, scenarioIds = SCENARIO_IDS) {
  const trials = [];
  for (const scenarioId of scenarioIds) {
    const distractor = distractorSchedule(scenarioId, repetitions);
    for (const block of blockOrder(repetitions, scenarioId)) {
      for (const condition of block.order) {
        trials.push(Object.freeze({
          scenarioId,
          block: block.block,
          repetition: block.block,
          condition,
          targetBundle: TARGET_BUNDLE[scenarioId],
          distractorSet: distractor[block.block].set,
        }));
      }
    }
  }
  return Object.freeze(trials);
}

/* ---------------------------------------------------------------- §14/§15 the per-arm outcomes */

/**
 * §14: the per-arm selectivity summary. The PRIMARY quantities are the mean TARGET RECALL
 * (`target_pulls / 3`) and the mean DISTRACTOR PULL RATE (`distractor_pulls / 3`); pull PRECISION
 * (`target / total`) is descriptive and is UNKNOWN when nothing was pulled.
 *
 * §17: pull-all is a VALID result. When both arms pull all six, target recall is 1 and the distractor pull
 * rate is 1, and the correct reading is that the worker treated selectedness as a SET-LEVEL instruction
 * rather than routing item by item. That is recorded, never called a failure.
 *
 * @param {readonly object[]} trials normalized trials
 */
export function armSelectivity(trials) {
  const n = trials.length;
  const sum = (pick) => trials.reduce((total, trial) => total + Number(pick(trial) ?? 0), 0);
  const targetPulls = sum((trial) => trial.targetPulls);
  const distractorPulls = sum((trial) => trial.distractorPulls);
  const totalPulls = targetPulls + distractorPulls;
  const rate = (value) => (n === 0 ? 0 : value / n);
  return Object.freeze({
    analysed: n,
    /** §14: the raw pull totals, first, so a rate can never be read without its denominator. */
    targetPulls,
    distractorPulls,
    totalPulls,
    targetPullsPerTrial: rate(targetPulls),
    distractorPullsPerTrial: rate(distractorPulls),
    /** §14: Target Recall = target_pulls / 3, averaged over trials. */
    targetRecall: n === 0 ? 0 : targetPulls / (n * TARGET_COUNT),
    /** §14: Distractor Pull Rate = distractor_pulls / 3, averaged over trials. */
    distractorPullRate: n === 0 ? 0 : distractorPulls / (n * DISTRACTOR_COUNT),
    /** §14: Pull Precision = target_pulls / total_pulls, or UNKNOWN when nothing was pulled. */
    precision: totalPulls === 0 ? 'UNKNOWN' : targetPulls / totalPulls,
    /** §17: the pull-all frequency, recorded as its own fact. */
    pullAllTrials: trials.filter((trial) => trial.totalPulls >= CANDIDATE_SET_SIZE).length,
    pullAll: `${String(trials.filter((trial) => trial.totalPulls >= CANDIDATE_SET_SIZE).length)}/${String(n)}`,
    targetRecallByTrial: trials.map((trial) => `${String(trial.targetPulls)}/3`),
    distractorPullsByTrial: trials.map((trial) => `${String(trial.distractorPulls)}/3`),
    /** §13: an S1 trial whose treatment was not proven at the session boundary is not a clean observation. */
    treatmentNotApplied: trials.filter((trial) => trial.treatmentApplied === false).length,
  });
}

/**
 * §20: the frozen verdict.
 *
 * §15 is the load-bearing rule: reduced retrieval only counts as improvement if useful retrieval is not
 * lost. So a scenario "clearly improves" ONLY when the distractor rate falls, target recall does NOT fall,
 * and the worker still retrieved at least one target.
 *
 * @param {{ [scenario: string]: { s0: any, s1: any } }} byScenario
 */
export function analyseSelectivity(byScenario) {
  const scenarios = {};
  for (const [scenario, arms] of Object.entries(byScenario)) {
    const s0 = arms.s0;
    const s1 = arms.s1;
    const distractorLower = s1.distractorPullRate < s0.distractorPullRate;
    const recallKept = s1.targetRecall >= s0.targetRecall;
    const targetRetrieved = s1.targetPulls > 0;
    scenarios[scenario] = Object.freeze({
      s0,
      s1,
      distractorLower,
      recallKept,
      targetRetrieved,
      /** §20: the full criterion — a real fall in unnecessary retrieval with no loss of useful retrieval. */
      improved: distractorLower && recallKept && targetRetrieved,
      /**
       * §20: a WEAK/NOISY DIRECTIONAL movement, which is PARTIAL rather than REPLICATED. §15 governs it:
       * less unnecessary retrieval counts only if useful retrieval was NOT lost, so a directional movement
       * is `(less distractor retrieval AND no loss of target recall)` or `more target retrieval`. Equality
       * is deliberately NOT directional — when both arms sit at the same rate (for instance both pull all
       * six) nothing moved, and that is the R2-M-style ceiling, which §20 places in NOT_IMPROVED.
       */
      directional: (s1.distractorPullRate < s0.distractorPullRate && recallKept) || s1.targetRecall > s0.targetRecall,
      treatmentApplied: s1.treatmentNotApplied === 0 && s1.analysed > 0,
    });
  }

  const ids = Object.keys(scenarios);
  const improved = ids.filter((id) => scenarios[id].improved && scenarios[id].treatmentApplied);
  const directional = ids.filter((id) => scenarios[id].directional && scenarios[id].treatmentApplied);

  let verdict;
  if (ids.length === 0) verdict = 'INCOMPLETE';
  else if (improved.length === ids.length) verdict = SELECTIVITY_VERDICTS.REPLICATED;
  else if (improved.length > 0 || directional.length > 0) verdict = SELECTIVITY_VERDICTS.PARTIAL;
  else verdict = SELECTIVITY_VERDICTS.NOT_IMPROVED;

  return Object.freeze({ verdict, scenarios, improvedScenarios: improved, directionalScenarios: directional });
}

/**
 * §13/§5: the preview leakage check, expressed as data so the gate and the tests share one definition.
 *
 * R2-S asks whether METADATA routes retrieval — not whether the preview gives away the solution. A preview
 * that reproduced a complete capital body would make any selectivity difference uninterpretable, because
 * the worker would have received the answer without pulling.
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
