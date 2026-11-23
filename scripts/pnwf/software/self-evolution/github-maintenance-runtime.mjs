
/** Trusted Git, build and evidence ports for the GitHub maintenance resident. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { digest, readJson, sha } from "../../energy/contract.mjs";
import { requireOpenCodeGoProbe } from "../../opencode_go.mjs";
import { verifyEvidenceWorkset } from "./evidence-workset.mjs";
import { HandoverSupervisor } from "./handover-supervisor.mjs";
import { inspectFailureSession, probeCounts, readFailureEvidence } from "./github-failure-evidence.mjs";
import { prepareFailureDraft, projectFailure, runFailureDraft } from "./github-maintenance-rework.mjs";
import { materialize } from "./github-maintenance-worker.mjs";
import { sealOf } from "./slot.mjs";
import { copyDatabases, makeVolume, manifest, offline, pack, quote, success, verifyInstallation } from "./workspace.mjs";

const entry = "scripts/pnwf/software/self-evolution/github-maintenance-worker.mjs";
const fileHash = file => digest(readFileSync(file));

export function publish(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const text = JSON.stringify(value, null, 2) + "\n";
  if (existsSync(path)) {
    assert.equal(readFileSync(path, "utf8"), text, "GITHUB_ARCHIVE_CHANGED");
    return readJson(path);
  }
  const temporary = path + ".writing";
  writeFileSync(temporary, text, { flush: true });
  renameSync(temporary, path);
  return value;
}

export class GitHubMaintenanceRuntime {
  constructor({ scope, root, remote, image, author, token, providerProbe, trustedSource, archive, attribution, failureRecovery }) {
    assert(/^sha256:[a-f0-9]{64}$/u.test(image), "GITHUB_BUILD_IMAGE_DIGEST_REQUIRED");
    this.scope = scope;
    this.root = resolve(root);
    this.remote = remote;
    this.image = image;
    this.author = author;
    this.token = token;
    this.archive = archive;
    this.trustedSource = trustedSource;
    this.attribution = attribution;
    this.failureRecovery = failureRecovery;
    this.provider = providerProbe && requireOpenCodeGoProbe(readJson(providerProbe));
    this.mirror = join(this.root, "git");
    mkdirSync(this.root, { recursive: true });
    if (!existsSync(this.mirror)) this.gitOutside("init", "--bare", "-q", this.mirror);
    this.supervisor = new HandoverSupervisor(join(root, "review.sqlite"));
  }

  gitOutside(...args) {
    return execFileSync("git", ["-c", "core.longpaths=true", "-c", "credential.helper=", ...args],
      { encoding: "utf8", timeout: 240_000, windowsHide: true }).trim();
  }

  git(...args) {
    return this.gitOutside("-C", this.mirror, ...args);
  }

  refresh() {
    this.git("fetch", "--quiet", "--no-tags", this.remote, "refs/heads/" + this.scope.base + ":refs/palimpsest/main");
    return this.git("rev-parse", "refs/palimpsest/main");
  }

  #workPath(work) {
    const original = join(this.root, "work", work.id);
    return work.recovery ? join(original, "recovery") : original;
  }
  runPath(work) { return join(this.#workPath(work), "session"); }
  #inputState(work, release) {
    return work.recovery || work.spec.origin ? join(this.#workPath(work), "checkpoint") : this.statePath(release.candidate);
  }

  prepareRecovery(work, { archive, candidate, seed, bundle, checkpoint, sourceTree }) {
    assert(work && sha(candidate) && sha(seed) && /^[a-f0-9]{64}$/u.test(checkpoint) &&
      work.releaseAtDispatch && work.issue, "GITHUB_REWORK_INPUT_INVALID");
    const old = { ...work, recovery: undefined };
    const original = this.runPath(old);
    const row = readJson(join(original, "submission-facts.json"));
    const session = readJson(join(original, "session.json"));
    const prior = work.priorRejection ?? work;
    assert.equal(prior.settlement?.archive, archive, "GITHUB_REWORK_WRONG_ARCHIVE");
    assert.equal(sealOf({
      ledger: fileHash(join(original, "request-ledger.sqlite")), report: row,
      session: fileHash(join(original, "session.json")),
    }), archive, "GITHUB_REWORK_ARCHIVE_CHANGED");
    assert.equal(row.submission.candidate, candidate, "GITHUB_REWORK_WRONG_CANDIDATE");
    assert.equal(row.submission.basis, work.releaseAtDispatch.candidate, "GITHUB_REWORK_WRONG_BASIS");
    assert(row.submission.valid && row.summary.reconciled && session.conclusion?.intent === "CHECKPOINT",
      "GITHUB_REWORK_CANDIDATE_NOT_RESTORABLE");
    assert.equal(this.#candidate(old, row), candidate);
    const priorState = join(original, "stages", "MAINTAIN", "state");
    assert.equal(sealOf(manifest(priorState)), checkpoint, "GITHUB_REWORK_CHECKPOINT_CHANGED");
    const ref = "refs/palimpsest/source/" + seed;
    assert.equal(this.git("bundle", "list-heads", bundle), seed + " " + ref, "GITHUB_REWORK_BUNDLE_WRONG_HEAD");
    this.git("fetch", "-q", "--no-tags", bundle, ref + ":" + ref);
    this.git("merge-base", "--is-ancestor", candidate, seed);
    assert.equal(this.git("rev-parse", seed + "^{tree}"), sourceTree, "GITHUB_REWORK_SOURCE_TREE_CHANGED");
    const paths = this.git("diff", "--no-renames", "--name-only", row.submission.basis, seed).split(/\r?\n/u);
    const install = this.build(seed);
    const recovery = { archive, candidate, install, checkpoint, paths, previousConclusion: session.conclusion.eventId };
    const newState = this.#inputState({ ...work, recovery }, work.releaseAtDispatch);
    if (!existsSync(join(newState, "github-project-initialized"))) {
      copyDatabases(priorState, newState);
      copyFileSync(join(this.statePath(row.submission.basis), "github-project-initialized"), join(newState, "github-project-initialized"));
    }
    return recovery;
  }
  installPath(source) { return join(this.root, "installations", source); }
  statePath(source) { return join(this.root, "project", source); }

  bundle(source) {
    assert(sha(source) && this.git("cat-file", "-t", source) === "commit", "GITHUB_BUNDLE_SOURCE_REQUIRED");
    const path = join(this.root, "source", source + ".bundle"), ref = "refs/palimpsest/source/" + source;
    if (!existsSync(path)) {
      mkdirSync(dirname(path), { recursive: true });
      this.git("update-ref", ref, source);
      this.git("bundle", "create", path + ".writing", ref);
      renameSync(path + ".writing", path);
    }
    assert(this.git("bundle", "list-heads", path) === source + " " + ref, "GITHUB_BUNDLE_SOURCE_CHANGED");
    return path;
  }

  #checkout(source) {
    const directory = join(this.root, "source", source);
    if (!existsSync(join(directory, ".git"))) {
      mkdirSync(dirname(directory), { recursive: true });
      this.gitOutside("clone", "-q", "--no-checkout", "--no-hardlinks", this.mirror, directory);
    }
    const git = (...args) => this.gitOutside("-C", directory, ...args);
    if (!existsSync(join(directory, ".git", "index"))) {
      git("config", "core.autocrlf", "false");
      git("fetch", "-q", "--no-tags", this.bundle(source), "refs/palimpsest/source/" + source);
      git("sparse-checkout", "set", "src", "host", "scripts", "maintenance", "test");
      git("checkout", "--detach", "-q", "FETCH_HEAD");
    }
    assert.equal(git("rev-parse", "HEAD"), source, "GITHUB_PROJECT_WORLD_SOURCE_CHANGED");
    assert.equal(git("status", "--porcelain"), "", "GITHUB_PROJECT_WORLD_DIRTY");
    return directory;
  }

  #sourceOperation(source, callback) {
    const world = makeVolume(this.image);
    try {
      materialize(world, this.bundle(source), source, this.author);
      return callback(world);
    } finally {
      world.close();
    }
  }

  build(source) {
    const directory = this.installPath(source), destination = join(directory, "build.json");
    if (!existsSync(destination)) {
      mkdirSync(dirname(directory), { recursive: true });
      const incomplete = directory + ".building";
      // A partially built directory is preserved under its own name after a failure.
      const staged = incomplete + "-" + Date.now();
      this.#sourceOperation(source, world => pack(world, source, staged, { maintenance: true }));
      renameSync(staged, directory);
    }
    const { candidate, buildSha256, image } = readJson(destination);
    const release = { candidate, buildSha256, image };
    assert(candidate === source && image === this.image, "GITHUB_BUILD_SOURCE_OR_IMAGE_CHANGED");
    const path = verifyInstallation(directory, release);
    assert(existsSync(join(path, entry)) && existsSync(join(path, "scripts/psvr/session_attribution.mjs")),
      "GITHUB_MAINTENANCE_ENTRY_MISSING_FROM_BUILD");
    return release;
  }

  async #loaded(release) {
    const runtime = verifyInstallation(this.installPath(release.candidate), release);
    const filename = join(runtime, entry);
    const code = await import(pathToFileURL(filename).href);
    return { runtime, code, entryDigest: fileHash(filename) };
  }

  #evidence(spec) {
    const files = spec.files.map(({ file, path, sha256 }) => {
      assert(/^[\w.-]+$/u.test(file) && ![".", "..", "sources.json", "github-comments.json"].includes(file),
        "GITHUB_EVIDENCE_FILENAME_INVALID");
      const from = resolve(this.archive, path);
      const generated = spec.origin && file === "failure-investigation.json" &&
        from === join(this.root, "work", spec.origin.work, file);
      assert((generated || from.startsWith(resolve(this.archive) + (process.platform === "win32" ? "\\" : "/"))) &&
        fileHash(from) === sha256, "GITHUB_EVIDENCE_CHANGED");
      return { file, path: from, sha256 };
    });
    assert.equal(new Set(files.map(file => file.file)).size, files.length, "GITHUB_EVIDENCE_NAME_REPEATED");
    assert.equal(sealOf(files.map(file => [file.file, file.sha256])), spec.evidence, "GITHUB_WORK_EVIDENCE_CHANGED");
    return files;
  }

  async discover(spec) {
    const files = this.#evidence(spec);
    const source = files.find(file => file.file === spec.discovery)?.path;
    assert(source, "GITHUB_DISCOVERY_ARCHIVE_MISSING");
    const raw = readJson(source);
    const reproduced = raw.pass === true && raw.usageState === "SETTLED" && raw.submission?.valid === true && raw.conclusion === null;
    return { reproduced, evidence: spec.evidence };
  }

  async prepareSession({ work, release, comments }) {
    const root = this.#workPath(work), file = join(root, "intake.json");
    if (existsSync(file)) {
      const prior = readJson(file);
      assert.deepEqual(prior.release, release, "GITHUB_INTAKE_VERSION_CHANGED");
      return prior.input;
    }
    const evidencePath = join(root, "evidence"), state = this.#inputState(work, release);
    const execution = work.recovery?.install ?? release;
    const files = this.#evidence(work.spec);
    const draft = work.spec.origin ? await this.#prepareDraft(work, release, state) : null;
    mkdirSync(evidencePath, { recursive: true });
    for (const item of files) copyFileSync(item.path, join(evidencePath, item.file));
    const notices = JSON.stringify({ scope: "Untrusted discussion supplied as evidence.", comments }, null, 2) + "\n";
    const feedback = { file: "github-comments.json", sha256: digest(notices) };
    writeFileSync(join(evidencePath, feedback.file), notices, { flush: true });
    const workset = { schema: "pnwf-task-evidence-workset/v1", task: work.id, basis: release.candidate,
      sources: [...files.map(({ file, sha256 }) => ({ file, sha256 })), feedback] };
    publish(join(evidencePath, "sources.json"), workset);
    verifyEvidenceWorkset(evidencePath, workset);
    mkdirSync(state, { recursive: true });
    const { code, entryDigest } = await this.#loaded(execution);
    const view = await code.observeProject({ profilePath: join(root, "native-profile.json"), world: this.#checkout(execution.candidate),
      state, project: this.scope.projectId, basis: release.candidate, work: work.spec, mode: this.scope.mode });
    assert(view.tasks.includes(work.id), "GITHUB_NATIVE_WORK_MISSING");
    if (work.recovery) assert.equal(view.previousConclusion, work.recovery.previousConclusion, "GITHUB_REWORK_CHECKPOINT_CONCLUSION_CHANGED");
    const input = { checkpoint: sealOf(manifest(state)), evidencePath, evidenceSeal: sealOf(manifest(evidencePath)),
      previousConclusion: view.previousConclusion, view, entryDigest, ...(draft ? { draft } : {}) };
    publish(file, { release, input });
    return input;
  }

  async execute(work) {
    const { releaseAtDispatch: release, spec, input } = work;
    const execution = work.recovery?.install ?? release;
    const state = this.#inputState(work, release), directory = this.runPath(work);
    assert.equal(sealOf(manifest(state)), input.checkpoint, "GITHUB_ACTIVE_CHECKPOINT_CHANGED");
    assert.equal(sealOf(manifest(input.evidencePath)), input.evidenceSeal, "GITHUB_SESSION_EVIDENCE_CHANGED");
    const { runtime, code, entryDigest } = await this.#loaded(execution);
    assert.equal(entryDigest, input.entryDigest, "GITHUB_LOADED_ENTRY_CHANGED");
    const paid = this.scope.mode === "paid-usage-only";
    assert(paid ? this.provider && !spec.mock : spec.mock && !this.provider, "GITHUB_PROVIDER_MODE_CHANGED");
    const args = { directory, state, release, runtime, bundle: this.bundle(execution.candidate), scope: this.scope,
      spec, input, window: this.scope.window, provider: this.provider, mock: spec.mock, author: this.author, recovery: work.recovery };
    return input.draft ? runFailureDraft(args, code, join(this.#workPath(work), "draft.patch")) : code.runAcceptedSession(args);
  }

  async readSettlement(work) {
    const { code } = await this.#loaded(work.recovery?.install ?? work.releaseAtDispatch);
    const directory = this.runPath(work);
    const result = code.settlement(directory);
    if (!result) return null;
    const row = readJson(join(directory, "submission-facts.json"));
    assert.equal(row.work, work.id, "GITHUB_RECOVERY_WRONG_WORK");
    assert.deepEqual(row.release, work.releaseAtDispatch, "GITHUB_RECOVERY_WRONG_RELEASE");
    assert.equal(row.checkpoint, work.input.checkpoint, "GITHUB_RECOVERY_WRONG_CHECKPOINT");
    return result;
  }

  #probe(work, source) {
    const { path, sha256 } = work.spec.probe;
    const file = resolve(this.archive, path);
    assert(file.startsWith(resolve(this.archive) + (process.platform === "win32" ? "\\" : "/")) &&
      fileHash(file) === sha256, "GITHUB_VERIFIER_CHANGED");
    const result = this.#sourceOperation(source, world =>
      offline(world, "node /probe.mjs", [file + ":/probe.mjs:ro"], { timeout: 240_000 }));
    const output = result.stdout + result.stderr;
    const counts = probeCounts(output);
    const expected = work.spec.probe.tests;
    const pass = result.status === 0 && (!expected || counts.tests === expected && counts.passed === expected);
    return { pass, source, probe: sha256, output: digest(output), exit: result.status, counts };
  }

  #candidateObjects(work, row) {
    const source = row.submission.candidate, basis = row.submission.basis;
    assert(sha(source) && sha(basis) && source !== basis && basis === work.releaseAtDispatch.candidate,
      "GITHUB_CANDIDATE_WRONG_BASIS");
    const file = join(this.runPath(work), "candidate.bundle");
    assert.equal(fileHash(file), row.submission.bundleSha256, "GITHUB_CANDIDATE_BUNDLE_CHANGED");
    assert.equal(this.git("bundle", "list-heads", file), source + " HEAD", "GITHUB_CANDIDATE_BUNDLE_WRONG_HEAD");
    this.git("fetch", "-q", "--no-tags", file, "HEAD:refs/palimpsest/candidates/" + source);
    this.git("merge-base", "--is-ancestor", basis, source);
    const seed = work.recovery?.install.candidate ?? basis;
    if (seed !== basis) this.git("merge-base", "--is-ancestor", seed, source);
    return { source, basis, seed };
  }

  #paths(from, to) {
    return this.git("diff", "--no-renames", "--name-only", "-z", from, to, "--").split("\0").filter(Boolean);
  }

  #pathRuleMatches({ path, before, after }, basis, source) {
    const read = commit => execFileSync("git", ["--no-replace-objects", "-C", this.mirror, "cat-file", "blob", commit + ":" + path],
      { windowsHide: true, encoding: "utf8" });
    const original = read(basis), index = original.indexOf(before);
    assert(index >= 0 && index === original.lastIndexOf(before), "GITHUB_SCOPED_EDIT_BASIS_CHANGED");
    return this.git("ls-tree", source, "--", path).startsWith("100644 blob ") &&
      read(source) === original.slice(0, index) + after + original.slice(index + before.length);
  }

  #candidateFacts(work, row) {
    const { source, basis, seed } = this.#candidateObjects(work, row);
    const paths = this.#paths(basis, source);
    const extra = (seed === basis ? paths : this.#paths(seed, source)).filter(path => !work.spec.paths.includes(path));
    const missing = work.spec.artifacts.filter(path => !paths.includes(path));
    const raw = this.git("diff", "--no-renames", "--raw", "-z", basis, source, "--").split("\0");
    const nonregular = [];
    for (let i = 0; i + 1 < raw.length; i += 2) {
      if (/^:(?:120000|160000) |^:\d{6} (?:120000|160000) /u.test(raw[i])) nonregular.push(raw[i + 1]);
    }
    const ruleViolations = (work.spec.pathRules ?? []).filter(rule => paths.includes(rule.path) &&
      !this.#pathRuleMatches(rule, basis, source)).map(rule => rule.path);
    let attribution = null;
    if (this.attribution) {
      try {
        execFileSync(process.execPath, [this.attribution, "range", basis, source],
          { cwd: this.mirror, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
        attribution = { pass: true, violations: [] };
      } catch (error) {
        const violations = String(error.stderr ?? "").trim().split(/\r?\n/u).filter(Boolean);
        if (error.status !== 1 || !violations.length || !violations.every(line =>
          /^[0-9a-f]{40}: (?:author email is outside the allowlist|committer email is outside the allowlist|unauthorized co-author field)$/u.test(line))) throw error;
        attribution = { pass: false, violations };
      }
    }
    const scope = { paths, extra, missing, nonregular, ruleViolations, pass: paths.length > 0 &&
      !extra.length && !missing.length && !nonregular.length && !ruleViolations.length };
    return { source, basis, scope, attribution };
  }

  #candidate(work, row) {
    const facts = this.#candidateFacts(work, row);
    assert(facts.scope.pass, "GITHUB_CANDIDATE_WRITE_SCOPE_CHANGED");
    assert(facts.attribution?.pass !== false, "GITHUB_CANDIDATE_ATTRIBUTION_REJECTED");
    return facts.source;
  }

  #publicTests(work, source) {
    const tests = work.spec.publicTests;
    if (!tests) return null;
    assert(tests.length && tests.every(file => /^scripts\/pnwf\/[\w./-]+\.test\.mjs$/u.test(file) &&
      !file.split("/").includes("..")), "GITHUB_PUBLIC_REGRESSION_PATH_INVALID");
    const result = this.#sourceOperation(source, world => offline(world,
      "node node_modules/typescript/bin/tsc -b && node --test " + tests.map(quote).join(" ")));
    const output = result.stdout + result.stderr;
    return { pass: result.status === 0, exit: result.status, output: digest(output), counts: probeCounts(output) };
  }

  async review(work) {
    const path = join(this.#workPath(work), "review.json");
    const settlement = await this.readSettlement(work);
    assert.equal(settlement?.archive, work.settlement.archive, "GITHUB_SETTLEMENT_ARCHIVE_CHANGED");
    if (existsSync(path)) return readJson(path);
    const row = readJson(join(this.runPath(work), "submission-facts.json"));
    const basis = work.releaseAtDispatch.candidate, archive = settlement.archive;
    const { facts } = row;
    const steps = [{ step: "natural-exit", observed: facts.natural }, { step: "persisted-candidate", observed: facts.candidateSaved },
      { step: "candidate-bound-delivery", observed: Boolean(facts.delivery) }];
    if (steps.some(step => !step.observed)) {
      const binding = { project: this.scope.projectId, work: work.id, basis, build: work.releaseAtDispatch.buildSha256,
        candidate: row.submission.candidate, checkpoint: work.input.checkpoint };
      const receipt = await this.supervisor.review({ binding, steps, source: archive }, () => {
        // Replay only the sealed observations, from a fresh read of the same result.
        const prior = readJson(join(this.runPath(work), "submission-facts.json"));
        const { facts: observed } = prior;
        return { steps: [{ step: "natural-exit", observed: observed.natural },
          { step: "persisted-candidate", observed: observed.candidateSaved },
          { step: "candidate-bound-delivery", observed: Boolean(observed.delivery) }] };
      });
      this.supervisor.acknowledge(receipt.id, binding);
      return publish(path, { pass: false, basis, archive, reason: receipt.firstBreak?.step ?? "INCONCLUSIVE", receipt: receipt.id });
    }
    const git = this.#candidateFacts(work, row);
    const candidate = git.source;
    const reason = !git.scope.pass ? "GITHUB_CANDIDATE_WRITE_SCOPE_CHANGED"
      : git.attribution?.pass === false ? "GITHUB_CANDIDATE_ATTRIBUTION_REJECTED" : null;
    if (reason) return publish(path, { pass: false, basis, archive, candidate, delivery: facts.delivery, reason, git });
    const old = this.#probe(work, basis), next = this.#probe(work, candidate);
    const regression = next.pass ? this.#publicTests(work, candidate) : null;
    const pass = !old.pass && old.exit === 1 && next.pass && (regression?.pass ?? true);
    return publish(path, { pass, basis, archive, candidate, delivery: facts.delivery, old, next,
      ...(regression ? { regression } : {}), reason: pass ? null : "GITHUB_INDEPENDENT_PROBE_FAILED" });
  }

  failureEvidence(work) {
    const directory = this.runPath(work);
    const evidence = readFailureEvidence(directory, work, this.scope.projectId);
    return publish(join(this.#workPath(work), "failure-evidence.json"), evidence);
  }

  async investigateFailure(failure, work) {
    const directory = this.runPath(work), input = failure.input;
    assert.deepEqual(readFailureEvidence(directory, work, this.scope.projectId), input, "GITHUB_FAILURE_ARCHIVE_CHANGED");
    const file = join(this.#workPath(work), "investigation.json");
    if (existsSync(file)) {
      const saved = readJson(file);
      assert(saved.facts.case === failure.id && saved.facts.input === sealOf(input) && saved.seal === sealOf(saved.facts),
        "GITHUB_INVESTIGATION_RECEIPT_CHANGED");
      return saved;
    }
    const { accounting, delivery } = inspectFailureSession(directory, input);
    const row = input.sources["submission-facts.json"] ? readJson(join(directory, "submission-facts.json")) : null;
    const hasCandidate = input.target.candidate && input.target.candidate !== input.target.basis && input.sources["candidate.bundle"];
    const git = hasCandidate ? this.#candidateFacts(work, row) : null;
    const probe = git && !git.scope.nonregular.length ? this.#probe(work, git.source) : null;
    const stop = accounting.usage === "UNKNOWN" ? "USAGE_UNKNOWN" : accounting.usage === "ZERO_REQUESTS"
      ? "ZERO_REQUEST_STOP" : accounting.usage === "SETTLED" && accounting.attribution === "INCOMPLETE"
        ? "ATTRIBUTION_INCOMPLETE" : null;
    const findings = [
      ...(git ? [
        { code: "WRITE_SCOPE", result: git.scope, pass: git.scope.pass },
        ...(git.attribution ? [{ code: "COMMIT_ATTRIBUTION", result: git.attribution, pass: git.attribution.pass }] : []),
      ] : []),
      ...(delivery.natural === null ? [] : [{ code: "NATURAL_EXIT", pass: delivery.natural }]),
      ...(delivery.saved === false && row.submission.status ? [{ code: "DIRTY_WORKTREE", pass: false }] : []),
      ...(delivery.natural === true ? [{ code: "CANDIDATE_BOUND_DELIVERY", result: delivery, pass: Boolean(delivery.formal) }] : []),
      ...(probe ? [{ code: "FROZEN_PROBE", result: probe, pass: probe.pass }] : []),
      ...(stop ? [{ code: stop, result: accounting, pass: false }] : []),
    ].map(({ pass, ...finding }) => ({ ...finding, state: pass ? "PASSED" : "REPRODUCED", blocking: !pass }));
    if (!probe) findings.push({ code: "FROZEN_PROBE", state: "INCONCLUSIVE", blocking: false });

    const observed = [{ step: "natural-exit", observed: delivery.natural },
      { step: "persisted-candidate", observed: delivery.saved },
      { step: "candidate-bound-delivery", observed: delivery.natural === true ? Boolean(delivery.formal) : null }];
    const originalStep = observed.find(step => step.step === input.verdict.reason);
    const binding = { project: input.project, work: input.work, basis: input.target.basis,
      build: input.release.buildSha256, case: failure.id };
    const supervision = originalStep?.observed === false ? await this.supervisor.review({
      binding, steps: observed, source: input.archive,
    }, () => ({ steps: observed, findings: findings.map(({ code, state }) => ({ code, state })) })) : null;
    const facts = { case: failure.id, input: sealOf(input), verdict: input.verdict, accounting, delivery, findings,
      ...(supervision ? { supervision: supervision.id } : {}), paidRequests: 0 };
    return publish(file, { facts, seal: sealOf(facts) });
  }

  async projectFailure(failure, work, receipt) {
    const basis = failure.input.target.basis, state = this.statePath(basis);
    if (existsSync(join(state, "github-project-initialized"))) {
      await projectFailure({ project: this.scope.projectId, basis, state, world: this.#checkout(basis),
        profilePath: join(this.#workPath(work), "failure-profile.json"), failure, receipt,
        followups: this.failureRecovery?.contract.archive === failure.input.archive ? this.failureRecovery.contract.followups : [] });
    }
    if (receipt.facts.supervision) this.supervisor.acknowledge(receipt.facts.supervision, {
      project: failure.input.project, work: failure.input.work, basis, build: failure.input.release.buildSha256, case: failure.id,
    });
  }

  followup(failure, work, receipt) {
    const contract = this.failureRecovery?.contract;
    if (!contract || contract.parent !== work.id || contract.archive !== failure.input.archive ||
        contract.basis !== failure.input.target.basis || contract.candidate !== failure.input.target.candidate ||
        !failure.input.checkpoint || receipt.facts.accounting.usage !== "SETTLED" || receipt.facts.accounting.attribution !== "COMPLETE" ||
        !receipt.facts.findings.some(item => item.blocking)) return null;
    assert(work.spec.paths.every(path => contract.paths.includes(path)) &&
      contract.paths.every(path => work.spec.paths.includes(path) || contract.pathRules.some(rule => path === rule.path)),
    "GITHUB_FOLLOWUP_SCOPE_UNDECLARED");
    const id = "repair-" + failure.id.slice(-24);
    const origin = { case: failure.id, work: work.id, attempt: work.attempt, archive: failure.input.archive, investigation: receipt.seal };
    const name = "failure-investigation.json", path = join(this.#workPath(work), name);
    // The model receives observed failure categories, not the held verifier or its output.
    const summary = { origin, verdict: failure.input.verdict.reason, accounting: receipt.facts.accounting,
      findings: receipt.facts.findings.map(({ code, state, result }) => ({ code, state,
        ...(code === "WRITE_SCOPE" ? { allowed: work.spec.paths, extra: result.extra } : {}),
        ...(code === "CANDIDATE_BOUND_DELIVERY" ? { intent: result.intent, attempted: result.attempted } : {}),
        ...(code === "FROZEN_PROBE" && result?.counts ? { counts: result.counts } : {}) })),
      followups: contract.followups };
    publish(path, summary);
    const files = [...work.spec.files, { file: name, path, sha256: fileHash(path) }];
    const { title, goal, paths, pathRules, publicTests } = contract;
    return { id, source: "recovery", origin, issue: work.issue.number, title, goal, paths, pathRules, publicTests,
      artifacts: work.spec.artifacts, probe: { ...work.spec.probe, tests: contract.tests },
      files, evidence: sealOf(files.map(({ file, sha256 }) => [file, sha256])),
      ...(this.failureRecovery.mock ? { mock: true } : {}) };
  }

  async #prepareDraft(work, release, state) {
    const { origin, paths } = work.spec, basis = release.candidate;
    const source = this.failureRecovery?.contract?.candidate;
    assert(sha(source) && this.failureRecovery.contract.basis === basis, "GITHUB_FOLLOWUP_BASIS_MOVED");
    const root = this.#workPath(work), parent = { id: origin.work, spec: {} };
    const original = this.runPath(parent);
    const evidence = readJson(join(this.#workPath(parent), "failure-evidence.json"));
    const investigation = readJson(join(this.#workPath(parent), "investigation.json"));
    assert(evidence.archive === origin.archive && evidence.attempt === origin.attempt &&
      evidence.target.basis === basis && evidence.target.candidate === source &&
      investigation.facts.case === origin.case && investigation.seal === origin.investigation &&
      sealOf(investigation.facts) === investigation.seal && investigation.facts.input === sealOf(evidence),
    "GITHUB_FOLLOWUP_ARCHIVE_MISMATCH");
    const row = readJson(join(original, "submission-facts.json"));
    this.#candidateObjects({ ...parent, releaseAtDispatch: release }, row);
    const selected = this.#paths(basis, source).filter(path => paths.includes(path));
    assert(work.spec.artifacts.every(path => selected.includes(path)) &&
      work.spec.pathRules.every(rule => !selected.includes(rule.path) || this.#pathRuleMatches(rule, basis, source)),
    "GITHUB_FOLLOWUP_SCOPED_DRAFT_CHANGED");
    const patch = execFileSync("git", ["--no-replace-objects", "-C", this.mirror, "diff", "--binary", "--no-ext-diff",
      "--no-renames", basis, source, "--", ...selected], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
    return prepareFailureDraft({ root, state, original, accepted: this.statePath(basis), evidence, investigation,
      caseId: origin.case, basis, patch, selected, project: this.scope.projectId, world: this.#checkout(basis),
      followups: this.failureRecovery.contract.followups });
  }

  async push(work) {
    assert.equal(work.branch, "codex/" + this.scope.projectId + "-" + work.id, "GITHUB_ONLY_WORKING_BRANCH_MAY_BE_PUSHED");
    const row = readJson(join(this.runPath(work), "submission-facts.json"));
    const candidate = this.#candidate(work, row);
    assert.equal(candidate, work.review.candidate, "GITHUB_PUSH_CANDIDATE_CHANGED");
    const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_COUNT: "0" };
    if (this.token) {
      const token = await this.token();
      env.GIT_CONFIG_COUNT = "1";
      env.GIT_CONFIG_KEY_0 = "http." + this.remote + ".extraHeader";
      env.GIT_CONFIG_VALUE_0 = "Authorization: Basic " + Buffer.from("x-access-token:" + token).toString("base64");
    }
    execFileSync("git", ["-c", "credential.helper=", "-C", this.mirror, "push", "--porcelain", this.remote,
      candidate + ":refs/heads/" + work.branch], { env, windowsHide: true, timeout: 120_000, stdio: ["ignore", "pipe", "pipe"] });
  }

  async prepareRelease(work) {
    const root = this.#workPath(work), file = join(root, "release.json"), source = work.sourceSha;
    if (existsSync(file)) {
      const saved = readJson(file);
      assert.equal(saved.release.candidate, source, "GITHUB_PREPARED_RELEASE_CHANGED");
      assert.equal(sealOf(manifest(this.statePath(source))), saved.checkpoint, "GITHUB_PREPARED_STATE_CHANGED");
      verifyInstallation(this.installPath(source), saved.release);
      return saved;
    }
    this.refresh();
    this.git("merge-base", "--is-ancestor", source, "refs/palimpsest/main");
    assert.equal(this.git("rev-parse", source + "^{tree}"), this.git("rev-parse", work.review.candidate + "^{tree}"),
      "GITHUB_MERGED_TREE_DIFFERS_FROM_REVIEW");
    const release = this.build(source);
    const prior = join(this.runPath(work), "stages", "MAINTAIN", "state");
    const state = this.statePath(source);
    mkdirSync(state, { recursive: true });
    const old = this.statePath(work.releaseAtDispatch.candidate);
    const { code: before } = await this.#loaded(work.releaseAtDispatch);
    // The concluded session holds the new journal; the canonical version
    // still owns the prior accepted basis while the successor is prepared.
    if (!existsSync(join(state, "github-project-initialized"))) {
      copyDatabases(prior, state);
      copyFileSync(join(old, "github-project-initialized"), join(state, "github-project-initialized"));
    }
    assert(typeof before.observeProject === "function", "GITHUB_PREDECESSOR_ENTRY_UNAVAILABLE");
    const { code, entryDigest } = await this.#loaded(release);
    const view = await code.observeProject({ profilePath: join(root, "accepted-profile.json"), world: this.#checkout(source),
      state, project: this.scope.projectId, basis: source, oldBasis: work.releaseAtDispatch.candidate,
      mode: this.scope.mode });
    assert(view.journal.includes(work.input.view.intakeEntry) && view.previousConclusion === work.review.delivery,
      "GITHUB_ACCEPTED_WORK_READBACK_FAILED");
    const result = this.#probe(work, source);
    assert(result.pass, "GITHUB_ACTUAL_SOURCE_FAILED_INDEPENDENT_PROBE");
    const checkpoint = sealOf(manifest(state));
    const facts = { release, checkpoint, source, submitted: work.review.candidate, archive: work.review.archive, result, view, entryDigest };
    return publish(file, { ...facts, qualification: sealOf(facts), readback: true });
  }

  async retest(work, { coldReplay = false } = {}) {
    const path = join(this.#workPath(work), coldReplay ? "cold-replay.json" : "retest.json");
    if (existsSync(path)) return readJson(path);
    const { code, entryDigest } = await this.#loaded(work.release);
    const root = this.#workPath(work);
    const view = await code.observeProject({ profilePath: join(root, "retest-profile.json"), world: this.#checkout(work.release.candidate),
      state: this.statePath(work.release.candidate), project: this.scope.projectId, basis: work.release.candidate, mode: this.scope.mode });
    const probe = this.#probe(work, work.release.candidate);
    return publish(path, { release: work.release, evidence: work.spec.evidence, view, entryDigest, probe,
      pass: probe.pass && view.previousConclusion === work.review.delivery && view.journal.includes(work.input.view.intakeEntry) });
  }
}
