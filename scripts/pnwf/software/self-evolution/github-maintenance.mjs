
/** Advance the test, maintenance and supervision roles against one native maintenance slot. */
import assert from "node:assert/strict";
import { sha } from "../../energy/contract.mjs";
import { GitHubRetry } from "./github-forge.mjs";
import { MaintenanceFailures, repeatedFailure } from "./failure-investigation.mjs";
import { GitHubMaintenanceState, publishOnce } from "./github-maintenance-state.mjs";
import { GitHubIssueDiscipline } from "./github-issue-discipline.mjs";
import { sealOf } from "./slot.mjs";

export const githubWindow = Object.freeze({
  maxRequests: 256, wallClockMs: 60 * 60_000, requestTimeoutMs: 240_000, billingCeiling: null,
});
const terminal = new Set(["VERIFIED", "REJECTED", "PAUSED"]);
const workPhases = new Set(["READY", "RUNNING"]);
export const hasIssueClosingReference = text =>
  /\b(?:clos(?:e|es|ed)|fix(?:es|ed)?|resolv(?:e|es|ed))\b\s*:?\s*(?:[\w.-]+\/[\w.-]+)?#\d+\b/iu.test(text);

function draftBody(work) {
  const { review } = work;
  const quote = value => "`" + value + "`";
  const paths = (review.paths ?? []).filter(path => /^[a-zA-Z0-9._/-]+$/u.test(path));
  const probe = review.next?.counts;
  const prior = work.priorRejection?.review?.reason;
  return [
    "Related issue #" + work.issue.number,
    "Basis " + quote(review.basis),
    "Submitted candidate " + quote(review.candidate),
    "Review receipt " + quote(sealOf(review)),
    ...(paths.length ? ["Changed paths · " + paths.map(quote).join(", ")] : []),
    "Independent probe · expected failure on the basis, pass on the candidate" +
      (probe?.tests ? " (" + probe.passed + "/" + probe.tests + ")" : ""),
    "Public regression · " + (review.regression ? "passed" : "no separate command in this contract"),
    ...(prior && /^[a-zA-Z0-9_-]+$/u.test(prior) ? ["Preserved prior rejection · " + quote(prior)] : []),
    ...(work.spec.origin ? ["Prior investigation " + quote(work.spec.origin.investigation)] : []),
    "Remaining · exact-head CI, owner review, and cold retest of the merged release.",
  ].join("\n\n");
}

export function githubAdmission(grant, request, scope, workId, predecessor, at = Date.now()) {
  const window = request.requestWindow;
  const ceiling = grant?.window?.billingCeiling;
  const withinCeiling = ceiling === null || (Number.isSafeInteger(ceiling) && ceiling > 0 &&
    Number.isSafeInteger(window?.billingCeiling) && window.billingCeiling > 0 && window.billingCeiling <= ceiling);
  if (!grant || grant.revoked || grant.repositoryId !== scope.repositoryId || grant.project !== request.project ||
    grant.mode !== request.mode || Date.parse(grant.expiresAt) <= at || !Number.isFinite(Date.parse(grant.expiresAt)) ||
    !Array.isArray(grant.work) || grant.work.length > 2 || !grant.work.includes(workId) || !withinCeiling ||
    !["maxRequests", "wallClockMs", "requestTimeoutMs"].every(key =>
      Number.isSafeInteger(window?.[key]) && window[key] > 0 && window[key] <= grant.window[key]) ||
    !sha(grant.initial)) return null;
  const index = grant.work.indexOf(workId);
  if (index === 0 ? request.release.candidate !== grant.initial :
    !(predecessor?.id === grant.work[index - 1] && predecessor.state === "VERIFIED" &&
      sealOf(predecessor.release) === sealOf(request.release))) return null;
  return { actor: "trusted-github-pilot",
    reason: "Authorized maintenance work " + workId + " under " + sealOf(grant) };
}

export class GitHubMaintenance {
  #liveAttempt;
  #issueSync;

  constructor({ slot, scope, forge, runtime, readGrant, issuePolicy, cut = () => {} }) {
    assert(slot.current().project === scope.projectId && slot.current().mode === scope.mode, "GITHUB_SLOT_SCOPE_CHANGED");
    this.slot = slot;
    this.scope = scope;
    this.forge = forge;
    this.runtime = runtime;
    this.readGrant = readGrant;
    this.cut = cut;
    this.state = new GitHubMaintenanceState(slot, scope);
    if (runtime?.failureEvidence) this.failures = new MaintenanceFailures(slot);
    if (issuePolicy) this.issues = new GitHubIssueDiscipline({ state: this.state, scope, policy: issuePolicy, forge, cut });
  }

  syncIssues() {
    if (!this.issues) return Promise.resolve();
    this.#issueSync ??= this.issues.sync(this.#liveAttempt).finally(() => { this.#issueSync = undefined; });
    return this.#issueSync;
  }

  inspect() {
    return { scope: this.scope, active: this.slot.current().active, work: this.state.list().map(({ spec, ...item }) =>
      ({ ...item, source: spec.source, title: spec.title, ...(spec.origin ? { origin: spec.origin } : {}) })),
      failureCases: this.failures?.list() ?? this.state.readFailureCases(),
      draftContinuations: this.failures?.drafts() ?? this.state.readDraftContinuations(), events: this.slot.view().events,
      ...(this.issues ? { issueDiscipline: { managed: this.issues.view(this.#liveAttempt), proposals: this.issues.proposals() } } : {}) };
  }

  resumeRejected(id, recovery) {
    const work = this.state.list().find(row => row.id === id);
    assert(work?.issue && recovery.archive, "GITHUB_REWORK_NEEDS_REVIEWED_ISSUE");
    if (work.recovery) {
      assert.deepEqual(work.recovery, recovery, "GITHUB_REWORK_BINDING_CHANGED");
      return;
    }
    const slot = this.slot.current();
    assert(work.state === "REJECTED" && !work.pr && !slot.writer && !slot.blocked &&
      work.settlement?.reconciled && work.settlement.archive === recovery.archive &&
      work.review?.archive === recovery.archive &&
      work.review.reason === "candidate-bound-delivery", "GITHUB_REWORK_NEEDS_SETTLED_REJECTION");
    assert.deepEqual(work.releaseAtDispatch, slot.active, "GITHUB_REWORK_BASIS_MOVED");
    const { attempt, settlement, review, admission } = work;
    this.state.update(work, { state: "READY", reason: null, recovery, priorRejection: { attempt, settlement, review, admission },
      attempt: null, settlement: null, review: null, admission: null });
  }

  #publish(id, find, create) {
    return publishOnce(this.state, id, find, create, () => this.cut("published", id));
  }

  #marker(work, suffix) {
    return "<!-- palimpsest:" + this.scope.projectId + ":" + work.id + ":" + suffix + " -->";
  }

  #authored(item) {
    return item.user?.login === this.scope.publisher;
  }

  async #issue(work) {
    const { spec } = work;
    if (spec.origin) {
      const origin = this.failures.list().find(row => row.id === spec.origin.case);
      if (origin?.disposition?.work !== work.id) return;
      const parent = this.state.list().find(row => row.id === spec.origin.work);
      assert(parent?.state === "REJECTED" && parent.issue.number === spec.issue && parent.attempt === spec.origin.attempt &&
        origin.report.seal === spec.origin.investigation, "GITHUB_FOLLOWUP_ISSUE_BINDING_CHANGED");
    }
    if (spec.source === "evidence") {
      const discovery = await this.runtime.discover(spec);
      if (!discovery?.reproduced || discovery.evidence !== spec.evidence) {
        this.state.update(work, { state: "PAUSED", reason: "EVIDENCE_REPRODUCTION_REQUIRED" });
        return;
      }
    }
    if (this.issues && !spec.issue) {
      this.state.update(work, { state: "PAUSED", reason: "GITHUB_ISSUE_PUBLICATION_APPROVAL_REQUIRED" });
      return;
    }
    const marker = this.#marker(work, "issue");
    const issue = spec.issue ? await this.forge.issue(spec.issue) : await this.#publish(work.id + ":issue",
      () => this.forge.findIssue(marker, this.scope.publisher),
      () => this.forge.createIssue(spec.title, spec.publicBody + "\n\n" + marker));
    assert(Number.isSafeInteger(issue.number) && Number.isSafeInteger(issue.id) &&
      (spec.issue || (this.#authored(issue) && issue.body.includes(marker))), "GITHUB_ISSUE_BINDING_CHANGED");
    assert(!this.state.list().some(other => other.id !== work.id && other.issue?.id === issue.id &&
      !(spec.origin && terminal.has(other.state))), "GITHUB_ISSUE_ALREADY_LINKED");
    const binding = { number: issue.number, id: issue.id, url: issue.html_url };
    assert(!this.issues || this.issues.manages(binding), "GITHUB_ISSUE_NOT_MANAGED");
    this.state.update(work, { state: "READY", issue: binding });
  }

  async #feedback(work) {
    const records = (await this.forge.comments(work.issue.number)).filter(comment => !this.#authored(comment));
    return records.map(comment => ({ id: comment.id, updated: comment.updated_at, author: comment.user?.login ?? null,
      body: String(comment.body ?? "").slice(0, 4000) }));
  }

  async #session(work) {
    const { active, blocked, writer } = this.slot.current();
    const prerequisite = work.spec.after && this.state.list().find(row => row.id === work.spec.after);
    if (work.state === "READY") {
      if (work.spec.after && prerequisite?.state !== "VERIFIED") {
        this.state.update(work, { reason: "WAITING_FOR_PREDECESSOR" });
        return;
      }
      if (blocked || writer) {
        this.state.update(work, { reason: blocked ?? "WAITING_FOR_WRITER" });
        return;
      }
      if (this.state.list().filter(row => row.branch && !terminal.has(row.state)).length >= 2) {
        this.state.update(work, { reason: "WAITING_FOR_BRANCH_SLOT" });
        return;
      }
      if (await this.forge.branchHead() !== active.candidate) {
        this.state.update(work, { reason: "WAITING_FOR_ACTIVE_MAIN" });
        return;
      }
      const comments = await this.#feedback(work);
      const input = await this.runtime.prepareSession({ work, release: active, comments });
      const seal = sealOf({ spec: work.seal, issue: work.issue, input });
      const wake = work.recovery ? "github-rework-" + work.id : "github-" + work.id;
      const { signal } = this.slot.enqueueGitHubSession(wake, seal, {
        release: active, checkpoint: input.checkpoint, requestWindow: githubWindow, work: work.id,
      });
      this.state.update(work, { state: "RUNNING", reason: null, attempt: signal.signalId, releaseAtDispatch: active, input });
      return;
    }
    const job = this.slot.queued().find(row => row.id === work.attempt);
    assert(job?.input.work === work.id, "GITHUB_ATTEMPT_BINDING_CHANGED");
    if (job.status === "PENDING") {
      const request = this.slot.sessionAdmissionRequest(job.id);
      const grant = this.readGrant();
      const source = work.spec.origin;
      const recoveryBinding = source && { case: source.case, investigation: source.investigation, workSeal: work.seal };
      const decision = (!source || sealOf(grant?.recovery ?? null) === sealOf(recoveryBinding))
        ? githubAdmission(grant, request, this.scope, work.id, prerequisite) : null;
      if (!decision) {
        this.state.update(work, { reason: "WAITING_FOR_SESSION_AUTHORIZATION" });
        return;
      }
      const receipt = this.slot.authorizeSession(request, decision);
      this.state.update(work, { admission: receipt.id, reason: null });
      await this.slot.dispatch(job.signal, active, async () => {
        this.#liveAttempt = work.attempt;
        try {
          const result = await this.runtime.execute(work);
          await this.cut("settled", work.id);
          return result;
        } finally { this.#liveAttempt = undefined; }
      });
      return;
    }
    if (job.status === "RUNNING") {
      const settled = await this.runtime.readSettlement(work);
      if (settled?.reconciled) this.slot.recoverGitHubSettlement(job.id, settled);
      else this.state.update(work, { reason: "WAITING_FOR_WRITER_RECONCILIATION" });
      return;
    }
    const settlement = JSON.parse(job.result);
    if (job.status !== "DONE") {
      this.state.update(work, { state: "PAUSED", reason: this.slot.current().blocked ?? "SESSION_STOPPED", settlement });
      return;
    }
    this.state.update(work, { state: "SETTLED", settlement, reason: null });
  }

  async #review(work) {
    const review = await this.runtime.review(work);
    assert(review.basis === work.releaseAtDispatch.candidate && review.archive === work.settlement.archive,
      "GITHUB_REVIEW_WRONG_SESSION");
    if (!review.pass) {
      this.slot.completeWork(work.attempt, { state: "REJECTED", review: sealOf(review) });
      this.state.update(work, { state: "REJECTED", reason: review.reason, review });
      return;
    }
    assert(sha(review.candidate) && review.candidate !== review.basis && review.delivery, "GITHUB_REVIEW_INCOMPLETE");
    this.slot.completeWork(work.attempt, { state: "QUALIFIED", review: sealOf(review) });
    this.state.update(work, { state: "QUALIFIED", branch: "codex/" + this.scope.projectId + "-" + work.id, review });
  }

  async #pull(work) {
    const { review, branch } = work;
    if (await this.forge.branchHead() !== review.basis) {
      this.state.update(work, { state: "PAUSED", reason: "PR_BASIS_MOVED" });
      return;
    }
    const messages = this.runtime.candidateMessages?.(review.basis, review.candidate) ?? "";
    if (hasIssueClosingReference(messages)) {
      this.state.update(work, { state: "PAUSED", reason: "PR_AUTOMATIC_ISSUE_CLOSE" });
      return;
    }
    const seen = await this.forge.branchHead(branch);
    assert(seen === null || seen === review.candidate, "GITHUB_CANDIDATE_BRANCH_ALREADY_OWNED");
    if (seen === null) await this.runtime.push(work);
    assert(await this.forge.branchHead(branch) === review.candidate, "GITHUB_CANDIDATE_PUSH_UNCONFIRMED");
    const marker = this.#marker(work, "pull");
    const body = draftBody(work) + "\n\n" + marker;
    const pull = await this.#publish(work.id + ":pull", () => this.forge.findPull(branch),
      () => this.forge.createPull(branch, work.spec.title, body));
    this.#boundPull(work, pull);
    assert(this.#authored(pull) && pull.body.includes(marker), "GITHUB_PR_PUBLISHER_CHANGED");
    this.state.update(work, { state: "WAITING_FOR_CI", pr: { number: pull.number, id: pull.id, url: pull.html_url } });
  }

  #boundPull(work, pull) {
    assert(pull.base.ref === this.scope.base && pull.base.repo?.id === this.scope.repositoryId &&
      pull.head.ref === work.branch && (!pull.head.repo || pull.head.repo.id === this.scope.repositoryId),
    "GITHUB_PR_WRONG_REPOSITORY");
  }

  async #gate(work) {
    const pull = await this.forge.pull(work.pr.number);
    this.#boundPull(work, pull);
    assert(pull.id === work.pr.id, "GITHUB_PR_BINDING_CHANGED");
    if (pull.head.sha !== work.review.candidate || hasIssueClosingReference(pull.body)) {
      this.state.update(work, { state: "PAUSED", ci: null, ciProgress: null,
        reason: pull.head.sha !== work.review.candidate ? "PR_CANDIDATE_MOVED" : "PR_AUTOMATIC_ISSUE_CLOSE" });
      return;
    }
    if (pull.merged) {
      if (!work.ci || !sha(pull.merge_commit_sha)) {
        this.state.update(work, { state: "PAUSED", reason: "MERGED_BEFORE_EXACT_HEAD_REVIEW" });
        return;
      }
      this.state.update(work, { state: "MERGED", sourceSha: pull.merge_commit_sha, reason: null });
      return;
    }
    if (pull.state === "closed" || pull.base.sha !== work.review.basis) {
      this.state.update(work, { state: "PAUSED", ci: null, ciProgress: null,
        reason: pull.state === "closed" ? "PR_CLOSED" : "PR_BASIS_MOVED" });
      return;
    }
    const progress = await this.forge.checkProgress(pull, work.review.candidate, work.review.basis);
    if (progress.state === "moved") {
      this.state.update(work, { state: "PAUSED", reason: "PR_BASIS_MOVED", ci: null, ciProgress: null });
      return;
    }
    if (progress.state !== "passed") {
      this.state.update(work, { state: "WAITING_FOR_CI", ci: null, ciProgress: progress,
        reason: progress.state === "failed" ? "CI_FAILED" : "WAITING_FOR_EXACT_HEAD_CHECKS" });
      return;
    }
    const ci = progress.receipt;
    this.state.update(work, { state: "WAITING_FOR_OWNER", reason: "OWNER_MERGE_EXACT_SHA", ci, ciProgress: null });
    if (pull.draft) {
      const current = await this.forge.pull(work.pr.number);
      if (!current.merged && current.head.sha === ci.candidate && current.base.sha === ci.basis) await this.forge.ready(current);
    }
  }

  async #activate(work) {
    let prepared;
    try {
      prepared = await this.runtime.prepareRelease(work);
    } catch (error) {
      if (!["GITHUB_ACCEPTED_WORK_READBACK_FAILED", "GITHUB_ACTUAL_SOURCE_FAILED_INDEPENDENT_PROBE",
        "GITHUB_MERGED_TREE_DIFFERS_FROM_REVIEW"].includes(error.message)) throw error;
      this.state.update(work, { state: "PAUSED", reason: error.message });
      return;
    }
    const { release, checkpoint, qualification, readback } = prepared;
    assert(release.candidate === work.sourceSha && readback === true, "GITHUB_RELEASE_READBACK_FAILED");
    const old = work.releaseAtDispatch;
    const approval = { mode: this.scope.mode, predecessor: old, release, qualification };
    const authorization = sealOf({ scope: this.scope, candidate: work.review.candidate, ci: work.ci, release,
      checkpoint, qualification, pr: work.pr, actual: work.sourceSha });
    const id = this.slot.prepare({ predecessor: old, release, qualification, checkpoint, approval, authorization });
    if (id) {
      await this.cut("before-activation", work.id);
      this.slot.activate({ switchId: id, observedRelease: release, checkpoint, readback });
      await this.cut("activated", work.id);
    }
    assert.deepEqual(this.slot.current().active, release, "GITHUB_ACTIVE_RELEASE_CHANGED");
    this.state.update(work, { state: "ACTIVATED", reason: null, release, qualification, authorization });
  }

  async #writeLegacyRetest(work, receipt) {
    const marker = this.#marker(work, "retest");
    const body = "Release `" + work.release.candidate + "` (" + work.release.buildSha256 + ")\n\n" +
      "Independent retest " + (receipt.pass ? "passed" : "failed") + ". Receipt `" + sealOf(receipt) + "`.\n\n" + marker;
    await this.#publish(work.id + ":retest", async () => {
      const matches = (await this.forge.comments(work.issue.number)).filter(comment =>
        this.#authored(comment) && comment.body.includes(marker));
      assert(matches.length <= 1, "GITHUB_RECEIPT_BINDING_AMBIGUOUS");
      if (matches[0]) assert.equal(matches[0].body, body, "GITHUB_PUBLIC_RECEIPT_CHANGED");
      return matches[0] ?? null;
    }, () => this.forge.comment(work.issue.number, body));
    if (receipt.pass) {
      const issue = await this.forge.issue(work.issue.number);
      assert.equal(issue.id, work.issue.id, "GITHUB_ISSUE_BINDING_CHANGED");
      if (issue.state !== "closed") await this.forge.closeIssue(issue.number);
    }
  }

  async #retest(work) {
    const receipt = await this.runtime.retest(work);
    assert(sealOf(receipt.release) === sealOf(work.release) && receipt.evidence === work.spec.evidence, "GITHUB_RETEST_WRONG_RELEASE");
    if (!this.issues?.manages(work.issue)) await this.#writeLegacyRetest(work, receipt);
    if (work.spec.origin) this.failures.close(work.spec.origin.case, {
      work: work.id, submitted: work.review.candidate, accepted: work.release, original: work.spec.origin.archive,
      investigation: work.spec.origin.investigation, pass: receipt.pass, retest: sealOf(receipt),
    });
    this.state.update(work, { state: receipt.pass ? "VERIFIED" : "PAUSED",
      reason: receipt.pass ? null : "ACTIVE_RELEASE_RETEST_FAILED", retest: receipt });
    await this.cut("retest-recorded", work.id);
  }

  async #advanceFailures() {
    if (!this.failures) return;
    const work = this.state.list();
    const cases = this.failures.list();
    for (const item of work) {
      if (!item.attempt || !["REJECTED", "PAUSED"].includes(item.state) ||
          cases.some(record => record.input.attempt === item.attempt)) continue;
      const failure = await this.runtime.failureEvidence(item);
      if (!failure) continue;
      await this.cut("failure-archived", item.id);
      this.failures.intake(failure);
    }
    for (const failure of this.failures.list()) {
      if (failure.disposition) continue;
      const original = work.find(item => item.id === failure.input.work && item.attempt === failure.input.attempt);
      assert(original, "GITHUB_INVESTIGATION_ORIGINAL_WORK_MISSING");
      const receipt = failure.report ?? await this.runtime.investigateFailure(failure, original);
      if (!failure.report) {
        await this.cut("investigation-written", failure.id);
        this.failures.report(failure.id, receipt);
      }
      const parent = cases.find(item => item.id === original.spec.origin?.case);
      const repeated = parent ? repeatedFailure(parent.report, receipt) : [];
      if (this.slot.current().writer) continue;
      await this.runtime.projectFailure?.(failure, original, receipt);
      const followup = repeated.length || this.slot.current().blocked || original.state !== "REJECTED"
        ? null : await this.runtime.followup?.(failure, original, receipt);
      if (followup) {
        assert(followup.origin.case === failure.id && followup.origin.work === original.id &&
          followup.origin.attempt === original.attempt && followup.origin.investigation === receipt.seal &&
          followup.origin.archive === failure.input.archive && followup.issue === original.issue.number,
        "GITHUB_FOLLOWUP_BINDING_CHANGED");
        this.state.register(followup);
        await this.cut("followup-registered", followup.id);
      }
      const blocker = this.slot.current().blocked;
      this.failures.route(failure.id, followup ? { state: "FOLLOWUP_REGISTERED", work: followup.id }
        : repeated.length ? { state: "PAUSED_REPEAT", repeated, previous: parent.id }
          : blocker ? { state: "PAUSED", reason: blocker } : { state: "REVIEW_REQUIRED" });
    }
  }

  async replayDraft(caseId, legacy) {
    const failure = this.failures?.list().find(item => item.id === caseId);
    assert(failure && failure.disposition, "GITHUB_STOPPED_DRAFT_CASE_UNKNOWN");
    const original = this.state.list().find(item => item.id === failure.input.work && item.attempt === failure.input.attempt);
    const job = this.slot.queued().find(item => item.id === failure.input.attempt);
    const slot = this.slot.current();
    assert(original?.state === "PAUSED" && job?.status === "STOPPED" && job.input.work === original.id &&
      !slot.writer && slot.transition?.phase !== "PREPARED" && sealOf(slot.active) === sealOf(failure.input.release),
    "GITHUB_STOPPED_DRAFT_SLOT_CHANGED");
    let draft = this.failures.drafts().find(item => item.failure === caseId);
    if (draft && legacy) assert.deepEqual(legacy, { case: caseId, archive: draft.input.archive, files: draft.input.files },
      "GITHUB_STOPPED_DRAFT_LEGACY_ATTESTATION_CHANGED");
    if (draft?.work) {
      assert.deepEqual(await this.runtime.replayStoppedDraft(failure, original, draft.input), draft.receipt,
        "GITHUB_STOPPED_DRAFT_RECEIPT_CHANGED");
      return draft;
    }
    if (!draft) {
      const binding = await this.runtime.captureStoppedDraft(failure, original, legacy);
      if (!binding) return null;
      await this.cut("draft-sealed", caseId);
      this.failures.queueDraft(caseId, binding);
      draft = { input: binding, receipt: null };
    }
    const receipt = draft.receipt ?? await this.runtime.replayStoppedDraft(failure, original, draft.input);
    if (!draft.receipt) {
      await this.cut("draft-replayed", caseId);
      this.failures.recordDraft(caseId, receipt);
    }
    const origin = { case: caseId, attempt: original.attempt, archive: failure.input.archive, investigation: failure.report.seal,
      draft: sealOf(draft.input), replay: receipt.seal, work: original.id };
    const remaining = receipt.facts.refusal ? [receipt.facts.refusal] : [
      ...(!receipt.facts.frozen?.pass ? ["FROZEN_PROBE"] : []),
      ...(receipt.facts.regression?.pass === false ? ["PUBLIC_REGRESSION"] : []),
      "CANDIDATE_BOUND_DELIVERY",
    ];
    const next = { id: "continue-" + sealOf(origin).slice(0, 24), issue: original.issue.number,
      state: receipt.facts.refusal ? "REVIEW_REQUIRED" : "WAITING_FOR_ADMISSION",
      blocker: failure.input.verdict.reason, release: draft.input.release, origin,
      contract: original.seal, paths: original.spec.paths, remaining };
    await this.runtime.projectDraftHandoff?.(failure, original, next);
    await this.cut("draft-handoff-written", caseId);
    this.failures.handoffDraft(caseId, next);
    return this.failures.drafts().find(item => item.failure === caseId);
  }

  async #advanceDrafts() {
    if (!this.runtime?.captureStoppedDraft) return;
    const { writer, transition, active } = this.slot.current();
    if (writer || transition?.phase === "PREPARED") return;
    const stopped = new Set(this.slot.queued().filter(item => item.status === "STOPPED").map(item => item.id));
    const completed = new Set(this.failures.drafts().filter(item => item.work).map(item => item.failure));
    for (const failure of this.failures.list()) {
      if (failure.disposition && failure.input.verdict.state === "PAUSED" && stopped.has(failure.input.attempt) &&
          sealOf(active) === sealOf(failure.input.release) && !completed.has(failure.id)) await this.replayDraft(failure.id);
    }
  }

  async tick() {
    for (const work of this.state.list()) {
      if (terminal.has(work.state) || (work.retryAt ?? 0) > Date.now()) continue;
      try {
        if (work.state === "REGISTERED") await this.#issue(work);
        else if (workPhases.has(work.state)) await this.#session(work);
        else if (work.state === "SETTLED") await this.#review(work);
        else if (work.state === "QUALIFIED") await this.#pull(work);
        else if (["WAITING_FOR_CI", "WAITING_FOR_OWNER"].includes(work.state)) await this.#gate(work);
        else if (work.state === "MERGED") await this.#activate(work);
        else if (work.state === "ACTIVATED") await this.#retest(work);
        else assert.fail("UNKNOWN_GITHUB_WORK_STATE " + work.state);
      } catch (error) {
        if (!(error instanceof GitHubRetry)) throw error;
        const current = this.state.list().find(row => row.id === work.id);
        this.state.update(current, { reason: error.message, retryAt: Date.now() + error.waitMs });
      }
    }
    await this.#advanceFailures();
    await this.#advanceDrafts();
  }
}
