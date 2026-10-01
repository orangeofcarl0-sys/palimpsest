#!/usr/bin/env node
/**
 * R2-E §23 — WRITE THE EVIDENCE DIRECTORY.
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

import { createHash } from 'node:crypto';
import { EFFICACY_SECTION_HEADING, E0_SECTION, KIND_FRAMING, PREWORK_MECHANISM } from '../../host/dsh/lib/efficacy.js';
import { deriveCapital } from '../r2u/capital.mjs';
import { ARMS, blockOrder, CONDITIONS, EFFICACY_VERDICTS, EXPECTED_TRIALS, PROTOCOL_SEED, REPETITIONS, SCENARIO_IDS } from './design.mjs';
import { SCENARIOS } from '../r2u/scenarios.mjs';
import { SCENARIO_D_GENERATIONS } from '../r2u/teacher-exploration.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const EVIDENCE = join(REPO_ROOT, 'research-evidence', 'r2-e');
const RIG = join(homedir(), '.palimpsest-r2e', 'matrix');
const CALIBRATION_RIG = join(homedir(), '.palimpsest-r2e', 'pilot');

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

writeJson(join(EVIDENCE, 'protocol.json'), {
  schemaVersion: 1,
  stage: 'R2-E',
  title: 'Controlled Capital Efficacy',
  startingHead: '8edf9f12f624828b43502642152f653c924e1bb8',
  branch: 'r2-e-controlled-capital-efficacy',
  design: {
    kind: '2-condition randomized blocks, host-mediated capital delivery',
    conditions: [...CONDITIONS],
    arms: ARMS,
    repetitions: REPETITIONS,
    scenarios: [...SCENARIO_IDS],
    expectedTrials: EXPECTED_TRIALS,
    seed: `0x${PROTOCOL_SEED.toString(16)}`,
    blockOrder: SCENARIO_IDS.map((id) => ({ scenario: id, blocks: blockOrder(REPETITIONS, id) })),
  },
  efficacyMechanism: {
    mechanism: PREWORK_MECHANISM,
    envVar: 'PALIMPSEST_R2E_EFFICACY',
    whyHostMediated: 'R2-U measured voluntary uptake at 1/40 overall and 0/10 in the explicit-review capital-present arm, so a prework mechanism depending on the model choosing to pull would fail its own precondition on most runs',
    channel: 'the worker-local pull tool and the SAME parent resolver (AllowedPullHandles + attempt-bound fetchContext); no second fetch path, no direct backing-store read, no global asset lookup',
    timing: 'before the first engineering turn exists, so consumption-before-first-edit is structural',
  },
  primaryMetric: 'pre-paid mistake recurrence, then mechanical outcome (full solve) per arm',
  secondaryMetrics: ['first-candidate hidden acceptance', 'visible oracle iterations', 'implementation revisions', 'elapsed time', 'host/model failure'],
  preDeclaredVerdicts: [EFFICACY_VERDICTS.REPLICATED, EFFICACY_VERDICTS.PARTIAL, EFFICACY_VERDICTS.NOT_OBSERVED],
  verdictCriteria: {
    REPLICATED: 'both scenarios: E1 repeats the pre-paid mistake less often than E0 AND E1 mechanical outcome is not worse, with every analysed E1 trial having consumed all selected capital',
    PARTIAL: 'exactly one scenario shows clear benefit, or both show weak/noisy directional benefit',
    NOT_OBSERVED: 'neither scenario shows meaningful benefit despite guaranteed capital consumption',
  },
  notAnUptakeStage: 'R2-E removes voluntary uptake as a variable. R2-U remains the uptake result and this stage must not be converted into one.',
  frozenPriorEvidence: {
    r1r: { trials: 30, capitalAvailable: true, governedPulls: '0/30' },
    r2u: { trials: 40, explicitReviewDidNotImproveUptake: true, governedPulls: '1/40', capitalPresentPulls: '1/20', explicitReviewCapitalPresentPulls: '0/10' },
    onePuller: 'solved its Scenario-C task, but n=1 and self-selected, so that is association only',
  },
  indexHypothesisCarriedForward: {
    id: 'H-index',
    statement: 'kind + opaque identity + handle does not provide enough expected-value information for a worker to decide that pull is worth its cost',
    status: 'RECORDED, NOT IMPLEMENTED — actionable only if R2-E establishes capital efficacy',
  },
});

/* ---------------------------------------------------------------- the frozen sections */

mkdirSync(EVIDENCE, { recursive: true });
writeFileSync(
  join(EVIDENCE, 'sections.txt'),
  [
    'R2-E — THE TWO EXPERIMENTAL SECTIONS',
    '',
    'Both arms carry the SAME boundary, so the arms differ in CONTENT rather than in shape.',
    'Appended to the host-composed prompt by `host/dsh/lib/efficacy.js` in the e0/e1 modes.',
    'The default mode is byte-identical to production and appends nothing.',
    '',
    `boundary heading: ${EFFICACY_SECTION_HEADING}`,
    '',
    '--- E0 (control) ---',
    '',
    E0_SECTION,
    '',
    '--- E1 (treatment) — kind framing ---',
    '',
    ...Object.entries(KIND_FRAMING).map(([kind, framing]) => `${kind.toUpperCase()}: ${framing}`),
    '',
    'The E1 body text is the resolved capital, rendered per kind under the framing above.',
    '',
  ].join(String.fromCharCode(10)),
  'utf8',
);
process.stdout.write(`wrote ${join(EVIDENCE, 'sections.txt').replace(REPO_ROOT, '<repo>')}\n`);

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

/* ---------------------------------------------------------------- the pilot + the trial manifest */

/**
 * §23: EVIDENCE-VOLUME DISCIPLINE. R2-U's full per-trial dump is NOT repeated here. The repo carries the
 * protocol, the manifest, normalized results, the analysis, the digests and ONE representative trace per
 * arm; the complete session transcripts stay external and the repo carries their cryptographic digests.
 *
 * A manifest with digests is what makes that safe: the committed artifact still pins every trial's bytes, so
 * "the transcript is elsewhere" is a verifiable claim rather than an unbacked one.
 */
const planPath = join(RIG, 'plan.json');
const runsDir = existsSync(planPath) ? (JSON.parse(readFileSync(planPath, 'utf8')).runsDir ?? join(RIG, 'runs')) : join(RIG, 'runs');

const sha256Of = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const manifest = [];
if (existsSync(runsDir)) {
  for (const entry of readdirSync(runsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(runsDir, entry.name);
    const recordPath = join(dir, 'out', 'trial.json');
    const transcriptPath = join(dir, 'out', 'worker-transcript.txt');
    if (!existsSync(recordPath)) continue;
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    manifest.push({
      trialId: entry.name,
      scenario: record.scenario,
      condition: record.condition,
      block: record.block,
      repetition: record.repetition,
      finalAcceptance: record.finalAcceptance,
      firstCandidateAcceptance: record.firstCandidateAcceptance,
      knownFailureRecurred: record.knownFailureFinal?.recurred ?? 'UNKNOWN',
      procedureMarkerReflected: record.procedureMarkerFinal?.reflected ?? 'UNKNOWN',
      preconditionMet: record.preconditionMet,
      efficacyPrecondition: record.efficacyPrecondition,
      prework: record.prework === null || record.prework === undefined ? null : { mechanism: record.prework.mechanism, selectedCount: record.prework.selectedCount, resolvedCount: record.prework.resolvedCount, digests: record.prework.digests, failures: record.prework.failures },
      hostFailure: record.hostFailure === null ? null : 'HOST_FAILURE',
      elapsedMs: record.elapsedMs,
      digests: {
        trialRecord: sha256Of(recordPath),
        transcript: existsSync(transcriptPath) ? sha256Of(transcriptPath) : 'ABSENT',
        finalSource: existsSync(join(dir, 'out', 'final-source.txt')) ? sha256Of(join(dir, 'out', 'final-source.txt')) : 'ABSENT',
      },
    });
  }
}
writeJson(join(EVIDENCE, 'trial-manifest.json'), { schemaVersion: 1, stage: 'R2-E', expected: EXPECTED_TRIALS, recorded: manifest.length, note: 'the repo carries the manifest and digests; complete session transcripts stay external', trials: manifest });

/**
 * §23: ONE representative trace per arm, chosen by a rule stated in advance — the FIRST trial of each
 * scenario/condition in the frozen schedule order — rather than the most flattering one.
 */
if (existsSync(runsDir) && manifest.length > 0) {
  mkdirSync(join(EVIDENCE, 'representative'), { recursive: true });
  for (const scenarioId of SCENARIO_IDS) {
    for (const condition of CONDITIONS) {
      const chosen = manifest.find((entry) => entry.scenario === SCENARIOS[scenarioId].name && entry.condition === condition);
      if (chosen === undefined) continue;
      const transcriptPath = join(runsDir, chosen.trialId, 'out', 'worker-transcript.txt');
      if (!existsSync(transcriptPath)) continue;
      const target = join(EVIDENCE, 'representative', `${chosen.trialId}.txt`);
      /**
       * §23: the trace is SANITIZED before it is committed. A worker transcript is full of absolute world
       * paths, and a committed artifact must not carry this machine's layout. The `sanitize` used for JSON
       * is applied to the text here, so the trace stays readable while the local prefix is replaced.
       */
      writeFileSync(target, sanitize(readFileSync(transcriptPath, 'utf8')), 'utf8');
      process.stdout.write(`wrote ${target.replace(REPO_ROOT, '<repo>')}
`);
    }
  }
}

const pilotDir = join(CALIBRATION_RIG, 'runs');
if (existsSync(pilotDir)) {
  const pilotRecords = [];
  for (const entry of readdirSync(pilotDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const recordPath = join(pilotDir, entry.name, 'out', 'trial.json');
    if (existsSync(recordPath)) pilotRecords.push(JSON.parse(readFileSync(recordPath, 'utf8')));
  }
  writeJson(join(EVIDENCE, 'pilot', 'pilot.json'), { schemaVersion: 1, stage: 'R2-E', note: 'GATE A pilot pairs; these do NOT count among the 20 primary trials', trials: pilotRecords });
}

/* ---------------------------------------------------------------- normalized + analysis (if present) */

for (const name of ['normalized-results.json', 'analysis.json']) {
  const source = join(RIG, name);
  if (existsSync(source)) writeJson(join(EVIDENCE, name), JSON.parse(readFileSync(source, 'utf8')));
}

process.stdout.write('\nR2-E evidence written to research-evidence/r2-e/\n');
