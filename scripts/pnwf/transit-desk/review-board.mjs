// Supplementary business review: run submitted test files even when the frozen score rejects their layout.
import assert from "node:assert/strict";
import {execFileSync, spawnSync} from "node:child_process";
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {join, resolve} from "node:path";
import {tmpdir} from "node:os";
import {git, image} from "./run.mjs";
import {readJson, writeJson} from "../energy/contract.mjs";

const dir = resolve(process.argv[2]), r = readJson(join(dir, "result.json"));
assert.equal(r.task, "departure-board");
const draft = !r.candidate && existsSync(join(dir, "draft.json")) ? readJson(join(dir, "draft.json")) : null;
const sha = r.candidate ?? draft?.diagnostic;
assert(sha, "No submitted or observed working version");
const temp = mkdtempSync(join(tmpdir(), "board-layout-"));
try {
  const store = join(temp, "store"), world = join(temp, "case");
  mkdirSync(store);
  mkdirSync(world);
  git(store, "init", "-q");
  git(store, "fetch", "-q", join(dir, draft ? "working-draft.bundle" : "world.bundle"), "+refs/heads/*:refs/heads/*");
  const materialize = (rev, path, dest = path) => writeFileSync(join(world, dest),
    execFileSync("git", ["-C", store, "cat-file", "blob", rev + ":" + path]));
  const paths = git(store, "ls-tree", sha, "--name-only").trim().split("\n")
    .filter(p => /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.(?:mjs|json)$/.test(p));
  for (const p of paths) materialize(sha, p);
  materialize(r.basis, "board.test.mjs", "frozen-original.test.mjs");
  function test(files) {
    const run = spawnSync("docker", ["run", "--pull=never", "--rm", "--network=none", "--read-only", "--cap-drop=ALL",
      "--security-opt=no-new-privileges", "--pids-limit=64", "--memory=256m", "--user=1001:1001", "--tmpfs=/tmp",
      "--mount", "type=bind,src=" + world + ",dst=/case,readonly", "-w", "/case", "--entrypoint=/usr/bin/timeout", image,
      "-k", "2", "20", "node", "--test", "--test-reporter=tap", ...files], {encoding: "utf8", timeout: 45000});
    if (run.error) throw run.error;
    assert([0, 1].includes(run.status), run.stderr);
    return {exit: run.status, cases: run.stdout.split(/\r?\n/).filter(s => /^(?:not )?ok \d+ - /.test(s))};
  }
  const suites = paths.filter(p => p.endsWith(".test.mjs"));
  const originalTestOnCandidate = test(["frozen-original.test.mjs"]);
  const submittedTestsOnCandidate = test(suites);
  materialize(r.basis, "board.mjs");
  const submittedTestsOnBasis = test(suites);
  const record = {sha, source: draft ? "working-draft" : "commit", basis: r.basis, image, suites, originalTestOnCandidate,
    submittedTestsOnCandidate, submittedTestsOnBasis};
  const path = join(dir, "board-review.json");
  if (process.argv[3] === "--verify") assert.deepEqual(record, JSON.parse(readFileSync(path)));
  else writeJson(path, record);
  console.log(JSON.stringify(record));
} finally { rmSync(temp, {recursive: true, force: true}); }
