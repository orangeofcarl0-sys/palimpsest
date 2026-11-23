/** Assemble only task-selected, digest-bound inputs for the zero-paid qualification. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { digest, writeJson } from "../../energy/contract.mjs";

const repo = resolve(import.meta.dirname, "../../../..");
const revision = "0e671e0688d709eb88c7e5167e9bc0bfb3ae8d0f";
const transit = "fixtures/psvr/transit-desk/";
const history = "research-evidence/pnwf-software/2026-11-23/handover-rejection-resume/";
const equipment = "research-evidence/pnwf-local-assets/2026-11-22/equipment-review/inputs/";
const analysis = history + "evolution-worksets/self-improvement-review.md";

const sources = {
  maintenance: [analysis, history + "work-manager/resident-upgrade.json"],
  "public-brief": [transit + "public-brief/archive/metro-june06.md", transit + "public-brief/archive/airport-july02.md"],
  "departure-board": [transit + "departure-board/feed.json"],
  "depot-charge": [transit + "depot-charge/night.json"],
  "local-equipment": [equipment + "accepted.xlsx", equipment + "gap.json"],
};

export function stageEvidenceWorkset(directory, task, basis) {
  assert(Object.hasOwn(sources, task), "EVIDENCE_TASK_UNKNOWN");
  assert((task === "local-equipment" ? /^[a-f0-9]{64}$/u : /^[a-f0-9]{40}$/u).test(basis), "EVIDENCE_BASIS_INVALID");
  const originals = sources[task].map(path => {
    const bytes = path === analysis ? readFileSync(join(repo, path)) :
      execFileSync("git", ["-C", repo, "cat-file", "blob", `${revision}:${path}`], { windowsHide: true });
    const sha256 = digest(bytes);
    if (path === analysis) assert.equal(sha256, "632808deb6d845b17c850c0c913cb95b449bcc4cbbf4980a9436f3bdff5deeba",
      "MAINTENANCE_ANALYSIS_CHANGED");
    if (path === equipment + "accepted.xlsx") assert.equal(sha256, basis, "EQUIPMENT_WORKBOOK_BASIS_CHANGED");
    return { source: { file: basename(path), path, sha256, ...(path === analysis ? {} : { revision }) }, bytes };
  });
  const manifest = { schema: "pnwf-task-evidence-workset/v1", task, basis, sources: originals.map(item => item.source) };
  assert.equal(new Set(manifest.sources.map(source => source.file)).size, originals.length, "EVIDENCE_FILE_COLLISION");
  mkdirSync(directory);
  for (const { source, bytes } of originals) writeFileSync(join(directory, source.file), bytes);
  writeJson(join(directory, "sources.json"), manifest);
  return manifest;
}

export function verifyEvidenceWorkset(directory, expected) {
  const found = JSON.parse(readFileSync(join(directory, "sources.json")));
  assert.deepEqual(found, expected, "EVIDENCE_INDEX_CHANGED");
  assert.deepEqual(readdirSync(directory).sort(), ["sources.json", ...expected.sources.map(source => source.file)].sort(),
    "EVIDENCE_FILE_SET_CHANGED");
  for (const source of expected.sources) {
    assert.equal(digest(readFileSync(join(directory, source.file))), source.sha256, "EVIDENCE_BYTES_CHANGED");
  }
  return digest(readFileSync(join(directory, "sources.json")));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [task, basis, output] = process.argv.slice(2);
  assert(task && basis && output, "Usage: evidence-workset.mjs <task> <baseline-SHA-or-workbook-digest> <new-directory>");
  const manifest = stageEvidenceWorkset(resolve(output), task, basis);
  console.log(JSON.stringify({ ...manifest, sha256: verifyEvidenceWorkset(output, manifest) }, null, 2));
}
