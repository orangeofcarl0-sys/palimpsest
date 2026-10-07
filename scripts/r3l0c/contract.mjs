/**
 * R3-L0C §1/§9/§13-§22/§23-§27 — THE FROZEN CONTRACT.
 *
 * This stage is a CONTROLLED BEHAVIORAL EXPERIMENT, authorized because both validity gates are green:
 * `SYSTEM_VALID = YES` (R3-S0) and `EXPERIMENT_VALID = YES` (R3-L0B). §1 and §26 make both mandatory before
 * and after the matrix, and §26 makes a favorable outcome unable to repair either.
 *
 * THE RESEARCH QUESTION, in the ruling's own words:
 *
 *   When the correct project-specific operating knowledge is recoverable from a substantial raw Project
 *   history, does governed current-standing cognitive capital reduce the cost and unreliability of
 *   reconstructing that knowledge?
 *
 * WHAT MAKES THIS STAGE DIFFERENT FROM R3-L0. R3-L0 tested GENERIC engineering lessons — "validate before
 * mutate", "freeze the closure" — which a capable model may already hold as prior knowledge. A null result
 * there is uninformative, because the capital may simply have been redundant with the prior. This stage tests
 * PROJECT-SPECIFIC invariants whose values cannot be derived from generic best practice, so the capital carries
 * information the prior does not.
 *
 * THE CENTRAL DISTINCTION THE WHOLE STAGE RESTS ON (§6):
 *
 *     HistoricalKnowledge ≠ CurrentStanding
 *
 * Raw history contains the invariant's whole history: the initial rule, its revisions, what superseded it, and
 * under what applicability it currently stands. Current standing is a CONCLUSION drawn from that history. H must
 * derive the conclusion; C is handed the conclusion. That is the compression being tested, and it is why the
 * raw-history arm must remain capable of succeeding — otherwise the experiment would measure oracle access.
 *
 * THE TREATMENT IS SELECTION_ONLY. Both arms contain IDENTICAL canonical capital assets and associations; the
 * only difference is whether the frozen current-standing handles are SELECTED for the generation (§7, §9).
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

const NL = String.fromCharCode(10);

/** The checkout root, resolved from this module's own position. */
export const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');

/** §23: the stage-owned evidence path. The ONLY place this stage may add to the protected tree. */
export const STAGE_EVIDENCE_PATH = 'research-evidence/r3-l0c';

/* ================================================================ §1/§26 validity precedence */

/**
 * §1/§26: THE VALIDITY PREREQUISITES.
 *
 * Both gates are MANDATORY before trial 1 and again after the matrix. §26 states the consequence of a failure,
 * and it is carried as a value so no report can soften it: `BEHAVIORAL MECHANISM CLAIM = INVALID` regardless of
 * favorable outcomes.
 */
export const VALIDITY_PREREQUISITES = Object.freeze({
  required: Object.freeze([
    Object.freeze({ id: 'SYSTEM_VALID', source: 'R3-S0 systemic behavior closure', requirement: 'the four truth layers, loop conformance matrices, cross-loop closures and the preregistered mutations are green' }),
    Object.freeze({ id: 'EXPERIMENT_VALID', source: 'R3-L0B experimental containment', requirement: 'treatment integrity, containment, outcome blindness, unit independence and evidence immutability are all PASS' }),
  ]),
  timing: Object.freeze(['BEFORE_TRIAL_1', 'AFTER_THE_MATRIX']),
  onFailure: 'BEHAVIORAL MECHANISM CLAIM = INVALID, regardless of favorable outcomes',
  envelopesRecorded: true,
});

/* ================================================================ §2 infrastructure repairs */

/**
 * §2: THE THREE PREFLIGHT REPAIRS, each with the defect it closes.
 *
 * They are recorded in the contract because §2 requires them CLOSED before the plan is frozen, and a report must
 * be able to name what was repaired rather than only that something was.
 */
export const PREFLIGHT_REPAIRS = Object.freeze([
  Object.freeze({
    id: 'EXPLICIT_EVIDENCE_MODE',
    defect: 'a gate read `scratch ?? committed`, so a reader could not tell whether a green result came from a fresh run or from a frozen artifact',
    repair: 'LIVE requires a fresh current-run record and fails if absent; HISTORICAL may validate committed evidence; every output carries evidenceSource, evidenceDigest and freshness',
    module: 'scripts/r3l0c/evidence-mode.mjs',
  }),
  Object.freeze({
    id: 'BASELINE_DERIVED_IMMUTABILITY',
    defect: 'the protected set was a hand-maintained exclusion list, so a new stage had to edit a completed stage\'s adjudication script to add its own namespace',
    repair: 'the protected set is derived as the baseline Git tree minus the current stage-owned namespace, so no prior stage is ever edited',
    module: 'scripts/r3l0c/immutability.mjs',
  }),
  Object.freeze({
    id: 'PER_RUN_TEMP_ROOT',
    defect: 'a global temp sweep removed every palimpsest-* directory that appeared during its run, and was observed deleting a live nested run\'s rigs',
    repair: 'a run owns a lease-bearing root under palimpsest-runs/<runId>, and a sweep refuses to remove a root whose lease names a live owner',
    module: 'scripts/r3l0c/run-root.mjs',
  }),
]);

/** §2: no model may be invoked until all three are green. */
export const PREFLIGHT_GATE = 'no model call occurs before all three infrastructure repairs are green';

/* ================================================================ §3-§6 the project family */

/**
 * §3: THE PROJECT FAMILY.
 *
 * ONE new long-horizon family. It is NOT a harder version of R3-L0's generic lessons: the two invariants below
 * are values a Project chose, not properties of good software engineering, and a model cannot derive them from
 * a maxim because a maxim does not contain a date, a tenant class or a precedence order.
 *
 * §3's example structural category is `legacy compatibility / migration / precedence invariants`. The family
 * chosen here is a legacy entitlement-cutover precedence family, which is that category but with its own
 * semantics rather than the ruling's illustrative example.
 */
export const PROJECT = Object.freeze({
  name: 'cutover-entitlements',
  kind: 'legacy entitlement cutover and precedence',
  summary: 'a tenant entitlement service that migrated from a legacy policy engine to a new one, where the legacy engine\'s decisions and the new engine\'s decisions interact through an explicit cutover',
  /** §3: why this family needs project-specific knowledge rather than generic engineering skill. */
  whyProjectSpecific: 'the correct current standing depends on WHICH ENGINE evaluated a decision, WHEN the cutover happened, and WHICH TENANT CLASS the tenant belongs to. None of those is a software-engineering property, and none can be recovered from a maxim.',
});

/**
 * §4/§6: THE PROJECT-SPECIFIC INVARIANTS.
 *
 * Each carries the full historical standing record §6 requires: initial rule, revisions, evidence, current
 * standing, applicability and limitations. The `genericPriorCannotDetermine` field is the §4 obligation stated
 * as a property, and it names the SPECIFIC fact a prior lacks rather than asserting that the model lacks it —
 * §4 forbids claiming the model lacks the knowledge empirically before testing.
 */
export const INVARIANTS = Object.freeze([
  Object.freeze({
    id: 'I1',
    name: 'legacy-precedence-for-pre-cutover-decisions',
    /** §6: the historical initial rule. */
    historicalInitialRule: 'while the legacy engine was authoritative, a legacy DENY was final: no later ALLOW could overturn it, regardless of source.',
    /** §6: the revisions and what each superseded. */
    revisions: Object.freeze([
      Object.freeze({ revision: 1, date: 'the initial legacy era', rule: 'a legacy DENY is final for every tenant', supersedes: null, reason: 'the legacy engine was the only authority' }),
      Object.freeze({ revision: 2, date: 'the new engine was introduced for NEW tenants', rule: 'for tenants onboarded AFTER the cutover, the new engine\'s ALLOW may overturn an inherited DENY', supersedes: 'revision 1, but ONLY for post-cutover tenants', reason: 'the new engine evaluates from its own policy set and an inherited legacy DENY is not part of its input' }),
      Object.freeze({ revision: 3, date: 'the cutover was made explicit and dated', rule: 'the tenant\'s OWN cutover date decides which precedence applies, not the date the tenant was created', supersedes: 'revision 2\'s use of onboarding date', reason: 'a tenant onboarded before the cutover may have been MIGRATED onto the new engine on a later date, and the migration date is what the contract now keys on' }),
    ]),
    /** §6: the current standing, which is the CONCLUSION a worker must reconstruct from the revisions. */
    currentStanding: 'A legacy DENY outranks a newer inherited ALLOW ONLY for a tenant whose cutover date precedes the decision being evaluated. For a decision dated after that tenant\'s cutover date, the newer ALLOW wins, even though the DENY was recorded first.',
    /** §6: applicability, which is what makes the standing conditional rather than universal. */
    applicability: 'applies to any decision where a DENY and an ALLOW both exist for the same tenant+capability and their recorded dates straddle the tenant\'s cutover date',
    /** §6: limitations, stated so the invariant is not over-read. */
    limitations: Object.freeze([
      'it decides PRECEDENCE between two existing decisions; it does not create or delete either',
      'it says nothing about two decisions on the SAME side of the cutover date, where ordinary latest-wins applies',
      'the cutover date is per-tenant, so two tenants with identical decision histories can resolve differently',
    ]),
    /** §4: the specific fact a generic prior lacks. */
    genericPriorCannotDetermine: 'a generic prior contains "deny usually wins" or "latest wins" but contains NO tenant cutover date, so it cannot decide which of the two applies to a given pair of decisions. The disambiguating fact is a date in this Project\'s history.',
    /** §4: the multiple historical artifacts that support it. */
    historicalArtifacts: Object.freeze(['the cutover decision record', 'the migration notes for the migrated tenant class', 'the incident where the precedence was applied wrongly', 'the revision that made the cutover date explicit']),
  }),
  Object.freeze({
    id: 'I2',
    name: 'capability-alias-precedence-after-consolidation',
    /** §6: the historical initial rule. */
    historicalInitialRule: 'each capability had its own independent grant set, and a grant of one capability never affected another.',
    revisions: Object.freeze([
      Object.freeze({ revision: 1, date: 'the initial legacy era', rule: 'capabilities are independent', supersedes: null, reason: 'each capability was evaluated separately' }),
      Object.freeze({ revision: 2, date: 'the consolidation', rule: 'three legacy capabilities were CONSOLIDATED into one new capability, and the legacy names became ALIASES of it', supersedes: 'revision 1 for the three consolidated capabilities only', reason: 'the new engine evaluates one capability, so the legacy names had to map onto it' }),
      Object.freeze({ revision: 3, date: 'after the first alias incident', rule: 'when a tenant holds a legacy alias and a grant of the consolidated capability, the CONSOLIDATED grant is authoritative and the alias grant is preserved but not counted twice', supersedes: 'the ambiguity about which of the two grants a revocation removes', reason: 'a revocation was removing the alias grant and leaving the consolidated one, so the tenant kept access the operator believed was removed' }),
    ]),
    currentStanding: 'For the three consolidated capabilities, a legacy alias and the consolidated capability are the SAME authority. A revocation of either removes the tenant\'s access, and a tenant holding both does not hold two grants.',
    applicability: 'applies only to the three capabilities named in the consolidation record; every other legacy capability keeps its independent grant set',
    limitations: Object.freeze([
      'it does not rename or delete the legacy alias, which remains readable for historical queries',
      'it does not apply to a legacy capability the consolidation record does not name',
      'the consolidated grant is authoritative for COUNTING; the alias grant is preserved for provenance',
    ]),
    genericPriorCannotDetermine: 'a generic prior contains "normalize aliases" but contains NO consolidation record, so it cannot know WHICH three legacy capabilities were consolidated, nor that the consolidated name is authoritative rather than the alias. The disambiguating facts are three capability names in this Project\'s history.',
    historicalArtifacts: Object.freeze(['the consolidation decision record naming the three capabilities', 'the alias incident report', 'the revision that made the consolidated grant authoritative', 'the migration notes for alias holders']),
  }),
]);

/** §4: the invariant ids, for a schedule that must name them. */
export const INVARIANT_IDS = Object.freeze(INVARIANTS.map((entry) => entry.id));

/* ================================================================ §5 the corpus */

/**
 * §5: THE RAW-HISTORY CORPUS STRUCTURE.
 *
 * §5 requires the corpus to contain the listed categories AND ordinary irrelevant-but-plausible history, and it
 * fixes the difficulty precisely: `search + chronology + standing reconstruction`, NOT algorithmic obscurity,
 * and explicitly NOT misleading noise. So the corpus is LARGE and the answer is RECOVERABLE, but the worker must
 * find the right records and order them.
 */
export const CORPUS_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'INCIDENT', required: true, purpose: 'records of what went wrong, which is how the invariants were discovered' }),
  Object.freeze({ id: 'DECISION', required: true, purpose: 'the decision records that established each rule' }),
  Object.freeze({ id: 'REVISION', required: true, purpose: 'the revisions that superseded earlier rules, with their reasons' }),
  Object.freeze({ id: 'CURRENT_AND_SUPERSEDED', required: true, purpose: 'records whose standing differs from their original text, which is the reconstruction pressure itself' }),
  Object.freeze({ id: 'VERIFICATION', required: true, purpose: 'the verification results that admitted or rejected a rule' }),
  Object.freeze({ id: 'MIGRATION', required: true, purpose: 'the migration and compatibility notes for the affected tenant classes' }),
  Object.freeze({ id: 'IRRELEVANT_PLAUSIBLE', required: true, purpose: 'ordinary project history that is plausible but does not bear on either invariant' }),
]);

/** §5: the difficulty statement, frozen so a later stage cannot quietly make the corpus misleading. */
export const CORPUS_DIFFICULTY = Object.freeze({
  kind: 'SEARCH_AND_CHRONOLOGY_AND_STANDING_RECONSTRUCTION',
  forbidden: 'ALGORITHMIC_OBSCURITY',
  misleadingNoise: false,
  /** §5: the sufficiency law. */
  sufficiencyLaw: 'the raw history must remain sufficient for a diligent worker to reconstruct the correct current standing',
  /** §4: what must NOT be claimed before testing. */
  forbiddenPreTestClaim: 'do not claim that the model lacks the knowledge empirically before testing',
});

/* ================================================================ §7/§9 the arms */

/**
 * §9: THE TWO ARMS. §7 fixes the treatment as SELECTION_ONLY.
 */
export const ARMS = Object.freeze({
  H: Object.freeze({
    id: 'H',
    name: 'RAW_HISTORY',
    receives: 'current Project world, the declared raw Project history corpus, and ordinary worker tools',
    selectedCapital: 'EMPTY — canonical capital assets and associations exist, but the selected set is empty',
  }),
  C: Object.freeze({
    id: 'C',
    name: 'CAPITALIZED',
    receives: 'exactly the same world and raw-history corpus, plus the frozen current-standing selected capital handles through the governed Context/pull mechanism',
    selectedCapital: 'the frozen current-standing set, selected through the governed mechanism',
  }),
});

/** §7: the treatment is selection-only, and both arms contain identical canonical capital. */
export const TREATMENT = Object.freeze({
  kind: 'SELECTION_ONLY',
  bothArmsIdenticalCapitalPlane: true,
  rawHistoryAvailableToBothArms: true,
  capitalIntendedTo: 'reduce reconstruction burden, not hide history',
  /** §8: no dynamic ranking, no forced prework. */
  dynamicRelevanceRanker: false,
  hostMediatedForcedPrework: false,
});

/* ================================================================ §11/§12 the schedule */

/** §12: four matched blocks, each H and C, each with two generations = 16 sessions. */
export const BLOCK_COUNT = 4;
export const GENERATIONS_PER_TRAJECTORY = 2;
export const SESSIONS_PER_BLOCK = 2 * GENERATIONS_PER_TRAJECTORY;
export const TOTAL_SESSIONS = BLOCK_COUNT * SESSIONS_PER_BLOCK;

/** §12: the frozen randomization seed for the H/C order within each block. */
export const RANDOMIZATION_SEED = 0x52_4c_30_03;

/** §11: the two generations and what each requires. */
export const GENERATIONS = Object.freeze([
  Object.freeze({
    id: 'G1',
    generation: 1,
    title: 'apply I1 in a new surface',
    requires: Object.freeze(['I1']),
    requirement: 'Add `resolveEntitlement(store, tenantId, capability, atDate)` to the service: it returns the tenant\'s effective decision for that capability AS OF `atDate`, honouring the Project\'s recorded precedence rules. A request for a tenant the store does not know is refused.',
    exposes: Object.freeze(['I1']),
    requiredExports: Object.freeze(['resolveEntitlement']),
  }),
  Object.freeze({
    id: 'G2',
    generation: 2,
    title: 'compose I1 under a changed surface and apply I2',
    requires: Object.freeze(['I1', 'I2']),
    requirement: 'Add `revokeEntitlement(store, tenantId, capability)` to the service: it removes the tenant\'s effective access for that capability, so that a subsequent `resolveEntitlement` at a later date returns a refusal. It must honour the Project\'s recorded rules about which stored record constitutes the tenant\'s access, and it must keep the store consistent for every tenant that holds a related record.',
    exposes: Object.freeze(['I1', 'I2']),
    requiredExports: Object.freeze(['resolveEntitlement', 'revokeEntitlement']),
  }),
]);

/** §11: the generation spec for an id. */
export function generationOf(id) {
  return GENERATIONS.find((entry) => entry.id === id);
}

/** §12: no adaptive repetitions. */
export const RUN_BUDGET = Object.freeze({
  intendedValidSessions: TOTAL_SESSIONS,
  hardMaximumValidSessions: TOTAL_SESSIONS,
  retryPolicy: Object.freeze({
    rule: 'a valid generation outcome is NEVER retried; an infrastructure-invalid generation is retried only to reach the scheduled session count',
    infrastructureInvalidDefinition: 'the child failed to run, the worker failed to spawn, or the host lost the job — NOT a bad model outcome',
    validOutcomeIsFinal: true,
    maxAttemptsPerSession: 4,
  }),
  adaptiveStopping: false,
  addRepetitionsIfAmbiguous: false,
});

/* ================================================================ §13-§16 the outcomes */

/**
 * §13/§14/§16: THE RECORDED OUTCOMES.
 *
 * §13 counts only DECLARED RAW-HISTORY CORPUS reads, and explicitly does not count capital bodies as
 * raw-history bytes — otherwise C would look worse for reading the thing it was given.
 */
export const OUTCOME_SCHEMA = Object.freeze({
  reconstructionCost: Object.freeze(['rawHistoryArtifactsRead', 'rawHistoryBytesReturned']),
  searchActionCost: Object.freeze(['actionsBeforeFirstResult', 'historyReadActions', 'capitalPullActions', 'toolCallsBeforeFirstResult', 'elapsedToFirstResult']),
  secondaryTokenCost: Object.freeze(['inputTokens', 'outputTokens', 'cachedTokens']),
  reliability: Object.freeze(['firstCandidateInvariantVector', 'finalInvariantVector', 'projectVerification']),
  completionBudget: Object.freeze(['RESULT_SUBMITTED', 'MAX_TOKENS', 'TIMEOUT', 'OTHER_RUNTIME_CAUSE']),
});

/** §13: only these reads count toward the reconstruction cost, and capital bodies never do. */
export const RECONSTRUCTION_COST_RULES = Object.freeze({
  countsOnlyDeclaredCorpusReads: true,
  capitalBodiesCountAsRawHistoryBytes: false,
  countsBeforeFirstResultSubmission: true,
});

/** §16: the completion causes, from the runtime's OWN reason rather than inferred from action counts. */
export const COMPLETION_CAUSES = Object.freeze({
  RESULT_SUBMITTED: 'the worker submitted a result through the governed result tool',
  MAX_TOKENS: 'the runtime reported a max-tokens turn end',
  TIMEOUT: 'the port or the harness timed out',
  OTHER_RUNTIME_CAUSE: 'the runtime reported a different termination reason',
});

/* ================================================================ §18 the information paths */

/** §18: the observable path labels. No chain-of-thought is inferred. */
export const INFORMATION_PATHS = Object.freeze({
  CAPITAL_THEN_EDIT: 'a governed capital pull returned content before the first world edit',
  CAPITAL_THEN_HISTORY: 'a governed capital pull returned content, and raw history was read after it',
  HISTORY_RECONSTRUCTION: 'raw history was read and no capital content was returned',
  DIRECT_EDIT_WITHOUT_HISTORY: 'the worker edited the world without reading any declared raw history',
  NO_RESULT: 'no result was submitted',
});

/** §18: the classification is from observable behavior only. */
export const PATH_CLASSIFICATION_LAW = 'classify observable behavior only; do not infer chain-of-thought';

/* ================================================================ §19-§21 the verdicts */

/**
 * §19: THE RECONSTRUCTION-COMPRESSION VERDICT, frozen before trial 1.
 *
 * §19's POSITIVE_SIGNAL is a CONJUNCTION of five conditions, and the fifth is the one that keeps a cost win
 * from hiding a reliability loss. §21 then states the central design point: a correctness gap is NOT required,
 * because `same answer with less re-derivation` is an intended success mode.
 */
export const COMPRESSION_VERDICT_RULES = Object.freeze({
  POSITIVE_SIGNAL: Object.freeze({
    requirement: 'C reads fewer raw-history bytes than H in at least 3 of 4 matched blocks; C reads fewer raw-history artifacts than H in at least 3 of 4 blocks; C terminal invariant quality is not worse than H in at least 3 of 4 blocks; every C trajectory demonstrates governed capital consumption; no C trajectory suffers an excess completion-budget failure relative to its matched H solely hidden by averaging',
    fewerBytesBlocksRequired: 3,
    fewerArtifactsBlocksRequired: 3,
    qualityNotWorseBlocksRequired: 3,
    requiresConsumptionInEveryCTrajectory: true,
    forbidsAveragedCompletionFailure: true,
  }),
  ADVERSE_SIGNAL: Object.freeze({
    requirement: 'C has consistently greater reconstruction/search cost or worse invariant/completion outcomes in at least 3 of 4 blocks',
    blocksRequired: 3,
  }),
  MIXED: Object.freeze({ requirement: 'directional but inconsistent' }),
  NO_SIGNAL: Object.freeze({ requirement: 'no meaningful paired direction' }),
  pValues: 'NOT REPORTED — §19 forbids p-values at n=4',
});

/** §20: the net-cost verdict is SEPARATE and must not overwrite the compression verdict. */
export const NET_COST_VERDICT_RULES = Object.freeze({
  values: Object.freeze(['LOWER', 'NEUTRAL', 'HIGHER', 'MIXED']),
  pairedDimensions: Object.freeze(['inputTokens', 'outputTokens', 'cachedTokens', 'totalToolActions', 'elapsedMs']),
  overridesCompressionVerdict: false,
  law: 'the net-cost verdict is reported separately and must not silently overwrite the reconstruction-compression verdict',
});

/** §21: the correctness interpretation, frozen so no analysis requires a gap. */
export const CORRECTNESS_INTERPRETATION = Object.freeze({
  requiresCorrectnessGap: false,
  textbookEffect: 'if H and C both reach full final correctness but C requires substantially less historical reconstruction, that is a valid positive result',
  principalSuccessMode: 'same answer with less re-derivation',
});

/** §22: the contrast is raw history vs raw history + capital. No no-history arm exists. */
export const CONTRAST = Object.freeze({
  only: 'raw history versus the same raw history plus governed selected capital',
  noHistoryArm: true,
  forbiddenClaims: Object.freeze([
    'raw history causally improves performance',
    'base-model prior is insufficient',
  ]),
});

/* ================================================================ §23-§25 the laws */

/** §23/§24/§25: the immutability laws this stage operates under. */
export const STAGE_LAWS = Object.freeze({
  planImmutability: 'any real-model invocation against primary project bytes activates plan immutability; no plan amendment afterwards',
  noPrimaryFixtureSmoke: 'no primary-fixture smoke; dummy fixtures only for plumbing',
  onDefectAfterExposure: 'if a load-bearing harness or analysis defect is discovered after behavioral exposure, STOP and preserve the completed runs',
  primaryRecordImmutability: 'primary trial records are immutable once written; post-hoc token/cost enrichment must be a separate append-only artifact',
  historicalEvidenceImmutability: 'the baseline-derived guard must report no protected historical mutation; no restore-and-continue workflow',
});

/* ================================================================ §27 the interpretation scope */

/** §27: what a positive result establishes, and what it explicitly does not. */
export const INTERPRETATION_SCOPE = Object.freeze({
  establishes: 'governed current-standing capital reduced the cost of reconstructing project-specific knowledge from an available raw Project history under this tested Project, executor and runtime',
  doesNotEstablish: Object.freeze([
    'organic capital compounding',
    'cross-model portability',
    'universal intelligence',
    'Procedure marginal efficacy',
    'automatic relevance ranking',
    'Fusion value',
  ]),
});

/* ================================================================ §28 the next gate */

/** §28: the next-gate decision rule, frozen before execution. */
export const NEXT_GATE_RULES = Object.freeze({
  POSITIVE_SIGNAL: 'recommend R3-L1 ORGANIC COMPOUNDING',
  MIXED: 'adjudicate information path and capital compression before adding another fixture',
  NO_SIGNAL: 'adjudicate information path and capital compression before adding another fixture',
  ADVERSE_SIGNAL: 'STOP and examine capital overhead/interface design',
  enlargeModelSetAutomatically: false,
});

/** §30: the final verdict values, frozen so the report cannot invent a new one. */
export const FINAL_VERDICTS = Object.freeze({
  STATUS: Object.freeze(['COMPLETE', 'BLOCKED']),
  UPTAKE: Object.freeze(['CLOSED', 'LIMITED', 'ABSENT']),
  COMPRESSION: Object.freeze(['POSITIVE_SIGNAL', 'MIXED', 'NO_SIGNAL', 'ADVERSE_SIGNAL']),
  NET_COST: Object.freeze(['LOWER', 'NEUTRAL', 'HIGHER', 'MIXED']),
});

/** §23: the commit structure, in order. */
export const COMMIT_STRUCTURE = Object.freeze([
  'design(r3-l0c): freeze project history and current-standing capital',
  'test(r3-l0c): freeze reconstruction experiment plan',
  'results/evidence commit(s)',
]);

/** A one-line summary of the contract, for a report header. */
export function contractSummary() {
  return Object.freeze({
    stage: 'R3-L0C',
    kind: 'project-specific reconstruction contract',
    invariants: INVARIANT_IDS,
    corpusCategories: CORPUS_CATEGORIES.length,
    arms: Object.keys(ARMS),
    blockCount: BLOCK_COUNT,
    generationsPerTrajectory: GENERATIONS_PER_TRAJECTORY,
    totalSessions: TOTAL_SESSIONS,
    treatment: TREATMENT.kind,
    preflightRepairs: PREFLIGHT_REPAIRS.map((entry) => entry.id),
    newline: NL,
  });
}
