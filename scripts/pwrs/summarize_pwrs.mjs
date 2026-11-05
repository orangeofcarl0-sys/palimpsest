/**
 * PWRS deterministic host summary — a MECHANICAL read of the run, not a score.
 *
 * It reports only facts it can read from the durable state: Work rows, the project journal's relay
 * and episode records, the canonical Git tree, the retained world, and the actual bytes of the
 * retained partial and the accepted package. No model judgement is inferred from them.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const RUN = resolve(String(args.get("run") ?? join(process.env.HOME ?? ".", "pwrs-run")));
const WORLD = join(RUN, "world");
const STATE = join(RUN, "state");

const git = (cwd, argv) =>
  execFileSync("git", ["-C", cwd, ...argv], { encoding: "utf8" }).trim();
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function readRows(path, sql) {
  if (!existsSync(path)) return [];
  const db = new DatabaseSync(path);
  try {
    return db.prepare(sql).all();
  } finally {
    db.close();
  }
}

function strings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) strings(item, out);
  else if (typeof value === "object" && value !== null) for (const item of Object.values(value)) strings(item, out);
  return out;
}

function parseMarked(dbPath, marker) {
  const records = [];
  for (const row of readRows(dbPath, "SELECT payload_json FROM project_journal_events ORDER BY seq")) {
    let payload;
    try {
      payload = JSON.parse(row.payload_json);
    } catch {
      continue;
    }
    // Some journal rows carry the event as a JSON STRING; unwrap once so the marker body parses.
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
        /* an unreadable record is reported by its absence, never guessed */
      }
    }
  }
  return records;
}

const orchestration = join(STATE, "palimpsest.sqlite");
const journal = join(STATE, "journal.sqlite");

const tasks = readRows(orchestration, "SELECT task_id, state FROM tasks ORDER BY task_id").map((row) => ({
  taskId: String(row.task_id),
  state: String(row.state),
}));
const attempts = readRows(
  orchestration,
  "SELECT attempt_id, task_id, state, report_json FROM attempts ORDER BY last_event_id",
).map((row) => {
  let report = null;
  try {
    const parsed = JSON.parse(Buffer.from(row.report_json).toString("utf8"));
    report = {
      resultCommit: parsed.result_commit ?? null,
      workerStatus: parsed.worker_status ?? null,
      changedFiles: parsed.changed_files ?? [],
    };
  } catch {
    report = null;
  }
  return { attemptId: String(row.attempt_id), taskId: row.task_id === null ? null : String(row.task_id), state: String(row.state), report };
});
const promotions = readRows(
  orchestration,
  "SELECT promotion_id, state, state_json FROM promotions ORDER BY rowid",
).map((row) => {
  let attemptId = null;
  try {
    const state = JSON.parse(Buffer.from(row.state_json).toString("utf8"));
    attemptId = state.attempt_id ?? null;
  } catch {
    attemptId = null;
  }
  const attempt = attempts.find((entry) => entry.attemptId === attemptId);
  return { promotionId: String(row.promotion_id), state: String(row.state), taskId: attempt?.taskId ?? null, attemptId };
});

const relayRecords = parseMarked(journal, "<!-- pc1-execution-relay:v1 -->");
const episodes = parseMarked(journal, "<!-- pc1-episode-conclusion:v1 -->");
const latestEpisode = episodes.length === 0 ? null : episodes[episodes.length - 1];
const latestRelay = relayRecords.length === 0 ? null : relayRecords[relayRecords.length - 1];

const EPISODE_STATE = {
  DELIVER: "DELIVERED",
  WAIT_FOR_OPERATOR: "AWAITING_OPERATOR",
  WAIT_FOR_EXTERNAL_EVENT: "AWAITING_EXTERNAL_EVENT",
  REPLAN: "REPLANNING",
  CONTINUE: "CONTINUING",
  CHECKPOINT: "CHECKPOINT",
};
const canonicalPath = join(WORLD, "deliverables", "package.md");
const canonicalArtifact = existsSync(canonicalPath)
  ? {
      path: "deliverables/package.md",
      present: true,
      sha256: sha256(readFileSync(canonicalPath)),
      blobSha256: (() => { try { return sha256(execFileSync("git", ["-C", WORLD, "cat-file", "blob", "HEAD:deliverables/package.md"])); } catch { return null; } })(),
      bytes: readFileSync(canonicalPath).length,
      committed: (() => {
        try {
          git(WORLD, ["cat-file", "-e", "HEAD:deliverables/package.md"]);
          return true;
        } catch {
          return false;
        }
      })(),
      atHead: git(WORLD, ["rev-parse", "HEAD"]),
    }
  : { path: "deliverables/package.md", present: false, sha256: null, bytes: 0, committed: false, atHead: null };

const worlds = [];
const worldsRoot = join(WORLD, ".palimpsest", "worlds");
if (existsSync(worldsRoot)) {
  for (const name of readdirSync(worldsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("attempt-"))
    .map((entry) => entry.name)) {
    const path = join(worldsRoot, name);
    let head = null;
    let subject = null;
    const hasPartial = existsSync(join(path, "deliverables", "partial.md"));
    try {
      head = git(path, ["rev-parse", "HEAD"]);
      subject = git(path, ["log", "-1", "--format=%s"]);
    } catch {
      head = null;
    }
    worlds.push({ name, path, head, subject, hasPartial });
  }
}

const canonicalText = canonicalArtifact.present ? readFileSync(canonicalPath, "utf8") : "";
const partialWorld = worlds.find((world) => world.hasPartial) ?? null;
const partialText = partialWorld === null ? "" : readFileSync(join(partialWorld.path, "deliverables", "partial.md"), "utf8");

const summary = {
  schema: "pwrs-host-summary/v1",
  run: RUN,
  projectId: "pwrs",
  generatedAt: new Date().toISOString(),
  timeline: (() => {
    const stamp = (name) => {
      const path = join(RUN, "out", name);
      return existsSync(path) ? readFileSync(path, "utf8").trim() : null;
    };
    return {
      partialCommittedAt: stamp("partial-committed-at.txt"),
      killedAt: stamp("session-P1/killed-at.txt"),
      constraintArrivedAt: stamp("constraint-arrived-at.txt"),
      takeoverSettledAt: stamp("takeover-settled-at.txt"),
      promotedAt: stamp("promoted-at.txt"),
    };
  })(),
  recovery: {
    attemptStateAfterKill: existsSync(join(RUN, "out", "attempt-state-after-kill.txt"))
      ? readFileSync(join(RUN, "out", "attempt-state-after-kill.txt"), "utf8").trim()
      : null,
    retainedWorldHeadBeforeTakeover: existsSync(join(RUN, "out", "retained-world-head.txt"))
      ? readFileSync(join(RUN, "out", "retained-world-head.txt"), "utf8").trim()
      : null,
    retainedWorldSubjectBeforeTakeover: existsSync(join(RUN, "out", "retained-world-subject.txt"))
      ? readFileSync(join(RUN, "out", "retained-world-subject.txt"), "utf8").trim()
      : null,
  },
  tasks,
  attempts,
  promotions,
  relay: latestRelay,
  relayRecordCount: relayRecords.length,
  episode:
    latestEpisode === null
      ? { state: "OPEN", intent: null, conclusion: null }
      : { state: EPISODE_STATE[latestEpisode.intent] ?? "OPEN", intent: latestEpisode.intent, conclusion: latestEpisode },
  episodeRecords: episodes.map((record) => ({ intent: record.intent, recordedAt: record.recordedAt, artifacts: record.artifacts })),
  canonicalArtifact,
  retainedWorld: partialWorld,
  reuse: {
    partialSha256: partialText === "" ? null : sha256(partialText),
    finalSha256: canonicalArtifact.sha256,
    pricingInherited: canonicalText.includes("Unit price: 1200 EUR"),
    measuredBasisPresent: canonicalText.includes("700 mm"),
    supersededAssumptionAbsent: !/assumed to be 1200 mm/iu.test(canonicalText),
    reuseNotePresent: /inherited from the retained worker commit/iu.test(canonicalText),
  },
  git: {
    head: git(WORLD, ["rev-parse", "HEAD"]),
    log: git(WORLD, ["log", "--format=%h %s", "-6"]).split(/\r?\n/u),
    status: git(WORLD, ["status", "--porcelain"]) === "" ? "clean" : "dirty",
  },
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
