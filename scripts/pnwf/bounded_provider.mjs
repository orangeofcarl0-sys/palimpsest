/** The local Mock is the only provider qualified for a hard request bound.
 * The separately selected usage-only path records real terminal usage without claiming a bound.
 */
import { createServer, request } from "node:http";
import { request as httpsRequest } from "node:https";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { BudgetRefusal, tokens, usageBreakdown, usageTotal } from "./execution_budget.mjs";

export const MOCK_KIND = "pnwf-deterministic-mock/v1";
export const MOCK_ROUTE = "/pnwf-mock/v1/messages";
export const MAX_BODY = 2 * 1024 * 1024;
export const PAID_MODE = "paid-usage-only";
export const PAID_COHORT_SCHEMA = "pnwf-metered-continuation-cohort/v1";
export const DEEPSEEK_MESSAGES = "https://api.deepseek.com/anthropic/v1/messages";
export const DEEPSEEK_MODEL = "deepseek-flash";
export function mockProof(secret, challenge, instanceId) {
  return createHmac("sha256", secret).update(`${challenge}\0${instanceId}`).digest("hex");
}
function mockEndpoint(config) {
  if (config?.kind !== MOCK_KIND) throw new BudgetRefusal("PROVIDER_BOUND_UNQUALIFIED", "only the local Mock qualifies for bounded execution");
  const url = new URL(config.url);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.username || url.password || url.pathname !== "/") throw new BudgetRefusal("MOCK_ENDPOINT_REQUIRED");
  if (typeof config.secret !== "string" || config.secret.length < 32 || typeof config.instanceId !== "string") throw new BudgetRefusal("MOCK_IDENTITY_REQUIRED");
  return url;
}
export async function verifyMock(config) {
  const url = mockEndpoint(config);
  const challenge = randomUUID();
  const target = new URL(`/.well-known/pnwf-mock?challenge=${challenge}`, url);
  const probe = () => fetch(target, { redirect: "error", signal: AbortSignal.timeout(3000), headers: { connection: "close" } });
  let response;
  try { response = await probe(); }
  catch (error) {
    // Retry a local identity probe on a dead socket. The challenge and loopback endpoint are unchanged.
    if (!["ECONNREFUSED", "ECONNRESET", "UND_ERR_SOCKET"].includes(error.cause?.code)) throw error;
    response = await probe();
  }
  const reply = await response.json();
  const expected = Buffer.from(mockProof(config.secret, challenge, config.instanceId));
  const actual = Buffer.from(String(reply.proof ?? ""));
  if (!response.ok || reply.kind !== MOCK_KIND || reply.instanceId !== config.instanceId || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new BudgetRefusal("MOCK_IDENTITY_MISMATCH");
  return url;
}
export function requestBound(body) {
  const parsed = JSON.parse(body.toString("utf8"));
  tokens(parsed.max_tokens, "max_tokens", false);
  // This exact synthetic tokenizer and output constraint are enforced by mock_provider.mjs.
  const bound = body.length + parsed.max_tokens;
  tokens(bound, "input bytes + maximum synthetic output", false);
  return bound;
}
export function finalUsage(usage) {
  return usageTotal(usageBreakdown(usage));
}
export class UsageReader {
  constructor(stream) { this.stream = stream; this.decoder = new TextDecoder(); this.buffer = ""; this.final = null; this.stopped = false; this.messageId = null; }
  push(chunk) {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    if (!this.stream) return;
    const frames = this.buffer.split(/\r?\n\r?\n/u);
    this.buffer = frames.pop();
    for (const frame of frames) {
      const data = frame.split(/\r?\n/u).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
      if (!data) continue;
      const event = JSON.parse(data);
      if (event.error || event.type === "error") throw new BudgetRefusal("PROVIDER_ERROR");
      if (event.type === "message_start" && typeof event.message?.id === "string") this.messageId = event.message.id;
      if (event.type === "message_delta" && event.usage !== undefined) {
        const usage = usageBreakdown(event.usage);
        if (this.final !== null && JSON.stringify(this.final) !== JSON.stringify(usage)) throw new BudgetRefusal("CONFLICTING_USAGE");
        this.final = usage;
      }
      if (event.type === "message_stop") this.stopped = true;
    }
  }
  end() {
    this.buffer += this.decoder.decode();
    if (!this.stream) {
      const response = JSON.parse(this.buffer);
      this.final = usageBreakdown(response.usage);
      this.messageId = typeof response.id === "string" ? response.id : null;
    }
    else if (!this.stopped || this.final === null || this.buffer.trim() !== "") throw new BudgetRefusal("UNOBSERVABLE_USAGE");
    return usageTotal(this.final);
  }
}
export async function startBoundedProxy({ provider, budget, sessionId, sessionKey, port = 0, timeoutMs = 10000, onObservation }) {
  const upstream = await verifyMock(provider);
  if (budget.usageOnly) throw new BudgetRefusal("BOUNDED_LEDGER_REQUIRED");
  return startMessagesProxy({ budget, sessionId, sessionKey, port, timeoutMs, onObservation, target: new URL(MOCK_ROUTE, upstream),
    headers: { "x-pnwf-mock-secret": provider.secret, "x-pnwf-mock-instance": provider.instanceId },
    requestAdmission: async body => { await verifyMock(provider); return requestBound(body); } });
}

export function paidRequestAdmission(body) {
  const input = JSON.parse(body.toString("utf8"));
  if (input?.model !== DEEPSEEK_MODEL || !Array.isArray(input.messages)) throw new BudgetRefusal("PAID_MODEL_OR_MESSAGES_DENIED");
  if (input.mcp_servers !== undefined || (input.tools !== undefined && (!Array.isArray(input.tools) ||
      input.tools.some(tool => !tool?.input_schema || (tool.type !== undefined && tool.type !== "custom"))))) {
    throw new BudgetRefusal("PROVIDER_SIDE_TOOL_DENIED");
  }
  return null; // No billing reservation: the ledger still persists a pending request before forwarding.
}

export function readDeepSeekKey(credentialFile = process.env.PNWF_DEEPSEEK_CREDENTIAL_FILE || join(homedir(), ".dsh", ".credentials.yaml")) {
  let key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    try { key = /^ {2}DEEPSEEK_API_KEY:[ \t]*(['"]?)([^\s'"#]+)\1[ \t]*$/mu.exec(readFileSync(credentialFile, "utf8"))?.[2]; }
    catch { /* report only the missing credential, never store contents */ }
  }
  if (typeof key !== "string" || !/^[\w.-]{16,512}$/u.test(key)) throw new BudgetRefusal("DEEPSEEK_CREDENTIAL_REQUIRED");
  return key;
}

export async function startPaidProxy({ budget, sessionId, sessionKey, timeoutMs = 240000, onObservation }) {
  if (!budget.usageOnly) throw new BudgetRefusal("USAGE_ONLY_LEDGER_REQUIRED");
  return startMessagesProxy({ budget, sessionId, sessionKey, timeoutMs, onObservation, target: new URL(DEEPSEEK_MESSAGES),
    headers: { "x-api-key": readDeepSeekKey(), "accept-encoding": "identity" }, requestAdmission: paidRequestAdmission });
}

/** Trusted host composition only. The principal never supplies a destination or upstream headers. */
export async function startMessagesProxy({ budget, sessionId, sessionKey, target, headers, requestAdmission, port = 0, timeoutMs = 10000, onObservation }) {
  if (typeof sessionKey !== "string" || sessionKey.length < 32) throw new BudgetRefusal("SESSION_KEY_REQUIRED");
  const transport = target.protocol === "https:" ? httpsRequest : request;
  const sockets = new Set();
  let fatalReason = null;
  const server = createServer(async (req, res) => {
    const reject = (status, code) => {
      if (!res.headersSent) res.writeHead(status, { "content-type": "application/json" });
      if (!res.destroyed) res.end(JSON.stringify({ error: { type: code } }));
    };
    if (req.method !== "POST" || !["/v1/messages", "/messages"].includes(req.url)) return reject(403, "ROUTE_DENIED");
    const key = req.headers["x-api-key"] ?? String(req.headers.authorization ?? "").replace(/^Bearer /u, "");
    if (key !== sessionKey) return reject(403, "SESSION_IDENTITY_MISMATCH");
    if (fatalReason !== null) return reject(503, "UNOBSERVABLE_USAGE");
    let reservation = null;
    let finished = false;
    let call, deadline;
    const unknown = reason => {
      if (finished || reservation === null) return;
      finished = true;
      clearTimeout(deadline);
      try { budget.unknown(reservation, reason); }
      catch { fatalReason = "UNOBSERVABLE_USAGE"; }
      call?.destroy();
      reject(502, reason);
    };
    try {
      const chunks = []; let length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        if (length > MAX_BODY) return reject(413, "REQUEST_TOO_LARGE");
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      const bound = await requestAdmission(body);
      if (fatalReason !== null || res.destroyed) return reject(503, "UNOBSERVABLE_USAGE");
      reservation = budget.reserve(sessionId, bound, createHash("sha256").update(body).digest("hex"));
      const actor = req.headers["x-pnwf-actor"] === "worker" ? "worker" : "principal-container";
      onObservation?.({ kind: "ADMITTED", requestId: reservation, actor });
      call = transport(target, { method: "POST", rejectUnauthorized: true, headers: {
        "content-type": "application/json", "content-length": body.length,
        ...headers,
      } }, response => {
        if (response.statusCode !== 200) { response.resume(); unknown(budget.usageOnly ? `PROVIDER_HTTP_${response.statusCode}` : "PROVIDER_ERROR"); return; }
        const reader = new UsageReader(String(response.headers["content-type"]).includes("text/event-stream"));
        let received = 0;
        res.writeHead(200, { "content-type": response.headers["content-type"] ?? "application/json" });
        response.on("data", chunk => {
          if (finished) return;
          try {
            received += chunk.length;
            if (received > MAX_BODY * 4) throw new BudgetRefusal("RESPONSE_TOO_LARGE");
            reader.push(chunk);
            res.write(chunk);
          } catch (error) { unknown(error.code ?? "INVALID_USAGE"); }
        });
        response.on("end", () => {
          if (finished) return;
          try {
            const actual = reader.end();
            onObservation?.({ kind: "TERMINAL", requestId: reservation, actor, messageId: reader.messageId, usage: reader.final });
            budget.settle(reservation, actual, reader.final);
            finished = true; clearTimeout(deadline); res.end();
          }
          catch (error) { unknown(error.code ?? "UNOBSERVABLE_USAGE"); }
        });
        response.on("aborted", () => unknown("INTERRUPTED_RESPONSE"));
        response.on("error", () => unknown("INTERRUPTED_RESPONSE"));
      });
      call.setTimeout(timeoutMs, () => unknown("PROVIDER_TIMEOUT"));
      deadline = setTimeout(() => unknown("PROVIDER_TIMEOUT"), timeoutMs);
      call.on("error", () => unknown("UPSTREAM_UNCERTAIN"));
      res.on("close", () => { if (!res.writableFinished) unknown("CLIENT_DISCONNECTED"); });
      call.end(body);
    } catch (error) {
      if (reservation !== null) unknown(error.code ?? "UNOBSERVABLE_USAGE");
      else reject(["BUDGET_EXHAUSTED", "REQUEST_LIMIT"].includes(error.code) ? 429 : 403, error.code ?? "INVALID_REQUEST");
    }
  });
  server.on("connection", socket => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  return { url: `http://127.0.0.1:${server.address().port}`, get fatalReason() { return fatalReason; }, close: async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  } };
}
