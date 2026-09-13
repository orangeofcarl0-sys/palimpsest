/**
 * G10-F2 role eligibility view (optional, §55).
 *
 * Compares a role's DECLARED `requiredCapabilities` against DECLARED
 * capability observations and labels the result HONESTLY. It never says
 * "verified capable": verified capability possession (κ) is DEFERRED, and
 * `PeerAdvertisement` competence tags are explicitly NOT evidence (§54).
 */

import type { OrganizationDefinition, OrganizationMemberRef, RoleId } from "./definition.js";
import { organizationMemberKey } from "./definition.js";

export type RoleEligibilityBasis =
  | "eligible_by_declared_capability"
  | "declared_capability_insufficient"
  | "capability_unknown";

export interface RoleEligibilityEntry {
  readonly member: OrganizationMemberRef;
  readonly roleId: RoleId;
  readonly basis: RoleEligibilityBasis;
  /** Declared requirements not covered by the declaration; empty when eligible. */
  readonly missingDeclaredCapabilities: readonly string[];
}

/**
 * `declaredCapabilitiesOf` returns the DECLARED tags observed for a member, or
 * `undefined` when nothing is known. Advertisements are observations, not
 * evidence — the basis label reflects exactly that.
 */
export function roleEligibilityView(
  definition: OrganizationDefinition,
  declaredCapabilitiesOf: (member: OrganizationMemberRef) => readonly string[] | undefined,
): readonly RoleEligibilityEntry[] {
  const roles = new Map(definition.roles.map((role) => [role.roleId, role]));
  const entries = definition.assignments.map<RoleEligibilityEntry>((assignment) => {
    const role = roles.get(assignment.roleId);
    const required = role?.requiredCapabilities ?? [];
    const declared = declaredCapabilitiesOf(assignment.member);
    if (declared === undefined) {
      return Object.freeze({
        member: assignment.member,
        roleId: assignment.roleId,
        basis: "capability_unknown" as const,
        missingDeclaredCapabilities: Object.freeze([...required]),
      });
    }
    const declaredSet = new Set(declared);
    const missing = required.filter((capability) => !declaredSet.has(capability));
    return Object.freeze({
      member: assignment.member,
      roleId: assignment.roleId,
      basis: (missing.length === 0
        ? "eligible_by_declared_capability"
        : "declared_capability_insufficient") as RoleEligibilityBasis,
      missingDeclaredCapabilities: Object.freeze(missing),
    });
  });
  return Object.freeze(entries);
}

/** Convenience: a declared-capability lookup keyed by member identity. */
export function declaredCapabilityIndex(
  entries: readonly { readonly member: OrganizationMemberRef; readonly tags: readonly string[] }[],
): ReadonlyMap<string, readonly string[]> {
  const index = new Map<string, readonly string[]>();
  for (const entry of entries) {
    index.set(organizationMemberKey(entry.member), entry.tags);
  }
  return index;
}
