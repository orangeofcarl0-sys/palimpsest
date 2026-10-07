#!/usr/bin/env node
/**
 * R3-L0 §5/§6/§9/§10/§11 — WRITE THE DESIGN EVIDENCE.
 *
 * Produces the frozen design record the first commit must contain: the prehistory, the generation
 * requirements, the diagnostic classes, the PERR mapping, the capital bodies and their digests, and the H/C
 * definitions. §26 requires all of this to exist BEFORE any primary worker run.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { DIAGNOSTIC_CASES, diagnosticClassSummary } from './diagnostic.mjs';
import { CAPITAL_BODIES, PREHISTORY_SOURCES, REASONING_FRAMES, ARMS, bundleDigest, frozenBundle } from './capital.mjs';
import { GENERATIONS, PREPAID_EXPOSURES, PREPAID_LESSONS, eligiblePrepaidExposures, trajectoryEligibleExposures } from './project.mjs';
import { sha256, trajectoryRoot } from './trajectory.mjs';
import { REPO_ROOT } from './envelope.mjs';

const NL = String.fromCharCode(10);

export function designRecord() {
  const bundle = frozenBundle();
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0',
    kind: 'frozen design: project trajectory and prepaid capital',
    researchQuestion: 'Holding durable Project history and ordinary project continuity constant, does governed cognitive capital derived from already-paid historical experience reduce repeated cognitive errors and/or repeated cognitive effort across multiple fresh worker generations?',
    /** §4: the experimental unit. */
    experimentalUnit: 'ProjectTrajectory (not an individual task)',
    /** §4: what a trajectory contains. */
    trajectoryShape: Object.freeze({
      prehistory: 'deterministic, two already-resolved incidents',
      generations: Object.freeze(['G1', 'G2', 'G3']),
      processBoundaries: 'a REAL OS process exit between every generation',
      freshSessionPerGeneration: Object.freeze([
        'a fresh OS process',
        'no previous model transcript',
        'no session-local object identity',
        'no in-memory attempt identifiers',
        'durable project state re-resolution',
      ]),
    }),
    /** §5: the prepaid lessons. */
    lessons: PREPAID_LESSONS,
    /** §9: the generation requirements. */
    generations: GENERATIONS.map((entry) => Object.freeze({
      id: entry.id,
      title: entry.title,
      requirement: entry.requirement,
      requirementDigest: sha256(entry.requirement),
      exposes: entry.exposes,
      requiredExports: entry.requiredExports,
      objective: entry.objective,
      projectGoal: entry.projectGoal,
    })),
    /** §10: the research diagnostic classes and their cases. */
    diagnosticClasses: diagnosticClassSummary(),
    diagnosticCaseCount: DIAGNOSTIC_CASES.length,
    diagnosticSeparation: Object.freeze({
      projectVerification: 'the VISIBLE oracle in the world; decides whether ordinary Work/Result may proceed',
      researchDiagnostic: 'this stage\'s oracle; research-only, invisible to the worker, no canonical authority, changes no promotion',
      why: '§10: one missed diagnostic class must not stall the trajectory, or the study would measure a stalled project rather than recurrence',
    }),
    /** §11: the prepaid exposure mapping, declared before outcomes. */
    prepaidExposures: PREPAID_EXPOSURES,
    eligiblePerGeneration: Object.freeze(Object.fromEntries(Object.keys(PREPAID_EXPOSURES).map((generation) => [generation, eligiblePrepaidExposures(generation)]))),
    trajectoryEligibleExposures: trajectoryEligibleExposures(),
    perrDefinition: 'repeated prepaid diagnostic failures / eligible prepaid exposures',
    perrFrozenBefore: 'any primary L0 worker run',
    /** §6: the capital bodies and their digests. */
    capitalBundle: bundle,
    bundleDigest: bundleDigest(bundle),
    /** §7/§8: the arm definitions. */
    arms: ARMS,
    /** §6: the owners the capital uses, all pre-existing. */
    ownersUsed: Object.freeze(['src/proof_asset', 'src/reasoning_cell', 'src/procedures', 'src/project_workspace', 'src/organization_memory']),
    newAssetKindCreated: false,
    /** §4: the fixture is NOT a copy of Scenario D. */
    notScenarioD: 'Scenario D invalidates a build cache after a change set. This project has no cache and no change set: the question is which GRANTS survive a revocation, over an explicit derived-from forest the caller declared.',
  });
}

function main() {
  const record = designRecord();
  const dir = join(REPO_ROOT, 'research-evidence', 'r3-l0');
  writeFileSync(join(dir, 'design.json'), `${JSON.stringify(record, null, 2)}${NL}`, 'utf8');
  process.stdout.write(`design written: ${String(record.generations.length)} generations, ${String(record.diagnosticClasses.length)} diagnostic classes, ${String(record.trajectoryEligibleExposures)} eligible prepaid exposures${NL}`);
  process.stdout.write(`capital bundle digest: ${record.bundleDigest}${NL}`);
  process.stdout.write(`leak-free: ${String(record.capitalBundle.leakage.leakFree)}${NL}`);
  for (const entry of record.generations) process.stdout.write(`  ${entry.id} exposes ${entry.exposes.join(',')} (${String(entry.requirementDigest.slice(0, 12))})\n`);
  return record;
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  main();
}

export { trajectoryRoot };
