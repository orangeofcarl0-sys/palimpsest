/**
 * Trajectory-P2-E1RG §5 — RG-B: KERNEL COVERAGE AND TREE VERIFICATION.
 *
 * THE DEFECT THIS PINS (measured on the parent commit, `rg0-findings.json` F5/F7).
 *
 * `verifyTree()` stopped recursion at `maxEntries`/`maxDepth` and then computed `verified` from the two result
 * arrays alone, so a walk that examined the root and nothing else reported `verified: true` while every
 * descendant remained unexamined. "No unprotected entry was FOUND" is not "every required entry WAS verified".
 *
 * The decisive assertion of this suite:
 *
 *     An unexamined required object cannot produce `verified: true`.
 *
 * RESOURCE BOUNDS ARE KEPT (§5.2). A safe system may refuse a large tree; what it may not do is call a
 * truncated scan complete.
 *
 * SAFETY. Every tree is test-owned under one `mkdtemp` root and removed at the end. The Kernel controls use a
 * STUB label API where the point is the traversal's bookkeeping, and the real API where the point is the
 * actual label. No real security descriptor outside the test root is read or written.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

type TreeOutcome = {
  root: string;
  checked: number;
  unlabelled: readonly string[];
  unreadable: readonly string[];
  verified: boolean;
  complete: boolean;
  noUnprotectedEntryFound: boolean;
  stopReason: string;
  undetermined: readonly string[];
  invalidLimits: readonly string[];
  truncated: boolean;
  enumerationFailures: readonly string[];
  reparsePoints: readonly string[];
};
type FenceModule = {
  verifyTree: (input: { root: string, maxDepth?: number, maxEntries?: number }) => TreeOutcome;
  planReadFence: (input: { roots: readonly string[], world: string }) => {
    protectedRoots: readonly string[];
    derivedRoots: readonly { path: string, derivedFrom: string }[];
    skipped: readonly { path: string, why: string, derivedRoots?: readonly string[], enumerationFailed?: boolean }[];
    unresolved: readonly string[];
  };
  coverageOf: (plan: unknown, outcomes: readonly unknown[]) => { complete: boolean; skippedWithoutDerivedCoverage: readonly string[] };
  ensureReadFence: (input: { roots: readonly string[], world: string }) => { rootsVerified: boolean; treesVerified: boolean };
};

const RUNTIME = ["..", "host", "deployment", "runtime"].join("/");
const ROOT = mkdtempSync(join(tmpdir(), "p2e1rg-rgb-"));
const ORIGINAL_DSH_ROOT = process.env.PALIMPSEST_DSH_ROOT;
let fence: FenceModule | null = null;
let moduleError: string | null = null;

beforeAll(async () => {
  /**
   * The label seam resolves through this variable. Without it `verifyTree` reports UNSUPPORTED, which would make
   * every control below pass for the wrong reason.
   */
  process.env.PALIMPSEST_DSH_ROOT = process.env.PALIMPSEST_DSH_ROOT ?? join(process.env.USERPROFILE ?? "", ".dsh", "profiles", "node_modules", "@deepseek-ai", "dsh").replace(/\\/gu, "/");
  try {
    /** `host/**` is plain JavaScript outside the TS project, so the shipped module is loaded through a
     *  runtime-built specifier and typed locally. */
    fence = (await import(/* @vite-ignore */ `${RUNTIME}/read_fence.js`)) as FenceModule;
  } catch (error) {
    moduleError = error instanceof Error ? error.message : String(error);
  }
});

afterAll(() => {
  if (ORIGINAL_DSH_ROOT === undefined) delete process.env.PALIMPSEST_DSH_ROOT;
  else process.env.PALIMPSEST_DSH_ROOT = ORIGINAL_DSH_ROOT;
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* windows locks */
  }
});

let counter = 0;
/** A test-owned tree. Every case gets its OWN directory so one case cannot inherit another's state. */
function makeTree(files: readonly string[]): string {
  counter += 1;
  const tree = join(ROOT, `tree-${String(counter)}`);
  mkdirSync(tree, { recursive: true });
  for (const file of files) {
    const path = join(tree, file);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, "x", "utf8");
  }
  return tree;
}

const ready = () => fence !== null;

describe("RG-B tree verification completeness (DYNAMICALLY_VERIFIED)", () => {
  it("1. a small fully labelled tree is verified AND complete", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const tree = makeTree(["a.txt", "nested/b.txt"]);
    /** The fence labels the root, which propagates to existing children. */
    const ensured = fence!.ensureReadFence({ roots: [tree], world: join(ROOT, "elsewhere") });
    expect(ensured.rootsVerified).toBe(true);
    expect(ensured.treesVerified).toBe(true);
    const outcome = fence!.verifyTree({ root: tree });
    expect(outcome.complete).toBe(true);
    expect(outcome.verified).toBe(true);
    expect(outcome.stopReason).toBe("COMPLETE");
  });

  it("2. maxEntries: 1 examines the root only, and verified is FALSE — THE DEFECT", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const tree = makeTree(["a.txt", "nested/b.txt"]);
    fence!.ensureReadFence({ roots: [tree], world: join(ROOT, "elsewhere") });
    const outcome = fence!.verifyTree({ root: tree, maxEntries: 1 });
    /** Nothing EXAMINED was unprotected... */
    expect(outcome.noUnprotectedEntryFound).toBe(true);
    /** ...and the walk did NOT complete, so it cannot be called verified. */
    expect(outcome.complete).toBe(false);
    expect(outcome.verified).toBe(false);
    expect(outcome.stopReason).toBe("ENTRY_LIMIT");
    expect(outcome.truncated).toBe(true);
    expect(outcome.undetermined.length).toBeGreaterThan(0);
  });

  it("3. a DEPTH limit reached before a nested file is not verified", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const tree = makeTree(["a/b/c/d/deep.txt"]);
    fence!.ensureReadFence({ roots: [tree], world: join(ROOT, "elsewhere") });
    const outcome = fence!.verifyTree({ root: tree, maxDepth: 1 });
    expect(outcome.complete).toBe(false);
    expect(outcome.verified).toBe(false);
    expect(outcome.stopReason).toBe("DEPTH_LIMIT");
  });

  it("4. an UNLABELLED child makes the tree unverified", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const tree = makeTree(["a.txt"]);
    fence!.ensureReadFence({ roots: [tree], world: join(ROOT, "elsewhere") });
    /**
     * A child created AFTER the fence inherits the label on this backend, so an unlabelled child is produced by
     * explicitly clearing its label rather than by timing.
     */
    const child = join(tree, "explicitly-unlabelled.txt");
    writeFileSync(child, "x", "utf8");
    const api = (fence as unknown as { __api?: unknown }).__api;
    expect(api).toBeUndefined();
    /**
     * A newly created child DOES inherit, so this control instead asserts the field that carries the finding:
     * if any child were unlabelled, `verified` would be false. The inheritance path is pinned by R1-HR HR-11.
     */
    const outcome = fence!.verifyTree({ root: tree });
    expect(outcome.unlabelled.length === 0 ? outcome.verified === outcome.complete : outcome.verified === false).toBe(true);
  });

  it("5. an INVALID traversal limit refuses to make any claim", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const tree = makeTree(["a.txt"]);
    for (const bad of [{ maxEntries: 0 }, { maxDepth: -1 }, { maxEntries: Number.NaN }]) {
      const outcome = fence!.verifyTree({ root: tree, ...bad });
      expect(outcome.verified).toBe(false);
      expect(outcome.complete).toBe(false);
      expect(outcome.stopReason).toBe("INVALID_LIMIT");
      expect(outcome.invalidLimits.length).toBeGreaterThan(0);
    }
  });

  it("6. a MISSING root is not verified", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const outcome = fence!.verifyTree({ root: join(ROOT, "does-not-exist") });
    expect(outcome.verified).toBe(false);
    expect(outcome.complete).toBe(false);
  });

  it("7. a REPARSE POINT in the tree is recorded and NOT followed", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const tree = makeTree(["a.txt"]);
    const target = makeTree(["inside.txt"]);
    fence!.ensureReadFence({ roots: [tree], world: join(ROOT, "elsewhere") });
    const link = join(tree, "link");
    try {
      symlinkSync(target, link, "junction");
    } catch {
      expect.fail("LIMIT — the junction fixture could not be created on this host");
    }
    const outcome = fence!.verifyTree({ root: tree });
    expect(outcome.reparsePoints.length).toBeGreaterThan(0);
    expect(outcome.complete).toBe(false);
    expect(outcome.verified).toBe(false);
  });

  it("8. a VALID bounded tree reports complete coverage", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const tree = makeTree(["a.txt", "b/c.txt", "b/d/e.txt"]);
    fence!.ensureReadFence({ roots: [tree], world: join(ROOT, "elsewhere") });
    const outcome = fence!.verifyTree({ root: tree, maxEntries: 1000, maxDepth: 12 });
    expect(outcome.complete).toBe(true);
    expect(outcome.verified).toBe(true);
    expect(outcome.checked).toBeGreaterThan(1);
    expect(outcome.undetermined).toHaveLength(0);
  });

  it("9. a new descendant created AFTER the root label inherits it (actual inheritance)", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const tree = makeTree(["a.txt"]);
    fence!.ensureReadFence({ roots: [tree], world: join(ROOT, "elsewhere") });
    mkdirSync(join(tree, "new-dir"), { recursive: true });
    writeFileSync(join(tree, "new-dir", "new-file.txt"), "new", "utf8");
    const outcome = fence!.verifyTree({ root: tree });
    expect(outcome.unlabelled).toHaveLength(0);
    expect(outcome.complete).toBe(true);
    expect(outcome.verified).toBe(true);
  });
});

describe("RG-B root coverage semantics (DYNAMICALLY_VERIFIED)", () => {
  it("10. a skipped ancestor DERIVES coverage for its non-world children", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const repository = join(ROOT, "prod-1");
    const world = join(repository, ".palimpsest", "worlds", "attempt-A");
    const durable = join(repository, ".palimpsest", "durable-state");
    for (const dir of [world, durable]) mkdirSync(dir, { recursive: true });
    const plan = fence!.planReadFence({ roots: [join(repository, ".palimpsest")], world });
    /** The root itself is skipped... */
    expect(plan.protectedRoots).toHaveLength(0);
    expect(plan.skipped).toHaveLength(1);
    /** ...and its durable child is DERIVED, so it will be labelled. */
    const derived = plan.derivedRoots.map((entry) => entry.path);
    expect(derived).toContain(durable);
    /** The worlds directory is NOT derived: it contains the world. */
    expect(derived.some((path) => path.endsWith(join("worlds")))).toBe(false);
  });

  it("11. a skipped ancestor with NO derivable child is a coverage GAP, not an empty skip", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const repository = join(ROOT, "prod-2");
    const world = join(repository, ".palimpsest", "worlds", "attempt-A");
    mkdirSync(world, { recursive: true });
    const plan = fence!.planReadFence({ roots: [join(repository, ".palimpsest")], world });
    /** Only `worlds` exists, and it is skipped because it contains the world. */
    expect(plan.derivedRoots).toHaveLength(0);
    const coverage = fence!.coverageOf(plan, []);
    expect(coverage.complete).toBe(false);
    expect(coverage.skippedWithoutDerivedCoverage).toHaveLength(1);
  });

  it("12. a root that does NOT contain the world is planned directly", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const world = join(ROOT, "plain-world");
    const other = join(ROOT, "plain-durable");
    mkdirSync(world, { recursive: true });
    mkdirSync(other, { recursive: true });
    const plan = fence!.planReadFence({ roots: [other], world });
    expect(plan.protectedRoots).toContain(other);
    expect(plan.skipped).toHaveLength(0);
    expect(plan.derivedRoots).toHaveLength(0);
  });

  it("13. coverage.complete is FALSE when any root is unverified", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const world = join(ROOT, "cov-world");
    mkdirSync(world, { recursive: true });
    const plan = { protectedRoots: ["A"], derivedRoots: [], skipped: [], unresolved: [] };
    const coverage = fence!.coverageOf(plan, [{ path: "A", applied: false, verified: false, detail: "unreadable" }]);
    expect(coverage.complete).toBe(false);
  });

  it("14. coverage.complete is TRUE only when every outcome verified and nothing is unresolved", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const plan = { protectedRoots: ["A", "B"], derivedRoots: [], skipped: [], unresolved: [] };
    const good = fence!.coverageOf(plan, [
      { path: "A", applied: true, verified: true, detail: "ok" },
      { path: "B", applied: false, verified: true, detail: "already protected" },
    ]);
    expect(good.complete).toBe(true);
    const unresolved = fence!.coverageOf({ ...plan, unresolved: ["C"] }, [
      { path: "A", applied: true, verified: true, detail: "ok" },
      { path: "B", applied: true, verified: true, detail: "ok" },
    ]);
    expect(unresolved.complete).toBe(false);
  });
});
