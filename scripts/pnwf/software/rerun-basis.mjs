import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { throws } from "node:assert/strict";
import { assert, changed, clean, configureGit, digest, git, head, sha } from "../energy/contract.mjs";
import { CORRECTION, CORRECTION_PATH } from "./contract.mjs";

export const PUBLISHED_PAIR = "research-evidence/pnwf-software/2026-11-10/live-pair-150630";

const runGit = (repo, args, input) => execFileSync("git", ["-c", "safe.directory=*", "-C", repo, ...args],
  { input, maxBuffer: 16 * 1024 * 1024, timeout: 30000, stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"] });

export function restoreOriginalBasis({ archive, source, output, previous, first }) {
  assert(sha(previous.basis) && sha(first.artifactCommit), "ORIGINAL_T2_SHA_INVALID");
  const bundle = join(archive, previous.bundle.name);
  assert(digest(readFileSync(bundle)) === previous.bundle.sha256, "ORIGINAL_T2_BUNDLE_DRIFT");
  mkdirSync(source, { recursive: true });
  git(source, "init", "-q");
  git(source, "bundle", "verify", bundle);
  const listing = git(source, "bundle", "list-heads", bundle).split(/\r?\n/u);
  const ref = listing.find(line => line.startsWith(previous.artifactCommit + " "))?.split(" ")[1];
  assert(ref?.startsWith("refs/heads/"), "ORIGINAL_T2_ARTIFACT_REF_MISSING");
  git(source, "fetch", "--no-tags", bundle, ref);
  assert(git(source, "rev-parse", "FETCH_HEAD") === previous.artifactCommit &&
    git(source, "rev-parse", previous.basis + "^") === first.artifactCommit, "ORIGINAL_T2_BASIS_NOT_BOUND");
  const files = changed(source, first.artifactCommit, previous.basis);
  assert(files.length === 1 && files[0] === CORRECTION_PATH &&
    digest(runGit(source, ["cat-file", "blob", previous.basis + ":" + CORRECTION_PATH])) === digest(CORRECTION), "ORIGINAL_T2_CORRECTION_DRIFT");
  const pack = runGit(source, ["pack-objects", "--stdout", "--revs"], previous.basis + "\n");
  mkdirSync(output);
  git(output, "init", "-q");
  configureGit(output, { name: "Software migration trial", email: "software-trial@example.invalid" });
  runGit(output, ["index-pack", "--stdin"], pack);
  git(output, "checkout", "-q", "-B", "master", previous.basis);
  assert(clean(output) && head(output) === previous.basis && !existsSync(join(output, ".git", "objects", "info", "alternates")),
    "ORIGINAL_T2_CHECKOUT_NOT_CLEAN");
  throws(() => runGit(output, ["cat-file", "-e", previous.artifactCommit + "^{commit}"]));
  return { basis: previous.basis, tree: git(output, "rev-parse", "HEAD^{tree}"), first: first.artifactCommit,
    correctionSha256: digest(CORRECTION), rejectedCandidatePresent: false };
}
