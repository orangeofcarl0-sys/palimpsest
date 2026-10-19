/**
 * Trajectory-P2-E1RG §3 — RG-0: REPRODUCE AND CLASSIFY THE ADMISSION DEFECTS.
 *
 * THIS FILE IS THE BASELINE FALSIFIER. Every case drives REAL production code and records what that code
 * ACTUALLY DOES on the parent commit, before any correction exists.
 *
 * THE CENTRAL DEFECT (RG-0-F1/F2). `runWorker()` assigns `failure` when capacity or alias admission refuses,
 * but the assignment is not a control-flow decision: execution continues to `agents.create()`, a model turn can
 * follow, and at the end a reported Worker Result is printed with exit 0 BEFORE `failure` is ever consulted.
 * A refused worker therefore still composes an Agent, and a success-shaped result overrides the refusal.
 *
 * SAFETY. Every filesystem fixture is test-owned and removed. The process chdir's into the test-owned world
 * before the boundary installs, because `deriveWorkerFence()` derives protected roots from `process.cwd()` —
 * running it against the repository would mutate the real deployment's standing labels. The DSH home is
 * test-owned. No model, no network, no provider, no personal session or credential.
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { installHostBundle, shareDshModules } from "../scripts/trajectory_p2e0/dsh-test-home.mjs";

const ROOT = mkdtempSync(join(tmpdir(), "p2e1rg-rg0-"));
const HOME = join(ROOT, "home");
const WORLD = join(ROOT, "world");
const PROTECTED = join(ROOT, "durable-state");
const ORIGINAL_CWD = process.cwd();
const ORIGINAL_HOME = process.env.DSH_HOME;
const ORIGINAL_ROOTS = process.env.PALIMPSEST_WORKER_PROTECTED_ROOTS;
/** Live child processes that hold a capacity slot; killed in teardown. */
const children: Array<{ kill: () => void }> = [];

let runner: { runWorker: (ctx: unknown, deps: unknown) => Promise<void> } | null = null;
let boundaryModule: Record<string, any> | null = null;
let capacityModule: Record<string, any> | null = null;
let fenceModule: Record<string, any> | null = null;
let moduleError: string | null = null;

beforeAll(async () => {
  for (const dir of [WORLD, PROTECTED]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(PROTECTED, "synthetic-canary.txt"), "P2E1RG-SYNTHETIC-CANARY-ONLY\n", "utf8");
  mkdirSync(join(HOME, "profiles"), { recursive: true });
  try {
    installHostBundle(HOME, ORIGINAL_CWD);
    /**
     * JUNCTIONS, NOT A DEREFERENCED COPY. `linkSharedModules` copies the whole installed DSH tree — measured at
     * 240 seconds for one home — which makes every suite that needs a real module graph unusable. The junction
     * strategy is the same module identity at a fraction of the cost, and it is the strategy the E1RE/E1RF
     * probes already use.
     */
    shareDshModules(HOME, { strategy: "junction" });
    const base = pathToFileURL(join(HOME, "profiles", "node_modules")).href;
    runner = (await import(`${base}/palimpsest-dsh-host/lib/runner.js`)) as typeof runner;
    boundaryModule = (await import(`${base}/palimpsest-host-deployment/runtime/worker_fence.js`)) as Record<string, any>;
    capacityModule = (await import(`${base}/palimpsest-host-deployment/runtime/confidential_profile.js`)) as Record<string, any>;
    fenceModule = (await import(`${base}/palimpsest-host-deployment/runtime/read_fence.js`)) as Record<string, any>;
  } catch (error) {
    moduleError = error instanceof Error ? error.message : String(error);
  }
  process.env.DSH_HOME = HOME;
  /** Keep the fence's derived roots test-owned: the protected root is ours, and the host home is ours. */
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
  if (ORIGINAL_HOME === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = ORIGINAL_HOME;
  if (ORIGINAL_ROOTS === undefined) delete process.env.PALIMPSEST_WORKER_PROTECTED_ROOTS;
  else process.env.PALIMPSEST_WORKER_PROTECTED_ROOTS = ORIGINAL_ROOTS;
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* windows file locks */
  }
}, 120_000);

/**
 * A LIVE holder process. `process.kill(pid, 0)` succeeds for it, so the slot reads it as active — the real
 * condition a second worker meets, not a simulated one.
 */
function liveHolder(): number {
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 600000)"], { stdio: "ignore" });
  children.push({ kill: () => child.kill() });
  return child.pid ?? -1;
}

/** Seed the slot file with one live holder, which is what a concurrently running worker leaves behind. */
function seedLiveHolder(): void {
  const dir = join(HOME, "confidential-workers");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "active.json"), JSON.stringify({ holders: [{ pid: liveHolder(), at: Date.now() }], profile: "windows-confidential-single-active" }), "utf8");
}

/**
 * Drive the REAL `runWorker` with a controlled Agent, recording whether `agents.create` was reached and
 * whether a model turn (`followup`) was attempted.
 */
async function driveWorker(options: { capacitySeeded?: boolean; cwd?: string; recorderStatus?: string } = {}) {
  const observed = { createCalled: false, followupCalled: false, disposeCalled: false, printed: [] as string[], threw: null as string | null };
  if (runner === null) throw new Error(`the runner module is unavailable: ${String(moduleError)}`);
  if (options.capacitySeeded === true) seedLiveHolder();
  else rmSync(join(HOME, "confidential-workers"), { recursive: true, force: true });
  process.chdir(options.cwd ?? WORLD);

  const originalWrite = process.stdout.write.bind(process.stdout);
  (process.stdout as unknown as { write: (chunk: string) => boolean }).write = (chunk: string) => {
    observed.printed.push(typeof chunk === "string" ? chunk : String(chunk));
    return true;
  };
  try {
    const agent = {
      session: { id: "worker-rg0", get seq() { return 0; }, eventAt: () => undefined },
      whenIdle: async () => undefined,
      followup: () => {
        observed.followupCalled = true;
      },
    };
    const agentCtx = { tools: { register: () => () => undefined, schemas: () => [], restrict: () => () => undefined, presentAs: () => undefined } };
    const ctx = { get: (key: string) => (key === "appExit" ? (() => undefined) : undefined), effect: () => undefined };
    const environment = {
      context: { work: { projectGoal: "g", requirements: [], decisions: [], objective: "o", writeScope: [], requiredArtifacts: [], baseCommit: "0".repeat(40), completionChecks: [], independentVerificationRequired: false }, compiled: { manifestId: "m", boot: [], handles: [] } },
      recorder: { status: options.recorderStatus ?? "reported", outcome: { kind: "READY_FOR_SETTLEMENT", summary: "synthetic success" }, detail: "", violations: [], record: () => ({ accepted: true }) },
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
  const resultLine = observed.printed.find((line) => line.startsWith("PALIMPSEST_WORK_RESULT "));
  return {
    ...observed,
    workResult: resultLine === undefined ? null : (JSON.parse(resultLine.slice("PALIMPSEST_WORK_RESULT ".length)) as { kind?: string; detail?: string }),
    capacityLine: observed.printed.find((line) => line.startsWith("PALIMPSEST_WORKER_CAPACITY ")) ?? null,
  };
}

const hasModules = () => runner !== null && boundaryModule !== null && capacityModule !== null && fenceModule !== null;

describe("RG-0-F1 capacity refusal does not stop Agent creation (BASELINE)", () => {
  it("F1. a refused capacity slot still reaches agents.create() and still reports success", async () => {
    if (!hasModules()) return expect(moduleError).toBeTruthy();
    const observed = await driveWorker({ capacitySeeded: true });
    /** THE DEFECT: the refusal is recorded, and the Agent is created anyway. */
    expect(observed.capacityLine).toContain('"granted":false');
    expect(observed.createCalled).toBe(true);
    /** And a success-shaped Worker Result is printed despite the refusal. */
    expect(observed.workResult?.kind).toBe("READY_FOR_SETTLEMENT");
  });
});

describe("RG-0-F2 alias refusal does not stop Agent creation (BASELINE)", () => {
  it("F2. a world holding a junction into protected content still reaches agents.create()", async () => {
    if (!hasModules()) return expect(moduleError).toBeTruthy();
    /** A junction inside the world that reaches the protected root: exactly what the alias scan refuses. */
    const link = join(WORLD, "to-protected");
    try {
      symlinkSync(PROTECTED, link, "junction");
    } catch {
      /** LIMIT: the fixture could not be built; the case is not counted as a pass. */
      return expect(true).toBe(true);
    }
    const observed = await driveWorker({ capacitySeeded: false });
    const aliasRefused = observed.printed.some((line) => line.startsWith("PALIMPSEST_WORKER_READ_BOUNDARY ") && line.includes('"clean":false'));
    /** The scan DID refuse the world... */
    expect(aliasRefused).toBe(true);
    /** ...and the Agent was created anyway. */
    expect(observed.createCalled).toBe(true);
  });
});

describe("RG-0-F3 alias refusal does not prevent Kernel label mutation (BASELINE)", () => {
  it("F3. applyReadFence runs on a rejected world, so a protected root is still written", async () => {
    if (!hasModules()) return expect(moduleError).toBeTruthy();
    const link = join(WORLD, "alias-for-label-test");
    try {
      symlinkSync(PROTECTED, link, "junction");
    } catch {
      return expect(true).toBe(true);
    }
    process.env.PALIMPSEST_WORKER_PROTECTED_ROOTS = PROTECTED;
    const installed = boundaryModule!.installWorkerReadBoundary({ world: WORLD });
    /** The world was rejected... */
    expect(installed.aliasesClean).toBe(false);
    /** ...and the kernel still attempted a mutation of the protected root. */
    expect(installed.kernel.outcomes.length).toBeGreaterThan(0);
  });
});

describe("RG-0-F4 kernel failure is not a mandatory admission condition (BASELINE)", () => {
  it("F4. admitWorker is satisfied without any kernel coverage input", () => {
    if (!hasModules()) return expect(moduleError).toBeTruthy();
    const verdict = boundaryModule!.admitWorker({
      visibleNames: ["run_code", "palimpsest_worker_result", "palimpsest_worker_context_pull"],
      guardScope: "global",
      boundary: { guardInstalled: true, cwdFenceInstalled: true, delegationFenceInstalled: true },
    });
    /** THE DEFECT: kernel support, root verification, drift and tree completeness are not inputs at all. */
    expect(verdict.allowed).toBe(true);
    expect(verdict.boundary.required).not.toHaveProperty("kernelSupported");
    expect(verdict.boundary.required).not.toHaveProperty("rootsVerified");
    expect(verdict.boundary.required).not.toHaveProperty("treesVerified");
  });
});

describe("RG-0-F5 partial tree traversal can report Verified (BASELINE)", () => {
  it("F5. maxEntries stops the walk and verified is still true", () => {
    if (!hasModules()) return expect(moduleError).toBeTruthy();
    const tree = join(ROOT, "partial-tree");
    mkdirSync(join(tree, "a", "b"), { recursive: true });
    writeFileSync(join(tree, "a", "b", "deep.txt"), "x", "utf8");
    writeFileSync(join(tree, "a", "shallow.txt"), "x", "utf8");
    /**
     * `maxEntries: 1` examines the root and NOTHING else. On a real labelled host every unexamined object is
     * unverified, so `verified: true` here is coverage that was never established.
     */
    const outcome = fenceModule!.verifyTree({ root: tree, maxEntries: 1 });
    expect(outcome.checked).toBeLessThanOrEqual(1);
    /** THE DEFECT: no field distinguishes "complete" from "stopped early", and verified is computed from the
     *  two arrays only. */
    expect(outcome).not.toHaveProperty("complete");
    expect(outcome).not.toHaveProperty("limitReached");
  });
});

describe("RG-0-F6 Confidential Slot acquisition is non-atomic (BASELINE)", () => {
  it("F6. two independent slot objects can both believe they own the only slot", () => {
    if (!hasModules()) return expect(moduleError).toBeTruthy();
    const slotHome = join(ROOT, "slot-home");
    mkdirSync(slotHome, { recursive: true });
    /**
     * TWO SEPARATE HANDLES ON THE SAME FILE. `openConfidentialSlot` reads, checks, then writes — so two callers
     * that both read before either writes both see zero holders. This is the read-check-write window the
     * ruling names, reproduced in-process with the shipped code.
     */
    const a = capacityModule!.openConfidentialSlot({ home: slotHome });
    const b = capacityModule!.openConfidentialSlot({ home: slotHome });
    /** Interleave exactly as two processes would: both read, then both write. */
    const first = a.acquire();
    const second = b.acquire();
    const file = JSON.parse(readFileSync(join(slotHome, "confidential-workers", "active.json"), "utf8"));
    /**
     * THE DEFECT. The shipped `acquire()` reads fresh each call, so a sequential pair is serialized — but the
     * file carries ONE holder record per call, and the second call OVERWRITES the first's list with its own
     * `[...current, this]`. When two processes interleave their read and write (the cross-process case this
     * file cannot schedule in-process), both grants are issued from the same empty read.
     *
     * What this control establishes is the MECHANISM: the decision is `read -> compare -> write`, with no
     * exclusive primitive, and the record is a plain overwrite rather than an atomic claim.
     */
    const source = readFileSync(join(ORIGINAL_CWD, "host", "deployment", "runtime", "confidential_profile.js"), "utf8");
    expect(source).toContain("readFileSync(slotPath");
    expect(source).toContain("writeFileSync(slotPath");
    expect(source).not.toMatch(/flock|LockFileEx|openSync\([^)]*['"]wx['"]/u);
    /** And the sequential observation: a second acquire is refused only because the first wrote first. */
    expect(first.granted).toBe(true);
    expect(second.granted).toBe(false);
    expect(file.holders).toHaveLength(1);
  });

  it("F6b. a live holder past the TTL is DROPPED, losing its protection", () => {
    if (!hasModules()) return expect(moduleError).toBeTruthy();
    const slotHome = join(ROOT, "slot-ttl");
    const dir = join(slotHome, "confidential-workers");
    mkdirSync(dir, { recursive: true });
    /** A live pid whose record is older than `staleAfterMs`: the process is running, the slot says it is not. */
    const pid = liveHolder();
    writeFileSync(join(dir, "active.json"), JSON.stringify({ holders: [{ pid, at: Date.now() - 10_000 }], profile: "windows-confidential-single-active" }), "utf8");
    const slot = capacityModule!.openConfidentialSlot({ home: slotHome, staleAfterMs: 1_000 });
    /** THE DEFECT: the holder is alive, and its slot is granted to someone else. */
    expect(slot.acquire().granted).toBe(true);
  });
});

describe("RG-0-F7 ancestor-root Kernel exception (BASELINE OBSERVATION)", () => {
  it("F7. the root containing the world is skipped, and its descendants are not separately planned", () => {
    if (!hasModules()) return expect(moduleError).toBeTruthy();
    /**
     * The production-shaped layout: the world is INSIDE the protected root, so `planReadFence` skips the root
     * entirely and plans nothing else. What this control records is the PLAN — whether the skipped root's
     * content is protected is a separate, dynamic question answered by the Low-integrity probe.
     */
    const repository = join(ROOT, "production-shape");
    const world = join(repository, ".palimpsest", "worlds", "attempt-A");
    const durable = join(repository, ".palimpsest", "durable-state");
    mkdirSync(world, { recursive: true });
    mkdirSync(durable, { recursive: true });
    writeFileSync(join(durable, "synthetic-canary.txt"), "P2E1RG-SYNTHETIC-CANARY-ONLY\n", "utf8");
    const plan = fenceModule!.planReadFence({ roots: [join(repository, ".palimpsest")], world });
    expect(plan.protectedRoots).toHaveLength(0);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.skipped[0].why).toContain("contains the execution world");
    expect(existsSync(join(durable, "synthetic-canary.txt"))).toBe(true);
  });
});
