/**
 * R3-WR3 — EXECUTION WORLD IDENTITY AND REPLAY SAFETY REGRESSIONS.
 *
 * Every test here pins a property the stage ENFORCES, and each is paired so the suite cannot pass by refusing
 * everything: a mutant that must be refused, and a healthy control that must be accepted.
 *
 * THE FALSIFIERS ARE THE POINT. The "before" side of each mutant is the REAL R3-WR2 compiled port, snapshotted
 * at the stage baseline `f2b6b12` into `scripts/r3wr3/baseline/`, so "the old implementation violated this" is a
 * measurement against shipped code rather than a claim about it. One witness (readiness) compares against the
 * R3-WR implementation instead, because that is where the defect it exercises actually lives — stated rather
 * than hidden, since a witness that compared against an already-fixed baseline could never fail.
 *
 * The compiled port under test is reached by PATH and imported DYNAMICALLY, matching the other suites: a static
 * `import` from `dist` makes TypeScript treat the emitted declaration as an input and the build then refuses to
 * overwrite it (TS5055).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

const NL = String.fromCharCode(10);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = mkdtempSync(join(tmpdir(), "r3wr3-test-"));

afterAll(() => {
  try {
    rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* the temp hygiene sweep collects it */
  }
});

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

const gitQuiet = (cwd: string, args: readonly string[]): string => {
  try {
    return execFileSync("git", [...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return "";
  }
};

/** The compiled port under test. */
async function loadCurrent(): Promise<any> {
  const module = await import(pathToFileURL(join(REPO, "dist", "src", "effects", "git_port.js")).href);
  return module.GitCliPort;
}

/** The frozen pre-repair baselines. */
async function loadR3WR2(): Promise<any> {
  const module = await import(pathToFileURL(join(REPO, "scripts", "r3wr3", "baseline", "git_port.r3wr2.mjs")).href);
  return module.GitCliPort;
}

async function loadR3WR(): Promise<any> {
  const module = await import(pathToFileURL(join(REPO, "scripts", "r3wr3", "baseline", "git_port.r3wr.mjs")).href);
  return module.GitCliPort;
}

function makeBasis(root: string): { repo: string; basisCommit: string } {
  const repo = join(root, "canonical");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "ledger.mjs"), `export const answer = 0;${NL}`, "utf8");
  git(repo, ["init", "-q"]);
  git(repo, ["add", "-A"]);
  git(repo, ["-c", "user.email=b@b.b", "-c", "user.name=b", "commit", "-qm", "basis"]);
  return { repo, basisCommit: git(repo, ["rev-parse", "HEAD"]) };
}

/** A digest of the canonical repository's load-bearing state. */
function canonicalDigest(repo: string): string {
  return [
    gitQuiet(repo, ["rev-parse", "HEAD"]),
    gitQuiet(repo, ["symbolic-ref", "-q", "HEAD"]),
    gitQuiet(repo, ["show-ref"]),
    gitQuiet(repo, ["remote", "-v"]),
    gitQuiet(repo, ["config", "user.name"]),
    gitQuiet(repo, ["config", "user.email"]),
    gitQuiet(repo, ["status", "--porcelain"]),
  ].join("\u0000");
}

/** A digest of a world's HEAD and whole work tree. */
function worldDigest(worldPath: string): string {
  const files: string[] = [];
  const walk = (dir: string, prefix = ""): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((left, right) => (left.name < right.name ? -1 : 1))) {
      if (entry.name === ".git") continue;
      const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else files.push(`${rel}:${String(readFileSync(join(dir, entry.name)).length)}:${readFileSync(join(dir, entry.name), "utf8").length}`);
    }
  };
  try { walk(worldPath); } catch { return "ABSENT"; }
  return `${gitQuiet(worldPath, ["rev-parse", "HEAD"])}\u0000${files.join(",")}`;
}

/* ================================================================== *
 * A. PARENT REPOSITORY ADOPTION
 * ================================================================== */

describe("R3-WR3 A. a directory with no Git repository of its own is never adopted", () => {
  const arrange = (root: string) => {
    const basis = makeBasis(root);
    const worldsRoot = join(basis.repo, ".palimpsest", "worlds");
    const worldPath = join(worldsRoot, "attempt-orphan");
    mkdirSync(worldPath, { recursive: true });
    writeFileSync(join(worldPath, "README.md"), `orphan${NL}`, "utf8");
    return { basis, worldsRoot, worldPath };
  };

  it("the OLD port adopts it and MUTATES the canonical repository — the frozen defect", async () => {
    /**
     * `git rev-parse --git-dir` discovers an enclosing repository, so a directory with no `.git` of its own
     * answers "a repository is here" and the old port ran checkout, remote and config against the CANONICAL
     * repository. Measured: its HEAD became detached and its commit identity was overwritten.
     */
    const R3WR2 = await loadR3WR2();
    const root = join(BASE, "a1-old");
    mkdirSync(root, { recursive: true });
    const { basis, worldsRoot } = arrange(root);
    const before = canonicalDigest(basis.repo);
    const port = new R3WR2(basis.repo, worldsRoot);
    await port.createWorld({ worktreeId: "attempt-orphan", baseCommit: basis.basisCommit });
    expect(canonicalDigest(basis.repo), "the old port must be shown to mutate the canonical repository").not.toBe(before);
  });

  it("the CURRENT port REFUSES it and leaves the canonical repository byte-identical", async () => {
    const Current = await loadCurrent();
    const root = join(BASE, "a1-new");
    mkdirSync(root, { recursive: true });
    const { basis, worldsRoot, worldPath } = arrange(root);
    const before = canonicalDigest(basis.repo);
    const port = new Current(basis.repo, worldsRoot);
    await expect(port.createWorld({ worktreeId: "attempt-orphan", baseCommit: basis.basisCommit })).rejects.toThrow(/WORLD_PATH_NOT_ISOLATED/u);
    expect(canonicalDigest(basis.repo), "a refusal must not be a mutation").toBe(before);
    expect(existsSync(worldPath), "the world directory must not be deleted by the refusal").toBe(true);
  });

  it("a LINKED WORKTREE at the world path is refused, because its metadata belongs outside", async () => {
    const Current = await loadCurrent();
    const root = join(BASE, "a1-linked");
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root);
    const worldsRoot = join(basis.repo, ".palimpsest", "worlds");
    mkdirSync(worldsRoot, { recursive: true });
    const worldPath = join(worldsRoot, "attempt-linked");
    git(basis.repo, ["worktree", "add", "-q", "--detach", worldPath, basis.basisCommit]);
    /** `.git` is a FILE pointing into the canonical repository, which is the shape that must be refused. */
    expect(existsSync(join(worldPath, ".git"))).toBe(true);
    const before = canonicalDigest(basis.repo);
    const port = new Current(basis.repo, worldsRoot);
    await expect(port.createWorld({ worktreeId: "attempt-linked", baseCommit: basis.basisCommit })).rejects.toThrow(/WORLD_IDENTITY_MISMATCH/u);
    expect(canonicalDigest(basis.repo)).toBe(before);
  });
});

/* ================================================================== *
 * B. CANDIDATE HEAD PRESERVATION
 * ================================================================== */

describe("R3-WR3 B. a committed candidate is never moved back to its basis", () => {
  const arrange = async (Port: any, root: string) => {
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root);
    const worldsRoot = join(basis.repo, ".palimpsest", "worlds");
    const port = new Port(basis.repo, worldsRoot);
    const created = await port.createWorld({ worktreeId: "attempt-candidate", baseCommit: basis.basisCommit });
    writeFileSync(join(created.worldPath, "src", "ledger.mjs"), `export const answer = 42;${NL}`, "utf8");
    writeFileSync(join(created.worldPath, "src", "candidate-only.mjs"), `export const extra = 1;${NL}`, "utf8");
    git(created.worldPath, ["add", "-A"]);
    git(created.worldPath, ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "candidate X"]);
    return { basis, worldsRoot, port, worldPath: created.worldPath, candidateHead: git(created.worldPath, ["rev-parse", "HEAD"]) };
  };

  it("the OLD port rewinds HEAD to the basis and DELETES the candidate file — the frozen defect", async () => {
    const R3WR2 = await loadR3WR2();
    const { basis, port, worldPath, candidateHead } = await arrange(R3WR2, join(BASE, "b-old"));
    await port.createWorld({ worktreeId: "attempt-candidate", baseCommit: basis.basisCommit });
    expect(gitQuiet(worldPath, ["rev-parse", "HEAD"]), "the old port must be shown to rewind HEAD").toBe(basis.basisCommit);
    expect(candidateHead).not.toBe(basis.basisCommit);
    expect(existsSync(join(worldPath, "src", "candidate-only.mjs")), "the old port must be shown to lose the candidate file").toBe(false);
  });

  it("the CURRENT port PRESERVES HEAD, the tree and the candidate's reachability", async () => {
    const Current = await loadCurrent();
    const { basis, port, worldPath, candidateHead } = await arrange(Current, join(BASE, "b-new"));
    const before = worldDigest(worldPath);
    await port.createWorld({ worktreeId: "attempt-candidate", baseCommit: basis.basisCommit });
    expect(gitQuiet(worldPath, ["rev-parse", "HEAD"])).toBe(candidateHead);
    expect(worldDigest(worldPath)).toBe(before);
    expect(existsSync(join(worldPath, "src", "candidate-only.mjs"))).toBe(true);
    expect(gitQuiet(worldPath, ["cat-file", "-e", `${candidateHead}^{commit}`])).toBe("");
    /** And the canonical repository is untouched. */
    expect(gitQuiet(basis.repo, ["rev-parse", "HEAD"])).toBe(basis.basisCommit);
  });

  it("a world holding UNSTAGED edits keeps them across a reuse", async () => {
    const Current = await loadCurrent();
    const root = join(BASE, "b-unstaged");
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root);
    const worldsRoot = join(basis.repo, ".palimpsest", "worlds");
    const port = new Current(basis.repo, worldsRoot);
    const created = await port.createWorld({ worktreeId: "attempt-unstaged", baseCommit: basis.basisCommit });
    writeFileSync(join(created.worldPath, "src", "ledger.mjs"), `export const answer = 77;${NL}`, "utf8");
    await port.createWorld({ worktreeId: "attempt-unstaged", baseCommit: basis.basisCommit });
    expect(readFileSync(join(created.worldPath, "src", "ledger.mjs"), "utf8")).toContain("answer = 77");
  });
});

/* ================================================================== *
 * C. PATH CONFINEMENT
 * ================================================================== */

describe("R3-WR3 C. a world id cannot name anything outside the world root", () => {
  const forms = [
    "..",
    "../..",
    "..\\..\\canonical",
    "sub/attempt",
    "sub\\attempt",
    "C:\\Windows\\Temp\\attempt",
    "\\\\server\\share\\attempt",
    "\\\\?\\C:\\attempt",
    ".",
    "",
  ];

  it("every escaping form is refused, and the canonical repository is untouched each time", async () => {
    const Current = await loadCurrent();
    const root = join(BASE, "c-escape");
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root);
    const worldsRoot = join(basis.repo, ".palimpsest", "worlds");
    const port = new Current(basis.repo, worldsRoot);
    const before = canonicalDigest(basis.repo);
    for (const worldId of forms) {
      await expect(port.createWorld({ worktreeId: worldId, baseCommit: basis.basisCommit }), `"${worldId}" must be refused`).rejects.toThrow(/WORLD_ID_ESCAPES_ROOT|WORLD_ID_INVALID/u);
    }
    expect(canonicalDigest(basis.repo), "no refusal may mutate the canonical repository").toBe(before);
  });

  it("the OLD port RETURNS a path outside the root — the frozen defect", async () => {
    const R3WR2 = await loadR3WR2();
    const root = join(BASE, "c-old");
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root);
    const worldsRoot = join(basis.repo, ".palimpsest", "worlds");
    const port = new R3WR2(basis.repo, worldsRoot);
    const created = await port.createWorld({ worktreeId: "../escaped-target", baseCommit: basis.basisCommit });
    /** The resolved path is NOT a direct child of the root: the old port wrote outside it. */
    expect(dirname(resolve(created.worldPath))).not.toBe(resolve(worldsRoot));
  });

  it("an ordinary attempt id is ACCEPTED — the control that keeps the confinement honest", async () => {
    const Current = await loadCurrent();
    const root = join(BASE, "c-control");
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root);
    const worldsRoot = join(basis.repo, ".palimpsest", "worlds");
    const port = new Current(basis.repo, worldsRoot);
    const created = await port.createWorld({ worktreeId: "attempt-ordinary", baseCommit: basis.basisCommit });
    expect(dirname(resolve(created.worldPath))).toBe(resolve(worldsRoot));
    expect(gitQuiet(created.worldPath, ["rev-parse", "HEAD"])).toBe(basis.basisCommit);
  });
});

/* ================================================================== *
 * D. BASIS AND READINESS
 * ================================================================== */

describe("R3-WR3 D. basis disagreement and readiness are distinguished and enforced", () => {
  it("a world on an unrelated basis is REFUSED rather than rewound", async () => {
    const Current = await loadCurrent();
    const root = join(BASE, "d-basis");
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root);
    const worldsRoot = join(basis.repo, ".palimpsest", "worlds");
    const port = new Current(basis.repo, worldsRoot);
    const created = await port.createWorld({ worktreeId: "attempt-basis", baseCommit: basis.basisCommit });
    writeFileSync(join(created.worldPath, "src", "ledger.mjs"), `export const answer = 43;${NL}`, "utf8");
    git(created.worldPath, ["add", "-A"]);
    git(created.worldPath, ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "candidate"]);
    const candidateHead = git(created.worldPath, ["rev-parse", "HEAD"]);

    /** A sibling commit of the basis, made in the canonical repository so it exists in the shared store. */
    git(basis.repo, ["checkout", "-q", "-b", "sibling", basis.basisCommit]);
    writeFileSync(join(basis.repo, "src", "sibling.mjs"), `export const sibling = 1;${NL}`, "utf8");
    git(basis.repo, ["add", "-A"]);
    git(basis.repo, ["-c", "user.email=s@s.s", "-c", "user.name=s", "commit", "-qm", "sibling"]);
    const siblingCommit = git(basis.repo, ["rev-parse", "HEAD"]);
    git(basis.repo, ["checkout", "-q", basis.basisCommit]);

    const before = worldDigest(created.worldPath);
    await expect(port.createWorld({ worktreeId: "attempt-basis", baseCommit: siblingCommit })).rejects.toThrow(/WORLD_BASIS_MISMATCH/u);
    expect(gitQuiet(created.worldPath, ["rev-parse", "HEAD"])).toBe(candidateHead);
    expect(worldDigest(created.worldPath)).toBe(before);
  });

  it("a CORRUPT INDEX is refused, where the R3-WR text-matching criterion accepted it", async () => {
    /**
     * The fault is injected at the post-checkout moment with GIT_TEMPLATE_DIR, so the clone and the checkout have
     * already succeeded and only the readiness gate can catch it. The R3-WR implementation decided capability by
     * matching error TEXT, and `fatal: .git/index: index file smaller than expected` matches none of its
     * patterns — so it returned a world that cannot commit.
     */
    const inject = (root: string) => {
      const template = join(root, "template");
      mkdirSync(join(template, "hooks"), { recursive: true });
      writeFileSync(join(template, "hooks", "post-checkout"), `#!/bin/sh${NL}printf "GARBAGE-INDEX" > "$(git rev-parse --git-dir)/index"${NL}exit 0${NL}`, "utf8");
      return template;
    };

    const R3WR = await loadR3WR();
    const oldRoot = join(BASE, "d-ready-old");
    mkdirSync(oldRoot, { recursive: true });
    const oldBasis = makeBasis(oldRoot);
    const previousTemplate = process.env.GIT_TEMPLATE_DIR;
    process.env.GIT_TEMPLATE_DIR = inject(oldRoot);
    let oldReturned = false;
    try {
      const port = new R3WR(oldBasis.repo, join(oldBasis.repo, ".palimpsest", "worlds"));
      await port.createWorld({ worktreeId: "attempt-corrupt", baseCommit: oldBasis.basisCommit });
      oldReturned = true;
    } catch {
      oldReturned = false;
    } finally {
      if (previousTemplate === undefined) delete process.env.GIT_TEMPLATE_DIR;
      else process.env.GIT_TEMPLATE_DIR = previousTemplate;
    }
    expect(oldReturned, "the R3-WR criterion must be shown to accept a world it cannot commit in").toBe(true);

    const Current = await loadCurrent();
    const newRoot = join(BASE, "d-ready-new");
    mkdirSync(newRoot, { recursive: true });
    const newBasis = makeBasis(newRoot);
    const template = inject(newRoot);
    process.env.GIT_TEMPLATE_DIR = template;
    try {
      const port = new Current(newBasis.repo, join(newBasis.repo, ".palimpsest", "worlds"));
      await expect(port.createWorld({ worktreeId: "attempt-corrupt", baseCommit: newBasis.basisCommit })).rejects.toThrow(/WORLD_NOT_COMMIT_CAPABLE/u);
    } finally {
      if (previousTemplate === undefined) delete process.env.GIT_TEMPLATE_DIR;
      else process.env.GIT_TEMPLATE_DIR = previousTemplate;
    }
  });

  it("a healthy world is ACCEPTED and a reusable world keeps working — the readiness control", async () => {
    const Current = await loadCurrent();
    const root = join(BASE, "d-ready-control");
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root);
    const worldsRoot = join(basis.repo, ".palimpsest", "worlds");
    const port = new Current(basis.repo, worldsRoot);
    const created = await port.createWorld({ worktreeId: "attempt-healthy", baseCommit: basis.basisCommit });
    expect(gitQuiet(created.worldPath, ["rev-parse", "HEAD"])).toBe(basis.basisCommit);
    /** Staged and untracked states are ordinary and must both be accepted. */
    writeFileSync(join(created.worldPath, "src", "ledger.mjs"), `export const answer = 51;${NL}`, "utf8");
    git(created.worldPath, ["add", "-A"]);
    writeFileSync(join(created.worldPath, "notes.txt"), "note\n", "utf8");
    const again = await port.createWorld({ worktreeId: "attempt-healthy", baseCommit: basis.basisCommit });
    expect(Boolean(again.worldPath)).toBe(true);
  });
});

/* ================================================================== *
 * E. THE REMOTE CONTRACT
 * ================================================================== */

describe("R3-WR3 E. no remote may point back at the canonical repository", () => {
  it("a remote added after creation is REMOVED on reuse", async () => {
    const Current = await loadCurrent();
    const root = join(BASE, "e-remote");
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root);
    const worldsRoot = join(basis.repo, ".palimpsest", "worlds");
    const port = new Current(basis.repo, worldsRoot);
    const created = await port.createWorld({ worktreeId: "attempt-remote", baseCommit: basis.basisCommit });
    git(created.worldPath, ["remote", "add", "sneaky", basis.repo]);
    expect(gitQuiet(created.worldPath, ["remote"])).toBe("sneaky");
    await port.createWorld({ worktreeId: "attempt-remote", baseCommit: basis.basisCommit });
    expect(gitQuiet(created.worldPath, ["remote"])).toBe("");
  });

  it("a remote whose removal FAILS is refused, not silently accepted", async () => {
    /**
     * R3-WR2 wrapped `remote remove origin` in a bare `catch`, so a failed removal was indistinguishable from
     * "there was no origin". A DIRECTORY at `.git/config.lock` makes the removal genuinely fail while the config
     * stays readable — measured — which is the state that must surface as a refusal.
     */
    const Current = await loadCurrent();
    const root = join(BASE, "e-remote-stuck");
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root);
    const worldsRoot = join(basis.repo, ".palimpsest", "worlds");
    const port = new Current(basis.repo, worldsRoot);
    const created = await port.createWorld({ worktreeId: "attempt-stuck", baseCommit: basis.basisCommit });
    git(created.worldPath, ["remote", "add", "stuck", basis.repo]);
    const lockPath = join(created.worldPath, ".git", "config.lock");
    mkdirSync(lockPath, { recursive: true });
    try {
      await expect(port.createWorld({ worktreeId: "attempt-stuck", baseCommit: basis.basisCommit })).rejects.toThrow(/WORLD_REMOTE_NOT_REMOVED/u);
    } finally {
      rmSync(lockPath, { recursive: true, force: true });
    }
    expect(gitQuiet(created.worldPath, ["remote"])).toBe("stuck");
  });
});
