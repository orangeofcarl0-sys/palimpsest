/**
 * F-C — POLICY INHERITANCE RESOLUTION (starting point H0).
 *
 * A feature tree declares policy values and inherits them from the nodes it depends on, so the effective
 * policy set of a node is its own declarations merged over the closure it inherits from, with the NEARER
 * declaration winning.
 *
 * This implementation takes the obvious first move — gather every policy it can see into one bag and give
 * that bag to every node — and therefore:
 *
 *   · accepts a graph whose inheritance edges form a cycle;
 *   · ignores an inheritance edge that names a node the graph does not define;
 *   · lets a farther declaration overwrite a nearer one;
 *   · reports the nodes in whatever order they happened to be written;
 *   · leaks a policy from one component into every other component.
 */

export class PolicyError extends Error {
  /**
   * @param {string} code a stable, machine-readable failure code
   * @param {string} message a human-readable explanation
   */
  constructor(code, message) {
    super(message);
    this.name = "PolicyError";
    this.code = code;
  }
}

/**
 * Resolve the effective policies of every node in the inheritance graph.
 *
 * @param {{ nodes: Record<string, { policies: Record<string, unknown>, inherits: ReadonlyArray<string> }> }} graph
 *   the graph as declared; `inherits` is ordered, and an earlier entry is nearer than a later one
 * @returns {{ effective: Record<string, Record<string, unknown>>, order: ReadonlyArray<string> }}
 */
export function resolvePolicies(graph) {
  const bag = {};
  for (const node of Object.values(graph.nodes)) {
    for (const [name, value] of Object.entries(node.policies)) bag[name] = value;
  }
  const effective = {};
  for (const id of Object.keys(graph.nodes)) effective[id] = { ...bag };
  return { effective, order: Object.keys(graph.nodes) };
}
