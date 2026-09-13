/**
 * G10-K BoundaryMemoryStore — one canonical Palimpsest-owned append-only history
 * of shared boundary state, chained per workspace.
 *
 * It owns ONLY: workspace definitions, artifact candidate history, acceptance /
 * rejection history, and accepted-revision lineage. It NEVER owns messages,
 * commitments, evidence, OrganizationDefinition, Campaign, RuntimeScope, or
 * Institution state — and no mutable status row ever outranks this history.
 */

import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { canonicalDigest } from "../schema/canonical.js";
import type { BoundaryEventParsers, BoundaryEventType, BoundaryWorkspaceDefinition } from "./artifacts.js";
import { BOUNDARY_EVENT_PARSERS, boundaryChainDigest, parseBoundaryWorkspaceDefinition } from "./artifacts.js";

export type BoundaryStoreErrorKind =
  | "invalid_registration"
  | "already_exists"
  | "unknown_workspace"
  | "basis_mismatch"
  | "event_conflict"
  | "recovery_required"
  | "malformed_record"
  | "workspace_closed"
  | "not_a_participant"
  | "unknown_artifact"
  | "unknown_type"
  | "invalid_content"
  | "unilateral_acceptance_unsupported"
  | "not_required_acceptor"
  | "unauthenticated_acceptance"
  | "already_decided"
  | "stale_candidate"
  | "unknown_candidate"
  | "candidate_conflict"
  | "unverified_scope";

export class BoundaryMemoryStoreError extends Error {
  constructor(
    readonly kind: BoundaryStoreErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "BoundaryMemoryStoreError";
  }
}

function payloadKey(type: string, payload: unknown): string {
  return canonicalDigest({ domain: "palimpsest.boundary-event.v1", type, payload });
}

export interface BoundaryEvent<T extends BoundaryEventType = BoundaryEventType> {
  readonly workspaceId: string;
  readonly seq: number;
  readonly eventId: string;
  readonly type: T;
  readonly payload: unknown;
  readonly chainDigest: string;
}

export interface BoundaryAppendRequest {
  readonly eventId: string;
  readonly type: BoundaryEventType;
  readonly payload: unknown;
}

export interface BoundaryBasis {
  readonly workspaceId: string;
  readonly throughSeq: number;
  readonly chainDigest: string;
}

export interface BoundaryMemoryStore {
  /** Open a workspace and append `WORKSPACE_OPENED` as seq 1 (idempotent on identical retry). */
  openWorkspace(workspace: BoundaryWorkspaceDefinition): Promise<BoundaryEvent>;
  appendAtomic(input: {
    readonly workspaceId: string;
    readonly expectedBasis: BoundaryBasis;
    readonly events: readonly BoundaryAppendRequest[];
  }): Promise<readonly BoundaryEvent[]>;
  workspace(workspaceId: string): Promise<BoundaryWorkspaceDefinition | undefined>;
  workspaces(): Promise<readonly BoundaryWorkspaceDefinition[]>;
  basis(workspaceId: string): Promise<BoundaryBasis | undefined>;
  exists(workspaceId: string): Promise<boolean>;
  replay(workspaceId: string): Promise<readonly BoundaryEvent[]>;
  close(): void;
}

type Statement = ReturnType<DatabaseSync["prepare"]>;

interface EventRow {
  workspace_id: string;
  seq: number;
  event_id: string;
  type: string;
  payload_json: string;
  chain_digest: string;
}

export class SqliteBoundaryMemoryStore implements BoundaryMemoryStore {
  readonly #database: DatabaseSync;
  readonly #selectWorkspace: Statement;
  readonly #selectWorkspaces: Statement;
  readonly #insertWorkspace: Statement;
  readonly #selectEvents: Statement;
  readonly #insertEvent: Statement;
  readonly #parsers: BoundaryEventParsers;

  constructor(databasePath: string, options?: { readonly busyTimeoutMs?: number; readonly eventParsers?: BoundaryEventParsers }) {
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.#database = new DatabaseSync(databasePath === ":memory:" ? ":memory:" : join(databasePath));
    this.#database.exec(`PRAGMA busy_timeout = ${options?.busyTimeoutMs ?? 5000}`);
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS boundary_workspaces (" +
        "workspace_id TEXT PRIMARY KEY, artifact_json TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS boundary_events (" +
        "workspace_id TEXT NOT NULL, seq INTEGER NOT NULL, event_id TEXT NOT NULL UNIQUE, type TEXT NOT NULL, " +
        "payload_json TEXT NOT NULL, chain_digest TEXT NOT NULL, PRIMARY KEY (workspace_id, seq))",
    );
    this.#selectWorkspace = this.#database.prepare("SELECT artifact_json FROM boundary_workspaces WHERE workspace_id = ?");
    this.#selectWorkspaces = this.#database.prepare("SELECT artifact_json FROM boundary_workspaces ORDER BY workspace_id");
    this.#insertWorkspace = this.#database.prepare("INSERT INTO boundary_workspaces (workspace_id, artifact_json) VALUES (?, ?)");
    this.#selectEvents = this.#database.prepare(
      "SELECT workspace_id, seq, event_id, type, payload_json, chain_digest FROM boundary_events WHERE workspace_id = ? ORDER BY seq",
    );
    this.#insertEvent = this.#database.prepare(
      "INSERT INTO boundary_events (workspace_id, seq, event_id, type, payload_json, chain_digest) VALUES (?, ?, ?, ?, ?, ?)",
    );
    this.#parsers = { ...BOUNDARY_EVENT_PARSERS, ...(options?.eventParsers ?? {}) };
  }

  #parse(row: EventRow, previous: BoundaryEvent | undefined): BoundaryEvent {
    const parser = this.#parsers[row.type];
    if (parser === undefined) throw new BoundaryMemoryStoreError("malformed_record", `boundary event "${row.event_id}" has unknown type "${row.type}"`);
    let payload: unknown;
    try {
      payload = parser(JSON.parse(row.payload_json));
    } catch (error) {
      throw new BoundaryMemoryStoreError("malformed_record", `boundary event "${row.event_id}" payload is malformed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const expected = boundaryChainDigest({ workspaceId: row.workspace_id, seq: row.seq, eventId: row.event_id, type: row.type, payload, previousChainDigest: previous?.chainDigest ?? null });
    if (expected !== row.chain_digest) throw new BoundaryMemoryStoreError("malformed_record", `boundary chain is corrupt at "${row.workspace_id}" seq ${row.seq}`);
    return Object.freeze({ workspaceId: row.workspace_id, seq: row.seq, eventId: row.event_id, type: row.type as BoundaryEventType, payload, chainDigest: row.chain_digest });
  }

  #readAll(workspaceId: string): BoundaryEvent[] {
    const rows = this.#selectEvents.all(workspaceId) as unknown as EventRow[];
    const events: BoundaryEvent[] = [];
    let previous: BoundaryEvent | undefined;
    let expectedSeq = 1;
    for (const row of rows) {
      if (row.seq !== expectedSeq) throw new BoundaryMemoryStoreError("malformed_record", `workspace "${workspaceId}" event sequence has a gap at ${row.seq}`);
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
      if (error instanceof BoundaryMemoryStoreError) throw error;
      throw new BoundaryMemoryStoreError("invalid_registration", `boundary store write failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async openWorkspace(workspace: BoundaryWorkspaceDefinition): Promise<BoundaryEvent> {
    const canonical = parseBoundaryWorkspaceDefinition(JSON.parse(JSON.stringify(workspace)));
    const artifactJson = JSON.stringify(canonical);
    return this.#transactional(() => {
      const existing = this.#selectWorkspace.get(canonical.workspaceId) as { artifact_json: string } | undefined;
      if (existing !== undefined) {
        if (existing.artifact_json !== artifactJson) {
          throw new BoundaryMemoryStoreError("already_exists", `workspace "${canonical.workspaceId}" already exists with different content`);
        }
        return this.#readAll(canonical.workspaceId)[0]!;
      }
      this.#insertWorkspace.run(canonical.workspaceId, artifactJson);
      const payload = Object.freeze({ workspace: canonical });
      const eventId = `bev-${canonicalDigest({ domain: "palimpsest.boundary-event.v1", type: "WORKSPACE_OPENED", workspaceId: canonical.workspaceId, payload }).slice(0, 32)}`;
      const chainDigest = boundaryChainDigest({ workspaceId: canonical.workspaceId, seq: 1, eventId, type: "WORKSPACE_OPENED", payload, previousChainDigest: null });
      this.#insertEvent.run(canonical.workspaceId, 1, eventId, "WORKSPACE_OPENED", JSON.stringify(payload), chainDigest);
      return Object.freeze({ workspaceId: canonical.workspaceId, seq: 1, eventId, type: "WORKSPACE_OPENED" as const, payload, chainDigest });
    });
  }

  async appendAtomic(input: {
    readonly workspaceId: string;
    readonly expectedBasis: BoundaryBasis;
    readonly events: readonly BoundaryAppendRequest[];
  }): Promise<readonly BoundaryEvent[]> {
    if (input.expectedBasis.workspaceId !== input.workspaceId) throw new BoundaryMemoryStoreError("invalid_registration", "expected basis workspace mismatch");
    if (input.events.length === 0) throw new BoundaryMemoryStoreError("invalid_registration", "appendAtomic requires at least one event");
    const prepared = input.events.map((event) => {
      const parser = this.#parsers[event.type];
      if (parser === undefined) throw new BoundaryMemoryStoreError("invalid_registration", `unknown boundary event type "${event.type}"`);
      return { eventId: event.eventId, type: event.type, payload: parser(event.payload) };
    });
    const seen = new Set<string>();
    for (const entry of prepared) {
      if (seen.has(entry.eventId)) throw new BoundaryMemoryStoreError("event_conflict", `duplicate eventId "${entry.eventId}"`);
      seen.add(entry.eventId);
    }
    return this.#transactional(() => {
      if (this.#selectWorkspace.get(input.workspaceId) === undefined) throw new BoundaryMemoryStoreError("unknown_workspace", `workspace "${input.workspaceId}" does not exist`);
      const stored = this.#readAll(input.workspaceId);
      const byId = new Map(stored.map((event) => [event.eventId, event]));
      let present = 0;
      let conflicting = false;
      for (const entry of prepared) {
        const row = byId.get(entry.eventId);
        if (row === undefined) continue;
        present += 1;
        if (row.type !== entry.type || payloadKey(row.type, row.payload) !== payloadKey(entry.type, entry.payload)) conflicting = true;
      }
      if (conflicting) throw new BoundaryMemoryStoreError("event_conflict", "a requested eventId already exists with different content");
      if (present === prepared.length) return Object.freeze(prepared.map((entry) => byId.get(entry.eventId)!));
      if (present > 0) throw new BoundaryMemoryStoreError("recovery_required", "boundary atomic batch is partially present");
      const tail = stored.length === 0 ? undefined : stored[stored.length - 1];
      if ((tail?.seq ?? 0) !== input.expectedBasis.throughSeq || (tail?.chainDigest ?? "") !== input.expectedBasis.chainDigest) {
        throw new BoundaryMemoryStoreError("basis_mismatch", `workspace "${input.workspaceId}" basis is seq ${tail?.seq ?? 0}, expected ${input.expectedBasis.throughSeq}`);
      }
      const appended: BoundaryEvent[] = [];
      let seq = input.expectedBasis.throughSeq;
      let previous = tail?.chainDigest ?? null;
      for (const entry of prepared) {
        seq += 1;
        const chainDigest = boundaryChainDigest({ workspaceId: input.workspaceId, seq, eventId: entry.eventId, type: entry.type, payload: entry.payload, previousChainDigest: previous });
        this.#insertEvent.run(input.workspaceId, seq, entry.eventId, entry.type, JSON.stringify(entry.payload), chainDigest);
        previous = chainDigest;
        appended.push(Object.freeze({ workspaceId: input.workspaceId, seq, eventId: entry.eventId, type: entry.type, payload: entry.payload, chainDigest }));
      }
      return Object.freeze(appended);
    });
  }

  async workspace(workspaceId: string): Promise<BoundaryWorkspaceDefinition | undefined> {
    const row = this.#selectWorkspace.get(workspaceId) as { artifact_json: string } | undefined;
    if (row === undefined) return undefined;
    try {
      return parseBoundaryWorkspaceDefinition(JSON.parse(row.artifact_json));
    } catch (error) {
      throw new BoundaryMemoryStoreError("malformed_record", `workspace "${workspaceId}" is malformed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async workspaces(): Promise<readonly BoundaryWorkspaceDefinition[]> {
    const rows = this.#selectWorkspaces.all() as unknown as { artifact_json: string }[];
    const result: BoundaryWorkspaceDefinition[] = [];
    for (const row of rows) {
      try {
        result.push(parseBoundaryWorkspaceDefinition(JSON.parse(row.artifact_json)));
      } catch (error) {
        throw new BoundaryMemoryStoreError("malformed_record", `a workspace record is malformed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return Object.freeze(result);
  }

  async basis(workspaceId: string): Promise<BoundaryBasis | undefined> {
    if ((await this.workspace(workspaceId)) === undefined) return undefined;
    const events = this.#readAll(workspaceId);
    const tail = events.length === 0 ? undefined : events[events.length - 1];
    return Object.freeze({ workspaceId, throughSeq: tail?.seq ?? 0, chainDigest: tail?.chainDigest ?? "" });
  }

  async exists(workspaceId: string): Promise<boolean> {
    return this.#selectWorkspace.get(workspaceId) !== undefined;
  }

  async replay(workspaceId: string): Promise<readonly BoundaryEvent[]> {
    return Object.freeze(this.#readAll(workspaceId));
  }

  close(): void {
    this.#database.close();
  }
}

/** The canonical default Boundary Memory path (Palimpsest-owned). */
export function defaultBoundaryMemoryPath(): string {
  const configured = process.env.DSH_HOME?.trim();
  const dshHome = configured === undefined || configured.length === 0 ? join(homedir(), ".dsh") : configured;
  return join(dshHome, "palimpsest", "boundary_memory.sqlite");
}
