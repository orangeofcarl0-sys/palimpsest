/**
 * R3-L0B §14 — THE CHILD-RUN CONFIGURATION FOR THE MUTATOR REGRESSION.
 *
 * `test/r2lr_last_mile.test.ts` is executed in a child process to prove that an ordinary unit run cannot mutate
 * committed historical evidence. That child must NOT use the repository's own configuration, for one specific
 * reason:
 *
 * `test/global_setup.ts` performs a single temp-directory sweep per run, and its own documentation states the
 * assumption it depends on: "this repo runs one suite at a time … two suites running CONCURRENTLY would each
 * sweep the other's directories."
 *
 * A nested run using the repository config is exactly that concurrent second suite. It was observed deleting
 * live rigs out from under the parent — the full suite failed in a DIFFERENT untouched test file on each of
 * several attempts, each with a vanished temp path, and each passed in isolation.
 *
 * So this config omits the sweep and changes nothing else: the same include pattern, the same node environment,
 * the same timeouts. The file under test runs in full and for real.
 *
 * PLAIN JAVASCRIPT (`.mjs`) — this file is harness-only and is not part of the build.
 */
export default {
  test: {
    include: ['test/r2lr_last_mile.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    globalSetup: [],
  },
};
