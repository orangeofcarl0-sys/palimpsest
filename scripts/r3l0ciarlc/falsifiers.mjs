/**
 * R3-L0C-I-A-R-L-C §2 — THE BASELINE CONTROL RUNNER.
 *
 * It runs the four controls from `baseline/legacy-controls.mjs` against the R3-L0C-I-A-R-L code at `6089947` and
 * reports, per gate, whether the defect is present. The controls are the ones committed BEFORE the correction, so
 * the measurements are the frozen ones rather than anything adapted to the corrected implementation.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CORRECTION_GATES, NL, REPO_ROOT } from './contract.mjs';
import {
  BASELINE_SOURCE,
  controlAttestationOutsideGate,
  controlDurableCostDisconnection,
  controlPostflightOutsideAdmission,
  controlWeakAuthorizationTrust,
} from './baseline/legacy-controls.mjs';

/** §2: run every control against the baseline and report the violations. */
export async function runCorrectionControls() {
  const directory = mkdtempSync(join(tmpdir(), 'r3l0ciarlc-controls-'));
  try {
    const pipelineSource = readFileSync(join(REPO_ROOT, 'scripts', 'r3l0ciarl', 'pipeline.mjs'), 'utf8');
    const a = await controlDurableCostDisconnection({ directory });
    const b = controlPostflightOutsideAdmission({ source: pipelineSource });
    const c = await controlWeakAuthorizationTrust();
    const d = await controlAttestationOutsideGate({ source: pipelineSource });
    const controls = Object.freeze([a, b, c, d].map((entry) => Object.freeze({ ...entry, PROPERTY_VIOLATED_BY_BASELINE: entry.defectPresent === true })));
    const violated = controls.filter((entry) => entry.PROPERTY_VIOLATED_BY_BASELINE === true);
    return Object.freeze({
      schemaVersion: 1,
      stage: 'R3-L0C-I-A-R-L-C',
      kind: 'admission-closure controls against the R3-L0C-I-A-R-L baseline',
      baseline: BASELINE_SOURCE.revision,
      source: BASELINE_SOURCE,
      controls,
      declared: CORRECTION_GATES.length,
      measuredProperties: controls.length,
      PROPERTIES_VIOLATED_BY_BASELINE: violated.length,
      ALL_DEFECTS_VIOLATED_BY_BASELINE: violated.length === controls.length && controls.length === CORRECTION_GATES.length,
      violated: Object.freeze(violated.map((entry) => entry.id)),
      notViolated: Object.freeze(controls.filter((entry) => entry.PROPERTY_VIOLATED_BY_BASELINE !== true).map((entry) => entry.id)),
      modelCallsMade: 0,
      law: 'each control names a property the corrected implementation must satisfy; against 6089947 the property is violated',
    });
  } finally {
    try { rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
  }
}

export { NL };
