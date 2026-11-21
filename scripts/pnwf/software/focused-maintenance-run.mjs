/** Same ordinary DSH in both cells. Only the eligible, admitted method is offered in WITH. */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
import { COMMAND, approveFocusedMethod, archivedGrounds, testActivity } from "./focused-method.mjs";

const [destination, mockQualification, imageRef = "palimpsest-cold-handover:local"] = process.argv.slice(2);
assert(destination, "Usage: focused-maintenance-run.mjs <new output> [Mock output for real pair] [image]");
const paid = Boolean(mockQualification);
const mode = paid ? PAID_MODE : "mock";
const repo = fileURLToPath(new URL("../../../", import.meta.url));
const root = resolve(destination);
const here = fileURLToPath(new URL(".", import.meta.url));
const basis = "8e1e3098328a8d75758f50b884599206f4b547b7";
const ref = `refs/pnwf/bases/focused-${randomUUID()}`;
assert.equal(git(repo, "rev-parse", `${basis}^{commit}`), basis);
const image = docker(["image", "inspect", imageRef, "--format", "{{.Id}}"]);
const sessionId = "MAINTAIN";
const projectId = "focused-testing-maintenance";
const window = { maxRequests: 64, wallClockMs: 30 * 60_000, requestTimeoutMs: 240_000, billingCeiling: null };
const brief = "维护者在记录 DELIVER 时，偶尔看到一份干净的已提交文件被提示成有未提交修改。请修复工件出处提示：真实的未提交修改仍须明确指出，观察过程中 HEAD 改变、无法确认 HEAD 或无法读取 Git 工件时，应准确描述观察问题。保留已提交、缺失、未跟踪和候选接受的既有含义。仅修改 src/project_continuity/episode.ts 和 test/alhs_episode_convergence.test.ts，补定向回归，验证并提交候选。";
const source = "src/project_continuity/episode.ts";
const target = "test/alhs_episode_convergence.test.ts";
const oracle = join(here, "focused-maintenance.oracle.ts.txt");
const fixedInputs = { basis, image, briefSha256: digest(brief), oracleSha256: digest(readFileSync(oracle)),
  runtimeSha256: digest(JSON.stringify(["dist/src/composition/focused_testing.js", "dist/src/procedures/store.js", "dist/src/deployment/profile.js", "dist/src/deployment/launch.js",
    "dist/src/product.js", "host/dsh/lib/runner.js", "scripts/pnwf/container_adapter.mjs", "scripts/pnwf/software/focused-method.mjs",
    "scripts/pnwf/software/focused-maintenance-run.mjs", "scripts/pnwf/software/focused-maintenance-sdk.mjs"].map(path => digest(readFileSync(join(repo, path)))))) };
let openCodeGoProfile;
let qualified;
if (paid) {
  qualified = readJson(join(resolve(mockQualification), "qualification.json"));
  assert.equal(qualified.result, "PASS");
  assert.deepEqual(qualified.inputs, fixedInputs);
  assert(qualified.sdk.actualInvocation && qualified.rows.length === 2 && qualified.rows.every(row => row.result === "PASS" && row.paidRequests === 0));
  openCodeGoProfile = requireOpenCodeGoProbe(readJson(join(repo, "research-evidence/pnwf-work-revision/2026-11-18/opencode-go-tooled-t3-055602/opencode-probe.json")));
  readOpenCodeGoKey(openCodeGoProfile);
}

const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const volumes = [];
const bundle = join(root, "basis.bundle");
const runtime = join(root, "host-runtime");
const isolation = ["--rm", "--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
  "--tmpfs", "/tmp:rw,exec,nosuid,nodev", "-e", "HOME=/tmp"];

function offline(volume, command, mounts = [], seed = false) {
  const container = `pnwf-focused-check-${randomUUID()}`;
  const result = spawnSync("docker", ["run", ...isolation, "--name", container, "--user", seed ? "0:0" : "1001:1001",
    ...(seed ? ["--cap-add", "CHOWN", "--cap-add", "DAC_OVERRIDE"] : []), "-v", `${volume}:/work`,
    ...mounts.flatMap(mount => ["-v", mount]), "-w", "/work", "--entrypoint", "sh", image, "-eu", "-c", command],
  { encoding: "utf8", timeout: 240_000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error) {
    spawnSync("docker", ["rm", "-f", container], { stdio: "ignore", timeout: 10_000 });
    throw result.error;
  }
  return result;
}

function succeed(result) {
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout.trim();
}

function seed(candidate) {
  const volume = docker(["volume", "create", `pnwf-focused-maintenance-${randomUUID()}`]);
  volumes.push(volume);
  succeed(offline(volume, ["git init -q", `git fetch -q /basis.bundle '${ref}:refs/heads/basis'`, "git checkout -q -b repair basis",
    ...(candidate ? ["git fetch -q /candidate.bundle HEAD", "git checkout -q --detach FETCH_HEAD"] : []),
    "ln -s /opt/palimpsest-dev/node_modules node_modules", "printf '\\n/node_modules\\n' >> .git/info/exclude",
    "git config user.name 'Maintenance pilot'", "git config user.email maintenance-pilot@example.invalid", "chown -R 1001:1001 /work"].join("\n"),
  [`${bundle}:/basis.bundle:ro`, ...(candidate ? [`${candidate}:/candidate.bundle:ro`] : [])], true));
  return volume;
}

function runCheck(volume, command, log, mounts = []) {
  const outcome = offline(volume, command, mounts);
  const output = stripVTControlCharacters(outcome.stdout + outcome.stderr);
  writeFileSync(log, output);
  return { exit: outcome.status, passed: Number(output.match(/^\s*Tests\s+(?:(?:\d+ failed\s*\|\s*)?)(\d+) passed/mu)?.[1] ?? 0), output };
}

function score(volume, log) {
  // The independent oracle is available only to this post-session container.
  const out = runCheck(volume, `cp /oracle.txt test/host-focused-oracle.test.ts && trap 'rm -f test/host-focused-oracle.test.ts' EXIT\n${COMMAND} --maxWorkers 1 test/host-focused-oracle.test.ts`,
    log, [`${oracle}:/oracle.txt:ro`]);
  return { exit: out.exit, passed: out.passed, expected: 5 };
}

function verifyMethod(volume) {
  const plain = runCheck(volume, `node node_modules/vitest/vitest.mjs run --maxWorkers 1 ${target}`, join(root, "default-startup.log"));
  const focused = runCheck(volume, `${COMMAND} --maxWorkers 1 ${target}`, join(root, "focused-startup.log"));
  const negative = runCheck(volume, `printf '%s\\n' 'import {it,expect} from "vitest";it("deliberate failure",()=>expect(1).toBe(2));' > test/focused-negative.test.ts
trap 'rm -f test/focused-negative.test.ts' EXIT
${COMMAND} --maxWorkers 1 test/focused-negative.test.ts`, join(root, "focused-negative.log"));
  const baseline = score(volume, join(root, "baseline-oracle.log"));
  assert.deepEqual(baseline, { exit: 1, passed: 2, expected: 5 });
  const verification = { standardStartupFailed: plain.exit === 1 && /(?:EACCES|EROFS|ENOENT):.*\.vite-temp/u.test(plain.output),
    focusedPassed: focused.exit === 0 && focused.passed === 9, assertionExit: negative.exit, baseline };
  assert(verification.standardStartupFailed && verification.focusedPassed && verification.assertionExit === 1 && /AssertionError/u.test(negative.output));
  return verification;
}

function stageRuntime(method) {
  mkdirSync(join(runtime, "dist"), { recursive: true });
  cpSync(join(repo, "dist/src"), join(runtime, "dist/src"), { recursive: true });
  cpSync(join(repo, "host/dsh"), join(runtime, "host/dsh"), { recursive: true });
  mkdirSync(join(runtime, "runtime"));
  cpSync(method.procedurePath, join(runtime, "runtime/focused-procedure.sqlite"));
  mkdirSync(join(runtime, "node_modules/@ordarium"), { recursive: true });
  for (const name of ["core", "host-kit", "ledger-sqlite", "testing"]) {
    cpSync(join(repo, "node_modules", "@ordarium", name), join(runtime, "node_modules", "@ordarium", name), { recursive: true, dereference: true });
  }
  writeJson(join(runtime, "package.json"), { type: "module", private: true });
}

function sdkQualification(volume, method) {
  const dir = join(root, "sdk");
  mkdirSync(dir);
  cpSync(join(here, "focused-maintenance-sdk.mjs"), join(dir, "consumer.mjs"));
  writeJson(join(dir, "approval.json"), { procedure: method.ref });
  const packageRoot = join(root, "sdk-package");
  mkdirSync(join(packageRoot, "dist"), { recursive: true });
  cpSync(join(repo, "dist/src"), join(packageRoot, "dist/src"), { recursive: true });
  for (const file of ["package.json", "README.md", "LICENSE"]) cpSync(join(repo, file), join(packageRoot, file));
  const npmBin = process.platform === "win32" ? ["powershell.exe", ["-NoProfile", "-Command", "npm pack --ignore-scripts --quiet"]] : ["npm", ["pack", "--ignore-scripts", "--quiet"]];
  const tarball = execFileSync(npmBin[0], [...npmBin[1], "--pack-destination", dir], { cwd: packageRoot, encoding: "utf8", timeout: 180_000 }).trim().split(/\r?\n/u).at(-1);
  assert(/^palimpsest-dsh-[\w.-]+\.tgz$/u.test(tarball));
  const packageSha256 = digest(readFileSync(join(dir, tarball)));
  // Local dependencies are the exact locked packages provisioned in the frozen image.
  writeJson(join(dir, "package.json"), { name: "external-focused-maintenance-sdk", private: true, type: "module",
    overrides: Object.fromEntries(["core", "host-kit", "ledger-sqlite", "testing"].map(name => [`@ordarium/${name}`, `file:/opt/palimpsest-dev/node_modules/@ordarium/${name}`])) });
  const command = `mkdir /tmp/sdk\ncp /sdk/consumer.mjs /sdk/package.json /tmp/sdk/\ncd /tmp/sdk\nnpm install --offline --omit=dev --ignore-scripts --no-audit --no-package-lock --cache /tmp/npm ` +
    quote(`/sdk/${tarball}`) + "\nnode consumer.mjs";
  const output = offline(volume, command, [`${dir}:/sdk:ro`, `${method.procedurePath}:/approval.sqlite:ro`]);
  writeFileSync(join(root, "sdk.log"), output.stdout + output.stderr);
  return { packageSha256, ...JSON.parse(succeed(output).split(/\r?\n/u).at(-1)) };
}

function mockReply(offered) {
  const old = "warnings.push(`artifact ${state.path} is tracked but has uncommitted changes; HEAD does not contain the final bytes`);";
  const change = `if (state.detail === "tracked with uncommitted changes") ${old}\n      else warnings.push(\`artifact \${state.path} is tracked but commit provenance could not be confirmed: \${state.detail}\`);`;
  const issue = `const f=require('node:fs');const p='${source}';const before=f.readFileSync(p,'utf8');const from=${JSON.stringify(old)};if(!before.includes(from))process.exit(1);f.writeFileSync(p,before.replace(from,${JSON.stringify(change)}));`;
  const regression = `\n\nit("reports dirty artifact bytes without confusing an observation failure", () => {\n  const state = { path: "review.md", present: true, tracked: true, committed: false, commit: null, source: "WORKTREE" as const, digest: null };\n  expect(episodeArtifactWarnings([{ ...state, detail: "HEAD changed during artifact observation" }]).join(" ")).toMatch(/HEAD changed/);\n  expect(episodeArtifactWarnings([{ ...state, detail: "tracked with uncommitted changes" }]).join(" ")).toMatch(/uncommitted changes/);\n});\n`;
  const testEdit = `const f=require('node:fs');const p='${target}';const before=f.readFileSync(p,'utf8');f.writeFileSync(p,'import { episodeArtifactWarnings } from "../src/project_continuity/episode.js";\\n'+before+${JSON.stringify(regression)});`;
  return async (request, ordinal) => {
    if (ordinal === 0) {
      const messages = JSON.stringify(request.messages);
      assert.equal(messages.includes(COMMAND), offered, "advisory must appear before first command selection");
      assert(messages.includes(brief), "frozen business brief missing from first request");
      const command = offered ? COMMAND : "node node_modules/vitest/vitest.mjs run";
      return [{ type: "tool_use", name: "bash", id: "focused_first", input: { command: `${command} --maxWorkers 1 ${target}`,
        description: "Observe the test command selected for this environment", timeoutMs: 120000 } }];
    }
    const resultText = id => {
      const content = request.messages.flatMap(message => Array.isArray(message.content) ? message.content : [])
        .findLast(block => block.type === "tool_result" && block.tool_use_id === id)?.content;
      return stripVTControlCharacters(typeof content === "string" ? content : (content ?? []).map(item => item.text ?? "").join("\n"));
    };
    if (ordinal === 1) {
      const output = resultText("focused_first");
      assert(offered ? /9 passed/u.test(output) : /\.vite-temp/u.test(output));
      return [{ type: "tool_use", name: "bash", id: "focused_patch", input: { command:
        `node -e ${quote(issue)} && node -e ${quote(testEdit)} && ${COMMAND} --maxWorkers 1 ${target} && git add -- ${source} ${target} && git commit -m 'Report the observed artifact provenance failure' && echo FOCUSED_MOCK_COMMITTED`,
        description: "Verify and commit the scripted qualification patch", timeoutMs: 120000 } }];
    }
    if (ordinal === 2) {
      assert(resultText("focused_patch").includes("FOCUSED_MOCK_COMMITTED"));
      return [{ type: "tool_use", name: "palimpsest_work", id: "focused_deliver", input: {
        action: "conclude", intent: "DELIVER", artifacts: [source, target], statement: "Submit the corrected provenance warnings and their regression." } }];
    }
    return [{ type: "text", text: "The maintenance candidate is ready for review." }];
  };
}

function sessionAnalysis(run, attribution) {
  const out = join(run, "out", sessionId);
  const principal = attribution.traces.find(trace => trace.role === "principal");
  const index = attribution.traces.indexOf(principal);
  const stream = readdirSync(join(run, `runtime-${sessionId}`, "sessions"), { recursive: true }).find(name => name.endsWith(".zstd") && basename(name).includes(principal.id));
  const all = readdirSync(join(run, `runtime-${sessionId}`, "sessions"), { recursive: true }).filter(name => name.endsWith(".zstd"));
  const streamName = stream ?? (all.length === 1 ? all[0] : null);
  assert(streamName, "principal stream not unique");
  const path = join(run, `runtime-${sessionId}`, "sessions", streamName);
  assert.equal(digest(readFileSync(path)), principal.digest);
  const summary = readJson(join(out, "attribution", `${index}.timeline.json`)).summary;
  const activity = testActivity(path, summary);
  const firstPass = activity.find(row => row.state === "PASS") ?? null;
  const firstOffer = readFileSync(join(out, "run.log"), "utf8").split(/\r?\n/u).find(line => line.startsWith("PALIMPSEST_FOCUSED_TEST_OFFER "));
  const offer = firstOffer ? JSON.parse(firstOffer.slice("PALIMPSEST_FOCUSED_TEST_OFFER ".length)) : null;
  const prefix = firstPass ? summary.modelSteps.filter(step => step.seq < firstPass.resultSeq) : null;
  const usageToFirstPass = prefix && Object.fromEntries(["inputTokens", "cacheReadTokens", "cacheWriteTokens", "outputTokens", "totalTokens"]
    .map(key => [key, prefix.reduce((sum, step) => sum + step.usage[key], 0)]));
  return { offer, stream: streamName.replaceAll("\\", "/"), activity, firstPass, requestsToFirstPass: prefix?.length ?? null, usageToFirstPass,
    startupFailures: activity.filter(row => row.state === "STARTUP_FAILURE").length,
    exactInvocations: activity.filter(row => row.method === "EXACT" && ["PASS", "ASSERTION_FAILURE", "STARTUP_FAILURE"].includes(row.state)).length };
}

async function runArm(arm, method) {
  const offered = arm === "WITH";
  const run = join(root, arm);
  const stage = join(run, "stages", sessionId);
  const state = join(stage, "state");
  const world = join(stage, "world");
  const profile = join(run, "profile.json");
  const promptPath = join(run, "brief.txt");
  const report = { arm, mode, basis, paidRequests: 0 };
  try {
    mkdirSync(state, { recursive: true });
    mkdirSync(world);
    writeFileSync(promptPath, brief);
    const volume = seed();
    assert.equal(succeed(offline(volume, "git rev-parse HEAD")), basis);
    profileFor({ world, state, path: profile, projectId, localPeer: "principal", standard: "Leave a tested candidate commit confined to the maintenance ticket." });
    const deployment = readJson(profile);
    if (offered) {
      writeJson(profile, { ...deployment, focusedTesting: { storePath: "/product/runtime/focused-procedure.sqlite", procedure: method.ref } });
    }
    const initProfile = join(run, "init-profile.json");
    writeJson(initProfile, { ...deployment, repository: "/work", transport: { ...deployment.transport, databasePath: "/state/transport.sqlite" },
      databases: Object.fromEntries(Object.entries(deployment.databases).map(([key, path]) => [key, `/state/${basename(path)}`])) });
    const init = `import {readFileSync} from 'node:fs';import {launchDeployment,loadDeploymentProfile} from '/product/dist/src/advanced.js';const d=launchDeployment(loadDeploymentProfile('/profile.json'));try{await d.installed.controller.start({projectId:'${projectId}',goal:readFileSync('/brief','utf8'),headCommit:'${basis}',tasks:[]});}finally{await d.close();}`;
    succeed(offline(volume, `node --input-type=module -e ${quote(init)}`, [`${runtime}:/product:ro`, `${state}:/state`, `${initProfile}:/profile.json:ro`, `${promptPath}:/brief:ro`]));
    const cohortId = `focused-maintenance-${randomUUID()}`;
    const budgetPath = join(run, "request-ledger.sqlite");
    const ceiling = paid ? null : 2_000_000;
    if (paid) writeJson(join(run, "cohort.json"), { schema: PAID_COHORT_SCHEMA, cohortId, stages: [{ id: sessionId }], ...window });
    writeJson(join(run, "core.json"), { cohortId, budget: ceiling, sessions: [{ id: sessionId, condition: "P", world, state, deployment: profile,
      expectedHead: basis, promptPath, killAfterMs: paid ? window.wallClockMs : 5 * 60_000 }] });
    const budget = ExecutionBudget.initialize(budgetPath, { schema: paid ? USAGE_ONLY_SCHEMA : "pnwf-request-budget/v1", cohortId, aggregateCeiling: ceiling,
      sessions: [{ id: sessionId, ceiling, softCeiling: ceiling, maxRequests: paid ? window.maxRequests : 16 }] });
    const mock = paid ? null : await startMockProvider({ reply: mockReply(offered) });
    try {
      budget.startSession(sessionId);
      console.log("START", mode, arm, new Date().toISOString());
      report.session = await runContainerSession({ run, sessionId, budgetPath, repository: runtime, image, mode, provider: mock?.config,
        experiment: { layout: "product", worldVolume: volume, openCodeGoProfile } });
    } finally { budget.close(); await mock?.close(); }
    report.paidRequests = report.session.paidRequestsAdmitted;
    const ledger = readJson(join(run, "out", sessionId, "request-accounting.json"));
    report.accounting = { admitted: ledger.requests.length, confirmed: ledger.confirmed, unresolved: ledger.unresolvedRequests };
    try {
      report.attribution = attribute(run, sessionId, mode);
      report.testSelection = sessionAnalysis(run, report.attribution);
    } catch (error) { report.attributionError = error.message; }
    report.conclusion = conclusion(state);
    report.candidate = succeed(offline(volume, "git rev-parse HEAD"));
    report.status = succeed(offline(volume, "git status --porcelain"));
    succeed(offline(volume, "git diff --binary HEAD > /evidence/working.patch && git ls-files --others --exclude-standard -z | tar -czf /evidence/untracked.tgz --null -T -", [`${run}:/evidence`]));
    if (report.candidate !== basis) {
      succeed(offline(volume, "git merge-base --is-ancestor basis HEAD && git diff --binary basis HEAD > /evidence/candidate.patch && git bundle create /evidence/candidate.bundle basis..HEAD", [`${run}:/evidence`]));
      report.paths = succeed(offline(volume, "git diff --name-only basis HEAD")).split(/\r?\n/u);
      const verified = seed(join(run, "candidate.bundle"));
      assert.equal(succeed(offline(verified, "git rev-parse HEAD")), report.candidate);
      report.quality = score(verified, join(run, "candidate-oracle.log"));
      const publicTests = runCheck(verified, `${COMMAND} --maxWorkers 1 ${target}`, join(run, "candidate-tests.log"));
      report.quality.publicTests = { exit: publicTests.exit, passed: publicTests.passed };
      report.quality.typecheck = runCheck(verified, "node node_modules/typescript/bin/tsc -b", join(run, "candidate-typecheck.log")).exit;
      const parts = report.conclusion?.body.split("\n").find(line => line.startsWith('{"schema":"pc1-episode-conclusion/v1"'));
      const artifacts = parts ? JSON.parse(parts).check.artifacts : [];
      report.delivery = report.conclusion?.intent === "DELIVER" && [source, target].every(path => artifacts.some(artifact =>
        artifact.path === path && artifact.committed && artifact.commit === report.candidate));
    }
    const tests = report.testSelection;
    const correctOffer = offered ? tests?.offer?.head === basis && tests?.offer?.procedure.digest === method.ref.digest : tests?.offer === null;
    const mockRoute = paid || (tests?.firstPass && tests.startupFailures === Number(!offered) && (!offered || tests.activity[0]?.method === "EXACT"));
    report.result = correctOffer && mockRoute && report.session.natural && report.attribution?.valid && report.delivery && report.status === "" &&
      JSON.stringify(report.paths) === JSON.stringify([source, target]) && report.quality?.passed === 5 && report.quality?.publicTests.exit === 0 &&
      report.quality?.typecheck === 0 ? "PASS" : "INCOMPLETE";
  } catch (error) { report.result = "FAIL"; report.reason = error.stack; }
  finally { writeJson(join(run, "result.json"), report); }
  console.log("RESULT", arm, report.result, report.candidate, report.accounting, report.reason ?? "");
  return report;
}

mkdirSync(root);
writeFileSync(join(root, "brief.txt"), brief);
try {
  git(repo, "update-ref", ref, basis, "");
  try { execFileSync("git", ["bundle", "create", bundle, ref], { cwd: repo, timeout: 120_000 }); }
  finally { git(repo, "update-ref", "-d", ref, basis); }
  const calibration = seed();
  const verification = verifyMethod(calibration);
  const method = await approveFocusedMethod({ directory: root, grounds: archivedGrounds(repo), verification });
  const { procedurePath, ...methodEvidence } = method;
  writeJson(join(root, "approval.json"), methodEvidence);
  if (qualified) assert.deepEqual(qualified.procedure, method.ref, "qualified Procedure reference has drifted");
  const sdk = paid ? qualified.sdk : sdkQualification(calibration, method);
  stageRuntime(method);
  const rows = [];
  for (const arm of ["WITH", "WITHOUT"]) {
    const row = await runArm(arm, method);
    rows.push(row);
    const result = rows.length === 2 && rows.every(row => row.result === "PASS") ? "PASS" : "INCOMPLETE";
    writeJson(join(root, paid ? "matrix.json" : "qualification.json"), { result, inputs: fixedInputs, procedure: method.ref, window, sdk, rows });
    if (paid && (!row.accounting?.admitted || row.accounting.unresolved || !row.attribution?.usageQualified)) break;
  }
  if (!paid && rows.some(row => row.result !== "PASS")) process.exitCode = 1;
} finally {
  for (const volume of volumes) docker(["volume", "rm", volume]);
}
