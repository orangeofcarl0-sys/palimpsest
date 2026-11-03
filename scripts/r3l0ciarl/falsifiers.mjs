/**
 * R3-L0C-I-A-R-L §1-§4 — THE BASELINE CONTROL RUNNER.
 *
 * It runs the five controls from `baseline/legacy-controls.mjs` against the R3-L0C-I-A-R code at `36ada58` and
 * reports, per gate, whether the defect is present. The controls are the ones committed BEFORE the repair, so the
 * measurements are the frozen ones rather than anything adapted to the repaired implementation.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CORRECTION_GATES, NL, PRIMARY_DERIVED_INPUTS, REPO_ROOT } from './contract.mjs';
import {
  BASELINE_SOURCE,
  controlAuthorityVerification,
  controlLiveEvidenceContinuity,
  controlPostflightFreshness,
  controlPrimaryInputBinding,
  controlRuntimeAttestation,
} from './baseline/legacy-controls.mjs';

/** §1: run every control against the baseline and report the violations. */
export async function runCorrectionControls(input) {
  const { schedule, dshHomePath } = input;
  const directory = mkdtempSync(join(tmpdir(), 'r3l0ciarl-controls-'));
  try {
    const l1 = await controlLiveEvidenceContinuity({ directory });
    /**
     * L2 needs a preflight/postflight digest pair. The values are the ACTUAL digests of the prior stage's pipeline
     * source read twice with a byte appended in between, so the "mutation" is a real difference in the bytes the
     * gate would have compared.
     */
    const pipelineSource = readFileSync(join(REPO_ROOT, 'scripts', 'r3l0ciar', 'pipeline.mjs'), 'utf8');
    const { createHash } = await import('node:crypto');
    const preflightDigest = createHash('sha256').update(pipelineSource, 'utf8').digest('hex');
    const postflightDigest = createHash('sha256').update(`${pipelineSource}${NL}// post-preflight mutation`, 'utf8').digest('hex');
    const l2 = controlPostflightFreshness({
      preflightClosureDigest: preflightDigest,
      postflightClosureDigest: postflightDigest,
      callerReplacements: 0,
      callerRetries: 0,
      journalLaunches: schedule.length,
    });
    const l3 = controlPrimaryInputBinding({ source: pipelineSource, PRIMARY_DERIVED_INPUTS });
    const l3b = await controlAuthorityVerification();
    const l4 = controlRuntimeAttestation({ dshHomePath });

    const controls = Object.freeze([
      withViolation(l1, l1.defectPresent === true),
      withViolation(l2, l2.defectPresent === true),
      withViolation(l3, l3.defectPresent === true),
      withViolation({ ...l3b, id: 'L3_AUTHORITY_VERIFICATION' }, l3b.defectPresent === true),
      withViolation(l4, l4.defectPresent === true),
    ]);
    const violated = controls.filter((entry) => entry.PROPERTY_VIOLATED_BY_BASELINE === true);
    return Object.freeze({
      schemaVersion: 1,
      stage: 'R3-L0C-I-A-R-L',
      kind: 'live measurement controls against the R3-L0C-I-A-R baseline',
      baseline: BASELINE_SOURCE.revision,
      source: BASELINE_SOURCE,
      controls,
      declared: CORRECTION_GATES.length,
      measuredProperties: controls.length,
      PROPERTIES_VIOLATED_BY_BASELINE: violated.length,
      ALL_DEFECTS_VIOLATED_BY_BASELINE: violated.length === controls.length,
      violated: Object.freeze(violated.map((entry) => entry.id)),
      notViolated: Object.freeze(controls.filter((entry) => entry.PROPERTY_VIOLATED_BY_BASELINE !== true).map((entry) => entry.id)),
      modelCallsMade: 0,
      law: 'each control names a property the repaired implementation must satisfy; against 36ada58 the property is violated',
    });
  } finally {
    try { rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
  }
}

/** Attach the violation verdict, so every entry has the same shape. */
function withViolation(entry, violated) {
  return Object.freeze({ ...entry, PROPERTY_VIOLATED_BY_BASELINE: violated === true });
}

export { NL };
