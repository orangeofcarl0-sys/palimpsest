export declare const BUDGET: Readonly<{
  maxSessions: number;
  maxTokens: number;
  stopStartTokens: number;
  maxSessionMs: number;
}>;

export declare function budgetDecision(input: {
  sessionsStarted: number;
  totalTokens: number;
  elapsedMs: number;
}): { allowed: boolean; reason: string | null };

export declare function campaignTokens(sessions: readonly { totalTokens: number }[]): number;

export declare function classifySession(input: {
  sessionCount: number;
  assistantMessages: number;
  providerErrors: number;
  complete: boolean;
}): { classification: "BLOCKED" | "INVALID" | "OBSERVED"; reason: string | null };

export declare function killProcessGroup(
  pid: number,
  signal?: NodeJS.Signals | string,
): { killed: boolean; mechanism: "posix_process_group"; signal: string; error?: string };
