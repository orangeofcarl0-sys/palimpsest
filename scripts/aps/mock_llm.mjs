/**
 * APS deterministic Messages stand-in.
 *
 * This is NOT a model and produces NO cognitive evidence. It exists so the REAL DSH host can
 * exercise: the normal Palimpsest tool catalogue, a native DSH subagent, the real project
 * journal/SQLite state, and a second/third principal session over the same world.
 *
 * Scripts are selected by a substring in the request (system + messages). A principal launch
 * message carries APS_PRINCIPAL_SESSION_<n>; a subagent prompt carries APS_SUBAGENT. Turn counters
 * are per (script, DSH session id), so a child and its parent never consume each other's turns.
 */
import { createServer } from "node:http";
import { appendFileSync, readFileSync } from "node:fs";

const PORT = Number(process.env.APS_MOCK_PORT ?? 18080);
const KEY = process.env.APS_MOCK_KEY ?? "aps-mock-key";
const SCRIPT_PATH = process.env.APS_MOCK_SCRIPT ?? "";
const LOG_PATH = process.env.APS_MOCK_LOG ?? "";

const source = SCRIPT_PATH === "" ? { scripts: [] } : JSON.parse(readFileSync(SCRIPT_PATH, "utf8"));
const scripts = Array.isArray(source.scripts)
  ? source.scripts
  : Array.isArray(source.turns)
    ? [{ match: "", turns: source.turns }]
    : [];
const counters = new Map();

function textOf(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textOf).join("\n");
  if (value !== null && typeof value === "object") {
    if (typeof value.text === "string") return value.text;
    return Object.values(value).map(textOf).join("\n");
  }
  return "";
}

function requestText(parsed) {
  return [textOf(parsed.system), textOf(parsed.messages)].join("\n");
}

function selectScript(parsed) {
  const text = requestText(parsed);
  const matched = scripts.find((entry) => typeof entry.match === "string" && entry.match !== "" && text.includes(entry.match));
  if (matched !== undefined) return matched;
  return scripts.find((entry) => typeof entry.match !== "string" || entry.match === "") ?? { turns: [] };
}

function turnFor(script, sessionId) {
  const key = `${scripts.indexOf(script)}\u0000${sessionId}`;
  const used = counters.get(key) ?? 0;
  counters.set(key, used + 1);
  return script.turns[used] ?? { text: "APS_MOCK_SCRIPT_EXHAUSTED" };
}

function sse(res, type, data) {
  res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
}

function toolBlock(res, index, call) {
  sse(res, "content_block_start", {
    index,
    content_block: { type: "tool_use", id: call.id ?? `toolu_aps_${index}_${Date.now()}`, name: call.name, input: {} },
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
    res.end(JSON.stringify({ ok: true, model: "aps-mock-messages", scripts: scripts.length }));
    return;
  }
  if (req.method === "POST" && req.url === "/aps/reset") {
    counters.clear();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.method !== "POST" || !req.url.endsWith("/v1/messages")) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { type: "not_found" } }));
    return;
  }
  if (req.headers["x-api-key"] !== KEY) {
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
    const script = selectScript(parsed);
    const turn = turnFor(script, sessionId);
    if (LOG_PATH !== "") {
      const line = `${JSON.stringify({
        at: new Date().toISOString(),
        sessionId,
        match: script.match ?? "",
        model: parsed.model ?? null,
        messageCount: Array.isArray(parsed.messages) ? parsed.messages.length : 0,
        toolNames: Array.isArray(parsed.tools) ? parsed.tools.map((tool) => tool.name) : [],
        turn,
      })}\n`;
      appendFileSync(LOG_PATH, line);
      process.stdout.write(line);
    }
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    sse(res, "message_start", {
      message: {
        id: `msg_aps_mock_${Date.now()}`,
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
      textBlock(res, 0, String(turn.text ?? "APS_MOCK_TURN_EMPTY"));
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
  process.stdout.write(`[aps-mock] listening on 127.0.0.1:${PORT} scripts=${scripts.length}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
