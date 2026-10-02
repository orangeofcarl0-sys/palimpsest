#!/usr/bin/env node
/**
 * R2-S §26 — WRITE THE EVIDENCE DIRECTORY.
 *
 * The layout mirrors R2-M's: commit the protocol, the frozen schedule, the two exact presentations, the
 * candidate-set provenance, the preview manifest and digests, the normalized trial records, the analysis and
 * the readiness records. Large sanitized raw session artifacts stay outside the repository with digests
 * recorded — but never omit so much that the result becomes unverifiable.
 *
 * Sanitization strips absolute local paths and drops credential-shaped keys outright. Credentials and
 * private reasoning are never captured in the first place.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { INDEX_METADATA_ENV, PREVIEW_BUDGET, PREVIEW_MECHANISM, PROCEDURE_RULING, SEMANTIC_PROVENANCE, MATERIALIZATION_PROVENANCE, TRUNCATION_MARKER } from '../../host/dsh/lib/index-metadata.js';
import { BUNDLE_DOMAIN, BUNDLE_ORIGIN_PROJECT, BUNDLE_IDS, bundleCapital, candidateSetFor } from './candidates.mjs';
import { ARMS, CANDIDATE_SET_SIZE, CONDITIONS, DISTRACTOR_COUNT, DISTRACTOR_POOL, EXPECTED_TRIALS, KINDS, MODE_OF, PROTOCOL_SEED, REPETITIONS, SCENARIO_IDS, SELECTIVITY_VERDICTS, TARGET_BUNDLE, TARGET_COUNT, blockOrder, distractorSchedule } from './design.mjs';
import { SCENARIOS } from '../r2u/scenarios.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const EVIDENCE = join(REPO_ROOT, 'research-evidence', 'r2-s');
const RIG = join(homedir(), '.palimpsest-r2s', 'matrix');
const READINESS_RIG = join(homedir(), '.palimpsest-r2s', 'readiness');
const COMPILE_RIG = join(homedir(), '.palimpsest-r2s', 'readiness-compile');

function sanitize(value) {
  if (typeof value === 'string') {
    return value
      .replace(/[A-Za-z]:\\+Users\\+[^\\/\s"]+/gu, '<home>')
      .replace(/[A-Za-z]:\\+[^"\s]*/gu, (match) => (match.includes('.palimpsest-r2s') ? '<rig>' : '<abs>'))
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
  stage: 'R2-S',
  title: 'Capital Selectivity under Choice Pressure',
  startingHead: '42b0025b47ec2daba108370fb1a4300997caa7c2',
  branch: 'r2-s-capital-selectivity',
  priorStage: {
    stage: 'R2-M',
    verdict: 'NOT_IMPROVED',
    inferentialStatus: 'NON_DISCRIMINATING_DUE_TO_CONTROL_CEILING',
    frozenEmpiricalFact: 'a visible opaque 3-handle selected index produced 20/20 voluntary pull within the tested scope (M0 20/20, M1 20/20)',
  },
  design: {
    kind: '2-condition randomized blocks; a BROAD preselected candidate set of 6 items (3 TARGET + 3 DISTRACTOR) is identical in both arms; only the index presentation differs',
    conditions: [...CONDITIONS],
    arms: ARMS,
    modeOf: MODE_OF,
    repetitions: REPETITIONS,
    scenarios: [...SCENARIO_IDS],
    expectedTrials: EXPECTED_TRIALS,
    seed: `0x${PROTOCOL_SEED.toString(16)}`,
    blockOrder: SCENARIO_IDS.map((id) => ({ scenario: id, blocks: blockOrder(REPETITIONS, id) })),
    candidateSetSize: CANDIDATE_SET_SIZE,
    targetCount: TARGET_COUNT,
    distractorCount: DISTRACTOR_COUNT,
    targetBundle: TARGET_BUNDLE,
    distractorPool: DISTRACTOR_POOL,
    distractorSchedule: SCENARIO_IDS.map((id) => ({ scenario: id, blocks: distractorSchedule(id, REPETITIONS) })),
    noPullBudget: '§18: NO hard pull budget. No `max pulls = 3` or any artificial cap is imposed; that would change the capability policy and force selection mechanically. R2-S measures natural model selectivity.',
  },
  indexMechanism: {
    mechanism: PREVIEW_MECHANISM,
    envVar: INDEX_METADATA_ENV,
    note: 'S0 and S1 map onto the already-frozen R2-M presentation modes (m0/m1). The experimental renderer is the ONLY host change; the production default stays off.',
    timing: 'the S1 derivation runs before the first engineering turn exists; its pulls are subtracted from the worker pull telemetry so a derivation pull can never count as a voluntary pull',
  },
  duplicateHandleFix: {
    problem: 'the R2-M M1 renderer emitted a trailing `Handle: <handle>` line, so an M1 entry named its handle twice while an M0 entry named it once (M0 occurrences = 3, M1 = 6). That is a confound for any experiment whose outcome is WHICH handles are retrieved.',
    correction: 'the trailing line is removed; every selected handle now appears exactly once in BOTH arms',
    scope: 'experimental renderer only — no canonical Context change, no production semantic change',
  },
  projectionAlgorithm: {
    steps: ['take the existing canonical human-readable content field', 'normalize CRLF to LF', 'trim outer whitespace only', 'retain the first N Unicode code points', 'if truncated, append one fixed marker'],
    marker: TRUNCATION_MARKER,
    budget: PREVIEW_BUDGET,
    procedureRuling: PROCEDURE_RULING,
    noNewTuning: '§12: the projection is UNCHANGED from R2-M. No preview algorithm was changed based on R2-M results. The only renderer correction is the removal of the duplicate handle occurrence.',
  },
  provenance: {
    semanticProvenance: SEMANTIC_PROVENANCE,
    materializationProvenance: MATERIALIZATION_PROVENANCE,
    note: 'Procedure applicability/limitations are OWNER-DECLARED fields that still require governed body materialization. Proof/Reasoning previews are HOST-PROJECTED from owner content. The two remain distinguishable.',
  },
  primaryMetric: 'S1 distractor pull rate < S0 distractor pull rate, WITH S1 target recall >= S0 target recall',
  primaryOutcomes: ['Target Recall = target_pulls / 3', 'Distractor Pull Rate = distractor_pulls / 3'],
  descriptiveOutcomes: ['Pull Precision = target_pulls / total_pulls (UNKNOWN when nothing was pulled)'],
  secondaryMetrics: ['pull order', 'first target pull ordinal', 'first distractor pull ordinal', 'targets/distractors pulled before first edit', 'elapsed time', 'first-candidate hidden acceptance', 'final hidden acceptance', 'known-failure recurrence'],
  taskSuccessIsSecondary: '§21: the verdict is about routing/selectivity. A task outcome difference is recorded and NEVER consulted by the verdict.',
  preDeclaredVerdicts: [SELECTIVITY_VERDICTS.REPLICATED, SELECTIVITY_VERDICTS.PARTIAL, SELECTIVITY_VERDICTS.NOT_IMPROVED],
  verdictCriteria: {
    REPLICATED: "BOTH scenarios: S1's distractor pull rate is strictly lower than S0's, S1's target recall is >= S0's, and actual target retrieval remains non-zero in S1",
    PARTIAL: 'exactly one scenario clearly satisfies the criterion, or both show weak/noisy directional selectivity improvement',
    NOT_IMPROVED: 'neither scenario improves selective retrieval',
  },
  scopeLimits: [
    'the six items form a deliberately BROAD PRESELECTED candidate set. This does NOT model perfect principal selection: it models upstream selection having narrowed the universe without perfectly identifying which capital will matter to this particular implementation.',
    'the two "ordering-first" bundles (C and D) are structurally related, so "distractor" means "independent, different-domain, not this task\'s method" rather than "provably useless". The B bundle is a genuinely different domain.',
    'the production compiler orders the index by content-addressed identity, which the harness may not change. The only lawful order lever is WHICH distractors are selected, so the order varies across blocks and is identical across the S0/S1 pair within a block.',
    'single model profile (deepseek-flash). No cross-model replication in this stage.',
  ],
  frozenPriorEvidence: {
    r1r: { trials: 30, governedPulls: '0/30', corrected: 'NOT EVALUABLE — model-visible index not delivered' },
    r2u: { trials: 40, verdict: 'NOT_IMPROVED', corrected: 'NOT EVALUABLE — model-visible index not delivered' },
    r2e: { trials: 20, verdict: 'REPLICATED', mechanism: 'HOST_MEDIATED_PREWORK' },
    r2m: { trials: 20, verdict: 'NOT_IMPROVED', ceiling: 'M0 20/20 and M1 20/20 — no headroom' },
  },
});

/* ---------------------------------------------------------------- the exact presentations */

mkdirSync(EVIDENCE, { recursive: true });
writeFileSync(
  join(EVIDENCE, 'presentations.txt'),
  [
    'R2-S — THE TWO BROAD-INDEX PRESENTATIONS (six entries)',
    '',
    'S0 is the CURRENT PRODUCTION INDEX, byte-identical, over six selected handles:',
    '',
    '  Project context available to this attempt (READ-ONLY; never authority):',
    '    [proof] @ctx/proof/<claimId>',
    '    [proof] @ctx/proof/<claimId>',
    '    [reasoning] @ctx/reasoning/<cellId>/<claimId>',
    '    [reasoning] @ctx/reasoning/<cellId>/<claimId>',
    '    [procedure] @ctx/procedure/<procedureId>/<revision>',
    '    [procedure] @ctx/procedure/<procedureId>/<revision>',
    '',
    '  Use `palimpsest_worker_context_pull` with exactly one listed handle when the body would help.',
    '  Do not invent handles: a handle that is not listed above will be refused.',
    '',
    'S1 keeps the SAME heading, the SAME order and the SAME two trailing instruction lines, and replaces',
    'ONLY the entry lines with the derived block below. Each entry names its handle EXACTLY ONCE:',
    '',
    '  [proof] @ctx/proof/<claimId>',
    '    Standing at compile: <owner value>',
    '    Freshness: <owner value>',
    '    Selected for this attempt: true',
    '    Preview: <bounded deterministic projection of the claim statement>',
    '',
    '  [reasoning] @ctx/reasoning/<cellId>/<claimId>',
    '    Active at compile: <owner value>',
    '    Selected for this attempt: true',
    '    Preview: <bounded deterministic projection of the admitted claim statement>',
    '',
    '  [procedure] @ctx/procedure/<procedureId>/<revision>',
    '    Standing at compile: <owner value>',
    '    Revision: <owner value>',
    '    Selected for this attempt: true',
    '    Applicability: <owner-declared applicability, bounded>',
    '    Limitations: <owner-declared limitations, bounded>',
    '',
    `The Procedure ruling is ${PROCEDURE_RULING}: applicability + limitations only, with NO method-body preview.`,
    '',
    'THE §5 CORRECTION: the R2-M M1 block ended with a redundant `    Handle: <handle>` line. It is REMOVED,',
    'so each selected handle appears exactly once in BOTH arms and the only difference between S0 and S1 is',
    'the metadata bytes.',
    '',
    'S1 carries NO new review clause and NO rewritten context-pull tool description (§9/§12).',
    '',
  ].join(String.fromCharCode(10)),
  'utf8',
);
process.stdout.write(`wrote ${join(EVIDENCE, 'presentations.txt').replace(REPO_ROOT, '<repo>')}\n`);

/* ---------------------------------------------------------------- candidate-set provenance */

writeJson(join(EVIDENCE, 'candidate-sets.json'), {
  schemaVersion: 1,
  stage: 'R2-S',
  note: '§6/§7: the broad candidate set per (scenario, block). TARGET is the scenario\'s OWN prior-generation bundle; DISTRACTOR is an independent, valid, mature bundle from a DIFFERENT domain, associated with the experimental project through the same public API the target uses.',
  bundleProvenance: BUNDLE_IDS.map((bundleId) => ({ bundleId, domain: BUNDLE_DOMAIN[bundleId], originProject: BUNDLE_ORIGIN_PROJECT[bundleId], proofStatementChars: [...bundleCapital(bundleId).proof.statement].length, reasoningStatementChars: [...bundleCapital(bundleId).reasoning.statement].length, procedureClauses: bundleCapital(bundleId).procedureClauses.length })),
  projectAssociation: 'ProjectWorkspace.associateAsset({ associationKind: "MANUAL" }) — the existing, legitimate, harness-only association path. No canonical semantic change; project-scope enforcement is satisfied, not bypassed.',
  sets: SCENARIO_IDS.flatMap((scenarioId) => distractorSchedule(scenarioId, REPETITIONS).map((entry) => {
    const set = candidateSetFor(scenarioId, entry.set);
    return { scenarioId, scenarioName: SCENARIOS[scenarioId].name, block: entry.block, targetBundleId: set.targetBundleId, distractorBundles: [...set.distractorBundles], items: set.items.map((item) => ({ role: item.role, kind: item.kind, bundleId: item.bundleId, domain: item.domain })) };
  })),
});

/* ---------------------------------------------------------------- readiness records */

for (const [label, source] of [['gate-a.json', join(READINESS_RIG, 'readiness.json')], ['compile-readiness.json', join(COMPILE_RIG, 'compile-readiness.json')]]) {
  if (existsSync(source)) writeJson(join(EVIDENCE, label), JSON.parse(readFileSync(source, 'utf8')));
}

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
      outcome: record.outcome,
      treatmentApplied: record.treatmentApplied,
      indexPrecondition: record.indexPrecondition,
      handleOccurrenceExact: record.handleOccurrenceExact,
      candidateSet: record.candidateSet === undefined ? null : { targetBundleId: record.candidateSet.targetBundleId, distractorBundles: record.candidateSet.distractorBundles },
      realizedOrder: record.realizedOrder,
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
writeJson(join(EVIDENCE, 'trial-manifest.json'), { schemaVersion: 1, stage: 'R2-S', expected: EXPECTED_TRIALS, recorded: manifest.length, note: 'the repo carries the manifest and digests; complete session transcripts stay external', trials: manifest });

/** ONE representative trace per arm, chosen by a rule stated in advance — the FIRST trial of each scenario/condition in the frozen schedule order. */
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

/* ---------------------------------------------------------------- normalized + analysis */

for (const name of ['normalized-results.json', 'analysis.json', 'preview-manifest.json']) {
  const source = join(RIG, name);
  if (existsSync(source)) writeJson(join(EVIDENCE, name), JSON.parse(readFileSync(source, 'utf8')));
}

process.stdout.write('\nR2-S evidence written to research-evidence/r2-s/\n');
