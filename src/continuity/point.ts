/**
 * G10-D3 PersistentPoint — the minimal durable continuity artifact.
 *
 * A PersistentPoint is (PLMP-UAS-1): a durable operational identity/locus
 * whose continuity is NOT identical to any one runtime carrier or session.
 * The D3 minimum is deliberately identity-only:
 *
 *   interface PersistentPoint { readonly schemaVersion: 1; readonly persistentPointId: PersistentPointId; }
 *
 * Rejected by default (§56): AgentDefinitionId, RuntimeAgentId, SessionId,
 * workspace, memory, authority, PeerRef, organization, commitments,
 * capabilities, provider, model. A point survives unlimited carrier
 * replacements; carrier/session attachment is runtime state
 * (`RuntimeAttachment`), never point content (§62). No durable attachment
 * history (§63 — not needed for the continuity proof).
 *
 * Identity grammar (§57): the shared stable-identifier grammar
 * (`src/schema/identifier.ts`). String equality with an AgentDefinitionId,
 * runtimeAgentId, or SessionId implies NO relation.
 *
 * Creation (§59): strictly explicit administrative/semantic authoring via the
 * materializer + store `register`. Binding resolution never creates a point;
 * runtime realization never creates one because a selected ref is missing
 * (fail closed, §65).
 *
 * Storage ownership (D0 §13/§14): the point is Palimpsest continuity
 * semantic truth; the canonical store is Palimpsest-owned (see store.ts) —
 * never Ordarium state. Exactly one canonical identity store exists.
 *
 * `durableContinuityRefOf` (§58) is the explicit adapter to the Binding
 * vocabulary; it is deliberately NOT frozen as a universal equivalence.
 */

import type { DurableContinuityRef } from "../binding/contract.js";
import { isStableIdentifier, normalizeStableIdentifier } from "../schema/identifier.js";

export type PersistentPointId = string;

export interface PersistentPoint {
  readonly schemaVersion: 1;
  readonly persistentPointId: PersistentPointId;
}

export class PersistentPointParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersistentPointParseError";
  }
}

function fail(message: string): never {
  throw new PersistentPointParseError(message);
}

/** Materializer: CREATE a canonical PersistentPoint (validate, freeze). Explicit authoring only. */
export function materializePersistentPoint(input: {
  readonly persistentPointId: PersistentPointId;
}): PersistentPoint {
  if (typeof input.persistentPointId !== "string") fail("persistentPointId must be a string");
  const id = normalizeStableIdentifier(input.persistentPointId);
  if (!isStableIdentifier(id)) {
    fail(
      "persistentPointId must be a stable identifier: 1-128 ASCII characters, " +
        "starting with an alphanumeric, then [A-Za-z0-9._:-]",
    );
  }
  return Object.freeze({ schemaVersion: 1 as const, persistentPointId: id });
}

/** Strict parser from `unknown`: exact keys, schemaVersion 1, stable identifier grammar. */
export function parsePersistentPoint(raw: unknown): PersistentPoint {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail("PersistentPoint must be an object");
  }
  const object = raw as Record<string, unknown>;
  for (const key of Object.keys(object)) {
    if (key !== "schemaVersion" && key !== "persistentPointId") {
      fail(`unknown PersistentPoint field "${key}"`);
    }
  }
  if (!Object.hasOwn(object, "schemaVersion") || !Object.hasOwn(object, "persistentPointId")) {
    fail("PersistentPoint requires schemaVersion and persistentPointId");
  }
  if (object.schemaVersion !== 1) fail("PersistentPoint.schemaVersion must be 1");
  if (typeof object.persistentPointId !== "string") fail("persistentPointId must be a string");
  const id = normalizeStableIdentifier(object.persistentPointId);
  if (!isStableIdentifier(id)) {
    fail(
      "persistentPointId must be a stable identifier: 1-128 ASCII characters, " +
        "starting with an alphanumeric, then [A-Za-z0-9._:-]",
    );
  }
  return Object.freeze({ schemaVersion: 1 as const, persistentPointId: id });
}

/**
 * Explicit adapter: PersistentPoint → Binding's `DurableContinuityRef`. For
 * the current implementation this maps to `persistentPointId`; this is NOT a
 * frozen universal equivalence (§58) — future ref schemes stay open.
 */
export function durableContinuityRefOf(point: PersistentPoint): DurableContinuityRef {
  return point.persistentPointId;
}
