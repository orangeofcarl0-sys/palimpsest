import assert from "node:assert/strict";
import { resolveRule } from "../src/rules.mjs";

// The ordinary case: one rule matches and it is returned with its parameters.
{
  const out = resolveRule([{ id: "r1", match: { host: null, path: "/api/users" }, params: { page: 1 } }], { host: "api.example.com", path: "/api/users" });
  assert.equal(out.ruleId, "r1", "the matching rule must be returned");
  assert.deepEqual(out.params, { page: 1 }, "the rule's parameters must be returned");
}

// A wildcard segment stands for exactly one segment.
{
  const out = resolveRule([{ id: "r2", match: { host: null, path: "/api/*" }, params: {} }], { host: "h", path: "/api/users" });
  assert.equal(out.ruleId, "r2", "a wildcard segment must match one segment");
}

// A request nothing matches is not an error.
{
  const out = resolveRule([{ id: "r3", match: { host: null, path: "/api/users" }, params: {} }], { host: "h", path: "/other" });
  assert.equal(out, null, "a request nothing matches yields null");
}

// Matching happens after normalization.
{
  const out = resolveRule([{ id: "r4", match: { host: "API.Example.com", path: "/V1/Items" }, params: {} }], { host: "api.example.com", path: "/v1/items" });
  assert.equal(out.ruleId, "r4", "matching must not depend on the case the rule or the request was written in");
}

// The most specific matching rule wins, not the first one written.
{
  const out = resolveRule([
    { id: "wide", match: { host: null, path: "/api/*" }, params: {} },
    { id: "narrow", match: { host: null, path: "/api/users" }, params: {} },
  ], { host: "h", path: "/api/users" });
  assert.equal(out.ruleId, "narrow", "the most specific matching rule must win");
}

// A request two equally specific rules match is refused.
{
  let threw = false;
  try {
    resolveRule([
      { id: "p", match: { host: null, path: "/api/*" }, params: {} },
      { id: "q", match: { host: null, path: "/*/users" }, params: {} },
    ], { host: "h", path: "/api/users" });
  } catch {
    threw = true;
  }
  assert.equal(threw, true, "a request two equally specific rules match must be refused");
}

process.stdout.write("ok" + String.fromCharCode(10));
