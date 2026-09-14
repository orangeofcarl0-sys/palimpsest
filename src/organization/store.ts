/**
 * G10-F2 Organization lineage store (§66–§69).
 *
 * ONE canonical Palimpsest-owned repository of IMMUTABLE OrganizationDefinition
 * revisions. It owns organization identity + immutable revisions ONLY; it does
 * NOT own collaboration history, Work, PersistentPoint, effect operations, or
 * Institution epochs (§66).
 *
 * Lineage rules (§67):
 *   - a new revision requires the SAME organizationDefinitionId;
 *   - revision must be current-head + 1 and strictly increasing;
 *   - an EXPLICIT parent OrganizationRef is required (null only at genesis);
 *   - the caller passes the expected current head — a stale head fails closed;
 *   - no parallel silent lineage forks under one organization id: a fork is a
 *     NEW organization id.
 *
 * Immutability (§68): revisions are append-only; there is no UPDATE path and
 * no delete API. A byte-identical re-registration is idempotent; a conflicting
 * artifact under the same (id, revision) fails closed.
 */

import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import type { OrganizationDefinition, OrganizationDefinitionRef } from "./definition.js";
import { organizationRefOf, organizationRefsEqual, parseOrganizationDefinition } from "./definition.js";
import { isStableIdentifier, normalizeStableIdentifier } from "../schema/identifier.js";

export type OrganizationStoreErrorKind =
  | "invalid_registration"
  | "lineage_conflict"
  | "head_mismatch"
  | "artifact_conflict"
  | "malformed_record"
  | "retired_lineage";

export class OrganizationStoreError extends Error {
  constructor(
    readonly kind: OrganizationStoreErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "OrganizationStoreError";
  }
}

export interface OrganizationLineageRecord {
  readonly definition: OrganizationDefinition;
  readonly parent: OrganizationDefinitionRef | null;
}

/* ------------------------------------------------------------------ *
 * Strict-parse helpers (G10-M retirement artifacts)
 * ------------------------------------------------------------------ */

function fail(message: string): never {
  throw new OrganizationStoreError("invalid_registration", message);
}

function asObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${what} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(object: Record<string, unknown>, keys: readonly string[], what: string): void {
  for (const key of Object.keys(object)) if (!keys.includes(key)) fail(`unknown ${what} field "${key}"`);
  for (const key of keys) if (!Object.hasOwn(object, key)) fail(`${what}: field "${key}" is required`);
}

function stableId(value: unknown, what: string): string {
  if (typeof value !== "string") fail(`${what} must be a string`);
  const normalized = normalizeStableIdentifier(value);
  if (!isStableIdentifier(normalized)) fail(`${what} must be a stable identifier`);
  return normalized;
}

function requireNonEmpty(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") fail(`${what} must be a non-empty string`);
  return value;
}

export interface OrganizationRevisionRegistration {
  readonly definition: OrganizationDefinition;
  /** Explicit parent ref; null ONLY for the genesis revision (revision 0). */
  readonly parent: OrganizationDefinitionRef | null;
  /** The head revision the caller believes is current; null ONLY for genesis. */
  readonly expectedHeadRevision: number | null;
}

/** G10-M §42/§44: ACTIVE | RETIRED is canonical Organization lifecycle truth. */
export type OrganizationLifecycle = "ACTIVE" | "RETIRED";

/**
 * G10-M: an append-only, one-way (in v1) retirement record. It is lifecycle truth ONLY —
 * it never deletes or rewrites a revision.
 */
export interface OrganizationRetirement {
  readonly schemaVersion: 1;
  readonly organizationDefinitionId: string;
  readonly head: OrganizationDefinitionRef;
  readonly proposalDigest: string;
  readonly reason: string;
}

export function parseOrganizationRetirement(raw: unknown, what = "OrganizationRetirement"): OrganizationRetirement {
  const object = asObject(raw, what);
  exactKeys(object, ["schemaVersion", "organizationDefinitionId", "head", "proposalDigest", "reason"], what);
  if (object.schemaVersion !== 1) fail(`${what}.schemaVersion must be 1`);
  const head = asObject(object.head, `${what}.head`);
  exactKeys(head, ["organizationDefinitionId", "revision", "digest"], `${what}.head`);
  const revision = head.revision;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) fail(`${what}.head.revision must be a non-negative integer`);
  return Object.freeze({
    schemaVersion: 1 as const,
    organizationDefinitionId: stableId(object.organizationDefinitionId, `${what}.organizationDefinitionId`),
    head: Object.freeze({ organizationDefinitionId: stableId(head.organizationDefinitionId, `${what}.head.organizationDefinitionId`), revision, digest: requireNonEmpty(head.digest, `${what}.head.digest`) }),
    proposalDigest: requireNonEmpty(object.proposalDigest, `${what}.proposalDigest`),
    reason: requireNonEmpty(object.reason, `${what}.reason`),
  });
}

export interface OrganizationStore {
  /** Register one immutable revision under the explicit lineage rules (§67). */
  registerRevision(input: OrganizationRevisionRegistration): Promise<void>;
  /** F3 §100: register several successor revisions as ONE atomic transition. */
  registerRevisions(inputs: readonly OrganizationRevisionRegistration[]): Promise<void>;
  get(ref: OrganizationDefinitionRef): Promise<OrganizationDefinition | undefined>;
  head(organizationDefinitionId: string): Promise<OrganizationDefinitionRef | undefined>;
  current(organizationDefinitionId: string): Promise<OrganizationDefinition | undefined>;
  listRevisions(organizationDefinitionId: string): Promise<readonly OrganizationDefinition[]>;
  lineage(organizationDefinitionId: string): Promise<readonly OrganizationLineageRecord[]>;
  /** G10-M: ACTIVE | RETIRED, or undefined when the organization does not exist. */
  lifecycle(organizationDefinitionId: string): Promise<OrganizationLifecycle | undefined>;
  /** G10-M: append-only one-way retirement. Idempotent on an identical retry. */
  retire(input: { readonly organizationDefinitionId: string; readonly head: OrganizationDefinitionRef; readonly proposalDigest: string; readonly reason: string }): Promise<OrganizationRetirement>;
  retirements(): Promise<readonly OrganizationRetirement[]>;
}

type Statement = ReturnType<DatabaseSync["prepare"]>;

interface RevisionRow {
  organization_definition_id: string;
  revision: number;
  artifact_json: string;
  parent_revision: number | null;
  parent_digest: string | null;
}

function canonicalArtifactJson(definition: OrganizationDefinition): string {
  const canonical = parseOrganizationDefinition(JSON.parse(JSON.stringify(definition)));
  return JSON.stringify(canonical);
}

function parseRow(row: RevisionRow): OrganizationLineageRecord {
  let definition: OrganizationDefinition;
  try {
    definition = parseOrganizationDefinition(JSON.parse(row.artifact_json));
  } catch (error) {
    throw new OrganizationStoreError(
      "malformed_record",
      `organization store contains a malformed revision record: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const parent =
    row.parent_revision === null
      ? null
      : Object.freeze({
          organizationDefinitionId: row.organization_definition_id,
          revision: row.parent_revision,
          digest: row.parent_digest ?? "",
        });
  return Object.freeze({ definition, parent });
}

export class SqliteOrganizationStore implements OrganizationStore {
  readonly #database: DatabaseSync;
  readonly #selectOne: Statement;
  readonly #selectHead: Statement;
  readonly #selectAll: Statement;
  readonly #insert: Statement;
  readonly #selectRetirement: Statement;
  readonly #selectRetirements: Statement;
  readonly #insertRetirement: Statement;

  constructor(databasePath: string, options?: { readonly busyTimeoutMs?: number }) {
    if (databasePath !== ":memory:") {
      mkdirSync(dirname(databasePath), { recursive: true });
    }
    this.#database = new DatabaseSync(databasePath === ":memory:" ? ":memory:" : join(databasePath));
    this.#database.exec(`PRAGMA busy_timeout = ${options?.busyTimeoutMs ?? 5000}`);
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS organization_revisions (" +
        "organization_definition_id TEXT NOT NULL, " +
        "revision INTEGER NOT NULL, " +
        "artifact_json TEXT NOT NULL, " +
        "parent_revision INTEGER, " +
        "parent_digest TEXT, " +
        "PRIMARY KEY (organization_definition_id, revision));" +
        // G10-M: append-only, one-way lifecycle truth. Never deletes a revision.
        "CREATE TABLE IF NOT EXISTS organization_retirements (" +
        "organization_definition_id TEXT PRIMARY KEY, artifact_json TEXT NOT NULL)",
    );
    this.#selectOne = this.#database.prepare(
      "SELECT organization_definition_id, revision, artifact_json, parent_revision, parent_digest " +
        "FROM organization_revisions WHERE organization_definition_id = ? AND revision = ?",
    );
    this.#selectHead = this.#database.prepare(
      "SELECT organization_definition_id, revision, artifact_json, parent_revision, parent_digest " +
        "FROM organization_revisions WHERE organization_definition_id = ? ORDER BY revision DESC LIMIT 1",
    );
    this.#selectAll = this.#database.prepare(
      "SELECT organization_definition_id, revision, artifact_json, parent_revision, parent_digest " +
        "FROM organization_revisions WHERE organization_definition_id = ? ORDER BY revision",
    );
    this.#insert = this.#database.prepare(
      "INSERT INTO organization_revisions " +
        "(organization_definition_id, revision, artifact_json, parent_revision, parent_digest) VALUES (?, ?, ?, ?, ?)",
    );
    this.#selectRetirement = this.#database.prepare("SELECT artifact_json FROM organization_retirements WHERE organization_definition_id = ?");
    this.#selectRetirements = this.#database.prepare("SELECT artifact_json FROM organization_retirements ORDER BY organization_definition_id");
    this.#insertRetirement = this.#database.prepare("INSERT INTO organization_retirements (organization_definition_id, artifact_json) VALUES (?, ?)");
  }

  #headRow(organizationDefinitionId: string): RevisionRow | undefined {
    return this.#selectHead.get(organizationDefinitionId) as RevisionRow | undefined;
  }

  /**
   * Apply one registration INSIDE an open transaction (no BEGIN/COMMIT here).
   * F3 transformation activation registers several successor revisions as one
   * atomic batch, so transaction control lives with the caller.
   */
  #applyRegistration(input: OrganizationRevisionRegistration): void {
    const definition = parseOrganizationDefinition(JSON.parse(JSON.stringify(input.definition)));
    const orgId = definition.organizationDefinitionId;
    const parent = input.parent;
    const artifactJson = canonicalArtifactJson(definition);
    const genesis = input.expectedHeadRevision === null;

    if (genesis) {
      if (input.parent !== null) {
        throw new OrganizationStoreError("invalid_registration", "genesis revision must not declare a parent");
      }
      if (definition.revision !== 0) {
        throw new OrganizationStoreError("invalid_registration", "genesis revision must be 0");
      }
    } else {
      if (input.parent === null) {
        throw new OrganizationStoreError("invalid_registration", "a non-genesis revision requires an explicit parent");
      }
      if (input.parent.organizationDefinitionId !== orgId) {
        throw new OrganizationStoreError("lineage_conflict", "parent organization id does not match the revision");
      }
    }

    // Byte-identical re-registration is idempotent at ANY revision (including
    // genesis) — checked BEFORE lineage rules so a retry converges even after
    // the head has advanced.
    const existing = this.#selectOne.get(orgId, definition.revision) as RevisionRow | undefined;
    if (existing !== undefined) {
      const sameParent =
        (existing.parent_revision ?? null) === (input.parent?.revision ?? null) &&
        (existing.parent_digest ?? null) === (input.parent?.digest ?? null);
      if (existing.artifact_json !== artifactJson || !sameParent) {
        throw new OrganizationStoreError(
          "artifact_conflict",
          `organization "${orgId}" revision ${definition.revision} already exists with different content`,
        );
      }
      return;
    }

    const head = this.#headRow(orgId);
    // G10-M §46: a RETIRED lineage can never advance. Enforced at the STORE, not only
    // in a service. A byte-identical retry of an already-registered revision above is
    // still idempotent; anything that would add a revision fails closed.
    if (this.#selectRetirement.get(orgId) !== undefined) {
      throw new OrganizationStoreError("retired_lineage", `organization "${orgId}" is RETIRED — no revision may be registered`);
    }
    if (genesis) {
      if (head !== undefined) {
        throw new OrganizationStoreError(
          "lineage_conflict",
          `organization "${orgId}" already has revisions — genesis refused`,
        );
      }
    } else {
      if (head === undefined) {
        throw new OrganizationStoreError("lineage_conflict", `organization "${orgId}" has no revisions to extend`);
      }
      if (head.revision !== input.expectedHeadRevision) {
        throw new OrganizationStoreError(
          "head_mismatch",
          `organization "${orgId}" head is ${head.revision}, expected ${input.expectedHeadRevision}`,
        );
      }
      if (definition.revision !== head.revision + 1) {
        throw new OrganizationStoreError(
          "invalid_registration",
          `revision ${definition.revision} is not current-head+1 (${head.revision + 1})`,
        );
      }
      const headRef = organizationRefOf(parseOrganizationDefinition(JSON.parse(head.artifact_json)));
      if (!organizationRefsEqual(headRef, parent!)) {
        throw new OrganizationStoreError(
          "lineage_conflict",
          "declared parent does not equal the current head (no silent lineage fork)",
        );
      }
    }

    this.#insert.run(
      orgId,
      definition.revision,
      artifactJson,
      input.parent?.revision ?? null,
      input.parent?.digest ?? null,
    );
  }

  #transactional(work: () => void): void {
    try {
      this.#database.exec("BEGIN IMMEDIATE");
      work();
      this.#database.exec("COMMIT");
    } catch (error) {
      try {
        this.#database.exec("ROLLBACK");
      } catch {
        // no active transaction
      }
      if (error instanceof OrganizationStoreError) throw error;
      throw new OrganizationStoreError(
        "invalid_registration",
        `failed to register organization revision: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async registerRevision(input: OrganizationRevisionRegistration): Promise<void> {
    this.#transactional(() => this.#applyRegistration(input));
  }

  /**
   * F3 §100: register several successor revisions as ONE atomic transition —
   * all commit or none. Used by SPLIT/MERGE activation, where a partial commit
   * would leave one source lineage advanced and another not.
   */
  async registerRevisions(inputs: readonly OrganizationRevisionRegistration[]): Promise<void> {
    if (inputs.length === 0) return;
    this.#transactional(() => {
      for (const input of inputs) this.#applyRegistration(input);
    });
  }

  async get(ref: OrganizationDefinitionRef): Promise<OrganizationDefinition | undefined> {
    const row = this.#selectOne.get(ref.organizationDefinitionId, ref.revision) as RevisionRow | undefined;
    if (row === undefined) return undefined;
    return parseRow(row).definition;
  }

  async head(organizationDefinitionId: string): Promise<OrganizationDefinitionRef | undefined> {
    const row = this.#headRow(organizationDefinitionId);
    return row === undefined ? undefined : organizationRefOf(parseRow(row).definition);
  }

  async current(organizationDefinitionId: string): Promise<OrganizationDefinition | undefined> {
    const row = this.#headRow(organizationDefinitionId);
    return row === undefined ? undefined : parseRow(row).definition;
  }

  async listRevisions(organizationDefinitionId: string): Promise<readonly OrganizationDefinition[]> {
    const rows = this.#selectAll.all(organizationDefinitionId) as unknown as RevisionRow[];
    return Object.freeze(rows.map((row) => parseRow(row).definition));
  }

  async lineage(organizationDefinitionId: string): Promise<readonly OrganizationLineageRecord[]> {
    const rows = this.#selectAll.all(organizationDefinitionId) as unknown as RevisionRow[];
    return Object.freeze(rows.map(parseRow));
  }

  async lifecycle(organizationDefinitionId: string): Promise<OrganizationLifecycle | undefined> {
    if (this.#headRow(organizationDefinitionId) === undefined) return undefined;
    return this.#selectRetirement.get(organizationDefinitionId) === undefined ? "ACTIVE" : "RETIRED";
  }

  async retire(input: { readonly organizationDefinitionId: string; readonly head: OrganizationDefinitionRef; readonly proposalDigest: string; readonly reason: string }): Promise<OrganizationRetirement> {
    const headRow = this.#headRow(input.organizationDefinitionId);
    if (headRow === undefined) throw new OrganizationStoreError("invalid_registration", `organization "${input.organizationDefinitionId}" does not exist`);
    const headRef = organizationRefOf(parseOrganizationDefinition(JSON.parse(headRow.artifact_json)));
    if (!organizationRefsEqual(headRef, input.head)) {
      throw new OrganizationStoreError("head_mismatch", `organization "${input.organizationDefinitionId}" head does not match the retirement target`);
    }
    const retirement = parseOrganizationRetirement({
      schemaVersion: 1,
      organizationDefinitionId: input.organizationDefinitionId,
      head: input.head,
      proposalDigest: input.proposalDigest,
      reason: input.reason,
    });
    const json = JSON.stringify(retirement);
    this.#transactional(() => {
      const existing = this.#selectRetirement.get(retirement.organizationDefinitionId) as { artifact_json: string } | undefined;
      if (existing !== undefined) {
        if (existing.artifact_json !== json) {
          throw new OrganizationStoreError("artifact_conflict", `organization "${retirement.organizationDefinitionId}" is already RETIRED with a different retirement record`);
        }
        return;
      }
      this.#insertRetirement.run(retirement.organizationDefinitionId, json);
    });
    return retirement;
  }

  async retirements(): Promise<readonly OrganizationRetirement[]> {
    const rows = this.#selectRetirements.all() as unknown as { artifact_json: string }[];
    return Object.freeze(
      rows.map((row) => {
        try {
          return parseOrganizationRetirement(JSON.parse(row.artifact_json));
        } catch (error) {
          throw new OrganizationStoreError("malformed_record", `organization store contains a malformed retirement record: ${error instanceof Error ? error.message : String(error)}`);
        }
      }),
    );
  }

  close(): void {
    this.#database.close();
  }
}

/** The canonical default organization store path (Palimpsest-owned). */
export function defaultOrganizationPath(): string {
  const configured = process.env.DSH_HOME?.trim();
  const dshHome = configured === undefined || configured.length === 0 ? join(homedir(), ".dsh") : configured;
  return join(dshHome, "palimpsest", "organization.sqlite");
}
