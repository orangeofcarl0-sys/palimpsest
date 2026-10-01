/**
 * R2-U §6/§10 — SCENARIO D, THE BLACK-BOX ORACLE THE WORKER MAY RUN.
 *
 * Copied into the worker's world. Judges the worker's `invalidateCache` against the VISIBLE case list
 * (`test/cases.json`) and reports, per case, only:
 *
 *   PASS  /  FAIL  <case id>  <failureClass>  <detail>
 *
 * Failure classes are NAMED so the worker can iterate without being told the rules:
 *   REJECTED_BUT_SHOULD_ACCEPT · WRONG_CACHE · ACCEPTED_INVALID_INPUT · MUTATED_CACHE_BEFORE_REJECTING
 *
 * The authoritative judgement is the HIDDEN case list, which lives outside this world.
 *
 * PLAIN JAVASCRIPT, runnable by the worker with: `node test/check.js`
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
/**
 * The candidate is loaded through a RELATIVE specifier, which resolves against THIS module's own URL —
 * an absolute path built with `join(...)` is rejected by the ESM loader on Windows
 * (ERR_UNSUPPORTED_ESM_URL_SCHEME).
 */
const { invalidateCache } = await import("../src/cache.ts");

const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
};
const digestOf = (value) => createHash("sha256").update(canonical(value)).digest("hex");

function firstDifference(left, right, path = "") {
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

const cases = JSON.parse(readFileSync(new URL("cases.json", import.meta.url), "utf8"));
let failures = 0;

for (const testCase of cases) {
  // A FRESH COPY of the caller's cache per case, so a candidate's mutation cannot leak between cases.
  const callerCache = structuredClone(testCase.cache);
  const before = canonical(callerCache);
  let outcome;
  try {
    invalidateCache(callerCache, testCase.changed);
    outcome = { kind: "returned" };
  } catch (error) {
    outcome = { kind: "threw", code: error?.code ?? error?.name ?? "Error" };
  }

  let pass = false;
  let failureClass = "";
  let detail = "";
  if (testCase.expect === "accept") {
    if (outcome.kind === "threw") {
      failureClass = "REJECTED_BUT_SHOULD_ACCEPT";
      detail = outcome.code;
    } else if (digestOf(callerCache) !== testCase.digest) {
      failureClass = "WRONG_CACHE";
      detail = `first difference at ${firstDifference(callerCache, testCase.expected)}`;
    } else pass = true;
  } else if (outcome.kind === "returned") {
    failureClass = "ACCEPTED_INVALID_INPUT";
    detail = canonical(callerCache).slice(0, 120);
  } else if (canonical(callerCache) !== before) {
    failureClass = "MUTATED_CACHE_BEFORE_REJECTING";
    detail = `the caller's cache changed from ${before} to ${canonical(callerCache)}`;
  } else pass = true;

  if (!pass) failures += 1;
  process.stdout.write(`${pass ? "PASS" : "FAIL"} ${testCase.id} ${failureClass} ${detail}`.trimEnd() + String.fromCharCode(10));
}

process.stdout.write(`${cases.length} cases, ${cases.length - failures} pass, ${failures} fail${String.fromCharCode(10)}`);
process.exit(failures === 0 ? 0 : 1);
