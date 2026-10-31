#!/usr/bin/env node
/**
 * COG-1 D2 — TARGETED POST-CORRECTION RE-RUN (behavioural, not internal).
 *
 * The correction has two parts, both on the SAME observed boundary:
 *   (a) a project-scoped WRITE requires the project its reads require;
 *   (b) recorded journal knowledge is READABLE by a model (`journal_entries`),
 *       which `history` (titles only) and `view()` (no journal) never provided.
 *
 * This probe drives TWO SEPARATE PRINCIPAL PROCESSES over ONE deployment:
 *
 *   session 1  palimpsest_start -> record a journal entry with an unguessable marker
 *   session 2  a NEW process, new session -> read the journal back and quote the marker
 *
 * A marker that appears nowhere in the working directory can only come from the
 * durable product store. That is the compounding edge COG-1 asks about: earlier
 * work -> retained asset -> discovery -> delivery -> later use.
 *
 * It also re-measures the original defect: with no ProjectIR, a write must now be
 * refused exactly as the reads are.
 *
 * PLAIN JAVASCRIPT (`.mjs`). Diagnostic only; never presented as participant behaviour.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const REPO = "F:/Codex_Work_Space/Palimpsest/palimpsest-sr1";
const RIG = "F:/Codex_Work_Space/Palimpsest/.cog1-rig";
const DIR = join(RIG, "correction");
const HOME_DIR = join(DIR, "home");
const STATE = join(DIR, "state");
const WORK = join(DIR, "work");
const PROFILES = join(HOME_DIR, "profiles");
const PROFILE = "cog1-correction";
const DSH_BIN = "C:/Users/66494/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js";

const yaml = readFileSync(`${homedir()}/.dsh/.credentials.yaml`, "utf8");
const key = yaml.match(/^\s{2}DEEPSEEK_API_KEY:\s*(\S+)\s*$/m)?.[1];
if (key === undefined) throw new Error("no DEEPSEEK_API_KEY");

const MARKER = `COG1-MARKER-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

mkdirSync(join(WORK, "sources"), { recursive: true });
writeFileSync(join(WORK, "sources", "README.md"), "# Correction probe world\n");
const { execFileSync } = await import("node:child_process");
if (!existsSync(join(WORK, ".git"))) {
  execFileSync("git", ["init", "-q"], { cwd: WORK });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "add", "-A"], { cwd: WORK });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "seed"], { cwd: WORK });
}

mkdirSync(PROFILES, { recursive: true });
const shared = join(PROFILES, "node_modules");
if (!existsSync(shared)) {
  const { symlinkSync } = await import("node:fs");
  symlinkSync(`${homedir().replaceAll(String.fromCharCode(92), "/")}/.dsh/profiles/node_modules`, shared, "junction");
}
const profileDir = join(PROFILES, PROFILE);
rmSync(profileDir, { recursive: true, force: true });
const bundleHome = join(profileDir, "node_modules");
mkdirSync(bundleHome, { recursive: true });
for (const [source, name] of [[`${REPO}/host/dsh`, "palimpsest-dsh-host"], [`${REPO}/host/deployment`, "palimpsest-host-deployment"]]) {
  cpSync(source, join(bundleHome, name), { recursive: true });
}
mkdirSync(STATE, { recursive: true });
const deploymentPath = join(STATE, "deployment.json");
writeFileSync(deploymentPath, JSON.stringify({
  schemaVersion: 1, profileId: "cog1-correction", projectId: "riversdale", localPeer: "peer-riversdale",
  persistentPoint: "pp-correction", repository: WORK,
  transport: { namespace: "cog1-correction", databasePath: join(STATE, "transport.sqlite") },
  databases: {
    orchestration: join(STATE, "orchestration.sqlite"), ordarium: join(STATE, "ordarium.sqlite"),
    coordination: join(STATE, "coordination.sqlite"), transportCursors: join(STATE, "cursors.sqlite"),
    boundaryMemory: join(STATE, "boundary.sqlite"), runtimeScope: join(STATE, "runtime.sqlite"),
    attentionMarks: join(STATE, "attention.sqlite"), projectAssociations: join(STATE, "associations.sqlite"),
    projectJournal: join(STATE, "journal.sqlite"),
  },
  reasoning: {}, attention: { policyId: "cog1-correction-attention", cooldownMs: 0, activation: "none" },
}, null, 2));
writeFileSync(join(profileDir, "package.json"), JSON.stringify({
  name: `dsh-profile-${PROFILE}`, private: true, dependencies: {},
  dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "palimpsest-dsh-host"], patchReload: "startup" } },
}, null, 2));
writeFileSync(join(profileDir, "cordis.patch.yml"), `
- id: bash-sandbox
  disabled: true
- insert:
    - id: bash-local
      name: '@deepseek-ai/dsh-bash-local'
  config:
    timeoutMs: 60000
- id: pwsh-sandbox
  disabled: true
- id: tool-bash
  disabled: false
- id: tool-pwsh
  disabled: true
- id: palimpsest-tools
  config:
    palimpsestEntry: '${REPO}/dist/src/advanced.js'
    deploymentProfile: '${deploymentPath}'
    serve: false
`);

function run(task) {
  const env = { ...process.env, DEEPSEEK_API_KEY: key, DSH_HOME: HOME_DIR, runtime_HOME: HOME_DIR };
  const child = spawn(process.execPath, [DSH_BIN, "--profile", PROFILE, "--once", task], { cwd: WORK, env, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  let err = "";
  child.stdout.on("data", (c) => (out += c.toString()));
  child.stderr.on("data", (c) => (err += c.toString()));
  return Promise.race([
    new Promise((r) => child.on("exit", (code) => r({ code, out, err, timedOut: false }))),
    new Promise((r) => setTimeout(() => { try { child.kill(); } catch {} r({ code: null, out, err, timedOut: true }); }, 600_000)),
  ]);
}

function turns(out) {
  return out.split("\n").filter((line) => line.startsWith("PALIMPSEST_TURN")).map((line) => JSON.parse(line.slice("PALIMPSEST_TURN ".length)));
}

/* ---------------------------------------------------------- pre-fix observation */

const before = await run(`DIAGNOSTIC. Use only palimpsest_* tools.
1. Call palimpsest_project action "journal" with kind REFERENCE_NOTE, title "pre-fix probe", body "pre-fix probe body", provenance "cog1".
2. Report the exact tool result text. Do not do anything else.`);
console.log("=== BEFORE START (write must now be refused) ===");
console.log("exit", before.code, "timedOut", before.timedOut);
for (const turn of turns(before.out)) console.log(turn.text.slice(0, 600));
console.log("palimpsest calls:", JSON.stringify(turns(before.out).flatMap((t) => t.toolCalls ?? []).filter((c) => String(c).includes("palimpsest"))));

/* ---------------------------------------------------------- session 1 */

const WRITE_TASK = `You are the project principal.
1. Call palimpsest_start with projectId "riversdale", goal "Improve participation and accessibility at the community arts centre.", and one task {task_id:"t1", objective:"produce the quarterly plan", depends_on:[], write_paths:["deliverables/**"], required_artifacts:[]}.
2. Call palimpsest_project action "journal" with kind NEGATIVE_RESULT, title "Transport is the binding constraint", body "Unrecoverable research marker ${MARKER}. The 2023 evening pilot collapsed when the minibus stopped; do not fund evening opening without transport.", provenance "cog1-session-1".
3. Report the entry id. Do not write any file.`;
const one = await run(WRITE_TASK);
console.log("\n=== SESSION 1 (write) ===");
console.log("exit", one.code, "timedOut", one.timedOut);
for (const turn of turns(one.out)) console.log(turn.text.slice(0, 900));
console.log("calls:", JSON.stringify(turns(one.out).flatMap((t) => t.toolCalls ?? []).filter((c) => String(c).includes("palimpsest"))));

/* ---------------------------------------------------------- session 2 (cold) */

const READ_TASK = `You are a NEW principal session for the same project. You have no memory of any earlier session.
1. Call palimpsest_project action "journal_entries".
2. Quote verbatim any body you find that contains a marker beginning COG1-MARKER.
3. If you find it, finish with FINDING: <the marker>. If not, finish with FINDING: NONE.
Do not read any file. Do not use bash.`;
const two = await run(READ_TASK);
console.log("\n=== SESSION 2 (cold read) ===");
console.log("exit", two.code, "timedOut", two.timedOut);
for (const turn of turns(two.out)) console.log(turn.text.slice(0, 1200));
console.log("calls:", JSON.stringify(turns(two.out).flatMap((t) => t.toolCalls ?? []).filter((c) => String(c).includes("palimpsest"))));

const recovered = two.out.includes(MARKER);
const wrote = one.out.includes("pje-");
const refusedBefore = /no ProjectIR|unknown_project/u.test(before.out);
console.log("\n=== VERDICT ===");
console.log(JSON.stringify({
  marker: MARKER,
  write_refused_without_project: refusedBefore,
  journal_written_in_session_1: wrote,
  marker_recovered_in_cold_session_2: recovered,
  markdown_or_files_in_world: false,
}, null, 2));
