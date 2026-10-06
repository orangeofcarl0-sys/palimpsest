/**
 * F-C — THE HIDDEN ACCEPTANCE. Never copied into a worker's world.
 *
 * One or more cases per declared failure class. An accepted case is compared on the entire result — the
 * effective policies of EVERY node and the node order as a sequence — so a partially correct resolver is
 * not credited. A rejected case is judged only on whether the graph was refused.
 */

export const FC_CLASSES = Object.freeze([
  Object.freeze({ id: "FC1", invariant: "cycle-rejected", description: "a graph whose inheritance edges form a cycle, including a node that inherits itself, is refused rather than resolved" }),
  Object.freeze({ id: "FC2", invariant: "unknown-reference-rejected", description: "an inheritance edge naming a node the graph does not define is refused, at any depth" }),
  Object.freeze({ id: "FC3", invariant: "declared-precedence-honored", description: "the nearer declaration wins through the whole closure, and between two inherited declarations of one name the EARLIER inherits entry wins" }),
  Object.freeze({ id: "FC4", invariant: "duplicate-edge-idempotent", description: "repeating an inheritance edge changes neither the effective policies nor the node order" }),
  Object.freeze({ id: "FC5", invariant: "deterministic-topological-order", description: "order lists every node exactly once, parents before children, ties broken by the lexicographically smaller id" }),
  Object.freeze({ id: "FC6", invariant: "component-isolation", description: "a node's effective policies contain nothing from a node outside its inherited closure" }),
]);

const node = (policies, inherits) => ({ policies, inherits });

export const FC_CASES = Object.freeze([
  // FC1: a two-node cycle.
  Object.freeze({ id: "fc1a", failureClass: "FC1", expect: "reject", nodes: { a: node({}, ["b"]), b: node({}, ["a"]) } }),
  // FC1: a node that inherits itself.
  Object.freeze({ id: "fc1b", failureClass: "FC1", expect: "reject", nodes: { a: node({}, ["a"]) } }),
  // FC2: an unknown reference on the only node.
  Object.freeze({ id: "fc2a", failureClass: "FC2", expect: "reject", nodes: { a: node({}, ["ghost"]) } }),
  // FC2: an unknown reference one level down.
  Object.freeze({ id: "fc2b", failureClass: "FC2", expect: "reject", nodes: { a: node({}, ["b"]), b: node({}, ["ghost"]) } }),
  // FC3: two ancestors declare the same name; the EARLIER inherits entry wins.
  Object.freeze({
    id: "fc3a", failureClass: "FC3", expect: "accept",
    nodes: { base: node({ mode: "base" }, []), alt: node({ mode: "alt" }, []), leaf: node({}, ["alt", "base"]) },
    effective: { base: { mode: "base" }, alt: { mode: "alt" }, leaf: { mode: "alt" } },
    order: ["alt", "base", "leaf"],
  }),
  // FC3: a node's own declaration beats every inherited one.
  Object.freeze({
    id: "fc3b", failureClass: "FC3", expect: "accept",
    nodes: { alt: node({ mode: "alt" }, []), leaf: node({ mode: "own" }, ["alt"]) },
    effective: { alt: { mode: "alt" }, leaf: { mode: "own" } },
    order: ["alt", "leaf"],
  }),
  // FC3: the closure is transitive — a grandparent's policy reaches a grandchild.
  Object.freeze({
    id: "fc3c", failureClass: "FC3", expect: "accept",
    nodes: { gp: node({ p: "gp" }, []), mid: node({}, ["gp"]), leaf: node({}, ["mid"]) },
    effective: { gp: { p: "gp" }, mid: { p: "gp" }, leaf: { p: "gp" } },
    order: ["gp", "mid", "leaf"],
  }),
  // FC4: a repeated edge must not shift WHICH declaration is nearest.
  Object.freeze({
    id: "fc4a", failureClass: "FC4", expect: "accept",
    nodes: { base: node({ x: 1 }, []), alt: node({ x: 2 }, []), leaf: node({}, ["alt", "alt", "base"]) },
    effective: { base: { x: 1 }, alt: { x: 2 }, leaf: { x: 2 } },
    order: ["alt", "base", "leaf"],
  }),
  // FC4: the same graph WITHOUT the repetition must resolve identically.
  Object.freeze({
    id: "fc4b", failureClass: "FC4", expect: "accept",
    nodes: { base: node({ x: 1 }, []), alt: node({ x: 2 }, []), leaf: node({}, ["alt", "base"]) },
    effective: { base: { x: 1 }, alt: { x: 2 }, leaf: { x: 2 } },
    order: ["alt", "base", "leaf"],
  }),
  // FC5: the graph is written child-first; the order must not follow the declaration.
  Object.freeze({
    id: "fc5a", failureClass: "FC5", expect: "accept",
    nodes: { c: node({}, ["a", "b"]), b: node({}, []), a: node({}, []) },
    effective: { c: {}, b: {}, a: {} },
    order: ["a", "b", "c"],
  }),
  // FC5: two roots ready at once are ordered by the smaller id.
  Object.freeze({
    id: "fc5b", failureClass: "FC5", expect: "accept",
    nodes: { z: node({}, []), y: node({}, []) },
    effective: { z: {}, y: {} },
    order: ["y", "z"],
  }),
  // FC5: a diamond — a parent must appear before every node that inherits from it.
  Object.freeze({
    id: "fc5c", failureClass: "FC5", expect: "accept",
    nodes: { root: node({ r: 1 }, []), left: node({}, ["root"]), right: node({}, ["root"]), leaf: node({}, ["left", "right"]) },
    effective: { root: { r: 1 }, left: { r: 1 }, right: { r: 1 }, leaf: { r: 1 } },
    order: ["root", "left", "right", "leaf"],
  }),
  // FC6: two components that share no edge must not share a policy.
  Object.freeze({
    id: "fc6a", failureClass: "FC6", expect: "accept",
    nodes: { left: node({ l: 1 }, []), right: node({ r: 2 }, []) },
    effective: { left: { l: 1 }, right: { r: 2 } },
    order: ["left", "right"],
  }),
  // FC6: an isolated node inherits nothing at all.
  Object.freeze({
    id: "fc6b", failureClass: "FC6", expect: "accept",
    nodes: { solo: node({}, []) },
    effective: { solo: {} },
    order: ["solo"],
  }),
]);

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

/** Judge ONE case against the candidate, on a fresh clone of the graph. */
export function judgeCase(resolvePolicies, testCase) {
  const graph = structuredClone({ nodes: testCase.nodes });
  let outcome;
  try {
    outcome = { kind: "returned", value: resolvePolicies(graph) };
  } catch (error) {
    outcome = { kind: "threw", code: error?.code ?? error?.name ?? "Error" };
  }
  const base = { id: testCase.id, failureClass: testCase.failureClass, invariant: FC_CLASSES.find((entry) => entry.id === testCase.failureClass)?.invariant ?? "UNKNOWN" };
  if (testCase.expect === "reject") {
    if (outcome.kind === "returned") return { ...base, pass: false, failureClass_detail: "RESOLVED_INVALID_GRAPH", detail: canonical(outcome.value).slice(0, 140) };
    return { ...base, pass: true, failureClass_detail: null, detail: "" };
  }
  if (outcome.kind === "threw") return { ...base, pass: false, failureClass_detail: "REFUSED_VALID_GRAPH", detail: outcome.code };
  const value = outcome.value;
  if (value === null || typeof value !== "object") return { ...base, pass: false, failureClass_detail: "NO_RESULT", detail: canonical(value).slice(0, 120) };
  if (canonical(value.order ?? null) !== canonical(testCase.order)) return { ...base, pass: false, failureClass_detail: "WRONG_NODE_ORDER", detail: `expected ${canonical(testCase.order)}, got ${canonical(value.order ?? null)}` };
  if (canonical(value.effective ?? null) !== canonical(testCase.effective)) return { ...base, pass: false, failureClass_detail: "WRONG_EFFECTIVE_POLICIES", detail: `expected ${canonical(testCase.effective).slice(0, 140)}, got ${canonical(value.effective ?? null).slice(0, 140)}` };
  return { ...base, pass: true, failureClass_detail: null, detail: "" };
}

export function runCases(resolvePolicies, cases) {
  const results = cases.map((testCase) => judgeCase(resolvePolicies, testCase));
  return { results, passed: results.filter((result) => result.pass).length, total: results.length };
}
