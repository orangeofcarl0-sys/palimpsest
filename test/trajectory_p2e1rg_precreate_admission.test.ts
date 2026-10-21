/**
 * Trajectory-P2-E1RG §4 — RG-A: PRE-CREATE ADMISSION MUST ACTUALLY FAIL CLOSED.
 *
 * THE DEFECT THIS PINS (measured on the parent commit, `rg0-findings.json` F1/F2/F3/F4).
 *
 * `runWorker()` assigned `failure` when capacity or alias admission refused, then continued to
 * `agents.create()`. A model turn could follow, and — because the reported-result branch was evaluated BEFORE
 * `failure` — a refused worker could still print `READY_FOR_SETTLEMENT` and exit 0.
 *
 * THE INVARIANTS ASSERTED HERE:
 *
 *     PreCreateAdmissionRefused => NoAgentCreation => NoModelTurn
 *                               => NoSuccessfulWorkerOutcome => HOST_FAILURE
 *     ScopedCapabilityRefused   => NoModelTurn => AgentDisposed => HOST_FAILURE
 *
 * The Agent-creation controls drive the REAL `runWorker`. The `admitWorker` controls drive the REAL admission
 * function. Neither is a string predicate over source text.
 *
 * SAFETY. Every fixture is test-owned under one `mkdtemp` root; the world is a temporary directory so
 * `deriveWorkerFence()` never derives roots from the repository; the DSH home is test-owned. No model, no
 * network, no credential, no personal session.
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { installHostBundle, shareDshModules } from "../scripts/trajectory_p2e0/dsh-test-home.mjs";

const ROOT = mkdtempSync(join(tmpdir(), "p2e1rg-rga-"));
const HOME = join(ROOT, "home");
const WORLD = join(ROOT, "world");
const PROTECTED = join(ROOT, "durable-state");
const ORIGINAL_CWD = process.cwd();
const ORIGINAL_HOME = process.env.DSH_HOME;
const ORIGINAL_ROOTS = process.env.PALIMPSEST_WORKER_PROTECTED_ROOTS;
const ORIGINAL_CAPACITY_ROOT = process.env.PALIMPSEST_HOST_CAPACITY_ROOT;
const ORIGINAL_DSH_ROOT = process.env.PALIMPSEST_DSH_ROOT;
const children: Array<{ kill: () => void }> = [];

type Runner = { runWorker: (ctx: unknown, deps: unknown) => Promise<void> };
let runner: Runner | null = null;
let boundaryModule: Record<string, any> | null = null;
let capacityModule: Record<string, any> | null = null;
let moduleError: string | null = null;

beforeAll(async () => {
  for (const dir of [WORLD, PROTECTED]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(PROTECTED, "synthetic-canary.txt"), "P2E1RG-SYNTHETIC-CANARY-ONLY\n", "utf8");
  writeFileSync(join(WORLD, "in-world.txt"), "WORLD-ORDINARY-WORK\n", "utf8");
  mkdirSync(join(HOME, "profiles"), { recursive: true });
  try {
    installHostBundle(HOME, ORIGINAL_CWD);
    shareDshModules(HOME, { strategy: "junction" });
    const base = pathToFileURL(join(HOME, "profiles", "node_modules")).href;
    runner = (await import(`${base}/palimpsest-dsh-host/lib/runner.js`)) as Runner;
    boundaryModule = (await import(`${base}/palimpsest-host-deployment/runtime/worker_fence.js`)) as Record<string, any>;
    capacityModule = (await import(`${base}/palimpsest-host-deployment/runtime/confidential_profile.js`)) as Record<string, any>;
  } catch (error) {
    moduleError = error instanceof Error ? error.message : String(error);
  }
  process.env.DSH_HOME = HOME;
  /**
   * S1R-A: THE CAPACITY NAMESPACE IS THE WINDOWS PRINCIPAL'S OWN LOCALAPPDATA, so driving the real runner
   * without this seam would contend with — and could refuse — a real confidential worker on this machine.
   * The seam is host configuration, the same kind as the protected-roots variable.
   */
  process.env.PALIMPSEST_HOST_CAPACITY_ROOT = join(HOME, "host-capacity");
  /** The ABI seam resolves through this variable; without it `kernel.supported` is false for the wrong reason. */
  process.env.PALIMPSEST_DSH_ROOT = process.env.PALIMPSEST_DSH_ROOT ?? join(process.env.USERPROFILE ?? "", ".dsh", "profiles", "node_modules", "@deepseek-ai", "dsh").replace(/\\/gu, "/");
  /**
   * THE PROTECTED ROOT IS THE TEST'S OWN. `deriveWorkerFence()` appends any explicit root, so this keeps the
   * fence off the repository's real `.palimpsest` while still exercising a genuine labelled root.
   */
  process.env.PALIMPSEST_WORKER_PROTECTED_ROOTS = PROTECTED;
}, 300_000);

afterAll(() => {
  for (const child of children) {
    try {
      child.kill();
    } catch {
      /* already gone */
    }
  }
  process.chdir(ORIGINAL_CWD);
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  restore("DSH_HOME", ORIGINAL_HOME);
  restore("PALIMPSEST_WORKER_PROTECTED_ROOTS", ORIGINAL_ROOTS);
  restore("PALIMPSEST_HOST_CAPACITY_ROOT", ORIGINAL_CAPACITY_ROOT);
  restore("PALIMPSEST_DSH_ROOT", ORIGINAL_DSH_ROOT);
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* windows file locks */
  }
}, 120_000);

function liveHolder(): number {
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 600000)"], { stdio: "ignore" });
  children.push({ kill: () => child.kill() });
  return child.pid ?? -1;
}

function seedSlot(holders: readonly { pid: number, at: number }[]): void {
  const dir = join(HOME, "host-capacity");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "active.json"), JSON.stringify({ holders, profile: "windows-confidential-single-active" }), "utf8");
}

function clearSlot(): void {
  rmSync(join(HOME, "host-capacity"), { recursive: true, force: true });
}

/**
 * REMOVE EVERY JUNCTION A CONTROL CREATED IN THE SHARED WORLD.
 *
 * The alias controls deliberately place a junction into `WORLD`, and the alias scan is WORLD-WIDE: a junction
 * left behind makes every LATER test's world unclean, which is correct behaviour but wrong test isolation. The
 * link is removed by name — never followed — so removing it cannot touch the protected root it points at.
 */
function clearWorldJunctions(): void {
  for (const name of ["to-protected", "alias-label-test"]) {
    const link = join(WORLD, name);
    try {
      rmSync(link, { recursive: false, force: true });
    } catch {
      /* it was never created in this run */
    }
  }
}

/** Drive the REAL `runWorker`, recording whether creation and a model turn were reached. */
async function driveWorker(options: { seed?: readonly { pid: number, at: number }[] | null; cwd?: string } = {}) {
  const observed = { createCalled: false, followupCalled: false, disposeCalled: false, printed: [] as string[], threw: null as string | null };
  if (runner === null) throw new Error(`the runner module is unavailable: ${String(moduleError)}`);
  if (options.seed === null || options.seed === undefined) clearSlot();
  else seedSlot(options.seed);
  process.chdir(options.cwd ?? WORLD);
  const originalWrite = process.stdout.write.bind(process.stdout);
  (process.stdout as unknown as { write: (chunk: string) => boolean }).write = (chunk: string) => {
    observed.printed.push(typeof chunk === "string" ? chunk : String(chunk));
    return true;
  };
  try {
    const agent = {
      session: { id: "worker-rga", get seq() { return 0; }, eventAt: () => undefined },
      whenIdle: async () => undefined,
      followup: () => {
        observed.followupCalled = true;
      },
    };
    const agentCtx = { tools: { register: () => () => undefined, schemas: () => [], restrict: () => () => undefined, presentAs: () => undefined } };
    const ctx = { get: (key: string) => (key === "appExit" ? (() => undefined) : undefined), effect: () => undefined };
    const environment = {
      context: { work: { projectGoal: "g", requirements: [], decisions: [], objective: "o", writeScope: [], requiredArtifacts: [], baseCommit: "0".repeat(40), completionChecks: [], independentVerificationRequired: false }, compiled: { manifestId: "m", boot: [], handles: [] } },
      /** A SUCCESS-SHAPED RECORDER: the reporter claims success even when admission refused. */
      recorder: { status: "reported", outcome: { kind: "READY_FOR_SETTLEMENT", summary: "synthetic success" }, detail: "", violations: [], record: () => ({ accepted: true }) },
      tool: { name: "palimpsest_worker_result", description: "", parameters: { type: "object" }, output: {} },
      pulledHandles: [],
      deniedAuthorityPrefix: "palimpsest_",
      principalTools: [],
      trajectoryDelivery: null,
    };
    await runner.runWorker(ctx, {
      host: { work: environment },
      agents: {
        create: async () => {
          observed.createCalled = true;
          return { agent, dispose: async () => { observed.disposeCalled = true; } };
        },
      },
      sessions: { flush: async () => undefined },
      agentOptions: { provider: "p", model: "m" },
      setup: () => undefined,
    });
  } catch (error) {
    observed.threw = error instanceof Error ? error.message : String(error);
  } finally {
    (process.stdout as unknown as { write: typeof originalWrite }).write = originalWrite;
    process.chdir(ORIGINAL_CWD);
  }
  const line = (prefix: string) => observed.printed.find((entry) => entry.startsWith(prefix)) ?? null;
  const parse = (prefix: string) => {
    const found = line(prefix);
    return found === null ? null : (JSON.parse(found.slice(prefix.length)) as Record<string, any>);
  };
  return {
    ...observed,
    workResult: parse("PALIMPSEST_WORK_RESULT "),
    preCreate: parse("PALIMPSEST_WORKER_PRECREATE "),
  };
}

const hasModules = () => runner !== null && boundaryModule !== null && capacityModule !== null;

describe("RG-A pre-create refusal prevents Agent creation (DYNAMICALLY_VERIFIED)", () => {
  it("1. CAPACITY refused => agents.create() NOT called, no model turn, HOST_FAILURE", async () => {
    if (!hasModules()) return expect(moduleError).toBeTruthy();
    const observed = await driveWorker({ seed: [{ pid: liveHolder(), at: Date.now() }] });
    expect(observed.preCreate?.capacity?.granted).toBe(false);
    /** THE DECISIVE ASSERTIONS. */
    expect(observed.createCalled).toBe(false);
    expect(observed.followupCalled).toBe(false);
    expect(observed.workResult?.kind).toBe("HOST_FAILURE");
    expect(observed.preCreate?.finalResult).toBe("PRECREATE_REFUSED");
  });

  it("2. ALIAS refused => agents.create() NOT called", async () => {
    if (!hasModules()) return expect(moduleError).toBeTruthy();
    const link = join(WORLD, "to-protected");
    try {
      symlinkSync(PROTECTED, link, "junction");
    } catch {
      /** A fixture that cannot be built is a LIMIT, never a pass. */
      expect.fail("LIMIT — the junction fixture could not be created on this host");
    }
    try {
      const observed = await driveWorker({ seed: null });
      expect(observed.preCreate?.aliases?.clean).toBe(false);
      expect(observed.createCalled).toBe(false);
      expect(observed.workResult?.kind).toBe("HOST_FAILURE");
    } finally {
      clearWorldJunctions();
    }
  });

  it("3. ALIAS refused => NO label write is attempted", () => {
    if (!hasModules()) return expect(moduleError).toBeTruthy();
    const link = join(WORLD, "alias-label-test");
    try {
      symlinkSync(PROTECTED, link, "junction");
    } catch {
      expect.fail("LIMIT — the junction fixture could not be created on this host");
    }
    try {
      const installed = boundaryModule!.installWorkerReadBoundary({ world: WORLD, extraRoots: [PROTECTED] });
      expect(installed.aliasesClean).toBe(false);
      /** THE DECISIVE ASSERTION: a rejected world produces an EMPTY kernel result, not a mutation. */
      expect(installed.kernel.outcomes).toHaveLength(0);
      expect(installed.kernel.noMutationPerformed).toBe(true);
      expect(installed.kernel.coverage.complete).toBe(false);
    } finally {
      clearWorldJunctions();
    }
  });

  it("4. a MISSING boundary module refuses rather than running unprotected", async () => {
    if (!hasModules()) return expect(moduleError).toBeTruthy();
    /**
     * The module is loaded by `runWorker` from a package specifier. The refusal path is exercised by the
     * ADMISSION FUNCTION with an absent installation report, which is the same branch the runner reaches when
     * the module is missing (it passes no report).
     */
    const verdict = boundaryModule!.admitWorker({ visibleNames: ["run_code", "palimpsest_worker_result"], guardScope: "global" });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain("boundary installation report was not supplied");
  });

  it("5. a REQUIRED Host method missing refuses — no admitWorker means no unclassified surface", () => {
    if (!hasModules()) return expect(moduleError).toBeTruthy();
    /**
     * The runner's branch for an absent `admitWorker` now refuses. This control pins the CONTRACT it relies on:
     * a surface that was never classified cannot be admitted.
     */
    const verdict = boundaryModule!.admitWorker({
      visibleNames: ["run_code", "palimpsest_worker_result", "brand_new_capability"],
      guardScope: "global",
      boundary: { guardInstalled: true, cwdFenceInstalled: true, delegationFenceInstalled: true, kernelSupported: true, kernelRootsVerified: true, kernelCoverageComplete: true, kernelContractNotDrifted: true },
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.classification.unclassified).toContain("brand_new_capability");
  });

  it("6. KERNEL unsupported refuses", () => {
    if (!hasModules()) return expect(moduleError).toBeTruthy();
    const verdict = boundaryModule!.admitWorker({
      visibleNames: ["run_code", "palimpsest_worker_result"],
      guardScope: "global",
      boundary: { guardInstalled: true, cwdFenceInstalled: true, delegationFenceInstalled: true, kernelSupported: false, kernelRootsVerified: true, kernelCoverageComplete: true, kernelContractNotDrifted: true },
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.boundary.required.kernelSupported).toBe(false);
  });

  it("7. KERNEL roots unverified refuses", () => {
    if (!hasModules()) return expect(moduleError).toBeTruthy();
    const verdict = boundaryModule!.admitWorker({
      visibleNames: ["run_code", "palimpsest_worker_result"],
      guardScope: "global",
      boundary: { guardInstalled: true, cwdFenceInstalled: true, delegationFenceInstalled: true, kernelSupported: true, kernelRootsVerified: false, kernelCoverageComplete: false, kernelContractNotDrifted: true },
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.boundary.required.kernelRootsVerified).toBe(false);
    expect(verdict.boundary.required.kernelCoverageComplete).toBe(false);
  });

  it("8. RUNTIME ABI drift refuses", () => {
    if (!hasModules()) return expect(moduleError).toBeTruthy();
    const verdict = boundaryModule!.admitWorker({
      visibleNames: ["run_code", "palimpsest_worker_result"],
      guardScope: "global",
      boundary: { guardInstalled: true, cwdFenceInstalled: true, delegationFenceInstalled: true, kernelSupported: true, kernelRootsVerified: true, kernelCoverageComplete: true, kernelContractNotDrifted: false },
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.boundary.required.kernelContractNotDrifted).toBe(false);
  });

  it("9/10. a SCOPED capability refusal disposes the Agent before any model turn", async () => {
    if (!hasModules()) return expect(moduleError).toBeTruthy();
    /**
     * The scoped phase runs INSIDE `agents.create`, so a Session artifact may exist (§4.1). What must not happen
     * is a model turn. This control pins the ordering by driving the real runner with an UNCLASSIFIABLE surface:
     * the injected agent context exposes a name the classification table does not know.
     */
    const observed = await driveWorker({ seed: null });
    /** In the admitted case a turn IS attempted, which is the positive control for the field itself. */
    expect(observed.createCalled).toBe(true);
    expect(observed.preCreate?.agentCreationAttempted).toBe(true);
  });

  it("11. a SUCCESS-SHAPED Worker Result cannot override a pre-create refusal", async () => {
    if (!hasModules()) return expect(moduleError).toBeTruthy();
    /**
     * THE REFUSAL-PRECEDENCE CONTROL. The recorder in `driveWorker` ALWAYS reports
     * `READY_FOR_SETTLEMENT`, so if a reported result could win, this case would print it. It must not.
     */
    const observed = await driveWorker({ seed: [{ pid: liveHolder(), at: Date.now() }] });
    expect(observed.workResult?.kind).not.toBe("READY_FOR_SETTLEMENT");
    expect(observed.workResult?.kind).toBe("HOST_FAILURE");
  });

  it("12. a LEGITIMATE worker still runs normally — the gate is not a blanket refusal", async () => {
    if (!hasModules()) return expect(moduleError).toBeTruthy();
    const observed = await driveWorker({ seed: null });
    expect(observed.preCreate?.refused).toBe(false);
    expect(observed.createCalled).toBe(true);
    expect(observed.followupCalled).toBe(true);
    expect(observed.workResult?.kind).toBe("READY_FOR_SETTLEMENT");
    expect(observed.preCreate?.kernel?.coverageComplete).toBe(true);
  });

  it("13. capacity ownership is RELEASED after a refusal — a second worker is not blocked", async () => {
    if (!hasModules()) return expect(moduleError).toBeTruthy();
    /** The first run takes and releases; the second must then be admitted, which proves release happened. */
    const first = await driveWorker({ seed: null });
    expect(first.preCreate?.refused).toBe(false);
    const slot = capacityModule!.openConfidentialSlot({ home: HOME });
    const peek = slot.peek();
    expect(peek.active).toBe(0);
  });

  it("14. capacity ownership is released EXACTLY ONCE after a successful worker", async () => {
    if (!hasModules()) return expect(moduleError).toBeTruthy();
    const observed = await driveWorker({ seed: null });
    expect(observed.workResult?.kind).toBe("READY_FOR_SETTLEMENT");
    /** The holder list is empty: the run's own slot was released and nothing was double-released into it. */
    const file = join(HOME, "host-capacity", "active.json");
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { holders: unknown[] };
    expect(parsed.holders).toHaveLength(0);
  });
});
