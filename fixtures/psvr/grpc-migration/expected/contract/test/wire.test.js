"use strict";

/**
 * The codec is the part a wire change would silently break, so it is tested before anything runs on
 * top of it: field numbers, varint width (atMs does not fit in 32 bits), UTF-8 site ids, the batch
 * message, and the framing boundary between two messages in one buffer.
 */
const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  decodeReadings,
  decodeReading,
  decodeSiteRequest,
  decodeStreamRequest,
  drainFrames,
  encodeReadings,
  encodeReading,
  encodeSiteRequest,
  encodeStreamRequest,
  frame,
  unframe,
} = require("../service/wire.js");

test("a Reading round-trips with a 64-bit timestamp", () => {
  const reading = { siteId: "site-a", watts: 4120, atMs: 1762300000000 };
  assert.deepEqual(decodeReading(unframe(frame(encodeReading(reading)))), reading);
});

test("a SiteRequest round-trips a non-ASCII site id", () => {
  const request = { siteId: "sítio-ç" };
  assert.deepEqual(decodeSiteRequest(encodeSiteRequest(request)), request);
});

test("a StreamRequest round-trips its limit", () => {
  const request = { siteId: "site-b", limit: 3 };
  assert.deepEqual(decodeStreamRequest(encodeStreamRequest(request)), request);
});

test("a Readings batch preserves order", () => {
  const readings = [
    { siteId: "site-a", watts: 1, atMs: 2 },
    { siteId: "site-a", watts: 3, atMs: 4 },
  ];
  assert.deepEqual(decodeReadings(encodeReadings(readings)), readings);
});

test("two frames in one buffer are drained in order and a partial frame is kept", () => {
  const first = frame(encodeReading({ siteId: "site-a", watts: 1, atMs: 2 }));
  const second = frame(encodeReading({ siteId: "site-b", watts: 3, atMs: 4 }));
  const drained = drainFrames(Buffer.concat([first, second, first.subarray(0, 3)]));
  assert.equal(drained.messages.length, 2);
  assert.deepEqual(decodeReading(drained.messages[1]), { siteId: "site-b", watts: 3, atMs: 4 });
  assert.equal(drained.rest.length, 3);
});

test("a truncated frame is refused, not guessed", () => {
  const encoded = frame(encodeReading({ siteId: "site-a", watts: 1, atMs: 2 }));
  assert.throws(() => unframe(encoded.subarray(0, encoded.length - 1)), /does not match/u);
});
