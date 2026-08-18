import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { dshDefaultStatePath, defaultStatePath } from "../src/state/index.js";
import { defaultOrdariumPath } from "../src/effects/index.js";

const ORIGINAL_DSH_HOME = process.env.DSH_HOME;

afterEach(() => {
  if (ORIGINAL_DSH_HOME === undefined) {
    delete process.env.DSH_HOME;
  } else {
    process.env.DSH_HOME = ORIGINAL_DSH_HOME;
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
    expect(defaultStatePath("C:\\repo")).toBe(join("C:\\repo", ".palimpsest", "palimpsest.db"));
  });
});
