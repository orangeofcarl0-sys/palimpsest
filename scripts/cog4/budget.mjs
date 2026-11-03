#!/usr/bin/env node
/**
 * COG-4 budget monitor (§11 of the ruling).
 *
 * Model usage is OBSERVED from real session streams — never estimated from text length. The monitor
 * exists because COG-3 crossed its cap by discovering the spend only after the campaign ended:
 *
 *   - it is fed `assistant/message` usage events, keyed by (home, sessionId, seq), so a re-read of a
 *     persistent stream is a duplicate observation rather than a second charge;
 *   - a resumed Session keeps its identity, so it is counted once and its later events are appended;
 *   - an unreadable stream is recorded UNAVAILABLE rather than guessed;
 *   - an event observed after its session was marked complete is recorded DELAYED and still charged once;
 *   - `canLaunch` refuses a new launch when observed + live reserve + the requested estimate would pass
 *     the launch-stop threshold, and `stopRequested` is the hard ceiling.
 *
 * This is an engineering bound, not a billing statement. DSH exposes no hard per-token limit; the
 * strongest supported control is to poll real usage and terminate a process tree that reaches a limit.
 *
 * NOT production code: `scripts/cog4/` is experiment-owned.
 */

export const DEFAULT_BUDGET = Object.freeze({
  sessionCap: 12,
  tokenCap: 12_000_000,
  launchStopTokens: 8_000_000,
  principalReserveTokens: 300_000,
  childReserveTokens: 100_000,
  perSessionMinutes: 8,
});

function nonNegative(value, what) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${what} must be a non-negative finite number`);
  }
  return value;
}

function usageOf(input) {
  const usage = input.usage ?? {};
  const inputTokens = nonNegative(usage.inputTokens ?? 0, "usage.inputTokens");
  const outputTokens = nonNegative(usage.outputTokens ?? 0, "usage.outputTokens");
  const cacheReadTokens = nonNegative(usage.cacheReadTokens ?? 0, "usage.cacheReadTokens");
  const cacheWriteTokens = nonNegative(usage.cacheWriteTokens ?? 0, "usage.cacheWriteTokens");
  const totalTokens = nonNegative(
    usage.totalTokens ?? inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
    "usage.totalTokens",
  );
  return Object.freeze({ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, totalTokens });
}

export function createBudgetMonitor(options = {}) {
  const limits = Object.freeze({ ...DEFAULT_BUDGET, ...options });
  const sessions = new Map();
  const seenEvents = new Set();
  const events = [];
  let duplicateObservations = 0;
  let delayedObservations = 0;
  let completedSessions = 0;

  function ensureSession(input) {
    const key = String(input.sessionKey ?? `${input.home ?? ""}:${input.sessionId ?? ""}`);
    let session = sessions.get(key);
    if (session === undefined) {
      session = {
        sessionKey: key,
        sessionId: String(input.sessionId ?? ""),
        home: String(input.home ?? ""),
        role: String(input.role ?? "unknown"),
        parent: input.parent === undefined ? null : String(input.parent),
        startedAt: input.startedAt ?? null,
        lastEventAt: null,
        completedAt: null,
        observedSeqs: new Set(),
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 0,
        events: 0,
        unavailable: [],
      };
      sessions.set(key, session);
    } else {
      // A later observation may supply the role/home the first one did not know.
      if (session.role === "unknown" && input.role !== undefined) session.role = String(input.role);
      if (session.home === "" && input.home !== undefined) session.home = String(input.home);
      if (session.startedAt === null && input.startedAt !== undefined) session.startedAt = input.startedAt;
    }
    return session;
  }

  /**
   * Observe ONE real usage event. The identity is (home, sessionId, seq): a persistent stream that is
   * read twice is one observation, and a resumed process appends new seqs to the SAME session.
   */
  function observeUsage(input) {
    const session = ensureSession(input);
    const seq = Number(input.seq);
    if (!Number.isSafeInteger(seq) || seq < 0) throw new Error("seq must be a non-negative safe integer");
    const eventKey = `${session.sessionKey}:${seq}`;
    if (seenEvents.has(eventKey)) {
      duplicateObservations += 1;
      return Object.freeze({ counted: false, duplicate: true, sessionKey: session.sessionKey, seq });
    }
    seenEvents.add(eventKey);
    const usage = usageOf(input);
    const wasComplete = session.completedAt !== null;
    if (wasComplete) delayedObservations += 1;
    session.observedSeqs.add(seq);
    session.inputTokens += usage.inputTokens;
    session.outputTokens += usage.outputTokens;
    session.cacheReadTokens += usage.cacheReadTokens;
    session.cacheWriteTokens += usage.cacheWriteTokens;
    session.totalTokens += usage.totalTokens;
    session.events += 1;
    if (typeof input.eventAt === "number") {
      if (session.lastEventAt === null || input.eventAt > session.lastEventAt) session.lastEventAt = input.eventAt;
    }
    events.push(
      Object.freeze({
        sessionKey: session.sessionKey,
        sessionId: session.sessionId,
        seq,
        role: session.role,
        observedAt: input.observedAt ?? null,
        eventAt: input.eventAt ?? null,
        usage,
        delayed: wasComplete,
      }),
    );
    return Object.freeze({ counted: true, duplicate: false, delayed: wasComplete, sessionKey: session.sessionKey, seq });
  }

  /** Mark a Session complete. Idempotent: a completed Session is accounted exactly once. */
  function markCompleted(input) {
    const session = ensureSession(input);
    if (session.completedAt !== null) {
      return Object.freeze({ newlyCompleted: false, sessionKey: session.sessionKey });
    }
    session.completedAt = input.at ?? new Date().toISOString();
    completedSessions += 1;
    return Object.freeze({ newlyCompleted: true, sessionKey: session.sessionKey });
  }

  /**
   * An unreadable or not-yet-flushed stream is UNAVAILABLE. It contributes no tokens and no estimate;
   * the caller must not substitute text length for model usage.
   */
  function recordUnavailable(input) {
    const session = ensureSession(input);
    session.unavailable.push(
      Object.freeze({ at: input.at ?? new Date().toISOString(), reason: String(input.reason ?? "usage unavailable") }),
    );
    return Object.freeze({ sessionKey: session.sessionKey });
  }

  function sessionSummaries() {
    return [...sessions.values()]
      .map((session) =>
        Object.freeze({
          sessionKey: session.sessionKey,
          sessionId: session.sessionId,
          home: session.home,
          role: session.role,
          parent: session.parent,
          startedAt: session.startedAt,
          lastEventAt: session.lastEventAt,
          completedAt: session.completedAt,
          events: session.events,
          inputTokens: session.inputTokens,
          outputTokens: session.outputTokens,
          cacheReadTokens: session.cacheReadTokens,
          cacheWriteTokens: session.cacheWriteTokens,
          totalTokens: session.totalTokens,
          unavailable: Object.freeze([...session.unavailable]),
        }),
      )
      .sort((left, right) => left.sessionKey.localeCompare(right.sessionKey));
  }

  function reserveFor(session) {
    return session.role === "principal" ? limits.principalReserveTokens : limits.childReserveTokens;
  }

  function snapshot(now = Date.now()) {
    const list = [...sessions.values()];
    const observedTokens = list.reduce((sum, session) => sum + session.totalTokens, 0);
    const inputTokens = list.reduce((sum, session) => sum + session.inputTokens, 0);
    const outputTokens = list.reduce((sum, session) => sum + session.outputTokens, 0);
    const cacheReadTokens = list.reduce((sum, session) => sum + session.cacheReadTokens, 0);
    const cacheWriteTokens = list.reduce((sum, session) => sum + session.cacheWriteTokens, 0);
    const live = list.filter((session) => session.completedAt === null);
    const inFlightReserveTokens = live.reduce((sum, session) => sum + reserveFor(session), 0);
    const projectedCeilingTokens = observedTokens + inFlightReserveTokens;
    const overWallClock = list
      .filter((session) => session.startedAt !== null && session.completedAt === null)
      .map((session) => ({
        sessionKey: session.sessionKey,
        role: session.role,
        elapsedMs: now - session.startedAt,
        limitMs: limits.perSessionMinutes * 60_000,
      }))
      .filter((entry) => entry.elapsedMs > entry.limitMs);
    return Object.freeze({
      schemaVersion: 1,
      limits: Object.freeze({ ...limits }),
      sessionsStarted: list.length,
      sessionsCompleted: completedSessions,
      liveSessions: live.length,
      observedTokens,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      inFlightReserveTokens,
      projectedCeilingTokens,
      remainingToLaunchStop: limits.launchStopTokens - observedTokens,
      remainingToCap: limits.tokenCap - observedTokens,
      launchStopReached: observedTokens >= limits.launchStopTokens,
      stopRequested: observedTokens >= limits.tokenCap || projectedCeilingTokens >= limits.tokenCap,
      sessionCapReached: list.length >= limits.sessionCap,
      duplicateObservations,
      delayedObservations,
      overWallClock,
      sessions: sessionSummaries(),
      note: "Tokens are reported model usage observed from assistant/message events, not billing. Cache-read is reported separately.",
    });
  }

  function canLaunch(input = {}) {
    const now = snapshot(input.now ?? Date.now());
    const estimatedTokens = nonNegative(input.estimatedTokens ?? 0, "estimatedTokens");
    const reasons = [];
    if (now.sessionsStarted >= limits.sessionCap) {
      reasons.push(`session cap reached (${now.sessionsStarted}/${limits.sessionCap})`);
    }
    if (now.observedTokens >= limits.launchStopTokens) {
      reasons.push(`observed usage ${now.observedTokens} already reached the launch-stop threshold ${limits.launchStopTokens}`);
    }
    if (now.observedTokens + now.inFlightReserveTokens + estimatedTokens > limits.launchStopTokens) {
      reasons.push(
        `observed ${now.observedTokens} + live reserve ${now.inFlightReserveTokens} + estimated ${estimatedTokens} exceeds the launch-stop threshold ${limits.launchStopTokens}`,
      );
    }
    if (now.stopRequested) {
      reasons.push(`the hard ceiling is projected or reached (${now.projectedCeilingTokens}/${limits.tokenCap})`);
    }
    return Object.freeze({
      allowed: reasons.length === 0,
      reasons: Object.freeze(reasons),
      estimatedTokens,
      snapshot: now,
    });
  }

  function assertCanLaunch(input = {}) {
    const decision = canLaunch(input);
    if (!decision.allowed) {
      throw new Error(`budget refuses the launch: ${decision.reasons.join("; ")}`);
    }
    return decision;
  }

  return Object.freeze({
    limits,
    observeUsage,
    markCompleted,
    recordUnavailable,
    snapshot,
    canLaunch,
    assertCanLaunch,
    events: () => Object.freeze([...events]),
  });
}
