/**
 * C6-R — provider-only egress proxy with bounded, response-safe retry.
 *
 * It runs OUTSIDE the model's sandbox, holds the only real credential, and forwards exactly one
 * route for the configured provider kind. The sandbox has no network of its own except a loopback
 * bridge to this Unix socket.
 *
 * Retry contract (C6-R C2):
 *   · the request body is buffered once and replayed, so a retry sends the same bytes;
 *   · a connection error that occurs BEFORE any response byte is retried up to 4 attempts with
 *     500/1000/2000 ms backoff;
 *   · an error after the response has started is never retried — a partial answer must not be
 *     duplicated or corrupted;
 *   · an HTTP status (including 4xx/5xx) is passed through to DSH, whose own retry policy owns it;
 *   · the credential and body are never logged.
 *
 * Credential sources (the key is never logged and never enters the sandbox):
 *   · C6R_REAL_KEY — qualification / mock mode;
 *   · C6R_PROVIDER_CONFIG_FILE + C6R_PROVIDER_ID — the active ZCode provider rule's access.apiKey;
 *   · C6R_CREDENTIAL_FILE — the owner's DSH credential store (legacy Anthropic route).
 */
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { PROVIDER_KINDS, providerAuthHeaders, providerRouteAllowedFor } from "./egress_policy.mjs";
import { UPSTREAM_RETRY, retryUpstreamPlan } from "./upstream_retry.mjs";

const SOCKET = process.env.C6R_PROXY_SOCKET;
const KIND = process.env.C6R_PROVIDER_KIND ?? "anthropic";
const ROUTE = PROVIDER_KINDS[KIND];
if (ROUTE === undefined) {
  process.stderr.write(`[provider-proxy] unknown C6R_PROVIDER_KIND "${KIND}"\n`);
  process.exit(2);
}
const DEFAULT_UPSTREAM = KIND === "openai" ? "https://opencode.ai/zen/go/v1" : "https://api.deepseek.com/anthropic";
const UPSTREAM = process.env.C6R_UPSTREAM ?? DEFAULT_UPSTREAM;
const LOG = process.env.C6R_PROXY_LOG ?? "";
const CREDENTIAL_FILE = process.env.C6R_CREDENTIAL_FILE ?? "";
const PROVIDER_CONFIG_FILE = process.env.C6R_PROVIDER_CONFIG_FILE ?? "";
const PROVIDER_ID = process.env.C6R_PROVIDER_ID ?? "";
const ENV_KEY = process.env.C6R_REAL_KEY ?? "";
const UPSTREAM_HEADERS = (() => {
  try { return JSON.parse(process.env.C6R_UPSTREAM_HEADERS ?? "{}"); } catch { return {}; }
})();

if (SOCKET === undefined || SOCKET === "") {
  process.stderr.write("[provider-proxy] C6R_PROXY_SOCKET is required\n");
  process.exit(2);
}

function readKey() {
  if (ENV_KEY !== "") return ENV_KEY;
  if (PROVIDER_CONFIG_FILE !== "" && PROVIDER_ID !== "" && existsSync(PROVIDER_CONFIG_FILE)) {
    const config = JSON.parse(readFileSync(PROVIDER_CONFIG_FILE, "utf8"));
    const rules = config.config?.providerConfigRules?.providerRules ?? [];
    const rule = rules.find((entry) => entry.providerId === PROVIDER_ID || entry.providerName === PROVIDER_ID);
    const key = rule?.config?.access?.apiKey;
    if (typeof key === "string" && key.length > 0) return key;
  }
  if (CREDENTIAL_FILE !== "" && existsSync(CREDENTIAL_FILE)) {
    const text = readFileSync(CREDENTIAL_FILE, "utf8");
    const match = text.match(/^\s{2}DEEPSEEK_API_KEY:\s*(\S+)\s*$/m) ?? text.match(/DEEPSEEK_API_KEY\s*[:=]\s*(\S+)/);
    if (match !== null) return match[1];
  }
  return null;
}

const KEY = readKey();
if (KEY === null) {
  process.stderr.write("[provider-proxy] no provider credential is available\n");
  process.exit(3);
}

const upstreamRoot = new URL(UPSTREAM);
const transport = upstreamRoot.protocol === "https:" ? httpsRequest : httpRequest;
const upstreamRootPath = upstreamRoot.pathname.replace(/\/$/u, "");
const target = new URL(`${upstreamRootPath}${ROUTE.upstreamPath}`, upstreamRoot);

mkdirSync(dirname(SOCKET), { recursive: true });
if (existsSync(SOCKET)) unlinkSync(SOCKET);

function log(entry) {
  if (LOG === "") return;
  appendFileSync(LOG, `${JSON.stringify({ at: new Date().toISOString(), kind: KIND, ...entry })}\n`);
}

const server = createServer((req, res) => {
  const path = new URL(req.url ?? "/", "http://local").pathname;
  if (!providerRouteAllowedFor(KIND, req.method, path)) {
    log({ method: req.method, path, status: 403, reason: "route_not_allowed" });
    res.writeHead(403, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { type: "provider_proxy_route_denied" } }));
    return;
  }

  const chunks = [];
  let bytes = 0;
  let rejected = false;
  req.on("data", (chunk) => {
    if (rejected) return;
    bytes += chunk.length;
    if (bytes > UPSTREAM_RETRY.maxBodyBytes) {
      rejected = true;
      log({ method: req.method, path, status: 413, reason: "body_too_large" });
      res.writeHead(413, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { type: "provider_proxy_body_too_large" } }));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on("error", () => {
    if (!rejected && !res.headersSent && !res.writableEnded) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { type: "provider_proxy_request_failed" } }));
    }
  });
  req.on("end", () => {
    if (!rejected) attemptUpstream(Buffer.concat(chunks), 1);
  });

  function attemptUpstream(body, attempt) {
    if (res.destroyed) return;
    const started = Date.now();
    let responseStarted = false;
    const headers = { ...req.headers };
    for (const name of ["host", "x-api-key", "authorization", "cookie", "proxy-authorization", "transfer-encoding"]) delete headers[name];
    headers["content-length"] = String(body.length);
    Object.assign(headers, providerAuthHeaders(KIND, KEY), UPSTREAM_HEADERS);

    const upstream = transport(target, { method: ROUTE.method, headers, agent: false }, (upstreamRes) => {
      responseStarted = true;
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
      upstreamRes.on("end", () => log({ method: ROUTE.method, path, attempt, status: upstreamRes.statusCode, upstream: target.origin + target.pathname, ms: Date.now() - started }));
      upstreamRes.on("error", () => { if (!res.destroyed) res.end(); });
    });
    upstream.setTimeout(UPSTREAM_RETRY.timeoutMs, () => {
      upstream.destroy(Object.assign(new Error("upstream timeout"), { code: "UPSTREAM_TIMEOUT" }));
    });
    upstream.on("error", (error) => {
      const code = typeof error.code === "string" ? error.code : "UNKNOWN";
      const plan = retryUpstreamPlan({ attempt, errorCode: code, responseStarted });
      if (plan.retry) {
        log({ method: ROUTE.method, path, attempt, retry: true, delayMs: plan.delayMs, error: code });
        setTimeout(() => attemptUpstream(body, attempt + 1), plan.delayMs);
        return;
      }
      log({ method: ROUTE.method, path, attempt, retry: false, status: 502, error: code, reason: plan.reason });
      if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
      if (!res.writableEnded) res.end(JSON.stringify({ error: { type: "provider_proxy_upstream_failed" } }));
    });
    upstream.end(body);
  }
});

server.listen(SOCKET, () => {
  process.stdout.write(`[provider-proxy] listening on ${SOCKET} kind=${KIND} route=${ROUTE.method} ${ROUTE.path} upstream=${UPSTREAM} retry=${UPSTREAM_RETRY.maxAttempts}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => {
      try { if (existsSync(SOCKET)) unlinkSync(SOCKET); } catch { /* best effort */ }
      process.exit(0);
    });
  });
}
