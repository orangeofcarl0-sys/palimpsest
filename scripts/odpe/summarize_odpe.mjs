/**
 * ODPE deterministic host summary — a MECHANICAL read of the run, not a score.
 *
 * It reports only facts it can read from durable state: Work rows, the context manifests the product
 * compiled, the worker pull telemetry, the project journal's relay/episode records, the canonical
 * Git tree and the retained world. No model judgement is inferred from them.
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
const RUN = resolve(String(args.get("run") ?? join(process.env.HOME ?? ".", "odpe-run")));
const WORLD = join(RUN, "world");
const STATE = join(RUN, "state");
const TASK = "billing-cutover";
const ARTIFACT = "deliverables/migration-plan.md";
const INPUT_PATH = "updates/2026-11-03/payload-measurement.md";

const git = (cwd, argv) => execFileSync("git", ["-C", cwd, ...argv], { encoding: "utf8" }).trim();
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
const attempts = readRows(orchestration, "SELECT attempt_id, task_id, state, report_json FROM attempts ORDER BY last_event_id").map((row) => {
  let report = null;
  try {
    const parsed = JSON.parse(Buffer.from(row.report_json).toString("utf8"));
    report = { resultCommit: parsed.result_commit ?? null, workerStatus: parsed.worker_status ?? null, changedFiles: parsed.changed_files ?? [] };
  } catch {
    report = null;
  }
  return { attemptId: String(row.attempt_id), taskId: row.task_id === null ? null : String(row.task_id), state: String(row.state), report };
});
const promotions = readRows(orchestration, "SELECT promotion_id, state, state_json FROM promotions ORDER BY rowid").map((row) => {
  let attemptId = null;
  try {
    attemptId = JSON.parse(Buffer.from(row.state_json).toString("utf8")).attempt_id ?? null;
  } catch {
    attemptId = null;
  }
  const attempt = attempts.find((entry) => entry.attemptId === attemptId);
  return { promotionId: String(row.promotion_id), state: String(row.state), taskId: attempt?.taskId ?? null, attemptId };
});

const contextManifests = readRows(orchestration, "SELECT manifest_id, task_id, manifest_json FROM context_manifests ORDER BY rowid").map((row) => {
  let manifest = null;
  try {
    manifest = JSON.parse(Buffer.from(row.manifest_json).toString("utf8"));
  } catch {
    manifest = null;
  }
  const inputs = Array.isArray(manifest?.inputs) ? manifest.inputs : [];
  return {
    manifestId: String(row.manifest_id),
    taskId: row.task_id === null ? null : String(row.task_id),
    inputObservation: manifest?.input_observation ?? null,
    inputPaths: inputs.map((entry) => entry.path),
    inputDigests: inputs.map((entry) => ({ path: entry.path, digest: entry.digest, bytes: entry.bytes, identity: entry.identity })),
  };
});

const workerPulls = [];
const workerLogs = join(RUN, "worker-logs");
if (existsSync(workerLogs)) {
  for (const name of readdirSync(workerLogs).filter((entry) => entry.endsWith(".log"))) {
    const text = readFileSync(join(workerLogs, name), "utf8");
    for (const line of text.split(/\r?\n/u)) {
      if (!line.startsWith("PALIMPSEST_WORKER_PULL ")) continue;
      try {
        workerPulls.push({ log: name, ...JSON.parse(line.slice("PALIMPSEST_WORKER_PULL ".length)) });
      } catch {
        workerPulls.push({ log: name, unparsed: true });
      }
    }
  }
}

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

const canonicalPath = join(WORLD, ARTIFACT);
const canonicalArtifact = existsSync(canonicalPath)
  ? {
      path: ARTIFACT,
      present: true,
      sha256: sha256(readFileSync(canonicalPath)),
      blobSha256: (() => {
        try {
          return sha256(execFileSync("git", ["-C", WORLD, "cat-file", "blob", `HEAD:${ARTIFACT}`]));
        } catch {
          return null;
        }
      })(),
      bytes: readFileSync(canonicalPath).length,
      committed: (() => {
        try {
          git(WORLD, ["cat-file", "-e", `HEAD:${ARTIFACT}`]);
          return true;
        } catch {
          return false;
        }
      })(),
      atHead: git(WORLD, ["rev-parse", "HEAD"]),
    }
  : { path: ARTIFACT, present: false, sha256: null, bytes: 0, committed: false, atHead: null };

const worlds = [];
const worldsRoot = join(WORLD, ".palimpsest", "worlds");
if (existsSync(worldsRoot)) {
  for (const name of readdirSync(worldsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("attempt-"))
    .map((entry) => entry.name)) {
    const path = join(worldsRoot, name);
    let head = null;
    let subject = null;
    const hasPlan = existsSync(join(path, ARTIFACT));
    try {
      head = git(path, ["rev-parse", "HEAD"]);
      subject = git(path, ["log", "-1", "--format=%s"]);
    } catch {
      head = null;
    }
    worlds.push({ name, path, head, subject, hasPlan });
  }
}

const canonicalText = canonicalArtifact.present ? readFileSync(canonicalPath, "utf8") : "";
const partialWorld = worlds.find((world) => world.hasPlan && !String(world.subject).includes("measured basis")) ?? null;
const partialText = partialWorld === null ? "" : readFileSync(join(partialWorld.path, ARTIFACT), "utf8");
const inputInHead = (() => {
  try {
    git(WORLD, ["cat-file", "-e", `HEAD:${INPUT_PATH}`]);
    return true;
  } catch {
    return false;
  }
})();

const summary = {
  schema: "odpe-host-summary/v1",
  run: RUN,
  projectId: "odpe",
  taskId: TASK,
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
      measuredCommitAt: stamp("measured-commit-at.txt"),
      finalizedAt: stamp("finalized-at.txt"),
      promotedAt: stamp("promoted-at.txt"),
    };
  })(),
  recovery: {
    attemptStateAfterKill: existsSync(join(RUN, "out", "attempt-state-after-kill.txt"))
      ? readFileSync(join(RUN, "out", "attempt-state-after-kill.txt"), "utf8").trim()
      : null,
    retainedWorldHeadBeforeSuccessor: existsSync(join(RUN, "out", "retained-world-head.txt"))
      ? readFileSync(join(RUN, "out", "retained-world-head.txt"), "utf8").trim()
      : null,
    retainedWorldSubjectBeforeSuccessor: existsSync(join(RUN, "out", "retained-world-subject.txt"))
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
  episodeRecords: episodes.map((record) => ({ conclusionId: record.conclusionId ?? null, intent: record.intent, recordedAt: record.recordedAt, artifacts: record.artifacts })),
  episodeRecordCount: episodes.length,
  /** Two identical conclusions can come from a stand-in session re-entry; the product records what it is told. */
  duplicateConclusionIds: episodes.length - new Set(episodes.map((record) => record.conclusionId)).size,
  contextManifests,
  workerPulls,
  input: {
    path: INPUT_PATH,
    canonicalPresentBeforePromotion: existsSync(join(RUN, "out", "canonical-status-after-input.txt")),
    recordedSha256: existsSync(join(RUN, "out", "input-sha256.txt"))
      ? (readFileSync(join(RUN, "out", "input-sha256.txt"), "utf8").trim().split(" ")[0] ?? null)
      : null,
    inCanonicalCommit: inputInHead,
    deliveredToAnAttempt: contextManifests.some((manifest) => manifest.inputPaths.includes(INPUT_PATH)),
  },
  canonicalArtifact,
  retainedWorld: partialWorld,
  reuse: {
    partialSha256: partialText === "" ? null : sha256(partialText),
    finalSha256: canonicalArtifact.sha256,
    partialIsNotFinal: partialText !== "" && canonicalText !== "" && sha256(partialText) !== sha256(canonicalText),
    measuredBasisPresent: canonicalText.includes("2.1 MiB"),
    streamingDecisionPresent: /client-streaming/iu.test(canonicalText),
    supersededAssumptionAbsent: !/unary gRPC method.*no streaming is needed/isu.test(canonicalText),
  },
  git: {
    head: git(WORLD, ["rev-parse", "HEAD"]),
    log: git(WORLD, ["log", "--format=%h %s", "-8"]).split(/\r?\n/u),
    status: git(WORLD, ["status", "--porcelain"]) === "" ? "clean" : "dirty",
  },
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
