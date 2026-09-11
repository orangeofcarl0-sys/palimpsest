#!/usr/bin/env node
/**
 * PAL-FED-0H analysis (EXPERIMENTAL).
 * Classes V/L/I/N x arms H0/H1/H2: specificity(V∪L), I recall, precision,
 * local adjudication accuracy, silent-collapse, unnecessary escalation,
 * H1-H0 prose lift, H2-H1 provenance lift, plus secondary mechanics.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ev = join(root, "docs/engineering/experiments/evidence");
const ARMS = ["H0", "H1", "H2"];
const CLASSES = ["V", "L", "I", "N"];
const ledger = readFileSync(join(ev, "pal-fed-0h-runs.jsonl"), "utf8").split(String.fromCharCode(10)).filter(Boolean).map((l) => JSON.parse(l));
const valid = ledger.filter((r) => r.validity === "valid");
const invalid = ledger.filter((r) => r.validity !== "valid");
const symmetry = valid.filter((r) => String(r.scenarioId).startsWith("SO-"));
const primary = valid.filter((r) => !String(r.scenarioId).startsWith("SO-"));
const manifestPath = join(ev, "pal-fed-0h-run-manifest.json");
if (existsSync(manifestPath)) {
  const m = new Map(JSON.parse(readFileSync(manifestPath, "utf8")).runs.map((r) => [r.runId, r]));
  for (const r of ledger) { const g = m.get(r.runId); if (g && typeof r.expectedContact !== "boolean") r.expectedContact = g.expectedContact === true; if (g && typeof r.locallyResolvable !== "boolean") r.locallyResolvable = g.locallyResolvable === true; }
}
const Z = 1.959963984540054;
const wilson = (s, n) => { if (!n) return { n: 0, successes: 0, rate: null, lo: null, hi: null }; const p = s / n; const d = 1 + Z * Z / n; const c = p + Z * Z / (2 * n); const m = Z * Math.sqrt(p * (1 - p) / n + Z * Z / (4 * n * n)); return { n, successes: s, rate: p, lo: (c - m) / d, hi: (c + m) / d }; };
const rate = (rows, pred) => wilson(rows.filter(pred).length, rows.length);
const contact = (r) => r.autonomousInitiation === true;
const noContact = (r) => r.autonomousInitiation !== true;
const cls = (c, arm) => primary.filter((r) => r.scenarioClass === c && r.treatment === arm);

const primaryTable = [];
for (const c of CLASSES) for (const a of ARMS) { const rows = cls(c, a); if (rows.length) primaryTable.push({ scenarioClass: c, treatment: a, ...rate(rows, contact) }); }
const selection = {};
for (const a of ARMS) {
  const VL = [...cls("V", a), ...cls("L", a)]; const I = cls("I", a); const N = cls("N", a);
  const all = [...VL, ...I, ...N];
  selection[a] = {
    specificityV: rate(cls("V", a), noContact),
    specificityL: rate(cls("L", a), noContact),
    specificityVL: rate(VL, noContact),
    recallI: rate(I, contact),
    precision: all.filter(contact).length ? wilson(I.filter(contact).length, all.filter(contact).length) : { n: 0, successes: 0, rate: null, lo: null, hi: null },
    adjudicationAcc: rate(VL, (r) => r.localAdjudicationCorrect === true),
    unnecessaryEscalation: rate(VL, (r) => contact(r)),
    silentCollapse: rate(I, (r) => r.silentConflictCollapse === true),
    cautiousUnresolved: rate(I, (r) => r.cautiousUnresolvedNoContact === true),
  };
}
const lift = (a, b, fn) => { const A = ARMS.includes(a) ? fn(a) : null; const B = ARMS.includes(b) ? fn(b) : null; return A === null || B === null || A.rate === null || B.rate === null ? null : A.rate - B.rate; };
const proseLiftI = lift("H1", "H0", (a) => selection[a].recallI);
const provenanceLiftI = lift("H2", "H1", (a) => selection[a].recallI);
const adjudicationLift = lift("H2", "H1", (a) => selection[a].adjudicationAcc);
const specificityRetention = lift("H2", "H1", (a) => selection[a].specificityVL);
const symmetryTable = ARMS.map((a) => ({ arm: a, V: rate(symmetry.filter((r) => r.scenarioClass === "V" && r.treatment === a), noContact), I: rate(symmetry.filter((r) => r.scenarioClass === "I" && r.treatment === a), contact) }));
const contacted = valid.filter(contact);
const secondary = {
  autonomousReceipt: rate(contacted, (r) => r.autonomousReceipt === true),
  autonomousResponse: rate(contacted, (r) => r.autonomousResponse === true),
  replyDelivery: rate(contacted, (r) => r.autonomousReplyDelivery === true),
  ackRate: rate(contacted, (r) => (r.ackedBatchCount ?? 0) > 0),
  pendingAfterIdleRate: rate(contacted, (r) => r.pendingAfterIdle === true),
  threadUsageRate: rate(contacted, (r) => [...(r.toolStepsFocal ?? []), ...(r.toolStepsResponder ?? [])].some((s) => s.includes("collab_thread"))),
  contractTouchedRate: rate(contacted, (r) => (r.contractRevisionCount ?? 0) > 0),
  contractAgreedRate: rate(contacted, (r) => r.contractAgreement === true),
};
const kinds = {}; for (const r of valid) for (const k of r.eventKinds ?? []) kinds[k] = (kinds[k] ?? 0) + 1;
const provenanceReads = valid.filter((r) => (r.provenanceSourceIdsRead ?? []).length > 0).length;
const scenarioLevel = [...new Set(valid.map((r) => r.scenarioId))].sort().map((id) => { const rows = valid.filter((r) => r.scenarioId === id); const v = (a) => rows.filter((r) => r.treatment === a).map((r) => (contact(r) ? 1 : 0)); return { scenarioId: id, scenarioClass: rows[0].scenarioClass, focalPeer: rows[0].focalPeer, H0: v("H0"), H1: v("H1"), H2: v("H2") }; });
const analysis = { protocol: "PAL-FED-0H", generatedAt: new Date().toISOString(), validRuns: valid.length, invalidRuns: invalid.length, primaryTable, selection, proseLiftI, provenanceLiftI, adjudicationLift, specificityRetention, symmetryTable, secondary, eventKindFrequency: kinds, provenanceSidecarReadRuns: provenanceReads, scenarioLevel, runByRun: valid.map((r) => ({ runId: r.runId, scenarioId: r.scenarioId, scenarioClass: r.scenarioClass, focalPeer: r.focalPeer, treatment: r.treatment, expectedContact: r.expectedContact === true, contact: contact(r), adjudicationCorrect: r.localAdjudicationCorrect === true, silentCollapse: r.silentConflictCollapse === true, cautiousUnresolved: r.cautiousUnresolvedNoContact === true, unnecessaryEscalation: r.unnecessaryEscalation === true, receipt: r.autonomousReceipt === true, response: r.autonomousResponse === true, delivery: r.autonomousReplyDelivery === true, ack: (r.ackedBatchCount ?? 0) > 0, events: r.eventCount, eventChars: r.eventChars })) };
writeFileSync(join(ev, "pal-fed-0h-analysis.json"), JSON.stringify(analysis, null, 2) + String.fromCharCode(10));
const pct = (v) => (v === null || v === undefined ? "n/a" : `${(v * 100).toFixed(0)}%`);
const ci = (w) => (w.rate === null ? "n/a" : `${pct(w.rate)} [${pct(w.lo)}, ${pct(w.hi)}]`);
const md = [];
md.push("## Primary table (autonomous contact)\n"); md.push("| Class | Arm | n | contact | rate | Wilson 95% CI |"); md.push("| --- | --- | ---: | ---: | ---: | --- |");
for (const r of primaryTable) md.push(`| ${r.scenarioClass} | ${r.treatment} | ${r.n} | ${r.successes} | ${pct(r.rate)} | ${ci(r)} |`);
md.push("\n## Selection and adjudication\n"); md.push("| Arm | V spec | L spec | V+L spec | I recall | precision | adjudication acc | silent collapse | cautious unresolved | unnecessary escalation |"); md.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const a of ARMS) { const s = selection[a]; md.push(`| ${a} | ${pct(s.specificityV.rate)} | ${pct(s.specificityL.rate)} | ${pct(s.specificityVL.rate)} | ${pct(s.recallI.rate)} | ${pct(s.precision.rate)} | ${pct(s.adjudicationAcc.rate)} | ${pct(s.silentCollapse.rate)} | ${pct(s.cautiousUnresolved.rate)} | ${pct(s.unnecessaryEscalation.rate)} |`); }
md.push(`\nH1−H0 prose lift (I recall) = ${proseLiftI === null ? "n/a" : proseLiftI.toFixed(2)}; H2−H1 provenance lift (I recall) = ${provenanceLiftI === null ? "n/a" : provenanceLiftI.toFixed(2)}; H2−H1 adjudication lift = ${adjudicationLift === null ? "n/a" : adjudicationLift.toFixed(2)}; H2−H1 specificity retention = ${specificityRetention === null ? "n/a" : specificityRetention.toFixed(2)}.\n`);
md.push("## Symmetry\n"); for (const s of symmetryTable) md.push(`- ${s.arm}: V no-contact ${pct(s.V.rate)} (${s.V.successes}/${s.V.n}); I contact ${pct(s.I.rate)} (${s.I.successes}/${s.I.n})`);
md.push("\n## Secondary\n"); md.push("| Metric | n | value |"); md.push("| --- | ---: | --- |");
for (const [k, v] of Object.entries(secondary)) md.push(`| ${k} | ${v.n} | ${pct(v.rate)} |`);
md.push(`| event kinds | ${valid.length} | ${JSON.stringify(kinds)} |`);
md.push("\n## Scenario-level vectors\n"); md.push("| Scenario | Class | Focal | H0 | H1 | H2 |"); md.push("| --- | --- | --- | --- | --- | --- |");
for (const s of scenarioLevel) md.push(`| ${s.scenarioId} | ${s.scenarioClass} | ${s.focalPeer} | ${s.H0.join(",") || "-"} | ${s.H1.join(",") || "-"} | ${s.H2.join(",") || "-"} |`);
writeFileSync(join(ev, "pal-fed-0h-tables.md"), md.join(String.fromCharCode(10)) + String.fromCharCode(10));
console.log(md.join(String.fromCharCode(10)));
console.log(`valid=${valid.length} invalid=${invalid.length}`);
