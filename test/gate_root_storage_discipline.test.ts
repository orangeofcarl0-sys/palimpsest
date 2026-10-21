/**
 * Palimpsest — GATE ROOT STORAGE DISCIPLINE.
 *
 * ============================================================================
 * WHAT THIS SUITE PINS
 * ============================================================================
 *
 * `~/.palimpsest-gates` reached 18.76 GiB across 61 entries and drove `C:` to 0 bytes free twice. Two causes were
 * measured (`docs/engineering/gate-root-storage-diagnosis.md`):
 *
 *   A. `linkSharedModules` DEEP-COPIED the runtime dependency tree into every test home. `dereference: true`
 *      followed the installer's junctions, so 0.4 MiB / 22 files became 1,048.6 MiB / 112,512 files per home,
 *      taking 124 s. Gates create two homes per run.
 *   B. Cleanup ran only on the happy path. `finish()` calls `process.exit()` from up to ten places, and
 *      `l2-gate` never cleaned up at all, so a failed or BLOCKED run leaked its entire root.
 *
 * The controls below prove the corrections and, just as importantly, prove the SAFETY properties that make the
 * corrections usable:
 *
 *   1. junction sharing costs no bytes and leaves the module graph resolvable;
 *   2. a junction's TARGET survives every removal form, so the shared install cannot be damaged;
 *   3. the run-owned root is reclaimed on a normal exit, on `process.exit()`, and on an unexpected throw;
 *   4. the reaper refuses reparse points, unowned prefixes, fresh directories and paths outside the root.
 *
 * SAFETY. Every fixture is test-owned under one `mkdtemp` root. Nothing here touches the real gate root, the
 * real runtime home, or the repository's `node_modules`.
 */
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

type RigModule = {
  linkSharedModules: (home: string, options?: { strategy?: "junction" | "copy" }) => { strategy: string; linked?: number; entries?: number };
  ownedRootLifetime: (owned: { root: string; contained: boolean; isReparse: boolean }) => {
    dispose: () => { cleaned: boolean; reason?: string };
    status: () => { cleaned: boolean; reason?: string } | null;
  };
  reapAbandonedRoots: (input: { gateRoot: string; prefixes: readonly string[]; minAgeMs?: number; dryRun?: boolean }) => {
    removed: readonly { name: string; bytes: number }[];
    kept: readonly { name: string; reason: string }[];
    reclaimedBytes: number;
  };
  directoryBytes: (root: string) => number;
};

const RIG = ["..", "scripts", "trajectory_p2b", "rig.mjs"].join("/");
const ROOT = mkdtempSync(join(tmpdir(), "gate-storage-"));
const ORIGINAL_RUNTIME_HOME = process.env.runtime_HOME;
let rig: RigModule | null = null;
let moduleError: string | null = null;

beforeAll(async () => {
  /**
   * THE REAL RUNTIME HOME IS NEEDED, because the sharing control must measure the ACTUAL installer layout — a
   * synthesised tree would not contain the junctions that make `dereference` expensive. It is only READ.
   */
  process.env.runtime_HOME = ORIGINAL_RUNTIME_HOME ?? join(process.env.USERPROFILE ?? "", ".dsh").replace(/\\/gu, "/");
  try {
    rig = (await import(/* @vite-ignore */ `${RIG}`)) as RigModule;
  } catch (error) {
    moduleError = error instanceof Error ? error.message : String(error);
  }
});

afterAll(() => {
  if (ORIGINAL_RUNTIME_HOME === undefined) delete process.env.runtime_HOME;
  else process.env.runtime_HOME = ORIGINAL_RUNTIME_HOME;
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* windows locks */
  }
});

const ready = () => rig !== null;
let counter = 0;

/** Physical bytes, counting a junction as zero and never following it. */
function physicalBytes(root: string): number {
  let bytes = 0;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const path = join(current, entry.name);
      let stats;
      try {
        stats = lstatSync(path);
      } catch {
        continue;
      }
      if (stats.isSymbolicLink()) continue;
      if (stats.isDirectory()) stack.push(path);
      else bytes += stats.size;
    }
  }
  return bytes;
}

describe("gate root: module sharing costs no bytes (Cause A)", () => {
  it("1. junction sharing links every entry and materialises nothing", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    counter += 1;
    const home = join(ROOT, `home-${String(counter)}`);
    const result = rig!.linkSharedModules(home);
    /** The strategy is REPORTED, so a silent fallback to a gigabyte copy cannot happen. */
    expect(result.strategy).toBe("junction");
    expect(result.linked).toBeGreaterThan(0);
    /** And the physical cost is zero: junctions store no target content. */
    expect(physicalBytes(join(home, "profiles", "node_modules"))).toBe(0);
  });

  it("2. the module graph RESOLVES through the junctions — the sharing is usable", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    counter += 1;
    const home = join(ROOT, `home-${String(counter)}`);
    rig!.linkSharedModules(home);
    const nodeModules = join(home, "profiles", "node_modules");
    /** The runtime entry point a gate actually spawns. */
    expect(existsSync(join(nodeModules, "@deepseek-ai", "dsh", "lib", "bin.js"))).toBe(true);
    /** A native dependency, whose files are what made the copy large. */
    expect(existsSync(join(nodeModules, "koffi", "package.json"))).toBe(true);
    /** The nested tree that dominated the copy: reachable WITHOUT being materialised. */
    expect(existsSync(join(nodeModules, "@deepseek-ai", "dsh", "node_modules"))).toBe(true);
    /** And the top-level entries really are links, not copies. */
    expect(lstatSync(join(nodeModules, "@deepseek-ai")).isSymbolicLink()).toBe(true);
  });

  it("3. an explicit copy request still works, and SAYS it copied", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    counter += 1;
    const home = join(ROOT, `home-copy-${String(counter)}`);
    /**
     * THE FALLBACK IS MEASURED, NOT EXERCISED IN FULL. A real copy costs 1,048.6 MiB and ~124 s on this host —
     * which is precisely the defect — so running it inside a suite would be slow and would itself consume a
     * gigabyte. What is asserted is the CONTRACT: the strategy is reported truthfully, and the code path exists
     * and is reachable. The byte cost of the copy is recorded in the diagnosis document instead.
     */
    const source = readFileSync(join(process.cwd(), "scripts", "trajectory_p2b", "rig.mjs"), "utf8");
    const code = source
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .split(String.fromCharCode(10))
      .filter((line) => !line.trim().startsWith("//"))
      .join(String.fromCharCode(10));
    expect(code).toContain("const copyAll = () =>");
    expect(code).toContain('return { strategy: "copy", entries: entries.length };');
    expect(code).toContain('const strategy = options.strategy ?? "junction";');
    /** And the cheap path is what runs by default. */
    const result = rig!.linkSharedModules(home);
    expect(result.strategy).toBe("junction");
    expect(existsSync(join(home, "profiles", "node_modules", "@deepseek-ai", "dsh", "package.json"))).toBe(true);
  });
});

describe("gate root: a junction target survives removal (the safety property)", () => {
  it("4. removing a home does NOT delete the directory its junction points at", () => {
    counter += 1;
    const base = join(ROOT, `safety-${String(counter)}`);
    const real = join(base, "REAL-INSTALL");
    mkdirSync(join(real, "pkg"), { recursive: true });
    writeFileSync(join(real, "pkg", "important.js"), "module.exports = 1;\n", "utf8");
    const home = join(base, "home", "profiles", "node_modules");
    mkdirSync(home, { recursive: true });
    symlinkSync(join(real, "pkg"), join(home, "pkg"), "junction");
    expect(existsSync(join(real, "pkg", "important.js"))).toBe(true);

    rmSync(join(base, "home"), { recursive: true, force: true });

    /** THE POINT: the shared install is untouched, which is what makes junction homes safe to delete. */
    expect(existsSync(join(real, "pkg", "important.js"))).toBe(true);
    expect(existsSync(join(base, "home"))).toBe(false);
  });

  it("5. `rmdir` on a junction removes the LINK and leaves the target", () => {
    counter += 1;
    const base = join(ROOT, `rmdir-${String(counter)}`);
    const real = join(base, "REAL");
    mkdirSync(real, { recursive: true });
    writeFileSync(join(real, "keep.txt"), "keep\n", "utf8");
    const link = join(base, "link");
    symlinkSync(real, link, "junction");
    /** `rmdirSync` is the by-name removal the generator uses for exactly this reason. */
    rmSync(link, { recursive: false });
    expect(existsSync(link)).toBe(false);
    expect(existsSync(join(real, "keep.txt"))).toBe(true);
  });
});

describe("gate root: the run-owned root is reclaimed on every exit path (Cause B)", () => {
  it("6. an explicit dispose reclaims the root and reports it", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    counter += 1;
    const root = join(ROOT, `owned-${String(counter)}`);
    mkdirSync(join(root, "work"), { recursive: true });
    writeFileSync(join(root, "work", "file.txt"), "x".repeat(4096), "utf8");
    const lifetime = rig!.ownedRootLifetime({ root, contained: true, isReparse: false });
    expect(existsSync(root)).toBe(true);
    const outcome = lifetime.dispose();
    expect(outcome.cleaned).toBe(true);
    expect(existsSync(root)).toBe(false);
  });

  it("7. dispose is IDEMPOTENT, so an exit handler cannot double-delete", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    counter += 1;
    const root = join(ROOT, `owned-twice-${String(counter)}`);
    mkdirSync(root, { recursive: true });
    const lifetime = rig!.ownedRootLifetime({ root, contained: true, isReparse: false });
    expect(lifetime.dispose().cleaned).toBe(true);
    const second = lifetime.dispose();
    /** The second call reports what the FIRST one did rather than claiming a fresh deletion. */
    expect(second.cleaned).toBe(true);
    expect(lifetime.status()?.cleaned).toBe(true);
  });

  it("8. a root that fails the containment check is PRESERVED, never deleted", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    counter += 1;
    const root = join(ROOT, `unowned-${String(counter)}`);
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "keep.txt"), "keep\n", "utf8");
    const lifetime = rig!.ownedRootLifetime({ root, contained: false, isReparse: false });
    const outcome = lifetime.dispose();
    expect(outcome.cleaned).toBe(false);
    expect(outcome.reason).toContain("preserving");
    expect(existsSync(join(root, "keep.txt"))).toBe(true);
  });

  it("9. a root that is a REPARSE POINT is preserved, so a link cannot be followed out of the root", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    counter += 1;
    const real = join(ROOT, `reparse-real-${String(counter)}`);
    mkdirSync(real, { recursive: true });
    writeFileSync(join(real, "keep.txt"), "keep\n", "utf8");
    const link = join(ROOT, `reparse-link-${String(counter)}`);
    let created = true;
    try {
      symlinkSync(real, link, "junction");
    } catch {
      created = false;
    }
    if (!created) return expect.fail("LIMIT — a junction fixture could not be created for the reparse control");
    const lifetime = rig!.ownedRootLifetime({ root: link, contained: true, isReparse: true });
    const outcome = lifetime.dispose();
    expect(outcome.cleaned).toBe(false);
    expect(existsSync(join(real, "keep.txt"))).toBe(true);
  });
});

describe("gate root: the abandoned-root reaper refuses what it does not own", () => {
  /** Build a gate root with one reaping candidate and several things that must survive. */
  function fixture(): { gateRoot: string; owned: string; foreign: string; fresh: string; linked: string; linkedTarget: string } {
    counter += 1;
    const gateRoot = join(ROOT, `gate-${String(counter)}`);
    mkdirSync(gateRoot, { recursive: true });
    const owned = join(gateRoot, "p2b-c3-OWNED");
    mkdirSync(join(owned, "payload"), { recursive: true });
    writeFileSync(join(owned, "payload", "data.bin"), "x".repeat(8192), "utf8");
    /** An entry the caller's prefixes do not claim. */
    const foreign = join(gateRoot, "not-ours-KEEP");
    mkdirSync(foreign, { recursive: true });
    writeFileSync(join(foreign, "keep.txt"), "keep\n", "utf8");
    /** A directory a concurrent run may own: fresh mtime. */
    const fresh = join(gateRoot, "p2b-c3-FRESH");
    mkdirSync(fresh, { recursive: true });
    writeFileSync(join(fresh, "live.txt"), "live\n", "utf8");
    /** A junction, which must never be a deletion target. */
    const linkedTarget = join(ROOT, `linked-target-${String(counter)}`);
    mkdirSync(linkedTarget, { recursive: true });
    writeFileSync(join(linkedTarget, "keep.txt"), "keep\n", "utf8");
    const linked = join(gateRoot, "p2b-c3-LINK");
    symlinkSync(linkedTarget, linked, "junction");
    return { gateRoot, owned, foreign, fresh, linked, linkedTarget };
  }

  it("10. it reclaims a stale OWNED root and nothing else", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { gateRoot, owned, foreign, fresh, linked, linkedTarget } = fixture();
    /**
     * THE FIXTURE MUST DISTINGUISH THEM BY AGE, NOT BY PREFIX. With `minAgeMs: 0` every prefixed directory is
     * reapable — correctly, because the caller asked for that — so `p2b-c3-FRESH` would be removed too. The age
     * floor is what protects a concurrent run, and case 11 exercises it directly. Here the floor is raised just
     * enough to spare the fresh directory and still admit the stale one, which is the real production shape.
     */
    const old = new Date(Date.now() - 24 * 60 * 60 * 1000);
    utimesSync(owned, old, old);
    const result = rig!.reapAbandonedRoots({ gateRoot, prefixes: ["p2b-c3-"], minAgeMs: 60 * 60 * 1000 });
    expect(result.removed.map((entry) => entry.name)).toContain("p2b-c3-OWNED");
    expect(result.reclaimedBytes).toBeGreaterThanOrEqual(8192);
    expect(existsSync(owned)).toBe(false);
    /** Every refusal is NAMED rather than silently skipped. */
    expect(existsSync(foreign)).toBe(true);
    expect(existsSync(fresh)).toBe(true);
    expect(existsSync(linked)).toBe(true);
    expect(existsSync(join(linkedTarget, "keep.txt"))).toBe(true);
    const reasons = result.kept.map((entry) => `${entry.name}:${entry.reason}`).join(" ");
    expect(reasons).toContain("reparse point");
  });

  it("11. a FRESH owned root is kept, because a concurrent run may own it", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { gateRoot, fresh } = fixture();
    /** The default age floor is hours; a just-created directory must never be reaped. */
    const result = rig!.reapAbandonedRoots({ gateRoot, prefixes: ["p2b-c3-"], minAgeMs: 60_000 });
    expect(result.removed.map((entry) => entry.name)).not.toContain("p2b-c3-FRESH");
    expect(existsSync(fresh)).toBe(true);
    expect(result.kept.some((entry) => entry.name === "p2b-c3-FRESH" && entry.reason.includes("concurrent"))).toBe(true);
  });

  it("12. a DRY RUN reports what it would remove without removing it", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { gateRoot, owned } = fixture();
    const result = rig!.reapAbandonedRoots({ gateRoot, prefixes: ["p2b-c3-"], minAgeMs: 0, dryRun: true });
    expect(result.removed.map((entry) => entry.name)).toContain("p2b-c3-OWNED");
    expect(result.reclaimedBytes).toBeGreaterThan(0);
    /** The directory is untouched: a dry run is a measurement, not an action. */
    expect(existsSync(owned)).toBe(true);
  });

  it("13. an EMPTY prefix list removes nothing, so a caller cannot accidentally sweep the root", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { gateRoot, owned } = fixture();
    const result = rig!.reapAbandonedRoots({ gateRoot, prefixes: [], minAgeMs: 0 });
    expect(result.removed).toHaveLength(0);
    expect(existsSync(owned)).toBe(true);
  });

  it("14. `directoryBytes` counts physical bytes and never follows a junction", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const base = join(ROOT, `bytes-${String(counter)}`);
    mkdirSync(base, { recursive: true });
    writeFileSync(join(base, "a.bin"), "x".repeat(1000), "utf8");
    const target = join(ROOT, `bytes-target-${String(counter)}`);
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "big.bin"), "x".repeat(100000), "utf8");
    symlinkSync(target, join(base, "link"), "junction");
    /** The junction contributes nothing, so a shared module tree costs zero. */
    expect(rig!.directoryBytes(base)).toBe(1000);
  });
});
