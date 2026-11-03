/**
 * R3-L0C-I-A-R §1-§9 — THE FINAL ACTIVATION WIRING CONTRACT.
 *
 * This module is this stage's FROZEN SEMANTICS, committed before any repair exists. It records, as values rather
 * than prose, the eight defects the ruling names in the R3-L0C-I-A activation and evidence contract, the single
 * authoritative pipeline that replaces the split activation/launch pair, the explicit condition-success mapping,
 * the six admission negative controls, the uptake-provenance states, the artifact-identity fields, the nine
 * post-matrix causal conditions, the authorization law and the twelve final verdicts.
 *
 * WHY THIS STAGE HAS ITS OWN NAMESPACE. R3-L0C-I-A's committed evidence names `scripts/r3l0cia/*` as its
 * authoritative execution path and binds a closure digest over those bytes. Editing them in place would make that
 * stage's record describe code that no longer exists — the same error R3-L0C-I-A itself refused when it
 * quarantined R3-L0C-R's matrix instead of deleting it. So this stage SUPERSEDES the R3-L0C-I-A modules with its
 * own, leaves them byte-identical, and binds a freshly computed closure into a NEW plan.
 *
 * WHAT THIS STAGE IS NOT. It is a bounded correction of proven defects, not a new infrastructure programme. §0
 * forbids LLM calls and forbids starting the paid matrix. Nothing here creates product authority: `src/**` and
 * `host/**` are untouched.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

const NL = String.fromCharCode(10);

/** §0: the exact baseline this stage starts from. */
export const BASELINE_COMMIT = 'dbe6beb92c33e78b1f2e75604f5da2babaf50df2';

/** §0: the stage branch. */
export const STAGE_BRANCH = 'r3-l0c-iar-final-activation';

/** §9: this stage's own code namespace. */
export const STAGE_CODE_PATH = 'scripts/r3l0ciar';

/** §9: this stage's own evidence namespace. The ONLY place it may add under `research-evidence/`. */
export const STAGE_EVIDENCE_PATH = 'research-evidence/r3-l0c-iar';

/** §9: the prior stage's evidence, read but never written by this stage. */
export const PRIOR_EVIDENCE_PATHS = Object.freeze([
  'research-evidence/r3-l0c-ia',
  'research-evidence/r3-l0c-f',
  'research-evidence/r3-l0c-i',
  'research-evidence/r3-l0c-r',
  'research-evidence/r3-l0c',
]);

/** §1: the prior stage this one corrects, and its plan, which must not be modified. */
export const SUPERSEDED_STAGE = Object.freeze({
  stage: 'R3-L0C-I-A',
  commit: BASELINE_COMMIT,
  planId: 'r3-l0c-ia-primary-plan',
  planPath: 'research-evidence/r3-l0c-ia/execution-plan.json',
  codePath: 'scripts/r3l0cia',
  disposition: 'SUPERSEDED — byte-identical, no longer the authorized entry point',
});

/** The checkout root, resolved from this module's own position. */
export const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');

/* ================================================================ §1/§2 the correction defects */

/**
 * §1/§2-§8: THE EIGHT DEFECTS THIS STAGE CORRECTS.
 *
 * Each is recorded with the FILE and LINE where the R3-L0C-I-A behaviour lives, so a reader can verify the defect
 * rather than take the falsifier's word for it. The `property` field is what the repair must make true, and it is
 * what `falsifiers.mjs` measures against the R3-L0C-I-A code at `dbe6beb`.
 */
export const CORRECTION_DEFECTS = Object.freeze([
  Object.freeze({
    id: 'G1_AUTHORITATIVE_ENTRY_PREPARES_BEFORE_CLAIM',
    section: '§2',
    gap: 'the authoritative matrix driver prepares the run root before the exclusive activation claim, and the paid launch exists outside the activation entry',
    baselineLocation: 'scripts/r3l0cia/primary-driver.mjs:126 (preparePrimaryCase) before :224 (runFailStopMatrix claims); scripts/r3l0cia/activation.mjs:466 stops at the launch boundary',
    property: 'one authoritative pipeline claims the run root before any World, state store or profile byte changes, and the paid launch exists only inside that pipeline',
    measuredBy: 'a byte digest of the run root across a refused replay through the real driver, plus the absence of any second launch path',
  }),
  Object.freeze({
    id: 'G2_PRETRIAL_REDUCER_YES_ONLY',
    section: '§3',
    gap: 'the pre-trial reducer treats only the literal verdict "YES" as satisfied, so CONTAINMENT ("PASS") and EXECUTION_CLOSURE ("MATCH") can never be satisfied and ALL_SATISFIED is permanently false; the activation never requires it',
    baselineLocation: 'scripts/r3l0cia/validity.mjs:41 satisfied: verdict === "YES"; scripts/r3l0cia/activation.mjs:447 runs preExposureChecks without requiring ALL_SATISFIED',
    property: 'an explicit condition-specific success mapping makes all eight healthy conditions satisfied, and the activation refuses before exposure unless ALL_SATISFIED === true',
    measuredBy: 'the evaluation with all eight real condition values healthy, and one negative case per condition',
  }),
  Object.freeze({
    id: 'G3_MODEL_ROUTE_IDENTITY_UNCHECKED',
    section: '§3',
    gap: 'MODEL_ROUTE_CONFIGURATION_MATCH tests only that a resolved mode exists and the plan declares an authoritative-path string, not the actual effective provider/model/route/settings identity',
    baselineLocation: 'scripts/r3l0cia/validity.mjs:73-75 routeMatches = mode?.resolved === true && mode?.mode !== undefined && plannedRoute !== null',
    property: 'the actual effective provider, model, route and settings identities are compared against the plan',
    measuredBy: 'a healthy evaluation with a drifted effective route, which must report MODEL_ROUTE_IDENTITY = DRIFTED',
  }),
  Object.freeze({
    id: 'G4_CHILD_WORKER_ADMISSION_GAP',
    section: '§4',
    gap: 'a malformed Worker Result, an invalid result vocabulary, a child report with ok=false under a FINISHED host phase, a missing Attempt identity, an unexpected terminal state and a declared outcome missing mandatory evidence are all admissible',
    baselineLocation: 'scripts/r3l0cia/primary-adapter.mjs:237-291 carries childOk/attemptId/attemptState but scripts/r3l0cf/outcome-admission.mjs never refuses on them',
    property: 'each of the six named negative controls refuses trial admission end-to-end',
    measuredBy: 'the admission gate over each negative control, driven through the real adapter outcome shape',
  }),
  Object.freeze({
    id: 'G5_UPTAKE_ZERO_VS_MISSING',
    section: '§5',
    gap: 'an absent or malformed worker telemetry line becomes a measured ZERO uptake, because the shipped parser returns an empty array for both "no line" and "malformed line" and the adapter coalesces it to 0',
    baselineLocation: 'scripts/r3l0cia/primary-adapter.mjs:260 governedPullCount: layers.workerPullObserved.count ?? 0',
    property: 'WORKER_PULL_OBSERVED_ZERO and WORKER_PULL_TELEMETRY_MISSING are distinct, and a host audit may not repair missing worker telemetry',
    measuredBy: 'a transcript with no telemetry line and one with an explicit zero-pull line, through the real layer builder',
  }),
  Object.freeze({
    id: 'G6_COST_ATTRIBUTION_FILENAME_ONLY',
    section: '§6',
    gap: 'artifact attribution relies on filename substring and regex matching alone, does not corroborate runId/HostJobId, and nothing requires all sixteen real cost records before the paired analysis may execute',
    baselineLocation: 'scripts/r3l0cia/instrumentation.mjs:58-86 attributeArtifact; :179-219 measureMatrixCost reports allAttributed but gates nothing',
    property: 'attribution binds runId -> sessionId -> trajectoryId -> generation -> AttemptId -> HostJobId -> artifact digest, refuses when identity cannot be corroborated, and requires all sixteen records before the causal verdict',
    measuredBy: 'an artifact whose path names the session but whose identity cannot be corroborated, and a matrix of fewer than sixteen records',
  }),
  Object.freeze({
    id: 'G7_POST_MATRIX_CAUSAL_ADMISSION_INCOMPLETE',
    section: '§7',
    gap: 'the post-matrix gate skips a record whose treatmentRealization is undefined and checks none of trajectory legitimacy, uptake/cost telemetry interpretability, system/environment validity, route match, analysis-plan invariance or zero replacements; the qualification verdicts are hardcoded literals',
    baselineLocation: 'scripts/r3l0cia/validity.mjs:129 realizationFailures filter; scripts/r3l0cia/qualification.mjs:254-263 RECONSTRUCTION_INSTRUMENTATION: "PASS" and PAID_REPLICATION: "READY_FOR_AUTHORIZATION"',
    property: 'nine mechanical conditions are required, every failed input yields CAUSAL_EXPERIMENT_VALID = NO with RECONSTRUCTION_COMPRESSION and NET_COGNITIVE_COST = NOT_EVALUABLE, and the qualification verdict is computed from the gate results rather than hardcoded',
    measuredBy: 'the gate over each of the nine failing inputs, and the computed qualification verdicts',
  }),
  Object.freeze({
    id: 'G8_TIMEOUT_RESULT_LINE_AS_EXIT',
    section: '§8',
    gap: 'a Worker Result line is equated with confirmed process exit, so a timed-out execution whose descendant is still alive is classified as an established exit; and a caller-supplied paidAuthorization boolean is treated as an authorization decision',
    baselineLocation: 'scripts/r3l0cia/primary-adapter.mjs:354 descendantExitEstablished = !timedOut || workerFinished(); scripts/r3l0cia/activation.mjs:345 paidAuthorizationPresent: input.paidAuthorization === true',
    property: 'a timed-out execution whose descendant status cannot be established is UNCERTAIN regardless of an emitted result line, and a paidAuthorization boolean is a configuration signal rather than a verified authorization decision',
    measuredBy: 'a worker that reports its result and then keeps running past the outer budget, and the authorization resolution for a boolean signal',
  }),
]);

/* ================================================================ §3 the condition success mapping */

/**
 * §3: THE EXPLICIT CONDITION-SUCCESS MAPPING.
 *
 * The defect is that the reducer used one literal (`"YES"`) for conditions that legitimately report other
 * verdicts. The repair is an INTERNAL PASS / FAIL / NOT_EVALUATED vocabulary, and each condition maps its own
 * observed value into it. The mapping is data so a test can assert every accepted value rather than trusting the
 * reducer's branches.
 */
export const CONDITION_SUCCESS = Object.freeze({
  SYSTEM_VALID: Object.freeze({ pass: Object.freeze(['PASS', 'YES']), fail: Object.freeze(['FAIL', 'NO']) }),
  EXPERIMENT_ENVIRONMENT_VALID: Object.freeze({ pass: Object.freeze(['PASS']), fail: Object.freeze(['FAIL']) }),
  CONTAINMENT: Object.freeze({ pass: Object.freeze(['PASS']), fail: Object.freeze(['FAIL']) }),
  EXECUTION_CLOSURE: Object.freeze({ pass: Object.freeze(['MATCH']), fail: Object.freeze(['DRIFTED']) }),
  SELECTION_REALIZATION_PREFLIGHT: Object.freeze({ pass: Object.freeze(['PASS']), fail: Object.freeze(['FAIL']) }),
  ANALYSIS_PLAN_VALID: Object.freeze({ pass: Object.freeze(['PASS', 'YES']), fail: Object.freeze(['FAIL', 'NO']) }),
  SCHEDULE_MATCH: Object.freeze({ pass: Object.freeze(['MATCH', 'YES']), fail: Object.freeze(['NO', 'MISMATCH']) }),
  /**
   * §3: `UNKNOWN` is deliberately NEITHER a pass NOR a failure.
   *
   * A route identity that could not be read is not the same fact as a route that was read and disagreed, so it
   * maps to NOT_EVALUATED — which is never satisfied, and which `modelRouteIdentity` reports as `UNKNOWN` rather
   * than as `DRIFTED`.
   */
  MODEL_ROUTE_CONFIGURATION_MATCH: Object.freeze({ pass: Object.freeze(['MATCH']), fail: Object.freeze(['DRIFTED']) }),
});

/** §3: the internal vocabulary. Only `PASS` is satisfied; `NOT_EVALUATED` is never satisfied. */
export const CONDITION_VOCABULARY = Object.freeze(['PASS', 'FAIL', 'NOT_EVALUATED']);

/** §3: the eight pre-trial requirement ids, in the ruling's order. */
export const PRE_TRIAL_REQUIREMENTS = Object.freeze([
  'SYSTEM_VALID',
  'EXPERIMENT_ENVIRONMENT_VALID',
  'CONTAINMENT',
  'EXECUTION_CLOSURE',
  'SELECTION_REALIZATION_PREFLIGHT',
  'ANALYSIS_PLAN_VALID',
  'SCHEDULE_MATCH',
  'MODEL_ROUTE_CONFIGURATION_MATCH',
]);

/** §3: what the activation requires of the pre-exposure check callback. */
export const PRE_EXPOSURE_LAW = Object.freeze({
  requiresAllSatisfied: true,
  absentCallbackRefuses: true,
  unknownValueRefuses: true,
  falseResultRefuses: true,
  refusalPrecedesExposure: true,
  law: 'the activation must require preExposureChecks.ALL_SATISFIED === true; an absent callback, an unknown value or a false result refuses before exposure',
});

/* ================================================================ §4 the admission negative controls */

/**
 * §4: THE SIX ADMISSION NEGATIVE CONTROLS.
 *
 * Each names an observation that must refuse trial admission end-to-end, and the cause it must report.
 */
export const ADMISSION_NEGATIVE_CONTROLS = Object.freeze([
  Object.freeze({ id: 'WORKER_RESULT_LINE_MALFORMED', detail: 'a PALIMPSEST_WORK_RESULT line is present but does not parse', requiredCause: 'MALFORMED_WORKER_RESULT' }),
  Object.freeze({ id: 'WORKER_RESULT_VOCABULARY_INVALID', detail: 'the result line parses but its kind is outside the shipped vocabulary, or lacks its mandatory field', requiredCause: 'INVALID_WORKER_RESULT_VOCABULARY' }),
  Object.freeze({ id: 'CHILD_REPORT_ERROR_HOST_FINISHED', detail: 'the child report says ok=false while the host phase is FINISHED', requiredCause: 'CHILD_REPORT_ERROR_UNDER_FINISHED_HOST' }),
  Object.freeze({ id: 'MISSING_ATTEMPT_IDENTITY', detail: 'the attempt id is absent from the outcome', requiredCause: 'MISSING_ATTEMPT_IDENTITY' }),
  Object.freeze({ id: 'UNEXPECTED_TERMINAL_STATE', detail: 'the attempt reached a terminal state outside the expected set', requiredCause: 'UNEXPECTED_TERMINAL_STATE' }),
  Object.freeze({ id: 'DECLARED_OUTCOME_MISSING_EVIDENCE', detail: 'the outcome declares a result but omits a mandatory admission signal', requiredCause: 'INSUFFICIENT_ADMISSION_EVIDENCE' }),
]);

/** §4: the terminal attempt states the primary path expects when a result was declared. */
export const EXPECTED_TERMINAL_STATES = Object.freeze(['COMPLETED', 'SETTLED', 'PROMOTED']);

/** §4: the law about behavioural admissibility. */
export const ADMISSION_LAW = Object.freeze({
  behaviouralIncorrectnessIsAdmissible: true,
  wrongHiddenOracleVectorIsInfrastructureFailure: false,
  requiresPositiveQualityOutcome: false,
  declaredOutcomeRequiresEvidence: true,
  law: 'behavioural incorrectness is admissible data when the trial has valid machinery and treatment; only machinery, treatment, identity and evidence faults refuse admission',
});

/* ================================================================ §5 the uptake provenance */

/**
 * §5: THE UPTAKE-PROVENANCE STATES.
 *
 * The defect collapses two different facts into `0`. They are separated here, and only the OBSERVED states may be
 * read as an uptake measurement.
 */
export const UPTAKE_PROVENANCE = Object.freeze({
  OBSERVED_ZERO: 'WORKER_PULL_OBSERVED_ZERO',
  OBSERVED_N: 'WORKER_PULL_OBSERVED_N',
  TELEMETRY_MISSING: 'WORKER_PULL_TELEMETRY_MISSING',
  TELEMETRY_MALFORMED: 'WORKER_PULL_TELEMETRY_MALFORMED',
  PARSER_UNAVAILABLE: 'WORKER_PULL_PARSER_UNAVAILABLE',
});

/** §5: the states that are a real uptake measurement. */
export const OBSERVED_UPTAKE_STATES = Object.freeze([UPTAKE_PROVENANCE.OBSERVED_ZERO, UPTAKE_PROVENANCE.OBSERVED_N]);

/** §5: the law. */
export const UPTAKE_LAW = Object.freeze({
  missingIsNotZero: true,
  malformedIsNotZero: true,
  hostAuditMayNotRepairMissingWorkerTelemetry: true,
  hostResolveAuditIsUptakeEvidence: false,
  workerPullObservedIsUptakeEvidence: true,
  declinedPullIsAStop: false,
  law: 'a missing or malformed telemetry line is never a measured zero uptake, and a host audit resolution may not stand in for the worker’s own telemetry',
});

/* ================================================================ §6 the artifact identity */

/**
 * §6: THE ARTIFACT-IDENTITY CHAIN.
 *
 * Attribution binds all seven fields; filename matching alone is forbidden, and an uncorroborated identity is
 * refused rather than accepted.
 */
export const ARTIFACT_IDENTITY_FIELDS = Object.freeze([
  'runId', 'sessionId', 'trajectoryId', 'generation', 'attemptId', 'hostJobId', 'artifactDigest',
]);

/** §6: the law. */
export const ARTIFACT_ATTRIBUTION_LAW = Object.freeze({
  identityChainRequired: true,
  filenameMatchingAlone: false,
  attributedTrueWithoutCorroboration: false,
  requiresAllSixteenRecords: true,
  missingOrAmbiguousBlocksTheCausalVerdict: true,
  silentlyZeroCostSessions: false,
  fixtureInstrumentationSeparatelyLabeled: true,
  law: 'the primary pipeline discovers its own DSH session artifacts and binds each to runId, sessionId, trajectoryId, generation, AttemptId, HostJobId and artifact digest; a missing or ambiguous attribution blocks the causal verdict rather than becoming a zero-cost session',
});

/** §6: the two provenance labels. */
export const INSTRUMENTATION_PROVENANCE = Object.freeze({ LIVE_PRIMARY: 'LIVE_PRIMARY', FIXTURE: 'FIXTURE' });

/** §6: the per-session cost fields, from the frozen R3-L0C instrumentation. */
export const RECONSTRUCTION_COST_FIELDS = Object.freeze([
  'sessionArtifactIdentity', 'attemptId', 'hostJobId', 'rawHistoryArtifactsRead', 'rawHistoryBytesReturned',
  'historyReadActions', 'capitalPullActions', 'capitalReturnedBodyObservations', 'actionsBeforeFirstResult',
  'elapsedToFirstResultMs', 'completionCause', 'hiddenQualityVector', 'treatmentWitness', 'uptakeWitness',
]);

/* ================================================================ §7 the runtime manifest */

/**
 * §7: THE DYNAMICALLY LOADED RUNTIME MODULES.
 *
 * §7 states plainly that these are NOT all discoverable by a static import-regex walker, because the generation
 * child loads them by COMPUTED path from `dist/src`. A narrow explicit manifest is what binds their actual bytes
 * into the closure, and it is narrow rather than general: §7 forbids building a bundler or dependency system.
 */
export const RUNTIME_MANIFEST_MODULES = Object.freeze([
  'dist/src/advanced.js',
  'dist/src/interaction/work_delegation.js',
  'dist/src/interaction/delegation.js',
  'dist/src/project_workspace/index.js',
  'dist/src/proof_asset/index.js',
  'dist/src/reasoning_cell/index.js',
  'dist/src/procedures/index.js',
  'dist/src/deployment/work_worker.js',
]);

/** §7: the manifest law. */
export const RUNTIME_MANIFEST_LAW = Object.freeze({
  reason: 'these modules are loaded by computed path, so a static import-regex walker cannot see them',
  narrowExplicitManifest: true,
  buildsGeneralBundlerOrDependencySystem: false,
  mutationRequired: 'changing one previously uncovered load-bearing compiled module must change the closure digest',
  deterministicEmitVerification: true,
  toolchainVersionBinding: true,
  recordsConfiguredAndObserved: true,
  checkpointEquivalenceFromFamilyName: false,
  hashesOrExposesSecretValues: false,
});

/* ================================================================ §7 the post-matrix conditions */

/**
 * §7: THE NINE POST-MATRIX CAUSAL CONDITIONS.
 *
 * A complete schedule is not enough. Each condition is required mechanically, and any failure yields the
 * interrupted-matrix verdicts.
 */
export const POST_MATRIX_CONDITIONS = Object.freeze([
  Object.freeze({ id: 'ALL_SIXTEEN_UNIQUE_SESSIONS', detail: 'all sixteen unique scheduled sessions present, with no duplicate' }),
  Object.freeze({ id: 'EIGHT_LEGITIMATE_TRAJECTORIES', detail: 'exactly eight distinct scheduled trajectories' }),
  Object.freeze({ id: 'FOUR_COMPLETE_MATCHED_BLOCKS', detail: 'all four H/C matched blocks complete' }),
  Object.freeze({ id: 'EVERY_TREATMENT_APPLIED', detail: 'every required treatment realization is APPLIED, with no undefined' }),
  Object.freeze({ id: 'UPTAKE_TELEMETRY_INTERPRETABLE', detail: 'worker uptake telemetry is interpretable for every session' }),
  Object.freeze({ id: 'COST_TELEMETRY_INTERPRETABLE', detail: 'reconstruction-cost telemetry is interpretable for every session' }),
  Object.freeze({ id: 'SYSTEM_ENVIRONMENT_VALID', detail: 'system and environment validity still established' }),
  Object.freeze({ id: 'CLOSURE_AND_ROUTE_MATCH', detail: 'the execution closure and the effective route still match the plan' }),
  Object.freeze({ id: 'ANALYSIS_PLAN_UNCHANGED', detail: 'the analysis plan is unchanged and no session was replaced or retried' }),
]);

/** §7: what every failed post-matrix input yields. */
export const INTERRUPTED_MATRIX_VERDICTS = Object.freeze({
  CAUSAL_EXPERIMENT_VALID: 'NO',
  RECONSTRUCTION_COMPRESSION: 'NOT_EVALUABLE',
  NET_COGNITIVE_COST: 'NOT_EVALUABLE',
  partialObservationsPreservedForAudit: true,
  combinesInvalidOldRunWithNewMatrix: false,
});

/** §7: the frozen schedule shape. */
export const FROZEN_SCHEDULE_SHAPE = Object.freeze({ pairedBlocks: 4, arms: 2, generations: 2, sessions: 16, trajectories: 8, matchedComparisons: 4 });

/** §7: the law about hardcoded readiness. */
export const VERDICT_COMPUTATION_LAW = Object.freeze({
  hardcodedReadinessValue: false,
  computedFromActualGateResults: true,
  law: 'the final qualification verdict is computed from the actual gate results; no readiness value may be hardcoded',
});

/* ================================================================ §8 the timeout and authorization */

/** §8: the frozen timeout budgets, preserved from R3-L0C-I-A. */
export const WORKER_EXECUTION_BUDGET_MS = 1_800_000;
export const SETTLEMENT_INTERVAL_MS = 300_000;
export const OUTER_BUDGET_MARGIN_MS = 120_000;
export const GENERATION_CHILD_BUDGET_MS = WORKER_EXECUTION_BUDGET_MS + SETTLEMENT_INTERVAL_MS + OUTER_BUDGET_MARGIN_MS;

/** §8: the descendant-termination law, corrected so a result line is not exit. */
export const DESCENDANT_TERMINATION_LAW = Object.freeze({
  killIsNotProofOfExit: true,
  workerResultLineIsNotProofOfExit: true,
  onUnestablished: 'UNCERTAIN_PRESERVED',
  timedOutIsAlwaysUncertain: true,
  forbiddenRepair: 'no cleanup, replay or replacement of that exposure',
  law: 'a timed-out execution whose descendant status cannot be established is UNCERTAIN regardless of a previously emitted result line; a result line proves the worker reported, not that its process exited',
});

/**
 * §8: THE FIVE AUTHORIZATION DECISIONS PRIMARY EXECUTION REQUIRES.
 *
 * The paid matrix needs an explicit external decision for each. This stage grants none of them.
 */
export const AUTHORIZATION_REQUIREMENTS = Object.freeze([
  Object.freeze({ id: 'PAID_MODEL_USAGE', detail: 'paid model usage' }),
  Object.freeze({ id: 'BOUNDED_FAIL_STOP_PROTOCOL', detail: 'the bounded fail-stop protocol' }),
  Object.freeze({ id: 'NO_AUTOMATIC_RETRIES_OR_REPLACEMENTS', detail: 'no automatic retries or replacement sessions' }),
  Object.freeze({ id: 'PRESERVE_PARTIALLY_COMPLETED_INVALID_RUNS', detail: 'preservation of partially completed invalid runs' }),
  Object.freeze({ id: 'ACCEPTED_PROMPT_NEUTRALITY_LIMITED', detail: 'the accepted PROMPT_NEUTRALITY = LIMITED constraint' }),
]);

/** §8: the authorization law. */
export const PAID_AUTHORIZATION_LAW = Object.freeze({
  booleanIsAConfigurationSignal: true,
  booleanIsNotAVerifiedAuthorizationDecision: true,
  requiresExternalAuthorizationDecision: true,
  thisStageGrantsAuthorization: false,
  thisStageEntersPrimary: false,
  law: 'a caller-supplied paidAuthorization boolean is an execution configuration signal, not an independently verified authorization decision; PRIMARY requires an explicit external authorization for all five decisions',
});

/* ================================================================ §9 the commit structure and verdicts */

/** §9: the four logical commits, in order. */
export const COMMIT_STRUCTURE = Object.freeze([
  'test(r3-l0c-iar): freeze actual escaped-boundary falsifiers',
  'fix(r3-l0c-iar): repair the single authoritative activation and admission pipeline',
  'test(r3-l0c-iar): add production-path negative and positive controls',
  'research(r3-l0c-iar): append verdict corrections and freeze the superseding plan',
]);

/** §9: the commit law. */
export const COMMIT_LAW = Object.freeze({
  planCommittedAfterAllIntegrationChanges: true,
  planCommittedBeforeAnyPaidModelExposure: true,
  supersedesRatherThanAmendsPriorPlan: true,
  priorPlanModified: false,
  priorEvidenceAppendOnly: true,
  forcePush: false,
  amendHistoricalCommits: false,
  finalClosureComputedAfterFinalBuild: true,
});

/** §9: the final verdict vocabulary. */
export const FINAL_VERDICTS = Object.freeze({
  AUTHORITATIVE_PRIMARY_ENTRY: Object.freeze(['PASS', 'FAIL']),
  RUN_CLAIM_BEFORE_MUTATION: Object.freeze(['PASS', 'FAIL']),
  PRETRIAL_VALIDITY: Object.freeze(['PASS', 'FAIL']),
  MODEL_ROUTE_IDENTITY: Object.freeze(['MATCH', 'UNKNOWN', 'DRIFTED']),
  WORKER_RESULT_ADMISSION: Object.freeze(['PASS', 'FAIL']),
  UPTAKE_TELEMETRY_PROVENANCE: Object.freeze(['PASS', 'FAIL']),
  COST_ARTIFACT_ATTRIBUTION: Object.freeze(['PASS', 'FAIL']),
  POST_MATRIX_CAUSAL_ADMISSION: Object.freeze(['PASS', 'FAIL']),
  FAIL_STOP_UNCERTAINTY: Object.freeze(['PASS', 'FAIL']),
  EXECUTION_CLOSURE: Object.freeze(['MATCH', 'DRIFTED']),
  PAID_AUTHORIZATION: Object.freeze(['PENDING', 'GRANTED']),
  PAID_REPLICATION: Object.freeze(['READY_FOR_AUTHORIZATION', 'BLOCKED']),
});

/** §1: the eight published-interpretation classes this stage classifies separately. */
export const INTERPRETATION_CLASSES = Object.freeze([
  'ACTIVATION_COMPONENT_PROVEN',
  'ACTUAL_MATRIX_ENTRY_AUTHORIZATION',
  'DETERMINISTIC_CONFINEMENT_PROVEN',
  'TREATMENT_REALIZATION_PROVEN',
  'WORKER_UPTAKE_PROVENANCE_WITHIN_VALID_TELEMETRY',
  'PRE_POST_VALIDITY_EXECUTABLE',
  'RECONSTRUCTION_INSTRUMENTATION_WIRED',
  'PAID_EXECUTION_AUTHORIZED',
]);

/** §0/§9: the mandatory stop, carried as a value so the stage's own record states it. */
export const STAGE_STOP = Object.freeze({
  ranPaidMatrix: false,
  beganR3L1: false,
  beganFusion: false,
  modelCallsMade: 0,
  law: 'then STOP: no paid matrix, no R3-L1, no Fusion',
});

/** A one-line summary, for a report header. */
export function contractSummary() {
  return Object.freeze({
    stage: 'R3-L0C-I-A-R',
    kind: 'final activation wiring contract',
    baseline: BASELINE_COMMIT,
    correctionDefects: CORRECTION_DEFECTS.length,
    preTrialRequirements: PRE_TRIAL_REQUIREMENTS.length,
    postMatrixConditions: POST_MATRIX_CONDITIONS.length,
    admissionControls: ADMISSION_NEGATIVE_CONTROLS.length,
    authorizationDecisions: AUTHORIZATION_REQUIREMENTS.length,
    outerBudgetMs: GENERATION_CHILD_BUDGET_MS,
    innerBudgetMs: WORKER_EXECUTION_BUDGET_MS,
    modelCallsMade: STAGE_STOP.modelCallsMade,
    newline: NL,
  });
}

export { NL };
