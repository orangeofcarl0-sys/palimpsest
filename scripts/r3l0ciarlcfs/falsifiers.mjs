/**
 * R3-L0C-I-A-R-L-C-F-S §2 — THE BASELINE CONTROL RUNNER.
 *
 * It runs the five controls from `baseline/legacy-controls.mjs` against the R3-L0C-I-A-R-L-C-F code at `8bf8d42` and
 * reports, per gap, whether the defect is present. The controls are the ones committed BEFORE the correction, so the
 * measurements are the frozen ones rather than anything adapted to the corrected implementation.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EVIDENCE_GAPS, NL } from './contract.mjs';
import {
  BASELINE_SOURCE,
  controlAuthorizationVerdictInconsistency,
  controlCrossArtifactPlanMismatch,
  controlFalseArtifactInterpretability,
  controlPartialTrialIdentity,
  controlUnsafeCleanupFallback,
} from './baseline/legacy-controls.mjs';

/** §2: run every control against the baseline and report the violations. */
export async function runCorrectionControls(input = {}) {
  const directory = input.base ?? mkdtempSync(join(tmpdir(), 'r3lcfs-controls-'));
  try {
    const a = await controlCrossArtifactPlanMismatch();
    const b = controlUnsafeCleanupFallback();
    const c = await controlPartialTrialIdentity();
    const d = await controlFalseArtifactInterpretability();
    const e = await controlAuthorizationVerdictInconsistency();
    const controls = Object.freeze([a, b, c, d, e].map((entry) => Object.freeze({ ...entry, PROPERTY_VIOLATED_BY_BASELINE: entry.defectPresent === true })));
    const violated = controls.filter((entry) => entry.PROPERTY_VIOLATED_BY_BASELINE === true);
    return Object.freeze({
      schemaVersion: 1,
      stage: 'R3-L0C-I-A-R-L-C-F-S',
      kind: 'evidence-seal and safety controls against the R3-L0C-I-A-R-L-C-F baseline',
      baseline: BASELINE_SOURCE.revision,
      source: BASELINE_SOURCE,
      controls,
      declared: EVIDENCE_GAPS.length,
      measuredProperties: controls.length,
      PROPERTIES_VIOLATED_BY_BASELINE: violated.length,
      ALL_DEFECTS_VIOLATED_BY_BASELINE: violated.length === controls.length && controls.length === EVIDENCE_GAPS.length,
      violated: Object.freeze(violated.map((entry) => entry.id)),
      notViolated: Object.freeze(controls.filter((entry) => entry.PROPERTY_VIOLATED_BY_BASELINE !== true).map((entry) => entry.id)),
      modelCallsMade: 0,
      law: 'each control CALLS the real 8bf8d42 function and reports its actual return value; the property is violated by the baseline',
    });
  } finally {
    if (input.base === undefined) { try { rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ } }
  }
}

export { NL };
