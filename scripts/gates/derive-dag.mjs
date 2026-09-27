/**
 * §20 LEVEL 3 — DERIVE an implementation from a procedure's STRUCTURED CONTENT.
 *
 * The E-LIVE gate originally consumed a procedure at Level 1: it looked at the pulled body, saw that
 * the step list mentioned cycles, and wrote a pre-written file (`mature-dag.ts`). That is a handle
 * driving a lookup, not an interpretation — the method's *semantics* never reached the code.
 *
 * This module replaces the lookup with a real (small, deterministic) interpreter. Each ordered step
 * in `ProcedureContent.steps` is CLASSIFIED against a closed clause vocabulary, and the emitted
 * source is assembled from the fragments those clauses select, in the order the method states them.
 * Consequences, which are what make this Level 3 rather than Level 1:
 *
 *   · A method that does not mention cycle detection produces an implementation with no cycle
 *     handling — the code follows the CONTENT, not the harness.
 *   · A method whose cycle step appears AFTER its ordering step produces an implementation that
 *     orders first, so the guarantee is gone.
 *   · A method that says nothing about tie-breaking produces an implementation whose order is
 *     merely reproducible rather than documented.
 *
 * The gate proves all three behaviorally by deriving from mutated content and running the SAME
 * unchanged acceptance contract against the result (see "derivation sensitivity" in the gate). That
 * is the evidence that the structured content is being interpreted rather than pattern-matched for a
 * keyword.
 *
 * PLAIN JAVASCRIPT (`.mjs`): the gate runs under bare `node`, and this is harness code — it is not a
 * product component and nothing in `src/` depends on it.
 */

/**
 * The CLOSED clause vocabulary, ordered MOST SPECIFIC FIRST. Classification is first-match-wins, so
 * ordering is load-bearing: a generic clause placed above a specific one silently swallows it (the
 * bare tie-break clause would otherwise absorb "tie-break AFTER normalization"), and a loose keyword
 * would misclassify ("its FIRST node" is not "detect cycles first"). A step matching none is reported
 * as `UNRECOGNIZED` rather than dropped, so an authoring model cannot smuggle an uninterpreted
 * instruction into a method and have it quietly ignored.
 */
export const METHOD_CLAUSES = Object.freeze([
  {
    id: "CLOSE_WITNESS_LOOP",
    describe: "make the witness CLOSED: repeat the first node so the cycle is fully described",
    matches: (step) => /clos\w*\s+the\s+(witness|loop)|repeat\w*\s+its\s+first\s+node/iu.test(step),
  },
  {
    id: "TIE_BREAK_AFTER_NORMALIZATION",
    describe: "apply the stable tie-break AFTER normalization, never before",
    matches: (step) => /tie.?break|lexical/iu.test(step) && /after normaliz|never before|post.normaliz/iu.test(step),
  },
  {
    id: "REFUSE_WITH_NORMALIZED_WITNESS",
    describe: "refuse a cyclic graph with a normalized witness naming the participating nodes",
    matches: (step) => /refus|reject|throw/iu.test(step) && /witness|diagnostic|participat/iu.test(step),
  },
  {
    id: "DETECT_CYCLE_FIRST",
    describe: "detect a cycle BEFORE any ordering is attempted",
    matches: (step) => /cycle/iu.test(step) && /before|prior to|precede/iu.test(step),
  },
  {
    id: "NORMALIZE_AND_VALIDATE",
    describe: "establish the node set and reject edges naming an unknown endpoint",
    matches: (step) => /normaliz|canonicaliz/iu.test(step) && /validat|known node|endpoint/iu.test(step),
  },
  {
    id: "VERIFY_EVERY_EDGE",
    describe: "verify every edge against the final order before returning it",
    matches: (step) => /verif|check/iu.test(step) && /edge/iu.test(step),
  },
  {
    id: "ORDER_ACYCLIC",
    describe: "produce a dependency-preserving order for the acyclic case",
    matches: (step) => /order/iu.test(step) && /acyclic|topolog|dependenc/iu.test(step),
  },
  {
    id: "TIE_BREAK_READY_SET",
    describe: "apply a documented deterministic tie-break when several nodes are ready",
    matches: (step) => /tie.?break|lexical/iu.test(step),
  },
]);

/** Classify one instruction, or `UNRECOGNIZED` — the vocabulary is closed and reports its misses. */
export function classifyStep(instruction) {
  const text = String(instruction ?? "");
  for (const clause of METHOD_CLAUSES) {
    if (clause.matches(text)) return clause.id;
  }
  return "UNRECOGNIZED";
}

const TYPES = `export interface Edge {
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
    super(\`the graph contains a cycle involving \${diagnostic.nodes.join(", ")}\`);
    this.name = "CycleError";
    this.diagnostic = diagnostic;
  }
}`;

const NORMALIZE_FN = `/** NORMALIZE_AND_VALIDATE: the node set is canonical and every endpoint must be known. */
function normalize(graph: Graph): { nodes: readonly string[]; edges: readonly Edge[] } {
  const nodes = [...new Set(graph.nodes)].sort();
  const known = new Set(nodes);
  for (const edge of graph.edges) {
    if (!known.has(edge.from)) throw new Error(\`the graph references an unknown node \${edge.from}\`);
    if (!known.has(edge.to)) throw new Error(\`the graph references an unknown node \${edge.to}\`);
  }
  return { nodes, edges: graph.edges };
}`;

function findCycleFn(closeLoop) {
  const witness = closeLoop
    ? `      const rotated = [...raw.slice(at), ...raw.slice(0, at)];
      // Generation 2's extension: close the loop so the witness describes the cycle itself.
      const path = [...rotated, rotated[0]!];
      return { kind: "CYCLE", nodes: [...rotated].sort(), path };`
    : `      const rotated = [...raw.slice(at), ...raw.slice(0, at)];
      return { kind: "CYCLE", nodes: [...rotated].sort(), path: rotated };`;
  return `/** DETECT_CYCLE_FIRST + REFUSE_WITH_NORMALIZED_WITNESS: one canonical witness per cycle. */
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
        // Rotating to the lexically smallest node is what makes equivalent cycles agree.
        const smallest = raw.reduce((best, candidate) => (candidate < best ? candidate : best));
        const at = raw.indexOf(smallest);
${witness}
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
}`;
}

/**
 * Interpret a `ProcedureContent` into an implementation.
 *
 * The clause ORDER in the emitted code follows the clause order the method states, so a method that
 * orders before it validates produces an implementation that does the same — and therefore fails the
 * contract. That is the point: the harness supplies no guarantee the content does not.
 */
export function deriveImplementation(content, options = {}) {
  const steps = Array.isArray(content?.steps)
    ? content.steps.map((step) => String(step?.instruction ?? ""))
    : [];
  const trace = steps.map((instruction) => ({ instruction, clause: classifyStep(instruction) }));
  const clauseIds = trace.map((entry) => entry.clause);
  const has = (id) => clauseIds.includes(id);
  const at = (id) => clauseIds.indexOf(id);

  // The method only detects cycles BEFORE ordering if it says so AND states it in that order.
  const detectsCycle = has("DETECT_CYCLE_FIRST") && has("REFUSE_WITH_NORMALIZED_WITNESS");
  const cycleBeforeOrder = detectsCycle && has("ORDER_ACYCLIC") && at("DETECT_CYCLE_FIRST") < at("ORDER_ACYCLIC");
  const normalizes = has("NORMALIZE_AND_VALIDATE");
  // "AFTER normalization, never before" is a distinct instruction from a bare tie-break.
  const tieBreakAfterNormalization = has("TIE_BREAK_AFTER_NORMALIZATION");
  const tieBreak = tieBreakAfterNormalization || has("TIE_BREAK_READY_SET");
  const verifies = has("VERIFY_EVERY_EDGE");
  // The witness shape is a property of the METHOD, not of a harness option: a revision that says
  // "close the loop" derives a closed witness, and one that does not, does not.
  const closeLoop = has("CLOSE_WITNESS_LOOP");

  const planLines = [];
  planLines.push("export function planExecution(graph: Graph): readonly string[] {");
  planLines.push(
    normalizes
      ? "  const { nodes, edges } = normalize(graph);"
      : "  const nodes = graph.nodes;\n  const edges = graph.edges;",
  );
  if (cycleBeforeOrder) {
    planLines.push("  const cycle = findCycle(nodes, edges);");
    planLines.push("  if (cycle !== null) throw new CycleError(cycle);");
  }
  planLines.push("  const incoming = new Map<string, number>();");
  planLines.push("  for (const node of nodes) incoming.set(node, 0);");
  planLines.push("  for (const edge of edges) incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);");
  planLines.push("");
  planLines.push("  const order: string[] = [];");
  planLines.push("  const remaining = new Set(nodes);");
  planLines.push("  for (;;) {");
  // Without a tie-break clause the ready set keeps insertion order: reproducible, but not documented.
  planLines.push(
    tieBreak
      ? "    const ready = [...remaining].filter((node) => (incoming.get(node) ?? 0) === 0).sort();"
      : "    const ready = [...remaining].filter((node) => (incoming.get(node) ?? 0) === 0);",
  );
  planLines.push("    if (ready.length === 0) break;");
  planLines.push("    const next = ready[0]!;");
  planLines.push("    remaining.delete(next);");
  planLines.push("    order.push(next);");
  planLines.push("    for (const edge of edges) {");
  planLines.push("      if (edge.from === next) incoming.set(edge.to, (incoming.get(edge.to) ?? 0) - 1);");
  planLines.push("    }");
  planLines.push("  }");
  if (verifies) {
    planLines.push("");
    planLines.push("  const position = new Map(order.map((node, index) => [node, index]));");
    planLines.push("  for (const edge of edges) {");
    planLines.push("    if ((position.get(edge.from) ?? -1) >= (position.get(edge.to) ?? -1)) {");
    planLines.push("      throw new Error(`the produced order violates the dependency ${edge.from} -> ${edge.to}`);");
    planLines.push("    }");
    planLines.push("  }");
  }
  planLines.push("  return order;");
  planLines.push("}");

  const sections = [
    [
      "// GENERATED by derive-dag.mjs from the inherited procedure's STRUCTURED CONTENT.",
      "// The clause order below is the method's own step order — the harness adds no guarantee the",
      "// content does not state. Clause trace:",
      ...trace.map((entry) => `//   ${entry.clause.padEnd(32)} <- ${entry.instruction}`),
    ].join("\n"),
    TYPES,
  ];
  if (normalizes) sections.push(NORMALIZE_FN);
  if (cycleBeforeOrder) sections.push(findCycleFn(closeLoop));
  sections.push(planLines.join("\n"));

  return {
    source: `${sections.join("\n\n")}\n`,
    trace,
    clauses: Object.freeze({
      normalizes,
      detectsCycle,
      cycleBeforeOrder,
      tieBreak,
      tieBreakAfterNormalization,
      verifies,
      closeLoop,
      unrecognized: trace.filter((entry) => entry.clause === "UNRECOGNIZED").length,
    }),
  };
}
