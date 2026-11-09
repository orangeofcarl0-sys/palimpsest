/** One launch policy for qualification and execution. Qualification observes the running instance. */
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function docker(args, options = {}) {
  return execFileSync("docker", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 60000, ...options }).trim();
}
export function containerRepositoryPath(repository) {
  const path = resolve(repository).replaceAll("\\", "/");
  return /^[A-Za-z]:/u.test(path) ? "/" + path[0].toLowerCase() + path.slice(2) : "/product";
}
export function createPrincipal({ repository, stage, home, image, preflight, layout = "recorded", acceptance }) {
  const imageId = docker(["image", "inspect", image, "--format", "{{.Id}}"]);
  const name = `pnwf-qualified-${randomUUID()}`;
  const harness = `${name}-harness`;
  const repoPath = layout === "recorded" ? containerRepositoryPath(repository) : "/product";
  const runtimeParts = layout === "native" ? [] : layout === "recorded"
    ? ["dist", "host", "node_modules"] : ["dist", "node_modules", "package.json", "runtime"];
  const mounts = [
    ...runtimeParts.map(part => ({ source: resolve(repository, part), target: `${repoPath}/${part}`, readOnly: true })),
    { source: resolve(stage), target: "/run/stage", readOnly: false },
    { source: resolve(home), target: "/home/principal/.dsh", readOnly: false },
    { source: resolve(preflight), target: "/qualification/world_preflight.mjs", readOnly: true },
    ...(acceptance === undefined ? [] : [{ source: resolve(acceptance), target: "/run/stage/world/acceptance.json", readOnly: true }]),
  ];
  if (layout === "recorded" && /^[A-Za-z]:/u.test(resolve(repository))) mounts.push({ source: resolve(repository, "node_modules"), target: `/mnt/host${repoPath}/node_modules`, readOnly: true });
  docker(["volume", "create", harness]);
  try {
    // This root helper has no network and only the two task-owned mounts. No owner credentials.
    docker(["run", "--rm", "--network", "none", "--user", "0:0",
      "-v", `${harness}:/harness`, "-v", `${resolve(home)}:/h`, imageId, "node", "-e",
      `const f=require('fs');f.mkdirSync('/harness',{recursive:true});f.writeFileSync('/harness/private-canary','PNWF_PRIVATE');f.chmodSync('/harness',0o700);f.mkdirSync('/h/profiles/node_modules',{recursive:true});f.symlinkSync('/usr/local/lib/node_modules/@deepseek-ai','/h/profiles/node_modules/@deepseek-ai','dir');`]);
    const args = ["create", "--name", name, "--user", "1001:1001", "--network", "none", "--read-only",
      "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "256",
      "--tmpfs", "/tmp:rw,exec,nosuid,nodev", "--tmpfs", "/home/principal:rw,nosuid,nodev,uid=1001,gid=1001",
      "-e", "HOME=/home/principal", "-e", "DSH_HOME=/home/principal/.dsh", "-e", "CQ_PROXY_KEY=nonbillable-stdio-gateway",
      "-e", `PNWF_PRODUCT_ENTRY=${repoPath}/dist/src/product.js`,
      ...mounts.flatMap(m => ["-v", `${m.source}:${m.target}${m.readOnly ? ":ro" : ""}`]),
      "-v", `${harness}:/harness:ro`, imageId, "node", "-e", "setInterval(()=>{},1000000)"];
    const id = docker(args);
    docker(["start", id]);
    docker(["exec", "--user", "1001:1001", id, "git", "config", "--global", "--add", "safe.directory", "*"]);
    return { id, name, imageId, harness, repoPath, mounts, layout,
      cleanup: () => { try { docker(["rm", "-f", id]); } finally { docker(["volume", "rm", harness]); } } };
  } catch (error) {
    try { docker(["rm", "-f", name]); } catch { /* creation may have failed */ }
    docker(["volume", "rm", harness]);
    throw error;
  }
}

function canary() {
  const fs = require("node:fs");
  const cp = require("node:child_process");
  const results = [];
  function check(name, allow, action) {
    let allowed = false;
    try { action(); allowed = true; } catch { /* denied */ }
    results.push({ name, expected: allow ? "ALLOW" : "DENIED", status: allowed ? "ALLOW" : "DENIED" });
  }
  check("principal_uid", true, () => { if (process.getuid() !== 1001) throw Error("wrong uid"); });
  check("native_read_task", true, () => fs.readFileSync("/run/stage/world/README.md"));
  check("native_shell_task", true, () => cp.execFileSync("sh", ["-c", "cat /run/stage/world/README.md"], { stdio: "ignore" }));
  check("write_task", true, () => { const p = "/run/stage/world/.pnwf-write-canary"; const fd = fs.openSync(p, "wx"); fs.closeSync(fd); fs.unlinkSync(p); });
  check("git_task", true, () => cp.execFileSync("git", ["-c", "safe.directory=*", "-C", "/run/stage/world", "status", "--porcelain"], { stdio: "ignore" }));
  check("node_build_fixture", true, () => {
    const p = "/tmp/pnwf-build.mjs";
    fs.writeFileSync(p, "import fs from 'node:fs'; fs.readFileSync('/run/stage/world/package.json');");
    cp.execFileSync("node", ["--check", p], { stdio: "ignore" });
    cp.execFileSync("node", [p], { stdio: "ignore" }); fs.unlinkSync(p);
  });
  check("dsh_version", true, () => { const v = cp.execFileSync("node", ["/usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js", "--version"], { encoding: "utf8" }); if (!v.includes("0.2.1-rc.5")) throw Error("DSH drift"); });
  check("dsh_native_addon", true, () => require("/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/node-addon-require-builtin"));
  check("native_read_harness", false, () => fs.readFileSync("/harness/private-canary"));
  check("native_shell_harness", false, () => cp.execFileSync("sh", ["-c", "cat /harness/private-canary"], { stdio: "ignore" }));
  check("indirect_proc_harness", false, () => fs.readFileSync("/proc/1/root/harness/private-canary"));
  check("indirect_parent_harness", false, () => fs.readFileSync("/run/stage/world/../../../harness/private-canary"));
  check("rootfs_readonly", false, () => fs.writeFileSync("/etc/pnwf-canary", "no"));
  check("no_docker_socket", true, () => { if (fs.existsSync("/var/run/docker.sock")) throw Error("host control socket mounted"); });
  check("no_external_evaluator", true, () => {
    if (fs.existsSync("/product/scripts") || fs.existsSync("/run/stage/evaluator")) throw Error("evaluator mounted");
  });
  check("no_owner_credential", true, () => { if (fs.existsSync("/home/principal/.dsh/.credentials.yaml")) throw Error("credential present"); });
  check("no_provider_credential_env", true, () => {
    if (Object.keys(process.env).some(k => /API_KEY|AUTH_TOKEN|ACCESS_TOKEN|SECRET/iu.test(k) && k !== "CQ_PROXY_KEY")) throw Error("credential environment present");
  });
  check("no_external_routes", true, () => {
    const routes = fs.readFileSync("/proc/net/route", "utf8").trim().split("\n").slice(1);
    if (routes.some(line => !line.startsWith("lo\t"))) throw Error("external route");
  });
  process.stdout.write(JSON.stringify(results));
}

export function qualifyPrincipal(runtime, expectedHead) {
  const inspected = JSON.parse(docker(["inspect", runtime.id]))[0];
  const host = inspected.HostConfig;
  if (inspected.Image !== runtime.imageId || inspected.Config.User !== "1001:1001" || host.NetworkMode !== "none" || !host.ReadonlyRootfs || !host.CapDrop.includes("ALL") || !host.SecurityOpt.includes("no-new-privileges")) throw new Error("ACTUAL_CONTAINER_POLICY_MISMATCH");
  const destinations = [...runtime.mounts.map(m => m.target), "/harness"];
  if (inspected.Mounts.length !== destinations.length || inspected.Mounts.some(m => !destinations.includes(m.Destination))) throw new Error("UNEXPECTED_CONTAINER_MOUNT");
  for (const mount of runtime.mounts) {
    const actual = inspected.Mounts.find(m => m.Destination === mount.target);
    if (!actual || actual.RW === mount.readOnly) throw new Error("MOUNT_ACCESS_MISMATCH");
  }
  const harnessPresent = docker(["exec", "--user", "0:0", runtime.id, "node", "-e", "process.stdout.write(require('fs').readFileSync('/harness/private-canary','utf8'))"]) === "PNWF_PRIVATE";
  const checks = JSON.parse(docker(["exec", "--user", "1001:1001", runtime.id, "node", "-e", `(${canary.toString()})()`]));
  if (!harnessPresent || checks.some(c => c.status !== c.expected)) throw new Error(`ACTUAL_ISOLATION_FAILED: ${JSON.stringify(checks)}`);
  const worlds = JSON.parse(docker(["exec", "--user", "1001:1001", "-e", `PNWF_EXPECTED_HEAD=${expectedHead}`,
    "-e", `PNWF_LAYOUT=${runtime.layout}`, runtime.id, "node", "/qualification/world_preflight.mjs"]));
  if (runtime.layout === "worker") {
    docker(["exec", "--user", "1001:1001", runtime.id, "node", "-e",
      "const f=require('fs');for(const p of ['/run/stage/state','/run/stage/deployment-linux.json','/mnt/c/Users','/product/host'])if(f.existsSync(p))throw Error('worker mount exposure '+p)"]);
  }
  const acceptance = runtime.mounts.find(mount => mount.target === "/run/stage/world/acceptance.json");
  if (acceptance) {
    const expected = createHash("sha256").update(readFileSync(acceptance.source)).digest("hex");
    const actual = docker(["exec", "--user", "1001:1001", runtime.id, "node", "-e", `const fs=require('node:fs');
const file='/run/stage/world/acceptance.json';let wrote=false;try{fs.closeSync(fs.openSync(file,'r+'));wrote=true;}catch{}
if(wrote)throw Error('acceptance write access');process.stdout.write(require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex'));`]);
    if (actual !== expected) throw new Error("ACCEPTANCE_MOUNT_DRIFT");
  }
  const descriptor = { imageId: runtime.imageId, user: inspected.Config.User, network: host.NetworkMode,
    readonlyRootfs: host.ReadonlyRootfs, capDrop: host.CapDrop, securityOpt: host.SecurityOpt,
    adapterFiles: Object.fromEntries(["container_adapter.mjs", "container_runtime.mjs", "container_bridge.mjs", "world_preflight.mjs", "bounded_provider.mjs", "execution_budget.mjs", "mock_provider.mjs", "run_pnwf_live.mjs"]
      .map(file => [file, createHash("sha256").update(readFileSync(new URL(file, import.meta.url))).digest("hex")])),
    mounts: inspected.Mounts.map(m => ({ type: m.Type, source: m.Source, destination: m.Destination, writable: m.RW })) };
  return { schema: "pnwf-actual-isolation/v2", status: "EVALUATION_ISOLATION_QUALIFIED", containerId: runtime.id,
    descriptor, descriptorDigest: createHash("sha256").update(JSON.stringify(descriptor)).digest("hex"),
    harnessPresent, externalScorerRead: true, checks, worlds, checkedAt: new Date().toISOString() };
}
