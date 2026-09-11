#!/usr/bin/env node
/**
 * PAL-FED-0G analysis (EXPERIMENTAL).
 *
 * Three arms (G0/G1/G2) x five primary classes (S/P/F/U/C): specificity,
 * per-class recall, pooled required-contact recall, precision, balanced
 * accuracy, AuthorityRecovery, FreshnessRecovery, ConflictRecovery,
 * SpecificityRetention, scenario vectors, inspection and secondary mechanics.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const evidenceDir = join(root, "docs/engineering/experiments/evidence");
const argOf = (f, d) => { const i = process.argv.indexOf(f); return i === -1 ? d : process.argv[i + 1]; };
const runsDir = resolve(argOf("--runs-dir", "F:/Codex_Work_Space/pal-fed-0g/runs"));
const ART = resolve(argOf("--artifact", "F:/Codex_Work_Space/pal-fed-0g/G2"));
const ARMS = ["G0", "G1", "G2"];
const CLASSES = ["S", "P", "F", "U", "C"];
const REQUIRED = ["F", "U", "C"];
const NOCONTACT = ["S", "P"];

const ledger = readFileSync(join(evidenceDir, "pal-fed-0g-runs.jsonl"), "utf8")
  .split(String.fromCharCode(10)).filter(Boolean).map((l) => JSON.parse(l));
// expectedContact is not in the runner result (fixed for future runs); it is
// deterministic ground truth from the frozen run manifest, keyed by runId.
const manifestPath = join(evidenceDir, "pal-fed-0g-run-manifest.json");
const expectedByRun = new Map();
if (existsSync(manifestPath)) {
  for (const r of JSON.parse(readFileSync(manifestPath, "utf8")).runs) expectedByRun.set(r.runId, r.expectedContact === true);
}
for (const r of ledger) if (typeof r.expectedContact !== "boolean") r.expectedContact = expectedByRun.get(r.runId) === true;
const valid = ledger.filter((r) => r.validity === "valid");
const invalid = ledger.filter((r) => r.validity !== "valid");
const primary = valid.filter((r) => !/^(S-O|U-O)-/.test(String(r.scenarioId)));
const symmetry = valid.filter((r) => /^(S-O|U-O)-/.test(String(r.scenarioId)));

const Z = 1.959963984540054;
function wilson(successes, n) {
  if (n === 0) return { n: 0, successes: 0, rate: null, lo: null, hi: null };
  const p = successes / n;
  const denom = 1 + (Z * Z) / n;
  const centre = p + (Z * Z) / (2 * n);
  const margin = Z * Math.sqrt((p * (1 - p)) / n + (Z * Z) / (4 * n * n));
  return { n, successes, rate: p, lo: (centre - margin) / denom, hi: (centre + margin) / denom };
}
const rate = (rows, pred) => wilson(rows.filter(pred).length, rows.length);
const contact = (r) => r.autonomousInitiation === true;
const noContact = (r) => r.autonomousInitiation !== true;
const cls = (c, arm) => primary.filter((r) => r.scenarioClass === c && r.treatment === arm);

const primaryTable = [];
for (const c of CLASSES) for (const arm of ARMS) {
  const rows = cls(c, arm);
  if (rows.length) primaryTable.push({ scenarioClass: c, treatment: arm, ...rate(rows, contact) });
}
const selection = {};
for (const arm of ARMS) {
  const required = REQUIRED.flatMap((c) => cls(c, arm));
  const noC = NOCONTACT.flatMap((c) => cls(c, arm));
  const all = [...required, ...noC];
  const contacts = all.filter(contact).length;
  const requiredContacts = required.filter(contact).length;
  selection[arm] = {
    specificityS: rate(cls("S", arm), noContact),
    specificityP: rate(cls("P", arm), noContact),
    specificitySP: rate(noC, noContact),
    recallF: rate(cls("F", arm), contact),
    recallU: rate(cls("U", arm), contact),
    recallC: rate(cls("C", arm), contact),
    recallRequired: rate(required, contact),
    precision: contacts === 0 ? { n: 0, successes: 0, rate: null, lo: null, hi: null } : wilson(requiredContacts, contacts),
    balancedAccuracy: noC.length && required.length ? (noC.filter(noContact).length / noC.length + requiredContacts / required.length) / 2 : null,
  };
}
const rec = (armA, armB, c) => {
  const a = cls(c, armA); const b = cls(c, armB);
  return a.length && b.length ? a.filter(contact).length / a.length - b.filter(contact).length / b.length : null;
};
const authorityRecovery = rec("G2", "G1", "U");
const freshnessRecovery = rec("G2", "G1", "F");
const conflictRecovery = rec("G2", "G1", "C");
const specificityRetention = selection.G2.specificitySP.rate !== null && selection.G1.specificitySP.rate !== null ? selection.G2.specificitySP.rate - selection.G1.specificitySP.rate : null;

const failureClassOf = (r) => {
  const expected = r.expectedContact === true;
  const got = r.autonomousInitiation === true;
  if (expected === got) return "none";
  if (expected && !got) return r.scenarioClass === "F" ? "under-contact: freshness" : r.scenarioClass === "U" ? "under-contact: authority" : r.scenarioClass === "C" ? "under-contact: conflict" : "under-contact: other";
  return r.scenarioClass === "S" ? "over-contact: local" : r.scenarioClass === "P" ? "over-contact: pinned" : "over-contact: other";
};
const failureCounts = {};
for (const r of primary) { const f = failureClassOf(r); failureCounts[f] = (failureCounts[f] ?? 0) + 1; }

const inspectRate = (arm, c) => rate(primary.filter((r) => r.treatment === arm && r.scenarioClass === c), (r) => r.inspectionBeforeContact === true || r.relevantLocalEvidenceTouched === true);
const premature = (arm, c) => rate(primary.filter((r) => r.treatment === arm && r.scenarioClass === c), (r) => contact(r) && r.inspectionBeforeContact !== true);

const contacted = valid.filter(contact);
const secondary = {
  autonomousReceipt: rate(contacted, (r) => r.autonomousReceipt === true),
  autonomousResponse: rate(contacted, (r) => r.autonomousResponse === true),
  replyDelivery: rate(contacted, (r) => r.autonomousReplyDelivery === true),
  ackRate: rate(contacted, (r) => (r.ackedBatchCount ?? 0) > 0),
  pendingAfterIdleRate: rate(contacted, (r) => r.pendingAfterIdle === true),
  contractTouchedRate: rate(contacted, (r) => (r.contractRevisionCount ?? 0) > 0),
  contractAgreedRate: rate(contacted, (r) => r.contractAgreement === true),
  threadUsageRate: rate(contacted, (r) => [...(r.toolStepsFocal ?? []), ...(r.toolStepsResponder ?? [])].some((s) => s.includes("collab_thread"))),
};
const eventKindFrequency = (() => { const f = {}; for (const r of valid) for (const k of r.eventKinds ?? []) f[k] = (f[k] ?? 0) + 1; return f; })();
const eventCounts = valid.map((r) => r.eventCount ?? 0);

const fedBase = join(ART, "package/dist/src/federation");
const impFed = (f) => import(pathToFileURL(join(fedBase, f)).href);
const fedStore = await impFed("store.js");
const fedEvents = await impFed("events.js");
const fedContracts = await impFed("contracts.js");
async function firstChangeMs(runId, peer) {
  const db = join(runsDir, runId, "coordination.sqlite");
  if (!existsSync(db)) return null;
  const store = fedStore.openFederationStore(db);
  try {
    const times = [];
    for (const e of await fedEvents.readAllEvents(store)) if (e.event.from === peer) times.push(Date.parse(e.event.createdAt));
    for (const rec of await fedContracts.readAllContractRecords(store)) if (rec.identity?.actor === peer) times.push(Date.parse(rec.writtenAt));
    return times.length === 0 ? null : Math.min(...times);
  } finally { await store.close(); }
}
function sessionTimes(runId, peer, session) {
  const base = join(runsDir, runId, peer.replace(/[^A-Za-z0-9]+/g, "-"), "sessions");
  if (!existsSync(base)) return null;
  const files = [];
  (function find(d) { for (const e of readdirSync(d, { withFileTypes: true })) { const full = join(d, e.name); if (e.isDirectory()) find(full); else if (e.name === "session.v3.jsonl") files.push(full); } })(base);
  const file = files.find((f) => f.includes(session)) ?? files[0];
  if (file === undefined) return null;
  let firstNoticeMs = null; let firstInboxMs = null;
  for (const line of readFileSync(file, "utf8").split(String.fromCharCode(10)).filter(Boolean)) {
    let e; try { e = JSON.parse(line); } catch { continue; }
    const s = JSON.stringify(e);
    if (e.type === "user/message" && firstNoticeMs === null && s.includes("PAL-FED collaboration batch")) firstNoticeMs = e.time;
    if (e.type === "assistant/message" && firstInboxMs === null && s.includes("collab_inbox")) firstInboxMs = e.time;
  }
  return { firstNoticeMs, firstInboxMs };
}
const wakeLat = []; const wakeToInbox = [];
for (const r of valid) {
  if (!(r.eventCount > 0) || !(r.wakeCountResponder > 0)) continue;
  const t = sessionTimes(r.runId, r.responderPeer, r.responderSession);
  const changeMs = await firstChangeMs(r.runId, r.focalPeer);
  if (t !== null && t.firstNoticeMs !== null && typeof changeMs === "number") wakeLat.push(t.firstNoticeMs - changeMs);
  if (t !== null && t.firstNoticeMs !== null && t.firstInboxMs !== null) wakeToInbox.push(t.firstInboxMs - t.firstNoticeMs);
}
const stat = (arr) => (arr.length === 0 ? null : { n: arr.length, min: Math.min(...arr), median: arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)], max: Math.max(...arr) });

const scenarioLevel = [...new Set(valid.map((r) => r.scenarioId))].sort().map((id) => {
  const rows = valid.filter((r) => r.scenarioId === id);
  const vec = (arm) => rows.filter((r) => r.treatment === arm).map((r) => (contact(r) ? 1 : 0));
  return { scenarioId: id, scenarioClass: rows[0].scenarioClass, focalPeer: rows[0].focalPeer, G0: vec("G0"), G1: vec("G1"), G2: vec("G2") };
});

const analysis = {
  protocol: "PAL-FED-0G",
  generatedAt: new Date().toISOString(),
  validRuns: valid.length, invalidRuns: invalid.length,
  invalidDetail: invalid.map((r) => ({ runId: r.runId, reason: r.reason })),
  primaryTable, selection,
  authorityRecovery, freshnessRecovery, conflictRecovery, specificityRetention,
  failureCounts,
  inspection: Object.fromEntries(CLASSES.map((c) => [c, Object.fromEntries(ARMS.map((a) => [a, inspectRate(a, c)]))])),
  prematureContact: Object.fromEntries(CLASSES.map((c) => [c, Object.fromEntries(ARMS.map((a) => [a, premature(a, c)]))])),
  symmetry: Object.fromEntries(ARMS.map((a) => [a, { S: rate(symmetry.filter((r) => r.scenarioClass === "S" && r.treatment === a), contact), U: rate(symmetry.filter((r) => r.scenarioClass === "U" && r.treatment === a), contact) }])),
  secondary, eventKindFrequency,
  communicationVolume: { meanEventCount: eventCounts.length ? eventCounts.reduce((a, b) => a + b, 0) / eventCounts.length : null, medianEventCount: eventCounts.length ? eventCounts.slice().sort((a, b) => a - b)[Math.floor(eventCounts.length / 2)] : null, maxEventChars: valid.reduce((m, r) => Math.max(m, ...(r.eventChars ?? [0])), 0), over2k: valid.reduce((n, r) => n + (r.eventChars ?? []).filter((c) => c > 2000).length, 0), over4k: valid.reduce((n, r) => n + (r.eventChars ?? []).filter((c) => c > 4000).length, 0) },
  latency: { changeToWakeMs: stat(wakeLat.filter((v) => v >= 0)), wakeToInboxMs: stat(wakeToInbox), changeToResponseMs: stat(valid.map((r) => r.eventToResponseMs).filter((v) => typeof v === "number" && v >= 0)) },
  scenarioLevel,
  runByRun: valid.map((r) => ({ runId: r.runId, scenarioId: r.scenarioId, scenarioClass: r.scenarioClass, focalPeer: r.focalPeer, treatment: r.treatment, expectedContact: r.expectedContact === true, contact: contact(r), inspected: r.inspectionBeforeContact === true, premature: contact(r) && r.inspectionBeforeContact !== true, failureClass: failureClassOf(r), receipt: r.autonomousReceipt === true, response: r.autonomousResponse === true, delivery: r.autonomousReplyDelivery === true, ack: (r.ackedBatchCount ?? 0) > 0, events: r.eventCount, contractRevisions: r.contractRevisionCount, pendingAfterIdle: r.pendingAfterIdle })),
};
writeFileSync(join(evidenceDir, "pal-fed-0g-analysis.json"), `${JSON.stringify(analysis, null, 2)}\n`);

const pct = (v) => (v === null || v === undefined ? "n/a" : `${(v * 100).toFixed(0)}%`);
const ci = (w) => (w.rate === null ? "n/a" : `${pct(w.rate)} [${pct(w.lo)}, ${pct(w.hi)}]`);
const md = [];
md.push("## Primary table (autonomous contact)\n");
md.push("| Class | Arm | n | contact | rate | Wilson 95% CI |");
md.push("| --- | --- | ---: | ---: | ---: | --- |");
for (const row of primaryTable) md.push(`| ${row.scenarioClass} | ${row.treatment} | ${row.n} | ${row.successes} | ${pct(row.rate)} | ${ci(row)} |`);
md.push("\n## Selection metrics\n");
md.push("| Arm | S spec | P spec | S+P spec | F recall | U recall | C recall | required recall | precision | balanced acc |");
md.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const a of ARMS) { const s = selection[a]; md.push(`| ${a} | ${pct(s.specificityS.rate)} | ${pct(s.specificityP.rate)} | ${pct(s.specificitySP.rate)} | ${pct(s.recallF.rate)} | ${pct(s.recallU.rate)} | ${pct(s.recallC.rate)} | ${pct(s.recallRequired.rate)} | ${pct(s.precision.rate)} | ${s.balancedAccuracy === null ? "n/a" : s.balancedAccuracy.toFixed(2)} |`); }
md.push(`\nAuthorityRecovery (U: G2-G1) = ${authorityRecovery === null ? "n/a" : authorityRecovery.toFixed(2)}; FreshnessRecovery (F: G2-G1) = ${freshnessRecovery === null ? "n/a" : freshnessRecovery.toFixed(2)}; ConflictRecovery (C: G2-G1) = ${conflictRecovery === null ? "n/a" : conflictRecovery.toFixed(2)}; SpecificityRetention (S+P: G2-G1) = ${specificityRetention === null ? "n/a" : specificityRetention.toFixed(2)}.\n`);
md.push("## Inspection / premature contact\n");
md.push("| Arm | inspect S | inspect P | inspect F | inspect U | inspect C | premature required |");
md.push("| --- | --- | --- | --- | --- | --- | --- |");
for (const a of ARMS) md.push(`| ${a} | ${pct(inspectRate(a, "S").rate)} | ${pct(inspectRate(a, "P").rate)} | ${pct(inspectRate(a, "F").rate)} | ${pct(inspectRate(a, "U").rate)} | ${pct(inspectRate(a, "C").rate)} | ${pct(rate(primary.filter((r) => r.treatment === a && REQUIRED.includes(r.scenarioClass)), (r) => contact(r) && r.inspectionBeforeContact !== true).rate)} |`);
md.push("\n## Failure attribution (mechanical, by class + outcome)\n");
for (const [k, v] of Object.entries(failureCounts)) md.push(`- ${k}: ${v}`);
md.push("\n## Secondary metrics\n");
md.push("| Metric | n | value |");
md.push("| --- | ---: | --- |");
for (const [k, v] of Object.entries(secondary)) md.push(`| ${k} | ${v.n} | ${pct(v.rate)} |`);
md.push(`| event count mean / median | ${valid.length} | ${analysis.communicationVolume.meanEventCount === null ? "n/a" : analysis.communicationVolume.meanEventCount.toFixed(2)} / ${analysis.communicationVolume.medianEventCount ?? "n/a"} |`);
md.push(`| event kinds | ${valid.length} | ${JSON.stringify(eventKindFrequency)} |`);
md.push(`| events >2KB / >4KB (max chars) | ${valid.length} | ${analysis.communicationVolume.over2k} / ${analysis.communicationVolume.over4k} (${analysis.communicationVolume.maxEventChars}) |`);
md.push(`| latency change-wake / wake-inbox / change-response median ms | ${valid.length} | ${analysis.latency.changeToWakeMs?.median ?? "n/a"} / ${analysis.latency.wakeToInboxMs?.median ?? "n/a"} / ${analysis.latency.changeToResponseMs?.median ?? "n/a"} |`);
md.push("\n## Scenario-level contact vectors\n");
md.push("| Scenario | Class | Focal | G0 | G1 | G2 |");
md.push("| --- | --- | --- | --- | --- | --- |");
for (const s of scenarioLevel) md.push(`| ${s.scenarioId} | ${s.scenarioClass} | ${s.focalPeer} | ${s.G0.join(",") || "-"} | ${s.G1.join(",") || "-"} | ${s.G2.join(",") || "-"} |`);
writeFileSync(join(evidenceDir, "pal-fed-0g-tables.md"), `${md.join("\n")}\n`);
console.log(md.join("\n"));
console.log(`\nvalid=${valid.length} invalid=${invalid.length}`);
