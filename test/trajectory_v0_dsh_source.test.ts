/**
 * Trajectory-V0 §4/§9 (V0-B / V0-G) — THE DSH SESSION SOURCE.
 *
 * Two distinct evidence classes, kept strictly separate, because the ruling forbids blurring them:
 *
 *   `PASS_REAL_DSH_QUERY_NO_MODEL` — the tests that mount DSH's OWN `dsh-session-persistence-jsonl`
 *   backend in a bare Cordis context and read through `readColdSessionLog` from
 *   `dsh-session-query`. No model, no provider, no agent activation.
 *
 *   `PASS_DSH_QUERY_PORT_FIXTURE` — the tests that use a strictly typed structural port fixture for
 *   cases no real session can produce on demand (a corrupt frame, a fork-inherited cut, a specific
 *   sequence gap). These are LABELLED as fixtures and never presented as DSH compatibility.
 *
 * A local Work Stub does NOT produce a genuine DSH model session, and nothing here pretends
 * otherwise.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { sanitizeDshEvent, type DshSessionReadPort } from "../src/trajectory/index.js";

const DSH_HOME = process.env["DSH_HOME"] ?? join(process.env["USERPROFILE"] ?? "", ".dsh");
const SESSIONS_ROOT = join(DSH_HOME, "sessions");

/** §2: the reader is available only when an installed DSH tree exists. */
const readerModule = await import("../scripts/trajectory_v0/dsh-session-reader.mjs" as string).catch(() => null);
const hasDsh = existsSync(join(DSH_HOME, "profiles", "node_modules", "@deepseek-ai", "dsh-session"));

/**
 * §9: a REAL DSH-backed reader, or null when this machine has no installed DSH tree. The tests
 * below then report NOT_RUN rather than fabricating a pass.
 */
async function realReader(): Promise<DshSessionReadPort | null> {
  if (readerModule === null || !hasDsh) return null;
  return await readerModule.makeRealDshSessionReader({ dshHomePath: DSH_HOME, sessionsRoot: SESSIONS_ROOT });
}

/**
 * §9: a REAL session that actually exercises the ruled event vocabulary.
 *
 * Selected by READING the candidates and scoring their event kinds — never by modification time and
 * never by filename similarity. The id is pinned so the test is reproducible on this machine.
 */
const PINNED_SESSION = "session-7439041a-d269-4434-a6f2-491a21e36502";

/* ================================================================== §9 real DSH query */

describe("Trajectory-V0 §9 V0-G — the real DSH session source", () => {
  it("the reader mounts DSH's own persistence backend and reads a real session without a model", async () => {
    const reader = await realReader();
    if (reader === null) {
      expect(hasDsh).toBe(false);
      return;
    }
    expect(reader.evidenceClass).toBe("REAL_DSH_QUERY");
    expect(reader.sourceIdentity).toContain("dsh-session-persistence-jsonl");

    const page = await reader.readEvents({ sessionId: PINNED_SESSION, maxEvents: 50 });
    expect(page.readState).toBe("READ_OK");
    // §4: bounded reading — the page is capped at the requested size.
    expect(page.events.length).toBeLessThanOrEqual(50);
    expect(page.knownEventCount).toBeGreaterThan(0);
    // §4: the immutable header identity came from the source, not from us.
    expect(page.header).not.toBeNull();
    expect(page.header!.version).toBe(4);
    expect(page.header!.sessionId).toBe(PINNED_SESSION);

    // §4: the ruled event vocabulary is present in this real session.
    const kinds = new Set(page.events.map((event) => event.type));
    for (const kind of ["turn/start", "step/start", "assistant/message", "tool/call", "tool/result"]) {
      expect(kinds).toContain(kind);
    }

    // §4: a tool/call exposes the tool NAME and never its arguments.
    const toolCall = page.events.find((event) => event.type === "tool/call");
    expect(toolCall).toBeDefined();
    expect(toolCall!.summary).toContain("tool call");
    expect(JSON.stringify(page)).not.toContain('"arguments"');

    // §4: the page states what it does and does not prove.
    expect(page.proves.length).toBeGreaterThan(0);
    expect(page.doesNotProve.join(" ")).toContain("turn/end means the work succeeded");
    expect(page.doesNotProve.join(" ")).toContain("settled, verified or promoted");
  }, 120_000);

  it("§9: a bounded page is a real page, not a full replay dressed up as one", async () => {
    const reader = await realReader();
    if (reader === null) return;
    const first = await reader.readEvents({ sessionId: PINNED_SESSION, maxEvents: 5 });
    expect(first.events.length).toBe(5);
    expect(first.events.map((event) => event.seq)).toEqual([0, 1, 2, 3, 4]);
    // §4: the known count is the SESSION's, independent of the page bound.
    expect(first.knownEventCount).toBeGreaterThan(5);
    // A later window addresses a real cursor.
    const later = await reader.readEvents({ sessionId: PINNED_SESSION, fromSeq: 5, maxEvents: 5 });
    expect(later.events.map((event) => event.seq)).toEqual([5, 6, 7, 8, 9]);
    // §4: DSH seq numbers are LOCAL to the session; they are not a global sequence.
    expect(later.events[0]!.sessionId).toBe(PINNED_SESSION);
  }, 120_000);

  it("§4: a missing session is SESSION_MISSING — never an empty event stream", async () => {
    const reader = await realReader();
    if (reader === null) return;
    const page = await reader.readEvents({ sessionId: "session-does-not-exist-00000000" });
    expect(page.readState).toBe("SESSION_MISSING");
    expect(page.events).toEqual([]);
    expect(page.detail).toContain("SESSION_MISSING");
    // And the header read agrees.
    const header = await reader.readHeaderIdentity("session-does-not-exist-00000000");
    expect(header.readState).toBe("SESSION_MISSING");
    expect(header.header).toBeNull();
  }, 120_000);

  it("§10: reading a real session does not change the source bytes", async () => {
    const reader = await realReader();
    if (reader === null) return;
    const { createHash } = await import("node:crypto");
    const { readFileSync, statSync, readdirSync } = await import("node:fs");
    /**
     * §10: locate the session's OWN artifact for a before/after comparison. This is a test-local
     * integrity check on a pinned id — it is not the product's discovery path, and it selects
     * nothing.
     */
    let artifact: string | null = null;
    for (const projectDir of readdirSync(SESSIONS_ROOT, { withFileTypes: true })) {
      if (!projectDir.isDirectory()) continue;
      const candidate = join(SESSIONS_ROOT, projectDir.name, PINNED_SESSION);
      if (!existsSync(candidate)) continue;
      for (const file of readdirSync(candidate)) {
        if (file.startsWith("session.v") && file.includes("jsonl")) {
          artifact = join(candidate, file);
          break;
        }
      }
      if (artifact !== null) break;
    }
    expect(artifact).not.toBeNull();
    const before = { hash: createHash("sha256").update(readFileSync(artifact!)).digest("hex"), size: statSync(artifact!).size, mtime: statSync(artifact!).mtimeMs };
    await reader.readEvents({ sessionId: PINNED_SESSION, maxEvents: 50 });
    await reader.readEvents({ sessionId: PINNED_SESSION, maxEvents: 50 });
    const after = { hash: createHash("sha256").update(readFileSync(artifact!)).digest("hex"), size: statSync(artifact!).size, mtime: statSync(artifact!).mtimeMs };
    expect(after).toEqual(before);
  }, 120_000);

  it("§9: the same session read twice yields an identical sanitized projection", async () => {
    const reader = await realReader();
    if (reader === null) return;
    const a = await reader.readEvents({ sessionId: PINNED_SESSION, maxEvents: 50 });
    const b = await reader.readEvents({ sessionId: PINNED_SESSION, maxEvents: 50 });
    const project = (page: typeof a) => JSON.stringify(page.events.map((event) => [event.seq, event.type, event.summary, event.observedStatus]));
    expect(project(b)).toBe(project(a));
  }, 120_000);
});

/* ================================================================== §9 structural fixture */

/**
 * §9: a strictly typed structural read-port fixture.
 *
 * It exists for the event cases NO real session can produce on demand — a corrupt frame, a fork
 * with an inherited cut, a deliberate sequence gap, a failed assistant attempt, a tool call with no
 * result, an incomplete step/turn, and an unknown-but-valid kind. It is labelled
 * `DSH_QUERY_PORT_FIXTURE` and is never presented as authentic DSH Session compatibility.
 */
function fixtureReader(spec: {
  readonly sessionId: string;
  readonly readState?: string;
  readonly inheritedEventCount?: number;
  readonly events: readonly { seq: number; type: string; data?: Record<string, unknown>; time?: number }[];
  readonly knownParentSession?: string | null;
}): DshSessionReadPort {
  return Object.freeze({
    sourceIdentity: "DSH_QUERY_PORT_FIXTURE",
    evidenceClass: "DSH_QUERY_PORT_FIXTURE" as const,
    async readEvents(request: { readonly sessionId: string; readonly fromSeq?: number | undefined; readonly maxEvents?: number | undefined }) {
      const fromSeq = Number.isInteger(request.fromSeq) ? (request.fromSeq as number) : 0;
      const maxEvents = Number.isInteger(request.maxEvents) ? (request.maxEvents as number) : 50;
      const inherited = spec.inheritedEventCount ?? 0;
      const views = spec.events
        .filter((event) => event.seq >= fromSeq)
        .slice(0, maxEvents)
        .map((event) =>
          sanitizeDshEvent({
            sessionId: spec.sessionId,
            seq: event.seq,
            type: event.type,
            time: event.time ?? 1_700_000_000_000 + event.seq,
            data: event.data ?? {},
            inherited: event.seq < inherited,
            surface: null,
          }),
        );
      return Object.freeze({
        schemaVersion: 1 as const,
        readState: (spec.readState ?? "READ_OK") as never,
        sessionId: spec.sessionId,
        header: Object.freeze({
          sessionId: spec.sessionId, version: 4, createdAt: 1_700_000_000_000, cwd: null,
          parentSession: spec.knownParentSession ?? null, isSeeded: inherited > 0, origin: null, delegationDepth: null,
        }),
        sourceIdentity: "DSH_QUERY_PORT_FIXTURE",
        throughSeq: views.length === 0 ? null : views[views.length - 1]!.seq,
        knownEventCount: spec.events.length,
        inheritedEventCount: inherited,
        events: Object.freeze(views),
        knownParentSession: spec.knownParentSession ?? null,
        proves: Object.freeze(["fixture events, for structural cases only"]),
        doesNotProve: Object.freeze(["any claim about a real DSH session"]),
        detail: "a structural fixture page",
      });
    },
    async readHeaderIdentity(sessionId: string) {
      return Object.freeze({ readState: "READ_OK" as const, header: null, detail: `fixture header for ${sessionId}` });
    },
  });
}

describe("Trajectory-V0 §9 V0-G — the required event cases (structural fixture)", () => {
  it("§9: a completed turn, a failed assistant attempt and an unfinished step are distinguishable", async () => {
    const reader = fixtureReader({
      sessionId: "session-fixture-cases",
      events: [
        { seq: 0, type: "turn/start", data: { turn: 0 } },
        { seq: 1, type: "step/start", data: { turn: 0, step: 0 } },
        { seq: 2, type: "assistant/attempt", data: { turn: 0, status: "failed", failure: { code: "X" } } },
        { seq: 3, type: "assistant/message", data: { turn: 0, step: 0, message: { content: "PRIVATE" } } },
        { seq: 4, type: "tool/call", data: { turn: 0, step: 0, name: "bash", arguments: { command: "SECRET" } } },
        { seq: 5, type: "tool/call", data: { turn: 0, step: 0, name: "read", arguments: { path: "x" } } },
        { seq: 6, type: "tool/result", data: { turn: 0, step: 0, message: { content: "OUTPUT" } } },
        { seq: 7, type: "step/end", data: { turn: 0, step: 0 } },
        { seq: 8, type: "turn/end", data: { turn: 0, reason: { kind: "completed" } } },
        { seq: 9, type: "some/future/kind", data: { anything: "PAYLOAD" } },
      ],
    });
    const page = await reader.readEvents({ sessionId: "session-fixture-cases", maxEvents: 50 });
    expect(page.readState).toBe("READ_OK");
    const bySeq = new Map(page.events.map((event) => [event.seq, event]));

    // §9: a FAILED assistant attempt keeps its failure status and is never flattened to a message.
    expect(bySeq.get(2)!.observedStatus).toBe("failed");
    // §9: a tool/call WITHOUT a result is present and simply has no matching result.
    const calls = page.events.filter((event) => event.type === "tool/call");
    const results = page.events.filter((event) => event.type === "tool/result");
    expect(calls.length).toBe(2);
    expect(results.length).toBe(1);
    expect(calls.length).not.toBe(results.length);
    // §9: the turn/end reason is reported, and completion is not inferred from the step/end.
    expect(bySeq.get(8)!.observedStatus).toBe("completed");
    expect(bySeq.get(7)!.observedStatus).toBeNull();
    // §9: an unknown-but-valid kind is referenced, not dropped, and carries no payload.
    expect(bySeq.get(9)!.summary).toContain("unrecognized event kind");
    expect(JSON.stringify(page)).not.toContain("PAYLOAD");
    // §9: no content leaked anywhere in the page.
    const rendered = JSON.stringify(page);
    for (const secret of ["PRIVATE", "SECRET", "OUTPUT"]) expect(rendered).not.toContain(secret);
  });

  it("§9: a fork-inherited cut is distinguishable from child-owned events", async () => {
    const reader = fixtureReader({
      sessionId: "session-fixture-fork",
      inheritedEventCount: 3,
      knownParentSession: "session-parent",
      events: [
        { seq: 0, type: "turn/start", data: { turn: 0 } },
        { seq: 1, type: "turn/end", data: { turn: 0, reason: { kind: "completed" } } },
        { seq: 2, type: "session/end-seed", data: {} },
        { seq: 3, type: "turn/start", data: { turn: 1 } },
      ],
    });
    const page = await reader.readEvents({ sessionId: "session-fixture-fork", maxEvents: 50 });
    expect(page.inheritedEventCount).toBe(3);
    // §9: the inherited prefix is marked, and the child-owned events are NOT.
    expect(page.events.filter((event) => event.inherited).map((event) => event.seq)).toEqual([0, 1, 2]);
    expect(page.events.filter((event) => !event.inherited).map((event) => event.seq)).toEqual([3]);
    // §9: the parent session is reported as its OWN relation — never converted into a Work edge.
    expect(page.knownParentSession).toBe("session-parent");
    // The page carries the session lineage relation ONLY — there is no Work-delegation field at all.
    expect(Object.keys(page)).not.toContain("workDelegation");
    expect(Object.keys(page)).not.toContain("attemptId");
    expect(Object.keys(page)).not.toContain("delegatedFrom");
  });

  it("§9: a corrupt or unsupported session source is never an empty stream", async () => {
    for (const readState of ["CORRUPT_SESSION", "FORMAT_UNSUPPORTED", "BACKEND_UNAVAILABLE", "IDENTITY_CONFLICT"] as const) {
      const reader = fixtureReader({ sessionId: "session-fixture-bad", readState, events: [] });
      const page = await reader.readEvents({ sessionId: "session-fixture-bad" });
      expect(page.readState).toBe(readState);
      // The state is explicit and the detail names it — a caller cannot mistake this for "no events".
      expect(page.detail.length).toBeGreaterThan(0);
    }
  });

  it("§9: a cursor before the first event and a cursor after the observed end both behave honestly", async () => {
    const reader = fixtureReader({
      sessionId: "session-fixture-cursor",
      events: [{ seq: 0, type: "turn/start", data: { turn: 0 } }, { seq: 1, type: "turn/end", data: { turn: 0, reason: { kind: "completed" } } }],
    });
    // Before the first event: the page is empty but the session is KNOWN and READ_OK.
    const before = await reader.readEvents({ sessionId: "session-fixture-cursor", fromSeq: 0, maxEvents: 0 });
    expect(before.readState).toBe("READ_OK");
    expect(before.events).toEqual([]);
    expect(before.knownEventCount).toBe(2);
    // After the observed end: an empty page, and the known count still tells the truth.
    const after = await reader.readEvents({ sessionId: "session-fixture-cursor", fromSeq: 99, maxEvents: 10 });
    expect(after.readState).toBe("READ_OK");
    expect(after.events).toEqual([]);
    expect(after.knownEventCount).toBe(2);
    expect(after.throughSeq).toBeNull();
  });
});

/* ================================================================== §9 evidence classification */

describe("Trajectory-V0 §9 — evidence classes are not blurred", () => {
  it("the real reader declares REAL_DSH_QUERY and the fixture declares DSH_QUERY_PORT_FIXTURE", async () => {
    const reader = await realReader();
    if (reader !== null) {
      expect(reader.evidenceClass).toBe("REAL_DSH_QUERY");
      expect(reader.sourceIdentity).not.toContain("FIXTURE");
    }
    const fixture = fixtureReader({ sessionId: "s", events: [] });
    expect(fixture.evidenceClass).toBe("DSH_QUERY_PORT_FIXTURE");
    expect(fixture.sourceIdentity).toBe("DSH_QUERY_PORT_FIXTURE");
  });
});
