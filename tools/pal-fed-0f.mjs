#!/usr/bin/env node
/**
 * PAL-FED-0F study driver (EXPERIMENTAL).
 *
 * Builds the run manifest (scenarios x treatment arms x replicates), randomizes
 * run order with a recorded seed, freezes the manifest BEFORE any scored run,
 * then executes replicates through the single-replicate runner and appends each
 * result to the run ledger.
 */
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const argOf = (f, d) => { const i = process.argv.indexOf(f); return i === -1 ? d : process.argv[i + 1]; };
const has = (f) => process.argv.includes(f);
const evidenceDir = join(root, "docs/engineering/experiments/evidence");
mkdirSync(evidenceDir, { recursive: true });

const scenariosDoc = JSON.parse(readFileSync(join(root, "docs/engineering/experiments/PAL-FED-0F-SCENARIOS.json"), "utf8"));
const FROZEN_ROOT = "F:/Codex_Work_Space/pal-fed-0f";
const artifactRoot = resolve(argOf("--artifact-root", FROZEN_ROOT));
const outRoot = resolve(argOf("--out", join(FROZEN_ROOT, "runs")));
const concurrency = Number(argOf("--concurrency", "4"));
const seed = Number(argOf("--seed", "20260911"));
const primaryReplicates = Number(argOf("--replicates", "3"));
const symmetryReplicates = Number(argOf("--symmetry-replicates", "2"));
const maxMs = Number(argOf("--max-ms", "260000"));
const only = argOf("--only", null);
const armsFilter = argOf("--arms", null);
const limit = Number(argOf("--limit", "0"));
const snapshots = resolve(argOf("--snapshots", join(FROZEN_ROOT, "snapshots")));
const palimpsestSnapshot = join(snapshots, "palimpsest-59fae6e");
const ordariumSnapshot = join(snapshots, "ordarium-073409b");

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
  for (const arm of ["F0", "F1"]) {
    const reps = s.class === "A" ? Math.max(2, Math.ceil(primaryReplicates / 2)) : primaryReplicates;
    for (let rep = 1; rep <= reps; rep += 1) {
      runs.push({ runId: `${s.scenarioId}-${arm}-r${rep}`, scenarioId: s.scenarioId, scenarioClass: s.class, focalPeer: s.focalPeer, prompt: s.operatorPrompt, arm, replicate: rep, kind: "primary" });
    }
  }
}
for (const s of scenariosDoc.symmetryScenarios) {
  for (const arm of ["F0", "F1"]) {
    for (let rep = 1; rep <= symmetryReplicates; rep += 1) {
      runs.push({ runId: `${s.scenarioId}-${arm}-r${rep}`, scenarioId: s.scenarioId, scenarioClass: s.class, focalPeer: s.focalPeer, prompt: s.operatorPrompt, arm, replicate: rep, kind: "symmetry" });
    }
  }
}
if (only !== null) {
  const keep = runs.filter((r) => r.scenarioId === only);
  runs.length = 0;
  runs.push(...keep);
}
if (armsFilter !== null) {
  const keepArms = new Set(armsFilter.split(","));
  const kept = runs.filter((r) => keepArms.has(r.arm));
  runs.length = 0;
  runs.push(...kept);
}
let ordered = runs;
if (!(only !== null && runs.length <= 1)) {
  const rand = mulberry32(seed);
  ordered = runs.map((r) => ({ ...r, sort: rand() })).sort((a, b) => a.sort - b.sort).map((r, i) => ({ ...r, runOrder: i + 1 }));
}
if (limit > 0) ordered = ordered.slice(0, limit);

const manifest = {
  protocol: "PAL-FED-0E",
  seed,
  primaryReplicates,
  symmetryReplicates,
  concurrency,
  snapshots: { palimpsest: "59fae6e", ordarium: "073409b" },
  arms: {
    F0: { artifact: join(artifactRoot, "C0"), note: "criterion absent" },
    F1: { artifact: join(artifactRoot, "C1"), note: "local-first criterion present" },
  },
  model: { provider: "deepseek-official", model: "deepseek-flash" },
  pollIntervalMs: 2000,
  frozenAt: new Date().toISOString(),
  runCount: ordered.length,
  runs: ordered.map((r) => ({ runId: r.runId, scenarioId: r.scenarioId, scenarioClass: r.scenarioClass, focalPeer: r.focalPeer, arm: r.arm, replicate: r.replicate, kind: r.kind, runOrder: r.runOrder })),
};
const manifestPath = join(evidenceDir, "pal-fed-0f-run-manifest.json");
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

const runScript = join(root, "tools/pal-fed-0f-run.mjs");
const ledgerPath = join(evidenceDir, "pal-fed-0f-runs.jsonl");

function runOne(run) {
  return new Promise((resolvePromise) => {
    const argv = [runScript, "--run-id", run.runId, "--scenario-id", run.scenarioId, "--scenario-class", run.scenarioClass,
      "--focal", run.focalPeer, "--prompt", run.prompt, "--treatment", run.arm, "--replicate", String(run.replicate), "--order", String(run.runOrder),
      "--artifact", join(artifactRoot, run.arm), "--out", outRoot, "--max-ms", String(maxMs),
      "--palimpsest-snapshot", palimpsestSnapshot, "--ordarium-snapshot", ordariumSnapshot];
    const child = spawn(process.execPath, argv, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (c) => { out += String(c); });
    child.stderr.on("data", (c) => { err += String(c); });
    child.on("exit", (code) => {
      const line = out.split(/\r?\n/).find((l) => l.startsWith("PAL_FED_0E_RESULT "));
      if (line === undefined) {
        const invalid = { runId: run.runId, scenarioId: run.scenarioId, scenarioClass: run.scenarioClass, focalPeer: run.focalPeer, criterion: run.arm, replicate: run.replicate, runOrder: run.runOrder, validity: "invalid", reason: `runner produced no result (exit ${code})`, stderrTail: err.slice(-500) };
        appendFileSync(ledgerPath, `${JSON.stringify(invalid)}\n`);
        console.log(`[invalid] ${run.runId}`);
      } else {
        appendFileSync(ledgerPath, `${line.slice("PAL_FED_0E_RESULT ".length)}\n`);
        const r = JSON.parse(line.slice("PAL_FED_0E_RESULT ".length));
        console.log(`[done] ${run.runId} initiation=${r.autonomousInitiation} contact=${r.eventCount > 0} receipt=${r.autonomousReceipt} response=${r.autonomousResponse} delivery=${r.autonomousReplyDelivery} ack=${r.ackedBatchCount > 0}`);
      }
      resolvePromise();
    });
  });
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
