/**
 * R3-L0C-G1 §3 — THE SOURCE-GROUNDED PRODUCER CONTRACT.
 *
 * §3 requires a Producer → Evidence → Consumer → Authority table, built from the ACTUAL source rather than
 * from the report, and §12 C1 requires the source-level producer gaps and the exact observer guarantees to be
 * recorded BEFORE implementation. This module is that record, as data.
 *
 * WHAT IT IS NOT. It is not an owner. It creates no canonical Work fact, no AttemptId, no JobId, no scheduler
 * and no EvidenceStore. It names what the product already produces and what G1 adds, so a reader can check the
 * claim against `src/interaction/work_delegation.ts` and `src/deployment/work_worker.ts` line by line.
 *
 * PLAIN JAVASCRIPT (`.mjs`). The product files G1 touches are TypeScript; this stage-owned code is plain JS so
 * it stays outside the product's layer model entirely — `tools/architecture/graph.ts` walks only `src/` and
 * `host/`, so `scripts/r3l0c_g1/**` cannot introduce a forbidden layer edge.
 */
import { fileURLToPath } from 'node:url';

/** §1: the exact G1 baseline. */
export const BASELINE_COMMIT = 'fe18441de2ac40921ac4dcabe112a7670363b24a';

/** The repository root, resolved from this module's own location (`scripts/r3l0c_g1/`). */
export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/[/\\]$/u, '');

/** The line separator, as a named constant so no module re-derives it. */
export const NL = String.fromCharCode(10);

/** §0: the stage identity. */
export const STAGE = 'R3-L0C-G1';
export const STAGE_BRANCH = 'r3-l0c-g1-host-origin-evidence';

/** §1: the archived identities G1 must not disturb. */
export const ARCHIVED_IDENTITIES = Object.freeze({
  planId: 'r3-l0c-iar-lcfsh-primary-plan',
  planContentDigest: 'b6a163d0efbdc09e88972ac443dd704022a35b1258c8823cb25084005991b034',
  executionClosureDigest: 'e850e1c509b854be977e039e33a748b3c9226b67067a607efa38a894b9f5dfc6',
  evidenceSealDigest: 'adfdec91a27c6b2f00f1e5e7af83fc8ea189f360fac0b29f0412fd4851bb5bfc',
  priorStageHead: '751f2e2257dc00e4a5a289afa1bdd38a14f7d422',
});

/**
 * §3: THE PRODUCER HIERARCHY, each row citing the actual source location and the actual producer.
 *
 * `canonical` is the load-bearing column: exactly one owner per fact, and G1 adds none.
 */
export const PRODUCER_HIERARCHY = Object.freeze([
  Object.freeze({
    fact: 'Work AttemptId',
    producer: 'Work owner (ProjectController.prepareMutatingWork)',
    producerLocation: 'src/tools/controller.ts prepareMutatingWork -> stableEntityId("attempt", digest)',
    canonical: true,
    durable: true,
    evidenceBoundary: 'the canonical Work event log',
    g1Consumes: true,
    g1Owns: false,
  }),
  Object.freeze({
    fact: 'Host-local JobId',
    producer: 'Work Delegation host service (makeWorkDelegationService.start)',
    producerLocation: 'src/interaction/work_delegation.ts:218 `wdj-${randomUUID()}`',
    canonical: false,
    durable: false,
    evidenceBoundary: 'host-local Map, lost on restart',
    g1Consumes: true,
    g1Owns: false,
    note: 'explicitly NOT durable canonical Work identity; an observation naming it does not make it canonical',
  }),
  Object.freeze({
    fact: 'Prepared execution world path',
    producer: 'Work owner, materialized by the Git world port',
    producerLocation: 'src/effects/git_port.ts worldPath() -> `<worktreeRoot>/<attemptId>`; worktreeRoot = `.palimpsest/worlds`',
    canonical: true,
    durable: true,
    evidenceBoundary: 'the filesystem path the Work owner derived from the AttemptId',
    g1Consumes: true,
    g1Owns: false,
  }),
  Object.freeze({
    fact: 'Direct child process identity (pid)',
    producer: 'Deployment port (dshSubprocessWorkWorkerPort.run -> Node spawn)',
    producerLocation: 'src/deployment/work_worker.ts:640 `const spawned = spawn(nodeExecPath, [...])`',
    canonical: false,
    durable: false,
    evidenceBoundary: 'the host process; NOT returned by the port today',
    g1Consumes: true,
    g1Owns: false,
    note: 'this is the fact G1 makes observable; it proves a direct child existed, nothing more',
  }),
  Object.freeze({
    fact: 'Worker outcome (READY_FOR_SETTLEMENT | NEEDS_ESCALATION)',
    producer: 'Worker process, re-read strictly by the host (parseWorkWorkerResult)',
    producerLocation: 'src/deployment/work_worker.ts:298 parseWorkWorkerResult',
    canonical: false,
    durable: true,
    evidenceBoundary: 'testimony, re-read on the host side of the boundary',
    g1Consumes: true,
    g1Owns: false,
    note: 'testimony, never a Work terminal fact',
  }),
  Object.freeze({
    fact: 'Attempt terminal state / settlement',
    producer: 'Work owner (ProjectController.settleMutatingWork)',
    producerLocation: 'src/tools/controller.ts settleMutatingWork',
    canonical: true,
    durable: true,
    evidenceBoundary: 'the canonical Work event log',
    g1Consumes: false,
    g1Owns: false,
    note: 'G1 must never produce this; an observer cannot settle, verify or promote',
  }),
  Object.freeze({
    fact: 'Research RunId',
    producer: 'Research harness run root claim + RUN_STARTED journal record',
    producerLocation: 'scripts/r3l0cf/fail-stop.mjs claimRunRoot; scripts/r3l0cf/journal.mjs',
    canonical: false,
    durable: true,
    evidenceBoundary: 'the append-only run journal and the run-root claim file',
    g1Consumes: true,
    g1Owns: false,
    note: 'individual TRIAL_RECORDED payloads carry no runId; the run relationship comes from RUN_STARTED + the validated claim, never from a caller-supplied string',
  }),
]);

/** §3: the source-level producer gaps G1 closes and the ones it deliberately leaves open. */
export const PRODUCER_GAPS = Object.freeze([
  Object.freeze({
    id: 'GAP-1',
    gap: 'the Deployment port observes the direct child (spawn handle, close event) but returns only a worker outcome or HOST_FAILURE; the process observation is discarded',
    sourceLocation: 'src/deployment/work_worker.ts:208 WorkWorkerExecutionOutcome (kind/detail only)',
    closedByG1: true,
    closure: 'an optional host-only observation callback carried on the run input',
  }),
  Object.freeze({
    id: 'GAP-2',
    gap: 'nothing correlates a process observation with the canonical AttemptId and the host-local JobId, because the port deliberately does not receive an attempt id',
    sourceLocation: 'src/deployment/work_worker.ts:244 "The port deliberately does not receive an attempt id"',
    closedByG1: true,
    closure: 'the Work Delegation host service, which already holds prepared.attemptId and its own jobId, wraps the port observation',
  }),
  Object.freeze({
    id: 'GAP-3',
    gap: 'no durable record preserves a host observation, so no later consumer can distinguish an authentic local observation from a caller declaration',
    sourceLocation: 'absent in the product',
    closedByG1: true,
    closure: 'a stage-owned recorder writing sanitized structural metadata, with a content digest and re-read verification',
  }),
  Object.freeze({
    id: 'GAP-4',
    gap: 'the Artifact path parsers disagree: the segment-anchored parser requires `attempt-<hex>` as a whole path segment, while the real DSH layout embeds the attempt hex inside a cwd slug terminated by `--`',
    sourceLocation: 'scripts/r3l0ciarlcf/artifact-identity.mjs:77 vs scripts/r3l0c/instrumentation.mjs:62',
    closedByG1: 'PARTIAL',
    closure: 'a source-grounded read-only locator for the documented slug grammar; REAL_DSH_ARTIFACT_COMPATIBILITY stays NOT_ESTABLISHED because no authentic frozen-experiment artifact was observed',
  }),
  Object.freeze({
    id: 'GAP-5',
    gap: 'no execution witness can be produced: runId is absent from the durable per-trial record and the port discards the worker process identity',
    sourceLocation: 'scripts/r3l0cf/contract.mjs JOURNAL_FIELDS (no runId); src/deployment/work_worker.ts (no pid)',
    closedByG1: 'PARTIAL',
    closure: 'G1 produces the local host observation and the run/attempt correlation, but LIVE_PRIMARY_PROVENANCE stays NOT_ESTABLISHED: a genuine DSH worker and the actual provider route remain unobserved',
  }),
]);

/** §4: the observation event kinds. Only events the host can ACTUALLY observe are named. */
export const OBSERVATION_EVENT_KINDS = Object.freeze([
  'DIRECT_CHILD_SPAWN_ATTEMPTED',
  'DIRECT_CHILD_SPAWN_OBSERVED',
  'DIRECT_CHILD_SPAWN_ERROR',
  'DIRECT_CHILD_EXIT_OBSERVED',
  'DIRECT_CHILD_EXIT_UNCONFIRMED',
  'DIRECT_CHILD_TIMEOUT_REQUESTED',
  'DIRECT_CHILD_ABORT_REQUESTED',
]);

/** §4: the process roles the host can honestly distinguish. A direct child is NOT the final DSH process. */
export const PROCESS_ROLES = Object.freeze(['DIRECT_CHILD', 'UNKNOWN']);

/**
 * §4 G1-I4: what a direct-child observation PROVES and what it explicitly does NOT.
 *
 * These two lists travel ON every observation, so a consumer cannot read a pid as more than it is.
 */
export const OBSERVATION_PROVES = Object.freeze([
  'the Host obtained a direct-child process identity from spawn()',
  'the Host observed a lifecycle event for THAT direct child',
]);

export const OBSERVATION_DOES_NOT_PROVE = Object.freeze([
  'that a downstream wrapper spawned the genuine DSH binary',
  'that the provider/model route actually executed',
  'that a remote model request occurred',
  'that a descendant exited when the direct child exited',
  'that the Work Attempt was canonically completed',
  'that the artifact belongs to this attempt',
]);

/** §4: the observation schema version, so a consumer can refuse an unknown shape. */
export const OBSERVATION_SCHEMA_VERSION = 1;

/** §4: the fields every observation carries, and which are nullable when genuinely unobserved. */
export const OBSERVATION_FIELDS = Object.freeze([
  'schemaVersion',
  'producer',
  'eventKind',
  'invocationId',
  'sequence',
  'observedAt',
  'directChildPid',
  'processRole',
  'exitCode',
  'exitSignal',
  'hostFailureDetail',
  'executableIdentity',
  'proves',
  'doesNotProve',
]);

/** §6: the trust-boundary states a research consumer must keep separate. */
export const EVIDENCE_STATES = Object.freeze([
  'DECLARATION_ONLY',
  'LOCAL_HOST_OBSERVED',
  'RUN_ATTEMPT_CORRELATED',
  'PROVENANCE_INCOMPLETE',
  'PROVENANCE_CONFLICT',
  'LIVE_PRIMARY_NOT_ESTABLISHED',
]);

/**
 * §6: the same states as a NAMED lookup, so code reads `EVIDENCE_STATE.RUN_ATTEMPT_CORRELATED` rather than an
 * index. Both are exported from the ONE declaration, so they cannot drift.
 */
export const EVIDENCE_STATE = Object.freeze(
  Object.fromEntries(EVIDENCE_STATES.map((state) => [state, state])),
);

/** §6: the correlation chain, each step with the producer that legitimately owns it. */
export const CORRELATION_CHAIN = Object.freeze([
  Object.freeze({ step: 'RUN_STARTED', owner: 'the run journal' }),
  Object.freeze({ step: 'VALIDATED_RUN_CLAIM', owner: 'the run-root claim file, re-read and nonce-checked' }),
  Object.freeze({ step: 'FROZEN_SCHEDULED_SESSION', owner: 'the frozen schedule' }),
  Object.freeze({ step: 'DURABLE_TRIAL_ATTEMPT_IDENTITY', owner: 'the Work owner, via the journal TRIAL_RECORDED attemptId' }),
  Object.freeze({ step: 'HOST_LOCAL_JOB_ASSOCIATION', owner: 'the Work Delegation host service' }),
  Object.freeze({ step: 'HOST_PRIVATE_PORT_INVOCATION', owner: 'the Deployment port' }),
  Object.freeze({ step: 'OBSERVED_DIRECT_CHILD_LIFECYCLE', owner: 'the Deployment port observation callback' }),
]);

/** §7: the locator rules, each stated as a refusal the locator must make. */
export const ARTIFACT_LOCATOR_RULES = Object.freeze([
  'stay within the expected scoped DSH Home',
  'use the actual documented path grammar',
  'extract the complete canonical AttemptId only when the grammar proves the boundary',
  'compare against the Work Attempt identity using exact normalized equality',
  'reject partial/prefix collisions',
  'reject ambiguous multiple candidates',
  'reject missing identity',
  'reject stale or unrelated Session candidates',
  'refuse symlink or traversal escapes from the declared home',
  'never choose the newest Artifact merely by mtime',
]);

/** §7: the two evidence levels, which must never be conflated. */
export const LOCATOR_EVIDENCE_LEVELS = Object.freeze({
  TESTED: 'ARTIFACT_LOCATOR_GRAMMAR_TESTED',
  REAL: 'REAL_DSH_ARTIFACT_COMPATIBILITY',
  realRequiresAuthenticEvidence: true,
});

/** §14: the measured verdict vocabulary. */
export const FINAL_VERDICTS = Object.freeze([
  'HOST_OBSERVATION_PRODUCER',
  'DIRECT_CHILD_PID_OBSERVED',
  'DIRECT_CHILD_EXIT_OBSERVED',
  'DIRECT_CHILD_EXIT_UNCERTAINTY_PRESERVED',
  'WORK_ATTEMPT_CORRELATION',
  'HOST_LOCAL_JOB_CORRELATION',
  'RUN_JOURNAL_BINDING',
  'OBSERVATION_DURABILITY',
  'OBSERVATION_ORIGIN_BOUNDARY',
  'MODEL_VISIBLE_CONTEXT_UNCHANGED',
  'WORK_SEMANTICS_UNCHANGED',
  'ARTIFACT_LOCATOR_GRAMMAR',
  'REAL_DSH_ARTIFACT_COMPATIBILITY',
  'REAL_DSH_WORKER_PROCESS_ATTESTED',
  'ACTUAL_ROUTE_ATTESTED',
  'LIVE_PRIMARY_PROVENANCE',
  'EXTERNAL_AUTHORITY',
  'HOST_SPEND_ENFORCEMENT',
  'CURRENT_LAUNCH_PERMISSION',
  'PAID_EXECUTION',
  'CAUSAL_RESULT',
  'HISTORICAL_EVIDENCE_IMMUTABILITY',
]);

/** §14: the verdict states, so no verdict is a bare string. */
export const VERDICT_STATES = Object.freeze(['PASS', 'FAIL', 'NOT_ESTABLISHED', 'BLOCKED', 'NOT_RUN', 'NOT_EVALUABLE']);

/** §14: a local non-model producer is qualified ONLY at its own limited evidence class. */
export const LOCAL_EVIDENCE_CLASS = Object.freeze({
  PASS: 'PASS_LOCAL_NONMODEL',
  scope: 'a real direct child process on this host, exercising the actual product port and the actual Work Delegation interface, with no model, provider or remote service involved',
  doesNotProve: 'that a genuine DSH worker ran, that a provider route executed, or that any LIVE_PRIMARY observation exists',
});

/** §14: verdicts that must never be promoted to PASS by this stage. */
export const UNEARNED_VERDICTS = Object.freeze([
  'REAL_DSH_ARTIFACT_COMPATIBILITY',
  'REAL_DSH_WORKER_PROCESS_ATTESTED',
  'ACTUAL_ROUTE_ATTESTED',
  'LIVE_PRIMARY_PROVENANCE',
  'EXTERNAL_AUTHORITY',
  'HOST_SPEND_ENFORCEMENT',
]);

/** §0/§8: the prohibitions, as data a report can cite. */
export const PROHIBITIONS = Object.freeze([
  'launch a genuine DSH model worker',
  'make paid model or API calls',
  'probe the provider with an experimental prompt',
  'enable PRIMARY in any research pipeline',
  'remove an existing PRIMARY launch prohibition',
  'modify frozen R3-L0C experimental code or evidence',
  'change the frozen scientific design',
  'modify the Work Attempt state machine, settlement rules or promotion authority',
  'add AttemptId or HostJobId to the model-visible context',
  'add a universal EvidenceStore, canonical Worker Owner or new scheduler',
  'manufacture a trusted execution witness',
  'introduce a new sixteen-session research Pipeline',
  'generate a replacement paid-execution prospective plan',
  'create external authorization or hard-budget controls by declaration',
  'begin R3-L1 or Fusion',
  'merge into main',
]);

/** §0: the non-model stub's own boundary, so the permitted test rig is explicit. */
export const STUB_BOUNDARY = Object.freeze({
  permitted: 'an isolated, local, non-model Node child-process stub exercising the real subprocess port',
  forbidden: 'invoking @deepseek-ai/dsh, a configured provider route or any remote service',
  modelCallsMade: 0,
});

/** §10: the closure consequence of touching product Host/Work code. */
export const CLOSURE_CONSEQUENCE = Object.freeze({
  ARCHIVED_PLAN_PRESERVED: true,
  CURRENT_G1_EXECUTION_CLOSURE: 'NEW_CODE_STATE',
  G1_PRIMARY_PLAN_FROZEN: false,
  G1_PRIMARY_EXECUTION_AUTHORIZED: false,
});

/** A compact, machine-readable summary for a report or a test to assert against. */
export function contractSummary() {
  return Object.freeze({
    stage: STAGE,
    baseline: BASELINE_COMMIT,
    producers: PRODUCER_HIERARCHY.length,
    gaps: PRODUCER_GAPS.length,
    gapsClosedByG1: PRODUCER_GAPS.filter((gap) => gap.closedByG1 === true).length,
    observationEventKinds: OBSERVATION_EVENT_KINDS.length,
    evidenceStates: EVIDENCE_STATES.length,
    verdicts: FINAL_VERDICTS.length,
    unearnedVerdicts: UNEARNED_VERDICTS.length,
    prohibitions: PROHIBITIONS.length,
    addsCanonicalOwner: false,
    addsEvidenceStore: false,
    addsScheduler: false,
  });
}
