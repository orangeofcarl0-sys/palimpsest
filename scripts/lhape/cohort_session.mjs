#!/usr/bin/env node
/**
 * LHAPE-C one-session entry. FAIL-CLOSED.
 *
 * The cohort gate (`run_cohort.mjs`) owns the cohort-level authorization and ceilings. This entry is
 * what a gate-authorized session would invoke: it requires the SAME authorization again in the child
 * environment and refuses to start a real DSH session without it. It does not score; scoring is a
 * separate, outside-sandbox step so no evaluator material reaches the model.
 *
 * Required when authorized:
 *   LHAPE_SESSION_AUTHORIZATION  path to a lhape-spend-authorization/v1 file
 *   LHAPE_DSH_BIN                real DSH bin
 *   LHAPE_PROFILE                DSH profile name
 *   LHAPE_PROMPT                 the condition's user prompt (no hidden dependency)
 *   LHAPE_SESSION_ROOT           a run-owned DSH home
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const condition = String(args.get("condition") ?? "");
if (!["F", "L", "G"].includes(condition)) {
  process.stderr.write("condition must be F, L or G\n");
  process.exit(2);
}

const authorizationPath = process.env.LHAPE_SESSION_AUTHORIZATION ?? "";
if (authorizationPath === "" || !existsSync(authorizationPath)) {
  process.stderr.write(
    "BLOCKED: no LHAPE session authorization is present. A cohort gate authorization must be threaded into the child; an APS/PC1-V1 authorization does not transfer.\n",
  );
  process.exit(2);
}
const authorization = JSON.parse(readFileSync(authorizationPath, "utf8"));
if (
  authorization.schema !== "lhape-spend-authorization/v1" ||
  authorization.authorized !== true ||
  !Array.isArray(authorization.conditions) ||
  !authorization.conditions.includes(condition)
) {
  process.stderr.write("BLOCKED: the session authorization does not cover this condition.\n");
  process.exit(2);
}

const dshBin = process.env.LHAPE_DSH_BIN;
const profile = process.env.LHAPE_PROFILE;
const prompt = process.env.LHAPE_PROMPT;
const sessionRoot = process.env.LHAPE_SESSION_ROOT;
if ([dshBin, profile, prompt, sessionRoot].some((value) => typeof value !== "string" || value.trim() === "")) {
  process.stderr.write("LHAPE_DSH_BIN, LHAPE_PROFILE, LHAPE_PROMPT and LHAPE_SESSION_ROOT are required for an authorized session\n");
  process.exit(2);
}

const child = spawn(process.execPath, [dshBin, "--profile", profile, "--once", prompt], {
  env: { ...process.env, DSH_HOME: sessionRoot },
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code === null ? 1 : code));
