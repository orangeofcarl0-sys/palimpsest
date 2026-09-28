#!/usr/bin/env node
/**
 * R1-R §17/§18/§31 — THE PRIMARY MATRIX RUNNER.
 *
 * 2 scenarios × 3 conditions × 5 repetitions = 30 trials, run in the PRE-REGISTERED RANDOMIZED BLOCKS
 * the parent protocol froze: each repetition is one block containing exactly one C0, one C1 and one C2,
 * in an order derived from the ONE protocol seed. §18 forbids running all C0 before all C2, and this
 * runner takes its ordering from `scripts/r1/protocol.mjs`'s own `blockOrder` rather than inventing one,
 * so the frozen design is what actually executes.
 *
 * §31: the runner completes all 30 trials and does NOT inspect early aggregates to tune the fixtures.
 * It prints one line per trial as it finishes — that is progress reporting, not aggregate inspection —
 * and computes nothing comparative until every trial has a record.
 *
 * ONE PROCESS PER TRIAL, like `trial.mjs` itself, because the parent protocol's §4 requires a fresh
 * install, worker process and attempt per trial.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOT } from "./amendment.mjs";
import { blockOrder } from "../r1/protocol.mjs";
import { SCENARIOS } from "./scenarios.mjs";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, "").split("=");
  return [key, rest.join("=")];
}));
const RIG = args.get("rig") ?? join(REPO_ROOT, "..", ".r1r-matrix");
const SCENARIO_IDS = (args.get("scenarios") ?? "B,C").split(",").map((value) => value.trim().toUpperCase()).filter((value) => value !== "");
const REPETITIONS = Number(args.get("repetitions") ?? "5");

/**
 * §18: the block ordering, from the FROZEN protocol seed. `blockOrder(n)` returns `n` blocks, each an
 * ordering of C0/C1/C2. It is called once per scenario so each scenario's matrix is independently
 * blocked — the parent protocol blocks per scenario, not across them.
 */
function plan() {
  const blocks = blockOrder(REPETITIONS);
  const trials = [];
  for (const scenarioId of SCENARIO_IDS) {
    for (const block of blocks) {
      for (const condition of block.order) {
        trials.push({ scenarioId, block: block.block, repetition: block.block, condition });
      }
    }
  }
  return trials;
}

const out = (line) => process.stdout.write(`${line}\n`);

async function main() {
  const trials = plan();
  const expected = SCENARIO_IDS.length * 3 * REPETITIONS;
  if (trials.length !== expected) throw new Error(`the plan produced ${trials.length} trials, expected ${expected}`);
  mkdirSync(RIG, { recursive: true });
  rmSync(join(RIG, "runs"), { recursive: true, force: true });
  mkdirSync(join(RIG, "runs"), { recursive: true });
  writeFileSync(join(RIG, "plan.json"), JSON.stringify({ schemaVersion: 1, expected, repetitions: REPETITIONS, blockOrder: blockOrder(REPETITIONS), trials }, null, 2), "utf8");
  out(`R1-R PRIMARY MATRIX — ${trials.length} trials planned (${SCENARIO_IDS.join("+")} × C0/C1/C2 × ${REPETITIONS})`);
  out(`block ordering (protocol seed): ${blockOrder(REPETITIONS).map((block) => `b${block.block}[${block.order.join(",")}]`).join(" ")}`);

  const records = [];
  let index = 0;
  for (const trial of trials) {
    index += 1;
    const scenario = SCENARIOS[trial.scenarioId];
    const started = Date.now();
    let line;
    try {
      line = execFileSync(
        process.execPath,
        [join(REPO_ROOT, "scripts", "r1r", "trial.mjs"), `--scenario=${trial.scenarioId}`, `--condition=${trial.condition}`, `--block=${trial.block}`, `--repetition=${trial.repetition}`, `--rig=${join(RIG, "runs")}`],
        { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 },
      ).trim().split("\n").pop() ?? "";
    } catch (error) {
      line = `HARNESS_ERROR ${error?.message ?? String(error)}`;
    }
    const trialId = `${scenario.id}-${trial.condition}-b${trial.block}r${trial.repetition}`;
    const recordPath = join(RIG, "runs", trialId, "out", "trial.json");
    const record = existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, "utf8")) : null;
    if (record !== null) records.push(record);
    const seconds = Math.round((Date.now() - started) / 1000);
    out(`[${String(index).padStart(2, " ")}/${trials.length}] ${trialId.padEnd(14)} ${seconds}s  ${line}`);
    // The partial record is flushed after every trial so an interrupted run leaves an honest trail.
    writeFileSync(join(RIG, "trials.partial.json"), JSON.stringify({ completed: records.length, expected, trials: records }, null, 2), "utf8");
  }

  writeFileSync(join(RIG, "trials.json"), JSON.stringify({ schemaVersion: 1, expected, completed: records.length, trials: records }, null, 2), "utf8");
  out(`\nPRIMARY MATRIX COMPLETE — ${records.length}/${trials.length} trial records written`);
  out(`record: ${join(RIG, "trials.json")}`);
  process.exit(0);
}

await main();
