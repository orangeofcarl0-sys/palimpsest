#!/usr/bin/env node
/**
 * R2-VR §1/§3/§4/§5/§7 — THE CORRECTED FACTORIAL REANALYSIS.
 *
 * This script reads the PRESERVED R2-V normalized results, computes the factorial contrasts, and writes the
 * corrected analysis BESIDE the original. It modifies no R2-V record (§2): the original predeclared
 * classification remains historical protocol output.
 *
 * WHAT WAS WRONG. R2-V's per-bundle "consensus" treated `V3 vs V0` as the marginal effect of B and of C.
 * `V3 vs V0` is the effect of the COMBINED treatment. A factor's marginal effect is the mean of its two
 * CONDITIONAL contrasts, and those two contrasts can disagree — which is exactly what the data does.
 *
 * §14: no p-values, no significance claims. Raw counts and rates at n = 5 per cell.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CALIBRATION_STATUSES, OUTCOME_DIMENSIONS, correctedCalibrationStatus, describeFactor, factorialContrasts } from './factorial.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const EVIDENCE = join(REPO_ROOT, 'research-evidence', 'r2-vr');
const NL = String.fromCharCode(10);

/** §2: the preserved inputs. Read-only. */
export function loadR2VRaw(root = REPO_ROOT) {
  const path = join(root, 'research-evidence', 'r2-v', 'normalized-results.json');
  if (!existsSync(path)) throw new Error(`the preserved R2-V normalized results are required at ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Group the preserved trials by arm, so a contrast never silently mixes arms. */
export function trialsByArm(raw) {
  const byArm = {};
  for (const trial of raw.trials ?? []) {
    if (!byArm[trial.condition]) byArm[trial.condition] = [];
    byArm[trial.condition].push(trial);
  }
  return byArm;
}

/**
 * §3/§4: the full corrected analysis. Every conditional contrast is preserved, so the result can express
 * "positive in one context, negative in another" rather than collapsing to a single label.
 */
export function correctedAnalysis(raw) {
  const byArm = trialsByArm(raw);
  const contrasts = {};
  for (const dimension of OUTCOME_DIMENSIONS) contrasts[dimension] = factorialContrasts(byArm, dimension);

  const primary = contrasts.finalAcceptanceSolved;
  const factors = Object.freeze({ B: describeFactor(primary, 'B'), C: describeFactor(primary, 'C') });

  /**
   * §6/§7: SATURATION. A dimension is saturated when every arm sits at the same extreme, leaving the
   * contrast no room to move. `knownFailureRecurred` is saturated at the FLOOR (0/5 everywhere) and
   * `finalAcceptanceSolved` is near the CEILING (3/5–4/5, with all variance from one case).
   */
  const saturatedDimensions = OUTCOME_DIMENSIONS.filter((dimension) => {
    const rates = Object.values(contrasts[dimension].cells).map((cell) => cell.rate);
    return Math.min(...rates) === Math.max(...rates);
  });

  return Object.freeze({
    schemaVersion: 1,
    stage: 'R2-VR',
    kind: 'corrected factorial reanalysis (append-only; the original R2-V analysis is preserved)',
    estimandCorrection: 'V3 vs V0 is the COMBINED treatment effect, not the marginal effect of B or C. Marginal effects are the mean of the two conditional contrasts.',
    sourceTrials: (raw.trials ?? []).length,
    cells: Object.freeze({ V0: 'B absent, C absent', V1: 'B present, C absent', V2: 'B absent, C present', V3: 'B present, C present' }),
    contrasts,
    factors,
    interactions: OUTCOME_DIMENSIONS.map((dimension) => ({ dimension, value: contrasts[dimension].interaction, label: contrasts[dimension].interactionLabel })).filter((entry) => entry.value !== 0),
    saturatedDimensions: Object.freeze(saturatedDimensions),
    noStatistics: 'n = 5 per cell. Raw counts and rates only; no p-values and no significance claims.',
  });
}

/**
 * §7: the corrected calibration status, combining the factorial reading with the §6 outcome audit.
 *
 * @param {any} analysis the corrected analysis
 * @param {any} audit the outcome-sensitivity audit (may be absent)
 */
export function correctedCalibration(analysis, audit) {
  const stableFactors = Object.entries(analysis.factors).filter(([, factor]) => factor.stableMarginalSignal).map(([name]) => name);
  const status = correctedCalibrationStatus({
    interactions: analysis.interactions.length,
    saturatedDimensions: analysis.saturatedDimensions,
    factorsWithStableSignal: stableFactors,
    outcomeMismatch: audit?.outcomeMismatch === true,
  });
  return Object.freeze({
    status,
    retiredInference: 'R2-S calibration: CONSISTENT — skipped bundles showed no positive utility signal',
    reasons: Object.freeze([
      audit?.outcomeMismatch === true ? 'UTILITY_ASSAY_OUTCOME_MISMATCH: the only varying hidden case is addressed by the D bundle, which is present in every arm, so the assay\'s outcome variation cannot be attributed to the added capital' : null,
      analysis.saturatedDimensions.length > 0 ? `saturated outcome dimension(s): ${analysis.saturatedDimensions.join(', ')}` : null,
      analysis.interactions.length > 0 ? `non-zero descriptive interaction(s) on: ${analysis.interactions.map((entry) => entry.dimension).join(', ')} — labelled DESCRIPTIVE_INTERACTION_PATTERN only (§5)` : null,
      stableFactors.length === 0 ? 'no factor shows a stable marginal signal in both contexts' : `stable marginal signal for: ${stableFactors.join(', ')}`,
    ].filter((entry) => entry !== null)),
    allowedStatuses: Object.values(CALIBRATION_STATUSES),
    note: '§7: INCONCLUSIVE is a fully valid result, and is the honest one when the outcome measure cannot carry the question.',
  });
}

async function main() {
  const raw = loadR2VRaw();
  const analysis = correctedAnalysis(raw);
  const auditPath = join(EVIDENCE, 'outcome-audit.json');
  const audit = existsSync(auditPath) ? JSON.parse(readFileSync(auditPath, 'utf8')) : null;
  const calibration = correctedCalibration(analysis, audit);

  const output = Object.freeze({ ...analysis, calibration, outcomeAuditRuling: audit?.ruling ?? 'ABSENT' });

  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(join(EVIDENCE, 'factorial-analysis.json'), `${JSON.stringify(output, null, 2)}${NL}`, 'utf8');

  process.stdout.write(`R2-VR FACTORIAL REANALYSIS — ${String(analysis.sourceTrials)} preserved trials${NL}`);
  for (const dimension of OUTCOME_DIMENSIONS) {
    const contrast = analysis.contrasts[dimension];
    process.stdout.write(`${NL}${dimension}${NL}`);
    process.stdout.write(`  cells: V0 ${contrast.cells.V0.raw}  V1 ${contrast.cells.V1.raw}  V2 ${contrast.cells.V2.raw}  V3 ${contrast.cells.V3.raw}${NL}`);
    process.stdout.write(`  B|C absent ${fmt(contrast.conditional.bGivenCAbsent.value)}   B|C present ${fmt(contrast.conditional.bGivenCPresent.value)}   B main ${fmt(contrast.bMainEffect)}${NL}`);
    process.stdout.write(`  C|B absent ${fmt(contrast.conditional.cGivenBAbsent.value)}   C|B present ${fmt(contrast.conditional.cGivenBPresent.value)}   C main ${fmt(contrast.cMainEffect)}${NL}`);
    process.stdout.write(`  B×C interaction ${fmt(contrast.interaction)}${contrast.interactionLabel === null ? '' : ` (${contrast.interactionLabel})`}${NL}`);
  }
  process.stdout.write(`${NL}factors: B ${analysis.factors.B.shape} | C ${analysis.factors.C.shape}${NL}`);
  process.stdout.write(`saturated dimensions: ${analysis.saturatedDimensions.length === 0 ? '(none)' : analysis.saturatedDimensions.join(', ')}${NL}`);
  process.stdout.write(`corrected calibration: ${calibration.status}${NL}`);
  process.stdout.write(`record: ${join(EVIDENCE, 'factorial-analysis.json')}${NL}`);
}

function fmt(value) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}`;
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}
