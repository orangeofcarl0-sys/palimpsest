/**
 * G10-J governed evolution service — one application-facing mutating boundary.
 *
 *   FreshProposal → CompleteCandidate → F3Assessment → Authority → (Governance) → Activation
 *
 * The Dynamics layer has no direct mutator. Activation reuses the existing F3 path
 * (`evaluateOrganizationTransformation` / `activateOrganizationTransformation`) and the
 * existing F5 path (`activateAndGovernOrganizationChange` + InstitutionService approvals and advance).
 * Every irreversible step is preceded by a freshness check; blocked/denied/unresolved are
 * legitimate non-failure outcomes with zero canonical writes.
 */

import { canonicalDigest } from "../schema/canonical.js";
import type { OrganizationDefinition, OrganizationDefinitionRef } from "../organization/index.js";
import { organizationRefOf } from "../organization/index.js";
import type { OrganizationTransformationAssessment, TransformationEvidencePort } from "../organization/index.js";
import {
  activateOrganizationTransformation,
  evaluateOrganizationTransformation,
} from "../organization/index.js";
import type { OrganizationStore } from "../organization/index.js";
import type { InstitutionService, InstitutionStore } from "../institution/index.js";
import { activateAndGovernOrganizationChange } from "../institution/index.js";
import type { DynamicsPolicy, OrganizationDynamicsProposal, ProposalImpactReport } from "../organization_dynamics/index.js";
import type { OrganizationDynamicsService } from "../organization_dynamics/index.js";
import { subjectKey } from "../organization_dynamics/index.js";
import type {
  CompleteEvolutionCandidate,
  EvolutionCaseRef,
  EvolutionCaseState,
  EvolutionGovernance,
  EvolutionTargetKind,
  OrganizationEvolutionAdmissionPort,
  OrganizationEvolutionCompilerPort,
} from "./artifacts.js";
import type { EvolutionEvent } from "./store.js";
import {
  EVOLUTION_KIND_DISPOSITION,
  EVOLUTION_KIND_TO_TRANSFORMATION,
  EvolutionArtifactError,
  evolutionCandidateDigestOf,
  evolutionCaseRefOf,
  parseCompleteEvolutionCandidate,
} from "./artifacts.js";
import type { OrganizationEvolutionStore } from "./store.js";
import { EvolutionStoreError } from "./store.js";
import { acceptedBoundaryRevisionRefsEqual } from "../boundary_memory/ref.js";
import type { OrganizationFormalizationWiring } from "./formalization.js";
import { formalizationAssessmentDigestOf, parseCompleteFormalizationCandidate } from "./formalization.js";

export const EVOLUTION_ASSESSMENT_DOMAIN = "palimpsest.organization-evolution-assessment.v1";

export interface OrganizationEvolutionInstitutionWiring {
  readonly institutionId: string;
  readonly service: InstitutionService;
  readonly store: InstitutionStore;
}

export interface OrganizationEvolutionDeps {
  readonly organizations: OrganizationStore;
  readonly dynamics: OrganizationDynamicsService;
  readonly store?: OrganizationEvolutionStore | undefined;
  readonly compiler?: OrganizationEvolutionCompilerPort | undefined;
  readonly authority?: OrganizationEvolutionAdmissionPort | undefined;
  readonly evidence?: TransformationEvidencePort | undefined;
  readonly institution?: OrganizationEvolutionInstitutionWiring | undefined;
  readonly capabilities?: readonly string[] | undefined;
  /** G10-K CF-J-02: the read-only accepted-blueprint source + untrusted formalization compiler. */
  readonly formalization?: OrganizationFormalizationWiring | undefined;
}

/** One evolution request. `blueprintSource` is required for FORMALIZE_ORGANIZATION only. */
export interface EvolutionRequest {
  readonly proposal: OrganizationDynamicsProposal;
  readonly policy: DynamicsPolicy;
  readonly blueprintSource?: { readonly workspaceId: string; readonly artifactId: string } | undefined;
}

export type EvolutionOutcome =
  | { readonly status: "stale_proposal"; readonly detail: string }
  | { readonly status: "stale_candidate"; readonly detail: string }
  | { readonly status: "unsupported_evolution_kind"; readonly detail: string }
  | { readonly status: "terminal_resolved"; readonly kind: "NO_CHANGE" | "RETAIN_FEDERATION"; readonly caseRef: EvolutionCaseRef | null }
  | { readonly status: "incomplete"; readonly detail: string }
  | { readonly status: "blocked"; readonly caseRef: EvolutionCaseRef; readonly unresolvedObligations: readonly string[] }
  | { readonly status: "denied"; readonly caseRef: EvolutionCaseRef; readonly detail: string }
  | { readonly status: "authority_unresolved"; readonly caseRef: EvolutionCaseRef; readonly detail: string }
  | { readonly status: "awaiting_governance"; readonly caseRef: EvolutionCaseRef; readonly institutionId: string; readonly transitionId: string; readonly adopted: OrganizationDefinitionRef }
  | { readonly status: "activated"; readonly caseRef: EvolutionCaseRef | null; readonly activated: readonly OrganizationDefinitionRef[]; readonly afterSnapshotDigest: string | null };

export interface EvolutionInspection {
  readonly caseRef: EvolutionCaseRef;
  readonly state: EvolutionCaseState;
  readonly events: readonly EvolutionEvent[];
}

export interface OrganizationEvolutionService {
  prepareEvolution(input: EvolutionRequest): Promise<EvolutionOutcome>;
  resumeEvolution(input: EvolutionRequest): Promise<EvolutionOutcome>;
  advanceEvolution(input: EvolutionRequest): Promise<EvolutionOutcome>;
  observeEvolutionOutcome(input: EvolutionRequest): Promise<EvolutionOutcome>;
  inspectEvolution(caseRef: EvolutionCaseRef): Promise<EvolutionInspection>;
  dispositionOf(kind: string): string;
}

function assessmentDigestOf(assessment: OrganizationTransformationAssessment): string {
  return canonicalDigest({
    domain: EVOLUTION_ASSESSMENT_DOMAIN,
    kind: assessment.kind,
    bases: assessment.bases,
    candidates: assessment.candidates.map((candidate) => organizationRefOf(candidate)),
    obligations: assessment.obligations.map((obligation) => ({ obligationId: obligation.obligationId, kind: obligation.kind, status: obligation.status })),
    status: assessment.status,
  });
}

async function sourceDefinitions(organizations: OrganizationStore, proposal: OrganizationDynamicsProposal): Promise<readonly OrganizationDefinition[]> {
  const ids = new Set<string>();
  if (proposal.subject.kind === "organization") ids.add(proposal.subject.organization.organizationDefinitionId);
  for (const target of proposal.targets) ids.add(target);
  const definitions: OrganizationDefinition[] = [];
  for (const id of [...ids].sort()) {
    const head = await organizations.head(id);
    if (head === undefined) continue;
    const definition = await organizations.get(head);
    if (definition !== undefined) definitions.push(definition);
  }
  return Object.freeze(definitions);
}

export function makeOrganizationEvolutionService(deps: OrganizationEvolutionDeps): OrganizationEvolutionService {
  async function append(caseRef: EvolutionCaseRef, events: { eventId: string; type: EvolutionEvent["type"]; payload: unknown }[]): Promise<void> {
    if (deps.store === undefined) return;
    const basis = await deps.store.basis(caseRef);
    if (basis === undefined) throw new EvolutionStoreError("unknown_case", `evolution case "${caseRef}" does not exist`);
    await deps.store.appendAtomic({ caseRef, expectedBasis: basis, events });
  }

  function eventIdFor(type: string, caseRef: string, payload: unknown): string {
    return `evt-${canonicalDigest({ domain: "palimpsest.organization-evolution-event.v1", type, caseRef, payload }).slice(0, 24)}`;
  }

  async function candidateFresh(candidate: CompleteEvolutionCandidate, organizations: OrganizationStore): Promise<{ readonly fresh: true } | { readonly fresh: false; readonly detail: string }> {
    const baseRefs: readonly OrganizationDefinitionRef[] =
      candidate.transformation.kind === "REVISE"
        ? [candidate.transformation.base]
        : candidate.transformation.kind === "SPLIT"
          ? [candidate.transformation.base]
          : candidate.transformation.sources;
    for (const ref of baseRefs) {
      const head = await organizations.head(ref.organizationDefinitionId);
      if (head === undefined) {
        // New-id SPLIT/MERGE successors have no head yet — a base with no head is stale.
        return { fresh: false, detail: `source organization "${ref.organizationDefinitionId}" has no current head` };
      }
      if (head.revision !== ref.revision || head.digest !== ref.digest) {
        return { fresh: false, detail: `source organization "${ref.organizationDefinitionId}" advanced past the candidate base` };
      }
    }
    return { fresh: true };
  }

  async function observeAfter(proposal: OrganizationDynamicsProposal, policy: DynamicsPolicy): Promise<string | null> {
    const observed = await deps.dynamics.observe(proposal.subject, policy);
    return observed.status === "observed" ? observed.snapshot.digest : null;
  }


  async function existingCase(proposalDigest: string): Promise<{ record: { caseRef: EvolutionCaseRef }; events: readonly EvolutionEvent[]; types: readonly string[] } | undefined> {
    if (deps.store === undefined) return undefined;
    const record = await deps.store.caseByProposal(proposalDigest);
    if (record === undefined) return undefined;
    const events = await deps.store.replay(record.caseRef);
    return { record: { caseRef: record.caseRef }, events, types: events.map((event) => event.type) };
  }

  async function finishGovernance(input: { readonly proposal: OrganizationDynamicsProposal; readonly policy: DynamicsPolicy; readonly caseRef: EvolutionCaseRef; readonly governanceEvent: EvolutionEvent }): Promise<EvolutionOutcome> {
    if (deps.institution === undefined) return { status: "incomplete", detail: "governance is required but no institution is wired" };
    const payload = input.governanceEvent.payload as { institutionId: string; transitionId: string; adopted: OrganizationDefinitionRef };
    const epoch = await deps.institution.store.currentEpoch(deps.institution.institutionId);
    if (epoch === undefined || epoch.organization.revision !== payload.adopted.revision || epoch.organization.digest !== payload.adopted.digest) {
      return { status: "awaiting_governance", caseRef: input.caseRef, institutionId: deps.institution.institutionId, transitionId: payload.transitionId, adopted: payload.adopted };
    }
    await append(input.caseRef, [{ eventId: eventIdFor("EVOLUTION_ACTIVATED", input.caseRef, { activated: [payload.adopted] }), type: "EVOLUTION_ACTIVATED", payload: { activated: [payload.adopted] } }]);
    const afterSnapshotDigest = await observeAfter(input.proposal, input.policy);
    if (afterSnapshotDigest !== null) {
      await append(input.caseRef, [{ eventId: eventIdFor("EVOLUTION_POST_OBSERVED", input.caseRef, { before: input.proposal.snapshotDigest, after: afterSnapshotDigest }), type: "EVOLUTION_POST_OBSERVED", payload: { beforeSnapshotDigest: input.proposal.snapshotDigest, afterSnapshotDigest } }]);
    }
    return { status: "activated", caseRef: input.caseRef, activated: [payload.adopted], afterSnapshotDigest };
  }

  /**
   * G10-K CF-J-02: FORMALIZE_ORGANIZATION. An accepted OrganizationBlueprint is the
   * authoring source; a COMPLETE OrganizationDefinition (genesis) is compiled from it
   * and must reproduce its content exactly. It still requires independent evolution
   * authority, and it NEVER auto-creates an Institution, RuntimeScope, or Campaign.
   */
  async function driveFormalization(input: EvolutionRequest): Promise<EvolutionOutcome> {
    const { proposal, policy } = input;
    if (deps.formalization === undefined) return { status: "incomplete", detail: "no formalization boundary/compiler is configured" };
    if (deps.authority === undefined) return { status: "incomplete", detail: "no OrganizationEvolutionAdmissionPort is configured" };
    if (proposal.subject.kind !== "organization") {
      return { status: "incomplete", detail: "formalization requires an organization subject naming the target organization" };
    }
    const source = input.blueprintSource;
    if (source === undefined) return { status: "incomplete", detail: "formalization requires a blueprint source (workspaceId + artifactId)" };
    const target = proposal.subject.organization;
    let accepted;
    try {
      accepted = await deps.formalization.boundary.acceptedBlueprint(source);
    } catch (error) {
      return { status: "incomplete", detail: `cannot read the accepted blueprint: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (accepted === undefined) return { status: "incomplete", detail: "no accepted organization blueprint exists for that workspace artifact" };
    if (accepted.content.organizationDefinitionId !== target.organizationDefinitionId) {
      return { status: "incomplete", detail: "the accepted blueprint names a different organization id than the proposal subject" };
    }
    if (accepted.definition.digest !== target.digest) {
      return { status: "stale_proposal", detail: "the proposal subject digest is not the accepted blueprint's organization digest" };
    }
    if ((await deps.organizations.head(target.organizationDefinitionId)) !== undefined) {
      return { status: "stale_candidate", detail: "the target organization id is already registered (formalization is genesis, not revision)" };
    }
    let raw: unknown;
    try {
      raw = await deps.formalization.compiler.compile({
        proposal,
        blueprint: accepted.content,
        blueprintRevision: accepted.revision,
        blueprintContentDigest: accepted.contentDigest,
        coalitionProvenance: null,
        capabilities: deps.capabilities ?? [],
      });
    } catch (error) {
      return { status: "incomplete", detail: `the formalization compiler failed: ${error instanceof Error ? error.message : String(error)}` };
    }
    let candidate;
    try {
      candidate = parseCompleteFormalizationCandidate(raw);
    } catch (error) {
      return { status: "incomplete", detail: `compiler output is not a complete formalization candidate: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (candidate.proposalDigest !== proposal.digest) return { status: "incomplete", detail: "formalization candidate is not bound to this proposal" };
    if (candidate.proposalBasisDigest !== proposal.basisDigest) return { status: "incomplete", detail: "formalization candidate basis does not match the proposal basis" };
    if (!acceptedBoundaryRevisionRefsEqual(candidate.blueprint, accepted.revision)) {
      return { status: "stale_candidate", detail: "formalization candidate is not bound to the exact accepted blueprint revision" };
    }
    if (candidate.blueprintContentDigest !== accepted.contentDigest) {
      return { status: "incomplete", detail: "formalization candidate blueprint content digest does not match the accepted revision" };
    }
    if (candidate.organization.organizationDefinitionId !== target.organizationDefinitionId) {
      return { status: "incomplete", detail: "formalization candidate targets a different organization id" };
    }
    if (candidate.organization.digest !== accepted.definition.digest) {
      return { status: "incomplete", detail: "the formalization candidate does not reproduce the accepted blueprint content (roles/norms/assignments may not be invented or dropped)" };
    }

    const caseRef = evolutionCaseRefOf({ proposalDigest: proposal.digest, candidateDigest: candidate.digest });
    if (deps.store !== undefined) {
      const byProposal = await deps.store.caseByProposal(proposal.digest);
      if (byProposal !== undefined && byProposal.caseRef !== caseRef) {
        return { status: "incomplete", detail: "this proposal is already bound to a different formalization candidate" };
      }
      if (byProposal === undefined) {
        await deps.store.openCase({ caseRef, proposalDigest: proposal.digest, candidateDigest: candidate.digest, subjectKey: `organization:${target.organizationDefinitionId}` });
        await append(caseRef, [{ eventId: eventIdFor("EVOLUTION_FORMALIZATION_COMPILED", caseRef, { candidate }), type: "EVOLUTION_FORMALIZATION_COMPILED", payload: { candidate } }]);
      }
    }

    // Re-read the exact accepted blueprint before any irreversible step.
    let reread;
    try {
      reread = await deps.formalization.boundary.acceptedBlueprint(source);
    } catch (error) {
      return { status: "stale_candidate", detail: `the accepted blueprint could not be re-read: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (reread === undefined || !acceptedBoundaryRevisionRefsEqual(reread.revision, accepted.revision)) {
      return { status: "stale_candidate", detail: "the accepted blueprint advanced during formalization" };
    }

    const observed = await deps.dynamics.observe(proposal.subject, policy);
    if (observed.status !== "observed") return { status: "incomplete", detail: `cannot build an impact report: ${observed.status}` };
    const impact = deps.dynamics.proposalImpact(proposal, observed.snapshot);
    const organizationRef = organizationRefOf(candidate.organization);
    const assessmentDigest = formalizationAssessmentDigestOf({
      proposalDigest: proposal.digest,
      candidateDigest: candidate.digest,
      blueprint: accepted.revision,
      organizationDefinitionId: target.organizationDefinitionId,
      organizationDigest: candidate.organization.digest,
    });
    if (deps.store !== undefined) {
      await append(caseRef, [
        {
          eventId: eventIdFor("EVOLUTION_ASSESSED", caseRef, { assessmentDigest, status: "admissible" }),
          type: "EVOLUTION_ASSESSED",
          payload: { kind: "FORMALIZE", status: "admissible", assessmentDigest, obligations: [] },
        },
      ]);
    }

    const authorityOutcome = await deps.authority.admit({
      proposalDigest: proposal.digest,
      candidateDigest: candidate.digest,
      assessmentDigest,
      sourceOrganizations: Object.freeze([]),
      kind: "FORMALIZE",
      governance: "standalone",
      impact,
    });
    if (authorityOutcome.outcome === "denied") {
      if (deps.store !== undefined) await append(caseRef, [{ eventId: eventIdFor("EVOLUTION_DENIED", caseRef, { detail: authorityOutcome.detail }), type: "EVOLUTION_DENIED", payload: { detail: authorityOutcome.detail } }]);
      return { status: "denied", caseRef, detail: authorityOutcome.detail };
    }
    if (authorityOutcome.outcome === "unresolved") {
      if (deps.store !== undefined) await append(caseRef, [{ eventId: eventIdFor("EVOLUTION_AUTHORITY_UNRESOLVED", caseRef, { detail: authorityOutcome.detail }), type: "EVOLUTION_AUTHORITY_UNRESOLVED", payload: { detail: authorityOutcome.detail } }]);
      return { status: "authority_unresolved", caseRef, detail: authorityOutcome.detail };
    }
    if (deps.store !== undefined) {
      await append(caseRef, [{ eventId: eventIdFor("EVOLUTION_AUTHORIZED", caseRef, { candidateDigest: candidate.digest, assessmentDigest, governance: "standalone" }), type: "EVOLUTION_AUTHORIZED", payload: { candidateDigest: candidate.digest, assessmentDigest, governance: "standalone" } }]);
    }

    // Genesis registration is the ONLY canonical write. No Institution/RuntimeScope/Campaign.
    try {
      await deps.organizations.registerRevision({ definition: candidate.organization, parent: null, expectedHeadRevision: null });
    } catch (error) {
      return { status: "stale_candidate", detail: `organization genesis failed: ${error instanceof Error ? error.message : String(error)}` };
    }
    const activated = Object.freeze([organizationRef]);
    if (deps.store !== undefined) await append(caseRef, [{ eventId: eventIdFor("EVOLUTION_ACTIVATED", caseRef, { activated }), type: "EVOLUTION_ACTIVATED", payload: { activated } }]);
    const afterSnapshotDigest = await observeAfter(proposal, policy);
    if (afterSnapshotDigest !== null && deps.store !== undefined) {
      await append(caseRef, [{ eventId: eventIdFor("EVOLUTION_POST_OBSERVED", caseRef, { before: proposal.snapshotDigest, after: afterSnapshotDigest }), type: "EVOLUTION_POST_OBSERVED", payload: { beforeSnapshotDigest: proposal.snapshotDigest, afterSnapshotDigest } }]);
    }
    return { status: "activated", caseRef, activated, afterSnapshotDigest };
  }

  async function drive(input: EvolutionRequest): Promise<EvolutionOutcome> {
    const { proposal, policy } = input;
    const disposition = EVOLUTION_KIND_DISPOSITION[proposal.kind];
    if (disposition === undefined) return { status: "unsupported_evolution_kind", detail: `unknown proposal kind "${proposal.kind}"` };

    // Idempotent re-entry: an existing case in a terminal-ish state short-circuits before
    // freshness (activation legitimately changes the source basis).
    const prior = await existingCase(proposal.digest);
    if (prior !== undefined) {
      const last = (type: string) => [...prior.events].reverse().find((event) => event.type === type);
      if (prior.types.includes("EVOLUTION_ACTIVATED")) {
        const activated = (last("EVOLUTION_ACTIVATED")!.payload as { activated: readonly OrganizationDefinitionRef[] }).activated;
        const post = last("EVOLUTION_POST_OBSERVED");
        return { status: "activated", caseRef: prior.record.caseRef, activated, afterSnapshotDigest: post === undefined ? null : (post.payload as { afterSnapshotDigest: string }).afterSnapshotDigest };
      }
      if (prior.types.includes("EVOLUTION_TERMINAL_RESOLVED")) {
        return { status: "terminal_resolved", kind: (last("EVOLUTION_TERMINAL_RESOLVED")!.payload as { kind: "NO_CHANGE" | "RETAIN_FEDERATION" }).kind, caseRef: prior.record.caseRef };
      }
      if (prior.types.includes("EVOLUTION_BLOCKED")) {
        const payload = last("EVOLUTION_BLOCKED")!.payload as { unresolvedObligations: readonly string[] };
        return { status: "blocked", caseRef: prior.record.caseRef, unresolvedObligations: payload.unresolvedObligations };
      }
      if (prior.types.includes("EVOLUTION_DENIED")) return { status: "denied", caseRef: prior.record.caseRef, detail: (last("EVOLUTION_DENIED")!.payload as { detail: string }).detail };
      if (prior.types.includes("EVOLUTION_AUTHORITY_UNRESOLVED")) return { status: "authority_unresolved", caseRef: prior.record.caseRef, detail: (last("EVOLUTION_AUTHORITY_UNRESOLVED")!.payload as { detail: string }).detail };
      const governanceEvent = last("EVOLUTION_GOVERNANCE_REQUIRED");
      if (governanceEvent !== undefined) return finishGovernance({ proposal, policy, caseRef: prior.record.caseRef, governanceEvent });
    }

    // §12: proposal freshness is checked before anything else.
    const freshness = await deps.dynamics.evaluateProposal(proposal);
    if (freshness.status !== "fresh") return { status: "stale_proposal", detail: freshness.detail };

    if (disposition === "TERMINAL_NON_MUTATING") {
      const kind = proposal.kind as "NO_CHANGE" | "RETAIN_FEDERATION";
      if (deps.store === undefined) return { status: "terminal_resolved", kind, caseRef: null };
      const caseRef = evolutionCaseRefOf({ proposalDigest: proposal.digest, candidateDigest: `terminal:${kind}` });
      const existing = await deps.store.case(caseRef);
      if (existing === undefined) {
        await deps.store.openCase({ caseRef, proposalDigest: proposal.digest, candidateDigest: `terminal:${kind}`, subjectKey: subjectKey(proposal.subject) });
        await append(caseRef, [{ eventId: eventIdFor("EVOLUTION_TERMINAL_RESOLVED", caseRef, { kind }), type: "EVOLUTION_TERMINAL_RESOLVED", payload: { kind } }]);
      }
      return { status: "terminal_resolved", kind, caseRef };
    }

    if (disposition === "DEFERRED_UNSUPPORTED") {
      return { status: "unsupported_evolution_kind", detail: `proposal kind "${proposal.kind}" has no canonical structural mutation semantics in G10-J` };
    }

    // G10-K: FORMALIZE_ORGANIZATION has its own genesis path (no F3 transformation).
    if (disposition === "EXECUTABLE_FORMALIZE") return driveFormalization(input);

    // Executable path.
    if (proposal.subject.kind !== "organization") return { status: "incomplete", detail: "executable evolution requires an organization subject" };
    if (deps.compiler === undefined) return { status: "incomplete", detail: "no OrganizationEvolutionCompilerPort is configured" };
    if (deps.authority === undefined) return { status: "incomplete", detail: "no OrganizationEvolutionAdmissionPort is configured" };

    const subjectRef = proposal.subject.organization;
    const sources = await sourceDefinitions(deps.organizations, proposal);
    const observed = await deps.dynamics.observe(proposal.subject, policy);
    if (observed.status !== "observed") return { status: "incomplete", detail: `cannot build an impact report: ${observed.status}` };
    const impact: ProposalImpactReport = deps.dynamics.proposalImpact(proposal, observed.snapshot);

    const expectedKind = EVOLUTION_KIND_TO_TRANSFORMATION[proposal.kind]!;
    // Compilation is untrusted and produces a COMPLETE candidate.
    const raw = await deps.compiler.compile({ proposal, impact, sources, capabilities: deps.capabilities ?? [] });
    let candidate: CompleteEvolutionCandidate;
    try {
      candidate = parseCompleteEvolutionCandidate(raw);
    } catch (error) {
      return { status: "incomplete", detail: `compiler output is not a complete candidate: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (candidate.proposalDigest !== proposal.digest) return { status: "incomplete", detail: "candidate is not bound to this proposal" };
    if (candidate.proposalBasisDigest !== proposal.basisDigest) return { status: "incomplete", detail: "candidate basis does not match the proposal basis" };
    if (candidate.kind !== expectedKind) return { status: "incomplete", detail: `candidate kind ${candidate.kind} does not match proposal kind ${proposal.kind}` };

    const caseRef = evolutionCaseRefOf({ proposalDigest: proposal.digest, candidateDigest: candidate.digest });
    if (deps.store !== undefined) {
      const byProposal = await deps.store.caseByProposal(proposal.digest);
      if (byProposal !== undefined && byProposal.caseRef !== caseRef) return { status: "incomplete", detail: "this proposal is already bound to a different candidate" };
      if (byProposal === undefined) {
        await deps.store.openCase({ caseRef, proposalDigest: proposal.digest, candidateDigest: candidate.digest, subjectKey: `organization:${subjectRef.organizationDefinitionId}` });
        await append(caseRef, [{ eventId: eventIdFor("EVOLUTION_CANDIDATE_COMPILED", caseRef, { candidate }), type: "EVOLUTION_CANDIDATE_COMPILED", payload: { candidate } }]);
      }
    }

    // §12: candidate freshness is re-verified before irreversible work.
    const fresh = await candidateFresh(candidate, deps.organizations);
    if (!fresh.fresh) return { status: "stale_candidate", detail: fresh.detail };

    const bases = candidate.transformation.kind === "REVISE" ? [candidate.transformation.base] : candidate.transformation.kind === "SPLIT" ? [candidate.transformation.base] : candidate.transformation.sources;
    const baseDefinitions: OrganizationDefinition[] = [];
    for (const ref of bases) {
      const definition = await deps.organizations.get(ref);
      if (definition !== undefined) baseDefinitions.push(definition);
    }
    const assessment = await evaluateOrganizationTransformation(candidate.transformation, {
      bases: Object.freeze(baseDefinitions),
      ...(deps.evidence === undefined ? {} : { evidence: deps.evidence }),
    });
    const assessmentDigest = assessmentDigestOf(assessment);
    if (deps.store !== undefined) {
      await append(caseRef, [
        {
          eventId: eventIdFor("EVOLUTION_ASSESSED", caseRef, { assessmentDigest, status: assessment.status }),
          type: "EVOLUTION_ASSESSED",
          payload: { kind: assessment.kind, status: assessment.status, assessmentDigest, obligations: assessment.obligations.map((obligation) => ({ obligationId: obligation.obligationId, kind: obligation.kind, status: obligation.status, detail: obligation.detail })) },
        },
      ]);
    }
    if (assessment.status !== "admissible") {
      const unresolved = assessment.obligations.filter((obligation) => obligation.status === "unresolved").map((obligation) => obligation.obligationId);
      if (deps.store !== undefined) await append(caseRef, [{ eventId: eventIdFor("EVOLUTION_BLOCKED", caseRef, { unresolved }), type: "EVOLUTION_BLOCKED", payload: { unresolvedObligations: unresolved } }]);
      return { status: "blocked", caseRef, unresolvedObligations: Object.freeze(unresolved) };
    }

    // Governance routing: is the source organization the current body of the wired institution?
    let governance: EvolutionGovernance = "standalone";
    if (deps.institution !== undefined) {
      const epoch = await deps.institution.store.currentEpoch(deps.institution.institutionId);
      if (epoch !== undefined && epoch.organization.organizationDefinitionId === subjectRef.organizationDefinitionId) governance = "institution";
    }

    const authorityOutcome = await deps.authority.admit({
      proposalDigest: proposal.digest,
      candidateDigest: candidate.digest,
      assessmentDigest,
      sourceOrganizations: Object.freeze(bases),
      kind: candidate.kind,
      governance,
      impact,
    });
    if (authorityOutcome.outcome === "denied") {
      if (deps.store !== undefined) await append(caseRef, [{ eventId: eventIdFor("EVOLUTION_DENIED", caseRef, { detail: authorityOutcome.detail }), type: "EVOLUTION_DENIED", payload: { detail: authorityOutcome.detail } }]);
      return { status: "denied", caseRef, detail: authorityOutcome.detail };
    }
    if (authorityOutcome.outcome === "unresolved") {
      if (deps.store !== undefined) await append(caseRef, [{ eventId: eventIdFor("EVOLUTION_AUTHORITY_UNRESOLVED", caseRef, { detail: authorityOutcome.detail }), type: "EVOLUTION_AUTHORITY_UNRESOLVED", payload: { detail: authorityOutcome.detail } }]);
      return { status: "authority_unresolved", caseRef, detail: authorityOutcome.detail };
    }
    if (deps.store !== undefined) {
      await append(caseRef, [{ eventId: eventIdFor("EVOLUTION_AUTHORIZED", caseRef, { candidateDigest: candidate.digest, assessmentDigest, governance }), type: "EVOLUTION_AUTHORIZED", payload: { candidateDigest: candidate.digest, assessmentDigest, governance } }]);
    }

    if (governance === "institution") {
      const wiring = deps.institution!;
      const adoptedRefs = await activateOrganizationTransformation(deps.organizations, assessment);
      const adopted = adoptedRefs[0]!;
      const governed = await activateAndGovernOrganizationChange({
        organizationStore: deps.organizations,
        institutionService: wiring.service,
        institutionId: wiring.institutionId,
        assessment,
        reason: "governed organization evolution",
      });
      if (deps.store !== undefined) {
        await append(caseRef, [{ eventId: eventIdFor("EVOLUTION_GOVERNANCE_REQUIRED", caseRef, { institutionId: wiring.institutionId, transitionId: governed.transition.transitionId }), type: "EVOLUTION_GOVERNANCE_REQUIRED", payload: { institutionId: wiring.institutionId, transitionId: governed.transition.transitionId, adopted } }]);
      }
      return { status: "awaiting_governance", caseRef, institutionId: wiring.institutionId, transitionId: governed.transition.transitionId, adopted };
    }

    const activated = await activateOrganizationTransformation(deps.organizations, assessment);
    if (deps.store !== undefined) await append(caseRef, [{ eventId: eventIdFor("EVOLUTION_ACTIVATED", caseRef, { activated }), type: "EVOLUTION_ACTIVATED", payload: { activated } }]);
    const afterSnapshotDigest = await observeAfter(proposal, policy);
    if (afterSnapshotDigest !== null && deps.store !== undefined) {
      await append(caseRef, [{ eventId: eventIdFor("EVOLUTION_POST_OBSERVED", caseRef, { before: proposal.snapshotDigest, after: afterSnapshotDigest }), type: "EVOLUTION_POST_OBSERVED", payload: { beforeSnapshotDigest: proposal.snapshotDigest, afterSnapshotDigest } }]);
    }
    return { status: "activated", caseRef, activated, afterSnapshotDigest };
  }

  async function inspectEvolution(caseRef: EvolutionCaseRef): Promise<EvolutionInspection> {
    if (deps.store === undefined) throw new EvolutionStoreError("unknown_case", "no evolution store is configured");
    const record = await deps.store.case(caseRef);
    if (record === undefined) throw new EvolutionStoreError("unknown_case", `evolution case "${caseRef}" does not exist`);
    const events = await deps.store.replay(caseRef);
    let state: EvolutionCaseState = "PROPOSED";
    for (const event of events) {
      switch (event.type) {
        case "EVOLUTION_CANDIDATE_COMPILED": state = "COMPILED"; break;
        case "EVOLUTION_FORMALIZATION_COMPILED": state = "COMPILED"; break;
        case "EVOLUTION_ASSESSED": state = "COMPILED"; break;
        case "EVOLUTION_BLOCKED": state = "BLOCKED"; break;
        case "EVOLUTION_AUTHORIZED": state = "COMPILED"; break;
        case "EVOLUTION_DENIED": state = "DENIED"; break;
        case "EVOLUTION_AUTHORITY_UNRESOLVED": state = "AUTHORITY_UNRESOLVED"; break;
        case "EVOLUTION_GOVERNANCE_REQUIRED": state = "AWAITING_GOVERNANCE"; break;
        case "EVOLUTION_ACTIVATED": state = "ACTIVATED"; break;
        case "EVOLUTION_POST_OBSERVED": state = "POST_OBSERVED"; break;
        case "EVOLUTION_TERMINAL_RESOLVED": state = "TERMINAL_RESOLVED"; break;
        case "EVOLUTION_CLOSED": state = "CLOSED"; break;
        default: break;
      }
    }
    return Object.freeze({ caseRef, state, events });
  }

  return {
    prepareEvolution: drive,
    advanceEvolution: drive,
    resumeEvolution: drive,
    observeEvolutionOutcome: async (input) => {
      if (deps.store === undefined) return drive(input);
      const existing = await deps.store.caseByProposal(input.proposal.digest);
      if (existing === undefined) return drive(input);
      const events = await deps.store.replay(existing.caseRef);
      const activated = events.some((event) => event.type === "EVOLUTION_ACTIVATED");
      const observedAlready = events.some((event) => event.type === "EVOLUTION_POST_OBSERVED");
      if (!activated || observedAlready) return drive(input);
      const afterSnapshotDigest = await observeAfter(input.proposal, input.policy);
      if (afterSnapshotDigest !== null) {
        await append(existing.caseRef, [{ eventId: eventIdFor("EVOLUTION_POST_OBSERVED", existing.caseRef, { before: input.proposal.snapshotDigest, after: afterSnapshotDigest }), type: "EVOLUTION_POST_OBSERVED", payload: { beforeSnapshotDigest: input.proposal.snapshotDigest, afterSnapshotDigest } }]);
      }
      return { status: "activated", caseRef: existing.caseRef, activated: [], afterSnapshotDigest };
    },
    inspectEvolution,
    dispositionOf: (kind: string) => EVOLUTION_KIND_DISPOSITION[kind] ?? "DEFERRED_UNSUPPORTED",
  };
}

export { EvolutionArtifactError, evolutionCandidateDigestOf };
