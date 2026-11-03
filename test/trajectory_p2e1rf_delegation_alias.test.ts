/**
 * Trajectory-P2-E1RF §4 — RF-A: DELEGATION PATH IDENTITY.
 *
 * THE DEFECT THIS PINS. E1RE's delegation guard decided from `realpath()`. A junction whose CURRENT target is
 * the authorized world — `world/alias-to-world` — therefore canonicalized to the world and was ADMITTED. The
 * current target is not the property that matters: a link is a mutable indirection, so approving it means
 * approving a path whose meaning can change after the decision was made.
 *
 * WHAT THE CORRECTION DOES. Lexical identity with the world is the DECISION; a reparse scan over the path as
 * SPELLED is defence in depth; canonicalization is kept only as a consistency check on the host's own world.
 *
 * TWO GROUPS, and the distinction is the point of the stage:
 *   A. THE DECISION — every input shape DSH can produce, plus the alias cases the ruling names.
 *   B. THE SURFACE  — the enforced name set is derived from the classification table, so a delegated capability
 *                     that appears later is covered without a code change.
 *
 * WHAT THIS SUITE DOES NOT ESTABLISH. It cannot prove ORDERING (that the guard runs before the child exists).
 * That is established by `scripts/trajectory_p2e1re/pretool-probe.mjs` driving the real first-party host, and is
 * re-run for E1RF by `scripts/trajectory_p2e1rf/run-delegation-matrix.mjs`.
 *
 * FIXTURE LIMITS ARE RECORDED, NOT HIDDEN. A junction needs no privilege on Windows, so the load-bearing alias
 * fixtures DO run. A true SYMLINK needs Developer Mode or SeCreateSymbolicLinkPrivilege, and where it cannot be
 * created the case reports LIMIT rather than passing.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

type DelegationGuard = (execution: unknown) => string | undefined;
type FenceModule = {
  createDelegationCwdGuard: (config: {
    world: string;
    directories?: unknown;
    realpath?: (path: string) => string | undefined;
    lstat?: (path: string) => { isSymbolicLink: () => boolean } | undefined;
    tools?: readonly string[];
  }) => DelegationGuard;
  DELEGATION_CWD_TOOLS: readonly string[];
  delegationCwdToolsFor: (visibleNames: readonly string[] | undefined, classes: readonly { name: string; class: string }[]) => readonly string[];
};
type ClassModule = { CAPABILITY_CLASSES: readonly { name: string; class: string }[] };

/**
 * `host/**` is plain JavaScript and outside the TypeScript project, so the shipped functions are loaded through
 * a runtime-built specifier and typed here.
 */
const RUNTIME = ["..", "host", "deployment", "runtime"].join("/");
const load = async (name: string): Promise<unknown> => import(/* @vite-ignore */ `${RUNTIME}/${name}`);
const fence = (await load("cwd_fence.js")) as FenceModule;
const classes = (await load("capability_classes.js")) as ClassModule;

const ROOT = mkdtempSync(join(tmpdir(), "p2e1rf-alias-"));
const WORLD = join(ROOT, "world");
const SIBLING = join(ROOT, "sibling");
const PROTECTED = join(ROOT, "durable-state");
const NESTED = join(WORLD, "nested");
for (const dir of [WORLD, SIBLING, PROTECTED, NESTED]) mkdirSync(dir, { recursive: true });
writeFileSync(join(PROTECTED, "AGENTS.md"), "P2E1RF-SYNTHETIC-CANARY\n", "utf8");

const directories = (cwd: string) => ({ get: () => cwd });
const delegation = (world = WORLD, basis = world) => fence.createDelegationCwdGuard({ world, directories: directories(basis) });
const call = (name: string, args: Record<string, unknown>) => ({ name, arguments: args, agent: { session: { id: "test-owned-session" } } });
const subagent = (cwd: unknown) => call("subagent", { cwd, description: "d", prompt: "p" });

/**
 * Build a junction, or report that this host could not. A directory junction is the reparse mechanism this
 * stage tests; a failure is a FIXTURE LIMIT and is surfaced, never silently treated as a pass.
 */
const junction = (target: string, link: string): { created: true } | { created: false; why: string } => {
  try {
    symlinkSync(target, link, "junction");
    return { created: true };
  } catch (error) {
    return { created: false, why: error instanceof Error ? `${(error as NodeJS.ErrnoException).code ?? ""} ${error.message}`.trim() : String(error) };
  }
};

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

/* ================================================================ A. the decision */
describe("E1RF RF-A delegation path identity (DYNAMICALLY_VERIFIED)", () => {
  it("1. an ABSOLUTE cwd equal to the world is ADMITTED — legitimate in-world delegation still works", () => {
    expect(delegation()(subagent(WORLD))).toBeUndefined();
  });

  it("2. a RELATIVE `.` resolving to the world is ADMITTED", () => {
    expect(delegation()(subagent("."))).toBeUndefined();
  });

  it("3. an OMITTED cwd is ADMITTED — the child inherits the parent's effective directory", () => {
    expect(delegation()(call("subagent", { description: "d", prompt: "p" }))).toBeUndefined();
  });

  it("4. a SIBLING world is REFUSED", () => {
    const reason = delegation()(subagent(SIBLING));
    expect(typeof reason).toBe("string");
    expect(reason).toContain("is not the authorized execution world");
  });

  it("5. a simulated PROTECTED root is REFUSED", () => {
    expect(typeof delegation()(subagent(PROTECTED))).toBe("string");
  });

  it("6. `..` traversal out of the world is REFUSED", () => {
    expect(typeof delegation()(subagent("../durable-state"))).toBe("string");
    expect(typeof delegation()(subagent(".."))).toBe("string");
  });

  it("7. a NESTED directory that is not exactly the world is REFUSED", () => {
    /**
     * This is what distinguishes equality from containment: a child in `world/nested` would discover
     * instructions over `nested -> world -> ROOT`, so the protected root's AGENTS.md becomes reachable through
     * a relative path that never names it.
     */
    expect(typeof delegation()(subagent(NESTED))).toBe("string");
  });

  it("8. a junction currently pointing at the PROTECTED root is REFUSED", () => {
    const link = join(WORLD, "to-protected");
    const made = junction(PROTECTED, link);
    if (!made.created) {
      /** LIMIT: the fixture could not be built. Recorded as a limit, never as a pass. */
      expect.fail(`LIMIT — the junction fixture could not be created on this host: ${made.why}`);
    }
    expect(typeof delegation()(subagent(link))).toBe("string");
  });

  it("9. a junction currently pointing BACK TO THE WORLD is REFUSED — THE DEFECT", () => {
    /**
     * THE LOAD-BEARING CONTROL. Before the correction this returned `undefined` (admitted): the junction's
     * canonical target IS the world. The path is still a mutable indirection, so the guard must refuse it on
     * the SPELLING rather than approve it on the target.
     */
    const link = join(WORLD, "alias-to-world");
    const made = junction(WORLD, link);
    if (!made.created) expect.fail(`LIMIT — the junction fixture could not be created on this host: ${made.why}`);
    const reason = delegation()(subagent(link));
    expect(typeof reason).toBe("string");
    expect(reason).toContain("reparse point");
  });

  it("10. a reparse point in an INTERMEDIATE component is REFUSED", () => {
    const link = join(WORLD, "mid");
    const made = junction(WORLD, link);
    if (!made.created) expect.fail(`LIMIT — the intermediate junction could not be created on this host: ${made.why}`);
    /**
     * `world/mid/..` NORMALIZES to the world, so lexical identity alone would admit it. The spelled-component
     * scan is what catches it: the `mid` segment is a link, and a link in transit is a directory whose meaning
     * the string does not fix.
     */
    expect(typeof delegation()(subagent(`${link}${"\\"}..`))).toBe("string");
  });

  it("11. a BROKEN or unresolvable reparse point is REFUSED", () => {
    const link = join(WORLD, "dangling");
    const made = junction(join(ROOT, "does-not-exist"), link);
    if (!made.created) expect.fail(`LIMIT — the dangling junction could not be created on this host: ${made.why}`);
    expect(typeof delegation()(subagent(link))).toBe("string");
  });

  it("12. a junction RETARGETED after a previous check is still refused — the decision is not the target", () => {
    /**
     * The specific race this stage refuses to depend on. A guard that decided from `realpath()` would admit
     * the path when the link pointed at the world; re-pointing it afterwards would move a child the guard had
     * already approved. Here the FIRST call must already refuse, so retargeting has nothing to change.
     */
    const link = join(WORLD, "retargeted");
    const made = junction(WORLD, link);
    if (!made.created) expect.fail(`LIMIT — the retarget junction could not be created on this host: ${made.why}`);
    const before = delegation()(subagent(link));
    expect(typeof before).toBe("string");
    /** Re-point it at the protected root and ask again: the answer must be the same refusal. */
    rmSync(link, { recursive: true, force: true });
    const remade = junction(PROTECTED, link);
    if (remade.created) expect(typeof delegation()(subagent(link))).toBe("string");
  });

  it("13. a path whose CANONICALIZATION FAILS does not fall back to the spelling", () => {
    /**
     * Injected `realpath` returns `undefined`, which is what a canonicalization failure produces. The world
     * itself cannot be canonicalized, so the guard cannot show the object it approved is the object behind the
     * spelling — and refuses rather than assuming the spelling is the object.
     */
    const guard = fence.createDelegationCwdGuard({ world: WORLD, directories: directories(WORLD), realpath: () => undefined });
    const reason = guard(subagent(WORLD));
    expect(typeof reason).toBe("string");
    expect(reason).toContain("could not be canonicalized");
  });

  it("14. a CASE-ONLY spelling difference is admitted, because NTFS is case-insensitive", () => {
    /** The inverse control: the guard must not refuse ordinary work over a spelling change that names the same object. */
    expect(delegation()(subagent(WORLD.toUpperCase()))).toBeUndefined();
    expect(delegation()(subagent(WORLD.toLowerCase()))).toBeUndefined();
  });

  it("15. `subagent_fork` is covered by the same guard when the surface exposes it", () => {
    expect(fence.DELEGATION_CWD_TOOLS).toContain("subagent_fork");
    const guard = fence.createDelegationCwdGuard({ world: WORLD, directories: directories(WORLD) });
    expect(typeof guard(call("subagent_fork", { cwd: PROTECTED, description: "d", prompt: "p" }))).toBe("string");
  });

  it("16. a malformed execution identity that names an unreadable basis refuses rather than guessing", () => {
    const guard = fence.createDelegationCwdGuard({ world: WORLD, directories: { get: () => undefined } });
    expect(typeof guard(subagent("."))).toBe("string");
    /** A non-string and an empty cwd are refusals, not silent admissions. */
    expect(typeof delegation()(subagent(42))).toBe("string");
    expect(typeof delegation()(subagent(""))).toBe("string");
    expect(typeof delegation()(subagent("   "))).toBe("string");
  });

  it("17. the REAL production-shaped Work World layout admits its own world and refuses the durable store", () => {
    /** `<root>/.palimpsest/worlds/attempt-1` is the shape the product actually creates. */
    const repository = join(ROOT, "production");
    const world = join(repository, ".palimpsest", "worlds", "attempt-1");
    const durable = join(repository, ".palimpsest");
    mkdirSync(world, { recursive: true });
    const guard = fence.createDelegationCwdGuard({ world, directories: directories(world) });
    expect(guard(subagent(world))).toBeUndefined();
    expect(typeof guard(subagent(durable))).toBe("string");
    expect(typeof guard(subagent(join(repository, ".palimpsest", "worlds", "attempt-2")))).toBe("string");
  });

  it("18. an UNKNOWN delegation-capable tool is covered once it is declared a delegated surface", () => {
    /**
     * §4.6: the guard list must not be a closed pair. A capability the classification table calls
     * DELEGATED_SURFACE is enforced by CLASS, so a name this module has never seen is still fenced.
     */
    const declared = [...classes.CAPABILITY_CLASSES, { name: "future_delegate", class: "DELEGATED_SURFACE" }];
    const names = fence.delegationCwdToolsFor(undefined, declared);
    expect(names).toContain("future_delegate");
    const guard = fence.createDelegationCwdGuard({ world: WORLD, directories: directories(WORLD), tools: names });
    expect(typeof guard(call("future_delegate", { cwd: PROTECTED }))).toBe("string");
    /** And a tool that is NOT a delegation surface stays untouched. */
    expect(guard(call("read", { file_path: join(PROTECTED, "AGENTS.md") }))).toBeUndefined();
  });
});

/* ================================================================ B. the enforced surface */
describe("E1RF RF-A delegation surface derivation (DYNAMICALLY_VERIFIED)", () => {
  it("S1. every declared DELEGATED_SURFACE is enforced, plus the declared minimum", () => {
    const names = fence.delegationCwdToolsFor(undefined, classes.CAPABILITY_CLASSES);
    for (const entry of classes.CAPABILITY_CLASSES.filter((e) => e.class === "DELEGATED_SURFACE")) expect(names).toContain(entry.name);
    for (const name of fence.DELEGATION_CWD_TOOLS) expect(names).toContain(name);
  });

  it("S2. an ABSENT tool is not enforced — a guard must not name a capability the surface does not have", () => {
    /** `tools.restrict()` refuses unknown names; a guard naming them would be its own failure mode. */
    const names = fence.delegationCwdToolsFor(["subagent", "read"], classes.CAPABILITY_CLASSES);
    expect(names).toContain("subagent");
    expect(names).not.toContain("workflow");
  });

  it("S3. the derivation is STABLE and duplicate-free", () => {
    const names = fence.delegationCwdToolsFor(undefined, classes.CAPABILITY_CLASSES);
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual([...names]);
  });

  it("S4. the real DSH 0.2.1-rc.2 surface registers `subagent` and NOT `subagent_fork`", () => {
    /**
     * An OBSERVATION, recorded because it is the reason the list is derived rather than hardcoded: E1RE
     * enforced a name this release does not register. This assertion documents reality; it does not weaken
     * the guard, which keeps `subagent_fork` in its declared minimum for a release that does.
     */
    const derivedForRealSurface = fence.delegationCwdToolsFor(["subagent", "workflow", "job_output"], classes.CAPABILITY_CLASSES);
    expect(derivedForRealSurface).toContain("subagent");
    expect(derivedForRealSurface).not.toContain("subagent_fork");
    expect(fence.DELEGATION_CWD_TOOLS).toContain("subagent_fork");
  });
});
