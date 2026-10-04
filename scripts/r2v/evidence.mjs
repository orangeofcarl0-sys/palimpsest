#!/usr/bin/env node
/**
 * R2-V §20 — WRITE THE EVIDENCE DIRECTORY.
 *
 * The layout mirrors the prior R2 stages: commit the protocol, the four arm definitions, the frozen
 * schedule, the bundle provenance with body digests, the normalized trial records, the analysis and the
 * readiness records. Large sanitized raw session artifacts stay outside the repository with digests
 * recorded — but never omit so much that the result becomes unverifiable.
 *
 * Sanitization strips absolute local paths and drops credential-shaped keys outright.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { ARMS, ADDED_BUNDLES, CONDITIONS, CONSUMPTION_MECHANISM, EXPECTED_TRIALS, PROTOCOL_SEED, REPETITIONS, SCENARIO_IDS, UTILITY_CLASSIFICATIONS, blockOrder } from './design.mjs';
import { BUNDLE_DOMAIN, BUNDLE_IDS, BUNDLE_ORIGIN_PROJECT, bundleCapital } from '../r2s/candidates.mjs';
import { SCENARIOS } from '../r2u/scenarios.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const EVIDENCE = join(REPO_ROOT, 'research-evidence', 'r2-v');
const RIG = join(homedir(), '.palimpsest-r2v', 'matrix');
const READINESS_RIG = join(homedir(), '.palimpsest-r2v', 'readiness');

function sanitize(value) {
  if (typeof value === 'string') {
    return value
      .replace(/[A-Za-z]:\\+Users\\+[^\\/\s"]+/gu, '<home>')
      .replace(/[A-Za-z]:\\+[^"\s]*/gu, (match) => (match.includes('.palimpsest-r2v') ? '<rig>' : '<abs>'))
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
  stage: 'R2-V',
  title: 'Utility-Calibrated Capital Value',
  startingHead: 'bcfae7efcb217b300623706216a637a124b97a64',
  branch: 'r2-v-utility-calibration',
  mission: 'Does the experiment\'s TARGET / DISTRACTOR labelling correspond to ACTUAL marginal task utility?',
  notAnUptakeStage: 'R2-V removes voluntary retrieval from the causal question entirely (§8). Every arm runs under HOST-MEDIATED consumption, so there is no optional choice to make.',
  notASelectivityStage: 'R2-S established routing; R2-V asks about utility. R2-V does not relabel R2-S\'s provenance labels (§17); it adds empirical utility as a new axis.',
  design: {
    kind: '4-arm randomized blocks on Scenario D; the consumed bundle SET is the only variable',
    scenario: 'D (the primary utility-calibration scenario, per §6)',
    arms: Object.fromEntries(CONDITIONS.map((id) => [id, { bundles: [...ARMS[id].bundles], added: [...(ADDED_BUNDLES[id] ?? [])], label: ARMS[id].label }])),
    repetitions: REPETITIONS,
    expectedTrials: EXPECTED_TRIALS,
    seed: `0x${PROTOCOL_SEED.toString(16)}`,
    blockOrder: SCENARIO_IDS.map((id) => ({ scenario: id, blocks: blockOrder(REPETITIONS, id) })),
    randomizedBlocksContainAllArms: true,
    noAdaptiveStopping: true,
    noBehaviouralPilotOnD: '§10: only dummy-fixture plumbing proof; no stochastic D pilot',
  },
  consumptionMechanism: {
    mechanism: CONSUMPTION_MECHANISM,
    envVar: 'PALIMPSEST_R2E_EFFICACY',
    note: '§8 reuses the R2-E host-mediated prework seam VERBATIM. The host invokes the SAME attempt-bound resolver on the selected handles before the first engineering turn and renders the bodies into the labelled section. No second fetch path, no direct backing-store read, no global asset lookup, no authority widening.',
    why: '§8 removes voluntary retrieval from the causal question so the comparison is about marginal UTILITY, not routing.',
  },
  kindSplittingDeferred: '§9: the arms add WHOLE bundles. R2-E already established bundle-level efficacy; R2-V first asks whether the supposedly distractor B/C bundles have positive, zero or negative marginal value on top of D. Splitting Proof/Reasoning/Procedure is a later stage, permitted only if a bundle shows a stable marginal effect.',
  primaryOutcomes: ['first-candidate hidden acceptance', 'final hidden acceptance', 'known-failure recurrence'],
  secondaryOutcomes: ['visible-oracle invocations', 'implementation revisions', 'elapsed time', 'actions before first edit'],
  groundTruth: '§13: the hidden acceptance module and the behavioural known-failure detector. Model self-report is NEVER utility ground truth.',
  marginalComparisons: ['B marginal value: V1 vs V0', 'C marginal value: V2 vs V0', 'B+C combined: V3 vs V0'],
  noFakeStatistics: '§14: no p-values at n = 5. Raw counts and direction only.',
  utilityClassifications: [UTILITY_CLASSIFICATIONS.POSITIVE_SIGNAL, UTILITY_CLASSIFICATIONS.NO_CLEAR_SIGNAL, UTILITY_CLASSIFICATIONS.ADVERSE_SIGNAL],
  classificationScope: '§15: n = 5 per arm. These are descriptive signals about the tested scope, not universal classifications and not a binary useful/useless.',
  hostPrefetchCostCaveat: '§18: R2-S\'s metadata preview required host-side body materialization for all candidate items, so R2-S did NOT establish owner-side retrieval-cost savings. R2-V does not solve that problem and claims no end-to-end cost benefit.',
  frozenPriorEvidence: {
    r2e: { verdict: 'REPLICATED', mechanism: 'HOST_MEDIATED_PREWORK', note: 'bundle-level efficacy of D + Proof/Reasoning/Procedure against no capital' },
    r2s: { verdict: 'REPLICATED', note: 'metadata improved selectivity against predeclared provenance labels; D S0 3/5 vs S1 0/5 solved, too small and secondary to support a harm claim' },
  },
});

/* ---------------------------------------------------------------- the four arms, with body digests */

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
writeJson(join(EVIDENCE, 'arms.json'), {
  schemaVersion: 1,
  stage: 'R2-V',
  note: '§11: across all four arms the task, repo, visible tests, hidden oracle, model/profile, runtime, tool surface, authority and write scope are IDENTICAL. Only the consumed bundle SET differs. Body digests are recorded per arm so a reader can prove the intended bodies were the ones delivered.',
  bundleProvenance: BUNDLE_IDS.map((bundleId) => ({
    bundleId,
    domain: BUNDLE_DOMAIN[bundleId],
    originProject: BUNDLE_ORIGIN_PROJECT[bundleId],
    proofStatementDigest: sha256(bundleCapital(bundleId).proof.statement),
    reasoningStatementDigest: sha256(bundleCapital(bundleId).reasoning.statement),
    procedureClauseCount: bundleCapital(bundleId).procedureClauses.length,
    procedureClausesDigest: sha256(JSON.stringify(bundleCapital(bundleId).procedureClauses.map((clause) => clause.instruction))),
  })),
  arms: CONDITIONS.map((id) => ({
    arm: id,
    bundles: [...ARMS[id].bundles],
    addedBundles: [...(ADDED_BUNDLES[id] ?? [])],
    /** The exact bodies this arm is intended to consume, by digest — never the body text. */
    intendedBodyDigests: ARMS[id].bundles.flatMap((bundleId) => [
      { bundleId, kind: 'proof', digest: sha256(bundleCapital(bundleId).proof.statement) },
      { bundleId, kind: 'reasoning', digest: sha256(bundleCapital(bundleId).reasoning.statement) },
      { bundleId, kind: 'procedure', digest: sha256(JSON.stringify(bundleCapital(bundleId).procedureClauses.map((clause) => clause.instruction))) },
    ]),
  })),
});

/* ---------------------------------------------------------------- the frozen Scenario-D identity */

writeJson(join(EVIDENCE, 'scenario-d-identity.json'), {
  schemaVersion: 1,
  stage: 'R2-V',
  note: '§6: the Scenario-D identity is byte-frozen and NOT tuned. The task, repo, visible tests, hidden oracle, known-failure detector and target D capital are unchanged from R2-S.',
  scenario: { id: SCENARIOS.D.id, name: SCENARIOS.D.name, projectId: SCENARIOS.D.projectId, sourceFile: SCENARIOS.D.sourceFile, exportName: SCENARIOS.D.exportName, taskObjective: SCENARIOS.D.taskObjective, projectGoal: SCENARIOS.D.projectGoal, knownFailure: SCENARIOS.D.knownFailure, knownFailureDetector: SCENARIOS.D.knownFailureDetector, oracleCommand: [...SCENARIOS.D.oracleCommand] },
  targetBundle: 'D',
  unchangedFrom: 'bcfae7efcb217b300623706216a637a124b97a64',
});

/* ---------------------------------------------------------------- readiness */

for (const [label, source] of [['gate-a.json', join(READINESS_RIG, 'readiness.json')]]) {
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
      consumedBundles: record.consumedBundles,
      consumptionProven: record.consumptionProven,
      consumptionEvidence: record.consumptionEvidence,
      finalAcceptance: record.finalAcceptance,
      firstCandidateAcceptance: record.firstCandidateAcceptance,
      knownFailureRecurred: record.knownFailureFinal?.recurred ?? 'UNKNOWN',
      visibleOracleInvocations: record.visibleOracleInvocations,
      implementationRevisions: record.implementationRevisions,
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
writeJson(join(EVIDENCE, 'trial-manifest.json'), { schemaVersion: 1, stage: 'R2-V', expected: EXPECTED_TRIALS, recorded: manifest.length, note: 'the repo carries the manifest and digests; complete session transcripts stay external', trials: manifest });

/** ONE representative trace per arm, chosen by a rule stated in advance — the FIRST trial of each arm in the frozen schedule order. */
if (existsSync(runsDir) && manifest.length > 0) {
  mkdirSync(join(EVIDENCE, 'representative'), { recursive: true });
  for (const condition of CONDITIONS) {
    const chosen = manifest.find((entry) => entry.condition === condition);
    if (chosen === undefined) continue;
    const transcriptPath = join(runsDir, chosen.trialId, 'out', 'worker-transcript.txt');
    if (!existsSync(transcriptPath)) continue;
    const target = join(EVIDENCE, 'representative', `${chosen.trialId}.txt`);
    writeFileSync(target, sanitize(readFileSync(transcriptPath, 'utf8')), 'utf8');
    process.stdout.write(`wrote ${target.replace(REPO_ROOT, '<repo>')}\n`);
  }
}

/* ---------------------------------------------------------------- normalized + analysis */

for (const name of ['normalized-results.json', 'analysis.json']) {
  const source = join(RIG, name);
  if (existsSync(source)) writeJson(join(EVIDENCE, name), JSON.parse(readFileSync(source, 'utf8')));
}

process.stdout.write('\nR2-V evidence written to research-evidence/r2-v/\n');
