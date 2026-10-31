#!/usr/bin/env node
/**
 * COG-1 — behavioural reuse analysis from the model-visible session stream.
 *
 * For each condition's ROUND-2 session it counts which paths were READ:
 *   · round-1 deliverables (deliverables/*)   -> inherited work was consulted
 *   · the original source pack (sources/*)    -> evidence was re-read
 *   · the update pack (updates/*)             -> the new material was read
 *
 * It also records the FIRST action of the round, because "did this agent look at
 * its own prior output before doing anything else" is a different question from
 * "did it ever read it".
 *
 * Reads are counted from the `read` tool arguments (or bash file reads), never
 * guessed from prose. PLAIN JAVASCRIPT.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RIG = String(process.argv[2] ?? "");
const ZSTD = "D:/ProgramData/anaconda3/Library/bin/zstd.exe";
if (!existsSync(RIG)) throw new Error("rig not found");

function sessionFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".jsonl.zstd")) out.push(path);
    }
  };
  if (existsSync(root)) walk(root);
  return out.sort();
}

function events(file) {
  const text = execFileSync(ZSTD, ["-dc", file], { encoding: "utf8", maxBuffer: 1 << 28 });
  const parsed = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    try {
      parsed.push(JSON.parse(line));
    } catch {
      /* torn tail */
    }
  }
  return parsed;
}

function classify(pathText) {
  const p = String(pathText).replaceAll("\\", "/");
  if (/(^|\/)deliverables\//u.test(p)) return "round1_deliverable";
  if (/(^|\/)updates\//u.test(p)) return "update";
  if (/(^|\/)sources\//u.test(p)) return "source";
  return "other";
}

const result = {};
for (const condition of ["a", "b", "c"]) {
  const root = join(RIG, condition, "home", "sessions");
  const files = sessionFiles(root);
  result[condition] = { sessions: [] };
  for (const file of files) {
    const evs = events(file);
    const reads = [];
    let firstTool = null;
    let firstRead = null;
    for (const event of evs) {
      if (event.type !== "tool/call") continue;
      const name = String(event.data?.name ?? event.data?.call?.name ?? "");
      const args = event.data?.arguments ?? event.data?.call?.arguments ?? event.data?.args ?? {};
      if (firstTool === null) firstTool = name;
      if (name !== "read" && name !== "bash") continue;
      const raw = typeof args === "string" ? args : JSON.stringify(args);
      const matches = raw.match(/[A-Za-z0-9_.:\/-]*(?:sources|deliverables|updates)[A-Za-z0-9_.:\/-]*/gu) ?? [];
      for (const match of matches) {
        const kind = classify(match);
        if (kind === "other") continue;
        reads.push({ kind, path: match.slice(0, 120) });
        if (firstRead === null) firstRead = { kind, path: match.slice(0, 120) };
      }
    }
    const counts = { round1_deliverable: 0, source: 0, update: 0 };
    for (const read of reads) counts[read.kind] += 1;
    result[condition].sessions.push({ file: file.slice(root.length), firstTool, firstRead, counts, totalReadMentions: reads.length });
  }
}

const lines = [];
for (const [condition, value] of Object.entries(result)) {
  const sessions = value.sessions;
  const r1 = sessions[0];
  const r2 = sessions[1];
  lines.push(`${condition.toUpperCase()}  r1 firstTool=${r1?.firstTool} r1 counts=${JSON.stringify(r1?.counts)}`);
  lines.push(`    r2 firstTool=${r2?.firstTool} r2 firstRead=${JSON.stringify(r2?.firstRead)} r2 counts=${JSON.stringify(r2?.counts)}`);
  lines.push(`    r2 read ROUND-1 deliverables: ${r2?.counts.round1_deliverable ?? 0} mentions; sources: ${r2?.counts.source ?? 0}; updates: ${r2?.counts.update ?? 0}`);
}
console.log(lines.join("\n"));
writeFileSync(join(RIG, "reuse.json"), JSON.stringify(result, null, 2));
console.log(`\nwrote ${join(RIG, "reuse.json")}`);
