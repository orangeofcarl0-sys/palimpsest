/** Zero-paid qualification for a maintenance task on Palimpsest's own repository. */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { runContainerSession } from "../container_adapter.mjs";
import { docker } from "../container_runtime.mjs";
import { ExecutionBudget } from "../execution_budget.mjs";
import { startMockProvider } from "../mock_provider.mjs";
import { digest, git, readJson, writeJson } from "../energy/contract.mjs";
import { attribute } from "../energy/evidence.mjs";
import { conclusion, profileFor } from "../energy/product.mjs";

const [directory, imageRef = "palimpsest-cold-handover:local"] = process.argv.slice(2);
assert(directory, "Usage: self-maintenance-qualify.mjs <new directory> [image]");
const root = resolve(directory);
const repo = fileURLToPath(new URL("../../../", import.meta.url));
const ref = "refs/remotes/origin/main";
const basis = git(repo, "rev-parse", ref);
const image = docker(["image", "inspect", imageRef, "--format", "{{.Id}}"]);
const tests = "--maxWorkers 1 test/alhs_episode_convergence.test.ts test/pnwf_cq_basis_admission.test.ts";
const build = "node node_modules/typescript/bin/tsc -b";
const projectId = "palimpsest-self-maintenance";
const brief = "上次 Palimpsest 的重启交接维护会话在依赖目录只读的运行环境里无法启动定向测试，影响了提交。请在同一仓库提供稳定的 node --run test:focused -- <测试路径> 入口，让维护者在该环境中仍能运行指定测试并收到真实成败。此工单只允许在 package.json 增加这个入口，保留现有配置、测试、CI 和其他脚本。验证后提交候选。原现场见 docs/engineering/CONTINUITY-HANDOVER-DOGFOOD.md。";
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

function seed(bundle, candidate) {
  const volume = docker(["volume", "create", "pnwf-self-maintenance-" + randomUUID()]);
  volumes.push(volume);
  succeed(offline(volume, ["git init -q", `git fetch -q /basis.bundle '${ref}:refs/heads/basis'`,
    "git checkout -q -b repair basis",
    ...(candidate ? ["git fetch -q /candidate.bundle HEAD", "git checkout -q --detach FETCH_HEAD"] : []),
    "ln -s /opt/palimpsest-dev/node_modules node_modules", "printf '\\n/node_modules\\n' >> .git/info/exclude",
    "git config user.name 'Self-maintenance Mock'", "git config user.email self-maintenance@example.invalid", "chown -R 1001:1001 /work"].join("\n"),
  [`${bundle}:/basis.bundle:ro`, ...(candidate ? [`${candidate}:/candidate.bundle:ro`] : [])], true));
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

mkdirSync(root);
const bundle = join(root, "basis.bundle");
execFileSync("git", ["bundle", "create", bundle, ref], { cwd: repo });
const report = { basis, image, briefSha256: digest(brief), runnerSha256: digest(readFileSync(fileURLToPath(import.meta.url))), mode: "mock", paidRequests: 0 };
try {
  const volume = seed(bundle);
  const sessionId = "MAINTAIN";
  const stage = join(root, "stages", sessionId);
  const state = join(stage, "state");
  const world = join(stage, "world");
  const runtime = join(root, "host-runtime");
  const profile = join(root, "profile.json");
  const initProfile = join(root, "offline-profile.json");
  const promptPath = join(root, "brief.txt");
  for (const directory of [state, world, runtime]) mkdirSync(directory, { recursive: true });
  writeFileSync(promptPath, brief);
  succeed(offline(volume, "test -x node_modules/.bin/vitest && ! touch node_modules/.self-maintenance-write-check"));
  const baseline = offline(volume, `node node_modules/vitest/vitest.mjs run --no-cache ${tests}`);
  writeFileSync(join(root, "baseline.log"), baseline.stdout + baseline.stderr);
  const loaderError = baseline.stderr.match(/(EACCES|EROFS|ENOENT):[^\n]*mkdir '[^'\n]*\/node_modules\/\.vite-temp'/u)?.[1];
  report.baseline = { exit: baseline.status, loaderError, reproduced: baseline.status !== 0 && Boolean(loaderError) };
  assert(report.baseline.reproduced, "Baseline did not reproduce the read-only Vitest loader failure");

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
  const init = `import {readFileSync} from 'node:fs';import {launchDeployment,loadDeploymentProfile} from './dist/src/advanced.js';const d=launchDeployment(loadDeploymentProfile('/profile.json'));try{await d.installed.controller.start({projectId:'${projectId}',goal:readFileSync('/brief','utf8'),headCommit:'${basis}',tasks:[]});}finally{await d.close();}`;
  succeed(offline(volume, `node --input-type=module -e ${quote(init)}`, [`${state}:/state`, `${initProfile}:/profile.json:ro`, `${promptPath}:/brief:ro`]));

  const cohortId = "self-maintenance-" + randomUUID();
  const budgetPath = join(root, "request-ledger.sqlite");
  const ceiling = 2_000_000;
  const budget = ExecutionBudget.initialize(budgetPath, { schema: "pnwf-request-budget/v1", cohortId, aggregateCeiling: ceiling,
    sessions: [{ id: sessionId, ceiling, softCeiling: ceiling, maxRequests: 16 }] });
  writeJson(join(root, "core.json"), { cohortId, budget: ceiling, sessions: [{ id: sessionId, condition: "P", world, state,
    deployment: profile, expectedHead: basis, promptPath, killAfterMs: 5 * 60_000 }] });
  const mock = await startMockProvider({ reply: mockReply() });
  try {
    budget.startSession(sessionId);
    report.session = await runContainerSession({ run: root, sessionId, budgetPath, repository: runtime, image, provider: mock.config,
      experiment: { layout: "product", worldVolume: volume } });
  } finally { budget.close(); await mock.close(); }
  report.attribution = attribute(root, sessionId, "mock");
  report.conclusion = conclusion(state);
  assert(report.session.natural && report.attribution.valid, "Mock did not naturally exit with a reconciled ledger");
  report.candidate = succeed(offline(volume, "git rev-parse HEAD"));
  assert.notEqual(report.candidate, basis, "No candidate commit");
  assert.equal(succeed(offline(volume, "git status --porcelain")), "");
  assert.equal(succeed(offline(volume, "git diff --name-only basis HEAD")), "package.json");
  assert.equal(succeed(offline(volume, "git rev-parse HEAD^")), basis);
  assert.equal(report.conclusion?.intent, "DELIVER");
  const conclusionLine = report.conclusion.body.split("\n").findLast(line => line.startsWith('{"schema":"pc1-episode-conclusion/v1"'));
  assert(conclusionLine, "Missing persisted Episode conclusion");
  const [artifact] = JSON.parse(conclusionLine).check.artifacts;
  assert(artifact.path === "package.json" && artifact.commit === report.candidate && artifact.committed && artifact.tracked && artifact.present,
    "DELIVER did not bind the committed manifest to the candidate SHA");
  succeed(offline(volume, "git diff --binary basis HEAD > /evidence/candidate.patch && git bundle create /evidence/candidate.bundle basis..HEAD", [`${root}:/evidence`]));

  const evaluation = seed(bundle, join(root, "candidate.bundle"));
  assert.equal(succeed(offline(evaluation, "git rev-parse HEAD")), report.candidate);
  const manifestDigest = succeed(offline(evaluation, "git cat-file blob HEAD:package.json | sha256sum")).split(/\s+/u)[0];
  assert.equal(artifact.digest, manifestDigest, "DELIVER digest differs from the exported Git blob");
  const before = JSON.parse(succeed(offline(evaluation, "git show basis:package.json")));
  const after = JSON.parse(succeed(offline(evaluation, "git show HEAD:package.json")));
  assert(!Object.hasOwn(before.scripts, "test:focused"));
  assert.equal(typeof after.scripts["test:focused"], "string");
  delete after.scripts["test:focused"];
  assert.deepEqual(after, before);
  const positive = offline(evaluation, `${build} && node --run test:focused -- ${tests}`);
  writeFileSync(join(root, "candidate-positive.log"), positive.stdout + positive.stderr);
  const positiveOutput = stripVTControlCharacters(succeed(positive));
  const files = Number(positiveOutput.match(/Test Files\s+(\d+) passed/u)?.[1]);
  const passed = Number(positiveOutput.match(/Tests\s+(\d+) passed/u)?.[1]);
  assert(files === 2 && passed > 0, "The candidate did not run both expected suites");
  const failureCase = `import {it, expect} from 'vitest';it('host failure witness',()=>expect(1).toBe(2));`;
  const negative = offline(evaluation, `printf '%s\\n' ${quote(failureCase)} > test/self-maintenance-witness.test.ts && node --run test:focused -- --maxWorkers 1 test/self-maintenance-witness.test.ts`);
  writeFileSync(join(root, "candidate-negative.log"), negative.stdout + negative.stderr);
  assert(negative.status === 1 && /host failure witness/u.test(negative.stdout + negative.stderr) && /AssertionError/u.test(negative.stderr), "Candidate suppressed or did not run a failing test");
  report.verification = { files, tests: passed, deliberateFailurePropagated: true, onlyAddedScript: true, exactSha: report.candidate, manifestDigest };
  report.result = "PASS";
} finally {
  writeJson(join(root, "qualification.json"), report);
  for (const volume of volumes) docker(["volume", "rm", volume]);
}
console.log(JSON.stringify({ basis, image, candidate: report.candidate, requests: report.attribution.requests, verification: report.verification, evidence: root }));
