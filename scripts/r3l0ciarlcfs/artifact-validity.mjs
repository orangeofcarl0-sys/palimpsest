/**
 * R3-L0C-I-A-R-L-C-F-S §6 Gate S4 — VALID MEASUREMENT VERSUS PARSEABLE ARTIFACT.
 *
 * THE DEFECT THIS CLOSES, measured by `baseline/legacy-controls.mjs controlFalseArtifactInterpretability` against the
 * real `8bf8d42` code: `interpretArtifact` declared an artifact INTERPRETABLE whenever it yielded ANY parseable
 * record, so an artifact whose only record was `{"type":"noise"}` produced apparently measured zeros from the frozen
 * `reconstructCost` — indistinguishable from a legitimate zero.
 *
 * THE ENVELOPE, DERIVED FROM THE ACTUAL FORMAT. §6: "Derive the minimal validity envelope from this actual format and
 * the frozen study semantics. Do not invent additional requirements unrelated to the measured endpoints." Reading
 * `scripts/r3l0c/instrumentation.mjs`, the frozen `reconstructCost` depends on exactly three things:
 *
 *   · `turn/start`            the wall-clock ORIGIN for `elapsedToFirstResultMs` (§10's "measured rather than inferred")
 *   · `tool/ptc-dispatch`     the counted actions, the corpus reads and the capital pulls
 *   · a Result submission     the completion boundary (`completionCause: 'RESULT_SUBMITTED'`) or a `turn/end` reason
 *
 * So the envelope is: at least one parseable record; a Session Start observation; and a completion boundary
 * appropriate to the claimed endpoint. Nothing beyond that is required, because nothing beyond that is measured.
 *
 * WHAT THIS MODULE DOES NOT DO. §6: "It must not implement a second cost-counting algorithm." This module only
 * VALIDATES; the frozen `reconstructCost` still produces every number, and it is called only after validation passes.
 *
 * THE DISTINCTIONS §6 REQUIRES. A legitimate measured zero has a real Session Start, a valid completion observation,
 * zero raw-history reads and zero capital pulls, and REMAINS a real measured zero. By contrast, one arbitrary JSON
 * object, an empty session, an artifact whose frames cannot be verified as complete enough, truncated or corrupted
 * JSONL, a missing start/completion observation, and a failed or censored execution presented as an ordinary
 * completed result are each their OWN named state and never a measured zero.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { ARTIFACT_ENVELOPE, ARTIFACT_VALIDITY_STATES, NL } from './contract.mjs';

/** §6: the named state, so a caller reads the verdict by name rather than by a boolean. */
export function validityState(id) {
  return ARTIFACT_VALIDITY_STATES.find((entry) => entry.id === id) ?? Object.freeze({ id, interpretable: false, detail: 'an undeclared artifact validity state' });
}

/** §6: whether the artifact's compressed frames decompressed to content at all. */
function readFrames(input) {
  const { artifactPath, decompressFrames } = input;
  try { return Object.freeze({ ok: true, text: decompressFrames(artifactPath) }); }
  catch (error) { return Object.freeze({ ok: false, text: null, reason: `the artifact could not be decompressed: ${String(error?.message ?? error).slice(0, 160)}` }); }
}

/**
 * §6: PARSE THE RECORDS, DISTINGUISHING A TORN FRAME FROM A TORN LINE.
 *
 * The frozen `sessionRecords` SKIPS a line that does not parse, which is right for a torn frame but hides a
 * corrupted line. So the parse is done here with a count of the lines that did not parse, and a non-zero count is
 * reported as MALFORMED — which is how "truncated or corrupted JSONL" becomes its own state rather than a shorter
 * record list that still looks valid.
 */
function parseRecords(text) {
  const records = [];
  let unparsed = 0;
  for (const line of String(text).split(String.fromCharCode(10))) {
    if (line.trim() === '') continue;
    try { records.push(JSON.parse(line)); } catch { unparsed += 1; }
  }
  return Object.freeze({ records, unparsed });
}

/**
 * §6: VALIDATE AN ARTIFACT'S EVENT ENVELOPE.
 *
 * The result exposes, as §6 requires: whether the artifact is readable; whether its event envelope is valid; whether
 * the relevant completion boundary is observed; whether a claimed zero comes from a real observation; and whether the
 * measurement is partial, absent or uninterpretable.
 */
export function validateArtifactEnvelope(input) {
  const { artifactPath, decompressFrames, sessionRecords, claimedEndpoint = 'COMPLETED_SESSION' } = input;
  const frames = readFrames({ artifactPath, decompressFrames });

  if (frames.ok !== true) {
    return invalid('UNREADABLE', { reason: frames.reason, claimedEndpoint, readable: false });
  }
  const text = frames.text;
  if (typeof text !== 'string' || text.trim() === '') {
    return invalid('UNREADABLE', { reason: 'the artifact decompressed to no content, so it is unreadable rather than a measured zero', claimedEndpoint, readable: true });
  }

  const parsed = parseRecords(text);
  if (parsed.records.length === 0) {
    return invalid('MALFORMED', { reason: 'the artifact contains content but no parseable session records, so it is malformed rather than a measured zero', claimedEndpoint, readable: true, unparsedLines: parsed.unparsed });
  }

  /** §6: a torn or corrupted line is its own state, even when other lines parsed. */
  if (parsed.unparsed > 0) {
    return invalid('MALFORMED', { reason: `${String(parsed.unparsed)} line(s) did not parse, so the artifact is truncated or corrupted rather than a complete session`, claimedEndpoint, readable: true, unparsedLines: parsed.unparsed, recordCount: parsed.records.length });
  }

  const records = parsed.records;
  const types = new Set(records.map((record) => record?.type).filter((type) => typeof type === 'string'));

  /** The Session Start observation, which the frozen wall-clock measure depends on. */
  const hasSessionStart = ARTIFACT_ENVELOPE.requiredRecordTypes.every((type) => types.has(type));
  if (hasSessionStart !== true) {
    return invalid('ENVELOPE_INVALID', {
      reason: `the artifact carries no [${ARTIFACT_ENVELOPE.requiredRecordTypes.join(', ')}] observation, which the frozen cost definitions require as the wall-clock origin`,
      claimedEndpoint, readable: true, recordCount: records.length, types: Object.freeze([...types]),
    });
  }

  /** The completion boundary: a Result submission, or a runtime `turn/end` reason. */
  const hasResultSubmission = records.some((record) => record?.type === ARTIFACT_ENVELOPE.dispatchRecordType && isResultDispatch(record));
  const hasTurnEnd = ARTIFACT_ENVELOPE.completionRecordTypes.some((type) => types.has(type));
  const completionObserved = hasResultSubmission === true || hasTurnEnd === true;
  if (completionObserved !== true) {
    return invalid('COMPLETION_NOT_OBSERVED', {
      reason: `the artifact carries a Session Start but no completion boundary (neither a ${ARTIFACT_ENVELOPE.resultDispatchTool} submission nor a ${ARTIFACT_ENVELOPE.completionRecordTypes.join('/')} record), so the completed-session endpoint the measurement claims was never observed`,
      claimedEndpoint, readable: true, recordCount: records.length, types: Object.freeze([...types]),
    });
  }

  /**
   * §6: A PARTIAL EXECUTION IS ITS OWN STATE. A `turn/end` whose reason is a timeout or a token ceiling, with no
   * Result submission, is a PARTIAL observation: the diagnostic evidence is preserved, and the measurement is
   * labelled according to the frozen protocol rather than presented as an ordinary completed result.
   */
  const turnEndReason = records.find((record) => record?.type === 'turn/end')?.data?.reason?.kind ?? null;
  const partial = hasResultSubmission !== true && (turnEndReason === 'timeout' || turnEndReason === 'max-tokens');
  if (partial === true) {
    return invalid('COMPLETION_NOT_OBSERVED', {
      reason: `the session ended with the runtime reason "${String(turnEndReason)}" and no Result submission, so it is a PARTIAL observation rather than an ordinary completed session`,
      claimedEndpoint, readable: true, recordCount: records.length, types: Object.freeze([...types]), partial: true, turnEndReason,
    });
  }

  /** The dispatch evidence the frozen counter reads, so a claimed zero can be attributed to real observations. */
  const dispatches = records.filter((record) => record?.type === ARTIFACT_ENVELOPE.dispatchRecordType);

  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C-F-S',
    kind: 'artifact event-envelope validity',
    artifactPath,
    state: 'VALID_MEASURED',
    interpretable: true,
    readable: true,
    envelopeValid: true,
    completionObserved: true,
    completionBoundary: hasResultSubmission ? 'RESULT_SUBMITTED' : `TURN_END:${String(turnEndReason)}`,
    claimedEndpoint,
    recordCount: records.length,
    unparsedLines: 0,
    dispatchCount: dispatches.length,
    types: Object.freeze([...types]),
    hasSessionStart: true,
    hasResultSubmission,
    hasTurnEnd,
    partial: false,
    /** §6: the zero-from-a-real-observation distinction is decided against the REAL observations, not a parser default. */
    zeroIsFromRealObservation: true,
    reason: null,
    law: 'an artifact is interpretable only when it is readable, fully parseable, carries a Session Start observation and reaches the completion boundary the claimed endpoint requires',
  });
}

/** §6: build an invalid result from a named state, so the failure is a named fact rather than a boolean. */
function invalid(id, input) {
  const state = validityState(id);
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C-F-S',
    kind: 'artifact event-envelope validity',
    artifactPath: input.artifactPath ?? null,
    state: id,
    interpretable: false,
    readable: input.readable === true,
    envelopeValid: false,
    completionObserved: false,
    claimedEndpoint: input.claimedEndpoint ?? null,
    recordCount: input.recordCount ?? 0,
    unparsedLines: input.unparsedLines ?? 0,
    types: input.types ?? Object.freeze([]),
    hasSessionStart: false,
    hasResultSubmission: false,
    hasTurnEnd: false,
    partial: input.partial === true,
    turnEndReason: input.turnEndReason ?? null,
    zeroIsFromRealObservation: false,
    stateDetail: state.detail,
    reason: input.reason,
    law: 'an artifact that is unreadable, malformed, envelope-invalid or missing its completion boundary is NEVER a measured zero',
  });
}

/** §6: whether a dispatch record is the Result submission, by the tool name the frozen instrumentation matches. */
function isResultDispatch(record) {
  const name = String(record?.data?.name ?? '');
  if (name === ARTIFACT_ENVELOPE.resultDispatchTool) return true;
  const args = record?.data?.arguments;
  const text = typeof args === 'string' ? args : (args === null || args === undefined ? '' : JSON.stringify(args));
  return text.includes(ARTIFACT_ENVELOPE.resultDispatchTool);
}

/**
 * §6: THE VALIDATED MEASUREMENT.
 *
 * The validation runs FIRST, and the frozen `reconstructCost` is called ONLY when the envelope is valid. An invalid
 * observation returns null cost fields rather than invented zeros, so it cannot satisfy `CostMeasuredComplete` or
 * `LivePrimaryCostComplete`.
 */
export async function measureValidatedArtifact(input) {
  const { artifactPath, attemptId = null, claimedEndpoint } = input;
  const { decompressFrames, sessionRecords, reconstructCost } = await import('../r3l0c/instrumentation.mjs');
  const validity = validateArtifactEnvelope({ artifactPath, decompressFrames, sessionRecords, claimedEndpoint });
  if (validity.interpretable !== true) {
    return Object.freeze({
      validity,
      measured: false,
      fields: null,
      cost: null,
      /** §6: the cost fields are ABSENT rather than zero, so an invalid measurement cannot satisfy a measured level. */
      costFieldsAbsent: true,
      satisfiesCostMeasuredComplete: false,
      satisfiesLivePrimaryCostComplete: false,
      reason: validity.reason,
    });
  }
  const cost = reconstructCost({ path: artifactPath, attemptId });
  const fields = Object.freeze({
    rawHistoryArtifactsRead: cost.rawHistoryArtifactsRead,
    rawHistoryArtifactIds: cost.rawHistoryArtifactIds,
    rawHistoryBytesReturned: cost.rawHistoryBytesReturned,
    historyReadActions: cost.historyReadActions,
    capitalPullActions: cost.capitalPullActions,
    capitalPullReturned: cost.capitalPullReturned,
    actionsBeforeFirstResult: cost.actionsBeforeFirstResult,
    elapsedToFirstResultMs: cost.elapsedToFirstResultMs,
    completionCause: cost.completionCause,
  });
  /** §6: a genuine measured zero has a real Session Start and completion, and its zeros ARE the observation. */
  const measuredZero = fields.rawHistoryArtifactsRead === 0 && fields.rawHistoryArtifactIds.length === 0;
  return Object.freeze({
    validity,
    measured: true,
    fields,
    cost,
    costFieldsAbsent: false,
    measuredZero,
    measuredZeroIsGenuine: measuredZero === true && validity.hasSessionStart === true && validity.completionObserved === true,
    satisfiesCostMeasuredComplete: true,
    satisfiesLivePrimaryCostComplete: false,
    reason: null,
  });
}

export { NL };
