/**
 * Trajectory-P2-E1RE §3.4/§4.2 — PRE-TOOL AND BOUNDARY ADMISSION CONTROLS.
 *
 * TWO GROUPS, and the distinction between them is the point of the stage:
 *
 *   A. THE DELEGATION CWD GUARD — unit-level, exhaustive over the input shapes DSH can produce (omitted,
 *      absolute, relative, traversal, alias, empty, non-string). This proves the DECISION is right.
 *
 *   B. THE BOUNDARY PRECONDITION — the admission gate must require the WHOLE boundary, so a missing basis or
 *      delegation fence refuses the worker instead of reading as "the read guard is installed, so it is safe".
 *
 * The ORDERING claim — that the guard runs before the child exists — is NOT established here. It is established
 * by `scripts/trajectory_p2e1re/pretool-probe.mjs`, which drives the real first-party host and observes that no
 * child session is created for a refused CWD. A unit test cannot prove an ordering.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

/**
 * `host/**` is plain JavaScript and outside the TypeScript project, so the shipped functions are loaded through
 * a runtime-built specifier and typed here.
 */
type DelegationGuard = (execution: unknown) => string | undefined;
type FenceModule = {
  createDelegationCwdGuard: (config: { world: string; directories?: unknown; realpath?: (path: string) => string | undefined }) => DelegationGuard;
  DELEGATION_CWD_TOOLS: readonly string[];
};
type AdmissionModule = {
  admitWorker: (input: unknown) => {
    allowed: boolean;
    reason?: string;
    boundary?: { required: Record<string, boolean>; satisfied: boolean };
    classification?: { unclassified: string[] };
  };
};

const RUNTIME = ["..", "host", "deployment", "runtime"].join("/");
const load = async (name: string): Promise<unknown> => import(/* @vite-ignore */ `${RUNTIME}/${name}`);
const fence = (await load("cwd_fence.js")) as FenceModule;
const admission = (await load("worker_fence.js")) as AdmissionModule;

const ROOT = mkdtempSync(join(tmpdir(), "p2e1re-guard-"));
const WORLD = join(ROOT, "world");
const SIBLING = join(ROOT, "sibling");
const PROTECTED = join(ROOT, "durable-state");
const INSIDE = join(WORLD, "nested");
for (const dir of [WORLD, SIBLING, PROTECTED, INSIDE]) mkdirSync(dir, { recursive: true });
writeFileSync(join(PROTECTED, "AGENTS.md"), "PROTECTED CANARY\n");

const directories = (cwd: string) => ({ get: () => cwd });
const delegation = (cwd: string, world = WORLD) => fence.createDelegationCwdGuard({ world, directories: directories(world) });
const call = (name: string, args: Record<string, unknown>) => ({ name, arguments: args, agent: { session: { id: "s" } } });

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

/* ================================================================ A. the delegation guard */
describe("E1RE RE-A delegation CWD guard (DYNAMICALLY_VERIFIED)", () => {
  it("A1. an OMITTED cwd is admitted — the child inherits the parent's effective directory", () => {
    expect(delegation(WORLD)(call("subagent", { description: "d", prompt: "p" }))).toBeUndefined();
  });

  it("A2. an ABSOLUTE cwd equal to the world is admitted", () => {
    expect(delegation(WORLD)(call("subagent", { cwd: WORLD, description: "d", prompt: "p" }))).toBeUndefined();
  });

  it("A3. a RELATIVE cwd resolving to the world is admitted", () => {
    expect(delegation(WORLD)(call("subagent", { cwd: ".", description: "d", prompt: "p" }))).toBeUndefined();
  });

  it("A4. a cwd into a SIBLING world is refused", () => {
    const reason = delegation(WORLD)(call("subagent", { cwd: SIBLING, description: "d", prompt: "p" }));
    expect(typeof reason).toBe("string");
    expect(reason).toContain("is not the authorized execution world");
  });

  it("A5. a cwd into the simulated PROTECTED root is refused", () => {
    expect(typeof delegation(WORLD)(call("subagent", { cwd: PROTECTED, description: "d", prompt: "p" }))).toBe("string");
  });

  it("A6. a cwd into the PARENT of the protected root is refused", () => {
    expect(typeof delegation(WORLD)(call("subagent", { cwd: ROOT, description: "d", prompt: "p" }))).toBe("string");
  });

  it("A7. `..` traversal out of the world is refused", () => {
    expect(typeof delegation(WORLD)(call("subagent", { cwd: "../durable-state", description: "d", prompt: "p" }))).toBe("string");
    expect(typeof delegation(WORLD)(call("subagent", { cwd: "..", description: "d", prompt: "p" }))).toBe("string");
  });

  it("A8. a SUBDIRECTORY of the world is refused — a child's ancestor chain would differ", () => {
    /**
     * This is the control that distinguishes equality from containment. A child in `world/nested` would run
     * instruction discovery over `nested -> world -> ROOT`, so `ROOT/AGENTS.md` becomes reachable through a
     * relative path that never names the world.
     */
    expect(typeof delegation(WORLD)(call("subagent", { cwd: INSIDE, description: "d", prompt: "p" }))).toBe("string");
  });

  it("A9. an EMPTY or non-string cwd is refused rather than ignored", () => {
    expect(typeof delegation(WORLD)(call("subagent", { cwd: "", description: "d", prompt: "p" }))).toBe("string");
    expect(typeof delegation(WORLD)(call("subagent", { cwd: 42, description: "d", prompt: "p" }))).toBe("string");
  });

  it("A10. a JUNCTION naming the protected root is refused even though the path spells inside the world", () => {
    const link = join(WORLD, "link-to-protected");
    let created = true;
    try {
      symlinkSync(PROTECTED, link, "junction");
    } catch {
      created = false;
    }
    if (!created) return;
    expect(typeof delegation(WORLD)(call("subagent", { cwd: link, description: "d", prompt: "p" }))).toBe("string");
  });

  it("A11. `subagent_fork` is covered by the same guard", () => {
    expect(fence.DELEGATION_CWD_TOOLS).toContain("subagent_fork");
    expect(typeof delegation(WORLD)(call("subagent_fork", { cwd: PROTECTED, description: "d", prompt: "p" }))).toBe("string");
  });

  it("A12. an UNRELATED tool is untouched by the delegation guard", () => {
    expect(delegation(WORLD)(call("read", { file_path: join(PROTECTED, "AGENTS.md") }))).toBeUndefined();
  });

  it("A13. a parent basis that cannot be read refuses rather than guessing", () => {
    const guard = fence.createDelegationCwdGuard({ world: WORLD, directories: { get: () => undefined } });
    expect(typeof guard(call("subagent", { cwd: ".", description: "d", prompt: "p" }))).toBe("string");
  });

  it("A14. a relative cwd is resolved against the PARENT's effective directory, not the world", () => {
    /** If the parent basis moved to SIBLING, `.` means SIBLING — and that must be refused. */
    const guard = fence.createDelegationCwdGuard({ world: WORLD, directories: directories(SIBLING) });
    expect(typeof guard(call("subagent", { cwd: ".", description: "d", prompt: "p" }))).toBe("string");
  });
});

/* ================================================================ B. the boundary precondition */
describe("E1RE RE-B boundary admission precondition (DYNAMICALLY_VERIFIED)", () => {
  const surface = ["run_code", "palimpsest_worker_result", "palimpsest_worker_context_pull", "read", "grep", "bash"];
  /**
   * E1RG RG-B §5.6 STRENGTHENED THE REQUIRED SET. The kernel facts are now admission inputs, so a "full"
   * boundary in this suite must carry them — the E1RE assertion that the three guard flags alone were sufficient
   * described the weaker contract this stage replaced, and keeping it would pin the defect.
   */
  const full = {
    guardInstalled: true,
    cwdFenceInstalled: true,
    delegationFenceInstalled: true,
    kernelSupported: true,
    kernelRootsVerified: true,
    kernelCoverageComplete: true,
    kernelContractNotDrifted: true,
  };

  it("B1. the FULL boundary is admitted", () => {
    const verdict = admission.admitWorker({ visibleNames: surface, guardScope: "global", boundary: full });
    expect(verdict.allowed).toBe(true);
    expect(verdict.boundary?.satisfied).toBe(true);
  });

  it("B2. a MISSING installation report refuses — the precondition is not advisory", () => {
    const verdict = admission.admitWorker({ visibleNames: surface, guardScope: "global" });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain("boundary installation report was not supplied");
  });

  it("B3. a missing BASIS fence refuses, even with the read guard installed", () => {
    const verdict = admission.admitWorker({ visibleNames: surface, guardScope: "global", boundary: { ...full, cwdFenceInstalled: false } });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain("cwdFenceInstalled");
  });

  it("B4. a missing DELEGATION fence refuses", () => {
    const verdict = admission.admitWorker({ visibleNames: surface, guardScope: "global", boundary: { ...full, delegationFenceInstalled: false } });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain("delegationFenceInstalled");
  });

  it("B5. a WORKER-SCOPE guard refuses — delegation reaches other scopes", () => {
    const verdict = admission.admitWorker({ visibleNames: surface, guardScope: "worker-scope", boundary: full });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain("globalGuardScope");
  });

  it("B6. an UNCLASSIFIED capability still refuses, and the boundary fields are reported", () => {
    const verdict = admission.admitWorker({ visibleNames: [...surface, "brand_new_capability"], guardScope: "global", boundary: full });
    expect(verdict.allowed).toBe(false);
    expect(verdict.boundary?.required.capabilitySurfaceAdmitted).toBe(false);
  });

  it("B7. re-exposed `working_directory` refuses through the same gate", () => {
    const verdict = admission.admitWorker({ visibleNames: [...surface, "working_directory"], guardScope: "global", boundary: full });
    expect(verdict.allowed).toBe(false);
    expect(verdict.classification?.unclassified).toContain("working_directory");
  });

  it("B8. every refusal NAMES the guarantees that are missing, not a single collapsed boolean", () => {
    const verdict = admission.admitWorker({ visibleNames: surface, guardScope: "worker-scope", boundary: { guardInstalled: true, cwdFenceInstalled: false, delegationFenceInstalled: false } });
    expect(verdict.allowed).toBe(false);
    const required = verdict.boundary?.required ?? {};
    expect(required.cwdFenceInstalled).toBe(false);
    expect(required.delegationFenceInstalled).toBe(false);
    expect(required.globalGuardScope).toBe(false);
    expect(required.readGuardInstalled).toBe(true);
  });
});
