#!/usr/bin/env node
/**
 * PAL-FED-0I study driver (EXPERIMENTAL).
 *
 * Builds the 10+2 scenario x A0/A1/A2 x 3 replicate run manifest (90 primary +
 * 6 symmetry = 96), randomizes the order with a recorded seed, freezes it
 * BEFORE any scored run, then executes each replicate through the single
 * 0I runner and appends the result to the run ledger.
 */
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const argOf = (f, d) => { const i = process.argv.indexOf(f); return i === -1 ? d : process.argv[i + 1]; };
const has = (f) => process.argv.includes(f);
const evidenceDir = join(root, "docs/engineering/experiments/evidence");
mkdirSync(evidenceDir, { recursive: true });

const scenariosDoc = JSON.parse(readFileSync(join(root, "docs/engineering/experiments/PAL-FED-0I-SCENARIOS.json"), "utf8"));
const FIXTURES = resolve(argOf("--fixtures", "F:/Codex_Work_Space/pal-fed-0h"));
const FROZEN_ROOT = "F:/Codex_Work_Space/pal-fed-0i";
const artifactRoot = resolve(argOf("--artifact-root", join(FROZEN_ROOT, "artifact")));
const outRoot = resolve(argOf("--out", join(FROZEN_ROOT, "runs")));
const concurrency = Number(argOf("--concurrency", "4"));
const seed = Number(argOf("--seed", "20260911"));
const primaryReplicates = Number(argOf("--replicates", "3"));
const symmetryReplicates = Number(argOf("--symmetry-replicates", "1"));
const maxMs = Number(argOf("--max-ms", "300000"));
const only = argOf("--only", null);
const armsFilter = argOf("--arms", null);
const limit = Number(argOf("--limit", "0"));
const ARMS = ["A0", "A1", "A2"];
const fixtureDir = (name) => join(FIXTURES, "snapshots", name);
const resolverDir = (name) => join(FIXTURES, "resolver", name);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const runs = [];
for (const s of scenariosDoc.primaryScenarios) {
  for (const arm of ARMS) {
    for (let rep = 1; rep <= primaryReplicates; rep += 1) {
      runs.push({ runId: `${s.scenarioId}-${arm}-r${rep}`, scenarioId: s.scenarioId, scenarioClass: s.class, focalPeer: s.focalPeer, prompt: s.operatorPrompt, arm, replicate: rep, kind: "primary", fixture: s.fixturePalimpsest, resolver: s.resolverOrdarium, expectedContact: s.expectedContact === true, locallyResolvable: s.locallyResolvable === true, applicableSource: s.applicableSource ?? null, outOfScopeSource: s.outOfScopeSource ?? null, ticketInitial: s.ticketInitial, resolutionOwner: s.resolutionOwner ?? null });
    }
  }
}
for (const s of scenariosDoc.symmetryScenarios) {
  for (const arm of ARMS) {
    for (let rep = 1; rep <= symmetryReplicates; rep += 1) {
      runs.push({ runId: `${s.scenarioId}-${arm}-r${rep}`, scenarioId: s.scenarioId, scenarioClass: s.class, focalPeer: s.focalPeer, prompt: s.operatorPrompt, arm, replicate: rep, kind: "symmetry", fixture: s.fixturePalimpsest, resolver: s.resolverOrdarium, expectedContact: s.expectedContact === true, locallyResolvable: s.locallyResolvable === true, applicableSource: s.applicableSource ?? null, outOfScopeSource: s.outOfScopeSource ?? null, ticketInitial: s.ticketInitial, resolutionOwner: s.resolutionOwner ?? null });
    }
  }
}
if (only !== null) { const keep = runs.filter((r) => r.scenarioId === only); runs.length = 0; runs.push(...keep); }
if (armsFilter !== null) { const keepArms = new Set(armsFilter.split(",")); const kept = runs.filter((r) => keepArms.has(r.arm)); runs.length = 0; runs.push(...kept); }
let ordered = runs;
if (!(only !== null && runs.length <= 1)) {
  const rand = mulberry32(seed);
  ordered = runs.map((r) => ({ ...r, sort: rand() })).sort((a, b) => a.sort - b.sort).map((r, i) => ({ ...r, runOrder: i + 1 }));
}
if (limit > 0) ordered = ordered.slice(0, limit);

const artifactPath = artifactRoot;
const manifest = {
  protocol: "PAL-FED-0I",
  seed, primaryReplicates, symmetryReplicates, concurrency,
  fixturesRoot: FIXTURES,
  artifact: artifactPath,
  admissionIsolation: "single artifact; arms differ only in trusted host admissionMode",
  model: { provider: "deepseek-official", model: "deepseek-flash" },
  pollIntervalMs: 2000,
  frozenAt: new Date().toISOString(),
  runCount: ordered.length,
  runs: ordered.map((r) => ({ runId: r.runId, scenarioId: r.scenarioId, scenarioClass: r.scenarioClass, focalPeer: r.focalPeer, arm: r.arm, replicate: r.replicate, kind: r.kind, runOrder: r.runOrder, fixture: r.fixture, resolver: r.resolver, expectedContact: r.expectedContact === true, locallyResolvable: r.locallyResolvable === true, applicableSource: r.applicableSource, outOfScopeSource: r.outOfScopeSource, ticketInitial: r.ticketInitial, resolutionOwner: r.resolutionOwner, prompt: r.prompt })),
};
const manifestPath = join(evidenceDir, "pal-fed-0i-run-manifest.json");
if (has("--dry")) {
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`manifest frozen: ${ordered.length} runs -> ${manifestPath}`);
  process.exit(0);
}
if (!existsSync(manifestPath)) {
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
} else {
  const frozen = JSON.parse(readFileSync(manifestPath, "utf8"));
  const digest = (m) => createHash("sha256").update(JSON.stringify(m.runs)).digest("hex");
  if (digest(frozen) !== digest(manifest)) {
    console.error("FATAL: run manifest differs from the frozen manifest; refusing to run.");
    process.exit(3);
  }
}
console.log(`manifest frozen (${ordered.length} runs, seed ${seed})`);

const runScript = join(root, "tools/pal-fed-0i-run.mjs");
const ledgerPath = join(evidenceDir, "pal-fed-0i-runs.jsonl");

function runOne(run) {
  return new Promise((resolvePromise) => {
    const argv = [runScript, "--run-id", run.runId, "--scenario-id", run.scenarioId, "--scenario-class", run.scenarioClass,
      "--focal", run.focalPeer, "--prompt", run.prompt, "--treatment", run.arm, "--expected-contact", String(run.expectedContact === true), "--replicate", String(run.replicate), "--order", String(run.runOrder),
      "--locally-resolvable", String(run.locallyResolvable === true),
      "--ticket-initial", run.ticketInitial,
      ...(run.resolutionOwner === null ? [] : ["--resolution-owner", run.resolutionOwner]),
      ...(run.applicableSource === null ? [] : ["--applicable-source", run.applicableSource]),
      ...(run.outOfScopeSource === null ? [] : ["--out-of-scope-source", run.outOfScopeSource]),
      "--artifact", artifactPath, "--out", outRoot, "--max-ms", String(maxMs),
      "--focal-snapshot", run.focalPeer === "ordarium.main" ? resolverDir(run.scenarioId === "SO-I-conflict-ordarium" ? "ordarium-SO-I" : "ordarium-SO-V") : fixtureDir(run.fixture),
      "--responder-snapshot", run.focalPeer === "ordarium.main" ? fixtureDir(run.fixture) : resolverDir(run.resolver)];
    const child = spawn(process.execPath, argv, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (c) => { out += String(c); });
    child.stderr.on("data", (c) => { err += String(c); });
    child.on("exit", (code) => {
      const line = out.split(/\r?\n/).find((l) => l.startsWith("PAL_FED_0I_RESULT "));
      if (line === undefined) {
        const invalid = { runId: run.runId, scenarioId: run.scenarioId, scenarioClass: run.scenarioClass, focalPeer: run.focalPeer, treatment: run.arm, replicate: run.replicate, runOrder: run.runOrder, validity: "invalid", reason: `runner produced no result (exit ${code})`, stderrTail: err.slice(-600) };
        appendFileSync(ledgerPath, `${JSON.stringify(invalid)}\n`);
        console.log(`[invalid] ${run.runId}`);
      } else {
        appendFileSync(ledgerPath, `${line.slice("PAL_FED_0I_RESULT ".length)}\n`);
        const r = JSON.parse(line.slice("PAL_FED_0I_RESULT ".length));
        console.log(`[done] ${run.runId} attempts=${r.attemptCount} first=${r.firstSubmissionDisposition}/${r.firstSubmissionOutcome} intervention=${r.interventionCount} post=${r.postFirstInterventionAction} owner=${r.ownerContacted}/${r.ownerResponseReceived} unresolved=${r.explicitUnresolved} admittedResolved=${r.policyAdmissibleResolved} deadEnd=${r.deadEnd} stop=${r.stopReason}`);
      }
      resolvePromise();
    });
  });
}

// Fixture coherence gate (accidental manifest/installed/lock mismatch fails setup).
function auditFixture(label, dir) {
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const declared = [];
  for (const value of Object.values(pkg.dependencies ?? {})) {
    const m = String(value).match(/ordarium-v(\d+\.\d+\.\d+)/);
    if (m) declared.push(m[1]);
  }
  if (declared.length === 0) { console.log(`fixture-audit ${label}: no ordarium pin declared (peer workspace); skip`); return; }
  const installed = [];
  for (const name of ["core", "host-kit", "ledger-sqlite"]) {
    const p = join(dir, "node_modules/@ordarium", name, "package.json");
    if (!existsSync(p)) continue;
    installed.push(JSON.parse(readFileSync(p, "utf8")).version);
  }
  if (installed.length === 0) { console.log(`fixture-audit ${label}: no local @ordarium install; skip installed check`); return; }
  console.log(`fixture-audit ${label}: declared=[${[...new Set(declared)].join(",")}] installed=[${[...new Set(installed)].join(",")}]`);
  if (new Set(declared).size !== 1) { console.error(`FIXTURE INCOHERENT (${label}): mixed declared pins`); process.exit(4); }
  if (declared[0] !== installed[0] || new Set(installed).size !== 1) { console.error(`FIXTURE INCOHERENT (${label}): declared ${declared[0]} != installed ${installed.join("/")}`); process.exit(4); }
}
{
  const seen = new Set();
  for (const r of ordered) {
    const focal = r.focalPeer === "ordarium.main" ? resolverDir(r.scenarioId === "SO-I-conflict-ordarium" ? "ordarium-SO-I" : "ordarium-SO-V") : fixtureDir(r.fixture);
    const responder = r.focalPeer === "ordarium.main" ? fixtureDir(r.fixture) : resolverDir(r.resolver);
    for (const [label, dir] of [["focal:" + r.scenarioId, focal], ["responder:" + r.scenarioId, responder]]) {
      if (seen.has(dir)) continue;
      seen.add(dir);
      auditFixture(label, dir);
    }
  }
}

let index = 0;
async function worker() {
  while (index < ordered.length) {
    const run = ordered[index];
    index += 1;
    await runOne(run);
  }
}
const workers = Array.from({ length: Math.min(concurrency, ordered.length) }, () => worker());
await Promise.all(workers);
console.log(`study batch complete: ${ordered.length} runs; ledger ${ledgerPath}`);
