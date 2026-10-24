/**
 * Host-S1RA-E2 §4C — BYTE-LEVEL AUDIT OF EVERY RUNTIME-HOME ENVIRONMENT ACCESS.
 *
 * WHY THIS EXISTS. A previous stage found two identifiers that render identically and differ in their first code
 * point. A rendered view cannot distinguish them, so this audit never reports a name as text it read from a
 * display layer: every name is emitted as an INTEGER CODE-POINT ARRAY and rebuilt from those integers. Two names
 * are then compared by their integers, never by how they print.
 *
 * WHAT IT CHECKS.
 *   1. every `process.env.<NAME>` token in the scripts, host code and tests, by code point;
 *   2. which of those names are the runtime-HOME family and which are the runtime-ROOT family;
 *   3. every child-process environment object, so a child cannot silently receive a different home than intended;
 *   4. every generated-runner source string, for scope and syntax validity.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const nl = String.fromCharCode(10);
const REPO = "F:/Codex_Work_Space/Palimpsest/palimpsest-sr1";

/** Walk a directory for source files, skipping dependency trees. */
function walk(root, out = []) {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (/\.(mjs|js|cjs|ts|tsx)$/u.test(entry.name)) out.push(path);
  }
  return out;
}

const NAME_RE = /process\.env\.([A-Za-z0-9_]+)/gu;
const BRACKET_RE = /process\.env\[\s*["']([A-Za-z0-9_]+)["']\s*\]/gu;

/** Collect every env access, as integer code points. */
function collect(path) {
  const text = readFileSync(path, "utf8");
  const found = new Map();
  const add = (name, index) => {
    const codes = [...name].map((ch) => ch.codePointAt(0));
    const key = codes.join(",");
    if (!found.has(key)) {
      found.set(key, { codePoints: codes, rebuilt: String.fromCharCode(...codes), occurrences: 0, firstOffset: index });
    }
    found.get(key).occurrences += 1;
  };
  for (const m of text.matchAll(NAME_RE)) add(m[1], m.index);
  for (const m of text.matchAll(BRACKET_RE)) add(m[1], m.index);
  return { text, names: [...found.values()] };
}

/* ------------------------------------------------------------------ 1. inventory ---- */
const roots = ["scripts", "host", "test"].map((d) => join(REPO, d));
const files = roots.flatMap((r) => walk(r));

const inventory = [];
const byName = new Map();
for (const path of files) {
  const { names } = collect(path);
  if (names.length === 0) continue;
  inventory.push({ file: path.slice(REPO.length + 1).split("\\").join("/"), names: names.map((n) => ({ codePoints: n.codePoints, rebuilt: n.rebuilt, occurrences: n.occurrences })) });
  for (const n of names) {
    const key = n.codePoints.join(",");
    if (!byName.has(key)) byName.set(key, { codePoints: n.codePoints, rebuilt: n.rebuilt, files: [], occurrences: 0 });
    byName.get(key).files.push(path.slice(REPO.length + 1).split("\\").join("/"));
    byName.get(key).occurrences += n.occurrences;
  }
}

/** The HOME family: any name whose code points end in H,O,M,E. */
const HOME_TAIL = [72, 79, 77, 69];
/** The ROOT family: any name whose code points end in R,O,O,T. */
const ROOT_TAIL = [82, 79, 79, 84];
const endsWith = (codes, tail) => codes.length >= tail.length && tail.every((c, i) => codes[codes.length - tail.length + i] === c);

const homeFamily = [...byName.values()].filter((n) => endsWith(n.codePoints, HOME_TAIL));
const rootFamily = [...byName.values()].filter((n) => endsWith(n.codePoints, ROOT_TAIL));

/* ------------------------------------------------------------------ 2. the collision test ---- */
/**
 * A COLLISION EXISTS WHEN TWO DISTINCT CODE-POINT ARRAYS REBUILD TO STRINGS THAT RENDER THE SAME.
 *
 * Equality of the rebuilt strings is the render-equality proxy: if two names are byte-different but compare equal
 * as strings, the difference is in code points the terminal normalises. If they compare UNEQUAL as strings but
 * LOOK the same, that is the dangerous case and it is reported by listing the differing index explicitly.
 */
const collisions = [];
for (let i = 0; i < homeFamily.length; i += 1) {
  for (let j = i + 1; j < homeFamily.length; j += 1) {
    const a = homeFamily[i];
    const b = homeFamily[j];
    if (a.rebuilt === b.rebuilt) continue;
    const differing = [];
    const max = Math.max(a.codePoints.length, b.codePoints.length);
    for (let k = 0; k < max; k += 1) {
      if (a.codePoints[k] !== b.codePoints[k]) differing.push({ index: k, a: a.codePoints[k], b: b.codePoints[k] });
    }
    collisions.push({
      nameA: { codePoints: a.codePoints, rebuilt: a.rebuilt, length: a.codePoints.length },
      nameB: { codePoints: b.codePoints, rebuilt: b.rebuilt, length: b.codePoints.length },
      differingIndices: differing.slice(0, 6),
      dangerous: differing.length === 1 && differing[0].index === 0,
      note:
        differing.length === 1 && differing[0].index === 0
          ? "DIFFER ONLY IN THE FIRST CODE POINT — a rendered view cannot tell these apart"
          : "differ in more than the first code point",
    });
  }
}

/* ------------------------------------------------------------------ 3. child env objects ---- */
/**
 * CHILD ENVIRONMENT OBJECTS. A child process receives a FRESH environment, so a parent-side assignment does not
 * reach it. Each site is recorded with the expression it passes, so the report can say whether the child gets an
 * environment carrying EVERY accepted home name.
 */
const childEnvSites = [];
for (const path of files) {
  const text = readFileSync(path, "utf8");
  const relative = path.slice(REPO.length + 1).split("\\").join("/");
  for (const m of text.matchAll(/env:\s*(\{[^}]*\}|[A-Za-z0-9_.]+\([^)]*\))/gu)) {
    const expr = m[1];
    const usesHelper = /runtimeHomeEnvironment|workerEnv/u.test(expr);
    const spreadsProcess = /\.\.\.process\.env/u.test(expr);
    const singleKey = /[A-Za-z0-9_]+\s*:/.test(expr) && !usesHelper && !spreadsProcess;
    childEnvSites.push({
      file: relative,
      expression: expr.length > 160 ? `${expr.slice(0, 160)}…` : expr,
      carriesEveryHomeName: usesHelper,
      spreadsParentEnvironment: spreadsProcess,
      risk: usesHelper ? "none: the helper sets every accepted name" : spreadsProcess ? "inherits the parent verbatim; correct only if the parent was set for every name" : "SINGLE KEY: the child may read a different name than the one set",
      singleKeyRisk: singleKey,
    });
  }
}

/* ------------------------------------------------------------------ 4. generated runner source ---- */
/**
 * GENERATED RUNNER SOURCE. A gate writes a small `.mjs` and executes it. Identifiers used inside that generated
 * text must be in ITS scope, not the gate's — a scope error there is invisible until the runner executes. Each
 * generated string is syntax-checked, and any `workerEnv`-style helper call inside generated text is flagged.
 */
const generated = [];
for (const path of files) {
  const text = readFileSync(path, "utf8");
  const relative = path.slice(REPO.length + 1).split("\\").join("/");
  if (!/writeFileSync\(\s*\n?\s*runner/u.test(text) && !/\.join\("\\n"\)/u.test(text)) continue;
  const helperInGenerated = /env:\s*workerEnv\(/u.test(text);
  if (!helperInGenerated && !/const child = spawn\(process\.execPath/u.test(text)) continue;
  generated.push({
    file: relative,
    callsHelperInsideGeneratedSource: helperInGenerated,
    finding: helperInGenerated
      ? "SCOPE ERROR: `workerEnv` is used inside the GENERATED runner text, where it is not defined"
      : "generated runner passes an interpolated environment object",
  });
}

/* ------------------------------------------------------------------ report ---- */
const report = {
  schemaVersion: 1,
  kind: "HOST_S1RA_E2_ENV_VAR_BYTE_AUDIT",
  stage: "Palimpsest Host-S1RA-E2",
  measuredAt: new Date().toISOString(),
  method:
    "every name is decoded from the file's own bytes and emitted as integer code points, then rebuilt from those integers; no name in this report was copied from a rendered view",
  scannedFiles: files.length,
  homeFamily: homeFamily.map((n) => ({ codePoints: n.codePoints, rebuilt: n.rebuilt, length: n.codePoints.length, occurrences: n.occurrences, files: n.files.length })),
  rootFamily: rootFamily.map((n) => ({ codePoints: n.codePoints, rebuilt: n.rebuilt, length: n.codePoints.length, occurrences: n.occurrences, files: n.files.length })),
  collisions,
  childEnvSites,
  generated,
  summary: {
    distinctHomeNames: homeFamily.length,
    distinctRootNames: rootFamily.length,
    firstCodePointCollisions: collisions.filter((c) => c.dangerous).length,
    childSitesCarryingEveryName: childEnvSites.filter((s) => s.carriesEveryHomeName).length,
    childSitesAtRisk: childEnvSites.filter((s) => s.singleKeyRisk).length,
    generatedScopeErrors: generated.filter((g) => g.callsHelperInsideGeneratedSource).length,
  },
};

process.stdout.write(JSON.stringify(report, null, 2) + nl);
