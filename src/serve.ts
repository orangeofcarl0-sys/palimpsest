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
          }));
          sendJson(response, 200, { diff: canvasDiff(proposal.tasks, live) });
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
          // PLMP-GRAPH-5 §B3-A: the freshness anchor is the graph the CLIENT
          // will actually hold - digest(lift(returnedDoc)), not digest(patched).
          // CanvasDoc v2 regenerates patch-introduced edge ids on the way back
          // (bridge hotfix until CanvasDoc v3 / G9-D closes edge identity).
          const returnedDoc = unloadToCanvasDoc(patched);
          const returnedGraph = liftToAgentGraph(returnedDoc);
          sendJson(response, 200, {
            applied: true,
            doc: returnedDoc,
            preview,
            diagnostics: proposalDiagnostics,
            graphDigest: agentGraphSemanticDigest(returnedGraph),
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
