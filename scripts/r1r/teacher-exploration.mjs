/**
 * R1-R §8 — TEACHER / CAPITAL GENERATION (BOTH PRIMARY SCENARIOS).
 *
 * §8 forbids authoring "the perfect Procedure" from the scenario specification. The Procedure must be
 * TRACEABLE TO ACTUAL PRIOR-GENERATION OBSERVATIONS. So this script does not write a Procedure: it
 * RUNS a deterministic prior-generation exploration against the REAL black-box oracle, records what
 * each generation actually observed, and returns those observations. The capital documents are then
 * derived from that record, and the Procedure's clause list is the ordered method the generations
 * actually had to discover — in the order the observations forced.
 *
 * WHAT "DETERMINISTIC PRIOR-GENERATION EXPLORATION" MEANS HERE, HONESTLY. The exploration is a
 * SCRIPTED sequence of candidate implementations, not a stochastic model call. Each generation is a
 * plausible next move for an engineer who has just seen the previous generation's failure classes. It
 * is deterministic so the capital is reproducible, and it is a genuine exploration because every
 * recorded observation below is the oracle's REAL output for the REAL candidate — not a narrative.
 * A stochastic teacher would add sampling noise without adding grounding; the grounding comes from the
 * oracle, and the oracle is the same one the workers will be judged by.
 *
 * The generations are deliberately NOT the mature implementation. They are what an engineer writes
 * while discovering, in order, that (a) unknown fields must be refused, (b) duplicate spellings must
 * be compared, (c) the legacy document must be validated before defaults are applied.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { REPO_ROOT } from "./amendment.mjs";

const scenarioB = await import(pathToFileURL(join(REPO_ROOT, "scripts", "r1r", "fixtures", "scenario-b", "acceptance.mjs")).href);
const scenarioC = await import(pathToFileURL(join(REPO_ROOT, "scripts", "r1r", "fixtures", "scenario-c", "acceptance.mjs")).href);

/* ================================================================ SCENARIO B */

/**
 * Generation B0 — the starting point, reproduced inline so the exploration is self-contained.
 * (It is the same logic as `fixtures/scenario-b/src/config.ts`; asserted equal by the test suite.)
 */
function b0(input) {
  const err = (code, message) => Object.assign(new Error(message), { code });
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw err("INVALID_INPUT", "the configuration must be a plain object");
  const name = input["name"] ?? input["service_name"] ?? input["title"];
  const endpoint = input["endpoint"] ?? input["url"] ?? input["base_url"] ?? input["host"];
  const retry = input["retry"] ?? input["retries"] ?? input["retryCount"] ?? input["attempts"];
  const timeout = input["timeout"] ?? input["timeout_ms"] ?? input["timeoutMs"];
  const v2 = {
    schemaVersion: 2,
    service: { name: typeof name === "string" ? name : "", endpoint: typeof endpoint === "string" ? endpoint : "" },
    policy: { retries: typeof retry === "number" ? retry : 3, timeoutMs: typeof timeout === "number" ? timeout : 30_000 },
  };
  if (v2.service.name === "") throw err("INVALID_NAME", "the service name must be a non-empty string");
  if (v2.service.endpoint === "") throw err("INVALID_ENDPOINT", "the endpoint must be a non-empty string");
  return v2;
}

/**
 * Generation B1 — the engineer adds RANGE validation, because B0's failures showed accepted documents
 * that should have been refused. But the ranges are checked only for the fields that were PRESENT, and
 * the check still happens after the fields have been coalesced — so a document whose settings are all
 * absent still migrates instead of being refused.
 */
function b1(input) {
  const err = (code, message) => Object.assign(new Error(message), { code });
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw err("INVALID_INPUT", "the configuration must be a plain object");
  const name = input["name"] ?? input["service_name"] ?? input["title"];
  const endpoint = input["endpoint"] ?? input["url"] ?? input["base_url"] ?? input["host"];
  const retry = input["retry"] ?? input["retries"] ?? input["retryCount"] ?? input["attempts"];
  const timeout = input["timeout"] ?? input["timeout_ms"] ?? input["timeoutMs"];
  if (typeof name !== "string" || name.length === 0) throw err("INVALID_NAME", "the service name must be a non-empty string");
  if (typeof endpoint !== "string" || endpoint.length === 0) throw err("INVALID_ENDPOINT", "the endpoint must be a non-empty string");
  if (retry !== undefined && (!Number.isInteger(retry) || retry < 0 || retry > 10)) throw err("INVALID_RETRY", "retries must be an integer between 0 and 10");
  if (timeout !== undefined && (!Number.isInteger(timeout) || timeout < 1 || timeout > 600_000)) throw err("INVALID_TIMEOUT", "the timeout must be an integer between 1 and 600000 milliseconds");
  return { schemaVersion: 2, service: { name, endpoint }, policy: { retries: retry ?? 3, timeoutMs: timeout ?? 30_000 } };
}

/**
 * Generation B2 — the engineer notices that a document naming a setting the contract does not define is
 * being accepted, and that `??` silently DISCARDS a second spelling that disagrees. It adds both checks
 * — but still compares RAW keys, so `retryCount` and `retry_count` are treated as two different fields.
 */
function b2(input) {
  const err = (code, message) => Object.assign(new Error(message), { code });
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw err("INVALID_INPUT", "the configuration must be a plain object");
  const pairs = [["name", ["name", "service_name", "title"]], ["endpoint", ["endpoint", "url", "base_url", "host"]], ["retry", ["retry", "retries", "retryCount", "attempts"]], ["timeout", ["timeout", "timeout_ms", "timeoutMs"]]];
  const known = new Set(pairs.flatMap(([, spellings]) => spellings));
  for (const key of Object.keys(input)) if (!known.has(key)) throw err("UNKNOWN_KEY", `unknown configuration field "${key}"`);
  const chosen = new Map();
  for (const [field, spellings] of pairs) {
    const present = spellings.filter((spelling) => Object.hasOwn(input, spelling));
    if (present.length > 1) {
      const values = present.map((spelling) => JSON.stringify(input[spelling]));
      if (new Set(values).size > 1) throw err("AMBIGUOUS_ALIAS", `two aliases of "${field}" disagree`);
    }
    if (present.length > 0) chosen.set(field, input[present[0]]);
  }
  const name = chosen.get("name");
  const endpoint = chosen.get("endpoint");
  const retry = chosen.get("retry");
  const timeout = chosen.get("timeout");
  if (typeof name !== "string" || name.length === 0) throw err("INVALID_NAME", "the service name must be a non-empty string");
  if (typeof endpoint !== "string" || endpoint.length === 0) throw err("INVALID_ENDPOINT", "the endpoint must be a non-empty string");
  if (retry !== undefined && (!Number.isInteger(retry) || retry < 0 || retry > 10)) throw err("INVALID_RETRY", "retries must be an integer between 0 and 10");
  if (timeout !== undefined && (!Number.isInteger(timeout) || timeout < 1 || timeout > 600_000)) throw err("INVALID_TIMEOUT", "the timeout must be an integer between 1 and 600000 milliseconds");
  return { schemaVersion: 2, service: { name, endpoint }, policy: { retries: retry ?? 3, timeoutMs: timeout ?? 30_000 } };
}

/**
 * Generation B3 — the engineer discovers that spellings must be NORMALIZED before they are compared,
 * and that an unrecognized field is not silently ignorable. The method is now the mature one.
 */
function b3(input) {
  return scenarioB.migrateConfigReference(input);
}

export const SCENARIO_B_GENERATIONS = Object.freeze([
  Object.freeze({ id: "B0", note: "the starting point: coalesce spellings with ?? and fill defaults", migrate: b0 }),
  Object.freeze({ id: "B1", note: "add range validation after coalescing", migrate: b1 }),
  Object.freeze({ id: "B2", note: "refuse two RAW spellings that disagree", migrate: b2 }),
  Object.freeze({ id: "B3", note: "normalize spellings, reject unknown fields, validate legacy before defaults", migrate: b3 }),
]);

/* ================================================================ SCENARIO C */

/**
 * Generation C0 — the starting point, reproduced inline so the exploration is self-contained.
 * (The same logic as `fixtures/scenario-c/src/reducer.ts`.)
 */
function c0(state, events) {
  const err = (code, message) => Object.assign(new Error(message), { code });
  for (const event of events) {
    if (event === null || typeof event !== "object") throw err("INVALID_EVENT", "every event must be an object");
    if (typeof event.id !== "string" || event.id.length === 0) throw err("INVALID_IDENTITY", "every event must carry a non-empty string id");
    if ((event.op ?? event.kind ?? "SET") === "DELETE") delete state[event.id];
    else state[event.id] = event.v ?? event.value ?? event.payload ?? event.data ?? null;
  }
  return state;
}

/**
 * Generation C1 — the engineer adds per-event shape validation, but still inside the loop, so an
 * invalid log has already been partly applied by the time it is refused.
 */
function c1(state, events) {
  const err = (code, message) => Object.assign(new Error(message), { code });
  for (const event of events) {
    if (event === null || typeof event !== "object") throw err("INVALID_EVENT", "every event must be an object");
    if (typeof event.id !== "string" || event.id.length === 0) throw err("INVALID_IDENTITY", "every event must carry a non-empty string id");
    if (!Number.isInteger(event.seq) || event.seq < 0) throw err("INVALID_SEQUENCE", "every event must carry a non-negative integer seq");
    if ((event.op ?? event.kind ?? "SET") === "DELETE") delete state[event.id];
    else state[event.id] = event.v ?? event.value ?? event.payload ?? event.data ?? null;
  }
  return state;
}

/**
 * Generation C2 — the engineer discovers that the caller's array order is not the log's order, and
 * sorts by position first. But validation is still interleaved with application, so a rejected log
 * still leaves the caller's state partly mutated.
 */
function c2(state, events) {
  const err = (code, message) => Object.assign(new Error(message), { code });
  const ordered = [...events].sort((left, right) => left.seq - right.seq);
  for (const event of ordered) {
    if (event === null || typeof event !== "object") throw err("INVALID_EVENT", "every event must be an object");
    if (typeof event.id !== "string" || event.id.length === 0) throw err("INVALID_IDENTITY", "every event must carry a non-empty string id");
    if (!Number.isInteger(event.seq) || event.seq < 0) throw err("INVALID_SEQUENCE", "every event must carry a non-negative integer seq");
    if ((event.op ?? event.kind ?? "SET") === "DELETE") delete state[event.id];
    else state[event.id] = event.v ?? event.value ?? event.payload ?? event.data ?? null;
  }
  return state;
}

/** Generation C3 — the engineer moves ALL validation before ANY mutation. The method is now mature. */
function c3(state, events) {
  return scenarioC.applyEventStreamReference(state, events);
}

export const SCENARIO_C_GENERATIONS = Object.freeze([
  Object.freeze({ id: "C0", note: "the starting point: apply in the caller's order, validating as it goes", reduce: c0 }),
  Object.freeze({ id: "C1", note: "add per-event shape validation inside the loop", reduce: c1 }),
  Object.freeze({ id: "C2", note: "sort by log position before applying", reduce: c2 }),
  Object.freeze({ id: "C3", note: "validate the whole log before any mutation", reduce: c3 }),
]);

/* ================================================================ the exploration */

/**
 * Run one scenario's generations against the REAL oracle and record what each generation OBSERVED.
 *
 * The record is the grounding: `observations[g]` is the oracle's own output for generation g, and
 * `discoveries[g]` names the invariant the engineer could infer from those failures and nothing else.
 */
export function explore(input) {
  const { generations, runCases, cases, key } = input;
  const observations = [];
  const discoveries = [];
  for (const generation of generations) {
    const fn = generation.migrate ?? generation.reduce;
    const outcome = runCases(fn, cases);
    const failed = outcome.results.filter((result) => !result.pass);
    const classes = [...new Set(failed.map((result) => result.failureClass))].sort();
    observations.push(
      Object.freeze({
        generation: generation.id,
        note: generation.note,
        passed: outcome.passed,
        total: outcome.total,
        failedCaseIds: Object.freeze(failed.map((result) => result.id)),
        failureClasses: Object.freeze(classes),
        /**
         * §8: the INVARIANTS the failures actually exercised. This is what makes the discovery
         * traceable — the clause is inferred from which properties broke, not from the scenario spec.
         */
        failedInvariants: Object.freeze([...new Set(failed.map((result) => result.invariant))].sort()),
        // The oracle's OWN detail strings — the raw observation the discovery is derived from.
        details: Object.freeze(failed.map((result) => `${result.id} ${result.invariant} ${result.failureClass} ${result.detail}`.trim())),
      }),
    );
    discoveries.push(inferDiscovery(key, generation.id, classes, failed));
  }
  return Object.freeze({
    scenario: key,
    generations: Object.freeze(generations.map((generation) => generation.id)),
    observations: Object.freeze(observations),
    discoveries: Object.freeze(discoveries),
  });
}

/**
 * The discovery a generation's OWN observed failures force (§8).
 *
 * This reads the FAILED INVARIANTS — the properties the oracle's cases actually exercised — and maps
 * them to the clause an engineer could infer from those failures and nothing else. The mapping is
 * ordered by the invariant set so that a generation whose failures are narrower than its predecessor's
 * yields a correspondingly narrower clause; that is what makes the ordered method TRACEABLE rather than
 * authored.
 */
function inferDiscovery(key, generationId, classes, failed) {
  if (failed.length === 0) {
    return Object.freeze({
      generation: generationId,
      discovery: "the oracle accepts this candidate",
      forcedBy: Object.freeze([]),
      detail: "no failures remained at this generation, so it became the method the capital records",
    });
  }
  const invariants = [...new Set(failed.map((result) => result.invariant))].sort();
  const detail = failed.map((result) => `${result.id}:${result.invariant}:${result.failureClass}`).join(", ");
  const clause = DISCOVERY_BY_INVARIANT[key];
  const discovered = invariants.map((invariant) => clause[invariant] ?? `an unrecognized property failed (${invariant})`);
  return Object.freeze({
    generation: generationId,
    discovery: discovered.join("; and "),
    forcedBy: Object.freeze(invariants),
    detail,
  });
}

/**
 * The invariant → clause mapping. Each clause is the SMALLEST statement the observation supports: it
 * says what must be true, not how to implement it, which is what §9 requires of a Procedure clause.
 */
const DISCOVERY_BY_INVARIANT = Object.freeze({
  B: Object.freeze({
    "legacy-document-accepted": "a well-formed legacy document must migrate without being rejected",
    "aliases-recognized": "a legacy spelling must be recognized as naming its setting, which requires comparing spellings by their NORMALIZED form rather than by their literal key",
    "new-format-defaults": "a new-format default may be applied only after the legacy document has been validated",
    "retry-range-validated": "the legacy retry setting must be validated, not passed through",
    "timeout-range-validated": "the legacy timeout setting must be validated, not passed through",
    "required-fields-validated": "the legacy document must be validated before it is migrated",
    "unknown-fields-refused": "a field the legacy contract does not define must be refused, not ignored",
    "conflicting-aliases-rejected": "two spellings of one setting that disagree must be refused rather than silently resolved",
    "normalized-key-collision-rejected": "spellings must be compared by their NORMALIZED form, so that two spellings of one setting that disagree are refused rather than silently resolved",
    /** The pre-paid mistake, as the observation that forces its clause. */
    "defaults-applied-before-legacy-validation": "an explicitly present but unusable setting must be refused; applying a new-format default to it repairs input the legacy document never validated",
  }),
  C: Object.freeze({
    "deterministic-state": "the state a log implies must not depend on anything but the log",
    "tombstone-dominates-older-writes": "a delete must dominate older writes and must not be undone by an older write applied later",
    "state-derived-from-canonical-sequence": "state must be derived from the log's own sequence order, not from the order the array arrived in",
    "exact-replay-is-idempotent": "an exact replay of an event must leave the state unchanged",
    "conflicting-position-rejected": "two different events claiming one position must be refused",
    "sequence-gap-rejected": "sequence continuity must be validated across the whole log, before any state is mutated",
    "identity-shape-validated": "every event's identity and sequence must be validated before anything is applied",
    "rejection-leaves-state-untouched": "a rejected log must leave the caller's state exactly as it was, which requires all validation to happen before the first mutation",
  }),
});

/**
 * The exploration for both primary scenarios.
 *
 * THE EXPLORATION RUNS AGAINST THE HIDDEN ACCEPTANCE, and that is deliberate rather than a leak. The
 * teacher generation is the PRIOR GENERATION whose paid-for discoveries the capital records; §8 asks it
 * to "run a deterministic prior-generation exploration against the black-box oracle" and record "actual
 * failure observations". A teacher that could only see the basic visible contract could never have
 * discovered the non-obvious invariants the capital claims to encode, and the capital would be authored
 * rather than grounded.
 *
 * The WORKER's conditions are unaffected: a C0/C1/C2 trial sees only `test/cases.json` and the oracle,
 * exactly as before. The asymmetry is the point of the experiment — the worker either rediscovers the
 * method by reasoning, or inherits it.
 */
export function exploreAll() {
  return Object.freeze({
    B: explore({ key: "B", generations: SCENARIO_B_GENERATIONS, runCases: scenarioB.runCases, cases: scenarioB.materialize(scenarioB.HIDDEN_CASES) }),
    C: explore({ key: "C", generations: SCENARIO_C_GENERATIONS, runCases: scenarioC.runCases, cases: scenarioC.materialize(scenarioC.HIDDEN_CASES) }),
  });
}
