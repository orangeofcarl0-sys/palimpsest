/**
 * R1-R §5/§8 — SCENARIO B, THE STARTING POINT (H0).
 *
 * A DELIBERATELY INCOMPLETE BUT PLAUSIBLE implementation (§8 step 1). It reads the broad product goal
 * literally — "migrate a legacy configuration to the v2 shape" — and does the obvious thing: copy the
 * fields across, filling in defaults for anything missing. It never asks whether the legacy document
 * was AMBIGUOUS, never normalizes spellings before comparing them, and applies defaults BEFORE it has
 * validated anything.
 *
 * That ordering is the pre-paid cognitive mistake this scenario measures:
 *
 *     transform/default before legacy ambiguity validation
 *
 * A generation that inherits the discovered method replaces this file; a generation given no capital
 * writes something like this and pays the discovery cost again.
 */

export class ConfigError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ConfigError";
    this.code = code;
  }
}

export interface V2Config {
  readonly schemaVersion: 2;
  readonly service: { readonly name: string; readonly endpoint: string };
  readonly policy: { readonly retries: number; readonly timeoutMs: number };
}

const DEFAULT_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 30_000;

/** Migrate a legacy configuration document to the v2 shape. */
export function migrateConfig(input: Record<string, unknown>): V2Config {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new ConfigError("INVALID_INPUT", "the configuration must be a plain object");
  }

  // Read the fields the legacy format is documented to use, and fill in the new-format defaults.
  const name = input["name"] ?? input["service_name"] ?? input["title"];
  const endpoint = input["endpoint"] ?? input["url"] ?? input["base_url"] ?? input["host"];
  const retry = input["retry"] ?? input["retries"] ?? input["retryCount"] ?? input["attempts"];
  const timeout = input["timeout"] ?? input["timeout_ms"] ?? input["timeoutMs"];

  const v2: V2Config = {
    schemaVersion: 2,
    service: { name: typeof name === "string" ? name : "", endpoint: typeof endpoint === "string" ? endpoint : "" },
    policy: {
      retries: typeof retry === "number" ? retry : DEFAULT_RETRIES,
      timeoutMs: typeof timeout === "number" ? timeout : DEFAULT_TIMEOUT_MS,
    },
  };

  if (v2.service.name === "") throw new ConfigError("INVALID_NAME", "the service name must be a non-empty string");
  if (v2.service.endpoint === "") throw new ConfigError("INVALID_ENDPOINT", "the endpoint must be a non-empty string");
  return v2;
}
