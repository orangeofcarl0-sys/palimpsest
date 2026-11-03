/**
 * PC1 S08 — prepare the Sablewick scenario by reusing the frozen C6-R staging.
 *
 * It invokes the existing seed/build scripts and records their identities. It does not modify the
 * C6-R evidence and does not reveal T2 material at T1.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { readJson, resetDir, writeJson } from "./lib.mjs";

const RUN = resolve(process.argv.find((value) => value.startsWith("--run="))?.slice("--run=".length) ?? join(process.cwd(), ".pc1-rig", "sablewick"));
const REPO = resolve(import.meta.dirname, "..", "..");
resetDir(RUN);

function run(script, args) {
  const result = spawnSync(process.execPath, [join(REPO, script), ...args], { encoding: "utf8", cwd: REPO });
  if (result.status !== 0) {
    throw new Error(`${script} failed (${String(result.status)}): ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

const seedOut = run("scripts/c6r/seed_p1.mjs", [`--run=${RUN}`, "--sandbox-root=/run/p1"]);
const buildOut = run("scripts/c6r/build_f1.mjs", [`--p1-run=${RUN}`, `--run=${RUN}`]);
const p1 = readJson(join(RUN, "p1", "initial-state.json"));
const f1 = readJson(join(RUN, "f1", "equivalence.json"));
const record = {
  scenario: "sablewick-pc1",
  t1: "2026-02-10T09:05:00Z",
  t2: "2026-02-14T09:10:00Z",
  pWorld: join(RUN, "p1", "world"),
  fWorld: join(RUN, "f1", "world"),
  pState: join(RUN, "p1", "state"),
  fInbox: join(RUN, "f1", "inbox"),
  p1,
  f1,
  seed: JSON.parse(seedOut.slice(seedOut.indexOf("{"))),
  build: JSON.parse(buildOut.slice(buildOut.indexOf("{"))),
  oracleCopied: false,
  note: "T1 visibility is the seed's staged set; T2 release remains a separate runner action. The evaluator oracle is not copied.",
};
writeJson(join(RUN, "prepared.json"), record);
console.log(JSON.stringify({ scenario: record.scenario, pWorld: record.pWorld, fWorld: record.fWorld, equivalent: f1.equivalent, confounders: f1.confounders }, null, 2));
