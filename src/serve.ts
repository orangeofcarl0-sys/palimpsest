/**
 * PLMP-WEB-1 §1.1: the serve channel face. A thin HTTP reader + control
 * front over the frozen VIS-1/2 and ARCH contracts - zero new orchestration
 * semantics. Positioning red line (19 §0): serve is an ADDITIVE presentation
 * face, not an orchestration daemon - the ledgers hold the truth, killing
 * serve has zero project impact, and the single-writer discipline is the
 * same as the CLI's (one front drives orchestration at a time; many
 * readers are fine).
 *
 * Security defaults: bind 127.0.0.1, random bearer token per start (printed
 * once); --host explicitly widens the bind face. Every /api/* request
 * requires the token. Responses carry no event ids or hashes (SDS-18
 * extends to the HTTP face).
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import {
  proposalTaskSpecs,
  validateProjectProposal,
  type ProjectProposal,
} from "./architecture/index.js";
import type { AttemptAttribution, ProjectController } from "./tools/index.js";
import { definePalimpsestControl, type PalimpsestControlSurface } from "./tools/index.js";

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

export interface ServeOptions {
  /** Bind port; default 7831 (tests pass 0 for an ephemeral port). */
  readonly port?: number | undefined;
  /** Bind face; default 127.0.0.1 - widening is an explicit act. */
  readonly host?: string | undefined;
  /** Bearer token; default randomly generated per start. */
  readonly token?: string | undefined;
  /** Static panel root; default <repo>/dist/web. */
  readonly staticRoot?: string | undefined;
}

export interface ServeHandle {
  readonly token: string;
  readonly port: number;
  readonly host: string;
  readonly url: string;
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

export function serveOrchestration(
  controller: ProjectController,
  options: ServeOptions = {},
): Promise<ServeHandle> {
  const token = options.token ?? randomBytes(24).toString("base64url");
  const root = options.staticRoot ?? STATIC_ROOT;
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
      default:
        throw new Error(`unknown control op: ${op}`);
    }
  };

  const server: Server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://localhost");
      const path = url.pathname;
      const authorized =
        request.headers.authorization === `Bearer ${token}` ||
        url.searchParams.get("token") === token;

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
        if (request.method === "GET" && path === "/api/health") {
          sendJson(response, 200, { ok: true, cursor: controller.orchestrationGraph().project.cursor });
          return;
        }
        if (request.method === "GET" && path === "/api/graph") {
          const graph = controller.orchestrationGraph();
          const cursorParam = url.searchParams.get("cursor");
          sendJson(response, 200, {
            graph,
            changed: cursorParam === null || Number(cursorParam) !== graph.project.cursor,
          });
          return;
        }
        if (request.method === "POST" && path.startsWith("/api/control/")) {
          const op = path.slice("/api/control/".length);
          const body = JSON.parse((await readBody(request)) || "{}") as Record<string, unknown>;
          sendJson(response, 200, { result: await control(op, body) });
          return;
        }
        if (request.method === "POST" && path === "/api/proposal/validate") {
          const proposal = JSON.parse(await readBody(request)) as ProjectProposal;
          sendJson(response, 200, { diagnostics: validateProjectProposal(proposal) });
          return;
        }
        if (request.method === "POST" && path === "/api/proposal/declare") {
          const proposal = JSON.parse(await readBody(request)) as ProjectProposal;
          const diagnostics = validateProjectProposal(proposal);
          if (diagnostics.length > 0) {
            sendJson(response, 200, { diagnostics, declared: false });
            return;
          }
          const started =
            controller.store.connection
              .prepare("SELECT 1 AS ok FROM scheduler_control LIMIT 1")
              .get() !== undefined;
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
    server.listen(options.port ?? 7831, options.host ?? "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : options.port ?? 7831;
      const host = options.host ?? "127.0.0.1";
      resolve({
        token,
        port,
        host,
        url: `http://${host}:${port}`,
        close: () =>
          new Promise((resolveClose, rejectClose) => {
            server.close((error) => (error === undefined ? resolveClose() : rejectClose(error)));
            server.closeAllConnections();
          }),
      });
    });
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
