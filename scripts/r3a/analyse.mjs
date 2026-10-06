#!/usr/bin/env node
/**
 * R3-A0 §11/§12/§16/§17 — NORMALIZE, QUALIFY EACH PAIR, AND APPLY THE A→B GATE.
 *
 * Reads the frozen qualification records, groups them by (fixture, model) pair, applies the six QC clauses,
 * and then evaluates the bipartite-graph gate. It writes the verdicts and never modifies a trial record.
 *
 * §11: qualification is about ASSAY HEADROOM, not model ranking. The report deliberately does not rank the
 * models; it records each pair's headroom and whether the fixture is usable for that model.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { FIXTURE_SPECS } from './fixture-content.mjs';
import { CAPITAL_ITEMS, directClasses, relationshipOf as capitalRelationship } from './capital.mjs';
import { FIXTURE_MANIFESTS, claimCeilingFor, manifestFor } from './fixture-manifest.mjs';
import { COMMON_RENDERER, MODEL_ROUTES, distinctFamilies, verifiedRoutes } from './models.mjs';
import { MIN_CLASS_HEADROOM, PAIR_VERDICTS, QUALIFICATION_BOUNDS, aToBGate, qualifyPair } from './qualification.mjs';
import { allPreconditions } from './fixture-audit.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, '').split('=');
  return [key, rest.join('=')];
}));
const RIG = args.get('rig') ?? join(homedir(), '.palimpsest-r3a', 'qualification');
const NL = String.fromCharCode(10);
const out = (line) => process.stdout.write(`${line}${NL}`);

/** The class ids of a fixture, read from the fixture's own acceptance source. */
export function classIdsOf(spec) {
  const acceptance = spec.files['acceptance.mjs'];
  const ids = [...acceptance.matchAll(/Object\.freeze\(\{ id: "([A-Z]{2}\d+)"/gu)].map((match) => match[1]);
  return [...new Set(ids)].sort();
}


export function loadTrials(rig = RIG) {
  const path = join(rig, 'trials.json');
  if (!existsSync(path)) throw new Error(`no qualification records at ${path}; run scripts/r3a/qualify.mjs first`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** §11/§12: normalize one trial record to the fields the contract reads. */
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
    fullSolve: record.finalAcceptance?.total > 0 && record.finalAcceptance.passed === record.finalAcceptance.total,
    finalAcceptancePassed: record.finalAcceptance?.passed ?? 0,
    finalAcceptanceTotal: record.finalAcceptance?.total ?? 0,
    /** §16: an infrastructure-invalid run is not a bad model outcome. */
    infrastructureInvalid: record.infrastructureInvalid === true,
    hostFailure: record.hostFailure !== null && record.hostFailure !== undefined,
    timedOut: record.timedOut === true,
    /** §10/§11: the treatment-independence facts, so the record proves no capital was delivered. */
    capitalDelivered: record.capitalDelivered === true,
    compiledHandleCount: record.prompt?.compiledHandleCount ?? null,
    indexHandleCount: record.prompt?.indexHandleCount ?? null,
    capacity: record.confidentiality?.capacity ?? null,
    rendererId: record.renderer?.rendererId ?? 'UNKNOWN',
  });
}

async function main() {
  const matrix = loadTrials(RIG);
  const trials = matrix.trials.map(normalizeTrial);
  const preconditions = await allPreconditions();

  /**
   * §13 (R3-AE): the CORRECTED verdicts, computed with the corrected engine. The ORIGINAL R3-A0 verdicts are
   * read from the committed R3-A0 analysis rather than recomputed, so the historical record is not silently
   * replaced by a re-run of different code.
   */
  const originalPath = join(REPO_ROOT, 'research-evidence', 'r3-a', 'qualification-analysis.json');
  const original = existsSync(originalPath) ? JSON.parse(readFileSync(originalPath, 'utf8')) : null;

  const pairs = [];
  for (const spec of FIXTURE_SPECS) {
    const classIds = classIdsOf(spec);
    const capital = CAPITAL_ITEMS.find((item) => item.appliesToFixture === spec.fixtureId);
    const manifest = manifestFor(spec.fixtureId);
    const precondition = preconditions[spec.fixtureId];
    for (const route of verifiedRoutes()) {
      const members = trials.filter((trial) => trial.fixtureId === spec.fixtureId && trial.modelId === route.modelId);
      /**
       * §17 (R3-AE): a route verified for PLUMBING but with NO qualification runs on this fixture is NOT a
       * pair. Emitting one would report a spurious INFRASTRUCTURE_INVALID cell and inflate the pair count the
       * gate reads. Only (fixture, model) combinations with actual runs enter the analysis.
       */
      if (members.length === 0) continue;
      const verdict = qualifyPair({
        fixtureId: spec.fixtureId,
        modelId: route.modelId,
        nq: MIN_CLASS_HEADROOM.Nq,
        classIds,
        directClasses: capital === undefined ? [] : directClasses(spec.fixtureId, capital.capitalId),
        /** §6: the per-class relationship, read from the FROZEN manifest rather than inferred from text. */
        relationshipOf: (classId) => capitalRelationship(spec.fixtureId, classId, capital?.capitalId ?? ''),
        /** §8: the deterministic fixture-audit precondition. The analysis does not manufacture it. */
        fixtureAuditPrecondition: precondition,
        trials: members,
      });
      const originalPair = original?.pairs?.find((entry) => entry.fixtureId === spec.fixtureId && entry.modelId === route.modelId) ?? null;
      pairs.push(Object.freeze({
        ...verdict,
        fixtureName: spec.name,
        taskFamily: spec.mechanismFamily,
        modelFamily: route.modelFamily,
        /** §10: READ FROM THE FROZEN MANIFEST, never a stage literal. */
        antiOverfitProcess: manifest?.antiOverfitProcess ?? 'UNKNOWN',
        contamination: manifest?.contamination ?? 'UNKNOWN',
        heldOut: manifest?.heldOut ?? false,
        claimCeiling: claimCeilingFor(spec.fixtureId),
        originalVerdict: originalPair?.verdict ?? 'ABSENT',
        scheduled: members.length,
        capitalDelivered: members.some((trial) => trial.capitalDelivered === true),
        maxCompiledHandles: members.reduce((max, trial) => Math.max(max, trial.compiledHandleCount ?? 0), 0),
      }));
    }
  }

  /* -- §14: the A→B gate, from corrected verdicts and manifest-derived compliance -- */
  const gate = aToBGate(pairs.map((pair) => ({ fixtureId: pair.fixtureId, taskFamily: pair.taskFamily, modelId: pair.modelId, modelFamily: pair.modelFamily, verdict: pair.verdict, antiOverfitProcess: pair.antiOverfitProcess })));

  const analysis = Object.freeze({
    schemaVersion: 1,
    stage: 'R3-AE',
    kind: 'CORRECTED qualification reanalysis (append-only; the R3-A0 analysis is preserved)',
    correction: 'QC-2/QC-4 now group failure classes by their OBSERVED series read from trial.classPass; QC-6 is a real deterministic fixture-audit precondition; compliance is read from the frozen fixture manifest',
    treatment: 'NONE — treatment-independent baseline',
    bounds: QUALIFICATION_BOUNDS,
    nq: MIN_CLASS_HEADROOM.Nq,
    renderer: COMMON_RENDERER,
    scheduledRuns: matrix.expected,
    completedRuns: matrix.completed,
    modelsVerifiedEndToEnd: verifiedRoutes().map((route) => route.modelId),
    distinctVerifiedFamilies: distinctFamilies(verifiedRoutes()),
    allRoutes: MODEL_ROUTES.map((route) => ({ modelId: route.modelId, modelFamily: route.modelFamily, verifiedEndToEnd: route.verifiedEndToEnd })),
    fixtureManifests: FIXTURE_MANIFESTS,
    fixturePreconditions: Object.fromEntries(Object.entries(preconditions).map(([id, value]) => [id, { mechanicalOracleProven: value.mechanicalOracleProven, allHiddenCasesDeclareFailureClass: value.allHiddenCasesDeclareFailureClass, allDeclaredClassesAreExercised: value.allDeclaredClassesAreExercised, oracleUsesNoModelSelfReport: value.oracleUsesNoModelSelfReport, contentDigest: value.contentDigest }])),
    pairs,
    gate,
  });

  mkdirSync(join(REPO_ROOT, 'research-evidence', 'r3-ae'), { recursive: true });
  writeFileSync(join(REPO_ROOT, 'research-evidence', 'r3-ae', 'corrected-analysis.json'), `${JSON.stringify(analysis, null, 2)}${NL}`, 'utf8');
  writeFileSync(join(REPO_ROOT, 'research-evidence', 'r3-ae', 'normalized-trials.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'R3-AE', note: 'the preserved R2/R3-A0 trial records, normalized; identical bytes to the R3-A0 record', trials }, null, 2)}${NL}`, 'utf8');

  out(`R3-AE CORRECTED QUALIFICATION ANALYSIS — ${String(matrix.completed)}/${String(matrix.expected)} preserved runs, ${String(pairs.length)} pair(s)`);
  for (const pair of pairs) {
    out(`  ${pair.fixtureName.padEnd(24)} × ${pair.modelId.padEnd(16)} ${pair.verdict.padEnd(22)} (was ${pair.originalVerdict})  coverage ${pair.classCoverage === null ? 'n/a' : pair.classCoverage.toFixed(3)}`);
    out(`      variable groups: ${pair.variableGroups.join(' | ') || '(none)'}   DIRECT groups: ${pair.variableDirectGroups.join(' | ') || '(none)'}`);
    for (const reason of pair.reasons) out(`      ${reason.slice(0, 150)}`);
  }
  out('');
  out(`A→B GATE: ${gate.green ? 'GREEN' : 'RED'}`);
  out(`  clauses: ${JSON.stringify(gate.clauses)}`);
  out(`  qualified pairs: ${String(gate.qualifiedPairs)}  excluded non-compliant: ${String(gate.excludedNonCompliant)}`);
  out(`  task families: ${gate.taskFamilies.join(', ') || '(none)'}`);
  out(`  model families: ${gate.modelFamilies.join(', ') || '(none)'}`);
  out(`  models on >=2 task families: ${gate.modelsOnTwoTaskFamilies.join(', ') || '(none)'}`);
  out(`  task families on >=2 model families: ${gate.taskFamiliesOnTwoModelFamilies.join(', ') || '(none)'}`);
  out(`  full 2x2 cross: ${gate.fullTwoByTwoCross ? 'YES' : 'NO'}`);
  out(`record: ${join(REPO_ROOT, 'research-evidence', 'r3-ae', 'corrected-analysis.json')}`);
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}
