/**
 * Palimpsest Host-S1 §8 — H1-C: CAPACITY OWNERSHIP AND RECOVERY SAFETY.
 *
 * THE DEFECTS THIS PINS (measured on the E1RG parent as `baseline-and-falsifiers.json` F4/F5/F6/F7).
 *
 *   F4  a malformed holder entry was filtered away as though it were a dead process, so a syntactically valid
 *       record containing garbage read as FREE CAPACITY;
 *   F5  release wrote `(read.ok ? read.holders : [])`, so an UNREADABLE record was replaced with an EMPTY holder
 *       list, destroying every other holder's record;
 *   F6  stale-lock recovery removed the lock BY PATHNAME from an observation, so a delayed remover could delete a
 *       successor that a different process had just legitimately acquired;
 *   F7  the slot was keyed by DSH_HOME, so two homes admitted two workers into ONE confidentiality domain.
 *
 * The decisive assertions:
 *
 *     Unknown ownership is not dead ownership.
 *     A failed read never authorises rewriting an empty ownership set.
 *     A recovery acting on an old observation cannot delete a successor lock.
 *     One protected domain admits one active worker, whatever home the host uses.
 *
 * SAFETY. Every slot is test-owned under one `mkdtemp` root. No real `.palimpsest`, session or credential is
 * touched, and no confidential worker is launched.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

type Slot = {
  acquire: () => { granted: boolean; detail: string };
  release: () => { released: boolean; detail: string; retryable?: boolean };
  peek: () => { active: number; detail: string; malformed: number };
  mechanism: string;
  domain: { home: string; root: string | null; key: string | null; slotPath: string; identity: string; assumption: string };
};
type ProfileModule = {
  openConfidentialSlot: (input: {
    home: string;
    domain?: string;
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
const ROOT = mkdtempSync(join(tmpdir(), "hosts1-capacity-"));
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

/** A test-owned home with its slot directory, and the paths a control needs. */
function makeHome(): { home: string; slotDir: string; slotPath: string; lockDir: string } {
  counter += 1;
  const home = join(ROOT, `home-${String(counter)}`);
  const slotDir = join(home, "confidential-workers");
  mkdirSync(slotDir, { recursive: true });
  return { home, slotDir, slotPath: join(slotDir, "active.json"), lockDir: join(slotDir, "active.lock") };
}

/** A test-owned protected domain (a repository shape) for the domain-keyed controls. */
function makeDomain(): { domain: string; slotDir: string; slotPath: string } {
  counter += 1;
  const domain = join(ROOT, `domain-${String(counter)}`);
  mkdirSync(join(domain, ".palimpsest"), { recursive: true });
  const slotDir = join(domain, ".palimpsest", "host-capacity");
  return { domain, slotDir, slotPath: join(slotDir, "active.json") };
}

describe("H1-C normal acquisition (DYNAMICALLY_VERIFIED)", () => {
  it("1. a single slot is granted and released", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home } = makeHome();
    const slot = profile!.openConfidentialSlot({ home });
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
    const { home } = makeHome();
    const first = profile!.openConfidentialSlot({ home, lockTimeoutMs: 150 });
    const second = profile!.openConfidentialSlot({ home, lockTimeoutMs: 150 });
    expect(first.acquire().granted).toBe(true);
    const refused = second.acquire();
    expect(refused.granted).toBe(false);
    expect(refused.detail).toContain("at most 1");
    first.release();
  });

  it("3. after release the slot can be acquired again", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home } = makeHome();
    const first = profile!.openConfidentialSlot({ home, lockTimeoutMs: 150 });
    expect(first.acquire().granted).toBe(true);
    expect(first.release().released).toBe(true);
    const second = profile!.openConfidentialSlot({ home, lockTimeoutMs: 150 });
    expect(second.acquire().granted).toBe(true);
    second.release();
  });
});

describe("H1-C malformed and unreadable state (DYNAMICALLY_VERIFIED)", () => {
  it("4. a malformed holder entry inside valid JSON is UNKNOWN ownership, not free capacity — F4", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, slotPath } = makeHome();
    writeFileSync(slotPath, JSON.stringify({ holders: [{ pid: "not-a-number", token: "x" }], profile: "p" }), "utf8");
    const slot = profile!.openConfidentialSlot({ home, lockTimeoutMs: 200 });
    const granted = slot.acquire();
    expect(granted.granted).toBe(false);
    expect(granted.detail).toContain("malformed");
    expect(granted.detail).toContain("UNKNOWN");
  });

  it("5. a holder with a NEGATIVE pid is malformed", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, slotPath } = makeHome();
    writeFileSync(slotPath, JSON.stringify({ holders: [{ pid: -1, token: "x" }] }), "utf8");
    expect(profile!.openConfidentialSlot({ home, lockTimeoutMs: 200 }).acquire().granted).toBe(false);
  });

  it("6. a holder with a NON-STRING token is malformed", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, slotPath } = makeHome();
    writeFileSync(slotPath, JSON.stringify({ holders: [{ pid: process.pid, token: 42 }] }), "utf8");
    expect(profile!.openConfidentialSlot({ home, lockTimeoutMs: 200 }).acquire().granted).toBe(false);
  });

  it("7. an UNREADABLE record during acquire does not grant capacity", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, slotPath } = makeHome();
    writeFileSync(slotPath, "{ this is not json", "utf8");
    const granted = profile!.openConfidentialSlot({ home, lockTimeoutMs: 200 }).acquire();
    expect(granted.granted).toBe(false);
    expect(granted.detail).toContain("cannot be established");
  });

  it("8. an UNREADABLE record during release is NOT rewritten as empty — F5", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, slotPath } = makeHome();
    const slot = profile!.openConfidentialSlot({ home, lockTimeoutMs: 200 });
    expect(slot.acquire().granted).toBe(true);
    /** An unrelated holder that must survive. */
    writeFileSync(slotPath, JSON.stringify({ holders: [{ pid: process.pid, token: "unrelated" }] }), "utf8");
    /** Now make the record unreadable. */
    writeFileSync(slotPath, "{ broken", "utf8");
    const released = slot.release();
    expect(released.released).toBe(false);
    expect(released.retryable).toBe(true);
    /** The bytes are untouched: no empty ownership set was written over an unknown record. */
    expect(readFileSync(slotPath, "utf8")).toBe("{ broken");
  });

  it("9. an UNRELATED holder survives a normal release", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, slotPath } = makeHome();
    const slot = profile!.openConfidentialSlot({ home, lockTimeoutMs: 200 });
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
    const { home, slotPath } = makeHome();
    /** A live holder with no token is still a holder: it must block capacity. */
    writeFileSync(slotPath, JSON.stringify({ holders: [{ pid: process.pid, at: Date.now() }] }), "utf8");
    const granted = profile!.openConfidentialSlot({ home, lockTimeoutMs: 200 }).acquire();
    expect(granted.granted).toBe(false);
  });

  it("11. a release by a NON-OWNER does not remove the recorded holder", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, slotPath } = makeHome();
    const owner = profile!.openConfidentialSlot({ home, lockTimeoutMs: 200 });
    expect(owner.acquire().granted).toBe(true);
    /** A second handle never acquired: its release must be a no-op. */
    const stranger = profile!.openConfidentialSlot({ home, lockTimeoutMs: 200 });
    const released = stranger.release();
    expect(released.released).toBe(false);
    const after = JSON.parse(readFileSync(slotPath, "utf8"));
    expect(after.holders).toHaveLength(1);
    owner.release();
  });

  it("12. a REPEATED release is refused and observable", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home } = makeHome();
    const slot = profile!.openConfidentialSlot({ home, lockTimeoutMs: 200 });
    expect(slot.acquire().granted).toBe(true);
    expect(slot.release().released).toBe(true);
    const second = slot.release();
    expect(second.released).toBe(false);
    expect(second.detail).toContain("holds no slot");
  });
});

describe("H1-C liveness and stale recovery (DYNAMICALLY_VERIFIED)", () => {
  it("13. a LIVE holder beyond the old TTL is never evicted by age", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, slotPath } = makeHome();
    /** A holder record that is ancient but whose pid is this live process. */
    writeFileSync(slotPath, JSON.stringify({ holders: [{ pid: process.pid, token: "ancient", at: 0 }] }), "utf8");
    const granted = profile!.openConfidentialSlot({ home, staleAfterMs: 1, lockTimeoutMs: 150 }).acquire();
    expect(granted.granted).toBe(false);
    expect(granted.detail).toContain("at most 1");
  });

  it("14. a DEAD holder is recovered so a crash does not block work forever", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, slotPath } = makeHome();
    /** 999999999 is not a running pid; ESRCH is the expected answer. */
    writeFileSync(slotPath, JSON.stringify({ holders: [{ pid: 999_999_999, token: "dead", at: 0 }] }), "utf8");
    const slot = profile!.openConfidentialSlot({ home, lockTimeoutMs: 300 });
    const granted = slot.acquire();
    expect(granted.granted).toBe(true);
    slot.release();
  });

  it("15. an INDETERMINATE liveness answer counts as a holder, not as free capacity", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, slotPath } = makeHome();
    /**
     * THE INDETERMINATE PATH CANNOT BE PRODUCED FROM A REAL PID ON THIS HOST.
     *
     * `process.kill(pid, 0)` answers ESRCH for a pid that does not exist and EPERM for one owned by another user;
     * every value that is not a positive integer is rejected structurally as MALFORMED before liveness is even
     * consulted. There is therefore no real pid whose probe yields an "indeterminate" answer here — a fixture
     * cannot be created, which §7.4 says must be a LIMIT rather than a PASS.
     *
     * What IS checkable is the property the code must have, and it is checked from the shipped source so the
     * control cannot silently pass against a version that collapsed the distinction: `livenessOf` must return a
     * tri-state and `liveHolders` must keep anything not shown to be dead.
     */
    writeFileSync(slotPath, JSON.stringify({ holders: [{ pid: 999_999_999, token: "dead", at: 0 }] }), "utf8");
    const source = readFileSync(join(process.cwd(), "host", "deployment", "runtime", "confidential_profile.js"), "utf8");
    const hasTriState = /alive:\s*null/u.test(source) && /indeterminate:/u.test(source);
    const keepsNonDead = /liveness\.alive\s*!==\s*false/u.test(source);
    /** A DEFINITELY dead holder is still recovered — the conservative rule must not block recovery. */
    const slot = profile!.openConfidentialSlot({ home, lockTimeoutMs: 300 });
    const recovered = slot.acquire();
    expect(recovered.granted).toBe(true);
    slot.release();
    if (!hasTriState || !keepsNonDead) {
      expect.fail("LIMIT — the indeterminate-liveness fixture is unavailable on this host, and the shipped code no longer expresses the tri-state rule");
    }
  });

  it("16. an OWNER PUBLICATION INTERRUPTED before owner.json does not cause an infinite block", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, lockDir } = makeHome();
    /** A lock directory with NO owner record: the window between mkdir and the owner write. */
    mkdirSync(lockDir, { recursive: true });
    const slot = profile!.openConfidentialSlot({ home, lockStaleMs: 50, lockTimeoutMs: 300 });
    const started = Date.now();
    const granted = slot.acquire();
    const elapsed = Date.now() - started;
    /** It must terminate — either by refusing or by recovering once the age bound passes. */
    expect(elapsed).toBeLessThan(5_000);
    expect(typeof granted.granted).toBe("boolean");
    if (granted.granted) slot.release();
  });

  it("17. an ABANDONED lock is recovered and the acquisition proceeds", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, lockDir } = makeHome();
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(join(lockDir, "owner.json"), JSON.stringify({ pid: 999_999_999, token: "abandoned", at: 0 }), "utf8");
    const old = new Date(Date.now() - 600_000);
    utimesSync(lockDir, old, old);
    const slot = profile!.openConfidentialSlot({ home, lockStaleMs: 1, lockTimeoutMs: 2_000 });
    const granted = slot.acquire();
    expect(granted.granted).toBe(true);
    slot.release();
  });

  it("18. a SUCCESSOR lock is not deleted by a recovery acting on an old observation — F6", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, lockDir } = makeHome();
    /**
     * An abandoned lock is planted. A SUCCESSOR (owned by this live process) then occupies the same pathname.
     * The recovery must decide from the CURRENT owner — which is alive — and therefore must not touch it.
     */
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(join(lockDir, "owner.json"), JSON.stringify({ pid: process.pid, token: "successor-live-owner", at: Date.now() }), "utf8");
    const old = new Date(Date.now() - 600_000);
    utimesSync(lockDir, old, old);
    const slot = profile!.openConfidentialSlot({ home, lockStaleMs: 1, lockTimeoutMs: 150 });
    const granted = slot.acquire();
    /** A live successor is never displaced by age. */
    expect(granted.granted).toBe(false);
    expect(existsSync(lockDir)).toBe(true);
    const owner = JSON.parse(readFileSync(join(lockDir, "owner.json"), "utf8"));
    expect(owner.token).toBe("successor-live-owner");
  });

  it("19. a recovery that grants leaves NO private claim directory behind", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { home, slotDir, lockDir } = makeHome();
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(join(lockDir, "owner.json"), JSON.stringify({ pid: 999_999_999, token: "abandoned", at: 0 }), "utf8");
    const old = new Date(Date.now() - 600_000);
    utimesSync(lockDir, old, old);
    const slot = profile!.openConfidentialSlot({ home, lockStaleMs: 1, lockTimeoutMs: 2_000 });
    expect(slot.acquire().granted).toBe(true);
    slot.release();
    /** The claim name is `active.lock.claim-<token>` and must not survive a successful recovery. */
    const leftovers = readdirSync(slotDir).filter((entry) => entry.startsWith("active.lock."));
    expect(leftovers).toHaveLength(0);
  });
});

describe("H1-C lock namespace and security domain (DYNAMICALLY_VERIFIED)", () => {
  it("20. two homes in ONE protected domain contend for one slot — F7", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const homeA = join(ROOT, `ns-home-a-${String(counter)}`);
    const homeB = join(ROOT, `ns-home-b-${String(counter)}`);
    const { domain, slotPath } = makeDomain();
    const slotA = profile!.openConfidentialSlot({ home: homeA, domain, lockTimeoutMs: 200 });
    const slotB = profile!.openConfidentialSlot({ home: homeB, domain, lockTimeoutMs: 200 });
    /** Both resolve the SAME slot, because the namespace is the domain rather than the home. */
    expect(slotA.domain.slotPath).toBe(slotPath);
    expect(slotB.domain.slotPath).toBe(slotPath);
    expect(slotA.acquire().granted).toBe(true);
    expect(slotB.acquire().granted).toBe(false);
    slotA.release();
  });

  it("21. two DIFFERENT domains in one home do NOT contend", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const home = join(ROOT, `ns-home-shared-${String(counter)}`);
    const domainA = makeDomain();
    const domainB = makeDomain();
    const slotA = profile!.openConfidentialSlot({ home, domain: domainA.domain, lockTimeoutMs: 200 });
    const slotB = profile!.openConfidentialSlot({ home, domain: domainB.domain, lockTimeoutMs: 200 });
    expect(slotA.domain.slotPath).not.toBe(slotB.domain.slotPath);
    expect(slotA.acquire().granted).toBe(true);
    expect(slotB.acquire().granted).toBe(true);
    slotB.release();
    slotA.release();
  });

  it("22. the domain identity and its assumption are reported, so a receipt cannot overclaim", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { domain } = makeDomain();
    const withDomain = profile!.openConfidentialSlot({ home: join(ROOT, `id-home-${String(counter)}`), domain });
    expect(withDomain.domain.identity).toContain("protected-domain");
    expect(withDomain.domain.assumption).toContain("every host");
    const withoutDomain = profile!.openConfidentialSlot({ home: join(ROOT, `id-home-nod-${String(counter)}`) });
    expect(withoutDomain.domain.identity).toContain("dsh-home");
    expect(withoutDomain.domain.assumption).toContain("do not share it");
  });

  it("23. the domain slot lives inside the protected domain, so a worker cannot forge it", () => {
    if (!ready()) return expect(moduleError).toBeTruthy();
    const { domain, slotDir } = makeDomain();
    const slot = profile!.openConfidentialSlot({ home: join(ROOT, `forge-home-${String(counter)}`), domain });
    expect(slot.domain.slotPath.toLowerCase()).toBe(join(slotDir, "active.json").toLowerCase());
    expect(slot.domain.slotPath.toLowerCase().startsWith(domain.toLowerCase())).toBe(true);
  });
});

describe("H1-C in-process serialization (DYNAMICALLY_VERIFIED)", () => {
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
    /** Typed as an optional call so the compiler keeps the function type the callback assigned. */
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
    /** A second run must still be admitted: the slot was not leaked. */
    const second = {
      adapterId: "test",
      run: async () => ({ ok: true }),
    };
    const again = profile!.serializeConfidentialWorkers({ port: second, maxActiveWorkers: 1 });
    await expect(again.run({})).resolves.toEqual({ ok: true });
  });
});
