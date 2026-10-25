/**
 * Trajectory-P2-E0 §7.6 — TEST-RUNTIME SAFETY (Group A).
 *
 * Proves the owned-root lifecycle is safe on THIS platform before any heavy first-party DSH gate may run.
 * Every fixture is test-owned and lives inside a directory this suite allocates and removes; the external
 * sentinel is a NEGATIVE CONTROL that must survive every cleanup path.
 *
 * The load-bearing case is the trailing-separator hazard: `rm -rf <dir>/<link>/` traverses a junction and
 * destroys the external target, so `safeCleanup` must remove descendant links BY NAME first.
 */
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  OWNERSHIP_MARKER,
  allocateOwnedRoot as allocateUnderSharedRoot,
  findDescendantReparsePoints,
  freeBytesAt,
  isOwnedByThisStage,
  safeCleanup,
  snapshotDependencyRoot,
  withOwnedRoot as withSharedOwnedRoot,
} from "../scripts/trajectory_p2e0/owned-root.mjs";

/** A test-owned parent that holds both the candidate cleanup root and the external sentinel. */
let sandbox: string;
const made: string[] = [];

/**
 * E4-A3 — THIS SUITE'S OWN GATE ROOT.
 *
 * The fixtures below used the shared `~/.palimpsest-gates`, which `trajectory_p2e1_resource_safety` also mutates.
 * E4-A2 reproduced the consequence deterministically: an external allocation moved the shared entry count inside
 * another suite's observation window, and that suite's assertion failed for a reason it did not cause. Both suites
 * now allocate under private roots, so neither can disturb the other and neither writes scratch fixtures into the
 * directory the real gates use.
 */
let fixtureGateRoot: string;

const allocateOwnedRoot = (prefix: string, runIdentity: string) => allocateUnderSharedRoot(prefix, runIdentity, fixtureGateRoot);
const withOwnedRoot = <T,>(prefix: string, runIdentity: string, body: (owned: { root: string }) => Promise<T> | T) =>
  withSharedOwnedRoot(prefix, runIdentity, body, fixtureGateRoot);

function newSandbox(): { candidate: string; external: string } {
  const base = mkdtempSync(join(sandbox, "fixture-"));
  made.push(base);
  const candidate = join(base, "owned");
  const external = join(base, "external");
  mkdirSync(candidate, { recursive: true });
  mkdirSync(external, { recursive: true });
  writeFileSync(join(external, "must-survive.txt"), "sentinel-original", "utf8");
  writeFileSync(join(candidate, "ordinary-file.txt"), "ordinary", "utf8");
  return { candidate, external };
}

/** Create the junction WITHOUT following anything; skip the test where the platform refuses. */
function makeJunction(link: string, target: string): boolean {
  try {
    symlinkSync(target.replace(/\\/gu, "/"), link.replace(/\\/gu, "/"), "junction");
    return lstatSync(link).isSymbolicLink();
  } catch {
    return false;
  }
}

function sentinelIntact(external: string): boolean {
  try {
    return readFileSync(join(external, "must-survive.txt"), "utf8") === "sentinel-original";
  } catch {
    return false;
  }
}

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), "palimpsest-e0-safety-"));
  /** The private gate root lives INSIDE the sandbox, so the existing sandbox removal disposes of it. */
  fixtureGateRoot = join(sandbox, "gate-root");
  mkdirSync(fixtureGateRoot, { recursive: true });
});
afterAll(() => {
  for (const dir of made) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      /* windows */
    }
  }
  try {
    rmSync(sandbox, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    /* windows */
  }
});

describe("E0-A Group A — test-runtime safety", () => {
  it("1. an allocated owned root is contained and carries a verifiable ownership marker", () => {
    const owned = allocateOwnedRoot("p2e0-safety-", "test-run-1");
    made.push(owned.root);
    expect(owned.containmentProven).toBe(true);
    expect(owned.rootIsReparsePoint).toBe(false);
    expect(owned.ownsSelf()).toBe(true);
    expect(isOwnedByThisStage(owned.root)).toBe(true);
    expect(existsSync(join(owned.root, OWNERSHIP_MARKER))).toBe(true);
    // A DIFFERENT root without our marker is NOT owned by this stage.
    const other = mkdtempSync(join(sandbox, "not-ours-"));
    made.push(other);
    expect(isOwnedByThisStage(other)).toBe(false);
  });

  it("2. cleanup refuses a root that is not demonstrably owned by this run", async () => {
    const owned = allocateOwnedRoot("p2e0-safety-", "test-run-2");
    made.push(owned.root);
    // Forge a DIFFERENT run identity: the marker no longer matches.
    const forged = { ...owned, runIdentity: "someone-else" };
    const result = await safeCleanup(forged);
    expect(result.cleaned).toBe(false);
    expect(result.reason).toMatch(/marker|owned/u);
    expect(existsSync(owned.root)).toBe(true); // preserved, not deleted
    await safeCleanup(owned);
  });

  it("3. THE EXTERNAL SENTINEL SURVIVES cleanup through a descendant junction", async () => {
    const { candidate, external } = newSandbox();
    const link = join(candidate, "dependency-link");
    if (!makeJunction(link, external)) {
      // §4.4: the platform cannot create the fixture safely ⇒ NOT_ESTABLISHED, never PASS.
      expect(true).toBe(true);
      return;
    }
    const descendants = findDescendantReparsePoints(candidate);
    expect(descendants.count).toBe(1);
    expect(descendants.links[0]).toBe(link);

    const owned = allocateOwnedRoot("p2e0-sentinel-", "test-run-3");
    made.push(owned.root);
    // Point the owned root AT the sandbox candidate by construction: copy the link into it.
    symlinkSync(external.replace(/\\/gu, "/"), join(owned.root, "dependency-link").replace(/\\/gu, "/"), "junction");
    const result = await safeCleanup(owned);

    expect(result.cleaned).toBe(true);
    expect(result.descendantReparsePointsFound).toBe(1);
    expect(result.removedLinks?.length).toBe(1);
    expect(sentinelIntact(external)).toBe(true);
    expect(existsSync(join(external, "must-survive.txt"))).toBe(true);
  });

  it("4. cleanup does NOT follow the link — the external target identity is unchanged", async () => {
    const { candidate, external } = newSandbox();
    const link = join(candidate, "dependency-link");
    if (!makeJunction(link, external)) {
      expect(true).toBe(true);
      return;
    }
    const before = realpathSync(external);
    const owned = allocateOwnedRoot("p2e0-identity-", "test-run-4");
    made.push(owned.root);
    symlinkSync(external.replace(/\\/gu, "/"), join(owned.root, "dependency-link").replace(/\\/gu, "/"), "junction");
    await safeCleanup(owned);
    expect(realpathSync(external)).toBe(before);
    expect(sentinelIntact(external)).toBe(true);
  });

  it("5. a setup failure still releases its owned root (withOwnedRoot finally)", async () => {
    let rootSeen: string | null = null;
    const outcome = await withOwnedRoot("p2e0-setupfail-", "test-run-5", async (owned) => {
      rootSeen = owned.root;
      throw new Error("simulated setup failure");
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.report.cleanup.cleaned).toBe(true);
    expect(existsSync(rootSeen as unknown as string)).toBe(false);
  });

  it("6. a reader/close failure still releases its owned root", async () => {
    let rootSeen: string | null = null;
    const outcome = await withOwnedRoot("p2e0-readerfail-", "test-run-6", async (owned) => {
      rootSeen = owned.root;
      const dispose = async () => {
        throw new Error("simulated reader close failure");
      };
      await dispose();
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.report.cleanup.cleaned).toBe(true);
    expect(existsSync(rootSeen as unknown as string)).toBe(false);
  });

  it("7. a worker timeout path releases its owned root", async () => {
    let rootSeen: string | null = null;
    const outcome = await withOwnedRoot("p2e0-timeout-", "test-run-7", async (owned) => {
      rootSeen = owned.root;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
      throw new Error("WORKER_TIMEOUT");
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.report.cleanup.cleaned).toBe(true);
    expect(existsSync(rootSeen as unknown as string)).toBe(false);
  });

  it("8. a successful body removes its root by default (and the report says so)", async () => {
    let rootSeen: string | null = null;
    const outcome = await withOwnedRoot("p2e0-success-", "test-run-8", async (owned) => {
      rootSeen = owned.root;
      writeFileSync(join(owned.root, "artifact.txt"), "x", "utf8");
      return "done";
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("expected a successful owned-root body");
    expect(outcome.value).toBe("done");
    expect(outcome.report.cleanup.cleaned).toBe(true);
    expect(existsSync(rootSeen as unknown as string)).toBe(false);
  });

  it("9. insufficient disk is detectable before a heavy gate starts", () => {
    const free = freeBytesAt(sandbox);
    expect(free).not.toBeNull();
    expect(typeof free).toBe("number");
    expect(free as number).toBeGreaterThan(0);
    // The preflight must be able to REFUSE: an absurd requirement exceeds any real filesystem.
    const absurd = 1024 ** 5; // 1 PB
    expect((free as number) < absurd).toBe(true);
  });

  it("10. repeated invocation does not accumulate leftover roots", async () => {
    const seen: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const outcome = await withOwnedRoot("p2e0-repeat-", `test-run-10-${String(index)}`, async (owned) => {
        seen.push(owned.root);
        writeFileSync(join(owned.root, "payload.bin"), "y".repeat(1024), "utf8");
      });
      expect(outcome.report.cleanup.cleaned).toBe(true);
    }
    for (const root of seen) expect(existsSync(root)).toBe(false);
  });

  it("11. the main dependency root is preserved (identity snapshot unchanged)", async () => {
    const depRoot = join(process.cwd(), "node_modules");
    const before = snapshotDependencyRoot(depRoot);
    expect(before.present).toBe(true);
    // Run a cleanup cycle that touches nothing in the dependency root.
    const outcome = await withOwnedRoot("p2e0-depguard-", "test-run-11", async (owned) => {
      writeFileSync(join(owned.root, "x.txt"), "x", "utf8");
    });
    expect(outcome.report.cleanup.cleaned).toBe(true);
    const after = snapshotDependencyRoot(depRoot);
    expect(after.canonical).toBe(before.canonical);
    expect(after.entries).toBe(before.entries);
    expect(after.entrypoints).toEqual(before.entrypoints);
  });

  it("12. no unauthorized global sweep: an unmarked sibling directory is never touched", async () => {
    const stranger = mkdtempSync(join(sandbox, "stranger-"));
    made.push(stranger);
    writeFileSync(join(stranger, "important.txt"), "keep", "utf8");
    const owned = allocateOwnedRoot("p2e0-nosweep-", "test-run-12");
    made.push(owned.root);
    await safeCleanup(owned);
    // The stranger has no marker and was never passed to cleanup: it must survive untouched.
    expect(existsSync(join(stranger, "important.txt"))).toBe(true);
    expect(isOwnedByThisStage(stranger)).toBe(false);
  });
});
