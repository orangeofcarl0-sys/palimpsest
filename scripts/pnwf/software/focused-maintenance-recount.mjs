/** Offline only: reconstruct the first passing Principal test window from the sealed stream. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { digest, readJson } from "../energy/contract.mjs";
import { archivedGrounds, testActivity } from "./focused-method.mjs";
import { analyzeAttributedStage } from "../analyze_energy_trajectory.mjs";
import { OPENCODE_GO_MESSAGES } from "../opencode_go.mjs";

const [archive] = process.argv.slice(2);
assert(archive, "Usage: focused-maintenance-recount.mjs <archived evidence root>");
const root = resolve(archive);
const repo = fileURLToPath(new URL("../../../", import.meta.url));
const attributionScript = join(repo, "scripts/psvr/session_attribution.mjs");
const scratch = mkdtempSync(join(tmpdir(), "pnwf-focused-recount-"));

const approval = readJson(join(root, "approval.json"));
assert.deepEqual(archivedGrounds(repo), approval.runs.map(({ runRef, runDigest, ...ground }) => ground));
const evidence = [];
for (const phase of ["mock", "live"]) {
  const phaseRoot = join(root, phase);
  for (const arm of readdirSync(phaseRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name)) {
    const cell = join(phaseRoot, arm);
    const result = readJson(join(cell, "result.json"));
    if (!result.testSelection) {
      evidence.push({ phase, arm, result: result.result, unresolved: result.accounting?.unresolved, error: result.attributionError ?? result.reason });
      continue;
    }
    const trace = result.attribution.traces.find(row => row.role === "principal");
    const stream = join(cell, "trajectory", result.testSelection.stream);
    assert.equal(digest(readFileSync(stream)), trace.digest);
    const prefix = join(scratch, `${phase}-${arm}`);
    execFileSync(process.execPath, [attributionScript, stream, prefix], { timeout: 20_000 });
    const { summary } = readJson(`${prefix}.timeline.json`);
    const activity = testActivity(stream, summary);
    assert.deepEqual(activity, result.testSelection.activity);
    const firstPass = activity.find(row => row.state === "PASS") ?? null;
    assert.deepEqual(firstPass, result.testSelection.firstPass);
    const steps = firstPass ? summary.modelSteps.filter(step => step.seq < firstPass.resultSeq) : null;
    const usage = steps && Object.fromEntries(["inputTokens", "cacheReadTokens", "cacheWriteTokens", "outputTokens", "totalTokens"]
      .map(key => [key, steps.reduce((sum, step) => sum + step.usage[key], 0)]));
    assert.deepEqual(usage, result.testSelection.usageToFirstPass);
    assert.equal(steps?.length ?? null, result.testSelection.requestsToFirstPass);
    const ledger = readJson(join(cell, "request-accounting.json"));
    assert.equal(ledger.requests.length, result.accounting.admitted);
    assert.equal(ledger.confirmed, result.accounting.confirmed);
    assert.equal(ledger.unresolvedRequests, result.accounting.unresolved);
    let requestBinding;
    if (phase === "live" && result.attribution.usageQualified) {
      const stage = join(scratch, `binding-${arm}`);
      const out = join(stage, "out/MAINTAIN");
      mkdirSync(out, { recursive: true });
      cpSync(join(cell, "trajectory"), join(stage, "runtime-MAINTAIN/sessions"), { recursive: true });
      cpSync(join(cell, "attribution"), join(out, "attribution"), { recursive: true });
      for (const name of ["request-accounting.json", "request-observations.jsonl"]) cpSync(join(cell, name), join(out, name));
      const bound = analyzeAttributedStage(stage, "MAINTAIN", { arm, result: {
        evidence: result.attribution, seal: { provider: "opencode-go", route: OPENCODE_GO_MESSAGES },
      } });
      const all = bound.traces.find(row => row.role === "principal").requests;
      const before = all.filter(row => firstPass && row.seq < firstPass.resultSeq);
      assert.equal(before.length, steps?.length ?? 0);
      if (usage) assert.deepEqual(usage, Object.fromEntries(Object.entries({
        inputTokens: "fresh", cacheReadTokens: "cacheRead", cacheWriteTokens: "cacheWrite", outputTokens: "output",
      }).map(([key, field]) => [key, before.reduce((total, request) => total + request[field], 0)]).concat([
        ["totalTokens", before.reduce((total, request) => total + request.fresh + request.cacheRead + request.cacheWrite + request.output, 0)],
      ])));
      requestBinding = { boundRequests: bound.boundRequests, firstPassRequests: before,
        tupleMatches: all.filter(request => request.bindingMethod === "unique-usage-tuple").length };
    }
    evidence.push({ phase, arm, offered: Boolean(result.testSelection.offer), firstPass: firstPass?.callId ?? null,
      beforeFirstPass: steps?.length ?? null, usage, startupFailures: result.testSelection.startupFailures,
      result: result.result, reconciled: result.attribution.usageQualified, unresolved: ledger.unresolvedRequests, requestBinding });
  }
}
console.log(JSON.stringify({ method: approval.ref, history: approval.runs.length, newPaidRequests: 0, evidence }, null, 2));
