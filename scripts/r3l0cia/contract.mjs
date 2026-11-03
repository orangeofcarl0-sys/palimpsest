/**
 * R3-L0C-I-A §0-§9 — THE PAID-ACTIVATION BOUNDARY CONTRACT.
 *
 * This module is the stage's FROZEN SEMANTICS, committed before any repair exists. It records, as values rather
 * than prose, the eight gaps the ruling names at the current primary activation boundary, the nine-step
 * activation order that replaces the defective one, the two execution modes, the three separated pull layers,
 * the timeout hierarchy, the validity requirements and the acceptance tests.
 *
 * WHY A CONTRACT FIRST, AGAIN. R3-L0C-F §16 established the rule this stage inherits: a contract is frozen by
 * COMMIT TIMING, not by being named `contract.mjs`. So this file is committed before the repairs, the falsifiers
 * are written against it and against the baseline, and only then is the implementation changed. A reader can
 * check the commit order and see the direction of the derivation.
 *
 * WHAT THIS STAGE IS NOT. It is the last bounded deterministic qualification before the paid replication. §0
 * forbids LLM calls and primary model sessions, and §5 forbids entering PRIMARY execution. Nothing here creates
 * product authority: the mode separation is a HARNESS concept, the pull layers are MEASUREMENTS, and the
 * activation order is a research-run sequence. `src/**` and `host/**` are untouched.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

const NL = String.fromCharCode(10);

/** §0: the exact baseline this stage starts from. */
export const BASELINE_COMMIT = 'b6c15e69da3541837a822d4751db50b34794a279';

/** §0: the stage branch. */
export const STAGE_BRANCH = 'r3-l0c-ia-paid-activation-closure';

/** §9: this stage's own code namespace. */
export const STAGE_CODE_PATH = 'scripts/r3l0cia';

/** §9: this stage's own evidence namespace. The ONLY place it may add under `research-evidence/`. */
export const STAGE_EVIDENCE_PATH = 'research-evidence/r3-l0c-ia';

/** §9: the prior stages' evidence, read but never written by this stage. */
export const PRIOR_EVIDENCE_PATHS = Object.freeze([
  'research-evidence/r3-l0c-f',
  'research-evidence/r3-l0c-i',
  'research-evidence/r3-l0c-r',
  'research-evidence/r3-l0c',
]);

/** §9: the stages whose evidence and contracts are frozen and must not be edited. */
export const FROZEN_STAGES = Object.freeze([
  'r3-l0c', 'r3-l0c-r', 'r3-l0c-f', 'r3-l0c-i', 'r3-wr', 'r3-wr2', 'r3-wr3', 'r3-wr4', 'r3-wr5', 'r3-l0a', 'r3-l0b',
]);

/** The checkout root, resolved from this module's own position. */
export const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');

/* ================================================================ §0/§1 the escaped defects */

/**
 * §1: THE EIGHT GAPS AT THE ACTIVATION BOUNDARY, EACH WITH ITS BASELINE LOCATION.
 *
 * Each is recorded with the FILE and LINE where the baseline behaviour lives, so a reader can verify the gap
 * rather than take the falsifier's word for it. The `property` field is what the repair must make true, and it is
 * what `falsifiers.mjs` measures against the extracted baseline.
 */
export const ESCAPED_DEFECTS = Object.freeze([
  Object.freeze({
    id: 'F1_REPLAY_BEFORE_CLAIM',
    gap: 'run-root claim occurs after World preparation',
    baselineLocation: 'scripts/r3l0cf/primary-matrix-driver.mjs:98 (preparePrimaryCase) before :157 (runFailStopMatrix claims)',
    property: 'a second invocation with the same runId must be REFUSED before any World, state store or profile byte changes',
    measuredBy: 'a pre/post digest of the trajectory World, its Git refs and its SQLite files across a replayed invocation',
  }),
  Object.freeze({
    id: 'F2_OWN_WORLD_PROTECTED',
    gap: "actual protected roots include the current trajectory's own World",
    baselineLocation: 'scripts/r3l0cf/primary-matrix-driver.mjs:112 calls runProtectedRoots(runRoot, trajectoryIds) with no currentTrajectoryId',
    property: "the current trajectory's World must NEVER appear in its own protected roots; every sibling's must",
    measuredBy: 'the exact protected-root manifest for each of the eight trajectory units',
  }),
  Object.freeze({
    id: 'F3_TREATMENT_MISMATCH_ESCAPED',
    gap: 'treatment mismatch is not computed from actual consumer evidence',
    baselineLocation: 'scripts/r3l0cf/primary-matrix.mjs:208 reads report?.treatmentMismatch, a field the generation child never writes',
    property: 'a consumer-visible handle set that differs from the frozen expectation in identity, kind or count is TREATMENT_REALIZATION = NOT_APPLIED and TRIAL_INVALID',
    measuredBy: 'a C/G2 session whose observed set is empty, short, or carries a wrong handle',
  }),
  Object.freeze({
    id: 'F4_HOST_AUDIT_AS_WORKER_UPTAKE',
    gap: 'host-side audit pulls are confused with Worker-initiated capital pulls',
    baselineLocation: 'scripts/r3l0cf/primary-matrix.mjs:189 reads governedPullCount from report.governedPulls, which the child fills from controller.fetchContext()',
    property: 'Worker uptake must come from the worker’s OWN telemetry; a host audit resolution must never be read as a voluntary pull',
    measuredBy: 'a C/G2 session with four visible handles, zero Worker pulls, and four host audit resolutions',
  }),
  Object.freeze({
    id: 'F5_NO_GENUINE_PAID_MODE',
    gap: 'the primary driver always selects SCRIPTED_WORKER',
    baselineLocation: 'scripts/r3l0cf/primary-matrix-driver.mjs:146 hardcodes realDshBin: SCRIPTED_WORKER',
    property: 'DETERMINISTIC and PRIMARY must be explicit, mutually exclusive modes with no silent fallback in either direction',
    measuredBy: 'the resolved worker executable and the mode’s declared external-call permission for each mode',
  }),
  Object.freeze({
    id: 'F6_DEFAULT_POST_MATRIX_GREEN',
    gap: 'post-matrix validity is not bound to the frozen plan',
    baselineLocation: 'scripts/r3l0cf/primary-matrix-driver.mjs:162 defaults validityGate to completed.length === schedule.length',
    property: 'sixteen structurally admitted sessions with no actual post-matrix validity proof must NOT return MATRIX_COMPLETE',
    measuredBy: 'a run whose gate checks only the count, against a plan-bound gate',
  }),
  Object.freeze({
    id: 'F7_CLOSURE_NOT_ENFORCED_AT_LAUNCH',
    gap: 'closure/plan is not enforced at launch',
    baselineLocation: 'scripts/r3l0cf/primary-matrix-driver.mjs:163 accepts closureDigest: input.closureDigest ?? null',
    property: 'an omitted, null or mismatched closure digest must REFUSE execution before the claim and before any launch',
    measuredBy: 'invocations with a null, absent and drifted closure digest',
  }),
  Object.freeze({
    id: 'F8_CONFLICTING_TIMEOUT_BUDGETS',
    gap: 'generation and Worker timeouts disagree',
    baselineLocation: 'scripts/r3l0cf/primary-matrix.mjs:136 outer timeoutMs 900_000 against scripts/r3l0c/generation-child.mjs:177 worker timeoutMs 1_800_000',
    property: 'the outer child budget must exceed the Worker execution budget plus the settlement interval, and an outer termination with unestablished descendant death is UNCERTAIN_PRESERVED',
    measuredBy: 'the declared budget triple, and a deliberately slow worker driven through the supervisor',
  }),
]);

/* ================================================================ §2 the activation order */

/**
 * §2: THE NINE STEPS, IN ORDER, AND THE ORDER IS THE CONTRACT.
 *
 * The baseline's defect is an ORDERING defect: the run root was claimed at step 9's boundary rather than before
 * step 6 mutated anything. So the order is carried as data with the mutation each step may cause, and the
 * activation module refuses to execute a step whose predecessors are unsatisfied.
 */
export const ACTIVATION_ORDER = Object.freeze([
  Object.freeze({ step: 1, id: 'VERIFY_COMMITTED_PLAN', mutates: false, requirement: 'the committed prospective plan is read and its identity, schedule and closure binding are verified' }),
  Object.freeze({ step: 2, id: 'VERIFY_RUNTIME_AND_CLOSURE', mutates: false, requirement: 'the current runtime and executable closure are recomputed and must MATCH the frozen binding' }),
  Object.freeze({ step: 3, id: 'CHECK_RUN_IDENTITY_AND_SCHEDULE', mutates: false, requirement: 'the run id and the expected schedule match the plan exactly' }),
  Object.freeze({ step: 4, id: 'ACQUIRE_EXCLUSIVE_RUN_ROOT', mutates: true, requirement: 'exclusive runRoot ownership is acquired with an exclusive create; the FIRST mutation of any kind' }),
  Object.freeze({ step: 5, id: 'PERSIST_PRESERVATION_MARKER', mutates: true, requirement: 'a PRESERVE marker and a preparation record are written before any world is copied' }),
  Object.freeze({ step: 6, id: 'PREPARE_WORLDS_STORES_PROFILES', mutates: true, requirement: 'World copies, state stores and DSH profiles are prepared' }),
  Object.freeze({ step: 7, id: 'PRE_EXPOSURE_CHECKS', mutates: false, requirement: 'the applicable pre-exposure checks are run' }),
  Object.freeze({ step: 8, id: 'PERSIST_SESSION_EXPOSURE_INTENT', mutates: true, requirement: 'the session exposure intent is durable before the launch' }),
  Object.freeze({ step: 9, id: 'LAUNCH_EXACTLY_ONCE', mutates: true, requirement: 'the worker is launched exactly once; no retry path exists below this step' }),
]);

/**
 * §2: THE RUN-ROOT STATES THAT ARE NOT `NEW`.
 *
 * §2 lists five conditions under which an existing run root must not be treated as new, and adds that a
 * MALFORMED claim must fail closed. Each is carried with the reason it is a refusal rather than a resume: the
 * run root already carries evidence, and continuing into it would mix two runs in one directory.
 */
export const RUN_ROOT_REFUSAL_CONDITIONS = Object.freeze([
  Object.freeze({ id: 'EXISTING_CLAIM', detail: 'a claim file exists, whether or not it is well formed' }),
  Object.freeze({ id: 'EXISTING_JOURNAL', detail: 'a generation journal exists' }),
  Object.freeze({ id: 'PRESERVE_MARKER', detail: 'a PRESERVE marker exists' }),
  Object.freeze({ id: 'INCOMPLETE_PREPARATION', detail: 'a preparation record exists without a completion marker' }),
  Object.freeze({ id: 'UNPROVABLE_OWNERSHIP', detail: 'primary trajectory Worlds or durable stores exist whose ownership cannot be proven' }),
  Object.freeze({ id: 'MALFORMED_CLAIM', detail: 'a claim exists but does not parse or does not carry the required identity fields' }),
]);

/** §2: the run-root verdict vocabulary. Only `NEW` may proceed to step 5. */
export const RUN_ROOT_VERDICTS = Object.freeze(['NEW', 'REFUSED_ALREADY_CLAIMED', 'REFUSED_REPLAY', 'REFUSED_MALFORMED_CLAIM', 'REFUSED_UNPROVABLE_OWNERSHIP', 'REFUSED_PARTIAL_PREPARATION']);

/**
 * §2: THE QUARANTINE HONESTY RULE.
 *
 * §2 requires that the historical four-retry matrix stay committed but not be an authorized launch entry, and it
 * forbids one specific overclaim. Carried as a value so a report cannot make the claim the ruling prohibits.
 */
export const QUARANTINE_HONESTY = Object.freeze({
  legacyMatrixRemainsPhysicallyExecutable: true,
  quarantineIsAGuardNotAnImpossibility: true,
  forbiddenClaim: 'do not claim the legacy matrix has become physically unexecutable merely because the new driver checks a string',
  enforcedBy: 'the activation entry refuses any caller that is not this stage’s plan, and the plan names the superseded path',
  legacyMatrixEdited: false,
});

/* ================================================================ §5 the execution modes */

/**
 * §5: THE TWO EXPLICIT EXECUTION MODES.
 *
 * The baseline had ONE mode and it was deterministic while being presented as the primary path, so "which worker
 * ran" was answered by reading the source. The repair makes the mode a REQUIRED, EXPLICIT input whose resolved
 * worker executable and external-call permission are recorded, and whose fallback in either direction is refused.
 */
export const EXECUTION_MODES = Object.freeze([
  Object.freeze({
    id: 'DETERMINISTIC',
    realGenerationChild: true,
    realPackagedWorkPath: true,
    realIpcProtocol: true,
    worker: 'ScriptedWorker',
    externalModelCallPermitted: false,
    paidAuthorizationRequired: false,
  }),
  Object.freeze({
    id: 'PRIMARY',
    realGenerationChild: true,
    realPackagedWorkPath: true,
    realIpcProtocol: true,
    worker: 'the shipped DSH WorkerPort on the frozen omnigate DeepSeek route',
    externalModelCallPermitted: true,
    paidAuthorizationRequired: true,
  }),
]);

/** §5: the mode law, as a value a test can assert. */
export const EXECUTION_MODE_LAW = Object.freeze({
  modeIsRequiredAndExplicit: true,
  silentFallbackInEitherDirection: false,
  callerSuppliedAuthorizedByIsNotProof: true,
  callerSuppliedAuthorizedByNote: 'a caller-supplied string is not itself proof of Project authority or paid-model authorization',
  thisStageEntersPrimary: false,
  primaryRequiresExplicitPaidAuthorization: true,
});

/* ================================================================ §4 the three pull layers */

/**
 * §4: THE THREE INDEPENDENT LAYERS.
 *
 * The baseline collapsed them into one number, which is the defect. They are separated because they answer
 * different questions and a single signal cannot stand for another:
 *
 *   HostResolveAudit              host-initiated `controller.fetchContext()` calls after worker execution.
 *                                 Establishes owner resolution and canonical body digests. NOT uptake evidence.
 *   WorkerPullObserved            actual worker-initiated pull requests and their status, measured through the
 *                                 governed IPC channel and the worker's own telemetry.
 *   WorkerHistoryAndCapitalActions the session artifact's actual tool dispatches, including capital pulls and
 *                                 the content they returned.
 */
export const PULL_LAYERS = Object.freeze([
  Object.freeze({
    id: 'HostResolveAudit',
    source: 'host-side controller.fetchContext() after worker execution',
    answers: 'did the host resolve the canonical owner body for each visible handle',
    isUptakeEvidence: false,
    forbiddenReading: 'do not use HostResolveAudit as evidence of voluntary Worker uptake',
  }),
  Object.freeze({
    id: 'WorkerPullObserved',
    source: "the worker's own PALIMPSEST_WORKER_PULL telemetry, parsed by the shipped parser",
    answers: 'did the worker voluntarily pull each visible handle, and with what status',
    isUptakeEvidence: true,
    forbiddenReading: 'do not infer a worker pull from a host audit operation',
  }),
  Object.freeze({
    id: 'WorkerHistoryAndCapitalActions',
    source: 'the session artifact’s tool dispatches',
    answers: 'what the worker actually dispatched, including capital pulls and the returned content',
    isUptakeEvidence: true,
    forbiddenReading: 'do not attribute a derived index pull to voluntary worker action',
  }),
]);

/**
 * §4: THE WORKER PULL TELEMETRY SCHEMA.
 *
 * The shipped runner emits `PALIMPSEST_WORKER_PULL {"pulled":[...]}`. The R3-L0C-I ScriptedWorker emitted
 * `{"handles":[...]}`, which the shipped parser would read as ZERO pulls — a mock that silently reports
 * non-uptake for every session. The field name is carried here, and the parser is the SHIPPED one.
 */
export const WORKER_PULL_TELEMETRY = Object.freeze({
  prefix: 'PALIMPSEST_WORKER_PULL ',
  field: 'pulled',
  /** The shape the R3-L0C-I mock emitted, named so the divergence is auditable rather than forgotten. */
  supersededShape: 'handles',
  supersededShapeReadAsZeroPulls: true,
  parserSource: 'dist/src/deployment/work_worker.js parseWorkerPullLine',
  useShippedParser: true,
});

/**
 * §4: THE TREATMENT-REALIZATION NEGATIVE CONTROLS, as data.
 *
 * Each names the observation and the required verdict, so the gate cannot be satisfied by a count match alone.
 */
export const TREATMENT_NEGATIVE_CONTROLS = Object.freeze([
  Object.freeze({
    id: 'VISIBLE_FOUR_PULLED_ZERO_HOST_RESOLVED_FOUR',
    arm: 'C',
    generation: 'G2',
    expectedVisible: 4,
    workerPulls: 0,
    hostResolves: 4,
    requiredRealization: 'APPLIED',
    requiredUptake: 'ZERO',
    requiredDeclinedObservation: 'MODEL_DECLINED_VISIBLE_CAPITAL',
    matrixMustNotStopForTheDeclinedPull: true,
  }),
  Object.freeze({
    id: 'VISIBLE_TWO_OR_WRONG_KIND',
    arm: 'C',
    generation: 'G2',
    expectedVisible: 4,
    observedVisible: 2,
    requiredRealization: 'NOT_APPLIED',
    requiredDisposition: 'TRIAL_INVALID',
    requiredMatrixResponse: 'STOP_MATRIX',
    retryPermitted: false,
  }),
]);

/* ================================================================ §5 the timeout hierarchy */

/**
 * §5: THE TIMEOUT BUDGETS.
 *
 * The baseline's outer budget (900s) was HALF the inner worker budget (1800s), so the outer process could
 * terminate a worker whose own port timeout had not yet expired — and the resulting state was classified as if
 * the worker had failed rather than as an unresolved exposure.
 *
 * The inner budget is CITED from the shipped child rather than restated from memory, and the outer is derived
 * from it so the two cannot drift independently.
 */
export const WORKER_EXECUTION_BUDGET_MS = 1_800_000;

/** §5: the settlement interval the outer budget must additionally cover. */
export const SETTLEMENT_INTERVAL_MS = 300_000;

/** §5: a margin, so the outer budget is strictly greater than the sum rather than equal to it. */
export const OUTER_BUDGET_MARGIN_MS = 120_000;

/** §5: the derived outer child budget. */
export const GENERATION_CHILD_BUDGET_MS = WORKER_EXECUTION_BUDGET_MS + SETTLEMENT_INTERVAL_MS + OUTER_BUDGET_MARGIN_MS;

/** §5: the baseline's conflicting pair, recorded so the defect is auditable. */
export const BASELINE_TIMEOUT_BUDGETS = Object.freeze({ outerChildMs: 900_000, innerWorkerMs: 1_800_000, conflict: 'the outer budget expires before the inner one, so a slow worker is killed by its own harness' });

/** §5: the termination classifications. */
export const OUTER_TERMINATION_VERDICTS = Object.freeze([
  Object.freeze({ id: 'COMPLETED_WITH_REPORT', descendantDeathEstablished: true, disposition: 'ADMITTED_OR_CLASSIFIED_NORMALLY' }),
  Object.freeze({ id: 'UNCERTAIN_PRESERVED', descendantDeathEstablished: false, disposition: 'STOP_MATRIX_PRESERVE' }),
]);

/** §5: the rule about what `kill()` proves. */
export const DESCENDANT_TERMINATION_LAW = Object.freeze({
  killIsNotProofOfExit: true,
  onUnestablished: 'UNCERTAIN_PRESERVED',
  forbiddenRepair: 'no cleanup, replay or replacement of that exposure',
  law: 'an outer process termination whose descendant Worker termination cannot be established is UNCERTAIN_PRESERVED',
});

/* ================================================================ §6 the validity requirements */

/**
 * §6: THE PRE-TRIAL REQUIREMENTS.
 *
 * §6 requires these to be YES before trial 1, and it forbids the four shortcuts the baseline used: a null closure
 * digest, a caller-invented route identity, an omitted treatment expectation, and a default green gate.
 */
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

/** §6: the forbidden pre-trial shortcuts. */
export const FORBIDDEN_PRE_TRIAL_SHORTCUTS = Object.freeze([
  'closureDigest = null',
  'a caller-invented route identity',
  'an omitted treatment expectation',
  'a default green validityGate',
  'a post-matrix gate that checks only completed.length === 16',
]);

/** §6: the frozen schedule shape. */
export const FROZEN_SCHEDULE_SHAPE = Object.freeze({ pairedBlocks: 4, arms: 2, generations: 2, sessions: 16, matchedComparisons: 4 });

/**
 * §6: THE PER-GENERATION INSTRUMENTATION FIELDS.
 *
 * §6 requires these extracted from the session artifact and durably recorded, each bound to exactly ONE
 * scheduled session. Missing or ambiguous attribution is REJECTED rather than resolved by taking the latest
 * artifact, which is the convenience path the ruling forbids.
 */
export const RECONSTRUCTION_COST_FIELDS = Object.freeze([
  'sessionArtifactIdentity',
  'attemptId',
  'hostJobId',
  'rawHistoryArtifactsRead',
  'rawHistoryBytesReturned',
  'historyReadActions',
  'capitalPullActions',
  'capitalReturnedBodyObservations',
  'actionsBeforeFirstResult',
  'elapsedToFirstResultMs',
  'completionCause',
  'hiddenQualityVector',
  'treatmentWitness',
  'uptakeWitness',
]);

/** §6: the artifact-attribution law. */
export const ARTIFACT_ATTRIBUTION_LAW = Object.freeze({
  oneArtifactPerScheduledSession: true,
  rejectAmbiguousAttribution: true,
  selectLatestByConvenience: false,
  fixtureInstrumentationSeparatelyLabeled: true,
  law: 'reject missing or ambiguous session-to-artifact attribution rather than selecting the latest artifact by convenience',
});

/** §6: what an interrupted or incomplete matrix produces. */
export const INTERRUPTED_MATRIX_VERDICTS = Object.freeze({
  CAUSAL_EXPERIMENT_VALID: 'NO',
  RECONSTRUCTION_COMPRESSION: 'NOT_EVALUABLE',
  NET_COGNITIVE_COST: 'NOT_EVALUABLE',
  partialObservationsPreservedForAudit: true,
  combinesInvalidOldRun1WithNewMatrix: false,
});

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

/* ================================================================ §8 the acceptance tests */

/** §8: the sixteen zero-model acceptance tests, as data so the record and the tests agree on the set. */
export const ACCEPTANCE_TESTS = Object.freeze([
  'A01_REPLAY_REFUSAL_BEFORE_ANY_MUTATION',
  'A02_SAME_RUN_ID_CONCURRENT_CLAIM_CONFLICT',
  'A03_CLAIMED_CORRUPT_PARTIAL_ROOT_REFUSAL',
  'A04_EIGHT_PER_TRAJECTORY_CONFINEMENT_AND_LIVENESS',
  'A05_C_WRONG_HANDLE_KIND_SHORT_COUNT_MUTATIONS',
  'A06_C_VISIBLE_FOUR_PULLED_ZERO_HOST_RESOLVED_FOUR',
  'A07_WORKER_PULL_TELEMETRY_SCHEMA_PARITY',
  'A08_MISSING_OR_INVALID_WORKER_RESULT_REFUSAL',
  'A09_CHILD_REPORT_ERROR_WITH_HOST_FINISHED_REFUSAL',
  'A10_REAL_VERSUS_SCRIPTED_MODE_SELECTION',
  'A11_TIMEOUT_UNKNOWN_DESCENDANT_SURVIVAL',
  'A12_MISSING_OR_STALE_CLOSURE_REFUSAL',
  'A13_MISSING_OR_FALSE_POST_MATRIX_VALIDITY_GATE_REFUSAL',
  'A14_RECONSTRUCTION_COST_PARSER_AGAINST_PRESERVED_ARTIFACTS',
  'A15_HEALTHY_SIXTEEN_SESSION_SCRIPTED_RUN',
  'A16_FIRST_MIDDLE_LAST_FAILURE_NO_LATER_LAUNCH',
]);

/** §8: the control law, carried so a "declared test" is never mistaken for a measurement. */
export const ACCEPTANCE_LAW = Object.freeze({
  eachHardGateNeedsAPositiveControlAndAMutantThatFailsThePreRepairImplementation: true,
  testDeclarationsAreNotASubstituteForMeasuringTheActualBoundary: true,
  law: 'test declarations are not a substitute for measuring the actual executed boundary',
});

/* ================================================================ §9 the commit structure */

/** §9: the five logical commits, in order. */
export const COMMIT_STRUCTURE = Object.freeze([
  'analysis(r3-l0c-ia): freeze activation contract and escaped defects',
  'test(r3-l0c-ia): preserve production-path falsifiers',
  'fix(r3-l0c-ia): close activation identity, fencing and treatment measurement',
  'test(r3-l0c-ia): prove actual path, validity and analysis gates',
  'research(r3-l0c-ia): freeze corrected prospective execution plan',
]);

/** §9: the commit law. */
export const COMMIT_LAW = Object.freeze({
  planCommittedAfterAllIntegrationChanges: true,
  planCommittedBeforeAnyPaidModelExposure: true,
  supersedesRatherThanAmendsPriorPlan: true,
  forcePush: false,
  amendHistoricalCommits: false,
  editFrozenHistoricalPlans: false,
  preservePriorEvidenceImmutably: true,
  finalClosureComputedAfterFinalBuild: true,
});

/* ================================================================ §10 the verdicts */

/** §10: the final verdict vocabulary. */
export const FINAL_VERDICTS = Object.freeze({
  RUN_ROOT_ACTIVATION: Object.freeze(['PASS', 'FAIL']),
  REPLAY_BEFORE_MUTATION: Object.freeze(['PASS', 'FAIL']),
  ACTUAL_CONTAINMENT: Object.freeze(['PASS', 'FAIL']),
  TREATMENT_REALIZATION: Object.freeze(['PASS', 'FAIL']),
  WORKER_UPTAKE_PROVENANCE: Object.freeze(['PASS', 'FAIL']),
  PRIMARY_MODE_CONFIGURED: Object.freeze(['PASS', 'FAIL']),
  MODEL_EXECUTION_IN_THIS_STAGE: Object.freeze(['ZERO', 'VIOLATION']),
  OUTCOME_ADMISSION: Object.freeze(['PASS', 'FAIL']),
  TIMEOUT_UNCERTAINTY: Object.freeze(['PASS', 'FAIL']),
  RECONSTRUCTION_INSTRUMENTATION: Object.freeze(['PASS', 'FAIL']),
  POST_MATRIX_VALIDITY: Object.freeze(['PASS', 'FAIL']),
  EXECUTION_CLOSURE: Object.freeze(['MATCH', 'DRIFTED']),
  CAPITAL_SEMANTIC_SUFFICIENCY: Object.freeze(['PASS', 'LIMITED', 'FAIL']),
  PROMPT_NEUTRALITY: Object.freeze(['LIMITED', 'FAIL']),
  FAIL_STOP_POLICY: Object.freeze(['PROPOSED', 'EXPLICITLY_AUTHORIZED']),
  PAID_REPLICATION: Object.freeze(['READY_FOR_AUTHORIZATION', 'BLOCKED']),
});

/** §10: the mandatory stop, carried as a value so the stage's own record states it. */
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
    stage: 'R3-L0C-I-A',
    kind: 'paid activation boundary closure contract',
    baseline: BASELINE_COMMIT,
    escapedDefects: ESCAPED_DEFECTS.length,
    activationSteps: ACTIVATION_ORDER.length,
    executionModes: EXECUTION_MODES.map((entry) => entry.id),
    pullLayers: PULL_LAYERS.map((entry) => entry.id),
    outerBudgetMs: GENERATION_CHILD_BUDGET_MS,
    innerBudgetMs: WORKER_EXECUTION_BUDGET_MS,
    acceptanceTests: ACCEPTANCE_TESTS.length,
    modelCallsMade: STAGE_STOP.modelCallsMade,
    newline: NL,
  });
}

export { NL };
