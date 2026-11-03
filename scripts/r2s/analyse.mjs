#!/usr/bin/env node
/**
 * R2-S §10/§11/§13/§14/§15/§16/§17/§20 — NORMALIZE, CHECK ISOLATION, ANALYSE, AND WRITE THE EVIDENCE.
 *
 * §14 requires Target Recall, Distractor Pull Rate and Pull Precision. §16 requires the pull order and the
 * before-first-edit facts. §17 requires pull-all to be reported as a valid result. §20 requires the verdict
 * to be the frozen one, applied mechanically.
 *
 * §10/§11: THE ISOLATION PROOF. Within every randomized block the task, tool catalog, tool descriptions,
 * capabilities, selected handle identities, selected handle ORDER and capital bodies must be EQUAL across
 * the arms, and only the index-presentation digest may DIFFER. §11 additionally requires the achieved
 * target/distractor position pattern to be REPORTED, because the harness can vary the order only through
 * which distractors it selects.
 *
 * §21: THE VERDICT READS ONLY ROUTING/SELECTIVITY. Task success is recorded and never consulted.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { analyseSelectivity, armSelectivity, CANDIDATE_SET_SIZE, CONDITIONS, DISTRACTOR_COUNT, EXPECTED_TRIALS, previewLeakage, SCENARIO_IDS, TARGET_COUNT } from './design.mjs';
import { bundleCapital } from './candidates.mjs';
import { PAIRED_STATE_COMPARABLE_FIELDS, SCENARIOS } from '../r2u/scenarios.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, '').split('=');
  return [key, rest.join('=')];
}));
const RIG = args.get('rig') ?? join(homedir(), '.palimpsest-r2s', 'matrix');
const EXPECTED = Number(args.get('expected') ?? String(EXPECTED_TRIALS));
const EVIDENCE = join(REPO_ROOT, 'research-evidence', 'r2-s');

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/** §31 (R2-M): strip absolute local paths. Credential-shaped keys are dropped outright. */
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

/** §14/§16: the pre-registered per-trial outcome list, normalized. */
export function normalizeTrial(record) {
  const worker = record.worker ?? {};
  const outcome = record.outcome ?? {};
  const pulledHandles = Array.isArray(worker.pulledHandles) ? worker.pulledHandles : [];
  const targetPulls = Number(outcome.targetPulls ?? 0);
  const distractorPulls = Number(outcome.distractorPulls ?? 0);
  const totalPulls = Number(outcome.totalPulls ?? pulledHandles.length);
  return Object.freeze({
    trialId: record.trialId,
    scenario: record.scenario,
    condition: record.condition,
    block: record.block,
    repetition: record.repetition,

    /** §14: THE PRIMARY OUTCOMES — DISTINCT handles retrieved, so recall can never exceed 1. */
    targetPulls,
    distractorPulls,
    totalPulls,
    targetRecall: targetPulls / TARGET_COUNT,
    distractorPullRate: distractorPulls / DISTRACTOR_COUNT,
    precision: totalPulls === 0 ? 'UNKNOWN' : targetPulls / totalPulls,
    pulledAny: totalPulls > 0,
    /** §17: pull-all is a valid, recorded result. */
    pulledAll: totalPulls >= CANDIDATE_SET_SIZE,
    unknownRolePulls: Number(outcome.unknownRolePulls ?? 0),
    /** §16: the raw event count, so a repeated pull stays visible rather than being silently merged. */
    pullEventCount: Number(outcome.pullEventCount ?? totalPulls),
    repeatPulls: Number(outcome.repeatPulls ?? 0),

    pulledHandles,
    pullOrderRoles: outcome.pullOrderRoles ?? [],
    pulledKinds: worker.pulledKinds ?? [],

    /** §16: the ordering facts. */
    firstTargetPullOrdinal: outcome.firstTargetPullOrdinal ?? null,
    firstDistractorPullOrdinal: outcome.firstDistractorPullOrdinal ?? null,
    firstPullOrdinal: record.firstPullOrdinal ?? 'UNKNOWN',
    pulledBeforeFirstEdit: record.pulledBeforeFirstEdit === true,
    pulledBeforeFirstVisibleTest: record.pulledBeforeFirstVisibleTest === true,
    targetPullsBeforeFirstEdit: record.pulledBeforeFirstEdit === true ? targetPulls : 'UNKNOWN',
    distractorPullsBeforeFirstEdit: record.pulledBeforeFirstEdit === true ? distractorPulls : 'UNKNOWN',

    /** §16: task outcomes — SECONDARY, never consulted by the verdict. */
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

    /** §13: the treatment precondition, proven at the session boundary. */
    treatmentApplied: record.treatmentApplied === true,
    indexPrecondition: record.indexPrecondition ?? 'UNKNOWN',
    indexModeReported: worker.reportedIndexMode ?? 'UNKNOWN',
    handleOccurrenceExact: record.handleOccurrenceExact === true,
    pairedOrderExact: record.pairedOrderExact === true,

    sessionFound: record.session?.found === true,
    sessionArtifactDigest: record.session?.artifactDigest ?? 'ABSENT',
    sessionPromptDigest: record.session?.promptDigest ?? 'ABSENT',
    sessionIndexSectionFound: record.session?.indexSectionFound === true,
    sessionHandleCount: (record.session?.handlesInPrompt ?? []).length,
    selectedHandleCount: (record.prompt?.handlesInPayload ?? []).length,
    treatmentEvidence: record.treatmentEvidence ?? null,

    derivationPullOffset: record.pullAccounting?.derivationPullOffset ?? 0,
    pullAccountingConsistent: record.pullAccounting?.consistent ?? 'UNKNOWN',
    derivedCount: record.indexPresentation?.derivedCount ?? 0,
    indexManifest: record.indexPresentation?.manifest ?? [],

    /** §10: the pairing components, recorded separately so no single digest masks the treatment. */
    ordinaryTaskDigest: record.prompt?.ordinaryTaskDigest ?? 'UNKNOWN',
    indexPresentationDigest: record.prompt?.indexPresentationDigest ?? 'UNKNOWN',
    productionIndexDigest: record.prompt?.productionIndexDigest ?? 'UNKNOWN',
    toolCatalogDigest: record.prompt?.toolCatalogDigest ?? 'UNKNOWN',
    pullToolDescriptionDigest: record.prompt?.pullToolDescriptionDigest ?? 'UNKNOWN',
    capabilitySetDigest: record.prompt?.capabilitySetDigest ?? 'UNKNOWN',
    handlesInPayload: record.prompt?.handlesInPayload ?? [],
    compiledHandleOrder: record.prompt?.compiledHandleOrder ?? [],
    indexHandleCount: record.prompt?.indexHandleCount ?? 0,
    indexSection: record.prompt?.indexSection ?? '',
    productionIndexSection: record.prompt?.productionIndexSection ?? '',
    offeredTools: worker.offeredTools ?? [],
    pairedState: record.pairedState ?? null,
    capacity: record.confidentiality?.capacity ?? null,
    /** §6/§7/§11: the candidate set and its realized positions. */
    candidateSet: record.candidateSet ?? null,
    realizedOrder: record.realizedOrder ?? [],
    rolePositions: record.rolePositions ?? null,
  });
}

/**
 * §10/§11: THE ISOLATION PROOF.
 *
 * Within every randomized S0/S1 pair, the invariant components MUST be equal and the index-presentation
 * digest MUST differ. §10 requires the selected handle IDENTITIES and ORDER to be equal across the pair, so
 * the compiled handle order is compared as well as the selected-handle list.
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
    for (const [label, values] of [
      ['ordinary task text', new Set(members.map((trial) => trial.ordinaryTaskDigest))],
      ['tool catalog', new Set(members.map((trial) => trial.toolCatalogDigest))],
      ['context-pull tool description', new Set(members.map((trial) => trial.pullToolDescriptionDigest))],
      ['worker capability set', new Set(members.map((trial) => trial.capabilitySetDigest))],
      ['selected handles', new Set(members.map((trial) => JSON.stringify(trial.handlesInPayload)))],
      ['selected handle ORDER', new Set(members.map((trial) => JSON.stringify(trial.compiledHandleOrder)))],
      ['candidate-set roles', new Set(members.map((trial) => JSON.stringify(trial.candidateSet)))],
    ]) {
      if (values.size > 1) differences.push(`the ${label} differs across conditions`);
    }
    const indexDigests = new Set(members.map((trial) => trial.indexPresentationDigest));
    if (indexDigests.size !== 2) differences.push('the index presentation is identical across conditions — the treatment was not applied');
    const s0 = members.find((trial) => trial.condition === 'S0');
    if (s0 !== undefined && s0.indexPresentationDigest !== s0.productionIndexDigest) {
      differences.push('the S0 index is not byte-identical to the production index');
    }
    for (const member of members) {
      if (member.treatmentApplied !== true) differences.push(`${member.condition}: the treatment was not proven at the model-visible session boundary (${member.indexPrecondition})`);
      if (member.pullAccountingConsistent !== true) differences.push(`${member.condition}: the pull accounting is inconsistent (${String(member.pullAccountingConsistent)})`);
      if (member.sessionFound !== true) differences.push(`${member.condition}: no durable session artifact was found, so delivery cannot be proven`);
      if (member.selectedHandleCount !== CANDIDATE_SET_SIZE) differences.push(`${member.condition}: ${String(member.selectedHandleCount)} selected handles, expected ${String(CANDIDATE_SET_SIZE)}`);
      if (member.sessionHandleCount < member.selectedHandleCount) differences.push(`${member.condition}: only ${String(member.sessionHandleCount)}/${String(member.selectedHandleCount)} selected handles appear in the model-visible prompt`);
      if (member.handleOccurrenceExact !== true) differences.push(`${member.condition}: a selected handle does not appear exactly once in the model-visible prompt (the §5 duplicate-handle confound)`);
      if (member.unknownRolePulls > 0) differences.push(`${member.condition}: ${String(member.unknownRolePulls)} pulled handle(s) have no known role — the candidate set and the pull telemetry disagree`);
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

/** §13: the complete capital statements of EVERY installed bundle, used to prove the index omits them. */
function allStatements() {
  const statements = [];
  for (const bundleId of ['B', 'C', 'D']) {
    const bundle = bundleCapital(bundleId);
    statements.push(bundle.proof.statement, bundle.reasoning.statement);
  }
  return statements;
}

async function main() {
  const matrixPath = join(RIG, 'trials.json');
  if (!existsSync(matrixPath)) throw new Error(`no matrix record at ${matrixPath}; run scripts/r2s/matrix.mjs first`);
  const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'));
  if (matrix.completed !== EXPECTED) {
    throw new Error(`§19: the matrix holds ${String(matrix.completed)} trials, the pre-registered count is ${String(EXPECTED)}; refusing to analyse an incomplete matrix`);
  }

  const normalized = matrix.trials.map(normalizeTrial);
  const blocks = isolationCheck(normalized);
  const confounded = new Set(blocks.filter((block) => block.confounded).map((block) => `${block.scenario}|${String(block.block)}`));
  const analysable = normalized.filter((trial) => !confounded.has(`${trial.scenario}|${String(trial.block)}`));

  const byScenario = {};
  for (const scenarioId of SCENARIO_IDS) {
    const scenarioName = SCENARIOS[scenarioId].name;
    const members = analysable.filter((trial) => trial.scenario === scenarioName);
    byScenario[scenarioId] = {
      s0: armSelectivity(members.filter((trial) => trial.condition === 'S0')),
      s1: armSelectivity(members.filter((trial) => trial.condition === 'S1' && trial.treatmentApplied)),
    };
  }
  const selectivity = analyseSelectivity(byScenario);

  /* -- §14/§16: the per-arm tables, raw counts first ------------------------------------------ */
  const median = (values) => {
    const sorted = values.filter((value) => typeof value === 'number').sort((left, right) => left - right);
    if (sorted.length === 0) return 'UNKNOWN';
    return sorted.length % 2 === 1 ? sorted[(sorted.length - 1) / 2] : Math.round((sorted[sorted.length - 1] / 2 + sorted[sorted.length / 2] / 2));
  };
  const arms = {};
  for (const scenarioId of SCENARIO_IDS) {
    const scenarioName = SCENARIOS[scenarioId].name;
    arms[scenarioId] = {};
    for (const condition of CONDITIONS) {
      const members = analysable.filter((trial) => trial.scenario === scenarioName && trial.condition === condition);
      arms[scenarioId][condition] = Object.freeze({
        n: members.length,
        targetPulls: `${String(members.reduce((total, trial) => total + trial.targetPulls, 0))}/${String(members.length * TARGET_COUNT)}`,
        distractorPulls: `${String(members.reduce((total, trial) => total + trial.distractorPulls, 0))}/${String(members.length * DISTRACTOR_COUNT)}`,
        totalPulls: members.reduce((total, trial) => total + trial.totalPulls, 0),
        targetRecall: `${String(members.reduce((total, trial) => total + trial.targetPulls, 0))}/${String(members.length * TARGET_COUNT)}`,
        distractorRate: `${String(members.reduce((total, trial) => total + trial.distractorPulls, 0))}/${String(members.length * DISTRACTOR_COUNT)}`,
        perTrial: members.map((trial) => ({ trialId: trial.trialId, target: trial.targetPulls, distractor: trial.distractorPulls, total: trial.totalPulls, order: trial.pullOrderRoles })),
        precision: (() => {
          const total = members.reduce((sum, trial) => sum + trial.totalPulls, 0);
          return total === 0 ? 'UNKNOWN' : `${String(members.reduce((sum, trial) => sum + trial.targetPulls, 0))}/${String(total)}`;
        })(),
        pulledAll: `${String(members.filter((trial) => trial.pulledAll).length)}/${String(members.length)}`,
        pulledAny: `${String(members.filter((trial) => trial.pulledAny).length)}/${String(members.length)}`,
        targetRetrieved: `${String(members.filter((trial) => trial.targetPulls > 0).length)}/${String(members.length)}`,
        firstTargetPullOrdinalMedian: median(members.map((trial) => trial.firstTargetPullOrdinal).filter((value) => typeof value === 'number')),
        firstDistractorPullOrdinalMedian: median(members.map((trial) => trial.firstDistractorPullOrdinal).filter((value) => typeof value === 'number')),
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

  /* -- §11: the ACHIEVED order balance, reported rather than asserted ------------------------- */
  const orderBalance = (() => {
    const rows = [];
    for (const scenarioId of SCENARIO_IDS) {
      const scenarioName = SCENARIOS[scenarioId].name;
      for (const condition of CONDITIONS) {
        for (const trial of analysable.filter((entry) => entry.scenario === scenarioName && entry.condition === condition)) {
          rows.push({
            trialId: trial.trialId,
            order: trial.realizedOrder.map((entry) => `${String(entry.position)}:${entry.role}`),
            targetPositions: trial.rolePositions?.targetPositions ?? [],
            distractorPositions: trial.rolePositions?.distractorPositions ?? [],
          });
        }
      }
    }
    const firstPositionRoles = rows.map((row) => row.order[0]?.split(':')[1] ?? 'UNKNOWN');
    return Object.freeze({
      note: 'the production compiler orders the index by content-addressed identity, which the harness may not change (§25). The only lawful order lever is WHICH distractors are selected, so the order varies across BLOCKS and is identical across the S0/S1 pair within a block.',
      rows,
      firstPositionTargetShare: `${String(firstPositionRoles.filter((role) => role === 'TARGET').length)}/${String(rows.length)}`,
      targetPositionsObserved: [...new Set(rows.flatMap((row) => row.targetPositions))].sort((left, right) => left - right),
      distractorPositionsObserved: [...new Set(rows.flatMap((row) => row.distractorPositions))].sort((left, right) => left - right),
    });
  })();

  /* -- §17: the pull-all reading ------------------------------------------------------------- */
  const pullAllReading = (() => {
    const all = analysable.filter((trial) => trial.pulledAll).length;
    return Object.freeze({
      pullAllTrials: `${String(all)}/${String(analysable.length)}`,
      interpretation: all === analysable.length
        ? 'both arms pulled all six in every analysed trial: the worker used selectedness as a SET-LEVEL instruction and did not perform item-level routing under this choice pressure'
        : 'pull-all occurred in some but not all trials',
    });
  })();

  /* -- §21: the association-only task comparison (never consulted by the verdict) ------------- */
  const association = (() => {
    const summary = (members) => Object.freeze({
      n: members.length,
      fullSolved: `${String(members.filter((trial) => trial.finalAcceptanceSolved).length)}/${String(members.length)}`,
      mistakeRecurred: `${String(members.filter((trial) => trial.knownFailureRecurred === true).length)}/${String(members.length)}`,
    });
    return Object.freeze({
      note: 'recorded for completeness ONLY. The verdict reads routing/selectivity, never task success (§21).',
      pullers: summary(analysable.filter((trial) => trial.pulledAny)),
      nonPullers: summary(analysable.filter((trial) => !trial.pulledAny)),
    });
  })();

  /* -- §13: the preview manifest and the leakage check over the EXACT rendered S1 sections ---- */
  const previewManifest = analysable.filter((trial) => trial.condition === 'S1').flatMap((trial) => trial.indexManifest.map((entry) => ({ trialId: trial.trialId, ...entry })));
  const leakage = (() => {
    const problems = [];
    const statements = allStatements();
    for (const trial of analysable.filter((entry) => entry.condition === 'S1')) {
      const scenarioId = trial.scenario === SCENARIOS.C.name ? 'C' : 'D';
      const forbidden = [SCENARIOS[scenarioId].taskObjective, SCENARIOS[scenarioId].knownFailure].filter((value) => typeof value === 'string');
      const check = previewLeakage({ previewText: trial.indexSection, sourceField: '', forbidden });
      for (const problem of check.problems) problems.push({ trialId: trial.trialId, problem });
      for (const statement of statements) {
        if (statement.length > 60 && trial.indexSection.includes(statement)) problems.push({ trialId: trial.trialId, problem: 'the rendered index contains a complete capital body statement' });
      }
    }
    return Object.freeze({ leaked: problems.length > 0, problems: Object.freeze(problems), statementsChecked: statements.length });
  })();

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
    stage: 'R2-S',
    expectedTrials: EXPECTED,
    completedTrials: matrix.completed,
    seed: '0x52530201',
    confoundedBlocks: blocks.filter((block) => block.confounded),
    isolationBlocks: blocks,
    selectivity,
    arms,
    orderBalance,
    pullAllReading,
    association,
    previewManifest,
    leakage,
    transcriptDigests,
  });

  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(join(EVIDENCE, 'normalized-results.json'), `${JSON.stringify(sanitize({ schemaVersion: 1, trials: normalized }), null, 2)}\n`, 'utf8');
  writeFileSync(join(EVIDENCE, 'analysis.json'), `${JSON.stringify(sanitize(analysis), null, 2)}\n`, 'utf8');
  writeFileSync(join(EVIDENCE, 'preview-manifest.json'), `${JSON.stringify(sanitize({ schemaVersion: 1, stage: 'R2-S', entries: previewManifest }), null, 2)}\n`, 'utf8');

  out(`\nR2-S CAPITAL-SELECTIVITY ANALYSIS — ${String(matrix.completed)}/${String(EXPECTED)} trials, ${String(analysable.length)} analysable, ${String(confounded.size)} confounded block(s)`);
  for (const scenarioId of SCENARIO_IDS) {
    const a = arms[scenarioId];
    out(`  ${scenarioId}: S0 target ${a.S0.targetRecall} distractor ${a.S0.distractorRate} (precision ${a.S0.precision}, pullAll ${a.S0.pulledAll}) | S1 target ${a.S1.targetRecall} distractor ${a.S1.distractorRate} (precision ${a.S1.precision}, pullAll ${a.S1.pulledAll})`);
  }
  out(`  pull-all: ${pullAllReading.pullAllTrials}`);
  out(`  order: first-position target share ${orderBalance.firstPositionTargetShare}`);
  out(`  preview leakage: ${leakage.leaked ? 'LEAKED' : 'CLEAN'} (${String(leakage.problems.length)} problem(s))`);
  out(`  ${selectivity.verdict}`);
  out(`record: ${join(EVIDENCE, 'analysis.json')}`);
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}
