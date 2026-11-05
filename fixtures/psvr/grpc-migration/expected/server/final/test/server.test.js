"use strict";

/**
 * The server's own tests. They speak the wire directly (http2 + frames) on purpose: a test that used
 * the production client would let a matching bug in both halves pass unnoticed.
 */
const assert = require("node:assert/strict");
const http2 = require("node:http2");
const { after, before, test } = require("node:test");

const { readingsFor } = require("../service/data.js");
const { FRAME_GAP_MS, createGrpcServer } = require("../service/grpc_server.js");
const {
  decodeReading,
  drainFrames,
  encodeSiteRequest,
  encodeStreamRequest,
  frame,
} = require("../service/wire.js");

const SERVICE = "/energy.v1.EnergyService";
const MAX_FRAME_BYTES = 16 * 1024;

let server;
let session;

before(async () => {
  server = createGrpcServer(require("../service/data.js"));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  session = http2.connect(`http://127.0.0.1:${String(server.address().port)}`);
});

after(async () => {
  session.close();
  await new Promise((resolve) => server.close(resolve));
});

/** Send one framed request and collect the framed answer. */
function call(path, payload, onMessage) {
  return new Promise((resolve, reject) => {
    const stream = session.request({
      ":method": "POST",
      ":path": `${SERVICE}${path}`,
      "content-type": "application/grpc",
      "te": "trailers",
    });
    let buffered = Buffer.alloc(0);
    const messages = [];
    let status = "0";
    stream.on("trailers", (headers) => {
      status = String(headers["grpc-status"] ?? "0");
    });
    stream.on("data", (chunk) => {
      buffered = Buffer.concat([buffered, chunk]);
      const drained = drainFrames(buffered);
      buffered = drained.rest;
      for (const encoded of drained.messages) {
        assert.ok(encoded.length <= MAX_FRAME_BYTES, `frame is ${String(encoded.length)} bytes`);
        messages.push(onMessage(encoded));
      }
    });
    stream.on("error", reject);
    stream.on("end", () => resolve({ messages, status }));
    stream.end(frame(payload));
  });
}

test("GetReading returns one reading", async () => {
  const result = await call("/GetReading", encodeSiteRequest({ siteId: "site-a" }), decodeReading);
  assert.equal(result.status, "0");
  assert.deepEqual(result.messages, [{ siteId: "site-a", watts: 4120, atMs: 1762300000000 }]);
});

test("StreamReadings sends one bounded frame per reading, incrementally", async () => {
  const arrivals = [];
  const result = await call("/StreamReadings", encodeStreamRequest({ siteId: "site-a", limit: 6 }), (encoded) => {
    arrivals.push(Date.now());
    return decodeReading(encoded);
  });
  assert.equal(result.status, "0");
  assert.deepEqual(result.messages, readingsFor("site-a").slice(0, 6));
  assert.ok(arrivals.length >= 6, "every reading arrived in its own frame");
  const span = arrivals[arrivals.length - 1] - arrivals[0];
  assert.ok(
    span >= FRAME_GAP_MS * 4,
    `readings arrived incrementally (span ${String(span)}ms); a batch written at the end would span ~0ms`,
  );
});

test("an unknown site is grpc-status 5, not an empty stream", async () => {
  const result = await call("/GetReading", encodeSiteRequest({ siteId: "site-zz" }), (encoded) => encoded);
  assert.equal(result.status, "5");
});
