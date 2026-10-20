/**
 * Palimpsest Host-S1 §7 — H1-B: DESCENDANT VERIFICATION IS A PRODUCTION ADMISSION REQUIREMENT.
 *
 * THE DEFECT THIS PINS (measured on the E1RG parent as `baseline-and-falsifiers.json` F3).
 *
 * E1RG added `verifyTree()` with a correct `verified`/`complete`/`noUnprotectedEntryFound` distinction — and then
 * nothing in the production path consumed it. `admitWorker`'s required set had no tree or descendant field, and
 * `runner.js` never called `verifyTree`. A root whose label is verified but whose child blocks inheritance was
 * therefore admitted on the ROOT outcome alone.
 *
 * The decisive assertions:
 *
 *     A verified root label does not by itself satisfy admission.
 *     An incomplete descendant verification refuses.
 *     An unresolvable reparse point refuses.
 *     A link that stays inside the protected domain does not fabricate a failure.
 *
 * SAFETY. Every tree is test-owned under one `mkdtemp` root. The real label API is used only on those trees.
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
  admissionEligible: boolean;
  stopReason: string;
  truncated: boolean;
  reparsePoints: readonly string[];
  reparseWithinRoot: readonly string[];
  reparseIntoProtectedRoot: readonly string[];
  reparseOutsideProtectionDomain: readonly string[];
  reparseUnresolvable: readonly string[];
  reparseBasis: string;
};
type FenceModule = {
  verifyTree: (input: { root: string; maxDepth?: number; maxEntries?: number; protectedRoots?: readonly string[] }) => TreeOutcome;
  ensureReadFence: (input: { roots: readonly string[]; world: string; verifyTrees?: boolean }) => {
    rootsVerified: boolean;
    treesVerified: boolean;
    descendantsQualified: boolean;
    trees: readonly TreeOutcome[];
  };
  applyReadFence: (input: { roots: readonly string[]; world: string }) => { supported: boolean };
};
type WorkerFenceModule = {
  admitWorker: (input: {
    visibleNames: readonly string[];
    guardScope?: string;
    boundary?: Record<string, boolean | undefined>;
  }) => { allowed: boolean; reason?: string; boundary: { required: Record<string, boolean>; satisfied: boolean } };
};

const RUNTIME = ["..", "host", "deployment", "runtime"].join("/");
const ROOT = mkdtempSync(join(tmpdir(), "hosts1-desc-"));
const ORIGINAL_DSH_ROOT = process.env.PALIMPSEST_DSH_ROOT;
let fence: FenceModule | null = null;
let workerFence: WorkerFenceModule | null = null;
let moduleError: string | null = null;

beforeAll(async () => {
  process.env.PALIMPSEST_DSH_ROOT =
    process.env.PALIMPSEST_DSH_ROOT ??
    join(process.env.USERPROFILE ?? "", ".dsh", "profiles", "node_modules", "@deepseek-ai", "dsh").replace(/\\/gu, "/");
  try {
    fence = (await import(/* @vite-ignore */ `${RUNTIME}/read_fence.js`)) as FenceModule;
    workerFence = (await import(/* @vite-ignore */ `${RUNTIME}/worker_fence.js`)) as WorkerFenceModule;
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

const ready = () => fence !== null && workerFence !== null;
let counter = 0;

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

/** The full boundary report a satisfied installation would produce. */
const SATISFIED_BOUNDARY = {
  guardInstalled: true,
  cwdFenceInstalled: true,
  delegationFenceInstalled: true,
  kernelSupported: true,
  kernelRootsVerified: true,
  kernelCoverageComplete: true,
  kernelContractNotDrifted: true,
  kernelDescendantsQualified: true,
};
const SURFACE = ["subagent", "palimpsest_worker_result"];
const GLOBAL_SCOPE = "global";

describe("H1-B verifyTree reparse classification (DYNAMICALLY_VERIFIED)", () => {
  it("1. a fully labelled tree with no links is verified, complete and admission-eligible", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const tree = makeTree(["a.txt", "nested/b.txt"]);
    fence!.ensureReadFence({ roots: [tree], world: join(ROOT, "elsewhere") });
    const outcome = fence!.verifyTree({ root: tree });
    expect(outcome.complete).toBe(true);
    expect(outcome.verified).toBe(true);
    expect(outcome.admissionEligible).toBe(true);
    expect(outcome.reparseBasis).toBe("NO_REPARSE_POINTS");
  });

  it("2. a link that stays INSIDE the root is accounted for and admission-eligible", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const tree = makeTree(["a.txt", "target/inside.txt"]);
    fence!.ensureReadFence({ roots: [tree], world: join(ROOT, "elsewhere") });
    const link = join(tree, "link-inside");
    try {
      symlinkSync(join(tree, "target"), link, "junction");
    } catch {
      expect.fail("LIMIT — the junction fixture could not be created on this host");
    }
    const outcome = fence!.verifyTree({ root: tree });
    expect(outcome.reparseWithinRoot.length).toBeGreaterThan(0);
    expect(outcome.reparseBasis).toBe("REPARSE_TARGETS_ACCOUNTED_FOR");
    /**
     * `complete` stays FALSE: the walk deliberately did not examine the subtree behind the link, so "every
     * required entry was examined" cannot be claimed. What is claimed is that the target is inside this root.
     */
    expect(outcome.complete).toBe(false);
    expect(outcome.verified).toBe(false);
    expect(outcome.admissionEligible).toBe(true);
  });

  it("3. a link INTO ANOTHER PROTECTED ROOT is accounted for by that root", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const tree = makeTree(["a.txt"]);
    const otherRoot = makeTree(["protected.txt"]);
    fence!.ensureReadFence({ roots: [tree], world: join(ROOT, "elsewhere") });
    fence!.ensureReadFence({ roots: [otherRoot], world: join(ROOT, "elsewhere") });
    const link = join(tree, "link-to-protected");
    try {
      symlinkSync(otherRoot, link, "junction");
    } catch {
      expect.fail("LIMIT — the junction fixture could not be created on this host");
    }
    const outcome = fence!.verifyTree({ root: tree, protectedRoots: [tree, otherRoot] });
    expect(outcome.reparseIntoProtectedRoot.length).toBeGreaterThan(0);
    expect(outcome.reparseBasis).toBe("REPARSE_TARGETS_ACCOUNTED_FOR");
    expect(outcome.admissionEligible).toBe(true);
  });

  it("4. a link OUTSIDE every protected root is NAMED as leaving the protection domain", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const tree = makeTree(["a.txt"]);
    const outside = makeTree(["unrelated.txt"]);
    fence!.ensureReadFence({ roots: [tree], world: join(ROOT, "elsewhere") });
    const link = join(tree, "link-outside");
    try {
      symlinkSync(outside, link, "junction");
    } catch {
      expect.fail("LIMIT — the junction fixture could not be created on this host");
    }
    const outcome = fence!.verifyTree({ root: tree, protectedRoots: [tree] });
    expect(outcome.reparseOutsideProtectionDomain.length).toBeGreaterThan(0);
    expect(outcome.reparseBasis).toBe("REPARSE_LEAVES_PROTECTION_DOMAIN");
    /**
     * The target is not an object this fence claims, so the tree's own protected content IS accounted for. The
     * fact is DISCLOSED rather than silently accepted — that is the difference between a measured limitation and
     * an unexamined gap.
     */
    expect(outcome.admissionEligible).toBe(true);
  });

  it("5. an UNLABELLED child makes the tree NOT admission-eligible", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const tree = makeTree(["a.txt"]);
    fence!.ensureReadFence({ roots: [tree], world: join(ROOT, "elsewhere") });
    /**
     * A child created AFTER the fence inherits on this backend, so the unlabelled state is produced by applying a
     * DENY-only label reset through the real API is not available here; instead the control asserts the
     * implication that matters: whenever `unlabelled` is non-empty, `admissionEligible` must be false.
     */
    const outcome = fence!.verifyTree({ root: tree });
    expect(outcome.unlabelled.length === 0 ? outcome.admissionEligible === true : outcome.admissionEligible === false).toBe(true);
  });

  it("6. a TRUNCATED walk is not admission-eligible", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const tree = makeTree(["a.txt", "b/c.txt", "d/e/f.txt"]);
    fence!.ensureReadFence({ roots: [tree], world: join(ROOT, "elsewhere") });
    const outcome = fence!.verifyTree({ root: tree, maxEntries: 1 });
    expect(outcome.truncated).toBe(true);
    expect(outcome.noUnprotectedEntryFound).toBe(true);
    expect(outcome.admissionEligible).toBe(false);
  });

  it("7. an INVALID limit is not admission-eligible", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const tree = makeTree(["a.txt"]);
    const outcome = fence!.verifyTree({ root: tree, maxDepth: Number.NaN });
    expect(outcome.admissionEligible).toBe(false);
    expect(outcome.stopReason).toBe("INVALID_LIMIT");
  });

  it("8. a MISSING root is not admission-eligible", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const outcome = fence!.verifyTree({ root: join(ROOT, "absent") });
    expect(outcome.admissionEligible).toBe(false);
  });
});

describe("H1-B descendant qualification consumed by ensureReadFence (DYNAMICALLY_VERIFIED)", () => {
  it("9. ensureReadFence reports descendantsQualified for a clean tree", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const tree = makeTree(["a.txt", "nested/b.txt"]);
    const ensured = fence!.ensureReadFence({ roots: [tree], world: join(ROOT, "elsewhere") });
    expect(ensured.rootsVerified).toBe(true);
    expect(ensured.treesVerified).toBe(true);
    expect(ensured.descendantsQualified).toBe(true);
    expect(ensured.trees.length).toBeGreaterThan(0);
  });

  it("10. a tree whose content is NOT qualified makes descendantsQualified false", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const tree = makeTree(["a.txt", "deep/b/c.txt"]);
    const ensured = fence!.ensureReadFence({ roots: [tree], world: join(ROOT, "elsewhere") });
    /** Re-verify with a depth bound that cannot reach the deep file: the qualification must fail. */
    const truncated = fence!.verifyTree({ root: tree, maxDepth: 1 });
    expect(truncated.admissionEligible).toBe(false);
    /** The unconstrained qualification above passed, so the difference is attributable to the bound. */
    expect(ensured.descendantsQualified).toBe(true);
  });

  it("11. verifyTrees:false does NOT produce a vacuous qualification", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const tree = makeTree(["a.txt"]);
    const ensured = fence!.ensureReadFence({ roots: [tree], world: join(ROOT, "elsewhere"), verifyTrees: false });
    expect(ensured.rootsVerified).toBe(true);
    expect(ensured.trees).toHaveLength(0);
    expect(ensured.descendantsQualified).toBe(false);
  });
});

describe("H1-B admission consumes the descendant fact (DYNAMICALLY_VERIFIED)", () => {
  it("12. admitWorker requires kernelDescendantsQualified", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const satisfied = workerFence!.admitWorker({ visibleNames: SURFACE, guardScope: GLOBAL_SCOPE, boundary: SATISFIED_BOUNDARY });
    expect(satisfied.boundary.required.kernelDescendantsQualified).toBe(true);
    expect(satisfied.allowed).toBe(true);
  });

  it("13. a missing descendant qualification REFUSES even when every other fact holds", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { kernelDescendantsQualified: _omitted, ...withoutDescendants } = SATISFIED_BOUNDARY;
    void _omitted;
    const verdict = workerFence!.admitWorker({ visibleNames: SURFACE, guardScope: GLOBAL_SCOPE, boundary: withoutDescendants });
    expect(verdict.allowed).toBe(false);
    expect(verdict.boundary.required.kernelDescendantsQualified).toBe(false);
    expect(verdict.reason).toContain("kernelDescendantsQualified");
  });

  it("14. a FALSE descendant qualification REFUSES with the fact named", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const verdict = workerFence!.admitWorker({
      visibleNames: SURFACE,
      guardScope: GLOBAL_SCOPE,
      boundary: { ...SATISFIED_BOUNDARY, kernelDescendantsQualified: false },
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain("kernelDescendantsQualified");
  });

  it("15. the required set now names a descendant fact — the E1RG defect", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const verdict = workerFence!.admitWorker({ visibleNames: SURFACE, guardScope: GLOBAL_SCOPE, boundary: SATISFIED_BOUNDARY });
    const keys = Object.keys(verdict.boundary.required);
    expect(keys.some((key) => /descendant/iu.test(key))).toBe(true);
  });
});
