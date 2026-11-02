/**
 * PC1 S04 — the durable proposal/review metadata store.
 *
 * It stores bytes that are explicitly NON-CANONICAL. It cannot write ProjectIR, Work, Evidence,
 * Promotion or the Ordarium ledger. The schema is deliberately one table: a proposal is a document,
 * not a second state machine.
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { ProposalRecord, ReviewStore } from "./types.js";

export class SqliteReviewStore implements ReviewStore {
  readonly #database: DatabaseSync;
  readonly #select: ReturnType<DatabaseSync["prepare"]>;
  readonly #selectAll: ReturnType<DatabaseSync["prepare"]>;
  readonly #upsert: ReturnType<DatabaseSync["prepare"]>;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.#database = new DatabaseSync(databasePath === ":memory:" ? ":memory:" : join(databasePath));
    this.#database.exec("PRAGMA busy_timeout = 5000");
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS project_review_proposals (" +
        "project_id TEXT NOT NULL, proposal_id TEXT NOT NULL, digest TEXT NOT NULL, kind TEXT NOT NULL, " +
        "status TEXT NOT NULL, record_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, " +
        "PRIMARY KEY (project_id, proposal_id))",
    );
    this.#select = this.#database.prepare(
      "SELECT record_json FROM project_review_proposals WHERE project_id=? AND proposal_id=?",
    );
    this.#selectAll = this.#database.prepare(
      "SELECT record_json FROM project_review_proposals WHERE project_id=? ORDER BY created_at, proposal_id",
    );
    this.#upsert = this.#database.prepare(
      "INSERT INTO project_review_proposals (project_id, proposal_id, digest, kind, status, record_json, created_at, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(project_id, proposal_id) DO UPDATE SET " +
        "digest=excluded.digest, kind=excluded.kind, status=excluded.status, record_json=excluded.record_json, updated_at=excluded.updated_at",
    );
  }

  put(record: ProposalRecord): void {
    this.#upsert.run(
      record.projectId,
      record.proposalId,
      record.digest,
      record.kind,
      record.status,
      JSON.stringify(record),
      record.createdAt,
      new Date().toISOString(),
    );
  }

  get(projectId: string, proposalId: string): ProposalRecord | undefined {
    const row = this.#select.get(projectId, proposalId) as { record_json: string } | undefined;
    return row === undefined ? undefined : (JSON.parse(row.record_json) as ProposalRecord);
  }

  list(projectId: string): readonly ProposalRecord[] {
    return (this.#selectAll.all(projectId) as Array<{ record_json: string }>).map(
      (row) => JSON.parse(row.record_json) as ProposalRecord,
    );
  }

  #closed = false;
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#database.close();
  }
}
