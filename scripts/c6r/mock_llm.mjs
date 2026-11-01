/**
 * C6-R2 — a deterministic Messages-protocol stand-in for runtime qualification.
 *
 * This is NOT a model. It exists so the REAL DSH tool path — permission preset activation, tool
 * catalogue, sandboxed Bash, sandboxed filesystem writes, session stream, usage events — can be
 * exercised without a provider request and without spending a token. Every qualification record
 * produced through it is labelled `MOCK_MODEL`.
 *
 * The wire shape is the subset the installed DeepSeek Messages adapter consumes:
 *   message_start → content_block_start/delta/stop … → message_delta → message_stop
 *
 * A script is a sequence of turns. Each turn is either a set of tool calls or a final text. The
 * server keys turns by the DSH session id so two concurrent sessions cannot consume each other's
 * turns.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const PORT = Number(process.env.C6R_MOCK_PORT ?? 18080);
const KEY = process.env.C6R_MOCK_KEY ?? "c6r-mock-key";
const SCRIPT_PATH = process.env.C6R_MOCK_SCRIPT ?? "";
const LOG_PATH = process.env.C6R_MOCK_LOG ?? "";

const script = SCRIPT_PATH === ""
  ? { turns: [{ tool_calls: [{ name: "bash", input: { command: "pwd", description: "qualification" } }] }, { text: "MOCK_SCRIPT_EXHAUSTED" }] }
  : JSON.parse(readFileSync(SCRIPT_PATH, "utf8"));

const turns = new Map();

function turnFor(sessionId) {
  const used = turns.get(sessionId) ?? 0;
  turns.set(sessionId, used + 1);
  return script.turns[used] ?? { text: "MOCK_SCRIPT_EXHAUSTED" };
}

function sse(res, type, data) {
  res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
}

function toolBlock(res, index, call) {
  sse(res, "content_block_start", {
    index,
    content_block: { type: "tool_use", id: call.id ?? `toolu_${index}_${Date.now()}`, name: call.name, input: {} },
  });
  sse(res, "content_block_delta", {
    index,
    delta: { type: "input_json_delta", partial_json: JSON.stringify(call.input ?? {}) },
  });
  sse(res, "content_block_stop", { index });
}

function textBlock(res, index, text) {
  sse(res, "content_block_start", { index, content_block: { type: "text", text: "" } });
  sse(res, "content_block_delta", { index, delta: { type: "text_delta", text } });
  sse(res, "content_block_stop", { index });
}

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, model: "mock-messages", turns: script.turns.length }));
    return;
  }
  if (req.method === "POST" && req.url === "/c6r/reset") {
    turns.clear();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.method !== "POST" || !req.url.endsWith("/v1/messages")) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { type: "not_found" } }));
    return;
  }

  const provided = req.headers["x-api-key"];
  if (provided !== KEY) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { type: "authentication_error", message: "bad mock key" } }));
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString();
  });
  req.on("end", () => {
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { type: "invalid_request_error" } }));
      return;
    }
    const sessionId = String(req.headers["x-deepseek-harness-session-id"] ?? "unknown");
    const turn = turnFor(sessionId);
    if (LOG_PATH !== "") {
      const summary = {
        at: new Date().toISOString(),
        sessionId,
        model: parsed.model ?? null,
        messageCount: Array.isArray(parsed.messages) ? parsed.messages.length : 0,
        toolNames: Array.isArray(parsed.tools) ? parsed.tools.map((tool) => tool.name) : [],
        turn,
      };
      process.stdout.write(`${JSON.stringify(summary)}\n`);
    }

    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    sse(res, "message_start", {
      message: {
        id: `msg_mock_${Date.now()}`,
        type: "message",
        role: "assistant",
        model: parsed.model ?? "deepseek-flash",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 1000, output_tokens: 1 },
      },
    });
    if (Array.isArray(turn.tool_calls) && turn.tool_calls.length > 0) {
      turn.tool_calls.forEach((call, index) => toolBlock(res, index, call));
      sse(res, "message_delta", {
        delta: { stop_reason: "tool_use", stop_sequence: null },
        usage: { input_tokens: 1000, output_tokens: 50 },
      });
    } else {
      textBlock(res, 0, String(turn.text ?? "MOCK_TURN_EMPTY"));
      sse(res, "message_delta", {
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { input_tokens: 1000, output_tokens: 20 },
      });
    }
    sse(res, "message_stop", {});
    res.end();
  });
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`[mock-llm] listening on 127.0.0.1:${PORT} turns=${script.turns.length}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
