export interface SessionEvent {
  type: string;
  seq?: number;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SessionStream {
  path: string;
  sessionId: string | null;
  header: SessionEvent | null;
  events: SessionEvent[];
  frames: number;
  truncatedFrames: number;
  malformedLines: number;
  complete: boolean;
  turnEnd: Record<string, unknown> | null;
}

export interface SessionAccount {
  sessionId: string;
  streams: number;
  complete: boolean;
  providerErrors: number;
  assistantMessages: number;
  usageEvents: number;
  duplicateEvents: number;
  missingUsageMessages: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
}

export interface AccountTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  usageEvents: number;
}

export interface AccountResult {
  sessions: SessionAccount[];
  sessionCount: number;
  totals: AccountTotals;
  problems: { path: string; problem: string }[];
}

export declare function decodeStreamBuffer(buffer: Buffer): {
  text: string;
  frames: number;
  truncatedFrames: number;
};
export declare function parseSessionText(text: string): {
  events: SessionEvent[];
  malformedLines: number;
};
export declare function readSessionStream(path: string): SessionStream;
export declare function accountSessions(streams: SessionStream[]): AccountResult;
export declare function toolCalls(events: SessionEvent[]): {
  seq: number | undefined;
  callId: string;
  name: string;
  arguments: string;
}[];
export declare function toolResults(events: SessionEvent[]): {
  seq: number | undefined;
  callId: string | null;
  isError: boolean;
  text: string;
}[];
export declare function requestToolCatalogue(events: SessionEvent[]): string[][];
