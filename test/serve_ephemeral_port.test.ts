/**
 * G10-AE gate finding — the "bad port" flake, pinned.
 *
 * A `port: 0` listener takes whatever port the OS hands out from the machine's
 * dynamic range. That range is configurable, and on a host where it is widened
 * (1024-15000 is a real configuration, and it is what this campaign's gate run
 * hit) it can include a port from the WHATWG fetch "bad port" set. Node's `net`
 * layer binds those happily; every compliant HTTP client refuses to CONNECT to
 * them, failing with `TypeError: fetch failed` / cause `bad port` before a byte
 * is written. The server is up and correct - the client simply will not talk to
 * it - so a suite that binds ephemeral servers intermittently looks like a
 * product bug.
 *
 * This file pins BOTH halves: the mechanism (a forbidden port is refused by
 * `fetch` while a raw HTTP request to the same listener succeeds), and the fix
 * (`serveOrchestration` never RETURNS a forbidden port for an ephemeral bind,
 * and never second-guesses an explicitly requested one).
 */

import { createServer as createProbe, connect } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { isClientForbiddenPort, serveOrchestration, type ServeHandle } from "../src/serve.js";

import { installForTests } from "./helpers.js";

/** The forbidden ports this suite may plausibly be handed; 6667 (IRC) is the classic. */
const CANDIDATES = [6667, 6668, 6669, 6679, 6000, 5060, 6566, 4045] as const;

async function firstBindable(ports: readonly number[]): Promise<number | undefined> {
  for (const port of ports) {
    const free = await new Promise<boolean>((resolve) => {
      const probe = createProbe();
      probe.once("error", () => resolve(false));
      probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
    });
    if (free) return port;
  }
  return undefined;
}

/** A raw HTTP GET that does NOT go through undici's port policy. */
async function rawGet(port: number, token: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: "127.0.0.1", port }, () => {
      socket.write(
        `GET /api/health HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer ${token}\r\nConnection: close\r\n\r\n`,
      );
    });
    let data = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => (data += chunk));
    socket.on("error", reject);
    socket.on("end", () => {
      const status = /^HTTP\/1\.1 (\d{3})/u.exec(data)?.[1];
      resolve(status === undefined ? 0 : Number(status));
    });
  });
}

describe("G10-AE gate finding: ephemeral ports a client refuses", () => {
  const handles: ServeHandle[] = [];
  afterEach(async () => {
    for (const handle of handles.splice(0)) await handle.close().catch(() => undefined);
  });

  it("the mechanism: `fetch` refuses a forbidden port while the listener is healthy", async () => {
    const port = await firstBindable(CANDIDATES);
    if (port === undefined) return; // every candidate is occupied on this host
    expect(isClientForbiddenPort(port)).toBe(true);
    const { controller } = await installForTests();
    const handle = await serveOrchestration(controller, { port, token: "t" });
    handles.push(handle);
    expect(handle.port).toBe(port);
    // The listener answers a raw HTTP request on the SAME port...
    expect(await rawGet(port, "t")).toBe(200);
    // ...and a compliant client still refuses to connect at all.
    await expect(fetch(`${handle.url}/api/health`)).rejects.toThrow(/fetch failed/u);
  });

  it("the fix: an ephemeral bind never RETURNS a port a client refuses", async () => {
    const { controller } = await installForTests();
    const handle = await serveOrchestration(controller, { token: "t" });
    handles.push(handle);
    expect(handle.port).toBeGreaterThan(0);
    expect(isClientForbiddenPort(handle.port)).toBe(false);
    // The returned url is therefore actually usable.
    const response = await fetch(`${handle.url}/api/health`, {
      headers: { authorization: "Bearer t" },
    });
    expect(response.status).toBe(200);
  });

  it("an EXPLICIT port is never second-guessed", async () => {
    const port = await firstBindable(CANDIDATES);
    if (port === undefined) return;
    const { controller } = await installForTests();
    const handle = await serveOrchestration(controller, { port, token: "t" });
    handles.push(handle);
    // The caller asked for it, so the caller gets it - no silent substitution.
    expect(handle.port).toBe(port);
    expect(isClientForbiddenPort(handle.port)).toBe(true);
  });

  it("the default port is not in the forbidden set", () => {
    expect(isClientForbiddenPort(7831)).toBe(false);
  });

  it("the classifier recognises the classic service ports", () => {
    for (const port of [6667, 6668, 6669, 6679, 6000, 5060, 6566, 4045, 10080]) {
      expect(isClientForbiddenPort(port)).toBe(true);
    }
    for (const port of [7831, 1024, 15000, 65535]) {
      expect(isClientForbiddenPort(port)).toBe(false);
    }
  });
});
