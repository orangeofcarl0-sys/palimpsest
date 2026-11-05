#!/usr/bin/env node
/**
 * APS-C executable token-budget guard.
 *
 * A real failure mode in the prior programme: an authorization file was treated as permission while
 * nothing enforced its cumulative token ceiling at runtime. This process is the enforcement point.
 * It reads the DSH session streams, sums the usage the session actually reported, and terminates the
 * target process when the cap is exceeded. It is independent of the provider and of the model.
 *
 * Usage:
 *   node budget_guard.mjs --session-root <dir> --max-tokens <n> --target-pid <pid>
 *                         --ledger <path> [--stopped <path>] [--poll-ms 500]
 *                         [--reserve-tokens <n>]   # one-message buffer; stops below the ceiling
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { zstdDecompressSync } from "node:zlib";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const sessionRoot = resolve(String(args.get("session-root") ?? ""));
const maxTokens = Number(args.get("max-tokens") ?? "0");
/**
 * ALHS-C: the one-message buffer. The guard observes usage only AFTER a message completes, so a stop
 * at exactly `maxTokens` can overshoot by one message. A reserve stops at `maxTokens - reserve`, which
 * keeps the session (and the aggregate, when every allocation carries the same discipline) inside the
 * authorization. It is a ceiling, not a promise: the last in-flight message can still be billed.
 */
const reserveTokens = Number(args.get("reserve-tokens") ?? "0");
const softCeiling = maxTokens - reserveTokens;
const targetPid = Number(args.get("target-pid") ?? "0");
const ledgerPath = String(args.get("ledger") ?? "");
const stoppedPath = String(args.get("stopped") ?? "");
const pollMs = Math.max(100, Number(args.get("poll-ms") ?? "500"));

if (!Number.isSafeInteger(maxTokens) || maxTokens < 1) {
  process.stderr.write("budget_guard: --max-tokens must be a positive integer\n");
  process.exit(2);
}
if (!Number.isSafeInteger(reserveTokens) || reserveTokens < 0 || reserveTokens >= maxTokens) {
  process.stderr.write("budget_guard: --reserve-tokens must be a non-negative integer below --max-tokens\n");
  process.exit(2);
}
if (!Number.isSafeInteger(targetPid) || targetPid < 1) {
  process.stderr.write("budget_guard: --target-pid is required\n");
  process.exit(2);
}
if (ledgerPath === "") {
  process.stderr.write("budget_guard: --ledger is required\n");
  process.exit(2);
}

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

function filesUnder(root) {
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
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) stack.push(full);
      else if (stat.isFile() && (entry.endsWith(".jsonl") || entry.endsWith(".jsonl.zstd"))) out.push(full);
    }
  }
  return out;
}

function decompressFrames(bytes) {
  const offsets = [];
  let index = 0;
  while (true) {
    const at = bytes.indexOf(ZSTD_MAGIC, index);
    if (at < 0) break;
    offsets.push(at);
    index = at + 4;
  }
  let text = "";
  for (let frame = 0; frame < offsets.length; frame += 1) {
    const start = offsets[frame];
    const end = frame + 1 < offsets.length ? offsets[frame + 1] : bytes.length;
    try {
      text += zstdDecompressSync(bytes.subarray(start, end)).toString("utf8");
    } catch {
      // An incomplete trailing frame is expected while the session is being written.
    }
  }
  return text;
}

function readUsage() {
  let total = 0;
  const seen = new Set();
  const files = filesUnder(sessionRoot);
  for (const file of files) {
    let text;
    try {
      text = file.endsWith(".zstd")
        ? decompressFrames(readFileSync(file))
        : readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\n/)) {
      if (!line.trim()) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      if (row.type !== "assistant/message") continue;
      const usage = row?.data?.usage;
      const tokens = usage?.totalTokens;
      if (typeof tokens !== "number" || !Number.isSafeInteger(tokens) || tokens < 0) continue;
      const key = `${file}\u0000${String(row.seq ?? "")}\u0000${String(row.time ?? "")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      total += tokens;
    }
  }
  return { total, files: files.length };
}

function writeLedger(value) {
  writeFileSync(ledgerPath, `${JSON.stringify(value, null, 2)}\n`);
}

function stopTarget(reason) {
  const usage = readUsage();
  const stopped = {
    schema: "aps-budget-stop/v1",
    stoppedAt: new Date().toISOString(),
    reason,
    maxTokens,
    reserveTokens,
    softCeiling,
    totalTokens: usage.total,
    targetPid,
    sessionRoot,
  };
  writeLedger({
    schema: "aps-budget-ledger/v1",
    observedAt: stopped.stoppedAt,
    maxTokens,
    reserveTokens,
    softCeiling,
    totalTokens: usage.total,
    sessionFiles: usage.files,
    state: "STOPPED",
  });
  if (stoppedPath !== "") writeFileSync(stoppedPath, `${JSON.stringify(stopped, null, 2)}\n`);
  try {
    process.kill(targetPid, "SIGTERM");
  } catch {
    /* already gone */
  }
  setTimeout(() => {
    try {
      process.kill(targetPid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }, 2_000).unref();
}

let lastTotal = -1;
const timer = setInterval(() => {
  const usage = readUsage();
  if (usage.total !== lastTotal) {
    lastTotal = usage.total;
    writeLedger({
      schema: "aps-budget-ledger/v1",
      observedAt: new Date().toISOString(),
      maxTokens,
      reserveTokens,
      softCeiling,
      totalTokens: usage.total,
      sessionFiles: usage.files,
      state: usage.total > softCeiling ? "STOPPED" : "RUNNING",
    });
  }
  if (usage.total > softCeiling) {
    clearInterval(timer);
    stopTarget(
      reserveTokens === 0
        ? "the reported cumulative tokens exceeded the authorized ceiling"
        : `the reported cumulative tokens reached the reserved soft ceiling (${String(softCeiling)} = ${String(maxTokens)} - ${String(reserveTokens)} reserve)`,
    );
  }
}, pollMs);

process.on("SIGTERM", () => {
  clearInterval(timer);
  const usage = readUsage();
  writeLedger({
    schema: "aps-budget-ledger/v1",
    observedAt: new Date().toISOString(),
    maxTokens,
    reserveTokens,
    softCeiling,
    totalTokens: usage.total,
    sessionFiles: usage.files,
    state: "GUARD_TERMINATED",
  });
  process.exit(0);
});
