/**
 * PLMP-BIND-1 strict BindingDefinition parser (G10-B3 spike).
 *
 * House rules: reject unknown fields at every frozen level, fail closed,
 * `schemaVersion` exactly 1, presence-only continuity flags (`false` and
 * multi-field combinations rejected), semantic sets reject duplicates, a
 * present `continuity: {}` is preserved as meaningful canonical Case E (PF-01)
 * while a present-but-empty `hard` object normalizes to absent, an explicit
 * definition contains ≥1 subject, and the provided digest must equal the
 * computed canonical digest.
 *
 * The parser validates; the authoring helper (digest.ts users) creates. Monotonic
 * lineage enforcement of `BindingRevision` is a future repository/store
 * responsibility — the parser can only validate local shape.
 */

import type {
  BindingDefinition,
  BindingDigest,
  BindingHardRequirements,
  BindingRevision,
  ContinuityBindingIntent,
  SubjectBinding,
} from "./contract.js";
import { computeBindingDefinitionDigest } from "./digest.js";

export class BindingParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BindingParseError";
  }
}

export class BindingConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BindingConfigurationError";
  }
}

const DEFINITION_KEYS = ["schemaVersion", "bindingDefinitionId", "revision", "digest", "bindings"];
const SUBJECT_KEYS = ["continuity", "hard"];
const CONTINUITY_KEYS = ["pin", "requirePersistent", "preferPersistent"];
const HARD_KEYS = ["runtimeFeatures", "toolCapabilities"];

/**
 * Parse and validate `unknown` into a normalized canonical `BindingDefinition`.
 * Fails closed on unknown fields, invalid continuity states, duplicate
 * semantic-set values, empty maps, empty meaningless entries, and digest
 * mismatch.
 */
export function parseBindingDefinition(raw: unknown): BindingDefinition {
  const object = asObject(raw, "BindingDefinition");
  requireExactKeys(object, DEFINITION_KEYS, "BindingDefinition");

  const schemaVersion = object.schemaVersion;
  if (schemaVersion !== 1) {
    throw new BindingParseError(`BindingDefinition.schemaVersion must be 1`);
  }

  const bindingDefinitionId = nonEmptyString(object.bindingDefinitionId, "bindingDefinitionId");

  const revisionRaw = object.revision;
  if (
    typeof revisionRaw !== "number" ||
    !Number.isSafeInteger(revisionRaw) ||
    revisionRaw < 0
  ) {
    throw new BindingParseError(
      "BindingDefinition.revision must be a non-negative safe integer; " +
        "lineage monotonicity is a future repository/store responsibility",
    );
  }
  const revision: BindingRevision = revisionRaw;

  const providedDigest = nonEmptyString(object.digest, "digest");

  const bindingsRaw = asObject(object.bindings, "BindingDefinition.bindings");
  const subjectRefs = Object.keys(bindingsRaw);
  if (subjectRefs.length < 1) {
    throw new BindingParseError(
      "an explicit BindingDefinition must contain at least one subject entry",
    );
  }

  const bindings: Record<string, SubjectBinding> = {};
  // Canonical subject-key order (MapKey = SubjectIdentity; parser output is
  // canonical — do not rely on incoming JS insertion order).
  for (const subject of subjectRefs.sort()) {
    nonEmptyString(subject, "subject key");
    bindings[subject] = parseSubjectBinding(subject, bindingsRaw[subject]);
  }

  const candidate: BindingDefinition = Object.freeze({
    schemaVersion: 1,
    bindingDefinitionId,
    revision,
    digest: providedDigest,
    bindings: Object.freeze(bindings),
  });

  const computed = computeBindingDefinitionDigest(candidate);
  if (computed !== providedDigest) {
    throw new BindingParseError(
      `BindingDefinition.digest mismatch: provided ${providedDigest}, computed ${computed}`,
    );
  }
  return candidate;
}

function parseSubjectBinding(subject: string, raw: unknown): SubjectBinding {
  const object = asObject(raw, `SubjectBinding[${subject}]`);
  requireExactKeys(object, SUBJECT_KEYS, `SubjectBinding[${subject}]`);

  const continuityRaw = object.continuity;
  const hardRaw = object.hard;
  if (continuityRaw === undefined && hardRaw === undefined) {
    throw new BindingParseError(
      `SubjectBinding[${subject}] has no binding semantics: at least one of continuity/hard is required`,
    );
  }

  let continuity: ContinuityBindingIntent | undefined;
  if (continuityRaw !== undefined) {
    continuity = parseContinuityIntent(subject, continuityRaw);
  }

  let hard: BindingHardRequirements | undefined;
  if (hardRaw !== undefined) {
    hard = parseHardRequirements(subject, hardRaw);
    if (hard === undefined) {
      // present-but-empty hard normalizes to absent (PF-01/§8)
      hard = undefined;
    }
  }

  if (continuity === undefined && hard === undefined) {
    throw new BindingParseError(
      `SubjectBinding[${subject}] normalizes to an empty entry`,
    );
  }

  const entry: SubjectBinding = {
    ...(continuity === undefined ? {} : { continuity }),
    ...(hard === undefined ? {} : { hard }),
  };
  return Object.freeze(entry);
}

function parseContinuityIntent(subject: string, raw: unknown): ContinuityBindingIntent {
  const object = asObject(raw, `SubjectBinding[${subject}].continuity`);
  requireExactKeys(object, CONTINUITY_KEYS, `SubjectBinding[${subject}].continuity`);

  const present = CONTINUITY_KEYS.filter((key) => object[key] !== undefined);
  if (present.length > 1) {
    throw new BindingParseError(
      `SubjectBinding[${subject}].continuity admits at most one field; found [${present.join(", ")}]`,
    );
  }

  if (present.length === 0) {
    // Present-but-empty continuity object = meaningful explicit Case E (PF-01).
    return Object.freeze({});
  }

  const field = present[0] as string;
  const value = object[field];
  if (field === "pin") {
    return Object.freeze({ pin: nonEmptyString(value, `continuity.pin`) });
  }
  // requirePersistent / preferPersistent are presence-only literals.
  if (value !== true) {
    throw new BindingParseError(
      `SubjectBinding[${subject}].continuity.${field} must be exactly true when present (presence-only semantics)`,
    );
  }
  return field === "requirePersistent"
    ? Object.freeze({ requirePersistent: true })
    : Object.freeze({ preferPersistent: true });
}

function parseHardRequirements(
  subject: string,
  raw: unknown,
): BindingHardRequirements | undefined {
  const object = asObject(raw, `SubjectBinding[${subject}].hard`);
  requireExactKeys(object, HARD_KEYS, `SubjectBinding[${subject}].hard`);

  const runtimeFeatures =
    object.runtimeFeatures === undefined
      ? undefined
      : semanticSet(object.runtimeFeatures, `hard.runtimeFeatures`);
  const toolCapabilities =
    object.toolCapabilities === undefined
      ? undefined
      : semanticSet(object.toolCapabilities, `hard.toolCapabilities`);

  if (
    (runtimeFeatures === undefined || runtimeFeatures.length === 0) &&
    (toolCapabilities === undefined || toolCapabilities.length === 0)
  ) {
    return undefined; // present-but-empty hard normalizes to absent
  }
  const hard: BindingHardRequirements = {
    ...(runtimeFeatures === undefined || runtimeFeatures.length === 0
      ? {}
      : { runtimeFeatures }),
    ...(toolCapabilities === undefined || toolCapabilities.length === 0
      ? {}
      : { toolCapabilities }),
  };
  return Object.freeze(hard);
}

/** Semantic set: non-empty strings, duplicates rejected, canonical form sorted (BC-05: parser output itself is canonical). */
function semanticSet(raw: unknown, label: string): readonly string[] {
  if (!Array.isArray(raw)) {
    throw new BindingParseError(`${label} must be an array of strings`);
  }
  const seen = new Set<string>();
  for (const entry of raw) {
    const value = nonEmptyString(entry, `${label} entry`);
    if (seen.has(value)) {
      throw new BindingParseError(`${label} contains duplicate value "${value}"`);
    }
    seen.add(value);
  }
  return Object.freeze([...seen].sort());
}

function asObject(raw: unknown, label: string): Record<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new BindingParseError(`${label} must be an object`);
  }
  return raw as Record<string, unknown>;
}

function requireExactKeys(
  object: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) {
      throw new BindingParseError(`${label} has unknown field "${key}"`);
    }
  }
}

function nonEmptyString(raw: unknown, label: string): string {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new BindingParseError(`${label} must be a non-empty string`);
  }
  return raw;
}

/**
 * PF-02 (exact explicit subject coverage): with an explicit intent source, the
 * binding subjects must EQUAL the participating subjects as sets —
 * `Set(BindingSubjects) === Set(ParticipatingSubjects)`. A missing subject and
 * an extra subject are both configuration-validation failures before
 * resolution. Centralized here; the resolver reuses it so subject-set rules
 * exist in exactly one place.
 */
export function validateSubjectCoverage(
  participatingSubjects: readonly string[],
  definition: BindingDefinition,
): void {
  const participants = new Set(participatingSubjects);
  for (const subject of participatingSubjects) {
    if (definition.bindings[subject] === undefined) {
      throw new BindingConfigurationError(
        `explicit BindingDefinition is not total: participating subject "${subject}" has no entry ` +
          `(explicit definitions must cover every participating subject; a subject may select Case E via continuity: {})`,
      );
    }
  }
  for (const subject of Object.keys(definition.bindings)) {
    if (!participants.has(subject)) {
      throw new BindingConfigurationError(
        `explicit BindingDefinition is not exact: subject "${subject}" is not a participating subject ` +
          `(BindingSubjects must equal ParticipatingArchitectureSubjects)`,
      );
    }
  }
}
