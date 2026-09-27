/**
 * R0 §25 — EXTERNAL CONSUMER SMOKE.
 *
 * The point of this script is that it is NOT a unit test: it builds the distributable exactly as a
 * downstream embedder receives it (`npm pack`), installs it into a throwaway project OUTSIDE the
 * repository, and drives the PUBLIC surface only. It deliberately fails if the packaged artifact
 * cannot stand on its own.
 *
 * What it refuses to use:
 *   · any `src/...` or `test/...` import (repository-relative paths)
 *   · any `dist/...` path reached by relative navigation
 *   · any test helper or private subpath
 *
 * It consumes only the two documented entrypoints from `docs/sdk-guide.md`:
 *   `palimpsest-dsh`            — schema, domain, state, scheduler
 *   `palimpsest-dsh/advanced`   — the full embed surface, including `installPalimpsest`
 *
 * Usage:
 *   node scripts/release/consumer-smoke.mjs            # pack + install + run
 *   PALIMPSEST_SMOKE_DIR=<dir> node ...                # reuse a scratch dir
 *
 * Exit code 0 means a downstream project installed the tarball and ran a real governed session.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const SCRATCH = process.env.PALIMPSEST_SMOKE_DIR?.trim() || join(process.env.TEMP ?? "/tmp", "palimpsest-consumer-smoke");
const PROJECT = join(SCRATCH, "embedder");

const findings = [];
const record = (label, value) => {
  findings.push({ label, value });
  process.stdout.write(`  · ${label}: ${value}\n`);
};

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options });
}

/**
 * `npm` is a shell script on Windows and is not always resolvable from a bare `spawn`, so it is
 * invoked through the Node entrypoint that ships beside the running interpreter. This is packaging
 * plumbing, not a repository-relative import.
 */
const NPM_CLI = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
function npm(args, options = {}) {
  return run(process.execPath, [NPM_CLI, ...args], options);
}

/**
 * The dependency specifiers are pinned GitHub release tarballs and the repository's override policy
 * lives in `pnpm-workspace.yaml`, which is the channel the repository's own consumer scripts
 * (`docker/minimal/*.sh`) use. Like `npm`, `pnpm` is a shell wrapper that a bare `spawn` cannot always
 * resolve, so it is invoked through its Node entrypoint when one can be located.
 */
function resolvePnpmEntry() {
  const explicit = process.env.PALIMPSEST_PNPM_ENTRY?.trim();
  if (explicit !== undefined && explicit !== "") return explicit;
  const candidates = [
    join(dirname(process.execPath), "node_modules", "pnpm", "bin", "pnpm.cjs"),
    join(process.env.APPDATA ?? "", "npm", "node_modules", "pnpm", "bin", "pnpm.cjs"),
    join(process.env.HOME ?? process.env.USERPROFILE ?? "", "AppData", "Roaming", "npm", "node_modules", "pnpm", "bin", "pnpm.cjs"),
  ];
  return candidates.find((candidate) => candidate !== "" && existsSync(candidate));
}
function pnpm(args, options = {}) {
  const entry = resolvePnpmEntry();
  return entry === undefined
    ? run("pnpm", args, options)
    : run(process.execPath, [entry, ...args], options);
}

/* ------------------------------------------------------------------ 1. build the artifact */

process.stdout.write("=== 1. build the distributable ===\n");
npm(["run", "build"], { cwd: REPO, stdio: ["ignore", "pipe", "pipe"] });
record("build", "tsc -b succeeded");

rmSync(SCRATCH, { recursive: true, force: true });
mkdirSync(PROJECT, { recursive: true });

const packOutput = npm(["pack", "--pack-destination", SCRATCH], { cwd: REPO });
const tarball = packOutput.trim().split("\n").filter((line) => line.endsWith(".tgz")).pop();
if (tarball === undefined || !existsSync(join(SCRATCH, tarball))) throw new Error(`npm pack produced no tarball: ${packOutput}`);
record("tarball", tarball);

/* ------------------------------------------------------------------ 2. inspect its contents */

process.stdout.write("\n=== 2. inspect the package contents ===\n");
// The listing is read IN PROCESS rather than by shelling out to `tar`: on Windows a `C:\...` path is
// parsed by tar as a remote host. `--json` already returns the file list.
const packJson = JSON.parse(npm(["pack", "--dry-run", "--json"], { cwd: REPO }))[0];
const listing = packJson.files.map((entry) => `package/${entry.path}`);
const counts = {
  total: listing.length,
  srcTypescript: listing.filter((entry) => entry.startsWith("package/src/") && entry.endsWith(".ts")).length,
  distJs: listing.filter((entry) => entry.startsWith("package/dist/") && entry.endsWith(".js")).length,
  distTests: listing.filter((entry) => entry.startsWith("package/dist/test/")).length,
};
record("entries", `${counts.total} (dist js ${counts.distJs}, src ts ${counts.srcTypescript}, dist test ${counts.distTests})`);
record("package size", `${(packJson.size / 1024 / 1024).toFixed(1)} MB packed, ${(packJson.unpackedSize / 1024 / 1024).toFixed(1)} MB unpacked`);
for (const required of ["package/package.json", "package/dist/src/index.js", "package/dist/src/index.d.ts", "package/dist/src/advanced.js", "package/dist/src/advanced.d.ts"]) {
  if (!listing.includes(required)) throw new Error(`the package is missing a documented entrypoint: ${required}`);
}
record("documented entrypoints present", "index.js/.d.ts + advanced.js/.d.ts");
if (listing.some((entry) => entry.startsWith("package/node_modules/"))) throw new Error("the tarball embeds node_modules — it is not a source artifact");
// Gate fixtures and compiled tests are DOGFOOD evidence, not product. Shipping them is inert rather
// than incorrect, but it is a packaging decision worth surfacing in the R0 report.
record(
  "dogfood/test material in the tarball",
  `${counts.distTests} compiled test files, ${listing.filter((entry) => entry.startsWith("package/scripts/gates/")).length} gate files, ${counts.srcTypescript} source .ts files`,
);

/* ------------------------------------------------------------------ 3. install into a clean project */

process.stdout.write("\n=== 3. install into an external project ===\n");
// The dependency specifiers are pinned GitHub release tarballs, so this needs a real network fetch
// and pnpm's override settings. `pnpm-workspace.yaml` is copied because it carries that resolution
// policy — it is a CONSUMER-side file the embedder would also need, not a repository-relative import.
// `--prod` keeps the install to the package's own `dependencies`: the devDependencies (Playwright,
// the web toolchain, `@ordarium/testing`) are not part of what an embedder receives.
cpSync(join(REPO, "pnpm-workspace.yaml"), join(PROJECT, "pnpm-workspace.yaml"));
writeFileSync(
  join(PROJECT, "package.json"),
  `${JSON.stringify({ name: "palimpsest-embedder-smoke", version: "1.0.0", private: true, type: "module" }, null, 2)}\n`,
);
// The pinned @ordarium/* specifiers are GitHub release tarballs, and the network is not part of what
// this smoke is testing. A transient ETIMEDOUT is retried so a flaky connection does not read as a
// packaging failure; a genuine resolution problem (a 404, a bad specifier) still fails.
let installError;
for (let attempt = 1; attempt <= 3; attempt += 1) {
  try {
    pnpm(["add", "--prod", join(SCRATCH, tarball)], { cwd: PROJECT, stdio: ["ignore", "pipe", "pipe"] });
    installError = undefined;
    break;
  } catch (error) {
    installError = error;
    const text = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    const transient = /ETIMEDOUT|ECONNRESET|error \(23\)|fetch failed|EAI_AGAIN/u.test(text);
    process.stdout.write(`  · install attempt ${attempt} failed${transient ? " (transient network)" : ""}\n`);
    if (!transient) break;
  }
}
if (installError !== undefined) {
  throw new Error(`the tarball could not be installed by a downstream consumer:\n${installError.stdout ?? ""}${installError.stderr ?? ""}`);
}
record("install", "the tarball installed with its declared production dependencies");

/* ------------------------------------------------------------------ 4. drive the public surface */

process.stdout.write("\n=== 4. run a governed session on the PUBLIC surface only ===\n");
const probe = join(PROJECT, "smoke.mjs");
writeFileSync(
  probe,
  `import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

// ONLY the documented entrypoints, used exactly as docs/sdk-guide.md describes them:
// the root for the contract core (schema/domain/state/scheduler), /advanced for the embed surface,
// and the per-plane subpaths for the E-plane capability's own store.
import { EventStore, TaskPolicy } from "palimpsest-dsh";
import {
  installPalimpsest,
  trustedDefaultPolicy,
  FakeGitPort,
  createPalimpsestEffects,
  SqliteProofEvidenceStore,
  localProofBlobStore,
  SqliteReasoningCellStore,
  SqliteProjectAssetAssociationStore,
  SqliteProjectJournalStore,
  SqliteOrganizationMemoryStore,
} from "palimpsest-dsh/advanced";
import { SqliteProcedureStore } from "palimpsest-dsh/procedures";

const HOME = ${JSON.stringify(join(PROJECT, "runtime"))};
mkdirSync(HOME, { recursive: true });
const REPO = join(HOME, "repo");
mkdirSync(join(REPO, "src"), { recursive: true });
const git = (args, cwd = REPO) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
if (!existsSync(join(REPO, ".git"))) {
  git(["init", "-q", "-b", "main"]);
  git(["config", "user.email", "smoke@clean.test"]);
  git(["config", "user.name", "smoke"]);
  git(["config", "commit.gpgsign", "false"]);
  const fs = await import("node:fs");
  fs.writeFileSync(join(REPO, "src", "index.js"), "export const value = 1;\\n");
  git(["add", "-A"]);
  git(["commit", "-qm", "initial"]);
}
const head = git(["rev-parse", "HEAD"]);

const installed = installPalimpsest(
  { tools: { register: () => () => undefined } },
  {
    projectId: "smoke-project",
    databasePath: join(HOME, "palimpsest.sqlite"),
    ordariumDatabasePath: join(HOME, "ordarium.sqlite"),
    repository: REPO,
    execution: "worktree",
    policy: trustedDefaultPolicy({ read_paths: ["src"], allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
    // The E-plane capabilities compose only when their knowledge owners are supplied, so an embedder
    // that wants them wires these. Supplying them here is what makes this smoke exercise the full
    // documented surface rather than the minimal one.
    proofEvidenceStore: new SqliteProofEvidenceStore(join(HOME, "proof.sqlite")),
    proofBlobStore: localProofBlobStore(join(HOME, "blobs")),
    reasoningCellStore: new SqliteReasoningCellStore(join(HOME, "cells.sqlite")),
    reasoningCellStoreOwned: false,
    projectAssociationStore: new SqliteProjectAssetAssociationStore(join(HOME, "assoc.sqlite")),
    projectJournalStore: new SqliteProjectJournalStore(join(HOME, "journal.sqlite")),
    organizationMemoryStore: new SqliteOrganizationMemoryStore(join(HOME, "memory.sqlite")),
    procedureStore: new SqliteProcedureStore(join(HOME, "procedures.sqlite")),
  },
);

installed.controller.start({
  projectId: "smoke-project",
  goal: "prove the packaged artifact can run a governed session",
  headCommit: head,
  requirements: [{ requirement_id: "R", statement: "the packaged install starts a project", priority: "critical", acceptance_refs: [] }],
  tasks: [{ task_id: "t1", objective: "a trivial task", depends_on: [], write_paths: ["src/index.js"], required_artifacts: [] }],
});

const project = installed.controller.work.project();
const tasks = installed.controller.work.taskStates();
const report = {
  revision: project.revision,
  requirements: project.requirements.length,
  tasks: tasks.map((task) => ({ id: task.taskId, state: task.state })),
  capabilities: ["intent", "projectCollaboration", "institutionalLearning", "procedures"].filter((key) => installed[key] !== undefined),
  absentCapabilities: ["projectCollaboration", "institutionalLearning"].filter((key) => installed[key] === undefined),
  effectsAvailable: typeof createPalimpsestEffects === "function",
  storeAvailable: typeof EventStore === "function",
  gitPortAvailable: typeof FakeGitPort === "function",
};
await installed.dispose();
process.stdout.write(JSON.stringify(report) + "\\n");
`,
);

const raw = run("node", [probe], { cwd: PROJECT, stdio: ["ignore", "pipe", "pipe"] });
const result = JSON.parse(raw.trim().split("\n").pop());
record("installPalimpsest started a project", `revision ${result.revision}, ${result.requirements} requirement(s), ${result.tasks.length} task(s)`);
record("task state", result.tasks.map((task) => `${task.id}=${task.state}`).join(", "));
record("E-plane capabilities present on the packaged install", result.capabilities.join(", ") || "none");
if (result.absentCapabilities.length > 0) {
  // Absence is honest, not a defect: the collaboration face needs a Federation service and the
  // learning face needs an evolution history, neither of which this minimal embedder wires. The smoke
  // records them rather than papering over them.
  record("capabilities honestly ABSENT (owners not wired)", result.absentCapabilities.join(", "));
}
record("dispose", "clean");
record("supporting exports reachable", `effects=${result.effectsAvailable} store=${result.storeAvailable} gitPort=${result.gitPortAvailable}`);

/* ------------------------------------------------------------------ verdict */

// The smoke's job is to prove the PACKAGED artifact stands on its own: it installs, its documented
// entrypoints resolve, an embedder can start a real governed project, the E-plane faces compose when
// their owners are supplied, and it disposes cleanly. It deliberately does NOT assert that every
// optional capability is present — that is a wiring decision, not a packaging property.
const ok =
  result.tasks.length === 1 &&
  result.tasks[0].state === "READY" &&
  result.capabilities.includes("intent") &&
  result.capabilities.includes("procedures") &&
  result.effectsAvailable &&
  result.storeAvailable &&
  result.gitPortAvailable;

process.stdout.write(`\n${ok ? "PASS" : "FAIL"}  external consumer smoke\n`);
if (!ok) {
  process.stdout.write(`\nfindings:\n${JSON.stringify(findings, null, 2)}\n`);
}
process.exit(ok ? 0 : 1);
