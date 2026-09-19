/**
 * GitPort: the external git side-channel behind every Palimpsest effect.
 *
 * The real implementation shells out to the git CLI; FakeGitPort is an
 * in-memory substitute used by the fault-injection suite so promotion crash
 * windows can be simulated deterministically without a real repository.
 */

import { execFile } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Executable wrapper: non-zero exit resolves with its code, like a gate runner. */
function runExecutable(
  executable: string,
  args: readonly string[],
  cwd: string,
): Promise<{ exitCode: number | null; outputTail: string }> {
  return new Promise((resolve) => {
    // The tail is diagnostics for the OBSERVATION, never a caller-editable field: it is what makes
    // an opaque exit code (pytest's 5 = "no tests ran") readable at the moment it matters.
    let output = "";
    const collect = (chunk: string | Buffer): void => {
      output += chunk.toString("utf8");
    };
    const child = execFile(executable, [...args], { cwd }, (error) => {
      let exitCode: number | null = 0;
      if (error !== null) {
        const code = (error as { code?: unknown }).code;
        exitCode = typeof code === "number" || typeof code === "string" ? Number(code) : null;
      }
      resolve({ exitCode, outputTail: output.slice(-500) });
    });
    child.stdout?.on("data", collect);
    child.stderr?.on("data", collect);
  });
}

interface CreateWorktreeInput {
  readonly worktreeId: string;
  readonly baseCommit: string;
}

interface CommitInput {
  readonly worktreeId: string;
  readonly message: string;
}

interface PromoteInput {
  readonly promotionId: string;
  readonly sourceCommit: string;
  readonly expectedHeadCommit: string;
}

interface GateCommandInput {
  readonly worktreeId: string;
  readonly executable: string;
  readonly argv: readonly string[];
}

/** PLMP-CTX-2 §2: read-only lexical scan over a worktree's text files. */
export interface LexicalScanInput {
  readonly worktreeId: string;
  readonly terms: readonly string[];
  /** Path substring filter relative to the worktree root; absent = whole tree. */
  readonly glob?: string | undefined;
  /** Match cap (default 64); the scan stops as soon as the cap is reached. */
  readonly maxMatches?: number | undefined;
}

export interface LexicalMatch {
  readonly path: string;
  readonly line: number;
  readonly snippet: string;
  readonly term: string;
}

export interface GitPort {
  /** Create (or reuse) an isolated worktree at baseCommit. */
  createWorktree(input: CreateWorktreeInput): Promise<{ worktreePath: string }>;
  /** Commit the current worktree state; returns the new commit id. */
  commit(input: CommitInput): Promise<{ commit: string }>;
  /**
   * Apply sourceCommit onto the expected head of the canonical branch.
   * Conflicting expectedHeadCommit fails. Returns the new head commit id.
   */
  promote(input: PromoteInput): Promise<{ resultingHeadCommit: string }>;
  /** Current head of the canonical branch (used by reconcilable recovery). */
  head(): Promise<string>;
  /** Does the canonical branch already contain this commit? (idempotency probe) */
  contains(commit: string): Promise<boolean>;
  /** Run a gate command inside a worktree; resolves the process outcome. */
  runGate(input: GateCommandInput): Promise<{ exitCode: number | null; outputTail: string }>;
  /**
   * Observe one tree's uncommitted state: changed paths vs HEAD plus the current head commit.
   * Read-only. In worktree mode the tree is the attempt worktree; in-place mode it is the
   * repository itself, and this observation is what replaces a worker's file claims.
   */
  observeWorktree(input: { worktreeId: string }): Promise<{
    head: string;
    changedPaths: string[];
    hasUncommittedChanges: boolean;
  }>;
  /**
   * PLMP-CTX-2 §2: read-only lexical retrieval over worktree text files.
   * Scans are not side effects - they are deliberately NOT Ordarium actions;
   * the audit trail lives in the context manifest, not the operations ledger.
   */
  scanLexical(input: LexicalScanInput): Promise<LexicalMatch[]>;
  /**
   * PLMP-CTX-3 §1.2: read-only raw text collection - the semantic channel's
   * input material (same read-only discipline as scanLexical).
   */
  collectWorktreeTexts(input: {
    worktreeId: string;
    maxFiles?: number | undefined;
    maxBytesPerFile?: number | undefined;
  }): Promise<Array<{ path: string; content: string }>>;
}

interface FakeCommit {
  readonly id: string;
  readonly parents: readonly string[];
  readonly message: string;
  /** Canonical-branch commits carry null; worktree-local commits carry their worktree id. */
  readonly worktreeId: string | null;
}

let fakeCounter = 0;

/**
 * Deterministic in-memory implementation with real ancestry semantics.
 * Worktree commits are leaves off the canonical chain until promoted; a
 * commit is "contained" iff it is reachable from the canonical head (the
 * same test real `git merge-base --is-ancestor` answers). A promotion is a
 * merge commit with parents [head, source], so afterwards the source becomes
 * an ancestor of the head — exactly what lets reconcilable recovery
 * distinguish Crash A (nothing merged) from Crash B (merge landed, ledger
 * write lost).
 */
export class FakeGitPort implements GitPort {
  readonly #worktrees = new Map<string, string>(); // worktreeId -> worktree commit
  readonly #commits = new Map<string, FakeCommit>();
  readonly #gateOutcomes = new Map<string, number | null>();
  readonly #gateQueue: Array<{ executable: string; argv: readonly string[]; exitCode: number | null }> = [];
  readonly #files = new Map<string, Map<string, string>>(); // worktreeId -> path -> content
  #head: string;

  constructor(initialCommit = "0".repeat(40)) {
    this.#head = initialCommit;
    this.#commits.set(initialCommit, {
      id: initialCommit,
      parents: [],
      message: "initial",
      worktreeId: null,
    });
  }

  async createWorktree(input: CreateWorktreeInput): Promise<{ worktreePath: string }> {
    if (this.#worktrees.has(input.worktreeId)) {
      return { worktreePath: `worktree:${input.worktreeId}` };
    }
    if (!this.#commits.has(input.baseCommit)) {
      throw new Error(`unknown base commit ${input.baseCommit}`);
    }
    this.#worktrees.set(input.worktreeId, input.baseCommit);
    return { worktreePath: `worktree:${input.worktreeId}` };
  }

  async commit(input: CommitInput): Promise<{ commit: string }> {
    const parent = this.#worktrees.get(input.worktreeId);
    if (parent === undefined) {
      throw new Error(`unknown worktree ${input.worktreeId}`);
    }
    const id = nextFakeCommitId();
    this.#commits.set(id, {
      id,
      parents: [parent],
      message: input.message,
      worktreeId: input.worktreeId,
    });
    this.#worktrees.set(input.worktreeId, id);
    return { commit: id };
  }

  /** All commits reachable from the canonical head (used by contains/promote). */
  #ancestors(): Set<string> {
    const seen = new Set<string>();
    const queue = [this.#head];
    while (queue.length > 0) {
      const cursor = queue.pop()!;
      if (seen.has(cursor)) continue;
      seen.add(cursor);
      for (const parent of this.#commits.get(cursor)?.parents ?? []) {
        queue.push(parent);
      }
    }
    return seen;
  }

  async promote(input: PromoteInput): Promise<{ resultingHeadCommit: string }> {
    if (this.#ancestors().has(input.sourceCommit)) {
      throw new Error(`source commit ${input.sourceCommit} is already promoted`);
    }
    if (this.#head !== input.expectedHeadCommit) {
      throw new Error(
        `expected head ${input.expectedHeadCommit} does not match current head ${this.#head}`,
      );
    }
    const id = nextFakeCommitId();
    this.#commits.set(id, {
      id,
      parents: [this.#head, input.sourceCommit],
      message: `promote ${input.promotionId}`,
      worktreeId: null,
    });
    this.#head = id;
    return { resultingHeadCommit: id };
  }

  async head(): Promise<string> {
    return this.#head;
  }

  /** True iff the commit is reachable from the canonical head (--is-ancestor). */
  async contains(commit: string): Promise<boolean> {
    return this.#ancestors().has(commit);
  }

  readonly #dirty = new Map<string, string[]>();

  async observeWorktree(input: { worktreeId: string }): Promise<{
    head: string;
    changedPaths: string[];
    hasUncommittedChanges: boolean;
  }> {
    // The fake world: a worktree's head is its leaf commit (the canonical head when the attempt
    // never committed), and dirtiness is what a test declared via markWorktreeDirty.
    const head = this.#worktrees.get(input.worktreeId) ?? this.#head;
    const changedPaths = this.#dirty.get(input.worktreeId) ?? [];
    return { head, changedPaths, hasUncommittedChanges: changedPaths.length > 0 };
  }

  /** Test seam: declare a worktree's uncommitted paths, as a real `git status` would report. */
  markWorktreeDirty(worktreeId: string, paths: readonly string[]): void {
    this.#dirty.set(worktreeId, [...paths]);
  }

  async runGate(input: GateCommandInput): Promise<{ exitCode: number | null; outputTail: string }> {
    // Sequential queue first (consumed in order of execution); unit-tests use
    // this to script "first attempt fails, second succeeds".
    const queued = this.#gateQueue.findIndex(
      (entry) => entry.executable === input.executable && arraysEqual(entry.argv, input.argv),
    );
    if (queued >= 0) {
      const [entry] = this.#gateQueue.splice(queued, 1);
      return { exitCode: entry!.exitCode, outputTail: "" };
    }
    const key = `${input.worktreeId}:${input.executable}:${input.argv.join(" ")}`;
    if (this.#gateOutcomes.has(key)) {
      return { exitCode: this.#gateOutcomes.get(key) ?? null, outputTail: "" };
    }
    // Unscripted runs SUCCEED in the fake world: tests that gate as a means (invalidation,
    // promotion flows) script failures explicitly, and the real port observes reality.
    return { exitCode: 0, outputTail: "" };
  }

  /** Test seam: enqueue one gate outcome, consumed by the next matching run. */
  queueGateOutcome(executable: string, argv: readonly string[], exitCode: number | null): void {
    this.#gateQueue.push({ executable, argv: [...argv], exitCode });
  }

  /** Test seam: pre-script a gate outcome for an executable+argv. */
  setGateOutcome(
    worktreeId: string,
    executable: string,
    argv: readonly string[],
    exitCode: number | null,
  ): void {
    const key = `${worktreeId}:${executable}:${argv.join(" ")}`;
    this.#gateOutcomes.set(key, exitCode);
  }

  /** Test seam: seed in-memory worktree files for the lexical scan. */
  seedWorktreeFiles(worktreeId: string, files: Record<string, string>): void {
    this.#files.set(worktreeId, new Map(Object.entries(files)));
  }

  async scanLexical(input: LexicalScanInput): Promise<LexicalMatch[]> {
    const files = this.#files.get(input.worktreeId);
    if (files === undefined) return [];
    return collectLexicalMatches(
      [...files.entries()].map(([path, content]) => ({ path, content })),
      input,
    );
  }

  async collectWorktreeTexts(input: {
    worktreeId: string;
    maxFiles?: number | undefined;
    maxBytesPerFile?: number | undefined;
  }): Promise<Array<{ path: string; content: string }>> {
    const files = this.#files.get(input.worktreeId);
    if (files === undefined) return [];
    const maxFiles = input.maxFiles ?? 64;
    const maxBytesPerFile = input.maxBytesPerFile ?? 65_536;
    return [...files.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(0, maxFiles)
      .filter(([, content]) => Buffer.byteLength(content, "utf8") <= maxBytesPerFile)
      .map(([path, content]) => ({ path, content }));
  }
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

/**
 * Shared term-over-line matcher (PLMP-CTX-2 §2): case-insensitive, first
 * matching term wins per line, deterministic path/line order, capped.
 */
function collectLexicalMatches(
  files: ReadonlyArray<{ path: string; content: string }>,
  input: LexicalScanInput,
): LexicalMatch[] {
  const maxMatches = input.maxMatches ?? 64;
  const terms = input.terms.map((term) => term.toLowerCase());
  if (terms.length === 0 || maxMatches <= 0) return [];
  const matches: LexicalMatch[] = [];
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    if (matches.length >= maxMatches) break;
    if (input.glob !== undefined && !file.path.includes(input.glob)) continue;
    const lines = file.content.split("\n");
    for (let index = 0; index < lines.length && matches.length < maxMatches; index += 1) {
      const lower = lines[index]!.toLowerCase();
      const term = terms.find((candidate) => lower.includes(candidate));
      if (term === undefined) continue;
      matches.push({
        path: file.path,
        line: index + 1,
        snippet: lines[index]!.trim().slice(0, 200),
        term,
      });
    }
  }
  return matches;
}

function nextFakeCommitId(): string {
  fakeCounter += 1;
  return fakeCounter.toString(16).padStart(40, "0");
}

/**
 * Real implementation over the git CLI. Worktrees live under `.palimpsest/`
 * of the canonical repository; the canonical branch is `main` in the real
 * repo. Reconcile (head/contains) maps to `git rev-parse` / `git merge-base`.
 */
export class GitCliPort implements GitPort {
  readonly #repository: string;
  readonly #worktreeRoot: string;

  constructor(repository: string, worktreeRoot: string) {
    this.#repository = repository;
    this.#worktreeRoot = worktreeRoot;
  }

  async #git(args: string[], cwd = this.#repository): Promise<string> {
    const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8" });
    return stdout.trim();
  }

  worktreePath(worktreeId: string): string {
    return `${this.#worktreeRoot}/${worktreeId}`;
  }

  /** The canonical repository directory — the tree an in-place attempt works in and is judged in. */
  get repository(): string {
    return this.#repository;
  }

  async createWorktree(input: CreateWorktreeInput): Promise<{ worktreePath: string }> {
    const path = this.worktreePath(input.worktreeId);
    await this.#git(["worktree", "add", path, input.baseCommit]);
    return { worktreePath: path };
  }

  async commit(input: CommitInput): Promise<{ commit: string }> {
    const cwd = this.worktreePath(input.worktreeId);
    await this.#git(["add", "-A"], cwd);
    await this.#git(["commit", "-m", input.message], cwd);
    const commit = await this.#git(["rev-parse", "HEAD"], cwd);
    return { commit };
  }

  /**
   * In-place observation over the repository directory itself (the worktreeId names nothing
   * here — in-place attempts work in the canonical tree). `git status --porcelain` is the
   * observation of what changed vs HEAD; a rename shows as its two porcelain tokens, which
   * still names every path the attempt touched.
   */
  async observeWorktree(input: { worktreeId: string }): Promise<{
    head: string;
    changedPaths: string[];
    hasUncommittedChanges: boolean;
  }> {
    // In-place observation always reads the canonical repository directory.
    const cwd = this.#repository;
    const out = await this.#git(["status", "--porcelain"], cwd);
    const changedPaths = out
      .split(String.fromCharCode(10))
      .filter((line) => line.trim() !== "")
      .map((line) => line.slice(3).trim().replace(/^"|"$/g, ""));
    const head = await this.#git(["rev-parse", "HEAD"], cwd);
    return { head, changedPaths, hasUncommittedChanges: changedPaths.length > 0 };
  }

  async promote(input: PromoteInput): Promise<{ resultingHeadCommit: string }> {
    const expected = await this.head();
    if (expected !== input.expectedHeadCommit) {
      throw new Error(`expected head ${input.expectedHeadCommit} does not match ${expected}`);
    }
    await this.#git(["merge", "--no-ff", "-m", `promote ${input.promotionId}`, input.sourceCommit]);
    const head = await this.head();
    return { resultingHeadCommit: head };
  }

  async head(): Promise<string> {
    return this.#git(["rev-parse", "HEAD"]);
  }

  async contains(commit: string): Promise<boolean> {
    try {
      const merged = await this.#git(["merge-base", "--is-ancestor", commit, "HEAD"]);
      void merged;
      return true;
    } catch {
      return false;
    }
  }

  async runGate(input: GateCommandInput): Promise<{ exitCode: number | null; outputTail: string }> {
    return runExecutable(input.executable, input.argv, this.worktreePath(input.worktreeId));
  }

  async scanLexical(input: LexicalScanInput): Promise<LexicalMatch[]> {
    const root = this.worktreePath(input.worktreeId);
    const files = this.#walkTexts(root, { maxFiles: 4_096, maxBytesPerFile: 1_000_000 });
    return collectLexicalMatches(files, input);
  }

  async collectWorktreeTexts(input: {
    worktreeId: string;
    maxFiles?: number | undefined;
    maxBytesPerFile?: number | undefined;
  }): Promise<Array<{ path: string; content: string }>> {
    const root = this.worktreePath(input.worktreeId);
    return this.#walkTexts(root, {
      maxFiles: input.maxFiles ?? 64,
      maxBytesPerFile: input.maxBytesPerFile ?? 65_536,
    });
  }

  #walkTexts(
    root: string,
    limits: { maxFiles: number; maxBytesPerFile: number },
  ): Array<{ path: string; content: string }> {
    const files: Array<{ path: string; content: string }> = [];
    const walk = (directory: string): void => {
      if (files.length >= limits.maxFiles) return;
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === ".git") continue;
        const full = join(directory, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        try {
          if (statSync(full).size > limits.maxBytesPerFile) continue;
          files.push({
            path: relative(root, full).split("\\").join("/"),
            content: readFileSync(full, "utf8"),
          });
        } catch {
          // Unreadable files (permissions, transient writes) are skipped.
        }
      }
    };
    walk(root);
    return files;
  }
}
