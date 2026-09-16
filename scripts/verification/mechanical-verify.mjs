/**
 * G10-AD §14/§26/§35 — FIRST-PARTY MECHANICAL INDEPENDENT-VERIFIER DOGFOOD.
 *
 * Usage: node scripts/verification/mechanical-verify.mjs
 *
 * PROTOCOL USED: the built-in first-party definition
 * `project.head.git-diff-check.v1` (`FIRST_PARTY_MECHANICAL_VERIFIER_REF`) — the
 * bounded command `git diff --check`, executed as a REAL subprocess through the
 * existing `commandValidator` (`node:child_process.execFile`). Exit 0 -> PASS,
 * non-zero exit -> FAIL, a spawn fault/timeout -> ERROR.
 *
 * Everything runs against REAL built modules from `dist/` (the Windows-safe
 * `pathToFileURL` pattern used by `scripts/monitor/cold-resume.mjs`):
 *
 *   1. a REAL temp git repository with a REAL committed head;
 *   2. a REAL Work `EventStore` + the REAL `ProjectController`, whose project is
 *      started with `headCommit = git rev-parse HEAD` (so §5's consistency rule
 *      is exercised against real git, not a stub);
 *   3. a REAL `SqliteProjectVerificationStore`, the first-party mechanical
 *      verifier port and the real `firstPartyProjectHeadVerificationSource`;
 *   4. one verification of the EXACT current ProjectIR head;
 *   5. a real `PROJECT_REVISED` moves the canonical head, after which the old run
 *      is STALE BY DERIVATION and the new head is UNVERIFIED.
 *
 * Real Proof and Reasoning stores are opened too, purely to prove the run
 * publishes nothing into them (0/0), and the Work `EventStore` evidence count is
 * compared before/after (0 new Work Evidence).
 *
 * Exit 0 only when the printed summary is honest.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..", "..");
const mod = (...segments) => pathToFileURL(join(REPO, ...segments)).href;

const PROJECT = "mechanical-verify-dogfood";
const CLOCK = "2026-09-16T00:00:00Z";

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function taskSpec(taskId) {
  return {
    task_id: taskId,
    objective: `Complete ${taskId}.`,
    depends_on: [],
    write_paths: [`src/${taskId}.txt`],
    required_artifacts: [`src/${taskId}.txt`],
  };
}

const state = await import(mod("dist/src/state/index.js"));
const tools = await import(mod("dist/src/tools/index.js"));
const effects = await import(mod("dist/src/effects/index.js"));
const domain = await import(mod("dist/src/domain/index.js"));
const verification = await import(mod("dist/src/project_verification/index.js"));
const proof = await import(mod("dist/src/proof_asset/index.js"));
const reasoning = await import(mod("dist/src/reasoning_cell/index.js"));

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-mechanical-verify-"));

  /* 1. A real git repository with a real committed head. ---------------- */
  const repository = mkdtempSync(join(tmpdir(), "palimpsest-mechanical-repo-"));
  git(repository, ["init", "-q"]);
  git(repository, ["config", "user.email", "dogfood@palimpsest.local"]);
  git(repository, ["config", "user.name", "Palimpsest Dogfood"]);
  writeFileSync(join(repository, "README.md"), "# project head verification dogfood\n");
  git(repository, ["add", "-A"]);
  git(repository, ["commit", "-q", "-m", "initial project head"]);
  const gitHead = git(repository, ["rev-parse", "HEAD"]);
  if (!/^[0-9a-f]{40}$/.test(gitHead)) throw new Error(`unexpected git head: ${gitHead}`);

  /* 2. A real project whose canonical head IS that git head. ------------- */
  const workStore = new state.EventStore(join(dir, "work.sqlite"), { clock: () => CLOCK });
  const effectsRuntime = effects.createPalimpsestEffects({
    databasePath: join(dir, "effects.sqlite"),
    git: new effects.FakeGitPort(gitHead),
  });
  const controller = new tools.ProjectController({
    store: workStore,
    effects: effectsRuntime,
    projectId: PROJECT,
    policy: new domain.TaskPolicy({
      policy_id: "mechanical-verify-dogfood",
      read_paths: ["src"],
      allowed_commands: [],
      network_policy: "deny",
      network_allowlist: [],
      timeout_s: 60,
      lease_s: 10,
      attempt_limit: 3,
      candidate_limit: 1,
    }),
    clock: () => CLOCK,
  });
  controller.start({
    projectId: PROJECT,
    goal: "Prove the first-party mechanical verifier against the exact project head.",
    tasks: [taskSpec("task-a")],
    headCommit: gitHead,
  });

  const proofStore = new proof.SqliteProofEvidenceStore(join(dir, "proof.sqlite"));
  const reasoningStore = new reasoning.SqliteReasoningCellStore(join(dir, "reasoning.sqlite"));

  const countWorkEvents = () =>
    Number(workStore.connection.prepare("SELECT COUNT(*) AS n FROM events").get().n);
  const countWorkEvidence = () =>
    Number(workStore.connection.prepare("SELECT COUNT(*) AS n FROM evidence").get().n);
  const projectHead = () =>
    workStore.connection
      .prepare("SELECT revision, digest, head_commit FROM projects WHERE project_id=?")
      .get(PROJECT);

  /* 3. The real verification runtime over the real repository. ----------- */
  const port = verification.commandProjectHeadVerifier(); // first-party `git diff --check`
  const registry = verification.verifierRegistryFromPorts([port]);
  const store = new verification.SqliteProjectVerificationStore(join(dir, "verification.sqlite"));
  const source = verification.firstPartyProjectHeadVerificationSource({
    controller,
    git: { head: async () => git(repository, ["rev-parse", "HEAD"]) },
  });
  const service = verification.makeProjectVerificationService({
    projectId: PROJECT,
    source,
    store,
    registry,
    providers: [port],
    repository,
    clock: () => CLOCK,
  });

  /* 4. One verification of the EXACT current ProjectIR head. ------------- */
  const workEventsBefore = countWorkEvents();
  const workEvidenceBefore = countWorkEvidence();
  const outcome = await service.verifyCurrentHead({
    requestedBy: "dogfood:mechanical-verify",
    reason: "G10-AD §14 first-party mechanical verification",
  });
  const run = outcome.run;
  if (run === null) throw new Error(`verification was blocked: ${outcome.typedReasonCode} — ${outcome.detail}`);

  const workEvidenceCreated = countWorkEvidence() - workEvidenceBefore;
  const workEventsCreated = countWorkEvents() - workEventsBefore;
  const proofPublished = (await proofStore.replay()).length;
  const reasoningAdmitted = (await reasoningStore.cells()).length;

  const subject = {
    projectId: run.subject.projectId,
    projectRevision: run.subject.projectRevision,
    projectDigest: run.subject.projectDigest,
    headCommit: run.subject.headCommit,
    digest: run.subject.digest,
  };

  /* 5. Move the canonical head (a real PROJECT_REVISED). ----------------- */
  const headBeforeMove = projectHead();
  controller.plan({ tasks: [taskSpec("task-a"), taskSpec("task-b")] });
  const headAfterMove = projectHead();
  const movedStatus = await service.status();

  const previousRunStaleByDerivation =
    movedStatus.latestRun !== null &&
    movedStatus.latestRun.run.runId === run.runId &&
    movedStatus.latestRun.freshness === "STALE_SUBJECT" &&
    movedStatus.latestRun.current === false;
  const newHeadUnverified =
    movedStatus.state === "UNVERIFIED" && movedStatus.currentSubjectRun === null;
  const headMoved =
    headAfterMove.revision === headBeforeMove.revision + 1 &&
    headAfterMove.digest !== headBeforeMove.digest;

  const pass =
    run.verdict === "PASS" &&
    run.independence === "MECHANICAL_INDEPENDENT" &&
    run.freshness === "CURRENT" &&
    outcome.statusView.state === "PASS" &&
    run.status === "COMPLETED" &&
    subject.headCommit === gitHead &&
    workEvidenceCreated === 0 &&
    workEventsCreated === 0 &&
    proofPublished === 0 &&
    reasoningAdmitted === 0 &&
    headMoved &&
    previousRunStaleByDerivation &&
    newHeadUnverified &&
    store.verifyChain(PROJECT).ok;

  const summary = {
    protocol: port.definition.protocol,
    verifierRef: run.verifierRef,
    verifierDefinitionDigest: run.verifierDefinitionDigest,
    subject,
    independence: run.independence,
    verdict: run.verdict,
    status: outcome.statusView.state,
    freshness: run.freshness,
    runId: run.runId,
    runRef: verification.projectVerificationRunRef(run.runId),
    gitHead,
    repositoryConsistent: outcome.statusView.repositoryConsistent,
    workEvidenceCreated,
    proofPublished,
    reasoningAdmitted,
    workflow: run.status,
    pass,
  };
  console.log(JSON.stringify(summary, null, 2));

  const afterMove = {
    previousRun: { runId: run.runId, freshness: run.freshness, current: true },
    headBeforeMove,
    headAfterMove,
    derivedRunFreshness: movedStatus.latestRun?.freshness ?? null,
    derivedRunCurrent: movedStatus.latestRun?.current ?? null,
    newHeadState: movedStatus.state,
    newHeadHasRun: movedStatus.currentSubjectRun !== null,
    historyRetained: store.list(PROJECT).length,
    detail: movedStatus.detail,
  };
  console.log(JSON.stringify({ afterHeadMove: afterMove, pass }, null, 2));

  try {
    proofStore.close();
    reasoningStore.close();
    store.close();
    await effectsRuntime.close();
    workStore.close();
  } catch {
    /* best effort */
  }

  process.exit(pass ? 0 : 1);
}

await main();
