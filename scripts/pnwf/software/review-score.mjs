import { execFileSync } from "node:child_process";
import { assert, changed, digest, git } from "../energy/contract.mjs";
import { CORRECTION_PATH, REVIEW } from "./contract.mjs";

export const REVIEW_SCORE_SCHEMA = "pnwf-grpc-review-semantics/v2";

const zero = /\b(?:zero(?:[- ]valued)?|0)\s*(?:value\s+)?limits?\b|\blimit\s*(?:(?:=|:|of|is|set to)\s*)?(?:zero|0)\b|\b(?:zero|0)\b(?=[^.!?\n]{0,36}\blimits?\b)/u;
const explicitZero = /\bexplicit(?:ly)?(?:[- ]zero|\s+(?:(?:supplied|set|provided)\s+(?:(?:as|to)\s+)?)?0)\b/u;
const limit = /\blimits?\b/u;
const omitted = /\b(?:omitted|omitting|missing|absent|unset|unspecified|undefined)\b|\b(?:not (?:set|provided|specified|supplied)|without (?:a |the )?limit|left (?:out|unset|unspecified)|no limit (?:is )?(?:provided|specified|supplied))\b/u;
const old = /\b(?:old|previous(?:ly)?|original(?:ly)?|initial|first[- ]release|first version|before(?: the (?:fleet )?correction)?|prior to|used to)\b/u;
const revised = /\b(?:new|accepted|corrected|updated|revised|now|after(?: the (?:fleet )?correction)?)\b/u;
const empty = /\b(?:empty (?:stream|response)|(?:no|zero|0) readings?\b|(?:returns?|yields?|sends?|emits?) nothing\b)\b/u;
const firstThree = /\b(?:first|earliest) (?:up to )?(?:three|3) (?:available )?readings?\b/u;
const sourceOrder = /\b(?:source|fixture|original|input|stored|existing|insertion|dataset) order\b|\border (?:of|from|in) (?:the )?(?:source|fixture|dataset|data)\b/u;
const carryBoth = /\b(?:both (?:forms|cases|inputs|requests)|either (?:form|case|input|request)|the same (?:forms|cases|inputs|requests)|both (?:return|yield|produce|stream|emit))\b/u;
const onePerFrame = [
  /\b(?:exactly )?(?:one|1|a single) reading(?: message)? (?:per|in (?:each|every)) (?:grpc )?(?:message )?frame\b/u,
  /\b(?:each|every) reading(?: message)?\b[^.!?\n]{0,75}\b(?:its own|a separate|a distinct|an individual|a single) (?:grpc )?(?:message )?frame\b/u,
  /\b(?:each|every) (?:grpc )?(?:message )?frame\b[^.!?\n]{0,65}\b(?:exactly one|one|a single) reading\b/u,
  /\b(?:one|a single) (?:grpc )?(?:message )?frame (?:per|for (?:each|every)) reading\b/u,
  /\breadings (?:are|remain) (?:individually framed|framed individually)\b/u,
];
const contraryFrames = /\b(?:multiple|several|more than one|two) readings?\b.{0,45}\b(?:per|(?:in|into) (?:each|every|one|a single|the same)) (?:grpc )?(?:message )?frame\b|\b(?:not|never|isn't|doesn't|isn’t|doesn’t)\b.{0,36}\b(?:exactly )?one reading per frame\b|\b(?:each|every) reading\b.{0,38}\b(?:does not|is not|isn’t|isn't|doesn’t|doesn't)\b.{0,32}\bframe\b/u;
const negatedBehavior = /\b(?:not|never|no longer|doesn[’']t|didn[’']t) (?:return|produce|yield|send|emit)\w*\b|\b(?:non[- ]empty|(?:not|never) (?:an? )?empty) (?:stream|response)\b/u;

const plain = text => text.replace(/[`*]/gu, "").trim().toLowerCase();
const tableCells = line => line.trim().replace(/^\||\|$/gu, "").split(/(?<!\\)\|/u).map(plain);

function oldDefaultTable(body) {
  const lines = body.split(/\r?\n/u);
  for (let i = 0; i + 2 < lines.length; i++) {
    if (!lines[i].includes("|")) continue;
    const headers = tableCells(lines[i]);
    const divider = tableCells(lines[i + 1]);
    if (divider.length !== headers.length || !divider.every(cell => /^:?-{3,}:?$/u.test(cell))) continue;
    const inputs = headers.flatMap((cell, col) => /^(?:request|input|limit)\b/u.test(cell) && !old.test(cell) && !revised.test(cell) ? [col] : []);
    const before = headers.flatMap((cell, col) => old.test(cell) && !revised.test(cell) ? [col] : []);
    if (inputs.length !== 1 || before.length !== 1) continue;
    const matched = new Set();
    const evidence = [lines[i]];
    let contradicted = false;
    for (let row = i + 2; row < lines.length && lines[row].includes("|"); row++) {
      const cells = tableCells(lines[row]);
      if (cells.length !== headers.length) break;
      const input = cells[inputs[0]];
      const forms = [];
      if (zero.test(input) || explicitZero.test(input) || /^(?:zero|0)$/u.test(input)) forms.push("zero");
      if (omitted.test(input)) forms.push("omitted");
      if (!forms.length) continue;
      const behavior = cells[before[0]];
      if (!empty.test(behavior) || firstThree.test(behavior) || negatedBehavior.test(behavior)) {
        contradicted = true;
        break;
      }
      for (const form of forms) matched.add(form);
      evidence.push(lines[row]);
    }
    if (matched.size === 2 && !contradicted) return evidence.join("\n");
  }
  return undefined;
}

/**
 * Match the scenario's written claims, independently of the actual wire and test
 * results. Keep the evidence for each criterion so an omission is auditable.
 */
export function reviewClaims(body, basis) {
  const paragraphs = body.replaceAll("\r\n", "\n").split(/\n\s*\n/u).map(part =>
    part.replace(/^[ \t]*#{1,6}\s+/gmu, "").replace(/[`*]/gu, "").replace(/\s+/gu, " ").trim()).filter(Boolean);
  const clauses = paragraphs.flatMap((part, index) => part.split(/(?<=[.!?])\s+|;\s+|\s+\|\s+|,\s+(?:whereas|but)\s+/u)
    .map(text => ({ text, lower: text.toLowerCase(), paragraph: index })));
  const checks = [];
  const record = (id, evidence, detail) => checks.push({
    id, passed: evidence !== undefined, evidence: evidence ?? null, ...(evidence === undefined && detail ? { detail } : {}),
  });
  const find = (...patterns) => clauses.find(clause => patterns.every(pattern => pattern.test(clause.lower)))?.text;
  const paired = (text, topic = text) => omitted.test(text) && (zero.test(text) || (limit.test(topic) && explicitZero.test(text)));
  const defaultClaim = (version, otherVersion, behavior, opposite) => {
    for (const [index, clause] of clauses.entries()) {
      const current = clause.lower;
      if (!behavior.test(current) || opposite.test(current) || negatedBehavior.test(current)) continue;
      const prev = clauses[index - 1];
      const sameParagraph = prev?.paragraph === clause.paragraph;
      const tagged = version.test(current) || (sameParagraph && !otherVersion.test(current) && version.test(prev.lower));
      if (!tagged) continue;
      const topic = sameParagraph && !otherVersion.test(prev.lower) ? prev.lower + " " + current : current;
      if (paired(current, topic)) {
        return sameParagraph && !version.test(current) ? prev.text + " " + clause.text : clause.text;
      }
      const input = clauses.slice(Math.max(0, index - 3), index).reverse().find(row => paired(row.lower));
      if (input && (carryBoth.test(current) || (sameParagraph && zero.test(prev.lower) &&
        /\b(?:decode|normalize|default)\w*\b/u.test(input.lower)))) return input.text + " " + (sameParagraph ? prev.text + " " : "") + clause.text;
    }
    return undefined;
  };
  record("ACCEPTED_HEAD", body.includes(basis) ? basis : undefined);
  record("FLEET_CORRECTION_PATH", body.includes(CORRECTION_PATH) ? CORRECTION_PATH : undefined);
  const oldDefault = oldDefaultTable(body) ?? defaultClaim(old, revised, empty, firstThree);
  const newDefault = defaultClaim(revised, old, firstThree, empty);
  record("OLD_ZERO_AND_OMITTED_EMPTY", oldDefault, "State that both a supplied zero limit and an absent limit returned an empty stream in the first release.");
  record("NEW_ZERO_AND_OMITTED_FIRST_THREE", newDefault, "State that both forms now return the first three available readings.");
  record("SOURCE_ORDER", newDefault && sourceOrder.test(newDefault.toLowerCase()) ? newDefault : find(sourceOrder, /\breadings?|streamreadings\b/u));
  const frames = clauses.find(clause => !contraryFrames.test(clause.lower) && onePerFrame.some(pattern => pattern.test(clause.lower)))?.text;
  record("ONE_READING_PER_FRAME", frames, "State that StreamReadings sends each Reading in its own gRPC message frame.");
  record("POSITIVE_LIMITS", find(/\bpositive (?:values?|limits?)\b/u, /\b(?:unchanged|remain|still|keep|preserv|honor|select|continue|same|stay|compatib)\w*\b/u));
  record("UNARY_GET_READING", find(/\bgetreading\b/u, /\bunary\b/u));
  record("UNKNOWN_SITE_NOT_FOUND", find(/\b(?:not_found|grpc-status:?\s*5)\b/u, /\b(?:unknown|unrecognized|nonexistent|missing)[- ]sites?\b/u));
  record("PROTO_FIELD_NUMBERS", find(/\b(?:field (?:numbers?|tags?)|numbered fields?)\b/u, /\b(?:unchanged|preserv|remain|same|compatib|keep)\w*\b/u));
  record("REST_COMPATIBILITY", find(/\brest\b/u, /\b(?:unchanged|preserv|remain|same|compatib|keep)\w*\b/u));
  record("PUBLIC_TESTS_PASSED", find(/\bnode --test\b/u, /\b(?:pass(?:ed|ing)?|succeed(?:ed)?|no failures|green)\b/u));
  return { schema: REVIEW_SCORE_SCHEMA, passed: checks.every(check => check.passed), checks };
}

export function scoreSemanticReview({ repo, basis, commit }) {
  const changedPaths = changed(repo, basis, commit);
  assert(changedPaths.length === 1 && changedPaths[0] === REVIEW, "SOFTWARE_REVIEW_SCOPE_MISMATCH");
  assert(git(repo, "ls-tree", commit, "--", REVIEW).startsWith("100644 blob "), "SOFTWARE_REVIEW_NOT_REGULAR");
  const bytes = execFileSync("git", ["-c", "safe.directory=*", "-C", repo, "cat-file", "blob", commit + ":" + REVIEW]);
  return { commit, tree: git(repo, "rev-parse", commit + "^{tree}"), changedPaths, reviewSha256: digest(bytes),
    ...reviewClaims(bytes.toString("utf8"), basis) };
}
