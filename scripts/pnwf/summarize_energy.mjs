/** Normalize experiment receipts without publishing raw transcripts, local paths or credentials. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { acceptanceOf } from "./energy/contract.mjs";

const root = process.argv[2];
if (!root) throw new Error("Usage: node scripts/pnwf/summarize_energy.mjs <run>");
const read = path => existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
const hash = path => createHash("sha256").update(readFileSync(path)).digest("hex");
const redact = value => typeof value === "string" ? value.replaceAll(resolve(root), "<run>").replaceAll(resolve(root).replaceAll("\\", "/"), "<run>") : value;
const scoreErrors = value => String(value ?? "").split(/\r?\n/u).filter(line => /^check: FAIL|^ - /u.test(line)).join("\n");
const contract = read(join(root, "contract.json"));
const qualification = read(join(root, "qualification.json"));
if (qualification?.reason) qualification.reason = redact(qualification.reason);
const arms = {};
for (const mode of ["mock", "live"]) {
  arms[mode] = {};
  for (const arm of ["P", "F"]) {
    const group = join(root, mode, arm);
    const basisAdmission = read(join(group, "T2", "basis-admission.json"));
    const acceptance = acceptanceOf(join(group, "T3", "acceptance.json"));
    const basisApproval = read(join(group, "T2", "basis-owner-observation.json"));
    const candidateApproval = read(join(group, "T2", "candidate-owner-observation.json"));
    const basisReview = read(join(group, "T2", "operator-review.json"));
    const candidate = read(join(group, "T2", "candidate.json"));
    const sessions = ["T1", "T2", "T3"].map(id => {
      const dir = join(group, id);
      const resultFile = join(dir, "result.json");
      const result = read(resultFile);
      const accounting = read(join(dir, "out", id, "request-accounting.json"));
      const observed = result?.evidence;
      const started = read(join(dir, "started.json"));
      const prior = id === "T1" ? null : read(join(group, id === "T2" ? "T1" : "T2", "result.json"));
      const latest = result?.facts?.conclusion;
      const freshConclusion = latest !== null && latest !== undefined && latest.seq > (prior?.facts?.conclusion?.seq ?? 0);
      return { id, status: result ? result.passed ? "PASSED" : "STOPPED" : started ? "STARTED" : "NOT_STARTED",
        basis: result?.basis ?? started?.basis ?? null, resultSha256: result ? hash(resultFile) : null, checks: result?.checks ?? null,
        reason: redact(result?.reason ?? null), requests: accounting?.requests.length ?? (started ? null : 0), knownTokens: accounting?.confirmed ?? null,
        totalTokens: accounting?.unresolvedRequests === 0 ? accounting.confirmed : null, unresolvedRequests: accounting?.unresolvedRequests ?? null,
        ledgerRefusals: accounting?.refusals ?? [],
        usage: observed?.usage ?? null, usageByRole: observed?.usageByRole ?? null, elapsedMs: observed?.elapsedMs ?? null,
        usageQualified: observed?.usageQualified ?? null, principalId: observed?.principalId ?? null, natural: observed?.natural ?? null, stop: observed?.stop ?? null,
        traces: observed?.traces.map(({ modelSteps, ...trace }) => trace) ?? [],
        workerReceipts: observed?.workerReceipts.map(receipt => receipt.reason ? { ...receipt, reason: redact(receipt.reason) } : receipt) ?? [],
        business: result?.business ?? null, conclusion: freshConclusion ? latest.intent : null,
        project: result?.facts ? { head: result.facts.head, tasks: result.facts.tasks.map(task => ({ id: task.task_id, state: task.state })),
          attempts: result.facts.attempts.map(({ id: attemptId, state, envelope }) => ({ id: attemptId, state,
            ...(contract?.revisionScope && envelope ? { writePaths: envelope.write_paths } : {}) })), promotions: result.facts.promotions,
          latestJournalConclusion: latest ? { seq: latest.seq, intent: latest.intent, recordedThisSession: freshConclusion } : null } : null,
        scoringRecount: result?.scoringRecount ? { ...result.scoringRecount, originalReason: scoreErrors(result.scoringRecount.originalReason) } : null };
    });
    const rejectedCandidateDiagnostic = read(join(group, "T2", "rejected-candidate-diagnostic.json"));
    arms[mode][arm] = { sessions, basisReview, basisApproval, basisAdmission, candidate, candidateApproval, acceptance, rejectedCandidateDiagnostic,
      complete: sessions.every(session => session.status === "PASSED") && acceptance !== null };
  }
}
const paidSessions = Object.values(arms.live).flatMap(arm => arm.sessions).filter(session => session.status !== "NOT_STARTED");
const paidRequestsAdmitted = paidSessions.every(session => session.requests !== null) ? paidSessions.reduce((sum, session) => sum + session.requests, 0) : null;
const paidTokens = paidSessions.every(session => session.totalTokens !== null) ? paidSessions.reduce((sum, session) => sum + session.totalTokens, 0) : null;
console.log(JSON.stringify({ schema: "pnwf-energy-evidence/v1", contract, qualification, paidRequestsAdmitted, paidTokens, arms }, null, 2));
