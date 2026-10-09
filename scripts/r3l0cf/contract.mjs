/**
 * R3-L0C-F §2-§15 — THE FAIL-STOP AND SUBSTITUTABILITY CONTRACT.
 *
 * This module is the stage's FROZEN SEMANTICS. It records, as values rather than prose, the five things the
 * ruling asks to be decided before any implementation exists:
 *
 *   §2   the protocol deviation (the old retry rule is replaced by strict fail-stop)
 *   §4/§5 the fail-stop state machine and the whole-matrix stop classifications
 *   §6   the per-generation journal schema
 *   §9   the FIVE separated closure parts, so a changed shipped runtime is visible even when every historical
 *        `.mjs` file is byte-identical
 *   §12  the reconstruction-substitutability records, including the README history-reading adjudication
 *
 * WHY A CONTRACT MODULE RATHER THAN CONSTANTS INLINE IN THE RUNNER. §16 says plainly: "Do not call a contract
 * frozen merely because a file is named `contract.mjs`; verify its commit timing." So this file is committed
 * FIRST, before any runner exists, and the runner imports its values. A reader can check the commit order and
 * see that the runner was written against an already-frozen contract rather than the contract being back-filled
 * from the runner.
 *
 * IT ADDS NO CANONICAL AUTHORITY. Nothing here creates a Work owner, an Attempt state, a terminal command or an
 * operator capability. §15 is explicit that fail-stop means the RESEARCH RUN stops and refuses to make a causal
 * claim; the Canonical Attempt may remain RUNNING in the preserved Project. Every value below is a research-stage
 * concept, owned by this stage, imported by nothing in `src/**` or `host/**`.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

const NL = String.fromCharCode(10);

/** The checkout root, resolved from this module's own position. */
export const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');

/** §0: the exact baseline this stage starts from. */
export const BASELINE_COMMIT = '19f0c69833f33c51ada8642379980c490cb75d04';

/** §0: the stage branch. */
export const STAGE_BRANCH = 'r3-l0c-f-fail-stop-qualification';

/** §0: this stage's own evidence namespace. The ONLY place it may add under `research-evidence/`. */
export const STAGE_EVIDENCE_PATH = 'research-evidence/r3-l0c-f';

/** §1: the stages whose evidence and contracts are frozen and must not be edited. */
export const FROZEN_STAGES = Object.freeze([
  'r3-l0c', 'r3-l0c-r', 'r3-wr', 'r3-wr2', 'r3-wr3', 'r3-wr4', 'r3-wr5', 'r3-l0a', 'r3-l0b',
]);

/* ================================================================ §2 the protocol deviation */

/**
 * §2: THE PROTOCOL DEVIATION, RECORDED AS DATA.
 *
 * The original R3-L0C retry rule allowed up to four attempts for a session the harness judged
 * infrastructure-invalid. That rule is INCOMPATIBLE with strict fail-stop after possible behavioral exposure: a
 * retry re-launches a worker that may already have been exposed to the model, so a second launch is a second
 * observation of a session the protocol promised to observe once.
 *
 * THE DEVIATION IS PROSPECTIVE AND NARROW. §2 lists what remains unchanged, and the list is carried here so a
 * report cannot quietly widen the deviation. What changes is ONE thing: after possible exposure there is no
 * retry. The research question, the treatment, the experimental unit, the history and capital assets, the
 * oracle, the cost and quality measures, the four matched blocks, the two generations, the H/C arm ordering and
 * the verdict thresholds are all unchanged.
 *
 * §2 ALSO FORBIDS A SPECIFIC OVERCLAIM: "Do not claim the complete experimental execution design is
 * byte-identical to R3-L0C." So the deviation carries `executionDesignIdentical: false` as a value.
 */
export const PROTOCOL_DEVIATION = Object.freeze({
  schemaVersion: 1,
  kind: 'R3-L0C-F prospective protocol revision',
  OLD_PROTOCOL: 'INFRASTRUCTURE_RETRY_UP_TO_4',
  NEW_PROTOCOL: 'NO_RETRY_AFTER_POSSIBLE_EXPOSURE',
  oldRule: 'a session the harness judged infrastructure-invalid was re-launched, up to four attempts, until a report was produced or the attempts were exhausted',
  newRule: 'a session is launched AT MOST ONCE; a failure after the exposure-intent was durably recorded stops the whole matrix and is never re-launched',
  prospective: true,
  /** §2: the overclaim this value exists to prevent. */
  executionDesignIdentical: false,
  executionDesignNote: 'the behavioral design is preserved, but the EXECUTION design is deliberately revised: retry-after-infrastructure-invalidity is removed',
  /** §2: what does NOT change, carried so the deviation cannot widen silently. */
  unchanged: Object.freeze([
    'research question',
    'treatment (SELECTION_ONLY)',
    'experimental unit (ProjectTrajectory)',
    'history corpus and capital assets',
    'hidden diagnostic oracle',
    'quality and reconstruction-cost measures',
    'four matched blocks',
    'two generations per trajectory',
    'H/C arm ordering and randomization seed',
    'positive/adverse verdict thresholds',
  ]),
  /** §2: the deviation is implemented in NEW, stage-owned modules; no frozen contract is edited. */
  implementedIn: 'new stage-owned modules under scripts/r3l0cf/',
  frozenContractsEdited: false,
});

/* ================================================================ §4 the fail-stop state machine */

/**
 * §4: THE RESEARCH-ONLY FAIL-STOP EXECUTION STATE.
 *
 * §4 is careful about what this is NOT: it is "a stage-owned experimental execution state, not a new Canonical
 * Work owner". The Canonical Work/Attempt lifecycle in `src/**` is untouched; this is a research harness state
 * that records what the EXPERIMENT did. The two are kept distinct by construction — nothing here is written to
 * any product store, and nothing here can terminalize a Canonical Attempt.
 */
export const FAIL_STOP_STATES = Object.freeze([
  Object.freeze({ id: 'PLANNED', meaning: 'the schedule is known and no session has been exposed' }),
  Object.freeze({ id: 'PREFLIGHT_PASSED', meaning: 'the zero-model preflight and the boundary witnesses are green' }),
  Object.freeze({ id: 'EXPOSURE_RECORDED', meaning: 'an exposure-intent event is durably recorded and no worker has launched for this session yet' }),
  Object.freeze({ id: 'WORKER_LAUNCHED', meaning: 'the session worker was launched exactly once' }),
  Object.freeze({ id: 'TRIAL_RECORDED', meaning: 'the session produced a durable trial record' }),
  Object.freeze({ id: 'ABORT_PRESERVED', meaning: 'a load-bearing failure stopped the matrix; all evidence is preserved and no causal verdict is issued' }),
  Object.freeze({ id: 'UNCERTAIN_PRESERVED', meaning: 'a failure left it UNKNOWN whether a model call occurred; the run is preserved and must not be resumed or replaced automatically' }),
  Object.freeze({ id: 'MATRIX_COMPLETE', meaning: 'all scheduled sessions were recorded AND the post-matrix validity gate is green' }),
]);

/** §4: the legal transitions. A transition not listed here is refused rather than allowed by default. */
export const FAIL_STOP_TRANSITIONS = Object.freeze({
  PLANNED: Object.freeze(['PREFLIGHT_PASSED', 'ABORT_PRESERVED']),
  PREFLIGHT_PASSED: Object.freeze(['EXPOSURE_RECORDED', 'ABORT_PRESERVED']),
  /** The exposure-intent must be durable BEFORE the launch, so the only forward edge is to the launch. */
  EXPOSURE_RECORDED: Object.freeze(['WORKER_LAUNCHED', 'ABORT_PRESERVED']),
  WORKER_LAUNCHED: Object.freeze(['TRIAL_RECORDED', 'ABORT_PRESERVED', 'UNCERTAIN_PRESERVED']),
  TRIAL_RECORDED: Object.freeze(['EXPOSURE_RECORDED', 'MATRIX_COMPLETE', 'ABORT_PRESERVED']),
  ABORT_PRESERVED: Object.freeze([]),
  UNCERTAIN_PRESERVED: Object.freeze([]),
  MATRIX_COMPLETE: Object.freeze([]),
});

/** §4: the two states from which nothing further may be executed. */
export const TERMINAL_PRESERVED_STATES = Object.freeze(['ABORT_PRESERVED', 'UNCERTAIN_PRESERVED']);

/**
 * §4: THE PER-SESSION LAUNCH LAW.
 *
 * The two constants are the whole of fail-stop, stated as numbers a test can assert rather than a paragraph a
 * reader must trust.
 */
export const LAUNCH_LAW = Object.freeze({
  MAX_WORKER_LAUNCHES: 1,
  POST_EXPOSURE_RETRIES: 0,
  law: 'for every primary session, at most one worker launch occurs; after the exposure-intent is durable there are zero retries',
  /** §4: a restarted runner must refuse to resume or replace an uncertain run automatically. */
  resumeUncertainAutomatically: false,
  /** §4: there is no adaptive stopping on favorable or unfavorable model outcomes. */
  adaptiveStoppingOnOutcome: false,
  adaptiveStoppingNote: 'stopping is decided by load-bearing failures, never by whether a model outcome looks good or bad',
});

/**
 * §4: THE EXPOSURE-INTENT EVENT.
 *
 * §4 requires it "before the first possible model invocation", durably. The event is written to the journal
 * BEFORE the worker seam is called, so a crash between the two leaves a record that a launch MAY have happened —
 * which is what makes the uncertain case nameable rather than invisible.
 */
export const EXPOSURE_INTENT = Object.freeze({
  eventType: 'EXPOSURE_INTENT_RECORDED',
  writtenBefore: 'the worker seam is invoked',
  durability: 'fsync + atomic rename, so a torn write is detectable rather than silently complete',
  /** §4: what an uncertain outcome means, stated so no reader infers the convenient direction. */
  onUncertainty: 'do NOT infer that no model call occurred; preserve the run and refuse automatic resume or replacement',
});

/* ================================================================ §5 the stop classifications */

/**
 * §5: THE LOAD-BEARING FAILURE CLASSIFICATIONS.
 *
 * §5 splits failures into two kinds and is emphatic that they must not be confused in EITHER direction:
 *
 *   infrastructure/protocol  -> STOP_MATRIX, preserve, no retry, no replacement, no causal verdict
 *   observable behavioral    -> record the ACTUAL outcome; never silently reclassify it as infrastructure to
 *                               justify a retry; if Work cannot legally progress, stop the whole matrix and
 *                               report the censored trajectory without replacing it
 *
 * The examples are the ruling's own, carried as data so the classifier can be checked against them.
 */
export const FAILURE_CLASSES = Object.freeze({
  INFRASTRUCTURE: Object.freeze({
    id: 'INFRASTRUCTURE_OR_PROTOCOL',
    examples: Object.freeze([
      'missing or malformed worker report',
      'Host failure',
      'Git object-resolution failure',
      'unavailable worker World',
      'worker cannot commit because of environmental failure',
      'consumer-visible treatment mismatch',
      'containment failure',
      'execution closure mismatch',
      'provider/route failure after invocation',
      'unexpectedly unresolved Attempt blocking the next generation',
    ]),
    response: Object.freeze(['STOP_MATRIX', 'PRESERVE_ALL_EVIDENCE', 'NO_SESSION_RETRY', 'NO_REPLACEMENT_TRAJECTORY', 'NO_CAUSAL_TREATMENT_VERDICT']),
    terminalState: 'ABORT_PRESERVED',
  }),
  BEHAVIORAL: Object.freeze({
    id: 'OBSERVABLE_BEHAVIORAL',
    examples: Object.freeze([
      'incorrect implementation despite a successful Result',
      'low hidden invariant coverage',
      'model declines to pull capital that was actually made visible',
      'completed work fails correctness checks',
      'model reaches its allowed budget without producing a usable result',
    ]),
    response: Object.freeze(['RECORD_ACTUAL_OUTCOME', 'NO_SILENT_RECLASSIFICATION_AS_INFRASTRUCTURE', 'NO_RETRY']),
    /** §5: if Work cannot legally progress, the whole matrix stops and the trajectory is censored, not replaced. */
    ifWorkCannotProgress: 'stop the entire matrix and report the censored trajectory without replacing it',
    forbiddenRepair: 'do not repair the trajectory by forcing Result/Verification/Promotion',
    terminalState: 'ABORT_PRESERVED',
  }),
});

/** §5: the law that keeps a behavioral failure from being laundered into an infrastructure one. */
export const CLASSIFICATION_LAW = Object.freeze({
  law: 'a behavioral failure must never be silently reclassified as infrastructure failure to justify a retry',
  retryOnBehavioral: false,
  retryOnInfrastructure: false,
  matrixStopIsWholeMatrix: true,
  matrixStopNote: 'a load-bearing failure stops the ENTIRE active 16-session matrix, not only the current generation',
});

/* ================================================================ §6 the per-generation journal */

/**
 * §6: THE PER-GENERATION JOURNAL RECORD.
 *
 * §6 replaces trajectory-level-only recording with durable PER-GENERATION evidence, and lists the fields. The
 * list is carried as data so a record can be checked against it rather than against a reader's memory.
 */
export const JOURNAL_FIELDS = Object.freeze([
  'sessionId',
  'block',
  'arm',
  'generation',
  'trajectoryId',
  'executionClosureDigest',
  'treatmentExpectationDigest',
  'intendedExecutorRoute',
  'exposureState',
  'hostJobId',
  'attemptId',
  'consumerVisibleHandles',
  'governedPulls',
  'resolvedBodyDigests',
  'startingHead',
  'finalHead',
  'resultState',
  'verificationState',
  'promotionState',
  'completionCause',
  'infrastructureFailureCause',
  'reportPath',
  'transcriptPath',
  'timestamps',
  'contentDigests',
]);

/**
 * §6: THE DURABILITY PROTOCOL.
 *
 * §6 requires append-only entries or an equivalent durable protocol with atomic writes, and requires an
 * interrupted write to be DETECTABLE rather than silently treated as a complete session. The journal is JSONL
 * with a per-record commit marker, so a torn tail is visible as a record without its marker.
 */
export const JOURNAL_PROTOCOL = Object.freeze({
  format: 'JSONL, one record per line, append-only',
  atomicWrite: 'each record is written to a temporary file, fsynced, and renamed into place; the record is only visible when complete',
  interruptedWriteDetection: 'a trailing record without its commit marker is reported as INTERRUPTED, never as a complete session',
  rewriteAfterFinalization: false,
  law: 'primary records must not be rewritten after finalization',
  abortManifestRequired: true,
  abortManifestNote: 'at every normal stop, emit a stage-owned abort manifest identifying all completed, incomplete and uncertain sessions',
});

/** §6: the journal record kinds. */
export const JOURNAL_EVENT_TYPES = Object.freeze([
  'RUN_STARTED',
  'PREFLIGHT_RECORDED',
  'EXPOSURE_INTENT_RECORDED',
  'WORKER_LAUNCH_RECORDED',
  'TRIAL_RECORDED',
  'SESSION_FAILED',
  'SESSION_UNCERTAIN',
  'MATRIX_ABORTED',
  'MATRIX_UNCERTAIN',
  'VALIDITY_GATE_RECORDED',
  'MATRIX_COMPLETED',
]);

/* ================================================================ §9 the executable closure */

/**
 * §9: THE FIVE SEPARATED CLOSURE PARTS.
 *
 * §9's central requirement is that a changed SHIPPED RUNTIME must move the closure digest EVEN WHEN every
 * historical R3-L0C `.mjs` file is untouched — which the old `ExecutionClosureDigest` could not do, because it
 * covered only harness `.mjs` files. The fix is to cover the actual load-bearing executable inputs and to
 * SEPARATE them into five parts so a drift names which layer moved.
 */
export const CLOSURE_PARTS = Object.freeze([
  Object.freeze({
    id: 'SOURCE_CLOSURE',
    covers: 'the audited TypeScript/host sources that implement the shipped runtime',
    why: 'the source is the authority the compiled artifacts are supposed to correspond to',
  }),
  Object.freeze({
    id: 'COMPILED_RUNTIME_CLOSURE',
    covers: 'the compiled `dist/**` artifacts the harness actually imports, plus the host runtime `.js`',
    why: 'the harness imports `dist/**`, so the compiled bytes are load-bearing even when the source is unchanged',
  }),
  Object.freeze({
    id: 'EXECUTOR_CONFIGURATION',
    covers: 'the executor route, the settings document, the composition patch and the effective model selection',
    why: 'the route decides which model family the sessions ran on, so it is an experimental input',
  }),
  Object.freeze({
    id: 'MODEL_IDENTITY_EVIDENCE',
    covers: 'the recorded model/provider identity and the availability evidence, with NO secret value',
    why: 'the identity is an experimental input, but a credential is not evidence and must never be hashed or revealed',
  }),
  Object.freeze({
    id: 'EXPERIMENT_PLAN_DIGEST',
    covers: 'the frozen schedule, the arm order, the seed, the expectations and the verdict rules',
    why: 'the plan is the experiment; a changed plan is a different experiment',
  }),
]);

/**
 * §9: THE LOAD-BEARING EXECUTABLE INPUT CATEGORIES, mapped to the FILES that carry them.
 *
 * §9 names the categories. Each is mapped to real files so a category cannot be silently dropped, and so a drift
 * names the category. The mapping is deliberately explicit rather than derived from a directory walk, because a
 * directory walk would silently absorb a NEW file into an existing category and hide the change.
 */
export const CLOSURE_FILES = Object.freeze({
  SOURCE_CLOSURE: Object.freeze([
    'src/effects/git_port.ts',
    'src/effects/runtime.ts',
    'src/tools/controller.ts',
    'src/deployment/work_worker.ts',
    'src/domain/state_machine.ts',
    'src/scheduler/scheduler.ts',
    'src/state/attempt_authorization.ts',
    'src/interaction/work_delegation.ts',
    'src/project_world/basis_store.ts',
    'host/deployment/runtime/read_fence.js',
    'host/deployment/runtime/worker_fence.js',
    'host/dsh/lib/runner.js',
  ]),
  COMPILED_RUNTIME_CLOSURE: Object.freeze([
    'dist/src/effects/git_port.js',
    'dist/src/effects/runtime.js',
    'dist/src/tools/controller.js',
    'dist/src/deployment/work_worker.js',
    'dist/src/domain/state_machine.js',
    'dist/src/scheduler/scheduler.js',
    'dist/src/state/attempt_authorization.js',
    'dist/src/interaction/work_delegation.js',
    'dist/src/project_world/basis_store.js',
  ]),
  EXECUTOR_CONFIGURATION: Object.freeze([
    'scripts/r3l0cr/route.mjs',
    'scripts/r3l0cr/settings.mjs',
    'scripts/r3l0c/trajectory.mjs',
    'scripts/r3l0cf/contract.mjs',
    'scripts/r3l0cf/fail-stop.mjs',
  ]),
  MODEL_IDENTITY_EVIDENCE: Object.freeze([
    'scripts/r3l0c/plan.mjs',
    'scripts/r3l0c/contract.mjs',
  ]),
  EXPERIMENT_PLAN_DIGEST: Object.freeze([
    'scripts/r3l0c/plan.mjs',
    'scripts/r3l0c/capital.mjs',
    'scripts/r3l0c/diagnostic.mjs',
    'scripts/r3l0c/corpus.mjs',
    'scripts/r3l0c/project.mjs',
    'scripts/r3l0c/prehistory.mjs',
    'scripts/r3l0c/analyse.mjs',
    'scripts/r3l0cr/selection.mjs',
    'scripts/r3l0cr/topology.mjs',
    'scripts/r3l0cr/contract.mjs',
    'scripts/r3l0c/generation-child.mjs',
    'scripts/r3l0c/build-prehistory.mjs',
  ]),
});

/**
 * §9: THE SELF-REFERENCE RULE.
 *
 * §9 requires the closure to "exclude its own plan/result file to avoid self-referential hashing". The excluded
 * paths are stage-owned artifacts, named so a reader can see exactly what is not hashed.
 */
export const CLOSURE_SELF_EXCLUSIONS = Object.freeze([
  `${STAGE_EVIDENCE_PATH}/plan.json`,
  `${STAGE_EVIDENCE_PATH}/stage-result.json`,
  `${STAGE_EVIDENCE_PATH}/closure.json`,
  `${STAGE_EVIDENCE_PATH}/qualification.json`,
]);

/** §9: the closure law, as a value a test can assert. */
export const CLOSURE_LAW = Object.freeze({
  law: 'a changed shipped runtime must change the closure digest even when every historical R3-L0C `.mjs` file is byte-identical',
  coversCodeNotResults: true,
  selfReferentialHashingExcluded: true,
  mutationRequired: 'a mutation using a temporary copy of a load-bearing production input must prove the property',
  /** §9: the closure is built BEFORE it is frozen, and the compiled artifacts are verified against the source. */
  builtBeforeFreezing: true,
  verifiesCompiledAgainstSource: true,
});

/* ================================================================ §10 the zero-model preflight */

/**
 * §10: THE TREATMENT-BOUNDARY EXPECTATIONS.
 *
 * §10 fixes the expected handle counts per arm and generation and requires EXACT IDENTITY AND KIND matches, not
 * merely cardinality. The counts are the frozen design's (`GENERATION_EXPOSURES`: G1 exposes I1, G2 exposes
 * I1+I2; C selects one reasoning claim and one procedure revision per exposed invariant; H selects nothing).
 */
export const BOUNDARY_EXPECTATIONS = Object.freeze({
  'H/G1': Object.freeze({ arm: 'H', generation: 'G1', selectedHandles: 0, visibleHandles: 0 }),
  'H/G2': Object.freeze({ arm: 'H', generation: 'G2', selectedHandles: 0, visibleHandles: 0 }),
  'C/G1': Object.freeze({ arm: 'C', generation: 'G1', selectedHandles: 2, visibleHandles: 2, exposedInvariants: Object.freeze(['I1']) }),
  'C/G2': Object.freeze({ arm: 'C', generation: 'G2', selectedHandles: 4, visibleHandles: 4, exposedInvariants: Object.freeze(['I1', 'I2']) }),
  law: 'for C, every expected governed pull must resolve the canonical asset body digest; for H, the selected and visible sets are empty',
  requiresExactIdentityAndKind: true,
  requiresCanonicalBodyDigest: true,
  hiddenReadChannelCheckRequired: true,
});

/** §10: the prohibition that keeps this stage free of model calls. */
export const PREFLIGHT_LAW = Object.freeze({
  realModelCallsPermitted: 0,
  doNotCall: 'the old real-model `runPlumbingCheck()`',
  uses: Object.freeze([
    'packaged runtime',
    'real Project prehistory',
    'real capital associations',
    'actual KnowledgeSelectionRequest builder',
    'ScriptedWorker',
    'actual governed pull boundary',
  ]),
  anyFailedBoundaryControl: 'QUALIFICATION STOP',
});

/* ================================================================ §12 the substitutability records */

/**
 * §12: THE SIX RECORDS.
 *
 * §12 requires six named determinations about whether selected capital can substitute for reading raw history,
 * and it requires the README instruction to read history to be ADJUDICATED rather than pretended absent. The
 * records are the stage's answers; the evidence for each is measured in `substitutability.mjs`.
 */
export const SUBSTITUTABILITY_RECORDS = Object.freeze([
  'RAW_HISTORY_SUFFICIENT',
  'SELECTED_CAPITAL_SUFFICIENT',
  'HISTORY_READING_REQUIRED_BY_PROMPT',
  'EXHAUSTIVE_HISTORY_READING_REQUIRED',
  'CAPITAL_CAN_REDUCE_HISTORY_RECONSTRUCTION',
  'PROMPT_SUBSTITUTION_NEUTRALITY',
]);

/**
 * §12: THE THREE DISTINCTIONS the ruling insists on.
 *
 * "Distinguish: history available; relevant history required; exhaustive history required." Collapsing these
 * would let a document that merely POINTS at history be read as a document that FORBIDS capital substitution.
 */
export const HISTORY_READING_DISTINCTIONS = Object.freeze({
  historyAvailable: 'the raw history corpus is present in the world and readable',
  relevantHistoryRequired: 'the task cannot be completed correctly without consulting the SPECIFIC history that bears on the requirement',
  exhaustiveHistoryRequired: 'the task requires reading the WHOLE history regardless of what capital supplies',
  /** §12: the consequence if the last holds. */
  ifExhaustive: 'STOP the capital-substitution qualification and report a design issue',
  /** §12: the consequence if capital cannot supply the current standing. */
  ifCapitalCannotSupplyStanding: 'STOP',
});

/**
 * §12: THE FROZEN README INSTRUCTION, quoted so its adjudication is auditable.
 *
 * This is the exact sentence in the frozen README that a reader might mistake for a prompt-level prohibition on
 * capital substitution. It is quoted here as DATA rather than paraphrased, because the whole point of the
 * adjudication is to read what the document actually says.
 */
export const README_HISTORY_INSTRUCTION = Object.freeze({
  path: 'README.md',
  quote: 'The rules this Project actually follows are recorded in its history, under `docs/history/` — incidents, decisions, revisions, verification results and migration notes. Read them before changing how resolution or revocation decides.',
  /** §12: what this instruction does and does not require, decided by measurement in substitutability.mjs. */
  adjudicationRequired: true,
  /** §12: the README and the prompt must NOT be edited in this stage. */
  editedInThisStage: false,
  futureWordingRevisionRequires: 'a new, explicitly labeled prospective design version',
  /** §12: the descriptive-only warning about any byte-compression figure. */
  byteCompressionIsDescriptiveOnly: true,
  byteCompressionIsNotCognitiveSavings: true,
});

/* ================================================================ §13 the behavioral design */

/**
 * §13: THE BEHAVIORAL DESIGN, PRESERVED.
 *
 * §13 fixes the shape of the eventual model experiment and forbids rerandomizing on past results, combining old
 * incomplete H observations with new C observations, and changing hidden cases or endpoints. The values are
 * carried so a report can restate them without re-deriving them from the frozen stage.
 */
export const BEHAVIORAL_DESIGN = Object.freeze({
  blocks: 4,
  arms: 2,
  generations: 2,
  sessions: 16,
  trajectoryUnits: 8,
  matchedComparisons: 4,
  armOrderSource: 'the frozen R3-L0C randomization seed 0x524c3002, reused exactly',
  rerandomized: false,
  combinesOldHWithNewC: false,
  bothArmsStartFrom: 'the same Project world, history, capital assets and associations',
  onlyIntendedDifference: 'the selection of current-standing capital',
  executorRouteIdenticalAcrossContemporaneousArms: true,
  /** §13: the executor-stack deviation that must be recorded rather than hidden. */
  executorStackDeviation: Object.freeze({
    id: 'OMNIGATE_DEEPSEEK_ROUTE_REPLACED',
    recorded: true,
    note: 'the changed omnigate DeepSeek route is an explicitly recorded executor-stack deviation; its configured family does not prove checkpoint identity with the old direct provider',
  }),
  hiddenCasesChanged: false,
  qualityThresholdsChanged: false,
  primaryEndpointChanged: false,
});

/* ================================================================ §14 the analysis admission */

/**
 * §14: THE VERDICT ADMISSION PRECONDITIONS.
 *
 * §14 requires the ORIGINAL frozen `RECONSTRUCTION_COMPRESSION` and `NET_COGNITIVE_COST` verdict rules to be
 * reused, forbids a new primary endpoint after seeing prior model behavior, and lists the conditions under which
 * NO treatment verdict may be issued. The list is carried as data so the admission check is auditable.
 */
export const VERDICT_ADMISSION_PRECONDITIONS = Object.freeze([
  'exactly 16 uniquely identified scheduled sessions exist',
  'all eight trajectories satisfy the required execution/admission rules',
  'all four matched blocks are complete',
  'actual treatment realization matches its frozen expectation',
  'experiment containment holds',
  'the execution closure matches',
  'pre- and post-matrix validity gates are green',
  'no missing session has been replaced or silently retried',
]);

/** §14: the independence unit, stated so no analysis treats 16 sessions as 16 independent samples. */
export const INDEPENDENCE_UNIT = Object.freeze({
  unit: 'the paired trajectory block',
  not: '16 statistically independent samples',
  law: 'the independent comparison unit is the paired trajectory block',
});

/** §14: the six capital stages that must be reported separately. */
export const CAPITAL_STAGES = Object.freeze([
  'capital available',
  'capital compiled',
  'capital consumer-visible',
  'capital pulled',
  'capital body resolved',
  'capital behaviorally effective',
]);

/** §14: the reading rules that keep the cost accounting honest. */
export const ANALYSIS_READING_RULES = Object.freeze({
  cFailureToPullIsUptakeNotDelivery: 'C\'s failure to voluntarily pull visible capital is an uptake outcome, not automatically a delivery defect',
  rawHistorySavingsAndTotalCostSeparate: 'raw-history savings and total cognitive cost remain separate',
  pullOverheadIncluded: 'capital pull overhead must not disappear from net-cost accounting',
});

/** §14: the verdicts on a hard validity failure, carried so a report cannot soften them. */
export const ON_VALIDITY_FAILURE = Object.freeze({
  CAUSAL_EXPERIMENT_VALID: 'NO',
  RECONSTRUCTION_COMPRESSION: 'NOT_EVALUABLE',
  NET_COGNITIVE_COST: 'NOT_EVALUABLE',
  partialSessions: 'preserved partial sessions may be described individually, never treated as a complete paired result',
});

/* ================================================================ §15 the fail-stop policy boundary */

/**
 * §15: WHAT THIS STAGE IS NOT.
 *
 * §15 draws the boundary sharply, and it is the most important boundary in the stage: fail-stop is a RESEARCH
 * behaviour, not a new product capability. The stage does NOT create an operator cancellation capability, does
 * NOT implement `ATTEMPT_CANCELLED` for unobservable Worlds, does NOT introduce new governance authority and does
 * NOT turn `HOST_FAILURE` into `ATTEMPT_FAILED`.
 */
export const FAIL_STOP_POLICY_BOUNDARY = Object.freeze({
  createsOperatorCancellation: false,
  implementsAttemptCancelled: false,
  implementsAttemptFailedFromHostFailure: false,
  introducesNewGovernanceAuthority: false,
  turnsHostFailureIntoAttemptFailed: false,
  failStopMeans: 'the RESEARCH RUN stops, retains its World and evidence, and refuses to make a causal claim',
  /** §15: the residual, named rather than hidden. */
  canonicalAttemptMayRemainRunning: true,
  canonicalAttemptResidual: 'an explicitly scoped product-liveness residual, not a fake terminal state',
  /** §15: the authorization this document does and does not carry. */
  requiresExplicitAuthorizationRuling: true,
  thisDocumentCreatesProjectTerminalAuthority: false,
});

/* ================================================================ §16 the commit structure */

/** §16: the logical commits, in order. The falsifiers are committed BEFORE the new runner. */
export const COMMIT_STRUCTURE = Object.freeze([
  'analysis(r3-l0c-f): freeze fail-stop and substitutability contract',
  'test(r3-l0c-f): freeze old-runner retry and evidence-loss falsifiers',
  'fix(r3-l0c-f): implement stage-owned fail-stop runner and executable closure',
  'test(r3-l0c-f): prove deterministic abort, preservation and boundary gates',
  'research(r3-l0c-f): record qualification and resume ruling',
]);

/** §16: the ordering law the commit structure exists to satisfy. */
export const COMMIT_ORDER_LAW = Object.freeze({
  falsifiersBeforeImplementation: true,
  codeRepairsBeforeFinalQualification: true,
  amendHistoricalCommits: false,
  editOldStageFrozenResultFiles: false,
  forcePush: false,
  contractFrozenByNamingOnly: false,
  contractFrozenByCommitTiming: true,
  immutabilityGuardLeavesNoChangesInCommittedEvidence: true,
});

/* ================================================================ §8 the crash matrix */

/**
 * §8: THE TEN REQUIRED CRASH-MATRIX CASES.
 *
 * Each case must exhibit all five properties, and the healthy control must still advance normally through
 * legitimate Work, Result and verification paths. The cases are carried as data so the matrix runner and the
 * report agree on what was required.
 */
export const CRASH_MATRIX_CASES = Object.freeze([
  Object.freeze({ id: 'C1_FAILURE_BEFORE_LAUNCH', description: 'failure before any Worker launch' }),
  Object.freeze({ id: 'C2_FAILURE_AFTER_EXPOSURE_INTENT', description: 'failure immediately after exposure-intent persistence' }),
  Object.freeze({ id: 'C3_CHILD_LAUNCH_OR_REPORT_MISSING', description: 'child launch fails or report is missing' }),
  Object.freeze({ id: 'C4_WORKER_HOST_FAILURE', description: 'worker produces an actual HOST_FAILURE' }),
  Object.freeze({ id: 'C5_WORLD_LOSES_GIT_OBJECTS', description: 'World loses Git object access after worker activity' }),
  Object.freeze({ id: 'C6_C_TREATMENT_HANDLES_ABSENT', description: 'C treatment expected handles are absent at the consumer boundary' }),
  Object.freeze({ id: 'C7_G1_COMPLETES_G2_FAILS', description: 'G1 completes, but G2 fails' }),
  Object.freeze({ id: 'C8_HOST_TERMINATES_BETWEEN_JOURNAL_WRITES', description: 'host process terminates between session journal writes' }),
  Object.freeze({ id: 'C9_RESTART_AGAINST_UNFINISHED_RUN', description: 'runner restarts against an unfinished preserved run' }),
  Object.freeze({ id: 'C10_HEALTHY_TWO_GENERATION_TRAJECTORY', description: 'a healthy two-generation ScriptedWorker trajectory completes' }),
]);

/** §8: the five properties every failure case must exhibit. */
export const CRASH_MATRIX_REQUIREMENTS = Object.freeze([
  'NO_SECOND_LAUNCH',
  'NEXT_SESSION_NOT_STARTED',
  'EVIDENCE_PRESERVED',
  'NO_FAKE_ATTEMPT_TERMINAL',
  'NO_CAUSAL_VERDICT',
]);

/** §8: the healthy control's requirement, which is the other half of the falsifier. */
export const HEALTHY_CONTROL_REQUIREMENT = Object.freeze({
  id: 'C10_HEALTHY_TWO_GENERATION_TRAJECTORY',
  mustAdvanceThrough: Object.freeze(['legitimate Work', 'Result', 'verification']),
  mustReach: 'MATRIX_COMPLETE only when the post-matrix validity gate is green',
});

/* ================================================================ §7 the preservation */

/**
 * §7: THE PRESERVATION REQUIREMENTS.
 *
 * §7 requires reuse of the existing run-owned temp-root and `PRESERVE` mechanism, forbids a second cleanup or
 * lease subsystem, and requires the marker to be placed BEFORE the first primary worker launch. It also names
 * the properties that must be proven, including the one that is easy to get wrong: "Do not call a successful
 * return from a cleanup function proof that all evidence survived."
 */
export const PRESERVATION_REQUIREMENTS = Object.freeze([
  'an ordinary failure retains the run root',
  'an exception retains it',
  'a simulated host interruption retains it',
  'stale-root sweeping refuses to delete it',
  'a restart detects the unfinished run',
  'no restart automatically resumes a primary session',
  'sibling and host-private artifacts remain protected',
]);

/** §7: the reuse law and the two forbidden shortcuts. */
export const PRESERVATION_LAW = Object.freeze({
  reusesMechanism: 'scripts/r3l0c/run-root.mjs',
  buildsSecondCleanupOrLeaseSubsystem: false,
  markerPlacedBefore: 'the first primary worker launch',
  cleanupReturnIsNotProofOfSurvival: true,
  preservedRunRequires: Object.freeze(['a discoverable identity', 'an evidence index']),
});

/* ================================================================ §11 the containment */

/**
 * §11: THE CONTAINMENT REQUIREMENTS.
 *
 * §11 requires the topology to be DERIVED from the frozen schedule, requires each per-unit property to be
 * proven, and forbids two shortcuts: treating a canary in a different directory layout as proof for the actual
 * matrix topology, and claiming distributed security. The supported Windows confidential single-active profile
 * stays unchanged.
 */
export const CONTAINMENT_REQUIREMENTS = Object.freeze([
  'own World reachable',
  'every sibling World inaccessible',
  'sibling and own durable state protected',
  'oracle/reference inaccessible',
  'control/evidence/runner artifacts inaccessible',
  'liveness canaries succeed',
  'protected roots actually exist',
]);

/** §11: the reuse and the prohibitions. */
export const CONTAINMENT_LAW = Object.freeze({
  reuses: Object.freeze(['R3-L0B containment repairs', 'R3-WR3 containment repairs', 'R3-L0C-R topology derivation']),
  topologyDerivedFromSchedule: true,
  canaryInDifferentLayoutIsNotProof: true,
  distributedSecurityClaim: false,
  confidentialProfileUnchanged: true,
  confidentialMaxActiveWorkers: 1,
});

/* ================================================================ the report vocabulary */

/**
 * §18: THE FINAL VERDICT VOCABULARY.
 *
 * Carried as data so the evidence record and the report cannot disagree about what a verdict name is.
 */
export const FINAL_VERDICTS = Object.freeze({
  R3_L0C_F: Object.freeze(['COMPLETE', 'BLOCKED']),
  FAIL_STOP_RUNNER: Object.freeze(['CLOSED', 'OPEN']),
  POST_EXPOSURE_RETRY: Object.freeze(['ZERO', 'VIOLATION']),
  GENERATION_EVIDENCE_DURABILITY: Object.freeze(['CLOSED', 'OPEN']),
  CRASH_PRESERVATION: Object.freeze(['CLOSED', 'OPEN']),
  EXECUTION_CLOSURE: Object.freeze(['COMPLETE', 'INCOMPLETE']),
  TREATMENT_BOUNDARY: Object.freeze(['PASS', 'FAIL']),
  EXPERIMENT_CONTAINMENT: Object.freeze(['PASS', 'FAIL']),
  RAW_HISTORY_SUFFICIENT: Object.freeze(['YES', 'NO']),
  SELECTED_CAPITAL_SUFFICIENT: Object.freeze(['YES', 'NO']),
  PROMPT_SUBSTITUTION_NEUTRALITY: Object.freeze(['PASS', 'LIMITED', 'FAIL']),
  SYSTEM_VALID: Object.freeze(['YES', 'NO']),
  EXPERIMENT_ENVIRONMENT_VALID: Object.freeze(['YES', 'NO']),
  FAIL_STOP_POLICY: Object.freeze(['PROPOSED', 'EXPLICITLY_AUTHORIZED']),
  PAID_REPLICATION: Object.freeze(['READY_FOR_AUTHORIZATION', 'BLOCKED']),
});

/** §18: the mandatory stop, carried as a value so the stage's own record states it. */
export const STAGE_STOP = Object.freeze({
  ranModelMatrix: false,
  beganR3L1: false,
  beganFusion: false,
  modelCallsMade: 0,
  law: 'then STOP: do not run the 16-session model matrix; do not begin R3-L1 or Fusion',
});

/** A one-line summary, for a report header. */
export function contractSummary() {
  return Object.freeze({
    stage: 'R3-L0C-F',
    kind: 'fail-stop resume qualification contract',
    baseline: BASELINE_COMMIT,
    oldProtocol: PROTOCOL_DEVIATION.OLD_PROTOCOL,
    newProtocol: PROTOCOL_DEVIATION.NEW_PROTOCOL,
    states: FAIL_STOP_STATES.length,
    maxWorkerLaunches: LAUNCH_LAW.MAX_WORKER_LAUNCHES,
    postExposureRetries: LAUNCH_LAW.POST_EXPOSURE_RETRIES,
    journalFields: JOURNAL_FIELDS.length,
    closureParts: CLOSURE_PARTS.map((entry) => entry.id),
    crashCases: CRASH_MATRIX_CASES.length,
    substitutabilityRecords: SUBSTITUTABILITY_RECORDS.length,
    modelCallsMade: STAGE_STOP.modelCallsMade,
    newline: NL,
  });
}

export { NL };
