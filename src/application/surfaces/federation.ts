/**
 * SR-1D R2 §7/§8/§9 — the federation application-surface cluster.
 *
 * Owns BOTH the façade interfaces (FederationApplicationSurface, RemoteSubmissionPort, BoundaryApplicationSurface, AttentionApplicationSurface) and the constructor that
 * implements them, from a NARROW input: this module can only see the 4 dependencies it
 * actually reads (attention, boundary, federation, remoteTransport). Behaviour is unchanged.
 */

import { requireLocal, normalizeBoundaryOperation } from "../common.js";
import type { BoundaryMemoryService, BoundaryObservation, BoundaryWorkspaceView, CandidateView, MembershipView, AcceptedBoundaryState } from "../../boundary_memory/index.js";
import type { FederationService } from "../../federation/index.js";
import type { CommitmentScope, CommitmentState, CommitmentSummary } from "../../federation/index.js";
import type { AttentionService, AttentionSignal } from "../../attention/index.js";
import type { PeerRef } from "../../federation/peer.js";
import type { DurablePeerOperation } from "../../transport/envelope.js";
import type { BoundaryRemoteOperation } from "../../boundary_memory/index.js";

/** Exactly the dependencies this cluster reads — nothing else is visible to it (§9). */
export interface FederationSurfaceDeps {
  readonly localPeer?: PeerRef | undefined;
  readonly attention?: AttentionService | undefined;
  readonly boundary?: BoundaryMemoryService | undefined;
  readonly federation?: FederationService | undefined;
  readonly remoteTransport?: RemoteSubmissionPort | undefined;
}

export interface FederationApplicationSurface {
  readonly localPeer: PeerRef;
  inbox(): Promise<unknown>;
  thread(threadId: string): Promise<unknown>;
  sendMessage(input: { readonly to: PeerRef; readonly threadId: string; readonly body: string }): Promise<unknown>;
  declareContactNeed(input: { readonly origin: unknown; readonly competenceTags: readonly string[]; readonly reason: string }): Promise<unknown>;
  findCandidates(input: { readonly competenceTags: readonly string[]; readonly origin: unknown; readonly reason: string }): Promise<unknown>;
  offerCommitment(input: { readonly proposedHolder: PeerRef; readonly scope: CommitmentScope; readonly statement: string }): Promise<unknown>;
  acceptCommitment(commitmentId: string): Promise<unknown>;
  rejectCommitment(commitmentId: string): Promise<unknown>;
  releaseCommitment(commitmentId: string): Promise<void>;
  offerHandoff(input: { readonly commitmentId: string; readonly to: PeerRef }): Promise<unknown>;
  acceptHandoff(handoffId: string): Promise<unknown>;
  commitmentState(commitmentId: string): Promise<CommitmentState | undefined>;
  /** G10-P (CF-O-01): read-only enumeration of every commitment with its derived state. */
  commitments(): Promise<readonly CommitmentSummary[]>;
  /**
   * G10-Q: communicate THIS peer's explicit decision on a commitment whose canonical record
   * lives with another peer. Absent when no durable remote-submission port is wired.
   */
  submitRemoteDecision?(input: {
    readonly to: PeerRef;
    readonly commitmentId: string;
    readonly decision: "accept" | "reject" | "release";
  }): Promise<unknown>;
}

/** G10-Q: the durable remote-submission port the application needs to act as a non-home peer. */
export interface RemoteSubmissionPort {
  submitOperation(input: {
    readonly to: PeerRef;
    readonly operation: DurablePeerOperation;
    readonly operationId?: string;
  }): Promise<unknown>;
  submitBoundary(input: {
    readonly workspaceId: string;
    readonly operation: BoundaryRemoteOperation;
    readonly operationId?: string;
  }): Promise<unknown>;
}

export interface BoundaryApplicationSurface {
  readonly localPeer: PeerRef;
  view(workspaceId: string): Promise<BoundaryWorkspaceView>;
  currentAccepted(input: { readonly workspaceId: string; readonly artifactId: string }): Promise<AcceptedBoundaryState | null>;
  pendingCandidates(input: { readonly workspaceId: string; readonly artifactId: string }): Promise<readonly CandidateView[]>;
  changesSince(input: { readonly workspaceId: string; readonly sinceSeq: number }): Promise<unknown>;
  membership(workspaceId: string): Promise<MembershipView>;
  observation(workspaceId: string): Promise<BoundaryObservation | undefined>;
  proposeRevision(input: { readonly workspaceId: string; readonly artifactId: string; readonly base: unknown; readonly content: unknown; readonly requiredAcceptors: readonly PeerRef[]; readonly intent: string }): Promise<unknown>;
  decide(input: { readonly workspaceId: string; readonly artifactId: string; readonly candidateDigest: string; readonly decision: "accept" | "reject" }): Promise<unknown>;
  /**
   * G10-Q: submit a typed boundary mutation to the workspace's canonical home when THIS peer is
   * not the home. Submission-only (at-least-once); the reply is a queue receipt, never acceptance.
   */
  submitRemote?(input: {
    readonly workspaceId: string;
    readonly operation: BoundaryRemoteOperation;
    readonly operationId?: string;
  }): Promise<unknown>;
}

export interface AttentionApplicationSurface {
  readonly policyId: string;
  /** Every currently open attention fact for this local peer (deduped, read-only). */
  pending(): Promise<readonly AttentionSignal[]>;
}

export function makeFederationSurfaces(deps: FederationSurfaceDeps): { readonly federation: FederationApplicationSurface | undefined; readonly boundary: BoundaryApplicationSurface | undefined; readonly attention: AttentionApplicationSurface | undefined } {
    const federation: FederationApplicationSurface | undefined =
      deps.federation === undefined
        ? undefined
        : (() => {
            const service = deps.federation!;
            const localPeer = requireLocal(deps);
            return {
              localPeer,
              inbox: () => service.inbox(localPeer),
              thread: (threadId) => service.thread(threadId),
              sendMessage: (input) => service.sendMessage({ to: input.to, threadId: input.threadId, body: input.body }),
              declareContactNeed: async (input) => {
                const need = await service.declareContactNeed({ origin: input.origin as never, competenceTags: input.competenceTags, reason: input.reason });
                return need;
              },
              findCandidates: async (input) => {
                const need = await service.declareContactNeed({ origin: input.origin as never, competenceTags: input.competenceTags, reason: input.reason });
                const candidates = await service.findCandidates(need);
                return { need, candidates };
              },
              offerCommitment: (input) => service.offerCommitment(input),
              // Local actor identity is derived here — never supplied by the caller.
              acceptCommitment: (commitmentId) => service.acceptCommitment({ commitmentId, authenticatedPeer: null, local: true }),
              rejectCommitment: (commitmentId) => service.rejectCommitment({ commitmentId, authenticatedPeer: null, local: true }),
              releaseCommitment: (commitmentId) => service.releaseCommitment({ commitmentId }),
              offerHandoff: (input) => service.offerHandoff(input),
              acceptHandoff: (handoffId) => service.acceptHandoff({ handoffId, authenticatedPeer: null, local: true }),
              commitmentState: async (commitmentId) => (await service.commitmentState(commitmentId))?.state as CommitmentState | undefined,
              commitments: () => service.commitments(),
              ...(deps.remoteTransport === undefined
                ? {}
                : {
                    submitRemoteDecision: (input: {
                      readonly to: PeerRef;
                      readonly commitmentId: string;
                      readonly decision: "accept" | "reject" | "release";
                    }) =>
                      deps.remoteTransport!.submitOperation({
                        to: input.to,
                        operation: { kind: `commitment_${input.decision}`, commitmentId: input.commitmentId },
                      }),
                  }),
            };
          })();


    const boundary: BoundaryApplicationSurface | undefined =
      deps.boundary === undefined
        ? undefined
        : (() => {
            const service = deps.boundary!;
            const localPeer = requireLocal(deps);
            return {
              localPeer,
              view: (workspaceId) => service.workspaceView({ workspaceId }),
              currentAccepted: (input) => service.currentAccepted(input),
              pendingCandidates: (input) => service.pendingCandidates(input),
              changesSince: (input) => service.changesSince({ workspaceId: input.workspaceId, throughSeq: input.sinceSeq }),
              membership: (workspaceId) => service.membership({ workspaceId }),
              observation: (workspaceId) => service.boundaryObservation({ workspaceId }),
              proposeRevision: (input) => service.proposeRevision({ workspaceId: input.workspaceId, artifactId: input.artifactId, base: input.base as never, content: input.content, requiredAcceptors: input.requiredAcceptors, intent: input.intent }),
              decide: (input) =>
                input.decision === "accept"
                  ? service.acceptRevision({ workspaceId: input.workspaceId, artifactId: input.artifactId, candidateDigest: input.candidateDigest, authenticatedPeer: null, local: true })
                  : service.rejectRevision({ workspaceId: input.workspaceId, artifactId: input.artifactId, candidateDigest: input.candidateDigest, authenticatedPeer: null, local: true }),
              ...(deps.remoteTransport === undefined
                ? {}
                : {
                    submitRemote: (input: {
                      readonly workspaceId: string;
                      readonly operation: BoundaryRemoteOperation;
                      readonly operationId?: string;
                    }) =>
                      deps.remoteTransport!.submitBoundary({
                        workspaceId: input.workspaceId,
                        operation: normalizeBoundaryOperation(input.operation),
                        ...(input.operationId === undefined ? {} : { operationId: input.operationId }),
                      }),
                  }),
            };
          })();


    const attention: AttentionApplicationSurface | undefined =
      deps.attention === undefined
        ? undefined
        : {
            policyId: deps.attention.policy.policyId,
            pending: () => deps.attention!.pending(),
          };


  return { federation, boundary, attention };
}
