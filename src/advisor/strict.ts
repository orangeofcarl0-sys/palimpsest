/**
 * G10-S advisor strict-parsing helpers (internal).
 *
 * Fail closed, never an unchecked cast. The advisor consumes UNTRUSTED input
 * (profiler output) and produces digest-bound recommendations, so every boundary
 * is strict: unknown fields are rejected, closed value sets are enforced, and no
 * numeric score is ever fabricated.
 */

import { isStableIdentifier, normalizeStableIdentifier } from "../schema/identifier.js";

export type AdvisorErrorKind =
  | "malformed_artifact"
  | "unknown_field"
  | "invalid_value"
  | "unknown_kind"
  | "unknown_schema_version"
  | "unknown_recipe"
  | "inconsistent_recommendation";

export class AdvisorError extends Error {
  constructor(
    readonly kind: AdvisorErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "AdvisorError";
  }
}

export function advisorFail(kind: AdvisorErrorKind, message: string): never {
  throw new AdvisorError(kind, message);
}

export function advisorObject(raw: unknown, what: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    advisorFail("malformed_artifact", `${what} must be an object`);
  }
  return raw as Record<string, unknown>;
}

export function advisorKeys(object: Record<string, unknown>, allowed: readonly string[], required: readonly string[], what: string): void {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) advisorFail("unknown_field", `${what}: unknown field "${key}"`);
  }
  for (const key of required) {
    if (!Object.hasOwn(object, key) || object[key] === undefined) {
      advisorFail("malformed_artifact", `${what}: missing required field "${key}"`);
    }
  }
}

export function advisorString(value: unknown, what: string): string {
  if (typeof value !== "string" || value.length === 0) advisorFail("invalid_value", `${what} must be a non-empty string`);
  return value;
}

export function advisorStableId(value: unknown, what: string): string {
  if (typeof value !== "string") advisorFail("invalid_value", `${what} must be a string`);
  const normalized = normalizeStableIdentifier(value);
  if (!isStableIdentifier(normalized)) advisorFail("invalid_value", `${what} must be a stable identifier`);
  return normalized;
}

export function advisorEnum<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    advisorFail("unknown_kind", `${what} must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

export function advisorNonNegInt(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    advisorFail("invalid_value", `${what} must be a safe integer (canonical JSON forbids non-integers)`);
  }
  if (value < 0) advisorFail("invalid_value", `${what} must be >= 0`);
  return value;
}

export function advisorBool(value: unknown, what: string): boolean {
  if (typeof value !== "boolean") advisorFail("invalid_value", `${what} must be a boolean`);
  return value;
}

export function advisorDigest(value: unknown, what: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    advisorFail("invalid_value", `${what} must be a canonical sha256 digest`);
  }
  return value;
}

export function advisorStringArray(value: unknown, what: string): readonly string[] {
  if (!Array.isArray(value)) advisorFail("invalid_value", `${what} must be an array`);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const text = advisorString(item, `${what}[]`);
    if (seen.has(text)) advisorFail("invalid_value", `${what}: duplicate value "${text}"`);
    seen.add(text);
    out.push(text);
  }
  return Object.freeze(out);
}

export function advisorSortedUnique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort());
}
