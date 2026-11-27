
/** Advance the test, maintenance and supervision roles against one native maintenance slot. */
import assert from "node:assert/strict";
import { sha } from "../../energy/contract.mjs";
import { GitHubRetry } from "./github-forge.mjs";
import { MaintenanceFailures, repeatedFailure } from "./failure-investigation.mjs";
import { GitHubMaintenanceState, publishOnce } from "./github-maintenance-state.mjs";
import { GitHubIssueDiscipline } from "./github-issue-discipline.mjs";
import { sealOf } from "./slot.mjs";
import { windowWithin } from "./standing-admission.mjs";

export const githubWindow = Object.freeze({
  maxRequests: 256, wallClockMs: 60 * 60_000, requestTimeoutMs: 240_000, billingCeiling: null,
});
const terminal = new Set(["VERIFIED", "REJECTED", "RETURNED", "PAUSED"]);
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

function ownerDecision(workId, grantSeal) {
  return { actor: "trusted-github-pilot", reason: "Authorized maintenance work " + workId + " under " + grantSeal };
}

function returnDecision(budget) {
  return { actor: "trusted-github-pilot", reason: "Continued maintenance work " + budget.root +
    " under " + budget.grant + " with " + sealOf(budget) };
}

function grantStillActive(grant, budget) {
  return grant && !grant.revoked && Date.parse(grant.expiresAt) > Date.now() && sealOf(grant) === budget.grant;
}

function previouslyAdmitted(grant, workId) {
  const carry = grant?.carry;
  if (carry?.work !== workId) return 0;
  return Number.isSafeInteger(carry.requests) && carry.requests > 0 &&
    carry.requests <= githubWindow.maxRequests && /^[a-f0-9]{64}$/u.test(carry.receipt) ? carry.requests : null;
}

export function githubAdmission(grant, request, scope, workId, predecessor, at = Date.now()) {
  const window = request.requestWindow;
  const carried = previouslyAdmitted(grant, workId);
  if (!grant || grant.revoked || grant.repositoryId !== scope.repositoryId || grant.project !== request.project ||
    grant.mode !== request.mode || Date.parse(grant.expiresAt) <= at || !Number.isFinite(Date.parse(grant.expiresAt)) ||
    !Array.isArray(grant.work) || grant.work.length > 2 || !grant.work.includes(workId) ||
    !windowWithin(window, grant.window) || carried === null ||
    carried > 0 && (window.maxRequests + carried > githubWindow.maxRequests || window.maxRequests + carried > grant.window.maxRequests) ||
    !sha(grant.initial)) return null;
  const index = grant.work.indexOf(workId);
  if (index === 0 ? request.release.candidate !== grant.initial :
    !(predecessor?.id === grant.work[index - 1] && predecessor.state === "VERIFIED" &&
      sealOf(predecessor.release) === sealOf(request.release))) return null;
  return ownerDecision(workId, sealOf(grant));
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

  #repeatResume(caseId) {
    const row = this.slot.db.prepare("SELECT detail FROM events WHERE type='GITHUB_REPEAT_RESUMED' AND json_extract(detail, '$.case')=?").get(caseId);
    return row && JSON.parse(row.detail);
  }

  #routedFollowup(failure, work) {
    if (failure?.disposition?.work === work.id) return true;
    const resume = failure?.disposition?.state === "PAUSED_REPEAT" && this.#repeatResume(failure.id);
    return resume && resume.work === work.id && resume.contract === work.seal;
  }

  async #issue(work) {
    const { spec } = work;
    if (spec.origin) {
      const origin = this.failures.list().find(row => row.id === spec.origin.case);
      if (!this.#routedFollowup(origin, work)) return;
      const parent = this.state.list().find(row => row.id === spec.origin.work);
      assert((parent?.state === "REJECTED" || (parent?.state === "RETURNED" && parent.reviewReturn.route === "REVISE_CANDIDATE")) &&
        parent.issue.number === spec.issue && parent.attempt === spec.origin.attempt &&
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
    if (this.issues && (issue.state !== "open" || !this.issues.permitsWork(binding, work))) {
      this.state.update(work, { state: "PAUSED", reason: "GITHUB_ISSUE_WORK_NOT_AUTHORIZED" });
      return;
    }
    this.state.update(work, { state: "READY", issue: binding });
  }

  async #feedback(work) {
    const records = (await this.forge.comments(work.issue.number)).filter(comment => !this.#authored(comment));
    return records.map(comment => ({ id: comment.id, updated: comment.updated_at, author: comment.user?.login ?? null,
      body: String(comment.body ?? "").slice(0, 4000) }));
  }

  #returnedBudget(work, active) {
    const origin = work.spec.origin;
    const parent = this.state.list().find(item => item.id === origin.work);
    const failure = this.failures.list().find(item => item.id === origin.case);
    const job = this.slot.queued().find(item => item.id === origin.attempt);
    const admission = this.slot.sessionAdmission(origin.attempt);
    const budget = parent?.requestBudget, review = parent?.reviewReturn, settled = parent?.settlement;
    const accounting = failure?.report?.facts.accounting;
    assert(parent?.state === "RETURNED" && review?.route === "REVISE_CANDIDATE" &&
      review.id === origin.returnReceipt && review.candidate === origin.candidate &&
      review.review === sealOf(parent.review) && review.workSeal === parent.seal &&
      review.attempt === origin.attempt && review.archive === origin.archive &&
      review.basis === active.candidate && sealOf(parent.releaseAtDispatch) === sealOf(active) &&
      parent.issue.id === work.issue.id && this.#routedFollowup(failure, work) &&
      failure.input.target.candidate === review.candidate && failure.report?.seal === origin.investigation &&
      sealOf(failure.report.facts) === origin.investigation,
    "GITHUB_RETURN_BASIS_OR_RECEIPT_CHANGED");
    assert(Array.isArray(parent.spec.paths) && Array.isArray(work.spec.paths) &&
      work.spec.paths.every(path => parent.spec.paths.includes(path)) &&
      ["artifacts", "pathRules", "publicTests", "probe"].every(key =>
        sealOf(parent.spec[key] ?? null) === sealOf(work.spec[key] ?? null)),
    "GITHUB_RETURN_SCOPE_CHANGED");
    assert(budget && job?.status === "DONE" && job.input.work === parent.id && admission?.consumed &&
      admission.receipt.id === parent.admission && admission.receipt.id === sealOf(admission.receipt.decision) &&
      admission.receipt.decision.reason === (budget.returnReceipt
        ? returnDecision(budget) : ownerDecision(parent.id, budget.grant)).reason &&
      admission.receipt.decision.actor === "trusted-github-pilot" &&
      sealOf(job.input.release) === sealOf(active) &&
      sealOf(admission.receipt.decision.request.release) === sealOf(active) &&
      sealOf(admission.receipt.decision.request.requestWindow) === sealOf(job.input.requestWindow) &&
      sealOf(JSON.parse(job.result)) === sealOf(settled) && settled.archive === origin.archive &&
      settled.reconciled && settled.usageState === "SETTLED" && settled.attributionState === "COMPLETE" &&
      settled.unresolved === 0 && Number.isSafeInteger(settled.requests) && settled.requests > 0 &&
      accounting?.usage === "SETTLED" && accounting.attribution === "COMPLETE" && accounting.requests === settled.requests &&
      budget.limit - budget.usedBefore === job.input.requestWindow.maxRequests &&
      settled.requests <= job.input.requestWindow.maxRequests, "GITHUB_RETURN_ACCOUNTING_UNCONFIRMED");
    return { ...budget, usedBefore: budget.usedBefore + settled.requests,
      parentAdmission: admission.receipt.id, returnReceipt: review.id };
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
      let requestWindow = githubWindow;
      let requestBudget;
      if (work.spec.origin?.returnReceipt) {
        try {
          requestBudget = this.#returnedBudget(work, active);
        } catch (error) {
          if (error.code !== "ERR_ASSERTION") throw error;
          this.state.update(work, { state: "PAUSED", reason: error.message });
          return;
        }
        const maxRequests = requestBudget.limit - requestBudget.usedBefore;
        if (maxRequests === 0) {
          this.state.update(work, { state: "PAUSED", reason: "GITHUB_WORK_REQUEST_LIMIT", requestBudget });
          return;
        }
        requestWindow = { ...githubWindow, maxRequests };
      } else if (!work.spec.origin && !work.recovery) {
        const grant = this.readGrant?.();
        const carried = previouslyAdmitted(grant, work.id);
        if (carried === null || carried >= githubWindow.maxRequests) {
          this.state.update(work, { state: "PAUSED", reason: carried === null ? "GITHUB_CARRIED_ADMISSION_INVALID" : "GITHUB_WORK_REQUEST_LIMIT" });
          return;
        }
        if (carried > 0) {
          requestWindow = { ...githubWindow, maxRequests: githubWindow.maxRequests - carried };
          requestBudget = { root: work.id, grant: sealOf(grant), limit: githubWindow.maxRequests, usedBefore: carried };
        }
      }
      const comments = await this.#feedback(work);
      const input = await this.runtime.prepareSession({ work, release: active, comments });
      const seal = sealOf({ spec: work.seal, issue: work.issue, input });
      const wake = work.recovery ? "github-rework-" + work.id : "github-" + work.id;
      const { signal } = this.slot.enqueueGitHubSession(wake, seal, {
        release: active, checkpoint: input.checkpoint, requestWindow, work: work.id,
      });
      this.state.update(work, { state: "RUNNING", reason: null, attempt: signal.signalId, releaseAtDispatch: active, input,
        ...(requestBudget ? { requestBudget } : {}) });
      return;
    }
    const job = this.slot.queued().find(row => row.id === work.attempt);
    assert(job?.input.work === work.id, "GITHUB_ATTEMPT_BINDING_CHANGED");
    if (job.status === "PENDING") {
      const source = work.spec.origin;
      if (source?.returnReceipt && sealOf(job.input.release) !== sealOf(active)) {
        this.state.update(work, { state: "PAUSED", reason: "GITHUB_RETURN_BASIS_OR_RECEIPT_CHANGED" });
        return;
      }
      if (blocked || writer) {
        this.state.update(work, { reason: blocked ?? "WAITING_FOR_WRITER" });
        return;
      }
      const request = this.slot.sessionAdmissionRequest(job.id);
      const grant = this.readGrant();
      const recoveryBinding = source && { case: source.case, investigation: source.investigation, workSeal: work.seal };
      let requestBudget = work.requestBudget;
      let decision;
      if (source?.returnReceipt) {
        const budget = this.#returnedBudget(work, active);
        assert.deepEqual(requestBudget, budget, "GITHUB_RETURN_BUDGET_CHANGED");
        assert.deepEqual(request.requestWindow, { ...githubWindow, maxRequests: budget.limit - budget.usedBefore },
          "GITHUB_RETURN_WINDOW_CHANGED");
        if (grantStillActive(grant, budget)) {
          decision = returnDecision(budget);
        }
      } else if (!source || sealOf(grant?.recovery ?? null) === sealOf(recoveryBinding)) {
        decision = githubAdmission(grant, request, this.scope, work.id, prerequisite);
        if (decision && !source && !work.recovery) {
          const carried = previouslyAdmitted(grant, work.id);
          const budget = { root: work.id, grant: sealOf(grant), limit: request.requestWindow.maxRequests + carried, usedBefore: carried };
          if (carried > 0 || requestBudget) {
            if (sealOf(requestBudget ?? null) !== sealOf(budget)) decision = null;
          }
          if (decision) requestBudget = budget;
        }
      }
      if (!decision) {
        this.state.update(work, { reason: "WAITING_FOR_SESSION_AUTHORIZATION" });
        return;
      }
      if (this.issues || source?.returnReceipt) {
        const issue = await this.forge.issue(work.issue.number);
        if (issue.id !== work.issue.id || issue.state !== "open" || (this.issues && !this.issues.permitsWork(work.issue, work))) {
          this.state.update(work, { state: "PAUSED", reason: "GITHUB_ISSUE_WORK_NOT_AUTHORIZED" });
          return;
        }
        if (await this.forge.branchHead() !== active.candidate) {
          this.state.update(work, { state: "PAUSED", reason: "WAITING_FOR_ACTIVE_MAIN" });
          return;
        }
      }
      if (source?.returnReceipt && !grantStillActive(this.readGrant(), requestBudget)) {
        this.state.update(work, { reason: "WAITING_FOR_SESSION_AUTHORIZATION" });
        return;
      }
      const receipt = this.slot.authorizeSession(request, decision);
      this.state.update(work, { admission: receipt.id, reason: null, ...(requestBudget ? { requestBudget } : {}) });
      if (source?.returnReceipt) await this.cut("return-authorized", work.id);
      await this.slot.dispatch(job.signal, active, async () => {
        this.#liveAttempt = work.attempt;
        try {
          const result = await this.runtime.execute({ ...work, requestBudget }, request.requestWindow);
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
      if (!sha(review.candidate) || review.candidate === review.basis || !review.delivery ||
          ["GITHUB_CANDIDATE_WRITE_SCOPE_CHANGED", "GITHUB_CANDIDATE_ATTRIBUTION_REJECTED"].includes(review.reason)) {
        this.state.update(work, { state: "REJECTED", reason: review.reason, review });
        return;
      }
      this.#returnReview(work, review);
      return;
    }
    assert(sha(review.candidate) && review.candidate !== review.basis && review.delivery, "GITHUB_REVIEW_INCOMPLETE");
    this.slot.completeWork(work.attempt, { state: "QUALIFIED", review: sealOf(review) });
    this.state.update(work, { state: "QUALIFIED", branch: "codex/" + this.scope.projectId + "-" + work.id, review });
  }

  #returnReview(work, review, rechecks = work.rechecks ?? []) {
    const missing = review.regression?.missingInputs ?? [];
    const route = review.old && (review.old.pass || review.old.exit !== 1) ? "REVIEW_VALIDATION_CONTRACT"
      : missing.length ? "RETEST_SAME_CANDIDATE" : "REVISE_CANDIDATE";
    const details = { work: work.id, attempt: work.attempt, workSeal: work.seal,
      basis: review.basis, candidate: review.candidate, archive: review.archive, review: sealOf(review),
      route, reason: review.reason, missing };
    this.state.update(work, { state: "RETURNED", reason: review.reason, review,
      reviewReturn: { ...details, id: sealOf(details) }, originalReview: work.originalReview ?? review, rechecks });
  }

  async resumeRepeatedReturn(receipt) {
    const { facts, seal } = receipt;
    const failure = this.failures.list().find(item => item.id === facts.case);
    const work = this.state.list().find(item => item.id === failure?.input.work);
    const returned = work?.reviewReturn, probe = work?.review?.next;
    assert(seal === sealOf(facts) && facts.paidRequests === 0 &&
      failure?.disposition?.state === "PAUSED_REPEAT" && failure.disposition.repeated.includes("FROZEN_PROBE") &&
      work?.state === "RETURNED" && returned?.route === "REVISE_CANDIDATE" && returned.id === facts.returnReceipt &&
      returned.basis === facts.basis && returned.candidate === facts.candidate && returned.archive === facts.archive &&
      failure.input.attempt === work.attempt && failure.input.target.candidate === facts.candidate &&
      probe?.probe === facts.probe && probe.pass === false && sealOf(probe.counts) === sealOf(facts.counts) &&
      /^[a-f0-9]{64}$/u.test(facts.recheck) && Array.isArray(facts.failures) &&
      facts.failures.length > 0 && facts.failures.length === probe.counts.failed &&
      new Set(facts.failures.map(item => item.id)).size === facts.failures.length &&
      facts.failures.every(item => [item.id, item.expected, item.observed].every(value => typeof value === "string" && value.trim())),
    "GITHUB_REPEAT_DIAGNOSTICS_UNBOUND");
    const existing = this.#repeatResume(facts.case);
    if (existing) assert.equal(existing.receipt, seal, "GITHUB_REPEAT_DIAGNOSTICS_CHANGED");
    if (existing && this.state.list().some(item => item.id === existing.work && item.seal === existing.contract)) return existing.work;
    const { active, blocked, writer } = this.slot.current();
    const budget = work.requestBudget;
    assert(!blocked && !writer && sealOf(active) === sealOf(work.releaseAtDispatch) &&
      budget && grantStillActive(this.readGrant(), budget) &&
      budget.limit - budget.usedBefore > work.settlement.requests, "GITHUB_REPEAT_RESUME_UNAVAILABLE");
    const followup = await this.runtime.followup(failure, work, failure.report, receipt);
    assert(followup?.origin.case === facts.case && followup.origin.work === work.id &&
      followup.origin.candidate === facts.candidate && followup.origin.returnReceipt === returned.id,
    "GITHUB_REPEAT_FOLLOWUP_UNBOUND");
    const decision = { case: facts.case, work: followup.id, contract: sealOf(followup), receipt: seal };
    this.slot.transaction(() => {
      const prior = this.#repeatResume(facts.case);
      if (prior) assert.deepEqual(prior, decision, "GITHUB_REPEAT_RESUME_CHANGED");
      else this.slot.record("GITHUB_REPEAT_RESUMED", decision);
    });
    this.state.register(followup);
    return followup.id;
  }

  async retestReturned({ work: id, receipt, candidate, archiveRoots }) {
    const work = this.state.list().find(item => item.id === id);
    assert(work && Array.isArray(archiveRoots) && archiveRoots.every(path => typeof path === "string"),
      "GITHUB_RETEST_REQUEST_REQUIRED");
    const request = { receipt, candidate, archiveRoots: [...new Set(archiveRoots)].sort() };
    const requestId = sealOf(request);
    const previous = work.rechecks?.find(item => item.id === requestId);
    if (previous) return previous;
    const returned = work.reviewReturn;
    assert(work.state === "RETURNED" && returned?.route === "RETEST_SAME_CANDIDATE" &&
      returned.id === receipt && returned.candidate === candidate && returned.review === sealOf(work.review) &&
      returned.workSeal === work.seal && returned.attempt === work.attempt && returned.archive === work.settlement?.archive &&
      work.settlement.reconciled && work.settlement.usageState === "SETTLED" && work.settlement.unresolved === 0 && !work.pr,
    "GITHUB_RETEST_RETURN_BINDING_CHANGED");
    const { writer, blocked, active, transition } = this.slot.current();
    assert(!writer && !blocked && transition?.phase !== "PREPARED" &&
      sealOf(active) === sealOf(work.releaseAtDispatch), "GITHUB_RETEST_SLOT_NOT_QUIESCENT");
    const review = await this.runtime.review(work, { id: requestId, ...request });
    assert(review.basis === returned.basis && review.archive === returned.archive && review.candidate === candidate &&
      review.delivery === work.originalReview.delivery, "GITHUB_RETEST_WRONG_CANDIDATE");
    const record = { id: requestId, request, review, paidRequests: 0 };
    const rechecks = [...(work.rechecks ?? []), record];
    if (review.pass) {
      this.state.update(work, { state: "QUALIFIED", reason: null, review, rechecks,
        branch: "codex/" + this.scope.projectId + "-" + work.id });
    } else {
      this.#returnReview(work, review, rechecks);
    }
    return record;
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
    const work = this.state.list().map(item => item.state === "RETURNED" && item.reviewReturn.route === "REVISE_CANDIDATE"
      ? { ...item, state: "REJECTED" } : item);
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
