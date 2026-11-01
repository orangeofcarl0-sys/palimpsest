/**
 * C6-R2 — provider-only egress proxy.
 *
 * It runs OUTSIDE the model's sandbox, holds the only real credential, and forwards exactly one
 * route (`POST /v1/messages`) to the configured upstream. Everything else is refused. The model's
 * sandbox has no network namespace of its own except a loopback bridge to this Unix socket, so it
 * cannot fetch a public repository, a search engine, or any other host.
 *
 * The key is read from a credential file (default: the owner's DSH credential store) or from
 * C6R_REAL_KEY for a mock qualification. It is never logged and never enters the sandbox.
 */
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { providerRouteAllowed } from "./egress_policy.mjs";

const SOCKET = process.env.C6R_PROXY_SOCKET;
const UPSTREAM = process.env.C6R_UPSTREAM ?? "https://api.deepseek.com/anthropic";
const LOG = process.env.C6R_PROXY_LOG ?? "";
const CREDENTIAL_FILE = process.env.C6R_CREDENTIAL_FILE ?? "";
const ENV_KEY = process.env.C6R_REAL_KEY ?? "";

if (SOCKET === undefined || SOCKET === "") {
  process.stderr.write("[provider-proxy] C6R_PROXY_SOCKET is required\n");
  process.exit(2);
}

function readKey() {
  if (ENV_KEY !== "") return ENV_KEY;
  if (CREDENTIAL_FILE === "" || !existsSync(CREDENTIAL_FILE)) return null;
  const text = readFileSync(CREDENTIAL_FILE, "utf8");
  const match = text.match(/^\s{2}DEEPSEEK_API_KEY:\s*(\S+)\s*$/m) ?? text.match(/DEEPSEEK_API_KEY\s*[:=]\s*(\S+)/);
  return match === null ? null : match[1];
}

const KEY = readKey();
if (KEY === null) {
  process.stderr.write("[provider-proxy] no provider credential is available\n");
  process.exit(3);
}

const upstreamRoot = new URL(UPSTREAM);
const transport = upstreamRoot.protocol === "https:" ? httpsRequest : httpRequest;

mkdirSync(dirname(SOCKET), { recursive: true });
if (existsSync(SOCKET)) unlinkSync(SOCKET);

function log(entry) {
  if (LOG === "") return;
  appendFileSync(LOG, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}

const server = createServer((req, res) => {
  const started = Date.now();
  const path = new URL(req.url ?? "/", "http://local").pathname;
  if (!providerRouteAllowed(req.method, path)) {
    log({ method: req.method, path, status: 403, reason: "route_not_allowed" });
    res.writeHead(403, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { type: "provider_proxy_route_denied" } }));
    return;
  }

  const headers = { ...req.headers };
  for (const name of ["host", "x-api-key", "authorization", "cookie", "proxy-authorization"]) delete headers[name];
  headers["x-api-key"] = KEY;

  const target = new URL(`${upstreamRoot.pathname.replace(/\/$/u, "")}${path}`, upstreamRoot);
  const upstream = transport(
    target,
    { method: "POST", headers },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
      upstreamRes.on("end", () => log({ method: "POST", path, status: upstreamRes.statusCode, upstream: target.origin + target.pathname, ms: Date.now() - started }));
    },
  );
  upstream.on("error", (error) => {
    log({ method: "POST", path, status: 502, error: String(error.message ?? error) });
    if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { type: "provider_proxy_upstream_failed" } }));
  });
  req.pipe(upstream);
});

server.listen(SOCKET, () => {
  process.stdout.write(`[provider-proxy] listening on ${SOCKET} upstream=${UPSTREAM} route=POST /v1/messages\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => {
      try { if (existsSync(SOCKET)) unlinkSync(SOCKET); } catch { /* best effort */ }
      process.exit(0);
    });
  });
}
