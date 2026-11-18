#!/usr/bin/env node
/**
 * Replay the overnight Fleet reading-order incident from the archived evidence.
 *
 * This script is deliberately read-only. It does not start the service, move
 * traffic, call the release desk, or change the repository.
 *
 * Usage:
 *   node handover/replay.mjs             # readable summary
 *   node handover/replay.mjs --json      # machine-readable result
 *   node handover/replay.mjs --require-anomaly
 *                                        # exit 1 unless the live inversion is reproduced
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const args = new Set(process.argv.slice(2));

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/u).filter((line) => line !== "");
  if (lines.length === 0) return [];
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ""]));
  });
}

function parseTerminal(text) {
  const lines = text.trim().split(/\r?\n/u);
  const header = lines[0].split("\t");
  return lines
    .slice(1)
    .filter((line) => /^\d{2}:\d{2}:\d{2}\t/u.test(line))
    .map((line) => {
      const cells = line.split("\t");
      return Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ""]));
    });
}

function secondsOfDay(clock) {
  const match = /^(\d{2}):(\d{2}):(\d{2})Z?$/u.exec(clock);
  if (match === null) throw new Error(`bad clock: ${clock}`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function clockOfSeconds(seconds) {
  const normalized = ((seconds % 86400) + 86400) % 86400;
  const hours = Math.floor(normalized / 3600);
  const minutes = Math.floor((normalized % 3600) / 60);
  const secs = normalized % 60;
  return [hours, minutes, secs].map((value) => String(value).padStart(2, "0")).join(":");
}

function keyOf(...parts) {
  return parts.join("\u0000");
}

const inventory = parseCsv(read("handover/evidence/inventory.csv"));
const ingress = parseCsv(read("handover/evidence/ingress.csv"));
const terminal = parseTerminal(read("handover/evidence/terminal.tsv"));
const dashboard = parseCsv(read("operations/dashboard.csv"));
const registry = parseCsv(read("operations/registry.csv"));
const fieldArchive = read("handover/evidence/field-archive.txt").trim();
const fieldNote = read("handover/evidence/field-note.txt").trim();
const reservation = read("handover/evidence/reservation.txt").trim();

const panels = new Map(inventory.map((row) => [row.panel, row]));
const panelName = (panel) => panels.get(panel)?.site ?? "unknown";
const panelClass = (panel) => panels.get(panel)?.station_type ?? "unknown";

// Transport success: every archived ingress call returned grpc-status 0 and the
// dashboard's aggregate error counter is zero. This is what "delivery green"
// covers; it says nothing about whether a panel painted a newer value last.
const ingressFailures = ingress.filter((row) => Number(row.grpc_status) !== 0);
const dashboardErrors = dashboard
  .filter((row) => row.series === "grpc_error")
  .reduce((total, row) => total + Number(row.value), 0);
const dashboardCompletions = dashboard
  .filter((row) => row.series === "grpc_completed")
  .reduce((last, row) => Number(row.value), 0);
const dashboardHolds = dashboard
  .filter((row) => row.series === "rollout_hold")
  .reduce((last, row) => Number(row.value), 0);
const transportGreen = ingressFailures.length === 0 && dashboardErrors === 0;

// Find requests that were attempted more than once. A retry is "stale" when a
// different, newer sequence already reached the same feed before the retry.
const attemptsByRequest = new Map();
for (const row of ingress) {
  const key = keyOf(row.connection, row.request);
  if (!attemptsByRequest.has(key)) attemptsByRequest.set(key, []);
  attemptsByRequest.get(key).push(row);
}

const duplicateRequests = [];
const staleRetries = [];
for (const rows of attemptsByRequest.values()) {
  if (rows.length < 2) continue;
  rows.sort((left, right) => secondsOfDay(left.utc) - secondsOfDay(right.utc));
  duplicateRequests.push({
    connection: rows[0].connection,
    request: rows[0].request,
    feed: rows[0].feed,
    sequence: Number(rows[0].sequence),
    attempts: rows.map((row) => ({ utc: row.utc, attempt: Number(row.attempt), grpcStatus: Number(row.grpc_status) })),
  });
  for (const retry of rows.filter((row) => Number(row.attempt) > 1)) {
    const newer = ingress.filter(
      (candidate) =>
        candidate.feed === retry.feed &&
        candidate.request !== retry.request &&
        Number(candidate.sequence) > Number(retry.sequence) &&
        secondsOfDay(candidate.utc) < secondsOfDay(retry.utc),
    );
    if (newer.length === 0) continue;
    staleRetries.push({
      request: retry.request,
      attempt: Number(retry.attempt),
      retryUtc: retry.utc,
      replayedSequence: Number(retry.sequence),
      alreadyDeliveredNewer: newer.map((row) => ({
        request: row.request,
        sequence: Number(row.sequence),
        utc: row.utc,
      })),
    });
  }
}

// Reconstruct what each panel painted, in archive order, and flag a sequence
// that moves backwards on that panel.
const terminalByPanel = new Map();
for (const row of terminal) {
  if (!terminalByPanel.has(row.panel)) terminalByPanel.set(row.panel, []);
  terminalByPanel.get(row.panel).push(row);
}

const panelTraces = [];
const inversions = [];
for (const [panel, rows] of terminalByPanel.entries()) {
  rows.sort((left, right) => secondsOfDay(left.utc) - secondsOfDay(right.utc));
  let highest = -Infinity;
  let previous = null;
  for (const row of rows) {
    const sequence = Number(row.sequence);
    if (sequence < highest) {
      inversions.push({
        panel,
        site: panelName(panel),
        stationType: panelClass(panel),
        utc: row.utc,
        request: row.req,
        sequence,
        previousPaint: previous === null ? null : { utc: previous.utc, request: previous.req, sequence: Number(previous.sequence) },
        highestSequenceBefore: highest,
      });
    }
    highest = Math.max(highest, sequence);
    previous = row;
  }
  panelTraces.push({
    panel,
    site: panelName(panel),
    stationType: panelClass(panel),
    paints: rows.map((row) => ({
      utc: row.utc,
      feed: row.feed,
      sequence: Number(row.sequence),
      request: row.req,
      event: row.event,
    })),
  });
}

const liveInversions = inversions.filter((row) => row.stationType === "live");
const trainingInversions = inversions.filter((row) => row.stationType === "training");

// The field note's local wall time is not an export timestamp. B-12's clock is
// UTC+01, 52 s fast (+/- 12 s), and the notebook rounded to the minute.
const offsetMatch = /UTC([+-])(\d{2})/u.exec(fieldArchive);
const driftMatch = /(\d+) seconds fast/u.exec(fieldArchive);
const uncertaintyMatch = /±(\d+) s/u.exec(fieldArchive);
const localMatch = /B-12,\s*(\d{2}):(\d{2})/u.exec(fieldNote);
const offsetHours = offsetMatch === null ? null : Number(offsetMatch[2]) * (offsetMatch[1] === "-" ? -1 : 1);
const driftSeconds = driftMatch === null ? null : Number(driftMatch[1]);
const uncertaintySeconds = uncertaintyMatch === null ? null : Number(uncertaintyMatch[1]);
let fieldWindow = null;
let fieldApprox = null;
if (localMatch !== null && offsetHours !== null && driftSeconds !== null && uncertaintySeconds !== null) {
  const localSeconds = Number(localMatch[1]) * 3600 + Number(localMatch[2]) * 60;
  const corrected = localSeconds - offsetHours * 3600 - driftSeconds;
  const roundingSeconds = 30; // a minute-rounded note can be +/- 30 s
  const margin = roundingSeconds + uncertaintySeconds;
  fieldApprox = `${clockOfSeconds(corrected)}Z`;
  fieldWindow = {
    fromUtc: `${clockOfSeconds(corrected - margin)}Z`,
    toUtc: `${clockOfSeconds(corrected + margin)}Z`,
    marginSeconds: margin,
  };
}

const relevantAliases = registry.filter((row) => ["B-12", "B-13", "relay-9", "A-02", "A-03"].includes(row.alias));
const b12Rows = registry.filter((row) => row.alias === "B-12" || row.assignment.includes("B-12"));
const b12Site =
  b12Rows
    .map((row) => row.assignment.match(/^(Birch|Alder|Cedar|Dune)\b/u)?.[1])
    .find((site) => site !== undefined) ?? "Birch";

const diagnosis = {
  reproduced: liveInversions.length > 0 && staleRetries.length > 0,
  summary:
    liveInversions.length > 0 && staleRetries.length > 0
      ? "A successful retry replayed an older sequence onto a live Birch panel after a newer sequence had already painted, so the live board moved backwards even though every RPC was green. The adjacent training simulator painted a lower number at the same time, which the field note cannot reliably distinguish from the live board."
      : "The archived evidence does not reproduce a live panel inversion together with a stale retry.",
  transportGreen,
  liveInversions,
  trainingInversions,
  staleRetries,
  serviceDataRegression: false,
  trafficChange: "none proposed by replay; release owner owns traffic",
};

const result = {
  schema: "fleet-night-shift-replay/v1",
  inputs: {
    inventory: "handover/evidence/inventory.csv",
    ingress: "handover/evidence/ingress.csv",
    terminal: "handover/evidence/terminal.tsv",
    fieldArchive: "handover/evidence/field-archive.txt",
    fieldNote: "handover/evidence/field-note.txt",
    reservation: "handover/evidence/reservation.txt",
    dashboard: "operations/dashboard.csv",
    registry: "operations/registry.csv",
  },
  transport: {
    green: transportGreen,
    ingressFailures,
    dashboardGrpcErrors: dashboardErrors,
    lastGrpcCompleted: dashboardCompletions,
    schedulerPlannedHolds: dashboardHolds,
  },
  duplicateRequests,
  staleRetries,
  panels: panelTraces,
  liveInversions,
  trainingInversions,
  field: {
    localNotebookTime: localMatch === null ? null : `${localMatch[1]}:${localMatch[2]}`,
    clockOffsetHours: offsetHours,
    clockFastSeconds: driftSeconds,
    clockUncertaintySeconds: uncertaintySeconds,
    correctedApproxUtc: fieldApprox,
    correctedWindowUtc: fieldWindow,
    siteFromB12Alias: b12Site,
    boardsInWindow: panelTraces
      .filter((trace) =>
        trace.site === b12Site &&
        trace.paints.some((paint) => {
          if (fieldWindow === null) return false;
          const seconds = secondsOfDay(paint.utc);
          return seconds >= secondsOfDay(fieldWindow.fromUtc) && seconds <= secondsOfDay(fieldWindow.toUtc);
        }),
      )
      .map((trace) => ({ panel: trace.panel, site: trace.site, stationType: trace.stationType })),
    ambiguous: true,
    note: "The field note alone does not identify p17 or p71; the ingress/terminal records do.",
  },
  registryAliases: relevantAliases,
  reservation,
  limits: [
    "The terminal trace is sampled by panel, not by request; p23 has no terminal row in this archive.",
    "B-13's uploader was unplugged for the rehearsal and retained no local recording.",
    "The field note's minute is rounded, its clock was 52 s fast (+/- 12 s), and it cannot distinguish p17 from the adjacent training simulator.",
    "No maximum stale-data duration was agreed, so this replay can establish ordering but not a freshness SLO.",
    "The dashboard is aggregate; its zero grpc_error count cannot detect a successfully delivered duplicate or an out-of-order paint.",
  ],
  diagnosis,
};

if (args.has("--json")) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  console.log("Fleet reading-order replay");
  console.log("==========================");
  console.log(`Transport green: ${transportGreen ? "yes" : "no"} (ingress failures: ${ingressFailures.length}, dashboard grpc_error: ${dashboardErrors})`);
  console.log(`Dashboard grpc_completed (last): ${dashboardCompletions}; scheduler-planned rollout_hold: ${dashboardHolds}`);
  if (duplicateRequests.length > 0) {
    for (const duplicate of duplicateRequests) {
      console.log(`Retried request: ${duplicate.request} on ${duplicate.connection}, sequence ${duplicate.sequence}, attempts ${duplicate.attempts.map((attempt) => attempt.utc).join(" / ")}`);
    }
  }
  for (const stale of staleRetries) {
    const newer = stale.alreadyDeliveredNewer
      .map((row) => `${row.request} sequence ${row.sequence} at ${row.utc}`)
      .join(", ");
    console.log(`Stale retry: ${stale.request} attempt ${stale.attempt} at ${stale.retryUtc} replayed sequence ${stale.replayedSequence} after ${newer}`);
  }
  for (const trace of panelTraces) {
    console.log(
      `Panel ${trace.panel} (${trace.site}, ${trace.stationType}): ${trace.paints
        .map((paint) => `${paint.utc} ${paint.request}->${paint.sequence}`)
        .join("; ")}`,
    );
  }
  if (liveInversions.length === 0) {
    console.log("Live inversions: none");
  } else {
    for (const inversion of liveInversions) {
      console.log(
        `LIVE INVERSION: ${inversion.panel} (${inversion.site}) painted ${inversion.sequence} at ${inversion.utc} after sequence ${inversion.highestSequenceBefore}`,
      );
    }
  }
  if (trainingInversions.length > 0) {
    console.log(`Training inversions (not live traffic): ${trainingInversions.map((row) => row.panel).join(", ")}`);
  }
  if (fieldWindow !== null) {
    console.log(
      `Field note: B-12 local ${result.field.localNotebookTime}, clock UTC${offsetHours >= 0 ? "+" : ""}${offsetHours} and ${driftSeconds}s fast; corrected ~${fieldApprox} (window ${fieldWindow.fromUtc}..${fieldWindow.toUtc}).`,
    );
    console.log(
      `Boards active in that window: ${result.field.boardsInWindow
        .map((board) => `${board.panel} (${board.site}, ${board.stationType})`)
        .join(", ")}. The note cannot choose between them.`,
    );
  }
  console.log(`Diagnosis: ${diagnosis.summary}`);
  console.log(`Reproduced: ${diagnosis.reproduced ? "yes" : "no"}; service data regression: no; traffic action: release owner.`);
}

if (args.has("--require-anomaly") && !diagnosis.reproduced) {
  process.stderr.write("Expected the live stale-retry inversion, but the archived evidence did not reproduce it.\n");
  process.exitCode = 1;
}
