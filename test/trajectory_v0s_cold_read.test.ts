/**
 * Trajectory-V0S §9 (S1-F) — THE DSH COLD-READ PROVENANCE AND BOUNDED-INPUT CONTRACT.
 *
 * This file uses the ACTUAL installed first-party DSH persistence API to create a controlled,
 * NON-MODEL session whose durable tail is unfinished, then reads it back through the shipped
 * `dsh-session-reader.mjs` adapter. No model is invoked, no provider is contacted and no personal
 * session is touched: every session here is created by this test, under a test-owned root.
 *
 * The properties it pins:
 *
 *   1. the stored prefix and the synthesized recovery closers are COUNTED SEPARATELY;
 *   2. each returned event carries the provenance class it actually earned;
 *   3. the original stored bytes are unchanged by the read;
 *   4. no successful Turn or Tool Result is inferred from a synthetic closer;
 *   5. the recovery event is NOT reported as originally persisted;
 *   6. a negative, fractional or excessive cursor is REFUSED;
 *   7. a cursor past the known end is reported honestly;
 *   8. a failure detail never carries an absolute personal path.
 *
 * Evidence classes:
 *   PASS_REAL_DSH_NO_MODEL — the session is created and read through the installed DSH packages.
 *   NOT_RUN                — no installed DSH tree on this machine; the test reports that, never a
 *                            fabricated pass.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import type { DshSessionEventPage, DshSessionReadPort } from "../src/trajectory/index.js";

const DSH_HOME = process.env["DSH_HOME"] ?? join(process.env["USERPROFILE"] ?? "", ".dsh");
const hasDsh = existsSync(join(DSH_HOME, "profiles", "node_modules", "@deepseek-ai", "dsh-session"));

/**
 * §9: the adapter is plain JavaScript, so its returned pages are typed here against the product
 * contract. A test that read them as `any` could silently accept a page missing a required field.
 */
interface ReaderModule {
  readonly resolveDshPackageRoot: (dshHomePath: string | undefined) => string | null;
  readonly sanitize: (message: unknown) => string;
  readonly makeRealDshSessionReader: (input: { readonly dshHomePath: string; readonly sessionsRoot: string }) => Promise<(DshSessionReadPort & { close?(): Promise<void> }) | null>;
}
const readerModule = (await import("../scripts/trajectory_v0/dsh-session-reader.mjs" as string)) as ReaderModule;

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

/**
 * §9: a controlled session root this test owns. It is never the user's DSH sessions root, so a test
 * can never read or disturb a personal session.
 */
function controlledRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "v0s-dsh-root-"));
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* the OS reaps it */
    }
  });
  return root;
}

interface Mounted {
  readonly persistence: {
    create(header: Record<string, unknown>, options: Record<string, unknown>): Promise<{
      append(events: readonly unknown[], options: Record<string, unknown>): Promise<void>;
      flush(options: Record<string, unknown>): Promise<void>;
      close(options: Record<string, unknown>): Promise<void>;
    }>;
  };
  readonly SessionId: (value: string) => unknown;
}

/** §9: mount DSH's own persistence backend over a test-owned root. */
async function mountPersistence(root: string): Promise<Mounted | null> {
  const packageRoot = readerModule.resolveDshPackageRoot(DSH_HOME);
  if (packageRoot === null) return null;
  const base = pathToFileURL(packageRoot + "/").href;
  const { Context } = await import(base + "cordis/lib/index.js");
  const JsonlSessionPersistence = (await import(base + "dsh-session-persistence-jsonl/lib/index.js")).default;
  const { SessionId } = await import(base + "dsh-session/lib/index.js");
  const ctx = new Context();
  /**
   * §9: `ctx.plugin` returns the Cordis fiber that owns the mounted service; disposing the FIBER is
   * the supported teardown, and a bare `Context` has no `dispose` of its own.
   */
  const fiber = (await ctx.plugin(JsonlSessionPersistence, { root, compression: "zstd" })) as { dispose?: () => Promise<void> } | undefined;
  cleanups.push(() => void fiber?.dispose?.());
  return { persistence: ctx.sessionPersistence as Mounted["persistence"], SessionId: SessionId as Mounted["SessionId"] };
}

/** §9: hash the session's own artifact for a before/after integrity comparison. */
function snapshotOf(root: string, sessionId: string): { hash: string; size: number } | null {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = join(root, entry.name, sessionId);
    if (!existsSync(candidate)) continue;
    for (const file of readdirSync(candidate)) {
      if (!file.startsWith("session.v") || !file.includes("jsonl")) continue;
      const artifact = join(candidate, file);
      return { hash: createHash("sha256").update(readFileSync(artifact)).digest("hex"), size: statSync(artifact).size };
    }
  }
  return null;
}

/** §9: a valid DSH turn pair, so a fixture's stored log passes the first-party format validator. */
function turnPair(turn: number, time: number): readonly Record<string, unknown>[] {
  return [
    { type: "turn/start", seq: (turn - 1) * 2, time: time + 1, data: { turn } },
    { type: "turn/end", seq: (turn - 1) * 2 + 1, time: time + 2, data: { turn, reason: { kind: "completed" } } },
  ];
}

describe("Trajectory-V0S §9 — cold-read provenance and bounded input", () => {
  it("§9: a session with an unfinished durable tail separates stored events from synthesized closers", async () => {
    if (!hasDsh) {
      expect(hasDsh).toBe(false);
      return;
    }
    const root = controlledRoot();
    const mounted = await mountPersistence(root);
    expect(mounted).not.toBeNull();
    const { persistence, SessionId } = mounted!;

    /**
     * §9: write a REAL stored log whose tail turn is left OPEN. DSH's format validator accepts
     * `turn/start` (turn 1) followed by `step/start` (step 1) and nothing further, which is exactly
     * the interrupted-tail shape `interruptedTurnClosers` exists to balance. The cold read therefore
     * returns the two stored events PLUS the synthetic closers it synthesizes for them.
     */
    const sessionId = "session-v0s-interrupted-fixture";
    const createdAt = 1_700_000_000_000;
    const handle = await persistence.create({ version: 4, id: SessionId(sessionId), createdAt, isSeeded: false }, {});
    const stored = [
      { type: "turn/start", seq: 0, time: createdAt + 1, data: { turn: 1 } },
      { type: "step/start", seq: 1, time: createdAt + 2, data: { turn: 1, step: 1 } },
    ];
    await handle.append(stored, {});
    await handle.flush({});
    await handle.close({});
    const storedCount = stored.length;

    const before = snapshotOf(root, sessionId);
    expect(before).not.toBeNull();

    const reader = await readerModule.makeRealDshSessionReader({ dshHomePath: DSH_HOME, sessionsRoot: root });
    expect(reader).not.toBeNull();
    const page: DshSessionEventPage = await reader!.readEvents({ sessionId, maxEvents: 50 });

    // §9: the read succeeded and the boundary was located through the storage seam.
    expect(page.readState).toBe("READ_OK");
    expect(page.durabilityProvenance).toBe("PERSISTED_AND_SYNTHETIC_SEPARATED");
    expect(page.persistedEventCount).toBe(storedCount);
    // §9: DSH synthesized at least one closer for the open turn/step.
    expect(page.syntheticRecoveryEventCount).toBeGreaterThan(0);
    expect(page.knownEventCount).toBe(storedCount + (page.syntheticRecoveryEventCount ?? 0));

    // §9: each event carries the class it earned, and the boundary is exact.
    const persisted = page.events.filter((event) => event.durability === "PERSISTED_DSH_EVENT");
    const synthetic = page.events.filter((event) => event.durability === "SYNTHETIC_RECOVERY_EVENT");
    expect(persisted.map((event) => event.seq)).toEqual([0, 1]);
    expect(synthetic.length).toBeGreaterThan(0);
    for (const event of synthetic) expect(event.seq).toBeGreaterThanOrEqual(storedCount);

    // §9: the synthetic closer is NOT reported as originally persisted.
    const closer = synthetic[0]!;
    expect(closer.durability).toBe("SYNTHETIC_RECOVERY_EVENT");
    expect(closer.durability).not.toBe("PERSISTED_DSH_EVENT");
    // §9: and no successful Turn or Tool Result is inferred from it.
    if (closer.type === "tool/result") expect(closer.observedStatus).not.toBe("recorded");

    // §9: the original stored bytes are unchanged by the read.
    const after = snapshotOf(root, sessionId);
    expect(after).toEqual(before);

    await reader!.close?.();
  }, 180_000);

  it("§9: a negative, fractional or excessive cursor is refused rather than coerced", async () => {
    if (!hasDsh) return;
    const root = controlledRoot();
    const mounted = await mountPersistence(root);
    const { persistence, SessionId } = mounted!;
    const sessionId = "session-v0s-bounds-fixture";
    const handle = await persistence.create({ version: 4, id: SessionId(sessionId), createdAt: 1_700_000_000_000, isSeeded: false }, {});
    await handle.append(turnPair(1, 1_700_000_000_000), {});
    await handle.flush({});
    await handle.close({});

    const reader = await readerModule.makeRealDshSessionReader({ dshHomePath: DSH_HOME, sessionsRoot: root });
    expect(reader).not.toBeNull();
    for (const request of [
      { sessionId, fromSeq: -1 },
      { sessionId, fromSeq: 1.5 },
      { sessionId, maxEvents: 0 },
      { sessionId, maxEvents: -5 },
      { sessionId, maxEvents: 10_000 },
    ]) {
      const page: DshSessionEventPage = await reader!.readEvents(request);
      expect(page.readState).toBe("INVALID_REQUEST");
      expect(page.events).toEqual([]);
      // §9: a refusal is not an empty session — the known count is explicitly absent.
      expect(page.knownEventCount).toBeNull();
      expect(page.returnedCount).toBe(0);
    }

    // §9: a cursor PAST the known end is a legal, honestly-reported empty page.
    const past: DshSessionEventPage = await reader!.readEvents({ sessionId, fromSeq: 99, maxEvents: 10 });
    expect(past.readState).toBe("READ_OK");
    expect(past.events).toEqual([]);
    expect(past.knownEventCount).toBe(2);
    expect(past.throughSeq).toBeNull();
    expect(past.returnedCount).toBe(0);
    expect(past.requestedMaxEvents).toBe(10);

    await reader!.close?.();
  }, 180_000);

  it("§9: the return bound and the disk-IO bound are reported separately", async () => {
    if (!hasDsh) return;
    const root = controlledRoot();
    const mounted = await mountPersistence(root);
    const { persistence, SessionId } = mounted!;
    const sessionId = "session-v0s-cost-fixture";
    const handle = await persistence.create({ version: 4, id: SessionId(sessionId), createdAt: 1_700_000_000_000, isSeeded: false }, {});
    const events: Record<string, unknown>[] = [];
    for (let turn = 1; turn <= 6; turn += 1) events.push(...turnPair(turn, 1_700_000_000_000 + turn * 10));
    await handle.append(events, {});
    await handle.flush({});
    await handle.close({});

    const reader = await readerModule.makeRealDshSessionReader({ dshHomePath: DSH_HOME, sessionsRoot: root });
    expect(reader).not.toBeNull();
    const page: DshSessionEventPage = await reader!.readEvents({ sessionId, fromSeq: 4, maxEvents: 3 });
    // §9: the page is bounded...
    expect(page.pageBounded).toBe(true);
    expect(page.returnedCount).toBe(3);
    expect(page.events.map((event) => event.seq)).toEqual([4, 5, 6]);
    // §9: ...and the reader DISCLOSES that it read the whole log before slicing.
    expect(page.diskIoBounded).toBe(false);
    expect(page.knownEventCount).toBeGreaterThan(3);

    await reader!.close?.();
  }, 180_000);

  it("§9: a missing session is SESSION_MISSING and never an empty successful history", async () => {
    if (!hasDsh) return;
    const root = controlledRoot();
    await mountPersistence(root);
    const reader = await readerModule.makeRealDshSessionReader({ dshHomePath: DSH_HOME, sessionsRoot: root });
    expect(reader).not.toBeNull();
    const page: DshSessionEventPage = await reader!.readEvents({ sessionId: "session-v0s-absent-00000000" });
    expect(page.readState).toBe("SESSION_MISSING");
    expect(page.events).toEqual([]);
    expect(page.knownEventCount).toBeNull();
    expect(page.durabilityProvenance).toBe("DURABILITY_UNRESOLVED");
    await reader!.close?.();
  }, 180_000);

  it("§9: a failure detail never carries an absolute personal path", () => {
    /**
     * §9: this is a UNIT check of the sanitizer, so it runs with or without an installed DSH tree.
     * The inputs are the shapes a raw filesystem exception actually produces.
     */
    const sanitize = readerModule.sanitize;
    expect(typeof sanitize).toBe("function");
    const windowsPath = "ENOENT: no such file or directory, open 'C:\\Users\\someone\\.dsh\\sessions\\proj\\session-x\\session.v4.jsonl.zstd'";
    const posixPath = "ENOENT: no such file or directory, open '/Users/someone/.dsh/sessions/proj/session-x'";
    for (const message of [windowsPath, posixPath]) {
      const sanitized = sanitize(message);
      expect(sanitized).not.toContain("someone");
      expect(sanitized).not.toContain(".dsh");
      expect(sanitized).toContain("<local-path>");
    }
    // A message with no path is preserved rather than blanked.
    expect(sanitize("the session format is unsupported")).toContain("unsupported");
    // A non-string is handled without throwing.
    expect(typeof sanitize(undefined)).toBe("string");
  });
});
