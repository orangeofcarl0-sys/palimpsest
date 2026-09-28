#!/usr/bin/env node
/**
 * R1-R §21 — THE PRE-PAID COGNITIVE MISTAKE, AND HOW ITS RECURRENCE IS MEASURED.
 *
 * §21 asks each scenario to define ONE pre-paid cognitive mistake and measure its RECURRENCE, and §5 of
 * the parent protocol forbids detecting it from private reasoning. So a detector here is BEHAVIOURAL:
 * it runs the candidate against a small DIAGNOSTIC PROBE whose only purpose is to separate "this
 * implementation has the ordering wrong" from "this implementation failed some case".
 *
 * The distinction matters because §20 records known-failure recurrence as its OWN outcome, separate
 * from final acceptance. An implementation can pass acceptance and still have the ordering wrong on
 * inputs the oracle does not exercise; an implementation can fail acceptance for a reason that is not
 * this mistake at all.
 *
 * WHY THE PROBES ARE NARROW. Each probe is chosen so that ONLY the ordering mistake produces the
 * observed signal, and so that the CORRECT method passes it:
 *
 *   B  a document carrying an explicitly absent optional value. A migration that applies defaults
 *      before validating the legacy document REPAIRS the absent value into a default and returns a
 *      document; a migration that validates the legacy document first REFUSES it. The probe is not in
 *      the visible or hidden case lists, so it cannot be answered by memorising those.
 *
 *   C  a valid history presented in a non-canonical array order, plus a history that is not
 *      replayable. A reducer that establishes replay validity before mutating returns the canonical
 *      state regardless of array order and refuses the invalid history; a reducer that mutates as it
 *      validates returns an order-dependent state or accepts the invalid history.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

/* ---------------------------------------------------------------- scenario B */

/**
 * B's mistake: `transform/default before legacy ambiguity validation`.
 *
 * The fingerprint is a document whose optional setting is explicitly present but not a usable value.
 * `??` treats `null` as absent and substitutes the new-format default; a migration that validated the
 * legacy document first would have refused the value instead of repairing it.
 */
export const B_PROBES = Object.freeze([
  Object.freeze({ id: "p01", why: "an explicitly null optional setting must be refused, not repaired by a default", input: { name: "probe-a", endpoint: "https://probe-a", retry: null }, expect: "reject" }),
  Object.freeze({ id: "p02", why: "an explicitly null timeout must be refused, not repaired by a default", input: { name: "probe-b", endpoint: "https://probe-b", timeout: null }, expect: "reject" }),
  Object.freeze({ id: "p03", why: "a non-integer retry must be refused rather than defaulted away", input: { name: "probe-c", endpoint: "https://probe-c", retry: "many" }, expect: "reject" }),
]);

/**
 * B's detector: did the candidate RETURN a document for any probe the legacy contract requires it to
 * refuse? That is the ordering mistake showing itself — a default was applied to content that had not
 * been validated.
 */
export function detectB(migrate) {
  const violations = [];
  for (const probe of B_PROBES) {
    let outcome;
    try {
      outcome = { kind: "returned", value: migrate(probe.input) };
    } catch (error) {
      outcome = { kind: "threw", code: error?.code ?? error?.name ?? "Error" };
    }
    if (probe.expect === "reject" && outcome.kind === "returned") {
      violations.push({ probe: probe.id, why: probe.why, returned: JSON.stringify(outcome.value) });
    }
  }
  return Object.freeze({
    detector: "defaultsAppliedBeforeLegacyValidation",
    recurred: violations.length > 0,
    violations: Object.freeze(violations),
    probesRun: B_PROBES.length,
  });
}

/* ---------------------------------------------------------------- scenario C */

/**
 * C's probes: a valid log in a NON-canonical array order, logs that are not replayable, and — the
 * decisive one — a log that turns invalid part-way through while the caller's state is non-empty.
 *
 * Each probe runs against a FRESH caller state and checks two things a mutate-as-you-validate
 * implementation fails: whether the log was refused at all, and whether the caller's state survived.
 */
export const C_PROBES = Object.freeze([
  Object.freeze({ id: "p01", why: "the same valid log in a different array order must yield the same state", state: { seed: 0 }, input: [{ id: "a", seq: 1, op: "SET", v: 9 }, { id: "a", seq: 0, op: "SET", v: 1 }], expect: "accept", canonical: [{ id: "a", seq: 0, op: "SET", v: 1 }, { id: "a", seq: 1, op: "SET", v: 9 }] }),
  Object.freeze({ id: "p02", why: "a log whose sequence is not continuous must be refused", state: { keep: 1 }, input: [{ id: "a", seq: 0, op: "SET", v: 1 }, { id: "b", seq: 2, op: "SET", v: 2 }], expect: "reject" }),
  Object.freeze({ id: "p03", why: "an older write arriving after a tombstone must not resurrect the entity", state: {}, input: [{ id: "a", seq: 1, op: "DELETE" }, { id: "a", seq: 0, op: "SET", v: 1 }], expect: "accept", canonical: [{ id: "a", seq: 0, op: "SET", v: 1 }, { id: "a", seq: 1, op: "DELETE" }] }),
  Object.freeze({ id: "p04", why: "two different events claiming one position must be refused", state: { keep: 1 }, input: [{ id: "a", seq: 0, op: "SET", v: 1 }, { id: "b", seq: 0, op: "SET", v: 2 }], expect: "reject" }),
  Object.freeze({ id: "p05", why: "a log that turns invalid part-way through must leave the caller's state untouched", state: { untouched: "sentinel" }, input: [{ id: "ok", seq: 0, op: "SET", v: 1 }, { id: "bad", seq: 3, op: "SET", v: 2 }], expect: "reject" }),
]);

/**
 * C's detector. Four signals, all of which mean application was entangled with replay validation:
 *
 *   (a) a log that is not replayable was APPLIED;
 *   (b) a VALID log was REFUSED merely because the array order was not canonical;
 *   (c) the same valid log in a different array order produced a DIFFERENT state;
 *   (d) a refused log MUTATED the caller's state — the directly observable form of the mistake.
 */
export function detectC(apply) {
  const violations = [];
  for (const probe of C_PROBES) {
    const state = { ...probe.state };
    const before = JSON.stringify(state);
    let outcome;
    try {
      apply(state, probe.input);
      outcome = { kind: "returned" };
    } catch (error) {
      outcome = { kind: "threw", code: error?.code ?? error?.name ?? "Error" };
    }
    const mutated = JSON.stringify(state) !== before;

    if (probe.expect === "reject") {
      if (outcome.kind === "returned") violations.push({ probe: probe.id, why: probe.why, returned: JSON.stringify(state) });
      else if (mutated) violations.push({ probe: probe.id, why: `${probe.why} — the caller's state was mutated before the rejection (${before} -> ${JSON.stringify(state)})`, returned: JSON.stringify(state) });
      continue;
    }
    // `expect === "accept"`: the log is valid, so it must be ACCEPTED and must not depend on array order.
    if (outcome.kind === "threw") {
      violations.push({ probe: probe.id, why: `${probe.why} — the valid log was refused (${outcome.code}) because of the array order`, returned: `refused:${outcome.code}` });
      continue;
    }
    const canonicalState = { ...probe.state };
    let canonicalResult;
    try {
      apply(canonicalState, probe.canonical);
      canonicalResult = JSON.stringify(canonicalState);
    } catch (error) {
      violations.push({ probe: probe.id, why: `${probe.why} — the canonical order itself was refused (${error?.code ?? error?.name ?? "Error"})`, returned: JSON.stringify(state) });
      continue;
    }
    if (canonicalResult !== JSON.stringify(state)) {
      violations.push({ probe: probe.id, why: probe.why, returned: `${JSON.stringify(state)} != canonical ${canonicalResult}` });
    }
  }
  return Object.freeze({
    detector: "reducedBeforeWholeHistoryValidation",
    recurred: violations.length > 0,
    violations: Object.freeze(violations),
    probesRun: C_PROBES.length,
  });
}

/** Dispatch by scenario id. */
export function detectKnownFailure(scenarioId, fn) {
  if (scenarioId === "B") return detectB(fn);
  if (scenarioId === "C") return detectC(fn);
  throw new Error(`no known-failure detector for scenario ${scenarioId}`);
}
