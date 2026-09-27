/**
 * §20 DERIVATION SENSITIVITY — the evidence that the procedure's CONTENT drives the code.
 *
 * A Level-1 consumer (look at the handle, write a pre-written file) cannot fail this: the file is the
 * same no matter what the method says. A Level-3 consumer must produce an implementation that follows
 * the content, so mutating the content must change the observable behaviour against the UNCHANGED
 * acceptance contract.
 *
 * The driver derives an implementation for each mutated method, runs the real suite, and reports the
 * pass/fail. `derive-dag.mjs` is imported by relative path so this runs from any cwd.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { deriveImplementation } from "./derive-dag.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const WORK = process.env.PALIMPSEST_DERIVE_WORK?.trim() || join(process.env.TEMP ?? "/tmp", "palimpsest-derive");

const step = (instruction) => ({ instruction });
const BASE = [
  step("normalize the graph and validate that every edge endpoint is a known node"),
  step("detect cycles BEFORE attempting any ordering"),
  step("if a cycle exists, refuse with a normalized witness path naming the participating nodes"),
  step("otherwise topologically order the acyclic graph"),
  step("apply stable lexical tie-breaking to independent nodes"),
  step("verify every edge against the final order"),
];

/**
 * Each variant states what the CONTENT implies the observable outcome should be, so a mismatch is a
 * finding rather than a silently adjusted expectation. Two expectations are deliberately
 * non-obvious and are recorded with their reason rather than tuned to match the run:
 *
 *   D_no_tiebreak — CONFORMANT, because `NORMALIZE_AND_VALIDATE` already sorts the node set, so the
 *     ready set is canonically ordered by construction and an explicit tie-break clause is redundant.
 *     The clause is still emitted (a method that states it gets it) but its absence is not observable
 *     here. This is a real property of the method, not a weakness of the interpreter.
 *   E_no_verify — CONFORMANT, because the ordering is already correct; the verification step is a
 *     guard against a defect elsewhere, not something the contract can detect by its absence.
 */
const VARIANTS = [
  { id: "A_baseline", expect: "CONFORMANT", steps: BASE, why: "the full method" },
  { id: "B_no_cycle_step", expect: "VIOLATES", steps: BASE.filter((s) => !/cycle/iu.test(s.instruction)), why: "no cycle handling at all" },
  { id: "C_cycle_after_order", expect: "VIOLATES", steps: [BASE[0], BASE[3], BASE[1], BASE[2], BASE[4], BASE[5]], why: "the same clauses, stated in the wrong ORDER" },
  { id: "D_no_tiebreak", expect: "CONFORMANT", steps: BASE.filter((s) => !/tie.?break|lexical/iu.test(s.instruction)), why: "normalize already orders the node set, so the clause is redundant" },
  { id: "E_no_verify", expect: "CONFORMANT", steps: BASE.filter((s) => !/verif/iu.test(s.instruction)), why: "the order is already correct; the guard is not observable" },
  { id: "F_no_normalize", expect: "VIOLATES", steps: BASE.filter((s) => !/normaliz/iu.test(s.instruction)), why: "without validation the unknown-endpoint case is not refused" },
];

function scaffold() {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(join(WORK, "src"), { recursive: true });
  mkdirSync(join(WORK, "test"), { recursive: true });
  const FIXTURE = join(REPO, "scripts", "gates", "dag-planner");
  writeFileSync(join(WORK, "package.json"), readFileSync(join(FIXTURE, "package.json")));
  writeFileSync(join(WORK, "test", "acceptance.test.ts"), readFileSync(join(FIXTURE, "test", "acceptance.test.ts")));
}

function runSuite() {
  let output;
  try {
    output = execFileSync("node", ["--test", "test/acceptance.test.ts"], { cwd: WORK, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
  return {
    pass: Number(/(?:^|\s)pass (\d+)/u.exec(output)?.[1] ?? "0"),
    fail: Number(/(?:^|\s)fail (\d+)/u.exec(output)?.[1] ?? "0"),
  };
}

scaffold();
const rows = [];
for (const variant of VARIANTS) {
  const derived = deriveImplementation({ steps: variant.steps });
  writeFileSync(join(WORK, "src", "dag.ts"), derived.source);
  const outcome = runSuite();
  const observed = outcome.fail === 0 ? "CONFORMANT" : "VIOLATES";
  rows.push({ id: variant.id, expected: variant.expect, observed, pass: outcome.pass, fail: outcome.fail, clauses: derived.clauses });
}
const mismatched = rows.filter((row) => row.expected !== row.observed);
// A single machine-readable line, so the gate can consume this as evidence without parsing prose.
process.stdout.write(`${JSON.stringify(rows)}\n`);
process.stdout.write(
  mismatched.length === 0
    ? `all ${rows.length} variants behaved as the CONTENT predicts: ${rows.map((row) => `${row.id}=${row.observed}`).join(", ")}\n` +
      `(B/C/F are observable CONSEQUENCES of the method's content; A/D/E are conformant)\n`
    : `MISMATCHED: ${mismatched.map((row) => row.id).join(", ")}\n`,
);
process.exit(mismatched.length === 0 ? 0 : 1);
