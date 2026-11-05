"use strict";

/**
 * The REST baseline's own tests. They must stay green through the migration: the gRPC service has to
 * preserve the values and the error semantics they pin down, and the migration is not allowed to
 * delete a supported behaviour to make its own tests pass.
 */
const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");

const { createRestClient } = require("../service/rest_client.js");
const { createRestServer } = require("../service/rest_server.js");

let server;
let client;

before(async () => {
  server = createRestServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  client = createRestClient(server.address().port);
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("GET one reading returns the current sample", async () => {
  const reading = await client.getReading("site-a");
  assert.deepEqual(reading, { siteId: "site-a", watts: 4120, atMs: 1762300000000 });
});

test("GET readings honours the limit and preserves order", async () => {
  const readings = await client.getReadings("site-a", 3);
  assert.equal(readings.length, 3);
  assert.deepEqual(
    readings.map((reading) => reading.atMs),
    [1762300000000, 1762300060000, 1762300120000],
  );
});

test("an unknown site is an error, not an empty list", async () => {
  await assert.rejects(() => client.getReading("site-zz"), /unknown_site/u);
  await assert.rejects(() => client.getReadings("site-zz"), /unknown_site/u);
});
