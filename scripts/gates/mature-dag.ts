/**
 * DAG PLANNER — the MATURE implementation, as a REFERENCE ORACLE.
 *
 * This is the implementation the inherited method describes: normalize and validate first, detect
 * cycles BEFORE ordering, refuse with a normalized witness path, order only the acyclic graph,
 * tie-break lexically after normalization, then verify every edge.
 *
 * ROLE (R0 §18): this file is NO LONGER what the gate writes. The gate's worker DERIVES its
 * implementation by interpreting the procedure's structured content (`derive-dag.mjs`), so the code
 * that actually runs is generated from the method's clauses. This file is kept as a hand-written
 * oracle: `test/e-live_derivation.test.ts` asserts the derived output is semantically identical to
 * it, which is what would catch a derivation regression. It is a fixture, never a harness output.
 *
 * The dogfood harness never edits the project's source directly.
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

/** Step 1 of the method: normalize and validate identity before anything else. */
function normalize(graph: Graph): { nodes: readonly string[]; edges: readonly Edge[] } {
  const nodes = [...new Set(graph.nodes)].sort();
  const known = new Set(nodes);
  for (const edge of graph.edges) {
    if (!known.has(edge.from)) throw new Error(`the graph references an unknown node ${edge.from}`);
    if (!known.has(edge.to)) throw new Error(`the graph references an unknown node ${edge.to}`);
  }
  return { nodes, edges: graph.edges };
}

/**
 * Step 2/3: detect a cycle and, when one exists, return a NORMALIZED witness.
 *
 * Normalization is what makes two descriptions of the SAME cycle produce ONE diagnostic: the
 * witness is rotated so it starts at its lexically smallest node. Applying the tie-break before
 * this step would make the witness depend on traversal order, which is the defect generation 1
 * found empirically.
 */
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
        // Rotate so the witness begins at its lexically smallest node: ONE canonical form per cycle.
        const smallest = raw.reduce((best, candidate) => (candidate < best ? candidate : best));
        const at = raw.indexOf(smallest);
        const path = [...raw.slice(at), ...raw.slice(0, at)];
        return { kind: "CYCLE", nodes: [...path].sort(), path };
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

/** Steps 4/5/6: order the acyclic graph, tie-break AFTER normalization, then verify every edge. */
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

  // Step 6: verify every edge against the FINAL order before returning it.
  const position = new Map(order.map((node, index) => [node, index]));
  for (const edge of edges) {
    if ((position.get(edge.from) ?? -1) >= (position.get(edge.to) ?? -1)) {
      throw new Error(`the produced order violates the dependency ${edge.from} -> ${edge.to}`);
    }
  }
  return order;
}
