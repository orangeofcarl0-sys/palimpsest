/**
 * PSVR-A — build the deterministic Messages stand-in script for the migration scenario.
 *
 * The pure-content turns (file bodies) are read from `fixtures/psvr/grpc-migration/expected/`, which
 * is the SCRIPTED ACTOR's output — a labelled deterministic stand-in, not model reasoning. Every file
 * still reaches the world through the worker's own `tools.write` call, is tested by the worker's own
 * `node --test`, and is committed by the worker's own `git commit`; the fixture never writes into the
 * attempt world.
 *
 * Usage: node scripts/psvr/build_mock_a.mjs --out=<run>/mock-scripts.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(HERE, "../../fixtures/psvr/grpc-migration");

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const OUT = resolve(String(args.get("out") ?? join(process.cwd(), "mock-scripts.json")));
const INPUT_HANDLE = "@ctx/input/updates/2026-11-03/compat-streaming.md";
const INPUT_DIGEST = "__INPUT_DIGEST__";

const text = (rel) => readFileSync(join(SEED, "expected", rel), "utf8");
const shell = 'const shell = typeof tools.pwsh === "function" ? tools.pwsh : tools.bash;';

/** One worker turn that writes a set of files through the worker's own write tool. */
function writeTurn(files, description) {
  const code = [
    `const files = ${JSON.stringify(files, null, 2)};`,
    // Built dynamically so the guard itself is not a placeholder the mock substitution can consume.
    'const unsubstituted = ["__INPUT_", "DIGEST__"].join("");',
    "for (const [path, content] of Object.entries(files)) {",
    "  if (String(content).includes(unsubstituted)) throw new Error(`an unsubstituted placeholder reached ${path}`);",
    // The sandbox refuses to overwrite a file the session has not read; an existing file is read
    // first, a new one simply fails the read and is created.
    "  try { await tools.read({ file_path: path }); } catch { /* a new file has nothing to read */ }",
    "  await tools.write({ file_path: path, content });",
    "}",
    'return "written";',
  ].join("\n");
  return { tool_calls: [{ id: `w-${description.replace(/\W+/gu, "-").slice(0, 20)}`, name: "run_code", input: { description, code } }] };
}

/** One worker turn that runs the suite and FAILS the turn when the suite is not green. */
function testTurn() {
  /**
   * Each test file runs in ITS OWN node process, not through `node --test`: the worker sandbox
   * refuses the nested spawn the test runner uses (`EPERM: spawn`), while pwsh spawning node is
   * allowed. The command still exits non-zero on the first failing file.
   */
  const command =
    "$failed=@(); Get-ChildItem -Path test -Filter *.test.js | ForEach-Object { node $_.FullName; if ($LASTEXITCODE -ne 0) { $failed += $_.Name } }; if ($failed.Count -gt 0) { throw ('suite failed: ' + ($failed -join ',')) } else { 'suite green' }";
  const code = [
    shell,
    `const result = await shell({ command: ${JSON.stringify(command)}, description: "run the suite" });`,
    'const output = typeof result === "string" ? result : JSON.stringify(result);',
    'if (/suite failed/u.test(output)) throw new Error("the suite is not green:\\n" + output.slice(-2000));',
    "return output.slice(-600);",
  ].join("\n");
  return { tool_calls: [{ id: "w-tests", name: "run_code", input: { description: "run the suite file by file", code } }] };
}

function commitTurn(subject) {
  const command = `git add -A; git -c user.email=worker@psvr.test -c user.name=worker commit -qm '${subject}'`;
  const code = [
    shell,
    `await shell({ command: ${JSON.stringify(command)}, description: "commit the work" });`,
    // A commit that changed nothing exits non-zero; verify the subject actually landed rather than
    // reporting a commit that does not exist.
    'const head = await shell({ command: "git log -1 --format=%s", description: "read the commit subject" });',
    `if (!JSON.stringify(head).includes(${JSON.stringify(subject)})) throw new Error("the commit did not land: " + JSON.stringify(head).slice(0, 300));`,
    `return ${JSON.stringify(`committed: ${subject}`)};`,
  ].join("\n");
  return { tool_calls: [{ id: `w-commit-${subject.replace(/\W+/gu, "-").slice(0, 16)}`, name: "run_code", input: { description: `commit ${subject}`, code } }] };
}

function parkTurn(seconds) {
  const code = [
    "const deadline = Date.now() + " + String(seconds) + "000;",
    'while (Date.now() < deadline) { await new Promise((resolve) => setTimeout(resolve, 1000)); }',
    'return "parked";',
  ].join("\n");
  return { tool_calls: [{ id: `w-park-${String(seconds)}`, name: "run_code", input: { description: "park after the commit", code } }] };
}

function waitForCommit(subject, seconds, tag = "a") {
  return {
    tool_calls: [
      {
        id: `p-wait-${tag}-${subject.replace(/\W+/gu, "-").slice(0, 8)}`,
        name: "pwsh",
        input: {
          description: `wait for the worker commit: ${subject}`,
          command: [
            `$deadline=(Get-Date).AddSeconds(${String(seconds)}); $found=$false`,
            'while (-not $found -and (Get-Date) -lt $deadline) {',
            '  foreach ($w in Get-ChildItem -Directory .palimpsest/worlds -ErrorAction SilentlyContinue) {',
            `    if ((git -C $w.FullName log -1 --format=%s 2>$null) -match ${JSON.stringify(subject)}) { $found=$true; break }`,
            "  }",
            "  if (-not $found) { Start-Sleep -Milliseconds 500 }",
            "}",
            'if (-not $found) { throw "timed out waiting for: ' + subject + '" }',
            '"commit observed"',
          ].join("\n"),
        },
      },
    ],
  };
}

/** A short pause so the worker's process exit and the transport's job settlement are observable. */
function settlePause(seconds) {
  return {
    tool_calls: [
      {
        id: `p-pause-${String(seconds)}`,
        name: "pwsh",
        input: { description: "let the worker's exit become observable", command: `Start-Sleep -Seconds ${String(seconds)}; "settled"` },
      },
    ],
  };
}

const principal = (name, turns) => ({ match: `PSVR_PRINCIPAL_${name}`, turns });
const worker = (match, turns) => ({ match, turns });

/**
 * Two settle attempts with a fresh readiness each time. The first is the normal path; the second is
 * idempotent (ALREADY_SETTLED) when the first settled, and catches the case where the worker's exit
 * was not yet observable on the first pair — the mock cannot branch, so the script must converge.
 */
function settleTurns(taskId, summary, acknowledgeInputs = false) {
  const finalize = (id) => ({
    tool_calls: [
      {
        id,
        name: "palimpsest_work",
        input: {
          action: "finalize",
          taskId,
          expectedObservationDigest: "__OBSERVATION_DIGEST__",
          ...(acknowledgeInputs ? { acknowledgeInputs: true } : {}),
          summary,
        },
      },
    ],
  });
  const readiness = (id) => ({ tool_calls: [{ id, name: "palimpsest_work", input: { action: "readiness", taskId } }] });
  return [readiness(`p-${taskId}-readiness-1`), finalize(`p-${taskId}-finalize-1`), readiness(`p-${taskId}-readiness-2`), finalize(`p-${taskId}-finalize-2`)];
}

// ── principals ───────────────────────────────────────────────────────────────────────────────────

const p1 = principal("P1", [
  { tool_calls: [{ id: "p1-pulse", name: "palimpsest_continuity", input: { action: "pulse" } }] },
  { tool_calls: [{ id: "p1-delegate", name: "palimpsest_work", input: { action: "delegate", taskId: "contract" } }] },
  waitForCommit("contract: proto and wire codec", 100, "1"),
  waitForCommit("contract: proto and wire codec", 100, "2"),
  settlePause(6),
  ...settleTurns("contract", "the contract task left a committed proto, codec and codec tests; the suite is green"),
  { text: "PSVR_P1_DONE" },
]);

const p2 = principal("P2", [
  { tool_calls: [{ id: "p2-pulse", name: "palimpsest_continuity", input: { action: "pulse" } }] },
  { tool_calls: [{ id: "p2-delegate", name: "palimpsest_work", input: { action: "delegate", taskId: "server" } }] },
  waitForCommit("server: unary batch GetReadings", 100, "1"),
  waitForCommit("server: unary batch GetReadings", 100, "2"),
  ...Array.from({ length: 3 }, (_, index) => ({
    tool_calls: [
      {
        id: `p2-park-${String(index)}`,
        name: "pwsh",
        input: {
          description: `keep the host alive (${String(index + 1)}/3)`,
          command:
            '$deadline=(Get-Date).AddSeconds(100); while (-not (Test-Path .palimpsest/release-host-p2) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }; "still here"',
        },
      },
    ],
  })),
  { text: "PSVR_P2_DONE" },
]);

const p3 = principal("CLOSE", [
  { tool_calls: [{ id: "p3-pulse", name: "palimpsest_continuity", input: { action: "pulse" } }] },
  { tool_calls: [{ id: "p3-workers", name: "palimpsest_work", input: { action: "workers" } }] },
  {
    tool_calls: [
      {
        id: "p3-relay",
        name: "palimpsest_work",
        input: {
          action: "relay",
          taskId: "server",
          relayRoute: "successor",
          acknowledgeInputs: true,
          summary: "the killed worker's attempt is closed; the retained world is kept and the next attempt starts on the current basis",
        },
      },
    ],
  },
  { text: "PSVR_CLOSE_DONE" },
]);

/** The session that starts and settles the successor attempt (after the closure is canonical). */
const p3b = principal("CONTINUE", [
  { tool_calls: [{ id: "p3b-pulse", name: "palimpsest_continuity", input: { action: "pulse" } }] },
  { tool_calls: [{ id: "p3b-delegate", name: "palimpsest_work", input: { action: "delegate", taskId: "server" } }] },
  waitForCommit("server: server-streaming readings", 100, "1"),
  waitForCommit("server: server-streaming readings", 100, "2"),
  settlePause(6),
  ...settleTurns("server", "the new attempt applied the fleet compatibility note through the context pull and the suite is green", true),
  { text: "PSVR_CONTINUE_DONE" },
]);

const p4 = principal("P4", [
  { tool_calls: [{ id: "p4-pulse", name: "palimpsest_continuity", input: { action: "pulse" } }] },
  { tool_calls: [{ id: "p4-delegate", name: "palimpsest_work", input: { action: "delegate", taskId: "client" } }] },
  waitForCommit("client: integration test and migration notes", 100, "1"),
  waitForCommit("client: integration test and migration notes", 100, "2"),
  settlePause(6),
  ...settleTurns("client", "the client task left the client, the integration test and the migration notes; the suite is green", true),
  {
    tool_calls: [
      {
        id: "p4-conclude",
        name: "palimpsest_work",
        input: {
          action: "conclude",
          intent: "WAIT_FOR_OPERATOR",
          statement: "All three migration tasks are settled with green suites; the client result needs the operator's acceptance before delivery.",
          artifacts: ["service/grpc_client.js", "test/integration.test.js", "MIGRATION.md"],
          waitingOn: "operator acceptance of the client result",
        },
      },
    ],
  },
  { text: "PSVR_P4_DONE" },
]);

const p5 = principal("P5", [
  { tool_calls: [{ id: "p5-pulse", name: "palimpsest_continuity", input: { action: "pulse" } }] },
  {
    tool_calls: [
      {
        id: "p5-conclude",
        name: "palimpsest_work",
        input: {
          action: "conclude",
          intent: "DELIVER",
          statement:
            "The REST to gRPC migration is accepted: proto, server, client and integration test are canonical, and the suite runs on the accepted head.",
          artifacts: [
            "proto/energy.proto",
            "service/grpc_server.js",
            "service/grpc_client.js",
            "test/integration.test.js",
            "MIGRATION.md",
          ],
        },
      },
    ],
  },
  { text: "PSVR_P5_DONE" },
]);

// ── workers ──────────────────────────────────────────────────────────────────────────────────────

/** The successor worker: the compatibility note arrives through the product's context pull. */
const serverSuccessor = worker(INPUT_HANDLE, [
  {
    tool_calls: [
      {
        id: "w2b-pull",
        name: "run_code",
        input: {
          description: "pull the fleet compatibility note through the attempt's context handle",
          code: [
            `const pulled = await tools.palimpsest_worker_context_pull({ handle: ${JSON.stringify(INPUT_HANDLE)} });`,
            'const body = typeof pulled === "string" ? pulled : String(pulled?.value?.body?.text ?? pulled?.body?.text ?? pulled?.text ?? JSON.stringify(pulled));',
            'if (!body.includes("returns (stream Reading)")) throw new Error("the compatibility note was not delivered through the context pull: " + body.slice(0, 400));',
            "return body.slice(0, 600);",
          ].join("\n"),
        },
      },
    ],
  },
  writeTurn(
    {
      "proto/energy.proto": text("server/final/proto/energy.proto"),
      "service/wire.js": text("server/final/service/wire.js"),
      "test/wire.test.js": text("server/final/test/wire.test.js"),
      "service/grpc_server.js": text("server/final/service/grpc_server.js").replace(
        "const SERVICE =",
        `// Compatibility basis: updates/2026-11-03/compat-streaming.md (sha256 ${INPUT_DIGEST})\nconst SERVICE =`,
      ),
      "test/server.test.js": text("server/final/test/server.test.js"),
    },
    "rewrite the contract, codec, server and server tests for server-streaming",
  ),
  testTurn(),
  commitTurn("server: server-streaming readings"),
  { text: "WORKER_EXITED_WITHOUT_REPORT" },
]);

const contractWorker = worker("Declare the gRPC contract and the wire codec", [
  writeTurn(
    {
      "proto/energy.proto": text("contract/proto/energy.proto"),
      "service/wire.js": text("contract/service/wire.js"),
      "test/wire.test.js": text("contract/test/wire.test.js"),
    },
    "write the proto contract, the wire codec and its tests",
  ),
  testTurn(),
  commitTurn("contract: proto and wire codec"),
  { text: "WORKER_EXITED_WITHOUT_REPORT" },
]);

const serverPartialWorker = worker("Implement the gRPC server for the site readings service", [
  writeTurn(
    {
      "service/grpc_server.js": text("server/partial/service/grpc_server.js"),
      "test/server.test.js": text("server/partial/test/server.test.js"),
    },
    "write the unary batch server and its tests",
  ),
  testTurn(),
  commitTurn("server: unary batch GetReadings"),
  parkTurn(60),
  parkTurn(60),
  { text: "WORKER_PARKED" },
]);

const clientWorker = worker("Deliver the gRPC client, the integration test and the migration notes", [
  writeTurn(
    {
      "service/grpc_client.js": text("client/service/grpc_client.js"),
      "test/integration.test.js": text("client/test/integration.test.js"),
      "MIGRATION.md": text("client/MIGRATION.md"),
    },
    "write the client, the integration test and the migration notes",
  ),
  testTurn(),
  commitTurn("client: integration test and migration notes"),
  { text: "WORKER_EXITED_WITHOUT_REPORT" },
]);

const scripts = {
  schema: "psvr-mock-scripts/v1",
  note: "Deterministic Messages stand-in. File bodies are the scripted actor's output; every write, test run and commit happens through the real worker session.",
  scripts: [p1, p2, p3, p3b, p4, p5, serverSuccessor, contractWorker, serverPartialWorker, clientWorker],
};

writeFileSync(OUT, `${JSON.stringify(scripts, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ out: OUT, scripts: scripts.scripts.map((entry) => entry.match) })}\n`);
