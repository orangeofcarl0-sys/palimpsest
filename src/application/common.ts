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

/**
 * Host-supplied facts about a RUNNING deployment that exist only once it starts serving.
 *
 * Declared HERE, in the layer that consumes it, and not in the composition root that wires it: a
 * facade that imported its own port from `composition/` would be an L4 → L5 edge, i.e. application
 * code reaching up into host wiring (§6), and the two directions together closed a cycle. The
 * composition root imports the port from this module instead — the direction the layers allow.
 *
 * A method rather than a value on purpose: a profile may ask the host to serve on port 0 and let the
 * OS choose, so the dashboard url does not exist at composition time. The host wires an
 * implementation after `serveOrchestration` returns, and the agent-facing discovery tool reads it
 * then, which is why a captured string would be wrong rather than merely early.
 */
export interface HostDeploymentFactsPort {
  /** Where a human can watch this project, or null when this deployment serves no dashboard. */
  dashboardUrl(): string | null;
}

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

