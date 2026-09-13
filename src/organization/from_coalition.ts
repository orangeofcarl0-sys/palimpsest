/**
 * G10-F2 Coalition → Organization authoring helper (§70–§71).
 *
 * A coalition MAY seed an organization's members. It NEVER infers
 * organization semantics: organization id, mission, roles, assignments, norms,
 * and interactions are all REQUIRED explicit authoring inputs. The coalition
 * snapshot is cited as provenance only.
 *
 * `CoalitionSnapshot.digest` NEVER becomes `OrganizationDefinitionId` (§71).
 */

import type { CoalitionProvenanceRef, CoalitionSnapshot } from "../federation/coalition.js";
import { coalitionProvenanceOf } from "../federation/coalition.js";
import type {
  OrganizationDefinition,
  OrganizationMemberRef,
  OrganizationNorm,
  OrganizationInteraction,
  RoleAssignment,
  RoleDefinition,
} from "./definition.js";
import { materializeOrganizationDefinition } from "./definition.js";

export interface OrganizationFromCoalitionInput {
  readonly coalition: CoalitionSnapshot;
  readonly organizationDefinitionId: string;
  readonly revision: number;
  readonly mission: string;
  readonly roles: readonly RoleDefinition[];
  readonly assignments: readonly RoleAssignment[];
  readonly norms?: readonly OrganizationNorm[];
  readonly interactions?: readonly OrganizationInteraction[];
  /** Explicit member override. When absent, coalition peers seed peer members ONLY. */
  readonly members?: readonly OrganizationMemberRef[];
}

export interface OrganizationFromCoalitionResult {
  readonly definition: OrganizationDefinition;
  /** Provenance-only citation of the source coalition (§42/§71). */
  readonly provenance: CoalitionProvenanceRef;
}

export function materializeOrganizationFromCoalition(
  input: OrganizationFromCoalitionInput,
): OrganizationFromCoalitionResult {
  const members: readonly OrganizationMemberRef[] =
    input.members ??
    input.coalition.members.map((peer) => Object.freeze({ kind: "peer" as const, peer: Object.freeze({ ...peer }) }));
  const definition = materializeOrganizationDefinition({
    organizationDefinitionId: input.organizationDefinitionId,
    revision: input.revision,
    mission: input.mission,
    members,
    roles: input.roles,
    assignments: input.assignments,
    ...(input.norms === undefined ? {} : { norms: input.norms }),
    ...(input.interactions === undefined ? {} : { interactions: input.interactions }),
  });
  // Provenance only — no organization is created or persisted by this call.
  return Object.freeze({ definition, provenance: coalitionProvenanceOf(input.coalition) });
}
