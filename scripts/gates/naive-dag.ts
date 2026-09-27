/**
 * DAG PLANNER — the NAIVE implementation (Generation 0's deliverable, and the paired control's).
 *
 * It implements the INITIAL requirement literally: "the planner must return a valid
 * dependency-preserving order for every input graph". It therefore performs a straightforward
 * Kahn-style topological sort with NO cycle handling at all — because the requirement said every
 * graph has an order, so there was no reason to write any.
 *
 * The project's own acceptance suite is what discovers that the requirement is impossible as stated.
 * A generation that inherits the method writes the mature implementation instead; a generation with
 * no inherited method writes this one and pays the discovery cost again.
 */

export interface Edge {
  readonly from: string;
  readonly to: string;
}

export interface Graph {
  readonly nodes: readonly string[];
  readonly edges: readonly Edge[];
}

export class CycleError extends Error {
  readonly diagnostic: { readonly kind: "CYCLE"; readonly nodes: readonly string[]; readonly path: readonly string[] };

  constructor(diagnostic: { readonly kind: "CYCLE"; readonly nodes: readonly string[]; readonly path: readonly string[] }) {
    super(`the graph contains a cycle involving ${diagnostic.nodes.join(", ")}`);
    this.name = "CycleError";
    this.diagnostic = diagnostic;
  }
}

/** Return a deterministic dependency-preserving execution order. */
export function planExecution(graph: Graph): readonly string[] {
  const incoming = new Map<string, number>();
  for (const node of graph.nodes) incoming.set(node, 0);
  for (const edge of graph.edges) incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);

  const order: string[] = [];
  const remaining = new Set(graph.nodes);
  for (;;) {
    const ready = [...remaining].filter((node) => (incoming.get(node) ?? 0) === 0).sort();
    if (ready.length === 0) break;
    const next = ready[0];
    remaining.delete(next);
    order.push(next);
    for (const edge of graph.edges) {
      if (edge.from === next) incoming.set(edge.to, (incoming.get(edge.to) ?? 0) - 1);
    }
  }
  return order;
}
