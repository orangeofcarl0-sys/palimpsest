#!/usr/bin/env node
/**
 * PAL-FED-0H ground-truth linter (EXPERIMENT TOOLING).
 *
 * Fails the setup before any model run when scenario ground truth is not
 * mechanically supported by the fixtures. This exists because PAL-FED-0G's
 * C-behavior-conflict scenario shipped with incorrect ground truth.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.argv[process.argv.indexOf("--root") + 1] ?? "F:/Codex_Work_Space/pal-fed-0h";
const scenarios = JSON.parse(readFileSync(join(ROOT, "PAL-FED-0H-SCENARIOS.json"), "utf8"));
const FORBIDDEN = ["expectedContact", "winner", "preferredSource", "correctSource", "sufficient", "insufficient", "shouldEscalate", "needsPeer", "groundTruth", "scenarioClass", "precedenceRank"];
const failures = [];
const notes = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

const focalDir = (s) => (s.focalPeer === "ordarium.main" ? join(ROOT, "resolver", s.resolverOrdarium === "ordarium-SO-V" || s.resolverOrdarium === "ordarium-SO-I" ? s.fixturePalimpsest.replace("SO-", "").length ? s.resolverOrdarium : s.resolverOrdarium : s.resolverOrdarium) : join(ROOT, "snapshots", s.fixturePalimpsest));

function paths(s) {
  const focal = s.focalPeer === "ordarium.main"
    ? (s.scenarioId === "SO-I-conflict-ordarium" ? join(ROOT, "resolver", "ordarium-SO-I") : join(ROOT, "resolver", "ordarium-SO-V"))
    : join(ROOT, "snapshots", s.fixturePalimpsest);
  const responder = s.focalPeer === "ordarium.main"
    ? join(ROOT, "snapshots", s.fixturePalimpsest)
    : join(ROOT, "resolver", s.resolverOrdarium);
  return { focal, responder };
}

for (const s of [...scenarios.primaryScenarios, ...scenarios.symmetryScenarios]) {
  const { focal, responder } = paths(s);
  check(existsSync(focal), `${s.scenarioId}: focal fixture missing ${focal}`);
  check(existsSync(responder), `${s.scenarioId}: responder fixture missing ${responder}`);
  const has = (rel) => existsSync(join(focal, rel));
  const policy = "docs/engineering/08-source-precedence-policy.md";

  if (s.class === "V") {
    check(s.expectedContact === false, `${s.scenarioId}: V must expect no contact`);
    check(has(s.outOfScopeSource), `${s.scenarioId}: out-of-scope source missing`);
    check(has(s.applicableSource), `${s.scenarioId}: applicable source missing`);
    const oos = readFileSync(join(focal, s.outOfScopeSource), "utf8");
    check(/historical|superseded|1\.2\.0|SUPERSEDED/i.test(oos), `${s.scenarioId}: out-of-scope source does not declare historical/superseded scope`);
  } else if (s.class === "L") {
    check(s.expectedContact === false, `${s.scenarioId}: L must expect no contact`);
    check(has(policy), `${s.scenarioId}: local precedence policy missing`);
    const rule = readFileSync(join(focal, policy), "utf8");
    check(/precedence|governs|override/i.test(rule), `${s.scenarioId}: precedence policy does not state an ordering rule`);
    for (const rel of Object.values(s.conflictingSources ?? {})) void rel;
    check(has(s.outOfScopeSource), `${s.scenarioId}: conflicting informational note missing`);
    check(/informational/i.test(readFileSync(join(focal, s.outOfScopeSource), "utf8")), `${s.scenarioId}: lower-ranked note is not labelled informational`);
    check(has(s.applicableSource), `${s.scenarioId}: applicable normative source missing`);
  } else if (s.class === "I") {
    check(s.expectedContact === true, `${s.scenarioId}: I must expect contact`);
    check(!has(policy), `${s.scenarioId}: I fixture must not contain a local precedence policy`);
    for (const rel of s.conflictingSources) {
      check(has(rel), `${s.scenarioId}: conflicting source missing ${rel}`);
      const text = readFileSync(join(focal, rel), "utf8");
      check(/current scope/i.test(text) && /normative/i.test(text), `${s.scenarioId}: ${rel} is not current+normative`);
    }
    const a = readFileSync(join(focal, s.conflictingSources[0]), "utf8");
    const b = readFileSync(join(focal, s.conflictingSources[1]), "utf8");
    check(/global/i.test(a) && /per-consumer/i.test(b), `${s.scenarioId}: conflicting claims are not materially opposed`);
    // responder must actually hold a resolution
    const resolverFiles = ["docs/authoritative-observation-contract.md", "docs/authoritative-feed-ordering.md", "docs/authoritative-error-contract.md", "docs/engineering/resolution-ordering.md"];
    check(resolverFiles.some((f) => existsSync(join(responder, f))), `${s.scenarioId}: responder fixture has no resolution document`);
    notes.push(`${s.scenarioId}: SYNTHETIC CONTROLLED CONFLICT (current+normative pair, no local precedence); responder holds resolution`);
  } else if (s.class === "N") {
    check(s.expectedContact === false, `${s.scenarioId}: N must expect no contact`);
    check(has(s.applicableSource), `${s.scenarioId}: N applicable source missing`);
    check(!has(policy), `${s.scenarioId}: N fixture should not need a precedence policy`);
  } else {
    failures.push(`${s.scenarioId}: unknown class ${s.class}`);
  }

  // The hidden scoring manifest legitimately carries expectedContact and class;
  // only the MODEL-VISIBLE provenance sidecars are forbidden from carrying them
  // (checked below).
}

// Provenance sidecars must not leak the answer and must cover referenced sources.
for (const name of ["V1", "V2", "V3", "L1", "L2", "L3"]) {
  const p = join(ROOT, "provenance", `${name}.json`);
  check(existsSync(p), `provenance sidecar missing: ${name}`);
  if (!existsSync(p)) continue;
  const sidecar = JSON.parse(readFileSync(p, "utf8"));
  for (const [path, rec] of Object.entries(sidecar.sources)) {
    for (const forbidden of FORBIDDEN) check(!(forbidden in rec), `provenance ${name}:${path} leaks '${forbidden}'`);
    check(existsSync(join(ROOT, "snapshots", path)) || path.startsWith("node_modules/") || path.startsWith("docs/") || path.startsWith("package.json"), `provenance ${name}: unknown source path ${path}`);
    check(typeof rec.sourceId === "string" && rec.sourceId.length > 0, `provenance ${name}:${path} missing sourceId`);
    check(["historical", "frozen_version", "current_fixture", "unspecified"].includes(rec.temporalScope), `provenance ${name}:${path} bad temporalScope`);
  }
}

for (const n of notes) console.log(`note: ${n}`);
if (failures.length > 0) {
  for (const f of failures) console.error(`FAIL: ${f}`);
  console.error(`scenario linter: ${failures.length} failure(s) — aborting setup`);
  process.exit(5);
}
console.log(`scenario linter: PASS (${scenarios.primaryScenarios.length} primary + ${scenarios.symmetryScenarios.length} symmetry)`);
