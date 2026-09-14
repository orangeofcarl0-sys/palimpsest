/**
 * G10-S recipe artifacts — versioned, digest-bound PRODUCT CONFIG in code.
 *
 *   RecipeDefinition ≠ Authority        RecipePlan ≠ Execution
 *   CompiledRecipePlan ≠ Effect         Compilation ≠ Commitment/Boundary/Admission
 *
 * A recipe is a descriptive, immutable configuration: what a mode of working
 * requires and what it is allowed to ask existing governed services to do. It owns
 * NO store, NO mutator, NO authority: it never grants commitment, boundary,
 * epistemic, admission, evolution, or effect authority. `readiness` is stated per
 * capability and honestly (no symmetric catalog); capabilities that are not wired
 * are PREVIEW_ONLY / CONDITIONAL, never padded to PRODUCTION_READY.
 *
 * All canonical-JSON numbers are safe integers (canonical JSON forbids floats), and
 * no field is named score/health/weight — readiness is a stated enum, not a score.
 */

import type { JsonObject, JsonValue } from "../schema/canonical.js";
import { canonicalDigest } from "../schema/canonical.js";
import { isStableIdentifier, normalizeStableIdentifier } from "../schema/identifier.js";
import type { PeerRef } from "../federation/peer.js";
import { parsePeerRef } from "../federation/peer.js";

export const RECIPE_DEFINITION_DOMAIN = "palimpsest.recipe-definition.v1";
export const RECIPE_PLAN_DOMAIN = "palimpsest.recipe-plan.v1";
export const COMPILED_RECIPE_PLAN_DOMAIN = "palimpsest.compiled-recipe-plan.v1";

export class RecipeArtifactError extends Error {
  constructor(
    readonly kind:
      | "malformed_artifact"
      | "unknown_field"
      | "invalid_value"
      | "unknown_schema_version"
      | "unknown_kind",
    message: string,
  ) {
    super(message);
    this.name = "RecipeArtifactError";
  }
}

function fail(kind: RecipeArtifactError["kind"], message: string): never {
  throw new RecipeArtifactError(kind, message);
}

/* ------------------------------------------------------------------ *
 * Enums
 * ------------------------------------------------------------------ */

export const RECIPE_BASE_MODES = ["FOCUS", "EXPLORE", "COORDINATE"] as const;
export type RecipeBaseMode = (typeof RECIPE_BASE_MODES)[number];

export const RECIPE_MODIFIERS = ["VERIFY", "MONITOR"] as const;
export type RecipeModifier = (typeof RECIPE_MODIFIERS)[number];

export const RECIPE_READINESS = ["PRODUCTION_READY", "CONDITIONAL", "PREVIEW_ONLY", "UNAVAILABLE"] as const;
export type RecipeReadiness = (typeof RECIPE_READINESS)[number];

export const RECIPE_ROLES = ["base", "modifier"] as const;
export type RecipeRole = (typeof RECIPE_ROLES)[number];

/* ------------------------------------------------------------------ *
 * Strict helpers (fail closed; never an unchecked cast)
 * ------------------------------------------------------------------ */

function recipeObject(raw: unknown, what: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail("malformed_artifact", `${what} must be an object`);
  }
  return raw as Record<string, unknown>;
}

function recipeKeys(
  object: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  what: string,
): void {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) fail("unknown_field", `${what}: unknown field "${key}"`);
  }
  for (const key of required) {
    if (!Object.hasOwn(object, key) || object[key] === undefined) {
      fail("malformed_artifact", `${what}: missing required field "${key}"`);
    }
  }
}

function recipeString(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") fail("invalid_value", `${what} must be a non-empty string`);
  return value;
}

function recipeStableId(value: unknown, what: string): string {
  if (typeof value !== "string") fail("invalid_value", `${what} must be a string`);
  const normalized = normalizeStableIdentifier(value);
  if (!isStableIdentifier(normalized)) fail("invalid_value", `${what} must be a stable identifier`);
  return normalized;
}

function recipeDigest(value: unknown, what: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    fail("invalid_value", `${what} must be a canonical sha256 digest`);
  }
  return value;
}

function recipeNonNegInt(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    fail("invalid_value", `${what} must be a safe integer (canonical JSON forbids non-integers)`);
  }
  if (value < 0) fail("invalid_value", `${what} must be >= 0`);
  return value;
}

function recipeEnum<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    fail("unknown_kind", `${what} must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

function recipeStringArray(value: unknown, what: string): readonly string[] {
  if (!Array.isArray(value)) fail("invalid_value", `${what} must be an array`);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const text = recipeString(item, `${what}[]`);
    if (seen.has(text)) fail("invalid_value", `${what}: duplicate value "${text}"`);
    seen.add(text);
    out.push(text);
  }
  return Object.freeze(out);
}

function recipeEnumArray<T extends string>(value: unknown, allowed: readonly T[], what: string): readonly T[] {
  if (!Array.isArray(value)) fail("invalid_value", `${what} must be an array`);
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of value) {
    const literal = recipeEnum(item, allowed, `${what}[]`);
    if (seen.has(literal)) fail("invalid_value", `${what}: duplicate value "${literal}"`);
    seen.add(literal);
    out.push(literal);
  }
  return Object.freeze(out);
}

/** Validate a canonical-JSON value: floats and non-JSON leaves fail closed. */
function recipeJsonValue(value: unknown, what: string): JsonValue {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) fail("invalid_value", `${what} must be a safe integer (canonical JSON forbids non-integers)`);
    return value;
  }
  if (typeof value === "string") return value.normalize("NFC");
  if (Array.isArray(value)) {
    return value.map((item, index) => recipeJsonValue(item, `${what}[${index}]`));
  }
  if (typeof value === "object" && !(value instanceof Date) && !(value instanceof Uint8Array)) {
    const out: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const normalizedKey = key.normalize("NFC");
      if (Object.prototype.hasOwnProperty.call(out, normalizedKey)) {
        fail("invalid_value", `${what}: duplicate key after NFC normalization "${normalizedKey}"`);
      }
      out[normalizedKey] = recipeJsonValue(item, `${what}.${normalizedKey}`);
    }
    return out;
  }
  fail("invalid_value", `${what} must be a JSON value`);
}

function recipeJsonObject(value: unknown, what: string): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value) || value instanceof Date || value instanceof Uint8Array) {
    fail("invalid_value", `${what} must be a JSON object`);
  }
  return recipeJsonValue(value, what) as JsonObject;
}

function recipeParameters(value: unknown, what: string): Record<string, JsonValue> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail("invalid_value", `${what} must be a JSON object`);
  const out: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.normalize("NFC");
    if (Object.prototype.hasOwnProperty.call(out, normalizedKey)) {
      fail("invalid_value", `${what}: duplicate key after NFC normalization "${normalizedKey}"`);
    }
    out[normalizedKey] = recipeJsonValue(item, `${what}.${normalizedKey}`);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * RecipeDefinition
 * ------------------------------------------------------------------ */

export interface RecipeDefinition {
  readonly schemaVersion: 1;
  readonly recipeId: string;
  readonly version: number;
  readonly role: RecipeRole;
  readonly baseMode?: RecipeBaseMode;
  readonly modifier?: RecipeModifier;
  readonly supportedModifiers: readonly RecipeModifier[];
  readonly capabilityRequirements: readonly string[];
  /** A JSON object describing the accepted parameters. Never executable code. */
  readonly parameterSchema: unknown;
  readonly readiness: RecipeReadiness;
  readonly limitations: readonly string[];
  readonly digest: string;
}

export function recipeDefinitionDigestOf(input: Omit<RecipeDefinition, "digest">): string {
  return canonicalDigest({ domain: RECIPE_DEFINITION_DOMAIN, recipe: input });
}

export interface MaterializeRecipeDefinitionInput {
  readonly recipeId: string;
  readonly version?: number | undefined;
  readonly role: RecipeRole;
  /** Required iff role === "base"; forbidden otherwise. */
  readonly baseMode?: RecipeBaseMode | undefined;
  /** Required iff role === "modifier"; forbidden otherwise. */
  readonly modifier?: RecipeModifier | undefined;
  readonly supportedModifiers?: readonly RecipeModifier[] | undefined;
  readonly capabilityRequirements?: readonly string[] | undefined;
  readonly parameterSchema?: unknown;
  readonly readiness: RecipeReadiness;
  readonly limitations?: readonly string[] | undefined;
}

export function materializeRecipeDefinition(input: MaterializeRecipeDefinitionInput): RecipeDefinition {
  const role = recipeEnum(input.role, RECIPE_ROLES, "recipe.role");
  const modeFields: { baseMode?: RecipeBaseMode; modifier?: RecipeModifier } = {};
  if (role === "base") {
    if (input.baseMode === undefined) fail("invalid_value", "a base recipe requires baseMode");
    if (input.modifier !== undefined) fail("invalid_value", "a base recipe must not carry modifier");
    modeFields.baseMode = recipeEnum(input.baseMode, RECIPE_BASE_MODES, "recipe.baseMode");
  } else {
    if (input.modifier === undefined) fail("invalid_value", "a modifier recipe requires modifier");
    if (input.baseMode !== undefined) fail("invalid_value", "a modifier recipe must not carry baseMode");
    modeFields.modifier = recipeEnum(input.modifier, RECIPE_MODIFIERS, "recipe.modifier");
  }
  const base: Omit<RecipeDefinition, "digest"> = {
    schemaVersion: 1 as const,
    recipeId: recipeStableId(input.recipeId, "recipeId"),
    version: input.version === undefined ? 1 : recipeNonNegInt(input.version, "version"),
    role,
    ...modeFields,
    supportedModifiers:
      input.supportedModifiers === undefined
        ? Object.freeze([] as RecipeModifier[])
        : recipeEnumArray(input.supportedModifiers, RECIPE_MODIFIERS, "supportedModifiers"),
    capabilityRequirements:
      input.capabilityRequirements === undefined
        ? Object.freeze([] as string[])
        : recipeStringArray(input.capabilityRequirements, "capabilityRequirements"),
    parameterSchema: input.parameterSchema === undefined ? Object.freeze({}) : recipeJsonObject(input.parameterSchema, "parameterSchema"),
    readiness: recipeEnum(input.readiness, RECIPE_READINESS, "readiness"),
    limitations:
      input.limitations === undefined ? Object.freeze([] as string[]) : recipeStringArray(input.limitations, "limitations"),
  };
  return Object.freeze({ ...base, digest: recipeDefinitionDigestOf(base) });
}

const RECIPE_DEFINITION_KEYS = [
  "schemaVersion",
  "recipeId",
  "version",
  "role",
  "baseMode",
  "modifier",
  "supportedModifiers",
  "capabilityRequirements",
  "parameterSchema",
  "readiness",
  "limitations",
  "digest",
] as const;

export function parseRecipeDefinition(raw: unknown, what = "RecipeDefinition"): RecipeDefinition {
  const object = recipeObject(raw, what);
  recipeKeys(
    object,
    RECIPE_DEFINITION_KEYS,
    ["schemaVersion", "recipeId", "version", "role", "supportedModifiers", "capabilityRequirements", "parameterSchema", "readiness", "limitations", "digest"],
    what,
  );
  if (object.schemaVersion !== 1) fail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  const materialized = materializeRecipeDefinition({
    recipeId: object.recipeId as string,
    version: object.version as number,
    role: object.role as RecipeRole,
    ...(object.baseMode === undefined ? {} : { baseMode: object.baseMode as RecipeBaseMode }),
    ...(object.modifier === undefined ? {} : { modifier: object.modifier as RecipeModifier }),
    supportedModifiers: object.supportedModifiers as readonly RecipeModifier[],
    capabilityRequirements: object.capabilityRequirements as readonly string[],
    parameterSchema: object.parameterSchema,
    readiness: object.readiness as RecipeReadiness,
    limitations: object.limitations as readonly string[],
  });
  const digest = recipeDigest(object.digest, `${what}.digest`);
  if (digest !== materialized.digest) fail("invalid_value", `${what}.digest does not match its content`);
  return materialized;
}

/* ------------------------------------------------------------------ *
 * RecipePlan — planId is digest-derived (cannot be unbound)
 * ------------------------------------------------------------------ */

export interface RecipeDefinitionRef {
  readonly recipeId: string;
  readonly version: number;
  readonly digest: string;
}

export function materializeRecipeDefinitionRef(input: unknown, what = "RecipeDefinitionRef"): RecipeDefinitionRef {
  const object = recipeObject(input, what);
  recipeKeys(object, ["recipeId", "version", "digest"], ["recipeId", "version", "digest"], what);
  return Object.freeze({
    recipeId: recipeStableId(object.recipeId, `${what}.recipeId`),
    version: recipeNonNegInt(object.version, `${what}.version`),
    digest: recipeDigest(object.digest, `${what}.digest`),
  });
}

export interface RecipePlan {
  readonly schemaVersion: 1;
  readonly planId: string;
  readonly baseRecipeRef: RecipeDefinitionRef;
  readonly modifierRefs: readonly RecipeDefinitionRef[];
  readonly parameters: Record<string, JsonValue>;
  readonly requiredCapabilities: readonly string[];
  readonly existingSubjectRefs: readonly string[];
  readonly rationaleDigest: string;
  readonly digest: string;
}

export function recipePlanDigestOf(input: Omit<RecipePlan, "digest" | "planId">): string {
  return canonicalDigest({ domain: RECIPE_PLAN_DOMAIN, plan: input });
}

/** planId is derived from the digest over all content EXCEPT planId, so it cannot be unbound. */
export function recipePlanIdOf(contentDigest: string): string {
  return `plan-${contentDigest.slice(0, 32)}`;
}

export interface MaterializeRecipePlanInput {
  readonly baseRecipeRef: RecipeDefinitionRef;
  readonly modifierRefs?: readonly RecipeDefinitionRef[] | undefined;
  readonly parameters?: Readonly<Record<string, unknown>> | undefined;
  readonly requiredCapabilities?: readonly string[] | undefined;
  readonly existingSubjectRefs?: readonly string[] | undefined;
  readonly rationaleDigest: string;
}

export function materializeRecipePlan(input: MaterializeRecipePlanInput): RecipePlan {
  const body: Omit<RecipePlan, "digest" | "planId"> = {
    schemaVersion: 1 as const,
    baseRecipeRef: materializeRecipeDefinitionRef(input.baseRecipeRef, "baseRecipeRef"),
    modifierRefs: Object.freeze((input.modifierRefs ?? []).map((ref, index) => materializeRecipeDefinitionRef(ref, `modifierRefs[${index}]`))),
    parameters: input.parameters === undefined ? {} : recipeParameters(input.parameters, "parameters"),
    requiredCapabilities:
      input.requiredCapabilities === undefined
        ? Object.freeze([] as string[])
        : recipeStringArray(input.requiredCapabilities, "requiredCapabilities"),
    existingSubjectRefs:
      input.existingSubjectRefs === undefined
        ? Object.freeze([] as string[])
        : recipeStringArray(input.existingSubjectRefs, "existingSubjectRefs"),
    rationaleDigest: recipeDigest(input.rationaleDigest, "rationaleDigest"),
  };
  const digest = recipePlanDigestOf(body);
  return Object.freeze({ ...body, planId: recipePlanIdOf(digest), digest });
}

const RECIPE_PLAN_KEYS = [
  "schemaVersion",
  "planId",
  "baseRecipeRef",
  "modifierRefs",
  "parameters",
  "requiredCapabilities",
  "existingSubjectRefs",
  "rationaleDigest",
  "digest",
] as const;

export function parseRecipePlan(raw: unknown, what = "RecipePlan"): RecipePlan {
  const object = recipeObject(raw, what);
  recipeKeys(object, RECIPE_PLAN_KEYS, RECIPE_PLAN_KEYS, what);
  if (object.schemaVersion !== 1) fail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  if (!Array.isArray(object.modifierRefs)) fail("malformed_artifact", `${what}.modifierRefs must be an array`);
  const body: Omit<RecipePlan, "digest" | "planId"> = {
    schemaVersion: 1 as const,
    baseRecipeRef: materializeRecipeDefinitionRef(object.baseRecipeRef, `${what}.baseRecipeRef`),
    modifierRefs: Object.freeze((object.modifierRefs as unknown[]).map((ref, index) => materializeRecipeDefinitionRef(ref, `${what}.modifierRefs[${index}]`))),
    parameters: recipeParameters(object.parameters, `${what}.parameters`),
    requiredCapabilities: recipeStringArray(object.requiredCapabilities, `${what}.requiredCapabilities`),
    existingSubjectRefs: recipeStringArray(object.existingSubjectRefs, `${what}.existingSubjectRefs`),
    rationaleDigest: recipeDigest(object.rationaleDigest, `${what}.rationaleDigest`),
  };
  const digest = recipeDigest(object.digest, `${what}.digest`);
  if (recipePlanDigestOf(body) !== digest) fail("invalid_value", `${what}.digest does not match its content`);
  const planId = recipeString(object.planId, `${what}.planId`);
  if (planId !== recipePlanIdOf(digest)) fail("invalid_value", `${what}.planId must be derived from the plan content digest`);
  return Object.freeze({ ...body, planId, digest });
}

/* ------------------------------------------------------------------ *
 * CompiledStep — descriptive plan steps only
 * ------------------------------------------------------------------ */

export const COMPILED_STEP_KINDS = [
  "reuse_principal",
  "open_reasoning_cell",
  "surface_contact_need",
  "prepare_boundary_context",
  "bind_verification",
  "bind_monitoring",
] as const;
export type CompiledStepKind = (typeof COMPILED_STEP_KINDS)[number];

export type CompiledStep =
  | { readonly kind: "reuse_principal" }
  | { readonly kind: "open_reasoning_cell"; readonly branchCount: number; readonly question: string }
  | { readonly kind: "surface_contact_need"; readonly peerRefs: readonly PeerRef[] }
  | { readonly kind: "prepare_boundary_context"; readonly peerRefs: readonly PeerRef[] }
  | { readonly kind: "bind_verification"; readonly verifierRef: string }
  | { readonly kind: "bind_monitoring"; readonly campaignRef?: string };

function recipePeerRefs(value: unknown, what: string): readonly PeerRef[] {
  if (!Array.isArray(value)) fail("invalid_value", `${what} must be an array`);
  return Object.freeze(
    (value as unknown[]).map((entry, index) => {
      try {
        return parsePeerRef(entry);
      } catch (error) {
        fail("invalid_value", `${what}[${index}] is not a valid PeerRef: ${error instanceof Error ? error.message : String(error)}`);
      }
    }),
  );
}

export function parseCompiledStep(raw: unknown, what = "CompiledStep"): CompiledStep {
  const object = recipeObject(raw, what);
  const kind = recipeEnum(object.kind, COMPILED_STEP_KINDS, `${what}.kind`);
  switch (kind) {
    case "reuse_principal":
      recipeKeys(object, ["kind"], ["kind"], what);
      return Object.freeze({ kind: "reuse_principal" as const });
    case "open_reasoning_cell":
      recipeKeys(object, ["kind", "branchCount", "question"], ["kind", "branchCount", "question"], what);
      return Object.freeze({
        kind: "open_reasoning_cell" as const,
        branchCount: recipeNonNegInt(object.branchCount, `${what}.branchCount`),
        question: recipeString(object.question, `${what}.question`),
      });
    case "surface_contact_need":
      recipeKeys(object, ["kind", "peerRefs"], ["kind", "peerRefs"], what);
      return Object.freeze({ kind: "surface_contact_need" as const, peerRefs: recipePeerRefs(object.peerRefs, `${what}.peerRefs`) });
    case "prepare_boundary_context":
      recipeKeys(object, ["kind", "peerRefs"], ["kind", "peerRefs"], what);
      return Object.freeze({ kind: "prepare_boundary_context" as const, peerRefs: recipePeerRefs(object.peerRefs, `${what}.peerRefs`) });
    case "bind_verification":
      recipeKeys(object, ["kind", "verifierRef"], ["kind", "verifierRef"], what);
      return Object.freeze({ kind: "bind_verification" as const, verifierRef: recipeString(object.verifierRef, `${what}.verifierRef`) });
    case "bind_monitoring": {
      recipeKeys(object, ["kind", "campaignRef"], ["kind"], what);
      if (object.campaignRef === undefined) return Object.freeze({ kind: "bind_monitoring" as const });
      return Object.freeze({ kind: "bind_monitoring" as const, campaignRef: recipeString(object.campaignRef, `${what}.campaignRef`) });
    }
  }
}

/* ------------------------------------------------------------------ *
 * CompiledRecipePlan — descriptive compilation only
 * ------------------------------------------------------------------ */

export interface CompiledRecipePlan {
  readonly schemaVersion: 1;
  readonly planDigest: string;
  readonly baseMode: RecipeBaseMode;
  readonly modifiers: readonly RecipeModifier[];
  readonly steps: readonly CompiledStep[];
  readonly requiredCapabilities: readonly string[];
  /** Explicit statements that compilation grants NO authority. */
  readonly authorityNotes: readonly string[];
  readonly digest: string;
}

export function compiledRecipePlanDigestOf(input: Omit<CompiledRecipePlan, "digest">): string {
  return canonicalDigest({ domain: COMPILED_RECIPE_PLAN_DOMAIN, plan: input });
}

export interface MaterializeCompiledRecipePlanInput {
  readonly planDigest: string;
  readonly baseMode: RecipeBaseMode;
  readonly modifiers: readonly RecipeModifier[];
  readonly steps: readonly unknown[];
  readonly requiredCapabilities?: readonly string[] | undefined;
  readonly authorityNotes: readonly string[];
}

export function materializeCompiledRecipePlan(input: MaterializeCompiledRecipePlanInput): CompiledRecipePlan {
  const body: Omit<CompiledRecipePlan, "digest"> = {
    schemaVersion: 1 as const,
    planDigest: recipeDigest(input.planDigest, "planDigest"),
    baseMode: recipeEnum(input.baseMode, RECIPE_BASE_MODES, "baseMode"),
    modifiers: recipeEnumArray(input.modifiers, RECIPE_MODIFIERS, "modifiers"),
    steps: Object.freeze((input.steps as unknown[]).map((step, index) => parseCompiledStep(step, `steps[${index}]`))),
    requiredCapabilities:
      input.requiredCapabilities === undefined
        ? Object.freeze([] as string[])
        : recipeStringArray(input.requiredCapabilities, "requiredCapabilities"),
    authorityNotes: recipeStringArray(input.authorityNotes, "authorityNotes"),
  };
  return Object.freeze({ ...body, digest: compiledRecipePlanDigestOf(body) });
}

const COMPILED_RECIPE_PLAN_KEYS = [
  "schemaVersion",
  "planDigest",
  "baseMode",
  "modifiers",
  "steps",
  "requiredCapabilities",
  "authorityNotes",
  "digest",
] as const;

export function parseCompiledRecipePlan(raw: unknown, what = "CompiledRecipePlan"): CompiledRecipePlan {
  const object = recipeObject(raw, what);
  recipeKeys(object, COMPILED_RECIPE_PLAN_KEYS, COMPILED_RECIPE_PLAN_KEYS, what);
  if (object.schemaVersion !== 1) fail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  if (!Array.isArray(object.steps)) fail("malformed_artifact", `${what}.steps must be an array`);
  const materialized = materializeCompiledRecipePlan({
    planDigest: object.planDigest as string,
    baseMode: object.baseMode as RecipeBaseMode,
    modifiers: object.modifiers as readonly RecipeModifier[],
    steps: object.steps as readonly unknown[],
    requiredCapabilities: object.requiredCapabilities as readonly string[],
    authorityNotes: object.authorityNotes as readonly string[],
  });
  const digest = recipeDigest(object.digest, `${what}.digest`);
  if (digest !== materialized.digest) fail("invalid_value", `${what}.digest does not match its content`);
  return materialized;
}
