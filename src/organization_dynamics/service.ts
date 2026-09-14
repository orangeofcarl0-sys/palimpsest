/**
 * G10-I Organization Dynamics service — read-only observation, diagnosis,
 * hysteresis, and non-canonical proposal. No canonical mutation authority.
 */

import { canonicalDigest } from "../schema/canonical.js";
import type { OrganizationDefinition, OrganizationDefinitionRef } from "../organization/definition.js";
import type { RuntimeScopeRef, RuntimeScopeService, RuntimeScopeState, RuntimeScopeStore } from "../runtime_scope/index.js";
import type {
  CampaignActivityObservation,
  CampaignActivityPort,
  CollaborationMetrics,
  DynamicsBasis,
  DynamicsBoundaryPort,
  DynamicsCollaborationPort,
  DynamicsKnowledge,
  DynamicsPolicy,
  DynamicsProposalKind,
  DynamicsSubject,
  ExistingTransformationMapping,
  OrganizationDynamicsProposal,
  OrganizationStructureMetrics,
  PersistenceEntry,
  PersistenceReport,
  ProposalImpactReport,
  RuntimeStructuralSnapshot,
  ScopeBasisRef,
  StructuralDiagnosis,
  StructuralPressure,
} from "./dynamics.js";
import {
  OrganizationDynamicsError,
  basisDigestOf,
  parseAdvisorProposal,
  parseDynamicsPolicy,
  parseDynamicsSubject,
  proposalDigestOf,
  snapshotDigestOf,
  subjectKey,
} from "./dynamics.js";
import type { OrganizationDynamicsAdvisorPort, OrganizationDynamicsSnapshot } from "./dynamics.js";
import type { BoundaryObservation, BoundaryWorkspaceBasisRef } from "../boundary_memory/artifacts.js";

export interface OrganizationDynamicsOrganizationPort {
  head(organizationDefinitionId: string): Promise<OrganizationDefinitionRef | undefined>;
  get(ref: OrganizationDefinitionRef): Promise<OrganizationDefinition | undefined>;
}

export interface OrganizationDynamicsDeps {
  readonly runtimeScopes: { readonly store: RuntimeScopeStore; readonly service: RuntimeScopeService };
  readonly organizations?: OrganizationDynamicsOrganizationPort | undefined;
  readonly collaboration?: DynamicsCollaborationPort | undefined;
  /** G10-J CF-I-02: read-only Campaign activity observation. */
  readonly campaignActivity?: CampaignActivityPort | undefined;
  /** G10-L: read-only boundary observation (required for a boundary_workspace subject). */
  readonly boundary?: DynamicsBoundaryPort | undefined;
}

export type ObservationResult =
  | { readonly status: "observed"; readonly snapshot: OrganizationDynamicsSnapshot }
  | { readonly status: "observation_raced"; readonly detail: string }
  | { readonly status: "unknown_source"; readonly detail: string };

export interface DiagnosisResult {
  readonly snapshot: OrganizationDynamicsSnapshot;
  readonly diagnosis: StructuralDiagnosis;
}

export interface ProposalResult {
  readonly snapshot: OrganizationDynamicsSnapshot;
  readonly diagnosis: StructuralDiagnosis;
  readonly proposal: OrganizationDynamicsProposal;
}

export interface OrganizationDynamicsService {
  observe(subject: DynamicsSubject, policy: DynamicsPolicy): Promise<ObservationResult>;
  diagnose(subject: DynamicsSubject, policy: DynamicsPolicy): Promise<ObservationResult & { readonly diagnosis?: StructuralDiagnosis }>;
  persist(snapshots: readonly OrganizationDynamicsSnapshot[], policy: DynamicsPolicy): Promise<PersistenceReport>;
  propose(input: { readonly subject: DynamicsSubject; readonly policy: DynamicsPolicy; readonly advisor?: OrganizationDynamicsAdvisorPort | undefined }): Promise<ProposalResult | { readonly status: "observation_raced" | "unknown_source"; readonly detail: string }>;
  evaluateProposal(proposal: OrganizationDynamicsProposal): Promise<{ readonly status: "fresh" } | { readonly status: "stale"; readonly detail: string }>;
  proposalImpact(proposal: OrganizationDynamicsProposal, snapshot: OrganizationDynamicsSnapshot): ProposalImpactReport;
}

const MAPPING: Readonly<Record<DynamicsProposalKind, ExistingTransformationMapping>> = Object.freeze({
  NO_CHANGE: "unsupported",
  RETAIN_FEDERATION: "unsupported",
  FORMALIZE_ORGANIZATION: "unsupported",
  REVISE_ORGANIZATION: "REVISE",
  SPLIT_ORGANIZATION: "SPLIT",
  MERGE_ORGANIZATIONS: "MERGE",
  ENCAPSULATE_RUNTIME_SCOPE: "unsupported",
  COLLAPSE_RUNTIME_STRUCTURE: "unsupported",
  DISSOLVE_OR_RETIRE_CANDIDATE: "unsupported",
});

export function makeOrganizationDynamicsService(deps: OrganizationDynamicsDeps): OrganizationDynamicsService {
  const { store, service } = deps.runtimeScopes;

  async function scopeSet(subject: DynamicsSubject): Promise<readonly RuntimeScopeRef[]> {
    // A boundary workspace has no RuntimeScope grounding.
    if (subject.kind === "boundary_workspace") return Object.freeze([]);
    if (subject.kind === "runtime_scope") {
      const seen = new Set<string>();
      const queue: string[] = [subject.scope.scopeId];
      while (queue.length > 0) {
        const scopeId = queue.shift()!;
        if (seen.has(scopeId)) continue;
        seen.add(scopeId);
        for (const child of (await service.scopeState(scopeId)).children) queue.push(child.scopeId);
      }
      return Object.freeze([...seen].sort().map((scopeId) => Object.freeze({ schemaVersion: 1 as const, scopeId })));
    }
    const all = await service.listScopes();
    const relevant: RuntimeScopeRef[] = [];
    for (const ref of all) {
      const state = await service.scopeState(ref.scopeId);
      if (state.definition.organizationBasis?.organizationDefinitionId === subject.organization.organizationDefinitionId) relevant.push(ref);
    }
    return Object.freeze(relevant.sort((a, b) => (a.scopeId < b.scopeId ? -1 : 1)));
  }

  async function boundaryBasisOf(subject: DynamicsSubject): Promise<BoundaryWorkspaceBasisRef | undefined> {
    if (subject.kind !== "boundary_workspace" || deps.boundary === undefined) return undefined;
    const observation = await deps.boundary.observe(subject.workspace.workspaceId);
    if (observation === undefined) return undefined;
    return Object.freeze({ workspace: subject.workspace, throughSeq: observation.throughSeq, chainDigest: observation.chainDigest });
  }

  async function readBases(subject: DynamicsSubject): Promise<DynamicsBasis> {
    const scopes = await scopeSet(subject);
    const runtimeScopes: ScopeBasisRef[] = [];
    let organization: OrganizationDefinitionRef | null = null;
    if (subject.kind === "organization") {
      organization = (await deps.organizations?.head(subject.organization.organizationDefinitionId)) ?? subject.organization;
    }
    for (const ref of scopes) {
      const basis = await store.basis(ref.scopeId);
      if (basis === undefined) continue;
      runtimeScopes.push(Object.freeze({ scope: ref, throughSeq: basis.throughSeq, chainDigest: basis.chainDigest }));
      if (subject.kind === "runtime_scope" && organization === null) {
        const state = await service.scopeState(ref.scopeId);
        const recorded = state.definition.organizationBasis;
        if (recorded !== null) organization = (await deps.organizations?.head(recorded.organizationDefinitionId)) ?? recorded;
      }
    }
    const coordinationHead = deps.collaboration === undefined ? 0 : (await deps.collaboration.observe()).coordinationHead;
    const boundary = await boundaryBasisOf(subject);
    return Object.freeze({
      subject,
      organization,
      runtimeScopes: Object.freeze(runtimeScopes),
      coordinationHead,
      synchronization: "optimistic_reread" as const,
      ...(boundary === undefined ? {} : { boundary }),
    });
  }

  function runtimeMetricsOf(states: readonly RuntimeScopeState[], events: readonly { type: string }[], orgFreshness: RuntimeStructuralSnapshot["organizationBasisFreshness"]): RuntimeStructuralSnapshot {
    const byId = new Map(states.map((state) => [state.definition.scopeId, state]));
    let depth = 0;
    for (const state of states) {
      let cursor = state.definition.scopeId;
      let d = 0;
      const guard = new Set<string>();
      for (;;) {
        if (guard.has(cursor)) break;
        guard.add(cursor);
        const parent = byId.get(cursor)?.parent;
        if (parent === undefined || parent === null || !byId.has(parent.scopeId)) break;
        cursor = parent.scopeId;
        d += 1;
      }
      if (d > depth) depth = d;
    }
    const count = (type: string) => events.filter((event) => event.type === type).length;
    return Object.freeze({
      scopeCount: states.length,
      maxDepth: depth,
      activationMemberCount: states.reduce((sum, state) => sum + state.members.filter((m) => m.kind === "activation").length, 0),
      childScopeMemberCount: states.reduce((sum, state) => sum + state.members.filter((m) => m.kind === "child_scope").length, 0),
      memberAdditions: count("SCOPE_MEMBER_ADDED"),
      memberRemovals: count("SCOPE_MEMBER_REMOVED"),
      reconfigurationCount: count("SCOPE_MEMBER_ADDED") + count("SCOPE_MEMBER_REMOVED"),
      boundaryChangeCount: count("SCOPE_BOUNDARY_DECLARED"),
      peerChangeCount: count("SCOPE_PEER_ASSOCIATED"),
      campaignAssociationCount: states.reduce((sum, state) => sum + state.campaignIds.length, 0),
      externalBoundaryCount: states.filter((state) => state.boundary !== null).length,
      externalPeerCount: states.filter((state) => state.peer !== null).length,
      organizationBasisFreshness: orgFreshness,
    });
  }

  async function observe(subject: DynamicsSubject, policy: DynamicsPolicy): Promise<ObservationResult> {
    const parsedSubject = parseDynamicsSubject(JSON.parse(JSON.stringify(subject)));
    const parsedPolicy = parseDynamicsPolicy(JSON.parse(JSON.stringify(policy)));
    if (parsedSubject.kind === "organization" && deps.organizations === undefined) {
      return { status: "unknown_source", detail: "organization observation requires an organization source" };
    }
    if (parsedSubject.kind === "boundary_workspace" && deps.boundary === undefined) {
      return { status: "unknown_source", detail: "boundary workspace observation requires a boundary source" };
    }
    const before = basisDigestOf(await readBases(parsedSubject));
    const scopes = await scopeSet(parsedSubject);
    const states: RuntimeScopeState[] = [];
    const events: { type: string }[] = [];
    const observedBoundaryInteractionIds: string[] = [];
    let freshness: RuntimeStructuralSnapshot["organizationBasisFreshness"] = "unassociated";
    for (const ref of scopes) {
      const state = await service.scopeState(ref.scopeId);
      states.push(state);
      for (const event of await store.replay(ref.scopeId)) events.push({ type: event.type });
      if (state.boundary !== null && state.boundary.source.kind === "organization_interaction") observedBoundaryInteractionIds.push(state.boundary.source.interactionId);
      const view = await service.holonView(ref.scopeId);
      if (view.organizationBasisFreshness === "stale") freshness = "stale";
      else if (view.organizationBasisFreshness === "unknown" && freshness !== "stale") freshness = "unknown";
      else if (view.organizationBasisFreshness === "current" && freshness === "unassociated") freshness = "current";
    }
    let organization: OrganizationStructureMetrics | null = null;
    let declaredInteractionIds: string[] = [];
    let organizationKnowledge: DynamicsKnowledge["organization"] = "unassociated";
    if (parsedSubject.kind === "organization") {
      const definition = await deps.organizations!.get(parsedSubject.organization);
      if (definition === undefined) organizationKnowledge = "unknown";
      else {
        organizationKnowledge = "known";
        organization = Object.freeze({
          memberCount: definition.members.length,
          roleCount: definition.roles.length,
          interactionCount: definition.interactions.length,
          revisionCount: definition.revision + 1,
        });
        declaredInteractionIds = definition.interactions.map((interaction) => interaction.interactionId);
      }
    }
    let collaboration: CollaborationMetrics | null = null;
    let collaborationKnowledge: DynamicsKnowledge["collaboration"] = "unknown";
    if (deps.collaboration !== undefined) {
      const observed = await deps.collaboration.observe();
      collaborationKnowledge = "known";
      const runtimeActivationIds = new Set(states.flatMap((state) => state.members.filter((m) => m.kind === "activation").map((m) => (m.kind === "activation" ? m.activation.activationId : ""))));
      const cooccurrence = observed.participationActivationIds.filter((id) => runtimeActivationIds.has(id)).length;
      collaboration = Object.freeze({
        messageEventCount: observed.messageEventCount,
        distinctPeerCount: observed.distinctPeerIds.length,
        commitmentAcceptedEvents: observed.commitmentAcceptedEvents,
        handoffAcceptedEvents: observed.handoffAcceptedEvents,
        contactRequestEvents: observed.contactRequestEvents,
        participationRuntimeCooccurrence: cooccurrence,
      });
    }
    let campaignActivity: readonly CampaignActivityObservation[] | null = null;
    let campaignActivityKnowledge: DynamicsKnowledge["campaignActivity"] = "unknown";
    if (deps.campaignActivity !== undefined && parsedSubject.kind === "organization") {
      const campaignIds = [...new Set(states.flatMap((state) => state.campaignIds))].sort();
      const observations: CampaignActivityObservation[] = [];
      let activityState: "known" | "unknown" | "error" = "known";
      for (const campaignId of campaignIds) {
        const observation = await deps.campaignActivity.observe(campaignId);
        observations.push(observation);
        if (observation.state === "error") activityState = "error";
        else if (observation.state === "unknown" && activityState !== "error") activityState = "unknown";
      }
      campaignActivity = Object.freeze(observations);
      campaignActivityKnowledge = activityState;
    }
    const runtime = runtimeMetricsOf(states, events, freshness);
    let boundaryObservation: BoundaryObservation | null = null;
    let boundaryKnowledge: DynamicsKnowledge["boundary"];
    if (parsedSubject.kind === "boundary_workspace") {
      const observed = await deps.boundary!.observe(parsedSubject.workspace.workspaceId);
      if (observed === undefined) {
        boundaryKnowledge = "unknown";
      } else {
        boundaryKnowledge = "known";
        boundaryObservation = observed;
      }
    }
    const knowledge: DynamicsKnowledge = Object.freeze({
      runtime: "known",
      organization: organizationKnowledge,
      collaboration: collaborationKnowledge,
      campaignActivity: campaignActivityKnowledge,
      // Additive: omitted for every non-boundary subject.
      ...(boundaryKnowledge === undefined ? {} : { boundary: boundaryKnowledge }),
    });
    const after = basisDigestOf(await readBases(parsedSubject));
    if (after !== before) return { status: "observation_raced", detail: "a source basis changed during observation" };
    const fields = {
      subject: parsedSubject,
      basis: Object.freeze({ ...(await readBases(parsedSubject)) }),
      policy: parsedPolicy.ref,
      knowledge,
      runtime,
      organization,
      collaboration,
      declaredInteractionIds: Object.freeze([...declaredInteractionIds].sort()),
      observedBoundaryInteractionIds: Object.freeze([...new Set(observedBoundaryInteractionIds)].sort()),
      campaignActivity,
      // Additive: omitted unless a boundary observation exists.
      ...(boundaryObservation === null ? {} : { boundary: boundaryObservation }),
    };
    return { status: "observed", snapshot: Object.freeze({ ...fields, digest: snapshotDigestOf(fields) }) };
  }

  function diagnoseSnapshot(snapshot: OrganizationDynamicsSnapshot, policy: DynamicsPolicy): StructuralDiagnosis {
    const p: StructuralPressure[] = [];
    const known = snapshot.knowledge;
    const collaboration = snapshot.collaboration;

    p.push(
      snapshot.runtime.organizationBasisFreshness === "stale"
        ? { kind: "STALE_ORGANIZATION_GROUNDING", standing: "supported", evidence: ["at least one runtime scope records a stale organization basis"], counterEvidence: [], unknowns: [] }
        : snapshot.runtime.organizationBasisFreshness === "current"
          ? { kind: "STALE_ORGANIZATION_GROUNDING", standing: "unsupported", evidence: [], counterEvidence: ["all grounded scopes are current"], unknowns: [] }
          : { kind: "STALE_ORGANIZATION_GROUNDING", standing: "unresolved", evidence: [], counterEvidence: [], unknowns: ["organization basis/freshness not observable"] },
    );
    p.push({
      kind: "RUNTIME_RECONFIGURATION_CHURN",
      standing: snapshot.runtime.reconfigurationCount >= policy.churnMinReconfigurations ? "supported" : "unsupported",
      evidence: snapshot.runtime.reconfigurationCount >= policy.churnMinReconfigurations ? [`reconfiguration events = ${snapshot.runtime.reconfigurationCount} ≥ policy threshold`] : [],
      counterEvidence: snapshot.runtime.reconfigurationCount < policy.churnMinReconfigurations ? [`reconfiguration events = ${snapshot.runtime.reconfigurationCount} < policy threshold`] : [],
      unknowns: [],
    });
    p.push({ kind: "INTERACTION_CONCENTRATION", standing: "unresolved", evidence: [], counterEvidence: [], unknowns: ["peer-edge distribution is not observable (no edge-level coordination observation)"] });
    p.push({
      kind: "DECLARED_BUT_UNOBSERVED_INTERACTION",
      standing: known.organization !== "known" ? "unresolved" : snapshot.declaredInteractionIds.filter((id) => !snapshot.observedBoundaryInteractionIds.includes(id)).length > 0 ? "supported" : "unsupported",
      evidence: known.organization === "known" ? snapshot.declaredInteractionIds.filter((id) => !snapshot.observedBoundaryInteractionIds.includes(id)).map((id) => `declared interaction "${id}" has no runtime boundary source`) : [],
      counterEvidence: known.organization === "known" && snapshot.declaredInteractionIds.every((id) => snapshot.observedBoundaryInteractionIds.includes(id)) ? ["every declared interaction has a runtime boundary source"] : [],
      unknowns: known.organization === "known" ? [] : ["organization definition not observable"],
    });
    p.push({
      kind: "UNDECLARED_OBSERVED_INTERACTION",
      standing: known.organization !== "known" ? "unresolved" : snapshot.observedBoundaryInteractionIds.filter((id) => !snapshot.declaredInteractionIds.includes(id)).length > 0 ? "supported" : "unsupported",
      evidence: known.organization === "known" ? snapshot.observedBoundaryInteractionIds.filter((id) => !snapshot.declaredInteractionIds.includes(id)).map((id) => `observed boundary interaction "${id}" is not declared`) : [],
      counterEvidence: known.organization === "known" && snapshot.observedBoundaryInteractionIds.every((id) => snapshot.declaredInteractionIds.includes(id)) ? ["every observed boundary interaction is declared"] : [],
      unknowns: known.organization === "known" ? [] : ["organization definition not observable"],
    });
    p.push(
      collaboration === null
        ? { kind: "STABLE_FEDERATION", standing: "unresolved", evidence: [], counterEvidence: [], unknowns: ["collaboration observation unavailable"] }
        : collaboration.messageEventCount >= policy.federationMinMessageEvents &&
            collaboration.distinctPeerCount >= policy.federationMinDistinctPeers &&
            collaboration.distinctPeerCount >= 2
          ? { kind: "STABLE_FEDERATION", standing: "supported", evidence: [`message events = ${collaboration.messageEventCount} ≥ policy threshold`, `distinct peers = ${collaboration.distinctPeerCount} ≥ policy threshold`], counterEvidence: [], unknowns: [] }
          : { kind: "STABLE_FEDERATION", standing: "unsupported", evidence: [], counterEvidence: [`messageEvents=${collaboration.messageEventCount}, distinctPeers=${collaboration.distinctPeerCount} below policy threshold`], unknowns: [] },
    );
    p.push({ kind: "SHADOW_ORGANIZATION_CANDIDATE", standing: "unresolved", evidence: [], counterEvidence: [], unknowns: ["persistence requires multi-basis history (no single snapshot may claim it)"] });
    p.push(
      snapshot.subject.kind !== "organization"
        ? { kind: "ZOMBIE_ORGANIZATION_CANDIDATE", standing: "unresolved", evidence: [], counterEvidence: [], unknowns: ["subject is not an organization"] }
        : collaboration === null
          ? { kind: "ZOMBIE_ORGANIZATION_CANDIDATE", standing: "unresolved", evidence: [], counterEvidence: [], unknowns: ["collaboration observation unavailable"] }
          : snapshot.knowledge.campaignActivity !== "known" || snapshot.campaignActivity === null || snapshot.campaignActivity.length === 0
            ? { kind: "ZOMBIE_ORGANIZATION_CANDIDATE", standing: "unresolved", evidence: [], counterEvidence: [], unknowns: ["campaign activity is not observed for any associated campaign — dormant ≠ dead"] }
            : snapshot.runtime.scopeCount === 0 &&
                collaboration.messageEventCount === 0 &&
                collaboration.commitmentAcceptedEvents === 0 &&
                snapshot.campaignActivity.every((entry) => entry.exists && entry.semanticEventCount === 0 && entry.activeCommitmentCount === 0 && entry.activeWatchCount === 0 && entry.inFlightWake !== true)
              ? { kind: "ZOMBIE_ORGANIZATION_CANDIDATE", standing: "supported", evidence: [`all ${snapshot.campaignActivity.length} associated campaign(s) observed with zero activity and no runtime scope`], counterEvidence: [], unknowns: [] }
              : { kind: "ZOMBIE_ORGANIZATION_CANDIDATE", standing: "unsupported", evidence: [], counterEvidence: ["activity or runtime scope observed"], unknowns: [] },
    );
    p.push({ kind: "MERGE_PRESSURE", standing: "unresolved", evidence: [], counterEvidence: [], unknowns: ["requires multi-entity evidence (distinct peers/organizations/authority domains)"] });
    p.push({ kind: "SPLIT_PRESSURE", standing: "unresolved", evidence: [], counterEvidence: [], unknowns: ["requires interface-compressibility evidence not observable today"] });
    p.push({ kind: "ENCAPSULATION_CANDIDATE", standing: "unresolved", evidence: [], counterEvidence: [], unknowns: ["requires cross-boundary interaction set, not observable"] });

    // G10-L boundary-aware diagnostics. Mechanical counts only: never collaboration
    // quality, alignment, trust, correctness, or a "should formalize" claim.
    const boundary = snapshot.boundary ?? null;
    const unavailable = (kind: StructuralPressure["kind"]): StructuralPressure => ({ kind, standing: "unresolved", evidence: [], counterEvidence: [], unknowns: ["boundary observation unavailable or the workspace does not exist"] });
    p.push(
      boundary === null
        ? unavailable("BOUNDARY_REVISION_CHURN")
        : {
            kind: "BOUNDARY_REVISION_CHURN",
            standing: boundary.revisionChurn >= policy.churnMinReconfigurations ? "supported" : "unsupported",
            evidence: boundary.revisionChurn >= policy.churnMinReconfigurations ? [`accepted boundary revisions = ${boundary.revisionChurn} ≥ policy threshold`] : [],
            counterEvidence: boundary.revisionChurn < policy.churnMinReconfigurations ? [`accepted boundary revisions = ${boundary.revisionChurn} < policy threshold`] : [],
            unknowns: [],
          },
    );
    p.push(
      boundary === null
        ? unavailable("BOUNDARY_MEMBERSHIP_CHURN")
        : {
            kind: "BOUNDARY_MEMBERSHIP_CHURN",
            standing: boundary.membershipChurn >= policy.churnMinReconfigurations ? "supported" : "unsupported",
            evidence: boundary.membershipChurn >= policy.churnMinReconfigurations ? [`accepted membership revisions = ${boundary.membershipChurn} ≥ policy threshold`] : [],
            counterEvidence: boundary.membershipChurn < policy.churnMinReconfigurations ? [`accepted membership revisions = ${boundary.membershipChurn} < policy threshold`] : [],
            unknowns: [],
          },
    );
    p.push(
      boundary === null
        ? unavailable("BOUNDARY_NEGOTIATION_BACKLOG")
        : {
            kind: "BOUNDARY_NEGOTIATION_BACKLOG",
            standing: boundary.pendingCandidateCount >= 1 ? "supported" : "unsupported",
            evidence: boundary.pendingCandidateCount >= 1 ? [`${boundary.pendingCandidateCount} pending boundary candidate(s)`] : [],
            counterEvidence: boundary.pendingCandidateCount === 0 ? ["no pending boundary candidates"] : [],
            unknowns: [],
          },
    );
    p.push(
      boundary === null
        ? unavailable("BOUNDARY_STABLE_ACCEPTED_STATE")
        : {
            kind: "BOUNDARY_STABLE_ACCEPTED_STATE",
            // Stability of shared state is NOT correctness (§9/FB-A24).
            standing: boundary.acceptedArtifactCount >= 1 && boundary.pendingCandidateCount === 0 && boundary.lifecycle === "OPEN" ? "supported" : "unsupported",
            evidence: boundary.acceptedArtifactCount >= 1 && boundary.pendingCandidateCount === 0 && boundary.lifecycle === "OPEN" ? [`${boundary.acceptedArtifactCount} artifact(s) have an accepted revision and no pending candidate`] : [],
            counterEvidence: boundary.acceptedArtifactCount === 0 ? ["no accepted boundary artifact"] : boundary.pendingCandidateCount > 0 ? [`${boundary.pendingCandidateCount} pending candidate(s)`] : boundary.lifecycle === "CLOSED" ? ["the workspace is closed"] : [],
            unknowns: ["boundary stability does not establish semantic correctness"],
          },
    );
    p.push(
      boundary === null
        ? unavailable("BOUNDARY_BLUEPRINT_PRESENT")
        : {
            kind: "BOUNDARY_BLUEPRINT_PRESENT",
            standing: boundary.blueprintAccepted ? "supported" : "unsupported",
            evidence: boundary.blueprintAccepted ? ["an organization blueprint has an accepted revision"] : [],
            counterEvidence: boundary.blueprintAccepted ? [] : ["no accepted organization blueprint"],
            unknowns: ["a present blueprint does NOT by itself indicate that formalization is warranted"],
          },
    );

    const compressibility = Object.freeze({
      boundaryExists: snapshot.runtime.externalBoundaryCount > 0,
      boundaryStable: snapshot.runtime.boundaryChangeCount <= 1,
      internalReconfigurationHigh: snapshot.runtime.reconfigurationCount >= policy.churnMinReconfigurations,
      externalRepresentationStable: snapshot.runtime.peerChangeCount <= 1 && snapshot.runtime.boundaryChangeCount <= 1,
      semanticSufficiency: "requires_evidence" as const,
    });
    return Object.freeze({
      subject: snapshot.subject,
      snapshotDigest: snapshot.digest,
      policy: policy.ref,
      pressures: Object.freeze(p),
      interfaceCompressibility: compressibility,
      digest: canonicalDigest({ domain: "palimpsest.dynamics-diagnosis.v1", subject: snapshot.subject, snapshotDigest: snapshot.digest, policy: policy.ref, pressures: p, interfaceCompressibility: compressibility }),
    });
  }

  async function diagnose(subject: DynamicsSubject, policy: DynamicsPolicy) {
    const result = await observe(subject, policy);
    if (result.status !== "observed") return result;
    return { ...result, diagnosis: diagnoseSnapshot(result.snapshot, policy) };
  }

  async function persist(snapshots: readonly OrganizationDynamicsSnapshot[], policy: DynamicsPolicy): Promise<PersistenceReport> {
    const parsedPolicy = parseDynamicsPolicy(JSON.parse(JSON.stringify(policy)));
    const distinct = [...new Set(snapshots.map((snapshot) => snapshot.digest))];
    const kinds = new Set<string>();
    for (const snapshot of snapshots) for (const pressure of diagnoseSnapshot(snapshot, parsedPolicy).pressures) kinds.add(pressure.kind);
    const entries: PersistenceEntry[] = [];
    for (const kind of kinds) {
      const supporting = snapshots.filter((snapshot) => diagnoseSnapshot(snapshot, parsedPolicy).pressures.some((pressure) => pressure.kind === kind && pressure.standing === "supported"));
      const distinctBases = new Set(supporting.map((snapshot) => snapshot.digest)).size;
      const standing: PersistenceEntry["standing"] =
        parsedPolicy.minDistinctBases > 0 && distinctBases >= parsedPolicy.minDistinctBases
          ? "persistent"
          : supporting.length > 0
            ? "candidate"
            : distinct.length < parsedPolicy.minDistinctBases
              ? "insufficient_history"
              : "not_supported";
      entries.push(Object.freeze({ kind: kind as PersistenceEntry["kind"], standing, distinctBases, supportingSnapshotDigests: Object.freeze([...new Set(supporting.map((s) => s.digest))].sort()) }));
    }
    return Object.freeze({ policy: parsedPolicy.ref, entries: Object.freeze(entries.sort((a, b) => (a.kind < b.kind ? -1 : 1))) });
  }

  function deterministicKind(diagnosis: StructuralDiagnosis): { kind: DynamicsProposalKind; targets: readonly string[]; intent: string } {
    const standing = (kind: StructuralDiagnosis["pressures"][number]["kind"]) => diagnosis.pressures.find((pressure) => pressure.kind === kind)?.standing ?? "unresolved";
    if (standing("STALE_ORGANIZATION_GROUNDING") === "supported") return { kind: "REVISE_ORGANIZATION", targets: diagnosis.subject.kind === "organization" ? [diagnosis.subject.organization.organizationDefinitionId] : diagnosis.subject.kind === "runtime_scope" ? [diagnosis.subject.scope.scopeId] : [diagnosis.subject.workspace.workspaceId], intent: "rebind runtime scopes to a current organization revision" };
    if (standing("SPLIT_PRESSURE") === "supported") return { kind: "SPLIT_ORGANIZATION", targets: [], intent: "split under interface-compressibility evidence" };
    if (standing("MERGE_PRESSURE") === "supported") return { kind: "MERGE_ORGANIZATIONS", targets: [], intent: "merge under independence-loss analysis" };
    if (standing("STABLE_FEDERATION") === "supported") return { kind: "RETAIN_FEDERATION", targets: [], intent: "retain federation as a stable form" };
    return { kind: "NO_CHANGE", targets: [], intent: "no structural change indicated by observable evidence" };
  }

  async function propose(input: { readonly subject: DynamicsSubject; readonly policy: DynamicsPolicy; readonly advisor?: OrganizationDynamicsAdvisorPort | undefined }) {
    const observed = await observe(input.subject, input.policy);
    if (observed.status !== "observed") return observed;
    const snapshot = observed.snapshot;
    const diagnosis = diagnoseSnapshot(snapshot, input.policy);
    let fields: { kind: DynamicsProposalKind; targets: readonly string[]; intent: string; advisorProvenance: string | null };
    if (input.advisor !== undefined) {
      const raw = await input.advisor.propose({ subject: snapshot.subject, snapshotDigest: snapshot.digest, diagnosisDigest: diagnosis.digest, pressures: diagnosis.pressures });
      const parsed = parseAdvisorProposal(raw);
      fields = { kind: parsed.kind, targets: parsed.targets, intent: parsed.intent, advisorProvenance: parsed.advisorProvenance };
    } else {
      const chosen = deterministicKind(diagnosis);
      fields = { ...chosen, advisorProvenance: null };
    }
    const base = {
      subject: snapshot.subject,
      snapshotDigest: snapshot.digest,
      diagnosisDigest: diagnosis.digest,
      kind: fields.kind,
      targets: Object.freeze([...fields.targets].sort()),
      intent: fields.intent,
      policy: input.policy.ref,
      advisorProvenance: fields.advisorProvenance,
      mapsToExistingTransformation: MAPPING[fields.kind],
      basisDigest: basisDigestOf(snapshot.basis),
    };
    return { snapshot, diagnosis, proposal: Object.freeze({ ...base, digest: proposalDigestOf(base) }) };
  }

  async function evaluateProposal(proposal: OrganizationDynamicsProposal) {
    const current = basisDigestOf(await readBases(proposal.subject));
    return current === proposal.basisDigest ? { status: "fresh" as const } : { status: "stale" as const, detail: "a load-bearing source basis changed after the proposal was grounded" };
  }

  function proposalImpact(proposal: OrganizationDynamicsProposal, snapshot: OrganizationDynamicsSnapshot): ProposalImpactReport {
    const affectedScopes = snapshot.basis.runtimeScopes.map((entry) => entry.scope.scopeId).sort();
    const collaboration = snapshot.collaboration;
    return Object.freeze({
      proposalDigest: proposal.digest,
      affectedScopes: Object.freeze(affectedScopes),
      affectedBoundaries: Object.freeze(snapshot.declaredInteractionIds.length === 0 && snapshot.observedBoundaryInteractionIds.length === 0 ? [] : [...new Set([...snapshot.declaredInteractionIds, ...snapshot.observedBoundaryInteractionIds])].sort()),
      affectedPeers: Object.freeze([]),
      independenceLoss: Object.freeze({
        distinctPeers: collaboration === null ? "unknown" : collaboration.distinctPeerCount,
        distinctOrganizations: proposal.subject.kind === "organization" ? 1 : 0,
        distinctAuthorityDomains: "unknown",
        distinctCommitments: collaboration === null ? "unknown" : collaboration.commitmentAcceptedEvents,
        distinctEvidenceSources: "unknown",
        distinctFailureDomains: "unknown",
        distinctWorkspaces: "unknown",
      }),
      mapsToExistingTransformation: proposal.mapsToExistingTransformation,
    });
  }

  return { observe, diagnose, persist, propose, evaluateProposal, proposalImpact };
}

export { OrganizationDynamicsError };
export { subjectKey };
