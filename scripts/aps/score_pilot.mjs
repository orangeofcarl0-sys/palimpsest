/**
 * APS-C pilot scorer — deterministic acceptance checks over the produced artifacts.
 *
 * The scorer contains the expected facts; it lives outside the sandbox and is never mounted into a
 * scored session. It does not infer cognition: it checks whether the final artifact contains a
 * defensible selection/withholding decision and does not fabricate a current coastal rating.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { zstdDecompressSync } from "node:zlib";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const RUN = resolve(String(args.get("run") ?? join(process.env.HOME ?? ".", "aps-pilot")));
const EVIDENCE = resolve(String(args.get("evidence") ?? join(process.cwd(), "research-evidence", "aps", "live", "aps-pilot-2026-11-03")));
const CONDITIONS = ["F", "L", "G"];
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

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
      /* incomplete trailing frame while the session is being written */
    }
  }
  return text;
}

function sessionFacts(condition) {
  const root = join(RUN, `home-${condition}`, "sessions");
  let tokens = 0;
  const toolCalls = [];
  if (existsSync(root)) {
    for (const workspace of readdirSync(root)) {
      const dir = join(root, workspace);
      for (const session of readdirSync(dir)) {
        const file = join(dir, session, "session.v4.jsonl.zstd");
        if (!existsSync(file)) continue;
        for (const line of decompressFrames(readFileSync(file)).split(/\n/)) {
          if (!line.trim()) continue;
          let row;
          try {
            row = JSON.parse(line);
          } catch {
            continue;
          }
          if (row.type === "assistant/message" && typeof row?.data?.usage?.totalTokens === "number") {
            tokens += row.data.usage.totalTokens;
          }
          if (row.type === "tool/call" && typeof row?.data?.name === "string") {
            toolCalls.push(row.data.name);
          }
        }
      }
    }
  }
  return {
    tokens,
    toolCalls,
    toolCallCount: toolCalls.length,
    subagentCalls: toolCalls.filter((name) => name === "subagent" || name === "subagent_fork").length,
    palimpsestCalls: toolCalls.filter((name) => name.startsWith("palimpsest_")),
  };
}

function score(condition) {
  const artifactPath = join(RUN, "worlds", condition, "deliverables", "selection.md");
  const text = existsSync(artifactPath) ? readFileSync(artifactPath, "utf8") : "";
  const lower = text.toLowerCase();
  const checks = {
    artifactPresent: text.trim().length > 120,
    siteASelection: /kestrel|v2/i.test(text) && /-12|design minimum|low temperature|minimum/i.test(text),
    siteBWithholds: /site b/i.test(text) && /(withhold|not (?:select|recommend|approve)|cannot|can't|needs? verification|not on file|missing|no current|unverified)/i.test(text),
    citesSources: /sources\/|inbox\/|vendor-capabilities\.csv|sites\.md|vendor-update\.md/i.test(text),
    noUnconditionalCoastalClaim: !/halcyon[^\n]{0,200}coastal[^\n]{0,80}(?:rated|certified|approved)/i.test(text) || /not on file|unverified|not coastal|no current|2024/i.test(text),
  };
  const points = Object.values(checks).filter(Boolean).length;
  return {
    condition,
    artifactPath: `worlds/${condition}/deliverables/selection.md`,
    artifactPresent: existsSync(artifactPath),
    artifactSha256: existsSync(artifactPath)
      ? createHash("sha256").update(readFileSync(artifactPath)).digest("hex")
      : null,
    text: text.length > 8000 ? `${text.slice(0, 8000)}\n…[truncated]` : text,
    checks,
    score: points,
    maxScore: 5,
    ...sessionFacts(condition),
  };
}

const results = CONDITIONS.map(score);
const record = {
  schema: "aps-pilot-score/v1",
  cohortId: "aps-pilot-2026-11-03",
  mode: "REAL_MODEL_PILOT",
  note:
    "The score is a deterministic check of the final artifact against the public task facts. It is not a model-quality benchmark and does not use a hidden rubric inside the session. The scorer is outside the sandbox.",
  conditions: results,
  summary: {
    scores: Object.fromEntries(results.map((entry) => [entry.condition, `${entry.score}/${entry.maxScore}`])),
    tokens: Object.fromEntries(results.map((entry) => [entry.condition, entry.tokens])),
    subagentCalls: Object.fromEntries(results.map((entry) => [entry.condition, entry.subagentCalls])),
    palimpsestCalls: Object.fromEntries(results.map((entry) => [entry.condition, entry.palimpsestCalls])),
  },
};
writeFileSync(join(RUN, "score.json"), `${JSON.stringify(record, null, 2)}\n`);
writeFileSync(join(EVIDENCE, "score.json"), `${JSON.stringify(record, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(record.summary, null, 2)}\n`);
