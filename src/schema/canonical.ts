/**
 * Canonical JSON and SHA-256 digests for the V0 contracts.
 *
 * Ported byte-for-byte from palimpsest-repo palimpsest/schema/canonical.py
 * (phase0-2 unified baseline). The golden parity gate is fixtures/replay/
 * baseline-v1.json: every digest recomputed here must equal the Python
 * digests embedded in that fixture.
 *
 * Contract (docs/02 §2): UTF-8 JSON, keys sorted by Unicode code point,
 * no floats, NFC strings, explicit-null-preserving, SHA-256 lowercase hex.
 */

import { createHash } from "node:crypto";

const MIN_INT64 = -(2 ** 63);
const MAX_INT64 = 2 ** 63 - 1;

export class CanonicalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalizationError";
  }
}

export type JsonNull = null;
export type JsonBool = boolean;
export type JsonNumber = number;
export type JsonString = string;
export type JsonArray = JsonValue[];
export type JsonObject = { [key: string]: JsonValue };
export type JsonValue =
  | JsonNull
  | JsonBool
  | JsonNumber
  | JsonString
  | JsonArray
  | JsonObject;

function isJsonObject(value: unknown): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof Uint8Array)
  );
}

/**
 * Lone surrogates survive JS strings but make Python's UTF-8 encode raise;
 * fail closed here the same way instead of silently emitting U+FFFD.
 */
function assertNoLoneSurrogates(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff && (index + 1 >= value.length || value.charCodeAt(index + 1) < 0xdc00 || value.charCodeAt(index + 1) > 0xdfff)) {
      throw new CanonicalizationError(
        "strings with lone surrogates have no canonical UTF-8 representation",
      );
    }
  }
}

function normalizeValue(value: unknown): JsonValue {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new CanonicalizationError(
        "floating-point values are forbidden; use a normalized decimal string",
      );
    }
    // JS numbers cannot carry the full int64 range exactly; reject rather
    // than digest a value Python would have accepted but we cannot compare.
    if (!Number.isSafeInteger(value) || value < MIN_INT64 || value > MAX_INT64) {
      throw new CanonicalizationError("integers must fit in a signed 64-bit value");
    }
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.normalize("NFC");
    assertNoLoneSurrogates(normalized);
    return normalized;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }
  if (isJsonObject(value)) {
    const normalized: JsonObject = {};
    for (const [key, item] of Object.entries(value)) {
      if (typeof key !== "string") {
        throw new CanonicalizationError("object keys must be strings");
      }
      const normalizedKey = key.normalize("NFC");
      if (Object.prototype.hasOwnProperty.call(normalized, normalizedKey)) {
        throw new CanonicalizationError(
          `object keys collide after NFC normalization: ${normalizedKey}`,
        );
      }
      normalized[normalizedKey] = normalizeValue(item);
    }
    return normalized;
  }
  throw new CanonicalizationError(
    `unsupported canonical JSON value: ${typeof value}`,
  );
}

/**
 * Python sorted() compares str by Unicode code points; JS Array#sort()
 * compares UTF-16 code units, which diverges above the BMP. Compare code
 * point by code point to keep key order identical across languages.
 */
function compareCodePointOrder(a: string, b: string): number {
  const left = Array.from(a);
  const right = Array.from(b);
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const x = left[index]!.codePointAt(0)!;
    const y = right[index]!.codePointAt(0)!;
    if (x !== y) return x < y ? -1 : 1;
  }
  return left.length - right.length;
}

function stringifyNormalized(value: JsonValue): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return value.toString();
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stringifyNormalized(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort(compareCodePointOrder);
  const members = keys.map(
    (key) => `${JSON.stringify(key)}:${stringifyNormalized(value[key]!)}`,
  );
  return `{${members.join(",")}}`;
}

/** Return the V0 canonical UTF-8 JSON representation of *value*. */
export function canonicalJsonBytes(value: unknown): Uint8Array {
  const text = stringifyNormalized(normalizeValue(value));
  return new TextEncoder().encode(text);
}

/** Return the lowercase SHA-256 digest of canonical JSON bytes. */
export function canonicalDigest(value: unknown): string {
  return createHash("sha256").update(canonicalJsonBytes(value)).digest("hex");
}
