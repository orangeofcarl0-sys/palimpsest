"use strict";

/**
 * The gRPC service: HTTP/2 transport, `application/grpc` framing, and the two RPCs.
 *
 *   /energy.v1.EnergyService/GetReading      unary
 *   /energy.v1.EnergyService/StreamReadings  server-streaming, one Reading per frame
 *
 * The stream is deliberately written one frame at a time with a small gap, because the fleet client
 * renders samples as they arrive: buffering the whole answer and sending it at the end would look
 * identical on the wire only if the client waited for the response to end, which it does not.
 */
const http2 = require("node:http2");

const {
  decodeSiteRequest,
  decodeStreamRequest,
  encodeReading,
  encodeStatus,
  frame,
  unframe,
} = require("./wire.js");

const SERVICE = "/energy.v1.EnergyService";
const FRAME_GAP_MS = 60;

function fail(stream, status, message) {
  stream.respond({ ":status": 200, "content-type": "application/grpc" }, { waitForTrailers: true });
  stream.on("wantTrailers", () => {
    stream.sendTrailers({ "grpc-status": String(status), "grpc-message": encodeURIComponent(message) });
  });
  stream.end(frame(encodeStatus({ code: message, message })));
}

function createGrpcServer(source) {
  const server = http2.createServer();
  server.on("stream", (stream, headers) => {
    const path = headers[":path"];
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", () => undefined);
    stream.on("end", () => {
      let request;
      try {
        request = unframe(Buffer.concat(chunks));
      } catch {
        return fail(stream, 3, "invalid_request_frame");
      }
      if (path === `${SERVICE}/GetReading`) {
        const { siteId } = decodeSiteRequest(request);
        const reading = source.readingFor(siteId);
        if (reading === null) return fail(stream, 5, "unknown_site");
        stream.respond({ ":status": 200, "content-type": "application/grpc" }, { waitForTrailers: true });
        stream.on("wantTrailers", () => stream.sendTrailers({ "grpc-status": "0" }));
        stream.end(frame(encodeReading(reading)));
        return;
      }
      if (path === `${SERVICE}/StreamReadings`) {
        const { siteId, limit } = decodeStreamRequest(request);
        const readings = source.readingsFor(siteId);
        if (readings === null) return fail(stream, 5, "unknown_site");
        const bounded = readings.slice(0, Math.max(0, limit));
        stream.respond({ ":status": 200, "content-type": "application/grpc" }, { waitForTrailers: true });
        stream.on("wantTrailers", () => stream.sendTrailers({ "grpc-status": "0" }));
        let index = 0;
        const writeNext = () => {
          if (index >= bounded.length) {
            stream.end();
            return;
          }
          stream.write(frame(encodeReading(bounded[index])));
          index += 1;
          setTimeout(writeNext, FRAME_GAP_MS);
        };
        writeNext();
        return;
      }
      fail(stream, 12, "unimplemented");
    });
  });
  return server;
}

module.exports = { createGrpcServer, FRAME_GAP_MS };
