// palimpsest-dsh-host/startup — parse the principal's launch arguments.
//
// Mirrors @deepseek-ai/dsh-headless/startup: an ordinary provider plugin injects
// `cmdlineArgs`, parses this app's command, and publishes the resolved startup
// data as a Cordis service consumed by the runner.
//
//   dsh --profile palimpsest-p "first task text"
//   dsh --profile palimpsest-p --resume <sessionId> "attention text"
//
// `--resume` cold-resumes a persisted principal session; absent, a fresh session
// is created. `--session-file` records the created session id so a later
// activation can cold-resume the SAME principal (host session ≠ PeerRef).

import { Command } from 'commander';
import { parseCmdline } from '@deepseek-ai/dsh-cmdline';

export const name = 'palimpsest-startup';
export const inject = ['cmdlineArgs'];
export const PALIMPSEST_STARTUP_SERVICE = 'palimpsestStartup';

function palimpsestCommand() {
  return new Command()
    .name('dsh --profile <palimpsest-profile>')
    .description('Run one persistent Palimpsest project principal turn, or cold-resume it, over the real DSH agent runtime.')
    .helpOption('-h, --help', 'show this help')
    .argument('[message...]', 'the task or attention message; multiple words are joined by spaces')
    .option('--resume <sessionId>', 'cold-resume a persisted principal session instead of creating one')
    .option('--session-file <path>', 'persist this principal session id to the given file')
    .option('--once', 'deliver the launch message, print the turn, and exit (smoke / one-shot turn)')
    .option('--idle-ms <ms>', 'attention loop poll interval in milliseconds', '1500')
    .option('--max-turns <n>', 'advisory turn budget for this activation', '6');
}

function apply(ctx) {
  const program = palimpsestCommand();
  program.action(() => {
    const message = program.args.join(' ');
    const options = program.opts();
    const resume = typeof options.resume === 'string' && options.resume.length > 0 ? options.resume : undefined;
    ctx.provide(PALIMPSEST_STARTUP_SERVICE, {
      mode: resume === undefined ? 'create' : 'resume',
      ...(resume === undefined ? {} : { sessionId: resume }),
      ...(typeof options.sessionFile === 'string' && options.sessionFile.length > 0
        ? { sessionIdFile: options.sessionFile }
        : {}),
      message,
      once: options.once === true,
      idleMs: Number(options.idleMs),
      maxTurns: Number(options.maxTurns),
    });
  });
  parseCmdline(ctx, program);
}

export { apply };
