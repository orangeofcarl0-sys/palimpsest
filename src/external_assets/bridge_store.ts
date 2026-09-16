/**
 * G10-AE §17/§18 — `SqliteExternalAssetBridgeStore`: the narrow, append-only
 * bridge history.
 *
 *   BridgeReceipt != Truth        BridgeReceipt != AssetContent
 *   BridgeReceipt != Ownership    BridgeReceipt != ProjectContext
 *
 * It owns OPERATION LINEAGE/RECEIPTS ONLY: "external X was imported into local
 * Journal Y" and "local Journal Y was published as external X". It stores
 * REFS and DIGESTS, never asset content — no titles, no bodies, no summaries, no
 * provider credentials. Reference-only durability stays in
 * `ProjectAssetAssociation` and is deliberately NOT duplicated here.
 *
 * Crash honesty mirrors `src/project_operating/activity_store.ts`: a per-project
 * `sequence`, `previousRecordDigest`, a recomputable `recordDigest` and
 * `verifyChain`. The family pairs are the two-phase protocol: a `*_PREPARED`
 * receipt is written BEFORE the local terminal write and a `*_COMMITTED` receipt
 * after it, so a crash in between is detectable and the retry is idempotent.
 *
 * The import operation id is DERIVED from (project id, external stable ref,
 * target Journal kind, exact text digest, provider definition digest), so a
 * retry after a crash maps to the SAME operation and can never duplicate the
 * Journal import.
 */

import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { canonicalDigest } from "../schema/canonical.js";

import {
  eaDigest,
  eaEnum,
  eaFail,
  eaKeys,
  eaObject,
  eaStableId,
  eaString,
  eaTimestamp,
} from "./refs.js";

export const EXTERNAL_ASSET_BRIDGE_RECORD_DOMAIN = "palimpsest.external-assets.bridge-record.v1";
export const EXTERNAL_ASSET_BRIDGE_RECORD_ID_DOMAIN =
  "palimpsest.external-assets.bridge-record-id.v1";
export const EXTERNAL_ASSET_BRIDGE_GENESIS = "0".repeat(64);

export const EXTERNAL_ASSET_BRIDGE_FAMILIES = [
  "EXTERNAL_IMPORT_PREPARED",
  "EXTERNAL_IMPORT_COMMITTED",
  "EXTERNAL_PUBLICATION_PREPARED",
  "EXTERNAL_PUBLICATION_COMMITTED",
  "EXTERNAL_PUBLICATION_FAILED",
] as const;
export type ExternalAssetBridgeFamily = (typeof EXTERNAL_ASSET_BRIDGE_FAMILIES)[number];

export interface ExternalAssetBridgeRecord {
  readonly schemaVersion: 1;
  readonly recordId: string;
  readonly projectId: string;
  readonly family: ExternalAssetBridgeFamily;
  readonly operationId: string;
  readonly providerId: string;
  readonly providerDefinitionDigest: string;
  /** Publication families only: the idempotency/reconcile key of the outbound write. */
  readonly publicationId?: string | undefined;
  readonly targetAssetType?: string | undefined;
  readonly payloadDigest?: string | undefined;
  readonly previewDigest?: string | undefined;
  /** The LOCAL journal side of the operation — a ref plus an exact digest. */
  readonly journalEntryId?: string | undefined;
  readonly journalEntryDigest?: string | undefined;
  /** Import only: the caller-selected target Journal kind. */
  readonly journalKind?: string | undefined;
  /** The EXTERNAL side of the operation, once known. Refs and digests only. */
  readonly externalAssetId?: string | undefined;
  readonly externalContentDigest?: string | undefined;
  readonly externalRefDigest?: string | undefined;
  readonly externalRevisionLabel?: string | null | undefined;
  /** The candidate/preview digest that was explicitly prepared. */
  readonly candidateDigest?: string | undefined;
  /** Failure families only: a typed, non-content reason. */
  readonly reason?: string | undefined;
  readonly recordedAt: string;
  readonly sequence: number;
  readonly previousRecordDigest: string;
  readonly recordDigest: string;
}

export interface ExternalAssetBridgeRecordInput {
  readonly projectId: string;
  readonly family: ExternalAssetBridgeFamily;
  readonly operationId: string;
  readonly providerId: string;
  readonly providerDefinitionDigest: string;
  readonly publicationId?: string | undefined;
  readonly targetAssetType?: string | undefined;
  readonly payloadDigest?: string | undefined;
  readonly previewDigest?: string | undefined;
  readonly journalEntryId?: string | undefined;
  readonly journalEntryDigest?: string | undefined;
  readonly journalKind?: string | undefined;
  readonly externalAssetId?: string | undefined;
  readonly externalContentDigest?: string | undefined;
  readonly externalRefDigest?: string | undefined;
  readonly externalRevisionLabel?: string | null | undefined;
  readonly candidateDigest?: string | undefined;
  readonly reason?: string | undefined;
  readonly recordedAt: string;
}

type RecordContent = Omit<
  ExternalAssetBridgeRecord,
  "recordId" | "sequence" | "previousRecordDigest" | "recordDigest"
>;

const RECORD_FIELDS = [
  "schemaVersion",
  "recordId",
  "projectId",
  "family",
  "operationId",
  "providerId",
  "providerDefinitionDigest",
  "publicationId",
  "targetAssetType",
  "payloadDigest",
  "previewDigest",
  "journalEntryId",
  "journalEntryDigest",
  "journalKind",
  "externalAssetId",
  "externalContentDigest",
  "externalRefDigest",
  "externalRevisionLabel",
  "candidateDigest",
  "reason",
  "recordedAt",
  "sequence",
  "previousRecordDigest",
  "recordDigest",
] as const;

const IMPORT_REQUIRED = [
  "providerId",
  "providerDefinitionDigest",
  "journalEntryId",
  "journalEntryDigest",
  "journalKind",
  "externalAssetId",
  "externalContentDigest",
  "externalRefDigest",
  "candidateDigest",
] as const;

const PUBLICATION_PREPARED_REQUIRED = [
  "providerId",
  "providerDefinitionDigest",
  "publicationId",
  "targetAssetType",
  "payloadDigest",
  "previewDigest",
  "journalEntryId",
  "journalEntryDigest",
] as const;

const PUBLICATION_TERMINAL_REQUIRED = [
  ...PUBLICATION_PREPARED_REQUIRED,
  "externalAssetId",
  "externalContentDigest",
  "externalRefDigest",
] as const;

/** The record fields each family MUST carry — the two-phase contract, enforced. */
function requiredFieldsOf(family: ExternalAssetBridgeFamily): readonly string[] {
  switch (family) {
    case "EXTERNAL_IMPORT_PREPARED":
    case "EXTERNAL_IMPORT_COMMITTED":
      return IMPORT_REQUIRED;
    case "EXTERNAL_PUBLICATION_PREPARED":
      return PUBLICATION_PREPARED_REQUIRED;
    case "EXTERNAL_PUBLICATION_COMMITTED":
      return PUBLICATION_TERMINAL_REQUIRED;
    case "EXTERNAL_PUBLICATION_FAILED":
      return [...PUBLICATION_PREPARED_REQUIRED, "reason"];
  }
}

export function externalAssetBridgeRecordIdOf(
  input: RecordContent & { readonly sequence: number; readonly previousRecordDigest: string },
): string {
  return `xab-${canonicalDigest({ domain: EXTERNAL_ASSET_BRIDGE_RECORD_ID_DOMAIN, record: input }).slice(0, 32)}`;
}

function externalAssetBridgeRecordDigestOf(
  input: Omit<ExternalAssetBridgeRecord, "recordDigest">,
): string {
  return canonicalDigest({ domain: EXTERNAL_ASSET_BRIDGE_RECORD_DOMAIN, record: input });
}

export function parseExternalAssetBridgeRecord(
  raw: unknown,
  what = "ExternalAssetBridgeRecord",
): ExternalAssetBridgeRecord {
  const object = eaObject(raw, what);
  eaKeys(object, RECORD_FIELDS, ["schemaVersion", "recordId", "projectId", "family", "operationId", "recordedAt", "sequence", "previousRecordDigest", "recordDigest"], what);
  if (object.schemaVersion !== 1) {
    eaFail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  }
  const family = eaEnum(object.family, EXTERNAL_ASSET_BRIDGE_FAMILIES, `${what}.family`);
  eaKeys(object, RECORD_FIELDS, requiredFieldsOf(family), what);
  const sequence = object.sequence;
  if (typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence <= 0) {
    eaFail("invalid_value", `${what}.sequence must be a positive safe integer`);
  }
  const content: RecordContent = {
    schemaVersion: 1,
    projectId: eaStableId(object.projectId, `${what}.projectId`),
    family,
    operationId: eaString(object.operationId, `${what}.operationId`),
    providerId: eaStableId(object.providerId, `${what}.providerId`),
    providerDefinitionDigest: eaDigest(object.providerDefinitionDigest, `${what}.providerDefinitionDigest`),
    ...optionalField(object, "publicationId", `${what}.publicationId`),
    ...optionalField(object, "targetAssetType", `${what}.targetAssetType`),
    ...optionalField(object, "payloadDigest", `${what}.payloadDigest`),
    ...optionalField(object, "previewDigest", `${what}.previewDigest`),
    ...optionalField(object, "journalEntryId", `${what}.journalEntryId`),
    ...optionalField(object, "journalEntryDigest", `${what}.journalEntryDigest`),
    ...optionalField(object, "journalKind", `${what}.journalKind`),
    ...optionalField(object, "externalAssetId", `${what}.externalAssetId`),
    ...optionalField(object, "externalContentDigest", `${what}.externalContentDigest`),
    ...optionalField(object, "externalRefDigest", `${what}.externalRefDigest`),
    // An explicit `null` revision label survives the round trip unchanged.
    ...(object.externalRevisionLabel === undefined || object.externalRevisionLabel === null
      ? {}
      : { externalRevisionLabel: eaString(object.externalRevisionLabel, `${what}.externalRevisionLabel`) }),
    ...(object.externalRevisionLabel === null ? { externalRevisionLabel: null } : {}),
    ...optionalField(object, "candidateDigest", `${what}.candidateDigest`),
    ...optionalField(object, "reason", `${what}.reason`),
    recordedAt: eaTimestamp(object.recordedAt, `${what}.recordedAt`),
  };
  const previousRecordDigest = eaDigest(object.previousRecordDigest, `${what}.previousRecordDigest`);
  const recordId = eaString(object.recordId, `${what}.recordId`);
  const withChain = { ...content, sequence, previousRecordDigest };
  if (externalAssetBridgeRecordIdOf(withChain) !== recordId) {
    eaFail("invalid_value", `${what}.recordId does not match its content`);
  }
  const recordDigest = eaDigest(object.recordDigest, `${what}.recordDigest`);
  if (externalAssetBridgeRecordDigestOf({ ...withChain, recordId }) !== recordDigest) {
    eaFail("invalid_value", `${what}.recordDigest does not match its content`);
  }
  return Object.freeze({ ...withChain, recordId, recordDigest });
}

function optionalField(
  object: Record<string, unknown>,
  key: string,
  what: string,
): Record<string, string> {
  const value = object[key];
  if (value === undefined) return {};
  if (value === null) return {};
  return { [key]: eaString(value, what) };
}

/* ------------------------------------------------------------------ *
 * Store
 * ------------------------------------------------------------------ */

interface BridgeRow {
  readonly record_json: string;
}

export class SqliteExternalAssetBridgeStore {
  readonly #database: DatabaseSync;
  readonly #selectAll: ReturnType<DatabaseSync["prepare"]>;
  readonly #selectScopes: ReturnType<DatabaseSync["prepare"]>;
  readonly #insert: ReturnType<DatabaseSync["prepare"]>;
  readonly #maxSeq: ReturnType<DatabaseSync["prepare"]>;
  readonly #tip: ReturnType<DatabaseSync["prepare"]>;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.#database = new DatabaseSync(databasePath === ":memory:" ? ":memory:" : join(databasePath));
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS external_asset_bridge (" +
        "project_id TEXT NOT NULL, " +
        "sequence INTEGER NOT NULL, " +
        "record_id TEXT NOT NULL, " +
        "family TEXT NOT NULL, " +
        "operation_id TEXT NOT NULL, " +
        "record_json TEXT NOT NULL, " +
        "record_digest TEXT NOT NULL, " +
        "previous_record_digest TEXT NOT NULL, " +
        "recorded_at TEXT NOT NULL, " +
        "PRIMARY KEY (project_id, sequence))",
    );
    this.#database.exec(
      "CREATE INDEX IF NOT EXISTS external_asset_bridge_operation ON external_asset_bridge(project_id, operation_id)",
    );
    this.#selectAll = this.#database.prepare(
      "SELECT record_json FROM external_asset_bridge WHERE project_id = ? ORDER BY sequence",
    );
    this.#selectScopes = this.#database.prepare(
      "SELECT DISTINCT project_id FROM external_asset_bridge ORDER BY project_id",
    );
    this.#insert = this.#database.prepare(
      "INSERT INTO external_asset_bridge (project_id, sequence, record_id, family, operation_id, record_json, record_digest, previous_record_digest, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    this.#maxSeq = this.#database.prepare(
      "SELECT MAX(sequence) AS max_seq FROM external_asset_bridge WHERE project_id = ?",
    );
    this.#tip = this.#database.prepare(
      "SELECT record_digest FROM external_asset_bridge WHERE project_id = ? ORDER BY sequence DESC LIMIT 1",
    );
  }

  close(): void {
    this.#database.close();
  }

  /**
   * Append ONE receipt, chaining it onto the project's bridge history. The tail
   * read and the insert share one transaction so a concurrent writer cannot fork
   * the chain.
   */
  append(input: ExternalAssetBridgeRecordInput): ExternalAssetBridgeRecord {
    try {
      this.#database.exec("BEGIN IMMEDIATE");
      const seqRow = this.#maxSeq.get(input.projectId) as { max_seq: number | null } | undefined;
      const sequence = (seqRow?.max_seq ?? 0) + 1;
      const tipRow = this.#tip.get(input.projectId) as { record_digest: string } | undefined;
      const previousRecordDigest = tipRow?.record_digest ?? EXTERNAL_ASSET_BRIDGE_GENESIS;
      const content: RecordContent = {
        schemaVersion: 1,
        projectId: eaStableId(input.projectId, "projectId"),
        family: eaEnum(input.family, EXTERNAL_ASSET_BRIDGE_FAMILIES, "family"),
        operationId: eaString(input.operationId, "operationId"),
        providerId: eaStableId(input.providerId, "providerId"),
        providerDefinitionDigest: eaDigest(input.providerDefinitionDigest, "providerDefinitionDigest"),
        ...(input.publicationId === undefined ? {} : { publicationId: eaString(input.publicationId, "publicationId") }),
        ...(input.targetAssetType === undefined ? {} : { targetAssetType: eaString(input.targetAssetType, "targetAssetType") }),
        ...(input.payloadDigest === undefined ? {} : { payloadDigest: eaDigest(input.payloadDigest, "payloadDigest") }),
        ...(input.previewDigest === undefined ? {} : { previewDigest: eaDigest(input.previewDigest, "previewDigest") }),
        ...(input.journalEntryId === undefined ? {} : { journalEntryId: eaString(input.journalEntryId, "journalEntryId") }),
        ...(input.journalEntryDigest === undefined ? {} : { journalEntryDigest: eaDigest(input.journalEntryDigest, "journalEntryDigest") }),
        ...(input.journalKind === undefined ? {} : { journalKind: eaString(input.journalKind, "journalKind") }),
        ...(input.externalAssetId === undefined ? {} : { externalAssetId: eaString(input.externalAssetId, "externalAssetId") }),
        ...(input.externalContentDigest === undefined ? {} : { externalContentDigest: eaDigest(input.externalContentDigest, "externalContentDigest") }),
        ...(input.externalRefDigest === undefined ? {} : { externalRefDigest: eaDigest(input.externalRefDigest, "externalRefDigest") }),
        ...(input.externalRevisionLabel === undefined ? {} : input.externalRevisionLabel === null ? { externalRevisionLabel: null } : { externalRevisionLabel: eaString(input.externalRevisionLabel, "externalRevisionLabel") }),
        ...(input.candidateDigest === undefined ? {} : { candidateDigest: eaDigest(input.candidateDigest, "candidateDigest") }),
        ...(input.reason === undefined ? {} : { reason: eaString(input.reason, "reason") }),
        recordedAt: eaTimestamp(input.recordedAt, "recordedAt"),
      };
      // The family contract is enforced on the way IN as well as on the way out.
      for (const key of requiredFieldsOf(content.family)) {
        if (!Object.hasOwn(content, key) || (content as Record<string, unknown>)[key] === undefined) {
          eaFail("invalid_value", `bridge receipt ${content.family} requires "${key}"`);
        }
      }
      const withChain = { ...content, sequence, previousRecordDigest };
      const recordId = externalAssetBridgeRecordIdOf(withChain);
      const recordDigest = externalAssetBridgeRecordDigestOf({ ...withChain, recordId });
      const record: ExternalAssetBridgeRecord = Object.freeze({
        ...withChain,
        recordId,
        recordDigest,
      });
      this.#insert.run(
        record.projectId,
        record.sequence,
        record.recordId,
        record.family,
        record.operationId,
        JSON.stringify(record),
        record.recordDigest,
        record.previousRecordDigest,
        record.recordedAt,
      );
      this.#database.exec("COMMIT");
      return record;
    } catch (error) {
      try {
        this.#database.exec("ROLLBACK");
      } catch {
        // no active transaction
      }
      throw error;
    }
  }

  /** Every receipt for a project, oldest first (the append-only lineage). */
  list(projectId: string): readonly ExternalAssetBridgeRecord[] {
    return Object.freeze(
      (this.#selectAll.all(projectId) as unknown as BridgeRow[]).map((row) =>
        parseExternalAssetBridgeRecord(JSON.parse(row.record_json) as unknown),
      ),
    );
  }

  /** The lineage of ONE operation (a crash retry reads this before writing). */
  lineage(projectId: string, operationId: string): readonly ExternalAssetBridgeRecord[] {
    return Object.freeze(
      this.list(projectId).filter((record) => record.operationId === operationId),
    );
  }

  projects(): readonly string[] {
    return Object.freeze(
      (this.#selectScopes.all() as unknown as { project_id: string }[]).map((row) => row.project_id),
    );
  }

  /** Verify the local two-phase chain: contiguous sequence + linked content digests. */
  verifyChain(projectId: string): { readonly ok: boolean; readonly problem?: string } {
    let previous = EXTERNAL_ASSET_BRIDGE_GENESIS;
    let expected = 1;
    for (const record of this.list(projectId)) {
      if (record.sequence !== expected) {
        return { ok: false, problem: `sequence gap at ${record.sequence} (expected ${expected})` };
      }
      if (record.previousRecordDigest !== previous) {
        return { ok: false, problem: `broken chain at sequence ${record.sequence}` };
      }
      const { recordDigest, ...rest } = record;
      if (externalAssetBridgeRecordDigestOf(rest) !== recordDigest) {
        return { ok: false, problem: `content digest mismatch at sequence ${record.sequence}` };
      }
      previous = record.recordDigest;
      expected += 1;
    }
    return { ok: true };
  }
}

/** The canonical default bridge store path (deployment-local, Palimpsest-owned). */
export function defaultExternalAssetBridgePath(): string {
  const configured = process.env.DSH_HOME?.trim();
  const dshHome =
    configured === undefined || configured.length === 0 ? join(homedir(), ".dsh") : configured;
  return join(dshHome, "palimpsest", "external-asset-bridge.sqlite");
}
