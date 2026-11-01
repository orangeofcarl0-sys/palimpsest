export declare const UPSTREAM_RETRY: Readonly<{
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
  maxBodyBytes: number;
}>;
export declare function isRetryableUpstreamError(code: string): boolean;
export declare function upstreamRetryDelay(attempt: number): number;
export declare function retryUpstreamPlan(input: {
  attempt: number;
  errorCode: string;
  responseStarted: boolean;
}): { retry: boolean; delayMs: number; reason: string | null };
