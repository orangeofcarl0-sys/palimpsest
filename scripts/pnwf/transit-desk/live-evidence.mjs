// Copy only stopped sessions. Recompute frozen checks and request/tool attribution without a provider.
import assert from "node:assert/strict";
import {copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {tmpdir} from "node:os";
import {DatabaseSync} from "node:sqlite";
import {digest, readJson, writeJson} from "../energy/contract.mjs";
import {PAID_MODE} from "../bounded_provider.mjs";
import {analyze} from "../task-selection/evidence.mjs";
import {readStream} from "../analyze_energy_trajectory.mjs";
import {commit, git, grade} from "./run.mjs";
import {stoppedEvidence} from "./stopped-evidence.mjs";

function copy(from, to, path) {
  const dest = join(to, path);
  assert(lstatSync(join(from, path)).isFile(), "Expected a regular evidence file: " + path);
  mkdirSync(dirname(dest), {recursive: true});
  copyFileSync(join(from, path), dest);
}
function rawFiles(root) {
  return readdirSync(root, {recursive: true, withFileTypes: true}).filter(e => e.isFile()).map(e => join(e.parentPath, e.name));
}
function checkArchive(dir) {
  for (const path of rawFiles(dir)) {
    const bytes = readFileSync(path);
    const contents = path.endsWith(".zstd") ? JSON.stringify(readStream(path, digest(bytes))) : bytes.toString();
    assert(!/(?:oc_sk_|sk-proj-|github_pat_|ghp_)[\w.-]{32,}/u.test(contents), "Credential-shaped value in " + path);
  }
}
function capture(source, dest, name) {
  const matrix = readJson(join(source, "matrix.json"));
  const {basis} = matrix.started.find(s => s.name === name);
  const record = matrix.completed.find(s => s.name === name);
  assert(record, "Capture requires a stopped session");
  const task = name.slice(0, -2);
  const run = join(source, name), dir = join(dest, name), world = join(run, "stages/REVIEW/world");
  mkdirSync(dir);
  if (record.unknown) {
    const wal = join(run, "request-ledger.sqlite-wal");
    assert(!existsSync(wal) || readFileSync(wal).length === 0, "Stopped ledger must be quiescent");
    copy(run, dir, "request-ledger.sqlite");
  }
  const out = "out/REVIEW";
  for (const path of ["prompt.txt", "cohort.json", ...["run.json", "budget.json", "run.log", "run.err", "qualification.json", "worker-receipts.json",
    "request-accounting.json", "request-observations.jsonl"].map(f => out + "/" + f)]) {
    if (existsSync(join(run, path))) copy(run, dir, path);
  }
  for (const entry of readdirSync(run, {recursive: true})) {
    const path = entry.replaceAll("\\", "/");
    if (/^(?:runtime-REVIEW\/sessions\/|out\/REVIEW\/worker-[^/]+\/home\/sessions\/).*\.jsonl\.zstd$/.test(path) ||
        /^out\/REVIEW\/worker-[^/]+\/result\.bundle$/.test(path)) copy(run, dir, path);
  }
  const temp = mkdtempSync(join(tmpdir(), "transit-refs-"));
  try {
    git(temp, "init", "-q");
    git(temp, "fetch", "-q", world, "HEAD:refs/heads/observed", "+refs/heads/*:refs/heads/candidate/*");
    const receipts = join(dir, out, "worker-receipts.json");
    for (const row of existsSync(receipts) ? readJson(receipts) : []) {
      if (row.outcome !== "READY_FOR_SETTLEMENT" || !row.result) continue;
      const ref = "refs/heads/worker/" + row.attemptId;
      git(temp, "fetch", "-q", join(dir, out, "worker-" + row.attemptId, "result.bundle"), "refs/heads/pnwf-worker-result:" + ref);
      assert.equal(git(temp, "rev-parse", ref).trim(), row.result);
    }
    const tips = [...new Set(git(temp, "for-each-ref", "--format=%(objectname)", "refs/heads").trim().split("\n"))]
      .filter(s => s !== basis && git(temp, "merge-base", basis, s).trim() === basis);
    const maximal = tips.filter(s => !tips.some(other => s !== other && git(temp, "merge-base", other, s).trim() === s));
    const candidate = maximal.length === 1 ? maximal[0] : null;
    git(temp, "bundle", "create", join(dir, "world.bundle"), "--all");
    const status = git(world, "status", "--porcelain", "--untracked-files=all");
    if (candidate) {
      for (const path of ["brief.md", "evidence.json", "HANDOVER.md", "model.mjs", "board.mjs"]) {
        if (!/^100(?:644|755) blob /.test(git(temp, "ls-tree", candidate, "--", path))) continue;
        mkdirSync(join(dir, "submitted"), {recursive: true});
        writeFileSync(join(dir, "submitted", path), git(temp, "show", candidate + ":" + path));
      }
    }
    writeJson(join(dir, "result.json"), {...record, task, basis, candidate, maximal, status,
      commits: candidate ? git(temp, "log", "--reverse", "--format=%H %s", basis + ".." + candidate).trim().split("\n") : [],
      changed: candidate ? git(temp, "diff", "--name-status", basis, candidate).trim().split("\n") : [],
      grade: grade(task, temp, candidate ?? basis)});
  } finally { rmSync(temp, {recursive: true, force: true}); }
}
function captureDraft(source, dest, name) {
  const dir = join(dest, name), result = readJson(join(dir, "result.json"));
  if (!result.status.trim()) return;
  const world = join(source, name, "stages/REVIEW/world");
  assert.equal(git(world, "rev-parse", "HEAD").trim(), result.workingHead);
  assert.equal(git(world, "status", "--porcelain", "--untracked-files=all"), result.status);
  const temp = mkdtempSync(join(tmpdir(), "transit-draft-"));
  try {
    git(temp, "init", "-q");
    git(temp, "fetch", "-q", join(dir, "world.bundle"), "+refs/heads/*:refs/remotes/archive/*");
    git(temp, "checkout", "-q", "--detach", result.workingHead);
    const pending = git(world, "ls-files", "-z", "-m", "-o", "--exclude-standard").split("\0").filter(Boolean);
    const paths = pending.filter(p => /^(?:brief\.md|evidence\.json|HANDOVER\.md|[\w.-]+\.mjs)$/.test(p));
    if (!paths.length) return;
    for (const path of paths) {
      if (existsSync(join(world, path))) {
        copy(world, temp, path);
        copy(world, join(dir, "working-draft"), path);
      } else rmSync(join(temp, path), {force: true});
    }
    const diagnostic = commit(temp, "Offline inspection of uncommitted user-task files");
    git(temp, "branch", "offline-draft", diagnostic);
    git(temp, "bundle", "create", join(dir, "working-draft.bundle"), "refs/heads/offline-draft");
    writeJson(join(dir, "draft.json"), {source: "HOST_SNAPSHOT_AFTER_EXIT", workingHead: result.workingHead, diagnostic,
      paths, otherPendingPaths: pending.filter(p => !paths.includes(p)), grade: grade(result.task, temp, diagnostic)});
  } finally { rmSync(temp, {recursive: true, force: true}); }
}
function replay(dir, verify) {
  const temp = mkdtempSync(join(tmpdir(), "transit-trajectory-"));
  try {
    cpSync(dir, temp, {recursive: true});
    const result = readJson(join(dir, "result.json"));
    const world = join(temp, "world");
    mkdirSync(world);
    git(world, "init", "-q");
    git(world, "fetch", "-q", join(dir, "world.bundle"), "+refs/heads/*:refs/heads/*");
    assert.deepEqual(grade(result.task, world, result.candidate ?? result.basis), result.grade);
    if (existsSync(join(dir, "draft.json"))) {
      const draft = readJson(join(dir, "draft.json"));
      git(world, "fetch", "-q", join(dir, "working-draft.bundle"), "refs/heads/offline-draft");
      assert.equal(git(world, "rev-parse", "FETCH_HEAD").trim(), draft.diagnostic);
      assert.deepEqual(grade(result.task, world, draft.diagnostic), draft.grade);
      for (const p of draft.paths.filter(p => existsSync(join(dir, "working-draft", p)))) {
        assert.equal(git(world, "show", draft.diagnostic + ":" + p), readFileSync(join(dir, "working-draft", p), "utf8"));
      }
    }
    const submitted = join(dir, "submitted");
    if (existsSync(submitted)) for (const name of readdirSync(submitted)) {
      assert.equal(readFileSync(join(submitted, name), "utf8"), git(world, "show", result.candidate + ":" + name));
    }
    const accounting = readJson(join(dir, "out/REVIEW/request-accounting.json"));
    assert.equal(accounting.unresolvedRequests, result.unknown);
    assert.equal(accounting.confirmed, result.confirmed);
    if (result.unknown) {
      const db = new DatabaseSync(join(dir, "request-ledger.sqlite"), {readOnly: true});
      try {
        const rows = db.prepare("SELECT id,state,actual,reason,usage FROM requests ORDER BY rowid").all();
        assert.deepEqual(rows.map(r => ({...r, usage: r.usage && JSON.parse(r.usage)})),
          accounting.requests.map(({id, state, actual, reason, usage}) => ({id, state, actual, reason, usage})));
      } finally { db.close(); }
    }
    const trajectory = result.unknown ? stoppedEvidence(temp, accounting) : analyze(temp, PAID_MODE);
    assert.equal(trajectory.requests, result.requests);
    const path = join(dir, "trajectory.json");
    if (verify) assert.deepEqual(JSON.parse(JSON.stringify(trajectory)), readJson(path));
    else writeJson(path, trajectory);
    console.log(result.name, result.candidate, result.grade.automatedPass, trajectory.requests, trajectory.confirmed);
  } finally { rmSync(temp, {recursive: true, force: true}); }
}
const [source, output, name] = process.argv.slice(2);
const root = resolve(output);
if (source === "--verify") {
  for (const entry of readdirSync(root, {withFileTypes: true}).filter(e => e.isDirectory())) {
    const dir = join(root, entry.name);
    checkArchive(dir);
    replay(dir, true);
  }
} else if (process.argv[5] === "--draft-only") {
  captureDraft(resolve(source), root, name);
} else if (source === "--recount") {
  replay(join(root, name), false);
  checkArchive(join(root, name));
} else {
  capture(resolve(source), root, name);
  captureDraft(resolve(source), root, name);
  const dir = join(root, name);
  replay(dir, false);
  checkArchive(dir);
}
