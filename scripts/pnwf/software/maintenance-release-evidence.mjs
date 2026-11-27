/** Reconcile the real PR #303 release decision without a pre-delivered review. */
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { DSH_BIN, prepareContainerProfile, runContainerSession } from "../container_adapter.mjs";
import { startContainerBridge } from "../container_bridge.mjs";
import { createPrincipal, docker, qualifyPrincipal } from "../container_runtime.mjs";
import { PAID_COHORT_SCHEMA, PAID_MODE } from "../bounded_provider.mjs";
import { ExecutionBudget, USAGE_ONLY_SCHEMA } from "../execution_budget.mjs";
import { startMockProvider } from "../mock_provider.mjs";
import { OPENCODE_GO_MESSAGES, requireOpenCodeGoProbe } from "../opencode_go.mjs";
import { attribute } from "../energy/evidence.mjs";
import { analyzeAttributedStage } from "../analyze_energy_trajectory.mjs";
import { checkpoint, conclusion, profileFor } from "../energy/product.mjs";
import { digest, git, readJson, writeJson } from "../energy/contract.mjs";
import { launchDeployment, loadDeploymentProfile } from "../../../dist/src/advanced.js";
import { readProjectIndex } from "../../../host/dsh/lib/project_index.js";
import { githubWindow as window } from "./self-evolution/github-maintenance.mjs";
import { manifest, makeVolume, offline, quote, repo, success } from "./self-evolution/workspace.mjs";

const exec = promisify(execFile);
const basis = "73d01e4c3cd0dbbc74018b5a3ba058f8b92d15ad";
const projectId = "maintenance-release-evidence";
const stageId = "RELEASE";
const report = "docs/engineering/MAINTENANCE-COLD-PAIR.md";
const image = "sha256:702da68f6115eaddcf2e9b69bc6093d663f3d5d4e5cddcf2c7fb4c44664a67aa";
const goal = "接班维护 Palimpsest 的 PR #303 发布记录。上一班留下的送审状态在 release-review，核对当前应继续等待签核还是可以结清。请在 docs/engineering/MAINTENANCE-COLD-PAIR.md 末尾补记发布决定及可复查来源，区分完整送审 SHA、实际主线 SHA、文件树与对应的主线 CI。保留原实验判分及 #298 当前执行停点。只提交该报告，完成后正常交付。";
const sources = {
  "release-review": "pr303-review.json",
  "release-merge": "pr303-merge-verification.json",
  "release-ci": "pr303-main-ci.json",
};
const preflight = resolve(repo, "scripts/pnwf/world_preflight.mjs");
const log = (...args) => console.log(new Date().toISOString(), ...args);

function facts(archive) {
  const read = id => readJson(join(archive, sources[id]));
  const prior = read("release-review"), merge = read("release-merge"), ci = read("release-ci");
  assert.equal(prior.pr.state, "OPEN");
  assert.equal(prior.pr.mergeStateStatus, "BLOCKED");
  assert.equal(prior.checks.length, 16);
  assert(prior.checks.every(row => row.bucket === "pass"));
  assert.equal(merge.approved, prior.pr.headRefOid);
  assert.notEqual(merge.approved, basis);
  assert.equal(merge.pr.state, "MERGED");
  assert.equal(merge.pr.mergeCommit.oid, basis);
  assert.equal(merge.merged, basis);
  assert.equal(git(repo, "rev-parse", merge.approved + "^{tree}"), merge.tree);
  assert.equal(git(repo, "rev-parse", basis + "^{tree}"), merge.tree);
  assert.equal(ci.main, basis);
  assert.equal(ci.tree, merge.tree);
  assert.equal(ci.workflows.length, 4);
  assert.equal(ci.jobs.length, 15);
  assert(ci.workflows.every(row => row.status === "completed" && row.headSha === basis && row.conclusion === "success"));
  assert(ci.jobs.every(row => row.status === "completed" && row.conclusion === "success"));
  assert.deepEqual(prior.originalVerdicts, { P: "7/7", F: "6/7" });
  assert.equal(prior.unknownRequest, 16);
  assert.equal(prior.draft, "1/4");
  assert.equal(ci.issue298.continuation, prior.continuation);
  return { prior, merge, ci, read };
}

function prepareRuntime(root) {
  const runtime = join(root, "runtime");
  mkdirSync(join(runtime, "node_modules/@ordarium"), { recursive: true });
  for (const path of ["dist/src", "host/dsh"]) cpSync(join(repo, path), join(runtime, path), { recursive: true });
  for (const name of ["core", "host-kit", "ledger-sqlite", "testing"]) {
    const path = join("node_modules/@ordarium", name);
    cpSync(join(repo, path), join(runtime, path), { recursive: true, dereference: true });
  }
  mkdirSync(join(runtime, "runtime"));
  writeJson(join(runtime, "package.json"), { type: "module", private: true });
  return runtime;
}

function seed(world) {
  const common = process.env.PALI_RELEASE_GIT_MOUNT ?? git(repo, "rev-parse", "--path-format=absolute", "--git-common-dir");
  const cmd = [
    "git init -q -b handover", "git config core.autocrlf false",
    "git config user.name 'Palimpsest release handover'",
    "git config user.email release-handover@example.invalid",
    "git fetch -q --depth=1 file:///source.git " + basis,
    "git sparse-checkout set --no-cone /README.md /package.json /handoff.md /" + report,
    "git checkout -q -B handover FETCH_HEAD", "chown -R 1001:1001 /work",
    "test -z \"$(git status --porcelain)\"", "git rev-parse HEAD",
  ].join("\n");
  assert.equal(success(offline(world, cmd, [common + ":/source.git:ro"], { root: true, timeout: 420_000 })), basis);
}

function configure(home, reviewer, product = false) {
  const target = join(home, "profiles/node_modules/pnwf-maintenance-release");
  cpSync(join(dirname(import.meta.filename), "release-evidence-plugin"), target, { recursive: true });
  writeJson(join(target, "role.json"), { reviewer });
  const patch = join(home, "profiles/alhs-core/cordis.patch.yml");
  if (product) {
    const content = readFileSync(patch, "utf8");
    writeFileSync(patch, content.replace("    openDashboard: false", "    openDashboard: false\n    projectIndex: true"));
  }
  appendFileSync(patch, "\n- insert:\n    - id: pnwf-maintenance-release\n      name: pnwf-maintenance-release\n");
}

async function coldState(profile, state) {
  const raw = readJson(profile);
  writeJson(profile, { ...raw, repository: repo, localAssetCheckpoints: { root: repo, paths: ["handoff.md"] } });
  let deployment = launchDeployment(loadDeploymentProfile(profile));
  let saved;
  try {
    await deployment.installed.controller.start({ projectId, goal, headCommit: basis, tasks: [] });
    const workspace = deployment.installed.application.projectWorkspace;
    saved = workspace.localAssetCheckpoints.save("handoff.md");
    await workspace.recordJournalEntry({ kind: "OPPORTUNITY", title: "Reconcile the previous shift's PR #303 release decision",
      body: "The previous shift left its submission decision in the release archive.",
      provenance: "PR #303 release handover", relatedRefs: [{ kind: "local_asset_digest", id: saved.digest }] });
  } finally { await deployment.close(); }
  checkpoint(state);
  deployment = launchDeployment(loadDeploymentProfile(profile));
  let index;
  try {
    const workspace = deployment.installed.application.projectWorkspace;
    assert.deepEqual(workspace.localAssetCheckpoints.latest("handoff.md"), saved);
    index = await readProjectIndex(workspace, deployment.installed.controller, ["handoff.md"]);
    assert.equal(index.state, "CURRENT");
  } finally { await deployment.close(); }
  checkpoint(state);
  writeJson(profile, { ...raw, localAssetCheckpoints: { root: "/run/stage/world", paths: ["handoff.md"] } });
  return { checkpoint: saved.id, index: index.version, sourceBlob: git(repo, "rev-parse", basis + ":handoff.md") };
}

function createDesk({ out, runtime, archive, world, gateway, sessionKey }) {
  const journal = [], jobs = [];
  let active, closed = false, running;
  const save = () => writeJson(join(out, "release-desk.json"), journal);
  const note = (actor, input, outcome) => {
    journal.push({ at: new Date().toISOString(), actor, action: input?.action, record: input?.record,
      basis: input?.basis, ok: outcome.ok, code: outcome.code,
      returned: outcome.records?.map(row => typeof row === "string" ? row : row.id) });
    save();
    return outcome;
  };
  const refusal = code => ({ ok: false, code });
  const source = id => {
    const bytes = readFileSync(join(archive, sources[id]));
    return { id, sha256: digest(bytes), record: JSON.parse(bytes.toString("utf8")) };
  };
  const catalogue = Object.keys(sources);
  function read(actor, input, opened) {
    if (input.record === undefined) return note(actor, input, { ok: true, records: catalogue });
    if (!Object.hasOwn(sources, input.record)) return note(actor, input, refusal("ARCHIVE_RECORD_UNKNOWN"));
    opened?.add(input.record);
    return note(actor, input, { ok: true, ...source(input.record) });
  }
  save();

  async function contact(input) {
    const attemptId = "release-" + (jobs.length + 1);
    const dir = join(out, "worker-" + attemptId), stage = join(dir, "stage"), home = join(dir, "home");
    mkdirSync(join(stage, "world"), { recursive: true });
    const isolated = makeVolume(image);
    const opened = new Set();
    const job = { attemptId, basis, kind: "previous-maintenance-role", opened: [], returned: [], natural: false };
    jobs.push(job);
    const writeJobs = () => writeJson(join(out, "worker-receipts.json"), jobs);
    writeJobs();
    let reviewer, bridge, receipt;
    try {
      seed(isolated);
      assert.notEqual(isolated.volume, world.volume);
      prepareContainerProfile({ home, repository: runtime, layout: "native" });
      configure(home, true);
      const mountedPreflight = join(dir, "world_preflight.mjs");
      cpSync(preflight, mountedPreflight);
      reviewer = createPrincipal({ repository: runtime, stage, home, image, preflight: mountedPreflight,
        layout: "native", worldVolume: isolated.volume });
      active = reviewer;
      job.isolation = qualifyPrincipal(reviewer, basis).descriptorDigest;
      assert(reviewer.mounts.every(m => m.source !== world.volume && !m.target.endsWith("/state")));
      bridge = await startContainerBridge(reviewer.id, gateway, sessionKey, { actor: "worker", dispatchDesk: query => {
        if (query?.action === "archive") return read("maintainer", query, opened);
        let result;
        if (query?.action !== "return" || query.basis !== basis || !Array.isArray(query.records) || !query.records.length ||
            !query.records.every(id => opened.has(id))) result = refusal("REVIEW_EVIDENCE_NOT_OBSERVED");
        else {
          const ids = [...new Set(query.records)];
          receipt = { ok: true, basis, records: ids.map(source) };
          job.returned = ids;
          result = { ok: true, records: ids };
        }
        return note("maintainer", query, result);
      } });
      const question = "Investigate the previous release decision using the archive. Return records relevant to the incoming question by their original ids. Pinned read-only basis " +
        basis + ". Incoming question: " + input.question;
      const result = await exec("docker", ["exec", "--user", "1001:1001", "--workdir", "/run/stage/world",
        reviewer.id, "node", DSH_BIN, "--profile", "alhs-core", "--json", question],
      { maxBuffer: 12 * 1024 * 1024 });
      writeFileSync(join(dir, "reviewer.jsonl"), result.stdout);
      job.natural = true;
      return receipt ?? refusal("NO_REVIEW_RECORDS_RETURNED");
    } catch (error) {
      job.error = error.message.slice(0, 800);
      return refusal("MAINTAINER_SESSION_INCOMPLETE");
    } finally {
      job.opened = [...opened];
      writeJobs();
      try { await bridge?.close(); } finally {
        if (active === reviewer) {
          active = undefined;
          reviewer?.cleanup();
        }
        isolated.close();
      }
    }
  }

  return {
    async dispatch(input) {
      if (input?.action === "archive") return read("principal", input);
      if (closed || input?.action !== "contact" || input.basis !== basis ||
          typeof input.question !== "string" || !input.question.trim() || input.question.length > 6000) {
        return note("principal", input, refusal("REVIEW_BASIS_OR_REQUEST_INVALID"));
      }
      if (running) return note("principal", input, refusal("MAINTAINER_ALREADY_REVIEWING"));
      note("principal", { ...input, action: "contact-start" }, { ok: true });
      running = contact(input);
      try { return note("principal", input, await running); } finally { running = undefined; }
    },
    async close() {
      closed = true;
      const reviewer = active;
      active = undefined;
      reviewer?.cleanup();
      await running;
    },
  };
}

function grade(text, original, paths, status, parent, archiveFacts) {
  const { prior, merge, ci } = archiveFacts;
  const section = text.slice(original.length);
  const hasCounts = (good, total, unit) => new RegExp(good + "\\s*/\\s*" + total + "|" + good + "\\s*(?:个|项|条)?\\s*(?:" + unit + ")", "iu").test(section);
  return {
    scopedCandidate: status === "" && parent === basis && paths.length === 1 && paths[0] === report && text.startsWith(original),
    releaseClosed: /#303/u.test(section) && /rebase/iu.test(section) && /已[^。；\n]{0,48}(?:签核|结清|合入|合并|完成)|(?:发布|签核)(?:状态)?[：: ]*(?:完成|结清)|\b(?:merged|verified)\b/iu.test(section),
    exactVersions: section.includes(merge.approved) && section.includes(basis),
    treeEquivalence: section.includes(merge.tree) && /一致|相同|等价|same|identical|equal/iu.test(section),
    actualMainCi: hasCounts(4, 4, "workflows?|工作流") && hasCounts(15, 15, "jobs?|作业|任务") &&
      ci.workflows.some(row => section.includes(String(row.databaseId))),
    originalVerdicts: section.includes(prior.originalVerdicts.P) && section.includes(prior.originalVerdicts.F),
    issue298RemainsBlocked: /#298/u.test(section) && /第?\s*16\s*(?:笔|次|request)/iu.test(section) &&
      /UNKNOWN/u.test(section) && /1\/4/u.test(section) && section.includes(prior.continuation) &&
      /WAITING_FOR_ADMISSION|USAGE_UNCONFIRMED|待准入/u.test(section),
  };
}

function mockReply(arm, { prior, merge, ci }) {
  const section = "\n## PR #303 发布结清\n\n所有者已核准并按 rebase 合入。送审 " + merge.approved + "，主线 " + basis +
    "。文件树相同 " + merge.tree + "。主线 4/4 工作流、15/15 jobs 通过，见 " + ci.workflows.map(row => row.url).join("、") +
    "。原样保留 Palimpsest 7/7、强原生 6/7。#298 第 16 笔 UNKNOWN，草案 1/4，" + prior.continuation +
    " 仍 WAITING_FOR_ADMISSION。\n";
  let principal = 0, reviewer = 0;
  return async (request, ordinal) => {
    const tools = request.tools.map(tool => tool.name);
    const send = (name, input) => {
      assert(tools.includes(name), "Missing declared tool " + name);
      return [{ type: "tool_use", id: "release_" + arm + "_" + ordinal, name, input }];
    };
    const close = text => [{ type: "text", text }];
    if (tools.includes("release_return")) {
      const step = reviewer++;
      if (step === 0) return send("release_return", { basis, records: ["release-merge"] });
      if (step === 1) assert(JSON.stringify(request.messages.at(-1)).includes("REVIEW_EVIDENCE_NOT_OBSERVED"));
      if (step <= 3) return send("release_archive", { record: Object.keys(sources)[step - 1] });
      if (step === 4) return send("release_return", { basis, records: Object.keys(sources) });
      return close("Returned the source records.");
    }
    const step = principal++;
    if (step === 0) {
      assert(!JSON.stringify(request.messages).includes(merge.approved) && !JSON.stringify(request.messages).includes(String(ci.workflows[0].databaseId)));
      return send("release_archive", { record: "release-review" });
    }
    if (arm === "P" && step === 1) return send("release_contact", { basis: "0".repeat(40), question: "Check the previous decision." });
    if (arm === "P" && step === 2) {
      assert(JSON.stringify(request.messages.at(-1)).includes("REVIEW_BASIS_OR_REQUEST_INVALID"));
      return send("release_contact", { basis, question: "What release records justify the current decision?" });
    }
    if (arm === "F" && step <= 2) return send("release_archive", { record: Object.keys(sources)[step] });
    if (step === 3) {
      assert(JSON.stringify(request.messages).includes(String(ci.workflows[0].databaseId)));
      return send("bash", { command: "printf %s " + quote(section) + " >> " + report + " && git add " + report +
        " && git commit -qm 'Record PR 303 release signoff'", description: "Commit the validated release note" });
    }
    if (arm === "P" && step === 4) return send("palimpsest_work", {
      action: "conclude", intent: "DELIVER", artifacts: [report], statement: "The verified PR #303 release note is committed.",
    });
    return close("The release note is committed.");
  };
}

async function runArm(root, name, archive, runtime, archiveFacts, paid, provider) {
  const run = join(root, name), stage = join(run, "stages", stageId), out = join(run, "out", stageId);
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
    const promptPath = join(run, "prompt.txt"), cohortId = "release-" + randomUUID();
    const ceiling = paid ? null : 3_000_000;
    writeFileSync(promptPath, goal);
    if (paid) writeJson(join(run, "cohort.json"), { schema: PAID_COHORT_SCHEMA, cohortId, stages: [{ id: stageId }], ...window });
    writeJson(join(run, "core.json"), { cohortId, budget: ceiling, sessions: [{ id: stageId, condition: name,
      world: worldPath, state, deployment: profile, expectedHead: basis, promptPath, killAfterMs: window.wallClockMs }] });
    const budgetPath = join(run, "request-ledger.sqlite");
    const ledger = ExecutionBudget.initialize(budgetPath, { schema: paid ? USAGE_ONLY_SCHEMA : "pnwf-request-budget/v1",
      cohortId, aggregateCeiling: ceiling, sessions: [{ id: stageId, maxRequests: window.maxRequests, ceiling, softCeiling: ceiling }] });
    const mock = paid ? null : await startMockProvider({ reply: mockReply(name, archiveFacts) });
    try {
      ledger.startSession(stageId);
      log("START", paid ? "live" : "mock", name);
      row.execution = await runContainerSession({ run, sessionId: stageId, budgetPath, repository: runtime, image,
        mode: paid ? PAID_MODE : "mock", provider: mock?.config, experiment: {
          layout: name === "P" ? "product" : "native", worldVolume: world.volume,
          configureProfile: home => configure(home, false, name === "P"), openCodeGoProfile: provider,
          createDesk: args => createDesk({ ...args, out, runtime, archive, world }),
        } });
      if (mock) row.mockFailures = mock.failures;
    } finally { ledger.close(); await mock?.close(); }
    const snapshot = offline(world, "git rev-parse HEAD; git status --porcelain");
    const [candidate, ...status] = success(snapshot).split(/\r?\n/u);
    row.candidate = candidate;
    row.status = status.join("\n");
    if (name === "P") row.conclusion = conclusion(state);
    row.accounting = readJson(join(out, "request-accounting.json"));
    try {
      row.evidence = attribute(run, stageId, paid ? PAID_MODE : "mock");
      if (paid && row.evidence.usageQualified) row.usage = analyzeAttributedStage(run, stageId, {
        arm: name, context: true, result: { evidence: row.evidence, seal: { provider: "opencode-go", route: OPENCODE_GO_MESSAGES } },
      });
    } catch (error) { row.attributionError = error.message; }
    if (row.candidate !== basis) {
      const result = offline(world, "git cat-file blob HEAD:" + report);
      success(result);
      const text = result.stdout, patch = offline(world, "git diff --binary " + basis + " HEAD");
      success(patch);
      row.blob = success(offline(world, "git rev-parse HEAD:" + report));
      row.parent = success(offline(world, "git show -s --format=%P HEAD"));
      row.paths = success(offline(world, "git diff --name-only " + basis + " HEAD")).split(/\r?\n/u);
      row.checks = grade(text, archiveFacts.original, row.paths, row.status, row.parent, archiveFacts);
      row.score = Object.values(row.checks).filter(Boolean).length;
      writeFileSync(join(run, "candidate.patch"), patch.stdout);
      writeFileSync(join(run, "report-submitted.md"), text);
      success(offline(world, "git bundle create /out/candidate.bundle " + basis + "..HEAD", [run + ":/out"]));
    }
    if (row.status) {
      const patch = offline(world, "git diff --binary HEAD");
      success(patch);
      writeFileSync(join(run, "working.patch"), patch.stdout);
    }
    writeJson(join(run, "result.json"), row);
    log("RESULT", name, candidate, row.score ?? 0, row.execution.natural, row.accounting.requests.length, row.accounting.unresolvedRequests,
      row.evidence?.usageQualified, row.attributionError ?? "");
    return row;
  } catch (error) {
    writeJson(join(run, "failure.json"), { ...row, failure: error.message });
    throw error;
  }
}

const [action, directory, sourceArchive] = process.argv.slice(2);
assert(["freeze", "mock", "live"].includes(action) && directory);
assert.equal(git(repo, "rev-parse", "HEAD"), basis);
assert.equal(docker(["image", "inspect", image, "--format", "{{.Id}}"]), image);
const root = resolve(directory), archive = join(root, "archive");
const original = execFileBuffer(basis + ":" + report);

function execFileBuffer(ref) {
  // git() trims text; preserve the exact original Markdown bytes for preservation grading.
  return execFileSync("git", ["-C", repo, "cat-file", "blob", ref], { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
}

const currentSeal = runtime => ({
  basis, image, window, prompt: digest(goal), archive: manifest(archive),
  runtime: digest(JSON.stringify(manifest(runtime))), runner: digest(readFileSync(import.meta.filename)),
  plugin: manifest(join(dirname(import.meta.filename), "release-evidence-plugin")),
  original: digest(original),
});
if (action === "freeze") {
  assert(sourceArchive);
  mkdirSync(archive, { recursive: true });
  for (const name of Object.values(sources)) cpSync(join(resolve(sourceArchive), name), join(archive, name), { force: false, errorOnExist: true });
  facts(archive);
  const runtime = prepareRuntime(root);
  writeFileSync(join(root, "frozen-runner.mjs"), readFileSync(import.meta.filename));
  writeJson(join(root, "sealed.json"), currentSeal(runtime));
} else {
  const runtime = join(root, "runtime"), seal = readJson(join(root, "sealed.json"));
  assert.deepEqual(currentSeal(runtime), seal, "Inputs changed after qualification");
  const archiveFacts = { ...facts(archive), original };
  let provider;
  if (action === "live") {
    const qualification = readJson(join(root, "qualification.json"));
    assert.deepEqual(qualification.seal, seal);
    assert(qualification.pass && qualification.paidRequests === 0);
    provider = requireOpenCodeGoProbe(readJson(join(repo,
      "research-evidence/pnwf-work-revision/2026-11-18/opencode-go-tooled-t3-055602/opencode-probe.json")));
  }
  const experiment = join(root, action);
  mkdirSync(experiment);
  const rows = [];
  for (const name of ["P", "F"]) {
    const row = await runArm(experiment, name, archive, runtime, archiveFacts, action === "live", provider);
    const out = join(experiment, name, "out", stageId);
    const desk = readJson(join(out, "release-desk.json"));
    const accessQualified = name === "P" ? desk.some(item => item.code === "REVIEW_BASIS_OR_REQUEST_INVALID") &&
      desk.some(item => item.code === "REVIEW_EVIDENCE_NOT_OBSERVED") && desk.some(item => item.action === "contact" &&
        item.ok && item.returned.length === 3) : desk.filter(item => item.action === "archive" && item.ok).length === 3;
    rows.push({ name, candidate: row.candidate, score: row.score ?? 0, natural: row.execution.natural,
      paidRequests: row.execution.paidRequestsAdmitted, usageQualified: row.evidence?.usageQualified ?? false,
      paired: row.evidence?.traces.every(t => t.counts.toolCalls === t.counts.pairedToolResults && t.counts.unpairedToolResults === 0),
      accessQualified, deliver: row.conclusion?.intent === "DELIVER" && row.conclusion.body.includes(row.candidate) });
    writeJson(join(experiment, "matrix.json"), { seal, rows });
    if (!row.accounting.requests.length || row.accounting.unresolvedRequests || !row.evidence?.usageQualified) break;
  }
  if (action === "mock") {
    const pass = rows.length === 2 && rows.every(row => row.score === 7 && row.natural && row.usageQualified && row.paired && row.accessQualified) && rows[0].deliver;
    writeJson(join(root, "qualification.json"), { pass, seal, rows, paidRequests: 0 });
    assert(pass, "Release evidence pair Mock qualification failed.");
  }
}
