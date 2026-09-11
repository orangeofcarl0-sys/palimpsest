#!/usr/bin/env node
/**
 * PAL-FED-0F analysis (EXPERIMENTAL).
 *
 * Contact selection by class (R/L/P/A) and treatment (F0/F1) with Wilson CIs;
 * R recall, L/P specificity, contact precision, balanced accuracy; inspection
 * before contact and premature contact; plus the mechanical secondary metrics.
 * Deterministic; no LLM scoring.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const evidenceDir = join(root, "docs/engineering/experiments/evidence");
const argOf = (f, d) => { const i = process.argv.indexOf(f); return i === -1 ? d : process.argv[i + 1]; };
const runsDir = resolve(argOf("--runs-dir", "F:/Codex_Work_Space/pal-fed-0f/runs"));
const ART = resolve(argOf("--artifact", "F:/Codex_Work_Space/pal-fed-0f/F1"));

const ledger = readFileSync(join(evidenceDir, "pal-fed-0f-runs.jsonl"), "utf8")
  .split(String.fromCharCode(10)).filter(Boolean).map((l) => JSON.parse(l));
const valid = ledger.filter((r) => r.validity === "valid");
const invalid = ledger.filter((r) => r.validity !== "valid");
const primary = valid.filter((r) => !String(r.scenarioId).startsWith("S-"));
const symmetry = valid.filter((r) => String(r.scenarioId).startsWith("S-"));

const Z = 1.959963984540054;
function wilson(successes, n) {
  if (n === 0) return { n: 0, successes: 0, rate: null, lo: null, hi: null };
  const p = successes / n;
  const denom = 1 + (Z * Z) / n;
  const centre = p + (Z * Z) / (2 * n);
  const margin = Z * Math.sqrt((p * (1 - p)) / n + (Z * Z) / (4 * n * n));
  return { n, successes, rate: p, lo: (centre - margin) / denom, hi: (centre + margin) / denom };
}
function logFactorial(n) { let s = 0; for (let i = 2; i <= n; i += 1) s += Math.log(i); return s; }
function hypergeometric(a, b, c, d) {
  const n = a + b + c + d;
  return Math.exp(logFactorial(a + b) + logFactorial(c + d) + logFactorial(a + c) + logFactorial(b + d) - logFactorial(n) - logFactorial(a) - logFactorial(b) - logFactorial(c) - logFactorial(d));
}
function fisherTwoSided(a, b, c, d) {
  const observed = hypergeometric(a, b, c, d);
  const row1 = a + b; const row2 = c + d; const col1 = a + c;
  let p = 0;
  for (let x = Math.max(0, col1 - row2); x <= Math.min(row1, col1); x += 1) {
    const prob = hypergeometric(x, row1 - x, col1 - x, row2 - (col1 - x));
    if (prob <= observed * (1 + 1e-9)) p += prob;
  }
  return { oddsRatio: a === 0 || b === 0 || c === 0 || d === 0 ? null : (a * d) / (b * c), pValue: Math.min(1, p) };
}
const rate = (rows, pred) => wilson(rows.filter(pred).length, rows.length);
const contact = (r) => r.autonomousInitiation === true;
const noContact = (r) => r.autonomousInitiation !== true;
const byClass = (cls, arm) => primary.filter((r) => r.scenarioClass === cls && r.treatment === arm);

// ---- Session-derived latency (durable DSH timestamps) ----------------------
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
  (function find(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) find(full); else if (e.name === "session.v3.jsonl") files.push(full);
    }
  })(base);
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

// ---- Selection metrics -----------------------------------------------------
const primaryTable = [];
for (const cls of ["R", "L", "P", "A"]) for (const arm of ["F0", "F1"]) {
  const rows = byClass(cls, arm);
  if (rows.length > 0) primaryTable.push({ scenarioClass: cls, treatment: arm, ...rate(rows, contact) });
}
const perArm = {};
for (const arm of ["F0", "F1"]) {
  const R = byClass("R", arm); const L = byClass("L", arm); const P = byClass("P", arm); const LP = [...L, ...P];
  const rContact = R.filter(contact).length;
  const contacts = rContact + LP.filter(contact).length;
  perArm[arm] = {
    recallR: rate(R, contact),
    specificityL: rate(L, noContact),
    specificityP: rate(P, noContact),
    specificityLP: rate(LP, noContact),
    precision: contacts === 0 ? { n: 0, successes: 0, rate: null, lo: null, hi: null } : wilson(rContact, contacts),
    balancedAccuracy: R.length > 0 && LP.length > 0 ? (rContact / R.length + LP.filter(noContact).length / LP.length) / 2 : null,
  };
}
const rF0 = byClass("R", "F0"); const rF1 = byClass("R", "F1");
const fisher = fisherTwoSided(rF1.filter(contact).length, rF1.filter(noContact).length, rF0.filter(contact).length, rF0.filter(noContact).length);
const inspectRate = (arm, cls) => rate(primary.filter((r) => r.treatment === arm && r.scenarioClass === cls), (r) => r.inspectionBeforeContact === true || r.relevantLocalEvidenceTouched === true);
const premature = (arm, cls) => rate(primary.filter((r) => r.treatment === arm && r.scenarioClass === cls), (r) => contact(r) && r.inspectionBeforeContact !== true);

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
const scenarioLevel = [...new Set(valid.map((r) => r.scenarioId))].sort().map((id) => {
  const rows = valid.filter((r) => r.scenarioId === id);
  return { scenarioId: id, scenarioClass: rows[0].scenarioClass, focalPeer: rows[0].focalPeer,
    F0: rows.filter((r) => r.treatment === "F0").map((r) => (contact(r) ? 1 : 0)),
    F1: rows.filter((r) => r.treatment === "F1").map((r) => (contact(r) ? 1 : 0)) };
});

const analysis = {
  protocol: "PAL-FED-0F",
  generatedAt: new Date().toISOString(),
  validRuns: valid.length, invalidRuns: invalid.length,
  invalidDetail: invalid.map((r) => ({ runId: r.runId, reason: r.reason })),
  primaryTable, selection: perArm,
  deltaSpecificityLP: perArm.F1.specificityLP.rate !== null && perArm.F0.specificityLP.rate !== null ? perArm.F1.specificityLP.rate - perArm.F0.specificityLP.rate : null,
  deltaRecallR: perArm.F1.recallR.rate !== null && perArm.F0.recallR.rate !== null ? perArm.F1.recallR.rate - perArm.F0.recallR.rate : null,
  fisherR: fisher,
  inspection: { R: { F0: inspectRate("F0", "R"), F1: inspectRate("F1", "R") }, L: { F0: inspectRate("F0", "L"), F1: inspectRate("F1", "L") }, P: { F0: inspectRate("F0", "P"), F1: inspectRate("F1", "P") } },
  prematureContact: { R: { F0: premature("F0", "R"), F1: premature("F1", "R") }, L: { F0: premature("F0", "L"), F1: premature("F1", "L") }, P: { F0: premature("F0", "P"), F1: premature("F1", "P") } },
  symmetry: { R: rate(symmetry.filter((r) => r.scenarioClass === "R"), contact), L: rate(symmetry.filter((r) => r.scenarioClass === "L"), contact) },
  secondary, eventKindFrequency,
  communicationVolume: { meanEventCount: eventCounts.length ? eventCounts.reduce((a, b) => a + b, 0) / eventCounts.length : null, medianEventCount: eventCounts.length ? eventCounts.slice().sort((a, b) => a - b)[Math.floor(eventCounts.length / 2)] : null, maxEventChars: valid.reduce((m, r) => Math.max(m, ...(r.eventChars ?? [0])), 0), oversizedBodies: valid.reduce((n, r) => n + (r.eventChars ?? []).filter((c) => c > 2000).length, 0) },
  latency: { changeToWakeMs: stat(wakeLat.filter((v) => v >= 0)), wakeToInboxMs: stat(wakeToInbox), changeToResponseMs: stat(valid.map((r) => r.eventToResponseMs).filter((v) => typeof v === "number" && v >= 0)) },
  scenarioLevel,
  runByRun: valid.map((r) => ({ runId: r.runId, scenarioId: r.scenarioId, scenarioClass: r.scenarioClass, focalPeer: r.focalPeer, treatment: r.treatment, contact: contact(r), inspected: r.inspectionBeforeContact === true, premature: contact(r) && r.inspectionBeforeContact !== true, receipt: r.autonomousReceipt === true, response: r.autonomousResponse === true, delivery: r.autonomousReplyDelivery === true, ack: (r.ackedBatchCount ?? 0) > 0, events: r.eventCount, contractRevisions: r.contractRevisionCount, pendingAfterIdle: r.pendingAfterIdle })),
};
writeFileSync(join(evidenceDir, "pal-fed-0f-analysis.json"), `${JSON.stringify(analysis, null, 2)}\n`);

const pct = (v) => (v === null || v === undefined ? "n/a" : `${(v * 100).toFixed(0)}%`);
const ci = (w) => (w.rate === null ? "n/a" : `${pct(w.rate)} [${pct(w.lo)}, ${pct(w.hi)}]`);
const md = [];
md.push("## Primary table (autonomous contact)\n");
md.push("| Class | Treatment | n | contact | rate | Wilson 95% CI |");
md.push("| --- | --- | ---: | ---: | ---: | --- |");
for (const row of primaryTable) md.push(`| ${row.scenarioClass} | ${row.treatment} | ${row.n} | ${row.successes} | ${pct(row.rate)} | ${ci(row)} |`);
md.push("\n## Selection metrics\n");
md.push("| Arm | R recall | L specificity | P specificity | L+P specificity | precision | balanced acc |");
md.push("| --- | --- | --- | --- | --- | --- | --- |");
for (const arm of ["F0", "F1"]) { const a = perArm[arm]; md.push(`| ${arm} | ${pct(a.recallR.rate)} (${a.recallR.successes}/${a.recallR.n}) | ${pct(a.specificityL.rate)} | ${pct(a.specificityP.rate)} | ${pct(a.specificityLP.rate)} | ${pct(a.precision.rate)} | ${a.balancedAccuracy === null ? "n/a" : a.balancedAccuracy.toFixed(2)} |`); }
md.push(`\nΔ specificity(L+P) = ${analysis.deltaSpecificityLP === null ? "n/a" : analysis.deltaSpecificityLP.toFixed(2)}; Δ recall(R) = ${analysis.deltaRecallR === null ? "n/a" : analysis.deltaRecallR.toFixed(2)}; exploratory Fisher exact on R contact p = ${fisher.pValue.toFixed(4)}.\n`);
md.push("| Arm | inspect R | inspect L | inspect P | premature R | premature L | premature P |");
md.push("| --- | --- | --- | --- | --- | --- | --- |");
for (const arm of ["F0", "F1"]) md.push(`| ${arm} | ${pct(inspectRate(arm, "R").rate)} | ${pct(inspectRate(arm, "L").rate)} | ${pct(inspectRate(arm, "P").rate)} | ${pct(premature(arm, "R").rate)} | ${pct(premature(arm, "L").rate)} | ${pct(premature(arm, "P").rate)} |`);
md.push("\n## Secondary metrics\n");
md.push("| Metric | n | value |");
md.push("| --- | ---: | --- |");
for (const [k, v] of Object.entries(secondary)) md.push(`| ${k} | ${v.n} | ${pct(v.rate)} |`);
md.push(`| event count mean / median | ${valid.length} | ${analysis.communicationVolume.meanEventCount === null ? "n/a" : analysis.communicationVolume.meanEventCount.toFixed(2)} / ${analysis.communicationVolume.medianEventCount ?? "n/a"} |`);
md.push(`| event kinds | ${valid.length} | ${JSON.stringify(eventKindFrequency)} |`);
md.push(`| latency change→wake / wake→inbox / change→response (median ms) | ${valid.length} | ${analysis.latency.changeToWakeMs?.median ?? "n/a"} / ${analysis.latency.wakeToInboxMs?.median ?? "n/a"} / ${analysis.latency.changeToResponseMs?.median ?? "n/a"} |`);
md.push("\n## Scenario-level contact vectors\n");
md.push("| Scenario | Class | Focal | F0 | F1 |");
md.push("| --- | --- | --- | --- | --- |");
for (const s of scenarioLevel) md.push(`| ${s.scenarioId} | ${s.scenarioClass} | ${s.focalPeer} | ${s.F0.join(",") || "-"} | ${s.F1.join(",") || "-"} |`);
writeFileSync(join(evidenceDir, "pal-fed-0f-tables.md"), `${md.join("\n")}\n`);
console.log(md.join("\n"));
console.log(`\nvalid=${valid.length} invalid=${invalid.length}`);
