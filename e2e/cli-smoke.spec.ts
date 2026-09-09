/**
 * Spec 36 §31: ONE CLI packaging/startup smoke - the built bin resolves,
 * the serve command starts with --db/--ops/--port/--token, the built web
 * bundle is served, health works, and the process shuts down. This is not
 * the main fixture (§32) - the main suite is in-process; this single test
 * proves the packaging path.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

test("E2E-CLI-01: the built CLI serve starts on an ephemeral port, serves health + web, and shuts down", async () => {
  const cliPath = join(process.cwd(), "dist", "src", "cli.js");
  const webIndex = join(process.cwd(), "dist", "web", "index.html");
  expect(existsSync(cliPath)).toBe(true);
  expect(existsSync(webIndex)).toBe(true);

  const dir = mkdtempSync(join(tmpdir(), "palimpsest-e2e-cli-"));
  let child: ChildProcess | undefined;
  try {
    child = spawn(
      process.execPath,
      [
        cliPath,
        "serve",
        "--db", join(dir, "state.sqlite"),
        "--ops", join(dir, "ops.sqlite"),
        "--port", "0",
        "--token", "e2e-cli-token",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    // The CLI prints its serve handle once: {url, token}.
    const stdout: string = await new Promise((resolve, reject) => {
      let text = "";
      const timer = setTimeout(() => reject(new Error(`CLI serve never printed its handle: ${text}`)), 15_000);
      child!.stdout!.on("data", (chunk: Buffer) => {
        text += chunk.toString("utf8");
        const line = text.split("\n").find((entry) => entry.trim().startsWith("{"));
        if (line !== undefined) {
          clearTimeout(timer);
          resolve(line);
        }
      });
      child!.stderr!.on("data", (chunk: Buffer) => {
        text += chunk.toString("utf8");
      });
    });
    const handle = JSON.parse(stdout.trim()) as { url: string; token: string };
    expect(handle.token).toBe("e2e-cli-token");
    expect(handle.url).toMatch(/127\.0\.0\.1:\d+/);

    // Health answers over the REAL CLI-packaged kernel.
    const health = await fetch(`${handle.url}/api/health`, {
      headers: { authorization: `Bearer ${handle.token}` },
    });
    expect(health.status).toBe(200);
    const body = (await health.json()) as { ok: boolean; projectInitialized: boolean };
    expect(body.ok).toBe(true);
    expect(body.projectInitialized).toBe(false);
    // The built web bundle is actually served (not the fallback page).
    const page = await fetch(handle.url);
    const html = await page.text();
    expect(html).toContain('<div id="root">');

    // Shutdown: the process terminates (clean SIGTERM exit on POSIX; on
    // Windows the runtime emulates termination, so any exit signal counts -
    // the release of listener/handles is verified by the process being gone).
    child.kill("SIGTERM");
    const exited = await new Promise<{ code: number | null; signal: string | null }>((resolve) => {
      child!.on("close", (code, signal) => resolve({ code, signal }));
    });
    expect(exited.code === 0 || exited.signal !== null).toBe(true);
  } finally {
    child?.kill();
    await new Promise((resolve) => setTimeout(resolve, 100));
    rmSync(dir, { recursive: true, force: true });
  }
});
