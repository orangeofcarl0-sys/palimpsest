/**
 * R3-A0 §2.1–§2.4/§2.6/§12/§16/§17 — THE QUALIFICATION CONTRACT v0.1.
 *
 * This module is the executable form of the contract. It freezes, BEFORE any baseline model run:
 *
 *   · the aggregate bidirectional-headroom bounds (§2.2);
 *   · the minimum class-level headroom (§2.2/§12);
 *   · the qualification repetition count Nq (§2.2);
 *   · the six QC clauses and the pair verdict (§12/§16);
 *   · the A→B gate, including the minimum L-shaped bridge (§2.1/§17).
 *
 * §2.2: the bounds are frozen HERE, before qualification, and must not be moved after seeing qualification
 * data. If a bound turns out to be wrong, the fixture is revised and requalified from scratch — the prior
 * record is retained as the record of the rejected revision.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

/* ---------------------------------------------------------------- §2.2 the frozen bounds */

/**
 * §2.2: THE FROZEN QUALIFICATION BOUNDS.
 *
 * The primary dimension is the FRACTION OF DECLARED FAILURE CLASSES PASSED (class coverage). The bounds are
 * on that fraction, and they are deliberately wide because R3 needs headroom, not a tight band:
 *
 *   LOWER 0.20 — below this the baseline is at the FLOOR: there is no room to detect HARM, because the
 *                baseline already fails nearly everything a treatment could make worse.
 *   UPPER 0.85 — above this the baseline is at the CEILING: there is no room to detect HELP.
 *
 * A pair qualifies only when its baseline class coverage is STRICTLY inside (lower, upper) — R3 requires
 * room in BOTH directions.
 */
export const QUALIFICATION_BOUNDS = Object.freeze({
  dimension: 'classCoverage',
  lower: 0.2,
  upper: 0.85,
  /** §2.2: the corrected semantics, stated as data so a report cannot invert them. */
  floorMeaning: 'no room to detect harm',
  ceilingMeaning: 'no room to detect help',
  roomRequiredInBothDirections: true,
  frozenBefore: 'any baseline model run',
});

/**
 * §2.2/§12: THE MINIMUM CLASS-LEVEL HEADROOM.
 *
 * A class has headroom when it is neither always passed nor always failed across the Nq repetitions. The
 * aggregate bound alone would admit a pair whose variance comes from a single class, which is the R2-V
 * failure. So a pair must ALSO show at least this many non-redundant DIRECT-treatment-relevant classes with
 * observable headroom.
 */
export const MIN_CLASS_HEADROOM = Object.freeze({
  /** §12: at least two non-redundant DIRECT-treatment-relevant classes must vary. */
  minVaryingDirectClasses: 2,
  /** §2.2: Nq repetitions per (fixture, model) pair. */
  Nq: 5,
});

/** §12/§16: the allowed pair verdicts. There is deliberately no "almost qualified". */
export const PAIR_VERDICTS = Object.freeze({
  QUALIFIED: 'QUALIFIED',
  UNQUALIFIED: 'UNQUALIFIED',
  INFRASTRUCTURE_INVALID: 'INFRASTRUCTURE_INVALID',
});

/* ---------------------------------------------------------------- §2.3/§6 redundancy */

/**
 * §2.3: NON-REDUNDANT DIMENSIONS.
 *
 * `firstCandidateSolved` and `finalSolved` are NOT counted as two dimensions when they are deterministically
 * identical — R2-V showed exactly that (every trial's first candidate WAS its final candidate). So the
 * dimension count is computed from the OBSERVED vectors: two dimensions that never differ are one dimension.
 */
export function nonRedundantDimensions(vectors, dimensions) {
  const groups = [];
  for (const dimension of dimensions) {
    const series = vectors.map((vector) => vector[dimension]);
    const match = groups.find((group) => group.series.every((value, index) => value === series[index]));
    if (match === undefined) groups.push({ dimensions: [dimension], series });
    else match.dimensions.push(dimension);
  }
  return Object.freeze(groups.map((group) => Object.freeze({ dimensions: Object.freeze(group.dimensions), redundant: group.dimensions.length > 1 })));
}

/* ---------------------------------------------------------------- §12 the pair verdict */

/**
 * §2.2/§2.3/§2.4/§12/§16: QUALIFY ONE (fixture, model) PAIR.
 *
 * @param {{
 *   fixtureId: string,
 *   modelId: string,
 *   nq: number,
 *   classIds: readonly string[],
 *   directClasses: readonly string[],
 *   redundantWith: Record<string, string>,
 *   trials: readonly { classPass: Record<string, boolean>, infrastructureInvalid?: boolean }[],
 * }} input
 */
export function qualifyPair(input) {
  const reasons = [];
  const runs = input.trials.filter((trial) => trial.infrastructureInvalid !== true);
  const invalid = input.trials.filter((trial) => trial.infrastructureInvalid === true).length;

  /**
   * §16: an INFRASTRUCTURE_INVALID run is not a bad model outcome. If TOO MANY runs were invalid the pair
   * cannot be judged at all, and saying so is the honest verdict.
   */
  if (runs.length < input.nq) {
    return Object.freeze({
      fixtureId: input.fixtureId,
      modelId: input.modelId,
      verdict: PAIR_VERDICTS.INFRASTRUCTURE_INVALID,
      reasons: Object.freeze([`${String(invalid)} of ${String(input.trials.length)} scheduled runs were infrastructure-invalid; ${String(input.nq)} valid runs are required`]),
      classHeadroom: Object.freeze([]),
      classCoverage: null,
      varyingDirectClasses: Object.freeze([]),
      nonRedundant: Object.freeze([]),
    });
  }

  /** §12: the per-class headroom, computed from the pass counts. */
  const classHeadroom = input.classIds.map((classId) => {
    const passes = runs.filter((trial) => trial.classPass[classId] === true).length;
    const direct = input.directClasses.includes(classId);
    return Object.freeze({
      classId,
      passes,
      of: runs.length,
      raw: `${String(passes)}/${String(runs.length)}`,
      state: passes === runs.length ? 'CEILING' : passes === 0 ? 'FLOOR' : 'VARIABLE',
      varies: passes > 0 && passes < runs.length,
      directTreatmentRelevant: direct,
      /** §2.3: a class that is deterministically identical to another counts once. */
      redundantWith: input.redundantWith[classId] ?? null,
    });
  });

  /** §2.2: the aggregate class coverage, averaged over runs. */
  const coveragePerRun = runs.map((trial) => input.classIds.filter((classId) => trial.classPass[classId] === true).length / input.classIds.length);
  const classCoverage = coveragePerRun.reduce((total, value) => total + value, 0) / coveragePerRun.length;

  /** §12: the non-redundant DIRECT-treatment-relevant classes that actually vary. */
  const varyingDirectClasses = classHeadroom.filter((entry) => entry.varies && entry.directTreatmentRelevant && entry.redundantWith === null).map((entry) => entry.classId);

  /* -- QC-1 (§2.2): bidirectional aggregate headroom -- */
  const withinBounds = classCoverage > QUALIFICATION_BOUNDS.lower && classCoverage < QUALIFICATION_BOUNDS.upper;
  if (!withinBounds) {
    const side = classCoverage <= QUALIFICATION_BOUNDS.lower ? 'FLOOR (no room to detect harm)' : 'CEILING (no room to detect help)';
    reasons.push(`QC-1 failed: aggregate class coverage ${classCoverage.toFixed(3)} is outside (${String(QUALIFICATION_BOUNDS.lower)}, ${String(QUALIFICATION_BOUNDS.upper)}) — ${side}`);
  }

  /* -- QC-2 (§2.3): at least two non-redundant dimensions with headroom -- */
  /**
   * §2.3 says "prefer declared failure-class dimensions". An earlier implementation used only the aggregate
   * (`classCoverage`) plus `fullSolve`, which is exactly the aggregate preference the clause rejects — so the
   * dimension set is the aggregate dimensions PLUS every declared failure class. Redundant dimensions are
   * then collapsed by the observed-vector test, and the count is taken over what actually varies.
   */
  const dimensionSeries = {
    classCoverage: coveragePerRun,
    fullSolve: runs.map((trial) => (trial.fullSolve === true ? 1 : 0)),
    ...Object.fromEntries(input.classIds.map((classId) => [classId, runs.map((trial) => (trial.classPass[classId] === true ? 1 : 0))])),
  };
  const nonRedundant = nonRedundantDimensions(runs, Object.keys(dimensionSeries));
  const varyingDimensions = nonRedundant.filter((group) => {
    const series = dimensionSeries[group.dimensions[0]];
    return new Set(series).size > 1;
  });
  if (varyingDimensions.length < 2) reasons.push(`QC-2 failed: only ${String(varyingDimensions.length)} non-redundant outcome/failure dimension(s) vary (${String(nonRedundant.length)} distinct declared)`);

  /* -- QC-3/QC-4 (§2.4/§12): treatment-relevant classes with headroom -- */
  if (varyingDirectClasses.length < MIN_CLASS_HEADROOM.minVaryingDirectClasses) {
    reasons.push(`QC-4 failed: ${String(varyingDirectClasses.length)} non-redundant DIRECT-treatment-relevant class(es) vary, ${String(MIN_CLASS_HEADROOM.minVaryingDirectClasses)} required`);
  }

  /* -- QC-5 (§12): success must not hinge on one unrelated residual case -- */
  const varyingClasses = classHeadroom.filter((entry) => entry.varies).map((entry) => entry.classId);
  const varyingDirect = varyingClasses.filter((classId) => input.directClasses.includes(classId));
  if (varyingClasses.length === 1 && varyingDirect.length === 0) {
    reasons.push('QC-5 failed: all class variance traces to ONE class that is not DIRECT-treatment-relevant (the R2-V outcome-mismatch shape)');
  }

  /* -- QC-6 (§6/§12): every class must be exercised -- */
  if (input.classIds.length === 0) reasons.push('QC-6 failed: the fixture declares no failure classes');

  return Object.freeze({
    fixtureId: input.fixtureId,
    modelId: input.modelId,
    verdict: reasons.length === 0 ? PAIR_VERDICTS.QUALIFIED : PAIR_VERDICTS.UNQUALIFIED,
    reasons: Object.freeze(reasons),
    classHeadroom: Object.freeze(classHeadroom),
    classCoverage,
    coveragePerRun: Object.freeze(coveragePerRun.map((value) => Number(value.toFixed(4)))),
    varyingClasses: Object.freeze(varyingClasses),
    varyingDirectClasses: Object.freeze(varyingDirectClasses),
    /** §2.3: the non-redundant dimensions that actually vary, named so the report can cite them. */
    varyingDimensions: Object.freeze(varyingDimensions.map((group) => group.dimensions.join('+'))),
    nonRedundant: Object.freeze(nonRedundant),
    infrastructureInvalidRuns: invalid,
    bounds: QUALIFICATION_BOUNDS,
    nq: input.nq,
  });
}

/* ---------------------------------------------------------------- §2.1/§17 the A→B gate */

/**
 * §2.1: THE A→B GATE, WITH THE MINIMUM L-SHAPED BRIDGE.
 *
 * The gate replaces the earlier "≥2 qualified pairs across ≥2 task families" with the stronger requirement
 * that the QUALIFIED BIPARTITE GRAPH contains:
 *
 *   · ≥2 qualified task families
 *   · ≥2 qualified model families
 *   · at least one model qualified on ≥2 task families
 *   · at least one task family qualified on ≥2 model families
 *
 * §2.6: ONLY COMPLIANT fixtures count toward the gate.
 *
 * @param {readonly { fixtureId: string, taskFamily: string, modelId: string, modelFamily: string, verdict: string, compliant: boolean }[]} pairs
 */
export function aToBGate(pairs) {
  const qualified = pairs.filter((pair) => pair.verdict === PAIR_VERDICTS.QUALIFIED && pair.compliant === true);
  const excluded = pairs.filter((pair) => pair.verdict === PAIR_VERDICTS.QUALIFIED && pair.compliant !== true);

  const taskFamilies = [...new Set(qualified.map((pair) => pair.taskFamily))].sort();
  const modelFamilies = [...new Set(qualified.map((pair) => pair.modelFamily))].sort();
  const modelOnTwoTasks = [...new Set(qualified.map((pair) => pair.modelFamily))].filter((family) => new Set(qualified.filter((pair) => pair.modelFamily === family).map((pair) => pair.taskFamily)).size >= 2).sort();
  const taskOnTwoModels = [...new Set(qualified.map((pair) => pair.taskFamily))].filter((family) => new Set(qualified.filter((pair) => pair.taskFamily === family).map((pair) => pair.modelFamily)).size >= 2).sort();

  const clauses = Object.freeze({
    twoTaskFamilies: taskFamilies.length >= 2,
    twoModelFamilies: modelFamilies.length >= 2,
    modelOnTwoTaskFamilies: modelOnTwoTasks.length >= 1,
    taskFamilyOnTwoModelFamilies: taskOnTwoModels.length >= 1,
  });

  /** §2.1: the full 2×2 cross is RECORDED, not required — the bridge is the minimum. */
  const fullCross = taskFamilies.length >= 2 && modelFamilies.length >= 2 && taskFamilies.every((task) => modelFamilies.every((model) => qualified.some((pair) => pair.taskFamily === task && pair.modelFamily === model)));

  const green = Object.values(clauses).every((value) => value === true);

  return Object.freeze({
    green,
    clauses,
    qualifiedPairs: qualified.length,
    excludedNonCompliant: excluded.length,
    taskFamilies: Object.freeze(taskFamilies),
    modelFamilies: Object.freeze(modelFamilies),
    modelsOnTwoTaskFamilies: Object.freeze(modelOnTwoTasks),
    taskFamiliesOnTwoModelFamilies: Object.freeze(taskOnTwoModels),
    fullTwoByTwoCross: fullCross,
    note: '§2.6: only COMPLIANT fixtures count toward this gate.',
  });
}
