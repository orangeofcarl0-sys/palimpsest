#!/usr/bin/env node
/**
 * COG-3 evidence collector. Copies immutable run artifacts out of the test-owned rig into the
 * repository, with a SHA-256 manifest. It never modifies the source files and never overwrites a
 * different run's directory.
 */
import { copyFileSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { RIG, REPO, SCENARIO, ensureDir, sessionTelemetry, sha256File, writeJson } from "./rig3.mjs";

const OUT = join(REPO, "research-evidence", "cog3");
const SOURCES = [
  { label: "P1", dir: join(RIG, "P1"), kind: "principal" },
  { label: "S1", dir: join(RIG, "S1"), kind: "baseline" },
  { label: "F1", dir: join(RIG, "F1"), kind: "baseline" },
  { label: "MECH1", dir: join(RIG, "probe-mech"), kind: "mechanism" },
  { label: "MECH2", dir: join(RIG, "probe-mech2"), kind: "mechanism" },
  { label: "MECH3", dir: join(RIG, "probe-mech3"), kind: "mechanism" },
];

ensureDir(OUT);
const artifacts = [];
function copy(src, rel) {
  if (!existsSync(src)) return;
  const dest = join(OUT, rel);
  ensureDir(join(dest, ".."));
  copyFileSync(src, dest);
  artifacts.push({ file: rel.replaceAll("\\", "/"), bytes: statSync(dest).size, digest: sha256File(dest) });
}

const runs = [];
for (const source of SOURCES) {
  if (!existsSync(source.dir)) continue;
  const target = `runs/${source.label}`;
  ensureDir(join(OUT, target));
  const candidates = [
    ["run.json", "run.json"],
    ["run-one.json", "run-one.json"],
    ["run-two.json", "run-two.json"],
    ["seed.json", "seed.json"],
    ["principal-one.log", "principal-one.log"],
    ["principal-two.log", "principal-two.log"],
    ["baseline-S.log", "baseline-S.log"],
    ["baseline-F.log", "baseline-F.log"],
    ["work/deliverables/plan.md", "plan.md"],
    ["work/deliverables/probe.md", "probe.md"],
  ];
  for (const [from, to] of candidates) copy(join(source.dir, from), join(target, to));

  // The plan snapshots captured by the run record, so a later in-world edit cannot change what was
  // scored.
  for (const recordName of ["run-one.json", "run-two.json"]) {
    const recordPath = join(source.dir, recordName);
    if (!existsSync(recordPath)) continue;
    const record = JSON.parse(readFileSync(recordPath, "utf8"));
    const snapshot = record.planAfterRoundOne?.text ?? record.planAfterRoundTwo?.text;
    if (typeof snapshot === "string") {
      const dest = join(OUT, target, recordName === "run-one.json" ? "plan-snapshot-round-one.md" : "plan-snapshot-round-two.md");
      ensureDir(join(dest, ".."));
      const { writeFileSync } = await import("node:fs");
      writeFileSync(dest, snapshot);
      artifacts.push({ file: dest.slice(OUT.length + 1).replaceAll("\\", "/"), bytes: statSync(dest).size, digest: sha256File(dest) });
    }
  }

  const sessionsDir = join(source.dir, "home", "sessions");
  if (existsSync(sessionsDir)) {
    const telemetry = sessionTelemetry(join(source.dir, "home"));
    for (const session of telemetry.sessions) {
      const rel = `sessions/${source.label}/${session.file.replace(/^[\\/]/u, "").replaceAll("\\", "/").replaceAll("/", "_")}`;
      const src = join(sessionsDir, session.file.replace(/^[\\/]/u, ""));
      if (existsSync(src)) copy(src, rel);
    }
  }
  runs.push({ label: source.label, kind: source.kind, dir: source.dir });
}

const scenario = [];
for (const group of ["sources", "updates"]) {
  const dir = join(SCENARIO, group);
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    scenario.push({ file: `scenario/${group}/${name}`, bytes: statSync(file).size, digest: sha256File(file) });
  }
}

const manifest = {
  schema: "cog3-evidence/v1",
  collectedAt: new Date().toISOString(),
  out: OUT,
  runs,
  scenario,
  artifacts,
  artifactCount: artifacts.length,
};
writeJson(join(OUT, "manifest.json"), manifest);
console.log(JSON.stringify({ runs: runs.length, artifacts: artifacts.length, scenario: scenario.length, out: OUT }));
