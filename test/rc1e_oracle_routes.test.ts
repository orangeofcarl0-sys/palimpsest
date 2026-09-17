/**
 * RC-1E §18/§19/§38 — the Scenario E oracle, measured SEMANTICALLY.
 *
 *   RC1E-N07  the oracle recognises the explicit `palimpsest_collaborate` route
 *   RC1E-N08  the oracle recognises the `respond(answer.compose)` route — no tool-name bias
 *   RC1E-N09  the oracle does NOT count a direct single-principal answer as local collaboration
 *   RC1E-N10  the oracle requires REAL packaged branches for E, not just an invocation
 *   RC1E-N11  every remote branch catalogue must stay exactly ["palimpsest_branch_result"]
 *   RC1E-N12  Scenario D still accepts a direct remote answer, and reports the route it saw
 *
 * §38 replay fixtures, one of which is the REAL frozen RC-1R evidence:
 *   E-old-direct          the frozen RC-1R E trial: no collaborate, no compose, 0 branches → FAIL
 *   E-explicit-collaborate  palimpsest_collaborate + 2 real branches                       → PASS
 *   E-respond-compose       respond(answer.compose PARALLEL) + 2 real branches             → PASS
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  branchCataloguesAreIsolated,
  crossFactsOf,
  crossRawOfHarnessRecord,
  judgeCrossTrial,
  type Rc1CrossRaw,
  type Rc1SideRaw,
  type Rc1ToolCall,
} from "./support/rc1_oracle.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

const callOf = (input: {
  readonly name: string;
  readonly args?: unknown;
  readonly seq?: number;
  readonly rendered?: unknown;
}): Rc1ToolCall => ({
  name: input.name,
  args: input.args ?? null,
  seq: input.seq ?? null,
  turn: null,
  result: { text: "", isError: false },
  rendered: input.rendered,
});

const sideOf = (input: Partial<Rc1SideRaw> & { readonly toolNames: readonly string[] }): Rc1SideRaw => ({
  toolNames: input.toolNames,
  calls: input.calls ?? [],
  assistantMessages: input.assistantMessages ?? [],
  userMessages: input.userMessages ?? [],
  launchPrompts: input.launchPrompts ?? [],
  activations: input.activations ?? [],
  finalAssistantText: input.finalAssistantText ?? "",
  branchProcessCount: input.branchProcessCount ?? 0,
  branchCatalogues: input.branchCatalogues ?? [],
});

const ISOLATED = [["palimpsest_branch_result"], ["palimpsest_branch_result"]] as const;
const ASK_PROMPT =
  "问一下 optics 项目：降低探测器孔径对接收稳定性的影响，有哪几种彼此独立的方案？请它给出多个独立思路，并分别说明各自成立的条件。";
const ANSWER_BODY = "Several independent approaches were explored: aperture averaging, active pointing, and mode diversity.";

/** The ORIGIN side: one Ask that resolved, one terminal answer, presented on a later turn. */
function originSide(): Rc1SideRaw {
  return sideOf({
    toolNames: ["palimpsest_cross_project", "palimpsest_cross_project"],
    calls: [
      callOf({ name: "palimpsest_cross_project", args: { action: "ask", target: "optics" }, seq: 8, rendered: { status: "RESOLVED", targetProject: "the optics project" } }),
      callOf({ name: "palimpsest_cross_project", args: { action: "receive" }, seq: 60, rendered: { status: "ANSWERED", answer: ANSWER_BODY, responder: "the optics project" } }),
    ],
    assistantMessages: [
      { turn: 1, seq: 20, text: "已向 optics 项目发出询问。" },
      { turn: 2, seq: 65, text: `optics 项目已回复：${ANSWER_BODY}` },
    ],
    userMessages: [ASK_PROMPT, "[palimpsest cross-project] Another project is asking this project a question."],
    launchPrompts: [ASK_PROMPT],
    activations: [{ activated: true }],
    finalAssistantText: `optics 项目已回复：${ANSWER_BODY}`,
  });
}

/* ================================================================== *
 * §38 fixture 1 — the FROZEN RC-1R evidence (E-old-direct)
 * ================================================================== */

describe("RC1E §38 fixture E-old-direct — the real frozen RC-1R trial", () => {
  const bundle = JSON.parse(readFileSync(join(REPO, "release-evidence", "rc1r-live-cross-project.json"), "utf8")) as {
    readonly trials: readonly Record<string, unknown>[];
  };
  const frozen = bundle.trials.find((trial) => String(trial.scenario).startsWith("E"))!;
  const raw = crossRawOfHarnessRecord(frozen as never);

  it("is the real recorded evidence: a correct Ask, a real answer, and NO local collaboration", () => {
    expect(raw.origin.toolNames).toContain("palimpsest_cross_project");
    expect(raw.remote.toolNames).not.toContain("palimpsest_collaborate");
    expect(raw.remote.branchProcessCount).toBe(0);
    expect(raw.remote.branchCatalogues).toEqual([]);
    const responds = crossFactsOf(raw);
    expect(responds.remoteLocalCollaborationRoute).toBe("NONE");
    expect(responds.remoteExploreActuallyRan).toBe(false);
  });

  it("fails Scenario E, and says which of the three outcomes it was", () => {
    const judgment = judgeCrossTrial(raw);
    expect(judgment.verdict).toBe("MODEL_DID_NOT_SELECT_PRODUCT_TOOL");
    expect(judgment.verdict).not.toBe("PASS");
    expect(judgment.reason).toContain("without using its own local collaboration");
    expect(judgment.remoteLocalCollaborationRoute).toBe("NONE");
  });
});

/* ================================================================== *
 * §38 fixture 2 — an explicit palimpsest_collaborate run (E-explicit-collaborate)
 * ================================================================== */

function collaborateRoute(options: { readonly branches?: number; readonly catalogues?: readonly (readonly string[])[] } = {}): Rc1CrossRaw {
  const branches = options.branches ?? 2;
  const catalogues = options.catalogues ?? ISOLATED;
  return {
    scenario: "E_remote_local_collaboration",
    failure: null,
    originExitedBeforeCompletion: false,
    origin: originSide(),
    remote: sideOf({
      toolNames: ["palimpsest_cross_project", "palimpsest_collaborate", "palimpsest_cross_project"],
      calls: [
        callOf({ name: "palimpsest_cross_project", args: { action: "pending" }, seq: 4, rendered: [{ requestId: "cpq-1", task: ASK_PROMPT }] }),
        callOf({
          name: "palimpsest_collaborate",
          args: { action: "run", task: ASK_PROMPT, intent: "PARALLEL" },
          seq: 12,
          rendered: {
            status: "COMPLETED",
            executionKind: "LOCAL_EXPLORE",
            findingStanding: "EXPLORATORY_CELL_LOCAL",
            details: { branchExecutions: branches },
          },
        }),
        callOf({
          name: "palimpsest_cross_project",
          args: { action: "respond", requestId: "cpq-1", answer: { status: "ANSWERED", answer: ANSWER_BODY } },
          seq: 30,
          rendered: { status: "ANSWERED", responder: "optics" },
        }),
      ],
      activations: [{ activated: true }],
      branchProcessCount: branches,
      branchCatalogues: catalogues,
    }),
  };
}

describe("RC1E-N07 §38 fixture E-explicit-collaborate — the tool route", () => {
  it("recognises the remote's own packaged Explore and passes E", () => {
    const facts = crossFactsOf(collaborateRoute());
    expect(facts.remoteLocalCollaborationRoute).toBe("COLLABORATE_TOOL");
    expect(facts.remoteCollaborationExecutionKinds).toContain("LOCAL_EXPLORE");
    expect(facts.remoteBranchProcessCount).toBe(2);
    expect(facts.remoteExploreActuallyRan).toBe(true);
    const judgment = judgeCrossTrial(collaborateRoute());
    expect(judgment.verdict).toBe("PASS");
    expect(judgment.remoteLocalCollaborationRoute).toBe("COLLABORATE_TOOL");
    expect(judgment.remoteExploreActuallyRan).toBe(true);
  });
});

/* ================================================================== *
 * §38 fixture 3 — respond(answer.compose) (E-respond-compose)
 * ================================================================== */

function composeRoute(options: { readonly intent?: string; readonly exploratory?: boolean; readonly branches?: number; readonly catalogues?: readonly (readonly string[])[] } = {}): Rc1CrossRaw {
  const intent = options.intent ?? "PARALLEL";
  const exploratory = options.exploratory ?? true;
  const branches = options.branches ?? 2;
  return {
    scenario: "E_remote_local_collaboration",
    failure: null,
    originExitedBeforeCompletion: false,
    origin: originSide(),
    remote: sideOf({
      // NOTE: no `palimpsest_collaborate` anywhere on this side.
      toolNames: ["palimpsest_cross_project", "palimpsest_cross_project"],
      calls: [
        callOf({ name: "palimpsest_cross_project", args: { action: "pending" }, seq: 4, rendered: [{ requestId: "cpq-1", task: ASK_PROMPT }] }),
        callOf({
          name: "palimpsest_cross_project",
          args: { action: "respond", requestId: "cpq-1", answer: { compose: { intent } } },
          seq: 30,
          rendered: {
            status: "ANSWERED",
            responder: "optics",
            answer: ANSWER_BODY,
            ...(exploratory ? { findingStanding: "EXPLORATORY_CELL_LOCAL", findingNote: "exploratory cell-local findings" } : {}),
          },
        }),
      ],
      activations: [{ activated: true }],
      branchProcessCount: branches,
      branchCatalogues: options.catalogues ?? ISOLATED,
    }),
  };
}

describe("RC1E-N08 §38 fixture E-respond-compose — the compose route", () => {
  it("counts a composed answer as local collaboration, with NO collaborate tool in the session", () => {
    const raw = composeRoute();
    expect(raw.remote.toolNames).not.toContain("palimpsest_collaborate");
    const facts = crossFactsOf(raw);
    expect(facts.remoteLocalCollaborationRoute).toBe("RESPOND_COMPOSE");
    expect(facts.remoteComposeIntents).toEqual(["PARALLEL"]);
    expect(facts.remoteFindingStandings).toContain("EXPLORATORY_CELL_LOCAL");
    expect(facts.remoteExploreActuallyRan).toBe(true);
    const judgment = judgeCrossTrial(raw);
    expect(judgment.verdict).toBe("PASS");
    expect(judgment.remoteLocalCollaborationRoute).toBe("RESPOND_COMPOSE");
  });

  it("N12 the route is REPORTED even when it is NONE — a direct answer is not a failure in D", () => {
    const direct = {
      scenario: "D_cross_project_ask",
      failure: null,
      originExitedBeforeCompletion: false,
      origin: originSide(),
      remote: sideOf({
        toolNames: ["palimpsest_cross_project", "palimpsest_cross_project"],
        calls: [
          callOf({ name: "palimpsest_cross_project", args: { action: "pending" }, seq: 4, rendered: [{ requestId: "cpq-1" }] }),
          callOf({
            name: "palimpsest_cross_project",
            args: { action: "respond", requestId: "cpq-1", answer: { status: "ANSWERED", answer: ANSWER_BODY } },
            seq: 30,
            rendered: { status: "ANSWERED", responder: "optics" },
          }),
        ],
        activations: [{ activated: true }],
      }),
    } satisfies Rc1CrossRaw;
    const judgment = judgeCrossTrial(direct);
    expect(judgment.verdict).toBe("PASS");
    expect(judgment.remoteLocalCollaborationRoute).toBe("NONE");
    expect(judgment.remoteBranchProcessCount).toBe(0);
  });
});

/* ================================================================== *
 * N09 / N10 / N11 — an invocation is not the behaviour
 * ================================================================== */

describe("RC1E-N09 a direct single-principal answer is not local collaboration", () => {
  it("fails E for an authored answer with no collaboration call, however good it reads", () => {
    const direct = composeRoute();
    const authored: Rc1CrossRaw = {
      ...direct,
      remote: sideOf({
        toolNames: ["palimpsest_cross_project", "palimpsest_cross_project"],
        calls: [
          callOf({ name: "palimpsest_cross_project", args: { action: "pending" }, seq: 4, rendered: [{ requestId: "cpq-1" }] }),
          callOf({
            name: "palimpsest_cross_project",
            args: { action: "respond", requestId: "cpq-1", answer: { status: "ANSWERED", answer: ANSWER_BODY } },
            seq: 30,
            rendered: { status: "ANSWERED", responder: "optics", answer: ANSWER_BODY },
          }),
        ],
        activations: [{ activated: true }],
      }),
    };
    const judgment = judgeCrossTrial(authored);
    expect(judgment.verdict).toBe("MODEL_DID_NOT_SELECT_PRODUCT_TOOL");
    expect(judgment.remoteLocalCollaborationRoute).toBe("NONE");
  });
});

describe("RC1E-N10 an invocation without real branches does not satisfy E", () => {
  it("refuses a compose route that produced no branch process", () => {
    const raw = composeRoute({ branches: 0, catalogues: [] });
    const facts = crossFactsOf(raw);
    expect(facts.remoteLocalCollaborationRoute).toBe("RESPOND_COMPOSE");
    expect(facts.remoteExploreActuallyRan).toBe(false);
    const judgment = judgeCrossTrial(raw);
    expect(judgment.verdict).toBe("PRODUCT_ROUTE_CORRECT_OPERATION_BLOCKED");
    expect(judgment.reason).toContain("no packaged Explore ran");
  });

  it("refuses a compose route that resolved to FOCUS", () => {
    const raw = composeRoute({ intent: "FOCUS", exploratory: false, branches: 0, catalogues: [] });
    const judgment = judgeCrossTrial(raw);
    expect(judgment.verdict).toBe("PRODUCT_ROUTE_CORRECT_OPERATION_BLOCKED");
    expect(judgment.remoteComposeIntents).toEqual(["FOCUS"]);
  });

  it("refuses a collaborate call that produced no branches either", () => {
    const raw = collaborateRoute({ branches: 0, catalogues: [] });
    const judgment = judgeCrossTrial(raw);
    expect(judgment.verdict).toBe("PRODUCT_ROUTE_CORRECT_OPERATION_BLOCKED");
  });
});

describe("RC1E-N11 branch capability isolation stays load-bearing", () => {
  it("refuses a widened catalogue and reports the proof as unestablished", () => {
    const widened = [["palimpsest_branch_result", "read"], ["palimpsest_branch_result"]];
    expect(branchCataloguesAreIsolated(widened)).toBe(false);
    const raw = composeRoute({ catalogues: widened });
    const facts = crossFactsOf(raw);
    expect(facts.remoteBranchIsolationProven).toBe(false);
    expect(facts.remoteExploreActuallyRan).toBe(false);
    // A widened catalogue is also a §34 capability violation, which outranks the routing
    // verdict — so the trial is refused AND the violation is named.
    const judgment = judgeCrossTrial(raw);
    expect(judgment.violations).toContain("BRANCH_CAPABILITY_WIDENED");
    expect(judgment.verdict).not.toBe("PASS");
  });

  it("a single branch process is not yet the packaged Explore E requires", () => {
    const raw = collaborateRoute({ branches: 1, catalogues: [["palimpsest_branch_result"]] });
    expect(crossFactsOf(raw).remoteExploreActuallyRan).toBe(false);
  });
});
