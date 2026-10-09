/**
 * R3-L0C-I-A-R §3-§8 — THE PRODUCTION-PATH NEGATIVE AND POSITIVE CONTROLS.
 *
 * Each function drives the REAL repaired entry and returns a `positiveControl` (the repaired behaviour) beside a
 * `mutant` (the baseline behaviour §1 measured). The mutants are NOT re-run here: §1's falsifiers already measured
 * them against `dbe6beb`, and re-deriving them would be a second measurement of the same fact. Each entry NAMES
 * its falsifier so the pair is visible without the suite pretending to have run it twice.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';

import { NL } from './contract.mjs';

/* ================================================================ §3 the pre-trial reducer */

/**
 * §3: THE PRE-TRIAL REDUCER — the positive control and one negative case per condition.
 *
 * The positive control uses ALL EIGHT REAL CONDITION VALUES HEALTHY and requires `ALL_SATISFIED === true`. Each
 * negative case perturbs exactly one input and requires the corresponding condition to be unsatisfied.
 */
export async function controlPreTrialReducer(input) {
  const { evaluatePreTrialValidity, modelRouteIdentity } = await import('./validity.mjs');
  const healthy = input.healthy;
  const positive = await evaluatePreTrialValidity(healthy);
  const negatives = [];
  const perturb = (id, mutate) => {
    const clone = structuredCloneish(healthy);
    mutate(clone);
    return Object.freeze({ id, input: clone });
  };
  const cases = [
    perturb('SYSTEM_VALID', (c) => { c.systemValid = false; }),
    perturb('EXPERIMENT_ENVIRONMENT_VALID', (c) => { c.containment = { ...c.containment, EXPERIMENT_ENVIRONMENT_VALID: 'FAIL' }; }),
    perturb('CONTAINMENT', (c) => { c.containment = { ...c.containment, ACTUAL_CONTAINMENT: 'FAIL' }; }),
    perturb('EXECUTION_CLOSURE', (c) => { c.closure = { ...c.closure, executionClosureDigest: 'f'.repeat(64) }; }),
    perturb('SELECTION_REALIZATION_PREFLIGHT', (c) => { c.realizationPreflight = { TREATMENT_BOUNDARY: 'FAIL' }; }),
    perturb('ANALYSIS_PLAN_VALID', (c) => { c.plan = { ...c.plan, preservedDesign: { primaryEndpointsChanged: true, verdictThresholdsChanged: false } }; }),
    perturb('SCHEDULE_MATCH', (c) => { c.schedule = c.schedule.slice(0, 15); }),
    perturb('MODEL_ROUTE_CONFIGURATION_MATCH', (c) => { c.routeConfiguration = { ...c.routeConfiguration, effective: { ...c.routeConfiguration.effective, modelId: 'drifted-model' } }; }),
  ];
  for (const entry of cases) {
    const evaluation = await evaluatePreTrialValidity(entry.input);
    const condition = evaluation.conditions.find((c) => c.id === entry.id);
    negatives.push(Object.freeze({
      id: entry.id,
      verdict: condition?.verdict ?? null,
      satisfied: condition?.satisfied ?? null,
      allSatisfied: evaluation.ALL_SATISFIED,
      refused: evaluation.ALL_SATISFIED === false,
    }));
  }
  return Object.freeze({
    id: 'PRETRIAL_VALIDITY_REDUCER',
    positiveControl: Object.freeze({
      allEightHealthy: positive.conditions.length === 8,
      ALL_SATISFIED: positive.ALL_SATISFIED,
      satisfiedCount: positive.satisfiedCount,
      unsatisfied: positive.unsatisfied,
      verdicts: Object.freeze(positive.conditions.map((c) => Object.freeze({ id: c.id, observed: c.observed, verdict: c.verdict }))),
      modelRouteIdentity: modelRouteIdentity(positive),
      routeIdentityComparison: positive.routeIdentityComparison,
      /** §3: the three conditions the baseline reducer could never satisfy. */
      containmentPass: positive.conditions.find((c) => c.id === 'CONTAINMENT')?.verdict,
      closureMatch: positive.conditions.find((c) => c.id === 'EXECUTION_CLOSURE')?.verdict,
      preflightPass: positive.conditions.find((c) => c.id === 'SELECTION_REALIZATION_PREFLIGHT')?.verdict,
    }),
    negatives: Object.freeze(negatives),
    allNegativesRefused: negatives.every((entry) => entry.refused === true),
    mutant: Object.freeze({ id: 'G2_PRETRIAL_REDUCER_YES_ONLY', measuredBy: 'scripts/r3l0ciar/falsifiers.mjs', baselineViolates: true, note: 'the baseline reducer left three healthy conditions unsatisfied and the activation never required ALL_SATISFIED' }),
    PASS: positive.ALL_SATISFIED === true && negatives.every((entry) => entry.refused === true),
  });
}

/** §3: the drifted-route negative, measured as its own control so MODEL_ROUTE_IDENTITY can be reported. */
export async function controlRouteIdentity(input) {
  const { evaluatePreTrialValidity, modelRouteIdentity } = await import('./validity.mjs');
  const drifted = structuredCloneish(input.healthy);
  drifted.routeConfiguration = { ...drifted.routeConfiguration, effective: { ...drifted.routeConfiguration.effective, providerId: 'some-other-provider' } };
  const evaluation = await evaluatePreTrialValidity(drifted);
  const unknown = structuredCloneish(input.healthy);
  unknown.routeConfiguration = { effective: null };
  const unknownEval = await evaluatePreTrialValidity(unknown);
  return Object.freeze({
    id: 'MODEL_ROUTE_IDENTITY',
    positiveControl: Object.freeze({
      healthyIdentity: modelRouteIdentity(await evaluatePreTrialValidity(input.healthy)),
      driftedIdentity: modelRouteIdentity(evaluation),
      unknownIdentity: modelRouteIdentity(unknownEval),
      driftedComparison: evaluation.routeIdentityComparison,
    }),
    mutant: Object.freeze({ id: 'G3_MODEL_ROUTE_IDENTITY_UNCHECKED', measuredBy: 'scripts/r3l0ciar/falsifiers.mjs', baselineViolates: true, note: 'the baseline reported a match while comparing no identity at all' }),
    PASS: modelRouteIdentity(await evaluatePreTrialValidity(input.healthy)) === 'MATCH' && modelRouteIdentity(evaluation) === 'DRIFTED' && modelRouteIdentity(unknownEval) === 'UNKNOWN',
  });
}

/* ================================================================ §4 the admission controls */

/**
 * §4: THE SIX ADMISSION NEGATIVE CONTROLS AND THE POSITIVE CONTROL.
 *
 * Each control carries EXPLICIT admission evidence for the fields the frozen schema requires, so the refusal the
 * gate produces is the one this stage's repair adds. The sixth control (a declared outcome with no evidence at all)
 * is ALSO caught by the frozen empty-object guard, which is why the entry reports the gate's own cause for it and
 * still counts it as refused: the repair must not REGRESS a case the frozen schema already handled.
 */
export async function controlAdmission() {
  const { admitThroughGate, ADMISSION_CONTROL_OUTCOMES, ADMISSION_POSITIVE_OUTCOME } = await import('./admission.mjs');
  /**
   * The controls carry their OWN signals, so nothing is supplied here that would mask an omission. The sixth
   * control deliberately omits `completionCause`, and spreading a base over it would put the signal back.
   */
  const controls = [];
  for (const [id, outcome] of Object.entries(ADMISSION_CONTROL_OUTCOMES)) {
    const result = await admitThroughGate({ ...outcome });
    controls.push(Object.freeze({
      id, disposition: result.disposition, cause: result.cause, controlId: result.controlId,
      refused: result.disposition !== 'ADMITTED', matrixResponse: result.matrixResponse, gateFired: result.gateFired,
    }));
  }
  const positive = await admitThroughGate({ ...ADMISSION_POSITIVE_OUTCOME });
  return Object.freeze({
    id: 'WORKER_RESULT_ADMISSION',
    positiveControl: Object.freeze({ validDisposition: positive.disposition, validGateFired: positive.gateFired, controls }),
    allSixRefused: controls.every((entry) => entry.refused === true),
    allSixStopTheMatrix: controls.every((entry) => entry.matrixResponse === 'STOP_MATRIX'),
    /** §4: the five evidence-carrying controls are refused BY THE GATE this stage adds. */
    fiveRefusedByTheGate: controls.filter((entry) => entry.id !== 'DECLARED_OUTCOME_MISSING_EVIDENCE').every((entry) => entry.gateFired === true && entry.refused === true),
    /** §4: behavioural incorrectness remains admissible; only machinery faults refuse. */
    behaviouralStillAdmitted: (await admitThroughGate({ ...ADMISSION_POSITIVE_OUTCOME, correctnessOk: false, hiddenInvariantVector: { failedPrepaidClasses: ['x'], prepaidCoverage: 0 } })).disposition === 'ADMITTED',
    mutant: Object.freeze({ id: 'G4_CHILD_WORKER_ADMISSION_GAP', measuredBy: 'scripts/r3l0ciar/falsifiers.mjs', baselineViolates: true, note: 'the baseline admitted five of the six controls' }),
    PASS: controls.every((entry) => entry.refused === true) && positive.disposition === 'ADMITTED' && positive.gateFired === false,
  });
}

/* ================================================================ §5 the uptake provenance */

/**
 * §5: THE UPTAKE-PROVENANCE CONTROL.
 *
 * Three transcripts: no telemetry line, an explicit zero-pull line, and a malformed line. The repaired layer must
 * report TELEMETRY_MISSING, OBSERVED_ZERO and TELEMETRY_MALFORMED respectively, and the count must be `null` for
 * the two non-observed states. The positive C/G2 control (visible four, pulled zero, host resolved four, treatment
 * applied, uptake zero) is the one §5 requires be KEPT.
 */
export async function controlUptakeProvenance(input) {
  const { buildPullLayers, observeTreatmentAndUptake, UPTAKE_PROVENANCE } = await import('./treatment.mjs');
  const root = mkdtempSync(join(tmpdir(), 'r3l0ciar-uptake-'));
  try {
    const noLine = join(root, 'no-line.txt');
    const explicitZero = join(root, 'explicit-zero.txt');
    const malformed = join(root, 'malformed.txt');
    writeFileSync(noLine, `PALIMPSEST_WORK_RESULT ${JSON.stringify({ kind: 'READY_FOR_SETTLEMENT', summary: 'done' })}${NL}`, 'utf8');
    writeFileSync(explicitZero, `PALIMPSEST_WORKER_PULL ${JSON.stringify({ pulled: [] })}${NL}`, 'utf8');
    writeFileSync(malformed, `PALIMPSEST_WORKER_PULL {not json${NL}`, 'utf8');

    const report = Object.freeze({ governedPulls: Object.freeze([]) });
    const measured = {};
    for (const [label, path] of [['NO_LINE', noLine], ['EXPLICIT_ZERO', explicitZero], ['MALFORMED', malformed]]) {
      const layers = await buildPullLayers({ report, transcriptPath: path, artifactPath: null, expectedHandles: [] });
      measured[label] = Object.freeze({
        provenance: layers.workerPullObserved.provenance,
        observed: layers.workerPullObserved.observed,
        count: layers.workerPullObserved.count,
        telemetryLinePresent: layers.workerPullObserved.telemetryLinePresent,
      });
    }

    /** The positive control §5 requires be kept: four visible, zero pulled, four host resolutions. */
    const expectation = input.expectation;
    const expected = [...expectation.expectedConsumerVisibleHandles];
    const uptakeReport = Object.freeze({
      ok: true, jobPhase: 'FINISHED', attemptId: 'uptake-attempt',
      payload: Object.freeze({ handles: expected.map((handle) => ({ handle, kind: kindOf(handle) })), compiledHandleCount: expected.length }),
      governedPulls: expected.map((handle) => Object.freeze({ handle, resolved: true, bodyBytes: 100, bodyDigest: 'a'.repeat(64) })),
      finalVector: Object.freeze({ failedPrepaidClasses: [], prepaidCoverage: 1 }),
    });
    const observation = await observeTreatmentAndUptake({
      sessionId: 'uptake-session', expectation, report: uptakeReport, arm: 'C', generationId: 'G2',
      transcriptPath: explicitZero, artifactPath: null,
    });

    return Object.freeze({
      id: 'UPTAKE_TELEMETRY_PROVENANCE',
      positiveControl: Object.freeze({
        measured: Object.freeze(measured),
        missingIsNotZero: measured.NO_LINE.provenance === UPTAKE_PROVENANCE.TELEMETRY_MISSING && measured.NO_LINE.count === null,
        malformedIsNotZero: measured.MALFORMED.provenance === UPTAKE_PROVENANCE.TELEMETRY_MALFORMED && measured.MALFORMED.count === null,
        observedZeroIsZero: measured.EXPLICIT_ZERO.provenance === UPTAKE_PROVENANCE.OBSERVED_ZERO && measured.EXPLICIT_ZERO.count === 0,
        hostAuditMayNotRepair: measured.NO_LINE.count === null,
        /** §5: the C/G2 control. */
        visibleFour: observation.realization.consumerVisibleHandles.length,
        workerUptake: observation.WORKER_UPTAKE,
        workerUptakeCount: observation.workerUptakeCount,
        hostResolveCount: observation.hostResolveCount,
        treatmentRealization: observation.TREATMENT_REALIZATION,
        declinedObservation: observation.observations,
        declinedPullStopsTheMatrix: observation.declinedPullStopsTheMatrix,
      }),
      mutant: Object.freeze({ id: 'G5_UPTAKE_ZERO_VS_MISSING', measuredBy: 'scripts/r3l0ciar/falsifiers.mjs', baselineViolates: true, note: 'the baseline reported a measured zero for both the missing and the malformed line' }),
      PASS: measured.NO_LINE.provenance === UPTAKE_PROVENANCE.TELEMETRY_MISSING
        && measured.MALFORMED.provenance === UPTAKE_PROVENANCE.TELEMETRY_MALFORMED
        && measured.EXPLICIT_ZERO.provenance === UPTAKE_PROVENANCE.OBSERVED_ZERO
        && measured.NO_LINE.count === null
        && observation.TREATMENT_REALIZATION === 'APPLIED'
        && observation.WORKER_UPTAKE === 'ZERO'
        && observation.hostResolveCount === 4
        && observation.declinedPullStopsTheMatrix === false,
    });
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
  }
}

/* ================================================================ §6 the cost attribution */

/**
 * §6: THE COST-ATTRIBUTION CONTROL.
 *
 * A fixture artifact with a full identity in its path is attributed and measured under the FIXTURE label; an
 * artifact whose path names the session but carries no attempt or host-job identity is REFUSED as a filename-only
 * match; a conflicting attempt id is REFUSED; an absent artifact is REFUSED. The map refuses ambiguity rather than
 * resolving by recency.
 */
export async function controlCostAttribution(input) {
  const { measureSessionCost, buildArtifactMap, attributeArtifact, INSTRUMENTATION_PROVENANCE } = await import('./instrumentation.mjs');
  const root = mkdtempSync(join(tmpdir(), 'r3l0ciar-cost-'));
  try {
    const session = Object.freeze({ sessionId: 'b0-C-G1', trajectoryId: 'b0-C', generation: 'G1', arm: 'C' });
    const goodPath = join(root, 'attempt-a14c0ffee', 'session.v4.jsonl.zstd');
    mkdirSync(join(root, 'attempt-a14c0ffee'), { recursive: true });
    writeFileSync(goodPath, writeFixtureArtifact(), 'utf8');

    const measured = await measureSessionCost({ artifactPath: goodPath, session, provenance: INSTRUMENTATION_PROVENANCE.FIXTURE, expected: { runId: 'r1', attemptId: 'a14c0ffee' } });
    const conflict = await measureSessionCost({ artifactPath: goodPath, session, provenance: INSTRUMENTATION_PROVENANCE.FIXTURE, expected: { runId: 'r1', attemptId: 'deadbeef' } });
    const absent = await measureSessionCost({ artifactPath: join(root, 'nope.zstd'), session, provenance: INSTRUMENTATION_PROVENANCE.FIXTURE, expected: { runId: 'r1', attemptId: 'a14c0ffee' } });

    /** A filename-only artifact: the session id appears, but no attempt or host-job identity does. */
    const bareDir = join(root, 'b0-C-G1-lookalike');
    mkdirSync(bareDir, { recursive: true });
    const barePath = join(bareDir, 'session.v4.jsonl.zstd');
    writeFileSync(barePath, writeFixtureArtifact(), 'utf8');
    const filenameOnly = attributeArtifact({ artifactPath: barePath, session, expected: { runId: 'r1' } });

    /** The map resolves an artifact whose path names a scheduled session and reports the rest as unattributable. */
    const namedPath = join(root, 'b0-C-G1', 'attempt-a14c0ffee', 'session.v4.jsonl.zstd');
    mkdirSync(join(root, 'b0-C-G1', 'attempt-a14c0ffee'), { recursive: true });
    writeFileSync(namedPath, writeFixtureArtifact(), 'utf8');
    const map = buildArtifactMap({ artifacts: [{ path: namedPath }, { path: join(root, 'unrelated', 'session.v4.jsonl.zstd') }], schedule: [session] });

    return Object.freeze({
      id: 'COST_ARTIFACT_ATTRIBUTION',
      positiveControl: Object.freeze({
        measured: measured.measured,
        provenance: measured.provenance,
        fixtureLabelIsExplicit: measured.provenance === INSTRUMENTATION_PROVENANCE.FIXTURE,
        fieldsPresent: measured.fieldsPresent,
        identity: measured.attribution?.identity,
        identityFields: measured.attribution?.identityFields,
        attemptIdentityMatches: measured.attribution?.checks?.find((c) => c.field === 'attemptId')?.matches ?? null,
        capitalBodyNotCountedAsHistory: (measured.fields?.rawHistoryBytesReturned ?? 0) < (measured.fields?.capitalPullActions ?? 0) * 1000,
        conflictingAttemptRefused: conflict.measured === false && conflict.reason === 'IDENTITY_CONFLICT',
        absentArtifactRefused: absent.measured === false && absent.reason === 'ARTIFACT_ABSENT',
        filenameOnlyRefused: filenameOnly.attributed === false && filenameOnly.reason === 'UNCORROBORATED_IDENTITY',
        unattributableReported: map.unattributable.length,
        resolvedByRecency: map.resolvedByRecency,
      }),
      mutant: Object.freeze({ id: 'G6_COST_ATTRIBUTION_FILENAME_ONLY', measuredBy: 'scripts/r3l0ciar/falsifiers.mjs', baselineViolates: true, note: 'the baseline attributed on a path substring with no corroboration' }),
      PASS: measured.measured === true
        && measured.fieldsPresent.length === 0
        && conflict.reason === 'IDENTITY_CONFLICT'
        && absent.reason === 'ARTIFACT_ABSENT'
        && filenameOnly.attributed === false
        && filenameOnly.reason === 'UNCORROBORATED_IDENTITY'
        && map.resolvedByRecency === false,
    });
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
  }
}

/* ================================================================ §7 the post-matrix gate */

/**
 * §7: THE POST-MATRIX CAUSAL GATE — the positive control and one failing input per condition.
 *
 * Every failed input must yield `CAUSAL_EXPERIMENT_VALID = NO`, `RECONSTRUCTION_COMPRESSION = NOT_EVALUABLE` and
 * `NET_COGNITIVE_COST = NOT_EVALUABLE`.
 */
export async function controlPostMatrixGate(input) {
  const { postMatrixValidityGate, causalAdmissionFrom } = await import('./validity.mjs');
  const { schedule, plan, closure, containment, goodRecords, costAttribution } = input;
  const ids = schedule.map((session) => session.sessionId);
  const goodInput = Object.freeze({
    completed: ids, records: goodRecords, plannedSessions: ids, plan, closure, containment, schedule,
    systemValid: 'PASS', environmentValid: 'PASS', costAttribution,
    routeConfiguration: { MODEL_ROUTE_IDENTITY: 'MATCH' }, analysisPlanUnchanged: true, replacements: 0, retries: 0,
  });
  const positive = await postMatrixValidityGate(goodInput);

  const negatives = [];
  const cases = [
    ['ALL_SIXTEEN_UNIQUE_SESSIONS', { completed: ids.slice(0, 15) }],
    ['EIGHT_LEGITIMATE_TRAJECTORIES', { records: goodRecords.filter((record) => record.trajectoryId !== goodRecords[0].trajectoryId) }],
    ['FOUR_COMPLETE_MATCHED_BLOCKS', { records: goodRecords.filter((record) => record.block !== 3) }],
    ['EVERY_TREATMENT_APPLIED', { records: goodRecords.map((record, index) => index === 0 ? { ...record, treatmentRealization: undefined } : record) }],
    ['UPTAKE_TELEMETRY_INTERPRETABLE', { records: goodRecords.map((record, index) => index === 0 ? { ...record, workerUptakeCount: null } : record) }],
    ['COST_TELEMETRY_INTERPRETABLE', { costAttribution: null }],
    ['SYSTEM_ENVIRONMENT_VALID', { systemValid: 'FAIL' }],
    ['CLOSURE_AND_ROUTE_MATCH', { routeConfiguration: { MODEL_ROUTE_IDENTITY: 'DRIFTED' } }],
    ['ANALYSIS_PLAN_UNCHANGED', { analysisPlanUnchanged: false }],
  ];
  for (const [id, override] of cases) {
    const gate = await postMatrixValidityGate({ ...goodInput, ...override });
    const causal = causalAdmissionFrom(gate);
    negatives.push(Object.freeze({
      id,
      green: gate.green,
      failing: gate.failing,
      causalExperimentValid: causal.CAUSAL_EXPERIMENT_VALID,
      reconstructionCompression: causal.RECONSTRUCTION_COMPRESSION,
      netCognitiveCost: causal.NET_COGNITIVE_COST,
    }));
  }

  /**
   * §6: a mechanically green gate over FIXTURE cost data is NOT a live causal admission. This is the case a
   * deterministic run produces, and the causal verdict must stay NOT_EVALUABLE.
   */
  const fixtureGreen = await postMatrixValidityGate({ ...goodInput, costAttribution: { ...costAttribution, livePrimaryCount: 0, fixtureCount: 16, allSixteenLivePrimary: false } });
  const fixtureCausal = causalAdmissionFrom(fixtureGreen);

  return Object.freeze({
    id: 'POST_MATRIX_CAUSAL_ADMISSION',
    positiveControl: Object.freeze({
      green: positive.green,
      checks: positive.checks,
      requiredConditions: positive.requiredConditions,
      causalAdmission: positive.causalAdmission,
      /** §7: a count-only gate would have passed every one of these. */
      checkedOnlyTheSessionCount: positive.checkedOnlyTheSessionCount,
      fixtureGreenButNotCausal: Object.freeze({ gateGreen: fixtureGreen.green, causal: fixtureCausal }),
    }),
    negatives: Object.freeze(negatives),
    allNegativesFailClosed: negatives.every((entry) => entry.green === false && entry.causalExperimentValid === 'NO' && entry.reconstructionCompression === 'NOT_EVALUABLE' && entry.netCognitiveCost === 'NOT_EVALUABLE'),
    mutant: Object.freeze({ id: 'G7_POST_MATRIX_CAUSAL_ADMISSION_INCOMPLETE', measuredBy: 'scripts/r3l0ciar/falsifiers.mjs', baselineViolates: true, note: 'the baseline gate was green over sixteen unmeasured realizations' }),
    PASS: positive.green === true && negatives.every((entry) => entry.green === false && entry.causalExperimentValid === 'NO'),
  });
}

/* ================================================================ §8 the timeout and authorization */

/**
 * §8: THE TIMEOUT CLASSIFICATION AND THE AUTHORIZATION SEPARATION.
 *
 * The timeout half is measured END-TO-END by the caller through the real pipeline with the REPORT_THEN_HANG fault,
 * so the classification is the repaired one rather than a restatement. The authorization half is measured here:
 * a boolean resolves a signal and NOT a decision.
 */
export async function controlTimeoutAndAuthorization(input) {
  const { resolveExecutionMode } = await import('./modes.mjs');
  const { DESCENDANT_TERMINATION_LAW } = await import('./contract.mjs');
  const deterministic = await resolveExecutionMode({ mode: 'DETERMINISTIC' });
  const booleanOnly = await resolveExecutionMode({ mode: 'PRIMARY', paidAuthorization: true });
  const withDecision = await resolveExecutionMode({
    mode: 'PRIMARY', paidAuthorization: true,
    authorizationDecision: { authority: 'an external ruling', decisions: { PAID_MODEL_USAGE: true, BOUNDED_FAIL_STOP_PROTOCOL: true, NO_AUTOMATIC_RETRIES_OR_REPLACEMENTS: true, PRESERVE_PARTIALLY_COMPLETED_INVALID_RUNS: true, ACCEPTED_PROMPT_NEUTRALITY_LIMITED: true } },
  });
  const partialDecision = await resolveExecutionMode({ mode: 'PRIMARY', paidAuthorization: true, authorizationDecision: { authority: 'an external ruling', decisions: { PAID_MODEL_USAGE: true } } });
  return Object.freeze({
    id: 'FAIL_STOP_UNCERTAINTY_AND_AUTHORIZATION',
    positiveControl: Object.freeze({
      killIsNotProofOfExit: DESCENDANT_TERMINATION_LAW.killIsNotProofOfExit,
      workerResultLineIsNotProofOfExit: DESCENDANT_TERMINATION_LAW.workerResultLineIsNotProofOfExit,
      timedOutIsAlwaysUncertain: DESCENDANT_TERMINATION_LAW.timedOutIsAlwaysUncertain,
      onUnestablished: DESCENDANT_TERMINATION_LAW.onUnestablished,
      deterministicExternalCallPermitted: deterministic.externalModelCallPermitted,
      /** §8: a boolean is a SIGNAL, not a DECISION. */
      booleanSignalPresent: booleanOnly.paidAuthorizationSignalPresent,
      booleanDecisionPresent: booleanOnly.paidAuthorizationDecisionPresent,
      booleanIsNotADecision: booleanOnly.callerSuppliedBooleanIsNotADecision,
      fullDecisionPresent: withDecision.paidAuthorizationDecisionPresent,
      partialDecisionPresent: partialDecision.paidAuthorizationDecisionPresent,
      /** §8: this stage enters neither. */
      thisStageEntersPrimary: deterministic.thisStageEntersPrimary,
      slowWorkerObservation: input.slowWorkerObservation ?? null,
    }),
    mutant: Object.freeze({ id: 'G8_TIMEOUT_RESULT_LINE_AS_EXIT', measuredBy: 'scripts/r3l0ciar/falsifiers.mjs', baselineViolates: true, note: 'the baseline read a result line as an established exit and a boolean as authorization' }),
    PASS: DESCENDANT_TERMINATION_LAW.timedOutIsAlwaysUncertain === true
      && booleanOnly.paidAuthorizationSignalPresent === true
      && booleanOnly.paidAuthorizationDecisionPresent === false
      && withDecision.paidAuthorizationDecisionPresent === true
      && partialDecision.paidAuthorizationDecisionPresent === false,
  });
}

/* ================================================================ helpers */

function kindOf(handle) {
  if (/@ctx\/proof\//u.test(handle)) return 'proof';
  if (/@ctx\/reasoning\//u.test(handle)) return 'reasoning';
  if (/@ctx\/procedure\//u.test(handle)) return 'procedure';
  return 'unknown';
}

/** A structured clone good enough for the plain plan/measurement objects these controls perturb. */
function structuredCloneish(value) {
  return JSON.parse(JSON.stringify(value, (_key, entry) => (typeof entry === 'function' ? undefined : entry)));
}

/** §6: a fixture artifact: a corpus read, a much larger capital pull, and a result submission. */
export function writeFixtureArtifact() {
  const corpusRead = { type: 'tool/ptc-dispatch', seq: 1, time: 1_000, data: { name: 'read', arguments: { file_path: 'docs/history/incident-cutover.md' }, content: 'x'.repeat(500), isError: false } };
  const capitalPull = { type: 'tool/ptc-dispatch', seq: 2, time: 1_100, data: { name: 'palimpsest_worker_context_pull', arguments: { handle: '@ctx/procedure/prc-1/0' }, content: 'y'.repeat(5_000), isError: false } };
  const result = { type: 'tool/ptc-dispatch', seq: 3, time: 1_200, data: { name: 'palimpsest_worker_result', arguments: {}, content: 'ok', isError: false } };
  const start = { type: 'turn/start', time: 900, data: {} };
  const text = [start, corpusRead, capitalPull, result].map((record) => JSON.stringify(record)).join(NL) + NL;
  return zstdCompressSync(Buffer.from(text, 'utf8'));
}

/** §2: a digest over a run root's files, for the "no mutation before refusal" property. */
export function digestRoot(root) {
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

export { NL, tmpdir, readFileSync };
