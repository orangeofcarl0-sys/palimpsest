/**
 * G10-F2 OrganizationDefinition — the organization as its OWN immutable
 * semantic artifact (§45–§65).
 *
 * An Organization answers: who belongs, roles, role capability requirements,
 * role assignments, mission, norms, and declared interaction structure. It is
 * NOT the WorkGraph, NOT a CoalitionSnapshot, NOT a PeerRef, NOT a
 * RuntimeScope, NOT a Holon, and NOT a DurableInstitution.
 *
 * Identity namespaces (F2-M08): `organizationDefinitionId`, `roleId`, and the
 * tagged `OrganizationMemberRef` union are distinct from Architecture,
 * Work, Peer, runtime, and institution identities. Two members may share a
 * string value and still be DIFFERENT actors → never collapsed by string
 * equality (§48).
 *
 * Capability discipline (§53–§54): a `RoleDefinition` may DECLARE required
 * capabilities. It never asserts that any member POSSESSES them. Verified
 * capability possession (κ) is DEFERRED; `PeerAdvertisement` competence tags
 * are explicitly NOT evidence.
 *
 * Digest (§65): domain-separated SHA-256 over canonical CONTENT; content
 * identity EXCLUDES organizationDefinitionId and revision (decided
 * explicitly and machine-tested, mirroring ArchitectureDefinition).
 *
 * Lineage is NOT part of the artifact: revision lineage lives in the
 * organization store (§66–§69), independent from Architecture/Work/Binding
 * revision and from Institution epochs.
 */

import { canonicalDigest } from "../schema/canonical.js";
import { isStableIdentifier, normalizeStableIdentifier } from "../schema/identifier.js";
import type { PeerRef } from "../federation/peer.js";
import { parsePeerRef } from "../federation/peer.js";

export type OrganizationDefinitionId = string;
export type OrganizationRevision = number;
export type OrganizationDigest = string;
export type RoleId = string;

export const ORGANIZATION_DIGEST_DOMAIN = "palimpsest.organization-definition.v1";

/* ------------------------------------------------------------------ *
 * Member identity (§47/§48)
 * ------------------------------------------------------------------ */

export interface OrganizationPeerMember {
  readonly kind: "peer";
  readonly peer: PeerRef;
}

export interface OrganizationAgentMember {
  readonly kind: "agent_definition";
  readonly architectureDefinitionId: string;
  readonly agentDefinitionId: string;
}

/** Tagged union — membership is a namespaced identity, never an arbitrary string. */
export type OrganizationMemberRef = OrganizationPeerMember | OrganizationAgentMember;

/** Canonical semantic key for a member (namespaced; string equality is not identity). */
export function organizationMemberKey(member: OrganizationMemberRef): string {
  return member.kind === "peer"
    ? `peer:${member.peer.peerId}`
    : `agent:${member.architectureDefinitionId}/${member.agentDefinitionId}`;
}

/* ------------------------------------------------------------------ *
 * Roles / assignments / norms / interactions (§51–§62)
 * ------------------------------------------------------------------ */

/** A functional organizational position. `Role ≠ Agent` (§51). */
export interface RoleDefinition {
  readonly roleId: RoleId;
  /** DECLARED requirements — never evidence of possession (§53/§54). */
  readonly requiredCapabilities: readonly string[];
}

export interface RoleAssignment {
  readonly member: OrganizationMemberRef;
  readonly roleId: RoleId;
}

export type OrganizationNormKind = "obligation" | "permission" | "prohibition";

/** A minimal typed normative declaration. Permission ≠ effect authority (§60). */
export interface OrganizationNorm {
  readonly normId: string;
  readonly kind: OrganizationNormKind;
  readonly roleId: RoleId;
  readonly actionTag: string;
}

/** Declared internal interaction structure Γ — NOT collaboration history (§61/§62). */
export interface OrganizationInteraction {
  readonly interactionId: string;
  readonly fromRoleId: RoleId;
  readonly toRoleId: RoleId;
  readonly protocol: string;
}

export interface OrganizationDefinition {
  readonly schemaVersion: 1;
  readonly organizationDefinitionId: OrganizationDefinitionId;
  readonly revision: OrganizationRevision;
  readonly digest: OrganizationDigest;
  readonly mission: string;
  readonly members: readonly OrganizationMemberRef[];
  readonly roles: readonly RoleDefinition[];
  readonly assignments: readonly RoleAssignment[];
  readonly norms: readonly OrganizationNorm[];
  readonly interactions: readonly OrganizationInteraction[];
}

/** Canonical immutable reference to one organization revision (§69). */
export interface OrganizationDefinitionRef {
  readonly organizationDefinitionId: string;
  readonly revision: number;
  readonly digest: string;
}

export class OrganizationDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationDefinitionError";
  }
}

/* ------------------------------------------------------------------ *
 * Canonicalization helpers
 * ------------------------------------------------------------------ */

const compareIds = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function canonicalMember(member: OrganizationMemberRef): OrganizationMemberRef {
  return member.kind === "peer"
    ? Object.freeze({ kind: "peer" as const, peer: Object.freeze({ schemaVersion: 1 as const, peerId: member.peer.peerId }) })
    : Object.freeze({
        kind: "agent_definition" as const,
        architectureDefinitionId: member.architectureDefinitionId,
        agentDefinitionId: member.agentDefinitionId,
      });
}

function canonicalMembers(members: readonly OrganizationMemberRef[]): readonly OrganizationMemberRef[] {
  return Object.freeze(
    [...members].map(canonicalMember).sort((a, b) => compareIds(organizationMemberKey(a), organizationMemberKey(b))),
  );
}

function canonicalStringSet(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort(compareIds));
}

function canonicalRoles(roles: readonly RoleDefinition[]): readonly RoleDefinition[] {
  return Object.freeze(
    [...roles]
      .map((role) => Object.freeze({ roleId: role.roleId, requiredCapabilities: canonicalStringSet(role.requiredCapabilities) }))
      .sort((a, b) => compareIds(a.roleId, b.roleId)),
  );
}

function canonicalAssignments(assignments: readonly RoleAssignment[]): readonly RoleAssignment[] {
  return Object.freeze(
    [...assignments]
      .map((assignment) => Object.freeze({ member: canonicalMember(assignment.member), roleId: assignment.roleId }))
      .sort((a, b) => {
        const left = `${organizationMemberKey(a.member)}\u0000${a.roleId}`;
        const right = `${organizationMemberKey(b.member)}\u0000${b.roleId}`;
        return compareIds(left, right);
      }),
  );
}

function canonicalNorms(norms: readonly OrganizationNorm[]): readonly OrganizationNorm[] {
  return Object.freeze([...norms].map((norm) => Object.freeze({ ...norm })).sort((a, b) => compareIds(a.normId, b.normId)));
}

function canonicalInteractions(interactions: readonly OrganizationInteraction[]): readonly OrganizationInteraction[] {
  return Object.freeze(
    [...interactions].map((entry) => Object.freeze({ ...entry })).sort((a, b) => compareIds(a.interactionId, b.interactionId)),
  );
}

/**
 * The digest content: canonical, order-independent organization semantics.
 * EXCLUDES organizationDefinitionId and revision (content-identity).
 */
export function organizationDefinitionDigestContent(input: {
  readonly mission: string;
  readonly members: readonly OrganizationMemberRef[];
  readonly roles: readonly RoleDefinition[];
  readonly assignments: readonly RoleAssignment[];
  readonly norms: readonly OrganizationNorm[];
  readonly interactions: readonly OrganizationInteraction[];
}): unknown {
  return {
    domain: ORGANIZATION_DIGEST_DOMAIN,
    mission: input.mission,
    members: canonicalMembers(input.members),
    roles: canonicalRoles(input.roles),
    assignments: canonicalAssignments(input.assignments),
    norms: canonicalNorms(input.norms),
    interactions: canonicalInteractions(input.interactions),
  };
}

export function computeOrganizationDefinitionDigest(input: {
  readonly mission: string;
  readonly members: readonly OrganizationMemberRef[];
  readonly roles: readonly RoleDefinition[];
  readonly assignments: readonly RoleAssignment[];
  readonly norms: readonly OrganizationNorm[];
  readonly interactions: readonly OrganizationInteraction[];
}): OrganizationDigest {
  return canonicalDigest(organizationDefinitionDigestContent(input));
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

function fail(message: string): never {
  throw new OrganizationDefinitionError(message);
}

function asObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${what} must be an object`);
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

function stableId(value: unknown, what: string): string {
  if (typeof value !== "string") fail(`${what} must be a string`);
  const normalized = normalizeStableIdentifier(value);
  if (!isStableIdentifier(normalized)) fail(`${what} must be a stable identifier`);
  return normalized;
}

function requireNonEmpty(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") fail(`${what} must be a non-empty string`);
  return value;
}

function parseMemberRef(raw: unknown, what: string): OrganizationMemberRef {
  const object = asObject(raw, what);
  if (object.kind === "peer") {
    exactKeys(object, ["kind", "peer"], what);
    return Object.freeze({ kind: "peer" as const, peer: parsePeerRef(object.peer) });
  }
  if (object.kind === "agent_definition") {
    exactKeys(object, ["kind", "architectureDefinitionId", "agentDefinitionId"], what);
    return Object.freeze({
      kind: "agent_definition" as const,
      architectureDefinitionId: stableId(object.architectureDefinitionId, `${what}.architectureDefinitionId`),
      agentDefinitionId: stableId(object.agentDefinitionId, `${what}.agentDefinitionId`),
    });
  }
  fail(`${what}.kind must be one of peer, agent_definition`);
}

function parseRole(raw: unknown, what: string): RoleDefinition {
  const object = asObject(raw, what);
  exactKeys(object, ["roleId", "requiredCapabilities"], what);
  const roleId = stableId(object.roleId, `${what}.roleId`);
  if (!Array.isArray(object.requiredCapabilities)) fail(`${what}.requiredCapabilities must be an array`);
  const requiredCapabilities = object.requiredCapabilities.map((entry, index) =>
    requireNonEmpty(entry, `${what}.requiredCapabilities[${index}]`),
  );
  return { roleId, requiredCapabilities };
}

/**
 * Validate semantic coherence: unique member/role/norm/interaction identities,
 * dangling role references rejected, duplicate assignments rejected, and no
 * recursive child-organization membership (not representable at all).
 */
function validateSemantics(input: {
  readonly members: readonly OrganizationMemberRef[];
  readonly roles: readonly RoleDefinition[];
  readonly assignments: readonly RoleAssignment[];
  readonly norms: readonly OrganizationNorm[];
  readonly interactions: readonly OrganizationInteraction[];
}): void {
  const memberKeys = new Set<string>();
  for (const member of input.members) {
    const key = organizationMemberKey(member);
    if (memberKeys.has(key)) fail(`duplicate organization member identity "${key}"`);
    memberKeys.add(key);
  }
  const roleIds = new Set<string>();
  for (const role of input.roles) {
    if (roleIds.has(role.roleId)) fail(`duplicate RoleId "${role.roleId}"`);
    roleIds.add(role.roleId);
    const capabilities = new Set<string>();
    for (const capability of role.requiredCapabilities) {
      if (capabilities.has(capability)) fail(`duplicate required capability "${capability}" on role "${role.roleId}"`);
      capabilities.add(capability);
    }
  }
  const assignmentKeys = new Set<string>();
  for (const assignment of input.assignments) {
    const memberKey = organizationMemberKey(assignment.member);
    if (!memberKeys.has(memberKey)) fail(`assignment references unknown member "${memberKey}"`);
    if (!roleIds.has(assignment.roleId)) fail(`assignment references unknown RoleId "${assignment.roleId}"`);
    const key = `${memberKey}\u0000${assignment.roleId}`;
    if (assignmentKeys.has(key)) fail(`duplicate role assignment (${memberKey}, ${assignment.roleId})`);
    assignmentKeys.add(key);
  }
  const normIds = new Set<string>();
  for (const norm of input.norms) {
    if (normIds.has(norm.normId)) fail(`duplicate normId "${norm.normId}"`);
    normIds.add(norm.normId);
    if (!roleIds.has(norm.roleId)) fail(`norm "${norm.normId}" references unknown RoleId "${norm.roleId}"`);
  }
  const interactionIds = new Set<string>();
  for (const interaction of input.interactions) {
    if (interactionIds.has(interaction.interactionId)) fail(`duplicate interactionId "${interaction.interactionId}"`);
    interactionIds.add(interaction.interactionId);
    if (!roleIds.has(interaction.fromRoleId)) fail(`interaction "${interaction.interactionId}" references unknown fromRoleId "${interaction.fromRoleId}"`);
    if (!roleIds.has(interaction.toRoleId)) fail(`interaction "${interaction.interactionId}" references unknown toRoleId "${interaction.toRoleId}"`);
  }
}

/* ------------------------------------------------------------------ *
 * Freeze / materialize / parse
 * ------------------------------------------------------------------ */

function freezeDefinition(
  organizationDefinitionId: string,
  revision: number,
  digest: string,
  content: {
    readonly mission: string;
    readonly members: readonly OrganizationMemberRef[];
    readonly roles: readonly RoleDefinition[];
    readonly assignments: readonly RoleAssignment[];
    readonly norms: readonly OrganizationNorm[];
    readonly interactions: readonly OrganizationInteraction[];
  },
): OrganizationDefinition {
  return Object.freeze({
    schemaVersion: 1 as const,
    organizationDefinitionId,
    revision,
    digest,
    mission: content.mission,
    members: canonicalMembers(content.members),
    roles: canonicalRoles(content.roles),
    assignments: canonicalAssignments(content.assignments),
    norms: canonicalNorms(content.norms),
    interactions: canonicalInteractions(content.interactions),
  });
}

/** Authoring helper: CREATE a canonical OrganizationDefinition (§64). Does not persist. */
export function materializeOrganizationDefinition(input: {
  readonly organizationDefinitionId: OrganizationDefinitionId;
  readonly revision: OrganizationRevision;
  readonly mission: string;
  readonly members: readonly OrganizationMemberRef[];
  readonly roles: readonly RoleDefinition[];
  readonly assignments: readonly RoleAssignment[];
  readonly norms?: readonly OrganizationNorm[];
  readonly interactions?: readonly OrganizationInteraction[];
}): OrganizationDefinition {
  if (typeof input !== "object" || input === null) fail("organization definition input must be an object");
  const organizationDefinitionId = stableId(input.organizationDefinitionId, "organizationDefinitionId");
  const revision = input.revision;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) {
    fail("revision must be a safe non-negative integer");
  }
  const mission = requireNonEmpty(input.mission, "mission");
  if (!Array.isArray(input.members)) fail("members must be an array");
  const members = input.members.map((entry, index) =>
    parseMemberRef(JSON.parse(JSON.stringify(entry)), `members[${index}]`),
  );
  if (!Array.isArray(input.roles)) fail("roles must be an array");
  const roles = input.roles.map((entry, index) => parseRole(entry, `roles[${index}]`));
  if (!Array.isArray(input.assignments)) fail("assignments must be an array");
  const assignments = input.assignments.map((entry, index) => {
    const object = asObject(entry, `assignments[${index}]`);
    exactKeys(object, ["member", "roleId"], `assignments[${index}]`);
    return { member: parseMemberRef(object.member, `assignments[${index}].member`), roleId: stableId(object.roleId, `assignments[${index}].roleId`) };
  });
  const norms = (input.norms ?? []).map((entry, index) => {
    const object = asObject(entry, `norms[${index}]`);
    exactKeys(object, ["normId", "kind", "roleId", "actionTag"], `norms[${index}]`);
    const kind = object.kind;
    if (kind !== "obligation" && kind !== "permission" && kind !== "prohibition") {
      fail(`norms[${index}].kind must be obligation, permission, or prohibition`);
    }
    return {
      normId: stableId(object.normId, `norms[${index}].normId`),
      kind: kind as OrganizationNormKind,
      roleId: stableId(object.roleId, `norms[${index}].roleId`),
      actionTag: requireNonEmpty(object.actionTag, `norms[${index}].actionTag`),
    };
  });
  const interactions = (input.interactions ?? []).map((entry, index) => {
    const object = asObject(entry, `interactions[${index}]`);
    exactKeys(
      object,
      ["interactionId", "fromRoleId", "toRoleId", "protocol"],
      `interactions[${index}]`,
    );
    return {
      interactionId: stableId(object.interactionId, `interactions[${index}].interactionId`),
      fromRoleId: stableId(object.fromRoleId, `interactions[${index}].fromRoleId`),
      toRoleId: stableId(object.toRoleId, `interactions[${index}].toRoleId`),
      protocol: requireNonEmpty(object.protocol, `interactions[${index}].protocol`),
    };
  });

  validateSemantics({ members, roles, assignments, norms, interactions });
  const content = { mission, members, roles, assignments, norms, interactions };
  return freezeDefinition(organizationDefinitionId, revision, computeOrganizationDefinitionDigest(content), content);
}

const DEFINITION_KEYS = [
  "schemaVersion",
  "organizationDefinitionId",
  "revision",
  "digest",
  "mission",
  "members",
  "roles",
  "assignments",
  "norms",
  "interactions",
];

/** Strict parser; fails closed on a digest mismatch (never replaces a bad digest). */
export function parseOrganizationDefinition(raw: unknown, what = "OrganizationDefinition"): OrganizationDefinition {
  const object = asObject(raw, what);
  exactKeys(object, DEFINITION_KEYS, what);
  if (object.schemaVersion !== 1) fail(`${what}.schemaVersion must be 1`);
  const organizationDefinitionId = stableId(object.organizationDefinitionId, `${what}.organizationDefinitionId`);
  const revision = object.revision;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) {
    fail(`${what}.revision must be a safe non-negative integer`);
  }
  const digest = requireNonEmpty(object.digest, `${what}.digest`);
  const mission = requireNonEmpty(object.mission, `${what}.mission`);
  if (!Array.isArray(object.members)) fail(`${what}.members must be an array`);
  const members = object.members.map((entry, index) => parseMemberRef(entry, `${what}.members[${index}]`));
  if (!Array.isArray(object.roles)) fail(`${what}.roles must be an array`);
  const roles = object.roles.map((entry, index) => parseRole(entry, `${what}.roles[${index}]`));
  if (!Array.isArray(object.assignments)) fail(`${what}.assignments must be an array`);
  const assignments = object.assignments.map((entry, index) => {
    const item = asObject(entry, `${what}.assignments[${index}]`);
    exactKeys(item, ["member", "roleId"], `${what}.assignments[${index}]`);
    return {
      member: parseMemberRef(item.member, `${what}.assignments[${index}].member`),
      roleId: stableId(item.roleId, `${what}.assignments[${index}].roleId`),
    };
  });
  if (!Array.isArray(object.norms)) fail(`${what}.norms must be an array`);
  const norms = object.norms.map((entry, index) => {
    const item = asObject(entry, `${what}.norms[${index}]`);
    exactKeys(item, ["normId", "kind", "roleId", "actionTag"], `${what}.norms[${index}]`);
    if (item.kind !== "obligation" && item.kind !== "permission" && item.kind !== "prohibition") {
      fail(`${what}.norms[${index}].kind must be obligation, permission, or prohibition`);
    }
    return {
      normId: stableId(item.normId, `${what}.norms[${index}].normId`),
      kind: item.kind as OrganizationNormKind,
      roleId: stableId(item.roleId, `${what}.norms[${index}].roleId`),
      actionTag: requireNonEmpty(item.actionTag, `${what}.norms[${index}].actionTag`),
    };
  });
  if (!Array.isArray(object.interactions)) fail(`${what}.interactions must be an array`);
  const interactions = object.interactions.map((entry, index) => {
    const item = asObject(entry, `${what}.interactions[${index}]`);
    exactKeys(
      item,
      ["interactionId", "fromRoleId", "toRoleId", "protocol"],
      `${what}.interactions[${index}]`,
    );
    return {
      interactionId: stableId(item.interactionId, `${what}.interactions[${index}].interactionId`),
      fromRoleId: stableId(item.fromRoleId, `${what}.interactions[${index}].fromRoleId`),
      toRoleId: stableId(item.toRoleId, `${what}.interactions[${index}].toRoleId`),
      protocol: requireNonEmpty(item.protocol, `${what}.interactions[${index}].protocol`),
    };
  });

  validateSemantics({ members, roles, assignments, norms, interactions });
  const content = { mission, members, roles, assignments, norms, interactions };
  const computed = computeOrganizationDefinitionDigest(content);
  if (digest !== computed) {
    fail(`digest mismatch: supplied ${digest}, computed ${computed} (the parser validates; it never replaces a bad digest)`);
  }
  return freezeDefinition(organizationDefinitionId, revision, digest, content);
}

/** Canonical ref for an organization revision (§69). */
export function organizationRefOf(definition: OrganizationDefinition): OrganizationDefinitionRef {
  return Object.freeze({
    organizationDefinitionId: definition.organizationDefinitionId,
    revision: definition.revision,
    digest: definition.digest,
  });
}

export function parseOrganizationRef(raw: unknown, what = "OrganizationDefinitionRef"): OrganizationDefinitionRef {
  const object = asObject(raw, what);
  exactKeys(object, ["organizationDefinitionId", "revision", "digest"], what);
  const revision = object.revision;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) {
    fail(`${what}.revision must be a safe non-negative integer`);
  }
  return Object.freeze({
    organizationDefinitionId: stableId(object.organizationDefinitionId, `${what}.organizationDefinitionId`),
    revision,
    digest: requireNonEmpty(object.digest, `${what}.digest`),
  });
}

export function organizationRefsEqual(a: OrganizationDefinitionRef, b: OrganizationDefinitionRef): boolean {
  return (
    a.organizationDefinitionId === b.organizationDefinitionId && a.revision === b.revision && a.digest === b.digest
  );
}
