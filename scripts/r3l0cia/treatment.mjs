/**
 * R3-L0C-I-A §4 — TREATMENT REALIZATION VERSUS CAPITAL UPTAKE.
 *
 * THE TWO DEFECTS THIS CLOSES, both measured in F3 and F4.
 *
 * F3: the baseline adapter computed `treatmentMismatch: report?.treatmentMismatch === true`, and
 * `generation-child.mjs` never writes that field. So the frozen expectation was never compared against what the
 * consumer actually saw — R3-L0C-R built `buildExpectationManifest` and `verifyRealization` for exactly that
 * comparison and the baseline called neither. A C/G2 session that compiled two handles instead of four, or four
 * WRONG handles, ran to completion with no mismatch recorded.
 *
 * F4: the baseline read `governedPullCount` from `report.governedPulls`, which the child fills by looping over the
 * payload's handles and calling `controller.fetchContext(attemptId, handle)` — a HOST-side audit on the host's
 * own initiative, after the worker exited. Measured: four host resolutions while the worker's own telemetry
 * reported zero pulls. The baseline cannot distinguish them, so `MODEL_DECLINED_VISIBLE_CAPITAL` — which fires
 * when visible > 0 and pulls === 0 — can never fire, and the study's central uptake observation is invisible.
 *
 * THE THREE LAYERS ARE SEPARATE BECAUSE THEY ANSWER DIFFERENT QUESTIONS:
 *
 *   HostResolveAudit               host-initiated resolutions. Proves the canonical owner body resolves. NOT
 *                                  uptake evidence, and using it as such is the defect F4 measures.
 *   WorkerPullObserved             the worker's OWN `PALIMPSEST_WORKER_PULL` telemetry, through the SHIPPED
 *                                  parser. This is the only evidence of voluntary uptake.
 *   WorkerHistoryAndCapitalActions the session artifact's tool dispatches, which is the third and slowest layer:
 *                                  what the worker actually dispatched, and what came back.
 *
 * THE TREATMENT VERDICT COMES FROM THE CONSUMER BOUNDARY, NOT FROM UPTAKE. §4 says it in one line: "Do not
 * require voluntary capital consumption as a prerequisite for treatment delivery. A model choosing not to pull
 * is a behavioral observation." So a C session whose four handles reached the consumer and were never pulled is
 * TREATMENT_REALIZATION = APPLIED with uptake ZERO — an admissible observation, not a failed trial.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { PULL_LAYERS, WORKER_PULL_TELEMETRY } from './contract.mjs';

const NL = String.fromCharCode(10);

/** §4: the shipped telemetry prefix and field, imported as values so the two cannot drift. */
export const WORKER_PULL_PREFIX = WORKER_PULL_TELEMETRY.prefix;
export const WORKER_PULL_FIELD = WORKER_PULL_TELEMETRY.field;

/* ================================================================ §4 the shipped parser */

/**
 * §4: PARSE THE WORKER'S OWN PULL TELEMETRY, WITH THE SHIPPED PARSER.
 *
 * §4 requires the shipped parser to be used where possible, and the reason is the defect itself: R3-L0C-I's mock
 * emitted `{"handles":[...]}` while the runner emits `{"pulled":[...]}`, so the shipped parser would read the
 * mock's line as ZERO pulls for every session — a mock that silently reports non-uptake everywhere. Using the
 * shipped parser makes that divergence a test failure rather than an invisible zero.
 *
 * The parser is imported from `dist/**`, which is what actually runs, and a failure to import is REPORTED rather
 * than silently replaced by a local reimplementation: a second parser is a second thing to keep in step, which is
 * how the divergence arose in the first place.
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
 * §4: THE LOCAL TELEMETRY SHAPE CHECK.
 *
 * It is deliberately NOT a second parser for the verdict: it answers a different question, which is whether a
 * transcript's telemetry line uses the SHIPPED field name. That is what the parity test asserts, and keeping it
 * separate means the parity check can name the divergence (`handles` vs `pulled`) rather than merely reporting
 * that a count was zero.
 */
export function telemetryLineShape(transcriptText) {
  const lines = String(transcriptText).split(/\r?\n/u).filter((line) => line.startsWith(WORKER_PULL_PREFIX));
  if (lines.length === 0) return Object.freeze({ present: false, fields: Object.freeze([]), usesShippedField: false, usesSupersededField: false, payloads: Object.freeze([]) });
  const payloads = [];
  const fields = new Set();
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line.slice(WORKER_PULL_PREFIX.length));
      for (const key of Object.keys(parsed ?? {})) fields.add(key);
      payloads.push(parsed);
    } catch { /* a malformed line is not evidence; the shipped parser skips it too */ }
  }
  const fieldList = [...fields];
  return Object.freeze({
    present: true,
    lineCount: lines.length,
    fields: Object.freeze(fieldList),
    usesShippedField: fieldList.includes(WORKER_PULL_FIELD),
    usesSupersededField: fieldList.includes(WORKER_PULL_TELEMETRY.supersededShape),
    payloads: Object.freeze(payloads),
  });
}

/* ================================================================ §4 the three layers */

/**
 * §4: BUILD THE THREE SEPARATED LAYERS.
 *
 * Each is derived from where it is ACTUALLY observable, so no layer can stand in for another:
 *
 *   HostResolveAudit               the child's `report.governedPulls`, which are host `fetchContext()` calls
 *   WorkerPullObserved             the worker's own telemetry line, through the SHIPPED parser
 *   WorkerHistoryAndCapitalActions the session artifact's dispatches, via the frozen R3-L0C instrumentation
 *
 * The `reading` field states what may and may not be concluded, so a downstream analysis cannot quietly use the
 * host audit as uptake — the exact reading §4 forbids.
 */
export async function buildPullLayers(input) {
  const { report, transcriptPath, artifactPath, expectedHandles } = input;

  /** LAYER 1: the host's own audit, which is a resolution proof and NOT uptake evidence. */
  const hostResolutions = [...(report?.governedPulls ?? [])];
  const hostLayer = Object.freeze({
    id: 'HostResolveAudit',
    count: hostResolutions.length,
    handles: Object.freeze(hostResolutions.map((pull) => pull.handle)),
    resolved: hostResolutions.filter((pull) => pull.resolved === true).length,
    bodyDigests: Object.freeze(hostResolutions.filter((pull) => typeof pull.bodyDigest === 'string').map((pull) => Object.freeze({ handle: pull.handle, digest: pull.bodyDigest }))),
    /** §4: the property that keeps this layer from being misread. */
    isUptakeEvidence: false,
    establishes: 'owner resolution and the canonical body digest for each visible handle',
    forbiddenReading: PULL_LAYERS[0].forbiddenReading,
  });

  /** LAYER 2: the worker's OWN telemetry, through the SHIPPED parser. */
  const parser = await shippedPullParser();
  const transcript = transcriptPath !== null && transcriptPath !== undefined && existsSync(transcriptPath) ? readFileSync(transcriptPath, 'utf8') : '';
  const shape = telemetryLineShape(transcript);
  const pulled = parser.available ? parser.parse(transcript) : null;
  const workerLayer = Object.freeze({
    id: 'WorkerPullObserved',
    parserAvailable: parser.available,
    parserSource: parser.source ?? null,
    parserFailure: parser.reason,
    telemetryLinePresent: shape.present,
    telemetryFields: shape.fields,
    usesShippedField: shape.usesShippedField,
    usesSupersededField: shape.usesSupersededField,
    /** §4: the ONLY uptake number. `null` when the shipped parser is unavailable, never a local substitute. */
    count: pulled === null ? null : pulled.length,
    handles: pulled === null ? null : Object.freeze([...pulled]),
    /** §4: whether the worker pulled every handle it could see. */
    pulledAllVisible: pulled === null ? null : expectedHandles !== undefined && expectedHandles.length > 0 ? expectedHandles.every((handle) => pulled.includes(handle)) : pulled.length === 0,
    isUptakeEvidence: true,
    establishes: 'whether the worker VOLUNTARILY pulled each visible handle',
    forbiddenReading: PULL_LAYERS[1].forbiddenReading,
  });

  /** LAYER 3: the session artifact's own dispatches, through the frozen instrumentation. */
  const artifactLayer = await buildArtifactLayer(artifactPath);

  return Object.freeze({
    schemaVersion: 1,
    kind: 'three-layer pull telemetry',
    layers: Object.freeze([hostLayer, workerLayer, artifactLayer]),
    hostResolveAudit: hostLayer,
    workerPullObserved: workerLayer,
    workerHistoryAndCapitalActions: artifactLayer,
    /** §4: the separation, as a value a test can assert. */
    layersAreSeparate: hostLayer.id !== workerLayer.id && workerLayer.id !== artifactLayer.id,
    hostAuditIsUptakeEvidence: false,
    workerTelemetryIsUptakeEvidence: true,
    /** §4: the divergence F4 measured, recomputed so a report cannot forget it. */
    hostAuditExceedsWorkerUptake: workerLayer.count !== null && hostLayer.count > workerLayer.count,
  });
}

/** §4: the third layer, from the frozen R3-L0C instrumentation, or a labelled absence. */
async function buildArtifactLayer(artifactPath) {
  if (artifactPath === null || artifactPath === undefined || !existsSync(artifactPath)) {
    return Object.freeze({
      id: 'WorkerHistoryAndCapitalActions',
      available: false,
      reason: 'no session artifact was supplied for this session, so the dispatch layer is unavailable rather than empty',
      isUptakeEvidence: true,
      establishes: 'what the worker actually dispatched, including capital pulls and the returned content',
    });
  }
  try {
    const { reconstructCost } = await import('../r3l0c/instrumentation.mjs');
    const cost = reconstructCost({ path: artifactPath, attemptId: null });
    return Object.freeze({
      id: 'WorkerHistoryAndCapitalActions',
      available: true,
      artifactPath,
      totalDispatches: cost.totalDispatches,
      dispatchesBeforeResult: cost.dispatchesBeforeResult,
      historyReadActions: cost.historyReadActions,
      capitalPullActions: cost.capitalPullActions,
      capitalPullReturned: cost.capitalPullReturned,
      actionsBeforeFirstResult: cost.actionsBeforeFirstResult,
      elapsedToFirstResultMs: cost.elapsedToFirstResultMs,
      completionCause: cost.completionCause,
      isUptakeEvidence: true,
      establishes: 'what the worker actually dispatched, including capital pulls and the returned content',
      forbiddenReading: PULL_LAYERS[2].forbiddenReading,
    });
  } catch (error) {
    return Object.freeze({
      id: 'WorkerHistoryAndCapitalActions',
      available: false,
      reason: `the session artifact could not be reconstructed: ${String(error?.message ?? error).slice(0, 200)}`,
      artifactPath,
      isUptakeEvidence: true,
    });
  }
}

/* ================================================================ §4 the treatment verdict */

/**
 * §4: COMPUTE THE TREATMENT REALIZATION FROM ACTUAL CONSUMER EVIDENCE.
 *
 * THE CORRECTION, stated plainly: the verdict compares the FROZEN expectation against the handles the consumer
 * boundary actually carried, using the frozen R3-L0C-R `verifyRealization`. It does NOT read a field, and it does
 * NOT consult uptake.
 *
 * §4's rule about count equality is enforced by the frozen contract's own `sameSet` and `countsMatch`, which
 * compare identity AND kind AND count. A C/G2 session with four handles of the wrong kind therefore fails, and
 * the falsifier asserts exactly that.
 */
export async function computeTreatmentRealization(input) {
  const { expectation, report, arm, generationId } = input;
  const { treatmentTelemetry, verifyRealization } = await import('../r3l0cr/contract.mjs');
  const payload = report?.payload ?? null;

  /**
   * §4: H IS THE ABSENCE OF A SELECTION, and an empty object must not silently stand in for it.
   *
   * The frozen `treatmentTelemetry` reads the requested counts from the selection it is given. For H there IS no
   * selection, so it is passed `null` and the requested counts are zero. Passing `{}` instead would be the exact
   * substitution §4 forbids: an empty object would produce the same zero counts while erasing the distinction
   * between "no selection was requested" and "a selection was requested and came back empty".
   *
   * FOR C, THE REQUEST IS THE FROZEN EXPECTATION. The manifest was built BEFORE execution from the admitted
   * capital, so it IS the requested set — and a caller that had to re-derive it could derive it differently. When
   * no selection is supplied, the request is therefore reconstructed from the manifest's own
   * `expectedSelectionByKind`, so the requested/compiled/visible comparison is made against one frozen artifact
   * rather than against a second construction of the same intent.
   */
  const requestedSelection = arm === 'H'
    ? null
    : (input.requestedSelection ?? deriveRequestedFromExpectation(expectation));
  const telemetry = treatmentTelemetry({ requestedSelection, payload, governedPulls: report?.governedPulls ?? [] });
  const realization = expectation === null || expectation === undefined ? null : verifyRealization(expectation, telemetry);

  /** §4: the empty-object guard, evaluated rather than assumed. */
  const emptyObjectSubstitutedForAbsence = arm === 'H' && input.requestedSelection !== null && input.requestedSelection !== undefined && Object.keys(input.requestedSelection).length === 0;

  return Object.freeze({
    arm,
    generationId,
    requestedSelectionKind: requestedSelection === null ? 'ABSENT' : 'PRESENT',
    requestedSelectionWasEmptyObject: emptyObjectSubstitutedForAbsence,
    /** §4: the consumer boundary, which is what the verdict is computed from. */
    consumerVisibleHandles: telemetry.consumerVisibleHandles,
    consumerVisibleKinds: Object.freeze((payload?.handles ?? []).map((entry) => entry.kind)),
    expectedConsumerVisibleHandles: Object.freeze([...(expectation?.expectedConsumerVisibleHandles ?? [])]),
    expectedCounts: expectation?.expectedCounts ?? null,
    compiledCounts: telemetry.compiledCounts,
    /** §4: the frozen contract's verdict, unmodified. */
    sameSet: realization?.sameSet ?? null,
    countsMatch: realization?.countsMatch ?? null,
    requestedMatches: realization?.requestedMatches ?? null,
    TREATMENT_REALIZATION: realization?.TREATMENT_REALIZATION ?? 'NO_EXPECTATION',
    onMismatch: realization?.onMismatch ?? null,
    /** §4: the disposition a mismatch produces. */
    TRIAL_DISPOSITION: realization?.TREATMENT_REALIZATION === 'NOT_APPLIED' ? 'TRIAL_INVALID' : 'CONTINUE',
    STOP_MATRIX: realization?.TREATMENT_REALIZATION === 'NOT_APPLIED',
    retryPermitted: false,
    /** §4: the frozen expectation's own digest, so the comparison is against a bound artifact. */
    expectationDigest: expectation === undefined || expectation === null ? null : (await import('../r3l0cr/contract.mjs')).expectationDigest(expectation),
    /** §4: the forbidden reading, carried as a value. */
    uptakeRequiredForDelivery: false,
    hostAuditUsedAsUptake: false,
  });
}

/**
 * §4: RECONSTRUCT THE REQUEST FROM THE FROZEN EXPECTATION.
 *
 * `treatmentTelemetry` reads only each kind's LENGTH, so the request is represented as three arrays of the
 * manifest's own expected handles. That is deliberate: it makes the requested count derive from the SAME frozen
 * artifact the expected set came from, so a caller cannot satisfy the check by re-deriving the intent.
 */
function deriveRequestedFromExpectation(expectation) {
  if (expectation === null || expectation === undefined || expectation.expectedSelectionByKind === undefined) return null;
  const byKind = expectation.expectedSelectionByKind;
  return Object.freeze({
    proof: [...(byKind.proof ?? [])],
    reasoning: [...(byKind.reasoning ?? [])],
    procedure: [...(byKind.procedure ?? [])],
  });
}

/* ================================================================ §4 the combined observation */

/**
 * §4: THE SESSION'S TREATMENT AND UPTAKE OBSERVATION.
 *
 * This is what the admission schema and the analysis read: the realization verdict, the three layers, and the
 * behavioural observation they imply. It is deliberately ONE function so a caller cannot obtain the realization
 * without also obtaining the uptake, which is how a report could otherwise present delivery as if it implied use.
 */
export async function observeTreatmentAndUptake(input) {
  const { expectation, report, arm, generationId, transcriptPath, artifactPath } = input;
  const realization = await computeTreatmentRealization({ expectation, report, arm, generationId, requestedSelection: input.requestedSelection });
  const layers = await buildPullLayers({ report, transcriptPath, artifactPath, expectedHandles: realization.expectedConsumerVisibleHandles });

  const visible = realization.consumerVisibleHandles.length;
  const pulled = layers.workerPullObserved.count;
  /** §4: the behavioural observation, which is RECORDED and never a reason to stop. */
  const declinedVisibleCapital = visible > 0 && pulled === 0;
  const observations = [];
  if (declinedVisibleCapital) observations.push('MODEL_DECLINED_VISIBLE_CAPITAL');
  if (visible > 0 && pulled !== null && pulled > 0 && pulled < visible) observations.push('PARTIAL_CAPITAL_UPTAKE');

  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A',
    kind: 'treatment and uptake observation',
    sessionId: input.sessionId ?? null,
    arm,
    generationId,
    realization,
    layers,
    /** §4: the two independent facts, never collapsed. */
    TREATMENT_REALIZATION: realization.TREATMENT_REALIZATION,
    WORKER_UPTAKE: pulled === null ? 'UNMEASURED' : pulled === 0 ? 'ZERO' : pulled >= visible ? 'FULL' : 'PARTIAL',
    workerUptakeCount: pulled,
    hostResolveCount: layers.hostResolveAudit.count,
    declinedVisibleCapital,
    observations: Object.freeze(observations),
    /** §4: a declined pull is recorded, and it does NOT stop the matrix. */
    declinedPullStopsTheMatrix: false,
    /** §4: a realization mismatch DOES stop the matrix, and it is not retried. */
    realizationMismatchStopsTheMatrix: realization.TREATMENT_REALIZATION === 'NOT_APPLIED',
    retryPermitted: false,
    /** §4: the digest of the observation, so a record can bind it. */
    observationDigest: createHash('sha256').update(JSON.stringify({ sessionId: input.sessionId ?? null, arm, generationId, realization: realization.TREATMENT_REALIZATION, visible, pulled }), 'utf8').digest('hex'),
  });
}

export { NL };
