// palimpsest-dsh-host/cmdline — argv hygiene for a CO-MOUNTED profile.
//
// Deliberately imports nothing: this is pure token handling, and an app plugin that pulls in the
// whole host bundle just to test its argv filter would be untestable from the source tree.

/**
 * Flags owned by the DSH web app, which a profile can mount ALONGSIDE this bundle.
 *
 * `parseCmdline` hands every mounted app plugin the same argv, and commander puts anything it does
 * not recognise into `program.args` — which is exactly where this app builds its message from. Both
 * halves were measured on a co-mounted profile:
 *
 *   - strict parsing rejected the composition outright: `--port 7910` failed with
 *     `error: unknown option '--port'`, so `dsh --profile <web + palimpsest>` could not be started
 *     with any web-app flag at all;
 *   - simply allowing unknown options was worse: the tokens landed in `program.args`, so the
 *     principal's task text would have become `--port 7910 --no-open 并行探索两种方案`.
 *
 * So these flags are neither interpreted nor kept: they are dropped, with their values.
 */
export const CO_MOUNTED_VALUE_FLAGS = Object.freeze(['--port', '--host', '--trusted-host']);
export const CO_MOUNTED_BARE_FLAGS = Object.freeze(['--no-open']);

/**
 * Drop the co-mounted app's flags and their values from an argv slice.
 *
 * Anything else is returned untouched, including free text that happens to contain `--`: a user may
 * legitimately write "run the tests --verbose", and that is their message, not a flag.
 */
export function withoutCoMountedFlags(argv) {
  const out = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (CO_MOUNTED_BARE_FLAGS.includes(token)) continue;
    const valueFlag = CO_MOUNTED_VALUE_FLAGS.find((flag) => token === flag || token.startsWith(`${flag}=`));
    if (valueFlag !== undefined) {
      // `--port 7910` carries its value as the next token; `--port=7910` carries it inline.
      if (token === valueFlag) index += 1;
      continue;
    }
    out.push(token);
  }
  return out;
}
