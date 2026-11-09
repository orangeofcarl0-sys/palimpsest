/** Fixed-route HTTP over docker-exec stdio. The principal has network=none, including no host route.
 * Only the host half knows the gateway/session key. Frames contain data, never host commands/URLs.
 */
import { spawn } from "node:child_process";
import { request } from "node:http";
import { createInterface } from "node:readline";

const BRIDGE = String.raw`
const http = require('node:http');
const readline = require('node:readline');
const pending = new Map(); let serial = 0;
const emit = value => process.stdout.write(JSON.stringify(value)+'\n');
readline.createInterface({input:process.stdin}).on('line', line => {
  try {
    const message = JSON.parse(line); const res = pending.get(message.id); if (!res) return;
    if (message.status) res.writeHead(message.status, {'content-type':message.contentType});
    if (message.data) res.write(Buffer.from(message.data, 'base64'));
    if (message.end) { res.end(); pending.delete(message.id); }
    if (message.error) { res.destroy(); pending.delete(message.id); }
  } catch { process.exit(2); }
}).on('close',()=>process.exit(0));
http.createServer(async(req,res)=>{
  const work=req.url==='/pnwf/work' && process.argv[1]==='worker-control';
  if(req.method!=='POST' || (!work && !['/v1/messages','/messages'].includes(req.url))) {res.writeHead(403);res.end();return;}
  const chunks=[];let bytes=0;
  for await(const chunk of req){bytes+=chunk.length;if(bytes>2097152){res.writeHead(413);res.end();return;}chunks.push(chunk);}
  const id=++serial;pending.set(id,res);
  emit({id,work,body:Buffer.concat(chunks).toString('base64')});
}).listen(18080,'127.0.0.1',()=>emit({ready:true}));
`;

export async function startContainerBridge(containerId, gateway, sessionKey, { actor = "principal", dispatchWork } = {}) {
  const child = spawn("docker", ["exec", "-i", "--user", "1001:1001", containerId, "node", "-e", BRIDGE,
    ...(dispatchWork === undefined ? [] : ["worker-control"])], { stdio: ["pipe", "pipe", "pipe"] });
  const requests = new Set();
  let ready = false;
  let stderr = "";
  child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-4000); });
  const send = message => { if (!child.stdin.destroyed) child.stdin.write(JSON.stringify(message) + "\n"); };
  const lines = createInterface({ input: child.stdout });
  const initialized = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("CONTAINER_BRIDGE_TIMEOUT")), 10000);
    child.once("error", error => { clearTimeout(timeout); reject(error); });
    child.once("close", code => { clearTimeout(timeout); if (!ready) reject(new Error(`CONTAINER_BRIDGE_FAILED ${code}: ${stderr}`)); });
    lines.on("line", line => {
      try {
        if (line.length > 3 * 1024 * 1024) throw new Error("oversized bridge frame");
        const message = JSON.parse(line);
        if (message.ready === true && !ready) { ready = true; clearTimeout(timeout); resolve(); return; }
        if (!ready || !Number.isSafeInteger(message.id) || typeof message.body !== "string") throw new Error("invalid bridge frame");
        const body = Buffer.from(message.body, "base64");
        if (body.length > 2 * 1024 * 1024) throw new Error("oversized request");
        if (message.work === true) {
          if (dispatchWork === undefined) throw new Error("work control unavailable");
          Promise.resolve().then(() => dispatchWork(JSON.parse(body))).then(
            outcome => {
              send({ id: message.id, status: 200, contentType: "application/json" });
              send({ id: message.id, data: Buffer.from(JSON.stringify(outcome)).toString("base64"), end: true });
            },
            error => {
              send({ id: message.id, status: 409, contentType: "application/json" });
              send({ id: message.id, data: Buffer.from(JSON.stringify({ kind: "HOST_FAILURE", detail: error.message })).toString("base64"), end: true });
            },
          );
          return;
        }
        const upstream = request(gateway + "/v1/messages", { method: "POST", headers: {
          "content-type": "application/json", "content-length": body.length, "x-api-key": sessionKey, "x-pnwf-actor": actor,
        } }, response => {
          send({ id: message.id, status: response.statusCode, contentType: response.headers["content-type"] ?? "application/json" });
          response.on("data", chunk => send({ id: message.id, data: chunk.toString("base64") }));
          response.on("end", () => send({ id: message.id, end: true }));
          response.on("error", () => send({ id: message.id, error: true }));
        });
        requests.add(upstream);
        upstream.on("close", () => requests.delete(upstream));
        upstream.on("error", () => send({ id: message.id, error: true }));
        upstream.end(body);
      } catch (error) { child.kill(); reject(error); }
    });
  });
  try { await initialized; }
  catch (error) { child.kill(); throw error; }
  return { close: async () => {
    for (const req of requests) req.destroy();
    child.stdin.end();
    if (child.exitCode === null) await new Promise(resolve => child.once("close", resolve));
  } };
}
