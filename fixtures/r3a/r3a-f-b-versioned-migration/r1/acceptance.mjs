/**
 * F-B — THE HIDDEN ACCEPTANCE. Never copied into a worker's world.
 *
 * One case per declared failure class (some classes carry two). Every case deep-clones its input, so a
 * mutation performed by the candidate cannot leak into the next case, and a rejection is checked for
 * having left the input untouched.
 */

export const FB_CLASSES = Object.freeze([
  Object.freeze({ id: "FB1", invariant: "unknown-field-preserved", description: "a field the contract does not define survives the migration verbatim" }),
  Object.freeze({ id: "FB2", invariant: "default-only-when-absent", description: "the default is inserted ONLY when the key is absent" }),
  Object.freeze({ id: "FB3", invariant: "v1-rename-applied", description: "the v1 spelling is renamed to the v2 name and the old spelling is gone" }),
  Object.freeze({ id: "FB4", invariant: "future-version-rejected", description: "a version the contract does not define is refused rather than guessed at" }),
  Object.freeze({ id: "FB5", invariant: "v2-round-trip-stable", description: "a current-version document migrates to an equal document" }),
  Object.freeze({ id: "FB6", invariant: "malformed-nested-rejected", description: "a nested value of the wrong shape is refused" }),
  Object.freeze({ id: "FB7", invariant: "present-but-unusable-refused", description: "an explicitly present but unusable value is refused, not repaired into a default" }),
]);

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export const FB_CASES = Object.freeze([
  // FB1: a field the contract does not define, including a nested one.
  Object.freeze({ id: "fb1a", failureClass: "FB1", expect: "accept", input: { version: 1, retry_count: 2, featureFlag: true, nested: { keep: [1, 2] } }, after: { version: 2, retryCount: 2, timeoutMs: 3000, featureFlag: true, nested: { keep: [1, 2] } } }),
  // FB2: the key is absent, so the default is inserted.
  Object.freeze({ id: "fb2a", failureClass: "FB2", expect: "accept", input: { version: 2, retryCount: 4 }, after: { version: 2, retryCount: 4, timeoutMs: 3000 } }),
  // FB3: the v1 spelling is renamed and the old spelling does not survive.
  Object.freeze({ id: "fb3a", failureClass: "FB3", expect: "accept", input: { version: 1, retry_count: 7 }, after: { version: 2, retryCount: 7, timeoutMs: 3000 } }),
  // FB4: a version the contract does not define.
  Object.freeze({ id: "fb4a", failureClass: "FB4", expect: "reject", input: { version: 3, retryCount: 1 } }),
  // FB5: a current-version document is already current.
  Object.freeze({ id: "fb5a", failureClass: "FB5", expect: "accept", input: { version: 2, retryCount: 9, timeoutMs: 1200 }, after: { version: 2, retryCount: 9, timeoutMs: 1200 } }),
  // FB6: a nested value of the wrong shape.
  Object.freeze({ id: "fb6a", failureClass: "FB6", expect: "reject", input: { version: 2, retryCount: 1, nested: "not-an-object" } }),
  // FB7: the key is PRESENT and unusable — it must be refused, not repaired.
  Object.freeze({ id: "fb7a", failureClass: "FB7", expect: "reject", input: { version: 2, retryCount: 1, timeoutMs: null } }),
  Object.freeze({ id: "fb7b", failureClass: "FB7", expect: "reject", input: { version: 2, retryCount: 1, timeoutMs: -5 } }),
]);

/** Judge ONE case. A rejection is checked for having left the INPUT untouched. */
export function judgeCase(migrateDocument, testCase) {
  const input = structuredClone(testCase.input);
  const before = canonical(input);
  let outcome;
  try {
    outcome = { kind: "returned", value: migrateDocument(input) };
  } catch (error) {
    outcome = { kind: "threw", code: error?.code ?? error?.name ?? "Error" };
  }
  const base = { id: testCase.id, failureClass: testCase.failureClass, invariant: FB_CLASSES.find((entry) => entry.id === testCase.failureClass)?.invariant ?? "UNKNOWN" };
  if (canonical(input) !== before) return { ...base, pass: false, failureClass_detail: "MUTATED_INPUT", detail: `${before} -> ${canonical(input)}` };
  if (testCase.expect === "reject") {
    if (outcome.kind === "returned") return { ...base, pass: false, failureClass_detail: "ACCEPTED_INVALID_DOCUMENT", detail: canonical(outcome.value).slice(0, 120) };
    return { ...base, pass: true, failureClass_detail: null, detail: "" };
  }
  if (outcome.kind === "threw") return { ...base, pass: false, failureClass_detail: "REJECTED_BUT_SHOULD_ACCEPT", detail: outcome.code };
  if (canonical(outcome.value) !== canonical(testCase.after)) return { ...base, pass: false, failureClass_detail: "WRONG_DOCUMENT", detail: `expected ${canonical(testCase.after).slice(0, 110)}, got ${canonical(outcome.value).slice(0, 110)}` };
  return { ...base, pass: true, failureClass_detail: null, detail: "" };
}

export function runCases(migrateDocument, cases) {
  const results = cases.map((testCase) => judgeCase(migrateDocument, testCase));
  return { results, passed: results.filter((result) => result.pass).length, total: results.length };
}
