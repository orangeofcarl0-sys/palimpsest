/**
 * LHAPE deterministic Messages stand-in.
 *
 * NOT a model. It exists so the REAL DSH host can run real principal and worker sessions, real tool
 * calls, real filesystem/Git effects and the real Palimpsest product. Every record produced from this
 * server is labelled MOCK_MODEL and no cognitive, quality or comparative claim is made.
 *
 * Two deterministic conveniences, both visible in the script file and the run summary:
 *   - `POST /aps/reload` re-reads the script file between phases.
 *   - `__DIGEST__` / `__RESULT_COMMIT__` are substituted from the LATEST tool result in the request
 *     the model would have seen. This is how the scripted turn refers to an actual assessment digest
 *     or commit instead of guessing one.
 */
import { createServer } from "node:http";
import { appendFileSync, readFileSync } from "node:fs";

const PORT = Number(process.env.LHAPE_MOCK_PORT ?? 18082);
const KEY = process.env.LHAPE_MOCK_KEY ?? "lhape-mock-key";
const SCRIPT_PATH = process.env.LHAPE_MOCK_SCRIPT ?? "";
const LOG_PATH = process.env.LHAPE_MOCK_LOG ?? "";

let source = { scripts: [] };
let scripts = [];
function reload() {
  source = SCRIPT_PATH === "" ? { scripts: [] } : JSON.parse(readFileSync(SCRIPT_PATH, "utf8"));
  scripts = Array.isArray(source.scripts)
    ? source.scripts
    : Array.isArray(source.turns)
      ? [{ match: "", turns: source.turns }]
      : [];
}
reload();
const counters = new Map();

function textOf(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textOf).join("\n");
  if (value !== null && typeof value === "object") {
    if (typeof value.text === "string") return value.text;
    if (typeof value.content === "string") return value.content;
    return Object.values(value).map(textOf).join("\n");
  }
  return "";
}

function requestText(parsed) {
  return [textOf(parsed.system), textOf(parsed.messages)].join("\n");
}

/** The latest tool result the model received, for deterministic scripts and operator diagnostics. */
function lastToolResult(parsed) {
  const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user" || !Array.isArray(message.content)) continue;
    const blocks = message.content.filter((block) => block?.type === "tool_result");
    if (blocks.length === 0) continue;
    const block = blocks[blocks.length - 1];
    return textOf(block.content).slice(0, 4000);
  }
  return null;
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
  return script.turns[used] ?? { text: "LHAPE_MOCK_SCRIPT_EXHAUSTED" };
}

function substitute(value, parsed) {
  if (typeof value === "string") {
    const text = requestText(parsed);
    if (value.includes("__DIGEST__")) {
      const matches = [...text.matchAll(/"assessmentDigest"\s*:\s*"([0-9a-f]{64})"/gu)];
      const digest = matches.length === 0 ? "" : matches[matches.length - 1][1];
      value = value.replaceAll("__DIGEST__", digest);
    }
    if (value.includes("__RESULT_COMMIT__")) {
      const matches = [...text.matchAll(/"resultCommit"\s*:\s*"([0-9a-f]{40})"/gu)];
      const commit = matches.length === 0 ? "" : matches[matches.length - 1][1];
      value = value.replaceAll("__RESULT_COMMIT__", commit);
    }
    if (value.includes("__OBSERVATION_DIGEST__")) {
      const matches = [...text.matchAll(/"observationDigest"\s*:\s*"([0-9a-f]{64})"/gu)];
      const digest = matches.length === 0 ? "" : matches[matches.length - 1][1];
      value = value.replaceAll("__OBSERVATION_DIGEST__", digest);
    }
    if (value.includes("__INPUT_DIGEST__") || value.includes("__INPUT_TEXT_JSON__")) {
      /**
       * ODPE: the WORKER's pull result carries the exact bytes the attempt was given. The stand-in
       * extracts them from the tool result so the scripted turn can write an artifact that really
       * came through the product's context-pull path — the fixture never injects the body.
       */
      const digestMatches = [...text.matchAll(/"kind"\s*:\s*"input"[\s\S]{0,4000}?"digest"\s*:\s*"([0-9a-f]{64})"/gu)];
      const digest = digestMatches.length === 0 ? "" : digestMatches[digestMatches.length - 1][1];
      value = value.replaceAll("__INPUT_DIGEST__", digest);
      if (value.includes("__INPUT_TEXT_JSON__")) {
        const textMatch = /"kind"\s*:\s*"input"[\s\S]{0,4000}?"text"\s*:\s*"((?:[^"\\]|\\.)*)"/u.exec(text);
        let decoded = "";
        if (textMatch !== null) {
          try {
            decoded = JSON.parse(`"${textMatch[1]}"`);
          } catch {
            decoded = "";
          }
        }
        value = value.replaceAll("__INPUT_TEXT_JSON__", JSON.stringify(decoded));
      }
    }
    if (value.includes("__CONTRIBUTION_ID__")) {
      const matches = [...text.matchAll(/"contributionId"\s*:\s*"([^"]+)"/gu)];
      const id = matches.length === 0 ? "" : matches[matches.length - 1][1];
      value = value.replaceAll("__CONTRIBUTION_ID__", id);
    }
    if (value.includes("__TASK_COMMIT__")) {
      /**
       * A worker's request carries the substituted task objective, not the JSON field, so the commit
       * is read as the last 40-hex token in the request. This is a stand-in convenience, not a model
       * capability; the worker still has to read the commit with a real command.
       */
      const named = [...text.matchAll(/result commit\s+([0-9a-f]{40})/gu)];
      const any = [...text.matchAll(/\b[0-9a-f]{40}\b/gu)];
      const commit = named.length > 0 ? named[named.length - 1][1] : any.length === 0 ? "" : any[any.length - 1][0];
      value = value.replaceAll("__TASK_COMMIT__", commit);
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => substitute(entry, parsed));
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const [key, entry] of Object.entries(value)) out[key] = substitute(entry, parsed);
    return out;
  }
  return value;
}

function sse(res, type, data) {
  res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
}

function toolBlock(res, index, call) {
  sse(res, "content_block_start", {
    index,
    content_block: { type: "tool_use", id: call.id ?? `toolu_lhape_${index}_${Date.now()}`, name: call.name, input: {} },
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
    res.end(JSON.stringify({ ok: true, model: "lhape-mock-messages", scripts: scripts.length }));
    return;
  }
  if (req.method === "POST" && req.url === "/aps/reload") {
    reload();
    counters.clear();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, scripts: scripts.length }));
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
    const toolCalls = Array.isArray(turn.tool_calls)
      ? turn.tool_calls.map((call) => ({ ...call, input: substitute(call.input ?? {}, parsed) }))
      : [];
    if (LOG_PATH !== "") {
      const line = `${JSON.stringify({
        at: new Date().toISOString(),
        sessionId,
        match: script.match ?? "",
        model: parsed.model ?? null,
        messageCount: Array.isArray(parsed.messages) ? parsed.messages.length : 0,
        toolNames: Array.isArray(parsed.tools) ? parsed.tools.map((tool) => tool.name) : [],
        lastToolResult: lastToolResult(parsed),
        turn: { ...turn, tool_calls: toolCalls },
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
        id: `msg_lhape_mock_${Date.now()}`,
        type: "message",
        role: "assistant",
        model: parsed.model ?? "deepseek-flash",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 1000, output_tokens: 1 },
      },
    });
    if (toolCalls.length > 0) {
      toolCalls.forEach((call, index) => toolBlock(res, index, call));
      sse(res, "message_delta", {
        delta: { stop_reason: "tool_use", stop_sequence: null },
        usage: { input_tokens: 1000, output_tokens: 50 },
      });
    } else {
      textBlock(res, 0, String(turn.text ?? "LHAPE_MOCK_TURN_EMPTY"));
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
  process.stdout.write(`[lhape-mock] listening on 127.0.0.1:${PORT} scripts=${scripts.length}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
