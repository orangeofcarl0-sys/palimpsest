/**
 * C6-R2 — loopback bridge from the sandbox's network namespace to the provider-only Unix socket.
 *
 * `bwrap --unshare-net` gives the sandbox a private network namespace with only loopback. This
 * bridge is the only listener there; every connection is forwarded to the bind-mounted Unix socket
 * served by `provider_proxy.mjs` outside the sandbox. The model therefore has no route to any other
 * host, and no credential.
 */
import { createServer, connect } from "node:net";

const SOCKET = process.env.C6R_PROXY_SOCKET;
const PORT = Number(process.env.C6R_BRIDGE_PORT ?? 18080);

if (SOCKET === undefined || SOCKET === "") {
  process.stderr.write("[net-bridge] C6R_PROXY_SOCKET is required\n");
  process.exit(2);
}

const server = createServer((client) => {
  const upstream = connect(SOCKET);
  const close = () => {
    client.destroy();
    upstream.destroy();
  };
  client.on("error", close);
  upstream.on("error", close);
  client.pipe(upstream);
  upstream.pipe(client);
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`[net-bridge] 127.0.0.1:${PORT} -> ${SOCKET}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
