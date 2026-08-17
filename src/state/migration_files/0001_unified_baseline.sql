CREATE TABLE schema_migrations (
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
