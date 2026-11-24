
/** Resident GitHub self-maintenance pilot. Run with Node 24.15 or later. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers/promises";
import { readJson } from "../../energy/contract.mjs";
import { appToken, GitHubForge } from "./github-forge.mjs";
import { assertFailureQualification, authorizeFailure } from "./github-failure-qualification.mjs";
import { GitHubMaintenance, githubWindow } from "./github-maintenance.mjs";
import { previewIssues } from "./github-issue-discipline.mjs";
import { GitHubMaintenanceRuntime, publish } from "./github-maintenance-runtime.mjs";
import { MaintenanceSlot, sealOf } from "./slot.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const attribution = resolve(directory, "../../../repository/commit-attribution.mjs");
const [command, path, caseId, attestation] = process.argv.slice(2);
assert(["qualify", "serve", "inspect", "authorize-failure", "replay-draft", "sync-issues", "propose-issue", "publish-issue"].includes(command) && path,
  "Usage: github-maintenance-cli.mjs qualify <new-run-dir> | serve|inspect|authorize-failure <plan.json> | " +
  "replay-draft <plan.json> <case-id> [attestation.json] | sync-issues <plan.json> [--apply] | " +
  "propose-issue <plan.json> <proposal.json> | publish-issue <plan.json> <approved-digest>");

function publishStatus(root, current) {
  const output = join(root, "resident-status.json");
  const snapshot = publish(join(root, "status", sealOf(current) + ".json"), current);
  writeFileSync(output + ".writing", JSON.stringify(snapshot, null, 2) + "\n", { flush: true });
  renameSync(output + ".writing", output);
}

if (command === "qualify") {
  const output = resolve(path);
  const result = spawnSync(process.execPath, ["--test", join(directory, "github-maintenance.test.mjs")],
    { stdio: "inherit", env: { ...process.env, PALIMPSEST_GITHUB_QUALIFICATION: output }, timeout: 45 * 60_000 });
  assert(result.status === 0, result.error?.message ?? "GITHUB_MOCK_QUALIFICATION_FAILED");
} else {
  const plan = readJson(resolve(path)), { scope, root, initial, grant, githubApp, failureRecovery } = plan;
  const issuePolicy = plan.issueDiscipline;
  if (issuePolicy) assert(isAbsolute(issuePolicy.root) && realpathSync(issuePolicy.root) === realpathSync(root),
    "GITHUB_ISSUE_AUTHORITY_ROOT_CHANGED");
  assert(/^[a-z][a-z0-9-]{0,29}$/u.test(scope.projectId) && scope.base === "main" && scope.mode === "paid-usage-only" &&
    scope.repository === "orangeofcarl0-sys/palimpsest" && scope.repositoryId === 1340337791 &&
    scope.attributionAppId === 15368 && /^[a-z0-9-]+\[bot\]$/u.test(scope.publisher), "GITHUB_PILOT_SCOPE_CHANGED");
  assert.deepEqual(scope.window, githubWindow, "GITHUB_PILOT_WINDOW_CHANGED");
  assert(plan.work.length === 2 && plan.work[0].source === "evidence" && plan.work[1].source === "direct" &&
    plan.work[1].after === plan.work[0].id, "GITHUB_PILOT_NEEDS_TWO_ORDERED_WORK_ITEMS");
  const slotPath = join(resolve(root), "slot.sqlite");
  const trusted = resolve(plan.archive);
  const checkPrivatePath = file => {
    assert(typeof file === "string" && isAbsolute(file), "GITHUB_TRUSTED_HOST_FILE_REQUIRED");
    const local = relative(trusted, resolve(file));
    assert(local && !local.startsWith("..") && !isAbsolute(local), "GITHUB_TRUSTED_HOST_FILE_REQUIRED");
    return resolve(file);
  };
  const openForge = async () => {
    const token = appToken({ ...githubApp, privateKeyPath: checkPrivatePath(githubApp.privateKeyPath),
      repositoryId: scope.repositoryId });
    const forge = new GitHubForge({ ...scope, token });
    const metadata = await forge.repositoryFacts();
    assert(metadata.permissions?.admin !== true, "GITHUB_MAINTENANCE_PUBLISHER_MUST_BE_RESTRICTED");
    return { forge, token };
  };

  if (["sync-issues", "propose-issue", "publish-issue"].includes(command)) {
    assert(issuePolicy && existsSync(slotPath), "GITHUB_ISSUE_POLICY_AND_SLOT_REQUIRED");
    if (command === "sync-issues" && caseId === undefined) {
      console.log(JSON.stringify(previewIssues(slotPath, scope, issuePolicy), null, 2));
    } else {
      if (command === "sync-issues") assert(caseId === "--apply", "GITHUB_ISSUE_SYNC_EXPECTED_APPLY");
      if (command === "publish-issue") assert(issuePolicy.approvedProposals?.includes(caseId), "GITHUB_ISSUE_PROPOSAL_APPROVAL_REQUIRED");
      const slot = new MaintenanceSlot(slotPath);
      let lease;
      try {
        lease = slot.claimResident();
        const { forge } = command === "propose-issue" ? {} : await openForge();
        const pilot = new GitHubMaintenance({ slot, scope, forge, issuePolicy });
        if (command === "propose-issue") {
          console.log(JSON.stringify(pilot.issues.propose(readJson(checkPrivatePath(resolve(caseId)))), null, 2));
        } else if (command === "publish-issue") {
          console.log(JSON.stringify(await pilot.issues.publishProposal(caseId), null, 2));
        } else {
          await pilot.syncIssues();
          console.log(JSON.stringify(pilot.issues.view(), null, 2));
        }
      } finally {
        if (lease) slot.releaseResident(lease);
        slot.close();
      }
    }
  } else if (command === "replay-draft") {
    assert(/^failure-[a-f0-9]{64}$/u.test(caseId ?? ""), "GITHUB_STOPPED_DRAFT_CASE_REQUIRED");
    const legacy = attestation && readJson(checkPrivatePath(resolve(attestation)));
    const slot = new MaintenanceSlot(slotPath);
    let lease;
    try {
      lease = slot.claimResident();
      const runtime = new GitHubMaintenanceRuntime({ scope, root, image: plan.image, author: plan.author, archive: trusted });
      const pilot = new GitHubMaintenance({ slot, scope, runtime, issuePolicy });
      const result = await pilot.replayDraft(caseId, legacy);
      assert(result, "GITHUB_STOPPED_DRAFT_UNAVAILABLE");
      publishStatus(resolve(root), pilot.inspect());
      console.log(JSON.stringify(result, null, 2));
    } finally {
      if (lease) slot.releaseResident(lease);
      slot.close();
    }
  } else if (command === "inspect") {
    const slot = new MaintenanceSlot(slotPath);
    try {
      const pilot = new GitHubMaintenance({ slot, scope, issuePolicy });
      console.log(JSON.stringify(pilot.inspect(), null, 2));
    } finally { slot.close(); }
  } else {
    const qualification = readJson(checkPrivatePath(failureRecovery?.qualification ?? plan.qualification));
    const { proof, receipt } = qualification;
    const grantPath = checkPrivatePath(grant);
    const readGrant = () => existsSync(grantPath) ? readJson(grantPath) : null;
    if (failureRecovery) {
      assertFailureQualification(plan, qualification);
      if (command === "authorize-failure") {
        const authorization = authorizeFailure(plan, qualification);
        console.log(JSON.stringify({ work: authorization.work[0], authorization: sealOf(authorization) }));
        process.exit(0);
      }
    } else {
      assert(command !== "authorize-failure", "GITHUB_FAILURE_RECOVERY_REQUIRED");
      assert(proof.mode === "mock" && proof.paidRequests === 0 && proof.completed === 2 && proof.image === plan.image && receipt === sealOf(proof),
        "GITHUB_MOCK_QUALIFICATION_REQUIRED");
      const originalGrant = readGrant();
      assert.equal(originalGrant?.initial, initial, "GITHUB_STARTUP_AUTHORIZATION_WRONG_SOURCE");
      assert.deepEqual(originalGrant.work, plan.work.map(work => work.id), "GITHUB_STARTUP_AUTHORIZATION_WRONG_WORK");
    }
    const { forge, token } = await openForge();
    const runtime = new GitHubMaintenanceRuntime({ ...plan, scope, attribution, token,
      remote: "https://github.com/" + scope.repository + ".git", providerProbe: checkPrivatePath(plan.providerProbe) });
    runtime.refresh();
    if (!failureRecovery) assert.equal(runtime.git("rev-parse", initial + "^{tree}"), proof.sourceTree, "GITHUB_MOCK_SOURCE_TREE_CHANGED");
    runtime.git("merge-base", "--is-ancestor", initial, "refs/palimpsest/main");
    const install = runtime.build(initial);
    if (failureRecovery) assert.deepEqual(install, proof.installation, "GITHUB_QUALIFIED_INSTALLATION_CHANGED");
    const slot = new MaintenanceSlot(slotPath, { projectId: scope.projectId, mode: scope.mode, initial: install });
    const lease = slot.claimResident();
    const pilot = new GitHubMaintenance({ slot, scope, forge, runtime, readGrant, issuePolicy });
    let stop = false, projection, projectionError, timer;
    const sync = () => {
      projection ??= pilot.syncIssues().catch(error => { projectionError = error; }).finally(() => { projection = undefined; });
    };
    process.on("SIGTERM", () => { stop = true; });
    process.on("SIGINT", () => { stop = true; });
    try {
      for (const work of plan.work) pilot.state.register(work);
      if (plan.recovery) {
        const { id, archive, candidate, seed, checkpoint, bundle, qualification } = plan.recovery;
        assert.equal(id, plan.work[0].id, "GITHUB_REWORK_WRONG_WORK");
        const { proof: validated, receipt: seal } = readJson(checkPrivatePath(qualification));
        assert(seal === sealOf(validated) && validated.mode === "mock" && validated.paidRequests === 0 &&
          validated.pass === true && validated.id === id && validated.archive === archive && validated.candidate === candidate &&
          validated.seed === seed && validated.checkpoint === checkpoint && validated.image === plan.image,
          "GITHUB_REWORK_MOCK_QUALIFICATION_REQUIRED");
        const work = pilot.state.list().find(row => row.id === id);
        const recovered = runtime.prepareRecovery(work, {
          archive, candidate, seed, checkpoint, bundle: checkPrivatePath(bundle), sourceTree: validated.sourceTree,
        });
        pilot.resumeRejected(id, recovered);
      }
      if (issuePolicy) timer = setInterval(sync, 15_000);
      while (!stop) {
        await pilot.tick();
        if (issuePolicy && pilot.issues.pending()) sync();
        if (projectionError) throw projectionError;
        const current = pilot.inspect();
        publishStatus(resolve(root), current);
        if (current.work.every(work => ["VERIFIED", "PAUSED", "REJECTED"].includes(work.state)) &&
            current.failureCases.every(item => item.disposition) && !pilot.issues?.pending()) break;
        await setTimeout(current.work.some(work => ["WAITING_FOR_CI", "WAITING_FOR_OWNER"].includes(work.state)) ? 60_000 : 1000);
      }
    } finally {
      clearInterval(timer);
      await projection;
      slot.releaseResident(lease);
      slot.close();
    }
  }
}
