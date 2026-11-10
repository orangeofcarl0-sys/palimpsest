/** One paid ordinary DSH review from the accepted settled-readiness gRPC revision. */
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
import { assert, changed, clean, descendant, digest, git, head, readJson, writeJson } from "../energy/contract.mjs";
import { attribute } from "../energy/evidence.mjs";
import { PROMPTS, REVIEW } from "../software/contract.mjs";
import { artifactReceipts, bindSoftwareRun, isolated, owner, paths, prepare, stageSoftwareRuntime, traceSummary } from "../software/run.mjs";
import { scoreReview } from "../software/score.mjs";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const release = "a0daba3c4f43f91fe5ab92b1a0bad94c5d2dfee1";
const basis = "4639ae44d78e7c1f9f5269876fa333a99bff770f";
const archive = join(repo, "research-evidence/pnwf-work-revision/2026-11-10/settled-readiness-214618");
const previous = join(repo, "research-evidence/pnwf-software/2026-11-10/scope-rerun-163507");
const { values } = parseArgs({ options: { run: { type: "string" }, accepted: { type: "string" }, "previous-t3": { type: "string" } } });
assert(values.run && values.accepted && values["previous-t3"], "T3_RUN_ACCEPTED_AND_PREVIOUS_PATHS_REQUIRED");
assert(descendant(repo, release, head(repo)) && git(repo, "diff", "--name-only", release, "--", "src", "host", "package.json", "pnpm-lock.yaml") === "",
  "PRODUCT_RELEASE_DRIFT");
const root = resolve(values.run);
const source = resolve(values.accepted);
const prior = resolve(values["previous-t3"]);
const sourceStage = join(source, "accepted-stage");
const sourceWorld = join(sourceStage, "world");
const t2 = readJson(join(archive, "result.json"));
const candidate = readJson(join(archive, "candidate.json"));
const accepted = readJson(join(archive, "acceptance.json"));
const frozen = readJson(join(archive, "contract.json"));
const previousResult = readJson(join(prior, "result.json"));
const previousEvidence = readJson(join(previous, "evidence.json"));
const previousCase = previousEvidence.sessions.find(row => row.arm === "P" && row.id === "T3");
const shaFile = path => digest(readFileSync(path));
for (const file of ["acceptance.json", "candidate.json", "result.json"]) {
  assert(shaFile(join(source, file)) === shaFile(join(archive, file)), "APPROVED_T2_ARCHIVE_DRIFT " + file);
}
assert(t2.passed && t2.usageKnown && t2.accounting.unresolved === 0 && accepted.approved === candidate.commit &&
  accepted.receiptId === candidate.receiptId && accepted.resultingHeadCommit === basis && accepted.tree === candidate.tree &&
  accepted.committed.event_type === "PROMOTION_COMMITTED" && accepted.committed.payload.source_commit === candidate.commit &&
  accepted.committed.payload.resulting_head_commit === basis && head(sourceWorld) === basis && clean(sourceWorld) &&
  git(sourceWorld, "rev-parse", "HEAD^{tree}") === accepted.tree && !existsSync(join(sourceWorld, "acceptance.json")), "T3_ACCEPTANCE_MISMATCH");
assert(previousCase?.basis === previousResult.basis && previousCase.current === previousResult.current &&
  previousCase.originalResultSha256 === shaFile(join(prior, "result.json")), "HISTORICAL_T3_EVIDENCE_DRIFT");
const scorerSha256 = shaFile(join(repo, "scripts/pnwf/software/score.mjs"));
const previousSeal = readJson(join(prior, "../../rerun-seal.json"));
assert(scorerSha256 === previousSeal.driver["score.mjs"] && digest(PROMPTS.T3) === previousSeal.prompts.T3 &&
  shaFile(join(prior, "prompt.txt")) === digest(PROMPTS.T3), "FROZEN_T3_PROMPT_OR_SCORER_DRIFT");
deepStrictEqual(frozen.window, previousSeal.window);
const { image, window } = frozen;
assert(docker(["image", "inspect", image, "--format", "{{.Id}}"]) === image && image === previousSeal.image, "T3_IMAGE_DRIFT");
readDeepSeekKey();

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
const contract = { release, session: "T3", basis, model: frozen.model, dsh: frozen.dsh, image, window, mode: PAID_MODE,
  promptSha256: digest(PROMPTS.T3), scorerSha256, originalAcceptanceSha256: shaFile(join(archive, "acceptance.json")),
  acceptanceMountSha256: shaFile(acceptancePath), previousResultSha256: shaFile(join(prior, "result.json")) };
writeJson(join(p.run, "contract.json"), contract);
const promptPath = join(p.run, "prompt.txt");
writeFileSync(promptPath, PROMPTS.T3);
const cohortId = "software-t3-settled-readiness-" + randomUUID();
writeJson(join(p.run, "cohort.json"), { schema: PAID_COHORT_SCHEMA, cohortId, stages: [{ id: "T3" }], ...window });
writeJson(join(p.run, "core.json"), { cohortId, budget: null, sessions: [{ id: "T3", condition: "P", world: p.world, state: p.state,
  expectedHead: basis, killAfterMs: window.wallClockMs, deployment: p.profile, promptPath }] });
const budgetPath = join(p.run, "request-ledger.sqlite");
const ledger = ExecutionBudget.initialize(budgetPath, { schema: USAGE_ONLY_SCHEMA, cohortId, aggregateCeiling: null,
  sessions: [{ id: "T3", ceiling: null, softCeiling: null, maxRequests: window.maxRequests }] });
const result = { basis, cohortId, acceptance, passed: false, usageKnown: false, frozenScore: null, checks: { accepted: true } };
try {
  writeFileSync(join(p.run, "started.json"), JSON.stringify({ cohortId, basis, at: new Date().toISOString() }) + "\n", { flag: "wx" });
  ledger.startSession("T3");
  console.log("PAID_T3_STARTED", basis);
  result.execution = await runContainerSession({ run: p.run, sessionId: "T3", budgetPath, mode: PAID_MODE,
    repository: runtime, image, experiment: { layout: "product", acceptance: acceptancePath } });
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
  try { result.frozenScore = { passed: true, score: scoreReview({ repo: p.world, basis, commit: current }) }; }
  catch (error) { result.frozenScore = { passed: false, reason: error.message }; }
  if (result.conclusion === "DELIVER") {
    try { result.deliveryReceipt = artifactReceipts(p.world, facts, current, [REVIEW], basis); }
    catch (error) { result.deliveryReceiptFailure = error.message; }
  }
  try {
    result.evidence = attribute(p.run, "T3", PAID_MODE);
    result.usageKnown = result.evidence.usageQualified;
    result.trajectory = traceSummary(p, result.evidence, false);
    if (result.usageKnown) result.responseAttribution = analyzeAttributedStage(p.run, "T3", { context: true, result });
    result.isolation = isolated(readJson(join(p.out, "qualification.json")));
  } catch (error) { result.attributionFailure = error.message; }
  result.passed = result.responseAttribution !== undefined && result.isolation !== undefined && Object.values(result.checks).every(Boolean) && result.frozenScore.passed &&
    result.conclusion === "DELIVER" && result.deliveryReceipt !== undefined;
} catch (error) {
  result.reason = error.message;
} finally {
  const accounting = ledger.snapshot();
  result.accounting = { requests: accounting.requests.length, unresolved: accounting.unresolvedRequests, confirmed: accounting.confirmed,
    state: accounting.state, reason: accounting.reason };
  ledger.close();
  writeJson(join(p.run, "result.json"), result);
  console.log("PAID_T3_RESULT", JSON.stringify({ passed: result.passed, usageKnown: result.usageKnown, ...result.accounting,
    current: result.current, frozenScore: result.frozenScore, reason: result.reason, checks: result.checks }));
}
