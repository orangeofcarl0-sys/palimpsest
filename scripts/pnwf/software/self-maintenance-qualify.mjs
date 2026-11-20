/** Qualification, real pair and approved follow-up for Palimpsest maintenance. */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { runContainerSession } from "../container_adapter.mjs";
import { docker } from "../container_runtime.mjs";
import { ExecutionBudget, USAGE_ONLY_SCHEMA } from "../execution_budget.mjs";
import { PAID_COHORT_SCHEMA, PAID_MODE } from "../bounded_provider.mjs";
import { startMockProvider } from "../mock_provider.mjs";
import { readOpenCodeGoKey, requireOpenCodeGoProbe } from "../opencode_go.mjs";
import { digest, git, readJson, writeJson } from "../energy/contract.mjs";
import { attribute } from "../energy/evidence.mjs";
import { conclusion, profileFor } from "../energy/product.mjs";

const [directory, imageRef = "palimpsest-cold-handover:local", mockDirectory, approvalFile] = process.argv.slice(2);
assert(directory, "Usage: self-maintenance-qualify.mjs <new directory> [image] [qualified Mock directory [owner approval JSON]]");
const paid = mockDirectory !== undefined;
const mode = paid ? PAID_MODE : "mock";
const root = resolve(directory);
const repo = fileURLToPath(new URL("../../../", import.meta.url));
const ref = "refs/remotes/origin/main";
const basis = git(repo, "rev-parse", ref);
const image = docker(["image", "inspect", imageRef, "--format", "{{.Id}}"]);
const tests = "--maxWorkers 1 test/alhs_episode_convergence.test.ts test/pnwf_cq_basis_admission.test.ts";
const build = "node node_modules/typescript/bin/tsc -b";
const projectId = "palimpsest-self-maintenance";
const brief = "上次 Palimpsest 的重启交接维护会话在依赖目录只读的运行环境里无法启动定向测试，影响了提交。请在同一仓库提供稳定的 node --run test:focused -- <测试路径> 入口，让维护者在该环境中仍能运行指定测试并收到真实成败。此工单只允许在 package.json 增加这个入口，保留现有配置、测试、CI 和其他脚本。验证后提交候选。原现场见 docs/engineering/CONTINUITY-HANDOVER-DOGFOOD.md。";
const followupBrief = "维护者给没有正式任务的项目交付直接完成的 Git 修订时，readiness 在工作树干净且已有新提交的情况下仍让人继续规划。记录 DELIVER 后重复检查也给出同样的引导。请修好普通 Work 入口的这两种引导：先帮助使用者判断并交付已有提交，已有当前结论时指向该结论。保护未提交和未改动的状态，保留正式任务、晋升和接受语义。仅修改 src/application/work_outcome.ts 和 test/alhs_episode_convergence.test.ts，给出定向回归并提交候选。";
const followupOracle = fileURLToPath(new URL("./self-maintenance-readiness.mjs", import.meta.url));
const liveWindow = { maxRequests: 64, wallClockMs: 30 * 60_000, requestTimeoutMs: 240_000, billingCeiling: null };
const runnerSha256 = digest(readFileSync(fileURLToPath(import.meta.url)));
let openCodeGoProfile, qualification, approval;
if (paid) {
  const mockRoot = resolve(mockDirectory);
  qualification = readJson(join(mockRoot, "qualification.json"));
  assert.equal(basis, "02a5160c2361bb70a2127574a76ea6e571b296a8");
  assert(qualification.result === "PASS" && qualification.basis === basis && qualification.image === image &&
    qualification.briefSha256 === digest(brief) && qualification.session.natural && qualification.attribution.valid &&
    qualification.verification.tests === 20 && qualification.verification.deliberateFailurePropagated &&
    qualification.runnerSha256 === digest(readFileSync(join(mockRoot, "self-maintenance-qualify.mjs"))), "FROZEN_MOCK_NOT_VERIFIED");
  openCodeGoProfile = requireOpenCodeGoProbe(readJson(join(repo, "research-evidence/pnwf-work-revision/2026-11-18/opencode-go-tooled-t3-055602/opencode-probe.json")));
  readOpenCodeGoKey(openCodeGoProfile); // Check the same configured profile before staging or spending.
  if (approvalFile !== undefined) {
    approval = readJson(resolve(approvalFile));
    assert(approval.schema === "palimpsest-self-maintenance-owner-approval/v1" && approval.basis === basis &&
      /^[a-f0-9]{40}$/u.test(approval.candidate) && approval.acceptedHead === approval.candidate &&
      ["P", "F"].includes(approval.arm), "INVALID_OWNER_APPROVAL");
    const pair = readJson(join(approval.liveRun, "matrix.json"));
    assert(pair.basis === basis && pair.image === image && pair.rows.map(row => row.arm).join(",") === "P,F", "FIRST_PAIR_NOT_BOUND");
    const reconciled = row => row.accounting?.admitted > 0 && row.accounting.unresolved === 0 && row.attribution?.usageQualified;
    if (!pair.rows.every(reconciled)) {
      const [product, native] = pair.rows;
      assert(reconciled(product) && native.accounting?.unresolved === 1 && approval.priorUnknown, "FIRST_PAIR_ACCOUNTING_NOT_RECONCILED");
      const dispositionData = readFileSync(approval.priorUnknown.path);
      const disposition = JSON.parse(dispositionData);
      const ledgerData = readFileSync(join(approval.liveRun, "F/out/MAINTAIN/request-accounting.json"));
      const ledger = JSON.parse(ledgerData);
      const unknown = ledger.requests.filter(row => row.state === "UNKNOWN");
      assert(digest(dispositionData) === approval.priorUnknown.sha256 && disposition.continuation === "FOLLOWUP_ONLY_NEW_COHORTS" &&
        disposition.schema === "palimpsest-self-maintenance-unknown/v1" && disposition.basis === basis && disposition.arm === "F" &&
        disposition.ledgerSha256 === digest(ledgerData) && ledger.state === "STOPPED" && unknown.length === 1 &&
        unknown[0].id === disposition.requestId && unknown[0].reason === "PROVIDER_TIMEOUT" && unknown[0].actual === null &&
        unknown[0].usage === null && disposition.confirmedTokens === ledger.confirmed && disposition.requestOrdinal === ledger.requests.indexOf(unknown[0]) + 1,
      "PRIOR_UNKNOWN_ARCHIVE_NOT_BOUND");
    }
    const first = readJson(join(approval.liveRun, approval.arm, "result.json"));
    assert(first.result === "PASS" && first.basis === basis && first.candidate === approval.candidate &&
      first.verification?.exactSha === approval.candidate && first.session.natural && first.attribution.valid, "APPROVAL_DOES_NOT_MATCH_VERIFIED_CANDIDATE");
    approval.bundle = join(approval.liveRun, approval.arm, "candidate.bundle");
    assert(approval.bundleSha256 === digest(readFileSync(approval.bundle)), "APPROVED_BUNDLE_HAS_DRIFTED");
  }
}
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const isolation = ["--rm", "--network", "none", "--read-only", "--cap-drop", "ALL",
  "--security-opt", "no-new-privileges", "--tmpfs", "/tmp:rw,exec,nosuid,nodev", "-e", "HOME=/tmp"];
const volumes = [];

function offline(volume, command, mounts = [], seed = false) {
  const result = spawnSync("docker", ["run", ...isolation, "--user", seed ? "0:0" : "1001:1001",
    ...(seed ? ["--cap-add", "CHOWN", "--cap-add", "DAC_OVERRIDE"] : []),
    "-v", `${volume}:/work`, ...mounts.flatMap(mount => ["-v", mount]), "-w", "/work", "--entrypoint", "sh", image, "-eu", "-c", command],
  { encoding: "utf8", timeout: 240_000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw result.error;
  return result;
}

function succeed(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function seed(bundle, accepted, candidate) {
  const volume = docker(["volume", "create", "pnwf-self-maintenance-" + randomUUID()]);
  volumes.push(volume);
  succeed(offline(volume, ["git init -q", `git fetch -q /basis.bundle '${ref}:refs/heads/basis'`,
    "git checkout -q -b repair basis",
    ...(accepted ? ["git fetch -q /accepted.bundle HEAD", "git reset -q --hard FETCH_HEAD"] : []),
    "git branch start-basis",
    ...(candidate ? ["git fetch -q /candidate.bundle HEAD", "git checkout -q --detach FETCH_HEAD"] : []),
    "ln -s /opt/palimpsest-dev/node_modules node_modules", "printf '\\n/node_modules\\n' >> .git/info/exclude",
    `git config user.name 'Self-maintenance ${paid ? "experiment" : "Mock"}'`, "git config user.email self-maintenance@example.invalid", "chown -R 1001:1001 /work"].join("\n"),
  [`${bundle}:/basis.bundle:ro`, ...(accepted ? [`${accepted}:/accepted.bundle:ro`] : []), ...(candidate ? [`${candidate}:/candidate.bundle:ro`] : [])], true));
  return volume;
}

function mockReply() {
  const change = `const fs=require('node:fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));p.scripts['test:focused']='vitest run --configLoader runner --no-cache';fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\\n');`;
  const plan = [
    { name: "palimpsest_continuity", input: { action: "pulse" } },
    { name: "bash", input: { command: `node -e ${quote(change)} && node --run test:focused -- ${tests} && git add -- package.json && git commit -m 'Add a focused test entry for read-only dependencies' && echo MAINTENANCE_CANDIDATE_COMMITTED`,
      description: "Verify the scripted reference patch and commit it" } },
    { name: "palimpsest_work", input: { action: "conclude", intent: "DELIVER", artifacts: ["package.json"], statement: "The focused verification entry is committed and ready for independent review." } },
  ];
  return async (request, ordinal) => {
    if (ordinal === 2) {
      const result = request.messages.flatMap(message => Array.isArray(message.content) ? message.content : [])
        .findLast(block => block.type === "tool_result")?.content;
      const output = typeof result === "string" ? result : (result ?? []).map(block => block.text ?? "").join("\n");
      if (!output.split(/\r?\n/u).includes("MAINTENANCE_CANDIDATE_COMMITTED")) {
        return [{ type: "text", text: "The scripted reference patch did not reach a verified commit." }];
      }
    }
    const call = plan[ordinal];
    if (!call) return [{ type: "text", text: "The scripted maintenance candidate is submitted for independent verification." }];
    assert(request.tools.some(tool => tool.name === call.name), `Tool unavailable: ${call.name}`);
    return [{ type: "tool_use", id: `maintenance_${ordinal}`, ...call }];
  };
}

function readinessCheck(volume, log) {
  const outcome = offline(volume, `${build} && node /readiness-oracle.mjs`, [`${followupOracle}:/readiness-oracle.mjs:ro`]);
  writeFileSync(log, outcome.stdout + outcome.stderr);
  const row = outcome.stdout.match(/^DIRECT_READINESS (.+)$/mu)?.[1];
  assert(row, "Independent readiness replay did not return structured checks");
  return { exit: outcome.status, ...JSON.parse(row) };
}

async function runStage(run, arm, bundle, accepted = null) {
  mkdirSync(run, { recursive: true });
  const startingHead = accepted === null ? basis : approval.candidate;
  const ticket = approval === undefined ? brief : followupBrief;
  const native = arm === "F";
  const report = { arm, basis: startingHead, image, briefSha256: digest(ticket), runnerSha256, mode, paidRequests: 0,
    ...(approval === undefined ? {} : { oracleSha256: digest(readFileSync(followupOracle)) }) };
  try {
    const volume = seed(bundle, accepted);
    assert.equal(succeed(offline(volume, "git rev-parse HEAD")), startingHead, "Starting checkout differs from its accepted SHA");
    const sessionId = "MAINTAIN";
    const stage = join(run, "stages", sessionId);
    const state = join(stage, "state");
    const world = join(stage, "world");
    const runtime = join(run, "host-runtime");
    const profile = join(run, "profile.json");
    const initProfile = join(run, "offline-profile.json");
    const promptPath = join(run, "brief.txt");
    for (const directory of [state, world, runtime]) mkdirSync(directory, { recursive: true });
    writeFileSync(promptPath, ticket);
    succeed(offline(volume, "test -x node_modules/.bin/vitest && ! touch node_modules/.self-maintenance-write-check"));
    const baseline = offline(volume, `node node_modules/vitest/vitest.mjs run --no-cache ${tests}`);
    writeFileSync(join(run, "baseline.log"), baseline.stdout + baseline.stderr);
    const loaderError = baseline.stderr.match(/(EACCES|EROFS|ENOENT):[^\n]*mkdir '[^'\n]*\/node_modules\/\.vite-temp'/u)?.[1];
    report.baseline = { exit: baseline.status, loaderError, reproduced: baseline.status !== 0 && Boolean(loaderError) };
    assert(report.baseline.reproduced, "Baseline did not reproduce the read-only Vitest loader failure");
    if (approval !== undefined) {
      report.baseline.readiness = readinessCheck(volume, join(run, "baseline-readiness.log"));
      const checks = report.baseline.readiness.checks;
      assert(!checks.cleanCommitSuggestsDelivery && !checks.afterDeliveryAvoidsRepeatedConclusion &&
        checks.initialHasNoDeliveryAdvice && checks.dirtyHasNoDeliveryAdvice && checks.recordedDeliveryCanClose && checks.operatorBasisPreserved,
      "The follow-up defect no longer reproduces on the frozen starting checkout");
    }

    if (!native) {
      succeed(offline(volume, `${build} && cp -r dist host /runtime`, [`${runtime}:/runtime`]));
      mkdirSync(join(runtime, "runtime"));
      mkdirSync(join(runtime, "node_modules", "@ordarium"), { recursive: true });
      for (const name of ["core", "host-kit", "ledger-sqlite", "testing"]) {
        cpSync(join(repo, "node_modules", "@ordarium", name), join(runtime, "node_modules", "@ordarium", name), { recursive: true, dereference: true });
      }
      writeJson(join(runtime, "package.json"), { type: "module", private: true });
      profileFor({ world, state, path: profile, projectId, localPeer: "principal", standard: "Keep existing maintenance checks intact and leave a tested candidate commit." });
      const config = readJson(profile);
      writeJson(initProfile, { ...config, repository: "/work", transport: { ...config.transport, databasePath: "/state/transport.sqlite" },
        databases: Object.fromEntries(Object.entries(config.databases).map(([key, path]) => [key, `/state/${basename(path)}`])) });
      const init = `import {readFileSync} from 'node:fs';import {launchDeployment,loadDeploymentProfile} from './dist/src/advanced.js';const d=launchDeployment(loadDeploymentProfile('/profile.json'));try{await d.installed.controller.start({projectId:'${projectId}',goal:readFileSync('/brief','utf8'),headCommit:'${startingHead}',tasks:[]});}finally{await d.close();}`;
      succeed(offline(volume, `node --input-type=module -e ${quote(init)}`, [`${state}:/state`, `${initProfile}:/profile.json:ro`, `${promptPath}:/brief:ro`]));
    } else succeed(offline(volume, build));

    const cohortId = "self-maintenance-" + randomUUID();
    const budgetPath = join(run, "request-ledger.sqlite");
    const ceiling = paid ? null : 2_000_000;
    if (paid) writeJson(join(run, "cohort.json"), { schema: PAID_COHORT_SCHEMA, cohortId, stages: [{ id: sessionId }], ...liveWindow });
    const budget = ExecutionBudget.initialize(budgetPath, { schema: paid ? USAGE_ONLY_SCHEMA : "pnwf-request-budget/v1", cohortId, aggregateCeiling: ceiling,
      sessions: [{ id: sessionId, ceiling, softCeiling: ceiling, maxRequests: paid ? liveWindow.maxRequests : 16 }] });
    writeJson(join(run, "core.json"), { cohortId, budget: ceiling, sessions: [{ id: sessionId, condition: native ? "F" : "P", world, state,
      deployment: profile, expectedHead: startingHead, promptPath, killAfterMs: paid ? liveWindow.wallClockMs : 5 * 60_000 }] });
    const mock = paid ? null : await startMockProvider({ reply: mockReply() });
    try {
      budget.startSession(sessionId);
      console.log("START", mode, arm, cohortId);
      report.session = await runContainerSession({ run, sessionId, budgetPath, repository: runtime, image, mode, provider: mock?.config,
        experiment: { layout: native ? "native" : "product", worldVolume: volume, openCodeGoProfile } });
    } finally { budget.close(); await mock?.close(); }
    report.paidRequests = report.session.paidRequestsAdmitted;
    const accounting = readJson(join(run, "out", sessionId, "request-accounting.json"));
    report.accounting = { admitted: accounting.requests.length, confirmed: accounting.confirmed, unresolved: accounting.unresolvedRequests };
    try { report.attribution = attribute(run, sessionId, mode); }
    catch (error) { report.attributionError = error.message; }
    report.conclusion = native ? null : conclusion(state);
    report.candidate = succeed(offline(volume, "git rev-parse HEAD"));
    report.status = succeed(offline(volume, "git status --porcelain"));
    succeed(offline(volume, "git diff --binary HEAD > /evidence/working.patch && git ls-files --others --exclude-standard -z | tar -czf /evidence/untracked.tgz --null -T -", [`${run}:/evidence`]));
    assert.notEqual(report.candidate, startingHead, "No candidate commit");
    succeed(offline(volume, "git diff --binary start-basis HEAD > /evidence/candidate.patch && git bundle create /evidence/candidate.bundle start-basis..HEAD", [`${run}:/evidence`]));
    assert.equal(report.status, "", "Candidate worktree is dirty");
    report.changedPaths = succeed(offline(volume, "git diff --name-only start-basis HEAD")).split(/\r?\n/u).filter(Boolean);
    succeed(offline(volume, "git merge-base --is-ancestor start-basis HEAD"));
    if (approval === undefined) {
      assert.deepEqual(report.changedPaths, ["package.json"]);
      assert.equal(succeed(offline(volume, "git rev-parse HEAD^")), startingHead);
    } else {
      assert.deepEqual(report.changedPaths, ["src/application/work_outcome.ts", "test/alhs_episode_convergence.test.ts"], "Follow-up files differ from the agreed scope");
    }
    const evaluation = seed(bundle, accepted, join(run, "candidate.bundle"));
    assert.equal(succeed(offline(evaluation, "git rev-parse HEAD")), report.candidate);
    const deliveredPath = approval === undefined ? "package.json" : "src/application/work_outcome.ts";
    const manifestDigest = succeed(offline(evaluation, `git cat-file blob HEAD:${deliveredPath} | sha256sum`)).split(/\s+/u)[0];
    const conclusionLine = report.conclusion?.body.split("\n").findLast(line => line.startsWith('{"schema":"pc1-episode-conclusion/v1"'));
    const artifacts = conclusionLine ? JSON.parse(conclusionLine).check.artifacts : [];
    report.delivery = native ? null : report.conclusion?.intent === "DELIVER" && artifacts.some(artifact => artifact.path === deliveredPath &&
      artifact.commit === report.candidate && artifact.committed && artifact.tracked && artifact.present && artifact.digest === manifestDigest);
    if (approval !== undefined) {
      const outcome = readinessCheck(evaluation, join(run, "candidate-readiness.log"));
      report.verification = { exactSha: report.candidate, checks: outcome.checks, sourceDigest: manifestDigest };
      assert.equal(outcome.exit, 0, "Follow-up candidate fails independent readiness checks");
      const regression = offline(evaluation, `node node_modules/vitest/vitest.mjs run --configLoader runner --no-cache ${tests} test/pnwf_cq_direct_governed.test.ts`);
      writeFileSync(join(run, "candidate-tests.log"), regression.stdout + regression.stderr);
      const testResult = stripVTControlCharacters(succeed(regression));
      report.verification.tests = Number(testResult.match(/Tests\s+(\d+) passed/u)?.[1]);
      assert(Number(testResult.match(/Test Files\s+(\d+) passed/u)?.[1]) === 3 && report.verification.tests > 20, "Missing existing regression suites");
    } else {
      const before = JSON.parse(succeed(offline(evaluation, "git show basis:package.json")));
      const after = JSON.parse(succeed(offline(evaluation, "git show HEAD:package.json")));
      assert(!Object.hasOwn(before.scripts, "test:focused"));
      assert.equal(typeof after.scripts["test:focused"], "string");
      delete after.scripts["test:focused"];
      assert.deepEqual(after, before);
      const positive = offline(evaluation, `${build} && node --run test:focused -- ${tests}`);
      writeFileSync(join(run, "candidate-positive.log"), positive.stdout + positive.stderr);
      const positiveOutput = stripVTControlCharacters(succeed(positive));
      const files = Number(positiveOutput.match(/Test Files\s+(\d+) passed/u)?.[1]);
      const passed = Number(positiveOutput.match(/Tests\s+(\d+) passed/u)?.[1]);
      assert(files === 2 && passed === 20, "The candidate did not run both expected suites");
      const failureCase = `import {it, expect} from 'vitest';it('host failure witness',()=>expect(1).toBe(2));`;
      const negative = offline(evaluation, `printf '%s\\n' ${quote(failureCase)} > test/self-maintenance-witness.test.ts && node --run test:focused -- --maxWorkers 1 test/self-maintenance-witness.test.ts`);
      writeFileSync(join(run, "candidate-negative.log"), negative.stdout + negative.stderr);
      assert(negative.status === 1 && /host failure witness/u.test(negative.stdout + negative.stderr) && /AssertionError/u.test(negative.stderr), "Candidate suppressed or did not run a failing test");
      report.verification = { files, tests: passed, deliberateFailurePropagated: true, onlyAddedScript: true, exactSha: report.candidate, manifestDigest };
    }
    report.result = report.session.natural && report.attribution?.valid && (native || report.delivery) ? "PASS" : "INCOMPLETE_SESSION";
  } catch (error) {
    report.result = "FAIL";
    report.reason = error.message;
  } finally {
    writeJson(join(run, paid ? "result.json" : "qualification.json"), report);
    for (const volume of volumes.splice(0)) docker(["volume", "rm", volume]);
  }
  console.log("RESULT", arm, report.result, report.candidate, report.accounting, report.reason ?? "");
  return report;
}

mkdirSync(root);
const bundle = join(root, "basis.bundle");
execFileSync("git", ["bundle", "create", bundle, ref], { cwd: repo });
if (paid) {
  const rows = [];
  if (approval !== undefined) writeJson(join(root, "acceptance.json"), approval);
  const arms = approval === undefined ? ["P", "F"] : ["OLD", "ACCEPTED"];
  for (const arm of arms) {
    const row = await runStage(join(root, arm), arm, bundle, arm === "ACCEPTED" ? approval.bundle : null);
    rows.push(row);
    writeJson(join(root, "matrix.json"), { basis, image, window: liveWindow, qualifiedMock: qualification.candidate,
      ...(approval === undefined ? {} : { accepted: approval.candidate, oracleSha256: digest(readFileSync(followupOracle)) }), rows });
    if (!row.accounting?.admitted || row.accounting.unresolved || !row.attribution?.usageQualified) break;
  }
} else {
  const row = await runStage(root, "P", bundle);
  if (row.result !== "PASS") process.exitCode = 1;
}
