/**
 * Audited, forward-only SQLite migrations.
 *
 * The migration SQL is inlined byte-for-byte from the Python baseline
 * resource (migration_files/0001_unified_baseline.sql); a P0 test pins its
 * SHA-256 to the Python-computed checksum so the two runtimes claim the
 * same migration identity.
 */

import { createHash } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

import { canonicalDatetime } from "../schema/index.js";
import { DatabaseIdentityError, MigrationError } from "./errors.js";

export const APPLICATION_ID = 0x504c4d50; // ASCII "PLMP"

/**
 * H1 (docs/engineering/06 §2.2): the declared-selection organ. A judge is a
 * project-level governed declaration (rubric / llm / manual); the projection
 * table is the read model the selection service consults. The declaration
 * events themselves live on the hash-chained event log.
 */
export const MIGRATION_2_SQL = `CREATE TABLE judge_declarations (
    project_id TEXT NOT NULL,
    judge_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('rubric','llm','manual')),
    version INTEGER NOT NULL,
    declared_by TEXT NOT NULL,
    state_json BLOB NOT NULL,
    last_event_id INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (project_id, judge_id)
  ) STRICT;

CREATE TABLE selections (
    project_id TEXT NOT NULL,
    task_id TEXT,
    attempt_id TEXT NOT NULL,
    judge_id TEXT NOT NULL,
    replayable INTEGER NOT NULL,
    last_event_id INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (project_id, last_event_id)
  ) STRICT;
`;

export const MIGRATION_1_SQL = `CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL
);

CREATE TABLE events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    schema_version INTEGER NOT NULL CHECK (schema_version = 1),
    project_id TEXT NOT NULL,
    project_sequence INTEGER NOT NULL CHECK (project_sequence > 0),
    event_type TEXT NOT NULL,
    payload_version INTEGER NOT NULL CHECK (payload_version = 1),
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    payload_json BLOB NOT NULL,
    causation_id INTEGER REFERENCES events(event_id),
    correlation_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_digest TEXT NOT NULL,
    expected_project_revision INTEGER,
    previous_event_digest TEXT NOT NULL,
    event_digest TEXT NOT NULL UNIQUE,
    committed_at TEXT NOT NULL,
    UNIQUE (project_id, project_sequence),
    UNIQUE (project_id, idempotency_key)
);

CREATE INDEX events_project_order
    ON events(project_id, project_sequence);

CREATE TABLE projection_cursors (
    projection_name TEXT NOT NULL,
    project_id TEXT NOT NULL,
    projection_schema_version INTEGER NOT NULL,
    last_applied_event_id INTEGER NOT NULL,
    last_project_sequence INTEGER NOT NULL,
    last_event_digest TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (projection_name, project_id)
);

CREATE TABLE projects (
    project_id TEXT PRIMARY KEY,
    revision INTEGER NOT NULL,
    digest TEXT NOT NULL,
    head_commit TEXT NOT NULL,
    state_json BLOB NOT NULL,
    last_event_id INTEGER NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE tasks (
    project_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    state TEXT NOT NULL,
    envelope_json BLOB,
    state_json BLOB NOT NULL,
    last_event_id INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (project_id, task_id)
);

CREATE TABLE attempts (
    project_id TEXT NOT NULL,
    attempt_id TEXT NOT NULL,
    task_id TEXT,
    state TEXT NOT NULL,
    report_json BLOB,
    state_json BLOB NOT NULL,
    last_event_id INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (project_id, attempt_id)
);

CREATE TABLE evidence (
    project_id TEXT NOT NULL,
    evidence_id TEXT NOT NULL,
    status TEXT NOT NULL,
    evidence_json BLOB NOT NULL,
    last_event_id INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (project_id, evidence_id)
);

CREATE TABLE promotions (
    project_id TEXT NOT NULL,
    promotion_id TEXT NOT NULL,
    state TEXT NOT NULL,
    state_json BLOB NOT NULL,
    last_event_id INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (project_id, promotion_id)
);

CREATE TABLE scheduler_control (
    project_id TEXT PRIMARY KEY,
    state TEXT NOT NULL CHECK (state IN ('RUNNING', 'PAUSED')),
    generation INTEGER NOT NULL CHECK (generation >= 0),
    last_event_id INTEGER NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TRIGGER schema_migrations_no_update
BEFORE UPDATE ON schema_migrations
BEGIN
    SELECT RAISE(ABORT, 'migration history is append-only');
END;

CREATE TRIGGER schema_migrations_no_delete
BEFORE DELETE ON schema_migrations
BEGIN
    SELECT RAISE(ABORT, 'migration history is append-only');
END;

CREATE TRIGGER events_no_update
BEFORE UPDATE ON events
BEGIN
    SELECT RAISE(ABORT, 'events are append-only');
END;

CREATE TRIGGER events_no_delete
BEFORE DELETE ON events
BEGIN
    SELECT RAISE(ABORT, 'events are append-only');
END;

CREATE TRIGGER events_no_replace
BEFORE INSERT ON events
WHEN EXISTS (
    SELECT 1 FROM events
    WHERE event_id = NEW.event_id
       OR (project_id = NEW.project_id AND project_sequence = NEW.project_sequence)
       OR (project_id = NEW.project_id AND idempotency_key = NEW.idempotency_key)
       OR event_digest = NEW.event_digest
)
BEGIN
    SELECT RAISE(ABORT, 'events are append-only');
END;
`;

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: "phase0-2 unified baseline", sql: MIGRATION_1_SQL },
  { version: 2, name: "h1 judge declarations", sql: MIGRATION_2_SQL },
];

function migrationChecksum(migration: Migration): string {
  return createHash("sha256").update(migration.sql, "utf8").digest("hex");
}

export function getApplicationId(connection: DatabaseSync): number {
  const row = connection.prepare("PRAGMA application_id").get() as {
    application_id: number;
  };
  return row.application_id;
}

function userObjects(connection: DatabaseSync): string[] {
  return (
    connection
      .prepare(
        `
        SELECT name
        FROM sqlite_schema
        WHERE name NOT LIKE 'sqlite_%'
          AND type IN ('table', 'view', 'trigger', 'index')
        ORDER BY name
        `,
      )
      .all() as { name: string }[]
  ).map((row) => row.name);
}

/** Return true only for an empty database that may be initialized. */
export function classifyDatabase(connection: DatabaseSync): boolean {
  const applicationId = getApplicationId(connection);
  if (applicationId === APPLICATION_ID) return false;
  if (applicationId !== 0) {
    throw new DatabaseIdentityError(
      `unexpected SQLite application_id 0x${applicationId.toString(16).toUpperCase().padStart(8, "0")}`,
    );
  }
  const objects = userObjects(connection);
  if (objects.length > 0) {
    throw new DatabaseIdentityError(
      "refusing to claim an ordinary SQLite database with application_id 0; " +
        `found objects: ${objects.join(", ")}`,
    );
  }
  return true;
}

interface AppliedRow {
  version: number;
  name: string;
  checksum: string;
}

function appliedRows(connection: DatabaseSync): AppliedRow[] {
  const exists = connection
    .prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='schema_migrations'")
    .get();
  if (exists === undefined) return [];
  return connection
    .prepare(
      "SELECT version, name, checksum FROM schema_migrations ORDER BY version",
    )
    .all() as unknown as AppliedRow[];
}

export function validateMigrationHistory(
  connection: DatabaseSync,
  migrations: readonly Migration[] = MIGRATIONS,
): void {
  if (getApplicationId(connection) !== APPLICATION_ID) {
    throw new DatabaseIdentityError("SQLite application_id is not PLMP");
  }
  const rows = appliedRows(connection);
  if (rows.length === 0) {
    throw new MigrationError("initialized database has no migration history");
  }
  if (rows.length > migrations.length) {
    throw new MigrationError("database schema is newer than this Runtime");
  }
  for (const [index, row] of rows.entries()) {
    const migration = migrations[index];
    const expectedVersion = index + 1;
    if (row.version !== expectedVersion) {
      throw new MigrationError("migration history is not a continuous prefix");
    }
    if (migration?.version !== expectedVersion) {
      throw new MigrationError("bundled migration versions are not continuous");
    }
    if (row.name !== migration.name) {
      throw new MigrationError(`migration ${expectedVersion} name mismatch`);
    }
    if (row.checksum !== migrationChecksum(migration)) {
      throw new MigrationError(`migration ${expectedVersion} checksum mismatch`);
    }
  }
  const userVersion = (
    connection.prepare("PRAGMA user_version").get() as { user_version: number }
  ).user_version;
  const maximum = rows[rows.length - 1]!.version;
  if (userVersion !== maximum) {
    throw new MigrationError(
      `PRAGMA user_version ${userVersion} does not match migration history ${maximum}`,
    );
  }
}

export function applyMigrations(
  connection: DatabaseSync,
  options: {
    initialize: boolean;
    appliedAt: () => string;
    migrations?: readonly Migration[];
  },
): void {
  const migrations = options.migrations ?? MIGRATIONS;
  connection.exec("BEGIN IMMEDIATE");
  try {
    let appliedCount = 0;
    if (options.initialize) {
      connection.exec(`PRAGMA application_id = ${APPLICATION_ID}`);
    } else {
      if (getApplicationId(connection) !== APPLICATION_ID) {
        throw new DatabaseIdentityError("SQLite application_id is not PLMP");
      }
      const existing = appliedRows(connection);
      appliedCount = existing.length;
      if (appliedCount > 0) {
        validateMigrationHistory(connection, migrations);
      } else {
        throw new MigrationError("initialized database has no migration history");
      }
    }

    if (appliedCount > migrations.length) {
      throw new MigrationError("database schema is newer than this Runtime");
    }

    const pending = migrations.slice(appliedCount);
    let timestamp: string | undefined;
    if (pending.length > 0) {
      timestamp = canonicalDatetime(options.appliedAt());
    }
    for (const migration of pending) {
      if (migration.sql.includes("\r")) {
        throw new MigrationError("migration resources must use UTF-8/LF bytes");
      }
      connection.exec(migration.sql);
      connection
        .prepare(
          "INSERT INTO schema_migrations(version, name, checksum, applied_at) VALUES (?, ?, ?, ?)",
        )
        .run(migration.version, migration.name, migrationChecksum(migration), timestamp ?? null);
    }

    const targetVersion = migrations[migrations.length - 1]?.version ?? 0;
    connection.exec(`PRAGMA user_version = ${targetVersion}`);
    connection.exec("COMMIT");
  } catch (error) {
    try {
      connection.exec("ROLLBACK");
    } catch {
      // The transaction may already have been rolled back by SQLite.
    }
    throw error;
  }

  validateMigrationHistory(connection, migrations);
}
