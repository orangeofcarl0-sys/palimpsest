/**
 * R3-L0C-R §10/§11 — THE RUN-1 NO-TREATMENT BASELINE CALIBRATION.
 *
 * §1 freezes the interpretation: Run 1 is `TREATMENT_NOT_APPLIED`. Its eight intended C sessions are not failed
 * capital-uptake observations; they are treatment-realization failures. §10 therefore says to analyse the 16
 * sessions as NO-TREATMENT baseline observations only, and explicitly NOT to compare the H and C labels — the
 * labels describe an intent that was not realized, so a label comparison would compare two samples of the same
 * condition and call the difference a treatment effect.
 *
 * WHAT THE CALIBRATION IS FOR. It answers an ECONOMIC question the stage needs before spending another model
 * call: does the frozen project actually create reconstruction pressure? If no session reads the raw history,
 * then the experiment has nothing to compress and the capital could not help even if it were delivered. §11
 * makes that a gate with fixed thresholds, and it is deliberately NOT a treatment-effect result.
 *
 * THE MECHANICAL PRE-CONDITION. Before any metric is reported, the calibration PROVES the model-visible capital
 * surface was empty for all 16 sessions. Without that proof the numbers below would be measuring something
 * unknown; with it, they are a clean no-treatment baseline.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORPUS_DOCUMENTS, declaredCorpusPaths } from '../r3l0c/corpus.mjs';
import { reconstructCost, sessionArtifacts } from '../r3l0c/instrumentation.mjs';

const NL = String.fromCharCode(10);

/**
 * §11: THE RECONSTRUCTION-PRESSURE GATE, frozen before the calibration runs.
 *
 * §11 states three thresholds and requires ALL of them. They are data here so the gate cannot be restated
 * loosely after the numbers are seen.
 */
export const PRESSURE_GATE = Object.freeze({
  sessionsAccessingAtLeastOneArtifact: Object.freeze({ required: 12, of: 16, description: 'at least 12/16 sessions access >=1 declared raw-history artifact before first Result' }),
  medianDistinctArtifacts: Object.freeze({ required: 2, description: 'median distinct raw-history artifacts read >= 2' }),
  sessionsAccessingAtLeastTwoCategories: Object.freeze({ required: 8, of: 16, description: 'at least 8/16 sessions access >=2 distinct raw-history categories' }),
  correctnessAtCeilingIsNotAFailure: true,
  kind: 'economic/readiness gate, NOT a treatment-effect result',
});

/**
 * §10: THE DOCUMENT CATEGORY OF A DECLARED CORPUS PATH.
 *
 * The category comes from the frozen corpus definition, so a session's category coverage is derived from what
 * the Project declares rather than from the path spelling.
 */
export function categoryOfPath(path) {
  const normalized = String(path).replace(/\\/gu, '/');
  const document = CORPUS_DOCUMENTS.find((entry) => normalized.endsWith(entry.path) || normalized.endsWith(entry.path.split('/').pop() ?? ''));
  return document?.category ?? null;
}

/**
 * §10: CALIBRATE ONE SESSION.
 *
 * Every field §10 asks for, derived from the durable session artifact. The session is treated as a NO-TREATMENT
 * observation: its arm label is RECORDED for traceability but is not used as a grouping variable.
 */
export function calibrateSession(input) {
  const { artifact, sessionId, arm, block, generation } = input;
  const cost = reconstructCost(artifact);
  const categories = [...new Set(cost.rawHistoryArtifactIds.map((id) => {
    const document = CORPUS_DOCUMENTS.find((entry) => entry.path.endsWith(id) || (entry.path.split('/').pop() ?? '') === id);
    return document?.category ?? null;
  }).filter((category) => category !== null))];
  return Object.freeze({
    sessionId,
    /** Recorded for traceability ONLY; §10 forbids grouping by it. */
    arm,
    block,
    generation,
    attemptId: artifact.attemptId,
    /** §10: the metrics. */
    rawHistoryArtifactsRead: cost.rawHistoryArtifactsRead,
    rawHistoryArtifactIds: cost.rawHistoryArtifactIds,
    distinctRawHistoryCategories: categories.length,
    rawHistoryCategories: Object.freeze(categories),
    rawHistoryBytesReturned: cost.rawHistoryBytesReturned,
    historyReadActions: cost.historyReadActions,
    actionsBeforeFirstResult: cost.actionsBeforeFirstResult,
    elapsedToFirstResultMs: cost.elapsedToFirstResultMs,
    finalInvariantVector: null,
    completionCause: cost.completionCause,
    resultSubmitted: cost.resultSubmitted,
  });
}

/**
 * §10: CALIBRATE EVERY SESSION OF A RUN.
 *
 * The sessions are matched to the committed matrix by attempt id, so the arm/block/generation labels come from
 * the experiment's own record rather than from a directory name.
 */
export function calibrateRun(runDir, matrix) {
  const sessions = [];
  for (const trajectory of matrix.trajectories) {
    const home = join(runDir, 'units', trajectory.trajectoryId, 'home');
    if (!existsSync(home)) continue;
    const artifacts = sessionArtifacts(home);
    for (const generation of trajectory.generations) {
      const attemptId = String(generation.attemptId ?? '').replace(/^attempt-/u, '');
      const artifact = artifacts.find((entry) => entry.attemptId === attemptId);
      if (artifact === undefined) continue;
      const vector = generation.finalVector ?? null;
      const calibrated = calibrateSession({ artifact, sessionId: generation.sessionId, arm: trajectory.arm, block: trajectory.block, generation: generation.generation });
      sessions.push(Object.freeze({ ...calibrated, finalInvariantVector: vector === null ? null : Object.freeze({ prepaidCoverage: vector.prepaidCoverage ?? null, failedClasses: vector.failedClasses ?? [] }) }));
    }
  }
  return Object.freeze(sessions);
}

/**
 * §1/§10: PROVE THE MODEL-VISIBLE CAPITAL SURFACE WAS EMPTY FOR EVERY SESSION.
 *
 * This is the mechanical pre-condition. `selectionRequested: true` with zero compiled handles is a
 * TREATMENT-REALIZATION failure, so the proof is that NO session — C or H — had a compiled handle. If any C
 * session had compiled one, the run would be a partially-treated sample and the calibration would be invalid.
 */
export function proveEmptyCapitalSurface(matrix) {
  const sessions = matrix?.sessions ?? [];
  const compiledOf = (session) => session.payload?.compiledHandleCount ?? 0;
  const withHandles = sessions.filter((session) => compiledOf(session) > 0);
  const cSessions = sessions.filter((session) => session.arm === 'C');
  const cSelectedButEmpty = cSessions.filter((session) => session.knowledgeSelected === true && compiledOf(session) === 0);
  return Object.freeze({
    sessions: sessions.length,
    sessionsWithCompiledHandles: withHandles.length,
    emptyForEverySession: sessions.length > 0 && withHandles.length === 0,
    cSessionsReportingSelectionRequested: cSessions.filter((session) => session.knowledgeSelected === true).length,
    cSessionsWithZeroCompiled: cSessions.filter((session) => compiledOf(session) === 0).length,
    cSelectionRequestedButNotCompiled: cSessions.filter((session) => session.knowledgeSelected === true && compiledOf(session) === 0).length,
    /** §3: the corrected reading, stated as a value so a report cannot restate it as uptake failure. */
    reading: cSelectedButEmpty.length > 0
      ? 'TREATMENT_REALIZATION_FAILURE — a selection was requested and compiled nothing, which is a delivery failure and NOT an uptake observation'
      : 'no session reported a selection that failed to compile',
    verdict: Object.freeze({
      SYSTEM_VALID: 'YES',
      EXPERIMENT_ENVIRONMENT_VALID: 'YES',
      TREATMENT_REALIZATION_VALID: 'NO',
      CAUSAL_EXPERIMENT_VALID: 'NO',
      CAPITAL_UPTAKE: 'NOT_EVALUABLE',
      RECONSTRUCTION_COMPRESSION: 'NOT_EVALUABLE',
      NET_COGNITIVE_COST: 'NOT_EVALUABLE',
    }),
  });
}

/** §11: the median of a numeric list. */
export function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * §11: EVALUATE THE RECONSTRUCTION-PRESSURE GATE.
 *
 * All three thresholds must hold. §11 also states that correctness at ceiling does NOT fail this gate, which is
 * why no correctness term appears here at all.
 */
export function evaluatePressureGate(sessions) {
  const total = sessions.length;
  const accessingOne = sessions.filter((session) => session.rawHistoryArtifactsRead >= 1).length;
  const accessingTwoCategories = sessions.filter((session) => session.distinctRawHistoryCategories >= 2).length;
  const medianArtifacts = median(sessions.map((session) => session.rawHistoryArtifactsRead));
  const conditions = Object.freeze([
    Object.freeze({ id: 'SESSIONS_ACCESSING_AT_LEAST_ONE', satisfied: accessingOne >= PRESSURE_GATE.sessionsAccessingAtLeastOneArtifact.required, detail: `${String(accessingOne)}/${String(total)} sessions accessed >=1 declared raw-history artifact (required ${String(PRESSURE_GATE.sessionsAccessingAtLeastOneArtifact.required)}/16)` }),
    Object.freeze({ id: 'MEDIAN_DISTINCT_ARTIFACTS', satisfied: medianArtifacts !== null && medianArtifacts >= PRESSURE_GATE.medianDistinctArtifacts.required, detail: `median distinct artifacts ${String(medianArtifacts)} (required >= ${String(PRESSURE_GATE.medianDistinctArtifacts.required)})` }),
    Object.freeze({ id: 'SESSIONS_ACCESSING_AT_LEAST_TWO_CATEGORIES', satisfied: accessingTwoCategories >= PRESSURE_GATE.sessionsAccessingAtLeastTwoCategories.required, detail: `${String(accessingTwoCategories)}/${String(total)} sessions accessed >=2 distinct categories (required ${String(PRESSURE_GATE.sessionsAccessingAtLeastTwoCategories.required)}/16)` }),
  ]);
  const failed = conditions.filter((condition) => !condition.satisfied).map((condition) => condition.id);
  return Object.freeze({
    kind: 'reconstruction pressure gate',
    RECONSTRUCTION_PRESSURE_PRESENT: failed.length === 0,
    conditions,
    failedConditions: Object.freeze(failed),
    sessions: total,
    accessingOne,
    accessingTwoCategories,
    medianArtifacts,
    totalArtifactsRead: sessions.reduce((total_, session) => total_ + session.rawHistoryArtifactsRead, 0),
    totalBytesReturned: sessions.reduce((total_, session) => total_ + session.rawHistoryBytesReturned, 0),
    declaredCorpusDocuments: declaredCorpusPaths().length,
    correctnessIsNotAnInput: true,
    /** §11: the consequence, carried so the report cannot soften it. */
    onRed: 'STOP — do not redesign the project inside this stage; return for adjudication',
    onGreen: 'continue automatically to the clean repair replication',
  });
}

/** §10: the calibration summary, deliberately NOT grouped by arm. */
export function calibrationSummary(sessions) {
  return Object.freeze({
    kind: 'no-treatment baseline calibration',
    grouping: 'NONE — §10 forbids comparing the H/C labels, because the C label describes an intent that was not realized',
    sessions: sessions.length,
    metrics: Object.freeze({
      rawHistoryArtifactsRead: Object.freeze({ min: Math.min(...sessions.map((s) => s.rawHistoryArtifactsRead)), median: median(sessions.map((s) => s.rawHistoryArtifactsRead)), max: Math.max(...sessions.map((s) => s.rawHistoryArtifactsRead)) }),
      distinctRawHistoryCategories: Object.freeze({ min: Math.min(...sessions.map((s) => s.distinctRawHistoryCategories)), median: median(sessions.map((s) => s.distinctRawHistoryCategories)), max: Math.max(...sessions.map((s) => s.distinctRawHistoryCategories)) }),
      rawHistoryBytesReturned: Object.freeze({ min: Math.min(...sessions.map((s) => s.rawHistoryBytesReturned)), median: median(sessions.map((s) => s.rawHistoryBytesReturned)), max: Math.max(...sessions.map((s) => s.rawHistoryBytesReturned)) }),
      actionsBeforeFirstResult: Object.freeze({ min: Math.min(...sessions.map((s) => s.actionsBeforeFirstResult)), median: median(sessions.map((s) => s.actionsBeforeFirstResult)), max: Math.max(...sessions.map((s) => s.actionsBeforeFirstResult)) }),
    }),
    completionCauses: Object.freeze(sessions.reduce((counts, session) => ({ ...counts, [session.completionCause]: (counts[session.completionCause] ?? 0) + 1 }), {})),
    sessionsReadingNoHistory: sessions.filter((session) => session.rawHistoryArtifactsRead === 0).map((session) => session.sessionId),
  });
}

export { NL };
