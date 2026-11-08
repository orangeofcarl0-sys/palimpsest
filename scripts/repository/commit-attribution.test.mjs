import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const guard = fileURLToPath(new URL("./commit-attribution.mjs", import.meta.url));
const hook = fileURLToPath(new URL("../../.githooks/commit-msg", import.meta.url));
const owner = "orangeofcarl0@gmail.com";
const badEmail = "fixture@example.invalid";

function fixture(t) {
  const parent = realpathSync(tmpdir());
  const cwd = realpathSync(mkdtempSync(join(parent, "palimpsest-attribution-")));
  t.after(() => {
    assert.equal(dirname(cwd), parent);
    rmSync(cwd, { recursive: true, force: true });
  });
  const env = { ...process.env };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_CONFIG_COUNT",
    "GIT_CONFIG_PARAMETERS", "GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"]) {
    delete env[key];
  }
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_GLOBAL = join(cwd, "empty-gitconfig");
  function run(program, args, overrides = {}) {
    const result = spawnSync(program, args, { cwd, env: { ...env, ...overrides }, encoding: "utf8" });
    if (result.error) throw result.error;
    return result;
  }
  function git(...args) {
    const result = run("git", args);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  git("init", "--initial-branch=main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", owner);
  git("config", "commit.gpgsign", "false");
  git("commit", "--allow-empty", "-m", "historical", "--author", `Old <${badEmail}>`);
  return { cwd, git, run, base: git("rev-parse", "HEAD") };
}

function installHook({ cwd, git }) {
  mkdirSync(join(cwd, "scripts", "repository"), { recursive: true });
  mkdirSync(join(cwd, ".githooks"));
  copyFileSync(guard, join(cwd, "scripts", "repository", "commit-attribution.mjs"));
  const destination = join(cwd, ".githooks", "commit-msg");
  copyFileSync(hook, destination);
  chmodSync(destination, 0o755);
  git("config", "core.hooksPath", ".githooks");
}

test("commit-msg rejects mixed-case trailers and the effective --author and committer overrides", (t) => {
  const { cwd, git, run, base } = fixture(t);
  installHook({ cwd, git });

  const message = join(cwd, "message.txt");
  writeFileSync(message, `Subject\r\n\r\n\tcO-aUtHoReD-bY \t: Fixture <${badEmail}>\r\n\r\nmore text\r\n`);
  const trailer = run("git", ["commit", "--allow-empty", "--cleanup=verbatim", "-F", message]);
  assert.equal(trailer.status, 1, trailer.stderr);
  assert.match(trailer.stderr, /unauthorized co-author field/);
  const author = run("git", ["commit", "--allow-empty", "-m", "Clean", "--author", `Fixture <${badEmail}>`]);
  assert.equal(author.status, 1, author.stderr);
  assert.match(author.stderr, /author email is outside the allowlist/);
  const committer = run("git", ["commit", "--allow-empty", "-m", "Clean"], { GIT_COMMITTER_EMAIL: badEmail });
  assert.equal(committer.status, 1, committer.stderr);
  assert.match(committer.stderr, /committer email is outside the allowlist/);
  assert.equal(git("rev-parse", "HEAD"), base);
  git("commit", "--allow-empty", "-m", "Discuss Co-authored-by: inline", "-m", `Signed-off-by: Fixture <${owner}>`);
});

test("range checks skipped hooks, intermediate commits, raw email and original objects", (t) => {
  const { cwd, git, run, base } = fixture(t);
  installHook({ cwd, git });
  git("commit", "--allow-empty", "--no-verify", "-m", "Bypass", "-m", `Co-authored-by: Invented <${badEmail}>`);
  const trailer = git("rev-parse", "HEAD");
  git("commit", "--allow-empty", "--no-verify", "-m", "Email override", "--author", `Fixture <${badEmail}>`);
  const author = git("rev-parse", "HEAD");
  git("commit", "--allow-empty", "-m", "Clean tip");
  const head = git("rev-parse", "HEAD");
  writeFileSync(join(cwd, ".mailmap"), `Fixture <${owner}> <${badEmail}>\n`);
  writeFileSync(join(cwd, "scripts", "repository", "commit-attribution.mjs"), "process.exit(0);\n");
  git("replace", trailer, head);

  const result = run(process.execPath, [guard, "range", base, head]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, new RegExp(`${trailer}: unauthorized co-author field`));
  assert.match(result.stderr, new RegExp(`${author}: author email is outside the allowlist`));
  assert.doesNotMatch(result.stderr, new RegExp(`${base}|${head}`));
});

test("range checks a forged merge message even when both parent histories pass", (t) => {
  const { cwd, git, run, base } = fixture(t);
  installHook({ cwd, git });
  git("switch", "-c", "side");
  git("commit", "--allow-empty", "-m", "Clean side");
  git("switch", "main");
  git("merge", "--no-ff", "--no-verify", "-m", `Merge side\n\nCo-Authored-By: Invented <${badEmail}>`, "side");
  const head = git("rev-parse", "HEAD");
  const result = run(process.execPath, [guard, "range", base, head]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, new RegExp(`${head}: unauthorized co-author field`));
});

test("range accepts the canonical GitHub author and web committer and ignores prior history", (t) => {
  const { git, run, base } = fixture(t);
  const commit = run("git", ["commit", "--allow-empty", "-m", "Clean", "--author",
    "Fixture <237937212+orangeofcarl0-sys@users.noreply.github.com>"], { GIT_COMMITTER_EMAIL: "noreply@github.com" });
  assert.equal(commit.status, 0, commit.stderr);
  const result = run(process.execPath, [guard, "range", base, git("rev-parse", "HEAD")]);
  assert.equal(result.status, 0, result.stderr);
});

test("range fails closed for abbreviated SHAs and a shallow checkout", (t) => {
  const { cwd, git, run, base } = fixture(t);
  git("commit", "--allow-empty", "-m", "Clean");
  const head = git("rev-parse", "HEAD");
  const short = run(process.execPath, [guard, "range", base.slice(0, 7), head]);
  assert.equal(short.status, 1, short.stderr);
  assert.match(short.stderr, /exact commit SHAs/);

  git("clone", "--depth=2", pathToFileURL(cwd).href, "shallow");
  const shallow = run(process.execPath, [guard, "range", base, head], { GIT_DIR: join(cwd, "shallow", ".git") });
  assert.equal(shallow.status, 1, shallow.stderr);
  assert.match(shallow.stderr, /Full history is required/);
});
