/**
 * R3-L0C-I-A-R-L-C-F-S-H §0-§12 — THE TERMINAL ENFORCEMENT AND SAFETY HOTFIX CONTRACT.
 *
 * This module is this stage's FROZEN SEMANTICS, committed before any correction exists. It records, as values rather
 * than prose, the three guarantees §0 names as still incomplete, the measured defect behind each one, and the
 * twenty-four verdicts §12 requires.
 *
 * WHAT THIS STAGE SUPERSEDES AND WHY IT MAY NOT EDIT IT. §1 freezes `scripts/r3l0ciarlcfs/**` and every previous
 * `research-evidence/**` namespace. The R3-L0C-I-A-R-L-C-F-S stage committed a prospective plan, a Qualification and
 * a Stage Result that describe `scripts/r3l0ciarlcfs/**` as it stood at `80823c4`. Editing those modules in place
 * would make that record describe bytes that no longer exist. So this stage adds its own namespace, leaves the prior
 * one byte-identical, and binds a freshly computed closure into a NEW plan under a NEW plan identity.
 *
 * THE THREE GUARANTEES §0 SAYS ARE STILL INCOMPLETE, and the measured defect behind each:
 *
 *   H1  the artifact-envelope validator is NOT consumed by the authoritative matrix cost-admission path, so an
 *       artifact whose only record is `{"type":"noise"}` is admitted as a MEASURED_FIXTURE with zeros.
 *   H2  the cleanup implementation still reaches destructive operations after an unverified ownership claim, a
 *       string-prefix root comparison, or an unenumerated nested link.
 *   H3  a pre-persistence cross-artifact seal recording MISMATCH coexists inside the committed Qualification with a
 *       MATCH verdict derived from a different source.
 *
 * Plus the two completion requirements §0 adds: one decisive Runner-level identity negative control, and a
 * deterministic qualification COMPUTED from actual conditions rather than assigned a constant PASS.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

const NL = String.fromCharCode(10);

/** §0: the exact baseline this stage starts from. */
export const BASELINE_COMMIT = '80823c4e5b0015b265ae71df8d6468c0bfe9c865';

/** §0: the stage branch. */
export const STAGE_BRANCH = 'r3-l0c-iar-lcfsh-terminal-hotfix';

/** §0: this stage's own code namespace. */
export const STAGE_CODE_PATH = 'scripts/r3l0ciarlcfsh';

/** §0: this stage's own evidence namespace. The ONLY place it may add under `research-evidence/`. */
export const STAGE_EVIDENCE_PATH = 'research-evidence/r3-l0c-iar-lcfsh';

/** §11: this stage's plan identity, so the guard and the plan agree on the name. */
export const PLAN_ID = 'r3-l0c-iar-lcfsh-primary-plan';

/** §0/§11: the prior stage, whose code and evidence this stage supersedes but never edits. */
export const SUPERSEDED_STAGE = Object.freeze({
  stage: 'R3-L0C-I-A-R-L-C-F-S',
  commit: BASELINE_COMMIT,
  planId: 'r3-l0c-iar-lcfs-primary-plan',
  planPath: 'research-evidence/r3-l0c-iar-lcfs/execution-plan.json',
  qualificationPath: 'research-evidence/r3-l0c-iar-lcfs/qualification.json',
  stageResultPath: 'research-evidence/r3-l0c-iar-lcfs/stage-result.json',
  codePath: 'scripts/r3l0ciarlcfs',
  pipeline: 'scripts/r3l0ciarlcfs/pipeline.mjs',
  disposition: 'SUPERSEDED — byte-identical, no longer the authorized entry point',
});

/** The checkout root, resolved from this module's own position. */
export const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');

/** §1: the protected namespaces, frozen and byte-identical for this stage. */
export const PROTECTED_NAMESPACES = Object.freeze([
  'src', 'host', 'scripts/r3l0c', 'scripts/r3l0cf', 'scripts/r3l0ciar', 'scripts/r3l0ciarl',
  'scripts/r3l0ciarlc', 'scripts/r3l0ciarlcf', 'scripts/r3l0ciarlcfs',
]);

/* ================================================================ §0/§2 the five baseline defects */

/**
 * §2: THE FIVE BASELINE DEFECTS, EACH WITH THE MEASURED OBSERVATION THAT ESTABLISHED IT.
 *
 * Every `measured` string below is the ACTUAL return value of a call into the committed `80823c4` code, taken by
 * `baseline/legacy-controls.mjs` before any correction in this stage existed. `defectToClose` is what the
 * correction must make unreachable; `authoritativePath` is the function the correction must live inside.
 */
export const BASELINE_DEFECTS = Object.freeze([
  Object.freeze({
    id: 'B1_VALIDATOR_NOT_CONSUMED',
    requirement: 'H1',
    section: '§3',
    gap: 'the new artifact-envelope validator exists but the authoritative cost-admission consumer never calls it, so the frozen `interpretArtifact` gate — which accepts ANY artifact yielding at least one parseable record — remains the only content test',
    baselineLocation: 'scripts/r3l0ciarlcfs/pipeline.mjs:256 and :299 `bridgeMatrixCost(...)`, then scripts/r3l0ciarlcf/cost-bridge.mjs:231 `interpretArtifact(...)`, then :235 `reconstructCost(...)`',
    measured: 'a real-format artifact whose only record is {"type":"noise"}, with an internally consistent sidecar digest and attempt identity, is admitted as `MEASURED_FIXTURE` with `fields.rawHistoryArtifactsRead: 0`; the new `validateArtifactEnvelope` independently reports `ENVELOPE_INVALID`',
    defectToClose: 'the authoritative chain `runEvidenceSealMatrix -> validityGate -> bridgeMatrixCost -> attributeSessionFromRecord -> interpretArtifact -> reconstructCost` contains no call to the envelope validator',
    authoritativePath: 'scripts/r3l0ciarlcfsh/validated-cost-bridge.mjs validatedCostBridge',
  }),
  Object.freeze({
    id: 'B2_CLEANUP_REACHES_DESTRUCTIVE_OPERATIONS',
    requirement: 'H2',
    section: '§4',
    gap: 'cleanup reaches `git worktree remove --force` and a recursive delete after a caller-supplied ownership flag, a string-prefix root comparison, or an unenumerated nested link',
    baselineLocation: 'scripts/r3l0ciarlcfs/safe-cleanup.mjs:122 `const owned = ownershipByMarker === true || ownershipByFlag === true`, :141 `normalizedRoot.startsWith(normalizedExpected)`, :159 the root-only `fs.readdir` enumeration',
    measured: 'four independent measurements against the committed code: (1) a path carrying NO marker but a caller-supplied `owned: true` returns `CLEANED` with `destructiveFallbackExecuted: true` and the directory\'s user file is GONE; (2) a sibling directory whose name shares a textual prefix with the expected root returns `CLEANED` and its data file is GONE; (3) a link nested below the worktree root is seen 0 times by the enumeration and the worktree is `CLEANED`; (4) a dangling junction reports `existsSync === false` while `lstat` proves the link still exists',
    defectToClose: 'an unverified ownership claim, an unsafe root, or a residual or unenumerated link can reach a destructive operation',
    authoritativePath: 'scripts/r3l0ciarlcfsh/safe-cleanup.mjs destroyDisposableCheckout',
  }),
  Object.freeze({
    id: 'B3_CONTRADICTORY_PERSISTED_SEAL',
    requirement: 'H3',
    section: '§5',
    gap: 'the committed Qualification records a pre-persistence seal computed with `qualification: null` and `stageResult: null` as if it were a comparable final verdict, while a MATCH verdict is derived from a different source',
    baselineLocation: 'scripts/r3l0ciarlcfs/qualification.mjs:260 `sealCrossArtifactPlanIdentity({ plan, qualification: null, stageResult: null, ... })`, against :268 `CROSS_ARTIFACT_PLAN_BINDING: planControl.PASS === true ? \'MATCH\' : \'MISMATCH\'`',
    measured: 'the committed `research-evidence/r3-l0c-iar-lcfs/qualification.json` carries `crossArtifactSeal.CROSS_ARTIFACT_PLAN_BINDING = MISMATCH` and `crossArtifactSeal.sealed = false` while `verdicts.CROSS_ARTIFACT_PLAN_BINDING = MATCH` and `readiness.CROSS_ARTIFACT_EVIDENCE_SEALED = true`',
    defectToClose: 'a pre-persistence check becomes an authoritative final verdict, and two contradictory final seal statuses coexist inside one committed artifact',
    authoritativePath: 'scripts/r3l0ciarlcfsh/evidence-seal.mjs sealPersistedEvidence',
  }),
  Object.freeze({
    id: 'B4_IDENTITY_EVIDENCE_LEVEL',
    requirement: 'H4',
    section: '§6',
    gap: 'the existing AttemptId/HostJobId negative controls never drive the actual frozen Runner, so the highest level demonstrated is a standalone reconciliation helper',
    baselineLocation: 'scripts/r3l0ciarlcfs/acceptance.mjs:285 `reconcileTrialIdentity(...)` (T1) and :317-:318 `reconcileTrialEvidence({ journal: readJournal(journalPath), ... })` (T2)',
    measured: 'no test in the committed stage calls `runFailStopMatrix` with a mutated identity; `runFailStopMatrix` appears in `scripts/r3l0ciarlcfs/` only as an import inside `pipeline.mjs:165`, and the stage tests never reach it',
    defectToClose: 'no full Trial Evidence identity conflict is demonstrated to affect the actual frozen Runner\'s terminal decision',
    authoritativePath: 'scripts/r3l0ciarlcfsh/pipeline.mjs (the identity mutation seam) driven through scripts/r3l0cf/fail-stop.mjs runFailStopMatrix',
  }),
  Object.freeze({
    id: 'B5_UNCONDITIONAL_QUALIFICATION_PASS',
    requirement: 'H5',
    section: '§7',
    gap: 'the deterministic-qualification verdict is a literal, so a failed matrix, an invalid cost observation, an unsuccessful seal or a blocked safety gate cannot make it fail',
    baselineLocation: 'scripts/r3l0ciarlcfs/qualification.mjs:280 `DETERMINISTIC_MEASUREMENT_QUALIFICATION: \'PASS\'`',
    measured: 'the committed `research-evidence/r3-l0c-iar-lcfs/qualification.json` records `verdicts.DETERMINISTIC_MEASUREMENT_QUALIFICATION = "PASS"` in the same artifact that carries `crossArtifactSeal.sealed = false`',
    defectToClose: 'a deterministic qualification can report PASS while a load-bearing measured prerequisite is not green',
    authoritativePath: 'scripts/r3l0ciarlcfsh/qualification.mjs reduceDeterministicQualification',
  }),
]);

/** §2: the five defect ids, so the contract, the controls and the tests agree on the set. */
export const BASELINE_DEFECT_IDS = Object.freeze(BASELINE_DEFECTS.map((defect) => defect.id));

/* ================================================================ §3 H1 validated cost admission */

/**
 * §3: THE ORDERED AUTHORITY CHAIN THE VALIDATED COST BRIDGE MUST FOLLOW.
 *
 * §3 requires the chain to read the durable journal, identify the admitted trials, resolve each digest-bound
 * sidecar, validate the session/attempt/artifact identity, verify the artifact content digest, validate the event
 * envelope, admit a measurement ONLY when the required validity conditions hold, reuse the frozen
 * reconstruction-cost calculation, classify measured/absent/invalid separately, and build the matrix result from
 * the validated per-session states.
 */
export const VALIDATED_COST_CHAIN = Object.freeze([
  'READ_DURABLE_JOURNAL',
  'IDENTIFY_ADMITTED_TRIAL_RECORDS',
  'RESOLVE_DIGEST_BOUND_SIDECAR',
  'VALIDATE_SESSION_ATTEMPT_ARTIFACT_IDENTITY',
  'VERIFY_ARTIFACT_CONTENT_DIGEST',
  'VALIDATE_ARTIFACT_EVENT_ENVELOPE',
  'ADMIT_COST_ONLY_WHEN_VALID',
  'REUSE_FROZEN_RECONSTRUCTION_COST',
  'CLASSIFY_MEASURED_ABSENT_INVALID',
  'BUILD_MATRIX_COST_FROM_VALIDATED_STATES',
]);

/** §3: the three cost-completeness levels, preserved separately. An invalid observation satisfies none of the measured levels. */
export const COST_COMPLETENESS_LEVELS = Object.freeze([
  Object.freeze({ id: 'CostAccountingComplete', detail: 'every planned session has an explicit measurement or an explicit absence classification' }),
  Object.freeze({ id: 'CostMeasuredComplete', detail: 'every required session has a VALIDATED cost observation' }),
  Object.freeze({ id: 'LivePrimaryCostComplete', detail: 'every required session has a real PRIMARY cost observation with verified execution provenance' }),
]);

/** §3: the invalidity states the validated bridge must name, each its own outcome rather than a silent zero. */
export const INVALID_MEASUREMENT_STATES = Object.freeze([
  'UNREADABLE',
  'MALFORMED',
  'ENVELOPE_INVALID',
  'COMPLETION_NOT_OBSERVED',
]);

/* ================================================================ §4 H2 cleanup safety */

/** §4: the cleanup outcomes, so a blocked cleanup is a named state rather than a silent success. */
export const CLEANUP_OUTCOMES = Object.freeze({
  CLEANED: 'CLEANED',
  CLEANUP_BLOCKED: 'CLEANUP_BLOCKED',
  REFUSED_NOT_OWNED: 'REFUSED_NOT_OWNED',
});

/**
 * §4: THE ORDERED SAFETY STEPS. Each is an observation the cleanup makes rather than a comment it carries, and a
 * failure at any one of them returns `CLEANUP_BLOCKED` with the worktree preserved.
 */
export const CLEANUP_SAFETY_STEPS = Object.freeze([
  'VERIFY_OWNERSHIP_FROM_MARKER_IDENTITY_AND_GIT_REGISTRATION',
  'VERIFY_PATH_CONTAINMENT_BY_RELATIVE_RESOLUTION',
  'ENUMERATE_LINKS_RECURSIVELY_INCLUDING_NESTED_ENTRIES',
  'CLASSIFY_EVERY_ENTRY_BY_LSTAT_WITHOUT_TRAVERSING',
  'ATTEMPT_LINK_ONLY_REMOVAL',
  'REINSPECT_EVERY_LINK_PATH_BY_LSTAT',
  'REQUIRE_ENOENT_AS_THE_ONLY_PROOF_OF_REMOVAL',
  'ABORT_IF_ANY_LINK_REMAINS_OR_IS_UNCLASSIFIABLE',
  'NEVER_FORCE_REMOVE_OR_RECURSE_AFTER_FAILURE',
  'PRESERVE_FOR_DIAGNOSIS_AND_REPORT_LOCATION',
  'RETURN_EXPLICIT_CLEANUP_BLOCKED',
]);

/** §4: the ownership witnesses that must AGREE. A caller-supplied boolean is diagnostic input, not authority. */
export const OWNERSHIP_WITNESSES = Object.freeze([
  Object.freeze({ id: 'STAGE_MARKER_PRESENT', detail: 'the checkout carries this stage\'s disposable marker file' }),
  Object.freeze({ id: 'MARKER_STAGE_IDENTITY', detail: 'the marker records THIS stage\'s identity, not another stage\'s' }),
  Object.freeze({ id: 'MARKER_ROOT_IDENTITY', detail: 'the marker records the resolved checkout root it was written into' }),
  Object.freeze({ id: 'MARKER_CHECKOUT_NONCE', detail: 'the marker carries the per-checkout random identifier the factory issued' }),
  Object.freeze({ id: 'FACTORY_CREATED_ROOT', detail: 'the path lies under the disposable root this stage\'s factory creates under the system temp root' }),
  Object.freeze({ id: 'GIT_WORKTREE_REGISTRATION', detail: 'Git lists the path as a registered worktree of this repository' }),
]);

/** §4: the threat model, stated so the claim is bounded rather than universal. */
export const CLEANUP_THREAT_MODEL = Object.freeze({
  protectsAgainst: Object.freeze([
    'an accidental misuse of the cleanup helper against a path this stage does not own',
    'a caller-supplied ownership assertion substituted for independently verified ownership',
    'a sibling directory accepted by a textual prefix comparison',
    'a residual, dangling, nested or unclassifiable link left inside the worktree',
    'a filesystem or Git operation that fails partway through',
  ]),
  doesNotProtectAgainst: Object.freeze([
    'an adversarial process able to modify arbitrary filesystem entries concurrently with the cleanup',
    'a platform whose reparse-point semantics differ from the ones measured on this host',
  ]),
  claimIsBoundedToDeclaredDisposableEnvironment: true,
});

/* ================================================================ §5 H3 the persisted seal */

/** §5: the two explicit phases. A pre-persistence status is NOT a final verdict. */
export const SEAL_PHASES = Object.freeze({
  PHASE_A: Object.freeze({
    id: 'PENDING_PERSISTED_EVIDENCE',
    detail: 'the Qualification and the Stage Result are constructed from the same verified committed plan, but cross-artifact sealing has NOT yet been performed because the files are not yet committed',
    isFinalVerdict: false,
  }),
  PHASE_B: Object.freeze({
    id: 'PERSISTED_SEAL_EVALUATED',
    detail: 'the committed Plan, Qualification and Stage Result were read back from Git and their identities, hashes and execution closure were verified',
    isFinalVerdict: true,
  }),
});

/** §5: the fields the final persisted seal must carry. */
export const SEAL_REQUIRED_FIELDS = Object.freeze([
  'planId',
  'planFullContentDigest',
  'planCommittedGitBlob',
  'qualificationCommittedGitBlob',
  'stageResultCommittedGitBlob',
  'qualificationContentDigest',
  'stageResultContentDigest',
  'executionClosureDigest',
  'recomputedClosureDigest',
  'planReferenceEqualities',
  'planIdEqualities',
  'closureEqualities',
  'evaluationPhase',
  'sourceFiles',
  'result',
]);

/** §5: the seal's own digest field, EXCLUDED from the material the seal hashes. */
export const SEAL_SELF_FIELD = 'sealDigest';

/* ================================================================ §6 H4 the Runner-level falsifier */

/** §6: the identity fields a Runner-level mutation may move, each a controlled single disagreement. */
export const RUNNER_MUTATION_FIELDS = Object.freeze(['attemptId', 'hostJobId', 'contentDigests']);

/** §6: what the Runner-level test must assert, as data so the report and the test agree. */
export const RUNNER_FALSIFIER_ASSERTIONS = Object.freeze([
  'THE_IDENTITY_CONDITION_IS_RED',
  'NO_VALID_MATRIX_COMPLETED_EVENT',
  'THE_RUN_PRESERVES_ITS_EVIDENCE',
  'NO_LATER_WORKER_LAUNCH_OCCURS',
  'NO_CAUSAL_VERDICT_IS_ISSUED',
]);

/* ================================================================ §7 H5 derived qualification */

/**
 * §7: THE MANDATORY PREREQUISITES, each a MEASURED value rather than an assertion.
 *
 * §7 requires the deterministic qualification to be derived from the committed plan identity, the execution
 * closure, the matrix terminal state, the Runner terminal admission, the exact session count, zero forbidden
 * launches, the durable trial reconciliation, the valid cost classification, the absence of false measured-zero
 * promotion, the safe cleanup controls, the final persisted seal and historical immutability.
 */
export const QUALIFICATION_CONDITIONS = Object.freeze([
  Object.freeze({ id: 'COMMITTED_PLAN_IDENTITY_VERIFIED', detail: 'the committed plan\'s self-digest, Git blob identity, schema and id, and closure binding all verify' }),
  Object.freeze({ id: 'EXECUTION_CLOSURE_MATCHES', detail: 'the execution closure bound by the committed plan equals the current recomputed closure' }),
  Object.freeze({ id: 'MATRIX_TERMINAL_STATE_COMPLETE', detail: 'the actual frozen Runner reached its completion state' }),
  Object.freeze({ id: 'RUNNER_TERMINAL_ADMISSION_GREEN', detail: 'the actual authoritative terminal admission is GREEN' }),
  Object.freeze({ id: 'EXACT_PLANNED_SESSION_COUNT', detail: 'exactly the frozen scheduled session count completed' }),
  Object.freeze({ id: 'ZERO_FORBIDDEN_LAUNCHES_OR_RETRIES', detail: 'exactly one launch per session and no unplanned launch' }),
  Object.freeze({ id: 'DURABLE_TRIAL_EVIDENCE_RECONCILED', detail: 'the durable trial evidence reconciles against the in-memory observation over the full identity surface' }),
  Object.freeze({ id: 'VALID_COST_CLASSIFICATION', detail: 'every session\'s cost is a validated measurement or an explicit labelled absence' }),
  Object.freeze({ id: 'NO_FALSE_MEASURED_ZERO_PROMOTION', detail: 'no invalid artifact was promoted to a measured zero' }),
  Object.freeze({ id: 'SAFE_CLEANUP_CONTROLS_PASS', detail: 'the fail-closed cleanup controls hold' }),
  Object.freeze({ id: 'FINAL_PERSISTED_SEAL_MATCHES', detail: 'the final persisted evidence seal over the committed Plan, Qualification and Stage Result is MATCH' }),
  Object.freeze({ id: 'HISTORICAL_EVIDENCE_IMMUTABLE', detail: 'every previous evidence namespace is byte-identical' }),
]);

/** §7: the verdict vocabulary. `PENDING_FINAL_SEAL` is the honest pre-persistence state and is NOT a PASS. */
export const QUALIFICATION_VERDICTS = Object.freeze(['PASS', 'FAIL', 'PENDING_FINAL_SEAL']);

/* ================================================================ §9 the frozen design */

/** §9: the frozen scientific design, unchanged, so an evidence/safety correction cannot move it. */
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
  newRandomization: false,
  modelSubstitution: false,
  law: 'the purpose of this stage is terminal enforcement and execution safety, not a scientific design change',
});

/* ================================================================ §12 the verdicts */

/** §12: the twenty-four final verdicts and their vocabularies. */
export const FINAL_VERDICTS = Object.freeze({
  VALIDATED_COST_BRIDGE: Object.freeze(['PASS', 'FAIL', 'BLOCKED']),
  INVALID_ARTIFACT_NOT_MEASURED: Object.freeze(['PASS', 'FAIL']),
  GENUINE_MEASURED_ZERO_PRESERVED: Object.freeze(['PASS', 'FAIL']),
  TERMINAL_COST_ADMISSION_ENFORCED: Object.freeze(['PASS', 'FAIL', 'BLOCKED']),
  DURABLE_COST_READBACK_CONSISTENT: Object.freeze(['PASS', 'FAIL']),
  SAFE_CLEANUP_LINK_REINSPECTION: Object.freeze(['PASS', 'FAIL', 'BLOCKED']),
  SAFE_CLEANUP_PATH_CONTAINMENT: Object.freeze(['PASS', 'FAIL', 'BLOCKED']),
  SAFE_CLEANUP_OWNERSHIP: Object.freeze(['PASS', 'FAIL', 'BLOCKED']),
  SAFE_CLEANUP_NESTED_LINKS: Object.freeze(['PASS', 'FAIL', 'BLOCKED']),
  SAFE_CLEANUP_DESTRUCTIVE_FALLBACK: Object.freeze(['PASS', 'FAIL', 'BLOCKED']),
  LEGACY_UNSAFE_HELPER_SCOPE: Object.freeze(['DISCLOSED', 'FAIL']),
  RUNNER_LEVEL_IDENTITY_FALSIFIER: Object.freeze(['PASS', 'FAIL']),
  COMMITTED_PLAN_IDENTITY: Object.freeze(['MATCH', 'MISMATCH', 'NOT_ESTABLISHED']),
  PERSISTED_CROSS_ARTIFACT_SEAL: Object.freeze(['MATCH', 'MISMATCH', 'NOT_ESTABLISHED']),
  FINAL_VERDICT_DERIVED_FROM_SEAL: Object.freeze(['PASS', 'FAIL']),
  DETERMINISTIC_MEASUREMENT_QUALIFICATION: Object.freeze(['PASS', 'FAIL', 'PENDING_FINAL_SEAL']),
  EXECUTION_CLOSURE: Object.freeze(['MATCH', 'DRIFTED']),
  HISTORICAL_EVIDENCE_IMMUTABILITY: Object.freeze(['PASS', 'FAIL']),
  REAL_DSH_ARTIFACT_COMPATIBILITY: Object.freeze(['PASS', 'NOT_ESTABLISHED']),
  LIVE_PRIMARY_PROVENANCE: Object.freeze(['PASS', 'NOT_ESTABLISHED']),
  EXTERNAL_AUTHORITY: Object.freeze(['PASS', 'NOT_ESTABLISHED']),
  HOST_SPEND_ENFORCEMENT: Object.freeze(['PASS', 'NOT_ESTABLISHED']),
  PAID_EXECUTION: Object.freeze(['NOT_RUN', 'RUN']),
  CAUSAL_RESULT: Object.freeze(['NOT_EVALUABLE', 'EVALUABLE']),
});

/** §12: the verdicts this stage cannot legitimately promote, carried as values rather than computed away. */
export const UNEARNED_VERDICTS = Object.freeze({
  REAL_DSH_ARTIFACT_COMPATIBILITY: 'NOT_ESTABLISHED',
  LIVE_PRIMARY_PROVENANCE: 'NOT_ESTABLISHED',
  EXTERNAL_AUTHORITY: 'NOT_ESTABLISHED',
  HOST_SPEND_ENFORCEMENT: 'NOT_ESTABLISHED',
  PAID_EXECUTION: 'NOT_RUN',
  CAUSAL_RESULT: 'NOT_EVALUABLE',
  neverPromotedToPass: true,
});

/** §12: the completion classifications, exactly one of which the stage reports. */
export const COMPLETION_CLASSIFICATIONS = Object.freeze([
  Object.freeze({ id: 'DETERMINISTIC_MEASUREMENT_CLOSED', detail: 'all mandatory deterministic and final-evidence admission properties are proven at their specified evidence level' }),
  Object.freeze({ id: 'DETERMINISTIC_MEASUREMENT_BLOCKED', detail: 'at least one required property cannot be established under the bounded constraints' }),
  Object.freeze({ id: 'STAGE_INVALID', detail: 'the frozen scientific design, the Git/history boundaries, the model-call prohibitions or a safety hard stop was violated' }),
]);

/** §4: the legacy helper quarantine, restated because a stage-owned replacement does not make the old one impossible. */
export const LEGACY_HELPER_QUARANTINE = Object.freeze({
  helpers: Object.freeze([
    'scripts/r3l0ciarlcf/isolated-mutation.mjs destroyIsolatedCheckout',
    'scripts/r3l0ciarlcfs/safe-cleanup.mjs destroyDisposableCheckout',
  ]),
  disposition: 'SUPERSEDED for this stage\'s safety-sensitive mutation operations',
  replacedBy: 'scripts/r3l0ciarlcfsh/safe-cleanup.mjs destroyDisposableCheckout',
  physicallyUnexecutable: false,
  quarantineIsAGuardNotAnImpossibility: true,
  forbiddenClaim: 'do not claim a historical helper has become physically unexecutable merely because this stage does not call it',
  stillCallableBy: 'the frozen R3-L0C-I-A-R-L-C-F and R3-L0C-I-A-R-L-C-F-S qualifications and their tests, which this stage does not rewrite',
});

/* ================================================================ §11 the commits and the stop */

/** §11: the commit structure this stage follows. */
export const COMMIT_STRUCTURE = Object.freeze([
  'test(r3-l0c-iar-lcfsh): freeze the measured baseline controls and the stage contract',
  'fix(r3-l0c-iar-lcfsh): validate cost admission, fail closed on cleanup, separate the seal phases and derive the qualification',
  'test(r3-l0c-iar-lcfsh): drive the Runner-level identity falsifier and the authoritative hotfix gates',
  'research(r3-l0c-iar-lcfsh): freeze the superseding prospective plan once',
  'research(r3-l0c-iar-lcfsh): qualify against the committed plan and commit the pre-seal evidence',
  'research(r3-l0c-iar-lcfsh): seal the persisted evidence set and derive the final verdicts',
]);

/** §11: the commit law. */
export const COMMIT_LAW = Object.freeze({
  failingControlsBeforeImplementation: true,
  priorResearchCommitsImmutable: true,
  supersedesRatherThanAmendsPriorPlan: true,
  testsDoNotRegenerateCommittedPlans: true,
  planFrozenOnce: true,
  postFreezeSourceFixRequiresANewIdentity: true,
  forcePush: false,
  mergeToMain: false,
  finalClosureComputedAfterFinalBuild: true,
});

/** §0/§13: the mandatory stop, carried as a value so the stage's own record states it. */
export const STAGE_STOP = Object.freeze({
  livePrimaryProvenance: 'NOT_ESTABLISHED',
  externalAuthority: 'NOT_ESTABLISHED',
  hostSpendEnforcement: 'NOT_ESTABLISHED',
  paidExecution: 'NOT_RUN',
  causalResult: 'NOT_EVALUABLE',
  ranPaidMatrix: false,
  beganR3L1: false,
  beganFusion: false,
  modelCallsMade: 0,
  enteredPrimaryExecution: false,
  law: 'LIVE_PRIMARY_PROVENANCE, EXTERNAL_AUTHORITY and HOST_SPEND_ENFORCEMENT stay NOT_ESTABLISHED, PAID_EXECUTION stays NOT_RUN and CAUSAL_RESULT stays NOT_EVALUABLE; these limitations must not be reinterpreted as failures requiring fixture-generated evidence',
});

/** A one-line summary, for a report header. */
export function contractSummary() {
  return Object.freeze({
    stage: 'R3-L0C-I-A-R-L-C-F-S-H',
    kind: 'terminal enforcement and safety hotfix contract',
    baseline: BASELINE_COMMIT,
    planId: PLAN_ID,
    defects: BASELINE_DEFECTS.length,
    costChainSteps: VALIDATED_COST_CHAIN.length,
    cleanupSteps: CLEANUP_SAFETY_STEPS.length,
    ownershipWitnesses: OWNERSHIP_WITNESSES.length,
    qualificationConditions: QUALIFICATION_CONDITIONS.length,
    verdicts: Object.keys(FINAL_VERDICTS).length,
    modelCallsMade: STAGE_STOP.modelCallsMade,
    newline: NL,
  });
}

export { NL };
