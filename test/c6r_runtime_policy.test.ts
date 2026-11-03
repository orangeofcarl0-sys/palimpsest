/**
 * C6-R2 — the provider-only egress rule.
 *
 * The sandbox has no external network. Its one route is a loopback bridge to a proxy that holds the
 * credential and forwards exactly one method/path. These tests pin that allow-list; the runtime
 * qualification in `research-evidence/c6r/runtime/` pins its effect.
 */
import { describe, expect, it } from "vitest";
import {
  ALLOWED_PROVIDER_ROUTES,
  providerAuthHeaders,
  providerRouteAllowed,
  providerRouteAllowedFor,
} from "../scripts/c6r/egress_policy.mjs";

describe("C6-R2 provider-only egress", () => {
  it("allows exactly POST /v1/messages for the Anthropic route", () => {
    expect(ALLOWED_PROVIDER_ROUTES).toEqual(["POST /v1/messages"]);
    expect(providerRouteAllowed("POST", "/v1/messages")).toBe(true);
    expect(providerRouteAllowedFor("anthropic", "POST", "/v1/messages")).toBe(true);
  });

  it("allows exactly POST /v1/chat/completions for the OpenAI route", () => {
    expect(providerRouteAllowedFor("openai", "POST", "/v1/chat/completions")).toBe(true);
    expect(providerRouteAllowedFor("openai", "POST", "/v1/messages")).toBe(false);
    expect(providerRouteAllowedFor("openai", "GET", "/v1/chat/completions")).toBe(false);
    expect(providerRouteAllowedFor("openai", "POST", "/v1/models")).toBe(false);
    expect(providerRouteAllowedFor("openai", "POST", "/chat/completions")).toBe(false);
  });

  it("selects the auth header for each provider kind", () => {
    expect(providerAuthHeaders("anthropic", "key")).toEqual({ "x-api-key": "key" });
    expect(providerAuthHeaders("openai", "key")).toEqual({ authorization: "Bearer key" });
    expect(() => providerAuthHeaders("unknown", "key")).toThrow(/unknown provider kind/);
  });

  it("refuses every other method or path", () => {
    expect(providerRouteAllowed("GET", "/v1/messages")).toBe(false);
    expect(providerRouteAllowed("PUT", "/v1/messages")).toBe(false);
    expect(providerRouteAllowed("POST", "/v1/models")).toBe(false);
    expect(providerRouteAllowed("POST", "/")).toBe(false);
    expect(providerRouteAllowed("POST", "/anthropic/v1/messages")).toBe(false);
    expect(providerRouteAllowed("POST", "/v1/messages/extra")).toBe(false);
    expect(providerRouteAllowed("POST", "/v1/messages/../files")).toBe(false);
    expect(providerRouteAllowed("GET", "/api.github.com/zen")).toBe(false);
  });

  it("decides on the normalized pathname, ignoring a query string", () => {
    expect(providerRouteAllowed("POST", new URL("/v1/messages?beta=1", "http://local").pathname)).toBe(true);
    expect(providerRouteAllowed("POST", new URL("/v1/messages/../models", "http://local").pathname)).toBe(false);
  });
});
