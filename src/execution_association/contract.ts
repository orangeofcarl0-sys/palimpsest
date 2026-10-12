/**
 * Trajectory-P2-B §7 — THE DURABLE EXECUTION-ASSOCIATION CONTRACT.
 *
 * This module owns the TYPED, APPEND-ONLY EVIDENCE for one observed relationship:
 *
 *     canonical Work Attempt  →  Parent-owned Invocation  →  actual DSH SessionId
 *
 * WHAT IT IS. A record of what a TRUSTED INGESTION PATH actually observed, with the identities kept
 * in the columns that belong to their real owners:
 *
 *     projectId / attemptId   canonical Work      (re-read from Work at qualification time)
 *     invocationId            the Parent's port   (minted by the port, never from a message)
 *     dshSessionId            the DSH Session     (reported by the Host that created it)
 *     hostLocalJobId          Work Delegation     (ephemeral; never the durable anchor)
 *
 * WHAT IT IS NOT (§2.3). A durable observation is NOT a verified binding. `ASSOCIATION_QUALIFIED` is a
 * READ-SIDE conclusion computed from these facts PLUS a re-read of canonical Work, a read of the real
 * DSH Session header, and a match against the trusted deployment source basis. The stored records
 * carry NO `verified: true` field, because a stored boolean is exactly the "caller self-verification"
 * §7.6 forbids.
 *
 * THE NONDETERMINISM RULE (§7.4). The durable payload contains ONLY immutable facts — no ingestion
 * timestamp. `observedAt` is DELIVERY METADATA kept outside the record, so a retry that re-delivers
 * the same logical observation produces a byte-identical payload and is idempotent. A new timestamp
 * can never manufacture a conflict.
 *
 * Layer: L2 (`src/execution_association/`). Pure data contracts and their strict validators. It owns
 * no runtime, no scheduler and no authority over Work.
 */
import { canonicalDigest } from "../schema/canonical.js";

/** §7.1: the durable schema version, so a reader can refuse an unknown shape. */
export const EXECUTION_ASSOCIATION_SCHEMA_VERSION = 1;

/** §7.3: the domain separator for the stable logical event identity. */
export const EXECUTION_ASSOCIATION_DOMAIN = "palimpsest.execution-association.v1";

/**
 * §7.2: the immutable fact kinds. There is deliberately NO `ASSOCIATION_VERIFIED` event: qualification
 * is derived on the read side from these facts plus current source validation, so a stored "verified"
 * flag can never become the primary source of truth.
 */
export const EXECUTION_ASSOCIATION_EVENT_TYPES = [
  /** A Parent-owned Invocation observed a specific DSH Session identity for a canonical Attempt. */
  "SESSION_IDENTITY_OBSERVED",
  /** The Invocation's observation window reached a known terminal boundary. */
  "INVOCATION_OBSERVATION_FINALIZED",
] as const;
export type ExecutionAssociationEventType = (typeof EXECUTION_ASSOCIATION_EVENT_TYPES)[number];

/**
 * §8.2: how an Invocation's observation window closed, as the Parent could honestly know it.
 *
 * `INVOCATION_RETURNED` is the value the Delegation uses: it awaits `worker.run()`, and the shipped
 * Port resolves that promise only from a close/exit/timeout/abort/error handler — i.e. after it stopped
 * waiting on the child. It is NOT a claim that every IPC message was received (§8.2), which is exactly
 * why the window state and the candidate set are recorded separately from any single observation.
 */
export const OBSERVATION_WINDOW_STATES = ["OPEN", "CLOSED", "UNKNOWN"] as const;
export type ObservationWindowState = (typeof OBSERVATION_WINDOW_STATES)[number];

export const OBSERVATION_WINDOW_CLOSE_REASONS = [
  /** The Delegation awaited the Port and it returned; the Parent stopped waiting on the child. */
  "INVOCATION_RETURNED",
  /** The Parent process itself ended before it could finalize. */
  "PARENT_TERMINATED",
  /** The window boundary could not be established. */
  "UNKNOWN",
] as const;
export type ObservationWindowCloseReason = (typeof OBSERVATION_WINDOW_CLOSE_REASONS)[number];

/**
 * §5 B0-C3: the TRUSTED DEPLOYMENT SOURCE BASIS.
 *
 * This is the deployment composition's own account of WHICH executable it launched — derived from the
 * Port's configuration, never from the IPC message and never from a caller's record. It is the anchor
 * that lets the read side refuse a self-declared `FIRST_PARTY_DSH_QUALIFIED` label: a record whose
 * basis does not match the verifier's trusted basis is refused regardless of what it says about itself.
 *
 * It is a DEFENSIBLE LOCAL PROVENANCE basis — a digest of the configured worker bin, its basename and
 * the node executable — NOT remote cryptographic attestation and NOT hardware identity (§5 B0-C3).
 */
export interface TrustedSourceBasis {
  /** The Port's own adapter id, naming the implementation rather than the machine. */
  readonly adapterId: string;
  /** The configured worker bin's basename only — never the directory. */
  readonly workerBinBasename: string;
  /** A digest of the configured worker bin path. */
  readonly workerBinDigest: string;
  /** A digest of the Node executable path actually used. */
  readonly nodeExecutableDigest: string;
}

/** §5 B0-C3: how the deployment classifies the configured executable, from ITS OWN configuration. */
export const SOURCE_KINDS = ["FIRST_PARTY_DSH_HOST", "CONTROLLED_STUB", "UNKNOWN"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/**
 * §7.1: ONE observed Session identity, as a durable immutable fact.
 *
 * Every field is owned by a specific component; none of them may be supplied by the model, and the
 * `sourceQualificationDeclared` field is recorded FOR AUDIT ONLY — the qualification read side NEVER
 * consults it to reach an outcome (§7.6).
 */
export interface SessionIdentityObservedPayload {
  readonly schemaVersion: number;
  readonly projectId: string;
  readonly attemptId: string;
  /** The Parent-owned invocation that launched the worker whose session this is. */
  readonly invocationId: string;
  readonly dshSessionId: string;
  /** §5 B0-C3: the deployment's own account of the executable, computed from the Port's config. */
  readonly sourceBasis: TrustedSourceBasis;
  /** §5 B0-C3: the deployment's own classification of that executable. */
  readonly sourceKind: SourceKind;
  /**
   * §7.6: the label the observation itself carried, preserved verbatim for audit. It is NEVER used to
   * reach a qualification outcome — a self-declared first-party label grants nothing.
   */
  readonly sourceQualificationDeclared: string;
  /** The direct child that carried the report, as a TRANSPORT anchor — never the session's identity. */
  readonly directChildPid: number | null;
  /** Work Delegation's ephemeral job handle, or null on the blocking path. Never the durable anchor. */
  readonly hostLocalJobId: string | null;
}

/** §8.1: the Invocation's observation window reached a terminal boundary. */
export interface InvocationObservationFinalizedPayload {
  readonly schemaVersion: number;
  readonly projectId: string;
  readonly attemptId: string;
  readonly invocationId: string;
  readonly windowState: ObservationWindowState;
  readonly closeReason: ObservationWindowCloseReason;
  /** How many distinct Session identities had been recorded when the window closed. */
  readonly observedCandidateCount: number;
}

export type ExecutionAssociationPayload =
  | SessionIdentityObservedPayload
  | InvocationObservationFinalizedPayload;

/** §7.1: the durable record shape the store returns. `seq` is assigned by the store on append. */
export interface ExecutionAssociationEvent<T extends ExecutionAssociationEventType = ExecutionAssociationEventType> {
  readonly eventId: string;
  readonly seq: number;
  readonly projectId: string;
  readonly type: T;
  readonly payload: ExecutionAssociationPayload;
}

/** §7.1: the append request, minus the store-assigned `seq`. */
export type ExecutionAssociationAppendRequest = Omit<ExecutionAssociationEvent, "seq">;

/* ------------------------------------------------------------------ *
 * §7.6 — The ingestion input contract (declared HERE, not imported from L3)
 * ------------------------------------------------------------------ */

/**
 * §7.6/§12.3: the SHAPE the trusted recorder accepts.
 *
 * Declared in L2 rather than imported from the L3 delegation module on purpose: the layer model
 * forbids L2 → L3, and duplicating the producer's type would be the drift R1-L removed. Instead this
 * is a STRUCTURAL contract — the deployment/L3 wiring passes its own correlated observation, which
 * satisfies this shape without any import in either direction.
 *
 * `attemptId` is canonical Work's, `invocationId` was minted by the port, and `dshSessionId` came from
 * the Host that created the session. There is no field through which a caller could name a different
 * Attempt or Invocation (§7.6).
 */
export interface ObservedIdentityInput {
  readonly attemptId: string;
  /** Work Delegation's ephemeral job handle, or "" when the blocking path has none. */
  readonly hostLocalJobId: string;
  readonly observation: {
    readonly invocationId: string;
    readonly dshSessionId: string;
    /** Only `DIRECT_CHILD_IPC_REPORT` is a producer observation; anything else is refused. */
    readonly source: string;
    readonly sourceQualification: string;
    readonly directChildPid: number | null;
  };
}

/* ------------------------------------------------------------------ *
 * §7.3 — Stable logical event identity
 * ------------------------------------------------------------------ */

/**
 * §7.3: the stable event id for ONE logical observation.
 *
 * The identity is `EventKind + ProjectId + AttemptId + InvocationId + DshSessionId`, so:
 *
 *   · a repeated delivery of the same logical observation hashes to the SAME id → idempotent;
 *   · two DIFFERENT SessionIds for one invocation hash to DIFFERENT ids → both are preserved;
 *   · the finalization event is keyed by invocation only, so it is one per invocation.
 *
 * No random id is minted per delivery, because that would make every retry a new record (§7.3).
 */
export function associationEventId(input:
  | { readonly type: "SESSION_IDENTITY_OBSERVED"; readonly projectId: string; readonly attemptId: string; readonly invocationId: string; readonly dshSessionId: string }
  | { readonly type: "INVOCATION_OBSERVATION_FINALIZED"; readonly projectId: string; readonly attemptId: string; readonly invocationId: string }): string {
  const identity =
    input.type === "SESSION_IDENTITY_OBSERVED"
      ? { type: input.type, projectId: input.projectId, attemptId: input.attemptId, invocationId: input.invocationId, dshSessionId: input.dshSessionId }
      : { type: input.type, projectId: input.projectId, attemptId: input.attemptId, invocationId: input.invocationId };
  return `xas-${canonicalDigest({ domain: EXECUTION_ASSOCIATION_DOMAIN, ...identity })}`;
}

/* ------------------------------------------------------------------ *
 * §22–§24-style strict parsers (never a generic bag)
 * ------------------------------------------------------------------ */

const IDENTIFIER_MAX = 200;
function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= IDENTIFIER_MAX && !/[\s\u0000-\u001f\u007f]/u.test(value);
}

function strictObject(payload: unknown, allowed: readonly string[], required: readonly string[], what: string): Record<string, unknown> {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error(`${what} payload must be an object`);
  }
  const record = payload as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) throw new Error(`${what} payload has unknown field "${key}"`);
  }
  for (const key of required) {
    if (record[key] === undefined) throw new Error(`${what} payload is missing required field "${key}"`);
  }
  return record;
}

function parseSourceBasis(value: unknown, what: string): TrustedSourceBasis {
  const record = strictObject(
    value,
    ["adapterId", "workerBinBasename", "workerBinDigest", "nodeExecutableDigest"],
    ["adapterId", "workerBinBasename", "workerBinDigest", "nodeExecutableDigest"],
    what,
  );
  for (const key of ["adapterId", "workerBinBasename", "workerBinDigest", "nodeExecutableDigest"] as const) {
    if (typeof record[key] !== "string" || (record[key] as string).length === 0) {
      throw new Error(`${what} field "${key}" must be a non-empty string`);
    }
  }
  return Object.freeze({
    adapterId: record.adapterId as string,
    workerBinBasename: record.workerBinBasename as string,
    workerBinDigest: record.workerBinDigest as string,
    nodeExecutableDigest: record.nodeExecutableDigest as string,
  });
}

/** §7.1: the strict parser for ONE observed identity. */
export function parseSessionIdentityObserved(payload: unknown): SessionIdentityObservedPayload {
  const record = strictObject(
    payload,
    [
      "schemaVersion",
      "projectId",
      "attemptId",
      "invocationId",
      "dshSessionId",
      "sourceBasis",
      "sourceKind",
      "sourceQualificationDeclared",
      "directChildPid",
      "hostLocalJobId",
    ],
    [
      "schemaVersion",
      "projectId",
      "attemptId",
      "invocationId",
      "dshSessionId",
      "sourceBasis",
      "sourceKind",
      "sourceQualificationDeclared",
      "directChildPid",
      "hostLocalJobId",
    ],
    "SESSION_IDENTITY_OBSERVED",
  );
  if (record.schemaVersion !== EXECUTION_ASSOCIATION_SCHEMA_VERSION) {
    throw new Error(`SESSION_IDENTITY_OBSERVED has unsupported schemaVersion ${String(record.schemaVersion)}`);
  }
  for (const key of ["projectId", "attemptId", "invocationId", "dshSessionId"] as const) {
    if (!isIdentifier(record[key])) throw new Error(`SESSION_IDENTITY_OBSERVED field "${key}" must be a non-empty identifier`);
  }
  if (typeof record.sourceKind !== "string" || !(SOURCE_KINDS as readonly string[]).includes(record.sourceKind)) {
    throw new Error(`SESSION_IDENTITY_OBSERVED sourceKind must be one of ${SOURCE_KINDS.join(", ")}`);
  }
  if (typeof record.sourceQualificationDeclared !== "string") {
    throw new Error("SESSION_IDENTITY_OBSERVED sourceQualificationDeclared must be a string");
  }
  if (record.directChildPid !== null && !(typeof record.directChildPid === "number" && Number.isInteger(record.directChildPid) && record.directChildPid >= 0)) {
    throw new Error("SESSION_IDENTITY_OBSERVED directChildPid must be null or a non-negative integer");
  }
  if (record.hostLocalJobId !== null && (typeof record.hostLocalJobId !== "string" || record.hostLocalJobId.length === 0)) {
    throw new Error("SESSION_IDENTITY_OBSERVED hostLocalJobId must be null or a non-empty string");
  }
  return Object.freeze({
    schemaVersion: EXECUTION_ASSOCIATION_SCHEMA_VERSION,
    projectId: record.projectId as string,
    attemptId: record.attemptId as string,
    invocationId: record.invocationId as string,
    dshSessionId: record.dshSessionId as string,
    sourceBasis: parseSourceBasis(record.sourceBasis, "SESSION_IDENTITY_OBSERVED.sourceBasis"),
    sourceKind: record.sourceKind as SourceKind,
    sourceQualificationDeclared: record.sourceQualificationDeclared,
    directChildPid: record.directChildPid as number | null,
    hostLocalJobId: record.hostLocalJobId as string | null,
  });
}

/** §8.1: the strict parser for the window finalization. */
export function parseInvocationObservationFinalized(payload: unknown): InvocationObservationFinalizedPayload {
  const record = strictObject(
    payload,
    ["schemaVersion", "projectId", "attemptId", "invocationId", "windowState", "closeReason", "observedCandidateCount"],
    ["schemaVersion", "projectId", "attemptId", "invocationId", "windowState", "closeReason", "observedCandidateCount"],
    "INVOCATION_OBSERVATION_FINALIZED",
  );
  if (record.schemaVersion !== EXECUTION_ASSOCIATION_SCHEMA_VERSION) {
    throw new Error(`INVOCATION_OBSERVATION_FINALIZED has unsupported schemaVersion ${String(record.schemaVersion)}`);
  }
  for (const key of ["projectId", "attemptId", "invocationId"] as const) {
    if (!isIdentifier(record[key])) throw new Error(`INVOCATION_OBSERVATION_FINALIZED field "${key}" must be a non-empty identifier`);
  }
  if (typeof record.windowState !== "string" || !(OBSERVATION_WINDOW_STATES as readonly string[]).includes(record.windowState)) {
    throw new Error(`INVOCATION_OBSERVATION_FINALIZED windowState must be one of ${OBSERVATION_WINDOW_STATES.join(", ")}`);
  }
  if (typeof record.closeReason !== "string" || !(OBSERVATION_WINDOW_CLOSE_REASONS as readonly string[]).includes(record.closeReason)) {
    throw new Error(`INVOCATION_OBSERVATION_FINALIZED closeReason must be one of ${OBSERVATION_WINDOW_CLOSE_REASONS.join(", ")}`);
  }
  if (typeof record.observedCandidateCount !== "number" || !Number.isInteger(record.observedCandidateCount) || record.observedCandidateCount < 0) {
    throw new Error("INVOCATION_OBSERVATION_FINALIZED observedCandidateCount must be a non-negative integer");
  }
  return Object.freeze({
    schemaVersion: EXECUTION_ASSOCIATION_SCHEMA_VERSION,
    projectId: record.projectId as string,
    attemptId: record.attemptId as string,
    invocationId: record.invocationId as string,
    windowState: record.windowState as ObservationWindowState,
    closeReason: record.closeReason as ObservationWindowCloseReason,
    observedCandidateCount: record.observedCandidateCount,
  });
}

/** §22–§24: the per-type registry, so the store validates every artifact before any write. */
export const EXECUTION_ASSOCIATION_EVENT_PARSERS: Readonly<Record<string, (payload: unknown) => ExecutionAssociationPayload>> = Object.freeze({
  SESSION_IDENTITY_OBSERVED: parseSessionIdentityObserved,
  INVOCATION_OBSERVATION_FINALIZED: parseInvocationObservationFinalized,
});
