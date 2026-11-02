/**
 * PC1-V1 — SHA-256 manifests from COMMITTED bytes, keyed by object id.
 *
 * `git show <commit>:<path>` hits the Windows path-length limit on the raw session-stream tree.
 * `git ls-tree` already resolved every path at commit time, so this reads the recorded blob OID with
 * `git cat-file blob <oid>` and never re-opens the deep path. The output is written outside the
 * hashed path set; the manifest never hashes itself.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

function arg(name, fallback) {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found === undefined ? fallback : found.slice(`--${name}=`.length);
}

const REPO = resolve(import.meta.dirname, "..", "..");
const commit = arg("commit", "HEAD");
const label = arg("label", "pc1v1");
const out = resolve(arg("out", join(REPO, "research-evidence", "pc1v1", `manifest-${label}.json`)));
const paths = process.argv.filter((value) => value.startsWith("--path=")).map((value) => value.slice("--path=".length));
if (paths.length === 0) {
  process.stderr.write("usage: node manifest.mjs --label=<label> --out=<file> [--path=<tracked path>]...\n");
  process.exit(2);
}
const treeOutput = execFileSync("git", ["ls-tree", "-r", "-z", commit, "--", ...paths], {
  cwd: REPO,
  maxBuffer: 256 * 1024 * 1024,
});
const entries = [];
for (const record of treeOutput.toString("utf8").split("\u0000")) {
  if (record === "") continue;
  const tab = record.indexOf("\t");
  if (tab < 0) continue;
  const header = record.slice(0, tab).split(" ");
  const path = record.slice(tab + 1);
  if (header.length < 3) continue;
  const type = header[1];
  const oid = header[2];
  if (type !== "blob") continue;
  entries.push({ path, oid });
}
const files = entries
  .filter((entry) => resolve(REPO, entry.path) !== out)
  .map((entry) => {
    const bytes = execFileSync("git", ["cat-file", "blob", entry.oid], { cwd: REPO, maxBuffer: 256 * 1024 * 1024 });
    return { path: entry.path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  });
const tree = execFileSync("git", ["rev-parse", `${commit}^{tree}`], { cwd: REPO, encoding: "utf8" }).trim();
const manifest = {
  schema: "pc1v1-sha256-manifest/v1",
  label,
  commit,
  tree,
  generatedAt: new Date().toISOString(),
  paths,
  fileCount: files.length,
  files,
  note: "Hashes are computed from committed blob objects by OID (path-length independent), not from a working tree. This manifest does not include itself.",
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ label, commit, tree, fileCount: files.length, out }, null, 2));
