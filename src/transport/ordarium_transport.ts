/**
 * G10-P Ordarium-backed durable peer transport (mechanical substrate only).
 *
 *   TransportTruth ≠ CollaborationTruth
 *   StateChangeFeed Event ≠ PeerMessage
 *
 * Outbound: one durable state subject per operation (`namespace = mailbox of the
 * recipient`, `key = operationId`, revision 0, CAS fenced) in a shared transport
 * ledger. Inbound: the `StateChangeFeed` reports "something changed"; this adapter
 * RE-READS the exact record and strictly parses the envelope — the feed row is never
 * treated as semantic truth. At-least-once observation, semantic idempotency by
 * `operationId`; exactly-once is never claimed.
 *
 * The transport writes NOTHING semantic: no coordination event, no commitment, no
 * boundary state. It is a dumb durable mailbox.
 */

import {
  InvalidCursorError,
  StateRevisionConflictError,
  createStateStore,
  type JsonValue,
  type OrdariumStateStore,
  type StateChangePage,
} from "@ordarium/core";
import { SqliteLedger } from "@ordarium/ledger-sqlite";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";

import type { PeerRef } from "../federation/peer.js";
import type { DurablePeerOperation, DurablePeerEnvelope } from "./envelope.js";
import { durableOperationDigestOf, mailboxNamespace, materializeDurablePeerEnvelope, parseDurablePeerEnvelope } from "./envelope.js";

export class DurableTransportError extends Error {
  constructor(
    readonly kind:
      | "transport_write_failed"
      | "transport_operation_conflict"
      | "transport_read_failed"
      | "transport_epoch_mismatch"
      | "transport_record_missing",
    message: string,
  ) {
    super(message);
    this.name = "DurableTransportError";
  }
}

export interface DurableOperationSubmitRequest {
  readonly operationId: string;
  readonly from: PeerRef;
  readonly to: PeerRef;
  readonly operation: DurablePeerOperation;
}

export interface DurableTransportObservation {
  readonly envelopes: readonly DurablePeerEnvelope[];
  /** Opaque durable position of the last delivered change (always present). */
  readonly cursor: string;
  readonly hasMore: boolean;
}

/**
 * The durable operation transport. `submit` is outbound (at-least-once), `observe`
 * is inbound mechanical observation. It carries NO authority: it cannot accept a
 * commitment, admit a boundary revision, or assign work.
 */
export interface DurableOperationTransportPort {
  readonly adapterId: string;
  readonly namespace: string;
  submit(request: DurableOperationSubmitRequest): Promise<{ readonly delivered: boolean }>;
  observe(input: {
    readonly mailbox: string;
    readonly cursor?: string | undefined;
    readonly limit?: number | undefined;
  }): Promise<DurableTransportObservation>;
}

/** A durable transport that owns its ledger and can release it on shutdown. */
export interface DurableOperationTransport extends DurableOperationTransportPort {
  close(): void;
}

export interface OrdariumDurableTransportOptions {
  readonly state: OrdariumStateStore;
  /** Shared transport namespace; mailboxes are derived per peer. */
  readonly namespace: string;
  readonly adapterId?: string | undefined;
  readonly clock?: (() => string) | undefined;
}

function isRevisionConflict(error: unknown): boolean {
  return (
    error instanceof StateRevisionConflictError ||
    (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "STATE_REVISION_CONFLICT")
  );
}

function isInvalidCursor(error: unknown): boolean {
  return (
    error instanceof InvalidCursorError ||
    (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "INVALID_CURSOR")
  );
}

export function makeOrdariumDurableTransport(
  options: OrdariumDurableTransportOptions,
): DurableOperationTransportPort {
  const clock = options.clock ?? (() => new Date().toISOString());
  const adapterId = options.adapterId ?? "ordarium-durable";

  async function submit(request: DurableOperationSubmitRequest): Promise<{ readonly delivered: boolean }> {
    const envelope = materializeDurablePeerEnvelope({
      operationId: request.operationId,
      from: request.from,
      to: request.to,
      sentAt: clock(),
      operation: request.operation,
    });
    const mailbox = mailboxNamespace(options.namespace, request.to.peerId);
    try {
      await options.state.write({
        namespace: mailbox,
        key: envelope.operationId,
        expectedRevision: 0,
        value: envelope as unknown as JsonValue,
        identity: {
          source: "palimpsest.transport",
          scope: options.namespace,
          callId: envelope.operationId,
          actor: request.from.peerId,
        },
      });
      return { delivered: true };
    } catch (error) {
      if (!isRevisionConflict(error)) {
        throw new DurableTransportError(
          "transport_write_failed",
          `durable transport write failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      // Idempotent retry: the same operationId with the same envelope is a success;
      // the same operationId with DIFFERENT content fails closed (no LWW drift).
      const existing = await options.state.get(mailbox, envelope.operationId);
      if (existing === undefined) {
        throw new DurableTransportError(
          "transport_write_failed",
          `operation "${envelope.operationId}" conflicted but no durable record is readable`,
        );
      }
      let parsed: DurablePeerEnvelope;
      try {
        parsed = parseDurablePeerEnvelope(existing.value);
      } catch (parseError) {
        throw new DurableTransportError(
          "transport_operation_conflict",
          `operation "${envelope.operationId}" already exists with a malformed envelope: ${
            parseError instanceof Error ? parseError.message : String(parseError)
          }`,
        );
      }
      if (durableOperationDigestOf(parsed) !== durableOperationDigestOf(envelope)) {
        throw new DurableTransportError(
          "transport_operation_conflict",
          `operation "${envelope.operationId}" already exists with different content`,
        );
      }
      return { delivered: true };
    }
  }

  async function observe(input: {
    readonly mailbox: string;
    readonly cursor?: string | undefined;
    readonly limit?: number | undefined;
  }): Promise<DurableTransportObservation> {
    let page: StateChangePage;
    try {
      page = await options.state.changes(
        input.limit === undefined ? { namespace: input.mailbox } : { namespace: input.mailbox, limit: input.limit },
        input.cursor,
      );
    } catch (error) {
      if (isInvalidCursor(error)) {
        // The cursor is a filter-independent global position. A cursor past the
        // ledger high-water means the consumer was pointed at a DIFFERENT ledger
        // file (no ledger epoch binding exists in Ordarium v1.3.1): fail closed and
        // require an explicit operator reset — never silently restart at zero.
        throw new DurableTransportError(
          "transport_epoch_mismatch",
          "durable transport cursor is ahead of the ledger high-water — the transport ledger changed or was replaced; explicit operator reset required",
        );
      }
      throw new DurableTransportError(
        "transport_read_failed",
        `durable transport read failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const envelopes: DurablePeerEnvelope[] = [];
    for (const record of page.changes) {
      // The feed is a notification. Re-read the exact record and strictly parse the
      // envelope; never trust the change row as a semantic message.
      const exact = await options.state.get(record.namespace, record.key);
      if (exact === undefined) {
        throw new DurableTransportError(
          "transport_record_missing",
          `change feed reported ${record.namespace}/${record.key} but the record is not readable (ledger corruption)`,
        );
      }
      envelopes.push(parseDurablePeerEnvelope(exact.value));
    }
    return Object.freeze({
      envelopes: Object.freeze(envelopes),
      cursor: page.cursor,
      hasMore: page.hasMore,
    });
  }

  return { adapterId, namespace: options.namespace, submit, observe };
}

/** Build a fresh durable transport over a dedicated SQLite transport ledger. */
export function ordariumDurableTransportAt(input: {
  readonly databasePath: string;
  readonly namespace: string;
  readonly clock?: (() => string) | undefined;
}): DurableOperationTransport {
  mkdirSync(dirname(input.databasePath), { recursive: true });
  const ledger = new SqliteLedger(join(input.databasePath));
  const state = createStateStore({ ledger });
  const port = makeOrdariumDurableTransport({
    state,
    namespace: input.namespace,
    ...(input.clock === undefined ? {} : { clock: input.clock }),
  });
  return { ...port, close: () => ledger.close() };
}

export function defaultTransportLedgerPath(): string {
  const configured = process.env.DSH_HOME?.trim();
  const dshHome = configured === undefined || configured.length === 0 ? join(homedir(), ".dsh") : configured;
  return join(dshHome, "palimpsest", "transport.sqlite");
}
