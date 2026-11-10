import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { assert, blob, changed, clean, commitAll, configureGit, descendant, git, sha } from "../energy/contract.mjs";

export const SCENARIO = {
  projectId: "grpc-migration-continuation",
  localPeer: "grpc-migration-principal",
  operatorNamespace: "software",
  goal: "Deliver and maintain a compatible migration of the site readings service.",
  allowedCommands: [{ executable: "node", argv_prefix: ["--test"] }],
  standard: "Verify required files, the gRPC and REST tests, and the declared write scope.",
  reason: "The owner admitted the first delivery and the dated Fleet correction as the execution basis.",
};
export const GIT_IDENTITY = { name: "Software migration Mock", email: "software-mock@example.invalid" };
export const CORRECTION_PATH = "updates/2026-11-10/fleet-default-limit.md";
export const CORRECTION = "# Fleet compatibility correction\n\nThe Fleet consumer now uses a zero or omitted StreamReadings limit to request the first three available readings in source order. The first release returned an empty stream for these requests. Positive limits, GetReading, unknown-site errors, field numbers and REST behavior stay as specified in the first release.\n";
export const REVIEW = "MIGRATION-REVIEW.md";
export const FIRST = ["proto/energy.proto", "service/wire.js", "service/grpc_server.js", "service/grpc_client.js",
  "test/server.test.js", "test/integration.test.js", "MIGRATION.md"];
export const REQUIRED = ["service/grpc_server.js", "test/integration.test.js", "MIGRATION.md"];
export const SCOPE = [...REQUIRED, "test/server.test.js"];
export const RETAINED = ["proto/energy.proto", "service/wire.js", "service/grpc_client.js", "test/rest.test.js"];
export const SCOPE_GUIDANCE = "Allowed write paths are exactly these files: " + SCOPE.join(", ") +
  ". The first three must change; the server test is optional. Keep these files byte-for-byte identical to the basis, including comments: " +
  RETAINED.join(", ") + ". If an old comment conflicts with the correction, explain the effective behavior in MIGRATION.md.";
const SEED = ["README.md", "TASK.md", "package.json", "service/data.js", "service/rest_client.js", "service/rest_server.js", "test/rest.test.js"];
export const PROMPTS = {
  T1: "Complete the gRPC migration described in TASK.md. Deliver a tested commit and end the session. StreamReadings returns one Reading per frame in source order, with zero or omitted limit returning an empty stream. Keep GetReading unary and preserve REST. Document the behavior in MIGRATION.md.",
  T2: "Apply the new Fleet compatibility note in " + CORRECTION_PATH + ". Use a separate executor in an isolated copy. Update the server, integration tests and migration notes. Server tests may also be revised. Preserve the remaining work and leave a tested commit for owner review. The accepted version stays available until approval.",
  T3: "Use the accepted version from acceptance.json. Commit only MIGRATION-REVIEW.md. Cite the complete accepted HEAD and the Fleet correction path, explain the old and new default, summarize the unchanged compatibility boundaries and report the checks you ran. Deliver the review and end the session.",
};
export const GUARDED_T2_PROMPT = PROMPTS.T2 + " " + SCOPE_GUIDANCE;

export function seedSoftware(repo, fixture) {
  for (const path of SEED) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    cpSync(join(fixture, path), join(repo, path));
  }
  writeFileSync(join(repo, ".gitignore"), ".palimpsest/\n/acceptance.json\n");
  git(repo, "init", "-q");
  configureGit(repo, GIT_IDENTITY);
  return commitAll(repo, "Seed REST migration project");
}

export function injectCorrection(repo) {
  const path = join(repo, CORRECTION_PATH);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, CORRECTION, { flag: "wx" });
  return commitAll(repo, "Record Fleet default limit correction");
}

export function checkScope(paths) {
  assert(Array.isArray(paths) && new Set(paths).size === paths.length &&
    paths.every(path => SCOPE.includes(path)) && REQUIRED.every(path => paths.includes(path)), "SOFTWARE_REVISION_SCOPE_MISMATCH");
}

export function revisionResult(repo, basis, candidate, scope = SCOPE) {
  assert(sha(basis) && sha(candidate) && candidate !== basis && descendant(repo, basis, candidate), "SOFTWARE_RESULT_BASIS_MISMATCH");
  assert(clean(repo), "SOFTWARE_RESULT_DIRTY");
  const paths = changed(repo, basis, candidate);
  assert(paths.every(path => scope.includes(path)) && REQUIRED.every(path => paths.includes(path)), "SOFTWARE_RESULT_OUTSIDE_SCOPE");
  for (const path of paths) {
    assert(git(repo, "ls-tree", candidate, "--", path).startsWith("100644 blob "), "SOFTWARE_RESULT_NOT_REGULAR");
  }
  for (const path of RETAINED) assert(blob(repo, basis, path) === blob(repo, candidate, path), "SOFTWARE_COMPATIBILITY_BLOB_CHANGED");
  return paths;
}

export function snapshot(repo, commit, output) {
  assert(sha(commit), "SOFTWARE_SNAPSHOT_SHA_REQUIRED");
  mkdirSync(output);
  for (const entry of git(repo, "ls-tree", "-rz", "--full-tree", commit).split("\0").filter(Boolean)) {
    const match = /^100644 blob [0-9a-f]{40}\t(.+)$/u.exec(entry);
    assert(match && [...SEED, ...FIRST, CORRECTION_PATH, REVIEW, ".gitignore"].includes(match[1]), "SOFTWARE_SNAPSHOT_ENTRY_REFUSED");
    const path = join(output, match[1]);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, execFileSync("git", ["-C", repo, "cat-file", "blob", commit + ":" + match[1]]));
  }
}
