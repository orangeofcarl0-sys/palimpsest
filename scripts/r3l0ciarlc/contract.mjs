/**
 * R3-L0C-I-A-R-L-C §0-§10 — THE AUTHORITATIVE CAUSAL ADMISSION CLOSURE CONTRACT.
 *
 * This module is this stage's FROZEN SEMANTICS, committed before any correction exists. It records, as values
 * rather than prose, the four gates the ruling names, the evidence each one binds, and the eleven final verdicts.
 *
 * THE INVARIANT THIS STAGE IS ABOUT, quoted from the ruling because every gate below is one reading of it:
 *
 *     An observation is not an admitted measurement, and a measured condition is not an enforced admission
 *     condition until it actually controls the authoritative terminal decision.
 *
 * WHY A NEW NAMESPACE. The prior stage's committed evidence (`research-evidence/r3-l0c-iar-l/`) and its plan
 * (`r3-l0c-iar-l-primary-plan`) describe `scripts/r3l0ciarl/**` as it stood at `6089947`. Editing those modules in
 * place would make that record describe code that no longer exists. So this stage SUPERSEDES the R3-L0C-I-A-R-L
 * modules with its own, leaves them byte-identical, and binds a freshly computed closure into a NEW plan in a NEW
 * evidence namespace.
 *
 * WHAT THIS STAGE IS NOT. §0 forbids model calls. It is a bounded corrective stage about whether the authoritative
 * Fail-Stop Runner can complete a valid matrix or admit causal evidence when a required measurement is missing,
 * corrupted, stale, substituted or unverified — not a new architecture and not a benchmark stage. `src/**`,
 * `host/**`, the frozen corpus, the capital, the oracle, the randomization, the treatment, the endpoints and the
 * thresholds are untouched.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

const NL = String.fromCharCode(10);

/** §0: the exact baseline this stage starts from. */
export const BASELINE_COMMIT = '6089947c40dab2c8c67106f1f7ee1fb1c41ac1ad';

/** §0: the stage branch. */
export const STAGE_BRANCH = 'r3-l0c-iar-lc-admission-closure';

/** §0: this stage's own code namespace. */
export const STAGE_CODE_PATH = 'scripts/r3l0ciarlc';

/** §0: this stage's own evidence namespace. The ONLY place it may add under `research-evidence/`. */
export const STAGE_EVIDENCE_PATH = 'research-evidence/r3-l0c-iar-lc';

/** §0: the prior stage, whose code and evidence this stage supersedes but never edits. */
export const SUPERSEDED_STAGE = Object.freeze({
  stage: 'R3-L0C-I-A-R-L',
  commit: BASELINE_COMMIT,
  planId: 'r3-l0c-iar-l-primary-plan',
  planPath: 'research-evidence/r3-l0c-iar-l/execution-plan.json',
  codePath: 'scripts/r3l0ciarl',
  pipeline: 'scripts/r3l0ciarl/pipeline.mjs',
  disposition: 'SUPERSEDED — byte-identical, no longer the authorized entry point',
});

/** §0: the prior evidence namespaces, read but never written by this stage. */
export const PRIOR_EVIDENCE_PATHS = Object.freeze([
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

/* ================================================================ §3-§6 the four gates */

/** §3-§6: the four gate ids, so the contract, the controls and the tests agree on the set. */
export const CONTROL_GATE_IDS = Object.freeze([
  'LC_A_DURABLE_COST_BRIDGE',
  'LC_B_POSTMATRIX_ADMISSION',
  'LC_C_PRIMARY_TRUST_BOUNDARY',
  'LC_D_INRUN_ATTESTATION',
]);

/**
 * §3-§6: THE FOUR GATES, EACH WITH THE DEFECT IT CORRECTS.
 *
 * Each records the FILE and LINE where the R3-L0C-I-A-R-L behaviour lives and the exact function that was measured
 * to produce it, so a reader can verify the defect rather than take the control's word for it. `property` is what
 * the correction must make true; `authoritativePath` is the function the correction must live inside.
 */
export const CORRECTION_GATES = Object.freeze([
  Object.freeze({
    id: 'LC_A_DURABLE_COST_BRIDGE',
    section: '§3 Gate A',
    gap: 'the durable TRIAL_RECORDED record binds a live-evidence sidecar by digest, but the matrix cost measurement consumes `record.sessionArtifactPath`, which the frozen admitted record does not carry — so a genuine journal readback cannot reconstruct or attribute a non-null cost',
    baselineLocation: 'scripts/r3l0ciarl/pipeline.mjs:505-543 measureRunCost reads `record.sessionArtifactPath ?? null`; scripts/r3l0cf/journal.mjs:193 buildGenerationRecord builds the frozen JOURNAL_FIELDS, which omit sessionArtifactPath; measured: every session yields measured:false with fields:null',
    property: 'a genuine durable journal readback reconstructs and attributes the reconstruction cost of a real artifact, by resolving the sidecar binding the record carries and verifying the artifact digest and the session/attempt/host-job identity',
    authoritativePath: 'scripts/r3l0ciarlc/cost-bridge.mjs bridgeMatrixCost',
  }),
  Object.freeze({
    id: 'LC_B_POSTMATRIX_ADMISSION',
    section: '§4 Gate B',
    gap: 'the fresh postflight runs AFTER runFailStopMatrix has already decided whether to record MATRIX_COMPLETED, so a post-preflight runtime drift is detected but does not prevent completion; there is no single authoritative terminal-admission reducer',
    baselineLocation: 'scripts/r3l0ciarl/pipeline.mjs:414-453 runFailStopMatrix returns MATRIX_COMPLETE and only THEN is freshPostflight called',
    property: 'the authoritative terminal decision is ONE reducer inside the runner\'s validityGate callback: it reads the durable journal with the frozen integrity-aware reader, verifies the frozen identities and launch cardinalities, verifies sidecar continuity and cost attribution, recomputes the closure and the effective route, verifies the current runtime attestation, and evaluates the frozen post-matrix requirements — returning GREEN or an explicit RED',
    authoritativePath: 'scripts/r3l0ciarlc/postmatrix-admission.mjs authoritativeTerminalAdmission',
  }),
  Object.freeze({
    id: 'LC_C_PRIMARY_TRUST_BOUNDARY',
    section: '§5 Gate C',
    gap: 'the authorization verifier recognises a `decision:`-prefixed string as authority and accepts a one-session budget, so a fabricated decision reference with an inadequate budget verifies; and PRIMARY caller inputs include trusted execution-environment values',
    baselineLocation: 'scripts/r3l0ciarl/primary-binding.mjs:79 the authority check is `/^decision:/`; :90 requires only a positive maxSessions; measured: authority "decision:totally-made-up-by-the-caller" with maxSessions 1 verified:true',
    property: 'schema validity, externally verified authority, authorized full prospective plan, enforceable budget and current launch permission are separate; a syntactically valid decision is not trusted authority; the plan binding is a content digest separate from ExecutionClosureDigest and free of self-reference; the budget must cover the frozen 16-session scope; trusted execution-environment values come from a trusted host configuration',
    authoritativePath: 'scripts/r3l0ciarlc/trust-boundary.mjs verifyExternalAuthority',
  }),
  Object.freeze({
    id: 'LC_D_INRUN_ATTESTATION',
    section: '§6 Gate D',
    gap: 'the matrix path establishes no verified post-installation baseline and does not recheck it as a mandatory terminal condition; and competing-writer detection is SUPPRESSED whenever installedDuringRun is true, which is exactly the case where this stage installs',
    baselineLocation: 'scripts/r3l0ciarl/attestation.mjs:137-151 competingWriterVerdict returns competingWriterDetected:false when installedDuringRun===true; scripts/r3l0ciarl/pipeline.mjs takes one sample before the matrix and never rechecks it as an admission condition',
    property: 'three measurement points — S0 before the run\'s own installation, S1 after installation and before the matrix, S2 after the matrix and before final admission; S1 matches the expected installed repository bundle, S2 matches S1, and a competing writer is detected from S2 versus S1 regardless of installedDuringRun',
    authoritativePath: 'scripts/r3l0ciarlc/attestation.mjs inRunAttestation',
  }),
]);

/* ================================================================ §3 Gate A the cost bridge */

/**
 * §3: THE NINE OUTCOMES THE COST BRIDGE MUST DISTINGUISH.
 *
 * A field that was not measured must never be replaced with an invented zero, and a legitimate measured zero must
 * remain distinguishable from missing evidence. These are the states, as values, so the bridge and the tests agree.
 */
export const COST_BRIDGE_OUTCOMES = Object.freeze([
  Object.freeze({ id: 'ARTIFACT_ABSENT', measured: false, provenance: null, detail: 'the sidecar names an artifact path and no file exists there' }),
  Object.freeze({ id: 'SIDECAR_ABSENT', measured: false, provenance: null, detail: 'the durable record binds no sidecar, or no sidecar exists for the session' }),
  Object.freeze({ id: 'SIDECAR_DIGEST_MISMATCH', measured: false, provenance: null, detail: 'the sidecar bytes no longer hash to the digest the durable record binds' }),
  Object.freeze({ id: 'ARTIFACT_DIGEST_MISMATCH', measured: false, provenance: null, detail: 'the artifact bytes no longer hash to the digest the sidecar recorded' }),
  Object.freeze({ id: 'IDENTITY_CONFLICT', measured: false, provenance: null, detail: 'the artifact path or the host evidence contradicts the session/attempt/host-job identity' }),
  Object.freeze({ id: 'AMBIGUOUS_ARTIFACTS', measured: false, provenance: null, detail: 'more than one artifact could be attributed to the session, and choosing by recency would be a convenience' }),
  Object.freeze({ id: 'UNINTERPRETABLE_ARTIFACT', measured: false, provenance: null, detail: 'the artifact exists but the frozen instrumentation cannot reconstruct a cost from it' }),
  Object.freeze({ id: 'MEASURED_FIXTURE', measured: true, provenance: 'FIXTURE', detail: 'a non-primary execution\'s artifact was measured and labelled as a fixture' }),
  Object.freeze({ id: 'VERIFIED_LIVE_PRIMARY', measured: true, provenance: 'LIVE_PRIMARY', detail: 'a primary execution\'s artifact was measured, with the primary route and the artifact digest both verified' }),
]);

/** §3: the provenance vocabulary, so a fixture measurement is never read as a live causal observation. */
export const BRIDGE_PROVENANCE = Object.freeze({ LIVE_PRIMARY: 'LIVE_PRIMARY', FIXTURE: 'FIXTURE', ABSENT: 'ABSENT' });

/**
 * §3: WHAT VERIFIES A LIVE_PRIMARY PROVENANCE.
 *
 * File existence and a caller-provided `mode` label are explicitly insufficient. A provenance is LIVE_PRIMARY only
 * when EVERY one of these holds, and the basis is carried on the result so a reader can see which did:
 *
 *   · the record's own `intendedExecutorRoute` names the frozen primary route, not the deterministic scripted one;
 *   · the sidecar's mode is PRIMARY;
 *   · the artifact exists AND its bytes hash to the digest the sidecar recorded.
 */
export const LIVE_PRIMARY_EVIDENCE = Object.freeze({
  required: Object.freeze(['recordRouteIsPrimary', 'sidecarModeIsPrimary', 'artifactDigestVerified']),
  modeLabelAloneIsInsufficient: true,
  fileExistenceAloneIsInsufficient: true,
  law: 'provenance is derived from verified execution evidence — the record\'s intended route, the sidecar\'s mode and a verified artifact digest — never from a caller-supplied label',
});

/** §3: the frozen cost instrumentation this stage reuses rather than reimplements. */
export const COST_INSTRUMENTATION = Object.freeze({
  reader: 'scripts/r3l0cf/journal.mjs readJournal',
  measure: 'scripts/r3l0c/instrumentation.mjs reconstructCost',
  journalFieldsModified: false,
  newCanonicalArtifactStoreCreated: false,
  newCanonicalCostStoreCreated: false,
  law: 'the bridge reuses the frozen journal reader and the existing reconstruction-cost instrumentation; it adds no field to JOURNAL_FIELDS and creates no canonical store',
});

/* ================================================================ §4 Gate B the terminal admission */

/**
 * §4: THE AUTHORITATIVE TERMINAL-ADMISSION CONDITIONS.
 *
 * Every one is mandatory inside the runner's `validityGate` callback, BEFORE the runner writes its completion
 * decision. A failure yields an explicit RED, so a postflight failure is visible at the decision point rather
 * than only after the fact.
 */
export const TERMINAL_ADMISSION_CONDITIONS = Object.freeze([
  Object.freeze({ id: 'JOURNAL_TRUSTWORTHY', detail: 'the durable journal is intact — no torn tail and no write left in flight' }),
  Object.freeze({ id: 'IDENTITIES_EXACT', detail: 'exactly the frozen sessions are present, each with its exact block/arm/generation/trajectory' }),
  Object.freeze({ id: 'LAUNCH_CARDINALITY_EXACT', detail: 'exactly one launch per planned session and no unplanned launch' }),
  Object.freeze({ id: 'SIDECAR_CONTINUITY', detail: 'every session\'s live-evidence sidecar survived into the durable record, digest-verified' }),
  Object.freeze({ id: 'COST_ATTRIBUTION', detail: 'every session\'s cost is either measured or carries an explicit labelled absence, and no session is silently dropped' }),
  Object.freeze({ id: 'CLOSURE_FRESH_MATCH', detail: 'the closure recomputed at terminal admission still matches the plan' }),
  Object.freeze({ id: 'ROUTE_FRESH_MATCH', detail: 'the effective route recomputed at terminal admission still matches the plan' }),
  Object.freeze({ id: 'RUNTIME_ATTESTED', detail: 'the current runtime attestation holds: S1 matches the expected bundle and S2 matches S1' }),
  Object.freeze({ id: 'FROZEN_POSTMATRIX_VALIDITY', detail: 'the frozen nine-condition post-matrix validity gate is green' }),
]);

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

/* ================================================================ §5 Gate C the trust boundary */

/**
 * §5: THE FIVE SEPARATE CONCEPTS.
 *
 * The whole of Gate C is that these are not one thing. A record may be schema-valid and still not be trusted; a
 * trusted authority may exist and still not permit a launch in this stage.
 */
export const TRUST_CONCEPTS = Object.freeze([
  Object.freeze({ id: 'SCHEMA_VALIDITY', detail: 'the record carries every required field with a well-formed shape' }),
  Object.freeze({ id: 'EXTERNALLY_VERIFIED_AUTHORITY', detail: 'the authority resolves against a separately controlled trusted source' }),
  Object.freeze({ id: 'AUTHORIZED_PROSPECTIVE_PLAN', detail: 'the record binds the complete frozen prospective plan by a content digest' }),
  Object.freeze({ id: 'ENFORCEABLE_BUDGET', detail: 'the budget covers the frozen scope AND the host can enforce it' }),
  Object.freeze({ id: 'CURRENT_LAUNCH_PERMISSION', detail: 'the launch boundary is open for this run right now' }),
]);

/** §5: the authority trust verdicts. */
export const AUTHORITY_TRUST = Object.freeze({
  VERIFIED: 'VERIFIED',
  NOT_ESTABLISHED: 'AUTHORITY_NOT_ESTABLISHED',
  PENDING: 'PENDING',
  REFUSED: 'REFUSED',
  thisStageProvidesAuthorization: false,
  syntacticallyValidDecisionIsTrustedAuthority: false,
  law: 'a syntactically valid `decision:` string is not externally verified authority; with no trusted source this stage returns AUTHORITY_NOT_ESTABLISHED and keeps the PRIMARY launch prohibited',
});

/** §5: what an authorization record must carry. */
export const AUTHORIZATION_RECORD_FIELDS = Object.freeze([
  'authority', 'approvedPlanId', 'approvedPlanDigest', 'paidRunBudget', 'decisions',
]);

/** §5: the five fail-stop decisions an authorization must name. */
export const AUTHORIZATION_REQUIREMENTS = Object.freeze([
  Object.freeze({ id: 'PAID_MODEL_USAGE', detail: 'paid model usage' }),
  Object.freeze({ id: 'BOUNDED_FAIL_STOP_PROTOCOL', detail: 'the bounded fail-stop protocol' }),
  Object.freeze({ id: 'NO_AUTOMATIC_RETRIES_OR_REPLACEMENTS', detail: 'no automatic retries or replacement sessions' }),
  Object.freeze({ id: 'PRESERVE_PARTIALLY_COMPLETED_INVALID_RUNS', detail: 'preservation of partially completed invalid runs' }),
  Object.freeze({ id: 'ACCEPTED_PROMPT_NEUTRALITY_LIMITED', detail: 'the accepted PROMPT_NEUTRALITY = LIMITED constraint' }),
]);

/** §5: the frozen session scope a budget must cover. */
export const FROZEN_SESSION_SCOPE = 16;

/**
 * §5: THE TRUSTED EXECUTION-ENVIRONMENT VALUES.
 *
 * These are the values a PRIMARY run must NOT take from its caller. §5: "Move trusted execution-environment
 * values into a trusted host configuration or a comparably restrictive boundary." They are resolved from the
 * HOST's own environment and the repository's own installer — a boundary the invocation does not control — so the
 * restriction is a trusted source rather than a growing blacklist of measurement properties.
 */
export const TRUSTED_HOST_INPUTS = Object.freeze(['dshHome', 'installHostBundle', 'verifyCompiled']);

/**
 * §5: THE INPUTS A PRIMARY RUN MAY NOT SUBSTITUTE WITH CALLER OBJECTS.
 *
 * THREE CATEGORIES, kept separate because conflating them is itself a defect — an over-broad list would refuse the
 * frozen experimental inputs a legitimate PRIMARY run must supply, which makes the boundary untestable:
 *
 *   PRIMARY_DERIVED_INPUTS   measurements the pipeline DERIVES; a caller value is a substituted measurement
 *   TRUSTED_HOST_INPUTS      execution-environment values; a caller value is refused and the trusted boundary used
 *   PRIMARY_FORBIDDEN_SEAMS  execution-configuration substitutes: fault injection and an outer timeout budget
 *
 * The EXPERIMENTAL_INPUTS below are NOT in the list: the frozen prehistory, the admitted capital refs, the run
 * identity and the artifact output root are the experiment's own inputs, and a PRIMARY run supplies them. An
 * artifact root only says WHERE to look; the artifact's bytes are digest-verified against the sidecar, so a
 * caller-supplied path cannot fabricate a measurement.
 */
export const PRIMARY_DERIVED_INPUTS = Object.freeze([
  'plan', 'planPath', 'closure', 'preExposureChecks', 'validityGate', 'costAttribution', 'costProvenance',
  'routeConfiguration', 'realizationPreflight', 'replacements', 'retries', 'systemValid', 'containment',
  'expectedPlanId',
  /** §3/§4: the DETERMINISTIC-only seams, so an injected artifact or a recomputation cannot enter a PRIMARY run. */
  'artifactFixture', 'terminalRecompute', 'terminalCompiledVerification',
]);

/** §5: the execution-configuration substitutes a PRIMARY run may not supply. */
export const PRIMARY_FORBIDDEN_SEAMS = Object.freeze(['faultAt', 'faultKind', 'timeoutMs']);

/** §5: the frozen experimental inputs a PRIMARY run legitimately supplies. */
export const EXPERIMENTAL_INPUTS = Object.freeze(['prehistory', 'admittedRefs', 'artifactRoot', 'runId', 'runRoot', 'profileId']);

/** §5: every input refused in PRIMARY, as one set, so the binding check and the report agree. */
export const PRIMARY_REFUSED_INPUTS = Object.freeze([...PRIMARY_DERIVED_INPUTS, ...TRUSTED_HOST_INPUTS, ...PRIMARY_FORBIDDEN_SEAMS]);

/** §3/§4: the seams that exist ONLY so a deterministic test can drive the gate, refused in PRIMARY by the list above. */
export const DETERMINISTIC_ONLY_SEAMS = Object.freeze(['artifactFixture', 'terminalRecompute', 'terminalCompiledVerification']);

/* ================================================================ §6 Gate D the in-run attestation */

/** §6: the three measurement points. */
export const ATTESTATION_POINTS = Object.freeze([
  Object.freeze({ id: 'S0', when: 'before the run\'s own bundle installation', compared: 'nothing — recorded so the sequence is auditable' }),
  Object.freeze({ id: 'S1', when: 'after installation and before matrix execution', compared: 'the expected installed repository bundle' }),
  Object.freeze({ id: 'S2', when: 'after the matrix and before final validity admission', compared: 'S1' }),
]);

/** §6: the attestation rules, each of which is a correction to the baseline. */
export const ATTESTATION_RULES = Object.freeze({
  s1MustMatchExpectedBundle: true,
  s2MustMatchS1: true,
  s0ToS2IsNotTheCompetingWriterTest: true,
  installedDuringRunDoesNotSuppressDetection: true,
  skippedCompiledVerificationIsNotPrimaryPass: true,
  outsideAttestedClosureIsDisclosed: true,
  installerIsMitigationNotProof: true,
  law: 'the competing-writer test compares S2 against S1 — the post-installation baseline — so this run\'s own installation cannot mask another writer\'s change',
});

/* ================================================================ §7 the closure */

/** §7: the mutation arms the closure must demonstrate, each named so the report can quote it. */
export const CLOSURE_MUTATION_ARMS = Object.freeze([
  'NEW_STAGE_PIPELINE_MODULE',
  'REUSED_PRIOR_ADMISSION_MODULE',
  'RUNTIME_MANIFEST_DYNAMIC_MODULE',
  'EXECUTION_CONFIGURATION_OR_TOOLCHAIN',
]);

/* ================================================================ §10 the verdicts */

/** §10: the eleven final verdicts and their vocabularies. */
export const FINAL_VERDICTS = Object.freeze({
  DURABLE_COST_BRIDGE: Object.freeze(['PASS', 'FAIL']),
  POSTMATRIX_ADMISSION: Object.freeze(['PASS', 'FAIL']),
  PRIMARY_INPUT_INTEGRITY: Object.freeze(['PASS', 'FAIL']),
  AUTHORITY_TRUST_BOUNDARY: Object.freeze(['PASS', 'FAIL']),
  IN_RUN_ATTESTATION: Object.freeze(['PASS', 'FAIL']),
  FAIL_STOP_VALIDITY: Object.freeze(['PASS', 'FAIL']),
  EXECUTION_CLOSURE: Object.freeze(['MATCH', 'DRIFTED']),
  HISTORICAL_EVIDENCE_IMMUTABILITY: Object.freeze(['PASS', 'FAIL']),
  PAID_AUTHORIZATION: Object.freeze(['PENDING', 'GRANTED', 'AUTHORITY_NOT_ESTABLISHED']),
  PAID_EXECUTION: Object.freeze(['NOT_RUN', 'RUN']),
  CAUSAL_RESULT: Object.freeze(['NOT_EVALUABLE', 'EVALUABLE']),
});

/** §10: the verdicts this stage cannot legitimately promote, carried as values. */
export const UNEARNED_VERDICTS = Object.freeze({
  PAID_AUTHORIZATION: 'PENDING',
  PAID_EXECUTION: 'NOT_RUN',
  CAUSAL_RESULT: 'NOT_EVALUABLE',
  neverPromotedToPass: true,
});

/** §8: the frozen scientific design, unchanged, so a correction to the execution path cannot move it. */
export const PRESERVED_DESIGN = Object.freeze({
  experimentalUnit: 'ProjectTrajectory',
  pairedBlocks: 4,
  arms: Object.freeze(['H', 'C']),
  generations: Object.freeze(['G1', 'G2']),
  sessions: 16,
  treatment: 'SELECTION_ONLY',
  randomizationSeed: '0x524c3002',
  frozenRandomizationSeedAndArmOrder: true,
  corpusCapitalExposuresOracleEndpointsThresholdsChanged: false,
  law: 'a correction to the execution-evidence path is not authorization to modify the scientific experiment',
});

/* ================================================================ §9 the commit structure */

/** §9: the commit structure this stage follows. */
export const COMMIT_STRUCTURE = Object.freeze([
  'test(r3-l0c-iar-lc): freeze failing controls for the admission-closure gates',
  'fix(r3-l0c-iar-lc): bridge durable cost, authoritative admission, trust boundary and in-run attestation',
  'research(r3-l0c-iar-lc): supersede the prospective plan with attested evidence',
]);

/** §9: the commit law. */
export const COMMIT_LAW = Object.freeze({
  failingControlsBeforeImplementation: true,
  priorResearchCommitsImmutable: true,
  supersedesRatherThanAmendsPriorPlan: true,
  forcePush: false,
  finalClosureComputedAfterFinalBuild: true,
});

/** §0: the mandatory stop, carried as a value so the stage's own record states it. */
export const STAGE_STOP = Object.freeze({
  ranPaidMatrix: false,
  beganR3L1: false,
  beganFusion: false,
  modelCallsMade: 0,
  law: 'then STOP: no paid model execution, no R3-L1, no Fusion',
});

/** A one-line summary, for a report header. */
export function contractSummary() {
  return Object.freeze({
    stage: 'R3-L0C-I-A-R-L-C',
    kind: 'authoritative causal admission closure contract',
    baseline: BASELINE_COMMIT,
    gates: CORRECTION_GATES.length,
    costBridgeOutcomes: COST_BRIDGE_OUTCOMES.length,
    terminalAdmissionConditions: TERMINAL_ADMISSION_CONDITIONS.length,
    primaryDerivedInputs: PRIMARY_DERIVED_INPUTS.length,
    attestationPoints: ATTESTATION_POINTS.length,
    verdicts: Object.keys(FINAL_VERDICTS).length,
    modelCallsMade: STAGE_STOP.modelCallsMade,
    newline: NL,
  });
}

export { NL };
