/**
 * C6-R4 — authoritative session usage, read from the session stream.
 *
 * COG-6's budget monitor scanned console text for a token number. That is not session accounting and
 * it double-counts cumulative counters. This module reads the DSH session stream itself:
 *
 *   · the v4 stream is a concatenation of zstd frames, so every frame is decoded in order;
 *   · generation is keyed by `(sessionId, seq)`, so a repeated read, a resumed file or a copied
 *     stream contributes once;
 *   · usage is taken only from `assistant/message` events that actually carry a `usage` object;
 *   · a stream with no terminal `turn/end`, a parse failure or a provider error is marked
 *     `incomplete`/`providerError` and is not silently treated as a valid observation;
 *   · a campaign total is the sum of per-session totals, never the maximum of independent sessions.
 */
import { readFileSync } from "node:fs";
import { zstdDecompressSync } from "node:zlib";

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

/** Decode every zstd frame in a v4 session stream, tolerating a truncated tail frame. */
export function decodeStreamBuffer(buffer) {
  const starts = [];
  for (let i = 0; i < buffer.length - 3; i += 1) {
    if (
      buffer[i] === ZSTD_MAGIC[0] &&
      buffer[i + 1] === ZSTD_MAGIC[1] &&
      buffer[i + 2] === ZSTD_MAGIC[2] &&
      buffer[i + 3] === ZSTD_MAGIC[3]
    ) {
      starts.push(i);
    }
  }
  let text = "";
  let truncatedFrames = 0;
  for (let index = 0; index < starts.length; index += 1) {
    const end = index + 1 < starts.length ? starts[index + 1] : buffer.length;
    try {
      text += zstdDecompressSync(buffer.subarray(starts[index], end)).toString("utf8");
    } catch {
      truncatedFrames += 1;
    }
  }
  return { text, frames: starts.length, truncatedFrames };
}

export function parseSessionText(text) {
  const events = [];
  let malformedLines = 0;
  for (const line of text.split(/\r?\n/u)) {
    if (line.trim() === "") continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      malformedLines += 1;
    }
  }
  return { events, malformedLines };
}

export function readSessionStream(path) {
  const decoded = decodeStreamBuffer(readFileSync(path));
  const parsed = parseSessionText(decoded.text);
  const header = parsed.events.find((event) => event.type === "session") ?? null;
  const sessionId = typeof header?.id === "string" ? header.id : null;
  const end = parsed.events.find((event) => event.type === "turn/end") ?? null;
  return {
    path,
    sessionId,
    header,
    events: parsed.events,
    frames: decoded.frames,
    truncatedFrames: decoded.truncatedFrames,
    malformedLines: parsed.malformedLines,
    complete: end !== null && decoded.truncatedFrames === 0 && parsed.malformedLines === 0,
    turnEnd: end?.data ?? null,
  };
}

function usageOfEvent(event) {
  const usage = event?.data?.usage;
  if (usage === undefined || usage === null || typeof usage !== "object") return null;
  const number = (value) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0);
  return {
    inputTokens: number(usage.inputTokens),
    outputTokens: number(usage.outputTokens),
    cacheReadTokens: number(usage.cacheReadTokens),
    cacheWriteTokens: number(usage.cacheWriteTokens),
    totalTokens: number(usage.totalTokens),
  };
}

/**
 * Account for one or more session streams. The same `(sessionId, seq)` observed twice contributes
 * once; a stream without a session header is reported and excluded from totals.
 */
export function accountSessions(streams) {
  const seen = new Set();
  const sessions = new Map();
  const problems = [];
  for (const stream of streams) {
    if (stream.sessionId === null) {
      problems.push({ path: stream.path, problem: "missing_session_header" });
      continue;
    }
    let session = sessions.get(stream.sessionId);
    if (session === undefined) {
      session = {
        sessionId: stream.sessionId,
        streams: 0,
        complete: true,
        providerErrors: 0,
        assistantMessages: 0,
        usageEvents: 0,
        duplicateEvents: 0,
        missingUsageMessages: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 0,
      };
      sessions.set(stream.sessionId, session);
    }
    session.streams += 1;
    session.complete = session.complete && stream.complete;
    for (const event of stream.events) {
      if (event.type === "request/error" || event.type === "provider/error" || event.type === "turn/error") {
        session.providerErrors += 1;
      }
      if (event.type === "turn/end" && event.data?.reason?.kind === "error") {
        session.providerErrors += 1;
      }
      if (event.type !== "assistant/message") continue;
      const key = `${stream.sessionId}\0${event.seq}`;
      if (seen.has(key)) {
        session.duplicateEvents += 1;
        continue;
      }
      seen.add(key);
      session.assistantMessages += 1;
      const usage = usageOfEvent(event);
      if (usage === null) {
        session.missingUsageMessages += 1;
        continue;
      }
      session.usageEvents += 1;
      session.inputTokens += usage.inputTokens;
      session.outputTokens += usage.outputTokens;
      session.cacheReadTokens += usage.cacheReadTokens;
      session.cacheWriteTokens += usage.cacheWriteTokens;
      session.totalTokens += usage.totalTokens;
    }
  }
  const list = [...sessions.values()].sort((left, right) => (left.sessionId < right.sessionId ? -1 : 1));
  return {
    sessions: list,
    sessionCount: list.length,
    totals: list.reduce(
      (sum, session) => ({
        inputTokens: sum.inputTokens + session.inputTokens,
        outputTokens: sum.outputTokens + session.outputTokens,
        cacheReadTokens: sum.cacheReadTokens + session.cacheReadTokens,
        cacheWriteTokens: sum.cacheWriteTokens + session.cacheWriteTokens,
        totalTokens: sum.totalTokens + session.totalTokens,
        usageEvents: sum.usageEvents + session.usageEvents,
      }),
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, usageEvents: 0 },
    ),
    problems,
  };
}

export function toolCalls(events) {
  return events
    .filter((event) => event.type === "tool/call")
    .map((event) => ({ seq: event.seq, callId: event.data.callId, name: event.data.name, arguments: event.data.arguments }));
}

export function toolResults(events) {
  return events
    .filter((event) => event.type === "tool/result")
    .map((event) => ({
      seq: event.seq,
      callId: event.data.toolCallId ?? event.data.message?.toolCallId ?? null,
      isError: Boolean(event.data.message?.isError),
      text: (event.data.message?.content ?? []).map((block) => block.text ?? "").join("\n"),
    }));
}

export function requestToolCatalogue(events) {
  const headers = events.filter((event) => event.type === "request/header");
  return headers.map((event) => (event.data.header?.tools ?? []).map((tool) => tool.name));
}
