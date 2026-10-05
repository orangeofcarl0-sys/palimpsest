#!/usr/bin/env node
/**
 * R2-V §11/§12/§13/§14/§15/§16 — NORMALIZE, CHECK ISOLATION, ANALYSE, AND WRITE THE EVIDENCE.
 *
 * §13 requires the primary utility outcomes (first-candidate acceptance, final acceptance, known-failure
 * recurrence) and the secondary effort outcomes. §14 requires the marginal comparisons `V1 vs V0`,
 * `V2 vs V0`, `V3 vs V0` as RAW COUNTS AND DIRECTION — no fake p-values at n = 5. §15 requires the
 * descriptive classification. §16 requires the comparison against R2-S's retrieval behaviour.
 *
 * §11: THE ISOLATION PROOF. Within every randomized block the task, tool catalog, capabilities and paired
 * state must be EQUAL across the four arms; only the consumed bundle set may DIFFER.
 *
 * §12: A TRIAL WHOSE CONSUMPTION WAS NOT PROVEN IS INVALID and is excluded from the analysis while remaining
 * in the raw evidence.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { ADDED_BUNDLES, analyseUtility, ARMS, armUtility, CONDITIONS, EXPECTED_TRIALS, SCENARIO_IDS } from './design.mjs';
import { PAIRED_STATE_COMPARABLE_FIELDS, SCENARIOS } from '../r2u/scenarios.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, '').split('=');
  return [key, rest.join('=')];
}));
const RIG = args.get('rig') ?? join(homedir(), '.palimpsest-r2v', 'matrix');
const EXPECTED = Number(args.get('expected') ?? String(EXPECTED_TRIALS));
const EVIDENCE = join(REPO_ROOT, 'research-evidence', 'r2-v');

/** §23 (R2-S): strip absolute local paths. Credential-shaped keys are dropped outright. */
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

/** §13: the pre-registered per-trial outcome list, normalized. */
export function normalizeTrial(record) {
  const prework = record.prework ?? null;
  return Object.freeze({
    trialId: record.trialId,
    scenario: record.scenario,
    condition: record.condition,
    block: record.block,
    repetition: record.repetition,
    consumedBundles: record.consumedBundles ?? [],

    /** §13: PRIMARY utility outcomes. */
    firstCandidatePassed: record.firstCandidateAcceptance?.passed ?? 0,
    firstCandidateTotal: record.firstCandidateAcceptance?.total ?? 0,
    firstCandidateSolved: record.firstCandidateAcceptance?.total > 0 && record.firstCandidateAcceptance.passed === record.firstCandidateAcceptance.total,
    finalAcceptancePassed: record.finalAcceptance?.passed ?? 0,
    finalAcceptanceTotal: record.finalAcceptance?.total ?? 0,
    finalAcceptanceSolved: record.finalAcceptance?.total > 0 && record.finalAcceptance.passed === record.finalAcceptance.total,
    knownFailureRecurred: record.knownFailureFinal?.recurred ?? 'UNKNOWN',
    knownFailureRecurredFirst: record.knownFailureFirst?.recurred ?? 'UNKNOWN',

    /** §13: secondary effort outcomes. */
    visibleOracleInvocations: record.visibleOracleInvocations ?? 'UNKNOWN',
    implementationRevisions: record.implementationRevisions ?? 'UNKNOWN',
    elapsedMs: record.elapsedMs ?? 'UNKNOWN',
    firstEditOrdinal: record.firstEditOrdinal ?? 'UNKNOWN',
    hostFailure: record.hostFailure !== null && record.hostFailure !== undefined,
    timedOut: record.timedOut === true,
    workerOutcomeKind: record.worker?.outcomeKind ?? 'UNKNOWN',

    /** §12: the consumption precondition, proven at the session boundary. */
    consumptionProven: record.consumptionProven === true,
    consumptionPrecondition: record.consumptionPrecondition ?? 'UNKNOWN',
    consumptionEvidence: record.consumptionEvidence ?? null,
    consumedHandleCount: (record.consumedHandles ?? []).length,
    bodyDigests: prework?.digests ?? [],

    /** §11: the pairing components, recorded separately so no single digest masks the treatment. */
    ordinaryTaskDigest: record.prompt?.ordinaryTaskDigest ?? 'UNKNOWN',
    toolCatalogDigest: record.prompt?.toolCatalogDigest ?? 'UNKNOWN',
    capabilitySetDigest: record.prompt?.capabilitySetDigest ?? 'UNKNOWN',
    handlesInPayload: record.prompt?.handlesInPayload ?? [],
    compiledHandleOrder: record.prompt?.compiledHandleOrder ?? [],
    consumedHandles: record.consumedHandles ?? [],
    pairedState: record.pairedState ?? null,
    sessionFound: record.session?.found === true,
    capacity: record.confidentiality?.capacity ?? null,
  });
}

/**
 * §11: THE ISOLATION PROOF. Within every randomized block the invariant components MUST be equal across the
 * four arms, and the consumed bundle set MUST differ across arms.
 */
export function isolationCheck(trials) {
  const byBlock = new Map();
  for (const trial of trials) {
    const key = `${trial.scenario}|${String(trial.block)}`;
    if (!byBlock.has(key)) byBlock.set(key, []);
    byBlock.get(key).push(trial);
  }
  const blocks = [];
  for (const [key, members] of [...byBlock.entries()].sort()) {
    const [scenario, block] = key.split('|');
    const differences = [];
    if (members.length !== CONDITIONS.length) differences.push(`expected ${String(CONDITIONS.length)} arms, found ${String(members.length)}`);
    for (const field of PAIRED_STATE_COMPARABLE_FIELDS) {
      const values = new Set(members.map((trial) => JSON.stringify(trial.pairedState?.[field] ?? null)));
      if (values.size > 1) differences.push(`pairedState.${field} differs across arms`);
    }
    /** §11: what MUST be equal — the components the treatment is not allowed to touch. */
    for (const [label, values] of [
      ['ordinary task text', new Set(members.map((trial) => trial.ordinaryTaskDigest))],
      ['tool catalog', new Set(members.map((trial) => trial.toolCatalogDigest))],
      ['worker capability set', new Set(members.map((trial) => trial.capabilitySetDigest))],
    ]) {
      if (values.size > 1) differences.push(`the ${label} differs across arms`);
    }
    /** §11: the treatment MUST differ — the consumed bundle sets must not collapse to one. */
    const bundleSets = new Set(members.map((trial) => JSON.stringify([...trial.consumedBundles].sort())));
    if (bundleSets.size !== CONDITIONS.length) differences.push(`the consumed bundle sets are not all distinct (${String(bundleSets.size)} of ${String(CONDITIONS.length)})`);
    /** §12: every analysed member must have proven consumption. */
    for (const member of members) {
      if (member.consumptionProven !== true) differences.push(`${member.condition}: consumption was not proven (${member.consumptionPrecondition})`);
      if (member.sessionFound !== true) differences.push(`${member.condition}: no durable session artifact was found, so delivery cannot be proven`);
    }
    blocks.push(Object.freeze({
      scenario,
      block: Number(block),
      conditions: members.map((trial) => trial.condition).sort(),
      confounded: differences.length > 0,
      differences: Object.freeze(differences),
      consumedBundles: members.map((trial) => `${trial.condition}=${trial.consumedBundles.join('+')}`),
      bundleSetsDiffer: bundleSets.size === CONDITIONS.length,
    }));
  }
  return Object.freeze(blocks);
}

const out = (line) => process.stdout.write(`${line}\n`);

/**
 * §16: THE R2-S CALIBRATION.
 *
 * R2-S measured which bundles the metadata arm RETRIEVED and which it SKIPPED, against provenance labels.
 * R2-V measures the bundles' MARGINAL UTILITY. This compares the two axes, and it is deliberately careful:
 *
 *   · R2-S's labels were PROVENANCE labels (same lineage vs independent bundle), predeclared and never
 *     rewritten (§17). R2-V adds a NEW axis, empirical utility; it does not relabel.
 *   · R2-S ran on BOTH scenarios; R2-V ran only on D. So the calibration is restricted to the D evidence,
 *     and that restriction is stated rather than papered over.
 *   · R2-S's TARGET for D was the D bundle, which R2-V holds constant in every arm. So R2-S's skip decision
 *     that R2-V can actually calibrate is the DISTRACTOR skip: it skipped B and C on D.
 */
export function calibrateAgainstR2S(byBundle, r2sAnalysis) {
  const skipped = [];
  const retrieved = [];
  for (const bundleId of ['B', 'C']) {
    const utility = byBundle[bundleId]?.consensus ?? 'UNKNOWN';
    /**
     * In R2-S's Scenario D, S1 pulled every target and skipped the distractors: B and C were BOTH
     * distractors for D, so both were skipped in the S1 arm.
     */
    skipped.push({ bundleId, utility, skippedByR2S: true });
  }
  void retrieved;
  const r2sD = r2sAnalysis?.D ?? null;
  return Object.freeze({
    note: 'R2-S labels were PROVENANCE labels; R2-V adds empirical utility as a new axis and does not rewrite them (§17).',
    scopeRestriction: 'R2-S ran on C and D; R2-V ran on D only, so this calibration uses the D evidence.',
    r2sDRetrieval: r2sD === null ? 'ABSENT' : { S0: { target: r2sD.S0?.targetRecall, distractor: r2sD.S0?.distractorRate }, S1: { target: r2sD.S1?.targetRecall, distractor: r2sD.S1?.distractorRate } },
    skippedByR2S: skipped,
    /** §16: the calibration questions, answered from the two axes. */
    answers: Object.freeze({
      didS1SkipBundlesWithPositiveUtilitySignal: skipped.filter((entry) => entry.utility === 'POSITIVE_SIGNAL').map((entry) => entry.bundleId),
      /**
       * §8 (R2-VR): RENAMED. This list is drawn from the SKIPPED bundles — the implementation has only ever
       * examined `skipped` — so the previous name `didItRetrieveBundlesWithNoClearSignal` described the
       * opposite of what the code does. The value is unchanged; only the name is corrected.
       */
      skippedBundlesWithNoClearSignal: skipped.filter((entry) => entry.utility === 'NO_CLEAR_SIGNAL').map((entry) => entry.bundleId),
      correlation: skipped.every((entry) => entry.utility === 'POSITIVE_SIGNAL')
        ? 'MISCALIBRATED — S1 skipped bundles that showed a positive utility signal'
        : skipped.every((entry) => entry.utility !== 'POSITIVE_SIGNAL')
          ? 'CONSISTENT — the skipped bundles showed no positive utility signal in this tested scope'
          : 'MIXED — some skipped bundles showed a positive signal and some did not',
    }),
    /**
     * §9/§1 (R2-VR): SUPERSEDED ESTIMATOR. The `consensus` this function reads from `byBundle` treated
     * `V3 vs V0` as the marginal effect of B and of C. `V3 vs V0` is the COMBINED treatment effect, so the
     * consensus is not a valid factorial marginal-effect estimator. The corrected contrasts live in
     * `scripts/r2vr/` and `research-evidence/r2-vr/factorial-analysis.json`; this function is left as the
     * historical protocol output it was, with the field name corrected and this note attached.
     */
    estimatorStatus: 'SUPERSEDED_BY_R2VR_FACTORIAL_CONTRASTS',
  });
}

async function main() {
  const matrixPath = join(RIG, 'trials.json');
  if (!existsSync(matrixPath)) throw new Error(`no matrix record at ${matrixPath}; run scripts/r2v/matrix.mjs first`);
  const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'));
  if (matrix.completed !== EXPECTED) {
    throw new Error(`§10: the matrix holds ${String(matrix.completed)} trials, the pre-registered count is ${String(EXPECTED)}; refusing to analyse an incomplete matrix`);
  }

  const normalized = matrix.trials.map(normalizeTrial);
  const blocks = isolationCheck(normalized);
  const confounded = new Set(blocks.filter((block) => block.confounded).map((block) => `${block.scenario}|${String(block.block)}`));
  const analysable = normalized.filter((trial) => !confounded.has(`${trial.scenario}|${String(trial.block)}`));

  const byArm = {};
  for (const condition of CONDITIONS) {
    byArm[condition] = armUtility(analysable.filter((trial) => trial.condition === condition && trial.consumptionProven));
  }
  const utility = analyseUtility(byArm);

  /* -- §16: the R2-S calibration, read from the committed R2-S analysis if it is present -- */
  const r2sPath = join(REPO_ROOT, 'research-evidence', 'r2-s', 'analysis.json');
  /** R2-S records the per-arm tables under a TOP-LEVEL `arms` key, not inside `selectivity`. */
  const r2sAnalysis = existsSync(r2sPath) ? JSON.parse(readFileSync(r2sPath, 'utf8')).arms : null;
  const calibration = calibrateAgainstR2S(utility.byBundle, r2sAnalysis);

  const analysis = Object.freeze({
    schemaVersion: 1,
    stage: 'R2-V',
    expectedTrials: EXPECTED,
    completedTrials: matrix.completed,
    seed: '0x52560301',
    scenario: 'D',
    arms: Object.fromEntries(CONDITIONS.map((id) => [id, { bundles: [...ARMS[id].bundles], added: [...(ADDED_BUNDLES[id] ?? [])] }])),
    confoundedBlocks: blocks.filter((block) => block.confounded),
    isolationBlocks: blocks,
    utility,
    calibration,
    /**
     * §13: MODEL SELF-REPORT IS NOT UTILITY GROUND TRUTH. Nothing in this analysis reads a worker summary;
     * the primary outcomes are the hidden acceptance and the behavioural known-failure detector.
     */
    groundTruth: 'the hidden acceptance module and the behavioural known-failure detector; never a model self-report',
  });

  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(join(EVIDENCE, 'normalized-results.json'), `${JSON.stringify(sanitize({ schemaVersion: 1, trials: normalized }), null, 2)}\n`, 'utf8');
  writeFileSync(join(EVIDENCE, 'analysis.json'), `${JSON.stringify(sanitize(analysis), null, 2)}\n`, 'utf8');

  out(`\nR2-V UTILITY-CALIBRATION ANALYSIS — ${String(matrix.completed)}/${String(EXPECTED)} trials, ${String(analysable.length)} analysable, ${String(confounded.size)} confounded block(s)`);
  for (const condition of CONDITIONS) {
    const arm = byArm[condition];
    out(`  ${condition} (${ARMS[condition].bundles.join('+')}): final ${arm.fullSolved}, first ${arm.firstCandidateSolved}, mistake ${arm.mistakeRecurred}`);
  }
  for (const comparison of utility.comparisons) {
    out(`  ${comparison.comparison} (adds ${comparison.addedBundles.join('+') || 'nothing'}): solveDelta ${String(comparison.solveDelta)}, recurrenceDelta ${String(comparison.recurrenceDelta)} → ${comparison.classification}`);
  }
  out(`  R2-S calibration: ${calibration.answers.correlation}`);
  out(`record: ${join(EVIDENCE, 'analysis.json')}`);
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}
