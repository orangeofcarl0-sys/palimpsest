/** The only qualified provider contract is the deterministic local mock.
 * DeepSeek's compatibility path may enlarge max_tokens; no paid provider is qualified for a hard
 * request bound here. Configuration, credentials, or a prior isolation JSON cannot override that.
 */
import { createServer, request } from "node:http";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { BudgetRefusal, tokens } from "./execution_budget.mjs";

export const MOCK_KIND = "pnwf-deterministic-mock/v1";
export const MOCK_ROUTE = "/pnwf-mock/v1/messages";
export const MAX_BODY = 2 * 1024 * 1024;
export function mockProof(secret, challenge, instanceId) {
  return createHmac("sha256", secret).update(`${challenge}\0${instanceId}`).digest("hex");
}
function mockEndpoint(config) {
  if (config?.kind !== MOCK_KIND) throw new BudgetRefusal("PROVIDER_BOUND_UNQUALIFIED", "no executable request bound is qualified for this provider; paid execution is disabled");
  const url = new URL(config.url);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.username || url.password || url.pathname !== "/") throw new BudgetRefusal("MOCK_ENDPOINT_REQUIRED");
  if (typeof config.secret !== "string" || config.secret.length < 32 || typeof config.instanceId !== "string") throw new BudgetRefusal("MOCK_IDENTITY_REQUIRED");
  return url;
}
export async function verifyMock(config) {
  const url = mockEndpoint(config);
  const challenge = randomUUID();
  const response = await fetch(new URL(`/.well-known/pnwf-mock?challenge=${challenge}`, url), { redirect: "error", signal: AbortSignal.timeout(3000) });
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
  if (!usage || !Object.hasOwn(usage, "input_tokens") || !Object.hasOwn(usage, "output_tokens")) throw new BudgetRefusal("UNOBSERVABLE_USAGE");
  const total = ["input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens", "output_tokens"]
    .reduce((sum, key) => sum + tokens(Object.hasOwn(usage, key) ? usage[key] : (key.startsWith("cache_") ? 0 : undefined), key), 0);
  return tokens(total, "total usage");
}
export class UsageReader {
  constructor(stream) { this.stream = stream; this.decoder = new TextDecoder(); this.buffer = ""; this.final = null; this.stopped = false; }
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
      if (event.type === "message_delta" && event.usage !== undefined) {
        const usage = finalUsage(event.usage);
        if (this.final !== null && this.final !== usage) throw new BudgetRefusal("CONFLICTING_USAGE");
        this.final = usage;
      }
      if (event.type === "message_stop") this.stopped = true;
    }
  }
  end() {
    this.buffer += this.decoder.decode();
    if (!this.stream) return finalUsage(JSON.parse(this.buffer).usage);
    if (!this.stopped || this.final === null || this.buffer.trim() !== "") throw new BudgetRefusal("UNOBSERVABLE_USAGE");
    return this.final;
  }
}
export async function startBoundedProxy({ provider, budget, sessionId, sessionKey, port = 0, timeoutMs = 10000 }) {
  const upstream = await verifyMock(provider);
  if (typeof sessionKey !== "string" || sessionKey.length < 32) throw new BudgetRefusal("SESSION_KEY_REQUIRED");
  const sockets = new Set();
  const server = createServer(async (req, res) => {
    const reject = (status, code) => {
      if (!res.headersSent) res.writeHead(status, { "content-type": "application/json" });
      if (!res.destroyed) res.end(JSON.stringify({ error: { type: code } }));
    };
    if (req.method !== "POST" || !["/v1/messages", "/messages"].includes(req.url)) return reject(403, "ROUTE_DENIED");
    const key = req.headers["x-api-key"] ?? String(req.headers.authorization ?? "").replace(/^Bearer /u, "");
    if (key !== sessionKey) return reject(403, "SESSION_IDENTITY_MISMATCH");
    let reservation = null;
    let finished = false;
    let call, deadline;
    const unknown = reason => {
      if (finished || reservation === null) return;
      finished = true;
      clearTimeout(deadline);
      budget.unknown(reservation, reason);
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
      // Verify identity before admission, then use a mock-only route that no paid Messages API owns.
      await verifyMock(provider);
      const bound = requestBound(body);
      reservation = budget.reserve(sessionId, bound, createHash("sha256").update(body).digest("hex"));
      call = request(new URL(MOCK_ROUTE, upstream), { method: "POST", headers: {
        "content-type": "application/json", "content-length": body.length,
        "x-pnwf-mock-secret": provider.secret, "x-pnwf-mock-instance": provider.instanceId,
      } }, response => {
        if (response.statusCode !== 200) { response.resume(); unknown("PROVIDER_ERROR"); return; }
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
          try { budget.settle(reservation, reader.end()); finished = true; clearTimeout(deadline); res.end(); }
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
      else reject(error.code === "BUDGET_EXHAUSTED" ? 429 : 403, error.code ?? "INVALID_REQUEST");
    }
  });
  server.on("connection", socket => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  return { url: `http://127.0.0.1:${server.address().port}`, close: async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  } };
}
