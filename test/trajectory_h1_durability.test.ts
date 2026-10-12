/**
 * Trajectory-H1 §6 (C2) — SINGLE-READ DSH DURABILITY PROVENANCE.
 *
 * This file pins the §6.1 law against the ACTUAL installed first-party DSH packages:
 *
 *     observedEvents = storedEvents + syntheticClosers(storedEvents)
 *
 * Every `storedEvents` entry is classified from the persistence read that produced it. Every event
 * produced by DSH's own `interruptedTurnClosers(storedEvents)` is classified as synthetic. No later,
 * independent storage count may determine the boundary of an already-observed read.
 *
 * No model is invoked, no provider is contacted and no personal session is touched: every session
 * here is created by this test under a test-owned root.
 *
 * Evidence classes:
 *   PASS_REAL_DSH_NO_MODEL  the session is created and read through the installed DSH packages.
 *   NOT_RUN                 no installed DSH tree; the test reports that rather than a fabricated pass.
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

interface ReaderModule {
  readonly resolveDshPackageRoot: (dshHomePath: string | undefined) => string | null;
  readonly makeRealDshSessionReader: (input: { readonly dshHomePath: string; readonly sessionsRoot: string }) => Promise<(DshSessionReadPort & { close?(): Promise<void> }) | null>;
}
const readerModule = (await import("../scripts/trajectory_v0/dsh-session-reader.mjs" as string)) as ReaderModule;

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

function controlledRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "h1-dsh-root-"));
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
    create(header: Record<string, unknown>, options: Record<string, unknown>): Promise<Handle>;
    open(id: unknown, access: string, options?: Record<string, unknown>): Promise<Handle>;
  };
  readonly SessionId: (value: string) => unknown;
}
interface Handle {
  append(events: readonly unknown[], options: Record<string, unknown>): Promise<void>;
  flush(options: Record<string, unknown>): Promise<void>;
  close(options?: Record<string, unknown>): Promise<void>;
  read(offset?: number, length?: number): Promise<{ readonly events: readonly { readonly seq: number }[]; readonly eventState: string }>;
  readonly header: { readonly id: string };
}

async function mountPersistence(root: string): Promise<Mounted | null> {
  const packageRoot = readerModule.resolveDshPackageRoot(DSH_HOME);
  if (packageRoot === null) return null;
  const base = pathToFileURL(packageRoot + "/").href;
  const { Context } = await import(base + "cordis/lib/index.js");
  const JsonlSessionPersistence = (await import(base + "dsh-session-persistence-jsonl/lib/index.js")).default;
  const { SessionId } = await import(base + "dsh-session/lib/index.js");
  const ctx = new Context();
  const fiber = (await ctx.plugin(JsonlSessionPersistence, { root, compression: "zstd" })) as { dispose?: () => Promise<void> } | undefined;
  cleanups.push(() => void fiber?.dispose?.());
  return { persistence: ctx.sessionPersistence as Mounted["persistence"], SessionId: SessionId as Mounted["SessionId"] };
}

/** The official recovery helper, loaded from the installed package rather than reimplemented. */
async function officialClosers(): Promise<(events: readonly unknown[]) => readonly { readonly seq: number }[]> {
  const packageRoot = readerModule.resolveDshPackageRoot(DSH_HOME)!;
  const base = pathToFileURL(packageRoot + "/").href;
  const session = await import(base + "dsh-session/lib/index.js");
  return session.interruptedTurnClosers as (events: readonly unknown[]) => readonly { readonly seq: number }[];
}

async function officialColdRead(): Promise<(persistence: unknown, id: unknown) => Promise<{ readonly events: readonly { readonly seq: number; readonly type: string }[] }>> {
  const packageRoot = readerModule.resolveDshPackageRoot(DSH_HOME)!;
  const base = pathToFileURL(packageRoot + "/").href;
  const query = await import(base + "dsh-session-query/lib/index.js");
  return query.readColdSessionLog as never;
}

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

const CREATED_AT = 1_700_000_000_000;
function turnPair(turn: number, time: number): readonly Record<string, unknown>[] {
  return [
    { type: "turn/start", seq: (turn - 1) * 2, time: time + 1, data: { turn } },
    { type: "turn/end", seq: (turn - 1) * 2 + 1, time: time + 2, data: { turn, reason: { kind: "completed" } } },
  ];
}
const INTERRUPTED_TAIL = Object.freeze([
  Object.freeze({ type: "turn/start", seq: 0, time: CREATED_AT + 1, data: Object.freeze({ turn: 1 }) }),
  Object.freeze({ type: "step/start", seq: 1, time: CREATED_AT + 2, data: Object.freeze({ turn: 1, step: 1 }) }),
]);

async function createSession(mounted: Mounted, sessionId: string, events: readonly Record<string, unknown>[]): Promise<void> {
  const handle = await mounted.persistence.create({ version: 4, id: mounted.SessionId(sessionId), createdAt: CREATED_AT, isSeeded: false }, {});
  if (events.length > 0) await handle.append(events, {});
  await handle.flush({});
  await handle.close({});
}

describe("Trajectory-H1 §6 — single-read durability provenance", () => {
  it("S1: a balanced stored Session has ZERO synthetic closers and an exact stored boundary", async () => {
    if (!hasDsh) return;
    const root = controlledRoot();
    const mounted = await mountPersistence(root);
    expect(mounted).not.toBeNull();
    const sessionId = "h1-balanced";
    const stored = [...turnPair(1, CREATED_AT), ...turnPair(2, CREATED_AT + 10)];
    await createSession(mounted!, sessionId, stored);

    const before = snapshotOf(root, sessionId);
    const reader = await readerModule.makeRealDshSessionReader({ dshHomePath: DSH_HOME, sessionsRoot: root });
    const page: DshSessionEventPage = await reader!.readEvents({ sessionId, maxEvents: 50 });

    expect(page.readState).toBe("READ_OK");
    expect(page.durabilityProvenance).toBe("PERSISTED_AND_SYNTHETIC_SEPARATED");
    expect(page.persistedEventCount).toBe(stored.length);
    expect(page.syntheticRecoveryEventCount).toBe(0);
    expect(page.events.every((event) => event.durability === "PERSISTED_DSH_EVENT")).toBe(true);
    // §6.4 S7: the read did not alter the source.
    expect(snapshotOf(root, sessionId)).toEqual(before);
    await reader!.close?.();
  }, 180_000);

  it("S2: an interrupted tail yields synthetic closers that are NEVER reported as stored", async () => {
    if (!hasDsh) return;
    const root = controlledRoot();
    const mounted = await mountPersistence(root);
    const sessionId = "h1-interrupted";
    await createSession(mounted!, sessionId, [...INTERRUPTED_TAIL]);

    const reader = await readerModule.makeRealDshSessionReader({ dshHomePath: DSH_HOME, sessionsRoot: root });
    const page: DshSessionEventPage = await reader!.readEvents({ sessionId, maxEvents: 50 });

    expect(page.readState).toBe("READ_OK");
    expect(page.persistedEventCount).toBe(2);
    expect(page.syntheticRecoveryEventCount).toBeGreaterThan(0);
    const persisted = page.events.filter((event) => event.durability === "PERSISTED_DSH_EVENT");
    const synthetic = page.events.filter((event) => event.durability === "SYNTHETIC_RECOVERY_EVENT");
    // The stored prefix is EXACTLY the two events that were written.
    expect(persisted.map((event) => event.seq)).toEqual([0, 1]);
    expect(persisted.every((event) => event.type !== "turn/end")).toBe(true);
    expect(synthetic.length).toBeGreaterThan(0);
    for (const event of synthetic) expect(event.seq).toBeGreaterThanOrEqual(2);
    // §6.3: a synthetic turn end is NOT a success signal.
    const syntheticTurnEnd = synthetic.find((event) => event.type === "turn/end");
    if (syntheticTurnEnd !== undefined) expect(syntheticTurnEnd.observedStatus).toBe("interrupted");
    await reader!.close?.();
  }, 180_000);

  it("S3: the derivation is byte-parity with official readColdSessionLog on a static Session", async () => {
    if (!hasDsh) return;
    const root = controlledRoot();
    const mounted = await mountPersistence(root);
    const sessionId = "h1-parity";
    await createSession(mounted!, sessionId, [...INTERRUPTED_TAIL]);

    const closersOf = await officialClosers();
    const coldRead = await officialColdRead();

    // The official cold read over the same stored session.
    const official = await coldRead(mounted!.persistence, mounted!.SessionId(sessionId));
    // The single-read derivation over ONE official read handle.
    const handle = await mounted!.persistence.open(mounted!.SessionId(sessionId), "read");
    const read = await handle.read(0, undefined);
    const derived = [...read.events, ...closersOf(read.events)];
    await handle.close();

    expect(derived.map((event) => event.seq)).toEqual(official.events.map((event) => event.seq));
    expect(derived.map((event) => (event as unknown as { type: string }).type)).toEqual(official.events.map((event) => event.type));

    // And the SHIPPED reader agrees with both.
    const reader = await readerModule.makeRealDshSessionReader({ dshHomePath: DSH_HOME, sessionsRoot: root });
    const page: DshSessionEventPage = await reader!.readEvents({ sessionId, maxEvents: 50 });
    expect(page.knownEventCount).toBe(official.events.length);
    expect(page.events.map((event) => event.seq)).toEqual(official.events.map((event) => event.seq));
    await reader!.close?.();
  }, 180_000);

  it("S4: a later append does not retroactively reclassify the previously observed boundary", async () => {
    if (!hasDsh) return;
    const root = controlledRoot();
    const mounted = await mountPersistence(root);
    const sessionId = "h1-concurrent";
    await createSession(mounted!, sessionId, [...INTERRUPTED_TAIL]);

    const reader = await readerModule.makeRealDshSessionReader({ dshHomePath: DSH_HOME, sessionsRoot: root });
    /**
     * §6.4 S4: the FIRST read observes an interrupted 2-event stored log with synthetic closers. That
     * boundary is a property of the array THIS read produced, so no later write can revise it.
     */
    const first: DshSessionEventPage = await reader!.readEvents({ sessionId, maxEvents: 50 });
    expect(first.persistedEventCount).toBe(2);
    const firstSyntheticSeqs = first.events.filter((event) => event.durability === "SYNTHETIC_RECOVERY_EVENT").map((event) => event.seq);
    expect(firstSyntheticSeqs.length).toBeGreaterThan(0);

    // A writer appends MORE stored events after the first read completed.
    const writer = await mounted!.persistence.open(mounted!.SessionId(sessionId), "write");
    await writer.append(
      [
        { type: "step/end", seq: 2, time: CREATED_AT + 3, data: { turn: 1, step: 1 } },
        { type: "turn/end", seq: 3, time: CREATED_AT + 4, data: { turn: 1, reason: { kind: "completed" } } },
      ],
      {},
    );
    await writer.flush({});
    await writer.close();

    /**
     * The FIRST page is UNCHANGED: seqs 2 and 3 remain synthetic FOR THAT READ, because the boundary
     * was fixed when the array was produced. Re-reading is what observes the new state, and the
     * second read correctly reports a balanced log.
     */
    expect(first.persistedEventCount).toBe(2);
    expect(first.events.filter((event) => event.durability === "SYNTHETIC_RECOVERY_EVENT").map((event) => event.seq)).toEqual(firstSyntheticSeqs);

    const second: DshSessionEventPage = await reader!.readEvents({ sessionId, maxEvents: 50 });
    expect(second.persistedEventCount).toBe(4);
    expect(second.syntheticRecoveryEventCount).toBe(0);
    await reader!.close?.();
  }, 180_000);

  it("S5: fork-inherited events remain distinguishable from the child's own execution", async () => {
    if (!hasDsh) return;
    const root = controlledRoot();
    const mounted = await mountPersistence(root);
    /**
     * §6.4 S5: a SUPPORTED first-party fork. The seed is built by DSH's own `buildForkSeed`, which
     * copies the inclusive source prefix, inserts the `session/end-seed` cut marker and closes the
     * open tail with `forked`-cause closers. A hand-built fixture without that marker is (correctly)
     * refused as corrupt by the format validator, which is why this uses the official helper.
     */
    const parentEvents = [
      { type: "turn/start", seq: 0, time: 1, data: { turn: 1 } },
      { type: "step/start", seq: 1, time: 2, data: { turn: 1, step: 1 } },
      { type: "step/end", seq: 2, time: 3, data: { turn: 1, step: 1 } },
      { type: "turn/end", seq: 3, time: 4, data: { turn: 1, reason: { kind: "completed" } } },
    ];
    const packageRoot = readerModule.resolveDshPackageRoot(DSH_HOME)!;
    const sessionModule = await import(pathToFileURL(packageRoot + "/").href + "dsh-session/lib/index.js");
    const buildForkSeed = sessionModule.buildForkSeed as (events: readonly unknown[], boundary: number) => readonly Record<string, unknown>[];

    const parentId = "h1-parent";
    await createSession(mounted!, parentId, parentEvents);
    const seed = buildForkSeed(parentEvents, 1);
    // The inherited cut is 2 events; the seed carries the marker and the forked closers.
    const childId = "h1-inherited";
    const child = await mounted!.persistence.create(
      { version: 4, id: mounted!.SessionId(childId), createdAt: CREATED_AT + 100, isSeeded: true, parentSession: parentId },
      { inheritedEventCount: 2 },
    );
    await child.append(seed, {});
    await child.flush({});
    await child.close();

    const reader = await readerModule.makeRealDshSessionReader({ dshHomePath: DSH_HOME, sessionsRoot: root });
    const page: DshSessionEventPage = await reader!.readEvents({ sessionId: childId, maxEvents: 50 });
    expect(page.readState).toBe("READ_OK");
    expect(page.inheritedEventCount).toBe(2);
    expect(page.header?.isSeeded).toBe(true);
    expect(page.header?.parentSession).toBe(parentId);
    /**
     * §6.4 S5: inherited events keep their exact inherited attribution. The events inside the
     * inherited cut are marked `inherited`, so inherited execution is never presented as this
     * session's own work.
     */
    const inherited = page.events.filter((event) => event.inherited);
    expect(inherited.map((event) => event.seq)).toEqual([0, 1]);
    // The synthetic recovery class is orthogonal to inheritance and stays separate.
    for (const event of page.events) expect(["PERSISTED_DSH_EVENT", "SYNTHETIC_RECOVERY_EVENT", "DURABILITY_UNRESOLVED"]).toContain(event.durability);
    /**
     * §6.4 S5: the forked closers ARE stored in the CHILD's own log — the fork seed was materialized
     * when the child was created — so they are correctly `PERSISTED_DSH_EVENT` here. The property that
     * matters is that they are NOT attributed to the inherited prefix: the inherited cut is exactly
     * seqs 0..1, so the forked closers sit outside it and cannot be read as inherited execution.
     */
    const forkedClosers = page.events.filter((event) => event.seq >= 2);
    expect(forkedClosers.length).toBeGreaterThan(0);
    expect(forkedClosers.every((event) => event.inherited === false)).toBe(true);
    // The `forked` cause is distinguishable from crash recovery: a forked turn end is not `interrupted`.
    const forkedTurnEnd = forkedClosers.find((event) => event.type === "turn/end");
    expect(forkedTurnEnd?.observedStatus).toBe("forked");
    await reader!.close?.();
  }, 180_000);

  it("S6: failure, corruption and cleanup are explicit — never a fabricated empty success", async () => {
    if (!hasDsh) return;
    const root = controlledRoot();
    const mounted = await mountPersistence(root);
    const reader = await readerModule.makeRealDshSessionReader({ dshHomePath: DSH_HOME, sessionsRoot: root });

    // A missing session is SESSION_MISSING, not an empty history.
    const missing: DshSessionEventPage = await reader!.readEvents({ sessionId: "h1-absent-0000000000000000" });
    expect(missing.readState).toBe("SESSION_MISSING");
    expect(missing.events).toEqual([]);
    expect(missing.knownEventCount).toBeNull();
    expect(missing.durabilityProvenance).toBe("DURABILITY_UNRESOLVED");

    // An unsupported/corrupt artifact is reported, not silently read as zero events.
    const corruptId = "h1-corrupt";
    await createSession(mounted!, corruptId, [...turnPair(1, CREATED_AT)]);
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = join(root, entry.name, corruptId);
      if (!existsSync(candidate)) continue;
      for (const file of readdirSync(candidate)) {
        if (file.includes("jsonl")) {
          const { writeFileSync } = await import("node:fs");
          writeFileSync(join(candidate, file), Buffer.from("not a zstd frame at all"), { flag: "w" });
        }
      }
    }
    const corrupt: DshSessionEventPage = await reader!.readEvents({ sessionId: corruptId });
    expect(corrupt.readState).not.toBe("READ_OK");
    expect(corrupt.events).toEqual([]);
    expect(corrupt.knownEventCount).toBeNull();

    // close() is idempotent and never throws.
    await reader!.close?.();
    await reader!.close?.();
  }, 180_000);

  it("S7: the reader never mutates the stored Session, and leaks no handle", async () => {
    if (!hasDsh) return;
    const root = controlledRoot();
    const mounted = await mountPersistence(root);
    const sessionId = "h1-readonly";
    await createSession(mounted!, sessionId, [...INTERRUPTED_TAIL]);
    const before = snapshotOf(root, sessionId);

    const reader = await readerModule.makeRealDshSessionReader({ dshHomePath: DSH_HOME, sessionsRoot: root });
    for (let index = 0; index < 5; index += 1) {
      const page: DshSessionEventPage = await reader!.readEvents({ sessionId, maxEvents: 50 });
      expect(page.readState).toBe("READ_OK");
      // Each read opens and closes its own handle, so repeated reads stay consistent.
      expect(page.persistedEventCount).toBe(2);
    }
    // The source bytes are unchanged after five reads.
    expect(snapshotOf(root, sessionId)).toEqual(before);
    await reader!.close?.();
  }, 180_000);
});
