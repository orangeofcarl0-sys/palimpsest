/**
 * G10-E1 CoordinationStore — the ONE canonical Palimpsest-owned append-only
 * coordination/federation history store (E0 §19/§20 decision: dedicated
 * SQLite at `$DSH_HOME/palimpsest/coordination.sqlite`; never the Work
 * EventStore, never Ordarium state — effect authority ≠ coordination
 * semantic ownership).
 *
 * Requirements (§31):
 *   - append-only semantic history; monotonic per-store `seq`; stable eventId
 *     (caller-supplied; the service derives it deterministically from
 *     content, so replays are natural);
 *   - strict typed payload parser per event type — never a generic
 *     `Record<string, unknown>` bag (§33);
 *   - duplicate eventId byte-identical → idempotent no-op; different content
 *     → fail closed (no last-write-wins identity drift);
 *   - restart-safe; cross-process concurrency safe (PRIMARY KEY + race
 *     re-read, mirroring the continuity store); malformed stored record →
 *     fail closed on read; no implicit delete (no delete API at all).
 *
 * Concern ≠ store (§32): this ONE physical store holds Participation,
 * Collaboration, and Commitment history as DISTINCT typed event streams — a
 * shared store never merges the concern domains.
 */

import { DatabaseSync } from "node:sqlite";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";

import { canonicalJsonBytes } from "../schema/canonical.js";
import type { Invocation, Participation, ParticipationEndReason } from "./participation.js";
import { ParticipationError } from "./participation.js";

const decoder = new TextDecoder();

/** Canonical key-sorted serialization — the byte-identical comparison basis. */
function canonicalJson(value: unknown): string {
  return decoder.decode(canonicalJsonBytes(value));
}

export const COORDINATION_STORE_DOMAIN = "palimpsest.coordination-event.v1";

/**
 * The known coordination event types. ONE physical store, DISTINCT concern
 * streams (§32): participation (E1) and collaboration (E3) event types share
 * the store while remaining separate semantics with separate typed payload
 * parsers. Per-type payload shapes are narrowed by each concern's service;
 * the store validates through the registered parsers.
 */
export type CoordinationEventType =
  | "INVOCATION_RECORDED"
  | "PARTICIPATION_STARTED"
  | "PARTICIPATION_ENDED"
  | "CONTACT_REQUESTED"
  | "MESSAGE_PREPARED"
  | "MESSAGE_DELIVERED"
  | "MESSAGE_RECEIVED"
  | "WAKE_SENT"
  | "ACK_RECORDED";

export interface InvocationRecordedPayload {
  readonly invocation: Invocation;
}

export interface ParticipationStartedPayload {
  readonly participation: Participation;
}

export interface ParticipationEndedPayload {
  readonly participationId: string;
  readonly endReason: ParticipationEndReason;
}

export type CoordinationEventPayload =
  | InvocationRecordedPayload
  | ParticipationStartedPayload
  | ParticipationEndedPayload;

/** A durable coordination history record. `seq` is assigned by the store on append. */
export interface CoordinationEvent<T extends CoordinationEventType = CoordinationEventType> {
  readonly eventId: string;
  readonly seq: number;
  readonly projectId: string;
  readonly type: T;
  /**
   * The persisted payload, validated by the registered per-type parser at the
   * store boundary and narrowed to the concern's payload type by its service.
   * Deliberately `unknown` at the shared-store level: the store's type union
   * spans concern domains and never imports their vocabularies (§32).
   */
  readonly payload: unknown;
}

export class CoordinationStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoordinationStoreError";
  }
}

/** Strict per-type payload parser (§33): parse + validate, never a generic bag. */
export type CoordinationEventPayloadParser = (payload: unknown) => unknown;
export type CoordinationEventParsers = Readonly<Record<string, CoordinationEventPayloadParser>>;

export interface CoordinationStore {
  /**
   * Append one event. Byte-identical duplicate eventId → idempotent no-op
   * (returns the stored events); same eventId with different content → fail
   * closed. `seq` is assigned by the store.
   */
  append(event: CoordinationAppendRequest): Promise<readonly CoordinationEvent[]>;
  /** Replay all events in seq order (restart-safe; malformed rows fail closed). */
  replay(): Promise<readonly CoordinationEvent[]>;
}

function parseStoredEvent(
  row: { event_id: string; seq: number; project_id: string; type: string; payload_json: string },
  parsers: CoordinationEventParsers,
): CoordinationEvent {
  let payload: unknown;
  try {
    payload = JSON.parse(row.payload_json);
  } catch (error) {
    throw new CoordinationStoreError(
      `coordination event "${row.event_id}" has a malformed payload: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const parser = parsers[row.type];
  if (parser === undefined) {
    throw new CoordinationStoreError(`coordination event "${row.event_id}" has unknown type "${row.type}"`);
  }
  const typed = parser(payload);
  return {
    eventId: row.event_id,
    seq: row.seq,
    projectId: row.project_id,
    type: row.type as CoordinationEventType,
    payload: typed as never,
  };
}

/** The built-in participation-event parsers (E1). */
export const PARTICIPATION_EVENT_PARSERS: CoordinationEventParsers = Object.freeze({
  INVOCATION_RECORDED: (payload: unknown) => {
    const typed = payload as InvocationRecordedPayload;
    if (typed?.invocation?.invocationId === undefined || typed.invocation.attempt === undefined) {
      throw new CoordinationStoreError("malformed INVOCATION_RECORDED payload");
    }
    return typed;
  },
  PARTICIPATION_STARTED: (payload: unknown) => {
    const typed = payload as ParticipationStartedPayload;
    if (typed?.participation?.participationId === undefined || typed.participation.attempt === undefined) {
      throw new CoordinationStoreError("malformed PARTICIPATION_STARTED payload");
    }
    return typed;
  },
  PARTICIPATION_ENDED: (payload: unknown) => {
    const typed = payload as ParticipationEndedPayload;
    if (typed?.participationId === undefined || typed?.endReason === undefined) {
      throw new CoordinationStoreError("malformed PARTICIPATION_ENDED payload");
    }
    return typed;
  },
});

export type CoordinationAppendRequest = Omit<CoordinationEvent, "seq">;

export class SqliteCoordinationStore implements CoordinationStore {
  readonly #database: DatabaseSync;
  readonly #selectAll: ReturnType<DatabaseSync["prepare"]>;
  readonly #insert: ReturnType<DatabaseSync["prepare"]>;
  readonly #parsers: CoordinationEventParsers;

  constructor(databasePath: string, options?: { readonly eventParsers?: CoordinationEventParsers }) {
    if (databasePath !== ":memory:") {
      mkdirSync(dirname(databasePath), { recursive: true });
    }
    this.#database = new DatabaseSync(databasePath === ":memory:" ? ":memory:" : join(databasePath));
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS coordination_events (" +
        "event_id TEXT PRIMARY KEY, " +
        "seq INTEGER NOT NULL UNIQUE, " +
        "project_id TEXT NOT NULL, " +
        "type TEXT NOT NULL, " +
        "payload_json TEXT NOT NULL)",
    );
    this.#selectAll = this.#database.prepare(
      "SELECT event_id, seq, project_id, type, payload_json FROM coordination_events ORDER BY seq",
    );
    this.#insert = this.#database.prepare(
      "INSERT INTO coordination_events (event_id, seq, project_id, type, payload_json) VALUES (?, ?, ?, ?, ?)",
    );
    // §33: strict per-type parsers — participation events built in, federation
    // events registered at construction (extensible without a generic bag).
    this.#parsers = { ...PARTICIPATION_EVENT_PARSERS, ...(options?.eventParsers ?? {}) };
  }

  async append(event: CoordinationAppendRequest): Promise<readonly CoordinationEvent[]> {
    if (typeof event.eventId !== "string" || event.eventId.length === 0) {
      throw new CoordinationStoreError("eventId must be a non-empty string");
    }
    if (typeof event.projectId !== "string" || event.projectId.length === 0) {
      throw new CoordinationStoreError("projectId must be a non-empty string");
    }
    const payloadJson = canonicalJson(event.payload);
    try {
      const nextSeq = (this.#database.prepare("SELECT MAX(seq) AS max FROM coordination_events").get() as { max: number | null }).max ?? 0;
      this.#insert.run(event.eventId, nextSeq + 1, event.projectId, event.type, payloadJson);
    } catch (error) {
      // Cross-process race or genuine duplicate: re-read and compare.
      const existing = this.#database
        .prepare("SELECT event_id, seq, project_id, type, payload_json FROM coordination_events WHERE event_id = ?")
        .get(event.eventId) as { event_id: string; seq: number; project_id: string; type: string; payload_json: string } | undefined;
      if (existing === undefined) {
        throw new CoordinationStoreError(
          `failed to append coordination event: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (existing.payload_json !== payloadJson || existing.type !== event.type || existing.project_id !== event.projectId) {
        // §31/§79: same eventId with different content fails closed — no
        // last-write-wins history rewrite.
        throw new ParticipationError(
          "coordination_conflict",
          `coordination event "${event.eventId}" already exists with different content`,
        );
      }
      return this.#stored(existing);
    }
    const stored = this.#database
      .prepare("SELECT event_id, seq, project_id, type, payload_json FROM coordination_events WHERE event_id = ?")
      .get(event.eventId) as { event_id: string; seq: number; project_id: string; type: string; payload_json: string };
    return this.#stored(stored);
  }

  #stored(row: { event_id: string; seq: number; project_id: string; type: string; payload_json: string }): readonly CoordinationEvent[] {
    return Object.freeze([parseStoredEvent(row, this.#parsers)]);
  }

  async replay(): Promise<readonly CoordinationEvent[]> {
    return Object.freeze(
      (this.#selectAll.all() as Array<{
        event_id: string;
        seq: number;
        project_id: string;
        type: string;
        payload_json: string;
      }>).map((row) => parseStoredEvent(row, this.#parsers)),
    );
  }

  close(): void {
    this.#database.close();
  }
}

/** The canonical default coordination store path (Palimpsest-owned). */
export function defaultCoordinationPath(): string {
  const configured = process.env.DSH_HOME?.trim();
  const dshHome =
    configured === undefined || configured.length === 0 ? join(homedir(), ".dsh") : configured;
  return join(dshHome, "palimpsest", "coordination.sqlite");
}
