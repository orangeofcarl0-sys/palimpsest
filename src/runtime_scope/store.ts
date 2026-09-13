/**
 * G10-H RuntimeScopeStore — the ONE canonical Palimpsest-owned runtime-scope
 * temporal store. Owns RuntimeScope history only: membership, nesting,
 * organization basis, external peer association, boundary declarations,
 * lifecycle. It owns no Work, no Participation, no Continuity identity, no
 * Organization revision, and no effect authority (no truth overlap).
 *
 * Per-scope append-only ordering with a chain digest, plus an atomic conditional
 * batch (`appendAtomic(expectedBasis, events)`) whose conflict is PER-SCOPE.
 */

import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { canonicalDigest } from "../schema/canonical.js";
import type { RuntimeScopeBasis, RuntimeScopeDefinition, RuntimeScopeEventParsers, RuntimeScopeEventType } from "./artifacts.js";
import {
  RUNTIME_SCOPE_EVENT_PARSERS,
  parseRuntimeScopeBasis,
  parseRuntimeScopeDefinition,
  runtimeScopeChainDigest,
} from "./artifacts.js";

export class RuntimeScopeStoreError extends Error {
  constructor(
    readonly kind: RuntimeScopeStoreErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "RuntimeScopeStoreError";
  }
}

export type RuntimeScopeStoreErrorKind =
  | "invalid_registration"
  | "already_exists"
  | "unknown_scope"
  | "basis_mismatch"
  | "event_conflict"
  | "recovery_required"
  | "database_busy"
  | "malformed_record"
  | "organization_unknown"
  | "organization_stale"
  | "member_conflict"
  | "member_unknown"
  | "multiple_parents"
  | "cycle_detected"
  | "scope_closed"
  | "peer_conflict"
  | "boundary_conflict";

function payloadKey(type: string, payload: unknown): string {
  return canonicalDigest({ domain: "palimpsest.runtime-scope-event.v1", type, payload });
}

export interface RuntimeScopeEvent<T extends RuntimeScopeEventType = RuntimeScopeEventType> {
  readonly scopeId: string;
  readonly seq: number;
  readonly eventId: string;
  readonly type: T;
  readonly payload: unknown;
  readonly chainDigest: string;
}

export interface RuntimeScopeAppendRequest {
  readonly eventId: string;
  readonly type: RuntimeScopeEventType;
  readonly payload: unknown;
}

export interface RuntimeScopeStore {
  open(input: { readonly definition: RuntimeScopeDefinition }): Promise<RuntimeScopeEvent>;
  appendAtomic(input: {
    readonly scopeId: string;
    readonly expectedBasis: RuntimeScopeBasis;
    readonly events: readonly RuntimeScopeAppendRequest[];
  }): Promise<readonly RuntimeScopeEvent[]>;
  definition(scopeId: string): Promise<RuntimeScopeDefinition | undefined>;
  basis(scopeId: string): Promise<RuntimeScopeBasis | undefined>;
  replay(scopeId: string): Promise<readonly RuntimeScopeEvent[]>;
  scopes(): Promise<readonly RuntimeScopeDefinition[]>;
  close(): void;
}

type Statement = ReturnType<DatabaseSync["prepare"]>;

interface StoredRow {
  scope_id: string;
  seq: number;
  event_id: string;
  type: string;
  payload_json: string;
  chain_digest: string;
}

export class SqliteRuntimeScopeStore implements RuntimeScopeStore {
  readonly #database: DatabaseSync;
  readonly #selectDefinition: Statement;
  readonly #selectDefinitions: Statement;
  readonly #insertDefinition: Statement;
  readonly #selectEvents: Statement;
  readonly #insertEvent: Statement;
  readonly #parsers: RuntimeScopeEventParsers;

  constructor(databasePath: string, options?: { readonly busyTimeoutMs?: number; readonly eventParsers?: RuntimeScopeEventParsers }) {
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.#database = new DatabaseSync(databasePath === ":memory:" ? ":memory:" : join(databasePath));
    this.#database.exec(`PRAGMA busy_timeout = ${options?.busyTimeoutMs ?? 5000}`);
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS runtime_scope_definitions (" +
        "scope_id TEXT PRIMARY KEY, organization_basis_json TEXT, artifact_json TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS runtime_scope_events (" +
        "scope_id TEXT NOT NULL, seq INTEGER NOT NULL, event_id TEXT NOT NULL UNIQUE, " +
        "type TEXT NOT NULL, payload_json TEXT NOT NULL, chain_digest TEXT NOT NULL, " +
        "PRIMARY KEY (scope_id, seq))",
    );
    this.#selectDefinition = this.#database.prepare("SELECT artifact_json FROM runtime_scope_definitions WHERE scope_id = ?");
    this.#selectDefinitions = this.#database.prepare("SELECT artifact_json FROM runtime_scope_definitions ORDER BY scope_id");
    this.#insertDefinition = this.#database.prepare(
      "INSERT INTO runtime_scope_definitions (scope_id, organization_basis_json, artifact_json) VALUES (?, ?, ?)",
    );
    this.#selectEvents = this.#database.prepare(
      "SELECT scope_id, seq, event_id, type, payload_json, chain_digest FROM runtime_scope_events WHERE scope_id = ? ORDER BY seq",
    );
    this.#insertEvent = this.#database.prepare(
      "INSERT INTO runtime_scope_events (scope_id, seq, event_id, type, payload_json, chain_digest) VALUES (?, ?, ?, ?, ?, ?)",
    );
    this.#parsers = { ...RUNTIME_SCOPE_EVENT_PARSERS, ...(options?.eventParsers ?? {}) };
  }

  #parse(row: StoredRow, previous: RuntimeScopeEvent | undefined): RuntimeScopeEvent {
    const parser = this.#parsers[row.type];
    if (parser === undefined) {
      throw new RuntimeScopeStoreError("malformed_record", `runtime-scope event "${row.event_id}" has unknown type "${row.type}"`);
    }
    let payload: unknown;
    try {
      payload = parser(JSON.parse(row.payload_json));
    } catch (error) {
      throw new RuntimeScopeStoreError(
        "malformed_record",
        `runtime-scope event "${row.event_id}" payload is malformed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const expected = runtimeScopeChainDigest({
      scopeId: row.scope_id,
      seq: row.seq,
      eventId: row.event_id,
      type: row.type,
      payload,
      previousChainDigest: previous?.chainDigest ?? null,
    });
    if (expected !== row.chain_digest) {
      throw new RuntimeScopeStoreError("malformed_record", `runtime-scope chain is corrupt at "${row.scope_id}" seq ${row.seq}`);
    }
    return Object.freeze({
      scopeId: row.scope_id,
      seq: row.seq,
      eventId: row.event_id,
      type: row.type as RuntimeScopeEventType,
      payload,
      chainDigest: row.chain_digest,
    });
  }

  #readAll(scopeId: string): RuntimeScopeEvent[] {
    const rows = this.#selectEvents.all(scopeId) as unknown as StoredRow[];
    const events: RuntimeScopeEvent[] = [];
    let previous: RuntimeScopeEvent | undefined;
    let expectedSeq = 1;
    for (const row of rows) {
      if (row.seq !== expectedSeq) {
        throw new RuntimeScopeStoreError("malformed_record", `scope "${scopeId}" event sequence has a gap at ${row.seq}`);
      }
      const event = this.#parse(row, previous);
      events.push(event);
      previous = event;
      expectedSeq += 1;
    }
    return events;
  }

  #transactional<T>(work: () => T): T {
    try {
      this.#database.exec("BEGIN IMMEDIATE");
      const result = work();
      this.#database.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        this.#database.exec("ROLLBACK");
      } catch {
        // no active transaction
      }
      if (error instanceof RuntimeScopeStoreError) throw error;
      throw new RuntimeScopeStoreError("invalid_registration", `runtime-scope store write failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async open(input: { readonly definition: RuntimeScopeDefinition }): Promise<RuntimeScopeEvent> {
    const definition = parseRuntimeScopeDefinition(JSON.parse(JSON.stringify(input.definition)));
    const opened = this.#parsers.RUNTIME_SCOPE_OPENED!({ definition }) as { definition: RuntimeScopeDefinition };
    const eventId = `evt-${runtimeScopeChainDigest({
      scopeId: definition.scopeId,
      seq: 1,
      eventId: "open",
      type: "RUNTIME_SCOPE_OPENED",
      payload: opened,
      previousChainDigest: null,
    }).slice(0, 24)}`;
    return this.#transactional(() => {
      const existing = this.#selectDefinition.get(definition.scopeId);
      if (existing !== undefined) throw new RuntimeScopeStoreError("already_exists", `runtime scope "${definition.scopeId}" already exists`);
      this.#insertDefinition.run(definition.scopeId, definition.organizationBasis === null ? null : JSON.stringify(definition.organizationBasis), JSON.stringify(definition));
      const chainDigest = runtimeScopeChainDigest({
        scopeId: definition.scopeId,
        seq: 1,
        eventId,
        type: "RUNTIME_SCOPE_OPENED",
        payload: opened,
        previousChainDigest: null,
      });
      this.#insertEvent.run(definition.scopeId, 1, eventId, "RUNTIME_SCOPE_OPENED", JSON.stringify(opened), chainDigest);
      return Object.freeze({
        scopeId: definition.scopeId,
        seq: 1,
        eventId,
        type: "RUNTIME_SCOPE_OPENED" as const,
        payload: opened,
        chainDigest,
      });
    });
  }

  async appendAtomic(input: {
    readonly scopeId: string;
    readonly expectedBasis: RuntimeScopeBasis;
    readonly events: readonly RuntimeScopeAppendRequest[];
  }): Promise<readonly RuntimeScopeEvent[]> {
    const expected = parseRuntimeScopeBasis(input.expectedBasis);
    if (expected.scopeId !== input.scopeId) throw new RuntimeScopeStoreError("invalid_registration", "expected basis scope id mismatch");
    if (input.events.length === 0) throw new RuntimeScopeStoreError("invalid_registration", "appendAtomic requires at least one event");
    const prepared = input.events.map((event) => {
      if (typeof event.eventId !== "string" || event.eventId.length === 0) {
        throw new RuntimeScopeStoreError("invalid_registration", "eventId must be a non-empty string");
      }
      const parser = this.#parsers[event.type];
      if (parser === undefined) throw new RuntimeScopeStoreError("invalid_registration", `unknown runtime-scope event type "${event.type}"`);
      return { eventId: event.eventId, type: event.type, payload: parser(event.payload) };
    });
    const seen = new Set<string>();
    for (const entry of prepared) {
      if (seen.has(entry.eventId)) throw new RuntimeScopeStoreError("event_conflict", `duplicate eventId "${entry.eventId}"`);
      seen.add(entry.eventId);
    }
    return this.#transactional(() => {
      const definition = this.#selectDefinition.get(expected.scopeId);
      if (definition === undefined) throw new RuntimeScopeStoreError("unknown_scope", `runtime scope "${expected.scopeId}" does not exist`);
      const stored = this.#readAll(expected.scopeId);
      const byId = new Map(stored.map((event) => [event.eventId, event]));
      let present = 0;
      let conflicting = false;
      for (const entry of prepared) {
        const row = byId.get(entry.eventId);
        if (row === undefined) continue;
        present += 1;
        if (row.type !== entry.type || payloadKey(row.type, row.payload) !== payloadKey(entry.type, entry.payload)) conflicting = true;
      }
      if (conflicting) throw new RuntimeScopeStoreError("event_conflict", "a requested eventId already exists with different content");
      if (present === prepared.length) return Object.freeze(prepared.map((entry) => byId.get(entry.eventId)!));
      if (present > 0) throw new RuntimeScopeStoreError("recovery_required", "runtime-scope atomic batch is partially present — explicit recovery required");
      const tail = stored.length === 0 ? undefined : stored[stored.length - 1];
      const currentBasis: RuntimeScopeBasis = Object.freeze({
        scopeId: expected.scopeId,
        throughSeq: tail?.seq ?? 0,
        chainDigest: tail?.chainDigest ?? "",
      });
      if (currentBasis.throughSeq !== expected.throughSeq || currentBasis.chainDigest !== expected.chainDigest) {
        throw new RuntimeScopeStoreError("basis_mismatch", `scope "${expected.scopeId}" basis is seq ${currentBasis.throughSeq}, expected ${expected.throughSeq}`);
      }
      const appended: RuntimeScopeEvent[] = [];
      let seq = currentBasis.throughSeq;
      let previous = tail?.chainDigest ?? null;
      for (const entry of prepared) {
        seq += 1;
        const chainDigest = runtimeScopeChainDigest({
          scopeId: expected.scopeId,
          seq,
          eventId: entry.eventId,
          type: entry.type,
          payload: entry.payload,
          previousChainDigest: previous,
        });
        this.#insertEvent.run(expected.scopeId, seq, entry.eventId, entry.type, JSON.stringify(entry.payload), chainDigest);
        previous = chainDigest;
        appended.push(Object.freeze({ scopeId: expected.scopeId, seq, eventId: entry.eventId, type: entry.type, payload: entry.payload, chainDigest }));
      }
      return Object.freeze(appended);
    });
  }

  async definition(scopeId: string): Promise<RuntimeScopeDefinition | undefined> {
    const row = this.#selectDefinition.get(scopeId) as { artifact_json: string } | undefined;
    if (row === undefined) return undefined;
    try {
      return parseRuntimeScopeDefinition(JSON.parse(row.artifact_json));
    } catch {
      throw new RuntimeScopeStoreError("malformed_record", `runtime scope definition "${scopeId}" is malformed`);
    }
  }

  async basis(scopeId: string): Promise<RuntimeScopeBasis | undefined> {
    if ((await this.definition(scopeId)) === undefined) return undefined;
    const events = this.#readAll(scopeId);
    const tail = events.length === 0 ? undefined : events[events.length - 1];
    return Object.freeze({ scopeId, throughSeq: tail?.seq ?? 0, chainDigest: tail?.chainDigest ?? "" });
  }

  async replay(scopeId: string): Promise<readonly RuntimeScopeEvent[]> {
    return Object.freeze(this.#readAll(scopeId));
  }

  async scopes(): Promise<readonly RuntimeScopeDefinition[]> {
    const rows = this.#selectDefinitions.all() as unknown as { artifact_json: string }[];
    return Object.freeze(
      rows.map((row) => {
        try {
          return parseRuntimeScopeDefinition(JSON.parse(row.artifact_json));
        } catch {
          throw new RuntimeScopeStoreError("malformed_record", "runtime-scope store contains a malformed definition");
        }
      }),
    );
  }

  close(): void {
    this.#database.close();
  }
}

/** The canonical default runtime-scope store path (Palimpsest-owned). */
export function defaultRuntimeScopePath(): string {
  const configured = process.env.DSH_HOME?.trim();
  const dshHome = configured === undefined || configured.length === 0 ? join(homedir(), ".dsh") : configured;
  return join(dshHome, "palimpsest", "runtime_scope.sqlite");
}
