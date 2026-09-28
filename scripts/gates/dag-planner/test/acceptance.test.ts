/**
 * DAG PLANNER — the INDEPENDENT ACCEPTANCE CONTRACT.
 *
 * This file is the external product specification. It is deliberately written WITHOUT any knowledge
 * of Palimpsest: it states what the library must do, in terms a user of the library would use. The
 * dogfood harness never edits it, and no Palimpsest feature can make a test pass — only an
 * implementation that satisfies the stated behaviour can.
 *
 * It is fixed for the whole dogfood, so the SAME contract is applied to Generation 0's naive
 * implementation and to every later generation's. That is what makes the comparison meaningful: the
 * tests do not move to meet the implementation.
 *
 * Run: node --test test/acceptance.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { planExecution, CycleError } from "../src/dag.ts";

/** Every dependency must appear strictly before the node that depends on it. */
function assertDependenciesRespected(nodes, edges, order) {
  const position = new Map(order.map((node, index) => [node, index]));
  assert.equal(position.size, order.length, "the order must not contain a node twice");
  for (const node of nodes) {
    assert.ok(position.has(node), `the order is missing node ${node}`);
  }
  for (const edge of edges) {
    assert.ok(
      position.get(edge.from) < position.get(edge.to),
      `dependency ${edge.from} -> ${edge.to} is violated by the order ${order.join(", ")}`,
    );
  }
}

test("acyclic graph: every dependency precedes its dependent", () => {
  const nodes = ["a", "b", "c", "d"];
  const edges = [
    { from: "a", to: "b" },
    { from: "a", to: "c" },
    { from: "b", to: "d" },
    { from: "c", to: "d" },
  ];
  const order = planExecution({ nodes, edges });
  assertDependenciesRespected(nodes, edges, order);
});

test("determinism: the same graph always yields the same order", () => {
  const nodes = ["a", "b", "c", "d", "e"];
  const edges = [
    { from: "a", to: "c" },
    { from: "b", to: "c" },
    { from: "c", to: "d" },
    { from: "d", to: "e" },
  ];
  const first = planExecution({ nodes, edges });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.deepEqual(planExecution({ nodes, edges }), first, "the order must be reproducible");
  }
});

test("disconnected graph: every node appears exactly once", () => {
  const nodes = ["a", "b", "c", "d", "e", "f"];
  const edges = [
    { from: "a", to: "b" },
    { from: "d", to: "e" },
  ];
  const order = planExecution({ nodes, edges });
  assert.equal(order.length, nodes.length);
  assert.deepEqual([...order].sort(), [...nodes].sort());
  assertDependenciesRespected(nodes, edges, order);
});

test("stable tie breaking: independent nodes use a documented deterministic rule", () => {
  // `a` and `b` are mutually independent, and so are `c` and `d`. A documented rule (lexical order
  // of the ready set) makes the whole order predictable rather than merely reproducible.
  const nodes = ["d", "c", "b", "a"];
  const edges = [
    { from: "a", to: "c" },
    { from: "b", to: "d" },
  ];
  assert.deepEqual(planExecution({ nodes, edges }), ["a", "b", "c", "d"]);
});

test("cycle: a cyclic graph is refused with an explicit cycle diagnostic", () => {
  // The reconciled contract. A dependency-preserving order cannot exist for a directed cycle, so the
  // library must say so explicitly instead of returning a wrong answer or hanging.
  const nodes = ["a", "b", "c"];
  const edges = [
    { from: "a", to: "b" },
    { from: "b", to: "c" },
    { from: "c", to: "a" },
  ];
  let raised;
  try {
    planExecution({ nodes, edges });
  } catch (error) {
    raised = error;
  }
  assert.ok(raised instanceof CycleError, "a cycle must raise the library's own CycleError");
  const diagnostic = raised.diagnostic;
  assert.equal(diagnostic.kind, "CYCLE");
  // The diagnostic must name the nodes that participate in the cycle, as a closed witness path.
  assert.deepEqual([...diagnostic.nodes].sort(), ["a", "b", "c"]);
  assert.ok(diagnostic.path.length >= 2, "the witness path must contain at least one edge");
  for (const step of diagnostic.path) {
    assert.ok(nodes.includes(step), `the witness path names an unknown node ${step}`);
  }
});

test("cycle diagnostic is normalized: rotation of the same cycle yields one canonical witness", () => {
  // Two graphs describe the SAME cycle, started at a different node. A diagnostic that depends on
  // where the traversal happened to begin would be inconsistent between equivalent inputs.
  const nodes = ["a", "b", "c"];
  const forward = [
    { from: "a", to: "b" },
    { from: "b", to: "c" },
    { from: "c", to: "a" },
  ];
  const rotated = [
    { from: "b", to: "c" },
    { from: "c", to: "a" },
    { from: "a", to: "b" },
  ];
  const witness = (edges) => {
    try {
      planExecution({ nodes, edges });
    } catch (error) {
      assert.ok(error instanceof CycleError);
      return error.diagnostic;
    }
    throw new Error("expected a CycleError");
  };
  const left = witness(forward);
  const right = witness(rotated);
  assert.deepEqual(left.path, right.path, "equivalent cycles must produce the same witness path");
  assert.deepEqual(left.nodes, right.nodes);
});

test("unknown edge endpoints are rejected rather than silently ignored", () => {
  const nodes = ["a", "b"];
  const edges = [{ from: "a", to: "ghost" }];
  assert.throws(() => planExecution({ nodes, edges }), /ghost/u);
});

test("a self loop is a cycle, not a valid single-node plan", () => {
  const nodes = ["a"];
  const edges = [{ from: "a", to: "a" }];
  assert.throws(() => planExecution({ nodes, edges }), CycleError);
});
