/**
 * G10-E2 peer directory — the read-only discovery boundary (§51/§52), reusing
 * the D4 knowledge discipline: `known | unknown | error`, and UNKNOWN is
 * NEVER interpreted as "no peers".
 */

import type { ObservationKnowledge } from "../runtime/index.js";
import type { PeerAdvertisement } from "./peer.js";

export interface PeerDirectoryPort {
  observePeers(): Promise<ObservationKnowledge<readonly PeerAdvertisement[]>>;
}

/**
 * Deterministic candidate discovery over an observed directory (§53).
 * `directory_unknown` propagates — it is never an empty candidate list.
 */
export async function discoverContactCandidates(
  directory: PeerDirectoryPort,
  need: import("./peer.js").ContactNeed,
): Promise<
  | { readonly status: "discovered"; readonly candidates: readonly import("./peer.js").ContactCandidate[] }
  | { readonly status: "directory_unknown"; readonly detail: string }
  | { readonly status: "directory_error"; readonly detail: string }
> {
  const observed = await directory.observePeers();
  if (observed.state === "unknown") {
    return {
      status: "directory_unknown",
      detail: `peer directory observation is unknown: ${observed.detail} (unknown is never an empty directory)`,
    };
  }
  if (observed.state === "error") {
    return { status: "directory_error", detail: observed.detail };
  }
  const { matchContactCandidates } = await import("./peer.js");
  return { status: "discovered", candidates: matchContactCandidates(need, observed.value) };
}
