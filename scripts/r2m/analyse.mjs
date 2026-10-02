#!/usr/bin/env node
/**
 * R2-M §14/§19/§22/§23/§24/§34 — NORMALIZE, CHECK ISOLATION, ANALYSE, AND WRITE THE EVIDENCE.
 *
 * §34 requires the M0/M1 pull counts, the per-kind pull counts, time/actions to first pull, the
 * before-edit pull rate, task outcomes and the known-failure recurrence — then a mechanical application of
 * the verdict frozen in `design.mjs`.
 *
 * §22: THE PRIMARY OUTCOME IS `P(any governed pull | selected capital)`. §24: task-success comparisons are
 * SECONDARY, because pullers are self-selected and are therefore not randomized — a pulled-vs-not-pulled
 * task difference is an ASSOCIATION, never a treatment effect.
 *
 * §19: THE ISOLATION PROOF. Within every block the ordinary task digest, the tool catalog digest, the
 * pull-tool description digest, the capability set digest and the selected-handle list must be EQUAL across
 * the arms, and the index-presentation digest must DIFFER. A block that fails this is CONFOUNDED and
 * excluded, while remaining in the raw evidence.
 *
 * §33's accounting requirement is enforced structurally: the analysis refuses to produce a verdict for a
 * matrix whose trial count is not the pre-registered one.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { CONDITIONS, EXPECTED_TRIALS, analyseDecisionRelevance, armSummary, previewLeakage, SCENARIO_IDS } from './design.mjs';
import { PAIRED_STATE_COMPARABLE_FIELDS, SCENARIOS } from '../r2u/scenarios.mjs';
import { deriveCapital } from '../r2u/capital.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, '').split('=');
  return [key, rest.join('=')];
}));
const RIG = args.get('rig') ?? join(homedir(), '.palimpsest-r2m', 'matrix');
const EXPECTED = Number(args.get('expected') ?? String(EXPECTED_TRIALS));
const EVIDENCE = join(REPO_ROOT, 'research-evidence', 'r2-m');

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

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

/** §22/§23/§24: the pre-registered per-trial outcome list, normalized. */
export function normalizeTrial(record) {
  const worker = record.worker ?? {};
  const pulledHandles = Array.isArray(worker.pulledHandles) ? worker.pulledHandles : [];
  const kindOf = (handle) => (String(handle).startsWith('@ctx/proof/') ? 'proof' : String(handle).startsWith('@ctx/reasoning/') ? 'reasoning' : String(handle).startsWith('@ctx/procedure/') ? 'procedure' : 'unknown');
  const pulledKinds = [...new Set(pulledHandles.map(kindOf))].sort();
  return Object.freeze({
    trialId: record.trialId,
    scenario: record.scenario,
    condition: record.condition,
    block: record.block,
    repetition: record.repetition,

    /** §22: THE PRIMARY OUTCOME — did the worker voluntarily pull at least one selected handle? */
    pulledCount: pulledHandles.length,
    pulledHandles,
    pulledKinds,
    pulledAny: pulledHandles.length > 0,

    /** §23: the mandatory per-kind outcomes. */
    proofPulled: pulledKinds.includes('proof'),
    reasoningPulled: pulledKinds.includes('reasoning'),
    procedurePulled: pulledKinds.includes('procedure'),

    /** §24: the secondary timing facts. */
    firstPullOrdinal: record.firstPullOrdinal ?? 'UNKNOWN',
    toolActionsBeforeFirstPull: record.toolActionsBeforeFirstPull ?? 'UNKNOWN',
    pulledBeforeFirstEdit: record.pulledBeforeFirstEdit === true,
    pulledBeforeFirstVisibleTest: record.pulledBeforeFirstVisibleTest === true,

    /** §24: task outcomes — SECONDARY, and association-only for pullers. */
    finalAcceptancePassed: record.finalAcceptance?.passed ?? 0,
    finalAcceptanceTotal: record.finalAcceptance?.total ?? 0,
    finalAcceptanceSolved: record.finalAcceptance?.total > 0 && record.finalAcceptance.passed === record.finalAcceptance.total,
    firstCandidatePassed: record.firstCandidateAcceptance?.passed ?? 0,
    firstCandidateTotal: record.firstCandidateAcceptance?.total ?? 0,
    firstCandidateSolved: record.firstCandidateAcceptance?.total > 0 && record.firstCandidateAcceptance.passed === record.firstCandidateAcceptance.total,
    knownFailureRecurred: record.knownFailureFinal?.recurred ?? 'UNKNOWN',
    visibleOracleInvocations: record.visibleOracleInvocations ?? 'UNKNOWN',
    implementationRevisions: record.implementationRevisions ?? 'UNKNOWN',
    elapsedMs: record.elapsedMs ?? 'UNKNOWN',
    hostFailure: record.hostFailure !== null && record.hostFailure !== undefined,
    timedOut: record.timedOut === true,
    workerOutcomeKind: worker.outcomeKind ?? 'UNKNOWN',
    jobPhase: record.jobPhase ?? 'UNKNOWN',

    /** §14: the treatment-applied precondition. */
    treatmentApplied: record.treatmentApplied === true,
    indexPrecondition: record.indexPrecondition ?? 'UNKNOWN',
    indexModeReported: worker.reportedIndexMode ?? 'UNKNOWN',

    /** §22: the derivation/worker pull separation, so contamination would be visible. */
    derivationPullOffset: record.pullAccounting?.derivationPullOffset ?? 0,
    pullAccountingConsistent: record.pullAccounting?.consistent ?? 'UNKNOWN',
    derivedCount: record.indexPresentation?.derivedCount ?? 0,
    indexManifest: record.indexPresentation?.manifest ?? [],

    /** §19: the pairing components, recorded separately so no single digest masks the treatment. */
    ordinaryTaskDigest: record.prompt?.ordinaryTaskDigest ?? 'UNKNOWN',
    indexPresentationDigest: record.prompt?.indexPresentationDigest ?? 'UNKNOWN',
    productionIndexDigest: record.prompt?.productionIndexDigest ?? 'UNKNOWN',
    toolCatalogDigest: record.prompt?.toolCatalogDigest ?? 'UNKNOWN',
    pullToolDescriptionDigest: record.prompt?.pullToolDescriptionDigest ?? 'UNKNOWN',
    capabilitySetDigest: record.prompt?.capabilitySetDigest ?? 'UNKNOWN',
    handlesInPayload: record.prompt?.handlesInPayload ?? [],
    indexHandleCount: record.prompt?.indexHandleCount ?? 0,
    indexSection: record.prompt?.indexSection ?? '',
    productionIndexSection: record.prompt?.productionIndexSection ?? '',
    offeredTools: worker.offeredTools ?? [],
    pairedState: record.pairedState ?? null,
    capacity: record.confidentiality?.capacity ?? null,
  });
}

/**
 * §19: THE ISOLATION PROOF.
 *
 * Within every randomized M0/M1 pair, the invariant components MUST be equal and the index-presentation
 * digest MUST differ. §17 requires the SAME selected capital in both arms, so the selected-handle list is
 * compared as well as the task/tool/capability digests.
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
    if (members.length !== 2) differences.push(`expected 2 conditions, found ${String(members.length)}`);
    for (const field of PAIRED_STATE_COMPARABLE_FIELDS) {
      const values = new Set(members.map((trial) => JSON.stringify(trial.pairedState?.[field] ?? null)));
      if (values.size > 1) differences.push(`pairedState.${field} differs across conditions`);
    }
    /** §19: what MUST be equal. These are the components the treatment is not allowed to touch. */
    for (const [label, values] of [
      ['ordinary task text', new Set(members.map((trial) => trial.ordinaryTaskDigest))],
      ['tool catalog', new Set(members.map((trial) => trial.toolCatalogDigest))],
      ['context-pull tool description', new Set(members.map((trial) => trial.pullToolDescriptionDigest))],
      ['worker capability set', new Set(members.map((trial) => trial.capabilitySetDigest))],
      ['selected handles', new Set(members.map((trial) => JSON.stringify(trial.handlesInPayload)))],
    ]) {
      if (values.size > 1) differences.push(`the ${label} differs across conditions`);
    }
    /** §19/§17: the treatment MUST differ — an identical index means the arms were not distinguished. */
    const indexDigests = new Set(members.map((trial) => trial.indexPresentationDigest));
    if (indexDigests.size !== 2) differences.push('the index presentation is identical across conditions — the treatment was not applied');
    /** §6: M0 must be byte-identical to production. */
    const m0 = members.find((trial) => trial.condition === 'M0');
    if (m0 !== undefined && m0.indexPresentationDigest !== m0.productionIndexDigest) {
      differences.push('the M0 index is not byte-identical to the production index');
    }
    /** §14: an analysed M1 trial must have derived every entry. */
    const m1 = members.find((trial) => trial.condition === 'M1');
    if (m1 !== undefined && !m1.treatmentApplied) {
      differences.push(`the M1 arm did not derive every selected handle (${String(m1.derivedCount)} entries)`);
    }
    /** §22: the pull accounting must be consistent, so a derivation pull cannot read as a worker pull. */
    for (const member of members) {
      if (member.pullAccountingConsistent !== true) differences.push(`${member.condition}: the pull accounting is inconsistent (${String(member.pullAccountingConsistent)})`);
    }
    blocks.push(Object.freeze({
      scenario,
      block: Number(block),
      conditions: members.map((trial) => trial.condition).sort(),
      confounded: differences.length > 0,
      differences: Object.freeze(differences),
      indexHandleCounts: members.map((trial) => trial.indexHandleCount),
      indexMovedWithArm: indexDigests.size > 1,
    }));
  }
  return Object.freeze(blocks);
}

const out = (line) => process.stdout.write(`${line}\n`);

/** The complete capital statements for a scenario, used ONLY to prove the rendered index omits them. */
function statementsFor(scenarioName) {
  const capital = deriveCapital();
  const scenarioId = scenarioName === SCENARIOS.C.name ? 'C' : 'D';
  const entry = capital[scenarioId];
  if (entry === undefined) return [];
  const statements = [];
  if (typeof entry.proof?.statement === 'string') statements.push(entry.proof.statement);
  if (typeof entry.reasoning?.statement === 'string') statements.push(entry.reasoning.statement);
  return statements;
}

async function main() {
  const matrixPath = join(RIG, 'trials.json');
  if (!existsSync(matrixPath)) throw new Error(`no matrix record at ${matrixPath}; run scripts/r2m/matrix.mjs first`);
  const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'));
  /** §33: the accounting requirement, enforced rather than asserted in prose. */
  if (matrix.completed !== EXPECTED) {
    throw new Error(`§33: the matrix holds ${String(matrix.completed)} trials, the pre-registered count is ${String(EXPECTED)}; refusing to analyse an incomplete matrix`);
  }

  const normalized = matrix.trials.map(normalizeTrial);
  const blocks = isolationCheck(normalized);
  const confounded = new Set(blocks.filter((block) => block.confounded).map((block) => `${block.scenario}|${String(block.block)}`));

  /**
   * §14: THE ANALYSED SET. A confounded block is excluded, and an M1 trial whose derivation did not
   * produce every entry is excluded from the comparison while REMAINING in the raw evidence — counting it
   * would compare a partially-presented index against the opaque one.
   */
  const analysable = normalized.filter((trial) => !confounded.has(`${trial.scenario}|${String(trial.block)}`));
  const byScenario = {};
  for (const scenarioId of SCENARIO_IDS) {
    const scenarioName = SCENARIOS[scenarioId].name;
    const members = analysable.filter((trial) => trial.scenario === scenarioName);
    byScenario[scenarioId] = {
      m0: armSummary(members.filter((trial) => trial.condition === 'M0')),
      m1: armSummary(members.filter((trial) => trial.condition === 'M1' && trial.treatmentApplied)),
    };
  }

  const decisionRelevance = analyseDecisionRelevance(byScenario);

  /* -- §34: the per-arm outcome tables, raw counts first ------------------------------------- */
  const median = (values) => {
    const sorted = values.filter((value) => typeof value === 'number').sort((left, right) => left - right);
    if (sorted.length === 0) return 'UNKNOWN';
    return sorted.length % 2 === 1 ? sorted[(sorted.length - 1) / 2] : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2);
  };
  const arms = {};
  for (const scenarioId of SCENARIO_IDS) {
    const scenarioName = SCENARIOS[scenarioId].name;
    arms[scenarioId] = {};
    for (const condition of CONDITIONS) {
      const members = analysable.filter((trial) => trial.scenario === scenarioName && trial.condition === condition);
      arms[scenarioId][condition] = Object.freeze({
        n: members.length,
        pulled: `${String(members.filter((trial) => trial.pulledAny).length)}/${String(members.length)}`,
        pulledTrials: members.map((trial) => ({ trialId: trial.trialId, handles: trial.pulledHandles, kinds: trial.pulledKinds })),
        proofPulled: `${String(members.filter((trial) => trial.proofPulled).length)}/${String(members.length)}`,
        reasoningPulled: `${String(members.filter((trial) => trial.reasoningPulled).length)}/${String(members.length)}`,
        procedurePulled: `${String(members.filter((trial) => trial.procedurePulled).length)}/${String(members.length)}`,
        medianActionsBeforeFirstPull: median(members.filter((trial) => trial.pulledAny).map((trial) => trial.toolActionsBeforeFirstPull)),
        pulledBeforeFirstEdit: `${String(members.filter((trial) => trial.pulledBeforeFirstEdit).length)}/${String(members.length)}`,
        pulledBeforeFirstVisibleTest: `${String(members.filter((trial) => trial.pulledBeforeFirstVisibleTest).length)}/${String(members.length)}`,
        fullSolved: `${String(members.filter((trial) => trial.finalAcceptanceSolved).length)}/${String(members.length)}`,
        firstCandidateSolved: `${String(members.filter((trial) => trial.firstCandidateSolved).length)}/${String(members.length)}`,
        mistakeRecurred: `${String(members.filter((trial) => trial.knownFailureRecurred === true).length)}/${String(members.length)}`,
        medianVisibleOracleInvocations: median(members.map((trial) => trial.visibleOracleInvocations)),
        medianElapsedMs: median(members.map((trial) => trial.elapsedMs)),
        hostFailures: members.filter((trial) => trial.hostFailure).length,
        timeouts: members.filter((trial) => trial.timedOut).length,
        finalScores: members.map((trial) => `${String(trial.finalAcceptancePassed)}/${String(trial.finalAcceptanceTotal)}`),
      });
    }
  }

  /* -- §24: the association-only comparison between pullers and non-pullers ------------------- */
  const association = (() => {
    const summary = (members) => Object.freeze({
      n: members.length,
      fullSolved: `${String(members.filter((trial) => trial.finalAcceptanceSolved).length)}/${String(members.length)}`,
      mistakeRecurred: `${String(members.filter((trial) => trial.knownFailureRecurred === true).length)}/${String(members.length)}`,
    });
    return Object.freeze({
      note: 'pullers are SELF-SELECTED and not randomized, so this is an association, never a treatment effect',
      pullers: summary(analysable.filter((trial) => trial.pulledAny)),
      nonPullers: summary(analysable.filter((trial) => !trial.pulledAny)),
    });
  })();

  /* -- §14/§18: the preview manifest, aggregated across M1 trials ---------------------------- */
  const previewManifest = analysable
    .filter((trial) => trial.condition === 'M1')
    .flatMap((trial) => trial.indexManifest.map((entry) => ({ trialId: trial.trialId, ...entry })));

  /* -- §14: the leakage check over the EXACT rendered M1 sections ---------------------------- */
  const leakage = (() => {
    const problems = [];
    for (const trial of analysable.filter((entry) => entry.condition === 'M1')) {
      const scenarioId = trial.scenario === SCENARIOS.C.name ? 'C' : 'D';
      const forbidden = [SCENARIOS[scenarioId].taskObjective, SCENARIOS[scenarioId].knownFailure].filter((value) => typeof value === 'string');
      const check = previewLeakage({ previewText: trial.indexSection, sourceField: '', forbidden });
      for (const problem of check.problems) problems.push({ trialId: trial.trialId, problem });
      /** §14: the full body must never be rendered — the section may not contain the capital statements. */
      for (const statement of statementsFor(trial.scenario)) {
        if (statement.length > 60 && trial.indexSection.includes(statement)) problems.push({ trialId: trial.trialId, problem: 'the rendered index contains a complete capital body statement' });
      }
    }
    return Object.freeze({ leaked: problems.length > 0, problems: Object.freeze(problems) });
  })();

  /* -- §31: the evidence, with transcript digests rather than transcripts --------------------- */
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
    stage: 'R2-M',
    expectedTrials: EXPECTED,
    completedTrials: matrix.completed,
    seed: '0x524d0301',
    confoundedBlocks: blocks.filter((block) => block.confounded),
    isolationBlocks: blocks,
    decisionRelevance,
    arms,
    perKind: Object.fromEntries(SCENARIO_IDS.map((scenarioId) => [scenarioId, Object.freeze({
      proof: Object.freeze({ M0: arms[scenarioId].M0.proofPulled, M1: arms[scenarioId].M1.proofPulled }),
      reasoning: Object.freeze({ M0: arms[scenarioId].M0.reasoningPulled, M1: arms[scenarioId].M1.reasoningPulled }),
      procedure: Object.freeze({ M0: arms[scenarioId].M0.procedurePulled, M1: arms[scenarioId].M1.procedurePulled }),
    })])),
    association,
    previewManifest,
    leakage,
    transcriptDigests,
  });

  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(join(EVIDENCE, 'normalized-results.json'), `${JSON.stringify(sanitize({ schemaVersion: 1, trials: normalized }), null, 2)}\n`, 'utf8');
  writeFileSync(join(EVIDENCE, 'analysis.json'), `${JSON.stringify(sanitize(analysis), null, 2)}\n`, 'utf8');
  writeFileSync(join(EVIDENCE, 'preview-manifest.json'), `${JSON.stringify(sanitize({ schemaVersion: 1, stage: 'R2-M', entries: previewManifest }), null, 2)}\n`, 'utf8');

  out(`\nR2-M DECISION-RELEVANCE ANALYSIS — ${String(matrix.completed)}/${String(EXPECTED)} trials, ${String(analysable.length)} analysable, ${String(confounded.size)} confounded block(s)`);
  for (const scenarioId of SCENARIO_IDS) {
    const a = arms[scenarioId];
    out(`  ${scenarioId}: M0 pulled ${a.M0.pulled} (proof ${a.M0.proofPulled} reasoning ${a.M0.reasoningPulled} procedure ${a.M0.procedurePulled}) | M1 pulled ${a.M1.pulled} (proof ${a.M1.proofPulled} reasoning ${a.M1.reasoningPulled} procedure ${a.M1.procedurePulled})`);
  }
  out(`  association (NOT causal): pullers ${association.pullers.fullSolved} solved, non-pullers ${association.nonPullers.fullSolved}`);
  out(`  preview leakage: ${leakage.leaked ? 'LEAKED' : 'CLEAN'} (${String(leakage.problems.length)} problem(s))`);
  out(`  ${decisionRelevance.verdict}`);
  out(`record: ${join(EVIDENCE, 'analysis.json')}`);
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}
