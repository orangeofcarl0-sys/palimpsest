/**
 * G10-V Project Workspace — ProjectJournal: the ONE Palimpsest-owned, append-only,
 * per-project journal for knowledge that has NO other canonical owner.
 *
 *   ProjectJournalEntry ≠ Truth        Journal ≠ Evidence      Opportunity ≠ Task
 *   NEGATIVE_RESULT grants no truth    Journal ≠ Decision      Resolution ≠ Erasure
 *
 * The journal kind enum STRUCTURALLY excludes PROOF / DECISION / TASK / EXPERIMENT /
 * COMMITMENT / BOUNDARY / SOURCE: those are owned elsewhere and may only be
 * REFERENCED (via `relatedRefs`) or ASSOCIATED (via ProjectAssetAssociation).
 * A journal entry is append-only; resolving one is a NEW event that references the
 * entry id — never an in-place edit. A `NEGATIVE_RESULT` records a failed direction
 * and grants no truth to its negation.
 */

import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { canonicalDigest } from "../schema/canonical.js";

import type {
  ProjectWorkspaceEventParsers,
  ProjectWorkspaceEventPayloadParser,
} from "./association.js";
import { pwDigest, pwEnum, pwFail, pwKeys, pwObject, pwOptionalString, pwStableId, pwString, pwTimestamp, ProjectWorkspaceError } from "./association.js";

export const PROJECT_JOURNAL_KINDS = ["IDEA", "OPEN_QUESTION", "NEGATIVE_RESULT", "OPPORTUNITY", "REFERENCE_NOTE"] as const;
export type ProjectJournalKind = (typeof PROJECT_JOURNAL_KINDS)[number];

export const PROJECT_JOURNAL_RESOLUTION_STATUSES = ["RESOLVED", "DISMISSED", "PROMOTED"] as const;
export type ProjectJournalResolutionStatus = (typeof PROJECT_JOURNAL_RESOLUTION_STATUSES)[number];

export const PROJECT_JOURNAL_ENTRY_DOMAIN = "palimpsest.project-workspace.journal-entry.v1";
export const PROJECT_JOURNAL_ENTRY_ID_DOMAIN = "palimpsest.project-workspace.journal-entry-id.v1";
export const PROJECT_JOURNAL_CHAIN_DOMAIN = "palimpsest.project-workspace.journal-event.v1";
export const PROJECT_JOURNAL_EVENT_ID_DOMAIN = "palimpsest.project-workspace.journal-event-id.v1";

export const JOURNAL_OPENED = "JOURNAL_OPENED";
export const JOURNAL_ENTRY_RECORDED = "JOURNAL_ENTRY_RECORDED";
export const JOURNAL_ENTRY_RESOLVED = "JOURNAL_ENTRY_RESOLVED";

/* ------------------------------------------------------------------ *
 * Resolution — a NEW event about an existing entry (never an edit)
 * ------------------------------------------------------------------ */

export interface ProjectJournalResolution {
  readonly status: ProjectJournalResolutionStatus;
  readonly detail?: string | undefined;
}

export function parseProjectJournalResolution(raw: unknown, what = "ProjectJournalResolution"): ProjectJournalResolution {
  const object = pwObject(raw, what);
  pwKeys(object, ["status", "detail"], ["status"], what);
  const detail = pwOptionalString(object.detail, `${what}.detail`);
  return Object.freeze({
    status: pwEnum(object.status, PROJECT_JOURNAL_RESOLUTION_STATUSES, `${what}.status`),
    ...(detail === undefined ? {} : { detail }),
  });
}

export function materializeProjectJournalResolution(input: {
  readonly status: ProjectJournalResolutionStatus;
  readonly detail?: string | undefined;
}): ProjectJournalResolution {
  const detail = input.detail === undefined ? undefined : pwString(input.detail, "resolution.detail");
  return Object.freeze({
    status: pwEnum(input.status, PROJECT_JOURNAL_RESOLUTION_STATUSES, "resolution.status"),
    ...(detail === undefined ? {} : { detail }),
  });
}

/* ------------------------------------------------------------------ *
 * ProjectJournalEntry
 * ------------------------------------------------------------------ */

export interface ProjectJournalRef {
  readonly kind: string;
  readonly id: string;
}

export function parseProjectJournalRef(raw: unknown, what = "ProjectJournalRef"): ProjectJournalRef {
  const object = pwObject(raw, what);
  pwKeys(object, ["kind", "id"], ["kind", "id"], what);
  return Object.freeze({
    kind: pwString(object.kind, `${what}.kind`),
    id: pwString(object.id, `${what}.id`),
  });
}

function parseRelatedRefs(raw: unknown, what: string): readonly ProjectJournalRef[] {
  if (!Array.isArray(raw)) pwFail("invalid_value", `${what} must be an array`);
  const seen = new Set<string>();
  const refs: ProjectJournalRef[] = [];
  for (const item of raw) {
    const ref = parseProjectJournalRef(item, `${what}[]`);
    const key = `${ref.kind}\u0000${ref.id}`;
    if (seen.has(key)) pwFail("invalid_value", `${what}: duplicate reference "${ref.kind}:${ref.id}"`);
    seen.add(key);
    refs.push(ref);
  }
  return Object.freeze(refs);
}

export interface ProjectJournalEntry {
  readonly schemaVersion: 1;
  readonly entryId: string;
  readonly projectId: string;
  readonly kind: ProjectJournalKind;
  readonly title: string;
  readonly body: string;
  readonly provenance: string;
  readonly relatedRefs: readonly ProjectJournalRef[];
  readonly createdAt: string;
  /** Shape-level forward compatibility only; recorded entries never set it. */
  readonly supersedes?: string | undefined;
  /** Shape-level forward compatibility; resolutions arrive as NEW events. */
  readonly resolution?: ProjectJournalResolution | undefined;
  readonly digest: string;
}

type JournalEntryContent = Omit<ProjectJournalEntry, "entryId" | "digest">;

/** Deterministic content-addressed entry id (`pje-<32 hex>`). */
export function projectJournalEntryIdOf(content: JournalEntryContent): string {
  return `pje-${canonicalDigest({ domain: PROJECT_JOURNAL_ENTRY_ID_DOMAIN, entry: content }).slice(0, 32)}`;
}

export function projectJournalEntryDigestOf(input: Omit<ProjectJournalEntry, "digest">): string {
  return canonicalDigest({ domain: PROJECT_JOURNAL_ENTRY_DOMAIN, entry: input });
}

export function materializeProjectJournalEntry(input: {
  readonly projectId: string;
  readonly kind: ProjectJournalKind;
  readonly title: string;
  readonly body: string;
  readonly provenance: string;
  readonly relatedRefs?: readonly ProjectJournalRef[] | undefined;
  readonly createdAt: string;
}): ProjectJournalEntry {
  const content: JournalEntryContent = {
    schemaVersion: 1,
    projectId: pwStableId(input.projectId, "projectId"),
    kind: pwEnum(input.kind, PROJECT_JOURNAL_KINDS, "kind"),
    title: pwString(input.title, "title"),
    body: pwString(input.body, "body"),
    provenance: pwString(input.provenance, "provenance"),
    relatedRefs: input.relatedRefs === undefined ? Object.freeze([] as ProjectJournalRef[]) : freezeRefs(input.relatedRefs),
    createdAt: pwTimestamp(input.createdAt, "createdAt"),
  };
  const entryId = projectJournalEntryIdOf(content);
  const withId = { ...content, entryId };
  return Object.freeze({ ...withId, digest: projectJournalEntryDigestOf(withId) });
}

function freezeRefs(refs: readonly ProjectJournalRef[]): readonly ProjectJournalRef[] {
  return parseRelatedRefs(refs, "relatedRefs");
}

export function parseProjectJournalEntry(raw: unknown, what = "ProjectJournalEntry"): ProjectJournalEntry {
  const object = pwObject(raw, what);
  pwKeys(
    object,
    ["schemaVersion", "entryId", "projectId", "kind", "title", "body", "provenance", "relatedRefs", "createdAt", "supersedes", "resolution", "digest"],
    ["schemaVersion", "entryId", "projectId", "kind", "title", "body", "provenance", "relatedRefs", "createdAt", "digest"],
    what,
  );
  if (object.schemaVersion !== 1) pwFail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  const supersedes = object.supersedes === undefined ? undefined : pwStableId(object.supersedes, `${what}.supersedes`);
  const resolution = object.resolution === undefined ? undefined : parseProjectJournalResolution(object.resolution, `${what}.resolution`);
  const content: JournalEntryContent = {
    schemaVersion: 1,
    projectId: pwStableId(object.projectId, `${what}.projectId`),
    kind: pwEnum(object.kind, PROJECT_JOURNAL_KINDS, `${what}.kind`),
    title: pwString(object.title, `${what}.title`),
    body: pwString(object.body, `${what}.body`),
    provenance: pwString(object.provenance, `${what}.provenance`),
    relatedRefs: parseRelatedRefs(object.relatedRefs, `${what}.relatedRefs`),
    createdAt: pwTimestamp(object.createdAt, `${what}.createdAt`),
    ...(supersedes === undefined ? {} : { supersedes }),
    ...(resolution === undefined ? {} : { resolution }),
  };
  const entryId = pwString(object.entryId, `${what}.entryId`);
  if (projectJournalEntryIdOf(content) !== entryId) pwFail("invalid_value", `${what}.entryId does not match its content`);
  const digest = pwDigest(object.digest, `${what}.digest`);
  const withId = { ...content, entryId };
  if (projectJournalEntryDigestOf(withId) !== digest) pwFail("invalid_value", `${what}.digest does not match its content`);
  return Object.freeze({ ...withId, digest });
}

/* ------------------------------------------------------------------ *
 * Chain, events and payload parsers
 * ------------------------------------------------------------------ */

export type ProjectJournalEventType = typeof JOURNAL_OPENED | typeof JOURNAL_ENTRY_RECORDED | typeof JOURNAL_ENTRY_RESOLVED;

export interface ProjectJournalEventDraft {
  readonly eventId: string;
  readonly type: ProjectJournalEventType;
  readonly payload: unknown;
}

export interface ProjectJournalEvent<T extends ProjectJournalEventType = ProjectJournalEventType> {
  readonly eventId: string;
  readonly seq: number;
  readonly scopeId: string;
  readonly type: T;
  readonly payload: unknown;
  readonly chainDigest: string;
}

/** The FULL append-only project journal basis — the CAS guard for `appendAtomic`. */
export interface ProjectJournalBasis {
  readonly scopeId: string;
  readonly throughSeq: number;
  readonly chainDigest: string;
}

function singleKeyParser<T>(key: string, parse: (raw: unknown, what?: string) => T): ProjectWorkspaceEventPayloadParser {
  return (payload: unknown): unknown => {
    const object = pwObject(payload, key);
    const keys = Object.keys(object);
    for (const candidate of keys) {
      if (candidate !== key) pwFail("invalid_registration", `${key} event payload has unknown field "${candidate}"`);
    }
    if (keys.length !== 1 || !Object.hasOwn(object, key) || object[key] === undefined) {
      pwFail("invalid_registration", `${key} event payload must carry exactly the "${key}" field`);
    }
    return Object.freeze({ [key]: parse(object[key], key) });
  };
}

interface JournalEntryResolvedPayload {
  readonly entryId: string;
  readonly resolution: ProjectJournalResolution;
  readonly resolvedAt: string;
}

function parseJournalEntryResolved(raw: unknown, what = JOURNAL_ENTRY_RESOLVED): JournalEntryResolvedPayload {
  const object = pwObject(raw, what);
  pwKeys(object, ["entryId", "resolution", "resolvedAt"], ["entryId", "resolution", "resolvedAt"], what);
  return Object.freeze({
    entryId: pwStableId(object.entryId, `${what}.entryId`),
    resolution: parseProjectJournalResolution(object.resolution, `${what}.resolution`),
    resolvedAt: pwTimestamp(object.resolvedAt, `${what}.resolvedAt`),
  });
}

function parseJournalOpened(raw: unknown, what = JOURNAL_OPENED): { readonly projectId: string } {
  const object = pwObject(raw, what);
  pwKeys(object, ["projectId"], ["projectId"], what);
  return Object.freeze({ projectId: pwStableId(object.projectId, `${what}.projectId`) });
}

export const PROJECT_JOURNAL_EVENT_PARSERS: ProjectWorkspaceEventParsers = Object.freeze({
  [JOURNAL_OPENED]: (payload: unknown) => parseJournalOpened(payload, JOURNAL_OPENED),
  [JOURNAL_ENTRY_RECORDED]: singleKeyParser("entry", parseProjectJournalEntry),
  [JOURNAL_ENTRY_RESOLVED]: (payload: unknown) => parseJournalEntryResolved(payload, JOURNAL_ENTRY_RESOLVED),
});

export function projectJournalChainDigest(input: {
  readonly scopeId: string;
  readonly seq: number;
  readonly eventId: string;
  readonly type: string;
  readonly payload: unknown;
  readonly previousChainDigest: string | null;
}): string {
  return canonicalDigest({
    domain: PROJECT_JOURNAL_CHAIN_DOMAIN,
    scopeId: input.scopeId,
    seq: input.seq,
    eventId: input.eventId,
    type: input.type,
    payload: input.payload,
    previous: input.previousChainDigest,
  });
}

export function projectJournalEventIdOf(type: ProjectJournalEventType, scopeId: string, payload: unknown): string {
  return `pje${type === JOURNAL_OPENED ? "o" : type === JOURNAL_ENTRY_RECORDED ? "r" : "x"}-${canonicalDigest({ domain: PROJECT_JOURNAL_EVENT_ID_DOMAIN, type, scopeId, payload }).slice(0, 32)}`;
}

export function journalOpenedEvent(projectId: string): ProjectJournalEventDraft {
  const payload = Object.freeze({ projectId: pwStableId(projectId, "projectId") });
  return Object.freeze({
    eventId: projectJournalEventIdOf(JOURNAL_OPENED, payload.projectId, payload),
    type: JOURNAL_OPENED,
    payload,
  });
}

export function journalEntryRecordedEvent(entry: ProjectJournalEntry): ProjectJournalEventDraft {
  const payload = Object.freeze({ entry });
  return Object.freeze({
    eventId: projectJournalEventIdOf(JOURNAL_ENTRY_RECORDED, entry.projectId, payload),
    type: JOURNAL_ENTRY_RECORDED,
    payload,
  });
}

export function journalEntryResolvedEvent(input: {
  readonly projectId: string;
  readonly entryId: string;
  readonly resolution: ProjectJournalResolution;
  readonly resolvedAt: string;
}): ProjectJournalEventDraft {
  const payload = Object.freeze({
    entryId: pwStableId(input.entryId, "entryId"),
    resolution: input.resolution,
    resolvedAt: pwTimestamp(input.resolvedAt, "resolvedAt"),
  });
  return Object.freeze({
    eventId: projectJournalEventIdOf(JOURNAL_ENTRY_RESOLVED, pwStableId(input.projectId, "projectId"), payload),
    type: JOURNAL_ENTRY_RESOLVED,
    payload,
  });
}

/* ------------------------------------------------------------------ *
 * SqliteProjectJournalStore — append-only chain PER PROJECT
 * ------------------------------------------------------------------ */

export interface ProjectJournalStore {
  appendAtomic(input: {
    readonly expectedBasis: ProjectJournalBasis;
    readonly events: readonly ProjectJournalEventDraft[];
  }): Promise<readonly ProjectJournalEvent[]>;
  basis(projectId: string): Promise<ProjectJournalBasis | undefined>;
  replay(projectId: string): Promise<readonly ProjectJournalEvent[]>;
  /** Distinct project scope ids. */
  projects(): Promise<readonly string[]>;
  close(): void;
}

type Statement = ReturnType<DatabaseSync["prepare"]>;

interface JournalRow {
  scope_id: string;
  seq: number;
  event_id: string;
  type: string;
  payload_json: string;
  chain_digest: string;
}

interface PreparedEntry {
  readonly eventId: string;
  readonly type: ProjectJournalEventType;
  readonly payload: unknown;
}

function isBusyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /SQLITE_BUSY|SQLITE_LOCKED|database is locked|database table is locked/i.test(message);
}

export class SqliteProjectJournalStore implements ProjectJournalStore {
  readonly #database: DatabaseSync;
  readonly #selectEvents: Statement;
  readonly #selectScopes: Statement;
  readonly #insertEvent: Statement;
  readonly #parsers: ProjectWorkspaceEventParsers;

  constructor(databasePath: string, options?: { readonly busyTimeoutMs?: number }) {
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.#database = new DatabaseSync(databasePath === ":memory:" ? ":memory:" : join(databasePath));
    this.#database.exec(`PRAGMA busy_timeout = ${options?.busyTimeoutMs ?? 5000}`);
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS project_journal_events (" +
        "scope_id TEXT NOT NULL, seq INTEGER NOT NULL, event_id TEXT NOT NULL UNIQUE, type TEXT NOT NULL, " +
        "payload_json TEXT NOT NULL, chain_digest TEXT NOT NULL, PRIMARY KEY (scope_id, seq))",
    );
    this.#selectEvents = this.#database.prepare(
      "SELECT scope_id, seq, event_id, type, payload_json, chain_digest FROM project_journal_events WHERE scope_id = ? ORDER BY seq",
    );
    this.#selectScopes = this.#database.prepare("SELECT DISTINCT scope_id FROM project_journal_events ORDER BY scope_id");
    this.#insertEvent = this.#database.prepare(
      "INSERT INTO project_journal_events (scope_id, seq, event_id, type, payload_json, chain_digest) VALUES (?, ?, ?, ?, ?, ?)",
    );
    this.#parsers = PROJECT_JOURNAL_EVENT_PARSERS;
  }

  #parse(row: JournalRow, previous: ProjectJournalEvent | undefined): ProjectJournalEvent {
    const parser = this.#parsers[row.type];
    if (parser === undefined) pwFail("malformed_record", `project journal event "${row.event_id}" has unknown type "${row.type}"`);
    let payload: unknown;
    try {
      payload = parser(JSON.parse(row.payload_json));
    } catch (error) {
      pwFail("malformed_record", `project journal event "${row.event_id}" payload is malformed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const expected = projectJournalChainDigest({
      scopeId: row.scope_id,
      seq: row.seq,
      eventId: row.event_id,
      type: row.type,
      payload,
      previousChainDigest: previous?.chainDigest ?? null,
    });
    if (expected !== row.chain_digest) {
      pwFail("malformed_record", `project journal chain is corrupt at "${row.scope_id}" seq ${row.seq}`);
    }
    return Object.freeze({
      eventId: row.event_id,
      seq: row.seq,
      scopeId: row.scope_id,
      type: row.type as ProjectJournalEventType,
      payload,
      chainDigest: row.chain_digest,
    });
  }

  #readAll(scopeId: string): ProjectJournalEvent[] {
    const rows = this.#selectEvents.all(scopeId) as unknown as JournalRow[];
    const events: ProjectJournalEvent[] = [];
    let previous: ProjectJournalEvent | undefined;
    let expectedSeq = 1;
    for (const row of rows) {
      if (row.seq !== expectedSeq) pwFail("malformed_record", `scope "${scopeId}" event sequence has a gap at ${row.seq}`);
      const event = this.#parse(row, previous);
      if (event.seq === 1) {
        if (event.type !== JOURNAL_OPENED) {
          pwFail("malformed_record", `scope "${scopeId}" must be defined by a ${JOURNAL_OPENED} event`);
        }
        const opened = event.payload as { readonly projectId: string };
        if (opened.projectId !== scopeId) {
          pwFail("malformed_record", `scope "${scopeId}" was opened for project "${opened.projectId}"`);
        }
      } else if (event.type === JOURNAL_OPENED) {
        pwFail("malformed_record", `scope "${scopeId}" carries a ${JOURNAL_OPENED} event after its definition`);
      } else if (event.type === JOURNAL_ENTRY_RECORDED) {
        const entry = (event.payload as { readonly entry: ProjectJournalEntry }).entry;
        if (entry.projectId !== scopeId) {
          pwFail("malformed_record", `scope "${scopeId}" carries a journal entry for project "${entry.projectId}"`);
        }
      }
      events.push(event);
      previous = event;
      expectedSeq += 1;
    }
    return events;
  }

  #classify(error: unknown): never {
    if (error instanceof ProjectWorkspaceError) throw error;
    if (isBusyError(error)) {
      throw new ProjectWorkspaceError("database_busy", `project journal store write contention (bounded wait exhausted): ${error instanceof Error ? error.message : String(error)}`);
    }
    throw new ProjectWorkspaceError("invalid_registration", `project journal store write failed: ${error instanceof Error ? error.message : String(error)}`);
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
    readonly expectedBasis: ProjectJournalBasis;
    readonly events: readonly ProjectJournalEventDraft[];
  }): Promise<readonly ProjectJournalEvent[]> {
    const scopeId = input.expectedBasis.scopeId;
    if (typeof scopeId !== "string" || scopeId.length === 0) pwFail("invalid_registration", "expected basis scope must be a non-empty string");
    if (input.events.length === 0) pwFail("invalid_registration", "appendAtomic requires at least one event");
    const prepared: PreparedEntry[] = input.events.map((event) => {
      const parser = this.#parsers[event.type];
      if (parser === undefined) pwFail("invalid_registration", `unknown project journal event type "${event.type}"`);
      let payload: unknown;
      try {
        payload = parser(event.payload);
      } catch (error) {
        pwFail("invalid_registration", `project journal event "${event.eventId}" payload is invalid: ${error instanceof Error ? error.message : String(error)}`);
      }
      return { eventId: event.eventId, type: event.type, payload };
    });
    const seen = new Set<string>();
    for (const entry of prepared) {
      if (seen.has(entry.eventId)) pwFail("event_conflict", `duplicate eventId "${entry.eventId}"`);
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
        if (row.type !== entry.type || payloadKeyOf(row.type, row.payload) !== payloadKeyOf(entry.type, entry.payload)) conflicting = true;
      }
      if (conflicting) pwFail("event_conflict", "a requested eventId already exists with different content");
      if (present === prepared.length) return Object.freeze(prepared.map((entry) => byId.get(entry.eventId)!));
      if (present > 0) pwFail("recovery_required", "project journal atomic batch is partially present");
      const tail = stored[stored.length - 1];
      if ((tail?.seq ?? 0) !== input.expectedBasis.throughSeq || (tail?.chainDigest ?? "") !== input.expectedBasis.chainDigest) {
        pwFail("basis_mismatch", `scope "${scopeId}" basis is seq ${tail?.seq ?? 0}, expected ${input.expectedBasis.throughSeq}`);
      }

      const first = prepared[0]!;
      let startIndex = 0;
      if (stored.length === 0) {
        if (first.type !== JOURNAL_OPENED) {
          pwFail("invalid_registration", `scope "${scopeId}" must be defined by a ${JOURNAL_OPENED} event`);
        }
        const opened = first.payload as { readonly projectId: string };
        if (opened.projectId !== scopeId) {
          pwFail("invalid_registration", `basis scope "${scopeId}" does not match the opened project "${opened.projectId}"`);
        }
        startIndex = 1;
      }

      // Entries already recorded (prior chain + earlier events of this batch) and
      // the resolutions already applied — the append-only reference rules.
      const recorded = new Map<string, ProjectJournalEntry>();
      const resolved = new Set<string>();
      for (const event of stored) {
        if (event.type === JOURNAL_ENTRY_RECORDED) {
          const entry = (event.payload as { readonly entry: ProjectJournalEntry }).entry;
          recorded.set(entry.entryId, entry);
        } else if (event.type === JOURNAL_ENTRY_RESOLVED) {
          resolved.add((event.payload as JournalEntryResolvedPayload).entryId);
        }
      }

      for (let index = startIndex; index < prepared.length; index += 1) {
        const entry = prepared[index]!;
        if (entry.type === JOURNAL_OPENED) {
          pwFail("invalid_registration", `a project journal may only be opened by the first event of an empty scope`);
        }
        if (entry.type === JOURNAL_ENTRY_RECORDED) {
          const recordedEntry = (entry.payload as { readonly entry: ProjectJournalEntry }).entry;
          if (recordedEntry.projectId !== scopeId) {
            pwFail("invalid_registration", `journal entry "${recordedEntry.entryId}" belongs to project "${recordedEntry.projectId}", not scope "${scopeId}"`);
          }
          recorded.set(recordedEntry.entryId, recordedEntry);
        } else {
          const resolution = entry.payload as JournalEntryResolvedPayload;
          if (!recorded.has(resolution.entryId)) {
            pwFail("invalid_registration", `journal entry "${resolution.entryId}" is not recorded in scope "${scopeId}"`);
          }
          if (resolved.has(resolution.entryId)) {
            pwFail("invalid_registration", `journal entry "${resolution.entryId}" is already resolved; a resolution is a new event, not an edit`);
          }
          resolved.add(resolution.entryId);
        }
      }

      const appended: ProjectJournalEvent[] = [];
      let seq = input.expectedBasis.throughSeq;
      let previous = tail?.chainDigest ?? null;
      for (const entry of prepared) {
        seq += 1;
        const chainDigest = projectJournalChainDigest({ scopeId, seq, eventId: entry.eventId, type: entry.type, payload: entry.payload, previousChainDigest: previous });
        this.#insertEvent.run(scopeId, seq, entry.eventId, entry.type, JSON.stringify(entry.payload), chainDigest);
        previous = chainDigest;
        appended.push(Object.freeze({ eventId: entry.eventId, seq, scopeId, type: entry.type, payload: entry.payload, chainDigest }));
      }
      return Object.freeze(appended);
    });
  }

  async basis(projectId: string): Promise<ProjectJournalBasis | undefined> {
    const events = this.#readAll(projectId);
    const tail = events[events.length - 1];
    if (tail === undefined) return undefined;
    return Object.freeze({ scopeId: projectId, throughSeq: tail.seq, chainDigest: tail.chainDigest });
  }

  async replay(projectId: string): Promise<readonly ProjectJournalEvent[]> {
    return Object.freeze(this.#readAll(projectId));
  }

  async projects(): Promise<readonly string[]> {
    const rows = this.#selectScopes.all() as unknown as { scope_id: string }[];
    return Object.freeze(rows.map((row) => row.scope_id));
  }

  close(): void {
    this.#database.close();
  }
}

function payloadKeyOf(type: string, payload: unknown): string {
  return canonicalDigest({ domain: PROJECT_JOURNAL_EVENT_ID_DOMAIN, type, payload });
}

/** The canonical default project journal store path (Palimpsest-owned). */
export function defaultProjectJournalPath(): string {
  const configured = process.env.DSH_HOME?.trim();
  const dshHome = configured === undefined || configured.length === 0 ? join(homedir(), ".dsh") : configured;
  return join(dshHome, "palimpsest", "project-journal.sqlite");
}

/* ------------------------------------------------------------------ *
 * Derived read model — entries with their latest resolution merged
 * (resolutions are NEW events; the entry artifact is never edited)
 * ------------------------------------------------------------------ */

export interface ProjectJournalViewEntry {
  readonly entry: ProjectJournalEntry;
  readonly resolution?: ProjectJournalResolution | undefined;
  readonly resolvedAt?: string | undefined;
}

export function projectJournalView(events: readonly ProjectJournalEvent[]): readonly ProjectJournalViewEntry[] {
  const entries = new Map<string, ProjectJournalEntry>();
  const order: string[] = [];
  const resolutions = new Map<string, { readonly resolution: ProjectJournalResolution; readonly resolvedAt: string }>();
  for (const event of events) {
    if (event.type === JOURNAL_ENTRY_RECORDED) {
      const entry = (event.payload as { readonly entry: ProjectJournalEntry }).entry;
      if (!entries.has(entry.entryId)) order.push(entry.entryId);
      entries.set(entry.entryId, entry);
    } else if (event.type === JOURNAL_ENTRY_RESOLVED) {
      const payload = event.payload as JournalEntryResolvedPayload;
      resolutions.set(payload.entryId, { resolution: payload.resolution, resolvedAt: payload.resolvedAt });
    }
  }
  return Object.freeze(
    order.map((entryId) => {
      const entry = entries.get(entryId)!;
      const applied = resolutions.get(entryId);
      if (applied === undefined) {
        return Object.freeze({ entry, ...(entry.resolution === undefined ? {} : { resolution: entry.resolution }) });
      }
      return Object.freeze({ entry, resolution: applied.resolution, resolvedAt: applied.resolvedAt });
    }),
  );
}
