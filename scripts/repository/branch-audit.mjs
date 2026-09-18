#!/usr/bin/env node
/**
 * RS-1 §3/§5 — capture the remote branch inventory from EVIDENCE.
 *
 * For every remote branch this records Git reachability facts (tip, tree, merge-base with main,
 * ahead/behind, ancestor-or-not, the unique commits main does not reach) and the associated GitHub
 * PR metadata. Nothing here is inferred from a branch NAME: §1 forbids deleting a branch because its
 * name looks old, and §5 requires reachability before names.
 *
 *   node scripts/repository/branch-audit.mjs --out repository-audit/branches-before.json
 *
 * Read-only. It never writes a ref.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] !== undefined ? argv[index + 1] : fallback;
};
const OUT = flag("--out", join("repository-audit", "branches-before.json"));
const REPO = process.cwd();

const git = (...args) => execFileSync("git", ["-C", REPO, ...args], { encoding: "utf8", maxBuffer: 1 << 28 }).trim();
const gitOr = (fallback, ...args) => {
  try {
    return git(...args);
  } catch {
    return fallback;
  }
};

const MAIN = flag("--main", "origin/main");
const mainSha = git("rev-parse", MAIN);
const mainTree = git("rev-parse", `${MAIN}^{tree}`);

/* ---- every remote head, not just the first API page (§3) ------------------------------------ */
const lsRemote = git("ls-remote", "--heads", "origin")
  .split("\n")
  .filter((line) => line.trim() !== "")
  .map((line) => {
    const [sha, ref] = line.split("\t");
    return { sha, name: ref.replace("refs/heads/", "") };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

/* ---- PR metadata, in one call: state, head SHA, merge commit, base ------------------------- */
let pullRequests = [];
try {
  const raw = execFileSync(
    "gh",
    [
      "pr",
      "list",
      "--state",
      "all",
      "--limit",
      "1000",
      "--json",
      "number,title,state,headRefName,headRefOid,baseRefName,mergedAt,mergeCommit,closedAt,url",
    ],
    { encoding: "utf8", cwd: REPO, maxBuffer: 1 << 28 },
  );
  pullRequests = JSON.parse(raw);
} catch (error) {
  process.stderr.write(`warning: could not read PR metadata: ${String(error)}\n`);
}
const prsByHead = new Map();
for (const pr of pullRequests) {
  const list = prsByHead.get(pr.headRefName) ?? [];
  list.push(pr);
  prsByHead.set(pr.headRefName, list);
}

/* ---- per-branch facts ----------------------------------------------------------------------- */
const branches = lsRemote.map(({ sha, name }) => {
  const tipSha = sha;
  const tipDate = gitOr("", "log", "-1", "--format=%cI", tipSha);
  const tipSubject = gitOr("", "log", "-1", "--format=%s", tipSha);
  const tipTree = gitOr("", "rev-parse", `${tipSha}^{tree}`);
  const mergeBase = gitOr("", "merge-base", MAIN, tipSha);
  let ahead = 0;
  let behind = 0;
  const counts = gitOr("", "rev-list", "--left-right", "--count", `${MAIN}...${tipSha}`);
  if (counts !== "") {
    const [left, right] = counts.split(/\s+/u);
    behind = Number(left);
    ahead = Number(right);
  }
  let isAncestorOfMain = false;
  try {
    execFileSync("git", ["-C", REPO, "merge-base", "--is-ancestor", tipSha, MAIN], { stdio: "ignore" });
    isAncestorOfMain = true;
  } catch {
    isAncestorOfMain = false;
  }
  let isAncestorOfRemoteHead = false;
  try {
    execFileSync("git", ["-C", REPO, "merge-base", "--is-ancestor", tipSha, `refs/remotes/origin/${name}`], { stdio: "ignore" });
    isAncestorOfRemoteHead = true;
  } catch {
    isAncestorOfRemoteHead = false;
  }
  const uniqueLog = gitOr("", "log", "--format=%H %cI %s", `${MAIN}..${tipSha}`);
  const uniqueCommits = uniqueLog === "" ? [] : uniqueLog.split("\n").map((line) => {
    const [uniqueSha, ...rest] = line.split(" ");
    const date = rest.shift();
    return { sha: uniqueSha, date, subject: rest.join(" ") };
  });
  const prs = (prsByHead.get(name) ?? []).map((pr) => ({
    number: pr.number,
    state: pr.state,
    title: pr.title,
    base: pr.baseRefName,
    headRefOid: pr.headRefOid,
    mergedAt: pr.mergedAt,
    closedAt: pr.closedAt,
    mergeCommit: pr.mergeCommit?.oid ?? null,
    url: pr.url,
    tipMatchesHead: pr.headRefOid === tipSha,
  }));

  return {
    name,
    tipSha,
    tipDate,
    tipSubject,
    tipTree,
    mergeBaseWithMain: mergeBase,
    aheadOfMain: ahead,
    behindMain: behind,
    tipIsAncestorOfMain: isAncestorOfMain,
    tipIsRemoteHead: isAncestorOfRemoteHead,
    uniqueCommitCount: uniqueCommits.length,
    uniqueCommits,
    pullRequests: prs,
    mergedPullRequests: prs.filter((pr) => pr.state === "MERGED"),
    openPullRequests: prs.filter((pr) => pr.state === "OPEN"),
  };
});

const payload = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  repository: "orangeofcarl0-sys/palimpsest",
  mainRef: MAIN,
  mainSha,
  mainTree,
  remoteBranchCount: branches.length,
  notes: [
    "Every field is read from git reachability or the GitHub PR API; none is inferred from a branch name (§1/§5).",
    "`aheadOfMain` counts commits reachable from the tip but not from main; `uniqueCommits` lists them.",
    "`tipIsAncestorOfMain` true is the mechanical proof of classification A (§4).",
  ],
  branches,
};

mkdirSync(join(REPO, dirname(OUT)), { recursive: true });
writeFileSync(join(REPO, OUT), `${JSON.stringify(payload, null, 2)}\n`);
process.stdout.write(
  [
    `branch inventory written: ${OUT}`,
    `  main ${mainSha} (tree ${mainTree})`,
    `  branches ${String(branches.length)}`,
    `  ancestor-of-main ${String(branches.filter((b) => b.tipIsAncestorOfMain).length)}`,
    `  with merged PR ${String(branches.filter((b) => b.mergedPullRequests.length > 0).length)}`,
    `  with open PR ${String(branches.filter((b) => b.openPullRequests.length > 0).length)}`,
    `  with unique commits ${String(branches.filter((b) => b.uniqueCommitCount > 0).length)}`,
    "",
  ].join("\n"),
);
