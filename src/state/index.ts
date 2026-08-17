/** Durable state primitives for the unified Palimpsest baseline. */

export {
  ControlGenerationConflict,
  DatabaseIdentityError,
  EventChainError,
  IdempotencyConflict,
  MigrationError,
  ProjectionError,
  RevisionConflict,
  StateStoreError,
} from "./errors.js";
export { APPLICATION_ID, MIGRATIONS, applyMigrations, validateMigrationHistory } from "./migrations.js";
export { defaultStatePath, openDatabase } from "./database.js";
export {
  EventStore,
  EMPTY_PREVIOUS_EVENT_DIGEST,
  rowToEvent,
  verifyEventChain,
  type CheckpointResult,
  type FaultHook,
} from "./event_store.js";
export {
  CoreProjector,
  PROJECTION_NAME,
  PROJECTION_SCHEMA_VERSION,
} from "./projector.js";
export {
  PROJECTION_TABLES,
  clearProjections,
  normalizedSnapshot,
  snapshotDigest,
} from "./snapshot.js";
