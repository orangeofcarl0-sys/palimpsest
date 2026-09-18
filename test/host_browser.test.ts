/**
 * palimpsest-dsh-host: when the dashboard may be opened in the person's browser.
 *
 * The host bundle is JavaScript outside the TypeScript program, so this imports the built path
 * through a URL (the same technique `host_cmdline.test.ts` uses). The module under test imports only
 * `node:child_process`, so it is loadable from the source tree.
 *
 * Why the rule exists at all, measured in two live `--resume` sessions: asked "这些我在浏览器里能看吗？
 * 给我地址", the agent reports the clean url from `palimpsest_surfaces`, cannot obtain the token (it is
 * printed to this process's stdout, which in an agent-hosted deployment nobody reads), and correctly
 * refuses to guess it. So the deployment that knows the url has to open it — which is what DSH's own
 * `dsh web` does by default. The TTY guard is the other half: a scripted run or a server hosting the
 * agent must not pop a window, and for those nobody is looking at the machine's screen anyway.
 */

import { describe, expect, it } from "vitest";

import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(fileURLToPath(new URL("..", import.meta.url)));
const modulePath = pathToFileURL(join(REPO, "host", "dsh", "lib", "browser.js")).href;
const { openInDefaultBrowser, shouldOpenDashboard } = (await import(modulePath)) as {
  readonly openInDefaultBrowser: (url: string) => boolean;
  readonly shouldOpenDashboard: (configured: boolean, isTerminal: boolean) => boolean;
};

describe("host dashboard handoff (HOST-BROWSER-01)", () => {
  it("opens only when the profile allows it AND a person is watching a terminal", () => {
    expect(shouldOpenDashboard(true, true)).toBe(true);
    // A script capturing this process's output, or a server hosting the agent: no terminal.
    expect(shouldOpenDashboard(true, false)).toBe(false);
    // The profile's own switch always wins.
    expect(shouldOpenDashboard(false, true)).toBe(false);
    expect(shouldOpenDashboard(false, false)).toBe(false);
  });

  it("the launcher never throws on an unusable url, so the host survives a missing opener", () => {
    // The caller has already printed the url, so a failure here degrades to the manual path.
    expect(typeof openInDefaultBrowser("http://127.0.0.1:1/?token=x")).toBe("boolean");
    expect(openInDefaultBrowser("")).toBe(true);
  });
});
