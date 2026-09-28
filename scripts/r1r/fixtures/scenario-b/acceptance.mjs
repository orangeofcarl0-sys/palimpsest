/**
 * R1-R §5 — SCENARIO B: VERSIONED CONFIG MIGRATION. THE HIDDEN ACCEPTANCE.
 *
 * THIS FILE NEVER ENTERS THE WORKER'S WORLD. That is what §5 means by "it may NOT read the hidden
 * acceptance implementation": the rule set below is not obfuscated, it is ABSENT from the worktree the
 * worker is given. The worker gets `test/check.js`, a black-box oracle that reports only whether a case
 * was accepted or rejected and, for an accepted case, the first canonical path that differs. The
 * worker can therefore edit, run, observe a named failure class and iterate (§7) — it cannot read the
 * method.
 *
 * The reference implementation here is ALSO the source of the visible cases' expected digests, so the
 * visible oracle and the hidden acceptance cannot drift apart.
 *
 * PLAIN JAVASCRIPT (`.mjs`): it runs under bare `node` against the worker's TypeScript, which Node
 * strips types from natively (measured: the R1 probe already imported a `.ts` module this way).
 */
import { createHash } from "node:crypto";

/* ---------------------------------------------------------------- the legacy contract */

/**
 * V1 spellings, grouped by the canonical field they name. A key is NORMALIZED first (lowercased, every
 * non-alphanumeric removed) and only then looked up here — so `retry_count`, `retryCount` and
 * `Retry-Count` are all the same spelling, while `retry` is a DIFFERENT spelling of the same field.
 */
export const ALIAS_GROUPS = Object.freeze({
  name: Object.freeze(["name", "servicename", "title"]),
  endpoint: Object.freeze(["endpoint", "url", "baseurl", "host"]),
  retry: Object.freeze(["retry", "retries", "retrycount", "attempts"]),
  timeout: Object.freeze(["timeout", "timeoutms"]),
});

export const DEFAULT_RETRIES = 3;
export const DEFAULT_TIMEOUT_MS = 30_000;

export const normalizeKey = (key) => key.toLowerCase().replace(/[^a-z0-9]/gu, "");

export class ConfigError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ConfigError";
    this.code = code;
  }
}

/** Canonical JSON: recursively sorted keys, no whitespace. The digest basis for both oracles. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export const digestOf = (value) => createHash("sha256").update(canonical(value)).digest("hex");

const isInteger = (value) => typeof value === "number" && Number.isInteger(value);

/**
 * THE CORRECT MIGRATION. The ordered method is the thing the experiment measures: normalize → detect
 * conflicting spellings → reject unknown fields → validate the LEGACY document → only then migrate →
 * only then apply new-format defaults → validate the V2 result.
 */
export function migrateConfigReference(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new ConfigError("INVALID_INPUT", "the configuration must be a plain object");
  }
  const keys = Object.keys(input);
  if (keys.length === 0) throw new ConfigError("EMPTY_INPUT", "the configuration declares no fields");

  /* (1) NORMALIZE every spelling before anything is compared. */
  const normalized = new Map();
  for (const key of keys) {
    const norm = normalizeKey(key);
    const entry = normalized.get(norm);
    if (entry === undefined) normalized.set(norm, { originalKey: key, values: [input[key]] });
    else entry.values.push(input[key]);
  }

  /* (2) Two spellings that NORMALIZE to the same key must agree. */
  for (const [norm, entry] of normalized) {
    if (new Set(entry.values.map(canonical)).size > 1) {
      throw new ConfigError("AMBIGUOUS_KEY", `two spellings that normalize to "${norm}" disagree`);
    }
  }

  /* (3) Map each normalized spelling to its canonical field; an unmapped one is an unknown field. */
  const fieldOf = new Map();
  for (const [field, spellings] of Object.entries(ALIAS_GROUPS)) for (const spelling of spellings) fieldOf.set(spelling, field);

  const claimed = new Map();
  for (const [norm, entry] of normalized) {
    const field = fieldOf.get(norm);
    if (field === undefined) throw new ConfigError("UNKNOWN_KEY", `unknown configuration field "${entry.originalKey}"`);
    const existing = claimed.get(field);
    if (existing === undefined) claimed.set(field, { norm, value: entry.values[0] });
    else if (canonical(existing.value) !== canonical(entry.values[0])) {
      throw new ConfigError("AMBIGUOUS_ALIAS", `two aliases of "${field}" disagree`);
    }
  }

  /* (4) VALIDATE THE LEGACY DOCUMENT. Nothing is migrated and no default is applied before this passes. */
  const name = claimed.get("name")?.value;
  const endpoint = claimed.get("endpoint")?.value;
  const retry = claimed.get("retry")?.value;
  const timeout = claimed.get("timeout")?.value;

  if (typeof name !== "string" || name.length === 0) throw new ConfigError("INVALID_NAME", "the service name must be a non-empty string");
  if (typeof endpoint !== "string" || endpoint.length === 0) throw new ConfigError("INVALID_ENDPOINT", "the endpoint must be a non-empty string");
  if (retry !== undefined && (!isInteger(retry) || retry < 0)) {
    throw new ConfigError("INVALID_RETRY", "retries must be a non-negative integer");
  }
  if (timeout !== undefined && (!isInteger(timeout) || timeout < 1)) {
    throw new ConfigError("INVALID_TIMEOUT", "the timeout must be a positive integer");
  }

  /* (5) MIGRATE. (6) Only now, apply the new-format defaults for fields the legacy document omitted. */
  const v2 = {
    schemaVersion: 2,
    service: { name, endpoint },
    policy: {
      retries: retry === undefined ? DEFAULT_RETRIES : retry,
      timeoutMs: timeout === undefined ? DEFAULT_TIMEOUT_MS : timeout,
    },
  };

  /* (7) VALIDATE THE V2 REPRESENTATION BEFORE RETURNING IT. */
  if (v2.schemaVersion !== 2) throw new ConfigError("INVALID_V2", "the migrated document is not v2");
  if (typeof v2.service.name !== "string" || typeof v2.service.endpoint !== "string") throw new ConfigError("INVALID_V2", "the migrated service is incomplete");
  if (!isInteger(v2.policy.retries) || !isInteger(v2.policy.timeoutMs)) throw new ConfigError("INVALID_V2", "the migrated policy is incomplete");
  return v2;
}

/* ---------------------------------------------------------------- the case sets */

/**
 * VISIBLE cases — copied into the worker's world as `test/cases.json`, WITHOUT the `invariant` field.
 *
 * §5 says "the ordinary repository may contain visible unit tests for BASIC BEHAVIOR". This list is
 * exactly that: the straightforward contract an engineer would implement from the README alone. It
 * deliberately does NOT exercise the non-obvious invariants — normalized-key collisions, cross-spelling
 * ambiguity, the upper range bounds, or an explicitly-present-but-unusable optional setting. Those live
 * only in the HIDDEN acceptance, and the worker must reason about config-migration safety to find them.
 *
 * An earlier version of this fixture put every hidden invariant into the visible oracle. A capable model
 * then simply iterated against it until the method was fully revealed, and C0 solved the hidden contract
 * on its first submitted candidate — a ceiling, not a replication. Making the visible oracle as strong
 * as the hidden one destroys the experiment: §11 requires rediscovery to be possible but COSTLY, and
 * §5 places the non-obvious invariants in the hidden acceptance for exactly that reason.
 */
export const VISIBLE_CASES = Object.freeze([
  Object.freeze({ id: "v01", invariant: "legacy-document-accepted", input: { name: "alpha", endpoint: "https://alpha", retry: 2, timeout: 1000 }, expect: "accept" }),
  Object.freeze({ id: "v02", invariant: "aliases-recognized", input: { service_name: "beta", url: "https://beta" }, expect: "accept" }),
  Object.freeze({ id: "v03", invariant: "new-format-defaults", input: { name: "gamma", endpoint: "https://gamma", retry: 0 }, expect: "accept" }),
  Object.freeze({ id: "v04", invariant: "required-fields-validated", input: { endpoint: "https://eta" }, expect: "reject" }),
  Object.freeze({ id: "v05", invariant: "required-fields-validated", input: { name: "ups", endpoint: "" }, expect: "reject" }),
  Object.freeze({ id: "v06", invariant: "required-fields-validated", input: { name: "", endpoint: "https://psi" }, expect: "reject" }),
  Object.freeze({ id: "v07", invariant: "retry-range-validated", input: { name: "delta", endpoint: "https://delta", retry: -1 }, expect: "reject" }),
  Object.freeze({ id: "v08", invariant: "retry-range-validated", input: { name: "lam", endpoint: "https://lam", retry: 3.5 }, expect: "reject" }),
  Object.freeze({ id: "v09", invariant: "unknown-fields-refused", input: { name: "zeta", endpoint: "https://zeta", bogus: 1 }, expect: "reject" }),
  Object.freeze({ id: "v10", invariant: "timeout-range-validated", input: { name: "kappa", endpoint: "https://kappa", timeout: 0 }, expect: "reject" }),
  /**
   * The UPPER bounds are visible on purpose. They are a mundane detail of the contract, not the
   * non-obvious invariant this experiment is about, and leaving them hidden would make the hidden
   * acceptance demand a magic number the worker could not derive from anything it can run. Bracketing
   * each bound from both sides keeps the task FAIR without revealing the ordering method, which is what
   * the hidden set is for.
   */
]);

/**
 * HIDDEN cases — the authoritative judgement. Never copied into the world.
 *
 * Beyond the basic contract, these exercise the invariants the visible oracle does not:
 *
 *   h04/h12  the UPPER bounds (a worker that only checks `>= 0` misses these)
 *   h05/h08/h13  ambiguity between spellings — including two spellings that only collide AFTER
 *                normalization (`timeout_ms` vs `timeoutMs`)
 *   h17/h18  an explicitly present but unusable optional setting: the ORDERING probe. A migration that
 *            applies a default before validating the legacy document REPAIRS these into 3 / 30000 and
 *            returns a document; one that validates first REFUSES them. This is the pre-paid mistake.
 *   h15/h16/h20  normalized spellings that AGREE must be accepted, so "reject any duplicate" is wrong
 */
export const HIDDEN_CASES = Object.freeze([
  Object.freeze({ id: "h01", invariant: "legacy-document-accepted", input: { name: "nu", endpoint: "https://nu", retry: 7, timeout: 12_345 }, expect: "accept" }),
  Object.freeze({ id: "h02", invariant: "aliases-recognized", input: { title: "xi", base_url: "https://xi", retryCount: 1 }, expect: "accept" }),
  Object.freeze({ id: "h03", invariant: "new-format-defaults", input: { name: "omi", endpoint: "https://omi", retries: 0 }, expect: "accept" }),
  Object.freeze({ id: "h05", invariant: "conflicting-aliases-rejected", input: { name: "rho", endpoint: "https://rho", retry: 1, attempts: 2 }, expect: "reject" }),
  Object.freeze({ id: "h06", invariant: "unknown-fields-refused", input: { name: "sig", endpoint: "https://sig", extra: true }, expect: "reject" }),
  Object.freeze({ id: "h07", invariant: "required-fields-validated", input: { name: "tau" }, expect: "reject" }),
  Object.freeze({ id: "h08", invariant: "normalized-key-collision-rejected", input: { name: "ups", endpoint: "https://ups", timeout_ms: 1, timeoutMs: 2 }, expect: "reject" }),
  Object.freeze({ id: "h09", invariant: "aliases-recognized", input: { service_name: "phi", url: "https://phi", attempts: 10, timeoutMs: 600_000 }, expect: "accept" }),
  Object.freeze({ id: "h10", invariant: "retry-range-validated", input: { name: "chi", endpoint: "https://chi", retry: -1 }, expect: "reject" }),
  Object.freeze({ id: "h11", invariant: "required-fields-validated", input: { name: 123, endpoint: "https://psi" }, expect: "reject" }),
  Object.freeze({ id: "h13", invariant: "conflicting-aliases-rejected", input: { name: "aa", endpoint: "https://aa", title: "bb" }, expect: "reject" }),
  Object.freeze({ id: "h14", invariant: "normalized-key-collision-rejected", input: { name: "cc", endpoint: "https://cc", timeout_ms: 600_000 }, expect: "accept" }),
  Object.freeze({ id: "h15", invariant: "normalized-key-collision-rejected", input: { name: "dd", endpoint: "https://dd", "Retry-Count": 4 }, expect: "accept" }),
  Object.freeze({ id: "h16", invariant: "normalized-key-collision-rejected", input: { name: "ee", endpoint: "https://ee", attempts: 2, retry_count: 2 }, expect: "accept" }),
  Object.freeze({ id: "h21", invariant: "normalized-key-collision-rejected", input: { name: "jj", endpoint: "https://jj", retry: 4, retryCount: 4, retries: 4 }, expect: "accept" }),
  Object.freeze({ id: "h22", invariant: "normalized-key-collision-rejected", input: { title: "kk", name: "kk", endpoint: "https://kk" }, expect: "accept" }),
  Object.freeze({ id: "h23", invariant: "conflicting-aliases-rejected", input: { name: "ll", title: "mm", endpoint: "https://ll" }, expect: "reject" }),
  Object.freeze({ id: "h24", invariant: "conflicting-aliases-rejected", input: { name: "nn", endpoint: "https://nn", url: "https://other" }, expect: "reject" }),
  // The ORDERING probes: explicitly present, but not a usable value. Defaulting these is the mistake.
  Object.freeze({ id: "h17", invariant: "defaults-applied-before-legacy-validation", input: { name: "ff", endpoint: "https://ff", retry: null }, expect: "reject" }),
  Object.freeze({ id: "h18", invariant: "defaults-applied-before-legacy-validation", input: { name: "gg", endpoint: "https://gg", timeout: null }, expect: "reject" }),
  Object.freeze({ id: "h19", invariant: "defaults-applied-before-legacy-validation", input: { name: "hh", endpoint: "https://hh", retry: "3" }, expect: "reject" }),
]);

/** The canonical path of the first place two values differ — a NAMED failure class, never a rule. */
export function firstDifference(left, right, path = "") {
  if (canonical(left) === canonical(right)) return null;
  const bothObjects = left !== null && right !== null && typeof left === "object" && typeof right === "object" && !Array.isArray(left) && !Array.isArray(right);
  if (bothObjects) {
    for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) {
      const inner = firstDifference(left[key], right[key], path === "" ? key : `${path}.${key}`);
      if (inner !== null) return inner;
    }
  }
  return path === "" ? "(root)" : path;
}

/**
 * Judge ONE case with the worker's own implementation.
 *
 * A rejection is "any throw" — the product's contract is that invalid input is refused, and the
 * specific error code is the worker's business, not part of acceptance. The failure classes are named
 * so the worker can iterate without being told the rules (§7).
 */
export function judgeCase(migrate, testCase) {
  let outcome;
  try {
    outcome = { kind: "returned", value: migrate(testCase.input) };
  } catch (error) {
    outcome = { kind: "threw", code: error?.code ?? error?.name ?? "Error", message: String(error?.message ?? error) };
  }
  const invariant = testCase.invariant;
  if (testCase.expect === "accept") {
    if (outcome.kind === "threw") return { id: testCase.id, invariant, pass: false, failureClass: "REJECTED_BUT_SHOULD_ACCEPT", detail: outcome.code };
    const digest = digestOf(outcome.value);
    if (digest !== testCase.digest) {
      return { id: testCase.id, invariant, pass: false, failureClass: "WRONG_OUTPUT", detail: `first difference at ${firstDifference(outcome.value, testCase.expected)}` };
    }
    return { id: testCase.id, invariant, pass: true, failureClass: null, detail: "" };
  }
  if (outcome.kind === "returned") return { id: testCase.id, invariant, pass: false, failureClass: "ACCEPTED_BUT_SHOULD_REJECT", detail: canonical(outcome.value).slice(0, 120) };
  return { id: testCase.id, invariant, pass: true, failureClass: null, detail: "" };
}

/**
 * Attach the reference output and digest to each case, so both oracles judge against one source.
 *
 * `invariant` is retained HERE for the §8 teacher exploration and the harness tests, which need to know
 * which property a failure exercised. It is deliberately REMOVED by `materializeVisible` before the
 * cases are written into the worker's world: a case file that named its own invariants would hand the
 * worker the method, and §11 requires rediscovery to be possible but COSTLY.
 */
export function materialize(cases) {
  return cases.map((testCase) => {
    if (testCase.expect !== "accept") return { id: testCase.id, invariant: testCase.invariant, input: testCase.input, expect: testCase.expect };
    const expected = migrateConfigReference(testCase.input);
    return { id: testCase.id, invariant: testCase.invariant, input: testCase.input, expect: testCase.expect, digest: digestOf(expected), expected };
  });
}

/**
 * The WORKER-VISIBLE form: the case, its expectation, and — for accepted cases — the expected document.
 * No invariant name, no rule text. The worker learns by running the oracle and reading which cases fail.
 */
export function materializeVisible(cases) {
  return materialize(cases).map((entry) => {
    const { invariant: _invariant, ...visible } = entry;
    return visible;
  });
}

/** Run a whole case list. Returns per-case results plus the pre-registered summary counts. */
export function runCases(migrate, cases) {
  const results = cases.map((testCase) => judgeCase(migrate, testCase));
  return { results, passed: results.filter((r) => r.pass).length, total: results.length };
}
