import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { digest, git, readJson, writeJson } from "./energy/contract.mjs";

// Commands and input paths come from the host's review of the four committed handovers.
// Run each against its submitted bytes, then change the single distinguishing field in a copy.
const [archivePath, planPath, outputPath] = process.argv.slice(2);
const archive = resolve(archivePath);
const matrix = readJson(join(archive, "matrix.json"));
const plans = readJson(resolve(planPath));
assert.deepEqual(Object.keys(plans).sort(), matrix.cases.map(c => c.label).sort());
const results = [];
for (const {label} of matrix.cases) {
  const source = join(archive, label);
  const result = readJson(join(source, "result.json"));
  const {command, terminal} = plans[label];
  const world = mkdtempSync(join(tmpdir(), "night-replay-"));
  try {
    git(world, "init", "-q");
    git(world, "fetch", "-q", join(source, "project.bundle"), "HEAD");
    git(world, "-c", "core.autocrlf=false", "checkout", "-q", "--detach", result.head);
    assert.equal(git(world, "rev-parse", "HEAD"), result.head);
    const samples = [];
    let terminalComparison;
    for (const variant of ["submitted", "flipped"]) {
      let mutation;
      if (variant === "flipped") {
        if (!terminal) break;
        assert.match(terminal, /^(?:[\w.-]+\/)*[\w.-]+$/);
        assert(!terminal.split("/").includes(".."));
        const bytes = execFileSync("git", ["-C", world, "show", result.head + ":" + terminal]);
        const original = bytes.toString("utf8");
        const fromDesk = readFileSync(join(source, "desk/packets/terminal.tsv"));
        const eventRows = text => text.split(/\r?\n/).filter(line => /^\d\d:\d\d:\d\d\t/.test(line));
        terminalComparison = {byteIdentical: bytes.equals(fromDesk),
          sameEventRows: JSON.stringify(eventRows(original)) === JSON.stringify(eventRows(fromDesk.toString("utf8")))};
        const redraw = label.startsWith("redraw");
        const row = "22:03:17\tp17\tB\t40\treq-a\t";
        const old = row + (redraw ? "P" : "S");
        assert.equal(original.split(old).length, 2, terminal);
        const replacement = Buffer.from(original.replace(old, row + (redraw ? "S" : "P")));
        assert.equal(bytes.length, replacement.length);
        writeFileSync(join(world, terminal), replacement);
        mutation = {path: terminal, from: digest(bytes), to: digest(replacement)};
      }
      const run = spawnSync("docker", ["run", "--rm", "--network", "none", "--read-only",
        "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--user", "1001:1001",
        "--pids-limit", "128", "--memory", "256m", "--tmpfs", "/tmp", "-w", "/review",
        "--mount", "type=bind,source=" + world + ",target=/review,readonly",
        "--entrypoint", command[0], matrix.seal.image, ...command.slice(1)],
      {encoding: "utf8", timeout: 30000, maxBuffer: 1048576});
      if (run.error) throw run.error;
      assert(![125, 126, 127, null].includes(run.status), run.stderr);
      samples.push({variant, mutation, exit: run.status, stdout: run.stdout, stderr: run.stderr});
    }
    results.push({label, head: result.head, command, terminalComparison, samples});
  } finally {
    rmSync(world, {recursive: true, force: true});
  }
}
writeJson(resolve(outputPath), {image: matrix.seal.image, results});
