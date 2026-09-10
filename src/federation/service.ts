/**
 * PAL-FED-0 service assembly (EXPERIMENTAL).
 *
 * One service instance = one adapter process configured for exactly one peer.
 * Identity, fabric id and coordination DB come from trusted process
 * configuration; model-supplied tool arguments never influence them (§12).
 *
 * The six model-facing operations are the whole surface; raw Ordarium state
 * writes, change-feed scans and cursor mutation are not exposed (§31).
 */

import type { StateRecord } from "@ordarium/core";

import {
  acceptContract,
  getContract,
  proposeContract,
  readAllContractRecords,
  type ContractMutation,
  type ContractReadResult,
} from "./contracts.js";
import { ack, inbox, readPeerInboxState, type AckResult, type InboxResult } from "./peer_state.js";
import { postEvent, readAllEvents, readThread, type PostedEvent, type StoredEvent } from "./events.js";
import { assertPeerInFabric, requireFabricMarker } from "./fabric.js";
import {
  parseBatchInput,
  parseContractGetInput,
  parseContractUpdateInput,
  parseEmptyInput,
  parsePostEventInput,
  parseThreadInput,
} from "./inputs.js";
import { assertPeerRef, type PeerRef } from "./peers.js";
import { openFederationStore, type FederationStore } from "./store.js";
import type { FederationFabricMarker, PeerInboxState } from "./types.js";

export interface FederationServiceConfig {
  /** Explicit coordination DB path; there is no default (§10). */
  readonly dbPath: string;
  readonly selfPeer: PeerRef;
  readonly fabricId: string;
  readonly clock?: (() => Date) | undefined;
}

export interface FederationService {
  readonly dbPath: string;
  readonly selfPeer: PeerRef;
  readonly fabricId: string;
  readonly marker: FederationFabricMarker;
  /** The six model-facing operations. */
  post(raw: unknown): Promise<PostedEvent>;
  inbox(): Promise<InboxResult>;
  ack(raw: unknown): Promise<AckResult>;
  thread(raw: unknown): Promise<{ readonly threadId: string; readonly events: readonly StoredEvent[] }>;
  contractGet(raw: unknown): Promise<ContractReadResult>;
  contractUpdate(raw: unknown): Promise<ContractMutation>;
  /** Read-only operator views (§46); no new source of truth. */
  listEvents(): Promise<readonly StoredEvent[]>;
  listContracts(): Promise<readonly StateRecord[]>;
  peerState(peer: PeerRef): Promise<{ readonly state: PeerInboxState; readonly revision: number }>;
  close(): Promise<void>;
}

export async function openFederationService(
  config: FederationServiceConfig,
): Promise<FederationService> {
  const selfPeer = assertPeerRef(config.selfPeer, "configuration selfPeer");
  const clock = config.clock ?? (() => new Date());
  const store: FederationStore = openFederationStore(config.dbPath, clock);
  let marker: FederationFabricMarker;
  try {
    marker = await requireFabricMarker(store, config.fabricId);
  } catch (error) {
    await store.close();
    throw error;
  }
  assertPeerInFabric(marker, selfPeer);
  const context = { fabricId: config.fabricId, selfPeer, clock };

  return {
    dbPath: config.dbPath,
    selfPeer,
    fabricId: config.fabricId,
    marker,

    async post(raw) {
      return postEvent(store, context, parsePostEventInput(raw, selfPeer));
    },
    async inbox() {
      parseEmptyInput({}, "collab_inbox");
      return inbox(store, context);
    },
    async ack(raw) {
      const { batchId } = parseBatchInput(raw, "collab_ack");
      return ack(store, context, batchId);
    },
    async thread(raw) {
      const { threadId } = parseThreadInput(raw);
      return { threadId, events: await readThread(store, threadId) };
    },
    async contractGet(raw) {
      const { contractId, history } = parseContractGetInput(raw);
      return getContract(store, contractId, { history });
    },
    async contractUpdate(raw) {
      const input = parseContractUpdateInput(raw);
      return input.action === "propose"
        ? proposeContract(store, context, input)
        : acceptContract(store, context, input);
    },

    async listEvents() {
      return readAllEvents(store);
    },
    async listContracts() {
      return readAllContractRecords(store);
    },
    async peerState(peer) {
      return readPeerInboxState(store, peer);
    },
    async close() {
      await store.close();
    },
  };
}
