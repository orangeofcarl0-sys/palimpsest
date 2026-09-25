#!/usr/bin/env node
/**
 * §D2-LIVE — the D2 system-level acceptance gate.
 *
 *     real ProjectIR WORK
 *       → async start
 *       → real ExecutionWorld
 *       → worker edits / tests / commits
 *       → settle (the ONE D2-e1 spine)
 *       → followup observes completion
 *       → independent verification (the 2B runtime)
 *       → ELIGIBLE
 *       → canonical source unchanged, ZERO promotion facts
 *
 * The question this answers is NOT "do the parts work" — D2-a…D2-d each proved their own part. It is:
 *
 *     do the separately-proven parts still compose into ONE system when they run for real?
 *
 * So it is a VERTICAL test with one golden scenario. It does not re-exhaust BASE_DRIFT,
 * UNCOMMITTED_WORK, crash windows, duplicate starts or verification FAIL — those belong to the slices
 * that own them, and repeating them here would only make a longer list.
 *
 * It uses the SHIPPED seams end to end: `installPalimpsest` through a real deployment profile, the
 * real `makeWorkDelegationService`, the real `dshSubprocessWorkWorkerPort` running a real PTC DSH
 * worker, the real verification runtime and the ONE eligibility assessor. The only rig-owned pieces
 * are a fixture repository, a tee/barrier wrapper around the worker process, and observation helpers.
 *
 * THE BARRIER, not a clock: "async start really returned before the work ran" is proven by parking the
 * worker process until the gate releases it — never by `elapsed < N ms`, which a loaded machine makes
 * lie.
 */
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * §D2-LIVE — the D2 system-level acceptance gate.
 *
 * PATHS COME FROM THE ENVIRONMENT (`scripts/gates/env.mjs`) so a fresh checkout can re-run this gate
 * without editing it. See `scripts/gates/README.md` for invocation, the DSH version it was last run
 * against, the host constraints it requires, and its expected assertion count.
 */
import { dshBin, dshHome, dshVersion, gateRepoRoot, gateRoot, installHostBundle } from "./env.mjs";

const REPO = gateRepoRoot();
const REAL_DSH = dshHome();
const RUN = gateRoot();
const RIG = `${RUN}/d2-live`;
const HOME = `${RIG}/home`;
const PROFILE = "d2live";
const PROJECT = `${RIG}/repo`;
const STATE = `${RIG}/state`;
const OUT = `${RIG}/out`;
const DSH_BIN = dshBin();
const TEE = new URL("./d2-live-tee-worker.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const TRANSCRIPT = `${OUT}/d2live-worker-transcript.txt`;
const SPAWNED = `${OUT}/d2live-worker-spawned`;
const BARRIER = `${OUT}/d2live-worker-barrier`;
const WORKER_TIMEOUT_MS = 1_500_000;

const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const porcelain = (cwd) =>
  git(cwd, ["status", "--porcelain"])
    .split(String.fromCharCode(10))
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.endsWith(".palimpsest/"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Path equality that does not depend on which separator a given producer happened to use. */
const samePath = (a, b) =>
  String(a).split(String.fromCharCode(92)).join("/").replace(/\/+$/u, "") ===
  String(b).split(String.fromCharCode(92)).join("/").replace(/\/+$/u, "");

/* ------------------------------------------------------------------ fixture */

/**
 * A real, minimal repository with a real, small, mechanically checkable defect — in a file whose PATH
 * touches a boundary (`schema`), because that is the ONE hard trigger for a REQUIRED independent
 * verification (§B.4). Without it the chain would end at "eligible for a reason that never involved
 * verification", and the gate would prove less than it claims.
 */
function setupProject() {
  rmSync(PROJECT, { recursive: true, force: true });
  mkdirSync(`${PROJECT}/src`, { recursive: true });
  mkdirSync(`${PROJECT}/test`, { recursive: true });
  writeFileSync(
    `${PROJECT}/src/schema.js`,
    [
      "// Boundary record helpers.",
      "// BUG: shapeLabel names only the first field.",
      "export function shapeLabel(shape) {",
      "  return `a=${shape.a}`;",
      "}",
      "",
    ].join("\n"),
  );
  writeFileSync(
    `${PROJECT}/test/schema.test.mjs`,
    [
      'import { test } from "node:test";',
      'import assert from "node:assert/strict";',
      'import { shapeLabel } from "../src/schema.js";',
      "",
      'test("the label names both fields", () => {',
      '  assert.equal(shapeLabel({ a: 1, b: "x" }), "a=1 b=x");',
      "});",
      "",
    ].join("\n"),
  );
  writeFileSync(
    `${PROJECT}/package.json`,
    `${JSON.stringify({ name: "d2live", private: true, type: "module", scripts: { test: "node --test test/schema.test.mjs" } }, null, 2)}\n`,
  );
  execFileSync("git", ["init", "-q", PROJECT]);
  execFileSync("git", ["-C", PROJECT, "add", "-A"]);
  execFileSync("git", ["-C", PROJECT, "-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"]);
}

function setupHome() {
  rmSync(HOME, { recursive: true, force: true });
  rmSync(STATE, { recursive: true, force: true });
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(`${HOME}/profiles/${PROFILE}`, { recursive: true });
  mkdirSync(STATE, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  // The DSH profile needs the host bundle. A junction keeps the rig from copying a whole tree of
  // unrelated packages; the bundle ITSELF is copied in fresh by the caller before every live run,
  // because the profile resolves `palimpsest-dsh-host` from the REAL DSH home.
  execFileSync(
    "cmd",
    ["/c", "mklink", "/J", `${HOME.replace(/\//g, "\\")}\\profiles\\node_modules`, `${REAL_DSH.replace(/\//g, "\\")}\\profiles\\node_modules`],
    { stdio: "ignore" },
  );
  writeFileSync(
    `${HOME}/settings.yaml`,
    ["agent-default-model:", "  provider: deepseek-official", "  model: deepseek-flash", "locale:", "  preference: zh", ""].join("\n"),
  );
  // Copied, never read: this rig must not put credentials anywhere near its output.
  copyFileSync(`${REAL_DSH}/.credentials.yaml`, `${HOME}/.credentials.yaml`);
  // A gate must run against the CURRENT host bundle, never a stale one.
  installHostBundle({ repo: REPO, realDshHome: REAL_DSH });

  const db = (n) => `${STATE}/${n}.sqlite`;
  writeFileSync(
    `${HOME}/profiles/${PROFILE}/deployment.json`,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        profileId: PROFILE,
        projectId: "d2live",
        localPeer: "d2live-peer",
        persistentPoint: "pp-d2live",
        repository: PROJECT,
        transport: { namespace: PROFILE, databasePath: db("transport") },
        databases: {
          orchestration: db("orchestration"),
          ordarium: db("ordarium"),
          coordination: db("coordination"),
          transportCursors: db("cursors"),
          projectAssociations: db("assoc"),
          projectJournal: db("journal"),
        },
        reasoning: {},
        execution: "worktree",
        policy: { allowed_commands: [{ executable: "node", argv_prefix: ["--test"] }] },
        standard: { statement: "测试通过，且不越界改文件" },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    `${HOME}/profiles/${PROFILE}/package.json`,
    `${JSON.stringify({ name: `dsh-profile-${PROFILE}`, private: true, dependencies: {}, dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "palimpsest-dsh-host"], patchReload: "startup" } } }, null, 2)}\n`,
  );
  writeFileSync(
    `${HOME}/profiles/${PROFILE}/cordis.patch.yml`,
    [
      "- id: palimpsest-tools",
      "  config:",
      `    palimpsestEntry: '${REPO}/dist/src/advanced.js'`,
      `    deploymentProfile: '${HOME}/profiles/${PROFILE}/deployment.json'`,
      "    serve: false",
      "    openDashboard: false",
      "",
    ].join("\n"),
  );
}

/* ------------------------------------------------------------- the async job */

function workerPort() {
  // The SHIPPED port, unmodified. It spawns `node <dshBin> --profile P --work <ctx>` with cwd = the
  // execution world; `dshBin` is the rig's tee/barrier wrapper, which re-execs the real DSH bin with
  // the same argv. The port therefore observes exactly what it always would.
  return (worldPath) =>
    workWorkerModule.dshSubprocessWorkWorkerPort({
      dshBin: TEE,
      profile: PROFILE,
      timeoutMs: WORKER_TIMEOUT_MS,
    });
}

let workWorkerModule;

/* ------------------------------------------------------------------- the run */

async function main() {
  setupProject();
  const head = git(PROJECT, ["rev-parse", "HEAD"]);
  setupHome();
  process.stdout.write(`project   ${PROJECT}\nhead      ${head}\nprofile   ${HOME}/profiles/${PROFILE}\nbarrier   ${BARRIER}\n\n`);

  // The worker process inherits these, and they are the ONLY rig-owned channel it has.
  process.env.DSH_HOME = HOME;
  process.env.PALIMPSEST_REAL_DSH_BIN = DSH_BIN;
  process.env.PALIMPSEST_LIVE_GATE_TRANSCRIPT = TRANSCRIPT;
  process.env.PALIMPSEST_LIVE_GATE_SPAWNED = SPAWNED;
  process.env.PALIMPSEST_LIVE_GATE_BARRIER = BARRIER;

  workWorkerModule = await import(pathToFileURL(`${REPO}/dist/src/deployment/work_worker.js`).href);
  const advanced = await import(pathToFileURL(`${REPO}/dist/src/advanced.js`).href);
  const delegationModule = await import(pathToFileURL(`${REPO}/dist/src/interaction/work_delegation.js`).href);

  const profile = advanced.loadDeploymentProfile(`${HOME}/profiles/${PROFILE}/deployment.json`);
  const deployment = advanced.launchDeployment(profile);
  const installed = deployment.installed;
  const controller = installed.controller;

  const findings = [];
  const record = (key, value) => findings.push([key, value]);
  // The HOST facts come first: a gate result is only meaningful together with what ran it.
  record("0. host DSH version", dshVersion());
  record("0. gate repo", REPO);
  record("0. fixture root", RIG);
  const tool = (name) => {
    const found = installed.tools.find((entry) => entry.name === name);
    if (found === undefined) throw new Error(`no core tool ${name}`);
    return found;
  };
  const call = async (name, args) =>
    await tool(name).execute(args, {
      callId: `c-${name}`,
      rootCallId: `r-${name}`,
      name,
      arguments: args,
      signal: new AbortController().signal,
    });

  const count = (sql, ...params) => controller.store.connection.prepare(sql).get(...params).c;
  /** The whole-project fingerprint: what must move, and what must not. */
  const snapshot = () => ({
    canonicalHead: git(PROJECT, ["rev-parse", "HEAD"]),
    canonicalTree: porcelain(PROJECT),
    canonicalRefs: git(PROJECT, ["for-each-ref", "--format=%(refname) %(objectname)"]),
    events: count("SELECT COUNT(*) AS c FROM events WHERE project_id=?", "d2live"),
    promotionEvents: count(
      "SELECT COUNT(*) AS c FROM events WHERE project_id=? AND event_type LIKE 'PROMOTION%'",
      "d2live",
    ),
    promotionRows: count("SELECT COUNT(*) AS c FROM promotions WHERE project_id=?", "d2live"),
    attempts: count("SELECT COUNT(*) AS c FROM attempts WHERE project_id=?", "d2live"),
    taskStates: (
      controller.store.connection
        .prepare("SELECT task_id, state FROM tasks WHERE project_id=? ORDER BY task_id")
        .all("d2live")
    ).map((row) => `${String(row.task_id)}:${String(row.state)}`),
  });

  /* -- 1. real canonical WORK, declared through the public lifecycle ---------- */

  await call("palimpsest_start", {
    projectId: "d2live",
    goal: "make the boundary label name every field",
    headCommit: head,
    tasks: [
      {
        task_id: "t1",
        objective:
          "src/schema.js 的 shapeLabel 只输出了第一个字段。修好它，让 label 同时包含 a 和 b（形如 `a=1 b=x`），运行 `node --test test/schema.test.mjs` 直到通过，然后提交你的改动。",
        depends_on: [],
        // `schema` in the path is the ONE hard trigger for a REQUIRED independent verification.
        write_paths: ["src/schema.js"],
        required_artifacts: [],
      },
    ],
  });
  const before = snapshot();
  record("1. work existed before delegation", `task t1 state=${before.taskStates.join(",")}`);

  /* -- 2. async start, with the worker PARKED behind a barrier ---------------- */

  const service = delegationModule.makeWorkDelegationService({
    controller,
    workerFor: workerPort(),
  });
  const started = await service.start({ expectedTaskId: "t1" });
  record("2. start returned", `${started.state} task=${started.taskId} job=${started.jobId.slice(0, 12)} resumed=${String(started.resumed)}`);

  // The worker process has STARTED (so `prepare` already succeeded) and is parked before doing any
  // work. `start` returned while it sits there — that is the non-blocking proof, by barrier.
  for (let attempt = 0; attempt < 600 && !existsSync(SPAWNED); attempt += 1) await sleep(100);
  const spawned = existsSync(SPAWNED);
  const parked = await service.followup({ jobId: started.jobId });
  const parkedPhase = "phase" in parked ? parked.phase : null;
  const attemptId = "attemptId" in parked ? parked.attemptId : null;
  record("3. worker process started while start() had already returned", spawned ? "YES (barrier held)" : "NO");
  record("3. job phase with the worker parked", parkedPhase ?? "(none)");
  record("3. attempt id exposed before completion", attemptId ?? "(none)");

  if (attemptId === null) throw new Error("prepare never exposed an attempt; the async chain did not start");
  const world = controller.observeAttemptResult(attemptId);
  if (world === null) throw new Error("the attempt's execution world is not observable");
  const worldPath = world.workDir;
  record("3. execution world", worldPath.split(String.fromCharCode(92)).join("/").replace(PROJECT.split(String.fromCharCode(92)).join("/"), "<repo>"));
  record("3. world HEAD == base while the worker is parked", git(worldPath, ["rev-parse", "HEAD"]) === head ? "YES" : "NO");
  record("3. canonical HEAD still base", git(PROJECT, ["rev-parse", "HEAD"]) === head ? "YES" : "NO");

  // Release the worker.
  writeFileSync(BARRIER, "go");

  /* -- 3. the worker really works, then the ONE settlement spine ------------- */

  let view = null;
  for (let attempt = 0; attempt < 9000; attempt += 1) {
    const candidate = await service.followup({ jobId: started.jobId });
    if ("phase" in candidate && (candidate.phase === "FINISHED" || candidate.phase === "HOST_ERROR")) {
      view = candidate;
      break;
    }
    await sleep(500);
  }
  if (view === null) throw new Error("the async job never reached a terminal host phase");
  record("4. job terminal phase", view.phase);
  if (view.hostError !== null) record("4. host error", String(view.hostError).slice(0, 200));
  record("4. settlement", JSON.stringify(view.settlement).slice(0, 240));

  const workerEnvLine = (() => {
    if (!existsSync(TRANSCRIPT)) return null;
    const text = readFileSync(TRANSCRIPT, "utf8");
    const at = text.lastIndexOf("PALIMPSEST_WORKER_ENV ");
    if (at < 0) return null;
    try {
      return JSON.parse(text.slice(at + "PALIMPSEST_WORKER_ENV ".length).split(String.fromCharCode(10))[0]);
    } catch {
      return null;
    }
  })();
  record("4. worker cwd == its execution world", workerEnvLine === null ? "(no worker telemetry)" : samePath(workerEnvLine.cwd, worldPath) ? "YES" : `NO (${String(workerEnvLine.cwd)})`);
  record("4. worker presentation", workerEnvLine?.presentation ?? "(native)");
  const offered = workerEnvLine?.offeredTools ?? [];
  const inheritedAuthority = offered.filter((n) => typeof n === "string" && n.startsWith("palimpsest_") && n !== "palimpsest_worker_result");
  record("4. inherited Palimpsest authority tools", inheritedAuthority.length === 0 ? "NONE (authority-closed)" : JSON.stringify(inheritedAuthority));

  const afterSettle = snapshot();
  const record2 = controller.attemptWorkRecord(attemptId);
  const report = record2?.report ?? null;
  const resultCommit = report?.result_commit ?? null;
  const changedFiles = report?.changed_files ?? [];
  record("5. attempt state", String(record2?.state ?? "(none)"));
  record("5. changed files", JSON.stringify(changedFiles));
  record("5. result commit R", resultCommit === null ? "(none)" : resultCommit.slice(0, 12));
  record("5. R != base", resultCommit !== null && resultCommit !== head ? "YES" : "NO");
  const rReadable = (() => {
    try {
      git(PROJECT, ["cat-file", "-e", `${String(resultCommit)}^{commit}`]);
      return "YES (exported into the canonical object universe)";
    } catch {
      return "NO";
    }
  })();
  record("5. canonical repository can READ R", rReadable);
  /**
   * "R contains the fix" must be about the BEHAVIOUR, not about a spelling. The first version of this
   * line looked for `b=${shape.b}` and reported NO for a worker whose fix was BETTER than the one the
   * task text hinted at (`Object.entries(...)` instead of naming the two fields literally). What the
   * gate actually cares about is that R carries a real change to the declared file — so it runs the
   * repository's own test against a checkout of R, which is the same oracle the task named.
   */
  record("5. R carries a real change to the declared file", changedFiles.includes("src/schema.js") ? "YES (src/schema.js)" : `NO (${JSON.stringify(changedFiles)})`);
  record("5. R differs from base in src/schema.js", (() => {
    try {
      return git(PROJECT, ["diff", "--name-only", head, String(resultCommit)]) === "src/schema.js" ? "YES" : "NO";
    } catch {
      return "?";
    }
  })());
  const fixWorks = (() => {
    try {
      // The declared oracle, run against R: a detached checkout, the repo's own test, released after.
      const check = `${OUT}/d2live-verify-R`;
      rmSync(check, { recursive: true, force: true });
      git(PROJECT, ["worktree", "add", "--detach", check, String(resultCommit)]);
      try {
        execFileSync(process.execPath, ["--test", "test/schema.test.mjs"], { cwd: check, stdio: "ignore" });
        return "PASS (node --test test/schema.test.mjs on R)";
      } finally {
        try {
          git(PROJECT, ["worktree", "remove", "--force", check]);
        } catch {
          rmSync(check, { recursive: true, force: true });
        }
      }
    } catch (error) {
      return `FAIL (${String(error.message).slice(0, 120)})`;
    }
  })();
  record("5. the declared test PASSES on R", fixWorks);
  record("5. canonical source HEAD", afterSettle.canonicalHead === head ? "== H0 (unchanged)" : `MOVED to ${afterSettle.canonicalHead.slice(0, 12)}`);
  record("5. canonical working tree", afterSettle.canonicalTree.length === 0 ? "clean (unchanged)" : JSON.stringify(afterSettle.canonicalTree));
  record("5. promotion facts", `${String(afterSettle.promotionEvents)} events / ${String(afterSettle.promotionRows)} rows (before: ${String(before.promotionEvents)}/${String(before.promotionRows)})`);
  record("5. the BUG is still in the canonical source", git(PROJECT, ["show", "HEAD:src/schema.js"]).includes("a=${shape.a}`;") ? "YES" : "NO");

  /* -- 4. followup is a QUERY, proven on the live chain --------------------- */

  const beforeFollowup = snapshot();
  for (let i = 0; i < 5; i += 1) await service.followup({ jobId: started.jobId });
  await service.followup({ jobId: "wdj-does-not-exist" });
  const afterFollowup = snapshot();
  record("6. followup changed nothing", JSON.stringify(beforeFollowup) === JSON.stringify(afterFollowup) ? "YES" : "NO");

  /* -- 5. the EXISTING 2B verification path, entered independently ---------- */

  if (installed.verification === undefined) throw new Error("this deployment composed no verification runtime");
  const runtimeCapability = installed.verification.runtimeCapability();
  record("7. verification runtime", runtimeCapability.note.slice(0, 140));
  const outcome = await installed.verification.service.verifyAttemptResult({
    attemptId,
    requestedBy: "live-gate:d2live",
    reason: "independent verification of the delegated result",
  });
  record("7. verification status", `${outcome.status} / ${outcome.typedReasonCode}`);
  record("7. verification verdict", String(outcome.run?.verdict ?? "(no run)"));
  record("7. verification subject", String(outcome.run?.subject?.kind ?? "(none)"));
  record("7. attempt still COMPLETED", String(controller.attemptWorkRecord(attemptId)?.state ?? "(none)"));
  const qualification = installed.verification.service.attemptResultQualification(attemptId);
  record("7. qualification.satisfied", String(qualification.satisfied));
  record("7. qualification detail", String(qualification.detail).slice(0, 140));

  /* -- 6. the ONE eligibility assessor, against CURRENT state --------------- */

  // The scheduler's own next decision moves the task to VERIFYING. One `step()` — never a pump, which
  // would run mechanical executors and could carry the chain into promotion.
  const preview = controller.preview();
  record("8. scheduler's next decision", `${preview.decision}/${String(preview.eventType)}`);
  if (preview.decision === "next" && preview.eventType === "TASK_VERIFYING") controller.step();
  const afterVerify = snapshot();
  record("8. task state", afterVerify.taskStates.join(","));

  const assessment = controller.promotionEligibility(attemptId);
  record("9. promotionEligibility.eligible", String(assessment.eligible));
  record("9. blockers", assessment.blockers.map((b) => b.kind).join(", ") || "(none)");
  record("9. attemptState / taskState", `${String(assessment.attemptState)} / ${String(assessment.taskState)}`);
  record("9. sourceCommit", String(assessment.sourceCommit).slice(0, 12));
  record("9. canonicalExpectedHead", String(assessment.canonicalExpectedHead).slice(0, 12));

  /* -- 7. the final ledger: what moved, and what did NOT -------------------- */

  const after = snapshot();
  const moved = (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]);
  record("Δ execution history (attempts)", `${String(before.attempts)} → ${String(after.attempts)} ${moved("attempts") ? "(CHANGED)" : "(unchanged)"}`);
  record("Δ events", `${String(before.events)} → ${String(after.events)} ${moved("events") ? "(CHANGED)" : "(unchanged)"}`);
  record("Δ canonical source HEAD", moved("canonicalHead") ? "MOVED" : "0 (unchanged)");
  record("Δ canonical working tree", moved("canonicalTree") ? "CHANGED" : "0 (unchanged)");
  record("Δ canonical refs", moved("canonicalRefs") ? "CHANGED" : "0 (unchanged)");
  record("Δ promotion events", moved("promotionEvents") ? "CHANGED" : "0 (unchanged)");
  record("Δ promotion rows", moved("promotionRows") ? "CHANGED" : "0 (unchanged)");

  const promotedSourceRevision = git(PROJECT, ["rev-parse", "HEAD"]);
  record("promoted source revision == H0", promotedSourceRevision === head ? "YES" : "NO");

  /* ------------------------------------------------------------------ report */

  process.stdout.write("=== §D2-LIVE: real async Work reaches promotion eligibility ===\n");
  process.stdout.write("=== without exercising promotion authority                ===\n");
  for (const [key, value] of findings) process.stdout.write(`${key.padEnd(52)} : ${value}\n`);

  const verdict = [
    ["work existed before delegation (no prose-created Work)", before.taskStates.join(",") === "t1:READY"],
    ["async start returned before the worker ran (barrier)", spawned && parkedPhase === "RUNNING"],
    ["worker ran in its own execution world", workerEnvLine !== null && samePath(workerEnvLine.cwd, worldPath)],
    ["worker was authority-closed", inheritedAuthority.length === 0],
    ["attempt COMPLETED", controller.attemptWorkRecord(attemptId)?.state === "COMPLETED"],
    ["result exported and readable", rReadable.startsWith("YES")],
    ["R carries the declared work and passes the declared test", fixWorks.startsWith("PASS")],
    ["followup changed nothing", JSON.stringify(beforeFollowup) === JSON.stringify(afterFollowup)],
    ["verification ran on an ATTEMPT_RESULT subject", outcome.run?.subject?.kind === "ATTEMPT_RESULT"],
    ["verification PASS", outcome.run?.verdict === "PASS"],
    ["qualification satisfied", qualification.satisfied === true],
    ["ELIGIBLE", assessment.eligible === true],
    ["canonical source unchanged", !moved("canonicalHead") && !moved("canonicalTree") && !moved("canonicalRefs")],
    ["zero promotion facts", !moved("promotionEvents") && !moved("promotionRows")],
    ["execution history moved", moved("attempts")],
  ];
  process.stdout.write("--- verdict ---\n");
  for (const [name, ok] of verdict) process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${name}\n`);
  const failed = verdict.filter(([, ok]) => !ok).map(([name]) => name);
  process.stdout.write(failed.length === 0 ? "\n§D2-LIVE: PASS\n" : `\n§D2-LIVE: FAIL (${failed.join("; ")})\n`);
  process.stdout.write("==============================\n");
  if (failed.length > 0) process.exitCode = 1;

  try {
    await deployment.close();
  } catch {
    /* the gate is done either way */
  }
}

main().catch((error) => {
  process.stderr.write(`rig failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
