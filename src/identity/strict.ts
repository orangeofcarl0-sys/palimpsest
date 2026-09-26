/**
 * G10-F0 strict-parse primitives (§22–§24) shared by every persisted
 * coordination artifact parser.
 *
 * "Strict means strict": exact field sets (unknown and nested-unknown fields
 * rejected), required fields present, stable ids validated, enum literals
 * exact, canonical arrays canonicalized/rejected-on-duplicate, and NEVER an
 * unchecked structural cast. All failures throw `CoordinationStoreError`, the
 * store boundary's fail-closed envelope.
 */

import { isStableIdentifier, normalizeStableIdentifier } from "../schema/identifier.js";
import { CoordinationStoreError } from "./errors.js";

/** A JSON object — never null, never an array. */
export function asObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CoordinationStoreError(`${what} must be an object`);
  }
  return value as Record<string, unknown>;
}

/** Exact-shape object: reject unknown keys, require the declared keys present. */
export function strictObject(
  value: unknown,
  spec: { readonly allowed: readonly string[]; readonly required: readonly string[] },
  what: string,
): Record<string, unknown> {
  const record = asObject(value, what);
  for (const key of Object.keys(record)) {
    if (!spec.allowed.includes(key)) {
      throw new CoordinationStoreError(`${what}: unknown field "${key}"`);
    }
  }
  for (const key of spec.required) {
    if (!Object.hasOwn(record, key)) {
      throw new CoordinationStoreError(`${what}: missing required field "${key}"`);
    }
    if (record[key] === undefined) {
      throw new CoordinationStoreError(`${what}.${key} must not be undefined`);
    }
  }
  return record;
}

export function requireString(value: unknown, what: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new CoordinationStoreError(`${what} must be a non-empty string`);
  }
  return value;
}

export function requireBoolean(value: unknown, what: string): boolean {
  if (typeof value !== "boolean") {
    throw new CoordinationStoreError(`${what} must be a boolean`);
  }
  return value;
}

export function requireLiteral<T extends string>(value: unknown, expected: T, what: string): T {
  if (value !== expected) {
    throw new CoordinationStoreError(`${what} must be "${expected}"`);
  }
  return expected;
}

export function requireOneOf<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new CoordinationStoreError(`${what} must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

export function requireStableId(value: unknown, what: string): string {
  if (typeof value !== "string") {
    throw new CoordinationStoreError(`${what} must be a string`);
  }
  const normalized = normalizeStableIdentifier(value);
  if (!isStableIdentifier(normalized)) {
    throw new CoordinationStoreError(`${what} must be a stable identifier`);
  }
  return normalized;
}

export function requireSchemaVersion(value: unknown, what: string): 1 {
  if (value !== 1) {
    throw new CoordinationStoreError(`${what}.schemaVersion must be 1`);
  }
  return 1;
}

export function requireNonNegativeInteger(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new CoordinationStoreError(`${what} must be a non-negative integer`);
  }
  return value;
}

export function requireArray(value: unknown, what: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new CoordinationStoreError(`${what} must be an array`);
  }
  return value;
}

/**
 * A canonical semantic SET of non-empty strings: duplicates rejected, order
 * canonicalized (lexical). Never a silently-deduplicated bag (§24).
 */
export function requireStringSet(value: unknown, what: string): readonly string[] {
  const items = requireArray(value, what);
  const seen = new Set<string>();
  for (const item of items) {
    const tag = requireString(item, `${what}[]`);
    if (seen.has(tag)) {
      throw new CoordinationStoreError(`${what}: duplicate value "${tag}" (semantic set)`);
    }
    seen.add(tag);
  }
  return Object.freeze([...seen].sort());
}

/** An optional field: absent → undefined; present → parsed. */
export function optional<T>(
  value: unknown,
  parse: (present: unknown) => T,
): T | undefined {
  return value === undefined ? undefined : parse(value);
}
