/**
 * R2-LR §5/§7/§8 — THE LAST-MILE DELIVERY TESTS.
 *
 * §5 requires the forwarding repair to be PROVEN backward-compatible in three shapes, because the fix is a
 * production host change and a careless one would either drop the index (the original defect) or coerce a
 * malformed value into the prompt:
 *
 *   absent      the previous worker prompt is byte-identical — a payload predating the field must behave
 *               exactly as it did before
 *   valid       the exact string is forwarded ONCE, byte-for-byte
 *   malformed   a non-string is NOT forwarded and NOT stringified
 *
 * §8 additionally requires the anti-vacuity check to reject the exact class of defect that hid this bug,
 * and to be honest that it proves nothing beyond that class.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * §23 (GR-03/GR-04): THE COMPATIBILITY RESULT IS RECORDED.
 *
 * GATE R must not ASSUME the backward-compatibility proof passed — it reads a record of the last run. So the
 * two load-bearing compatibility facts are written here, from the same assertions the tests below make, and
 * GATE R refuses to close if the record is missing or false.
 */
function recordSuiteResult(facts: Record<string, boolean>): void {
  const dir = join(REPO_ROOT, "research-evidence", "r2-lr");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "deterministic-suite.json"), `${JSON.stringify({ schemaVersion: 1, stage: "R2-LR", suite: "test/r2lr_last_mile.test.ts", recordedAt: new Date().toISOString(), ...facts }, null, 2)}\n`, "utf8");
}

/**
 * The forwarding rule, extracted from `host/dsh/lib/index.js` and exercised directly.
 *
 * The adapter itself cannot be imported here — it is a DSH plugin that composes a live runtime — so the
 * RULE is what is tested. The rule's CONDITION and VALUE are lifted out of the shipped source text and
 * evaluated, so the test cannot pass against a different rule than the one that ships. If the expression is
 * ever edited, this extraction fails loudly rather than silently testing a stale copy.
 */
function forwardingRule() {
  const source = readFileSync(join(REPO_ROOT, "host", "dsh", "lib", "index.js"), "utf8");
  const match = /\.\.\.\(typeof raw\.contextIndexText === 'string' \? \{ contextIndexText: raw\.contextIndexText \} : \{\}\)/u.exec(source);
  if (match === null) {
    throw new Error("the forwarding rule is not present in host/dsh/lib/index.js — the repair is missing");
  }
  // eslint-disable-next-line no-new-func
  return new Function("raw", "return (typeof raw.contextIndexText === 'string' ? { contextIndexText: raw.contextIndexText } : {});") as (raw: Record<string, unknown>) => Record<string, unknown>;
}

const forward = forwardingRule();

describe("R2-LR §3/§5 — the host forwards the worker context index", () => {
  it("the forwarding expression is present in the SHIPPED adapter", () => {
    expect(() => forwardingRule()).not.toThrow();
  });

  it("§5 ABSENT: a payload without the field forwards NOTHING (byte-identical prompt)", () => {
    expect(forward({ context: {}, recorder: {} })).toEqual({});
    expect(Object.hasOwn(forward({ context: {} }), "contextIndexText")).toBe(false);
  });

  it("§5 VALID: an exact string is forwarded once, byte-for-byte", () => {
    const index = "\nProject context available to this attempt (READ-ONLY; never authority):\n  [proof] @ctx/proof/pc-1\n";
    const forwarded = forward({ contextIndexText: index });
    expect(forwarded.contextIndexText).toBe(index);
    expect(Object.keys(forwarded)).toEqual(["contextIndexText"]);
  });

  it("§5 VALID: an EMPTY string is forwarded as an empty string, not dropped", () => {
    // An empty string is a legitimate value (the product may render nothing), and the runner's own guard
    // treats it as "no section" — so forwarding it changes nothing, while dropping it would be a
    // different payload from the one the product composed.
    const forwarded = forward({ contextIndexText: "" });
    expect(forwarded.contextIndexText).toBe("");
  });

  it("§5 MALFORMED: a non-string is NOT forwarded and is NOT stringified", () => {
    for (const malformed of [null, undefined, 42, true, { index: "@ctx/proof/x" }, ["@ctx/proof/x"]]) {
      const forwarded = forward({ contextIndexText: malformed });
      expect(Object.hasOwn(forwarded, "contextIndexText")).toBe(false);
    }
  });

  it("§5 MALFORMED: an object carrying a plausible index is still refused", () => {
    // The dangerous shape: an object whose JSON rendering would LOOK like an index. It must not be
    // stringified into the prompt, because the worker would then be reading a host rendering rather than
    // the product's bytes.
    const forwarded = forward({ contextIndexText: { toString: () => "[proof] @ctx/proof/pc-1" } });
    expect(Object.hasOwn(forwarded, "contextIndexText")).toBe(false);
  });

  it("the forwarding does not read a canonical owner or invent an index", () => {
    const source = readFileSync(join(REPO_ROOT, "host", "dsh", "lib", "index.js"), "utf8");
    /**
     * THE EXECUTABLE STATEMENT, not the surrounding prose. The repair's own comment names the functions it
     * does NOT call ("`renderWorkerContextIndex` composes it…"), so a check over the whole region would flag
     * the documentation of the constraint as a violation of it. The statement is extracted by its own text,
     * which is also what makes the test fail loudly if the repair is ever removed.
     */
    const statementMatch = /\.\.\.\(typeof raw\.contextIndexText === 'string' \? \{ contextIndexText: raw\.contextIndexText \} : \{\}\)/u.exec(source);
    expect(statementMatch).not.toBeNull();
    const statement = statementMatch![0];
    // The rule that IS there: one strict string check, forwarding the product's own bytes.
    expect(statement).toContain("typeof raw.contextIndexText === 'string'");
    expect(statement).toContain("contextIndexText: raw.contextIndexText");
    // And nothing else: no composition, no owner read, no ranking, no reinterpretation.
    for (const forbidden of ["renderWorkerContextIndex", "compiled.handles", "readClaim", "readRevision", "relevance", "priority", "salience", "JSON.stringify"]) {
      expect(statement).not.toContain(forbidden);
    }
  });

  it("§23 records the compatibility facts GATE R reads", () => {
    // The record is derived from the SAME assertions above, so it cannot claim a result the tests do not
    // produce: the absent case forwards nothing, and every malformed shape is refused.
    const absentForwarded = Object.hasOwn(forward({ context: {} }), "contextIndexText");
    const malformedForwarded = [null, undefined, 42, true, { index: "x" }, ["x"]].some((value) => Object.hasOwn(forward({ contextIndexText: value }), "contextIndexText"));
    recordSuiteResult({ oldPayloadCompatible: absentForwarded === false, malformedRefused: malformedForwarded === false });
    expect(absentForwarded).toBe(false);
    expect(malformedForwarded).toBe(false);
  });
});

describe("R2-LR §7 — the session probe reads the model-visible boundary", () => {
  it("decompresses a MULTI-FRAME zstd artifact rather than only the first frame", async () => {
    const probe = await import(join(REPO_ROOT, "scripts", "r2lr", "session-probe.mjs"));
    const zlib = await import("node:zlib");
    // Two independent frames: a single-frame read returns only the first, which is the bug this guards.
    const first = zlib.zstdCompressSync(Buffer.from("alpha", "utf8"));
    const second = zlib.zstdCompressSync(Buffer.from("beta", "utf8"));
    const combined = Buffer.concat([first, second]);
    const text = probe.decompressFrames(combined);
    expect(text).toContain("alpha");
    expect(text).toContain("beta");
  });

  it("returns an explicit ABSENT result rather than an empty prompt when no session exists", async () => {
    const probe = await import(join(REPO_ROOT, "scripts", "r2lr", "session-probe.mjs"));
    const result = probe.readModelVisiblePrompt({ home: join(REPO_ROOT, "no-such-home-for-r2lr") });
    expect(result.found).toBe(false);
    expect(result.promptText).toBe("");
    expect(result.note).toMatch(/no session artifact/u);
  });

  it("extracts the index section and STOPS at the product's terminator", async () => {
    const probe = await import(join(REPO_ROOT, "scripts", "r2lr", "session-probe.mjs"));
    const prompt = [
      "Your task: do the thing",
      "",
      "Project context available to this attempt (READ-ONLY; never authority):",
      "  [proof] @ctx/proof/pc-1",
      "",
      "Use `palimpsest_worker_context_pull` with exactly one listed handle when the body would help.",
      "Do not invent handles: a handle that is not listed above will be refused.",
      "",
      "How to work:",
      "  - this belongs to a DIFFERENT layer and must not be attributed to the index",
    ].join("\n");
    const section = probe.indexSectionOf(prompt);
    expect(section).not.toBeNull();
    expect(section).toContain("[proof] @ctx/proof/pc-1");
    expect(section).toContain("Do not invent handles");
    expect(section).not.toContain("How to work");
    expect(probe.handlesInPrompt(prompt)).toEqual(["@ctx/proof/pc-1"]);
  });
});

describe("R2-LR §8 — the anti-vacuity check forbids the defect class that hid this bug", () => {
  it("passes on the repository's gates", () => {
    const output = execFileSync(process.execPath, [join(REPO_ROOT, "scripts", "r2lr", "anti-vacuity.mjs")], { cwd: REPO_ROOT, encoding: "utf8" });
    expect(output).toContain("ANTI-VACUITY: PASS");
  });

  it("would FAIL on the exact form the R1-L gate contained", () => {
    const probePath = join(REPO_ROOT, "scripts", "gates", "__av_test_probe.mjs");
    const { writeFileSync, rmSync } = require("node:fs");
    try {
      writeFileSync(probePath, 'const of = () => "x";\nconst a = [of("k") !== "" || true];\n', "utf8");
      expect(() => execFileSync(process.execPath, [join(REPO_ROOT, "scripts", "r2lr", "anti-vacuity.mjs")], { cwd: REPO_ROOT, encoding: "utf8" })).toThrow();
    } finally {
      rmSync(probePath, { force: true });
    }
  });

  it("does NOT flag an ordinary comparison of two facts", () => {
    const probePath = join(REPO_ROOT, "scripts", "gates", "__av_test_probe2.mjs");
    const { writeFileSync, rmSync } = require("node:fs");
    try {
      writeFileSync(probePath, 'const x = 1;\nconst a = [x === false && x === true];\n', "utf8");
      const output = execFileSync(process.execPath, [join(REPO_ROOT, "scripts", "r2lr", "anti-vacuity.mjs")], { cwd: REPO_ROOT, encoding: "utf8" });
      expect(output).toContain("ANTI-VACUITY: PASS");
    } finally {
      rmSync(probePath, { force: true });
    }
  });

  it("§8 the check states honestly that it does NOT prove tests non-vacuous", () => {
    const source = readFileSync(join(REPO_ROOT, "scripts", "r2lr", "anti-vacuity.mjs"), "utf8");
    expect(source).toMatch(/does not prove any test is non-vacuous/u);
    const output = execFileSync(process.execPath, [join(REPO_ROOT, "scripts", "r2lr", "anti-vacuity.mjs")], { cwd: REPO_ROOT, encoding: "utf8" });
    expect(output).toContain("does not prove any test is non-vacuous");
  });
});
