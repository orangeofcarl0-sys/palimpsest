
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { digest } from "../../energy/contract.mjs";
import { GitHubForge, GitHubRetry } from "./github-forge.mjs";
import { GitHubMaintenance, githubAdmission, githubWindow } from "./github-maintenance.mjs";
import { GitHubMaintenanceRuntime, publish } from "./github-maintenance-runtime.mjs";
import { gitHubSessionFacts } from "./github-maintenance-worker.mjs";
import { MaintenanceSlot, sealOf } from "./slot.mjs";

const scope = { repository: "local/palimpsest", repositoryId: 10, base: "main", publisher: "maintenance[bot]",
  projectId: "github-mock", attributionAppId: 42, mode: "mock", window: githubWindow };
const sha = symbol => symbol.repeat(40);
const hash = symbol => symbol.repeat(64);
const install = (candidate, buildSha256) => ({ candidate, buildSha256, image: "sha256:" + hash("f") });
const start = install(sha("1"), hash("a"));
const settled = { reconciled: true, natural: true, usageState: "SETTLED", attributionState: "COMPLETE",
  unresolved: 0, requests: 4, archive: hash("b") };

function grant(initial, work = ["a", "b"]) {
  return { project: scope.projectId, repositoryId: scope.repositoryId, mode: scope.mode,
    initial, work, window: githubWindow, expiresAt: "2099-01-01T00:00:00.000Z" };
}

class FakeGitHub {
  issues = [];
  pulls = [];
  replies = [];
  heads = new Map();
  events = [];
  readyToMerge = true;

  constructor(source) { this.heads.set("main", source); }
  branchHead(branch = "main") { return this.heads.get(branch) ?? null; }
  findIssue(marker) { return this.issues.find(issue => issue.body.includes(marker)); }
  issue(number) { return this.issues[number - 1]; }
  createIssue(title, body) {
    const number = this.issues.length + 1;
    const issue = { number, id: number, title, body, state: "open", html_url: "mock/issue/" + number,
      user: { login: scope.publisher } };
    this.issues.push(issue);
    this.events.push(["issue", number]);
    return issue;
  }
  comments(number) { return this.replies.filter(row => row.issue === number); }
  comment(number, body) {
    const comment = { id: this.replies.length + 1, issue: number, body, user: { login: scope.publisher } };
    this.replies.push(comment);
    return comment;
  }
  closeIssue(number) { this.issue(number).state = "closed"; }
  findPull(branch) { return this.pulls.find(pull => pull.head.ref === branch); }
  pull(number) { return this.pulls[number - 1]; }
  createPull(branch, title, body) {
    const number = this.pulls.length + 1;
    const pull = { number, id: number, title, body, state: "open", draft: true, merged: false, html_url: "mock/pr/" + number,
      user: { login: scope.publisher }, base: { sha: this.branchHead(), ref: "main", repo: { id: 10 } },
      head: { sha: this.branchHead(branch), ref: branch, repo: { id: 10 } } };
    this.pulls.push(pull);
    this.events.push(["pull", number]);
    return pull;
  }
  checks(pull, candidate, basis) {
    return this.readyToMerge && pull.head.sha === candidate && this.branchHead() === basis
      ? { candidate, basis, tested: sha("7"), checks: [1, 2], attribution: 3 } : null;
  }
  ready(pull) { pull.draft = false; }
  ownerMerge(pull, sha) {
    assert.equal(pull.draft, false);
    this.heads.set("main", sha);
    Object.assign(pull, { merged: true, state: "closed", merge_commit_sha: sha });
  }
}

function simpleRuntime(forge) {
  const calls = [];
  return {
    calls,
    discover: spec => ({ reproduced: true, evidence: spec.evidence }),
    prepareSession: ({ work, release }) => ({ checkpoint: hash("c"), readback: [work.id, release.candidate] }),
    execute: work => { calls.push([work.id, work.releaseAtDispatch.candidate]); return settled; },
    readSettlement: () => settled,
    review: work => ({ archive: work.settlement.archive, basis: work.releaseAtDispatch.candidate,
      candidate: sha(work.id === "a" ? "2" : "4"), pass: true, delivery: "conclusion-" + work.id }),
    push: work => forge.heads.set(work.branch, work.review.candidate),
    prepareRelease: work => ({ release: install(work.sourceSha, hash(work.id === "a" ? "d" : "e")),
      checkpoint: hash("c"), qualification: hash("4"), readback: true }),
    retest: work => ({ release: work.release, evidence: work.spec.evidence, pass: true }),
  };
}

function register(pilot, after = "a") {
  pilot.state.register({ id: "a", source: "evidence", title: "Found handover problem", publicBody: "Observed issue", evidence: hash("1") });
  pilot.state.register({ id: "b", source: "direct", title: "Fix pending work", publicBody: "Direct ticket", evidence: hash("2"),
    ...(after ? { after } : {}) });
}

async function drive(pilot, predicate, step = async () => {}) {
  for (let i = 0; i < 28; i++) {
    if (predicate(pilot.inspect())) return;
    await pilot.tick();
    await step(pilot.inspect());
  }
  assert.fail(JSON.stringify(pilot.inspect().work));
}

test("Issue/PR create acknowledgement loss and two activations survive resident reopen", async () => {
  const folder = mkdtempSync(join(tmpdir(), "palimpsest-gh-sync-"));
  const path = join(folder, "slot.sqlite");
  const forge = new FakeGitHub(start.candidate), runtime = simpleRuntime(forge);
  let gitHub;
  let slot = new MaintenanceSlot(path, { projectId: scope.projectId, mode: "mock", initial: start });
  const cuts = new Set(["a:issue", "a:pull", "before-activation", "activated"]);
  const open = () => new GitHubMaintenance({ slot, scope, forge, runtime, readGrant: () => grant(start.candidate),
    cut: (point, id) => {
      const name = point === "published" ? id : point;
      if (cuts.delete(name)) throw new Error("PROCESS_CUT " + name);
    } });
  try {
    gitHub = open();
    register(gitHub);
    for (let i = 0; i < 40; i++) {
      try { await gitHub.tick(); }
      catch (error) {
        assert.match(error.message, /^PROCESS_CUT/u);
        slot.close();
        slot = new MaintenanceSlot(path);
        gitHub = open();
        continue;
      }
      const view = gitHub.inspect();
      for (const work of view.work) {
        if (work.state === "WAITING_FOR_OWNER") forge.ownerMerge(forge.pull(work.pr.number), sha(work.id === "a" ? "3" : "5"));
      }
      if (view.work.every(work => work.state === "VERIFIED")) break;
    }
    const view = gitHub.inspect();
    assert.equal(cuts.size, 0);
    assert.deepEqual(view.work.map(work => work.state), ["VERIFIED", "VERIFIED"]);
    assert.deepEqual(runtime.calls, [["a", sha("1")], ["b", sha("3")]]);
    assert.deepEqual(forge.events, [["issue", 1], ["issue", 2], ["pull", 1], ["pull", 2]]);
    assert.deepEqual(forge.issues.map(issue => issue.state), ["closed", "closed"]);
    assert.equal(view.events.filter(event => event.type === "INSTALLATION_ACTIVATED").length, 2);
    assert.equal(view.events.filter(event => event.type === "SESSION_AUTHORIZED").length, 2);
    assert.equal(view.events.filter(event => event.type === "WAKE_DISPATCHED").length, 2);
  } finally { slot.close(); }
});

test("an independent work proceeds while another waits for current CI, and a changed head pauses publication", async () => {
  const forge = new FakeGitHub(start.candidate), runtime = simpleRuntime(forge);
  const slot = new MaintenanceSlot(":memory:", { projectId: scope.projectId, mode: "mock", initial: start });
  const grants = grant(start.candidate, ["a"]);
  const pilot = new GitHubMaintenance({ slot, scope, forge, runtime,
    readGrant: () => runtime.calls.length ? { ...grants, work: ["b"] } : grants });
  try {
    register(pilot, false);
    forge.readyToMerge = false;
    await drive(pilot, view => view.work.every(work => work.state === "WAITING_FOR_CI"));
    assert.equal(runtime.calls.length, 2);
    forge.pulls[0].head.sha = sha("9");
    forge.readyToMerge = true;
    await pilot.tick();
    const view = pilot.inspect();
    assert.equal(view.work[0].reason, "PR_CANDIDATE_MOVED");
    assert.equal(view.work[1].state, "WAITING_FOR_OWNER");
    assert.equal(view.active.candidate, start.candidate);
  } finally { slot.close(); }
});

test("settled interrupted work keeps the exact ledger and consumes one authorization", () => {
  const slot = new MaintenanceSlot(":memory:", { projectId: scope.projectId, mode: "mock", initial: start });
  try {
    const { signal } = slot.enqueueGitHubSession("github-a", hash("1"), { release: start, checkpoint: hash("2"),
      requestWindow: githubWindow, work: "a" });
    const id = signal.signalId, request = slot.sessionAdmissionRequest(id);
    const decision = githubAdmission(grant(start.candidate, ["a"]), request, scope, "a");
    assert(decision);
    slot.authorizeSession(request, decision);
    // The new host reopens this persisted RUNNING state after the original
    // process exits between archive creation and slot completion.
    const stranded = slot.dispatch(signal, start, () => new Promise(() => {}));
    assert(stranded instanceof Promise);
    assert(slot.recoverGitHubSettlement(id, settled));
    assert.equal(slot.recoverGitHubSettlement(id, settled), false);
    assert.throws(() => slot.recoverGitHubSettlement(id, { ...settled, archive: hash("a") }), /SETTLEMENT_DRIFT/u);
    assert(slot.sessionAdmission(id).consumed);
    assert.equal(slot.view().events.filter(event => event.type === "WAKE_DISPATCHED").length, 1);
  } finally { slot.close(); }
});

test("cut off mismatched, expired and revoked grants and finite versus unlimited windows", () => {
  const request = { release: start, project: scope.projectId, mode: scope.mode, requestWindow: githubWindow };
  const policy = grant(start.candidate, ["a"]);
  assert(githubAdmission(policy, request, scope, "a"));
  assert.equal(githubAdmission({ ...policy, window: { ...githubWindow, billingCeiling: 20 } }, request, scope, "a"), null);
  assert(githubAdmission({ ...policy, window: { ...githubWindow, billingCeiling: 20 } },
    { ...request, requestWindow: { ...githubWindow, billingCeiling: 20 } }, scope, "a"));
  assert.equal(githubAdmission({ ...policy, revoked: true }, request, scope, "a"), null);
  assert.equal(githubAdmission({ ...policy, expiresAt: "2000-01-01Z" }, request, scope, "a"), null);
  assert.equal(githubAdmission(policy, { ...request, project: "wrong" }, scope, "a"), null);
  assert.equal(githubAdmission(policy, { ...request, release: { ...start, candidate: sha("8") } }, scope, "a"), null);
  assert.equal(githubAdmission(policy, request, scope, "untrusted-comment"), null);
});

test("actual tool IDs and an exact candidate-bound DELIVER are separate from transport", () => {
  const path = "work.md", candidate = sha("2");
  const row = { reconciled: true, execution: { natural: true }, trajectory: { calls: [
    { tool: "palimpsest_continuity", action: "pulse", callId: "real-call-id", ok: true },
  ] } };
  const submission = { candidate, valid: true };
  const facts = gitHubSessionFacts(row, submission, null, [path]);
  assert.equal(facts.delivery, null);
  assert.equal(facts.projectReadCall, "real-call-id");
  assert(facts.transportSettled && facts.natural && facts.candidateSaved);
  const conclusion = commit => ({ intent: "DELIVER", eventId: "conclusion-new",
    body: JSON.stringify({ schema: "pc1-episode-conclusion/v1", check: { artifacts: [{ path, commit, committed: true }] } }) });
  assert.equal(gitHubSessionFacts({ ...row, conclusion: conclusion(sha("3")) }, submission, null, [path]).delivery, null);
  assert.equal(gitHubSessionFacts({ ...row, conclusion: conclusion(candidate) }, submission, "conclusion-new", [path]).delivery, null);
  assert.equal(gitHubSessionFacts({ ...row, conclusion: conclusion(candidate) }, submission, null, [path]).delivery, "conclusion-new");
});

test("GitHub conditional response and definite rate limit are distinguishable from ambiguous posts", async () => {
  const http = async (url, options) => {
    if (options.method === "POST") return new Response("", { status: 429, headers: { "retry-after": "120" } });
    if (options.headers["if-none-match"]) return new Response(null, { status: 304 });
    return Response.json({ id: 10, full_name: scope.repository, default_branch: "main" }, { headers: { etag: "version" } });
  };
  const forge = new GitHubForge({ ...scope, token: () => "mock-token", http });
  assert.deepEqual(await forge.repositoryFacts(), await forge.repositoryFacts());
  await assert.rejects(forge.createIssue("x", "y"), error =>
    error instanceof GitHubRetry && error.definitive && error.waitMs === 120_000);
  const uncertain = new GitHubForge({ ...scope, token: () => "mock-token", http: async () => { throw new Error(); } });
  await assert.rejects(uncertain.createIssue("x", "y"), error => error instanceof GitHubRetry && !error.definitive);
});

const output = process.env.PALIMPSEST_GITHUB_QUALIFICATION;

test("two ordinary DSH Mock sessions, real bare Git rebase identities and two cold-built installations", { skip: !output }, async () => {
  const root = resolve(output);
  mkdirSync(root);
  const archive = join(root, "evidence");
  mkdirSync(archive);
  const git = (...args) => execFileSync("git", ["-c", "core.longpaths=true", ...args],
    { encoding: "utf8", timeout: 240_000, windowsHide: true }).trim();
  const source = git("rev-parse", "HEAD");
  const sourceTree = git("rev-parse", source + "^{tree}");
  const image = process.env.PALIMPSEST_GITHUB_IMAGE ?? "sha256:702da68f6115eaddcf2e9b69bc6093d663f3d5d4e5cddcf2c7fb4c44664a67aa";
  const author = { name: "Palimpsest Mock", email: "palimpsest-mock@example.invalid" };
  const bare = join(root, "github.git");
  git("init", "-q", "--bare", bare);
  git("push", "-q", bare, source + ":refs/heads/main");
  const forge = new FakeGitHub(source);
  forge.branchHead = (branch = "main") => git("ls-remote", bare, "refs/heads/" + branch).split(/\s/u)[0] || null;
  const runtime = new GitHubMaintenanceRuntime({ root, scope, remote: bare, image, author, archive });
  assert.equal(runtime.refresh(), source);
  const released = runtime.build(source);
  const slot = new MaintenanceSlot(join(root, "slot.sqlite"), { projectId: scope.projectId, mode: "mock", initial: released });
  const lease = slot.claimResident();
  const pilot = new GitHubMaintenance({ slot, scope, forge, runtime, readGrant: () => grant(source) });
  try {
    const path = "scripts/pnwf/software/self-evolution/github-maintenance-worker.mjs";
    const bytes = git("show", source + ":" + path);
    function spec(id, after) {
      const file = id + ".json", fixture = JSON.stringify({ pass: true, usageState: "SETTLED", submission: { valid: true }, conclusion: null });
      writeFileSync(join(archive, file), fixture);
      const files = [{ file, path: file, sha256: digest(fixture) }], evidence = sealOf(files.map(item => [item.file, item.sha256]));
      const change = 'qualificationMarker: "' + id + '"';
      const next = bytes.replace("view = { project, basis, revision:", "view = { project, basis, " + change + ", revision:");
      assert.notEqual(next, bytes);
      const probe = id + ".mjs";
      const script = 'import {readFileSync} from "node:fs"; if(!readFileSync(' + JSON.stringify("/work/" + path) +
        ',"utf8").includes(' + JSON.stringify(change) + ')) process.exitCode=1;\n';
      writeFileSync(join(archive, probe), script);
      return { id, source: after ? "direct" : "evidence", discovery: file, after, title: "Qualify maintenance " + id,
        publicBody: "Frozen case " + id, goal: "Resolve and submit the isolated qualification maintenance case.",
        files, evidence, paths: [path], artifacts: [path], mock: { path, text: next }, probe: { path: probe, sha256: digest(script) } };
    }
    pilot.state.register(spec("a"));
    pilot.state.register(spec("b", "a"));
    await drive(pilot, view => view.work.every(work => work.state === "VERIFIED"), view => {
      for (const work of view.work) {
        if (work.state !== "WAITING_FOR_OWNER") continue;
        const pull = forge.pull(work.pr.number), before = forge.branchHead();
        const merged = git("-C", bare, "-c", "user.name=Mock Owner", "-c", "user.email=mock-owner@example.invalid",
          "commit-tree", pull.head.sha + "^{tree}", "-p", before, "-m", "Accept verified " + work.id);
        assert.notEqual(merged, pull.head.sha);
        git("-C", bare, "update-ref", "refs/heads/main", merged, before);
        forge.ownerMerge(pull, merged);
      }
    });
    const state = pilot.inspect();
    assert.equal(state.work[1].input.view.qualificationMarker, "a");
    assert.equal(state.work[1].retest.view.qualificationMarker, "b");
    assert(state.work.every(work => work.settlement.requests > 0 && work.settlement.unresolved === 0));
    const proof = { mode: "mock", paidRequests: 0, completed: 2, source, sourceTree, image,
      work: state.work.map(item => ({ id: item.id, candidate: item.review.candidate, merged: item.sourceSha, release: item.release,
        archive: item.settlement.archive, retest: sealOf(item.retest), requests: item.settlement.requests })),
      events: state.events.filter(event => ["WAKE_DISPATCHED", "INSTALLATION_ACTIVATED"].includes(event.type)) };
    publish(join(root, "qualification.json"), { proof, receipt: sealOf(proof) });
  } finally { slot.releaseResident(lease); slot.close(); }
});
