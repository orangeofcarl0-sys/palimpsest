#!/usr/bin/env node
/**
 * R2-LR §8 — THE ANTI-VACUITY CHECK.
 *
 * WHY THIS EXISTS. The R1-L live gate contained `of(...) !== "" || true` — an assertion that is
 * unconditionally true, so it asserted nothing. It reported PASS for the whole R1 line while the worker
 * index was never delivered at all. The defect was not a wrong value; it was an assertion that could not
 * fail, and no amount of running it would ever have revealed that.
 *
 * WHAT IT DOES. It scans gate and test source for the syntactic forms that make an assertion unconditionally
 * true (or unconditionally false), and reports each with its file and line.
 *
 * WHAT IT DOES NOT DO (§8, stated honestly). This does NOT prove that a test is non-vacuous. A test can be
 * vacuous without matching any of these patterns — asserting a constant, asserting on a mock it just
 * configured, or asserting a property that is true by construction. The check forbids ONE specific class of
 * defect: the literal unconditional form. It is a guard against a known failure mode, not a proof of rigour,
 * and it must never be described as one.
 *
 * SCOPE (§8). Repository-wide enforcement is unreasonable: ordinary code legitimately contains `x || true`
 * as a defaulting idiom. So the scan is scoped to the LIVE AND EVIDENCE GATES, where an assertion that
 * cannot fail is a real hazard because those gates are what the research line's claims rest on.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REPO = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');

/**
 * The scanned scope. `scripts/gates/**` is the live-gate family (R1-L, R1-H, R1-HR, R1-HC, D2/D4/D5,
 * E-line) and `scripts/r1s`, `scripts/r1h`, `scripts/r1hr`, `scripts/r1hc` carry their conformance gates.
 * The R2 experimental harnesses are included because their gates carry the research verdicts.
 */
const SCOPE = Object.freeze([
  'scripts/gates',
  'scripts/r1s',
  'scripts/r1h',
  'scripts/r1hr',
  'scripts/r1hc',
  'scripts/r2lr',
  'scripts/r2m',
  'scripts/r2s',
  'scripts/r2u',
  'scripts/r2e',
  'scripts/r2v',
  'scripts/r2vr',
  'scripts/r3spec',
]);

/**
 * The forbidden forms.
 *
 * THE OPERAND CONTEXT MATTERS, and a regex alone cannot decide it. Two rounds of false positives taught
 * this:
 *
 *   · `\bfalse\s*&&` matched inside ordinary identifiers — `isFalse &&`, `predefined &&`;
 *   · `(?<![A-Za-z0-9_$.])false\s*&&` then matched legitimate COMPARISONS — `allowed === false && …`,
 *     which is an ordinary assertion of two facts and appears throughout the R1-HR/R1-HC gates.
 *
 * So the literal operators are found by regex and then judged by what PRECEDES them: a `true`/`false`
 * that is the RIGHT operand of a comparison is a value, not an unconditional literal. `isComparisonOperand`
 * decides that, and the reason is recorded per match rather than suppressed.
 */
const BOUNDARY_LEFT = String.raw`(?<![A-Za-z0-9_$.])`;
const PATTERNS = Object.freeze([
  Object.freeze({ id: 'OR_TRUE', regex: new RegExp(String.raw`\|\|\s*true\b`, 'gu'), why: '`condition || true` is unconditionally true, so the assertion cannot fail', literal: 'true' }),
  Object.freeze({ id: 'TRUE_OR', regex: new RegExp(`${BOUNDARY_LEFT}true\\s*\\|\\|`, 'gu'), why: '`true || condition` is unconditionally true', literal: 'true' }),
  Object.freeze({ id: 'AND_FALSE', regex: new RegExp(String.raw`&&\s*false\b`, 'gu'), why: '`condition && false` is unconditionally false', literal: 'false' }),
  Object.freeze({ id: 'FALSE_AND', regex: new RegExp(`${BOUNDARY_LEFT}false\\s*&&`, 'gu'), why: '`false && condition` is unconditionally false', literal: 'false' }),
  Object.freeze({ id: 'EXPECT_TRUE_TRUE', regex: /expect\s*\(\s*true\s*\)\s*\.\s*to(?:Be|Equal)\s*\(\s*true\s*\)/gu, why: '`expect(true).toBe(true)` asserts nothing', literal: null }),
  Object.freeze({ id: 'ASSERT_TRUE', regex: new RegExp(`${BOUNDARY_LEFT}assert\\s*\\(\\s*true\\s*\\)`, 'gu'), why: '`assert(true)` asserts nothing', literal: null }),
]);

/**
 * Is the literal at `index` the RIGHT operand of a comparison?
 *
 * If the nearest preceding non-space characters are `==`, `===`, `!=` or `!==`, the literal is a VALUE
 * being compared (`allowed === false`) and the surrounding `&&` is an ordinary conjunction of two real
 * facts. Such a form can fail, so it is not the defect this check exists to forbid.
 */
function isComparisonOperand(line, index) {
  const before = line.slice(0, index).replace(/\s+$/u, '');
  return /(?:===|!==|==|!=)$/u.test(before);
}

/**
 * Lines that are allowed to contain a forbidden form, with the reason recorded here rather than in a
 * silent allowlist. Each entry is `{ file, lineIncludes, why }`; a match is suppressed only when the line
 * also contains the quoted fragment, so a new occurrence elsewhere in the same file is still reported.
 */
const ALLOWED = Object.freeze([
  Object.freeze({
    file: 'scripts/r2lr/anti-vacuity.mjs',
    lineIncludes: 'condition || true',
    why: 'this file documents the forbidden pattern in its own comments and pattern table',
  }),
]);

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (entry.name.endsWith('.mjs') || entry.name.endsWith('.js') || entry.name.endsWith('.ts')) out.push(path);
  }
  return out;
}

/**
 * Strip comments and string literals so a pattern mentioned in PROSE is not reported as a violation.
 *
 * NEWLINES ARE PRESERVED IN EVERY STATE. A first version dropped them inside block comments and template
 * literals, which shifted every subsequent line number and made the report point at innocent lines — the
 * scanner then looked broken rather than the code. Emitting a newline for every newline consumed keeps the
 * stripped text line-aligned with the original, so a reported line number is the real one.
 */
function stripCommentsAndStrings(source) {
  let out = '';
  let index = 0;
  let state = 'code';
  let quote = '';
  const emitNewline = (char) => (char === '\n' ? '\n' : ' ');
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (state === 'code') {
      if (char === '/' && next === '/') { state = 'line-comment'; index += 2; continue; }
      if (char === '/' && next === '*') { state = 'block-comment'; index += 2; continue; }
      if (char === '"' || char === "'" || char === '`') { state = 'string'; quote = char; index += 1; continue; }
      out += char;
      index += 1;
      continue;
    }
    if (state === 'line-comment') {
      if (char === '\n') { state = 'code'; out += char; }
      index += 1;
      continue;
    }
    if (state === 'block-comment') {
      if (char === '*' && next === '/') { state = 'code'; index += 2; continue; }
      out += emitNewline(char);
      index += 1;
      continue;
    }
    // string
    if (char === '\\') { out += emitNewline(char); index += 1; if (index < source.length) { out += emitNewline(source[index]); index += 1; } continue; }
    if (char === quote) { state = 'code'; index += 1; continue; }
    out += emitNewline(char);
    index += 1;
  }
  return out;
}

const files = SCOPE.flatMap((entry) => walk(join(REPO, entry), []));
const violations = [];
for (const file of files) {
  const relative = file.replace(REPO, '').replace(/\\/gu, '/').replace(/^\//u, '');
  let source;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const originalLines = source.split('\n');
  const stripped = stripCommentsAndStrings(source).split('\n');
  for (const pattern of PATTERNS) {
    for (const [lineNumber, line] of stripped.entries()) {
      pattern.regex.lastIndex = 0;
      let match;
      while ((match = pattern.regex.exec(line)) !== null) {
        const original = originalLines[lineNumber] ?? '';
        const allowed = ALLOWED.some((entry) => entry.file === relative && original.includes(entry.lineIncludes));
        if (allowed) continue;
        /**
         * A `true`/`false` that is the right operand of a comparison is a VALUE, not an unconditional
         * literal — `allowed === false && other` is an ordinary conjunction of two real facts.
         */
        if (pattern.literal !== null) {
          const literalIndex = match[0].indexOf(pattern.literal);
          const absolute = match.index + (literalIndex === -1 ? 0 : literalIndex);
          if (isComparisonOperand(line, absolute)) continue;
        }
        violations.push({ file: relative, line: lineNumber + 1, pattern: pattern.id, why: pattern.why, source: original.trim().slice(0, 160) });
        break;
      }
    }
  }
}

process.stdout.write(`scanned ${String(files.length)} file(s) in ${String(SCOPE.length)} gate director(ies)\n`);
for (const violation of violations) {
  process.stdout.write(`FAIL  ${violation.file}:${String(violation.line)}  ${violation.pattern} — ${violation.why}\n      ${violation.source}\n`);
}
process.stdout.write(`\nR2-LR ANTI-VACUITY: ${violations.length === 0 ? 'PASS' : 'FAIL'} — ${String(violations.length)} unconditional form(s)\n`);
process.stdout.write('NOTE: this forbids ONE class of defect (the literal unconditional form). It does not prove any test is non-vacuous.\n');
process.exit(violations.length === 0 ? 0 : 1);
