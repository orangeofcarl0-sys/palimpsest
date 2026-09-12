/**
 * Shared G10-B3 spike fixtures and the authoring helper.
 *
 * The authoring helper CREATES valid canonical definitions (canonicalize +
 * digest); the parser VALIDATES. They are deliberately separate (PLMP-BIND-1
 * parser obligations). Fixture types here are spike adapters, not frozen schemas.
 */

import type {
  BindingDefinition,
  BindingDefinitionRef,
  BindingRevision,
  DefinitionRevisionRef,
  ResolverInput,
  ResolverSnapshot,
  SubjectBinding,
} from "../src/binding/index.js";
import { computeBindingDefinitionDigest, MINIMAL_RESOLVER_POLICY } from "../src/binding/index.js";

/** Authoring helper: canonicalize + digest + freeze a valid BindingDefinition. */
export function authorBindingDefinition(input: {
  readonly bindingDefinitionId: string;
  readonly revision: BindingRevision;
  readonly bindings: Record<string, SubjectBinding>;
}): BindingDefinition {
  const digest = computeBindingDefinitionDigest({
    schemaVersion: 1,
    bindingDefinitionId: input.bindingDefinitionId,
    revision: input.revision,
    digest: "",
    bindings: input.bindings,
  });
  return Object.freeze({
    schemaVersion: 1,
    bindingDefinitionId: input.bindingDefinitionId,
    revision: input.revision,
    digest,
    bindings: Object.freeze({ ...input.bindings }),
  });
}

export const ARCHITECTURE_REF: DefinitionRevisionRef = {
  definitionId: "architecture-fixture",
  revision: 2,
  digest: "arch-digest-1",
};
export const WORK_REF: DefinitionRevisionRef = {
  definitionId: "work-fixture",
  revision: 5,
  digest: "work-digest-1",
};
export const RUN_CONFIG_DIGEST = "run-config-digest-1";
export const SNAPSHOT_REF = "snap-1";

export function makeSnapshot(
  overrides: Partial<ResolverSnapshot> = {},
): ResolverSnapshot {
  return {
    ref: SNAPSHOT_REF,
    ephemeralCapabilities: { runtimeFeatures: [], toolCapabilities: [] },
    persistentCandidates: [],
    ...overrides,
  };
}

/** Explicit binding definition ref for an authored definition. */
export function refOf(definition: BindingDefinition): BindingDefinitionRef {
  return {
    bindingDefinitionId: definition.bindingDefinitionId,
    revision: definition.revision,
    digest: definition.digest,
  };
}

export function makeInput(overrides: Partial<ResolverInput> = {}): ResolverInput {
  return {
    participatingSubjects: ["S"],
    architecture: ARCHITECTURE_REF,
    work: WORK_REF,
    architectureHard: {},
    workHard: {},
    intentSource: { kind: "implicit_ephemeral_default", semanticVersion: 1 },
    runConfigurationDigest: RUN_CONFIG_DIGEST,
    snapshot: makeSnapshot(),
    resolverPolicy: MINIMAL_RESOLVER_POLICY,
    ...overrides,
  };
}
