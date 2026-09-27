/**
 * R0 §18/§20 — the E-LIVE DERIVATION, pinned.
 *
 * The dogfood's central mechanism is that a generation's implementation is DERIVED by interpreting
 * the inherited procedure's structured content. Two things must not silently rot:
 *
 *   1. the derivation must keep producing what the hand-written oracles describe (so a change to
 *      `derive-dag.mjs` that alters the emitted behaviour fails here rather than in a live gate), and
 *   2. mutating the CONTENT must change the observable outcome — the property that makes this a
 *      Level-3 interpretation rather than a keyword-driven file lookup.
 *
 * This test is deterministic and needs no Palimpsest install: it runs the derivation and the
 * project's own acceptance contract in a scratch directory.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { classifyStep, deriveImplementation, METHOD_CLAUSES } from "../scripts/gates/derive-dag.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = join(REPO, "scripts", "gates", "dag-planner");
const read = (relative: string): string => readFileSync(join(REPO, relative), "utf8");

const step = (instruction: string) => ({ instruction });

/** The P@1 content, exactly as the E-LIVE gate authors it. */
const P1_STEPS = [
  step("normalize the graph and validate that every edge endpoint is a known node"),
  step("detect cycles BEFORE attempting any ordering"),
  step("if a cycle exists, refuse with a normalized witness path naming the participating nodes"),
  step("otherwise topologically order the acyclic graph"),
  step("apply stable lexical tie-breaking to independent nodes"),
  step("verify every edge against the final order"),
];

/** P@2 adds Generation 2's extension as a METHOD CLAUSE, not as a harness switch. */
const P2_STEPS = [
  ...P1_STEPS,
  step("close the witness loop by repeating its first node, so the cycle is fully described"),
];

/**
 * Compare code while ignoring comments and formatting: the oracle is hand-written and the derivation
 * is generated, so their comments and local-variable NAMES differ legitimately (the oracle calls the
 * rotated witness `path`; the generator calls it `rotated`). What must match is the behaviour, so
 * local identifiers are normalized away too.
 */
function strip(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/\/\/.*$/gmu, "")
    .replace(/\brotated\b/gu, "WITNESS")
    .replace(/\bpath\b/gu, "WITNESS")
    // The generator emits the shorthand property (`path`), the oracle the explicit form (`path: path`).
    .replace(/WITNESS: WITNESS/gu, "WITNESS")
    .replace(/\s+/gu, " ")
    .trim();
}

let work: string;
let oracle: string;

/** Derive into a scratch project and run the UNCHANGED acceptance contract against the result. */
function acceptanceOf(content: { steps: readonly { instruction: string }[] }): { pass: number; fail: number } {
  writeFileSync(join(work, "src", "dag.ts"), deriveImplementation(content).source);
  let output: string;
  try {
    output = execFileSync("node", ["--test", "test/acceptance.test.ts"], { cwd: work, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    output = `${failure.stdout ?? ""}${failure.stderr ?? ""}`;
  }
  return {
    pass: Number(/(?:^|\s)pass (\d+)/u.exec(output)?.[1] ?? "0"),
    fail: Number(/(?:^|\s)fail (\d+)/u.exec(output)?.[1] ?? "0"),
  };
}

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "palimpsest-derive-"));
  oracle = mkdtempSync(join(tmpdir(), "palimpsest-oracle-"));
  for (const dir of [work, oracle]) {
    mkdirSync(join(dir, "src"), { recursive: true });
    mkdirSync(join(dir, "test"), { recursive: true });
    writeFileSync(join(dir, "package.json"), readFileSync(join(FIXTURE, "package.json")));
    writeFileSync(join(dir, "test", "acceptance.test.ts"), readFileSync(join(FIXTURE, "test", "acceptance.test.ts")));
  }
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
  rmSync(oracle, { recursive: true, force: true });
});

describe("R0 §20 the procedure's structured content is INTERPRETED", () => {
  it("the clause vocabulary is closed and reports an uninterpretable step", () => {
    expect(classifyStep("do something clever")).toBe("UNRECOGNIZED");
    expect(classifyStep("detect cycles BEFORE attempting any ordering")).toBe("DETECT_CYCLE_FIRST");
    // Ordering is load-bearing: the specific clause must win over the generic one.
    expect(classifyStep("apply stable lexical tie-breaking AFTER normalization, never before")).toBe(
      "TIE_BREAK_AFTER_NORMALIZATION",
    );
    expect(classifyStep("close the witness loop by repeating its first node")).toBe("CLOSE_WITNESS_LOOP");
    expect(METHOD_CLAUSES.length).toBeGreaterThanOrEqual(8);
  });

  it("the derivation emits exactly the clauses the method states, in the method's order", () => {
    const derived = deriveImplementation({ steps: P1_STEPS });
    expect(derived.trace.map((entry) => entry.clause)).toEqual([
      "NORMALIZE_AND_VALIDATE",
      "DETECT_CYCLE_FIRST",
      "REFUSE_WITH_NORMALIZED_WITNESS",
      "ORDER_ACYCLIC",
      "TIE_BREAK_READY_SET",
      "VERIFY_EVERY_EDGE",
    ]);
    expect(derived.clauses.unrecognized).toBe(0);
    expect(derived.clauses.cycleBeforeOrder).toBe(true);
    expect(derived.clauses.closeLoop).toBe(false);
  });

  it("P@2's extension is a CONTENT clause, not a harness option", () => {
    const derived = deriveImplementation({ steps: P2_STEPS });
    expect(derived.clauses.closeLoop).toBe(true);
    // The same interpreter, with no options argument at all, produced the closed witness.
    expect(derived.source).toContain("rotated[0]");
  });

  it("the derived implementation is semantically identical to the hand-written oracle", () => {
    writeFileSync(join(oracle, "src", "dag.ts"), deriveImplementation({ steps: P1_STEPS }).source);
    expect(strip(readFileSync(join(oracle, "src", "dag.ts"), "utf8"))).toBe(strip(read("scripts/gates/mature-dag.ts")));
  });

  it("the P@2 derivation is semantically identical to its oracle", () => {
    expect(strip(deriveImplementation({ steps: P2_STEPS }).source)).toBe(strip(read("scripts/gates/mature-plus-dag.ts")));
  });
});

describe("R0 §20 mutating the CONTENT changes the observable behaviour", () => {
  it("the real P@1 content yields a conformant implementation", () => {
    expect(acceptanceOf({ steps: P1_STEPS })).toEqual({ pass: 8, fail: 0 });
  });

  it("a method with no cycle clause reproduces the naive failure", () => {
    const outcome = acceptanceOf({ steps: P1_STEPS.filter((entry) => !/cycle/iu.test(entry.instruction)) });
    expect(outcome.fail).toBeGreaterThan(0);
  });

  it("the same clauses in the wrong ORDER also fail", () => {
    // Ordering before detecting is the defect the method exists to prevent, and the interpreter
    // honours the stated order rather than reordering the method into correctness.
    const reordered = [P1_STEPS[0]!, P1_STEPS[3]!, P1_STEPS[1]!, P1_STEPS[2]!, P1_STEPS[4]!, P1_STEPS[5]!];
    expect(acceptanceOf({ steps: reordered }).fail).toBeGreaterThan(0);
  });

  it("dropping normalize/validate fails the unknown-endpoint requirement", () => {
    const outcome = acceptanceOf({ steps: P1_STEPS.filter((entry) => !/normaliz/iu.test(entry.instruction)) });
    expect(outcome.fail).toBeGreaterThan(0);
  });

  it("an empty method yields a bare ordering loop that still violates the contract", () => {
    // With no clauses at all the interpreter emits the ordering loop and nothing else: no validation,
    // no cycle handling, no verification. It therefore behaves like the naive prototype — which is the
    // point. (It is not byte-identical to `naive-dag.ts`, whose emitter the harness uses directly when
    // a worker has inherited nothing; this is the derivation path with an empty clause set.)
    const outcome = acceptanceOf({ steps: [] });
    expect(outcome.fail).toBeGreaterThan(0);
    expect(outcome.pass).toBeLessThan(8);
  });

  it("the hand-written mature oracle passes the unchanged contract", () => {
    writeFileSync(join(oracle, "src", "dag.ts"), read("scripts/gates/mature-dag.ts"));
    let output: string;
    try {
      output = execFileSync("node", ["--test", "test/acceptance.test.ts"], { cwd: oracle, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      const failure = error as { stdout?: string; stderr?: string };
      output = `${failure.stdout ?? ""}${failure.stderr ?? ""}`;
    }
    expect(Number(/(?:^|\s)fail (\d+)/u.exec(output)?.[1] ?? "0")).toBe(0);
  });

  it("the naive prototype is 4 pass / 4 fail — the same result the gate records for Generation 0", () => {
    writeFileSync(join(oracle, "src", "dag.ts"), read("scripts/gates/naive-dag.ts"));
    let output: string;
    try {
      output = execFileSync("node", ["--test", "test/acceptance.test.ts"], { cwd: oracle, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      const failure = error as { stdout?: string; stderr?: string };
      output = `${failure.stdout ?? ""}${failure.stderr ?? ""}`;
    }
    expect(Number(/(?:^|\s)pass (\d+)/u.exec(output)?.[1] ?? "0")).toBe(4);
    expect(Number(/(?:^|\s)fail (\d+)/u.exec(output)?.[1] ?? "0")).toBe(4);
  });
});
