// COG-6 provider availability probe. Test-owned, outside the repository.
// One minimal model turn; counts against the campaign budget. No product path, no scored condition.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const HOME = "F:/Codex_Work_Space/Palimpsest/.cog6-probe/home";
const OUT = "F:/Codex_Work_Space/Palimpsest/.cog6-probe";
const UNIT = "cog6-probe";

function detectDshBin() {
  for (const line of (process.env.PATH ?? "").split(";")) {
    if (line.trim() === "") continue;
    for (const candidate of [
      join(line, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js"),
      join(line, "..", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js"),
    ]) {
      if (existsSync(candidate)) return resolve(candidate);
    }
  }
  const shared = join(homedir(), ".dsh", "profiles", "node_modules", "@deepseek-ai", "dsh");
  const pkg = join(shared, "package.json");
  if (existsSync(pkg)) {
    const parsed = JSON.parse(readFileSync(pkg, "utf8"));
    const bin = typeof parsed?.bin === "object" && parsed.bin !== null ? parsed.bin.dsh : parsed?.bin;
    if (typeof bin === "string") return resolve(join(shared, bin));
  }
  throw new Error("dsh not found");
}

function apiKey() {
  const yaml = readFileSync(join(homedir(), ".dsh", ".credentials.yaml"), "utf8");
  const match = yaml.match(/^\s{2}DEEPSEEK_API_KEY:\s*(\S+)\s*$/m);
  if (match === null) throw new Error("no DEEPSEEK_API_KEY");
  return match[1];
}

rmSync(HOME, { recursive: true, force: true });
mkdirSync(join(HOME, "profiles"), { recursive: true });
const sharedSource = join(homedir(), ".dsh", "profiles", "node_modules");
try {
  spawnSync(process.platform === "win32" ? "cmd" : "ln", process.platform === "win32" ? ["/c", "mklink", "/J", join(HOME, "profiles", "node_modules"), sharedSource] : ["-s", sharedSource, join(HOME, "profiles", "node_modules")], { stdio: "ignore" });
} catch {
  throw new Error("could not link the shared DSH profile modules");
}

const dir = join(HOME, "profiles", UNIT);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "package.json"), JSON.stringify({
  name: `dsh-profile-${UNIT}`,
  private: true,
  dependencies: {},
  dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-headless"], patchReload: "startup" } },
}, null, 2));
writeFileSync(join(dir, "cordis.patch.yml"), `
- id: bash-sandbox
  disabled: true
- insert:
    - id: bash-local
      name: '@deepseek-ai/dsh-bash-local'
  config:
    timeoutMs: 60000
- id: pwsh-sandbox
  disabled: true
- id: tool-bash
  disabled: false
- id: tool-pwsh
  disabled: true
- id: tool-subagent
  disabled: true
- id: tool-subagent-fork
  disabled: true
- id: tool-subagent-control
  disabled: true
- id: tool-subagent-list-agents
  disabled: true
- id: tool-workflow
  disabled: true
- id: subagent
  disabled: true
- id: subagent-spawn-in-process
  disabled: true
- id: subagent-fork-in-process
  disabled: true
- id: workflow-ptc
  disabled: true
`);

const workDir = join(OUT, "work");
mkdirSync(workDir, { recursive: true });
const env = { ...process.env, DEEPSEEK_API_KEY: apiKey(), DSH_HOME: HOME, runtime_HOME: HOME };
delete env.PALIMPSEST_DSH_BIN;
const started = Date.now();
const child = spawn(process.execPath, [detectDshBin(), "--profile", UNIT, "Reply with the single token PROBE_OK and nothing else."], { cwd: workDir, env, stdio: ["ignore", "pipe", "pipe"] });
let stdout = "";
let stderr = "";
child.stdout.on("data", (c) => { stdout += c; });
child.stderr.on("data", (c) => { stderr += c; });
const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 120000);
const exit = await new Promise((resolvePromise) => child.on("exit", (code, signal) => resolvePromise({ code, signal })));
clearTimeout(timer);
const ms = Date.now() - started;
const files = [];
function walk(p) {
  if (!existsSync(p)) return;
  for (const entry of readdirSync(p, { withFileTypes: true })) {
    const full = join(p, entry.name);
    if (entry.isDirectory()) walk(full);
    else files.push(full);
  }
}
walk(join(HOME, "sessions"));
writeFileSync(join(OUT, "probe-result.json"), JSON.stringify({
  at: new Date().toISOString(),
  exit,
  ms,
  stdoutTail: stdout.slice(-4000),
  stderrTail: stderr.slice(-4000),
  sessionFiles: files.map((f) => ({ path: f, bytes: readFileSync(f).length })),
}, null, 2));
console.log(JSON.stringify({ exit, ms, stdoutTail: stdout.slice(-1500), stderrTail: stderr.slice(-1500), sessionFiles: files.length }));
