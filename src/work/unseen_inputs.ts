/**
 * ODPE-A — WHAT THE PROJECT HOLDS THAT THE ATTEMPT'S BASIS NEVER CONTAINED.
 *
 * PWRS-D answered a narrower question ("is there an untracked path the base lacks?") with a bare
 * string list. That shape could not say three things a settlement decision needs:
 *
 *   - a TRACKED file whose content changed is a current fact, not a path the base lacks;
 *   - a COMMIT that moved after the base is a current fact too;
 *   - a failed Git read is UNKNOWN, not "no change" — an empty array must never mean both.
 *
 * This module therefore returns an OBSERVATION with identity, content digest, source and byte count
 * for each current input, plus the facts the observation could NOT establish. It remains a
 * mechanical observer: relevance and correctness are the principal's judgement, never this module's.
 *
 * "Observed input" is not "accepted source". A delivered snapshot is context for one attempt; it
 * does not revise ProjectIR, does not move the canonical head and does not become a project asset.
 *
 * Layer: L2 (`src/work/`).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { join, sep } from "node:path";

const STATUS_PREFIX = 3;
/** A single input larger than this is reported as unreadable, not silently dropped. */
export const MAX_PROJECT_INPUT_BYTES = 512 * 1024;

export type ProjectInputIdentity = "UNTRACKED" | "TRACKED_MODIFIED" | "COMMITTED_SINCE_BASE" | "REGISTERED";
export type ProjectInputContent = "WORKTREE" | "COMMIT" | "ABSENT";

export interface ProjectInput {
  readonly path: string;
  readonly identity: ProjectInputIdentity;
  /** Where the observed bytes live: the canonical worktree, a commit, or nowhere (deleted). */
  readonly content: ProjectInputContent;
  /** sha256 of the exact bytes; null when the path is absent. */
  readonly digest: string | null;
  readonly bytes: number;
  /** The revision the bytes belong to (HEAD for a commit, the base for a worktree comparison). */
  readonly revision: string;
  readonly observedAt: string;
}

export interface UnreadableProjectInput {
  readonly path: string;
  readonly detail: string;
}

export interface ProjectInputObservation {
  readonly state: "OBSERVED" | "UNAVAILABLE";
  readonly baseCommit: string;
  readonly headCommit: string | null;
  readonly inputs: readonly ProjectInput[];
  /** Paths that exist but could not be read or hashed. A fact, never an empty result. */
  readonly unreadable: readonly UnreadableProjectInput[];
  /** What this observation cannot establish. Never silently omitted. */
  readonly limitations: readonly string[];
  readonly detail: string;
}

export interface ReadProjectInputRequest {
  readonly repository: string;
  readonly path: string;
  readonly content: ProjectInputContent;
  readonly revision: string;
  /** The digest the attempt was given; a mismatch is reported, never papered over. */
  readonly expectedDigest?: string | undefined;
  readonly maxBytes?: number | undefined;
}

export type ProjectInputBody =
  | {
      readonly state: "DELIVERED";
      readonly path: string;
      readonly content: "WORKTREE" | "COMMIT";
      readonly revision: string;
      readonly digest: string;
      readonly bytes: number;
      readonly text: string;
      readonly encoding: "utf8";
      readonly truncated: boolean;
    }
  | {
      readonly state: "CHANGED";
      readonly path: string;
      readonly expectedDigest: string | null;
      readonly currentDigest: string | null;
      readonly detail: string;
    }
  | { readonly state: "UNAVAILABLE"; readonly path: string; readonly detail: string };

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeRelativePath(path: string): boolean {
  if (path === "" || path.startsWith("/") || path.startsWith("\\")) return false;
  if (/^[A-Za-z]:/u.test(path)) return false;
  return !path.split(/[\\/]/u).includes("..");
}

/**
 * The ONE bounded read of a project-relative file.
 *
 * Three properties are enforced here rather than at each caller: the path is project-relative (no
 * traversal, no drive), the RESOLVED path stays inside the repository (a symlink or junction must not
 * turn an input handle into a host filesystem read), and the bytes fit the observation budget. A
 * caller that only needs "is it readable" can treat any detail as unreadable; a caller that needs the
 * bytes gets them or an honest reason.
 */
export function readBoundedProjectFile(
  repository: string,
  path: string,
  maxBytes: number,
): { readonly bytes: Buffer } | { readonly detail: string; readonly code?: string } {
  if (!safeRelativePath(path)) return { detail: "the path is not a project-relative input path" };
  let root: string;
  let target: string;
  try {
    root = realpathSync(repository);
    target = realpathSync(join(repository, path));
  } catch (error) {
    const code = (error as { code?: string }).code;
    return { detail: error instanceof Error ? error.message : String(error), ...(code === undefined ? {} : { code }) };
  }
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  if (target !== root && !target.toLowerCase().startsWith(prefix.toLowerCase())) {
    return { detail: `the path resolves outside the repository (${target}); a project input must live inside it` };
  }
  const size = statSync(target).size;
  if (size > maxBytes) {
    return { detail: `content is ${String(size)} bytes, above the ${String(maxBytes)}-byte observation budget` };
  }
  return { bytes: readFileSync(target) };
}

/**
 * Observe the canonical project inputs relevant to one attempt basis.
 *
 * The observation is bounded and honest about its limits: it uses the canonical repository, it does
 * not read ignored files unless the caller REGISTERS them, and a Git failure yields `UNAVAILABLE`
 * with no inputs rather than a confident empty list.
 */
export function observeProjectInputs(input: {
  readonly repository: string;
  readonly baseCommit: string;
  /** Ignored paths the project explicitly treats as inputs (registered by configuration, not guessed). */
  readonly registeredInputs?: readonly string[] | undefined;
  /** Defaults to true: commits that landed after the attempt's basis are current reality too. */
  readonly includeCommittedSinceBase?: boolean | undefined;
  readonly maxBytes?: number | undefined;
  readonly now?: (() => string) | undefined;
}): ProjectInputObservation {
  const now = input.now ?? (() => new Date().toISOString());
  const maxBytes = input.maxBytes ?? MAX_PROJECT_INPUT_BYTES;
  const limitations: string[] = [];
  const unreadable: UnreadableProjectInput[] = [];
  const inputs: ProjectInput[] = [];
  const seen = new Set<string>();
  const git = (args: readonly string[]): Buffer | null => {
    try {
      return execFileSync("git", ["-C", input.repository, ...args], {
        maxBuffer: 16 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      return null;
    }
  };
  const unavailable = (detail: string): ProjectInputObservation =>
    Object.freeze({
      state: "UNAVAILABLE" as const,
      baseCommit: input.baseCommit,
      headCommit: null,
      inputs: Object.freeze([] as ProjectInput[]),
      unreadable: Object.freeze([...unreadable]),
      limitations: Object.freeze([...limitations, "the repository could not be observed; this is UNKNOWN, not an absence of change"]),
      detail,
    });

  const headRaw = git(["rev-parse", "HEAD"]);
  if (headRaw === null) return unavailable("git rev-parse HEAD failed; project inputs cannot be observed");
  const headCommit = headRaw.toString("utf8").trim();
  if (headCommit === "") return unavailable("git rev-parse HEAD returned no commit");

  const addWorktree = (path: string, identity: ProjectInputIdentity): void => {
    if (!safeRelativePath(path) || path.startsWith(".palimpsest/") || seen.has(path)) return;
    seen.add(path);
    const read = readBoundedProjectFile(input.repository, path, maxBytes);
    if ("detail" in read) {
      if (read.code === "ENOENT") {
        inputs.push(Object.freeze({ path, identity, content: "ABSENT", digest: null, bytes: 0, revision: input.baseCommit, observedAt: now() }));
        return;
      }
      unreadable.push(Object.freeze({ path, detail: read.detail }));
      return;
    }
    const bytes = read.bytes;
    if (bytes.byteLength > maxBytes) {
      unreadable.push(Object.freeze({ path, detail: `content is ${String(bytes.byteLength)} bytes, above the ${String(maxBytes)}-byte observation budget` }));
      return;
    }
    inputs.push(
      Object.freeze({
        path,
        identity,
        content: "WORKTREE" as const,
        digest: sha256(bytes),
        bytes: bytes.byteLength,
        revision: input.baseCommit,
        observedAt: now(),
      }),
    );
  };

  const addCommit = (path: string): void => {
    if (!safeRelativePath(path) || path.startsWith(".palimpsest/") || seen.has(path)) return;
    seen.add(path);
    const blob = git(["cat-file", "blob", `${headCommit}:${path}`]);
    if (blob === null) {
      // A deletion is a current fact too: the file the base had is gone.
      inputs.push(Object.freeze({ path, identity: "COMMITTED_SINCE_BASE", content: "ABSENT", digest: null, bytes: 0, revision: headCommit, observedAt: now() }));
      return;
    }
    if (blob.byteLength > maxBytes) {
      unreadable.push(Object.freeze({ path, detail: `committed content is ${String(blob.byteLength)} bytes, above the ${String(maxBytes)}-byte observation budget` }));
      return;
    }
    inputs.push(
      Object.freeze({
        path,
        identity: "COMMITTED_SINCE_BASE",
        content: "COMMIT" as const,
        digest: sha256(blob),
        bytes: blob.byteLength,
        revision: headCommit,
        observedAt: now(),
      }),
    );
  };

  const status = git(["status", "--porcelain", "-z", "--untracked-files=all"]);
  if (status === null) return unavailable("git status failed; the canonical worktree cannot be observed");
  const entries = status.toString("utf8").split("\0").filter((entry) => entry !== "");
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;
    if (entry.length < STATUS_PREFIX) continue;
    const code = entry.slice(0, 2);
    const path = entry.slice(STATUS_PREFIX);
    // A rename/copy carries the original path as the NEXT NUL field; this observation follows the
    // new path, because that is where the current bytes are.
    if (code.startsWith("R") || code.startsWith("C")) index += 1;
    if (path === "") continue;
    addWorktree(path, code === "??" ? "UNTRACKED" : "TRACKED_MODIFIED");
  }

  if (input.includeCommittedSinceBase !== false && headCommit !== input.baseCommit) {
    const diff = git(["diff", "--name-status", "-z", `${input.baseCommit}..${headCommit}`]);
    if (diff === null) {
      limitations.push(`commits between ${input.baseCommit.slice(0, 12)} and ${headCommit.slice(0, 12)} could not be listed`);
    } else {
      const fields = diff.toString("utf8").split("\0").filter((field) => field !== "");
      for (let index = 0; index < fields.length; index += 1) {
        const statusCode = fields[index]!;
        const path = fields[index + 1] ?? "";
        index += 1;
        if (statusCode.startsWith("R") || statusCode.startsWith("C")) {
          // status, old path, new path
          const renamed = fields[index + 1] ?? "";
          index += 1;
          addCommit(renamed);
          continue;
        }
        addCommit(path);
      }
    }
  } else if (headCommit !== input.baseCommit) {
    limitations.push("committed changes after the basis were not inspected because the caller disabled that channel");
  }

  for (const path of [...(input.registeredInputs ?? [])].sort()) {
    addWorktree(path, "REGISTERED");
  }

  if ((input.registeredInputs ?? []).length === 0) {
    limitations.push(
      "Git-ignored files are not project inputs unless the project registers them; this observation makes no claim about ignored content",
    );
  }
  limitations.push("semantic relevance and business meaning are not observed here; they remain the principal's judgement");

  return Object.freeze({
    state: "OBSERVED" as const,
    baseCommit: input.baseCommit,
    headCommit,
    inputs: Object.freeze([...inputs].sort((left, right) => left.path.localeCompare(right.path))),
    unreadable: Object.freeze([...unreadable].sort((left, right) => left.path.localeCompare(right.path))),
    limitations: Object.freeze([...limitations]),
    detail:
      inputs.length === 0
        ? `the canonical project holds no content the basis ${input.baseCommit.slice(0, 12)} did not contain (${String(limitations.length)} limitation(s) recorded)`
        : `${String(inputs.length)} current project input(s) differ from the basis ${input.baseCommit.slice(0, 12)}`,
  });
}

/** Read the exact bytes an attempt was given, or report that they moved. */
export function readProjectInput(request: ReadProjectInputRequest): ProjectInputBody {
  if (!safeRelativePath(request.path)) {
    return Object.freeze({ state: "UNAVAILABLE" as const, path: request.path, detail: "the path is not a project-relative input path" });
  }
  const maxBytes = request.maxBytes ?? MAX_PROJECT_INPUT_BYTES;
  let bytes: Buffer;
  if (request.content === "COMMIT") {
    try {
      bytes = execFileSync("git", ["-C", request.repository, "cat-file", "blob", `${request.revision}:${request.path}`], {
        maxBuffer: maxBytes + 1024,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch (error) {
      return Object.freeze({
        state: "UNAVAILABLE" as const,
        path: request.path,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  } else if (request.content === "WORKTREE") {
    const read = readBoundedProjectFile(request.repository, request.path, maxBytes);
    if ("detail" in read) {
      return Object.freeze({ state: "UNAVAILABLE" as const, path: request.path, detail: read.detail });
    }
    bytes = read.bytes;
  } else {
    return Object.freeze({ state: "CHANGED" as const, path: request.path, expectedDigest: request.expectedDigest ?? null, currentDigest: null, detail: "the input was observed as absent" });
  }
  const digest = sha256(bytes);
  if (request.expectedDigest !== undefined && digest !== request.expectedDigest) {
    return Object.freeze({
      state: "CHANGED" as const,
      path: request.path,
      expectedDigest: request.expectedDigest,
      currentDigest: digest,
      detail: "the canonical content changed after this attempt's context was compiled; the new bytes are a NEW fact, not the delivered input",
    });
  }
  return Object.freeze({
    state: "DELIVERED" as const,
    path: request.path,
    content: request.content as "WORKTREE" | "COMMIT",
    revision: request.revision,
    digest,
    bytes: bytes.byteLength,
    text: bytes.toString("utf8"),
    encoding: "utf8" as const,
    truncated: false,
  });
}

/**
 * Compatibility read: the observed paths, and a hard refusal to pretend an unobservable repository
 * is an empty one. Callers that need the richer facts use `observeProjectInputs`.
 */
export function unseenInputs(input: {
  readonly repository: string;
  readonly baseCommit: string;
  readonly registeredInputs?: readonly string[] | undefined;
}): readonly string[] | null {
  const observation = observeProjectInputs(input);
  return observation.state === "UNAVAILABLE" ? null : observation.inputs.map((entry) => entry.path);
}


/** The canonical worktree's dirty paths, or null when Git could not be read (UNKNOWN, not clean). */
export function canonicalWorktreeChanges(repository: string): readonly string[] | null {
  try {
    return execFileSync("git", ["status", "--porcelain"], { cwd: repository, encoding: "utf8" })
      .split(String.fromCharCode(10))
      .filter((line: string) => line.trim() !== "")
      .map((line: string) => line.slice(3).trim())
      .filter((path: string) => !path.startsWith(".palimpsest/"));
  } catch {
    return null;
  }
}

/**
 * ODPE-A: is every dirty canonical path a CURRENT INPUT the new attempt can be given, or is some of
 * it unowned work the product cannot attribute?
 *
 * The rule is the WRITE SCOPE, not readability. A dirty path inside a task's declared write scope is
 * ambiguous with that task's own output, so it stays unowned work and blocks. A dirty path outside
 * every scope cannot be an attempt's legitimate output at all — an envelope forbids it — so it is
 * external reality even when its bytes do not fit the observation budget; a huge unrelated file must
 * not stop every managed task. The observation still lists it (or names it unreadable), and a
 * principal settlement over it is refused until the principal acknowledges it, so "not blocking the
 * start" never becomes "not a fact".
 */
export function assessCanonicalInputs(input: {
  readonly repository: string;
  readonly headCommit: string;
  readonly unownedPaths: readonly string[];
  /** Every canonical task's declared write paths: a dirty path inside one could be THIS task's output. */
  readonly writeScopes: readonly string[];
}): { readonly state: "COVERED" | "BLOCKED"; readonly stillUnowned: readonly string[]; readonly detail: string } {
  const observation = observeProjectInputs({ repository: input.repository, baseCommit: input.headCommit });
  if (observation.state === "UNAVAILABLE") {
    return Object.freeze({
      state: "BLOCKED" as const,
      stillUnowned: Object.freeze([...input.unownedPaths]),
      detail:
        `the working tree already has changes that belong to no attempt: ${input.unownedPaths.join(", ")} — the project's inputs could not be observed (${observation.detail}), so managed work does not begin on an unknown tree`,
    });
  }
  const inScope = (path: string): boolean =>
    input.writeScopes.some((scope) => path === scope.replace(/\/+$/u, "") || path.startsWith(`${scope.replace(/\/+$/u, "")}/`));
  const stillUnowned = input.unownedPaths.filter((path) => inScope(path.replace(/\/+$/u, "")));
  return Object.freeze({
    state: stillUnowned.length === 0 ? ("COVERED" as const) : ("BLOCKED" as const),
    stillUnowned: Object.freeze(stillUnowned),
    detail:
      stillUnowned.length === 0
        ? `every dirty canonical path is outside every task's write scope, so it is external reality rather than unowned work (${String(observation.inputs.length)} input(s) read, ${String(observation.unreadable.length)} unreadable)`
        : `the working tree has changes inside a task's write scope that belong to no attempt: ${stillUnowned.join(", ")} — deal with them before managed work begins, or the product cannot prove which changes belong to this task`,
  });
}
