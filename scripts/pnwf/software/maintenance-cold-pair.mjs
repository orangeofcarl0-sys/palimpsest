/** Cold handover of the real #298 publication decision, in isolated DSH worlds. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runContainerSession } from "../container_adapter.mjs";
import { docker } from "../container_runtime.mjs";
import { ExecutionBudget, USAGE_ONLY_SCHEMA } from "../execution_budget.mjs";
import { PAID_COHORT_SCHEMA, PAID_MODE } from "../bounded_provider.mjs";
import { startMockProvider } from "../mock_provider.mjs";
import { OPENCODE_GO_MESSAGES, requireOpenCodeGoProbe } from "../opencode_go.mjs";
import { attribute } from "../energy/evidence.mjs";
import { analyzeAttributedStage } from "../analyze_energy_trajectory.mjs";
import { checkpoint, conclusion, profileFor } from "../energy/product.mjs";
import { digest, git, readJson, writeJson } from "../energy/contract.mjs";
import { launchDeployment, loadDeploymentProfile } from "../../../dist/src/advanced.js";
import { readProjectIndex } from "../../../host/dsh/lib/project_index.js";
import { githubWindow as window } from "./self-evolution/github-maintenance.mjs";
import { HandoverSupervisor } from "./self-evolution/handover-supervisor.mjs";
import { manifest, makeVolume, offline, quote, repo, success } from "./self-evolution/workspace.mjs";

const basis = "712ccf0f2a1f10ba2c87bce0143eed717dcb1144";
const projectId = "maintenance-cold-pair";
const stageId = "HANDOVER";
const evidenceFiles = ["work.json", "pull-302.json", "issue-298.json", "issue-comment.json", "cold-replay.json"];
const goal = "接续 Palimpsest 仓库的维护交接。核对 #298 当前还需要做什么，依据 evidence/ 中的原工单和后续核验资料修正 handoff.md。交接应有可复核的版本与来源，保留历史结果。只提交 handoff.md。完成后正常交付。";
const changedLine = "#298 真实 GitHub 写回待宿主变更合入并按授权启用。";
const image = "sha256:702da68f6115eaddcf2e9b69bc6093d663f3d5d4e5cddcf2c7fb4c44664a67aa";
const reportFile = "docs/engineering/GITHUB-MAINTENANCE-FAILURE-REPORT.md";
const log = (...args) => console.log(new Date().toISOString(), ...args);
const runGit = (args) => execFileSync("git", args, { cwd: repo, maxBuffer: 32 * 1024 * 1024, timeout: 180_000 });
const gh = (args) => JSON.parse(execFileSync("gh", args, { cwd: repo, timeout: 30_000, encoding: "utf8" }));

function freeze(root) {
  const evidence = join(root, "evidence");
  mkdirSync(evidence);
  const original = runGit(["show", basis + ":handoff.md"]).toString("utf8");
  assert(original.includes(changedLine), "The prior decision must exist in the exact source.");
  writeJson(join(evidence, "work.json"), { issue: 298, source: "handoff.md", sourceVersion: basis,
    decision: changedLine, work: goal });
  const ref = "orangeofcarl0-sys/palimpsest";
  const pull = gh(["pr", "view", "302", "--repo", ref, "--json", "state,mergedAt,mergeCommit,url,headRefOid"]);
  const issue = gh(["issue", "view", "298", "--repo", ref, "--json", "number,state,updatedAt,labels,url"]);
  const comment = gh(["api", "repos/" + ref + "/issues/comments/7124721202", "--jq",
    "{id,body,updated_at,html_url,issue_url,author:.user.login}"]);
  assert.equal(pull.state, "MERGED");
  assert.equal(pull.mergeCommit.oid, basis);
  assert.equal(issue.state, "OPEN");
  assert(issue.labels.some(label => label.name === "maintenance:blocked"));
  assert.equal(comment.id, 7124721202);
  assert(comment.issue_url.endsWith("/298") && comment.body.includes("USAGE_UNCONFIRMED"));
  writeJson(join(evidence, "pull-302.json"), pull);
  writeJson(join(evidence, "issue-298.json"), issue);
  writeJson(join(evidence, "issue-comment.json"), comment);
  assert.deepEqual(evidenceFiles.slice(0, 4).sort(), manifest(evidence).map(([name]) => name).sort());
  return evidence;
}

async function review(root, evidence, archiveProof) {
  const work = readJson(join(evidence, "work.json"));
  const publication = join(evidence, "issue-comment.json");
  const proof = archiveProof.proof;
  assert.equal(proof.paidRequests, 0);
  assert.equal(proof.replay.reason, "USAGE_UNCONFIRMED");
  assert.equal(proof.remote.comments, 1);
  assert.equal(proof.remote.changedAfterRestart, 0);
  const binding = { project: projectId, work: String(work.issue), basis,
    checkpoint: digest(readFileSync(join(evidence, "work.json"))), candidate: digest(readFileSync(publication)) };
  const db = join(root, "review.sqlite");
  let replays = 0;
  const source = digest(JSON.stringify([binding, archiveProof.receipt]));
  const checks = () => [{ step: "original-decision-located", observed: work.decision === changedLine },
    { step: "publication-still-pending", observed: readJson(publication).id !== 7124721202 }];
  const request = { binding, source, steps: checks() };
  const execute = () => { replays++; return { steps: checks(), replay: proof.replay, remote: proof.remote }; };
  let supervisor = new HandoverSupervisor(db);
  const receipt = await supervisor.review(request, execute);
  assert.equal(receipt.state, "REPRODUCED");
  supervisor = new HandoverSupervisor(db);
  assert.throws(() => supervisor.read(receipt.id, { ...binding, candidate: "0".repeat(64) }),
    /HANDOVER_RECEIPT_VERSION_MISMATCH/u);
  assert.deepEqual(await supervisor.review(request, execute), receipt);
  assert.equal(supervisor.acknowledge(receipt.id, binding), true);
  supervisor = new HandoverSupervisor(db);
  assert.equal(supervisor.read(receipt.id, binding).delivered, true);
  assert.equal(supervisor.acknowledge(receipt.id, binding), false);
  assert.equal(replays, 1);
  writeJson(join(evidence, "cold-replay.json"), { ...receipt.replay, publicationSHA256: binding.candidate,
    originalDecisionSHA256: binding.checkpoint, receipt: receipt.id, issueArchiveReceipt: archiveProof.receipt });
  return { receipt: receipt.id, replays, wrongVersionRefused: true, duplicateDeliveryRefused: true };
}

function prepareRuntime(root) {
  const runtime = join(root, "runtime");
  mkdirSync(join(runtime, "node_modules", "@ordarium"), { recursive: true });
  cpSync(join(repo, "dist/src"), join(runtime, "dist/src"), { recursive: true });
  cpSync(join(repo, "host/dsh"), join(runtime, "host/dsh"), { recursive: true });
  for (const name of ["core", "host-kit", "ledger-sqlite", "testing"]) {
    cpSync(join(repo, "node_modules/@ordarium", name), join(runtime, "node_modules/@ordarium", name),
      { recursive: true, dereference: true });
  }
  mkdirSync(join(runtime, "runtime"));
  writeJson(join(runtime, "package.json"), { type: "module", private: true });
  return runtime;
}

function seed(world) {
  const common = git(repo, "rev-parse", "--path-format=absolute", "--git-common-dir");
  const commands = [
    "git init -q -b handover",
    "git config core.autocrlf false",
    "git config user.name 'Palimpsest cold handover'",
    "git config user.email cold-handover@example.invalid",
    "git fetch -q --depth=1 file:///source.git " + basis,
    "git sparse-checkout set --no-cone /README.md /package.json /handoff.md /" + reportFile,
    "git checkout -q -B handover FETCH_HEAD",
    "printf '\\n/evidence/\\n' >> .git/info/exclude",
    "mkdir evidence",
    "chown -R 1001:1001 /work",
    "test -z \"$(git status --porcelain)\"",
    "git rev-parse HEAD",
  ];
  assert.equal(success(offline(world, commands.join("\n"), [common + ":/source.git:ro"],
    { root: true, timeout: 420_000 })), basis);
}

async function coldState(profile, state) {
  const raw = readJson(profile);
  writeJson(profile, { ...raw, repository: repo, localAssetCheckpoints: { root: repo, paths: ["handoff.md"] } });
  let deployment = launchDeployment(loadDeploymentProfile(profile));
  let cp, index;
  try {
    await deployment.installed.controller.start({ projectId, goal, headCommit: basis, tasks: [] });
    const workspace = deployment.installed.application.projectWorkspace;
    cp = workspace.localAssetCheckpoints.save("handoff.md");
    index = await readProjectIndex(workspace, deployment.installed.controller, ["handoff.md"]);
    assert.equal(index.state, "CURRENT");
  } finally { await deployment.close(); }
  checkpoint(state);
  deployment = launchDeployment(loadDeploymentProfile(profile));
  try {
    const workspace = deployment.installed.application.projectWorkspace;
    assert.deepEqual(workspace.localAssetCheckpoints.latest("handoff.md"), cp);
    assert.equal((await readProjectIndex(workspace, deployment.installed.controller, ["handoff.md"], index.version)).state, "CURRENT");
    await workspace.recordJournalEntry({ kind: "OPPORTUNITY", title: "Review the next action for issue #298",
      body: "The previous handoff recorded a task waiting for approval and activation. Subsequent verifications are in evidence/.",
      provenance: "frozen maintenance work order", relatedRefs: [{ kind: "local_asset_digest", id: cp.digest }] });
    assert.equal((await readProjectIndex(workspace, deployment.installed.controller, ["handoff.md"], index.version)).state,
      "PROJECT_INDEX_VERSION_MISMATCH");
  } finally { await deployment.close(); }
  checkpoint(state);
  writeJson(profile, { ...raw, localAssetCheckpoints: { root: "/run/stage/world", paths: ["handoff.md"] } });
  return { checkpoint: cp.id, version: index.version, sourceBlob: git(repo, "rev-parse", basis + ":handoff.md") };
}

const positive = "## #298 冷接续状态\n\nPR #302 已合入 " + basis +
  "。#298 的状态写回已通过评论 7124721202 核对。实际运行位为 166cf7c6。" +
  "原 REJECTED（persisted-candidate）、第 16 笔 UNKNOWN、草案 1/4 保留。" +
  "continue-6bae11aa94c5acf4265833da 仍 WAITING_FOR_ADMISSION / USAGE_UNCONFIRMED，下一步由准入所有者核对。#299 只读。";
const mockReply = (arm) => async (request, ordinal) => {
  const send = (name, input) => {
    assert(request.tools.some(tool => tool.name === name), "Expected tool " + name);
    return [{ type: "tool_use", id: "handover_" + arm + "_" + ordinal, name, input }];
  };
  if (ordinal === 0) return send("bash", { command: "cat evidence/work.json evidence/issue-comment.json evidence/cold-replay.json",
    description: "Read the archived work and the subsequent review" });
  if (ordinal === 1) return send("bash", { command: "printf '%s\\n' " + quote(positive) +
    " > /tmp/current-handoff && sed -i '/^#298 真实 GitHub 写回待/s/真实 GitHub 写回待宿主变更合入并按授权启用/的早期写回计划见下方核验记录/' handoff.md && cat /tmp/current-handoff >> handoff.md && git add handoff.md && git commit -qm 'Record the maintenance handover'",
    description: "Submit the scripted qualification handover" });
  return [{ type: "text", text: "Submitted the independently grounded handover." }];
};

function grade(text, paths, status, patch) {
  const changed = patch.split(/\r?\n/u).filter(line => line.startsWith("+") && !line.startsWith("+++")).join("\n");
  const textMatch = (pattern) => pattern.test(changed);
  return {
    cleanScopedCommit: status === "" && paths.length === 1 && paths[0] === "handoff.md",
    publicationEvidence: textMatch(/#?302/u) && textMatch(/7124721202/u) && textMatch(/已.*(?:写回|同步)|(?:写回|同步).*已|status.*(?:synced|published)/iu),
    sourceAndActive: textMatch(/712ccf0f/u) && textMatch(/166cf7c6/u),
    priorAndBlock: textMatch(/REJECTED/u) && textMatch(/UNKNOWN/u) && textMatch(/1\/4/u) &&
      textMatch(/WAITING_FOR_ADMISSION|USAGE_UNCONFIRMED/u),
    nextAction: textMatch(/continue-6bae11aa94c5acf4265833da/u) && textMatch(/准入|admission/iu),
    history: text.includes("persisted-candidate") && text.includes("UNKNOWN"),
    staleActionReplaced: !text.includes(changedLine),
  };
}

async function runArm(root, name, runtime, evidence, paid) {
  const run = join(root, name), stage = join(run, "stages", stageId);
  const worldPath = join(stage, "world"), state = join(stage, "state");
  mkdirSync(worldPath, { recursive: true });
  mkdirSync(state);
  const world = makeVolume(image);
  const row = { name, basis, world: world.volume };
  try {
    seed(world);
    const profile = join(run, "profile.json");
    if (name === "P") {
      profileFor({ world: worldPath, state, path: profile, projectId });
      row.priorState = await coldState(profile, state);
    }
    const promptPath = join(run, "prompt.txt"), cohortId = "maintenance-cold-" + randomUUID();
    const ceiling = paid ? null : 2_000_000;
    writeFileSync(promptPath, goal);
    if (paid) writeJson(join(run, "cohort.json"), { schema: PAID_COHORT_SCHEMA, cohortId, stages: [{ id: stageId }], ...window });
    writeJson(join(run, "core.json"), { cohortId, budget: ceiling, sessions: [{ id: stageId, condition: name,
      world: worldPath, state, deployment: profile, expectedHead: basis, promptPath, killAfterMs: window.wallClockMs }] });
    const budgetPath = join(run, "request-ledger.sqlite");
    const ledger = ExecutionBudget.initialize(budgetPath, { schema: paid ? USAGE_ONLY_SCHEMA : "pnwf-request-budget/v1",
      cohortId, aggregateCeiling: ceiling, sessions: [{ id: stageId, maxRequests: window.maxRequests, ceiling, softCeiling: ceiling }] });
    const mock = paid ? null : await startMockProvider({ reply: mockReply(name) });
    const provider = paid ? requireOpenCodeGoProbe(readJson(join(repo,
      "research-evidence/pnwf-work-revision/2026-11-18/opencode-go-tooled-t3-055602/opencode-probe.json"))) : undefined;
    try {
      ledger.startSession(stageId);
      const configureProfile = name === "P" ? home => {
        const patch = join(home, "profiles/alhs-core/cordis.patch.yml");
        const content = readFileSync(patch, "utf8");
        assert(content.includes("    openDashboard: false"));
        writeFileSync(patch, content.replace("    openDashboard: false", "    openDashboard: false\n    projectIndex: true"));
      } : undefined;
      log("START", paid ? "live" : "mock", name);
      row.execution = await runContainerSession({ run, sessionId: stageId, budgetPath,
        repository: runtime, image, mode: paid ? PAID_MODE : "mock", provider: mock?.config,
        experiment: { layout: name === "P" ? "product" : "native", sealedEvidence: evidence,
          worldVolume: world.volume, configureProfile, openCodeGoProfile: provider } });
    } finally { ledger.close(); await mock?.close(); }
    const out = join(run, "out", stageId);
    row.accounting = readJson(join(out, "request-accounting.json"));
    row.candidate = success(offline(world, "git rev-parse HEAD"));
    row.status = success(offline(world, "git status --porcelain"));
    if (name === "P") row.conclusion = conclusion(state);
    try {
      row.evidence = attribute(run, stageId, paid ? PAID_MODE : "mock");
      if (paid && row.evidence.usageQualified) row.usage = analyzeAttributedStage(run, stageId, {
        arm: name, context: true, result: { evidence: row.evidence, seal: { provider: "opencode-go", route: OPENCODE_GO_MESSAGES } },
      });
    } catch (error) { row.attributionError = error.message; }
    if (row.candidate !== basis) {
      const patch = success(offline(world, "git diff --binary " + basis + " HEAD"));
      const text = success(offline(world, "git show HEAD:handoff.md"));
      const paths = success(offline(world, "git diff --name-only " + basis + " HEAD")).split(/\r?\n/u);
      row.checks = grade(text, paths, row.status, patch);
      row.grade = Object.values(row.checks).every(Boolean);
      writeFileSync(join(run, "candidate.patch"), patch + "\n");
      writeFileSync(join(run, "handoff-submitted.md"), text + "\n");
      // A shallow basis is kept by the exact source, so the bundle contains the successor delta.
      success(offline(world, "git bundle create /out/candidate.bundle " + basis + "..HEAD", [run + ":/out"]));
    }
    if (row.status) writeFileSync(join(run, "working.patch"), success(offline(world, "git diff --binary HEAD")) + "\n");
    writeJson(join(run, "result.json"), row);
    log("RESULT", name, row.candidate, row.grade ?? false, row.execution.natural,
      row.accounting.requests.length, row.accounting.unresolvedRequests);
    return row;
  } catch (error) {
    writeJson(join(run, "failure.json"), { ...row, failure: error.message });
    throw error;
  }
}

const [action, directory, issueQualification] = process.argv.slice(2);
assert(["freeze", "mock", "live"].includes(action) && directory);
const root = resolve(directory);
assert.equal(git(repo, "rev-parse", "HEAD"), basis);
assert.equal(docker(["image", "inspect", image, "--format", "{{.Id}}"]), image);
if (action === "freeze") {
  assert(issueQualification);
  const evidence = freeze(root);
  const reviewProof = await review(root, evidence, readJson(resolve(issueQualification)));
  const runtime = prepareRuntime(root);
  writeJson(join(root, "sealed.json"), { basis, image, window, prompt: digest(goal), evidence: manifest(evidence),
    runtime: digest(JSON.stringify(manifest(runtime))), runner: digest(readFileSync(import.meta.filename)), reviewProof });
} else {
  const experiment = join(root, action);
  mkdirSync(experiment);
  const seal = readJson(join(root, "sealed.json")), evidence = join(root, "evidence"), runtime = join(root, "runtime");
  assert.deepEqual(manifest(evidence), seal.evidence);
  assert.equal(digest(JSON.stringify(manifest(runtime))), seal.runtime);
  assert.equal(digest(readFileSync(import.meta.filename)), seal.runner);
  if (action === "live") {
    const qualification = readJson(join(root, "qualification.json"));
    assert.deepEqual(qualification.seal, seal);
    assert(qualification.pass && qualification.paidRequests === 0);
  }
  const rows = [];
  for (const name of ["P", "F"]) {
    const row = await runArm(experiment, name, runtime, evidence, action === "live");
    rows.push({ name, candidate: row.candidate, grade: row.grade ?? false, natural: row.execution.natural,
      paidRequests: row.execution.paidRequestsAdmitted, usageQualified: row.evidence?.usageQualified ?? false });
    writeJson(join(experiment, "matrix.json"), { seal, rows });
    if (row.accounting.requests.length === 0 || row.accounting.unresolvedRequests || !row.evidence?.usageQualified) break;
  }
  if (action === "mock") {
    const pass = rows.length === 2 && rows.every(row => row.grade && row.natural && row.usageQualified);
    writeJson(join(root, "qualification.json"), { pass, seal, rows, paidRequests: 0 });
    assert(pass, "Pair Mock qualification failed.");
  }
}
