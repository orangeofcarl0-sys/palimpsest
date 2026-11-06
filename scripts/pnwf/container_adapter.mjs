/**
 * PNWF-CQ-F/G — per-session adapter that runs the principal INSIDE the qualified container.
 *
 * The outer `run_pnwf_live.mjs` gate validates the cohort, authorization, aggregate ceiling and the
 * `container` isolation record; this adapter performs ONE session in the same uid/mount namespace the
 * canary qualified:
 *
 *   · uid 1001, /workspace = the recorded world, /run/stage = the copied world+state;
 *   · the product/plugin code is mounted read-only at the exact pnpm symlink target, and
 *     `research-evidence`, `scripts`, `test` and `.git` are NOT mounted;
 *   · the provider proxy is the only network reachable service (`host.docker.internal:18091`);
 *   · the stream, state and run/budget records are written on the host for the external scorer.
 *
 * Usage: ALHS_CORE_RUN=<run> node scripts/pnwf/container_adapter.mjs --session=software
 */
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { zstdDecompressSync } from "node:zlib";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const RUN = String(process.env.ALHS_CORE_RUN ?? "");
const SESSION_ID = args.get("session") === undefined ? null : String(args.get("session"));
const IMAGE = process.env.PNWF_ISOLATION_IMAGE ?? "palimpsest-pnwf-isolation:local";
const REPO_IN_CONTAINER = process.env.PNWF_CONTAINER_REPO_PATH ?? "/f/Codex_Work_Space/Palimpsest/palimpsest-sr1";
const REPO = process.cwd();
const PROXY_PORT = Number(process.env.PNWF_PROXY_PORT ?? 18091);
if (RUN === "" || SESSION_ID === null) {
  process.stderr.write("ALHS_CORE_RUN and --session=<id> are required\n");
  process.exit(2);
}
const core = JSON.parse(readFileSync(join(RUN, "core.json"), "utf8"));
const prepared = core.sessions.find((entry) => entry.id === SESSION_ID);
if (prepared === undefined) {
  process.stderr.write(`no prepared session "${SESSION_ID}"\n`);
  process.exit(2);
}
const OUT = join(RUN, "out", SESSION_ID);
mkdirSync(OUT, { recursive: true });
const HOME = String(prepared.home);
const STAGE = join(RUN, "stages", SESSION_ID);
const WORLD = String(prepared.world);
const STATE = String(prepared.state);

function docker(argv, options = {}) {
  return execFileSync("docker", argv, {
    encoding: "utf8",
    stdio: options.capture === false ? "inherit" : ["ignore", "pipe", "pipe"],
    maxBuffer: 32 * 1024 * 1024,
  });
}

function winPath(path) {
  return resolve(path).replaceAll("/", "\\");
}

function streamUsage(file) {
  const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
  try {
    const bytes = readFileSync(file);
    const starts = [];
    for (let i = 0; i + 3 < bytes.length; i += 1) {
      if (bytes[i] === MAGIC[0] && bytes[i + 1] === MAGIC[1] && bytes[i + 2] === MAGIC[2] && bytes[i + 3] === MAGIC[3]) starts.push(i);
    }
    let total = 0;
    for (let k = 0; k < starts.length; k += 1) {
      const end = k + 1 < starts.length ? starts[k + 1] : bytes.length;
      for (const line of zstdDecompressSync(bytes.subarray(starts[k], end)).toString("utf8").split("\n")) {
        if (line === "") continue;
        const event = JSON.parse(line);
        if (event.type === "assistant/message" && event.data?.usage) total += Number(event.data.usage.totalTokens ?? 0);
      }
    }
    return total;
  } catch {
    return 0;
  }
}

function sessionStreams() {
  const root = join(HOME, "sessions");
  if (!existsSync(root)) return [];
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name.endsWith(".zstd")) found.push(path);
    }
  };
  walk(root);
  return found;
}

// 1. Linux deployment: the recorded state is mounted at /run/stage.
const deployment = JSON.parse(readFileSync(prepared.deployment, "utf8"));
const liner = (value) => String(value).replaceAll(String(WORLD).replaceAll("\\", "/"), "/run/stage/world").replaceAll(String(STATE).replaceAll("\\", "/"), "/run/stage/state");
deployment.repository = "/run/stage/world";
deployment.transport.databasePath = "/run/stage/state/transport.sqlite";
for (const key of Object.keys(deployment.databases)) deployment.databases[key] = `/run/stage/state/${String(deployment.databases[key]).split(/[\\/]/u).pop()}`;
void liner;
writeFileSync(join(STAGE, "deployment-linux.json"), `${JSON.stringify(deployment, null, 2)}\n`);
// PNWF-CQ-F: make an old copied attempt world portable too. The relative path is identical on the
// host and under /run/stage, so this is safe for both.
const attemptWorlds = join(WORLD, ".palimpsest", "worlds");
if (existsSync(attemptWorlds)) {
  for (const entry of readdirSync(attemptWorlds, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const alternates = join(attemptWorlds, entry.name, ".git", "objects", "info", "alternates");
    if (existsSync(alternates)) writeFileSync(alternates, "../../../../../.git/objects\n");
  }
}

// 2. The profile: base bundle + the Palimpsest host plugin; the model goes through the local proxy.
const PROFILE = join(HOME, "profiles", "alhs-core");
mkdirSync(PROFILE, { recursive: true });
mkdirSync(join(HOME, "profiles", "node_modules"), { recursive: true });
writeFileSync(
  join(PROFILE, "package.json"),
  `${JSON.stringify({
    name: "dsh-profile-alhs-core",
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "palimpsest-dsh-host"], patchReload: "startup" } },
  })}\n`,
);
writeFileSync(
  join(HOME, "settings.yaml"),
  "agent-default-model:\n  provider: deepseek-official\n  model: deepseek-flash\n",
);
writeFileSync(
  join(PROFILE, "cordis.patch.yml"),
  [
    "- id: llm-deepseek",
    "  config:",
    `    baseURL: http://host.docker.internal:${PROXY_PORT}`,
    "    apiKeyEnv: CQ_PROXY_KEY",
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
    "      read-only: { sandbox: read-only, approval: never }",
    "      workspace-write: { sandbox: workspace-write, approval: never }",
    "      danger-full-access: { sandbox: danger-full-access, approval: never }",
    "    defaultPreset: workspace-write",
    "- id: sandbox-policy",
    "  config:",
    "    mode: workspace-write",
    "    workspaceRoot: '/run/stage/world'",
    "- id: session-title-llm",
    "  disabled: true",
    "- id: tool-web",
    "  disabled: true",
    "- id: palimpsest-tools",
    "  config:",
    `    palimpsestEntry: '${REPO_IN_CONTAINER}/dist/src/advanced.js'`,
    "    deploymentProfile: '/run/stage/deployment-linux.json'",
    "    serve: false",
    "    openDashboard: false",
    "",
  ].join("\n"),
);

// 3. Host plugin packages are small; copy them to the mounted profile. The global DSH tree is
// symlinked inside the container (a copy would be hundreds of MB on a Windows bind mount).
rmSync(join(HOME, "profiles", "node_modules", "palimpsest-dsh-host"), { recursive: true, force: true });
rmSync(join(HOME, "profiles", "node_modules", "palimpsest-host-deployment"), { recursive: true, force: true });
cpSync(join(REPO, "host", "dsh"), join(HOME, "profiles", "node_modules", "palimpsest-dsh-host"), { recursive: true });
cpSync(join(REPO, "host", "deployment"), join(HOME, "profiles", "node_modules", "palimpsest-host-deployment"), { recursive: true });
docker([
  "run",
  "--rm",
  "--user",
  "0:0",
  "-v",
  `${winPath(HOME)}:/h`,
  "alpine:latest",
  "sh",
  "-c",
  "mkdir -p /h/profiles/node_modules; ln -sfn /usr/local/lib/node_modules/@deepseek-ai /h/profiles/node_modules/@deepseek-ai",
]);

// 4. Run ONE principal session in the qualified container.
const prompt = readFileSync(prepared.promptPath, "utf8");
const logPath = join(OUT, "run.log");
const errPath = join(OUT, "run.err");
const outFd = openSync(logPath, "w");
const errFd = openSync(errPath, "w");
const startedAt = new Date().toISOString();
const containerName = `pnwf-cq-${SESSION_ID}-${Date.now().toString(36)}`;
const softCeiling = Number(prepared.maxTokens) - Number(prepared.reserveTokens);
const baselineStreams = new Set(sessionStreams());
const newStreams = () => sessionStreams().filter((file) => !baselineStreams.has(file));
let killedBy = null;
let observedTokens = 0;
const child = spawn(
  "docker",
  [
    "run",
    "--rm",
    "--name",
    containerName,
    "--user",
    "1001:1001",
    "--network",
    "bridge",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "-e",
    "HOME=/home/principal",
    "-e",
    "DSH_HOME=/home/principal/.dsh",
    "-e",
    "CQ_PROXY_KEY=c6r-placeholder-not-a-credential",
    "-e",
    `PNWF_PROMPT=${prompt}`,
    "-v",
    `${winPath(join(REPO, "dist"))}:${REPO_IN_CONTAINER}/dist:ro`,
    "-v",
    `${winPath(join(REPO, "host"))}:${REPO_IN_CONTAINER}/host:ro`,
    "-v",
    `${winPath(join(REPO, "node_modules"))}:${REPO_IN_CONTAINER}/node_modules:ro`,
    "-v",
    `${winPath(join(REPO, "node_modules"))}:/mnt/host/f/Codex_Work_Space/Palimpsest/palimpsest-sr1/node_modules:ro`,
    "-v",
    `${winPath(STAGE)}:/run/stage`,
    "-v",
    `${winPath(HOME)}:/home/principal/.dsh`,
    IMAGE,
    "sh",
    "-c",
    'git config --global --add safe.directory /run/stage/world; cd /run/stage/world; node /usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js --profile alhs-core --once "$PNWF_PROMPT"',
  ],
  { stdio: ["ignore", outFd, errFd] },
);
const timeout = setTimeout(() => {
  killedBy = "wall_clock";
  try {
    execFileSync("docker", ["kill", containerName], { stdio: "ignore" });
  } catch {
    /* already gone */
  }
}, Number(prepared.killAfterMs ?? 3_600_000));
const budgetTimer = setInterval(() => {
  observedTokens = newStreams().reduce((sum, file) => sum + streamUsage(file), 0);
  if (observedTokens >= softCeiling && killedBy === null) {
    killedBy = "budget";
    try {
      execFileSync("docker", ["kill", containerName], { stdio: "ignore" });
    } catch {
      /* already gone */
    }
  }
}, 10_000);
const exitCode = await new Promise((resolve) => child.on("close", (code) => resolve(code ?? 1)));
clearTimeout(timeout);
clearInterval(budgetTimer);

// 5. Records the external scorer reads; nothing here is injected into the next session.
const streams = newStreams();
const totalTokens = streams.reduce((sum, file) => sum + streamUsage(file), 0);
const git = (cwd, argv) => {
  try {
    return execFileSync("git", ["-C", cwd, ...argv], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }).trim();
  } catch {
    return null;
  }
};
const endedAt = new Date().toISOString();
writeFileSync(
  join(OUT, "run.json"),
  `${JSON.stringify(
    {
      schema: "alhs-core-session-run/v1",
      cohortId: core.cohortId,
      sessionId: SESSION_ID,
      condition: prepared.condition,
      world: WORLD,
      home: HOME,
      profile: "alhs-core",
      principalRuntime: "container",
      startedAt,
      endedAt,
      exitCode,
      signal: null,
      error: null,
      killedAt: killedBy === null ? null : endedAt,
      killPid: killedBy === null ? null : containerName,
      killedBy,
      stopped: killedBy !== null || exitCode !== 0,
      usage: {
        schema: "aps-budget-ledger/v1",
        observedAt: endedAt,
        maxTokens: prepared.maxTokens,
        reserveTokens: prepared.reserveTokens,
        softCeiling,
        totalTokens,
        sessionFiles: streams.length,
        state: killedBy === null && exitCode === 0 ? "ENDED" : "STOPPED",
      },
      maxTokens: prepared.maxTokens,
      reserveTokens: prepared.reserveTokens,
      softStopAt: softCeiling,
      killAtTokens: null,
      natural: exitCode === 0 && killedBy === null,
    },
    null,
    2,
  )}\n`,
);
writeFileSync(
  join(OUT, "budget.json"),
  `${JSON.stringify(
    {
      schema: "aps-budget-ledger/v1",
      observedAt: endedAt,
      maxTokens: prepared.maxTokens,
      reserveTokens: prepared.reserveTokens,
      softCeiling,
      totalTokens,
      sessionFiles: streams.length,
      state: killedBy === null && exitCode === 0 ? "ENDED" : "STOPPED",
    },
    null,
    2,
  )}\n`,
);
writeFileSync(
  join(OUT, "snapshot.json"),
  `${JSON.stringify(
    {
      schema: "psvr-c-session-snapshot/v1",
      sessionId: SESSION_ID,
      condition: prepared.condition,
      endedAt,
      world: WORLD,
      head: git(WORLD, ["rev-parse", "HEAD"]),
      subject: git(WORLD, ["log", "-1", "--format=%s"]),
      status: git(WORLD, ["status", "--porcelain"]),
      log: git(WORLD, ["log", "--format=%h %s", "-20"])?.split(/\r?\n/u) ?? [],
    },
    null,
    2,
  )}\n`,
);
copyFileSync(prepared.promptPath, join(OUT, "prompt.txt"));
process.exit(exitCode === 0 ? 0 : 5);
