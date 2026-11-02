/**
 * PC1-V1 — build the local release candidate and its SHA-256 manifest.
 *
 * The RC is a local tarball + manifest. It is never published and no registry is touched. The
 * manifest is computed from the staged BYTES. `sourceCommit` is the executable Code Freeze; a later
 * docs-only HEAD is recorded separately so an evidence commit cannot be mistaken for a runtime
 * change.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";

const REPO = join(import.meta.dirname, "..", "..");
const OUT = join(REPO, "dist-rc");
const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));
const VERSION = `${String(pkg.version)}-pc1v1`;
const STAGE = join(OUT, `palimpsest-${VERSION}`);
const TARBALL = join(OUT, `palimpsest-${VERSION}.tar.gz`);

function arg(name, fallback) {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found === undefined ? fallback : found.slice(`--${name}=`.length);
}

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

const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim();
const headTree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: REPO, encoding: "utf8" }).trim();
const codeFreeze = arg("code-freeze", head);
const codeFreezeTree = execFileSync("git", ["rev-parse", `${codeFreeze}^{tree}`], { cwd: REPO, encoding: "utf8" }).trim();

rmSync(OUT, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });
const include = [
  "dist",
  "docs/programs/pc1v1",
  "docs/engineering/PC1V1-ROOT-CAUSE-AND-OUTCOME-PLAN.md",
  "docs/programs/pc1",
  "research-evidence/pc1v1",
  "scripts/pc1v1",
  "scripts/pc1",
  "scripts/c6r",
  "examples/pc1",
  "README.md",
  "package.json",
];
for (const entry of include) {
  const from = join(REPO, entry);
  if (!existsSync(from)) continue;
  cpSync(from, join(STAGE, entry), { recursive: true });
}
const status = execFileSync(
  "git",
  ["status", "--porcelain", "--untracked-files=no", "--", "src", "test", "tools", "architecture", "scripts", "package.json", "README.md"],
  { cwd: REPO, encoding: "utf8" },
).trim();
const files = walk(STAGE).map((path) => ({ path, bytes: statSync(join(STAGE, path)).size, sha256: sha256(join(STAGE, path)) }));
const manifest = {
  schema: "pc1v1-rc-manifest/v1",
  version: VERSION,
  sourceCommit: codeFreeze,
  sourceTree: codeFreezeTree,
  head,
  headTree,
  dirty: status !== "",
  generatedAt: new Date().toISOString(),
  files,
  fileCount: files.length,
  note: "Local PC1-V1 release candidate. Not published. The manifest covers staged bytes, not repository history. sourceCommit is the executable Code Freeze.",
};
writeFileSync(join(STAGE, "MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`);
execFileSync("tar", ["-czf", `palimpsest-${VERSION}.tar.gz`, `palimpsest-${VERSION}`], { cwd: OUT, stdio: "inherit" });
const tarballDigest = sha256(TARBALL);
writeFileSync(`${TARBALL}.sha256`, `${tarballDigest}  ${TARBALL.split(/[\\/]/u).pop()}\n`);
writeFileSync(
  join(REPO, "research-evidence", "pc1v1", "rc.json"),
  `${JSON.stringify(
    {
      schema: "pc1v1-rc/v1",
      version: VERSION,
      sourceCommit: codeFreeze,
      sourceTree: codeFreezeTree,
      head,
      headTree,
      dirty: status !== "",
      tarball: TARBALL,
      tarballDigest,
      fileCount: files.length,
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
);
console.log(JSON.stringify({ version: VERSION, sourceCommit: codeFreeze, sourceTree: codeFreezeTree, head, dirty: status !== "", stage: STAGE, tarball: TARBALL, tarballDigest, files: files.length }, null, 2));
