#!/usr/bin/env node
/**
 * PAL-FED-0E analysis (EXPERIMENTAL).
 *
 * Reads the run ledger and produces the pre-registered tables: contact rates by
 * dependency class x criterion with Wilson 95% intervals, the primary D1 C0/C1
 * contrast with an exploratory Fisher exact test, false-contact rate, receipt /
 * response / delivery / ack / contract / volume / latency metrics, and a
 * scenario-level table. Deterministic; no LLM scoring.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const evidenceDir = join(root, "docs/engineering/experiments/evidence");
const ledger = readFileSync(join(evidenceDir, "pal-fed-0e-runs.jsonl"), "utf8")
  .split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const valid = ledger.filter((r) => r.validity === "valid");
const invalid = ledger.filter((r) => r.validity !== "valid");

const argOf = (f, d) => { const i = process.argv.indexOf(f); return i === -1 ? d : process.argv[i + 1]; };
const runsDir = resolve(argOf("--runs-dir", "F:/Codex_Work_Space/pal-fed-0e/runs"));

/** Accurate per-run latency from durable DSH session-log timestamps. */
function sessionTimes(runId, peer, session) {
  const root = join(runsDir, runId, peer.replace(/\W+/g, "-"), "sessions");
  if (!existsSync(root)) return null;
  const files = [];
  (function find(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) find(full);
      else if (e.name === "session.v3.jsonl") files.push(full);
    }
  })(root);
  const file = files.find((f) => f.includes(session)) ?? files[0];
  if (file === undefined) return null;
  let firstNoticeMs = null;
  let firstInboxMs = null;
  for (const line of readFileSync(file, "utf8").split(String.fromCharCode(10)).filter(Boolean)) {
    let e; try { e = JSON.parse(line); } catch { continue; }
    const s = JSON.stringify(e);
    if (e.type === "user/message" && firstNoticeMs === null && s.includes("PAL-FED collaboration batch")) firstNoticeMs = e.time;
    if (e.type === "assistant/message" && firstInboxMs === null && s.includes('"collab_inbox"')) firstInboxMs = e.time;
  }
  return { firstNoticeMs, firstInboxMs };
}

const ART = resolve(argOf("--artifact", "F:/Codex_Work_Space/pal-fed-0e/C1"));
const fedBase = join(ART, "package/dist/src/federation");
const impFed = (f) => import(pathToFileURL(join(fedBase, f)).href);
const fedStore = await impFed("store.js");
const fedEvents = await impFed("events.js");
const fedContracts = await impFed("contracts.js");

/**
 * Focal peer's first durable CHANGE time: the earliest of its CollaborationEvent
 * commit time and any contract revision it wrote. The watcher observes both
 * streams, so a wake can legitimately precede the first event when the focal
 * revised a contract first.
 */
async function firstChangeMs(runId, peer) {
  const db = join(runsDir, runId, "coordination.sqlite");
  if (!existsSync(db)) return null;
  const store = fedStore.openFederationStore(db);
  try {
    const times = [];
    for (const e of await fedEvents.readAllEvents(store)) {
      if (e.event.from === peer) times.push(Date.parse(e.event.createdAt));
    }
    for (const record of await fedContracts.readAllContractRecords(store)) {
      if (record.identity?.actor === peer) times.push(Date.parse(record.writtenAt));
    }
    return times.length === 0 ? null : Math.min(...times);
  } finally {
    await store.close();
  }
}

const Z = 1.959963984540054;
function wilson(successes, n) {
  if (n === 0) return { n: 0, successes: 0, rate: null, lo: null, hi: null };
  const p = successes / n;
  const denom = 1 + (Z * Z) / n;
  const centre = p + (Z * Z) / (2 * n);
  const margin = Z * Math.sqrt((p * (1 - p)) / n + (Z * Z) / (4 * n * n));
  return { n, successes, rate: p, lo: (centre - margin) / denom, hi: (centre + margin) / denom };
}
function logFactorial(n) {
  let s = 0;
  for (let i = 2; i <= n; i += 1) s += Math.log(i);
  return s;
}
function hypergeometric(a, b, c, d) {
  const n = a + b + c + d;
  return Math.exp(logFactorial(a + b) + logFactorial(c + d) + logFactorial(a + c) + logFactorial(b + d) - logFactorial(n) - logFactorial(a) - logFactorial(b) - logFactorial(c) - logFactorial(d));
}
function fisherTwoSided(a, b, c, d) {
  const observed = hypergeometric(a, b, c, d);
  const row1 = a + b;
  const row2 = c + d;
  const col1 = a + c;
  let p = 0;
  const minA = Math.max(0, col1 - row2);
  const maxA = Math.min(row1, col1);
  for (let x = minA; x <= maxA; x += 1) {
    const prob = hypergeometric(x, row1 - x, col1 - x, row2 - (col1 - x));
    if (prob <= observed * (1 + 1e-9)) p += prob;
  }
  return { oddsRatio: b === 0 || c === 0 || a === 0 || d === 0 ? null : (a * d) / (b * c), pValue: Math.min(1, p) };
}
const rate = (rows, pred) => wilson(rows.filter(pred).length, rows.length);

const byClass = (cls, arm) => valid.filter((r) => r.scenarioClass === cls && r.criterion === arm);
const contact = (r) => r.autonomousInitiation === true;
const primaryTable = [];
for (const cls of ["D1", "D0", "DA", "D1-symmetry", "D0-symmetry"]) {
  for (const arm of ["C0", "C1"]) {
    const rows = byClass(cls, arm);
    if (rows.length === 0) continue;
    primaryTable.push({ scenarioClass: cls, criterion: arm, ...rate(rows, contact) });
  }
}
const d1c0 = byClass("D1", "C0");
const d1c1 = byClass("D1", "C1");
const fisher = fisherTwoSided(
  d1c1.filter(contact).length, d1c1.filter((r) => !contact(r)).length,
  d1c0.filter(contact).length, d1c0.filter((r) => !contact(r)).length,
);

const pct = (v) => (v === null ? "n/a" : `${(v * 100).toFixed(0)}%`);
const ci = (w) => (w.rate === null ? "n/a" : `${pct(w.rate)} [${pct(w.lo)}, ${pct(w.hi)}]`);

const delivered = valid.filter((r) => (r.wakeCountResponder ?? 0) > 0 || r.eventCount > 0);
const contacted = valid.filter(contact);
const secondary = {
  autonomousReceipt: rate(contacted, (r) => r.autonomousReceipt === true),
  autonomousResponse: rate(contacted, (r) => r.autonomousResponse === true),
  replyDelivery: rate(contacted, (r) => r.autonomousReplyDelivery === true),
  ackRate: rate(contacted, (r) => (r.ackedBatchCount ?? 0) > 0),
  pendingAfterIdleRate: rate(contacted, (r) => r.pendingAfterIdle === true),
  contractTouchedRate: rate(contacted, (r) => (r.contractRevisionCount ?? 0) > 0),
  contractAgreedRate: rate(contacted, (r) => r.contractAgreement === true),
  statusChatterEvents: valid.reduce((n, r) => n + (r.eventKinds ?? []).filter((k) => k === "status").length, 0),
  chanChatterEvents: valid.reduce((n, r) => n + (r.eventKinds ?? []).filter((k) => k === "ack" || k === "thanks").length, 0),
};
const eventCounts = valid.map((r) => r.eventCount ?? 0).sort((a, b) => a - b);
const median = eventCounts.length === 0 ? null : eventCounts[Math.floor(eventCounts.length / 2)];
const mean = eventCounts.length === 0 ? null : eventCounts.reduce((a, b) => a + b, 0) / eventCounts.length;
const accurateWake = [];
const accurateWakeToInbox = [];
for (const r of valid) {
  if (!(r.eventCount > 0) || !(r.wakeCountResponder > 0)) continue;
  const t = sessionTimes(r.runId, r.responderPeer, r.responderSession);
  if (t === null || t.firstNoticeMs === null) continue;
  const focalEventMs = await firstChangeMs(r.runId, r.focalPeer);
  if (typeof focalEventMs === "number") accurateWake.push(t.firstNoticeMs - focalEventMs);
  if (t.firstInboxMs !== null) accurateWakeToInbox.push(t.firstInboxMs - t.firstNoticeMs);
}
const cleanWake = accurateWake.filter((v) => v >= 0);
const latencies = {
  eventToWakeMs: cleanWake,
  wakeToInboxMs: accurateWakeToInbox,
  eventToResponseMs: valid.map((r) => r.eventToResponseMs).filter((v) => typeof v === "number" && v >= 0),
};
const stat = (arr) => (arr.length === 0 ? null : { n: arr.length, min: Math.min(...arr), median: arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)], max: Math.max(...arr) });
const scenarioLevel = [...new Set(valid.map((r) => r.scenarioId))].sort().map((id) => {
  const rows = valid.filter((r) => r.scenarioId === id);
  return {
    scenarioId: id,
    scenarioClass: rows[0].scenarioClass,
    focalPeer: rows[0].focalPeer,
    c0: rows.filter((r) => r.criterion === "C0").map((r) => (contact(r) ? 1 : 0)),
    c1: rows.filter((r) => r.criterion === "C1").map((r) => (contact(r) ? 1 : 0)),
    replicas: rows.map((r) => `${r.criterion}:${contact(r) ? "contact" : "none"}`),
  };
});
const d1ScenariosWithC1Contact = new Set(d1c1.filter(contact).map((r) => r.scenarioId));

const analysis = {
  protocol: "PAL-FED-0E",
  generatedAt: new Date().toISOString(),
  validRuns: valid.length,
  invalidRuns: invalid.length,
  invalidDetail: invalid.map((r) => ({ runId: r.runId, reason: r.reason })),
  primaryTable,
  primaryContrastD1: {
    c1: rate(d1c1, contact),
    c0: rate(d1c0, contact),
    delta: (d1c1.length && d1c0.length) ? (d1c1.filter(contact).length / d1c1.length) - (d1c0.filter(contact).length / d1c0.length) : null,
    fisherTwoSided: fisher,
  },
  falseContactD0C1: rate(byClass("D0", "C1"), contact),
  secondary,
  communicationVolume: { meanEventCount: mean, medianEventCount: median, maxEventCount: eventCounts.at(-1) ?? null },
  latency: { eventToWakeMs: stat(latencies.eventToWakeMs), wakeToInboxMs: stat(latencies.wakeToInboxMs), eventToResponseMs: stat(latencies.eventToResponseMs) },
  latencyMethod: "event->wake and wake->inbox from durable DSH session-log timestamps (first plugin notice / first collab_inbox call); event->response from durable event times. The raw per-run lastWakeAt field is not used (it is the last, not first, wake).",
  latencyCaveat: "change->wake uses the focal's first durable change (event or contract revision), matching what the watcher observes; wake->inbox and change->response are unaffected.",
  generalization: {
    distinctD1ScenariosWithAnyC1Contact: d1ScenariosWithC1Contact.size,
    distinctD1Scenarios: new Set(d1c1.map((r) => r.scenarioId)).size,
    scenarios: [...d1ScenariosWithC1Contact],
  },
  symmetry: {
    oToP: rate(byClass("D1-symmetry", "C1"), contact),
    oLocal: rate(byClass("D0-symmetry", "C1"), contact),
  },
  eventKindFrequency: (() => {
    const freq = {};
    for (const r of valid) for (const k of r.eventKinds ?? []) freq[k] = (freq[k] ?? 0) + 1;
    return freq;
  })(),
  threadUsageRate: rate(contacted, (r) => [...(r.toolStepsFocal ?? []), ...(r.toolStepsResponder ?? [])].some((step) => step.includes("collab_thread"))),
  maxEventChars: valid.reduce((m, r) => Math.max(m, ...(r.eventChars ?? [0])), 0),
  oversizedBodyEvents: valid.reduce((n, r) => n + (r.eventChars ?? []).filter((c) => c > 2000).length, 0),
  contractDetail: {
    touchedRuns: contacted.filter((r) => (r.contractRevisionCount ?? 0) > 0).length,
    maxAcceptsInAnyRun: Math.max(0, ...contacted.map((r) => r.contractAccepts ?? 0)),
    agreedRuns: contacted.filter((r) => r.contractAgreement === true).length,
  },
  scenarioLevel,
  runByRun: valid.map((r) => ({
    runId: r.runId, scenarioId: r.scenarioId, scenarioClass: r.scenarioClass, focalPeer: r.focalPeer, criterion: r.criterion,
    initiation: contact(r), receipt: r.autonomousReceipt === true, response: r.autonomousResponse === true,
    delivery: r.autonomousReplyDelivery === true, ack: (r.ackedBatchCount ?? 0) > 0,
    events: r.eventCount, contractRevisions: r.contractRevisionCount, pendingAfterIdle: r.pendingAfterIdle,
  })),
};
writeFileSync(join(evidenceDir, "pal-fed-0e-analysis.json"), `${JSON.stringify(analysis, null, 2)}\n`);

const md = [];
md.push("## Primary table (autonomous initiation)\n");
md.push("| Dependency | Criterion | n | contact | rate | Wilson 95% CI |");
md.push("| --- | --- | ---: | ---: | ---: | --- |");
for (const row of primaryTable) md.push(`| ${row.scenarioClass} | ${row.criterion} | ${row.n} | ${row.successes} | ${pct(row.rate)} | ${ci(row)} |`);
md.push(`\nD1 contrast Δ = ${analysis.primaryContrastD1.delta === null ? "n/a" : analysis.primaryContrastD1.delta.toFixed(2)} (C1 ${pct(analysis.primaryContrastD1.c1.rate)} vs C0 ${pct(analysis.primaryContrastD1.c0.rate)}); exploratory Fisher exact p = ${fisher.pValue.toFixed(4)}.\n`);
md.push("## Secondary metrics\n");
md.push("| Metric | n | value |");
md.push("| --- | ---: | --- |");
md.push(`| autonomous receipt (contacted) | ${secondary.autonomousReceipt.n} | ${pct(secondary.autonomousReceipt.rate)} |`);
md.push(`| autonomous response (contacted) | ${secondary.autonomousResponse.n} | ${pct(secondary.autonomousResponse.rate)} |`);
md.push(`| reply delivery (contacted) | ${secondary.replyDelivery.n} | ${pct(secondary.replyDelivery.rate)} |`);
md.push(`| ack rate (contacted) | ${secondary.ackRate.n} | ${pct(secondary.ackRate.rate)} |`);
md.push(`| pending after idle (contacted) | ${secondary.pendingAfterIdleRate.n} | ${pct(secondary.pendingAfterIdleRate.rate)} |`);
md.push(`| contract touched (contacted) | ${secondary.contractTouchedRate.n} | ${pct(secondary.contractTouchedRate.rate)} |`);
md.push(`| contract agreed (contacted) | ${secondary.contractAgreedRate.n} | ${pct(secondary.contractAgreedRate.rate)} |`);
md.push(`| event count mean / median | ${valid.length} | ${mean === null ? "n/a" : mean.toFixed(2)} / ${median ?? "n/a"} |`);
md.push(`| thread (collab_thread) usage (contacted) | ${analysis.threadUsageRate.n} | ${pct(analysis.threadUsageRate.rate)} |`);
md.push(`| oversized event bodies (>2000 chars) | ${valid.length} | ${analysis.oversizedBodyEvents} |`);
md.push(`| contract touched / agreed runs | ${contacted.length} | ${analysis.contractDetail.touchedRuns} / ${analysis.contractDetail.agreedRuns} |`);
md.push(`\n## Scenario-level (C0 / C1 contact vectors)\n`);
md.push("| Scenario | Class | Focal | C0 | C1 |");
md.push("| --- | --- | --- | --- | --- |");
for (const s of scenarioLevel) md.push(`| ${s.scenarioId} | ${s.scenarioClass} | ${s.focalPeer} | ${s.c0.join(",") || "-"} | ${s.c1.join(",") || "-"} |`);
writeFileSync(join(evidenceDir, "pal-fed-0e-tables.md"), `${md.join("\n")}\n`);
console.log(md.join("\n"));
console.log(`\nvalid=${valid.length} invalid=${invalid.length}`);
