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

import { ANTI_OVERFIT_PROCESSES } from './fixture-manifest.mjs';

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

/* ---------------------------------------------------------------- §2.3/§5/§6 class-series grouping */

/**
 * §5 (R3-AE): THE PER-CLASS OBSERVED SERIES.
 *
 * The real values live at `trial.classPass[classId]`. An earlier implementation read `trial[classId]`, which
 * is `undefined` for every class, so every class produced the SAME all-undefined series and collapsed into
 * one group. That defect is why this is now an explicit function with its own tests.
 *
 * @param {readonly { classPass?: Record<string, boolean> }[]} trials
 * @param {readonly string[]} classIds
 * @returns {Readonly<Record<string, readonly boolean[]>>}
 */
export function classSeries(trials, classIds) {
  return Object.freeze(Object.fromEntries(classIds.map((classId) => [classId, Object.freeze(trials.map((trial) => trial?.classPass?.[classId] === true))])));
}

/**
 * §5/§6 (R3-AE): GROUP FAILURE CLASSES BY THEIR IDENTICAL OBSERVED SERIES.
 *
 * A group is one NON-REDUNDANT measurement. Two classes that pass and fail together are one dimension, not
 * two — counting them separately is how a fixture with one underlying behaviour would fake two dimensions.
 *
 * @param {Readonly<Record<string, readonly boolean[]>>} seriesByClass
 */
export function groupClassesBySeries(seriesByClass) {
  const groups = [];
  for (const [classId, series] of Object.entries(seriesByClass)) {
    const key = series.map((value) => (value ? 1 : 0)).join('');
    const match = groups.find((group) => group.key === key);
    if (match === undefined) groups.push({ key, members: [classId], series });
    else match.members.push(classId);
  }
  return Object.freeze(groups.map((group) => Object.freeze({
    members: Object.freeze(group.members.slice().sort()),
    passes: group.series.filter(Boolean).length,
    of: group.series.length,
    raw: `${String(group.series.filter(Boolean).length)}/${String(group.series.length)}`,
    /** §5: a group VARIES when its members are neither always passed nor always failed. */
    variable: group.series.some(Boolean) && !group.series.every(Boolean),
    invariant: group.series.every(Boolean) || !group.series.some(Boolean),
  })));
}

/**
 * §2.3: NON-REDUNDANT DIMENSIONS (DIAGNOSTIC ONLY).
 *
 * Kept as a general helper, but §5 is explicit that `classCoverage` and `fullSolve` must NOT be counted
 * toward QC-2. They are reported as diagnostics and nothing more.
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
      classGroups: Object.freeze([]),
      variableGroups: Object.freeze([]),
      variableDirectGroups: Object.freeze([]),
      classCoverage: null,
      diagnostics: null,
      fixtureAuditPrecondition: input.fixtureAuditPrecondition ?? null,
    });
  }

  /* -- §5/§6: THE CORRECTED CLASS-SERIES GROUPING ----------------------------- */
  /**
   * The per-class observed series, read from `trial.classPass[classId]` through the explicit helper. Groups
   * are formed by IDENTICAL series, so two classes that always agree count once.
   */
  const series = classSeries(runs, input.classIds);
  const groups = groupClassesBySeries(series);

  /** §6: the per-group DIRECT/TRANSFER membership, read from the FROZEN relationship manifest. */
  const relationshipOf = input.relationshipOf ?? (() => 'NONE');
  const classGroups = groups.map((group) => {
    const directMembers = group.members.filter((classId) => relationshipOf(classId) === 'DIRECT');
    const transferMembers = group.members.filter((classId) => relationshipOf(classId) === 'TRANSFER_HYPOTHESIS');
    return Object.freeze({
      members: group.members,
      raw: group.raw,
      variable: group.variable,
      invariant: group.invariant,
      directMembers: Object.freeze(directMembers),
      transferMembers: Object.freeze(transferMembers),
      /** §6: a group is DIRECT-treatment-relevant when at least one of its members is frozen DIRECT. */
      directTreatmentRelevant: directMembers.length > 0,
    });
  });

  /** §5: QC-2 counts VARIABLE NON-REDUNDANT FAILURE-CLASS GROUPS, and nothing else. */
  const variableGroups = classGroups.filter((group) => group.variable);
  const variableDirectGroups = variableGroups.filter((group) => group.directTreatmentRelevant);

  /** §12: the per-class headroom, kept as diagnostics alongside the group view. */
  const classHeadroom = input.classIds.map((classId) => {
    const passes = runs.filter((trial) => trial.classPass?.[classId] === true).length;
    return Object.freeze({
      classId,
      passes,
      of: runs.length,
      raw: `${String(passes)}/${String(runs.length)}`,
      state: passes === runs.length ? 'CEILING' : passes === 0 ? 'FLOOR' : 'VARIABLE',
      varies: passes > 0 && passes < runs.length,
      directTreatmentRelevant: input.directClasses.includes(classId),
      relationship: relationshipOf(classId),
    });
  });

  /** §2.2: the aggregate class coverage, averaged over runs. A DIAGNOSTIC, never a QC-2 dimension. */
  const coveragePerRun = runs.map((trial) => input.classIds.filter((classId) => trial.classPass?.[classId] === true).length / input.classIds.length);
  const classCoverage = coveragePerRun.reduce((total, value) => total + value, 0) / coveragePerRun.length;

  /* -- QC-1 (§2.2): bidirectional aggregate headroom -- */
  const withinBounds = classCoverage > QUALIFICATION_BOUNDS.lower && classCoverage < QUALIFICATION_BOUNDS.upper;
  if (!withinBounds) {
    const side = classCoverage <= QUALIFICATION_BOUNDS.lower ? 'FLOOR (no room to detect harm)' : 'CEILING (no room to detect help)';
    reasons.push(`QC-1 failed: aggregate class coverage ${classCoverage.toFixed(3)} is outside (${String(QUALIFICATION_BOUNDS.lower)}, ${String(QUALIFICATION_BOUNDS.upper)}) — ${side}`);
  }

  /* -- QC-2 (§5): ≥2 variable non-redundant failure-class groups -- */
  if (variableGroups.length < MIN_CLASS_HEADROOM.minVaryingDirectClasses) {
    reasons.push(`QC-2 failed: ${String(variableGroups.length)} variable non-redundant failure-class group(s) vary, ${String(MIN_CLASS_HEADROOM.minVaryingDirectClasses)} required — groups: ${classGroups.map((group) => `${group.members.join('+')}=${group.raw}`).join(', ')}`);
  }

  /* -- QC-4 (§6): ≥2 variable groups with ≥1 DIRECT member each -- */
  if (variableDirectGroups.length < MIN_CLASS_HEADROOM.minVaryingDirectClasses) {
    reasons.push(`QC-4 failed: ${String(variableDirectGroups.length)} variable non-redundant group(s) carry a DIRECT member, ${String(MIN_CLASS_HEADROOM.minVaryingDirectClasses)} required — DIRECT groups: ${variableDirectGroups.map((group) => group.members.join('+')).join(', ') || '(none)'}`);
  }

  /* -- QC-5 (§12): success must not hinge on one unrelated residual group -- */
  if (variableGroups.length === 1 && variableGroups[0].directTreatmentRelevant === false) {
    reasons.push('QC-5 failed: all class variance traces to ONE group with no DIRECT member (the R2-V outcome-mismatch shape)');
  }

  /* -- QC-6 (§8): the deterministic fixture-audit precondition -- */
  /**
   * §8 (R3-AE): QC-6 is no longer "classIds is non-empty". The pair cannot QUALIFY unless the fixture's own
   * deterministic audit proves the oracle is mechanical, that every hidden case declares a class, that every
   * declared class is exercised, and that the oracle consults no model self-report. The ANALYSIS must not
   * manufacture this value; it is supplied from the fixture audit and only `true` passes.
   */
  const precondition = input.fixtureAuditPrecondition ?? null;
  if (precondition === null || precondition === undefined) {
    reasons.push('QC-6 failed: no fixture-audit precondition was supplied, so the mechanical-oracle proof is absent');
  } else if (precondition.mechanicalOracleProven !== true
    || precondition.allHiddenCasesDeclareFailureClass !== true
    || precondition.allDeclaredClassesAreExercised !== true
    || precondition.oracleUsesNoModelSelfReport !== true) {
    reasons.push(`QC-6 failed: the fixture-audit precondition is not fully satisfied (${JSON.stringify({ mechanicalOracleProven: precondition.mechanicalOracleProven === true, allHiddenCasesDeclareFailureClass: precondition.allHiddenCasesDeclareFailureClass === true, allDeclaredClassesAreExercised: precondition.allDeclaredClassesAreExercised === true, oracleUsesNoModelSelfReport: precondition.oracleUsesNoModelSelfReport === true })})`);
  }

  return Object.freeze({
    fixtureId: input.fixtureId,
    modelId: input.modelId,
    verdict: reasons.length === 0 ? PAIR_VERDICTS.QUALIFIED : PAIR_VERDICTS.UNQUALIFIED,
    reasons: Object.freeze(reasons),
    classHeadroom: Object.freeze(classHeadroom),
    /** §5/§6: the corrected grouping, so a report can cite the exact groups. */
    classGroups: Object.freeze(classGroups),
    variableGroups: Object.freeze(variableGroups.map((group) => group.members.join('+'))),
    variableDirectGroups: Object.freeze(variableDirectGroups.map((group) => group.members.join('+'))),
    classCoverage,
    coveragePerRun: Object.freeze(coveragePerRun.map((value) => Number(value.toFixed(4)))),
    varyingClasses: Object.freeze(variableGroups.flatMap((group) => group.members)),
    /** §5: `classCoverage`/`fullSolve` are DIAGNOSTICS; they are reported and never counted toward QC-2. */
    diagnostics: Object.freeze({
      classCoverage,
      fullSolve: Object.freeze(runs.map((trial) => trial.fullSolve === true)),
      nonRedundantDimensions: Object.freeze(nonRedundantDimensions(runs, ['classCoverage', 'fullSolve']).map((group) => group.dimensions.join('+'))),
      note: 'reported for context only; §5 forbids counting these toward QC-2',
    }),
    fixtureAuditPrecondition: precondition,
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
 * §2.6/§10 (R3-AE): ONLY fixtures whose FROZEN MANIFEST classifies them `COMPLIANT` count toward the gate.
 * The compliance value is READ FROM THE MANIFEST — the caller supplies `antiOverfitProcess`, and an earlier
 * implementation's hard-coded `compliant: true` literal is gone. A caller that omits the field excludes the
 * pair rather than admitting it, so the gate fails closed.
 *
 * @param {readonly { fixtureId: string, taskFamily: string, modelId: string, modelFamily: string, verdict: string, antiOverfitProcess?: string }[]} pairs
 */
export function aToBGate(pairs) {
  const qualified = pairs.filter((pair) => pair.verdict === PAIR_VERDICTS.QUALIFIED && pair.antiOverfitProcess === ANTI_OVERFIT_PROCESSES.COMPLIANT);
  const excluded = pairs.filter((pair) => pair.verdict === PAIR_VERDICTS.QUALIFIED && pair.antiOverfitProcess !== ANTI_OVERFIT_PROCESSES.COMPLIANT);

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
