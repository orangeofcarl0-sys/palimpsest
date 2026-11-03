/**
 * Diagnostic probe: run ONE real Windows DSH worker through the shipped worker port, with the
 * deterministic Messages stand-in. It is not a capability result by itself; it answers whether the
 * Windows read-fence/pre-create boundary admits the worker in this deployment shape.
 */
import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const REPO = resolve(import.meta.dirname, "..", "..");
const ROOT = join(homedir(), "lhape", "win-probe");
const WORLD = join(ROOT, "repo");
const STATE = join(ROOT, "state");
const HOME = join(ROOT, "home");
const PROFILE = "lhape-win";
const PROFILE_DIR = join(HOME, "profiles", PROFILE);
const DSH_HOME = join(homedir(), ".dsh");
const DSH_BIN = join(execFileSync("npm", ["root", "-g"], { encoding: "utf8", shell: true }).trim(), "@deepseek-ai", "dsh", "lib", "bin.js");

rmSync(ROOT, { recursive: true, force: true });
mkdirSync(join(WORLD, "sources"), { recursive: true });
mkdirSync(STATE, { recursive: true });
mkdirSync(PROFILE_DIR, { recursive: true });
writeFileSync(join(WORLD, "sources", "sites.md"), "# sites\n\nsite A min -12 C, width 1200 mm.\n");
writeFileSync(join(WORLD, "README.md"), "# probe\n");
mkdirSync(join(WORLD, ".palimpsest", "worlds", "retained-baseline"), { recursive: true });
writeFileSync(join(WORLD, ".palimpsest", "worlds", "retained-baseline", "README.md"), "inactive world retained for sibling coverage\n");
git(WORLD, ["init", "-q"]);
git(WORLD, ["add", "-A"]);
git(WORLD, ["-c", "user.email=p@p.p", "-c", "user.name=p", "commit", "-qm", "base"]);
const head = git(WORLD, ["rev-parse", "HEAD"]);

const STANDARD = {
  statement: "stay in scope and leave the artifact",
  clauses: [{ kind: "scope_respected" }],
  derivedFrom: ["probe"],
  confirmed: true,
  notes: [],
};
const { installProduct, trustedDefaultPolicy } = await import(pathToFileURL(join(REPO, "dist", "src", "product.js")).href);
const { makeWorkDelegationService } = await import(pathToFileURL(join(REPO, "dist", "src", "interaction", "work_delegation.js")).href);
const { dshSubprocessWorkWorkerPort } = await import(pathToFileURL(join(REPO, "dist", "src", "deployment", "work_worker.js")).href);

const installed = installProduct(
  { tools: { register: () => () => undefined } },
  {
    projectId: "winprobe",
    repository: WORLD,
    stateDir: STATE,
    execution: "worktree",
    policy: trustedDefaultPolicy({ allowed_commands: [] }),
    toolProfile: "normal",
    standard: STANDARD,
    advanced: { concurrency: 2 },
  },
);
installed.controller.start({
  projectId: "winprobe",
  goal: "write one artifact",
  headCommit: head,
  tasks: [
    {
      task_id: "t1",
      objective: "Write deliverables/probe.md from sources/sites.md.",
      depends_on: [],
      write_paths: ["deliverables/probe.md"],
      required_artifacts: ["deliverables/probe.md"],
    },
  ],
});

const nodeModules = join(HOME, "profiles", "node_modules");
mkdirSync(nodeModules, { recursive: true });
cpSync(join(REPO, "host", "dsh"), join(nodeModules, "palimpsest-dsh-host"), { recursive: true });
cpSync(join(REPO, "host", "deployment"), join(nodeModules, "palimpsest-host-deployment"), { recursive: true });
try {
  execFileSync("cmd", ["/c", "mklink", "/J", join(nodeModules, "@deepseek-ai"), join(DSH_HOME, "profiles", "node_modules", "@deepseek-ai")], { stdio: "ignore" });
} catch {
  cpSync(join(DSH_HOME, "profiles", "node_modules", "@deepseek-ai"), join(nodeModules, "@deepseek-ai"), { recursive: true });
}
writeFileSync(
  join(PROFILE_DIR, "package.json"),
  `${JSON.stringify({ name: `dsh-profile-${PROFILE}`, private: true, dependencies: {}, dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "palimpsest-dsh-host"], patchReload: "startup" } } }, null, 2)}\n`,
);
writeFileSync(
  join(PROFILE_DIR, "cordis.patch.yml"),
  [
    "- id: llm-deepseek",
    "  config:",
    "    baseURL: http://127.0.0.1:18083",
    "    apiKeyEnv: LHAPE_MOCK_KEY",
    "- id: llm-pi-ai",
    "  disabled: true",
    "- id: agent-default-model",
    "  config:",
    "    provider: deepseek-official",
    "    model: deepseek-flash",
    "- id: approval",
    "  config:",
    "    policy: never",
    "- id: permission",
    "  config:",
    "    presets:",
    "      read-only:",
    "        sandbox: read-only",
    "        approval: never",
    "      workspace-write:",
    "        sandbox: workspace-write",
    "        approval: never",
    "      danger-full-access:",
    "        sandbox: danger-full-access",
    "        approval: never",
    "    defaultPreset: workspace-write",
    "- id: sandbox-policy",
    "  config:",
    "    mode: workspace-write",
    `    workspaceRoot: '${WORLD.replace(/\\/gu, "/")}'`,
    "- id: session-title-llm",
    "  disabled: true",
    "- id: tool-web",
    "  disabled: true",
    "- id: palimpsest-tools",
    "  config:",
    `    palimpsestEntry: '${join(REPO, "dist", "src", "advanced.js").replace(/\\/gu, "/")}'`,
    `    deploymentProfile: '${join(PROFILE_DIR, "deployment.json").replace(/\\/gu, "/")}'`,
    "    serve: false",
    "    openDashboard: false",
    "",
  ].join("\n"),
);
writeFileSync(
  join(PROFILE_DIR, "deployment.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      profileId: PROFILE,
      projectId: "winprobe",
      localPeer: "probe",
      repository: WORLD.replace(/\\/gu, "/"),
      execution: "worktree",
      concurrency: 2,
      policy: { allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] },
      standard: { statement: STANDARD.statement },
      transport: { namespace: PROFILE, databasePath: join(STATE, "transport.sqlite").replace(/\\/gu, "/") },
      databases: {
        orchestration: join(STATE, "palimpsest.sqlite").replace(/\\/gu, "/"),
        ordarium: join(STATE, "ordarium.sqlite").replace(/\\/gu, "/"),
        projectJournal: join(STATE, "journal.sqlite").replace(/\\/gu, "/"),
      },
      reasoning: {},
    },
    null,
    2,
  )}\n`,
);

const scripts = {
  scripts: [
    {
      match: "Your task: Write deliverables/probe.md",
      turns: [
        {
          tool_calls: [
            {
              id: "write",
              name: "run_code",
              input: {
                description: "write the probe artifact",
                code: [
                  'await tools.pwsh({ command: "New-Item -ItemType Directory -Force -Path deliverables | Out-Null", description: "prepare deliverable directory" });',
                  'await tools.write({ file_path: "deliverables/probe.md", content: "# probe\\n\\nsite A min -12 C, width 1200 mm.\\n" });',
                  'return "written";',
                ].join("\n"),
              },
            },
          ],
        },
        {
          tool_calls: [
            {
              id: "commit",
              name: "run_code",
              input: {
                description: "commit the probe artifact",
                code: 'return await tools.pwsh({ command: "git add -A; git -c user.email=p@p.p -c user.name=p commit -qm probe", description: "commit the artifact" });',
              },
            },
          ],
        },
        {
          tool_calls: [
            {
              id: "result",
              name: "run_code",
              input: {
                description: "report the worker outcome",
                code: 'return await tools.palimpsest_worker_result({ kind: "READY_FOR_SETTLEMENT", summary: "wrote probe.md" });',
              },
            },
          ],
        },
        { text: "PROBE_DONE" },
      ],
    },
  ],
};
writeFileSync(join(ROOT, "mock-scripts.json"), `${JSON.stringify(scripts, null, 2)}\n`);
const mock = spawn(process.execPath, [join(REPO, "scripts", "lhape", "mock_llm.mjs")], {
  env: { ...process.env, LHAPE_MOCK_PORT: "18083", LHAPE_MOCK_KEY: "lhape-mock-key", LHAPE_MOCK_SCRIPT: join(ROOT, "mock-scripts.json"), LHAPE_MOCK_LOG: join(ROOT, "mock.jsonl") },
  stdio: "ignore",
});
await new Promise((resolve) => setTimeout(resolve, 500));

/** The fence is qualified against rc.5; install that exact seam in a run-owned root. */
const SEAM_ROOT = join(ROOT, "seam");
mkdirSync(SEAM_ROOT, { recursive: true });
execFileSync(
  "npm",
  ["install", "--prefix", SEAM_ROOT, "@deepseek-ai/dsh-win32-process@0.2.1-rc.5", "--no-save", "--no-package-lock"],
  { stdio: "inherit", shell: true },
);

const TMP = join(ROOT, "tmp");
mkdirSync(TMP, { recursive: true });
process.env.TMP = TMP;
process.env.TEMP = TMP;
process.env.TMPDIR = TMP;
process.env.DSH_HOME = HOME;
process.env.PALIMPSEST_DSH_ROOT = SEAM_ROOT;
process.env.PALIMPSEST_DSH_BIN = DSH_BIN;
process.env.PALIMPSEST_HOST_CAPACITY_ROOT = join(ROOT, "capacity");
process.env.LHAPE_MOCK_KEY = "lhape-mock-key";
process.env.LHAPE_REAL_DSH_BIN = DSH_BIN;
process.env.LHAPE_WORKER_LOG_DIR = join(ROOT, "worker-logs");
const wrapper = join(REPO, "scripts", "lhape", "worker_tee.mjs");

const service = makeWorkDelegationService({
  controller: installed.controller,
  workerFor: () => dshSubprocessWorkWorkerPort({ dshBin: wrapper, profile: PROFILE, timeoutMs: 180_000 }),
});
const started = await service.start({ expectedTaskId: "t1" });
console.log("STARTED", JSON.stringify(started));
let view;
for (let i = 0; i < 240; i += 1) {
  view = await service.followup({ jobId: started.jobId });
  if (view.phase === "FINISHED" || view.phase === "HOST_ERROR") break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}
console.log("VIEW", JSON.stringify(view));
console.log("TASKS", JSON.stringify(installed.controller.status().tasks));
console.log("ATTEMPTS", JSON.stringify(installed.controller.status().attempts));
mock.kill();
await installed.dispose();
process.exit(view?.phase === "FINISHED" ? 0 : 1);

function git(cwd, args) {
  return execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();
}
