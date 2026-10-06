/**
 * R3-A2 — A REFERENCE RESOLUTION FOR F-C, used ONLY by the solvability test.
 *
 * This is NOT a model outcome and NOT a fixture byte: it exists so the design tests can prove the
 * fixture's contract is SATISFIABLE, i.e. that its failure classes measure a reachable behaviour rather
 * than an impossible one. It is never copied into a world, and it is not part of the qualification
 * schedule.
 */
export class PolicyError extends Error {
  constructor(code, message) { super(message); this.name = "PolicyError"; this.code = code; }
}
export function resolvePolicies(graph) {
  const nodes = graph.nodes;
  const ids = Object.keys(nodes);
  for (const id of ids) {
    const seen = new Set();
    for (const parent of nodes[id].inherits) {
      if (!Object.prototype.hasOwnProperty.call(nodes, parent)) throw new PolicyError("UNKNOWN_REFERENCE", `unknown ${parent}`);
    }
    const stack = [...nodes[id].inherits];
    while (stack.length > 0) {
      const cur = stack.pop();
      if (cur === id) throw new PolicyError("CYCLE", `cycle at ${id}`);
      if (seen.has(cur)) continue;
      seen.add(cur);
      stack.push(...nodes[cur].inherits);
    }
  }
  // topological order: Kahn with lexicographic tie-break
  const indeg = new Map(ids.map((id) => [id, 0]));
  for (const id of ids) for (const p of new Set(nodes[id].inherits)) indeg.set(id, indeg.get(id) + 1);
  const order = [];
  const ready = ids.filter((id) => indeg.get(id) === 0).sort();
  const children = new Map(ids.map((id) => [id, []]));
  for (const id of ids) for (const p of new Set(nodes[id].inherits)) children.get(p).push(id);
  while (ready.length > 0) {
    const id = ready.shift();
    order.push(id);
    for (const child of children.get(id).slice().sort()) {
      indeg.set(child, indeg.get(child) - 1);
      if (indeg.get(child) === 0) { ready.push(child); ready.sort(); }
    }
  }
  if (order.length !== ids.length) throw new PolicyError("CYCLE", "cycle");
  const effective = {};
  for (const id of order) {
    const out = {};
    for (const parent of [...nodes[id].inherits].reverse()) Object.assign(out, effective[parent]);
    Object.assign(out, nodes[id].policies);
    effective[id] = out;
  }
  return { effective, order };
}
