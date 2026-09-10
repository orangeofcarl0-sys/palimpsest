/**
 * PAL-FED-0 fabric identity (EXPERIMENTAL, §10/§50).
 *
 * A coordination DB is a fabric only if it contains a host-defined marker in
 * the ordinary Ordarium state namespace plmp.collab.meta/fabric. Normal
 * adapter startup reads it and fails closed when it is missing or disagrees
 * with process configuration. There is no init-on-connect: explicit `init`
 * creates revision 1, and only then.
 */

import { StateRevisionConflictError } from "@ordarium/core";

import { decodeFabricMarker, encodeFabricMarker } from "./codec.js";
import {
  FabricMismatchError,
  FabricMissingError,
  UnknownPeerError,
} from "./errors.js";
import {
  FABRIC_ID_MAX_CHARS,
  FABRIC_KEY,
  NS_META,
  PAL_FED_PROTOCOL,
  PAL_FED_SCHEMA_VERSION,
} from "./limits.js";
import { FIXED_PEERS, isFixedPeerSet, type PeerRef } from "./peers.js";
import { federationIdentity, type FederationStore } from "./store.js";
import type { FederationFabricMarker } from "./types.js";

export interface InitFabricOptions {
  readonly fabricId: string;
  readonly createdAt?: string | undefined;
}

export interface InitFabricResult {
  /** False when the DB already held a matching marker (no second revision). */
  readonly created: boolean;
  readonly marker: FederationFabricMarker;
}

function assertFabricId(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > FABRIC_ID_MAX_CHARS) {
    throw new FabricMismatchError(
      `fabricId must be a non-empty string of at most ${FABRIC_ID_MAX_CHARS} characters`,
    );
  }
  return value;
}

/** Read + strictly decode the marker; undefined means the DB is not a fabric. */
export async function readFabricMarker(
  store: FederationStore,
): Promise<FederationFabricMarker | undefined> {
  const record = await store.state.get(NS_META, FABRIC_KEY);
  if (record === undefined) return undefined;
  return decodeFabricMarker(record.value, `${NS_META}/${FABRIC_KEY}`);
}

/**
 * Explicit initialization. Idempotent for the same fabricId (reports the
 * existing marker without writing a revision); fails closed if the DB already
 * holds a marker for a different fabric.
 */
export async function initFabric(
  store: FederationStore,
  options: InitFabricOptions,
): Promise<InitFabricResult> {
  const fabricId = assertFabricId(options.fabricId);
  const existing = await readFabricMarker(store);
  if (existing !== undefined) {
    if (existing.fabricId !== fabricId) {
      throw new FabricMismatchError(
        `coordination DB already holds fabric '${existing.fabricId}', not '${fabricId}'`,
      );
    }
    return { created: false, marker: existing };
  }
  const marker: FederationFabricMarker = {
    schemaVersion: PAL_FED_SCHEMA_VERSION,
    protocol: PAL_FED_PROTOCOL,
    fabricId,
    peers: [...FIXED_PEERS],
    createdAt: options.createdAt ?? new Date().toISOString(),
  };
  try {
    await store.state.write({
      namespace: NS_META,
      key: FABRIC_KEY,
      expectedRevision: 0,
      value: encodeFabricMarker(marker),
      identity: federationIdentity(fabricId, "init-fabric"),
    });
    return { created: true, marker };
  } catch (error) {
    if (error instanceof StateRevisionConflictError) {
      // A concurrent init won the CAS; converge on the durable marker.
      const converged = await readFabricMarker(store);
      if (converged === undefined) throw error;
      if (converged.fabricId !== fabricId) {
        throw new FabricMismatchError(
          `coordination DB was initialized as fabric '${converged.fabricId}' while initializing '${fabricId}'`,
        );
      }
      return { created: false, marker: converged };
    }
    throw error;
  }
}

/**
 * Startup gate. Missing marker, wrong protocol, wrong peer set, or a fabricId
 * mismatch all fail closed before any collaboration operation runs (§10/§50).
 */
export async function requireFabricMarker(
  store: FederationStore,
  fabricId: string,
): Promise<FederationFabricMarker> {
  const expected = assertFabricId(fabricId);
  const marker = await readFabricMarker(store);
  if (marker === undefined) {
    throw new FabricMissingError(
      `no fabric marker at ${NS_META}/${FABRIC_KEY}; run the explicit 'init' step before serving`,
    );
  }
  if (marker.fabricId !== expected) {
    throw new FabricMismatchError(
      `configured fabricId '${expected}' does not match coordination DB fabric '${marker.fabricId}'`,
    );
  }
  if (!isFixedPeerSet(marker.peers)) {
    throw new FabricMismatchError("fabric marker peer set is not the fixed PAL-FED-0 pair");
  }
  return marker;
}

/** Validate a configured peer against the marker (defence in depth: §12). */
export function assertPeerInFabric(marker: FederationFabricMarker, selfPeer: string): PeerRef {
  if (typeof selfPeer !== "string" || !marker.peers.includes(selfPeer as PeerRef)) {
    throw new UnknownPeerError(
      `configured selfPeer '${selfPeer}' is not in fabric '${marker.fabricId}' (${marker.peers.join(", ")})`,
    );
  }
  return selfPeer as PeerRef;
}
