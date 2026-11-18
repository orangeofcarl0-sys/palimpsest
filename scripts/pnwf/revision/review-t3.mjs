/** Qualify, then run one ordinary DSH review from the accepted gRPC revision. */
import { deepStrictEqual } from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { analyzeAttributedStage } from "../analyze_energy_trajectory.mjs";
import { PAID_COHORT_SCHEMA, PAID_MODE, readDeepSeekKey } from "../bounded_provider.mjs";
import { runContainerSession } from "../container_adapter.mjs";
import { docker } from "../container_runtime.mjs";
import { ExecutionBudget, USAGE_ONLY_SCHEMA } from "../execution_budget.mjs";
import { OPENCODE_GO_MESSAGES, OPENCODE_GO_MODEL, readOpenCodeGoKey, requireOpenCodeGoProbe } from "../opencode_go.mjs";
import { assert, changed, clean, descendant, digest, git, head, readJson, writeJson } from "../energy/contract.mjs";
import { attribute } from "../energy/evidence.mjs";
import { GUIDED_T3_PROMPT, REVIEW } from "../software/contract.mjs";
import { qualificationReply } from "../software/mock.mjs";
import { REVIEW_SCORE_SCHEMA, scoreSemanticReview } from "../software/review-score.mjs";
import { artifactReceipts, bindSoftwareRun, isolated, owner, paths, prepare, stageSoftwareRuntime, traceSummary } from "../software/run.mjs";
import { scoreReview } from "../software/score.mjs";
import { startMockProvider } from "../mock_provider.mjs";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const release = "a0daba3c4f43f91fe5ab92b1a0bad94c5d2dfee1";
const basis = "4639ae44d78e7c1f9f5269876fa333a99bff770f";
const archive = join(repo, "research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-214618");
const previous = join(repo, "research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-t3-224632");
const { values } = parseArgs({ options: {
  mode: { type: "string" }, run: { type: "string" }, accepted: { type: "string" }, qualification: { type: "string" },
  "opencode-go-probe": { type: "string" },
} });
const paid = values.mode === "live";
assert(values.run && values.accepted && (paid ? values.qualification : values.mode === "mock"),
  "Usage: node review-t3.mjs --mode=mock|live --run=<new directory> --accepted=<accepted T2 run> [--qualification=<Mock result.json>] [--opencode-go-probe=<settled probe.json>]");
assert(descendant(repo, release, head(repo)) && git(repo, "diff", "--name-only", release, "--", "src", "host", "package.json", "pnpm-lock.yaml") === "",
  "PRODUCT_RELEASE_DRIFT");
const root = resolve(values.run);
const source = resolve(values.accepted);
const sourceStage = join(source, "accepted-stage");
const sourceWorld = join(sourceStage, "world");
const t2 = readJson(join(archive, "result.json"));
const candidate = readJson(join(archive, "candidate.json"));
const accepted = readJson(join(archive, "acceptance.json"));
const frozen = readJson(join(archive, "contract.json"));
const previousContract = readJson(join(previous, "contract.json"));
const shaFile = path => digest(readFileSync(path));
const openCodeProbePath = values["opencode-go-probe"];
const openCodeGoProfile = openCodeProbePath ? requireOpenCodeGoProbe(readJson(openCodeProbePath)) : undefined;
const openCodeBase = "fdda682e1fd03071a3c4770f511d248df027a689";
if (openCodeGoProfile) assert(descendant(repo, openCodeBase, head(repo)), "OPENCODE_T3_MAIN_BASE_DRIFT");
for (const file of ["acceptance.json", "candidate.json", "result.json"]) {
  assert(shaFile(join(source, file)) === shaFile(join(archive, file)), "APPROVED_T2_ARCHIVE_DRIFT " + file);
}
assert(t2.passed && t2.usageKnown && t2.accounting.unresolved === 0 && accepted.approved === candidate.commit &&
  accepted.receiptId === candidate.receiptId && accepted.resultingHeadCommit === basis && accepted.tree === candidate.tree &&
  accepted.committed.event_type === "PROMOTION_COMMITTED" && accepted.committed.payload.source_commit === candidate.commit &&
  accepted.committed.payload.resulting_head_commit === basis && head(sourceWorld) === basis && clean(sourceWorld) &&
  git(sourceWorld, "rev-parse", "HEAD^{tree}") === accepted.tree && !existsSync(join(sourceWorld, "acceptance.json")), "T3_ACCEPTANCE_MISMATCH");
const legacyScorerSha256 = shaFile(join(repo, "scripts/pnwf/software/score.mjs"));
assert(legacyScorerSha256 === previousContract.scorerSha256 && previousContract.basis === basis, "FROZEN_T3_SCORER_OR_BASIS_DRIFT");
deepStrictEqual(frozen.window, previousContract.window);
const { image, window } = frozen;
assert(docker(["image", "inspect", image, "--format", "{{.Id}}"]) === image && image === previousContract.image, "T3_IMAGE_DRIFT");
const seal = { release, basis, tree: accepted.tree, model: openCodeGoProfile ? OPENCODE_GO_MODEL : frozen.model, dsh: frozen.dsh, image, window,
  ...(openCodeGoProfile ? { mainBase: openCodeBase, provider: "opencode-go", route: OPENCODE_GO_MESSAGES,
    providerProbeSha256: shaFile(openCodeProbePath) } : {}),
  promptSha256: digest(GUIDED_T3_PROMPT), scoreSchema: REVIEW_SCORE_SCHEMA, legacyScorerSha256,
  files: Object.fromEntries(["revision/review-t3.mjs", "software/contract.mjs", "software/review-score.mjs", "software/mock.mjs",
    "software/run.mjs", "software/product-entry.mjs", "container_adapter.mjs", "container_runtime.mjs", "bounded_provider.mjs",
    "execution_budget.mjs", "opencode_go.mjs", "analyze_energy_trajectory.mjs"].map(file => [file, shaFile(join(repo, "scripts/pnwf", file))])),
  originalAcceptanceSha256: shaFile(join(archive, "acceptance.json")), previousResultSha256: shaFile(join(previous, "result.json")) };
if (paid) {
  const qualification = readJson(resolve(values.qualification));
  assert(qualification.mode === "mock" && qualification.passed && qualification.usageKnown && qualification.execution.paidModelCalls === 0 &&
    qualification.accounting.requests > 0 && qualification.accounting.unresolved === 0 && qualification.semanticScore?.passed,
  "T3_MOCK_NOT_QUALIFIED");
  deepStrictEqual(qualification.seal, seal);
  if (openCodeGoProfile) readOpenCodeGoKey(openCodeGoProfile);
  else readDeepSeekKey();
}

mkdirSync(root);
const { runtime } = bindSoftwareRun(root, image);
stageSoftwareRuntime(repo, runtime);
const p = paths("P", "T3");
prepare(p, { world: sourceWorld, state: join(sourceStage, "state") });
const before = owner(p, "facts");
assert(before.head === basis && head(p.world) === basis && clean(p.world) &&
  before.events.some(event => event.type === "PROMOTION_COMMITTED" && event.entityId === accepted.promotionId) &&
  before.attempts.some(attempt => attempt.id === accepted.attemptId && attempt.state === "COMPLETED" &&
    attempt.report?.result_commit === candidate.commit && attempt.report?.revision_receipt?.receiptId === accepted.receiptId) &&
  !before.attempts.some(attempt => attempt.state === "RUNNING"), "T3_ACCEPTED_PRODUCT_STATE_MISMATCH");
const acceptance = { kind: "GOVERNED_PROMOTION", approvedCandidate: candidate.commit, approvedHead: basis, basis: accepted.basis,
  tree: accepted.tree, promotion: accepted };
const acceptancePath = join(p.run, "acceptance.json");
writeJson(acceptancePath, acceptance);
writeFileSync(join(p.world, "acceptance.json"), "", { flag: "wx" });
const mode = paid ? PAID_MODE : "mock";
const contract = { ...seal, session: "T3", implementationHead: head(repo), mode, acceptanceMountSha256: shaFile(acceptancePath),
  ...(paid ? { qualificationSha256: shaFile(resolve(values.qualification)) } : {}) };
writeJson(join(p.run, "contract.json"), contract);
const promptPath = join(p.run, "prompt.txt");
writeFileSync(promptPath, GUIDED_T3_PROMPT);
const cohortId = "software-t3-review-" + randomUUID();
const ceiling = paid ? null : 12000000;
if (paid) writeJson(join(p.run, "cohort.json"), { schema: PAID_COHORT_SCHEMA, cohortId, stages: [{ id: "T3" }], ...window });
writeJson(join(p.run, "core.json"), { cohortId, budget: ceiling, sessions: [{ id: "T3", condition: "P", world: p.world, state: p.state,
  expectedHead: basis, killAfterMs: window.wallClockMs, deployment: p.profile, promptPath }] });
const budgetPath = join(p.run, "request-ledger.sqlite");
const ledger = ExecutionBudget.initialize(budgetPath, { schema: paid ? USAGE_ONLY_SCHEMA : "pnwf-request-budget/v1", cohortId, aggregateCeiling: ceiling,
  sessions: [{ id: "T3", ceiling, softCeiling: ceiling, maxRequests: window.maxRequests }] });
const result = { mode, seal, basis, cohortId, acceptance, passed: false, usageKnown: false, semanticScore: null,
  legacyCrossScore: null, checks: { accepted: true } };
let mock;
try {
  if (!paid) mock = await startMockProvider({ reply: qualificationReply({ arm: "P", session: "T3", basis }) });
  writeFileSync(join(p.run, "started.json"), JSON.stringify({ cohortId, basis, at: new Date().toISOString() }) + "\n", { flag: "wx" });
  ledger.startSession("T3");
  console.log("REVIEW_T3_STARTED", mode, basis);
  result.execution = await runContainerSession({ run: p.run, sessionId: "T3", budgetPath, mode, provider: mock?.config,
    repository: runtime, image, experiment: { layout: "product", acceptance: acceptancePath,
      openCodeGoProfile: paid ? openCodeGoProfile : undefined } });
  result.checks.naturalExit = result.execution.natural;
  const current = head(p.world);
  const facts = owner(p, "facts");
  result.current = current;
  result.changedPaths = changed(p.world, basis, current);
  result.checks.persisted = current !== basis && git(p.world, "rev-parse", current + "^") === basis && clean(p.world);
  result.checks.artifactsPresent = /^100644 blob /u.test(git(p.world, "ls-tree", current, "--", REVIEW));
  result.checks.onlyReview = result.changedPaths.length === 1 && result.changedPaths[0] === REVIEW;
  result.checks.noNewWork = facts.attempts.length === before.attempts.length && facts.promotions.length === before.promotions.length;
  result.conclusion = facts.conclusion?.seq > (before.conclusion?.seq ?? 0) ? facts.conclusion.intent : null;
  if (result.checks.artifactsPresent) {
    const bytes = execFileSync("git", ["-C", p.world, "cat-file", "blob", current + ":" + REVIEW]);
    writeFileSync(join(p.run, REVIEW), bytes);
    result.review = { commit: current, blob: git(p.world, "rev-parse", current + ":" + REVIEW), sha256: digest(bytes) };
  }
  try { result.semanticScore = scoreSemanticReview({ repo: p.world, basis, commit: current }); }
  catch (error) { result.semanticScore = { passed: false, reason: error.message }; }
  try { result.legacyCrossScore = { passed: true, score: scoreReview({ repo: p.world, basis, commit: current }) }; }
  catch (error) { result.legacyCrossScore = { passed: false, reason: error.message }; }
  if (result.conclusion === "DELIVER") {
    try { result.deliveryReceipt = artifactReceipts(p.world, facts, current, [REVIEW], basis); }
    catch (error) { result.deliveryReceiptFailure = error.message; }
  }
  try {
    result.evidence = attribute(p.run, "T3", mode);
    result.usageKnown = result.evidence.usageQualified;
    result.trajectory = traceSummary(p, result.evidence);
    if (paid && result.usageKnown) result.responseAttribution = analyzeAttributedStage(p.run, "T3", { context: true, result });
    result.isolation = isolated(readJson(join(p.out, "qualification.json")));
  } catch (error) { result.attributionFailure = error.message; }
  if (mock) {
    result.mock = { failures: mock.failures, requests: mock.requests.length, paidModelCalls: result.execution.paidModelCalls };
    assert(mock.failures.length === 0 && mock.requests.length > 0 && result.mock.paidModelCalls === 0, "T3_MOCK_PROVIDER_FAILURE");
  }
  result.passed = result.evidence?.valid === true && result.trajectory !== undefined && (!paid || result.responseAttribution !== undefined) &&
    result.isolation !== undefined && Object.values(result.checks).every(Boolean) && result.semanticScore.passed &&
    result.conclusion === "DELIVER" && result.deliveryReceipt !== undefined;
} catch (error) {
  result.reason = error.message;
} finally {
  const accounting = ledger.snapshot();
  result.accounting = { requests: accounting.requests.length, unresolved: accounting.unresolvedRequests, confirmed: accounting.confirmed,
    state: accounting.state, reason: accounting.reason };
  ledger.close();
  await mock?.close();
  writeJson(join(p.run, "result.json"), result);
  console.log("REVIEW_T3_RESULT", JSON.stringify({ passed: result.passed, usageKnown: result.usageKnown, ...result.accounting,
    current: result.current, semanticPassed: result.semanticScore?.passed, failedCriteria: result.semanticScore?.checks?.filter(check => !check.passed),
    reason: result.reason ?? result.attributionFailure ?? result.execution?.error ?? result.accounting.reason, checks: result.checks }));
  if (!result.passed) process.exitCode = 1;
}
