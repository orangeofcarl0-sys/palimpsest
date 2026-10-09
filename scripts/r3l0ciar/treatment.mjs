/**
 * R3-L0C-I-A-R §5 — TREATMENT REALIZATION VERSUS CAPITAL UPTAKE, WITH PROVENANCE.
 *
 * THE DEFECT THIS CLOSES, measured in G5. R3-L0C-I-A's adapter read
 *
 *     governedPullCount: layers.workerPullObserved.count ?? 0        (primary-adapter.mjs:260)
 *
 * and `workerPullObserved.count` came from the SHIPPED parser, which returns `Object.freeze([])` both when the
 * transcript carries no telemetry line and when every telemetry line it finds is malformed. The two cases are
 * indistinguishable from the parser's return value, so the adapter reported a measured uptake of `0` for a worker
 * that emitted NO telemetry — a silent non-uptake observation that the study would have read as voluntary
 * restraint. §5 requires `WORKER_PULL_OBSERVED_ZERO` and `WORKER_PULL_TELEMETRY_MISSING` to be distinct, and it
 * forbids a host audit from repairing the gap.
 *
 * THE REPAIR IS A PROVENANCE STATE, NOT A NUMBER. The worker layer now carries a `provenance` drawn from
 * `UPTAKE_PROVENANCE`, and `count` is `null` unless the state is an OBSERVED one. The adapter may not coalesce
 * `null` to `0`; the analysis may not read a non-observed state as an uptake measurement.
 *
 * THE THREE LAYERS REMAIN SEPARATE. HostResolveAudit is a resolution proof and NOT uptake evidence;
 * WorkerPullObserved is the only voluntary-uptake evidence; WorkerHistoryAndCapitalActions is the artifact's own
 * dispatches. The treatment verdict comes from the CONSUMER BOUNDARY, never from uptake.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { NL, OBSERVED_UPTAKE_STATES, UPTAKE_PROVENANCE } from './contract.mjs';

/** §5: the shipped telemetry prefix and field, imported as values so the two cannot drift. */
export const WORKER_PULL_PREFIX = 'PALIMPSEST_WORKER_PULL ';
export const WORKER_PULL_FIELD = 'pulled';
export const SUPERSEDED_PULL_FIELD = 'handles';

/* ================================================================ §5 the shipped parser */

/**
 * §5: PARSE THE WORKER'S OWN PULL TELEMETRY, WITH THE SHIPPED PARSER.
 *
 * The shipped parser is used where possible. It cannot distinguish "no line" from "malformed line" — that is the
 * defect — so this module keeps a LOCAL shape reader for the provenance decision only, while the COUNT still
 * comes from the shipped parser. A local reimplementation of the count would be a second thing to keep in step.
 */
export async function shippedPullParser() {
  try {
    const module = await import('../../dist/src/deployment/work_worker.js');
    if (typeof module.parseWorkerPullLine !== 'function') return Object.freeze({ available: false, parse: null, reason: 'the shipped module exports no parseWorkerPullLine' });
    return Object.freeze({ available: true, parse: module.parseWorkerPullLine, reason: null, source: 'dist/src/deployment/work_worker.js' });
  } catch (error) {
    return Object.freeze({ available: false, parse: null, reason: `the shipped parser could not be imported: ${String(error?.message ?? error).slice(0, 200)}` });
  }
}

/**
 * §5: THE TELEMETRY SHAPE, WHICH IS WHAT DECIDES PROVENANCE.
 *
 * This answers three questions the shipped parser's return value cannot: is a telemetry line present at all; does
 * it use the shipped field; and is every line that carries the prefix unparseable (malformed). The COUNT is still
 * the shipped parser's, so the parity test can assert both against the same bytes.
 */
export function telemetryLineShape(transcriptText) {
  const lines = String(transcriptText).split(/\r?\n/u).filter((line) => line.startsWith(WORKER_PULL_PREFIX));
  if (lines.length === 0) {
    return Object.freeze({ present: false, lineCount: 0, fields: Object.freeze([]), usesShippedField: false, usesSupersededField: false, parseableLineCount: 0, malformedLineCount: 0, payloads: Object.freeze([]) });
  }
  const payloads = [];
  const fields = new Set();
  let malformed = 0;
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line.slice(WORKER_PULL_PREFIX.length));
      for (const key of Object.keys(parsed ?? {})) fields.add(key);
      payloads.push(parsed);
    } catch {
      malformed += 1;
    }
  }
  const fieldList = [...fields];
  return Object.freeze({
    present: true,
    lineCount: lines.length,
    fields: Object.freeze(fieldList),
    usesShippedField: fieldList.includes(WORKER_PULL_FIELD),
    usesSupersededField: fieldList.includes(SUPERSEDED_PULL_FIELD),
    parseableLineCount: lines.length - malformed,
    malformedLineCount: malformed,
    payloads: Object.freeze(payloads),
  });
}

/**
 * §5: THE UPTAKE PROVENANCE DECISION.
 *
 * Given the shape and the shipped parser's count, decide WHICH fact was observed. The order matters: an
 * unparseable transcript is MALFORMED rather than MISSING, and an unavailable parser is its own state — none of
 * the three may become a measured zero.
 */
export function uptakeProvenance(input) {
  const { parserAvailable, shape, shippedCount } = input;
  if (parserAvailable !== true) return Object.freeze({ provenance: UPTAKE_PROVENANCE.PARSER_UNAVAILABLE, count: null, observed: false });
  if (shape.present !== true) return Object.freeze({ provenance: UPTAKE_PROVENANCE.TELEMETRY_MISSING, count: null, observed: false });
  if (shape.parseableLineCount === 0) return Object.freeze({ provenance: UPTAKE_PROVENANCE.TELEMETRY_MALFORMED, count: null, observed: false });
  if (typeof shippedCount !== 'number') return Object.freeze({ provenance: UPTAKE_PROVENANCE.TELEMETRY_MALFORMED, count: null, observed: false });
  return Object.freeze({
    provenance: shippedCount === 0 ? UPTAKE_PROVENANCE.OBSERVED_ZERO : UPTAKE_PROVENANCE.OBSERVED_N,
    count: shippedCount,
    observed: true,
  });
}

/* ================================================================ §5 the three layers */

/**
 * §5: BUILD THE THREE SEPARATED LAYERS, WITH THE WORKER LAYER'S PROVENANCE.
 */
export async function buildPullLayers(input) {
  const { report, transcriptPath, artifactPath, expectedHandles } = input;

  /** LAYER 1: the host's own audit — a resolution proof, NOT uptake evidence. */
  const hostResolutions = [...(report?.governedPulls ?? [])];
  const hostLayer = Object.freeze({
    id: 'HostResolveAudit',
    count: hostResolutions.length,
    handles: Object.freeze(hostResolutions.map((pull) => pull.handle)),
    resolved: hostResolutions.filter((pull) => pull.resolved === true).length,
    bodyDigests: Object.freeze(hostResolutions.filter((pull) => typeof pull.bodyDigest === 'string').map((pull) => Object.freeze({ handle: pull.handle, digest: pull.bodyDigest }))),
    isUptakeEvidence: false,
    establishes: 'owner resolution and the canonical body digest for each visible handle',
    forbiddenReading: 'do not use HostResolveAudit as evidence of voluntary Worker uptake',
  });

  /** LAYER 2: the worker's OWN telemetry, through the SHIPPED parser, with an explicit provenance. */
  const parser = await shippedPullParser();
  const transcript = transcriptPath !== null && transcriptPath !== undefined && existsSync(transcriptPath) ? readFileSync(transcriptPath, 'utf8') : '';
  const shape = telemetryLineShape(transcript);
  const pulled = parser.available ? parser.parse(transcript) : null;
  const provenance = uptakeProvenance({ parserAvailable: parser.available, shape, shippedCount: pulled === null ? null : pulled.length });
  const workerLayer = Object.freeze({
    id: 'WorkerPullObserved',
    parserAvailable: parser.available,
    parserSource: parser.source ?? null,
    parserFailure: parser.reason,
    telemetryLinePresent: shape.present,
    telemetryFields: shape.fields,
    usesShippedField: shape.usesShippedField,
    usesSupersededField: shape.usesSupersededField,
    /** §5: the provenance state, which is what separates a measured zero from a missing measurement. */
    provenance: provenance.provenance,
    observed: provenance.observed,
    /** §5: the ONLY uptake number. `null` unless the state is an OBSERVED one, and never coalesced to 0. */
    count: provenance.count,
    handles: pulled === null ? null : Object.freeze([...pulled]),
    pulledAllVisible: provenance.count === null ? null : expectedHandles !== undefined && expectedHandles.length > 0 ? expectedHandles.every((handle) => pulled.includes(handle)) : provenance.count === 0,
    isUptakeEvidence: true,
    establishes: 'whether the worker VOLUNTARILY pulled each visible handle, when its telemetry was observable',
    forbiddenReading: 'do not infer a worker pull from a host audit operation, and do not read a missing telemetry line as zero pulls',
  });

  /** LAYER 3: the session artifact's own dispatches. */
  const artifactLayer = await buildArtifactLayer(artifactPath);

  return Object.freeze({
    schemaVersion: 1,
    kind: 'three-layer pull telemetry',
    layers: Object.freeze([hostLayer, workerLayer, artifactLayer]),
    hostResolveAudit: hostLayer,
    workerPullObserved: workerLayer,
    workerHistoryAndCapitalActions: artifactLayer,
    layersAreSeparate: hostLayer.id !== workerLayer.id && workerLayer.id !== artifactLayer.id,
    hostAuditIsUptakeEvidence: false,
    workerTelemetryIsUptakeEvidence: true,
    /** §5: the states that may be read as an uptake measurement. */
    observedUptakeStates: OBSERVED_UPTAKE_STATES,
    /** §5: a missing or malformed telemetry line is NOT a measured zero. */
    missingTelemetryReadAsZero: false,
    hostAuditExceedsWorkerUptake: workerLayer.count !== null && hostLayer.count > workerLayer.count,
  });
}

/** §5: the third layer, from the frozen R3-L0C instrumentation, or a labelled absence. */
async function buildArtifactLayer(artifactPath) {
  if (artifactPath === null || artifactPath === undefined || !existsSync(artifactPath)) {
    return Object.freeze({
      id: 'WorkerHistoryAndCapitalActions', available: false,
      reason: 'no session artifact was supplied for this session, so the dispatch layer is unavailable rather than empty',
      isUptakeEvidence: true, establishes: 'what the worker actually dispatched, including capital pulls and the returned content',
    });
  }
  try {
    const { reconstructCost } = await import('../r3l0c/instrumentation.mjs');
    const cost = reconstructCost({ path: artifactPath, attemptId: null });
    return Object.freeze({
      id: 'WorkerHistoryAndCapitalActions', available: true, artifactPath,
      totalDispatches: cost.totalDispatches, dispatchesBeforeResult: cost.dispatchesBeforeResult,
      historyReadActions: cost.historyReadActions, capitalPullActions: cost.capitalPullActions,
      capitalPullReturned: cost.capitalPullReturned, actionsBeforeFirstResult: cost.actionsBeforeFirstResult,
      elapsedToFirstResultMs: cost.elapsedToFirstResultMs, completionCause: cost.completionCause,
      isUptakeEvidence: true, establishes: 'what the worker actually dispatched, including capital pulls and the returned content',
    });
  } catch (error) {
    return Object.freeze({ id: 'WorkerHistoryAndCapitalActions', available: false, reason: `the session artifact could not be reconstructed: ${String(error?.message ?? error).slice(0, 200)}`, artifactPath, isUptakeEvidence: true });
  }
}

/* ================================================================ §5 the treatment verdict */

/**
 * §5: COMPUTE THE TREATMENT REALIZATION FROM ACTUAL CONSUMER EVIDENCE.
 *
 * The verdict compares the FROZEN expectation against the handles the consumer boundary actually carried, using
 * the frozen R3-L0C-R `verifyRealization`. It does NOT read a field and does NOT consult uptake.
 */
export async function computeTreatmentRealization(input) {
  const { expectation, report, arm, generationId } = input;
  const { treatmentTelemetry, verifyRealization, expectationDigest } = await import('../r3l0cr/contract.mjs');
  const payload = report?.payload ?? null;

  /**
   * §5: H IS THE ABSENCE OF A SELECTION, and an empty object must not silently stand in for it. For C, the request
   * is reconstructed from the manifest's own `expectedSelectionByKind`, so the requested/compiled/visible
   * comparison is made against one frozen artifact.
   */
  const requestedSelection = arm === 'H'
    ? null
    : (input.requestedSelection ?? deriveRequestedFromExpectation(expectation));
  const telemetry = treatmentTelemetry({ requestedSelection, payload, governedPulls: report?.governedPulls ?? [] });
  const realization = expectation === null || expectation === undefined ? null : verifyRealization(expectation, telemetry);

  const emptyObjectSubstitutedForAbsence = arm === 'H' && input.requestedSelection !== null && input.requestedSelection !== undefined && Object.keys(input.requestedSelection).length === 0;

  return Object.freeze({
    arm,
    generationId,
    requestedSelectionKind: requestedSelection === null ? 'ABSENT' : 'PRESENT',
    requestedSelectionWasEmptyObject: emptyObjectSubstitutedForAbsence,
    consumerVisibleHandles: telemetry.consumerVisibleHandles,
    consumerVisibleKinds: Object.freeze((payload?.handles ?? []).map((entry) => entry.kind)),
    expectedConsumerVisibleHandles: Object.freeze([...(expectation?.expectedConsumerVisibleHandles ?? [])]),
    expectedCounts: expectation?.expectedCounts ?? null,
    compiledCounts: telemetry.compiledCounts,
    sameSet: realization?.sameSet ?? null,
    countsMatch: realization?.countsMatch ?? null,
    requestedMatches: realization?.requestedMatches ?? null,
    TREATMENT_REALIZATION: realization?.TREATMENT_REALIZATION ?? 'NO_EXPECTATION',
    onMismatch: realization?.onMismatch ?? null,
    TRIAL_DISPOSITION: realization?.TREATMENT_REALIZATION === 'NOT_APPLIED' ? 'TRIAL_INVALID' : 'CONTINUE',
    STOP_MATRIX: realization?.TREATMENT_REALIZATION === 'NOT_APPLIED',
    retryPermitted: false,
    expectationDigest: expectation === undefined || expectation === null ? null : expectationDigest(expectation),
    uptakeRequiredForDelivery: false,
    hostAuditUsedAsUptake: false,
  });
}

/** §5: reconstruct the request from the frozen expectation, so the comparison uses one artifact. */
function deriveRequestedFromExpectation(expectation) {
  if (expectation === null || expectation === undefined || expectation.expectedSelectionByKind === undefined) return null;
  const byKind = expectation.expectedSelectionByKind;
  return Object.freeze({
    proof: [...(byKind.proof ?? [])],
    reasoning: [...(byKind.reasoning ?? [])],
    procedure: [...(byKind.procedure ?? [])],
  });
}

/* ================================================================ §5 the combined observation */

/**
 * §5: THE SESSION'S TREATMENT AND UPTAKE OBSERVATION, WITH THE UPTAKE STATE CARRIED EXPLICITLY.
 *
 * `WORKER_UPTAKE` is `UNMEASURED` when the provenance is not an OBSERVED one, so a reader cannot mistake a missing
 * telemetry line for a zero. `declinedVisibleCapital` fires only when the uptake was genuinely OBSERVED as zero.
 */
export async function observeTreatmentAndUptake(input) {
  const { expectation, report, arm, generationId, transcriptPath, artifactPath } = input;
  const realization = await computeTreatmentRealization({ expectation, report, arm, generationId, requestedSelection: input.requestedSelection });
  const layers = await buildPullLayers({ report, transcriptPath, artifactPath, expectedHandles: realization.expectedConsumerVisibleHandles });

  const visible = realization.consumerVisibleHandles.length;
  const worker = layers.workerPullObserved;
  const pulled = worker.count;
  /** §5: the behavioural observation fires only on a genuinely OBSERVED zero. */
  const declinedVisibleCapital = visible > 0 && worker.observed === true && pulled === 0;
  const observations = [];
  if (declinedVisibleCapital) observations.push('MODEL_DECLINED_VISIBLE_CAPITAL');
  if (visible > 0 && worker.observed === true && pulled !== null && pulled > 0 && pulled < visible) observations.push('PARTIAL_CAPITAL_UPTAKE');

  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R',
    kind: 'treatment and uptake observation',
    sessionId: input.sessionId ?? null,
    arm,
    generationId,
    realization,
    layers,
    TREATMENT_REALIZATION: realization.TREATMENT_REALIZATION,
    /** §5: `UNMEASURED` is its own value, distinct from `ZERO`. */
    WORKER_UPTAKE: worker.observed !== true ? 'UNMEASURED' : pulled === 0 ? 'ZERO' : pulled >= visible ? 'FULL' : 'PARTIAL',
    workerUptakeProvenance: worker.provenance,
    workerUptakeObserved: worker.observed,
    workerUptakeCount: pulled,
    hostResolveCount: layers.hostResolveAudit.count,
    declinedVisibleCapital,
    observations: Object.freeze(observations),
    declinedPullStopsTheMatrix: false,
    realizationMismatchStopsTheMatrix: realization.TREATMENT_REALIZATION === 'NOT_APPLIED',
    retryPermitted: false,
    /** §5: a non-observed uptake blocks the causal verdict rather than becoming a zero-cost session. */
    uptakeTelemetryInterpretable: worker.observed === true,
    observationDigest: createHash('sha256').update(JSON.stringify({ sessionId: input.sessionId ?? null, arm, generationId, realization: realization.TREATMENT_REALIZATION, visible, provenance: worker.provenance, pulled }), 'utf8').digest('hex'),
  });
}

export { NL, UPTAKE_PROVENANCE };
