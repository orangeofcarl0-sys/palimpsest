/**
 * Handing the dashboard's handoff url to a person's browser.
 *
 * The dashboard is authorized by a per-start token that is exchanged for a cookie at the root url.
 * Printing that url is enough for someone reading this terminal, and it is the ONLY thing that works
 * for someone who is not: measured in two live sessions, an agent asked "where do I watch?" can
 * report the clean url but cannot obtain the token (it is on this process's stdout, which in an
 * agent-hosted deployment nobody reads), and it correctly refuses to guess. So the deployment that
 * knows the url opens it, which is what DSH's own `dsh web` does by default.
 *
 * The guard matters as much as the opener: a script capturing this process's output, or a server
 * hosting the agent, has no terminal — popping a browser window from those is wrong, and it is also
 * pointless, because nobody is looking at the machine's screen for it. A TTY is the signal that a
 * person is watching this run.
 */

import { spawn } from 'node:child_process';

/**
 * Whether to open the dashboard, given the profile's switch and whether a person is watching.
 * @param configured - the profile's `openDashboard` value.
 * @param isTerminal - `process.stdout.isTTY`, passed in so the rule is testable.
 * @returns true only when the profile allows it AND this process has a terminal.
 */
export function shouldOpenDashboard(configured, isTerminal) {
  return configured === true && isTerminal === true;
}

/**
 * Hand one url to the operating system's default browser, without waiting for it and without
 * inheriting this process's environment.
 * @param url - the handoff url, which carries this start's token.
 * @returns true when a launcher was started; false when none could be (the caller has already
 * printed the url, so a missing opener degrades to the manual path rather than failing the host).
 */
export function openInDefaultBrowser(url) {
  const platform = process.platform;
  const command = platform === 'win32' ? 'cmd' : platform === 'darwin' ? 'open' : 'xdg-open';
  // `start` reads a leading quoted argument as the window title, so the empty title is required.
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  /* A minimal environment on purpose: the opener belongs to the browser, not to this Harness, and
     must not carry this process's credentials into whatever ends up handling the url. */
  const env =
    platform === 'win32'
      ? { SystemRoot: process.env.SystemRoot ?? '', PATH: process.env.PATH ?? '', comspec: process.env.comspec ?? 'cmd.exe' }
      : { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...(process.env.DISPLAY === undefined ? {} : { DISPLAY: process.env.DISPLAY }) };
  try {
    const launcher = spawn(command, args, { env, detached: true, stdio: 'ignore' });
    launcher.on('error', () => undefined);
    launcher.unref();
    return true;
  } catch {
    return false;
  }
}
