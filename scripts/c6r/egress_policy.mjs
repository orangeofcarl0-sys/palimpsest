/**
 * C6-R — the complete egress allow-list for the provider proxy.
 *
 * Two provider kinds are supported, each with ONE method and ONE path:
 *   anthropic  POST /v1/messages          x-api-key
 *   openai     POST /v1/chat/completions  Authorization: Bearer
 *
 * Kept in its own module so the rule can be tested without starting a server or reading a
 * credential. The model's sandbox can only reach the proxy; it cannot fetch any other host.
 */
export const PROVIDER_KINDS = Object.freeze({
  anthropic: Object.freeze({
    method: "POST",
    path: "/v1/messages",
    upstreamPath: "/v1/messages",
    authHeader: "x-api-key",
  }),
  openai: Object.freeze({
    method: "POST",
    path: "/v1/chat/completions",
    upstreamPath: "/chat/completions",
    authHeader: "authorization",
  }),
});

export function providerRouteAllowedFor(kind, method, path) {
  const route = PROVIDER_KINDS[kind];
  if (route === undefined) return false;
  return method === route.method && path === route.path;
}

/** Backwards-compatible default for the Anthropic route. */
export function providerRouteAllowed(method, path) {
  return providerRouteAllowedFor("anthropic", method, path);
}

export function providerAuthHeaders(kind, key) {
  const route = PROVIDER_KINDS[kind];
  if (route === undefined) throw new Error(`unknown provider kind: ${kind}`);
  return route.authHeader === "authorization" ? { authorization: `Bearer ${key}` } : { "x-api-key": key };
}

export const ALLOWED_PROVIDER_ROUTES = Object.freeze(["POST /v1/messages"]);
