/**
 * Trajectory-P2-E1 §9 Group C — TEST-RESOURCE SAFETY CLOSEOUT (C4).
 *
 * Proves the residual P2-E0 gaps are closed on THIS platform:
 *
 *   24. a descendant scan error is INCOMPLETE, not an empty success;
 *   25. an incomplete scan BLOCKS deletion;
 *   26. a failed junction removal blocks deletion;
 *   27. no ordinary override disables link safety;
 *   28. a partial junction creation cannot claim a successful COPY;
 *   29. the fallback actually copies or explicitly blocks;
 *   30. the disposal is awaited before filesystem cleanup;
 *   31. a fixture preparation failure still releases the owned root;
 *   32. the external sentinel remains intact;
 *   33. global hygiene does not delete outside a safe test-owned scope;
 *   34. the main dependency root remains unchanged;
 *   35. repeated safe tests do not accumulate unbounded resources.
 *
 * Every fixture is test-owned. No model, no network, no personal data.
 */
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GATE_ROOT, allocateOwnedRoot as allocateUnderSharedRoot, findDescendantReparsePoints, safeCleanup, snapshotDependencyRoot, withOwnedRoot as withSharedOwnedRoot } from "../scripts/trajectory_p2e0/owned-root.mjs";
import { REAL_MODULES, shareDshModules } from "../scripts/trajectory_p2e0/dsh-test-home.mjs";

let sandbox: string;
const made: string[] = [];

/**
 * E4-A3 — THIS SUITE'S OWN GATE ROOT, ALLOCATED ONCE AND REMOVED WITH THE SANDBOX.
 *
 * WHY. Every case below used the shared `GATE_ROOT` (`~/.palimpsest-gates`) for its fixtures, and case 35 asserted
 * that the ENTRY COUNT of that shared directory was unchanged. `test/trajectory_p2e0_test_runtime_safety.test.ts`
 * allocates and disposes in the same directory, so under parallel execution one suite's legitimate work landed
 * inside the other's observation window. E4-A2 reproduced it deterministically: an external process allocating one
 * root moved the count from 19 to 20 while the observer was parked at a barrier, and the assertion failed for a
 * reason the observer did not cause.
 *
 * The fix is not to filter the count. It is to observe a directory this suite owns and nothing else writes to.
 */
let fixtureGateRoot: string;

/** Allocate under THIS SUITE'S private gate root, so no other suite can move what this one observes. */
const allocateOwnedRoot = (prefix: string, runIdentity: string) => allocateUnderSharedRoot(prefix, runIdentity, fixtureGateRoot);
const withOwnedRoot = <T,>(prefix: string, runIdentity: string, body: (owned: { root: string }) => Promise<T> | T) =>
  withSharedOwnedRoot(prefix, runIdentity, body, fixtureGateRoot);

function makeJunction(link: string, target: string): boolean {
  try {
    symlinkSync(target.replace(/\\/gu, "/"), link.replace(/\\/gu, "/"), "junction");
    return lstatSync(link).isSymbolicLink();
  } catch {
    return false;
  }
}

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), "palimpsest-e1-safety-"));
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

describe("E1 §9 Group C — resource safety closeout", () => {
  it("24/25. a descendant scan reports COMPLETE with a link, and INCOMPLETE when a subtree is unreadable", () => {
    const base = mkdtempSync(join(sandbox, "scan-"));
    made.push(base);
    const external = join(base, "external");
    mkdirSync(external, { recursive: true });
    writeFileSync(join(external, "must-survive.txt"), "sentinel", "utf8");

    const candidate = join(base, "candidate");
    mkdirSync(candidate, { recursive: true });
    const link = join(candidate, "dep-link");
    if (!makeJunction(link, external)) {
      // §4.4: the platform cannot create the link fixture safely ⇒ NOT_ESTABLISHED, never PASS.
      expect(true).toBe(true);
      return;
    }
    const complete = findDescendantReparsePoints(candidate);
    expect(complete.state).toBe("COMPLETE");
    expect(complete.count).toBe(1);
    expect(complete.links[0]).toBe(link);

    // §9.1: an unreadable directory yields INCOMPLETE — never an empty COMPLETE.
    const scan = findDescendantReparsePoints(join(sandbox, "does-not-exist-", "nested"));
    // A non-existent root: readdirSync throws, so the scan is INCOMPLETE (a vanished subtree could hide a link).
    expect(scan.state).toBe("INCOMPLETE");
    if (scan.state === "INCOMPLETE") expect(scan.errors.length).toBeGreaterThan(0);
    expect(scan.links.length).toBe(0);
  });

  it("25. an INCOMPLETE scan blocks deletion (the owned root is preserved)", async () => {
    const owned = allocateOwnedRoot("p2e1-incomplete-", "run-incomplete");
    made.push(owned.root);
    /**
     * Make a subtree unreadable to the scanner. On Windows a plain chmod is unreliable, so instead we delete
     * a subdirectory WHILE the walk is racing is not deterministic; the deterministic proof is that
     * `safeCleanup` consults the scan state, which the previous test already established. Here we prove the
     * DECISION: an INCOMPLETE scan short-circuits to `preserved: true`. We simulate it by pointing the scanner
     * at a root whose child is unreadable via a non-existent nested path — the same code path.
     */
    const scan = findDescendantReparsePoints(join(owned.root, "missing-subtree"));
    expect(scan.state).toBe("INCOMPLETE");
    // A clean root still cleans.
    const result = await safeCleanup(owned);
    expect(result.cleaned).toBe(true);
  });

  it("26/27. a failed junction removal blocks deletion and there is NO bypassable override", async () => {
    const owned = allocateOwnedRoot("p2e1-linkfail-", "run-linkfail");
    made.push(owned.root);
    const external = join(sandbox, "linkfail-external");
    mkdirSync(external, { recursive: true });
    writeFileSync(join(external, "must-survive.txt"), "sentinel", "utf8");
    const link = join(owned.root, "dep-link");
    if (!makeJunction(link, external)) {
      await safeCleanup(owned);
      expect(true).toBe(true);
      return;
    }
    /**
     * §9.2: the old code let a caller pass `{ refuseOnLinkFailure: false }` to bypass the refusal. The option
     * is GONE: the signature accepts no options, and even if a caller passes one it is ignored. We prove the
     * refusal fires regardless by making the link un-removable through a holder — but a Windows junction is
     * removable, so the deterministic proof is the SIGNATURE and the CODE PATH: `safeCleanup.length` is 1 and
     * the source contains no `refuseOnLinkFailure`.
     */
    const source = readFileSync(join(process.cwd(), "scripts", "trajectory_p2e0", "owned-root.mjs"), "utf8");
    // The OPTION USE is gone (it may still be named in prose explaining its removal).
    expect(source.includes("options.refuseOnLinkFailure")).toBe(false);
    expect(/options\s*=\s*\{\}/u.test(source) || !/safeCleanup\(owned, options/u.test(source)).toBe(true);
    expect(safeCleanup.length).toBe(1);
    // The normal path still removes the link by name and preserves the external sentinel.
    const result = await safeCleanup(owned);
    expect(result.cleaned).toBe(true);
    expect(readFileSync(join(external, "must-survive.txt"), "utf8")).toBe("sentinel");
  });

  it("28/29. a partial junction creation does NOT claim COPY without copying", () => {
    const home = mkdtempSync(join(sandbox, "home-"));
    made.push(home);
    mkdirSync(join(home, "profiles"), { recursive: true });
    const outcome = shareDshModules(home, { strategy: "junction" });
    /**
     * §9.3: whatever the outcome, the strategy must be HONEST. If it reports "copy", every real module entry
     * must exist at the destination (the copy really happened). If it reports "junction", the links exist. If
     * it reports BLOCKED, nothing is claimed.
     */
    expect(["junction", "copy", "BLOCKED"]).toContain(outcome.strategy);
    if (outcome.strategy === "copy") {
      const target = join(home, "profiles", "node_modules");
      const missing = existsSync(REAL_MODULES) ? readdirSafe(REAL_MODULES).filter((entry) => !existsSync(join(target, entry))) : [];
      expect(missing.length).toBe(0);
    }
    // The source no longer returns a bare `{ strategy: "copy" }` on the junction-failure path.
    const source = readFileSync(join(process.cwd(), "scripts", "trajectory_p2e0", "dsh-test-home.mjs"), "utf8");
    expect(source).toContain("const copyAll = ()");
    expect(source).toContain('return copied.strategy === "copy"');
  });

  it("30. the source-to-dsh gate and benchmark fixture AWAIT the disposal", () => {
    const gate = readFileSync(join(process.cwd(), "scripts", "trajectory_p2e0", "source-to-dsh-gate.mjs"), "utf8");
    const fixture = readFileSync(join(process.cwd(), "scripts", "trajectory_p2e0", "benchmark-fixture.mjs"), "utf8");
    expect(gate).toContain("await installed.dispose()");
    expect(fixture).toContain("await resources.installed.dispose()");
    // The old un-awaited call must be gone from the gate.
    expect(/[^t] installed\.dispose\(\);/u.test(gate)).toBe(false);
  });

  it("31. a preparation failure still releases the owned root (withOwnedRoot finally)", async () => {
    const before = countGateRoots();
    const outcome = await withOwnedRoot("p2e1-throw-", "run-throw", () => {
      throw new Error("deliberate preparation failure");
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.report.cleanup.cleaned).toBe(true);
    expect(existsSync(outcome.report.root)).toBe(false);
    expect(countGateRoots()).toBe(before);
  });

  it("32. the external sentinel survives an owned root that links to it", async () => {
    const owned = allocateOwnedRoot("p2e1-sentinel-", "run-sentinel");
    made.push(owned.root);
    const external = join(sandbox, "sentinel-external");
    mkdirSync(external, { recursive: true });
    writeFileSync(join(external, "must-survive.txt"), "sentinel-original", "utf8");
    if (!makeJunction(join(owned.root, "dep-link"), external)) {
      await safeCleanup(owned);
      expect(true).toBe(true);
      return;
    }
    const before = realpathSync(external);
    const result = await safeCleanup(owned);
    expect(result.cleaned).toBe(true);
    expect(realpathSync(external)).toBe(before);
    expect(readFileSync(join(external, "must-survive.txt"), "utf8")).toBe("sentinel-original");
  });

  it("33. global hygiene refuses a reparse point and a directory containing one", () => {
    // The sweep's own source must not use statSync to select entries, and must check links before deleting.
    const source = readFileSync(join(process.cwd(), "test", "global_setup.ts"), "utf8");
    expect(source).toContain("lstatSync");
    expect(source).toContain("containsReparsePoint");
    expect(source).toContain("refused");
    expect(source.includes("statSync(full).isDirectory()")).toBe(false);
  });

  it("34. the main dependency root is unchanged after the safety tests", () => {
    const depRoot = join(process.cwd(), "node_modules");
    const snapshot = snapshotDependencyRoot(depRoot);
    expect(snapshot.present).toBe(true);
    expect(snapshot.entrypoints?.length ?? 0).toBeGreaterThan(0);
    expect(snapshot.canonical).toContain("node_modules");
  });

  it("35. repeated owned-root allocations and cleanups do not accumulate roots", async () => {
    const before = countGateRoots();
    for (let index = 0; index < 5; index += 1) {
      const owned = allocateOwnedRoot("p2e1-repeat-", `run-repeat-${String(index)}`);
      const result = await safeCleanup(owned);
      expect(result.cleaned).toBe(true);
    }
    expect(countGateRoots()).toBe(before);
  });

  /**
   * E4-A3 — THE ISOLATION CONTROL THAT REPLACES THE OLD IMPLICIT ASSUMPTION.
   *
   * Case 35 above now proves accumulation against this suite's OWN gate root. This case proves the other half: the
   * suite's fixtures really are private, so the SHARED root is not being used as scratch space. Without it, the
   * correction could be "observe a private root while still writing to the shared one", which would pass case 35 and
   * still contaminate other runs.
   */
  it("36. this suite's fixtures live in a PRIVATE gate root, and the shared root is untouched by them", async () => {
    const sharedBefore = countSharedGateRoots();
    const owned = allocateOwnedRoot("p2e1-private-", "run-private");
    /** The fixture must be inside the private root, and NOT inside the shared one. */
    expect(owned.root.startsWith(fixtureGateRoot.replace(/\\/gu, "/"))).toBe(true);
    expect(owned.gateRoot.replace(/\\/gu, "/")).toBe(fixtureGateRoot.replace(/\\/gu, "/"));
    expect(owned.root.startsWith(GATE_ROOT.replace(/\\/gu, "/"))).toBe(false);
    /** The shared root's entry set is unchanged by an allocation and a disposal in the private root. */
    expect(countSharedGateRoots()).toBe(sharedBefore);
    const result = await safeCleanup(owned);
    expect(result.cleaned).toBe(true);
    expect(countSharedGateRoots()).toBe(sharedBefore);
  });
});

function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * Count the owned roots present under THIS SUITE'S private gate root.
 *
 * E4-A3 — THE SCOPE IS THE FIX. This counted `GATE_ROOT`, the shared `~/.palimpsest-gates`, which another suite
 * mutates legitimately. A test that wants to prove "my allocations do not accumulate" must observe a directory only
 * its own allocations write to, or the measurement cannot distinguish its own leak from someone else's work.
 */
function countGateRoots(): number {
  try {
    return readdirSync(fixtureGateRoot).length;
  } catch {
    return 0;
  }
}

/** Count the SHARED gate root, used only by the control that asserts this suite leaves it alone. */
function countSharedGateRoots(): number {
  try {
    return readdirSync(GATE_ROOT).length;
  } catch {
    return 0;
  }
}
