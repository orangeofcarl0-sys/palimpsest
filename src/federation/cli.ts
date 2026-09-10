#!/usr/bin/env node
/**
 * palimpsest-collab — the PAL-FED-0 experimental operator/leaf CLI.
 *
 * Commands (all explicit, no hidden defaults):
 *   init        --db <path> --fabric <id>          create the fabric marker
 *   status      --db <path> [--fabric <id>]        observational dump
 *   events      --db <path> --fabric <id> [--thread <id>] [--limit <n>]
 *   contracts   --db <path> --fabric <id> [--contract <id>]
 *   peer-state  --db <path> --fabric <id> [--peer <ref>]
 *   serve       --db <path> --fabric <id> --self <peer>   run the MCP stdio server
 *
 * This surface is observational/administrative: it introduces no second
 * source of truth. `serve` is the only command that writes collaboration
 * state, and it writes through the same six-operation service the model uses.
 */

import { createCollabMcp } from "./mcp.js";
import { FederationError } from "./errors.js";
import { initFabric, readFabricMarker, requireFabricMarker } from "./fabric.js";
import { readAllEvents, readThread } from "./events.js";
import { readAllContractRecords } from "./contracts.js";
import { readPeerInboxState } from "./peer_state.js";
import { FIXED_PEERS, isPeerRef } from "./peers.js";
import { openFederationService } from "./service.js";
import { openFederationStore } from "./store.js";

function parseArgs(argv: string[]): { options: Map<string, string>; positional: string[] } {
  const options = new Map<string, string>();
  const positional: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (token.startsWith("--")) {
      const value = argv[index + 1];
      if (value !== undefined && !value.startsWith("--")) {
        options.set(token, value);
        index += 1;
      } else {
        options.set(token, "true");
      }
    } else {
      positional.push(token);
    }
  }
  return { options, positional };
}

function requiredOption(options: Map<string, string>, flag: string): string {
  const value = options.get(flag);
  if (value === undefined || value === "true" || value.length === 0) {
    throw new FederationError("FED_INPUT", `missing required option ${flag}`);
  }
  return value;
}

function print(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const command = parsed.positional[0];
  if (command === undefined) {
    throw new FederationError(
      "FED_INPUT",
      "usage: palimpsest-collab <init|status|events|contracts|peer-state|serve> --db <path> --fabric <id> [--self <peer>]",
    );
  }
  const dbPath = requiredOption(parsed.options, "--db");

  switch (command) {
    case "init": {
      const fabricId = requiredOption(parsed.options, "--fabric");
      const store = openFederationStore(dbPath);
      try {
        const result = await initFabric(store, { fabricId });
        print({
          initialized: true,
          created: result.created,
          fabricId: result.marker.fabricId,
          peers: result.marker.peers,
          createdAt: result.marker.createdAt,
        });
      } finally {
        await store.close();
      }
      return;
    }
    case "status": {
      const store = openFederationStore(dbPath);
      try {
        const marker = await readFabricMarker(store);
        if (marker === undefined) {
          print({ dbPath, initialized: false, note: "no fabric marker; run 'init'" });
          return;
        }
        const configuredFabric = parsed.options.get("--fabric");
        const events = await readAllEvents(store);
        const contracts = await readAllContractRecords(store);
        const peerStates = [];
        for (const peer of FIXED_PEERS) {
          const { state, revision } = await readPeerInboxState(store, peer);
          peerStates.push({
            peer,
            revision,
            eventCursor: state.eventCursor ?? null,
            contractCursor: state.contractCursor ?? null,
            pendingBatchId: state.pending?.batchId ?? null,
            lastAckedBatchId: state.lastAckedBatchId ?? null,
          });
        }
        print({
          dbPath,
          initialized: true,
          fabricId: marker.fabricId,
          protocol: marker.protocol,
          peers: marker.peers,
          createdAt: marker.createdAt,
          ...(configuredFabric === undefined || configuredFabric === "true"
            ? {}
            : { fabricMatchesConfiguration: configuredFabric === marker.fabricId }),
          counts: { events: events.length, contractRevisions: contracts.length },
          peerStates,
        });
      } finally {
        await store.close();
      }
      return;
    }
    case "events": {
      const fabricId = requiredOption(parsed.options, "--fabric");
      const store = openFederationStore(dbPath);
      try {
        await requireFabricMarker(store, fabricId);
        const threadId = parsed.options.get("--thread");
        const limitRaw = parsed.options.get("--limit");
        const limit = limitRaw === undefined || limitRaw === "true" ? undefined : Number(limitRaw);
        const entries =
          threadId === undefined || threadId === "true"
            ? await readAllEvents(store)
            : await readThread(store, threadId);
        const bounded = limit === undefined ? entries : entries.slice(-Math.max(0, limit));
        print(
          bounded.map((entry) => ({
            ref: entry.ref,
            eventId: entry.event.eventId,
            threadId: entry.event.threadId,
            from: entry.event.from,
            to: entry.event.to,
            kind: entry.event.kind,
            body: entry.event.body,
            contractId: entry.event.contractId ?? null,
            artifacts: entry.event.artifacts ?? [],
            createdAt: entry.event.createdAt,
          })),
        );
      } finally {
        await store.close();
      }
      return;
    }
    case "contracts": {
      const fabricId = requiredOption(parsed.options, "--fabric");
      const store = openFederationStore(dbPath);
      try {
        await requireFabricMarker(store, fabricId);
        const contractId = parsed.options.get("--contract");
        const records = await readAllContractRecords(store);
        const filtered =
          contractId === undefined || contractId === "true"
            ? records
            : records.filter((record) => record.key === contractId);
        print(
          filtered.map((record) => ({
            ref: `${record.namespace}/${record.key}@${record.revision}`,
            contractId: record.key,
            revision: record.revision,
            value: record.value,
            refs: record.refs,
          })),
        );
      } finally {
        await store.close();
      }
      return;
    }
    case "peer-state": {
      const fabricId = requiredOption(parsed.options, "--fabric");
      const peerOption = parsed.options.get("--peer");
      const store = openFederationStore(dbPath);
      try {
        await requireFabricMarker(store, fabricId);
        let peers: readonly import("./peers.js").PeerRef[];
        if (peerOption === undefined || peerOption === "true") {
          peers = FIXED_PEERS;
        } else {
          if (!isPeerRef(peerOption)) {
            throw new FederationError("FED_PEER_UNKNOWN", `unknown peer '${peerOption}'`);
          }
          peers = [peerOption];
        }
        const rows = [];
        for (const peer of peers) {
          const { state, revision } = await readPeerInboxState(store, peer);
          rows.push({ peer, revision, state });
        }
        print(rows);
      } finally {
        await store.close();
      }
      return;
    }
    case "serve": {
      const fabricId = requiredOption(parsed.options, "--fabric");
      const selfPeer = requiredOption(parsed.options, "--self");
      if (!isPeerRef(selfPeer)) {
        throw new FederationError("FED_PEER_UNKNOWN", `--self '${selfPeer}' is not a PAL-FED-0 peer`);
      }
      const service = await openFederationService({ dbPath, selfPeer, fabricId });
      const mcp = createCollabMcp(service);
      const shutdown = (): void => {
        mcp.stop();
      };
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
      await mcp.start();
      await service.close();
      return;
    }
    default:
      throw new FederationError("FED_INPUT", `unknown command: ${command}`);
  }
}

main().catch((error) => {
  if (error instanceof FederationError) {
    console.error(`palimpsest-collab: ${error.code}: ${error.message}`);
  } else {
    console.error(`palimpsest-collab: ${error instanceof Error ? error.message : String(error)}`);
  }
  process.exitCode = 1;
});
