/** An explicit, non-billable Messages stand-in. No credential lookup or remote forwarding exists. */
import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { MOCK_KIND, MOCK_ROUTE, MAX_BODY, mockProof, requestBound } from "./bounded_provider.mjs";

export async function startMockProvider({ port = 0, reply, delayMs = 0, fault = null } = {}) {
  const secret = randomBytes(32).toString("hex");
  const instanceId = randomUUID();
  const calls = [];
  const requests = [];
  const failures = [];
  const sockets = new Set();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://mock");
    if (req.method === "GET" && url.pathname === "/.well-known/pnwf-mock") {
      res.setHeader("content-type", "application/json");
      return res.end(JSON.stringify({ kind: MOCK_KIND, instanceId, proof: mockProof(secret, url.searchParams.get("challenge"), instanceId) }));
    }
    if (req.method !== "POST" || url.pathname !== MOCK_ROUTE || req.headers["x-pnwf-mock-secret"] !== secret || req.headers["x-pnwf-mock-instance"] !== instanceId) {
      res.writeHead(403); res.end(); return;
    }
    try {
      const chunks = []; let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > MAX_BODY) throw new Error("body too large");
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks); const input = JSON.parse(body);
      const bound = requestBound(body);
      const content = reply ? await reply(input, calls.length) : [{ type: "text", text: "Deterministic qualification complete." }];
      const output = Buffer.byteLength(JSON.stringify(content));
      requests.push({ ordinal: requests.length, bound, output, accepted: output <= input.max_tokens });
      // Enforced here, rather than trusted from the proxy or a supplied usage field.
      if (output > input.max_tokens) { res.writeHead(422); res.end(); return; }
      const usage = { input_tokens: body.length, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: output };
      const toolResults = (input.messages ?? []).flatMap(m => Array.isArray(m.content) ? m.content : [])
        .filter(block => block.type === "tool_result").map(block => ({ toolUseId: block.tool_use_id,
          isError: block.is_error === true, statusObserved: JSON.stringify(block.content).includes("nextAction") }));
      calls.push({ ordinal: calls.length, bound, usage, total: body.length + output, toolResults });
      const id = `msg_${calls.length}`;
      if (input.stream !== true) {
        res.setHeader("content-type", "application/json");
        return res.end(JSON.stringify({ id, type: "message", role: "assistant", model: input.model, content, stop_reason: "end_turn", usage }));
      }
      res.writeHead(200, { "content-type": "text/event-stream" });
      const emit = event => res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      emit({ type: "message_start", message: { id, type: "message", role: "assistant", model: input.model, content: [], stop_reason: null, usage: { input_tokens: body.length, output_tokens: 0 } } });
      for (const [index, block] of content.entries()) {
        emit({ type: "content_block_start", index, content_block: block.type === "text" ? { type: "text", text: "" } : { ...block, input: {} } });
        emit({ type: "content_block_delta", index, delta: block.type === "text" ? { type: "text_delta", text: block.text } : { type: "input_json_delta", partial_json: JSON.stringify(block.input) } });
        emit({ type: "content_block_stop", index });
      }
      if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
      if (fault === "interrupt") { res.destroy(); return; }
      if (fault !== "missing-usage") emit({ type: "message_delta", delta: { stop_reason: content.some(b => b.type === "tool_use") ? "tool_use" : "end_turn", stop_sequence: null }, usage });
      emit({ type: "message_stop" }); res.end();
    } catch (error) { failures.push(error.message); if (!res.headersSent) res.writeHead(400); res.end(); }
  });
  server.on("connection", socket => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  return { config: { kind: MOCK_KIND, instanceId, secret, url: `http://127.0.0.1:${server.address().port}/` }, calls, requests, failures,
    close: async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); } };
}
