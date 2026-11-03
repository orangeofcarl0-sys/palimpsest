#!/usr/bin/env node
/**
 * R1-R §20–§25/§28/§31 — NORMALIZATION AND THE FROZEN COMPARISONS.
 *
 * §20 forbids collapsing the per-trial outcomes into one intelligence score, and §28 forbids using
 * p-values to manufacture certainty. So this module does two things and nothing else:
 *
 *   1. NORMALIZE each trial record into the pre-registered outcome list, keeping every raw count and
 *      marking anything the host did not expose as UNKNOWN;
 *   2. compute the FROZEN comparisons — raw counts first — and apply the pre-declared PASS / PARTIAL /
 *      NO_REPLICATION criteria from the amendment, without redefining them after seeing the data.
 *
 * The paired-state check (§14) lives here too: a block whose three conditions do not share the
 * comparable paired-state fields is marked CONFOUNDED and excluded from the primary comparison while
 * remaining in raw evidence (§13 of the parent protocol).
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { PAIRED_STATE_COMPARABLE_FIELDS } from "./scenarios.mjs";

/** §20: the pre-registered per-trial outcome list, normalized. */
export function normalizeTrial(record) {
  const worker = record.worker ?? {};
  const pulled = Array.isArray(worker.pulledHandles) ? worker.pulledHandles : [];
  const procedureHandles = pulled.filter((handle) => typeof handle === "string" && handle.startsWith("@ctx/procedure/"));
  const epistemicHandles = pulled.filter((handle) => typeof handle === "string" && (handle.startsWith("@ctx/proof/") || handle.startsWith("@ctx/reasoning/")));
  return Object.freeze({
    trialId: record.trialId,
    scenario: record.scenario,
    condition: record.condition,
    block: record.block,
    repetition: record.repetition,

    finalAcceptancePassed: record.finalAcceptance?.passed ?? 0,
    finalAcceptanceTotal: record.finalAcceptance?.total ?? 0,
    finalAcceptanceSolved: record.finalAcceptance?.total > 0 && record.finalAcceptance.passed === record.finalAcceptance.total,

    firstCandidatePassed: record.firstCandidateAcceptance?.passed ?? 0,
    firstCandidateTotal: record.firstCandidateAcceptance?.total ?? 0,
    firstCandidateSolved: record.firstCandidateAcceptance?.total > 0 && record.firstCandidateAcceptance.passed === record.firstCandidateAcceptance.total,

    /** §21: the pre-paid mistake's recurrence — the primary textbook-effect measure. */
    knownFailureRecurred: record.knownFailureFinal?.recurred ?? "UNKNOWN",
    knownFailureRecurredFirst: record.knownFailureFirst?.recurred ?? "UNKNOWN",

    hiddenOracleInvocations: record.hiddenOracleInvocations ?? "UNKNOWN",
    visibleOracleInvocations: record.visibleOracleInvocations ?? "UNKNOWN",

    selectedHandles: record.prompt?.handlesInPayload ?? [],
    selectedHandleCount: (record.prompt?.handlesInPayload ?? []).length,
    indexHandleCount: record.prompt?.indexHandleCount ?? 0,
    pulledHandles: pulled,
    pulledCount: pulled.length,
    procedurePulled: procedureHandles.length > 0,
    epistemicPulled: epistemicHandles.length > 0,
    pullOrder: worker.pullOrder ?? [],

    workerAttempts: record.workerAttempts ?? 1,
    implementationRevisions: record.implementationRevisions ?? "UNKNOWN",
    elapsedMs: record.elapsedMs ?? "UNKNOWN",
    tokens: record.tokens?.exposed === true ? record.tokens : "UNKNOWN",

    hostFailure: record.hostFailure === null || record.hostFailure === undefined ? false : true,
    timedOut: record.timedOut === true,
    manualInterventions: record.manualInterventions ?? 0,
    jobPhase: record.jobPhase ?? "UNKNOWN",
    workerOutcomeKind: worker.outcomeKind ?? "UNKNOWN",

    offeredTools: worker.offeredTools ?? [],
    capabilitySetDigest: record.prompt?.capabilitySetDigest ?? "UNKNOWN",
    ordinaryTaskDigest: record.prompt?.ordinaryTaskDigest ?? "UNKNOWN",
    pairedState: record.pairedState ?? null,
  });
}

/**
 * §14: mark a block CONFOUNDED when its three conditions do not share the comparable paired-state
 * fields, or when their ordinary-task / capability-set digests differ.
 *
 * The two things that are ALLOWED to differ — and that are the treatment — are the context index and
 * the resolvable bound handles, so they are deliberately not compared here.
 */
export function pairedStateCheck(trials) {
  const byBlock = new Map();
  for (const trial of trials) {
    const key = `${trial.scenario}|${trial.block}`;
    if (!byBlock.has(key)) byBlock.set(key, []);
    byBlock.get(key).push(trial);
  }
  const blocks = [];
  for (const [key, members] of [...byBlock.entries()].sort()) {
    const [scenario, block] = key.split("|");
    const differences = [];
    if (members.length !== 3) differences.push(`expected 3 conditions, found ${members.length}`);
    for (const field of PAIRED_STATE_COMPARABLE_FIELDS) {
      const values = new Set(members.map((trial) => JSON.stringify(trial.pairedState?.[field] ?? null)));
      if (values.size > 1) differences.push(`pairedState.${field} differs across conditions`);
    }
    const ordinary = new Set(members.map((trial) => trial.ordinaryTaskDigest));
    if (ordinary.size > 1) differences.push("the ordinary task text differs across conditions");
    const capability = new Set(members.map((trial) => trial.capabilitySetDigest));
    if (capability.size > 1) differences.push("the worker capability set differs across conditions");
    // The treatment MUST differ: an index that is identical across C0/C1/C2 means the conditions were
    // not actually distinguished, which is the failure R1 measured.
    const indexCounts = members.map((trial) => trial.indexHandleCount);
    const distinctIndex = new Set(indexCounts);
    if (distinctIndex.size === 1 && members.some((trial) => trial.condition !== "C0")) {
      differences.push(`the context index is identical across conditions (${indexCounts.join("/")}) — the treatment was not applied`);
    }
    blocks.push(Object.freeze({ scenario, block: Number(block), conditions: members.map((trial) => trial.condition).sort(), confounded: differences.length > 0, differences: Object.freeze(differences) }));
  }
  return Object.freeze(blocks);
}

/** §28: raw counts first. Nothing here is a score. */
function counts(trials) {
  const n = trials.length;
  const solved = trials.filter((trial) => trial.finalAcceptanceSolved).length;
  const firstSolved = trials.filter((trial) => trial.firstCandidateSolved).length;
  const recurred = trials.filter((trial) => trial.knownFailureRecurred === true).length;
  const recurredUnknown = trials.filter((trial) => trial.knownFailureRecurred === "UNKNOWN").length;
  const procedurePulled = trials.filter((trial) => trial.procedurePulled).length;
  const epistemicPulled = trials.filter((trial) => trial.epistemicPulled).length;
  const oracleRuns = trials.map((trial) => trial.visibleOracleInvocations).filter((value) => typeof value === "number").sort((left, right) => left - right);
  const revisions = trials.map((trial) => trial.implementationRevisions).filter((value) => typeof value === "number").sort((left, right) => left - right);
  const elapsed = trials.map((trial) => trial.elapsedMs).filter((value) => typeof value === "number").sort((left, right) => left - right);
  const median = (sorted) => (sorted.length === 0 ? "UNKNOWN" : sorted.length % 2 === 1 ? sorted[(sorted.length - 1) / 2] : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2));
  return Object.freeze({
    n,
    finalSolved: `${solved}/${n}`,
    firstCandidateSolved: `${firstSolved}/${n}`,
    knownFailureRecurred: `${recurred}/${n}`,
    knownFailureUnknown: recurredUnknown,
    procedurePulled: `${procedurePulled}/${n}`,
    epistemicPulled: `${epistemicPulled}/${n}`,
    medianVisibleOracleInvocations: median(oracleRuns),
    medianImplementationRevisions: median(revisions),
    medianElapsedMs: median(elapsed),
    hostFailures: trials.filter((trial) => trial.hostFailure).length,
    timeouts: trials.filter((trial) => trial.timedOut).length,
    manualInterventions: trials.reduce((sum, trial) => sum + (typeof trial.manualInterventions === "number" ? trial.manualInterventions : 0), 0),
  });
}

/**
 * §21–§25: the frozen comparisons.
 *
 * `directionalBenefit` is the parent protocol's criterion, applied per scenario:
 *
 *     C2 repeats the pre-paid mistake less often than C0
 *     AND C2's mechanical outcome is not worse than C0's
 *
 * `c2OverC1` is the §22/§23 Procedure-added-value test: C2 beats C1 on the pre-registered procedural
 * outcome (known-failure recurrence, then first-candidate success) WITH the Procedure actually pulled.
 */
export function analyse(trials, blocks) {
  const confoundedBlocks = new Set(blocks.filter((block) => block.confounded).map((block) => `${block.scenario}|${block.block}`));
  const excluded = trials.filter((trial) => confoundedBlocks.has(`${trial.scenario}|${trial.block}`));
  const usable = trials.filter((trial) => !confoundedBlocks.has(`${trial.scenario}|${trial.block}`));

  const scenarios = {};
  for (const scenario of [...new Set(trials.map((trial) => trial.scenario))].sort()) {
    const conditions = {};
    for (const condition of ["C0", "C1", "C2"]) {
      conditions[condition] = counts(usable.filter((trial) => trial.scenario === scenario && trial.condition === condition));
    }
    const recurredOf = (condition) => Number(String(conditions[condition].knownFailureRecurred).split("/")[0]);
    const solvedOf = (condition) => Number(String(conditions[condition].finalSolved).split("/")[0]);
    const firstOf = (condition) => Number(String(conditions[condition].firstCandidateSolved).split("/")[0]);

    const c2BetterRecurrence = recurredOf("C2") < recurredOf("C0");
    const c2OutcomeNotWorse = solvedOf("C2") >= solvedOf("C0");
    const directionalBenefit = c2BetterRecurrence && c2OutcomeNotWorse;

    // §22: the procedural outcome, in the pre-registered order: recurrence first, then first-candidate.
    const c2BeatsC1OnRecurrence = recurredOf("C2") < recurredOf("C1");
    const c2BeatsC1OnFirst = firstOf("C2") > firstOf("C1");
    const c2OverC1 = (c2BeatsC1OnRecurrence || c2BeatsC1OnFirst) && Number(String(conditions.C2.procedurePulled).split("/")[0]) > 0;

    scenarios[scenario] = Object.freeze({
      conditions,
      c2BetterRecurrence,
      c2OutcomeNotWorse,
      directionalBenefit,
      c2BeatsC1OnRecurrence,
      c2BeatsC1OnFirst,
      c2OverC1,
      procedureObserved: Number(String(conditions.C2.procedurePulled).split("/")[0]) > 0,
    });
  }

  const scenarioIds = Object.keys(scenarios);
  const allDirectional = scenarioIds.length > 0 && scenarioIds.every((id) => scenarios[id].directionalBenefit);
  const someDirectional = scenarioIds.some((id) => scenarios[id].directionalBenefit);
  const someC2OverC1 = scenarioIds.some((id) => scenarios[id].c2OverC1);
  const anyHostFailure = usable.some((trial) => trial.hostFailure);

  /**
   * §23/§24/§25: the verdict, applied to the pre-declared criteria and nothing else.
   *
   * PASS requires BOTH primary scenarios to show directional capital benefit AND at least one to show
   * C2 > C1 on a pre-registered procedural outcome with observed Procedure pull.
   */
  let verdict;
  if (scenarioIds.length < 2) verdict = "INCOMPLETE";
  else if (allDirectional && someC2OverC1) verdict = "PASS";
  else if (someDirectional) verdict = "PARTIAL";
  else verdict = "NO_REPLICATION";

  return Object.freeze({
    verdict,
    scenarios,
    allDirectional,
    someDirectional,
    someC2OverC1,
    confoundedBlocks: [...confoundedBlocks],
    excludedTrialCount: excluded.length,
    usableTrialCount: usable.length,
    anyHostFailure,
    totals: counts(usable),
  });
}
