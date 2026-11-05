"use strict";

/**
 * The integration test the migration is judged by: the PRODUCTION client against the PRODUCTION
 * server, with the REST baseline running beside it so "preserved behaviour" is an observed fact.
 */
const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");

const { FRAME_GAP_MS, createGrpcServer } = require("../service/grpc_server.js");
const { createGrpcClient } = require("../service/grpc_client.js");
const { createRestClient } = require("../service/rest_client.js");
const { createRestServer } = require("../service/rest_server.js");

let grpcServer;
let restServer;
let grpc;
let rest;

before(async () => {
  grpcServer = createGrpcServer(require("../service/data.js"));
  await new Promise((resolve) => grpcServer.listen(0, "127.0.0.1", resolve));
  restServer = createRestServer();
  await new Promise((resolve) => restServer.listen(0, "127.0.0.1", resolve));
  grpc = createGrpcClient(grpcServer.address().port);
  rest = createRestClient(restServer.address().port);
});

after(async () => {
  grpc.close();
  await new Promise((resolve) => grpcServer.close(resolve));
  await new Promise((resolve) => restServer.close(resolve));
});

test("gRPC GetReading returns the same reading as the REST baseline", async () => {
  const [migrated, baseline] = await Promise.all([grpc.getReading("site-a"), rest.getReading("site-a")]);
  assert.deepEqual(migrated, baseline);
});

test("the client receives each streamed reading before the stream ends", async () => {
  const arrivals = [];
  const readings = await grpc.streamReadings("site-b", 3, () => arrivals.push(Date.now()));
  assert.equal(readings.length, 3);
  const span = arrivals[arrivals.length - 1] - arrivals[0];
  assert.ok(
    span >= FRAME_GAP_MS * 2,
    `the callback fired as frames arrived (span ${String(span)}ms), not after the response ended`,
  );
  assert.deepEqual(readings, await rest.getReadings("site-b", 3));
});

test("an unknown site surfaces the server's error, not an empty result", async () => {
  await assert.rejects(() => grpc.getReading("site-zz"), /unknown_site/u);
});
