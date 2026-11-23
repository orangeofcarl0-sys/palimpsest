
/** Resident GitHub self-maintenance pilot. Run with Node 24.15 or later. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers/promises";
import { readJson } from "../../energy/contract.mjs";
import { appToken, GitHubForge } from "./github-forge.mjs";
import { GitHubMaintenance, githubWindow } from "./github-maintenance.mjs";
import { GitHubMaintenanceRuntime, publish } from "./github-maintenance-runtime.mjs";
import { MaintenanceSlot, sealOf } from "./slot.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const attribution = resolve(directory, "../../../repository/commit-attribution.mjs");
const [command, path] = process.argv.slice(2);
assert(["qualify", "serve", "inspect"].includes(command) && path,
  "Usage: github-maintenance-cli.mjs qualify <new-run-dir> | serve|inspect <plan.json>");

if (command === "qualify") {
  const output = resolve(path);
  const result = spawnSync(process.execPath, ["--test", join(directory, "github-maintenance.test.mjs")],
    { encoding: "utf8", env: { ...process.env, PALIMPSEST_GITHUB_QUALIFICATION: output }, timeout: 900_000 });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  assert(result.status === 0, result.error?.message ?? "GITHUB_MOCK_QUALIFICATION_FAILED");
} else {
  const plan = readJson(resolve(path)), { scope, root, initial, grant, githubApp } = plan;
  assert(/^[a-z][a-z0-9-]{0,29}$/u.test(scope.projectId) && scope.base === "main" && scope.mode === "paid-usage-only" &&
    scope.repository === "orangeofcarl0-sys/palimpsest" && scope.repositoryId === 1340337791 &&
    scope.attributionAppId === 15368 && /^[a-z0-9-]+\[bot\]$/u.test(scope.publisher), "GITHUB_PILOT_SCOPE_CHANGED");
  assert.deepEqual(scope.window, githubWindow, "GITHUB_PILOT_WINDOW_CHANGED");
  assert(plan.work.length === 2 && plan.work[0].source === "evidence" && plan.work[1].source === "direct" &&
    plan.work[1].after === plan.work[0].id, "GITHUB_PILOT_NEEDS_TWO_ORDERED_WORK_ITEMS");
  const slotPath = join(resolve(root), "slot.sqlite");
  if (command === "inspect") {
    const slot = new MaintenanceSlot(slotPath);
    try {
      const pilot = new GitHubMaintenance({ slot, scope });
      console.log(JSON.stringify(pilot.inspect(), null, 2));
    } finally { slot.close(); }
  } else {
    const trusted = resolve(plan.archive);
    const checkPrivatePath = file => {
      assert(typeof file === "string" && isAbsolute(file), "GITHUB_TRUSTED_HOST_FILE_REQUIRED");
      const local = relative(trusted, resolve(file));
      assert(local && !local.startsWith("..") && !isAbsolute(local), "GITHUB_TRUSTED_HOST_FILE_REQUIRED");
      return resolve(file);
    };
    const qualification = readJson(checkPrivatePath(plan.qualification));
    const { proof, receipt } = qualification;
    assert(proof.mode === "mock" && proof.paidRequests === 0 && proof.completed === 2 && receipt === sealOf(proof),
      "GITHUB_MOCK_QUALIFICATION_REQUIRED");
    const grantPath = checkPrivatePath(grant);
    const readGrant = () => readJson(grantPath);
    assert.equal(readGrant().initial, initial, "GITHUB_STARTUP_AUTHORIZATION_WRONG_SOURCE");
    assert.deepEqual(readGrant().work, plan.work.map(work => work.id), "GITHUB_STARTUP_AUTHORIZATION_WRONG_WORK");
    const token = appToken({ ...githubApp, privateKeyPath: checkPrivatePath(githubApp.privateKeyPath),
      repositoryId: scope.repositoryId });
    const forge = new GitHubForge({ ...scope, token });
    const metadata = await forge.repositoryFacts();
    assert(metadata.permissions?.admin !== true, "GITHUB_MAINTENANCE_PUBLISHER_MUST_BE_RESTRICTED");
    const runtime = new GitHubMaintenanceRuntime({ ...plan, scope, attribution, token,
      remote: "https://github.com/" + scope.repository + ".git", providerProbe: checkPrivatePath(plan.providerProbe) });
    runtime.refresh();
    assert.equal(runtime.git("rev-parse", initial + "^{tree}"), proof.sourceTree, "GITHUB_MOCK_SOURCE_TREE_CHANGED");
    runtime.git("merge-base", "--is-ancestor", initial, "refs/palimpsest/main");
    const install = runtime.build(initial), slot = new MaintenanceSlot(slotPath, { projectId: scope.projectId, mode: scope.mode, initial: install });
    const lease = slot.claimResident();
    const pilot = new GitHubMaintenance({ slot, scope, forge, runtime, readGrant });
    let stop = false;
    process.on("SIGTERM", () => { stop = true; });
    process.on("SIGINT", () => { stop = true; });
    try {
      for (const work of plan.work) pilot.state.register(work);
      while (!stop) {
        await pilot.tick();
        const current = pilot.inspect();
        const output = join(resolve(root), "resident-status.json");
        // Publish immutable snapshots and overwrite only the pointer used by operators.
        const snapshot = publish(join(resolve(root), "status", sealOf(current) + ".json"), current);
        const { writeFileSync, renameSync } = await import("node:fs");
        writeFileSync(output + ".writing", JSON.stringify(snapshot, null, 2) + "\n", { flush: true });
        renameSync(output + ".writing", output);
        if (current.work.every(work => ["VERIFIED", "PAUSED", "REJECTED"].includes(work.state))) break;
        await setTimeout(current.work.some(work => ["WAITING_FOR_CI", "WAITING_FOR_OWNER"].includes(work.state)) ? 60_000 : 1000);
      }
    } finally {
      slot.releaseResident(lease);
      slot.close();
    }
  }
}
