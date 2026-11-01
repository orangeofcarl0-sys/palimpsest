/**
 * C6-R — official DeepSeek reachability pre-check through the host CONNECT proxy.
 *
 * Uses the runtime's installed `https-proxy-agent` to tunnel through the Windows proxy at
 * 127.0.0.1:7890, then sends an UNAUTHENTICATED `GET /` to `https://api.deepseek.com/`. A 401 proves
 * DNS/TCP/TLS/HTTP reachability without a model request and without a credential.
 *
 * RUN IN WSL.
 */
import { request as httpsRequest } from "node:https";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const OUT = process.argv[2] ?? "/tmp/deepseek-precheck.json";
const PROXY = process.env.C6R_UPSTREAM_PROXY ?? "http://127.0.0.1:7890";
const AGENT_MODULE = process.env.C6R_UPSTREAM_PROXY_AGENT ?? "/home/admini/c6r/dsh/node_modules/https-proxy-agent/dist/index.js";
const target = new URL("https://api.deepseek.com/");

const at = new Date().toISOString();
const { HttpsProxyAgent } = await import(pathToFileURL(AGENT_MODULE).href);

const response = await new Promise((resolve, reject) => {
  const req = httpsRequest(
    {
      host: target.hostname,
      port: 443,
      path: "/",
      method: "GET",
      headers: { host: target.hostname, connection: "close" },
      agent: new HttpsProxyAgent(PROXY),
    },
    (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk.toString(); });
      res.on("end", () => resolve({ status: res.statusCode, body: body.slice(0, 500) }));
    },
  );
  req.on("error", reject);
  req.end();
});

let credential = null;
const credentialPath = process.env.C6R_CREDENTIAL_FILE ?? "";
if (credentialPath !== "" && existsSync(credentialPath)) {
  const text = readFileSync(credentialPath, "utf8");
  const match = text.match(/^\s{2}DEEPSEEK_API_KEY:\s*(\S+)\s*$/m);
  credential = { present: match !== null, length: match === null ? null : match[1].length, prefix: match !== null && match[1].startsWith("sk-") ? "sk-" : null };
}

const record = {
  schema: "c6r-deepseek-precheck/v1",
  at,
  label: "NO_MODEL",
  proxy: PROXY,
  proxyAgent: AGENT_MODULE,
  target: target.origin,
  tls: "connected",
  status: response.status,
  body: response.body,
  reachable: response.status === 401 || response.status === 200 || response.status === 404,
  credential,
  note: "Unauthenticated GET / through the host CONNECT proxy. No model request and no key sent.",
};
writeFileSync(OUT, JSON.stringify(record, null, 2));
console.log(JSON.stringify(record, null, 2));
process.exit(record.reachable ? 0 : 1);
