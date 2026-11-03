/**
 * Trajectory-P2-E1RD — RAW WORKER DIAGNOSTIC.
 *
 * WHY THIS EXISTS. `dshSubprocessWorkWorkerPort` deliberately DISCARDS the child's own `HOST_FAILURE` line: the
 * host's diagnostic is not a worker outcome, so feeding it to the strict Work parser would be a category error.
 * That is correct production behaviour, and it is also why a failing worker reports only
 * "exited 1 without reporting an outcome" with a stderr tail that contains warnings and nothing else.
 *
 * This script reproduces the SAME spawn the port performs and prints the child's FULL stdout and stderr, so a
 * failure can be diagnosed instead of guessed at. It is a DIAGNOSTIC, not part of any gate, and it asserts no
 * verdict.
 *
 * Usage:  node scripts/trajectory_p2e1rd/worker-probe.mjs [--arm treatment|control]
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { REPO, allocateOwnedRoot, safeCleanup } from "../trajectory_p2e0/owned-root.mjs";
import { dshBin, installHostBundle, shareDshModules, writeDeterministicProfile } from "../trajectory_p2e0/dsh-test-home.mjs";
import { prepareFixture } from "../trajectory_p2e0/benchmark-fixture.mjs";

const ARM = process.argv.includes("--arm") ? process.argv[process.argv.indexOf("--arm") + 1] : "treatment";
const PROFILE = `p2e1rd-probe-${ARM}`;
const owned = allocateOwnedRoot("p2e1rd-probe-", `probe-${ARM}`);

try {
  const home = join(owned.root, "home");
  mkdirSync(join(home, "profiles"), { recursive: true });
  installHostBundle(home, REPO);
  const share = shareDshModules(home, { strategy: "junction" });
  process.stderr.write(`module share: ${share.strategy}\n`);

  const adapterUrl = pathToFileURL(join(REPO, "scripts", "trajectory_p2e1r", "benchmark-answer-adapter.mjs")).href;
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = home;

  /**
   * The profile the harness writes, reproduced here so the probe drives the SAME composition. Without it the
   * child fails with "profile does not exist" and the probe would diagnose the wrong problem.
   */
  const profileDir = join(home, "profiles", PROFILE);
  mkdirSync(profileDir, { recursive: true });
  const answerPath = join(owned.root, "answer.json");
  writeFileSync(answerPath, `${JSON.stringify({ judgments: [], proposedAction: "INSPECT_CURRENT_WORLD", confidence: "UNKNOWN" })}\n`);
  writeFileSync(
    join(profileDir, "package.json"),
    `${JSON.stringify({ name: `dsh-profile-${PROFILE}`, private: true, dependencies: {}, dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "palimpsest-dsh-host"], patchReload: "startup" } } }, null, 2)}\n`,
  );
  writeFileSync(
    join(profileDir, "cordis.patch.yml"),
    [
      "- id: palimpsest-tools",
      "  config:",
      `    palimpsestEntry: '${join(REPO, "dist", "src", "advanced.js").replace(/\\/gu, "/")}'`,
      `    deploymentProfile: '${join(profileDir, "deployment.json").replace(/\\/gu, "/")}'`,
      "    serve: false",
      "    openDashboard: false",
      "",
      "- id: agent-default-model",
      "  config:",
      "    provider: palimpsest-local-benchmark",
      "    model: benchmark-1",
      "",
      "- insert:",
      "    - id: p2e1r-benchmark-answer",
      `      name: '${adapterUrl}'`,
      "      config:",
      `        answerPath: '${answerPath.replace(/\\/gu, "/")}'`,
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(profileDir, "deployment.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        profileId: PROFILE,
        projectId: "p2e1rd",
        localPeer: "p2e1rd-peer",
        persistentPoint: "pp-p2e1rd",
        transport: { namespace: PROFILE, databasePath: join(owned.root, "transport.sqlite") },
        databases: { orchestration: join(owned.root, "orch.sqlite"), ordarium: join(owned.root, "ord.sqlite") },
        reasoning: {},
        execution: "worktree",
        concurrency: 1,
        policy: {},
        standard: { statement: "p2e1rd probe" },
      },
      null,
      2,
    )}\n`,
  );

  let fixture = null;
  try {
    fixture = await prepareFixture({ dshHome: home, profileName: PROFILE, adapterUrl, presentationMode: ARM === "control" ? "CONTROL" : "TREATMENT" });
    const workWorker = await import(pathToFileURL(join(REPO, "dist", "src", "deployment", "work_worker.js")).href);
    const context = await fixture.controller.workWorkerAttemptContext(fixture.consumerAttemptId);
    const world = join(owned.root, "world");
    mkdirSync(world, { recursive: true });

    /** The SAME payload the port serializes, written to the same kind of temp file. */
    const contextFile = join(owned.root, "worker-context.json");
    writeFileSync(contextFile, JSON.stringify(workWorker.workWorkerEnvironmentPayload(context)));

    process.stderr.write(`spawning: ${dshBin()} --profile ${PROFILE} --work <context>\n`);
    const child = spawn(process.execPath, [dshBin(), "--profile", PROFILE, "--work", contextFile], {
      cwd: world,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      env: { ...process.env, DSH_HOME: home },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("message", (message) => { process.stderr.write(`ipc: ${JSON.stringify(message).slice(0, 300)}\n`); });
    const code = await new Promise((resolve) => child.on("close", resolve));

    process.stdout.write(`\n===== EXIT ${String(code)} =====\n`);
    process.stdout.write(`----- STDOUT (${String(stdout.length)} bytes) -----\n${stdout}\n`);
    process.stdout.write(`----- STDERR (${String(stderr.length)} bytes) -----\n${stderr}\n`);
  } finally {
    if (fixture !== null) await fixture.cleanup();
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
  }
} finally {
  await safeCleanup(owned);
}
