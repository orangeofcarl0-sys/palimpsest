// Standalone probe. The service container never sees this file.
const assert = require("node:assert/strict");
const http2 = require("node:http2");

function reading(bytes) {
  let offset = 0;
  function varint() {
    let value = 0;
    let multiplier = 1;
    while (offset < bytes.length && multiplier <= 2 ** 49) {
      const byte = bytes[offset++];
      value += (byte & 127) * multiplier;
      if (byte < 128) return value;
      multiplier *= 128;
    }
    throw new Error("invalid varint");
  }
  let siteId, watts, atMs;
  while (offset < bytes.length) {
    const tag = varint();
    if (tag === 10 && siteId === undefined) {
      const size = varint();
      assert.ok(size <= bytes.length - offset);
      siteId = bytes.toString("utf8", offset, offset + size);
      offset += size;
    } else if (tag === 16 && watts === undefined) watts = varint();
    else if (tag === 24 && atMs === undefined) atMs = varint();
    else throw new Error("unexpected Reading field " + tag);
  }
  assert.ok(siteId !== undefined && watts !== undefined && atMs !== undefined);
  return { siteId, watts, atMs };
}

function rpc(client, method, siteId, limit) {
  const site = Buffer.from(siteId);
  const message = Buffer.from([10, site.length, ...site, ...(limit === undefined ? [] : [16, limit])]);
  const header = Buffer.alloc(5);
  header.writeUInt32BE(message.length, 1);
  const stream = client.request({
    ":method": "POST", ":path": "/energy.v1.EnergyService/" + method,
    "content-type": "application/grpc", te: "trailers",
  });
  return new Promise((resolve, reject) => {
    const chunks = [];
    let response, trailers;
    stream.on("response", value => { response = value; });
    stream.on("trailers", value => { trailers = value; });
    stream.on("error", reject);
    stream.setTimeout(3000, () => stream.destroy(new Error("RPC timeout")));
    stream.on("data", chunk => chunks.push(chunk));
    stream.on("end", () => {
      try {
        assert.equal(response?.[":status"], 200);
        assert.match(response?.["content-type"], /^application\/grpc(?:$|\+)/u);
        const status = trailers?.["grpc-status"] ?? response["grpc-status"];
        assert.match(status, /^(0|5)$/u);
        const body = Buffer.concat(chunks);
        const frames = [];
        let offset = 0;
        while (offset < body.length) {
          assert.ok(offset + 5 <= body.length && body[offset] === 0);
          const length = body.readUInt32BE(offset + 1);
          offset += 5;
          assert.ok(length > 0 && offset + length <= body.length);
          if (status === "0") frames.push(reading(body.subarray(offset, offset + length)));
          offset += length;
        }
        resolve({ status, frames });
      } catch (error) { reject(error); }
    });
    stream.end(Buffer.concat([header, message]));
  });
}

async function main() {
  const client = http2.connect("http://127.0.0.1:17753");
  client.on("error", () => {}); // the RPC stream reports connection failure
  try {
    const results = {};
    for (const [key, method, site, limit] of [
      ["zero", "StreamReadings", "site-a", 0],
      ["omitted", "StreamReadings", "site-a"],
      ["positive2", "StreamReadings", "site-a", 2],
      ["positive6", "StreamReadings", "site-a", 6],
      ["unknownStream", "StreamReadings", "site-zz", 0],
      ["unknownUnary", "GetReading", "site-zz"],
      ["unary", "GetReading", "site-a"],
    ]) results[key] = await rpc(client, method, site, limit);
    process.stdout.write(JSON.stringify(results));
  } finally { client.destroy(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
