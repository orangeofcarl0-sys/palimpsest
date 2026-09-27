/**
 * DAG PLANNER — the GENERATION 2 implementation.
 *
 * Generation 2 inherits the mature method (normalize → detect cycles → order → tie-break after
 * normalization → verify) and EXTENDS it without re-deriving the baseline: the cycle witness now
 * closes the loop back to its first node, so a caller can see the whole cycle rather than an open
 * path. The extension is a genuine improvement to the diagnostic, and it remains conformant with
 * the unchanged acceptance contract.
 */

export interface Edge {
  readonly from: string;
  readonly to: string;
}

export interface Graph {
  readonly nodes: readonly string[];
  readonly edges: readonly Edge[];
}

export interface CycleDiagnostic {
  readonly kind: "CYCLE";
  readonly nodes: readonly string[];
  /** Generation 2: the witness CLOSES the loop — its last entry is the node it started from. */
  readonly path: readonly string[];
}

export class CycleError extends Error {
  readonly diagnostic: CycleDiagnostic;

  constructor(diagnostic: CycleDiagnostic) {
    super(`the graph contains a cycle involving ${diagnostic.nodes.join(", ")}`);
    this.name = "CycleError";
    this.diagnostic = diagnostic;
  }
}

function normalize(graph: Graph): { nodes: readonly string[]; edges: readonly Edge[] } {
  const nodes = [...new Set(graph.nodes)].sort();
  const known = new Set(nodes);
  for (const edge of graph.edges) {
    if (!known.has(edge.from)) throw new Error(`the graph references an unknown node ${edge.from}`);
    if (!known.has(edge.to)) throw new Error(`the graph references an unknown node ${edge.to}`);
  }
  return { nodes, edges: graph.edges };
}

function findCycle(nodes: readonly string[], edges: readonly Edge[]): CycleDiagnostic | null {
  const outgoing = new Map<string, string[]>();
  for (const node of nodes) outgoing.set(node, []);
  for (const edge of edges) outgoing.get(edge.from)!.push(edge.to);

  const state = new Map<string, "unvisited" | "active" | "done">();
  for (const node of nodes) state.set(node, "unvisited");
  const stack: string[] = [];

  const walk = (node: string): CycleDiagnostic | null => {
    state.set(node, "active");
    stack.push(node);
    for (const next of (outgoing.get(node) ?? []).slice().sort()) {
      const nextState = state.get(next);
      if (nextState === "active") {
        const start = stack.indexOf(next);
        const raw = stack.slice(start);
        const smallest = raw.reduce((best, candidate) => (candidate < best ? candidate : best));
        const at = raw.indexOf(smallest);
        const rotated = [...raw.slice(at), ...raw.slice(0, at)];
        // The extension: close the loop so the witness describes the cycle itself.
        const path = [...rotated, rotated[0]!];
        return { kind: "CYCLE", nodes: [...rotated].sort(), path };
      }
      if (nextState === "unvisited") {
        const found = walk(next);
        if (found !== null) return found;
      }
    }
    stack.pop();
    state.set(node, "done");
    return null;
  };

  for (const node of nodes) {
    if (state.get(node) === "unvisited") {
      const found = walk(node);
      if (found !== null) return found;
    }
  }
  return null;
}

export function planExecution(graph: Graph): readonly string[] {
  const { nodes, edges } = normalize(graph);
  const cycle = findCycle(nodes, edges);
  if (cycle !== null) throw new CycleError(cycle);

  const incoming = new Map<string, number>();
  for (const node of nodes) incoming.set(node, 0);
  for (const edge of edges) incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);

  const order: string[] = [];
  const remaining = new Set(nodes);
  for (;;) {
    const ready = [...remaining].filter((node) => (incoming.get(node) ?? 0) === 0).sort();
    if (ready.length === 0) break;
    const next = ready[0]!;
    remaining.delete(next);
    order.push(next);
    for (const edge of edges) {
      if (edge.from === next) incoming.set(edge.to, (incoming.get(edge.to) ?? 0) - 1);
    }
  }

  const position = new Map(order.map((node, index) => [node, index]));
  for (const edge of edges) {
    if ((position.get(edge.from) ?? -1) >= (position.get(edge.to) ?? -1)) {
      throw new Error(`the produced order violates the dependency ${edge.from} -> ${edge.to}`);
    }
  }
  return order;
}
