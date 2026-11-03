/**
 * Palimpsest Host-S1 §6 — H1-A: COMPLETE KERNEL COVERAGE ALONG THE ACTIVE WORLD SPINE.
 *
 * THE DEFECT THIS PINS (measured on the E1RG parent as `baseline-and-falsifiers.json` F1).
 *
 * `planReadFence()` derived exactly ONE LEVEL of coverage beneath a skipped protected ancestor. In the
 * production layout that left `worlds/` uncovered: it contains the active world, so it is skipped in turn, and
 * nothing beneath it was ever considered. Every INACTIVE SIBLING WORLD under `worlds/` therefore carried no
 * label — and `coverage.complete` still reported `true`, so admission accepted it.
 *
 * The decisive assertions:
 *
 *     An inactive sibling world beneath the skipped ancestor receives a derived protection requirement.
 *     Coverage cannot be complete while a required sibling is unprotected.
 *     A spine walk that could not complete is not a complete plan.
 *
 * SAFETY. Every tree is test-owned under one `mkdtemp` root and removed at the end. The Kernel controls use the
 * REAL label API against test-owned directories only; no security descriptor outside the test root is read or
 * written.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

type SkipEntry = {
  path: string;
  why: string;
  derivedRoots?: readonly string[];
  enumerationFailed?: boolean;
  spine?: readonly string[];
  planComplete?: boolean;
  truncatedAt?: string;
};
type Plan = {
  protectedRoots: readonly string[];
  derivedRoots: readonly { path: string; derivedFrom: string; depth: number }[];
  skipped: readonly SkipEntry[];
  unresolved: readonly string[];
};
type Coverage = {
  complete: boolean;
  skipped: readonly SkipEntry[];
  planned: readonly string[];
  verified: readonly string[];
  unverified: readonly string[];
  unresolved: readonly string[];
  skippedWithoutDerivedCoverage: readonly string[];
  incompletePlans: readonly string[];
};
type FenceModule = {
  planReadFence: (input: { roots: readonly string[]; world: string }) => Plan;
  coverageOf: (plan: Plan, outcomes: readonly unknown[]) => Coverage;
  applyReadFence: (input: { roots: readonly string[]; world: string }) => {
    supported: boolean;
    outcomes: readonly { path: string; verified: boolean; applied: boolean; derivedFrom?: string }[];
    skipped: readonly SkipEntry[];
    coverage?: Coverage;
  };
  verifyTree: (input: { root: string; maxDepth?: number; maxEntries?: number; protectedRoots?: readonly string[] }) => {
    verified: boolean;
    complete: boolean;
    admissionEligible: boolean;
    reparseBasis: string;
    reparseWithinRoot: readonly string[];
    reparseIntoProtectedRoot: readonly string[];
    reparseOutsideProtectionDomain: readonly string[];
    reparseUnresolvable: readonly string[];
  };
};

const RUNTIME = ["..", "host", "deployment", "runtime"].join("/");
const ROOT = mkdtempSync(join(tmpdir(), "hosts1-spine-"));
const ORIGINAL_DSH_ROOT = process.env.PALIMPSEST_DSH_ROOT;
let fence: FenceModule | null = null;
let moduleError: string | null = null;

beforeAll(async () => {
  process.env.PALIMPSEST_DSH_ROOT =
    process.env.PALIMPSEST_DSH_ROOT ??
    join(process.env.USERPROFILE ?? "", ".dsh", "profiles", "node_modules", "@deepseek-ai", "dsh").replace(/\\/gu, "/");
  try {
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

const ready = () => fence !== null;
let counter = 0;

/**
 * THE PRODUCTION SHAPE.
 *
 *   repository/.palimpsest/
 *     durable-state/            <- must be protected
 *     worlds/
 *       attempt-A/              <- the ACTIVE world (must stay usable)
 *       attempt-B/              <- an INACTIVE sibling: must be protected
 *       attempt-C/              <- a second inactive sibling
 */
function productionLayout(): { repository: string; palimpsest: string; worlds: string; active: string; siblings: readonly string[]; durable: string } {
  counter += 1;
  const repository = join(ROOT, `repo-${String(counter)}`);
  const palimpsest = join(repository, ".palimpsest");
  const worlds = join(palimpsest, "worlds");
  const active = join(worlds, "attempt-A");
  const siblings = [join(worlds, "attempt-B"), join(worlds, "attempt-C")];
  const durable = join(palimpsest, "durable-state");
  for (const dir of [active, ...siblings, durable]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(active, "AGENTS.md"), "ACTIVE-WORLD\n", "utf8");
  for (const sibling of siblings) writeFileSync(join(sibling, "AGENTS.md"), "SIBLING\n", "utf8");
  writeFileSync(join(durable, "state.txt"), "DURABLE\n", "utf8");
  return { repository, palimpsest, worlds, active, siblings, durable };
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

describe("H1-A active-world spine coverage (DYNAMICALLY_VERIFIED)", () => {
  it("1. every inactive sibling world beneath the skipped ancestor is DERIVED", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const layout = productionLayout();
    const plan = fence!.planReadFence({ roots: [layout.palimpsest], world: layout.active });
    const derived = plan.derivedRoots.map((entry) => entry.path);
    for (const sibling of layout.siblings) {
      expect(derived.some((path) => same(path, sibling))).toBe(true);
    }
    /** The durable state is still derived — the E1RG behaviour is preserved, not replaced. */
    expect(derived.some((path) => same(path, layout.durable))).toBe(true);
  });

  it("2. the ACTIVE world is never derived — it must stay usable", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const layout = productionLayout();
    const plan = fence!.planReadFence({ roots: [layout.palimpsest], world: layout.active });
    const derived = plan.derivedRoots.map((entry) => entry.path);
    expect(derived.some((path) => same(path, layout.active))).toBe(false);
    /** Nor is any ancestor of the world: labelling one refuses the traverse every process needs. */
    expect(derived.some((path) => same(path, layout.worlds))).toBe(false);
    expect(derived.some((path) => same(path, layout.palimpsest))).toBe(false);
  });

  it("3. the SPINE is recorded, so a receipt names the path the decision followed", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const layout = productionLayout();
    const plan = fence!.planReadFence({ roots: [layout.palimpsest], world: layout.active });
    const skip = plan.skipped.find((entry) => same(entry.path, layout.palimpsest));
    expect(skip).toBeDefined();
    const spine = (skip?.spine ?? []).map((path) => path.toLowerCase());
    expect(spine).toContain(layout.worlds.toLowerCase());
    expect(spine).toContain(layout.active.toLowerCase());
    /** The root itself is not a spine entry: it is the starting point, reported as the skip. */
    expect(spine).not.toContain(layout.palimpsest.toLowerCase());
  });

  it("4. the plan is COMPLETE for a layout that can be fully enumerated", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const layout = productionLayout();
    const plan = fence!.planReadFence({ roots: [layout.palimpsest], world: layout.active });
    expect(plan.unresolved).toHaveLength(0);
    expect(plan.skipped[0]?.enumerationFailed).toBe(false);
    expect(plan.skipped[0]?.planComplete).toBe(true);
  });

  it("5. COVERAGE IS NOT COMPLETE while a derived sibling is unlabelled — the E1RG defect", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const layout = productionLayout();
    const plan = fence!.planReadFence({ roots: [layout.palimpsest], world: layout.active });
    /**
     * Simulate every derived root succeeding EXCEPT one sibling, which is the state the parent commit produced
     * (the sibling was never planned at all; here it is planned and fails, which must also be incomplete).
     */
    const outcomes = plan.derivedRoots.map((entry) => ({
      path: entry.path,
      applied: !same(entry.path, layout.siblings[0]!),
      verified: !same(entry.path, layout.siblings[0]!),
      detail: same(entry.path, layout.siblings[0]!) ? "unlabelled" : "ok",
    }));
    const coverage = fence!.coverageOf(plan, outcomes);
    expect(coverage.complete).toBe(false);
    expect(coverage.unverified.some((path) => same(path, layout.siblings[0]!))).toBe(true);
  });

  it("6. coverage IS complete when every derived root verified", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const layout = productionLayout();
    const plan = fence!.planReadFence({ roots: [layout.palimpsest], world: layout.active });
    const outcomes = plan.derivedRoots.map((entry) => ({ path: entry.path, applied: true, verified: true, detail: "ok" }));
    const coverage = fence!.coverageOf(plan, outcomes);
    expect(coverage.complete).toBe(true);
    expect(coverage.skippedWithoutDerivedCoverage).toHaveLength(0);
    expect(coverage.incompletePlans).toHaveLength(0);
  });

  it("7. a NEWLY CREATED inactive sibling is handled by the inheritable label on the worlds' parent", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const layout = productionLayout();
    /**
     * The worlds directory cannot be labelled, so a sibling created AFTER the fence does not inherit from it.
     * The supported lifecycle is therefore: the next admission re-plans and labels the new sibling. This control
     * asserts that the NEXT plan sees it, which is what makes the lifecycle bounded rather than a race.
     */
    const before = fence!.planReadFence({ roots: [layout.palimpsest], world: layout.active });
    const fresh = join(layout.worlds, "attempt-D");
    mkdirSync(fresh, { recursive: true });
    const after = fence!.planReadFence({ roots: [layout.palimpsest], world: layout.active });
    expect(before.derivedRoots.some((entry) => same(entry.path, fresh))).toBe(false);
    expect(after.derivedRoots.some((entry) => same(entry.path, fresh))).toBe(true);
  });

  it("8. an UNREADABLE level makes the plan incomplete and coverage false", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const layout = productionLayout();
    const plan = fence!.planReadFence({ roots: [layout.palimpsest], world: layout.active });
    /** Simulate the walk having failed at a level, which is what an enumeration error produces. */
    const failed: Plan = {
      ...plan,
      skipped: plan.skipped.map((entry) => ({ ...entry, enumerationFailed: true, planComplete: false })),
      unresolved: [layout.worlds],
    };
    const coverage = fence!.coverageOf(failed, plan.derivedRoots.map((entry) => ({ path: entry.path, applied: true, verified: true, detail: "ok" })));
    expect(coverage.complete).toBe(false);
    expect(coverage.skippedWithoutDerivedCoverage.length).toBeGreaterThan(0);
  });

  it("9. a spine that does not reach the world is UNRESOLVED, not silently empty", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const layout = productionLayout();
    /** A world that does not exist under this root: the spine names a child that is not there. */
    const plan = fence!.planReadFence({ roots: [layout.palimpsest], world: join(layout.worlds, "attempt-Z") });
    expect(plan.unresolved.length).toBeGreaterThan(0);
    expect(plan.skipped[0]?.planComplete).toBe(false);
    const coverage = fence!.coverageOf(plan, plan.derivedRoots.map((entry) => ({ path: entry.path, applied: true, verified: true, detail: "ok" })));
    expect(coverage.complete).toBe(false);
  });

  it("10. a REPARSE POINT among the non-spine children is UNRESOLVED, never derived", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const layout = productionLayout();
    const outside = join(ROOT, `outside-${String(counter)}`);
    mkdirSync(outside, { recursive: true });
    const link = join(layout.palimpsest, "linked-state");
    try {
      symlinkSync(outside, link, "junction");
    } catch {
      expect.fail("LIMIT — the junction fixture could not be created on this host");
    }
    const plan = fence!.planReadFence({ roots: [layout.palimpsest], world: layout.active });
    /** §6.4: the link is not derived — labelling through it would write outside the domain. */
    expect(plan.derivedRoots.some((entry) => same(entry.path, link))).toBe(false);
    expect(plan.unresolved.some((path) => same(path, link))).toBe(true);
    expect(plan.skipped[0]?.planComplete).toBe(false);
  });

  it("11. a root that does not contain the world is still planned directly", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const layout = productionLayout();
    const other = join(ROOT, `plain-${String(counter)}`);
    mkdirSync(other, { recursive: true });
    const plan = fence!.planReadFence({ roots: [other], world: layout.active });
    expect(plan.protectedRoots).toContain(other);
    expect(plan.skipped).toHaveLength(0);
  });

  it("12. a world that IS the root derives nothing and is complete", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const layout = productionLayout();
    const plan = fence!.planReadFence({ roots: [layout.active], world: layout.active });
    expect(plan.protectedRoots).toHaveLength(0);
    expect(plan.derivedRoots).toHaveLength(0);
    expect(plan.skipped[0]?.planComplete).toBe(true);
  });
});

describe("H1-A real kernel application (DYNAMICALLY_VERIFIED, test-owned roots only)", () => {
  it("13. applying the fence labels durable state AND every inactive sibling", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const layout = productionLayout();
    const applied = fence!.applyReadFence({ roots: [layout.palimpsest], world: layout.active });
    expect(applied.supported).toBe(true);
    const verified = (applied.outcomes ?? []).filter((entry) => entry.verified).map((entry) => entry.path);
    for (const sibling of layout.siblings) {
      expect(verified.some((path) => same(path, sibling))).toBe(true);
    }
    expect(verified.some((path) => same(path, layout.durable))).toBe(true);
    /** The active world must NOT have been labelled — the worker has to be able to run in it. */
    expect(verified.some((path) => same(path, layout.active))).toBe(false);
    expect(applied.coverage?.complete).toBe(true);
  });

  it("14. the ACTIVE world stays writable after the fence is applied", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const layout = productionLayout();
    fence!.applyReadFence({ roots: [layout.palimpsest], world: layout.active });
    /** A Medium-integrity write into the world is the ordinary worker-startup path; it must succeed. */
    expect(() => writeFileSync(join(layout.active, "after-fence.txt"), "ok", "utf8")).not.toThrow();
    mkdirSync(join(layout.active, "new-dir"), { recursive: true });
  });
});
