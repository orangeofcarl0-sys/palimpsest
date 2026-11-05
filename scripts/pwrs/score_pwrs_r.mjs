/**
 * PWRS-R scorer. OUTSIDE the worlds; it reads durable evidence and the interruption snapshots.
 *
 * It reports the 7-fact business rubric SEPARATELY from the governance/continuation facts, and it
 * never claims a natural end that was not recorded. Reuse is measured from the actual bytes present
 * at the interruption against the final package; a commit reference alone is not reuse.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { zstdDecompressSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const RUN = resolve(String(args.get("run") ?? ""));
if (RUN === "") throw new Error("--run is required");
const core = JSON.parse(readFileSync(join(RUN, "core.json"), "utf8"));
const COHORT = core.cohortId;

function rubricFor(text) {
  const lower = text.toLowerCase();
  const has900 = lower.includes("900");
  const rejects900 =
    !has900 ||
    /900[^.\n]{0,120}(not admissible|not allowed|excluded|cannot|ineligible|superseded|not usable)/u.test(lower) ||
    /(not admissible|not allowed|exclude|cannot use|ineligible)[^.\n]{0,120}900/u.test(lower);
  const criteria = {
    package_present: text.length > 200,
    both_sites: lower.includes("site a") && lower.includes("site b"),
    measured_700mm_used: /700\s*mm/u.test(lower),
    baseline_900mm_rejected: rejects900,
    coastal_claim_not_accepted:
      /(2024|2026)/u.test(lower) &&
      /(not current|not a current|no (?:current )?certificate|unverified|not on file|expected)/u.test(lower),
    cost_and_schedule: /(cost|budget)/u.test(lower) && /(schedule|timeline|lead time)/u.test(lower),
    risk_and_decision: /(risk|uncertainty)/u.test(lower) && /(decision|recommend)/u.test(lower),
  };
  return { criteria, passed: Object.values(criteria).filter(Boolean).length };
}

const sha = (text) => createHash("sha256").update(text).digest("hex");

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
      /* a magic inside a frame; keep looking */
    }
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sessionFiles(root) {
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
      else if (entry.endsWith(".jsonl.zstd") || entry.endsWith(".jsonl")) out.push(full);
    }
  }
  return out;
}

function callCounts(home) {
  const counts = {};
  for (const file of sessionFiles(join(home, "sessions"))) {
    let text;
    try {
      text = file.endsWith(".zstd") ? decodeFrames(readFileSync(file)) : readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\n/)) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event.type !== "tool/call") continue;
        const name = String(event.data?.name ?? "unknown");
        counts[name] = (counts[name] ?? 0) + 1;
      } catch {
        /* partial line */
      }
    }
  }
  return counts;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function readRows(databasePath, sql) {
  if (!existsSync(databasePath)) return [];
  const db = new DatabaseSync(databasePath);
  try {
    return db.prepare(sql).all();
  } finally {
    db.close();
  }
}

function markedRecords(databasePath, marker) {
  const records = [];
  const strings = (value, out = []) => {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) for (const item of value) strings(item, out);
    else if (typeof value === "object" && value !== null) for (const item of Object.values(value)) strings(item, out);
    return out;
  };
  for (const row of readRows(databasePath, "SELECT payload_json FROM project_journal_events ORDER BY seq")) {
    let payload;
    try {
      payload = JSON.parse(row.payload_json);
    } catch {
      continue;
    }
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch {
        continue;
      }
    }
    for (const text of strings(payload)) {
      const at = text.indexOf(marker);
      if (at < 0) continue;
      try {
        records.push(JSON.parse(text.slice(at + marker.length).trim()));
      } catch {
        /* unreadable */
      }
    }
  }
  return records;
}

function deliverableFiles(root) {
  const out = {};
  const dir = join(root, "deliverables");
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    try {
      out[name] = readFileSync(join(dir, name), "utf8");
    } catch {
      /* not a readable file */
    }
  }
  return out;
}

function gitShow(world, revision, path) {
  try {
    return execFileSync("git", ["-C", world, "cat-file", "blob", `${revision}:${path}`], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

function latestPackage(condition, world, state) {
  const canonical = deliverableFiles(world)["package.md"];
  if (canonical !== undefined && canonical.length > 0) {
    return { text: canonical, source: "CANONICAL_WORKTREE", commit: null, path: "deliverables/package.md" };
  }
  if (state !== null) {
    const rows = readRows(join(state, "palimpsest.sqlite"), "SELECT attempt_id, state, report_json FROM attempts ORDER BY last_event_id DESC");
    for (const row of rows) {
      if (String(row.state) !== "COMPLETED" || row.report_json === null) continue;
      try {
        const report = JSON.parse(Buffer.from(row.report_json).toString("utf8"));
        const commit = report.result_commit;
        if (typeof commit !== "string" || commit === "") continue;
        const text = gitShow(world, commit, "deliverables/package.md");
        if (text !== null && text.length > 0) {
          return { text, source: "RESULT_COMMIT", commit, path: "deliverables/package.md", attemptId: String(row.attempt_id) };
        }
      } catch {
        continue;
      }
    }
  }
  const worldsRoot = join(world, ".palimpsest", "worlds");
  if (existsSync(worldsRoot)) {
    for (const name of readdirSync(worldsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("attempt-"))
      .map((entry) => entry.name)) {
      const path = join(worldsRoot, name, "deliverables", "package.md");
      if (!existsSync(path)) continue;
      const text = readFileSync(path, "utf8");
      if (text.length > 0) return { text, source: "ATTEMPT_WORLD", commit: null, path: join(".palimpsest", "worlds", name, "deliverables", "package.md") };
    }
  }
  return { text: "", source: "ABSENT", commit: null, path: null };
}

function longestInterruptionText(snapshot) {
  if (snapshot === null) return { text: "", source: null };
  const candidates = [];
  for (const [name, text] of Object.entries(snapshot.canonical?.deliverables ?? {})) {
    candidates.push({ text, source: `canonical/${name}` });
  }
  for (const world of snapshot.retainedWorlds ?? []) {
    for (const [name, text] of Object.entries(world.deliverables ?? {})) {
      candidates.push({ text, source: `${world.name}/${name}` });
    }
  }
  candidates.sort((left, right) => right.text.length - left.text.length);
  return candidates[0] ?? { text: "", source: null };
}

function overlap(finalText, beforeText) {
  const lines = (text) =>
    text
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length >= 20);
  const before = [...new Set(lines(beforeText))];
  if (before.length === 0) return { beforeLines: 0, carriedLines: 0, carriedRatio: null };
  const finalSet = new Set(lines(finalText));
  const carried = before.filter((line) => finalSet.has(line));
  return { beforeLines: before.length, carriedLines: carried.length, carriedRatio: Number((carried.length / before.length).toFixed(3)) };
}

const result = { schema: "pwrs-r-score/v1", cohortId: COHORT, generatedAt: new Date().toISOString(), conditions: {} };

for (const condition of core.conditions) {
  const world = core.worlds[condition];
  const state = core.states?.[condition] ?? null;
  const sessions = core.sessions.filter((session) => session.condition === condition);
  const sessionFacts = sessions.map((session) => {
    const run = readJson(join(session.out, "run.json"));
    return {
      sessionId: session.id,
      index: session.index,
      killedBy: run?.killedBy ?? null,
      exitCode: run?.exitCode ?? null,
      stopped: run?.stopped ?? null,
      natural: run?.natural ?? null,
      totalTokens: run?.usage?.totalTokens ?? null,
      maxTokens: session.maxTokens,
      calls: callCounts(session.home),
    };
  });
  const snapshot = readJson(join(RUN, "out", `interruption-${condition}.json`));
  const final = latestPackage(condition, world, state);
  const before = longestInterruptionText(snapshot);
  const governance =
    state === null
      ? null
      : {
          tasks: readRows(join(state, "palimpsest.sqlite"), "SELECT task_id, state FROM tasks ORDER BY task_id").map((row) => ({
            taskId: String(row.task_id),
            state: String(row.state),
          })),
          attempts: readRows(join(state, "palimpsest.sqlite"), "SELECT attempt_id, task_id, state, report_json FROM attempts ORDER BY last_event_id").map((row) => {
            let resultCommit = null;
            try {
              resultCommit = JSON.parse(Buffer.from(row.report_json).toString("utf8")).result_commit ?? null;
            } catch {
              resultCommit = null;
            }
            return { attemptId: String(row.attempt_id), taskId: row.task_id === null ? null : String(row.task_id), state: String(row.state), resultCommit };
          }),
          promotions: readRows(join(state, "palimpsest.sqlite"), "SELECT promotion_id, state FROM promotions").map((row) => ({
            promotionId: String(row.promotion_id),
            state: String(row.state),
          })),
          relay: markedRecords(join(state, "journal.sqlite"), "<!-- pc1-execution-relay:v1 -->"),
          episodes: markedRecords(join(state, "journal.sqlite"), "<!-- pc1-episode-conclusion:v1 -->").map((record) => ({
            intent: record.intent,
            recordedAt: record.recordedAt,
            artifacts: record.artifacts,
            artifactStates: record.check?.artifacts ?? [],
          })),
        };
  result.conditions[condition] = {
    rubric: rubricFor(final.text),
    final: {
      source: final.source,
      commit: final.commit,
      path: final.path,
      bytes: final.text.length,
      sha256: final.text.length === 0 ? null : sha(final.text),
    },
    interruption: {
      exists: snapshot !== null,
      at: snapshot?.at ?? null,
      canonicalHead: snapshot?.canonical?.head ?? null,
      canonicalStatus: snapshot?.canonical?.status ?? "",
      deliverables: Object.keys(snapshot?.canonical?.deliverables ?? {}),
      retainedWorlds: (snapshot?.retainedWorlds ?? []).map((entry) => ({
        name: entry.name,
        head: entry.head,
        subject: entry.subject,
        status: entry.status,
        deliverables: Object.keys(entry.deliverables ?? {}),
      })),
      longestTextSource: before.source,
      longestTextBytes: before.text.length,
    },
    reuse: overlap(final.text, before.text),
    sessions: sessionFacts,
    governance,
  };
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
