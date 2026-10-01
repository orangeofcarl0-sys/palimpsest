#!/usr/bin/env node
/**
 * R2-E §13/§15/§16/§17/§18/§27 — NORMALIZE, CHECK PAIRING, ANALYSE, AND WRITE THE EVIDENCE.
 *
 * §27 requires the efficacy verdict and nothing else: this stage must NOT be converted into an uptake
 * verdict, because R2-U remains the uptake result. §18 requires the verdict to be computed from the
 * criteria pre-declared in `design.mjs`, and §9 requires a trial whose prework did not materialize every
 * selected handle to be CLASSIFIED rather than counted.
 *
 * §26's accounting requirement is enforced structurally: the analysis refuses to produce a verdict for a
 * matrix whose trial count is not the pre-registered one, so an incomplete run cannot be reported as a
 * result.
 *
 * §23: evidence volume is deliberately smaller than R2-U's. The repo artifact carries the protocol, the
 * manifest, normalized results, the analysis, digests and selected representative traces; complete session
 * transcripts stay external and the repo carries their digests.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { armSummary, CONDITIONS, EXPECTED_TRIALS, analyseEfficacy, SCENARIO_IDS } from './design.mjs';
import { PAIRED_STATE_COMPARABLE_FIELDS, SCENARIOS } from '../r2u/scenarios.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, '').split('=');
  return [key, rest.join('=')];
}));
const RIG = args.get('rig') ?? join(homedir(), '.palimpsest-r2e', 'matrix');
const EXPECTED = Number(args.get('expected') ?? String(EXPECTED_TRIALS));
const EVIDENCE = join(REPO_ROOT, 'research-evidence', 'r2-e');

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/** §23: strip absolute local paths. Credential-shaped keys are dropped outright rather than sanitized. */
function sanitize(value) {
  if (typeof value === 'string') {
    return value
      .replace(/[A-Za-z]:\\+Users\\+[^\\/\s"]+/gu, '<home>')
      .replace(/[A-Za-z]:\\+[^"\s]*/gu, (match) => (match.includes('.palimpsest-r2e') ? '<rig>' : '<abs>'))
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

/** §15/§16: the pre-registered per-trial outcome list, normalized. */
export function normalizeTrial(record) {
  const worker = record.worker ?? {};
  const prework = record.prework ?? null;
  return Object.freeze({
    trialId: record.trialId,
    scenario: record.scenario,
    condition: record.condition,
    block: record.block,
    repetition: record.repetition,

    /** §15: PRIMARY efficacy outcomes. */
    firstCandidatePassed: record.firstCandidateAcceptance?.passed ?? 0,
    firstCandidateTotal: record.firstCandidateAcceptance?.total ?? 0,
    firstCandidateSolved: record.firstCandidateAcceptance?.total > 0 && record.firstCandidateAcceptance.passed === record.firstCandidateAcceptance.total,
    finalAcceptancePassed: record.finalAcceptance?.passed ?? 0,
    finalAcceptanceTotal: record.finalAcceptance?.total ?? 0,
    finalAcceptanceSolved: record.finalAcceptance?.total > 0 && record.finalAcceptance.passed === record.finalAcceptance.total,
    knownFailureRecurred: record.knownFailureFinal?.recurred ?? 'UNKNOWN',
    knownFailureRecurredFirst: record.knownFailureFirst?.recurred ?? 'UNKNOWN',
    visibleOracleInvocations: record.visibleOracleInvocations ?? 'UNKNOWN',
    implementationRevisions: record.implementationRevisions ?? 'UNKNOWN',
    elapsedMs: record.elapsedMs ?? 'UNKNOWN',
    hostFailure: record.hostFailure !== null && record.hostFailure !== undefined,
    timedOut: record.timedOut === true,
    workerOutcomeKind: worker.outcomeKind ?? 'UNKNOWN',
    workerCompleted: worker.outcomeKind === 'READY_FOR_SETTLEMENT',
    jobPhase: record.jobPhase ?? 'UNKNOWN',

    /** §16: the capital-consumption proof. */
    preconditionMet: record.preconditionMet === true,
    efficacyPrecondition: record.efficacyPrecondition ?? 'UNKNOWN',
    consumedBeforeFirstEdit: record.consumedBeforeFirstEdit === true || record.consumedBeforeFirstEdit === 'NOT_APPLICABLE_CONTROL',
    preworkMechanism: prework?.mechanism ?? 'UNKNOWN',
    selectedCount: prework?.selectedCount ?? 0,
    resolvedCount: prework?.resolvedCount ?? 0,
    consumedHandles: prework?.handles ?? [],
    consumedDigests: prework?.digests ?? [],
    consumptionFailures: prework?.failures ?? [],

    /** §17: the behavioural Procedure marker. */
    procedureMarkerReflected: record.procedureMarkerFinal?.reflected === true,

    /** §13: the pairing components, recorded separately so no single digest masks the treatment. */
    ordinaryTaskDigest: record.prompt?.ordinaryTaskDigest ?? 'UNKNOWN',
    indexSectionDigest: record.prompt?.indexSectionDigest ?? 'UNKNOWN',
    efficacySectionDigest: record.prompt?.efficacySectionDigest ?? 'UNKNOWN',
    capabilitySetDigest: record.prompt?.capabilitySetDigest ?? 'UNKNOWN',
    indexHandleCount: record.prompt?.indexHandleCount ?? 0,
    handlesInPayload: record.prompt?.handlesInPayload ?? [],
    offeredTools: worker.offeredTools ?? [],
    pairedState: record.pairedState ?? null,
    capacity: record.confidentiality?.capacity ?? null,
  });
}

/**
 * §13: PAIRING. Within every randomized E0/E1 pair the invariant components must be equal, and the
 * efficacy section must DIFFER (that is the treatment). The context index is deliberately NOT required to
 * differ: E0 and E1 select no capital and full capital respectively, so the index does differ by design,
 * but the check reports it rather than requiring it, because a scenario whose capital list were empty would
 * legitimately have no index in either arm.
 */
export function pairingCheck(trials) {
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
    if (members.length !== 2) differences.push(`expected 2 conditions, found ${String(members.length)}`);
    for (const field of PAIRED_STATE_COMPARABLE_FIELDS) {
      const values = new Set(members.map((trial) => JSON.stringify(trial.pairedState?.[field] ?? null)));
      if (values.size > 1) differences.push(`pairedState.${field} differs across conditions`);
    }
    /**
     * §13: what must be EQUAL. The INDEX SECTION is deliberately NOT among these: E0 selects no capital, so
     * its index is legitimately empty, and the index is part of the treatment surface rather than an
     * invariant of the pair. It is reported below instead, so a reader can see it moved with the arm.
     */
    for (const [label, values] of [
      ['ordinary task text', new Set(members.map((trial) => trial.ordinaryTaskDigest))],
      ['worker capability set', new Set(members.map((trial) => trial.capabilitySetDigest))],
    ]) {
      if (values.size > 1) differences.push(`the ${label} differs across conditions`);
    }
    /** The treatment MUST differ: an identical section means the arms were not distinguished. */
    const sections = new Set(members.map((trial) => trial.efficacySectionDigest));
    if (sections.size !== 2) differences.push('the efficacy section is identical across conditions — the treatment was not applied');
    /** §12: the E0 control must contain no capital at all. */
    const e0 = members.find((trial) => trial.condition === 'E0');
    if (e0 !== undefined && (e0.selectedCount !== 0 || e0.consumedHandles.length !== 0)) {
      differences.push('the E0 control carries capital — the control must contain none');
    }
    /** §16: an analysed E1 trial must have consumed every selected handle. */
    const e1 = members.find((trial) => trial.condition === 'E1');
    if (e1 !== undefined && e1.selectedCount > 0 && !e1.preconditionMet) {
      differences.push(`the E1 arm did not consume all selected handles (${String(e1.resolvedCount)}/${String(e1.selectedCount)})`);
    }
    const indexCounts = members.map((trial) => trial.indexHandleCount);
    blocks.push(Object.freeze({
      scenario,
      block: Number(block),
      conditions: members.map((trial) => trial.condition).sort(),
      confounded: differences.length > 0,
      differences: Object.freeze(differences),
      /** §13: recorded rather than required — the index is part of the treatment surface. */
      indexHandleCounts: Object.freeze(indexCounts),
      indexMovedWithArm: new Set(indexCounts).size > 1,
    }));
  }
  return Object.freeze(blocks);
}

const out = (line) => process.stdout.write(`${line}\n`);

async function main() {
  const matrixPath = join(RIG, 'trials.json');
  if (!existsSync(matrixPath)) throw new Error(`no matrix record at ${matrixPath}; run scripts/r2e/matrix.mjs first`);
  const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'));
  /** §26: the accounting requirement, enforced rather than asserted in prose. */
  if (matrix.completed !== EXPECTED) {
    throw new Error(`§26: the matrix holds ${String(matrix.completed)} trials, the pre-registered count is ${String(EXPECTED)}; refusing to analyse an incomplete matrix`);
  }

  const normalized = matrix.trials.map(normalizeTrial);
  const blocks = pairingCheck(normalized);
  const confounded = new Set(blocks.filter((block) => block.confounded).map((block) => `${block.scenario}|${String(block.block)}`));

  /**
   * §9: THE ANALYSED SET. A confounded block is excluded, and an E1 trial whose prework did not materialize
   * every selected handle is excluded from the efficacy comparison while REMAINING in the raw evidence —
   * counting it would attribute to capital a run where capital never arrived.
   */
  const analysable = normalized.filter((trial) => !confounded.has(`${trial.scenario}|${String(trial.block)}`));
  const byScenario = {};
  for (const scenarioId of SCENARIO_IDS) {
    const scenarioName = SCENARIOS[scenarioId].name;
    const members = analysable.filter((trial) => trial.scenario === scenarioName);
    byScenario[scenarioId] = {
      e0: armSummary(members.filter((trial) => trial.condition === 'E0')),
      e1: armSummary(members.filter((trial) => trial.condition === 'E1' && trial.preconditionMet)),
    };
  }

  const efficacy = analyseEfficacy(byScenario);

  /* -- §15: the per-arm outcome tables, raw counts first ------------------------------------- */
  const arms = {};
  for (const scenarioId of SCENARIO_IDS) {
    const scenarioName = SCENARIOS[scenarioId].name;
    arms[scenarioId] = {};
    for (const condition of CONDITIONS) {
      const members = analysable.filter((trial) => trial.scenario === scenarioName && trial.condition === condition);
      const median = (values) => {
        const sorted = values.filter((value) => typeof value === 'number').sort((left, right) => left - right);
        if (sorted.length === 0) return 'UNKNOWN';
        return sorted.length % 2 === 1 ? sorted[(sorted.length - 1) / 2] : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2);
      };
      arms[scenarioId][condition] = Object.freeze({
        n: members.length,
        fullSolved: `${String(members.filter((trial) => trial.finalAcceptanceSolved).length)}/${String(members.length)}`,
        firstCandidateSolved: `${String(members.filter((trial) => trial.firstCandidateSolved).length)}/${String(members.length)}`,
        mistakeRecurred: `${String(members.filter((trial) => trial.knownFailureRecurred === true).length)}/${String(members.length)}`,
        procedureMarkerReflected: `${String(members.filter((trial) => trial.procedureMarkerReflected).length)}/${String(members.length)}`,
        medianVisibleOracleInvocations: median(members.map((trial) => trial.visibleOracleInvocations)),
        medianImplementationRevisions: median(members.map((trial) => trial.implementationRevisions)),
        medianElapsedMs: median(members.map((trial) => trial.elapsedMs)),
        hostFailures: members.filter((trial) => trial.hostFailure).length,
        timeouts: members.filter((trial) => trial.timedOut).length,
        finalScores: members.map((trial) => `${String(trial.finalAcceptancePassed)}/${String(trial.finalAcceptanceTotal)}`),
      });
    }
  }

  /* -- §16/§22: the consumption proof, as a standalone block --------------------------------- */
  const e1Trials = analysable.filter((trial) => trial.condition === 'E1');
  const consumption = Object.freeze({
    e1Trials: e1Trials.length,
    mechanism: [...new Set(e1Trials.map((trial) => trial.preworkMechanism))],
    allConsumed: e1Trials.filter((trial) => trial.preconditionMet).length,
    preconditionNotMet: e1Trials.filter((trial) => !trial.preconditionMet).length,
    totalHandlesConsumed: e1Trials.reduce((sum, trial) => sum + trial.resolvedCount, 0),
    consumptionFailures: e1Trials.flatMap((trial) => trial.consumptionFailures),
    /** §22: the prework phase runs before the first turn exists, so this is structural. */
    consumedBeforeFirstEdit: e1Trials.every((trial) => trial.consumedBeforeFirstEdit === true),
    handleIdentities: e1Trials.map((trial) => ({ trialId: trial.trialId, handles: trial.consumedHandles, digests: trial.consumedDigests })),
  });

  /* -- §23: the evidence, with transcript digests rather than transcripts ---------------------- */
  const transcriptDigests = Object.freeze(
    normalized.map((trial) => {
      const path = join(matrix.runsDir ?? join(RIG, 'runs'), trial.trialId, 'out', 'worker-transcript.txt');
      if (!existsSync(path)) return { trialId: trial.trialId, transcript: 'ABSENT' };
      const bytes = readFileSync(path);
      return { trialId: trial.trialId, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    }),
  );

  const analysis = Object.freeze({
    schemaVersion: 1,
    stage: 'R2-E',
    expectedTrials: EXPECTED,
    completedTrials: matrix.completed,
    confoundedBlocks: blocks.filter((block) => block.confounded),
    pairingBlocks: blocks,
    efficacy,
    arms,
    consumption,
    transcriptDigests,
    calibrationVerdicts: null,
  });

  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(join(EVIDENCE, 'normalized-results.json'), `${JSON.stringify(sanitize({ schemaVersion: 1, trials: normalized }), null, 2)}\n`, 'utf8');
  writeFileSync(join(EVIDENCE, 'analysis.json'), `${JSON.stringify(sanitize(analysis), null, 2)}\n`, 'utf8');

  out(`\nR2-E EFFICACY ANALYSIS — ${String(matrix.completed)}/${String(EXPECTED)} trials, ${String(analysable.length)} analysable, ${String(confounded.size)} confounded block(s)`);
  for (const scenarioId of SCENARIO_IDS) {
    const a = arms[scenarioId];
    out(`  ${scenarioId}: E0 solved ${a.E0.fullSolved} mistakes ${a.E0.mistakeRecurred} marker ${a.E0.procedureMarkerReflected} | E1 solved ${a.E1.fullSolved} mistakes ${a.E1.mistakeRecurred} marker ${a.E1.procedureMarkerReflected}`);
  }
  out(`  consumption: ${String(consumption.allConsumed)}/${String(consumption.e1Trials)} E1 trials consumed every selected handle (${consumption.mechanism.join(', ')})`);
  out(`  ${efficacy.verdict}`);
  out(`record: ${join(EVIDENCE, 'analysis.json')}`);
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}
