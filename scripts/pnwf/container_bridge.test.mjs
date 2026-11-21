import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { createServer } from "node:http";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { PassThrough, Writable } from "node:stream";
import test from "node:test";

test("a response racing a stopped Docker pipe reaches adapter cleanup as EPIPE", { timeout: 5000 }, async () => {
  const require = createRequire(import.meta.url);
  const childProcess = require("node:child_process");
  const normalSpawn = childProcess.spawn;
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.stdin = new Writable({
    write(_data, _encoding, done) {
      done(Object.assign(new Error("write EPIPE"), { code: "EPIPE" }));
      setImmediate(() => {
        child.stdout.end();
        child.stderr.end();
        child.emit("close", null, "SIGKILL");
      });
    },
  });
  const gateway = createServer((_request, response) => response.end("mock response"));
  gateway.listen(0, "127.0.0.1");
  await once(gateway, "listening");

  childProcess.spawn = (command, args) => {
    assert.equal(command, "docker");
    assert(args.includes("test-container"));
    queueMicrotask(() => child.stdout.write('{"ready":true}\n'));
    return child;
  };
  syncBuiltinESMExports();
  try {
    const { startContainerBridge } = await import("./container_bridge.mjs");
    const bridge = await startContainerBridge("test-container", `http://127.0.0.1:${gateway.address().port}`, "mock-key");
    const stopped = once(child, "close");
    child.stdout.write(JSON.stringify({ id: 1, body: Buffer.from("{}").toString("base64") }) + "\n");
    await stopped;
    await assert.rejects(bridge.close(), { code: "EPIPE" });
  } finally {
    childProcess.spawn = normalSpawn;
    syncBuiltinESMExports();
    gateway.closeAllConnections();
    await new Promise(resolve => gateway.close(resolve));
  }
});
