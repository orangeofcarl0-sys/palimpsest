/**
 * C6-R4 — the pre-registered budget and termination contract.
 *
 * These are experimental limits, not spending targets:
 *   6 sessions, 8,000,000 reported tokens, no new session at 5,000,000, 8 minutes per session,
 *   sequential runs, no unplanned rerun of an unfavourable condition.
 *
 * A local monitor is not a server-side hard cap. The runtime launcher enforces these limits by
 * terminating the whole process group it started; the evidence records that distinction.
 */
export const BUDGET = Object.freeze({
  maxSessions: 6,
  maxTokens: 8_000_000,
  stopStartTokens: 5_000_000,
  maxSessionMs: 8 * 60 * 1000,
});

export function budgetDecision({ sessionsStarted, totalTokens, elapsedMs }) {
  if (!Number.isInteger(sessionsStarted) || sessionsStarted < 0) throw new Error("sessionsStarted must be a nonnegative integer");
  if (!Number.isFinite(totalTokens) || totalTokens < 0) throw new Error("totalTokens must be a nonnegative number");
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error("elapsedMs must be a nonnegative number");
  if (sessionsStarted >= BUDGET.maxSessions) return { allowed: false, reason: "session_cap" };
  if (totalTokens >= BUDGET.maxTokens) return { allowed: false, reason: "token_max" };
  if (totalTokens >= BUDGET.stopStartTokens) return { allowed: false, reason: "token_stop_threshold" };
  if (elapsedMs >= BUDGET.maxSessionMs) return { allowed: false, reason: "session_wall_clock" };
  return { allowed: true, reason: null };
}

/** The campaign total is the sum of the independent session totals, never their maximum. */
export function campaignTokens(sessions) {
  return sessions.reduce((sum, session) => sum + (Number.isFinite(session.totalTokens) ? session.totalTokens : 0), 0);
}

/**
 * A model/session failure is not an unfavourable cognitive result.
 *   · no request reached the provider (quota, crash) → BLOCKED
 *   · a request produced an assistant turn → OBSERVED, whatever the turn said
 *   · a stream that cannot be read reliably → INVALID (not a cognitive observation)
 */
export function classifySession({ sessionCount, assistantMessages, providerErrors, complete }) {
  if (sessionCount === 0) return { classification: "BLOCKED", reason: "no_session" };
  if (assistantMessages === 0 && providerErrors > 0) return { classification: "BLOCKED", reason: "provider_error_before_turn" };
  if (assistantMessages === 0) return { classification: "BLOCKED", reason: "no_assistant_turn" };
  if (!complete) return { classification: "INVALID", reason: "incomplete_or_unreadable_stream" };
  return { classification: "OBSERVED", reason: null };
}

/** Kill the process group a launcher started (POSIX). The launcher runs in the runtime. */
export function killProcessGroup(pid, signal = "SIGKILL") {
  if (!Number.isInteger(pid) || pid <= 1) throw new Error("a valid child pid is required");
  try {
    process.kill(-pid, signal);
    return { killed: true, mechanism: "posix_process_group", signal };
  } catch (error) {
    return { killed: false, mechanism: "posix_process_group", signal, error: String(error.message ?? error) };
  }
}
