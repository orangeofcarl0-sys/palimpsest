#!/usr/bin/env node
/**
 * R2-U §24 — WRITE THE EVIDENCE DIRECTORY.
 *
 * §24 fixes the layout:
 *
 *   research-evidence/r2-u/
 *     protocol.json          the frozen design, the seed, the schedule, the pre-declared verdict criteria
 *     affordance.txt         the EXACT uptake wording, so the clause is readable without running anything
 *     scenario-d/            the Scenario-D contract, its cases, and the grounded capital
 *     calibration/           the C0 calibration record (NEVER counted among the 40)
 *     trials/                one sanitized record per primary trial
 *     normalized-results.json  the pre-registered per-trial outcome list
 *     analysis.json          the frozen comparisons, the uptake verdict, and the efficacy observations
 *
 * §24 also requires SANITIZATION of absolute paths and secrets. Credentials and private reasoning are never
 * captured in the first place: the trial harness records observable fields only, and the worker's own
 * summary is its self-report, not its chain-of-thought.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { UPTAKE_CLAUSE, uptakeClauseDigest } from '../../host/dsh/lib/affordance.js';
import { deriveCapital } from './capital.mjs';
import { blockOrder, CELLS, EXPECTED_TRIALS, FACTORS, PROTOCOL_SEED, REPETITIONS, SCENARIO_IDS, UPTAKE_VERDICTS } from './design.mjs';
import { SCENARIOS } from './scenarios.mjs';
import { SCENARIO_D_GENERATIONS } from './teacher-exploration.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const EVIDENCE = join(REPO_ROOT, 'research-evidence', 'r2-u');
const RIG = join(homedir(), '.palimpsest-r2u', 'matrix');
const CALIBRATION_RIG = join(homedir(), '.palimpsest-r2u', 'calibration');

/** §24: strip absolute local paths. Credential-shaped keys are dropped outright rather than sanitized. */
function sanitize(value) {
  if (typeof value === 'string') {
    return value
      .replace(/[A-Za-z]:\\+Users\\+[^\\/\s"]+/gu, '<home>')
      .replace(/[A-Za-z]:\\+[^"\s]*/gu, (match) => (match.includes('.palimpsest-r2u') ? '<rig>' : '<abs>'))
      .replace(/\/(?:home|Users)\/[^/\s"]+/gu, '<home>');
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [key, inner] of Object.entries(value)) {
      if (/credential|token|secret|password|api[-_]?key/iu.test(key)) continue;
      out[key] = sanitize(inner);
    }
    return out;
  }
  return value;
}

const writeJson = (path, value) => {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(sanitize(value), null, 2)}\n`, 'utf8');
  process.stdout.write(`wrote ${path.replace(REPO_ROOT, '<repo>')}\n`);
};

/* ---------------------------------------------------------------- protocol.json */

const clauseDigest = await uptakeClauseDigest();
writeJson(join(EVIDENCE, 'protocol.json'), {
  schemaVersion: 1,
  stage: 'R2-U',
  title: 'Capital Uptake & Affordance',
  startingHead: 'c023a633f2caf747aee539b029fba37a3a7fca48',
  branch: 'r2-u-capital-uptake',
  design: {
    kind: '2x2 factorial, randomized blocks',
    factors: FACTORS,
    cells: [...CELLS],
    repetitions: REPETITIONS,
    scenarios: [...SCENARIO_IDS],
    expectedTrials: EXPECTED_TRIALS,
    seed: `0x${PROTOCOL_SEED.toString(16)}`,
    blockOrder: SCENARIO_IDS.map((id) => ({ scenario: id, blocks: blockOrder(REPETITIONS, id) })),
  },
  affordance: { mode: 'explicit-review', envVar: 'PALIMPSEST_R2U_AFFORDANCE', clauseDigest },
  primaryMetric: 'P(capital handles pulled) per cell',
  secondaryMetrics: [
    'P(Procedure pull)',
    'median relevant handles pulled',
    'time-to-first-pull',
    'tool actions before first pull',
    'capital shown but never used',
  ],
  preDeclaredVerdicts: Object.values(UPTAKE_VERDICTS),
  verdictCriteria: {
    REPLICATED: 'both scenarios: K1A1 pull rate > K1A0 pull rate, with governed body pulls, and no comparable placebo shift in K0',
    PARTIAL: 'exactly one scenario shows a clear increase, or both show a weak/noisy directional increase',
    NOT_IMPROVED: 'the explicit affordance does not increase capital use in either scenario',
  },
  efficacyNote: 'efficacy is SECONDARY and is only analysed where a governed body pull actually occurred',
  frozenPriorEvidence: { source: 'R1-R', trials: 30, capitalVisible: true, capitalPullable: true, governedPulls: '0/30', role: 'the passive-affordance baseline; NOT rerun and NOT reinterpreted as the R2-U affordance' },
});

/* ---------------------------------------------------------------- affordance.txt */

mkdirSync(EVIDENCE, { recursive: true });
writeFileSync(
  join(EVIDENCE, 'affordance.txt'),
  [
    'R2-U — THE FROZEN UPTAKE CLAUSE',
    '',
    'Used verbatim in K0A1 and K1A1. The arms differ ONLY in whether relevant handles actually exist.',
    'Appended to the host-composed prompt by `host/dsh/lib/affordance.js` in explicit-review mode.',
    'The default mode is byte-identical to production and appends nothing.',
    '',
    `digest: ${clauseDigest}`,
    '',
    '---',
    '',
    UPTAKE_CLAUSE,
    '',
  ].join('\n'),
  'utf8',
);
process.stdout.write(`wrote ${join(EVIDENCE, 'affordance.txt').replace(REPO_ROOT, '<repo>')}\n`);

/* ---------------------------------------------------------------- scenario-d/ */

const capital = deriveCapital().D;
writeJson(join(EVIDENCE, 'scenario-d', 'contract.json'), {
  schemaVersion: 1,
  scenario: SCENARIOS.D.name,
  projectId: SCENARIOS.D.projectId,
  taskObjective: SCENARIOS.D.taskObjective,
  projectGoal: SCENARIOS.D.projectGoal,
  requirements: SCENARIOS.D.requirements,
  sourceFile: SCENARIOS.D.sourceFile,
  exportName: SCENARIOS.D.exportName,
  oracleCommand: SCENARIOS.D.oracleCommand,
  knownFailure: SCENARIOS.D.knownFailure,
  knownFailureDetector: SCENARIOS.D.knownFailureDetector,
  hiddenCaseCount: (await import(`file://${SCENARIOS.D.acceptanceModule.replace(/\\/gu, '/')}`)).HIDDEN_CASES.length,
  visibleCaseCount: (await import(`file://${SCENARIOS.D.acceptanceModule.replace(/\\/gu, '/')}`)).VISIBLE_CASES.length,
  generatorLadder: SCENARIO_D_GENERATIONS.map((generation) => ({ id: generation.id, note: generation.note })),
});
writeJson(join(EVIDENCE, 'scenario-d', 'exploration.json'), capital.exploration);
writeJson(join(EVIDENCE, 'scenario-d', 'capital.json'), {
  schemaVersion: 1,
  scenario: 'D',
  proof: capital.proof,
  reasoning: capital.reasoning,
  procedureClauses: capital.procedureClauses,
  trustSemantics: 'a Proof is information and never instruction authority; a Reasoning claim is admitted reasoning and never authority; a Procedure is ADVISORY method guidance and cannot widen scope or allowed commands',
});

/* ---------------------------------------------------------------- calibration/ */

if (existsSync(join(CALIBRATION_RIG, 'calibration.json'))) {
  writeJson(join(EVIDENCE, 'calibration', 'calibration.json'), JSON.parse(readFileSync(join(CALIBRATION_RIG, 'calibration.json'), 'utf8')));
} else {
  process.stdout.write('no calibration record yet; run `pnpm r2u:calibrate` before the matrix\n');
}

/* ---------------------------------------------------------------- trials/ */

/**
 * The trials directory is taken from the RUN RECORD's own `plan.json` rather than a fixed path, because the
 * matrix names each invocation's directory uniquely. Reading the plan is what keeps the evidence tied to the
 * invocation that actually produced the records.
 */
const planPath = join(RIG, 'plan.json');
const trialsDir = existsSync(planPath) ? (JSON.parse(readFileSync(planPath, 'utf8')).runsDir ?? join(RIG, 'runs')) : join(RIG, 'runs');
if (existsSync(trialsDir)) {
  mkdirSync(join(EVIDENCE, 'trials'), { recursive: true });
  let count = 0;
  for (const entry of readdirSync(trialsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const recordPath = join(trialsDir, entry.name, 'out', 'trial.json');
    if (!existsSync(recordPath)) continue;
    writeJson(join(EVIDENCE, 'trials', `${entry.name}.json`), JSON.parse(readFileSync(recordPath, 'utf8')));
    count += 1;
  }
  process.stdout.write(`wrote ${String(count)} trial record(s)\n`);
} else {
  process.stdout.write('no matrix records yet; run `pnpm r2u:matrix` first\n');
}

/* ---------------------------------------------------------------- normalized + analysis (if present) */

for (const name of ['normalized-results.json', 'analysis.json']) {
  const source = join(RIG, name);
  if (existsSync(source)) writeJson(join(EVIDENCE, name), JSON.parse(readFileSync(source, 'utf8')));
}

process.stdout.write('\nR2-U evidence written to research-evidence/r2-u/\n');
