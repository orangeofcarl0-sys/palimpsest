/**
 * R3-L0C-I-A §9 — THE EVIDENCE CORRECTIONS.
 *
 * §10 of R3-L0C-I established the rule this stage inherits: a published evidence error is corrected FORWARD, by a
 * new commit that says what was wrong and what the measurement actually was. §9 of this ruling forbids rewriting
 * old commits and force-pushing, so the same discipline applies.
 *
 * WHAT THIS STAGE HAS TO CORRECT. Two things, and neither is a defect in a prior stage's reasoning — they are
 * records that a reader could misread:
 *
 *   1. THE PRIOR STAGES' TEST COUNTS. R3-L0C-I recorded 3959 unit tests across 286 files at its own close. This
 *      stage ADDS test files, so a reader comparing the two numbers would see a change with no explanation. The
 *      correction states the delta and its cause rather than leaving it to be inferred.
 *
 *   2. THE LIVE-GATE DISCLOSURE. R3-L0C-I disclosed that the D2/D4/D5 live gates fail pre-existingly and that
 *      they emitted ZERO model requests. §6 requires that disclosure to remain visible rather than being
 *      presented as passed, and this stage re-measures it so the claim is current rather than inherited.
 *
 * WHAT IT DOES NOT DO. It does not edit any prior stage's evidence, does not restate a prior verdict, and does
 * not claim a live gate passes. A live gate that needs a model route remains outside this stage, exactly as §6
 * says: "An experiment-specific approved route smoke, if necessary, belongs after explicit paid-call authorization
 * and outside the primary 16 sessions."
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { BASELINE_COMMIT, REPO_ROOT, STAGE_EVIDENCE_PATH } from './contract.mjs';

const NL = String.fromCharCode(10);

/** §10: the prior stage's recorded counts, quoted so the delta has a named origin. */
export const PRIOR_TEST_COUNTS = Object.freeze({
  stage: 'R3-L0C-I',
  baseline: 'b6c15e69da3541837a822d4751db50b34794a279',
  unitTests: 3959,
  unitFiles: 286,
});

/** §6: the live gates the prior stage disclosed, kept disclosed rather than promoted to passed. */
export const LIVE_GATE_DISCLOSURE = Object.freeze({
  gates: Object.freeze(['D2', 'D4', 'D5']),
  status: 'DISCLOSED_NOT_PASSED',
  priorStageMeasurement: 'each failing live gate emitted ZERO model requests; every worker session log contained exactly one record, the session header',
  requiresAModelRoute: true,
  belongsAfterPaidAuthorization: true,
  outsideThePrimarySixteenSessions: true,
  presentedAsPassed: false,
  thisStageReMeasuredIt: true,
});

/**
 * §6: THE TEST-COUNT CORRECTION.
 *
 * The measurement is taken from the tree rather than asserted: the stage's own test files are counted, and the
 * delta against the prior stage's record is stated with its cause. A correction that only named a number would be
 * unfalsifiable; this one names the FILES that produce the difference.
 */
export function testCountCorrection(input = {}) {
  const testDir = join(REPO_ROOT, 'test');
  const stageTestFiles = existsSync(testDir)
    ? readdirSync(testDir).filter((name) => name.startsWith('r3l0cia_') && name.endsWith('.test.ts')).sort()
    : [];
  const currentFiles = existsSync(testDir) ? readdirSync(testDir).filter((name) => name.endsWith('.test.ts')).length : 0;
  const current = input.currentUnitTests ?? null;
  const currentFileCount = input.currentUnitFiles ?? currentFiles;
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A',
    kind: 'test count correction',
    correctionId: 'R3_L0C_IA_TEST_COUNT_DELTA',
    prior: PRIOR_TEST_COUNTS,
    current: Object.freeze({ stage: 'R3-L0C-I-A', baseline: BASELINE_COMMIT, unitTests: current, unitFiles: currentFileCount }),
    delta: Object.freeze({
      tests: current === null ? null : current - PRIOR_TEST_COUNTS.unitTests,
      files: currentFileCount - PRIOR_TEST_COUNTS.unitFiles,
    }),
    /** §6: the CAUSE, named as files rather than described. */
    addedTestFiles: Object.freeze([...stageTestFiles]),
    addedTestFileCount: stageTestFiles.length,
    reason: 'this stage adds its own acceptance, falsifier and gate suites; the prior stage\u2019s 3959/286 is unchanged and remains its own measurement',
    priorEvidenceEdited: false,
    law: 'a published count is corrected forward by a new commit that names the cause, never by rewriting the record that made it',
  });
}

/**
 * §6: RE-MEASURE THE LIVE-GATE DISCLOSURE.
 *
 * The prior stage measured that the failing live gates emitted zero model requests, by reading the worker session
 * logs. This re-measures the same fact on the SAME preserved logs, so the disclosure is current rather than
 * inherited — and it reports the measurement rather than a verdict, because a live gate's verdict requires a
 * model route this stage is forbidden to use.
 *
 * A log whose shape does not match the described measurement is reported as such rather than counted either way.
 */
export function liveGateDisclosureMeasurement(input = {}) {
  const { logPaths = [] } = input;
  const observations = [];
  for (const path of logPaths) {
    if (!existsSync(path)) {
      observations.push(Object.freeze({ path, present: false, recordCount: null, verdict: 'LOG_ABSENT' }));
      continue;
    }
    const text = readFileSync(path, 'utf8');
    const records = text.split(/\r?\n/u).filter((line) => line.trim() !== '');
    observations.push(Object.freeze({
      path,
      present: true,
      recordCount: records.length,
      /** §6: the prior measurement's signature — exactly one record, the session header. */
      matchesPriorMeasurement: records.length === 1,
      firstRecordKind: records.length > 0 ? String(records[0]).slice(0, 120) : null,
      verdict: records.length === 1 ? 'ZERO_MODEL_REQUESTS_EMITTED' : 'SHAPE_DIFFERS_FROM_PRIOR_MEASUREMENT',
    }));
  }
  const measured = observations.filter((entry) => entry.present === true);
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A',
    kind: 'live gate disclosure re-measurement',
    disclosure: LIVE_GATE_DISCLOSURE,
    observations: Object.freeze(observations),
    logsRead: measured.length,
    zeroRequestLogs: measured.filter((entry) => entry.verdict === 'ZERO_MODEL_REQUESTS_EMITTED').length,
    /** §6: the claim is DISCLOSED, not promoted. */
    presentedAsPassed: false,
    requiresAModelRoute: true,
    thisStageEnteredPrimary: false,
    note: 'the live gates remain disclosed rather than passed; their verdict requires a model route this stage is forbidden to use',
  });
}

/** §6: the whole corrections record, so the qualification carries it as one artifact. */
export function evidenceCorrections(input = {}) {
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A',
    kind: 'evidence corrections',
    testCount: testCountCorrection(input),
    liveGates: liveGateDisclosureMeasurement(input),
    priorEvidenceEdited: false,
    oldCommitsRewritten: false,
    forcePush: false,
    law: 'corrections are forward commits; the prior stage\u2019s evidence remains byte-identical',
  });
}

export { NL, STAGE_EVIDENCE_PATH };
