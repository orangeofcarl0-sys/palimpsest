"use strict";

/**
 * Contract tests for the dispatch replay. P and S are separate recorded field
 * cases: P contains an actual live paint inversion, S suppresses the same
 * stale delivery and therefore contains no live display inversion. Neither
 * capture is allowed to be treated as a correction of the other.
 */
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");

const ROOT = join(__dirname, "..");

function replay(...args) {
  return spawnSync(process.execPath, ["handover/replay.mjs", ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

function jsonOf(run) {
  assert.equal(run.stderr, "");
  return JSON.parse(run.stdout);
}

test("P capture reproduces the live p17 display inversion", () => {
  const run = replay("--capture", "P", "--json", "--require-anomaly");
  assert.equal(run.status, 0, run.stderr);
  const result = jsonOf(run);
  assert.equal(result.capture.case, "P");
  assert.equal(result.capture.hashMatches, true);
  assert.equal(result.diagnosis.reproduced, true);
  assert.deepEqual(
    result.diagnosis.liveInversions.map((row) => ({
      panel: row.panel,
      sequence: row.sequence,
      highest: row.highestSequenceBefore,
    })),
    [{ panel: "p17", sequence: 40, highest: 41 }],
  );
  assert.equal(result.diagnosis.suppressedDeliveries.length, 0);
});

test("S capture is read as suppression, not as another paint", () => {
  const run = replay("--capture", "S", "--json");
  assert.equal(run.status, 0, run.stderr);
  const result = jsonOf(run);
  assert.equal(result.capture.case, "S");
  assert.equal(result.capture.hashMatches, true);
  assert.equal(result.diagnosis.reproduced, false);
  assert.deepEqual(result.diagnosis.liveInversions, []);
  assert.deepEqual(
    result.diagnosis.suppressedDeliveries.map((row) => ({
      panel: row.panel,
      sequence: row.sequence,
      event: row.event,
      wouldHaveInverted: row.wouldHaveInverted,
    })),
    [{ panel: "p17", sequence: 40, event: "S", wouldHaveInverted: true }],
  );
});

test("--require-anomaly exits 1 for S because there is no live inversion", () => {
  const run = replay("--capture", "S", "--json", "--require-anomaly");
  assert.equal(run.status, 1);
  const result = JSON.parse(run.stdout);
  assert.equal(result.diagnosis.reproduced, false);
  assert.deepEqual(result.diagnosis.liveInversions, []);
  assert.match(run.stderr, /Expected an actual live display inversion in capture S/u);
});

test("default replay diagnoses the active capture without merging cases", () => {
  const run = replay("--json");
  assert.equal(run.status, 0, run.stderr);
  const result = jsonOf(run);
  assert.ok(["P", "S"].includes(result.capture.case));
  assert.equal(result.diagnosis.reproduced, result.capture.case === "P");
  assert.equal(result.diagnosis.liveInversions.length, result.capture.case === "P" ? 1 : 0);
});
