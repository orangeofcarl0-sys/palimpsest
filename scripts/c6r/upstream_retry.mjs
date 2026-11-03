/**
 * C6-R C2 — bounded, response-safe retry for the provider gateway.
 *
 * The opencode gateway resets connections sporadically (`read ECONNRESET`) before sending any
 * response. Retrying a request that has not started streaming is safe: the model never saw a partial
 * answer. Retrying after a response has started is NOT safe — it would duplicate or corrupt output —
 * so the policy refuses it and leaves the error to the DSH adapter's own retry policy.
 *
 * The proxy buffers the request body once and replays it per attempt; the credential and the body
 * are never logged. This is a transport repair, not a model, prompt, scenario or authority change.
 */
export const UPSTREAM_RETRY = Object.freeze({
  maxAttempts: 4,
  baseDelayMs: 500,
  maxDelayMs: 4_000,
  timeoutMs: 180_000,
  maxBodyBytes: 64 * 1024 * 1024,
});

const RETRYABLE = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "EAI_AGAIN",
  "ENETRESET",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "UND_ERR_SOCKET",
  "UPSTREAM_TIMEOUT",
]);

export function isRetryableUpstreamError(code) {
  return typeof code === "string" && RETRYABLE.has(code);
}

export function upstreamRetryDelay(attempt) {
  if (!Number.isInteger(attempt) || attempt < 1) throw new Error("attempt must be a positive integer");
  return Math.min(UPSTREAM_RETRY.baseDelayMs * 2 ** (attempt - 1), UPSTREAM_RETRY.maxDelayMs);
}

/**
 * Decide whether to retry the attempt that just failed.
 * `attempt` is 1-based; `responseStarted` means any response byte or header reached the client.
 */
export function retryUpstreamPlan({ attempt, errorCode, responseStarted }) {
  if (responseStarted) return { retry: false, delayMs: 0, reason: "response_started" };
  if (!Number.isInteger(attempt) || attempt < 1) return { retry: false, delayMs: 0, reason: "invalid_attempt" };
  if (attempt >= UPSTREAM_RETRY.maxAttempts) return { retry: false, delayMs: 0, reason: "attempts_exhausted" };
  if (!isRetryableUpstreamError(errorCode)) return { retry: false, delayMs: 0, reason: "not_retryable" };
  return { retry: true, delayMs: upstreamRetryDelay(attempt), reason: null };
}
