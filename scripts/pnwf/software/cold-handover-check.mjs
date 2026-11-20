/** Host-side acceptance, run inside a networkless container on the exact candidate. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

const checkout = process.cwd();
const archive = join(checkout, "research-evidence/pnwf-software/2026-11-19/autonomous-continuity/live");
const accepted = JSON.parse(readFileSync(join(archive, "acceptance.json"), "utf8"));
const restored = "/tmp/fleet-restored";
const git = (repo, ...args) => execFileSync("git", ["-C", repo, ...args]);
const sha256 = value => createHash("sha256").update(value).digest("hex");
const results = [];
const record = (name, success) => results.push({ name, pass: Boolean(success) });
execFileSync(process.execPath, ["scripts/pnwf/software/autonomy-archive.mjs", `--verify=${archive}`, `--restore=${restored}`],
  { stdio: ["ignore", "inherit", "inherit"] });
const file = join(restored, "profile.json");
const profile = JSON.parse(readFileSync(file));
const { launchDeployment, loadDeploymentProfile } = await import(pathToFileURL(join(checkout, "dist/src/advanced.js")));
const job = loadDeploymentProfile(file);
for (let iteration = 1; iteration <= 2; iteration++) {
  const deployment = launchDeployment(job);
  try {
    const tool = deployment.installed.tools.find(t => t.name === "palimpsest_continuity");
    let ordinal = 0;
    const call = args => {
      const callId = `cold-${iteration}-${++ordinal}`;
      return tool.execute(args, { name: tool.name, callId, rootCallId: callId, arguments: args, signal: AbortSignal.timeout(20_000) });
    };
    const pulse = await call({ action: "pulse" });
    const conclusion = pulse.episode.conclusion;
    const subject = conclusion.conclusionId;
    const plain = await call({ action: "explain", subject });
    const typed = await call({ action: "explain", subject: `episode:${subject}` });
    const unknown = await call({ action: "explain", subject: "episode:episode-nonexistent-handover" });
    const note = await call({ action: "explain", subject: `journal:${accepted.note.id}` });
    // The existing explanation envelope stays intact. An implementation may place details in
    // an additive field or in the item's source refs and explanation.
    const serialized = JSON.stringify(typed);
    record(`aliases-${iteration}`, plain.found && typed.found && serialized.includes(subject));
    record(`historical-basis-${iteration}`, typed.found && serialized.includes(conclusion.basis.headCommit) &&
      serialized.includes(conclusion.statement) && pulse.episode.state === "REOPENED" &&
      (serialized.includes("REOPENED") || pulse.episode.changedSince.every(change => serialized.includes(change))));
    record(`original-artifacts-${iteration}`, conclusion.check.artifacts.every(a =>
      serialized.includes(a.path) && serialized.includes(a.commit) &&
      sha256(git(profile.repository, "cat-file", "blob", a.commit + ":" + a.path)) === a.digest));
    record(`accepted-work-${iteration}`, pulse.basis.headCommit === accepted.acceptedHead &&
      typed.found && serialized.includes(accepted.acceptedHead) && serialized.includes("DIRECT_BASIS") &&
      (typed.headAcceptance?.eventId === accepted.acceptance.eventId ||
        /\b(?:work|event|revision)[^0-9]{0,10}8\b/iu.test(serialized)));
    record(`record-vs-question-${iteration}`, note.found && JSON.stringify(note).includes(JSON.stringify(accepted.note.body).slice(1, -1)) &&
      pulse.openQuestions.length === 0 && pulse.episode.readiness.unresolvedQuestions.length === 0);
    record(`unknown-id-${iteration}`, unknown.found === false && unknown.standing === "UNKNOWN");
  } finally {
    await deployment.close();
  }
}
for (const [key, name, table, order] of [
  ["orchestration", "palimpsest.sqlite", "events", "event_id"],
  ["projectJournal", "journal.sqlite", "project_journal_events", "seq"],
]) {
  const rows = file => {
    const db = new DatabaseSync(file, { readOnly: true });
    try { return db.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all(); }
    finally { db.close(); }
  };
  record(`original-${table}`, JSON.stringify(rows(profile.databases[key])) === JSON.stringify(rows(join(archive, "owners", name))));
}
record("original-checkout", git(profile.repository, "rev-parse", "HEAD").toString().trim() === accepted.acceptedHead &&
  git(profile.repository, "status", "--porcelain").toString().trim() === "");
console.log("COLD_HANDOVER " + JSON.stringify(results));
