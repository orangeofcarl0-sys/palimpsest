/**
 * G10-C0 minimal Architecture identity (PLMP-UAS-1 implementation
 * realization — NOT a new frozen contract, NOT PLMP-UAS-2, NOT PLMP-ARCH-1).
 *
 * What this module establishes: stable ArchitectureDefinition identity,
 * stable AgentDefinition identity, architecture revision, architecture
 * content digest, a strict parser, canonical representation, runtime
 * immutability. Identity first; semantics later.
 *
 * What an AgentDefinition is at C0:
 *
 *   AgentDefinition = StableArchitectureIdentity
 *
 * NOT Persona+Prompt+Model+Tools+Memory+Task. A one-field AgentDefinition is
 * intentional (schema minimality): agent-side semantics (instructions/model
 * policy/tools/memory/context policy) were frozen out of scope for G10-A and
 * gain no fields here. There are deliberately no edges, no work/task fields,
 * no runtime/session identity, no authority, no persistence, and no
 * human-facing labels (no concrete ambiguity requires one).
 *
 * Identity firewalls (PLMP-UAS-1: Architecture ≠ Work, AgentDefinition ≠
 * TaskDefinition):
 *   - `agentDefinitionId` / `architectureDefinitionId` are DISTINCT field/type
 *     namespaces — never a reuse or alias of Work `definition_id`, `task_id`,
 *     `scope_id`, `project_id`, or AgentGraph node ids. String equality
 *     between an AgentDefinitionId and any Work identity implies NO relation:
 *     identity semantics come from the field/type namespace plus the
 *     authoritative owning artifact, not from string equality.
 *   - This module depends on generic canonical/crypto utilities only. It does
 *     NOT import Work semantics (TaskSpec/TaskProposal/AgentGraph/
 *     ProjectProposal) and is NOT imported by Work compilation.
 *   - No migration from AgentGraph exists: historical WorkGraph content
 *     remains WorkGraph; ArchitectureDefinition is authored through its own
 *     independent contract.
 *
 * Revision semantics: local validation only (integer, safe, >= 0).
 * Cross-version monotonicity is a future architecture repository/store
 * responsibility, not enforced here. No parentRevision/parentDigest — C0
 * needs a revisioned definition artifact, not a lineage chain.
 *
 * Digest: SHA-256 over domain-separated canonical JSON content
 * (`palimpsest.architecture-definition.v1`) — an implementation choice, not a
 * UAS freeze. Content = canonical AgentDefinition membership (a semantic
 * set: order-independent, duplicates rejected). Deliberately excluded:
 * architectureDefinitionId, revision, timestamps, runtime/work state
 * (content-identity semantics).
 */

import { canonicalDigest } from "../schema/canonical.js";

export type ArchitectureDefinitionId = string;
export type AgentDefinitionId = string;
export type ArchitectureRevision = number;
export type ArchitectureDigest = string;

/** C0: identity-only. No persona/model/tools/memory/task fields. */
export interface AgentDefinition {
  readonly agentDefinitionId: AgentDefinitionId;
}

export interface ArchitectureDefinition {
  readonly schemaVersion: 1;
  readonly architectureDefinitionId: ArchitectureDefinitionId;
  readonly revision: ArchitectureRevision;
  readonly digest: ArchitectureDigest;
  readonly agentDefinitions: readonly AgentDefinition[];
}

export class ArchitectureDefinitionParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchitectureDefinitionParseError";
  }
}

const DEFINITION_KEYS = [
  "schemaVersion",
  "architectureDefinitionId",
  "revision",
  "digest",
  "agentDefinitions",
];
const AGENT_KEYS = ["agentDefinitionId"];

/** Domain separator for architecture content digests (implementation choice). */
export const ARCHITECTURE_DIGEST_DOMAIN = "palimpsest.architecture-definition.v1";

/** Lexicographic set comparator — the one canonical membership order. */
function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The digest content: domain-separated canonical AgentDefinition membership.
 * Excludes architectureDefinitionId and revision (content-identity
 * semantics); membership is a semantic set (sorted, deduplicated upstream).
 */
export function architectureDefinitionDigestContent(
  agentDefinitionIds: readonly AgentDefinitionId[],
): Record<string, unknown> {
  return {
    domain: ARCHITECTURE_DIGEST_DOMAIN,
    agentDefinitionIds: [...agentDefinitionIds].sort(compareIds),
  };
}

export function computeArchitectureDefinitionDigest(
  agentDefinitionIds: readonly AgentDefinitionId[],
): ArchitectureDigest {
  return canonicalDigest(architectureDefinitionDigestContent(agentDefinitionIds));
}

function fail(message: string): never {
  throw new ArchitectureDefinitionParseError(message);
}

function asObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${what} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(object: Record<string, unknown>, keys: readonly string[], what: string): void {
  for (const key of Object.keys(object)) {
    if (!keys.includes(key)) fail(`unknown ${what} field "${key}"`);
  }
  for (const key of keys) {
    if (!Object.hasOwn(object, key)) fail(`${what}: field "${key}" is required`);
  }
}

function nonEmptyId(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") fail(`${what} must be a non-empty string`);
  return value;
}

function canonicalizeMembership(
  agentDefinitions: readonly AgentDefinition[],
): readonly AgentDefinition[] {
  return [...agentDefinitions].sort((a, b) => compareIds(a.agentDefinitionId, b.agentDefinitionId));
}

/**
 * Freeze an architecture artifact to the B3C2 standard: the definition, its
 * membership array, and every AgentDefinition are runtime-frozen; caller
 * input objects are copied, never aliased.
 */
function freezeDefinition(
  architectureDefinitionId: ArchitectureDefinitionId,
  revision: ArchitectureRevision,
  agentDefinitions: readonly AgentDefinition[],
  digest: ArchitectureDigest,
): ArchitectureDefinition {
  return Object.freeze({
    schemaVersion: 1,
    architectureDefinitionId,
    revision,
    digest,
    agentDefinitions: Object.freeze(
      agentDefinitions.map((agent) => Object.freeze({ ...agent })),
    ),
  });
}

/**
 * Authoring helper: CREATE a canonical ArchitectureDefinition (validate,
 * canonicalize membership, compute digest, freeze). The parser VALIDATES; the
 * two remain distinct (B3 discipline). Does not persist.
 */
export function materializeArchitectureDefinition(input: {
  readonly architectureDefinitionId: ArchitectureDefinitionId;
  readonly revision: ArchitectureRevision;
  readonly agentDefinitionIds: readonly AgentDefinitionId[];
}): ArchitectureDefinition {
  if (typeof input !== "object" || input === null) {
    fail("architecture definition input must be an object");
  }
  const architectureDefinitionId = nonEmptyId(
    input.architectureDefinitionId,
    "architectureDefinitionId",
  );
  const revision = input.revision;
  if (
    typeof revision !== "number" ||
    !Number.isSafeInteger(revision) ||
    revision < 0
  ) {
    fail("revision must be a safe non-negative integer");
  }
  if (!Array.isArray(input.agentDefinitionIds)) {
    fail("agentDefinitionIds must be an array");
  }
  const ids = input.agentDefinitionIds.map((id, index) =>
    nonEmptyId(id, `agentDefinitionIds[${index}]`),
  );
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) fail(`duplicate AgentDefinitionId "${id}"`);
    seen.add(id);
  }
  const agentDefinitions = canonicalizeMembership(
    ids.map((agentDefinitionId) => ({ agentDefinitionId })),
  );
  return freezeDefinition(
    architectureDefinitionId,
    revision,
    agentDefinitions,
    computeArchitectureDefinitionDigest(ids),
  );
}

/**
 * Strict parser from `unknown` (the Architecture trust boundary). Obligations:
 * schemaVersion exactly 1, unknown fields rejected at every level, non-empty
 * ids, safe non-negative revision, supplied digest must equal the canonical
 * content digest (fail-closed — a bad digest is never silently replaced),
 * duplicate AgentDefinitionIds rejected, membership canonicalized (order-
 * independent), deep-frozen output. Membership may be empty: an architecture
 * artifact with zero AgentDefinitions is honestly representable (its Binding
 * subject set is then empty — see the B4 grounding matrix §6 adjudication).
 */
export function parseArchitectureDefinition(raw: unknown): ArchitectureDefinition {
  const object = asObject(raw, "ArchitectureDefinition");
  exactKeys(object, DEFINITION_KEYS, "ArchitectureDefinition");
  if (object.schemaVersion !== 1) fail("ArchitectureDefinition.schemaVersion must be 1");
  const architectureDefinitionId = nonEmptyId(
    object.architectureDefinitionId,
    "architectureDefinitionId",
  );
  const revision = object.revision;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) {
    fail("revision must be a safe non-negative integer");
  }
  if (typeof object.digest !== "string" || object.digest.length === 0) {
    fail("digest must be a non-empty string");
  }
  if (!Array.isArray(object.agentDefinitions)) fail("agentDefinitions must be an array");
  const seen = new Set<string>();
  const agentDefinitions: AgentDefinition[] = object.agentDefinitions.map((entry, index) => {
    const agent = asObject(entry, `agentDefinitions[${index}]`);
    exactKeys(agent, AGENT_KEYS, "agentDefinitions entry");
    const agentDefinitionId = nonEmptyId(agent.agentDefinitionId, "agentDefinitionId");
    if (seen.has(agentDefinitionId)) {
      fail(`duplicate AgentDefinitionId "${agentDefinitionId}"`);
    }
    seen.add(agentDefinitionId);
    return { agentDefinitionId };
  });
  const computed = computeArchitectureDefinitionDigest([...seen]);
  if (object.digest !== computed) {
    fail(
      `digest mismatch: supplied ${object.digest}, computed ${computed} ` +
        "(the parser validates; it never replaces a bad digest)",
    );
  }
  return freezeDefinition(
    architectureDefinitionId,
    revision,
    canonicalizeMembership(agentDefinitions),
    object.digest,
  );
}
