#!/usr/bin/env node
"use strict";

/**
 * Runnable replay for the overnight dispatch handover.
 *
 * It is deliberately self-contained: Node built-ins only, no service or traffic changes. It re-runs
 * the accepted service suite, exercises both transports, and re-checks the archived evidence that
 * supports the working diagnosis. A successful run prints a deterministic JSON receipt; any
 * disagreement throws and exits non-zero.
 *
 * Usage, from the repository root:
 *
 *   node handover/replay.mjs
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HANDOVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HANDOVER_DIR, "..");

const { createGrpcClient } = require(path.join(ROOT, "service/grpc_client.js"));
const { createGrpcServer } = require(path.join(ROOT, "service/grpc_server.js"));
const { createRestClient } = require(path.join(ROOT, "service/rest_client.js"));
const { createRestServer } = require(path.join(ROOT, "service/rest_server.js"));

function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

function readHandover(relativePath) {
  return readFileSync(path.join(HANDOVER_DIR, relativePath), "utf8");
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/u);
  const header = lines.shift().split(",");
  return lines.filter((line) => line !== "").map((line) => {
    const cells = line.split(",");
    assert.equal(cells.length, header.length, `unexpected CSV row: ${line}`);
    return Object.fromEntries(header.map((name, index) => [name, cells[index]]));
  });
}

function parseTsvData(text) {
  const lines = text.split(/\r?\n/u);
  const blank = lines.findIndex((line) => line.trim() === "");
  const rows = (blank === -1 ? lines : lines.slice(0, blank)).filter((line) => line !== "");
  const header = rows.shift().split("\t");
  return rows.map((line) => {
    const cells = line.split("\t");
    assert.equal(cells.length, header.length, `unexpected TSV row: ${line}`);
    return Object.fromEntries(header.map((name, index) => [name, cells[index]]));
  });
}

function minuteOfDay(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/u.exec(value);
  assert.ok(match, `startUtc must be HH:MM, got ${String(value)}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

function runNodeTests() {
  const result = spawnSync(process.execPath, ["--test"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const pass = Number(/(?:ℹ|#) pass (\d+)/u.exec(output)?.[1] ?? Number.NaN);
  const fail = Number(/(?:ℹ|#) fail (\d+)/u.exec(output)?.[1] ?? Number.NaN);
  assert.equal(result.status, 0, `node --test failed:\n${output}`);
  assert.equal(fail, 0, `node --test reported ${String(fail)} failure(s)`);
  assert.ok(Number.isInteger(pass) && pass > 0, "could not read the node --test pass count");
  return { exitCode: result.status, pass, fail };
}

async function collect(iterable) {
  const values = [];
  for await (const value of iterable) values.push(value);
  return values;
}

async function replayService() {
  const grpcServer = createGrpcServer();
  const restServer = createRestServer();
  await Promise.all([
    new Promise((resolve) => grpcServer.listen(0, "127.0.0.1", resolve)),
    new Promise((resolve) => restServer.listen(0, "127.0.0.1", resolve)),
  ]);
  const grpc = createGrpcClient(grpcServer.address().port);
  const rest = createRestClient(restServer.address().port);

  try {
    const explicitThree = await grpc.getReadings("site-a", 3);
    const zeroLimit = await collect(grpc.streamReadings("site-a", 0));
    const omittedLimit = await collect(grpc.streamReadings("site-a"));
    assert.deepEqual(zeroLimit, explicitThree, "zero limit did not use the Fleet default of three");
    assert.deepEqual(omittedLimit, explicitThree, "omitted limit did not use the Fleet default of three");
    assert.deepEqual(
      explicitThree.map((reading) => reading.atMs),
      [1762300000000, 1762300060000, 1762300120000],
      "readings are not in source order",
    );

    const restThree = await rest.getReadings("site-a", 3);
    assert.deepEqual(explicitThree, restThree, "gRPC and REST readings differ");
    assert.deepEqual(await grpc.getReading("site-a"), await rest.getReading("site-a"));
    assert.equal((await grpc.getReadings("site-b")).length, 3, "site-b should return all three readings");

    // A retried request is stateless at the service: the same request returns the same values.
    // Ordering against a newer in-flight request belongs to the transport/panel, not this RPC.
    assert.deepEqual(await grpc.getReadings("site-a", 3), explicitThree, "a retry returned different data");

    await assert.rejects(
      () => grpc.getReading("site-zz"),
      (error) => error.grpcStatus === 5 && /unknown_site/u.test(error.message),
      "unknown site did not return NOT_FOUND/unknown_site",
    );

    return {
      transports: ["gRPC", "REST"],
      explicitLimit: explicitThree.length,
      zeroLimit: zeroLimit.length,
      omittedLimit: omittedLimit.length,
      sourceOrder: explicitThree.map((reading) => reading.atMs),
      unknownSite: "grpc-status 5 / unknown_site",
      retryIsStateless: true,
    };
  } finally {
    grpc.close();
    await Promise.all([
      new Promise((resolve) => grpcServer.close(resolve)),
      new Promise((resolve) => restServer.close(resolve)),
    ]);
  }
}

function replayDashboard() {
  const rows = parseCsv(read("operations/dashboard.csv"));
  const bySeries = (series) => rows.filter((row) => row.series === series);
  const grpcErrors = bySeries("grpc_error").reduce((total, row) => total + Number(row.value), 0);
  assert.equal(grpcErrors, 0, "the dashboard shows edge gRPC errors");
  assert.deepEqual(
    bySeries("grpc_completed").map((row) => Number(row.value)),
    [480, 482],
    "the edge completion counters changed",
  );

  const uploads = bySeries("console_upload");
  assert.equal(uploads.length, 1, "expected one console_upload row");
  assert.equal(uploads[0].value, "1");
  assert.equal(uploads[0].population, "Birch/2");
  assert.equal(uploads[0].utc_minute, "22:03");

  const holds = bySeries("rollout_hold");
  assert.equal(holds.length, 1, "expected one rollout_hold row");
  assert.equal(holds[0].value, "0");
  assert.equal(holds[0].utc_minute, "22:04");

  const bench = spawnSync(process.execPath, ["bench/check.mjs"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(bench.status, 0, `bench/check.mjs failed: ${bench.stderr ?? ""}`);
  assert.deepEqual(JSON.parse(bench.stdout.trim()), { edgeErrors: 0, decision: "continue" });

  const benchSource = read("bench/check.mjs");
  assert.ok(benchSource.includes('"grpc_error"'), "bench/check.mjs no longer checks grpc_error");
  const blindSpots = ["console_upload", "rollout_hold", "freshness/order"].filter(
    (topic) => !benchSource.includes(topic),
  );
  assert.deepEqual(blindSpots, ["console_upload", "rollout_hold", "freshness/order"]);

  return {
    utcMinutes: rows.map((row) => row.utc_minute),
    grpcCompleted: bySeries("grpc_completed").map((row) => Number(row.value)),
    grpcErrors,
    consoleUpload: `${uploads[0].value} panel(s), ${uploads[0].population}`,
    rolloutHold: `${holds[0].value} site(s), ${holds[0].population}`,
    bench: { edgeErrors: 0, decision: "continue", blindSpots },
  };
}

function replayArchive() {
  const registry = parseCsv(read("operations/registry.csv"));
  const olderB12 = registry.find((row) => row.export === "older" && row.alias === "B-12");
  const currentBirch = registry.find((row) => row.export === "current" && row.alias === "Birch");
  assert.equal(olderB12?.assignment, "Birch training", "B-12 is not the older training alias");
  assert.equal(currentBirch?.assignment, "B-12 plus B-13", "current Birch alias mapping changed");

  const inventory = parseCsv(readHandover("archive/inventory.csv"));
  const liveBirch = inventory.filter((row) => row.site === "Birch" && row.station_type === "live");
  const liveAlder = inventory.filter((row) => row.site === "Alder" && row.station_type === "live");
  assert.deepEqual(liveBirch.map((row) => row.panel), ["p17", "p23"]);
  assert.deepEqual(liveAlder.map((row) => row.panel), ["p04", "p09"]);
  assert.ok(
    inventory.some(
      (row) => row.site === "Birch" && row.connection === "sim-4" && row.panel === "p71" && row.station_type === "training",
    ),
    "the Birch training simulator is missing from inventory",
  );

  const ingress = parseCsv(readHandover("archive/ingress.csv")).map((row) => ({
    ...row,
    sequence: Number(row.sequence),
    attempt: Number(row.attempt),
    grpc_status: Number(row.grpc_status),
  }));
  const retry = ingress.filter((row) => row.request === "req-a" && row.feed === "B");
  const newer = ingress.find((row) => row.request === "req-b" && row.feed === "B");
  assert.deepEqual(retry.map((row) => ({ sequence: row.sequence, attempt: row.attempt })), [
    { sequence: 40, attempt: 1 },
    { sequence: 40, attempt: 2 },
  ]);
  assert.ok(newer, "req-b is missing from ingress");
  assert.ok(retry[0].utc < newer.utc && newer.utc < retry[1].utc);
  assert.ok(retry[1].sequence < newer.sequence, "the retry is not an older sequence");
  assert.ok(retry[1].grpc_status === 0 && newer.grpc_status === 0);
  const simulator = ingress.find((row) => row.request === "req-d");
  assert.equal(simulator?.connection, "sim-4");
  assert.equal(simulator?.sequence, 39);

  const terminal = parseTsvData(readHandover("archive/terminal.tsv"));
  const p17Paints = terminal
    .filter((row) => row.panel === "p17" && row.event === "P")
    .map((row) => Number(row.sequence));
  assert.deepEqual(p17Paints, [40, 41]);
  const p17Suppression = terminal.find((row) => row.panel === "p17" && row.event === "S");
  assert.equal(p17Suppression?.req, "req-a");
  assert.equal(p17Suppression?.sequence, "40");
  const p71Paints = terminal
    .filter((row) => row.panel === "p71" && row.event === "P")
    .map((row) => Number(row.sequence));
  assert.deepEqual(p71Paints, [39]);
  const sampledPanels = [...new Set(terminal.map((row) => row.panel))];

  const field = readHandover("archive/field.txt");
  for (const phrase of [
    "UTC+01",
    "52 seconds fast",
    "±12 s",
    "rounded to the minute",
    "Cannot establish whether the board was p17 or the adjacent simulator",
    "B-13 uploader was unplugged for the whole rehearsal",
    "retained no local recording",
  ]) {
    assert.ok(field.includes(phrase), `field amendment is missing: ${phrase}`);
  }

  const reservation = readHandover("archive/reservation.txt");
  for (const phrase of [
    "CAP-08",
    "Cedar has the only REST overflow lane from 06:00 to 06:30Z",
    "No second lane has been commissioned",
    "A hold may park an affected pilot without moving traffic to REST",
    "the request has not been made",
    "No field authority has accepted a production switch",
  ]) {
    assert.ok(reservation.includes(phrase), `reservation record is missing: ${phrase}`);
  }

  return {
    alias: { olderB12: olderB12.assignment, currentBirch: currentBirch.assignment },
    inventory: {
      liveBirch: liveBirch.map((row) => row.panel),
      liveAlder: liveAlder.map((row) => row.panel),
      trainingSimulator: "sim-4/p71",
    },
    ingress: {
      staleRetry: {
        request: retry[1].request,
        feed: retry[1].feed,
        sequence: retry[1].sequence,
        attempt: retry[1].attempt,
        afterNewerSequence: newer.sequence,
        grpcStatus: retry[1].grpc_status,
      },
      simulatorReading: { connection: simulator.connection, sequence: simulator.sequence },
    },
    terminal: {
      sampledPanels,
      liveBirchPaints: p17Paints,
      liveBirchSuppressed: `${p17Suppression.req}/sequence ${p17Suppression.sequence}`,
      simulatorPaints: p71Paints,
      note: "the trace covers p17/p04/p09/p71; live Birch p23 is not represented",
    },
    field: {
      clock: "UTC+01, 52 seconds fast at 22:10Z (±12 s), minute-rounded",
      terminalUncertain: true,
      b13Uploader: "unplugged for the whole rehearsal; no local recording",
    },
    reservation: {
      ticket: "CAP-08",
      cedarRestOverflowWindow: "06:00-06:30Z",
      secondLane: false,
      parkDoesNotMoveTraffic: true,
      productionSwitchAccepted: false,
    },
  };
}

function replayProposal() {
  const proposal = JSON.parse(readHandover("proposal.json"));
  const actions = new Set(["observe", "park", "overflow"]);
  assert.ok(actions.has(proposal.birch), `invalid birch action: ${String(proposal.birch)}`);
  assert.ok(actions.has(proposal.cedar), `invalid cedar action: ${String(proposal.cedar)}`);
  const start = minuteOfDay(proposal.startUtc);
  const laneStart = minuteOfDay("06:00");
  const laneEnd = minuteOfDay("06:30");
  assert.ok(start >= laneStart && start <= laneEnd, "startUtc is outside Cedar's booked overflow lane");
  return {
    startUtc: proposal.startUtc,
    birch: proposal.birch,
    cedar: proposal.cedar,
    cedarLane: "06:00-06:30Z",
    insideCedarLane: true,
  };
}

async function main() {
  const tests = runNodeTests();
  const service = await replayService();
  const dashboard = replayDashboard();
  const archive = replayArchive();
  const proposal = replayProposal();

  const receipt = {
    replay: "overnight-dispatch-handover/v1",
    ok: true,
    command: "node handover/replay.mjs",
    tests,
    service,
    dashboard,
    archive,
    diagnosis: {
      conclusion:
        "No service-side backwards reading is supported. The live Birch panel p17 painted 40 then 41 and suppressed the retried older 40. The retry is a transport sequence, and the field note is alias/time-ambiguous with a training simulator.",
      staleRetryExplainsBackwards: true,
      livePanelSuppressionWorked: true,
      trainingSimulatorPaint: "p71/B/39",
      fieldObservationAttribution: "unresolved between live p17 and training simulator",
      serviceRegressionEvidence: "none",
      instrumentationGaps: [
        "B-13 uploader unplugged; its screen retained no local recording",
        "terminal trace covers p17/p04/p09/p71; live Birch p23 is not represented",
        "bench/check.mjs ignores console_upload and rollout_hold and cannot test freshness/order",
        "no maximum stale interval was agreed for the rehearsal",
      ],
    },
    proposal,
    productionAuthority: "release owner only; this replay is not a traffic change or approval",
  };

  console.log(JSON.stringify(receipt, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      { replay: "overnight-dispatch-handover/v1", ok: false, error: String(error?.stack ?? error) },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
