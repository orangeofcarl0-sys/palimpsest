"use strict";

/**
 * The fleet console's client.
 *
 * `streamReadings` calls `onReading` for each frame AS IT ARRIVES and resolves with the collected
 * list. It never waits for the response to end before invoking the callback: that is the difference
 * this migration exists to deliver.
 */
const http2 = require("node:http2");

const {
  decodeReading,
  decodeStatus,
  drainFrames,
  encodeSiteRequest,
  encodeStreamRequest,
  frame,
} = require("./wire.js");

const SERVICE = "/energy.v1.EnergyService";

function createGrpcClient(port) {
  const session = http2.connect(`http://127.0.0.1:${String(port)}`);
  session.on("error", () => undefined);

  function call(path, payload, onMessage) {
    return new Promise((resolve, reject) => {
      const stream = session.request({
        ":method": "POST",
        ":path": path,
        "content-type": "application/grpc",
        "te": "trailers",
      });
      let buffered = Buffer.alloc(0);
      const messages = [];
      let status = null;
      let message = "";
      stream.on("response", (headers) => {
        status = headers["grpc-status"] === undefined ? null : String(headers["grpc-status"]);
      });
      stream.on("trailers", (headers) => {
        status = String(headers["grpc-status"] ?? "0");
        message = headers["grpc-message"] === undefined ? "" : decodeURIComponent(String(headers["grpc-message"]));
      });
      stream.on("data", (chunk) => {
        buffered = Buffer.concat([buffered, chunk]);
        const drained = drainFrames(buffered);
        buffered = drained.rest;
        for (const encoded of drained.messages) {
          const decoded = onMessage(encoded);
          messages.push(decoded);
        }
      });
      stream.on("error", reject);
      stream.on("end", () => {
        if (status !== null && status !== "0") {
          reject(Object.assign(new Error(message === "" ? `grpc_status_${status}` : message), { code: Number(status) }));
          return;
        }
        resolve(messages);
      });
      stream.end(frame(payload));
    });
  }

  return {
    async getReading(siteId) {
      const messages = await call(`${SERVICE}/GetReading`, encodeSiteRequest({ siteId }), decodeReading);
      return messages[0];
    },
    async streamReadings(siteId, limit, onReading) {
      return await call(`${SERVICE}/StreamReadings`, encodeStreamRequest({ siteId, limit }), (encoded) => {
        const reading = decodeReading(encoded);
        if (typeof onReading === "function") onReading(reading);
        return reading;
      });
    },
    close() {
      session.close();
    },
  };
}

module.exports = { createGrpcClient, decodeStatus };
