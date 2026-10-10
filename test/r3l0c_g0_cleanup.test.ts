/**
 * R3-L0C-G0 §3 — THE CLEANUP SAFETY CORRECTION, MEASURED AND NEGATIVE-CONTROLLED.
 *
 * C1 committed the controls that MEASURED the two residual defects against the unpatched helper at `751f2e2`.
 * This file is the corrected form: the same two properties are now asserted to HOLD, and the §3-required negative
 * controls S1-A and S1-B1..B6 are added, including the adapter CALL HISTORY that §3 demands instead of trusting a
 * helper's own descriptive boolean.
 *
 * WHY THIS FILE IS SEPARATE FROM `test/r3l0ciarlcfsh_*`. Those files are the previous stage's evidence and are
 * protected by the historical-immutability rule. G0 owns `test/r3l0c_g0_cleanup.test.ts` alone.
 *
 * SAFETY. Every dangerous branch is exercised with a FAULT-INJECTED adapter over a disposable directory under the
 * system temp root. No shared dependency, user worktree or user file is ever a target. The sentinel checks prove
 * that data outside the disposable root is byte-identical afterwards.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import {
  classifyRemovalState,
  createDisposableCheckout,
  destroyDisposableCheckout,
  enumerateLinks,
  MAX_ENUMERATION_DEPTH,
  realFilesystemAdapter,
  realGitAdapter,
  REMOVAL_STATES,
} from "../scripts/r3l0ciarlcfsh/safe-cleanup.mjs";

/** §3: an adapter whose `inspect` reports a permission failure for ONE path, exactly as the real adapter does. */
function unreadableRootFs(root: string, code: string): Record<string, any> {
  const real = realFilesystemAdapter();
  return Object.freeze({
    ...real,
    inspect: (path: string) => (String(path) === String(root)
      ? { present: null, absent: false, code, error: `injected ${code} on ${root}` }
      : real.inspect(path)),
  });
}

/** §3: an adapter with NO `inspect`, so the classifier's own fallback path is exercised against a throwing `lstat`. */
function unreadableRootFsWithoutInspect(root: string, code: string): Record<string, any> {
  const real = realFilesystemAdapter();
  const { inspect, ...rest } = real as Record<string, any>;
  void inspect;
  return Object.freeze({
    ...rest,
    lstat: (path: string) => {
      if (String(path) === String(root)) throw Object.assign(new Error(`injected ${code}`), { code });
      return real.lstat(path);
    },
  });
}

/** §3: a Git adapter that records whether a forced removal was invoked, and can be made to fail. */
function recordingGit(mode: "real" | "throw" | "noop"): { git: Record<string, any>; calls: string[] } {
  const calls: string[] = [];
  const real = realGitAdapter();
  return {
    calls,
    git: Object.freeze({
      ...real,
      removeWorktreeForce: (root: string) => {
        calls.push(`removeWorktreeForce:${root}`);
        if (mode === "throw") throw new Error("injected git failure");
        if (mode === "noop") return;
        return real.removeWorktreeForce(root);
      },
    }),
  };
}

/** §3: a filesystem adapter that records every DESTRUCTIVE operation it is asked to perform. */
function recordingFs(): { fs: Record<string, any>; calls: string[] } {
  const calls: string[] = [];
  const real = realFilesystemAdapter();
  return {
    calls,
    fs: Object.freeze({
      ...real,
      unlinkLink: (path: string) => { calls.push(`unlinkLink:${path}`); return real.unlinkLink(path); },
      removeTree: (path: string) => { calls.push(`removeTree:${path}`); return real.removeTree(path); },
    }),
  };
}

/** §3: build a directory chain deeper than the declared bound, with a link below the boundary. */
function buildOverDeepTree(base: string): { deepRoot: string; linkPath: string; target: string } {
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
  symlinkSync(target, linkPath, "junction");
  return { deepRoot, linkPath, target };
}

describe("R3-L0C-G0 §3 S1-A — depth-limit exhaustion now FAILS CLOSED", () => {
  let base: string;
  beforeAll(() => { base = mkdtempSync(join(tmpdir(), "g0-s1a-fixed-")); });

  it("S1-A: a link below the bound is reported and the whole cleanup is blocked, worktree preserved", () => {
    const { deepRoot, linkPath, target } = buildOverDeepTree(base);
    const sentinel = join(target, "SENTINEL.txt");
    const before = createHash("sha256").update(readFileSync(sentinel)).digest("hex");

    const enumerated = enumerateLinks({ root: deepRoot, fs: realFilesystemAdapter() });
    expect(enumerated.DEPTH_LIMIT_EXCEEDED).toBe(true);
    expect(enumerated.ok).toBe(false);
    expect(enumerated.depthExhausted.length).toBeGreaterThan(0);

    const checkout = createDisposableCheckout();
    // place the over-deep tree INSIDE the owned checkout so the end-to-end path is exercised
    const inside = join(checkout.root, "over-deep");
    mkdirSync(inside, { recursive: true });
    let cursor = inside;
    for (let index = 0; index <= MAX_ENUMERATION_DEPTH; index += 1) { cursor = join(cursor, `d${index}`); mkdirSync(cursor, { recursive: true }); }
    const deepLink = join(cursor, "deep-link");
    symlinkSync(target, deepLink, "junction");

    const { fs, calls } = recordingFs();
    const { git, calls: gitCalls } = recordingGit("real");
    const result = destroyDisposableCheckout({ checkout, fs, git });

    expect(result.outcome).toBe("CLEANUP_BLOCKED");
    expect(result.ENUMERATION_COMPLETE).toBe(false);
    expect(result.DEPTH_LIMIT_EXCEEDED).toBe(true);
    expect(result.gitWorktreeRemoveForceExecuted).toBe(false);
    expect(result.recursiveRemoveExecuted).toBe(false);
    expect(result.worktreePreserved).toBe(true);
    // §3: the injected adapter's call history, not the helper's own boolean, shows what was invoked.
    expect(calls.some((call) => call.startsWith("removeTree"))).toBe(false);
    expect(gitCalls.length).toBe(0);
    expect(existsSync(checkout.root)).toBe(true);

    // the external target sentinel is byte-identical
    const after = createHash("sha256").update(readFileSync(sentinel)).digest("hex");
    expect(after).toBe(before);

    // clean up the disposable tree only: unlink the deep link, drop the chain, then clean the checkout
    rmSync(deepLink, { force: true });
    rmSync(inside, { recursive: true, force: true });
    rmSync(deepRoot, { recursive: true, force: true });
    destroyDisposableCheckout({ checkout });
  });
});

describe("R3-L0C-G0 §3 S1-B1..B6 — the removal-aftermath vocabulary", () => {
  it("S1-B1: Git removal THROWS and the directory still exists -> STILL_PRESENT, blocked, preserved", () => {
    const checkout = createDisposableCheckout();
    const { fs, calls } = recordingFs();
    const { git } = recordingGit("throw");
    const result = destroyDisposableCheckout({ checkout, fs, git });
    expect(result.outcome).toBe("CLEANUP_BLOCKED");
    expect(result.removalState).toBe(REMOVAL_STATES.STILL_PRESENT);
    expect(result.worktreeRemoved).toBe(false);
    expect(result.recursiveRemoveExecuted).toBe(false);
    expect(result.gitWorktreeRemoveForceExecuted).toBe(false);
    expect(calls.some((call) => call.startsWith("removeTree"))).toBe(false);
    expect(existsSync(checkout.root)).toBe(true);
    destroyDisposableCheckout({ checkout });
  });

  it("S1-B2: Git removal THROWS and postflight lstat throws EPERM -> STATE_UNKNOWN, never CLEANED", () => {
    const checkout = createDisposableCheckout();
    const { git } = recordingGit("throw");
    const result = destroyDisposableCheckout({ checkout, fs: unreadableRootFs(checkout.root, "EPERM"), git });
    expect(result.outcome).toBe("CLEANUP_BLOCKED");
    expect(result.removalState).toBe(REMOVAL_STATES.STATE_UNKNOWN);
    expect(result.inspectionCode).toBe("EPERM");
    expect(result.worktreeRemoved).toBe(false);
    expect(result.worktreePreserved).toBe(true);
    expect(existsSync(checkout.root)).toBe(true);
    destroyDisposableCheckout({ checkout });
  });

  it("S1-B2b: the classifier's own fallback path (no inspect) also yields STATE_UNKNOWN on EPERM", () => {
    const checkout = createDisposableCheckout();
    const { git } = recordingGit("throw");
    const result = destroyDisposableCheckout({ checkout, fs: unreadableRootFsWithoutInspect(checkout.root, "EPERM"), git });
    expect(result.outcome).toBe("CLEANUP_BLOCKED");
    expect(result.removalState).toBe(REMOVAL_STATES.STATE_UNKNOWN);
    expect(existsSync(checkout.root)).toBe(true);
    destroyDisposableCheckout({ checkout });
  });

  it("S1-B3: Git removal RETURNS and postflight lstat throws EACCES -> STATE_UNKNOWN, never CLEANED", () => {
    const checkout = createDisposableCheckout();
    const { git } = recordingGit("noop");
    const result = destroyDisposableCheckout({ checkout, fs: unreadableRootFs(checkout.root, "EACCES"), git });
    expect(result.outcome).toBe("CLEANUP_BLOCKED");
    expect(result.removalState).toBe(REMOVAL_STATES.STATE_UNKNOWN);
    expect(result.inspectionCode).toBe("EACCES");
    expect(result.worktreeRemoved).toBe(false);
    expect(existsSync(checkout.root)).toBe(true);
    destroyDisposableCheckout({ checkout });
  });

  it("S1-B4: Git removal RETURNS and lstat confirms ENOENT -> REMOVED_CONFIRMED -> CLEANED", () => {
    const checkout = createDisposableCheckout();
    const { git, calls } = recordingGit("real");
    const result = destroyDisposableCheckout({ checkout, git });
    expect(result.outcome).toBe("CLEANED");
    expect(result.removalState).toBe(REMOVAL_STATES.REMOVED_CONFIRMED);
    expect(result.removalPositivelyConfirmed).toBe(true);
    expect(result.worktreeRemoved).toBe(true);
    expect(result.gitWorktreeRemoveForceExecuted).toBe(true);
    expect(calls).toHaveLength(1);
    expect(existsSync(checkout.root)).toBe(false);
  });

  it("S1-B5: Git removal RETURNS but the directory still exists -> STILL_PRESENT, blocked", () => {
    const checkout = createDisposableCheckout();
    const { fs, calls } = recordingFs();
    const { git } = recordingGit("noop");
    const result = destroyDisposableCheckout({ checkout, fs, git });
    expect(result.outcome).toBe("CLEANUP_BLOCKED");
    expect(result.removalState).toBe(REMOVAL_STATES.STILL_PRESENT);
    expect(result.worktreeRemoved).toBe(false);
    expect(calls.some((call) => call.startsWith("removeTree"))).toBe(false);
    expect(existsSync(checkout.root)).toBe(true);
    destroyDisposableCheckout({ checkout });
  });

  it("S1-B6: NO unexpected recursive removal is ever invoked, in any failure branch", () => {
    const branches: ReadonlyArray<readonly [string, string, (root: string) => Record<string, any>]> = [
      ["throw-still-present", "throw", (root) => realFilesystemAdapter()],
      ["throw-eperm-unknown", "throw", (root) => unreadableRootFs(root, "EPERM")],
      ["noop-eacces-unknown", "noop", (root) => unreadableRootFs(root, "EACCES")],
    ];
    for (const [label, mode, fsFor] of branches) {
      const checkout = createDisposableCheckout();
      const { fs: recFs, calls } = recordingFs();
      const overrides = fsFor(String(checkout.root));
      const fs = Object.freeze({ ...recFs, inspect: overrides.inspect });
      const { git } = recordingGit(mode as "throw" | "noop");
      const result = destroyDisposableCheckout({ checkout, fs, git });
      expect(result.outcome, label).toBe("CLEANUP_BLOCKED");
      expect(result.recursiveRemoveExecuted, label).toBe(false);
      expect(calls.some((call) => call.startsWith("removeTree")), label).toBe(false);
      destroyDisposableCheckout({ checkout });
    }
  });
});

describe("R3-L0C-G0 §3 — classifyRemovalState is the single, error-aware witness", () => {
  it("reports REMOVED_CONFIRMED only for ENOENT, STILL_PRESENT when present, STATE_UNKNOWN otherwise", () => {
    const base = mkdtempSync(join(tmpdir(), "g0-classify-"));
    const present = join(base, "present");
    mkdirSync(present, { recursive: true });
    const absent = join(base, "absent");
    const real = realFilesystemAdapter();
    expect(classifyRemovalState({ path: present, fs: real }).state).toBe(REMOVAL_STATES.STILL_PRESENT);
    expect(classifyRemovalState({ path: absent, fs: real }).state).toBe(REMOVAL_STATES.REMOVED_CONFIRMED);
    expect(classifyRemovalState({ path: present, fs: unreadableRootFs(present, "EPERM") }).state).toBe(REMOVAL_STATES.STATE_UNKNOWN);
    expect(classifyRemovalState({ path: absent, fs: unreadableRootFs(absent, "EACCES") }).state).toBe(REMOVAL_STATES.STATE_UNKNOWN);
  });
});

describe("R3-L0C-G0 §3 — the external sentinel is untouched by every measurement above", () => {
  it("SENTINEL_INTACT: a file outside every disposable root is byte-identical", () => {
    const base = mkdtempSync(join(tmpdir(), "g0-sentinel-fixed-"));
    const sentinel = join(base, "DO_NOT_DELETE.txt");
    writeFileSync(sentinel, "irreplaceable-user-data", "utf8");
    const before = createHash("sha256").update(readFileSync(sentinel)).digest("hex");
    const checkout = createDisposableCheckout();
    destroyDisposableCheckout({ checkout, fs: unreadableRootFs(checkout.root, "EPERM"), git: recordingGit("noop").git });
    destroyDisposableCheckout({ checkout });
    const after = createHash("sha256").update(readFileSync(sentinel)).digest("hex");
    expect(after).toBe(before);
  });
});
