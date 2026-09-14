/**
 * G10-M organization retirement — append-only lifecycle truth (no revision deletion).
 *
 *   Organization retirement ≠ revision deletion ≠ empty revision
 *                          ≠ Institution termination ≠ Campaign termination
 *   Retired ≠ erased   Closed ≠ retired   Inactive ≠ nonexistent
 *
 * The retirement candidate is deterministic (the proposal subject already names the exact
 * organization ref, so no role/norm guessing is required). It is assessed against the
 * canonical store plus exhaustive read-only institution / runtime-dependency ports; an
 * UNKNOWN dependency is `blocked`, never assumed empty.
 */

import { canonicalDigest } from "../schema/canonical.js";
import type { OrganizationDefinitionRef, OrganizationLifecycle } from "../organization/index.js";
import { parseOrganizationRef } from "../organization/index.js";
import { bmDigest, bmExactKeys, bmFail, bmNonEmpty, bmObject } from "../boundary_memory/ref.js";

export const ORGANIZATION_RETIREMENT_CANDIDATE_DOMAIN = "palimpsest.organization-retirement-candidate.v1";
export const ORGANIZATION_RETIREMENT_ASSESSMENT_DOMAIN = "palimpsest.organization-retirement-assessment.v1";

export interface OrganizationRetirementCandidate {
  readonly schemaVersion: 1;
  readonly proposalDigest: string;
  readonly proposalBasisDigest: string;
  readonly target: OrganizationDefinitionRef;
  readonly reason: string;
  readonly digest: string;
}

export function organizationRetirementCandidateDigestOf(input: Omit<OrganizationRetirementCandidate, "digest">): string {
  return canonicalDigest({ domain: ORGANIZATION_RETIREMENT_CANDIDATE_DOMAIN, ...input });
}

export function materializeOrganizationRetirementCandidate(input: {
  readonly proposalDigest: string;
  readonly proposalBasisDigest: string;
  readonly target: OrganizationDefinitionRef;
  readonly reason: string;
}): OrganizationRetirementCandidate {
  const base = {
    schemaVersion: 1 as const,
    proposalDigest: bmNonEmpty(input.proposalDigest, "proposalDigest"),
    proposalBasisDigest: bmNonEmpty(input.proposalBasisDigest, "proposalBasisDigest"),
    target: parseOrganizationRef(input.target, "target"),
    reason: bmNonEmpty(input.reason, "reason"),
  };
  return Object.freeze({ ...base, digest: organizationRetirementCandidateDigestOf(base) });
}

export function parseOrganizationRetirementCandidate(raw: unknown): OrganizationRetirementCandidate {
  const object = bmObject(raw, "OrganizationRetirementCandidate");
  bmExactKeys(object, ["schemaVersion", "proposalDigest", "proposalBasisDigest", "target", "reason", "digest"], "OrganizationRetirementCandidate");
  if (object.schemaVersion !== 1) bmFail("OrganizationRetirementCandidate.schemaVersion must be 1");
  const base = {
    schemaVersion: 1 as const,
    proposalDigest: bmNonEmpty(object.proposalDigest, "proposalDigest"),
    proposalBasisDigest: bmNonEmpty(object.proposalBasisDigest, "proposalBasisDigest"),
    target: parseOrganizationRef(object.target, "target"),
    reason: bmNonEmpty(object.reason, "reason"),
  };
  const digest = bmDigest(object.digest, "digest");
  if (digest !== organizationRetirementCandidateDigestOf(base)) bmFail("organization retirement candidate digest does not match its content");
  return Object.freeze({ ...base, digest });
}

/* ------------------------------------------------------------------ *
 * Read-only safety ports (exhaustive enumeration, or UNKNOWN)
 * ------------------------------------------------------------------ */

export interface OrganizationRetirementInstitutionPort {
  /** ALL current institution bodies — exhaustive enumeration, or throw to signal unknown. */
  currentBodies(): Promise<readonly OrganizationDefinitionRef[]>;
}

export interface OrganizationRetirementRuntimePort {
  /** ids of ALL OPEN RuntimeScopes grounded to this organization lineage. */
  openScopesGroundedTo(organizationDefinitionId: string): Promise<readonly string[]>;
}

export interface OrganizationRetirementWiring {
  readonly institutions?: OrganizationRetirementInstitutionPort | undefined;
  readonly runtimeScopes?: OrganizationRetirementRuntimePort | undefined;
}

/* ------------------------------------------------------------------ *
 * Assessment
 * ------------------------------------------------------------------ */

export type OrganizationRetirementObligationKind =
  | "target_exists"
  | "target_is_current_head"
  | "proposal_freshness"
  | "lifecycle_active"
  | "no_current_institution_body"
  | "no_open_runtime_scope";

export interface OrganizationRetirementObligation {
  readonly obligationId: string;
  readonly kind: OrganizationRetirementObligationKind;
  readonly status: "satisfied" | "unresolved";
  readonly detail: string;
}

export interface OrganizationRetirementAssessment {
  readonly kind: "RETIRE";
  readonly status: "admissible" | "blocked";
  readonly candidate: OrganizationRetirementCandidate;
  readonly obligations: readonly OrganizationRetirementObligation[];
  readonly digest: string;
}

export function assessOrganizationRetirement(
  candidate: OrganizationRetirementCandidate,
  input: {
    readonly head: OrganizationDefinitionRef | undefined;
    readonly lifecycle: OrganizationLifecycle | undefined;
    readonly institutionBodies: readonly OrganizationDefinitionRef[] | "unknown";
    readonly openScopes: readonly string[] | "unknown";
    readonly proposalFresh: boolean;
  },
): OrganizationRetirementAssessment {
  const obligations: OrganizationRetirementObligation[] = [];
  const add = (kind: OrganizationRetirementObligationKind, satisfied: boolean, detail: string): void => {
    obligations.push(Object.freeze({ obligationId: `ob-${obligations.length + 1}-${kind}`, kind, status: satisfied ? "satisfied" : "unresolved", detail }));
  };
  add("target_exists", input.head !== undefined, input.head === undefined ? `organization "${candidate.target.organizationDefinitionId}" does not exist` : "the target organization exists");
  add("target_is_current_head", input.head !== undefined && input.head.revision === candidate.target.revision && input.head.digest === candidate.target.digest, input.head !== undefined && input.head.revision === candidate.target.revision && input.head.digest === candidate.target.digest ? "the target is the current head" : "the target is not the current head");
  add("proposal_freshness", input.proposalFresh, input.proposalFresh ? "the dynamics proposal is fresh" : "the dynamics proposal basis changed after it was grounded");
  add("lifecycle_active", input.lifecycle === "ACTIVE", input.lifecycle === "ACTIVE" ? "the organization is ACTIVE" : input.lifecycle === "RETIRED" ? "the organization is already RETIRED" : "the organization lifecycle is unknown");
  if (input.institutionBodies === "unknown") {
    add("no_current_institution_body", false, "institution current bodies cannot be exhaustively enumerated — retirement is blocked, never assumed institution-free");
  } else {
    const referencing = input.institutionBodies.filter((body) => body.organizationDefinitionId === candidate.target.organizationDefinitionId);
    add("no_current_institution_body", referencing.length === 0, referencing.length === 0 ? "no institution's current body references this organization" : `${referencing.length} institution(s) currently use this organization as their body`);
  }
  if (input.openScopes === "unknown") {
    add("no_open_runtime_scope", false, "open runtime scopes grounded to this lineage cannot be enumerated — retirement is blocked");
  } else {
    add("no_open_runtime_scope", input.openScopes.length === 0, input.openScopes.length === 0 ? "no OPEN runtime scope is grounded to this lineage" : `${input.openScopes.length} OPEN runtime scope(s) are grounded to this lineage`);
  }
  const status = obligations.some((obligation) => obligation.status === "unresolved") ? "blocked" : "admissible";
  return Object.freeze({
    kind: "RETIRE",
    status,
    candidate,
    obligations: Object.freeze(obligations),
    digest: canonicalDigest({
      domain: ORGANIZATION_RETIREMENT_ASSESSMENT_DOMAIN,
      candidateDigest: candidate.digest,
      status,
      obligations: obligations.map((obligation) => ({ kind: obligation.kind, status: obligation.status })),
    }),
  });
}
