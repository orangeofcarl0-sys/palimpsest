import assert from "node:assert/strict";
import {cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {readJson} from "../energy/contract.mjs";
import {analyze} from "../task-selection/evidence.mjs";
import {cases, git, grade} from "./run.mjs";

const archive = resolve(process.argv.at(-1));
const verifyOnly = process.argv[2] === "--verify";
const source = verifyOnly ? archive : resolve(process.argv[2]);
const summary = readJson(join(source, "summary.json"));
const expected = cases.flatMap(task => ["P", "F"].map(arm => task + "-" + arm));
assert.deepEqual(summary.sessions.map(s => s.task + "-" + s.arm), expected);
function copy(from, to, path) {
  mkdirSync(dirname(join(to, path)), {recursive: true});
  cpSync(join(from, path), join(to, path), {recursive: true, force: false, errorOnExist: true});
}
if (!verifyOnly) {
  mkdirSync(archive);
  copy(source, archive, "summary.json");
  for (const name of expected) {
    const sessionsDir = "runtime-REVIEW/sessions";
    const streams = readdirSync(join(source, name, sessionsDir), {recursive: true}).filter(p => p.endsWith(".jsonl.zstd"));
    assert.equal(streams.length, 1);
    for (const path of ["prompt.txt", "submission.bundle", join(sessionsDir, streams[0]), "out/REVIEW/run.json", "out/REVIEW/run.log",
      "out/REVIEW/request-accounting.json", "out/REVIEW/request-observations.jsonl", "out/REVIEW/qualification.json"]) {
      copy(join(source, name), join(archive, name), path);
    }
  }
}
const temp = mkdtempSync(join(tmpdir(), "transit-replay-"));
try {
  for (const s of summary.sessions) {
    const dir = s.task + "-" + s.arm;
    const run = join(temp, dir);
    cpSync(join(archive, dir), run, {recursive: true});
    const world = join(run, "world");
    mkdirSync(world);
    git(world, "init", "-q");
    git(world, "fetch", "-q", join(run, "submission.bundle"), "HEAD");
    assert.equal(git(world, "rev-parse", "FETCH_HEAD").trim(), s.sha);
    const result = grade(s.task, world, s.sha);
    assert.deepEqual(result.checks, s.checks);
    assert(result.automatedPass && s.automatedPass && result.basis === s.basis);
    assert.equal(git(world, "show", s.basis + ":TASK.md"), readFileSync(join(run, "prompt.txt"), "utf8"));
    const reference = fileURLToPath(new URL("./reference/" + s.task, import.meta.url));
    for (const path of readdirSync(reference)) {
      assert.equal(git(world, "show", s.sha + ":" + path), readFileSync(join(reference, path), "utf8").replaceAll("\r\n", "\n"));
    }
    const out = join(run, "out/REVIEW");
    const execution = readJson(join(out, "run.json"));
    assert(execution.mode === "mock" && execution.natural && execution.paidModelCalls === 0);
    const t = analyze(run, "mock");
    assert.equal(t.requests, s.mockRequests);
    assert(t.unknown === 0 && t.traces.length === 1);
    const calls = t.traces[0].calls;
    assert(calls.length === s.pairedCalls && calls.every(c => c.resultSeq !== null && c.ok && !c.refusal));
    if (s.arm === "P") {
      assert.equal(s.conclusion, "DELIVER");
      const delivery = calls.find(c => c.tool === "palimpsest_work" && c.input.intent === "DELIVER");
      assert(delivery?.reply.includes(s.sha));
    }
    assert(!existsSync(join(archive, dir, "world")));
    console.log(dir, result.sha, t.requests, "verified");
  }
} finally { rmSync(temp, {recursive: true, force: true}); }
