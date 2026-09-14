/**
 * G10-O MultiGraph projection envelope types.
 *
 * A presentation id is derived from a canonical ref and is NOT canonical identity; a
 * projection is never writable back into the kernel. Nodes are typed by species — there is
 * deliberately no `UniversalNode { type, data: any }` application-semantic API.
 */

export type GraphSpecies = "work" | "organization" | "collaboration" | "runtime" | "reasoning";

export interface CanonicalNodeRef {
  readonly species: GraphSpecies;
  readonly kind: string;
  readonly id: string;
}

export interface ProjectionNode {
  /** Presentation identity, e.g. `runtime:scope:s1` — never written back to the kernel. */
  readonly presentationId: string;
  readonly ref: CanonicalNodeRef;
  readonly kind: string;
  readonly label: string;
  readonly state: string | null;
}

export interface ProjectionEdge {
  readonly presentationId: string;
  readonly from: string;
  readonly to: string;
  readonly kind: string;
}

export interface ProjectionSourceBasis {
  readonly source: string;
  readonly ref: string;
  readonly throughSeq: number | null;
  readonly chainDigest: string | null;
}

export interface ProjectionEnvelope<N extends ProjectionNode = ProjectionNode> {
  readonly schemaVersion: 1;
  readonly species: GraphSpecies;
  readonly knowledge: "known" | "unknown" | "error" | "stale";
  readonly sourceBases: readonly ProjectionSourceBasis[];
  readonly nodes: readonly N[];
  readonly edges: readonly ProjectionEdge[];
  /** Read-model digest ONLY — not a new semantic identity. */
  readonly projectionDigest: string;
}
