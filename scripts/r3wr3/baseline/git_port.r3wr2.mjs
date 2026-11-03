/**
 * GitPort: the external git side-channel behind every Palimpsest effect.
 *
 * The real implementation shells out to the git CLI; FakeGitPort is an
 * in-memory substitute used by the fault-injection suite so promotion crash
 * windows can be simulated deterministically without a real repository.
 */
import { execFile, execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
/** Executable wrapper: non-zero exit resolves with its code, like a gate runner. */
function runExecutable(executable, args, cwd) {
    return new Promise((resolve) => {
        // The tail is diagnostics for the OBSERVATION, never a caller-editable field: it is what makes
        // an opaque exit code (pytest's 5 = "no tests ran") readable at the moment it matters.
        let output = "";
        const collect = (chunk) => {
            output += chunk.toString("utf8");
        };
        const child = execFile(executable, [...args], { cwd }, (error) => {
            let exitCode = 0;
            if (error !== null) {
                const code = error.code;
                /* Only a NUMBER is a process exit code. A string code is a spawn-level errno name
                   (ENOENT, EACCES) — the process never ran, so there is no exit code to observe, and
                   `Number("ENOENT")` is NaN, which is neither a code nor an honest null. Measured: a
                   deployment whose PATH lacks the gate executable reported `exitCode must be an integer
                   or null` instead of "no observation", because NaN travelled through the action output. */
                exitCode = typeof code === "number" && Number.isInteger(code) ? code : null;
            }
            resolve({ exitCode, outputTail: output.slice(-500) });
        });
        child.stdout?.on("data", collect);
        child.stderr?.on("data", collect);
    });
}
/**
 * The OPERATIONAL git identity a world's candidate commits carry.
 *
 *   GitAuthorMetadata  !=  PalimpsestAgentIdentity
 *
 * It records where the commit came from ("a Palimpsest worker execution"), never that it is the user
 * and never that it is a durable agent. Work truth does not depend on it.
 */
export const WORKER_COMMIT_NAME = "Palimpsest Worker";
export const WORKER_COMMIT_EMAIL = "worker@palimpsest.invalid";
/** §D5-c3: the promotion authority's own operational identity for its merge commits. */
export const PROMOTION_COMMIT_NAME = "Palimpsest Promotion Authority";
export const PROMOTION_COMMIT_EMAIL = "promotion@palimpsest.invalid";
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
export class FakeGitPort {
    #worktrees = new Map(); // worktreeId -> worktree commit
    #commits = new Map();
    #gateOutcomes = new Map();
    #gateQueue = [];
    #files = new Map(); // worktreeId -> path -> content
    #head;
    constructor(initialCommit = "0".repeat(40)) {
        this.#head = initialCommit;
        this.#commits.set(initialCommit, {
            id: initialCommit,
            parents: [],
            message: "initial",
            worktreeId: null,
        });
    }
    /**
     * The in-memory world. It deliberately exposes NO `worldPath`: there is no filesystem here, so a
     * placement in this port is not observable, and the Work owner's observation returns null for it
     * rather than pretending to read a tree (that is exactly the rule §D2-a established).
     */
    async createWorld(input) {
        const created = await this.createWorktree(input);
        return { worldPath: created.worktreePath };
    }
    async createWorktree(input) {
        if (this.#worktrees.has(input.worktreeId)) {
            return { worktreePath: `worktree:${input.worktreeId}` };
        }
        if (!this.#commits.has(input.baseCommit)) {
            throw new Error(`unknown base commit ${input.baseCommit}`);
        }
        this.#worktrees.set(input.worktreeId, input.baseCommit);
        return { worktreePath: `worktree:${input.worktreeId}` };
    }
    async commit(input) {
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
    #ancestors() {
        const seen = new Set();
        const queue = [this.#head];
        while (queue.length > 0) {
            const cursor = queue.pop();
            if (seen.has(cursor))
                continue;
            seen.add(cursor);
            for (const parent of this.#commits.get(cursor)?.parents ?? []) {
                queue.push(parent);
            }
        }
        return seen;
    }
    async promote(input) {
        if (this.#ancestors().has(input.sourceCommit)) {
            throw new Error(`source commit ${input.sourceCommit} is already promoted`);
        }
        if (this.#head !== input.expectedHeadCommit) {
            throw new Error(`expected head ${input.expectedHeadCommit} does not match current head ${this.#head}`);
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
    async head() {
        return this.#head;
    }
    /** True iff the commit is reachable from the canonical head (--is-ancestor). */
    async contains(commit) {
        return this.#ancestors().has(commit);
    }
    #dirty = new Map();
    async observeWorktree(input) {
        // The fake world: a worktree's head is its leaf commit (the canonical head when the attempt
        // never committed), and dirtiness is what a test declared via markWorktreeDirty.
        const head = this.#worktrees.get(input.worktreeId) ?? this.#head;
        const changedPaths = this.#dirty.get(input.worktreeId) ?? [];
        return { head, changedPaths, hasUncommittedChanges: changedPaths.length > 0 };
    }
    /** Test seam: declare a worktree's uncommitted paths, as a real `git status` would report. */
    markWorktreeDirty(worktreeId, paths) {
        this.#dirty.set(worktreeId, [...paths]);
    }
    async runGate(input) {
        // Sequential queue first (consumed in order of execution); unit-tests use
        // this to script "first attempt fails, second succeeds".
        const queued = this.#gateQueue.findIndex((entry) => entry.executable === input.executable && arraysEqual(entry.argv, input.argv));
        if (queued >= 0) {
            const [entry] = this.#gateQueue.splice(queued, 1);
            return { exitCode: entry.exitCode, outputTail: "" };
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
    queueGateOutcome(executable, argv, exitCode) {
        this.#gateQueue.push({ executable, argv: [...argv], exitCode });
    }
    /** Test seam: pre-script a gate outcome for an executable+argv. */
    setGateOutcome(worktreeId, executable, argv, exitCode) {
        const key = `${worktreeId}:${executable}:${argv.join(" ")}`;
        this.#gateOutcomes.set(key, exitCode);
    }
    /** Test seam: seed in-memory worktree files for the lexical scan. */
    seedWorktreeFiles(worktreeId, files) {
        this.#files.set(worktreeId, new Map(Object.entries(files)));
    }
    async scanLexical(input) {
        const files = this.#files.get(input.worktreeId);
        if (files === undefined)
            return [];
        return collectLexicalMatches([...files.entries()].map(([path, content]) => ({ path, content })), input);
    }
    async collectWorktreeTexts(input) {
        const files = this.#files.get(input.worktreeId);
        if (files === undefined)
            return [];
        const maxFiles = input.maxFiles ?? 64;
        const maxBytesPerFile = input.maxBytesPerFile ?? 65_536;
        return [...files.entries()]
            .sort((a, b) => (a[0] < b[0] ? -1 : 1))
            .slice(0, maxFiles)
            .filter(([, content]) => Buffer.byteLength(content, "utf8") <= maxBytesPerFile)
            .map(([path, content]) => ({ path, content }));
    }
}
function arraysEqual(left, right) {
    return left.length === right.length && left.every((item, index) => item === right[index]);
}
/**
 * Shared term-over-line matcher (PLMP-CTX-2 §2): case-insensitive, first
 * matching term wins per line, deterministic path/line order, capped.
 */
function collectLexicalMatches(files, input) {
    const maxMatches = input.maxMatches ?? 64;
    const terms = input.terms.map((term) => term.toLowerCase());
    if (terms.length === 0 || maxMatches <= 0)
        return [];
    const matches = [];
    for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) {
        if (matches.length >= maxMatches)
            break;
        if (input.glob !== undefined && !file.path.includes(input.glob))
            continue;
        const lines = file.content.split("\n");
        for (let index = 0; index < lines.length && matches.length < maxMatches; index += 1) {
            const lower = lines[index].toLowerCase();
            const term = terms.find((candidate) => lower.includes(candidate));
            if (term === undefined)
                continue;
            matches.push({
                path: file.path,
                line: index + 1,
                snippet: lines[index].trim().slice(0, 200),
                term,
            });
        }
    }
    return matches;
}
function nextFakeCommitId() {
    fakeCounter += 1;
    return fakeCounter.toString(16).padStart(40, "0");
}
/**
 * Real implementation over the git CLI. Worktrees live under `.palimpsest/`
 * of the canonical repository; the canonical branch is `main` in the real
 * repo. Reconcile (head/contains) maps to `git rev-parse` / `git merge-base`.
 */
export class GitCliPort {
    #repository;
    #worktreeRoot;
    constructor(repository, worktreeRoot) {
        this.#repository = repository;
        this.#worktreeRoot = worktreeRoot;
    }
    async #git(args, cwd = this.#repository) {
        const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8" });
        return stdout.trim();
    }
    /**
     * The world root: `.palimpsest/worlds/<attemptId>`, deterministic so a restart can REOPEN the same
     * world instead of inventing a new one.
     */
    worldPath(worldId) {
        return `${this.#worktreeRoot}/${worldId}`;
    }
    /**
     * Compatibility alias: the linked-worktree spelling of the same path.
     *
     * PLMP-LEAN-1 §D2-cR: this is a NAME, not a mechanism. The old `createWorktree` really did create a
     * linked worktree; `worldPath` now points at the same deterministic location so nothing that only
     * reads the path has to care which backend materialized it.
     */
    worktreePath(worktreeId) {
        return this.worldPath(worktreeId);
    }
    /**
     * Materialize the EXECUTION WORLD: a repository that owns its mutable git state.
     *
     *   git clone --shared --no-checkout <canonical> <world>   borrowed objects, no history copy
     *   git checkout --detach <basisCommit>                    the exact basis
     *   git remote remove origin                               no explicit path back into the project
     *   user.name/user.email                                   who authored the candidate commit
     *
     * `--shared` is deliberate and so is the naming: this is a "self-contained MUTABLE repository
     * world", not a fully self-contained one. Immutable objects stay borrowed read-only through
     * `.git/objects/info/alternates`; everything that must be WRITABLE — HEAD, refs, index, config and
     * new objects — lives inside the world, which is exactly what a `workspace-write` sandbox rooted at
     * the world's directory can grant.
     *
     * The commit identity is OPERATIONAL, not an agent identity: it says "this candidate commit came
     * from a Palimpsest worker", never "this is the user" and never "this is a durable agent".
     *
     * ## REUSE, NOT RE-CREATION (R3-WR2)
     *
     * `palimpsest.world.create` is declared `effects.idempotent()`, and Ordarium relies on that
     * declaration: when an invocation throws AFTER the clone succeeded, the operation is left UNCERTAIN
     * and its recovery path for an idempotent action is `redispatch-same-key`, which re-runs THIS action
     * with the same world id. So "the same world id reuses the path" is not a description — it is the
     * convergence condition of the recovery engine.
     *
     * Running `git clone` unconditionally made that condition false: the second call failed with
     * "destination path already exists and is not an empty directory", so a redispatch could never
     * converge and the attempt stayed unresolved. The world is therefore REUSED when it already exists:
     * the clone is skipped, the basis checkout is re-applied, and the identity is re-stamped.
     *
     * Reuse is the SAFE direction, and deliberately not "delete and re-clone". A world that exists may
     * hold a worker's uncommitted work, and `checkout --detach` at the SAME commit preserves it (measured:
     * a modified file survives). Re-cloning would destroy it, which is the outcome the readiness rule
     * below forbids.
     */
    async createWorld(input) {
        const path = this.worldPath(input.worktreeId);
        if (!this.#worldExists(path)) {
            await this.#git(["clone", "--shared", "--no-checkout", this.#repository, path], this.#repository);
        }
        /**
         * Re-applied on every call, including a reuse. For a reused world this is the operation that makes
         * the action converge on the SAME basis; for a fresh clone it is what moves HEAD off the clone's
         * default branch. It is not a reset: at the same commit it leaves a dirty tree alone.
         */
        await this.#git(["checkout", "--detach", input.baseCommit], path);
        try {
            await this.#git(["remote", "remove", "origin"], path);
        }
        catch {
            // A clone always has an origin; a port reused over an existing world may not. Either way the
            // contract is "no remote pointing at the canonical project", and its absence satisfies it.
        }
        await this.#git(["config", "user.name", WORKER_COMMIT_NAME], path);
        await this.#git(["config", "user.email", WORKER_COMMIT_EMAIL], path);
        await this.#assertWorldCommitCapable(path, input.baseCommit);
        return { worldPath: path };
    }
    /**
     * Whether `path` already holds a world.
     *
     * `.git` is NOT assumed to be a directory: in a linked worktree it is a FILE holding a `gitdir:`
     * pointer, and this port's own history includes a linked-worktree backend. Testing for `.git` with
     * `existsSync` alone is the weaker form; the strong form is asking GIT, so `rev-parse` is the
     * authority and the filesystem check is only a fast path. A path that exists but is not a repository
     * is therefore NOT reused — it falls through to the clone, which reports the collision honestly
     * rather than this method pretending it is a world.
     */
    #worldExists(path) {
        try {
            if (!statSync(path).isDirectory())
                return false;
        }
        catch {
            return false;
        }
        return this.#gitSync(["rev-parse", "--git-dir"], path) !== undefined;
    }
    /**
     * A synchronous git call for the reuse test, which must decide BEFORE any await so the check and the
     * clone cannot interleave with another caller's world creation.
     */
    #gitSync(args, cwd) {
        try {
            return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
        }
        catch {
            return undefined;
        }
    }
    /**
     * THE WORLD MUST BE COMMIT-CAPABLE BEFORE A WORKER IS HANDED IT.
     *
     * A `--shared` world borrows its immutable objects through `.git/objects/info/alternates`. If that borrowed
     * store is unreadable when the worker runs, the worker's `git commit` fails with
     * `fatal: could not parse HEAD` — and every OTHER readiness signal still looks healthy: HEAD resolves, the
     * status is clean, and the world opens. So without an explicit check the runtime declares the attempt usable
     * and the worker discovers otherwise, which is exactly the failure R3-WR was opened for: an attempt that stays
     * RUNNING with no result, and a next generation blocked by `quiescence_required`.
     *
     * ## WHY THIS IS AN ALLOWLIST AND NOT A LIST OF ERROR STRINGS (R3-WR2)
     *
     * R3-WR decided capability by matching the failure TEXT against a list of known object-store errors. That
     * shape is FAIL-OPEN: a failure git has not emitted before — or emits in another locale — matches nothing
     * and falls through to READY. Measured, two such failures exist on this host:
     *
     *     a corrupt index          `fatal: .git/index: index file smaller than expected`   (exit 128)
     *     a held index.lock        `fatal: Unable to create '...index.lock': File exists`   (exit 128)
     *
     * Both matched NO pattern in the old list, so a world that could not commit was declared READY. The check is
     * therefore POSITIVE: git is asked four questions whose answers are exit codes, and READY requires all four.
     * No message is matched, so a locale, a wording change, or an unseen error cannot defeat it.
     *
     *     1  `rev-parse --verify HEAD^{commit}`   the world names a COMMIT, not merely a ref
     *     2  `cat-file -e <basis>^{commit}`       the borrowed store can deliver the basis
     *     3  `status --porcelain`                 the INDEX is readable (this is what a corrupt index breaks)
     *     4  `commit --dry-run`                   git reports 0 (would commit) or 1 (nothing to commit)
     *
     * Step 4's exit 1 is honoured ONLY together with an empty tracked status, i.e. as git's own "nothing to
     * commit". Accepting a bare exit 1 would also accept a pre-commit hook refusing on a world that DOES hold
     * staged work — a world that cannot commit while claiming to be ready, which is the failure class this gate
     * exists to catch.
     *
     * `--dry-run` is used rather than a real commit so the check cannot alter the world it is checking. It does
     * NOT run the pre-commit hook (git's own behaviour), so a hook-only refusal is not detected here; that is a
     * stated limit of this check rather than a claim it covers every possible failure.
     *
     * POINT-IN-TIME, AND SAYING SO. These four facts establish that the world was commit-capable WHEN PREPARED.
     * They are not a promise that a later commit will succeed: the borrowed store can become unreadable after
     * this returns, which is what R3-WR2 Gate D measures. The lifetime question is answered separately, by the
     * borrow-chain lifetime matrix, and this check does not claim to answer it.
     *
     * Failing closed is the contract, not a convenience. A world that cannot commit must make worker readiness
     * fail rather than produce an attempt that looks usable, and it must NOT be silently re-created: a world that
     * should exist may have held uncommitted work.
     */
    async #assertWorldCommitCapable(path, baseCommit) {
        const head = await this.#gitExit(["rev-parse", "--verify", "HEAD^{commit}"], path);
        if (head.exit !== 0) {
            throw new Error(`WORLD_NOT_COMMIT_CAPABLE: the world at "${path}" cannot name a commit at HEAD, so a worker could not commit in it. Refusing rather than creating a misleading usable attempt. Detail: ${head.text.slice(0, 240)}`);
        }
        const basis = await this.#gitExit(["cat-file", "-e", `${baseCommit}^{commit}`], path);
        if (basis.exit !== 0) {
            throw new Error(`WORLD_NOT_COMMIT_CAPABLE: the world at "${path}" cannot read its own basis commit ${baseCommit.slice(0, 12)} through its borrowed object store, so a worker could not commit in it. Refusing rather than creating a misleading usable attempt. Detail: ${basis.text.slice(0, 240)}`);
        }
        /**
         * `--untracked-files=no` because untracked files are a normal worker state and must not be read as
         * staged work. The check is POSITIVE: exit 0 means git can read the index and the work tree at all.
         * A corrupt index fails HERE as well as at the dry run, so the two witnesses agree.
         */
        const status = await this.#gitExit(["status", "--porcelain", "--untracked-files=no"], path);
        if (status.exit !== 0) {
            throw new Error(`WORLD_NOT_COMMIT_CAPABLE: the world at "${path}" has an unreadable index or work tree — \`git status\` failed — so a worker could not commit in it. Refusing rather than creating a misleading usable attempt. Detail: ${status.text.slice(0, 240)}`);
        }
        const dry = await this.#gitExit(["commit", "--dry-run", "-m", "world readiness probe"], path);
        /**
         * Exit 1 is accepted UNCONDITIONALLY, and that is safe because of a measured property of git rather than
         * an assumption: `--dry-run` does NOT run the `pre-commit` hook. Measured on this host — a world with a
         * refusing `pre-commit` and staged work still exits 0, so a hook refusal can never masquerade as exit 1.
         * Exit 1 therefore has exactly one meaning here: git reports nothing to commit, which is the legitimate
         * state of a clean world AND of a world whose worker has made unstaged edits — the state a resumed
         * attempt is in. Requiring a clean tracked status would have refused that resume state, which is why the
         * criterion is the exit code and not the status text.
         *
         * Every OTHER exit is a refusal. The measured failures land at 128 (a corrupt index, a held index.lock, a
         * missing borrowed object, an unresolvable HEAD), and a spawn failure is mapped to -1 rather than being
         * confused with a git verdict.
         */
        if (dry.exit !== 0 && dry.exit !== 1) {
            throw new Error(`WORLD_NOT_COMMIT_CAPABLE: the world at "${path}" cannot commit — \`git commit --dry-run\` exited ${String(dry.exit)}, which is neither "would commit" (0) nor "nothing to commit" (1). A worker handed this world would fail and leave the attempt unsettled. Refusing rather than creating a misleading usable attempt. Detail: ${dry.text.slice(0, 240)}`);
        }
    }
    /**
     * Run git and report its EXIT CODE plus combined output instead of throwing.
     *
     * The exit code is the criterion, not the text: `commit --dry-run` exits 1 for a legitimate clean world, so
     * a caller must be able to tell "git said nothing to do" from "git failed". `promisify(execFile)` surfaces
     * the code as `error.code`, which is a NUMBER for a process exit and a STRING for a spawn failure — the
     * distinction is preserved so a spawn failure is never mistaken for exit 0.
     */
    async #gitExit(args, cwd) {
        try {
            const { stdout, stderr } = await execFileAsync("git", args, { cwd, encoding: "utf8" });
            return { exit: 0, text: `${String(stdout)}${String(stderr)}`.trim() };
        }
        catch (error) {
            const code = error.code;
            const exit = typeof code === "number" ? code : -1;
            const text = `${String(error.stdout ?? "")}${String(error.stderr ?? "")}${String(error.message ?? error)}`.trim();
            return { exit, text };
        }
    }
    /** The canonical repository directory — the tree an in-place attempt works in and is judged in. */
    get repository() {
        return this.#repository;
    }
    async createWorktree(input) {
        const path = this.worktreePath(input.worktreeId);
        await this.#git(["worktree", "add", path, input.baseCommit]);
        return { worktreePath: path };
    }
    async commit(input) {
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
    async observeWorktree(input) {
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
    async promote(input) {
        const expected = await this.head();
        if (expected !== input.expectedHeadCommit) {
            throw new Error(`expected head ${input.expectedHeadCommit} does not match ${expected}`);
        }
        // The merge commit is the PROMOTION AUTHORITY's operational commit, and it
        // carries a stable operational identity injected per-invocation (`-c`): a
        // machine without a global git identity must still be able to promote
        // deterministically, and the authority's commits must be recognizable as
        // the authority's — never as the operator's. (Measured §D5-c3: without
        // this, `git merge --no-ff` fails on an identity-less runner and the
        // crash window classifies the outcome as uncertain.)
        await this.#git([
            "-c",
            `user.name=${PROMOTION_COMMIT_NAME}`,
            "-c",
            `user.email=${PROMOTION_COMMIT_EMAIL}`,
            "merge",
            "--no-ff",
            "-m",
            `promote ${input.promotionId}`,
            input.sourceCommit,
        ]);
        const head = await this.head();
        return { resultingHeadCommit: head };
    }
    async head() {
        return this.#git(["rev-parse", "HEAD"]);
    }
    async contains(commit) {
        try {
            const merged = await this.#git(["merge-base", "--is-ancestor", commit, "HEAD"]);
            void merged;
            return true;
        }
        catch {
            return false;
        }
    }
    async runGate(input) {
        return runExecutable(input.executable, input.argv, input.cwd ?? this.worktreePath(input.worktreeId));
    }
    async scanLexical(input) {
        const root = this.worktreePath(input.worktreeId);
        const files = this.#walkTexts(root, { maxFiles: 4_096, maxBytesPerFile: 1_000_000 });
        return collectLexicalMatches(files, input);
    }
    async collectWorktreeTexts(input) {
        const root = this.worktreePath(input.worktreeId);
        return this.#walkTexts(root, {
            maxFiles: input.maxFiles ?? 64,
            maxBytesPerFile: input.maxBytesPerFile ?? 65_536,
        });
    }
    #walkTexts(root, limits) {
        const files = [];
        const walk = (directory) => {
            if (files.length >= limits.maxFiles)
                return;
            for (const entry of readdirSync(directory, { withFileTypes: true })) {
                if (entry.name === ".git")
                    continue;
                const full = join(directory, entry.name);
                if (entry.isDirectory()) {
                    walk(full);
                    continue;
                }
                try {
                    if (statSync(full).size > limits.maxBytesPerFile)
                        continue;
                    files.push({
                        path: relative(root, full).split("\\").join("/"),
                        content: readFileSync(full, "utf8"),
                    });
                }
                catch {
                    // Unreadable files (permissions, transient writes) are skipped.
                }
            }
        };
        walk(root);
        return files;
    }
}
//# sourceMappingURL=git_port.js.map