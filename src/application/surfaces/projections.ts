/**
 * SR-1D R2 §7/§8/§9 — the projections application-surface cluster.
 *
 * Owns BOTH the façade interfaces (ProjectionsApplicationSurface, BoundaryWorkspaceReadPort) and the constructor that
 * implements them, from a NARROW input: this module can only see the 6 dependencies it
 * actually reads (boundaryWorkspaces, controller, federation, organizations, reasoning, runtimeScopes). Behaviour is unchanged.
 */

import { requireLocal } from "../common.js";
import type { RuntimeScopeService, RuntimeScopeStore } from "../../runtime_scope/index.js";
import type { FederationService } from "../../federation/index.js";
import type { OrganizationStore } from "../../organization/index.js";
import type { ReasoningCellService } from "../../reasoning_cell/index.js";
import type { PeerRef } from "../../federation/peer.js";
import type { ProjectController } from "../../tools/controller.js";
import type { ProjectionEnvelope } from ".././projection_types.js";
import { collaborationProjection, organizationProjection, reasoningProjection, runtimeProjection, workProjection } from ".././projections.js";

/** Exactly the dependencies this cluster reads — nothing else is visible to it (§9). */
export interface ProjectionsSurfaceDeps {
  readonly localPeer?: PeerRef | undefined;
  readonly boundaryWorkspaces?: BoundaryWorkspaceReadPort | undefined;
  readonly controller: ProjectController;
  readonly federation?: FederationService | undefined;
  readonly organizations?: OrganizationStore | undefined;
  readonly reasoning?: ReasoningCellService | undefined;
  readonly runtimeScopes?: { readonly store: RuntimeScopeStore; readonly service: RuntimeScopeService } | undefined;
}

export interface ProjectionsApplicationSurface {
  work(): Promise<ProjectionEnvelope>;
  organization(input: { readonly organizationDefinitionId: string }): Promise<ProjectionEnvelope>;
  collaboration(): Promise<ProjectionEnvelope>;
  runtime(): Promise<ProjectionEnvelope>;
  reasoning(input: { readonly cellId: string }): Promise<ProjectionEnvelope>;
}

/** Read-only boundary workspace enumeration for the collaboration projection. */
export interface BoundaryWorkspaceReadPort {
  list(): Promise<readonly { readonly workspaceId: string; readonly participants: readonly PeerRef[]; readonly acceptedArtifacts: number }[]>;
}

export function makeProjectionsSurfaces(deps: ProjectionsSurfaceDeps): { readonly projections: ProjectionsApplicationSurface } {
    const projections: ProjectionsApplicationSurface = {    work: async () => {
        try {
          return workProjection(deps.controller.orchestrationGraph(), deps.controller.viewCursor());
        } catch {
          // A source error is an ERROR projection, never an empty known graph.
          return workProjection(null, null);
        }
      },
      organization: async (input) => {
        if (deps.organizations === undefined) throw new Error("organization surface is not configured");
        const definition = await deps.organizations.current(input.organizationDefinitionId);
        const lifecycle = await deps.organizations.lifecycle(input.organizationDefinitionId);
        return organizationProjection({ organizationDefinitionId: input.organizationDefinitionId, definition: definition ?? null, lifecycle: lifecycle ?? null });
      },
      collaboration: async () => {
        const localPeerId = requireLocal(deps).peerId;
        const peers = new Set<string>();
        if (deps.federation !== undefined) {
          const inbox = (await deps.federation.inbox(requireLocal(deps))) as { received?: readonly { from?: { peerId?: string }; to?: { peerId?: string } }[] };
          for (const message of inbox.received ?? []) {
            if (message.from?.peerId !== undefined) peers.add(message.from.peerId);
            if (message.to?.peerId !== undefined) peers.add(message.to.peerId);
          }
        }
        const workspaces = deps.boundaryWorkspaces === undefined ? [] : (await deps.boundaryWorkspaces.list()).map((workspace) => ({ workspaceId: workspace.workspaceId, participants: workspace.participants.map((peer) => peer.peerId), acceptedArtifacts: workspace.acceptedArtifacts }));
        // CF-O-01 CLOSED: the commitment nodes/edges come from the read-only enumeration.
        const commitments = deps.federation === undefined ? [] : (await deps.federation.commitments()).map((commitment) => ({ commitmentId: commitment.commitmentId, holderId: commitment.holder.peerId, state: commitment.state }));
        return collaborationProjection({ localPeerId, peers: [...peers], commitments, workspaces });
      },
      runtime: async () => {
        if (deps.runtimeScopes === undefined) throw new Error("runtime surface is not configured");
        return runtimeProjection({ list: () => deps.runtimeScopes!.service.listScopes(), state: (scopeId) => deps.runtimeScopes!.service.scopeState(scopeId) });
      },
      reasoning: async (input) => {
        if (deps.reasoning === undefined) throw new Error("reasoning surface is not configured");
        const view = await deps.reasoning.cellView({ cellId: input.cellId });
        const graph = await deps.reasoning.claimGraph({ cellId: input.cellId });
        return reasoningProjection({
          cellId: input.cellId,
          frontierRevision: view.frontierBasis.frontierRevision,
          frontierDigest: view.frontierBasis.frontierDigest,
          nodes: graph.nodes.map((node) => ({ ref: { claimId: node.ref.claimId }, claim: { type: { typeId: node.claim.type.typeId }, content: node.claim.content, dependencies: node.claim.dependencies.map((dependency) => ({ claimId: dependency.claimId })) }, active: node.active })),
          // The view carries each candidate's claim; the projection decides what to label it with.
          candidates: view.candidates.map((candidate) => ({ candidateDigest: candidate.candidateDigest, branchId: candidate.branchId, status: candidate.status, claim: { content: candidate.claim.content } })),
          branches: view.branches.map((branch) => ({ ref: { branchId: branch.ref.branchId }, question: branch.question, closed: branch.closed })),
        });
      },
    };


  return { projections };
}
