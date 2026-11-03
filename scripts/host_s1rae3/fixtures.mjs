/**
 * Host-S1RA-E3 — SYNTHETIC FIXTURE PRIMITIVES.
 *
 * EVERY experiment in this stage runs inside a run-owned sandbox created here. The sandbox is the containment
 * boundary: a fixture may be "foreign" to the resource under test, but it is NEVER foreign to this experiment, and
 * it is always a disposable synthetic asset. Genuine historical or user directories are never used to demonstrate
 * an unsafe deletion.
 *
 * The gate-root environment variables are REDIRECTED into the sandbox before any stage module is imported, so the
 * harness modules themselves resolve their gate root inside the sandbox. That is a belt-and-braces measure: the
 * harness also asserts containment before it mutates anything.
 *
 * NOT A PRODUCT COMPONENT. PLAIN JAVASCRIPT (`.mjs`), bare node.
 */
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

/** The gate-root variables the two ownership implementations read at module load. */
export const GATE_ROOT_ENV_NAMES = ["PALIMPSEST_P2B_GATE_ROOT", "PALIMPSEST_P2E0_GATE_ROOT"];

/**
 * Create the sandbox and redirect every gate-root variable into it.
 *
 * Returns the sandbox root and the synthetic gate root. The caller MUST import the stage modules only AFTER this
 * has run, which is why every consumer uses a dynamic `import()`.
 */
export function createSandbox(label) {
  const root = resolve(mkdtempSync(join(tmpdir(), `s1rae3-${label}-`)));
  const gateRoot = join(root, "gate");
  mkdirSync(gateRoot, { recursive: true });
  for (const name of GATE_ROOT_ENV_NAMES) process.env[name] = gateRoot;
  return { root, gateRoot, label };
}

/** Is `child` a strict descendant of `parent`, comparing RESOLVED paths? Never follows the child. */
export function isContained(parent, child) {
  try {
    const rel = relative(resolve(parent), resolve(child));
    return rel !== "" && !rel.startsWith("..") && !rel.startsWith(sep) && !rel.startsWith(`..${sep}`);
  } catch {
    return false;
  }
}

/**
 * Assert the sandbox really is the containment boundary before anything is mutated.
 *
 * A failure here is a STOP condition, not a warning: it means an experiment could reach a real resource.
 */
export function assertSandboxContainment(sandbox) {
  const problems = [];
  for (const name of GATE_ROOT_ENV_NAMES) {
    const value = process.env[name];
    if (typeof value !== "string" || value === "") {
      problems.push(`${name} is unset`);
      continue;
    }
    if (!isContained(sandbox.root, value)) problems.push(`${name} resolves outside the sandbox: ${value}`);
  }
  const systemTemp = resolve(tmpdir());
  if (!isContained(systemTemp, sandbox.root) && !isContained(resolve(dirname(systemTemp)), sandbox.root)) {
    problems.push(`the sandbox is not inside the platform temporary directory: ${sandbox.root}`);
  }
  return { proven: problems.length === 0, problems, sandbox: sandbox.root, gateRoot: sandbox.gateRoot };
}

/** The object identity the platform supplies. `lstat` observes the path object and never follows it. */
export function identityOf(path) {
  try {
    const stats = lstatSync(path);
    return {
      dev: stats.dev,
      ino: stats.ino,
      isDirectory: stats.isDirectory(),
      isReparsePoint: stats.isSymbolicLink(),
      inoUsable: stats.ino !== 0,
    };
  } catch {
    return null;
  }
}

/** Whether the path object exists, WITHOUT following a reparse point. A dangling junction reads as present. */
export function pathObjectExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

export function digestOfFile(path) {
  try {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  } catch {
    return null;
  }
}

/**
 * Write a synthetic foreign canary: a directory this experiment creates, containing known bytes.
 *
 * "Foreign" means only that it is not the object the ownership record describes. It is still disposable and
 * synthetic, and it never contains anything this project would miss.
 */
export function writeForeignCanary(directory, label) {
  mkdirSync(directory, { recursive: true });
  const payload = `FOREIGN-CANARY ${label} ${String(Date.now())} SYNTHETIC-ONLY\n`;
  const file = join(directory, "foreign-canary.txt");
  writeFileSync(file, payload, "utf8");
  mkdirSync(join(directory, "payload"), { recursive: true });
  writeFileSync(join(directory, "payload", "data.bin"), "x".repeat(4096), "utf8");
  return { directory, file, digest: digestOfFile(file), bytes: payload.length };
}

/** Whether a canary written by `writeForeignCanary` is intact: file present AND byte-identical. */
export function canaryIntact(canary) {
  const exists = pathObjectExists(canary.file);
  const digest = exists ? digestOfFile(canary.file) : null;
  return { exists, digest, intact: exists && digest === canary.digest };
}

/**
 * Remove a synthetic directory tree WITHOUT following a junction.
 *
 * Links are unlinked by name first (the measured hazard: a recursive removal can reach through a link on this
 * platform), then the tree is removed. Used only for sandbox teardown.
 */
export function removeTreeNoFollow(root) {
  const removedLinks = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      let stats;
      try {
        stats = lstatSync(full);
      } catch {
        continue;
      }
      if (stats.isSymbolicLink()) {
        try {
          rmSync(full, { recursive: false, force: true });
          removedLinks.push(full);
        } catch {
          /* recorded by the caller as a teardown problem */
        }
        continue;
      }
      if (stats.isDirectory()) walk(full);
    }
  };
  walk(root);
  try {
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    return { removed: true, removedLinks };
  } catch (error) {
    return { removed: false, reason: String(error?.message ?? error), removedLinks };
  }
}

/**
 * Move a directory aside and put a DIFFERENT object at the same path.
 *
 * This is the deterministic substitution the TOCTOU arms need: the original object is preserved (it is moved, not
 * destroyed), so the experiment can prove the original survived as well as whether the replacement did.
 */
export function substituteDirectory(path, parkedPath, canaryLabel) {
  const before = identityOf(path);
  renameSync(path, parkedPath);
  const canary = writeForeignCanary(path, canaryLabel);
  const after = identityOf(path);
  return {
    originalIdentity: before,
    replacementIdentity: after,
    parkedPath,
    identityChanged: before === null || after === null ? null : before.dev !== after.dev || before.ino !== after.ino,
    canary,
  };
}

export { basename, dirname, join, relative, resolve, sep };
