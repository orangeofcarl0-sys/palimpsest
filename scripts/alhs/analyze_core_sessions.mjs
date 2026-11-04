/**
 * ALHS-C core offline session analysis. Reads the recorded session streams and classifies what the
 * real model did after the first package already passed the 7-fact floor. No model call; no scoring
 * change. It exists to separate "necessary completion work" from repeated verification and polishing.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { zstdDecompressSync } from "node:zlib";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const RUN = resolve(String(args.get("run") ?? ""));
const OUT = resolve(String(args.get("out") ?? ""));
if (RUN === "" || OUT === "") throw new Error("--run and --out are required");
const core = JSON.parse(readFileSync(join(RUN, "core.json"), "utf8"));
const score = JSON.parse(readFileSync(join(RUN, "score.json"), "utf8"));

const MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
function decode(buffer) {
  const offsets = [];
  for (let index = 0; index + 4 <= buffer.length; index += 1) {
    if (MAGIC.every((byte, offset) => buffer[index + offset] === byte)) offsets.push(index);
  }
  const chunks = [];
  let start = offsets[0] ?? 0;
  for (let index = 1; index <= offsets.length; index += 1) {
    const end = index < offsets.length ? offsets[index] : buffer.length;
    try {
      chunks.push(zstdDecompressSync(buffer.subarray(start, end)));
      start = end;
    } catch {
      /* a magic inside a frame */
    }
  }
  return Buffer.concat(chunks).toString("utf8");
}

function files(root) {
  const out = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let info;
      try {
        info = statSync(full);
      } catch {
        continue;
      }
      if (info.isDirectory()) stack.push(full);
      else if (entry.endsWith(".jsonl.zstd")) out.push(full);
    }
  }
  return out;
}

function eventsFor(home) {
  const out = [];
  for (const file of files(join(home, "sessions"))) {
    for (const line of decode(readFileSync(file)).split(/\n/)) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (typeof event.time === "number") out.push(event);
      } catch {
        /* partial */
      }
    }
  }
  return out.sort((left, right) => left.time - right.time);
}

function classify(name, payload) {
  if (name === "write" || name === "edit") {
    const path = String(payload?.file_path ?? "");
    return path.endsWith("package.md") ? "edit_package" : "edit_other";
  }
  if (name === "read") {
    return String(payload?.file_path ?? "").endsWith("package.md") ? "read_package" : "read_other";
  }
  if (name === "list_agents" || name === "job_list" || name === "job_output") return "state_query";
  if (name === "grep" || name === "glob") return "search";
  if (name === "pwsh") {
    const command = String(payload?.command ?? "");
    if (/git|Get-Content|Select-String|wc|diff|hash|Test-Path/iu.test(command)) return "verify";
    return "shell";
  }
  if (name === "subagent" || name === "send_message" || name === "interrupt_agent") return "coordination";
  if (name === "palimpsest_continuity") return "pulse";
  if (name === "palimpsest_work") return String(payload?.action ?? "") === "conclude" ? "conclude" : "work";
  return "other";
}

const result = { schema: "alhs-core-session-analysis/v1", generatedAt: new Date().toISOString(), conditions: {} };
for (const condition of ["F", "A"]) {
  const firstValid = score.conditions[condition].firstValid;
  const sessions = core.sessions.filter((session) => session.condition === condition);
  const perSession = [];
  for (const session of sessions) {
    const events = eventsFor(session.home);
    const calls = events.filter((event) => event.type === "tool/call");
    const assistant = events.filter((event) => event.type === "assistant/message");
    const tokens = assistant.reduce((sum, event) => sum + (event.data?.usage?.totalTokens ?? 0), 0);
    const after = firstValid === null ? [] : calls.filter((call) => call.time > firstValid.time && call.time >= (events[0]?.time ?? 0));
    const counts = {};
    const detail = [];
    let tokensAfter = 0;
    for (const event of events) {
      if (event.type === "assistant/message" && firstValid !== null && event.time > firstValid.time) {
        tokensAfter += event.data?.usage?.totalTokens ?? 0;
      }
      if (event.type !== "tool/call" || firstValid === null || event.time <= firstValid.time) continue;
      let payload = null;
      try {
        payload = JSON.parse(event.data?.arguments ?? "{}");
      } catch {
        payload = null;
      }
      const kind = classify(event.data?.name, payload);
      counts[kind] = (counts[kind] ?? 0) + 1;
      if (detail.length < 60) {
        detail.push({
          at: new Date(event.time).toISOString(),
          tool: event.data?.name,
          kind,
          summary:
            event.data?.name === "pwsh"
              ? String(payload?.description ?? payload?.command ?? "").slice(0, 90)
              : event.data?.name === "palimpsest_work"
                ? String(payload?.action ?? "")
                : String(payload?.file_path ?? "").split(/[\\/]/u).slice(-2).join("/"),
        });
      }
    }
    perSession.push({
      sessionId: session.id,
      startedAt: new Date(events[0]?.time ?? 0).toISOString(),
      endedAt: new Date(events.at(-1)?.time ?? 0).toISOString(),
      tokens,
      assistantMessages: assistant.length,
      toolCalls: calls.length,
      tokensAfterFirstValid: firstValid === null ? null : tokensAfter,
      callsAfterFirstValid: after.length,
      afterKinds: counts,
      afterDetail: detail,
    });
  }
  result.conditions[condition] = {
    firstValid: firstValid === null ? null : { ...firstValid, at: new Date(firstValid.time).toISOString() },
    sessions: perSession,
  };
}
writeFileSync(join(OUT, "offline-session-analysis.json"), `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ out: join(OUT, "offline-session-analysis.json") })}\n`);
