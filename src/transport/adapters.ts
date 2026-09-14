/**
 * G10-P transport adapters: bind the durable mechanical transport to the existing
 * semantic ports WITHOUT changing their meaning.
 *
 *   PeerRef carries no transport address; the mailbox is a deployment binding.
 *   Local identity is the configured local peer — never a caller-supplied `from`
 *   (`P-A16`), and the adapter assertion is not self-reported (`P-A17`).
 *
 * The boundary client here is SUBMISSION-ONLY. G10-L's `FederatedBoundaryClient` is a
 * synchronous request/response protocol (it needs the canonical home's basis in the
 * reply); a fire-and-forget durable substrate cannot honestly fabricate that reply.
 * So remote peers submit mutations durably and the canonical home answers reads
 * locally — remote bound reads stay a documented carry-forward.
 */

import type { PeerTransportPort } from "../federation/transport.js";
import type { PeerRef } from "../federation/peer.js";
import { materializePeerRef } from "../federation/peer.js";
import type { BoundaryHomeRef, BoundaryRemoteOperation, BoundaryWorkspaceRoutePort } from "../boundary_memory/index.js";
import { BoundaryRemoteError } from "../boundary_memory/index.js";
import type { DurableOperationTransportPort } from "./ordarium_transport.js";

export function peerTransportFromDurable(
  transport: DurableOperationTransportPort,
  input: { readonly localPeer: PeerRef },
): PeerTransportPort {
  return {
    adapterId: transport.adapterId,
    async send(request) {
      // The sender is the configured local peer; `request.from` is ignored by design.
      await transport.submit({
        operationId: request.messageId,
        from: input.localPeer,
        to: request.to,
        operation: { kind: "peer_message", threadId: request.threadId, body: request.body },
      });
      return { transportMessageId: request.messageId, delivered: true };
    },
  };
}

/** The default home→peer binding is the deployment convention `home-<peerId>`. */
export function defaultHomePeerOf(home: BoundaryHomeRef): PeerRef | undefined {
  const prefix = "home-";
  if (!home.homeId.startsWith(prefix)) return undefined;
  const peerId = home.homeId.slice(prefix.length);
  if (peerId.length === 0) return undefined;
  return materializePeerRef({ peerId });
}

export interface DurableBoundaryClient {
  /**
   * Queue one boundary mutation for the workspace's canonical home. At-least-once:
   * the stable `operationId` makes retries idempotent at the home. The reply is a
   * mechanical queue receipt — never a boundary acceptance.
   */
  submit(input: {
    readonly workspaceId: string;
    readonly operation: BoundaryRemoteOperation;
    readonly operationId?: string | undefined;
  }): Promise<{ readonly queued: true; readonly operationId: string }>;
}

export function durableBoundaryClient(
  transport: DurableOperationTransportPort,
  input: {
    readonly localPeer: PeerRef;
    readonly route: BoundaryWorkspaceRoutePort;
    readonly allocateOperationId: () => string;
    readonly homePeerOf?: ((home: BoundaryHomeRef) => PeerRef | undefined) | undefined;
  },
): DurableBoundaryClient {
  const homePeerOf = input.homePeerOf ?? defaultHomePeerOf;
  return {
    async submit(request) {
      const home = await input.route.locate(request.workspaceId);
      if (home === undefined) {
        throw new BoundaryRemoteError(
          "home_unknown",
          `no canonical boundary home is configured for workspace "${request.workspaceId}"`,
        );
      }
      const homePeer = homePeerOf(home);
      if (homePeer === undefined) {
        throw new BoundaryRemoteError(
          "home_unavailable",
          `boundary home "${home.homeId}" is not bound to a transport peer`,
        );
      }
      const operationId = request.operationId ?? input.allocateOperationId();
      await transport.submit({
        operationId,
        from: input.localPeer,
        to: homePeer,
        operation: { kind: "boundary", workspaceId: request.workspaceId, operation: request.operation },
      });
      return { queued: true, operationId };
    },
  };
}
