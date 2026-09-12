/**
 * G10-C1 RunDefinition — the frozen UAS planning composite:
 *
 *   RunDefinition = ArchitectureDefinition + Work representative
 *                 + BindingDefinition/default + RunConfiguration
 *
 * realized at reference level (C1 §21–§25): the composite holds
 * identity/revision/digest REFS to the owning artifacts, never copies. It is
 * a join of derived references, not a new truth store:
 *
 *   RunDefinition ≠ ArchitectureDefinition ≠ WorkDefinition
 *                ≠ BindingDefinition       ≠ RunConfiguration
 *
 * Digest: deterministic domain-separated canonical digest over the four
 * inputs (`palimpsest.run-definition.v1`) — an implementation choice, not a
 * UAS freeze (C1 §24). No runtime/snapshot state belongs here: the snapshot
 * is Runtime/Continuity OBSERVATION, not Definition (C1 §24, C2 §36/§74).
 *
 * Identity: digest-only (RunDefinitionRef) — no RunDefinitionId is invented
 * (C1 §22/§64); two identical composites are the same definition.
 *
 * Materialization (C1 §25) is from ACTUAL source artifacts — an
 * ArchitectureDefinition, a ProjectIr, an optional (trusted, already-parsed)
 * BindingDefinition or the implicit default, and a RunConfiguration — through
 * the sanctioned adapters (`architectureRefOf`, `workRefOf`) and the existing
 * Binding kernel helper (`compileBindingIntentSource`); no new default
 * ontology is created (C1 §27). The artifact is deep-frozen with no caller
 * aliasing (C1 §28). No persistence.
 */

import type { ArchitectureDefinition } from "../architecture/index.js";
import type { ProjectIr } from "../schema/index.js";
import { canonicalDigest } from "../schema/canonical.js";
import type {
  BindingDefinition,
  BindingIntentSource,
  DefinitionRevisionRef,
} from "../binding/contract.js";
import { compileBindingIntentSource } from "../binding/resolver.js";
import { architectureRefOf, workRefOf } from "../binding/refs.js";
import type { RunConfiguration } from "./configuration.js";

export const RUN_DEFINITION_DIGEST_DOMAIN = "palimpsest.run-definition.v1";

/** Digest-only immutable reference: the RunDefinition has no durable id (C1 §64). */
export interface RunDefinitionRef {
  readonly digest: string;
}

export interface RunDefinition {
  readonly schemaVersion: 1;
  readonly digest: string;
  /** Ref to the owning ArchitectureDefinition artifact (never a copy). */
  readonly architecture: DefinitionRevisionRef;
  /** Ref to the authoritative Work representative (ProjectIr lineage; never a copy). */
  readonly work: DefinitionRevisionRef;
  /** The binding intent source: explicit ref or implicit_ephemeral_default@1. */
  readonly bindingIntentSource: BindingIntentSource;
  /** Digest of the owning RunConfiguration artifact. */
  readonly runConfigurationDigest: string;
}

/** The exact semantic content a RunDefinition digest covers (C1 §24). */
export interface RunDefinitionDigestInput {
  readonly architecture: DefinitionRevisionRef;
  readonly work: DefinitionRevisionRef;
  readonly bindingIntentSource: BindingIntentSource;
  readonly runConfigurationDigest: string;
}

export function runDefinitionDigestContent(
  input: RunDefinitionDigestInput,
): Record<string, unknown> {
  return {
    domain: RUN_DEFINITION_DIGEST_DOMAIN,
    architecture: { ...input.architecture },
    work: { ...input.work },
    bindingIntentSource: input.bindingIntentSource,
    runConfigurationDigest: input.runConfigurationDigest,
  };
}

export function runDefinitionDigestOf(input: RunDefinitionDigestInput): string {
  return canonicalDigest(runDefinitionDigestContent(input));
}

function freezeIntentSource(intentSource: BindingIntentSource): BindingIntentSource {
  if (intentSource.kind === "explicit") {
    return Object.freeze({
      kind: "explicit",
      binding: Object.freeze({ ...intentSource.binding }),
    });
  }
  return Object.freeze({ kind: "implicit_ephemeral_default", semanticVersion: 1 });
}

/**
 * Materialize the composite from actual source artifacts (C1 §25). Derives —
 * never accepts — the architecture/work refs and the binding intent source.
 * Deep-frozen; caller inputs are read, never aliased.
 */
export function materializeRunDefinition(input: {
  readonly architecture: ArchitectureDefinition;
  readonly work: ProjectIr;
  /** Trusted, already-parsed BindingDefinition; omit for the implicit ephemeral default. */
  readonly bindingDefinition?: BindingDefinition;
  readonly runConfiguration: RunConfiguration;
}): RunDefinition {
  if (typeof input.runConfiguration?.digest !== "string" || input.runConfiguration.digest.length === 0) {
    throw new TypeError("materializeRunDefinition: runConfiguration must be a parsed/materialized artifact");
  }
  const architecture = architectureRefOf(input.architecture);
  const work = workRefOf(input.work);
  const bindingIntentSource = compileBindingIntentSource(input.bindingDefinition);
  const runConfigurationDigest = input.runConfiguration.digest;
  return Object.freeze({
    schemaVersion: 1 as const,
    digest: runDefinitionDigestOf({
      architecture,
      work,
      bindingIntentSource,
      runConfigurationDigest,
    }),
    architecture: Object.freeze({ ...architecture }),
    work: Object.freeze({ ...work }),
    bindingIntentSource: freezeIntentSource(bindingIntentSource),
    runConfigurationDigest,
  });
}
