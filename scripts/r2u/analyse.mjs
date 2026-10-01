#!/usr/bin/env node
/**
 * R2-U §16/§17/§18/§19/§21/§22/§28 — NORMALIZE, ANALYSE, AND WRITE THE EVIDENCE.
 *
 * §28 requires the uptake verdict and the efficacy observations to be produced SEPARATELY and never merged.
 * §21 forbids the sentence "capital helps" merely because K1A1 outperformed K0A1, and requires the
 * distinction between the INTENT-TO-TREAT effect (randomized by affordance) and the OBSERVED-USE
 * association (not randomized — pullers and non-pullers are self-selected).
 *
 * §27's accounting requirement is enforced structurally: the analysis refuses to produce a verdict for a
 * matrix whose trial count is not the pre-registered one, so an incomplete run cannot be reported as a
 * result.
 *
 * §24: every artifact written here passes through `sanitize`, which replaces absolute local paths with
 * placeholders. Credentials and private reasoning are never captured in the first place: the trial harness
 * records observable fields only, and the worker's own summary is its self-report, not its chain-of-thought.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { analyseUptake, CELLS, EXPECTED_TRIALS, pullRates, REPETITIONS, SCENARIO_IDS, UPTAKE_VERDICTS } from './design.mjs';
import { PAIRED_STATE_COMPARABLE_FIELDS, SCENARIOS } from './scenarios.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, '').split('=');
  return [key, rest.join('=')];
}));
const RIG = args.get('rig') ?? join(homedir(), '.palimpsest-r2u', 'matrix');
const CALIBRATION_RIG = args.get('calibration') ?? join(homedir(), '.palimpsest-r2u', 'calibration');
const EXPECTED = Number(args.get('expected') ?? String(EXPECTED_TRIALS));
const EVIDENCE = join(REPO_ROOT, 'research-evidence', 'r2-u');

/** §24: strip absolute local paths. The replacement keeps the artifact readable without the machine prefix. */
function sanitize(value) {
  if (typeof value === 'string') {
    return value
      .replace(/[A-Za-z]:\\+Users\\+[^\\/\s"]+/gu, '<home>')
      .replace(/[A-Za-z]:\\+[^"\s]*/gu, (match) => (match.includes('.r2u-') ? '<rig>' : '<abs>'))
      .replace(/\/(?:home|Users)\/[^/\s"]+/gu, '<home>');
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [key, inner] of Object.entries(value)) {
      // A field that could carry a credential is dropped outright rather than sanitized.
      if (/credential|token|secret|password|api[-_]?key/iu.test(key)) continue;
      out[key] = sanitize(inner);
    }
    return out;
  }
  return value;
}

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/** §16/§17/§18: the pre-registered per-trial outcome list, normalized. */
export function normalizeTrial(record) {
  const worker = record.worker ?? {};
  const pulled = Array.isArray(worker.pulledHandles) ? worker.pulledHandles : [];
  const proofHandles = pulled.filter((handle) => typeof handle === 'string' && handle.startsWith('@ctx/proof/'));
  const reasoningHandles = pulled.filter((handle) => typeof handle === 'string' && handle.startsWith('@ctx/reasoning/'));
  const procedureHandles = pulled.filter((handle) => typeof handle === 'string' && handle.startsWith('@ctx/procedure/'));
  return Object.freeze({
    trialId: record.trialId,
    scenario: record.scenario,
    cell: record.cell,
    factorK: record.factorK,
    factorA: record.factorA,
    block: record.block,
    repetition: record.repetition,

    /** §16: PRIMARY metric inputs. */
    handlesVisible: record.prompt?.indexHandleCount ?? 0,
    pulledCount: pulled.length,
    pulledHandles: pulled,
    proofPulled: proofHandles.length > 0,
    reasoningPulled: reasoningHandles.length > 0,
    procedurePulled: procedureHandles.length > 0,
    epistemicPulled: proofHandles.length > 0 || reasoningHandles.length > 0,
    anyPull: pulled.length > 0,

    /** §16: the ORDERING facts, which distinguish "pulled before working" from "pulled after failing". */
    firstPullOrdinal: record.firstPullOrdinal ?? 'UNKNOWN',
    pulledBeforeFirstEdit: record.pulledBeforeFirstEdit ?? 'UNKNOWN',
    pulledBeforeFirstVisibleTest: record.pulledBeforeFirstVisibleTest ?? 'UNKNOWN',
    pulledBeforeFirstHiddenSubmission: record.pulledBeforeFirstHiddenSubmission ?? 'UNKNOWN',
    /**
     * §17: the timing facts. The live trial cannot compute these — the session artifact is not complete while
     * the worker is alive — so they are merged in afterwards by `pull-timing.mjs` from the DURABLE session the
     * host itself wrote, and they are kept under a labelled key so a reader can tell a post-hoc field apart
     * from a live one.
     */
    timeToFirstPullMs: record.postHocTiming?.timeToFirstPullMs ?? 'UNKNOWN',
    toolActionsBeforeFirstPull: record.postHocTiming?.toolActionsBeforeFirstPull ?? 'UNKNOWN',
    postHocTiming: record.postHocTiming ?? null,

    /** §16: completion and honest failure accounting. */
    workerCompleted: worker.outcomeKind === 'READY_FOR_SETTLEMENT',
    workerOutcomeKind: worker.outcomeKind ?? 'UNKNOWN',
    hostFailure: record.hostFailure !== null && record.hostFailure !== undefined,
    timedOut: record.timedOut === true,
    jobPhase: record.jobPhase ?? 'UNKNOWN',

    /** §18: EFFICACY outcomes — recorded, but secondary. */
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
    tokens: record.tokens?.exposed === true ? record.tokens : 'UNKNOWN',

    /** §8/§23: the isolation and confidentiality facts, for the record. */
    ordinaryTaskDigest: record.prompt?.ordinaryTaskDigest ?? 'UNKNOWN',
    indexSectionDigest: record.prompt?.indexSectionDigest ?? 'UNKNOWN',
    affordanceClauseDigest: record.prompt?.affordanceClauseDigest ?? 'UNKNOWN',
    capabilitySetDigest: record.prompt?.capabilitySetDigest ?? 'UNKNOWN',
    offeredTools: worker.offeredTools ?? [],
    reportedAffordance: worker.reportedAffordance ?? 'UNKNOWN',
    capacity: record.confidentiality?.capacity ?? null,
    pairedState: record.pairedState ?? null,
  });
}

/**
 * §8: mark a block CONFOUNDED when its four cells do not share the comparable paired-state fields, or when
 * their ordinary-task / capability-set digests differ.
 *
 * THE TWO THINGS ALLOWED TO DIFFER are the context index and the affordance clause — those are the
 * treatment — so they are deliberately not compared here. They ARE required to differ in the direction the
 * design says they should, which is checked separately below.
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
    if (members.length !== 4) differences.push(`expected 4 cells, found ${String(members.length)}`);
    for (const field of PAIRED_STATE_COMPARABLE_FIELDS) {
      const values = new Set(members.map((trial) => JSON.stringify(trial.pairedState?.[field] ?? null)));
      if (values.size > 1) differences.push(`pairedState.${field} differs across cells`);
    }
    const ordinary = new Set(members.map((trial) => trial.ordinaryTaskDigest));
    if (ordinary.size > 1) differences.push('the ordinary task text differs across cells');
    const capability = new Set(members.map((trial) => trial.capabilitySetDigest));
    if (capability.size > 1) differences.push('the worker capability set differs across cells');
    /** §8: the K factor MUST change the visible index, and the A factor MUST change the clause. */
    for (const member of members) {
      const expectedHandles = member.factorK === 1 ? 3 : 0;
      if (member.handlesVisible !== expectedHandles) {
        differences.push(`${member.cell}: the visible index has ${String(member.handlesVisible)} handle(s), the design says ${String(expectedHandles)}`);
      }
    }
    const a1 = members.filter((member) => member.factorA === 1);
    const a0 = members.filter((member) => member.factorA === 0);
    const a1Clauses = new Set(a1.map((member) => member.affordanceClauseDigest));
    const a0Clauses = new Set(a0.map((member) => member.affordanceClauseDigest));
    if (a1Clauses.size !== 1 || a0Clauses.size !== 1 || [...a1Clauses][0] === [...a0Clauses][0]) {
      differences.push('the affordance clause digest does not separate A0 from A1 exactly');
    }
    blocks.push(Object.freeze({ scenario, block: Number(block), cells: members.map((member) => member.cell).sort(), confounded: differences.length > 0, differences: Object.freeze(differences) }));
  }
  return Object.freeze(blocks);
}

/** §19: raw counts first. Nothing here is a score. */
function counts(trials) {
  const n = trials.length;
  const median = (values) => {
    const sorted = values.filter((value) => typeof value === 'number').sort((left, right) => left - right);
    if (sorted.length === 0) return 'UNKNOWN';
    return sorted.length % 2 === 1 ? sorted[(sorted.length - 1) / 2] : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2);
  };
  return Object.freeze({
    n,
    anyPull: `${String(trials.filter((trial) => trial.anyPull).length)}/${String(n)}`,
    proofPulled: `${String(trials.filter((trial) => trial.proofPulled).length)}/${String(n)}`,
    reasoningPulled: `${String(trials.filter((trial) => trial.reasoningPulled).length)}/${String(n)}`,
    procedurePulled: `${String(trials.filter((trial) => trial.procedurePulled).length)}/${String(n)}`,
    medianHandlesPulled: median(trials.map((trial) => trial.pulledCount)),
    medianTimeToFirstPullMs: median(trials.map((trial) => trial.timeToFirstPullMs)),
    finalSolved: `${String(trials.filter((trial) => trial.finalAcceptanceSolved).length)}/${String(n)}`,
    firstCandidateSolved: `${String(trials.filter((trial) => trial.firstCandidateSolved).length)}/${String(n)}`,
    knownFailureRecurred: `${String(trials.filter((trial) => trial.knownFailureRecurred === true).length)}/${String(n)}`,
    knownFailureUnknown: trials.filter((trial) => trial.knownFailureRecurred === 'UNKNOWN').length,
    medianVisibleOracleInvocations: median(trials.map((trial) => trial.visibleOracleInvocations)),
    medianImplementationRevisions: median(trials.map((trial) => trial.implementationRevisions)),
    medianElapsedMs: median(trials.map((trial) => trial.elapsedMs)),
    hostFailures: trials.filter((trial) => trial.hostFailure).length,
    timeouts: trials.filter((trial) => trial.timedOut).length,
    workerCompleted: trials.filter((trial) => trial.workerCompleted).length,
    /** §17: capital shown but never used. */
    capitalShownNeverUsed: trials.filter((trial) => trial.handlesVisible > 0 && trial.pulledCount === 0).length,
  });
}

const out = (line) => process.stdout.write(`${line}\n`);

async function main() {
  const matrixPath = join(RIG, 'trials.json');
  if (!existsSync(matrixPath)) throw new Error(`no matrix record at ${matrixPath}; run scripts/r2u/matrix.mjs first`);
  const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'));
  /** §27: the accounting requirement, enforced rather than asserted in prose. */
  if (matrix.completed !== EXPECTED) {
    throw new Error(`§27: the matrix holds ${String(matrix.completed)} trials, the pre-registered count is ${String(EXPECTED)}; refusing to analyse an incomplete matrix`);
  }

  /**
   * §17: PRESERVE any post-hoc timing already merged from the durable session artifacts. `normalizeTrial`
   * reads `postHocTiming`, so re-running the analysis without this would silently DROP the timing fields and
   * report them as UNKNOWN — the numbers would disappear from the report for a reason that has nothing to do
   * with the experiment. The previously written file is the carrier, keyed by trial id.
   */
  const priorTiming = (() => {
    const priorPath = join(EVIDENCE, 'normalized-results.json');
    if (!existsSync(priorPath)) return new Map();
    try {
      const prior = JSON.parse(readFileSync(priorPath, 'utf8'));
      return new Map((prior.trials ?? []).filter((trial) => trial.postHocTiming !== undefined).map((trial) => [trial.trialId, trial.postHocTiming]));
    } catch {
      return new Map();
    }
  })();
  const normalized = matrix.trials.map((record) => normalizeTrial({ ...record, postHocTiming: record.postHocTiming ?? priorTiming.get(record.trialId) }));
  const blocks = isolationCheck(normalized);
  const confounded = new Set(blocks.filter((block) => block.confounded).map((block) => `${block.scenario}|${String(block.block)}`));
  const usable = normalized.filter((trial) => !confounded.has(`${trial.scenario}|${String(trial.block)}`));

  /* -- §16/§19: pull rates per cell, per scenario ---------------------------------------------- */
  const byScenarioRates = {};
  const byScenarioCounts = {};
  for (const scenarioId of SCENARIO_IDS) {
    const scenarioName = SCENARIOS[scenarioId].name;
    const members = usable.filter((trial) => trial.scenario === scenarioName);
    byScenarioRates[scenarioId] = pullRates(members);
    const cellCounts = {};
    for (const cell of CELLS) cellCounts[cell] = counts(members.filter((trial) => trial.cell === cell));
    byScenarioCounts[scenarioId] = Object.freeze(cellCounts);
  }

  /* -- §20/§28: THE UPTAKE VERDICT, from the pre-declared criteria ---------------------------- */
  const uptake = analyseUptake(byScenarioRates);

  /* -- §19: the placebo and interaction comparisons, as raw counts ---------------------------- */
  const comparisons = {};
  for (const scenarioId of SCENARIO_IDS) {
    const rates = byScenarioRates[scenarioId];
    const countsFor = (cell) => {
      const members = usable.filter((trial) => trial.scenario === SCENARIOS[scenarioId].name && trial.cell === cell);
      return { n: members.length, pulled: members.filter((trial) => trial.anyPull).length };
    };
    comparisons[scenarioId] = Object.freeze({
      primary: Object.freeze({ comparison: 'K1A0 vs K1A1', baseline: countsFor('K1A0'), affordance: countsFor('K1A1') }),
      placebo: Object.freeze({ comparison: 'K0A0 vs K0A1', baseline: countsFor('K0A0'), affordance: countsFor('K0A1') }),
      interaction: Object.freeze({ k1Shift: rates.K1A1.rate - rates.K1A0.rate, k0Shift: rates.K0A1.rate - rates.K0A0.rate, difference: rates.K1A1.rate - rates.K1A0.rate - (rates.K0A1.rate - rates.K0A0.rate) }),
      /** §19: N=5 per cell, so no p-value is computed or claimed. */
      note: 'raw counts only; with N=5 per cell no significance claim is made',
    });
  }

  /* -- §21: INTENT-TO-TREAT vs OBSERVED-USE, kept apart ---------------------------------------- */
  const efficacy = {};
  for (const scenarioId of SCENARIO_IDS) {
    const scenarioName = SCENARIOS[scenarioId].name;
    const members = usable.filter((trial) => trial.scenario === scenarioName);
    const pullers = members.filter((trial) => trial.anyPull);
    const nonPullers = members.filter((trial) => !trial.anyPull);
    const solved = (list) => `${String(list.filter((trial) => trial.finalAcceptanceSolved).length)}/${String(list.length)}`;
    const firstSolved = (list) => `${String(list.filter((trial) => trial.firstCandidateSolved).length)}/${String(list.length)}`;
    const recurred = (list) => `${String(list.filter((trial) => trial.knownFailureRecurred === true).length)}/${String(list.length)}`;
    efficacy[scenarioId] = Object.freeze({
      /**
       * §21: the intent-to-treat view — every trial in the cell, by RANDOMIZED assignment. This is the only
       * comparison that supports a causal statement.
       */
      intentToTreat: Object.freeze(
        Object.fromEntries(
          CELLS.map((cell) => {
            const cellMembers = members.filter((trial) => trial.cell === cell);
            return [cell, Object.freeze({ n: cellMembers.length, finalSolved: solved(cellMembers), firstCandidateSolved: firstSolved(cellMembers), knownFailureRecurred: recurred(cellMembers) })];
          }),
        ),
      ),
      /**
       * §21: the observed-use association — SELF-SELECTED, not randomized. Reported separately and never
       * used as if the pull itself had been assigned.
       */
      observedUse: Object.freeze({
        pullers: Object.freeze({ n: pullers.length, finalSolved: solved(pullers), firstCandidateSolved: firstSolved(pullers), knownFailureRecurred: recurred(pullers) }),
        nonPullers: Object.freeze({ n: nonPullers.length, finalSolved: solved(nonPullers), firstCandidateSolved: firstSolved(nonPullers), knownFailureRecurred: recurred(nonPullers) }),
        note: 'pullers and non-pullers are SELF-SELECTED; this is an association, not an effect',
      }),
      /**
       * §21: the analysis is only meaningful where a governed body was actually pulled. Reported so a
       * reader can see whether the efficacy question was even reachable.
       */
      efficacyAnalysable: pullers.length > 0,
    });
  }

  /* -- §22: Procedure-specific, recorded without reopening the factorial ----------------------- */
  const procedureSpecific = {};
  for (const scenarioId of SCENARIO_IDS) {
    const members = usable.filter((trial) => trial.scenario === SCENARIOS[scenarioId].name && trial.factorK === 1);
    procedureSpecific[scenarioId] = Object.freeze({
      k1Trials: members.length,
      procedurePulled: members.filter((trial) => trial.procedurePulled).length,
      proofPulled: members.filter((trial) => trial.proofPulled).length,
      reasoningPulled: members.filter((trial) => trial.reasoningPulled).length,
      note: 'recorded only; the C1/C2 factorial is NOT reopened and the experiment is not changed mid-run',
    });
  }

  /* -- §13: the calibration record, carried alongside the primary result ---------------------- */
  const calibrationPath = join(CALIBRATION_RIG, 'calibration.json');
  const calibration = existsSync(calibrationPath) ? JSON.parse(readFileSync(calibrationPath, 'utf8')) : null;

  /**
   * §23/§35: THE CONFIDENTIALITY REGRESSION CHECK, read from every trial's OWN worker telemetry rather than
   * assumed. §23 says a regression STOPS R2-U, so the check is part of the analysis record: if a boundary
   * failed to install, a capacity admission was refused, or the fail-closed capability gate rejected a
   * worker, the numbers above were collected under a broken boundary and the report must say so.
   */
  const confidentiality = (() => {
    const withTelemetry = matrix.trials.filter((record) => record.confidentiality !== null && record.confidentiality !== undefined);
    const boundaryInstalled = withTelemetry.filter((record) => record.confidentiality.boundary?.installed === true).length;
    const capacityGranted = withTelemetry.filter((record) => record.confidentiality.capacity?.granted === true).length;
    const capabilityAllowed = withTelemetry.filter((record) => record.confidentiality.capabilities?.allowed === true).length;
    const kernelSupported = withTelemetry.filter((record) => record.confidentiality.boundary?.kernel?.supported === true).length;
    const unverifiedRoots = withTelemetry.flatMap((record) => record.confidentiality.boundary?.kernel?.unverified ?? []);
    return Object.freeze({
      trialsWithTelemetry: withTelemetry.length,
      totalTrials: matrix.trials.length,
      boundaryInstalled,
      kernelSupported,
      capacityGranted,
      capabilityAllowed,
      unverifiedRootCount: unverifiedRoots.length,
      hostFailures: matrix.trials.filter((record) => record.hostFailure !== null && record.hostFailure !== undefined).length,
      timeouts: matrix.trials.filter((record) => record.timedOut === true).length,
      /** The gate §23 turns on: every trial must show a granted slot, an installed boundary and an allowed surface. */
      noRegression: withTelemetry.length === matrix.trials.length && boundaryInstalled === matrix.trials.length && capacityGranted === matrix.trials.length && capabilityAllowed === matrix.trials.length,
    });
  })();

  const analysis = Object.freeze({
    schemaVersion: 1,
    stage: 'R2-U',
    confidentiality,
    expectedTrials: EXPECTED,
    completedTrials: matrix.completed,
    usableTrialCount: usable.length,
    confoundedBlocks: blocks.filter((block) => block.confounded),
    isolationBlocks: blocks,
    uptake,
    comparisons,
    efficacy,
    procedureSpecific,
    cellCounts: byScenarioCounts,
    calibrationVerdicts: calibration === null ? null : Object.fromEntries(Object.entries(calibration.scenarios).map(([id, entry]) => [id, entry.verdict])),
  });

  /* -- write the evidence (§24) --------------------------------------------------------------- */
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(join(EVIDENCE, 'normalized-results.json'), `${JSON.stringify(sanitize({ schemaVersion: 1, trials: normalized }), null, 2)}\n`, 'utf8');
  writeFileSync(join(EVIDENCE, 'analysis.json'), `${JSON.stringify(sanitize(analysis), null, 2)}\n`, 'utf8');

  out(`\nR2-U ANALYSIS — ${String(matrix.completed)}/${String(EXPECTED)} trials, ${String(usable.length)} usable`);
  for (const scenarioId of SCENARIO_IDS) {
    const rates = byScenarioRates[scenarioId];
    out(`  ${scenarioId}: K0A0 ${String(rates.K0A0.pulled)}/${String(rates.K0A0.n)} · K1A0 ${String(rates.K1A0.pulled)}/${String(rates.K1A0.n)} · K0A1 ${String(rates.K0A1.pulled)}/${String(rates.K0A1.n)} · K1A1 ${String(rates.K1A1.pulled)}/${String(rates.K1A1.n)}`);
  }
  out(`  confounded blocks: ${String(analysis.confoundedBlocks.length)}`);
  out(`  ${uptake.verdict}`);
  out(`record: ${join(EVIDENCE, 'analysis.json')}`);
}

/**
 * §25: the normalization and isolation helpers are IMPORTED by the deterministic tests and by
 * `isolation.mjs`, so `main()` runs only when this file is the entry point. Without the guard, importing
 * the module to test a pure function would try to analyse a matrix that may not exist yet.
 */
if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}
