/**
 * C6-R4 — session-stream usage accounting and budget thresholds.
 *
 * COG-6's monitor scanned console lines for a token count. These tests pin the replacement:
 * the v4 session stream is the source, a repeated observation contributes once, independent
 * sessions are summed (never maxed), and an unreadable stream is not silently a valid observation.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zstdCompressSync } from "node:zlib";
import {
  accountSessions,
  readSessionStream,
  type SessionStream,
} from "../scripts/c6r/session_stream.mjs";
import { BUDGET, budgetDecision, campaignTokens, classifySession } from "../scripts/c6r/budget.mjs";

function stream(path: string, sessionId: string, events: unknown[], complete = true): SessionStream {
  return {
    path,
    sessionId,
    header: { type: "session", id: sessionId },
    events: events as SessionStream["events"],
    frames: 1,
    truncatedFrames: 0,
    malformedLines: 0,
    complete,
    turnEnd: complete ? { turn: 1 } : null,
  };
}

function assistant(seq: number, totalTokens: number, outputTokens = 10): unknown {
  return {
    type: "assistant/message",
    seq,
    data: {
      usage: {
        inputTokens: totalTokens - outputTokens,
        outputTokens,
        totalTokens,
      },
    },
  };
}

describe("C6-R4 session accounting", () => {
  it("decodes every zstd frame of a v4 stream", () => {
    const root = mkdtempSync(join(tmpdir(), "palimpsest-c6r-stream-"));
    try {
      const path = join(root, "session.v4.jsonl.zstd");
      const lines = [
        { type: "session", version: 4, id: "session-1" },
        assistant(2, 15),
        { type: "turn/end", seq: 3, data: { turn: 1 } },
      ];
      writeFileSync(path, Buffer.concat(lines.map((line) => zstdCompressSync(Buffer.from(`${JSON.stringify(line)}\n`)))));
      const decoded = readSessionStream(path);
      expect(decoded.sessionId).toBe("session-1");
      expect(decoded.events).toHaveLength(3);
      expect(decoded.frames).toBe(3);
      expect(decoded.complete).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("counts the same event once across a repeated or resumed stream", () => {
    const first = stream("a", "session-1", [assistant(2, 15)]);
    const repeated = stream("b", "session-1", [assistant(2, 15)], false);
    const account = accountSessions([first, repeated]);
    expect(account.sessionCount).toBe(1);
    expect(account.totals.totalTokens).toBe(15);
    expect(account.sessions[0]?.duplicateEvents).toBe(1);
    expect(account.sessions[0]?.complete).toBe(false);
  });

  it("sums independent sessions instead of taking the maximum", () => {
    const account = accountSessions([
      stream("a", "session-1", [assistant(2, 10)]),
      stream("b", "session-2", [assistant(2, 20)]),
    ]);
    expect(account.sessionCount).toBe(2);
    expect(account.totals.totalTokens).toBe(30);
    expect(campaignTokens(account.sessions)).toBe(30);
  });

  it("records a missing usage report instead of inventing tokens", () => {
    const account = accountSessions([
      stream("a", "session-1", [{ type: "assistant/message", seq: 2, data: { message: { content: [] } } }]),
    ]);
    expect(account.totals.totalTokens).toBe(0);
    expect(account.sessions[0]?.missingUsageMessages).toBe(1);
  });

  it("excludes a stream with no session header and reports it", () => {
    const account = accountSessions([stream("a", null as unknown as string, [assistant(2, 10)])]);
    expect(account.sessionCount).toBe(0);
    expect(account.problems).toEqual([{ path: "a", problem: "missing_session_header" }]);
  });

  it("distinguishes a blocked provider from an invalid stream and a valid observation", () => {
    expect(classifySession({ sessionCount: 0, assistantMessages: 0, providerErrors: 0, complete: false }).classification).toBe("BLOCKED");
    expect(classifySession({ sessionCount: 1, assistantMessages: 0, providerErrors: 1, complete: false }).classification).toBe("BLOCKED");
    expect(classifySession({ sessionCount: 1, assistantMessages: 2, providerErrors: 0, complete: false }).classification).toBe("INVALID");
    expect(classifySession({ sessionCount: 1, assistantMessages: 2, providerErrors: 0, complete: true }).classification).toBe("OBSERVED");
  });

  it("marks a turn that had assistant content but ended in a provider error as INVALID", () => {
    expect(classifySession({ sessionCount: 1, assistantMessages: 21, providerErrors: 1, complete: true })).toEqual({
      classification: "INVALID",
      reason: "provider_error_during_turn",
    });
  });

  it("stops starting a new session at exactly the pre-registered thresholds", () => {
    expect(budgetDecision({ sessionsStarted: 0, totalTokens: 0, elapsedMs: 0 }).allowed).toBe(true);
    expect(budgetDecision({ sessionsStarted: 5, totalTokens: 4_999_999, elapsedMs: 1_000 }).allowed).toBe(true);
    expect(budgetDecision({ sessionsStarted: 5, totalTokens: 5_000_000, elapsedMs: 1_000 })).toEqual({
      allowed: false,
      reason: "token_stop_threshold",
    });
    expect(budgetDecision({ sessionsStarted: 1, totalTokens: BUDGET.maxTokens, elapsedMs: 1_000 }).reason).toBe("token_max");
    expect(budgetDecision({ sessionsStarted: 6, totalTokens: 10, elapsedMs: 1_000 }).reason).toBe("session_cap");
    expect(budgetDecision({ sessionsStarted: 1, totalTokens: 10, elapsedMs: BUDGET.maxSessionMs }).reason).toBe("session_wall_clock");
  });
});
