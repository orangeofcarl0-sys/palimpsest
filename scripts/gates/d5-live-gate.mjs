import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * §D5-LIVE — the D5 system-level acceptance gate: the full result-continuation chain on TWO REAL
 * DSH workers and a REAL git repository, driven through the PACKAGED ResultContinuationService.
 *
 * PATHS COME FROM THE ENVIRONMENT (`scripts/gates/env.mjs`), exactly like the D2/D4 gates.
 *
 * The chain under test (ruling §26):
 *
 *   H0: two real workers (A, B) run concurrently in their own worlds → verify both
 *     → ordinary promotion of RA → H1 (first-parent)          B's result is now STALE
 *   → packaged continuation.inspect(RB)                        INCOMPATIBLE, rework available
 *   → caller supplies ONLY {result, expectedAssessmentDigest}
 *   → packaged continuation.startRework()
 *       fresh observation → D3-b assessment → permit mint → governed TASK_READY
 *       → G10-X head sync → D2-d delegation → real DSH worker B1 @ H1
 *   → B1 receives M1 + C(RB) → R_B1 → settle → independent verify → ordinary promotion → H2
 *
 * H0 → H1 → H2 must be a first-parent series: no merge commits, no automatic transplant, no
 * special rework promotion, no new task, no rewritten A0/B0 history. The gate itself is the
 * §24 UI/API proof: it has NO opportunity to pass `targetObservationDigest`, `reason`, `E0` or
 * `batchActivationEventId` — those are produced inside the packaged service.
 */
import { dshBin, dshHome, dshVersion, gateRepoRoot, gateRoot, installHostBundle } from "./env.mjs";

const REPO = gateRepoRoot();
const REAL_DSH = dshHome();
const RUN = gateRoot();
const RIG = `${RUN}/d5-live`;
const HOME = `${RIG}/home`;
const PROFILE = "d5live";
const PROJECT = `${RIG}/repo`;
const STATE = `${RIG}/state`;
const OUT = `${RIG}/out`;
const DSH_BIN = dshBin();
const TEE = new URL("./d4-live-tee-worker.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const WORKER_TIMEOUT_MS = 1_500_000;

const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const project = "d5live";

/* ------------------------------------------------------------------ fixture */

/**
 * The same two-defect fixture shape the D4 gate proved: two independent, mechanically checkable
 * defects; each Work task owns one. The oracle is a plain `node` script (the D2-LIVE run measured
 * that Node's test runner spawns files with piped stdio, which the PTC sandbox denies).
 */
function setupProject() {
  rmSync(PROJECT, { recursive: true, force: true });
  mkdirSync(`${PROJECT}/src`, { recursive: true });
  mkdirSync(`${PROJECT}/test`, { recursive: true });
  writeFileSync(
    `${PROJECT}/src/alpha.js`,
    [
      "// Label helper for the alpha record.",
      "// BUG: the label drops every field except `a`.",
      "export function alphaLabel(record) {",
      "  return `a=${record.a}`;",
      "}",
      "",
    ].join("\n"),
  );
  writeFileSync(
    `${PROJECT}/src/beta.js`,
    [
      "// Label helper for the beta record.",
      "// BUG: the label drops every field except `b`.",
      "export function betaLabel(record) {",
      "  return `b=${record.b}`;",
      "}",
      "",
    ].join("\n"),
  );
  writeFileSync(
    `${PROJECT}/test/check.js`,
    [
      'import assert from "node:assert/strict";',
      'import { alphaLabel } from "../src/alpha.js";',
      'import { betaLabel } from "../src/beta.js";',
      "",
      "const wanted = process.argv.slice(2);",
      "const covers = (name) => wanted.length === 0 || wanted.includes(name);",
      'if (covers("alpha")) assert.equal(alphaLabel({ a: 1, b: "x" }), "a=1 b=x", "alphaLabel must name both fields");',
      'if (covers("beta")) assert.equal(betaLabel({ a: 1, b: "x" }), "a=1 b=x", "betaLabel must name both fields");',
      "process.stdout.write(`ok: ${wanted.length === 0 ? \"alpha+beta\" : wanted.join(\",\")}` + String.fromCharCode(10));",
      "",
    ].join("\n"),
  );
  writeFileSync(
    `${PROJECT}/package.json`,
    `${JSON.stringify({ name: "d5live", private: true, type: "module", scripts: { test: "node test/check.js" } }, null, 2)}\n`,
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
  // A gate must run against the CURRENT host bundle, never a stale one.
  installHostBundle({ repo: REPO, realDshHome: REAL_DSH });
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

  const db = (n) => `${STATE}/${n}.sqlite`;
  writeFileSync(
    `${HOME}/profiles/${PROFILE}/deployment.json`,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        profileId: PROFILE,
        projectId: project,
        localPeer: "d5live-peer",
        persistentPoint: "pp-d5live",
        repository: PROJECT,
        transport: { namespace: PROFILE, databasePath: db("transport") },
        databases: {
          orchestration: db("orchestration"),
          ordarium: db("ordarium"),
          coordination: db("coordination"),
          transportCursors: db("cursors"),
        },
        reasoning: {},
        execution: "worktree",
        concurrency: 2,
        policy: { allowed_commands: [{ executable: "node", argv_prefix: ["test/check.js"] }] },
        standard: { statement: "两个测试都通过" },
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

/* ------------------------------------------------------------------- the run */

async function main() {
  setupProject();
  const head = git(PROJECT, ["rev-parse", "HEAD"]);
  setupHome();
  process.stdout.write(`project   ${PROJECT}\nhead      ${head}\nprofile   ${HOME}/profiles/${PROFILE}\nout       ${OUT}\n\n`);

  process.env.DSH_HOME = HOME;
  process.env.PALIMPSEST_REAL_DSH_BIN = DSH_BIN;
  process.env.PALIMPSEST_LIVE_GATE_OUT = OUT;

  const workWorker = await import(pathToFileURL(`${REPO}/dist/src/deployment/work_worker.js`).href);
  const advanced = await import(pathToFileURL(`${REPO}/dist/src/advanced.js`).href);
  const delegationModule = await import(pathToFileURL(`${REPO}/dist/src/interaction/work_delegation.js`).href);

  /**
   * THE D5-LIVE HOST FACT: the real DSH worker port reaches the packaged continuation service
   * through the launch host services — the same construction a DSH host performs. The initial
   * drives use the gate's own D2-d instance over the SAME port; the REWORK delegation is carried
   * by the PACKAGED service inside `installed.continuation`.
   */
  const realWorkerPort = () =>
    workWorker.dshSubprocessWorkWorkerPort({ dshBin: TEE, profile: PROFILE, timeoutMs: WORKER_TIMEOUT_MS });

  const profile = advanced.loadDeploymentProfile(`${HOME}/profiles/${PROFILE}/deployment.json`);
  const deployment = advanced.launchDeployment(profile, { host: { workWorkerPort: realWorkerPort } });
  const installed = deployment.installed;
  const controller = installed.controller;

  const findings = [];
  const record = (key, value) => {
    findings.push([key, value]);
    process.stdout.write(`  · ${key}: ${value}
`);
  };
  record("0. host DSH version", dshVersion());
  record("0. gate repo", REPO);
  record("0. fixture root", RIG);
  if (installed.continuation === undefined) throw new Error("the packaged continuation face is not composed");
  record("1. packaged continuation face", installed.continuation.adapterId);

  const call = async (name, args) => {
    const found = installed.tools.find((entry) => entry.name === name);
    if (found === undefined) throw new Error(`no core tool ${name}`);
    return await found.execute(args, {
      callId: `c-${name}`,
      rootCallId: `r-${name}`,
      name,
      arguments: args,
      signal: new AbortController().signal,
    });
  };

  const count = (sql, ...params) => controller.store.connection.prepare(sql).get(...params).c;

  /* -- 1. TWO real canonical Work tasks, declared through the public lifecycle -- */

  const TASK_SPECS = [
    {
      task_id: "ta",
      objective:
        "src/alpha.js 的 alphaLabel 只输出了字段 a。修好它，让 label 同时包含 a 和 b（形如 `a=1 b=x`），只改 src/alpha.js。改完在仓库根目录运行 `node test/check.js alpha` 确认通过，然后提交你的改动。",
      depends_on: [],
      // Overlapping write scopes: a flash-class agent sometimes fixes the sibling label too, and
      // the envelope's write_paths are a HARD settlement contract (D2) — with disjoint scopes
      // that honest overreach escalates every run. The D5-LIVE verdict is the continuation
      // chain, not the scope discipline (D2-LIVE already proved that), so both tasks own src/.
      write_paths: ["src"],
      required_artifacts: [],
    },
    {
      task_id: "tb",
      objective:
        "src/beta.js 的 betaLabel 只输出了字段 b。修好它，让 label 同时包含 a 和 b（形如 `a=1 b=x`）。另外在 src/beta.js 的第一行（export 之前）加上注释 `// beta label: renders every field`（必须原样，一字不差）。只改 src/beta.js。改完在仓库根目录运行 `node test/check.js beta` 确认通过，然后提交你的改动。",
      depends_on: [],
      write_paths: ["src"],
      required_artifacts: [],
    },
  ];

  await call("palimpsest_start", {
    projectId: project,
    goal: "make both record labels name every field",
    headCommit: head,
    tasks: TASK_SPECS,
  });

  /* -- 2. TWO real DSH workers run CONCURRENTLY at H0 (the gate's own D2-d instance) -- */

  const gateService = delegationModule.makeWorkDelegationService({ controller, workerFor: realWorkerPort });
  const attemptState = (attemptId) =>
    String(
      (
        controller.store.connection
          .prepare("SELECT state FROM attempts WHERE project_id=? AND attempt_id=?")
          .get(project, attemptId) ?? {}
      ).state ?? "(none)",
    );
  const taskStateOf = (taskId) =>
    String(
      (controller.store.connection.prepare("SELECT state FROM tasks WHERE project_id=? AND task_id=?").get(project, taskId) ?? {}).state ?? "(none)",
    );
  const started = [];
  const knownAttempts = () => started.flatMap((s) => s.attemptIds);
  const releaseNewSpawnedWorkers = () => {
    for (const entry of existsSync(OUT) ? readdirSync(OUT) : []) {
      if (!entry.endsWith(".spawned")) continue;
      const attemptId = entry.slice(0, -".spawned".length);
      if (!knownAttempts().includes(attemptId) && !existsSync(`${OUT}/${attemptId}.barrier`)) {
        writeFileSync(`${OUT}/${attemptId}.barrier`, "go");
      }
    }
  };
  const attemptIdOf = async (jobId) => {
    for (let i = 0; i < 600; i += 1) {
      const view = await gateService.followup({ jobId });
      if ("attemptId" in view && view.attemptId !== null) return view.attemptId;
      await sleep(100);
    }
    return null;
  };

  /**
   * ONE task's live drive, with the escalation RETRY a real agent population needs: a flash-class
   * model sometimes "helpfully" fixes the sibling defect too, the product's scope check refuses
   * (the attempt stays RUNNING), and the gate — as the operator — cancels the escalated attempt
   * and re-delegates. This is the product's escalation path being EXERCISED, not bypassed.
   */
  const driveTask = async (taskId) => {
    for (let round = 0; round < 3; round += 1) {
      // The scheduler decides WHEN a task may (re)start: while the sibling batch is still open the
      // next decision is idle, and a mutating start would be reordering. Wait for the scheduler's
      // own TASK_STARTED decision to point at THIS task.
      let lastProbe = null;
      for (let i = 0; i < 1200; i += 1) {
        const p = controller.preview();
        lastProbe = JSON.stringify(p);
        if (p.decision === "next" && p.eventType === "TASK_STARTED" && p.entityId === taskId) break;
        await sleep(250);
        if (i === 1199) {
          const states = ["ta", "tb"]
            .map((t) => `${t}=${String((controller.store.connection.prepare("SELECT state FROM tasks WHERE project_id=? AND task_id=?").get(project, t) ?? {}).state)}`)
            .join(", ");
          throw new Error(`the scheduler never offered TASK_STARTED for ${taskId}; last preview=${lastProbe}; tasks ${states}`);
        }
      }
      const s = await gateService.start({ expectedTaskId: taskId });
      const attemptId = await attemptIdOf(s.jobId);
      if (attemptId === null) throw new Error(`an attempt for ${taskId} never materialized`);
      started.push({ taskId, jobId: s.jobId, attemptIds: [attemptId] });
      record(`2. start(${taskId} round ${round})`, `${s.state} attempt=${String(attemptId).slice(0, 12)}`);
      writeFileSync(`${OUT}/${attemptId}.barrier`, "go");
      let terminal = null;
      for (let i = 0; i < 3000; i += 1) {
        releaseNewSpawnedWorkers();
        const view = await gateService.followup({ jobId: s.jobId });
        if (view.phase === "FINISHED" || view.phase === "HOST_ERROR") {
          terminal = view;
          break;
        }
        await sleep(200);
      }
      if (terminal === null) throw new Error(`job ${taskId} never reached a terminal phase`);
      if (terminal.phase === "HOST_ERROR") throw new Error(`worker ${taskId} host error: ${String(terminal.hostError)}`);
      if (attemptState(attemptId) === "COMPLETED") return attemptId;
      record(
        `2. escalated (${taskId} round ${round}) — reverting the world, cancelling, re-delegating`,
        String(JSON.stringify(terminal.settlement)).slice(0, 200),
      );
      // The product's own refusal names the recovery: "revert them or revise the plan". The gate,
      // as the operator, reverts the escalated world to the envelope basis, cancels the attempt
      // (a report the scope check can then accept), and re-delegates with a fresh agent run.
      const world = controller.observeAttemptResult(attemptId);
      const originRecord = controller.attemptWorkRecord(attemptId);
      const baseCommit = originRecord?.envelope?.base_commit ?? head;
      execFileSync("git", ["reset", "--hard", String(baseCommit)], { cwd: world.workDir });
      execFileSync("git", ["clean", "-fd"], { cwd: world.workDir });
      controller.report(attemptId, {
        workerStatus: "cancelled",
        summary: "gate retry: the agent's change did not settle (out-of-scope); world reverted, re-delegating the task",
      });
      // The cancel produces the batch's TASK_READY settlement; the BATCH RETRY is mechanical
      // progress that `runTurn` pumps (auto gate commands, batch retries) — without it the
      // scheduler stays idle and nothing re-arms the task.
      await controller.runTurn({ maxSteps: 12 });
      // A cancelled candidate burns the batch's budget: when it lands the task at FAILED, the
      // product's own refusal names the recovery — revise the plan. Re-declaring the SAME graph
      // re-arms the task with a fresh batch.
      const stateNow = taskStateOf(taskId);
      if (stateNow === "FAILED") {
        await call("palimpsest_plan", {
          tasks: TASK_SPECS,
          reason: "gate retry: re-arm a task whose batch failed after an escalated attempt was cancelled",
        });
      }
    }
    throw new Error(`task ${taskId} never completed within 3 agent runs`);
  };

  // Both tasks are STARTED back-to-back; each drive then waits for its own terminal phase.
  const [attemptA, attemptB] = await Promise.all([driveTask("ta"), driveTask("tb")]);
  record("3. both attempts COMPLETED", `${String(attemptA).slice(0, 12)}, ${String(attemptB).slice(0, 12)}`);

  /* -- 3. both tasks reach VERIFYING; independent verify; ordinary promotion of RA -- */

  let stepped = 0;
  for (let i = 0; i < 12; i += 1) {
    const p = controller.preview();
    if (p.decision !== "next") break;
    controller.step();
    stepped += 1;
  }
  record("4. tasks after stepping", String(stepped));

  const lastAttemptOf = (taskId) => {
    const ids = started.filter((s) => s.taskId === taskId).flatMap((s) => s.attemptIds);
    return ids[ids.length - 1];
  };
  for (const taskId of ["ta", "tb"]) {
    await controller.gate({ attemptId: lastAttemptOf(taskId), predicate: "tests_pass", command: ["node", "test/check.js", taskId === "ta" ? "alpha" : "beta"] });
  }
  stepped = 0;
  for (let i = 0; i < 12; i += 1) {
    const p = controller.preview();
    if (p.decision !== "next") break;
    controller.step();
    stepped += 1;
  }
  const taskState = (taskId) =>
    String(
      (controller.store.connection.prepare("SELECT state FROM tasks WHERE project_id=? AND task_id=?").get(project, taskId) ?? {}).state,
    );
  if (!["ta", "tb"].every((taskId) => taskState(taskId) === "VERIFYING")) {
    throw new Error(`tasks not VERIFYING: ${["ta", "tb"].map((taskId) => `${taskId}=${taskState(taskId)}`).join(", ")}`);
  }
  record("4. both tasks VERIFYING", "YES");

  const resultCommitOf = (attemptId) => {
    const row = controller.store.connection
      .prepare("SELECT report_json FROM attempts WHERE project_id=? AND attempt_id=?")
      .get(project, attemptId);
    const report = JSON.parse(new TextDecoder().decode(row.report_json));
    return String(report.result_commit);
  };
  const h0 = git(PROJECT, ["rev-parse", "HEAD"]);
  const eligibilityA = controller.promotionEligibility(attemptA);
  await controller.promote(attemptA, resultCommitOf(attemptA), eligibilityA.canonicalExpectedHead);
  controller.step();
  const h1 = git(PROJECT, ["rev-parse", "HEAD"]);
  if (h1 === h0) throw new Error("promotion did not move the canonical head");
  record("5. RA promoted (ordinary authority)", `H0 ${h0.slice(0, 12)} → H1 ${h1.slice(0, 12)}`);
  record("5. RB is now STALE", `task tb = ${taskState("tb")}`);

  /* -- 4. the PACKAGED continuation: inspect, then startRework with ONLY the digest -- */

  const refB = { kind: "ATTEMPT_RESULT", ref: attemptB };
  const inspection = installed.continuation.inspect({ result: refB });
  record(
    "6. packaged inspect(RB)",
    `${inspection.compatibility.outcome} (issuance=${String(inspection.compatibility.issuanceDigest).slice(0, 16)}, rework=${String(inspection.availableActions.rework)})`,
  );
  if (inspection.compatibility.outcome !== "INCOMPATIBLE") {
    throw new Error(`expected INCOMPATIBLE for the stale result, got ${inspection.compatibility.outcome}`);
  }
  if (inspection.availableActions.rework !== true) throw new Error("packaged inspection does not offer rework");

  // THE CALLER'S ENTIRE AUTHORITY SURFACE: result identity + the assessment digest. Nothing else
  // is passable — the target digest, E0, the batch anchor and the reason are minted inside.
  const eventsBefore = count("SELECT COUNT(*) AS c FROM events WHERE project_id=?", project);
  const outcome = await installed.continuation.startRework({
    result: refB,
    expectedAssessmentDigest: inspection.assessment.assessmentDigest,
  });
  record("6. packaged startRework(RB)", `${outcome.state} reopened=${String(outcome.reopenedEventId)} headSynced=${String(outcome.headSynced)} job=${String(outcome.jobId).slice(0, 12)}`);
  if (outcome.state !== "DELEGATED") {
    throw new Error(`packaged startRework returned ${outcome.state}: ${outcome.detail}`);
  }
  const reworkEvents = count(
    "SELECT COUNT(*) AS c FROM events WHERE project_id=? AND event_type='TASK_READY' AND payload_json LIKE '%rework_provenance%'",
    project,
  );
  if (reworkEvents !== 1) throw new Error(`expected exactly one governed reopening, found ${reworkEvents}`);
  record("6. exactly one governed TASK_READY", String(reworkEvents));

  /* -- 5. B1 runs on H1 through the REAL DSH worker; verify; ordinary promotion → H2 -- */

  /**
   * B1's job handle lives in the PACKAGED service's own D2-d instance (the composition created it),
   * so the gate waits on the DURABLE state: a new attempt row for tb reaching COMPLETED. The
   * spawned-worker release still runs here — the re-execution worker parks behind its own barrier
   * like every other worker in this rig.
   */
  let b1 = null;
  for (let i = 0; i < 3000; i += 1) {
    releaseNewSpawnedWorkers();
    const row = controller.store.connection
      .prepare("SELECT attempt_id, state FROM attempts WHERE project_id=? AND task_id=? ORDER BY rowid DESC LIMIT 1")
      .get(project, "tb");
    if (row !== undefined && String(row.attempt_id) !== attemptB) {
      b1 = String(row.attempt_id);
      if (attemptState(b1) === "COMPLETED") break;
    }
    await sleep(200);
    if (i === 2999) throw new Error("B1 never finished");
  }
  if (b1 === null) throw new Error("B1's attempt id never surfaced");
  if (b1 === attemptB) throw new Error("no new attempt was created for the re-execution");
  if (attemptState(b1) !== "COMPLETED") throw new Error(`B1 is ${attemptState(b1)}, not COMPLETED`);
  record("7. B1 re-executed on H1", `${b1.slice(0, 12)} COMPLETED`);

  await controller.gate({ attemptId: b1, predicate: "tests_pass", command: ["node", "test/check.js", "beta"] });
  controller.step();
  if (taskState("tb") !== "VERIFYING") throw new Error(`tb is ${taskState("tb")}, not VERIFYING`);
  const eligibilityB1 = controller.promotionEligibility(b1);
  if (!eligibilityB1.eligible) {
    throw new Error(`B1 not eligible: ${eligibilityB1.blockers.map((b) => b.kind).join(",")}`);
  }
  await controller.promote(b1, resultCommitOf(b1), eligibilityB1.canonicalExpectedHead);
  controller.step();
  const h2 = git(PROJECT, ["rev-parse", "HEAD"]);
  if (h2 === h1) throw new Error("B1's promotion did not move the canonical head");
  record("8. RB1 promoted (ordinary authority)", `H1 ${h1.slice(0, 12)} → H2 ${h2.slice(0, 12)}`);

  /* -- 6. the invariants the ruling demands -- */

  // first-parent series H0 → H1 → H2: the ONLY merges in the whole range are the two ordinary
  // promotion merges (`promote <id>`, --no-ff by design) on the first-parent spine — no rework
  // special merge, no transplant, no side branch.
  const allMerges = git(PROJECT, ["log", "--merges", "--format=%s", `${h0}..${h2}`])
    .split("\n")
    .filter((line) => line.trim() !== "" && !/^[0-9a-f]{40}$/u.test(line.trim()));
  const fpMerges = git(PROJECT, ["rev-list", "--first-parent", "--merges", `${h0}..${h2}`])
    .split("\n")
    .filter((line) => line.trim() !== "");
  const promotionsOnly =
    allMerges.length === 2 && fpMerges.length === 2 && allMerges.every((line) => line.trim().startsWith("promote "));
  if (!promotionsOnly) {
    throw new Error(`the promotion history is not a clean first-parent promote series: merges=${JSON.stringify(allMerges)} fp=${JSON.stringify(fpMerges)}`);
  }
  record("9. H0→H1→H2 first-parent, exactly the two ordinary promotion merges", "YES");

  // A0/B0 history never rewritten: every attempt (including escalated retries) keeps its events.
  for (const s of started) {
    for (const attemptId of s.attemptIds) {
      const events = count("SELECT COUNT(*) AS c FROM events WHERE project_id=? AND entity_id=?", project, attemptId);
      if (events < 3) throw new Error(`attempt ${attemptId} history was rewritten`);
    }
  }
  record("9. origin attempt history immutable", "YES");

  // The durable lineage names the origin result and carries the assessment digest.
  const lineageRow = controller.store.connection
    .prepare(
      "SELECT payload_json FROM events WHERE project_id=? AND event_type='TASK_READY' AND payload_json LIKE '%rework_provenance%' ORDER BY event_id DESC LIMIT 1",
    )
    .get(project);
  const payload = JSON.parse(new TextDecoder().decode(lineageRow.payload_json));
  const provenance = payload.rework_provenance;
  record(
    "9. durable lineage",
    `origin=${provenance.origin_result_subject.ref.slice(0, 12)} reason=${provenance.reason} assessment=${String(provenance.continuation_assessment_digest ?? "").slice(0, 12)}`,
  );
  if (provenance.origin_result_subject.ref !== attemptB) throw new Error("the lineage does not name the origin result");
  if (provenance.reason !== "INCOMPATIBLE") throw new Error(`the lineage reason is ${provenance.reason}`);

  // The worker CONTEXT delivery is verified through its durable shadow (D5-c2b): the kernel compiles
  // a per-attempt manifest RIGHT BEFORE the worker runs, so B1 must carry a CONTEXT_MANIFEST_ADDED
  // whose manifest includes the read-only continuation naming this rework's lineage.
  const manifestRow = controller.store.connection
    .prepare(
      "SELECT payload_json FROM events WHERE project_id=? AND event_type='CONTEXT_MANIFEST_ADDED' ORDER BY event_id DESC LIMIT 1",
    )
    .get(project);
  const manifest = JSON.parse(new TextDecoder().decode(manifestRow.payload_json)).manifest;
  if (manifest.task_id !== "tb" || manifest.continuation === undefined) {
    throw new Error("the re-executed attempt has no per-attempt manifest with a continuation block");
  }
  if (manifest.continuation.lineage.reason !== "INCOMPATIBLE") {
    throw new Error("the delivered continuation does not name the rework lineage");
  }
  record("9. B1 received M1 + C(RB)", `manifest=${String(manifest.manifest_id).slice(0, 16)} continuation=yes`);

  // NO authority object ever reached a worker or the durable report surface.
  const surfaces = [
    JSON.stringify(manifest),
    (() => {
      const row = controller.store.connection
        .prepare("SELECT report_json FROM attempts WHERE project_id=? AND attempt_id=?")
        .get(project, b1);
      return row.report_json === null ? "{}" : new TextDecoder().decode(row.report_json);
    })(),
    ...[...started.map((x) => x.attemptId), b1]
      .map((s) => `${OUT}/${s}.transcript.txt`)
      .filter((file) => existsSync(file))
      .map((file) => readFileSync(file, "utf8")),
  ];
  for (const surface of surfaces) {
    for (const forbidden of ["permitDigest", "targetFence", "issuanceDigest", "observationRefs", "reworkPermit"]) {
      if (surface.includes(forbidden)) throw new Error(`an authority object leaked to a worker surface: ${forbidden}`);
    }
  }
  record("9. no authority in any worker surface", "YES");

  record("10. task states at close", `${taskState("ta")}, ${taskState("tb")}`);

  /* ------------------------------------------------------------------ verdict */

  const required = [
    ["the packaged continuation face is composed", () => true],
    ["both real workers ran concurrently at H0", () => ["ta", "tb"].every((taskId) => attemptState(lastAttemptOf(taskId)) === "COMPLETED")],
    ["the stale result is INCOMPATIBLE to the packaged inspection", () => inspection.compatibility.outcome === "INCOMPATIBLE"],
    ["packaged startRework carried the whole chain", () => outcome.state === "DELEGATED" && outcome.headSynced === true],
    ["exactly one governed reopening", () => reworkEvents === 1],
    ["B1 re-executed on H1 and completed", () => b1 !== attemptB && attemptState(b1) === "COMPLETED"],
    ["B1 promoted the ordinary way to H2", () => h2 !== h1],
    ["H0→H1→H2 is a first-parent promote series", () => {
      const all = git(PROJECT, ["log", "--merges", "--format=%s", `${h0}..${h2}`])
        .split(String.fromCharCode(10))
        .filter((l) => l.trim() !== "" && !/^[0-9a-f]{40}$/u.test(l.trim()));
      const fp = git(PROJECT, ["rev-list", "--first-parent", "--merges", `${h0}..${h2}`])
        .split(String.fromCharCode(10))
        .filter((l) => l.trim() !== "");
      return all.length === 2 && fp.length === 2 && all.every((l) => l.trim().startsWith("promote "));
    }],
    ["origin history never rewritten", () => started.every((s) => s.attemptIds.every((attemptId) => count("SELECT COUNT(*) AS c FROM events WHERE project_id=? AND entity_id=?", project, attemptId) >= 3))],
    ["B1 received M1 + C(RB)", () => manifest.task_id === "tb" && manifest.continuation !== undefined],
  ];
  let ok = true;
  process.stdout.write("\n");
  for (const [label, check] of required) {
    let value = false;
    try {
      value = check();
    } catch (error) {
      process.stdout.write(`FAIL  ${label} — ${String(error)}\n`);
      ok = false;
      continue;
    }
    process.stdout.write(`${value ? "PASS" : "FAIL"}  ${label}\n`);
    if (!value) ok = false;
  }
  process.stdout.write(`\n§D5-LIVE: ${ok ? "PASS" : "FAIL"}\n`);
  if (process.env.PALIMPSEST_GATE_FINDINGS === "1") {
    for (const [key, value] of findings) process.stdout.write(`  ${key}: ${value}\n`);
  }
  process.stdout.write("\n");
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(`d5-live gate failed: ${error?.stack ?? String(error)}\n`);
  process.exit(1);
});
