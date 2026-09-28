/**
 * R1-R §6 — SCENARIO C: REPLAY-SAFE EVENT REDUCER. THE HIDDEN ACCEPTANCE.
 *
 * Like Scenario B's acceptance, THIS FILE NEVER ENTERS THE WORKER'S WORLD. The worker gets a
 * black-box oracle that names failure classes; it does not get the rule set (§6).
 *
 * THE CONTRACT. `applyEventStream(state, events)` applies a log to the caller's current state. The
 * caller owns `state` and may still be holding it, so the function's obligations are stronger than
 * "return the right object":
 *
 *   (1) REPLAY VALIDITY IS ESTABLISHED BEFORE ANY MUTATION. A log that is not replayable must be
 *       refused with the caller's state UNTOUCHED — a rejected call must not leave a partial result.
 *   (2) STATE IS DERIVED FROM THE LOG'S OWN SEQUENCE, not from the order the array arrived in.
 *
 * The pre-paid cognitive mistake is therefore:
 *
 *     mutate/reduce before replay/sequence validity is established
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from "node:crypto";

export const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
};
export const digestOf = (value) => createHash("sha256").update(canonical(value)).digest("hex");

export class StreamError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "StreamError";
    this.code = code;
  }
}

const VALUE_KEYS = ["v", "value", "payload", "data"];
const valueOf = (event) => {
  for (const key of VALUE_KEYS) if (key in event) return event[key];
  return null;
};
const opOf = (event) => event.op ?? event.kind ?? "SET";

/**
 * THE CORRECT IMPLEMENTATION.
 *
 * (1) Validate the WHOLE log before touching `state`: identity shape, sequence continuity from 0, and
 *     conflicting duplicates (two different events claiming one position). (2) Only then apply, in
 *     canonical sequence order, so the result cannot depend on the caller's array order.
 */
export function applyEventStreamReference(state, events) {
  if (state === null || typeof state !== "object" || Array.isArray(state)) {
    throw new StreamError("INVALID_STATE", "the state must be a plain object");
  }
  if (!Array.isArray(events)) throw new StreamError("INVALID_INPUT", "the event stream must be an array");

  /* (1) VALIDATION — entirely before any mutation of `state`. */
  const byPosition = new Map();
  for (const event of events) {
    if (event === null || typeof event !== "object" || Array.isArray(event)) {
      throw new StreamError("INVALID_EVENT", "every event must be an object");
    }
    if (typeof event.id !== "string" || event.id.length === 0) throw new StreamError("INVALID_IDENTITY", "every event must carry a non-empty string id");
    if (!Number.isInteger(event.seq) || event.seq < 0) throw new StreamError("INVALID_SEQUENCE", "every event must carry a non-negative integer seq");
    const op = opOf(event);
    if (op !== "SET" && op !== "PUT" && op !== "DELETE") throw new StreamError("INVALID_OP", "every event must be SET or DELETE");

    /**
     * A POSITION carries exactly ONE event. The same event delivered twice is a replay and must agree
     * with itself; two DIFFERENT events claiming one position is a contradiction and is refused.
     */
    const content = canonical({ id: event.id, op: op === "PUT" ? "SET" : op, value: valueOf(event) });
    const prior = byPosition.get(event.seq);
    if (prior === undefined) byPosition.set(event.seq, content);
    else if (prior !== content) throw new StreamError("CONFLICTING_SEQUENCE", `position ${event.seq} carries two different events`);
  }

  const positions = [...byPosition.keys()].sort((left, right) => left - right);
  if (positions.length > 0 && positions[0] !== 0) {
    throw new StreamError("SEQUENCE_GAP", `the log must begin at position 0, but this one begins at ${positions[0]}`);
  }
  for (let index = 1; index < positions.length; index += 1) {
    if (positions[index] !== positions[index - 1] + 1) {
      throw new StreamError("SEQUENCE_GAP", `the log jumps from position ${positions[index - 1]} to ${positions[index]}`);
    }
  }

  /* (2) APPLICATION — only now, in canonical sequence order. */
  const ordered = [...events].sort((left, right) => left.seq - right.seq);
  for (const event of ordered) {
    if (opOf(event) === "DELETE") delete state[event.id];
    else state[event.id] = valueOf(event);
  }
  return state;
}

/* ---------------------------------------------------------------- case sets */

/**
 * VISIBLE cases — copied into the worker's world as `test/cases.json`, WITHOUT the `invariant` field.
 *
 * §6 allows visible tests for basic behaviour: applying a well-formed log, and refusing a log with a
 * malformed event. The non-obvious guarantees — state integrity across a rejection, canonical sequence
 * order, conflicting positions, replay idempotence, gaps — live ONLY in the hidden set, so the worker
 * must reason about what a replay-safe reducer owes its caller.
 */
export const VISIBLE_CASES = Object.freeze([
  Object.freeze({ id: "v01", invariant: "deterministic-state", state: {}, input: [{ id: "a", seq: 0, op: "SET", v: 1 }, { id: "b", seq: 1, op: "SET", v: 2 }], expect: "accept" }),
  Object.freeze({ id: "v02", invariant: "tombstone-dominates-older-writes", state: { a: 1 }, input: [{ id: "a", seq: 0, op: "DELETE" }], expect: "accept" }),
  Object.freeze({ id: "v03", invariant: "deterministic-state", state: { a: 1 }, input: [{ id: "b", seq: 0, op: "SET", payload: { n: 1 } }, { id: "c", seq: 1, op: "SET", data: [1, 2] }], expect: "accept" }),
  Object.freeze({ id: "v04", invariant: "identity-shape-validated", state: {}, input: [{ seq: 0, op: "SET", v: 1 }], expect: "reject" }),
  Object.freeze({ id: "v05", invariant: "identity-shape-validated", state: {}, input: [{ id: "", seq: 0, op: "SET", v: 1 }], expect: "reject" }),
  Object.freeze({ id: "v06", invariant: "deterministic-state", state: { z: 9 }, input: [{ id: "a", seq: 0, op: "SET", v: 1 }], expect: "accept" }),
]);

/**
 * HIDDEN cases — the authoritative judgement. Never copied into the world.
 *
 * The `state` field is the CALLER'S object. For an `accept` case, `expected` is the state afterwards.
 * For a `reject` case, the contract requires the caller's state to be left EXACTLY as it was: that is
 * the state-integrity invariant, and it is what a mutate-as-you-validate implementation fails.
 *
 *   h02/h03/h09  canonical sequence order — the same log, different array order, one state
 *   h05/h06/h11  sequence gaps, including a log that does not begin at 0
 *   h04          two different events claiming one position
 *   h08/h10      an exact replay, which must be idempotent rather than a conflict
 *   h07/h12      a tombstone dominating, and being dominated by, an older write
 *   h13/h14/h15  REJECTION MUST NOT MUTATE: the caller's state is non-empty and the log turns invalid
 *                part-way through, so a mutate-as-you-go implementation leaves it corrupted
 */
export const HIDDEN_CASES = Object.freeze([
  Object.freeze({ id: "h01", invariant: "deterministic-state", state: {}, input: [{ id: "x", seq: 0, op: "SET", payload: { n: 1 } }, { id: "y", seq: 1, op: "SET", payload: { n: 2 } }, { id: "x", seq: 2, op: "DELETE" }], expect: "accept" }),
  Object.freeze({ id: "h02", invariant: "state-derived-from-canonical-sequence", state: {}, input: [{ id: "m", seq: 2, op: "SET", v: 5 }, { id: "m", seq: 1, op: "SET", v: 4 }, { id: "n", seq: 0, op: "SET", v: 1 }], expect: "accept" }),
  Object.freeze({ id: "h03", invariant: "state-derived-from-canonical-sequence", state: {}, input: [{ id: "z", seq: 1, op: "SET", v: 2 }, { id: "z", seq: 0, op: "SET", v: 1 }], expect: "accept" }),
  Object.freeze({ id: "h04", invariant: "conflicting-position-rejected", state: { keep: 1 }, input: [{ id: "q", seq: 0, op: "SET", v: 1 }, { id: "r", seq: 0, op: "SET", v: 2 }], expect: "reject" }),
  Object.freeze({ id: "h05", invariant: "sequence-gap-rejected", state: { keep: 1 }, input: [{ id: "r", seq: 0, op: "SET", v: 1 }, { id: "s", seq: 3, op: "SET", v: 2 }], expect: "reject" }),
  Object.freeze({ id: "h06", invariant: "sequence-gap-rejected", state: { keep: 1 }, input: [{ id: "t", seq: 5, op: "SET", v: 1 }], expect: "reject" }),
  Object.freeze({ id: "h07", invariant: "tombstone-dominates-older-writes", state: {}, input: [{ id: "u", seq: 0, op: "SET", v: 1 }, { id: "u", seq: 1, op: "DELETE" }, { id: "v", seq: 2, op: "SET", v: 7 }], expect: "accept" }),
  Object.freeze({ id: "h08", invariant: "exact-replay-is-idempotent", state: {}, input: [{ id: "p", seq: 0, op: "SET", data: [1, 2] }, { id: "p", seq: 0, op: "SET", data: [1, 2] }], expect: "accept" }),
  Object.freeze({ id: "h09", invariant: "state-derived-from-canonical-sequence", state: { seed: true }, input: [{ id: "cc", seq: 2, op: "SET", v: 1 }, { id: "cc", seq: 0, op: "SET", v: 2 }, { id: "cc", seq: 1, op: "DELETE" }], expect: "accept" }),
  Object.freeze({ id: "h10", invariant: "exact-replay-is-idempotent", state: {}, input: [{ id: "j", seq: 0, op: "SET", v: 1 }, { id: "j", seq: 1, op: "DELETE" }, { id: "j", seq: 1, op: "DELETE" }], expect: "accept" }),
  Object.freeze({ id: "h11", invariant: "identity-shape-validated", state: { keep: 1 }, input: [{ id: "k", seq: -1, op: "SET", v: 1 }], expect: "reject" }),
  Object.freeze({ id: "h12", invariant: "tombstone-dominates-older-writes", state: { a: 1, b: 2 }, input: [{ id: "b", seq: 0, op: "DELETE" }], expect: "accept" }),
  // REJECTION MUST NOT MUTATE: the state is non-empty and the log turns invalid part-way through.
  Object.freeze({ id: "h13", invariant: "rejection-leaves-state-untouched", state: { keep: 1, other: 2 }, input: [{ id: "ok", seq: 0, op: "SET", v: 1 }, { id: "bad", seq: 2, op: "SET", v: 2 }], expect: "reject" }),
  Object.freeze({ id: "h14", invariant: "rejection-leaves-state-untouched", state: { keep: 1 }, input: [{ id: "ok", seq: 0, op: "SET", v: 1 }, { id: "ok", seq: 1, op: "DELETE" }, { id: "dup", seq: 0, op: "SET", v: 9 }], expect: "reject" }),
  Object.freeze({ id: "h15", invariant: "rejection-leaves-state-untouched", state: { a: 1 }, input: [{ id: "a", seq: 0, op: "SET", v: 2 }, { id: "a", seq: 0, op: "SET", v: 3 }], expect: "reject" }),
]);

export function firstDifference(left, right, path = "") {
  if (canonical(left) === canonical(right)) return null;
  const both = left !== null && right !== null && typeof left === "object" && typeof right === "object" && !Array.isArray(left) && !Array.isArray(right);
  if (both) {
    for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) {
      const inner = firstDifference(left[key], right[key], path === "" ? key : `${path}.${key}`);
      if (inner !== null) return inner;
    }
  }
  return path === "" ? "(root)" : path;
}

/**
 * Judge ONE case.
 *
 * The candidate is given a FRESH COPY of the case's caller state, so a mutation it performs cannot leak
 * into the next case. For a rejection the copy is compared against the original: any difference is the
 * state-integrity violation, reported as its own named class rather than folded into a generic failure.
 */
export function judgeCase(apply, testCase) {
  const callerState = { ...testCase.state };
  const before = canonical(callerState);
  let outcome;
  try {
    apply(callerState, testCase.input);
    outcome = { kind: "returned" };
  } catch (error) {
    outcome = { kind: "threw", code: error?.code ?? error?.name ?? "Error" };
  }
  const invariant = testCase.invariant;

  if (testCase.expect === "reject") {
    if (outcome.kind === "returned") {
      return { id: testCase.id, invariant, pass: false, failureClass: "ACCEPTED_INVALID_HISTORY", detail: canonical(callerState).slice(0, 120) };
    }
    if (canonical(callerState) !== before) {
      return { id: testCase.id, invariant, pass: false, failureClass: "MUTATED_STATE_BEFORE_REJECTING", detail: `the caller's state changed from ${before} to ${canonical(callerState)}` };
    }
    return { id: testCase.id, invariant, pass: true, failureClass: null, detail: "" };
  }

  if (outcome.kind === "threw") return { id: testCase.id, invariant, pass: false, failureClass: "REJECTED_BUT_SHOULD_ACCEPT", detail: outcome.code };
  if (digestOf(callerState) !== testCase.digest) {
    return { id: testCase.id, invariant, pass: false, failureClass: "WRONG_STATE", detail: `first difference at ${firstDifference(callerState, testCase.expected)}` };
  }
  return { id: testCase.id, invariant, pass: true, failureClass: null, detail: "" };
}

/** Attach the reference result and digest to each case. `invariant` is retained for the teacher/tests. */
export function materialize(cases) {
  return cases.map((testCase) => {
    if (testCase.expect !== "accept") return { id: testCase.id, invariant: testCase.invariant, state: testCase.state, input: testCase.input, expect: testCase.expect };
    const expected = applyEventStreamReference({ ...testCase.state }, testCase.input);
    return { id: testCase.id, invariant: testCase.invariant, state: testCase.state, input: testCase.input, expect: testCase.expect, digest: digestOf(expected), expected };
  });
}

/**
 * The WORKER-VISIBLE form: the case, the caller's state, and — for accepted cases — the expected state
 * afterwards. No invariant name, no rule text.
 */
export function materializeVisible(cases) {
  return materialize(cases).map((entry) => {
    const { invariant: _invariant, ...visible } = entry;
    return visible;
  });
}

export function runCases(apply, cases) {
  const results = cases.map((testCase) => judgeCase(apply, testCase));
  return { results, passed: results.filter((r) => r.pass).length, total: results.length };
}
