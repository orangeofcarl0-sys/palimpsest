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
import { CAPITAL_ITEMS, directClasses } from './capital.mjs';
import { COMMON_RENDERER, MODEL_ROUTES, distinctFamilies, verifiedRoutes } from './models.mjs';
import { MIN_CLASS_HEADROOM, PAIR_VERDICTS, QUALIFICATION_BOUNDS, aToBGate, qualifyPair } from './qualification.mjs';

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

/** §2.3: the redundancy map, derived from the fixture's declared class structure. */
function redundancyMap(spec) {
  const map = {};
  for (const group of spec.classStructure.derived ?? []) {
    const ids = Array.isArray(group) ? group : group.classes;
    for (const classId of ids.slice(1)) map[classId] = ids[0];
  }
  return map;
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

  /* -- §11/§12: one verdict per (fixture, model) pair ------------------------- */
  const pairs = [];
  for (const spec of FIXTURE_SPECS) {
    const classIds = classIdsOf(spec);
    const capital = CAPITAL_ITEMS.find((item) => item.appliesToFixture === spec.fixtureId);
    const direct = capital === undefined ? [] : directClasses(spec.fixtureId, capital.capitalId);
    for (const route of verifiedRoutes()) {
      const members = trials.filter((trial) => trial.fixtureId === spec.fixtureId && trial.modelId === route.modelId);
      const verdict = qualifyPair({
        fixtureId: spec.fixtureId,
        modelId: route.modelId,
        nq: MIN_CLASS_HEADROOM.Nq,
        classIds,
        directClasses: direct,
        redundantWith: redundancyMap(spec),
        trials: members,
      });
      pairs.push(Object.freeze({
        ...verdict,
        fixtureName: spec.name,
        taskFamily: spec.mechanismFamily,
        modelFamily: route.modelFamily,
        /** §2.6: this stage's fixtures are COMPLIANT by construction; recorded so the gate can filter. */
        compliant: true,
        scheduled: members.length,
        capitalDelivered: members.some((trial) => trial.capitalDelivered === true),
        maxCompiledHandles: members.reduce((max, trial) => Math.max(max, trial.compiledHandleCount ?? 0), 0),
      }));
    }
  }

  /* -- §2.1/§17: the A→B gate ------------------------------------------------ */
  const gate = aToBGate(pairs.map((pair) => ({ fixtureId: pair.fixtureId, taskFamily: pair.taskFamily, modelId: pair.modelId, modelFamily: pair.modelFamily, verdict: pair.verdict, compliant: pair.compliant })));

  const analysis = Object.freeze({
    schemaVersion: 1,
    stage: 'R3-A0',
    kind: 'baseline qualification analysis',
    treatment: 'NONE — treatment-independent baseline (§10/§20)',
    bounds: QUALIFICATION_BOUNDS,
    nq: MIN_CLASS_HEADROOM.Nq,
    renderer: COMMON_RENDERER,
    scheduledRuns: matrix.expected,
    completedRuns: matrix.completed,
    modelsVerifiedEndToEnd: verifiedRoutes().map((route) => route.modelId),
    distinctVerifiedFamilies: distinctFamilies(verifiedRoutes()),
    allRoutes: MODEL_ROUTES.map((route) => ({ modelId: route.modelId, modelFamily: route.modelFamily, verifiedEndToEnd: route.verifiedEndToEnd })),
    pairs,
    gate,
  });

  mkdirSync(join(REPO_ROOT, 'research-evidence', 'r3-a'), { recursive: true });
  writeFileSync(join(REPO_ROOT, 'research-evidence', 'r3-a', 'qualification-analysis.json'), `${JSON.stringify(analysis, null, 2)}${NL}`, 'utf8');
  writeFileSync(join(REPO_ROOT, 'research-evidence', 'r3-a', 'normalized-trials.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'R3-A0', trials }, null, 2)}${NL}`, 'utf8');

  out(`R3-A0 QUALIFICATION ANALYSIS — ${String(matrix.completed)}/${String(matrix.expected)} runs, ${String(pairs.length)} pair(s)`);
  for (const pair of pairs) {
    out(`  ${pair.fixtureName.padEnd(24)} × ${pair.modelId.padEnd(16)} ${pair.verdict.padEnd(22)} coverage ${pair.classCoverage === null ? 'n/a' : pair.classCoverage.toFixed(3)}  varying DIRECT: ${pair.varyingDirectClasses.join(',') || '(none)'}`);
    for (const reason of pair.reasons) out(`      ${reason.slice(0, 130)}`);
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
  out(`record: ${join(REPO_ROOT, 'research-evidence', 'r3-a', 'qualification-analysis.json')}`);
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}
