/**
 * C6-R C2 — the bounded, response-safe retry policy.
 */
import { describe, expect, it } from "vitest";
import {
  UPSTREAM_RETRY,
  isRetryableUpstreamError,
  retryUpstreamPlan,
  upstreamRetryDelay,
} from "../scripts/c6r/upstream_retry.mjs";

describe("C6-R C2 upstream retry policy", () => {
  it("retries a pre-response connection reset with exponential backoff", () => {
    expect(retryUpstreamPlan({ attempt: 1, errorCode: "ECONNRESET", responseStarted: false })).toEqual({
      retry: true,
      delayMs: 500,
      reason: null,
    });
    expect(retryUpstreamPlan({ attempt: 2, errorCode: "ECONNRESET", responseStarted: false }).delayMs).toBe(1000);
    expect(retryUpstreamPlan({ attempt: 3, errorCode: "UPSTREAM_TIMEOUT", responseStarted: false }).delayMs).toBe(2000);
  });

  it("caps the delay and stops at the attempt bound", () => {
    expect(upstreamRetryDelay(1)).toBe(UPSTREAM_RETRY.baseDelayMs);
    expect(upstreamRetryDelay(10)).toBe(UPSTREAM_RETRY.maxDelayMs);
    expect(retryUpstreamPlan({ attempt: UPSTREAM_RETRY.maxAttempts, errorCode: "ECONNRESET", responseStarted: false })).toEqual({
      retry: false,
      delayMs: 0,
      reason: "attempts_exhausted",
    });
  });

  it("never retries after a response has started", () => {
    expect(retryUpstreamPlan({ attempt: 1, errorCode: "ECONNRESET", responseStarted: true })).toEqual({
      retry: false,
      delayMs: 0,
      reason: "response_started",
    });
  });

  it("does not retry non-transport errors", () => {
    expect(isRetryableUpstreamError("ECONNRESET")).toBe(true);
    expect(isRetryableUpstreamError("ETIMEDOUT")).toBe(true);
    expect(isRetryableUpstreamError("AUTH")).toBe(false);
    expect(isRetryableUpstreamError("UNKNOWN")).toBe(false);
    expect(retryUpstreamPlan({ attempt: 1, errorCode: "UNKNOWN", responseStarted: false })).toEqual({
      retry: false,
      delayMs: 0,
      reason: "not_retryable",
    });
  });
});
