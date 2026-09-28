/**
 * E5-P §5/§9 — the PROCEDURE CONTENT schema: a DECLARATIVE, instructional method body.
 *
 *     Procedure  ≠  executable code      Procedure  ≠  shell command
 *     Procedure  ≠  RecipeDefinition     Procedure  ≠  plugin / host Skill
 *
 * A procedure tells a worker HOW prior experience suggests proceeding. It is cognitive
 * infrastructure: it authorizes nothing. Every field below is INSTRUCTIONAL TEXT or a
 * descriptive label — there is deliberately no field that names a command, an argv, a
 * script, an endpoint, an effect, a scheduler mutation or an authority. A worker that
 * receives a procedure still acts only within its own Work envelope and effects policy,
 * because nothing here can widen either one.
 *
 * ## Why the body is structured rather than one markdown blob (§9)
 *
 * A single `markdown` string would make the method unreviewable: no owner could tell an
 * applicability clause from a step, and a later revision could silently drop a limitation.
 * The fields below are the preferred middle ground — strict enough to review and diff,
 * and nowhere near a programming language.
 *
 * ## Identity stability (§8)
 *
 * `steps` is ORDERED (the order is the method). Every other list is a SET, so it is
 * canonicalized by `canonicalProcedureList` — deduplicated and sorted — which is what makes
 * "same semantic content" produce the SAME digest regardless of the order the authoring
 * model happened to emit. No wall-clock value and no random id appears anywhere here.
 *
 * Layer: L2 (`src/procedures/`). Depends on `src/schema/` only.
 */

import { canonicalDigest } from "../schema/canonical.js";

export const PROCEDURE_CONTENT_DOMAIN = "palimpsest.procedures.content.v1";
export const PROCEDURE_CONTENT_SCHEMA_VERSION = 1;

export type ProcedureContentErrorKind =
  | "malformed_artifact"
  | "unknown_field"
  | "invalid_value"
  | "unknown_schema_version";

export class ProcedureContentError extends Error {
  constructor(
    readonly kind: ProcedureContentErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ProcedureContentError";
  }
}

export function procedureFail(kind: ProcedureContentErrorKind, message: string): never {
  throw new ProcedureContentError(kind, message);
}

/* ------------------------------------------------------------------ *
 * Strict helpers — fail closed; never an unchecked cast.
 * ------------------------------------------------------------------ */

export function procedureObject(raw: unknown, what: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    procedureFail("malformed_artifact", `${what} must be an object`);
  }
  return raw as Record<string, unknown>;
}

export function procedureKeys(
  object: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  what: string,
): void {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) procedureFail("unknown_field", `${what}: unknown field "${key}"`);
  }
  for (const key of required) {
    if (!Object.hasOwn(object, key) || object[key] === undefined) {
      procedureFail("malformed_artifact", `${what}: missing required field "${key}"`);
    }
  }
}

export function procedureText(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    procedureFail("invalid_value", `${what} must be a non-empty string`);
  }
  return value;
}

export function procedureOptionalText(value: unknown, what: string): string | undefined {
  return value === undefined ? undefined : procedureText(value, what);
}

export function procedureDigest(value: unknown, what: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    procedureFail("invalid_value", `${what} must be a canonical sha256 digest`);
  }
  return value;
}

/**
 * §8: a SET-like list is canonicalized — deduplicated and sorted — so the authoring model's
 * emission order cannot change the procedure's identity. Byte-identical inputs converge; the
 * same content in a different order converges too.
 */
export function canonicalProcedureList(value: unknown, what: string): readonly string[] {
  if (!Array.isArray(value)) procedureFail("malformed_artifact", `${what} must be an array`);
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    seen.add(procedureText(entry, `${what}[${index}]`));
  }
  return Object.freeze([...seen].sort());
}

/* ------------------------------------------------------------------ *
 * ProcedureContent
 * ------------------------------------------------------------------ */

/** One ORDERED method step. An instruction, never a command (§5). */
export interface ProcedureStep {
  readonly instruction: string;
  readonly note?: string | undefined;
}

/**
 * The declarative method body.
 *
 * Every list except `steps` is canonicalized. `recommendedRecipeRefs` is a DESCRIPTIVE
 * reference to existing recipe modes (§20): a recommendation is not a compiled plan and not
 * an execution, and no code path may act on it.
 */
export interface ProcedureContent {
  readonly schemaVersion: 1;
  readonly title: string;
  readonly purpose: string;
  readonly applicability: readonly string[];
  readonly preconditions: readonly string[];
  readonly steps: readonly ProcedureStep[];
  readonly checks: readonly string[];
  readonly expectedOutputs: readonly string[];
  readonly limitations: readonly string[];
  readonly capabilityHints: readonly string[];
  readonly recommendedRecipeRefs: readonly string[];
}

export const PROCEDURE_CONTENT_KEYS = [
  "schemaVersion",
  "title",
  "purpose",
  "applicability",
  "preconditions",
  "steps",
  "checks",
  "expectedOutputs",
  "limitations",
  "capabilityHints",
  "recommendedRecipeRefs",
] as const;

function parseSteps(value: unknown, what: string): readonly ProcedureStep[] {
  if (!Array.isArray(value)) procedureFail("malformed_artifact", `${what} must be an array`);
  if (value.length === 0) procedureFail("invalid_value", `${what} must carry at least one step`);
  const steps: ProcedureStep[] = [];
  for (const [index, entry] of value.entries()) {
    const object = procedureObject(entry, `${what}[${index}]`);
    procedureKeys(object, ["instruction", "note"], ["instruction"], `${what}[${index}]`);
    const note = procedureOptionalText(object.note, `${what}[${index}].note`);
    steps.push(
      Object.freeze({
        instruction: procedureText(object.instruction, `${what}[${index}].instruction`),
        ...(note === undefined ? {} : { note }),
      }),
    );
  }
  return Object.freeze(steps);
}

/**
 * Strict-parse an UNTRUSTED authoring proposal into a `ProcedureContent`.
 *
 * This is the §7 boundary: a model or host may propose this shape, and everything it cannot
 * express is rejected rather than coerced. An unknown field is an error, not a hint that the
 * authoring seam may extend the schema.
 */
export function parseProcedureContent(raw: unknown, what = "ProcedureContent"): ProcedureContent {
  const object = procedureObject(raw, what);
  procedureKeys(object, PROCEDURE_CONTENT_KEYS, PROCEDURE_CONTENT_KEYS, what);
  if (object.schemaVersion !== PROCEDURE_CONTENT_SCHEMA_VERSION) {
    procedureFail("unknown_schema_version", `${what}.schemaVersion must be ${PROCEDURE_CONTENT_SCHEMA_VERSION}`);
  }
  return Object.freeze({
    schemaVersion: PROCEDURE_CONTENT_SCHEMA_VERSION,
    title: procedureText(object.title, `${what}.title`),
    purpose: procedureText(object.purpose, `${what}.purpose`),
    applicability: canonicalProcedureList(object.applicability, `${what}.applicability`),
    preconditions: canonicalProcedureList(object.preconditions, `${what}.preconditions`),
    steps: parseSteps(object.steps, `${what}.steps`),
    checks: canonicalProcedureList(object.checks, `${what}.checks`),
    expectedOutputs: canonicalProcedureList(object.expectedOutputs, `${what}.expectedOutputs`),
    limitations: canonicalProcedureList(object.limitations, `${what}.limitations`),
    capabilityHints: canonicalProcedureList(object.capabilityHints, `${what}.capabilityHints`),
    recommendedRecipeRefs: canonicalProcedureList(object.recommendedRecipeRefs, `${what}.recommendedRecipeRefs`),
  });
}

/**
 * Materialize a content value from a caller-supplied body.
 *
 * `applicability` and `limitations` are REQUIRED to be non-empty: §11 freezes that admission
 * preserves scope and limitations, so a method with no stated scope cannot be admitted
 * through this owner at all. This is a shape rule, not an authority.
 */
export function materializeProcedureContent(input: unknown): ProcedureContent {
  const content = parseProcedureContent(input);
  if (content.applicability.length === 0) {
    procedureFail("invalid_value", "ProcedureContent.applicability must state at least one applicability clause");
  }
  if (content.limitations.length === 0) {
    procedureFail("invalid_value", "ProcedureContent.limitations must state at least one known limitation");
  }
  return content;
}

/** The canonical digest of a method body. Deterministic; no clock, no id, no order sensitivity. */
export function procedureContentDigestOf(content: ProcedureContent): string {
  return canonicalDigest({ domain: PROCEDURE_CONTENT_DOMAIN, content });
}
