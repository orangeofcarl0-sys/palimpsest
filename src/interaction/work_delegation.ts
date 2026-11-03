/**
 * PLMP-LEAN-1 §D2-d — HOST-LOCAL ASYNCHRONOUS WORK EXECUTION TRANSPORT.
 *
 * The whole design is one equation:
 *
 *     Async D2 = existing synchronous semantics + different lifetime/transport
 *
 * NOT "new scheduler semantics". `prepare`, `run`, `settle`, the completion invariant, basis admission,
 * verification, eligibility and promotion authority are all frozen and unchanged; this module adds a
 * non-blocking `start`, a host-local job lifetime, observation, restart honesty — and nothing else.
 *
 * That is why there is exactly ONE blocking kernel below (`executeMutatingWorkBlocking`) and the async
 * layer is a thin wrapper over it. Two implementations — `syncPrepare` + `asyncRun` +
 * `asyncSpecificSettlement` — would drift within a release, and the drift would be invisible until an
 * async attempt settled under rules the sync path does not share.
 *
 * TWO PLANES, NEVER CONFUSED:
 *
 *     HostJobState  !=  AttemptState          HostJob  is NOT  canonical Project truth
 *
 * The job map is a RUNTIME AID this process holds for Promise ownership, observation and error
 * reporting. It is deliberately thin — an invocation handle, an execution promise and minimal
 * observation metadata — because a job entry that accumulates task definitions, authority state, retry
 * counts and verification status is a scheduler database without durability, which is exactly what this
 * must never become. Every project fact still comes from the canonical layers.
 *
 * Consequently there is no bypass of the form `job FINISHED ⇒ ATTEMPT_COMPLETED`, and no
 * `job HOST_ERROR ⇒ ATTEMPT_FAILED`. The ONLY thing that completes an attempt is
 * `settleMutatingWork()`, and a host failure to keep observing work is not a statement about the work.
 *
 * RESTART HONESTY is stated as plainly as it can be: host-local jobs are NOT durable. After a restart
 * the map is empty, and the canonical project says what is true on its own —
 *
 *     crash before prepare      → nothing started (the host accepted an invocation, nothing more)
 *     crash after prepare       → ATTEMPT RUNNING with its world retained: orphaned execution stays
 *                                 canonically UNRESOLVED. Not failed, not auto-resumed.
 *     crash after a commit      → the same, with a result commit in the world (future recovery input)
 *     crash inside settle       → D2-e1's three windows already close this: export/report replay
 *     crash after settle        → ATTEMPT COMPLETED, and the job map's loss changes nothing
 *
 * INTERNAL: not re-exported by the interaction barrel, so it adds no package public name.
 */
import { randomUUID } from "node:crypto";

import type { ProjectController } from "../tools/controller.js";

/**
 * R3-L0C-G1 §4/§5 — THE HOST PROCESS-OBSERVATION CONTRACT.
 *
 * WHY IT LIVES HERE. The observation vocabulary belongs to the WORKER PORT CONTRACT, and this module already
 * declares that contract (`WorkWorkerRunPort`). Declaring it in the port's own interface is what keeps ONE
 * description of the seam: the L5 deployment port imports these types (L5 → L3 is an allowed direction and the
 * one `src/deployment/launch.ts` already uses), while L3 cannot import L5. Putting it in the deployment module
 * would make the delegation service's use of it a forbidden L3 → L5 edge, and duplicating the shape in both
 * layers is exactly the drift R1-L §18 removed.
 *
 * WHAT AN OBSERVATION IS NOT (§G1-I2). It is evidence of an observed PROCESS EVENT. It is not Work settlement,
 * Project proof, task completion, provider authorization, a model result or permission to launch more work. The
 * `proves` / `doesNotProve` lists travel ON every observation so no consumer can read a pid as more than it is.
 *
 * THE CRITICAL DISTINCTION (§4, §G1-I4). `spawned.pid` proves at most that the Host obtained a DIRECT-CHILD
 * process identity. It does not prove a downstream wrapper spawned the genuine DSH binary, that the provider
 * route executed, that a remote request occurred, that a descendant exited with the child, or that the Attempt
 * was canonically completed. The schema exposes this rather than hiding it.
 */

/** §4: the observation schema version, so a consumer can refuse an unknown shape. */
export const HOST_OBSERVATION_SCHEMA_VERSION = 1;

/**
 * §4: the event kinds. Only events the host can ACTUALLY observe are named.
 *
 * `DIRECT_CHILD_EXIT_UNCONFIRMED` is the honest counterpart of `DIRECT_CHILD_EXIT_OBSERVED`: a child that was
 * spawned and never produced a close event before the host stopped waiting did NOT cleanly exit, and the
 * vocabulary says so instead of leaving the absence to be read as success.
 */
export const HOST_OBSERVATION_EVENT_KINDS = [
  "DIRECT_CHILD_SPAWN_ATTEMPTED",
  "DIRECT_CHILD_SPAWN_OBSERVED",
  "DIRECT_CHILD_SPAWN_ERROR",
  "DIRECT_CHILD_EXIT_OBSERVED",
  "DIRECT_CHILD_EXIT_UNCONFIRMED",
  "DIRECT_CHILD_TIMEOUT_REQUESTED",
  "DIRECT_CHILD_ABORT_REQUESTED",
] as const;
export type HostObservationEventKind = (typeof HOST_OBSERVATION_EVENT_KINDS)[number];

/**
 * §4: the process roles the host can honestly distinguish.
 *
 * There is deliberately NO `DSH_WORKER` role: a direct child may be a wrapper, and G1 has no ancestry evidence
 * to promote it. `UNKNOWN` is the honest value when the host cannot classify what it spawned.
 */
export const HOST_PROCESS_ROLES = ["DIRECT_CHILD", "UNKNOWN"] as const;
export type HostProcessRole = (typeof HOST_PROCESS_ROLES)[number];

/** §4: the sanitized executable identity — digests and a basename, never a raw path or an environment value. */
export interface HostExecutableIdentity {
  /** The port's own adapter id, which names the implementation rather than the machine. */
  readonly adapterId: string;
  /** A digest of the Node executable path actually used; the path itself is not recorded. */
  readonly nodeExecutableDigest: string;
  /** The WORKER BIN's basename only — the last path segment, never the directory. */
  readonly workerBinBasename: string;
  /** A digest of the worker bin path actually supplied to the port. */
  readonly workerBinDigest: string;
}

/**
 * §4: ONE host observation.
 *
 * Nullable fields are the point: `directChildPid`, `exitCode` and `exitSignal` are null when the host did not
 * observe them, so a reader can tell "not observed" from "observed as zero".
 */
export interface HostProcessObservation {
  readonly schemaVersion: number;
  /** The producer identity: which host component observed this. */
  readonly producer: string;
  readonly eventKind: HostObservationEventKind;
  /** The per-invocation identity this observation belongs to. */
  readonly invocationId: string;
  /** Monotonic per-invocation sequence, so an order is recoverable. */
  readonly sequence: number;
  readonly observedAt: string;
  /** The direct child's pid, when the Host actually obtained one; null otherwise. */
  readonly directChildPid: number | null;
  readonly processRole: HostProcessRole;
  readonly exitCode: number | null;
  readonly exitSignal: string | null;
  /** The host-side failure detail, when this observation accompanies one. */
  readonly hostFailureDetail: string | null;
  readonly executableIdentity: HostExecutableIdentity;
  /** §4: what this observation proves, stated on the observation itself. */
  readonly proves: readonly string[];
  /** §4: what it explicitly does NOT prove. */
  readonly doesNotProve: readonly string[];
}

/**
 * §4: the host-only sink. NONCANONICAL: it receives observations and returns nothing, so an observer has no
 * channel through which to affect the worker's outcome. A sink that throws must not change what `run` returns.
 */
export type WorkObservationSink = (observation: HostProcessObservation) => void;

/**
 * §5: an observation CORRELATED with the canonical AttemptId and the host-local JobId.
 *
 * `hostLocalJobId` is named that way on purpose: the host job id is ephemeral and non-durable, and persisting
 * an observation naming it does not make it canonical Work identity. `attemptId` is the canonical one, taken
 * from `prepared.attemptId` — never from a caller's claim.
 */
export interface CorrelatedHostObservation {
  readonly hostLocalJobId: string;
  readonly attemptId: string;
  readonly invocationId: string;
  readonly observation: HostProcessObservation;
}

/** §5: the correlated sink a research consumer attaches. Also noncanonical and also return-nothing. */
export type WorkCorrelatedObservationSink = (observation: CorrelatedHostObservation) => void;

/**
 * Trajectory-P2A §8.1: a SESSION IDENTITY observation CORRELATED with the canonical AttemptId and the
 * host-local JobId.
 *
 * The same ownership rule as `CorrelatedHostObservation`, applied to the identity observation: the
 * AttemptId is canonical Work's, the JobId is this service's, and the invocation/identity pair is the
 * producer's. This is a HOST OBSERVATION correlated with Work identity — it is NOT a durable binding and
 * it does not make the association verified.
 */
export interface CorrelatedSessionIdentityObservation {
  readonly hostLocalJobId: string;
  readonly attemptId: string;
  readonly observation: WorkerSessionIdentityObservation;
}

/** §8.1: the correlated identity sink. Optional, noncanonical and return-nothing, exactly like the above. */
export type WorkCorrelatedSessionIdentitySink = (observation: CorrelatedSessionIdentityObservation) => void;

/** §4: the honest scope lists, as data so every observation carries them rather than restating them. */
export const HOST_OBSERVATION_PROVES = Object.freeze([
  "the Host obtained a direct-child process identity from spawn()",
  "the Host observed a lifecycle event for THAT direct child",
]);

export const HOST_OBSERVATION_DOES_NOT_PROVE = Object.freeze([
  "that a downstream wrapper spawned the genuine DSH binary",
  "that the provider/model route actually executed",
  "that a remote model request occurred",
  "that a descendant exited when the direct child exited",
  "that the Work Attempt was canonically completed",
  "that the artifact belongs to this attempt",
]);

/**
 * Trajectory-P2A §7.3/§11 — THE WORKER SESSION IDENTITY OBSERVATION CONTRACT.
 *
 * WHY IT LIVES HERE, beside `HostProcessObservation`. The identity vocabulary belongs to the WORKER PORT
 * CONTRACT, and this module already declares that contract. The L5 deployment port imports these types
 * (L5 → L3 is allowed, and `HostProcessObservation` is imported by `src/deployment/work_worker.ts` for
 * exactly this reason), while L3 cannot import L5. Declaring it in the deployment module would make the
 * delegation service's use of it a forbidden L3 → L5 edge.
 *
 * WHAT THIS OBSERVATION IS. The Parent received a structured message, on the IPC channel of the
 * ChildProcess IT spawned, reporting the SessionId of the DSH Session that child's Host created.
 *
 * WHAT IT IS NOT (§11.2, §7.4). It is NOT a durable Attempt→Session binding, NOT proof that the
 * child's executable was an authentic first-party DSH Host, NOT proof that a model turn ran, NOT proof
 * that the worker passed capability admission, NOT a Work outcome, and NOT promotion. The `proves` /
 * `doesNotProve` lists travel ON the observation so a consumer cannot read receipt as more than it is.
 *
 * A SEPARATE OBSERVATION, NEVER A FIELD ON THE PROCESS OBSERVATION (§7.3). The identity is not written
 * into `HostProcessObservation.hostFailureDetail`, is not labelled a spawn or exit event, and does not
 * claim the direct child's pid IS the session's identity. The pid is recorded only as the transport
 * anchor that carried the report.
 */
export const WORKER_SESSION_IDENTITY_SCHEMA_VERSION = 1;

/** §7.3: the ONLY honest source for this observation today: a direct-child IPC report. */
export const WORKER_SESSION_IDENTITY_SOURCES = ["DIRECT_CHILD_IPC_REPORT"] as const;
export type WorkerSessionIdentitySource = (typeof WORKER_SESSION_IDENTITY_SOURCES)[number];

/**
 * §7.4/§10.2: THE SOURCE-QUALIFICATION DIMENSION, kept SEPARATE from the observation state.
 *
 * A correctly shaped message from a configured ChildProcess proves the Parent received a message on
 * that channel. It does NOT prove the executable behind `dshBin` was an authentic first-party DSH Host
 * — the binary may be a wrapper, a configured alternative or a controlled fixture. Collapsing these
 * into one confidence ladder is exactly the overclaim §10.2 forbids, so receipt and provenance are two
 * independent fields.
 */
export const WORKER_SESSION_SOURCE_QUALIFICATIONS = ["CONTROLLED_STUB", "DIRECT_CHILD_IPC", "FIRST_PARTY_DSH_QUALIFIED"] as const;
export type WorkerSessionSourceQualification = (typeof WORKER_SESSION_SOURCE_QUALIFICATIONS)[number];

/**
 * §11: the bounded observation STATE for ONE invocation.
 *
 * `NOT_OBSERVED` is the honest value when no identity report arrived — it is NOT evidence that no
 * session was created (§7.7).
 */
export const WORKER_SESSION_IDENTITY_STATES = ["NOT_OBSERVED", "OBSERVED", "CONFLICT"] as const;
export type WorkerSessionIdentityState = (typeof WORKER_SESSION_IDENTITY_STATES)[number];

export interface WorkerSessionIdentityObservation {
  readonly schemaVersion: number;
  /** The Parent-owned invocation identity this report was received on. */
  readonly invocationId: string;
  readonly dshSessionId: string;
  /**
   * Trajectory-P2-D0 §6.3: the SessionId THIS IPC message actually reported, kept distinct from the
   * tracker's cumulative `dshSessionId`.
   *
   * The cumulative field is always the FIRST observed identity, so a consumer that persists only it
   * silently loses every later, genuinely-observed identity (F1: A/B/C collapse to {A}). This field is
   * the RAW report of the current message, so the durable ingestion path can preserve every distinct
   * observation as its own immutable candidate. On the first report the two are equal.
   */
  readonly reportedSessionId: string;
  readonly source: WorkerSessionIdentitySource;
  /** §7.3: the direct child that carried the report, as a TRANSPORT anchor — never the session's identity. */
  readonly directChildPid: number | null;
  readonly observedAt: string;
  readonly sourceQualification: WorkerSessionSourceQualification;
  /**
   * §7.5: the tracker state AT THE MOMENT this observation was reported, so a consumer can distinguish a
   * settled identity from one that later conflicted. The observation object itself is immutable, so this
   * is the state as of reporting rather than a live view.
   */
  readonly observationState: WorkerSessionIdentityState;
  /** §7.5: the disagreeing identity, when one was observed; null otherwise. */
  readonly conflictingSessionId: string | null;
  readonly proves: readonly string[];
  readonly doesNotProve: readonly string[];
}

/** §7.3: what one receipt actually establishes, stated on the observation. */
export const WORKER_SESSION_IDENTITY_PROVES = Object.freeze([  "the Parent received a well-formed session-identity message on the IPC channel of a ChildProcess it spawned",
  "the Parent associated that report with its OWN invocation identity",
  "the message reported a specific, well-formed DSH SessionId",
]);

/** §11.2: what it explicitly does NOT establish. */
export const WORKER_SESSION_IDENTITY_DOES_NOT_PROVE = Object.freeze([
  "that the configured executable was an authentic first-party DSH Host",
  "that the reported Session was created by an actual agents.create() call",
  "that a model turn ran in that Session",
  "that the Session's history is durable or complete",
  "that the Worker passed capability admission",
  "that the Work Attempt completed, was verified or was promoted",
  "that the association survives a Parent restart",
  "that the Session belongs to a durable, verified Attempt association",
]);

/**
 * §7.3: the host-only sink the port calls for ONE observed identity. NONCANONICAL and return-nothing: a
 * sink that throws must not change the port's outcome, and the port never reads anything back from it.
 */
export type WorkSessionIdentitySink = (observation: WorkerSessionIdentityObservation) => void;

/**
 * §7.5: THE PER-INVOCATION IDENTITY TRACKER.
 *
 * One of these exists per port invocation. It holds the observed state and enforces the ruled
 * repetition semantics WITHOUT any persistent store — the lifetime is exactly the invocation's:
 *
 *   first valid report      establishes the observed identity
 *   repeated identical      is idempotent (state stays OBSERVED, same id)
 *   two DIFFERENT valid ids an explicit CONFLICT; neither is chosen
 *   invalid message         never displaces a valid observation, and never creates one
 *
 * Message ORDER never decides authority: the first id is not "the winner", it is simply the first
 * observation, and a later disagreement is reported as a conflict rather than resolved by arrival time.
 */
export interface WorkerSessionIdentityTracker {
  /** The CURRENT state, or NOT_OBSERVED before any valid report. */
  readonly state: WorkerSessionIdentityState;
  /** The observed identity when `state === OBSERVED`; null otherwise. */
  readonly sessionId: string | null;
  /** §7.5: the conflicting identity when `state === CONFLICT`; null otherwise. */
  readonly conflictingSessionId: string | null;
  /** The observation, once one exists. Never fabricated. */
  readonly observation: WorkerSessionIdentityObservation | null;
  /** Record ONE received report. Returns the state after the call. */
  readonly observe: (input: { readonly sessionId: string; readonly directChildPid: number | null; readonly sourceQualification: WorkerSessionSourceQualification }) => WorkerSessionIdentityState;}

/**
 * §7.5: build the tracker for ONE invocation. `invocationId` is the PARENT's own identity, captured by
 * the `run()` closure — never taken from a message.
 */
export function makeWorkerSessionIdentityTracker(input: { readonly invocationId: string; readonly observedAt?: () => string }): WorkerSessionIdentityTracker {
  const now = input.observedAt ?? (() => new Date().toISOString());
  let state: WorkerSessionIdentityState = "NOT_OBSERVED";
  let sessionId: string | null = null;
  let conflictingSessionId: string | null = null;
  let observation: WorkerSessionIdentityObservation | null = null;
  let firstObservedAt = "";
  let firstPid: number | null = null;
  let qualification: WorkerSessionSourceQualification = "DIRECT_CHILD_IPC";
  /**
   * §6.3: the SessionId of the CURRENT report, kept beside the cumulative first-observed identity so the
   * rebuilt observation always carries what THIS message reported.
   */
  let reportedSessionId: string | null = null;

  /**
   * §7.5: the observation is REBUILT on every state change rather than frozen once, so a consumer that
   * reads it after a conflict sees `observationState: CONFLICT` and the disagreeing identity. The
   * `dshSessionId` stays the FIRST observed identity — it is retained as evidence, not promoted to
   * authority, which is exactly why the state field exists beside it.
   */
  const rebuild = (): void => {
    if (sessionId === null) {
      observation = null;
      return;
    }
    observation = Object.freeze({
      schemaVersion: WORKER_SESSION_IDENTITY_SCHEMA_VERSION,
      invocationId: input.invocationId,
      dshSessionId: sessionId,
      reportedSessionId: reportedSessionId ?? sessionId,
      source: "DIRECT_CHILD_IPC_REPORT" as const,
      directChildPid: firstPid,
      observedAt: firstObservedAt,
      sourceQualification: qualification,
      observationState: state,
      conflictingSessionId,
      proves: WORKER_SESSION_IDENTITY_PROVES,
      doesNotProve: WORKER_SESSION_IDENTITY_DOES_NOT_PROVE,
    });
  };

  return Object.freeze({
    get state(): WorkerSessionIdentityState {
      return state;
    },
    get sessionId(): string | null {
      return sessionId;
    },
    get conflictingSessionId(): string | null {
      return conflictingSessionId;
    },
    get observation(): WorkerSessionIdentityObservation | null {
      return observation;
    },
    observe(report: { readonly sessionId: string; readonly directChildPid: number | null; readonly sourceQualification: WorkerSessionSourceQualification }): WorkerSessionIdentityState {
      /**
       * §6.3: the RAW report is recorded FIRST, whatever branch follows. This is what lets a consumer
       * persist the identity THIS message carried rather than the tracker's cumulative first identity.
       */
      reportedSessionId = report.sessionId;
      if (state === "OBSERVED") {
        if (report.sessionId === sessionId) {
          rebuild();
          return state; // idempotent: the same identity again
        }
        /**
         * §7.5: a second DIFFERENT identity is a conflict, and the first is not silently kept as
         * authoritative. The first observation is retained as EVIDENCE, but `state` no longer claims a
         * single observed identity, and the disagreeing id travels beside it.
         */
        conflictingSessionId = report.sessionId;
        state = "CONFLICT";
        rebuild();
        return state;
      }
      if (state === "CONFLICT") {
        // A further report cannot resolve the conflict by arriving; it is simply another disagreement.
        if (report.sessionId !== sessionId && report.sessionId !== conflictingSessionId) {
          conflictingSessionId = report.sessionId;
        }
        rebuild();
        return state;
      }
      sessionId = report.sessionId;
      firstObservedAt = now();
      firstPid = report.directChildPid;
      qualification = report.sourceQualification;
      state = "OBSERVED";
      rebuild();
      return state;
    },
  });
}


/**
 * The worker execution port, declared STRUCTURALLY (this module is L3; the first-party implementation
 * is host/deployment code). Same idiom as `DelegationSnapshotPort` and `FinishVerificationFace`.
 */
export interface WorkWorkerRunPort {
  readonly adapterId: string;
  run(input: {
    readonly workDir: string;
    /**
     * R1-L §18: the ATTEMPT context (`{work, compiled}`), not `unknown`.
     *
     * The `unknown` here was the hiding place: the runtime already delivered the nested shape while
     * this port claimed nothing about it, so the flat/nested mismatch could not be seen by the compiler.
     */
    readonly context: import("../context/service.js").WorkWorkerAttemptContext;
    /**
     * R1-L §10: the canonical read for ONE handle, bound by the caller to the attempt it prepared.
     * Absent ⇒ a worker's pull is answered with an honest refusal.
     */
    readonly contextPull?: ((handle: string) => Promise<unknown>) | undefined;
    readonly signal?: AbortSignal | undefined;
    /**
     * R3-L0C-G1 §4: an OPTIONAL, host-only, noncanonical observation sink.
     *
     * Absent ⇒ the port behaves exactly as before and produces no observation. Present ⇒ the port reports the
     * lifecycle events it actually observes. The sink cannot change the returned outcome: the port calls it for
     * its side effect and ignores anything it does, including a throw (§4 P1-E).
     */
    readonly observe?: WorkObservationSink | undefined;
    /**
     * Trajectory-P2A §7.3: an OPTIONAL, host-only, noncanonical SESSION IDENTITY sink.
     *
     * Absent ⇒ the port behaves exactly as before and records no session identity (§13: when an optional
     * observer is absent the Work path is semantically equivalent to the baseline). Present ⇒ the port
     * reports the identity it actually observed on its OWN child's IPC channel, already associated with
     * the invocation identity the port minted.
     *
     * The sink cannot change the returned outcome, and it is NOT consulted for anything but reporting:
     * an identity observation never becomes a Work result (§13), never settles an attempt and never
     * reaches promotion.
     */
    readonly observeSessionIdentity?: WorkSessionIdentitySink | undefined;
  }): Promise<{ readonly kind: "READY_FOR_SETTLEMENT" | "NEEDS_ESCALATION" | "HOST_FAILURE"; readonly detail?: string | undefined }>;
}

/** The host-execution phases. Host vocabulary, NOT a project lifecycle. */
export const WORK_JOB_PHASES = ["QUEUED", "RUNNING", "FINISHED", "HOST_ERROR"] as const;
export type WorkJobPhase = (typeof WORK_JOB_PHASES)[number];

/** What one host job can be asked, read-only. */
export interface WorkJobView {
  readonly jobId: string;
  /** The canonical task this job was frozen onto at `start` — never re-resolved afterwards. */
  readonly taskId: string;
  /** Present once prepare succeeded; from then on the caller is not limited to the ephemeral handle. */
  readonly attemptId: string | null;
  readonly phase: WorkJobPhase;
  /** The settlement outcome, once settle ran. A `NOT_READY`/`BASE_DRIFT` here is a NORMAL outcome. */
  readonly settlement: unknown;
  /** The host-side failure detail, when this process could not continue. Never a project fact. */
  readonly hostError: string | null;
}

export interface WorkDelegationStartResult {
  readonly jobId: string;
  readonly taskId: string;
  readonly state: "STARTED";
  readonly resumed: boolean;
  readonly detail: string;
}

export interface WorkDelegationTerminal {
  readonly jobId: string;
  readonly taskId: string;
  readonly attemptId: string | null;
  readonly phase: Extract<WorkJobPhase, "FINISHED" | "HOST_ERROR">;
  readonly settlement: unknown;
  readonly hostError: string | null;
}

export interface WorkDelegationServiceDeps {
  readonly controller: Pick<
    ProjectController,
    // R1-L §10: `fetchContext` is the narrow READ the host uses to answer a worker's context pull. It
    // is the SAME method the E1-K/E5-P gates already resolve handles with; the host binds it to the
    // attempt it prepared, and the model never receives that attempt id.
    "mutatingWorkTarget" | "prepareMutatingWork" | "workWorkerAttemptContext" | "settleMutatingWork" | "attemptWorkRecord" | "fetchContext"
  >;
  /** A port PER job, bound to the world the job's prepare materializes. */
  readonly workerFor: (worldPath: string) => WorkWorkerRunPort;
  /**
   * R3-L0C-G1 §5: an OPTIONAL host-private sink for observations CORRELATED with the canonical AttemptId and
   * this service's own host-local JobId.
   *
   * The correlation is constructed HERE because this is the one host-private boundary that legitimately holds
   * both facts: it calls `prepareMutatingWork` (so it has `prepared.attemptId`) and it minted the jobId. The
   * model never sees either, and the port never receives an attempt id (§5: "Do not ask the model to report its
   * AttemptId"). A correlation built from `prepared.attemptId` cannot be forged by a caller's claim.
   *
   * NONCANONICAL: the sink cannot settle, verify or promote anything. A throw from it is swallowed so it cannot
   * change the job's phase or the canonical Work state.
   */
  readonly onCorrelatedObservation?: WorkCorrelatedObservationSink | undefined;
  /**
   * Trajectory-P2A §8.1: an OPTIONAL host-private sink for SESSION IDENTITY observations correlated with
   * the canonical AttemptId and this service's own host-local JobId.
   *
   * The same boundary and the same reasoning as `onCorrelatedObservation`: this is the one host-private
   * place that legitimately holds `prepared.attemptId` and its own jobId, so the correlation is built
   * HERE and the model never sees either identity. NONCANONICAL: the sink cannot settle, verify or
   * promote, and a throw from it is swallowed.
   */
  readonly onCorrelatedSessionIdentity?: WorkCorrelatedSessionIdentitySink | undefined;
  /**
   * §7.4/§10.2: how the executable behind the worker bin is qualified for identity observations. Absent ⇒
   * the port's own default (`DIRECT_CHILD_IPC`) applies. Never inferred from the message.
   */
  readonly sessionSourceQualification?: WorkerSessionSourceQualification | undefined;
  /** Terminal delivery (attention / followup). Only ever called once per job, with a terminal phase. */
  readonly onTerminal?: ((terminal: WorkDelegationTerminal) => void) | undefined;
}

export interface WorkDelegationService {
  /**
   * Start (or resume) the mutating work of one canonical task.
   *
   * E1-K §23: `knowledge` is the HOST's optional explicit knowledge selection — identity-only, and
   * revalidated by the Context owner during compilation. It is NOT a TaskSpec, an assignment, attempt
   * authority or scheduler state; it is carried to the compile so the STANDARD execution path can
   * deliver selected knowledge to the new worker. Optional and additive: an omitted selection compiles
   * exactly as before.
   */
  start(input?: {
    readonly expectedTaskId?: string | undefined;
    readonly knowledge?: import("../context/knowledge.js").KnowledgeSelectionRequest | undefined;
  }): Promise<WorkDelegationStartResult>;
  /** READ-ONLY. Never retries, resumes, settles, verifies or promotes — it is not a command channel. */
  followup(input: { readonly jobId: string }): Promise<WorkJobView | { readonly jobId: string; readonly phase: "UNKNOWN"; readonly detail: string }>;
  /** READ-ONLY canonical inspection, addressed by the DURABLE identity rather than the host handle. */
  inspectAttempt(input: { readonly attemptId: string }): Promise<{
    readonly attemptId: string;
    readonly known: boolean;
    readonly state: string | null;
    readonly taskId: string | null;
  }>;
}

export class WorkDelegationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkDelegationError";
  }
}

/**
 * §5 / R3-L0C-G1-B §4 B1: BUILD THE CORRELATION WRAPPER, or `undefined` when no consumer is attached.
 *
 * Returning `undefined` when there is no sink is what makes the seam genuinely optional: the port receives
 * `observe: undefined` and the spread leaves the run input byte-identical to the pre-G1 shape (§9, P2-G).
 *
 * R3-L0C-G1-B §4: THE DEPLOYMENT PORT IS THE SOLE PRODUCER OF THE INVOCATION IDENTITY. The wrapper therefore
 * does NOT mint one. It ADOPTS the `invocationId` carried by the observation the port emitted, so a correlated
 * entry and its own observation always name the same port execution:
 *
 *     entry.invocationId === entry.observation.invocationId
 *
 * WHY THIS IS THE CORRECT OWNER. The Work Owner does not perform the process spawn, so it must not mint port
 * invocation identity; the Deployment Port must not mint AttemptId or HostJobId, because those belong to other
 * owners. The correlation is the one place that legitimately holds `prepared.attemptId` and its own jobId, so it
 * supplies THOSE two facts and takes the third from the producer that actually observed the process.
 *
 * A THROW FROM THE CONSUMER IS SWALLOWED. The sink is a research consumer, not a Work participant: if it fails,
 * the observation is lost and the worker's outcome is unchanged. §4: "A failed observer must not fabricate a
 * Work terminal state or alter settlement authority." The consumer treats a missing observation as incomplete
 * evidence — the honesty is on the consuming side, not achieved by making the host fail.
 */
function correlateObservations(
  sink: WorkCorrelatedObservationSink | undefined,
  identity: { readonly hostLocalJobId: string; readonly attemptId: string },
): WorkObservationSink | undefined {
  if (sink === undefined) return undefined;
  return (observation: HostProcessObservation): void => {
    try {
      sink(
        Object.freeze({
          hostLocalJobId: identity.hostLocalJobId,
          attemptId: identity.attemptId,
          /** §4 B1: taken from the PRODUCER, never generated here. */
          invocationId: observation.invocationId,
          observation,
        }),
      );
    } catch {
      /* a research consumer's failure is not a Work failure; the canonical state is unchanged */
    }
  };
}

/**
 * Trajectory-P2A §8: BUILD THE SESSION IDENTITY CORRELATION WRAPPER, or `undefined` when no consumer is
 * attached.
 *
 * The SAME ownership rule as `correlateObservations`, applied to the identity observation:
 *
 *   · `attemptId`      canonical Work, from `prepared.attemptId` — never from a payload or a caller claim
 *   · `hostLocalJobId` this service's own ephemeral job handle, or "" on the blocking path that has none
 *   · the identity     the port's own observation, adopted verbatim, including the invocationId it minted
 *
 * The wrapper does NOT mint an invocation id and does NOT read one from a message: it takes the whole
 * observation the port produced, so a correlated entry and its observation always name the same port
 * execution and the same identity.
 *
 * A THROW FROM THE CONSUMER IS SWALLOWED, exactly as above: a research consumer's failure is not a Work
 * failure, and a missing observation is incomplete evidence rather than a reason to fail an attempt.
 */
function correlateSessionIdentity(
  sink: WorkCorrelatedSessionIdentitySink | undefined,
  identity: { readonly hostLocalJobId: string; readonly attemptId: string },
): WorkSessionIdentitySink | undefined {
  if (sink === undefined) return undefined;
  return (observation: WorkerSessionIdentityObservation): void => {
    try {
      sink(
        Object.freeze({
          hostLocalJobId: identity.hostLocalJobId,
          attemptId: identity.attemptId,
          observation,
        }),
      );
    } catch {
      /* a research consumer's failure is not a Work failure; the canonical state is unchanged */
    }
  };
}

/**
 * THE ONE BLOCKING KERNEL: prepare → run → settle, synchronously awaited.
 *
 * Both the blocking entry point and every async job call THIS. Nothing here re-resolves the task after
 * `start` froze it, and nothing here decides eligibility: `settleMutatingWork` is the only thing that
 * can complete an attempt, and it does so on observed facts.
 */
export async function executeMutatingWorkBlocking(
  deps: WorkDelegationServiceDeps,
  input: { readonly expectedTaskId: string; readonly signal?: AbortSignal | undefined },
): Promise<{
  readonly taskId: string;
  readonly attemptId: string;
  readonly settlement: unknown;
}> {
  // Re-ASSERT the frozen target (and, inside, the head basis) before any effect: a world that moved
  // between `start` and here is refused rather than silently reinterpreted as a different request.
  const prepared = await deps.controller.prepareMutatingWork({ expectedTaskId: input.expectedTaskId });
  // §D5-c3: compiled AFTER the attempt's identity and world exist (prepared),
  // BEFORE the worker runs — per attempt, never per task-latest.
  const context = await deps.controller.workWorkerAttemptContext(prepared.attemptId);
  const worker = deps.workerFor(prepared.worldPath);
  /**
   * §5: the correlated sink, closed over the canonical attemptId and a per-invocation id. The port never
   * receives the attempt id; it only ever calls `observe`, and this wrapper attaches the identity the host
   * already owns. `hostLocalJobId` is empty here because the blocking kernel has no host job — the async
   * service supplies its own.
   */
  const observe = correlateObservations(deps.onCorrelatedObservation, { hostLocalJobId: "", attemptId: prepared.attemptId });
  /**
   * §8.4: the identity correlation for the BLOCKING kernel. `hostLocalJobId` is empty because this path
   * has no host job — the honest value, never an invented id.
   */
  const observeSessionIdentity = correlateSessionIdentity(deps.onCorrelatedSessionIdentity, { hostLocalJobId: "", attemptId: prepared.attemptId });
  const workerOutcome = await worker.run({
    workDir: prepared.worldPath,
    context,
    // §10: the canonical read, closed over THIS attempt. The worker asks by handle; only the parent
    // knows which attempt the handle belongs to.
    contextPull: async (handle: string) => await deps.controller.fetchContext(prepared.attemptId, handle),
    ...(observe === undefined ? {} : { observe }),
    ...(observeSessionIdentity === undefined ? {} : { observeSessionIdentity }),
    ...(deps.sessionSourceQualification === undefined ? {} : { sessionSourceQualification: deps.sessionSourceQualification }),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
  const settlement = await deps.controller.settleMutatingWork({
    attemptId: prepared.attemptId,
    workerOutcome,
  });
  return Object.freeze({ taskId: prepared.taskId, attemptId: prepared.attemptId, settlement });
}

export function makeWorkDelegationService(deps: WorkDelegationServiceDeps): WorkDelegationService {
  /**
   * The HOST-LOCAL half: thin on purpose. Nothing here is canonical, nothing here is durable, and
   * nothing here may grow into a second scheduler store.
   */
  const jobs = new Map<string, WorkJobView & { readonly promise: Promise<void> }>();

  function viewOf(entry: WorkJobView & { readonly promise: Promise<void> }): WorkJobView {
    return Object.freeze({
      jobId: entry.jobId,
      taskId: entry.taskId,
      attemptId: entry.attemptId,
      phase: entry.phase,
      settlement: entry.settlement,
      hostError: entry.hostError,
    });
  }

  return Object.freeze({
    async start(input: {
      readonly expectedTaskId?: string | undefined;
      readonly knowledge?: import("../context/knowledge.js").KnowledgeSelectionRequest | undefined;
    } = {}): Promise<WorkDelegationStartResult> {
      // RESOLVE ONCE, before any job exists: this is what freezes the execution request identity. A
      // refusal here (no canonical work, wrong task, occupied lane, prose instead of work) means no job,
      // no attempt, no world and no event.
      const target = deps.controller.mutatingWorkTarget(
        input.expectedTaskId === undefined ? {} : { expectedTaskId: input.expectedTaskId },
      );
      const jobId = `wdj-${randomUUID()}`;
      const entry = {
        jobId,
        taskId: target.taskId,
        attemptId: null as string | null,
        phase: "QUEUED" as WorkJobPhase,
        settlement: null as unknown,
        hostError: null as string | null,
        promise: Promise.resolve(),
      };
      jobs.set(jobId, entry);

      const terminal = (phase: Extract<WorkJobPhase, "FINISHED" | "HOST_ERROR">): void => {
        entry.phase = phase;
        try {
          deps.onTerminal?.({
            jobId,
            taskId: entry.taskId,
            attemptId: entry.attemptId,
            phase,
            settlement: entry.settlement,
            hostError: entry.hostError,
          });
        } catch {
          /* delivery failed; the canonical state is unchanged and `followup` still tells the truth */
        }
      };

      entry.promise = (async () => {
        entry.phase = "RUNNING";
        try {
          const prepared = await deps.controller.prepareMutatingWork({ expectedTaskId: target.taskId });
          // Exposed as soon as it exists: from here the caller has a DURABLE identity, not just this
          // process's ephemeral handle.
          entry.attemptId = prepared.attemptId;
          /**
           * §5: the correlation for THIS job. `jobId` is this service's own ephemeral handle and
           * `prepared.attemptId` is the canonical Work identity — the two facts this boundary legitimately
           * holds and no other boundary does.
           */
          const observe = correlateObservations(deps.onCorrelatedObservation, {
            hostLocalJobId: jobId,
            attemptId: prepared.attemptId,
          });
          /** §8.1: the identity correlation for THIS job, on the same boundary as the observation above. */
          const observeSessionIdentity = correlateSessionIdentity(deps.onCorrelatedSessionIdentity, {
            hostLocalJobId: jobId,
            attemptId: prepared.attemptId,
          });
          // E1-K §23: the explicit selection rides WITH the compile — no side-channel compile between
          // preparation and worker delivery, and no second durable owner. An omitted selection is the
          // pre-E1-K path exactly.
          const context =
            input.knowledge === undefined
              ? await deps.controller.workWorkerAttemptContext(prepared.attemptId)
              : await deps.controller.workWorkerAttemptContext(prepared.attemptId, { knowledge: input.knowledge });
          const workerOutcome = await deps.workerFor(prepared.worldPath).run({
            workDir: prepared.worldPath,
            context,
            contextPull: async (handle: string) => await deps.controller.fetchContext(prepared.attemptId, handle),
            ...(observe === undefined ? {} : { observe }),
            ...(observeSessionIdentity === undefined ? {} : { observeSessionIdentity }),
            ...(deps.sessionSourceQualification === undefined ? {} : { sessionSourceQualification: deps.sessionSourceQualification }),
          });
          entry.settlement = await deps.controller.settleMutatingWork({
            attemptId: prepared.attemptId,
            workerOutcome,
          });
          terminal("FINISHED");
        } catch (error) {
          /**
           * A HOST-side failure to continue. It is recorded as such and NOTHING ELSE: the canonical
           * attempt keeps whatever state it really has (RUNNING, with its world and any commit in it),
           * the lane stays fenced, and no `ATTEMPT_FAILED` is fabricated.
           */
          entry.hostError = error instanceof Error ? error.message : String(error);
          terminal("HOST_ERROR");
        }
      })();
      // Nothing awaits the job here: that is the entire point of the async transport.
      void entry.promise;

      return Object.freeze({
        jobId,
        taskId: target.taskId,
        state: "STARTED" as const,
        resumed: target.resumed,
        detail: target.resumed
          ? "this work already held the mutating lane, so the job resumes its existing execution position"
          : "the canonical task was resolved and frozen; the job is preparing its execution world",
      });
    },

    async followup(input: { readonly jobId: string }): Promise<WorkJobView | { readonly jobId: string; readonly phase: "UNKNOWN"; readonly detail: string }> {
      const { jobId } = input;
      const entry = jobs.get(jobId);
      if (entry === undefined) {
        /**
         * An unknown handle after a restart is NOT a failure. Host jobs are not durable, so this process
         * simply never had it — and the honest answer says which of the two query spaces applies.
         */
        return Object.freeze({
          jobId,
          phase: "UNKNOWN" as const,
          detail:
            "this host has no such job (host-local jobs are not durable, so a restart forgets them) — inspect the attempt by its own id for the canonical truth",
        });
      }
      return viewOf(entry);
    },

    async inspectAttempt(input: { readonly attemptId: string }) {
      const { attemptId } = input;
      const record = deps.controller.attemptWorkRecord(attemptId);
      return Object.freeze({
        attemptId,
        known: record !== null,
        state: record?.state ?? null,
        taskId: record?.taskId ?? null,
      });
    },
  });
}
