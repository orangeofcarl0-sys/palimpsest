/**
 * C6-R C2 — live retry self-test. RUNS IN WSL.
 *
 * A flaky local HTTP upstream destroys the first two connections without a response; the proxy must
 * retry them and return the third attempt's 200. No provider, no model, no credential.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "palimpsest-c6r-retry-"));
const socket = join(dir, "proxy.sock");
const logPath = join(dir, "proxy.jsonl");
const outPath = process.argv[2] ?? join(dir, "retry-selftest.json");
let attempts = 0;

const flaky = createServer((req, res) => {
  attempts += 1;
  if (attempts <= 2) {
    req.socket.destroy();
    return;
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, attempts }));
});
await new Promise((resolve) => flaky.listen(0, "127.0.0.1", resolve));
const port = flaky.address().port;

const proxy = spawn(process.execPath, [join(import.meta.dirname, "provider_proxy.mjs")], {
  env: {
    ...process.env,
    C6R_PROVIDER_KIND: "openai",
    C6R_PROXY_SOCKET: socket,
    C6R_UPSTREAM: `http://127.0.0.1:${port}/v1`,
    C6R_REAL_KEY: "c6r-retry-selftest-key",
    C6R_PROXY_LOG: logPath,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let proxyErr = "";
proxy.stderr.on("data", (chunk) => { proxyErr += chunk.toString(); });

for (let i = 0; i < 100 && !existsSync(socket); i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

const result = await new Promise((resolve, reject) => {
  const req = request(
    {
      socketPath: socket,
      path: "/v1/chat/completions",
      method: "POST",
      headers: { "content-type": "application/json" },
    },
    (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk.toString(); });
      res.on("end", () => resolve({ status: res.statusCode, body }));
    },
  );
  req.on("error", reject);
  req.end(JSON.stringify({ model: "deepseek-v4.1-flash", messages: [] }));
});

const proxyLog = existsSync(logPath)
  ? readFileSync(logPath, "utf8").split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line))
  : [];
const record = {
  schema: "c6r-retry-selftest/v1",
  at: new Date().toISOString(),
  label: "NO_MODEL",
  upstreamAttempts: attempts,
  response: result,
  retryEntries: proxyLog.filter((entry) => entry.retry === true).length,
  proxyLog,
  proxyErr,
  passed: result.status === 200 && attempts === 3 && proxyLog.filter((entry) => entry.retry === true).length === 2,
};
writeFileSync(outPath, JSON.stringify(record, null, 2));
console.log(JSON.stringify(record, null, 2));
proxy.kill("SIGTERM");
flaky.close();
process.exit(record.passed ? 0 : 1);
