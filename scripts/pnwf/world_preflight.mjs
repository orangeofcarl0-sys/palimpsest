/** Runs IN THE ACTUAL principal container, before any provider request. No model or remote access. */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const { installProduct } = await import(pathToFileURL(process.env.PNWF_PRODUCT_ENTRY).href);
const deployment = JSON.parse(readFileSync("/run/stage/deployment-linux.json", "utf8"));
const repository = "/run/stage/world";
const git = (cwd, args) => execFileSync("git", ["-c", "safe.directory=*", "-C", cwd, ...args], { encoding: "utf8" }).trim();
const head = git(repository, ["rev-parse", "HEAD"]);
if (head !== process.env.PNWF_EXPECTED_HEAD) throw new Error("CANONICAL_HEAD_MISMATCH");
git(repository, ["cat-file", "-e", `${head}^{commit}`]);
const installed = installProduct({ tools: { register: () => () => undefined } }, {
  projectId: deployment.projectId, repository, stateDir: "/run/stage/state", execution: "worktree",
  toolProfile: "normal", standard: deployment.standard,
});
try {
  const root = join(repository, ".palimpsest", "worlds");
  const ids = readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
  const live = installed.controller.work.openAttempts();
  for (const attempt of live) if (!ids.includes(attempt.attemptId)) throw new Error(`WORLD_MISSING: ${attempt.attemptId}`);
  const worlds = ids.map(attemptId => {
    const dir = join(root, attemptId);
    const envelope = installed.controller.attemptWorkRecord(attemptId)?.envelope;
    if (!envelope?.base_commit) throw new Error(`BASIS_UNOBSERVABLE: ${attemptId}`);
    const alternatesPath = join(dir, ".git/objects/info/alternates");
    const alternates = existsSync(alternatesPath) ? readFileSync(alternatesPath, "utf8").trim() : null;
    if (alternates !== null && resolve(dir, ".git/objects", alternates) !== join(repository, ".git/objects")) throw new Error(`ALTERNATES_NOT_PORTABLE: ${attemptId}`);
    const result = git(dir, ["rev-parse", "HEAD"]);
    for (const commit of [envelope.base_commit, result]) git(dir, ["cat-file", "-e", `${commit}^{commit}`]);
    const diff = git(dir, ["diff", "--name-only", envelope.base_commit, result]);
    const status = git(dir, ["status", "--porcelain"]);
    const observation = installed.controller.observeAttemptResult(attemptId);
    if (observation.observedHead !== result) throw new Error(`RESULT_OBSERVATION_MISMATCH: ${attemptId}`);
    return { attemptId, basis: envelope.base_commit, result, alternates, diff, status, observation };
  });
  if (!worlds.length) throw new Error("NO_ATTEMPT_WORLDS");
  process.stdout.write(JSON.stringify({ schema: "pnwf-world-preflight/v1", status: "QUALIFIED", head, worlds,
    product: installed.controller.status().directOutcome }) + "\n");
} finally { await installed.dispose(); }
