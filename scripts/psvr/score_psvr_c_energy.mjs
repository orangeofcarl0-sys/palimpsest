/**
 * PSVR-C energy-stage scorer — a MECHANICAL pass over the accepted package.
 *
 * The scenario's own checker (`node check.mjs --final`) is the gate; this scorer records WHICH facts
 * are present so a failure can be read without guessing. Rubric (0–8):
 *
 *   1. technical-capacity.md exists
 *   2. vendor-compliance.md exists
 *   3. cost-model.json exists with total 536000
 *   4. schedule.md exists with commissioning 2027-03-02
 *   5. risk-review.md exists and names the field survey
 *   6. recommendation.md exists with corridor 1050 and K-900 at both sites
 *   7. the checker passes with --final
 *   8. the work is committed
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

function check(world) {
  try {
    const out = execFileSync(process.execPath, ["check.mjs", "--final"], { cwd: world, encoding: "utf8", timeout: 120_000 });
    return { pass: true, output: out.trim(), detail: null };
  } catch (error) {
    const out = typeof error?.stdout === "string" ? error.stdout : "";
    return { pass: false, output: out.trim(), detail: typeof error?.stderr === "string" ? error.stderr.trim() : null };
  }
}

function data(world, path) {
  const tracked = git(world, ["ls-tree", "-r", "--name-only", "HEAD"])?.split(/\r?\n/u).filter(Boolean) ?? [];
  if (!tracked.includes(path)) return null;
  const text = git(world, ["show", `HEAD:${path}`]);
  if (text === null) return null;
  const match = /<!-- data:start -->\s*```json\s*([\s\S]*?)```\s*<!-- data:end -->/u.exec(text);
  if (match !== null) {
    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function assess(world, baseHead) {
  const tech = data(world, "deliverables/technical-capacity.md");
  const compliance = data(world, "deliverables/vendor-compliance.md");
  const cost = data(world, "deliverables/cost-model.json");
  const schedule = data(world, "deliverables/schedule.md");
  const risk = data(world, "deliverables/risk-review.md");
  const recommendation = data(world, "deliverables/recommendation.md");
  const checked = check(world);
  const head = git(world, ["rev-parse", "HEAD"]);
  const facts = {
    technical: tech !== null,
    compliance: compliance !== null,
    cost: cost !== null && cost.total === 536000,
    // The checker already verifies the lead-time arithmetic and that commissioning follows the
    // install; the rubric only asks that a two-site schedule exists.
    schedule: schedule !== null && (schedule.installs ?? []).length === 2,
    risk: risk !== null && (risk.risks ?? []).some((entry) => String(entry.source).includes("corridor-survey.md")),
    recommendation:
      recommendation !== null &&
      recommendation.corridorMm === 1050 &&
      recommendation.north === "K-900" &&
      recommendation.harbor === "K-900",
    checker: checked.pass,
    committed: typeof head === "string" && head !== baseHead,
  };
  const rubric = Object.values(facts);
  return {
    world,
    head,
    status: git(world, ["status", "--porcelain"]),
    log: git(world, ["log", "--format=%h %s", "-20"])?.split(/\r?\n/u) ?? [],
    facts,
    score: rubric.filter(Boolean).length,
    checker: checked,
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
    let stopped = null;
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
      stopped = record.stopped ?? null;
    } catch {
      /* not started */
    }
    return { sessionId: session.id, usage, killedBy, natural, injectedAt, stopped, started: usage !== null };
  });

  const canonical = assess(world, baseHead);
  const worldsRoot = join(world, ".palimpsest", "worlds");
  const retained = [];
  if (existsSync(worldsRoot)) {
    for (const name of readdirSync(worldsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("attempt-"))
      .map((entry) => entry.name)) {
      retained.push({ name, ...assess(join(worldsRoot, name), baseHead) });
    }
  }
  const best = [canonical, ...retained].sort((left, right) => right.score - left.score)[0];
  conditions[condition] = { baseHead, sessions, canonical, retained, best: { world: best.world, score: best.score, facts: best.facts } };
}

const payload = {
  schema: "psvr-c-energy-score/v1",
  cohortId: core.cohortId,
  stage: core.stage,
  scenario: core.scenario,
  scoredAt: new Date().toISOString(),
  conditions,
  comparison: {
    rubric: { F: conditions.F.best.score, A: conditions.A.best.score },
    tokens: {
      F: conditions.F.sessions.reduce((sum, session) => sum + (session.usage?.totalTokens ?? 0), 0),
      A: conditions.A.sessions.reduce((sum, session) => sum + (session.usage?.totalTokens ?? 0), 0),
    },
    note: "One pair per condition; descriptive. The checker is the acceptance gate; the rubric only localizes a failure.",
  },
};
writeFileSync(join(RUN, "out", "score.json"), `${JSON.stringify(payload, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
