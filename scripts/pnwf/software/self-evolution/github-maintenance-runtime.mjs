
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
import { materialize } from "./github-maintenance-worker.mjs";
import { sealOf } from "./slot.mjs";
import { copyDatabases, makeVolume, manifest, offline, pack, success, verifyInstallation } from "./workspace.mjs";

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
  constructor({ scope, root, remote, image, author, token, providerProbe, trustedSource, archive, attribution }) {
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
    return work.recovery ? join(this.#workPath(work), "checkpoint") : this.statePath(release.candidate);
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
      assert(from.startsWith(resolve(this.archive) + (process.platform === "win32" ? "\\" : "/")) &&
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
      previousConclusion: view.previousConclusion, view, entryDigest };
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
    return code.runAcceptedSession({ directory, state, release, runtime, bundle: this.bundle(execution.candidate), scope: this.scope,
      spec, input, window: this.scope.window, provider: this.provider, mock: spec.mock, author: this.author, recovery: work.recovery });
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
    return { pass: result.status === 0, source, probe: sha256, output: digest(output), exit: result.status };
  }

  #candidate(work, row) {
    const source = row.submission.candidate, basis = row.submission.basis;
    const file = join(this.runPath(work), "candidate.bundle");
    assert.equal(fileHash(file), row.submission.bundleSha256, "GITHUB_CANDIDATE_BUNDLE_CHANGED");
    assert.equal(this.git("bundle", "list-heads", file), source + " HEAD", "GITHUB_CANDIDATE_BUNDLE_WRONG_HEAD");
    this.git("fetch", "-q", "--no-tags", file, "HEAD:refs/palimpsest/candidates/" + source);
    this.git("merge-base", "--is-ancestor", basis, source);
    const seed = work.recovery?.install.candidate ?? basis;
    if (seed !== basis) this.git("merge-base", "--is-ancestor", seed, source);
    const changes = (from) => this.git("diff", "--no-renames", "--name-only", from, source).split(/\r?\n/u).filter(Boolean);
    const paths = changes(basis);
    assert(paths.length > 0 && (seed === basis ? paths : changes(seed)).every(path => work.spec.paths.includes(path)) &&
      work.spec.artifacts.every(path => paths.includes(path)), "GITHUB_CANDIDATE_WRITE_SCOPE_CHANGED");
    const modes = this.git("diff", "--no-renames", "--raw", basis, source);
    assert(!modes.split("\n").some(line => /(?:^:| )120000 |(?:^:| )160000 /u.test(line)), "GITHUB_CANDIDATE_NONREGULAR");
    if (this.attribution) {
      execFileSync(process.execPath, [this.attribution, "range", basis, source], { cwd: this.mirror, windowsHide: true });
    }
    return source;
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
    const candidate = this.#candidate(work, row);
    const old = this.#probe(work, basis), next = this.#probe(work, candidate);
    const pass = !old.pass && old.exit === 1 && next.pass;
    return publish(path, { pass, basis, archive, candidate, delivery: facts.delivery, old, next,
      reason: pass ? null : "GITHUB_INDEPENDENT_PROBE_FAILED" });
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

  async retest(work) {
    const path = join(this.#workPath(work), "retest.json");
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
