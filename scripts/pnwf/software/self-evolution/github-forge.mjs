
/** GitHub App transport for an explicitly selected repository. */
import assert from "node:assert/strict";
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

export class GitHubRetry extends Error {
  constructor(message, waitMs = 60_000) {
    super(message);
    this.waitMs = waitMs;
  }
}

export function appToken({ appId, installationId, privateKeyPath, repositoryId }, http = fetch) {
  assert(/^\d+$/u.test(appId) && /^\d+$/u.test(installationId) && Number.isSafeInteger(repositoryId),
    "GITHUB_APP_SCOPE_REQUIRED");
  const key = readFileSync(privateKeyPath);
  let saved;
  return async () => {
    const now = Math.floor(Date.now() / 1000);
    if (saved && Date.parse(saved.expires_at) > (now + 120) * 1000) return saved.token;
    const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
    const payload = encode({ alg: "RS256", typ: "JWT" }) + "." + encode({ iss: appId, iat: now - 60, exp: now + 540 });
    const jwt = payload + "." + createSign("RSA-SHA256").update(payload).sign(key, "base64url");
    const response = await http("https://api.github.com/app/installations/" + installationId + "/access_tokens", {
      method: "POST",
      headers: { authorization: "Bearer " + jwt, accept: "application/vnd.github+json", "content-type": "application/json" },
      body: JSON.stringify({ repository_ids: [repositoryId], permissions: {
        contents: "write", issues: "write", pull_requests: "write", checks: "read", statuses: "read",
      } }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw apiError(response, "App access token");
    saved = await response.json();
    assert(typeof saved.token === "string" && Date.parse(saved.expires_at) > now * 1000, "GITHUB_APP_TOKEN_INVALID");
    return saved.token;
  };
}

function apiError(response, operation) {
  const reason = "GITHUB_" + response.status + " " + operation;
  const retry = Number(response.headers.get("retry-after"));
  const reset = Number(response.headers.get("x-ratelimit-reset"));
  if (response.status === 429 || (response.status === 403 && (retry > 0 || response.headers.get("x-ratelimit-remaining") === "0"))) {
    return Object.assign(new GitHubRetry(reason, Math.max(retry * 1000, reset * 1000 - Date.now(), 60_000)), { definitive: true });
  }
  if (response.status >= 500) return new GitHubRetry(reason);
  return Object.assign(new Error(reason), { definitive: true, status: response.status });
}

export class GitHubForge {
  #cache = new Map();
  #writes = Promise.resolve();

  constructor({ repository, repositoryId, base, attributionAppId, token, http = fetch, origin = "https://api.github.com" }) {
    assert(/^[\w.-]+\/[\w.-]+$/u.test(repository) && Number.isSafeInteger(repositoryId) && repositoryId > 0 &&
      base === "main", "GITHUB_REPOSITORY_SCOPE_REQUIRED");
    this.repository = repository;
    this.repositoryId = repositoryId;
    this.base = base;
    this.attributionAppId = attributionAppId;
    this.token = token;
    this.http = http;
    this.origin = new URL(origin).origin;
    this.root = "/repos/" + repository;
  }

  #request(operation, path, method = "GET", value, options) {
    if (method === "GET") return this.#send(operation, path, method, value, options);
    const next = this.#writes.then(() => this.#send(operation, path, method, value, options));
    this.#writes = next.catch(() => {});
    return next;
  }

  async #send(operation, path, method, value, { cache = true, missing = false } = {}) {
    const url = new URL(path, this.origin);
    assert(url.origin === this.origin, "GITHUB_PAGINATION_OUTSIDE_API");
    const headers = {
      accept: "application/vnd.github+json", authorization: "Bearer " + await this.token(),
      "x-github-api-version": "2022-11-28",
    };
    const existing = method === "GET" && cache ? this.#cache.get(url.href) : undefined;
    if (existing?.etag) headers["if-none-match"] = existing.etag;
    if (value !== undefined) headers["content-type"] = "application/json";
    let response;
    try {
      response = await this.http(url, { method, headers, body: value === undefined ? undefined : JSON.stringify(value),
        signal: AbortSignal.timeout(30_000), redirect: "error" });
    } catch {
      throw new GitHubRetry("GITHUB_TRANSPORT_UNCONFIRMED " + operation);
    }
    if (response.status === 304 && existing) return existing;
    if (response.status === 404 && missing) return { data: null, next: null };
    if (!response.ok) throw apiError(response, operation);
    const data = response.status === 204 ? null : await response.json();
    const next = /<([^>]+)>;\s*rel="next"/u.exec(response.headers.get("link") ?? "")?.[1] ?? null;
    const entry = { data, next, etag: response.headers.get("etag") };
    if (method === "GET" && cache) {
      if (this.#cache.size >= 256) this.#cache.clear();
      this.#cache.set(url.href, entry);
    }
    return entry;
  }

  async #pages(operation, path, items = data => data) {
    const records = [];
    while (path) {
      const result = await this.#request(operation, path);
      records.push(...items(result.data));
      path = result.next;
    }
    return records;
  }

  async repositoryFacts() {
    const { data } = await this.#request("repository", this.root);
    assert(data.id === this.repositoryId && data.full_name.toLowerCase() === this.repository.toLowerCase() &&
      data.default_branch === this.base, "GITHUB_REPOSITORY_MOVED");
    return data;
  }

  async issue(number) {
    const { data } = await this.#request("Issue", this.root + "/issues/" + number);
    assert(!data.pull_request, "GITHUB_EXPECTED_ISSUE");
    return data;
  }

  async findIssue(marker, author) {
    const rows = await this.#pages("find Issue", this.root + "/issues?state=all&per_page=100");
    const matches = rows.filter(row => !row.pull_request && row.user?.login === author && row.body?.includes(marker));
    assert(matches.length <= 1, "GITHUB_ISSUE_BINDING_AMBIGUOUS");
    return matches[0] ?? null;
  }

  async createIssue(title, body) {
    const { data } = await this.#request("create Issue", this.root + "/issues", "POST", { title, body });
    return data;
  }

  comments(number) {
    return this.#pages("Issue comments", this.root + "/issues/" + number + "/comments?per_page=100");
  }

  async comment(number, body) {
    const { data } = await this.#request("publish receipt", this.root + "/issues/" + number + "/comments", "POST", { body });
    return data;
  }

  issueTimeline(number) {
    return this.#pages("Issue timeline", this.root + "/issues/" + number + "/timeline?per_page=100");
  }

  async editIssueComment(id, body) {
    const { data } = await this.#request("update Issue status", this.root + "/issues/comments/" + id, "PATCH", { body });
    return data;
  }

  async ensureLabel({ name, color }) {
    const path = this.root + "/labels";
    if ((await this.#request("maintenance label", path + "/" + encodeURIComponent(name), "GET", undefined, { missing: true })).data) return;
    try {
      await this.#request("create maintenance label", path, "POST", { name, color });
    } catch (error) {
      if (error.status !== 422 ||
        !(await this.#request("maintenance label", path + "/" + encodeURIComponent(name), "GET", undefined, { missing: true })).data) throw error;
    }
  }

  async addIssueLabel(number, name) {
    await this.#request("add maintenance label", this.root + "/issues/" + number + "/labels", "POST", { labels: [name] });
  }

  async removeIssueLabel(number, name) {
    await this.#request("remove maintenance label", this.root + "/issues/" + number + "/labels/" + encodeURIComponent(name),
      "DELETE", undefined, { missing: true });
  }

  async closeIssue(number) {
    const { data } = await this.#request("close Issue", this.root + "/issues/" + number, "PATCH", { state: "closed", state_reason: "completed" });
    return data;
  }

  async findPull(branch) {
    const head = this.repository.split("/")[0] + ":" + branch;
    const query = new URLSearchParams({ head, base: this.base, state: "all", per_page: "100" });
    const rows = await this.#pages("find PR", this.root + "/pulls?" + query.toString());
    const matches = rows.filter(pr => pr.base.ref === this.base && pr.head.ref === branch && pr.head.repo?.id === this.repositoryId);
    assert(matches.length <= 1, "GITHUB_PR_BINDING_AMBIGUOUS");
    return matches[0] ?? null;
  }

  async pull(number) {
    const { data } = await this.#request("PR details", this.root + "/pulls/" + number);
    return data;
  }

  async createPull(branch, title, body) {
    const { data } = await this.#request("create PR", this.root + "/pulls", "POST",
      { head: branch, base: this.base, title, body, draft: true });
    return data;
  }

  async ready(pull) {
    if (!pull.draft) return;
    assert(typeof pull.node_id === "string", "GITHUB_PR_NODE_REQUIRED");
    const { data } = await this.#request("mark PR ready", "/graphql", "POST", {
      query: "mutation($id: ID!) { markPullRequestReadyForReview(input: {pullRequestId: $id}) { pullRequest { isDraft } } }",
      variables: { id: pull.node_id },
    });
    assert(data.data?.markPullRequestReadyForReview?.pullRequest?.isDraft === false, "GITHUB_PR_STILL_DRAFT");
  }

  async branchHead(branch = this.base) {
    const { data } = await this.#request("Git branch tip", this.root + "/git/ref/heads/" +
      branch.split("/").map(encodeURIComponent).join("/"), "GET", undefined, { cache: false, missing: true });
    return data?.object.sha ?? null;
  }

  async checks(pull, approvedHead, expectedBase) {
    const result = await this.checkProgress(pull, approvedHead, expectedBase);
    return result.state === "passed" ? result.receipt : null;
  }

  async checkProgress(pull, approvedHead, expectedBase) {
    if (pull.head.sha !== approvedHead || pull.base.sha !== expectedBase || await this.branchHead() !== expectedBase) {
      return { state: "moved" };
    }
    if (pull.mergeable === false) return { state: "failed", failures: [{ name: "Merge conflict" }] };
    if (pull.mergeable !== true || !pull.merge_commit_sha) return { state: "pending" };

    const readChecks = async (sha) => {
      const checks = await this.#pages("PR check runs", this.root + "/commits/" + sha + "/check-runs?per_page=100",
        data => data.check_runs);
      return checks.filter(check => check.head_sha === sha && check.app?.id === this.attributionAppId);
    };
    const [onHead, onTestCommit, statuses] = await Promise.all([
      readChecks(approvedHead),
      readChecks(pull.merge_commit_sha),
      this.#pages("PR head statuses", this.root + "/commits/" + approvedHead + "/statuses?per_page=100"),
    ]);
    // Actions can report PR jobs on the head even when the job checks out the
    // test merge commit. Prefer the test commit when both report the same job.
    const checks = [...new Map([...onHead, ...onTestCommit].map(check => [check.name, check])).values()];
    const { data: attribution } = await this.#request("required attribution source", this.root + "/rules/branches/" + this.base);
    const required = attribution.filter(rule => rule.type === "required_status_checks")
      .flatMap(rule => rule.parameters.required_status_checks);
    // Branch rules enforce the expected source when the owner publishes. Reading a
    // status alone cannot identify its GitHub App, so also bind the active rule.
    assert(required.some(check => check.context === "commit-attribution" && check.integration_id === this.attributionAppId),
      "GITHUB_ATTRIBUTION_RULE_CHANGED");
    const gate = statuses.find(status => status.context === "commit-attribution");
    const trustedGate = gate?.creator?.login === "github-actions[bot]";
    const jobs = ["unit", "e2e"].map(name => checks.find(check => check.name === name));
    const failures = checks.filter(check => check.status === "completed" &&
      !(jobs.includes(check) ? ["success"] : ["success", "neutral", "skipped"]).includes(check.conclusion));
    if (trustedGate && ["failure", "error"].includes(gate.state)) failures.push({ name: "commit-attribution", html_url: gate.target_url });
    if (failures.length) return { state: "failed", failures: failures.map(check => ({
      name: /^[a-zA-Z0-9 _/-]{1,100}$/u.test(check.name) ? check.name : "Actions check",
      ...(check.html_url?.startsWith("https://github.com/" + this.repository + "/") && !/[\s<>()\\]/u.test(check.html_url) ?
        { url: check.html_url } : {}),
    })) };
    if (!trustedGate || gate.state !== "success" || jobs.some(check => check?.conclusion !== "success") ||
      checks.some(check => check.status !== "completed")) return { state: "pending" };
    return { state: "passed", receipt: { basis: expectedBase, candidate: approvedHead, tested: pull.merge_commit_sha,
      attribution: gate.id, checks: checks.map(check => check.id),
      checkShas: [...new Set(checks.map(check => check.head_sha))] } };
  }
}
