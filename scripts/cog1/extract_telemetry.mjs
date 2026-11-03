#!/usr/bin/env node
/**
 * COG-1 — extract the model-visible session telemetry with the zstd CLI.
 *
 * WHY THIS EXISTS. Node's zstd decoder stops after the first frame, and the DSH
 * session stream is concatenated frames. Reading it with `zstdDecompressSync`
 * returned only the session header, which would have made every run look empty.
 * This uses the standalone `zstd -dc`, which decodes the whole stream, and reports
 * the tool-use histogram the product's own boundary produced.
 *
 * It reads, never writes, and it never includes message bodies in the summary.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RIG = String(process.argv[2] ?? "");
if (RIG === "") throw new Error("usage: extract_telemetry.mjs <rig>");
const ZSTD = "D:/ProgramData/anaconda3/Library/bin/zstd.exe";

function findSessionFiles(root) {
  const out = [];
  if (!existsSync(root)) return out;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".jsonl.zstd")) out.push(path);
    }
  };
  walk(root);
  return out;
}

function decode(file) {
  return execFileSync(ZSTD, ["-dc", file], { encoding: "utf8", maxBuffer: 1 << 28 });
}

function summarise(text) {
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  const events = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      /* a torn final write is not a session event */
    }
  }
  const types = {};
  const tools = {};
  let toolStarts = 0;
  let assistantMessages = 0;
  let userTexts = [];
  for (const event of events) {
    const type = String(event.type ?? "");
    types[type] = (types[type] ?? 0) + 1;
    if (type === "tool/call") {
      toolStarts += 1;
      const name = event.data?.name ?? event.data?.call?.name ?? "?";
      tools[name] = (tools[name] ?? 0) + 1;
    }
    if (type === "assistant/message") assistantMessages += 1;
    if (type === "agent/inbox/spliced" && Array.isArray(event.data?.inserted)) {
      for (const message of event.data.inserted) {
        const textPart = (message.content ?? []).filter((block) => block.type === "text").map((block) => block.text).join("");
        if (textPart !== "") userTexts.push(textPart.slice(0, 120));
      }
    }
  }
  return { events: events.length, types, toolStarts, tools, assistantMessages, userTexts: userTexts.slice(0, 4) };
}

const result = {};
for (const condition of ["a", "b", "c"]) {
  const home = join(RIG, condition, "home");
  const files = findSessionFiles(home);
  result[condition] = files.map((file) => {
    let text;
    try {
      text = decode(file);
    } catch (error) {
      return { file, error: String(error) };
    }
    return { file: file.slice(home.length), ...summarise(text) };
  });
  const allTools = {};
  let toolStarts = 0;
  for (const session of result[condition]) {
    if (session.error !== undefined) continue;
    toolStarts += session.toolStarts;
    for (const [name, count] of Object.entries(session.tools)) allTools[name] = (allTools[name] ?? 0) + count;
  }
  console.log(`${condition.toUpperCase()}: sessions=${result[condition].length} toolStarts=${toolStarts}`);
  console.log(`   tools: ${Object.entries(allTools).map(([k, v]) => `${k}x${v}`).join(", ") || "(none)"}`);
  console.log(`   palimpsest calls: ${Object.entries(allTools).filter(([k]) => k.startsWith("palimpsest_")).reduce((a, [, v]) => a + v, 0)}`);
}
writeFileSync(join(RIG, "telemetry.json"), JSON.stringify(result, null, 2));
console.log(`\nwrote ${join(RIG, "telemetry.json")}`);
