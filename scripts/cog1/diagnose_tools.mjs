#!/usr/bin/env node
/**
 * COG-1 DIAGNOSTIC — are the product's own tools FUNCTIONAL for this project?
 *
 * The pilot measured that no condition called a `palimpsest_*` tool. Before that is
 * reported as "the product was not used", this probe must rule out "the product
 * would have failed if it had been used". It is a separately labelled diagnostic
 * (§4), never presented as participant behaviour.
 *
 * It drives the SAME profile the C condition used, in a fresh session, and asks the
 * agent to: read the project overview, record a journal entry, read it back, and
 * report what it saw. Every result comes from the real deployment.
 */
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const RIG = "F:/Codex_Work_Space/Palimpsest/.cog1-rig";
const HOME_DIR = join(RIG, "c", "home");
const WORK = join(RIG, "c", "work");
const PROFILE = "cog1-c";
const yaml = readFileSync(`${homedir()}/.dsh/.credentials.yaml`, "utf8");
const key = yaml.match(/^\s{2}DEEPSEEK_API_KEY:\s*(\S+)\s*$/m)?.[1];
if (key === undefined) throw new Error("no key");

const task = `DIAGNOSTIC TASK. Use ONLY the palimpsest_* tools, not the file tools.

1. Call palimpsest_project with action "overview" and report the project goal and revision you see.
2. Call palimpsest_project with action "journal", kind "REFERENCE_NOTE", title "Diagnostic note", body "This entry proves the journal tool works for this project.", provenance "cog1-diagnostic".
3. Call palimpsest_project with action "journal" again with the same arguments, and report exactly what happens.
4. Call palimpsest_reasoning with action "graph" and a cellId of "diagnostic-cell", and report what happens (a typed refusal is a valid answer).
5. Call palimpsest_status and report the scheduler state.

Finish with one line: DIAGNOSTIC_OK if steps 1 worked and step 3 refused or converged, DIAGNOSTIC_PARTIAL otherwise. Report the exact tool result text, do not paraphrase.`;

const bin = "C:/Users/66494/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js";
const env = { ...process.env, DEEPSEEK_API_KEY: key, DSH_HOME: HOME_DIR, runtime_HOME: HOME_DIR };
const child = spawn(process.execPath, [bin, "--profile", PROFILE, "--once", task], { cwd: WORK, env, stdio: ["ignore", "pipe", "pipe"] });
let out = "";
let err = "";
child.stdout.on("data", (c) => { out += c.toString(); });
child.stderr.on("data", (c) => { err += c.toString(); });
const code = await Promise.race([new Promise((r) => child.on("exit", r)), new Promise((r) => setTimeout(() => { try { child.kill(); } catch {} r("TIMEOUT"); }, 600_000))]);
console.log("EXIT:", code);
for (const line of out.split("\n")) if (line.startsWith("PALIMPSEST_TURN")) console.log(line.slice(0, 4000));
console.log("--- stderr tail ---");
console.log(err.slice(-800));
