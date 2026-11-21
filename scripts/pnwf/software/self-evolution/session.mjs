/** Ordinary DSH session with the existing request contract and archive format. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeAttributedStage, readStream } from "../../analyze_energy_trajectory.mjs";
import { runContainerSession } from "../../container_adapter.mjs";
import { ExecutionBudget, USAGE_ONLY_SCHEMA } from "../../execution_budget.mjs";
import { PAID_COHORT_SCHEMA, PAID_MODE } from "../../bounded_provider.mjs";
import { startMockProvider } from "../../mock_provider.mjs";
import { OPENCODE_GO_MESSAGES } from "../../opencode_go.mjs";
import { digest, readJson, sha, writeJson } from "../../energy/contract.mjs";
import { attribute } from "../../energy/evidence.mjs";
import { checkpoint, conclusion } from "../../energy/product.mjs";
import { deployment, offline, projectId, quote, success } from "./workspace.mjs";

export const window = { maxRequests: 64, wallClockMs: 30 * 60_000, requestTimeoutMs: 240_000, billingCeiling: null };
const sessionId = "MAINTAIN";

export function prepare(run, id = projectId) {
  const stage = join(run, "stages", sessionId);
  const world = join(stage, "world"), state = join(stage, "state");
  mkdirSync(world, { recursive: true });
  mkdirSync(state);
  const deploymentPath = deployment(join(run, "profile.json"), world, state, id);
  return { run, world, state, deployment: deploymentPath, out: join(run, "out", sessionId) };
}

export async function session(prepared, { world, runtime, basis, brief, input, provider, reply }) {
  const { run, out } = prepared;
  const paid = provider !== undefined;
  assert(paid !== (reply !== undefined));
  const mode = paid ? PAID_MODE : "mock";
  const promptPath = join(run, "prompt.txt");
  writeFileSync(promptPath, brief);
  const cohortId = `maintenance-${randomUUID()}`;
  const ceiling = paid ? null : 2_000_000;
  const budgetPath = join(run, "request-ledger.sqlite");
  if (paid) writeJson(join(run, "cohort.json"), { schema: PAID_COHORT_SCHEMA, cohortId, stages: [{ id: sessionId }], ...window });
  writeJson(join(run, "core.json"), { cohortId, budget: ceiling, sessions: [{ id: sessionId, condition: "P", world: prepared.world,
    state: prepared.state, deployment: prepared.deployment, expectedHead: basis, promptPath, killAfterMs: paid ? window.wallClockMs : 300_000 }] });
  const budget = ExecutionBudget.initialize(budgetPath, { schema: paid ? USAGE_ONLY_SCHEMA : "pnwf-request-budget/v1", cohortId,
    aggregateCeiling: ceiling, sessions: [{ id: sessionId, ceiling, softCeiling: ceiling, maxRequests: paid ? window.maxRequests : 20 }] });
  const mock = paid ? null : await startMockProvider({ reply });
  let execution;
  try {
    budget.startSession(sessionId);
    console.log("START", mode, run);
    execution = await runContainerSession({ run, sessionId, budgetPath, provider: mock?.config, mode,
      repository: runtime, image: world.image, experiment: { layout: "product", openCodeGoProfile: provider,
        worldVolume: world.volume, sealedEvidence: input } });
  } finally { budget.close(); await mock?.close(); }
  const ledger = readJson(join(out, "request-accounting.json"));
  const row = { mode, basis, execution, accounting: { requests: ledger.requests.length, unresolved: ledger.unresolvedRequests,
    confirmed: ledger.confirmed }, mockErrors: mock?.failures ?? [] };
  try {
    row.attribution = attribute(run, sessionId, mode);
    if (paid && row.attribution.usageQualified) row.requestBinding = analyzeAttributedStage(run, sessionId, {
      arm: "P", result: { evidence: row.attribution, seal: { provider: "opencode-go", route: OPENCODE_GO_MESSAGES } },
    });
    row.trajectory = trajectory(prepared, row.attribution);
  } catch (error) { row.attributionError = error.message; }
  row.reconciled = row.accounting.requests > 0 && row.accounting.unresolved === 0 && row.attribution?.usageQualified === true &&
    (!paid || row.requestBinding?.boundRequests === row.accounting.requests);
  checkpoint(prepared.state);
  row.conclusion = conclusion(prepared.state);
  writeJson(join(run, "session.json"), row);
  console.log("STOP", run, execution.natural ? "NATURAL" : execution.killedBy ?? execution.error ?? execution.exitCode, row.accounting);
  return row;
}

export function trajectory(prepared, evidence) {
  const principal = evidence.traces.find(trace => trace.role === "principal");
  if (!principal) return null;
  const root = join(prepared.run, `runtime-${sessionId}`, "sessions");
  const stream = readdirSync(root, { recursive: true }).find(path => path.endsWith(".jsonl.zstd") &&
    digest(readFileSync(join(root, path))) === principal.digest);
  assert(stream, "PRINCIPAL_TRAJECTORY_MISSING");
  const raw = readStream(join(root, stream), principal.digest);
  const results = new Map(raw.filter(e => e.type === "tool/result").map(e => [e.data.message.toolCallId, e]));
  const requests = raw.filter(e => e.type === "assistant/message" && e.data.usage);
  const calls = raw.filter(e => e.type === "tool/call").map(event => {
    const args = JSON.parse(event.data.arguments);
    const paired = results.get(event.data.callId);
    const tool = event.data.name;
    const text = (paired?.data.message.content ?? []).map(block => block.text ?? "").join("\n");
    const command = args.command ?? "";
    const record = { callId: event.data.callId, call: event.seq, result: paired?.seq ?? null,
      request: requests.filter(request => request.seq < event.seq).length, tool, action: args.action ?? null,
      ok: paired ? !paired.data.message.isError : null };
    if (tool === "bash" || tool === "pwsh") Object.assign(record, { command, description: args.description ?? "",
      testCommand: /\b(?:vitest|node\s+--test|(?:pnpm|npm)\s+(?:run\s+)?test\b|(?:node|bash)\s+[^\n;&]*(?:repro|probe|regress|check)[^\n;&]*)/iu.test(command),
      output: text.length > 1600 ? text.slice(0, 400) + "\n...\n" + text.slice(-1200) : text });
    if (tool === "palimpsest_work" && args.action === "conclude") Object.assign(record, { intent: args.intent, artifacts: args.artifacts,
      recorded: /"state"\s*:\s*"RECORDED"/u.test(text) });
    if (tool === "palimpsest_continuity" || tool === "palimpsest_project") Object.assign(record, { query: args, observed: text.slice(0, 1100),
      wakeRefs: [...new Set(text.match(/\bcampaign-wake-[a-f0-9]{32}\b/gu) ?? [])] });
    if (["read", "edit", "write"].includes(tool)) Object.assign(record, { path: args.file_path ?? args.path ?? null });
    return record;
  });
  return { stream: stream.replaceAll("\\", "/"), sha256: principal.digest, calls, modelRequests: requests.length,
    lastReply: raw.findLast(e => e.type === "assistant/message")?.seq ?? null };
}

export function retainCandidate(prepared, world, basis, stage) {
  assert(sha(basis));
  const bundle = join(prepared.run, "candidate.bundle");
  const output = join(prepared.run, "submission");
  mkdirSync(output);
  const candidate = success(offline(world, "git rev-parse HEAD"));
  assert(sha(candidate));
  const status = success(offline(world, "git status --porcelain --untracked-files=all"));
  success(offline(world, "git diff --binary HEAD > /evidence/working.patch\ngit ls-files --others --exclude-standard -z | tar -czf /evidence/untracked.tar.gz --null -T -",
    [`${prepared.run}:/evidence`]));
  const changed = success(offline(world, `git diff --no-renames --name-only ${basis} ${candidate}`)).split(/\r?\n/u).filter(Boolean);
  let valid = false;
  if (candidate !== basis) {
    const ancestry = offline(world, `git merge-base --is-ancestor ${basis} ${candidate}`);
    if (ancestry.status === 0) {
      success(offline(world, `git bundle create /evidence/candidate.bundle ${basis}..HEAD && git diff --binary ${basis} ${candidate} > /evidence/candidate.patch`,
        [`${prepared.run}:/evidence`]));
      const allow = stage === "first" ? /^(?:(?:src|host\/dsh|tests?|scripts|docs|maintenance)\/.+|[^/]+\.(?:md|mjs|ts))$/u :
        /^(?:(?:scripts\/pnwf\/software\/continuity-reuse|tests?|docs|maintenance)\/.+|[^/]+\.(?:md|mjs|ts))$/u;
      const modes = success(offline(world, `git diff --no-renames --raw --no-abbrev ${basis} ${candidate} --`)).split(/\r?\n/u);
      valid = status === "" && changed.length > 0 && changed.every(path => allow.test(path)) && !modes.some(line => /(?:^:| )120000 |(?:^:| )160000 /u.test(line));
      if (valid) {
        const notes = changed.filter(path => path.endsWith(".md"));
        for (const [index, path] of notes.entries()) {
          const note = offline(world, `git cat-file blob ${candidate}:${quote(path)}`);
          if (note.status === 0) writeFileSync(join(output, `${index + 1}.md`), note.stdout);
        }
      }
    }
  }
  return { candidate, basis, status, changed, valid, bundleSha256: existsSync(bundle) ? digest(readFileSync(bundle)) : null };
}
