/**
 * G10-P inbound pump — the ONE bridge from mechanical observation to semantic ingest.
 *
 *   StateChangeFeed "something changed"
 *        ↓  (mechanical, at-least-once)
 *   durable transport: re-read + STRICT parse the exact envelope
 *        ↓
 *   Palimpsest federation service / boundary canonical home   (semantic truth)
 *        ↓
 *   CoordinationStore semantic event  → derived inbox/thread
 *
 * This module imports a STRUCTURAL federation/boundary ingest seam, never a store or
 * an authority port. It never mutates a semantic store directly; every semantic step
 * is a named federation/boundary service call. Transport replay can therefore never
 * bypass the semantic parser, and `TransportTruth ≠ CollaborationTruth`.
 *
 * Checkpoint discipline (at-least-once, no exactly-once fiction): the cursor advances
 * only AFTER a change has been fully ingested. A crash between ingest and checkpoint
 * replays the change; semantic idempotency (stable `operationId` → transport message
 * id, commitment state re-read, boundary home receipts) absorbs the replay.
 */

import type { InboundPeerEnvelope } from "../federation/transport.js";
import type { PeerRef } from "../federation/peer.js";
import { materializePeerMessage, materializeThreadRef } from "../federation/messages.js";
import type { BoundaryRemoteEnvelope } from "../boundary_memory/index.js";
import type { DurableOperationTransportPort } from "./ordarium_transport.js";
import type { TransportCursorStore } from "./cursor_store.js";
import type { DurablePeerEnvelope } from "./envelope.js";
import { mailboxNamespace } from "./envelope.js";

export interface FederationRemoteIngestPort {
  recordInboundMessage(envelope: InboundPeerEnvelope): Promise<unknown>;
  acceptCommitment(input: {
    readonly commitmentId: string;
    readonly authenticatedPeer: PeerRef | null;
    readonly local?: boolean;
  }): Promise<unknown>;
  rejectCommitment(input: {
    readonly commitmentId: string;
    readonly authenticatedPeer: PeerRef | null;
    readonly local?: boolean;
  }): Promise<unknown>;
  releaseCommitment(input: {
    readonly commitmentId: string;
    readonly authenticatedPeer?: PeerRef | null;
    readonly local?: boolean;
  }): Promise<unknown>;
  commitmentState(commitmentId: string): Promise<{ readonly state: string; readonly holder: PeerRef } | undefined>;
}

export interface BoundaryHomeIngestPort {
  handle(raw: unknown): Promise<unknown>;
}

export interface InboundPumpStatus {
  readonly processed: number;
  readonly ingested: number;
  readonly skipped: number;
  readonly cursor: string;
  readonly mailbox: string;
}

export type InboundPumpStats = Omit<InboundPumpStatus, "mailbox">;

export class InboundPumpError extends Error {
  constructor(
    readonly kind:
      | "federation_absent"
      | "boundary_home_absent"
      | "commitment_not_found"
      | "commitment_conflict"
      | "step_limit_exceeded",
    message: string,
  ) {
    super(message);
    this.name = "InboundPumpError";
  }
}

export interface InboundPumpOptions {
  readonly transport: DurableOperationTransportPort;
  readonly localPeer: PeerRef;
  readonly cursorStore: TransportCursorStore;
  /** Deployment/consumer identity for cursor ownership — NOT a peer identity. */
  readonly consumerId: string;
  readonly federation?: FederationRemoteIngestPort | undefined;
  readonly boundaryHome?: BoundaryHomeIngestPort | undefined;
  readonly maxStepsPerRun?: number | undefined;
}

export interface FederationInboundPump {
  readonly mailbox: string;
  /** Drain the mailbox once (bounded). Safe to call repeatedly; pull mode is always valid. */
  pumpOnce(input?: { readonly fromStart?: boolean }): Promise<InboundPumpStatus>;
  /** The durable cursor currently recorded for this consumer (mechanical, noncanonical). */
  cursor(): Promise<string | undefined>;
}

type Outcome = "ingested" | "skipped";

export function makeFederationInboundPump(options: InboundPumpOptions): FederationInboundPump {
  const mailbox = mailboxNamespace(options.transport.namespace, options.localPeer.peerId);
  const maxSteps = options.maxStepsPerRun ?? 1_000;

  function requireFederation(): FederationRemoteIngestPort {
    if (options.federation === undefined) {
      throw new InboundPumpError("federation_absent", "inbound operation requires a configured federation service");
    }
    return options.federation;
  }

  async function applyCommitmentDecision(
    kind: "commitment_accept" | "commitment_reject" | "commitment_release",
    commitmentId: string,
    from: PeerRef,
  ): Promise<Outcome> {
    const federation = requireFederation();
    const current = await federation.commitmentState(commitmentId);
    if (kind === "commitment_accept") {
      // Idempotent replay: the decision is already in force for this holder.
      if (current !== undefined && current.state === "ACTIVE" && current.holder.peerId === from.peerId) {
        return "ingested";
      }
      if (current === undefined) {
        throw new InboundPumpError("commitment_not_found", `commitment "${commitmentId}" was never offered locally`);
      }
      await federation.acceptCommitment({ commitmentId, authenticatedPeer: from });
      return "ingested";
    }
    if (kind === "commitment_reject") {
      if (current !== undefined && current.state === "REJECTED") return "ingested";
      if (current === undefined) {
        throw new InboundPumpError("commitment_not_found", `commitment "${commitmentId}" was never offered locally`);
      }
      await federation.rejectCommitment({ commitmentId, authenticatedPeer: from });
      return "ingested";
    }
    if (current !== undefined && current.state === "RELEASED") return "ingested";
    if (current === undefined) {
      throw new InboundPumpError("commitment_not_found", `commitment "${commitmentId}" was never offered locally`);
    }
    await federation.releaseCommitment({ commitmentId, authenticatedPeer: from });
    return "ingested";
  }

  async function dispatch(envelope: DurablePeerEnvelope): Promise<Outcome> {
    // Mailboxes are per-recipient; a misaddressed operation is not ours and is
    // mechanically skipped (never interpreted).
    if (envelope.to.peerId !== options.localPeer.peerId) return "skipped";
    const operation = envelope.operation;
    switch (operation.kind) {
      case "peer_message": {
        const federation = requireFederation();
        await federation.recordInboundMessage({
          transportMessageId: envelope.operationId,
          authenticatedPeer: envelope.from,
          message: materializePeerMessage({
            messageId: envelope.operationId,
            thread: materializeThreadRef({ threadId: operation.threadId }),
            from: envelope.from,
            to: envelope.to,
            body: operation.body,
          }),
        });
        return "ingested";
      }
      case "commitment_accept":
        return applyCommitmentDecision("commitment_accept", operation.commitmentId, envelope.from);
      case "commitment_reject":
        return applyCommitmentDecision("commitment_reject", operation.commitmentId, envelope.from);
      case "commitment_release":
        return applyCommitmentDecision("commitment_release", operation.commitmentId, envelope.from);
      case "boundary": {
        if (options.boundaryHome === undefined) {
          throw new InboundPumpError(
            "boundary_home_absent",
            `boundary operation for workspace "${operation.workspaceId}" arrived but this peer holds no canonical boundary home`,
          );
        }
        const raw: BoundaryRemoteEnvelope = Object.freeze({
          schemaVersion: 1 as const,
          operationId: envelope.operationId,
          workspaceId: operation.workspaceId,
          // Authenticated as asserted by the adapter (the transport envelope's sender).
          authenticatedPeer: envelope.from,
          operation: operation.operation,
        });
        await options.boundaryHome.handle(raw);
        return "ingested";
      }
    }
  }

  async function pumpOnce(input?: { readonly fromStart?: boolean }): Promise<InboundPumpStatus> {
    let cursor =
      input?.fromStart === true ? undefined : await options.cursorStore.read({ consumerId: options.consumerId, mailbox });
    let processed = 0;
    let ingested = 0;
    let skipped = 0;
    for (let step = 0; step < maxSteps; step += 1) {
      // limit: 1 makes the returned cursor the exact position of the single change,
      // so a failed ingest never advances past unprocessed work.
      const page = await options.transport.observe({
        mailbox,
        ...(cursor === undefined ? {} : { cursor }),
        limit: 1,
      });
      const envelope = page.envelopes[0];
      if (envelope === undefined) {
        // Caught up: persist the durable position so later changes resume from here.
        await options.cursorStore.write({ consumerId: options.consumerId, mailbox, cursor: page.cursor });
        return Object.freeze({ processed, ingested, skipped, cursor: page.cursor, mailbox });
      }
      // A dispatch failure throws BEFORE the checkpoint: the change is redelivered
      // later and semantic idempotency absorbs the replay. No silent skip.
      const outcome = await dispatch(envelope);
      await options.cursorStore.write({ consumerId: options.consumerId, mailbox, cursor: page.cursor });
      cursor = page.cursor;
      processed += 1;
      if (outcome === "ingested") ingested += 1;
      else skipped += 1;
      if (!page.hasMore) {
        return Object.freeze({ processed, ingested, skipped, cursor: page.cursor, mailbox });
      }
    }
    throw new InboundPumpError("step_limit_exceeded", `inbound pump exceeded ${maxSteps} steps in one run`);
  }

  return {
    mailbox,
    pumpOnce,
    cursor: () => options.cursorStore.read({ consumerId: options.consumerId, mailbox }),
  };
}
