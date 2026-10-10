/**
 * R3-L0C-I-A-R-L-C-F §2 — THE BASELINE CONTROL RUNNER.
 *
 * It runs the five controls from `baseline/legacy-controls.mjs` against the R3-L0C-I-A-R-L-C code at `c8cd220` and
 * reports, per gap, whether the defect is present. The controls are the ones committed BEFORE the correction, so the
 * measurements are the frozen ones rather than anything adapted to the corrected implementation.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MEASUREMENT_GAPS, NL } from './contract.mjs';
import {
  BASELINE_SOURCE,
  controlCapturedNotFresh,
  controlDividedIdentities,
  controlPartialPlanAndBudget,
  controlUnboundCompilerCache,
  controlUnverifiedLivePrimary,
} from './baseline/legacy-controls.mjs';

/**
 * §2: run every control against the baseline and report the violations.
 *
 * `common` supplies the inputs F1's control needs (a real prehistory, closure, containment and plan), because F1's
 * defect is a property of the real pipeline's default branch and cannot be measured by a helper alone.
 */
export async function runCorrectionControls(input = {}) {
  const directory = input.base ?? mkdtempSync(join(tmpdir(), 'r3lcf-controls-'));
  try {
    const a = await controlCapturedNotFresh({ base: directory, common: input.common });
    const b = await controlUnverifiedLivePrimary({});
    const c = await controlDividedIdentities();
    const d = await controlPartialPlanAndBudget();
    const e = await controlUnboundCompilerCache();
    const controls = Object.freeze([a, b, c, d, e].map((entry) => Object.freeze({ ...entry, PROPERTY_VIOLATED_BY_BASELINE: entry.defectPresent === true })));
    const violated = controls.filter((entry) => entry.PROPERTY_VIOLATED_BY_BASELINE === true);
    return Object.freeze({
      schemaVersion: 1,
      stage: 'R3-L0C-I-A-R-L-C-F',
      kind: 'measurement-fidelity controls against the R3-L0C-I-A-R-L-C baseline',
      baseline: BASELINE_SOURCE.revision,
      source: BASELINE_SOURCE,
      controls,
      declared: MEASUREMENT_GAPS.length,
      measuredProperties: controls.length,
      PROPERTIES_VIOLATED_BY_BASELINE: violated.length,
      ALL_DEFECTS_VIOLATED_BY_BASELINE: violated.length === controls.length && controls.length === MEASUREMENT_GAPS.length,
      violated: Object.freeze(violated.map((entry) => entry.id)),
      notViolated: Object.freeze(controls.filter((entry) => entry.PROPERTY_VIOLATED_BY_BASELINE !== true).map((entry) => entry.id)),
      modelCallsMade: 0,
      law: 'each control CALLS the real c8cd220 function and reports its actual return value; the property is violated by the baseline',
    });
  } finally {
    if (input.base === undefined) { try { rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ } }
  }
}

export { NL };
