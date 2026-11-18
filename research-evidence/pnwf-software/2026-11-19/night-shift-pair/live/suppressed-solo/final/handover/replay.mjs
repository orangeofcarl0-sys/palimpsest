#!/usr/bin/env node
// Replay the overnight Fleet evidence from the archived, read-only records.
//
// Run from the repository root:
//   node handover/replay.mjs
//
// The script is deliberately dependency-free. It exits 0 only when the archived evidence still
// supports the recorded diagnosis; it exits 1 (and prints the failed checks) if a record changes.
import { readFileSync } from "node:fs";

const evidence = (name) => new URL(`./evidence/${name}`, import.meta.url);
const repoFile = (name) => new URL(`../${name}`, import.meta.url);

function text(file) {
  return readFileSync(file, "utf8").replace(/\r\n/gu, "\n");
}

function csv(file) {
  const [header, ...rows] = text(file).trim().split("\n");
  const columns = header.split(",");
  return rows.filter(Boolean).map((line) => {
    const values = line.split(",");
    return Object.fromEntries(columns.map((column, index) => [column, values[index]]));
  });
}

const seconds = (clock) => {
  const [hours, minutes, rest] = clock.split(":");
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(rest);
};

const clock = (value) => {
  const wrapped = ((value % 86400) + 86400) % 86400;
  const hours = Math.floor(wrapped / 3600);
  const minutes = Math.floor((wrapped % 3600) / 60);
  const secs = wrapped % 60;
  return [hours, minutes, secs].map((part) => String(part).padStart(2, "0")).join(":");
};

const checks = [];
const findings = [];
const failures = [];

function check(name, condition, detail) {
  const ok = Boolean(condition);
  checks.push({ name, ok, detail });
  if (!ok) failures.push({ name, detail });
  return ok;
}

// --- inventory and alias crosswalk ---------------------------------------------------------------
const inventory = csv(evidence("inventory.csv"));
const registry = csv(repoFile("operations/registry.csv"));

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

// --- ingress -------------------------------------------------------------------------------------
const ingress = csv(evidence("ingress.csv"));
const ingressByRequest = Map.groupBy(ingress, (row) => row.request);
const reqA = ingressByRequest.get("req-a") ?? [];
const reqB = ingressByRequest.get("req-b") ?? [];

check("every archived ingress attempt has grpc_status 0", ingress.every((row) => row.grpc_status === "0"), ingress);
check("req-a has two attempts", reqA.length === 2, reqA);
check(
  "req-a retries the same older sequence 40",
  reqA.length === 2 && reqA.every((row) => row.sequence === "40") &&
    reqA.map((row) => row.attempt).join(",") === "1,2",
  reqA,
);
check(
  "req-b advances Birch feed B to sequence 41 before the retry",
  reqB.length === 1 && reqB[0].sequence === "41" && seconds(reqB[0].utc) < seconds(reqA[1].utc),
  { reqB, retry: reqA[1] },
);

// --- terminal trace ------------------------------------------------------------------------------
const terminalLines = text(evidence("terminal.tsv")).split("\n");
const terminal = terminalLines
  .filter((line) => /^\d{2}:\d{2}:\d{2}\t/u.test(line))
  .map((line) => {
    const [utc, panel, feed, sequence, req, event] = line.split("\t");
    return { utc, panel, feed, sequence, req, event };
  });

const byPanel = Map.groupBy(terminal, (row) => row.panel);
const livePanels = inventory.filter((row) => row.station_type === "live").map((row) => row.panel);
const livePaints = [];

for (const panel of livePanels) {
  const events = byPanel.get(panel) ?? [];
  const paints = events.filter((row) => row.event === "P");
  livePaints.push(...paints.map((row) => ({ ...row, panel })));
  for (let index = 1; index < paints.length; index += 1) {
    check(
      `live panel ${panel} paints sequence monotonically`,
      Number(paints[index].sequence) >= Number(paints[index - 1].sequence),
      { previous: paints[index - 1], current: paints[index] },
    );
  }
}

const p17 = terminal.filter((row) => row.panel === "p17");
const p17Paints = p17.filter((row) => row.event === "P");
const p17Suppressed = p17.filter((row) => row.event === "S");
check(
  "p17 paints 40 then 41",
  p17Paints.map((row) => row.sequence).join(",") === "40,41",
  p17Paints,
);
check(
  "p17 suppresses the duplicate sequence 40 after painting 41",
  p17Suppressed.some(
    (row) => row.sequence === "40" && row.req === "req-a" &&
      seconds(row.utc) > seconds(p17Paints.at(-1).utc),
  ),
  p17Suppressed,
);
check(
  "p17 never paints the duplicate retry",
  !p17Paints.some((row) => row.req === "req-a" && row.utc === p17Suppressed[0]?.utc),
  p17Paints,
);

const p71Events = byPanel.get("p71") ?? [];
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

const missingLiveCaptures = livePanels.filter((panel) => !byPanel.has(panel));
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
  "all observed live paints are monotonic",
  livePaints.every((row, index) => {
    if (index === 0) return true;
    const previous = livePaints[index - 1];
    return previous.panel !== row.panel || Number(row.sequence) >= Number(previous.sequence);
  }),
  livePaints,
);

// --- field note timing and attribution ------------------------------------------------------------
const field = text(evidence("field.txt"));
check("field note uses the B-12 alias", /B-12/u.test(field), field);
check("field note reports a UTC+01 wall clock that was 52 seconds fast", /UTC\+01/u.test(field) && /52 seconds fast/u.test(field), field);
check("field note cannot identify p17 versus the adjacent simulator", /p17 or the adjacent simulator/u.test(field), field);
check("field note says B-13 had no local recording", /B-13 uploader was unplugged/u.test(field), field);

const fieldLocalNotebook = 23 * 3600 + 4 * 60; // 23:04, rounded to the minute
const fieldClockOffset = 3600; // UTC+01
const fieldClockError = 52; // seconds fast
const fieldCenter = fieldLocalNotebook - fieldClockOffset - fieldClockError;
const fieldRounding = 30;
const fieldUncertainty = 12;
const fieldWindow = [fieldCenter - fieldRounding - fieldUncertainty, fieldCenter + fieldRounding + fieldUncertainty];
const ingressWindow = [seconds("22:02:57"), seconds("22:03:17")];
const fieldWindowLabel = `${clock(fieldWindow[0])}–${clock(fieldWindow[1])}Z`;

check(
  "field note window overlaps the observed Birch sequence events",
  fieldWindow[0] <= ingressWindow[1] && fieldWindow[1] >= ingressWindow[0],
  { fieldWindow: fieldWindowLabel, observed: "22:02:57–22:03:17Z" },
);

// --- dashboard / release check --------------------------------------------------------------------
const dashboard = csv(repoFile("operations/dashboard.csv"));
const edgeErrors = dashboard
  .filter((row) => row.series === "grpc_error")
  .reduce((total, row) => total + Number(row.value), 0);
const consoleUploads = dashboard.filter((row) => row.series === "console_upload");
const holds = dashboard.filter((row) => row.series === "rollout_hold");

check("the existing check sees zero edge errors", edgeErrors === 0, edgeErrors);
check("the existing check would print continue", edgeErrors === 0, { edgeErrors, decision: edgeErrors ? "hold" : "continue" });
check("dashboard records the Birch/2 console upload", consoleUploads.length === 1 && consoleUploads[0].value === "1" && /Birch/u.test(consoleUploads[0].population), consoleUploads);
check("dashboard records no scheduled rollout hold", holds.length === 1 && holds[0].value === "0", holds);
findings.push({
  kind: "green_check_scope",
  detail: "edgeErrors=0 proves only that archived RPCs returned grpc_status 0; bench/check.mjs does not read console_upload or display freshness",
});

// --- reservation and current proposal -------------------------------------------------------------
const reservation = text(evidence("reservation.txt"));
check("Cedar has the only REST overflow lane", /Cedar has the only REST overflow lane/u.test(reservation), reservation);
check("the overflow lane is 06:00–06:30Z", /06:00 to 06:30Z/u.test(reservation), reservation);
check("no second overflow lane exists", /No second lane has been commissioned/u.test(reservation), reservation);
check("a hold can park a pilot without moving traffic to REST", /park an affected pilot without moving traffic to REST/u.test(reservation), reservation);

const proposal = JSON.parse(text(new URL("./proposal.json", import.meta.url)));
const allowedActions = new Set(["observe", "park", "overflow"]);
check("proposal names a UTC minute", /^\d{2}:\d{2}$/u.test(proposal.startUtc ?? ""), proposal.startUtc);
check(
  "proposal contains valid Birch and Cedar actions",
  allowedActions.has(proposal.birch) && allowedActions.has(proposal.cedar),
  { birch: proposal.birch, cedar: proposal.cedar },
);
const start = seconds(`${proposal.startUtc}:00`);
check("proposal start falls inside Cedar's overflow lane", start >= seconds("06:00:00") && start <= seconds("06:30:00"), proposal.startUtc);
if (proposal.cedar === "overflow") {
  check("Cedar overflow uses the only commissioned lane", start >= seconds("06:00:00") && start <= seconds("06:30:00"), proposal.startUtc);
}

const result = {
  result: failures.length === 0 ? "PASS" : "FAIL",
  replay: "overnight Fleet evidence",
  diagnosis: {
    event: "a duplicate retry of Birch feed sequence 40 arrived after sequence 41",
    liveBehaviour: "live panel p17 painted 40 then 41 and suppressed the stale duplicate retry",
    apparentBackwardsReading: "training panel p71 painted sequence 39; it is not a live Birch board",
    greenDelivery: "all ingress attempts returned grpc_status 0, and the existing edge check sums only grpc_error",
    unresolved: "p23 has no terminal capture (instrumentation gap); the B-12 field note cannot identify p17 or the adjacent simulator",
  },
  facts: {
    edgeErrors,
    consoleUpload: consoleUploads[0] ?? null,
    rolloutHold: holds[0] ?? null,
    fieldWindow: fieldWindowLabel,
    livePanelsWithObservedPaints: [...new Set(livePaints.map((row) => row.panel))],
    missingLiveCaptures,
    proposal,
  },
  findings,
  checks,
  failures,
};

console.log(JSON.stringify(result, null, 2));
if (failures.length > 0) process.exitCode = 1;
