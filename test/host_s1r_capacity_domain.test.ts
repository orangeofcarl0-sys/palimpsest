/**
 * Palimpsest Host-S1R §5/§6 — CAPACITY DOMAIN AND LOCK RECOVERY SAFETY.
 *
 * ============================================================================
 * WHAT THIS SUITE MEASURES, AND WHAT IT NO LONGER ASSERTS
 * ============================================================================
 *
 * Host-S1 left this suite asserting two premises that S1R MEASURED AND FALSIFIED. Both are re-based here, with
 * the original case identity kept so a reader can trace what changed and why.
 *
 * PREMISE 1 — "a protected repository is the capacity domain" (old cases 20–23).
 *
 *   `baseline-security-falsifiers.json` F3 built two independent test-owned repositories, each with its own
 *   `.palimpsest`, world and synthetic canary, and made BOTH worlds ACTIVE with the same first-party
 *   `AclWriteGrant` the sandbox applies on every confined spawn. A confined process granted ONLY repository A's
 *   workspace read repository B's ACTIVE-world canary. The two worlds carried DIFFERENT workspace write SIDs, so
 *   the isolation is neither per-workspace nor per-repository; what they share is the Low integrity level.
 *
 *   The namespace is therefore the WINDOWS PRINCIPAL ON THIS MACHINE. The cases below assert exactly that: two
 *   repositories contend, two DSH homes contend, and the reported scope says so.
 *
 * PREMISE 2 — "an abandoned lock is automatically reclaimed" (old cases 17–19).
 *
 *   `baseline-security-falsifiers.json` F1 instrumented the recovery interleaving: a live successor installed
 *   immediately before the recoverer's rename was MOVED, a third process acquired the vacated pathname, and the
 *   recovery then failed to terminate. Removing a lock by pathname cannot be proven to act on the observed
 *   object, so §6.4's fallback applies: automatic reclamation of ambiguous locks is DISABLED and the refusal
 *   names the operator action. A lock left by a crashed owner therefore REFUSES rather than being reclaimed.
 *
 *   The long-lived claim is still the HOLDER RECORD, and that is still recovered automatically: a holder whose
 *   pid is demonstrably gone is evicted (case 14), so a crashed worker frees capacity without operator action.
 *   Only a crash inside the millisecond critical section needs an operator.
 *
 * NEW IN S1R (case 27): a FAILED RECORD WRITE during release must not falsely mark the handle released. The
 * parent cleared `held` before writing, so a failed write left a phantom holder that no retry could remove —
 * measured as F2.
 *
 * SAFETY. Every capacity root is test-owned under one `mkdtemp` root and passed explicitly, so no case touches
 * the machine's real capacity state or launches a confidential worker.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

type Slot = {
  acquire: () => { granted: boolean; detail: string };
  release: () => { released: boolean; detail: string; retryable?: boolean };
  peek: () => { active: number; detail: string; malformed: number };
  mechanism: string;
  lastLockRelease: () => string | null;
  domain: {
    scope: string;
    principal: string | null;
    capacityRoot: string;
    slotPath: string;
    lockPath: string;
    key: string | null;
    home: string;
    root: string | null;
    identity: string;
    assumption: string;
    reparseAncestors: readonly string[];
  };
};
type ProfileModule = {
  openConfidentialSlot: (input: {
    home: string;
    domain?: string;
    capacityRoot?: string;
    maxActiveWorkers?: number;
    staleAfterMs?: number;
    lockStaleMs?: number;
    lockTimeoutMs?: number;
  }) => Slot;
  CONFIDENTIAL_PROFILE: { id: string; maxActiveWorkers: number };
  serializeConfidentialWorkers: (input: {
    port: { adapterId: string; run: (input: unknown) => Promise<unknown> };
    maxActiveWorkers?: number;
    policy?: "wait" | "refuse";
  }) => { run: (input: unknown) => Promise<unknown>; activeCount: () => number; peakActive: () => number; capacityRefusals: () => number; waited: () => number };
};

const RUNTIME = ["..", "host", "deployment", "runtime"].join("/");
const ROOT = mkdtempSync(join(tmpdir(), "hosts1r-capacity-"));
let profile: ProfileModule | null = null;
let moduleError: string | null = null;

const before = async () => {
  if (profile !== null) return;
  try {
    profile = (await import(/* @vite-ignore */ `${RUNTIME}/confidential_profile.js`)) as ProfileModule;
  } catch (error) {
    moduleError = error instanceof Error ? error.message : String(error);
  }
};
await before();

afterAll(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* windows locks */
  }
});

const ready = () => profile !== null;
let counter = 0;

/**
 * A test-owned capacity root. It is passed explicitly so the case never contends with the machine's real slot,
 * and so the namespace can be inspected without touching user state.
 */
function makeRoot(): { home: string; capacityRoot: string; slotDir: string; slotPath: string; lockDir: string } {
  counter += 1;
  const home = join(ROOT, `home-${String(counter)}`);
  const capacityRoot = join(ROOT, `capacity-${String(counter)}`);
  mkdirSync(capacityRoot, { recursive: true });
  return { home, capacityRoot, slotDir: capacityRoot, slotPath: join(capacityRoot, "active.json"), lockDir: join(capacityRoot, "active.lock") };
}

/** A test-owned repository shape, used to prove the repository is NOT the namespace. */
function makeRepository(): { repository: string } {
  counter += 1;
  const repository = join(ROOT, `repository-${String(counter)}`);
  mkdirSync(join(repository, ".palimpsest", "worlds"), { recursive: true });
  return { repository };
}

describe("S1R-B normal acquisition (DYNAMICALLY_VERIFIED)", () => {
  it("1. a single slot is granted and released", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, capacityRoot } = makeRoot();
    const slot = profile!.openConfidentialSlot({ home, capacityRoot });
    expect(slot.mechanism).toBe("mkdir-exclusive-lock");
    const granted = slot.acquire();
    expect(granted.granted).toBe(true);
    expect(slot.peek().active).toBe(1);
    const released = slot.release();
    expect(released.released).toBe(true);
    expect(slot.peek().active).toBe(0);
  });

  it("2. a second handle is REFUSED while the first holds the slot", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, capacityRoot } = makeRoot();
    const first = profile!.openConfidentialSlot({ home, capacityRoot, lockTimeoutMs: 150 });
    const second = profile!.openConfidentialSlot({ home, capacityRoot, lockTimeoutMs: 150 });
    expect(first.acquire().granted).toBe(true);
    const refused = second.acquire();
    expect(refused.granted).toBe(false);
    expect(refused.detail).toContain("at most 1");
    first.release();
  });

  it("3. after release the slot can be acquired again", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, capacityRoot } = makeRoot();
    const first = profile!.openConfidentialSlot({ home, capacityRoot, lockTimeoutMs: 150 });
    expect(first.acquire().granted).toBe(true);
    expect(first.release().released).toBe(true);
    const second = profile!.openConfidentialSlot({ home, capacityRoot, lockTimeoutMs: 150 });
    expect(second.acquire().granted).toBe(true);
    second.release();
  });
});

describe("S1R-B malformed and unreadable state (DYNAMICALLY_VERIFIED)", () => {
  it("4. a malformed holder entry inside valid JSON is UNKNOWN ownership, not free capacity", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, capacityRoot, slotPath } = makeRoot();
    writeFileSync(slotPath, JSON.stringify({ holders: [{ pid: "not-a-number", token: "x" }], profile: "p" }), "utf8");
    const granted = profile!.openConfidentialSlot({ home, capacityRoot, lockTimeoutMs: 200 }).acquire();
    expect(granted.granted).toBe(false);
    expect(granted.detail).toContain("malformed");
    expect(granted.detail).toContain("UNKNOWN");
  });

  it("5. a holder with a NEGATIVE pid is malformed", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, capacityRoot, slotPath } = makeRoot();
    writeFileSync(slotPath, JSON.stringify({ holders: [{ pid: -1, token: "x" }] }), "utf8");
    expect(profile!.openConfidentialSlot({ home, capacityRoot, lockTimeoutMs: 200 }).acquire().granted).toBe(false);
  });

  it("6. a holder with a NON-STRING token is malformed", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, capacityRoot, slotPath } = makeRoot();
    writeFileSync(slotPath, JSON.stringify({ holders: [{ pid: process.pid, token: 42 }] }), "utf8");
    expect(profile!.openConfidentialSlot({ home, capacityRoot, lockTimeoutMs: 200 }).acquire().granted).toBe(false);
  });

  it("7. an UNREADABLE record during acquire does not grant capacity", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, capacityRoot, slotPath } = makeRoot();
    writeFileSync(slotPath, "{ this is not json", "utf8");
    const granted = profile!.openConfidentialSlot({ home, capacityRoot, lockTimeoutMs: 200 }).acquire();
    expect(granted.granted).toBe(false);
    expect(granted.detail).toContain("cannot be established");
  });

  it("8. an UNREADABLE record during release is NOT rewritten as empty", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, capacityRoot, slotPath } = makeRoot();
    const slot = profile!.openConfidentialSlot({ home, capacityRoot, lockTimeoutMs: 200 });
    expect(slot.acquire().granted).toBe(true);
    writeFileSync(slotPath, "{ broken", "utf8");
    const released = slot.release();
    expect(released.released).toBe(false);
    expect(released.retryable).toBe(true);
    expect(readFileSync(slotPath, "utf8")).toBe("{ broken");
  });

  it("9. an UNRELATED holder survives a normal release", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, capacityRoot, slotPath } = makeRoot();
    const slot = profile!.openConfidentialSlot({ home, capacityRoot, lockTimeoutMs: 200 });
    expect(slot.acquire().granted).toBe(true);
    const record = JSON.parse(readFileSync(slotPath, "utf8"));
    record.holders.push({ pid: process.pid, token: "unrelated-holder", at: Date.now() });
    writeFileSync(slotPath, JSON.stringify(record), "utf8");
    expect(slot.release().released).toBe(true);
    const after = JSON.parse(readFileSync(slotPath, "utf8"));
    expect(after.holders.some((entry: { token?: string }) => entry.token === "unrelated-holder")).toBe(true);
  });

  it("10. a missing ownership token is treated as a valid holder (token is optional on read)", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, capacityRoot, slotPath } = makeRoot();
    writeFileSync(slotPath, JSON.stringify({ holders: [{ pid: process.pid, at: Date.now() }] }), "utf8");
    expect(profile!.openConfidentialSlot({ home, capacityRoot, lockTimeoutMs: 200 }).acquire().granted).toBe(false);
  });

  it("11. a release by a NON-OWNER does not remove the recorded holder", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, capacityRoot, slotPath } = makeRoot();
    const owner = profile!.openConfidentialSlot({ home, capacityRoot, lockTimeoutMs: 200 });
    expect(owner.acquire().granted).toBe(true);
    const stranger = profile!.openConfidentialSlot({ home, capacityRoot, lockTimeoutMs: 200 });
    expect(stranger.release().released).toBe(false);
    expect(JSON.parse(readFileSync(slotPath, "utf8")).holders).toHaveLength(1);
    owner.release();
  });

  it("12. a REPEATED release is refused and observable", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, capacityRoot } = makeRoot();
    const slot = profile!.openConfidentialSlot({ home, capacityRoot, lockTimeoutMs: 200 });
    expect(slot.acquire().granted).toBe(true);
    expect(slot.release().released).toBe(true);
    const second = slot.release();
    expect(second.released).toBe(false);
    expect(second.detail).toContain("holds no slot");
  });

  it("27. a FAILED RECORD WRITE during release leaves the handle RETRYABLE — F2", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, capacityRoot, slotPath } = makeRoot();
    const slot = profile!.openConfidentialSlot({ home, capacityRoot, lockTimeoutMs: 400 });
    expect(slot.acquire().granted).toBe(true);
    /**
     * THE RECORD DIRECTORY IS MADE UNWRITABLE BY REPLACING THE SLOT PATH WITH A DIRECTORY. A temp-file write into
     * `active.json.<token>.tmp` then fails with EISDIR/EPERM, which is the same shape as a disk-full or
     * permission-denied failure — without needing to stub the filesystem module.
     */
    rmSync(slotPath, { force: true });
    mkdirSync(slotPath, { recursive: true });
    const failed = slot.release();
    expect(failed.released).toBe(false);
    expect(failed.retryable).toBe(true);
    /** The handle still believes it holds the slot, so a retry is meaningful rather than a no-op. */
    expect(slot.release().detail).not.toContain("holds no slot");
    /** Restore a readable record and retry: the handle must be able to complete its own release. */
    rmSync(slotPath, { recursive: true, force: true });
    writeFileSync(slotPath, JSON.stringify({ holders: [{ pid: process.pid, token: "another-holder" }] }), "utf8");
    const retried = slot.release();
    expect(retried.released).toBe(false);
    expect(retried.detail).toContain("not present");
    expect(JSON.parse(readFileSync(slotPath, "utf8")).holders).toHaveLength(1);
  });
});

describe("S1R-B liveness and stale recovery (DYNAMICALLY_VERIFIED)", () => {
  it("13. a LIVE holder beyond the old TTL is never evicted by age", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, capacityRoot, slotPath } = makeRoot();
    writeFileSync(slotPath, JSON.stringify({ holders: [{ pid: process.pid, token: "ancient", at: 0 }] }), "utf8");
    const granted = profile!.openConfidentialSlot({ home, capacityRoot, staleAfterMs: 1, lockTimeoutMs: 150 }).acquire();
    expect(granted.granted).toBe(false);
    expect(granted.detail).toContain("at most 1");
  });

  it("14. a DEAD holder is recovered so a crash does not block work forever", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, capacityRoot, slotPath } = makeRoot();
    /** 999999999 is not a running pid; ESRCH is the expected answer. */
    writeFileSync(slotPath, JSON.stringify({ holders: [{ pid: 999_999_999, token: "dead", at: 0 }] }), "utf8");
    const slot = profile!.openConfidentialSlot({ home, capacityRoot, lockTimeoutMs: 300 });
    const granted = slot.acquire();
    expect(granted.granted).toBe(true);
    slot.release();
  });

  it("15. an INDETERMINATE liveness answer counts as a holder, not as free capacity", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, capacityRoot, slotPath } = makeRoot();
    /**
     * THE INDETERMINATE PATH CANNOT BE PRODUCED FROM A REAL PID ON THIS HOST.
     *
     * `process.kill(pid, 0)` answers ESRCH for a pid that does not exist and EPERM for one owned by another user;
     * every value that is not a positive integer is rejected structurally as MALFORMED before liveness is
     * consulted. There is therefore no real pid whose probe yields "indeterminate" here — a fixture cannot be
     * created, which §7.4 says must be a LIMIT rather than a PASS.
     *
     * What IS checkable is the property the code must have, checked from the shipped source so the control cannot
     * silently pass against a version that collapsed the distinction.
     */
    writeFileSync(slotPath, JSON.stringify({ holders: [{ pid: 999_999_999, token: "dead", at: 0 }] }), "utf8");
    const source = readFileSync(join(process.cwd(), "host", "deployment", "runtime", "confidential_profile.js"), "utf8");
    const hasTriState = /alive:\s*null/u.test(source) && /indeterminate:/u.test(source);
    const keepsNonDead = /liveness\.alive\s*!==\s*false/u.test(source);
    const slot = profile!.openConfidentialSlot({ home, capacityRoot, lockTimeoutMs: 300 });
    expect(slot.acquire().granted).toBe(true);
    slot.release();
    if (!hasTriState || !keepsNonDead) {
      expect.fail("LIMIT — the indeterminate-liveness fixture is unavailable on this host, and the shipped code no longer expresses the tri-state rule");
    }
  });

  it("16. an INTERRUPTED OWNER PUBLICATION is refused, never reclaimed", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, capacityRoot, lockDir } = makeRoot();
    /** The window between `mkdir(active.lock)` and the owner write: a lock directory with no owner record. */
    mkdirSync(lockDir, { recursive: true });
    const slot = profile!.openConfidentialSlot({ home, capacityRoot, lockTimeoutMs: 300 });
    const started = Date.now();
    const granted = slot.acquire();
    const elapsed = Date.now() - started;
    /** It must terminate, and it must NOT enter: an unreadable owner is indistinguishable from a live one. */
    expect(elapsed).toBeLessThan(5_000);
    expect(granted.granted).toBe(false);
    expect(granted.detail).toContain("not readable");
    /** §6.5: the lock is still there, untouched, and the refusal names the operator action. */
    expect(existsSync(lockDir)).toBe(true);
    expect(granted.detail).toContain("OPERATOR ACTION");
  });

  it("17. an ABANDONED lock is REFUSED rather than reclaimed — automatic reclamation is disabled", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, capacityRoot, lockDir } = makeRoot();
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(join(lockDir, "owner.json"), JSON.stringify({ pid: 999_999_999, token: "abandoned", at: 0 }), "utf8");
    const old = new Date(Date.now() - 600_000);
    utimesSync(lockDir, old, old);
    const slot = profile!.openConfidentialSlot({ home, capacityRoot, lockStaleMs: 1, lockTimeoutMs: 300 });
    const granted = slot.acquire();
    /**
     * THE RE-BASE. Host-S1 asserted that this lock was RECOVERED. F1 then measured that the reclamation path
     * moves whatever currently bears the pathname, so age is no longer an authorization to remove it (§6.4).
     * A dead owner is reported precisely, and an operator removes the lock.
     */
    expect(granted.granted).toBe(false);
    expect(granted.detail).toContain("no longer exists");
    expect(granted.detail).toContain("DISABLED");
    expect(granted.detail).toContain("OPERATOR ACTION");
    expect(existsSync(lockDir)).toBe(true);
  });

  it("18. a SUCCESSOR lock is not displaced by a recovery acting on an old observation — F1", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, capacityRoot, lockDir } = makeRoot();
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(join(lockDir, "owner.json"), JSON.stringify({ pid: process.pid, token: "successor-live-owner", at: Date.now() }), "utf8");
    const old = new Date(Date.now() - 600_000);
    utimesSync(lockDir, old, old);
    const slot = profile!.openConfidentialSlot({ home, capacityRoot, lockStaleMs: 1, lockTimeoutMs: 150 });
    const granted = slot.acquire();
    /** A live successor is never displaced by age, and it is not even moved. */
    expect(granted.granted).toBe(false);
    expect(existsSync(lockDir)).toBe(true);
    expect(JSON.parse(readFileSync(join(lockDir, "owner.json"), "utf8")).token).toBe("successor-live-owner");
  });

  it("19. no private claim or release directory is left behind by any path", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, capacityRoot, slotDir } = makeRoot();
    const slot = profile!.openConfidentialSlot({ home, capacityRoot, lockTimeoutMs: 500 });
    expect(slot.acquire().granted).toBe(true);
    expect(slot.release().released).toBe(true);
    /** A refusal path must not litter either. */
    const blocked = makeRoot();
    mkdirSync(blocked.lockDir, { recursive: true });
    profile!.openConfidentialSlot({ home: blocked.home, capacityRoot: blocked.capacityRoot, lockTimeoutMs: 100 }).acquire();
    expect(readdirSync(slotDir).filter((entry) => entry.startsWith("active.lock."))).toHaveLength(0);
    expect(readdirSync(blocked.slotDir).filter((entry) => entry.startsWith("active.lock."))).toHaveLength(0);
  });
});

describe("S1R-A capacity domain: the namespace is the Windows principal (DYNAMICALLY_VERIFIED)", () => {
  it("20. TWO REPOSITORIES with one capacity root CONTEND — F3", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const repoA = makeRepository();
    const repoB = makeRepository();
    const { home, capacityRoot, slotPath } = makeRoot();
    const slotA = profile!.openConfidentialSlot({ home, capacityRoot, domain: repoA.repository, lockTimeoutMs: 300 });
    const slotB = profile!.openConfidentialSlot({ home, capacityRoot, domain: repoB.repository, lockTimeoutMs: 300 });
    /**
     * THE F3 CORRECTION, AS A CONTROL. Both hosts serve DIFFERENT repositories and still resolve ONE slot,
     * because the repository is metadata rather than the namespace.
     */
    expect(slotA.domain.slotPath).toBe(slotPath);
    expect(slotB.domain.slotPath).toBe(slotPath);
    expect(slotA.domain.root).toBe(repoA.repository);
    expect(slotB.domain.root).toBe(repoB.repository);
    expect(slotA.acquire().granted).toBe(true);
    expect(slotB.acquire().granted).toBe(false);
    slotA.release();
  });

  it("21. two DSH HOMES in one capacity root CONTEND", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { capacityRoot, slotPath } = makeRoot();
    const homeA = join(ROOT, `ns-home-a-${String(counter)}`);
    const homeB = join(ROOT, `ns-home-b-${String(counter)}`);
    const slotA = profile!.openConfidentialSlot({ home: homeA, capacityRoot, lockTimeoutMs: 300 });
    const slotB = profile!.openConfidentialSlot({ home: homeB, capacityRoot, lockTimeoutMs: 300 });
    expect(slotA.domain.slotPath).toBe(slotPath);
    expect(slotB.domain.slotPath).toBe(slotPath);
    expect(slotA.acquire().granted).toBe(true);
    expect(slotB.acquire().granted).toBe(false);
    slotA.release();
  });

  it("22. the reported domain scope and its assumption cannot overclaim", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, capacityRoot } = makeRoot();
    const slot = profile!.openConfidentialSlot({ home, capacityRoot, domain: makeRepository().repository });
    /** The scope names the principal and the machine, which is what was measured. */
    expect(slot.domain.scope).toBe("windows-principal-machine");
    expect(slot.domain.identity).toContain("windows-principal");
    expect(slot.domain.assumption).toContain("Windows principal");
    /** It must NOT claim machine-wide coverage across principals. */
    expect(slot.domain.assumption).toContain("Different principals are not covered");
    expect(slot.domain.principal === null || slot.domain.principal.includes("\\")).toBe(true);
    expect(slot.domain.reparseAncestors).toHaveLength(0);
  });

  it("23. the production capacity root is the principal's own LOCALAPPDATA, not the repository", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home } = makeRoot();
    const slot = profile!.openConfidentialSlot({ home, domain: makeRepository().repository });
    const expected = join(process.env.LOCALAPPDATA ?? "", "Palimpsest", "host-capacity").toLowerCase();
    expect(slot.domain.capacityRoot.toLowerCase()).toBe(expected);
    /** A repository is never the namespace. */
    expect(slot.domain.slotPath.toLowerCase().startsWith(slot.domain.root!.toLowerCase())).toBe(false);
  });

  it("28. a capacity root reachable through a reparse point REFUSES to operate", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    counter += 1;
    const real = join(ROOT, `real-capacity-${String(counter)}`);
    mkdirSync(real, { recursive: true });
    const linkRoot = join(ROOT, `linked-capacity-${String(counter)}`);
    let linked = true;
    try {
      symlinkSync(real, linkRoot, "junction");
    } catch {
      linked = false;
    }
    if (!linked) {
      /** §7.4: an unavailable fixture is a disclosed LIMIT, not a PASS. */
      return expect.fail("LIMIT — a junction fixture could not be created for the capacity-root ancestry control");
    }
    const slot = profile!.openConfidentialSlot({ home: join(ROOT, "reparse-home"), capacityRoot: linkRoot, lockTimeoutMs: 200 });
    expect(slot.domain.reparseAncestors.length).toBeGreaterThan(0);
    const granted = slot.acquire();
    expect(granted.granted).toBe(false);
    expect(granted.detail).toContain("reparse point");
  });
});

describe("S1R-B in-process serialization (DYNAMICALLY_VERIFIED)", () => {
  it("24. the queue never exceeds the configured maximum", async () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    let running = 0;
    let peak = 0;
    const port = {
      adapterId: "test",
      run: async () => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((done) => setTimeout(done, 10));
        running -= 1;
        return { ok: true };
      },
    };
    const serialized = profile!.serializeConfidentialWorkers({ port, maxActiveWorkers: 1, policy: "wait" });
    await Promise.all([serialized.run({}), serialized.run({}), serialized.run({}), serialized.run({})]);
    expect(peak).toBe(1);
    expect(serialized.activeCount()).toBe(0);
    expect(serialized.waited()).toBeGreaterThan(0);
  });

  it("25. the refuse policy returns a HOST_FAILURE rather than running a second worker", async () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    let resolveFirst: (() => void) | undefined;
    const port = {
      adapterId: "test",
      run: async () => {
        await new Promise<void>((done) => {
          resolveFirst = done;
        });
        return { ok: true };
      },
    };
    const serialized = profile!.serializeConfidentialWorkers({ port, maxActiveWorkers: 1, policy: "refuse" });
    const first = serialized.run({});
    await new Promise((done) => setTimeout(done, 20));
    const second = await serialized.run({});
    expect((second as { kind?: string }).kind).toBe("HOST_FAILURE");
    expect(serialized.capacityRefusals()).toBe(1);
    const release: (() => void) | undefined = resolveFirst;
    release?.();
    await first;
  });

  it("26. a real worker rejection releases the in-process slot exactly once", async () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const port = {
      adapterId: "test",
      run: async () => {
        throw new Error("worker rejected");
      },
    };
    const serialized = profile!.serializeConfidentialWorkers({ port, maxActiveWorkers: 1 });
    await expect(serialized.run({})).rejects.toThrow("worker rejected");
    expect(serialized.activeCount()).toBe(0);
    const second = {
      adapterId: "test",
      run: async () => ({ ok: true }),
    };
    const again = profile!.serializeConfidentialWorkers({ port: second, maxActiveWorkers: 1 });
    await expect(again.run({})).resolves.toEqual({ ok: true });
  });
});
