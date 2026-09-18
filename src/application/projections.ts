/**
 * G10-O MultiGraph projections — DERIVED, read-only, typed per species.
 *
 *   GraphProjection ≠ CanonicalGraph     presentation id ≠ canonical identity
 *   Missing source ≠ empty known state   unknown ≠ empty   stale ≠ current
 *
 * Each projection is an envelope with a read-model digest, per-source bases, an honest
 * knowledge state, and typed nodes/edges that carry canonical refs. No mutation path and
 * no universal node ontology (`payload: any`) exists here.
 */

import { canonicalDigest } from "../schema/canonical.js";
import type { OrchestrationGraph } from "../tools/graph.js";
import type { GraphSpecies, ProjectionEnvelope, ProjectionNode, ProjectionEdge, ProjectionSourceBasis } from "./projection_types.js";

export type { GraphSpecies, ProjectionEnvelope, ProjectionNode, ProjectionEdge, ProjectionSourceBasis } from "./projection_types.js";

export const PROJECTION_DIGEST_DOMAIN = "palimpsest.application-projection.v1";

function envelope<N extends ProjectionNode>(input: {
  readonly species: GraphSpecies;
  readonly sourceBases: readonly ProjectionSourceBasis[];
  readonly knowledge: "known" | "unknown" | "error" | "stale";
  readonly nodes: readonly N[];
  readonly edges: readonly ProjectionEdge[];
}): ProjectionEnvelope<N> {
  const sortedNodes = [...input.nodes].sort((a, b) => (a.presentationId < b.presentationId ? -1 : 1));
  const sortedEdges = [...input.edges].sort((a, b) => (a.presentationId < b.presentationId ? -1 : 1));
  return Object.freeze({
    schemaVersion: 1 as const,
    species: input.species,
    knowledge: input.knowledge,
    sourceBases: Object.freeze([...input.sourceBases]),
    nodes: Object.freeze(sortedNodes),
    edges: Object.freeze(sortedEdges),
    projectionDigest: canonicalDigest({
      domain: PROJECTION_DIGEST_DOMAIN,
      species: input.species,
      knowledge: input.knowledge,
      sourceBases: input.sourceBases,
      nodes: sortedNodes.map((node) => ({ presentationId: node.presentationId, ref: node.ref, kind: node.kind })),
      edges: sortedEdges.map((edge) => ({ presentationId: edge.presentationId, from: edge.from, to: edge.to, kind: edge.kind })),
    }),
  });
}

/* ------------------------------------------------------------------ *
 * Work (adapts the existing Work graph; never a second Work truth)
 * ------------------------------------------------------------------ */

/**
 * The input is the REAL `OrchestrationGraph`, not `unknown`.
 *
 * It used to be `unknown` with an inline cast to `{ tasks?: { id?: unknown }[] }` — and the Work
 * graph's tasks expose `taskId`, not `id`. Nothing failed to compile, so every task node shipped
 * with `presentationId`/`ref.id`/`label` = the literal string "undefined" (the MultiGraph rendered
 * `undefined • ACTIVE`). Typing the parameter makes the compiler enforce the adapter contract here
 * exactly as it already does for the other four projections, which all take declared inputs.
 */
export function workProjection(graph: OrchestrationGraph | null, viewCursor: unknown): ProjectionEnvelope<ProjectionNode> {
  if (graph === null) {
    return envelope({ species: "work", sourceBases: [], knowledge: "unknown", nodes: [], edges: [] });
  }
  const nodes: ProjectionNode[] = graph.tasks.map((task) => ({
    presentationId: `work:task:${task.taskId}`,
    ref: { species: "work", kind: "task", id: task.taskId },
    kind: "task",
    label: task.taskId,
    state: task.state,
  }));
  for (const promotion of graph.promotions) nodes.push({ presentationId: `work:promotion:${promotion.promotionId}`, ref: { species: "work", kind: "promotion", id: promotion.promotionId }, kind: "promotion", label: promotion.promotionId, state: null });
  const edges: ProjectionEdge[] = [];
  return envelope({ species: "work", sourceBases: [{ source: "work", ref: "orchestration-graph", throughSeq: typeof viewCursor === "number" ? viewCursor : null, chainDigest: null }], knowledge: "known", nodes, edges });
}

/* ------------------------------------------------------------------ *
 * Runtime / Holon
 * ------------------------------------------------------------------ */

export async function runtimeProjection(deps: {
  readonly list: () => Promise<readonly { readonly scopeId: string }[]>;
  readonly state: (scopeId: string) => Promise<{ definition: { scopeId: string; organizationBasis: unknown }; lifecycle: string; members: readonly unknown[]; parent: { scopeId: string } | null; peer: unknown; boundary: unknown; campaignIds: readonly string[]; basis: { throughSeq: number; chainDigest: string } }>;
}): Promise<ProjectionEnvelope<ProjectionNode>> {
  let refs: readonly { readonly scopeId: string }[];
  try {
    refs = await deps.list();
  } catch {
    return envelope({ species: "runtime", sourceBases: [], knowledge: "error", nodes: [], edges: [] });
  }
  const nodes: ProjectionNode[] = [];
  const edges: ProjectionEdge[] = [];
  const bases: ProjectionSourceBasis[] = [];
  // memberKeyOf must not import the runtime_scope artifacts here (kept as a plain read model).
  const memberKey = (member: unknown): string => {
    const m = member as { kind?: string; activation?: { activationId?: string }; scope?: { scopeId?: string } };
    return m.kind === "activation" ? `activation:${m.activation?.activationId}` : `child_scope:${m.scope?.scopeId}`;
  };
  for (const ref of refs) {
    const state = await deps.state(ref.scopeId);
    nodes.push({ presentationId: `runtime:scope:${ref.scopeId}`, ref: { species: "runtime", kind: "scope", id: ref.scopeId }, kind: "scope", label: ref.scopeId, state: state.lifecycle });
    bases.push({ source: "runtime_scope", ref: ref.scopeId, throughSeq: state.basis.throughSeq, chainDigest: state.basis.chainDigest });
    if (state.parent !== null) edges.push({ presentationId: `runtime:child:${ref.scopeId}`, from: `runtime:scope:${state.parent.scopeId}`, to: `runtime:scope:${ref.scopeId}`, kind: "internal_child" });
    if (state.peer !== null) {
      const peerId = (state.peer as { peerId?: string }).peerId ?? "unknown";
      nodes.push({ presentationId: `runtime:external:peer:${ref.scopeId}`, ref: { species: "runtime", kind: "external_peer", id: peerId }, kind: "external_peer", label: peerId, state: null });
      edges.push({ presentationId: `runtime:peer:${ref.scopeId}`, from: `runtime:scope:${ref.scopeId}`, to: `runtime:external:peer:${ref.scopeId}`, kind: "external_representation" });
    }
    if (state.boundary !== null) {
      nodes.push({ presentationId: `runtime:external:boundary:${ref.scopeId}`, ref: { species: "runtime", kind: "external_boundary", id: `${ref.scopeId}:boundary` }, kind: "external_boundary", label: `${ref.scopeId} boundary`, state: null });
      edges.push({ presentationId: `runtime:boundary:${ref.scopeId}`, from: `runtime:scope:${ref.scopeId}`, to: `runtime:external:boundary:${ref.scopeId}`, kind: "external_representation" });
    }
    for (const member of state.members) {
      const key = memberKey(member);
      if (key.startsWith("activation:")) {
        const activationId = key.slice("activation:".length);
        nodes.push({ presentationId: `runtime:activation:${activationId}`, ref: { species: "runtime", kind: "activation", id: activationId }, kind: "activation", label: activationId, state: null });
        edges.push({ presentationId: `runtime:member:${ref.scopeId}:${activationId}`, from: `runtime:scope:${ref.scopeId}`, to: `runtime:activation:${activationId}`, kind: "internal_member" });
      }
    }
  }
  return envelope({ species: "runtime", sourceBases: bases, knowledge: "known", nodes, edges });
}

/* ------------------------------------------------------------------ *
 * Organization
 * ------------------------------------------------------------------ */

export function organizationProjection(input: {
  readonly organizationDefinitionId: string;
  readonly definition: { members: readonly unknown[]; roles: readonly { roleId: string }[]; assignments: readonly { member: unknown; roleId: string }[]; interactions: readonly { interactionId: string; fromRoleId: string; toRoleId: string }[] } | null;
  readonly lifecycle: string | null;
}): ProjectionEnvelope<ProjectionNode> {
  if (input.definition === null) {
    return envelope({ species: "organization", sourceBases: [], knowledge: "unknown", nodes: [], edges: [] });
  }
  const def = input.definition;
  const memberId = (member: unknown): string => {
    const m = member as { kind?: string; peer?: { peerId?: string }; agentDefinitionId?: string };
    return m.kind === "peer" ? `peer:${m.peer?.peerId}` : `agent:${m.agentDefinitionId}`;
  };
  const nodes: ProjectionNode[] = def.members.map((member) => ({
    presentationId: `organization:member:${memberId(member)}`,
    ref: { species: "organization", kind: "member", id: memberId(member) },
    kind: "member",
    label: memberId(member),
    state: null,
  }));
  for (const role of def.roles) nodes.push({ presentationId: `organization:role:${role.roleId}`, ref: { species: "organization", kind: "role", id: role.roleId }, kind: "role", label: role.roleId, state: null });
  const edges: ProjectionEdge[] = def.assignments.map((assignment) => ({
    presentationId: `organization:assignment:${memberId(assignment.member)}:${assignment.roleId}`,
    from: `organization:member:${memberId(assignment.member)}`,
    to: `organization:role:${assignment.roleId}`,
    kind: "assignment",
  }));
  for (const interaction of def.interactions) {
    edges.push({ presentationId: `organization:interaction:${interaction.interactionId}`, from: `organization:role:${interaction.fromRoleId}`, to: `organization:role:${interaction.toRoleId}`, kind: "declared_interaction" });
  }
  return envelope({
    species: "organization",
    sourceBases: [{ source: "organization", ref: input.organizationDefinitionId, throughSeq: null, chainDigest: null }],
    knowledge: "known",
    nodes,
    edges,
  });
}

/* ------------------------------------------------------------------ *
 * Reasoning
 * ------------------------------------------------------------------ */

/**
 * The human text of a claim, when its type has one.
 *
 * `ReasoningClaim.content` is `unknown` on purpose — the shape belongs to the claim type. A
 * `reasoning.statement` claim carries `{ statement }`, and that sentence is what a reader needs:
 * labelling the node with `reasoning.statement` showed the TYPE, which tells a user nothing, and
 * labelling a node with a digest prefix tells them less. The type id remains the fallback when a
 * claim genuinely has no statement — nothing is invented either way.
 */
function claimStatementOf(content: unknown): string | null {
  if (typeof content !== "object" || content === null) return null;
  const statement = (content as { readonly statement?: unknown }).statement;
  return typeof statement === "string" && statement.trim() !== "" ? statement.trim() : null;
}

export function reasoningProjection(input: {
  readonly cellId: string;
  readonly frontierRevision: number;
  readonly frontierDigest: string;
  readonly nodes: readonly { readonly ref: { readonly claimId: string }; readonly claim: { readonly type: { readonly typeId: string }; readonly content?: unknown; readonly dependencies: readonly { readonly claimId: string }[] }; readonly active: boolean }[];
  readonly candidates: readonly { readonly candidateDigest: string; readonly branchId: string; readonly status: string }[];
  readonly branches: readonly { readonly ref: { readonly branchId: string }; readonly question: string; readonly closed: boolean }[];
}): ProjectionEnvelope<ProjectionNode> {
  const nodes: ProjectionNode[] = input.nodes.map((node) => ({
    presentationId: `reasoning:claim:${node.ref.claimId}`,
    ref: { species: "reasoning", kind: "claim", id: node.ref.claimId },
    kind: "claim",
    // The claim's own words when its type has them; the type id only as a fallback, never invented.
    label: claimStatementOf(node.claim.content) ?? node.claim.type.typeId,
    // Pending/rejected candidates are NEVER rendered as admitted; active/inactive is explicit.
    state: node.active ? "active" : "inactive",
  }));
  for (const branch of input.branches) {
    nodes.push({ presentationId: `reasoning:branch:${branch.ref.branchId}`, ref: { species: "reasoning", kind: "branch", id: branch.ref.branchId }, kind: "branch", label: branch.question, state: branch.closed ? "closed" : "open" });
  }
  for (const candidate of input.candidates) {
    nodes.push({ presentationId: `reasoning:candidate:${candidate.candidateDigest}`, ref: { species: "reasoning", kind: "candidate", id: candidate.candidateDigest }, kind: "candidate", label: candidate.candidateDigest.slice(0, 12), state: candidate.status.toLowerCase() });
  }
  const edges: ProjectionEdge[] = [];
  for (const node of input.nodes) {
    for (const dependency of node.claim.dependencies) {
      edges.push({ presentationId: `reasoning:dep:${node.ref.claimId}:${dependency.claimId}`, from: `reasoning:claim:${node.ref.claimId}`, to: `reasoning:claim:${dependency.claimId}`, kind: "dependency" });
    }
  }
  return envelope({
    species: "reasoning",
    sourceBases: [{ source: "reasoning_cell", ref: input.cellId, throughSeq: input.frontierRevision, chainDigest: input.frontierDigest }],
    knowledge: "known",
    nodes,
    edges,
  });
}

/* ------------------------------------------------------------------ *
 * Collaboration
 * ------------------------------------------------------------------ */

export function collaborationProjection(input: {
  readonly localPeerId: string;
  readonly peers: readonly string[];
  readonly commitments: readonly { readonly commitmentId: string; readonly holderId: string; readonly state: string }[];
  readonly workspaces: readonly { readonly workspaceId: string; readonly participants: readonly string[]; readonly acceptedArtifacts: number }[];
}): ProjectionEnvelope<ProjectionNode> {
  const nodes: ProjectionNode[] = [{ presentationId: `collaboration:peer:${input.localPeerId}`, ref: { species: "collaboration", kind: "peer", id: input.localPeerId }, kind: "peer", label: input.localPeerId, state: "local" }];
  const edges: ProjectionEdge[] = [];
  for (const peerId of [...new Set(input.peers)].sort()) {
    if (peerId === input.localPeerId) continue;
    nodes.push({ presentationId: `collaboration:peer:${peerId}`, ref: { species: "collaboration", kind: "peer", id: peerId }, kind: "peer", label: peerId, state: "known" });
  }
  for (const commitment of input.commitments) {
    // A commitment is a DISTINCT visual species from a message edge.
    nodes.push({ presentationId: `collaboration:commitment:${commitment.commitmentId}`, ref: { species: "collaboration", kind: "commitment", id: commitment.commitmentId }, kind: "commitment", label: commitment.commitmentId, state: commitment.state.toLowerCase() });
    edges.push({ presentationId: `collaboration:holds:${commitment.holderId}:${commitment.commitmentId}`, from: `collaboration:peer:${commitment.holderId}`, to: `collaboration:commitment:${commitment.commitmentId}`, kind: "commitment_holder" });
  }
  for (const workspace of input.workspaces) {
    nodes.push({ presentationId: `collaboration:workspace:${workspace.workspaceId}`, ref: { species: "collaboration", kind: "workspace", id: workspace.workspaceId }, kind: "workspace", label: workspace.workspaceId, state: `${workspace.acceptedArtifacts} accepted` });
    for (const participant of workspace.participants) {
      edges.push({ presentationId: `collaboration:participant:${workspace.workspaceId}:${participant}`, from: `collaboration:peer:${participant}`, to: `collaboration:workspace:${workspace.workspaceId}`, kind: "workspace_participation" });
    }
  }
  return envelope({ species: "collaboration", sourceBases: [{ source: "federation", ref: input.localPeerId, throughSeq: null, chainDigest: null }], knowledge: "known", nodes, edges });
}
