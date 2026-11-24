
/** The public Issue derives from a selected maintenance slot. It never grants Work. */
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { GitHubRetry } from "./github-forge.mjs";
import { readGitHubWork, publishOnce } from "./github-maintenance-state.mjs";
import { sealOf } from "./slot.mjs";

const slug = value => typeof value === "string" && /^[a-z][a-z0-9-]{0,63}$/u.test(value);
const sha = /^[0-9a-f]{40}$/u;
const digest = /^[0-9a-f]{64}$/u;
const terminal = new Set(["VERIFIED", "PAUSED", "REJECTED"]);
const labels = {
  queued: { name: "maintenance:queued", color: "d4c5f9" },
  active: { name: "maintenance:active", color: "1d76db" },
  blocked: { name: "maintenance:blocked", color: "b60205" },
  "pending-retest": { name: "maintenance:pending-retest", color: "fbca04" },
};

const hasTable = (db, name) => db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
const byId = id => Number.isSafeInteger(id) && id > 0;

function publicLink(scope, value) {
  if (!value) return null;
  assert(new URL(value).origin === "https://github.com" &&
    value.startsWith("https://github.com/" + scope.repository + "/") &&
    !/[\s<>()\\]/u.test(value), "GITHUB_PUBLIC_LINK_OUTSIDE_REPOSITORY");
  return value;
}

function policies(scope, policy) {
  assert(policy && slug(policy.authority) && Array.isArray(policy.issues), "GITHUB_ISSUE_POLICY_REQUIRED");
  for (const entry of policy.issues) {
    assert(byId(entry.number) && byId(entry.id) && slug(entry.work) && slug(entry.contract) &&
      slug(entry.criterion), "GITHUB_MANAGED_ISSUE_BINDING_REQUIRED");
    publicLink(scope, entry.evidence);
  }
  assert(new Set(policy.issues.map(item => item.id)).size === policy.issues.length &&
    new Set(policy.issues.map(item => item.number)).size === policy.issues.length &&
    new Set(policy.issues.map(item => item.contract + "/" + item.criterion)).size === policy.issues.length,
  "GITHUB_MANAGED_ISSUE_BINDING_AMBIGUOUS");
  return policy;
}

function fromTable(db, name) {
  return hasTable(db, name) ? db.prepare("SELECT * FROM " + name + " ORDER BY rowid").all() : [];
}

function bindings(db, scope, policy) {
  policies(scope, policy);
  const published = fromTable(db, "github_issue_proposals").filter(row => row.issue !== null).map(row => ({
    ...JSON.parse(row.issue), ...JSON.parse(row.spec).problem,
  }));
  const configured = policy.issues.map(entry => ({ ...entry }));
  for (const item of published) {
    const existing = configured.find(entry => entry.number === item.number || entry.id === item.id);
    if (existing) {
      assert(existing.number === item.number && existing.id === item.id &&
        existing.contract === item.contract && existing.criterion === item.criterion, "GITHUB_MANAGED_ISSUE_BINDING_CHANGED");
    } else configured.push(item);
  }
  return configured;
}

function retestFacts(work, root) {
  const { retest, release } = work ?? {};
  return work?.state === "VERIFIED" && digest.test(work.qualification) && work.review?.delivery &&
    root && digest.test(root.spec.probe?.sha256) && root.spec.probe.sha256 === work.spec.probe?.sha256 && retest?.pass === true &&
    retest.evidence === work.spec.evidence && sha.test(work.sourceSha) && release?.candidate === work.sourceSha &&
    digest.test(release?.buildSha256) && sealOf(retest.release) === sealOf(release)
    ? { source: work.sourceSha, build: release.buildSha256, receipt: sealOf(retest), work: work.id } : null;
}

const displayReason = value => typeof value === "string" && /^[A-Za-z][A-Za-z0-9_ -]{0,95}$/u.test(value) ? value : null;

function project(binding, scope, input, live) {
  const related = input.work.filter(item => item.issue?.number === binding.number && item.issue?.id === binding.id);
  const root = related.find(row => row.id === binding.work);
  assert(related.every(row => row.id === binding.work || row.spec.origin?.work === binding.work ||
    related.find(parent => parent.id === row.spec.origin?.work)), "GITHUB_MANAGED_ISSUE_WORK_CHANGED");
  const current = related.findLast(row => !terminal.has(row.state)) ?? related.at(-1);
  const failure = input.failures.findLast(entry => related.some(row => row.attempt === entry.input.attempt));
  const draft = input.drafts.findLast(entry => entry.work?.issue === binding.number && related.some(row => row.attempt === entry.work.origin.attempt));
  const next = current?.attempt === draft?.work?.origin.attempt ? draft?.work : null;
  const review = retestFacts(current, root);
  const historical = related.find(row => row.priorRejection || row.state === "REJECTED");
  const original = historical?.priorRejection?.review ?? historical?.review;
  const record = {
    issue: binding.number,
    source: input.active.candidate,
    evidence: publicLink(scope, binding.evidence),
    ...(original && { original: displayReason(original.reason) ?? "REJECTED" }),
    ...(failure?.report && { investigation: failure.report.seal }),
    ...(failure?.report?.facts.accounting?.usage === "UNKNOWN" && { usage: "UNKNOWN" }),
    ...(next && { continuation: next.id, checks: next.remaining.map(displayReason).filter(Boolean), replay: draft.receipt?.seal,
      probe: draft.receipt?.facts.frozen?.counts ?? null }),
    ...(current?.pr && { pr: current.pr.number }),
    ...(current?.sourceSha && { merged: current.sourceSha }),
  };
  const status = (stage, owner, todo, reason, extra) => ({ ...record, stage, owner, todo,
    ...(reason && { reason: displayReason(reason) ?? "MAINTENANCE_REVIEW_REQUIRED" }), ...extra });
  if (review) return status("verified", "Evidence", "Independent release retest complete.", null, { review, source: review.source });
  if (next && current?.attempt === next.origin.attempt && terminal.has(current.state)) {
    return next.state === "REVIEW_REQUIRED"
      ? status("blocked", "Maintenance supervisor", "Review the draft replay refusal before scheduling recovery.",
        next.remaining[0], { draftState: next.state })
      : status("blocked", "Admission owner",
        "Review the usage stop and the continuation against the active installation and current main before granting a new session.",
        next.blocker, { draftState: next.state });
  }
  if (["MERGED", "ACTIVATED"].includes(current?.state)) return status("pending-retest", "Evidence",
    "Cold-start the merged build and retest the original issue criteria.");
  if (current?.state === "VERIFIED") return status("blocked", "Evidence", "Check the release receipt against the issue contract.", "ISSUE_RETEST_NOT_BOUND");
  if (current?.ciProgress?.state === "failed") return status("blocked", "Maintenance reviewer",
    "Review CI failures on the sealed candidate.", "CI_FAILED", { failures: current.ciProgress.failures });
  if (current?.reason === "WAITING_FOR_SESSION_AUTHORIZATION") return status("blocked", "Admission owner",
    "Review the session authorization for this work.", current.reason);
  if (current?.state === "PAUSED" || current?.state === "REJECTED") return status("blocked", "Maintenance supervisor",
    "Review the first confirmed failure and the authorized recovery path.", failure?.disposition?.state === "PAUSED_REPEAT" ? "PAUSED_REPEAT" : current.reason);
  if (current?.state === "RUNNING" && input.jobs.get(current.attempt) === "RUNNING") return live === current.attempt
    ? status("active", "Maintenance", "The admitted model session is running.")
    : status("blocked", "Maintenance supervisor", "Reconcile the writer and settlement before resuming.", "WAITING_FOR_WRITER_RECONCILIATION");
  if (["WAITING_FOR_BRANCH_SLOT", "WAITING_FOR_WRITER"].includes(current?.reason)) return status("queued", "Maintenance",
    "Wait for the occupied work slot to become available.", current.reason);
  if (current?.reason && !(current.state === "WAITING_FOR_OWNER" || current.state === "WAITING_FOR_CI")) {
    return status("blocked", "Maintenance supervisor", "Resolve the recorded blocker.", current.reason);
  }
  if (current?.state === "WAITING_FOR_OWNER") return status("active", "Repository owner", "Review and merge the exact CI-qualified head.");
  if (current?.state === "WAITING_FOR_CI") return status("active", "CI", "Wait for checks on the sealed candidate.");
  if (["SETTLED", "QUALIFIED"].includes(current?.state)) return status("active", "Evidence", "Verify or publish the sealed candidate.");
  return status("queued", "Maintenance", "Wait for an admitted maintenance work item.");
}

function snapshot(db, scope, policy, live) {
  if (!policy) return null;
  assert(db.prepare("SELECT seal FROM github_maintenance_scope WHERE id=1").get()?.seal === sealOf(scope),
    "GITHUB_MAINTENANCE_SCOPE_CHANGED");
  const input = { work: readGitHubWork(db), active: JSON.parse(db.prepare("SELECT active FROM slot WHERE id=1").get().active),
    jobs: new Map(db.prepare("SELECT id,status FROM inbox").all().map(row => [row.id, row.status])),
    failures: fromTable(db, "maintenance_failure_cases").map(row => ({ input: JSON.parse(row.input),
      report: JSON.parse(row.report), disposition: JSON.parse(row.disposition) })),
    drafts: fromTable(db, "maintenance_draft_replays").map(row => ({ work: JSON.parse(row.work), receipt: JSON.parse(row.receipt) })) };
  const saved = new Map(fromTable(db, "github_issue_status").map(row => [row.id, JSON.parse(row.facts)]));
  const revision = db.prepare("SELECT coalesce(max(seq),0) AS seq FROM events").get().seq;
  return bindings(db, scope, policy).map(binding => {
    const status = project(binding, scope, input, live);
    const digest = sealOf(status), prior = saved.get(binding.id);
    const identity = { authority: policy.authority, number: binding.number, id: binding.id,
      contract: binding.contract, criterion: binding.criterion, work: binding.work ?? null };
    const changed = prior?.identity && sealOf({ ...prior.identity, work: prior.identity.work ?? identity.work }) !== sealOf(identity);
    return { binding, identity, desired: prior?.desired?.digest === digest ? prior.desired :
      { status, digest, revision: Math.max(revision, (prior?.desired?.revision ?? -1) + 1) },
      sent: prior?.sent ?? null, close: prior?.close ?? null, conflict: changed ? "GITHUB_ISSUE_AUTHORITY_CHANGED" : prior?.conflict ?? null,
      retryAt: prior?.retryAt ?? null, retryReason: prior?.retryReason ?? null };
  });
}

export function previewIssues(file, scope, policy) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    db.exec("BEGIN");
    return snapshot(db, scope, policy);
  } finally { db.close(); }
}

function statusBody(scope, status) {
  const { stage, owner, todo, reason, source, evidence, original, usage, investigation, continuation,
    checks, replay, probe, pr, merged, review, failures, draftState } = status;
  return [
    "**Maintenance status** · " + stage + (reason ? " (`" + reason + "`)" : ""),
    "**Next** · " + owner + " — " + todo,
    "**" + (review ? "Verified release" : "Active maintenance source") + "** · `" + source + "`",
    ...(original ? ["**Original result** · REJECTED (`" + original + "`)"] : []),
    ...(usage ? ["**Usage** · " + usage + " in the archived attempt"] : []),
    ...(probe ? ["**Draft offline probe** · " + probe.passed + "/" + probe.tests] : []),
    ...(continuation ? ["**Continuation** · `" + continuation + "` · " + draftState] : []),
    ...(checks?.length ? ["**Remaining checks** · " + checks.join(", ")] : []),
    ...(pr ? ["**PR** · #" + pr] : []),
    ...(failures?.length ? ["**Failed checks** · " + failures.map(item => item.url ?
      "[" + item.name + "](" + publicLink(scope, item.url) + ")" : item.name).join(", ")] : []),
    ...(merged ? ["**Merged source** · `" + merged + "`"] : []),
    "[Current main](https://github.com/" + scope.repository + "/commits/main)",
    ...(review ? ["**Independent release retest** · PASS\n\nBuild `" + review.build + "` · receipt `" + review.receipt + "`"] : []),
    ...(evidence ? ["[Maintenance evidence](" + evidence + ")"] : []),
    ...(investigation ? ["Investigation `" + investigation + "`"] : []),
    ...(replay ? ["Draft replay `" + replay + "`"] : []),
  ].join("\n\n");
}

class IssueConflict extends Error {}
function requireRemote(condition, reason) {
  if (!condition) throw new IssueConflict(reason);
}

export class GitHubIssueDiscipline {
  constructor({ state, scope, policy, forge, cut = () => {} }) {
    this.state = state;
    this.db = state.db;
    this.scope = scope;
    this.policy = policies(scope, policy);
    this.forge = forge;
    this.cut = cut;
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS github_issue_status (id INTEGER PRIMARY KEY, facts TEXT NOT NULL) STRICT;" +
      "CREATE TABLE IF NOT EXISTS github_issue_proposals (digest TEXT PRIMARY KEY, problem TEXT NOT NULL, spec TEXT NOT NULL, issue TEXT) STRICT;"
    );
  }

  view(live) { return snapshot(this.db, this.scope, this.policy, live); }

  manages(issue) {
    return bindings(this.db, this.scope, this.policy).some(item => item.id === issue?.id && item.number === issue?.number);
  }

  permitsWork(issue, work) {
    const binding = bindings(this.db, this.scope, this.policy).find(item =>
      item.id === issue?.id && item.number === issue?.number);
    if (!binding || binding.readOnly || !binding.work) return false;
    if (work.id === binding.work) return true;
    return Boolean(work.spec.origin && this.state.list().some(parent => parent.id === work.spec.origin.work &&
      parent.issue?.id === binding.id && parent.issue?.number === binding.number));
  }

  pending() {
    return this.view().some(row => !row.binding.readOnly && !row.conflict &&
      (row.sent?.digest !== row.desired.digest || (row.desired.status.stage === "verified" && !row.close?.confirmed)));
  }

  #save(row) {
    const { binding, ...facts } = row;
    this.db.prepare("INSERT INTO github_issue_status VALUES (?,?) ON CONFLICT(id) DO UPDATE SET facts=excluded.facts")
      .run(binding.id, JSON.stringify(facts));
  }

  async sync(live) {
    for (const row of this.view(live)) {
      if (row.binding.readOnly || row.conflict || row.retryAt > Date.now()) continue;
      this.#save(row);
      try {
        await this.#write(row);
        row.retryAt = null;
        row.retryReason = null;
      } catch (error) {
        if (error instanceof GitHubRetry) {
          row.retryAt = Date.now() + error.waitMs;
          row.retryReason = error.message;
        } else if (error instanceof IssueConflict || [403, 404, 422].includes(error.status)) row.conflict = error.message;
        else throw error;
      }
      this.#save(row);
    }
  }

  async #write(row) {
    const { binding, desired } = row;
    const forge = this.forge, number = binding.number;
    const author = item => item?.user?.login === this.scope.publisher;
    const issue = await forge.issue(number);
    requireRemote(issue.id === binding.id && issue.number === number, "GITHUB_ISSUE_BINDING_CHANGED");
    const marker = "<!-- palimpsest-status:" + this.scope.repositoryId + ":" + binding.id + " -->";
    const status = statusBody(this.scope, desired.status);
    const stamp = "<!-- " + this.policy.authority + " " + desired.revision + " " + desired.digest + " " + sealOf(status) + " -->";
    const body = status + "\n\n" + marker + "\n" + stamp;
    const lastEvent = async () => (await forge.issueTimeline(number)).findLast(event => ["closed", "reopened"].includes(event.event));
    if (issue.state !== "open") {
      const last = await lastEvent();
      if (row.close && (!last || last.id === row.close.before)) throw new GitHubRetry("GITHUB_ISSUE_CLOSE_EVENT_UNCONFIRMED");
      requireRemote(row.close && row.sent?.digest === desired.digest && last?.event === "closed" && last?.actor?.login === this.scope.publisher &&
        last.id !== row.close.before && (!row.close.event || row.close.event === last.id) &&
        issue.state_reason === "completed", "GITHUB_ISSUE_MANUALLY_CLOSED");
      row.close = { ...row.close, confirmed: true, event: last.id };
      return;
    }
    const previousState = await lastEvent();
    requireRemote(!row.close?.confirmed && (!row.close || row.close.before === (previousState?.id ?? null)) &&
      (!previousState || previousState.event !== "reopened"), "GITHUB_ISSUE_MANUALLY_REOPENED");
    const find = async () => {
      const matches = (await forge.comments(number)).filter(comment => author(comment) && comment.body?.includes("\n\n" + marker + "\n"));
      requireRemote(matches.length <= 1, "GITHUB_ISSUE_STATUS_AMBIGUOUS");
      requireRemote(!row.sent || matches[0]?.id === row.sent.id, "GITHUB_ISSUE_STATUS_COMMENT_CHANGED");
      return matches[0] ?? null;
    };
    let comment = await publishOnce(this.state, "issue-status:" + binding.id, find, () => forge.comment(number, body),
      () => this.cut("issue-status-created", number));
    requireRemote(author(comment) && typeof comment.body === "string" && byId(comment.id), "GITHUB_ISSUE_STATUS_WRITER_CHANGED");
    if (comment.body !== body) {
      const [rendered, meta] = comment.body.split("\n\n" + marker + "\n");
      const fields = /^<!-- ([a-z0-9-]+) (\d+) ([a-f0-9]{64}) ([a-f0-9]{64}) -->$/u.exec(meta);
      requireRemote(fields?.[1] === this.policy.authority && fields[4] === sealOf(rendered) &&
        (fields[3] === desired.digest || Number(fields[2]) < desired.revision), "GITHUB_ISSUE_STATUS_REVISION_CONFLICT");
      if (fields[3] !== desired.digest) {
        comment = await forge.editIssueComment(comment.id, body);
        requireRemote(author(comment) && comment.body === body, "GITHUB_ISSUE_STATUS_UPDATE_UNCONFIRMED");
        await this.cut("issue-status-edited", number);
      }
    }
    const names = new Set((issue.labels ?? []).map(label => label.name));
    const label = labels[desired.status.stage];
    if (label && !names.has(label.name)) {
      await forge.ensureLabel(label);
      await forge.addIssueLabel(number, label.name);
    }
    for (const item of Object.values(labels)) {
      if (item.name !== label?.name && names.has(item.name)) await forge.removeIssueLabel(number, item.name);
    }
    row.sent = { id: comment.id, digest: desired.digest };
    this.#save(row);
    if (desired.status.stage !== "verified") return;
    const current = await forge.issue(number), last = await lastEvent();
    requireRemote(current.id === binding.id && current.state === "open" && last?.id === previousState?.id,
      "GITHUB_ISSUE_STATE_CHANGED_BEFORE_CLOSE");
    row.close = { before: last?.id ?? null, confirmed: false };
    this.#save(row);
    const closed = await forge.closeIssue(number);
    await this.cut("issue-closed", number);
    requireRemote(closed?.id === binding.id && closed.state === "closed" && closed.state_reason === "completed",
      "GITHUB_ISSUE_CLOSE_UNCONFIRMED");
    const applied = await lastEvent();
    if (!applied || applied.id === row.close.before) throw new GitHubRetry("GITHUB_ISSUE_CLOSE_EVENT_UNCONFIRMED");
    requireRemote(applied.event === "closed" && applied.actor?.login === this.scope.publisher, "GITHUB_ISSUE_MANUALLY_CLOSED");
    row.close = { ...row.close, confirmed: true, event: applied.id };
  }

  proposals() {
    return fromTable(this.db, "github_issue_proposals").map(row => ({ digest: row.digest,
      proposal: JSON.parse(row.spec), issue: JSON.parse(row.issue) }));
  }

  propose(input) {
    const { contract, criterion, caseId, finding, title, expected, observed, acceptance, evidence } = input;
    assert(slug(contract) && slug(criterion) && /^failure-[0-9a-f]{64}$/u.test(caseId) &&
      finding === "FROZEN_PROBE" && [title, expected, observed, acceptance].every(value =>
        typeof value === "string" && value.trim() && value.length <= 700 && !value.includes("<!--")) &&
      title.length <= 200 && !/[\r\n]/u.test(title) && evidence, "GITHUB_ISSUE_PROPOSAL_INCOMPLETE");
    publicLink(this.scope, evidence);
    const same = bindings(this.db, this.scope, this.policy).find(item => item.contract === contract && item.criterion === criterion);
    if (same) return { existing: same.number };
    const row = fromTable(this.db, "maintenance_failure_cases").find(item => item.id === caseId);
    const source = row && JSON.parse(row.input), report = row && JSON.parse(row.report);
    assert(report?.seal === sealOf(report?.facts ?? null) && report.facts.case === caseId && report.facts.input === sealOf(source) &&
      report.facts.findings.some(item => item.code === finding && item.state === "REPRODUCED" && item.result?.exit === 1) &&
      sha.test(source.target.candidate), "GITHUB_ISSUE_PROPOSAL_REPRODUCTION_REQUIRED");
    const proposal = { problem: { contract, criterion, evidence }, caseId, finding, title, expected, observed, acceptance,
      version: source.target.candidate, receipt: report.seal };
    const id = sealOf(proposal), key = contract + "/" + criterion;
    this.db.prepare("INSERT OR IGNORE INTO github_issue_proposals VALUES (?,?,?,NULL)").run(id, key, JSON.stringify(proposal));
    return { digest: id, proposal, duplicateProposals: this.proposals().filter(item => item.digest !== id &&
      item.proposal.problem.contract === contract && item.proposal.problem.criterion === criterion).map(item => item.digest) };
  }

  async publishProposal(approved) {
    assert(digest.test(approved) && this.policy.approvedProposals?.includes(approved), "GITHUB_ISSUE_PROPOSAL_APPROVAL_REQUIRED");
    const row = this.db.prepare("SELECT * FROM github_issue_proposals WHERE digest=?").get(approved);
    assert(row && this.db.prepare("SELECT digest FROM github_issue_proposals WHERE problem=? ORDER BY rowid DESC LIMIT 1").get(row.problem).digest === approved,
      "GITHUB_ISSUE_PROPOSAL_APPROVAL_STALE");
    if (row.issue) return JSON.parse(row.issue);
    const spec = JSON.parse(row.spec);
    assert(sealOf(spec) === approved, "GITHUB_ISSUE_PROPOSAL_APPROVAL_CHANGED");
    const existing = bindings(this.db, this.scope, this.policy).find(item =>
      item.contract === spec.problem.contract && item.criterion === spec.problem.criterion);
    if (existing) return { existing: existing.number };
    const marker = "<!-- palimpsest-problem:" + this.scope.repositoryId + ":" + row.problem + " -->";
    const body = "**Expected**\n\n" + spec.expected + "\n\n**Observed on " + spec.version + "**\n\n" + spec.observed +
      "\n\n**Closure criteria**\n\n" + spec.acceptance + "\n\n[Reproduction evidence](" + spec.problem.evidence +
      ")\n\nReceipt `" + spec.receipt + "`\n\n" + marker;
    const found = await publishOnce(this.state, "issue-proposal:" + row.problem,
      () => this.forge.findIssue(marker, this.scope.publisher), () => this.forge.createIssue(spec.title, body));
    assert(found.user?.login === this.scope.publisher && found.body === body && byId(found.number) && byId(found.id),
      "GITHUB_ISSUE_PROPOSAL_PUBLICATION_CHANGED");
    const issue = { number: found.number, id: found.id };
    this.db.prepare("UPDATE github_issue_proposals SET issue=? WHERE digest=?").run(JSON.stringify(issue), approved);
    return issue;
  }
}
