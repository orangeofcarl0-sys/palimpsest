#!/usr/bin/env node
/**
 * Replay the overnight Fleet reading-order evidence from a recorded terminal capture.
 *
 * The script is deliberately read-only. It does not start the service, move traffic,
 * call the release desk, or change the repository.
 *
 * P and S are separate field cases. Each invocation replays ONE capture; a matching
 * timestamp or request ID in the other capture never edits this one. In particular,
 * an `S` row is a suppression event, not a paint and not a correction of a `P` row.
 *
 * Usage:
 *   node handover/replay.mjs                  # replay the working checkout's capture (P)
 *   node handover/replay.mjs --json           # machine-readable result
 *   node handover/replay.mjs --capture P      # replay the preserved P capture
 *   node handover/replay.mjs --capture S      # replay the preserved S capture
 *   node handover/replay.mjs --capture /run/dispatch-records/S.tsv
 *   node handover/replay.mjs --require-anomaly
 *                                             # exit 0 only if THIS capture has a live inversion
 *
 * The existing --json interface is preserved. `--capture`, `--case`, `--input`,
 * `--terminal`, `--trace`, `--source` and a positional capture path are accepted
 * as aliases for choosing the capture.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const CAPTURE_CONTRACT = {
  P: {
    sha256: "c76bb857f8877413ffa91cbd9d736a09053c09ba94afb3ed1fe7bd500b8bc68a",
    source: "4f80c3bd5d606e2a2192fd56badb4a138d139ee2",
  },
  S: {
    sha256: "77f6d9a53429c6c081d51aef62b5bfd68fd23bfac5df1ff9208997812d5caa5e",
    source: "584d61c4bd5ae71bcb1fa687e9b3ad053da4f509",
  },
};

const CAPTURE_FILES = {
  P: [
    join(ROOT, "handover/evidence/P.tsv"),
    join(ROOT, "handover/evidence/terminal-P.tsv"),
    join(ROOT, "handover/evidence/terminal.tsv"),
    "/run/dispatch-records/P.tsv",
  ],
  S: [
    join(ROOT, "handover/evidence/S.tsv"),
    join(ROOT, "handover/evidence/terminal-S.tsv"),
    "/run/dispatch-records/S.tsv",
  ],
};

const rawArgs = process.argv.slice(2);
const flags = new Set();
const captureAliases = new Set(["--capture", "--case", "--input", "--terminal", "--trace", "--source", "--file"]);
let captureSpec = null;

for (let index = 0; index < rawArgs.length; index += 1) {
  const arg = rawArgs[index];
  if (arg === "--") continue;
  if (arg.startsWith("--capture=")) {
    captureSpec = arg.slice("--capture=".length);
  } else if (captureAliases.has(arg)) {
    captureSpec = rawArgs[index + 1] ?? null;
    index += 1;
  } else if (!arg.startsWith("-")) {
    captureSpec = arg;
  } else {
    flags.add(arg);
  }
}

if (flags.has("--help") || flags.has("-h")) {
  console.log("Usage: node handover/replay.mjs [--json] [--capture P|S|PATH] [--require-anomaly]");
  console.log("P and S are replayed as separate field cases; neither corrects the other.");
  process.exit(0);
}

function firstExisting(paths) {
  return paths.find((path) => path !== undefined && existsSync(path)) ?? null;
}

function resolveCapture(spec) {
  if (spec === null) {
    spec = process.env.DISPATCH_CAPTURE
      ?? process.env.DISPATCH_REPLAY_CAPTURE
      ?? process.env.CAPTURE
      ?? process.env.TERMINAL_CAPTURE
      ?? null;
  }

  if (spec === null) {
    const active = join(ROOT, "handover/evidence/terminal.tsv");
    if (existsSync(active)) return active;
    const fallback = firstExisting(CAPTURE_FILES.P);
    if (fallback !== null) return fallback;
    throw new Error("no terminal capture found");
  }

  if (/^[PS]$/iu.test(spec)) {
    const found = firstExisting(CAPTURE_FILES[spec.toUpperCase()]);
    if (found !== null) return found;
  }

  const lower = basename(spec).toLowerCase();
  if (["p", "p.tsv", "terminal-p.tsv", "paint.tsv"].includes(lower)) {
    const found = firstExisting(CAPTURE_FILES.P);
    if (found !== null) return found;
  }
  if (["s", "s.tsv", "terminal-s.tsv", "suppressed.tsv"].includes(lower)) {
    const found = firstExisting(CAPTURE_FILES.S);
    if (found !== null) return found;
  }

  const candidates = isAbsolute(spec)
    ? [spec]
    : [resolve(spec), join(ROOT, spec), join(HERE, spec), join(HERE, "evidence", spec)];
  const found = firstExisting(candidates);
  if (found !== null) return found;
  throw new Error(`terminal capture not found: ${spec}`);
}

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function text(file) {
  return readFileSync(file, "utf8").replace(/\r\n/gu, "\n");
}

function displayPath(file) {
  const absolute = resolve(file);
  return absolute.startsWith(`${resolve(ROOT)}/`) ? absolute.slice(resolve(ROOT).length + 1) : absolute;
}

function parseCsv(source) {
  const lines = source.trim().split(/\r?\n/u).filter((line) => line !== "");
  if (lines.length === 0) return [];
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ""]));
  });
}

function parseTerminal(source) {
  const lines = source.trim().split(/\r?\n/u);
  return lines
    .filter((line) => /^\d{2}:\d{2}:\d{2}\t/u.test(line))
    .map((line, archiveIndex) => {
      const [utc, panel, feed, sequence, req, event] = line.split("\t");
      return {
        archiveIndex,
        utc,
        panel,
        feed,
        sequence,
        req,
        event,
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

const checks = [];
const findings = [];
const failures = [];

function check(name, condition, detail) {
  const ok = Boolean(condition);
  checks.push({ name, ok, detail });
  if (!ok) failures.push({ name, detail });
  return ok;
}

// ---------------------------------------------------------------------------------------------
// Read exactly one capture. P and S are never concatenated, intersected, or de-duplicated.
// ---------------------------------------------------------------------------------------------
const capturePath = resolveCapture(captureSpec);
const terminalText = text(capturePath);
const captureSha256 = createHash("sha256").update(terminalText).digest("hex");
const captureFromPath = (() => {
  const lower = basename(capturePath).toLowerCase();
  if (lower.includes("s") && !lower.includes("p")) return "S";
  if (lower.includes("p")) return "P";
  return null;
})();
let caseId = Object.entries(CAPTURE_CONTRACT)
  .find(([, contract]) => contract.sha256 === captureSha256)?.[0] ?? captureFromPath ?? "UNKNOWN";
const captureContract = CAPTURE_CONTRACT[caseId] ?? null;
const captureMatchesContract = captureContract === null ? false : captureContract.sha256 === captureSha256;

const inventory = parseCsv(read("handover/evidence/inventory.csv"));
const ingress = parseCsv(read("handover/evidence/ingress.csv"));
const terminal = parseTerminal(terminalText);
const dashboard = parseCsv(read("operations/dashboard.csv"));
const registry = parseCsv(read("operations/registry.csv"));
const fieldArchive = read("handover/evidence/field-archive.txt").trim();
const fieldNote = read("handover/evidence/field-note.txt").trim();
const reservation = read("handover/evidence/reservation.txt").trim();

const inventoryByPanel = new Map(inventory.map((row) => [row.panel, row]));
const panelName = (panel) => inventoryByPanel.get(panel)?.site ?? "unknown";
const panelClass = (panel) => inventoryByPanel.get(panel)?.station_type ?? "unknown";
const livePanels = inventory.filter((row) => row.station_type === "live").map((row) => row.panel);

// ---------------------------------------------------------------------------------------------
// Capture integrity and basic archive shape.
// ---------------------------------------------------------------------------------------------
check("terminal capture is non-empty", terminal.length > 0, terminal.length);
check(
  "terminal capture is identified as a recorded field case",
  caseId === "P" || caseId === "S",
  { caseId, captureSha256 },
);
check(
  `terminal capture matches the ${caseId} contract digest`,
  captureMatchesContract,
  { expected: captureContract?.sha256 ?? null, actual: captureSha256 },
);
check(
  "every terminal row uses a recorded P or S event",
  terminal.every((row) => row.event === "P" || row.event === "S"),
  terminal.filter((row) => row.event !== "P" && row.event !== "S"),
);
check(
  "every terminal panel appears in the current inventory",
  terminal.every((row) => inventoryByPanel.has(row.panel)),
  terminal.filter((row) => !inventoryByPanel.has(row.panel)),
);

// ---------------------------------------------------------------------------------------------
// Alias crosswalk.
// ---------------------------------------------------------------------------------------------
const birchLive = inventory.filter((row) => row.site === "Birch" && row.station_type === "live");
const p23 = inventory.find((row) => row.panel === "p23");
const p71 = inventory.find((row) => row.panel === "p71");

check("inventory keeps two live Birch panels", birchLive.length === 2, birchLive.map((row) => row.panel));
check("p23 is a live Birch panel", p23?.site === "Birch" && p23?.station_type === "live", p23);
check("p71 is a training panel, not live", p71?.site === "Birch" && p71?.station_type === "training", p71);
check(
  "current inventory assigns relay-9 to Birch",
  inventory.some((row) => row.connection === "relay-9" && row.site === "Birch"),
  inventory.filter((row) => row.connection === "relay-9"),
);
check(
  "older relay-9/Cedar row is labelled prior cabinet",
  registry.some(
    (row) => row.export === "older" && row.alias === "relay-9" && row.assignment === "Cedar" &&
      /prior cabinet/u.test(row.comment),
  ),
  registry,
);
check(
  "B-12 is a Birch training alias",
  registry.some(
    (row) => row.export === "older" && row.alias === "B-12" &&
      /^Birch training/u.test(row.assignment),
  ),
  registry,
);

// ---------------------------------------------------------------------------------------------
// Ingress: retries and transport outcome. Archive order, not wall-clock order, is used.
// ---------------------------------------------------------------------------------------------
const ingressFailures = ingress.filter((row) => Number(row.grpc_status) !== 0);
const indexedIngress = ingress.map((row, archiveIndex) => ({ ...row, archiveIndex }));
const attemptsByRequest = new Map();
for (const row of indexedIngress) {
  const key = keyOf(row.connection, row.request);
  if (!attemptsByRequest.has(key)) attemptsByRequest.set(key, []);
  attemptsByRequest.get(key).push(row);
}

const duplicateRequests = [];
const staleRetries = [];
for (const rows of attemptsByRequest.values()) {
  if (rows.length < 2) continue;
  const ordered = [...rows].sort((left, right) => left.archiveIndex - right.archiveIndex);
  duplicateRequests.push({
    connection: ordered[0].connection,
    request: ordered[0].request,
    feed: ordered[0].feed,
    sequence: Number(ordered[0].sequence),
    attempts: ordered.map((row) => ({
      utc: row.utc,
      attempt: Number(row.attempt),
      grpcStatus: Number(row.grpc_status),
    })),
  });

  for (const retry of ordered.filter((row) => Number(row.attempt) > 1)) {
    const newer = indexedIngress.filter(
      (candidate) =>
        candidate.feed === retry.feed &&
        candidate.request !== retry.request &&
        Number(candidate.sequence) > Number(retry.sequence) &&
        candidate.archiveIndex < retry.archiveIndex,
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

const reqA = attemptsByRequest.get(keyOf("relay-9", "req-a")) ?? [];
const reqB = attemptsByRequest.get(keyOf("relay-9", "req-b")) ?? [];

check("every archived ingress attempt has grpc_status 0", ingressFailures.length === 0, ingressFailures);
check("req-a has two attempts", reqA.length === 2, reqA);
check(
  "req-a retries the same older sequence 40",
  reqA.length === 2 && reqA.every((row) => row.sequence === "40") &&
    reqA.map((row) => row.attempt).join(",") === "1,2",
  reqA,
);
check(
  "req-b advances Birch feed B to sequence 41 before the retry",
  reqB.length === 1 && reqB[0].sequence === "41" &&
    reqB[0].archiveIndex < (reqA[1]?.archiveIndex ?? -1),
  { reqB, retry: reqA[1] },
);

// ---------------------------------------------------------------------------------------------
// Terminal trace: only P is a paint. S is a suppression and never updates the paint order.
// Inversions are computed in archive order because wall clocks do not order the event stream.
// ---------------------------------------------------------------------------------------------
const terminalByPanel = new Map();
for (const row of terminal) {
  if (!terminalByPanel.has(row.panel)) terminalByPanel.set(row.panel, []);
  terminalByPanel.get(row.panel).push(row);
}

const highestLiveSequence = new Map();
const previousLivePaint = new Map();
const liveInversions = [];
const trainingInversions = [];
const panelTraces = [];
const suppressedEvents = [];

for (const [panel, rows] of terminalByPanel.entries()) {
  const stationType = panelClass(panel);
  for (const row of rows) {
    if (row.event === "S") {
      suppressedEvents.push({
        panel,
        site: panelName(panel),
        stationType,
        utc: row.utc,
        feed: row.feed,
        sequence: Number(row.sequence),
        request: row.req,
        suppressedAfter: previousLivePaint.get(panel) ?? null,
      });
      continue;
    }
    if (row.event !== "P") continue;
    const sequence = Number(row.sequence);
    if (!Number.isFinite(sequence)) continue;

    if (stationType === "live" && highestLiveSequence.has(panel) && sequence < highestLiveSequence.get(panel)) {
      liveInversions.push({
        panel,
        site: panelName(panel),
        stationType,
        utc: row.utc,
        request: row.req,
        sequence,
        previousPaint: previousLivePaint.get(panel) ?? null,
        highestSequenceBefore: highestLiveSequence.get(panel),
      });
    }
    if (stationType === "training" && highestLiveSequence.has(panel) && sequence < highestLiveSequence.get(panel)) {
      trainingInversions.push({
        panel,
        site: panelName(panel),
        stationType,
        utc: row.utc,
        request: row.req,
        sequence,
        highestSequenceBefore: highestLiveSequence.get(panel),
      });
    }

    highestLiveSequence.set(panel, Math.max(highestLiveSequence.get(panel) ?? -Infinity, sequence));
    previousLivePaint.set(panel, {
      utc: row.utc,
      request: row.req,
      sequence,
    });
  }

  panelTraces.push({
    panel,
    site: panelName(panel),
    stationType,
    paints: rows
      .filter((row) => row.event === "P")
      .map((row) => ({
        utc: row.utc,
        feed: row.feed,
        sequence: Number(row.sequence),
        request: row.req,
        event: row.event,
      })),
    suppressions: rows
      .filter((row) => row.event === "S")
      .map((row) => ({
        utc: row.utc,
        feed: row.feed,
        sequence: Number(row.sequence),
        request: row.req,
        event: row.event,
      })),
  });
}

const p17 = terminal.filter((row) => row.panel === "p17");
const p17Paints = p17.filter((row) => row.event === "P");
const p17Suppressed = p17.filter((row) => row.event === "S");
const p71Events = terminal.filter((row) => row.panel === "p71");

check(
  "p17 paints sequences 40 then 41",
  p17Paints.length >= 2 && p17Paints.slice(0, 2).map((row) => row.sequence).join(",") === "40,41",
  p17Paints,
);
check(
  "p17 handles the later req-a sequence 40 as exactly one recorded P-or-S event",
  p17.filter((row) => row.req === "req-a" && row.utc === "22:03:17").length === 1,
  p17.filter((row) => row.req === "req-a"),
);
check(
  "training panel p71 paints sequence 39",
  p71Events.length === 1 && p71Events[0].event === "P" && p71Events[0].sequence === "39",
  p71Events,
);
check(
  "training paint is not counted as a live Birch board",
  !livePanels.includes("p71"),
  livePanels,
);

const missingLiveCaptures = livePanels.filter((panel) => !terminalByPanel.has(panel));
if (missingLiveCaptures.length > 0) {
  findings.push({
    kind: "instrumentation_gap",
    detail: `no terminal capture for live panel(s): ${missingLiveCaptures.join(", ")}`,
  });
}
check(
  "p23 has no terminal capture and remains an instrumentation gap",
  missingLiveCaptures.includes("p23"),
  missingLiveCaptures,
);
check(
  "every observed live inversion is listed in diagnosis.liveInversions",
  liveInversions.every((row) => row.stationType === "live"),
  liveInversions,
);

// ---------------------------------------------------------------------------------------------
// Field note timing and attribution.
// ---------------------------------------------------------------------------------------------
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
  const roundingSeconds = 30;
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

check("field note uses the B-12 alias", /B-12/u.test(fieldNote), fieldNote);
check(
  "field note reports a UTC+01 wall clock that was 52 seconds fast",
  /UTC\+01/u.test(fieldArchive) && /52 seconds fast/u.test(fieldArchive),
  fieldArchive,
);
check(
  "field note cannot identify p17 versus the adjacent simulator",
  /p17 or the adjacent simulator/u.test(fieldArchive),
  fieldArchive,
);
check("field note says B-13 had no local recording", /B-13 uploader was unplugged/u.test(fieldArchive), fieldArchive);
check(
  "field note window overlaps the observed Birch sequence events",
  fieldWindow !== null &&
    secondsOfDay(fieldWindow.fromUtc) <= secondsOfDay("22:03:17") &&
    secondsOfDay(fieldWindow.toUtc) >= secondsOfDay("22:02:57"),
  { fieldWindow, observed: "22:02:57Z..22:03:17Z" },
);

const boardsInWindow = panelTraces
  .filter((trace) =>
    trace.site === b12Site &&
    [...trace.paints, ...trace.suppressions].some((event) => {
      if (fieldWindow === null) return false;
      const seconds = secondsOfDay(event.utc);
      return seconds >= secondsOfDay(fieldWindow.fromUtc) && seconds <= secondsOfDay(fieldWindow.toUtc);
    }),
  )
  .map((trace) => ({ panel: trace.panel, site: trace.site, stationType: trace.stationType }));

// ---------------------------------------------------------------------------------------------
// Dashboard / release-check scope.
// ---------------------------------------------------------------------------------------------
const dashboardErrors = dashboard
  .filter((row) => row.series === "grpc_error")
  .reduce((total, row) => total + Number(row.value), 0);
const dashboardCompletions = dashboard
  .filter((row) => row.series === "grpc_completed")
  .reduce((last, row) => Number(row.value), 0);
const dashboardHolds = dashboard
  .filter((row) => row.series === "rollout_hold")
  .reduce((last, row) => Number(row.value), 0);
const consoleUploads = dashboard.filter((row) => row.series === "console_upload");
const transportGreen = ingressFailures.length === 0 && dashboardErrors === 0;

check("the existing check sees zero edge errors", dashboardErrors === 0, dashboardErrors);
check("the existing check would print continue", dashboardErrors === 0, {
  edgeErrors: dashboardErrors,
  decision: dashboardErrors ? "hold" : "continue",
});
check(
  "dashboard records the Birch/2 console upload",
  consoleUploads.length === 1 && consoleUploads[0].value === "1" && /Birch/u.test(consoleUploads[0].population),
  consoleUploads,
);
check("dashboard records no scheduled rollout hold", dashboardHolds === 0, dashboardHolds);
findings.push({
  kind: "green_check_scope",
  detail:
    "edgeErrors=0 proves only that archived RPCs returned grpc_status 0; bench/check.mjs does not read console_upload or display freshness",
});

// ---------------------------------------------------------------------------------------------
// Reservation and current proposal.
// ---------------------------------------------------------------------------------------------
check("Cedar has the only REST overflow lane", /Cedar has the only REST overflow lane/u.test(reservation), reservation);
check("the overflow lane is 06:00-06:30Z", /06:00 to 06:30Z/u.test(reservation), reservation);
check("no second overflow lane exists", /No second lane has been commissioned/u.test(reservation), reservation);
check(
  "a hold can park a pilot without moving traffic to REST",
  /park an affected pilot without moving traffic to REST/u.test(reservation),
  reservation,
);

const proposal = JSON.parse(text(join(HERE, "proposal.json")));
const allowedActions = new Set(["observe", "park", "overflow"]);
check("proposal names a UTC minute", /^\d{2}:\d{2}$/u.test(proposal.startUtc ?? ""), proposal.startUtc);
check(
  "proposal contains valid Birch and Cedar actions",
  allowedActions.has(proposal.birch) && allowedActions.has(proposal.cedar),
  { birch: proposal.birch, cedar: proposal.cedar },
);
const proposalStart = secondsOfDay(`${proposal.startUtc}:00`);
check(
  "proposal start falls inside Cedar's overflow lane",
  proposalStart >= secondsOfDay("06:00:00") && proposalStart <= secondsOfDay("06:30:00"),
  proposal.startUtc,
);

// ---------------------------------------------------------------------------------------------
// Diagnosis and result.
// ---------------------------------------------------------------------------------------------
const diagnosis = {
  reproduced: liveInversions.length > 0,
  case: caseId,
  summary:
    liveInversions.length > 0
      ? staleRetries.length > 0
        ? `In the ${caseId} capture, a successful retry replayed an older sequence onto a live Birch panel after a newer sequence had already painted, so the live board moved backwards even though every RPC was green. The adjacent training simulator painted a lower number in the same window, which the field note cannot reliably distinguish from the live board.`
        : `In the ${caseId} capture, a live panel painted a lower sequence after a higher one.`
      : suppressedEvents.length > 0
        ? `In the ${caseId} capture, the live panel suppressed the stale duplicate retry, so this capture contains no live display inversion. The retry is still a successful transport delivery and the field note still cannot identify the board.`
        : `The ${caseId} capture contains no live display inversion.`,
  transportGreen,
  liveInversions,
  trainingInversions,
  suppressedEvents,
  staleRetries,
  serviceDataRegression: false,
  trafficChange: "none proposed by replay; release owner owns traffic",
  separateCases:
    "P and S are separate recorded field cases; a matching timestamp or request ID across cases does not make either a correction of the other.",
};

const result = {
  schema: "fleet-night-shift-replay/v1",
  result: failures.length === 0 ? "PASS" : "FAIL",
  case: caseId,
  capture: {
    path: displayPath(capturePath),
    sha256: captureSha256,
    contractSha256: captureContract?.sha256 ?? null,
    matchesContract: captureMatchesContract,
    source: captureContract?.source ?? null,
  },
  inputs: {
    terminal: displayPath(capturePath),
    inventory: "handover/evidence/inventory.csv",
    ingress: "handover/evidence/ingress.csv",
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
  suppressedEvents,
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
    boardsInWindow,
    ambiguous: true,
    note: "The field note alone does not identify p17 or p71; the ingress/terminal records do.",
  },
  registryAliases: relevantAliases,
  reservation,
  limits: [
    "P and S are separate recorded field cases; neither capture is a correction of the other.",
    "The terminal trace is sampled by panel, not by request; p23 has no terminal row in either capture.",
    "B-13's uploader was unplugged for the rehearsal and retained no local recording.",
    "The field note's minute is rounded, its clock was 52 s fast (+/- 12 s), and it cannot distinguish p17 from the adjacent training simulator.",
    "No maximum stale-data duration was agreed, so this replay can establish ordering but not a freshness SLO.",
    "The dashboard is aggregate; its zero grpc_error count cannot detect a successfully delivered duplicate or an out-of-order paint.",
  ],
  diagnosis,
  checks,
  failures,
};

if (flags.has("--json")) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  console.log(`Fleet reading-order replay (${caseId} capture)`);
  console.log("=======================================");
  console.log(`Capture: ${result.capture.path} (sha256 ${captureSha256}${captureMatchesContract ? "; contract match" : "; NOT the contract digest"})`);
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
      `Panel ${trace.panel} (${trace.site}, ${trace.stationType}): ${[
        ...trace.paints.map((paint) => `${paint.utc} ${paint.request}->${paint.sequence} P`),
        ...trace.suppressions.map((event) => `${event.utc} ${event.request}->${event.sequence} S`),
      ].sort((left, right) => secondsOfDay(left.slice(0, 8)) - secondsOfDay(right.slice(0, 8))).join("; ")}`,
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
  if (suppressedEvents.length > 0) {
    console.log(`Suppressed deliveries (not paints): ${suppressedEvents.map((row) => `${row.panel} ${row.request}->${row.sequence} at ${row.utc}`).join(", ")}`);
  }
  if (trainingInversions.length > 0) {
    console.log(`Training inversions (not live traffic): ${trainingInversions.map((row) => row.panel).join(", ")}`);
  }
  if (fieldWindow !== null) {
    console.log(
      `Field note: B-12 local ${result.field.localNotebookTime}, clock UTC${offsetHours >= 0 ? "+" : ""}${offsetHours} and ${driftSeconds}s fast; corrected ~${fieldApprox} (window ${fieldWindow.fromUtc}..${fieldWindow.toUtc}).`,
    );
    console.log(
      `Boards active in that window: ${boardsInWindow
        .map((board) => `${board.panel} (${board.site}, ${board.stationType})`)
        .join(", ")}. The note cannot choose between them.`,
    );
  }
  console.log(`Diagnosis: ${diagnosis.summary}`);
  console.log(`Reproduced: ${diagnosis.reproduced ? "yes" : "no"}; service data regression: no; traffic action: release owner.`);
}

if (flags.has("--require-anomaly")) {
  if (!diagnosis.reproduced) {
    process.stderr.write(`Expected a live stale-retry inversion in the ${caseId} capture, but this capture has no live display inversion.\n`);
    process.exitCode = 1;
  } else {
    process.exitCode = 0;
  }
} else if (failures.length > 0) {
  process.exitCode = 1;
}
