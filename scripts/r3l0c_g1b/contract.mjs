/**
 * R3-L0C-G1-B §0/§11 C1 — THE CORRECTIVE CONTRACT.
 *
 * G1 built a working host-observation PRODUCER. Independent review then found that the producer was not connected
 * to a trustworthy, durable Run/Attempt evidence chain. This module records the five exact corrections G1-B makes,
 * each with the measured baseline defect it closes, so a reader can check the claim against the source.
 *
 * WHAT IT IS NOT. It is not a new owner, scheduler, harness or pipeline. Every correction is bounded to the eight
 * files §2 permits, and the frozen journal, claim, Work and cost modules are consumed exactly as they are.
 *
 * PLAIN JAVASCRIPT (`.mjs`). The two product files G1-B touches are TypeScript; this stage-owned code stays plain
 * JS, outside the product layer model (`tools/architecture/graph.ts` walks only `src/` and `host/`).
 */
import { fileURLToPath } from 'node:url';

/** §1: the exact G1-B baseline. */
export const BASELINE_COMMIT = '43ca525599031d431796cb37d0c182d265597d84';

/** The repository root, resolved from this module's own location (`scripts/r3l0c_g1b/`). */
export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/[/\\]$/u, '');

/** The line separator, as a named constant. */
export const NL = String.fromCharCode(10);

export const STAGE = 'R3-L0C-G1-B';
export const STAGE_BRANCH = 'r3-l0c-g1b-evidence-binding';

/** §1: the five G1 commits this stage corrects, recorded so the parent chain is auditable. */
export const G1_COMMITS = Object.freeze([
  '36cb0625756522cf438e57cff1844e6301e178bb',
  'd09424ed1c41e0beaa7eb4bb9dcc813dd6a7c5a6',
  '05403608b7f1632cd153956dd2c6e039e7269350',
  '2a1e194f2baf295ceeba1801cd75ecbb83404425',
  '43ca525599031d431796cb37d0c182d265597d84',
]);

/**
 * §0: THE FIVE CORRECTIONS, each with the measured baseline defect.
 *
 * `baselineDefect` is the ACTUAL observed value captured in `baseline/falsifiers.mjs`, not a description.
 */
export const CORRECTIONS = Object.freeze([
  Object.freeze({
    id: 'B1',
    requirement: 'exactly one Port Invocation Identity must name one actual Deployment Port execution and all observations associated with it',
    baselineDefect: 'Work Delegation minted its own `wpi-<uuid>` for the correlated entry while the Deployment Port minted a DIFFERENT `wpi-<uuid>` for each observation, so one port execution carried two unrelated invocation identities',
    correction: 'the Deployment Port remains the sole producer of InvocationId; the Work Delegation correlation wrapper adopts the invocationId carried by the port observation instead of generating one',
    invariant: 'entry.invocationId === entry.observation.invocationId, and every observation from one port run shares one invocationId',
  }),
  Object.freeze({
    id: 'B2',
    requirement: 'real Spawn/PID/Exit observations must be preserved, read back and validated as actual events; a successfully written empty record must never count as process evidence',
    baselineDefect: 'the recorder rejected all three real observations (invocation mismatch), and the resulting zero-event record still wrote successfully and reported durabilityVerified: true',
    correction: 'the recorder ingests the actual correlated events from the active sink; a positive qualification requires acceptedEvents > 0, rejectedEvents = 0, persistedEventCount === acceptedEvents, and a readback of the same count; per-invocation run-scoped storage replaces the single fixed file',
    invariant: 'a record with zero events cannot satisfy the process-lifecycle edge',
  }),
  Object.freeze({
    id: 'B3',
    requirement: 'the correlator must consume the real frozen `kind/payload` journal structure through the existing Journal Reader, validate the run-root claim, and reject missing, malformed or duplicate identities',
    baselineDefect: 'readRunIdentity() and readTrialIdentities() matched flattened `type/runId` fields, so on real journal records they returned MISSING_RUN_STARTED and an empty trial map',
    correction: 'the correlator reads `{seq, kind, at, payload, digest}` records through `readJournal()`, requires JOURNAL_INTACT, requires exactly one RUN_STARTED with a usable payload.runId, verifies the run-root claim through `verifyTrustedClaim()`, and reads `payload.sessionId` / `payload.record.attemptId` / `payload.record.hostJobId`',
    invariant: 'no synthetic flattened journal format is used as the positive path',
  }),
  Object.freeze({
    id: 'B4',
    requirement: 'caller-created JSON, even with a copied origin marker and a recomputed SHA-256, must not qualify as a host-origin observation through the authority-bearing consumer',
    baselineDefect: 'a caller-built record with origin `G1_LOCAL_RECORDER`, a recomputed recordDigest and an EMPTY event array reached RUN_ATTEMPT_CORRELATED against a matching journal',
    correction: 'trusted ingestion is separated from untrusted inspection: a record reaches LOCAL_HOST_OBSERVED only through the recorder handle bound to a live local invocation, and RUN_ATTEMPT_CORRELATED additionally requires non-empty validated persisted events plus a verified claim and journal reconciliation',
    invariant: 'a copied marker plus a self-computed digest can only reach DECLARATION_ONLY or ORIGIN_NOT_ESTABLISHED',
  }),
  Object.freeze({
    id: 'B5',
    requirement: 'the locator must accept the real Work Owner canonical `attempt-<32hex>` identity and fail closed on incomplete discovery',
    baselineDefect: 'passing the canonical `attempt-<32hex>` returned ABSENT (the comparison used the bare hex), and a candidate below the scan bound returned ABSENT with no indication that the search was incomplete',
    correction: 'the comparison normalizes both the canonical and the bare-hex forms under one explicit contract, and a traversal that could not scan every directory reports DISCOVERY_INCOMPLETE rather than a successful exhaustive search',
    invariant: 'canonical AttemptId works directly; a partially scanned space is never reported as globally unique',
  }),
]);

/**
 * §4: THE INVOCATION IDENTITY OWNERSHIP RULE, stated as data.
 *
 * This is the single sentence the whole of B1 turns on.
 */
export const INVOCATION_IDENTITY_OWNER = Object.freeze({
  producer: 'DeploymentPort',
  producerLocation: 'src/deployment/work_worker.ts dshSubprocessWorkWorkerPort().run',
  notProducedBy: Object.freeze(['WorkOwner', 'WorkDelegation']),
  adoptedBy: 'WorkDelegation correlation wrapper',
  whyOwnerChoiceMatters: Object.freeze([
    'the Work Owner does not perform the actual process spawn, so it must not mint port invocation identity',
    'the Deployment Port must not mint AttemptId or HostJobId, because those belong to different owners',
    'correlation happens only in the host-private boundary that legitimately holds prepared.attemptId and its own jobId',
  ]),
});

/** §4: the identity invariants the tests assert. */
export const INVOCATION_INVARIANTS = Object.freeze([
  'entry.invocationId === entry.observation.invocationId for every correlated event',
  'all observation.invocationId values from one port run are identical',
  'distinct port runs carry different invocationId values',
]);

/** §5: the event-kind ordering a complete local lifecycle must satisfy. */
export const LIFECYCLE_ORDER = Object.freeze([
  'DIRECT_CHILD_SPAWN_ATTEMPTED',
  'DIRECT_CHILD_SPAWN_OBSERVED',
  'DIRECT_CHILD_EXIT_OBSERVED',
]);

/** §5: a complete local lifecycle requires exactly these; a spawn error must never become a spawn/exit pair. */
export const COMPLETE_LIFECYCLE_REQUIREMENTS = Object.freeze([
  'one invocation identity across every event',
  'one direct-child PID, identical on the spawn and exit observations',
  'monotonic sequence numbers',
  'an actually observed exit code',
  'no contradictory SPAWN_ERROR',
  'no contradictory EXIT_UNCONFIRMED in the same completed snapshot',
]);

/** §6: the real frozen journal record shape, as data. */
export const JOURNAL_RECORD_SHAPE = Object.freeze({
  fields: Object.freeze(['seq', 'kind', 'at', 'payload', 'digest']),
  runStartKind: 'RUN_STARTED',
  runIdPath: 'payload.runId',
  trialKind: 'TRIAL_RECORDED',
  trialSessionPath: 'payload.sessionId',
  trialAttemptPath: 'payload.record.attemptId',
  trialHostJobPath: 'payload.record.hostJobId',
  reader: 'scripts/r3l0cf/journal.mjs readJournal()',
  writer: 'scripts/r3l0cf/journal.mjs appendRecord()',
  claimReader: 'scripts/r3l0cf/fail-stop.mjs verifyTrustedClaim()',
});

/** §6: the exact verification the correlator must perform before claiming a verified run. */
export const JOURNAL_VERIFICATION_REQUIREMENTS = Object.freeze([
  'the journal exists',
  'JOURNAL_INTACT === true',
  'no interrupted records',
  'no leftover in-flight temporary records',
  'record sequences are valid and unambiguous',
  'exactly one RUN_STARTED',
  'a valid runId',
  'an actual corresponding run claim',
  'the claim nonce matches the independently held claim witness',
  'exactly one TRIAL_RECORDED for the session being correlated',
  'outer payload.sessionId agrees with nested payload.record.sessionId',
  'the durable AttemptId agrees with the actual Work Attempt',
  'the host job association is checked where authoritative host evidence exists',
  'unexpected duplicates and conflicting values are rejected',
]);

/** §7: the three separated trust layers. */
export const ORIGIN_LAYERS = Object.freeze([
  Object.freeze({ layer: 'UNTRUSTED_RECORD_INSPECTION', accepts: 'arbitrary JSON, to validate shape and content consistency only', mayPromote: false }),
  Object.freeze({ layer: 'TRUSTED_LOCAL_RECORDER_INGESTION', accepts: 'observations through the actual host-private callback installed on the product execution path', mayPromote: true }),
  Object.freeze({ layer: 'VERIFIED_LOCAL_PERSISTENT_READBACK', accepts: 'an owned record from the expected run-scoped location, content-verified and compared with the trusted local run/attempt/invocation bindings', mayPromote: true }),
]);

/** §6/§7: the trust-boundary states, EXTENDED with the origin state G1-B adds. */
export const EVIDENCE_STATES = Object.freeze([
  'DECLARATION_ONLY',
  'ORIGIN_NOT_ESTABLISHED',
  'LOCAL_HOST_OBSERVED',
  'RUN_ATTEMPT_CORRELATED',
  'PROVENANCE_INCOMPLETE',
  'PROVENANCE_CONFLICT',
  'LIVE_PRIMARY_NOT_ESTABLISHED',
]);

/** The same states as a NAMED lookup, from the ONE declaration so they cannot drift. */
export const EVIDENCE_STATE = Object.freeze(Object.fromEntries(EVIDENCE_STATES.map((state) => [state, state])));

/** §8: the locator outcomes, extended with the incomplete-discovery refusal. */
export const LOCATOR_OUTCOMES = Object.freeze({
  DISCOVERED_UNIQUE: 'DISCOVERED_UNIQUE',
  ABSENT: 'ABSENT',
  AMBIGUOUS: 'AMBIGUOUS',
  IDENTITY_UNPARSEABLE: 'IDENTITY_UNPARSEABLE',
  OUTSIDE_SCOPED_HOME: 'OUTSIDE_SCOPED_HOME',
  ESCAPE_REFUSED: 'ESCAPE_REFUSED',
  DISCOVERY_INCOMPLETE: 'DISCOVERY_INCOMPLETE',
  MALFORMED_EXPECTED_IDENTITY: 'MALFORMED_EXPECTED_IDENTITY',
});

/** §8: the canonical AttemptId grammar, matching the Work Owner's `stableEntityId("attempt", digest)`. */
export const CANONICAL_ATTEMPT = Object.freeze({
  prefix: 'attempt-',
  hexLength: 32,
  grammar: '^attempt-[0-9a-f]{32}$',
  bareHexGrammar: '^[0-9a-f]{32}$',
  workOwnerProducer: 'src/domain/idempotency.ts stableEntityId("attempt", digest)',
});

/** §7: the trust limitation G1-B states rather than hides. */
export const LOCAL_TRUST_MODEL = Object.freeze({
  establishes: 'a genuinely distinguishable local host origin within the local trust model',
  doesNotEstablish: Object.freeze([
    'an independent cryptographic Host Attestation Authority',
    'protection against malicious code already executing with full control of the same host process and evidence directory',
    'independently authenticated cross-process or cross-machine provenance',
  ]),
  independentAuthentication: 'INDEPENDENT_HOST_ORIGIN_AUTHENTICATION = NOT_ESTABLISHED',
  selfSignedCredentialCreated: false,
});

/** §14: the measured verdict vocabulary for this stage. */
export const FINAL_VERDICTS = Object.freeze([
  'PORT_OBSERVATION_PRODUCER',
  'SINGLE_INVOCATION_IDENTITY',
  'HOST_JOB_ATTEMPT_BINDING',
  'NONEMPTY_PROCESS_OBSERVATION',
  'PROCESS_EVENT_SEQUENCE_VALID',
  'DIRECT_CHILD_PID_EXIT_COHERENCE',
  'DURABLE_EVENT_READBACK',
  'DURABLE_EVENT_INTEGRITY',
  'RECORD_DUPLICATION_REFUSED',
  'ACTUAL_JOURNAL_SCHEMA_COMPATIBILITY',
  'JOURNAL_INTEGRITY_VERIFIED',
  'RUN_CLAIM_VERIFIED',
  'DURABLE_TRIAL_IDENTITY_VERIFIED',
  'CALLER_FORGED_ORIGIN_REFUSED',
  'LOCAL_HOST_ORIGIN_BOUNDARY',
  'CANONICAL_ATTEMPT_LOCATOR',
  'INCOMPLETE_DISCOVERY_REFUSED',
  'MODEL_VISIBLE_CONTEXT_UNCHANGED',
  'WORK_SEMANTICS_UNCHANGED',
  'HISTORICAL_EVIDENCE_IMMUTABILITY',
  'INDEPENDENT_HOST_ORIGIN_AUTHENTICATION',
  'REAL_DSH_ARTIFACT_COMPATIBILITY',
  'REAL_DSH_WORKER_PROCESS_ATTESTED',
  'ACTUAL_PROVIDER_ROUTE_ATTESTED',
  'LIVE_PRIMARY_PROVENANCE',
  'EXTERNAL_AUTHORITY',
  'HOST_SPEND_ENFORCEMENT',
  'CURRENT_LAUNCH_PERMISSION',
  'PAID_EXECUTION',
  'CAUSAL_RESULT',
]);

/** §14: evidence-qualified statuses, so no verdict is a bare PASS. */
export const VERDICT_STATES = Object.freeze([
  'PASS_LOCAL_NONMODEL',
  'PASS_REAL_JOURNAL_FORMAT_FIXTURE',
  'PASS_SOURCE_GROUNDED',
  'PASS_LOCAL_TRUST_MODEL',
  'FAIL',
  'BLOCKED',
  'NOT_ESTABLISHED',
  'NOT_RUN',
  'NOT_EVALUABLE',
]);

/** §14: verdicts that must never be promoted to PASS by this stage. */
export const UNEARNED_VERDICTS = Object.freeze([
  'INDEPENDENT_HOST_ORIGIN_AUTHENTICATION',
  'REAL_DSH_ARTIFACT_COMPATIBILITY',
  'REAL_DSH_WORKER_PROCESS_ATTESTED',
  'ACTUAL_PROVIDER_ROUTE_ATTESTED',
  'LIVE_PRIMARY_PROVENANCE',
  'EXTERNAL_AUTHORITY',
  'HOST_SPEND_ENFORCEMENT',
]);

/** §0: the prohibitions, as data a report can cite. */
export const PROHIBITIONS = Object.freeze([
  'make paid model calls',
  'launch the real DSH worker',
  'enable PRIMARY',
  'remove existing PRIMARY launch prohibitions',
  'create real external authorization',
  'invent an enforceable monetary budget',
  'modify the Work Attempt state machine or canonical settlement logic',
  'change the frozen R3-L0C scientific design',
  'rewrite existing G1 research evidence',
  'rewrite historical commits',
  'create another R3 Pipeline, Fail-Stop Runner or Cost Bridge',
  'introduce a general-purpose TrajectoryStore, EvidenceStore or new Canonical Owner',
  'classify synthetic observations as LIVE_PRIMARY',
  'begin R3-L1 or Fusion',
  'merge into main',
]);

/** §12: the archived-plan compatibility state this stage keeps separate. */
export const ARCHIVED_PLAN_COMPATIBILITY = 'DRIFTED_EXPECTED';

/** A compact, machine-readable summary. */
export function contractSummary() {
  return Object.freeze({
    stage: STAGE,
    baseline: BASELINE_COMMIT,
    corrections: CORRECTIONS.length,
    invocationIdentityOwner: INVOCATION_IDENTITY_OWNER.producer,
    evidenceStates: EVIDENCE_STATES.length,
    locatorOutcomes: Object.keys(LOCATOR_OUTCOMES).length,
    verdicts: FINAL_VERDICTS.length,
    unearnedVerdicts: UNEARNED_VERDICTS.length,
    prohibitions: PROHIBITIONS.length,
    addsCanonicalOwner: false,
    addsEvidenceStore: false,
    addsScheduler: false,
    addsPipeline: false,
  });
}
