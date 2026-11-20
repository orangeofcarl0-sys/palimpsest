import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runContainerSession } from "../container_adapter.mjs";
import { docker } from "../container_runtime.mjs";
import { ExecutionBudget, USAGE_ONLY_SCHEMA } from "../execution_budget.mjs";
import { PAID_MODE, PAID_COHORT_SCHEMA } from "../bounded_provider.mjs";
import { startMockProvider } from "../mock_provider.mjs";
import { requireOpenCodeGoProbe } from "../opencode_go.mjs";
import { attribute } from "../energy/evidence.mjs";
import { analyzeAttributedStage } from "../analyze_energy_trajectory.mjs";
import { digest, git, readJson, writeJson } from "../energy/contract.mjs";
import { profileFor, conclusion } from "../energy/product.mjs";

const [action, directory, imageRef, qualifiedPath] = process.argv.slice(2);
assert(["mock", "live"].includes(action) && directory && imageRef, "Usage: cold-handover-run.mjs mock|live <new dir> <image> [mock dir]");
const root = resolve(directory);
const repo = fileURLToPath(new URL("../../../", import.meta.url));
const here = fileURLToPath(new URL("./", import.meta.url));
const basis = "6bf50e90dfad78c4eff668f369d5dd0c5d84564e";
const guide = readFileSync(join(repo, "docs/engineering/CONTINUITY-HANDOVER-DOGFOOD.md"), "utf8");
const brief = guide.match(/^> (我接手[^\r\n]+)$/mu)?.[1];
assert(brief, "Missing pre-existing work order");
const prompt = brief + "\n既有故障报告见 docs/engineering/GRPC-AUTONOMOUS-CONTINUITY.md 的「真实项目的接受与接续」。";
const image = docker(["image", "inspect", imageRef, "--format", "{{.Id}}"]);
const window = { maxRequests: 64, wallClockMs: 30 * 60 * 1000, requestTimeoutMs: 240_000, billingCeiling: null };
const openCodeGoProfile = requireOpenCodeGoProbe(readJson(join(repo, "research-evidence/pnwf-work-revision/2026-11-18/opencode-go-tooled-t3-055602/opencode-probe.json")));
const seal = {
  basis, prompt: digest(prompt), image, window,
  files: Object.fromEntries(["cold-handover-run.mjs", "cold-handover-check.mjs", "../container_adapter.mjs",
    "../container_runtime.mjs", "../bounded_provider.mjs", "../execution_budget.mjs"].map(name => [name, digest(readFileSync(join(here, name)))])),
};
const paid = action === "live";
if (paid) {
  const mock = readJson(join(resolve(qualifiedPath), "matrix.json"));
  assert.deepEqual(mock.seal, seal, "Mock and live conditions differ");
  assert(mock.baseline?.checks?.some(check => !check.pass) && mock.rows.length === 2 &&
    mock.rows.every(row => row.grade.pass && row.evidence.valid && row.verification));
}

const localExec = (args, timeout = 240_000) => execFileSync("docker", args, { encoding: "utf8", timeout, maxBuffer: 8 * 1024 * 1024 });
function offline(volume, command, mounts = [], user = "1001:1001") {
  return localExec(["run", "--rm", "--network", "none", "--read-only", "--user", user, "--cap-drop", ...(user === "0:0" ? ["ALL", "--cap-add", "CHOWN", "--cap-add", "DAC_OVERRIDE"] : ["ALL"]),
    "--security-opt", "no-new-privileges", "--tmpfs", "/tmp:rw,exec,nosuid,nodev", "-e", "HOME=/tmp",
    "-v", `${volume}:/work`, ...mounts.flatMap(mount => ["-v", mount]),
    "-w", "/work", "--entrypoint", "sh", image, "-eu", "-c", command]);
}
const build = "node node_modules/typescript/bin/tsc -b";
const tests = "node node_modules/vitest/vitest.mjs run --configLoader runner --no-cache --maxWorkers 1 test/alhs_episode_convergence.test.ts test/pnwf_cq_basis_admission.test.ts";

function seed(volume, bundle, candidate) {
  const volumes = [`${bundle}:/basis.bundle:ro`];
  if (candidate) volumes.push(`${candidate}:/candidate.bundle:ro`);
  offline(volume, [
    "git init -q",
    "git fetch -q /basis.bundle 'refs/remotes/origin/main:refs/heads/basis'",
    "git checkout -q -b repair basis",
    ...(candidate ? ["git fetch -q /candidate.bundle HEAD", "git checkout -q --detach FETCH_HEAD"] : []),
    "ln -s /opt/palimpsest-dev/node_modules node_modules",
    "printf '\\n/node_modules\\n' >> .git/info/exclude",
    "git config user.name 'Cold handover experiment'",
    "git config user.email handover-experiment@example.invalid",
    "chown -R 1001:1001 /work",
  ].join("\n"), volumes, "0:0");
}

function grade(volume, output) {
  try {
    const replay = offline(volume, build + " && node /evaluator.mjs && " + tests,
      [`${join(here, "cold-handover-check.mjs")}:/evaluator.mjs:ro`]);
    writeFileSync(output, replay);
    const checks = JSON.parse(replay.match(/^COLD_HANDOVER (.+)$/mu)[1]);
    return { pass: checks.every(check => check.pass), checks };
  } catch (error) {
    writeFileSync(output, String(error.stdout ?? "") + "\n" + String(error.stderr ?? error.message));
    return { pass: false, error: basename(output) };
  }
}

function prepareRuntime(volume, runtime) {
  mkdirSync(runtime, { recursive: true });
  offline(volume, build + " && cp -r dist host /host-runtime", [`${runtime}:/host-runtime`]);
  mkdirSync(join(runtime, "runtime"));
  mkdirSync(join(runtime, "node_modules/@ordarium"), { recursive: true });
  for (const name of ["core", "host-kit", "ledger-sqlite", "testing"]) {
    cpSync(join(repo, "node_modules/@ordarium", name), join(runtime, "node_modules/@ordarium", name), { recursive: true, dereference: true });
  }
  writeJson(join(runtime, "package.json"), { type: "module", private: true });
}

function mockReply() {
  const files = execFileSync("git", ["diff", "--binary", basis, "1aa69f60", "--", "src", "test"], { cwd: repo });
  const chunks = files.toString("base64").match(/.{1,9500}/gu);
  const commands = [
    ...chunks.map((chunk, i) => `printf '%s' '${chunk}' ${i ? ">>" : ">"} /tmp/handover.mock`),
    "base64 -d /tmp/handover.mock | git apply - && git add src test && git commit -m 'Mock: restore the handover lookup'",
  ];
  let step = 0;
  return async (request, ordinal) => {
    if (step < commands.length) {
      assert(request.tools.some(t => t.name === "bash"));
      return [{ type: "tool_use", id: "cold_" + ordinal, name: "bash", input: { command: commands[step++], description: "Verify the mock submission path" } }];
    }
    return [{ type: "text", text: "Submitted the scripted qualification patch for independent checks." }];
  };
}

mkdirSync(root);
assert.equal(git(repo, "rev-parse", "refs/remotes/origin/main"), basis);
const bundle = join(root, "basis.bundle");
git(repo, "bundle", "create", bundle, "refs/remotes/origin/main");
const rows = [];
let baseline = null;
for (const arm of ["P", "F"]) {
  const sessionId = "REPAIR";
  const run = join(root, arm);
  const stage = join(run, "stages", sessionId);
  const world = join(stage, "world");
  const state = join(stage, "state");
  const profile = join(run, "profile.json");
  const promptPath = join(run, "prompt.txt");
  mkdirSync(stage, { recursive: true });
  mkdirSync(state);
  mkdirSync(world);
  const volume = docker(["volume", "create", "pnwf-cold-world-" + randomUUID()]);
  seed(volume, bundle);
  if (!paid && arm === "P") {
    baseline = grade(volume, join(root, "baseline.log"));
    assert(baseline.checks?.some(check => !check.pass), "Baseline must reproduce a business failure");
  }
  const runtime = join(run, "runtime");
  if (arm === "P") {
    prepareRuntime(volume, runtime);
    profileFor({ world, state, path: profile, projectId: "palimpsest-cold-handover", localPeer: "principal",
      standard: "Leave a tested repair commit with regression coverage and maintenance notes." });
    const hostProfile = readJson(profile);
    const initProfile = join(run, "init-profile.json");
    writeJson(initProfile, { ...hostProfile, repository: "/work",
      transport: { ...hostProfile.transport, databasePath: "/state/transport.sqlite" },
      databases: Object.fromEntries(Object.entries(hostProfile.databases).map(([key, path]) => [key, "/state/" + basename(path)])),
    });
    const initialize = `import {readFileSync} from "node:fs"; import {launchDeployment,loadDeploymentProfile} from "./dist/src/advanced.js";
      const d=launchDeployment(loadDeploymentProfile("/profile.json"));
      try { await d.installed.controller.start({projectId:"palimpsest-cold-handover",goal:readFileSync("/brief","utf8"),headCommit:"${basis}",tasks:[]}); }
      finally { await d.close(); }`;
    writeFileSync(promptPath, prompt);
    offline(volume, `node --input-type=module <<'INIT'\n${initialize}\nINIT`, [
      `${state}:/state`, `${initProfile}:/profile.json:ro`, `${promptPath}:/brief:ro`,
    ]);
  }
  if (arm === "F") offline(volume, build);
  writeFileSync(promptPath, prompt);
  const cohortId = "cold-handover-" + randomUUID();
  const ceiling = paid ? null : 12_000_000;
  if (paid) writeJson(join(run, "cohort.json"), { schema: PAID_COHORT_SCHEMA, cohortId, stages: [{ id: sessionId }], ...window });
  writeJson(join(run, "core.json"), { cohortId, budget: ceiling, sessions: [{
    id: sessionId, condition: arm, world, state, expectedHead: basis, deployment: profile, promptPath, killAfterMs: window.wallClockMs,
  }] });
  const budgetPath = join(run, "request-ledger.sqlite");
  const ledger = ExecutionBudget.initialize(budgetPath, { schema: paid ? USAGE_ONLY_SCHEMA : "pnwf-request-budget/v1",
    cohortId, aggregateCeiling: ceiling, sessions: [{ id: sessionId, ceiling, softCeiling: ceiling, maxRequests: window.maxRequests }] });
  const mock = paid ? null : await startMockProvider({ reply: mockReply() });
  let execution;
  try {
    ledger.startSession(sessionId);
    console.log("START", action, arm, cohortId);
    execution = await runContainerSession({ run, sessionId, budgetPath, repository: runtime, image, provider: mock?.config,
      mode: paid ? PAID_MODE : "mock", experiment: { worldVolume: volume, layout: arm === "P" ? "product" : "native",
        openCodeGoProfile: paid ? openCodeGoProfile : undefined } });
  } finally {
    ledger.close();
    await mock?.close();
  }
  const head = offline(volume, "git rev-parse HEAD").trim();
  const status = offline(volume, "git status --porcelain").trim();
  const row = { arm, basis, head, status, volume, execution, verification: existsSync(join(run, "out", sessionId, "qualification.json")),
    ...(arm === "P" ? { conclusion: conclusion(state) } : {}) };
  const accounting = readJson(join(run, "out", sessionId, "request-accounting.json"));
  row.accounting = { admitted: accounting.requests.length, confirmed: accounting.confirmed, unresolved: accounting.unresolvedRequests };
  try {
    row.evidence = attribute(run, sessionId, paid ? PAID_MODE : "mock");
    if (paid && row.evidence.usageQualified) row.attribution = analyzeAttributedStage(run, sessionId, { context: true, result: row });
  } catch (error) { row.attributionError = error.message; }
  offline(volume, "git diff --binary HEAD > /evidence/working.patch", [`${run}:/evidence`]);
  if (head !== basis) {
    const changed = offline(volume, "git diff --name-only basis HEAD").trim().split(/\r?\n/u);
    row.changed = changed;
    offline(volume, "git diff --binary basis HEAD > /evidence/candidate.patch\ngit bundle create /evidence/candidate.bundle basis..HEAD",
      [`${run}:/evidence`]);
    if (changed.some(path => path.startsWith("research-evidence/") || path.startsWith("scripts/pnwf/"))) {
      row.grade = { pass: false, error: "Reference archives or their replay utilities changed" };
    } else {
      const evaluation = docker(["volume", "create", "pnwf-cold-grade-" + randomUUID()]);
      try {
        seed(evaluation, bundle, join(run, "candidate.bundle"));
        row.grade = grade(evaluation, join(run, "grade.log"));
      } finally { docker(["volume", "rm", evaluation]); }
    }
  } else row.grade = { pass: false, error: "No candidate commit" };
  writeJson(join(run, "result.json"), row);
  rows.push(row);
  writeJson(join(root, "matrix.json"), { seal, baseline, rows });
  console.log("RESULT", arm, head, row.accounting, row.grade.pass, execution.natural);
  if (accounting.unresolvedRequests || (paid && !row.evidence?.usageQualified)) break;
}
