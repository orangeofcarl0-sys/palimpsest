/**
 * PC1-V1 R9 — build the frozen runner cohort from the staged worlds.
 *
 * Every session is a `wsl.exe bash -lc` invocation of a PC1-V1 session script. The prompts are
 * base64-encoded into the command so quoting cannot alter the frozen text. Both conditions receive
 * the same observation times, visible sets and Subagent invitation.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "..", "..");
const args = new Map(
  process.argv.slice(2).map((value) => {
    const at = value.indexOf("=");
    return at < 0 ? [value, ""] : [value.slice(0, at), value.slice(at + 1)];
  }),
);
const codeFreeze = args.get("--code-freeze") ?? "";
if (!/^[0-9a-f]{40}$/u.test(codeFreeze)) throw new Error("--code-freeze must be a 40-character commit");
const cohortId = args.get("--cohort-id") ?? "pc1v1-live-2026-11-03";
const liveRoot = args.get("--live-root") ?? "/home/admini/pc1v1/runs";
const hostRoot = args.get("--host-evidence") ?? join(REPO, "research-evidence", "pc1v1", "live", cohortId);
const plan = JSON.parse(readFileSync(join(REPO, "research-evidence", "pc1v1", "live", "cohort-plan.json"), "utf8"));

function toWslPath(path) {
  if (path.startsWith("/")) return path;
  return path.replace(/^([A-Za-z]):[\\/]/u, (_, drive) => `/mnt/${String(drive).toLowerCase()}/`).replace(/\\/gu, "/");
}
const hostRootWsl = toWslPath(hostRoot);

const COMMON = "You may use independent subagents for bounded sub-questions; report their findings separately and do not present them as accepted truth.";
const SABLE_P_T1 = `You are the planning agent for the Sablewick community battery programme. This is a historical project-state replay observed at 2026-02-10 09:05 UTC. The programme repository is /run/p1/world and the programme inbox is /run/p1/inbox. Continue the programme from the state and information available at that observation time. Examine relevant new information, determine whether the existing plan remains justified, and identify the next useful actions. Respect the programme authorization and acceptance requirements. Record your conclusions and proposed actions through the available project mechanisms. ${COMMON} Work only inside the programme repository and the programme inbox.`;
const SABLE_P_T2 = `You are the planning agent for the Sablewick community battery programme. This is a later historical project-state replay observed at 2026-02-14 09:10 UTC. The programme repository is /run/p1/world and the programme inbox is /run/p1/inbox. Continue from the project state you find. New items may have arrived since the earlier observation, including a corrected capability bulletin and a byte-identical duplicate; a late report from the earlier observation may also be present. Do not treat a file or a late report as accepted authority. Distinguish source standing, candidates, accepted facts, negative findings and open questions; record conclusions and proposed actions through the available project mechanisms. ${COMMON} Work only inside the programme repository and the programme inbox.`;
const SABLE_F_T1 = `You are the planning agent for the Sablewick community battery programme. This is a historical project-state replay observed at 2026-02-10 09:05 UTC. The programme workspace is /run/f1/world; read HANDOFF.md first. The programme inbox is /run/f1/inbox. Continue the programme from the state and information available at that observation time. Examine relevant new information, determine whether the existing plan remains justified, and identify the next useful actions. Respect the programme authorization and acceptance requirements. Record conclusions and proposed actions as Markdown/Git. ${COMMON} Work only inside the programme workspace and the programme inbox.`;
const SABLE_F_T2 = `You are the planning agent for the Sablewick community battery programme. This is a later historical project-state replay observed at 2026-02-14 09:10 UTC. The programme workspace is /run/f1/world; read HANDOFF.md first. The programme inbox is /run/f1/inbox. Continue from the state you find. New items may have arrived since the earlier observation, including a corrected capability bulletin and a byte-identical duplicate; a late report from the earlier observation may also be present. Do not treat a file or a late report as accepted authority. Record conclusions and proposed actions as Markdown/Git. ${COMMON} Work only inside the programme workspace and the programme inbox.`;

function b64(value) {
  return Buffer.from(value, "utf8").toString("base64");
}

function shell(command) {
  return ["wsl.exe", "bash", "-lc", command];
}

function sableCommand(input) {
  const { run, work, condition, stage, prompt } = input;
  const script = condition === "P" ? "session_sablewick_p.sh" : "session_sablewick_f.sh";
  const runVar = condition === "P" ? "C6R_P1_RUN" : "C6R_F1_RUN";
  const copyLines =
    stage === "T2"
      ? `rm -rf ${liveRoot}/sablewick/${run.replace(`${liveRoot}/sablewick/`, "")}/p1 ${liveRoot}/sablewick/${run.replace(`${liveRoot}/sablewick/`, "")}/f1\n` +
        `cp -a ${liveRoot}/sablewick/${condition === "P" ? "p-t1" : "f-t1"}/${condition === "P" ? "p1" : "f1"} ${run}/${condition === "P" ? "p1" : "f1"}\n`
      : "";
  const out = `${run}/${condition === "P" ? "p1" : "f1"}/scored-deepseek/out`;
  const host = `${hostRootWsl}/${input.id}/wsl-out`;
  const inbox = `${run}/${condition === "P" ? "p1" : "f1"}/inbox-${stage.toLowerCase()}`;
  return shell(
    `set -e\n${copyLines}export ${runVar}=${run}\nexport C6R_INBOX_DIR=${inbox}\nexport C6R_PROMPT="$(printf '%s' '${b64(prompt)}' | base64 -d)"\nbash /mnt/f/Codex_Work_Space/Palimpsest/palimpsest-sr1/scripts/pc1v1/${script}; STATUS=$?\nmkdir -p '${host}'\ncp -a '${out}/.' '${host}/' || true\nexit $STATUS`,
  );
}

function fieldCommand(input) {
  const { run, work, condition, stage, id } = input;
  const out = `${run}/${condition === "P" ? "p1" : "f1"}/scored-${stage}/out`;
  const host = `${hostRootWsl}/${id}/wsl-out`;
  return shell(
    `set -e\nexport PC1_RUN=${run}\nexport PC1_CONDITION=${condition}\nexport PC1_STAGE=${stage}\nbash /mnt/f/Codex_Work_Space/Palimpsest/palimpsest-sr1/scripts/pc1v1/session_field.sh; STATUS=$?\nmkdir -p '${host}'\ncp -a '${out}/.' '${host}/' || true\nexit $STATUS`,
  );
}

const sessions = [];
for (const [scenario, condition, stage, prompt] of [
  ["sablewick", "P", "T1", SABLE_P_T1],
  ["sablewick", "F", "T1", SABLE_F_T1],
  ["sablewick", "P", "T2", SABLE_P_T2],
  ["sablewick", "F", "T2", SABLE_F_T2],
]) {
  const run = `${liveRoot}/sablewick/${condition === "P" ? "p" : "f"}-${stage.toLowerCase()}`;
  const id = `sablewick-${condition.toLowerCase()}-${stage.toLowerCase()}`;
  sessions.push({
    id,
    scenario,
    condition,
    stage,
    subagents: true,
    cwd: ".",
    command: sableCommand({ id, run, work: scenario, condition, stage, prompt }),
    env: {},
    timeoutMs: 900000,
  });
}
for (const condition of ["P", "F"]) {
  for (const stage of ["T1", "T2"]) {
    sessions.push({
      id: `field-study-${condition.toLowerCase()}-${stage.toLowerCase()}`,
      scenario: "field-study",
      condition,
      stage,
      subagents: true,
      cwd: ".",
      command: fieldCommand({ id: `field-study-${condition.toLowerCase()}-${stage.toLowerCase()}`, run: `${liveRoot}/field-study`, work: "field-study", condition, stage }),
      env: {},
      timeoutMs: 900000,
    });
  }
}

const cohort = {
  schema: "pc1v1-live-cohort/v1",
  cohortId,
  codeFreeze,
  provider: plan.provider,
  oracleCopied: false,
  scenarios: plan.scenarios,
  visibleSetDigest: {
    sablewick: plan.scenarios.sablewick.visibleSetDigest,
    fieldStudy: plan.scenarios.fieldStudy.visibleSetDigest,
  },
  sessions,
  note:
    "Frozen before the first scored model call. Both conditions use the same observation times, visible sets, provider/model and Subagent invitation. Each T2 session continues the matching T1 world; raw WSL output is copied under each session's wsl-out.",
};
writeFileSync(join(REPO, "research-evidence", "pc1v1", "live-cohort.json"), `${JSON.stringify(cohort, null, 2)}\n`);
console.log(JSON.stringify({ cohortId, codeFreeze, sessions: sessions.length, out: join(REPO, "research-evidence", "pc1v1", "live-cohort.json") }, null, 2));
