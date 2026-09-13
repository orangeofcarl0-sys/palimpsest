/**
 * G10-H RuntimeScope identity — a LEAF module (imports only the shared
 * identifier grammar) so `federation` can reference a RuntimeScopeRef without a
 * module cycle.
 *
 *   RuntimeScopeRef ≠ Work scope_id ≠ federation scope ≠ commitment scope
 *                  ≠ effect scope ≠ PeerRef ≠ PersistentPointRef ≠ ActivationRef
 *
 * The id uses the repository's shared stable-identifier grammar, so a
 * RuntimeScopeId can never collide with a path-like or whitespace-bearing
 * string (and string equality with any other id namespace implies NO relation —
 * identity comes from the field/type namespace plus the owning artifact).
 */

import { isStableIdentifier, normalizeStableIdentifier } from "../schema/identifier.js";

export type RuntimeScopeId = string;

export interface RuntimeScopeRef {
  readonly schemaVersion: 1;
  readonly scopeId: RuntimeScopeId;
}

export class RuntimeScopeArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeScopeArtifactError";
  }
}

export function materializeRuntimeScopeRef(input: { readonly scopeId: string }): RuntimeScopeRef {
  const scopeId = requireStableId(input.scopeId, "scopeId");
  return Object.freeze({ schemaVersion: 1 as const, scopeId });
}

export function parseRuntimeScopeRef(raw: unknown, what = "RuntimeScopeRef"): RuntimeScopeRef {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new RuntimeScopeArtifactError(`${what} must be an object`);
  }
  const object = raw as Record<string, unknown>;
  for (const key of Object.keys(object)) {
    if (key !== "schemaVersion" && key !== "scopeId") throw new RuntimeScopeArtifactError(`unknown ${what} field "${key}"`);
  }
  if (object.schemaVersion !== 1) throw new RuntimeScopeArtifactError(`${what}.schemaVersion must be 1`);
  if (!Object.hasOwn(object, "scopeId")) throw new RuntimeScopeArtifactError(`${what}: field "scopeId" is required`);
  return materializeRuntimeScopeRef({ scopeId: object.scopeId as string });
}

export function runtimeScopeRefsEqual(a: RuntimeScopeRef, b: RuntimeScopeRef): boolean {
  return a.scopeId === b.scopeId;
}

export function runtimeScopeRefKey(ref: RuntimeScopeRef): string {
  return ref.scopeId;
}

export function requireStableId(value: unknown, what: string): string {
  if (typeof value !== "string") throw new RuntimeScopeArtifactError(`${what} must be a string`);
  const normalized = normalizeStableIdentifier(value);
  if (!isStableIdentifier(normalized)) throw new RuntimeScopeArtifactError(`${what} must be a stable identifier`);
  return normalized;
}

export function requireNonEmpty(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new RuntimeScopeArtifactError(`${what} must be a non-empty string`);
  return value;
}
