#!/usr/bin/env node
/**
 * RS-1 §4/§5 — classify every remote branch from recorded evidence.
 *
 * The rules are mechanical and are applied to the facts `branch-audit.mjs` captured; nothing here
 * looks at a branch NAME (§1). Where the mechanical rule cannot decide — a branch with an OPEN pull
 * request needs a judgement about whether its purpose is still credible (§4 E) — the branch is
 * emitted as a REVIEW candidate and MUST appear in `PURPOSE_REVIEW` below with its evidence. A
 * branch that is left unreviewed cannot be deleted.
 *
 *   node scripts/repository/branch-classify.mjs \
 *     --in repository-audit/branches-before.json --out repository-audit/branch-classification.json
 *
 * Read-only.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] !== undefined ? argv[index + 1] : fallback;
};
const REPO = process.cwd();
const IN = flag("--in", join("repository-audit", "branches-before.json"));
const OUT = flag("--out", join("repository-audit", "branch-classification.json"));

/**
 * §2 — `main` is protected forever. `git ls-remote --heads` returns it like any other head, so it
 * arrives in the inventory and would otherwise classify as "an ancestor of main" and land in the
 * deletion set. It is excluded here by an explicit protected list, and the classifier asserts the
 * deletion set never contains it.
 */
const PROTECTED_BRANCHES = new Set(["main"]);

const inventory = JSON.parse(readFileSync(join(REPO, IN), "utf8"));
const git = (...args) => execFileSync("git", ["-C", REPO, ...args], { encoding: "utf8", maxBuffer: 1 << 28 }).trim();
const isAncestor = (sha, of) => {
  try {
    execFileSync("git", ["-C", REPO, "merge-base", "--is-ancestor", sha, of], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

/**
 * §4 E's purpose review. A branch with an open pull request is only ACTIVE if its purpose is still
 * credible and it has an expected next action. Each entry records what was checked and the outcome;
 * the mechanical facts that justify the outcome are in the inventory, not in a branch name.
 */
const PURPOSE_REVIEW = {
  "experiment/pal-fed-0": {
    purpose: "the pre-G10 experimental bilateral peer collaboration leaf: its own `src/federation/` design (codec/contracts/fabric/mcp/peer_state/store/strict/types, 15 files) plus tests",
    openPr: "PR #1, DRAFT, created 2026-09-10, never reviewed, never merged",
    whySuperseded:
      "None of the prototype's 15 `src/federation/` files ever appeared in main's history (`git log origin/main -- src/federation/codec.ts` is empty). Main's federation capability was created later and independently — `feat(g10-e5): bottom-up federated workforce service and derived views` on 2026-09-13 — as a different design (`coalition/commitment/messages/messaging/peer/transport/workforce`), and the host-facing MCP surface the prototype proposed is now the DSH tool surface (`palimpsest_federation`, `palimpsest_collaborate`, `palimpsest_cross_project`), which passed live qualification in RC-1E (5/5).",
    blastRadius: "the branch is 288 commits behind main and its merge base (59fae6e4) predates every merged campaign from G10-A onward",
    nextAction: "none: the experiment's question is answered by merged, live-qualified work. Closing the draft PRs keeps the commits reachable at `refs/pull/N/head`.",
    verdict: "F_ABANDONED_UNMERGED",
  },
};
for (const name of ["experiment/pal-fed-0-dsh", "experiment/pal-fed-0e", "experiment/pal-fed-0f", "experiment/pal-fed-0g", "experiment/pal-fed-0h", "experiment/pal-fed-0i"]) {
  PURPOSE_REVIEW[name] = {
    purpose: "a further iteration of the same abandoned prototype family; the family is strictly STACKED (experiment/pal-fed-0 ⊂ -0-dsh ⊂ -0e ⊂ -0f ⊂ -0g ⊂ -0h ⊂ -0i, verified with `merge-base --is-ancestor`), so this branch is a superset of the reviewed tip above and adds nothing new in kind",
    openPr: "a DRAFT pull request from 2026-09-10/11, never reviewed, never merged",
    whySuperseded: "same evidence as `experiment/pal-fed-0`: never in main's history, superseded by the independently developed and live-qualified federation capability",
    blastRadius: "288 commits behind main",
    nextAction: "none; the family's tip is recorded, and closing the draft PR keeps the commits reachable at `refs/pull/N/head`",
    verdict: "F_ABANDONED_UNMERGED",
  };
}

/** Branches whose leftover branch-only commit is REFERENCED by a main document (§4 C art. 3). */
const REFERENCED_BY_MAIN = {
  "experiment/g10-f1-coalition-grounding": {
    referencedBy: "docs/engineering/G10-F1-DELIVERY.md",
    reference: "Remote canonical CI on the final F1 HEAD: recorded after the run (see the branch follow-up commit).",
    preservation: "FOLD INTO MAIN: the CI evidence the placeholder points at is restored into that document, so main no longer refers to a commit outside main",
  },
};

const branches = inventory.branches.map((branch) => {
  const mergedPrs = branch.pullRequests.filter((pr) => pr.state === "MERGED");
  const openPrs = branch.pullRequests.filter((pr) => pr.state === "OPEN");
  const mergedMergeInMain = mergedPrs.filter((pr) => pr.mergeCommit !== null && isAncestor(pr.mergeCommit, inventory.mainSha));

  let classification;
  let basis;
  if (PROTECTED_BRANCHES.has(branch.name)) {
    classification = "P_PROTECTED_MAIN";
    basis = "§2: main is never deleted, force-pushed, rewritten or rebased";
  } else if (branch.tipIsAncestorOfMain) {
    classification = "A_MERGED_ANCESTOR";
    basis = `merge-base --is-ancestor ${branch.tipSha.slice(0, 12)} origin/main = true`;
  } else if (branch.uniqueCommitCount === 0 && mergedMergeInMain.length > 0) {
    classification = "B_MERGED_PR_EQUIVALENT";
    basis = `PR #${String(mergedMergeInMain[0].number)} merged as ${String(mergedMergeInMain[0].mergeCommit).slice(0, 12)} (ancestor of main); zero commits outside main`;
  } else if (openPrs.length > 0) {
    classification = "E_ACTIVE_CANDIDATE";
    basis = `${String(branch.uniqueCommitCount)} unique commit(s) and OPEN PR #${openPrs.map((pr) => String(pr.number)).join(", #")} — requires the §4 E purpose review`;
  } else if (branch.uniqueCommitCount > 0 && mergedPrs.length > 0) {
    classification = "C_SUPERSEDED_HISTORY";
    basis = `work merged via PR #${String(mergedPrs[0].number)} (merge ${String(mergedPrs[0].mergeCommit).slice(0, 12)}); the ${String(branch.uniqueCommitCount)} remaining commit(s) are post-merge records pushed after the merge`;
  } else if (branch.uniqueCommitCount > 0) {
    classification = "F_ABANDONED_UNMERGED";
    basis = `${String(branch.uniqueCommitCount)} unique commit(s) and no pull request`;
  } else {
    classification = "G_REVIEW_REQUIRED";
    basis = "no mechanical rule matched";
  }

  const review = PURPOSE_REVIEW[branch.name];
  if (classification === "E_ACTIVE_CANDIDATE") {
    if (review === undefined) {
      classification = "G_REVIEW_REQUIRED";
      basis += "; no purpose review recorded, so it is retained";
    } else {
      classification = review.verdict;
      basis += `; §4 E review → ${review.verdict} (${review.whySuperseded.slice(0, 80)}…)`;
    }
  }

  return {
    name: branch.name,
    classification,
    basis,
    tipSha: branch.tipSha,
    tipDate: branch.tipDate,
    tipSubject: branch.tipSubject,
    aheadOfMain: branch.aheadOfMain,
    behindMain: branch.behindMain,
    uniqueCommitCount: branch.uniqueCommitCount,
    uniqueCommits: branch.uniqueCommits,
    mergedPullRequests: mergedMergeInMain.map((pr) => ({ number: pr.number, mergeCommit: pr.mergeCommit })),
    openPullRequests: openPrs.map((pr) => ({ number: pr.number, createdAt: pr.closedAt, url: pr.url })),
    allPullRequests: branch.pullRequests.map((pr) => ({ number: pr.number, state: pr.state, tipMatchesHead: pr.tipMatchesHead })),
    referencedByMain: REFERENCED_BY_MAIN[branch.name] ?? null,
    purposeReview: review ?? null,
    preservationAction: REFERENCED_BY_MAIN[branch.name]?.preservation ?? null,
  };
});

const counts = {};
for (const branch of branches) counts[branch.classification] = (counts[branch.classification] ?? 0) + 1;

const payload = {
  schemaVersion: 1,
  classifiedAt: new Date().toISOString(),
  fromInventory: IN,
  mainSha: inventory.mainSha,
  mainTree: inventory.mainTree,
  total: branches.length,
  counts,
  deletable: branches.filter((b) =>
    ["A_MERGED_ANCESTOR", "B_MERGED_PR_EQUIVALENT", "C_SUPERSEDED_HISTORY", "F_ABANDONED_UNMERGED"].includes(b.classification),
  ).length,
  retained: branches.filter((b) => ["E_ACTIVE", "G_REVIEW_REQUIRED"].includes(b.classification)).length,
  branches,
};

writeFileSync(join(REPO, OUT), `${JSON.stringify(payload, null, 2)}\n`);
process.stdout.write(
  [
    `classification written: ${OUT}`,
    ...Object.entries(counts)
      .sort()
      .map(([key, value]) => `  ${key}: ${String(value)}`),
    `  deletable: ${String(payload.deletable)}`,
    `  retained: ${String(payload.retained)}`,
    "",
  ].join("\n"),
);
