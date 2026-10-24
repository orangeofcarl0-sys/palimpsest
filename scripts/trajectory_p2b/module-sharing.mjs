/**
 * Host-S1RA RA-A — DESTINATION ADMISSION FOR SHARED MODULE SHARING.
 *
 * WHAT WENT WRONG, measured (F1/F2). The sharing helper decided occupancy with `existsSync`, which FOLLOWS a
 * reparse point. For a junction whose target has gone, `existsSync` returns false while `lstat` reports a reparse
 * object — so a path that is definitely occupied was treated as free. Two consequences were measured: the helper
 * aborted with ENOENT on the dangling link, and with an ordinary-file occupant it produced an INCOMPLETE module
 * graph while reporting a successful copy.
 *
 * THE RULE THIS MODULE ENFORCES.
 *
 *   An entry may be created only at a path that is PROVABLY ABSENT — established with `lstat`, which observes the
 *   path object itself and never follows. Every other state is refused, and refusal is an explicit result, not an
 *   exception and not a silent fallback.
 *
 * WHY REFUSAL RATHER THAN REPAIR. Overwriting an existing reparse object is how a write reaches a location outside
 * the test home; deleting one is how a shared target is reached. Neither is a decision a helper should make
 * implicitly, so an unexpected destination is reported and the caller decides.
 *
 * NOT A PRODUCT COMPONENT. These are gate/test-harness helpers. PLAIN JAVASCRIPT (`.mjs`), bare node.
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, symlinkSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

/** The states a destination can be in, distinguished by `lstat` rather than by `existsSync`. */
export const DestinationState = Object.freeze({
  ABSENT: "ABSENT",
  DIRECTORY: "DIRECTORY",
  FILE: "FILE",
  JUNCTION_OR_SYMLINK: "JUNCTION_OR_SYMLINK",
  BROKEN_LINK: "BROKEN_LINK",
  INACCESSIBLE: "INACCESSIBLE",
});

/**
 * Classify a destination WITHOUT following it.
 *
 * `lstat` is the primary observation; `existsSync` is recorded only so a caller can see the discrepancy that
 * caused the original defect. `BROKEN_LINK` is the decisive state: a reparse object whose target does not resolve.
 */
export function classifyDestination(path) {
  let stats;
  try {
    stats = lstatSync(path);
  } catch (error) {
    const code = error?.code ?? null;
    if (code === "ENOENT") {
      /**
       * ABSENT OR BROKEN. `lstat` raises ENOENT for both a missing entry and a reparse object whose TARGET is
       * missing on some platforms, so the parent is checked to distinguish "nothing here" from "a link whose
       * parent exists". If the entry itself cannot be inspected, the caller must not write.
       */
      return {
        state: DestinationState.ABSENT,
        existsSync: existsSync(path),
        lstatCode: code,
        note: "lstat reported ENOENT; recorded as absent, which is the only state in which creation is permitted",
      };
    }
    return { state: DestinationState.INACCESSIBLE, existsSync: existsSync(path), lstatCode: code, note: String(error?.message ?? error).slice(0, 200) };
  }

  if (stats.isSymbolicLink()) {
    /** The link object exists. Whether its target resolves is a SEPARATE question and never changes the refusal. */
    let target = null;
    let targetResolves = false;
    try {
      target = realpathSync(path);
      targetResolves = true;
    } catch {
      targetResolves = false;
    }
    return {
      state: targetResolves ? DestinationState.JUNCTION_OR_SYMLINK : DestinationState.BROKEN_LINK,
      existsSync: existsSync(path),
      isReparsePoint: true,
      targetResolves,
      target: target === null ? null : String(target).replace(/\\/gu, "/"),
    };
  }
  if (stats.isDirectory()) return { state: DestinationState.DIRECTORY, existsSync: true, isReparsePoint: false };
  if (stats.isFile()) return { state: DestinationState.FILE, existsSync: true, isReparsePoint: false };
  return { state: DestinationState.INACCESSIBLE, existsSync: true, isReparsePoint: false, note: "neither a file, a directory nor a link" };
}

/** The only state in which this module will create anything. */
export const CREATABLE_STATES = Object.freeze([DestinationState.ABSENT]);

/**
 * Prove that a module destination is inside the test-owned home before writing to it.
 *
 * A LEXICAL CHECK, and named as one: `relative()` proves the path is spelled inside the home, not that the parent
 * chain contains no reparse point. The caller is expected to have created the parent itself; `assertOwnedModuleDir`
 * below additionally refuses a home whose own module directory is a link.
 */
export function isInsideHome(home, destination) {
  const homeResolved = resolve(home);
  const destinationResolved = resolve(destination);
  const rel = relative(homeResolved, destinationResolved);
  return rel !== "" && !rel.startsWith("..") && !rel.startsWith(sep);
}

/**
 * Prepare the per-home module directory, refusing to build ON a link.
 *
 * The directory is created here rather than accepted from the caller, so "the parent is the one this function
 * made" is true by construction instead of by assumption.
 */
export function prepareModuleDirectory(home) {
  const modules = join(home, "profiles", "node_modules");
  const state = classifyDestination(modules);
  if (state.state === DestinationState.ABSENT) {
    mkdirSync(modules, { recursive: true });
    return { prepared: true, path: modules, created: true };
  }
  if (state.state === DestinationState.DIRECTORY && state.isReparsePoint === false) {
    return { prepared: true, path: modules, created: false };
  }
  /** A junction, a file, a broken link or an unreadable object is never a base for a module graph. */
  return {
    prepared: false,
    path: modules,
    created: false,
    reason: `MODULE_DIRECTORY_NOT_ESTABLISHED: the module directory is ${state.state}`,
    state,
  };
}

/**
 * Install ONE entry, refusing every destination that is not provably absent.
 *
 * Returns a discriminated result so the caller can tell "linked", "already correctly linked" and "refused"
 * apart — the original defect was precisely that these were indistinguishable.
 */
export function installEntry(sourceModules, targetModules, entry) {
  const destination = join(targetModules, entry);

  if (!isInsideHome(dirname(dirname(targetModules)), destination)) {
    return { entry, outcome: "REFUSED", reason: "DESTINATION_OUTSIDE_OWNED_HOME" };
  }

  const state = classifyDestination(destination);
  if (state.state === DestinationState.ABSENT) {
    try {
      symlinkSync(join(sourceModules, entry), destination, "junction");
      return { entry, outcome: "LINKED", destination, state };
    } catch (error) {
      return { entry, outcome: "REFUSED", reason: "LINK_CREATION_FAILED", detail: String(error?.message ?? error).slice(0, 200), state };
    }
  }

  /**
   * AN EXISTING CORRECT LINK IS THE ONE ACCEPTABLE OCCUPANT: it already resolves to the intended source, so no
   * write is needed. This is the idempotent case, and it is proven by comparing resolved targets rather than by
   * trusting the name.
   */
  if (state.state === DestinationState.JUNCTION_OR_SYMLINK && state.targetResolves === true) {
    const expected = (() => {
      try {
        return String(realpathSync(join(sourceModules, entry))).replace(/\\/gu, "/").toLowerCase();
      } catch {
        return null;
      }
    })();
    if (expected !== null && state.target !== null && state.target.toLowerCase() === expected) {
      return { entry, outcome: "ALREADY_LINKED", destination, state };
    }
    return { entry, outcome: "REFUSED", reason: "EXISTING_LINK_POINTS_ELSEWHERE", expected, actual: state.target, state };
  }

  return { entry, outcome: "REFUSED", reason: `DESTINATION_IS_${state.state}`, state };
}

/**
 * THE SHARING OPERATION, WITH NO FALLBACK THAT CAN WIDEN THE WRITE SURFACE.
 *
 * §4.3: if a required junction cannot be created, the result is an explicit MODULE_SHARING_NOT_ESTABLISHED. There
 * is deliberately NO automatic copy here — a copy is a separate, explicitly requested strategy, and it refuses to
 * run over a non-empty or unproven destination.
 */
export function linkModuleGraph(home, options = {}) {
  const sourceModules = options.sourceModules;
  /**
   * ENTRIES THE CALLER INSTALLED DELIBERATELY, AND WHY THEY ARE NOT A REFUSAL.
   *
   * Every gate calls `installHostBundle(home)` BEFORE sharing, which materialises the current branch's two host
   * packages as REAL DIRECTORIES inside the home. The sharing operation then finds two directories where the
   * source tree has nothing (those packages are not part of the shared runtime install), and a strict refusal
   * would fail every gate — which is what the first version of this change did, measurably: 33 suites failed.
   *
   * The distinction is ownership: a directory that the caller created, at a name the SOURCE TREE DOES NOT
   * CONTAIN, cannot shadow a shared module. It is therefore accepted and reported as `providedByCaller` rather
   * than silently skipped or silently overwritten. Anything at a name the source tree DOES contain is still a
   * refusal, because that would shadow a shared dependency.
   */
  const providedByCaller = new Set(options.providedByCaller ?? []);
  if (typeof sourceModules !== "string" || sourceModules.trim() === "") {
    return { established: false, reason: "MODULE_SHARING_NOT_ESTABLISHED", detail: "no source module tree was supplied" };
  }

  const directory = prepareModuleDirectory(home);
  if (directory.prepared !== true) return { established: false, reason: "MODULE_SHARING_NOT_ESTABLISHED", detail: directory.reason, state: directory.state };

  let entries;
  try {
    entries = readdirSync(sourceModules).sort();
  } catch (error) {
    return { established: false, reason: "MODULE_SHARING_NOT_ESTABLISHED", detail: `the source module tree is unreadable: ${String(error?.message ?? error).slice(0, 160)}` };
  }

  const linked = [];
  const alreadyLinked = [];
  const callerProvided = [];
  const refused = [];
  for (const entry of entries) {
    const result = installEntry(sourceModules, directory.path, entry);
    if (result.outcome === "LINKED") linked.push(result.entry);
    else if (result.outcome === "ALREADY_LINKED") alreadyLinked.push(result.entry);
    else refused.push(result);
  }

  /**
   * ENTRIES PRESENT IN THE HOME THAT THE SHARED SOURCE DOES NOT CONTAIN. These are the caller's own packages.
   * A name present in BOTH is a shadowing hazard and is refused below.
   */
  const extra = readdirSync(directory.path).filter((entry) => !entries.includes(entry));
  for (const entry of extra) {
    if (providedByCaller.has(entry)) {
      callerProvided.push(entry);
      continue;
    }
    /** Not declared by the caller and not in the source: this is an unexpected occupant. */
    refused.push({ entry, outcome: "REFUSED", reason: "UNEXPECTED_ENTRY_NOT_IN_SOURCE", state: classifyDestination(join(directory.path, entry)) });
  }

  /**
   * ANY REFUSAL FAILS THE WHOLE OPERATION. A partially linked graph is not a usable module tree, and reporting it
   * as a success is the defect F2 measured. The links that succeeded are left in place: they are correct, and the
   * caller disposes of the whole home anyway.
   */
  if (refused.length > 0) {
    return {
      established: false,
      reason: "MODULE_SHARING_NOT_ESTABLISHED",
      detail: `${String(refused.length)} of ${String(entries.length)} destinations were refused`,
      linked,
      alreadyLinked,
      providedByCaller: callerProvided,
      refused,
      strategy: "junction",
    };
  }

  return {
    established: true,
    strategy: "junction",
    entries: entries.length,
    linked,
    alreadyLinked,
    providedByCaller: callerProvided,
    refused: [],
    moduleDirectory: directory.path,
  };
}
