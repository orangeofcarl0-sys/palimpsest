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

export type OrganizationStoreErrorKind =
  | "invalid_registration"
  | "lineage_conflict"
  | "head_mismatch"
  | "artifact_conflict"
  | "malformed_record";

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

export interface OrganizationRevisionRegistration {
  readonly definition: OrganizationDefinition;
  /** Explicit parent ref; null ONLY for the genesis revision (revision 0). */
  readonly parent: OrganizationDefinitionRef | null;
  /** The head revision the caller believes is current; null ONLY for genesis. */
  readonly expectedHeadRevision: number | null;
}

export interface OrganizationStore {
  /** Register one immutable revision under the explicit lineage rules (§67). */
  registerRevision(input: OrganizationRevisionRegistration): Promise<void>;
  get(ref: OrganizationDefinitionRef): Promise<OrganizationDefinition | undefined>;
  head(organizationDefinitionId: string): Promise<OrganizationDefinitionRef | undefined>;
  current(organizationDefinitionId: string): Promise<OrganizationDefinition | undefined>;
  listRevisions(organizationDefinitionId: string): Promise<readonly OrganizationDefinition[]>;
  lineage(organizationDefinitionId: string): Promise<readonly OrganizationLineageRecord[]>;
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
        "PRIMARY KEY (organization_definition_id, revision))",
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
  }

  #headRow(organizationDefinitionId: string): RevisionRow | undefined {
    return this.#selectHead.get(organizationDefinitionId) as RevisionRow | undefined;
  }

  async registerRevision(input: OrganizationRevisionRegistration): Promise<void> {
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

    try {
      this.#database.exec("BEGIN IMMEDIATE");

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
        this.#database.exec("COMMIT");
        return;
      }

      const head = this.#headRow(orgId);
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
