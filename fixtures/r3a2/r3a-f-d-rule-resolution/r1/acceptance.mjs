/**
 * F-D — THE HIDDEN ACCEPTANCE. Never copied into a worker's world.
 *
 * One or more cases per declared failure class. A matching case is compared on the selected rule id AND
 * the parameters that came with it, so selecting the right rule with the wrong parameters is not credited.
 * A rejected case is judged only on whether the request was refused.
 */

export const FD_CLASSES = Object.freeze([
  Object.freeze({ id: "FD1", invariant: "normalization-before-ranking", description: "matching and specificity are computed after trimming and case-folding BOTH the rule and the request" }),
  Object.freeze({ id: "FD2", invariant: "host-specificity-precedence", description: "a rule that names a host outranks a rule that matches any host, even when the path pattern is identical" }),
  Object.freeze({ id: "FD3", invariant: "path-specificity-ranking", description: "the rule with more literal path segments wins, whatever order the rules were written in" }),
  Object.freeze({ id: "FD4", invariant: "ambiguity-rejected", description: "a request that two DIFFERENT rules match at the same top specificity is refused rather than resolved by rule order" }),
  Object.freeze({ id: "FD5", invariant: "duplicate-rule-handling", description: "two rules with the same normalized match are one candidate, while two rules sharing an id but not a match make the rule set unusable" }),
  Object.freeze({ id: "FD6", invariant: "segment-boundary-semantics", description: "a `*` segment matches exactly one non-empty segment: never zero, never more than one, and never across a `/`" }),
]);

const rule = (id, host, path, params = {}) => ({ id, match: { host, path }, params });

export const FD_CASES = Object.freeze([
  // FD1: the rule and the request disagree only in case.
  Object.freeze({ id: "fd1a", failureClass: "FD1", expect: "accept", rules: [rule("r1", null, "/API/Users", { a: 1 })], request: { host: "api.example.com", path: "/api/users" }, expectRuleId: "r1", expectParams: { a: 1 } }),
  // FD1: normalization and ranking together — the exact rule only matches once case is folded.
  Object.freeze({ id: "fd1b", failureClass: "FD1", expect: "accept", rules: [rule("exact", null, "/V1/Items"), rule("wild", null, "/v1/*")], request: { host: "h", path: "/v1/items" }, expectRuleId: "exact", expectParams: {} }),
  // FD2: the same path, one rule pinned to a host.
  Object.freeze({ id: "fd2a", failureClass: "FD2", expect: "accept", rules: [rule("any", null, "/v1/items"), rule("pinned", "api.example.com", "/v1/items")], request: { host: "api.example.com", path: "/v1/items" }, expectRuleId: "pinned", expectParams: {} }),
  // FD2: the pinned rule names ANOTHER host, so the any-host rule is the one that applies.
  Object.freeze({ id: "fd2b", failureClass: "FD2", expect: "accept", rules: [rule("pinned", "other.example.com", "/v1/items"), rule("any", null, "/v1/items")], request: { host: "api.example.com", path: "/v1/items" }, expectRuleId: "any", expectParams: {} }),
  // FD3: a literal segment beats a wildcard one at the same depth.
  Object.freeze({ id: "fd3a", failureClass: "FD3", expect: "accept", rules: [rule("wide", null, "/api/*"), rule("narrow", null, "/api/users")], request: { host: "h", path: "/api/users" }, expectRuleId: "narrow", expectParams: {} }),
  // FD3: more literal segments wins, even against a rule written earlier.
  Object.freeze({ id: "fd3b", failureClass: "FD3", expect: "accept", rules: [rule("one", null, "/a/*"), rule("two", null, "/*/b"), rule("three", null, "/a/b")], request: { host: "h", path: "/a/b" }, expectRuleId: "three", expectParams: {} }),
  // FD4: two different patterns, one literal segment each.
  Object.freeze({ id: "fd4a", failureClass: "FD4", expect: "reject", rules: [rule("p", null, "/api/*"), rule("q", null, "/*/users")], request: { host: "h", path: "/api/users" } }),
  // FD4: a pinned wildcard and an any-host exact pattern score the same.
  Object.freeze({ id: "fd4b", failureClass: "FD4", expect: "reject", rules: [rule("p", "h", "/api/*"), rule("q", null, "/api/users")], request: { host: "h", path: "/api/users" } }),
  // FD5: the same match written twice is ONE candidate, and it still outranks a wider rule.
  Object.freeze({ id: "fd5a", failureClass: "FD5", expect: "accept", rules: [rule("dup", null, "/api/users", { v: 1 }), rule("dup", null, "/api/users", { v: 1 }), rule("any", null, "/api/*")], request: { host: "h", path: "/api/users" }, expectRuleId: "dup", expectParams: { v: 1 } }),
  // FD5: one id bound to two different matches makes the rule set unusable.
  Object.freeze({ id: "fd5b", failureClass: "FD5", expect: "reject", rules: [rule("same", null, "/api/users"), rule("same", null, "/api/items")], request: { host: "h", path: "/api/users" } }),
  // FD6: a trailing slash ends in an EMPTY segment, which no pattern segment matches.
  Object.freeze({ id: "fd6a", failureClass: "FD6", expect: "accept", rules: [rule("wild", null, "/api/*")], request: { host: "h", path: "/api/" }, expectRuleId: null }),
  // FD6: a `*` never spans a `/`.
  Object.freeze({ id: "fd6b", failureClass: "FD6", expect: "accept", rules: [rule("wild", null, "/api/*")], request: { host: "h", path: "/api/users/1" }, expectRuleId: null }),
  // FD6: a wildcard never matches zero segments, so the exact rule is the only one that applies.
  Object.freeze({ id: "fd6c", failureClass: "FD6", expect: "accept", rules: [rule("exact", null, "/api"), rule("wild", null, "/api/*")], request: { host: "h", path: "/api" }, expectRuleId: "exact", expectParams: {} }),
]);

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

/** Judge ONE case against the candidate, on a fresh clone of the rules and the request. */
export function judgeCase(resolveRule, testCase) {
  const rules = structuredClone(testCase.rules);
  const request = structuredClone(testCase.request);
  let outcome;
  try {
    outcome = { kind: "returned", value: resolveRule(rules, request) };
  } catch (error) {
    outcome = { kind: "threw", code: error?.code ?? error?.name ?? "Error" };
  }
  const base = { id: testCase.id, failureClass: testCase.failureClass, invariant: FD_CLASSES.find((entry) => entry.id === testCase.failureClass)?.invariant ?? "UNKNOWN" };
  if (testCase.expect === "reject") {
    if (outcome.kind === "returned") return { ...base, pass: false, failureClass_detail: "RESOLVED_UNUSABLE_RULE_SET", detail: canonical(outcome.value).slice(0, 140) };
    return { ...base, pass: true, failureClass_detail: null, detail: "" };
  }
  if (outcome.kind === "threw") return { ...base, pass: false, failureClass_detail: "REFUSED_VALID_REQUEST", detail: outcome.code };
  const value = outcome.value;
  if (testCase.expectRuleId === null) {
    if (value !== null) return { ...base, pass: false, failureClass_detail: "MATCHED_WHEN_NOTHING_SHOULD", detail: canonical(value).slice(0, 120) };
    return { ...base, pass: true, failureClass_detail: null, detail: "" };
  }
  if (value === null || typeof value !== "object") return { ...base, pass: false, failureClass_detail: "NO_RULE_SELECTED", detail: canonical(value).slice(0, 120) };
  if (value.ruleId !== testCase.expectRuleId) return { ...base, pass: false, failureClass_detail: "WRONG_RULE", detail: `expected ${testCase.expectRuleId}, got ${canonical(value.ruleId)}` };
  if (canonical(value.params ?? null) !== canonical(testCase.expectParams ?? {})) return { ...base, pass: false, failureClass_detail: "WRONG_PARAMS", detail: `expected ${canonical(testCase.expectParams ?? {})}, got ${canonical(value.params ?? null)}` };
  return { ...base, pass: true, failureClass_detail: null, detail: "" };
}

export function runCases(resolveRule, cases) {
  const results = cases.map((testCase) => judgeCase(resolveRule, testCase));
  return { results, passed: results.filter((result) => result.pass).length, total: results.length };
}
