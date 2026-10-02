#!/usr/bin/env node
/**
 * R2-M §31 — WRITE THE EVIDENCE DIRECTORY.
 *
 * §31 fixes the layout and, just as importantly, the VOLUME: commit the protocol, the frozen schedule, the
 * preview manifest and digests, the normalized trial records, the analysis, representative traces and the
 * regression evidence. Large sanitized raw session artifacts may stay outside the repository with
 * cryptographic digests recorded — but never omit so much that the result becomes unverifiable.
 *
 * §31 also requires SANITIZATION of absolute paths and secrets. Credentials and private reasoning are never
 * captured in the first place: the trial harness records observable fields only, and the worker's own
 * summary is its self-report, not its chain-of-thought.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { INDEX_METADATA_ENV, PREVIEW_BUDGET, PREVIEW_MECHANISM, PROCEDURE_RULING, SEMANTIC_PROVENANCE, MATERIALIZATION_PROVENANCE, TRUNCATION_MARKER } from '../../host/dsh/lib/index-metadata.js';
import { deriveCapital } from '../r2u/capital.mjs';
import { ARMS, CONDITIONS, DECISION_RELEVANCE_VERDICTS, EXPECTED_TRIALS, PROTOCOL_SEED, REPETITIONS, SCENARIO_IDS, blockOrder } from './design.mjs';
import { SCENARIOS } from '../r2u/scenarios.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const EVIDENCE = join(REPO_ROOT, 'research-evidence', 'r2-m');
const RIG = join(homedir(), '.palimpsest-r2m', 'matrix');
const PILOT_RIG = join(homedir(), '.palimpsest-r2m', 'pilot');

/** §31: strip absolute local paths. Credential-shaped keys are dropped outright rather than sanitized. */
function sanitize(value) {
  if (typeof value === 'string') {
    return value
      .replace(/[A-Za-z]:\\+Users\\+[^\\/\s"]+/gu, '<home>')
      .replace(/[A-Za-z]:\\+[^"\s]*/gu, (match) => (match.includes('.palimpsest-r2m') ? '<rig>' : '<abs>'))
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
  stage: 'R2-M',
  title: 'Decision-Relevant Capital Index',
  startingHead: 'adf16152bd9c1183db18b89bd80e4b1ceb94dab0',
  branch: 'r2-m-decision-relevant-index',
  design: {
    kind: '2-condition randomized blocks, capital-present in BOTH arms; the index presentation is the only variable',
    conditions: [...CONDITIONS],
    arms: ARMS,
    repetitions: REPETITIONS,
    scenarios: [...SCENARIO_IDS],
    expectedTrials: EXPECTED_TRIALS,
    seed: `0x${PROTOCOL_SEED.toString(16)}`,
    blockOrder: SCENARIO_IDS.map((id) => ({ scenario: id, blocks: blockOrder(REPETITIONS, id) })),
    everyTrialCapitalPresent: true,
  },
  indexMechanism: {
    mechanism: PREVIEW_MECHANISM,
    envVar: INDEX_METADATA_ENV,
    channel: 'the worker-local pull tool and the SAME parent resolver (AllowedPullHandles + attempt-bound fetchContext) R2-E proved; no second fetch path, no direct backing-store read, no global asset lookup',
    timing: 'the M1 derivation runs before the first engineering turn exists; its pulls are subtracted from the worker pull telemetry so a derivation pull can never count as voluntary uptake',
  },
  projectionAlgorithm: {
    steps: ['take the existing canonical human-readable content field', 'normalize CRLF to LF', 'trim outer whitespace only', 'retain the first N Unicode code points', 'if truncated, append one fixed marker'],
    marker: TRUNCATION_MARKER,
    budget: PREVIEW_BUDGET,
    forbidden: ['summarize', 'extract important sentences', 'rank clauses', 'select keywords', 'ask an LLM', 'scenario-specific regex', 'reorder'],
    procedureRuling: PROCEDURE_RULING,
  },
  provenance: {
    semanticProvenance: SEMANTIC_PROVENANCE,
    materializationProvenance: MATERIALIZATION_PROVENANCE,
    note: 'Procedure applicability/limitations are OWNER-DECLARED fields, but they live inside revision.content, so they still require governed body materialization. Proof/Reasoning previews are HOST-PROJECTED from owner content. The two must remain distinguishable in analysis.',
  },
  primaryMetric: 'P(any governed pull | selected capital) per arm, per scenario',
  secondaryMetrics: ['time to first pull', 'observable actions before first pull', 'pull before first edit', 'pull before first visible test', 'kind(s) pulled', 'task efficacy association'],
  preDeclaredVerdicts: [DECISION_RELEVANCE_VERDICTS.REPLICATED, DECISION_RELEVANCE_VERDICTS.PARTIAL, DECISION_RELEVANCE_VERDICTS.NOT_IMPROVED],
  verdictCriteria: {
    REPLICATED: "both scenarios: M1's governed-pull rate is strictly greater than M0's, with at least one actual M1 pull in each scenario",
    PARTIAL: 'exactly one scenario clearly increases, or both show weak/noisy directional improvement',
    NOT_IMPROVED: 'neither scenario shows increased voluntary governed uptake',
  },
  notAnEfficacyStage: 'R2-M does not test whether capital helps when consumed; R2-E established that within its scope. R2-M tests whether decision-relevant presentation increases VOLUNTARY governed uptake.',
  frozenPriorEvidence: {
    r1r: { trials: 30, capitalAvailable: true, governedPulls: '0/30' },
    r2u: { trials: 40, verdict: 'NOT_IMPROVED', governedPulls: '1/40', capitalPresentPulls: '1/20', explicitReviewCapitalPresentPulls: '0/10' },
    r2e: { trials: 20, verdict: 'REPLICATED', mechanism: 'HOST_MEDIATED_PREWORK', note: 'guaranteed consumption, not voluntary; the bundle (Proof+Reasoning+Procedure) was compared against no capital, so this is not a Procedure marginal-efficacy result' },
  },
  indexHypothesis: {
    id: 'H-index',
    statement: 'kind + opaque identity + handle does not provide enough expected-value information for a worker to decide that pull is worth its cost',
    status: 'UNDER TEST IN THIS STAGE — M0 is the opaque index, M1 adds owner-grounded decision metadata',
  },
  noEfficacyCausalClaim: 'pullers are self-selected and not randomized, so any pulled-vs-not-pulled task difference is an association only',
});

/* ---------------------------------------------------------------- the exact presentations */

mkdirSync(EVIDENCE, { recursive: true });
writeFileSync(
  join(EVIDENCE, 'presentations.txt'),
  [
    'R2-M — THE TWO INDEX PRESENTATIONS',
    '',
    'M0 is the CURRENT PRODUCTION INDEX, byte-identical:',
    '',
    '  Project context available to this attempt (READ-ONLY; never authority):',
    '    [proof] @ctx/proof/<claimId>',
    '    [reasoning] @ctx/reasoning/<cellId>/<claimId>',
    '    [procedure] @ctx/procedure/<procedureId>/<revision>',
    '',
    '  Use `palimpsest_worker_context_pull` with exactly one listed handle when the body would help.',
    '  Do not invent handles: a handle that is not listed above will be refused.',
    '',
    'M1 keeps the SAME heading, the SAME empty-case line and the SAME two trailing instruction lines,',
    'and replaces ONLY the entry lines with the derived block below.',
    '',
    '  [proof] @ctx/proof/<claimId>',
    '    Standing at compile: <owner value>',
    '    Freshness: <owner value>',
    '    Selected for this attempt: true',
    '    Preview: <bounded deterministic projection of the claim statement>',
    '    Handle: @ctx/proof/<claimId>',
    '',
    '  [reasoning] @ctx/reasoning/<cellId>/<claimId>',
    '    Active at compile: <owner value>',
    '    Selected for this attempt: true',
    '    Preview: <bounded deterministic projection of the admitted claim statement>',
    '    Handle: @ctx/reasoning/<cellId>/<claimId>',
    '',
    '  [procedure] @ctx/procedure/<procedureId>/<revision>',
    '    Standing at compile: <owner value>',
    '    Revision: <owner value>',
    '    Selected for this attempt: true',
    '    Applicability: <owner-declared applicability, bounded>',
    '    Limitations: <owner-declared limitations, bounded>',
    '    Handle: @ctx/procedure/<procedureId>/<revision>',
    '',
    `The Procedure ruling is ${PROCEDURE_RULING}: applicability + limitations only, with NO method-body preview.`,
    '',
    'M1 carries NO new review clause and NO rewritten context-pull tool description: R2-U already',
    'measured prose affordance and found it NOT_IMPROVED, so re-introducing it would confound the',
    'metadata treatment.',
    '',
  ].join(String.fromCharCode(10)),
  'utf8',
);
process.stdout.write(`wrote ${join(EVIDENCE, 'presentations.txt').replace(REPO_ROOT, '<repo>')}\n`);

/* ---------------------------------------------------------------- scenario-d/ (unchanged, for reference) */

const capital = deriveCapital().D;
writeJson(join(EVIDENCE, 'scenario-d', 'capital.json'), {
  schemaVersion: 1,
  scenario: 'D',
  note: 'UNCHANGED from R2-U/R2-E. Recorded here so a reader can see the source content the M1 previews project from.',
  proof: capital.proof,
  reasoning: capital.reasoning,
  procedureClauses: capital.procedureClauses,
  procedureApplicability: [SCENARIOS.D.projectGoal],
  procedureLimitations: ['does not authorize any command, path or effect beyond the task envelope', 'advisory guidance only; it cannot widen write scope or allowed commands'],
});

/* ---------------------------------------------------------------- the manifest + traces */

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
      indexArm: record.indexArm,
      pulledHandles: record.worker?.pulledHandles ?? [],
      pulledKinds: record.worker?.pulledKinds ?? [],
      treatmentApplied: record.treatmentApplied,
      indexPrecondition: record.indexPrecondition,
      pullAccounting: record.pullAccounting,
      finalAcceptance: record.finalAcceptance,
      firstCandidateAcceptance: record.firstCandidateAcceptance,
      knownFailureRecurred: record.knownFailureFinal?.recurred ?? 'UNKNOWN',
      hostFailure: record.hostFailure === null ? null : 'HOST_FAILURE',
      elapsedMs: record.elapsedMs,
      indexPresentationDigest: record.prompt?.indexPresentationDigest ?? 'ABSENT',
      productionIndexDigest: record.prompt?.productionIndexDigest ?? 'ABSENT',
      digests: {
        trialRecord: sha256Of(recordPath),
        transcript: existsSync(transcriptPath) ? sha256Of(transcriptPath) : 'ABSENT',
        finalSource: existsSync(join(dir, 'out', 'final-source.txt')) ? sha256Of(join(dir, 'out', 'final-source.txt')) : 'ABSENT',
      },
    });
  }
}
writeJson(join(EVIDENCE, 'trial-manifest.json'), { schemaVersion: 1, stage: 'R2-M', expected: EXPECTED_TRIALS, recorded: manifest.length, note: 'the repo carries the manifest and digests; complete session transcripts stay external', trials: manifest });

/**
 * §31: ONE representative trace per arm, chosen by a rule stated in advance — the FIRST trial of each
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
      writeFileSync(target, sanitize(readFileSync(transcriptPath, 'utf8')), 'utf8');
      process.stdout.write(`wrote ${target.replace(REPO_ROOT, '<repo>')}\n`);
    }
  }
}

const pilotDir = join(PILOT_RIG, 'runs');
if (existsSync(pilotDir)) {
  const pilotRecords = [];
  for (const entry of readdirSync(pilotDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const recordPath = join(pilotDir, entry.name, 'out', 'trial.json');
    if (existsSync(recordPath)) pilotRecords.push(JSON.parse(readFileSync(recordPath, 'utf8')));
  }
  writeJson(join(EVIDENCE, 'pilot', 'pilot.json'), { schemaVersion: 1, stage: 'R2-M', note: 'GATE A pilot pairs; these do NOT count among the 20 primary trials', trials: pilotRecords });
}

/* ---------------------------------------------------------------- normalized + analysis (if present) */

for (const name of ['normalized-results.json', 'analysis.json', 'preview-manifest.json']) {
  const source = join(RIG, name);
  if (existsSync(source)) writeJson(join(EVIDENCE, name), JSON.parse(readFileSync(source, 'utf8')));
}

process.stdout.write('\nR2-M evidence written to research-evidence/r2-m/\n');
