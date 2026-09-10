/**
 * PAL-FED-0 fixed peer identity (EXPERIMENTAL, §11/§12/§48).
 *
 * PAL-FED-0 supports exactly two logical persistent peers. There is no
 * discovery, no registry, no dynamic organization: the peer set is a compile
 * time constant and every durable record validates against it.
 */

import { UnknownPeerError } from "./errors.js";

/** The only two peer identities this experiment recognizes, in fabric order. */
export const FIXED_PEERS = ["palimpsest.main", "ordarium.main"] as const;

export type PeerRef = (typeof FIXED_PEERS)[number];

const PEER_SET: ReadonlySet<string> = new Set<string>(FIXED_PEERS);

export function isPeerRef(value: unknown): value is PeerRef {
  return typeof value === "string" && PEER_SET.has(value);
}

/** Validate an untrusted value as a configured peer (throws FED_PEER_UNKNOWN). */
export function assertPeerRef(value: unknown, context: string): PeerRef {
  if (!isPeerRef(value)) {
    throw new UnknownPeerError(
      `${context}: '${String(value)}' is not one of the two PAL-FED-0 peers (${FIXED_PEERS.join(", ")})`,
    );
  }
  return value;
}

/** The single other peer; meaningful precisely because the peer set is frozen at two. */
export function otherPeer(self: PeerRef): PeerRef {
  const other = FIXED_PEERS.find((peer) => peer !== self);
  if (other === undefined) {
    // Unreachable while FIXED_PEERS has two distinct members.
    throw new UnknownPeerError(`no counterpart configured for ${self}`);
  }
  return other;
}

/** True when the two peers are exactly the fixed set, order-insensitively. */
export function isFixedPeerSet(peers: readonly string[]): boolean {
  if (peers.length !== FIXED_PEERS.length) return false;
  const seen = new Set(peers);
  return FIXED_PEERS.every((peer) => seen.has(peer));
}
