/**
 * SR-1 R3A — the product tool cluster.
 *
 * palimpsest_collaborate, palimpsest_cross_project, kept together because they read the
 * same application face(s). Adapter only: tool metadata, its own argument parsing and a call to
 * the application façade. It reaches no durable store and no semantic service directly (§12).
 */

import type { PalimpsestApplicationSurface } from "../../application/surface.js";
import { COLLABORATION_INTENTS, MAX_BRANCH_HINT, MIN_BRANCH_HINT } from "../../interaction/index.js";
import type { DshToolDefinition } from "../../tools/dsh_types.js";
import { tool, ToolArgsError, required, requiredString } from "./common.js";

export function defineProductTools(application: PalimpsestApplicationSurface): DshToolDefinition[] {
  const tools: DshToolDefinition[] = [];
if (application.collaboration !== undefined) {
    const collaboration = application.collaboration;
    tools.push(
      tool({
        name: "palimpsest_collaborate",
        description:
          "ONE-REQUEST LOCAL COLLABORATION (UX-A): use this when the user asks, in ordinary language, for parallel or multi-agent work on the CURRENT project — 并行探索 / 同时研究多种方案 / 给我多个相互独立的思路 / 多角度分析 / 比较几种方案 and English equivalents such as parallel investigation, several independent approaches, compare the options, break this into independent parts, or get a second independent line of reasoning. It also answers a request to verify the CURRENT project state (检查当前项目状态是否通过验证 / check the current project state / is this still valid?). State the task in the user's own words and Palimpsest decides, through the existing architecture advisor, whether another collaboration boundary has engineering value. `plan` is a read-only derivation (it profiles the task, consults the architecture advisor and the derived posture/verification availability, and returns the structure chosen, why, and any capability warning); `run` [mutating] executes only the EXISTING governed recipe/verification paths and returns the findings and any verification result in plain language. intent AUTO (default; the advisor selects) | FOCUS | PARALLEL | CHECK | PARALLEL_AND_CHECK. FOCUS creates no branch and no agent. PARALLEL uses bounded EPHEMERAL reasoning branches: their findings are EXPLORATORY, are NOT Evidence and are not verified truth, and no durable peer, agent identity or commitment is minted. CHECK runs the REAL Project Verification runtime against the EXACT current Project Head: it verifies PROJECT STATE, never the PARALLEL findings. `run` may honestly answer CAPABILITY_REQUIRED / CROSS_PROJECT_REQUIRED / PARTIAL. Raw recipe ids, plan objects, agent ids, commands, authority flags, peer refs and verification results are NOT accepted — the advisor still selects, the compiler still compiles, and ReasoningCell/ProjectVerification still own their semantics. Use `palimpsest_recipe`/`palimpsest_reasoning` only for expert, step-by-step control; `truth` is never returned (a PASS is a protocol result)",
        mode: "mutating",
        actions: ["plan", "run"],
        extraProperties: {
          task: {
            type: "string",
            description:
              "the task or question in the user's own words (e.g. “并行研究这个问题，给我两种独立思路” / “check whether the current project state still passes”)",
          },
          intent: {
            type: "string",
            enum: [...COLLABORATION_INTENTS],
            description: "AUTO (default; let the advisor decide) | FOCUS | PARALLEL | CHECK | PARALLEL_AND_CHECK",
          },
          branchCountHint: {
            type: "number",
            description: `advanced, bounded local branch count (${MIN_BRANCH_HINT}..${MAX_BRANCH_HINT}); out-of-range is refused, never clamped`,
          },
          verifierRef: { type: "string", description: "an already-REGISTERED verifier ref that CHECK may bind" },
          values: {
            type: "object",
            description:
              "explicit task-feature values (USER_DECLARED) that override the untrusted profiler proposal; keys are the nine task feature names",
          },
        },
        run: async (action, object) => {
          const intent = object.intent;
          if (
            intent !== undefined &&
            (typeof intent !== "string" || !(COLLABORATION_INTENTS as readonly string[]).includes(intent))
          ) {
            throw new ToolArgsError(`argument "intent" must be one of ${COLLABORATION_INTENTS.join(", ")}`);
          }
          const branchCountHint = object.branchCountHint;
          if (branchCountHint !== undefined && (typeof branchCountHint !== "number" || !Number.isSafeInteger(branchCountHint))) {
            throw new ToolArgsError('argument "branchCountHint" must be an integer');
          }
          const values = object.values;
          if (values !== undefined && (typeof values !== "object" || values === null || Array.isArray(values))) {
            throw new ToolArgsError('argument "values" must be an object');
          }
          const verifierRef = object.verifierRef;
          if (verifierRef !== undefined && (typeof verifierRef !== "string" || verifierRef.trim() === "")) {
            throw new ToolArgsError('argument "verifierRef" must be a non-empty string');
          }
          // The caller supplies the task, an optional intent and the bounded hints —
          // never an identity, a plan or an authority. `requestedBy` is derived here.
          const request = {
            task: requiredString(object, "task"),
            requestedBy: "agent:palimpsest_collaborate",
            ...(intent === undefined ? {} : { intent: intent as (typeof COLLABORATION_INTENTS)[number] }),
            ...(branchCountHint === undefined ? {} : { branchCountHint }),
            ...(verifierRef === undefined ? {} : { verifierRef }),
            ...(values === undefined ? {} : { taskProfileOverrides: values as Readonly<Record<string, string>> }),
          };
          return action === "plan" ? collaboration.plan(request) : collaboration.run(request);
        },
      }),
    );
  }

  if (application.crossProject !== undefined) {
    const crossProject = application.crossProject;
    tools.push(
      tool({
        name: "palimpsest_cross_project",
        description:
          "ONE-REQUEST CROSS-PROJECT COLLABORATION (UX-B): use this when the user wants to ask, consult or check ANOTHER project in ordinary language — 问一下另一个项目 / 咨询一下 optics 项目 / 别的项目之前是否研究过这个问题 / ask the optics project / consult the other project / did the other project already look into this? — without knowing peer ids, threads or federation mechanics and without switching project. `projects` is the READ-ONLY deployment directory of projects this installation may reach; `prepare` is a READ-ONLY preview of the EXACT packet that would be sent (task text plus any explicitly supplied context, and nothing else — no workspace, journal, asset or proof data is ever attached automatically); `ask` [mutating] sends ONE ordinary peer message and returns immediately (one request is NOT one round trip, and no answer is awaited; asking creates NO commitment, Work task, ProjectIR revision, boundary change, Evidence or Proof — Ask stays Ask); `status` is a READ-ONLY derivation of what is known so far (no response yet means WAITING, not failure, and materially different answers are reported as CONFLICT rather than picked); `pending` lists the authenticated questions OTHER projects have asked THIS one, each with its `task` — read that task, it is the whole request; `respond` [mutating] answers one of them on its own thread in ONE of two forms — author the reply yourself with {status, answer, detail?}, or have THIS project's own local collaboration produce it with {compose:{task?,intent?}}; `receive` [mutating] surfaces the terminal answer and marks that answer processed; `acknowledge` [mutating] marks ONE consumed peer message as processed. `target` is the other project's NAME as the user would say it (its id, display name or alias) — never a peer id; an unknown or ambiguous name sends nothing. An answer is peer communication, not Evidence, Proof, Decision or Commitment, and is never imported automatically.",
        mode: "mutating",
        actions: ["projects", "prepare", "ask", "status", "pending", "respond", "receive", "acknowledge"],
        extraProperties: {
          target: {
            type: "string",
            description:
              "the other project's name as the user would say it, e.g. \"optics\" (its id, display name or alias) — never a peer id",
          },
          task: {
            type: "string",
            description:
              "the question in the user's own words (e.g. “我们之前是否研究过探测器孔径对接收稳定性的影响？” / “has this been investigated before?”)",
          },
          contextText: { type: "string", description: "optional context text to include EXACTLY as given; nothing else is sent" },
          requestId: { type: "string", description: "the cross-project request id (from `ask`, `pending` or `prepare`)" },
          answer: {
            type: "object",
            description:
              "what to reply with. For a simple answer, author it: {status?: ANSWERED|PARTIAL|DECLINED|ERROR, answer?, detail?}. " +
              "When the pending task should be handled by THIS project's own local collaboration — which is the normal project path when the task explicitly asks for parallel exploration, multiple independent approaches, multi-Agent work or a local independent check — pass {compose:{task?,intent?}} instead and let the composed run derive the answer (compose.task defaults to the pending task; compose.intent is " +
              `${COLLABORATION_INTENTS.join("|")}, default AUTO, and PARALLEL is the intent for a request that asks for several independent approaches). ` +
              "Never present a single authored answer as if several independent branches had produced it. A composed run's findings are EXPLORATORY: they are not Evidence, not verified truth, and neither the answer nor its summary may say otherwise.",
          },
          message: {
            type: "object",
            description: "the full peer message to acknowledge (the object returned by `pending`/`status`/`receive` is not it — use the message the inbox returned)",
          },
        },
        run: async (action, object) => {
          if (action === "projects") return crossProject.projects();
          if (action === "pending") return crossProject.pending();
          if (action === "prepare") {
            return crossProject.prepareAsk({
              target: requiredString(object, "target"),
              task: requiredString(object, "task"),
              ...(object.contextText === undefined ? {} : { contextText: requiredString(object, "contextText") }),
              requestedBy: "agent:palimpsest_cross_project",
            });
          }
          if (action === "ask") {
            return crossProject.ask({
              target: requiredString(object, "target"),
              task: requiredString(object, "task"),
              ...(object.contextText === undefined ? {} : { contextText: requiredString(object, "contextText") }),
              requestedBy: "agent:palimpsest_cross_project",
            });
          }
          if (action === "status") return crossProject.status(requiredString(object, "requestId"));
          if (action === "receive") return crossProject.receive(requiredString(object, "requestId"));
          if (action === "respond") {
            return crossProject.respond(requiredString(object, "requestId"), object.answer);
          }
          return crossProject.acknowledge(required(object, "message"));
        },
      }),
    );
  }
  if (application.delegation !== undefined) {
    const delegation = application.delegation;
    tools.push(
      tool({
        name: "palimpsest_delegate",
        description:
          "DELEGATE ONE RESEARCH QUESTION AND CARRY ON (PLMP-LEAN-1 §C.14): use this when a question would genuinely improve your next decision, but answering it is not the work you are doing — 顺便研究一下 / 后台查一下 / 同时研究这个问题, or English equivalents such as look into this in the background, research this while I keep working, find out whether … BEFORE I decide. `start` [mutating] returns IMMEDIATELY: it opens an EPHEMERAL exploratory reasoning branch against a FROZEN snapshot of this project's committed HEAD (the delegation's read basis) and runs it on the same cognition backend as `palimpsest_collaborate`. Do NOT wait, do NOT poll and do NOT call `status` in a loop — a terminal result is delivered to YOU on its own, as a follow-up message naming its basis and its conclusion. Keep doing your own work in the meantime; delegating never blocks and never requires `palimpsest_begin`. The result is cell-local EXPLORATORY standing: it is NOT Evidence, NOT verified truth and NOT a project verification, and nothing about it creates a Task, an Attempt or a promotion. Re-issuing the SAME task on the SAME basis returns the SAME delegation (it never runs twice), and on a NEW basis it is a new one. `status` [read-only] and `inspect` [read-only] exist for restart recovery and explicit drill-down: an OPEN branch with no live job reports INTERRUPTED — honest, never a claim that a worker is still running, and v1 does not re-run it. `kind` is RESEARCH only for now.",
        mode: "mutating",
        actions: ["start", "status", "inspect"],
        extraProperties: {
          task: {
            type: "string",
            description:
              "the research question in your own words (e.g. “查一下这个仓库里 invalidate() 的竞态是不是已知问题” / “find out whether the cache race is a known problem here”) — the delegation's identity is derived from the task, the project and the read basis, so the same wording is the same delegation",
          },
          kind: {
            type: "string",
            enum: ["RESEARCH"],
            description: "RESEARCH (the only kind D1 implements; WORK and cross-project have their own tools)",
          },
          delegationRef: {
            type: "string",
            description: "the opaque ref returned by `start`, required by `status`/`inspect` (never construct one yourself)",
          },
        },
        run: async (action, object) => {
          if (action === "status") return delegation.status({ delegationRef: requiredString(object, "delegationRef") });
          if (action === "inspect") return delegation.inspect({ delegationRef: requiredString(object, "delegationRef") });
          const kind = object.kind;
          if (kind !== undefined && kind !== "RESEARCH") {
            throw new ToolArgsError('argument "kind" must be "RESEARCH" (WORK and cross-project are not delegated here)');
          }
          return delegation.start({ task: requiredString(object, "task"), kind: "RESEARCH" });
        },
      }),
    );
  }

  return tools;
}
