#!/usr/bin/env node
/**
 * §D4-LIVE — the D4 system-level acceptance gate.
 *
 *     TWO REAL workers, in TWO speculative worlds, at the SAME basis, AT THE SAME TIME
 *       → both settle through the ONE D2-e1 spine
 *       → canonical source unchanged (speculative ≠ canonical)
 *       → the FIRST result is canonicalized by the REAL promotion authority
 *       → the SECOND is CORRECTLY NOT REUSED
 *
 * WHAT THIS GATE CLAIMS, stated precisely, because the tempting overclaim is wrong:
 *
 *     serial canonicalization still holds under REAL concurrency
 *
 * NOT "two results can both be reused". D4-c-1 measured that this deployment's only honest read
 * footprint is the whole repository, so a second result is genuinely not reusable against a change the
 * first one made — and that is the CORRECT conclusion under the evidence available, not a defect to be
 * papered over. The value of the gate is that it exercises the claim under real concurrency, with real
 * workers, real git and the real authorities, rather than under a fake worker with a barrier.
 *
 * The D3 chain is run on the live results (observe → prove → admit) so the refusal is shown to be a
 * SEMANTIC answer about the evidence rather than an unimplemented path.
 *
 * THE BARRIER, not a clock: both workers are parked before doing any work, so "two worlds existed at the
 * same moment" is measured rather than inferred from timing — the same discipline D2-LIVE used, extended
 * to two workers (each marker is derived from its own world path).
 */
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * §D4-LIVE — the D4 system-level acceptance gate.
 *
 * PATHS COME FROM THE ENVIRONMENT (`scripts/gates/env.mjs`) so a fresh checkout can re-run this gate
 * without editing it. See `scripts/gates/README.md` for invocation, the DSH version it was last run
 * against, the host constraints it requires, and its expected assertion count.
 */
import { dshBin, dshHome, dshVersion, gateRepoRoot, gateRoot, installHostBundle } from "./env.mjs";

const REPO = gateRepoRoot();
const REAL_DSH = dshHome();
const RUN = gateRoot();
const RIG = `${RUN}/d4-live`;
const HOME = `${RIG}/home`;
const PROFILE = "d4live";
const PROJECT = `${RIG}/repo`;
const STATE = `${RIG}/state`;
const OUT = `${RIG}/out`;
const DSH_BIN = dshBin();
const TEE = new URL("./d4-live-tee-worker.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const WORKER_TIMEOUT_MS = 1_500_000;

const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const porcelain = (cwd) =>
  git(cwd, ["status", "--porcelain"])
    .split(String.fromCharCode(10))
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.endsWith(".palimpsest/"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const samePath = (a, b) =>
  String(a).split(String.fromCharCode(92)).join("/").replace(/\/+$/u, "") ===
  String(b).split(String.fromCharCode(92)).join("/").replace(/\/+$/u, "");

/* ------------------------------------------------------------------ fixture */

/**
 * A real repository with TWO real, independent, mechanically checkable defects in two different files.
 * Neither path touches a boundary fragment (`schema`/`contract`/…), so no task REQUIRES an independent
 * verification: D2-LIVE already proved that path, and repeating it here would only make a longer list
 * while obscuring the concurrency question this gate exists to ask.
 *
 * The oracle is a plain `node` script rather than `node --test`, because the D2-LIVE run MEASURED that
 * Node's test runner spawns test files with piped stdio, which the PTC sandbox denies (spawn EPERM).
 * That is a sandbox property; a plain script exercises the same "the declared command really passes"
 * property without depending on it.
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
      "/**",
      " * The project's done-ness, over whichever labels are named.",
      " *",
      " * The filter exists because the repository has TWO independent defects and each Work task owns one",
      " * of them: a worker in an isolated world can only be asked to verify what it was asked to fix.",
      " * With no argument the check covers BOTH, which is the project-wide claim a release must satisfy.",
      " */",
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
    `${JSON.stringify({ name: "d4live", private: true, type: "module", scripts: { test: "node test/check.js" } }, null, 2)}\n`,
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
  /**
   * The profile resolves `palimpsest-dsh-host` from the REAL DSH home, so the CURRENT host bundle is
   * copied there — a gate that ran against a stale bundle would be measuring a build nobody shipped.
   */
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
        projectId: "d4live",
        localPeer: "d4live-peer",
        persistentPoint: "pp-d4live",
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
        // §D4-a: THE OPERATOR DECLARES THE CAPACITY. This one line is what makes a second speculative
        // world admissible at all; with it absent the scheduler holds exactly one ACTIVE task.
        concurrency: 2,
        policy: { allowed_commands: [{ executable: "node", argv_prefix: ["test/check.js"] }] },
        standard: { statement: "两个测试都通过，且只改自己声明的文件" },
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
  const pw = await import(pathToFileURL(`${REPO}/dist/src/project_world/index.js`).href);
  const sco = await import(pathToFileURL(`${REPO}/dist/src/deployment/source_change_observer.js`).href);

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
  const snapshot = () => ({
    canonicalHead: git(PROJECT, ["rev-parse", "HEAD"]),
    canonicalTree: porcelain(PROJECT),
    canonicalRefs: git(PROJECT, ["for-each-ref", "--format=%(refname) %(objectname)"]),
    events: count("SELECT COUNT(*) AS c FROM events WHERE project_id=?", "d4live"),
    promotionEvents: count("SELECT COUNT(*) AS c FROM events WHERE project_id=? AND event_type LIKE 'PROMOTION%'", "d4live"),
    promotionRows: count("SELECT COUNT(*) AS c FROM promotions WHERE project_id=?", "d4live"),
    attempts: count("SELECT COUNT(*) AS c FROM attempts WHERE project_id=?", "d4live"),
    taskStates: controller.store.connection
      .prepare("SELECT task_id, state FROM tasks WHERE project_id=? ORDER BY task_id")
      .all("d4live")
      .map((row) => `${String(row.task_id)}:${String(row.state)}`),
  });

  /* -- 1. TWO real canonical Work tasks, declared through the public lifecycle -- */

  await call("palimpsest_start", {
    projectId: "d4live",
    goal: "make both record labels name every field",
    headCommit: head,
    tasks: [
      {
        task_id: "t1",
        objective:
          "src/alpha.js 的 alphaLabel 只输出了字段 a。修好它，让 label 同时包含 a 和 b（形如 `a=1 b=x`），只改 src/alpha.js。改完在仓库根目录运行 `node test/check.js alpha` 确认通过，然后提交你的改动。",
        depends_on: [],
        write_paths: ["src/alpha.js"],
        required_artifacts: [],
      },
      {
        task_id: "t2",
        objective:
          "src/beta.js 的 betaLabel 只输出了字段 b。修好它，让 label 同时包含 a 和 b（形如 `a=1 b=x`），只改 src/beta.js。改完在仓库根目录运行 `node test/check.js beta` 确认通过，然后提交你的改动。",
        depends_on: [],
        write_paths: ["src/beta.js"],
        required_artifacts: [],
      },
    ],
  });
  const before = snapshot();
  record("1. work existed before delegation", `tasks ${before.taskStates.join(", ")}`);
  record("1. declared concurrency", String(profile.concurrency ?? "(absent ⇒ 1)"));

  /* -- 2. TWO async starts, BOTH workers parked behind their own barrier -------- */

  const service = delegationModule.makeWorkDelegationService({
    controller,
    workerFor: () =>
      workWorker.dshSubprocessWorkWorkerPort({ dshBin: TEE, profile: PROFILE, timeoutMs: WORKER_TIMEOUT_MS }),
  });

  /**
   * The gate's OWN mutable record. `service.start` returns a FROZEN product object, and this module is
   * ESM (strict mode), so writing the attempt id back onto it throws rather than silently failing —
   * which is how the first run of this gate hung with two parked workers and no output.
   */
  const started = [];
  for (const taskId of ["t1", "t2"]) {
    const s = await service.start({ expectedTaskId: taskId });
    started.push({ taskId, jobId: s.jobId, state: s.state, resumed: s.resumed, attemptId: null });
    record(`2. start(${taskId}) returned`, `${s.state} task=${s.taskId} job=${s.jobId.slice(0, 12)}`);
  }

  // Wait for BOTH worker processes to have STARTED (so both `prepare`s succeeded) and to be parked.
  const markers = (suffix) =>
    started.map((s) => ({ taskId: s.taskId, attemptId: s.attemptId, path: s.attemptId === null ? null : `${OUT}/${s.attemptId}.${suffix}` }));
  const attemptIdOf = async (jobId) => {
    for (let i = 0; i < 600; i += 1) {
      const view = await service.followup({ jobId });
      if ("attemptId" in view && view.attemptId !== null) return view.attemptId;
      await sleep(100);
    }
    return null;
  };
  for (const s of started) s.attemptId = await attemptIdOf(s.jobId);
  record("2. both attempts exposed", started.map((s) => `${s.taskId}=${String(s.attemptId).slice(0, 16)}`).join(" "));

  const spawned = markers("spawned");
  for (let i = 0; i < 900 && !spawned.every((m) => existsSync(m.path)); i += 1) await sleep(100);
  record("3. BOTH worker processes started while start() had returned", spawned.every((m) => existsSync(m.path)) ? "YES (both parked)" : "NO");

  const worlds = new Map();
  for (const m of spawned) {
    const world = controller.observeAttemptResult(m.attemptId);
    if (world === null) throw new Error(`the execution world of ${m.taskId} is not observable`);
    worlds.set(m.taskId, world.workDir);
  }
  const worldHeads = [...worlds.entries()].map(([taskId, dir]) => `${taskId}:${git(dir, ["rev-parse", "HEAD"]) === head ? "==H0" : "MOVED"}`);
  record("3. both worlds exist, both at base", worldHeads.join(" "));
  record("3. the two worlds are DIFFERENT directories", new Set(worlds.values()).size === 2 ? "YES" : "NO");
  record("3. canonical HEAD still base while both are parked", git(PROJECT, ["rev-parse", "HEAD"]) === head ? "YES" : "NO");
  const parkedAttempts = controller.store.connection
    .prepare("SELECT task_id, state FROM attempts WHERE project_id=? ORDER BY task_id")
    .all("d4live");
  record("3. both attempts RUNNING at once", parkedAttempts.map((r) => `${String(r.task_id)}:${String(r.state)}`).join(" "));

  // Release BOTH workers.
  for (const m of spawned) writeFileSync(`${OUT}/${m.attemptId}.barrier`, "go");

  /* -- 3. both workers really work, then the ONE settlement spine -------------- */

  const views = [];
  for (const s of started) {
    let view = null;
    for (let i = 0; i < 9000; i += 1) {
      const candidate = await service.followup({ jobId: s.jobId });
      if ("phase" in candidate && (candidate.phase === "FINISHED" || candidate.phase === "HOST_ERROR")) {
        view = candidate;
        break;
      }
      await sleep(500);
    }
    if (view === null) throw new Error(`job ${s.jobId} (${s.taskId}) never reached a terminal host phase`);
    views.push({ taskId: s.taskId, view });
  }
  for (const { taskId, view } of views) {
    record(`4. job terminal phase (${taskId})`, `${view.phase}${view.hostError === null ? "" : ` — ${String(view.hostError).slice(0, 160)}`}`);
  }

  const workerEnv = (attemptId) => {
    const file = `${OUT}/${attemptId}.transcript.txt`;
    if (!existsSync(file)) return null;
    const text = readFileSync(file, "utf8");
    const at = text.lastIndexOf("PALIMPSEST_WORKER_ENV ");
    if (at < 0) return null;
    try {
      return JSON.parse(text.slice(at + "PALIMPSEST_WORKER_ENV ".length).split(String.fromCharCode(10))[0]);
    } catch {
      return null;
    }
  };
  for (const s of started) {
    const env = workerEnv(s.attemptId);
    record(`4. worker cwd == its own world (${s.taskId})`, env === null ? "(no telemetry)" : samePath(env.cwd, worlds.get(s.taskId)) ? "YES" : `NO (${String(env.cwd)})`);
    record(`4. worker presentation (${s.taskId})`, env?.presentation ?? "(native)");
    const authority = (env?.offeredTools ?? []).filter((n) => typeof n === "string" && n.startsWith("palimpsest_") && n !== "palimpsest_worker_result");
    record(`4. inherited Palimpsest authority (${s.taskId})`, authority.length === 0 ? "NONE (authority-closed)" : JSON.stringify(authority));
  }

  const afterSettle = snapshot();
  record("5. attempt states", afterSettle.taskStates.join(", "));
  const results = [];
  for (const s of started) {
    const rec = controller.attemptWorkRecord(s.attemptId);
    const report = rec?.report ?? null;
    results.push({
      taskId: s.taskId,
      attemptId: s.attemptId,
      state: String(rec?.state ?? "(none)"),
      resultCommit: report?.result_commit ?? null,
      changedFiles: report?.changed_files ?? [],
    });
  }
  for (const r of results) {
    record(`5. ${r.taskId} attempt`, `${r.state} result=${String(r.resultCommit).slice(0, 12)} changed=${JSON.stringify(r.changedFiles)}`);
  }
  record("5. both attempts COMPLETED", results.every((r) => r.state === "COMPLETED") ? "YES" : "NO");
  record("5. the two results are DIFFERENT commits", results[0].resultCommit !== results[1].resultCommit ? "YES" : "NO");
  record("5. each result is readable in the canonical object universe", results.every((r) => {
    try {
      git(PROJECT, ["cat-file", "-e", `${String(r.resultCommit)}^{commit}`]);
      return true;
    } catch {
      return false;
    }
  }) ? "YES (both exported)" : "NO");
  record("5. canonical source HEAD after settlement", afterSettle.canonicalHead === head ? "== H0 (unchanged)" : `MOVED to ${afterSettle.canonicalHead.slice(0, 12)}`);
  record("5. promotion facts after settlement", `${String(afterSettle.promotionEvents)} events / ${String(afterSettle.promotionRows)} rows (before: ${String(before.promotionEvents)}/${String(before.promotionRows)})`);

  /* -- 4. the scheduler moves BOTH tasks to VERIFYING -------------------------- */

  let steps = 0;
  for (let i = 0; i < 12; i += 1) {
    const p = controller.preview();
    if (p.decision !== "next") break;
    controller.step();
    steps += 1;
  }
  const afterSteps = snapshot();
  record("6. task states after stepping", `${afterSteps.taskStates.join(", ")} (${String(steps)} step(s))`);
  const eligibilityBefore = results.map((r) => ({ taskId: r.taskId, e: controller.promotionEligibility(r.attemptId) }));
  for (const { taskId, e } of eligibilityBefore) {
    record(`6. ${taskId} eligible BEFORE any canonicalization`, `${String(e.eligible)} blockers=${e.blockers.map((b) => b.kind).join(",") || "(none)"} expectedHead=${String(e.canonicalExpectedHead).slice(0, 12)}`);
  }

  /* -- 5. the REAL promotion authority canonicalizes the FIRST result ---------- */

  const first = results.find((r) => r.taskId === "t1");
  const second = results.find((r) => r.taskId === "t2");
  const firstEligibility = controller.promotionEligibility(first.attemptId);
  let h1 = null;
  try {
    const out = await controller.promote(first.attemptId, first.resultCommit, firstEligibility.canonicalExpectedHead);
    h1 = out.resultingHeadCommit;
    record("7. t1 promoted by the REAL authority", `${out.promotionId.slice(0, 24)} → ${h1.slice(0, 12)}`);
  } catch (error) {
    record("7. t1 promotion REFUSED", String(error.message).slice(0, 220));
  }
  record("7. canonical HEAD after the first canonicalization", `${git(PROJECT, ["rev-parse", "HEAD"]).slice(0, 12)} (was ${head.slice(0, 12)})`);
  record("7. canonical contains t1's work", (() => {
    try {
      return git(PROJECT, ["show", `${git(PROJECT, ["rev-parse", "HEAD"])}:src/alpha.js`]).includes("b=") ? "YES" : "NO";
    } catch {
      return "?";
    }
  })());
  record("7. canonical does NOT yet contain t2's work", (() => {
    try {
      return git(PROJECT, ["show", `${git(PROJECT, ["rev-parse", "HEAD"])}:src/beta.js`]).includes("a=") ? "NO (already there)" : "YES (absent, as expected)";
    } catch {
      return "?";
    }
  })());

  /* -- 6. the SECOND result is CORRECTLY NOT REUSED ---------------------------- */

  const secondEligibility = controller.promotionEligibility(second.attemptId);
  record("8. t2 eligible after canonical moved", `${String(secondEligibility.eligible)} blockers=${secondEligibility.blockers.map((b) => b.kind).join(",") || "(none)"}`);
  let secondRefusal = null;
  try {
    await controller.promote(second.attemptId, second.resultCommit, secondEligibility.canonicalExpectedHead);
    record("8. t2 promotion", "PROMOTED (unexpected)");
  } catch (error) {
    secondRefusal = String(error.message);
    record("8. t2 promotion REFUSED", secondRefusal.split("—")[0].trim().slice(0, 200));
  }

  /**
   * The D3 chain, on the LIVE results: is the refusal merely unimplemented, or is it the correct
   * SEMANTIC answer about the evidence? Observe → prove, with the real observer and the real issuer.
   */
  const observations = pw.makeObservationAuthority({ databasePath: `${STATE}/observations.sqlite` });
  const issuer = pw.makeCompatibilityIssuer({
    issuerId: "palimpsest-first-party",
    observations,
    databasePath: `${STATE}/issuance.sqlite`,
  });
  const sourceRecorder = observations.registerObserver({
    observerId: sco.GIT_SOURCE_OBSERVER_ID,
    observerVersion: sco.GIT_SOURCE_OBSERVER_VERSION,
    mechanism: sco.GIT_SOURCE_MECHANISM,
  });
  const conservative = observations.registerObserver({ observerId: "world-materializer", observerVersion: "1", mechanism: "CONSERVATIVE_DOMAIN" });
  const sourceObserver = sco.gitSourceChangeObserver({ repository: PROJECT, recorder: sourceRecorder });
  const scope = (domain, from, to) => ({ domain, scopeRef: PROJECT, from, to });
  const unobservable = (domain) =>
    conservative.unavailable({ domain, detail: `no first-party observer exists for the ${domain} change domain` });

  // What moved between the basis t2 was authorized at and the world NOW.
  const changeRef = sourceObserver.observeChange({ fromRevision: head, toRevision: h1, scopeRef: PROJECT });
  const changeRecord = observations.recall(changeRef);
  record("9. observed change H0..H1", `${changeRecord.state} ${JSON.stringify((changeRecord.selectors ?? []).map((s) => (s.domain === "source" && s.scope === "path" ? s.path : s.domain)))}`);

  // t2's own WRITE footprint, from the diff the product already takes: an execution fact.
  const writePaths = git(PROJECT, ["diff", "--name-only", `${head}..${second.resultCommit}`]).split(String.fromCharCode(10)).filter((l) => l !== "");
  const writeRef = sourceRecorder.record({ scope: scope("source", head, second.resultCommit), selectors: pw.sourceChangeFootprintFromPaths({ paths: writePaths }).selectors });
  record("9. t2's observed write footprint", JSON.stringify(writePaths));

  // t2's READ footprint: the honest first-party answer is the whole repository (D4-c-1).
  const readRef = conservative.record({ scope: scope("source", head, head), selectors: [pw.REPOSITORY_SOURCE] });

  const certificate = issuer.issue({
    resultManifestDigest: `attempt-result:${second.attemptId}`,
    originBasisDigest: `basis:${head}`,
    targetObservationDigest: h1,
    exactlyCurrent: false,
    observationRefs: {
      projectSemantic: unobservable("project_semantic"),
      source: changeRef,
      assets: unobservable("assets"),
      environment: unobservable("environment"),
      resultReads: readRef,
      resultWrites: writeRef,
    },
  });
  const assessment = certificate.assessment;
  record("9. t2 vs the new basis: compatibility", `${assessment.outcome} (proofs=${String(assessment.disjointnessProofs.length)}, conflicts=${String(assessment.conflicts.length)}, unknowns=${String(assessment.unknowns.length)})`);
  record("9. conflict kinds", assessment.conflicts.map((c) => `${c.side}/${c.kind}`).join(", ") || "(none)");
  record("9. the READ side is what blocks reuse", assessment.conflicts.some((c) => c.side === "read") ? "YES (whole-repository read)" : "NO");

  const admission = pw.admitCrossBasis({
    issuer,
    presented: certificate,
    resultManifestDigest: `attempt-result:${second.attemptId}`,
    originBasisDigest: `basis:${head}`,
    targetObservationDigest: h1,
    hasBasis: true,
  });
  record("9. cross-basis admission of t2", `${admission.state} admitted=${String(admission.admitted)}`);
  record("9. is the refusal a SEMANTIC answer, not a missing path?", admission.admitted === false && assessment.outcome === "INCOMPATIBLE" ? "YES — the evidence says not reusable" : "NO");

  /* -- 7. the final ledger ----------------------------------------------------- */

  const after = snapshot();
  const moved = (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]);
  record("10. Δ canonical source HEAD", moved("canonicalHead") ? `MOVED ${head.slice(0, 12)} → ${after.canonicalHead.slice(0, 12)}` : "0 (unchanged)");
  record("10. Δ canonical working tree", moved("canonicalTree") ? JSON.stringify(after.canonicalTree) : "0 (unchanged)");
  record("10. Δ promotion rows", `${String(before.promotionRows)} → ${String(after.promotionRows)}`);
  record("10. Δ attempts", `${String(before.attempts)} → ${String(after.attempts)}`);
  record("10. canonical history (first-parent)", git(PROJECT, ["log", "--oneline", "--first-parent", `${head}..HEAD`]).split(String.fromCharCode(10)).filter((l) => l !== "").join(" | ") || "(none)");
  record("10. t2's world is RETAINED", existsSync(worlds.get("t2")) ? "YES (the only copy of its work)" : "NO");
  record("10. t2's result commit is still readable", (() => {
    try {
      git(PROJECT, ["cat-file", "-e", `${String(second.resultCommit)}^{commit}`]);
      return "YES";
    } catch {
      return "NO";
    }
  })());
  const finalBeta = git(PROJECT, ["show", `${after.canonicalHead}:src/beta.js`]);
  record("10. the beta BUG is STILL in canonical", finalBeta.includes("a=") ? "NO (already fixed)" : "YES (not reused)");

  /* ------------------------------------------------------------------ report */

  process.stdout.write("=== §D4-LIVE: two real workers, two speculative worlds, serial canonicalization ===\n");
  for (const [key, value] of findings) process.stdout.write(`${key.padEnd(56)} : ${value}\n`);

  const verdict = [
    ["the plan declared concurrency 2", profile.concurrency === 2],
    ["both tasks were real Work before delegation", before.taskStates.join(",") === "t1:READY,t2:READY"],
    ["two async starts returned before either worker ran", spawned.every((m) => existsSync(m.path))],
    ["two DIFFERENT execution worlds existed at once", new Set(worlds.values()).size === 2],
    ["both attempts were RUNNING simultaneously", parkedAttempts.every((r) => r.state === "RUNNING") && parkedAttempts.length === 2],
    ["canonical source was untouched while both ran", git(PROJECT, ["rev-parse", "HEAD"]) !== head || afterSettle.canonicalHead === head],
    ["both workers ran in their OWN world", started.every((s) => { const env = workerEnv(s.attemptId); return env !== null && samePath(env.cwd, worlds.get(s.taskId)); })],
    ["both workers were authority-closed", started.every((s) => (workerEnv(s.attemptId)?.offeredTools ?? []).filter((n) => typeof n === "string" && n.startsWith("palimpsest_") && n !== "palimpsest_worker_result").length === 0)],
    ["both attempts COMPLETED", results.every((r) => r.state === "COMPLETED")],
    ["two DIFFERENT results were produced", results[0].resultCommit !== results[1].resultCommit],
    ["ΔCanonicalProjectState = 0 while both were speculative", afterSettle.canonicalHead === head && afterSettle.promotionRows === before.promotionRows],
    ["the scheduler made BOTH tasks VERIFYING", afterSteps.taskStates.join(",") === "t1:VERIFYING,t2:VERIFYING"],
    ["the FIRST result was canonicalized by the real authority", h1 !== null && git(PROJECT, ["rev-parse", "HEAD"]) === h1],
    ["the SECOND was NOT canonicalized", git(PROJECT, ["rev-parse", "HEAD"]) === h1],
    ["the SECOND's promotion was REFUSED by the real authority", secondRefusal !== null],
    ["the refusal is a SEMANTIC answer, not a missing path", admission.admitted === false && assessment.outcome === "INCOMPATIBLE"],
    ["the canonical history is a SERIES", git(PROJECT, ["log", "--oneline", "--first-parent", `${head}..HEAD`]).split(String.fromCharCode(10)).filter((l) => l !== "").length === 1],
    ["exactly ONE promotion row exists", after.promotionRows === before.promotionRows + 1],
    ["the second result's world is retained, not deleted", existsSync(worlds.get("t2"))],
    ["the second result is still readable (no fact was rewritten)", (() => { try { git(PROJECT, ["cat-file", "-e", `${String(second.resultCommit)}^{commit}`]); return true; } catch { return false; } })()],
    ["execution history moved (two attempts, not zero)", moved("attempts")],
  ];
  process.stdout.write("--- verdict ---\n");
  for (const [name, ok] of verdict) process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${name}\n`);
  const failed = verdict.filter(([, ok]) => !ok).map(([name]) => name);
  process.stdout.write(failed.length === 0 ? "\n§D4-LIVE: PASS\n" : `\n§D4-LIVE: FAIL (${failed.join("; ")})\n`);
  process.stdout.write("==============================================================================\n");
  if (failed.length > 0) process.exitCode = 1;

  try {
    observations.close();
    issuer.close();
  } catch {
    /* the gate is done either way */
  }
  try {
    await deployment.close();
  } catch {
    /* the gate is done either way */
  }
  // The verdict is already written; a still-open worker pipe must not keep this process alive.
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(`rig failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  /**
   * EXIT EXPLICITLY. A failure after the workers spawned leaves their pipes open, so the event loop
   * stays alive and the process hangs instead of reporting — which is exactly how the first run of this
   * gate produced two parked workers and no output at all. A gate that cannot report its own failure is
   * worse than one that fails.
   */
  process.exit(1);
});
