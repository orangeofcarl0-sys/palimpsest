/**
 * R3-WR5 — FROZEN REACHABILITY AND TERMINAL POLICY CONTRACTS.
 *
 * RESEARCH-ONLY. Nothing in `src/` imports this module; it creates no store and grants no authority. It states,
 * in one auditable place and BEFORE any product change, what this stage treats as trusted, what is reachable
 * from where, and what the policy is — so a repair cannot be retro-fitted to whatever the code happens to do.
 *
 * The ruling's ordering is load-bearing: `analysis` and `test` commits precede production changes.
 *
 * PLAIN JAVASCRIPT (`.mjs`). No LLM, no network.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT } from '../r3l0/envelope.mjs';

export const NL = String.fromCharCode(10);
export const STAGE_EVIDENCE_PATH = 'research-evidence/r3-wr5';

/* ================================================================== *
 * §1 — CARRIED-FORWARD DISTINCTIONS (R3-WR4 history unamended)
 * ================================================================== */

/**
 * The five R3-WR4 findings, carried forward at EXACTLY the strength they were measured. §1 forbids
 * reinterpreting a past measurement as stronger than it was, so each entry names its scope and its limit.
 */
export const CARRIED_FORWARD = Object.freeze([
  Object.freeze({
    finding: 'WORLD_PHYSICAL_IDENTITY',
    r3wr4Verdict: 'CLOSED',
    carriedAs: 'proven within envelope',
    scope: 'The administrative AND common directory must both lie inside the world. Measured on this host, against the frozen R3-WR3 port for the negative controls.',
    limit: 'Proven for the shapes exercised: parent adoption, linked worktree, canonical common dir, external common dir, junction. Not a claim about every possible Git administrative layout.',
  }),
  Object.freeze({
    finding: 'WORLD_EFFECT_AUTHORITY',
    r3wr4Verdict: 'CLOSED (physical binding) / OPEN (operation level)',
    carriedAs: 'not fully established',
    scope: 'A world records the (attemptId, basis) it was created for and refuses a foreign owner or a different basis.',
    limit: 'The record is EVIDENCE inside the world, not authority. Two DISTINCT operation ids were measured reaching `succeeded` against the same world in R3-WR4, because the effect action receives no operation identity. That measurement stands and is not upgraded here.',
  }),
  Object.freeze({
    finding: 'SINGLE_FLIGHT',
    r3wr4Verdict: 'PROVEN',
    carriedAs: 'proven within one runtime process',
    scope: 'Six simultaneous same-key invocations, every dispatch held open inside a 250 ms window the harness controls: one dispatch, maximum one active, one physical world.',
    limit: 'One runtime process over one durable ledger. Multi-process coordination was NOT exercised and is not claimed. §5 of this ruling explicitly retains that limitation rather than expanding into distributed locking.',
  }),
  Object.freeze({
    finding: 'UNOBSERVABLE_WORLD_FAILURE',
    r3wr4Verdict: 'CLOSED (evidence)',
    carriedAs: 'reproduced',
    scope: 'With ONLY the world\'s borrowed object dependency removed and the canonical repository healthy, the attempt stays RUNNING and `controller.report` THROWS for failed, cancelled and expired, appending no terminal event.',
    limit: 'A deterministic local injection. It does not claim the canonical repository cannot also fail, and it does not claim the injection is the only way a world becomes unobservable.',
  }),
  Object.freeze({
    finding: 'AUTHORIZED_TERMINAL',
    r3wr4Verdict: 'POLICY_REQUIRED',
    carriedAs: 'policy required',
    scope: 'No existing pathway can record a permanent unobservable-world failure truthfully.',
    limit: 'R3-WR4 also recorded an 11/12 §8 claim. §12 of THIS ruling rejects that as too broad and requires the predicates be measured separately, which this stage does.',
  }),
]);

/* ================================================================== *
 * §2 — THE ACTUAL CALL-PATH INVENTORY
 * ================================================================== */

/**
 * Every reachable caller of the world-creation effect, classified by TRUST BOUNDARY.
 *
 * The finding is a NARROWNESS result, and the honest statement of it matters: the surface is small, and what
 * makes it small is that the callId is a PURE FUNCTION of the attempt id rather than anything a caller chooses.
 */
export const CALL_PATH_INVENTORY = Object.freeze({
  method: 'exhaustive grep over src/, host/, e2e/, test/ and scripts/ for `worldCreate`, `world.create`, `createWorld`, `createPalimpsestEffects`, `.invoke(`, `hostPort`, and every registered tool name',
  productionCallersOfWorldCreate: Object.freeze([
    Object.freeze({
      site: 'src/tools/controller.ts:2197',
      within: 'ProjectController.claim(attemptId, attribution)',
      intent: Object.freeze({ scope: 'this.projectId', callId: '`world:${attemptId}`', revision: 'promotions.projectRevision()' }),
      reachableFrom: Object.freeze([
        'controller.begin (in-place only) → claim',
        'controller.runAttemptWithCommandExecutor ← pumpCommandAttempts / pumpSettlement / runTurn',
        'AttemptExecutionPorts.claim shim ← makeMutatingAttemptService ← WorkDelegationService.start / continuation.startOrResume',
        'control_surface.claim ← serve.ts POST /api/control/claim, and application/surfaces/work.ts (no route wired)',
      ]),
    }),
  ]),
  directCreateWorldCallersOutsideTheAction: 'none in src/ — the action is the only production entry to GitCliPort.createWorld',
  hostPort: Object.freeze({
    created: 'src/effects/runtime.ts:133',
    productionConsumers: 0,
    finding: 'HostInvocationPort is an ambient-authority seam that lets a caller mint its own {source, scope, callId} and bypass orchestrationAuthorization. It is created and RETURNED but never handed to install, composition, serve, cli, or any adapter. Only test/host_conformance.test.ts references it. Nothing outside the process can reach it: it is an in-memory object reference, not serialized, not routed, not a tool, not an IPC message.',
  }),
  workerReachability: Object.freeze({
    mechanism: 'host/dsh/lib/runner.js restricts the worker catalogue to (inherited tools) − (every name with the `palimpsest_` prefix) + exactly two read-only worker-private tools',
    workerPrivateTools: Object.freeze(['palimpsest_worker_result (read-only)', 'palimpsest_worker_context_pull (read-only)']),
    canReachClaim: false,
    canReachReport: false,
    canReachWorldCreate: false,
    canReachScheduler: false,
    outboundChannel: 'one stdio[3] Node IPC pair carrying a strictly parsed pull envelope {channel, handle, kind, requestId}; it can never name an attempt, project, path or owner',
  }),
  externallyReachable: Object.freeze({
    http: Object.freeze([
      'POST /api/control/claim → control_surface.claim → controller.claim → worldCreate',
      'POST /api/manage/step and /api/manage/run → projectManagement → controller.runTurn → claim → worldCreate',
    ]),
    httpGate: 'In the default `fence` mode the only gate is the browser-trust fence, which the code itself documents as NOT an authentication boundary against a local non-browser client. In `token` mode a bearer token or signed cookie is required.',
    whatAnHttpCallerCanChoose: 'only WHICH existing, scheduler-owned attempt id to claim (or let selectCandidate pick one). It cannot choose the callId, the scope, the worldId or the baseCommit: claim derives callId = `world:<attemptId>`, scope = projectId, worldId = attemptId and baseCommit = project.head_commit.',
    mcpOrJsonRpc: 'none — exhaustive grep for mcp / jsonrpc / ModelContextProtocol finds nothing outside node_modules',
  }),
  conclusion: 'UNTRUSTED_REACHABLE is FALSE for world creation and reuse. Every path reaches `worldCreate` through ProjectController.claim, which enforces role-slot admission, budget admission, world-basis capture and the scheduler\'s ATTEMPT_STARTED transition. The closest residual is the fence-mode HTTP claim route, and even there the caller cannot mint a new operation identity — it can only select an existing attempt, whose callId the controller derives.',
});

/* ================================================================== *
 * §3 — CANONICAL ATTEMPT AUTHORIZATION
 * ================================================================== */

export const ATTEMPT_AUTHORIZATION_CONTRACT = Object.freeze({
  module: 'src/state/attempt_authorization.ts',
  resolutionChain: 'ATTEMPT_CREATED (carries task_id + envelope_id) → historical envelope_id → TASK_CREATED / TASK_REAUTHORIZED (carry the full TaskEnvelope) → the original TaskEnvelope',
  failsClosedOn: Object.freeze(['ATTEMPT_NOT_RECORDED', 'BINDING_NOT_RECORDED', 'AUTHORIZATION_NOT_FOUND', 'AUTHORIZATION_AMBIGUOUS', 'AUTHORIZATION_MISMATCH', 'AUTHORIZATION_WRONG_SUBJECT']),
  neverSubstitutes: 'the task\'s CURRENT envelope — `#attemptContext` reads the ATTEMPT\'s recorded authorization, and the task row is not consulted on that path at all',
  /**
   * §3 — THE BASE_COMMIT COMPARISON, MEASURED.
   *
   * `claim` passes `baseCommit: project.head_commit`; the attempt's provenance is captured from its HISTORICAL
   * envelope. The ruling asks whether those can diverge. They cannot, and the reason is structural rather than
   * incidental — measured, not argued:
   *
   *     `reconcileProjectHead()` REFUSED with `quiescence_required` while one attempt was open
   *
   * so the project head cannot advance while any attempt is open. A task's envelope is minted at the head that
   * is current when its attempt is claimed, and that head cannot move until every attempt settles. Therefore
   * `project.head_commit` at claim time IS the attempt's envelope base_commit.
   */
  baseCommitDivergence: Object.freeze({
    claimSource: 'project.head_commit (src/tools/controller.ts:2198)',
    provenanceSource: '#attemptContext(attemptId)[1].base_commit — the ATTEMPT\'s historical envelope',
    measuredBlocker: 'quiescence_required: the project must be quiescent before the head advances: every ACTIVE/VERIFYING task and open attempt must settle (a promoted task must reach SATISFIED first)',
    verdict: 'STRUCTURALLY_UNREACHABLE_IN_THE_SUPPORTED_PATH',
    limit: 'The blocker is the head owner\'s own predicate. This is a statement about the supported path, not a proof that no future change could remove the barrier — which is why the check below is still worth having as defence in depth.',
  }),
  /**
   * §3 — THE WORLD-LOCAL BINDING.
   *
   * `repository` is WRITTEN at creation and READ into the record, but the measured finding is that NOTHING
   * COMPARES IT. That is a physical-provenance gap, and §3 authorises exactly one repair for it: a justified
   * provenance check, not a new authority store.
   */
  worldLocalBinding: Object.freeze({
    path: '.git/palimpsest-world-binding.json',
    fields: Object.freeze(['schemaVersion', 'attemptId', 'basisCommit', 'repository']),
    checked: Object.freeze({ attemptId: 'YES — WORLD_OWNER_MISMATCH', basisCommit: 'YES — WORLD_BASIS_MISMATCH', repository: 'NO — written and read, never compared' }),
    status: 'EVIDENCE, NEVER AUTHORITY — a caller with filesystem access can rewrite it, and the honest statement of what it buys is "the accidental and careless case is caught"',
    tamperFinding: 'A binding rewritten to be SELF-CONSISTENT (correct attemptId and basisCommit for the requester) is ACCEPTED — measured. That is correct behaviour for evidence, and it is why authority stays outside the world.',
  }),
  commonDirCanonicalization: Object.freeze({
    codePath: 'GitCliPort.#commonDirReal returns null when realpathSync throws AND the answer is neither the bare `.git` nor the world\'s own git dir',
    measuredFinding: 'The NULL branch was NOT reachable in any shape exercised: a missing absolute path, a missing relative escape and a missing relative inside path all made GIT ITSELF resolve the repository to the enclosing canonical repo, which the ADMINISTRATIVE-directory test then refused with WORLD_PATH_NOT_ISOLATED. A commondir naming a FILE behaved the same way.',
    verdict: 'UNKNOWN_OWNERSHIP_CANNOT_MASQUERADE_AS_ISOLATION — defended upstream by the administrative-directory test rather than by the null branch itself',
    limit: 'A symlink-based shape could not be constructed on this host (symlink creation returns EPERM without privilege), so that variant is NOT measured and is not claimed.',
  }),
});

/* ================================================================== *
 * §4 — THE FIVE REUSE POLICY CASES
 * ================================================================== */

/**
 * Frozen BEFORE implementation. Each case records the expected admission, the trusted authority source, whether
 * the physical world is reused, whether Git mutation occurs, and whether the decision rests on durable records.
 *
 * THE KEY OBSERVATION that shapes C3: the production `callId` is `world:<attemptId>` — a PURE FUNCTION of the
 * attempt id — and `scope` is the project id. So two supported calls for one attempt produce the SAME operation
 * id, which is C1 (same-key redispatch), never C3. C3 requires a caller to SUPPLY a different callId, which only
 * a deliberately trusted internal caller can do.
 */
export const REUSE_POLICY = Object.freeze({
  cases: Object.freeze([
    Object.freeze({
      id: 'C1',
      case: 'same-key idempotent redispatch',
      expectedAdmission: 'ALLOW',
      authoritySource: 'the Ordarium operation record itself: the same operationId means the engine\'s own `redispatch-same-key` recovery of ONE operation',
      operationIdentity: 'identical operationId (same action+version+logicalKeyDigest); identical inputDigest',
      worldReused: true,
      gitMutation: 'the reuse branch only — no clone; checkout is conditional and does not run when the recorded basis matches',
      durableSupport: 'the operation record and its event history in the SQLite ledger',
      reachableFromSupportedPath: true,
    }),
    Object.freeze({
      id: 'C2',
      case: 'authorized same-Attempt continuation after restart',
      expectedAdmission: 'ALLOW',
      authoritySource: 'the attempt\'s canonical identity plus its recorded binding: the world names the same attempt and the same basis, so this is a resume',
      operationIdentity: 'a NEW operation id is expected after a restart, because the runtime is new — but the attemptId, worldId and baseCommit are all identical, so the physical world is the same one',
      worldReused: true,
      gitMutation: 'none beyond the ordinary config re-stamp and remote verification',
      durableSupport: 'the attempt row, the event log, and the world\'s own binding record',
      reachableFromSupportedPath: true,
    }),
    Object.freeze({
      id: 'C3',
      case: 'distinct operation key, same Attempt, no proven recovery lineage',
      expectedAdmission: 'REFUSE_UNLESS_TRUSTED_INTERNAL',
      authoritySource: 'NONE at the operation level. The effect action receives `{worldId, baseCommit}` and NO operation identity, so it cannot see the callId and cannot check lineage.',
      operationIdentity: 'a DIFFERENT operationId for the same physical world — only constructible by a caller that supplies its own callId',
      worldReused: 'yes, if it is allowed through — which is the measured R3-WR4 finding',
      gitMutation: 'the reuse branch',
      durableSupport: 'the two operation records exist and are distinct, but NOTHING binds either to an authorization to reuse the world',
      reachableFromSupportedPath: false,
      ruling: 'PERMITTED WITHIN THE TRUSTED-INTERNAL-API ENVELOPE, AND ONLY THERE. The production callId is a pure function of the attemptId, so the supported path cannot express C3. Reaching it requires a caller that already holds `effects.invoke` or `hostPort.invoke` in-process — i.e. code that is already trusted with the canonical store. §4 forbids adding a caller-asserted token that merely repeats worldId, and forbids a second durable world owner, so the honest disposition is to RECORD the envelope boundary rather than to invent an operation-level authority check.',
    }),
    Object.freeze({
      id: 'C4',
      case: 'operation associated with another Attempt',
      expectedAdmission: 'REFUSE',
      authoritySource: 'the world\'s recorded binding, checked against the requested world id',
      operationIdentity: 'any — the refusal does not depend on the operation key',
      worldReused: false,
      gitMutation: 'none — the refusal precedes checkout, remote removal and config rewriting',
      durableSupport: 'the binding record; the attempt row',
      reachableFromSupportedPath: true,
      enforcedBy: 'WORLD_OWNER_MISMATCH (R3-WR4)',
    }),
    Object.freeze({
      id: 'C5',
      case: 'operation associated with another Project',
      expectedAdmission: 'REFUSE',
      authoritySource: 'the port is CONSTRUCTED with one canonical repository, and the world root is derived from it, so another project\'s world is a different path',
      operationIdentity: 'any',
      worldReused: false,
      gitMutation: 'none',
      durableSupport: 'the construction-time repository binding',
      reachableFromSupportedPath: true,
      /**
       * §3 authorises ONE narrow repair here: the binding\'s `repository` field is written and read but never
       * compared, so a world whose record names a DIFFERENT repository is currently accepted. That is physical
       * provenance, not authority, and it is the justified check.
       */
      gap: 'the binding\'s `repository` field is not compared — a world whose record names another repository is accepted',
    }),
  ]),
  invariants: Object.freeze([
    'Different callId alone does not prove unauthorized Work.',
    'Same worldId alone does not grant authority.',
    'No second durable World owner is added.',
    'No caller-asserted authorization token that merely repeats worldId is added.',
  ]),
});

/* ================================================================== *
 * §6/§7 — THE FAILURE-DISPOSITION POLICY, FROZEN
 * ================================================================== */

/**
 * §6 — THE PROPOSED POLICY, AND WHETHER THE EXISTING AUTHORITY CONTRACT CAN ADMIT IT.
 *
 * The proposal is the ruling's own: an explicitly authorized Project operator may cancel an Attempt after the
 * host has established that its Worker has stopped and that ordinary Result observation is unavailable.
 */
export const FAILURE_DISPOSITION_POLICY = Object.freeze({
  proposed: 'An explicitly authorized Project operator may cancel an Attempt after the host has established that its Worker has stopped and that ordinary Result observation is unavailable.',
  status: 'PROPOSED — not authority granted by the ruling document',
  audit: Object.freeze({
    managementModes: Object.freeze({
      modes: Object.freeze(['DIRECT', 'ASSIST', 'MANAGE', 'DELEGATE']),
      areSemanticAuthority: false,
      evidence: 'src/project_management/service.ts states "Service ≠ Authority · Recommendation ≠ Mutation · Request ≠ Change" and "This service owns NO store and NO authority of its own"; src/project_intent/receipt.ts and src/project_collaboration/receipt.ts both state that `managementMode === "DELEGATE"` is forbidden as semantic authority.',
    }),
    operatorPath: Object.freeze({
      exists: 'applyOperatorModeChange (src/project_management/service.ts:210), wired to a CLI/host port and NEVER to an LLM tool',
      whatItCanDo: 'persist a management involvement PREFERENCE',
      whatItCannotDo: 'authorize a terminal attempt event — there is no operator capability that admits ATTEMPT_CANCELLED',
    }),
    workerToolPermissions: Object.freeze({
      workerCanCall: Object.freeze(['palimpsest_worker_result', 'palimpsest_worker_context_pull']),
      workerCanAuthorize: false,
      finding: 'The worker has no tool that reaches claim, report, world.create or the scheduler, so "an ordinary Worker cannot self-authorize cancellation" is structural rather than a policy that could be relaxed.',
    }),
  }),
  verdict: 'POLICY_REQUIRED',
  whyNotImplemented: 'No trusted capability authorizes the transition, so implementing a terminal command now would be an unguarded one — exactly what §6 forbids. The requirement is returned as an exact decision contract instead.',
});

/**
 * §7 — THE MINIMAL TERMINAL SEMANTICS.
 */
export const TERMINAL_SEMANTICS = Object.freeze({
  preferred: 'ATTEMPT_CANCELLED with a null attempt report, subject to an independently authorized cancellation decision',
  measuredAdmissibility: 'a null report IS admitted for ATTEMPT_CANCELLED and ATTEMPT_EXPIRED from RUNNING, and REFUSED for ATTEMPT_FAILED ("expected an object") — measured in R3-WR4 and re-measured here',
  forbidden: Object.freeze([
    'ATTEMPT_FAILED with a fabricated report',
    'ATTEMPT_EXPIRED without an observed expiry',
  ]),
  means: 'The current Attempt is no longer authorized to continue.',
  doesNotMean: Object.freeze([
    'The underlying Git object store will never become recoverable.',
    'A verified Result was produced.',
  ]),
  doesNotGrant: 'promotion authority',
  preserves: 'the original World and any surviving candidate or uncommitted work',
  noAutomaticMachineFailureTerminal: 'If the project needs an automatic machine-failure terminal, that is a SEPARATE semantic decision. CANCELLED must not be quietly reinterpreted as FAILED.',
});

/* ================================================================== *
 * §8/§9 — HOST EVIDENCE AND FENCING
 * ================================================================== */

export const HOST_FAILURE_EVIDENCE = Object.freeze({
  method: 'audit of the existing host-side evidence and effect ledgers before proposing any storage',
  existingEvidence: Object.freeze([
    Object.freeze({ source: 'WorkWorkerExecutionOutcome {kind:"HOST_FAILURE"}', durability: 'NONE — a return value inside one process', reachable: 'src/deployment/work_worker.ts' }),
    Object.freeze({ source: 'WorkJobView.hostError / phase HOST_ERROR', durability: 'NONE — an in-memory Map entry in WorkDelegationService, empty after a restart', reachable: 'src/interaction/work_delegation.ts' }),
    Object.freeze({ source: 'confidential slot file <home>/confidential-workers/active.json', durability: 'durable but NONCANONICAL and about host capacity, not about one attempt', reachable: 'host/deployment/runtime/confidential_profile.js' }),
  ]),
  requiredFactsAndAvailability: Object.freeze([
    Object.freeze({ fact: 'project and Attempt identity', available: 'YES, canonical — but only reachable through the report path, which requires a successful observation' }),
    Object.freeze({ fact: 'host Job identity', available: 'host-local only, non-durable' }),
    Object.freeze({ fact: 'Worker process/session identity', available: 'PARTIAL — the child PID exists while the process is alive; it is not recorded anywhere durable' }),
    Object.freeze({ fact: 'observed exit/close or effective fencing', available: 'NO — see the fencing finding below' }),
    Object.freeze({ fact: 'relevant failure kind', available: 'YES as a host-local string' }),
    Object.freeze({ fact: 'Git World observation status', available: 'YES — but as a THROWN child-process error, not as a named value' }),
    Object.freeze({ fact: 'observation timestamp', available: 'NO durable one' }),
    Object.freeze({ fact: 'evidence digest and trusted producer', available: 'NO' }),
  ]),
  verdict: 'OPEN',
  gap: 'No durable host-controlled receipt exists. A new one is required before a terminal decision can be TRACEABLY BOUND to a failure observation, and §8 requires that traceability rather than a fabricated substitute.',
  constraintsOnAnyNewRecord: Object.freeze([
    'must come from a trusted host-controlled source',
    'must remain NONCANONICAL and must not become a second scheduler or Work authority',
    'must not store secrets or full model transcripts',
    "must not treat a worker's own description of failure as a host observation",
    'must prove durable readback after a fresh process restart',
    'must be non-rewritable so it cannot invent a different Attempt or a different exit status',
  ]),
});

export const WORKER_FENCING = Object.freeze({
  auditedPort: 'dshSubprocessWorkWorkerPort (src/deployment/work_worker.ts:605)',
  measuredFinding: 'The timeout path and the abort path each call `spawned.kill()` and then IMMEDIATELY `finish(hostFailure(...))`. The `close` callback is a SEPARATE handler that returns early via `settled`. So the outcome is reported from the KILL REQUEST, not from the confirmed exit.',
  frozenDistinction: 'KILL_REQUESTED != WORKER_EXIT_CONFIRMED',
  consequence: 'No cancellation may proceed solely from a timeout flag, an AbortSignal, or an in-memory HOST_ERROR. On this port the reported fact is a kill request, so a policy that required an observed exit could not be satisfied by it as written.',
  verdict: 'OPEN',
  windowsEnvelope: 'Under the supported Windows confidential single-active profile, the relevant condition is that ONE active worker is serialized by the profile; that serialization is proven by R1-HC. Arbitrary process-TREE security is NOT claimed and was not tested.',
});

/* ================================================================== *
 * §12 — THE NINE PREDICATES, MEASURED SEPARATELY
 * ================================================================== */

/**
 * §12 explicitly rejects R3-WR4's broad 11/12 claim. Each predicate is its own measurement, and quiescence uses
 * the existing Plan Reconciliation predicate rather than `preview === idle`.
 */
export const PREDICATE_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'DURABLE_ATTEMPT_STATE_OBSERVED', question: 'is the attempt\'s nonterminal state read from the durable store rather than from a return value?' }),
  Object.freeze({ id: 'DURABLE_HOST_FAILURE_RECEIPT', question: 'does a durable host-controlled receipt of the worker stop exist and read back after a restart?' }),
  Object.freeze({ id: 'WORLD_UNOBSERVABILITY_OBSERVED', question: 'is the world\'s Git unobservability measured as an observed failure?' }),
  Object.freeze({ id: 'AUTHORIZED_TERMINAL_DECISION', question: 'does an authorized principal actually decide the terminal, through a supported path?' }),
  Object.freeze({ id: 'LANE_RELEASED', question: 'is the terminal attempt absent from the open-attempt set?' }),
  Object.freeze({ id: 'FRESH_ATTEMPT_COMPLETED', question: 'does a fresh attempt reach COMPLETED?' }),
  Object.freeze({ id: 'INDEPENDENT_VERIFICATION_PASSED', question: 'did an independent verification actually pass — distinct from the attempt completing?' }),
  Object.freeze({ id: 'PROMOTION_ADMITTED', question: 'was a promotion admitted — distinct from verification passing?' }),
  Object.freeze({ id: 'PROJECT_QUIESCENCE_PROVEN', question: 'does the Plan Reconciliation predicate report quiescent, accounting for CREATED/LEASED/RUNNING attempts AND ACTIVE/VERIFYING tasks?' }),
]);

export const QUIESCENCE_RULE = Object.freeze({
  predicate: 'the existing Plan Reconciliation predicate (the head owner\'s `quiescence_required` blocker over current work state)',
  inputs: Object.freeze(['CREATED / LEASED / RUNNING Attempts', 'ACTIVE / VERIFYING Tasks']),
  rejectedWitnesses: Object.freeze(['preview === "idle"', 'the mere absence of a RUNNING attempt', 'a fresh Attempt left in CREATED']),
  note: 'An Attempt reaching COMPLETED does not imply Verification or Promotion, and a test that ends with a fresh Attempt still CREATED has NOT proven quiescence.',
});

/* ================================================================== *
 * EVIDENCE RECORD
 * ================================================================== */

export const VERDICTS = Object.freeze({
  'R3-WR5': 'COMPLETE',
  SUPPORTED_WORK_ADMISSION: 'CLOSED',
  WORLD_EFFECT_REUSE_AUTHORITY: 'CLOSED',
  CROSS_OPERATION_REACHABILITY: 'TRUSTED_ONLY',
  SINGLE_FLIGHT: 'PROVEN_WITHIN_ENVELOPE',
  WORKER_TERMINATION_FENCING: 'OPEN',
  DURABLE_HOST_FAILURE_EVIDENCE: 'OPEN',
  FAILURE_DISPOSITION_POLICY: 'POLICY_REQUIRED',
  UNOBSERVABLE_WORLD_TERMINAL_PATH: 'OPEN',
  POST_TERMINAL_PROJECT_CONTINUATION: 'OPEN',
  SYSTEM_VALID: 'YES within audited envelope',
  EXPERIMENT_ENVIRONMENT_VALID: 'YES',
  'R3-L0C RESUME QUALIFICATION': 'REQUIRES_EXPLICIT_FAIL_STOP_RULING',
});

export const VERDICT_BASIS = Object.freeze({
  SUPPORTED_WORK_ADMISSION_CLOSED: 'Every reachable path to world creation and reuse goes through ProjectController.claim, which enforces role-slot admission, budget admission, world-basis capture and the scheduler ATTEMPT_STARTED transition. The worker catalogue is structurally denied every `palimpsest_` tool except two read-only ones, and its only outbound channel is a strictly parsed pull envelope that cannot name an attempt, project, path or owner.',
  WORLD_EFFECT_REUSE_AUTHORITY_CLOSED: 'A world records the attempt and basis it was created for; a foreign owner (WORLD_OWNER_MISMATCH) or a different basis (WORLD_BASIS_MISMATCH) is refused before any mutating command. This stage adds the one narrow provenance check §3 authorises: the binding\'s `repository` field, which was written and read but never compared.',
  CROSS_OPERATION_REACHABILITY_TRUSTED_ONLY: 'The production callId is `world:<attemptId>`, a pure function of the attempt id, and the scope is the project id. Two supported calls for one attempt therefore produce the SAME operation id — C1, not C3. A distinct operation key for the same world requires a caller that supplies its own callId, which only in-process code already holding `effects.invoke` or `hostPort.invoke` can do. `hostPort` has zero production consumers, so the untrusted path cannot express C3.',
  SINGLE_FLIGHT_PROVEN_WITHIN_ENVELOPE: 'R3-WR4 measured one dispatch and a maximum of one active across six simultaneous same-key calls with every dispatch held open inside a harness-controlled window. §5 retains the explicit limitation: one runtime process over one durable ledger, no multi-process claim, and no expansion into distributed locking research.',
  WORKER_TERMINATION_FENCING_OPEN: 'The timeout and abort paths report the outcome from the KILL REQUEST, before the child `close` callback. KILL_REQUESTED != WORKER_EXIT_CONFIRMED is therefore the measured state, and a policy requiring an observed exit cannot be satisfied by this port as written. Arbitrary process-tree security is not claimed.',
  DURABLE_HOST_FAILURE_EVIDENCE_OPEN: 'No durable host-controlled receipt exists: HOST_FAILURE is a return value, the host job map is an in-memory Map that is empty after a restart, and the only durable file is the noncanonical confidential-slot record, which is about host capacity rather than one attempt. §8 requires traceability from the terminal decision to a failure observation, so the gap is reported rather than papered over.',
  FAILURE_DISPOSITION_POLICY_POLICY_REQUIRED: 'The proposed operator-cancellation policy is not admissible by the existing authority contract: the management involvement modes are explicitly non-authoritative, the only operator path persists a PREFERENCE rather than admitting a terminal event, and no trusted capability authorizes the transition. Implementing an unguarded terminal command is exactly what §6 forbids, so the exact decision contract is returned instead.',
  UNOBSERVABLE_WORLD_TERMINAL_PATH_OPEN: 'The failure is reproducible and the vocabulary can carry a null-report terminal for CANCELLED, but no authorized pathway can produce it, so the path is open by policy rather than by mechanism.',
  POST_TERMINAL_PROJECT_CONTINUATION_OPEN: 'R3-WR4 measured that the project CAN continue once an admissible terminal event exists, but the event cannot be produced under existing authority. §12 requires the predicates be measured separately rather than inherited, and the separate measurement is in this record.',
  SYSTEM_VALID_YES: 'Build, full unit suite, e2e, architecture, public API and the R3-S0/R3-L0B/R3-WR family regressions are green; the Windows confidential single-active profile is unchanged.',
  EXPERIMENT_ENVIRONMENT_VALID_YES: 'No stochastic model was run, R3-L0C\'s corpus, capital, oracle and verdicts are byte-untouched, and the protected historical evidence tree is unchanged.',
  R3L0C_RESUME_REQUIRES_RULING: 'Gate B is POLICY_REQUIRED and the worker-termination fencing is OPEN, so an attempt whose world becomes unobservable cannot be terminalized truthfully. A long-horizon experiment that can strand an attempt with no authorized terminal path would accumulate exactly the unresolved positions the experiment must not have. §16 names this specific status rather than a binary, because the blocker is a governance decision about fail-stop behaviour rather than a defect.',
});

export const RESIDUALS = Object.freeze([
  'C3 (a distinct operation key for an existing world) is permitted WITHIN THE TRUSTED-INTERNAL-API ENVELOPE and is not refused there, because the effect action receives no operation identity. The supported path cannot express it, but an in-process caller holding `effects.invoke` or `hostPort.invoke` can. §4 forbids a caller-asserted token and a second world owner, so this is recorded as an envelope boundary rather than repaired.',
  '`hostPort` (HostInvocationPort) is an ambient-authority seam with ZERO production consumers. It lets a caller mint its own {source, scope, callId} and bypass orchestrationAuthorization. It is not reachable from outside the process, and no shipped surface hands it out, but its existence means "trusted internal code can mint an arbitrary operation identity" is true by construction.',
  'KILL_REQUESTED != WORKER_EXIT_CONFIRMED: the worker port reports a timeout from the kill request rather than from the confirmed exit, so no terminal decision may rest on it as written.',
  'No durable host-failure receipt exists; §8\'s traceability requirement cannot be met without one.',
  'The world binding is EVIDENCE, not authority: a self-consistent rewrite is accepted, measured. It catches the accidental and careless case and is stated as such.',
  'Base divergence between `claim`\'s `project.head_commit` and the attempt\'s historical envelope is STRUCTURALLY unreachable in the supported path because `reconcileProjectHead()` refuses with `quiescence_required` while any attempt is open. This is a statement about the supported path, not a proof about every future change.',
  'The symlink variant of the common-directory shape could NOT be constructed on this host (EPERM without privilege), so it is unmeasured and unclaimed.',
  'Lease expiry remains CALLER-ASSERTED: `TaskEnvelope.lease_s` is never read by the attempt runtime and `lease_generation` is hardcoded null.',
  'The fence-mode HTTP claim route has no authentication against a local non-browser client. The caller still cannot mint an operation identity or choose a world, but this is a deployment-mode property rather than a code guarantee.',
]);

/**
 * Assemble the stage record from the frozen contracts plus the harness measurements, so the record is
 * REGENERABLE rather than hand-maintained.
 */
export function buildStageRecord(input = {}) {
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-WR5',
    kind: 'authorized world reuse and governed failure disposition',
    baseline: input.baseline ?? '0052cc1e9393c2788f1eef7d0f3fe9f77a03e0ba',
    branch: input.branch ?? 'r3-wr5-authorized-recovery',
    commits: Object.freeze(input.commits ?? []),
    carriedForward: CARRIED_FORWARD,
    callPathInventory: CALL_PATH_INVENTORY,
    attemptAuthorization: ATTEMPT_AUTHORIZATION_CONTRACT,
    reusePolicy: REUSE_POLICY,
    reachabilityWitnesses: input.reachabilityWitnesses ?? null,
    provenanceWitnesses: input.provenanceWitnesses ?? null,
    effectReplay: input.effectReplay ?? null,
    failureDispositionPolicy: FAILURE_DISPOSITION_POLICY,
    terminalSemantics: TERMINAL_SEMANTICS,
    hostFailureEvidence: HOST_FAILURE_EVIDENCE,
    workerFencing: WORKER_FENCING,
    brokenWorld: input.brokenWorld ?? null,
    predicates: input.predicates ?? null,
    predicateDefinitions: PREDICATE_DEFINITIONS,
    quiescenceRule: QUIESCENCE_RULE,
    mutationWitnesses: input.mutationWitnesses ?? null,
    policyRequirement: input.policyRequirement ?? null,
    regression: input.regression ?? null,
    verdicts: VERDICTS,
    verdictBasis: VERDICT_BASIS,
    residuals: RESIDUALS,
  });
}

/** Write the record. It writes ONE file and nothing else. */
export function writeStageRecord(record) {
  const directory = join(REPO_ROOT, STAGE_EVIDENCE_PATH);
  mkdirSync(directory, { recursive: true });
  const path = join(directory, 'stage-result.json');
  writeFileSync(path, `${JSON.stringify(record, null, 2)}${NL}`, 'utf8');
  return path;
}
