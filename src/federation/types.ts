/**
 * PAL-FED-0 durable semantic shapes (EXPERIMENTAL).
 *
 * These are the experimental three durable types plus the fabric marker and
 * the boundary-delta vocabulary. They are deliberately not UAS types: nothing
 * here may be promoted into schema/ without a G10-A0 rebase decision.
 */

import { PAL_FED_PROTOCOL, PAL_FED_SCHEMA_VERSION } from "./limits.js";
import type { PeerRef } from "./peers.js";

export const EVENT_KINDS = [
  "need",
  "proposal",
  "constraint",
  "question",
  "decision",
  "change_ready",
  "evidence",
  "blocker",
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

export const ARTIFACT_KINDS = ["git_commit", "test_run", "document", "url", "other"] as const;

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/** A provenance locator, never an embedded payload and never auto-fetched. */
export interface ArtifactRef {
  readonly kind: ArtifactKind;
  readonly locator: string;
  readonly label?: string;
  readonly digest?: string;
}

/** Immutable cross-peer boundary delta. Stored at revision 1 forever. */
export interface CollaborationEvent {
  readonly schemaVersion: typeof PAL_FED_SCHEMA_VERSION;
  readonly eventId: string;
  readonly threadId: string;
  readonly from: PeerRef;
  readonly to: PeerRef;
  readonly kind: EventKind;
  readonly body: string;
  readonly contractId?: string;
  readonly artifacts?: readonly ArtifactRef[];
  readonly createdAt: string;
}

export interface ContractTerms {
  readonly requirements: readonly string[];
  readonly constraints: readonly string[];
  readonly interfaceNotes: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly openQuestions: readonly string[];
}

export interface ContractAcceptance {
  readonly peer: PeerRef;
  /** The exact digest the acceptance is bound to (FED-INV-5). */
  readonly termsDigest: string;
  readonly acceptedAt: string;
}

/**
 * Revisioned boundary agreement candidate/state. Unlike events, contract
 * revisions 1 -> 2 -> 3 are expected.
 */
export interface BoundaryContract {
  readonly schemaVersion: typeof PAL_FED_SCHEMA_VERSION;
  readonly contractId: string;
  readonly participants: readonly PeerRef[];
  readonly title: string;
  readonly terms: ContractTerms;
  readonly termsDigest: string;
  readonly proposedBy: PeerRef;
  readonly acceptedBy: readonly ContractAcceptance[];
  readonly status: "draft" | "agreed";
  readonly updatedBy: PeerRef;
  readonly updatedAt: string;
}

export interface ContractRevisionRef {
  readonly contractId: string;
  readonly revision: number;
}

/** A persisted delivery batch: what the peer was shown, and where to resume. */
export interface PendingBatch {
  readonly batchId: string;
  readonly eventNextCursor?: string;
  readonly contractNextCursor?: string;
  readonly eventIds: readonly string[];
  readonly contractRevisions: readonly ContractRevisionRef[];
}

/** Per-peer inbox/delivery progress. One subject per peer. */
export interface PeerInboxState {
  readonly schemaVersion: typeof PAL_FED_SCHEMA_VERSION;
  readonly peer: PeerRef;
  readonly eventCursor?: string;
  readonly contractCursor?: string;
  readonly pending?: PendingBatch;
  readonly lastAckedBatchId?: string;
}

/** Host-defined fabric identity, written by explicit `init` only. */
export interface FederationFabricMarker {
  readonly schemaVersion: typeof PAL_FED_SCHEMA_VERSION;
  readonly protocol: typeof PAL_FED_PROTOCOL;
  readonly fabricId: string;
  readonly peers: readonly PeerRef[];
  readonly createdAt: string;
}

/** Identity of one exact durable revision, as an Ordarium StateRef id. */
export function stateRefId(namespace: string, key: string, revision: number): string {
  return `${namespace}/${key}@${revision}`;
}
