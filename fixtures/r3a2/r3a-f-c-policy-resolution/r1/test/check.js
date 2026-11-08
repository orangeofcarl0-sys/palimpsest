import assert from "node:assert/strict";
import { resolvePolicies } from "../src/policy.mjs";

// A node with no inheritance keeps its own policies.
{
  const out = resolvePolicies({ nodes: { solo: { policies: { theme: "dark" }, inherits: [] } } });
  assert.deepEqual(out.effective.solo, { theme: "dark" }, "a node with no inheritance keeps its own policies");
  assert.deepEqual(out.order, ["solo"], "every node is listed exactly once");
}

// A node inherits the policies it does not declare itself, and does not push them back down.
{
  const out = resolvePolicies({
    nodes: {
      base: { policies: { retries: 3 }, inherits: [] },
      leaf: { policies: { theme: "dark" }, inherits: ["base"] },
    },
  });
  assert.deepEqual(out.effective.leaf, { retries: 3, theme: "dark" }, "an inherited policy reaches the node that inherits it");
  assert.deepEqual(out.effective.base, { retries: 3 }, "a node is not affected by the nodes above it");
}

// A node's own declaration wins over an inherited one.
{
  const out = resolvePolicies({
    nodes: {
      base: { policies: { retries: 3 }, inherits: [] },
      leaf: { policies: { retries: 9 }, inherits: ["base"] },
    },
  });
  assert.equal(out.effective.leaf.retries, 9, "a node's own policy wins over an inherited one");
}

// An unusable graph is refused.
{
  let threw = false;
  try {
    resolvePolicies({ nodes: { a: { policies: {}, inherits: ["missing"] } } });
  } catch {
    threw = true;
  }
  assert.equal(threw, true, "a graph that names a node it does not define must be refused");
}

process.stdout.write("ok" + String.fromCharCode(10));
