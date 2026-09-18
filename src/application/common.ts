/**
 * SR-1D R2 §7/§9 — the shared application-surface helpers.
 *
 * Pure adapters shared by the per-capability cluster modules. Each cluster declares its OWN
 * narrow input interface rather than importing a shared aggregate deps type, because a shared
 * type that referenced the cluster face types would create a module cycle (§9 allows either a
 * `Pick` or a dedicated narrow input type).
 */

import type { PeerRef } from "../federation/peer.js";
import { materializePeerRef } from "../federation/peer.js";
import type { BoundaryRemoteOperation } from "../boundary_memory/index.js";

export function invalidInput(message: string): Error {
  const error = new Error(message);
  (error as { kind?: string }).kind = "invalid_value";
  return error;
}

export function requireLocal(deps: { readonly localPeer?: PeerRef | undefined }): PeerRef {
  if (deps.localPeer === undefined) throw new Error("no local peer is configured for this installation");
  return deps.localPeer;
}

/**
 * Tool/HTTP callers naturally write peer ids as bare strings. Normalize them to the canonical
 * `PeerRef` shape here (the product boundary), so the strict wire parser still sees exact refs.
 */
export function asPeerRef(value: unknown): PeerRef {
  return typeof value === "string" ? materializePeerRef({ peerId: value }) : (value as PeerRef);
}

export function normalizeBoundaryOperation(operation: BoundaryRemoteOperation): BoundaryRemoteOperation {
  const raw = operation as unknown as Record<string, unknown>;
  if (raw.kind === "submit_artifact_candidate" && Array.isArray(raw.requiredAcceptors)) {
    return { ...raw, requiredAcceptors: (raw.requiredAcceptors as unknown[]).map(asPeerRef) } as unknown as BoundaryRemoteOperation;
  }
  if (raw.kind === "submit_membership_change" && raw.target !== undefined) {
    return { ...raw, target: asPeerRef(raw.target) } as unknown as BoundaryRemoteOperation;
  }
  return operation;
}

