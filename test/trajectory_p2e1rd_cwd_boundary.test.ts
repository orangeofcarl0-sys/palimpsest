/**
 * Trajectory-P2-E1RD §5.3/§10.1 — WORKING-DIRECTORY SECURITY NEGATIVE CONTROLS.
 *
 * EVERY CONTROL HERE RUNS THE PRODUCTION GUARD. Nothing is asserted from source inspection: `createReadGuard`,
 * `createCwdFenceGuard`, `classifyWorkerCapabilities` and `withdrawalFilter` are the shipped functions, called
 * with the actual argument shapes DSH dispatches.
 *
 * The controls are grouped by the question each answers:
 *   A. does the basis fence refuse a divergence, in every shape it can take?
 *   B. does the withdrawal actually remove the capability, and does the gate still refuse a re-exposure?
 *   C. is the read guard still sound when the basis is equal (no regression to R1-H/HR/HC)?
 *
 * All filesystem fixtures are TEST-OWNED: a temporary root with a world, a simulated protected root and a
 * harmless canary. No personal path, session or credential is read.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

/**
 * `host/**` is PLAIN JAVASCRIPT and deliberately outside the TypeScript project (the architecture checker scans
 * it as JavaScript), so the shipped functions are loaded DYNAMICALLY and typed here. A static import would pull
 * production host code into the TS graph, which is the boundary the repository maintains on purpose.
 *
 * The specifier is built at runtime so TypeScript cannot resolve it statically: a literal specifier — even
 * inside `import()` — is still type-checked, and `host/**` has no declarations to check against.
 */
type CapabilityEntry = { name: string; class: string; why: string };
type Classification = { ok: boolean; unclassified: string[]; detail: string; classified: CapabilityEntry[] };
type ClassesModule = {
  classifyWorkerCapabilities: (names: readonly string[]) => Classification;
  withdrawalFilter: (names: readonly string[]) => { withdraw: string[]; absent: string[] };
  WITHDRAWN_CAPABILITIES: readonly { name: string }[];
};
type FenceModule = {
  createCwdFenceGuard: (config: { world: string; directories?: unknown }) => (execution: unknown) => string | undefined;
  effectiveDirectoryOf: (directories: unknown, session: unknown) => { read: true; cwd: string } | { read: false; why: string };
  sameDirectory: (left: string, right: string) => boolean;
};
type GuardModule = { createReadGuard: (config: { roots: readonly string[]; world: string; cwd?: string }) => (execution: unknown) => string | undefined };

const RUNTIME = ["..", "host", "deployment", "runtime"].join("/");
const loadRuntime = async (name: string): Promise<unknown> => import(/* @vite-ignore */ `${RUNTIME}/${name}`);

const classes = (await loadRuntime("capability_classes.js")) as ClassesModule;
const fence = (await loadRuntime("cwd_fence.js")) as FenceModule;
const guardModule = (await loadRuntime("read_guard.js")) as GuardModule;
const { classifyWorkerCapabilities, withdrawalFilter, WITHDRAWN_CAPABILITIES } = classes;
const { createCwdFenceGuard, effectiveDirectoryOf, sameDirectory } = fence;
const { createReadGuard } = guardModule;

/* ================================================================ test-owned canary world */
const ROOT = mkdtempSync(join(tmpdir(), "p2e1rd-cwd-"));
const WORLD = join(ROOT, "world");
const SIBLING = join(ROOT, "sibling-world");
const PROTECTED = join(ROOT, "durable-state");
const CANARY = join(PROTECTED, "canary.txt");
const WORLD_FILE = join(WORLD, "authorized.txt");
mkdirSync(WORLD, { recursive: true });
mkdirSync(SIBLING, { recursive: true });
mkdirSync(PROTECTED, { recursive: true });
writeFileSync(WORLD_FILE, "authorized world content\n");
writeFileSync(CANARY, "PROTECTED CANARY - MUST NOT BE DISCLOSED\n");

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

/** A stand-in for the DSH working-directory service: only `get(session)` is used by the fence. */
const serviceReporting = (cwd: string) => ({ get: () => cwd });
const call = (name: string) => ({ name, agent: { session: { id: "s" } }, arguments: {} });

/* ================================================================ A. the basis fence */
describe("E1RD §5.3 the working-directory basis fence (DYNAMICALLY_VERIFIED)", () => {
  it("A1. an equal basis is admitted, so ordinary work still runs", () => {
    const guard = createCwdFenceGuard({ world: WORLD, directories: serviceReporting(WORLD) });
    expect(guard(call("read"))).toBeUndefined();
    expect(guard(call("grep"))).toBeUndefined();
    expect(guard(call("bash"))).toBeUndefined();
  });

  it("A2. a basis changed OUTSIDE the world is refused", () => {
    const guard = createCwdFenceGuard({ world: WORLD, directories: serviceReporting(ROOT) });
    const reason = guard(call("read"));
    expect(typeof reason).toBe("string");
    expect(reason).toContain("is not the authorized execution world");
  });

  it("A3. a basis changed INTO the simulated protected root is refused", () => {
    const guard = createCwdFenceGuard({ world: WORLD, directories: serviceReporting(PROTECTED) });
    expect(typeof guard(call("read"))).toBe("string");
  });

  it("A4. a basis changed into a SIBLING world is refused — containment alone would have allowed it", () => {
    /**
     * This is the control that distinguishes equality from containment. A sibling attempt world is a disclosed
     * residual, not a protected root, so a containment test would admit it while the guard's allowance against
     * the world no longer describes what the executor would open.
     */
    const guard = createCwdFenceGuard({ world: WORLD, directories: serviceReporting(SIBLING) });
    expect(typeof guard(call("read"))).toBe("string");
  });

  it("A5. the refusal is per-call: the SAME guard admits again once the basis is restored", () => {
    let cwd = PROTECTED;
    const guard = createCwdFenceGuard({ world: WORLD, directories: { get: () => cwd } });
    expect(typeof guard(call("read"))).toBe("string");
    cwd = WORLD;
    expect(guard(call("read"))).toBeUndefined();
  });

  it("A6. a divergence that happens AFTER installation is still refused (the basis is not captured once)", () => {
    let cwd = WORLD;
    const guard = createCwdFenceGuard({ world: WORLD, directories: { get: () => cwd } });
    expect(guard(call("read"))).toBeUndefined();
    cwd = PROTECTED;
    expect(typeof guard(call("read"))).toBe("string");
  });

  it("A7. a missing or unreadable service fails CLOSED, except when the process directory is the world", () => {
    expect(typeof createCwdFenceGuard({ world: WORLD, directories: undefined })(call("read"))).toBe("string");
    expect(typeof createCwdFenceGuard({ world: WORLD, directories: { get: () => undefined } })(call("read"))).toBe("string");
    expect(typeof createCwdFenceGuard({ world: WORLD, directories: { get: () => "" } })(call("read"))).toBe("string");
    expect(typeof createCwdFenceGuard({ world: WORLD, directories: { get: () => { throw new Error("boom"); } } })(call("read"))).toBe("string");
    /** The documented exception: no service at all AND the process directory IS the world. */
    expect(createCwdFenceGuard({ world: process.cwd(), directories: undefined })(call("read"))).toBeUndefined();
    expect(typeof createCwdFenceGuard({ world: WORLD, directories: undefined })(call("read"))).toBe("string");
  });

  it("A8. the two path-independent worker-private tools remain usable under a diverged basis", () => {
    const guard = createCwdFenceGuard({ world: WORLD, directories: serviceReporting(PROTECTED) });
    expect(guard(call("palimpsest_worker_result"))).toBeUndefined();
    expect(guard(call("palimpsest_worker_context_pull"))).toBeUndefined();
    /** Everything else stays refused — the exemption is exactly two names. */
    expect(typeof guard(call("read"))).toBe("string");
    expect(typeof guard(call("write"))).toBe("string");
  });

  it("A9. directory comparison is case-folded on win32, so a re-capitalized basis is not a bypass", () => {
    if (process.platform !== "win32") return;
    const guard = createCwdFenceGuard({ world: WORLD, directories: serviceReporting(WORLD.toUpperCase()) });
    expect(guard(call("read"))).toBeUndefined();
  });

  it("A10. a basis that is a PREFIX of the world is not treated as equal", () => {
    expect(sameDirectory(WORLD, `${WORLD}-other`)).toBe(false);
    expect(sameDirectory(WORLD, ROOT)).toBe(false);
    expect(sameDirectory(WORLD, WORLD)).toBe(true);
    expect(effectiveDirectoryOf(serviceReporting(WORLD), {}).read).toBe(true);
  });
});

/* ================================================================ B. withdrawal and re-exposure */
describe("E1RD §6 capability withdrawal (DYNAMICALLY_VERIFIED)", () => {
  it("B1. the capability is WITHDRAWN from a surface that exposes it", () => {
    const filter = withdrawalFilter(["read", "grep", "working_directory"]);
    expect(filter.withdraw).toEqual(["working_directory"]);
    expect(filter.absent).toEqual([]);
  });

  it("B2. a surface without it produces an EMPTY filter, so restrict() is never called with an unknown name", () => {
    const filter = withdrawalFilter(["read", "grep"]);
    expect(filter.withdraw).toEqual([]);
    expect(filter.absent).toEqual(["working_directory"]);
  });

  it("B3. the withdrawal is NOT a classification: the name stays absent from the table", () => {
    /**
     * The absence is the backstop. If someone later 'fixes' the E1RC refusal by classifying the tool, this
     * control fails and the change is visible in review rather than silent.
     */
    const names = WITHDRAWN_CAPABILITIES.map((entry: { name: string }) => entry.name);
    expect(names).toContain("working_directory");
    const classification = classifyWorkerCapabilities(["read", "working_directory"]);
    expect(classification.ok).toBe(false);
    expect(classification.unclassified).toContain("working_directory");
  });

  it("B4. a re-exposed capability still REFUSES the worker start (the fail-closed backstop)", () => {
    const verdict = classifyWorkerCapabilities(["read", "grep", "bash", "working_directory"]);
    expect(verdict.ok).toBe(false);
    expect(verdict.detail).toContain("UNCLASSIFIED");
  });

  it("B5. the post-withdrawal surface classifies, so a conforming worker is admitted", () => {
    const before = ["read", "grep", "bash", "working_directory"];
    const filter = withdrawalFilter(before);
    const after = before.filter((name) => !filter.withdraw.includes(name));
    const verdict = classifyWorkerCapabilities(after);
    expect(verdict.ok).toBe(true);
    expect(verdict.unclassified).toEqual([]);
  });
});

/* ================================================================ C. no regression to the read guard */
describe("E1RD §10.1 the read guard is unchanged where the basis is equal (DYNAMICALLY_VERIFIED)", () => {
  it("C1. an authorized read of the worker's own world is still allowed", () => {
    const guard = createReadGuard({ roots: [PROTECTED], world: WORLD });
    expect(guard({ name: "read", arguments: { file_path: WORLD_FILE } })).toBeUndefined();
    expect(guard({ name: "read", arguments: { file_path: "authorized.txt" } })).toBeUndefined();
  });

  it("C2. an absolute read of the protected canary is still refused", () => {
    const guard = createReadGuard({ roots: [PROTECTED], world: WORLD });
    const reason = guard({ name: "read", arguments: { file_path: CANARY } });
    expect(typeof reason).toBe("string");
    expect(reason).toContain("protected root");
  });

  it("C3. a relative escape through `..` is still refused", () => {
    const guard = createReadGuard({ roots: [PROTECTED], world: WORLD });
    expect(typeof guard({ name: "read", arguments: { file_path: "../durable-state/canary.txt" } })).toBe("string");
  });

  it("C4. a search rooted above a protected root is still refused (mutual overlap)", () => {
    const guard = createReadGuard({ roots: [PROTECTED], world: WORLD });
    expect(typeof guard({ name: "grep", arguments: { path: ROOT } })).toBe("string");
    expect(typeof guard({ name: "ls", arguments: { path: ROOT } })).toBe("string");
  });

  it("C5. the two layers together: a diverged basis is refused even for a path the read guard allows", () => {
    /**
     * The composition that matters. The read guard, resolving against the world, allows `authorized.txt`; the
     * basis fence refuses the call outright because the executor would resolve that same relative path against
     * a different directory. Either denial alone is sufficient; both are installed.
     */
    const readGuard = createReadGuard({ roots: [PROTECTED], world: WORLD });
    const cwdFence = createCwdFenceGuard({ world: WORLD, directories: serviceReporting(PROTECTED) });
    const execution = { name: "read", agent: { session: { id: "s" } }, arguments: { file_path: "authorized.txt" } };
    expect(readGuard(execution)).toBeUndefined();
    expect(typeof cwdFence(execution)).toBe("string");
  });
});
