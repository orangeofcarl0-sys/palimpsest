import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {departures} from "./board.mjs";
const feed=JSON.parse(readFileSync(new URL("./feed.json",import.meta.url)));
test("weekday noon departure",()=>assert.deepEqual(departures(feed,"River","2025-07-04T12:00:00Z",5).map(r=>r.tripId),["D1"]));
