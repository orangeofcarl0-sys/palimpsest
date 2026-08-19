/**
 * Scientific Evidence Graph (Research line R7, raw-notes 预算.txt §27).
 *
 * A claim's standing is not a manager-editable field — it is *derived* from
 * the supporting/contradicting evidence attached to it. The full proof chain
 * is explicit: CLAIM -> EVIDENCE -> EXPERIMENT -> CONFIG -> CODE COMMIT ->
 * DATA (each node carries its predecessor's identity for provenance).
 *
 *   CLAIM-17 "Population modulation improves long-delay generalization"
 *     supported_by: EXP-31, EXP-34
 *     contradicted_by: EXP-42
 *
 * The graph is deliberately in-memory and pure: recording happens through
 * the controller's graph surface; evaluation art is derived, never stored.
 */

import { DomainValidationError } from "../domain/errors.js";

export const GRAPH_NODE_KINDS = [
  "claim",
  "evidence",
  "experiment",
  "config",
  "commit",
  "data",
] as const;

export type GraphNodeKind = (typeof GRAPH_NODE_KINDS)[number];

/** The proof chain: who may be supported/contradicted by whom. */
const SUPPORTED_BY: Readonly<Partial<Record<GraphNodeKind, GraphNodeKind>>> = {
  claim: "evidence",
  experiment: "evidence",
};

export const GRAPH_RELATIONS = [
  "supported_by",
  "contradicted_by",
  "derived_from",
  "produced_by",
  "configured_by",
  "committed_in",
] as const;

export type GraphRelation = (typeof GRAPH_RELATIONS)[number];

export interface GraphNode {
  readonly id: string;
  readonly kind: GraphNodeKind;
  /** Human statement for claims; description for evidence/experiments. */
  readonly label: string;
  /** Invalidated evidence stops supporting its claims (derived STALE). */
  readonly invalidated?: boolean | undefined;
}

export interface GraphEdge {
  readonly source: string;
  readonly target: string;
  readonly relation: GraphRelation;
}

export interface ClaimStatus {
  readonly claimId: string;
  readonly status: "SUPPORTED" | "PARTIALLY_SUPPORTED" | "CONTRADICTED" | "INCONCLUSIVE" | "STALE";
  readonly supportedBy: readonly string[];
  readonly contradictedBy: readonly string[];
}

export class ClaimGraph {
  readonly #nodes = new Map<string, GraphNode>();
  readonly #out = new Map<string, GraphEdge[]>();
  readonly #in = new Map<string, GraphEdge[]>();

  /** Every valid (sourceKind, relation) pair; fail-closed on everything else. */
  #assertEdge(node: GraphNode, relation: GraphRelation, target: GraphNode): void {
    const valid =
      (node.kind === "claim" && target.kind === "evidence" && (relation === "supported_by" || relation === "contradicted_by")) ||
      (node.kind === "evidence" && target.kind === "claim" && (relation === "supported_by" || relation === "contradicted_by")) ||
      (node.kind === "evidence" && target.kind === "experiment" && relation === "produced_by") ||
      (node.kind === "experiment" && target.kind === "config" && relation === "configured_by") ||
      (node.kind === "experiment" && target.kind === "commit" && relation === "committed_in") ||
      (node.kind === "experiment" && target.kind === "data" && relation === "derived_from") ||
      (node.kind === "config" && target.kind === "data" && relation === "derived_from");
    if (!valid) {
      throw new DomainValidationError(
        `illegal evidence-graph edge ${node.kind}:${node.id} --(${relation})--> ${target.kind}:${target.id}`,
      );
    }
  }

  addNode(node: GraphNode): this {
    if (this.#nodes.has(node.id)) {
      throw new DomainValidationError(`evidence-graph node ${node.id} already exists`);
    }
    this.#nodes.set(node.id, { ...node });
    return this;
  }

  /** Claim status supports only evidence; "supported_by" from claim -> evidence is the recording direction. */
  addEdge(sourceId: string, targetId: string, relation: GraphRelation | "supported_by" | "contradicted_by"): this {
    const source = this.#nodes.get(sourceId);
    const target = this.#nodes.get(targetId);
    if (source === undefined) throw new DomainValidationError(`unknown graph node ${sourceId}`);
    if (target === undefined) throw new DomainValidationError(`unknown graph node ${targetId}`);
    this.#assertEdge(source, relation, target);
    const edge: GraphEdge = { source: sourceId, target: targetId, relation };
    this.#out.set(sourceId, [...(this.#out.get(sourceId) ?? []), edge]);
    this.#in.set(targetId, [...(this.#in.get(targetId) ?? []), edge]);
    return this;
  }

  node(id: string): GraphNode | undefined {
    return this.#nodes.get(id);
  }

  /** Edges leaving a node (source -> target). */
  out(id: string): readonly GraphEdge[] {
    return this.#out.get(id) ?? [];
  }

  /** Edges entering a node (target receives source). */
  in(id: string): readonly GraphEdge[] {
    return this.#in.get(id) ?? [];
  }

  /**
   * Derived claim status (§23): computed from evidence edges only. A claim
   * with only active supporting evidence is SUPPORTED; only contradicting
   * evidence is CONTRADICTED; both is PARTIALLY_SUPPORTED; none is
   * INCONCLUSIVE. If every edge points at invalidated evidence, the claim
   * is STALE — old reasoning re-derived, never deleted.
   */
  claimStatus(claimId: string): ClaimStatus {
    const claim = this.#nodes.get(claimId);
    if (claim === undefined) {
      throw new DomainValidationError(`unknown graph node ${claimId}`);
    }
    if (claim.kind !== "claim") {
      throw new DomainValidationError(`node ${claimId} is not a claim`);
    }
    const supporting: string[] = [];
    const contradicting: string[] = [];
    for (const edge of this.#in.get(claimId) ?? []) {
      const evidence = this.#nodes.get(edge.source);
      if (evidence === undefined || evidence.kind !== "evidence") {
        throw new DomainValidationError("claim graph edge source must be evidence");
      }
      if (evidence.invalidated === true) continue;
      if (edge.relation === "supported_by") supporting.push(evidence.id);
      else if (edge.relation === "contradicted_by") contradicting.push(evidence.id);
    }
    let status: ClaimStatus["status"];
    if (supporting.length > 0 && contradicting.length > 0) status = "PARTIALLY_SUPPORTED";
    else if (supporting.length > 0) status = "SUPPORTED";
    else if (contradicting.length > 0) status = "CONTRADICTED";
    else {
      const stale = (this.#in.get(claimId) ?? []).length > 0;
      status = stale ? "STALE" : "INCONCLUSIVE";
    }
    return { claimId, status, supportedBy: supporting, contradictedBy: contradicting };
  }

  /**
   * The provenance chain under an evidence node (R7 §27): evidence ->
   * experiment -> config/commit/data, walked via the recorded edges.
   */
  provenance(evidenceId: string): readonly { id: string; kind: GraphNodeKind }[] {
    const chain: { id: string; kind: GraphNodeKind }[] = [];
    let cursor = this.#nodes.get(evidenceId);
    if (cursor === undefined) return chain;
    const seen = new Set<string>();
    const PROVENANCE_RELATIONS: ReadonlySet<GraphRelation> = new Set([
      "produced_by",
      "configured_by",
      "committed_in",
      "derived_from",
    ]);
    let frontier = [evidenceId];
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const id of frontier) {
        if (seen.has(id)) continue;
        seen.add(id);
        const node = this.#nodes.get(id);
        if (node !== undefined) chain.push({ id: node.id, kind: node.kind });
        for (const edge of this.#out.get(id) ?? []) {
          // Evaluation edges (supported_by/contradicted_by) are NOT part of
          // the provenance chain — only producer/configured/committed edges are.
          if (PROVENANCE_RELATIONS.has(edge.relation)) next.push(edge.target);
        }
      }
      frontier = next;
    }
    return chain;
  }

  snapshot(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    return {
      nodes: [...this.#nodes.values()],
      edges: [...this.#out.values()].flat(),
    };
  }
}