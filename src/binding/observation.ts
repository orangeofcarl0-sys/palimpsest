/**
 * G10-C2 BindingObservationSnapshot — the canonical planning-observation
 * artifact that owns the Binding resolution's observation basis.
 *
 * Semantics (C2 §36): the snapshot means "the exact observation basis against
 * which availability/capability facts were evaluated". It is Runtime /
 * Continuity OBSERVATION — not a Definition, not a PersistentPoint store, not
 * a runtime carrier/session. `ObservedContinuityCandidate` carries ONLY the
 * facts the Binding resolver currently needs (point ref, availability,
 * capability profile) and must never grow memory/workspace/authority/PeerRef/
 * Session/Agent/organization/commitment fields (C2 §38).
 *
 * No default snapshot (C2 §46): a canonical default ephemeral-only snapshot
 * was reviewed and REJECTED — conditions 2/3 fail. An explicit
 * BindingDefinition may declare hard requirements; a default snapshot with
 * empty known capability sets would evaluate that unknown state as
 * `required_capability_unavailable`, collapsing UNKNOWN into UNAVAILABLE
 * (C2 §45). Every compile therefore requires an explicit observation
 * artifact (raw parsed at the boundary, or trusted parser/materializer
 * output).
 *
 * Identity vs content (C2 §39/§41):
 *   - content digest  = canonical observed content, domain
 *     `palimpsest.binding-observation.v1` (capability sets as semantic sets,
 *     candidates ordered by DurableContinuityRef, availability + capabilities
 *     included; snapshotId excluded — content identity).
 *   - snapshotId      = observation-INSTANCE identity (no clock required).
 *   - SnapshotRef.ref = deterministic digest of {snapshotId, content digest}
 *     under the second domain `palimpsest.binding-observation-ref.v1`.
 *   ⇒ same facts observed in a different observation instance → different
 *     SnapshotRef; same snapshotId with changed facts → different SnapshotRef.
 *     An arbitrary opaque id is never conflated with a verified content basis.
 *
 * Discipline (C2 §42): the materializer CREATES (canonicalize, digest,
 * freeze); the parser VALIDATES (exact keys, schemaVersion, stable snapshotId
 * grammar, duplicate capability values and candidate points rejected,
 * semantic sets canonicalized, supplied digest fail-closed against canonical
 * content, deep-frozen output, caller-input detached). No persistence, no
 * event schema, no observation history store (C2 §43). SHA-256/canonical-JSON
 * is an implementation choice, not PLMP-UAS-1 frozen semantics.
 */

import type { DurableContinuityRef } from "./contract.js";
import { canonicalDigest } from "../schema/canonical.js";
import { isStableIdentifier, normalizeStableIdentifier } from "../schema/identifier.js";

export const OBSERVATION_SNAPSHOT_DIGEST_DOMAIN = "palimpsest.binding-observation.v1";
export const OBSERVATION_SNAPSHOT_REF_DOMAIN = "palimpsest.binding-observation-ref.v1";

export interface CapabilityProfile {
  readonly runtimeFeatures?: readonly string[];
  readonly toolCapabilities?: readonly string[];
}

/** One observed durable continuity candidate. NOT a PersistentPoint (C2 §38). */
export interface ObservedContinuityCandidate {
  readonly point: DurableContinuityRef;
  readonly available: boolean;
  readonly runtimeFeatures?: readonly string[];
  readonly toolCapabilities?: readonly string[];
}

export interface BindingObservationSnapshot {
  readonly schemaVersion: 1;
  /** Observation-instance identity (stable-identifier grammar; no clock). */
  readonly snapshotId: string;
  /** Canonical observed-content digest (excludes snapshotId — content identity). */
  readonly digest: string;
  readonly ephemeralCapabilities: CapabilityProfile;
  readonly persistentCandidates: readonly ObservedContinuityCandidate[];
}

export class BindingObservationSnapshotParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BindingObservationSnapshotParseError";
  }
}

/** Lexicographic comparator — the one canonical order for sets and candidates. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function canonicalSet(values: readonly string[] | undefined): readonly string[] {
  return Object.freeze([...(values ?? [])].sort(compare));
}

function fail(message: string): never {
  throw new BindingObservationSnapshotParseError(message);
}

function canonicalProfile(profile: CapabilityProfile): CapabilityProfile {
  return Object.freeze({
    ...(profile.runtimeFeatures === undefined ? {} : { runtimeFeatures: canonicalSet(profile.runtimeFeatures) }),
    ...(profile.toolCapabilities === undefined
      ? {}
      : { toolCapabilities: canonicalSet(profile.toolCapabilities) }),
  });
}

/** Canonical digest content: observed facts only; snapshotId excluded (content identity). */
export function observationSnapshotDigestContent(
  ephemeralCapabilities: CapabilityProfile,
  persistentCandidates: readonly ObservedContinuityCandidate[],
): Record<string, unknown> {
  return {
    domain: OBSERVATION_SNAPSHOT_DIGEST_DOMAIN,
    ephemeralCapabilities: canonicalProfile(ephemeralCapabilities),
    persistentCandidates: [...persistentCandidates]
      .sort((a, b) => compare(a.point, b.point))
      .map((candidate) => ({
        point: candidate.point,
        available: candidate.available,
        ...(candidate.runtimeFeatures === undefined
          ? {}
          : { runtimeFeatures: canonicalSet(candidate.runtimeFeatures) }),
        ...(candidate.toolCapabilities === undefined
          ? {}
          : { toolCapabilities: canonicalSet(candidate.toolCapabilities) }),
      })),
  };
}

export function computeObservationSnapshotDigest(
  ephemeralCapabilities: CapabilityProfile,
  persistentCandidates: readonly ObservedContinuityCandidate[],
): string {
  return canonicalDigest(
    observationSnapshotDigestContent(ephemeralCapabilities, persistentCandidates),
  );
}

/** The resolution basis ref: digest of {snapshotId, content digest} under its own domain (C2 §41). */
export function observationRefOf(snapshot: BindingObservationSnapshot): string {
  return canonicalDigest({
    domain: OBSERVATION_SNAPSHOT_REF_DOMAIN,
    snapshotId: snapshot.snapshotId,
    digest: snapshot.digest,
  });
}

function validateCapabilityArray(value: unknown, what: string): readonly string[] {
  if (!Array.isArray(value)) fail(`${what} must be an array`);
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string" || entry.length === 0) {
      fail(`${what}: entries must be non-empty strings`);
    }
    if (seen.has(entry)) fail(`${what}: duplicate value "${entry}" (semantic set)`);
    seen.add(entry);
  }
  return value as string[];
}

function validateProfile(profile: unknown, what: string): CapabilityProfile {
  if (typeof profile !== "object" || profile === null || Array.isArray(profile)) {
    fail(`${what} must be an object`);
  }
  const object = profile as Record<string, unknown>;
  for (const key of Object.keys(object)) {
    if (key !== "runtimeFeatures" && key !== "toolCapabilities") {
      fail(`unknown ${what} field "${key}"`);
    }
  }
  const out: { runtimeFeatures?: readonly string[]; toolCapabilities?: readonly string[] } = {};
  if (object.runtimeFeatures !== undefined) {
    out.runtimeFeatures = validateCapabilityArray(object.runtimeFeatures, `${what}.runtimeFeatures`);
  }
  if (object.toolCapabilities !== undefined) {
    out.toolCapabilities = validateCapabilityArray(object.toolCapabilities, `${what}.toolCapabilities`);
  }
  return out;
}

function validateCandidateCapabilities(
  candidate: ObservedContinuityCandidate,
  what: string,
): void {
  if (candidate.runtimeFeatures !== undefined) {
    validateCapabilityArray(candidate.runtimeFeatures, `${what}.runtimeFeatures`);
  }
  if (candidate.toolCapabilities !== undefined) {
    validateCapabilityArray(candidate.toolCapabilities, `${what}.toolCapabilities`);
  }
}

function deepFreezeSnapshot(snapshot: BindingObservationSnapshot): BindingObservationSnapshot {
  return Object.freeze({
    schemaVersion: 1 as const,
    snapshotId: snapshot.snapshotId,
    digest: snapshot.digest,
    ephemeralCapabilities: Object.freeze({
      ...(snapshot.ephemeralCapabilities.runtimeFeatures === undefined
        ? {}
        : { runtimeFeatures: Object.freeze([...snapshot.ephemeralCapabilities.runtimeFeatures]) }),
      ...(snapshot.ephemeralCapabilities.toolCapabilities === undefined
        ? {}
        : { toolCapabilities: Object.freeze([...snapshot.ephemeralCapabilities.toolCapabilities]) }),
    }),
    persistentCandidates: Object.freeze(
      snapshot.persistentCandidates.map((candidate) =>
        Object.freeze({
          point: candidate.point,
          available: candidate.available,
          ...(candidate.runtimeFeatures === undefined
            ? {}
            : { runtimeFeatures: Object.freeze([...candidate.runtimeFeatures]) }),
          ...(candidate.toolCapabilities === undefined
            ? {}
            : { toolCapabilities: Object.freeze([...candidate.toolCapabilities]) }),
        }),
      ),
    ),
  });
}

function validateAndCanonicalize(
  ephemeralCapabilities: CapabilityProfile,
  persistentCandidates: readonly ObservedContinuityCandidate[],
  snapshotId: string,
): BindingObservationSnapshot {
  const canonicalEphemeral = canonicalProfile(ephemeralCapabilities);
  const seenPoints = new Set<string>();
  for (const candidate of persistentCandidates) {
    if (typeof candidate.point !== "string" || candidate.point.length === 0) {
      fail("persistentCandidates: every candidate needs a non-empty point ref");
    }
    if (seenPoints.has(candidate.point)) {
      fail(`duplicate candidate point "${candidate.point}"`);
    }
    seenPoints.add(candidate.point);
    validateCandidateCapabilities(candidate, `persistentCandidates[${candidate.point}]`);
  }
  const digest = computeObservationSnapshotDigest(canonicalEphemeral, persistentCandidates);
  return deepFreezeSnapshot({
    schemaVersion: 1,
    snapshotId,
    digest,
    ephemeralCapabilities: canonicalEphemeral,
    persistentCandidates: Object.freeze(
      [...persistentCandidates].sort((a, b) => compare(a.point, b.point)),
    ),
  });
}

/**
 * Materializer: CREATE a canonical observation snapshot (validate inputs,
 * canonicalize sets/candidate order, compute content digest, freeze).
 * Does not persist.
 */
export function materializeObservationSnapshot(input: {
  readonly snapshotId: string;
  readonly ephemeralCapabilities: CapabilityProfile;
  readonly persistentCandidates?: readonly ObservedContinuityCandidate[];
}): BindingObservationSnapshot {
  if (typeof input.snapshotId !== "string") fail("snapshotId must be a string");
  const snapshotId = normalizeStableIdentifier(input.snapshotId);
  if (!isStableIdentifier(snapshotId)) {
    fail(
      "snapshotId must be a stable identifier: 1-128 ASCII characters, starting " +
        "with an alphanumeric, then [A-Za-z0-9._:-]",
    );
  }
  const ephemeralCapabilities = validateProfile(input.ephemeralCapabilities, "ephemeralCapabilities");
  const persistentCandidates = input.persistentCandidates ?? [];
  return validateAndCanonicalize(ephemeralCapabilities, persistentCandidates, snapshotId);
}

/**
 * Strict parser from `unknown` (the observation trust boundary). Same
 * obligations as the materializer, plus: exact keys, schemaVersion exactly 1,
 * and the supplied digest must equal the canonical content digest
 * (fail-closed — a tampered digest is never accepted).
 */
export function parseObservationSnapshot(raw: unknown): BindingObservationSnapshot {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail("BindingObservationSnapshot must be an object");
  }
  const object = raw as Record<string, unknown>;
  const allowedKeys = ["schemaVersion", "snapshotId", "digest", "ephemeralCapabilities", "persistentCandidates"];
  for (const key of Object.keys(object)) {
    if (!allowedKeys.includes(key)) fail(`unknown BindingObservationSnapshot field "${key}"`);
  }
  for (const key of allowedKeys) {
    if (!Object.hasOwn(object, key)) fail(`BindingObservationSnapshot: field "${key}" is required`);
  }
  if (object.schemaVersion !== 1) fail("schemaVersion must be 1");
  if (typeof object.snapshotId !== "string") fail("snapshotId must be a string");
  const snapshotId = normalizeStableIdentifier(object.snapshotId);
  if (!isStableIdentifier(snapshotId)) {
    fail(
      "snapshotId must be a stable identifier: 1-128 ASCII characters, starting " +
        "with an alphanumeric, then [A-Za-z0-9._:-]",
    );
  }
  if (typeof object.digest !== "string" || object.digest.length === 0) {
    fail("digest must be a non-empty string");
  }
  if (
    typeof object.ephemeralCapabilities !== "object" ||
    object.ephemeralCapabilities === null ||
    !Array.isArray(object.persistentCandidates)
  ) {
    fail("ephemeralCapabilities must be an object and persistentCandidates an array");
  }
  const ephemeralCapabilities = validateProfile(object.ephemeralCapabilities, "ephemeralCapabilities");
  const persistentCandidates = (object.persistentCandidates as unknown[]).map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      fail(`persistentCandidates[${index}] must be an object`);
    }
    const candidate = entry as Record<string, unknown>;
    for (const key of Object.keys(candidate)) {
      if (!["point", "available", "runtimeFeatures", "toolCapabilities"].includes(key)) {
        fail(`unknown persistentCandidates[${index}] field "${key}"`);
      }
    }
    if (!Object.hasOwn(candidate, "point") || !Object.hasOwn(candidate, "available")) {
      fail(`persistentCandidates[${index}] requires point and available`);
    }
    if (typeof candidate.point !== "string" || candidate.point.length === 0) {
      fail(`persistentCandidates[${index}].point must be a non-empty string`);
    }
    if (typeof candidate.available !== "boolean") {
      fail(`persistentCandidates[${index}].available must be a boolean`);
    }
    return candidate as unknown as ObservedContinuityCandidate;
  });
  const canonical = validateAndCanonicalize(ephemeralCapabilities, persistentCandidates, snapshotId);
  if (object.digest !== canonical.digest) {
    fail(
      `digest mismatch: supplied ${object.digest}, computed ${canonical.digest} ` +
        "(the parser validates; it never replaces a bad digest)",
    );
  }
  return canonical;
}
