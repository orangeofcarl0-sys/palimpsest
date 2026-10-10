/**
 * R3-L0C-I-A-R-L-C-F §0-§12 — THE MEASUREMENT-FIDELITY CONTRACT.
 *
 * This module is this stage's FROZEN SEMANTICS, committed before any correction exists. It records, as values
 * rather than prose, the six distinctions §0 names, the measured defect each one closes, and the fifteen verdicts.
 *
 * THE INVARIANT THIS STAGE IS ABOUT, quoted from the ruling because every gap below is one reading of it:
 *
 *     No stale, substituted, ambiguous, missing, or unverified evidence may be promoted to live causal
 *     evaluability by the authoritative execution path.
 *
 * WHY A NEW NAMESPACE. The prior stage's committed evidence (`research-evidence/r3-l0c-iar-lc/`) and its plan
 * (`r3-l0c-iar-lc-primary-plan`) describe `scripts/r3l0ciarlc/**` as it stood at `c8cd220`. Editing those modules
 * in place would make that record describe code that no longer exists. So this stage SUPERSEDES the
 * R3-L0C-I-A-R-L-C modules with its own, leaves them byte-identical, and binds a freshly computed closure into a
 * NEW plan in a NEW evidence namespace.
 *
 * WHAT THIS STAGE IS NOT. §0 forbids model calls. It is a bounded corrective stage about whether the authoritative
 * Fail-Stop Runner can confuse a captured observation with a fresh measurement, a route declaration with real
 * Worker provenance, an explicitly absent cost with a measured endpoint, or a partial Plan Digest with the full
 * authorized experiment — not a new architecture and not a benchmark stage. `src/**`, `host/**`, the frozen
 * corpus, the capital, the oracle, the randomization, the treatment, the endpoints and the thresholds are
 * untouched.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

const NL = String.fromCharCode(10);

/** §0: the exact baseline this stage starts from. */
export const BASELINE_COMMIT = 'c8cd220fea86d3bdb2d7d2a72e0326be8f99cb74';

/** §0: the stage branch. */
export const STAGE_BRANCH = 'r3-l0c-iar-lcf-measurement-fidelity';

/** §0: this stage's own code namespace. */
export const STAGE_CODE_PATH = 'scripts/r3l0ciarlcf';

/** §0: this stage's own evidence namespace. The ONLY place it may add under `research-evidence/`. */
export const STAGE_EVIDENCE_PATH = 'research-evidence/r3-l0c-iar-lcf';

/** §0: the prior stage, whose code and evidence this stage supersedes but never edits. */
export const SUPERSEDED_STAGE = Object.freeze({
  stage: 'R3-L0C-I-A-R-L-C',
  commit: BASELINE_COMMIT,
  planId: 'r3-l0c-iar-lc-primary-plan',
  planPath: 'research-evidence/r3-l0c-iar-lc/execution-plan.json',
  codePath: 'scripts/r3l0ciarlc',
  pipeline: 'scripts/r3l0ciarlc/pipeline.mjs',
  disposition: 'SUPERSEDED — byte-identical, no longer the authorized entry point',
});

/** §0: the prior evidence namespaces, read but never written by this stage. */
export const PRIOR_EVIDENCE_PATHS = Object.freeze([
  'research-evidence/r3-l0c-iar-lc',
  'research-evidence/r3-l0c-iar-l',
  'research-evidence/r3-l0c-iar',
  'research-evidence/r3-l0c-ia',
  'research-evidence/r3-l0c-f',
  'research-evidence/r3-l0c-i',
  'research-evidence/r3-l0c-r',
  'research-evidence/r3-l0c',
]);

/** The checkout root, resolved from this module's own position. */
export const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');

/* ================================================================ §0 the six distinctions */

/**
 * §0: THE SIX DISTINCTIONS, EACH WITH THE MEASURED DEFECT IT CLOSES.
 *
 * Each records the FILE and LINE where the `c8cd220` behaviour lives and the exact function that was measured to
 * produce it, so a reader can verify the defect rather than take the control's word for it. `property` is what the
 * correction must make true; `authoritativePath` is the function the correction must live inside.
 */
export const MEASUREMENT_GAPS = Object.freeze([
  Object.freeze({
    id: 'F1_CAPTURED_NOT_FRESH',
    section: '§3 Gate F1',
    gap: 'the DETERMINISTIC default of the LC terminal recomputation returns the CAPTURED preflight `closure` and the preflight route identity as though they were admission-time measurements, so the normal non-injected path never exercises the real recomputation',
    baselineLocation: 'scripts/r3l0ciarlc/pipeline.mjs:377 `input.terminalRecompute ?? (async () => ({ closure, route: { MODEL_ROUTE_IDENTITY: modelRouteIdentity(preExposureChecks) } }))` — the default returns the captured objects',
    measured: 'the default path returns `closure` (the preflight object) and the preflight route identity; no recomputation occurs',
    property: 'the DEFAULT path recomputes the closure and the effective route at the terminal-admission boundary, records the measurement basis and the preflight digest separately so drift is classifiable, and refuses a skipped compiled check as a PRIMARY runtime verification',
    authoritativePath: 'scripts/r3l0ciarlcf/freshness.mjs admissionTimeMeasurement',
  }),
  Object.freeze({
    id: 'F2_UNVERIFIED_LIVE_PRIMARY',
    section: '§4 Gate F2',
    gap: 'LIVE_PRIMARY is derived from a regex match on the record route, the sidecar mode and an artifact digest match; none of those proves the artifact came from the scheduled real DSH Worker Attempt, and the identity comparison uses a SUBSTRING match',
    baselineLocation: 'scripts/r3l0ciarlc/cost-bridge.mjs:63 `/omnigate|deepseek|primary/iu.test(route)`; :188 `!String(recordAttempt).includes(attemptIdInPath) && !String(attemptIdInPath).includes(String(recordAttempt))`',
    measured: 'fabricated route "the frozen omnigate DeepSeek route" + sidecar mode PRIMARY + a verified digest yields LIVE_PRIMARY; the substring comparison accepts a prefix/substring collision',
    property: 'LIVE_PRIMARY requires an independently corroborated execution witness naming the scheduled run, the observed worker/attempt/host-job relationship and the uniquely attributed artifact; the attempt identity is compared by EXACT normalization (the canonical `attempt-<hex>` against the path-derived bare hex), never by substring',
    authoritativePath: 'scripts/r3l0ciarlcf/artifact-identity.mjs discoverScheduledArtifact + corroborateExecutionWitness',
  }),
  Object.freeze({
    id: 'F3_DIVIDED_IDENTITIES',
    section: '§5 Gate F3',
    gap: 'the terminal reducer checks session identity from the in-memory `records`, while the cost bridge independently reads `TRIAL_RECORDED` from the durable journal; the two sources can disagree while the combined gate stays GREEN, and a duplicate durable trial is invisible to the identity check',
    baselineLocation: 'scripts/r3l0ciarlc/postmatrix-admission.mjs:62-75 the identity loop iterates the caller-supplied `records`; the durable journal is read only for launch cardinality and journal integrity',
    measured: 'a durable TRIAL_RECORDED with arm C while the schedule and in-memory record say arm H yields `IDENTITIES_EXACT: true` and a GREEN terminal admission',
    property: 'the authoritative session set is derived from the validated durable journal; durable and in-memory observations must agree on the exact block/arm/generation/trajectory identity; a duplicate durable TRIAL_RECORDED is refused; and causal evaluability requires every actual prerequisite rather than merely `allSixteenLivePrimary`',
    authoritativePath: 'scripts/r3l0ciarlcf/durable-reconciliation.mjs reconcileDurableTrials + causalEvaluability',
  }),
  Object.freeze({
    id: 'F4_PARTIAL_PLAN_AND_BUDGET',
    section: '§6 Gate F4',
    gap: '`planContentDigest` hashes a SELECTED projection of the plan, so a change to the route, the settings, the pipeline order, the authorization scope or the frozen endpoints leaves the digest unmoved; and the `ENFORCEABLE_BUDGET` concept becomes true when the budget is `DECLARED_ONLY`',
    baselineLocation: 'scripts/r3l0ciarlc/trust-boundary.mjs:65-86 the digest hashes fifteen named fields and omits `executionRoute`, `pipelineOrder`, `authorizationDecisions`, `reusedModules` and the deviations; :246 `ENFORCEABLE_BUDGET: budget.coversFrozenScope && budget.enforceable === \'DECLARED_ONLY\'`',
    measured: 'mutating `executionRoute.modelId`, `executionRoute.settingsDigest`, `pipelineOrder`, `terminalAdmissionConditions` or `authorizationDecisions` does NOT move the digest; `DECLARED_ONLY` yields `ENFORCEABLE_BUDGET: true`',
    property: 'a deterministic FULL-plan digest covers the canonical content of the committed plan excluding only its own self-referential field, moves on any material change, and stays distinct from the ExecutionClosureDigest; the five budget concepts are separated and `DECLARED_ONLY` never implies an enforceable spending authority',
    authoritativePath: 'scripts/r3l0ciarlcf/plan-identity.mjs fullPlanDigest + scripts/r3l0ciarlcf/trust-boundary.mjs budgetSemantics',
  }),
  Object.freeze({
    id: 'F5_UNBOUND_COMPILER_CACHE',
    section: '§3/§7 Gate F1-D',
    gap: 'the isolated compiled verification caches its verdict at module scope with no record of the source bytes, the compiled bytes, the compiler options or the toolchain it verified, so a changed input leaves the cached verdict GREEN',
    baselineLocation: 'scripts/r3l0ciarlc/compiled-verification.mjs:71 `let cachedVerification = null;` and :81 `if (cachedVerification !== null) return cachedVerification;` — the cache key is the absence of a value, not the identity of the inputs',
    measured: 'the returned object carries no `verifiedInputs`/`inputIdentity`/`sourceDigest` field, so the terminal gate cannot tell whether the cached PASS describes the current inputs',
    property: 'a compiler-verification cache is bound to the exact verified source bytes, compiled bytes, compiler options and toolchain identity; a cache entry without a matching current input identity cannot satisfy freshness',
    authoritativePath: 'scripts/r3l0ciarlcf/compiler-cache.mjs verifyCompiledSourceBoundToInputs',
  }),
]);

/** §0: the five gap ids, so the contract, the controls and the tests agree on the set. */
export const MEASUREMENT_GAP_IDS = Object.freeze(MEASUREMENT_GAPS.map((gap) => gap.id));

/* ================================================================ §3 Gate F1 freshness */

/**
 * §3: THE MEASUREMENT BASIS VOCABULARY.
 *
 * §3 requires the result to record the measurement basis "not merely a boolean `fresh: true`". These are the
 * values, so a reader can distinguish an admission-time recomputation from a captured preflight object.
 */
export const FRESHNESS_BASIS = Object.freeze({
  RECOMPUTED_AT_ADMISSION: 'RECOMPUTED_AT_ADMISSION',
  CAPTURED_PREFLIGHT_OBJECT: 'CAPTURED_PREFLIGHT_OBJECT',
  INJECTED_BY_TEST: 'INJECTED_BY_TEST',
  RECOMPUTATION_FAILED: 'RECOMPUTATION_FAILED',
  law: 'a captured preflight object is not a fresh measurement; the basis is recorded so a reader can classify a drift rather than only observe a boolean',
});

/** §3: the fields a fresh measurement must record, each checked rather than asserted. */
export const FRESHNESS_FIELDS = Object.freeze([
  'basis', 'preflightClosureDigest', 'admissionClosureDigest', 'admissionRouteIdentity', 'recomputedAt', 'drifted', 'boundClosureDigest',
]);

/* ================================================================ §4 Gate F2 artifact identity */

/**
 * §4: THE CANONICAL ATTEMPT-ID NORMALIZATION CONTRACT.
 *
 * The canonical Work AttemptId is `attempt-<hex>` (the historical R3-L0C matrix carries
 * `attempt-dd64ac801a0e56a0c07b97a5ccc07c7c`). A DSH artifact path carries the BARE hex under `attempt-<hex>/`. So
 * the two representations are compared by STRIPPING the canonical prefix and comparing the remainders EXACTLY —
 * never by `String.includes()`, which accepts a prefix or a substring collision.
 */
export const ATTEMPT_ID = Object.freeze({
  canonicalPrefix: 'attempt-',
  canonicalExample: 'attempt-dd64ac801a0e56a0c07b97a5ccc07c7c',
  pathDerivedExample: 'dd64ac801a0e56a0c07b97a5ccc07c7c',
  comparison: 'EXACT_NORMALIZED_EQUALITY',
  substringMatchingPermitted: false,
  law: 'the canonical `attempt-<hex>` and the path-derived bare `<hex>` are the same identity only when the normalized remainders are EXACTLY equal; a prefix or substring collision is a different identity and is refused',
});

/** §4: the artifact-discovery outcomes, so zero, ambiguous and uninterpretable candidates are separate facts. */
export const ARTIFACT_DISCOVERY_OUTCOMES = Object.freeze([
  Object.freeze({ id: 'DISCOVERED_UNIQUE', discovered: true, ambiguous: false, detail: 'exactly one artifact under the session-scoped DSH home carries the scheduled attempt identity' }),
  Object.freeze({ id: 'NO_CANDIDATE', discovered: false, ambiguous: false, detail: 'no artifact under the scoped home carries the scheduled attempt identity' }),
  Object.freeze({ id: 'AMBIGUOUS_CANDIDATES', discovered: false, ambiguous: true, detail: 'more than one artifact carries the scheduled attempt identity, so selecting one by recency would be a convenience' }),
  Object.freeze({ id: 'IDENTITY_UNPARSEABLE', discovered: false, ambiguous: false, detail: 'an artifact exists but its path encodes no attempt identity, so it cannot be attributed' }),
  Object.freeze({ id: 'SCOPE_UNAVAILABLE', discovered: false, ambiguous: false, detail: 'the session-scoped DSH home does not exist, so no discovery is possible' }),
]);

/** §4: the provenance vocabulary, so a fixture measurement is never read as a live causal observation. */
export const BRIDGE_PROVENANCE = Object.freeze({ LIVE_PRIMARY: 'LIVE_PRIMARY', FIXTURE: 'FIXTURE', ABSENT: 'ABSENT' });

/** §4: what an INDEPENDENTLY CORROBORATED EXECUTION WITNESS must establish. */
export const EXECUTION_WITNESS = Object.freeze({
  required: Object.freeze([
    'scheduledRunAndSession',
    'observedWorkerAttemptHostJobRelationship',
    'executionRouteAndRealWorkerProcess',
    'uniquelyAttributedArtifact',
  ]),
  declarationsAreNotObservations: true,
  routeStringAloneIsInsufficient: true,
  sidecarModeAloneIsInsufficient: true,
  newCanonicalOwnerCreated: false,
  law: 'LIVE_PRIMARY requires an execution witness that independently corroborates the scheduled run, the observed worker/attempt/host-job relationship, the real worker process and the uniquely attributed artifact; a route declaration and a sidecar mode are declarations, not observations',
});

/** §4: the honest outcomes when an authentic current-run witness cannot be demonstrated without a paid launch. */
export const ARTIFACT_PROVENANCE_UNPROVEN = Object.freeze({
  REAL_DSH_ARTIFACT_DISCOVERY: 'NOT_ESTABLISHED',
  LIVE_PRIMARY_PROVENANCE: 'NOT_ESTABLISHED',
  reason: 'no authentic current-run DSH artifact exists without entering a paid PRIMARY execution, which §0 forbids',
});

/* ================================================================ §5 Gate F3 durable coherence */

/** §5: the durable-reconciliation conditions, each a required terminal-admission input. */
export const DURABLE_RECONCILIATION_CONDITIONS = Object.freeze([
  Object.freeze({ id: 'DURABLE_SESSION_SET_EXACT', detail: 'the authoritative session set is derived from the validated durable journal and equals the frozen schedule' }),
  Object.freeze({ id: 'DURABLE_TRIAL_UNIQUE', detail: 'exactly one durable TRIAL_RECORDED exists per planned session, and no unplanned trial exists' }),
  Object.freeze({ id: 'DURABLE_IDENTITY_EXACT', detail: 'every durable trial record carries the exact frozen block/arm/generation/trajectory identity' }),
  Object.freeze({ id: 'DURABLE_MATCHES_IN_MEMORY', detail: 'the durable observation and the runner\'s in-memory observation agree on every session identity' }),
  Object.freeze({ id: 'EXPOSURE_AND_LAUNCH_CARDINALITY', detail: 'exactly one exposure intent and one launch record exist per planned session' }),
  Object.freeze({ id: 'SIDECAR_BINDING_VALID', detail: 'every durable trial binds a live-evidence sidecar whose bytes still hash to the binding' }),
  Object.freeze({ id: 'COST_EVIDENCE_CLASSIFIED', detail: 'every planned session carries a cost measurement or an explicit labelled absence' }),
  Object.freeze({ id: 'JOURNAL_INTEGRITY', detail: 'the durable journal has no torn tail and no write left in flight' }),
]);

/**
 * §5: THE COST-COMPLETENESS LEVELS.
 *
 * §5 requires these three to be separate, because `interpretable` alone does not mean every cost endpoint has a
 * value. A deterministic matrix with clearly labelled FIXTURE data may be mechanically valid; an explicit absence
 * must not satisfy a requirement that actually demands a measured endpoint.
 */
export const COST_COMPLETENESS_LEVELS = Object.freeze([
  Object.freeze({ id: 'CostAccountingComplete', detail: 'every planned session has an explicit measurement or an explicit absence classification' }),
  Object.freeze({ id: 'CostMeasuredComplete', detail: 'every required session has a validated cost observation' }),
  Object.freeze({ id: 'LivePrimaryCostComplete', detail: 'every required session has a real PRIMARY cost observation with verified execution provenance' }),
]);

/**
 * §5: THE PREREQUISITES OF A CAUSAL VERDICT.
 *
 * §5: "The scientific causal-evaluability decision must require all of its actual prerequisites, not merely
 * `allSixteenLivePrimary === true`." So every one of these must hold, and each is a measured value.
 */
export const CAUSAL_PREREQUISITES = Object.freeze([
  'AUTHORITATIVE_ADMISSION_GREEN',
  'COST_MEASUREMENT_LIVE_PRIMARY_COMPLETE',
  'TREATMENT_REALIZATION_APPLIED',
  'IDENTITIES_EXACT_DURABLE_AND_IN_MEMORY',
  'ANALYSIS_PLAN_UNCHANGED',
  'ZERO_RETRIES_AND_REPLACEMENTS',
  'EXECUTION_CLOSURE_FRESH_MATCH',
  'ROUTE_FRESH_MATCH',
  'RUNTIME_ATTESTED',
]);

/* ================================================================ §6 Gate F4 plan identity and budget */

/** §6: the five separated budget concepts. §5 of the prior stage named them; this stage makes them truthful. */
export const BUDGET_CONCEPTS = Object.freeze([
  Object.freeze({ id: 'DECLARED_BUDGET', detail: 'the record declares a session ceiling and a currency' }),
  Object.freeze({ id: 'SESSION_SCOPE_COVERAGE', detail: 'the declared ceiling covers the frozen 16-session scope' }),
  Object.freeze({ id: 'MAX_AUTHORIZED_MONETARY_EXPENDITURE', detail: 'a maximum authorized monetary expenditure, as distinct from a session count' }),
  Object.freeze({ id: 'ACTUAL_HOST_ENFORCED_BUDGET', detail: 'the host actually enforces a spending limit, which requires a host enforcement mechanism' }),
  Object.freeze({ id: 'CURRENT_LAUNCH_PERMISSION', detail: 'the launch boundary is open for this run right now' }),
]);

/** §6: the material plan fields a full digest must cover, so a reader can see the coverage is complete. */
export const PLAN_DIGEST_COVERAGE = Object.freeze([
  'planId', 'stage', 'kind', 'baseline', 'frozenBefore', 'planSupersession', 'executionPathDeviations',
  'pipelineOrder', 'primaryDerivedInputs', 'authorizationRecordFields', 'authorizationDecisions',
  'terminalAdmissionConditions', 'reusedModules', 'stageHarnessModules', 'preservedDesign', 'schedule',
  'executionClosure', 'executionRoute', 'authorizationRequired', 'stageStop', 'frozenAt', 'orderingLaw',
]);

/** §6: the digest's own self-referential field, which is the ONE thing a full digest must exclude. */
export const PLAN_DIGEST_SELF_FIELD = 'planContentDigest';

/* ================================================================ §6 the authority vocabulary */

/** §6: the authority trust verdicts. */
export const AUTHORITY_TRUST = Object.freeze({
  VERIFIED: 'VERIFIED',
  NOT_ESTABLISHED: 'AUTHORITY_NOT_ESTABLISHED',
  PENDING: 'PENDING',
  REFUSED: 'REFUSED',
  thisStageProvidesAuthorization: false,
  syntacticallyValidDecisionIsTrustedAuthority: false,
  law: 'a syntactically valid `decision:` string is not externally verified authority; with no trusted source this stage returns AUTHORITY_NOT_ESTABLISHED and keeps the PRIMARY launch prohibited',
});

/** §6: what an authorization record must carry. */
export const AUTHORIZATION_RECORD_FIELDS = Object.freeze([
  'authority', 'approvedPlanId', 'approvedPlanDigest', 'paidRunBudget', 'decisions',
]);

/** §6: the five fail-stop decisions an authorization must name. */
export const AUTHORIZATION_REQUIREMENTS = Object.freeze([
  Object.freeze({ id: 'PAID_MODEL_USAGE', detail: 'paid model usage' }),
  Object.freeze({ id: 'BOUNDED_FAIL_STOP_PROTOCOL', detail: 'the bounded fail-stop protocol' }),
  Object.freeze({ id: 'NO_AUTOMATIC_RETRIES_OR_REPLACEMENTS', detail: 'no automatic retries or replacement sessions' }),
  Object.freeze({ id: 'PRESERVE_PARTIALLY_COMPLETED_INVALID_RUNS', detail: 'preservation of partially completed invalid runs' }),
  Object.freeze({ id: 'ACCEPTED_PROMPT_NEUTRALITY_LIMITED', detail: 'the accepted PROMPT_NEUTRALITY = LIMITED constraint' }),
]);

/* ================================================================ §4 the terminal decision vocabulary */

/** §4: the terminal decision vocabulary. GREEN is the only value under which the runner may complete. */
export const TERMINAL_DECISIONS = Object.freeze({ GREEN: 'GREEN', RED: 'RED' });

/** §4: what a RED terminal decision must produce, stated as values so the falsifier can assert them. */
export const RED_CONSEQUENCES = Object.freeze({
  matrixCompleted: false,
  terminalEventRecorded: 'MATRIX_ABORTED',
  causalVerdictIssued: false,
  laterWorkerLaunch: false,
  preservedTerminalState: 'ABORT_PRESERVED',
});

/* ================================================================ §7 the compiler cache */

/** §7: the inputs a compiler-verification cache entry must be bound to. */
export const COMPILER_CACHE_INPUTS = Object.freeze([
  'sourceDigests', 'compiledDigests', 'compilerOptionsDigest', 'toolchainIdentity', 'pairCount',
]);

/* ================================================================ §8 the frozen design */

/** §8: the frozen scientific design, unchanged, so a correction to the measurement path cannot move it. */
export const PRESERVED_DESIGN = Object.freeze({
  researchQuestion: 'when the correct project-specific operating knowledge is recoverable from a substantial raw Project history, does governed current-standing cognitive capital reduce the cost and unreliability of reconstructing that knowledge?',
  experimentalUnit: 'ProjectTrajectory',
  pairedBlocks: 4,
  arms: Object.freeze(['H', 'C']),
  generations: Object.freeze(['G1', 'G2']),
  sessions: 16,
  treatment: 'SELECTION_ONLY',
  randomizationSeed: '1380724738',
  armOrder: Object.freeze([Object.freeze(['C', 'H']), Object.freeze(['H', 'C']), Object.freeze(['C', 'H']), Object.freeze(['C', 'H'])]),
  corpusCapitalExposuresOracleEndpointsThresholdsChanged: false,
  treatmentSurfaceChanged: false,
  sampleSizeIncreased: false,
  invalidHistoricalRunsRepeated: false,
  law: 'the purpose of this stage is to improve the validity of the measurement path, not to improve the experimental result',
});

/* ================================================================ §12 the verdicts and the readiness */

/** §12: the fifteen final verdicts and their vocabularies. */
export const FINAL_VERDICTS = Object.freeze({
  NORMAL_PATH_FRESHNESS: Object.freeze(['PASS', 'FAIL']),
  COMPILED_ATTESTATION_FRESHNESS: Object.freeze(['PASS', 'FAIL']),
  DURABLE_TRIAL_CONSISTENCY: Object.freeze(['PASS', 'FAIL']),
  FIXTURE_COST_BRIDGE: Object.freeze(['PASS', 'FAIL']),
  ARTIFACT_IDENTITY_DISCOVERY: Object.freeze(['PASS', 'FAIL', 'NOT_ESTABLISHED']),
  LIVE_PRIMARY_PROVENANCE: Object.freeze(['PASS', 'NOT_ESTABLISHED']),
  COST_MEASUREMENT_COMPLETENESS: Object.freeze(['PASS', 'FAIL']),
  CAUSAL_ADMISSION_INTEGRITY: Object.freeze(['PASS', 'FAIL']),
  FULL_PLAN_DIGEST: Object.freeze(['PASS', 'FAIL']),
  EXTERNAL_AUTHORITY: Object.freeze(['PASS', 'NOT_ESTABLISHED']),
  SPEND_ENFORCEMENT: Object.freeze(['PASS', 'NOT_ESTABLISHED']),
  EXECUTION_CLOSURE: Object.freeze(['MATCH', 'DRIFTED']),
  HISTORICAL_IMMUTABILITY: Object.freeze(['PASS', 'FAIL']),
  PAID_EXECUTION: Object.freeze(['NOT_RUN', 'RUN']),
  CAUSAL_RESULT: Object.freeze(['NOT_EVALUABLE', 'EVALUABLE']),
});

/** §12: the verdicts this stage cannot legitimately promote, carried as values. */
export const UNEARNED_VERDICTS = Object.freeze({
  LIVE_PRIMARY_PROVENANCE: 'NOT_ESTABLISHED',
  EXTERNAL_AUTHORITY: 'NOT_ESTABLISHED',
  SPEND_ENFORCEMENT: 'NOT_ESTABLISHED',
  PAID_EXECUTION: 'NOT_RUN',
  CAUSAL_RESULT: 'NOT_EVALUABLE',
  neverPromotedToPass: true,
});

/** §12: the four readiness statements, which §12 requires to be kept SEPARATE. */
export const READINESS_STATEMENTS = Object.freeze([
  Object.freeze({ id: 'DETERMINISTIC_MEASUREMENT_QUALIFIED', detail: 'the deterministic measurement machinery is qualified by this stage\'s gates' }),
  Object.freeze({ id: 'REAL_ARTIFACT_COMPATIBILITY_ESTABLISHED', detail: 'an authentic current-run DSH artifact was discovered and attributed' }),
  Object.freeze({ id: 'PRIMARY_EXECUTION_AUTHORIZED', detail: 'an independently verified external authorization exists' }),
  Object.freeze({ id: 'PRIMARY_CAUSAL_DATA_AVAILABLE', detail: 'live PRIMARY cost observations exist for the frozen scope' }),
]);

/* ================================================================ §11 the commits and the stop */

/** §11: the commit structure this stage follows. */
export const COMMIT_STRUCTURE = Object.freeze([
  'test(r3-l0c-iar-lcf): freeze failing controls for the measurement-fidelity gates',
  'fix(r3-l0c-iar-lcf): recompute freshness, discover artifact identity, reconcile durable trials, bind the full plan',
  'research(r3-l0c-iar-lcf): supersede the prospective plan with measurement-fidelity evidence',
]);

/** §11: the commit law. */
export const COMMIT_LAW = Object.freeze({
  failingControlsBeforeImplementation: true,
  priorResearchCommitsImmutable: true,
  supersedesRatherThanAmendsPriorPlan: true,
  testsDoNotRegenerateCommittedPlans: true,
  forcePush: false,
  mergeToMain: false,
  finalClosureComputedAfterFinalBuild: true,
});

/** §0: the mandatory stop, carried as a value so the stage's own record states it. */
export const STAGE_STOP = Object.freeze({
  ranPaidMatrix: false,
  beganR3L1: false,
  beganFusion: false,
  modelCallsMade: 0,
  enteredPrimaryExecution: false,
  law: 'PAID_EXECUTION = NOT_RUN and REAL_PRIMARY_CAUSAL_RESULT = NOT_EVALUABLE, then STOP',
});

/** A one-line summary, for a report header. */
export function contractSummary() {
  return Object.freeze({
    stage: 'R3-L0C-I-A-R-L-C-F',
    kind: 'measurement fidelity and pre-authorization closure contract',
    baseline: BASELINE_COMMIT,
    gaps: MEASUREMENT_GAPS.length,
    durableConditions: DURABLE_RECONCILIATION_CONDITIONS.length,
    costCompletenessLevels: COST_COMPLETENESS_LEVELS.length,
    causalPrerequisites: CAUSAL_PREREQUISITES.length,
    budgetConcepts: BUDGET_CONCEPTS.length,
    verdicts: Object.keys(FINAL_VERDICTS).length,
    readinessStatements: READINESS_STATEMENTS.length,
    modelCallsMade: STAGE_STOP.modelCallsMade,
    newline: NL,
  });
}

export { NL };
