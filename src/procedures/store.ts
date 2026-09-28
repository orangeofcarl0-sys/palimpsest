/**
 * E5-P §12/§26 — the durable, append-only PROCEDURE store.
 *
 *     ProcedureStore  ≠  Procedure authority
 *
 * The store owns persistence, envelope/ordering, idempotency, the hash chain and the strict
 * artifact shape — nothing else. It decides no admission, computes no standing and grants no
 * authority; the service above it derives all of that from the chain this store keeps.
 *
 * ## One chained stream per PROCEDURE (§26)
 *
 * A procedure's whole history — every published revision, every retirement — is ONE chained
 * scope keyed by `procedureId`. That is what makes §18's historical/current split possible:
 * appending P@2 never touches P@1's row, so an attempt bound to P@1 keeps a resolvable,
 * byte-identical body forever while the derived CURRENT standing moves on.
 *
 * ## §12: nothing is ever rewritten
 *
 * There is no UPDATE and no DELETE. A retirement is an appended event, not a mutation of the
 * revision it retires. Content-addressed event ids make a replay naturally idempotent, and the
 * CAS-guarded `appendAtomic` makes a concurrent second writer fail loudly rather than fork the
 * chain.
 *
 * Layer: L2 (`src/procedures/`).
 */

import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { canonicalDigest } from "../schema/canonical.js";
import { procedureFail, procedureObject } from "./content.js";
import { parseProcedureRef, parseProcedureRevision, type ProcedureRef, type ProcedureRevision } from "./revision.js";

export const PROCEDURE_STORE_CHAIN_DOMAIN = "palimpsest.procedures.event.v1";
export const PROCEDURE_STORE_EVENT_ID_DOMAIN = "palimpsest.procedures.event-id.v1";

export const PROCEDURE_REVISION_PUBLISHED = "PROCEDURE_REVISION_PUBLISHED";
export const PROCEDURE_RETIRED = "PROCEDURE_RETIRED";

export type ProcedureEventType = typeof PROCEDURE_REVISION_PUBLISHED | typeof PROCEDURE_RETIRED;

export type ProcedureStoreErrorKind =
  | "unknown_procedure"
  | "event_conflict"
  | "recovery_required"
  | "basis_mismatch"
  | "malformed_record"
  | "invalid_registration"
  | "database_busy";

export class ProcedureStoreError extends Error {
  constructor(
    readonly kind: ProcedureStoreErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ProcedureStoreError";
  }
}

export function procedureStoreFail(kind: ProcedureStoreErrorKind, message: string): never {
  throw new ProcedureStoreError(kind, message);
}

export interface ProcedureEventDraft {
  readonly eventId: string;
  readonly type: ProcedureEventType;
  readonly payload: unknown;
}

export interface ProcedureEvent<T extends ProcedureEventType = ProcedureEventType> {
  readonly eventId: string;
  readonly seq: number;
  readonly scopeId: string;
  readonly type: T;
  readonly payload: unknown;
  readonly chainDigest: string;
}

/** The FULL append-only history basis — the CAS guard for `appendAtomic`. */
export interface ProcedureBasis {
  readonly scopeId: string;
  readonly throughSeq: number;
  readonly chainDigest: string;
}

export type ProcedureEventPayloadParser = (payload: unknown) => unknown;
export type ProcedureEventParsers = Readonly<Record<string, ProcedureEventPayloadParser>>;

function singleKeyParser(key: string, parse: (raw: unknown, what?: string) => unknown): ProcedureEventPayloadParser {
  return (payload: unknown): unknown => {
    const object = procedureObject(payload, key);
    const keys = Object.keys(object);
    for (const candidate of keys) {
      if (candidate !== key) procedureStoreFail("invalid_registration", `${key} event payload has unknown field "${candidate}"`);
    }
    if (keys.length !== 1 || !Object.hasOwn(object, key) || object[key] === undefined) {
      procedureStoreFail("invalid_registration", `${key} event payload must carry exactly the "${key}" field`);
    }
    return Object.freeze({ [key]: parse(object[key], key) });
  };
}

function parseRetirement(raw: unknown, what = PROCEDURE_RETIRED): { readonly ref: ProcedureRef; readonly reason: string } {
  const object = procedureObject(raw, what);
  for (const key of Object.keys(object)) {
    if (key !== "ref" && key !== "reason") procedureStoreFail("invalid_registration", `${what} payload has unknown field "${key}"`);
  }
  if (!Object.hasOwn(object, "ref") || !Object.hasOwn(object, "reason")) {
    procedureStoreFail("invalid_registration", `${what} payload requires ref and reason`);
  }
  const reason = object.reason;
  if (typeof reason !== "string" || reason.trim().length === 0) {
    procedureStoreFail("invalid_registration", `${what}.reason must be a non-empty string`);
  }
  return Object.freeze({ ref: parseProcedureRef(object.ref, `${what}.ref`), reason });
}

export const PROCEDURE_EVENT_PARSERS: ProcedureEventParsers = Object.freeze({
  [PROCEDURE_REVISION_PUBLISHED]: singleKeyParser("revision", parseProcedureRevision),
  [PROCEDURE_RETIRED]: (payload: unknown) => parseRetirement(payload, PROCEDURE_RETIRED),
});

export function procedureChainDigest(input: {
  readonly scopeId: string;
  readonly seq: number;
  readonly eventId: string;
  readonly type: string;
  readonly payload: unknown;
  readonly previousChainDigest: string | null;
}): string {
  return canonicalDigest({
    domain: PROCEDURE_STORE_CHAIN_DOMAIN,
    scopeId: input.scopeId,
    seq: input.seq,
    eventId: input.eventId,
    type: input.type,
    payload: input.payload,
    previous: input.previousChainDigest,
  });
}

/** Deterministic content-addressed event id — replays are naturally idempotent. */
export function procedureEventIdOf(type: ProcedureEventType, scopeId: string, payload: unknown): string {
  return `pre-${canonicalDigest({ domain: PROCEDURE_STORE_EVENT_ID_DOMAIN, type, scopeId, payload }).slice(0, 32)}`;
}

/** The `PROCEDURE_REVISION_PUBLISHED` draft for one admitted revision. */
export function procedureRevisionPublishedEvent(revision: ProcedureRevision): ProcedureEventDraft {
  const payload = Object.freeze({ revision });
  return Object.freeze({
    eventId: procedureEventIdOf(PROCEDURE_REVISION_PUBLISHED, revision.procedureId, payload),
    type: PROCEDURE_REVISION_PUBLISHED,
    payload,
  });
}

/** The `PROCEDURE_RETIRED` draft for one explicit retirement. */
export function procedureRetiredEvent(procedureId: string, ref: ProcedureRef, reason: string): ProcedureEventDraft {
  const payload = Object.freeze({ ref, reason });
  return Object.freeze({
    eventId: procedureEventIdOf(PROCEDURE_RETIRED, procedureId, payload),
    type: PROCEDURE_RETIRED,
    payload,
  });
}

/* ------------------------------------------------------------------ *
 * SqliteProcedureStore — append-only chain PER PROCEDURE
 * ------------------------------------------------------------------ */

export interface ProcedureStore {
  appendAtomic(input: {
    readonly expectedBasis: ProcedureBasis;
    readonly events: readonly ProcedureEventDraft[];
  }): Promise<readonly ProcedureEvent[]>;
  basis(procedureId: string): Promise<ProcedureBasis | undefined>;
  replay(procedureId: string): Promise<readonly ProcedureEvent[]>;
  /** Distinct procedure scope ids. */
  procedures(): Promise<readonly string[]>;
  close(): void;
}

type Statement = ReturnType<DatabaseSync["prepare"]>;

interface EventRow {
  scope_id: string;
  seq: number;
  event_id: string;
  type: string;
  payload_json: string;
  chain_digest: string;
}

interface PreparedEntry {
  readonly eventId: string;
  readonly type: ProcedureEventType;
  readonly payload: unknown;
}

function isBusyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /SQLITE_BUSY|SQLITE_LOCKED|database is locked|database table is locked/i.test(message);
}

export class SqliteProcedureStore implements ProcedureStore {
  readonly #database: DatabaseSync;
  readonly #selectEvents: Statement;
  readonly #selectScopes: Statement;
  readonly #insertEvent: Statement;
  readonly #parsers: ProcedureEventParsers;

  constructor(databasePath: string, options?: { readonly busyTimeoutMs?: number }) {
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.#database = new DatabaseSync(databasePath === ":memory:" ? ":memory:" : join(databasePath));
    this.#database.exec(`PRAGMA busy_timeout = ${options?.busyTimeoutMs ?? 5000}`);
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS procedure_events (" +
        "scope_id TEXT NOT NULL, seq INTEGER NOT NULL, event_id TEXT NOT NULL UNIQUE, type TEXT NOT NULL, " +
        "payload_json TEXT NOT NULL, chain_digest TEXT NOT NULL, PRIMARY KEY (scope_id, seq))",
    );
    this.#selectEvents = this.#database.prepare(
      "SELECT scope_id, seq, event_id, type, payload_json, chain_digest FROM procedure_events WHERE scope_id = ? ORDER BY seq",
    );
    this.#selectScopes = this.#database.prepare("SELECT DISTINCT scope_id FROM procedure_events ORDER BY scope_id");
    this.#insertEvent = this.#database.prepare(
      "INSERT INTO procedure_events (scope_id, seq, event_id, type, payload_json, chain_digest) VALUES (?, ?, ?, ?, ?, ?)",
    );
    this.#parsers = PROCEDURE_EVENT_PARSERS;
  }

  #parse(row: EventRow, previous: ProcedureEvent | undefined): ProcedureEvent {
    const parser = this.#parsers[row.type];
    if (parser === undefined) procedureStoreFail("malformed_record", `procedure event "${row.event_id}" has unknown type "${row.type}"`);
    let payload: unknown;
    try {
      payload = parser(JSON.parse(row.payload_json));
    } catch (error) {
      procedureStoreFail("malformed_record", `procedure event "${row.event_id}" payload is malformed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const expected = procedureChainDigest({
      scopeId: row.scope_id,
      seq: row.seq,
      eventId: row.event_id,
      type: row.type,
      payload,
      previousChainDigest: previous?.chainDigest ?? null,
    });
    if (expected !== row.chain_digest) {
      procedureStoreFail("malformed_record", `procedure chain is corrupt at "${row.scope_id}" seq ${row.seq}`);
    }
    return Object.freeze({
      eventId: row.event_id,
      seq: row.seq,
      scopeId: row.scope_id,
      type: row.type as ProcedureEventType,
      payload,
      chainDigest: row.chain_digest,
    });
  }

  #readAll(scopeId: string): ProcedureEvent[] {
    const rows = this.#selectEvents.all(scopeId) as unknown as EventRow[];
    const events: ProcedureEvent[] = [];
    let previous: ProcedureEvent | undefined;
    let expectedSeq = 1;
    for (const row of rows) {
      if (row.seq !== expectedSeq) procedureStoreFail("malformed_record", `scope "${scopeId}" event sequence has a gap at ${row.seq}`);
      const event = this.#parse(row, previous);
      if (event.type === PROCEDURE_REVISION_PUBLISHED) {
        const revision = (event.payload as { readonly revision: ProcedureRevision }).revision;
        if (revision.procedureId !== scopeId) {
          procedureStoreFail("malformed_record", `scope "${scopeId}" carries a revision for procedure "${revision.procedureId}"`);
        }
      } else {
        const ref = (event.payload as { readonly ref: ProcedureRef }).ref;
        if (ref.procedureId !== scopeId) {
          procedureStoreFail("malformed_record", `scope "${scopeId}" retires procedure "${ref.procedureId}"`);
        }
      }
      events.push(event);
      previous = event;
      expectedSeq += 1;
    }
    return events;
  }

  #classify(error: unknown): never {
    if (error instanceof ProcedureStoreError) throw error;
    if (isBusyError(error)) {
      throw new ProcedureStoreError("database_busy", `procedure store write contention (bounded wait exhausted): ${error instanceof Error ? error.message : String(error)}`);
    }
    throw new ProcedureStoreError("invalid_registration", `procedure store write failed: ${error instanceof Error ? error.message : String(error)}`);
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
      this.#classify(error);
    }
  }

  async appendAtomic(input: {
    readonly expectedBasis: ProcedureBasis;
    readonly events: readonly ProcedureEventDraft[];
  }): Promise<readonly ProcedureEvent[]> {
    const scopeId = input.expectedBasis.scopeId;
    if (typeof scopeId !== "string" || scopeId.length === 0) procedureStoreFail("invalid_registration", "expected basis scope must be a non-empty string");
    if (input.events.length === 0) procedureStoreFail("invalid_registration", "appendAtomic requires at least one event");
    const prepared: PreparedEntry[] = input.events.map((event) => {
      const parser = this.#parsers[event.type];
      if (parser === undefined) procedureStoreFail("invalid_registration", `unknown procedure event type "${event.type}"`);
      let payload: unknown;
      try {
        payload = parser(event.payload);
      } catch (error) {
        procedureStoreFail("invalid_registration", `procedure event "${event.eventId}" payload is invalid: ${error instanceof Error ? error.message : String(error)}`);
      }
      return { eventId: event.eventId, type: event.type, payload };
    });
    const seen = new Set<string>();
    for (const entry of prepared) {
      if (seen.has(entry.eventId)) procedureStoreFail("event_conflict", `duplicate eventId "${entry.eventId}"`);
      seen.add(entry.eventId);
    }
    return this.#transactional(() => {
      const stored = this.#readAll(scopeId);
      const byId = new Map(stored.map((event) => [event.eventId, event]));
      let present = 0;
      let conflicting = false;
      for (const entry of prepared) {
        const row = byId.get(entry.eventId);
        if (row === undefined) continue;
        present += 1;
        if (row.type !== entry.type || canonicalDigest({ domain: PROCEDURE_STORE_EVENT_ID_DOMAIN, type: row.type, payload: row.payload }) !== canonicalDigest({ domain: PROCEDURE_STORE_EVENT_ID_DOMAIN, type: entry.type, payload: entry.payload })) {
          conflicting = true;
        }
      }
      if (conflicting) procedureStoreFail("event_conflict", "a requested eventId already exists with different content");
      if (present === prepared.length) return Object.freeze(prepared.map((entry) => byId.get(entry.eventId)!));
      if (present > 0) procedureStoreFail("recovery_required", "procedure atomic batch is partially present");
      const tail = stored[stored.length - 1];
      if ((tail?.seq ?? 0) !== input.expectedBasis.throughSeq || (tail?.chainDigest ?? "") !== input.expectedBasis.chainDigest) {
        procedureStoreFail("basis_mismatch", `scope "${scopeId}" basis is seq ${tail?.seq ?? 0}, expected ${input.expectedBasis.throughSeq}`);
      }

      const appended: ProcedureEvent[] = [];
      let seq = input.expectedBasis.throughSeq;
      let previous = tail?.chainDigest ?? null;
      for (const entry of prepared) {
        seq += 1;
        const chainDigest = procedureChainDigest({ scopeId, seq, eventId: entry.eventId, type: entry.type, payload: entry.payload, previousChainDigest: previous });
        this.#insertEvent.run(scopeId, seq, entry.eventId, entry.type, JSON.stringify(entry.payload), chainDigest);
        previous = chainDigest;
        appended.push(Object.freeze({ eventId: entry.eventId, seq, scopeId, type: entry.type, payload: entry.payload, chainDigest }));
      }
      return Object.freeze(appended);
    });
  }

  async basis(procedureId: string): Promise<ProcedureBasis | undefined> {
    const events = this.#readAll(procedureId);
    const tail = events[events.length - 1];
    if (tail === undefined) return undefined;
    return Object.freeze({ scopeId: procedureId, throughSeq: tail.seq, chainDigest: tail.chainDigest });
  }

  async replay(procedureId: string): Promise<readonly ProcedureEvent[]> {
    return Object.freeze(this.#readAll(procedureId));
  }

  async procedures(): Promise<readonly string[]> {
    const rows = this.#selectScopes.all() as unknown as { scope_id: string }[];
    return Object.freeze(rows.map((row) => row.scope_id));
  }

  close(): void {
    this.#database.close();
  }
}

/** The canonical default procedure store path (Palimpsest-owned). */
export function defaultProcedureStorePath(): string {
  const configured = process.env.DSH_HOME?.trim();
  const dshHome = configured === undefined || configured.length === 0 ? join(homedir(), ".dsh") : configured;
  return join(dshHome, "palimpsest", "procedures.sqlite");
}

/** Read one procedure's published revisions out of a replayed chain (derived, read-only). */
export function publishedRevisionsOf(events: readonly ProcedureEvent[]): readonly ProcedureRevision[] {
  const revisions: ProcedureRevision[] = [];
  for (const event of events) {
    if (event.type === PROCEDURE_REVISION_PUBLISHED) {
      revisions.push((event.payload as { readonly revision: ProcedureRevision }).revision);
    }
  }
  return Object.freeze(revisions);
}

/** Read one procedure's retirements out of a replayed chain (derived, read-only). */
export function retirementsOf(events: readonly ProcedureEvent[]): readonly { readonly ref: ProcedureRef; readonly reason: string }[] {
  const retirements: { readonly ref: ProcedureRef; readonly reason: string }[] = [];
  for (const event of events) {
    if (event.type === PROCEDURE_RETIRED) {
      retirements.push((event.payload as { readonly ref: ProcedureRef; readonly reason: string }));
    }
  }
  return Object.freeze(retirements);
}
