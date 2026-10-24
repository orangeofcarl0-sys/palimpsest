import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { dshDefaultStatePath, defaultStatePath } from "../src/state/index.js";
import { defaultOrdariumPath } from "../src/effects/index.js";

/**
 * THE SNAPSHOT IS TAKEN PER TEST, NOT AT MODULE LOAD - and that is a correctness fix, not a tidy-up.
 *
 * The superseded version captured the home variable ONCE, when this module was first imported. Under vitest's
 * parallel file execution several suites share one worker process, so the value at THIS module's load time may
 * be undefined even though a suite that ran EARLIER in the same worker had set it. The afterEach then deleted
 * a variable it had never owned, and every later suite in that worker saw it unset.
 *
 * That is exactly how `host_s1r_reparse_boundary.test.ts` case 13 failed intermittently: it reads the home to
 * measure the real dependency layout, and with the variable cleared it took its LIMIT branch. The failure was
 * reproduced in a full run, was absent when the suite ran alone, and was absent on a re-run - the signature of
 * cross-file contamination rather than a defect in the code under test.
 *
 * Capturing in beforeEach restores exactly what this file found, and nothing else.
 */
let ORIGINAL_runtime_HOME: string | undefined;

beforeEach(() => {
  ORIGINAL_runtime_HOME = process.env.runtime_HOME;
});

afterEach(() => {
  if (ORIGINAL_runtime_HOME === undefined) {
    delete process.env.runtime_HOME;
  } else {
    process.env.runtime_HOME = ORIGINAL_runtime_HOME;
  }
});

describe("dual-store default topology (docs/01 §4)", () => {
  it("DSH installs place the orchestration ledger under $DSH_HOME", () => {
    process.env.DSH_HOME = "C:\\dsh-home";
    expect(dshDefaultStatePath()).toBe(join("C:\\dsh-home", "palimpsest", "palimpsest.sqlite"));
    expect(defaultOrdariumPath()).toBe(join("C:\\dsh-home", "ordarium", "operations.sqlite"));
  });

  it("falls back to ~/.dsh when DSH_HOME is unset", () => {
    delete process.env.DSH_HOME;
    expect(dshDefaultStatePath()).toContain(join(".dsh", "palimpsest", "palimpsest.sqlite"));
    expect(defaultOrdariumPath()).toContain(join(".dsh", "ordarium", "operations.sqlite"));
  });

  it("the two ledgers are distinct files under their own namespaces", () => {
    process.env.DSH_HOME = "C:\\dsh-home";
    expect(dshDefaultStatePath()).not.toBe(defaultOrdariumPath());
    expect(dshDefaultStatePath().endsWith("palimpsest.sqlite")).toBe(true);
    expect(defaultOrdariumPath().endsWith("operations.sqlite")).toBe(true);
  });

  it("the repository-scoped default from the frozen baseline still works", () => {
    // The contract is host-native: canonicalRepository is a path meaningful to
    // the current execution host, so the expectation is built from the same
    // resolved root the implementation uses. A foreign Windows literal is not
    // meaningful on POSIX and must not be special-cased.
    const root = resolve("repo-root");
    expect(defaultStatePath(root)).toBe(join(root, ".palimpsest", "palimpsest.db"));
  });
});
