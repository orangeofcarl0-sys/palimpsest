/**
 * R1-R §5 — SCENARIO B, THE BLACK-BOX ORACLE THE WORKER MAY RUN.
 *
 * This file IS copied into the worker's world. It judges the worker's `migrateConfig` against the
 * VISIBLE case list (`test/cases.json`) and reports, per case, only:
 *
 *   PASS  /  FAIL  <case id>  <failureClass>  <detail>
 *
 * The failure classes are NAMED so a worker can iterate without being told the rules (§7):
 *   REJECTED_BUT_SHOULD_ACCEPT · WRONG_OUTPUT · ACCEPTED_BUT_SHOULD_REJECT
 *
 * It deliberately does NOT contain the rule set. The authoritative judgement is the HIDDEN case list,
 * which lives outside this world and which the worker cannot read (§5). Passing this file is
 * necessary and not sufficient — that is the whole point of a black-box acceptance.
 *
 * PLAIN JAVASCRIPT, runnable by the worker with: `node test/check.js`
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
/**
 * The candidate is loaded through a RELATIVE specifier, which resolves against THIS module's own URL.
 * An earlier version built an absolute path with `join(...)` and passed it to `import()`, which the ESM
 * loader rejects on Windows with ERR_UNSUPPORTED_ESM_URL_SCHEME ("Received protocol 'c:'") — so the
 * oracle was unrunnable inside the worker's world, a defect several workers reported rather than
 * silently worked around. The relative form is correct on every platform.
 */
const { migrateConfig } = await import("../src/config.ts");

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

const cases = JSON.parse(readFileSync(join(HERE, "cases.json"), "utf8"));
let failures = 0;

for (const testCase of cases) {
  let outcome;
  try {
    outcome = { kind: "returned", value: migrateConfig(testCase.input) };
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
    } else if (digestOf(outcome.value) !== testCase.digest) {
      failureClass = "WRONG_OUTPUT";
      detail = `first difference at ${firstDifference(outcome.value, testCase.expected)}`;
    } else pass = true;
  } else if (outcome.kind === "returned") {
    failureClass = "ACCEPTED_BUT_SHOULD_REJECT";
    detail = canonical(outcome.value).slice(0, 120);
  } else pass = true;

  if (!pass) failures += 1;
  process.stdout.write(`${pass ? "PASS" : "FAIL"} ${testCase.id} ${failureClass} ${detail}\n`.trimEnd() + String.fromCharCode(10));
}

process.stdout.write(`${cases.length} cases, ${cases.length - failures} pass, ${failures} fail${String.fromCharCode(10)}`);
process.exit(failures === 0 ? 0 : 1);
