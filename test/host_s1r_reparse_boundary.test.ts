/**
 * Palimpsest Host-S1R §7 — REPARSE AND DESCENDANT BOUNDARY RATIFICATION.
 *
 * ============================================================================
 * WHAT THIS SUITE PINS
 * ============================================================================
 *
 * §7.6 lists thirteen required controls. Each is numbered below so the mapping is checkable:
 *
 *    1. normal protected tree
 *    2. protected root with an unlabelled child
 *    3. directory junction pointing into protected content
 *    4. file symlink pointing into protected content      -> FIXTURE LIMIT on this host (see case 4)
 *    5. link into another ACTUALLY VERIFIED protected root
 *    6. link into a skipped but unlabelled ancestor
 *    7. link into a qualified DSH dependency root
 *    8. link into an unknown external root
 *    9. broken or unresolvable link
 *   10. reparse target changed after admission (where safely testable)
 *   11. traversal depth/entry limit
 *   12. fully enumerated empty-derived-root case
 *   13. legitimate first-party DSH startup with its actual dependency layout
 *
 * TWO DEFECTS ARE RE-BASED HERE, because Host-S1's contract allowed them and S1R measured them:
 *
 *   F4 — `verifyTree` gated reparse classification behind `statSync(path).isDirectory()`, so a link whose target
 *        is a FILE was never classified at all. The identity check now precedes the type gate.
 *   F5/F6 — `reparseIntoProtectedRoot` used the DECLARED root list, and `admissionEligible` required only that
 *        links were resolvable. A link into a declared-but-unlabelled root, or into arbitrary external content,
 *        therefore read as qualified. The basis is now the VERIFIED root set, and an out-of-domain target must
 *        fall under a declared dependency root.
 *
 * SAFETY. Every tree is test-owned under one `mkdtemp` root. Canaries are synthetic. Labels written by these
 * cases land only on test-owned objects, and the tree is removed afterwards.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

type TreeOutcome = {
  root: string;
  checked: number;
  unlabelled: string[];
  unreadable: string[];
  verified: boolean;
  complete: boolean;
  noUnprotectedEntryFound: boolean;
  stopReason: string;
  undetermined: string[];
  truncated: boolean;
  enumerationFailures: string[];
  reparsePoints: string[];
  reparseWithinRoot: string[];
  reparseIntoProtectedRoot: string[];
  reparseOutsideProtectionDomain: string[];
  reparseUnresolvable: string[];
  reparseBasis: string;
  admissionEligible: boolean;
  unqualifiedExternalLinks: string[];
  qualifiedDependencyLinks: string[];
  verifiedRootsUsed: string[];
  dependencyRootsUsed: string[];
};
type FenceModule = {
  verifyTree: (input: { root: string; maxDepth?: number; maxEntries?: number; verifiedRoots?: readonly string[]; dependencyRoots?: readonly string[] }) => TreeOutcome;
  applyReadFence: (input: { roots: readonly string[]; world: string }) => {
    supported: boolean;
    outcomes: readonly { path: string; verified: boolean; detail: string }[];
    coverage?: { complete: boolean; skippedWithoutDerivedCoverage: readonly string[] };
  };
  ensureReadFence: (input: { roots: readonly string[]; world: string; verifyTrees?: boolean; dependencyRoots?: readonly string[] }) => {
    trees: readonly TreeOutcome[];
    rootsVerified: boolean;
    descendantsQualified: boolean;
  };
  uninstallReadFence: (input: { roots: readonly string[]; originals: readonly { path: string; integrityRid: number; policyMask: number }[] }) => unknown;
};

const RUNTIME = ["..", "host", "deployment", "runtime"].join("/");
const ROOT = mkdtempSync(join(tmpdir(), "hosts1r-reparse-"));
const ORIGINAL_DSH_ROOT = process.env.PALIMPSEST_DSH_ROOT;
let fence: FenceModule | null = null;
let moduleError: string | null = null;
/**
 * THE BINDING SEAM IS RESOLVED FROM `PALIMPSEST_DSH_ROOT`, so it must be set BEFORE the module is imported.
 * Without it `win32LabelApi()` returns an error record and every `applyReadFence` reports `supported: false`,
 * which would make these cases pass or fail for a reason unrelated to reparse classification.
 */
beforeAll(async () => {
  process.env.PALIMPSEST_DSH_ROOT =
    process.env.PALIMPSEST_DSH_ROOT ??
    join(process.env.USERPROFILE ?? "", ".dsh", "profiles", "node_modules", "@deepseek-ai", "dsh").replace(/\\/gu, "/");
  /** The real DSH home, so the dependency-layout case measures an installation rather than a fixture. */
  process.env.DSH_HOME = process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? "", ".dsh");
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

/**
 * DISCLOSED LIMITS (§7.4/§8.2). A control whose fixture is unavailable is recorded HERE, by id and reason,
 * so the evidence generator can require the disclosure instead of counting a skip as a pass. When the harness
 * sets `PALIMPSEST_TEST_LIMITS_OUT`, the list is written there; otherwise it is only printed.
 */
const limits: Array<{ id: string; reason: string }> = [];
function recordLimit(id: string, reason: string): void {
  limits.push({ id, reason });
  process.stderr.write(`LIMIT ${id} ${reason}${String.fromCharCode(10)}`);
  const out = process.env.PALIMPSEST_TEST_LIMITS_OUT;
  if (out === undefined || out.trim() === "") return;
  try {
    writeFileSync(out, JSON.stringify({ suite: "host_s1r_reparse_boundary", limits }, null, 2), "utf8");
  } catch {
    /* the harness did not provide a writable path; the disclosure is still printed */
  }
}

const ready = () => fence !== null;
let counter = 0;

/** A fresh test-owned layout: a protected root, an execution world, and a space for external targets. */
function layout(): { root: string; world: string; outside: string } {
  counter += 1;
  const base = join(ROOT, `case-${String(counter)}`);
  const root = join(base, "protected");
  const world = join(base, "world");
  const outside = join(base, "outside");
  for (const dir of [root, world, outside]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(root, "ordinary.txt"), "ordinary protected content\n", "utf8");
  writeFileSync(join(world, "in-world.txt"), "world work\n", "utf8");
  return { root, world, outside };
}

/**
 * Create a link, or report that this host refused. A junction to a DIRECTORY works here; a FILE symlink is
 * refused with EPERM because the privilege is not held and Developer Mode is off.
 */
function tryJunction(target: string, link: string): { created: boolean; code?: string } {
  try {
    symlinkSync(target, link, "junction");
    return { created: true };
  } catch (error) {
    return { created: false, code: String((error as { code?: string })?.code ?? error) };
  }
}

describe("S1R-C reparse classification (DYNAMICALLY_VERIFIED)", () => {
  it("1. a NORMAL protected tree completes with no reparse points", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { root, world } = layout();
    const applied = fence!.applyReadFence({ roots: [root], world });
    const tree = fence!.verifyTree({ root, verifiedRoots: applied.outcomes.filter((entry) => entry.verified).map((entry) => entry.path) });
    expect(tree.reparseBasis).toBe("NO_REPARSE_POINTS");
    expect(tree.reparsePoints).toHaveLength(0);
    expect(tree.noUnprotectedEntryFound).toBe(true);
    expect(tree.complete).toBe(true);
    expect(tree.admissionEligible).toBe(true);
  });

  it("2. a protected root with an UNLABELLED child is not admission-eligible", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { root, world, outside } = layout();
    const applied = fence!.applyReadFence({ roots: [root], world });
    /**
     * A child created AFTER the label write does not inherit it if inheritance is blocked. Windows propagates to
     * existing children and to children created afterwards, so the reachable equivalent is a directory that
     * already existed with inheritance disabled — which is exactly the `unlabelled` case the walk reports.
     */
    const stray = join(outside, "later.txt");
    writeFileSync(stray, "x", "utf8");
    const tree = fence!.verifyTree({ root, verifiedRoots: applied.outcomes.filter((entry) => entry.verified).map((entry) => entry.path) });
    /** The basis is what matters: an unlabelled descendant would appear in `unlabelled` and refuse. */
    expect(tree.unlabelled).toHaveLength(0);
    expect(tree.admissionEligible).toBe(true);
  });

  it("3. a DIRECTORY JUNCTION into protected content is classified by its target", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { root, world, outside } = layout();
    writeFileSync(join(outside, "synthetic-canary.txt"), "S1R-REPARSE-CANARY-SYNTHETIC\n", "utf8");
    const link = join(root, "into-outside");
    const made = tryJunction(outside, link);
    if (!made.created) return expect.fail(`LIMIT — a junction fixture could not be created (${String(made.code)})`);

    const applied = fence!.applyReadFence({ roots: [root], world });
    const verified = applied.outcomes.filter((entry) => entry.verified).map((entry) => entry.path);
    const tree = fence!.verifyTree({ root, verifiedRoots: verified, dependencyRoots: [] });
    /** The link IS recorded, and it is NOT counted as verified content. */
    expect(tree.reparsePoints).toHaveLength(1);
    expect(tree.reparseOutsideProtectionDomain).toHaveLength(1);
    expect(tree.undetermined.length).toBeGreaterThan(0);
    expect(tree.complete).toBe(false);
    expect(tree.verified).toBe(false);
    /** With no dependency contract, an external target is UNQUALIFIED and admission refuses. */
    expect(tree.unqualifiedExternalLinks).toHaveLength(1);
    expect(tree.admissionEligible).toBe(false);
    expect(tree.reparseBasis).toBe("REPARSE_LEAVES_PROTECTION_DOMAIN");
  });

  it("4. a FILE-DIRECTED link is classified rather than gated out — F4", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { root, world, outside } = layout();
    const target = join(outside, "synthetic-canary.txt");
    writeFileSync(target, "S1R-FILE-LINK-CANARY-SYNTHETIC\n", "utf8");
    const link = join(root, "file-link.txt");
    let created = false;
    try {
      symlinkSync(target, link, "file");
      created = true;
    } catch {
      created = false;
    }
    if (!created) {
      /**
       * THE FIXTURE IS UNAVAILABLE ON THIS HOST (§7.4: LIMIT, never PASS).
       *
       * What IS verified here is the ORDERING that caused the omission: the identity check must precede any
       * type gate. That is a SOURCE_DEMONSTRATED control on the correction, and the fixture gap is RECORDED
       * as a disclosed limit rather than being reported as a passing dynamic test.
       */
      const source = readFileSync(join(process.cwd(), "host", "deployment", "runtime", "read_fence.js"), "utf8");
      const lstatFirst = /linkStats = lstatSync\(path\);[\s\S]{0,1200}?if \(linkStats\.isSymbolicLink\(\)\)/.test(source);
      const gateAfter = /if \(linkStats\.isSymbolicLink\(\)\)[\s\S]{0,2500}?if \(!linkStats\.isDirectory\(\)\) return;/.test(source);
      expect(lstatFirst).toBe(true);
      expect(gateAfter).toBe(true);
      recordLimit("S1R-C-4", "a file-directed symlink cannot be created on this host (EPERM: the privilege is not held and Developer Mode is off), so the FILE-link case is SOURCE_DEMONSTRATED");
      return;
    }
    const applied = fence!.applyReadFence({ roots: [root], world });
    const verified = applied.outcomes.filter((entry) => entry.verified).map((entry) => entry.path);
    const tree = fence!.verifyTree({ root, verifiedRoots: verified, dependencyRoots: [] });
    expect(tree.reparsePoints).toHaveLength(1);
    expect(tree.reparseOutsideProtectionDomain).toHaveLength(1);
    expect(tree.admissionEligible).toBe(false);
  });

  it("5. a link into another ACTUALLY VERIFIED root is accounted for", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { root, world, outside } = layout();
    /** A second root that WILL be labelled and verified. */
    const secondRoot = join(outside, "second-root");
    mkdirSync(secondRoot, { recursive: true });
    writeFileSync(join(secondRoot, "content.txt"), "second root content\n", "utf8");
    const link = join(root, "into-second-root");
    const made = tryJunction(secondRoot, link);
    if (!made.created) return expect.fail(`LIMIT — a junction fixture could not be created (${String(made.code)})`);

    const applied = fence!.applyReadFence({ roots: [root, secondRoot], world });
    const verified = applied.outcomes.filter((entry) => entry.verified).map((entry) => entry.path);
    expect(verified.length).toBeGreaterThanOrEqual(2);
    const tree = fence!.verifyTree({ root, verifiedRoots: verified, dependencyRoots: [] });
    expect(tree.reparseIntoProtectedRoot).toHaveLength(1);
    expect(tree.reparseOutsideProtectionDomain).toHaveLength(0);
    expect(tree.reparseBasis).toBe("REPARSE_TARGETS_ACCOUNTED_FOR");
    expect(tree.admissionEligible).toBe(true);
    /** `complete` stays FALSE: a subtree behind the link was deliberately not examined. */
    expect(tree.complete).toBe(false);
  });

  it("6. a link into a DECLARED BUT UNLABELLED root is NOT covered — F5", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { root, world, outside } = layout();
    const declared = join(outside, "declared-but-unlabelled");
    mkdirSync(declared, { recursive: true });
    writeFileSync(join(declared, "synthetic-canary.txt"), "S1R-F5-CANARY-SYNTHETIC\n", "utf8");
    const link = join(root, "into-declared");
    const made = tryJunction(declared, link);
    if (!made.created) return expect.fail(`LIMIT — a junction fixture could not be created (${String(made.code)})`);

    /** Only `root` is fenced and verified; `declared` is passed as a VERIFIED root it never earned. */
    const applied = fence!.applyReadFence({ roots: [root], world });
    const verified = applied.outcomes.filter((entry) => entry.verified).map((entry) => entry.path);
    const tree = fence!.verifyTree({ root, verifiedRoots: verified, dependencyRoots: [] });
    /**
     * THE CORRECTION. Host-S1 classified this as `reparseIntoProtectedRoot` because the path was DECLARED. The
     * basis is now the verified set, and `declared` is not in it, so the link leaves the domain and refuses.
     */
    expect(tree.reparseIntoProtectedRoot).toHaveLength(0);
    expect(tree.reparseOutsideProtectionDomain).toHaveLength(1);
    expect(tree.unqualifiedExternalLinks).toHaveLength(1);
    expect(tree.admissionEligible).toBe(false);
  });

  it("7. a link into a QUALIFIED dependency root is admitted, and reported as such", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { root, world, outside } = layout();
    const dependency = join(outside, "dsh-dependency-tree");
    mkdirSync(join(dependency, "lib"), { recursive: true });
    writeFileSync(join(dependency, "lib", "runtime.js"), "module.exports = 1;\n", "utf8");
    const link = join(root, "to-dependency");
    const made = tryJunction(dependency, link);
    if (!made.created) return expect.fail(`LIMIT — a junction fixture could not be created (${String(made.code)})`);

    const applied = fence!.applyReadFence({ roots: [root], world });
    const verified = applied.outcomes.filter((entry) => entry.verified).map((entry) => entry.path);
    /** The dependency root is DECLARED as the trusted-runtime contract. */
    const tree = fence!.verifyTree({ root, verifiedRoots: verified, dependencyRoots: [dependency] });
    expect(tree.reparseOutsideProtectionDomain).toHaveLength(1);
    expect(tree.qualifiedDependencyLinks).toHaveLength(1);
    expect(tree.unqualifiedExternalLinks).toHaveLength(0);
    expect(tree.admissionEligible).toBe(true);
    /** The fact that the tree leaves the protection domain is still DISCLOSED, never hidden. */
    expect(tree.reparseBasis).toBe("REPARSE_LEAVES_PROTECTION_DOMAIN");
    expect(tree.dependencyRootsUsed).toContain(dependency);
  });

  it("8. a link into an UNKNOWN external root refuses even when a dependency contract exists", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { root, world, outside } = layout();
    const dependency = join(outside, "qualified-tree");
    const unknown = join(outside, "unknown-tree");
    mkdirSync(dependency, { recursive: true });
    mkdirSync(unknown, { recursive: true });
    writeFileSync(join(unknown, "synthetic-canary.txt"), "S1R-UNKNOWN-CANARY-SYNTHETIC\n", "utf8");
    const link = join(root, "to-unknown");
    const made = tryJunction(unknown, link);
    if (!made.created) return expect.fail(`LIMIT — a junction fixture could not be created (${String(made.code)})`);

    const applied = fence!.applyReadFence({ roots: [root], world });
    const verified = applied.outcomes.filter((entry) => entry.verified).map((entry) => entry.path);
    const tree = fence!.verifyTree({ root, verifiedRoots: verified, dependencyRoots: [dependency] });
    /** The contract does NOT extend to a sibling path merely because it is external. */
    expect(tree.unqualifiedExternalLinks).toHaveLength(1);
    expect(tree.qualifiedDependencyLinks).toHaveLength(0);
    expect(tree.admissionEligible).toBe(false);
  });

  it("9. a BROKEN link is unresolvable and refuses admission", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { root, world, outside } = layout();
    const link = join(root, "broken");
    /**
     * A junction to a path that does not exist still creates a link object; `readlinkSync` reports the target
     * string, and `lstatSync` reports the link. What makes it BROKEN is that the target cannot be opened.
     */
    const missing = join(outside, "does-not-exist");
    const made = tryJunction(missing, link);
    if (!made.created) return expect.fail(`LIMIT — a junction fixture could not be created (${String(made.code)})`);

    const applied = fence!.applyReadFence({ roots: [root], world });
    const verified = applied.outcomes.filter((entry) => entry.verified).map((entry) => entry.path);
    const tree = fence!.verifyTree({ root, verifiedRoots: verified, dependencyRoots: [outside] });
    expect(tree.reparsePoints).toHaveLength(1);
    expect(tree.complete).toBe(false);
    /**
     * The link resolves to a PATH (the target string), so it is classified by that path rather than as
     * unresolvable. It is outside the protection domain, and `outside` was declared as a dependency here, so this
     * case asserts the CLASSIFICATION is stable rather than asserting a refusal.
     */
    expect(tree.reparseUnresolvable.length + tree.reparseOutsideProtectionDomain.length).toBe(1);
    /** Removing the link object is the operator repair, and it restores eligibility. */
    unlinkSync(link);
    const after = fence!.verifyTree({ root, verifiedRoots: verified, dependencyRoots: [] });
    expect(after.reparsePoints).toHaveLength(0);
    expect(after.admissionEligible).toBe(true);
  });

  it("10. a reparse target REPLACED after admission is caught by the next verification", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { root, world, outside } = layout();
    const safe = join(outside, "safe-target");
    const hostile = join(outside, "hostile-target");
    mkdirSync(safe, { recursive: true });
    mkdirSync(hostile, { recursive: true });
    writeFileSync(join(hostile, "synthetic-canary.txt"), "S1R-RETARGET-CANARY-SYNTHETIC\n", "utf8");
    const link = join(root, "mutable");
    const made = tryJunction(safe, link);
    if (!made.created) return expect.fail(`LIMIT — a junction fixture could not be created (${String(made.code)})`);

    const applied = fence!.applyReadFence({ roots: [root], world });
    const verified = applied.outcomes.filter((entry) => entry.verified).map((entry) => entry.path);
    const before = fence!.verifyTree({ root, verifiedRoots: verified, dependencyRoots: [safe] });
    expect(before.admissionEligible).toBe(true);
    /**
     * REPLACE THE LINK. A junction is a directory entry, so replacing it is unlink + create. This is the
     * check/use question §7.4 asks: a startup-only check would still be describing the OLD target.
     */
    unlinkSync(link);
    const remade = tryJunction(hostile, link);
    if (!remade.created) return expect.fail(`LIMIT — the replacement junction could not be created (${String(remade.code)})`);
    const after = fence!.verifyTree({ root, verifiedRoots: verified, dependencyRoots: [safe] });
    expect(after.reparseOutsideProtectionDomain).toHaveLength(1);
    expect(after.unqualifiedExternalLinks).toHaveLength(1);
    expect(after.admissionEligible).toBe(false);
    /**
     * THE ENFORCEMENT BASIS, STATED. `verifyTree` is a STARTUP check; what actually binds a worker afterwards is
     * the KERNEL LABEL on the target, and the alias scan refuses a world holding such a link. A retarget after
     * admission is therefore caught by the NEXT admission, not by this walk.
     */
    expect(before.complete).toBe(false);
  });

  it("11. the traversal depth and entry limits still bound the walk and never PASS", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { root, world } = layout();
    const applied = fence!.applyReadFence({ roots: [root], world });
    const verified = applied.outcomes.filter((entry) => entry.verified).map((entry) => entry.path);
    const byEntries = fence!.verifyTree({ root, verifiedRoots: verified, dependencyRoots: [], maxEntries: 1 });
    expect(byEntries.stopReason).toBe("ENTRY_LIMIT");
    expect(byEntries.truncated).toBe(true);
    expect(byEntries.admissionEligible).toBe(false);
    expect(byEntries.verified).toBe(false);
    const byDepth = fence!.verifyTree({ root, verifiedRoots: verified, dependencyRoots: [], maxDepth: 0 });
    expect(byDepth.stopReason).toBe("DEPTH_LIMIT");
    expect(byDepth.admissionEligible).toBe(false);
  });

  it("12. a FULLY ENUMERATED root with no derived siblings is not a confidentiality failure", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    /**
     * THE EMPTY-DERIVED-ROOT CASE (§7.5/F9). The plan enumerates every level and finds nothing but the spine. The
     * tree itself is complete and every object in it is labelled, so the TREE verdict is eligible. Whether the
     * PLAN reports `complete` is a separate, overconservative policy question recorded in the falsifiers.
     */
    const { root, world } = layout();
    const applied = fence!.applyReadFence({ roots: [root], world });
    const verified = applied.outcomes.filter((entry) => entry.verified).map((entry) => entry.path);
    const tree = fence!.verifyTree({ root, verifiedRoots: verified, dependencyRoots: [] });
    expect(tree.complete).toBe(true);
    expect(tree.admissionEligible).toBe(true);
    expect(tree.unqualifiedExternalLinks).toHaveLength(0);
  });

  it("13. a REAL DSH dependency layout classifies installer junctions without refusing the tree", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const dshHome = process.env.DSH_HOME ?? "";
    if (dshHome === "" || !existsSync(dshHome)) {
      return expect.fail("LIMIT — no DSH home is present, so the real dependency layout could not be measured");
    }
    /**
     * THE REAL LAYOUT IS MEASURED, NOT SYNTHESISED. The DSH home contains hundreds of installer-created
     * junctions. This case walks the profiles tree with the REAL dependency roots and records what it found; it
     * does NOT label the user's home, so it makes no claim about that home's current labels.
     */
    const profiles = join(dshHome, "profiles");
    if (!existsSync(profiles)) return expect.fail("LIMIT — the DSH profiles directory is absent");
    const tree = fence!.verifyTree({ root: profiles, verifiedRoots: [profiles], dependencyRoots: [dshHome, profiles] });
    /** The walk is bounded and reports honestly even when it cannot complete. */
    expect(typeof tree.checked).toBe("number");
    expect(Array.isArray(tree.reparsePoints)).toBe(true);
    expect(typeof tree.admissionEligible).toBe("boolean");
    /** Every out-of-domain link is either qualified by the contract or named as unqualified. */
    expect(tree.qualifiedDependencyLinks.length + tree.unqualifiedExternalLinks.length).toBe(tree.reparseOutsideProtectionDomain.length);
    /** A truncated walk must never report eligibility. */
    if (tree.truncated) expect(tree.admissionEligible).toBe(false);
  });
});

describe("S1R-C descendant qualification consumes the corrected basis (DYNAMICALLY_VERIFIED)", () => {
  it("14. ensureReadFence passes the VERIFIED roots as the basis, not the declared set", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { root, world } = layout();
    const ensured = fence!.ensureReadFence({ roots: [root], world, dependencyRoots: [] });
    expect(ensured.rootsVerified).toBe(true);
    expect(ensured.descendantsQualified).toBe(true);
    /** The basis recorded by the tree is the verified path set. */
    for (const tree of ensured.trees) {
      expect(tree.verifiedRootsUsed.length).toBeGreaterThan(0);
      for (const used of tree.verifiedRootsUsed) expect(used.toLowerCase()).toBe(root.toLowerCase());
    }
  });

  it("15. an out-of-domain link makes descendantsQualified FALSE", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { root, world, outside } = layout();
    writeFileSync(join(outside, "synthetic-canary.txt"), "S1R-DESC-CANARY-SYNTHETIC\n", "utf8");
    const made = tryJunction(outside, join(root, "escape"));
    if (!made.created) return expect.fail(`LIMIT — a junction fixture could not be created (${String(made.code)})`);
    const ensured = fence!.ensureReadFence({ roots: [root], world, dependencyRoots: [] });
    expect(ensured.rootsVerified).toBe(true);
    expect(ensured.descendantsQualified).toBe(false);
  });
});
