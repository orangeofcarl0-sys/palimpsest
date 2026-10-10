/**
 * R3-L0C-I-A-R-L-C-F-S §0-§12 — THE FROZEN EVIDENCE-SEAL AND SAFETY-CLOSURE CONTRACT.
 *
 * This module is this stage's FROZEN SEMANTICS, committed before any correction exists. It records, as values rather
 * than prose, the two invariants §0 states, the measured defect each gate closes, and the nineteen verdicts §12
 * requires.
 *
 * THE TWO INVARIANTS, quoted from the ruling because every gap below is one reading of them:
 *
 *   1. A qualifying result must refer to the exact committed prospective plan that the authoritative execution path
 *      would use. Its digest, durable evidence, execution assumptions and terminal verdict must agree across all
 *      persisted records.
 *   2. An isolation or cleanup failure must never authorize a destructive fallback that could affect files outside
 *      the disposable test environment.
 *
 * WHY A NEW NAMESPACE. The prior stage's committed evidence (`research-evidence/r3-l0c-iar-lcf/`) and its plan
 * (`r3-l0c-iar-lcf-primary-plan`) describe `scripts/r3l0ciarlcf/**` as it stood at `8bf8d42`. Editing those modules
 * in place would make that record describe code that no longer exists. So this stage SUPERSEDES the
 * R3-L0C-I-A-R-L-C-F modules with its own, leaves them byte-identical, and binds a freshly computed closure into a
 * NEW plan in a NEW evidence namespace. §3 additionally requires a stage-owned ERRATUM naming the prior stage's
 * cross-artifact plan mismatch, because the prior evidence is never rewritten.
 *
 * WHAT THIS STAGE IS NOT. §0 forbids model calls. It is a bounded evidence-correction and safety-closure stage, not
 * a new research experiment and not a new general experimental framework. `src/**`, `host/**`, the frozen corpus,
 * the capital, the oracle, the randomization, the treatment, the sample size, the endpoints and the thresholds are
 * untouched, and no new Fail-Stop Runner, general ArtifactStore or canonical Owner is introduced.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

const NL = String.fromCharCode(10);

/** §0: the exact baseline this stage starts from. */
export const BASELINE_COMMIT = '8bf8d42298aee3b8b267b3793e015900ca7cc2a7';

/** §0: the stage branch. */
export const STAGE_BRANCH = 'r3-l0c-iar-lcfs-evidence-seal';

/** §0: this stage's own code namespace. */
export const STAGE_CODE_PATH = 'scripts/r3l0ciarlcfs';

/** §0: this stage's own evidence namespace. The ONLY place it may add under `research-evidence/`. */
export const STAGE_EVIDENCE_PATH = 'research-evidence/r3-l0c-iar-lcfs';

/** §9: this stage's plan identity, so the guard and the plan agree on the name. */
export const PLAN_ID = 'r3-l0c-iar-lcfs-primary-plan';

/** §0/§9: the prior stage, whose code and evidence this stage supersedes but never edits. */
export const SUPERSEDED_STAGE = Object.freeze({
  stage: 'R3-L0C-I-A-R-L-C-F',
  commit: BASELINE_COMMIT,
  planId: 'r3-l0c-iar-lcf-primary-plan',
  planPath: 'research-evidence/r3-l0c-iar-lcf/execution-plan.json',
  codePath: 'scripts/r3l0ciarlcf',
  pipeline: 'scripts/r3l0ciarlcf/pipeline.mjs',
  disposition: 'SUPERSEDED — byte-identical, no longer the authorized entry point',
});

/** The checkout root, resolved from this module's own position. */
export const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');

/** §1: the protected namespaces, frozen and byte-identical for this stage. */
export const PROTECTED_NAMESPACES = Object.freeze([
  'src', 'host', 'scripts/r3l0c', 'scripts/r3l0cf', 'scripts/r3l0ciar', 'scripts/r3l0ciarl',
  'scripts/r3l0ciarlc', 'scripts/r3l0ciarlcf',
]);

/* ================================================================ §0 the five gaps */

/**
 * §0: THE FIVE GAPS, EACH WITH THE MEASURED DEFECT IT CLOSES.
 *
 * Each records the FILE and FUNCTION where the baseline behaviour lives and the exact observation that measured it,
 * so a reader can verify the defect rather than take the control's word for it. `property` is what the correction
 * must make true; `authoritativePath` is the function the correction must live inside.
 */
export const EVIDENCE_GAPS = Object.freeze([
  Object.freeze({
    id: 'S1_CROSS_ARTIFACT_PLAN_MISMATCH',
    section: '§3 Gate S1',
    gap: 'the Qualification builds a NEW plan in memory with a fresh `frozenAt`, while separately re-reading the committed file and comparing the file to ITSELF, so one apparently successful qualification carries two distinct plan identities',
    baselineLocation: 'scripts/r3l0ciarlcf/qualification.mjs:128 `buildProspectivePlan({ closure, verifyCompiled: false })` and :247 `checkPlanContentDigest()`',
    measured: 'the committed plan carries `4a6786d0…` while `qualification.json` and `stage-result.json` embed `e715ce6f…` under `plan.planContentDigest`, and the `FULL_PLAN_DIGEST` verdict is nonetheless MATCH',
    property: 'exactly ONE authoritative committed prospective plan exists; the Qualification and the Stage Result reference that plan rather than an independently regenerated object; the plan is verified against its committed Git blob; and the four identity equalities are required rather than assumed',
    authoritativePath: 'scripts/r3l0ciarlcfs/committed-plan.mjs readAndVerifyCommittedPlan',
  }),
  Object.freeze({
    id: 'S2_UNSAFE_CLEANUP_FALLBACK',
    section: '§4 Gate S2',
    gap: 'a failed junction unlink is swallowed and the function proceeds unconditionally to `git worktree remove --force` and a recursive `rmSync`, so an unremoved link can be followed into a shared target',
    baselineLocation: 'scripts/r3l0ciarlcf/isolated-mutation.mjs:96 `catch { /* the junction may already be gone */ }` followed by :98-:99',
    measured: 'a junction whose unlink throws does not prevent `git worktree remove --force` from running, and an attempted unlink is treated as a successful one',
    property: 'before any recursive deletion or forced worktree removal, every link capable of referring outside the disposable worktree is positively identified and CONFIRMED removed; a remaining, unclassifiable or unsafely-unlinkable link returns an explicit CLEANUP_BLOCKED and no destructive fallback executes',
    authoritativePath: 'scripts/r3l0ciarlcfs/safe-cleanup.mjs destroyDisposableCheckout',
  }),
  Object.freeze({
    id: 'S3_PARTIAL_TRIAL_IDENTITY',
    section: '§5 Gate S3',
    gap: 'the durable reconciliation compares only block/arm/generation/trajectoryId, so two records can agree on the scientific schedule identity while disagreeing on AttemptId, HostJobId or a load-bearing contentDigests binding',
    baselineLocation: 'scripts/r3l0ciarlcf/durable-reconciliation.mjs:80 and :95 `for (const field of [\'block\', \'arm\', \'generation\', \'trajectoryId\'])`',
    measured: 'a durable TRIAL_RECORDED whose attemptId, hostJobId or executionClosureDigest differs from the in-memory observation leaves `DURABLE_IDENTITY_EXACT` and `DURABLE_MATCHES_IN_MEMORY` true',
    property: 'the authoritative terminal gate detects disagreement in every load-bearing trial-evidence field, keeps the four null/absent states separate, and never treats a pair of matching null fields as independently verified identity',
    authoritativePath: 'scripts/r3l0ciarlcfs/trial-identity.mjs reconcileTrialEvidence',
  }),
  Object.freeze({
    id: 'S4_FALSE_ARTIFACT_INTERPRETABILITY',
    section: '§6 Gate S4',
    gap: 'an artifact whose decompressed text contains ANY parseable JSONL is declared INTERPRETABLE, so one arbitrary JSON object yields apparently measured zeros',
    baselineLocation: 'scripts/r3l0ciarlcf/cost-bridge.mjs:292 `if (records.length === 0)` — the ONLY content test',
    measured: 'an artifact whose single record is `{"type":"noise"}` is INTERPRETABLE and `reconstructCost` returns `rawHistoryArtifactsRead: 0`, indistinguishable from a genuine measured zero',
    property: 'an artifact must satisfy a minimal event envelope derived from the frozen format before the frozen `reconstructCost` is called; a claimed zero must come from a real Session Start and completion boundary, and an invalid observation satisfies neither CostMeasuredComplete nor LivePrimaryCostComplete',
    authoritativePath: 'scripts/r3l0ciarlcfs/artifact-validity.mjs validateArtifactEnvelope',
  }),
  Object.freeze({
    id: 'S5_AUTHORIZATION_VERDICT_INCONSISTENCY',
    section: '§7 Gate S5',
    gap: 'the authority verifier lists the absence of host spending enforcement among its problems, but the final VERIFIED branch does not require that enforcement, so a descriptive problem list and the verdict disagree',
    baselineLocation: 'scripts/r3l0ciarlcf/trust-boundary.mjs:246 (the problem is pushed) and :249-:251 (the verdict ignores it)',
    measured: 'a synthetically verified authority source yields `verified: true` while `ACTUAL_HOST_ENFORCED_BUDGET` is false, so the record is reported VERIFIED with an unsatisfied mandatory condition',
    property: 'every mandatory condition — schema validity, independently verified authority, committed plan identity, authorized scope, explicit monetary limit, PROVEN host spending enforcement and no false-or-unknown condition — is required by the same verdict the problem list describes',
    authoritativePath: 'scripts/r3l0ciarlcfs/authorization-verdict.mjs reduceAuthorizationVerdict',
  }),
]);

/** §0: the five gap ids, so the contract, the controls and the tests agree on the set. */
export const EVIDENCE_GAP_IDS = Object.freeze(EVIDENCE_GAPS.map((gap) => gap.id));

/* ================================================================ §3 Gate S1 plan identity */

/**
 * §3: THE FOUR PLAN-IDENTITY EQUALITIES, as data.
 *
 * §3 requires `P.planContentDigest === D(P)`, `Q.plan.planContentDigest === P.planContentDigest`,
 * `Q.planContentDigest.frozen === P.planContentDigest`, `E.plan.planContentDigest === P.planContentDigest` and
 * `E.planContentDigest.frozen === P.planContentDigest`, plus agreement of every recorded Plan ID and Execution
 * Closure Digest. Each is a named check so a report can show all of them rather than one collapsed MATCH.
 */
export const PLAN_IDENTITY_CHECKS = Object.freeze([
  Object.freeze({ id: 'COMMITTED_PLAN_SELF_DIGEST', detail: 'the committed plan file\'s recomputed full content digest equals the digest the file carries' }),
  Object.freeze({ id: 'COMMITTED_PLAN_GIT_IDENTITY', detail: 'the worktree plan file\'s bytes equal the committed Git blob, by blob-hash equality' }),
  Object.freeze({ id: 'QUALIFICATION_PLAN_REFERENCE', detail: 'the Qualification\'s plan object and its frozen reference both equal the committed plan digest' }),
  Object.freeze({ id: 'STAGE_RESULT_PLAN_REFERENCE', detail: 'the Stage Result\'s plan object and its frozen reference both equal the committed plan digest' }),
  Object.freeze({ id: 'PLAN_ID_AGREEMENT', detail: 'every recorded plan id equals the committed plan\'s id' }),
  Object.freeze({ id: 'PLAN_CLOSURE_AGREEMENT', detail: 'the execution closure bound by the committed plan equals the current recomputed closure' }),
]);

/** §3: the three separated plan operations. Construction may be provisional; freeze writes once; consumption never regenerates. */
export const PLAN_OPERATIONS = Object.freeze([
  Object.freeze({ id: 'PLAN_CONSTRUCTION', writesEvidence: false, detail: 'may produce a CANDIDATE plan before freeze, for pre-freeze development and tests outside the final evidence path' }),
  Object.freeze({ id: 'PLAN_FREEZE', writesEvidence: true, detail: 'writes the exact finalized plan ONCE, after every load-bearing module is stable, with its `frozenAt` fixed' }),
  Object.freeze({ id: 'PLAN_CONSUMPTION', writesEvidence: false, detail: 'reads and validates the already committed plan without regeneration; this is the operation the final Qualification must use' }),
]);

/* ================================================================ §4 Gate S2 cleanup safety */

/** §4: the cleanup outcomes, so a blocked cleanup is a named state rather than a silent success. */
export const CLEANUP_OUTCOMES = Object.freeze({
  CLEANED: 'CLEANED',
  CLEANUP_BLOCKED: 'CLEANUP_BLOCKED',
  REFUSED_NOT_OWNED: 'REFUSED_NOT_OWNED',
});

/** §4: the link kinds a disposable checkout may carry and must confirm removed. */
export const LINK_KINDS = Object.freeze(['junction', 'symlink', 'directory-symlink', 'file-symlink']);

/** §4: the ordered safety steps the cleanup must take, each a required observation. */
export const CLEANUP_SAFETY_STEPS = Object.freeze([
  'VERIFY_OWNERSHIP',
  'VERIFY_WITHIN_DISPOSABLE_ROOT',
  'ENUMERATE_LINKS_AND_UNEXPECTED_LINK_LIKE_ENTRIES',
  'CLASSIFY_BY_LSTAT_IDENTITY',
  'ATTEMPT_UNLINK_WITHOUT_TRAVERSING',
  'REINSPECT_EACH_LINK_PATH',
  'ABORT_IF_ANY_LINK_REMAINS_OR_IS_UNCLASSIFIABLE',
  'NEVER_FORCE_REMOVE_OR_RECURSE_AFTER_FAILURE',
  'PRESERVE_FOR_DIAGNOSIS_AND_REPORT_LOCATION',
  'RETURN_EXPLICIT_CLEANUP_BLOCKED',
]);

/* ================================================================ §5 Gate S3 trial identity */

/**
 * §5: THE COMPARISON SURFACE, derived from `TRIAL_RECORDED.payload.record` and the in-memory admitted record.
 *
 * §5 requires a rationale for every field INCLUDED or EXCLUDED, because "Do not blindly compare all runtime fields
 * if timestamps or intentionally different representations are not supposed to be byte-identical."
 */
export const TRIAL_IDENTITY_FIELDS = Object.freeze([
  Object.freeze({ field: 'sessionId', included: true, loadBearing: true, rationale: 'the primary key of the comparison; a different session id is a different trial, not a mismatch within one' }),
  Object.freeze({ field: 'block', included: true, loadBearing: true, rationale: 'the frozen scientific schedule identity — the paired-block assignment' }),
  Object.freeze({ field: 'arm', included: true, loadBearing: true, rationale: 'the frozen scientific schedule identity — the treatment arm; the exact field the S3-E mutation moves' }),
  Object.freeze({ field: 'generation', included: true, loadBearing: true, rationale: 'the frozen scientific schedule identity — G1/G2' }),
  Object.freeze({ field: 'trajectoryId', included: true, loadBearing: true, rationale: 'the frozen experimental unit identity — the ProjectTrajectory' }),
  Object.freeze({ field: 'executionClosureDigest', included: true, loadBearing: true, rationale: 'the runtime the trial actually ran under; a disagreement means the durable record describes different code from the observation' }),
  Object.freeze({ field: 'treatmentExpectationDigest', included: true, loadBearing: true, rationale: 'the treatment the trial was SUPPOSED to receive; a disagreement invalidates the treatment contrast' }),
  Object.freeze({ field: 'intendedExecutorRoute', included: true, loadBearing: true, rationale: 'the executor route the trial intended; a disagreement is a substituted execution path' }),
  Object.freeze({ field: 'hostJobId', included: true, loadBearing: true, rationale: 'the host job identity; a disagreement means the durable record and the observation describe different host work' }),
  Object.freeze({ field: 'attemptId', included: true, loadBearing: true, rationale: 'the canonical Work AttemptId, compared by EXACT normalization so a prefix collision is a conflict' }),
  Object.freeze({ field: 'contentDigests', included: true, loadBearing: true, rationale: 'the sidecar and content bindings; a disagreement means the durable record binds different evidence bytes' }),
  Object.freeze({ field: 'treatmentRealization', included: true, loadBearing: true, rationale: 'whether the treatment actually reached the consumer boundary; the S3-E mutation moves this' }),
  Object.freeze({ field: 'admission', included: true, loadBearing: true, rationale: 'the admission disposition; a durable ADMITTED record against an in-memory refusal is a conflict' }),
  Object.freeze({ field: 'reportPath', included: true, loadBearing: false, rationale: 'an evidence REFERENCE the frozen protocol records per trial; compared as a path identity, because a disagreement means the two records point at different reports' }),
  Object.freeze({ field: 'transcriptPath', included: true, loadBearing: false, rationale: 'an evidence REFERENCE the frozen protocol records per trial; compared as a path identity, for the same reason as reportPath' }),
  Object.freeze({ field: 'observations', included: false, loadBearing: false, rationale: 'EXCLUDED — the behavioural observation vector is carried only on the in-memory admitted record and is not journalled into `payload.record`, so comparing it would report a structural absence as a conflict' }),
  Object.freeze({ field: 'timestamps', included: false, loadBearing: false, rationale: 'EXCLUDED — `recordedAt` is stamped at journal time and `launchedAt` at launch time, so the durable and in-memory copies are intentionally different instants' }),
  Object.freeze({ field: 'workerUptakeCount', included: false, loadBearing: false, rationale: 'EXCLUDED — the worker uptake count is an in-memory-only annotation, not a durable journal field' }),
  Object.freeze({ field: 'hostResolveAuditCount', included: false, loadBearing: false, rationale: 'EXCLUDED — the host resolve audit count is an in-memory-only annotation, not a durable journal field' }),
]);

/** §5: the identity states, kept separate, because a pair of matching nulls is not independently verified identity. */
export const IDENTITY_STATES = Object.freeze({
  SAME_VERIFIED_IDENTITY: 'SAME_VERIFIED_IDENTITY',
  BOTH_EXPLICITLY_ABSENT: 'BOTH_EXPLICITLY_ABSENT',
  ONE_ABSENT: 'ONE_ABSENT',
  CONFLICTING_IDENTITIES: 'CONFLICTING_IDENTITIES',
});

/** §5: the reconciliations the adapter must perform. */
export const REQUIRED_RECONCILIATIONS = Object.freeze([
  Object.freeze({ id: 'FROZEN_SCHEDULE_TO_DURABLE', detail: 'the frozen schedule identity against the durable session identity' }),
  Object.freeze({ id: 'DURABLE_TO_IN_MEMORY', detail: 'the durable Trial against the in-memory admitted Trial' }),
  Object.freeze({ id: 'DURABLE_TO_SIDECAR_DIGEST', detail: 'the durable Trial against its sidecar digest binding' }),
  Object.freeze({ id: 'DURABLE_ATTEMPT_TO_SIDECAR_ATTEMPT', detail: 'the durable AttemptId against the sidecar AttemptId' }),
  Object.freeze({ id: 'DURABLE_HOSTJOB_TO_AUTHENTIC', detail: 'the durable HostJobId against the sidecar or authentic host evidence when available' }),
  Object.freeze({ id: 'DURABLE_CLOSURE_TO_PLAN_BOUND', detail: 'the durable execution closure against the plan-bound closure' }),
  Object.freeze({ id: 'TREATMENT_REALIZATION_TO_EXPECTED', detail: 'the treatment realization against the frozen expected treatment evidence' }),
]);

/* ================================================================ §6 Gate S4 artifact validity */

/**
 * §6: THE MINIMAL VALIDITY ENVELOPE, derived from the frozen instrumentation's actual format.
 *
 * §6: "Derive the minimal validity envelope from this actual format and the frozen study semantics. Do not invent
 * additional requirements unrelated to the measured endpoints." The frozen `reconstructCost` reads `turn/start` for
 * the wall-clock origin, `tool/ptc-dispatch` for the counted actions and the Result submission for the completion
 * boundary. So the envelope is: at least one parseable record; a Session Start observation; and a completion
 * observation appropriate to the claimed endpoint.
 */
export const ARTIFACT_ENVELOPE = Object.freeze({
  requiredRecordTypes: Object.freeze(['turn/start']),
  completionRecordTypes: Object.freeze(['turn/end']),
  resultDispatchTool: 'palimpsest_worker_result',
  dispatchRecordType: 'tool/ptc-dispatch',
  minRecords: 1,
  law: 'an artifact is interpretable only when it carries a Session Start observation and a completion boundary appropriate to the claimed endpoint; a claimed zero must come from a real observation rather than from a parser that did not throw',
});

/** §6: the artifact validity states, each its own named fact. */
export const ARTIFACT_VALIDITY_STATES = Object.freeze([
  Object.freeze({ id: 'VALID_MEASURED', interpretable: true, detail: 'readable, envelope-valid, with the relevant completion boundary observed' }),
  Object.freeze({ id: 'VALID_MEASURED_ZERO', interpretable: true, detail: 'readable and envelope-valid with a real Session Start and completion boundary, and zero corpus reads — a genuine measured zero' }),
  Object.freeze({ id: 'UNREADABLE', interpretable: false, detail: 'the artifact could not be decompressed' }),
  Object.freeze({ id: 'MALFORMED', interpretable: false, detail: 'the artifact decompressed to content that parses to no records, or to truncated/corrupted JSONL' }),
  Object.freeze({ id: 'ENVELOPE_INVALID', interpretable: false, detail: 'parseable JSONL that lacks the minimum events the frozen study\'s cost definitions require' }),
  Object.freeze({ id: 'COMPLETION_NOT_OBSERVED', interpretable: false, detail: 'a Session Start exists but the endpoint observation the measurement claims was never reached' }),
]);

/** §6: what an invalid observation must NOT satisfy. */
export const COST_COMPLETENESS_LEVELS = Object.freeze([
  Object.freeze({ id: 'CostAccountingComplete', detail: 'every planned session has an explicit measurement or an explicit absence classification' }),
  Object.freeze({ id: 'CostMeasuredComplete', detail: 'every required session has a VALIDATED cost observation' }),
  Object.freeze({ id: 'LivePrimaryCostComplete', detail: 'every required session has a real PRIMARY cost observation with verified execution provenance' }),
]);

/* ================================================================ §7 Gate S5 authorization */

/**
 * §7: THE MANDATORY AUTHORIZATION CONDITIONS, kept separate, every one required by the verdict.
 *
 * §7: "For a genuine future paid authorization, every mandatory condition must be satisfied. A source outside the
 * repository is not automatically a trusted authority. A declared-only monetary ceiling is not enforced spending
 * control."
 */
export const AUTHORIZATION_CONDITIONS = Object.freeze([
  Object.freeze({ id: 'SCHEMA_VALIDITY', mandatory: true, detail: 'the authorization record is structurally valid' }),
  Object.freeze({ id: 'EXTERNALLY_VERIFIED_AUTHORITY', mandatory: true, detail: 'the authority is independently verified against a separately controlled source' }),
  Object.freeze({ id: 'APPROVED_PLAN_ID_MATCH', mandatory: true, detail: 'the approved Plan ID matches the committed Plan' }),
  Object.freeze({ id: 'APPROVED_FULL_PLAN_DIGEST_MATCH', mandatory: true, detail: 'the approved Full Plan Digest matches the committed Plan' }),
  Object.freeze({ id: 'AUTHORIZED_SESSION_SCOPE', mandatory: true, detail: 'the authorized session scope covers the frozen schedule' }),
  Object.freeze({ id: 'EXPLICIT_MONETARY_LIMIT', mandatory: true, detail: 'the monetary authorization is sufficiently explicit' }),
  Object.freeze({ id: 'PROVEN_HOST_SPEND_ENFORCEMENT', mandatory: true, detail: 'required Host/Provider spending enforcement is proven' }),
  Object.freeze({ id: 'NO_FALSE_OR_UNKNOWN_CONDITION', mandatory: true, detail: 'no mandatory authorization condition is false or unknown' }),
]);

/** §7: the authorization verdict vocabulary. */
export const AUTHORIZATION_VERDICTS = Object.freeze({
  VERIFIED: 'AUTHORIZATION_VERIFIED',
  REFUSED: 'AUTHORIZATION_REFUSED',
  NOT_ESTABLISHED: 'AUTHORITY_NOT_ESTABLISHED',
});

/** §7: the five separated budget/authority concepts the reducer must not collapse. */
export const AUTHORITY_CONCEPTS = Object.freeze([
  'SCHEMA_VALIDITY', 'EXTERNALLY_VERIFIED_AUTHORITY', 'COMMITTED_FULL_PLAN_IDENTITY',
  'AUTHORIZED_SESSION_SCOPE', 'AUTHORIZED_MONETARY_LIMIT', 'ACTUAL_HOST_SPEND_ENFORCEMENT',
  'CURRENT_LAUNCH_PERMISSION',
]);

/* ================================================================ §8 integration */

/**
 * §8: THE LEGACY HELPER QUARANTINE.
 *
 * §4: "The previous stage's `isolated-mutation.mjs` contains the unsafe fallback sequence. Do not use this helper
 * from the new stage. Declare it superseded for the new stage's safety-sensitive mutation operations. However, a
 * stage-owned replacement does not make the historical helper physically unexecutable. Report that limitation
 * explicitly."
 */
export const LEGACY_HELPER_QUARANTINE = Object.freeze({
  helper: 'scripts/r3l0ciarlcf/isolated-mutation.mjs',
  function: 'destroyIsolatedCheckout',
  disposition: 'SUPERSEDED for this stage\'s safety-sensitive mutation operations',
  replacedBy: 'scripts/r3l0ciarlcfs/safe-cleanup.mjs destroyDisposableCheckout',
  physicallyUnexecutable: false,
  quarantineIsAGuardNotAnImpossibility: true,
  forbiddenClaim: 'do not claim the historical helper has become physically unexecutable merely because the new stage does not call it',
  stillCallableBy: 'the frozen R3-L0C-I-A-R-L-C-F qualification and its tests, which this stage does not rewrite',
});

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
  law: 'the purpose of this stage is evidence identity and execution safety, not a scientific design change',
});

/* ================================================================ §12 the verdicts and readiness */

/** §12: the nineteen final verdicts and their vocabularies. */
export const FINAL_VERDICTS = Object.freeze({
  COMMITTED_PLAN_SELF_DIGEST: Object.freeze(['MATCH', 'DRIFTED', 'NOT_ESTABLISHED']),
  COMMITTED_PLAN_GIT_IDENTITY: Object.freeze(['MATCH', 'DRIFTED', 'NOT_ESTABLISHED']),
  CROSS_ARTIFACT_PLAN_BINDING: Object.freeze(['MATCH', 'MISMATCH', 'NOT_ESTABLISHED']),
  PRIMARY_PLAN_PREFLIGHT_INTEGRITY: Object.freeze(['PASS', 'FAIL', 'NOT_ESTABLISHED']),
  SAFE_WORKTREE_CLEANUP: Object.freeze(['PASS', 'FAIL', 'BLOCKED']),
  LEGACY_UNSAFE_HELPER_QUARANTINED: Object.freeze(['PASS', 'FAIL', 'DISCLOSED']),
  DURABLE_TRIAL_EVIDENCE_IDENTITY: Object.freeze(['PASS', 'FAIL']),
  ARTIFACT_EVENT_ENVELOPE_VALIDITY: Object.freeze(['PASS', 'FAIL']),
  GENUINE_MEASURED_ZERO_DISTINCTION: Object.freeze(['PASS', 'FAIL']),
  AUTHORIZATION_CONDITION_CONSISTENCY: Object.freeze(['PASS', 'FAIL']),
  HOST_SPEND_ENFORCEMENT: Object.freeze(['PASS', 'NOT_ESTABLISHED']),
  EXECUTION_CLOSURE: Object.freeze(['MATCH', 'DRIFTED']),
  HISTORICAL_EVIDENCE_IMMUTABILITY: Object.freeze(['PASS', 'FAIL']),
  DETERMINISTIC_MEASUREMENT_QUALIFICATION: Object.freeze(['PASS', 'FAIL']),
  REAL_DSH_ARTIFACT_COMPATIBILITY: Object.freeze(['PASS', 'NOT_ESTABLISHED']),
  LIVE_PRIMARY_PROVENANCE: Object.freeze(['PASS', 'NOT_ESTABLISHED']),
  EXTERNAL_AUTHORITY: Object.freeze(['PASS', 'NOT_ESTABLISHED']),
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

/** §12: the readiness statements, which §12 requires to be kept SEPARATE rather than collapsed. */
export const READINESS_STATEMENTS = Object.freeze([
  Object.freeze({ id: 'DETERMINISTIC_MEASUREMENT_QUALIFIED', detail: 'the deterministic measurement machinery is qualified by this stage\'s gates' }),
  Object.freeze({ id: 'CROSS_ARTIFACT_EVIDENCE_SEALED', detail: 'the committed plan, the Qualification and the Stage Result carry one plan identity' }),
  Object.freeze({ id: 'REAL_ARTIFACT_COMPATIBILITY_ESTABLISHED', detail: 'an authentic current-run DSH artifact was discovered and attributed' }),
  Object.freeze({ id: 'PRIMARY_EXECUTION_AUTHORIZED', detail: 'an independently verified external authorization with proven spending enforcement exists' }),
  Object.freeze({ id: 'PRIMARY_CAUSAL_DATA_AVAILABLE', detail: 'live PRIMARY cost observations exist for the frozen scope' }),
]);

/* ================================================================ §11 the commits and the stop */

/** §11: the commit structure this stage follows. */
export const COMMIT_STRUCTURE = Object.freeze([
  'test(r3-l0c-iar-lcfs): freeze the failing evidence-seal and safety controls',
  'fix(r3-l0c-iar-lcfs): seal the committed plan, fail closed on cleanup, extend the trial identity, validate the artifact envelope, unify the authorization verdict',
  'test(r3-l0c-iar-lcfs): prove the cross-artifact seal and the authoritative-entry refusals',
  'research(r3-l0c-iar-lcfs): freeze the superseding prospective plan once',
  'research(r3-l0c-iar-lcfs): qualify against the committed plan and commit the sealed evidence',
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
  paidExecution: 'NOT_RUN',
  primaryAuthorization: 'NOT_ESTABLISHED',
  realPrimaryCausalResult: 'NOT_EVALUABLE',
  ranPaidMatrix: false,
  beganR3L1: false,
  beganFusion: false,
  modelCallsMade: 0,
  enteredPrimaryExecution: false,
  law: 'PAID_EXECUTION = NOT_RUN, PRIMARY_AUTHORIZATION = NOT_ESTABLISHED and REAL_PRIMARY_CAUSAL_RESULT = NOT_EVALUABLE, then STOP',
});

/** A one-line summary, for a report header. */
export function contractSummary() {
  return Object.freeze({
    stage: 'R3-L0C-I-A-R-L-C-F-S',
    kind: 'frozen evidence seal and safety closure contract',
    baseline: BASELINE_COMMIT,
    planId: PLAN_ID,
    gaps: EVIDENCE_GAPS.length,
    planIdentityChecks: PLAN_IDENTITY_CHECKS.length,
    trialIdentityFields: TRIAL_IDENTITY_FIELDS.length,
    reconciliations: REQUIRED_RECONCILIATIONS.length,
    authorizationConditions: AUTHORIZATION_CONDITIONS.length,
    verdicts: Object.keys(FINAL_VERDICTS).length,
    readinessStatements: READINESS_STATEMENTS.length,
    modelCallsMade: STAGE_STOP.modelCallsMade,
    newline: NL,
  });
}

export { NL };
