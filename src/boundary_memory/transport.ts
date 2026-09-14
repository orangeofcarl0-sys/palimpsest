/**
 * G10-L federated boundary collaboration — the authenticated remote semantic protocol.
 *
 *   canonical home ≠ authority root ≠ owner ≠ manager ≠ privileged participant
 *   RemoteTransportDelivery ≠ BoundaryAcceptance
 *   RemoteTransportAuthentication ≠ SemanticAcceptance
 *   RemoteSubmission ≠ CanonicalCommit      RemoteObservation ≠ LocalReplicaTruth
 *
 * ONE canonical BoundaryMemory truth per workspace; many remote authenticated peers.
 * NO multi-master replication, CRDT merge, distributed consensus, global ACID, or
 * exactly-once claim. The contract is at-least-once transport + semantic idempotency:
 * every mutation carries a stable `operationId`; the canonical home validates basis,
 * sender coherence, membership, candidate state, and required approver/acceptor,
 * generates the canonical event, and commits. Remote peers never submit raw store
 * events, seq numbers, or chain digests.
 *
 * `authenticatedPeer` is what the transport ADAPTER asserts — not a cryptographic
 * guarantee unless the adapter provides one. Wording throughout: "authenticated as
 * asserted by the adapter".
 */

import { canonicalDigest } from "../schema/canonical.js";
import type { PeerRef } from "../federation/peer.js";
import { parsePeerRef } from "../federation/peer.js";
import type { AcceptedBoundaryRevisionRef } from "./ref.js";
import { bmDigest, bmExactKeys, bmFail, bmLiteral, bmNonEmpty, bmNonNegativeInteger, bmObject, bmStableId, parseAcceptedBoundaryRevisionRef } from "./ref.js";
import type { MembershipChangeKind } from "./membership.js";
import { MEMBERSHIP_CHANGE_KINDS } from "./membership.js";
import type {
  AcceptedBoundaryState,
  BoundaryMemoryService,
  CandidateView,
  MembershipView,
  WorkspaceChanges,
} from "./service.js";
import type { BoundaryBasis, BoundaryMemoryStore } from "./store.js";
import { BoundaryMemoryStoreError } from "./store.js";

export const BOUNDARY_ENVELOPE_DOMAIN = "palimpsest.boundary-envelope.v1";
export const BOUNDARY_OPERATION_DOMAIN = "palimpsest.boundary-operation.v1";

export class BoundaryRemoteError extends Error {
  constructor(
    readonly kind: string,
    message: string,
  ) {
    super(message);
    this.name = "BoundaryRemoteError";
  }
}

/* ------------------------------------------------------------------ *
 * Routing / transport seams
 * ------------------------------------------------------------------ */

export interface BoundaryHomeRef {
  readonly schemaVersion: 1;
  readonly homeId: string;
}

export function parseBoundaryHomeRef(raw: unknown, what = "BoundaryHomeRef"): BoundaryHomeRef {
  const object = bmObject(raw, what);
  bmExactKeys(object, ["schemaVersion", "homeId"], what);
  if (object.schemaVersion !== 1) bmFail(`${what}.schemaVersion must be 1`);
  return Object.freeze({ schemaVersion: 1 as const, homeId: bmStableId(object.homeId, `${what}.homeId`) });
}

/**
 * Deployment-level workspace→home resolution. The route is NOT workspace social
 * semantics and is NOT stored in the workspace definition; `PeerRef` still carries
 * no transport address.
 */
export interface BoundaryWorkspaceRoutePort {
  locate(workspaceId: string): Promise<BoundaryHomeRef | undefined>;
}

export function staticBoundaryRoute(entries: Readonly<Record<string, string>>): BoundaryWorkspaceRoutePort {
  return {
    locate: async (workspaceId) => {
      const homeId = entries[workspaceId];
      return homeId === undefined ? undefined : Object.freeze({ schemaVersion: 1 as const, homeId });
    },
  };
}

export interface BoundaryTransportRequest {
  readonly home: BoundaryHomeRef;
  readonly envelope: BoundaryRemoteEnvelope;
}

export type BoundaryTransportResponse =
  | { readonly status: "delivered"; readonly response: unknown }
  | { readonly status: "unavailable"; readonly detail: string };

/**
 * Dedicated semantic transport seam. Boundary operations are NEVER smuggled through
 * `PeerMessage.body`; a chat transport is a different concern.
 */
export interface BoundaryCollaborationTransportPort {
  readonly adapterId: string;
  deliver(request: BoundaryTransportRequest): Promise<BoundaryTransportResponse>;
}

export type BoundaryInboundHandler = (envelope: BoundaryRemoteEnvelope) => Promise<unknown>;

/** A callback adapter: the host integration is the callbacks. */
export function callbackBoundaryTransportPort(
  adapterId: string,
  onDeliver: (request: BoundaryTransportRequest) => Promise<BoundaryTransportResponse>,
): BoundaryCollaborationTransportPort {
  return { adapterId, deliver: onDeliver };
}

/** In-process routing adapter for tests/embedding: homeId → home handler. */
export function inProcessBoundaryTransportPort(
  handlers: Readonly<Record<string, (envelope: BoundaryRemoteEnvelope) => Promise<unknown>>>,
  adapterId = "in-process",
): BoundaryCollaborationTransportPort {
  return {
    adapterId,
    deliver: async (request) => {
      const handler = handlers[request.home.homeId];
      if (handler === undefined) return { status: "unavailable", detail: `no boundary home "${request.home.homeId}" is reachable` };
      return { status: "delivered", response: await handler(request.envelope) };
    },
  };
}

/* ------------------------------------------------------------------ *
 * Semantic operations
 * ------------------------------------------------------------------ */

export type BoundaryRemoteOperation =
  | {
      readonly kind: "submit_artifact_candidate";
      readonly artifactId: string;
      readonly base: AcceptedBoundaryRevisionRef | null;
      readonly content: unknown;
      readonly requiredAcceptors: readonly PeerRef[];
      readonly intent: string;
    }
  | { readonly kind: "accept_artifact_candidate"; readonly artifactId: string; readonly candidateDigest: string }
  | { readonly kind: "reject_artifact_candidate"; readonly artifactId: string; readonly candidateDigest: string }
  | { readonly kind: "submit_membership_change"; readonly changeKind: MembershipChangeKind; readonly target: PeerRef; readonly intent: string }
  | { readonly kind: "approve_membership_change"; readonly candidateDigest: string }
  | { readonly kind: "reject_membership_change"; readonly candidateDigest: string }
  | { readonly kind: "workspace_view" }
  | { readonly kind: "current_accepted"; readonly artifactId: string }
  | { readonly kind: "pending_candidates"; readonly artifactId: string }
  | { readonly kind: "membership" }
  | { readonly kind: "changes_since"; readonly throughSeq: number }
  | { readonly kind: "basis" };

export interface BoundaryRemoteEnvelope {
  readonly schemaVersion: 1;
  readonly operationId: string;
  readonly workspaceId: string;
  /** Authenticated as ASSERTED BY THE ADAPTER. null = the adapter cannot authenticate. */
  readonly authenticatedPeer: PeerRef | null;
  readonly operation: BoundaryRemoteOperation;
}

function parsePeerArray(raw: unknown, what: string): readonly PeerRef[] {
  if (!Array.isArray(raw)) bmFail(`${what} must be an array`);
  const peers = raw.map((entry) => parsePeerRef(entry));
  const seen = new Set<string>();
  for (const peer of peers) {
    if (seen.has(peer.peerId)) bmFail(`${what}: duplicate peer "${peer.peerId}"`);
    seen.add(peer.peerId);
  }
  return Object.freeze(peers);
}

export function parseBoundaryRemoteOperation(raw: unknown, what = "operation"): BoundaryRemoteOperation {
  const object = bmObject(raw, what);
  const kind = bmLiteral(
    object.kind,
    [
      "submit_artifact_candidate",
      "accept_artifact_candidate",
      "reject_artifact_candidate",
      "submit_membership_change",
      "approve_membership_change",
      "reject_membership_change",
      "workspace_view",
      "current_accepted",
      "pending_candidates",
      "membership",
      "changes_since",
      "basis",
    ],
    `${what}.kind`,
  ) as BoundaryRemoteOperation["kind"];
  switch (kind) {
    case "submit_artifact_candidate": {
      bmExactKeys(object, ["kind", "artifactId", "base", "content", "requiredAcceptors", "intent"], what);
      return Object.freeze({
        kind,
        artifactId: bmStableId(object.artifactId, `${what}.artifactId`),
        base: object.base === null ? null : parseAcceptedBoundaryRevisionRef(object.base, `${what}.base`),
        content: object.content,
        requiredAcceptors: parsePeerArray(object.requiredAcceptors, `${what}.requiredAcceptors`),
        intent: bmNonEmpty(object.intent, `${what}.intent`),
      });
    }
    case "accept_artifact_candidate":
    case "reject_artifact_candidate": {
      bmExactKeys(object, ["kind", "artifactId", "candidateDigest"], what);
      return Object.freeze({ kind, artifactId: bmStableId(object.artifactId, `${what}.artifactId`), candidateDigest: bmDigest(object.candidateDigest, `${what}.candidateDigest`) });
    }
    case "submit_membership_change": {
      bmExactKeys(object, ["kind", "changeKind", "target", "intent"], what);
      return Object.freeze({
        kind,
        changeKind: bmLiteral(object.changeKind, MEMBERSHIP_CHANGE_KINDS, `${what}.changeKind`),
        target: parsePeerRef(object.target),
        intent: bmNonEmpty(object.intent, `${what}.intent`),
      });
    }
    case "approve_membership_change":
    case "reject_membership_change": {
      bmExactKeys(object, ["kind", "candidateDigest"], what);
      return Object.freeze({ kind, candidateDigest: bmDigest(object.candidateDigest, `${what}.candidateDigest`) });
    }
    case "current_accepted":
    case "pending_candidates": {
      bmExactKeys(object, ["kind", "artifactId"], what);
      return Object.freeze({ kind, artifactId: bmStableId(object.artifactId, `${what}.artifactId`) });
    }
    case "changes_since": {
      bmExactKeys(object, ["kind", "throughSeq"], what);
      return Object.freeze({ kind, throughSeq: bmNonNegativeInteger(object.throughSeq, `${what}.throughSeq`) });
    }
    case "workspace_view":
    case "membership":
    case "basis":
      bmExactKeys(object, ["kind"], what);
      return Object.freeze({ kind });
  }
}

export function parseBoundaryRemoteEnvelope(raw: unknown): BoundaryRemoteEnvelope {
  const object = bmObject(raw, "BoundaryRemoteEnvelope");
  bmExactKeys(object, ["schemaVersion", "operationId", "workspaceId", "authenticatedPeer", "operation"], "BoundaryRemoteEnvelope");
  if (object.schemaVersion !== 1) bmFail("BoundaryRemoteEnvelope.schemaVersion must be 1");
  return Object.freeze({
    schemaVersion: 1 as const,
    operationId: bmStableId(object.operationId, "operationId"),
    workspaceId: bmStableId(object.workspaceId, "workspaceId"),
    authenticatedPeer: object.authenticatedPeer === null ? null : parsePeerRef(object.authenticatedPeer),
    operation: parseBoundaryRemoteOperation(object.operation),
  });
}

export function boundaryRequestDigest(envelope: BoundaryRemoteEnvelope): string {
  return canonicalDigest({ domain: BOUNDARY_ENVELOPE_DOMAIN, envelope });
}

export function boundaryOperationIdOf(envelope: Omit<BoundaryRemoteEnvelope, "operationId">): string {
  return `bop-${canonicalDigest({ domain: BOUNDARY_OPERATION_DOMAIN, ...envelope }).slice(0, 32)}`;
}

/* ------------------------------------------------------------------ *
 * Canonical home
 * ------------------------------------------------------------------ */

export type BoundaryRemoteResult =
  | { readonly status: "ok"; readonly operationId: string; readonly basis: BoundaryBasis; readonly result: unknown }
  | { readonly status: "error"; readonly operationId: string | null; readonly code: string; readonly detail: string };

export interface BoundaryHome {
  readonly homeId: string;
  /** Handle one inbound envelope. The caller (adapter) asserts `authenticatedPeer`. */
  handle(raw: unknown): Promise<BoundaryRemoteResult>;
}

function parseOrError(raw: unknown): { envelope: BoundaryRemoteEnvelope } | { error: BoundaryRemoteResult } {
  try {
    return { envelope: parseBoundaryRemoteEnvelope(raw) };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const code = detail.includes("schemaVersion") ? "unsupported_version" : "invalid_envelope";
    return { error: { status: "error", operationId: null, code, detail } };
  }
}

export function makeBoundaryHome(input: {
  readonly homeId: string;
  readonly service: BoundaryMemoryService;
  readonly store: BoundaryMemoryStore;
}): BoundaryHome {
  const { service, store } = input;

  function err(operationId: string | null, error: unknown): BoundaryRemoteResult {
    if (error instanceof BoundaryMemoryStoreError) return { status: "error", operationId, code: error.kind, detail: error.message };
    if (error instanceof Error) return { status: "error", operationId, code: "invalid_request", detail: error.message };
    return { status: "error", operationId, code: "invalid_request", detail: String(error) };
  }

  async function execute(envelope: BoundaryRemoteEnvelope): Promise<unknown> {
    const { operation, workspaceId, authenticatedPeer } = envelope;
    const remote = { authenticatedPeer, local: false } as const;
    switch (operation.kind) {
      case "submit_artifact_candidate":
        return service.proposeRevision({
          workspaceId,
          artifactId: operation.artifactId,
          base: operation.base,
          content: operation.content,
          requiredAcceptors: operation.requiredAcceptors,
          intent: operation.intent,
          ...remote,
        });
      case "accept_artifact_candidate":
        return service.acceptRevision({ workspaceId, artifactId: operation.artifactId, candidateDigest: operation.candidateDigest, ...remote });
      case "reject_artifact_candidate":
        return service.rejectRevision({ workspaceId, artifactId: operation.artifactId, candidateDigest: operation.candidateDigest, ...remote });
      case "submit_membership_change":
        return service.proposeMembershipChange({ workspaceId, kind: operation.changeKind, target: operation.target, intent: operation.intent, ...remote });
      case "approve_membership_change":
        return service.approveMembershipChange({ workspaceId, candidateDigest: operation.candidateDigest, ...remote });
      case "reject_membership_change":
        return service.rejectMembershipChange({ workspaceId, candidateDigest: operation.candidateDigest, ...remote });
      case "workspace_view":
        return service.workspaceView({ workspaceId });
      case "current_accepted":
        return service.currentAccepted({ workspaceId, artifactId: operation.artifactId });
      case "pending_candidates":
        return service.pendingCandidates({ workspaceId, artifactId: operation.artifactId });
      case "membership":
        return service.membership({ workspaceId });
      case "changes_since":
        return service.changesSince({ workspaceId, throughSeq: operation.throughSeq });
      case "basis":
        // Handled before dispatch (it is a raw store basis read, not a service call).
        throw new BoundaryMemoryStoreError("invalid_registration", "basis must not reach the operation dispatcher");
    }
  }

  async function executeReadOrMutation(envelope: BoundaryRemoteEnvelope): Promise<unknown> {
    if (envelope.operation.kind === "basis") {
      const basis = await store.basis(envelope.workspaceId);
      if (basis === undefined) throw new BoundaryMemoryStoreError("unknown_workspace", `workspace "${envelope.workspaceId}" does not exist`);
      return basis;
    }
    return execute(envelope);
  }

  function isMutation(kind: BoundaryRemoteOperation["kind"]): boolean {
    return (
      kind === "submit_artifact_candidate" ||
      kind === "accept_artifact_candidate" ||
      kind === "reject_artifact_candidate" ||
      kind === "submit_membership_change" ||
      kind === "approve_membership_change" ||
      kind === "reject_membership_change"
    );
  }

  return {
    homeId: input.homeId,
    handle: async (raw: unknown): Promise<BoundaryRemoteResult> => {
      const parsed = parseOrError(raw);
      if ("error" in parsed) return parsed.error;
      const envelope = parsed.envelope;
      const mutation = isMutation(envelope.operation.kind);
      const requestDigest = boundaryRequestDigest(envelope);
      if (mutation) {
        // At-least-once dedupe: the same operationId with a different request fails closed.
        const record = await store.operation(envelope.operationId);
        if (record !== undefined) {
          if (record.requestDigest !== requestDigest) {
            return { status: "error", operationId: envelope.operationId, code: "operation_conflict", detail: "this operationId is already bound to a different request" };
          }
          return record.result as BoundaryRemoteResult;
        }
        if (envelope.authenticatedPeer === null) {
          return { status: "error", operationId: envelope.operationId, code: "unauthenticated", detail: "a remote semantic mutation requires an authenticated peer (as asserted by the adapter)" };
        }
      }
      let result: unknown;
      try {
        result = await executeReadOrMutation(envelope);
      } catch (error) {
        return err(envelope.operationId, error);
      }
      let basis: BoundaryBasis;
      try {
        const current = await store.basis(envelope.workspaceId);
        if (current === undefined) return { status: "error", operationId: envelope.operationId, code: "unknown_workspace", detail: `workspace "${envelope.workspaceId}" does not exist` };
        basis = current;
      } catch (error) {
        return err(envelope.operationId, error);
      }
      const outcome: BoundaryRemoteResult = { status: "ok", operationId: envelope.operationId, basis, result };
      if (mutation) {
        try {
          await store.recordOperation({ operationId: envelope.operationId, requestDigest, result: outcome });
        } catch (error) {
          return err(envelope.operationId, error);
        }
      }
      return outcome;
    },
  };
}

/* ------------------------------------------------------------------ *
 * Federated remote client
 * ------------------------------------------------------------------ */

export interface FederatedBoundaryClientDeps {
  readonly peer: PeerRef;
  readonly transport: BoundaryCollaborationTransportPort;
  readonly route: BoundaryWorkspaceRoutePort;
  readonly allocateOperationId: () => string;
}

export interface FederatedBoundaryMutationMeta {
  /** Stable operation identity for retries. Defaults to a freshly allocated id. */
  readonly operationId?: string | undefined;
}

export interface FederatedBoundaryClient {
  proposeRevision(input: {
    readonly workspaceId: string;
    readonly artifactId: string;
    readonly base: AcceptedBoundaryRevisionRef | null;
    readonly content: unknown;
    readonly requiredAcceptors: readonly PeerRef[];
    readonly intent: string;
  } & FederatedBoundaryMutationMeta): Promise<unknown>;
  acceptRevision(input: { readonly workspaceId: string; readonly artifactId: string; readonly candidateDigest: string } & FederatedBoundaryMutationMeta): Promise<unknown>;
  rejectRevision(input: { readonly workspaceId: string; readonly artifactId: string; readonly candidateDigest: string } & FederatedBoundaryMutationMeta): Promise<unknown>;
  proposeMembershipChange(input: { readonly workspaceId: string; readonly changeKind: MembershipChangeKind; readonly target: PeerRef; readonly intent: string } & FederatedBoundaryMutationMeta): Promise<unknown>;
  approveMembershipChange(input: { readonly workspaceId: string; readonly candidateDigest: string } & FederatedBoundaryMutationMeta): Promise<unknown>;
  rejectMembershipChange(input: { readonly workspaceId: string; readonly candidateDigest: string } & FederatedBoundaryMutationMeta): Promise<unknown>;
  workspaceView(input: { readonly workspaceId: string }): Promise<unknown>;
  currentAccepted(input: { readonly workspaceId: string; readonly artifactId: string }): Promise<AcceptedBoundaryState | null>;
  pendingCandidates(input: { readonly workspaceId: string; readonly artifactId: string }): Promise<readonly CandidateView[]>;
  membership(input: { readonly workspaceId: string }): Promise<MembershipView>;
  changesSince(input: { readonly workspaceId: string; readonly throughSeq: number }): Promise<WorkspaceChanges>;
  basis(input: { readonly workspaceId: string }): Promise<BoundaryBasis>;
}

export function makeFederatedBoundaryClient(deps: FederatedBoundaryClientDeps): FederatedBoundaryClient {
  async function invoke<T>(workspaceId: string, operation: BoundaryRemoteOperation, operationId?: string): Promise<T> {
    const home = await deps.route.locate(workspaceId);
    if (home === undefined) throw new BoundaryRemoteError("home_unknown", `no canonical boundary home is configured for workspace "${workspaceId}"`);
    const envelope: BoundaryRemoteEnvelope = Object.freeze({
      schemaVersion: 1 as const,
      operationId: operationId ?? deps.allocateOperationId(),
      workspaceId,
      authenticatedPeer: deps.peer,
      operation,
    });
    const delivered = await deps.transport.deliver({ home, envelope });
    if (delivered.status === "unavailable") throw new BoundaryRemoteError("home_unavailable", delivered.detail);
    const response = delivered.response as BoundaryRemoteResult | undefined;
    if (response === undefined || typeof response !== "object" || !("status" in response)) {
      throw new BoundaryRemoteError("invalid_response", "the boundary home returned an unrecognised response");
    }
    if (response.status === "error") throw new BoundaryRemoteError(response.code, response.detail);
    return response.result as T;
  }

  return {
    proposeRevision: (input) =>
      invoke(input.workspaceId, {
        kind: "submit_artifact_candidate",
        artifactId: input.artifactId,
        base: input.base,
        content: input.content,
        requiredAcceptors: input.requiredAcceptors,
        intent: input.intent,
      }, input.operationId),
    acceptRevision: (input) => invoke(input.workspaceId, { kind: "accept_artifact_candidate", artifactId: input.artifactId, candidateDigest: input.candidateDigest }, input.operationId),
    rejectRevision: (input) => invoke(input.workspaceId, { kind: "reject_artifact_candidate", artifactId: input.artifactId, candidateDigest: input.candidateDigest }, input.operationId),
    proposeMembershipChange: (input) => invoke(input.workspaceId, { kind: "submit_membership_change", changeKind: input.changeKind, target: input.target, intent: input.intent }, input.operationId),
    approveMembershipChange: (input) => invoke(input.workspaceId, { kind: "approve_membership_change", candidateDigest: input.candidateDigest }, input.operationId),
    rejectMembershipChange: (input) => invoke(input.workspaceId, { kind: "reject_membership_change", candidateDigest: input.candidateDigest }, input.operationId),
    workspaceView: (input) => invoke(input.workspaceId, { kind: "workspace_view" }),
    currentAccepted: (input) => invoke(input.workspaceId, { kind: "current_accepted", artifactId: input.artifactId }),
    pendingCandidates: (input) => invoke(input.workspaceId, { kind: "pending_candidates", artifactId: input.artifactId }),
    membership: (input) => invoke(input.workspaceId, { kind: "membership" }),
    changesSince: (input) => invoke(input.workspaceId, { kind: "changes_since", throughSeq: input.throughSeq }),
    basis: (input) => invoke(input.workspaceId, { kind: "basis" }),
  };
}
