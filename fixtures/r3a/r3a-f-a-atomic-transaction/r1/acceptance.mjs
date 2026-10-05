/**
 * F-A — THE HIDDEN ACCEPTANCE. Never copied into a worker's world.
 *
 * One case per declared failure class (some classes carry two). `judgeCase` gives the candidate a FRESH
 * store, so one case cannot leak state into the next, and for a rejection it compares the store against its
 * canonical form before the call.
 */

export const FA_CLASSES = Object.freeze([
  Object.freeze({ id: "FA1", invariant: "atomic-rollback-on-reject", description: "an unusable operation anywhere in the batch leaves the caller\u2019s store byte-identical" }),
  Object.freeze({ id: "FA2", invariant: "validate-later-operation", description: "an operation AFTER a valid one is validated before the valid one has any effect" }),
  Object.freeze({ id: "FA3", invariant: "idempotent-retry", description: "re-applying a transaction the store already applied is a no-op" }),
  Object.freeze({ id: "FA4", invariant: "intra-transaction-order", description: "a debit covered by an EARLIER credit in the same transaction is allowed" }),
  Object.freeze({ id: "FA5", invariant: "insufficient-funds-rejected", description: "a debit that would overdraw is refused, leaving the store untouched" }),
  Object.freeze({ id: "FA6", invariant: "unrelated-state-preserved", description: "a successful transaction leaves every other account and applied id exactly as it was" }),
]);

const store = (accounts, applied = {}) => ({ accounts: Object.fromEntries(Object.entries(accounts).map(([id, balance]) => [id, { balance }])), applied: { ...applied } });

export const FA_CASES = Object.freeze([
  // FA1: an unknown account appears LAST, after a perfectly good credit.
  Object.freeze({ id: "fa1a", failureClass: "FA1", expect: "reject", store: store({ a: 10, b: 5 }), txn: { id: "x1", operations: [{ kind: "credit", account: "a", amount: 4 }, { kind: "credit", account: "ghost", amount: 1 }] } }),
  // FA1: a non-integer amount appears LAST.
  Object.freeze({ id: "fa1b", failureClass: "FA1", expect: "reject", store: store({ a: 10 }), txn: { id: "x2", operations: [{ kind: "credit", account: "a", amount: 2 }, { kind: "credit", account: "a", amount: 1.5 }] } }),
  // FA2: ops[0] is valid, ops[1] has amount 0. Nothing may be applied.
  Object.freeze({ id: "fa2a", failureClass: "FA2", expect: "reject", store: store({ a: 10, b: 5 }), txn: { id: "x3", operations: [{ kind: "credit", account: "a", amount: 7 }, { kind: "debit", account: "b", amount: 0 }] } }),
  // FA3: the store has ALREADY applied this id; the retry must change nothing.
  Object.freeze({ id: "fa3a", failureClass: "FA3", expect: "accept", store: store({ a: 10, b: 5 }, { x4: true }), txn: { id: "x4", operations: [{ kind: "credit", account: "a", amount: 99 }] }, after: store({ a: 10, b: 5 }, { x4: true }) }),
  // FA4: the debit is only covered by the credit that comes BEFORE it.
  Object.freeze({ id: "fa4a", failureClass: "FA4", expect: "accept", store: store({ a: 0, b: 5 }), txn: { id: "x5", operations: [{ kind: "credit", account: "a", amount: 8 }, { kind: "debit", account: "a", amount: 6 }] }, after: store({ a: 2, b: 5 }, { x5: true }) }),
  // FA4: the same net effect, but the debit comes FIRST, so it overdraws mid-sequence and must be refused.
  Object.freeze({ id: "fa4b", failureClass: "FA4", expect: "reject", store: store({ a: 0, b: 5 }), txn: { id: "x6", operations: [{ kind: "debit", account: "a", amount: 6 }, { kind: "credit", account: "a", amount: 8 }] } }),
  // FA5: a plain overdraw.
  Object.freeze({ id: "fa5a", failureClass: "FA5", expect: "reject", store: store({ a: 3, b: 5 }), txn: { id: "x7", operations: [{ kind: "debit", account: "a", amount: 4 }] } }),
  // FA6: a successful transaction must not disturb b, nor another applied id.
  Object.freeze({ id: "fa6a", failureClass: "FA6", expect: "accept", store: store({ a: 10, b: 5 }, { old: true }), txn: { id: "x8", operations: [{ kind: "debit", account: "a", amount: 2 }] }, after: store({ a: 8, b: 5 }, { old: true, x8: true }) }),
]);

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

/** Judge ONE case against the candidate. The store is compared canonically, so key order cannot matter. */
export function judgeCase(applyTransaction, testCase) {
  const target = structuredClone(testCase.store);
  const before = canonical(target);
  let outcome;
  try {
    applyTransaction(target, structuredClone(testCase.txn));
    outcome = { kind: "returned" };
  } catch (error) {
    outcome = { kind: "threw", code: error?.code ?? error?.name ?? "Error" };
  }
  const base = { id: testCase.id, failureClass: testCase.failureClass, invariant: FA_CLASSES.find((entry) => entry.id === testCase.failureClass)?.invariant ?? "UNKNOWN" };
  if (testCase.expect === "reject") {
    if (outcome.kind === "returned") return { ...base, pass: false, failureClass_detail: "ACCEPTED_INVALID_TRANSACTION", detail: canonical(target).slice(0, 120) };
    if (canonical(target) !== before) return { ...base, pass: false, failureClass_detail: "MUTATED_STORE_BEFORE_REJECTING", detail: `${before} -> ${canonical(target)}` };
    return { ...base, pass: true, failureClass_detail: null, detail: "" };
  }
  if (outcome.kind === "threw") return { ...base, pass: false, failureClass_detail: "REJECTED_BUT_SHOULD_ACCEPT", detail: outcome.code };
  if (canonical(target) !== canonical(testCase.after)) return { ...base, pass: false, failureClass_detail: "WRONG_STORE", detail: `expected ${canonical(testCase.after).slice(0, 100)}, got ${canonical(target).slice(0, 100)}` };
  return { ...base, pass: true, failureClass_detail: null, detail: "" };
}

export function runCases(applyTransaction, cases) {
  const results = cases.map((testCase) => judgeCase(applyTransaction, testCase));
  return { results, passed: results.filter((result) => result.pass).length, total: results.length };
}
