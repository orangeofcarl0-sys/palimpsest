/**
 * C6-R4 — inspect one DSH session stream. Read-only; prints a compact account, tool catalogue and
 * tool results. Usage is the same accounting the campaign uses.
 */
import { readFileSync } from "node:fs";
import { accountSessions, readSessionStream, requestToolCatalogue, toolCalls, toolResults } from "./session_stream.mjs";

const paths = process.argv.slice(2);
if (paths.length === 0) {
  process.stderr.write("usage: node read_session.mjs <session.v4.jsonl.zstd> [...]\n");
  process.exit(2);
}
const streams = paths.map((path) => readSessionStream(path));
const account = accountSessions(streams);
const report = streams.map((stream) => ({
  path: stream.path,
  sessionId: stream.sessionId,
  events: stream.events.length,
  frames: stream.frames,
  truncatedFrames: stream.truncatedFrames,
  malformedLines: stream.malformedLines,
  complete: stream.complete,
  turnEnd: stream.turnEnd,
  toolCatalogue: requestToolCatalogue(stream.events),
  toolCalls: toolCalls(stream.events),
  toolResults: toolResults(stream.events).map((result) => ({
    ...result,
    text: result.text.length > 1200 ? `${result.text.slice(0, 1200)}…` : result.text,
  })),
}));
process.stdout.write(`${JSON.stringify({ account, streams: report }, null, 2)}\n`);
