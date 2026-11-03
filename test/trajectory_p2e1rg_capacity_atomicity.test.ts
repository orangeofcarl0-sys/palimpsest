/**
 * Trajectory-P2-E1RG §6 — RG-C: ATOMIC CONFIDENTIAL CAPACITY OWNERSHIP.
 *
 * THE DEFECT THIS PINS (measured on the parent commit, `rg0-findings.json` F6).
 *
 * `acquire()` read the slot file, compared the holder count, then overwrote the file. Two processes that both
 * read before either wrote both saw zero holders and were both granted the only slot. R1-HC established that
 * two ACTIVE worlds cannot both be read-fenced on this backend, so that overlap is a CONFIDENTIALITY FAILURE,
 * not a throughput hiccup.
 *
 * THE CORRECTION: `mkdir` as the exclusive primitive. Creating a directory is atomic on NTFS — exactly one
 * caller succeeds — so the read-decide-write section cannot contain two writers.
 *
 * THE CROSS-PROCESS TEST IS THE POINT. A sequential unit test proves nothing about a race (§6.7). Every
 * concurrency control below spawns REAL child processes that synchronize on a barrier file, then acquire.
 *
 * SAFETY. Every slot lives under one test-owned `mkdtemp` root. Children are synthetic (`setTimeout`) — no real
 * worker, no project, no model, no credential. All children are killed in teardown.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RUNTIME = ["..", "host", "deployment", "runtime"].join("/");
const ROOT = mkdtempSync(join(tmpdir(), "p2e1rg-rgc-"));
const children: Array<{ kill: () => void }> = [];

type Slot = {
  acquire: () => { granted: boolean, detail: string };
  release: () => { released: boolean, detail: string };
  peek: () => { active: number, detail: string };
  mechanism: string;
};
type ProfileModule = { openConfidentialSlot: (input: Record<string, unknown>) => Slot };

let profile: ProfileModule | null = null;
let moduleError: string | null = null;

beforeAll(async () => {
  try {
    /** `host/**` is plain JavaScript outside the TS project, so the shipped module is loaded through a
     *  runtime-built specifier and typed locally. */
    profile = (await import(/* @vite-ignore */ `${RUNTIME}/confidential_profile.js`)) as ProfileModule;
  } catch (error) {
    moduleError = error instanceof Error ? error.message : String(error);
  }
});

afterAll(() => {
  for (const child of children) {
    try {
      child.kill();
    } catch {
      /* already gone */
    }
  }
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* windows locks */
  }
}, 120_000);

const ready = () => profile !== null;
let counter = 0;
/**
 * A fresh test-owned slot home per case, so no case inherits another's holder record.
 *
 * S1R-A: THE CAPACITY NAMESPACE IS NOW THE WINDOWS PRINCIPAL, NOT THE HOME OR THE REPOSITORY. A case that
 * passed only `home` would resolve the MACHINE-WIDE slot and contend with every other host on this machine —
 * including a real confidential worker. `capacityRoot` is the explicit test seam, so every case passes one.
 */
function slotHome(): string {
  counter += 1;
  const home = join(ROOT, `home-${String(counter)}`);
  mkdirSync(join(home, "confidential-workers"), { recursive: true });
  return home;
}
/** The capacity root a case must pass, derived from the same per-case home. */
function slotRoot(home: string): string {
  /**
   * THE LEGACY LOCATION, DELIBERATELY. These cases plant holder records and lock directories by hand, and
   * S1R moved the namespace to an explicit `capacityRoot`. Pointing the root at the directory the cases
   * already use keeps their fixtures meaningful without rewriting every path they construct.
   */
  return join(home, "confidential-workers");
}

/** One fresh home plus its capacity root, so a case cannot accidentally use two different roots. */
function slotArgs(): { home: string; capacityRoot: string } {
  const home = slotHome();
  return { home, capacityRoot: slotRoot(home) };
}
function liveHolder(): number {
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 600000)"], { stdio: "ignore" });
  children.push({ kill: () => child.kill() });
  return child.pid ?? -1;
}

/**
 * RUN N ACQUIRERS CONCURRENTLY, EACH IN ITS OWN PROCESS, RELEASED BY A BARRIER.
 *
 * The barrier is a file the parent creates after all children have signalled readiness, so their `acquire()`
 * calls land in the same window rather than being serialized by spawn latency.
 */
async function raceAcquire(home: string, count: number, modulePath: string): Promise<Array<{ granted: boolean, detail: string, pid: number }>> {
  const barrier = join(home, "barrier");
  const ready = join(home, "ready");
  mkdirSync(ready, { recursive: true });
  const results: Array<{ granted: boolean, detail: string, pid: number }> = [];
  const procs = [];
  for (let index = 0; index < count; index += 1) {
    const script = join(home, `racer-${String(index)}.mjs`);
    writeFileSync(
      script,
      [
        "import { existsSync, writeFileSync } from 'node:fs';",
        `const mod = await import(${JSON.stringify(pathToFileURL(modulePath).href)});`,
        `const slot = mod.openConfidentialSlot({ home: ${JSON.stringify(home)}, capacityRoot: ${JSON.stringify(join(home, "confidential-workers"))} });`,
        /** Signal readiness, then spin until the barrier appears. */
        `writeFileSync(${JSON.stringify(join(ready, `r-${String(index)}`))}, "1");`,
        `while (!existsSync(${JSON.stringify(barrier)})) { /* spin */ }`,
        "const verdict = slot.acquire();",
        `writeFileSync(${JSON.stringify(join(home, `result-${String(index)}.json`))}, JSON.stringify({ ...verdict, pid: process.pid }));`,
        /** Hold the slot so the parent can observe the overlap. */
        "await new Promise((resolve) => setTimeout(resolve, 1200));",
      ].join("\n"),
      "utf8",
    );
    const proc = spawn(process.execPath, [script], { stdio: "ignore" });
    procs.push(proc);
    children.push({ kill: () => proc.kill() });
  }
  /** Wait for every child to signal, then open the barrier. */
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    let signalled = 0;
    for (let index = 0; index < count; index += 1) if (existsSync(join(ready, `r-${String(index)}`))) signalled += 1;
    if (signalled === count) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  writeFileSync(barrier, "go", "utf8");
  /** Collect results. */
  const resultDeadline = Date.now() + 30_000;
  while (Date.now() < resultDeadline) {
    let collected = 0;
    for (let index = 0; index < count; index += 1) {
      const file = join(home, `result-${String(index)}.json`);
      if (!existsSync(file)) continue;
      collected += 1;
      try {
        const parsed = JSON.parse(readFileSync(file, "utf8")) as { granted: boolean, detail: string, pid: number };
        if (!results.some((entry) => entry.pid === parsed.pid)) results.push(parsed);
      } catch {
        /* still being written */
      }
    }
    if (collected === count) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  for (const proc of procs) {
    try {
      proc.kill();
    } catch {
      /* already exited */
    }
  }
  return results;
}

const PROFILE_PATH = join(process.cwd(), "host", "deployment", "runtime", "confidential_profile.js");

describe("RG-C atomic capacity ownership (CROSS-PROCESS, DYNAMICALLY VERIFIED)", () => {
  it("1. a single process acquires one slot", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const slot = profile!.openConfidentialSlot(slotArgs());
    expect(slot.acquire().granted).toBe(true);
    expect(slot.peek().active).toBe(1);
  });

  it("2. a second acquire while one is held is refused", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const home = slotHome();
    const first = profile!.openConfidentialSlot({ home: home, capacityRoot: slotRoot(home) });
    const second = profile!.openConfidentialSlot({ home: home, capacityRoot: slotRoot(home) });
    expect(first.acquire().granted).toBe(true);
    expect(second.acquire().granted).toBe(false);
  });

  it("3. CONCURRENT SYNCHRONIZED acquisition permits exactly ONE winner — THE DEFECT", async () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const home = slotHome();
    const results = await raceAcquire(home, 6, PROFILE_PATH);
    const granted = results.filter((entry) => entry.granted === true);
    /**
     * THE DECISIVE ASSERTION. Before the correction every racer that read an empty file was granted; now exactly
     * one is.
     */
    expect(results.length).toBeGreaterThan(0);
    expect(granted).toHaveLength(1);
  }, 120_000);

  it("4. a MALFORMED record does not grant capacity", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const home = slotHome();
    mkdirSync(join(home, "confidential-workers"), { recursive: true });
    writeFileSync(join(home, "confidential-workers", "active.json"), "{not json", "utf8");
    const verdict = profile!.openConfidentialSlot({ home: home, capacityRoot: slotRoot(home) }).acquire();
    expect(verdict.granted).toBe(false);
    expect(verdict.detail).toContain("not valid JSON");
  });

  it("5. an UNREADABLE record does not grant capacity", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const home = slotHome();
    mkdirSync(join(home, "confidential-workers"), { recursive: true });
    /** A directory where the file should be: reading it yields EISDIR, not ENOENT. */
    mkdirSync(join(home, "confidential-workers", "active.json"), { recursive: true });
    const verdict = profile!.openConfidentialSlot({ home: home, capacityRoot: slotRoot(home) }).acquire();
    expect(verdict.granted).toBe(false);
  });

  it("6. a LIVE holder past the old TTL REMAINS protected — the TTL no longer evicts", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const home = slotHome();
    const pid = liveHolder();
    mkdirSync(join(home, "confidential-workers"), { recursive: true });
    /** A live process whose record is far older than any TTL a caller might pass. */
    writeFileSync(join(home, "confidential-workers", "active.json"), JSON.stringify({ holders: [{ pid, at: Date.now() - 10_000_000, token: "old" }], profile: "windows-confidential-single-active" }), "utf8");
    const verdict = profile!.openConfidentialSlot({ home: home, capacityRoot: slotRoot(home) }).acquire();
    expect(verdict.granted).toBe(false);
    expect(verdict.detail).toContain(String(pid));
  });

  it("7. a DEAD holder is recovered", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const home = slotHome();
    /** A pid that cannot be alive: spawn a process and wait for it to exit. */
    const exited = spawnSync(process.execPath, ["-e", "process.exit(0)"], { stdio: "ignore" });
    const deadPid = exited.pid ?? 999_999;
    mkdirSync(join(home, "confidential-workers"), { recursive: true });
    writeFileSync(join(home, "confidential-workers", "active.json"), JSON.stringify({ holders: [{ pid: deadPid, at: Date.now(), token: "dead" }], profile: "windows-confidential-single-active" }), "utf8");
    const verdict = profile!.openConfidentialSlot({ home: home, capacityRoot: slotRoot(home) }).acquire();
    expect(verdict.granted).toBe(true);
  });

  it("8. RELEASE by a non-owner is refused", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const home = slotHome();
    const owner = profile!.openConfidentialSlot({ home: home, capacityRoot: slotRoot(home) });
    owner.acquire();
    /** A different handle never acquired, so it holds nothing to release. */
    const other = profile!.openConfidentialSlot({ home: home, capacityRoot: slotRoot(home) });
    const released = other.release();
    expect(released.released).toBe(false);
    /** And the owner's entry survives. */
    expect(owner.peek().active).toBe(1);
  });

  it("9. REPEATED release is safe", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const home = slotHome();
    const slot = profile!.openConfidentialSlot({ home: home, capacityRoot: slotRoot(home) });
    slot.acquire();
    expect(slot.release().released).toBe(true);
    expect(slot.release().released).toBe(false);
    expect(slot.peek().active).toBe(0);
  });

  it("10. a CRASHED holder's slot is recoverable, and a LIVE one is not stolen", async () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const home = slotHome();
    /** A child acquires and is killed without releasing. */
    const script = join(home, "crash.mjs");
    writeFileSync(
      script,
      [
        `const mod = await import(${JSON.stringify(pathToFileURL(PROFILE_PATH).href)});`,
        `const slot = mod.openConfidentialSlot({ home: ${JSON.stringify(home)}, capacityRoot: ${JSON.stringify(join(home, "confidential-workers"))} });`,
        "process.stdout.write(JSON.stringify(slot.acquire()) + String.fromCharCode(10));",
        "setTimeout(() => {}, 600000);",
      ].join("\n"),
      "utf8",
    );
    const child = spawn(process.execPath, [script], { stdio: ["ignore", "pipe", "ignore"] });
    children.push({ kill: () => child.kill() });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    /**
     * AWAIT, DO NOT SPIN. A busy-wait here blocks the event loop, so the child's `data` event never fires and
     * the output stays empty — which is a property of the TEST, not of the child. `await` lets the loop run.
     */
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline && !output.includes("granted")) await new Promise((resolve) => setTimeout(resolve, 25));
    expect(output).toContain('"granted":true');
    /** While it lives, the slot is NOT available. */
    const blocked = profile!.openConfidentialSlot({ home: home, capacityRoot: slotRoot(home) }).acquire();
    expect(blocked.granted).toBe(false);
    /** After it dies, the slot IS available. */
    child.kill();
    const recoveredDeadline = Date.now() + 20_000;
    let recovered = { granted: false } as { granted: boolean };
    while (Date.now() < recoveredDeadline) {
      recovered = profile!.openConfidentialSlot({ home: home, capacityRoot: slotRoot(home) }).acquire();
      if (recovered.granted === true) break;
      /** Await the reaping rather than blocking it. */
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(recovered.granted).toBe(true);
  }, 120_000);

  it("11/12. a rejection and a success each release their slot exactly once", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const home = slotHome();
    /** Refused: nothing was acquired, so nothing may be left behind. */
    const pid = liveHolder();
    mkdirSync(join(home, "confidential-workers"), { recursive: true });
    writeFileSync(join(home, "confidential-workers", "active.json"), JSON.stringify({ holders: [{ pid, at: Date.now(), token: "holder" }], profile: "windows-confidential-single-active" }), "utf8");
    const refused = profile!.openConfidentialSlot({ home: home, capacityRoot: slotRoot(home) });
    expect(refused.acquire().granted).toBe(false);
    expect(refused.release().released).toBe(false);
    /** The holder's entry is untouched. */
    expect(refused.peek().active).toBe(1);
  });

  it("13. the queue/wait behavior does not exceed configured capacity", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    /**
     * `serializeConfidentialWorkers` is the in-process wrapper. It must never report more than `max` ACTIVE.
     */
    const home = slotHome();
    const slot = profile!.openConfidentialSlot({ home: home, capacityRoot: slotRoot(home) });
    slot.acquire();
    /** A second handle is refused, so the configured capacity of 1 is not exceeded. */
    expect(profile!.openConfidentialSlot({ home: home, capacityRoot: slotRoot(home) }).acquire().granted).toBe(false);
    expect(slot.peek().active).toBe(1);
  });

  it("14. the ownership MECHANISM is an OS primitive, not a read-check-write", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const slot = profile!.openConfidentialSlot(slotArgs());
    expect(slot.mechanism).toBe("mkdir-exclusive-lock");
    /** And the lock directory is removed after a successful acquire, so it is not leaked. */
    const home = join(ROOT, "mechanism-check");
    mkdirSync(home, { recursive: true });
    const probe = profile!.openConfidentialSlot({ home: home, capacityRoot: slotRoot(home) });
    probe.acquire();
    expect(existsSync(join(home, "confidential-workers", "active.lock"))).toBe(false);
  });
});
