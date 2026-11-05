/**
 * PSVR-C scorer — a MECHANICAL pass over what each condition left, after the run.
 *
 * It reads the worlds and the session records only. It does not know what the prompt said and it does
 * not repair anything. The rubric is the scenario's own seven facts, each one checkable in the tree:
 *
 *   1. the proto declares `StreamReadings ... returns (stream Reading)`
 *   2. a gRPC server exists
 *   3. a client exists and consumes the stream incrementally (a per-frame callback or an async
 *      iterator over the frames)
 *   4. an integration test exists
 *   5. the suite is green (tests > 0, 0 failures)
 *   6. the work is committed (the head moved past the base)
 *   7. the streaming requirement is actually met by the implementation (1+2+3 and green)
 *
 * It also records the token usage and whether session 1 was interrupted at the milestone.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const RUN = resolve(String(args.get("run") ?? ""));
const core = JSON.parse(readFileSync(join(RUN, "core.json"), "utf8"));

function git(cwd, argv) {
  try {
    return execFileSync("git", ["-C", cwd, ...argv], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }).trim();
  } catch {
    return null;
  }
}

function suite(world) {
  if (!existsSync(join(world, "package.json"))) return { tests: 0, pass: 0, fail: 0, error: "no package.json" };
  try {
    execFileSync(process.execPath, ["--test"], { cwd: world, stdio: "ignore", timeout: 180_000 });
    // Re-run capturing the summary for the counts.
    const out = execFileSync(process.execPath, ["--test"], { cwd: world, encoding: "utf8", timeout: 180_000 });
    const n = (re) => {
      const m = re.exec(out);
      return m === null ? null : Number(m[1]);
    };
    return { tests: n(/ℹ tests (\d+)/u), pass: n(/ℹ pass (\d+)/u), fail: n(/ℹ fail (\d+)/u), error: null };
  } catch (error) {
    const out = typeof error?.stdout === "string" ? error.stdout : "";
    const n = (re) => {
      const m = re.exec(out);
      return m === null ? null : Number(m[1]);
    };
    return { tests: n(/ℹ tests (\d+)/u), pass: n(/ℹ pass (\d+)/u), fail: n(/ℹ fail (\d+)/u), error: "the suite is not green" };
  }
}

function assess(world, baseHead) {
  const tracked = git(world, ["ls-tree", "-r", "--name-only", "HEAD"])?.split(/\r?\n/u).filter(Boolean) ?? [];
  const read = (path) => (tracked.includes(path) ? git(world, ["show", `HEAD:${path}`]) : null);
  const proto = read("proto/energy.proto");
  const server = read("service/grpc_server.js");
  const client = read("service/grpc_client.js");
  const integration = read("test/integration.test.js");
  const rest = read("test/rest.test.js");
  const head = git(world, ["rev-parse", "HEAD"]);
  const result = suite(world);
  const facts = {
    protoDeclaresStreaming: typeof proto === "string" && /rpc\s+StreamReadings\s*\([^)]*\)\s*returns\s*\(\s*stream\s+Reading\s*\)/u.test(proto),
    serverPresent: typeof server === "string",
    clientStreamsPerMessage: typeof client === "string" && /onReading|drained\.messages|for\s+await\s*\(|stream\.on\("data"/u.test(client),
    integrationPresent: typeof integration === "string",
    suiteGreen: (result.fail ?? 1) === 0 && (result.tests ?? 0) > 0,
    committed: typeof head === "string" && head !== baseHead,
    restPreserved: typeof rest === "string",
    inputArrived: existsSync(join(world, "updates", "2026-11-03", "compat-streaming.md")),
  };
  const rubric = [
    facts.protoDeclaresStreaming,
    facts.serverPresent,
    facts.clientStreamsPerMessage,
    facts.integrationPresent,
    facts.suiteGreen,
    facts.committed,
    facts.protoDeclaresStreaming && facts.serverPresent && facts.clientStreamsPerMessage && facts.suiteGreen,
  ];
  return {
    world,
    head,
    status: git(world, ["status", "--porcelain"]),
    log: git(world, ["log", "--format=%h %s", "-20"])?.split(/\r?\n/u) ?? [],
    facts,
    rubric: rubric.map((value, index) => ({ fact: index + 1, passed: value })),
    score: rubric.filter(Boolean).length,
    suite: result,
  };
}

const conditions = {};
for (const condition of ["F", "A"]) {
  const prepared = core.sessions.filter((entry) => entry.condition === condition).sort((left, right) => left.index - right.index);
  const world = prepared[0].world;
  const baseHead = core.heads[condition];
  const sessions = prepared.map((session) => {
    let usage = null;
    let killedBy = null;
    let natural = null;
    let injectedAt = null;
    try {
      usage = JSON.parse(readFileSync(join(session.out, "budget.json"), "utf8"));
    } catch {
      /* not started */
    }
    try {
      const record = JSON.parse(readFileSync(join(session.out, "run.json"), "utf8"));
      killedBy = record.killedBy ?? null;
      natural = record.natural ?? null;
      injectedAt = record.injectedAt ?? null;
    } catch {
      /* not started */
    }
    return { sessionId: session.id, usage, killedBy, natural, injectedAt, started: usage !== null };
  });

  const canonical = assess(world, baseHead);
  const worldsRoot = join(world, ".palimpsest", "worlds");
  const retained = [];
  if (existsSync(worldsRoot)) {
    for (const name of readdirSync(worldsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("attempt-"))
      .map((entry) => entry.name)) {
      const path = join(worldsRoot, name);
      retained.push({ name, ...assess(path, baseHead) });
    }
  }
  const best = [canonical, ...retained].sort((left, right) => right.score - left.score)[0];
  conditions[condition] = {
    baseHead,
    sessions,
    canonical,
    retained,
    best: { world: best.world, score: best.score, facts: best.facts, suite: best.suite },
  };
}

const payload = {
  schema: "psvr-c-score/v1",
  cohortId: core.cohortId,
  scoredAt: new Date().toISOString(),
  scenario: core.scenario ?? "grpc-migration",
  conditions,
  comparison: {
    rubric: { F: conditions.F.best.score, A: conditions.A.best.score },
    tokens: {
      F: conditions.F.sessions.reduce((sum, session) => sum + (session.usage?.totalTokens ?? 0), 0),
      A: conditions.A.sessions.reduce((sum, session) => sum + (session.usage?.totalTokens ?? 0), 0),
    },
    note: "One pair per condition; descriptive. A rubric fact is presence, not quality.",
  },
};
writeFileSync(join(RUN, "out", "score.json"), `${JSON.stringify(payload, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
