/**
 * palimpsest-dsh-host argv hygiene — a co-mounted profile must not be rejected, and must not absorb
 * the other app's flags into the principal's task text.
 *
 * The host bundle is JavaScript outside the TypeScript program, so this imports the built path
 * through a URL (the same technique the parity tests use for built artefacts) rather than a static
 * specifier. The module under test deliberately imports nothing, so it is loadable from the source
 * tree — which is why the logic was extracted from `startup.js`.
 *
 * Both behaviours pinned here were measured on a real `dsh --profile <web + palimpsest>` boot:
 * strict parsing failed with `error: unknown option '--port'`, and bare `allowUnknownOption` moved
 * `--port 7910 --no-open` into `program.args`, where the message is built from.
 */

import { describe, expect, it } from "vitest";

import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(fileURLToPath(new URL("..", import.meta.url)));
const modulePath = pathToFileURL(join(REPO, "host", "dsh", "lib", "cmdline.js")).href;
const { withoutCoMountedFlags } = (await import(modulePath)) as {
  readonly withoutCoMountedFlags: (argv: readonly string[]) => readonly string[];
};

describe("host argv: a co-mounted app's flags are dropped, not absorbed", () => {
  it("HOST-CMDLINE-01: the web app's flags and their values never reach the message", () => {
    expect(withoutCoMountedFlags(["--port", "7910", "--no-open", "并行探索两种方案"])).toEqual(["并行探索两种方案"]);
    expect(withoutCoMountedFlags(["--port=7910", "--host", "127.0.0.1", "task text"])).toEqual(["task text"]);
    expect(withoutCoMountedFlags(["--trusted-host", "localhost:1", "task"])).toEqual(["task"]);
  });

  it("HOST-CMDLINE-02: free text is untouched, including text that contains --", () => {
    // A user may legitimately type this. Only the co-mounted app's own flags are removed.
    expect(withoutCoMountedFlags(["run the tests --verbose"])).toEqual(["run the tests --verbose"]);
    expect(withoutCoMountedFlags(["--port", "1", "compare A -- B"])).toEqual(["compare A -- B"]);
    expect(withoutCoMountedFlags(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("HOST-CMDLINE-03: our own flags are left for commander, which consumes them properly", () => {
    // `--resume` is THIS app's flag and carries a real value; the filter must not eat it.
    expect(withoutCoMountedFlags(["--resume", "sess-1", "attention text"])).toEqual(["--resume", "sess-1", "attention text"]);
    expect(withoutCoMountedFlags(["--branch", "brief.json"])).toEqual(["--branch", "brief.json"]);
  });

  it("HOST-CMDLINE-04: a flags-only argv yields no message at all", () => {
    expect(withoutCoMountedFlags(["--no-open"])).toEqual([]);
    expect(withoutCoMountedFlags([])).toEqual([]);
  });
});
