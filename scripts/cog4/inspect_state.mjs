#!/usr/bin/env node
/** Read-only probe: what can a fresh product session discover from the final COG-4.1 world? */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { createInstall, readJson } from "./rig4.mjs";

const RUN = resolve(process.argv.find((arg) => arg.startsWith("--run="))?.slice("--run=".length) ?? ".cog4-rig/cross-basis");
const WORK = join(RUN, "work");
const STATE = join(RUN, "state");
const record = readJson(join(RUN, "run.json"));
const installed = await createInstall({ workDir: WORK, stateDir: STATE, projectId: "sablewick" });
try {
  const out = {
    project: installed.controller.work.project(),
    taskStates: installed.controller.work.taskStates(),
    projectWorkspace: installed.projectWorkspace === undefined ? null : {
      view: await installed.projectWorkspace.view(),
      history: await installed.projectWorkspace.history(),
      journal: await installed.projectWorkspace.journal(),
      openLoops: await installed.projectWorkspace.openLoops(),
    },
    management: installed.projectManagement === undefined ? null : {
      assess: await installed.projectManagement.assess(),
      recommend: await installed.projectManagement.recommend(),
      previewStep: await installed.projectManagement.previewStep(),
    },
    continuation: {},
    git: {},
  };
  for (const [taskId, result] of Object.entries(record.results ?? {})) {
    if (result.attemptId === undefined) continue;
    out.continuation[taskId] = installed.continuation?.inspect({ result: { kind: "ATTEMPT_RESULT", ref: result.attemptId } }) ?? null;
  }
  if (record.packagedContinuation?.reworkAttempt?.attemptId !== undefined) {
    out.continuation["technical-fit-rework"] = installed.continuation?.inspect({ result: { kind: "ATTEMPT_RESULT", ref: record.packagedContinuation.reworkAttempt.attemptId } }) ?? null;
  }
  out.git = {
    head: readFileSync(join(WORK, ".git", "HEAD"), "utf8").trim(),
    status: null,
    log: null,
  };
  console.log(JSON.stringify(out, null, 2));
} finally {
  await installed.dispose();
}
