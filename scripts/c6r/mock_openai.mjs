/**
 * C6-R — deterministic OpenAI Chat Completions stand-in for route qualification.
 *
 * NOT a model. It exists so the real DSH pi-ai adapter, the provider proxy and the sandboxed tool
 * path can be exercised before the single real provider probe. Every record produced through it is
 * labelled MOCK_MODEL.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const PORT = Number(process.env.C6R_MOCK_PORT ?? 18081);
const KEY = process.env.C6R_MOCK_KEY ?? "c6r-mock-key";
const MODEL = process.env.C6R_MOCK_MODEL ?? "deepseek-v4.1-flash";
const SCRIPT_PATH = process.env.C6R_MOCK_SCRIPT ?? "";
const script = SCRIPT_PATH === ""
  ? { turns: [{ tool_calls: [{ name: "bash", arguments: { command: "pwd", description: "qualification" } }] }, { text: "MOCK_OPENAI_DONE" }] }
  : JSON.parse(readFileSync(SCRIPT_PATH, "utf8"));
const turns = new Map();

function turnFor(session) {
  const used = turns.get(session) ?? 0;
  turns.set(session, used + 1);
  return script.turns[used] ?? { text: "MOCK_SCRIPT_EXHAUSTED" };
}

function sse(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, mock: "openai", turns: script.turns.length }));
    return;
  }
  if (req.method !== "POST" || !req.url.endsWith("/v1/chat/completions")) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { type: "not_found" } }));
    return;
  }
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${KEY}`) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { type: "authentication_error" } }));
    return;
  }
  let body = "";
  req.on("data", (chunk) => { body += chunk.toString(); });
  req.on("end", () => {
    let parsed;
    try { parsed = JSON.parse(body); } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { type: "invalid_request_error" } }));
      return;
    }
    const session = String(req.headers["x-opencode-session"] ?? "unknown");
    const turn = turnFor(session);
    process.stdout.write(`${JSON.stringify({
      at: new Date().toISOString(),
      session,
      model: parsed.model ?? null,
      stream: parsed.stream ?? null,
      messageCount: Array.isArray(parsed.messages) ? parsed.messages.length : 0,
      toolNames: Array.isArray(parsed.tools) ? parsed.tools.map((tool) => tool.function?.name ?? tool.name) : [],
      turn,
    })}\n`);
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    const id = `chatcmpl-mock-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);
    if (Array.isArray(turn.tool_calls) && turn.tool_calls.length > 0) {
      sse(res, { id, object: "chat.completion.chunk", created, model: parsed.model ?? MODEL, choices: [{ index: 0, delta: { role: "assistant", tool_calls: turn.tool_calls.map((call, index) => ({ index, id: call.id ?? `call_mock_${index}`, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments ?? {}) } })) }, finish_reason: null }] });
      sse(res, { id, object: "chat.completion.chunk", created, model: parsed.model ?? MODEL, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 1000, completion_tokens: 50, total_tokens: 1050 } });
    } else {
      sse(res, { id, object: "chat.completion.chunk", created, model: parsed.model ?? MODEL, choices: [{ index: 0, delta: { role: "assistant", content: String(turn.text ?? "MOCK_OPENAI_DONE") }, finish_reason: null }] });
      sse(res, { id, object: "chat.completion.chunk", created, model: parsed.model ?? MODEL, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 1000, completion_tokens: 20, total_tokens: 1020 } });
    }
    res.write("data: [DONE]\n\n");
    res.end();
  });
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`[mock-openai] listening on 127.0.0.1:${PORT} turns=${script.turns.length}\n`);
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
