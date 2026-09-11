#!/usr/bin/env node
/**
 * PAL-FED-0I ground-truth linter (EXPERIMENT TOOLING, §42).
 *
 * Re-runs the 0H fixture/ground-truth checks against the frozen 0H fixtures and
 * adds the 0I ticket checks: I/SO-I carry an OPEN oracle ticket with a
 * resolution owner distinct from the focal; V/L/N/SO-V carry no ticket. Fails
 * the setup before any model run when ground truth or ticketing is unsupported.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
};
const FIXTURES = arg("--fixtures", "F:/Codex_Work_Space/pal-fed-0h");
const manifestPath = arg(
  "--manifest",
  join(process.cwd(), "docs/engineering/experiments/PAL-FED-0I-SCENARIOS.json"),
);
const scenarios = JSON.parse(readFileSync(manifestPath, "utf8"));
const FORBIDDEN = ["expectedContact", "winner", "preferredSource", "correctSource", "sufficient", "insufficient", "shouldEscalate", "needsPeer", "groundTruth", "scenarioClass", "precedenceRank"];
const failures = [];
const notes = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

function paths(s) {
  const focal = s.focalPeer === "ordarium.main"
    ? (s.scenarioId === "SO-I-conflict-ordarium" ? join(FIXTURES, "resolver", "ordarium-SO-I") : join(FIXTURES, "resolver", "ordarium-SO-V"))
    : join(FIXTURES, "snapshots", s.fixturePalimpsest);
  const responder = s.focalPeer === "ordarium.main"
    ? join(FIXTURES, "snapshots", s.fixturePalimpsest)
    : join(FIXTURES, "resolver", s.resolverOrdarium);
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

  // ---- 0I ticket projection preconditions ----------------------------------
  if (s.class === "I") {
    check(s.ticketInitial === "OPEN", `${s.scenarioId}: I must seed an OPEN oracle ticket`);
    check(typeof s.resolutionOwner === "string" && s.resolutionOwner.length > 0, `${s.scenarioId}: I must name a resolutionOwner`);
    check(s.resolutionOwner !== s.focalPeer, `${s.scenarioId}: resolutionOwner must differ from the focal peer`);
    check(s.resolutionOwner === "ordarium.main" || s.resolutionOwner === "palimpsest.main", `${s.scenarioId}: resolutionOwner must be a fixed peer`);
  } else {
    check(s.ticketInitial === "NONE", `${s.scenarioId}: non-conflict class must seed NO ticket`);
    check(s.resolutionOwner === undefined, `${s.scenarioId}: non-conflict class must not name a resolutionOwner`);
  }
}

for (const n of notes) console.log(`note: ${n}`);
if (failures.length > 0) {
  for (const f of failures) console.error(`FAIL: ${f}`);
  console.error(`scenario linter: ${failures.length} failure(s) — aborting setup`);
  process.exit(5);
}
console.log(`scenario linter: PASS (${scenarios.primaryScenarios.length} primary + ${scenarios.symmetryScenarios.length} symmetry; fixtures ${FIXTURES})`);
