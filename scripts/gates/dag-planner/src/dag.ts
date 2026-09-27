/**
 * DAG PLANNER — H0: the project's initial state.
 *
 * The external product intent is:
 *
 *     "Given a directed dependency graph, produce a deterministic execution plan that respects
 *      every dependency."
 *
 * and the initial requirement is stated universally:
 *
 *     "The planner must return a valid dependency-preserving order for every input graph."
 *
 * At H0 the library is a declared contract with no implementation. Ordinary project Work is what
 * turns it into one — and ordinary project tests are what discover that the requirement, as stated,
 * is impossible.
 *
 * The dogfood harness never edits this file. Only a generation's worker does, through Work.
 */

export interface Edge {
  readonly from: string;
  readonly to: string;
}

export interface Graph {
  readonly nodes: readonly string[];
  readonly edges: readonly Edge[];
}

/** The library's own error type. */
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
  throw new Error("planExecution is not implemented yet");
}
