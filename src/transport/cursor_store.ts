/**
 * G10-P deployment-local transport cursor — CONSUMER RUNTIME STATE, never identity.
 *
 *   cursor ownership ≠ Peer semantic identity ≠ Commitment identity ≠ Boundary revision
 *
 * The cursor records how far THIS deployment has mechanically observed its mailbox.
 * It is deliberately its own durable store (not the coordination store, not the
 * boundary store) so a lost/rewound cursor can never rewrite semantic history: it
 * only causes at-least-once redelivery, which semantic idempotency absorbs.
 *
 * Ordarium v1.3.1 binds no ledger UUID to a cursor (ledger epoch limitation), so a
 * consumer pointed at a replaced ledger fails closed on a future cursor and needs an
 * explicit `clear` (operator reset). This store does not pretend to detect a swap to a
 * ledger with an equal-or-higher position.
 */

import { DatabaseSync } from "node:sqlite";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";

export interface TransportCursorStore {
  read(input: { readonly consumerId: string; readonly mailbox: string }): Promise<string | undefined>;
  write(input: { readonly consumerId: string; readonly mailbox: string; readonly cursor: string }): Promise<void>;
  /** Explicit operator reset (e.g. after a deliberate transport-ledger replacement). */
  clear(input: { readonly consumerId: string; readonly mailbox: string }): Promise<void>;
}

export class SqliteTransportCursorStore implements TransportCursorStore {
  readonly #database: DatabaseSync;
  readonly #select: ReturnType<DatabaseSync["prepare"]>;
  readonly #upsert: ReturnType<DatabaseSync["prepare"]>;
  readonly #delete: ReturnType<DatabaseSync["prepare"]>;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.#database = new DatabaseSync(databasePath === ":memory:" ? ":memory:" : join(databasePath));
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS transport_cursors (" +
        "consumer_id TEXT NOT NULL, " +
        "mailbox TEXT NOT NULL, " +
        "cursor TEXT NOT NULL, " +
        "updated_at TEXT NOT NULL, " +
        "PRIMARY KEY (consumer_id, mailbox))",
    );
    this.#select = this.#database.prepare(
      "SELECT cursor FROM transport_cursors WHERE consumer_id = ? AND mailbox = ?",
    );
    this.#upsert = this.#database.prepare(
      "INSERT INTO transport_cursors (consumer_id, mailbox, cursor, updated_at) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT (consumer_id, mailbox) DO UPDATE SET cursor = excluded.cursor, updated_at = excluded.updated_at",
    );
    this.#delete = this.#database.prepare(
      "DELETE FROM transport_cursors WHERE consumer_id = ? AND mailbox = ?",
    );
  }

  async read(input: { readonly consumerId: string; readonly mailbox: string }): Promise<string | undefined> {
    const row = this.#select.get(input.consumerId, input.mailbox) as { cursor: string } | undefined;
    return row?.cursor;
  }

  async write(input: {
    readonly consumerId: string;
    readonly mailbox: string;
    readonly cursor: string;
  }): Promise<void> {
    this.#upsert.run(input.consumerId, input.mailbox, input.cursor, new Date().toISOString());
  }

  async clear(input: { readonly consumerId: string; readonly mailbox: string }): Promise<void> {
    this.#delete.run(input.consumerId, input.mailbox);
  }

  close(): void {
    this.#database.close();
  }
}

export function defaultTransportCursorPath(): string {
  const configured = process.env.DSH_HOME?.trim();
  const dshHome = configured === undefined || configured.length === 0 ? join(homedir(), ".dsh") : configured;
  return join(dshHome, "palimpsest", "transport-cursors.sqlite");
}
