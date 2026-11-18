#!/usr/bin/env node
/**
 * Replay the overnight Fleet evidence from the archived, read-only records.
 *
 * The replay validates the archived evidence rather than assuming an incident.
 * It distinguishes a delivery retry from a panel paint, checks that live panels
 * stayed monotonic, and reports the uncaptured live panel and the field-note
 * ambiguity as limits.
 *
 * Usage:
 *   node handover/replay.mjs                 # JSON result (default)
 *   node handover/replay.mjs --json          # same JSON result
 *   node handover/replay.mjs --summary       # short human-readable summary
 *   node handover/replay.mjs --require-anomaly
 *                                            # also require the archived stale
 *                                            # retry/suppression to be present
 *
 * It exits 0 only when every expected fact in the archive still holds, and 1
 * (with the failed checks in `failures`) when a record has changed. It is
 * read-only: no network calls, no service start, no traffic change.
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

function readFirst(relativePaths) {
  for (const relativePath of relativePaths) {
    try {
      return read(relativePath);
    } catch {
      // Try the next historical filename.
    }
  }
  throw new Error(`none of these files exist: ${relativePaths.join(", ")}`);
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

const inventory = parseCsv(read("handover/evidence/inventory.csv"));
const ingress = parseCsv(read("handover/evidence/ingress.csv"));
const terminal = parseTerminal(read("handover/evidence/terminal.tsv"));
const dashboard = parseCsv(read("operations/dashboard.csv"));
const registry = parseCsv(read("operations/registry.csv"));
const fieldArchive = readFirst(["handover/evidence/field-archive.txt", "handover/evidence/field.txt"]).trim();
const fieldNote = read("handover/evidence/field-note.txt").trim();
const reservation = read("handover/evidence/reservation.txt").trim();
const proposal = JSON.parse(read("handover/proposal.json"));

const checks = [];
const failures = [];
function check(name, condition, detail) {
  const ok = Boolean(condition);
  checks.push({ name, ok, detail });
  if (!ok) failures.push({ name, detail });
  return ok;
}

const panels = new Map(inventory.map((row) => [row.panel, row]));
const panelName = (panel) => panels.get(panel)?.site ?? "unknown";
const panelClass = (panel) => panels.get(panel)?.station_type ?? "unknown";

// --- inventory and alias crosswalk ---------------------------------------------------------------
const birchLive = inventory.filter((row) => row.site === "Birch" && row.station_type === "live");
const p23 = panels.get("p23");
const p71 = panels.get("p71");
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
  "B-12 is an older Birch training alias",
  registry.some(
    (row) => row.export === "older" && row.alias === "B-12" && /^Birch training/u.test(row.assignment),
  ),
  registry,
);
check(
  "current Birch covers B-12 plus B-13",
  registry.some(
    (row) => row.export === "current" && row.alias === "Birch" &&
      /B-12/u.test(row.assignment) && /B-13/u.test(row.assignment),
  ),
  registry.filter((row) => row.export === "current" && row.alias === "Birch"),
);

// --- ingress -------------------------------------------------------------------------------------
const ingressFailures = ingress.filter((row) => Number(row.grpc_status) !== 0);
const reqA = ingress.filter((row) => row.request === "req-a");
const reqB = ingress.filter((row) => row.request === "req-b");

check("every archived ingress attempt has grpc_status 0", ingressFailures.length === 0, ingress);
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
    secondsOfDay(reqB[0].utc) < secondsOfDay(reqA[1]?.utc ?? "00:00:00"),
  { reqB, retry: reqA[1] },
);

// A retry is stale when a newer sequence on the same feed was already delivered.
const attemptsByRequest = new Map();
for (const row of ingress) {
  const key = `${row.connection}\u0000${row.request}`;
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

check("the gateway retry of req-a is recognised as stale", staleRetries.length > 0, staleRetries);

// --- terminal trace ------------------------------------------------------------------------------
const terminalByPanel = new Map();
for (const row of terminal) {
  if (!terminalByPanel.has(row.panel)) terminalByPanel.set(row.panel, []);
  terminalByPanel.get(row.panel).push(row);
}

const panelTraces = [];
const inversions = [];
const livePaints = [];
const suppressedEvents = [];
for (const [panel, rows] of terminalByPanel.entries()) {
  rows.sort((left, right) => secondsOfDay(left.utc) - secondsOfDay(right.utc));
  const paints = rows.filter((row) => row.event === "P");
  const suppressed = rows.filter((row) => row.event === "S");
  let highest = -Infinity;
  let previousPaint = null;
  for (const paint of paints) {
    const sequence = Number(paint.sequence);
    if (sequence < highest) {
      inversions.push({
        panel,
        site: panelName(panel),
        stationType: panelClass(panel),
        utc: paint.utc,
        request: paint.req,
        sequence,
        previousPaint: previousPaint === null
          ? null
          : { utc: previousPaint.utc, request: previousPaint.req, sequence: Number(previousPaint.sequence) },
        highestSequenceBefore: highest,
      });
    }
    highest = Math.max(highest, sequence);
    previousPaint = paint;
    if (panelClass(panel) === "live") {
      livePaints.push({ ...paint, sequence, panel, site: panelName(panel) });
    }
  }
  for (const row of suppressed) {
    suppressedEvents.push({
      ...row,
      sequence: Number(row.sequence),
      request: row.req,
      panel,
      site: panelName(panel),
      stationType: panelClass(panel),
    });
  }
  panelTraces.push({
    panel,
    site: panelName(panel),
    stationType: panelClass(panel),
    paints: paints.map((row) => ({
      utc: row.utc,
      feed: row.feed,
      sequence: Number(row.sequence),
      request: row.req,
      event: row.event,
    })),
    suppressed: suppressed.map((row) => ({
      utc: row.utc,
      feed: row.feed,
      sequence: Number(row.sequence),
      request: row.req,
      event: row.event,
    })),
    events: rows.map((row) => ({
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
const p17Rows = terminal.filter((row) => row.panel === "p17");
const p17Paints = p17Rows.filter((row) => row.event === "P");
const p17Suppressed = p17Rows.filter((row) => row.event === "S");

check("p17 paints sequences 40 then 41", p17Paints.map((row) => row.sequence).join(",") === "40,41", p17Paints);
check(
  "p17 suppresses the duplicate sequence 40 after painting 41",
  p17Suppressed.some(
    (row) => row.sequence === "40" && row.req === "req-a" &&
      secondsOfDay(row.utc) > secondsOfDay(p17Paints.at(-1)?.utc ?? "00:00:00"),
  ),
  p17Suppressed,
);
check(
  "p17 never paints the stale retry",
  !p17Paints.some((row) => row.req === "req-a" && Number(row.sequence) === 40 &&
    secondsOfDay(row.utc) >= secondsOfDay(staleRetries[0]?.retryUtc ?? "00:00:00")),
  p17Paints,
);
check(
  "training panel p71 paints sequence 39",
  terminalByPanel.get("p71")?.length === 1 &&
    terminalByPanel.get("p71")[0].event === "P" &&
    terminalByPanel.get("p71")[0].sequence === "39",
  terminalByPanel.get("p71"),
);
check("all observed live paints are monotonic", liveInversions.length === 0, liveInversions);
check(
  "Alder p04 and p09 paint the same sequence 86",
  terminalByPanel.get("p04")?.some((row) => row.event === "P" && row.sequence === "86") &&
    terminalByPanel.get("p09")?.some((row) => row.event === "P" && row.sequence === "86"),
  { p04: terminalByPanel.get("p04"), p09: terminalByPanel.get("p09") },
);

const livePanels = inventory.filter((row) => row.station_type === "live").map((row) => row.panel);
const missingLiveCaptures = livePanels.filter((panel) => !terminalByPanel.has(panel));
check(
  "p23 has no terminal capture and remains an instrumentation gap",
  missingLiveCaptures.includes("p23"),
  missingLiveCaptures,
);

const expectedRetry = staleRetries.find((retry) => retry.request === "req-a" && retry.replayedSequence === 40);
const staleRetrySuppressions = expectedRetry === undefined
  ? []
  : suppressedEvents.filter(
    (row) => row.request === expectedRetry.request &&
      row.sequence === expectedRetry.replayedSequence &&
      secondsOfDay(row.utc) >= secondsOfDay(expectedRetry.retryUtc),
  );
check(
  "the stale retry is delivered but suppressed on a live panel",
  staleRetrySuppressions.some((row) => row.stationType === "live"),
  staleRetrySuppressions,
);
check(
  "no live panel paints the stale retry",
  !livePaints.some(
    (row) => row.request === expectedRetry?.request &&
      row.sequence === expectedRetry?.replayedSequence &&
      secondsOfDay(row.utc) >= secondsOfDay(expectedRetry?.retryUtc ?? "00:00:00"),
  ),
  livePaints,
);

// --- field note timing and attribution ------------------------------------------------------------
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

check("field archive records the B-12 clock correction", offsetHours !== null && driftSeconds !== null, fieldArchive);
check("field notebook uses the B-12 alias and a local time", localMatch !== null, fieldNote);
check(
  "field note cannot identify p17 versus the adjacent simulator",
  /p17 or the adjacent simulator/iu.test(fieldArchive) || /not clear which terminal/iu.test(fieldNote),
  { fieldArchive, fieldNote },
);
check(
  "field note window overlaps the observed Birch events",
  fieldWindow !== null &&
    secondsOfDay(fieldWindow.fromUtc) <= secondsOfDay("22:03:17") &&
    secondsOfDay(fieldWindow.toUtc) >= secondsOfDay("22:02:57"),
  { fieldWindow, observed: "22:02:57-22:03:17Z" },
);

const b12Rows = registry.filter((row) => row.alias === "B-12" || row.assignment.includes("B-12"));
const b12Site =
  b12Rows
    .map((row) => row.assignment.match(/^(Birch|Alder|Cedar|Dune)\b/u)?.[1])
    .find((site) => site !== undefined) ?? "Birch";
const boardsInWindow = panelTraces
  .filter((trace) =>
    trace.site === b12Site &&
    trace.events.some((event) => {
      if (fieldWindow === null) return false;
      const seconds = secondsOfDay(event.utc);
      return seconds >= secondsOfDay(fieldWindow.fromUtc) && seconds <= secondsOfDay(fieldWindow.toUtc);
    }),
  )
  .map((trace) => ({ panel: trace.panel, site: trace.site, stationType: trace.stationType }));
check(
  "both a live and a training Birch board are active in the field-note window",
  boardsInWindow.some((board) => board.stationType === "live") &&
    boardsInWindow.some((board) => board.stationType === "training"),
  boardsInWindow,
);

// --- dashboard / release check --------------------------------------------------------------------
const dashboardErrors = dashboard
  .filter((row) => row.series === "grpc_error")
  .reduce((total, row) => total + Number(row.value), 0);
const completionRows = dashboard.filter((row) => row.series === "grpc_completed");
const holdRows = dashboard.filter((row) => row.series === "rollout_hold");
const consoleUploads = dashboard.filter((row) => row.series === "console_upload");
const lastGrpcCompleted = completionRows.at(-1) === undefined ? null : Number(completionRows.at(-1).value);
const schedulerPlannedHolds = holdRows.at(-1) === undefined ? null : Number(holdRows.at(-1).value);
const transportGreen = ingressFailures.length === 0 && dashboardErrors === 0;

check("the existing check sees zero edge errors", dashboardErrors === 0, dashboardErrors);
check(
  "the existing check would print continue",
  dashboardErrors === 0,
  { edgeErrors: dashboardErrors, decision: dashboardErrors === 0 ? "continue" : "hold" },
);
check(
  "dashboard records the Birch/2 console upload",
  consoleUploads.length === 1 && consoleUploads[0].value === "1" && /Birch/u.test(consoleUploads[0].population),
  consoleUploads,
);
check(
  "dashboard records the scheduler-planned hold as zero",
  holdRows.length === 1 && schedulerPlannedHolds === 0,
  holdRows,
);
check("dashboard's last grpc_completed count is 482", lastGrpcCompleted === 482, completionRows);

// --- reservation and current proposal -------------------------------------------------------------
check("Cedar has the only REST overflow lane", /Cedar has the only REST overflow lane/u.test(reservation), reservation);
check("the overflow lane is 06:00-06:30Z", /06:00 to 06:30Z/u.test(reservation), reservation);
check("no second overflow lane exists", /No second lane has been commissioned/u.test(reservation), reservation);
check(
  "a hold can park a pilot without moving traffic to REST",
  /park an affected pilot without moving traffic to REST/u.test(reservation),
  reservation,
);

const allowedActions = new Set(["observe", "park", "overflow"]);
const startMatch = /^(\d{2}):(\d{2})$/u.exec(proposal.startUtc ?? "");
const startSeconds = startMatch === null ? null : Number(startMatch[1]) * 3600 + Number(startMatch[2]) * 60;
check("proposal names a UTC minute", startMatch !== null, proposal.startUtc);
check(
  "proposal contains valid Birch and Cedar actions",
  allowedActions.has(proposal.birch) && allowedActions.has(proposal.cedar),
  { birch: proposal.birch, cedar: proposal.cedar },
);
check(
  "proposal start falls inside Cedar's overflow lane",
  startSeconds !== null && startSeconds >= secondsOfDay("06:00:00") && startSeconds <= secondsOfDay("06:30:00"),
  proposal.startUtc,
);
if (proposal.cedar === "overflow") {
  check(
    "Cedar overflow uses the only commissioned lane",
    startSeconds !== null && startSeconds >= secondsOfDay("06:00:00") && startSeconds <= secondsOfDay("06:30:00"),
    proposal.startUtc,
  );
}

// --- result ---------------------------------------------------------------------------------------
const expectedBehaviour = staleRetries.length > 0 && staleRetrySuppressions.length > 0 && liveInversions.length === 0;
const diagnosis = {
  event: "a duplicate retry of Birch feed sequence 40 arrived after sequence 41",
  liveBehaviour:
    "live panel p17 painted sequence 40 then 41 and suppressed the stale duplicate 40; no live inversion is observed in this archive",
  apparentBackwardsReading:
    "training panel p71 painted sequence 39; it is not a live Birch board and the field note cannot distinguish it from p17",
  greenDelivery:
    "all ingress attempts returned grpc_status 0, and bench/check.mjs sums only grpc_error; that is transport success, not display order or freshness",
  unresolved:
    "p23 has no terminal capture (instrumentation gap); the B-12 field note and the missing B-13 recording cannot attribute the observation",
  serviceDataRegression: false,
  liveInversion: liveInversions.length > 0,
  reproduced: expectedBehaviour,
  trafficAction: "none; release owner owns traffic",
};

const limits = [
  "The terminal trace is sampled by panel, not by request; p23 has no terminal row in this archive.",
  "B-13's uploader was unplugged for the rehearsal and retained no local recording.",
  "The field note's minute is rounded, its clock was 52 s fast (+/- 12 s), and it cannot distinguish p17 from the adjacent training simulator.",
  "No maximum stale-data duration was agreed, so this replay can establish ordering but not a freshness SLO.",
  "The dashboard is aggregate; its zero grpc_error count cannot detect a successfully delivered duplicate, a suppressed delivery, or an out-of-order paint.",
  "The previous Fleet plan is a planning baseline; OPS-17 and the dated Fleet correction govern the effective build and default-limit behaviour.",
];

const result = {
  schema: "fleet-night-shift-replay/v1",
  result: failures.length === 0 ? "PASS" : "FAIL",
  replay: "overnight Fleet evidence",
  inputs: {
    inventory: "handover/evidence/inventory.csv",
    ingress: "handover/evidence/ingress.csv",
    terminal: "handover/evidence/terminal.tsv",
    fieldArchive: "handover/evidence/field-archive.txt (or field.txt)",
    fieldNote: "handover/evidence/field-note.txt",
    reservation: "handover/evidence/reservation.txt",
    dashboard: "operations/dashboard.csv",
    registry: "operations/registry.csv",
    proposal: "handover/proposal.json",
  },
  diagnosis,
  transport: {
    green: transportGreen,
    ingressFailures,
    dashboardGrpcErrors: dashboardErrors,
    lastGrpcCompleted,
    schedulerPlannedHolds,
  },
  duplicateRequests,
  staleRetries,
  panels: panelTraces,
  suppressedEvents,
  liveInversions,
  trainingInversions,
  missingLiveCaptures,
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
  registryAliases: registry.filter((row) =>
    ["B-12", "B-13", "relay-9", "A-02", "A-03", "Birch"].includes(row.alias) ||
    /B-12|B-13|relay-9|A-02|A-03/u.test(row.assignment),
  ),
  reservation,
  proposal,
  facts: {
    transportGreen,
    edgeErrors: dashboardErrors,
    ingressFailures,
    lastGrpcCompleted,
    schedulerPlannedHolds,
    consoleUpload: consoleUploads[0] ?? null,
    rolloutHold: holdRows[0] ?? null,
    duplicateRequests,
    staleRetries,
    suppressedEvents,
    livePaints,
    livePanelsWithObservedPaints: [...new Set(livePaints.map((row) => row.panel))],
    liveInversions,
    trainingInversions,
    missingLiveCaptures,
    fieldWindow,
    fieldWindowLabel: fieldWindow === null ? null : `${fieldWindow.fromUtc}-${fieldWindow.toUtc}`,
    fieldNoteAmbiguous: true,
    boardsInWindow,
    registryAliases: registry,
    reservation,
    proposal,
  },
  findings: [
    {
      kind: "green_check_scope",
      detail:
        "edgeErrors=0 proves only that archived RPCs returned grpc_status 0; bench/check.mjs does not read console_upload, suppression, or display freshness",
    },
    {
      kind: "instrumentation_gap",
      detail: `no terminal capture for live panel(s): ${missingLiveCaptures.join(", ") || "none"}`,
    },
  ],
  limits,
  checks,
  failures,
};

if (args.has("--summary") || args.has("--human")) {
  console.log("Fleet reading-order replay");
  console.log("==========================");
  console.log(`Result: ${result.result}`);
  console.log(`Transport green: ${transportGreen ? "yes" : "no"} (ingress failures: ${ingressFailures.length}, dashboard grpc_error: ${dashboardErrors})`);
  console.log(`Dashboard grpc_completed (last): ${lastGrpcCompleted}; scheduler-planned rollout_hold: ${schedulerPlannedHolds}`);
  for (const duplicate of duplicateRequests) {
    console.log(`Retried request: ${duplicate.request} on ${duplicate.connection}, sequence ${duplicate.sequence}, attempts ${duplicate.attempts.map((attempt) => attempt.utc).join(" / ")}`);
  }
  for (const stale of staleRetries) {
    const newer = stale.alreadyDeliveredNewer
      .map((row) => `${row.request} sequence ${row.sequence} at ${row.utc}`)
      .join(", ");
    console.log(`Stale retry: ${stale.request} attempt ${stale.attempt} at ${stale.retryUtc} replayed sequence ${stale.replayedSequence} after ${newer}`);
  }
  for (const trace of panelTraces) {
    console.log(
      `Panel ${trace.panel} (${trace.site}, ${trace.stationType}): ` +
      trace.events.map((event) => `${event.utc} ${event.request}->${event.sequence} ${event.event}`).join("; "),
    );
  }
  console.log(`Live inversions: ${liveInversions.length === 0 ? "none" : liveInversions.map((row) => row.panel).join(", ")}`);
  if (trainingInversions.length > 0) {
    console.log(`Training inversions (not live traffic): ${trainingInversions.map((row) => row.panel).join(", ")}`);
  }
  console.log(`Uncaptured live panels: ${missingLiveCaptures.join(", ") || "none"}`);
  if (fieldWindow !== null) {
    console.log(
      `Field note: B-12 local ${result.field.localNotebookTime}, clock UTC${offsetHours >= 0 ? "+" : ""}${offsetHours} and ${driftSeconds}s fast; corrected ~${fieldApprox} (window ${fieldWindow.fromUtc}..${fieldWindow.toUtc}).`,
    );
    console.log(
      `Boards active in that window: ${boardsInWindow.map((board) => `${board.panel} (${board.site}, ${board.stationType})`).join(", ")}. The note cannot choose between them.`,
    );
  }
  console.log(`Diagnosis: ${diagnosis.liveBehaviour}`);
  console.log(`Failures: ${failures.length === 0 ? "none" : failures.map((failure) => failure.name).join("; ")}`);
} else {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (args.has("--require-anomaly") && !diagnosis.reproduced) {
  process.stderr.write("Expected the archived stale retry to be present and suppressed by a live panel, but the evidence did not reproduce it.\n");
  process.exitCode = 1;
}
if (failures.length > 0) process.exitCode = 1;
