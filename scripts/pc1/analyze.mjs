/**
 * PC1 S08 — deterministic behavior analysis of a REAL session stream.
 *
 * It decodes the stream, dedupes usage, counts assistant/tool events, classifies the session, and
 * records what the catalogue actually offered. It does not infer intelligence from tool counts and
 * does not run a rubric by itself.
 */
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

import { accountSessions, readSessionStream, requestToolCatalogue, toolCalls, toolResults } from "../c6r/session_stream.mjs";
import { classifySession } from "../c6r/budget.mjs";
import { writeJson } from "./lib.mjs";

function arg(name, fallback) {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found === undefined ? fallback : found.slice(`--${name}=`.length);
}

const sessionPath = arg("session", "");
if (sessionPath === "") {
  process.stderr.write("usage: node analyze.mjs --session=<file|directory> [--out=<file>]\n");
  process.exit(2);
}
const out = arg("out", "");

function files(path) {
  return path.endsWith(".zst") || path.endsWith(".jsonl") || path.endsWith(".json")
    ? [path]
    : (() => {
        return readdirSync(path)
          .map((entry) => join(path, entry))
          .filter((entry) => statSync(entry).isFile());
      })();
}

const streams = files(sessionPath).map((path) => readSessionStream(path));
const account = accountSessions(streams);
const sessions = account.sessions.map((session) => ({
  ...session,
  classification: classifySession({
    sessionCount: 1,
    assistantMessages: session.assistantMessages,
    providerErrors: session.providerErrors,
    complete: session.complete,
  }),
}));
const analysis = {
  schema: "pc1-session-analysis/v1",
  at: new Date().toISOString(),
  paths: files(sessionPath),
  streams: streams.map((stream) => ({
    path: stream.path,
    sessionId: stream.sessionId,
    complete: stream.complete,
    frames: stream.frames,
    truncatedFrames: stream.truncatedFrames,
    malformedLines: stream.malformedLines,
    toolCalls: toolCalls(stream.events).length,
    toolResults: toolResults(stream.events).length,
    catalogue: requestToolCatalogue(stream.events),
  })),
  account: {
    sessionCount: account.sessionCount,
    totals: account.totals,
    problems: account.problems,
    sessions,
  },
  interpretation:
    "This is a mechanical analysis of session events. OBSERVED means the turn completed; it does not mean the answer was correct or useful. Deterministic tests are not a substitute for a live model result.",
};
if (out !== "") {
  mkdirSync(dirname(out), { recursive: true });
  writeJson(out, analysis);
}
console.log(JSON.stringify(analysis, null, 2));
