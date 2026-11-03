/**
 * PC1 S07-R04/R05 — usage accounting from real session events.
 *
 * The rules that matter:
 *   - one entry per (sessionId, seq); a resume does not double-count a replayed event;
 *   - input / output / cache tokens stay separate, and cache tokens are never priced as fresh input;
 *   - a missing usage counter is UNKNOWN, not zero;
 *   - a session that produced assistant messages and then hit a provider error is INVALID, not
 *     OBSERVED, and a session that never produced a turn is BLOCKED.
 */
export interface UsageEntry {
  readonly sessionId: string;
  readonly seq: number;
  readonly provider: string;
  readonly model: string;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly cacheReadTokens: number | null;
  readonly cacheWriteTokens: number | null;
}

export interface UsageTotals {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly reportedTokens: number;
  readonly entries: number;
  readonly missingUsage: number;
}

export type RunClassification = "OBSERVED" | "INVALID" | "BLOCKED";

export interface RunClassificationInput {
  readonly assistantMessages: number;
  readonly providerErrors: number;
  readonly timedOut: boolean;
  readonly budgetExhausted?: boolean | undefined;
  readonly cancelled?: boolean | undefined;
}

export function dedupeUsage(entries: readonly UsageEntry[]): readonly UsageEntry[] {
  const byKey = new Map<string, UsageEntry>();
  for (const entry of entries) {
    const key = `${entry.sessionId}\u0000${entry.seq}`;
    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, entry);
      continue;
    }
    // A replay must be byte-identical in its counters. A different counter under the same identity
    // is a conflict, not a newer truth.
    if (
      existing.inputTokens !== entry.inputTokens ||
      existing.outputTokens !== entry.outputTokens ||
      existing.cacheReadTokens !== entry.cacheReadTokens ||
      existing.cacheWriteTokens !== entry.cacheWriteTokens
    ) {
      throw new Error(`conflicting usage counters for ${entry.sessionId} seq ${entry.seq}`);
    }
  }
  return [...byKey.values()].sort((left, right) => (left.sessionId === right.sessionId ? left.seq - right.seq : left.sessionId.localeCompare(right.sessionId)));
}

export function sumUsage(entries: readonly UsageEntry[]): UsageTotals {
  let input = 0;
  let output = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let missing = 0;
  for (const entry of dedupeUsage(entries)) {
    if (entry.inputTokens === null || entry.outputTokens === null) {
      missing += 1;
      continue;
    }
    input += entry.inputTokens;
    output += entry.outputTokens;
    cacheRead += entry.cacheReadTokens ?? 0;
    cacheWrite += entry.cacheWriteTokens ?? 0;
  }
  return {
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    reportedTokens: input + output,
    entries: entries.length,
    missingUsage: missing,
  };
}

export function classifyRun(input: RunClassificationInput): { readonly classification: RunClassification; readonly reason: string } {
  if (input.cancelled === true) return { classification: "INVALID", reason: "operator_cancelled" };
  if (input.assistantMessages === 0) {
    return {
      classification: "BLOCKED",
      reason: input.providerErrors > 0 ? "provider_error_before_first_turn" : "no_model_turn_observed",
    };
  }
  if (input.providerErrors > 0) return { classification: "INVALID", reason: "provider_error_during_turn" };
  if (input.timedOut) return { classification: "INVALID", reason: "timeout_during_turn" };
  if (input.budgetExhausted === true) return { classification: "INVALID", reason: "budget_exhausted" };
  return { classification: "OBSERVED", reason: "completed_with_model_turns" };
}

export interface BudgetWindow {
  readonly reportedTokensMax: number;
  readonly stopNewLaunchesAt: number;
  readonly inFlightReserveTokens: number;
  readonly maxSessions: number;
}

export interface BudgetState {
  readonly reportedTokens: number;
  readonly sessionsStarted: number;
  readonly inFlightTokens: number;
}

export function canStartSession(window: BudgetWindow, state: BudgetState, estimatedTokens: number): { readonly allowed: boolean; readonly reason: string } {
  if (state.sessionsStarted >= window.maxSessions) return { allowed: false, reason: "session_cap_reached" };
  if (state.reportedTokens >= window.stopNewLaunchesAt) return { allowed: false, reason: "stop_threshold_reached" };
  const projected = state.reportedTokens + state.inFlightTokens + estimatedTokens;
  if (projected > window.reportedTokensMax) return { allowed: false, reason: "pair_reservation_would_exceed_cap" };
  return { allowed: true, reason: "within_window" };
}
