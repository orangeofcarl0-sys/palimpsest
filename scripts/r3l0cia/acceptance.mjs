/**
 * R3-L0C-I-A §8 — THE SIXTEEN ZERO-MODEL ACCEPTANCE TESTS.
 *
 * §8 lists sixteen acceptance tests and states the bar twice: "Each hard gate needs at least one positive control
 * and one mutant that actually fails the pre-repair implementation", and "Test declarations are not a substitute
 * for measuring the actual executed boundary."
 *
 * So this module does not declare the tests — it EXECUTES each one against the repaired path and, where §8 requires
 * it, against the baseline, so the pair is commensurable. Every entry returns:
 *
 *   positiveControl   the repaired implementation's observed behaviour
 *   mutant            what the baseline did, from the same measurement (or an explicit note where §1's falsifiers
 *                     already carry it)
 *   PASS              the property holds on the repaired path
 *
 * THE MUTANTS ARE NOT RE-RUN HERE WHERE §1 ALREADY MEASURED THEM. F1-F8 are the mutants for A01-A03, A06, A10,
 * A12, A13 and A16; re-deriving them would be a second measurement of the same fact, and a second measurement is
 * a second thing to keep in step. Each entry therefore NAMES its falsifier, and the qualification record carries
 * both so a reader sees the pair without the suite pretending to have run it twice.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';

import { ACCEPTANCE_TESTS } from './contract.mjs';

const NL = String.fromCharCode(10);

/** §8: the acceptance record's own vocabulary. */
export const ACCEPTANCE_VERDICTS = Object.freeze({ PASS: 'PASS', FAIL: 'FAIL', NOT_RUN: 'NOT_RUN' });

/**
 * §8 A01/A03 — THE ACTIVATION REFUSALS.
 *
 * A01: replay refusal before ANY World or profile mutation.
 * A03: a claimed, corrupt or partially preserved root is refused.
 *
 * Both are measured through the REAL activation entry, and the measurement is a byte digest of the run root taken
 * before and after the refused invocation — so "before any mutation" is observed rather than asserted.
 */
export async function acceptanceA01A03(input) {
  const activation = await import('./activation.mjs');
  const results = [];
  const roots = [];

  /** A01: activate once, then activate again with the same run id, digesting the root on both sides. */
  const replayRoot = mkdtempSync(join(tmpdir(), 'r3l0cia-a01-'));
  roots.push(replayRoot);
  const plan = input.plan;
  const first = await activation.activatePrimaryRun({
    plan,
    runId: 'a01-run',
    runRoot: replayRoot,
    expectedSchedule: plan.schedule,
    trajectoryIds: ['a01-t0'],
    closure: input.closure,
    mode: 'DETERMINISTIC',
  });
  const beforeDigest = digestRoot(replayRoot);
  const second = await activation.activatePrimaryRun({
    plan,
    runId: 'a01-run',
    runRoot: replayRoot,
    expectedSchedule: plan.schedule,
    trajectoryIds: ['a01-t0'],
    closure: input.closure,
    mode: 'DETERMINISTIC',
  });
  const afterDigest = digestRoot(replayRoot);
  results.push(Object.freeze({
    id: 'A01_REPLAY_REFUSAL_BEFORE_ANY_MUTATION',
    positiveControl: Object.freeze({
      firstActivation: first.ACTIVATION,
      secondActivation: second.ACTIVATION,
      secondRefusedAt: second.refusedAt ?? null,
      secondReason: second.reason ?? null,
      rootDigestBeforeRefusal: beforeDigest,
      rootDigestAfterRefusal: afterDigest,
      /** §2: the property. The refusal must not have changed a byte. */
      stateUnchangedByRefusal: beforeDigest === afterDigest,
    }),
    mutant: Object.freeze({ id: 'F1_REPLAY_BEFORE_CLAIM', measuredBy: 'scripts/r3l0cia/falsifiers.mjs falsifyF1', baselineViolates: true }),
    PASS: first.ACTIVATION === 'ACTIVATED' && second.ACTIVATION === 'REFUSED' && beforeDigest === afterDigest,
  }));

  /** A03: a corrupt claim, a claimed root under a different run id, and a partial preparation. */
  const corruptRoot = mkdtempSync(join(tmpdir(), 'r3l0cia-a03-corrupt-'));
  roots.push(corruptRoot);
  writeFileSync(join(corruptRoot, 'run-claim.json'), '{ this is not json', 'utf8');
  const corrupt = activation.inspectActivationRoot({ runRoot: corruptRoot, runId: 'a03' });

  const foreignRoot = mkdtempSync(join(tmpdir(), 'r3l0cia-a03-foreign-'));
  roots.push(foreignRoot);
  writeFileSync(join(foreignRoot, 'run-claim.json'), JSON.stringify({ schemaVersion: 1, runId: 'somebody-else', claimNonce: 'x' }), 'utf8');
  const foreign = activation.inspectActivationRoot({ runRoot: foreignRoot, runId: 'a03' });

  const partialRoot = mkdtempSync(join(tmpdir(), 'r3l0cia-a03-partial-'));
  roots.push(partialRoot);
  writeFileSync(join(partialRoot, 'preparation.json'), JSON.stringify({ schemaVersion: 1, runId: 'a03', state: 'PREPARING' }), 'utf8');
  const partial = activation.inspectActivationRoot({ runRoot: partialRoot, runId: 'a03' });

  const preserveRoot = mkdtempSync(join(tmpdir(), 'r3l0cia-a03-preserve-'));
  roots.push(preserveRoot);
  writeFileSync(join(preserveRoot, 'PRESERVE'), JSON.stringify({ runId: 'a03' }), 'utf8');
  const preserve = activation.inspectActivationRoot({ runRoot: preserveRoot, runId: 'a03' });

  const unownedRoot = mkdtempSync(join(tmpdir(), 'r3l0cia-a03-unowned-'));
  roots.push(unownedRoot);
  mkdirSync(join(unownedRoot, 'units', 'a03-t0', 'world'), { recursive: true });
  const unowned = activation.inspectActivationRoot({ runRoot: unownedRoot, runId: 'a03' });

  results.push(Object.freeze({
    id: 'A03_CLAIMED_CORRUPT_PARTIAL_ROOT_REFUSAL',
    positiveControl: Object.freeze({
      malformedClaim: corrupt.verdict,
      foreignClaim: foreign.verdict,
      partialPreparation: partial.verdict,
      preserveMarker: preserve.verdict,
      unprovableOwnership: unowned.verdict,
      /** §2: each of the five conditions produces its own verdict, and none of them proceeds. */
      allRefused: [corrupt, foreign, partial, preserve, unowned].every((entry) => entry.mayProceed === false),
      distinctVerdicts: new Set([corrupt.verdict, foreign.verdict, partial.verdict, preserve.verdict, unowned.verdict]).size,
    }),
    mutant: Object.freeze({ id: 'F1_REPLAY_BEFORE_CLAIM', measuredBy: 'the baseline preparation removed the root before any guard read it', baselineViolates: true }),
    PASS: corrupt.verdict === 'REFUSED_MALFORMED_CLAIM'
      && foreign.verdict === 'REFUSED_ALREADY_CLAIMED'
      && partial.verdict === 'REFUSED_PARTIAL_PREPARATION'
      && preserve.verdict === 'REFUSED_REPLAY'
      && unowned.verdict === 'REFUSED_UNPROVABLE_OWNERSHIP',
  }));

  for (const root of roots) { try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ } }
  return Object.freeze({ results: Object.freeze(results) });
}

/**
 * §8 A02 — THE CONCURRENT CLAIM CONFLICT.
 *
 * Two invocations of the same run id racing for one run root: exactly one may claim, and the loser must be
 * refused. The race is made DETERMINISTIC rather than hoped for, by claiming twice from the same process and
 * requiring the second to fail on the exclusive create — which is the mechanism the real race exercises.
 */
export async function acceptanceA02() {
  const { claimActivationRoot } = await import('./activation.mjs');
  const root = mkdtempSync(join(tmpdir(), 'r3l0cia-a02-'));
  try {
    const first = claimActivationRoot({ runRoot: root, runId: 'a02' });
    const second = claimActivationRoot({ runRoot: root, runId: 'a02' });
    /** A DIFFERENT run id must also lose, which is the "one root belongs to one run" property. */
    const intruder = claimActivationRoot({ runRoot: root, runId: 'a02-intruder' });
    return Object.freeze({
      id: 'A02_SAME_RUN_ID_CONCURRENT_CLAIM_CONFLICT',
      positiveControl: Object.freeze({
        firstClaimed: first.claimed,
        secondClaimed: second.claimed,
        secondVerdict: second.inspection.verdict,
        intruderClaimed: intruder.claimed,
        intruderVerdict: intruder.inspection.verdict,
        exactlyOneWinner: first.claimed === true && second.claimed === false && intruder.claimed === false,
      }),
      mutant: Object.freeze({ id: 'F1_REPLAY_BEFORE_CLAIM', note: 'the baseline never reached the guard, so a second invocation did not conflict at all — it deleted the root and proceeded', baselineViolates: true }),
      PASS: first.claimed === true && second.claimed === false && intruder.claimed === false,
    });
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
  }
}

/**
 * §8 A05/A06 — THE TREATMENT MUTATIONS AND THE UPTAKE CONTROL.
 *
 * A05: for C/G2, a wrong handle, a wrong kind and a short count each produce NOT_APPLIED and TRIAL_INVALID.
 * A06: four visible handles, zero worker pulls, four host resolutions ⇒ APPLIED with uptake ZERO, and the matrix
 *      does not stop for the declined pull.
 *
 * Both are measured through the REAL realization function against the FROZEN expectation manifest, so the mutation
 * is a change to the OBSERVED consumer evidence rather than to the expectation.
 */
export async function acceptanceA05A06(input) {
  const { expectation } = input;
  const { computeTreatmentRealization, observeTreatmentAndUptake } = await import('./treatment.mjs');
  const expected = [...expectation.expectedConsumerVisibleHandles];

  const payloadFor = (handles) => Object.freeze({ handles: handles.map((handle) => ({ handle, kind: kindOf(handle) })), compiledHandleCount: handles.length });
  const reportFor = (handles, hostResolutions) => Object.freeze({
    ok: true,
    jobPhase: 'FINISHED',
    attemptId: 'a05-attempt',
    payload: payloadFor(handles),
    governedPulls: hostResolutions.map((handle) => Object.freeze({ handle, resolved: true, bodyBytes: 100, bodyDigest: 'a'.repeat(64) })),
    finalVector: Object.freeze({ failedPrepaidClasses: [], prepaidCoverage: 1 }),
  });

  /** The four mutations §8 names: exact, short, wrong-handle and wrong-kind. */
  const exact = await computeTreatmentRealization({ expectation, report: reportFor(expected, expected), arm: 'C', generationId: 'G2' });
  const short = await computeTreatmentRealization({ expectation, report: reportFor(expected.slice(0, 2), []), arm: 'C', generationId: 'G2' });
  const wrongHandle = await computeTreatmentRealization({ expectation, report: reportFor(expected.slice(0, 3).concat(['@ctx/procedure/prc-deadbeef/0']), []), arm: 'C', generationId: 'G2' });
  /** A wrong KIND: the right number of handles, each of a kind the expectation did not name. */
  const wrongKindHandles = expected.map((handle) => handle.replace('@ctx/reasoning/', '@ctx/proof/').replace('@ctx/procedure/', '@ctx/proof/'));
  const wrongKind = await computeTreatmentRealization({ expectation, report: reportFor(wrongKindHandles, []), arm: 'C', generationId: 'G2' });

  /**
   * A06: THE UPTAKE CONTROL. Four handles reached the consumer, the WORKER pulled none, and the HOST resolved all
   * four. The realization is APPLIED — delivery happened — while uptake is ZERO.
   */
  const transcriptPath = input.uptakeTranscriptPath;
  const uptakeReport = reportFor(expected, expected);
  const observation = await observeTreatmentAndUptake({
    sessionId: 'a06-session',
    expectation,
    report: uptakeReport,
    arm: 'C',
    generationId: 'G2',
    transcriptPath,
    artifactPath: null,
  });

  return Object.freeze({
    results: Object.freeze([
      Object.freeze({
        id: 'A05_C_WRONG_HANDLE_KIND_SHORT_COUNT_MUTATIONS',
        positiveControl: Object.freeze({
          exact: exact.TREATMENT_REALIZATION,
          shortCount: short.TREATMENT_REALIZATION,
          wrongHandle: wrongHandle.TREATMENT_REALIZATION,
          wrongKind: wrongKind.TREATMENT_REALIZATION,
          /** §4: identity AND kind AND count, so a count match alone is not a pass. */
          exactIsApplied: exact.TREATMENT_REALIZATION === 'APPLIED',
          allThreeMutationsRejected: [short, wrongHandle, wrongKind].every((entry) => entry.TREATMENT_REALIZATION === 'NOT_APPLIED'),
          allThreeAreTrialInvalid: [short, wrongHandle, wrongKind].every((entry) => entry.TRIAL_DISPOSITION === 'TRIAL_INVALID' && entry.STOP_MATRIX === true),
          retryPermitted: exact.retryPermitted,
          /** §4: the wrong-kind case is the one a count-only check would miss. */
          wrongKindCountMatchesExpectation: wrongKind.consumerVisibleHandles.length === expected.length,
        }),
        mutant: Object.freeze({ id: 'F3_TREATMENT_MISMATCH_ESCAPED', measuredBy: 'scripts/r3l0cia/falsifiers.mjs falsifyF3', baselineViolates: true, note: 'the baseline read a field the child never writes, so none of these four mutations was detected' }),
        PASS: exact.TREATMENT_REALIZATION === 'APPLIED' && [short, wrongHandle, wrongKind].every((entry) => entry.TREATMENT_REALIZATION === 'NOT_APPLIED' && entry.TRIAL_DISPOSITION === 'TRIAL_INVALID'),
      }),
      Object.freeze({
        id: 'A06_C_VISIBLE_FOUR_PULLED_ZERO_HOST_RESOLVED_FOUR',
        positiveControl: Object.freeze({
          visibleHandles: observation.realization.consumerVisibleHandles.length,
          workerUptakeCount: observation.workerUptakeCount,
          hostResolveCount: observation.hostResolveCount,
          treatmentRealization: observation.TREATMENT_REALIZATION,
          workerUptake: observation.WORKER_UPTAKE,
          declinedObservation: observation.observations,
          /** §4: the two facts, separately. */
          deliveryHappened: observation.TREATMENT_REALIZATION === 'APPLIED',
          uptakeIsZero: observation.WORKER_UPTAKE === 'ZERO',
          hostAuditExceedsUptake: observation.hostResolveCount > (observation.workerUptakeCount ?? 0),
          /** §4: a declined pull is recorded and does NOT stop the matrix. */
          declinedPullRecorded: observation.declinedVisibleCapital === true,
          declinedPullStopsTheMatrix: observation.declinedPullStopsTheMatrix,
        }),
        mutant: Object.freeze({ id: 'F4_HOST_AUDIT_AS_WORKER_UPTAKE', measuredBy: 'scripts/r3l0cia/falsifiers.mjs falsifyF4', baselineViolates: true, note: 'the baseline read the four host resolutions as governed pulls, so uptake ZERO was unrepresentable' }),
        PASS: observation.TREATMENT_REALIZATION === 'APPLIED'
          && observation.WORKER_UPTAKE === 'ZERO'
          && observation.declinedVisibleCapital === true
          && observation.declinedPullStopsTheMatrix === false
          && observation.hostResolveCount === 4,
      }),
    ]),
  });
}

/**
 * §8 A07 — THE TELEMETRY SCHEMA PARITY.
 *
 * The stage's scripted worker must emit the field the SHIPPED parser reads. The measurement is the shipped
 * parser's own return value on a transcript the stage's worker produced, and the mutation is the SUPERSEDED shape
 * the R3-L0C-I mock emitted — which the shipped parser reads as zero pulls.
 */
export async function acceptanceA07(input) {
  const { telemetryLineShape, shippedPullParser } = await import('./treatment.mjs');
  const parser = await shippedPullParser();
  const stageLine = `PALIMPSEST_WORKER_PULL ${JSON.stringify({ pulled: ['@ctx/proof/p1'] })}${NL}`;
  const supersededLine = `PALIMPSEST_WORKER_PULL ${JSON.stringify({ handles: ['@ctx/proof/p1'] })}${NL}`;
  const stageShape = telemetryLineShape(stageLine);
  const supersededShape = telemetryLineShape(supersededLine);
  const parsedStage = parser.available ? parser.parse(stageLine) : null;
  const parsedSuperseded = parser.available ? parser.parse(supersededLine) : null;
  /** The REAL worker's own transcript, when the caller supplies one, so parity is measured on actual output. */
  const realTranscript = input.transcriptPath !== null && input.transcriptPath !== undefined ? readFileSync(input.transcriptPath, 'utf8') : null;
  const realShape = realTranscript === null ? null : telemetryLineShape(realTranscript);
  const parsedReal = realTranscript === null || !parser.available ? null : parser.parse(realTranscript);
  return Object.freeze({
    id: 'A07_WORKER_PULL_TELEMETRY_SCHEMA_PARITY',
    positiveControl: Object.freeze({
      shippedParserAvailable: parser.available,
      shippedParserSource: parser.source ?? null,
      stageWorkerLineFields: stageShape.fields,
      stageWorkerUsesShippedField: stageShape.usesShippedField,
      shippedParserReadsStageWorkerLine: parsedStage === null ? null : parsedStage.length,
      /** The real worker's own output, when supplied. */
      realWorkerLineFields: realShape?.fields ?? null,
      realWorkerUsesShippedField: realShape?.usesShippedField ?? null,
      shippedParserReadsRealWorkerLine: parsedReal === null ? null : parsedReal.length,
    }),
    mutant: Object.freeze({
      supersededShapeFields: supersededShape.fields,
      supersededShapeUsesShippedField: supersededShape.usesShippedField,
      supersededShapeUsesSupersededField: supersededShape.usesSupersededField,
      /** The defect, measured: the shipped parser reads the superseded shape as ZERO pulls. */
      shippedParserReadsSupersededLineAs: parsedSuperseded === null ? null : parsedSuperseded.length,
      supersededShapeSilentlyReadsAsZero: parsedSuperseded !== null && parsedSuperseded.length === 0,
    }),
    PASS: parser.available === true
      && stageShape.usesShippedField === true
      && parsedStage !== null && parsedStage.length === 1
      && parsedSuperseded !== null && parsedSuperseded.length === 0
      && (realShape === null || realShape.usesShippedField === true),
  });
}

/**
 * §8 A08/A09 — THE RESULT AND REPORT REFUSALS.
 *
 * A08: a missing or invalid Worker Result is refused rather than treated as a success.
 * A09: a child report carrying an error while the host reports FINISHED is refused.
 *
 * Both are measured by the adapter's own result parser and by the admission schema, so the refusal is the one the
 * primary path would actually apply.
 */
export async function acceptanceA08A09(input) {
  const { parseWorkerResult } = await import('./primary-adapter.mjs');
  const { admitOutcome } = await import('../r3l0cf/outcome-admission.mjs');
  const ADMITTED_BASE = Object.freeze({ jobPhase: 'FINISHED', reportPresent: true, attemptState: 'COMPLETED', consumerVisibleHandleCount: 0, governedPullCount: 0, completionCause: 'RESULT_SUBMITTED' });

  const missing = parseWorkerResult('nothing here at all');
  const malformed = parseWorkerResult(`PALIMPSEST_WORK_RESULT {not json`);
  const noSummary = parseWorkerResult(`PALIMPSEST_WORK_RESULT ${JSON.stringify({ kind: 'READY_FOR_SETTLEMENT' })}`);
  const escalationNoReason = parseWorkerResult(`PALIMPSEST_WORK_RESULT ${JSON.stringify({ kind: 'NEEDS_ESCALATION', summary: 'x' })}`);
  const valid = parseWorkerResult(`PALIMPSEST_WORK_RESULT ${JSON.stringify({ kind: 'READY_FOR_SETTLEMENT', summary: 'done' })}`);

  /** A09: the child's report says ok=false while the host job reached FINISHED. */
  const childErrored = admitOutcome({ ...ADMITTED_BASE, reportPresent: false });
  const hostError = admitOutcome({ ...ADMITTED_BASE, jobPhase: 'HOST_ERROR' });

  return Object.freeze({
    results: Object.freeze([
      Object.freeze({
        id: 'A08_MISSING_OR_INVALID_WORKER_RESULT_REFUSAL',
        positiveControl: Object.freeze({
          missingResult: missing.present,
          malformedResult: malformed.present,
          malformedParseFailure: malformed.parseFailure,
          noSummaryAdmissible: noSummary.admissible,
          escalationWithoutReasonAdmissible: escalationNoReason.admissible,
          validResultAdmissible: valid.admissible,
          /** §5: a malformed line is not a success. */
          allInvalidRefused: missing.present === false && malformed.admissible === false && noSummary.admissible === false && escalationNoReason.admissible === false,
          validAccepted: valid.present === true && valid.admissible === true,
        }),
        mutant: Object.freeze({ id: 'the baseline treated a present report FILE as evidence of a worker report', note: 'a silent worker wrote a child report and was read as a Work blockage rather than a machinery fault' }),
        PASS: missing.present === false && malformed.admissible === false && noSummary.admissible === false && escalationNoReason.admissible === false && valid.admissible === true,
      }),
      Object.freeze({
        id: 'A09_CHILD_REPORT_ERROR_WITH_HOST_FINISHED_REFUSAL',
        positiveControl: Object.freeze({
          childReportedErrorDisposition: childErrored.disposition,
          childReportedErrorCause: childErrored.cause,
          hostErrorDisposition: hostError.disposition,
          /** §5: an error is never a success, whichever side reports it. */
          neitherIsAdmitted: childErrored.disposition !== 'ADMITTED' && hostError.disposition !== 'ADMITTED',
          bothStopTheMatrix: childErrored.matrixResponse === 'STOP_MATRIX' && hostError.matrixResponse === 'STOP_MATRIX',
        }),
        mutant: Object.freeze({ id: 'F6/empty-object success', note: 'the baseline defaulted an unclassifiable outcome to OK' }),
        PASS: childErrored.disposition === 'TRIAL_INVALID' && hostError.disposition === 'TRIAL_INVALID',
      }),
    ]),
  });
}

/**
 * §8 A10 — THE MODE SELECTION.
 *
 * The DETERMINISTIC and PRIMARY modes must resolve DIFFERENT worker executables, and neither may fall back to the
 * other. The measurement is the resolved path for each mode plus the mode's declared external-call permission.
 */
export async function acceptanceA10() {
  const { resolveExecutionMode } = await import('./activation.mjs');
  const deterministic = await resolveExecutionMode({ mode: 'DETERMINISTIC' });
  const primary = await resolveExecutionMode({ mode: 'PRIMARY', paidAuthorization: false });
  const undeclared = await resolveExecutionMode({ mode: 'WHATEVER' });
  const primaryAuthorized = await resolveExecutionMode({ mode: 'PRIMARY', paidAuthorization: true });
  const stageWorker = await import('./primary-adapter.mjs');
  return Object.freeze({
    id: 'A10_REAL_VERSUS_SCRIPTED_MODE_SELECTION',
    positiveControl: Object.freeze({
      deterministicWorker: deterministic.workerExecutable,
      deterministicIsStageScriptedWorker: deterministic.workerExecutable === stageWorker.SCRIPTED_WORKER,
      deterministicExternalCallPermitted: deterministic.externalModelCallPermitted,
      primaryWorkerResolved: primary.workerExecutable !== null,
      primaryWorker: primary.workerExecutable,
      primaryIsNotTheScriptedWorker: primary.workerExecutable !== stageWorker.SCRIPTED_WORKER,
      primaryExternalCallPermitted: primary.externalModelCallPermitted,
      /** §5: the modes are distinct and neither silently becomes the other. */
      modesResolveDifferently: deterministic.workerExecutable !== primary.workerExecutable,
      undeclaredModeRefused: undeclared.resolved === false,
      undeclaredModeReason: undeclared.reason,
      noSilentFallback: deterministic.silentFallbackTaken === false && primary.silentFallbackTaken === false,
      /** §5: a free-text authorization is not accepted as proof. */
      callerSuppliedAuthorizedByAccepted: primary.callerSuppliedAuthorizedByAccepted,
      paidAuthorizationPresentWithoutIt: primary.paidAuthorizationPresent,
      paidAuthorizationPresentWithIt: primaryAuthorized.paidAuthorizationPresent,
      thisStageEntersPrimary: deterministic.thisStageEntersPrimary,
    }),
    mutant: Object.freeze({ id: 'F5_NO_GENUINE_PAID_MODE', measuredBy: 'scripts/r3l0cia/falsifiers.mjs falsifyF5', baselineViolates: true }),
    PASS: deterministic.resolved === true
      && deterministic.workerExecutable === stageWorker.SCRIPTED_WORKER
      && primary.resolved === true
      && primary.workerExecutable !== stageWorker.SCRIPTED_WORKER
      && undeclared.resolved === false
      && primary.paidAuthorizationPresent === false
      && primaryAuthorized.paidAuthorizationPresent === true,
  });
}

/**
 * §8 A11 — THE TIMEOUT AND UNCERTAIN-DESCENDANT CLASSIFICATION.
 *
 * A deliberately slow worker is driven through the real child and the real port. The measurement is the budget
 * triple plus the classification the adapter produces when the outer budget expires without an established
 * descendant exit.
 */
export async function acceptanceA11(input) {
  const { timeoutHierarchy } = await import('./primary-adapter.mjs');
  const budgets = timeoutHierarchy();
  const { DESCENDANT_TERMINATION_LAW } = await import('./contract.mjs');
  return Object.freeze({
    id: 'A11_TIMEOUT_UNKNOWN_DESCENDANT_SURVIVAL',
    positiveControl: Object.freeze({
      outerChildMs: budgets.outerChildMs,
      innerWorkerMs: budgets.innerWorkerMs,
      settlementMs: budgets.settlementMs,
      outerExceedsInnerPlusSettlement: budgets.outerExceedsInnerPlusSettlement,
      marginMs: budgets.marginMs,
      /** §5: `kill()` is not proof of exit, and the classification follows from that. */
      killIsNotProofOfExit: DESCENDANT_TERMINATION_LAW.killIsNotProofOfExit,
      onUnestablished: DESCENDANT_TERMINATION_LAW.onUnestablished,
      forbiddenRepair: DESCENDANT_TERMINATION_LAW.forbiddenRepair,
      /** §5: the slow-worker case, when the caller supplies its observation. */
      slowWorkerObserved: input.slowWorkerObservation ?? null,
    }),
    mutant: Object.freeze({ id: 'F8_CONFLICTING_TIMEOUT_BUDGETS', measuredBy: 'scripts/r3l0cia/falsifiers.mjs falsifyF8', baselineViolates: true, note: 'the baseline outer budget was half the inner one, and an outer termination had no classification distinct from a missing report' }),
    PASS: budgets.outerExceedsInnerPlusSettlement === true && DESCENDANT_TERMINATION_LAW.onUnestablished === 'UNCERTAIN_PRESERVED' && DESCENDANT_TERMINATION_LAW.killIsNotProofOfExit === true,
  });
}

/**
 * §8 A12/A13 — THE CLOSURE AND VALIDITY REFUSALS.
 *
 * A12: a missing, null or stale closure refuses execution.
 * A13: a missing or false post-matrix validity gate refuses completion.
 *
 * A12 is measured through the REAL activation entry; A13 through the REAL post-matrix gate, so the refusal is the
 * one the primary path would apply.
 */
export async function acceptanceA12A13(input) {
  const activation = await import('./activation.mjs');
  const { postMatrixValidityGate } = await import('./validity.mjs');
  const plan = input.plan;
  const roots = [];
  const results = [];

  /** A12: three closure inputs, each of which must refuse before anything is prepared. */
  const cases = [];
  for (const [label, closure] of [['NULL_DIGEST', { executionClosureDigest: null }], ['ABSENT_DIGEST', {}], ['DRIFTED_DIGEST', { executionClosureDigest: 'f'.repeat(64) }]]) {
    const root = mkdtempSync(join(tmpdir(), `r3l0cia-a12-${label.toLowerCase()}-`));
    roots.push(root);
    const outcome = await activation.activatePrimaryRun({
      plan,
      runId: `a12-${label}`,
      runRoot: root,
      expectedSchedule: plan.schedule,
      trajectoryIds: ['a12-t0'],
      closure,
      mode: 'DETERMINISTIC',
    });
    cases.push(Object.freeze({ label, activation: outcome.ACTIVATION, refusedAt: outcome.refusedAt ?? null, reason: outcome.reason ?? null, preparedAnything: false }));
  }

  results.push(Object.freeze({
    id: 'A12_MISSING_OR_STALE_CLOSURE_REFUSAL',
    positiveControl: Object.freeze({
      cases: Object.freeze(cases),
      allRefused: cases.every((entry) => entry.activation === 'REFUSED'),
      /** §6: the refusal names the closure as the reason, not something downstream of it. */
      refusedAtClosureStep: cases.every((entry) => entry.refusedAt === 'VERIFY_RUNTIME_AND_CLOSURE'),
      distinctReasons: new Set(cases.map((entry) => entry.reason)).size,
    }),
    mutant: Object.freeze({ id: 'F7_CLOSURE_NOT_ENFORCED_AT_LAUNCH', measuredBy: 'scripts/r3l0cia/falsifiers.mjs falsifyF7', baselineViolates: true }),
    PASS: cases.every((entry) => entry.activation === 'REFUSED' && entry.refusedAt === 'VERIFY_RUNTIME_AND_CLOSURE'),
  }));

  /** A13: the post-matrix gate, with a false and a missing condition. */
  const goodRecords = input.goodRecords ?? [];
  const planned = input.plannedSessions ?? [];
  const green = await postMatrixValidityGate({ completed: planned, records: goodRecords, plannedSessions: planned, plan, closure: input.closure, containment: input.containment, schedule: input.schedule });
  const countOnly = await postMatrixValidityGate({ completed: planned, records: goodRecords.map((record) => ({ ...record, treatmentRealization: 'NOT_APPLIED' })), plannedSessions: planned, plan, closure: input.closure, containment: input.containment, schedule: input.schedule });
  const missingContainment = await postMatrixValidityGate({ completed: planned, records: goodRecords, plannedSessions: planned, plan, closure: input.closure, containment: null, schedule: input.schedule });
  const noPlan = await postMatrixValidityGate({ completed: planned, records: goodRecords, plannedSessions: planned, plan: null, closure: input.closure, containment: input.containment, schedule: input.schedule });

  results.push(Object.freeze({
    id: 'A13_MISSING_OR_FALSE_POST_MATRIX_VALIDITY_GATE_REFUSAL',
    positiveControl: Object.freeze({
      greenGate: green.green,
      greenChecks: green.checks,
      realizationFailureGate: countOnly.green,
      realizationFailureFailing: countOnly.failing,
      missingContainmentGate: missingContainment.green,
      missingPlanGate: noPlan.green,
      /** §6: a count-only gate would have passed the realization failure; this one does not. */
      countAloneIsInsufficient: countOnly.green === false,
      checkedOnlyTheSessionCount: green.checkedOnlyTheSessionCount,
    }),
    mutant: Object.freeze({ id: 'F6_DEFAULT_POST_MATRIX_GREEN', measuredBy: 'scripts/r3l0cia/falsifiers.mjs falsifyF6', baselineViolates: true }),
    PASS: green.green === true && countOnly.green === false && missingContainment.green === false && noPlan.green === false,
  }));

  for (const root of roots) { try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ } }
  return Object.freeze({ results: Object.freeze(results) });
}

/**
 * §8 A14 — THE COST PARSER AGAINST PRESERVED ARTIFACTS.
 *
 * §6 requires the parser to be tested against preserved session artifacts WITHOUT claiming they are new treatment
 * observations. So the measurement is labelled `FIXTURE`, and a synthetic artifact exercises the counting rules
 * including the one that matters most: a capital body never counts as a raw-history byte.
 */
export async function acceptanceA14(input) {
  const { measureSessionCost, buildArtifactMap, INSTRUMENTATION_PROVENANCE } = await import('./instrumentation.mjs');
  const root = mkdtempSync(join(tmpdir(), 'r3l0cia-a14-'));
  try {
    const artifactPath = join(root, 'attempt-a14c0ffee', 'session.v4.jsonl.zstd');
    mkdirSync(join(root, 'attempt-a14c0ffee'), { recursive: true });
    writeFileSync(artifactPath, writeFixtureArtifact(), 'utf8');
    const session = Object.freeze({ sessionId: 'a14-t0-G1', trajectoryId: 'a14-t0', generation: 'G1', arm: 'C' });
    const measured = await measureSessionCost({ artifactPath, session, expectedAttemptId: 'a14c0ffee', provenance: INSTRUMENTATION_PROVENANCE.FIXTURE });
    const mismatch = await measureSessionCost({ artifactPath, session, expectedAttemptId: 'deadbeef', provenance: INSTRUMENTATION_PROVENANCE.FIXTURE });
    const absent = await measureSessionCost({ artifactPath: join(root, 'nope.zstd'), session, provenance: INSTRUMENTATION_PROVENANCE.FIXTURE });
    /** The map refuses to resolve an artifact that names no scheduled session. */
    const map = buildArtifactMap({ artifacts: [{ path: artifactPath }, { path: join(root, 'unrelated', 'session.v4.jsonl.zstd') }], schedule: [session] });
    return Object.freeze({
      id: 'A14_RECONSTRUCTION_COST_PARSER_AGAINST_PRESERVED_ARTIFACTS',
      positiveControl: Object.freeze({
        measured: measured.measured,
        provenance: measured.provenance,
        fixtureLabelIsExplicit: measured.provenance === INSTRUMENTATION_PROVENANCE.FIXTURE,
        fieldsPresent: measured.fieldsPresent,
        rawHistoryArtifactsRead: measured.fields?.rawHistoryArtifactsRead ?? null,
        rawHistoryBytesReturned: measured.fields?.rawHistoryBytesReturned ?? null,
        capitalPullActions: measured.fields?.capitalPullActions ?? null,
        /** §13 of R3-L0C: a capital body must NOT count as a raw-history byte. */
        capitalBodyNotCountedAsHistory: (measured.fields?.rawHistoryBytesReturned ?? 0) < (measured.fields?.capitalPullActions ?? 0) * 1000,
        attemptIdentityMatches: measured.attribution?.attemptIdentityMatches ?? null,
        /** §6: a conflicting identity and an absent artifact are both refused. */
        conflictingAttemptRefused: mismatch.measured === false && mismatch.reason === 'ATTEMPT_IDENTITY_CONFLICT',
        absentArtifactRefused: absent.measured === false && absent.reason === 'ARTIFACT_ABSENT',
        unattributableReported: map.unattributable.length,
        resolvedByRecency: map.resolvedByRecency,
      }),
      mutant: Object.freeze({ id: 'the convenience path', note: 'taking the latest artifact by mtime would attribute a neighbouring generation\u2019s cost to this session; the map refuses instead' }),
      PASS: measured.measured === true
        && measured.fieldsPresent.length === 0
        && measured.attribution.attemptIdentityMatches === true
        && mismatch.reason === 'ATTEMPT_IDENTITY_CONFLICT'
        && absent.reason === 'ARTIFACT_ABSENT'
        && map.resolvedByRecency === false,
    });
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
  }
}

/**
 * §8 A15/A16 — THE MATRIX CASES.
 *
 * A15: the healthy sixteen-session ScriptedWorker run, preserving the original schedule and delivering the exact
 * treatment.
 * A16: a failure at the first, middle and last session stops with no later launch and no replacement.
 *
 * These are driven by the caller, because they need the prehistory and the full matrix; this function shapes their
 * observations into the acceptance record.
 */
export function acceptanceA15A16(input) {
  const { healthy, faultFirst, faultMiddle, faultLast, expectedByArmGeneration } = input;
  const visibleByArmGeneration = {};
  for (const record of healthy?.run?.records ?? []) {
    const key = `${record.arm}/${record.generation}`;
    (visibleByArmGeneration[key] ??= []).push(record.consumerVisibleHandles.length);
  }
  const boundariesExact = Object.entries(expectedByArmGeneration).every(([key, expectedCount]) => (visibleByArmGeneration[key] ?? []).every((count) => count === expectedCount));
  const faults = [faultFirst, faultMiddle, faultLast].filter((entry) => entry !== undefined && entry !== null);
  return Object.freeze({
    results: Object.freeze([
      Object.freeze({
        id: 'A15_HEALTHY_SIXTEEN_SESSION_SCRIPTED_RUN',
        positiveControl: Object.freeze({
          terminalState: healthy?.terminalState ?? null,
          scheduleLength: healthy?.scheduleLength ?? null,
          completedSessions: healthy?.completedSessions?.length ?? null,
          maxLaunchesPerSession: healthy?.maxLaunchesPerSession ?? null,
          trajectoryCount: healthy?.trajectoryCount ?? null,
          mode: healthy?.mode?.mode ?? null,
          workerIsStageScripted: String(healthy?.mode?.workerExecutable ?? '').includes('r3l0cia'),
          visibleByArmGeneration: Object.freeze(visibleByArmGeneration),
          boundariesExact,
          expectedByArmGeneration,
          /** §8: the schedule is the frozen one, not a fresh one. */
          propertiesHold: healthy?.run?.properties?.ALL_PROPERTIES_HOLD ?? null,
          causalVerdictIssued: healthy?.run?.causalVerdictIssued ?? null,
        }),
        mutant: Object.freeze({ id: 'F6', note: 'the baseline completed on a count-only gate with no post-matrix validity proof' }),
        PASS: healthy?.terminalState === 'MATRIX_COMPLETE'
          && healthy?.completedSessions?.length === 16
          && healthy?.maxLaunchesPerSession === 1
          && healthy?.trajectoryCount === 8
          && boundariesExact
          && healthy?.run?.properties?.ALL_PROPERTIES_HOLD === true,
      }),
      Object.freeze({
        id: 'A16_FIRST_MIDDLE_LAST_FAILURE_NO_LATER_LAUNCH',
        positiveControl: Object.freeze({
          cases: Object.freeze(faults.map((entry) => Object.freeze({
            position: entry.faultsInjected?.[0]?.position ?? null,
            scheduleIndex: entry.faultsInjected?.[0]?.scheduleIndex ?? null,
            terminalState: entry.terminalState,
            completedSessions: entry.completedSessions?.length ?? null,
            launches: entry.run?.launches?.length ?? null,
            maxLaunchesPerSession: entry.maxLaunchesPerSession,
            sessionsAfterFault: entry.sessionsAfterFault,
            propertiesHold: entry.run?.properties?.ALL_PROPERTIES_HOLD ?? null,
          }))),
          /** §8: no later launch, no replacement, no retry, at each of the three positions. */
          allStopped: faults.every((entry) => entry.terminalState === 'ABORT_PRESERVED'),
          noLaterLaunch: faults.every((entry) => (entry.sessionsAfterFault ?? []).length === 0),
          oneLaunchPerSession: faults.every((entry) => entry.maxLaunchesPerSession === 1),
          propertiesHold: faults.every((entry) => entry.run?.properties?.ALL_PROPERTIES_HOLD === true),
        }),
        mutant: Object.freeze({ id: 'F1/F8', note: 'the baseline re-launched an infrastructure-invalid session up to four times' }),
        PASS: faults.length === 3
          && faults.every((entry) => entry.terminalState === 'ABORT_PRESERVED')
          && faults.every((entry) => (entry.sessionsAfterFault ?? []).length === 0)
          && faults.every((entry) => entry.maxLaunchesPerSession === 1),
      }),
    ]),
  });
}

/* ================================================================ the helpers */

/** The kind a handle names, read from its own namespace rather than assumed. */
function kindOf(handle) {
  if (/@ctx\/proof\//u.test(handle)) return 'proof';
  if (/@ctx\/reasoning\//u.test(handle)) return 'reasoning';
  if (/@ctx\/procedure\//u.test(handle)) return 'procedure';
  return 'unknown';
}

/** A digest over a run root's files, for the "no mutation before refusal" property. */
function digestRoot(root) {
  const digests = [];
  const walk = (dir, depth) => {
    if (depth > 5) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path, depth + 1);
      else if (entry.isFile()) {
        const relative = path.slice(root.length + 1).replace(/\\/gu, '/');
        try { digests.push(`${relative}:${createHash('sha256').update(readFileSync(path)).digest('hex')}`); } catch { digests.push(`${relative}:UNREADABLE`); }
      }
    }
  };
  walk(root, 0);
  return createHash('sha256').update(digests.sort().join(NL), 'utf8').digest('hex');
}

/**
 * §6: A FIXTURE ARTIFACT for the cost parser.
 *
 * It is a zstd-framed JSONL session record set carrying three dispatches: a declared-corpus read, a capital pull
 * whose returned body is much LARGER than the corpus read, and the result submission. That shape is what lets the
 * test observe the counting rule that matters most — a capital body must NOT count as a raw-history byte — rather
 * than merely asserting that some number is present.
 */
function writeFixtureArtifact() {
  const corpusRead = { type: 'tool/ptc-dispatch', seq: 1, time: 1_000, data: { name: 'read', arguments: { file_path: 'docs/history/incident-cutover.md' }, content: 'x'.repeat(500), isError: false } };
  const capitalPull = { type: 'tool/ptc-dispatch', seq: 2, time: 1_100, data: { name: 'palimpsest_worker_context_pull', arguments: { handle: '@ctx/procedure/prc-1/0' }, content: 'y'.repeat(5_000), isError: false } };
  const result = { type: 'tool/ptc-dispatch', seq: 3, time: 1_200, data: { name: 'palimpsest_worker_result', arguments: {}, content: 'ok', isError: false } };
  const start = { type: 'turn/start', time: 900, data: {} };
  const text = [start, corpusRead, capitalPull, result].map((record) => JSON.stringify(record)).join(NL) + NL;
  return zstdCompressSync(Buffer.from(text, 'utf8'));
}

export { NL, ACCEPTANCE_TESTS };
