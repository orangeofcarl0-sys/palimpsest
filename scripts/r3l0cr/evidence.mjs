#!/usr/bin/env node
/**
 * R3-L0C-R §1/§10/§11/§19 — THE RUN-1 ERRATUM AND BASELINE EVIDENCE.
 *
 * §1 requires the corrected verdicts to be APPENDED while the historical protocol report stays preserved, and it
 * freezes `R3-L0C RUN-1 = TREATMENT_NOT_APPLIED`. §10 requires the 16 sessions to be analysed as no-treatment
 * baseline observations only. §11 requires the pressure gate.
 *
 * THE ERRATUM IS APPEND-ONLY, and that is a requirement rather than a style choice: §19 keeps the prior R3-L0C
 * evidence immutable, and §1 says the historical protocol report remains preserved. So this program WRITES TO ITS
 * OWN STAGE PATH and never rewrites the source stage's records — it reads them and states the correction.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT, STAGE_EVIDENCE_PATH, SOURCE_STAGE_EVIDENCE_PATH, VALIDITY_DIMENSIONS, TELEMETRY_READING_RULE, SELECTION_CONTRACT_FINDING } from './contract.mjs';
import { calibrationSummary, calibrateRun, evaluatePressureGate, proveEmptyCapitalSurface } from './baseline.mjs';

const NL = String.fromCharCode(10);
const EVIDENCE = join(REPO_ROOT, STAGE_EVIDENCE_PATH);
const SOURCE = join(REPO_ROOT, SOURCE_STAGE_EVIDENCE_PATH);
const out = (line) => process.stdout.write(`${line}${NL}`);

/**
 * §1: THE RUN-1 ERRATUM.
 *
 * The corrected verdicts are stated alongside the preserved ones, so a reader sees BOTH: what the original report
 * said, and what the corrected reading is. The original is not deleted.
 */
export function runOneErratum(input) {
  const { proof, gate, calibration, sourceStageResult, sourceDeviation } = input;
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-R',
    kind: 'Run-1 validity erratum (append-only)',
    /** §1: the frozen status. */
    RUN_1_STATUS: 'TREATMENT_NOT_APPLIED',
    /** §1: what the eight intended C sessions ARE. */
    cSessionsAre: 'TREATMENT-REALIZATION FAILURES, not failed capital-uptake observations',
    cSessionsAreNot: 'they are not observations that capital was not consumed',

    /** §1: the corrected verdicts, appended. */
    correctedVerdicts: Object.freeze({
      SYSTEM_VALID: 'YES',
      EXPERIMENT_ENVIRONMENT_VALID: 'YES',
      TREATMENT_REALIZATION_VALID: 'NO',
      CAUSAL_EXPERIMENT_VALID: 'NO',
      CAPITAL_UPTAKE: 'NOT_EVALUABLE',
      RECONSTRUCTION_COMPRESSION: 'NOT_EVALUABLE',
      NET_COGNITIVE_COST: 'NOT_EVALUABLE',
    }),

    /** §1: the historical report is preserved, and this record names where it lives. */
    preservedHistoricalReport: Object.freeze({
      path: `${SOURCE_STAGE_EVIDENCE_PATH}/stage-result.json`,
      preserved: true,
      rewritten: false,
      originalVerdicts: sourceStageResult === null ? null : sourceStageResult.verdicts,
      originalDeviation: sourceDeviation === null ? null : sourceDeviation.deviation.id,
      /** The correction, stated as a supersession rather than a deletion. */
      supersession: 'the original verdicts are SUPERSEDED IN INTERPRETATION, not deleted: CAPITAL_UPTAKE read ABSENT and the two treatment verdicts read NOT_REPORTED, which the corrected semantics rename as NOT_EVALUABLE and the realization failure explains',
    }),

    /** §1/§2: WHY the correction is needed, with the mechanical proof. */
    basis: Object.freeze({
      emptyCapitalSurfaceProven: proof.emptyForEverySession,
      sessionsWithCompiledHandles: proof.sessionsWithCompiledHandles,
      cSelectionRequestedButNotCompiled: proof.cSelectionRequestedButNotCompiled,
      reading: proof.reading,
      telemetryRule: TELEMETRY_READING_RULE.rule,
    }),

    /** §2: the dimension that failed, named. */
    failedDimension: 'TREATMENT_REALIZATION_VALID',
    validityDimensions: VALIDITY_DIMENSIONS.map((entry) => entry.id),

    /** §4: the root cause and the case determination. */
    rootCause: Object.freeze({
      case: SELECTION_CONTRACT_FINDING.case,
      boundary: SELECTION_CONTRACT_FINDING.boundary,
      escapedShape: '{ handles: [...] }',
      supportedShape: 'the owner-kind structure: proof / reasoning / procedure',
      mechanism: 'the product ignored the unknown key, so a non-empty malformed request was indistinguishable from no selection',
      productChangeMade: SELECTION_CONTRACT_FINDING.productChangeMade,
    }),

    /** §10/§11: the baseline calibration and the pressure gate. */
    baselineCalibration: calibration,
    pressureGate: gate,
  });
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });
  out('=== R3-L0C-R Run-1 erratum and baseline calibration ===');

  /** §1/§19: read the source stage's records WITHOUT modifying them. */
  const sourceStageResult = existsSync(join(SOURCE, 'stage-result.json')) ? JSON.parse(readFileSync(join(SOURCE, 'stage-result.json'), 'utf8')) : null;
  const sourceDeviation = existsSync(join(SOURCE, 'protocol-deviation.json')) ? JSON.parse(readFileSync(join(SOURCE, 'protocol-deviation.json'), 'utf8')) : null;
  const matrix = existsSync(join(SOURCE, 'matrix.json')) ? JSON.parse(readFileSync(join(SOURCE, 'matrix.json'), 'utf8')) : null;
  if (matrix === null) throw new Error('the source stage matrix is absent, so the calibration cannot run');

  /** §10: prove the capital surface was empty before reporting any metric. */
  const proof = proveEmptyCapitalSurface(matrix);
  out(`  empty capital surface for every session: ${String(proof.emptyForEverySession)} (${String(proof.sessionsWithCompiledHandles)} with handles, ${String(proof.cSelectionRequestedButNotCompiled)} requested-but-not-compiled)`);
  if (proof.emptyForEverySession !== true) throw new Error('the capital surface was NOT empty for every session, so the Run-1 calibration is not a no-treatment baseline');

  /** §10: calibrate the 16 sessions. */
  const sessions = calibrateRun(matrix.runRoot, matrix);
  const calibration = calibrationSummary(sessions);
  out(`  calibrated ${String(sessions.length)} sessions`);
  for (const [name, stats] of Object.entries(calibration.metrics)) out(`    ${name.padEnd(28)} min=${String(stats.min)} median=${String(stats.median)} max=${String(stats.max)}`);

  /** §11: the pressure gate. */
  const gate = evaluatePressureGate(sessions);
  out(`${NL}  RECONSTRUCTION_PRESSURE_PRESENT: ${String(gate.RECONSTRUCTION_PRESSURE_PRESENT)}`);
  for (const condition of gate.conditions) out(`    ${condition.satisfied ? 'PASS' : 'FAIL'} ${condition.id} — ${condition.detail}`);

  const erratum = runOneErratum({ proof, gate, calibration, sourceStageResult, sourceDeviation });
  writeFileSync(join(EVIDENCE, 'run-1-erratum.json'), `${JSON.stringify(erratum, null, 2)}${NL}`, 'utf8');
  writeFileSync(join(EVIDENCE, 'baseline-calibration.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'R3-L0C-R', kind: 'Run-1 no-treatment baseline calibration', grouping: 'NONE', sessions, summary: calibration, gate, proof }, null, 2)}${NL}`, 'utf8');
  out(`${NL}wrote ${STAGE_EVIDENCE_PATH}/run-1-erratum.json, baseline-calibration.json`);
  return { erratum, calibration, gate, proof };
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}

export { main };
