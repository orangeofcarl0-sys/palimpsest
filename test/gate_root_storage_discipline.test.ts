/**
 * Palimpsest — GATE ROOT STORAGE DISCIPLINE AND TEST-RESOURCE SAFETY.
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
 * Host-S1RA added four more measured defects, and the controls below cover them:
 *
 *   C. Destination admission used `existsSync`, which follows a reparse point, so a dangling junction read as
 *      free (RA-0/F1) and a partial link set was "completed" by a dereferencing copy (RA-0/F2).
 *   D. Cleanup trusted ownership flags cached at allocation and deleted a replaced path (RA-0/F3), could not
 *      retry after one failure (RA-0/F4), and leaked SIGINT/SIGTERM listeners (RA-0/F5).
 *   E. The reaper selected on prefix and age alone, including a directory carrying another run's marker
 *      (RA-0/F6).
 *   F. This suite itself passed when its module import failed, because every control only asserted that an
 *      error message existed (RA-0/F7). THAT IS CORRECTED: the import is now a `beforeAll` precondition, so a
 *      failed import aborts the suite instead of reporting twenty-two passing tests.
 *
 * SAFETY. Every fixture is test-owned under one `mkdtemp` root. Nothing here touches the real gate root, the
 * real runtime home, or the repository's `node_modules`.
 */
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

type SharingResult = {
  established?: boolean;
  strategy: string;
  linked?: readonly string[] | number;
  alreadyLinked?: readonly string[];
  refused?: readonly { entry: string; reason: string }[];
  reason?: string;
  detail?: string;
  entries?: number;
};

type Lifetime = {
  dispose: () => { cleaned: boolean; reason?: string; retryable?: boolean; refused?: boolean; attempts?: number };
  retry: () => { cleaned: boolean; reason?: string };
  status: () => { cleaned: boolean; reason?: string } | null;
  listenerCount: () => number;
};

type ReapResult = {
  removed: readonly { name: string; bytes: number }[];
  kept: readonly { name: string; reason: string }[];
  reclaimedBytes: number;
  dryRun?: boolean;
};

type OwnedRecord = Record<string, unknown> & { root: string };

type RigModule = {
  linkSharedModules: (home: string, options?: { strategy?: "junction" | "copy" }) => SharingResult;
  copyModuleGraph: (home: string) => SharingResult;
  ownedRootLifetime: (owned: OwnedRecord, options?: { maxAttempts?: number }) => Lifetime;
  allocateOwnedRoot: (prefix: string, gateRoot?: string) => OwnedRecord;
  reapAbandonedRoots: (input: { gateRoot: string; prefixes: readonly string[]; minAgeMs?: number; dryRun?: boolean }) => ReapResult;
  directoryBytes: (root: string) => number;
  /** E3-B: the consumer whose refusal-override was removed. */
  safeCleanup: (owned: OwnedRecord) => Promise<{ cleaned: boolean; reason?: string; refused?: boolean; retryable?: boolean; preserved?: boolean }>;
};

type SharingModule = {
  classifyDestination: (path: string) => { state: string; existsSync: boolean | null; isReparsePoint?: boolean; targetResolves?: boolean };
};

type ResourceModule = {
  MARKER_NAME: string;
  classifyDestination: (path: string) => { state: string; existsSync: boolean | null; isReparsePoint?: boolean; targetResolves?: boolean };
  revalidateOwnership: (owned: unknown) => { owned: boolean; reason?: string; checks: readonly { check: string; passed: boolean; detail: string }[] };
};

type RuntimeHomeModule = {
  applyRuntimeHome: (value: string) => unknown;
  captureRuntimeHome: () => Record<string, string | undefined>;
  restoreRuntimeHome: (previous: Record<string, string | undefined>) => unknown;
  defaultRuntimeHome: () => string;
};

const RIG = ["..", "scripts", "trajectory_p2b", "rig.mjs"].join("/");
const RESOURCE = ["..", "scripts", "trajectory_p2b", "owned-resource.mjs"].join("/");
const SHARING = ["..", "scripts", "trajectory_p2b", "module-sharing.mjs"].join("/");
const HOME_MODULE = ["..", "scripts", "gates", "runtime-home.mjs"].join("/");
const ROOT = mkdtempSync(join(tmpdir(), "gate-storage-"));

/**
 * THE MODULE IS A PRECONDITION, NOT A CONDITIONAL.
 *
 * The superseded suite wrapped every control in `if (!ready()) return expect(moduleError).toBeTruthy()`, which
 * made a FAILED IMPORT report fourteen passing tests. RA-0/F7 measured exactly that: 14 passed, 0 failed, exit 0.
 * An import failure now throws out of `beforeAll`, so the suite cannot pass without having exercised the code.
 */
let rig: RigModule;
let resource: ResourceModule;
let sharing: SharingModule;
let capturedHome: Record<string, string | undefined> = {};

beforeAll(async () => {
  /**
   * RA-A/F8 — BOTH ACCEPTED NAMES ARE SET, through the one resolver. RA-0 measured that the harness and the gates
   * used different identifiers that render identically, so a single assignment was inert and every gate silently
   * used the `homedir()` default. `applyRuntimeHome` writes every accepted spelling.
   *
   * THE REAL RUNTIME HOME IS NEEDED, because the sharing controls must measure the ACTUAL installer layout — a
   * synthesised tree would not contain the junctions that make `dereference` expensive. It is only READ.
   */
  const home = (await import(/* @vite-ignore */ `${HOME_MODULE}`)) as RuntimeHomeModule;
  capturedHome = home.captureRuntimeHome();
  home.applyRuntimeHome(home.defaultRuntimeHome());

  rig = (await import(/* @vite-ignore */ `${RIG}`)) as RigModule;
  resource = (await import(/* @vite-ignore */ `${RESOURCE}`)) as ResourceModule;
  sharing = (await import(/* @vite-ignore */ `${SHARING}`)) as SharingModule;

  /** A FAILED IMPORT MUST FAIL THE SUITE. This is the F7 correction, asserted rather than assumed. */
  expect(typeof rig.linkSharedModules).toBe("function");
  expect(typeof rig.ownedRootLifetime).toBe("function");
  expect(typeof resource.revalidateOwnership).toBe("function");
  expect(typeof sharing.classifyDestination).toBe("function");
});

afterAll(async () => {
  const home = (await import(/* @vite-ignore */ `${HOME_MODULE}`)) as RuntimeHomeModule;
  home.restoreRuntimeHome(capturedHome);
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* windows locks */
  }
});

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

/** Age a directory so the reaper's floor admits it. */
function ageDays(path: string, days: number): void {
  const when = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  utimesSync(path, when, when);
}

describe("gate root: module sharing costs no bytes (Cause A)", () => {
  it("1. junction sharing links every entry and materialises nothing", () => {
    counter += 1;
    const home = join(ROOT, `home-${String(counter)}`);
    const result = rig.linkSharedModules(home);
    /** The strategy is REPORTED, so a silent fallback to a gigabyte copy cannot happen. */
    expect(result.strategy).toBe("junction");
    expect(result.established).toBe(true);
    const linkedCount = Array.isArray(result.linked) ? (result.linked as readonly string[]).length : (result.linked as number);
    expect(linkedCount).toBeGreaterThan(0);
    /** And the physical cost is zero: junctions store no target content. */
    expect(physicalBytes(join(home, "profiles", "node_modules"))).toBe(0);
  });

  it("2. the module graph RESOLVES through the junctions — the sharing is usable", () => {
    counter += 1;
    const home = join(ROOT, `home-${String(counter)}`);
    rig.linkSharedModules(home);
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

  it("3. an explicit copy request REFUSES a partially populated destination", () => {
    counter += 1;
    const home = join(ROOT, `home-copy-${String(counter)}`);
    const nodeModules = join(home, "profiles", "node_modules");
    mkdirSync(nodeModules, { recursive: true });
    /** One pre-existing entry is enough: a copy is not a repair for a partial graph (§4.3). */
    writeFileSync(join(nodeModules, "already-here.txt"), "x\n", "utf8");
    const result = rig.copyModuleGraph(home);
    expect(result.established).toBe(false);
    expect(result.reason).toBe("MODULE_SHARING_NOT_ESTABLISHED");
    expect(String(result.detail)).toContain("not empty");
    /** And it did not touch the destination. */
    expect(readFileSync(join(nodeModules, "already-here.txt"), "utf8")).toBe("x\n");
  });

  it("4. a copy request reports what it spends, and the copy is not reachable by default", () => {
    counter += 1;
    const home = join(ROOT, `home-copy-contract-${String(counter)}`);
    /**
     * THE CONTRACT IS ASSERTED, NOT A GIGABYTE SPENT. A real dereferenced copy costs 1,048.6 MiB and ~124 s on
     * this host, which is the defect being corrected; running it inside a suite would reproduce the defect. What is
     * checked is that the copy path is EXPLICIT and that it reports its cost, so no caller can be surprised by it.
     */
    const source = readFileSync(join(process.cwd(), "scripts", "trajectory_p2b", "rig.mjs"), "utf8");
    const code = source
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .split(String.fromCharCode(10))
      .filter((line) => !line.trim().startsWith("//"))
      .join(String.fromCharCode(10));
    expect(code).toContain("copiedBytes");
    expect(code).toContain("copiedFiles");
    expect(code).toContain("dereferenced: true");
    /** The default strategy is the cheap one, and asking for it explicitly does NOT silently copy. */
    const result = rig.linkSharedModules(home);
    expect(result.strategy).toBe("junction");
    expect(result.established).toBe(true);
  });
});

describe("gate root: a junction target survives removal (the safety property)", () => {
  it("5. removing a home does NOT delete the directory its junction points at", () => {
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

  it("6. `rmdir` on a junction removes the LINK and leaves the target", () => {
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

describe("gate root: destination admission refuses what it cannot prove (Cause C)", () => {
  function ownedGateRoot(): string {
    counter += 1;
    const gateRoot = join(ROOT, `admission-gate-${String(counter)}`);
    mkdirSync(gateRoot, { recursive: true });
    return gateRoot;
  }

  it("7. a DANGLING junction is classified as occupied, not as absent", () => {
    const gateRoot = ownedGateRoot();
    const home = join(gateRoot, "home");
    const nodeModules = join(home, "profiles", "node_modules");
    mkdirSync(nodeModules, { recursive: true });
    const vanished = join(gateRoot, "vanished-target");
    mkdirSync(vanished, { recursive: true });
    const destination = join(nodeModules, "koffi");
    symlinkSync(vanished, destination, "junction");
    rmSync(vanished, { recursive: true, force: true });

    const state = sharing.classifyDestination(destination);
    /**
     * THE DECISIVE PROPERTY: `existsSync` says FALSE while the path object is a REPARSE POINT. The corrected
     * admission must not treat that as free, so the classification reports a link state and the sharing operation
     * refuses rather than writing.
     */
    expect(state.existsSync).toBe(false);
    expect(state.isReparsePoint).toBe(true);
    expect(state.state).toBe("BROKEN_LINK");

    const result = rig.linkSharedModules(home);
    expect(result.established).toBe(false);
    expect(result.reason).toBe("MODULE_SHARING_NOT_ESTABLISHED");
    expect(result.refused?.some((entry) => entry.entry === "koffi")).toBe(true);
    /** The vanished target was NOT recreated: nothing was written outside the home. */
    expect(existsSync(vanished)).toBe(false);
  });

  it("8. an existing link to the CORRECT source is accepted without a write", () => {
    const gateRoot = ownedGateRoot();
    const home = join(gateRoot, "home");
    const nodeModules = join(home, "profiles", "node_modules");
    mkdirSync(nodeModules, { recursive: true });
    /** Link ONE entry by hand to exactly where the sharing operation would point it. */
    const sourceEntry = join(process.env["USERPROFILE"] ?? "", ".dsh", "profiles", "node_modules", "@deepseek-ai");
    expect(existsSync(sourceEntry)).toBe(true);
    symlinkSync(sourceEntry, join(nodeModules, "@deepseek-ai"), "junction");
    const result = rig.linkSharedModules(home);
    expect(result.established).toBe(true);
    expect(result.alreadyLinked).toContain("@deepseek-ai");
  });

  it("9. an existing link to the WRONG target is refused, and the link is not overwritten", () => {
    const gateRoot = ownedGateRoot();
    const home = join(gateRoot, "home");
    const nodeModules = join(home, "profiles", "node_modules");
    mkdirSync(nodeModules, { recursive: true });
    const elsewhere = join(gateRoot, "elsewhere");
    mkdirSync(elsewhere, { recursive: true });
    symlinkSync(elsewhere, join(nodeModules, "koffi"), "junction");
    const result = rig.linkSharedModules(home);
    expect(result.established).toBe(false);
    expect(result.refused?.some((entry) => entry.entry === "koffi" && entry.reason === "EXISTING_LINK_POINTS_ELSEWHERE")).toBe(true);
    /** The wrong link still points where it did: refusing is not repairing. */
    expect(lstatSync(join(nodeModules, "koffi")).isSymbolicLink()).toBe(true);
    expect(existsSync(join(elsewhere, "package.json"))).toBe(false);
  });

  it("10. an ordinary FILE at the destination is refused rather than overwritten", () => {
    const gateRoot = ownedGateRoot();
    const home = join(gateRoot, "home");
    const nodeModules = join(home, "profiles", "node_modules");
    mkdirSync(nodeModules, { recursive: true });
    writeFileSync(join(nodeModules, "koffi"), "OCCUPANT\n", "utf8");
    const result = rig.linkSharedModules(home);
    expect(result.established).toBe(false);
    expect(result.refused?.some((entry) => entry.entry === "koffi" && entry.reason === "DESTINATION_IS_FILE")).toBe(true);
    expect(readFileSync(join(nodeModules, "koffi"), "utf8")).toBe("OCCUPANT\n");
  });
});

describe("gate root: the run-owned root is reclaimed on every exit path (Cause B)", () => {
  function allocated(): { gateRoot: string; owned: OwnedRecord } {
    counter += 1;
    const gateRoot = join(ROOT, `owned-gate-${String(counter)}`);
    mkdirSync(gateRoot, { recursive: true });
    return { gateRoot, owned: rig.allocateOwnedRoot("p2b-ra-test-", gateRoot) };
  }

  it("11. an explicit dispose reclaims the root and reports it", () => {
    const { owned } = allocated();
    writeFileSync(join(owned.root, "work.txt"), "x".repeat(4096), "utf8");
    const lifetime = rig.ownedRootLifetime(owned);
    expect(existsSync(owned.root)).toBe(true);
    const outcome = lifetime.dispose();
    expect(outcome.cleaned).toBe(true);
    expect(existsSync(owned.root)).toBe(false);
  });

  it("12. dispose is IDEMPOTENT, so an exit handler cannot double-delete", () => {
    const { owned } = allocated();
    const lifetime = rig.ownedRootLifetime(owned);
    expect(lifetime.dispose().cleaned).toBe(true);
    const second = lifetime.dispose();
    /** The second call reports what the FIRST one did rather than claiming a fresh deletion. */
    expect(second.cleaned).toBe(true);
    expect(lifetime.status()?.cleaned).toBe(true);
  });

  it("13. EVERY listener installed is removed by dispose (RA-0/F5)", () => {
    const { owned } = allocated();
    const before = { exit: process.listenerCount("exit"), SIGINT: process.listenerCount("SIGINT"), SIGTERM: process.listenerCount("SIGTERM") };
    const lifetime = rig.ownedRootLifetime(owned);
    /** Three listeners are installed: exit, SIGINT, SIGTERM. */
    expect(lifetime.listenerCount()).toBe(3);
    expect(process.listenerCount("SIGINT")).toBe(before.SIGINT + 1);
    lifetime.dispose();
    /**
     * THE MEASURED DEFECT WAS THAT SIGINT AND SIGTERM SURVIVED DISPOSAL. All three must be gone, so a later
     * allocation cannot accumulate handlers that call `process.exit(130)` for a root already reclaimed.
     */
    expect(process.listenerCount("exit")).toBe(before.exit);
    expect(process.listenerCount("SIGINT")).toBe(before.SIGINT);
    expect(process.listenerCount("SIGTERM")).toBe(before.SIGTERM);
    expect(lifetime.listenerCount()).toBe(0);
  });

  it("14. a root REPLACED after allocation is PRESERVED, not deleted (RA-0/F3)", () => {
    const { owned } = allocated();
    /** Replace the allocated directory with a different object at the same path. */
    rmSync(owned.root, { recursive: true, force: true });
    mkdirSync(owned.root, { recursive: true });
    writeFileSync(join(owned.root, "foreign.txt"), "FOREIGN\n", "utf8");

    const proof = resource.revalidateOwnership(owned);
    /**
     * The cached flags still say "contained, not a reparse point". The identity and marker checks are what catch
     * the replacement, and the deletion is refused on that basis.
     */
    expect(proof.owned).toBe(false);
    const lifetime = rig.ownedRootLifetime(owned);
    const outcome = lifetime.dispose();
    expect(outcome.cleaned).toBe(false);
    expect(existsSync(join(owned.root, "foreign.txt"))).toBe(true);
  });

  it("15. a root that is a REPARSE POINT now is preserved, whatever the record says", () => {
    const { gateRoot, owned } = allocated();
    rmSync(owned.root, { recursive: true, force: true });
    const real = join(gateRoot, "real-target");
    mkdirSync(real, { recursive: true });
    writeFileSync(join(real, "keep.txt"), "keep\n", "utf8");
    symlinkSync(real, owned.root, "junction");

    const lifetime = rig.ownedRootLifetime(owned);
    const outcome = lifetime.dispose();
    expect(outcome.cleaned).toBe(false);
    /** The link may be refused rather than removed; either way the TARGET must survive. */
    expect(existsSync(join(real, "keep.txt"))).toBe(true);
  });

  it("16. a directory OUTSIDE the gate root is preserved", () => {
    counter += 1;
    const outside = join(ROOT, `outside-${String(counter)}`);
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, "keep.txt"), "keep\n", "utf8");
    const gateRoot = join(ROOT, `contain-gate-${String(counter)}`);
    mkdirSync(gateRoot, { recursive: true });
    /** A record whose root is not inside the gate root it claims. */
    const lifetime = rig.ownedRootLifetime({ root: outside, gateRoot, identity: null, runId: "test" });
    const outcome = lifetime.dispose();
    expect(outcome.cleaned).toBe(false);
    expect(existsSync(join(outside, "keep.txt"))).toBe(true);
  });
});

describe("gate root: the abandoned-root reaper refuses what it does not own (Cause E)", () => {
  type Fixture = {
    gateRoot: string;
    marked: string;
    unmarked: string;
    foreignMarker: string;
    fresh: string;
    linked: string;
    linkedTarget: string;
    unclaimed: string;
  };

  /** Build a gate root with one legitimate candidate and several things that must survive. */
  function fixture(): Fixture {
    counter += 1;
    const gateRoot = join(ROOT, `gate-${String(counter)}`);
    mkdirSync(gateRoot, { recursive: true });

    /**
     * 1. A genuinely owned, stale root: allocated through the real path, so it carries a real marker.
     *
     * THE MARKER'S PID IS REWRITTEN TO A DEAD ONE. `allocateOwnedRoot` records THIS process, and the reaper
     * correctly refuses a root whose owning process is still running — which is case 21, not this one. A root that
     * a crashed run left behind carries a pid that no longer exists, and that is the state being tested here.
     */
    const owned = rig.allocateOwnedRoot("p2b-c3-OWNED-", gateRoot);
    const marked = owned.root;
    const markerPath = join(marked, resource.MARKER_NAME);
    const marker = JSON.parse(readFileSync(markerPath, "utf8"));
    writeFileSync(markerPath, `${JSON.stringify({ ...marker, pid: 999999, active: false }, null, 2)}
`, "utf8");
    mkdirSync(join(marked, "payload"), { recursive: true });
    writeFileSync(join(marked, "payload", "data.bin"), "x".repeat(8192), "utf8");

    /** 2. A stale, correctly named root with NO marker. Age and a name are not ownership. */
    const unmarked = join(gateRoot, "p2b-c3-UNMARKED");
    mkdirSync(unmarked, { recursive: true });
    writeFileSync(join(unmarked, "user-work.txt"), "MUST SURVIVE\n", "utf8");

    /**
     * 3. A stale, correctly named root whose marker names a DIFFERENT root.
     *
     * THIS IS THE COPY CASE. A marker is a file, so it can be copied into a directory it does not describe — by a
     * restored backup, a moved tree, or a mistaken `cp`. The record must establish ownership of THE ROOT IT SITS
     * IN, so a marker naming elsewhere is a refusal even though every other field looks valid.
     */
    const foreignMarker = join(gateRoot, "p2b-c3-FOREIGN-MARKER");
    mkdirSync(foreignMarker, { recursive: true });
    writeFileSync(
      join(foreignMarker, resource.MARKER_NAME),
      `${JSON.stringify(
        {
          schemaVersion: 2,
          runId: "another-run",
          pid: 999999,
          generation: 1,
          createdAt: new Date().toISOString(),
          ownedRoot: join(gateRoot, "a-root-this-is-not").replace(/\\/gu, "/"),
          gateRoot: gateRoot.replace(/\\/gu, "/"),
          active: false,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    /** 4. A root a concurrent run may own: fresh mtime, real marker. */
    const fresh = rig.allocateOwnedRoot("p2b-c3-FRESH-", gateRoot).root;

    /** 5. A junction, which must never be a deletion target. */
    const linkedTarget = join(ROOT, `linked-target-${String(counter)}`);
    mkdirSync(linkedTarget, { recursive: true });
    writeFileSync(join(linkedTarget, "keep.txt"), "keep\n", "utf8");
    const linked = join(gateRoot, "p2b-c3-LINK");
    symlinkSync(linkedTarget, linked, "junction");

    /** 6. An entry the caller's prefixes do not claim. */
    const unclaimed = join(gateRoot, "not-ours-KEEP");
    mkdirSync(unclaimed, { recursive: true });
    writeFileSync(join(unclaimed, "keep.txt"), "keep\n", "utf8");

    /** Age everything except the fresh root, which must be spared BY AGE rather than by accident. */
    for (const path of [marked, unmarked, foreignMarker, linked]) ageDays(path, 3);

    return { gateRoot, marked, unmarked, foreignMarker, fresh, linked, linkedTarget, unclaimed };
  }

  it("17. it reclaims a stale MARKED root and preserves every unowned candidate", () => {
    const { gateRoot, marked, unmarked, foreignMarker, fresh, linked, linkedTarget, unclaimed } = fixture();
    const result = rig.reapAbandonedRoots({ gateRoot, prefixes: ["p2b-c3-"], minAgeMs: 60 * 60 * 1000, dryRun: false });
    /**
     * EXACTLY ONE root is reclaimed. The fresh one is spared BY AGE, so it must NOT appear here — if it does, the
     * age floor is not doing its job and a concurrent run could be pulled out from under itself.
     */
    expect(result.removed.length).toBe(1);
    expect(result.removed.map((entry) => entry.name)).toEqual([`p2b-c3-OWNED-${marked.split("p2b-c3-OWNED-")[1]}`]);
    expect(existsSync(marked)).toBe(false);

    /** NO MARKER means no verifiable ownership, so it is preserved and the reason is NAMED. */
    expect(existsSync(unmarked)).toBe(true);
    expect(result.kept.some((entry) => entry.name === "p2b-c3-UNMARKED" && entry.reason.startsWith("NO_OWNERSHIP_MARKER"))).toBe(true);

    /**
     * A MARKER NAMING ANOTHER ROOT IS A REFUSAL. This is the case F6 measured being selected for deletion on name
     * and age alone: the record exists and looks valid, but it does not describe THIS directory.
     */
    expect(existsSync(foreignMarker)).toBe(true);
    expect(result.kept.some((entry) => entry.name === "p2b-c3-FOREIGN-MARKER" && entry.reason === "the marker names a different root")).toBe(true);

    /** A fresh root may belong to a concurrent run. */
    expect(existsSync(fresh)).toBe(true);
    /** A junction is never a target. */
    expect(existsSync(linked)).toBe(true);
    expect(existsSync(join(linkedTarget, "keep.txt"))).toBe(true);
    /** An unclaimed prefix is not considered at all. */
    expect(existsSync(unclaimed)).toBe(true);
  });

  it("18. REPORT-ONLY is the default, so an omitted flag removes nothing", () => {
    const { gateRoot, marked } = fixture();
    const result = rig.reapAbandonedRoots({ gateRoot, prefixes: ["p2b-c3-"], minAgeMs: 0 });
    /** `dryRun` defaults to true: a caller must ask explicitly before anything is removed. */
    expect(result.dryRun).toBe(true);
    expect(result.removed.length).toBeGreaterThan(0);
    expect(existsSync(marked)).toBe(true);
  });

  it("19. a DRY RUN reports what it would remove without removing it", () => {
    const { gateRoot, marked } = fixture();
    const result = rig.reapAbandonedRoots({ gateRoot, prefixes: ["p2b-c3-"], minAgeMs: 0, dryRun: true });
    expect(result.removed.length).toBeGreaterThan(0);
    expect(result.reclaimedBytes).toBeGreaterThan(0);
    expect(existsSync(marked)).toBe(true);
  });

  it("20. an EMPTY prefix list removes nothing, so a caller cannot accidentally sweep the root", () => {
    const { gateRoot, marked } = fixture();
    const result = rig.reapAbandonedRoots({ gateRoot, prefixes: [], minAgeMs: 0, dryRun: false });
    expect(result.removed).toHaveLength(0);
    expect(existsSync(marked)).toBe(true);
  });

  it("21. a root the OWNING PROCESS is still using is preserved", () => {
    const { gateRoot } = fixture();
    /** A marker naming THIS live process, with `active: true`. */
    const live = join(gateRoot, "p2b-c3-LIVE");
    mkdirSync(live, { recursive: true });
    writeFileSync(
      join(live, resource.MARKER_NAME),
      `${JSON.stringify(
        {
          schemaVersion: 2,
          runId: "live",
          pid: process.pid,
          generation: 1,
          createdAt: new Date().toISOString(),
          ownedRoot: live.replace(/\\/gu, "/"),
          gateRoot: gateRoot.replace(/\\/gu, "/"),
          active: true,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    ageDays(live, 3);
    const result = rig.reapAbandonedRoots({ gateRoot, prefixes: ["p2b-c3-"], minAgeMs: 60 * 60 * 1000, dryRun: false });
    expect(existsSync(live)).toBe(true);
    expect(result.kept.some((entry) => entry.name === "p2b-c3-LIVE" && entry.reason.includes("has not finished"))).toBe(true);
  });

  it("22. `directoryBytes` counts physical bytes and never follows a junction", () => {
    counter += 1;
    const base = join(ROOT, `bytes-${String(counter)}`);
    mkdirSync(base, { recursive: true });
    writeFileSync(join(base, "a.bin"), "x".repeat(1000), "utf8");
    const target = join(ROOT, `bytes-target-${String(counter)}`);
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "big.bin"), "x".repeat(100000), "utf8");
    symlinkSync(target, join(base, "link"), "junction");
    /** The junction contributes nothing, so a shared module tree costs zero. */
    expect(rig.directoryBytes(base)).toBe(1000);
  });
});

/**
 * ============================================================================
 * HOST-S1RA-E3 — OWNERSHIP ADMISSION AND SAFE DISPOSAL
 * ============================================================================
 *
 * Every control here corresponds to a falsifier that was measured UNSAFE before the E3 corrections
 * (`research-evidence/host-s1rae3/falsifiers-before-fix.json`). They are negative controls: each one FAILS if the
 * corresponding guard is removed.
 *
 * The three E2 gaps are pinned first, then the consumer defect that was not in the reported list, then the
 * liveness controls that stop "refuse everything" from passing as a fix.
 */
describe("E3: ownership admission refuses insufficient evidence (I1, I2)", () => {
  function allocatedIn(name: string): { gateRoot: string; owned: Record<string, unknown> & { root: string } } {
    counter += 1;
    const gateRoot = join(ROOT, `${name}-${String(counter)}`);
    mkdirSync(gateRoot, { recursive: true });
    return { gateRoot, owned: rig.allocateOwnedRoot(`${name}-`, gateRoot) };
  }

  it("23. a MISSING marker REFUSES, because absent evidence is not positive evidence", () => {
    const { owned } = allocatedIn("e3-nomarker");
    rmSync(join(owned.root, resource.MARKER_NAME));
    const proof = resource.revalidateOwnership(owned);
    expect(proof.owned).toBe(false);
    expect(proof.reason).toContain("absent");
    /** And the consumer must not delete on the strength of a refusal. */
    expect(existsSync(owned.root)).toBe(true);
  });

  it("24. a marker naming a DIFFERENT root REFUSES, because runId alone does not bind the resource", () => {
    const { gateRoot, owned } = allocatedIn("e3-wrongroot");
    const markerPath = join(owned.root, resource.MARKER_NAME);
    const marker = JSON.parse(readFileSync(markerPath, "utf8"));
    const elsewhere = join(gateRoot, "a-different-root");
    mkdirSync(elsewhere, { recursive: true });
    writeFileSync(markerPath, `${JSON.stringify({ ...marker, ownedRoot: elsewhere.replace(/\\/gu, "/") }, null, 2)}\n`, "utf8");
    const proof = resource.revalidateOwnership(owned);
    expect(proof.owned).toBe(false);
    expect(proof.reason).toContain("different root");
    expect(existsSync(owned.root)).toBe(true);
  });

  it("25. a marker COPIED from a sibling resource REFUSES for the resource that received it", () => {
    const { gateRoot, owned } = allocatedIn("e3-copied");
    const sibling = rig.allocateOwnedRoot("e3-copied-sibling-", gateRoot);
    /** A's marker copied into B: same runId, same schema, different root. */
    writeFileSync(join(owned.root, resource.MARKER_NAME), readFileSync(join(sibling.root, resource.MARKER_NAME), "utf8"), "utf8");
    const proof = resource.revalidateOwnership(owned);
    expect(proof.owned).toBe(false);
    expect(existsSync(owned.root)).toBe(true);
  });

  it("26. a record with NO generation authorizes nothing", () => {
    const { owned } = allocatedIn("e3-nogen");
    const { generation: _omitted, ...withoutGeneration } = owned;
    const proof = resource.revalidateOwnership(withoutGeneration);
    expect(proof.owned).toBe(false);
    expect(proof.reason).toContain("generation");
  });

  it("27. a SUPERSEDED generation refuses at the destructive boundary", () => {
    const { owned } = allocatedIn("e3-superseded");
    const markerPath = join(owned.root, resource.MARKER_NAME);
    const marker = JSON.parse(readFileSync(markerPath, "utf8"));
    /** The marker advances, as it would after an ownership handoff; the held record does not. */
    writeFileSync(markerPath, `${JSON.stringify({ ...marker, generation: Number(marker.generation) + 1 }, null, 2)}\n`, "utf8");
    const lifetime = rig.ownedRootLifetime(owned);
    const outcome = lifetime.dispose();
    expect(outcome.cleaned).toBe(false);
    expect(existsSync(owned.root)).toBe(true);
  });
});

describe("E3: the consumer may not convert a refusal into a deletion (I3)", () => {
  it("28. rig.safeCleanup refuses a record whose identity does not match, and the object survives", async () => {
    counter += 1;
    const gateRoot = join(ROOT, `e3-consumer-${String(counter)}`);
    mkdirSync(gateRoot, { recursive: true });
    const owned = rig.allocateOwnedRoot("e3-consumer-", gateRoot);
    const rootPath = owned.root;
    /** A different object at the same path. */
    rmSync(rootPath, { recursive: true, force: true });
    mkdirSync(rootPath, { recursive: true });
    writeFileSync(join(rootPath, "foreign.txt"), "MUST SURVIVE\n", "utf8");
    const result = await rig.safeCleanup(owned);
    expect(result.cleaned).toBe(false);
    expect(existsSync(join(rootPath, "foreign.txt"))).toBe(true);
  });

  it("29. rig.safeCleanup refuses a LEGACY-SHAPED record instead of trusting its cached booleans", async () => {
    counter += 1;
    const gateRoot = join(ROOT, `e3-legacy-${String(counter)}`);
    mkdirSync(gateRoot, { recursive: true });
    const root = join(gateRoot, "looks-contained");
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "foreign.txt"), "MUST SURVIVE\n", "utf8");
    /**
     * THE EXACT SHAPE THE SUPERSEDED `legacyOk` BRANCH ACCEPTED: `contained: true` and `isReparse: false`, no
     * identity, no marker, no generation. It authorized a deletion; it must now be refused.
     */
    const result = await rig.safeCleanup({ root, contained: true, isReparse: false });
    expect(result.cleaned).toBe(false);
    expect(existsSync(join(root, "foreign.txt"))).toBe(true);
  });
});

describe("E3: disposal is bound to the object, and completion is observed (I4, I5)", () => {
  function allocatedForDisposal(name: string): { gateRoot: string; owned: Record<string, unknown> & { root: string } } {
    counter += 1;
    const gateRoot = join(ROOT, `${name}-${String(counter)}`);
    mkdirSync(gateRoot, { recursive: true });
    return { gateRoot, owned: rig.allocateOwnedRoot(`${name}-`, gateRoot) };
  }

  it("30. a legitimate owned root is DISPOSED — a design that refuses everything does not pass", () => {
    const { owned } = allocatedForDisposal("e3-liveness");
    writeFileSync(join(owned.root, "work.txt"), "legitimate\n", "utf8");
    const lifetime = rig.ownedRootLifetime(owned);
    const outcome = lifetime.dispose();
    expect(outcome.cleaned).toBe(true);
    expect(existsSync(owned.root)).toBe(false);
  });

  it("31. an object placed at the original path AFTER disposal survives a repeated disposal", async () => {
    const { owned } = allocatedForDisposal("e3-reuse");
    const rootPath = owned.root;
    expect((await rig.safeCleanup(owned)).cleaned).toBe(true);
    mkdirSync(rootPath, { recursive: true });
    writeFileSync(join(rootPath, "later-occupant.txt"), "MUST SURVIVE\n", "utf8");
    const again = await rig.safeCleanup(owned);
    expect(again.cleaned).toBe(false);
    expect(existsSync(join(rootPath, "later-occupant.txt"))).toBe(true);
  });

  it("32. no quarantine directory is left behind by a successful disposal", () => {
    const { gateRoot, owned } = allocatedForDisposal("e3-quarantine");
    writeFileSync(join(owned.root, "work.txt"), "x\n", "utf8");
    expect(rig.ownedRootLifetime(owned).dispose().cleaned).toBe(true);
    /**
     * The disposal renames to `.q-<name>-<pid>-<random>` before deleting. A successful disposal must leave neither
     * the original name nor the quarantine name, or the gate root slowly fills with `.q-` debris.
     */
    const leftovers = readdirSync(gateRoot).filter((entry) => entry.startsWith(".q-"));
    expect(leftovers).toEqual([]);
  });

  it("33. a FAILED removal does not report completion, and the root is still there to retry", () => {
    const { owned } = allocatedForDisposal("e3-failure");
    writeFileSync(join(owned.root, "work.txt"), "x\n", "utf8");
    const lifetime = rig.ownedRootLifetime(owned, { maxAttempts: 1 });
    /**
     * THE MARKER IS REMOVED so revalidation refuses. That is a REFUSAL, not a transient failure: it must be reported
     * as cleaned=false and must not be retried into a success.
     */
    rmSync(join(owned.root, resource.MARKER_NAME));
    const outcome = lifetime.dispose();
    expect(outcome.cleaned).toBe(false);
    expect(existsSync(owned.root)).toBe(true);
    expect(outcome.retryable).toBe(false);
  });
});
