/**
 * ALHS offline convergence analysis of the real LHAPE-C pilot sessions.
 *
 * It reads the recorded DSH session streams (concatenated zstd frames), replays the real package
 * writes/edits, and reports when each condition first produced a package that passes the same
 * pre-registered 7-fact rubric used by the pilot scorer, how many tokens and tool calls came after
 * that point, and whether the session ever emitted a natural closing assistant message.
 *
 * This is diagnosis of already-recorded sessions. It makes no model call and writes no project state.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { zstdDecompressSync } from "node:zlib";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const PILOT = resolve(String(args.get("pilot") ?? ""));
const OUT = resolve(String(args.get("out") ?? ""));
if (PILOT === "" || OUT === "") throw new Error("--pilot and --out are required");

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

function decodeFrames(buffer) {
  const offsets = [];
  for (let index = 0; index + 4 <= buffer.length; index += 1) {
    if (ZSTD_MAGIC.every((byte, offset) => buffer[index + offset] === byte)) offsets.push(index);
  }
  const chunks = [];
  let start = offsets[0] ?? 0;
  for (let index = 1; index <= offsets.length; index += 1) {
    const end = index < offsets.length ? offsets[index] : buffer.length;
    try {
      chunks.push(zstdDecompressSync(buffer.subarray(start, end)));
      start = end;
    } catch {
      /* a magic sequence inside a frame; keep looking for a real boundary */
    }
  }
  return Buffer.concat(chunks).toString("utf8");
}

function readSession(file) {
  const text = decodeFrames(readFileSync(file));
  return text
    .split(/\n/u)
    .filter((line) => line.trim() !== "")
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((event) => event !== null && typeof event.time === "number");
}

function sessionsFor(condition) {
  const found = [];
  for (const workspace of ["host-workspace", "worker-workspace"]) {
    const dir = join(PILOT, `${condition}-sessions`, workspace);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const file = join(dir, name, "session.v4.jsonl.zstd");
      if (!existsSync(file)) continue;
      const events = readSession(file);
      if (events.length === 0) continue;
      const header = events.find((event) => event.type === "session");
      found.push({
        sessionId: header?.id ?? name,
        workspace,
        events: [...events].sort((left, right) => left.time - right.time),
      });
    }
  }
  return found;
}

const CRITERIA = [
  "package_present",
  "both_sites",
  "measured_700mm_used",
  "baseline_900mm_rejected",
  "coastal_claim_not_accepted",
  "cost_and_schedule",
  "risk_and_decision",
];

/** The same pre-registered rubric as scripts/lhape/score_pilot.mjs. */
function criteriaFor(text) {
  const lower = text.toLowerCase();
  const has900 = lower.includes("900");
  const rejects900 =
    !has900 ||
    /900[^.\n]{0,120}(not admissible|not allowed|excluded|cannot|ineligible|superseded|not usable)/u.test(lower) ||
    /(not admissible|not allowed|exclude|cannot use|ineligible)[^.\n]{0,120}900/u.test(lower);
  return {
    package_present: text.length > 200,
    both_sites: lower.includes("site a") && lower.includes("site b"),
    measured_700mm_used: /700\s*mm/u.test(lower),
    baseline_900mm_rejected: rejects900,
    coastal_claim_not_accepted:
      /(2024|2026)/u.test(lower) && /(not current|not a current|no (?:current )?certificate|unverified|not on file|expected)/u.test(lower),
    cost_and_schedule: /(cost|budget)/u.test(lower) && /(schedule|timeline|lead time)/u.test(lower),
    risk_and_decision: /(risk|uncertainty)/u.test(lower) && /(decision|recommend)/u.test(lower),
  };
}

function passed(criteria) {
  return CRITERIA.every((key) => criteria[key] === true);
}

function writeTarget(name, payload) {
  const path = String(payload.file_path ?? payload.path ?? "");
  if (name !== "write") return null;
  return /deliverables[\\/]package\.md$/u.test(path) ? path : null;
}

function editTarget(name, payload) {
  const path = String(payload.file_path ?? payload.path ?? "");
  if (name !== "edit") return null;
  return /deliverables[\\/]package\.md$/u.test(path) ? path : null;
}

/** Unescape the small set of escapes a model uses inside a run_code template literal. */
function unescapeTemplate(raw) {
  return raw
    .replace(/\\`/gu, "`")
    .replace(/\\\$/gu, "$")
    .replace(/\\n/gu, "\n")
    .replace(/\\t/gu, "\t")
    .replace(/\\\\/gu, "\\");
}

/** Extract a full package body written from inside a PTC run_code program, when present. */
function packageFromRunCode(code) {
  if (!code.includes("package.md")) return null;
  const marker = code.search(/(?:const|let)\s+content\s*=\s*`/u);
  if (marker < 0) return null;
  const start = code.indexOf("`", marker) + 1;
  let end = start;
  while (end < code.length) {
    if (code[end] === "`" && code[end - 1] !== "\\") break;
    end += 1;
  }
  if (end >= code.length) return null;
  const body = unescapeTemplate(code.slice(start, end));
  if (!body.includes("#") || body.length < 500) return null;
  if (!code.slice(end).includes("package.md")) return null;
  return body;
}

function parseArguments(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function summarizeCall(name, payload) {
  if (payload === null) return name;
  if (name === "pwsh") return `${name}: ${String(payload.description ?? payload.command ?? "").slice(0, 90)}`;
  if (name === "run_code") return `${name}: ${String(payload.description ?? "").slice(0, 90)}`;
  if (name === "read") return `${name}: ${String(payload.file_path ?? "").split(/[\\/]/u).slice(-2).join("/")}`;
  if (name === "subagent") return `${name}: ${String(payload.description ?? "").slice(0, 80)}`;
  return name;
}

function firstLine(text, limit = 160) {
  return String(text ?? "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, limit);
}

const results = {};

for (const condition of ["F", "L", "G"]) {
  const sessions = sessionsFor(condition);
  const timeline = sessions
    .flatMap((session) =>
      session.events.map((event) => ({
        sessionId: session.sessionId,
        workspace: session.workspace,
        event,
      })),
    )
    .sort((left, right) => left.event.time - right.event.time);

  const usage = new Map();
  let totalTokens = 0;
  let assistantMessages = 0;
  let closingText = null;
  for (const entry of timeline) {
    if (entry.event.type !== "assistant/message") continue;
    const tokens = entry.event.data?.usage?.totalTokens ?? 0;
    usage.set(entry.event.seq, tokens);
    totalTokens += tokens;
    assistantMessages += 1;
    const content = entry.event.data?.message?.content ?? [];
    const hasToolCall = content.some((part) => part.type === "tool-call");
    if (!hasToolCall) {
      const text = content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join(" ");
      if (text.trim() !== "") closingText = { time: entry.event.time, text: firstLine(text, 400) };
    }
  }

  let content = "";
  let artifactBytes = 0;
  const versions = [];
  const calls = [];
  const afterFirstValid = [];
  let firstValid = null;

  const allMessages = timeline.filter((entry) => entry.event.type === "assistant/message");
  let messageIndex = 0;
  let tokensAtEvent = 0;
  const tokensByMessage = new Map();
  for (const message of allMessages) {
    messageIndex += 1;
    tokensAtEvent += message.event.data?.usage?.totalTokens ?? 0;
    tokensByMessage.set(message.event.seq, tokensAtEvent);
  }

  const snapshot = (time, label) => {
    const criteria = criteriaFor(content);
    versions.push({
      time,
      label,
      bytes: Buffer.byteLength(content, "utf8"),
      passed: Object.values(criteria).filter(Boolean).length,
    });
    return { time, criteria, passedAll: passed(criteria) };
  };

  let currentTokens = 0;
  for (const entry of timeline) {
    const event = entry.event;
    if (event.type === "assistant/message") {
      currentTokens = tokensByMessage.get(event.seq) ?? currentTokens;
      continue;
    }
    if (event.type !== "tool/call") continue;

    const name = event.data?.name ?? "unknown";
    const payload = parseArguments(event.data?.arguments ?? "{}");
    const call = {
      time: event.time,
      name,
      summary: summarizeCall(name, payload),
      messageTokens: currentTokens,
      tokensBefore: currentTokens,
    };
    calls.push(call);

    let changed = null;
    if (payload !== null) {
      if (writeTarget(name, payload) !== null && typeof payload.content === "string") {
        content = payload.content;
        changed = "write";
      } else if (editTarget(name, payload) !== null) {
        const oldText = String(payload.old_string ?? "");
        const newText = String(payload.new_string ?? "");
        if (oldText !== "" && content.includes(oldText)) {
          content = content.replace(oldText, newText);
          changed = "edit";
        }
      } else if (name === "run_code" && typeof payload.code === "string") {
        const body = packageFromRunCode(payload.code);
        if (body !== null) {
          content = body;
          changed = "run_code-full-write";
        }
      }
    }

    if (changed !== null) {
      artifactBytes = Buffer.byteLength(content, "utf8");
      const state = snapshot(event.time, `${name}:${changed}`);
      if (state.passedAll && firstValid === null) {
        firstValid = {
          time: event.time,
          sessionId: entry.sessionId,
          workspace: entry.workspace,
          label: `${name}:${changed}`,
          tokensBefore: currentTokens,
          bytes: artifactBytes,
        };
      }
    }

    if (firstValid !== null && event.time > firstValid.time) {
      afterFirstValid.push({
        time: event.time,
        name,
        summary: summarizeCall(name, payload),
        changedArtifact: changed !== null,
        changeKind: changed,
      });
    }
  }

  const finalCriteria = criteriaFor(content);
  const tokensAfterFirstValid =
    firstValid === null
      ? null
      : calls.filter((call) => call.time > firstValid.time).length === 0 && firstValid.time >= (timeline.at(-1)?.event.time ?? 0)
        ? 0
        : totalTokens - firstValid.tokensBefore;

  const callsAfter = afterFirstValid;
  const counts = {};
  for (const call of callsAfter) counts[call.name] = (counts[call.name] ?? 0) + 1;
  const artifactChangesAfter = callsAfter.filter((call) => call.changedArtifact).length;
  const repeatedQueriesAfter = callsAfter.filter((call) =>
    ["palimpsest_continuity", "job_list", "job_output", "list_agents"].includes(call.name),
  ).length;
  const packageReadsAfter = callsAfter.filter(
    (call) => call.name === "read" && call.summary.includes("package.md"),
  ).length;

  results[condition] = {
    sessions: sessions.map((session) => ({
      sessionId: session.sessionId,
      workspace: session.workspace,
      events: session.events.length,
      assistantMessages: session.events.filter((event) => event.type === "assistant/message").length,
      tokens: session.events
        .filter((event) => event.type === "assistant/message")
        .reduce((sum, event) => sum + (event.data?.usage?.totalTokens ?? 0), 0),
      firstEvent: new Date(session.events[0].time).toISOString(),
      lastEvent: new Date(session.events.at(-1).time).toISOString(),
    })),
    totals: {
      tokens: totalTokens,
      assistantMessages,
      toolCalls: calls.length,
      wallMs: timeline.at(-1).event.time - timeline[0].event.time,
    },
    artifact: {
      bytes: artifactBytes,
      replayPassed: Object.values(finalCriteria).filter(Boolean).length,
      criteria: finalCriteria,
      versions: versions.length,
      changedAfterFirstValid: artifactChangesAfter,
    },
    firstValid,
    afterFirstValid: {
      tokens: tokensAfterFirstValid,
      toolCalls: callsAfter.length,
      toolCallsByName: counts,
      artifactChanges: artifactChangesAfter,
      repeatedStateQueries: repeatedQueriesAfter,
      packageReads: packageReadsAfter,
    },
    closingText,
    lastAssistantMessage: (() => {
      const last = [...timeline].reverse().find((entry) => entry.event.type === "assistant/message");
      if (last === undefined) return null;
      const contentParts = last.event.data?.message?.content ?? [];
      return {
        time: new Date(last.event.time).toISOString(),
        toolCalls: contentParts.filter((part) => part.type === "tool-call").length,
        text: firstLine(
          contentParts
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join(" "),
          300,
        ),
      };
    })(),
    postArtifactCalls: callsAfter.slice(0, 120),
  };
}

const record = {
  schema: "alhs-offline-convergence-analysis/v1",
  generatedAt: new Date().toISOString(),
  pilot: PILOT,
  method:
    "Replays the recorded write/edit/run_code calls per condition; the rubric is the pilot's pre-registered 7-fact rubric. Token values are the recorded per-message usage. No model call was made.",
  note:
    "Token counts after the first valid artifact are the recorded usage of all later assistant messages, including any message that started before the artifact write and finished after it. Values are therefore upper bounds on post-artifact spend.",
  conditions: results,
};
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "offline-convergence-analysis.json"), `${JSON.stringify(record, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
