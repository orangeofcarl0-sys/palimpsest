/**
 * Trajectory-P2-E1R §10 — THE DSH BENCHMARK ANSWER EXTRACTION (C5).
 *
 * The evaluated agent's structured answer travels as the FINAL visible `assistant/message` of a real
 * first-party DSH turn. This module reads ONE session by EXACT SessionId through DSH's OWN persistence,
 * selects the LAST assistant message, and parses it as the benchmark answer contract.
 *
 * WHY assistant TEXT AND NOT A TOOL CALL (§10.2/§10.4). The worker result tool carries a strict canonical
 * Work outcome; a benchmark answer is decision data, not a settlement. Assistant text is a surface DSH
 * already persists and the product already reads, so no Work authority is touched and no tool contract is
 * widened. The internal EvidenceRef (exact Work Event ids) stays in the oracle; the agent cites only the
 * model-visible citation handles it was actually delivered (§10.4).
 *
 * NOT a product component. PLAIN JAVASCRIPT (`.mjs`), bare node. Read-only over a TEST-OWNED sessions root.
 */
import { existsSync, lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { REAL_MODULES } from "../trajectory_p2e0/dsh-test-home.mjs";

/** §10.3: the answer contract the oracle accepts and the harness extracts — one schema, one place. */
export const BENCHMARK_ANSWER_SCHEMA_VERSION = 1;

/**
 * §10.7: find the ONE session file for an exact SessionId under a TEST-OWNED root, refusing to guess.
 * `lstat` failures and directories are skipped explicitly; a junction is never traversed for a match.
 */
export function findSessionFile(sessionsRoot, sessionId) {
  const matches = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry);
      let stat;
      try {
        stat = lstatSync(path);
      } catch {
        continue;
      }
      if (stat.isDirectory()) walk(path);
      else if (entry.includes("session.v") && entry.includes("jsonl") && path.includes(sessionId)) matches.push(path);
    }
  };
  walk(sessionsRoot);
  return matches.length === 1 ? matches[0] : null;
}

/**
 * §10.7: read ONE session's events by EXACT SessionId through the REAL installed DSH persistence (read-only).
 * The reader is created with the real installed modules because a process outside the DSH profile cannot
 * resolve the bare specifiers; reading touches no personal session (the root is test-owned).
 */
export async function readSessionEventsByExactId(input) {
  const { sessionsRoot, sessionId } = input;
  const base = pathToFileURL(`${join(REAL_MODULES, "@deepseek-ai")}/`).href;
  const { Context } = await import(`${base}cordis/lib/index.js`);
  const JsonlSessionPersistence = (await import(`${base}dsh-session-persistence-jsonl/lib/index.js`)).default;
  const { SessionId } = await import(`${base}dsh-session/lib/index.js`);
  const ctx = new Context();
  const fiber = await ctx.plugin(JsonlSessionPersistence, { root: sessionsRoot, compression: "zstd" });
  try {
    const handle = await ctx.sessionPersistence.open(SessionId(sessionId), "read");
    const read = await handle.read(0, undefined);
    return read.events;
  } finally {
    await fiber?.dispose?.();
  }
}

/** The joined text of an `assistant/message` event's text blocks. */
export function assistantTextOf(event) {
  const content = event?.data?.message?.content ?? event?.data?.content ?? [];
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block !== null && typeof block === "object" && block.type === "text")
    .map((block) => block.text)
    .join("");
}

/**
 * §10.3/§10.7: EXTRACT the benchmark answer from a session's events.
 *
 * Returns the LAST assistant message's parsed JSON, with the raw text and the extraction provenance so the
 * caller can prove exactly which bytes were scored. A missing message, a non-JSON body or an unparsable
 * object is a FAILURE, never a silent default (§10.6).
 */
export function extractBenchmarkAnswer(events) {
  const assistantMessages = [];
  for (const event of events) {
    if (event?.type !== "assistant/message") continue;
    assistantMessages.push({ seq: event.seq, text: assistantTextOf(event) });
  }
  if (assistantMessages.length === 0) return { ok: false, detail: "no assistant/message was persisted for this session", assistantMessageCount: 0 };
  const last = assistantMessages[assistantMessages.length - 1];
  if (typeof last.text !== "string" || last.text.trim() === "") return { ok: false, detail: "the final assistant message carries no text", assistantMessageCount: assistantMessages.length };
  let parsed;
  try {
    parsed = JSON.parse(last.text);
  } catch (error) {
    return { ok: false, detail: `the final assistant message is not JSON: ${error instanceof Error ? error.message : String(error)}`, assistantMessageCount: assistantMessages.length, rawText: last.text };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, detail: "the final assistant message is not a JSON object", assistantMessageCount: assistantMessages.length, rawText: last.text };
  return {
    ok: true,
    answer: parsed,
    rawText: last.text,
    bytes: Buffer.byteLength(last.text, "utf8"),
    seq: last.seq,
    assistantMessageCount: assistantMessages.length,
  };
}
