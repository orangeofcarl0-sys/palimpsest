/** Typed failures for the durable state layer. */

export class StateStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StateStoreError";
  }
}

export class DatabaseIdentityError extends StateStoreError {}
export class MigrationError extends StateStoreError {}
export class IdempotencyConflict extends StateStoreError {}
export class RevisionConflict extends StateStoreError {}
export class ControlGenerationConflict extends StateStoreError {}
export class EventChainError extends StateStoreError {}
export class ProjectionError extends StateStoreError {}
