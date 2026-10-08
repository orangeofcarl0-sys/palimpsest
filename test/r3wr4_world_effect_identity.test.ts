/**
 * R3-WR4 — WORLD/EFFECT IDENTITY AND UNOBSERVABLE-FAILURE TERMINAL REGRESSIONS.
 *
 * Every test pins a property this stage ENFORCES, and each is paired so the suite cannot pass by refusing
 * everything: a mutant that must be refused, and a healthy control that must be accepted.
 *
 * THE FALSIFIERS ARE THE POINT. The "before" side of each mutant is the REAL R3-WR3 compiled port, snapshotted
 * at the stage baseline `8c39c21` into `scripts/r3wr4/baseline/`, so "the old implementation violated this" is a
 * measurement against shipped code rather than a claim about it. One witness (candidate HEAD rewind) compares
 * against the R3-WR2 port instead, because R3-WR3 already fixed that defect — a witness that compared against an
 * already-fixed baseline could never fail. That choice is stated rather than hidden.
 *
 * The compiled port under test is reached by PATH and imported DYNAMICALLY, matching the other suites: a static
 * `import` from `dist` makes TypeScript treat the emitted declaration as an input and the build then refuses to
 * overwrite it (TS5055).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

const NL = String.fromCharCode(10);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = mkdtempSync(join(tmpdir(), "r3wr4-test-"));

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

/** The frozen R3-WR3 baseline, which is where this stage's two escaped defects live. */
async function loadR3WR3(): Promise<any> {
  const module = await import(pathToFileURL(join(REPO, "scripts", "r3wr4", "baseline", "git_port.r3wr3.mjs")).href);
  return module.GitCliPort;
}

/** The R3-WR2 baseline, for the one defect R3-WR3 already fixed. */
async function loadR3WR2(): Promise<any> {
  const module = await import(pathToFileURL(join(REPO, "scripts", "r3wr3", "baseline", "git_port.r3wr2.mjs")).href);
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

/**
 * The canonical repository's whole load-bearing surface, so "not mutated" is measurable.
 *
 * `.palimpsest/` is excluded from the status line for the same reason the observation path excludes it: it is
 * the PRODUCT's own state directory, and the port creating its worlds root there is expected rather than a
 * mutation of the project. Everything a project actually owns — HEAD, the symbolic ref, every ref, the remotes,
 * the commit identity and the tracked work tree — is still compared exactly.
 */
function canonicalDigest(repo: string): string {
  const trackedStatus = gitQuiet(repo, ["status", "--porcelain"])
    .split(String.fromCharCode(10))
    .filter((line) => line.trim() !== "" && !line.includes(".palimpsest/"))
    .join(String.fromCharCode(10));
  return createHash("sha256")
    .update(
      [
        gitQuiet(repo, ["rev-parse", "HEAD"]),
        gitQuiet(repo, ["symbolic-ref", "-q", "HEAD"]),
        gitQuiet(repo, ["show-ref"]),
        gitQuiet(repo, ["remote", "-v"]),
        gitQuiet(repo, ["config", "user.name"]),
        gitQuiet(repo, ["config", "user.email"]),
        trackedStatus,
      ].join("\u0000"),
    )
    .digest("hex");
}

/** A world's HEAD, index, work tree and Git config. */
function worldDigest(worldPath: string): string {
  const files: string[] = [];
  const walk = (dir: string, prefix = ""): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((left, right) => (left.name < right.name ? -1 : 1))) {
      if (entry.name === ".git") continue;
      const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else files.push(`${rel}:${readFileSync(join(dir, entry.name), "utf8")}`);
    }
  };
  try {
    walk(worldPath);
  } catch {
    return "ABSENT";
  }
  return createHash("sha256")
    .update([gitQuiet(worldPath, ["rev-parse", "HEAD"]), gitQuiet(worldPath, ["status", "--porcelain"]), files.join(",")].join("\u0000"))
    .digest("hex");
}

const worldBinding = (worldPath: string): { attemptId: string; basisCommit: string } =>
  JSON.parse(readFileSync(join(worldPath, ".git", "palimpsest-world-binding.json"), "utf8")) as {
    attemptId: string;
    basisCommit: string;
  };

/* ================================================================== *
 * A. FROZEN BASIS IDENTITY
 * ================================================================== */

describe("R3-WR4 A. a world's basis is its ORIGINAL basis, not any ancestor of its HEAD", () => {
  /**
   * The §A2 counterexample: `B0 -> B1 -> X` built INSIDE a world created at B0. B1 is an ancestor of X, so an
   * ancestry test accepts a request for it — even though the world never started from B1.
   */
  const arrange = (root: string, Port: any) => {
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root);
    const port = new Port(basis.repo, join(basis.repo, ".palimpsest", "worlds"));
    return { basis, port };
  };

  const buildHistory = async (port: any, basis: { basisCommit: string }) => {
    const created = await port.createWorld({ worktreeId: "attempt-basis-identity", baseCommit: basis.basisCommit });
    writeFileSync(join(created.worldPath, "src", "step.mjs"), `export const step = 1;${NL}`, "utf8");
    git(created.worldPath, ["add", "-A"]);
    git(created.worldPath, ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "B1"]);
    const innerB1 = git(created.worldPath, ["rev-parse", "HEAD"]);
    writeFileSync(join(created.worldPath, "src", "candidate-only.mjs"), `export const candidate = 1;${NL}`, "utf8");
    git(created.worldPath, ["add", "src/candidate-only.mjs"]);
    writeFileSync(join(created.worldPath, "src", "uncommitted.mjs"), `export const pending = 1;${NL}`, "utf8");
    git(created.worldPath, ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "X"]);
    return { created, innerB1, candidateHead: git(created.worldPath, ["rev-parse", "HEAD"]) };
  };

  it("the OLD port ACCEPTS a request for an ancestor that is not the world's basis — the frozen defect", async () => {
    const Port = await loadR3WR3();
    const { basis, port } = arrange(join(BASE, "a-old"), Port);
    const { innerB1 } = await buildHistory(port, basis);
    let accepted = false;
    try {
      await port.createWorld({ worktreeId: "attempt-basis-identity", baseCommit: innerB1 });
      accepted = true;
    } catch {
      accepted = false;
    }
    expect(accepted, "the R3-WR3 ancestry test must be shown to accept a commit the world never started from").toBe(true);
  });

  it("the CURRENT port REFUSES it, and the world's HEAD, candidate and dirty work survive", async () => {
    const Port = await loadCurrent();
    const { basis, port } = arrange(join(BASE, "a-new"), Port);
    const { created, innerB1, candidateHead } = await buildHistory(port, basis);
    const before = worldDigest(created.worldPath);
    const canonicalBefore = canonicalDigest(basis.repo);

    await expect(port.createWorld({ worktreeId: "attempt-basis-identity", baseCommit: innerB1 })).rejects.toThrow(/WORLD_BASIS_MISMATCH/u);

    expect(gitQuiet(created.worldPath, ["rev-parse", "HEAD"])).toBe(candidateHead);
    expect(worldDigest(created.worldPath)).toBe(before);
    expect(canonicalDigest(basis.repo)).toBe(canonicalBefore);
    expect(existsSync(join(created.worldPath, "src", "candidate-only.mjs"))).toBe(true);
    expect(existsSync(join(created.worldPath, "src", "uncommitted.mjs"))).toBe(true);
  });

  it("a legitimate replay on the world's REAL basis is ACCEPTED — the control that keeps the rule honest", async () => {
    const Port = await loadCurrent();
    const { basis, port } = arrange(join(BASE, "a-control"), Port);
    const { created, candidateHead } = await buildHistory(port, basis);
    const again = await port.createWorld({ worktreeId: "attempt-basis-identity", baseCommit: basis.basisCommit });
    expect(Boolean(again.worldPath)).toBe(true);
    expect(gitQuiet(created.worldPath, ["rev-parse", "HEAD"])).toBe(candidateHead);
    expect(existsSync(join(created.worldPath, "src", "candidate-only.mjs"))).toBe(true);
  });

  it("the world RECORDS the attempt and the basis it was created for", async () => {
    const Port = await loadCurrent();
    const { basis, port } = arrange(join(BASE, "a-record"), Port);
    const created = await port.createWorld({ worktreeId: "attempt-recorded", baseCommit: basis.basisCommit });
    const binding = worldBinding(created.worldPath);
    expect(binding.attemptId).toBe("attempt-recorded");
    expect(binding.basisCommit).toBe(basis.basisCommit);
  });
});

/* ================================================================== *
 * B. GIT ADMINISTRATIVE AND COMMON-DIRECTORY OWNERSHIP
 * ================================================================== */

describe("R3-WR4 B. a world must own its Git administrative AND common directory", () => {
  it("the OLD port ACCEPTS a canonical common directory and MUTATES the canonical repository — the frozen defect", async () => {
    const Port = await loadR3WR3();
    const root = join(BASE, "b-old");
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root);
    git(basis.repo, ["remote", "add", "origin", "https://example.invalid/canonical.git"]);
    const port = new Port(basis.repo, join(basis.repo, ".palimpsest", "worlds"));
    const created = await port.createWorld({ worktreeId: "attempt-common", baseCommit: basis.basisCommit });
    const before = canonicalDigest(basis.repo);
    writeFileSync(join(created.worldPath, ".git", "commondir"), `${join(basis.repo, ".git").replace(/\\/gu, "/")}${NL}`, "utf8");
    let accepted = false;
    try {
      await port.createWorld({ worktreeId: "attempt-common", baseCommit: basis.basisCommit });
      accepted = true;
    } catch {
      accepted = false;
    }
    expect(accepted, "the R3-WR3 port must be shown to accept a world whose common dir is the canonical repository").toBe(true);
    expect(canonicalDigest(basis.repo), "and to mutate the canonical repository through it").not.toBe(before);
    expect(gitQuiet(basis.repo, ["remote", "-v"]), "the canonical origin remote is removed").toBe("");
  });

  it("the CURRENT port REFUSES it before any mutating command, leaving the canonical repository byte-identical", async () => {
    const Port = await loadCurrent();
    const root = join(BASE, "b-new");
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root);
    git(basis.repo, ["remote", "add", "origin", "https://example.invalid/canonical.git"]);
    const port = new Port(basis.repo, join(basis.repo, ".palimpsest", "worlds"));
    const created = await port.createWorld({ worktreeId: "attempt-common", baseCommit: basis.basisCommit });
    const before = canonicalDigest(basis.repo);
    writeFileSync(join(created.worldPath, ".git", "commondir"), `${join(basis.repo, ".git").replace(/\\/gu, "/")}${NL}`, "utf8");

    await expect(port.createWorld({ worktreeId: "attempt-common", baseCommit: basis.basisCommit })).rejects.toThrow(/WORLD_COMMON_DIR_NOT_ISOLATED/u);

    expect(canonicalDigest(basis.repo)).toBe(before);
    expect(gitQuiet(basis.repo, ["remote", "-v"])).toContain("origin");
    expect(gitQuiet(basis.repo, ["config", "user.name"])).not.toBe("Palimpsest Worker");
  });

  it("a common directory OUTSIDE the world is refused, named separately from canonical adoption", async () => {
    const Port = await loadCurrent();
    const root = join(BASE, "b-foreign");
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root);
    const port = new Port(basis.repo, join(basis.repo, ".palimpsest", "worlds"));
    const created = await port.createWorld({ worktreeId: "attempt-foreign", baseCommit: basis.basisCommit });
    const foreign = join(root, "foreign-common");
    mkdirSync(join(foreign, "refs"), { recursive: true });
    mkdirSync(join(foreign, "objects"), { recursive: true });
    writeFileSync(join(created.worldPath, ".git", "commondir"), `${foreign.replace(/\\/gu, "/")}${NL}`, "utf8");
    await expect(port.createWorld({ worktreeId: "attempt-foreign", baseCommit: basis.basisCommit })).rejects.toThrow(/WORLD_COMMON_DIR_OUTSIDE/u);
  });

  it("the NORMAL borrowed-object world is ACCEPTED — borrowing immutable objects is not foreign ownership", async () => {
    const Port = await loadCurrent();
    const root = join(BASE, "b-supported");
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root);
    const port = new Port(basis.repo, join(basis.repo, ".palimpsest", "worlds"));
    const created = await port.createWorld({ worktreeId: "attempt-supported", baseCommit: basis.basisCommit });

    /** The supported shape: an isolated common dir, borrowing objects through `alternates`. */
    expect(gitQuiet(created.worldPath, ["rev-parse", "--git-common-dir"])).toBe(".git");
    expect(existsSync(join(created.worldPath, ".git", "objects", "info", "alternates"))).toBe(true);

    const again = await port.createWorld({ worktreeId: "attempt-supported", baseCommit: basis.basisCommit });
    expect(again.worldPath).toBe(created.worldPath);
  });

  it("a LINKED WORKTREE at the world path is still refused, because its metadata belongs outside", async () => {
    const Port = await loadCurrent();
    const root = join(BASE, "b-linked");
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root);
    const worldsRoot = join(basis.repo, ".palimpsest", "worlds");
    const linked = join(worldsRoot, "attempt-linked");
    git(basis.repo, ["worktree", "add", "--detach", linked, basis.basisCommit]);
    const port = new Port(basis.repo, worldsRoot);
    await expect(port.createWorld({ worktreeId: "attempt-linked", baseCommit: basis.basisCommit })).rejects.toThrow(/WORLD_IDENTITY_MISMATCH/u);
  });
});

/* ================================================================== *
 * C. WORLD OWNERSHIP
 * ================================================================== */

describe("R3-WR4 C. a world that records another attempt as its owner is not adopted", () => {
  it("the OLD port ADOPTS a world whose record names a different attempt — the frozen defect", async () => {
    const Port = await loadR3WR3();
    const root = join(BASE, "c-old");
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root);
    const port = new Port(basis.repo, join(basis.repo, ".palimpsest", "worlds"));
    const created = await port.createWorld({ worktreeId: "attempt-A", baseCommit: basis.basisCommit });
    writeFileSync(
      join(created.worldPath, ".git", "palimpsest-world-binding.json"),
      `${JSON.stringify({ schemaVersion: 1, attemptId: "attempt-B", basisCommit: basis.basisCommit, repository: basis.repo })}${NL}`,
      "utf8",
    );
    let adopted = false;
    try {
      const again = await port.createWorld({ worktreeId: "attempt-A", baseCommit: basis.basisCommit });
      adopted = again.worldPath === created.worldPath;
    } catch {
      adopted = false;
    }
    expect(adopted, "the R3-WR3 port must be shown to adopt a world owned by another attempt").toBe(true);
  });

  it("the CURRENT port REFUSES it and leaves the other attempt's work in place", async () => {
    const Port = await loadCurrent();
    const root = join(BASE, "c-new");
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root);
    const port = new Port(basis.repo, join(basis.repo, ".palimpsest", "worlds"));
    const created = await port.createWorld({ worktreeId: "attempt-A", baseCommit: basis.basisCommit });
    writeFileSync(join(created.worldPath, "src", "belongs-to-B.mjs"), `export const b = 1;${NL}`, "utf8");
    git(created.worldPath, ["add", "-A"]);
    git(created.worldPath, ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "work belonging to another attempt"]);
    const headBefore = git(created.worldPath, ["rev-parse", "HEAD"]);
    writeFileSync(
      join(created.worldPath, ".git", "palimpsest-world-binding.json"),
      `${JSON.stringify({ schemaVersion: 1, attemptId: "attempt-B", basisCommit: basis.basisCommit, repository: basis.repo })}${NL}`,
      "utf8",
    );
    const before = worldDigest(created.worldPath);

    await expect(port.createWorld({ worktreeId: "attempt-A", baseCommit: basis.basisCommit })).rejects.toThrow(/WORLD_OWNER_MISMATCH/u);

    expect(gitQuiet(created.worldPath, ["rev-parse", "HEAD"])).toBe(headBefore);
    expect(worldDigest(created.worldPath)).toBe(before);
    expect(existsSync(join(created.worldPath, "src", "belongs-to-B.mjs"))).toBe(true);
  });
});

/* ================================================================== *
 * D. PROGRESS PRESERVATION AND PRIOR REGRESSIONS
 * ================================================================== */

describe("R3-WR4 D. candidate progress is preserved and the R3-WR3 regressions still hold", () => {
  it("the OLD port REWINDS a committed candidate to its basis — the defect R3-WR3 fixed, pinned against R3-WR2", async () => {
    const Port = await loadR3WR2();
    const root = join(BASE, "d-old");
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root);
    const port = new Port(basis.repo, join(basis.repo, ".palimpsest", "worlds"));
    const created = await port.createWorld({ worktreeId: "attempt-rewind", baseCommit: basis.basisCommit });
    writeFileSync(join(created.worldPath, "src", "candidate.mjs"), `export const candidate = 1;${NL}`, "utf8");
    git(created.worldPath, ["add", "-A"]);
    git(created.worldPath, ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "candidate"]);
    try {
      await port.createWorld({ worktreeId: "attempt-rewind", baseCommit: basis.basisCommit });
    } catch {
      /* a refusal is not the defect being measured here */
    }
    expect(gitQuiet(created.worldPath, ["rev-parse", "HEAD"])).toBe(basis.basisCommit);
    expect(existsSync(join(created.worldPath, "src", "candidate.mjs"))).toBe(false);
  });

  it("the CURRENT port PRESERVES the candidate, the dirty edit and the untracked file", async () => {
    const Port = await loadCurrent();
    const root = join(BASE, "d-new");
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root);
    const port = new Port(basis.repo, join(basis.repo, ".palimpsest", "worlds"));
    const created = await port.createWorld({ worktreeId: "attempt-preserve", baseCommit: basis.basisCommit });
    writeFileSync(join(created.worldPath, "src", "candidate.mjs"), `export const candidate = 1;${NL}`, "utf8");
    git(created.worldPath, ["add", "-A"]);
    git(created.worldPath, ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "candidate"]);
    const candidateHead = git(created.worldPath, ["rev-parse", "HEAD"]);
    writeFileSync(join(created.worldPath, "src", "ledger.mjs"), `export const answer = 7;${NL}`, "utf8");
    writeFileSync(join(created.worldPath, "notes.txt"), `untracked${NL}`, "utf8");

    const again = await port.createWorld({ worktreeId: "attempt-preserve", baseCommit: basis.basisCommit });
    expect(Boolean(again.worldPath)).toBe(true);
    expect(gitQuiet(created.worldPath, ["rev-parse", "HEAD"])).toBe(candidateHead);
    expect(existsSync(join(created.worldPath, "src", "candidate.mjs"))).toBe(true);
    expect(gitQuiet(created.worldPath, ["status", "--porcelain"])).toContain("src/ledger.mjs");
    expect(existsSync(join(created.worldPath, "notes.txt"))).toBe(true);
  });

  it("every prior R3-WR3 refusal still holds, and the canonical repository is untouched each time", async () => {
    const Port = await loadCurrent();
    const root = join(BASE, "d-regressions");
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root);
    const worldsRoot = join(basis.repo, ".palimpsest", "worlds");
    const port = new Port(basis.repo, worldsRoot);
    const before = canonicalDigest(basis.repo);

    /** A directory with no repository of its own. */
    const orphan = join(worldsRoot, "attempt-orphan-reg");
    mkdirSync(orphan, { recursive: true });
    writeFileSync(join(orphan, "README.md"), `orphan${NL}`, "utf8");
    await expect(port.createWorld({ worktreeId: "attempt-orphan-reg", baseCommit: basis.basisCommit })).rejects.toThrow(/WORLD_PATH_NOT_ISOLATED/u);

    /** Escaping world ids. */
    for (const form of ["..", "../escape", "a/b", "C:/abs"]) {
      await expect(port.createWorld({ worktreeId: form, baseCommit: basis.basisCommit }), `"${form}" must be refused`).rejects.toThrow(/WORLD_ID_ESCAPES_ROOT|WORLD_ID_INVALID/u);
    }

    /**
     * A partial world holding someone's work. The refusal NAME depends on where the directory sits: inside the
     * canonical repository Git resolves the ENCLOSING repository, so the isolation test fires first
     * (`WORLD_PATH_NOT_ISOLATED`); outside any repository the directory is `NOT_A_REPOSITORY` and the partial
     * check fires (`WORLD_PARTIAL_UNRECOVERABLE`). Both are refusals, and the property under test is the refusal
     * plus the preservation of the work — not which of two safe names was chosen.
     */
    const partial = join(worldsRoot, "attempt-partial-reg");
    mkdirSync(partial, { recursive: true });
    writeFileSync(join(partial, "work-in-progress.txt"), "partial", "utf8");
    await expect(port.createWorld({ worktreeId: "attempt-partial-reg", baseCommit: basis.basisCommit })).rejects.toThrow(/WORLD_PARTIAL_UNRECOVERABLE|WORLD_PATH_NOT_ISOLATED/u);
    expect(existsSync(join(partial, "work-in-progress.txt"))).toBe(true);

    expect(canonicalDigest(basis.repo)).toBe(before);
  });

  it("a remote whose removal FAILS is still refused, not silently accepted", async () => {
    const Port = await loadCurrent();
    const root = join(BASE, "d-remote");
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root);
    const port = new Port(basis.repo, join(basis.repo, ".palimpsest", "worlds"));
    const created = await port.createWorld({ worktreeId: "attempt-stuck", baseCommit: basis.basisCommit });
    git(created.worldPath, ["remote", "add", "stuck", basis.repo]);
    const lock = join(created.worldPath, ".git", "config.lock");
    mkdirSync(lock, { recursive: true });
    try {
      await expect(port.createWorld({ worktreeId: "attempt-stuck", baseCommit: basis.basisCommit })).rejects.toThrow(/WORLD_REMOTE_NOT_REMOVED/u);
    } finally {
      rmSync(lock, { recursive: true, force: true });
    }
    expect(gitQuiet(created.worldPath, ["remote"])).toBe("stuck");
  });
});

/* ================================================================== *
 * E. THE R3-WR3 ERRATUM IS RECORDED, NOT JUST CLAIMED
 * ================================================================== */

describe("R3-WR4 E. the R3-WR3 erratum downgrades the withdrawn claims", () => {
  it("the erratum withdraws the three unsupported interpretations and preserves the measurements", async () => {
    const contract = await import(pathToFileURL(join(REPO, "scripts", "r3wr4", "contract.mjs")).href);
    const erratum = contract.R3WR3_ERRATUM;
    const subjects = erratum.corrections.map((entry: { subject: string }) => entry.subject);
    expect(subjects).toEqual(["EFFECT_REPLAY_CONFLICT_DETECTED", "SERIALIZED_BY_RUNTIME", "IRRECOVERABLE_ATTEMPT_TERMINAL_PATH: CLOSED"]);
    expect(erratum.corrections.map((entry: { downgradedTo: string }) => entry.downgradedTo)).toEqual([
      "CROSS_OPERATION_WORLD_AUTHORITY: NOT_PROVEN",
      "SINGLE_FLIGHT_DISPATCH: NOT_PROVEN",
      "UNOBSERVABLE_WORLD_TERMINALIZATION: NOT_PROVEN",
    ]);
    /** The measurements are retained rather than erased. */
    for (const correction of erratum.corrections) {
      expect(String(correction.retainedMeasurement).length).toBeGreaterThan(0);
    }
    expect(erratum.preserves.commits).toEqual(["48242cb", "7555047", "9c7fbea", "8c39c21"]);
  });

  it("the withdrawn concurrency criterion is shown unable to fail", () => {
    /** `fulfilled + rejected === attempted` is a tautology for `Promise.allSettled`, for any outcome. */
    const outcomes = [
      { fulfilled: 6, rejected: 0, attempted: 6 },
      { fulfilled: 0, rejected: 6, attempted: 6 },
      { fulfilled: 3, rejected: 3, attempted: 6 },
    ];
    for (const outcome of outcomes) {
      expect(outcome.fulfilled + outcome.rejected).toBe(outcome.attempted);
    }
  });
});
