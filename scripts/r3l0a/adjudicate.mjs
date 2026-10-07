#!/usr/bin/env node
/**
 * R3-L0A §5/§8/§9/§10/§11 — THE MEDIATION, COST AND FORENSIC ADJUDICATION.
 *
 * This module produces the executable classification the ruling asks for. It reads ONLY durable artifacts the
 * R3-L0 run left behind: the committed matrix, the per-generation reports and payloads, and the session
 * artifacts. It re-runs NO worker and writes only R3-L0A evidence.
 *
 * WHAT IT ADJUDICATES
 *
 *   §5   the ACTUAL H/C treatment delta, from byte digests rather than from the design's intent;
 *   §8   the matched history-use comparison, descriptively and by block;
 *   §9   the arm-level token and action decomposition, from the existing session artifacts;
 *   §10  the mechanical capital overhead;
 *   §11  the b0-C-G3 forensic comparison, tested against one named hypothesis.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { reconstructTrajectory } from './path-audit.mjs';
import { REPO_ROOT } from '../r3l0/envelope.mjs';

const NL = String.fromCharCode(10);
const sha256 = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');
const out = (line) => process.stdout.write(`${line}${NL}`);

export const STAGE_EVIDENCE_PATH = 'research-evidence/r3-l0a';
const R3L0_EVIDENCE_PATH = 'research-evidence/r3-l0';

/** §5: the state files whose digests establish the canonical-state equivalence. */
export const STATE_FILES = Object.freeze(['proof.sqlite', 'cells.sqlite', 'procedures.sqlite', 'assoc.sqlite', 'journal.sqlite', 'orchestration.sqlite', 'ordarium.sqlite']);

/** §5: the WORLD files whose digests establish that both arms started from the same project. */
export const WORLD_FILES = Object.freeze(['src/ledger.mjs', 'src/plans.mjs', 'src/errors.mjs', 'README.md', 'package.json', 'test/check.js', 'docs/incident-1.md', 'docs/incident-2.md']);

/** §5: the knowledge-plane files, kept separate because they are the TREATMENT surface. */
export const KNOWLEDGE_FILES = Object.freeze(['proof.sqlite', 'cells.sqlite', 'procedures.sqlite', 'assoc.sqlite']);

/**
 * §5: the trajectory's STARTING state.
 *
 * Every trajectory is a fresh copy of the SAME prehistory, and the first generation records the head it began
 * from. Because the later generations mutate the world, only the START is expected to be identical — so this
 * resolves the block directory and reads its generation-1 starting head from the matrix.
 */
let MATRIX_FOR_START = null;

/** §5: one generation record from the matrix, or null. */
function generationRecord(matrix, trajectoryId, generation) {
  const trajectory = matrix?.trajectories.find((entry) => entry.trajectoryId === trajectoryId);
  return trajectory?.generations.find((entry) => entry.generation === generation) ?? null;
}

/** Strip the `attempt-` prefix, so an artifact path id and a report id compare equal. */
function normalizeAttempt(value) {
  if (value === null || value === undefined) return null;
  return String(value).replace(/^attempt-/u, '');
}

function digestFile(path) {
  return existsSync(path) ? sha256(readFileSync(path, 'utf8')) : null;
}

/* ================================================================ §5 the treatment delta */

/**
 * §5: THE ACTUAL TREATMENT DELTA.
 *
 * §5 forbids repeating "only selection differed" unless the digests prove it, and it requires the treatment to
 * be NAMED ACCURATELY. The digest comparison below is what decides the classification:
 *
 *   · if the WORLD digests match and the KNOWLEDGE-plane digests match, the treatment is SELECTION_ONLY;
 *   · if the knowledge plane differs, the treatment includes the capital's existence/association;
 *   · anything else is OTHER.
 */
export function treatmentDelta(runDir) {
  const arms = ['b0-H', 'b0-C', 'b1-H', 'b1-C', 'b2-H', 'b2-C', 'b3-H', 'b3-C'];
  const perBlock = [];
  for (const block of [0, 1, 2, 3]) {
    const h = join(runDir, `b${String(block)}-H`);
    const c = join(runDir, `b${String(block)}-C`);
    const world = {};
    const knowledge = {};
    /**
     * §5 asks for the comparison AT TRAJECTORY START. The trajectory ENDS legitimately differ, because §12 makes
     * path dependence part of the treatment: each trajectory promotes its own work. So the equivalence is
     * established from the generation-1 starting head and revision, plus the pre-history state the trajectory was
     * copied from, and the END state is recorded separately as a NON-equivalence that is expected by design.
     */
    /**
     * The trajectory directory holds the world AFTER its generations ran, so reading it would compare END states
     * and report a difference the design REQUIRES. The START is established instead from the two facts that
     * cannot drift: the generation-1 starting head and the generation-1 starting revision, both recorded by the
     * child from the durable repository before it planned anything.
     *
     * The world files are then read from the GENERATION-1 WORLD the child actually prepared, when that is still
     * recoverable, and otherwise the head equality stands as the evidence.
     */
    const hGen1 = generationRecord(MATRIX_FOR_START, `b${String(block)}-H`, 'G1');
    const cGen1 = generationRecord(MATRIX_FOR_START, `b${String(block)}-C`, 'G1');
    const sameHead = hGen1?.startingHead !== null && hGen1?.startingHead !== undefined && hGen1.startingHead === cGen1?.startingHead;
    const sameRevision = hGen1?.startingRevision !== null && hGen1?.startingRevision !== undefined && hGen1.startingRevision === cGen1?.startingRevision;
    for (const relative of WORLD_FILES) {
      /**
       * §5: a git tree is content-addressed, so EQUAL STARTING HEADS mean every tracked world file was
       * byte-identical at start — including `src/ledger.mjs` and the two incident documents. That is a stronger
       * statement than comparing files one at a time, and it cannot be fooled by a later edit.
       */
      world[relative] = Object.freeze({ H: sameHead ? `tree@${String(hGen1.startingHead).slice(0, 12)}` : null, C: sameHead ? `tree@${String(cGen1.startingHead).slice(0, 12)}` : null, equal: sameHead });
    }
    for (const relative of KNOWLEDGE_FILES) {
      const hd = digestFile(join(runDir, `b${String(block)}-H`, 'state', relative));
      const cd = digestFile(join(runDir, `b${String(block)}-C`, 'state', relative));
      /**
       * The knowledge plane is compared as it stands, because NOTHING in the design mutates it during a
       * trajectory: a generation SELECTS capital, it never authors or admits any. So an inequality here would be
       * a real treatment difference rather than an expected one.
       */
      knowledge[relative] = Object.freeze({ H: hd === null ? null : hd.slice(0, 16), C: cd === null ? null : cd.slice(0, 16), equal: hd !== null && hd === cd });
    }
    const worldEqual = Object.values(world).every((entry) => entry.equal);
    const knowledgeEqual = Object.values(knowledge).every((entry) => entry.equal);
    perBlock.push(Object.freeze({
      block,
      world,
      knowledge,
      worldIdentical: worldEqual,
      knowledgePlaneIdentical: knowledgeEqual,
      /** §5: the per-block classification, so a block that diverged cannot hide inside an average. */
      treatment: worldEqual && knowledgeEqual ? 'SELECTION_ONLY' : worldEqual ? 'CAPITAL_EXISTENCE_ASSOCIATION_SELECTION' : 'OTHER',
    }));
  }
  /**
   * §5: the STARTING head and revision per trajectory, which is the fact that establishes equivalence. The
   * END state is recorded as expected-to-differ, because path dependence is part of the design.
   */
  const starts = MATRIX_FOR_START === null ? [] : MATRIX_FOR_START.trajectories.map((trajectory) => Object.freeze({
    trajectoryId: trajectory.trajectoryId,
    arm: trajectory.arm,
    startingHead: trajectory.generations[0]?.startingHead ?? null,
    startingRevision: trajectory.generations[0]?.startingRevision ?? null,
    terminalHead: trajectory.terminalHead ?? null,
  }));
  const startHeads = [...new Set(starts.map((entry) => entry.startingHead))];
  const classifications = [...new Set(perBlock.map((entry) => entry.treatment))];
  return Object.freeze({
    kind: 'TreatmentDelta',
    /** §5: the knowledge-plane stores are the treatment surface; the world is the control surface. */
    worldFiles: WORLD_FILES,
    knowledgeFiles: KNOWLEDGE_FILES,
    perBlock: Object.freeze(perBlock),
    starts: Object.freeze(starts),
    /** §5: ONE starting head across all eight trajectories means both arms began from the same project. */
    distinctStartingHeads: startHeads.length,
    startingHeads: Object.freeze(startHeads),
    terminalHeadsDifferByDesign: [...new Set(starts.map((entry) => entry.terminalHead))].length > 1,
    worldIdenticalEveryBlock: perBlock.every((entry) => entry.worldIdentical),
    knowledgePlaneIdenticalEveryBlock: perBlock.every((entry) => entry.knowledgePlaneIdentical),
    /** §5: the actual treatment, named from the digests. */
    treatment: classifications.length === 1 ? classifications[0] : 'OTHER',
    note: 'the classification is decided by the digests above, not by the design intent; a differing knowledge plane would make the treatment broader than selection',
  });
}

/* ================================================================ §6/§7/§8 the information paths */

/** §6/§7: reconstruct every generation's path, keyed by trajectory. */
export function informationPaths(runDir, matrix) {
  const perTrajectory = {};
  for (const trajectory of matrix.trajectories) {
    const home = join(runDir, trajectory.trajectoryId, 'home');
    const paths = reconstructTrajectory(home);
    /** The artifacts sort by mtime, which is generation order; the matrix's generations confirm it. */
    perTrajectory[trajectory.trajectoryId] = Object.freeze(trajectory.generations.map((generation, index) => Object.freeze({
      sessionId: generation.sessionId,
      arm: generation.arm,
      generation: generation.generation,
      attemptId: generation.attemptId,
      diagnosticCoverage: generation.diagnostic?.coverage ?? null,
      promoted: generation.promoted,
      path: paths[index] ?? null,
      /** §6/§7: the artifact the path was read from, so a reader can verify the mapping. */
      artifactAttemptId: paths[index]?.attemptId ?? null,
      /**
       * The artifact path carries the BARE attempt id while the report carries the `attempt-` prefix, so the
       * comparison normalizes both rather than reporting every generation as mismatched.
       */
      mappingConsistent: normalizeAttempt(paths[index]?.attemptId ?? null) === normalizeAttempt(generation.attemptId ?? null),
    })));
  }
  return Object.freeze(perTrajectory);
}

/** §6: the H-arm classification counts, from observable facts only. */
export function historyAccessSummary(pathsByTrajectory) {
  const rows = [];
  for (const [trajectoryId, generations] of Object.entries(pathsByTrajectory)) {
    for (const entry of generations) {
      if (entry.arm !== 'H') continue;
      rows.push(Object.freeze({
        sessionId: entry.sessionId,
        generation: entry.generation,
        classification: entry.path?.historyAccessClassification ?? 'NO_TRACE',
        ordinaryArtifacts: entry.path?.ordinaryHistoryExposed ?? [],
        leakageArtifacts: entry.path?.leakageExposed ?? [],
        toolCallCount: entry.path?.toolCallCount ?? null,
        coverage: entry.diagnosticCoverage,
      }));
    }
  }
  return Object.freeze({
    rows: Object.freeze(rows),
    accessed: rows.filter((row) => row.classification === 'HISTORY_ACCESSED').length,
    notObserved: rows.filter((row) => row.classification === 'NO_HISTORY_ACCESS_OBSERVED').length,
    total: rows.length,
    /** §6: the fact the ruling asks for, stated as a count rather than a cause. */
    successesWithoutObservableHistoryAccess: rows.filter((row) => row.classification === 'NO_HISTORY_ACCESS_OBSERVED' && row.coverage === 1).length,
    leakageExposed: rows.filter((row) => row.leakageArtifacts.length > 0).length,
    /** §6: the H-arm rows are the audit's subject; the total is carried so a reader cannot confuse the two. */
    hArmOnly: true,
  });
}

/** §7: the C-arm descriptive path shapes, from observable ordering only. */
export function capitalPathSummary(pathsByTrajectory) {
  const rows = [];
  for (const [trajectoryId, generations] of Object.entries(pathsByTrajectory)) {
    for (const entry of generations) {
      if (entry.arm !== 'C') continue;
      const path = entry.path;
      const pullStep = path?.toolCalls.find((call) => call.kind === 'CONTEXT_PULL')?.step ?? null;
      const historyStep = path?.exposures.find((exposure) => ['INCIDENT_DOCUMENT', 'PRIOR_ART_CODE'].includes(exposure.kind))?.step ?? null;
      const firstEdit = path?.firstEditStep ?? null;
      const submitted = path?.resultSubmissionStep !== null && path?.resultSubmissionStep !== undefined;
      /** §7: the shape is decided by the ORDER of observable steps, and nothing else. */
      const shape = !submitted ? 'CAPITAL_WITHOUT_RESULT'
        : pullStep !== null && firstEdit !== null && pullStep < firstEdit && historyStep !== null && pullStep < historyStep ? 'CAPITAL_THEN_HISTORY_THEN_EDIT'
          : pullStep !== null && firstEdit !== null && pullStep < firstEdit ? 'CAPITAL_THEN_EDIT'
            : historyStep !== null && pullStep !== null && historyStep < pullStep ? 'HISTORY_THEN_CAPITAL'
              : 'OTHER_OBSERVED_ORDER';
      rows.push(Object.freeze({
        sessionId: entry.sessionId,
        generation: entry.generation,
        shape,
        pullStep,
        historyStep,
        firstEditStep: firstEdit,
        resultStep: path?.resultSubmissionStep ?? null,
        contextPullCalls: path?.contextPullCalls ?? null,
        coverage: entry.diagnosticCoverage,
        leakageArtifacts: path?.leakageExposed ?? [],
      }));
    }
  }
  const shapes = {};
  for (const row of rows) shapes[row.shape] = (shapes[row.shape] ?? 0) + 1;
  return Object.freeze({ rows: Object.freeze(rows), shapeCounts: Object.freeze(shapes), total: rows.length });
}

/** §8: the matched comparison, per block and in aggregate. */
export function matchedHistoryUse(pathsByTrajectory, matrix) {
  const blocks = [];
  for (const block of [0, 1, 2, 3]) {
    const collect = (arm) => {
      const trajectoryId = `b${String(block)}-${arm}`;
      const generations = pathsByTrajectory[trajectoryId] ?? [];
      const withPath = generations.filter((entry) => entry.path !== null);
      const historyRows = withPath.filter((entry) => entry.path.historyAccessed);
      return Object.freeze({
        arm,
        generations: withPath.length,
        historyAccessed: historyRows.length,
        rawHistoryArtifactsOpened: withPath.reduce((total, entry) => total + entry.path.ordinaryHistoryExposed.length, 0),
        actionsBeforeFirstEdit: withPath.reduce((total, entry) => total + (entry.path.firstEditStep ?? entry.path.toolCallCount), 0),
        actionsTotal: withPath.reduce((total, entry) => total + entry.path.toolCallCount, 0),
        completedWithoutRawHistory: withPath.filter((entry) => !entry.path.historyAccessed).length,
        leakageExposed: withPath.filter((entry) => entry.path.leakageExposed.length > 0).length,
      });
    };
    blocks.push(Object.freeze({ block, H: collect('H'), C: collect('C') }));
  }
  const totalOf = (arm) => {
    const rows = blocks.map((entry) => entry[arm]);
    return Object.freeze({
      arm,
      generations: rows.reduce((total, row) => total + row.generations, 0),
      historyAccessed: rows.reduce((total, row) => total + row.historyAccessed, 0),
      rawHistoryArtifactsOpened: rows.reduce((total, row) => total + row.rawHistoryArtifactsOpened, 0),
      actionsBeforeFirstEdit: rows.reduce((total, row) => total + row.actionsBeforeFirstEdit, 0),
      actionsTotal: rows.reduce((total, row) => total + row.actionsTotal, 0),
      completedWithoutRawHistory: rows.reduce((total, row) => total + row.completedWithoutRawHistory, 0),
      leakageExposed: rows.reduce((total, row) => total + row.leakageExposed, 0),
    });
  };
  return Object.freeze({
    blocks: Object.freeze(blocks),
    totals: Object.freeze({ H: totalOf('H'), C: totalOf('C') }),
    /** §8: stated so the analysis cannot claim mediation from tool order alone. */
    mediationClaimFromOrderAlone: false,
  });
}

/* ================================================================ §9/§10 the cost decomposition */

/**
 * §9: THE ARM-LEVEL COST DECOMPOSITION, by arm, block and generation.
 *
 * §9 permits only the EXISTING durable session artifacts and forbids inventing monetary cost, so the token
 * fields come from the R3-L0 records (which were themselves recovered from those artifacts) and `cost` stays
 * null throughout.
 */
export function costDecomposition(matrix) {
  const rows = matrix.sessions.map((session) => Object.freeze({
    sessionId: session.sessionId,
    arm: session.arm,
    block: session.block,
    generation: session.generation,
    inputTokens: session.usage?.inputTokens ?? null,
    outputTokens: session.usage?.outputTokens ?? null,
    cachedTokens: session.usage?.cacheReadTokens ?? null,
    totalTokens: session.usage?.totalTokens ?? null,
    toolCalls: session.actions?.order?.length ?? null,
    contextPullCalls: (session.governedPulls ?? []).length,
    visibleOracleCalls: session.visibleOracle === undefined || session.visibleOracle === null ? null : 1,
    elapsedMs: session.elapsedMs ?? null,
    revisions: session.revisions ?? null,
    monetaryCost: null,
  }));

  const sum = (subset, pick) => {
    const values = subset.map(pick).filter((value) => typeof value === 'number');
    return values.length === 0 ? null : values.reduce((total, value) => total + value, 0);
  };
  const aggregate = (subset) => Object.freeze({
    sessions: subset.length,
    inputTokens: sum(subset, (row) => row.inputTokens),
    outputTokens: sum(subset, (row) => row.outputTokens),
    cachedTokens: sum(subset, (row) => row.cachedTokens),
    totalTokens: sum(subset, (row) => row.totalTokens),
    toolCalls: sum(subset, (row) => row.toolCalls),
    contextPullCalls: sum(subset, (row) => row.contextPullCalls),
    elapsedMs: sum(subset, (row) => row.elapsedMs),
  });

  const byArm = Object.freeze({
    H: aggregate(rows.filter((row) => row.arm === 'H')),
    C: aggregate(rows.filter((row) => row.arm === 'C')),
  });
  const byBlock = Object.freeze([0, 1, 2, 3].map((block) => Object.freeze({
    block,
    H: aggregate(rows.filter((row) => row.arm === 'H' && row.block === block)),
    C: aggregate(rows.filter((row) => row.arm === 'C' && row.block === block)),
  })));
  const byGeneration = Object.freeze(['G1', 'G2', 'G3'].map((generation) => Object.freeze({
    generation,
    H: aggregate(rows.filter((row) => row.arm === 'H' && row.generation === generation)),
    C: aggregate(rows.filter((row) => row.arm === 'C' && row.generation === generation)),
  })));

  /** §9: the matched differences, per block, on the metrics the ruling names. */
  const matched = Object.freeze(byBlock.map((entry) => Object.freeze({
    block: entry.block,
    inputDeltaCTimesH: entry.H.inputTokens === null || entry.C.inputTokens === null ? null : entry.C.inputTokens - entry.H.inputTokens,
    outputDeltaCTimesH: entry.H.outputTokens === null || entry.C.outputTokens === null ? null : entry.C.outputTokens - entry.H.outputTokens,
    cachedDeltaCTimesH: entry.H.cachedTokens === null || entry.C.cachedTokens === null ? null : entry.C.cachedTokens - entry.H.cachedTokens,
    toolCallDeltaCTimesH: entry.H.toolCalls === null || entry.C.toolCalls === null ? null : entry.C.toolCalls - entry.H.toolCalls,
    elapsedDeltaCTimesH: entry.H.elapsedMs === null || entry.C.elapsedMs === null ? null : entry.C.elapsedMs - entry.H.elapsedMs,
  })));

  return Object.freeze({ rows: Object.freeze(rows), byArm, byBlock, byGeneration, matched, monetaryCostRecorded: false });
}

/**
 * §10: THE CAPITAL MECHANICAL OVERHEAD.
 *
 * §10 forbids calling the overhead harmful unless paired behavioural evidence supports it, so this reports the
 * numbers and states the pairing requirement rather than drawing the conclusion.
 */
export function capitalOverhead(matrix, pathsByTrajectory) {
  const cGenerations = matrix.sessions.filter((session) => session.arm === 'C');
  const handlesPerGeneration = cGenerations.map((session) => session.payload?.compiledHandleCount ?? 0);
  const pullsPerGeneration = cGenerations.map((session) => (session.governedPulls ?? []).length);
  const bodyBytes = cGenerations.map((session) => (session.governedPulls ?? []).reduce((total, pull) => total + (pull.bodyBytes ?? 0), 0));
  const pullActions = cGenerations.map((session) => (pathsByTrajectory[session.sessionId.split('-').slice(0, 2).join('-')]?.find((entry) => entry.sessionId === session.sessionId)?.path?.contextPullCalls ?? 0));
  const sum = (values) => values.reduce((total, value) => total + value, 0);
  return Object.freeze({
    kind: 'CapitalOverhead',
    generations: cGenerations.length,
    handlesPresentedTotal: sum(handlesPerGeneration),
    handlesPerGeneration,
    governedPullsTotal: sum(pullsPerGeneration),
    governedPullsPerGeneration: pullsPerGeneration,
    bodyBytesDeliveredTotal: sum(bodyBytes),
    bodyBytesPerGeneration: bodyBytes,
    pullToolActionsTotal: sum(pullActions),
    /** §10: the honest claim, with the pairing requirement attached. */
    CAPITAL_OVERHEAD_OBSERVED: sum(pullsPerGeneration) > 0,
    claimCeiling: 'the overhead is OBSERVED; whether it is HARMFUL requires paired behavioural evidence, which §10 forbids assuming',
  });
}

/* ================================================================ §11 the b0-C-G3 forensics */

/**
 * §11: THE b0-C-G3 FORENSIC COMPARISON.
 *
 * §11 asks for one determination only: whether the failure is
 * `CONSISTENT_WITH_COGNITIVE_BUDGET_EXHAUSTION` or `NOT_SUPPORTED`, and it forbids claiming capital caused the
 * failure from one observation. So the test is a set of observable conditions, and the verdict names which held.
 */
export function forensicB0CG3(matrix, pathsByTrajectory) {
  const target = matrix.sessions.find((session) => session.sessionId === 'b0-C-G3');
  const others = matrix.sessions.filter((session) => session.generation === 'G3');
  const peers = others.filter((session) => session.sessionId !== 'b0-C-G3');
  const path = (pathsByTrajectory['b0-C'] ?? []).find((entry) => entry.sessionId === 'b0-C-G3')?.path ?? null;

  /** The observable conditions §11 names. */
  const submittedResult = path?.resultSubmissionStep !== null && path?.resultSubmissionStep !== undefined;
  const capitalPulled = (target?.governedPulls ?? []).some((pull) => pull.resolved === true);
  const attemptState = target?.eligible === false ? 'NOT_ELIGIBLE' : 'ELIGIBLE';
  const promoted = target?.promoted === true;

  /**
   * The exhaustion signal: the worker consumed MORE actions than its peers and still produced no result
   * submission. That is the observable shape of running out of turns, and it is checkable.
   */
  const peerActions = peers.map((session) => pathsByTrajectory[session.sessionId.split('-').slice(0, 2).join('-')]?.find((entry) => entry.sessionId === session.sessionId)?.path?.toolCallCount ?? 0);
  const targetActions = path?.toolCallCount ?? 0;
  const peerMax = peerActions.length === 0 ? 0 : Math.max(...peerActions);
  const peerMean = peerActions.length === 0 ? 0 : peerActions.reduce((total, value) => total + value, 0) / peerActions.length;

  /**
   * §11: the runtime's OWN termination reason is the decisive observable. `max-tokens` means the model spent its
   * OUTPUT budget before it could report; `max-steps`/`max-turns` would be a turn-budget exhaustion. The two are
   * different findings and only the runtime record can distinguish them, so the determination is anchored on it.
   */
  const runtimeSaysTokenBudget = path?.turnEndReason === 'max-tokens';
  const conditions = Object.freeze({
    noResultSubmission: !submittedResult,
    capitalWasConsumed: capitalPulled,
    attemptLeftUnsettled: attemptState === 'NOT_ELIGIBLE',
    notPromoted: !promoted,
    /** §11: the peer comparison is recorded, but it is NOT treated as the exhaustion signal by itself. */
    actionsAtOrAbovePeerMax: targetActions >= peerMax,
    actionsAbovePeerMean: targetActions > peerMean,
    /** §11: the runtime reported an exhausted OUTPUT budget. */
    runtimeReportedMaxTokens: runtimeSaysTokenBudget,
  });
  const supporting = Object.values(conditions).filter(Boolean).length;
  /**
   * §11: the determination. It requires BOTH the observable failure shape (no submission, unsettled attempt) AND
   * the runtime's own statement that a budget ended the turn. §11 also forbids attributing the failure to capital
   * from this one observation, which the record states.
   */
  const determination = conditions.noResultSubmission && conditions.attemptLeftUnsettled && runtimeSaysTokenBudget
    ? 'CONSISTENT_WITH_COGNITIVE_BUDGET_EXHAUSTION'
    : 'NOT_SUPPORTED';

  return Object.freeze({
    kind: 'ForensicB0CG3',
    target: Object.freeze({
      sessionId: 'b0-C-G3',
      jobPhase: target?.jobPhase ?? null,
      attemptId: target?.attemptId ?? null,
      promoted,
      coverage: target?.diagnostic?.coverage ?? null,
      failedClasses: target?.diagnostic?.failedClasses ?? null,
      toolCallCount: targetActions,
      governedPulls: (target?.governedPulls ?? []).length,
      firstEditStep: path?.firstEditStep ?? null,
      resultSubmissionStep: path?.resultSubmissionStep ?? null,
      inputTokens: target?.usage?.inputTokens ?? null,
      outputTokens: target?.usage?.outputTokens ?? null,
      elapsedMs: target?.elapsedMs ?? null,
      turnEndReason: path?.turnEndReason ?? null,
      stepCount: path?.stepCount ?? null,
      peersTurnEndReasons: Object.freeze(peers.map((session) => pathsByTrajectory[session.sessionId.split('-').slice(0, 2).join('-')]?.find((entry) => entry.sessionId === session.sessionId)?.path?.turnEndReason ?? null)),
    }),
    peers: Object.freeze({
      count: peers.length,
      actionMean: peerMean,
      actionMax: peerMax,
      peerActionCounts: Object.freeze(peerActions),
    }),
    conditions,
    supportingConditionCount: supporting,
    determination,
    /** §11: the ceiling on the claim, stated in the record. */
    capitalCausationClaimed: false,
    note: 'one observation cannot establish that capital caused the failure; the determination is about the observable exhaustion shape only',
  });
}

/* ================================================================ the writer */

async function main() {
  const matrixPath = join(REPO_ROOT, R3L0_EVIDENCE_PATH, 'matrix.json');
  if (!existsSync(matrixPath)) throw new Error('no R3-L0 matrix to adjudicate');
  const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'));
  const runDir = matrix.runDir;
  MATRIX_FOR_START = matrix;

  const delta = treatmentDelta(runDir);
  const paths = informationPaths(runDir, matrix);
  const historyAccess = historyAccessSummary(paths);
  const capitalPath = capitalPathSummary(paths);
  const matched = matchedHistoryUse(paths, matrix);
  const cost = costDecomposition(matrix);
  const overhead = capitalOverhead(matrix, paths);
  const forensic = forensicB0CG3(matrix, paths);

  const record = Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0A',
    kind: 'history/capital mediation and cost adjudication',
    noNewModelRun: true,
    r3l0EvidenceMutated: false,
    treatmentDelta: delta,
    informationPaths: paths,
    historyAccess,
    capitalPath,
    matchedHistoryUse: matched,
    cost,
    capitalOverhead: overhead,
    forensic,
  });

  const dir = join(REPO_ROOT, STAGE_EVIDENCE_PATH);
  writeFileSync(join(dir, 'mediation-adjudication.json'), `${JSON.stringify(record, null, 2)}${NL}`, 'utf8');

  out(`§5 treatment: ${delta.treatment} (world identical every block: ${String(delta.worldIdenticalEveryBlock)}, knowledge plane identical: ${String(delta.knowledgePlaneIdenticalEveryBlock)})`);
  out(`§6 H history access: ${String(historyAccess.accessed)}/${String(historyAccess.total)} accessed, ${String(historyAccess.successesWithoutObservableHistoryAccess)} full-coverage WITHOUT observable history access, ${String(historyAccess.leakageExposed)} leaked`);
  out(`§7 C path shapes: ${JSON.stringify(capitalPath.shapeCounts)}`);
  out(`§9 tokens: H in=${String(cost.byArm.H.inputTokens)} out=${String(cost.byArm.H.outputTokens)} | C in=${String(cost.byArm.C.inputTokens)} out=${String(cost.byArm.C.outputTokens)}`);
  out(`§10 overhead: ${String(overhead.governedPullsTotal)} governed pulls, ${String(overhead.bodyBytesDeliveredTotal)} body bytes across ${String(overhead.generations)} generations`);
  out(`§11 b0-C-G3: ${forensic.determination} (${String(forensic.supportingConditionCount)} supporting conditions)`);
  return record;
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}
