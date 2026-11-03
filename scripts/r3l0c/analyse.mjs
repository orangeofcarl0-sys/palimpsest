/**
 * R3-L0C §13-§22 — THE PAIRED ANALYSIS AND THE FROZEN VERDICTS.
 *
 * §19's POSITIVE_SIGNAL is a CONJUNCTION of five conditions, and §19 fixes them before trial 1 so no analysis can
 * restate them loosely. §20 keeps the net-cost verdict SEPARATE and forbids it from overwriting the compression
 * verdict. §21 states the design point that makes this stage different from a correctness experiment: a
 * correctness gap is NOT required, because `same answer with less re-derivation` is the intended success mode.
 *
 * WHY THE BLOCK IS THE PAIRING UNIT. §12 randomizes the arm order INSIDE each block, so the block is the unit
 * that controls for whatever the block's circumstances were. A comparison of C against H pooled across blocks
 * would mix the block effect into the treatment effect, and at n=4 blocks the honest unit is the block.
 *
 * WHY THE COMPLETION-BUDGET CONDITION EXISTS. §19's fifth condition forbids a cost win that hides an excess
 * completion failure. The R3-L0 b0-C-G3 event is why: a generation that exhausts its cognitive budget produces a
 * cheaper trace and no answer, and averaging that into a cost improvement would be a false positive. So the
 * condition is checked per block and it is a CONJUNCTION rather than an average.
 *
 * NO P-VALUES. §19 forbids them at n=4.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { COMPRESSION_VERDICT_RULES, CORRECTNESS_INTERPRETATION, NET_COST_VERDICT_RULES } from './contract.mjs';

const NL = String.fromCharCode(10);

/** §19: the paired dimension outcomes, each a direction or a tie. */
export const DIRECTIONS = Object.freeze({ C_LOWER: 'C_LOWER', C_HIGHER: 'C_HIGHER', TIE: 'TIE' });

/** §20: the net-cost values. */
export const NET_COST = Object.freeze({ LOWER: 'LOWER', NEUTRAL: 'NEUTRAL', HIGHER: 'HIGHER', MIXED: 'MIXED' });

/** §19: the compression verdicts. */
export const COMPRESSION = Object.freeze({ POSITIVE_SIGNAL: 'POSITIVE_SIGNAL', ADVERSE_SIGNAL: 'ADVERSE_SIGNAL', MIXED: 'MIXED', NO_SIGNAL: 'NO_SIGNAL' });

/** §16: whether a completion cause counts as an excess completion failure for C. */
export function isExcessCompletionFailure(session) {
  return session.completionCause === 'MAX_TOKENS' || session.completionCause === 'TIMEOUT';
}

/**
 * §13/§14/§19: PAIR ONE BLOCK.
 *
 * A block's pair is the C trajectory's TOTALS against the H trajectory's TOTALS across the block's generations,
 * because §12's primary unit is the trajectory: a generation is a step inside a unit, and the reconstruction
 * cost of solving the generation's requirement is the trajectory's cost.
 */
export function pairBlock(block, sessions) {
  const members = sessions.filter((entry) => entry.block === block);
  const h = members.filter((entry) => entry.arm === 'H');
  const c = members.filter((entry) => entry.arm === 'C');
  const sum = (rows, field) => rows.reduce((total, row) => total + (row[field] ?? 0), 0);
  const worstInvariantQuality = (rows) => {
    /** The quality is the prepaid coverage of the FINAL vector; a missing vector is the worst case, not a pass. */
    if (rows.length === 0) return null;
    return Math.min(...rows.map((row) => (row.finalPrepaidCoverage === null || row.finalPrepaidCoverage === undefined ? 0 : row.finalPrepaidCoverage)));
  };

  const hBytes = sum(h, 'rawHistoryBytesReturned');
  const cBytes = sum(c, 'rawHistoryBytesReturned');
  const hArtifacts = sum(h, 'rawHistoryArtifactsRead');
  const cArtifacts = sum(c, 'rawHistoryArtifactsRead');
  const hQuality = worstInvariantQuality(h);
  const cQuality = worstInvariantQuality(c);
  const hCompletionFailures = h.filter(isExcessCompletionFailure).length;
  const cCompletionFailures = c.filter(isExcessCompletionFailure).length;
  /** §14/§20: the search-action and time dimensions the net-cost verdict is computed from. */
  const hActions = sum(h, 'actionsBeforeFirstResult');
  const cActions = sum(c, 'actionsBeforeFirstResult');
  const hElapsed = sum(h, 'elapsedToFirstResultMs');
  const cElapsed = sum(c, 'elapsedToFirstResultMs');

  const direction = (left, right) => (left < right ? DIRECTIONS.C_LOWER : left > right ? DIRECTIONS.C_HIGHER : DIRECTIONS.TIE);

  return Object.freeze({
    block,
    hSessions: Object.freeze(h.map((entry) => entry.sessionId)),
    cSessions: Object.freeze(c.map((entry) => entry.sessionId)),
    hBytes, cBytes, bytesDirection: direction(cBytes, hBytes),
    hArtifacts, cArtifacts, artifactsDirection: direction(cArtifacts, hArtifacts),
    hQuality, cQuality,
    /** §19: "not worse" is >=, so a tie counts as satisfying the condition. */
    qualityNotWorse: hQuality === null || cQuality === null ? null : cQuality >= hQuality,
    hActions, cActions,
    hElapsed, cElapsed,
    hCompletionFailures, cCompletionFailures,
    /** §19: an EXCESS failure is C failing more often than its matched H, which is what must not be hidden. */
    excessCompletionFailure: cCompletionFailures > hCompletionFailures,
    hConsumptionClosed: h.every((entry) => entry.consumptionClosed === true),
    cConsumptionClosed: c.length > 0 && c.every((entry) => entry.consumptionClosed === true),
    hInformationPaths: Object.freeze(h.map((entry) => entry.informationPath)),
    cInformationPaths: Object.freeze(c.map((entry) => entry.informationPath)),
  });
}

/** §19: pair every block. */
export function pairAllBlocks(sessions) {
  const blocks = [...new Set(sessions.map((entry) => entry.block))].sort((left, right) => left - right);
  return Object.freeze(blocks.map((block) => pairBlock(block, sessions)));
}

/**
 * §19: THE RECONSTRUCTION-COMPRESSION VERDICT.
 *
 * The five conditions are evaluated SEPARATELY and reported separately, so a MIXED result names which condition
 * failed rather than only that the conjunction did.
 */
export function compressionVerdict(pairs) {
  const rules = COMPRESSION_VERDICT_RULES;
  const blocks = pairs.length;
  const fewerBytes = pairs.filter((pair) => pair.bytesDirection === DIRECTIONS.C_LOWER).length;
  const fewerArtifacts = pairs.filter((pair) => pair.artifactsDirection === DIRECTIONS.C_LOWER).length;
  const qualityNotWorse = pairs.filter((pair) => pair.qualityNotWorse === true).length;
  const everyCConsumed = pairs.length > 0 && pairs.every((pair) => pair.cConsumptionClosed === true);
  const noHiddenCompletionFailure = pairs.every((pair) => pair.excessCompletionFailure !== true);

  const conditions = Object.freeze([
    Object.freeze({ id: 'FEWER_BYTES', satisfied: fewerBytes >= rules.POSITIVE_SIGNAL.fewerBytesBlocksRequired, detail: `C read fewer raw-history bytes in ${String(fewerBytes)}/${String(blocks)} blocks (required ${String(rules.POSITIVE_SIGNAL.fewerBytesBlocksRequired)})` }),
    Object.freeze({ id: 'FEWER_ARTIFACTS', satisfied: fewerArtifacts >= rules.POSITIVE_SIGNAL.fewerArtifactsBlocksRequired, detail: `C read fewer raw-history artifacts in ${String(fewerArtifacts)}/${String(blocks)} blocks (required ${String(rules.POSITIVE_SIGNAL.fewerArtifactsBlocksRequired)})` }),
    Object.freeze({ id: 'QUALITY_NOT_WORSE', satisfied: qualityNotWorse >= rules.POSITIVE_SIGNAL.qualityNotWorseBlocksRequired, detail: `C terminal invariant quality was not worse in ${String(qualityNotWorse)}/${String(blocks)} blocks (required ${String(rules.POSITIVE_SIGNAL.qualityNotWorseBlocksRequired)})` }),
    Object.freeze({ id: 'CONSUMPTION_IN_EVERY_C_TRAJECTORY', satisfied: everyCConsumed, detail: everyCConsumed ? 'every C trajectory demonstrated a closed capital consumption chain' : 'at least one C trajectory did not demonstrate governed consumption' }),
    Object.freeze({ id: 'NO_HIDDEN_COMPLETION_FAILURE', satisfied: noHiddenCompletionFailure, detail: noHiddenCompletionFailure ? 'no C trajectory suffered an excess completion-budget failure relative to its matched H' : 'a C trajectory suffered an excess completion-budget failure, which averaging must not hide' }),
  ]);

  const failed = conditions.filter((condition) => !condition.satisfied).map((condition) => condition.id);
  const adverseBytes = pairs.filter((pair) => pair.bytesDirection === DIRECTIONS.C_HIGHER).length;
  const adverseArtifacts = pairs.filter((pair) => pair.artifactsDirection === DIRECTIONS.C_HIGHER).length;
  const adverseQuality = pairs.filter((pair) => pair.qualityNotWorse === false).length;
  const adverseCompletion = pairs.filter((pair) => pair.excessCompletionFailure === true).length;

  let verdict;
  if (failed.length === 0) verdict = COMPRESSION.POSITIVE_SIGNAL;
  else if (adverseBytes >= rules.ADVERSE_SIGNAL.blocksRequired || adverseArtifacts >= rules.ADVERSE_SIGNAL.blocksRequired || adverseQuality >= rules.ADVERSE_SIGNAL.blocksRequired || adverseCompletion >= rules.ADVERSE_SIGNAL.blocksRequired) verdict = COMPRESSION.ADVERSE_SIGNAL;
  else if (fewerBytes > 0 || fewerArtifacts > 0 || adverseBytes > 0 || adverseArtifacts > 0 || adverseQuality > 0) verdict = COMPRESSION.MIXED;
  else verdict = COMPRESSION.NO_SIGNAL;

  return Object.freeze({
    kind: 'ReconstructionCompressionVerdict',
    verdict,
    conditions,
    failedConditions: Object.freeze(failed),
    blocks,
    fewerBytesBlocks: fewerBytes,
    fewerArtifactsBlocks: fewerArtifacts,
    qualityNotWorseBlocks: qualityNotWorse,
    adverseBlocks: Object.freeze({ bytes: adverseBytes, artifacts: adverseArtifacts, quality: adverseQuality, completion: adverseCompletion }),
    pValues: rules.pValues,
    /** §21: the correctness interpretation, carried with the verdict so no reader infers a required gap. */
    correctnessInterpretation: CORRECTNESS_INTERPRETATION,
  });
}

/**
 * §20: THE NET COGNITIVE-COST VERDICT.
 *
 * Reported SEPARATELY, on the paired dimensions §20 lists, and it must NOT overwrite the compression verdict.
 * A dimension is C_LOWER / C_HIGHER / TIE per block, and the verdict is MIXED when the dimensions disagree.
 */
export function netCostVerdict(pairs) {
  const rules = NET_COST_VERDICT_RULES;
  const dimensionOf = (field) => {
    let lower = 0;
    let higher = 0;
    for (const pair of pairs) {
      const h = pair[`h${field}`];
      const c = pair[`c${field}`];
      if (h === undefined || c === undefined) continue;
      if (c < h) lower += 1;
      else if (c > h) higher += 1;
    }
    return Object.freeze({ lower, higher, tie: pairs.length - lower - higher, direction: lower > higher ? NET_COST.LOWER : higher > lower ? NET_COST.HIGHER : NET_COST.NEUTRAL });
  };
  const dimensions = Object.freeze({
    rawHistoryBytes: dimensionOf('Bytes'),
    rawHistoryArtifacts: dimensionOf('Artifacts'),
    totalToolActions: dimensionOf('Actions'),
    elapsedMs: dimensionOf('Elapsed'),
  });
  const directions = Object.values(dimensions).map((entry) => entry.direction);
  const distinct = [...new Set(directions)];
  const verdict = distinct.length === 1 ? distinct[0] : NET_COST.MIXED;
  return Object.freeze({
    kind: 'NetCognitiveCostVerdict',
    verdict,
    dimensions,
    overridesCompressionVerdict: rules.overridesCompressionVerdict,
    law: rules.law,
    note: 'provider token accounting may vary, so token dimensions are recorded as secondary where available and are not the basis of this verdict',
  });
}

/**
 * §15: THE RELIABILITY CONSTRAINT, evaluated separately from cost.
 *
 * Capital cannot be considered beneficial if reconstruction cost fell by ignoring history and implementing the
 * wrong current standing. This reports the invariant quality per arm so a cost win with a quality loss is visible
 * rather than absorbed into a cost verdict.
 */
export function reliabilityReport(sessions) {
  const summarize = (rows) => {
    const final = rows.map((row) => row.finalPrepaidCoverage).filter((value) => value !== null && value !== undefined);
    const first = rows.map((row) => row.firstCandidatePrepaidCoverage).filter((value) => value !== null && value !== undefined);
    return Object.freeze({
      sessions: rows.length,
      meanFinalPrepaidCoverage: final.length === 0 ? null : final.reduce((total, value) => total + value, 0) / final.length,
      meanFirstCandidatePrepaidCoverage: first.length === 0 ? null : first.reduce((total, value) => total + value, 0) / first.length,
      perfectFinalSessions: final.filter((value) => value === 1).length,
      projectVerificationPassed: rows.filter((row) => row.projectVerificationOk === true).length,
      completionFailures: rows.filter(isExcessCompletionFailure).length,
    });
  };
  return Object.freeze({
    kind: 'ReliabilityReport',
    H: summarize(sessions.filter((entry) => entry.arm === 'H')),
    C: summarize(sessions.filter((entry) => entry.arm === 'C')),
    law: 'capital cannot be considered beneficial if reconstruction cost falls by ignoring history and implementing the wrong current standing',
  });
}

/** §16: the completion-budget outcome, recorded per arm because R3-L0 made it a first-class safety outcome. */
export function completionReport(sessions) {
  const causes = {};
  for (const session of sessions) {
    const key = `${session.arm}:${session.completionCause}`;
    causes[key] = (causes[key] ?? 0) + 1;
  }
  return Object.freeze({ kind: 'CompletionReport', causes: Object.freeze(causes) });
}

/** §22: the contrast, carried with the analysis so no claim can widen it. */
export function contrastStatement() {
  return Object.freeze({
    only: 'raw history versus the same raw history plus governed selected capital',
    noHistoryArm: true,
    forbiddenClaims: Object.freeze(['raw history causally improves performance', 'base-model prior is insufficient']),
  });
}

export { NL };
