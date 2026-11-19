// Controlled reference submissions and deliberately incorrect alternatives, with no model provider.
import assert from "node:assert/strict";
import {mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {tasks, commit, git, grade, image, prepare} from "./run.mjs";

const root = mkdtempSync(join(tmpdir(), "desk-controls-"));
const report = {schema: "transit-desk-controls/v1", image, providerRequests: 0, cases: []};
try {
  for (const id of tasks) {
    const world = join(root, id);
    const basis = prepare(id, world);
    const baseline = grade(id, world, basis);
    assert(!baseline.automatedPass);
    const referenceDir = fileURLToPath(new URL("./reference/" + id + "/", import.meta.url));
    for (const path of readdirSync(referenceDir)) {
      writeFileSync(join(world, path), readFileSync(join(referenceDir, path), "utf8").replaceAll("\r\n", "\n"));
    }
    const candidate = commit(world, "Submit reference " + id);
    const reference = grade(id, world, candidate);
    assert(reference.automatedPass, JSON.stringify(reference));
    let rejected;
    if (id === "public-discovery") {
      const path = join(world, "evidence.json");
      const data = JSON.parse(readFileSync(path));
      data.claims[0].sources = ["missing-original"];
      writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
      rejected = "claimReferences";
    } else if (id === "public-brief") {
      const path = join(world, "evidence.json");
      const data = JSON.parse(readFileSync(path));
      data.terminalLeg.sources = ["riders-sept12"];
      writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
      rejected = "terminal";
    } else if (id === "departure-board") {
      const path = join(world, "board.mjs");
      writeFileSync(path, readFileSync(path, "utf8").replace("departureMs < until", "departureMs <= until"));
      rejected = "left included, right excluded";
    } else {
      const path = join(world, "model.mjs");
      writeFileSync(path, readFileSync(path, "utf8").replace("minShiftKw: shift}", "minShiftKw: shift * night.slotHours}"));
      rejected = "rated";
    }
    const counterexample = grade(id, world, commit(world, "Submit incorrect alternative " + id));
    assert(!counterexample.automatedPass && counterexample.checks[rejected] === false);
    // Grading the old SHA while a newer commit is checked out returns identical evidence.
    assert.deepEqual(grade(id, world, candidate), reference);
    assert.equal(git(world, "status", "--porcelain").trim(), "");
    report.cases.push({id, baseline, reference, counterexample});
  }
  console.log(JSON.stringify(report, null, 2));
} finally { rmSync(root, {recursive: true, force: true}); }
