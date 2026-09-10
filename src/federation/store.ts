/**
 * PAL-FED-0 storage binding (EXPERIMENTAL).
 *
 * The experiment owns exactly one durable object: a dedicated coordination
 * SQLite database opened through the pinned released Ordarium ledger, outside
 * both source worktrees. This module never reaches into Ordarium's private
 * SQLite schema; it consumes only the public state store / change feed.
 */

import { createStateStore, type InvocationIdentity, type JsonValue, type OrdariumStateStore, type StateRecord } from "@ordarium/core";
import { assertHostContract } from "@ordarium/host-kit";
import { SqliteLedger } from "@ordarium/ledger-sqlite";

import { FederationCursorError } from "./errors.js";
import { FEED_PAGE_LIMIT } from "./limits.js";

export interface FederationStore {
  readonly dbPath: string;
  readonly state: OrdariumStateStore;
  close(): Promise<void>;
}

/**
 * Open the coordination DB. The path is mandatory: there is no default and no
 * opportunistic creation of a fresh database when a configured path is wrong
 * (§10). Whether that DB is a valid fabric is decided separately by the fabric
 * marker check, not here.
 */
export function openFederationStore(dbPath: string, clock?: () => Date): FederationStore {
  if (typeof dbPath !== "string" || dbPath.trim().length === 0) {
    throw new TypeError("openFederationStore requires an explicit coordination database path");
  }
  // PLMP-CONF-1 discipline: pin the host-contract generation this build was
  // written against rather than silently following upstream defaults.
  assertHostContract(1);
  const ledger = new SqliteLedger(dbPath, { openRetry: { attempts: 5, delayMs: 100 } });
  const state = createStateStore(
    clock === undefined ? { ledger } : { ledger, clock },
  );
  return {
    dbPath,
    state,
    async close() {
      await ledger.close?.();
    },
  };
}

/**
 * Read every committed revision of one namespace in feed order, paging until
 * the feed is exhausted. O(N) by design (§18: a thread is a derived view).
 *
 * A stored cursor refused by Ordarium's high-water rules is surfaced as
 * FED_CURSOR_INVALID and never reset to 0 (§52/FED-C05).
 */
export async function readNamespace(
  state: OrdariumStateStore,
  namespace: string,
  fromCursor?: string,
): Promise<{ records: StateRecord[]; cursor: string | undefined }> {
  const records: StateRecord[] = [];
  let cursor = fromCursor;
  for (;;) {
    let page;
    try {
      page = await state.changes({ namespace, limit: FEED_PAGE_LIMIT }, cursor);
    } catch (error) {
      throw new FederationCursorError(
        `state change feed for namespace '${namespace}' refused cursor '${String(cursor)}'`,
        { cause: error },
      );
    }
    records.push(...page.changes);
    if (page.changes.length > 0) {
      cursor = page.cursor;
    }
    if (!page.hasMore) break;
    if (page.changes.length === 0) break; // defensive: no progress, stop paging
  }
  return { records, cursor };
}

/** Validate a decoded record's value domain without trusting it. */
export function recordValue(record: StateRecord): JsonValue {
  return record.value;
}

/**
 * The invocation identity stamped on every federation state write. It is
 * derived from trusted process configuration (the fabric scope) plus an
 * adapter-generated call id — never from model-supplied tool arguments (§12).
 */
export function federationIdentity(
  scope: string,
  callId: string,
  actor?: string,
): InvocationIdentity {
  return {
    source: "palimpsest.collab",
    scope,
    callId,
    ...(actor === undefined ? {} : { actor }),
  };
}
