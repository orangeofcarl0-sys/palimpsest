/**
 * G10-N reasoning claims — extensible typed claim content plus a content-addressed,
 * cell-scoped claim identity.
 *
 *   claimDigest = type + canonical content + canonical dependency claim ids
 *   ReasoningClaimId = cell-scoped content address of claimDigest
 *
 * The claim digest EXCLUDES branch identity, support evidence, and verification, so two
 * independent branches proposing the same semantic claim converge on ONE claim identity.
 * No `payload: any`, no frozen closed taxonomy.
 */

import { canonicalDigest } from "../schema/canonical.js";
import type { ReasoningClaimRef } from "./ref.js";
import {
  rcDigest,
  rcExactKeys,
  rcFail,
  rcLiteral,
  rcNonEmpty,
  rcObject,
  rcStableId,
  materializeReasoningClaimRef,
  parseReasoningClaimRef,
} from "./ref.js";

export const REASONING_CLAIM_DOMAIN = "palimpsest.reasoning-claim.v1";
export const REASONING_CLAIM_ID_DOMAIN = "palimpsest.reasoning-claim-id.v1";

export interface ReasoningClaimTypeRef {
  readonly typeId: string;
  readonly version: string;
}

export function parseReasoningClaimTypeRef(raw: unknown, what = "ReasoningClaimTypeRef"): ReasoningClaimTypeRef {
  const object = rcObject(raw, what);
  rcExactKeys(object, ["typeId", "version"], what);
  return Object.freeze({ typeId: rcStableId(object.typeId, `${what}.typeId`), version: rcNonEmpty(object.version, `${what}.version`) });
}

export function reasoningClaimTypeKey(type: ReasoningClaimTypeRef): string {
  return `${type.typeId}@${type.version}`;
}

export interface ReasoningClaimTypeValidator {
  readonly type: ReasoningClaimTypeRef;
  /** Validate + canonicalize type-specific content, or throw. Deep-frozen result. */
  validate(content: unknown): unknown;
}

export interface ReasoningClaimTypeRegistry {
  validator(type: ReasoningClaimTypeRef): ReasoningClaimTypeValidator | undefined;
}

export function makeReasoningClaimTypeRegistry(validators: readonly ReasoningClaimTypeValidator[]): ReasoningClaimTypeRegistry {
  const byKey = new Map(validators.map((validator) => [reasoningClaimTypeKey(validator.type), validator]));
  return { validator: (type) => byKey.get(reasoningClaimTypeKey(type)) };
}

/* ------------------------------------------------------------------ *
 * Builtin claim types
 * ------------------------------------------------------------------ */

export interface ReasoningStatementContent {
  readonly statement: string;
}

export interface ReasoningDeadEndContent {
  readonly description: string;
  readonly conditions: readonly string[];
  readonly reason: string;
}

export const REASONING_STATEMENT_TYPE: ReasoningClaimTypeRef = Object.freeze({ typeId: "reasoning.statement", version: "v1" });
export const REASONING_DEAD_END_TYPE: ReasoningClaimTypeRef = Object.freeze({ typeId: "reasoning.dead-end", version: "v1" });

export function parseReasoningStatementContent(raw: unknown, what = "reasoning.statement.v1"): ReasoningStatementContent {
  const object = rcObject(raw, what);
  rcExactKeys(object, ["statement"], what);
  return Object.freeze({ statement: rcNonEmpty(object.statement, `${what}.statement`) });
}

export function parseReasoningDeadEndContent(raw: unknown, what = "reasoning.dead-end.v1"): ReasoningDeadEndContent {
  const object = rcObject(raw, what);
  rcExactKeys(object, ["description", "conditions", "reason"], what);
  if (!Array.isArray(object.conditions)) rcFail(`${what}.conditions must be an array`);
  const conditions = object.conditions.map((entry, index) => rcNonEmpty(entry, `${what}.conditions[${index}]`));
  const seen = new Set<string>();
  for (const condition of conditions) {
    if (seen.has(condition)) rcFail(`${what}.conditions: duplicate "${condition}" (semantic set)`);
    seen.add(condition);
  }
  return Object.freeze({
    description: rcNonEmpty(object.description, `${what}.description`),
    conditions: Object.freeze([...conditions].sort()),
    reason: rcNonEmpty(object.reason, `${what}.reason`),
  });
}

/** Default registry. NOT a claim that the claim taxonomy is complete. */
export function makeBuiltinReasoningClaimTypeRegistry(): ReasoningClaimTypeRegistry {
  return makeReasoningClaimTypeRegistry([
    { type: REASONING_STATEMENT_TYPE, validate: parseReasoningStatementContent },
    { type: REASONING_DEAD_END_TYPE, validate: parseReasoningDeadEndContent },
  ]);
}

export function defaultReasoningClaimTypeRegistry(): ReasoningClaimTypeRegistry {
  return makeBuiltinReasoningClaimTypeRegistry();
}

/* ------------------------------------------------------------------ *
 * Claim
 * ------------------------------------------------------------------ */

export interface ReasoningClaim {
  readonly schemaVersion: 1;
  readonly type: ReasoningClaimTypeRef;
  readonly content: unknown;
  readonly dependencies: readonly ReasoningClaimRef[];
  readonly claimDigest: string;
}

export function reasoningClaimDigestOf(input: {
  readonly type: ReasoningClaimTypeRef;
  readonly content: unknown;
  readonly dependencyClaimIds: readonly string[];
}): string {
  return canonicalDigest({
    domain: REASONING_CLAIM_DOMAIN,
    type: input.type,
    content: input.content,
    dependencies: [...new Set(input.dependencyClaimIds)].sort(),
  });
}

export function reasoningClaimIdOf(cellId: string, claimDigest: string): string {
  return `cl-${canonicalDigest({ domain: REASONING_CLAIM_ID_DOMAIN, cellId, claimDigest }).slice(0, 24)}`;
}

export function reasoningClaimRefOf(cellId: string, claim: ReasoningClaim): ReasoningClaimRef {
  return materializeReasoningClaimRef({ cellId, claimId: reasoningClaimIdOf(cellId, claim.claimDigest) });
}

/**
 * Validate a claim against the registry and compute its content-addressed identity.
 * Unknown type and invalid type-specific content fail closed.
 */
export function materializeReasoningClaim(
  cellId: string,
  input: { readonly type: ReasoningClaimTypeRef; readonly content: unknown; readonly dependencies: readonly ReasoningClaimRef[] },
  registry: ReasoningClaimTypeRegistry,
): ReasoningClaim {
  const type = parseReasoningClaimTypeRef(input.type, "claim.type");
  const validator = registry.validator(type);
  if (validator === undefined) rcFail(`unknown reasoning claim type "${reasoningClaimTypeKey(type)}"`);
  let content: unknown;
  try {
    content = validator.validate(input.content);
  } catch (error) {
    rcFail(`claim content is invalid for "${reasoningClaimTypeKey(type)}": ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(input.dependencies)) rcFail("claim.dependencies must be an array");
  const dependencies = input.dependencies.map((entry) => parseReasoningClaimRef(entry, "claim.dependencies[]"));
  const sorted = Object.freeze([...dependencies].sort((a, b) => (a.claimId < b.claimId ? -1 : 1)));
  const seen = new Set<string>();
  for (const dependency of sorted) {
    if (dependency.cellId !== cellId) rcFail(`a claim dependency must reference the same cell ("${dependency.cellId}" ≠ "${cellId}")`);
    if (seen.has(dependency.claimId)) rcFail(`claim.dependencies: duplicate dependency "${dependency.claimId}"`);
    seen.add(dependency.claimId);
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    type,
    content,
    dependencies: sorted,
    claimDigest: reasoningClaimDigestOf({ type, content, dependencyClaimIds: sorted.map((dependency) => dependency.claimId) }),
  });
}

export function parseReasoningClaim(raw: unknown, what = "ReasoningClaim"): ReasoningClaim {
  const object = rcObject(raw, what);
  rcExactKeys(object, ["schemaVersion", "type", "content", "dependencies", "claimDigest"], what);
  if (object.schemaVersion !== 1) rcFail(`${what}.schemaVersion must be 1`);
  const type = parseReasoningClaimTypeRef(object.type, `${what}.type`);
  if (!Array.isArray(object.dependencies)) rcFail(`${what}.dependencies must be an array`);
  const dependencies = object.dependencies.map((entry) => parseReasoningClaimRef(entry, `${what}.dependencies[]`));
  const claimDigest = rcDigest(object.claimDigest, `${what}.claimDigest`);
  const expected = reasoningClaimDigestOf({ type, content: object.content, dependencyClaimIds: dependencies.map((dependency) => dependency.claimId) });
  if (claimDigest !== expected) rcFail(`${what}.claimDigest does not match its type/content/dependencies`);
  return Object.freeze({
    schemaVersion: 1 as const,
    type,
    content: object.content,
    dependencies: Object.freeze([...dependencies].sort((a, b) => (a.claimId < b.claimId ? -1 : 1))),
    claimDigest,
  });
}

/** Canonical dependency claim-id set (used by the DAG derivation). */
export function reasoningClaimDependencyIds(claim: ReasoningClaim): readonly string[] {
  return claim.dependencies.map((dependency) => dependency.claimId);
}

export { rcLiteral };
