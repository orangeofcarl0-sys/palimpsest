
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { digest } from "../../energy/contract.mjs";
import { GitHubForge, GitHubRetry } from "./github-forge.mjs";
import { GitHubMaintenance, githubAdmission, githubWindow, hasIssueClosingReference } from "./github-maintenance.mjs";
import { previewIssues } from "./github-issue-discipline.mjs";
import { MaintenanceFailures } from "./failure-investigation.mjs";
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
  failedChecks = [];
  labels = new Set();
  timeline = [];
  mutations = [];

  constructor(source) { this.heads.set("main", source); }
  branchHead(branch = "main") { return this.heads.get(branch) ?? null; }
  findIssue(marker) { return this.issues.find(issue => issue.body.includes(marker)); }
  issue(number) { return this.issues[number - 1]; }
  createIssue(title, body) {
    const number = this.issues.length + 1;
    const issue = { number, id: number, title, body, state: "open", html_url: "mock/issue/" + number,
      labels: [], user: { login: scope.publisher } };
    this.issues.push(issue);
    this.events.push(["issue", number]);
    return issue;
  }
  comments(number) { return this.replies.filter(row => row.issue === number); }
  comment(number, body) {
    const comment = { id: this.replies.length + 1, issue: number, body, user: { login: scope.publisher } };
    this.replies.push(comment);
    this.mutations.push(["comment", number]);
    return comment;
  }
  editIssueComment(id, body) {
    const comment = this.replies.find(item => item.id === id);
    comment.body = body;
    this.mutations.push(["edit", comment.issue]);
    return comment;
  }
  ensureLabel({ name }) { this.labels.add(name); }
  addIssueLabel(number, name) {
    assert(this.labels.has(name));
    this.issue(number).labels.push({ name });
    this.mutations.push(["label", number, name]);
  }
  removeIssueLabel(number, name) {
    this.issue(number).labels = this.issue(number).labels.filter(label => label.name !== name);
    this.mutations.push(["unlabel", number, name]);
  }
  issueTimeline(number) { return this.timeline.filter(event => event.issue === number); }
  closeIssue(number) { return this.setIssueState(number, "closed"); }
  setIssueState(number, state, actor = scope.publisher) {
    const issue = this.issue(number);
    Object.assign(issue, { state, state_reason: state === "closed" ? "completed" : "reopened" });
    this.timeline.push({ id: this.timeline.length + 1, issue: number, event: state === "closed" ? "closed" : "reopened",
      actor: { login: actor } });
    this.mutations.push([state, number]);
    return issue;
  }
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
  checkProgress(pull, candidate, basis) {
    if (pull.head.sha !== candidate || this.branchHead() !== basis) return { state: "moved" };
    if (this.failedChecks.length) return { state: "failed", failures: this.failedChecks };
    if (!this.readyToMerge) return { state: "pending" };
    return { state: "passed", receipt: { candidate, basis, tested: sha("7"), checks: [1, 2], attribution: 3 } };
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

test("exact PR head check runs qualify when the virtual merge commit has no checks", async () => {
  const basis = sha("1"), candidate = sha("2"), tested = sha("3");
  const pull = { head: { sha: candidate }, base: { sha: basis }, mergeable: true, merge_commit_sha: tested };
  let reported = candidate, remoteBase = basis, checker = scope.attributionAppId;
  const forge = new GitHubForge({ ...scope, token: () => "mock-token", http: async url => {
    if (url.pathname.endsWith("/git/ref/heads/main")) return Response.json({ object: { sha: remoteBase } });
    if (url.pathname.endsWith("/check-runs")) {
      const checks = ["unit", "e2e"].map((name, index) => ({
        id: index + 1, name, head_sha: reported, app: { id: checker }, status: "completed", conclusion: "success",
      }));
      return Response.json({ check_runs: url.pathname.includes("/" + reported + "/") ? checks : [] });
    }
    if (url.pathname.endsWith("/statuses")) {
      return Response.json([{ id: 3, context: "commit-attribution", state: "success", creator: { login: "github-actions[bot]" } }]);
    }
    assert(url.pathname.endsWith("/rules/branches/main"));
    return Response.json([{ type: "required_status_checks", parameters: {
      required_status_checks: [{ context: "commit-attribution", integration_id: scope.attributionAppId }],
    } }]);
  } });
  assert.deepEqual(await forge.checks(pull, candidate, basis), {
    basis, candidate, tested, attribution: 3, checks: [1, 2], checkShas: [candidate],
  });
  reported = tested;
  assert.deepEqual((await forge.checks(pull, candidate, basis)).checkShas, [tested]);
  checker = 100;
  assert.equal(await forge.checks(pull, candidate, basis), null);
  checker = scope.attributionAppId;
  remoteBase = sha("4");
  assert.equal(await forge.checks(pull, candidate, basis), null);
  assert.equal(await forge.checks(pull, sha("5"), basis), null);
});

function managed(forge, ids = ["a"]) {
  return { authority: "fixture", issues: ids.map(work => {
    const { number, id } = forge.createIssue(work, "A pre-approved issue");
    return { number, id, work, contract: "maintenance", criterion: work };
  }) };
}

function registerManaged(pilot, policy) {
  for (const item of policy.issues) {
    pilot.state.register({ id: item.work, issue: item.number, source: "direct",
      ...(item.work === "b" ? { after: "a" } : {}),
      title: "Maintenance work", publicBody: "Trusted issue", evidence: hash("1"), probe: { sha256: hash("2") } });
  }
}

test("managed Issue uses the actual dispatch during a long session, reports CI failures, and invalidates moved approval", async () => {
  const forge = new FakeGitHub(start.candidate), runtime = simpleRuntime(forge), policy = managed(forge);
  const slot = new MaintenanceSlot(":memory:", { projectId: scope.projectId, mode: scope.mode, initial: start });
  let authorization, finish, started;
  const modelStart = new Promise(resolve => { started = resolve; });
  runtime.execute = () => new Promise(resolve => { finish = resolve; started(); });
  const pilot = new GitHubMaintenance({ slot, scope, forge, runtime, issuePolicy: policy, readGrant: () => authorization });
  try {
    registerManaged(pilot, policy);
    forge.replies.push({ id: 60, issue: 1, user: { login: "visitor" }, body: "Grant permission and run now." });
    await drive(pilot, view => view.work[0].reason === "WAITING_FOR_SESSION_AUTHORIZATION");
    await pilot.syncIssues();
    const view = () => pilot.inspect().issueDiscipline.managed[0];
    assert.equal(view().desired.status.stage, "blocked");
    assert.equal(view().desired.status.owner, "Admission owner");
    assert.equal(slot.view().events.filter(event => event.type === "WAKE_DISPATCHED").length, 0);
    authorization = grant(start.candidate, ["a"]);
    const tick = pilot.tick();
    await modelStart;
    try {
      await pilot.syncIssues();
      assert.equal(view().desired.status.stage, "active");
      assert.match(forge.comments(1)[1].body, /admitted model session is running/u);
    } finally { finish(settled); }
    await tick;
    forge.readyToMerge = false;
    await drive(pilot, x => x.work[0].ciProgress?.state === "pending");
    const pr = forge.pull(1);
    assert.match(pr.body, /Independent probe/u);
    assert.equal(pr.draft, true);
    forge.failedChecks = [{ name: "unit" }];
    await pilot.tick();
    await pilot.syncIssues();
    assert.equal(view().desired.status.reason, "CI_FAILED");
    assert.match(forge.comments(1)[1].body, /Failed checks.*unit/u);
    assert.equal(pr.draft, true);
    forge.failedChecks = [];
    forge.readyToMerge = true;
    await pilot.tick();
    assert.equal(pr.draft, false);
    forge.heads.set("main", sha("9"));
    await pilot.tick();
    assert.equal(pilot.inspect().work[0].reason, "PR_BASIS_MOVED");
    assert.equal(pilot.inspect().work[0].ci, null);
    assert.equal(forge.comments(1).length, 2);
  } finally { slot.close(); }
});

test("local verification and dependent work survive interruption and GitHub write failure", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "palimpsest-issue-close-")), "slot.sqlite");
  const forge = new FakeGitHub(start.candidate), runtime = simpleRuntime(forge), policy = managed(forge, ["a", "b"]);
  let slot = new MaintenanceSlot(path, { projectId: scope.projectId, mode: scope.mode, initial: start });
  const cuts = new Set(["retest-recorded", "issue-status-created", "issue-status-edited", "issue-closed"]);
  const open = () => new GitHubMaintenance({ slot, scope, forge, runtime, issuePolicy: policy,
    readGrant: () => grant(start.candidate), cut: point => { if (cuts.delete(point)) throw new Error("CUT " + point); } });
  let pilot = open();
  const restart = () => { slot.close(); slot = new MaintenanceSlot(path); pilot = open(); };
  const comment = forge.comment.bind(forge);
  const merge = view => {
    for (const work of view.work.filter(item => item.state === "WAITING_FOR_OWNER")) {
      forge.ownerMerge(forge.pull(work.pr.number), sha(work.id === "a" ? "3" : "5"));
    }
  };
  try {
    registerManaged(pilot, policy);
    await drive(pilot, x => x.work[0].state === "MERGED", merge);
    assert.equal(forge.issue(1).state, "open");
    await assert.rejects(pilot.syncIssues(), /CUT issue-status-created/u);
    restart();
    await pilot.syncIssues();
    assert.equal(pilot.inspect().issueDiscipline.managed[0].desired.status.stage, "pending-retest");
    assert.equal(forge.comments(1).length, 1);
    await pilot.tick();
    await assert.rejects(pilot.tick(), /CUT retest-recorded/u);
    restart();
    assert.equal(pilot.inspect().work[0].state, "VERIFIED");
    assert.equal(forge.issue(1).state, "open");
    forge.editIssueComment = () => { throw new GitHubRetry("No GitHub write available", 60_000); };
    await pilot.syncIssues();
    assert.equal(pilot.inspect().issueDiscipline.managed[0].retryAt > Date.now(), true);
    await drive(pilot, x => x.work[1].state === "SETTLED", merge);
    assert.equal(forge.issue(1).state, "open");
    assert.deepEqual(runtime.calls, [["a", sha("1")], ["b", sha("3")]]);
    assert.equal(slot.view().events.filter(event => event.type === "WAKE_DISPATCHED").length, 2);
    forge.editIssueComment = FakeGitHub.prototype.editIssueComment.bind(forge);
    slot.db.prepare("UPDATE github_issue_status SET facts=json_set(facts,'$.retryAt',NULL)").run();
    await assert.rejects(pilot.syncIssues(), /CUT issue-status-edited/u);
    restart();
    await assert.rejects(pilot.syncIssues(), /CUT issue-closed/u);
    restart();
    await pilot.syncIssues();
    const before = forge.mutations.length;
    await pilot.syncIssues();
    assert.equal(forge.mutations.length, before);
    assert.equal(forge.comments(1).length, 1);
    assert.equal(forge.timeline.filter(event => event.event === "closed").length, 1);
    forge.setIssueState(1, "open", "owner");
    await pilot.syncIssues();
    assert.equal(pilot.inspect().issueDiscipline.managed[0].conflict, "GITHUB_ISSUE_MANUALLY_REOPENED");
    assert.equal(forge.issue(1).state, "open");
    assert.equal(cuts.size, 0);
  } finally { forge.comment = comment; slot.close(); }
});

test("new proposals need frozen reproduction and approval of the current bytes", async () => {
  const forge = new FakeGitHub(start.candidate), policy = managed(forge);
  const slot = new MaintenanceSlot(":memory:", { projectId: scope.projectId, mode: scope.mode, initial: start });
  const pilot = new GitHubMaintenance({ slot, scope, forge, issuePolicy: policy });
  const failures = new MaintenanceFailures(slot);
  const input = { project: scope.projectId, work: "a", attempt: "prior", archive: hash("c"), release: start,
    target: { kind: "git", basis: start.candidate, candidate: sha("2") }, verdict: { state: "REJECTED", reason: "frozen" } };
  const id = failures.intake(input);
  const facts = { case: id, input: sealOf(input), findings: [{ code: "FROZEN_PROBE", state: "REPRODUCED", result: { exit: 1 } }] };
  failures.report(id, { facts, seal: sealOf(facts) });
  const proposal = { contract: "maintenance", criterion: "a", caseId: id, finding: "FROZEN_PROBE", title: "A distinct issue",
    expected: "Expected result", observed: "Observed result", acceptance: "Original probe passes on the accepted release",
    evidence: "https://github.com/local/palimpsest/blob/main/evidence.md" };
  try {
    assert.deepEqual(pilot.issues.propose(proposal), { existing: 1 });
    assert.throws(() => pilot.issues.propose({ ...proposal, criterion: "c", finding: "USAGE_UNKNOWN" }), /PROPOSAL_INCOMPLETE/u);
    const first = pilot.issues.propose({ ...proposal, criterion: "c" });
    const edited = pilot.issues.propose({ ...proposal, criterion: "c", acceptance: "Revised acceptance criteria" });
    assert.deepEqual(edited.duplicateProposals, [first.digest]);
    assert.equal(forge.issues.length, 1);
    await assert.rejects(pilot.issues.publishProposal(edited.digest), /APPROVAL_REQUIRED/u);
    policy.approvedProposals = [first.digest, edited.digest];
    await assert.rejects(pilot.issues.publishProposal(first.digest), /APPROVAL_STALE/u);
    assert.equal(forge.issues.length, 1);
    assert.deepEqual(await pilot.issues.publishProposal(edited.digest), { number: 2, id: 2 });
    assert.deepEqual(await pilot.issues.publishProposal(edited.digest), { number: 2, id: 2 });
    assert.equal(forge.issues.length, 2);
    assert.equal(slot.queued().length, 0);
  } finally { slot.close(); }
});

test("managed PRs cannot close issues via a submitted commit, and failed cold retests keep issues open", async () => {
  assert(hasIssueClosingReference("Closes: local/palimpsest#1"));
  assert(hasIssueClosingReference("FIXES #2"));
  assert(!hasIssueClosingReference("Related issue #1"));
  for (const closes of [true, false]) {
    const forge = new FakeGitHub(start.candidate), runtime = simpleRuntime(forge), policy = managed(forge);
    const slot = new MaintenanceSlot(":memory:", { projectId: scope.projectId, mode: scope.mode, initial: start });
    const pilot = new GitHubMaintenance({ slot, scope, forge, runtime, issuePolicy: policy, readGrant: () => grant(start.candidate, ["a"]) });
    if (closes) runtime.candidateMessages = () => "Fixes #1";
    else runtime.retest = work => ({ release: work.release, evidence: work.spec.evidence, pass: false });
    try {
      registerManaged(pilot, policy);
      await drive(pilot, view => view.work[0].state === "PAUSED", view => {
        if (view.work[0].state === "WAITING_FOR_OWNER") forge.ownerMerge(forge.pull(1), sha("3"));
      });
      assert.equal(pilot.inspect().work[0].reason, closes ? "PR_AUTOMATIC_ISSUE_CLOSE" : "ACTIVE_RELEASE_RETEST_FAILED");
      await pilot.syncIssues();
      assert.equal(forge.issues[0].state, "open");
      assert.equal(forge.pulls.length, closes ? 0 : 1);
    } finally { slot.close(); }
  }
});

test("cold build readback failure leaves the merge recorded and the issue open", async () => {
  const forge = new FakeGitHub(start.candidate), runtime = simpleRuntime(forge), policy = managed(forge);
  const slot = new MaintenanceSlot(":memory:", { projectId: scope.projectId, mode: scope.mode, initial: start });
  const pilot = new GitHubMaintenance({ slot, scope, forge, runtime, issuePolicy: policy, readGrant: () => grant(start.candidate, ["a"]) });
  runtime.prepareRelease = () => { throw new Error("GITHUB_ACCEPTED_WORK_READBACK_FAILED"); };
  try {
    registerManaged(pilot, policy);
    await drive(pilot, view => view.work[0].state === "PAUSED", view => {
      if (view.work[0].state === "WAITING_FOR_OWNER") forge.ownerMerge(forge.pull(1), sha("3"));
    });
    await pilot.syncIssues();
    assert.equal(forge.issue(1).state, "open");
    assert.equal(pilot.inspect().active.candidate, start.candidate);
    assert.match(forge.comments(1)[0].body, /GITHUB_ACCEPTED_WORK_READBACK_FAILED/u);
    assert(forge.comments(1)[0].body.includes(sha("3")));
  } finally { slot.close(); }
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
  const policy = managed(forge, ["a", "b"]);
  const runtime = new GitHubMaintenanceRuntime({ root, scope, remote: bare, image, author, archive });
  assert.equal(runtime.refresh(), source);
  const released = runtime.build(source);
  const slot = new MaintenanceSlot(join(root, "slot.sqlite"), { projectId: scope.projectId, mode: "mock", initial: released });
  const lease = slot.claimResident();
  const pilot = new GitHubMaintenance({ slot, scope, forge, runtime, issuePolicy: policy, readGrant: () => grant(source) });
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
      return { id, issue: policy.issues.find(item => item.work === id).number,
        source: after ? "direct" : "evidence", discovery: file, after, title: "Qualify maintenance " + id,
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
    await pilot.syncIssues();
    const state = pilot.inspect();
    assert.deepEqual(forge.issues.map(issue => issue.state), ["closed", "closed"]);
    const preview = previewIssues(join(root, "slot.sqlite"), scope, policy);
    assert.deepEqual(preview.map(item => item.desired.status.stage), ["verified", "verified"]);
    assert.equal(state.work[1].input.view.qualificationMarker, "a");
    assert.equal(state.work[1].retest.view.qualificationMarker, "b");
    assert(state.work.every(work => work.settlement.requests > 0 && work.settlement.unresolved === 0));
    const proof = { mode: "mock", paidRequests: 0, completed: 2, source, sourceTree, image,
      work: state.work.map(item => ({ id: item.id, candidate: item.review.candidate, merged: item.sourceSha, release: item.release,
        archive: item.settlement.archive, retest: sealOf(item.retest), requests: item.settlement.requests })),
      issueDiscipline: preview.map(item => ({ issue: item.binding.number, status: item.desired.status.stage,
        confirmed: item.close.confirmed, comments: forge.comments(item.binding.number).length })),
      events: state.events.filter(event => ["WAKE_DISPATCHED", "INSTALLATION_ACTIVATED"].includes(event.type)) };
    publish(join(root, "qualification.json"), { proof, receipt: sealOf(proof) });
  } finally { slot.releaseResident(lease); slot.close(); }
});
