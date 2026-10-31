#!/usr/bin/env node
/**
 * Collect the COG-2 evidence package. Read-only with respect to the rig; writes only under
 * research-evidence/cog2. Session artifacts are copied, not moved, and every copy is digested.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { withDeployment } from "./rig.mjs";

const REPO = "F:/Codex_Work_Space/Palimpsest/palimpsest-sr1";
const RIG = "F:/Codex_Work_Space/Palimpsest/.cog2-rig";
const OUT = join(REPO, "research-evidence", "cog2");
const RUNS = join(OUT, "runs");
const TRIALS = join(OUT, "trials");
const SESSIONS = join(OUT, "sessions");

function ensure(path) {
  mkdirSync(path, { recursive: true });
}
function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
function copy(src, dest) {
  ensure(dirname(dest));
  copyFileSync(src, dest);
}

ensure(RUNS);
ensure(TRIALS);
ensure(SESSIONS);

const runSources = {
  positive: join(RIG, "positive", "run.json"),
  "matrix-A": join(RIG, "matrix", "A", "run.json"),
  "matrix-B": join(RIG, "matrix", "B", "run.json"),
  "matrix-C": join(RIG, "matrix", "C", "run.json"),
  "matrix-D": join(RIG, "matrix", "D", "run.json"),
  "matrix-CSEAM": join(RIG, "matrix", "CSEAM", "run.json"),
  "matrix-NEG": join(RIG, "matrix", "NEG", "run.json"),
  "matrix-NEGSEAM": join(RIG, "matrix", "NEGSEAM", "run.json"),
  "inheritance-P-round-1": join(RIG, "inheritance", "P", "round-1.json"),
  "inheritance-P-round-2-original-reconstructed": join(RIG, "inheritance", "P", "round-2-original-reconstructed.json"),
  "inheritance-P-round-2-seam": join(RIG, "inheritance", "P", "round-2-seam.json"),
  "inheritance-P-seed": join(RIG, "inheritance", "P", "seed.json"),
  "inheritance-F-round-1": join(RIG, "inheritance", "F", "round-1.json"),
  "inheritance-F-round-2": join(RIG, "inheritance", "F", "round-2.json"),
};

const manifestRuns = [];
for (const [name, src] of Object.entries(runSources)) {
  if (!existsSync(src)) {
    manifestRuns.push({ name, source: src, copied: false, reason: "source missing" });
    continue;
  }
  const dest = join(RUNS, `${name}.json`);
  copy(src, dest);
  const record = JSON.parse(readFileSync(dest, "utf8"));
  manifestRuns.push({
    name,
    source: src.replaceAll("\\", "/"),
    copied: true,
    bytes: readFileSync(dest).length,
    digest: sha256File(dest),
    condition: record.condition ?? "POSITIVE",
    round: record.round ?? null,
    exitCode: record.exitCode ?? record.originalObservation?.exitCode ?? null,
    toolCalls: record.telemetry?.mainSession?.toolCalls ?? record.originalObservation?.toolCalls ?? null,
    palimpsestCalls: record.telemetry?.mainSession?.palimpsestCalls ?? record.originalObservation?.palimpsestCalls ?? null,
  });
}

// Trial plans: copy the exact delivered text, not a summary.
const planSources = {
  A: join(RIG, "matrix", "A", "run.json"),
  B: join(RIG, "matrix", "B", "run.json"),
  C: join(RIG, "matrix", "C", "run.json"),
  D: join(RIG, "matrix", "D", "run.json"),
  CSEAM: join(RIG, "matrix", "CSEAM", "run.json"),
  P2SEAM: join(RIG, "inheritance", "P", "round-2-seam.json"),
  F2: join(RIG, "inheritance", "F", "round-2.json"),
};
const trials = [];
for (const [name, src] of Object.entries(planSources)) {
  if (!existsSync(src)) continue;
  const record = JSON.parse(readFileSync(src, "utf8"));
  const text = record.deliverable?.text ?? null;
  if (text === null) continue;
  const dir = join(TRIALS, name);
  ensure(dir);
  writeFileSync(join(dir, "plan.md"), text);
  trials.push({ name, file: `trials/${name}/plan.md`, chars: text.length, digest: createHash("sha256").update(text).digest("hex") });
}
// The original P round-2 plan was overwritten by the seam re-test; its session stream is retained.
trials.push({
  name: "P2",
  file: null,
  reason:
    "the delivered plan file was overwritten by the seam re-test before collection; the preserved session stream (runs/inheritance-P-round-2-original-reconstructed.json) is the primary record and records 0 Palimpsest calls",
});

// The journal as it stands after the P rounds, read through the product's own surface.
const journal = await withDeployment(
  { unit: "collect", stateDir: join(RIG, "inheritance", "P", "state"), workDir: join(RIG, "inheritance", "P", "work"), projectId: "harrowgate" },
  async (deployment) => {
    const entries = await deployment.installed.application.projectWorkspace.journal();
    return entries.map((view) => ({
      entryId: view.entry.entryId,
      kind: view.entry.kind,
      title: view.entry.title,
      provenance: view.entry.provenance,
      body: view.entry.body,
    }));
  },
);
writeFileSync(join(TRIALS, "P-journal-after.json"), JSON.stringify(journal, null, 2));

// Raw session streams: copy every session file and digest it.
const homes = {
  positive: join(RIG, "positive", "home"),
  A: join(RIG, "matrix", "A", "home"),
  B: join(RIG, "matrix", "B", "home"),
  C: join(RIG, "matrix", "C", "home"),
  D: join(RIG, "matrix", "D", "home"),
  CSEAM: join(RIG, "matrix", "CSEAM", "home"),
  NEG: join(RIG, "matrix", "NEG", "home"),
  NEGSEAM: join(RIG, "matrix", "NEGSEAM", "home"),
  P1: join(RIG, "inheritance", "P", "home-r1"),
  P2: join(RIG, "inheritance", "P", "home-r2"),
  P2SEAM: join(RIG, "inheritance", "P", "home-r2-seam"),
  F1: join(RIG, "inheritance", "F", "home-r1"),
  F2: join(RIG, "inheritance", "F", "home-r2"),
};
const sessionManifest = [];
for (const [label, home] of Object.entries(homes)) {
  const sessionsDir = join(home, "sessions");
  if (!existsSync(sessionsDir)) continue;
  const target = join(SESSIONS, label);
  ensure(target);
  for (const group of readdirSync(sessionsDir, { withFileTypes: true })) {
    if (!group.isDirectory()) continue;
    const groupDir = join(sessionsDir, group.name);
    for (const session of readdirSync(groupDir, { withFileTypes: true })) {
      if (!session.isDirectory()) continue;
      const file = join(groupDir, session.name, "session.v4.jsonl.zstd");
      if (!existsSync(file)) continue;
      const dest = join(target, `${session.name}.zstd`);
      copy(file, dest);
      sessionManifest.push({
        run: label,
        file: dest.slice(OUT.length + 1).replaceAll("\\", "/"),
        bytes: readFileSync(dest).length,
        digest: sha256File(dest),
      });
    }
  }
}
writeFileSync(join(SESSIONS, "manifest.json"), JSON.stringify({ schema: "cog2-session-artifacts/v1", count: sessionManifest.length, artifacts: sessionManifest }, null, 2));

writeFileSync(join(OUT, "collection.json"), JSON.stringify({ collectedAt: new Date().toISOString(), runs: manifestRuns, trials, journalEntries: journal.length, sessions: sessionManifest.length }, null, 2));
console.log(JSON.stringify({ runs: manifestRuns.length, trials: trials.length, journal: journal.length, sessions: sessionManifest.length }));
