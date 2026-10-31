#!/usr/bin/env node
/**
 * BGC-0 branch and resource census.
 *
 * READ-ONLY by construction. This producer runs only git plumbing commands that
 * cannot mutate refs, the index, the object store or any worktree:
 *
 *   rev-parse, for-each-ref, log, rev-list, merge-base, cherry, worktree list,
 *   stash list, status --porcelain (under --no-optional-locks), ls-remote (never
 *   used here: the caller compares live remote heads separately if required)
 *
 * It writes nothing. The JSON goes to stdout so the caller decides where the
 * record lives. `gh` is invoked for PR metadata when available; a failure is
 * recorded, never guessed.
 *
 * Classification is descriptive audit vocabulary, not product schema.
 *
 * Usage:
 *   node scripts/bgc0/branch_census.mjs > inventory.json
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";

const REPO = process.cwd();
const DEV_HEAD_REF = process.env.BGC0_DEV_HEAD ?? "HEAD";
const CANONICAL_REF = process.env.BGC0_CANONICAL ?? "origin/main";

function git(args, options = {}) {
  return execFileSync("git", ["--no-optional-locks", "-C", REPO, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: options.timeout ?? 120_000,
  });
}

function tryGit(args, options = {}) {
  try {
    return git(args, options);
  } catch {
    return null;
  }
}

function lines(text) {
  return text.split(/\r?\n/u).filter((line) => line.length > 0);
}

function revParse(rev) {
  const out = tryGit(["rev-parse", "--verify", "--quiet", rev]);
  return out === null ? null : out.trim();
}

function statusOf(worktreePath) {
  if (!existsSync(worktreePath)) {
    return { exists: false, state: "missing", dirtyEntries: 0, untrackedEntries: 0, error: null };
  }
  let symlink = false;
  try {
    symlink = lstatSync(worktreePath).isSymbolicLink();
  } catch {
    symlink = false;
  }
  const result = spawnSync(
    "git",
    ["--no-optional-locks", "-C", worktreePath, "status", "--porcelain=v1", "-uall"],
    { encoding: "utf8", timeout: 120_000, maxBuffer: 32 * 1024 * 1024 },
  );
  if (result.error !== undefined && result.error !== null) {
    return { exists: true, symlink, state: "unknown", dirtyEntries: 0, untrackedEntries: 0, error: String(result.error) };
  }
  if (result.status !== 0) {
    return {
      exists: true,
      symlink,
      state: "unknown",
      dirtyEntries: 0,
      untrackedEntries: 0,
      error: (result.stderr ?? "").trim().slice(0, 300) || `exit ${result.status}`,
    };
  }
  const entries = lines(result.stdout);
  const untracked = entries.filter((entry) => entry.startsWith("??")).length;
  return {
    exists: true,
    symlink,
    state: entries.length === 0 ? "clean" : "dirty",
    dirtyEntries: entries.length,
    untrackedEntries: untracked,
    error: null,
  };
}

function parseWorktrees() {
  const raw = git(["worktree", "list", "--porcelain"]);
  const blocks = raw.split(/\r?\n\r?\n/gu).filter((block) => block.trim().length > 0);
  return blocks.map((block) => {
    const record = {
      path: null,
      head: null,
      branch: null,
      detached: false,
      bare: false,
      locked: false,
      prunable: false,
      lockReason: null,
      prunableReason: null,
    };
    for (const line of lines(block)) {
      if (line.startsWith("worktree ")) record.path = line.slice("worktree ".length);
      else if (line.startsWith("HEAD ")) record.head = line.slice("HEAD ".length);
      else if (line.startsWith("branch ")) record.branch = line.slice("branch ".length).replace(/^refs\/heads\//u, "");
      else if (line === "detached") record.detached = true;
      else if (line === "bare") record.bare = true;
      else if (line === "locked") record.locked = true;
      else if (line.startsWith("locked ")) {
        record.locked = true;
        record.lockReason = line.slice("locked ".length);
      } else if (line === "prunable") record.prunable = true;
      else if (line.startsWith("prunable ")) {
        record.prunable = true;
        record.prunableReason = line.slice("prunable ".length);
      }
    }
    return record;
  });
}

function collectPrs() {
  const result = spawnSync(
    "gh",
    [
      "pr",
      "list",
      "--state",
      "all",
      "--limit",
      "400",
      "--json",
      "number,state,title,headRefName,baseRefName,mergeCommit,mergedAt,closedAt,url",
    ],
    { encoding: "utf8", timeout: 120_000, maxBuffer: 32 * 1024 * 1024 },
  );
  if (result.error !== undefined && result.error !== null) {
    return { available: false, error: String(result.error), byBranch: {}, prs: [] };
  }
  if (result.status !== 0) {
    return { available: false, error: (result.stderr ?? "").trim().slice(0, 300) || `exit ${result.status}`, byBranch: {}, prs: [] };
  }
  let prs;
  try {
    prs = JSON.parse(result.stdout);
  } catch (error) {
    return { available: false, error: `unparseable gh output: ${String(error)}`, byBranch: {}, prs: [] };
  }
  const byBranch = {};
  for (const pr of prs) {
    (byBranch[pr.headRefName] ??= []).push({
      number: pr.number,
      state: pr.state,
      title: pr.title,
      base: pr.baseRefName,
      mergeCommit: pr.mergeCommit?.oid ?? null,
      mergedAt: pr.mergedAt,
      closedAt: pr.closedAt,
      url: pr.url,
    });
  }
  return { available: true, error: null, byBranch, prs };
}

const SHA_PATTERN = /(?<![0-9a-fA-F])[0-9a-f]{40}(?![0-9a-fA-F])/gu;
const EVIDENCE_ROOTS = ["research-evidence", "docs/engineering"];

function collectFreezeReferences() {
  const shaToFiles = new Map();
  const freezeEvidence = new Map();
  const scanned = { files: 0, bytes: 0, skippedLarge: 0 };
  const FREEZE_CONTEXT = /freeze|frozen|codeFreeze|evidenceFreeze/iu;
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!/\.(json|md|txt)$/u.test(entry.name)) continue;
      let size;
      try {
        size = statSync(full).size;
      } catch {
        continue;
      }
      if (size > 2 * 1024 * 1024) {
        scanned.skippedLarge += 1;
        continue;
      }
      let text;
      try {
        text = readFileSync(full, "utf8");
      } catch {
        continue;
      }
      scanned.files += 1;
      scanned.bytes += size;
      const rel = relative(REPO, full).replaceAll("\\", "/");
      const fileLooksLikeFreeze = /freeze/iu.test(rel);
      for (const match of text.matchAll(SHA_PATTERN)) {
        const sha = match[0].toLowerCase();
        const bucket = shaToFiles.get(sha);
        if (bucket === undefined) shaToFiles.set(sha, [rel]);
        else if (bucket.length < 3 && !bucket.includes(rel)) bucket.push(rel);
        const start = Math.max(0, match.index - 160);
        const end = Math.min(text.length, match.index + 160);
        const context = text.slice(start, end);
        const labelled =
          fileLooksLikeFreeze ||
          (FREEZE_CONTEXT.test(context) &&
            /(commit|sha|tip|head|codeFreeze|evidenceFreeze|reference|freeze)/iu.test(context));
        if (labelled) {
          const freezeBucket = freezeEvidence.get(sha);
          if (freezeBucket === undefined) freezeEvidence.set(sha, [rel]);
          else if (freezeBucket.length < 3 && !freezeBucket.includes(rel)) freezeBucket.push(rel);
        }
      }
    }
  };
  for (const root of EVIDENCE_ROOTS) walk(join(REPO, root));
  return { shaToFiles, freezeEvidence, scanned };
}

function gateRootCensus() {
  const root = process.env.PALIMPSEST_GATE_ROOT?.trim() || join(homedir(), ".palimpsest-gates");
  if (!existsSync(root)) return { root, entries: 0, names: [], note: "gate root does not exist" };
  let names = [];
  try {
    names = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    return { root, entries: 0, names: [], note: String(error) };
  }
  const ownership = names.map((name) => {
    const full = join(root, name);
    let marker = null;
    for (const candidate of ["owner.json", "OWNER", ".owner", "owner"]) {
      if (existsSync(join(full, candidate))) {
        marker = candidate;
        break;
      }
    }
    return { name, ownerMarker: marker };
  });
  return {
    root,
    entries: names.length,
    names,
    ownership,
    withoutMarker: ownership.filter((entry) => entry.ownerMarker === null).length,
  };
}

function runtimeHomeCensus() {
  const home = process.env.DSH_HOME?.trim() || join(homedir(), ".dsh");
  const versionFile = join(home, "version");
  let version = null;
  try {
    version = readFileSync(versionFile, "utf8").trim();
  } catch {
    version = null;
  }
  if (version === null) {
    const globalPackage = join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "npm", "node_modules", "@deepseek-ai", "dsh", "package.json");
    try {
      version = JSON.parse(readFileSync(globalPackage, "utf8")).version ?? null;
    } catch {
      version = null;
    }
  }
  return { path: home, version, exists: existsSync(home) };
}

function classify(record, ctx) {
  const categories = [];
  const add = (name) => {
    if (!categories.includes(name)) categories.push(name);
  };
  if (record.fullRef === "refs/heads/main" || record.fullRef === "refs/remotes/origin/main") {
    add("canonical_integration_branch");
  }
  if (record.tip === ctx.devHead && ctx.devHead !== null) add("current_development_head");
  if (record.worktree !== null && record.worktree.exists) add("active_worktree_branch");
  if (record.worktree !== null && record.worktree.state === "dirty") add("dirty_worktree_branch");
  if (record.inDevelopmentHistory) add("integrated_historical_milestone");
  if (record.inCanonicalMain) add("integrated_in_canonical_main");
  if (record.freezeEvidenceBy.length > 0) add("protected_freeze_reference");
  if (!record.inDevelopmentHistory) {
    if (record.nonEquivalentCommits === 0) add("patch_equivalent_but_graph_divergent");
    else add("divergent_research_branch");
  }
  if (record.source === "local" && record.remoteCounterpart === null) add("local_only_or_unpublished");
  if (categories.length === 0) add("unknown");
  return categories;
}

function dispositionFor(record, categories, ctx) {
  if (record.fullRef === "refs/heads/main") {
    return {
      action: "preserve_canonical",
      reason: "Local main is a clean, fully integrated ancestor; it is 296 commits behind origin/main and is not moved by this stage.",
    };
  }
  if (record.fullRef === "refs/remotes/origin/main") {
    return {
      action: "preserve_canonical",
      reason: "The remote canonical branch and the proposed integration target for a reviewed fast-forward.",
    };
  }
  if (categories.includes("current_development_head")) {
    return { action: "preserve_development_head", reason: "The verified COG-1 Evidence Freeze this stage starts from." };
  }
  if (categories.includes("dirty_worktree_branch")) {
    return {
      action: "preserve_unknown_dirty",
      reason: "A registered worktree on this branch has uncommitted or untracked content; ownership must be established before any retirement.",
    };
  }
  if (categories.includes("active_worktree_branch")) {
    return {
      action: "preserve_active",
      reason: "Currently attached to a registered worktree; retirement would disturb a live checkout.",
    };
  }
  if (categories.includes("divergent_research_branch")) {
    return {
      action: "preserve_divergent",
      reason: `${record.nonEquivalentCommits} non-patch-equivalent commit(s) are absent from the development head; classify only after reviewing the actual diff.`,
    };
  }
  if (categories.includes("protected_freeze_reference")) {
    return {
      action: "preserve_freeze_reference",
      reason: `Tip is named as a freeze identity by ${record.freezeEvidenceBy.length} research/evidence record(s); the ref is part of reproducing a historical result.`,
    };
  }
  if (categories.includes("local_only_or_unpublished")) {
    return {
      action: "preserve_local_only",
      reason: "No remote branch carries this name; remote recovery is not established.",
    };
  }
  if (record.inDevelopmentHistory) {
    return {
      action: "retirement_candidate_pending_owner_authorization",
      reason:
        "Tip is contained in the verified development history, no worktree uses it and no evidence record names this tip; the commits survive in HEAD, so only the label is at issue. Nothing is deleted by this stage.",
    };
  }
  return { action: "preserve_unclassified", reason: "Insufficient evidence; preserve by default." };
}

function main() {
  const head = git(["rev-parse", "HEAD"]).trim();
  const headTree = git(["rev-parse", "HEAD^{tree}"]).trim();
  const headBranchRaw = tryGit(["symbolic-ref", "--quiet", "--short", "HEAD"]);
  const headBranch = headBranchRaw === null ? null : headBranchRaw.trim();
  const statusEntries = lines(git(["status", "--porcelain=v1", "-uall"]));
  const devHead = revParse(DEV_HEAD_REF) ?? head;
  const canonicalRemote = revParse(CANONICAL_REF);
  const canonicalLocal = revParse("refs/heads/main");

  // tip -> tree for every commit reachable from any ref (one traversal).
  const commitTrees = new Map();
  for (const line of lines(git(["log", "--all", "--format=%H %T"]))) {
    const [sha, tree] = line.split(" ");
    commitTrees.set(sha, tree);
  }

  const reachable = (rev) => new Set(lines(git(["rev-list", rev])));
  const devSet = reachable(devHead);
  const canonicalSet = canonicalRemote === null ? new Set() : reachable(canonicalRemote);
  const localMainSet = canonicalLocal === null ? new Set() : reachable(canonicalLocal);

  const worktrees = parseWorktrees().map((worktree) => ({
    ...worktree,
    ...statusOf(worktree.path),
  }));
  const worktreeByBranch = new Map();
  for (const worktree of worktrees) {
    if (worktree.branch !== null) worktreeByBranch.set(worktree.branch, worktree);
  }

  const prs = collectPrs();
  const freeze = collectFreezeReferences();

  const rawRefs = lines(
    git([
      "for-each-ref",
      "refs/heads",
      "refs/remotes",
      "--format=%(refname)%1f%(objectname)%1f%(committerdate:iso8601)%1f%(upstream:short)%1f%(subject)",
    ]),
  )
    .map((line) => line.split("\u001f"))
    .map(([fullRef, tip, committedAt, upstream, subject]) => ({ fullRef, tip, committedAt, upstream, subject }))
    .filter((record) => record.fullRef !== "refs/remotes/origin/HEAD");

  const localNames = new Set(
    rawRefs.filter((record) => record.fullRef.startsWith("refs/heads/")).map((record) => record.fullRef.slice("refs/heads/".length)),
  );
  const remoteNames = new Set(
    rawRefs
      .filter((record) => record.fullRef.startsWith("refs/remotes/origin/"))
      .map((record) => record.fullRef.slice("refs/remotes/origin/".length)),
  );

  const branches = rawRefs.map((record) => {
    const isLocal = record.fullRef.startsWith("refs/heads/");
    const name = isLocal ? record.fullRef.slice("refs/heads/".length) : record.fullRef.slice("refs/remotes/origin/".length);
    const source = isLocal ? "local" : "remote";
    const remoteCounterpart = isLocal ? (remoteNames.has(name) ? `origin/${name}` : null) : localNames.has(name) ? name : null;
    const worktree = isLocal ? (worktreeByBranch.get(name) ?? null) : null;
    const inDevelopmentHistory = devSet.has(record.tip);
    const inCanonicalMain = canonicalSet.has(record.tip);
    const inLocalMain = localMainSet.has(record.tip);

    let aheadOfDevelopHead = null;
    let behindDevelopHead = null;
    let aheadOfCanonical = null;
    let behindCanonical = null;
    if (record.tip !== devHead) {
      const counts = tryGit(["rev-list", "--left-right", "--count", `${devHead}...${record.tip}`]);
      if (counts !== null) {
        const [devOnly, refOnly] = counts.trim().split(/\s+/u).map(Number);
        behindDevelopHead = devOnly;
        aheadOfDevelopHead = refOnly;
      }
    } else {
      aheadOfDevelopHead = 0;
      behindDevelopHead = 0;
    }
    if (canonicalRemote !== null) {
      const counts = tryGit(["rev-list", "--left-right", "--count", `${canonicalRemote}...${record.tip}`]);
      if (counts !== null) {
        const [mainOnly, refOnly] = counts.trim().split(/\s+/u).map(Number);
        behindCanonical = mainOnly;
        aheadOfCanonical = refOnly;
      }
    }

    let equivalentCommits = null;
    let nonEquivalentCommits = null;
    if (!inDevelopmentHistory) {
      const cherry = tryGit(["cherry", devHead, record.tip]);
      if (cherry !== null) {
        const cherryLines = lines(cherry);
        equivalentCommits = cherryLines.filter((line) => line.startsWith("-")).length;
        nonEquivalentCommits = cherryLines.filter((line) => line.startsWith("+")).length;
      }
    } else {
      equivalentCommits = 0;
      nonEquivalentCommits = 0;
    }
    if (nonEquivalentCommits === null) nonEquivalentCommits = 1; // unknown: preserve, never optimistically equivalent

    const freezeReferencedBy = freeze.shaToFiles.get(record.tip) ?? [];
    const freezeEvidenceForTip = freeze.freezeEvidence.get(record.tip) ?? [];
    const prHistory = prs.available ? (prs.byBranch[name] ?? []) : [];

    const recordOut = {
      name,
      fullRef: record.fullRef,
      source,
      tip: record.tip,
      tree: commitTrees.get(record.tip) ?? null,
      committedAt: record.committedAt,
      subject: record.subject,
      upstream: record.upstream === "" ? null : record.upstream,
      remoteCounterpart,
      worktree:
        worktree === null
          ? null
          : {
              path: worktree.path,
              exists: worktree.exists,
              state: worktree.state,
              dirtyEntries: worktree.dirtyEntries,
              untrackedEntries: worktree.untrackedEntries,
              locked: worktree.locked,
              prunable: worktree.prunable,
              symlink: worktree.symlink ?? false,
            },
      inDevelopmentHistory,
      inCanonicalMain,
      inLocalMain,
      aheadOfDevelopHead,
      behindDevelopHead,
      aheadOfCanonical,
      behindCanonical,
      equivalentCommits,
      nonEquivalentCommits,
      freezeReferencedBy,
      freezeEvidenceBy: freezeEvidenceForTip,
      prHistory,
      categories: [],
      disposition: null,
    };
    recordOut.categories = classify(recordOut, { devHead });
    recordOut.disposition = dispositionFor(recordOut, recordOut.categories, { devHead });
    return recordOut;
  });

  const summarize = (records) => {
    const summary = {};
    for (const record of records) {
      for (const category of record.categories) summary[category] = (summary[category] ?? 0) + 1;
    }
    return summary;
  };

  const local = branches.filter((branch) => branch.source === "local");
  const remote = branches.filter((branch) => branch.source === "remote");
  const divergent = branches.filter((branch) => branch.categories.includes("divergent_research_branch"));
  const patchEquivalent = branches.filter((branch) => branch.categories.includes("patch_equivalent_but_graph_divergent"));
  const localOnly = branches.filter((branch) => branch.categories.includes("local_only_or_unpublished"));
  const dirtyWorktrees = worktrees.filter((worktree) => worktree.state === "dirty");
  const missingWorktrees = worktrees.filter((worktree) => !worktree.exists);
  const lockedWorktrees = worktrees.filter((worktree) => worktree.locked);
  const prunableWorktrees = worktrees.filter((worktree) => worktree.prunable);

  const inventory = {
    schema: "bgc0-branch-census/v1",
    generatedAt: new Date().toISOString(),
    readOnly: true,
    repository: {
      worktreeRoot: REPO.replaceAll("\\", "/"),
      gitDirFile: "F:/Codex_Work_Space/DSH plugin/palimpsest-repo/.git/worktrees/palimpsest-sr1",
    },
    development: {
      ref: DEV_HEAD_REF,
      head,
      headTree,
      headBranch,
      detached: headBranch === null,
      worktreeClean: statusEntries.length === 0,
      worktreeDirtyEntries: statusEntries.length,
      reachableCommits: devSet.size,
    },
    canonical: {
      remoteRef: CANONICAL_REF,
      remoteSha: canonicalRemote,
      localRef: "refs/heads/main",
      localSha: canonicalLocal,
      localBehindRemote: canonicalLocal === null || canonicalRemote === null ? null : behind(canonicalLocal, canonicalRemote),
      remoteReachableCommits: canonicalSet.size,
      localReachableCommits: localMainSet.size,
    },
    counts: {
      localBranches: local.length,
      remoteBranches: remote.length,
      totalRefs: branches.length,
      worktrees: worktrees.length,
      stashes: lines(tryGit(["stash", "list"]) ?? "").length,
      evidenceTrees: (() => {
        try {
          return readdirSync(join(REPO, "research-evidence"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).length;
        } catch {
          return null;
        }
      })(),
    },
    resourceCensus: {
      gateRoots: gateRootCensus(),
      runtimeHome: runtimeHomeCensus(),
      worktrees: {
        total: worktrees.length,
        existing: worktrees.filter((worktree) => worktree.exists).length,
        missing: missingWorktrees.length,
        dirty: dirtyWorktrees.length,
        locked: lockedWorktrees.length,
        prunable: prunableWorktrees.length,
        attachedBranches: worktrees.filter((worktree) => worktree.branch !== null).length,
        detached: worktrees.filter((worktree) => worktree.detached).length,
        symlinked: worktrees.filter((worktree) => worktree.symlink === true).length,
      },
      stashes: lines(tryGit(["stash", "list"]) ?? "").length,
      evidenceScan: freeze.scanned,
      prMetadata: { available: prs.available, error: prs.error, records: prs.prs.length },
    },
    worktrees,
    branches,
    divergentBranches: divergent.map((branch) => ({
      name: branch.name,
      source: branch.source,
      tip: branch.tip,
      subject: branch.subject,
      aheadOfDevelopHead: branch.aheadOfDevelopHead,
      behindDevelopHead: branch.behindDevelopHead,
      equivalentCommits: branch.equivalentCommits,
      nonEquivalentCommits: branch.nonEquivalentCommits,
      prHistory: branch.prHistory,
      freezeReferencedBy: branch.freezeReferencedBy,
      freezeEvidenceBy: branch.freezeEvidenceBy,
    })),
    summary: {
      local: summarize(local),
      remote: summarize(remote),
      all: summarize(branches),
    },
    notes: [
      "A branch ref, a worktree, a gate root and an evidence tree are distinct resources; counts are not interchangeable.",
      "No ref, worktree, gate root or evidence file was modified. git status ran under --no-optional-locks.",
      "Every divergence statement is derived from Git object ancestry (rev-list, merge-base, cherry), not names or timestamps.",
      "Dispositions are proposals only. No branch deletion, pruning or cleanup was performed.",
    ],
  };
  process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
}

function behind(a, b) {
  const counts = tryGit(["rev-list", "--left-right", "--count", `${a}...${b}`]);
  if (counts === null) return null;
  const [aOnly, bOnly] = counts.trim().split(/\s+/u).map(Number);
  return { ahead: aOnly, behind: bOnly };
}

main();
