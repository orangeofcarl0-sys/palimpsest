/**
 * PC1 S10 — SHA-256 manifests from COMMITTED bytes.
 *
 * It reads blobs with `git show <commit>:<path>`, so a manifest describes the commit rather than a
 * working tree that may have moved. The output is written outside the hashed path set.
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
const label = arg("label", "pc1");
const out = resolve(arg("out", join(REPO, "research-evidence", "pc1", `manifest-${label}.json`)));
const paths = process.argv.filter((value) => value.startsWith("--path=")).map((value) => value.slice("--path=".length));
if (paths.length === 0) {
  process.stderr.write("usage: node manifest.mjs --label=<label> --out=<file> [--path=<tracked path>]...\n");
  process.exit(2);
}
const listed = execFileSync("git", ["-c", "core.quotePath=false", "ls-tree", "-r", "-z", "--name-only", commit, "--", ...paths], { cwd: REPO })
  .toString("utf8")
  .split("\u0000")
  .filter((value) => value !== "");
const files = listed
  .filter((path) => resolve(REPO, path) !== out)
  .map((path) => {
    const bytes = execFileSync("git", ["-c", "core.quotePath=false", "show", `${commit}:${path}`], { cwd: REPO, maxBuffer: 256 * 1024 * 1024 });
    return { path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  });
const tree = execFileSync("git", ["rev-parse", `${commit}^{tree}`], { cwd: REPO, encoding: "utf8" }).trim();
const manifest = {
  schema: "pc1-sha256-manifest/v1",
  label,
  commit,
  tree,
  generatedAt: new Date().toISOString(),
  paths,
  fileCount: files.length,
  files,
  note: "Hashes are computed from committed blobs (`git show <commit>:<path>`), not from a working tree. This manifest does not include itself.",
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ label, commit, tree, fileCount: files.length, out }, null, 2));
