/**
 * PAL-FED-0 strict input reader (EXPERIMENTAL, §35).
 *
 * The same exact-envelope discipline the durable codec applies on read is
 * applied to model/CLI input here, with a caller-supplied error factory so an
 * input rejection becomes FED_INPUT while a durable rejection stays FED_DECODE.
 */

export type UnknownObject = { readonly [key: string]: unknown };

export interface StrictReader {
  asObject(value: unknown, path: string): UnknownObject;
  exactKeys(object: UnknownObject, allowed: readonly string[], path: string): void;
  required(object: UnknownObject, key: string, path: string): unknown;
  optional(object: UnknownObject, key: string): unknown;
  asString(value: unknown, path: string, min: number, max: number): string;
  optionalString(
    object: UnknownObject,
    key: string,
    path: string,
    min: number,
    max: number,
  ): string | undefined;
  asEnum<T extends string>(value: unknown, allowed: readonly T[], path: string): T;
  asArray(value: unknown, path: string, maxItems: number): unknown[];
  asPositiveRevision(value: unknown, path: string): number;
}

export function strictReader(reject: (message: string) => Error): StrictReader {
  function asObject(value: unknown, path: string): UnknownObject {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw reject(`${path}: expected an object`);
    }
    return value as UnknownObject;
  }

  function exactKeys(object: UnknownObject, allowed: readonly string[], path: string): void {
    for (const key of Object.keys(object)) {
      if (!allowed.includes(key)) {
        throw reject(`${path}: unknown field '${key}'`);
      }
    }
  }

  function required(object: UnknownObject, key: string, path: string): unknown {
    if (!Object.prototype.hasOwnProperty.call(object, key)) {
      throw reject(`${path}.${key}: required field is missing`);
    }
    return object[key];
  }

  function optional(object: UnknownObject, key: string): unknown {
    return Object.prototype.hasOwnProperty.call(object, key) ? object[key] : undefined;
  }

  function asString(value: unknown, path: string, min: number, max: number): string {
    if (typeof value !== "string") throw reject(`${path}: expected a string`);
    if (value.length < min || value.length > max) {
      throw reject(`${path}: length ${value.length} is outside [${min}, ${max}]`);
    }
    return value;
  }

  function optionalString(
    object: UnknownObject,
    key: string,
    path: string,
    min: number,
    max: number,
  ): string | undefined {
    const value = optional(object, key);
    if (value === undefined) return undefined;
    return asString(value, `${path}.${key}`, min, max);
  }

  function asEnum<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
    if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
      throw reject(`${path}: expected one of ${allowed.join(" | ")}, got '${String(value)}'`);
    }
    return value as T;
  }

  function asArray(value: unknown, path: string, maxItems: number): unknown[] {
    if (!Array.isArray(value)) throw reject(`${path}: expected an array`);
    if (value.length > maxItems) {
      throw reject(`${path}: has ${value.length} items, limit is ${maxItems}`);
    }
    return value;
  }

  function asPositiveRevision(value: unknown, path: string): number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
      throw reject(`${path}: expected a non-negative safe integer revision`);
    }
    return value;
  }

  return {
    asObject,
    exactKeys,
    required,
    optional,
    asString,
    optionalString,
    asEnum,
    asArray,
    asPositiveRevision,
  };
}
