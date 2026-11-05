/**
 * PSVR-B — build the deterministic Messages stand-in script for the deployment-package scenario.
 *
 * Same rules as PSVR-A: the file bodies come from `fixtures/psvr/energy-deployment/expected/` (the
 * scripted actor's output), and every file reaches the world through the worker's own `tools.write`,
 * is checked by the worker's own `node check.mjs`, and is committed by the worker's own `git commit`.
 *
 * The commercial worker writes the survey file from the PULLED bytes — the committed basis copy is
 * literally what the product's context pull delivered, not a file the harness placed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(HERE, "../../fixtures/psvr/energy-deployment");

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const OUT = resolve(String(args.get("out") ?? join(process.cwd(), "mock-scripts.json")));
const INPUT_HANDLE = "@ctx/input/updates/2026-11-04/corridor-survey.md";

const text = (rel) => readFileSync(join(SEED, "expected", rel), "utf8");
const shell = 'const shell = typeof tools.pwsh === "function" ? tools.pwsh : tools.bash;';

function writeTurn(files, description) {
  const code = [
    `const files = ${JSON.stringify(files, null, 2)};`,
    "for (const [path, content] of Object.entries(files)) {",
    "  try { await tools.read({ file_path: path }); } catch { /* a new file has nothing to read */ }",
    "  await tools.write({ file_path: path, content });",
    "}",
    'return "written";',
  ].join("\n");
  return { tool_calls: [{ id: `w-${description.replace(/\W+/gu, "-").slice(0, 18)}`, name: "run_code", input: { description, code } }] };
}

/** Pull the survey and write it, plus the revised commercial artifacts, from the pulled bytes. */
function pullAndWriteTurn(files, description) {
  const code = [
    `const pulled = await tools.palimpsest_worker_context_pull({ handle: ${JSON.stringify(INPUT_HANDLE)} });`,
    'const body = typeof pulled === "string" ? pulled : String(pulled?.value?.body?.text ?? pulled?.body?.text ?? pulled?.text ?? JSON.stringify(pulled));',
    'if (!/measured corridor width:\\s*1050/iu.test(body)) throw new Error("the measured corridor did not arrive through the context pull: " + body.slice(0, 400));',
    `const files = ${JSON.stringify(files, null, 2)};`,
    "for (const [path, content] of Object.entries(files)) {",
    "  try { await tools.read({ file_path: path }); } catch { /* a new file has nothing to read */ }",
    "  await tools.write({ file_path: path, content });",
    "}",
    'await tools.write({ file_path: "updates/2026-11-04/corridor-survey.md", content: body });',
    'return "written from the pulled survey";',
  ].join("\n");
  return { tool_calls: [{ id: "w-pull-and-write", name: "run_code", input: { description, code } }] };
}

function checkTurn() {
  const code = [
    shell,
    'const result = await shell({ command: "node check.mjs", description: "run the consistency check" });',
    'const output = typeof result === "string" ? result : JSON.stringify(result);',
    'if (/check: FAIL/u.test(output)) throw new Error("the package is inconsistent:\\n" + output.slice(-2000));',
    "return output.slice(-600);",
  ].join("\n");
  return { tool_calls: [{ id: "w-check", name: "run_code", input: { description: "run the consistency check", code } }] };
}

function commitTurn(subject) {
  const command = `git add -A; git -c user.email=worker@psvr.test -c user.name=worker commit -qm '${subject}'`;
  const code = [
    shell,
    `await shell({ command: ${JSON.stringify(command)}, description: "commit the work" });`,
    'const head = await shell({ command: "git log -1 --format=%s", description: "read the commit subject" });',
    `if (!JSON.stringify(head).includes(${JSON.stringify(subject)})) throw new Error("the commit did not land: " + JSON.stringify(head).slice(0, 300));`,
    `return ${JSON.stringify(`committed: ${subject}`)};`,
  ].join("\n");
  return { tool_calls: [{ id: `w-commit-${subject.replace(/\W+/gu, "-").slice(0, 14)}`, name: "run_code", input: { description: `commit ${subject}`, code } }] };
}

function waitForCommit(subject, seconds, tag) {
  return {
    tool_calls: [
      {
        id: `p-wait-${tag}-${subject.replace(/\W+/gu, "-").slice(0, 8)}`,
        name: "pwsh",
        input: {
          description: `wait for the worker commit: ${subject}`,
          command: [
            `$deadline=(Get-Date).AddSeconds(${String(seconds)}); $found=$false`,
            "while (-not $found -and (Get-Date) -lt $deadline) {",
            "  foreach ($w in Get-ChildItem -Directory .palimpsest/worlds -ErrorAction SilentlyContinue) {",
            `    if ((git -C $w.FullName log -1 --format=%s 2>$null) -match ${JSON.stringify(subject)}) { $found=$true; break }`,
            "  }",
            "  if (-not $found) { Start-Sleep -Milliseconds 500 }",
            "}",
            `if (-not $found) { throw "timed out waiting for: ${subject}" }`,
            '"commit observed"',
          ].join("\n"),
        },
      },
    ],
  };
}

const pause = (seconds) => ({
  tool_calls: [{ id: `p-pause-${String(seconds)}`, name: "pwsh", input: { description: "let the worker's exit become observable", command: `Start-Sleep -Seconds ${String(seconds)}; "settled"` } }],
});

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

const principal = (name, turns) => ({ match: `PSVR_B_PRINCIPAL_${name}`, turns });
const worker = (match, turns) => ({ match, turns });

const p1 = principal("P1", [
  { tool_calls: [{ id: "p1-pulse", name: "palimpsest_continuity", input: { action: "pulse" } }] },
  { tool_calls: [{ id: "p1-delegate", name: "palimpsest_work", input: { action: "delegate", taskId: "technical" } }] },
  waitForCommit("technical: constraints and compliance", 100, "1"),
  waitForCommit("technical: constraints and compliance", 100, "2"),
  pause(6),
  ...settleTurns("technical", "the technical assessment and the certificate standing are committed and the checker passes"),
  { text: "PSVR_B_P1_DONE" },
]);

const p2 = principal("P2", [
  { tool_calls: [{ id: "p2-pulse", name: "palimpsest_continuity", input: { action: "pulse" } }] },
  { tool_calls: [{ id: "p2-delegate", name: "palimpsest_work", input: { action: "delegate", taskId: "commercial" } }] },
  waitForCommit("commercial: cost and schedule on the measured corridor", 100, "1"),
  waitForCommit("commercial: cost and schedule on the measured corridor", 100, "2"),
  pause(6),
  ...settleTurns("commercial", "the measured corridor superseded the drawing; the cost model and schedule were rebuilt on the measured selection", true),
  { text: "PSVR_B_P2_DONE" },
]);

const p3 = principal("P3", [
  { tool_calls: [{ id: "p3-pulse", name: "palimpsest_continuity", input: { action: "pulse" } }] },
  { tool_calls: [{ id: "p3-delegate", name: "palimpsest_work", input: { action: "delegate", taskId: "recommendation" } }] },
  waitForCommit("recommendation: integrated decision", 100, "1"),
  waitForCommit("recommendation: integrated decision", 100, "2"),
  pause(6),
  ...settleTurns("recommendation", "the risk review and the integrated recommendation are committed over the current package"),
  {
    tool_calls: [
      {
        id: "p3-conclude",
        name: "palimpsest_work",
        input: {
          action: "conclude",
          intent: "WAIT_FOR_OPERATOR",
          statement: "All three package tasks are settled and the checker passes; the recommendation needs the operator's acceptance before delivery.",
          artifacts: ["deliverables/risk-review.md", "deliverables/recommendation.md"],
          waitingOn: "operator acceptance of the recommendation",
        },
      },
    ],
  },
  { text: "PSVR_B_P3_DONE" },
]);

const p4 = principal("P4", [
  { tool_calls: [{ id: "p4-pulse", name: "palimpsest_continuity", input: { action: "pulse" } }] },
  {
    tool_calls: [
      {
        id: "p4-conclude",
        name: "palimpsest_work",
        input: {
          action: "conclude",
          intent: "DELIVER",
          statement:
            "The deployment package is accepted: technical, compliance, cost, schedule, risk and the integrated recommendation are canonical and consistent with the measured corridor.",
          artifacts: [
            "deliverables/technical-capacity.md",
            "deliverables/vendor-compliance.md",
            "deliverables/cost-model.json",
            "deliverables/schedule.md",
            "deliverables/risk-review.md",
            "deliverables/recommendation.md",
          ],
        },
      },
    ],
  },
  { text: "PSVR_B_P4_DONE" },
]);

const technicalWorker = worker("Assess the site constraints, select the units", [
  writeTurn(
    {
      "deliverables/technical-capacity.md": text("technical/deliverables/technical-capacity.md"),
      "deliverables/vendor-compliance.md": text("technical/deliverables/vendor-compliance.md"),
    },
    "write the technical assessment and the compliance record",
  ),
  checkTurn(),
  commitTurn("technical: constraints and compliance"),
  { text: "WORKER_EXITED_WITHOUT_REPORT" },
]);

const commercialWorker = worker(INPUT_HANDLE, [
  pullAndWriteTurn(
    {
      "deliverables/technical-capacity.md": text("commercial/deliverables/technical-capacity.md"),
      "deliverables/cost-model.json": text("commercial/deliverables/cost-model.json"),
      "deliverables/schedule.md": text("commercial/deliverables/schedule.md"),
    },
    "revise the selection from the pulled survey and rebuild the cost and schedule",
  ),
  checkTurn(),
  commitTurn("commercial: cost and schedule on the measured corridor"),
  { text: "WORKER_EXITED_WITHOUT_REPORT" },
]);

const recommendationWorker = worker("Review the risks and record the integrated recommendation", [
  writeTurn(
    {
      "deliverables/risk-review.md": text("recommendation/deliverables/risk-review.md"),
      "deliverables/recommendation.md": text("recommendation/deliverables/recommendation.md"),
    },
    "write the risk review and the integrated recommendation",
  ),
  checkTurn(),
  commitTurn("recommendation: integrated decision"),
  { text: "WORKER_EXITED_WITHOUT_REPORT" },
]);

const scripts = {
  schema: "psvr-mock-scripts/v1",
  note: "Deterministic Messages stand-in for PSVR-B. File bodies are the scripted actor's output; every write, check run and commit happens through the real worker session. The survey copy is written from the context-pull bytes.",
  scripts: [p1, p2, p3, p4, commercialWorker, technicalWorker, recommendationWorker],
};

writeFileSync(OUT, `${JSON.stringify(scripts, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ out: OUT, scripts: scripts.scripts.map((entry) => entry.match) })}\n`);
