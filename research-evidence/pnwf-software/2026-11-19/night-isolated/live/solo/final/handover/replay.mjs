#!/usr/bin/env node
/**
 * Replay the overnight Fleet reading-order evidence.
 *
 * This script is deliberately read-only. It does not start the service, move
 * traffic, call the release desk, or change the repository.
 *
 * The dispatch catalogue contains two separate recorded field cases:
 *
 *   P  capture in handover/evidence/captures/P.tsv
 *   S  capture in handover/evidence/captures/S.tsv
 *
 * P and S are not corrections of one another, even where their timestamps or
 * request IDs match. Each run diagnoses the one capture it was asked to read.
 * An S row is a suppressed transport delivery, not a paint, so it cannot by
 * itself create a live display inversion.
 *
 * Usage:
 *   node handover/replay.mjs                       # active terminal.tsv (P)
 *   node handover/replay.mjs --capture P           # the P case
 *   node handover/replay.mjs --capture S           # the S case
 *   node handover/replay.mjs --terminal path.tsv   # an explicit capture
 *   node handover/replay.mjs --json                # machine-readable result
 *   node handover/replay.mjs --require-anomaly     # exit 1 unless a live inversion is present
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const KNOWN_CAPTURES = {
  P: {
    sha256: "c76bb857f8877413ffa91cbd9d736a09053c09ba94afb3ed1fe7bd500b8bc68a",
    source: "4f80c3bd5d606e2a2192fd56badb4a138d139ee2",
  },
  S: {
    sha256: "77f6d9a53429c6c081d51aef62b5bfd68fd23bfac5df1ff9208997812d5caa5e",
    source: "584d61c4bd5ae71bcb1fa687e9b3ad053da4f509",
  },
};

const CAPTURE_CANDIDATES = {
  P: [
    "handover/evidence/captures/P.tsv",
    "/run/dispatch-records/P.tsv",
    "handover/evidence/terminal.tsv",
  ],
  S: [
    "handover/evidence/captures/S.tsv",
    "/run/dispatch-records/S.tsv",
    "handover/evidence/terminal-S.tsv",
    "handover/evidence/S.tsv",
  ],
};

function usage() {
  process.stdout.write(
    [
      "Usage: node handover/replay.mjs [--capture P|S] [--terminal path] [--json] [--require-anomaly]",
      "",
      "Default: handover/evidence/terminal.tsv (the working checkout's active capture).",
      "P and S are separate field cases; neither is a correction of the other.",
    ].join("\n") + "\n",
  );
}

const rawArgs = process.argv.slice(2);
const flags = new Set();
let captureOption = null;
let terminalOption = null;
let positional = null;

for (let index = 0; index < rawArgs.length; index += 1) {
  const arg = rawArgs[index];
  if (arg === "--json" || arg === "--require-anomaly") {
    flags.add(arg);
  } else if (arg === "--capture" || arg === "--case") {
    captureOption = rawArgs[index + 1] ?? null;
    index += 1;
  } else if (arg.startsWith("--capture=")) {
    captureOption = arg.slice("--capture=".length);
  } else if (arg.startsWith("--case=")) {
    captureOption = arg.slice("--case=".length);
  } else if (arg === "--terminal" || arg === "--file") {
    terminalOption = rawArgs[index + 1] ?? null;
    index += 1;
  } else if (arg.startsWith("--terminal=")) {
    terminalOption = arg.slice("--terminal=".length);
  } else if (arg.startsWith("--file=")) {
    terminalOption = arg.slice("--file=".length);
  } else if (arg === "--help" || arg === "-h") {
    usage();
    process.exit(0);
  } else if (arg.startsWith("-")) {
    throw new Error(`unknown option: ${arg}`);
  } else if (positional === null) {
    positional = arg;
  } else {
    throw new Error(`unexpected argument: ${arg}`);
  }
}

const wantJson = flags.has("--json");
const requireAnomaly = flags.has("--require-anomaly");

function resolveInput(value) {
  if (isAbsolute(value)) return value;
  const fromRoot = join(ROOT, value);
  if (existsSync(fromRoot)) return fromRoot;
  return resolve(process.cwd(), value);
}

function firstExisting(paths) {
  for (const path of paths) {
    const resolved = isAbsolute(path) ? path : resolveInput(path);
    if (existsSync(resolved)) return resolved;
  }
  return null;
}

function displayPath(path) {
  const fromRoot = relative(ROOT, path);
  if (fromRoot !== "" && !fromRoot.startsWith("..") && !isAbsolute(fromRoot)) return fromRoot;
  return path;
}

let requestedCase = null;
if (captureOption !== null) {
  if (/^[PS]$/iu.test(captureOption)) requestedCase = captureOption.toUpperCase();
  else terminalOption = captureOption;
}
if (terminalOption === null && positional !== null) {
  if (/^[PS]$/iu.test(positional)) requestedCase = positional.toUpperCase();
  else terminalOption = positional;
}

let capturePath;
if (terminalOption !== null) {
  capturePath = resolveInput(terminalOption);
} else {
  if (requestedCase === null) {
    const active = join(ROOT, "handover/evidence/terminal.tsv");
    capturePath = existsSync(active) ? active : firstExisting(CAPTURE_CANDIDATES.P);
  } else {
    capturePath = firstExisting(CAPTURE_CANDIDATES[requestedCase]);
  }
}
if (capturePath === null || !existsSync(capturePath)) {
  throw new Error(`capture not found${requestedCase === null ? "" : ` for case ${requestedCase}`}`);
}

const captureText = readFileSync(capturePath, "utf8");
const captureSha256 = createHash("sha256").update(captureText).digest("hex");
const knownEntry = Object.entries(KNOWN_CAPTURES).find(([, entry]) => entry.sha256 === captureSha256);
const inferredCase = /^\d{2}:\d{2}:\d{2}\t.*\tS$/mu.test(captureText) ? "S" : "P";
const captureCase = requestedCase ?? knownEntry?.[0] ?? inferredCase;
const captureSource = knownEntry?.[1].source ?? KNOWN_CAPTURES[captureCase]?.source ?? null;
const expectedSha256 = KNOWN_CAPTURES[captureCase]?.sha256 ?? null;

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function readFirst(relativePaths) {
  for (const relativePath of relativePaths) {
    const path = join(ROOT, relativePath);
    if (existsSync(path)) return readFileSync(path, "utf8");
  }
  throw new Error(`none of these evidence files exist: ${relativePaths.join(", ")}`);
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/u).filter((line) => line !== "");
  if (lines.length === 0) return [];
  const header = lines[0].split(",");
  return lines.slice(1).map((line, index) => {
    const cells = line.split(",");
    return {
      ...Object.fromEntries(header.map((name, cellIndex) => [name, cells[cellIndex] ?? ""])),
      index,
    };
  });
}

function parseTerminal(text) {
  const lines = text.trim().split(/\r?\n/u);
  const header = lines[0].split("\t");
  return lines
    .slice(1)
    .filter((line) => /^\d{2}:\d{2}:\d{2}\t/u.test(line))
    .map((line, index) => {
      const cells = line.split("\t");
      return {
        ...Object.fromEntries(header.map((name, cellIndex) => [name, cells[cellIndex] ?? ""])),
        index,
      };
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
const terminal = parseTerminal(captureText);
const dashboard = parseCsv(read("operations/dashboard.csv"));
const registry = parseCsv(read("operations/registry.csv"));
const fieldArchive = readFirst(["handover/evidence/field-archive.txt", "handover/evidence/field.txt"]).trim();
const fieldNote = readFirst([
  "handover/evidence/field-note.txt",
  "handover/evidence/field.txt",
  "operations/shift-mail.txt",
]).trim();
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
const completedRows = dashboard.filter((row) => row.series === "grpc_completed");
const holdRows = dashboard.filter((row) => row.series === "rollout_hold");
const lastCompleted = completedRows.at(-1) ?? null;
const lastHold = holdRows.at(-1) ?? null;
const transportGreen = ingressFailures.length === 0 && dashboardErrors === 0;

// Find requests that were attempted more than once. A retry is "stale" when a
// different, newer sequence already reached the same feed earlier in the
// archive order. Wall-clock order is deliberately not used to reorder records.
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
  rows.sort((left, right) => Number(left.attempt) - Number(right.attempt) || left.index - right.index);
  duplicateRequests.push({
    connection: rows[0].connection,
    request: rows[0].request,
    feed: rows[0].feed,
    sequence: Number(rows[0].sequence),
    attempts: rows.map((row) => ({
      utc: row.utc,
      attempt: Number(row.attempt),
      grpcStatus: Number(row.grpc_status),
    })),
  });
  for (const retry of rows.filter((row) => Number(row.attempt) > 1)) {
    const newer = ingress.filter(
      (candidate) =>
        candidate.feed === retry.feed &&
        candidate.request !== retry.request &&
        Number(candidate.sequence) > Number(retry.sequence) &&
        candidate.index < retry.index,
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
duplicateRequests.sort((left, right) => {
  const first = (item) => ingress.find((row) => row.request === item.request && row.connection === item.connection)?.index ?? 0;
  return first(left) - first(right);
});

// Reconstruct what each panel actually painted, in archive order. Only a P
// row is a paint. An S row records a delivery the panel suppressed: it is an
// important fact about the case, but it does not move the displayed sequence.
const terminalByPanel = new Map();
for (const row of terminal) {
  if (!terminalByPanel.has(row.panel)) terminalByPanel.set(row.panel, []);
  terminalByPanel.get(row.panel).push(row);
}

const panelTraces = [];
const inversions = [];
const suppressedDeliveries = [];
for (const [panel, rows] of terminalByPanel.entries()) {
  let highest = -Infinity;
  let previousPaint = null;
  const paints = [];
  const suppressed = [];

  for (const row of rows) {
    const sequence = Number(row.sequence);
    if (row.event === "P") {
      if (sequence < highest) {
        inversions.push({
          panel,
          site: panelName(panel),
          stationType: panelClass(panel),
          utc: row.utc,
          request: row.req,
          event: row.event,
          sequence,
          previousPaint:
            previousPaint === null
              ? null
              : {
                  utc: previousPaint.utc,
                  request: previousPaint.req,
                  sequence: Number(previousPaint.sequence),
                },
          highestSequenceBefore: highest,
        });
      }
      highest = Math.max(highest, sequence);
      previousPaint = row;
      paints.push({
        utc: row.utc,
        feed: row.feed,
        sequence,
        request: row.req,
        event: row.event,
      });
    } else if (row.event === "S") {
      suppressed.push({
        utc: row.utc,
        feed: row.feed,
        sequence,
        request: row.req,
        event: row.event,
        highestPaintedSequenceBefore: highest === -Infinity ? null : highest,
        wouldHaveInverted: highest !== -Infinity && sequence < highest,
      });
      suppressedDeliveries.push({
        panel,
        site: panelName(panel),
        stationType: panelClass(panel),
        utc: row.utc,
        feed: row.feed,
        sequence,
        request: row.req,
        event: row.event,
        highestPaintedSequenceBefore: highest === -Infinity ? null : highest,
        wouldHaveInverted: highest !== -Infinity && sequence < highest,
      });
    }
  }

  panelTraces.push({
    panel,
    site: panelName(panel),
    stationType: panelClass(panel),
    events: rows.map((row) => ({
      utc: row.utc,
      feed: row.feed,
      sequence: Number(row.sequence),
      request: row.req,
      event: row.event,
    })),
    paints,
    suppressed,
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

const relevantAliases = registry.filter((row) =>
  ["B-12", "B-13", "relay-9", "A-02", "A-03"].includes(row.alias),
);
const b12Rows = registry.filter((row) => row.alias === "B-12" || row.assignment.includes("B-12"));
const b12Site =
  b12Rows
    .map((row) => row.assignment.match(/^(Birch|Alder|Cedar|Dune)\b/u)?.[1])
    .find((site) => site !== undefined) ?? "Birch";

const reproduced = liveInversions.length > 0;
const inversionSummary = liveInversions
  .map(
    (row) =>
      `${row.panel} (${row.site}) painted sequence ${row.sequence} after sequence ${row.highestSequenceBefore}`,
  )
  .join("; ");
const staleSummary = staleRetries
  .map(
    (row) =>
      `${row.request} attempt ${row.attempt} replayed sequence ${row.replayedSequence} after a newer sequence had already been delivered`,
  )
  .join("; ");
const suppressionSummary = suppressedDeliveries
  .map(
    (row) =>
      `${row.panel} (${row.site}) suppressed ${row.request} sequence ${row.sequence}` +
      (row.highestPaintedSequenceBefore === null
        ? ""
        : ` while its highest painted sequence was ${row.highestPaintedSequenceBefore}`),
  )
  .join("; ");

const diagnosis = {
  reproduced,
  captureCase,
  summary: reproduced
    ? `${captureCase} reproduces an actual live display inversion: ${inversionSummary}.` +
      (staleSummary === "" ? "" : ` ${staleSummary}.`) +
      " Every observed RPC was green, so transport delivery does not prove display order or freshness."
    : `${captureCase} does not reproduce an actual live display inversion.` +
      (suppressionSummary === "" ? "" : ` ${suppressionSummary}; a suppressed delivery is not a paint.`) +
      (staleSummary === "" ? "" : ` ${staleSummary}, but that delivery was not painted by a live panel in this case.`) +
      " This case stands on its own and is not a correction of the other capture.",
  transportGreen,
  liveInversions,
  trainingInversions,
  suppressedDeliveries,
  staleRetries,
  serviceDataRegression: false,
  trafficChange: "none proposed by replay; release owner owns traffic",
};

const result = {
  schema: "fleet-night-shift-replay/v1",
  capture: {
    case: captureCase,
    path: displayPath(capturePath),
    sha256: captureSha256,
    expectedSha256,
    hashMatches: expectedSha256 === null ? null : expectedSha256 === captureSha256,
    source: captureSource,
  },
  inputs: {
    inventory: "handover/evidence/inventory.csv",
    ingress: "handover/evidence/ingress.csv",
    terminal: displayPath(capturePath),
    captures: {
      P: displayPath(resolve(ROOT, CAPTURE_CANDIDATES.P[0])),
      S: displayPath(resolve(ROOT, CAPTURE_CANDIDATES.S[0])),
    },
    fieldArchive: existsSync(join(ROOT, "handover/evidence/field-archive.txt"))
      ? "handover/evidence/field-archive.txt"
      : "handover/evidence/field.txt",
    fieldNote: existsSync(join(ROOT, "handover/evidence/field-note.txt"))
      ? "handover/evidence/field-note.txt"
      : existsSync(join(ROOT, "handover/evidence/field.txt"))
        ? "handover/evidence/field.txt"
        : "operations/shift-mail.txt",
    reservation: "handover/evidence/reservation.txt",
    dashboard: "operations/dashboard.csv",
    registry: "operations/registry.csv",
  },
  transport: {
    green: transportGreen,
    ingressFailures,
    dashboardGrpcErrors: dashboardErrors,
    lastGrpcCompleted: lastCompleted === null ? null : Number(lastCompleted.value),
    grpcCompletedByMinute: completedRows.map((row) => ({
      utcMinute: row.utc_minute,
      value: Number(row.value),
    })),
    schedulerPlannedHolds: lastHold === null ? null : Number(lastHold.value),
    schedulerPlannedHoldRows: holdRows.map((row) => ({
      utcMinute: row.utc_minute,
      value: Number(row.value),
    })),
  },
  duplicateRequests,
  staleRetries,
  panels: panelTraces,
  liveInversions,
  trainingInversions,
  suppressedDeliveries,
  field: {
    localNotebookTime: localMatch === null ? null : `${localMatch[1]}:${localMatch[2]}`,
    clockOffsetHours: offsetHours,
    clockFastSeconds: driftSeconds,
    clockUncertaintySeconds: uncertaintySeconds,
    correctedApproxUtc: fieldApprox,
    correctedWindowUtc: fieldWindow,
    siteFromB12Alias: b12Site,
    boardsInWindow: panelTraces
      .filter(
        (trace) =>
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
    "P and S are separate recorded field cases; a matching timestamp or request ID does not make either a correction of the other.",
    "Only a terminal row with event P is a paint. Event S records a suppressed transport delivery and does not change the displayed sequence.",
    "The terminal trace is sampled by panel, not by request; p23 has no terminal row in either capture.",
    "B-13's uploader was unplugged for the rehearsal and retained no local recording.",
    "The field note's minute is rounded, its clock was 52 s fast (+/- 12 s), and it cannot distinguish p17 from the adjacent training simulator.",
    "No maximum stale-data duration was agreed, so this replay can establish ordering but not a freshness SLO.",
    "The dashboard is aggregate; its zero grpc_error count cannot detect a successfully delivered duplicate or an out-of-order paint.",
  ],
  diagnosis,
};

if (wantJson) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  console.log("Fleet reading-order replay");
  console.log("==========================");
  console.log(
    `Capture: ${captureCase} (${result.capture.path}) sha256=${captureSha256}` +
      (expectedSha256 === null ? "" : `, expected=${expectedSha256}, match=${captureSha256 === expectedSha256 ? "yes" : "no"}`),
  );
  console.log(
    `Transport green: ${transportGreen ? "yes" : "no"} (ingress failures: ${ingressFailures.length}, dashboard grpc_error: ${dashboardErrors})`,
  );
  console.log(
    `Dashboard grpc_completed (last): ${result.transport.lastGrpcCompleted}; scheduler-planned rollout_hold: ${result.transport.schedulerPlannedHolds}`,
  );
  for (const duplicate of duplicateRequests) {
    console.log(
      `Retried request: ${duplicate.request} on ${duplicate.connection}, sequence ${duplicate.sequence}, attempts ${duplicate.attempts.map((attempt) => attempt.utc).join(" / ")}`,
    );
  }
  for (const stale of staleRetries) {
    const newer = stale.alreadyDeliveredNewer
      .map((row) => `${row.request} sequence ${row.sequence} at ${row.utc}`)
      .join(", ");
    console.log(
      `Stale retry: ${stale.request} attempt ${stale.attempt} at ${stale.retryUtc} replayed sequence ${stale.replayedSequence} after ${newer}`,
    );
  }
  for (const trace of panelTraces) {
    const paints = trace.paints
      .map((paint) => `${paint.utc} ${paint.request}->${paint.sequence}`)
      .join("; ");
    const suppressed = trace.suppressed
      .map((row) => `${row.utc} ${row.request}->${row.sequence} suppressed`)
      .join("; ");
    console.log(
      `Panel ${trace.panel} (${trace.site}, ${trace.stationType}): paints [${paints || "none"}]` +
        (suppressed === "" ? "" : `; suppressed [${suppressed}]`),
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
      `Boards painting in that window: ${result.field.boardsInWindow
        .map((board) => `${board.panel} (${board.site}, ${board.stationType})`)
        .join(", ") || "none"}. The note cannot choose between them.`,
    );
  }
  console.log(`Diagnosis: ${diagnosis.summary}`);
  console.log(
    `Reproduced: ${diagnosis.reproduced ? "yes" : "no"}; service data regression: no; traffic action: release owner.`,
  );
}

if (requireAnomaly && !diagnosis.reproduced) {
  process.stderr.write(
    `Expected an actual live display inversion in capture ${captureCase}, but the evidence did not contain one.\n`,
  );
  process.exitCode = 1;
}
