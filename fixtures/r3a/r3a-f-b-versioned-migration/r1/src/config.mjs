/**
 * F-B — VERSIONED DOCUMENT MIGRATION (starting point H0).
 *
 * The document is a CONSUMER'S configuration: other services hold copies of it, and a migration that
 * silently drops a field it does not recognize breaks forward compatibility without saying so.
 *
 * This implementation builds the new shape from the fields it knows about, and therefore:
 *
 *   · discards every field the contract does not define;
 *   · replaces a present-but-unusable value with a default instead of refusing it;
 *   · accepts a version it has never seen.
 */

export class ConfigError extends Error {
  /**
   * @param {string} code a stable, machine-readable failure code
   * @param {string} message a human-readable explanation
   */
  constructor(code, message) {
    super(message);
    this.name = "ConfigError";
    this.code = code;
  }
}

/**
 * Migrate ONE document to the current shape.
 *
 * @param {Record<string, unknown>} input the caller's document; the caller keeps using the same object
 * @returns {Record<string, unknown>} the migrated document
 */
export function migrateDocument(input) {
  return {
    version: 2,
    retryCount: input.retry_count ?? input.retryCount ?? 3,
    timeoutMs: input.timeoutMs ?? input.timeout_ms ?? 3000,
  };
}
