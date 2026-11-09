/**
 * PSVR-0 — tool-level attribution of a real DSH session stream.
 *
 * The stream is an append-only sequence of independent zstd frames, one per event. This reads the
 * frames, replays the session transcript and reports what the model ACTUALLY did: every tool call
 * with its arguments, every result's outcome, and the project effects those calls produced.
 *
 * It is an observation tool. It does not score, infer intent, or fill in an unobserved step.
 *
 * Usage: node scripts/psvr/session_attribution.mjs <stream.jsonl.zstd> <out-prefix>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { zstdDecompressSync } from "node:zlib";

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/** Decode a stream made of concatenated zstd frames. */
function decodeFrames(bytes) {
  const starts = [];
  for (let i = 0; i + 3 < bytes.length; i += 1) {
    if (bytes[i] === MAGIC[0] && bytes[i + 1] === MAGIC[1] && bytes[i + 2] === MAGIC[2] && bytes[i + 3] === MAGIC[3]) {
      starts.push(i);
    }
  }
  const chunks = [];
  for (let k = 0; k < starts.length; k += 1) {
    const end = k + 1 < starts.length ? starts[k + 1] : bytes.length;
    chunks.push(zstdDecompressSync(bytes.subarray(starts[k], end)).toString("utf8"));
  }
  return chunks.join("");
}

const clip = (text, limit) => (text.length <= limit ? text : `${text.slice(0, limit)}…`);

function messageText(message) {
  if (typeof message?.content === "string") return message.content;
  const parts = [];
  for (const block of message?.content ?? []) {
    if (block?.type === "text" && typeof block.text === "string") parts.push(block.text);
  }
  return parts.join("\n");
}

function resultText(event) {
  return messageText(event?.data?.message);
}

function resultCallId(data) {
  const legacy = data.toolCallId;
  const nested = data.message?.toolCallId;
  // A disagreement is unresolved. Arrival order cannot identify parallel calls.
  if (legacy != null && nested != null && legacy !== nested) return null;
  return nested ?? legacy ?? null;
}

/** A result is an error when the product returned an error payload or the tool itself failed. */
function resultError(text) {
  const trimmed = text.trim();
  if (/^error[:\s]/iu.test(trimmed)) return true;
  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === "object" && parsed !== null && ("error" in parsed || "refusal" in parsed);
  } catch {
    return false;
  }
}

/** Facts worth reading out of a result payload without inventing any. */
const FACT_KEYS = [
  "state",
  "status",
  "action",
  "settled",
  "settlement",
  "decision",
  "readiness",
  "outcome",
  "commit",
  "resultCommit",
  "headCommit",
  "observationDigest",
  "taskState",
  "attemptState",
  "intent",
  "promotionId",
  "error",
];

function factsOf(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return {};
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {};
  }
  const facts = {};
  const take = (object) => {
    for (const key of FACT_KEYS) {
      if (object && typeof object === "object" && key in object) {
        const value = object[key];
        if (value === null || ["string", "number", "boolean"].includes(typeof value)) facts[key] = value;
        else if (typeof value === "object" && value?.state) facts[key] = value.state;
      }
    }
  };
  take(parsed);
  for (const wrapper of ["data", "result", "outcome", "readiness", "settlement", "work"]) take(parsed?.[wrapper]);
  return facts;
}

/**
 * PNWF-CQ-G §9.4: a DOMAIN refusal is a normal tool result whose business state says the product
 * declined the action. It is not a protocol error (`isError`), but it still cost a model step, so the
 * scorer must be able to count it separately.
 */
const DOMAIN_REFUSAL_STATES = new Set([
  "REFUSED",
  "NOT_READY",
  "WORKER_ACTIVE",
  "NO_RUNNING_ATTEMPT",
  "MULTIPLE_ATTEMPTS",
  "STALE_OBSERVATION",
  "WORKER_STILL_RUNNING",
  "EXECUTOR_LIVENESS_UNCONFIRMED",
  "SUCCESSOR_REQUIRED",
]);
function refusalReason(state, detail, candidate) {
  const code = candidate.reasonCode ?? candidate.reason ?? candidate.code;
  if (state === "NOT_READY") {
    if (/\bthe world still holds work that is not committed\b/iu.test(detail ?? "")) return "UNCOMMITTED_WORK";
    if (code === "NO_WORK" || /\bthe world holds no observable change against its base\b/iu.test(detail ?? "")) {
      return "NO_SETTLEABLE_DELTA";
    }
  }
  return typeof code === "string" && /^[A-Z][A-Z0-9_]*$/u.test(code) ? code : null;
}

function domainRefusalOf(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  const candidates = [parsed, parsed?.result, parsed?.outcome, parsed?.settlement, parsed?.data];
  for (const candidate of candidates) {
    if (typeof candidate?.state !== "string") continue;
    const state = candidate.state;
    const domain = DOMAIN_REFUSAL_STATES.has(state);
    const blocked = Array.isArray(candidate.blockers) && candidate.blockers.length > 0;
    if (!domain && !blocked) continue;
    const detail = typeof candidate.detail === "string" ? candidate.detail : null;
    return { state: domain ? state : `${state}:BLOCKED`, reason: refusalReason(state, detail, candidate), detail };
  }
  return null;
}

function stderrException(text) {
  const stderr = text.split(/^\[stderr\]\r?\n/mu)[1]?.split(/^\[/mu, 1)[0];
  const match = /^\s*(?:[A-Za-z]+)?Error(?: \[([A-Z][A-Z0-9_]+)\])?:/mu.exec(stderr ?? "");
  return match ? match[1] ?? "STDERR_EXCEPTION" : null;
}

function jobFailureReason(job, resultBeforeSettlement) {
  const exitCode = Number(job.exitCode ?? /^exit code:\s*(-?\d+)\b/iu.exec(job.detail ?? "")?.[1]);
  if (Number.isInteger(exitCode) && exitCode !== 0) return "NONZERO_EXIT";
  if (job.status === "failed") return "JOB_FAILED";
  if (job.status === "killed" && resultBeforeSettlement) {
    // Stopping a healthy job is normal. For a killed job, look for an earlier error
    // from its originating call, rather than the outcome of the later job_kill.
    return resultBeforeSettlement.stderrException ?? (resultBeforeSettlement.ok === false ? "TOOL_RESULT_ERROR" : null);
  }
  return null;
}

const gitCommand = (command = "") => /\bgit\b/u.test(command);
const commitCommand = (command = "") => /\bgit\b[^\n]*\bcommit\b/u.test(command);

function classifyCall(name, args) {
  if (name === "palimpsest_work") return `work:${args.action ?? "?"}`;
  if (name === "palimpsest_continuity") return `continuity:${args.action ?? "?"}`;
  if (name === "palimpsest_project") return `project:${args.action ?? "?"}`;
  if (name === "read") return "read";
  if (name === "write") return "write";
  if (name === "pwsh") {
    if (commitCommand(args.command)) return "shell:git-commit";
    if (gitCommand(args.command)) return "shell:git-read";
    return "shell";
  }
  return name;
}

const STATE_ACTIONS = new Set([
  "work:status",
  "work:workers",
  "work:readiness",
  "work:results",
  "continuity:pulse",
  "project:overview",
  "project:journal_entries",
]);

function main() {
  const [input, prefix] = process.argv.slice(2);
  if (!input || !prefix) {
    console.error("usage: session_attribution.mjs <stream.jsonl.zstd> <out-prefix>");
    process.exit(2);
  }
  const events = decodeFrames(readFileSync(input))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const header = events.find((event) => event.type === "session") ?? {};
  const session = { id: header.id, cwd: header.cwd, createdAt: header.createdAt };
  const start = session.createdAt ?? events[0]?.time ?? 0;
  const rows = [];
  const calls = new Map();
  const jobs = new Map();
  const settledJobs = new Map();

  const add = (event, kind, detail, extra = {}) => {
    const row = { seq: event.seq, at: event.time, offsetMs: event.time - start, kind, detail, ...extra };
    rows.push(row);
    return row;
  };

  for (const event of events) {
    const data = event.data ?? {};
    switch (event.type) {
      case "user/message":
        add(event, "USER", clip(messageText(data).replace(/\s+/gu, " ").trim(), 400));
        break;
      case "assistant/message": {
        const text = messageText(data.message).replace(/\s+/gu, " ").trim();
        if (text) add(event, "DECISION", clip(text, 400));
        break;
      }
      case "tool/call": {
        let args = {};
        try {
          args = JSON.parse(data.arguments ?? "{}");
        } catch {
          args = { raw: data.arguments };
        }
        const call = { seq: event.seq, at: event.time, name: data.name, args, kind: classifyCall(data.name, args) };
        if (typeof data.callId === "string" && data.callId) calls.set(data.callId, call);
        const target =
          args.file_path ??
          args.path ??
          args.taskId ??
          (args.command ? clip(String(args.command).replace(/\s+/gu, " "), 120) : "");
        add(event, "CALL", `${call.kind}${target ? ` ${target}` : ""}`, { callId: data.callId, tool: data.name, args });
        break;
      }
      case "tool/result": {
        const callId = resultCallId(data);
        const call = calls.get(callId);
        const text = resultText(event);
        const failed = event?.data?.message?.isError === true || resultError(text);
        const facts = factsOf(text);
        const refusal = failed ? null : domainRefusalOf(text);
        const outcome = failed ? "ERROR" : refusal ? `REFUSED (${refusal.reason ?? refusal.state})` : "ok";
        const factText = Object.entries(facts)
          .map(([key, value]) => `${key}=${String(value)}`)
          .join(" ");
        add(event, "RESULT", `${outcome}${factText ? ` ${factText}` : ""} ${clip(text.replace(/\s+/gu, " ").trim(), 220)}`, {
          callId,
          callSeq: call?.seq ?? null,
          callKind: call?.kind ?? null,
          ok: !failed,
          facts,
          refusal: refusal?.state ?? null,
          refusalReason: refusal?.reason ?? null,
          refusalDetail: refusal?.detail ?? null,
          stderrException: stderrException(text),
        });
        break;
      }
      case "job/registered":
        jobs.set(data.jobId, data);
        add(event, "JOB", `start ${data.kind} ${clip(data.label ?? "", 100)}`);
        break;
      case "job/settled": {
        const job = jobs.get(data.jobId) ?? data;
        const callId = data.toolCall?.callId ?? job.toolCall?.callId ?? null;
        const row = add(event, "JOB", `end ${data.kind} ${data.status}${data.detail ? ` (${data.detail})` : ""} ${clip(job.label ?? "", 100)}`);
        settledJobs.set(data.jobId, { job: data, callId, row });
        break;
      }
      case "turn/end":
        add(event, "END", `turn completed: ${data.reason?.kind ?? "?"}`);
        break;
      default:
        break;
    }
  }

  const toolCalls = rows.filter((row) => row.kind === "CALL");
  const results = rows.filter((row) => row.kind === "RESULT");
  const byKind = {};
  for (const row of toolCalls) byKind[row.detail.split(" ")[0]] = (byKind[row.detail.split(" ")[0]] ?? 0) + 1;
  const errors = results.filter((row) => row.ok === false);
  const refusals = results.filter((row) => typeof row.refusal === "string");
  const seenRefusals = new Set();
  let repeatedRefusals = 0;
  for (const row of refusals) {
    const call = calls.get(row.callId);
    if (!call) continue;
    const key = JSON.stringify([call.kind, call.args.taskId, call.args.attemptId, call.args.relayRoute,
      row.refusal, row.refusalReason ?? row.refusalDetail]);
    if (seenRefusals.has(key)) repeatedRefusals += 1;
    seenRefusals.add(key);
  }
  const failedResultsByCall = new Map();
  for (const row of results) {
    if (row.callSeq !== null && (!row.ok || row.stderrException) && !failedResultsByCall.has(row.callId)) {
      failedResultsByCall.set(row.callId, row);
    }
  }
  const failedJobs = [];
  for (const [jobId, { job, callId, row }] of settledJobs) {
    const result = failedResultsByCall.get(callId);
    const reason = jobFailureReason(job, result?.seq < row.seq ? result : null);
    if (reason === null) continue;
    const call = calls.get(callId);
    const durationMs = job.finishedAt - job.startedAt;
    row.detail += ` [JOB_FAILED: ${reason}]`;
    failedJobs.push({
      jobId, status: job.status, reason, callId, callSeq: call?.seq ?? null, callKind: call?.kind ?? null,
      resultSeq: result?.seq ?? null, settledSeq: row.seq, durationMs: Number.isFinite(durationMs) ? durationMs : null,
    });
  }
  const noProgress = new Set([...errors, ...refusals].map(row => row.callSeq === null ? `result:${row.seq}` : `call:${row.callSeq}`));
  for (const job of failedJobs) {
    if (job.callSeq !== null) noProgress.add(`call:${job.callSeq}`);
  }
  const pairedToolResults = results.filter(row => row.callSeq !== null).length;
  const stateQueries = toolCalls.filter((row) => STATE_ACTIONS.has(row.detail.split(" ")[0]));
  const commitCalls = toolCalls.filter((row) => row.detail.startsWith("shell:git-commit"));

  const summary = {
    session: {
      id: session.id,
      cwd: session.cwd,
      startedAt: new Date(start).toISOString(),
      endedAt: rows.length ? new Date(rows.at(-1).at).toISOString() : null,
      durationMs: rows.length ? rows.at(-1).at - start : 0,
    },
    counts: {
      steps: events.filter((event) => event.type === "step/start").length,
      turns: events.filter((event) => event.type === "turn/start").length,
      toolCalls: toolCalls.length,
      pairedToolResults,
      unpairedToolResults: results.length - pairedToolResults,
      toolErrors: errors.length,
      jobFailures: failedJobs.length,
      domainRefusals: refusals.length,
      repeatedRefusals,
      noProgressToolCalls: noProgress.size,
      stateQueries: stateQueries.length,
      commits: commitCalls.length,
      jobs: jobs.size,
    },
    byKind,
    stateQueries: stateQueries.map((row) => `${row.offsetMs}ms ${row.detail}`),
    calls: toolCalls.map((row) => ({ seq: row.seq, callId: row.callId, offsetMs: row.offsetMs, kind: row.detail, args: row.args })),
    results: results.map((row) => ({
      seq: row.seq,
      callId: row.callId,
      callSeq: row.callSeq,
      offsetMs: row.offsetMs,
      callKind: row.callKind ?? null,
      ok: row.ok,
      state: row.facts?.state ?? null,
      refusal: row.refusal ?? null,
      refusalReason: row.refusalReason,
      refusalDetail: row.refusalDetail,
      facts: row.facts ?? {},
    })),
    failedJobs,
    modelSteps: events.filter(event => event.type === "assistant/message" && event.data?.usage).map(event => ({
      seq: event.seq, at: event.time, messageId: event.data.message?.id ?? null, usage: event.data.usage,
    })),
  };

  const md = [
    `# Session attribution — ${session.id ?? "?"}`,
    "",
    `cwd: \`${session.cwd ?? "?"}\``,
    `started: ${summary.session.startedAt} · ended: ${summary.session.endedAt} · ${summary.session.durationMs} ms`,
    "",
    "| t+ms | step | kind | observation |",
    "|---:|---|---|---|",
    ...rows.map((row) => `| ${row.offsetMs} | ${row.seq} | ${row.kind} | ${row.detail.replace(/\|/gu, "\\|")} |`),
    "",
  ].join("\n");

  writeFileSync(`${prefix}.timeline.md`, md);
  writeFileSync(`${prefix}.timeline.json`, `${JSON.stringify({ summary, rows }, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

main();
