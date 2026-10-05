/**
 * R2-VR §1/§3/§4/§5 — THE FACTORIAL ESTIMAND.
 *
 * R2-V RAN A 2×2 DESIGN BUT INTERPRETED IT AS A CHAIN OF PAIRS. Its arms are:
 *
 *              C absent      C present
 *   B absent      V0            V2
 *   B present     V1            V3
 *
 * So `V3 vs V0` is the effect of the COMBINED treatment (B and C together), NOT the marginal effect of
 * either one. R2-V's per-bundle "consensus" read the combined contrast as if it were marginal, which is
 * the estimand error this module corrects.
 *
 * §3 fixes the four CONDITIONAL contrasts and the two main effects and the interaction:
 *
 *   B | C absent   = V1 - V0
 *   B | C present  = V3 - V2
 *   C | B absent   = V2 - V0
 *   C | B present  = V3 - V1
 *
 *   B main effect  = mean[(V1 - V0), (V3 - V2)]
 *   C main effect  = mean[(V2 - V0), (V3 - V1)]
 *   B×C interaction= V3 - V2 - V1 + V0
 *
 * §14: NO p-values. Raw counts and rates only, at n = 5 per cell.
 *
 * §5: a non-zero descriptive interaction at n = 5 is NOT evidence of a real interaction. It is labelled
 * DESCRIPTIVE_INTERACTION_PATTERN and nothing stronger.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

/** §3: the factorial cell layout, stated as data so a reader cannot misread which arm is which. */
export const FACTORIAL_CELLS = Object.freeze({
  V0: Object.freeze({ B: false, C: false }),
  V1: Object.freeze({ B: true, C: false }),
  V2: Object.freeze({ B: false, C: true }),
  V3: Object.freeze({ B: true, C: true }),
});

/** §3: the outcome dimensions the contrasts are computed for. */
export const OUTCOME_DIMENSIONS = Object.freeze(['firstCandidateSolved', 'finalAcceptanceSolved', 'knownFailureRecurred']);

/** §5: the ONE label a descriptive interaction may carry at n = 5. */
export const INTERACTION_LABEL = 'DESCRIPTIVE_INTERACTION_PATTERN';

/** §7: the allowed corrected calibration statuses. */
export const CALIBRATION_STATUSES = Object.freeze({
  SUPPORTED: 'UTILITY_CALIBRATION_SUPPORTED',
  MIXED: 'UTILITY_CALIBRATION_MIXED',
  INCONCLUSIVE: 'UTILITY_CALIBRATION_INCONCLUSIVE',
});

/** §6: the ruling recorded when no VARYING outcome case is directly addressed by the ADDED capital. */
export const OUTCOME_MISMATCH_RULING = 'UTILITY_ASSAY_OUTCOME_MISMATCH';

/** The rate of one boolean outcome in one arm, with its raw count preserved beside it. */
export function armRate(trials, dimension) {
  const n = trials.length;
  const hits = trials.filter((trial) => trial[dimension] === true).length;
  return Object.freeze({ dimension, n, hits, misses: n - hits, rate: n === 0 ? 0 : hits / n, raw: `${String(hits)}/${String(n)}` });
}

/**
 * §3/§4: THE FACTORIAL CONTRASTS for ONE outcome dimension.
 *
 * Every contrast is a DIFFERENCE OF RATES, reported with the raw counts it came from, so a reader can see
 * that a `+0.2` is one trial in five rather than a stable effect.
 *
 * @param {{ [arm: string]: readonly object[] }} trialsByArm
 * @param {string} dimension
 */
export function factorialContrasts(trialsByArm, dimension) {
  const rate = (arm) => armRate(trialsByArm[arm] ?? [], dimension);
  const v0 = rate('V0');
  const v1 = rate('V1');
  const v2 = rate('V2');
  const v3 = rate('V3');

  /** §3: the four conditional contrasts. */
  const bGivenCAbsent = v1.rate - v0.rate;
  const bGivenCPresent = v3.rate - v2.rate;
  const cGivenBAbsent = v2.rate - v0.rate;
  const cGivenBPresent = v3.rate - v1.rate;

  /** §3: the main effects, as the mean of the two conditional contrasts. */
  const bMainEffect = (bGivenCAbsent + bGivenCPresent) / 2;
  const cMainEffect = (cGivenBAbsent + cGivenBPresent) / 2;

  /** §3: the interaction — how much the combined effect exceeds the sum of the parts. */
  const rawInteraction = v3.rate - v2.rate - v1.rate + v0.rate;
  const interaction = Math.abs(rawInteraction) < EPSILON ? 0 : rawInteraction;

  return Object.freeze({
    dimension,
    cells: Object.freeze({ V0: v0, V1: v1, V2: v2, V3: v3 }),
    /** §4: the conditional contrasts are PRESERVED, never collapsed into one verdict. */
    conditional: Object.freeze({
      bGivenCAbsent: Object.freeze({ value: bGivenCAbsent, raw: `${v1.raw} - ${v0.raw}` }),
      bGivenCPresent: Object.freeze({ value: bGivenCPresent, raw: `${v3.raw} - ${v2.raw}` }),
      cGivenBAbsent: Object.freeze({ value: cGivenBAbsent, raw: `${v2.raw} - ${v0.raw}` }),
      cGivenBPresent: Object.freeze({ value: cGivenBPresent, raw: `${v3.raw} - ${v1.raw}` }),
    }),
    bMainEffect,
    cMainEffect,
    interaction,
    /** §5: the interaction is labelled descriptively and never as a demonstrated effect. */
    interactionLabel: interaction === 0 ? null : INTERACTION_LABEL,
    /** §4: whether the two conditional contrasts for each factor agree in SIGN. */
    bSignAgreement: sign(bGivenCAbsent) === sign(bGivenCPresent) && sign(bGivenCAbsent) !== 0,
    cSignAgreement: sign(cGivenBAbsent) === sign(cGivenBPresent) && sign(cGivenBAbsent) !== 0,
  });
}

/** Rates are differences of fractions, so an exactly-additive world can leave a ~1e-16 residue. */
const EPSILON = 1e-9;

function sign(value) {
  if (value > EPSILON) return 1;
  if (value < -EPSILON) return -1;
  return 0;
}

/**
 * §4: THE PER-FACTOR DESCRIPTION, which must be able to say:
 *
 *   positive in one context, negative in another, no stable marginal signal, possible interaction pattern
 *
 * and must NOT collapse that into a bare POSITIVE_SIGNAL, or into "NO_CLEAR_SIGNAL because V3-vs-V0
 * disagreed" — the conditional contrasts are what carry the information.
 *
 * @param {any} contrast the result of `factorialContrasts` for one dimension
 * @param {'B'|'C'} factor
 */
export function describeFactor(contrast, factor) {
  const absent = factor === 'B' ? contrast.conditional.bGivenCAbsent : contrast.conditional.cGivenBAbsent;
  const present = factor === 'B' ? contrast.conditional.bGivenCPresent : contrast.conditional.cGivenBPresent;
  const other = factor === 'B' ? 'C' : 'B';
  const main = factor === 'B' ? contrast.bMainEffect : contrast.cMainEffect;

  let shape;
  if (sign(absent.value) === 1 && sign(present.value) === 1) shape = 'POSITIVE_IN_BOTH_CONTEXTS';
  else if (sign(absent.value) === -1 && sign(present.value) === -1) shape = 'NEGATIVE_IN_BOTH_CONTEXTS';
  else if (sign(absent.value) !== 0 && sign(present.value) !== 0 && sign(absent.value) !== sign(present.value)) shape = 'OPPOSITE_SIGNS_ACROSS_CONTEXTS';
  else if (sign(absent.value) === 0 && sign(present.value) === 0) shape = 'NO_MOVEMENT_IN_EITHER_CONTEXT';
  else shape = 'MOVEMENT_IN_ONE_CONTEXT_ONLY';

  return Object.freeze({
    factor,
    conditionedOn: other,
    contrasts: Object.freeze({
      [`${factor}|${other}Absent`]: absent,
      [`${factor}|${other}Present`]: present,
    }),
    mainEffect: main,
    /** §4: the shape names the CONTEXT-DEPENDENCE rather than averaging it away. */
    shape,
    /** §4: whether a stable marginal signal exists at all. */
    stableMarginalSignal: shape === 'POSITIVE_IN_BOTH_CONTEXTS' || shape === 'NEGATIVE_IN_BOTH_CONTEXTS',
    signAgreement: sign(absent.value) === sign(present.value) && sign(absent.value) !== 0,
    rawCountsOnly: true,
    note: 'n = 5 per cell. Differences of one trial are one trial. No significance is claimed and none is computable here.',
  });
}

/**
 * §7: THE CORRECTED CALIBRATION STATUS.
 *
 * `UTILITY_CALIBRATION_SUPPORTED` requires a STABLE marginal signal in the direction R2-S's routing implies
 * (i.e. the skipped bundles showed no positive utility). `MIXED` covers a real but context-dependent or
 * inconsistent pattern. `INCONCLUSIVE` is the honest reading when the outcome measure cannot carry the
 * question — and §7 says it must remain a fully valid result.
 *
 * @param {{ interactions: number, saturatedDimensions: readonly string[], factorsWithStableSignal: readonly string[], outcomeMismatch: boolean }} input
 */
export function correctedCalibrationStatus(input) {
  /**
   * §6/§7: SATURATION FIRST. If the outcome dimensions have no headroom — every arm near the maximum — then
   * no contrast can be informative, and the honest status is INCONCLUSIVE regardless of the raw deltas.
   */
  if (input.outcomeMismatch || input.saturatedDimensions.length >= 2) return CALIBRATION_STATUSES.INCONCLUSIVE;
  const anyStable = input.factorsWithStableSignal.length > 0;
  const anyInteraction = input.interactions > 0;
  if (anyStable && !anyInteraction) return CALIBRATION_STATUSES.SUPPORTED;
  return CALIBRATION_STATUSES.MIXED;
}
