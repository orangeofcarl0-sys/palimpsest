#!/usr/bin/env node
/**
 * palimpsest — the installable command-line face of the plugin.
 *
 * Drives the ProjectController directly (no host required), so a DSH skill
 * or a human can run a full durable-project session from the shell. Side
 * effects go through Ordarium Safe Actions; the orchestration ledger is a
 * real SQLite file under the default DSH state path unless --db is given.
 *
 * Commands (minimal, procedure-shaped):
 *   new   <projectId> "<goal>"            create a durable project + task-1
 *   plan  <changeClass>                   revise the task graph (metadata_only|behavior_change|contract_breaking)
 *   next                                  one scheduler decision
 *   preview                               read-only next-decision (plan-mode safe, writes nothing)
 *   run    [maxSteps]                     one turn: mechanical progress + phase
 *   claim <attemptId>                     claim + worktree
 *   gate  <attemptId> <predicate> <exit> [cmd...]
 *   report <attemptId> completed|failed "<summary>"
 *   promote <gateId> [expectedHead]       gate-passed promotion
 *   pump  [maxSteps]                      fully-automated command executor
 *   context <attemptId>                   compile the attempt's context manifest
 *   telemetry [--candidates JSON]         pooled telemetry view (+ optional
 *                                         model advice against a candidate set)
 *   architect <proposal.json> [--declare] validate a ProjectProposal (PLMP-ARCH);
 *             or --preset <id> [--params <json|@file>] [--goal ...] build it from
 *             the preset library (PLMP-ARCH-3); empty diagnostics only then declare
 *                                         with --declare, declare it via start/plan
 *   status                                project view
 *
 * Options:
 *   --db <path>   orchestration SQLite (default $DSH_HOME/palimpsest/… or ~/.dsh/…)
 *   --ops <path>  Ordarium ledger (default $DSH_HOME/ordarium/…)
 *   --repo <path> use the real git CLI port rooted there (default: embedded fake port)
 *   --gate <file> path to a JSON file of GateDefinition to register
 *   --skills <json> E2: JSON array of skill hints for task-1 (new/plan)
 */

import { readFileSync } from "node:fs";

import {
  GitCliPort,
  FakeGitPort,
  createPalimpsestEffects,
  parseGateDefinition,
} from "./advanced.js";
import { EventStore, dshDefaultStatePath } from "./state/index.js";
import { ProjectController } from "./tools/index.js";
import {
  parseProjectProposal,
  presetDraft,
  proposalTaskSpecs,
  validateProjectProposal,
  type ProjectProposal,
} from "./architecture/index.js";
import { serveOrchestration } from "./serve.js";
import { runTui } from "./tui.js";

import { defaultOrdariumPath } from "./effects/index.js";
import { TaskPolicy } from "./domain/index.js";

const THE_COMMIT = "c".repeat(40);

function parseArgs(argv: string[]): { options: Map<string, string>; positional: string[] } {
  const options = new Map<string, string>();
  const positional: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (token.startsWith("--")) {
      const value = argv[index + 1];
      if (value !== undefined && !value.startsWith("--")) {
        options.set(token, value);
        index += 1;
      } else {
        options.set(token, "true");
      }
    } else {
      positional.push(token);
    }
  }
  return { options, positional };
}

function arg(options: Map<string, string>, flag: string): string | undefined {
  return options.get(flag);
}

function taskSpec(goal: string, skills?: string[]) {
  const spec = {
    task_id: "task-1",
    objective: `Complete: ${goal}`,
    depends_on: [],
    write_paths: [],
    required_artifacts: [],
  };
  return {
    ...spec,
    ...(skills === undefined || skills.length === 0 ? {} : { suggested_skills: skills }),
  };
}

/** Parse the --skills JSON-array option (E2): absent means no hint. */
function skillHints(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const parsed: unknown = JSON.parse(value);
  if (
    !Array.isArray(parsed) ||
    !parsed.every((item) => typeof item === "string" && item.length > 0)
  ) {
    throw new Error("--skills must be a JSON array of non-empty strings");
  }
  return parsed as string[];
}

function policy() {
  return new TaskPolicy({
    policy_id: "trusted-default",
    read_paths: ["src"],
    allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
    network_policy: "deny",
    network_allowlist: [],
    timeout_s: 60,
    lease_s: 10,
    attempt_limit: 3,
    candidate_limit: 1,
  });
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const [command, a1, a2, ...rest] = parsed.positional;
  if (command === undefined) throw new Error("usage: palimpsest <new|plan|next|preview|run|claim|gate|report|promote|pump|context|telemetry|architect|serve|tui|status> …");

  const db = arg(parsed.options, "--db");
  const ops = arg(parsed.options, "--ops");
  const repo = arg(parsed.options, "--repo");
  const gateFile = arg(parsed.options, "--gate");
  const git = repo === undefined ? new FakeGitPort(THE_COMMIT) : new GitCliPort(repo, `${repo}/.palimpsest/worktrees`);

  const store = new EventStore(db ?? dshDefaultStatePath(), { clock: () => new Date().toISOString() });
  const effects = createPalimpsestEffects({ databasePath: ops ?? defaultOrdariumPath(), git });
  const controller = new ProjectController({
    store,
    effects,
    projectId: "project",
    policy: policy(),
    clock: () => new Date().toISOString(),
  });
  if (gateFile !== undefined) {
    for (const raw of JSON.parse(readFileSync(gateFile, "utf8"))) {
      controller.declareGate(parseGateDefinition(raw), "cli");
    }
  }

  try {
    switch (command) {
      case "new": {
        const goal = a1 ?? "default goal";
        // With a real repo the project base is the repo's actual HEAD - the
        // DEFAULT_HEAD_COMMIT constant only matches the embedded fake port.
        const headCommit =
          repo === undefined ? undefined : await effects.git.head();
        const event = controller.start({
          projectId: controller.projectId,
          goal,
          tasks: [taskSpec(goal, skillHints(arg(parsed.options, "--skills")))],
          ...(headCommit === undefined ? {} : { headCommit }),
        });
        console.log(JSON.stringify({ created: event.event_type, projectId: event.project_id }));
        break;
      }
      case "plan": {
        const changeClass = (a1 ?? "behavior_change") as
          | "metadata_only"
          | "backward_compatible"
          | "behavior_change"
          | "contract_breaking";
        const event = controller.plan({
          tasks: [
            taskSpec(
              controller.status().tasks[0]?.state === undefined ? "plan" : "plan-rev",
              skillHints(arg(parsed.options, "--skills")),
            ),
          ],
          changeClass,
          changedIds: ["task-1"],
        });
        console.log(JSON.stringify({ revised: event.event_type, revision: (event.payload.project_ir as { revision: number }).revision }));
        break;
      }
      case "next": {
        const event = controller.step();
        console.log(
          event === null
            ? "{}"
            : JSON.stringify({ eventType: event.event_type, entityId: event.entity_id }),
        );
        break;
      }
      case "preview": {
        console.log(JSON.stringify(controller.preview()));
        break;
      }
      case "run": {
        const maxSteps = Number(a1);
        const result = await controller.runTurn(
          Number.isNaN(maxSteps) ? {} : { maxSteps },
        );
        console.log(JSON.stringify(result));
        break;
      }
      case "claim": {
        const attemptId = a1 ?? (await controller.selectCandidate()).winner;
        if (attemptId === undefined) throw new Error("no attempt to claim");
        const { worktreePath } = await controller.claim(attemptId);
        // E2: surface the skill hints the claiming worker must load, straight
        // from the attempt's task envelope (the DSH worker reads these).
        const attemptRow = store.connection
          .prepare("SELECT task_id FROM attempts WHERE project_id=? AND attempt_id=?")
          .get("project", attemptId) as { task_id: string } | undefined;
        let skillHintsField: string[] = [];
        if (attemptRow !== undefined) {
          const envRow = store.connection
            .prepare("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?")
            .get("project", attemptRow.task_id) as { envelope_json: Uint8Array } | undefined;
          if (envRow !== undefined) {
            const envelope = JSON.parse(new TextDecoder().decode(envRow.envelope_json)) as {
              suggested_skills?: string[];
            };
            skillHintsField = envelope.suggested_skills ?? [];
          }
        }
        console.log(
          JSON.stringify({ claimed: attemptId, worktreePath, skillHints: skillHintsField }),
        );
        break;
      }
      case "gate": {
        const attemptId = a1 ?? "";
        const predicate = (a2 ?? "tests_pass") as
          | "process_exit_zero"
          | "tests_pass"
          | "tests_fail"
          | "lint_pass"
          | "expected_files_exist"
          | "write_scope_valid";
        const exitCode = Number(rest[0]);
        const command = rest.slice(1);
        const event = await controller.gate({
          attemptId,
          predicate,
          command: command.length > 0 ? command : ["python", "-m", "pytest"],
          exitCode: Number.isNaN(exitCode) ? 0 : exitCode,
        });
        console.log(JSON.stringify({ evidence: event.entity_id, status: (event.payload.evidence as { status: string }).status }));
        break;
      }
      case "report": {
        const attemptId = a1 ?? "";
        const workerStatus = (a2 ?? "completed") as "completed" | "failed" | "cancelled" | "expired";
        const event = controller.report(attemptId, {
          workerStatus,
          summary: rest[0] ?? "reported",
          // --commit: the real worktree commit (GitCliPort sessions); absent
          // falls back to the controller default for completed reports.
          resultCommit: arg(parsed.options, "--commit"),
        });
        console.log(JSON.stringify({ attempt: attemptId, eventType: event.event_type }));
        break;
      }
      case "promote": {
        const gateId = a1;
        const winner = controller.status().attempts.find((attempt) => attempt.state === "COMPLETED");
        if (winner === undefined) throw new Error("no completed candidate to promote");
        const report = JSON.parse(
          new TextDecoder().decode(
            (
              store.connection
                .prepare("SELECT report_json FROM attempts WHERE project_id=? AND attempt_id=?")
                .get("project", winner.attempt_id) as { report_json: Uint8Array }
            ).report_json,
          ),
        );
        // The expected head is the canonical branch's CURRENT head - with the
        // real GitCliPort this is the live repo head, not the fake constant.
        const expectedHead = await effects.git.head();
        const outcome = await controller.promoteWhenGatePasses(
          winner.attempt_id,
          report.result_commit ?? THE_COMMIT,
          expectedHead,
          gateId ?? "gate-release",
        );
        console.log(JSON.stringify(outcome));
        break;
      }
      case "pump": {
        const maxSteps = Number(a1 ?? 20);
        // PLMP-CTX-2 §2: optional telemetry attribution — the operator names
        // the model (and per-attempt price) that runs the mechanical executor.
        const model = arg(parsed.options, "--model");
        const cost = Number(arg(parsed.options, "--cost") ?? 0);
        const attribution =
          model === undefined
            ? undefined
            : { model, cost: Number.isFinite(cost) && cost >= 0 ? cost : 0 };
        const result = await controller.pumpCommandAttempts({
          maxSteps: Number.isNaN(maxSteps) ? 20 : maxSteps,
          attribution,
        });
        console.log(JSON.stringify({ ...result, lastEventType: result.lastEvent?.event_type ?? null }));
        break;
      }
      case "context": {
        const attemptId = a1 ?? "";
        const result = await controller.compileTaskContext(attemptId);
        console.log(
          JSON.stringify({
            manifestId: result.manifest.manifest_id,
            source: result.manifest.source,
            coverage: result.coverage,
          }),
        );
        break;
      }
      case "telemetry": {
        // PLMP-CTX-2: the pooled telemetry view (machine-readable stat face).
        await controller.loadTelemetryInto(controller.telemetry);
        const snapshot = controller.telemetry.snapshot();
        const candidatesJson = arg(parsed.options, "--candidates");
        const taskType = arg(parsed.options, "--task-type") ?? "implementer";
        let advice: unknown = undefined;
        if (candidatesJson !== undefined) {
          advice = controller.telemetry.suggestModel(taskType, JSON.parse(candidatesJson));
        }
        console.log(
          JSON.stringify({
            rows: snapshot.rows,
            totalAttempts: snapshot.totalAttempts,
            totalCost: snapshot.totalCost,
            ...(advice === undefined ? {} : { advice }),
          }),
        );
        break;
      }
      case "architect": {
        // PLMP-ARCH: the main agent is the architect (zero in-plugin LLM).
        // Validate the proposal first; declare only on an empty diagnostic -
        // new projects via start, revisions via plan (both existing channels).
        // PLMP-ARCH-3: --preset builds the proposal from the preset library
        // (kernel defaults unless --params JSON); a1 stays the file path for
        // a hand-written proposal.
        const presetOption = arg(parsed.options, "--preset");
        let proposal: ProjectProposal;
        if (presetOption !== undefined) {
          const rawParams = arg(parsed.options, "--params");
          const params =
            rawParams === undefined
              ? {}
              : (JSON.parse(
                  rawParams.startsWith("@") ? readFileSync(rawParams.slice(1), "utf8") : rawParams,
                ) as Record<string, unknown>);
          const goalOption = arg(parsed.options, "--goal");
          if (goalOption !== undefined) params.goal = goalOption;
          // Kernel-generated: the trusted producer (contract conformance is
          // machine-asserted in the preset tests, not re-parsed on this path).
          proposal = presetDraft(presetOption, params);
        } else {
          // PLMP-GRAPH-5 §B2-B: hand-written proposal JSON is untrusted input.
          proposal = parseProjectProposal(JSON.parse(readFileSync(a1 ?? "", "utf8")));
        }
        const knownGates = new Set(
          (
            store.connection
              .prepare("SELECT gate_id FROM gate_registry WHERE project_id=?")
              .all(controller.projectId) as Array<{ gate_id: string }>
          ).map((row) => row.gate_id),
        );
        const diagnostics = validateProjectProposal(proposal, { knownGateIds: knownGates });
        if (diagnostics.length > 0 || arg(parsed.options, "--declare") === undefined) {
          console.log(JSON.stringify({ diagnostics, declared: false }));
          break;
        }
        const tasks = proposalTaskSpecs(proposal);
        // G9-G §5 (CLI-PROJECT-A01): started-ness is scoped to THIS project -
        // the old global `LIMIT 1` let a sibling project in a shared store
        // route this declaration into plan() and fail.
        const started = controller.isProjectInitialized();
        const event = started
          ? controller.plan({
              tasks,
              changeClass: proposal.changeClass,
              changedIds: tasks.map((task) => task.task_id),
            })
          : controller.start({
              projectId: controller.projectId,
              goal: proposal.goal,
              tasks,
            });
        console.log(
          JSON.stringify({
            diagnostics: [],
            declared: true,
            eventType: event.event_type,
          }),
        );
        break;
      }
      case "serve": {
        // PLMP-WEB-1: the additive presentation face - a reader + control
        // front over the frozen contracts. Not an orchestration daemon.
        const portOption = arg(parsed.options, "--port");
        const hostOption = arg(parsed.options, "--host");
        const tokenOption = arg(parsed.options, "--token");
        const handle = await serveOrchestration(controller, {
          ...(portOption === undefined ? {} : { port: Number(portOption) }),
          ...(hostOption === undefined ? {} : { host: hostOption }),
          ...(tokenOption === undefined ? {} : { token: tokenOption }),
        });
        console.log(JSON.stringify({ url: handle.url, token: handle.token }));
        await new Promise<void>((resolve) => {
          const shutdown = (): void => {
            void handle.close().then(resolve, resolve);
          };
          process.once("SIGINT", shutdown);
          process.once("SIGTERM", shutdown);
        });
        break;
      }
      case "tui": {
        // PLMP-TUI-1: the terminal dual view over the same VIS contracts.
        await runTui(controller);
        break;
      }
      case "status": {
        console.log(JSON.stringify(controller.status(), null, 2));
        break;
      }
      default:
        throw new Error(`unknown command: ${command}`);
    }
  } finally {
    await effects.close();
    store.close();
  }
}

main().catch((error) => {
  console.error(`palimpsest: ${error.message}`);
  process.exitCode = 1;
});
