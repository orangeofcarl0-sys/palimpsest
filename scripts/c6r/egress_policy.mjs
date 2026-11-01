/**
 * C6-R2 — the complete egress allow-list for the provider proxy.
 *
 * One method, one path. Kept in its own module so the rule can be tested without starting a server
 * or reading a credential.
 */
const ALLOWED = new Set(["/v1/messages"]);

export function providerRouteAllowed(method, path) {
  return method === "POST" && ALLOWED.has(path);
}

export const ALLOWED_PROVIDER_ROUTES = Object.freeze(["POST /v1/messages"]);
