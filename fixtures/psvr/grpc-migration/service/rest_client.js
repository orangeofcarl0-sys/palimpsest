"use strict";

/**
 * The REST client the migration must keep behaviourally compatible with.
 *
 * It returns plain objects (`{ siteId, watts, atMs }`) and rejects with the server's error code, so a
 * caller can switch transports without changing its own logic.
 */
const { request } = require("node:http");

function call(port, path) {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method: "GET" }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        const parsed = body === "" ? {} : JSON.parse(body);
        if (response.statusCode !== 200) {
          reject(new Error(parsed.error ?? `http_${String(response.statusCode)}`));
          return;
        }
        resolve(parsed);
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function createRestClient(port) {
  return {
    async getReading(siteId) {
      return await call(port, `/sites/${encodeURIComponent(siteId)}/reading`);
    },
    async getReadings(siteId, limit) {
      const query = limit === undefined ? "" : `?limit=${String(limit)}`;
      const body = await call(port, `/sites/${encodeURIComponent(siteId)}/readings${query}`);
      return body.readings;
    },
  };
}

module.exports = { createRestClient };
