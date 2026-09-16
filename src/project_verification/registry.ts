/**
 * G10-AD §6 — the verifier REGISTRY (deployment/product config).
 *
 *   ProjectVerifierRegistry ≠ VerifierStore
 *   ProjectVerifierRegistry ≠ project truth
 *
 * There is deliberately NO verifier store: a verifier definition is versioned
 * deployment configuration (an implementation, a bounded protocol, a
 * provenance), not project state. The registry is a frozen lookup over those
 * definitions, so the same deployment always resolves the same refs to the same
 * digests and a protocol change is visible as a digest change (§13).
 *
 * A user/agent may SELECT a registered `verifierRef`; nobody may inject an
 * arbitrary command through this plane (§14).
 */

import {
  materializeVerifierDefinition,
  type ProjectVerificationSubjectKind,
  type VerifierDefinition,
  type VerifierKind,
  type VerifierProvenance,
} from "./artifacts.js";
import type { VerifierIndependenceClass } from "./independence.js";
import type { ProjectVerifierPort } from "./provider.js";

export interface ProjectVerifierRegistry {
  get(verifierRef: string): VerifierDefinition | undefined;
  list(): readonly VerifierDefinition[];
}

function frozenRegistry(definitions: readonly VerifierDefinition[]): ProjectVerifierRegistry {
  const byRef = new Map<string, VerifierDefinition>();
  for (const definition of definitions) {
    const existing = byRef.get(definition.verifierRef);
    if (existing !== undefined && existing.digest !== definition.digest) {
      throw new Error(
        `verifier "${definition.verifierRef}" is registered twice with different definition digests (${existing.digest} vs ${definition.digest})`,
      );
    }
    byRef.set(definition.verifierRef, definition);
  }
  const listed = Object.freeze(
    [...byRef.values()].sort((left, right) =>
      left.verifierRef < right.verifierRef ? -1 : left.verifierRef > right.verifierRef ? 1 : 0,
    ),
  );
  return Object.freeze({
    get: (verifierRef: string): VerifierDefinition | undefined => byRef.get(verifierRef),
    list: (): readonly VerifierDefinition[] => listed,
  });
}

/** A registry over an explicit definition list (deduplicated by ref). */
export function materializeVerifierRegistry(
  definitions: readonly VerifierDefinition[],
): ProjectVerifierRegistry {
  return frozenRegistry(definitions);
}

/**
 * A registry that exactly matches the ports this deployment can actually EXECUTE
 * (the definition each port carries). Use this when the runtime set IS the
 * registry: it makes "registered but not executable" impossible.
 */
export function verifierRegistryFromPorts(
  ports: readonly ProjectVerifierPort[],
): ProjectVerifierRegistry {
  return frozenRegistry(ports.map((port) => port.definition));
}

/* -------------------------------------------------------------------------- *
 * First-party definitions
 * -------------------------------------------------------------------------- */

export const FIRST_PARTY_MECHANICAL_VERIFIER_REF = "project.head.git-diff-check.v1";
export const FIRST_PARTY_MECHANICAL_VERIFIER_PROVIDER = "palimpsest.first_party";
export const FIRST_PARTY_MECHANICAL_VERIFIER_PROVIDER_VERSION = "1";

export interface CommandVerifierDefinitionOptions {
  readonly verifierRef: string;
  readonly version?: number | undefined;
  readonly kind?: Extract<VerifierKind, "command" | "artifact" | "external"> | undefined;
  readonly command: string;
  readonly args?: readonly string[] | undefined;
  readonly protocolNote: string;
  readonly supportedSubjects?: readonly ProjectVerificationSubjectKind[] | undefined;
  readonly independenceClass?: VerifierIndependenceClass | undefined;
  readonly provider: string;
  readonly providerVersion: string;
  readonly implementation: string;
  readonly contextIsolation?: VerifierProvenance["contextIsolation"] | undefined;
}

/**
 * A deployment-registered bounded command protocol. The command lives in the
 * DEFINITION (config), never in a request: a user/agent selects the ref.
 */
export function commandVerifierDefinition(
  options: CommandVerifierDefinitionOptions,
): VerifierDefinition {
  const args = options.args ?? [];
  const protocol = `${options.command}${args.length === 0 ? "" : ` ${args.join(" ")}`}`;
  return materializeVerifierDefinition({
    verifierRef: options.verifierRef,
    ...(options.version === undefined ? {} : { version: options.version }),
    kind: options.kind ?? "command",
    protocol,
    ...(options.supportedSubjects === undefined
      ? {}
      : { supportedSubjects: options.supportedSubjects }),
    independenceClass: options.independenceClass ?? "MECHANICAL_INDEPENDENT",
    provenance: {
      provider: options.provider,
      providerVersion: options.providerVersion,
      implementation: options.implementation,
      protocolNote: options.protocolNote,
      contextIsolation: options.contextIsolation ?? "PROCESS_SEPARATED",
      model: null,
      promptVersion: null,
    },
  });
}

/**
 * The first-party MECHANICAL verifier definition (§14): `git diff --check` run as
 * a bounded subprocess against the project repository. It is mechanical (a
 * process exit status), so it counts as independent — the harness is a
 * deployment-registered protocol, not an opinion.
 */
export function firstPartyMechanicalVerifierDefinition(
  options: {
    readonly verifierRef?: string | undefined;
    readonly command?: string | undefined;
    readonly args?: readonly string[] | undefined;
    readonly independenceClass?: VerifierIndependenceClass | undefined;
    readonly version?: number | undefined;
  } = {},
): VerifierDefinition {
  const command = options.command ?? "git";
  const args = options.args ?? ["diff", "--check"];
  return commandVerifierDefinition({
    verifierRef: options.verifierRef ?? FIRST_PARTY_MECHANICAL_VERIFIER_REF,
    ...(options.version === undefined ? {} : { version: options.version }),
    command,
    args,
    protocolNote:
      "bounded subprocess: a non-zero exit is a protocol FAIL and a spawn/timeout fault is ERROR (never FAIL); no project mutation happens in this plane",
    ...(options.independenceClass === undefined
      ? {}
      : { independenceClass: options.independenceClass }),
    provider: FIRST_PARTY_MECHANICAL_VERIFIER_PROVIDER,
    providerVersion: FIRST_PARTY_MECHANICAL_VERIFIER_PROVIDER_VERSION,
    implementation: `${command} ${args.join(" ")}`,
  });
}

/** The built-in config registry: the first-party mechanical definition. */
export function builtinProjectVerifierRegistry(): ProjectVerifierRegistry {
  return materializeVerifierRegistry([firstPartyMechanicalVerifierDefinition()]);
}

/**
 * The first-party registry a deployment gets when it composes the default
 * mechanical runtime over its repository: the same definition the default port
 * carries, so the registry and the runtime can never disagree.
 */
export function firstPartyProjectVerifierRegistry(): ProjectVerifierRegistry {
  return builtinProjectVerifierRegistry();
}
