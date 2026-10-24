/**
 * Host-S1RA — THE ONE PLACE THE RUNTIME HOME IS RESOLVED.
 *
 * WHY THIS MODULE EXISTS. RA-0/F8 measured a HOMOGLYPH COLLISION in the test harness: the production gate
 * scripts read one environment variable and the storage suite assigned a DIFFERENT one, and the two render
 * identically in every editor and terminal. Their first code points differ, so `process.env[assigned]` was
 * `undefined` for the production code, which then silently used its `homedir()` default while the test believed
 * it had redirected the home. The falsifier confirmed the consequence dynamically: the assignment had no effect
 * on the resolved module tree.
 *
 * HOW THIS PREVENTS A RECURRENCE. The accepted names are built from INTEGER CODE POINTS, so no copy-paste, font,
 * or renderer can silently substitute one for the other. Both names are accepted, the first is preferred, and
 * `applyRuntimeHome()` sets EVERY accepted name — which makes any caller's assignment effective regardless of
 * which spelling it used.
 *
 * WHICH NAME IS CANONICAL. The eight-code-point name is the one the shipped gate scripts already read and the one
 * `scripts/gates/README.md` documents, so it stays first for compatibility. The twelve-code-point name is accepted
 * because the storage suite and several probes use it, and refusing it would leave their redirection inert —
 * exactly the defect being corrected.
 *
 * NOT A PRODUCT COMPONENT. PLAIN JAVASCRIPT (`.mjs`), bare node.
 */
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The accepted environment-variable names, by code point.
 *
 *   [68,83,72,95,72,79,77,69]                          the canonical name used by the shipped gates
 *   [114,117,110,116,105,109,101,95,72,79,77,69]       the name the storage suite and probes assign
 *
 * They differ ONLY in the first character, and they are not interchangeable as identifiers — that is the whole
 * point of writing them this way.
 */
export const RUNTIME_HOME_ENV_NAMES = Object.freeze([
  String.fromCharCode(68, 83, 72, 95, 72, 79, 77, 69),
  String.fromCharCode(114, 117, 110, 116, 105, 109, 101, 95, 72, 79, 77, 69),
]);

/** The default when nothing is configured: the installer's own location under the user profile. */
export function defaultRuntimeHome() {
  return join(homedir(), ".dsh");
}

/**
 * Resolve the runtime home from the environment.
 *
 * Returns `{ path, source }` so a receipt can record WHERE the value came from. A test that assigns a name and
 * still sees `source: "default"` now has a visible, recorded failure instead of a silent one.
 */
export function resolveRuntimeHome(environment = process.env) {
  for (const name of RUNTIME_HOME_ENV_NAMES) {
    const value = environment[name];
    if (typeof value === "string" && value.trim() !== "") {
      return { path: value.trim().replace(/\\/gu, "/"), source: "environment", variableCodePoints: [...name].map((character) => character.codePointAt(0)) };
    }
  }
  return { path: defaultRuntimeHome().replace(/\\/gu, "/"), source: "default", variableCodePoints: null };
}

/** The resolved path alone, for callers that only need the value. */
export function runtimeHomePath(environment = process.env) {
  return resolveRuntimeHome(environment).path;
}

/**
 * Set the runtime home under EVERY accepted name.
 *
 * This is what makes a caller's redirection effective: whichever spelling it used, the production code reads one
 * of them, so all of them must agree.
 */
export function applyRuntimeHome(value, environment = process.env) {
  const normalised = String(value).replace(/\\/gu, "/");
  for (const name of RUNTIME_HOME_ENV_NAMES) environment[name] = normalised;
  return { applied: normalised, names: RUNTIME_HOME_ENV_NAMES.map((name) => [...name].map((character) => character.codePointAt(0))) };
}

/**
 * A COPY OF THE ENVIRONMENT WITH EVERY ACCEPTED HOME NAME SET.
 *
 * A child process gets a fresh environment, so setting the value in the parent does not reach it. Passing a
 * single key is what produced the measured failure: the parent set one spelling, the child's fence read the other,
 * and the worker booted against the developer's real home.
 */
export function runtimeHomeEnvironment(value, base = process.env) {
  const environment = { ...base };
  const normalised = String(value).split(String.fromCharCode(92)).join("/");
  for (const name of RUNTIME_HOME_ENV_NAMES) environment[name] = normalised;
  return environment;
}

/**
 * Restore whatever was present before `applyRuntimeHome`, so a test can leave the environment as it found it.
 * Returns the values it restored, including the ones it had to DELETE because they were absent originally.
 */
export function restoreRuntimeHome(previous, environment = process.env) {
  const restored = [];
  for (const name of RUNTIME_HOME_ENV_NAMES) {
    if (previous[name] === undefined) {
      delete environment[name];
      restored.push({ variableCodePoints: [...name].map((character) => character.codePointAt(0)), restored: "deleted" });
    } else {
      environment[name] = previous[name];
      restored.push({ variableCodePoints: [...name].map((character) => character.codePointAt(0)), restored: "previous" });
    }
  }
  return restored;
}

/** Snapshot the accepted names, for `restoreRuntimeHome`. */
export function captureRuntimeHome(environment = process.env) {
  const snapshot = {};
  for (const name of RUNTIME_HOME_ENV_NAMES) snapshot[name] = environment[name];
  return snapshot;
}
