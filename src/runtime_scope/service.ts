/**
 * G10-H RuntimeScope service — membership, single-parent nesting, organization
 * association/freshness, lifecycle, and the derived Holon view.
 *
 *   RuntimeScope lifecycle ≠ Campaign lifecycle
 *   Organization membership ≠ runtime membership
 *   runtime membership ≠ Participation
 *   Holon = derived view, never a new canonical identity
 *   internal reconfiguration ≠ external identity change
 */

import { canonicalDigest } from "../schema/canonical.js";
import type { PeerRef } from "../federation/peer.js";
import { parsePeerRef } from "../federation/peer.js";
import type {
  OrganizationBasisRef,
  RuntimeScopeBasis,
  RuntimeScopeBoundary,
  RuntimeScopeDefinition,
  RuntimeScopeLifecycle,
  RuntimeScopeMember,
} from "./artifacts.js";
import {
  holonProjectionDigest,
  materializeRuntimeScopeDefinition,
  parseRuntimeScopeBoundary,
  parseRuntimeScopeMember,
  runtimeScopeMemberKey,
} from "./artifacts.js";
import type { RuntimeScopeRef } from "./ref.js";
import { materializeRuntimeScopeRef, runtimeScopeRefsEqual } from "./ref.js";
import type { RuntimeScopeAppendRequest, RuntimeScopeEvent, RuntimeScopeStore } from "./store.js";
import { RuntimeScopeStoreError } from "./store.js";

/** Read-only organization boundary: current head + exact revision + declared interactions. */
export interface RuntimeScopeOrganizationPort {
  current(organizationDefinitionId: string): Promise<OrganizationBasisRef | undefined>;
  exists(ref: OrganizationBasisRef): Promise<boolean>;
  /** The exact revision artifact, for boundary-source verification (CF-H-03). */
  definition(ref: OrganizationBasisRef): Promise<{ readonly interactions: readonly { readonly interactionId: string }[] } | undefined>;
  /** G10-M: a RETIRED organization lineage may not ground a NEW runtime scope. */
  lifecycle?(organizationDefinitionId: string): Promise<"ACTIVE" | "RETIRED" | undefined>;
}

/**
 * G10-I CF-H-06: the minimal external-representation authority seam. A trusted assembly
 * supplies a deterministic admission decision; it answers ONLY "is this external
 * representation mutation admitted?" — never "what should the organization do?". Without
 * wiring, external-representation mutation fails closed; read-only Holon observation
 * remains available.
 */
export type RuntimeScopeRepresentationMutation =
  | { readonly kind: "associate_peer"; readonly peer: PeerRef }
  | { readonly kind: "declare_boundary"; readonly boundary: RuntimeScopeBoundary };

export interface RuntimeScopeRepresentationAdmissionPort {
  admit(input: { readonly scopeId: string; readonly mutation: RuntimeScopeRepresentationMutation }): Promise<
    { readonly admitted: true } | { readonly admitted: false; readonly detail: string }
  >;
}

/** Read-only campaign existence check for lifecycle-neutral association (CF-H-08). */
export interface RuntimeScopeCampaignPort {
  exists(campaignId: string): Promise<boolean>;
}

export interface RuntimeScopeServiceDeps {
  readonly store: RuntimeScopeStore;
  readonly organizations?: RuntimeScopeOrganizationPort | undefined;
  readonly representationAdmission?: RuntimeScopeRepresentationAdmissionPort | undefined;
  readonly campaigns?: RuntimeScopeCampaignPort | undefined;
}

export type OrganizationBasisFreshness = "unassociated" | "current" | "stale" | "unknown";

/** Internal projection — NOT the external Holon contract. */
export interface RuntimeScopeState {
  readonly definition: RuntimeScopeDefinition;
  readonly lifecycle: RuntimeScopeLifecycle;
  readonly members: readonly RuntimeScopeMember[];
  readonly parent: RuntimeScopeRef | null;
  readonly children: readonly RuntimeScopeRef[];
  readonly peer: PeerRef | null;
  readonly boundary: RuntimeScopeBoundary | null;
  /** Lifecycle-neutral Campaign associations (CF-H-08). */
  readonly campaignIds: readonly string[];
  readonly basis: RuntimeScopeBasis;
}

/** External view: internal constituents are never part of the contract. */
export interface HolonView {
  readonly scope: RuntimeScopeRef;
  readonly lifecycle: RuntimeScopeLifecycle;
  readonly peer: PeerRef | null;
  readonly boundary: RuntimeScopeBoundary | null;
  readonly organizationBasis: OrganizationBasisRef | null;
  readonly organizationBasisFreshness: OrganizationBasisFreshness;
  readonly digest: string;
}

export interface RuntimeScopeService {
  openScope(input: { readonly scopeId: string; readonly organizationBasis?: OrganizationBasisRef | null | undefined }): Promise<RuntimeScopeDefinition>;
  addMember(input: { readonly scopeId: string; readonly member: RuntimeScopeMember }): Promise<void>;
  removeMember(input: { readonly scopeId: string; readonly memberKey: string; readonly reason: string }): Promise<void>;
  associatePeer(input: { readonly scopeId: string; readonly peer: PeerRef }): Promise<void>;
  declareBoundary(input: { readonly scopeId: string; readonly boundary: RuntimeScopeBoundary }): Promise<void>;
  declareBoundary(input: { readonly scopeId: string; readonly boundary: RuntimeScopeBoundary }): Promise<void>;
  /** CF-H-08: explicit, lifecycle-neutral Campaign association (verified). */
  associateCampaign(input: { readonly scopeId: string; readonly campaignId: string }): Promise<void>;
  disassociateCampaign(input: { readonly scopeId: string; readonly campaignId: string; readonly reason: string }): Promise<void>;
  closeScope(input: { readonly scopeId: string; readonly reason: string }): Promise<void>;
  listScopes(): Promise<readonly RuntimeScopeRef[]>;
  scopeState(scopeId: string): Promise<RuntimeScopeState>;
  holonView(scopeId: string): Promise<HolonView>;
  members(scopeId: string): Promise<readonly RuntimeScopeMember[]>;
}

interface LocalProjection {
  readonly definition: RuntimeScopeDefinition;
  readonly events: readonly RuntimeScopeEvent[];
  readonly lifecycle: RuntimeScopeLifecycle;
  readonly members: Map<string, RuntimeScopeMember>;
  readonly peer: PeerRef | null;
  readonly boundary: RuntimeScopeBoundary | null;
  readonly campaigns: Set<string>;
}

interface ScopeIndex {
  readonly local: Map<string, LocalProjection>;
  readonly parentOf: Map<string, RuntimeScopeRef>;
}

function eventRequest(type: RuntimeScopeAppendRequest["type"], scopeId: string, payload: unknown): RuntimeScopeAppendRequest {
  return {
    eventId: `evt-${canonicalDigest({ domain: "palimpsest.runtime-scope-event.v1", type, scopeId, payload }).slice(0, 24)}`,
    type,
    payload,
  };
}

export function makeRuntimeScopeService(deps: RuntimeScopeServiceDeps): RuntimeScopeService {
  function projectLocal(definition: RuntimeScopeDefinition, events: readonly RuntimeScopeEvent[]): LocalProjection {
    const members = new Map<string, RuntimeScopeMember>();
    const campaigns = new Set<string>();
    let peer: PeerRef | null = null;
    let boundary: RuntimeScopeBoundary | null = null;
    let lifecycle: RuntimeScopeLifecycle = "OPEN";
    for (const event of events) {
      switch (event.type) {
        case "SCOPE_MEMBER_ADDED":
          members.set(runtimeScopeMemberKey((event.payload as { member: RuntimeScopeMember }).member), (event.payload as { member: RuntimeScopeMember }).member);
          break;
        case "SCOPE_MEMBER_REMOVED":
          members.delete((event.payload as { memberKey: string }).memberKey);
          break;
        case "SCOPE_PEER_ASSOCIATED":
          peer = (event.payload as { peer: PeerRef }).peer;
          break;
        case "SCOPE_BOUNDARY_DECLARED":
          boundary = (event.payload as { boundary: RuntimeScopeBoundary }).boundary;
          break;
        case "CAMPAIGN_ASSOCIATED":
          campaigns.add((event.payload as { campaignId: string }).campaignId);
          break;
        case "CAMPAIGN_DISASSOCIATED":
          campaigns.delete((event.payload as { campaignId: string }).campaignId);
          break;
        case "SCOPE_CLOSED":
          lifecycle = "CLOSED";
          break;
        default:
          break;
      }
    }
    return Object.freeze({ definition, events, lifecycle, members, peer, boundary, campaigns });
  }

  async function buildIndex(): Promise<ScopeIndex> {
    const definitions = await deps.store.scopes();
    const local = new Map<string, LocalProjection>();
    for (const definition of definitions) {
      local.set(definition.scopeId, projectLocal(definition, await deps.store.replay(definition.scopeId)));
    }
    const parentOf = new Map<string, RuntimeScopeRef>();
    for (const [scopeId, projection] of local) {
      for (const member of projection.members.values()) {
        if (member.kind !== "child_scope") continue;
        const childId = member.scope.scopeId;
        if (childId === scopeId) {
          throw new RuntimeScopeStoreError("cycle_detected", `scope "${scopeId}" is its own child`);
        }
        if (parentOf.has(childId)) {
          throw new RuntimeScopeStoreError("multiple_parents", `scope "${childId}" is a child of more than one parent`);
        }
        parentOf.set(childId, materializeRuntimeScopeRef({ scopeId }));
      }
    }
    return { local, parentOf };
  }

  function requireScope(index: ScopeIndex, scopeId: string): LocalProjection {
    const projection = index.local.get(scopeId);
    if (projection === undefined) throw new RuntimeScopeStoreError("unknown_scope", `runtime scope "${scopeId}" does not exist`);
    return projection;
  }

  function childrenOf(index: ScopeIndex, scopeId: string): readonly RuntimeScopeRef[] {
    const projection = requireScope(index, scopeId);
    return Object.freeze(
      [...projection.members.values()]
        .filter((member): member is Extract<RuntimeScopeMember, { kind: "child_scope" }> => member.kind === "child_scope")
        .map((member) => member.scope)
        .sort((a, b) => (a.scopeId < b.scopeId ? -1 : 1)),
    );
  }

  async function append(scopeId: string, events: readonly RuntimeScopeAppendRequest[]): Promise<void> {
    const basis = await deps.store.basis(scopeId);
    if (basis === undefined) throw new RuntimeScopeStoreError("unknown_scope", `runtime scope "${scopeId}" does not exist`);
    await deps.store.appendAtomic({ scopeId, expectedBasis: basis, events });
  }

  async function openScope(input: { readonly scopeId: string; readonly organizationBasis?: OrganizationBasisRef | null | undefined }): Promise<RuntimeScopeDefinition> {
    const organizationBasis = input.organizationBasis ?? null;
    if (organizationBasis !== null) {
      // Explicit association only; never auto-created from an organization.
      if (deps.organizations === undefined) {
        throw new RuntimeScopeStoreError("organization_unknown", "an organization basis was supplied but no organization source is configured");
      }
      if (deps.organizations.lifecycle !== undefined && (await deps.organizations.lifecycle(organizationBasis.organizationDefinitionId)) === "RETIRED") {
        throw new RuntimeScopeStoreError("organization_retired", `organization "${organizationBasis.organizationDefinitionId}" is RETIRED — it cannot ground a new runtime scope`);
      }
      if (!(await deps.organizations.exists(organizationBasis))) {
        throw new RuntimeScopeStoreError("organization_unknown", `organization revision "${organizationBasis.organizationDefinitionId}@${organizationBasis.revision}" does not exist`);
      }
    }
    const definition = materializeRuntimeScopeDefinition({ scopeId: input.scopeId, organizationBasis });
    await deps.store.open({ definition });
    return definition;
  }

  function assertOpen(projection: LocalProjection, what: string): void {
    if (projection.lifecycle === "CLOSED") throw new RuntimeScopeStoreError("scope_closed", `cannot ${what}: scope "${projection.definition.scopeId}" is CLOSED`);
  }

  async function addMember(input: { readonly scopeId: string; readonly member: RuntimeScopeMember }): Promise<void> {
    const member = parseRuntimeScopeMember(JSON.parse(JSON.stringify(input.member)));
    const index = await buildIndex();
    const scope = requireScope(index, input.scopeId);
    assertOpen(scope, "add a member");
    const key = runtimeScopeMemberKey(member);
    if (scope.members.has(key)) throw new RuntimeScopeStoreError("member_conflict", `member "${key}" is already present in scope "${input.scopeId}"`);
    if (member.kind === "child_scope") {
      const childId = member.scope.scopeId;
      if (childId === input.scopeId) throw new RuntimeScopeStoreError("cycle_detected", "a scope cannot be its own child");
      const child = requireScope(index, childId);
      assertOpen(child, "receive a child scope");
      if (index.parentOf.has(childId)) throw new RuntimeScopeStoreError("multiple_parents", `scope "${childId}" already has a parent`);
      // Ancestor walk: adding childId under this scope must not create a cycle.
      const ancestors = new Set<string>([input.scopeId]);
      let cursor: RuntimeScopeRef | undefined = index.parentOf.get(input.scopeId);
      while (cursor !== undefined) {
        if (ancestors.has(cursor.scopeId)) break;
        ancestors.add(cursor.scopeId);
        cursor = index.parentOf.get(cursor.scopeId);
      }
      if (ancestors.has(childId)) throw new RuntimeScopeStoreError("cycle_detected", `adding child "${childId}" to "${input.scopeId}" would create a cycle`);
    }
    await append(input.scopeId, [eventRequest("SCOPE_MEMBER_ADDED", input.scopeId, { member })]);
  }

  async function removeMember(input: { readonly scopeId: string; readonly memberKey: string; readonly reason: string }): Promise<void> {
    const reason = input.reason;
    if (typeof reason !== "string" || reason.trim() === "") throw new RuntimeScopeStoreError("invalid_registration", "reason must be a non-empty string");
    const index = await buildIndex();
    const scope = requireScope(index, input.scopeId);
    assertOpen(scope, "remove a member");
    if (!scope.members.has(input.memberKey)) throw new RuntimeScopeStoreError("member_unknown", `member "${input.memberKey}" is not present in scope "${input.scopeId}"`);
    await append(input.scopeId, [eventRequest("SCOPE_MEMBER_REMOVED", input.scopeId, { memberKey: input.memberKey, reason })]);
  }

  /** CF-H-06: no external-representation mutation without an admitted decision. */
  async function requireRepresentationAdmission(scopeId: string, mutation: RuntimeScopeRepresentationMutation): Promise<void> {
    if (deps.representationAdmission === undefined) {
      throw new RuntimeScopeStoreError("representation_not_admitted", "no representation admission port is configured — external representation mutation fails closed");
    }
    const decision = await deps.representationAdmission.admit({ scopeId, mutation });
    if (decision.admitted !== true) {
      throw new RuntimeScopeStoreError("representation_not_admitted", `external representation mutation was not admitted: ${decision.detail}`);
    }
  }

  async function associatePeer(input: { readonly scopeId: string; readonly peer: PeerRef }): Promise<void> {
    const peer = parsePeerRef(JSON.parse(JSON.stringify(input.peer)));
    const index = await buildIndex();
    const scope = requireScope(index, input.scopeId);
    assertOpen(scope, "associate a peer");
    // Admission is checked BEFORE any write; a denied mutation writes zero events.
    await requireRepresentationAdmission(input.scopeId, { kind: "associate_peer", peer });
    await append(input.scopeId, [eventRequest("SCOPE_PEER_ASSOCIATED", input.scopeId, { peer })]);
  }

  async function declareBoundary(input: { readonly scopeId: string; readonly boundary: RuntimeScopeBoundary }): Promise<void> {
    const boundary = parseRuntimeScopeBoundary(JSON.parse(JSON.stringify(input.boundary)));
    const index = await buildIndex();
    const scope = requireScope(index, input.scopeId);
    assertOpen(scope, "declare a boundary");
    // CF-H-03: an organization_interaction source must be declared by the exact
    // organization revision the scope is grounded to — verifiable, not a bare string.
    const source = boundary.source;
    if (source.kind === "organization_interaction") {
      const interactionId = source.interactionId;
      const basis = scope.definition.organizationBasis;
      if (basis === null) {
        throw new RuntimeScopeStoreError("boundary_source_unverified", "an organization_interaction boundary source requires an organization basis");
      }
      if (deps.organizations === undefined) {
        throw new RuntimeScopeStoreError("boundary_source_unverified", "cannot verify an organization_interaction boundary source without an organization source");
      }
      const definition = await deps.organizations.definition(basis);
      if (definition === undefined) {
        throw new RuntimeScopeStoreError("boundary_source_unverified", `organization revision "${basis.organizationDefinitionId}@${basis.revision}" is unavailable`);
      }
      if (!definition.interactions.some((interaction) => interaction.interactionId === interactionId)) {
        throw new RuntimeScopeStoreError("boundary_source_unverified", `organization revision does not declare interaction "${interactionId}"`);
      }
    }
    await requireRepresentationAdmission(input.scopeId, { kind: "declare_boundary", boundary });
    await append(input.scopeId, [eventRequest("SCOPE_BOUNDARY_DECLARED", input.scopeId, { boundary })]);
  }

  async function associateCampaign(input: { readonly scopeId: string; readonly campaignId: string }): Promise<void> {
    const index = await buildIndex();
    const scope = requireScope(index, input.scopeId);
    assertOpen(scope, "associate a campaign");
    if (deps.campaigns === undefined) {
      throw new RuntimeScopeStoreError("campaign_unknown", "no campaign source is configured — campaign association cannot be verified");
    }
    if (!(await deps.campaigns.exists(input.campaignId))) {
      throw new RuntimeScopeStoreError("campaign_unknown", `campaign "${input.campaignId}" does not exist`);
    }
    if (scope.campaigns.has(input.campaignId)) {
      throw new RuntimeScopeStoreError("event_conflict", `campaign "${input.campaignId}" is already associated`);
    }
    await append(input.scopeId, [eventRequest("CAMPAIGN_ASSOCIATED", input.scopeId, { campaignId: input.campaignId })]);
  }

  async function disassociateCampaign(input: { readonly scopeId: string; readonly campaignId: string; readonly reason: string }): Promise<void> {
    if (typeof input.reason !== "string" || input.reason.trim() === "") throw new RuntimeScopeStoreError("invalid_registration", "reason must be a non-empty string");
    const index = await buildIndex();
    const scope = requireScope(index, input.scopeId);
    if (!scope.campaigns.has(input.campaignId)) {
      throw new RuntimeScopeStoreError("member_unknown", `campaign "${input.campaignId}" is not associated`);
    }
    await append(input.scopeId, [eventRequest("CAMPAIGN_DISASSOCIATED", input.scopeId, { campaignId: input.campaignId, reason: input.reason })]);
  }

  async function closeScope(input: { readonly scopeId: string; readonly reason: string }): Promise<void> {
    if (typeof input.reason !== "string" || input.reason.trim() === "") throw new RuntimeScopeStoreError("invalid_registration", "reason must be a non-empty string");
    const index = await buildIndex();
    const scope = requireScope(index, input.scopeId);
    assertOpen(scope, "close");
    await append(input.scopeId, [eventRequest("SCOPE_CLOSED", input.scopeId, { reason: input.reason })]);
  }

  async function listScopes(): Promise<readonly RuntimeScopeRef[]> {
    const definitions = await deps.store.scopes();
    return Object.freeze(definitions.map((definition) => materializeRuntimeScopeRef({ scopeId: definition.scopeId })));
  }

  async function scopeState(scopeId: string): Promise<RuntimeScopeState> {
    const index = await buildIndex();
    const scope = requireScope(index, scopeId);
    const basis = await deps.store.basis(scopeId);
    if (basis === undefined) throw new RuntimeScopeStoreError("unknown_scope", `runtime scope "${scopeId}" does not exist`);
    return Object.freeze({
      definition: scope.definition,
      lifecycle: scope.lifecycle,
      members: Object.freeze([...scope.members.values()].sort((a, b) => (runtimeScopeMemberKey(a) < runtimeScopeMemberKey(b) ? -1 : 1))),
      parent: index.parentOf.get(scopeId) ?? null,
      children: childrenOf(index, scopeId),
      peer: scope.peer,
      boundary: scope.boundary,
      campaignIds: Object.freeze([...scope.campaigns].sort()),
      basis,
    });
  }

  async function organizationBasisFreshness(basis: OrganizationBasisRef | null): Promise<OrganizationBasisFreshness> {
    if (basis === null) return "unassociated";
    if (deps.organizations === undefined) return "unknown";
    const current = await deps.organizations.current(basis.organizationDefinitionId);
    if (current === undefined) return "unknown";
    return current.revision === basis.revision && current.digest === basis.digest ? "current" : "stale";
  }

  async function holonView(scopeId: string): Promise<HolonView> {
    const index = await buildIndex();
    const scope = requireScope(index, scopeId);
    const scopeRef = materializeRuntimeScopeRef({ scopeId });
    const organizationBasis = scope.definition.organizationBasis;
    const freshness = await organizationBasisFreshness(organizationBasis);
    return Object.freeze({
      scope: scopeRef,
      lifecycle: scope.lifecycle,
      peer: scope.peer,
      boundary: scope.boundary,
      organizationBasis,
      organizationBasisFreshness: freshness,
      digest: holonProjectionDigest({ scope: scopeRef, lifecycle: scope.lifecycle, peer: scope.peer, boundary: scope.boundary, organizationBasis }),
    });
  }

  async function members(scopeId: string): Promise<readonly RuntimeScopeMember[]> {
    const index = await buildIndex();
    const scope = requireScope(index, scopeId);
    return Object.freeze([...scope.members.values()]);
  }

  return {
    openScope,
    addMember,
    removeMember,
    associatePeer,
    declareBoundary,
    associateCampaign,
    disassociateCampaign,
    closeScope,
    listScopes,
    scopeState,
    holonView,
    members,
  };
}

/** True when two refs denote the same scope (never inferred from string equality elsewhere). */
export function sameRuntimeScope(a: RuntimeScopeRef, b: RuntimeScopeRef): boolean {
  return runtimeScopeRefsEqual(a, b);
}
