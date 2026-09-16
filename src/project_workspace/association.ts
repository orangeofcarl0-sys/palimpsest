/**
 * G10-V Project Workspace — ProjectAssetAssociation: the ONE Palimpsest-owned,
 * append-only, per-project association history.
 *
 *   ProjectWorkspace ≠ CanonicalStore      ProjectAssetAssociation ≠ AssetContent
 *   Association ≠ Truth                     Association ≠ Publication
 *   Associated ≠ Owned                      Recorded ≠ Evaluated
 *
 * An association records ONLY that a project is linked to an existing canonical
 * asset (a decision, a produced artifact, a published proof claim, an experiment,
 * a journal entry, a campaign, a reasoning cell) by an opaque canonical
 * reference. It NEVER stores the asset content, never copies a second history,
 * and never grants the asset any truth or authority: the canonical owner of the
 * asset stays the canonical owner. The store owns persistence, envelope/ordering,
 * idempotency, the chain and the strict artifact shape — nothing else.
 *
 * Each project owns ONE chained event stream: the first event of a project scope
 * is its `PROJECT_WORKSPACE_OPENED` definition; `ASSET_ASSOCIATED` records follow.
 */

import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { canonicalDigest } from "../schema/canonical.js";
import { canonicalDatetime } from "../schema/datetime.js";
import { isStableIdentifier, normalizeStableIdentifier } from "../schema/identifier.js";

/**
 * G10-AE §5: exactly ONE additive kind, `EXTERNAL_ASSET`, is added here. It names
 * a project's association to an asset OWNED BY AN EXTERNAL LIBRARY. The provider's
 * own asset type (`Paper`, `Idea`, `Method`, …) is deliberately NOT added: provider
 * ontology stays provider-owned metadata and never becomes a Palimpsest universal
 * asset ontology. See `src/external_assets/` for the bridge plane.
 */
export const PROJECT_ASSET_KINDS = [
  "DECISION",
  "PRODUCED_ARTIFACT",
  "PROOF_CLAIM",
  "EXPERIMENT",
  "JOURNAL_ENTRY",
  "CAMPAIGN",
  "REASONING_CELL",
  // G10-AE §5/§10 (additive): a project reference to an asset owned elsewhere.
  "EXTERNAL_ASSET",
] as const;
export type ProjectAssetKind = (typeof PROJECT_ASSET_KINDS)[number];

export const ASSOCIATION_KINDS = ["MANUAL", "DERIVED_FROM_WORK", "PUBLISHED"] as const;
export type AssociationKind = (typeof ASSOCIATION_KINDS)[number];

export const PROJECT_ASSET_ASSOCIATION_DOMAIN = "palimpsest.project-workspace.association.v1";
export const PROJECT_ASSET_ASSOCIATION_ID_DOMAIN = "palimpsest.project-workspace.association-id.v1";
export const PROJECT_WORKSPACE_CHAIN_DOMAIN = "palimpsest.project-workspace.event.v1";
export const PROJECT_WORKSPACE_EVENT_ID_DOMAIN = "palimpsest.project-workspace.event-id.v1";

export const PROJECT_WORKSPACE_OPENED = "PROJECT_WORKSPACE_OPENED";
export const ASSET_ASSOCIATED = "ASSET_ASSOCIATED";

export type ProjectWorkspaceStoreErrorKind =
  | "unknown_project"
  | "event_conflict"
  | "recovery_required"
  | "basis_mismatch"
  | "malformed_record"
  | "invalid_registration"
  | "database_busy";

export class ProjectWorkspaceError extends Error {
  constructor(
    readonly kind: ProjectWorkspaceStoreErrorKind | "malformed_artifact" | "unknown_field" | "invalid_value" | "unknown_schema_version" | "unknown_kind",
    message: string,
  ) {
    super(message);
    this.name = "ProjectWorkspaceError";
  }
}

export function pwFail(kind: ProjectWorkspaceError["kind"], message: string): never {
  throw new ProjectWorkspaceError(kind, message);
}

/* ------------------------------------------------------------------ *
 * Strict helpers (fail closed; never an unchecked cast) — shared by the
 * association and journal artifacts.
 * ------------------------------------------------------------------ */

export function pwObject(raw: unknown, what: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    pwFail("malformed_artifact", `${what} must be an object`);
  }
  return raw as Record<string, unknown>;
}

export function pwKeys(object: Record<string, unknown>, allowed: readonly string[], required: readonly string[], what: string): void {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) pwFail("unknown_field", `${what}: unknown field "${key}"`);
  }
  for (const key of required) {
    if (!Object.hasOwn(object, key) || object[key] === undefined) {
      pwFail("malformed_artifact", `${what}: missing required field "${key}"`);
    }
  }
}

export function pwString(value: unknown, what: string): string {
  if (typeof value !== "string" || value.length === 0) pwFail("invalid_value", `${what} must be a non-empty string`);
  return value;
}

export function pwOptionalString(value: unknown, what: string): string | undefined {
  return value === undefined ? undefined : pwString(value, what);
}

export function pwEnum<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    pwFail("unknown_kind", `${what} must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

export function pwStableId(value: unknown, what: string): string {
  if (typeof value !== "string") pwFail("invalid_value", `${what} must be a string`);
  const normalized = normalizeStableIdentifier(value);
  if (!isStableIdentifier(normalized)) pwFail("invalid_value", `${what} must be a stable identifier`);
  return normalized;
}

export function pwDigest(value: unknown, what: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    pwFail("invalid_value", `${what} must be a canonical sha256 digest`);
  }
  return value;
}

export function pwTimestamp(value: unknown, what: string): string {
  const text = pwString(value, what);
  let canonical: string;
  try {
    canonical = canonicalDatetime(text);
  } catch (error) {
    return pwFail("invalid_value", `${what} must be an ISO-8601 datetime: ${error instanceof Error ? error.message : String(error)}`);
  }
  return canonical;
}

/* ------------------------------------------------------------------ *
 * CanonicalAssetRef — an OPAQUE reference to an existing canonical asset.
 * Never the asset content; never a copy of the owner's truth.
 * ------------------------------------------------------------------ */

export interface CanonicalAssetRef {
  readonly kind: string;
  readonly id: string;
  readonly digest?: string | undefined;
}

export interface CanonicalAssetRefInput {
  readonly kind: string;
  readonly id: string;
  readonly digest?: string | undefined;
}

export function parseCanonicalAssetRef(raw: unknown, what = "CanonicalAssetRef"): CanonicalAssetRef {
  const object = pwObject(raw, what);
  pwKeys(object, ["kind", "id", "digest"], ["kind", "id"], what);
  const digest = object.digest === undefined ? undefined : pwDigest(object.digest, `${what}.digest`);
  return Object.freeze({
    kind: pwString(object.kind, `${what}.kind`),
    id: pwString(object.id, `${what}.id`),
    ...(digest === undefined ? {} : { digest }),
  });
}

/* ------------------------------------------------------------------ *
 * ProjectAssetAssociation
 * ------------------------------------------------------------------ */

export interface ProjectAssetAssociation {
  readonly schemaVersion: 1;
  readonly associationId: string;
  readonly projectId: string;
  readonly assetKind: ProjectAssetKind;
  readonly canonicalRef: CanonicalAssetRef;
  readonly associationKind: AssociationKind;
  readonly provenance: string;
  readonly recordedAt: string;
  readonly digest: string;
}

type AssociationContent = Omit<ProjectAssetAssociation, "associationId" | "digest">;

/** Deterministic content-addressed association id (`paa-<32 hex>`). */
export function projectAssetAssociationIdOf(content: AssociationContent): string {
  return `paa-${canonicalDigest({ domain: PROJECT_ASSET_ASSOCIATION_ID_DOMAIN, association: content }).slice(0, 32)}`;
}

/** Canonical digest of the COMPLETE association (id included). */
export function projectAssetAssociationDigestOf(input: Omit<ProjectAssetAssociation, "digest">): string {
  return canonicalDigest({ domain: PROJECT_ASSET_ASSOCIATION_DOMAIN, association: input });
}

/**
 * G10-AE §6/EXT-A03: an `EXTERNAL_ASSET` association IS the project's durable
 * reference to one exact revision owned by an external library, so its
 * `canonicalRef.digest` is MANDATORY. A digest-less external reference would
 * mean "whatever the provider shows now", which §12 forbids
 * (`ExternalLatest != ReferencedRevision`). The bridge port enforces this;
 * enforcing it on the artifact means no writer can bypass it. Every other kind
 * keeps its existing optional-digest semantics unchanged.
 */
function requireExternalAssetDigest(
  assetKind: ProjectAssetKind,
  canonicalRef: CanonicalAssetRef,
  what: string,
): void {
  if (assetKind === "EXTERNAL_ASSET" && canonicalRef.digest === undefined) {
    pwFail(
      "invalid_value",
      `${what}: an EXTERNAL_ASSET reference must carry the exact external contentDigest`,
    );
  }
}

export function materializeProjectAssetAssociation(input: {
  readonly projectId: string;
  readonly assetKind: ProjectAssetKind;
  readonly canonicalRef: CanonicalAssetRefInput;
  readonly associationKind: AssociationKind;
  readonly provenance: string;
  readonly recordedAt: string;
}): ProjectAssetAssociation {
  const content: AssociationContent = {
    schemaVersion: 1,
    projectId: pwStableId(input.projectId, "projectId"),
    assetKind: pwEnum(input.assetKind, PROJECT_ASSET_KINDS, "assetKind"),
    canonicalRef: parseCanonicalAssetRef(input.canonicalRef, "canonicalRef"),
    associationKind: pwEnum(input.associationKind, ASSOCIATION_KINDS, "associationKind"),
    provenance: pwString(input.provenance, "provenance"),
    recordedAt: pwTimestamp(input.recordedAt, "recordedAt"),
  };
  requireExternalAssetDigest(content.assetKind, content.canonicalRef, "canonicalRef");
  const associationId = projectAssetAssociationIdOf(content);
  const withId = { ...content, associationId };
  return Object.freeze({ ...withId, digest: projectAssetAssociationDigestOf(withId) });
}

export function parseProjectAssetAssociation(raw: unknown, what = "ProjectAssetAssociation"): ProjectAssetAssociation {
  const object = pwObject(raw, what);
  pwKeys(
    object,
    ["schemaVersion", "associationId", "projectId", "assetKind", "canonicalRef", "associationKind", "provenance", "recordedAt", "digest"],
    ["schemaVersion", "associationId", "projectId", "assetKind", "canonicalRef", "associationKind", "provenance", "recordedAt", "digest"],
    what,
  );
  if (object.schemaVersion !== 1) pwFail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  const content: AssociationContent = {
    schemaVersion: 1,
    projectId: pwStableId(object.projectId, `${what}.projectId`),
    assetKind: pwEnum(object.assetKind, PROJECT_ASSET_KINDS, `${what}.assetKind`),
    canonicalRef: parseCanonicalAssetRef(object.canonicalRef, `${what}.canonicalRef`),
    associationKind: pwEnum(object.associationKind, ASSOCIATION_KINDS, `${what}.associationKind`),
    provenance: pwString(object.provenance, `${what}.provenance`),
    recordedAt: pwTimestamp(object.recordedAt, `${what}.recordedAt`),
  };
  requireExternalAssetDigest(content.assetKind, content.canonicalRef, `${what}.canonicalRef`);
  const associationId = pwString(object.associationId, `${what}.associationId`);
  if (projectAssetAssociationIdOf(content) !== associationId) {
    pwFail("invalid_value", `${what}.associationId does not match its content`);
  }
  const digest = pwDigest(object.digest, `${what}.digest`);
  const withId = { ...content, associationId };
  if (projectAssetAssociationDigestOf(withId) !== digest) pwFail("invalid_value", `${what}.digest does not match its content`);
  return Object.freeze({ ...withId, digest });
}

/* ------------------------------------------------------------------ *
 * Chain, events and payload parsers
 * ------------------------------------------------------------------ */

export type ProjectWorkspaceEventType = typeof PROJECT_WORKSPACE_OPENED | typeof ASSET_ASSOCIATED;

export interface ProjectWorkspaceEventDraft {
  readonly eventId: string;
  readonly type: ProjectWorkspaceEventType;
  readonly payload: unknown;
}

export interface ProjectWorkspaceEvent<T extends ProjectWorkspaceEventType = ProjectWorkspaceEventType> {
  readonly eventId: string;
  readonly seq: number;
  readonly scopeId: string;
  readonly type: T;
  readonly payload: unknown;
  readonly chainDigest: string;
}

/** The FULL append-only project history basis — the CAS guard for `appendAtomic`. */
export interface ProjectWorkspaceBasis {
  readonly scopeId: string;
  readonly throughSeq: number;
  readonly chainDigest: string;
}

export type ProjectWorkspaceEventPayloadParser = (payload: unknown) => unknown;
export type ProjectWorkspaceEventParsers = Readonly<Record<string, ProjectWorkspaceEventPayloadParser>>;

function payloadKey(type: string, payload: unknown): string {
  return canonicalDigest({ domain: PROJECT_WORKSPACE_EVENT_ID_DOMAIN, type, payload });
}

/**
 * Wrap an artifact parser in the event-payload envelope: EXACTLY one top-level
 * key is allowed (the artifact name), and it is required.
 */
function singleKeyParser(key: string, parse: (raw: unknown, what?: string) => unknown): ProjectWorkspaceEventPayloadParser {
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

function parseWorkspaceOpened(raw: unknown, what = PROJECT_WORKSPACE_OPENED): { readonly projectId: string } {
  const object = pwObject(raw, what);
  pwKeys(object, ["projectId"], ["projectId"], what);
  return Object.freeze({ projectId: pwStableId(object.projectId, `${what}.projectId`) });
}

export const PROJECT_WORKSPACE_EVENT_PARSERS: ProjectWorkspaceEventParsers = Object.freeze({
  [PROJECT_WORKSPACE_OPENED]: (payload: unknown) => parseWorkspaceOpened(payload, PROJECT_WORKSPACE_OPENED),
  [ASSET_ASSOCIATED]: singleKeyParser("association", parseProjectAssetAssociation),
});

export function projectWorkspaceChainDigest(input: {
  readonly scopeId: string;
  readonly seq: number;
  readonly eventId: string;
  readonly type: string;
  readonly payload: unknown;
  readonly previousChainDigest: string | null;
}): string {
  return canonicalDigest({
    domain: PROJECT_WORKSPACE_CHAIN_DOMAIN,
    scopeId: input.scopeId,
    seq: input.seq,
    eventId: input.eventId,
    type: input.type,
    payload: input.payload,
    previous: input.previousChainDigest,
  });
}

/** Deterministic content-addressed event id — replays are naturally idempotent. */
export function projectWorkspaceEventIdOf(type: ProjectWorkspaceEventType, scopeId: string, payload: unknown): string {
  return `pwe-${canonicalDigest({ domain: PROJECT_WORKSPACE_EVENT_ID_DOMAIN, type, scopeId, payload }).slice(0, 32)}`;
}

/** The `PROJECT_WORKSPACE_OPENED` definition draft for a project scope. */
export function projectWorkspaceOpenedEvent(projectId: string): ProjectWorkspaceEventDraft {
  const payload = Object.freeze({ projectId: pwStableId(projectId, "projectId") });
  return Object.freeze({
    eventId: projectWorkspaceEventIdOf(PROJECT_WORKSPACE_OPENED, payload.projectId, payload),
    type: PROJECT_WORKSPACE_OPENED,
    payload,
  });
}

/** The `ASSET_ASSOCIATED` draft for one materialized association. */
export function assetAssociatedEvent(association: ProjectAssetAssociation): ProjectWorkspaceEventDraft {
  const payload = Object.freeze({ association });
  return Object.freeze({
    eventId: projectWorkspaceEventIdOf(ASSET_ASSOCIATED, association.projectId, payload),
    type: ASSET_ASSOCIATED,
    payload,
  });
}

/* ------------------------------------------------------------------ *
 * SqliteProjectAssetAssociationStore — append-only chain PER PROJECT
 * ------------------------------------------------------------------ */

export interface ProjectAssetAssociationStore {
  appendAtomic(input: {
    readonly expectedBasis: ProjectWorkspaceBasis;
    readonly events: readonly ProjectWorkspaceEventDraft[];
  }): Promise<readonly ProjectWorkspaceEvent[]>;
  basis(projectId: string): Promise<ProjectWorkspaceBasis | undefined>;
  replay(projectId: string): Promise<readonly ProjectWorkspaceEvent[]>;
  /** Distinct project scope ids. */
  projects(): Promise<readonly string[]>;
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
  readonly type: ProjectWorkspaceEventType;
  readonly payload: unknown;
}

function isBusyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /SQLITE_BUSY|SQLITE_LOCKED|database is locked|database table is locked/i.test(message);
}

export class SqliteProjectAssetAssociationStore implements ProjectAssetAssociationStore {
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
      "CREATE TABLE IF NOT EXISTS project_asset_association_events (" +
        "scope_id TEXT NOT NULL, seq INTEGER NOT NULL, event_id TEXT NOT NULL UNIQUE, type TEXT NOT NULL, " +
        "payload_json TEXT NOT NULL, chain_digest TEXT NOT NULL, PRIMARY KEY (scope_id, seq))",
    );
    this.#selectEvents = this.#database.prepare(
      "SELECT scope_id, seq, event_id, type, payload_json, chain_digest FROM project_asset_association_events WHERE scope_id = ? ORDER BY seq",
    );
    this.#selectScopes = this.#database.prepare("SELECT DISTINCT scope_id FROM project_asset_association_events ORDER BY scope_id");
    this.#insertEvent = this.#database.prepare(
      "INSERT INTO project_asset_association_events (scope_id, seq, event_id, type, payload_json, chain_digest) VALUES (?, ?, ?, ?, ?, ?)",
    );
    this.#parsers = PROJECT_WORKSPACE_EVENT_PARSERS;
  }

  #parse(row: EventRow, previous: ProjectWorkspaceEvent | undefined): ProjectWorkspaceEvent {
    const parser = this.#parsers[row.type];
    if (parser === undefined) pwFail("malformed_record", `project workspace event "${row.event_id}" has unknown type "${row.type}"`);
    let payload: unknown;
    try {
      payload = parser(JSON.parse(row.payload_json));
    } catch (error) {
      pwFail("malformed_record", `project workspace event "${row.event_id}" payload is malformed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const expected = projectWorkspaceChainDigest({
      scopeId: row.scope_id,
      seq: row.seq,
      eventId: row.event_id,
      type: row.type,
      payload,
      previousChainDigest: previous?.chainDigest ?? null,
    });
    if (expected !== row.chain_digest) {
      pwFail("malformed_record", `project workspace chain is corrupt at "${row.scope_id}" seq ${row.seq}`);
    }
    return Object.freeze({
      eventId: row.event_id,
      seq: row.seq,
      scopeId: row.scope_id,
      type: row.type as ProjectWorkspaceEventType,
      payload,
      chainDigest: row.chain_digest,
    });
  }

  #readAll(scopeId: string): ProjectWorkspaceEvent[] {
    const rows = this.#selectEvents.all(scopeId) as unknown as EventRow[];
    const events: ProjectWorkspaceEvent[] = [];
    let previous: ProjectWorkspaceEvent | undefined;
    let expectedSeq = 1;
    for (const row of rows) {
      if (row.seq !== expectedSeq) pwFail("malformed_record", `scope "${scopeId}" event sequence has a gap at ${row.seq}`);
      const event = this.#parse(row, previous);
      if (event.seq === 1) {
        if (event.type !== PROJECT_WORKSPACE_OPENED) {
          pwFail("malformed_record", `scope "${scopeId}" must be defined by a ${PROJECT_WORKSPACE_OPENED} event`);
        }
        const opened = event.payload as { readonly projectId: string };
        if (opened.projectId !== scopeId) {
          pwFail("malformed_record", `scope "${scopeId}" was opened for project "${opened.projectId}"`);
        }
      } else if (event.type === PROJECT_WORKSPACE_OPENED) {
        pwFail("malformed_record", `scope "${scopeId}" carries a ${PROJECT_WORKSPACE_OPENED} event after its definition`);
      } else {
        const associated = event.payload as { readonly association: ProjectAssetAssociation };
        if (associated.association.projectId !== scopeId) {
          pwFail("malformed_record", `scope "${scopeId}" carries an association for project "${associated.association.projectId}"`);
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
      throw new ProjectWorkspaceError("database_busy", `project workspace store write contention (bounded wait exhausted): ${error instanceof Error ? error.message : String(error)}`);
    }
    throw new ProjectWorkspaceError("invalid_registration", `project workspace store write failed: ${error instanceof Error ? error.message : String(error)}`);
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
    readonly expectedBasis: ProjectWorkspaceBasis;
    readonly events: readonly ProjectWorkspaceEventDraft[];
  }): Promise<readonly ProjectWorkspaceEvent[]> {
    const scopeId = input.expectedBasis.scopeId;
    if (typeof scopeId !== "string" || scopeId.length === 0) pwFail("invalid_registration", "expected basis scope must be a non-empty string");
    if (input.events.length === 0) pwFail("invalid_registration", "appendAtomic requires at least one event");
    const prepared: PreparedEntry[] = input.events.map((event) => {
      const parser = this.#parsers[event.type];
      if (parser === undefined) pwFail("invalid_registration", `unknown project workspace event type "${event.type}"`);
      let payload: unknown;
      try {
        payload = parser(event.payload);
      } catch (error) {
        pwFail("invalid_registration", `project workspace event "${event.eventId}" payload is invalid: ${error instanceof Error ? error.message : String(error)}`);
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
        if (row.type !== entry.type || payloadKey(row.type, row.payload) !== payloadKey(entry.type, entry.payload)) conflicting = true;
      }
      if (conflicting) pwFail("event_conflict", "a requested eventId already exists with different content");
      if (present === prepared.length) return Object.freeze(prepared.map((entry) => byId.get(entry.eventId)!));
      if (present > 0) pwFail("recovery_required", "project workspace atomic batch is partially present");
      const tail = stored[stored.length - 1];
      if ((tail?.seq ?? 0) !== input.expectedBasis.throughSeq || (tail?.chainDigest ?? "") !== input.expectedBasis.chainDigest) {
        pwFail("basis_mismatch", `scope "${scopeId}" basis is seq ${tail?.seq ?? 0}, expected ${input.expectedBasis.throughSeq}`);
      }

      const first = prepared[0]!;
      let startIndex = 0;
      if (stored.length === 0) {
        if (first.type !== PROJECT_WORKSPACE_OPENED) {
          pwFail("invalid_registration", `scope "${scopeId}" must be defined by a ${PROJECT_WORKSPACE_OPENED} event`);
        }
        const opened = first.payload as { readonly projectId: string };
        if (opened.projectId !== scopeId) {
          pwFail("invalid_registration", `basis scope "${scopeId}" does not match the opened project "${opened.projectId}"`);
        }
        startIndex = 1;
      }
      for (let index = startIndex; index < prepared.length; index += 1) {
        const entry = prepared[index]!;
        if (entry.type === PROJECT_WORKSPACE_OPENED) {
          pwFail("invalid_registration", `a project workspace may only be opened by the first event of an empty scope`);
        }
        const association = (entry.payload as { readonly association: ProjectAssetAssociation }).association;
        if (association.projectId !== scopeId) {
          pwFail("invalid_registration", `association "${association.associationId}" belongs to project "${association.projectId}", not scope "${scopeId}"`);
        }
      }

      const appended: ProjectWorkspaceEvent[] = [];
      let seq = input.expectedBasis.throughSeq;
      let previous = tail?.chainDigest ?? null;
      for (const entry of prepared) {
        seq += 1;
        const chainDigest = projectWorkspaceChainDigest({ scopeId, seq, eventId: entry.eventId, type: entry.type, payload: entry.payload, previousChainDigest: previous });
        this.#insertEvent.run(scopeId, seq, entry.eventId, entry.type, JSON.stringify(entry.payload), chainDigest);
        previous = chainDigest;
        appended.push(Object.freeze({ eventId: entry.eventId, seq, scopeId, type: entry.type, payload: entry.payload, chainDigest }));
      }
      return Object.freeze(appended);
    });
  }

  async basis(projectId: string): Promise<ProjectWorkspaceBasis | undefined> {
    const events = this.#readAll(projectId);
    const tail = events[events.length - 1];
    if (tail === undefined) return undefined;
    return Object.freeze({ scopeId: projectId, throughSeq: tail.seq, chainDigest: tail.chainDigest });
  }

  async replay(projectId: string): Promise<readonly ProjectWorkspaceEvent[]> {
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

/** The canonical default project-asset association store path (Palimpsest-owned). */
export function defaultProjectAssetAssociationPath(): string {
  const configured = process.env.DSH_HOME?.trim();
  const dshHome = configured === undefined || configured.length === 0 ? join(homedir(), ".dsh") : configured;
  return join(dshHome, "palimpsest", "project-workspace.sqlite");
}

/** Read one project's associated assets out of a replayed chain (derived, read-only). */
export function associatedAssetsOf(events: readonly ProjectWorkspaceEvent[]): readonly ProjectAssetAssociation[] {
  const associations: ProjectAssetAssociation[] = [];
  for (const event of events) {
    if (event.type === ASSET_ASSOCIATED) {
      associations.push((event.payload as { readonly association: ProjectAssetAssociation }).association);
    }
  }
  return Object.freeze(associations);
}
