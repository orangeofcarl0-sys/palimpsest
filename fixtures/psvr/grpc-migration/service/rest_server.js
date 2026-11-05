"use strict";

/**
 * The REST baseline: the behaviour the gRPC migration must preserve.
 *
 *   GET /sites/:id/reading        -> one Reading
 *   GET /sites/:id/readings?limit=N -> { readings: Reading[] }
 *   unknown site                  -> 404 { error: "unknown_site" }
 *
 * `createRestServer()` returns an unbound http.Server; the caller decides the port (tests use 0).
 */
const { createServer } = require("node:http");

const { readingFor, readingsFor } = require("./data.js");

function send(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  response.end(body);
}

function createRestServer() {
  return createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    const single = url.pathname.match(/^\/sites\/([^/]+)\/reading$/u);
    const list = url.pathname.match(/^\/sites\/([^/]+)\/readings$/u);
    if (single === null && list === null) return send(response, 404, { error: "not_found" });
    const siteId = decodeURIComponent((single ?? list)[1]);
    if (single !== null) {
      const reading = readingFor(siteId);
      return reading === null ? send(response, 404, { error: "unknown_site" }) : send(response, 200, reading);
    }
    const readings = readingsFor(siteId);
    if (readings === null) return send(response, 404, { error: "unknown_site" });
    const raw = url.searchParams.get("limit");
    const limit = raw === null ? readings.length : Number(raw);
    if (!Number.isInteger(limit) || limit < 0) return send(response, 400, { error: "invalid_limit" });
    return send(response, 200, { readings: readings.slice(0, limit) });
  });
}

module.exports = { createRestServer };
