#!/usr/bin/env node
/**
 * R3-A2 §"Qualification analysis"/§"Existing graph"/§"Stage outcome" — NORMALIZE, QUALIFY, CHARACTERIZE.
 *
 * §"Qualification analysis": the analysis uses ONLY the frozen corrected R3-AE engine. It does not reimplement
 * a QC clause and it does not loosen a threshold. QC-2 counts variable observationally distinct failure-class
 * series groups; aggregate `classCoverage`/`fullSolve` remain diagnostics; QC-4 counts variable groups carrying
 * at least one frozen DIRECT member; QC-6 comes from the deterministic fixture audit; and only
 * `COMPLIANT + QUALIFIED` pairs become graph edges.
 *
 * §"Existing graph": the corrected R3-AE historical verdicts are CARRIED FORWARD, not rerun. They are read
 * from the committed R3-AE record and merged into one extended graph with the four new pairs.
 *
 * §"Readiness decomposition": the four prospective states are computed over the extended graph, and §"Stage
 * outcome" says the stage is complete when all scheduled valid results are accounted for and the portfolio is
 * characterized — NOT when BRIDGE_READY holds.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { MIN_CLASS_HEADROOM, PAIR_VERDICTS, QUALIFICATION_BOUNDS, qualifyPair } from '../r3a/qualification.mjs';
import { ANTI_OVERFIT_PROCESSES } from '../r3a/fixture-manifest.mjs';
import { NEW_FAMILIES, materialize, specFor } from './fixtures.mjs';
import { MODEL_ROUTES_SENTINEL, sentinelFamilies } from './models.mjs';
import { portfolioCapitalFor, portfolioDirectClasses, portfolioRelationshipOf } from './capital.mjs';
import { portfolioClaimCeiling, portfolioManifestFor } from './manifest.mjs';
import { allPreconditions, preconditionSatisfied } from './fixture-audit.mjs';
import { continuation, readiness } from './readiness.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const NL = String.fromCharCode(10);
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, '').split('=');
  return [key, rest.join('=')];
}));
const RIG = args.get('rig') ?? join(homedir(), '.palimpsest-r3a2', 'qualification');
const out = (line) => process.stdout.write(`${line}${NL}`);

/** §"Primary qualification evidence": normalize one trial record to the fields the contract reads. */
export function normalizeTrial(record) {
  return Object.freeze({
    trialId: record.trialId,
    fixtureId: record.fixtureId,
    fixtureRevision: record.fixtureRevision,
    mechanismFamily: record.mechanismFamily,
    modelId: record.modelId,
    modelFamily: record.modelFamily,
    routeId: record.routeId,
    repetition: record.repetition,
    classPass: record.classPass ?? {},
    classCoverage: record.classCoverage ?? null,
    fullSolve: record.fullSolve === true,
    finalAcceptancePassed: record.finalAcceptance?.passed ?? 0,
    finalAcceptanceTotal: record.finalAcceptance?.total ?? 0,
    unclassifiedFailures: record.unclassifiedFailures ?? 0,
    /** §"Hard stage budget": an infrastructure-invalid run is not a bad model outcome. */
    infrastructureInvalid: record.infrastructureInvalid === true,
    hostFailure: record.hostFailure !== null && record.hostFailure !== undefined,
    timedOut: record.timedOut === true,
    capitalDelivered: record.capitalDelivered === true,
    compiledHandleCount: record.prompt?.compiledHandleCount ?? null,
    indexHandleCount: record.prompt?.indexHandleCount ?? null,
    assembledPromptDigest: record.prompt?.assembledPromptDigest ?? null,
    toolSurfaceDigest: record.prompt?.toolSurfaceDigest ?? null,
    rendererId: record.renderer?.rendererId ?? 'UNKNOWN',
    capacity: record.confidentiality?.capacity ?? null,
    actions: record.actions ?? null,
    revisions: record.revisions ?? null,
    usage: record.usage ?? null,
    cost: record.cost ?? null,
    treatmentIndependence: record.treatmentIndependence ?? null,
    elapsedMs: record.elapsedMs ?? null,
  });
}

/** §"Experiment economics": the token/cost accounting, kept conceptually separate per §"Experiment economics". */
function costAccounting(records) {
  const usable = records.filter((record) => record.usage !== null);
  const sum = (pick) => usable.reduce((total, record) => total + pick(record), 0);
  const inputTokens = sum((record) => record.usage.inputTokens ?? 0);
  const outputTokens = sum((record) => record.usage.outputTokens ?? 0);
  const cachedTokens = sum((record) => record.usage.cacheReadTokens ?? 0);
  const costed = records.filter((record) => record.cost !== null);
  const pairs = new Set(records.map((record) => `${record.fixtureId}||${record.modelId}`));
  return Object.freeze({
    trialsWithUsage: usable.length,
    trialsWithoutUsage: records.length - usable.length,
    inputTokens,
    outputTokens,
    cachedTokens,
    /** §"Experiment economics": the OWNER-side currency of this stage is tokens, since no price is declared. */
    currency: costed.length > 0 ? 'USD and tokens' : 'tokens (no provider-reported monetary cost was available)',
    providerReportedUsd: costed.length > 0 ? costed.reduce((total, record) => total + record.cost.usd, 0) : null,
    costPerValidTrial: Object.freeze({ inputTokens: records.length === 0 ? null : Math.round(inputTokens / records.length), outputTokens: records.length === 0 ? null : Math.round(outputTokens / records.length) }),
    costPerFixtureModelPair: Object.freeze({ inputTokens: pairs.size === 0 ? null : Math.round(inputTokens / pairs.size), outputTokens: pairs.size === 0 ? null : Math.round(outputTokens / pairs.size) }),
    /** §"Experiment economics": owner-side/model-side/tool-interaction costs stay separate. */
    separation: Object.freeze({
      ownerSide: 'inputTokens + outputTokens reported by the provider for the worker session',
      modelSide: 'cachedTokens (cacheReadTokens) reported separately, never folded into inputTokens',
      toolInteraction: 'actions.order length and revisions, counted rather than priced',
    }),
    note: 'a qualified edge is a QUALIFICATION edge, not a capital-treatment edge; §"Experiment economics" forbids optimizing a qualification verdict using cost',
  });
}

async function main() {
  const trialsPath = join(RIG, 'trials.json');
  if (!existsSync(trialsPath)) throw new Error(`no sentinel records at ${trialsPath}; run scripts/r3a2/qualify.mjs first`);
  const matrix = JSON.parse(readFileSync(trialsPath, 'utf8'));
  const records = matrix.trials.map((record) => ({
    ...normalizeTrial(record),
    /** The evidence fields a report needs, kept alongside the normalized view. */
    rawClassPass: record.classPass ?? {},
    classDetail: record.classDetail ?? {},
  }));
  const preconditions = await allPreconditions();

  /* -- §"Qualification analysis": the four new pairs, through the FROZEN engine --------------------- */
  const newPairs = [];
  for (const fixtureId of NEW_FAMILIES) {
    const spec = specFor(fixtureId);
    const capital = portfolioCapitalFor(fixtureId);
    const manifest = portfolioManifestFor(fixtureId);
    const precondition = preconditions[fixtureId];
    /**
     * §"Failure-class requirements": the class set comes from the FIXTURE's own declaration, not from a trial
     * record. Deriving it from an outcome would let a run's missing class silently shrink the denominator.
     */
    const { oracle } = await materialize(spec);
    const classIds = oracle.classIds;
    for (const route of MODEL_ROUTES_SENTINEL) {
      const members = records.filter((record) => record.fixtureId === fixtureId && record.modelId === route.modelId);
      if (members.length === 0) continue;
      const verdict = qualifyPair({
        fixtureId,
        modelId: route.modelId,
        nq: MIN_CLASS_HEADROOM.Nq,
        classIds,
        directClasses: capital === undefined ? [] : portfolioDirectClasses(fixtureId, capital.capitalId),
        /** §"Source/target transfer preparation": the relationship is READ from the frozen map. */
        relationshipOf: (classId) => portfolioRelationshipOf(fixtureId, classId, capital?.capitalId ?? ''),
        /** §"Qualification analysis": QC-6 is the deterministic fixture audit, not a manufactured value. */
        fixtureAuditPrecondition: precondition,
        trials: members,
      });
      newPairs.push(Object.freeze({
        ...verdict,
        fixtureName: spec.name,
        taskFamily: spec.mechanismFamily,
        modelFamily: route.modelFamily,
        /** §"Qualification analysis": READ FROM THE FROZEN MANIFEST, never a stage literal. */
        antiOverfitProcess: manifest?.antiOverfitProcess ?? 'UNKNOWN',
        contamination: manifest?.contamination ?? 'UNKNOWN',
        heldOut: manifest?.heldOut ?? false,
        evaluationModelFamiliesKnownAtConstruction: manifest?.evaluationModelFamiliesKnownAtConstruction ?? null,
        claimCeiling: portfolioClaimCeiling(fixtureId),
        scheduled: members.length,
        capitalDelivered: members.some((record) => record.capitalDelivered === true),
        maxCompiledHandles: members.reduce((max, record) => Math.max(max, record.compiledHandleCount ?? 0), 0),
        /** §"Common cognitive interface": the per-trial interface record, so a reader can see it did not vary. */
        commonInterface: members.map((record) => ({
          trialId: record.trialId,
          modelId: record.modelId,
          modelFamily: record.modelFamily,
          providerId: record.routeId,
          rendererId: record.rendererId,
          assembledPromptDigest: record.assembledPromptDigest,
          toolSurfaceDigest: record.toolSurfaceDigest,
        })),
      }));
    }
  }

  /* -- §"Existing graph": the historical corrected verdicts, carried forward ------------------------ */
  const historicalPath = join(REPO_ROOT, 'research-evidence', 'r3-ae', 'corrected-analysis.json');
  const historical = existsSync(historicalPath) ? JSON.parse(readFileSync(historicalPath, 'utf8')) : null;
  const historicalPairs = (historical?.pairs ?? []).map((pair) => Object.freeze({
    fixtureId: pair.fixtureId,
    fixtureName: pair.fixtureName,
    taskFamily: pair.taskFamily,
    modelId: pair.modelId,
    modelFamily: pair.modelFamily,
    verdict: pair.verdict,
    originalVerdict: pair.originalVerdict,
    classCoverage: pair.classCoverage,
    variableGroups: pair.variableGroups,
    variableDirectGroups: pair.variableDirectGroups,
    antiOverfitProcess: pair.antiOverfitProcess,
    claimCeiling: pair.claimCeiling,
    source: 'R3-AE corrected reanalysis (carried forward, NOT rerun)',
  }));

  /**
   * §"Extended full qualification graph": the historical pairs plus the new ones, as one bipartite graph.
   * The historical pairs are restricted to the sentinel families so the graph is the portfolio the SENTINEL
   * stage is scoped to; the restriction is recorded rather than silent.
   */
  const sentinels = sentinelFamilies();
  const graphPairs = [
    ...historicalPairs.filter((pair) => sentinels.includes(pair.modelFamily)).map((pair) => ({ ...pair, origin: 'R3-A0/R3-AE' })),
    ...newPairs.map((pair) => ({ ...pair, origin: 'R3-A2' })),
  ];

  const readinessReport = readiness(graphPairs, sentinels);
  const next = continuation(readinessReport);

  /** §"Existing graph": the historical A→B gate is REPRODUCED from the carried-forward verdicts, unchanged. */
  const historicalGate = historical?.gate ?? null;

  const analysis = Object.freeze({
    schemaVersion: 1,
    stage: 'R3-A2',
    kind: 'sentinel portfolio qualification',
    treatment: 'NONE — treatment-independent baseline',
    engine: 'the frozen corrected R3-AE qualification engine; no QC clause reimplemented',
    bounds: QUALIFICATION_BOUNDS,
    nq: MIN_CLASS_HEADROOM.Nq,
    sentinelFamilies: sentinels,
    plannedValidRuns: matrix.plannedValidRuns,
    validRuns: matrix.validRuns,
    attemptsMade: matrix.attemptsMade,
    infrastructureInvalidAttempts: matrix.infrastructureInvalidAttempts,
    validRunsByPair: matrix.validRunsByPair,
    newPairs,
    historicalPairs,
    extendedGraph: Object.freeze({
      pairs: Object.freeze(graphPairs),
      edges: readinessReport.edges,
      note: 'only COMPLIANT + QUALIFIED pairs are edges; historical verdicts are carried forward, never rerun',
    }),
    readiness: readinessReport,
    continuation: next,
    historicalGate,
    costAccounting: costAccounting(records),
    fixturePreconditions: Object.fromEntries(Object.entries(preconditions).map(([id, value]) => [id, {
      mechanicalOracleProven: value.mechanicalOracleProven,
      allHiddenCasesDeclareFailureClass: value.allHiddenCasesDeclareFailureClass,
      allDeclaredClassesAreExercised: value.allDeclaredClassesAreExercised,
      oracleUsesNoModelSelfReport: value.oracleUsesNoModelSelfReport,
      contentDigest: value.contentDigest,
      satisfied: preconditionSatisfied(value),
    }])),
    /** §"No primary-fixture smoke": the deviations are recorded, not omitted. */
    deviations: Object.freeze(collectDeviations(matrix, records)),
  });

  mkdirSync(join(REPO_ROOT, 'research-evidence', 'r3-a2'), { recursive: true });
  writeFileSync(join(REPO_ROOT, 'research-evidence', 'r3-a2', 'analysis.json'), `${JSON.stringify(analysis, null, 2)}${NL}`, 'utf8');
  writeFileSync(join(REPO_ROOT, 'research-evidence', 'r3-a2', 'normalized-trials.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'R3-A2', trials: records }, null, 2)}${NL}`, 'utf8');

  out(`R3-A2 SENTINEL PORTFOLIO ANALYSIS — ${String(matrix.validRuns)}/${String(matrix.plannedValidRuns)} valid runs, ${String(newPairs.length)} new pair(s)`);
  for (const pair of newPairs) {
    out(`  ${pair.fixtureName.padEnd(24)} x ${pair.modelId.padEnd(16)} ${pair.verdict.padEnd(22)} coverage ${pair.classCoverage === null ? 'n/a' : pair.classCoverage.toFixed(3)}`);
    out(`      variable groups: ${pair.variableGroups.join(' | ') || '(none)'}   DIRECT groups: ${pair.variableDirectGroups.join(' | ') || '(none)'}`);
    for (const reason of pair.reasons) out(`      ${reason.slice(0, 160)}`);
  }
  out('');
  out('--- the extended qualification graph ---');
  for (const pair of graphPairs) out(`  [${String(pair.origin).padEnd(12)}] ${String(pair.taskFamily).padEnd(34)} x ${pair.modelFamily.padEnd(9)} ${pair.verdict}`);
  out('');
  out('--- readiness decomposition ---');
  for (const state of ['TASK_READY', 'MODEL_READY', 'LOCAL_PAIR_READY', 'BRIDGE_READY']) out(`  ${state.padEnd(18)} ${readinessReport[state] ? 'YES' : 'NO'}`);
  out(`  full 2x2 cross     ${readinessReport.fullTwoByTwoCrossExists ? 'YES' : 'NO'}`);
  out(`  ${readinessReport.confoundNote}`);
  out(`NEXT: ${next.next}`);
  out(`record: ${join(REPO_ROOT, 'research-evidence', 'r3-a2', 'analysis.json')}`);
}

/** §"No primary-fixture smoke"/§"Hard stage budget": the protocol deviations, derived from the record. */
function collectDeviations(matrix, records) {
  const deviations = [];
  if (matrix.attemptsMade !== matrix.plannedValidRuns) {
    deviations.push(Object.freeze({
      kind: 'ATTEMPTS_EXCEEDED_SCHEDULE',
      detail: `${String(matrix.attemptsMade)} attempts were made for ${String(matrix.plannedValidRuns)} scheduled runs; ${String(matrix.infrastructureInvalidAttempts)} were infrastructure-invalid`,
      note: 'an infrastructure-invalid attempt is not a model outcome and is retried to reach Nq valid runs for its pair',
    }));
  }
  for (const record of records) {
    const independence = record.treatmentIndependence ?? {};
    if (independence.efficacy !== null && independence.efficacy?.mode !== 'off') {
      deviations.push(Object.freeze({ kind: 'TREATMENT_SEAM_ENABLED', detail: `${record.trialId}: the efficacy seam reported mode ${String(independence.efficacy?.mode)}` }));
    }
    if (independence.index !== null && independence.index?.mode !== 'off') {
      deviations.push(Object.freeze({ kind: 'TREATMENT_SEAM_ENABLED', detail: `${record.trialId}: the index seam reported mode ${String(independence.index?.mode)}` }));
    }
    if (record.capitalDelivered === true) {
      deviations.push(Object.freeze({ kind: 'CAPITAL_DELIVERED', detail: `${record.trialId}: capital was delivered in a baseline run` }));
    }
  }
  return deviations;
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}
