/**
 * PLMP-BIND-1 digest implementation (G10-B3 spike).
 *
 * PLMP-BIND-1 does not freeze a hash algorithm; SHA-256 here is a B3
 * implementation choice hidden behind this module, not a contract amendment.
 * Domain separation keeps definition and resolution digests distinct.
 *
 * Canonical form: object keys sorted (recursively); arrays stay in the order
 * given by the caller (semantic sets are sorted before they reach this module);
 * a present `continuity: {}` is preserved (explicit Case E, PF-01); a
 * present-but-empty `hard` object never reaches the digest (normalized to
 * absent). Digests exclude identity/revision (definition) and resolutionId
 * (resolution) — `identity ≠ digest`.
 */

import { createHash } from "node:crypto";

import type {
  BindingDefinition,
  BindingDigest,
  SatisfiedBindingResolution,
} from "./contract.js";

const DEFINITION_DOMAIN = "palimpsest.binding-definition.v1";
const RESOLUTION_DOMAIN = "palimpsest.binding-resolution.v1";

/** Deterministic JSON: recursively key-sorted; arrays keep caller order. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const body = keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",");
  return `{${body}}`;
}

/** Canonical digest content of a BindingDefinition: subject-keyed intent only. */
export function bindingDefinitionDigestContent(definition: BindingDefinition): unknown {
  const subjects = Object.keys(definition.bindings).sort();
  const bindings: Record<string, unknown> = {};
  for (const subject of subjects) {
    const entry = definition.bindings[subject];
    if (entry === undefined) continue;
    const canonical: Record<string, unknown> = {};
    if (entry.continuity !== undefined) canonical.continuity = entry.continuity;
    if (entry.hard !== undefined) {
      const hard: Record<string, unknown> = {};
      if (entry.hard.runtimeFeatures !== undefined) {
        hard.runtimeFeatures = [...entry.hard.runtimeFeatures].sort();
      }
      if (entry.hard.toolCapabilities !== undefined) {
        hard.toolCapabilities = [...entry.hard.toolCapabilities].sort();
      }
      if (Object.keys(hard).length > 0) canonical.hard = hard;
    }
    bindings[subject] = canonical;
  }
  return { bindings };
}

export function computeBindingDefinitionDigest(definition: BindingDefinition): BindingDigest {
  return sha256(DEFINITION_DOMAIN, bindingDefinitionDigestContent(definition));
}

/** Resolution digest content: selections + provenance refs + snapshot + policy; excludes resolutionId. */
export function bindingResolutionDigestContent(resolution: SatisfiedBindingResolution): unknown {
  const subjects = Object.keys(resolution.continuity).sort();
  const continuity: Record<string, unknown> = {};
  for (const subject of subjects) {
    const selection = resolution.continuity[subject];
    if (selection !== undefined) continuity[subject] = selection;
  }
  return {
    continuity,
    provenance: {
      architecture: resolution.provenance.architecture,
      work: resolution.provenance.work,
      intentSource: resolution.provenance.intentSource,
      runConfigurationDigest: resolution.provenance.runConfigurationDigest,
      snapshot: resolution.provenance.snapshot,
      ...(resolution.provenance.resolverPolicy === undefined
        ? {}
        : { resolverPolicy: resolution.provenance.resolverPolicy }),
    },
  };
}

export function computeBindingResolutionDigest(
  resolution: SatisfiedBindingResolution,
): BindingDigest {
  return sha256(RESOLUTION_DOMAIN, bindingResolutionDigestContent(resolution));
}

function sha256(domain: string, content: unknown): string {
  return createHash("sha256").update(domain).update("\n").update(stableStringify(content)).digest("hex");
}
