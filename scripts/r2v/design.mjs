/**
 * R2-V §8/§9/§10/§13/§14/§15 — THE FROZEN UTILITY-CALIBRATION DESIGN.
 *
 * R2-S ESTABLISHED ROUTING, NOT UTILITY. It showed that item-level decision metadata changes WHICH capital
 * a worker retrieves, against the experiment's PREDECLARED PROVENANCE LABELS (`TARGET` = same task lineage,
 * `DISTRACTOR` = an independent bundle). It did NOT show that the skipped DISTRACTOR items have zero or
 * negative task utility.
 *
 * R2-V therefore asks a different question:
 *
 *     Does the TARGET / DISTRACTOR labelling correspond to ACTUAL MARGINAL TASK UTILITY?
 *
 * It is a utility-calibration stage, not another selectivity stage. §8 removes voluntary retrieval from the
 * causal question entirely: the host materializes the intended bodies through the SAME governed
 * attempt-bound channel R2-E used, before the first engineering turn, so every intended body is actually
 * delivered and there is no optional choice to make.
 *
 * §6: SCENARIO D IS THE PRIMARY UTILITY-CALIBRATION SCENARIO. Scenario C is saturated (15/15 solved in both
 * R2-S arms), so it cannot discriminate. D carries the useful ambiguity.
 *
 * §9: BUNDLE-LEVEL FIRST. The arms add whole bundles, not individual kinds. R2-E already established
 * bundle-level efficacy; R2-V asks whether the supposedly "distractor" B/C bundles have positive, zero or
 * negative MARGINAL value on top of D. Splitting kinds is a later stage, permitted only if a bundle shows a
 * stable marginal effect.
 *
 * §15: THE CLASSIFICATION IS DESCRIPTIVE, NOT BINARY, and it is scoped. At n = 5 per arm these are signals
 * about THIS tested scope, never universal classifications.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

/** §10: the ONE frozen seed. Never changed after the first trial exists. */
export const PROTOCOL_SEED = 0x52_56_03_01;

/** §6: the ONE scenario this stage calibrates. */
export const SCENARIO_IDS = Object.freeze(['D']);

/**
 * §8: the four primary arms, as the SET of bundles whose bodies are consumed. Every arm includes D (the
 * task's own prior-generation bundle), so the comparison isolates the MARGINAL value of what is added.
 */
export const ARMS = Object.freeze({
  V0: Object.freeze({ id: 'V0', bundles: Object.freeze(['D']), label: 'D target bundle only — the baseline' }),
  V1: Object.freeze({ id: 'V1', bundles: Object.freeze(['D', 'B']), label: 'D + B (config-migration bundle)' }),
  V2: Object.freeze({ id: 'V2', bundles: Object.freeze(['D', 'C']), label: 'D + C (event-log replay bundle)' }),
  V3: Object.freeze({ id: 'V3', bundles: Object.freeze(['D', 'B', 'C']), label: 'D + B + C (both non-target bundles)' }),
});

/** §8: the arm ids, in the frozen order. */
export const CONDITIONS = Object.freeze(['V0', 'V1', 'V2', 'V3']);

/** §9: the bundles that may be ADDED on top of D. §7 forbids any new hand-authored capital. */
export const ADDED_BUNDLES = Object.freeze({ V1: Object.freeze(['B']), V2: Object.freeze(['C']), V3: Object.freeze(['B', 'C']) });

/** §10: 4 arms × 5 repetitions = 20 Scenario-D trials. */
export const REPETITIONS = 5;
export const EXPECTED_TRIALS = SCENARIO_IDS.length * CONDITIONS.length * REPETITIONS;

/** §7: the three mature bundles. No new capital is authored; these are the R1-R and R2-U explorations. */
export const BUNDLE_IDS = Object.freeze(['B', 'C', 'D']);

/** §8: the ONE mechanism, reused verbatim from R2-E. No second fetch path, no optional choice. */
export const CONSUMPTION_MECHANISM = 'HOST_MEDIATED_PREWORK';

/**
 * §10: the per-block arm ordering, derived from the frozen seed.
 *
 * §10 requires "randomized blocks containing all four arms", so each block is a full permutation of the four
 * arms rather than a subset. A Fisher-Yates shuffle over the frozen arm list, driven by xorshift32 seeded
 * from `PROTOCOL_SEED`, gives five different orderings without any hand-edited schedule.
 */
export function blockOrder(blocks = REPETITIONS, scenarioId = 'D') {
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
        trials.push(Object.freeze({ scenarioId, block: block.block, repetition: block.block, condition, bundles: ARMS[condition].bundles }));
      }
    }
  }
  return Object.freeze(trials);
}

/* ---------------------------------------------------------------- §15 the classification, defined in advance */

/** §15: the three allowed descriptive classifications. There is deliberately no "useful"/"useless" binary. */
export const UTILITY_CLASSIFICATIONS = Object.freeze({
  POSITIVE_SIGNAL: 'POSITIVE_SIGNAL',
  NO_CLEAR_SIGNAL: 'NO_CLEAR_SIGNAL',
  ADVERSE_SIGNAL: 'ADVERSE_SIGNAL',
});

/**
 * §13/§15: the per-arm utility summary. The PRIMARY outcomes are first-candidate hidden acceptance, final
 * hidden acceptance and known-failure recurrence (§13). §13 forbids using model self-report as utility
 * ground truth, so nothing here reads a worker summary.
 *
 * @param {readonly object[]} trials normalized trials
 */
export function armUtility(trials) {
  const n = trials.length;
  const solved = trials.filter((trial) => trial.finalAcceptanceSolved).length;
  const firstSolved = trials.filter((trial) => trial.firstCandidateSolved).length;
  const recurred = trials.filter((trial) => trial.knownFailureRecurred === true).length;
  const rate = (count) => (n === 0 ? 0 : count / n);
  return Object.freeze({
    analysed: n,
    /** §13: the primary utility outcomes, as raw counts first. */
    fullSolved: `${String(solved)}/${String(n)}`,
    firstCandidateSolved: `${String(firstSolved)}/${String(n)}`,
    mistakeRecurred: `${String(recurred)}/${String(n)}`,
    fullSolveRate: rate(solved),
    firstCandidateSolveRate: rate(firstSolved),
    mistakeRecurrenceRate: rate(recurred),
    /** §13 secondary outcomes. */
    finalAcceptanceScores: trials.map((trial) => `${String(trial.finalAcceptancePassed)}/${String(trial.finalAcceptanceTotal)}`),
    firstCandidateScores: trials.map((trial) => `${String(trial.firstCandidatePassed)}/${String(trial.firstCandidateTotal)}`),
    medianVisibleOracleInvocations: median(trials.map((trial) => trial.visibleOracleInvocations)),
    medianImplementationRevisions: median(trials.map((trial) => trial.implementationRevisions)),
    medianElapsedMs: median(trials.map((trial) => trial.elapsedMs)),
    /** §12: an arm whose consumption precondition failed is not a clean utility observation. */
    preconditionNotMet: trials.filter((trial) => trial.consumptionProven === false).length,
  });
}

function median(values) {
  const sorted = values.filter((value) => typeof value === 'number').sort((left, right) => left - right);
  if (sorted.length === 0) return 'UNKNOWN';
  return sorted.length % 2 === 1 ? sorted[(sorted.length - 1) / 2] : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2);
}

/**
 * §14/§15: THE MARGINAL COMPARISON of one added-bundle arm against the V0 baseline.
 *
 * §14 forbids fake p-values at n = 5, so this reports RAW COUNTS and DIRECTION only. The classification is
 * the pre-declared descriptive rule below, applied mechanically:
 *
 *   recurrenceDelta = Vx.mistakeRecurred - V0.mistakeRecurred      (negative is better)
 *   solveDelta      = Vx.fullSolved      - V0.fullSolved           (positive is better)
 *
 *   POSITIVE_SIGNAL  the added bundle improved ONE primary outcome without regressing the other
 *   ADVERSE_SIGNAL   the added bundle worsened ONE primary outcome without improving the other
 *   NO_CLEAR_SIGNAL  otherwise (including "identical on both", which is the honest reading of no movement)
 *
 * §15: "no clear signal" is a real result and must not be reported as evidence of zero utility.
 *
 * @param {{ id: string, bundles: readonly string[] }} arm
 * @param {any} baseline the V0 summary
 * @param {any} treatment the arm's summary
 */
export function marginalSignal(arm, baseline, treatment) {
  const recurrenceDelta = (Number(String(treatment.mistakeRecurred).split('/')[0]) - Number(String(baseline.mistakeRecurred).split('/')[0]));
  const solveDelta = (Number(String(treatment.fullSolved).split('/')[0]) - Number(String(baseline.fullSolved).split('/')[0]));
  const recurrenceImproved = recurrenceDelta < 0;
  const recurrenceWorse = recurrenceDelta > 0;
  const solveImproved = solveDelta > 0;
  const solveWorse = solveDelta < 0;

  let classification;
  if ((recurrenceImproved && !solveWorse) || (solveImproved && !recurrenceWorse)) classification = UTILITY_CLASSIFICATIONS.POSITIVE_SIGNAL;
  else if ((recurrenceWorse && !solveImproved) || (solveWorse && !recurrenceImproved)) classification = UTILITY_CLASSIFICATIONS.ADVERSE_SIGNAL;
  else classification = UTILITY_CLASSIFICATIONS.NO_CLEAR_SIGNAL;

  return Object.freeze({
    comparison: `${arm.id} vs V0`,
    addedBundles: [...(ADDED_BUNDLES[arm.id] ?? [])],
    recurrenceDelta,
    solveDelta,
    recurrenceDirection: recurrenceDelta === 0 ? 'EQUAL' : recurrenceDelta < 0 ? 'FEWER_MISTAKES' : 'MORE_MISTAKES',
    solveDirection: solveDelta === 0 ? 'EQUAL' : solveDelta > 0 ? 'MORE_SOLVED' : 'FEWER_SOLVED',
    classification,
    /** §15: the tested scope is stated with the classification, never implied away. */
    testedScope: `${String(baseline.analysed)} V0 trials vs ${String(treatment.analysed)} ${arm.id} trials, Scenario D, deepseek-flash`,
    preconditionMet: baseline.preconditionNotMet === 0 && treatment.preconditionNotMet === 0,
    note: 'n = 5 per arm. This is a descriptive signal about the tested scope, not a universal classification and not a significance test.',
  });
}

/**
 * §15/§16: the full calibration — every marginal comparison plus the per-bundle reading that the R2-S
 * comparison consumes.
 */
export function analyseUtility(byArm) {
  const comparisons = CONDITIONS.filter((id) => id !== 'V0').map((id) => marginalSignal(ARMS[id], byArm.V0, byArm[id]));
  const byBundle = {};
  for (const bundleId of ['B', 'C']) {
    const withBundle = comparisons.filter((entry) => entry.addedBundles.includes(bundleId));
    byBundle[bundleId] = Object.freeze({
      bundleId,
      comparisons: withBundle.map((entry) => `${entry.comparison}:${entry.classification}`),
      classifications: withBundle.map((entry) => entry.classification),
      /** §15: a bundle is called POSITIVE only if EVERY arm that added it agreed; anything else is mixed. */
      consensus: withBundle.every((entry) => entry.classification === UTILITY_CLASSIFICATIONS.POSITIVE_SIGNAL)
        ? UTILITY_CLASSIFICATIONS.POSITIVE_SIGNAL
        : withBundle.every((entry) => entry.classification === UTILITY_CLASSIFICATIONS.ADVERSE_SIGNAL)
          ? UTILITY_CLASSIFICATIONS.ADVERSE_SIGNAL
          : UTILITY_CLASSIFICATIONS.NO_CLEAR_SIGNAL,
    });
  }
  return Object.freeze({ comparisons, byBundle });
}
