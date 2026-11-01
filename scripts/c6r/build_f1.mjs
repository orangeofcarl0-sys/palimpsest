/**
 * C6-R3 — fair native-DSH F1 world and mechanical equivalence audit.
 *
 * The F world is a plain Git + Markdown workspace. It carries the SAME facts as the P world:
 * goal, requirements, accepted historical deliverables, journal findings, READY work, T1 inbox,
 * authorization rules and reference sources. The HANDOFF is generated from the P state, so the
 * comparison is not a hand-written approximation.
 *
 * It deliberately does NOT contain the expected conclusion, the Site B invalidation, a
 * recommendation, or the evaluator's rubric.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { materializeInboxAsOf, T1, treeDigest } from "./staging.mjs";

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found === undefined ? fallback : found.slice(prefix.length);
}
const P1_RUN = arg("p1-run", "");
const RUN = arg("run", "");
const SCENARIO = arg("scenario", join(import.meta.dirname, "..", "cog6", "scenario"));
if (P1_RUN === "" || RUN === "") {
  process.stderr.write("usage: node build_f1.mjs --p1-run=<dir> --run=<dir>\n");
  process.exit(2);
}

const p1 = JSON.parse(readFileSync(join(P1_RUN, "p1", "initial-state.json"), "utf8"));
const F1 = join(RUN, "f1");
const WORLD = join(F1, "world");
const INBOX = join(F1, "inbox");
rmSync(F1, { recursive: true, force: true });
mkdirSync(WORLD, { recursive: true });

const git = (args) => execFileSync("git", args, { cwd: WORLD, encoding: "utf8" }).trim();
const sha = (value) => createHash("sha256").update(value).digest("hex");

cpSync(join(SCENARIO, "sources"), join(WORLD, "sources"), { recursive: true });
cpSync(join(SCENARIO, "package.json"), join(WORLD, "package.json"));
cpSync(join(SCENARIO, "verify.mjs"), join(WORLD, "verify.mjs"));
git(["init", "-q"]);
git(["config", "user.email", "test-owned@c6r.invalid"]);
git(["config", "user.name", "C6-R test-owned"]);
git(["add", "."]);
git(["commit", "-q", "-m", "seed: Sablewick programme pack (canonical data before the 2026-02-10 bulletin)"]);

/* Historical accepted deliverables are copied from the P project head: identical facts, plain files. */
for (const path of ["deliverables/technical-fit.md", "deliverables/cost-schedule.md"]) {
  const text = execFileSync("git", ["show", `${p1.projectHead}:${path}`], { cwd: p1.world, encoding: "utf8" });
  mkdirSync(join(WORLD, "deliverables"), { recursive: true });
  writeFileSync(join(WORLD, path), text);
}
git(["add", "deliverables"]);
git(["commit", "-q", "-m", "accept: technical-fit and cost-schedule (historical findings)"]);

const journal = p1.snapshot.journal;
const negative = journal.find((entry) => entry.kind === "NEGATIVE_RESULT");
const question = journal.find((entry) => entry.kind === "OPEN_QUESTION");
const opportunity = journal.find((entry) => entry.kind === "OPPORTUNITY");
const ready = p1.snapshot.tasks.find((task) => task.state === "READY");

const visible = p1.inboxVisible.visibleEvents;
const handoff = `# Sablewick community battery programme — handoff

This workspace is the programme repository. The historical accepted findings are ordinary files in
\`deliverables/\`; the programme's working notes are below. The observation time for this task is
**2026-02-10 09:05 UTC**.

## Goal

${p1.snapshot.goal}

## Requirements

${p1.snapshot.requirements.map((requirement) => `- **${requirement.requirement_id}** (${requirement.priority}): ${requirement.statement}`).join("\n")}

## Accepted historical findings

- \`deliverables/technical-fit.md\` — ${sha(readFileSync(join(WORLD, "deliverables", "technical-fit.md")))} — the accepted technical selection from the current capability data.
- \`deliverables/cost-schedule.md\` — ${sha(readFileSync(join(WORLD, "deliverables", "cost-schedule.md")))} — the accepted cost and schedule envelope, including the 8% contingency.

Both were accepted before this observation time. Their content is historical; it is not automatically
current.

## Journal notes

### Negative result — ${negative?.title ?? ""}

${negative === undefined ? "" : "A 2023 cold-start failure means V2 is not suitable below -5 C. The finding remains valid and is not superseded by the 2026 supplier bulletins."}

### Open question — ${question?.title ?? ""}

${question === undefined ? "" : "The Solaris cold-weather certificate has been promised but no document, number, issuing body or test standard is on file. It is unverified and does not change a published minimum."}

### Opportunity — ${opportunity?.title ?? ""}

Status: **${opportunity?.resolution?.status ?? "OPEN"}**. ${opportunity?.resolution?.detail ?? ""}

## Next work

The current task is \`${ready?.taskId ?? "technical-refresh"}\` and it is READY.

- Objective: ${ready?.objective ?? ""}
- Write path: \`${ready?.writePaths?.[0] ?? "deliverables/technical-refresh.md"}\`
- Required artifact: \`${ready?.writePaths?.[0] ?? "deliverables/technical-refresh.md"}\`

## Inbox as of the observation time

The inbox is the directory named in the task, outside this repository. These are the items that have
arrived by 2026-02-10 09:05 UTC:

${visible.map((event) => `- \`${event.item}\` — ${event.kind} — sha256 \`${event.sha256}\` — ${event.status}`).join("\n")}

These are external, unaccepted items. Read them. Do not treat an unaccepted item as accepted
programme data. Items that have not arrived by the observation time are not part of this task.

## Authorization

- Only an independent operator may accept external source content into the canonical programme data.
- Changing the goal or a binding requirement requires a separate, explicit operator decision.
- You may investigate, propose and plan. You may not approve your own proposal, accept a source, or change the goal or requirements.
- A candidate that arrives after the observation time is not available to this task.

## Working rules

- Work only inside this repository and the inbox named in the task.
- Use Git and Markdown. This workspace has no Palimpsest tools.
- Record a proposal as a normal Markdown file (\`proposal.md\`) and leave the canonical sources unchanged.
`;
writeFileSync(join(WORLD, "HANDOFF.md"), handoff);
git(["add", "HANDOFF.md"]);
git(["commit", "-q", "-m", "handoff: programme state at 2026-02-10 09:05 UTC"]);

const staged = materializeInboxAsOf({ source: join(SCENARIO, "inbox"), observationTime: T1, destination: INBOX });

const p = {
  goal: p1.snapshot.goal,
  requirements: p1.snapshot.requirements.map((requirement) => `${requirement.requirement_id}: ${requirement.statement}`),
  deliverables: ["technical-fit.md", "cost-schedule.md"].map((name) => ({
    name,
    digest: sha(readFileSync(join(WORLD, "deliverables", name))),
  })),
  ready: {
    taskId: ready?.taskId ?? null,
    objective: ready?.objective ?? null,
    writePaths: ready?.writePaths ?? [],
  },
  journal: journal.map((entry) => ({ kind: entry.kind, title: entry.title, resolution: entry.resolution?.status ?? null })),
  inboxVisibleSetDigest: p1.inboxVisible.visibleSetDigest,
  /* Use the SAME tree-digest function for both sides; the rig's own digestTree is a different
     encoding and would report a false confounder on identical trees. */
  sourceTreeDigest: treeDigest(join(p1.world, "sources")),
  observationTime: T1,
};
const fJournal = [
  {
    kind: "NEGATIVE_RESULT",
    title: handoff.match(/### Negative result — ([^\n]+)/u)?.[1] ?? null,
    resolution: null,
  },
  {
    kind: "OPEN_QUESTION",
    title: handoff.match(/### Open question — ([^\n]+)/u)?.[1] ?? null,
    resolution: null,
  },
  {
    kind: "OPPORTUNITY",
    title: handoff.match(/### Opportunity — ([^\n]+)/u)?.[1] ?? null,
    resolution: handoff.match(/Status: \*\*([A-Z_]+)\*\*/u)?.[1] ?? null,
  },
];
const f = {
  goal: handoff.match(/## Goal\n\n([^\n]+)/u)?.[1] ?? null,
  requirements: handoff
    .split("## Requirements\n\n")[1]
    ?.split("\n\n")[0]
    ?.split("\n")
    .map((line) => line.replace(/^- \*\*(R\d+)\*\* \([^)]*\): /u, "$1: ")) ?? [],
  deliverables: ["technical-fit.md", "cost-schedule.md"].map((name) => ({
    name,
    digest: sha(readFileSync(join(WORLD, "deliverables", name))),
  })),
  ready: {
    taskId: handoff.match(/The current task is `([^`]+)`/u)?.[1] ?? null,
    objective: handoff.match(/- Objective: ([^\n]+)/u)?.[1] ?? null,
    writePaths: [handoff.match(/- Write path: `([^`]+)`/u)?.[1] ?? null],
  },
  journal: fJournal,
  inboxVisibleSetDigest: staged.visibleSetDigest,
  sourceTreeDigest: treeDigest(join(WORLD, "sources")),
  observationTime: T1,
};

const dimensions = [
  { name: "goal", p: p.goal, f: f.goal },
  { name: "requirements", p: p.requirements, f: f.requirements },
  { name: "historical_deliverables", p: p.deliverables, f: f.deliverables },
  { name: "ready_work", p: p.ready, f: f.ready },
  { name: "journal_facts", p: p.journal, f: f.journal },
  { name: "inbox_visible_set", p: p.inboxVisibleSetDigest, f: f.inboxVisibleSetDigest },
  { name: "source_tree", p: p.sourceTreeDigest, f: f.sourceTreeDigest },
  { name: "observation_time", p: p.observationTime, f: f.observationTime },
].map((dimension) => ({
  ...dimension,
  same: JSON.stringify(dimension.p) === JSON.stringify(dimension.f),
}));
const confounders = dimensions.filter((dimension) => !dimension.same).map((dimension) => dimension.name);
const equivalence = {
  schema: "c6r-equivalence/v1",
  at: new Date().toISOString(),
  p1Run: P1_RUN,
  f1Run: RUN,
  observationTime: T1,
  dimensions,
  confounders,
  equivalent: confounders.length === 0,
  representationDifference:
    "P uses ProjectIR/Work/Journal state through the Palimpsest host; F uses Git commits, Markdown deliverables and HANDOFF.md. The facts compared here are identical.",
};
writeFileSync(join(F1, "equivalence.json"), JSON.stringify(equivalence, null, 2));

const head = git(["rev-parse", "HEAD"]);
writeFileSync(
  join(F1, "initial-state.json"),
  JSON.stringify(
    {
      world: WORLD,
      inbox: INBOX,
      head,
      projectHead: head,
      sourceTreeDigest: f.sourceTreeDigest,
      visibleSetDigest: staged.visibleSetDigest,
      handoffDigest: sha(readFileSync(join(WORLD, "HANDOFF.md"))),
      equivalence: equivalence.equivalent,
    },
    null,
    2,
  ),
);
process.stdout.write(
  `${JSON.stringify({ world: WORLD, head, visibleSetDigest: staged.visibleSetDigest, equivalent: equivalence.equivalent, confounders }, null, 2)}\n`,
);
if (!equivalence.equivalent) process.exit(1);
