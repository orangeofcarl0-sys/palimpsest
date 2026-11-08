import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const authorEmails = new Set([
  "orangeofcarl0@gmail.com",
  "237937212+orangeofcarl0-sys@users.noreply.github.com",
]);
const committerEmails = new Set([...authorEmails, "noreply@github.com"]);
const coauthorField = /^[ \t]*co-authored-by[ \t]*:/im;
const gitIdentity = /^.+ <([^<>\s]+)> \d+ [+-]\d{4}$/;
const oid = /^[0-9a-f]{40}$/;

function git(...args) {
  return execFileSync("git", ["--no-replace-objects", ...args], { encoding: "utf8" });
}

function inspect(message, author, committer, source) {
  const violations = [];
  if (coauthorField.test(message)) violations.push("unauthorized co-author field");
  if (!authorEmails.has(gitIdentity.exec(author)?.[1].toLowerCase())) {
    violations.push("author email is outside the allowlist");
  }
  if (!committerEmails.has(gitIdentity.exec(committer)?.[1].toLowerCase())) {
    violations.push("committer email is outside the allowlist");
  }
  for (const violation of violations) console.error(`${source}: ${violation}`);
  return violations.length > 0;
}

function header(headers, key) {
  const prefix = `${key} `;
  const fields = headers.filter((line) => line.startsWith(prefix));
  return fields.length === 1 ? fields[0].slice(prefix.length) : "";
}

function inspectRange(base, head) {
  if (![base, head].every((sha) => oid.test(sha ?? "") && git("cat-file", "-t", sha).trim() === "commit")) {
    throw new Error("Both endpoints must be exact commit SHAs");
  }
  if (git("rev-parse", "--is-shallow-repository").trim() !== "false") {
    throw new Error("Full history is required for attribution checks");
  }
  const revisions = git("rev-list", `${base}..${head}`).trim().split(/\r?\n/).filter(Boolean);
  let rejected = false;
  for (const sha of revisions) {
    const raw = git("cat-file", "commit", sha);
    const boundary = raw.indexOf("\n\n");
    if (boundary < 0) throw new Error(`Malformed commit ${sha}`);
    const headers = raw.slice(0, boundary).split("\n");
    const failed = inspect(raw.slice(boundary + 2), header(headers, "author"), header(headers, "committer"), sha);
    rejected ||= failed;
  }
  return rejected;
}

try {
  const [mode, first, second, ...extra] = process.argv.slice(2);
  if (mode === "message" && first && second === undefined) {
    process.exitCode = Number(inspect(
      readFileSync(first, "utf8"), git("var", "GIT_AUTHOR_IDENT").trimEnd(),
      git("var", "GIT_COMMITTER_IDENT").trimEnd(), "Commit message",
    ));
  } else if (mode === "range" && first && second && extra.length === 0) {
    process.exitCode = Number(inspectRange(first, second));
  } else {
    throw new Error("Usage: commit-attribution.mjs message <file> | range <base-sha> <head-sha>");
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
