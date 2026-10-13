/** Trajectory-P2-D2 §3.3 — runtime environment evidence. READ-ONLY; writes one JSON file. */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const REAL = (process.env.DSH_HOME ?? join(homedir(), ".dsh")).split("\\").join("/");
const mods = join(REAL, "profiles", "node_modules", "@deepseek-ai");
const pkg = (name) => {
  try {
    return JSON.parse(readFileSync(join(mods, name, "package.json"), "utf8")).version;
  } catch {
    return null;
  }
};

const evidence = {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2D2_RUNTIME_ENVIRONMENT",
  stage: "Trajectory-P2-D2",
  os: `${process.platform} ${process.getSystemVersion?.() ?? ""}`.trim(),
  filesystem: "NTFS (win32); git-bash (MSYS) shell",
  node: process.version,
  nodeDocumentedMinimum: ">=24.15",
  nodeMeetsDocumentedMinimum: false,
  pnpm: (() => {
    try {
      return execFileSync("pnpm", ["--version"], { encoding: "utf8" }).trim();
    } catch {
      return null;
    }
  })(),
  dshVersion: pkg("dsh"),
  dshAgentLoopVersion: pkg("dsh-agent-loop"),
  dshSessionVersion: pkg("dsh-session"),
  dshLlmVersion: pkg("dsh-llm"),
  firstPartyDshSourcePresent: existsSync(join(mods, "dsh-session")),
  builtHostBundlePresent: existsSync("dist/src/advanced.js"),
  builtHostBundleBytes: existsSync("dist/src/advanced.js") ? statSync("dist/src/advanced.js").size : null,
  profileRootReported: "<local-path>",
  sessionPersistenceRootReported: "<local-path>",
  providerAvailability: "no provider credentials configured for this local agent session; no paid model call is made in this stage",
  deterministicNoExternalModelAdapterExists: false,
  deterministicNoExternalModelAdapterNote:
    "no shipped deterministic local LLM adapter is mounted; the P2-A capability-refusal probe remains the established no-model seam (a real Session is created with zero turns)",
  nodeLimitationDisclosed:
    "Node 24.14.1 remains below the repository documented minimum >=24.15; the same limitation was carried by P2-D0 and P2-D1 and is preserved in the final verdict",
  modelCallsMade: 0,
  privateSessionsAccessed: false,
};

writeFileSync("research-evidence/trajectory-p2d2/runtime-environment.json", `${JSON.stringify(evidence, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ node: evidence.node, dsh: evidence.dshVersion, adapter: evidence.deterministicNoExternalModelAdapterExists })}\n`);
