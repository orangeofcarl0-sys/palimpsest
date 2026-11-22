/** The bench custodian receives a request record and the holder's own measurement file. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { digest, readJson, receiptId } from "./tools.mjs";

const [requestPath, rawPath] = process.argv.slice(2);
const request = readJson(requestPath);
assert(request.state === "PENDING" && /^lac-[a-f0-9]{64}$/u.test(request.checkpointId));
assert.equal(request.reviewer, "bench-custodian");
const raw = readFileSync(rawPath);
const measurement = JSON.parse(raw);
assert(Object.values(measurement.minutes).every((value) => Number.isInteger(value) && value > 0));
const body = {
  projectId: request.projectId, requestId: request.id, checkpointId: request.checkpointId,
  reviewer: request.reviewer, sourceSha256: digest(raw), measurement,
};
console.log(JSON.stringify({ id: receiptId(body), ...body }));
