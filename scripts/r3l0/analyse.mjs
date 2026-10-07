#!/usr/bin/env node
/**
 * R3-L0 §18/§19/§20/§21/§23/§24 — THE TRAJECTORY ANALYSIS.
 *
 * §18: per trajectory, cumulative PERR, the number of prepaid errors repeated at least once, and the terminal
 * prepaid-error count, compared C versus H by MATCHED BLOCK. §18 says explicitly: do not use full solve as the
 * primary verdict.
 *
 * §19: secondary quality outcomes recorded per generation and trajectory, NOT collapsed into one score.
 * §20: cognitive-cost outcomes, with no invented monetary cost.
 * §21: capital-use outcomes for C.
 * §23/§24: the uptake and utility verdicts, computed against the FROZEN rules.
 *
 * §24: no p-values at n=4. Cost is reported separately and does not silently override the PERR verdict.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { DIAGNOSTIC_CLASSES, PREPAID_EXPOSURES, eligiblePrepaidExposures, trajectoryEligibleExposures } from './project.mjs';
import { perrOf } from './capital.mjs';
import { CAPITAL_STATES, trajectoryConsumption } from './witness.mjs';
import { REPO_ROOT, STAGE_EVIDENCE_PATH, compareHistoricalEvidence, digestHistoricalEvidence, runLoadBearingSystemGates, systemValidFrom } from './envelope.mjs';
import { UPTAKE_VERDICT_RULES, UTILITY_VERDICT_RULES } from './plan.mjs';

const NL = String.fromCharCode(10);
const sha256 = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');
const out = (line) => process.stdout.write(`${line}${NL}`);

/** §11/§18: the trajectory-level PERR, from the frozen mapping and the diagnostic vectors. */
function trajectoryPerr(generations) {
  const vectors = {};
  for (const generation of generations) {
    vectors[generation.generation] = {
      classPass: generation.diagnostic?.classPass ?? {},
      failedClasses: generation.diagnostic?.failedClasses ?? [],
    };
  }
  const perr = perrOf(vectors, PREPAID_EXPOSURES);
  /** §18: how many DISTINCT prepaid classes were repeated at least once. */
  const repeatedClasses = new Set();
  for (const [generation, vector] of Object.entries(vectors)) {
    for (const classId of eligiblePrepaidExposures(generation)) {
      if (vector.classPass[classId] === false) repeatedClasses.add(classId);
    }
  }
  const terminal = generations[generations.length - 1];
  const terminalRepeated = eligiblePrepaidExposures(terminal?.generation ?? 'G3').filter((classId) => terminal?.diagnostic?.classPass?.[classId] === false);
  return Object.freeze({
    PERR: perr.PERR,
    repeatedPrepaidFailures: perr.repeatedPrepaidFailures,
    eligiblePrepaidExposures: perr.eligiblePrepaidExposures,
    detail: perr.detail,
    repeatedPrepaidClasses: Object.freeze([...repeatedClasses].sort()),
    repeatedPrepaidClassCount: repeatedClasses.size,
    terminalPrepaidErrors: Object.freeze(terminalRepeated),
    terminalPrepaidErrorCount: terminalRepeated.length,
  });
}

/** §19: terminal diagnostic quality — coverage plus the class vector, never one score. */
function terminalQuality(trajectory) {
  const terminal = trajectory.generations[trajectory.generations.length - 1];
  const vector = terminal?.diagnostic;
  return Object.freeze({
    generation: terminal?.generation ?? null,
    coverage: vector?.coverage ?? null,
    classPass: Object.freeze(vector?.classPass ?? {}),
    failedClasses: Object.freeze(vector?.failedClasses ?? []),
    visibleOraclePasses: terminal?.visibleOracle?.ok === true,
    promoted: terminal?.promoted === true,
    projectRevision: terminal?.projectRevision ?? null,
  });
}

/** §20: the cost accounting, kept conceptually separate and never invented. */
function trajectoryCost(trajectory) {
  const generations = trajectory.generations;
  const pullCalls = generations.reduce((total, entry) => total + (entry.governedPulls ?? []).length, 0);
  const bodyBytes = generations.reduce((total, entry) => total + (entry.governedPulls ?? []).reduce((sum, pull) => sum + (pull.bodyBytes ?? 0), 0), 0);
  const elapsedMs = generations.reduce((total, entry) => total + (entry.elapsedMs ?? 0), 0);
  return Object.freeze({
    sessions: generations.length,
    contextPullCalls: pullCalls,
    bodyBytesDelivered: bodyBytes,
    elapsedMs,
    transcriptBytes: generations.reduce((total, entry) => total + (entry.transcriptBytes ?? 0), 0),
    /** §20: no monetary cost is recorded, because the route reports tokens and no price. */
    providerReportedUsd: null,
    costNote: 'token counts are read from the durable session artifact by the generation harness; no monetary cost is recorded because the route declares no price',
  });
}

/** §21: the capital-use outcomes for a C trajectory. */
function capitalUse(trajectory) {
  const witnesses = trajectory.witnesses;
  const consumption = trajectoryConsumption(witnesses);
  const firstReuse = witnesses.find((witness) => witness.consumptionEvent === true)?.generation ?? null;
  return Object.freeze({
    states: Object.freeze(witnesses.map((witness) => ({ generation: witness.generation, state: witness.capitalState }))),
    handlesVisible: Object.freeze(witnesses.flatMap((witness) => witness.consumerVisibleHandles ?? [])),
    handlesPulled: Object.freeze(witnesses.filter((witness) => witness.governedPullInvoked === true).map((witness) => witness.generation)),
    consumptionEvents: consumption.consumptionEvents,
    generationOfFirstReuse: firstReuse,
    repeatedReuseAcrossGenerations: consumption.consumptionEvents > 1,
    exposedWithoutConsumption: consumption.exposedWithoutConsumption,
  });
}

/** §18/§24: the matched-block comparison. */
function pairedBlocks(trajectories) {
  const blocks = [];
  const blockIds = [...new Set(trajectories.map((entry) => entry.block))].sort((left, right) => left - right);
  for (const block of blockIds) {
    const h = trajectories.find((entry) => entry.block === block && entry.arm === 'H');
    const c = trajectories.find((entry) => entry.block === block && entry.arm === 'C');
    if (h === undefined || c === undefined) continue;
    const hPerr = trajectoryPerr(h.generations);
    const cPerr = trajectoryPerr(c.generations);
    const hQuality = terminalQuality(h);
    const cQuality = terminalQuality(c);
    blocks.push(Object.freeze({
      block,
      H: Object.freeze({ PERR: hPerr.PERR, repeated: hPerr.repeatedPrepaidFailures, eligible: hPerr.eligiblePrepaidExposures, repeatedClasses: hPerr.repeatedPrepaidClassCount, terminalCoverage: hQuality.coverage, terminalFailed: hQuality.failedClasses }),
      C: Object.freeze({ PERR: cPerr.PERR, repeated: cPerr.repeatedPrepaidFailures, eligible: cPerr.eligiblePrepaidExposures, repeatedClasses: cPerr.repeatedPrepaidClassCount, terminalCoverage: cQuality.coverage, terminalFailed: cQuality.failedClasses }),
      /** §24: the paired directional comparisons. */
      perrFavoursC: cPerr.PERR !== null && hPerr.PERR !== null && cPerr.PERR < hPerr.PERR,
      perrFavoursH: cPerr.PERR !== null && hPerr.PERR !== null && cPerr.PERR > hPerr.PERR,
      qualityNotWorse: cQuality.coverage !== null && hQuality.coverage !== null && cQuality.coverage >= hQuality.coverage,
    }));
  }
  return Object.freeze(blocks);
}

/**
 * §24: THE TRAJECTORY UTILITY VERDICT, computed against the FROZEN rules.
 *
 * The rules are read from the plan rather than restated, so the verdict cannot drift from what was preregistered.
 */
function utilityVerdict(blocks, trajectories) {
  const rules = UTILITY_VERDICT_RULES;
  const cTrajectories = trajectories.filter((entry) => entry.arm === 'C');
  const everyCConsumes = cTrajectories.length > 0 && cTrajectories.every((entry) => trajectoryConsumption(entry.witnesses).consumes === true);
  const perrFavoursC = blocks.filter((entry) => entry.perrFavoursC).length;
  const perrFavoursH = blocks.filter((entry) => entry.perrFavoursH).length;
  const qualityNotWorse = blocks.filter((entry) => entry.qualityNotWorse).length;

  const positive = perrFavoursC >= rules.POSITIVE_SIGNAL.perrBlocksRequired
    && qualityNotWorse >= rules.POSITIVE_SIGNAL.qualityBlocksRequired
    && (rules.POSITIVE_SIGNAL.requiresConsumptionInEveryCTrajectory ? everyCConsumes : true);
  const adverse = perrFavoursH >= rules.ADVERSE_SIGNAL.perrBlocksRequired;
  const anyDirection = perrFavoursC > 0 || perrFavoursH > 0;

  const verdict = positive ? 'POSITIVE_SIGNAL' : adverse ? 'ADVERSE_SIGNAL' : anyDirection ? 'MIXED' : 'NO_SIGNAL';
  return Object.freeze({
    verdict,
    perrFavoursCBlocks: perrFavoursC,
    perrFavoursHBlocks: perrFavoursH,
    qualityNotWorseBlocks: qualityNotWorse,
    totalBlocks: blocks.length,
    everyCTrajectoryConsumes: everyCConsumes,
    rules: Object.freeze({
      perrBlocksRequired: rules.POSITIVE_SIGNAL.perrBlocksRequired,
      qualityBlocksRequired: rules.POSITIVE_SIGNAL.qualityBlocksRequired,
      requiresConsumptionInEveryCTrajectory: rules.POSITIVE_SIGNAL.requiresConsumptionInEveryCTrajectory,
      pValues: rules.pValues,
      costOverridesPerr: rules.costOverridesPerr,
    }),
  });
}

/** §23: THE UPTAKE VERDICT, against the frozen rules. */
function uptakeVerdict(trajectories) {
  const cTrajectories = trajectories.filter((entry) => entry.arm === 'C');
  const perTrajectory = cTrajectories.map((entry) => ({ trajectoryId: entry.trajectoryId, ...trajectoryConsumption(entry.witnesses) }));
  const allConsume = perTrajectory.length > 0 && perTrajectory.every((entry) => entry.consumes === true);
  const someConsume = perTrajectory.some((entry) => entry.consumes === true);
  /** §23: CLOSED additionally requires consumption in the generations where the lesson is exposed. */
  const exposureCovered = perTrajectory.every((entry) => entry.exposedWithoutConsumption.length === 0);
  const verdict = allConsume && exposureCovered ? 'CLOSED' : someConsume ? 'LIMITED' : 'ABSENT';
  return Object.freeze({
    CAPITAL_UPTAKE: verdict,
    perTrajectory: Object.freeze(perTrajectory),
    everyCTrajectoryConsumes: allConsume,
    exposureCoveredEveryTrajectory: exposureCovered,
    rule: UPTAKE_VERDICT_RULES[verdict] ?? null,
    inferFromTaskSuccess: UPTAKE_VERDICT_RULES.inferFromTaskSuccess,
  });
}

async function main() {
  const matrixPath = join(REPO_ROOT, STAGE_EVIDENCE_PATH, 'matrix.json');
  if (!existsSync(matrixPath)) throw new Error('no matrix at research-evidence/r3-l0/matrix.json; run scripts/r3l0/matrix.mjs first');
  const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'));
  const trajectories = matrix.trajectories;

  const perTrajectory = trajectories.map((trajectory) => Object.freeze({
    trajectoryId: trajectory.trajectoryId,
    block: trajectory.block,
    arm: trajectory.arm,
    armName: trajectory.armName,
    terminalHead: trajectory.terminalHead,
    terminalRevision: trajectory.terminalRevision,
    perr: trajectoryPerr(trajectory.generations),
    terminalQuality: terminalQuality(trajectory),
    cost: trajectoryCost(trajectory),
    capitalUse: trajectory.arm === 'C' ? capitalUse(trajectory) : null,
    witnesses: trajectory.witnesses,
    generations: trajectory.generations,
  }));

  const blocks = pairedBlocks(trajectories);
  const utility = utilityVerdict(blocks, trajectories);
  const uptake = uptakeVerdict(trajectories);

  /** §22/§28: the POST-matrix system gates and the historical-evidence immutability check. */
  out('=== post-matrix load-bearing system gates ===');
  const gates = runLoadBearingSystemGates();
  const sv = systemValidFrom(gates);
  for (const [name, value] of Object.entries(gates)) if (name !== 'kind') out(`  ${name.padEnd(26)} ${value.green ? 'GREEN' : 'RED'} ${String(value.detail).slice(0, 70)}`);
  const baseline = JSON.parse(readFileSync(join(REPO_ROOT, STAGE_EVIDENCE_PATH, 'historical-evidence-baseline.json'), 'utf8'));
  const immutability = compareHistoricalEvidence(baseline, digestHistoricalEvidence());
  out(`  SYSTEM_VALID: ${sv.SYSTEM_VALID ? 'YES' : 'NO'}`);
  out(`  HISTORICAL_EVIDENCE_IMMUTABLE: ${immutability.HISTORICAL_EVIDENCE_IMMUTABLE ? 'PASS' : 'FAIL'}`);
  if (immutability.HISTORICAL_EVIDENCE_IMMUTABLE !== true) {
    out(`  changed: ${immutability.changed.join(', ') || 'none'}`);
    out(`  added: ${immutability.added.join(', ') || 'none'}`);
    out(`  removed: ${immutability.removed.join(', ') || 'none'}`);
    out(`  ${immutability.action}`);
  }

  const analysis = Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0',
    kind: 'longitudinal trajectory analysis',
    primaryOutcome: 'PERR (repeated prepaid diagnostic failures / eligible prepaid exposures)',
    fullSolveUsedAsVerdict: false,
    executor: matrix.preMatrixSystemValid === undefined ? null : (await import('./plan.mjs')).PRIMARY_EXECUTOR,
    plannedSessions: matrix.plannedSessions,
    validSessions: matrix.validSessions,
    infrastructureInvalidSessions: matrix.infrastructureInvalidSessions,
    trajectoryEligibleExposures: trajectoryEligibleExposures(),
    diagnosticClasses: DIAGNOSTIC_CLASSES,
    perTrajectory,
    pairedBlocks: blocks,
    utility,
    uptake,
    postMatrixSystemValid: sv,
    historicalEvidenceImmutability: immutability,
    /** §22: system validity takes precedence over any behavioural result. */
    mechanismClaimValid: sv.SYSTEM_VALID === true && immutability.HISTORICAL_EVIDENCE_IMMUTABLE === true,
  });

  writeFileSync(join(REPO_ROOT, STAGE_EVIDENCE_PATH, 'analysis.json'), `${JSON.stringify(analysis, null, 2)}${NL}`, 'utf8');

  out('');
  out('=== per-trajectory outcomes ===');
  for (const entry of perTrajectory) {
    out(`  ${entry.trajectoryId.padEnd(8)} ${entry.armName.padEnd(12)} PERR=${entry.perr.PERR === null ? 'n/a' : entry.perr.PERR.toFixed(3)} repeated=${String(entry.perr.repeatedPrepaidFailures)}/${String(entry.perr.eligiblePrepaidExposures)} repeatedClasses=${String(entry.perr.repeatedPrepaidClassCount)} terminalCov=${entry.terminalQuality.coverage === null ? 'n/a' : entry.terminalQuality.coverage.toFixed(3)}`);
  }
  out('');
  out('=== matched blocks ===');
  for (const block of blocks) out(`  block ${String(block.block)}: H PERR=${block.H.PERR === null ? 'n/a' : block.H.PERR.toFixed(3)} C PERR=${block.C.PERR === null ? 'n/a' : block.C.PERR.toFixed(3)} favoursC=${String(block.perrFavoursC)} qualityNotWorse=${String(block.qualityNotWorse)}`);
  out('');
  out(`CAPITAL_UPTAKE: ${uptake.CAPITAL_UPTAKE}`);
  out(`TRAJECTORY_UTILITY: ${utility.verdict}`);
  out(`mechanism claim valid: ${String(analysis.mechanismClaimValid)}`);
  return analysis;
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}

export { main };
