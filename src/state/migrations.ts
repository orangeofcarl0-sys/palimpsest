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
 * H1 (docs/engineering/06 §3.4): the gate registry and role table live on the
 * log (GATE_DEFINED / ROLE_TABLE_DEFINED); these read models carry the latest
 * declaration per project. Genesis declarations are appended per project at
 * creation, not by this migration.
 */
export const MIGRATION_3_SQL = `CREATE TABLE gate_registry (
    project_id TEXT NOT NULL,
    gate_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    definition_json BLOB NOT NULL,
    declared_by TEXT NOT NULL,
    last_event_id INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (project_id, gate_id)
  ) STRICT;

CREATE TABLE role_tables (
    project_id TEXT PRIMARY KEY,
    table_json BLOB NOT NULL,
    declared_by TEXT NOT NULL,
    last_event_id INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;
`;

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

/**
 * H1 (docs/engineering/06 §2.1/§3.4 D-3): the stage graph is declared, not
 * hardcoded. One graph per project; the projection row is the read model the
 * scheduler consults each decision tick.
 */
export const MIGRATION_4_SQL = `CREATE TABLE stage_graphs (
    project_id TEXT PRIMARY KEY,
    graph_json BLOB NOT NULL,
    declared_by TEXT NOT NULL,
    last_event_id INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;
`;

/**
 * PLMP-CTX-2: the canonical registry of compiled context manifests (§9).
 * Manifest bodies are event-sourced (CONTEXT_MANIFEST_ADDED) and projected
 * here for lookup; the table participates in PROJECTION_TABLES/snapshot.
 */
export const MIGRATION_5_SQL = `CREATE TABLE context_manifests (
    project_id TEXT NOT NULL,
    manifest_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    project_revision INTEGER NOT NULL,
    manifest_json BLOB NOT NULL,
    last_event_id INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (project_id, manifest_id)
  ) STRICT;
`;

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/**
 * PLMP-DEBUG-1 (29 号规格): the debugger hold projection - one row per held
 * task; the scheduling gate reads it, the ledger rebuilds it on restart.
 */
export const MIGRATION_6_SQL = `CREATE TABLE task_holds (
    project_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    declared_by TEXT NOT NULL,
    last_event_id INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (project_id, task_id)
  ) STRICT;
`;

/**
 * PLMP-GRAPH-4 (30 号规格): hold revision anchoring. A hold set at revision N
 * must not gate whatever semantic task later reuses the task_id after a plan
 * revision - the scheduler treats a revision-mismatched hold as stale.
 * Projection-table change only: no digest, no fixture regeneration. NULL =
 * legacy hold (pre-anchor event), which keeps the legacy always-active
 * semantics (documented fallback, fail-open only for pre-anchor data).
 */
export const MIGRATION_7_SQL = `ALTER TABLE task_holds ADD COLUMN project_revision INTEGER;`;

/**
 * PLMP-GRAPH-5 §B2-D (31 号修订): provable backfill of pre-anchor hold rows.
 * Every HOLD_SET event row carries `expected_project_revision` (the exact
 * revision the caller saw, enforced by the append precondition), and
 * task_holds.last_event_id points at the latest HOLD_SET - so the revision is
 * RECOVERABLE from the ledger, never guessed. After this migration a NULL
 * project_revision means "unprovable" and the scheduler treats it as stale
 * (fail-closed: an old control must never silently gate a new semantic task).
 */
export const MIGRATION_8_SQL = `UPDATE task_holds SET project_revision = (
    SELECT e.expected_project_revision FROM events e
    WHERE e.project_id = task_holds.project_id AND e.event_id = task_holds.last_event_id
)
WHERE project_revision IS NULL;`;

/**
 * PLMP-GRAPH-5 §B3-C (31 号修订): historical hold definition identity. The
 * hold's definitionId must be the definition the task had AT SET TIME, never
 * the current task-id occupant. Derived projection column: #applyHoldSet
 * reads it from the then-current ProjectIR (event order guarantees the
 * projects row matches), and this backfill recovers it for pre-B3 rows from
 * the historical ProjectIR payloads on the ledger - matched exactly by
 * (revision, task_id), never guessed. Absent historical identity stays NULL
 * (honest absence; spec-first projects).
 */
export const MIGRATION_9_BACKFILL_SQL = `UPDATE task_holds SET definition_id = (
    SELECT json_extract(j.value, '$.definition_id')
    FROM events e, json_each(CAST(e.payload_json AS TEXT), '$.project_ir.tasks') j
    WHERE e.project_id = task_holds.project_id
      AND e.event_type IN ('PROJECT_CREATED', 'PROJECT_REVISED')
      AND json_extract(CAST(e.payload_json AS TEXT), '$.project_ir.revision') = task_holds.project_revision
      AND json_extract(j.value, '$.task_id') = task_holds.task_id
      AND json_valid(CAST(e.payload_json AS TEXT))
    ORDER BY e.event_id DESC LIMIT 1
)
WHERE definition_id IS NULL AND project_revision IS NOT NULL;`;

export const MIGRATION_9_SQL = `ALTER TABLE task_holds ADD COLUMN definition_id TEXT;

${MIGRATION_9_BACKFILL_SQL}`;

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: "phase0-2 unified baseline", sql: MIGRATION_1_SQL },
  { version: 2, name: "h1 judge declarations", sql: MIGRATION_2_SQL },
  { version: 3, name: "h1 gate and role registries", sql: MIGRATION_3_SQL },
  { version: 4, name: "h1 stage graph registry", sql: MIGRATION_4_SQL },
  { version: 5, name: "context manifest registry", sql: MIGRATION_5_SQL },
  { version: 6, name: "debugger task holds", sql: MIGRATION_6_SQL },
  { version: 7, name: "hold revision anchoring", sql: MIGRATION_7_SQL },
  { version: 8, name: "hold revision backfill from the ledger", sql: MIGRATION_8_SQL },
  { version: 9, name: "hold historical definition identity", sql: MIGRATION_9_SQL },
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
