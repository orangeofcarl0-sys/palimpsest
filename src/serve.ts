/**
 * PLMP-WEB-1 §1.1: the serve channel face. A thin HTTP reader + control
 * front over the frozen VIS-1/2 and ARCH contracts - zero new orchestration
 * semantics. Positioning red line (19 §0): serve is an ADDITIVE presentation
 * face, not an orchestration daemon - the ledgers hold the truth, killing
 * serve has zero project impact, and the single-writer discipline is the
 * same as the CLI's (one front drives orchestration at a time; many
 * readers are fine).
 *
 * Security defaults: bind 127.0.0.1, random token per start. Every /api/* request passes the
 * browser-trust fence (Host/Origin/Sec-Fetch — see `isTrustedBrowserRequest`) and then needs either
 * the `Authorization: Bearer` token or the browser cookie that the root-url handoff mints; the
 * token is NEVER accepted from a query string on /api, because a query parameter needs no CORS
 * preflight and so is attachable by a malicious page. Responses carry no event ids or hashes
 * (SDS-18 extends to the HTTP face).
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseProjectProposal,
  presetDraft,
  presetMeta,
  proposalTaskSpecs,
  validateProjectProposal,
  type ProjectProposal,
} from "./architecture/index.js";
import {
  canvasCompile,
  canvasDiff,
  canvasInsertFragment,
  canvasLayout,
  canvasRoundTripDiff,
  liftToAgentGraph,
  parseCanvasDoc,
  reconcileCanvasPresentation,
  unloadToCanvasDoc,
  type CanvasLayoutName,
} from "./canvas/index.js";
import {
  agentGraphSemanticDigest,
  applyGraphPatch,
  compileAgentGraph,
  diffGraphPatch,
  parseGraphPatch,
  validateGraphPatch,
} from "./graph/index.js";
import type { StageGraphDefinition } from "./domain/index.js";
import type { AttemptAttribution, ProjectController } from "./tools/index.js";
import { definePalimpsestControl, type PalimpsestControlSurface } from "./tools/index.js";
import { handleApplicationRequest } from "./application/http.js";

const BODY_LIMIT_BYTES = 1_000_000;
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

/**
 * The package root, found by walking up from this module: dist/src/serve.js
 * (compiled CLI) and src/serve.ts (tests under tsx) both land on the same
 * root, so the default static root is dist/web in either layout.
 */
function packageRoot(modulePath: string): string {
  let dir = dirname(modulePath);
  for (;;) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return dirname(modulePath);
    dir = parent;
  }
}

const STATIC_ROOT = join(packageRoot(fileURLToPath(import.meta.url)), "dist", "web");

/**
 * The "bad port" set from the WHATWG fetch standard, which every compliant HTTP
 * client refuses to connect to (undici throws `TypeError: fetch failed` with
 * cause `bad port` before a byte is written). Node's `net` layer binds them
 * happily, so an ephemeral listener can end up unreachable. Only consulted when
 * the caller asks for an ephemeral port (`0`); an explicit port is honoured.
 */
const CLIENT_FORBIDDEN_PORTS: ReadonlySet<number> = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102,
  103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465,
  512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993,
  995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668,
  6669, 6679, 6697, 10080,
]);

export interface ServeOptions {
  /** Bind port; default 7831 (tests pass 0 for an ephemeral port). */
  readonly port?: number | undefined;
  /** Bind face; default 127.0.0.1 - widening is an explicit act. */
  readonly host?: string | undefined;
  /** Bearer token; default randomly generated per start. */
  readonly token?: string | undefined;
  /** Static panel root; default <repo>/dist/web. */
  readonly staticRoot?: string | undefined;
  /**
   * Extra authorities the browser-trust fence accepts beyond loopback and the bound face, as
   * `host` or `host:port` (`--trusted-host`). A deployment reached through a LAN name needs this;
   * nothing else does.
   */
  readonly trustedHosts?: readonly string[] | undefined;
  /**
   * G10-O (additive): the composed application surface. When supplied, namespaced typed
   * application routes are served. Absent ⇒ the legacy Work-only face is unchanged.
   */
  readonly application?: import("./application/surface.js").PalimpsestApplicationSurface | undefined;
}

export interface ServeHandle {
  readonly token: string;
  readonly port: number;
  readonly host: string;
  readonly url: string;
  /**
   * The address a HUMAN opens: the plain url with this start's token attached, which the server
   * exchanges for a browser cookie and then redirects to the clean url (see the fence note above
   * `isTrustedBrowserRequest`). Printing this is what lets a person click once instead of hunting
   * for a token; the clean `url` is what belongs in a model's context.
   */
  readonly openUrl: string;
  close(): Promise<void>;
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > BODY_LIMIT_BYTES) {
        reject(new Error("request body too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(body);
}

function sendError(response: ServerResponse, status: number, message: string): void {
  sendJson(response, status, { error: message });
}

function staticFile(response: ServerResponse, root: string, urlPath: string): boolean {
  const relative = normalize(urlPath).replace(/^([.][.][/\\])+/, "");
  const target = join(root, relative === "" || relative === "." ? "index.html" : relative);
  if (!target.startsWith(root)) return false;
  try {
    const content = readFileSync(target);
    response.writeHead(200, { "content-type": MIME[extname(target)] ?? "application/octet-stream" });
    response.end(content);
    return true;
  } catch {
    return false;
  }
}

const FALLBACK_PAGE =
  '<!doctype html><meta charset="utf-8"><title>palimpsest</title>' +
  '<body style="font-family:system-ui;max-width:40rem;margin:4rem auto;line-height:1.6">' +
  "<h1>palimpsest serve</h1><p>共享图面板尚未构建。</p>" +
  "<p><code>pnpm build:web</code> 之后重开本页；API 已可用（<code>/api/health</code>）。</p></body>";

/** Declared gate ids for this project (same source the CLI architect reads). */
function declaredGateIds(controller: ProjectController): Set<string> {
  return new Set(
    (
      controller.store.connection
        .prepare("SELECT gate_id FROM gate_registry WHERE project_id=?")
        .all(controller.projectId) as Array<{ gate_id: string }>
    ).map((row) => row.gate_id),
  );
}

/** True for the ports a WHATWG-compliant HTTP client refuses to connect to. */
export function isClientForbiddenPort(port: number): boolean {
  return CLIENT_FORBIDDEN_PORTS.has(port);
}

/* ================================================================== *
 * The browser-trust fence and the token exchange (DSH-aligned).
 *
 * A loopback HTTP API faces two confused-deputy paths that a bearer token is the wrong tool for,
 * and that this fence closes instead:
 *
 *   - DNS rebinding: the page's Host names the attacker's domain while the socket reaches this
 *     server. `Host` is the one header rebinding cannot forge, so the Host check binds EVERY
 *     request, browser-looking or not.
 *   - cross-site requests from a malicious page. `Origin` and `Sec-Fetch-Site` catch those, but
 *     only when the browser sends them: over plain HTTP a browser attaches neither to a read
 *     (image, navigation), so their absence is not evidence of a non-browser client. That is why
 *     the Host check above is unconditional and these are additional.
 *
 * Measured before this was written: the token used to be accepted from the query string on EVERY
 * route, and a query parameter needs no CORS preflight, so a malicious page could fire blind
 * writes at `/api/*` with no ability to read the reply. The `Authorization` header, by contrast,
 * cannot be set cross-origin without a preflight this server refuses. The fix is therefore not a
 * better secret: it is to stop accepting the credential where a browser can attach it for free.
 *
 * The token survives only as a HANDOFF, the way DSH does it: a person opens `/?token=…`, the
 * server mints an authority-bound HttpOnly cookie and redirects (303) to the clean url, and from
 * then on the cookie — never a url — carries the browser's proof. So the token appears once, in a
 * link a human clicks, and never in an API request.
 * ================================================================== */

/** Parse a `Host` header into its canonical authority, or undefined when it is unusable. */
function authorityOf(hostHeader: string | undefined): string | undefined {
  if (hostHeader === undefined || hostHeader === "") return undefined;
  try {
    return new URL(`http://${hostHeader}`).host;
  } catch {
    return undefined;
  }
}

/** Whether an authority's hostname names the local loopback face (127/8, localhost, [::1]). */
function isLoopbackAuthority(authority: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(`http://${authority}`).hostname;
  } catch {
    return false;
  }
  if (hostname === "localhost" || hostname === "[::1]") return true;
  const parts = hostname.split(".");
  return (
    parts.length === 4 &&
    parts[0] === "127" &&
    parts.every((part) => /^\d{1,3}$/u.test(part) && Number(part) <= 255)
  );
}

/** Whether the Host is one this deployment serves: loopback, the bound face, or a declared trust. */
function isOurAuthority(authority: string, boundAuthority: string, trustedHosts: readonly string[]): boolean {
  if (isLoopbackAuthority(authority)) return true;
  if (authority === boundAuthority) return true;
  return trustedHosts.some((entry) => entry === authority || entry === authority.split(":")[0]);
}

/**
 * Whether one request may reach the API at all, before any question of credentials.
 *
 * Deliberately separate from authentication: this answers "is this request shape one a browser
 * could have been tricked into sending", and a refusal here is 403, not 401 — a caller that fails
 * this is not under-authenticated, it is not talking to us.
 */
export function isTrustedBrowserRequest(
  headers: Readonly<Record<string, string | string[] | undefined>>,
  boundAuthority: string,
  trustedHosts: readonly string[] = [],
): boolean {
  const first = (name: string): string | undefined => {
    const value = headers[name];
    return typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
  };
  const authority = authorityOf(first("host"));
  if (authority === undefined) return false;
  if (!isOurAuthority(authority, boundAuthority, trustedHosts)) return false;
  if (first("sec-fetch-site") === "cross-site") return false;
  const origin = first("origin");
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === authority;
  } catch {
    return false;
  }
}

const COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60;
const COOKIE_PREFIX = "palimpsest-auth-";

/** Constant-time comparison, so a wrong token cannot be narrowed down by timing. */
function secretMatches(actual: string, expected: string): boolean {
  const left = Buffer.from(actual, "utf8");
  const right = Buffer.from(expected, "utf8");
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

/**
 * The cookie name is derived from the authority it was minted for, so a cookie obtained at one
 * authority is not presented at another. `SameSite=Strict` and `HttpOnly` keep it out of reach of
 * scripts and cross-site navigations.
 */
function cookieName(authority: string): string {
  return `${COOKIE_PREFIX}${createHash("sha256").update(authority).digest("hex").slice(0, 16)}`;
}

function cookieValueOf(cookieHeader: string | undefined, name: string): string | undefined {
  if (cookieHeader === undefined) return undefined;
  for (const segment of cookieHeader.split(";")) {
    const at = segment.indexOf("=");
    if (at === -1) continue;
    if (segment.slice(0, at).trim() === name) return segment.slice(at + 1).trim();
  }
  return undefined;
}

/** Sign the (authority, window) pair; the payload is readable, so the signature is the whole gate. */
function signCookie(payload: string, secret: Buffer): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function encodeCookie(authority: string, issuedAt: number, expiresAt: number, secret: Buffer): string {
  const payload = Buffer.from(JSON.stringify({ version: 1, authority, issuedAt, expiresAt }), "utf8").toString("base64url");
  return `v1.${payload}.${signCookie(payload, secret)}`;
}

function decodeCookie(value: string, authority: string, secret: Buffer, now: number): boolean {
  const parts = value.split(".");
  const [version, payload, signature] = parts;
  if (parts.length !== 3 || version !== "v1" || payload === undefined || signature === undefined) return false;
  if (!secretMatches(signature, signCookie(payload, secret))) return false;
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return false;
  }
  if (typeof decoded !== "object" || decoded === null) return false;
  const record = decoded as Record<string, unknown>;
  if (record["version"] !== 1 || record["authority"] !== authority) return false;
  const issuedAt = record["issuedAt"];
  const expiresAt = record["expiresAt"];
  if (typeof issuedAt !== "number" || typeof expiresAt !== "number") return false;
  return issuedAt <= now && expiresAt > now && expiresAt - issuedAt <= COOKIE_MAX_AGE_SECONDS * 1000;
}

export function serveOrchestration(
  controller: ProjectController,
  options: ServeOptions = {},
): Promise<ServeHandle> {
  const token = options.token ?? randomBytes(24).toString("base64url");
  const root = options.staticRoot ?? STATIC_ROOT;
  /* Per start, like the token: a cookie is only ever valid for the process that minted it. */
  const cookieSecret = randomBytes(32);
  const trustedHosts = options.trustedHosts ?? [];
  /* The authority this deployment answers as, known only once the port is settled (a caller may
     ask for port 0). Requests cannot arrive before `listen` completes, so reading it per request
     is exact rather than merely early. */
  let boundAuthority = "";
  const surface: PalimpsestControlSurface = definePalimpsestControl(controller);

  const control = (
    op: string,
    body: Record<string, unknown>,
  ): Promise<unknown> | unknown => {
    switch (op) {
      case "pause":
        return surface.pause(String(body.reason ?? "paused from the panel"));
      case "resume":
        return surface.resume(String(body.reason ?? "resumed from the panel"));
      case "next":
        return surface.next();
      case "run":
        return surface.run(body.maxSteps === undefined ? undefined : Number(body.maxSteps));
      case "claim": {
        const attribution =
          body.attribution === undefined || body.attribution === null
            ? undefined
            : (body.attribution as AttemptAttribution);
        return surface.claim(
          body.attemptId === undefined ? undefined : String(body.attemptId),
          attribution,
        );
      }
      case "gate":
        return surface.gate({
          attemptId: String(body.attemptId),
          predicate: body.predicate as "tests_pass",
          command: (body.command as string[]) ?? ["python", "-m", "pytest"],
          exitCode: Number(body.exitCode ?? 0),
        });
      case "report":
        return surface.report(String(body.attemptId), {
          workerStatus: body.workerStatus as "completed",
          summary: String(body.summary ?? "reported"),
          ...(body.resultCommit === undefined ? {} : { resultCommit: String(body.resultCommit) }),
        });
      case "plan":
        return surface.plan(body as never);
      case "promote":
        return surface.promote(String(body.gateId));
      case "holdSet":
        return surface.holdSet(String(body.taskId), String(body.reason ?? "断点"));
      case "holdClear":
        return surface.holdClear(String(body.taskId), String(body.reason ?? "放行"));
      default:
        throw new Error(`unknown control op: ${op}`);
    }
  };

  const server: Server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://localhost");
      const path = url.pathname;
      const authority = authorityOf(request.headers.host) ?? "";
      const cookieNameHere = cookieName(authority);
      const cookieOk =
        authority !== "" &&
        decodeCookie(cookieValueOf(request.headers.cookie, cookieNameHere) ?? "", authority, cookieSecret, Date.now());
      const authorized =
        secretMatches(request.headers.authorization ?? "", `Bearer ${token}`) || cookieOk;

      /* The fence binds every request, before any question of credentials (§ above). */
      if (!isTrustedBrowserRequest(request.headers, boundAuthority, trustedHosts)) {
        sendError(response, 403, "请求的 Host/Origin 不属于本部署");
        return;
      }

      /* The token handoff: `GET /?token=…` mints the cookie and leaves. Accepted only here, on the
         root, exactly once — never on /api, which is what closed the blind-write path. */
      const handedTokens = url.searchParams.getAll("token");
      if (request.method === "GET" && path === "/" && handedTokens.length > 0) {
        if (handedTokens.length !== 1 || !secretMatches(handedTokens.join(""), token)) {
          sendError(response, 401, "需要访问令牌");
          return;
        }
        const issuedAt = Date.now();
        const expiresAt = issuedAt + COOKIE_MAX_AGE_SECONDS * 1000;
        response.writeHead(303, {
          "cache-control": "no-store",
          // The token is in the url that produced this redirect; keep it out of any Referer.
          "referrer-policy": "no-referrer",
          location: "/",
          "set-cookie": `${cookieNameHere}=${encodeCookie(authority, issuedAt, expiresAt, cookieSecret)}; Max-Age=${String(COOKIE_MAX_AGE_SECONDS)}; Path=/; HttpOnly; SameSite=Strict`,
        });
        response.end();
        return;
      }

      if (request.method === "GET" && (path === "/" || !path.startsWith("/api/"))) {
        if (!staticFile(response, root, path === "/" ? "index.html" : path)) {
          response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          response.end(FALLBACK_PAGE);
        }
        return;
      }
      if (path.startsWith("/api/") && !authorized) {
        sendError(response, 401, "需要访问令牌");
        return;
      }
      try {
        // G10-O: namespaced typed application routes (never a generic method tunnel). The
        // bearer token only admits the request to the server — it is never semantic authority.
        if (options.application !== undefined && path.startsWith("/api/")) {
          const rawBody = request.method === "POST" || request.method === "PUT" || request.method === "PATCH" ? await readBody(request) : "";
          let parsedBody: unknown;
          if (rawBody !== "") {
            try {
              parsedBody = JSON.parse(rawBody);
            } catch {
              parsedBody = undefined;
            }
          }
          const applicationResult = await handleApplicationRequest({
            application: options.application,
            method: request.method ?? "GET",
            pathname: path,
            query: url.searchParams,
            body: parsedBody,
          });
          if (applicationResult !== undefined) {
            sendJson(response, applicationResult.status, applicationResult.body);
            return;
          }
        }
        if (request.method === "GET" && path === "/api/health") {
          // Spec 35 HEALTH-INV-1: ServiceHealth ≠ ProjectInitialized - cheap
          // state only, never a graph build; an empty store is still healthy.
          sendJson(response, 200, controller.serviceHealth());
          return;
        }
        if (request.method === "GET" && path === "/api/graph") {
          // Spec 35 (VIEW-INV-1/4), G9-F2 VIEW-INV-6: EventCursor ≠ ViewCursor
          // and the viewCursor verdict DOMINATES. A matching viewCursor proves
          // the COMPLETE projection unchanged and skips the graph build; a
          // non-matching viewCursor returns the graph with changed=true even
          // when the legacy numeric cursor happens to be current - the mixed
          // request must never answer "graph + changed:false". The legacy
          // ?cursor= (event id) keeps its exact semantics on its own.
          const viewCursorParam = url.searchParams.get("viewCursor");
          if (viewCursorParam !== null) {
            if (viewCursorParam === controller.viewCursor()) {
              sendJson(response, 200, { changed: false, viewCursor: controller.viewCursor() });
            } else {
              const graph = controller.orchestrationGraph();
              sendJson(response, 200, {
                graph,
                changed: true,
                viewCursor: controller.viewCursor(),
              });
            }
            return;
          }
          const graph = controller.orchestrationGraph();
          const cursorParam = url.searchParams.get("cursor");
          sendJson(response, 200, {
            graph,
            changed: cursorParam === null || Number(cursorParam) !== graph.project.cursor,
            viewCursor: controller.viewCursor(),
          });
          return;
        }
        if (request.method === "GET" && path === "/api/presets") {
          sendJson(response, 200, { presets: presetMeta() });
          return;
        }
        if (request.method === "POST" && path.startsWith("/api/control/")) {
          const op = path.slice("/api/control/".length);
          const body = JSON.parse((await readBody(request)) || "{}") as Record<string, unknown>;
          sendJson(response, 200, { result: await control(op, body) });
          return;
        }
        if (request.method === "POST" && path.startsWith("/api/preset/") && path.endsWith("/draft")) {
          const id = path.slice("/api/preset/".length, -"/draft".length);
          const params = (JSON.parse((await readBody(request)) || "{}") ?? {}) as Record<string, unknown>;
          sendJson(response, 200, { proposal: presetDraft(id, params) });
          return;
        }
        if (request.method === "POST" && path === "/api/proposal/validate") {
          // PLMP-GRAPH-5 §B2-B: strict input contract before semantic checks.
          const proposal = parseProjectProposal(JSON.parse(await readBody(request)));
          sendJson(response, 200, {
            diagnostics: validateProjectProposal(proposal, { knownGateIds: declaredGateIds(controller) }),
          });
          return;
        }
        // PLMP-CANVAS: pure derivations over the canvas doc - compile to the
        // existing proposal face, diff against the live projection, layout
        // (positions only), fragment insert, runtime/trace derivation.
        // None of these write; the ledger stays the only server-side truth.
        if (request.method === "POST" && path === "/api/canvas/compile") {
          const body = JSON.parse((await readBody(request)) || "{}") as Record<string, unknown>;
          const doc = parseCanvasDoc(body["doc"]);
          const proposal = canvasCompile(doc, {
            ...(typeof body["goal"] === "string" ? { goal: body["goal"] } : {}),
          });
          sendJson(response, 200, {
            proposal,
            diagnostics: validateProjectProposal(proposal, { knownGateIds: declaredGateIds(controller) }),
            // PLMP-GRAPH-5 §B2-A: the authoring freshness anchor for patches
            // built against this draft.
            graphDigest: agentGraphSemanticDigest(liftToAgentGraph(doc)),
          });
          return;
        }
        if (request.method === "POST" && path === "/api/canvas/diff") {
          const body = JSON.parse((await readBody(request)) || "{}") as Record<string, unknown>;
          const proposal =
            body["doc"] === undefined
              ? parseProjectProposal(body["proposal"])
              : canvasCompile(parseCanvasDoc(body["doc"]));
          const graph = controller.orchestrationGraph();
          const titleById = new Map(graph.tasks.map((task) => [task.taskId, task.objective]));
          const live = graph.tasks.map((task) => ({
            objective: task.objective,
            dependsOn: task.dependsOn.map((id) => titleById.get(id) ?? id),
            writePaths: task.writePaths,
            requiredArtifacts: task.requiredArtifacts,
            role: task.role,
            // PLMP-CANVAS-7 D7: identity matching needs the live lineage ids.
            ...(task.definitionId === undefined ? {} : { definitionId: task.definitionId }),
            ...(task.scopeId === undefined ? {} : { scopeId: task.scopeId }),
            // 32 号 §12: skill hints are declared Work payload - diffable.
            ...(task.suggestedSkills === undefined ? {} : { suggestedSkills: task.suggestedSkills }),
          }));
          sendJson(response, 200, { diff: canvasDiff(proposal.tasks, live) });
          return;
        }
        // PLMP-CANVAS-7 D8: the compile-independent Work-authoring anchor.
        // Only parse → lift → semantic digest → live revision, from ONE
        // server observation (atomic revision+digest, no client-side race
        // window). It deliberately does NOT compile or capability-check:
        // authoring-valid but runtime-invalid graphs (e.g. data cycles) are
        // exactly where AI patching is most valuable and must keep lost-
        // update protection. UAS-D-INV-2: this anchors the current Work
        // authoring graph - it is not a future architecture anchor.
        if (request.method === "POST" && path === "/api/canvas/anchor") {
          const body = JSON.parse((await readBody(request)) || "{}") as Record<string, unknown>;
          const doc = parseCanvasDoc(body["doc"]);
          const graph = liftToAgentGraph(doc);
          sendJson(response, 200, {
            baseRevision: controller.orchestrationGraph().project.revision,
            baseGraphDigest: agentGraphSemanticDigest(graph),
          });
          return;
        }
        if (request.method === "POST" && path === "/api/canvas/layout") {
          const body = JSON.parse((await readBody(request)) || "{}") as Record<string, unknown>;
          const doc = parseCanvasDoc(body["doc"]);
          sendJson(response, 200, { doc: canvasLayout(doc, body["layout"] as CanvasLayoutName) });
          return;
        }
        if (request.method === "POST" && path === "/api/canvas/insert") {
          const body = JSON.parse((await readBody(request)) || "{}") as Record<string, unknown>;
          const doc = parseCanvasDoc(body["doc"]);
          const proposal = parseProjectProposal(body["proposal"]);
          sendJson(response, 200, { doc: canvasInsertFragment(doc, proposal) });
          return;
        }
        // PLMP-GRAPH-2: the patch review face - validate against the live
        // revision, preview in plain language, apply to the DRAFT doc. Pure
        // derivation, zero writes; declaration still rides start/plan.
        // PLMP-GRAPH-5 (31 号): the patch is a fail-closed input protocol
        // (strict parse) and the apply gate refuses lossy canvas conversion.
        if (request.method === "POST" && path === "/api/canvas/patch") {
          const body = JSON.parse((await readBody(request)) || "{}") as Record<string, unknown>;
          const doc = parseCanvasDoc(body["doc"]);
          const patch = parseGraphPatch(body["patch"]);
          const graph = liftToAgentGraph(doc);
          const liveRevision = controller.orchestrationGraph().project.revision;
          const diagnostics = validateGraphPatch(graph, patch, { liveRevision });
          const preview = diffGraphPatch(graph, patch);
          if (diagnostics.length > 0) {
            sendJson(response, 200, {
              applied: false,
              diagnostics,
              preview,
              // The current draft's anchor so a stale patch can be re-based.
              graphDigest: agentGraphSemanticDigest(graph),
            });
            return;
          }
          const patched = applyGraphPatch(graph, patch);
          // PLMP-GRAPH-5 §4: apply-to-canvas is allowed iff the canvas can
          // faithfully round-trip the patched graph. No Tool degrades into an
          // anonymous annotation, no message edge evaporates.
          const losses = canvasRoundTripDiff(patched);
          if (losses.length > 0) {
            sendJson(response, 200, {
              applied: false,
              diagnostics: [{ type: "UNREPRESENTABLE_IN_CANVAS", detail: losses.join("; ") }],
              preview,
              graphDigest: agentGraphSemanticDigest(graph),
            });
            return;
          }
          let proposalDiagnostics: ReturnType<typeof validateProjectProposal> = [];
          let compileError: string | null = null;
          try {
            const proposal = compileAgentGraph(patched);
            proposalDiagnostics = validateProjectProposal(proposal, {
              knownGateIds: declaredGateIds(controller),
            });
          } catch (error) {
            compileError = error instanceof Error ? error.message : String(error);
          }
          // PLMP-CANVAS-7 (32 号 §3.10): with stable edge identity the strong
          // invariant lift(unload(g)) === g holds again - the G9-B3 bridge
          // (digesting the RELIFTED doc) is retired. The submitted draft's
          // identity state rides through so patch round-trips never rewind
          // the monotonic counters.
          // PLMP-CANVAS-8 (33 号): presentation reconciliation - surviving
          // nodes keep their x/y and VisualGroups survive; the semantic
          // result owns identity/semantics verbatim. lift(reconciled) still
          // equals `patched` strictly (CANVAS-H08).
          const semanticCanvas = unloadToCanvasDoc(patched, { identity: doc.identity });
          const returnedDoc = reconcileCanvasPresentation(doc, semanticCanvas);
          sendJson(response, 200, {
            applied: true,
            doc: returnedDoc,
            preview,
            diagnostics: proposalDiagnostics,
            graphDigest: agentGraphSemanticDigest(patched),
            ...(compileError === null ? {} : { compileError }),
          });
          return;
        }
        if (request.method === "POST" && path === "/api/proposal/declare") {
          // PLMP-SCHED-1: the request is {proposal, stageGraph?} - the optional
          // declared stage graph applies on the start branch only.
          // PLMP-GRAPH-5 §B2-B: strict input contract before semantic checks.
          const body = JSON.parse(await readBody(request)) as {
            proposal: unknown;
            stageGraph?: StageGraphDefinition;
          };
          const proposal = parseProjectProposal(body.proposal);
          const diagnostics = validateProjectProposal(proposal, { knownGateIds: declaredGateIds(controller) });
          if (diagnostics.length > 0) {
            sendJson(response, 200, { diagnostics, declared: false });
            return;
          }
          // G9-F2 HEALTH-INV-2 / G9-G §5: started-ness is the single scoped
          // read-side helper - a sibling project's control row in a shared
          // store must not route this declaration into plan() instead of start().
          const started = controller.isProjectInitialized();
          const tasks = proposalTaskSpecs(proposal);
          const event = started
            ? controller.plan({
                tasks,
                changeClass: proposal.changeClass,
                changedIds: tasks.map((task) => task.task_id),
              })
            : controller.start({
                projectId: controller.projectId,
                goal: proposal.goal,
                tasks,
                // PLMP-SCHED-1: optional declared stage graph on genesis
                // (e.g. latch concurrency); parse failure fails the request.
                ...(body.stageGraph === undefined ? {} : { stageGraph: body.stageGraph }),
              });
          sendJson(response, 200, { diagnostics: [], declared: true, eventType: event.event_type });
          return;
        }
        sendError(response, 404, "unknown endpoint");
      } catch (error) {
        sendError(response, 400, error instanceof Error ? error.message : String(error));
      }
    })();
  });

  return new Promise((resolve) => {
    const requestedPort = options.port ?? 7831;
    const host = options.host ?? "127.0.0.1";
    let retries = 0;

    const listenOnce = (): void => {
      server.listen(requestedPort, host, () => {
        const address = server.address();
        const port = typeof address === "object" && address !== null ? address.port : requestedPort;
        // G10-AE gate finding: with an ephemeral port the OS chooses from the
        // machine's dynamic range, which on Windows is configurable and on this
        // host is 1024-15000 - wide enough to hand out a port that WHATWG-compliant
        // HTTP clients refuse to CONNECT to at all (`fetch` fails with "bad port"
        // before any request is sent, exactly as if the server were down). Retrying
        // the bind keeps an ephemeral server reachable instead of intermittently
        // invisible. An explicitly requested port is never second-guessed: a caller
        // who asks for 6667 gets 6667 or an error.
        if (requestedPort === 0 && CLIENT_FORBIDDEN_PORTS.has(port) && retries < 8) {
          retries += 1;
          server.close(() => listenOnce());
          return;
        }
        boundAuthority = `${host}:${String(port)}`;
        resolve({
          token,
          port,
          host,
          url: `http://${host}:${port}`,
          openUrl: `http://${host}:${port}/?token=${encodeURIComponent(token)}`,
          close: () =>
            new Promise((resolveClose, rejectClose) => {
              server.close((error) => (error === undefined ? resolveClose() : rejectClose(error)));
              server.closeAllConnections();
            }),
        });
      });
    };

    listenOnce();
  });
}

/** Recursively list files under the static root (used by the WEB-A06 check). */
export function staticBundleFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (statSync(full).isFile()) out.push(full);
    }
  };
  walk(root);
  return out;
}
