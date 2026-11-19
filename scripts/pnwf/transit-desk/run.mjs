import {execFileSync, spawnSync} from "node:child_process";
import {cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {isDeepStrictEqual as equal} from "node:util";
import {boardCases, chargeCases, checkBrief, checkCharge, checkDiscovery} from "./checks.mjs";

const fixtures = fileURLToPath(new URL("../../../fixtures/psvr/transit-desk/", import.meta.url));
export const cases = ["public-brief", "departure-board", "depot-charge"];
export const tasks = [...cases, "public-discovery"];
export const image = "node@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d";
const dates = {GIT_AUTHOR_DATE: "2025-07-03T00:00:00Z", GIT_COMMITTER_DATE: "2025-07-03T00:00:00Z"};
const commitEnv = {...process.env, ...dates, GIT_NO_REPLACE_OBJECTS: "1", GIT_AUTHOR_NAME: "Transit Desk Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "Transit Desk Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid"};
export function git(world, ...args) {
  return execFileSync("git", ["-c", "core.autocrlf=false", "-c", "core.fileMode=false", "-c", "core.hooksPath=/dev/null", "-C", world, ...args],
    {encoding: "utf8", env: commitEnv, stdio: ["ignore", "pipe", "pipe"]});
}
export function commit(world, message) {
  git(world, "add", ".");
  git(world, "-c", "commit.gpgSign=false", "commit", "-qm", message);
  return git(world, "rev-parse", "HEAD").trim();
}
function files(root, prefix = "") {
  return readdirSync(join(root, prefix), {withFileTypes: true}).flatMap(entry => {
    const path = prefix + entry.name;
    return entry.isDirectory() ? files(root, path + "/") : [path];
  }).sort();
}
export function prepare(id, world) {
  if (!tasks.includes(id)) throw new Error("Unknown task: " + id);
  mkdirSync(world); // Refuse to overlay an existing project.
  const source = join(fixtures, id);
  for (const path of files(source)) {
    const dest = join(world, path);
    mkdirSync(dirname(dest), {recursive: true});
    writeFileSync(dest, readFileSync(join(source, path), "utf8").replaceAll("\r\n", "\n"));
  }
  git(world, "init", "-q", "--initial-branch=main", "--object-format=sha1");
  return commit(world, "Freeze " + id + " user task");
}
function container(snapshot, args, input = "") {
  const call = spawnSync("docker", ["run", "--pull=never", "--rm", "-i", "--network=none", "--read-only", "--cap-drop=ALL",
    "--security-opt=no-new-privileges", "--pids-limit=64", "--memory=256m", "--user=1001:1001", "--tmpfs=/tmp",
    "--mount", "type=bind,src=" + snapshot + ",dst=/case,readonly", "-w", "/case", "--entrypoint=/usr/bin/timeout",
    image, "-k", "2", "20", "node", ...args],
    {input, encoding: "utf8", timeout: 45_000, maxBuffer: 1024 * 1024});
  if (call.error || call.status === null || call.status >= 125) throw call.error ?? new Error(call.stderr);
  return call;
}
function probe(snapshot, module, fn, tests) {
  const script = "import {readFileSync} from 'node:fs'; import {" + fn + "} from './" + module +
    "'; const args=JSON.parse(readFileSync(0,'utf8')); console.log('TRANSIT_RESULT '+JSON.stringify(args.map(a=>" + fn + "(...a))));";
  const call = container(snapshot, ["--input-type=module", "-e", script], JSON.stringify(tests.map(test => test.args)));
  if (call.status !== 0) return [];
  const line = call.stdout.split(/\r?\n/).findLast(line => line.startsWith("TRANSIT_RESULT "));
  if (!line) return [];
  try { const rows = JSON.parse(line.slice("TRANSIT_RESULT ".length)); return Array.isArray(rows) ? rows : []; } catch { return []; }
}

export function grade(id, world, sha) {
  if (!tasks.includes(id) || !/^[0-9a-f]{40}$/.test(sha)) throw new Error("Expected task and full candidate SHA");
  const root = mkdtempSync(join(tmpdir(), "transit-grade-"));
  try {
    const seeded = join(root, "seed");
    const basis = prepare(id, seeded);
    if (git(world, "cat-file", "-t", sha).trim() !== "commit") throw new Error("Expected Git commit");
    git(world, "merge-base", "--is-ancestor", basis, sha);
    const snapshot = join(root, "snapshot");
    mkdirSync(snapshot);
    const original = files(join(fixtures, id));
    const checks = {};
    const editorial = id === "public-brief" || id === "public-discovery";
    const docs = editorial ? ["evidence.json", "brief.md"] : ["HANDOVER.md"];
    const tracked = git(world, "ls-tree", "-r", "-z", sha).split("\0").filter(Boolean);
    for (const record of tracked) {
      const tab = record.indexOf("\t");
      const [mode, , oid] = record.slice(0, tab).split(" ");
      const path = record.slice(tab + 1);
      // Export only named inputs, requested documents and top-level JS modules.
      if (!original.includes(path) && !docs.includes(path) && !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.mjs$/.test(path)) continue;
      if (!["100644", "100755"].includes(mode)) continue;
      const dest = join(snapshot, path);
      mkdirSync(dirname(dest), {recursive: true});
      writeFileSync(dest, git(world, "cat-file", "blob", oid));
    }
    checks.originalInputs = original.filter(path => id !== "departure-board" || path !== "board.mjs").every(path =>
      git(world, "ls-tree", basis, "--", path) === git(world, "ls-tree", sha, "--", path));
    const nonempty = path => existsSync(join(snapshot, path)) && !!readFileSync(join(snapshot, path), "utf8").trim();
    for (const name of docs) checks[name] = nonempty(name);
    if (editorial) {
      let evidence = {};
      try { evidence = JSON.parse(readFileSync(join(snapshot, "evidence.json"))); } catch {}
      Object.assign(checks, id === "public-brief" ? checkBrief(evidence ?? {}) : checkDiscovery(evidence ?? {}));
    } else if (id === "departure-board") {
      const tests = boardCases(JSON.parse(readFileSync(join(seeded, "feed.json"))));
      const rows = nonempty("board.mjs") ? probe(snapshot, "board.mjs", "departures", tests) : [];
      tests.forEach((test, i) => { checks[test.name] = equal(rows[i], test.expected); });
      const regressions = readdirSync(snapshot).filter(p => p.endsWith(".test.mjs") && p !== "board.test.mjs");
      checks.testsPass = regressions.length > 0 && container(snapshot, ["--test", "board.test.mjs", ...regressions]).status === 0;
      if (checks.testsPass) cpSync(join(seeded, "board.mjs"), join(snapshot, "board.mjs"));
      checks.regressionCatchesOriginal = checks.testsPass && container(snapshot, ["--test", ...regressions]).status === 1;
    } else {
      const tests = chargeCases(JSON.parse(readFileSync(join(seeded, "night.json"))));
      const rows = nonempty("model.mjs") ? probe(snapshot, "model.mjs", "plan", tests) : [];
      tests.forEach((test, i) => { checks[test.name] = checkCharge(test, rows[i]); });
    }
    return {id, basis, sha, checks, automatedPass: Object.values(checks).every(Boolean), editorialReview: "REQUIRED"};
  } finally { rmSync(root, {recursive: true, force: true}); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, id, world, sha] = process.argv.slice(2);
  if (action === "prepare") console.log(prepare(id, resolve(world)));
  else if (action === "grade") {
    const result = grade(id, resolve(world), sha);
    console.log(JSON.stringify(result, null, 2));
    if (!result.automatedPass) process.exitCode = 1;
  } else throw new Error("Use prepare TASK NEW_DIRECTORY or grade TASK WORLD FULL_SHA");
}
