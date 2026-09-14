/**
 * G10-P attention service — a deterministic DERIVATION of semantic state, not a scheduler.
 *
 *   Host Wake ≠ Semantic Authority     Notification ≠ Activation
 *   AttentionSignal ≠ Commitment       UserFocus ≠ AuthorityRoot
 *
 * It never decides who is authoritative, never assigns work, and holds no plan. It
 * only answers: "given canonical semantic state, what deserves THIS peer's attention?"
 * Two sources of duplication are handled honestly:
 *   - semantic duplication: candidates derive from singular canonical facts, so an
 *     at-least-once transport redelivery cannot multiply them;
 *   - re-delivery: an in-memory delivered set + a deployment cooldown window. Both are
 *     mechanical and may be forgotten on restart (at-least-once attention is correct).
 *
 * This module imports NO canonical store and NO authority/admission port — only
 * read-only federation/boundary views. `PolicyAdmission ≠ Attention`.
 */

import type { InboxView } from "../federation/messaging.js";
import type { CommitmentSummary } from "../federation/index.js";
import type { PeerRef } from "../federation/peer.js";
import type { AttentionCandidate, AttentionKind, AttentionSignal } from "./signals.js";
import { attentionSignalIdOf, materializeAttentionCandidate, withEscalation } from "./signals.js";
import type { AttentionMarkStore } from "./marks.js";

export interface AttentionFederationPort {
  inbox(peer: PeerRef): Promise<InboxView>;
  commitments(): Promise<readonly CommitmentSummary[]>;
}

export interface PendingBoundaryDecision {
  readonly workspaceId: string;
  readonly artifactId: string;
  readonly candidateDigest: string;
  readonly author: PeerRef;
  readonly intent: string;
}

export interface BoundaryAcceptedHead {
  readonly workspaceId: string;
  readonly artifactId: string;
  readonly acceptedRevision: number;
  readonly candidateDigest: string;
  readonly revisionDigest: string;
  readonly author: PeerRef;
}

/** Read-only boundary attention source; the boundary service/install owns the filtering. */
export interface BoundaryAttentionReadPort {
  pendingDecisionsFor(localPeer: PeerRef): Promise<readonly PendingBoundaryDecision[]>;
  acceptedHeadsFor(localPeer: PeerRef): Promise<readonly BoundaryAcceptedHead[]>;
}

export interface AttentionPolicy {
  readonly policyId: string;
  /** At most one emitted signal per (kind, peer, thread) per window. 0 = no coalescing. */
  readonly cooldownMs: number;
  /**
   * Escalation seam (§44). Return true ONLY for authority-missing, conflicting
   * commitments, irreconcilable boundary disagreement, or a value decision. Absent
   * means this deployment never escalates.
   */
  readonly escalate?: ((candidate: AttentionCandidate) => boolean) | undefined;
}

export function defaultAttentionPolicy(): AttentionPolicy {
  return Object.freeze({ policyId: "default-attention-v1", cooldownMs: 0 });
}

export interface AttentionServiceDeps {
  readonly localPeer: PeerRef;
  readonly federation: AttentionFederationPort;
  readonly boundary?: BoundaryAttentionReadPort | undefined;
  readonly marks?: AttentionMarkStore | undefined;
  readonly policy: AttentionPolicy;
  readonly clock?: (() => string) | undefined;
}

export interface AttentionService {
  readonly policy: AttentionPolicy;
  /** Every currently open attention fact (deduped, deterministic order). */
  pending(): Promise<readonly AttentionSignal[]>;
  /** Pending signals minus already-delivered and within-cooldown ones. Does not mark. */
  drain(): Promise<readonly AttentionSignal[]>;
  /** Called by the host AFTER a successful activation; never before. Persists accepted-revision marks. */
  markDelivered(signalIds: readonly string[]): Promise<void>;
}

function markKeyOf(workspaceId: string, artifactId: string): string {
  return `${workspaceId}\u0000${artifactId}`;
}

function markValueOf(head: BoundaryAcceptedHead): string {
  return `${head.acceptedRevision}:${head.revisionDigest}`;
}

export function makeAttentionService(deps: AttentionServiceDeps): AttentionService {
  const clock = deps.clock ?? (() => new Date().toISOString());
  const delivered = new Set<string>();
  const lastEmittedAt = new Map<string, number>();

  function acceptedHeadSubjects(head: BoundaryAcceptedHead): readonly { kind: string; id: string }[] {
    return [
      { kind: "boundary_workspace", id: head.workspaceId },
      { kind: "boundary_artifact", id: head.artifactId },
      { kind: "boundary_revision", id: head.candidateDigest },
    ];
  }

  function acceptedHeadSignalId(head: BoundaryAcceptedHead): string {
    return attentionSignalIdOf({
      kind: "boundary_revision_accepted",
      peerId: head.author.peerId,
      subjects: acceptedHeadSubjects(head),
    });
  }

  async function acceptedHeads(): Promise<readonly BoundaryAcceptedHead[]> {
    if (deps.boundary === undefined || deps.marks === undefined) return [];
    return deps.boundary.acceptedHeadsFor(deps.localPeer);
  }

  async function candidates(): Promise<readonly AttentionCandidate[]> {
    const now = clock();
    const out: AttentionCandidate[] = [];

    const inbox = await deps.federation.inbox(deps.localPeer);
    const acked = new Set(inbox.acks.map((ack) => ack.messageId));
    for (const message of inbox.received) {
      if (acked.has(message.messageId)) continue;
      out.push(
        materializeAttentionCandidate({
          kind: "inbound_peer_message",
          peer: message.from,
          threadId: message.thread.threadId,
          subjects: [{ kind: "peer_message", id: message.messageId }],
          reason: `inbound message from "${message.from.peerId}" awaits local attention`,
          createdAt: now,
        }),
      );
    }

    for (const commitment of await deps.federation.commitments()) {
      if (commitment.state !== "OFFERED") continue;
      if (commitment.holder.peerId !== deps.localPeer.peerId) continue;
      out.push(
        materializeAttentionCandidate({
          kind: "commitment_decision_required",
          peer: commitment.proposer,
          subjects: [{ kind: "commitment", id: commitment.commitmentId }],
          reason: `commitment "${commitment.commitmentId}" is OFFERED to this peer and awaits an explicit decision`,
          createdAt: now,
        }),
      );
    }

    if (deps.boundary !== undefined) {
      for (const decision of await deps.boundary.pendingDecisionsFor(deps.localPeer)) {
        out.push(
          materializeAttentionCandidate({
            kind: "boundary_decision_required",
            peer: decision.author,
            subjects: [
              { kind: "boundary_artifact", id: decision.artifactId },
              { kind: "boundary_candidate", id: decision.candidateDigest },
            ],
            reason: `boundary candidate for "${decision.workspaceId}/${decision.artifactId}" requires this peer's decision`,
            createdAt: now,
          }),
        );
      }
      for (const head of await acceptedHeads()) {
        const mark = await deps.marks!.read(markKeyOf(head.workspaceId, head.artifactId));
        if (mark === markValueOf(head)) continue;
        out.push(
          materializeAttentionCandidate({
            kind: "boundary_revision_accepted",
            peer: head.author,
            subjects: acceptedHeadSubjects(head),
            reason: `accepted boundary revision advanced for "${head.workspaceId}/${head.artifactId}"`,
            createdAt: now,
          }),
        );
      }
    }

    // Deduplicate by deterministic signalId (first occurrence wins; createdAt is not identity).
    const byId = new Map<string, AttentionCandidate>();
    for (const candidate of out) if (!byId.has(candidate.signalId)) byId.set(candidate.signalId, candidate);
    return [...byId.values()].sort((a, b) => (a.signalId < b.signalId ? -1 : 1));
  }

  function escalate(candidate: AttentionCandidate): boolean {
    return deps.policy.escalate?.(candidate) === true;
  }

  async function pending(): Promise<readonly AttentionSignal[]> {
    return Object.freeze((await candidates()).map((candidate) => withEscalation(candidate, escalate(candidate))));
  }

  function coalesceKey(signal: AttentionSignal): string {
    return `${signal.kind}\u0000${signal.peer.peerId}\u0000${signal.threadId ?? "-"}`;
  }

  async function drain(): Promise<readonly AttentionSignal[]> {
    const all = await pending();
    const nowMs = Date.parse(clock());
    const emitted: AttentionSignal[] = [];
    for (const signal of all) {
      if (delivered.has(signal.signalId)) continue;
      const key = coalesceKey(signal);
      const last = lastEmittedAt.get(key);
      if (last !== undefined && deps.policy.cooldownMs > 0 && nowMs - last < deps.policy.cooldownMs) continue;
      lastEmittedAt.set(key, nowMs);
      emitted.push(signal);
    }
    return Object.freeze(emitted);
  }

  async function markDelivered(signalIds: readonly string[]): Promise<void> {
    const ids = new Set(signalIds);
    for (const signalId of ids) delivered.add(signalId);
    // Persist "already raised" for accepted boundary revisions so a restart does not
    // re-signal a revision this deployment has already been told about.
    if (deps.marks !== undefined) {
      for (const head of await acceptedHeads()) {
        if (ids.has(acceptedHeadSignalId(head))) {
          await deps.marks.write(markKeyOf(head.workspaceId, head.artifactId), markValueOf(head));
        }
      }
    }
  }

  return { policy: deps.policy, pending, drain, markDelivered };
}
