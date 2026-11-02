/**
 * PC1 S09 — build the local release candidate and its SHA-256 manifest.
 *
 * The RC is a tarball + manifest; it is never published and no registry is touched. The manifest is
 * computed from the staged BYTES, not from labels.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";

const REPO = join(import.meta.dirname, "..", "..");
const OUT = join(REPO, "dist-rc");
const VERSION = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")).version;
const STAGE = join(OUT, `palimpsest-${VERSION}`);
const TARBALL = join(OUT, `palimpsest-${VERSION}.tar.gz`);

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function walk(root, base = root) {
  const out = [];
  for (const entry of readdirSync(root).sort()) {
    const full = join(root, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full, base));
    else out.push(relative(base, full).replace(/\\/gu, "/"));
  }
  return out;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });
const include = [
  "dist",
  "docs/programs/pc1",
  "examples/pc1",
  "scripts/pc1",
  "scripts/c6r/staging.mjs",
  "scripts/c6r/seed_p1.mjs",
  "scripts/c6r/build_f1.mjs",
  "scripts/c6r/session_stream.mjs",
  "scripts/c6r/budget.mjs",
  "scripts/cog6",
  "README.md",
  "package.json",
];
for (const entry of include) {
  const from = join(REPO, entry);
  if (!existsSync(from)) continue;
  cpSync(from, join(STAGE, entry), { recursive: true });
}
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim();
const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: REPO, encoding: "utf8" }).trim();
const status = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: REPO, encoding: "utf8" }).trim();
const files = walk(STAGE).map((path) => ({ path, bytes: statSync(join(STAGE, path)).size, sha256: sha256(join(STAGE, path)) }));
const manifest = {
  schema: "pc1-rc-manifest/v1",
  version: VERSION,
  commit,
  tree,
  dirty: status !== "",
  generatedAt: new Date().toISOString(),
  files,
  fileCount: files.length,
  note: "Local release candidate. Not published. The manifest covers the staged bytes, not the repository history.",
};
writeFileSync(join(STAGE, "MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`);
execFileSync("tar", ["-czf", `palimpsest-${VERSION}.tar.gz`, `palimpsest-${VERSION}`], { cwd: OUT, stdio: "inherit" });
const tarballDigest = sha256(TARBALL);
writeFileSync(`${TARBALL}.sha256`, `${tarballDigest}  ${TARBALL.split(/[\\/]/u).pop()}\n`);
console.log(JSON.stringify({ version: VERSION, commit, tree, dirty: status !== "", stage: STAGE, tarball: TARBALL, tarballDigest, files: files.length }, null, 2));
