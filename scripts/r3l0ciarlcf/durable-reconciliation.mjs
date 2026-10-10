/**
 * R3-L0C-I-A-R-L-C-F §5 Gate F3 — DURABLE EVIDENCE AND CAUSAL-ADMISSION CONSISTENCY.
 *
 * THE DEFECT THIS CLOSES, measured by `baseline/legacy-controls.mjs controlDividedIdentities` by CALLING the real
 * reducer with a real journal: the terminal reducer computed `IDENTITIES_EXACT` from the caller-supplied IN-MEMORY
 * `records`, while the cost bridge independently read `TRIAL_RECORDED` from the DURABLE journal. The two sources
 * could disagree — a durable trial carrying arm C while the schedule and the in-memory record said arm H — and the
 * combined gate stayed GREEN.
 *
 * THE REPAIR DERIVES THE AUTHORITATIVE SESSION SET FROM THE DURABLE JOURNAL. §5 requires the reducer to "decide
 * using one coherent evidence set", and it names the conditions: one exposure intent, one launch, one admitted
 * trial, exact identity, consistency with the in-memory observation, the attempt/host-job relationship, a valid
 * sidecar binding and an appropriate cost status.
 *
 * WHY THE DURABLE JOURNAL IS THE AUTHORITY. The journal is written with fsync before the next session starts and is
 * the only record that survives the process. The in-memory records are a convenience the runner happens to hold. So
 * where they disagree, the disagreement is the finding, and the reconciliation reports it rather than choosing a
 * winner silently.
 *
 * WHAT IS NOT CLAIMED. §5: "Preserve the distinction between record-content digest verification and a fully
 * externally anchored tamper-proof event history. Do not claim a cryptographic hash chain the current journal does
 * not provide." The journal's per-record digest detects a torn or rewritten line; it is NOT a chained external
 * anchor, and this module says so on its result.
 *
 * THE THREE COST LEVELS ARE SEPARATE. §5 requires `CostAccountingComplete`, `CostMeasuredComplete` and
 * `LivePrimaryCostComplete` to be distinguishable, because "`interpretable` alone does not mean all cost endpoints
 * have values". And §5 requires the causal decision to depend on ALL its prerequisites, "not merely
 * `allSixteenLivePrimary === true`".
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { CAUSAL_PREREQUISITES, COST_COMPLETENESS_LEVELS, DURABLE_RECONCILIATION_CONDITIONS, NL } from './contract.mjs';

/** §5: the durable-reconciliation conditions, as data, so the reducer and the report agree on the set. */
export const REQUIRED_DURABLE_CONDITIONS = DURABLE_RECONCILIATION_CONDITIONS;

/**
 * §5: RECONCILE THE DURABLE JOURNAL AGAINST THE FROZEN SCHEDULE AND THE IN-MEMORY OBSERVATION.
 *
 * The authoritative session set comes from the durable `TRIAL_RECORDED` records. Every condition is computed from
 * the durable record and the frozen schedule; the in-memory records are used ONLY to check consistency, never as
 * the authority.
 */
export function reconcileDurableTrials(input) {
  const {
    journal, schedule, plannedSessions, inMemoryRecords = null,
    liveEvidenceContinuity = null, costAttribution = null,
  } = input;
  const conditions = [];
  const add = (id, holds, detail) => conditions.push(Object.freeze({ id, holds: holds === true, detail: detail ?? null }));

  const plannedById = new Map((schedule ?? []).map((session) => [session.sessionId, session]));
  const plannedSet = new Set(plannedSessions ?? []);

  /** The durable trials, from the journal the caller read with the frozen reader. */
  const trialRecords = (journal?.records ?? []).filter((entry) => entry.kind === 'TRIAL_RECORDED');
  const durableTrials = trialRecords.map((entry) => entry.payload?.record).filter((record) => record !== null && record !== undefined);

  /** 1. THE AUTHORITATIVE SESSION SET, derived from the durable journal. */
  const durableIds = durableTrials.map((record) => record.sessionId);
  const durableUnique = new Set(durableIds);
  const missingFromDurable = [...plannedSet].filter((sessionId) => !durableUnique.has(sessionId));
  const unplannedInDurable = durableIds.filter((sessionId) => !plannedSet.has(sessionId));
  add('DURABLE_SESSION_SET_EXACT',
    durableUnique.size === plannedSet.size && missingFromDurable.length === 0 && unplannedInDurable.length === 0,
    `durable=${String(durableUnique.size)} planned=${String(plannedSet.size)} missing=[${missingFromDurable.join(', ')}] unplanned=[${unplannedInDurable.join(', ')}]`);

  /** 2. EXACTLY ONE durable trial per planned session — a DUPLICATE is refused. */
  const countsBySession = new Map();
  for (const sessionId of durableIds) countsBySession.set(sessionId, (countsBySession.get(sessionId) ?? 0) + 1);
  const duplicates = [...countsBySession.entries()].filter(([, count]) => count > 1).map(([sessionId]) => sessionId);
  add('DURABLE_TRIAL_UNIQUE', duplicates.length === 0 && durableTrials.length === plannedSet.size,
    `trialRecords=${String(durableTrials.length)} planned=${String(plannedSet.size)} duplicates=[${duplicates.join(', ')}]`);

  /** 3. Every durable trial carries the EXACT frozen identity. */
  const identityMismatches = [];
  for (const record of durableTrials) {
    const session = plannedById.get(record.sessionId);
    if (session === undefined) continue;
    for (const field of ['block', 'arm', 'generation', 'trajectoryId']) {
      if (String(record[field]) !== String(session[field])) identityMismatches.push(`${record.sessionId}.${field}: durable=${String(record[field])} planned=${String(session[field])}`);
    }
  }
  add('DURABLE_IDENTITY_EXACT', identityMismatches.length === 0, `mismatches=[${identityMismatches.join(', ')}]`);

  /** 4. The durable observation and the in-memory observation AGREE, session by session. */
  const inMemoryMismatches = [];
  if (inMemoryRecords === null || inMemoryRecords === undefined) {
    add('DURABLE_MATCHES_IN_MEMORY', false, 'no in-memory observation was supplied, so agreement cannot be established');
  } else {
    const inMemoryById = new Map(inMemoryRecords.map((record) => [record.sessionId, record]));
    for (const record of durableTrials) {
      const inMemory = inMemoryById.get(record.sessionId);
      if (inMemory === undefined) { inMemoryMismatches.push(`${record.sessionId}: absent in memory`); continue; }
      for (const field of ['block', 'arm', 'generation', 'trajectoryId']) {
        if (String(inMemory[field]) !== String(record[field])) inMemoryMismatches.push(`${record.sessionId}.${field}: durable=${String(record[field])} inMemory=${String(inMemory[field])}`);
      }
    }
    for (const record of inMemoryRecords) if (!durableUnique.has(record.sessionId)) inMemoryMismatches.push(`${record.sessionId}: in memory but not durable`);
    add('DURABLE_MATCHES_IN_MEMORY', inMemoryMismatches.length === 0, `mismatches=[${inMemoryMismatches.join(', ')}]`);
  }

  /** 5. Exactly one exposure intent and one launch record per planned session. */
  const exposureCounts = new Map();
  const launchCounts = new Map();
  for (const entry of journal?.records ?? []) {
    const sessionId = entry.payload?.sessionId ?? null;
    if (sessionId === null) continue;
    if (entry.kind === 'EXPOSURE_INTENT_RECORDED') exposureCounts.set(sessionId, (exposureCounts.get(sessionId) ?? 0) + 1);
    if (entry.kind === 'WORKER_LAUNCH_RECORDED') launchCounts.set(sessionId, (launchCounts.get(sessionId) ?? 0) + 1);
  }
  const exposureProblems = [...plannedSet].filter((sessionId) => exposureCounts.get(sessionId) !== 1);
  const launchProblems = [...plannedSet].filter((sessionId) => launchCounts.get(sessionId) !== 1);
  const unplannedLaunches = [...launchCounts.keys()].filter((sessionId) => !plannedSet.has(sessionId));
  add('EXPOSURE_AND_LAUNCH_CARDINALITY',
    exposureProblems.length === 0 && launchProblems.length === 0 && unplannedLaunches.length === 0,
    `exposureProblems=[${exposureProblems.join(', ')}] launchProblems=[${launchProblems.join(', ')}] unplannedLaunches=[${unplannedLaunches.join(', ')}]`);

  /** 6. Every durable trial binds a live-evidence sidecar whose bytes still hash to the binding. */
  const sidecarOk = liveEvidenceContinuity?.LIVE_ARTIFACT_PROPAGATION === 'PASS';
  add('SIDECAR_BINDING_VALID', sidecarOk,
    `propagation=${String(liveEvidenceContinuity?.LIVE_ARTIFACT_PROPAGATION ?? 'ABSENT')} sessions=${String(liveEvidenceContinuity?.sessions ?? 'ABSENT')}`);

  /** 7. Every planned session carries a cost measurement or an explicit labelled absence. */
  const accountingComplete = costAttribution !== null && costAttribution !== undefined && costAttribution.interpretable === true;
  add('COST_EVIDENCE_CLASSIFIED', accountingComplete,
    `interpretable=${String(costAttribution?.interpretable)} measured=${String(costAttribution?.measuredCount)} absent=${String(costAttribution?.absentCount)} planned=${String(costAttribution?.plannedSessions)}`);

  /** 8. The journal itself is intact. */
  add('JOURNAL_INTEGRITY',
    journal?.JOURNAL_INTACT === true && journal?.INTERRUPTED_WRITE_DETECTED !== true && journal?.WRITE_IN_FLIGHT_DETECTED !== true,
    `intact=${String(journal?.JOURNAL_INTACT)} interrupted=${String(journal?.INTERRUPTED_WRITE_DETECTED)} writeInFlight=${String(journal?.WRITE_IN_FLIGHT_DETECTED)}`);

  const failing = conditions.filter((condition) => condition.holds !== true).map((condition) => condition.id);
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C-F',
    kind: 'durable trial reconciliation',
    conditions: Object.freeze(conditions),
    requiredConditions: DURABLE_RECONCILIATION_CONDITIONS.map((entry) => entry.id),
    failing: Object.freeze(failing),
    green: failing.length === 0,
    /** §5: the authoritative session set, derived from the DURABLE journal. */
    authoritativeSessionSet: Object.freeze([...durableUnique].sort()),
    durableTrialCount: durableTrials.length,
    duplicates: Object.freeze(duplicates),
    identityMismatches: Object.freeze(identityMismatches),
    durableVsInMemoryMismatches: Object.freeze(inMemoryMismatches),
    /** §5: the journal's digest is a per-record content digest, NOT an externally anchored hash chain. */
    journalIntegrityIsRecordContentDigest: true,
    claimsExternallyAnchoredHashChain: false,
    law: 'the authoritative session set is derived from the validated durable journal; a durable/in-memory disagreement is a finding, and a duplicate durable trial is refused',
  });
}

/**
 * §5: THE THREE COST-COMPLETENESS LEVELS, EACH ITS OWN VALUE.
 *
 * §5: "The current bridge distinguishes measured and explicitly absent evidence, but `interpretable` alone does not
 * mean all cost endpoints have values." So the three levels are computed separately, and an explicit absence
 * satisfies ONLY the accounting level.
 */
export function costCompleteness(costAttribution) {
  const planned = costAttribution?.plannedSessions ?? 0;
  const measured = costAttribution?.measuredCount ?? 0;
  const absent = costAttribution?.absentCount ?? 0;
  const livePrimary = costAttribution?.livePrimaryCount ?? 0;
  const accountingComplete = costAttribution !== null && costAttribution !== undefined
    && costAttribution.interpretable === true && measured + absent === planned && planned > 0;
  const measuredComplete = accountingComplete && measured === planned;
  const livePrimaryComplete = measuredComplete && livePrimary === planned;
  return Object.freeze({
    schemaVersion: 1,
    kind: 'cost completeness',
    levels: COST_COMPLETENESS_LEVELS.map((entry) => entry.id),
    CostAccountingComplete: accountingComplete,
    CostMeasuredComplete: measuredComplete,
    LivePrimaryCostComplete: livePrimaryComplete,
    measuredCount: measured,
    absentCount: absent,
    livePrimaryCount: livePrimary,
    plannedSessions: planned,
    /** §5: an explicit absence must NOT satisfy a requirement that demands a measured endpoint. */
    absenceSatisfiesMeasuredRequirement: false,
    absenceSatisfiesAccountingRequirement: accountingComplete && absent > 0,
    provenance: costAttribution?.provenance ?? 'ABSENT',
    law: 'CostAccountingComplete, CostMeasuredComplete and LivePrimaryCostComplete are separate; an explicit absence satisfies only the accounting level',
  });
}

/**
 * §5: THE CAUSAL-EVALUABILITY REDUCTION.
 *
 * §5: "The scientific causal-evaluability decision must require all of its actual prerequisites, not merely
 * `allSixteenLivePrimary === true`. It must also depend on successful authoritative admission and the relevant
 * frozen validity, treatment, identity and analysis conditions."
 *
 * Every prerequisite is a measured value. A FIXTURE matrix is mechanically valid and still NOT_EVALUABLE.
 */
export function causalEvaluability(input) {
  const {
    authoritativeAdmission = null, costAttribution = null, records = null,
    durableReconciliation = null, postMatrixValidity = null,
    analysisPlanUnchanged = null, replacements = null, retries = null,
    freshness = null, attestation = null,
  } = input;
  const completeness = costCompleteness(costAttribution);
  const treatmentApplied = Array.isArray(records) && records.length > 0 && records.every((record) => record.treatmentRealization === 'APPLIED');
  const checks = Object.freeze({
    AUTHORITATIVE_ADMISSION_GREEN: authoritativeAdmission?.green === true,
    COST_MEASUREMENT_LIVE_PRIMARY_COMPLETE: completeness.LivePrimaryCostComplete === true,
    TREATMENT_REALIZATION_APPLIED: treatmentApplied,
    IDENTITIES_EXACT_DURABLE_AND_IN_MEMORY: durableReconciliation?.green === true,
    ANALYSIS_PLAN_UNCHANGED: analysisPlanUnchanged === true,
    ZERO_RETRIES_AND_REPLACEMENTS: replacements === 0 && retries === 0,
    EXECUTION_CLOSURE_FRESH_MATCH: freshness?.closureMatchesPlan === true,
    ROUTE_FRESH_MATCH: freshness?.routeMatchesPlan === true,
    RUNTIME_ATTESTED: attestation?.IN_RUN_ATTESTATION === 'PASS',
  });
  const failing = CAUSAL_PREREQUISITES.filter((id) => checks[id] !== true);
  const evaluable = failing.length === 0;
  return Object.freeze({
    schemaVersion: 1,
    kind: 'causal evaluability reduction',
    required: CAUSAL_PREREQUISITES,
    checks,
    failing: Object.freeze(failing),
    evaluable,
    CAUSAL_RESULT: evaluable ? 'EVALUABLE' : 'NOT_EVALUABLE',
    /** §5: a mechanically valid FIXTURE matrix is NOT a live causal admission. */
    fixtureMatrixIsNotLiveCausalAdmission: true,
    costCompleteness: completeness,
    /** §5: the frozen thresholds and their interpretation are untouched by this reduction. */
    frozenThresholdsChanged: false,
    statisticalInterpretationChanged: false,
    law: 'causal evaluability requires every actual prerequisite — authoritative admission, live-primary cost completeness, applied treatment, exact identities, an unchanged analysis plan, no retries or replacements, a fresh closure and route, and runtime attestation — not merely allSixteenLivePrimary',
  });
}

export { NL };
