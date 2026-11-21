/** Offline-only reconstruction from the delivered evidence. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { analyzeAttributedStage, readStream } from "../../analyze_energy_trajectory.mjs";
import { OPENCODE_GO_MESSAGES } from "../../opencode_go.mjs";
import { digest, readJson } from "../../energy/contract.mjs";
import { conclusion } from "../../energy/product.mjs";
import { accepted, archive, file, historical, hint, journalEvents, score, workEvents } from "./case.mjs";

const [directory] = process.argv.slice(2);
assert(directory, "Usage: continuity-reuse/recount.mjs <evidence directory>");
const root = resolve(directory);
const initial = readFileSync(join(root, "inherited-review.md"), "utf8");
const retained = initial.slice(initial.indexOf("## Retained evidence\n"));
const prior = readJson(join(root, "historical.json"));
assert.deepEqual(prior, historical());
const measurement = readJson(join(root, "independent-review.json"));
assert.equal(measurement.sha, accepted.acceptedHead);
const receiptId = digest(JSON.stringify(measurement));
const scratch = mkdtempSync(join(tmpdir(), "pnwf-continuity-recount-"));
const repository = join(scratch, "git");
mkdirSync(repository);
const git = (...args) => execFileSync("git", ["-C", repository, ...args], { encoding: "utf8", timeout: 20_000 });
git("init", "--quiet");
git("fetch", "--quiet", join(root, "inherited.bundle"), "HEAD");
const basis = git("rev-parse", "FETCH_HEAD").trim();
assert.equal(git("cat-file", "blob", `${basis}:${file}`), initial);
const oldWork = workEvents(join(archive, "owners"));
const oldJournal = journalEvents(join(archive, "owners"));

function observe(row, dir) {
  const trace = row.evidence?.traces.find(trace => trace.role === "principal");
  if (!trace || !row.trajectory) return null;
  const source = join(dir, "trajectory", row.trajectory.stream);
  const raw = readStream(source, trace.digest);
  const bySeq = new Map(raw.map(event => [event.seq, event]));
  const offered = raw.some(event => JSON.stringify(event.data ?? {}).includes(hint));
  assert.equal(offered, row.name === "WITH");
  const significant = row.trajectory.significant.map(recorded => {
    const call = bySeq.get(recorded.call);
    assert.equal(call.data.callId, recorded.id);
    const response = bySeq.get(recorded.result);
    if (response) assert.equal(response.data.message.toolCallId, recorded.id);
    if (recorded.receipt) {
      const result = JSON.parse(response.data.message.content.map(block => block.text ?? "").join("\n"));
      assert.equal(recorded.receipt, receiptId);
      assert.deepEqual(result, { ok: true, receiptId, ...measurement });
    }
    return recorded;
  });
  const firstVerify = significant.find(item => item.receipt || (item.action === "inspect-record" && item.found && item.episode === "REOPENED")) ?? null;
  assert.deepEqual(firstVerify, row.trajectory.firstVerify);
  let closeout;
  if (row.trajectory.closeoutOffers) {
    const offers = readFileSync(join(dir, "run.log"), "utf8").split(/\r?\n/u).filter(line => line.startsWith("PALIMPSEST_CLOSEOUT_OFFER "))
      .map(line => JSON.parse(line.slice("PALIMPSEST_CLOSEOUT_OFFER ".length)));
    const messages = raw.filter(event => event.type === "user/message" && JSON.stringify(event.data).includes("[Project closeout]"));
    assert.deepEqual(offers, row.trajectory.closeoutOffers);
    assert.deepEqual(messages.map(event => event.seq), row.trajectory.closeoutMessages);
    assert(offers.length <= 1);
    if (messages.length) assert(JSON.stringify(messages[0].data).includes(offers[0].head));
    const requests = raw.filter(event => event.type === "assistant/message" && event.data.usage);
    const deliveries = significant.filter(item => item.action === "work:conclude" && item.input.intent === "DELIVER").map(item => {
      const result = bySeq.get(item.result);
      const output = result?.data.message.content.map(block => block.text ?? "").join("\n") ?? "";
      const request = requests.filter(event => event.seq < item.call).length;
      assert.equal(requests[request - 1]?.data.step, item.request);
      return { call: item.call, result: item.result, request, turnStep: item.request, recorded: /"state"\s*:\s*"RECORDED"/u.test(output),
        afterOffer: messages.length === 1 && item.call > messages[0].seq };
    });
    closeout = { offers, messages: messages.map(event => event.seq), deliveries,
      requestsAfterOffer: messages.length ? requests.filter(event => event.seq > messages[0].seq).length : 0 };
  }
  return { offered, firstVerify, requestedReceipts: significant.filter(item => item.action === "request-independent-made-measurement").length,
    receivedReceipts: significant.filter(item => item.receipt).length, ...(closeout ? { closeout } : {}) };
}

const rows = [];
for (const phase of ["mock", "live"]) {
  if (phase === "live" && !existsSync(join(root, phase, "matrix.json"))) continue;
  const matrix = readJson(join(root, phase, "matrix.json"));
  assert.equal(matrix.receiptId, receiptId);
  assert.equal(matrix.basis, basis);
  if (phase === "live" && matrix.frozen.closeout) assert.deepEqual(matrix.frozen, readJson(join(root, "mock", "matrix.json")).frozen);
  for (const name of matrix.rows.map(row => row.name)) {
    const dir = join(root, phase, name);
    const row = readJson(join(dir, "result.json"));
    const committed = row.candidate !== row.basis;
    const review = readFileSync(join(dir, committed ? "review-committed.md" : "review-working.md"), "utf8");
    assert.deepEqual(score({ text: review, retained }), row.grade);
    if (committed) {
      git("fetch", "--quiet", join(dir, "candidate.bundle"), "HEAD");
      assert.equal(git("rev-parse", "FETCH_HEAD").trim(), row.candidate);
      assert.equal(git("cat-file", "blob", `${row.candidate}:${file}`), review);
      assert.deepEqual(git("diff", "--name-only", basis, row.candidate).trim().split(/\r?\n/u).filter(Boolean), row.paths);
    }
    const owners = join(scratch, `${phase}-${name}-owners`);
    cpSync(join(dir, "owners"), owners, { recursive: true });
    const journal = journalEvents(owners);
    assert.equal(JSON.stringify(workEvents(owners)) === JSON.stringify(oldWork), row.owners.workPreserved);
    assert.equal(JSON.stringify(journal.slice(0, oldJournal.length)) === JSON.stringify(oldJournal), row.owners.journalPrefixPreserved);
    assert.equal(journal.length - oldJournal.length, row.owners.journalAppends);
    const ledger = readJson(join(dir, "request-accounting.json"));
    assert.equal(ledger.requests.length, row.accounting.requests);
    assert.equal(ledger.confirmed, row.accounting.confirmed);
    assert.equal(ledger.unresolvedRequests, row.accounting.unresolved);
    const observed = observe(row, dir);
    let deliveryBinding;
    if (matrix.frozen.closeout) {
      const execution = readJson(join(dir, "run.json"));
      assert.deepEqual(execution, row.execution);
      const latest = conclusion(owners);
      assert.deepEqual(latest, row.conclusion);
      const body = latest?.body.split("\n").find(line => line.startsWith('{"schema":"pc1-episode-conclusion/v1"'));
      const artifact = latest?.intent === "DELIVER" && body && JSON.parse(body).check.artifacts.find(entry =>
        entry.path === file && entry.committed && entry.commit === row.candidate);
      assert.equal(Boolean(artifact), row.delivery);
      if (artifact) assert.equal(artifact.digest, digest(review));
      deliveryBinding = artifact ? { journalSeq: latest.seq, candidate: artifact.commit, digest: artifact.digest } : null;
    }
    let boundRequests = null;
    if (phase === "live" && row.evidence?.usageQualified) {
      const stage = join(scratch, name);
      const out = join(stage, "out/RESUME");
      mkdirSync(out, { recursive: true });
      cpSync(join(dir, "trajectory"), join(stage, "runtime-RESUME/sessions"), { recursive: true });
      cpSync(join(dir, "attribution"), join(out, "attribution"), { recursive: true });
      for (const entry of ["request-accounting.json", "request-observations.jsonl"]) cpSync(join(dir, entry), join(out, entry));
      const bound = analyzeAttributedStage(stage, "RESUME", { arm: name,
        result: { evidence: row.evidence, seal: { provider: "opencode-go", route: OPENCODE_GO_MESSAGES } } });
      boundRequests = bound.boundRequests;
      assert.equal(boundRequests, ledger.requests.length);
      if (observed?.closeout) {
        const firstOffer = observed.closeout.messages[0];
        const followup = firstOffer === undefined ? [] : bound.traces.find(trace => trace.role === "principal").requests
          .filter(request => request.seq > firstOffer);
        assert.equal(followup.length, observed.closeout.requestsAfterOffer);
        observed.closeout.usageAfterOffer = followup.reduce((sum, request) => ({
          fresh: sum.fresh + request.fresh, cacheRead: sum.cacheRead + request.cacheRead,
          cacheWrite: sum.cacheWrite + request.cacheWrite, output: sum.output + request.output,
        }), { fresh: 0, cacheRead: 0, cacheWrite: 0, output: 0 });
      }
    }
    rows.push({ phase, name, candidate: committed ? row.candidate : null, grade: row.grade.passed, natural: row.execution.natural,
      delivery: row.delivery, observed, boundRequests, ...row.accounting,
      ...(deliveryBinding === undefined ? {} : { deliveryBinding }) });
  }
}
console.log(JSON.stringify({ receiptId, unknownPrior: prior.standing, newPaidRequests: 0, rows }, null, 2));
