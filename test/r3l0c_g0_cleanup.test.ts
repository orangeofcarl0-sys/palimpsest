/**
 * R3-L0C-G0 §3 — THE TWO RESIDUAL CLEANUP DEFECTS, MEASURED AGAINST THE UNPATCHED HELPER.
 *
 * §11 C1 requires the measured controls to be committed BEFORE the implementation changes, and §3 requires each
 * defect to be reproduced against the actual committed source rather than marked confirmed by assertion. Every
 * assertion in this file therefore describes the CURRENT behaviour of
 * `scripts/r3l0ciarlcfsh/safe-cleanup.mjs` at the G0 baseline `751f2e2`, including the two behaviours that are
 * WRONG. C2 flips each defect assertion to its corrected form and the file becomes the positive control.
 *
 * WHY THIS FILE IS SEPARATE FROM `test/r3l0ciarlcfsh_*`. Those files are the previous stage's evidence and are
 * protected by the historical-immutability rule. G0 owns `test/r3l0c_g0_cleanup.test.ts` alone.
 *
 * SAFETY. Every dangerous branch is exercised with a FAULT-INJECTED adapter over a disposable directory under the
 * system temp root. No shared dependency, user worktree or user file is ever a target. The external sentinel check
 * proves a file outside every disposable root is byte-identical afterwards.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import {
  createDisposableCheckout,
  destroyDisposableCheckout,
  enumerateLinks,
  MAX_ENUMERATION_DEPTH,
  realFilesystemAdapter,
  realGitAdapter,
} from "../scripts/r3l0ciarlcfsh/safe-cleanup.mjs";

/** §3: a path-conditional filesystem adapter, so a permission error can be injected on ONE path only. */
function permissionErrorFs(targetPath: string, code: string): Record<string, any> {
  const real = realFilesystemAdapter();
  const realLstat = real.lstat;
  return Object.freeze({
    ...real,
    exists: (path: string) => {
      if (String(path) === String(targetPath)) return false;
      try { realLstat(path); return true; } catch { return false; }
    },
    lstat: (path: string) => {
      if (String(path) === String(targetPath)) throw Object.assign(new Error(`injected ${code}`), { code });
      return realLstat(path);
    },
  });
}

/** §3: build a directory chain deeper than the declared bound, with a link below the boundary. */
function buildOverDeepTree(base: string): { deepRoot: string; deepest: string; linkPath: string; target: string } {
  const deepRoot = join(base, "over-deep");
  mkdirSync(deepRoot, { recursive: true });
  let cursor = deepRoot;
  for (let index = 0; index <= MAX_ENUMERATION_DEPTH; index += 1) {
    cursor = join(cursor, `d${index}`);
    mkdirSync(cursor, { recursive: true });
  }
  const target = join(base, "deep-outside-target");
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, "SENTINEL.txt"), "deep-sentinel", "utf8");
  const linkPath = join(cursor, "deep-link");
  try { symlinkSync(target, linkPath, "junction"); } catch { /* the assertion below reports the real state */ }
  return { deepRoot, deepest: cursor, linkPath, target };
}

describe("R3-L0C-G0 §3 S1-A — depth-limit exhaustion (unpatched baseline)", () => {
  let base: string;
  beforeAll(() => { base = mkdtempSync(join(tmpdir(), "g0-s1a-")); });

  it("S1-A-DEFECT_PRESENT: a link below the depth bound is never inspected and enumeration still reports success", () => {
    const { deepRoot, linkPath } = buildOverDeepTree(base);
    const enumerated = enumerateLinks({ root: deepRoot, fs: realFilesystemAdapter() });
    // The defect: traversal stops silently at the bound, the deeper link is never classified, and `ok` is true.
    expect(enumerated.ok).toBe(true);
    expect(enumerated.links.length).toBe(0);
    expect(existsSync(linkPath)).toBe(true);
    // The corrected helper must expose a named depth-exhaustion condition; the baseline does not have the field.
    expect("depthLimitExceeded" in enumerated).toBe(false);
  });
});

describe("R3-L0C-G0 §3 S1-B — unknown post-removal state (unpatched baseline)", () => {
  it("S1-B-DEFECT_PRESENT: a swallowed permission error is reported as a confirmed removal", () => {
    const checkout = createDisposableCheckout();
    const root = String(checkout.root);
    // Git removal returns without removing anything, and postflight inspection cannot read the root (EPERM).
    const noopGit = Object.freeze({ ...realGitAdapter(), removeWorktreeForce: () => { /* returns, no-op */ } });
    const result = destroyDisposableCheckout({ checkout, fs: permissionErrorFs(root, "EPERM"), git: noopGit });
    // The defect: `exists() !== true` is read as proof of removal, so the result claims CLEANED...
    expect(result.outcome).toBe("CLEANED");
    expect(result.worktreeRemoved).toBe(true);
    expect(result.destructiveFallbackExecuted).toBe(true);
    // ...while the directory is physically still on disk.
    expect(existsSync(root)).toBe(true);
    // The corrected helper must report an explicit removal state; the baseline does not have the field.
    expect("removalState" in result).toBe(false);
    destroyDisposableCheckout({ checkout });
  });

  it("S1-B-DEFECT_PRESENT: an EACCES inspection failure is likewise reported as removal", () => {
    const checkout = createDisposableCheckout();
    const root = String(checkout.root);
    const noopGit = Object.freeze({ ...realGitAdapter(), removeWorktreeForce: () => { /* returns, no-op */ } });
    const result = destroyDisposableCheckout({ checkout, fs: permissionErrorFs(root, "EACCES"), git: noopGit });
    expect(result.outcome).toBe("CLEANED");
    expect(result.worktreeRemoved).toBe(true);
    expect(existsSync(root)).toBe(true);
    destroyDisposableCheckout({ checkout });
  });
});

describe("R3-L0C-G0 §3 — the external sentinel is untouched by every measurement above", () => {
  it("SENTINEL_INTACT: a file outside every disposable root is byte-identical", () => {
    const base = mkdtempSync(join(tmpdir(), "g0-sentinel-"));
    const sentinel = join(base, "DO_NOT_DELETE.txt");
    writeFileSync(sentinel, "irreplaceable-user-data", "utf8");
    const before = createHash("sha256").update(readFileSync(sentinel)).digest("hex");
    const checkout = createDisposableCheckout();
    destroyDisposableCheckout({ checkout, fs: permissionErrorFs(String(checkout.root), "EPERM"), git: Object.freeze({ ...realGitAdapter(), removeWorktreeForce: () => { /* no-op */ } }) });
    destroyDisposableCheckout({ checkout });
    const after = createHash("sha256").update(readFileSync(sentinel)).digest("hex");
    expect(after).toBe(before);
  });
});
