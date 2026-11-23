/** Blind source checkout, fixed installation, and genuine archived inputs. */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, parse, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { docker } from "../../container_runtime.mjs";
import { readStream } from "../../analyze_energy_trajectory.mjs";
import { digest, git, readJson, sha, writeJson } from "../../energy/contract.mjs";
import { profileFor } from "../../energy/product.mjs";

export const repo = fileURLToPath(new URL("../../../../", import.meta.url));
export const source = "07ab5aad7f77a2fd67f426c80e5215cf3f2bc6de";
export const reference = "e47b7c10141d8c20b68e554dbce64901ec4cdb1c";
export const projectId = "palimpsest-maintenance";
export const firstGoal = "维护 Palimpsest。检查近期交接运行，优先复现会影响下一位工作的问题。用实际测试和结果说明发现及修订，保留原始证据，在隔离项目中提交可复核的成果。封存输入在 evidence/。";
export const secondGoal = "接续 Palimpsest 的维护工作。交接评审有一处自动验收与人工复核不一致。根据新封存的评审原稿和既有项目记录，判断差异，验证改进并提交可复核的结果。封存输入在 evidence/。";
export const original = join(repo, "research-evidence/pnwf-software/2026-11-22/continuity-reuse");
export const replayBasis = "1444de6ce289197a1d12b0b04d2caa36c1d79355";
export const buildCommand = "node node_modules/typescript/bin/tsc -b";

const sources = [".gitignore", "LICENSE", "README.md", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml",
  "tsconfig.json", "vitest.config.ts", "architecture", "fixtures", "host", "scripts", "src", "test", "tools", "web",
  "research-evidence/pnwf-software/2026-11-19/autonomous-continuity/live/acceptance.json"];
const referencePaths = ["host/dsh/lib/direct_closeout.js", "host/dsh/lib/runner.js", "src/application/work_outcome.ts", "test/alhs_episode_convergence.test.ts"];
export const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
export const dependencyRoot = "/opt/palimpsest-dev/node_modules";
const stagedMounts = new WeakMap();
const commands = command => execFileSync("git", ["-C", repo, ...command], { timeout: 60_000, maxBuffer: 16 * 1024 * 1024 });

export function manifest(directory) {
  return readdirSync(directory, { recursive: true, withFileTypes: true }).filter(entry => !entry.isDirectory())
    .map(entry => {
      assert(entry.isFile(), `Unsupported mount entry: ${entry.name}`);
      const path = join(entry.parentPath, entry.name);
      return [path.slice(directory.length + 1).replaceAll("\\", "/"), digest(readFileSync(path))];
    }).sort(([left], [right]) => left.localeCompare(right, "en"));
}

export function verifiedArchiveDigest(directory, history, archive, path, archivedPath = path) {
  const actual = digest(readFileSync(join(directory, path)));
  const sealed = execFileSync("git", ["-c", "core.longpaths=true", "-C", repo, "cat-file", "blob", `${history}:${archive}/${archivedPath}`],
    { maxBuffer: 16 * 1024 * 1024, timeout: 20_000 });
  assert.equal(actual, digest(sealed), "SEALED_PREDECESSOR_BYTES_CHANGED: " + path);
  return actual;
}

export function makeSource(root, revision = source, extraPaths = []) {
  const paths = [...sources, ...extraPaths];
  const tar = join(root, "source.tar");
  commands(["archive", "--format=tar", `--output=${tar}`, revision, "--", ...paths]);
  const expected = commands(["ls-tree", "-r", "-z", revision, "--", ...paths]);
  const info = { source: revision, archiveSha256: digest(readFileSync(tar)), selectedTreeSha256: digest(expected), paths };
  writeJson(join(root, "source.json"), info);
  return info;
}

export function referencePatch(path, hostOnly = false) {
  const paths = hostOnly ? referencePaths.filter(file => file.startsWith("host/dsh/")) : referencePaths;
  writeFileSync(path, commands(["diff", "--binary", source, reference, "--", ...paths]));
}

export function makeEvidence(root, phase) {
  mkdirSync(root);
  if (phase === "first") {
    cpSync(join(original, "inherited.bundle"), join(root, "basis.bundle"));
    const cases = [["live", "WITHOUT"], ["live", "WITH"], ["mock", "WITHOUT"]];
    for (const [index, [stage, arm]] of cases.entries()) {
      const input = join(original, stage, arm);
      const output = join(root, `case-${index + 1}`);
      mkdirSync(output);
      const row = readJson(join(input, "result.json"));
      const stream = join(input, "trajectory", row.trajectory.stream);
      const streamSha = row.evidence.traces.find(trace => trace.role === "principal").digest;
      const events = readStream(stream, streamSha);
      cpSync(stream, join(output, "session.jsonl.zstd"));
      writeFileSync(join(output, "session.jsonl"), events.map(event => JSON.stringify(event)).join("\n") + "\n");
      for (const file of ["candidate.bundle", "request-accounting.json", "run.json", "review-committed.md"]) cpSync(join(input, file), join(output, file));
      copyDatabases(join(input, "owners"), join(output, "owners"));
    }
    const wait = join(repo, "research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-214618");
    const reference = join(root, "case-4");
    mkdirSync(reference);
    for (const file of ["candidate-and-accepted.bundle", "request-accounting.json", "request-observations.jsonl"]) cpSync(join(wait, file), join(reference, file));
    const stream = readdirSync(wait, { recursive: true }).find(path => path.endsWith(".zstd"));
    if (stream) cpSync(join(wait, stream), join(reference, "session.jsonl.zstd"));
  } else {
    const input = join(original, "../cold-closeout/live/WITHOUT");
    for (const file of ["review-committed.md", "candidate.bundle", "request-accounting.json"]) cpSync(join(input, file), join(root, file));
    const result = readJson(join(input, "result.json"));
    writeJson(join(root, "frozen-checks.json"), { candidate: result.candidate, grade: result.grade });
  }
  const entries = manifest(root);
  return { entries, sha256: digest(JSON.stringify(entries)) };
}

export function copyDatabases(from, to) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from, { recursive: true }).filter(file => file.endsWith(".sqlite"))) {
    const wal = join(from, `${name}-wal`);
    if (existsSync(wal)) assert.equal(readFileSync(wal).length, 0, `Uncheckpointed state: ${name}`);
    const target = join(to, name);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(from, name), target);
  }
}

export function makeVolume(image) {
  const volume = docker(["volume", "create", `pnwf-self-evolution-${randomUUID()}`]);
  return {
    volume, image,
    close() {
      try { docker(["volume", "rm", volume]); }
      finally {
        const staged = stagedMounts.get(this);
        if (staged) {
          for (const file of staged.files) rmSync(file, { force: true });
          rmdirSync(staged.directory);
          stagedMounts.delete(this);
        }
      }
    },
  };
}

function stageArchiveMount(world, mount) {
  if (process.platform !== "win32" || !mount.endsWith(":ro")) return mount;
  const delimiter = mount.lastIndexOf(":/");
  if (delimiter === -1) return mount;
  const source = mount.slice(0, delimiter), temp = tmpdir(), path = relative(repo, source);
  // Docker Desktop may lose the workspace drive mapping while the local temp drive is still shared.
  if (!path || path.startsWith("..") || isAbsolute(path) || parse(source).root.toLowerCase() === parse(temp).root.toLowerCase() ||
    !statSync(source, { throwIfNoEntry: false })?.isFile()) return mount;
  let staged = stagedMounts.get(world);
  if (!staged) {
    staged = { directory: mkdtempSync(join(temp, "pnwf-archive-mount-")), files: new Set() };
    stagedMounts.set(world, staged);
  }
  const bytes = readFileSync(source), sha256 = digest(bytes), file = join(staged.directory, sha256);
  if (!staged.files.has(file)) {
    writeFileSync(file, bytes, { flag: "wx" });
    staged.files.add(file);
  }
  assert.equal(digest(readFileSync(file)), sha256, "STAGED_ARCHIVE_MOUNT_CHANGED");
  return file + mount.slice(delimiter);
}

export function offline(world, command, mounts = [], { root = false, timeout = 240_000 } = {}) {
  const container = `pnwf-maintenance-offline-${randomUUID()}`;
  const result = spawnSync("docker", ["run", "--rm", "--name", container, "--network", "none", "--read-only", "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges", "--tmpfs", "/tmp:rw,exec,nosuid,nodev", "-e", "HOME=/tmp", "-e", "GIT_CONFIG_COUNT=1",
    "-e", "GIT_CONFIG_KEY_0=safe.directory", "-e", "GIT_CONFIG_VALUE_0=*", "--user", root ? "0:0" : "1001:1001",
    ...(root ? ["--cap-add", "CHOWN", "--cap-add", "DAC_OVERRIDE", "--cap-add", "FOWNER"] : []),
    "-v", `${world.volume}:/work`, ...mounts.flatMap(mount => ["-v", stageArchiveMount(world, mount)]),
    "-w", "/work", "--entrypoint", "sh", world.image, "-eu", "-c", command],
  { encoding: "utf8", timeout, maxBuffer: 16 * 1024 * 1024 });
  if (result.error) {
    spawnSync("docker", ["rm", "-f", container], { stdio: "ignore", timeout: 10_000 });
    throw result.error;
  }
  return result;
}

export function success(result) {
  assert.equal(result.status, 0, (result.stderr + "\n" + result.stdout).slice(-6000));
  return result.stdout.trim();
}

export function seedSource(world, root, info, candidateBundle) {
  const mounts = [`${join(root, "source.tar")}:/source.tar:ro`];
  if (candidateBundle) mounts.push(`${candidateBundle}:/candidate.bundle:ro`);
  const result = offline(world, [
    "tar -xf /source.tar", "git init -q -b maintenance", "git config core.autocrlf false",
    "git config user.name 'Palimpsest maintenance'", "git config user.email palimpsest-maintenance@example.invalid",
    "git add -A", "GIT_AUTHOR_DATE=2026-11-22T00:00:00Z GIT_COMMITTER_DATE=2026-11-22T00:00:00Z git commit -qm 'Seed isolated maintenance source'",
    "git branch source-basis", `ln -s ${dependencyRoot} node_modules`, "printf '\n/node_modules\n/evidence/\n' >> .git/info/exclude", "mkdir evidence",
    ...(candidateBundle ? ["git fetch -q /candidate.bundle HEAD", "git reset -q --hard FETCH_HEAD"] : []),
    "test -z \"$(git status --porcelain)\"", "chown -R 1001:1001 /work", "git rev-parse source-basis HEAD",
  ].join("\n"), mounts, { root: true });
  const [basis, head] = success(result).split(/\r?\n/u);
  assert(sha(basis) && sha(head));
  const materialized = offline(world, "git ls-tree -r -z source-basis");
  assert.equal(materialized.status, 0);
  assert.equal(digest(materialized.stdout), info.selectedTreeSha256, "SOURCE_PROJECTION_DRIFT");
  return { basis, head };
}

export function pack(world, head, directory, { maintenance = false } = {}) {
  assert(sha(head));
  mkdirSync(directory);
  const result = offline(world, [
    `test "$(git rev-parse HEAD)" = ${head}`, `test -z "$(git status --porcelain)"`,
    "test ! -e dist", buildCommand,
    "mkdir -p /artifact/runtime/dist /artifact/runtime/host /artifact/runtime/runtime /artifact/runtime/node_modules/@ordarium",
    "cp -R dist/src /artifact/runtime/dist/", "cp -R host/dsh /artifact/runtime/host/",
    ...(maintenance ? ["mkdir -p /artifact/runtime/scripts/psvr", "cp -R scripts/pnwf /artifact/runtime/scripts/",
      "cp scripts/psvr/session_attribution.mjs /artifact/runtime/scripts/psvr/"] : []),
    `for package in core host-kit ledger-sqlite testing; do cp -RL ${dependencyRoot}/@ordarium/$package /artifact/runtime/node_modules/@ordarium/; done`,
    "printf '%s\n' '{\"type\":\"module\",\"private\":true}' > /artifact/runtime/package.json",
    "tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner --mode='a=rX,u+w' -C /artifact/runtime -cf - . | gzip -n > /artifact/runtime.tar.gz",
  ].join("\n"), [`${directory}:/artifact`]);
  writeFileSync(join(directory, "build.log"), result.stdout + result.stderr);
  success(result);
  const files = manifest(join(directory, "runtime"));
  const tarSha256 = digest(readFileSync(join(directory, "runtime.tar.gz")));
  const release = { candidate: head, buildSha256: digest(JSON.stringify({ tarSha256, files })), image: world.image, tarSha256, files };
  writeJson(join(directory, "build.json"), release);
  return release;
}

export function verifyInstallation(directory, expected) {
  const release = readJson(join(directory, "build.json"));
  for (const key of ["candidate", "buildSha256", "image"]) assert.equal(release[key], expected[key], `INSTALLATION_${key}_MISMATCH`);
  const tarSha256 = digest(readFileSync(join(directory, "runtime.tar.gz")));
  const files = manifest(join(directory, "runtime"));
  assert.equal(tarSha256, release.tarSha256, "PACKAGED_BYTES_DRIFT");
  assert.equal(digest(JSON.stringify({ tarSha256, files })), expected.buildSha256, "LOADED_FILE_BYTES_DRIFT");
  return join(directory, "runtime");
}

export function deployment(path, world, state, id = projectId) {
  profileFor({ world, state, path, projectId: id, localPeer: id === projectId ? "maintenance-principal" : "grpc-migration-principal",
    standard: "Leave reproducible maintenance evidence and preserve the existing authority and accepted project state." });
  return path;
}

export function stateProbe(world, runtime, state, profile, input) {
  const program = `import fs from 'node:fs';
import {launchDeployment,loadDeploymentProfile} from '/release/dist/src/advanced.js';
const input=JSON.parse(process.argv[1]);
const p=JSON.parse(fs.readFileSync('/profile.json','utf8'));
p.repository='/work'; p.transport.databasePath='/state/transport.sqlite';
for(const key of Object.keys(p.databases))p.databases[key]='/state/'+p.databases[key].split(/[\\\\/]/u).pop();
fs.writeFileSync('/tmp/profile.json',JSON.stringify(p));
const d=launchDeployment(loadDeploymentProfile('/tmp/profile.json'));
try {
 const workspace=d.installed.application.projectWorkspace;
 if (input.start) await d.installed.controller.start({projectId:p.projectId,goal:input.goal,headCommit:input.start,tasks:[]});
 if (input.entry) {
   const old=await workspace.journal();
   if(!old.some(row=>(row.entry??row).relatedRefs?.some(ref=>ref.id===input.entry.relatedRefs[0].id))) await workspace.recordJournalEntry(input.entry);
 }
 const pulse=await workspace.pulse();
 const status=d.installed.controller.status();
 console.log('MAINTENANCE_STATE '+JSON.stringify({project:pulse.projectId,basis:pulse.basis.headCommit,revision:pulse.basis.projectRevision,
   tasks:status.tasks,head:status.directOutcome?.repositoryHead,episode:pulse.episode.conclusion?.conclusionId??null,
   journal:(await workspace.journal()).map(row=>({id:(row.entry??row).entryId,refs:(row.entry??row).relatedRefs})),
   questions:pulse.episode.readiness.unresolvedQuestions}));
} finally { await d.close(); }`;
  const result = success(offline(world, `node --input-type=module -e ${quote(program)} ${quote(JSON.stringify(input))}`,
    [`${runtime}:/release:ro`, `${state}:/state`, `${profile}:/profile.json:ro`]));
  return JSON.parse(result.split(/\r?\n/u).find(line => line.startsWith("MAINTENANCE_STATE ")).slice("MAINTENANCE_STATE ".length));
}

export function inspectedSource() {
  return git(repo, "rev-parse", `${source}^{commit}`) === source;
}
