#!/usr/bin/env node
/**
 * COG-4.0 — the forward-only measurement audit of the COG-3 evidence.
 *
 * READ-ONLY with respect to `research-evidence/cog3/**`. It decodes the immutable session streams,
 * recounts real usage, inspects the recorded update commit scope, and separates Session/turn/record
 * identities. It writes only under `research-evidence/cog4/measurement/`.
 *
 * The audit answers four questions the ruling listed as measurement debt:
 *   1. the 6,000-token P discrepancy;
 *   2. what the `git add -A` update commit actually captured;
 *   3. whether duplicate Turn Summary records were an observation or an execution issue;
 *   4. whether the Python-dependent test environment is now verified.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { zstdDecompressSync } from "node:zlib";

const REPO = resolve(import.meta.dirname, "..", "..");
const COG3 = join(REPO, "research-evidence", "cog3");
const OUT = join(REPO, "research-evidence", "cog4", "measurement");

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

function decodeZstdFrames(buffer) {
  const positions = [];
  let index = buffer.indexOf(ZSTD_MAGIC, 0);
  while (index !== -1) {
    positions.push(index);
    index = buffer.indexOf(ZSTD_MAGIC, index + 4);
  }
  if (positions.length === 0) throw new Error("no zstd frame magic found");
  const parts = [];
  for (let frame = 0; frame < positions.length; frame += 1) {
    const start = positions[frame];
    const end = frame + 1 < positions.length ? positions[frame + 1] : buffer.length;
    parts.push(zstdDecompressSync(buffer.subarray(start, end)));
  }
  return Buffer.concat(parts);
}

function decodeSession(file) {
  const text = decodeZstdFrames(readFileSync(file)).toString("utf8");
  const lines = text.split(/\r?\n/u).filter((line) => line.trim() !== "");
  const events = [];
  let badLines = 0;
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      badLines += 1;
    }
  }
  return { text, events, lines: lines.length, badLines, bytes: Buffer.byteLength(text, "utf8") };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function git(args, cwd = REPO) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function countEntries(path) {
  try {
    return readdirSync(path).length;
  } catch {
    return null;
  }
}

function executablePresent(name) {
  try {
    const out = execFileSync(process.platform === "win32" ? "where" : "which", [name], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.split(/\r?\n/u).filter(Boolean);
  } catch {
    return [];
  }
}

/* ================================================================== *
 * 1. Token reconciliation
 * ================================================================== */
const principalFile = join(COG3, "sessions", "P1", "principal-session-d8ca633c-9238-412b-9d7c-073e1c00fa11.zstd");
const branchFile = join(COG3, "sessions", "P1", "branch-65fa69d0-c8ef-4479-90dc-2aaf44d08d63.zstd");
const principal = decodeSession(principalFile);
const branch = decodeSession(branchFile);

function usageFrom(events) {
  const messages = events.filter((event) => event.type === "assistant/message" && event.data?.usage);
  const totals = messages.reduce(
    (sum, event) => ({
      inputTokens: sum.inputTokens + (event.data.usage.inputTokens ?? 0),
      outputTokens: sum.outputTokens + (event.data.usage.outputTokens ?? 0),
      cacheReadTokens: sum.cacheReadTokens + (event.data.usage.cacheReadTokens ?? 0),
      cacheWriteTokens: sum.cacheWriteTokens + (event.data.usage.cacheWriteTokens ?? 0),
      totalTokens: sum.totalTokens + (event.data.usage.totalTokens ?? 0),
      messages: sum.messages + 1,
    }),
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, messages: 0 },
  );
  const sequences = messages.map((event) => event.seq);
  const duplicates = sequences.filter((seq, index) => sequences.indexOf(seq) !== index);
  return { ...totals, duplicates, firstSeq: sequences[0] ?? null, lastSeq: sequences[sequences.length - 1] ?? null };
}

const principalUsage = usageFrom(principal.events);
const branchUsage = usageFrom(branch.events);
const streamTotal = principalUsage.totalTokens + branchUsage.totalTokens;
const runTwo = readJson(join(COG3, "runs", "P1", "run-two.json"));
const recordedTotal = runTwo.telemetry.totalUsage.totalTokens;
const scores = readJson(join(COG3, "scores.json"));
const scoredP = scores.conditions.P.tokens;
const discrepancy = scoredP - streamTotal;

const campaign = {
  scoredP,
  streamP: streamTotal,
  discrepancy,
  S: scores.conditions.S.tokens,
  F: scores.conditions.F.tokens,
  probes: 536_463,
};
campaign.reportedCampaignTotal = campaign.scoredP + campaign.S + campaign.F + campaign.probes;
campaign.correctedCampaignTotal = campaign.streamP + campaign.S + campaign.F + campaign.probes;
campaign.cap = 25_000_000;
campaign.reportedOverrun = campaign.reportedCampaignTotal - campaign.cap;
campaign.correctedOverrun = campaign.correctedCampaignTotal - campaign.cap;

const tokenReconciliation = {
  principal: { file: "sessions/P1/principal-session-d8ca633c-9238-412b-9d7c-073e1c00fa11.zstd", ...principalUsage, events: principal.events.length, lines: principal.lines, badLines: principal.badLines },
  branch: { file: "sessions/P1/branch-65fa69d0-c8ef-4479-90dc-2aaf44d08d63.zstd", ...branchUsage, events: branch.events.length, lines: branch.lines, badLines: branch.badLines },
  streamTotal,
  runTwoRecordedTotal: recordedTotal,
  scoresRecordedTotal: scoredP,
  runTwoMatchesStream: recordedTotal === streamTotal,
  scoreDiscrepancy: discrepancy,
  explanation:
    discrepancy === 0
      ? "scores.json agrees with the immutable streams"
      : `scores.json is ${discrepancy} tokens above the immutable stream total; run-two.json already records the exact stream total, so the difference is a transcription/arithmetic error in the derived score record, not a later Session append (the streams end at turn/end with no duplicate seqs)`,
  campaign,
  lastPrincipalEvent: principal.events[principal.events.length - 1]?.type ?? null,
  lastPrincipalSeq: principal.events[principal.events.length - 1]?.seq ?? null,
  lastBranchEvent: branch.events[branch.events.length - 1]?.type ?? null,
};

/* ================================================================== *
 * 2. Project-update commit scope
 * ================================================================== */
const principalRunOne = readJson(join(COG3, "runs", "P1", "run-one.json"));
const updateHead = principalRunOne.updateCommittedAtHead;
const phaseOneWrites = new Set();
const phaseOneShell = [];
for (const call of principalRunOne.telemetry.mainSession.toolCallDetails) {
  const args = call.arguments ?? {};
  if ((call.name === "write" || call.name === "edit") && typeof args.file_path === "string") phaseOneWrites.add(args.file_path);
  if (call.name === "bash" && typeof args.command === "string") phaseOneShell.push(args.command);
}
const gitStatusCallId = principalRunOne.telemetry.mainSession.toolCallDetails.find(
  (call) => call.name === "bash" && typeof call.arguments?.command === "string" && call.arguments.command.includes("git status --short"),
)?.callId;
const gitStatusResult = principal.events.find(
  (event) => event.type === "tool/result" && event.data?.message?.toolCallId === gitStatusCallId,
);
const gitStatusText = gitStatusResult?.data?.message?.content?.map((block) => block.text ?? "").join("") ?? null;

const updateCommit = {
  recordedHead: updateHead,
  worldStillPresent: existsSync(join(REPO, "..", ".cog3-rig", "P1", "work")),
  stagedPathAllowlist: null,
  addCommand: "git add -A (scripts/cog3/rig3.mjs applyUpdate)",
  phaseOneWritePaths: [...phaseOneWrites].sort(),
  phaseOneShellCommandsThatCouldWrite: phaseOneShell.filter((command) => /[>]|mkdir|touch|cp |mv |tee |cat <</.test(command)),
  gitStatusAtPhaseOne: gitStatusText,
  inference:
    "The test-owned world was removed after evidence collection, so the update commit object itself is not preserved. The recorded phase-one `git status --short` shows only `?? deliverables/`; the only observed write path is `deliverables/plan.md`. With `git add -A`, the update commit therefore captured the generated phase-one deliverable in addition to `updates/2026-01-20-northgate-booking.md` — and would have captured any other untracked path present at that instant, because no staged-path allowlist was verified before the commit.",
  disposition:
    "COG-3 is not rewritten. COG-4 stages only explicitly named update paths and verifies `git diff --cached --name-only` before committing.",
};

/* ================================================================== *
 * 3. Turn telemetry
 * ================================================================== */
const turns = new Map();
for (const event of principal.events) {
  const turn = event.data?.turn;
  if (typeof turn !== "number") continue;
  const entry = turns.get(turn) ?? { turn, steps: 0, messages: 0, toolCalls: 0, tokens: 0, texts: [] };
  if (event.type === "step/start") entry.steps += 1;
  if (event.type === "assistant/message") {
    entry.messages += 1;
    entry.tokens += event.data.usage?.totalTokens ?? 0;
    const text = (event.data.message?.content ?? []).filter((block) => block.type === "text").map((block) => block.text).join("");
    if (text.trim() !== "") entry.texts.push(text);
  }
  if (event.type === "tool/call") entry.toolCalls += 1;
  turns.set(turn, entry);
}
const turnSummary = [...turns.values()].map((entry) => ({
  turn: entry.turn,
  steps: entry.steps,
  messages: entry.messages,
  toolCalls: entry.toolCalls,
  tokens: entry.tokens,
  finalTextLength: entry.texts[entry.texts.length - 1]?.length ?? 0,
  finalTextStart: (entry.texts[entry.texts.length - 1] ?? "").slice(0, 120),
}));

const summaryRecords = readFileSync(join(COG3, "runs", "P1", "principal-one.log"), "utf8")
  .split(/\r?\n/u)
  .filter((line) => line.includes("PALIMPSEST_TURN "))
  .map((line) => {
    const at = line.slice(0, line.indexOf("PALIMPSEST_TURN")).trim();
    const payload = JSON.parse(line.slice(line.indexOf("PALIMPSEST_TURN ") + "PALIMPSEST_TURN ".length));
    return { at, textLength: payload.text.length, textStart: payload.text.slice(0, 120), toolCalls: payload.toolCalls.length, firstCalls: payload.toolCalls.slice(0, 6), lastCalls: payload.toolCalls.slice(-4) };
  });

const turnTelemetry = {
  principalTurns: turnSummary,
  principalUniqueTurns: turnSummary.length,
  branchTurns: branch.events.filter((event) => event.type === "turn/start").length,
  modelExecutionTurns: turnSummary.length + branch.events.filter((event) => event.type === "turn/start").length,
  runOneHostSummaryRecords: summaryRecords,
  runOneHostSummaryRecordCount: summaryRecords.length,
  distinctTexts: [...new Set(summaryRecords.map((record) => record.textStart))],
  finding:
    "The session stream has exactly three principal turns (56 + 8 + 36 steps) and one branch turn. The two run-one `PALIMPSEST_TURN` records were emitted 3 ms apart and both end with turn 2's text; the first covers turn 1 + turn 2 (256 tool entries / 128 calls) and the second covers part of turn 1 + turn 2 (220 entries / 110 calls). No fourth model turn occurred. This is an observation/record overlap caused by `printTurn()` running after `whenIdle()` had also waited for the delegation follow-up turn, not a model-execution duplicate. The launch turn's own final text is not present in any summary record.",
};

/* ================================================================== *
 * 4. Python / broad-test environment
 * ================================================================== */
const python = executablePresent("python");
const py = executablePresent("py");
const pythonVersion = (() => {
  try {
    return execFileSync("py", ["--version"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
})();
const broadEnvironment = {
  pythonOnPath: python.length > 0,
  pythonPaths: python,
  pyAvailable: py.length > 0,
  pyVersion: pythonVersion,
  knownCog3Failure: "test/inplace_execution.test.ts: 3 tests; the gate command `python -c ...` produced no observable exit code",
  cog3Diagnostic: "PATH=/d/ProgramData/anaconda3:$PATH npx vitest run test/inplace_execution.test.ts --maxWorkers=1 -> 9/9 passed",
  cog4Rule: "before broad testing, verify a `python` executable is on the test PATH (or record the missing prerequisite); do not rerun the COG-3 suite to obtain a greener historical record",
};

/* ================================================================== *
 * 5. Protected resources and budget proof
 * ================================================================== */
const worktreeListing = git(["worktree", "list", "--porcelain"]);
const protectedResources = {
  worktrees: worktreeListing.split(/\r?\n/u).filter((line) => line.startsWith("worktree ")).length,
  locks: worktreeListing.split(/\r?\n/u).filter((line) => line.startsWith("locked")).length,
  gateRoots: countEntries(join(process.env.USERPROFILE ?? process.env.HOME ?? "", ".palimpsest-gates")),
  evidenceTrees: countEntries(join(REPO, "research-evidence")),
  stashes: git(["stash", "list"]) === "" ? 0 : git(["stash", "list"]).split(/\r?\n/u).filter(Boolean).length,
};
const budgetSelfTest = readJson(join(OUT, "budget-selftest.json"));

const audit = Object.freeze({
  schema: "cog4-cog3-audit/v1",
  at: new Date().toISOString(),
  readOnly: "research-evidence/cog3 was read, never written",
  codeFreezeOfAuditedEvidence: scores.codeFreeze ?? readJson(join(COG3, "verification.json")).codeFreeze.commit,
  tokenReconciliation,
  updateCommit,
  turnTelemetry,
  broadEnvironment,
  protectedResources,
  budgetMonitor: { selftest: { passed: budgetSelfTest.passed, failed: budgetSelfTest.failed, cases: budgetSelfTest.cases.map((entry) => entry.name) }, evidence: "budget-selftest.json" },
  unresolved: [
    "The exact path list of the COG-3 update commit cannot be recovered because the test-owned world is not preserved.",
    "The COG-3 P score record remains 6,000 tokens above its immutable stream until a forward erratum is written; no historical file is rewritten.",
    "The COG-2 concurrent targeted failures remain unattributed (COG-3 forward erratum §2).",
  ],
});

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "cog3-audit.json"), JSON.stringify(audit, null, 2));
writeFileSync(
  join(OUT, "cog3-audit.md"),
  [
    "# COG-4.0 — forward-only audit of the COG-3 measurement debt",
    "",
    `Generated ${audit.at} from the immutable COG-3 evidence. No COG-3 file was modified.`,
    "",
    "## Token reconciliation",
    "",
    `- Principal stream: ${principalUsage.totalTokens.toLocaleString()} tokens in ${principalUsage.messages} assistant messages.`,
    `- Branch stream: ${branchUsage.totalTokens.toLocaleString()} tokens in ${branchUsage.messages} assistant messages.`,
    `- Stream total: ${streamTotal.toLocaleString()}. run-two.json records ${recordedTotal.toLocaleString()} (${recordedTotal === streamTotal ? "exact match" : "MISMATCH"}).`,
    `- scores.json records ${scoredP.toLocaleString()}: **${discrepancy.toLocaleString()} above the immutable stream**.`,
    `- The streams end at \`turn/end\` with no duplicate seqs, so the difference is arithmetic/transcription, not a later append.`,
    `- Corrected campaign total: ${campaign.correctedCampaignTotal.toLocaleString()} against the 25,000,000 cap; overrun ${campaign.correctedOverrun.toLocaleString()} (still a real overrun).`,
    "",
    "## Project-update commit scope",
    "",
    `- Recorded update head: \`${updateHead ?? "none"}\`; the test-owned world is preserved: **${updateCommit.worldStillPresent ? "yes" : "no"}**.`,
    `- \`applyUpdate()\` used \`${updateCommit.addCommand}\` and verified no staged-path list.`,
    `- Observed phase-one write path(s): ${phaseOneWrites.size === 0 ? "none" : [...phaseOneWrites].map((path) => `\`${path}\``).join(", ")}.`,
    `- Phase-one \`git status --short\`: \`${(gitStatusText ?? "not captured").replace(/\n/gu, "\\n")}\`.`,
    `- Therefore the update commit captured the intended update file **and** the generated phase-one deliverable. The exact set is not recoverable because the commit object was not preserved.`,
    `- COG-4 disposition: ${updateCommit.disposition}`,
    "",
    "## Turn telemetry",
    "",
    `- Principal unique turns: ${turnTelemetry.principalUniqueTurns} (${turnSummary.map((turn) => `turn ${turn.turn}: ${turn.steps} steps`).join(", ")}).`,
    `- Branch unique turns: ${turnTelemetry.branchTurns}. Model execution turns across both Sessions: ${turnTelemetry.modelExecutionTurns}.`,
    `- Run-one Host summary records: ${turnTelemetry.runOneHostSummaryRecordCount}, emitted ${summaryRecords.map((record) => record.at).join(" and ")}.`,
    `- Both records end with turn 2's text; the first covers 128 calls (turn 1 + turn 2), the second 110 calls (part of turn 1 + turn 2).`,
    `- Finding: ${turnTelemetry.finding}`,
    "",
    "## Python / broad-test environment",
    "",
    `- \`python\` on PATH: **${broadEnvironment.pythonOnPath ? "yes" : "no"}**${python.length === 0 ? "" : ` (${python.join(", ")})`}.`,
    `- \`py\` available: **${broadEnvironment.pyAvailable ? "yes" : "no"}**${pythonVersion === null ? "" : ` (${pythonVersion})`}.`,
    `- COG-3 broad failure: ${broadEnvironment.knownCog3Failure}.`,
    `- COG-3 diagnostic: ${broadEnvironment.cog3Diagnostic}.`,
    `- COG-4 rule: ${broadEnvironment.cog4Rule}.`,
    "",
    "## Protected resources at this audit",
    "",
    `- Worktrees: ${protectedResources.worktrees}; locks: ${protectedResources.locks}; gate roots: ${protectedResources.gateRoots}; evidence trees: ${protectedResources.evidenceTrees}; stashes: ${protectedResources.stashes}.`,
    "",
    "## Budget monitor proof",
    "",
    `- Simulated self-test: **${budgetSelfTest.passed} passed, ${budgetSelfTest.failed} failed**.`,
    `- Cases: ${budgetSelfTest.cases.map((entry) => entry.name).join("; ")}.`,
    `- Evidence: \`budget-selftest.json\` (simulated usage; no model was called).`,
    "",
    "## Unresolved",
    "",
    ...audit.unresolved.map((entry) => `- ${entry}`),
    "",
  ].join("\n"),
);

console.log(
  JSON.stringify({
    out: join(OUT, "cog3-audit.json"),
    streamTotal,
    recordedTotal,
    discrepancy,
    correctedCampaignTotal: campaign.correctedCampaignTotal,
    worktrees: protectedResources.worktrees,
    gateRoots: protectedResources.gateRoots,
    evidenceTrees: protectedResources.evidenceTrees,
    budgetSelfTest: { passed: budgetSelfTest.passed, failed: budgetSelfTest.failed },
  }),
);
