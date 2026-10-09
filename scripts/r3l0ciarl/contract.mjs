/**
 * R3-L0C-I-A-R-L §1-§4 — THE LIVE MEASUREMENT CLOSURE CONTRACT.
 *
 * This module is this stage's FROZEN SEMANTICS, committed before any repair exists. It records, as values rather
 * than prose, the four gates the ruling names, the evidence each one binds, and the eight final verdicts.
 *
 * WHY A NEW NAMESPACE. The prior stage's committed evidence (`research-evidence/r3-l0c-iar/`) and its plan
 * (`r3-l0c-iar-primary-plan`) describe `scripts/r3l0ciar/**` as it stood at `36ada58`. Editing those modules in
 * place would make that record describe code that no longer exists — the error the prior two stages refused when
 * they quarantined a superseded matrix rather than deleting it. So this stage SUPERSEDES the R3-L0C-I-A-R modules
 * with its own, leaves them byte-identical, and binds a freshly computed closure into a NEW plan in a NEW evidence
 * namespace.
 *
 * WHAT THIS STAGE IS NOT. §0 forbids model calls. It is a bounded correction of four proven defects in the live
 * measurement path — not a new architecture, not a benchmark stage. `src/**`, `host/**`, the frozen corpus, the
 * capital, the oracle, the arm order and the thresholds are untouched.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

const NL = String.fromCharCode(10);

/** §0: the exact baseline this stage starts from. */
export const BASELINE_COMMIT = '36ada589f62bad2cbfc5bdf1dad7b8201876640e';

/** §0: the stage branch. */
export const STAGE_BRANCH = 'r3-l0c-iar-live-measurement-closure';

/** §Final: this stage's own code namespace. */
export const STAGE_CODE_PATH = 'scripts/r3l0ciarl';

/** §Final: this stage's own evidence namespace. The ONLY place it may add under `research-evidence/`. */
export const STAGE_EVIDENCE_PATH = 'research-evidence/r3-l0c-iar-l';

/** §Final: the prior stage, whose code and evidence this stage supersedes but never edits. */
export const SUPERSEDED_STAGE = Object.freeze({
  stage: 'R3-L0C-I-A-R',
  commit: BASELINE_COMMIT,
  planId: 'r3-l0c-iar-primary-plan',
  planPath: 'research-evidence/r3-l0c-iar/execution-plan.json',
  codePath: 'scripts/r3l0ciar',
  disposition: 'SUPERSEDED — byte-identical, no longer the authorized entry point',
});

/** §Final: the prior evidence namespaces, read but never written by this stage. */
export const PRIOR_EVIDENCE_PATHS = Object.freeze([
  'research-evidence/r3-l0c-iar',
  'research-evidence/r3-l0c-ia',
  'research-evidence/r3-l0c-f',
  'research-evidence/r3-l0c-i',
  'research-evidence/r3-l0c-r',
  'research-evidence/r3-l0c',
]);

/** The checkout root, resolved from this module's own position. */
export const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');

/* ================================================================ §1-§4 the four gates */

/**
 * §1-§4: THE FOUR GATES, EACH WITH THE DEFECT IT CORRECTS.
 *
 * Each is recorded with the FILE and LINE where the R3-L0C-I-A-R behaviour lives, so a reader can verify the
 * defect rather than take the falsifier's word for it. The `property` field is what the repair must make true.
 */
export const CORRECTION_GATES = Object.freeze([
  Object.freeze({
    id: 'L1_LIVE_ARTIFACT_CONTINUITY',
    section: 'Gate 1',
    gap: 'the frozen journal does not carry sessionArtifactPath or hiddenInvariantVector, so the live artifact identity and the hidden quality vector do not survive into the durable TRIAL_RECORDED record',
    baselineLocation: 'scripts/r3l0cf/contract.mjs:240 JOURNAL_FIELDS omits sessionArtifactPath and hiddenInvariantVector; scripts/r3l0cf/journal.mjs:193 buildGenerationRecord builds a fixed field set',
    property: 'the actual generation outcome\'s sessionArtifactPath, hidden quality vector, AttemptId, HostJobId and cost provenance survive into the durable TRIAL_RECORDED journal and are recoverable by identity',
    measuredBy: 'a real-format session.v4.jsonl.zstd artifact driven through adapter -> trial record -> journal readback -> cost attribution -> frozen analysis',
  }),
  Object.freeze({
    id: 'L2_POSTFLIGHT_FRESHNESS',
    section: 'Gate 2',
    gap: 'the post-matrix gate reuses the PREFLIGHT closure, containment and route objects, derives retry and replacement counts from caller-supplied numbers, and never re-measures the runtime',
    baselineLocation: 'scripts/r3l0ciar/pipeline.mjs:243-264 the validityGate closure reads planRead/closure/containment and `input.replacements ?? 0`, `input.retries ?? 0`',
    property: 'the post-matrix gate recomputes the closure and the effective runtime configuration AFTER the matrix, derives retry and replacement counts from the durable journal, and compares every session\'s exact frozen identity',
    measuredBy: 'a mutation applied after preflight but before postflight, which must fail causal admission; and a run whose journal shows a duplicate launch, which must report a retry',
  }),
  Object.freeze({
    id: 'L3_PRIMARY_INPUT_BINDING',
    section: 'Gate 3',
    gap: 'the pipeline accepts caller-supplied plan, closure, preExposureChecks, validityGate, costAttribution, costProvenance, retry counters and route configuration in EVERY mode, so a PRIMARY run can substitute caller objects for actual measurements',
    baselineLocation: 'scripts/r3l0ciar/pipeline.mjs:95,103,171,174,243,253,262-263 each `input.X ?? measured`',
    property: 'in PRIMARY mode the pipeline reads the committed plan and derives its own closure, containment and validity measurements; caller substitution is refused; test injection is permitted only in DETERMINISTIC mode',
    measuredBy: 'a PRIMARY invocation supplying each substitutable input, which must refuse before exposure',
  }),
  Object.freeze({
    id: 'L4_RUNTIME_ATTESTATION',
    section: 'Gate 4',
    gap: 'source-to-compiled verification is skipped (`verifyCompiled: false`), the installed DSH host bundle is never checked against the repository, and nothing detects a competing process writing the shared installation during a run',
    baselineLocation: 'scripts/r3l0ciar/closure.mjs:149 and qualification.mjs:71,103,213 all pass verifyCompiled: false; no module reads the installed bundle',
    property: 'deterministic source-to-compiled verification is completed, the installed host bundle bytes are checked against the repository, and a competing modification of the shared installation during the run is detected',
    measuredBy: 'the verification result with verification enabled, an installed bundle compared file-by-file, and a run whose shared installation is changed between preflight and postflight',
  }),
]);

/* ================================================================ §1 the live-evidence binding */

/**
 * §1: THE STAGE-OWNED LIVE-EVIDENCE SIDECAR.
 *
 * The frozen journal cannot gain a field, so the narrowest mechanism is a SIDECAR plus a DIGEST BINDING through a
 * field the journal already has. `contentDigests` is a frozen `JOURNAL_FIELDS` member that accepts arbitrary keys,
 * so the sidecar's digest is bound there and the sidecar itself lives under the run root. That makes the chain
 * checkable end to end:
 *
 *     the journal durably binds the sidecar by digest
 *     the sidecar carries the live artifact identity, the hidden vector and the cost provenance
 *     a reader that can recompute the digest can prove the evidence was not substituted after the fact
 */
export const LIVE_EVIDENCE = Object.freeze({
  /** The directory, relative to the run root, where the per-session sidecars live. */
  directory: 'private/live-evidence',
  /** The frozen journal field the binding is carried in. */
  bindingField: 'contentDigests',
  /** The key inside `contentDigests` that names this stage's binding. */
  bindingKey: 'r3l0ciarlLiveEvidence',
  /** The fields the sidecar must carry for §1 to be satisfied. */
  requiredFields: Object.freeze(['sessionId', 'sessionArtifactPath', 'sessionArtifactDigest', 'hiddenInvariantVector', 'attemptId', 'hostJobId', 'costProvenance', 'mode']),
  law: 'the live artifact identity, the hidden quality vector and the cost provenance are carried in a stage-owned sidecar whose digest is bound into the durable TRIAL_RECORDED journal through the frozen contentDigests field',
});

/* ================================================================ §3 the substitutable inputs */

/**
 * §3: THE INPUTS A PRIMARY RUN MAY NOT SUBSTITUTE.
 *
 * Each names a measurement the PRIMARY path must derive for itself. In DETERMINISTIC mode the same names may be
 * injected, because the deterministic path exists to exercise the machinery and its inputs are fixtures.
 */
export const PRIMARY_DERIVED_INPUTS = Object.freeze([
  'plan', 'planPath', 'closure', 'preExposureChecks', 'validityGate', 'costAttribution', 'costProvenance',
  'routeConfiguration', 'realizationPreflight', 'replacements', 'retries', 'systemValid',
]);

/** §3: the injection permitted only in DETERMINISTIC mode, carried as data so a test can assert the set. */
export const DETERMINISTIC_ONLY_INJECTION = Object.freeze([...PRIMARY_DERIVED_INPUTS]);

/**
 * §3: THE EXTERNAL AUTHORIZATION RECORD.
 *
 * §3 requires the record to identify the APPROVED PLAN, the PAID-RUN BUDGET and the five fail-stop decisions, and
 * it requires the AUTHORITY to be verified at the trusted launch boundary. A non-empty `authority` string is
 * explicitly insufficient: the string must name a decision record that the launch boundary can verify, and the
 * approved plan must be the plan actually being executed.
 */
export const AUTHORIZATION_REQUIREMENTS = Object.freeze([
  Object.freeze({ id: 'PAID_MODEL_USAGE', detail: 'paid model usage' }),
  Object.freeze({ id: 'BOUNDED_FAIL_STOP_PROTOCOL', detail: 'the bounded fail-stop protocol' }),
  Object.freeze({ id: 'NO_AUTOMATIC_RETRIES_OR_REPLACEMENTS', detail: 'no automatic retries or replacement sessions' }),
  Object.freeze({ id: 'PRESERVE_PARTIALLY_COMPLETED_INVALID_RUNS', detail: 'preservation of partially completed invalid runs' }),
  Object.freeze({ id: 'ACCEPTED_PROMPT_NEUTRALITY_LIMITED', detail: 'the accepted PROMPT_NEUTRALITY = LIMITED constraint' }),
]);

/** §3: what an authorization record must carry. */
export const AUTHORIZATION_RECORD_FIELDS = Object.freeze(['authority', 'approvedPlanId', 'approvedPlanDigest', 'paidRunBudget', 'decisions']);

/** §3: the law. */
export const PRIMARY_BINDING_LAW = Object.freeze({
  callerSuppliedInputsRefusedInPrimary: true,
  deterministicInjectionPermitted: true,
  authorityStringAloneIsNotProof: true,
  approvedPlanMustMatch: true,
  paidRunBudgetRequired: true,
  thisStageGrantsAuthorization: false,
  thisStageEntersPrimary: false,
  law: 'in PRIMARY mode every measurement is derived by the pipeline and verified against the committed plan and the external authorization record; a non-empty authority string is not proof',
});

/* ================================================================ §4 the attestation */

/**
 * §4: THE RUNTIME ATTESTATION.
 *
 * Three separate facts, each measured rather than assumed.
 */
export const ATTESTATION = Object.freeze({
  /** The frozen runtime manifest this stage reuses, so the attestation covers the dynamically loaded modules. */
  manifestSource: 'scripts/r3l0ciar/runtime-manifest.mjs (reused, unchanged)',
  /** The installed host-bundle targets, as the frozen installer writes them. */
  bundleTargets: Object.freeze([
    Object.freeze({ source: 'host/dsh', installedName: 'palimpsest-dsh-host' }),
    Object.freeze({ source: 'host/deployment', installedName: 'palimpsest-host-deployment' }),
  ]),
  /** The installer is a MITIGATION, not a proof of atomic replacement. */
  installerIsMitigationNotProof: true,
  law: 'the installed host bundle is compared byte-for-byte against the repository, a competing writer of the shared installation is detected, and the installer is preserved as a mitigation rather than presented as atomic replacement',
});

/* ================================================================ §Final the verdicts */

/** §Final: the verdict vocabulary. */
export const FINAL_VERDICTS = Object.freeze({
  LIVE_ARTIFACT_PROPAGATION: Object.freeze(['PASS', 'FAIL']),
  DURABLE_COST_ADMISSION: Object.freeze(['PASS', 'FAIL']),
  POSTFLIGHT_FRESHNESS: Object.freeze(['PASS', 'FAIL']),
  PRIMARY_INPUT_BINDING: Object.freeze(['PASS', 'FAIL']),
  EXECUTABLE_RUNTIME_ATTESTATION: Object.freeze(['PASS', 'FAIL']),
  FAIL_STOP_VALIDITY: Object.freeze(['PASS', 'FAIL']),
  PAID_AUTHORIZATION: Object.freeze(['PENDING', 'GRANTED']),
  PAID_REPLICATION: Object.freeze(['READY_FOR_AUTHORIZATION', 'BLOCKED']),
});

/** §Final: the commit structure. */
export const COMMIT_STRUCTURE = Object.freeze([
  'test(r3-l0c-iar-l): freeze failing controls for the live measurement gates',
  'fix(r3-l0c-iar-l): bind live evidence, fresh postflight and primary-only inputs',
  'research(r3-l0c-iar-l): supersede the prospective plan with attested evidence',
]);

/** §Final: the commit law. */
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
    stage: 'R3-L0C-I-A-R-L',
    kind: 'live measurement closure contract',
    baseline: BASELINE_COMMIT,
    gates: CORRECTION_GATES.length,
    primaryDerivedInputs: PRIMARY_DERIVED_INPUTS.length,
    authorizationDecisions: AUTHORIZATION_REQUIREMENTS.length,
    modelCallsMade: STAGE_STOP.modelCallsMade,
    newline: NL,
  });
}

export { NL };
