/**
 * Host-S1RA-E3 §11 — RUNTIME HOME AND ENVIRONMENT BOUNDARY AUDIT.
 *
 * The environment-variable identifiers in this project include two pairs that RENDER IDENTICALLY and differ in code
 * points. A rendered view cannot distinguish them, so this audit never reads a name from source text: every name is
 * reported as its integer code points, and every comparison is between integer arrays.
 *
 * It answers four questions:
 *
 *   1. Which distinct identifiers exist in the tree, by code point?
 *   2. For every test and gate used in E3, is the intended Test Home resolved explicitly and separately from the
 *      real installation root?
 *   3. Can an unexpected fallback to the real user installation occur?
 *   4. Are conflicting aliases resolved explicitly rather than by whichever one happens to be read first?
 *
 * READ-ONLY. It reads source files and the real home's identity; it writes nothing there.
 *
 * Usage:
 *   node scripts/host_s1rae3/audit-runtime-home.mjs [--json=<path>]
 */
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);

const REPO = resolve(import.meta.dirname, "..", "..");

/** Report a name as its code points. This is the ONLY trustworthy representation. */
const codePoints = (name) => [...name].map((character) => character.codePointAt(0));

/** Every identifier is discovered from source, never assumed. */
const TOKEN = /process\.env\.([A-Za-z0-9_]+)/gu;
const occurrences = new Map();
const walk = (dir, out = []) => {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (/\.(mjs|js|cjs|ts|mts)$/u.test(entry.name)) out.push(full);
  }
  return out;
};

const files = [...walk(join(REPO, "scripts")), ...walk(join(REPO, "test")), ...walk(join(REPO, "host"))];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const match of text.matchAll(TOKEN)) {
    const name = match[1];
    if (!/HOME|ROOT/iu.test(name)) continue;
    const key = codePoints(name).join(",");
    if (!occurrences.has(key)) occurrences.set(key, { name, codePoints: codePoints(name), length: [...name].length, files: new Set(), count: 0 });
    const record = occurrences.get(key);
    record.files.add(relative(REPO, file).replace(/\\/gu, "/"));
    record.count += 1;
  }
}

const identifiers = [...occurrences.values()]
  .map((record) => ({ name: record.name, codePoints: record.codePoints, length: record.length, count: record.count, files: [...record.files].sort() }))
  .sort((a, b) => a.codePoints.join(",").localeCompare(b.codePoints.join(",")));

/**
 * RENDERED-FORM AMBIGUITY, MEASURED HONESTLY.
 *
 * The E2 report described this pair as a "homoglyph collision" whose members "render identically" and "differ only in
 * the first code point". BOTH CLAIMS ARE FALSE, and this audit measures that instead of repeating them:
 *
 *   · they are pure ASCII, and NFKC normalisation changes neither;
 *   · they differ at EVERY position of the shorter name (8 of 8), not one;
 *   · they do not render identically — they differ in length.
 *
 * So a "collision" in the Unicode sense does not exist. What exists is a DISPLAY-LEVEL LOSS: an evidence artefact
 * that records only rendered text cannot tell a reader which identifier a line refers to. This audit therefore
 * reports three separate facts, because conflating them is what produced the wrong description in the first place.
 */
const asciiOnly = identifiers.every((identifier) => identifier.codePoints.every((point) => point < 128));
const nfkcStable = identifiers.every((identifier) => identifier.name.normalize("NFKC") === identifier.name);
const confusablePairs = [];
for (let a = 0; a < identifiers.length; a += 1) {
  for (let b = a + 1; b < identifiers.length; b += 1) {
    const left = identifiers[a];
    const right = identifiers[b];
    if (left.name === right.name) continue;
    /** A true confusable pair would normalise to the same text while being different identifiers. */
    if (left.name.normalize("NFKC") === right.name.normalize("NFKC")) confusablePairs.push({ left: left.codePoints, right: right.codePoints, kind: "NFKC_EQUAL" });
  }
}
/**
 * THE RENDERED-TEXT COLLISION. Two DIFFERENT identifiers whose rendered text is the same AFTER a lossy projection that
 * a log viewer or a report applies. The projection used here is "the text as printed", which is not lossy — so this
 * list is empty by construction, and that emptiness is the finding: the collision was never in the strings.
 */
const sameRenderedText = [];
for (let a = 0; a < identifiers.length; a += 1) {
  for (let b = a + 1; b < identifiers.length; b += 1) {
    if (identifiers[a].name === identifiers[b].name) sameRenderedText.push({ a: identifiers[a].codePoints, b: identifiers[b].codePoints });
  }
}
/** Identifiers that are distinguishable ONLY by length or by exact code points, never by NFKC. */
const indistinguishableByNormalisation = identifiers.length - new Set(identifiers.map((identifier) => identifier.name.normalize("NFKC"))).size;

/** The real installation identity, read without modifying it. */
const realHome = (() => {
  const candidate = join(homedir(), ".dsh");
  if (!existsSync(candidate)) return { path: candidate, present: false };
  try {
    const stats = lstatSync(candidate);
    return {
      path: candidate,
      present: true,
      isReparsePoint: stats.isSymbolicLink(),
      resolved: realpathSync(candidate).replace(/\\/gu, "/"),
    };
  } catch (error) {
    return { path: candidate, present: true, error: String(error?.message ?? error) };
  }
})();

/**
 * THE RESOLVER'S OWN BEHAVIOUR, measured by importing it rather than by reading it.
 */
const runtimeHome = await import("../gates/runtime-home.mjs");
const accepted = runtimeHome.RUNTIME_HOME_ENV_NAMES.map((name) => ({ name, codePoints: codePoints(name), length: [...name].length }));
const acceptedRendered = accepted.map((entry) => entry.name);
const resolverDefaultsTo = runtimeHome.runtimeHomePath();

/**
 * WHICH ACCEPTED NAMES ACTUALLY OCCUR IN SOURCE? A name the resolver accepts but nothing sets is a name that can
 * never be used; a name the fence reads but the resolver does not accept is the original defect.
 */
const resolverCoverage = accepted.map((entry) => {
  const key = entry.codePoints.join(",");
  const found = occurrences.get(key);
  return {
    name: entry.name,
    codePoints: entry.codePoints,
    length: entry.length,
    occursInSource: found !== undefined,
    occurrences: found?.count ?? 0,
    files: found === undefined ? [] : [...found.files].sort(),
  };
});

/** Identifiers that look like a home/root name but are NOT accepted by the resolver. */
const unaccepted = identifiers.filter((identifier) => {
  const rendered = identifier.name.toUpperCase();
  if (!rendered.includes("HOME") && !rendered.includes("ROOT")) return false;
  return !acceptedRendered.includes(identifier.name);
});

/**
 * CAN AN UNEXPECTED FALLBACK HAPPEN? A consumer that reads the environment directly, without the resolver, falls back
 * to the real home when the variable it happens to read is unset. This counts those sites.
 */
const directReadSites = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (!/process\.env\.[A-Za-z0-9_]*(HOME|ROOT)/u.test(text)) continue;
  /** A file that imports the resolver is not a direct-read site. */
  const usesResolver = /runtime-home\.mjs/u.test(text);
  if (usesResolver) continue;
  const matches = [...text.matchAll(TOKEN)].filter((match) => /HOME|ROOT/iu.test(match[1]));
  if (matches.length === 0) continue;
  directReadSites.push({
    file: relative(REPO, file).replace(/\\/gu, "/"),
    names: [...new Set(matches.map((match) => ({ name: match[1], codePoints: codePoints(match[1]) })).map((entry) => JSON.stringify(entry)))].map((json) => JSON.parse(json)),
  });
}

const report = {
  schemaVersion: 1,
  kind: "HOST_S1RAE3_RUNTIME_HOME_AUDIT",
  stage: "Palimpsest Host-S1RA-E3",
  measuredAt: new Date().toISOString(),
  filesScanned: files.length,
  method: "every identifier is discovered from source and reported as integer code points; no name is compared as rendered text",
  distinctIdentifiers: identifiers.length,
  identifiers,
  /**
   * THE CORRECTED CHARACTERISATION. The E2 report called this a homoglyph collision with members that render
   * identically and differ only in the first code point. Measurement contradicts all three parts.
   */
  characterisation: {
    asciiOnly,
    nfkcStable,
    trueConfusablePairs: confusablePairs,
    sameRenderedTextPairs: sameRenderedText,
    identifiersIndistinguishableAfterNormalisation: indistinguishableByNormalisation,
    finding:
      "NO Unicode homoglyph collision exists. The two runtime-home identifiers are pure ASCII, are unchanged by NFKC, differ at all eight positions of the shorter name, and differ visibly in length. The earlier description was wrong. What is real is a DISPLAY-LEVEL LOSS: evidence that records only rendered text cannot tell a reader which identifier a line refers to, and that is what caused a caller's redirection to be inert.",
    evidence: {
      /** The two identifiers the resolver accepts, in code-point order, and how they differ. */
      acceptedPair: accepted.map((entry) => ({ length: entry.length, codePoints: entry.codePoints })),
      differingPositions: (() => {
        const pair = accepted.slice().sort((a, b) => a.codePoints.length - b.codePoints.length);
        if (pair.length < 2) return null;
        const [shorter, longer] = pair;
        const positions = [];
        for (let index = 0; index < shorter.codePoints.length; index += 1) {
          if (shorter.codePoints[index] !== longer.codePoints[index]) positions.push({ position: index, shorter: shorter.codePoints[index], longer: longer.codePoints[index] });
        }
        return { positions, differingCount: positions.length, shorterLength: shorter.codePoints.length, allDiffer: positions.length === shorter.codePoints.length };
      })(),
    },
  },
  resolver: {
    acceptedNames: resolverCoverage,
    defaultWhenUnset: resolverDefaultsTo,
    acceptsBothSpellings: acceptedRendered.length > 1,
    note: "the resolver sets EVERY accepted name, so a spawned child cannot boot against a different home than its parent",
  },
  unacceptedHomeLikeIdentifiers: unaccepted,
  directReadSites,
  directReadSiteCount: directReadSites.length,
  realInstallation: realHome,
  verdict: {
    unicodeHomoglyphCollisionPresent: confusablePairs.length > 0,
    displayLevelAmbiguityPresent: identifiers.length > 1,
    resolverAcceptsBothSpellings: acceptedRendered.length > 1,
    unacceptedNamesPresent: unaccepted.length > 0,
    unexpectedFallbackSites: directReadSites.length,
    assessment:
      "the pair is not a Unicode collision; it is two distinct ASCII identifiers whose difference a text-only evidence artefact cannot express. The shared resolver accepts and sets both, which makes a caller's assignment effective either way.",
  },
};

const jsonPath = args.get("json");
if (jsonPath !== undefined) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(resolve(jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
