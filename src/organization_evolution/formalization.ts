/**
 * G10-K CF-J-02 closure — governed FORMALIZE_ORGANIZATION.
 *
 *   AcceptedOrganizationBlueprint ≠ OrganizationDefinition
 *   BoundaryAcceptance ≠ EvolutionAuthority
 *   Blueprint acceptance causes ZERO canonical organization writes
 *
 * A formalization candidate compiles a fresh `FORMALIZE_ORGANIZATION` Dynamics
 * proposal together with an EXACT accepted `organization-blueprint.v1` revision
 * into a complete `OrganizationDefinition` (genesis revision 0). It reuses the
 * G10-J authority/governance path — no second governance store — and the kernel
 * proves the untrusted compiler invented nothing by requiring the candidate
 * organization content to be digest-identical to the accepted blueprint.
 */

import type { OrganizationDefinition } from "../organization/index.js";
import { parseOrganizationDefinition } from "../organization/index.js";
import type { OrganizationDynamicsProposal } from "../organization_dynamics/index.js";
import type { AcceptedOrganizationBlueprint, OrganizationBlueprintContent } from "../boundary_memory/index.js";
import type { AcceptedBoundaryRevisionRef } from "../boundary_memory/ref.js";
import { parseAcceptedBoundaryRevisionRef } from "../boundary_memory/ref.js";
import { canonicalDigest } from "../schema/canonical.js";
import { bmDigest, bmExactKeys, bmFail, bmNonEmpty, bmLiteral, bmObject } from "../boundary_memory/ref.js";

export const FORMALIZATION_CANDIDATE_DOMAIN = "palimpsest.organization-formalization-candidate.v1";

export interface CompleteFormalizationCandidate {
  readonly schemaVersion: 1;
  readonly proposalDigest: string;
  readonly proposalBasisDigest: string;
  readonly kind: "FORMALIZE";
  /** The EXACT accepted blueprint revision this candidate authoritatively derives from. */
  readonly blueprint: AcceptedBoundaryRevisionRef;
  readonly blueprintContentDigest: string;
  /** Complete genesis definition (revision 0). */
  readonly organization: OrganizationDefinition;
  readonly compilerProvenance: string;
  readonly digest: string;
}

export function formalizationCandidateDigestOf(input: Omit<CompleteFormalizationCandidate, "digest">): string {
  return canonicalDigest({ domain: FORMALIZATION_CANDIDATE_DOMAIN, ...input });
}

export function parseCompleteFormalizationCandidate(raw: unknown): CompleteFormalizationCandidate {
  const object = bmObject(raw, "CompleteFormalizationCandidate");
  bmExactKeys(
    object,
    ["schemaVersion", "proposalDigest", "proposalBasisDigest", "kind", "blueprint", "blueprintContentDigest", "organization", "compilerProvenance", "digest"],
    "CompleteFormalizationCandidate",
  );
  if (object.schemaVersion !== 1) bmFail("CompleteFormalizationCandidate.schemaVersion must be 1");
  const organization = parseOrganizationDefinition(object.organization, "candidate.organization");
  if (organization.revision !== 0) bmFail("a formalization candidate must be a genesis definition (revision 0)");
  const base = {
    schemaVersion: 1 as const,
    proposalDigest: bmNonEmpty(object.proposalDigest, "proposalDigest"),
    proposalBasisDigest: bmNonEmpty(object.proposalBasisDigest, "proposalBasisDigest"),
    kind: bmLiteral(object.kind, ["FORMALIZE"], "kind"),
    blueprint: parseAcceptedBoundaryRevisionRef(object.blueprint, "blueprint"),
    blueprintContentDigest: bmDigest(object.blueprintContentDigest, "blueprintContentDigest"),
    organization,
    compilerProvenance: bmNonEmpty(object.compilerProvenance, "compilerProvenance"),
  };
  const digest = bmDigest(object.digest, "digest");
  if (digest !== formalizationCandidateDigestOf(base)) bmFail("formalization candidate digest does not match its content");
  return Object.freeze({ ...base, digest });
}

/* ------------------------------------------------------------------ *
 * Compiler / boundary seams
 * ------------------------------------------------------------------ */

export interface OrganizationFormalizationCompilerInput {
  readonly proposal: OrganizationDynamicsProposal;
  /** The accepted authoring source. Missing roles/norms/assignments may NOT be inferred. */
  readonly blueprint: OrganizationBlueprintContent;
  readonly blueprintRevision: AcceptedBoundaryRevisionRef;
  readonly blueprintContentDigest: string;
  /** Provenance only — never a source of missing structure. */
  readonly coalitionProvenance: { readonly snapshotDigest: string } | null;
  readonly capabilities: readonly string[];
}

/** Untrusted host-injected authoring seam. No store, authority, or effects. */
export interface OrganizationFormalizationCompilerPort {
  compile(input: OrganizationFormalizationCompilerInput): Promise<unknown>;
}

/** Read-only boundary source. NEVER a mutation path. */
export interface OrganizationFormalizationBoundaryPort {
  acceptedBlueprint(input: { readonly workspaceId: string; readonly artifactId: string }): Promise<AcceptedOrganizationBlueprint | undefined>;
}

export interface OrganizationFormalizationWiring {
  readonly boundary: OrganizationFormalizationBoundaryPort;
  readonly compiler: OrganizationFormalizationCompilerPort;
}

export function formalizationAssessmentDigestOf(input: {
  readonly proposalDigest: string;
  readonly candidateDigest: string;
  readonly blueprint: AcceptedBoundaryRevisionRef;
  readonly organizationDefinitionId: string;
  readonly organizationDigest: string;
}): string {
  return canonicalDigest({
    domain: "palimpsest.organization-formalization-assessment.v1",
    proposalDigest: input.proposalDigest,
    candidateDigest: input.candidateDigest,
    blueprint: input.blueprint,
    organizationDefinitionId: input.organizationDefinitionId,
    organizationDigest: input.organizationDigest,
    status: "admissible",
  });
}
