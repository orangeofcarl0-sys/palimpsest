/**
 * PC1 live cohort — prepare both scenarios and their T1/T2 inboxes, then freeze the cohort identity.
 *
 * It reuses the deterministic preparation and adds only the live-session staging: separate visible
 * sets per observation time, a normal tool profile for the product condition, and a cohort record.
 * It never copies evaluator-only material.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { materializeInboxAsOf } from "../c6r/staging.mjs";
import { resetDir, stageUpdates, visibleSetDigest, writeJson } from "../pc1/lib.mjs";

const REPO = resolve(import.meta.dirname, "..", "..");
const SABLE = join(REPO, ".pc1v1-rig", "sablewick");
const FIELD = join(REPO, ".pc1v1-rig", "field-study");
const SCENARIO_INBOX = join(REPO, "scripts", "cog6", "scenario", "inbox");
const FIELD_PACK = join(REPO, "docs", "programs", "pc1", "pack", "scenarios", "field-study");

function run(script, args) {
  const result = spawnSync(process.execPath, [join(REPO, script), ...args], { encoding: "utf8", cwd: REPO });
  if (result.status !== 0) throw new Error(`${script} failed (${String(result.status)}): ${result.stderr || result.stdout}`);
  return result.stdout;
}

run("scripts/pc1/prepare_sablewick.mjs", [`--run=${SABLE}`]);
run("scripts/pc1/prepare_field_study.mjs", [`--run=${FIELD}`]);

// Product condition: normal tool surface.
for (const file of [join(SABLE, "p1", "deployment.json"), join(FIELD, "p1", "deployment.json")]) {
  const profile = JSON.parse(readFileSync(file, "utf8"));
  profile.toolProfile = "normal";
  if (file.includes("sablewick")) profile.execution = "in-place";
  writeFileSync(file, `${JSON.stringify(profile, null, 2)}\n`);
}

// Sablewick inboxes: T1 only, and T2 with the corrected candidate + duplicate.
for (const [dir, label] of [[join(SABLE, "p1"), "P"], [join(SABLE, "f1"), "F"]]) {
  for (const [stage, at] of [["t1", "2026-02-10T09:05:00Z"], ["t2", "2026-02-14T09:10:00Z"]]) {
    const destination = join(dir, `inbox-${stage}`);
    resetDir(destination);
    materializeInboxAsOf({ source: SCENARIO_INBOX, observationTime: at, destination, release: label });
  }
}

// Field-study inboxes: T1 has no updates; T2 has the three staged update groups.
const timeline = JSON.parse(readFileSync(join(FIELD_PACK, "timeline.json"), "utf8"));
for (const dir of [join(FIELD, "p1"), join(FIELD, "f1")]) {
  for (const [stage, at] of [["t1", "2026-03-02T09:00:00Z"], ["t2", "2026-03-09T09:10:00Z"]]) {
    const destination = join(dir, `inbox-${stage}`);
    resetDir(destination);
    stageUpdates({ timeline, visibleRoot: join(FIELD_PACK, "visible"), inbox: destination, at });
  }
}

const codeFreeze = process.env.PC1V1_CODE_FREEZE ?? "";
if (!/^[0-9a-f]{40}$/u.test(codeFreeze)) {
  throw new Error("PC1V1_CODE_FREEZE must be the 40-character Code Freeze commit");
}
const cohort = {
  schema: "pc1v1-live-scenarios/v1",
  cohortId: process.env.PC1V1_COHORT_ID ?? "pc1v1-live-2026-11-03",
  codeFreeze,
  createdAt: new Date().toISOString(),
  provider: { id: "deepseek-official", model: "deepseek-flash", protocol: "anthropic-messages", baseUrl: "https://api.deepseek.com/anthropic" },
  spendAuthorization: "owner: all PC1-V1 requests authorized 2026-11-03; exact budget is in research-evidence/pc1v1/live/authorization.json",
  scenarios: {
    sablewick: {
      t1: "2026-02-10T09:05:00Z",
      t2: "2026-02-14T09:10:00Z",
      pWorld: join(SABLE, "p1", "world"),
      fWorld: join(SABLE, "f1", "world"),
      inbox: {
        pT1: join(SABLE, "p1", "inbox-t1"),
        pT2: join(SABLE, "p1", "inbox-t2"),
        fT1: join(SABLE, "f1", "inbox-t1"),
        fT2: join(SABLE, "f1", "inbox-t2"),
      },
      visibleSetDigest: {
        pT1: visibleSetDigest(join(SABLE, "p1", "inbox-t1")),
        pT2: visibleSetDigest(join(SABLE, "p1", "inbox-t2")),
        fT1: visibleSetDigest(join(SABLE, "f1", "inbox-t1")),
        fT2: visibleSetDigest(join(SABLE, "f1", "inbox-t2")),
      },
    },
    fieldStudy: {
      t1: "2026-03-02T09:00:00Z",
      t2: "2026-03-09T09:10:00Z",
      pWorld: join(FIELD, "p1", "world"),
      fWorld: join(FIELD, "f1", "world"),
      inbox: {
        pT1: join(FIELD, "p1", "inbox-t1"),
        pT2: join(FIELD, "p1", "inbox-t2"),
        fT1: join(FIELD, "f1", "inbox-t1"),
        fT2: join(FIELD, "f1", "inbox-t2"),
      },
      visibleSetDigest: {
        pT1: visibleSetDigest(join(FIELD, "p1", "inbox-t1")),
        pT2: visibleSetDigest(join(FIELD, "p1", "inbox-t2")),
        fT1: visibleSetDigest(join(FIELD, "f1", "inbox-t1")),
        fT2: visibleSetDigest(join(FIELD, "f1", "inbox-t2")),
      },
    },
  },
  oracleCopied: false,
  note: "Evaluator-only material is not included. T1/T2 inboxes are separate visible sets. The code/scenario/operator/rubric freeze is recorded before this cohort's first model call. The earlier pre-fix P pilot is preserved separately and is not part of this scored cohort.",
};
const cohortPath = join(REPO, "research-evidence", "pc1v1", "live", "cohort-plan.json");
writeJson(cohortPath, cohort);
console.log(JSON.stringify({ cohortId: cohort.cohortId, cohortPath, visible: cohort.scenarios }, null, 2));
