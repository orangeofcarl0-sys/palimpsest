#!/usr/bin/env node
"use strict";

/**
 * Runnable replay of the overnight Fleet rehearsal.
 *
 * It has two independent halves:
 *   1. Re-drives the committed gRPC/REST service to show the accepted service still returns
 *      source-ordered readings and the Fleet default of three.
 *   2. Rebuilds the recorded gateway/terminal timeline from the release-desk captures to show
 *      what actually reached the Birch board.
 *
 * Run from the repository root (or from anywhere):
 *   node handover/replay.mjs
 *
 * Exit code 0 means the recorded diagnosis reproduced exactly; 1 means it did not.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGrpcServer } = require("../service/grpc_server.js");
const { createGrpcClient } = require("../service/grpc_client.js");
const { createRestServer } = require("../service/rest_server.js");
const { createRestClient } = require("../service/rest_client.js");

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const evidence = (name) => read(`./evidence/${name}`);

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/u);
  const columns = lines.shift().split(",");
  return lines.map((line) => {
    const values = line.split(",");
    return Object.fromEntries(columns.map((column, index) => [column, values[index]]));
  });
}

function parseTerminal(text) {
  return text
    .split(/\r?\n/u)
    .filter((line) => /^\d{2}:\d{2}:\d{2}\t/u.test(line))
    .map((line) => {
      const [utc, panel, feed, sequence, req, event] = line.split("\t");
      return { utc, panel, feed, sequence: Number(sequence), req, event };
    });
}

function parseClock(clock) {
  const [hours, minutes] = clock.split(":").map(Number);
  return hours * 3600 + minutes * 60;
}

function formatClock(totalSeconds) {
  const seconds = ((totalSeconds % 86400) + 86400) % 86400;
  const hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}Z`;
}

function between(value, lower, upper) {
  return value >= lower && value <= upper;
}

function replayTimeline() {
  const inventory = parseCsv(evidence("inventory.csv"));
  const ingress = parseCsv(evidence("ingress.csv")).map((row) => ({
    ...row,
    sequence: Number(row.sequence),
    attempt: Number(row.attempt),
    grpc_status: Number(row.grpc_status),
  }));
  const terminal = parseTerminal(evidence("terminal.tsv"));
  const field = evidence("field.md");
  const reservation = evidence("reservation.md");
  const shiftMail = read("../operations/shift-mail.txt");

  const paints = terminal
    .filter((event) => event.event === "P")
    .sort((left, right) => left.utc.localeCompare(right.utc));

  const lastByBoard = new Map();
  const withoutGuard = paints.map((paint) => {
    const board = `${paint.panel}/${paint.feed}`;
    const previousSequence = lastByBoard.get(board) ?? null;
    const backwards = previousSequence !== null && paint.sequence < previousSequence;
    lastByBoard.set(board, paint.sequence);
    return { ...paint, board, previousSequence, backwards };
  });

  const guardedLastByBoard = new Map();
  const guardedAccepted = [];
  const guardedSuppressed = [];
  for (const paint of paints) {
    const board = `${paint.panel}/${paint.feed}`;
    const previousSequence = guardedLastByBoard.get(board) ?? null;
    if (previousSequence !== null && paint.sequence <= previousSequence) {
      guardedSuppressed.push({ ...paint, board, previousSequence });
      continue;
    }
    guardedLastByBoard.set(board, paint.sequence);
    guardedAccepted.push({ ...paint, board, previousSequence });
  }

  const byRequest = new Map();
  for (const row of ingress) {
    if (!byRequest.has(row.request)) byRequest.set(row.request, []);
    byRequest.get(row.request).push(row);
  }
  const duplicateRequests = [...byRequest.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([request, rows]) => ({
      request,
      attempts: rows.map((row) => ({
        utc: row.utc,
        attempt: row.attempt,
        sequence: row.sequence,
        grpcStatus: row.grpc_status,
      })),
      sameSequence: new Set(rows.map((row) => row.sequence)).size === 1,
      allDelivered: rows.every((row) => row.grpc_status === 0),
    }));

  const duplicatePaints = paints
    .filter((paint) => paint.req === "req-a")
    .map((paint) => ({ utc: paint.utc, panel: paint.panel, sequence: paint.sequence }));

  const livePanels = inventory
    .filter((row) => row.site === "Birch" && row.station_type === "live")
    .map((row) => row.panel);
  const tracedPanels = new Set(terminal.map((event) => event.panel));
  const missingLivePanels = livePanels.filter((panel) => !tracedPanels.has(panel));
  const trainingPanels = inventory
    .filter((row) => row.station_type === "training")
    .map((row) => `${row.site}/${row.panel} (${row.connection})`);

  const notebookClock = shiftMail.match(/B-12,\s*(\d{1,2}:\d{2})/u)?.[1];
  const utcOffsetHours = Number(field.match(/UTC\+(\d{2})/u)?.[1]);
  const fastSeconds = Number(field.match(/(\d+) seconds fast/u)?.[1]);
  const uncertaintySeconds = Number(field.match(/±(\d+) s/u)?.[1]);
  if (notebookClock === undefined || Number.isNaN(utcOffsetHours) || Number.isNaN(fastSeconds)) {
    throw new Error("field evidence is not in the expected form");
  }
  // Notebook time is rounded to the minute; the clock is fast and has a stated uncertainty.
  const baseUtcSeconds =
    parseClock(notebookClock) - utcOffsetHours * 3600 - fastSeconds;
  const fieldWindow = {
    notebookClock,
    clockOffset: `UTC+${String(utcOffsetHours).padStart(2, "0")}`,
    fastSeconds,
    uncertaintySeconds,
    roundingSeconds: 30,
    utcEarliest: formatClock(baseUtcSeconds - 30 - uncertaintySeconds),
    utcLatest: formatClock(baseUtcSeconds + 30 + uncertaintySeconds),
    utcBestEstimate: formatClock(baseUtcSeconds),
  };
  const p17Paints = paints.filter((paint) => paint.panel === "p17");
  const fieldNoteOverlapsP17 = p17Paints.some((paint) => {
    const [hours, minutes, seconds] = paint.utc.split(":").map(Number);
    return between(hours * 3600 + minutes * 60 + seconds, baseUtcSeconds - 42, baseUtcSeconds + 42);
  });

  const dashboard = parseCsv(read("../operations/dashboard.csv"));
  const grpcErrors = dashboard
    .filter((row) => row.series === "grpc_error")
    .reduce((total, row) => total + Number(row.value), 0);
  const grpcCompleted = dashboard
    .filter((row) => row.series === "grpc_completed")
    .map((row) => Number(row.value));

  return {
    inventory,
    ingress,
    terminal,
    fieldNote: field.trim(),
    reservation: reservation.trim(),
    paints,
    withoutGuard,
    guardedAccepted,
    guardedSuppressed,
    duplicateRequests,
    duplicatePaints,
    livePanels,
    missingLivePanels,
    trainingPanels,
    fieldWindow,
    fieldNoteOverlapsP17,
    edgeGreen: { grpcErrors, grpcCompleted },
  };
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
    const unary = await grpc.getReading("site-a");
    const zero = await grpc.getReadings("site-a", 0);
    const omitted = await grpc.getReadings("site-a");
    const explicit = await grpc.getReadings("site-a", 4);
    const duplicateFirst = await grpc.getReadings("site-a", 3);
    const duplicateSecond = await grpc.getReadings("site-a", 3);
    const restBaseline = await rest.getReadings("site-a", 3);

    let unknownSiteStatus;
    try {
      await grpc.getReading("site-zz");
    } catch (error) {
      unknownSiteStatus = error.grpcStatus;
    }

    const firstThree = [
      { siteId: "site-a", watts: 4120, atMs: 1762300000000 },
      { siteId: "site-a", watts: 4185, atMs: 1762300060000 },
      { siteId: "site-a", watts: 4090, atMs: 1762300120000 },
    ];
    const strictlyIncreasing = (readings) =>
      readings.every((reading, index) => index === 0 || reading.atMs > readings[index - 1].atMs);

    assert.deepEqual(unary, firstThree[0]);
    assert.deepEqual(zero, firstThree);
    assert.deepEqual(omitted, firstThree);
    assert.equal(explicit.length, 4);
    assert.ok(strictlyIncreasing(zero), "zero-limit readings are not in source order");
    assert.ok(strictlyIncreasing(omitted), "omitted-limit readings are not in source order");
    assert.ok(strictlyIncreasing(explicit), "explicit-limit readings are not in source order");
    assert.deepEqual(duplicateFirst, duplicateSecond);
    assert.deepEqual(duplicateFirst, restBaseline);
    assert.equal(unknownSiteStatus, 5);

    return {
      ok: true,
      unary,
      zeroLimitCount: zero.length,
      omittedLimitCount: omitted.length,
      explicitLimitCount: explicit.length,
      sourceOrder: zero.map((reading) => reading.atMs),
      duplicateDeliverySamePayload: true,
      restMatchesGrpc: true,
      unknownSiteGrpcStatus: unknownSiteStatus,
    };
  } finally {
    grpc.close();
    await Promise.all([
      new Promise((resolve) => grpcServer.close(resolve)),
      new Promise((resolve) => restServer.close(resolve)),
    ]);
  }
}

function makeChecks(timeline, service) {
  const backwards = timeline.withoutGuard.filter((paint) => paint.backwards);
  const expectedBackwards = backwards.some(
    (paint) =>
      paint.panel === "p17" &&
      paint.feed === "B" &&
      paint.previousSequence === 41 &&
      paint.sequence === 40 &&
      paint.utc === "22:03:17" &&
      paint.req === "req-a",
  );
  const duplicate = timeline.duplicateRequests.find((entry) => entry.request === "req-a");
  const guardCaught = timeline.guardedSuppressed.some(
    (paint) => paint.panel === "p17" && paint.sequence === 40 && paint.utc === "22:03:17",
  );

  return [
    {
      name: "service still serves the accepted contract",
      ok: service.ok,
      detail:
        "gRPC and REST return the same source-ordered readings; zero/omitted limit returns three",
    },
    {
      name: "the recorded boards contain a backward paint",
      ok: expectedBackwards,
      detail: expectedBackwards
        ? "p17/B painted sequence 40 at 22:03:17 after sequence 41 at 22:03:12"
        : "no 41 -> 40 paint on p17/B",
    },
    {
      name: "the backward paint is a duplicate request delivery",
      ok:
        duplicate !== undefined &&
        duplicate.sameSequence &&
        duplicate.allDelivered &&
        duplicate.attempts.length === 2,
      detail:
        duplicate === undefined
          ? "req-a was not duplicated"
          : `req-a attempts ${duplicate.attempts.map((attempt) => attempt.attempt).join(", ")} both delivered sequence ${duplicate.attempts[0].sequence} with grpc-status 0`,
    },
    {
      name: "a sequence guard stops the duplicate repaint",
      ok: guardCaught,
      detail: guardCaught
        ? "a board accepting only a strictly increasing sequence suppresses the second 40"
        : "the guard replay did not suppress the duplicate",
    },
    {
      name: "the field note is consistent with the p17 trace after clock correction",
      ok: timeline.fieldNoteOverlapsP17,
      detail: `${timeline.fieldWindow.notebookClock} local (${timeline.fieldWindow.clockOffset}, ${timeline.fieldWindow.fastSeconds}s fast) is ${timeline.fieldWindow.utcEarliest}..${timeline.fieldWindow.utcLatest} UTC, best estimate ${timeline.fieldWindow.utcBestEstimate}`,
    },
    {
      name: "the training simulator is separate from the live Birch boards",
      ok: timeline.trainingPanels.some((panel) => panel.startsWith("Birch/p71")),
      detail: timeline.trainingPanels.join(", ") || "no training station found",
    },
    {
      name: "the missing live-panel capture is recorded as an instrumentation gap",
      ok: timeline.missingLivePanels.includes("p23"),
      detail: `live Birch panels without terminal rows: ${timeline.missingLivePanels.join(", ") || "none"}`,
    },
    {
      name: "the platform edge metric stayed green",
      ok: timeline.edgeGreen.grpcErrors === 0,
      detail: `grpc_error=${String(timeline.edgeGreen.grpcErrors)}, grpc_completed=${timeline.edgeGreen.grpcCompleted.join("/")}`,
    },
  ];
}

async function main() {
  const timeline = replayTimeline();
  const service = await replayService();
  const checks = makeChecks(timeline, service);
  const ok = checks.every((check) => check.ok);
  const report = {
    schema: "fleet-rehearsal-replay/v1",
    archiveCheckpoint: "a48ad05c00f0f36a97df2750d606d64ed7ee0deb",
    ok,
    checks,
    service,
    edge: timeline.edgeGreen,
    timeline: {
      paints: timeline.paints,
      withoutGuard: timeline.withoutGuard,
      guardedAccepted: timeline.guardedAccepted,
      guardedSuppressed: timeline.guardedSuppressed,
    },
    diagnosis: {
      backwardPaint: timeline.withoutGuard.find((paint) => paint.backwards) ?? null,
      duplicateRequest: timeline.duplicateRequests.find((entry) => entry.request === "req-a") ?? null,
      duplicatePaints: timeline.duplicatePaints,
      fieldWindow: timeline.fieldWindow,
      fieldNote: timeline.fieldNote,
      missingLivePanels: timeline.missingLivePanels,
      trainingPanels: timeline.trainingPanels,
      reservation: timeline.reservation,
    },
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  process.stdout.write(
    `${JSON.stringify(
      {
        schema: "fleet-rehearsal-replay/v1",
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
});
