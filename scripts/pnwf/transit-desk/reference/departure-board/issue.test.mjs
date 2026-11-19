import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {departures} from "./board.mjs";

test("Friday late service and Saturday's extra trip share one passenger window", () => {
  const feed = JSON.parse(readFileSync(new URL("./feed.json", import.meta.url)));
  const rows = departures(feed, "River", "2025-07-05T00:00:00Z", 30);
  assert.deepEqual(rows.map(({tripId, serviceDate}) => [tripId, serviceDate]), [
    ["R7", "2025-07-04"], ["X3", "2025-07-05"],
  ]);
});
