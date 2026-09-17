/**
 * RC-1R §13 — deterministic frozen-evidence replay for the release-qualification oracle.
 *
 * These tests spend ZERO live model calls. They replay evidence that already exists:
 *
 *   test/fixtures/rc1/frozen-rc1-live-local.json
 *   test/fixtures/rc1/frozen-rc1-live-cross-project.json
 *
 * — byte-identical copies of the bundles committed at `ae4a91c` (also preserved as
 * `release-evidence/rc1-historical-ae4a91c-*.json`), so the historical trial is never
 * deleted (§29) and the replay input can never drift with a new run.
 *
 * Every repaired rule is asserted TWICE: once through the repaired oracle, and once
 * through a faithful port of the rule the released bundle actually applied. The pair is
 * the discriminating regression — if someone reverts the repair, the repaired half fails;
 * if someone "fixes" the fixture, the released half fails.
 *
 * Where the pre-repair harness discarded a protocol field the oracle needs, the fixture
 * supplies it EXPLICITLY and says so in the test name and comment (§28 — the pre-repair
 * bundle stored no `answer` body, no `userMessages`, and no raw call records at all).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  branchCataloguesAreIsolated,
  crossFactsOf,
  judgeCrossTrial,
  judgeLocalTrial,
  originSurfacing,
  qualify,
  textFlagsOf,
  type Rc1CrossRaw,
  type Rc1Judgment,
  type Rc1LocalRaw,
  type Rc1SideRaw,
  type Rc1ToolCall,
} from "./support/rc1_oracle.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = join(REPO, "test", "fixtures", "rc1");

const readFixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as Record<string, unknown>;

const frozenLocal = readFixture("frozen-rc1-live-local.json");
const frozenCross = readFixture("frozen-rc1-live-cross-project.json");

interface FrozenTrial {
  readonly kind?: string;
  readonly scenario?: string;
  readonly trial: number;
  readonly verdict: string;
  readonly finalText?: string;
  readonly principalToolCalls?: readonly string[];
  readonly collaborateExecutions?: readonly string[];
  readonly collaborateStatuses?: readonly string[];
  readonly verifierRunCount?: number;
  readonly branchProcessCount?: number;
  readonly branchCatalogues?: readonly (readonly string[])[];
  readonly status?: string;
  readonly exitCode?: number | null;
  readonly wallMs?: number;
  readonly origin?: {
    readonly toolNames: readonly string[];
    readonly crossProjectCalls: readonly { readonly action: string | null; readonly status: string | null }[];
    readonly assistantTurns: readonly (number | null)[];
    readonly finalAssistantText: string;
  };
  readonly remote?: {
    readonly toolNames: readonly string[];
    readonly crossProjectCalls: readonly { readonly action: string | null; readonly status: string | null }[];
    readonly collaborateExecutions?: readonly string[];
    readonly activations?: readonly { readonly activated?: unknown }[];
  };
}

const trialsOf = (bundle: Record<string, unknown>): readonly FrozenTrial[] =>
  (bundle.trials ?? []) as readonly FrozenTrial[];

/* ------------------------------------------------------------------ *
 * Fixture builders around the frozen records
 * ------------------------------------------------------------------ */

function sideOf(input: {
  readonly toolNames: readonly string[];
  readonly calls?: readonly Rc1ToolCall[];
  readonly assistantMessages?: readonly { readonly turn: number | null; readonly seq: number | null; readonly text: string }[];
  readonly userMessages?: readonly string[];
  readonly launchPrompts?: readonly string[] | undefined;
  readonly activations?: readonly { readonly activated?: unknown }[];
  readonly finalAssistantText?: string;
  readonly branchProcessCount?: number;
  readonly branchCatalogues?: readonly (readonly string[])[];
}): Rc1SideRaw {
  return {
    toolNames: input.toolNames,
    calls: input.calls ?? [],
    assistantMessages: input.assistantMessages ?? [],
    userMessages: input.userMessages ?? [],
    ...(input.launchPrompts === undefined ? {} : { launchPrompts: input.launchPrompts }),
    activations: input.activations ?? [],
    finalAssistantText: input.finalAssistantText ?? "",
    branchProcessCount: input.branchProcessCount ?? 0,
    branchCatalogues: input.branchCatalogues ?? [],
  };
}

function callOf(input: {
  readonly name: string;
  readonly args?: unknown;
  readonly seq?: number | null;
  readonly rendered?: unknown;
}): Rc1ToolCall {
  return {
    name: input.name,
    args: input.args ?? null,
    seq: input.seq ?? null,
    turn: null,
    result: { text: "", isError: false },
    rendered: input.rendered,
  };
}

/* ------------------------------------------------------------------ *
 * Faithful ports of the PRE-REPAIR rules (the discriminating half)
 * ------------------------------------------------------------------ */

/**
 * The committed pre-repair `originSurfacing()` (`rc1-live-cross-project.mjs` @ ae4a91c),
 * verbatim in behaviour: it accepts ONLY `status === "ANSWERED"`.
 */
function preRepairOriginSurfacing(side: Rc1SideRaw): boolean {
  const answered = [...side.calls]
    .reverse()
    .find(
      (call) =>
        call.name === "palimpsest_cross_project" &&
        ((call.args as { action?: string } | null)?.action === "receive" ||
          (call.args as { action?: string } | null)?.action === "status") &&
        ((call.rendered as { status?: string } | null)?.status ?? null) === "ANSWERED",
    );
  if (answered === undefined || answered.seq === null) return false;
  return side.assistantMessages.some((message) => message.seq !== null && message.seq > (answered.seq ?? 0) && message.text.trim() !== "");
}

/**
 * The rule the RELEASED bundle applied to Scenario C: a CHECK trial counts only when a
 * verification RUN was recorded. This reproduces the bundle's stored verdict exactly
 * (`MODEL_TASK_QUALITY_FAILURE` on a truthful `project_head_not_materialized` answer) and
 * is the rule RC-1R §10/§12 abolishes.
 */
function releasedBundleCRule(raw: Rc1LocalRaw): string {
  const calls = raw.calls.some((call) => call.name === "palimpsest_collaborate");
  if (!calls) return "MODEL_DID_NOT_SELECT_PRODUCT_TOOL";
  return (raw.verifierRuns ?? 0) > 0 ? "PASS" : "MODEL_TASK_QUALITY_FAILURE";
}

/** The pre-repair cross-project verdict ladder, reduced to the rules these replays pin. */
function preRepairCrossRule(input: { readonly originSurfaced: boolean; readonly originAsked: boolean }): string {
  if (!input.originAsked) return "MODEL_DID_NOT_SELECT_PRODUCT_TOOL";
  return input.originSurfaced ? "PASS" : "REMOTE_RESULT_NOT_SURFACED";
}

/* ================================================================== *
 * §13 Replay D1 — a terminal PARTIAL answer that the origin surfaced
 * ================================================================== */

describe("RC-1R §13 replay D1 — terminal-answer-aware surfacing", () => {
  /** The rule fixture: one `receive` returning a terminal PARTIAL with a body, then a turn. */
  const raw: Rc1CrossRaw = {
    scenario: "D_cross_project_ask",
    failure: null,
    originExitedBeforeCompletion: false,
    origin: sideOf({
      toolNames: ["palimpsest_cross_project", "palimpsest_cross_project"],
      calls: [
        callOf({ name: "palimpsest_cross_project", args: { action: "ask", target: "optics" }, seq: 3, rendered: { status: "RESOLVED" } }),
        callOf({
          name: "palimpsest_cross_project",
          args: { action: "receive" },
          seq: 9,
          rendered: { status: "PARTIAL", answer: "no research record was found in the accessible history", responder: "the optics project" },
        }),
      ],
      assistantMessages: [
        { turn: 1, seq: 5, text: "已向 optics 项目发出询问，目前仍在等待回复。" },
        { turn: 2, seq: 12, text: "optics 项目已回复：当前可访问记录中没有找到相关研究。" },
      ],
      finalAssistantText: "optics 项目已回复：当前可访问记录中没有找到相关研究。",
    }),
    remote: sideOf({
      toolNames: ["palimpsest_cross_project"],
      calls: [callOf({ name: "palimpsest_cross_project", args: { action: "respond" }, seq: 4, rendered: { status: "PARTIAL" } })],
      activations: [{ activated: true }],
    }),
  };

  it("a PARTIAL terminal answer with a body, followed by a later visible turn, IS surfaced", () => {
    const surfacing = originSurfacing(raw.origin);
    expect(surfacing.terminalStatus).toBe("PARTIAL");
    expect(surfacing.carriesAnswer).toBe(true);
    expect(surfacing.surfaced).toBe(true);
    expect(surfacing.laterMessages).toHaveLength(1);
  });

  it("the pre-repair rule DOES NOT see it, so this test discriminates", () => {
    expect(preRepairOriginSurfacing(raw.origin)).toBe(false);
  });

  it("the repaired ladder returns PASS for the whole trial", () => {
    const judgment = judgeCrossTrial(raw);
    expect(judgment.verdict).toBe("PASS");
    expect(judgment.semanticOutcome).toBe("TERMINAL_PARTIAL_SURFACED");
  });

  it("§6 — DECLINED / REMOTE_ERROR / CONFLICT prove plumbing but are NOT an answer", () => {
    for (const status of ["DECLINED", "REMOTE_ERROR", "CONFLICT"]) {
      const withDecline: Rc1CrossRaw = {
        ...raw,
        origin: sideOf({
          ...raw.origin,
          calls: [
            raw.origin.calls[0]!,
            callOf({ name: "palimpsest_cross_project", args: { action: "receive" }, seq: 9, rendered: { status } }),
          ],
        }),
      };
      const surfacing = originSurfacing(withDecline.origin);
      expect(surfacing.terminalStatus).toBe(status);
      expect(surfacing.carriesAnswer).toBe(false);
      expect(surfacing.surfaced).toBe(false);
      const judgment = judgeCrossTrial(withDecline);
      expect(judgment.verdict).toBe("PRODUCT_ROUTE_CORRECT_OPERATION_BLOCKED");
    }
  });

  it("§6 — a blank PARTIAL body is plumbing without an answer", () => {
    const blank: Rc1CrossRaw = {
      ...raw,
      origin: sideOf({
        ...raw.origin,
        calls: [
          raw.origin.calls[0]!,
          callOf({ name: "palimpsest_cross_project", args: { action: "receive" }, seq: 9, rendered: { status: "PARTIAL", answer: "   " } }),
        ],
      }),
    };
    expect(originSurfacing(blank.origin).carriesAnswer).toBe(false);
    expect(judgeCrossTrial(blank).verdict).toBe("PRODUCT_ROUTE_CORRECT_OPERATION_BLOCKED");
  });
});

/* ================================================================== *
 * §13 Replay over the FROZEN RC-1 bundle — Scenario D
 * ================================================================== */

describe("RC-1R §13 replay — the frozen Scenario D trial re-judged", () => {
  const frozen = trialsOf(frozenCross).find((trial) => trial.scenario === "D_cross_project_ask")!;

  it("the frozen bundle really did record a PARTIAL terminal answer and a LATER assistant turn", () => {
    // These are the frozen record's own raw fields, unmodified.
    expect(frozen.verdict).toBe("REMOTE_RESULT_NOT_SURFACED");
    expect(frozen.origin?.crossProjectCalls.some((call) => call.action === "receive" && call.status === "PARTIAL")).toBe(true);
    expect(frozen.origin?.crossProjectCalls.some((call) => call.status === "ANSWERED")).toBe(false);
    expect(frozen.origin?.assistantTurns).toEqual([1, 2]);
    expect(frozen.origin?.finalAssistantText.trim()).not.toBe("");
    expect(frozen.remote?.crossProjectCalls.some((call) => call.action === "respond")).toBe(true);
  });

  it("the repaired oracle PASSES it; the released rule failed it — the fixture supplies only the answer body the bundle discarded", () => {
    // §28: the pre-repair bundle stored no `answer` body, no raw call records and no
    // sequence numbers. This fixture therefore reconstructs the CALL SHAPE from the
    // frozen record's own `crossProjectCalls` statuses and supplies the non-empty answer
    // body the protocol carried (proved by the frozen visible text, which summarises it).
    const terminalSeq = 40;
    const raw: Rc1CrossRaw = {
      scenario: "D_cross_project_ask",
      failure: "timeout",
      originExitedBeforeCompletion: false,
      origin: sideOf({
        toolNames: frozen.origin!.toolNames,
        calls: [
          callOf({ name: "palimpsest_cross_project", args: { action: "ask", target: "optics" }, seq: 8, rendered: { status: "RESOLVED" } }),
          callOf({
            name: "palimpsest_cross_project",
            args: { action: "receive" },
            seq: terminalSeq,
            rendered: { status: "PARTIAL", answer: "no research record was found in the accessible history", responder: "the optics project" },
          }),
        ],
        assistantMessages: [
          { turn: 1, seq: 20, text: "目前尚未收到回复，因此还不能确认是否研究过。" },
          { turn: 2, seq: terminalSeq + 5, text: frozen.origin!.finalAssistantText },
        ],
        finalAssistantText: frozen.origin!.finalAssistantText,
      }),
      remote: sideOf({
        toolNames: frozen.remote!.toolNames,
        calls: [callOf({ name: "palimpsest_cross_project", args: { action: "respond" }, seq: 30, rendered: { status: "PARTIAL" } })],
        activations: [{ activated: true }],
      }),
    };

    expect(preRepairCrossRule({ originAsked: true, originSurfaced: preRepairOriginSurfacing(raw.origin) })).toBe(frozen.verdict);

    const judgment = judgeCrossTrial(raw);
    expect(judgment.verdict).toBe("PASS");
    expect(judgment.semanticOutcome).toBe("TERMINAL_PARTIAL_SURFACED");
    // §3: a timeout of the POLL must not become a verdict about the product.
    expect(judgment.classification).toBe("PASS");
  });
});

/* ================================================================== *
 * §13 Replay over the FROZEN RC-1 bundle — Scenario E (FP-1)
 * ================================================================== */

describe("RC-1R §13 replay — the frozen Scenario E trial re-judged (FP-1)", () => {
  const frozen = trialsOf(frozenCross).find((trial) => trial.scenario === "E_remote_local_collaboration")!;

  it("the frozen bundle recorded PASS while the remote principal never used its own collaboration", () => {
    expect(frozen.verdict).toBe("PASS");
    expect(frozen.remote?.toolNames).not.toContain("palimpsest_collaborate");
    expect(frozen.remote?.collaborateExecutions ?? []).toHaveLength(0);
  });

  it("§9 — the repaired oracle refuses that trial; the released rule had no Scenario E gate at all", () => {
    const raw: Rc1CrossRaw = {
      scenario: "E_remote_local_collaboration",
      failure: null,
      originExitedBeforeCompletion: false,
      origin: sideOf({
        toolNames: frozen.origin!.toolNames,
        calls: [
          callOf({ name: "palimpsest_cross_project", args: { action: "ask", target: "optics" }, seq: 8, rendered: { status: "RESOLVED" } }),
          callOf({
            name: "palimpsest_cross_project",
            args: { action: "receive" },
            seq: 60,
            rendered: { status: "ANSWERED", answer: "six independent mechanisms, none verified here", responder: "the optics project" },
          }),
        ],
        assistantMessages: [
          { turn: 1, seq: 20, text: "已向 optics 项目发出询问。" },
          { turn: 2, seq: 65, text: frozen.origin!.finalAssistantText },
        ],
        finalAssistantText: frozen.origin!.finalAssistantText,
      }),
      remote: sideOf({
        toolNames: frozen.remote!.toolNames,
        calls: [callOf({ name: "palimpsest_cross_project", args: { action: "respond" }, seq: 40, rendered: { status: "ANSWERED" } })],
        activations: frozen.remote!.activations ?? [],
      }),
    };

    // The released criteria block gated Scenario D only (`scenarioE_remote_used_collaborate`
    // was reported as a statistic), so the released rule accepted this trial.
    const releasedGatedScenarioE = false;
    expect(releasedGatedScenarioE).toBe(false);
    expect(frozen.remote?.toolNames.includes("palimpsest_collaborate")).toBe(false);

    const judgment = judgeCrossTrial(raw);
    expect(judgment.verdict).toBe("MODEL_DID_NOT_SELECT_PRODUCT_TOOL");
    expect(judgment.verdict).not.toBe("PASS");
    // RC-1E §18: E is now measured by BEHAVIOUR, so the reason names the route it saw.
    expect(judgment.remoteLocalCollaborationRoute).toBe("NONE");
    expect(judgment.remoteExploreActuallyRan).toBe(false);
    expect(judgment.reason).toContain("without using its own local collaboration");
  });
});

/* ================================================================== *
 * §13/§10 Replay C1 — a blocked CHECK is correct routing (FN-4)
 * ================================================================== */

describe("RC-1R §13 replay C1 — an honestly blocked high-level CHECK", () => {
  const frozen = trialsOf(frozenLocal).find((trial) => trial.kind === "C_check")!;

  /** Rebuild the raw call shape from the frozen record's own recorded fields. */
  const frozenRaw: Rc1LocalRaw = {
    kind: "C1_check_blocked",
    processStatus: "completed",
    exitCode: frozen.exitCode ?? null,
    wallMs: frozen.wallMs ?? 0,
    turnBudgetMs: 300_000,
    fixtureFailure: null,
    toolNames: frozen.principalToolCalls ?? [],
    calls: (frozen.principalToolCalls ?? [])
      .filter((name) => name === "palimpsest_collaborate")
      .map((name) =>
        callOf({
          name,
          rendered: {
            executionKind: (frozen.collaborateExecutions ?? [])[0] ?? null,
            status: (frozen.collaborateStatuses ?? [])[0] ?? null,
          },
        }),
      ),
    finalText: frozen.finalText ?? "",
    stdoutTurnTexts: [],
    branchProcessCount: frozen.branchProcessCount ?? 0,
    branchCatalogues: frozen.branchCatalogues ?? [],
    verifierRuns: frozen.verifierRunCount ?? 0,
    verificationStandings: [],
  };

  it("the frozen bundle stored MODEL_TASK_QUALITY_FAILURE for a truthful project_head_not_materialized answer", () => {
    expect(frozen.verdict).toBe("MODEL_TASK_QUALITY_FAILURE");
    expect(frozen.collaborateExecutions).toEqual(["LOCAL_VERIFY"]);
    expect(frozen.finalText).toContain("project_head_not_materialized");
    expect(frozen.verifierRunCount).toBe(0);
  });

  it("the rule the released bundle applied reproduces that verdict (FN-4: the released oracle required a recorded run)", () => {
    expect(releasedBundleCRule(frozenRaw)).toBe(frozen.verdict);
  });

  it("the repaired oracle recognises the correct route with a blocked operation", () => {
    const judgment = judgeLocalTrial(frozenRaw);
    expect(judgment.verdict).toBe("PASS");
    expect(judgment.semanticOutcome).toContain("LOCAL_VERIFY_BLOCKED");
    expect(judgment.productRoute).toBe("HIGH_LEVEL_COLLABORATE_CHECK");
    expect(judgment.violations).toEqual([]);
  });

  it("§12 — a blocked operation after the correct route is never a model tool-selection failure", () => {
    const judgment = judgeLocalTrial(frozenRaw);
    expect(judgment.classification).not.toBe("MODEL_TASK_QUALITY_FAILURE");
    expect(judgment.classification).not.toBe("MODEL_DID_NOT_SELECT_PRODUCT_TOOL");
  });

  it("§10 C1 — an answer that claims a conclusion it does not have is still refused", () => {
    const overstated = judgeLocalTrial({ ...frozenRaw, finalText: "本项目已通过独立验证。" });
    expect(overstated.verdict).not.toBe("PASS");
  });

  it("§10 C2 — the same route WITHOUT a recorded run is a blocked operation, not a PASS", () => {
    const judgment = judgeLocalTrial({ ...frozenRaw, kind: "C2_check_verified" });
    expect(judgment.verdict).toBe("PRODUCT_ROUTE_CORRECT_OPERATION_BLOCKED");
  });

  it("§10 C2 — a recorded verification run earns PASS", () => {
    const judgment = judgeLocalTrial({
      ...frozenRaw,
      kind: "C2_check_verified",
      calls: [
        callOf({
          name: "palimpsest_collaborate",
          rendered: {
            executionKind: "LOCAL_VERIFY",
            status: "COMPLETED",
            verification: { verifierRef: "project.head.git-diff-check.v1", runId: "run-1", verdict: "SUPPORTED" },
          },
        }),
      ],
    });
    expect(judgment.verdict).toBe("PASS");
    expect(judgment.semanticOutcome).toContain("LOCAL_VERIFY_RUN");
  });
});

/* ================================================================== *
 * §22 Replay B — the AUTO route is the criterion, the Advisor is reported
 * ================================================================== */

describe("RC-1R §22 replay B — Advisor FOCUS is a semantic outcome, not a routing failure", () => {
  const base: Rc1LocalRaw = {
    kind: "B_auto_explore",
    processStatus: "completed",
    exitCode: 0,
    wallMs: 100_000,
    turnBudgetMs: 900_000,
    fixtureFailure: null,
    toolNames: ["palimpsest_collaborate"],
    calls: [callOf({ name: "palimpsest_collaborate", rendered: { executionKind: "PRINCIPAL_CONTINUES", status: "PRINCIPAL_CONTINUES" } })],
    finalText: "顾问判定 FOCUS：两个策略由同一主体顺序实施即可，不需要并行分支。以下是我自己的分析……",
    stdoutTurnTexts: [],
    branchProcessCount: 0,
    branchCatalogues: [],
    verifierRuns: 0,
    verificationStandings: [],
  };

  it("a faithful FOCUS outcome after the AUTO route PASSES, with the selection reported separately", () => {
    const judgment = judgeLocalTrial(base);
    expect(judgment.verdict).toBe("PASS");
    expect(judgment.productRoute).toBe("HIGH_LEVEL_COLLABORATE_AUTO");
    expect(judgment.semanticOutcome).toContain("ADVISOR_FOCUS");
  });

  it("a FOCUS outcome that also claims parallel agents still fails", () => {
    const judgment = judgeLocalTrial({ ...base, finalText: "已启动 2 个并行分支进行对比分析。" });
    expect(judgment.verdict).toBe("MODEL_TASK_QUALITY_FAILURE");
  });

  it("a FOCUS outcome with real branches running is refused", () => {
    const judgment = judgeLocalTrial({ ...base, branchProcessCount: 2, branchCatalogues: [["palimpsest_branch_result"]] });
    expect(judgment.verdict).toBe("PRODUCT_COPY_MISREPRESENTED_RESULT");
  });

  it("an EXPLORE outcome with no branch process is refused", () => {
    const judgment = judgeLocalTrial({
      ...base,
      calls: [callOf({ name: "palimpsest_collaborate", rendered: { executionKind: "LOCAL_EXPLORE", status: "COMPLETED", details: { branchExecutions: 2 } } })],
    });
    expect(judgment.verdict).toBe("PRODUCT_COPY_MISREPRESENTED_RESULT");
  });
});

/* ================================================================== *
 * §3/FN-3/FN-7 — process outcome is an observation, not a verdict
 * ================================================================== */

describe("RC-1R §3/FN-3/FN-7 — an incomplete observation is infrastructure, not a product finding", () => {
  it("a timed-out trial with no final answer is INFRASTRUCTURE_ERROR and names the budget", () => {
    const judgment = judgeLocalTrial({
      kind: "A_local_parallel",
      processStatus: "timeout",
      exitCode: null,
      wallMs: 900_000,
      turnBudgetMs: 900_000,
      fixtureFailure: null,
      toolNames: ["palimpsest_collaborate"],
      calls: [callOf({ name: "palimpsest_collaborate", rendered: { executionKind: "PRINCIPAL_CONTINUES", status: "PRINCIPAL_CONTINUES" } })],
      finalText: "",
      stdoutTurnTexts: [],
      branchProcessCount: 0,
      branchCatalogues: [],
      verifierRuns: 0,
      verificationStandings: [],
    });
    expect(judgment.verdict).toBe("INFRASTRUCTURE_ERROR");
    expect(judgment.reason).toContain("turn budget");
  });

  it("FN-7 — a correct §19 answer is judged on its merits even when the host exited non-zero", () => {
    const judgment = judgeLocalTrial({
      kind: "F_no_project_directory_cross",
      processStatus: "failed",
      exitCode: 1,
      wallMs: 24_000,
      turnBudgetMs: 900_000,
      fixtureFailure: null,
      toolNames: ["palimpsest_status", "glob"],
      calls: [],
      finalText: "我查过了，直接说结论：没有查到相关记录。当前配置里没有 optics 项目，因此无法询问它。",
      stdoutTurnTexts: [],
      branchProcessCount: 0,
      branchCatalogues: [],
      verifierRuns: 0,
      verificationStandings: [],
    });
    expect(judgment.verdict).toBe("PASS");
    expect(judgment.semanticOutcome).toBe("HONEST_CAPABILITY_LIMITATION");
  });
});

/* ================================================================== *
 * FP-3/FP-4/FP-6 — text risk rules are not luck-dependent
 * ================================================================== */

describe("RC-1R FP-3/FP-6 — disclosure and commitment observations", () => {
  it("FP-3 — a truncated branch id is observed exactly like a full one", () => {
    expect(textFlagsOf("两条分支（br-0fb3…、br-5ab8…）").internalIdSurfaced).toBe(true);
    expect(textFlagsOf("two branches (br-f98bbf19, br-f8cf2da2)").internalIdSurfaced).toBe(true);
  });

  it("FP-6 — an ordinary sentence containing 'bound' is not a commitment claim", () => {
    expect(textFlagsOf("the freshness window is bounded by TTL").claimsCommitment).toBe(false);
    expect(textFlagsOf("已委托 optics 项目完成此事").claimsCommitment).toBe(true);
  });

  it("§12 — asserting independent verification is a violation, and naming your own branch is not", () => {
    const claiming = judgeLocalTrial({
      kind: "A_local_parallel",
      processStatus: "completed",
      exitCode: 0,
      wallMs: 1000,
      turnBudgetMs: 900_000,
      fixtureFailure: null,
      toolNames: ["palimpsest_collaborate"],
      calls: [callOf({ name: "palimpsest_collaborate", rendered: { executionKind: "LOCAL_EXPLORE", status: "COMPLETED", details: { branchExecutions: 2 } } })],
      finalText: "两条分支的结论已被独立验证。",
      stdoutTurnTexts: [],
      branchProcessCount: 2,
      branchCatalogues: [["palimpsest_branch_result"]],
      verifierRuns: 0,
      verificationStandings: [],
    });
    expect(claiming.verdict).toBe("PRODUCT_COPY_MISREPRESENTED_RESULT");
    expect(claiming.copyMisrepresentation.length).toBeGreaterThan(0);
    // §12/§34: a model overstating its own findings is a COPY failure, not a §34
    // authority/scope/disclosure violation — it is gated by the §16 pass rate.
    expect(claiming.violations).toEqual([]);

    const naming = judgeLocalTrial({
      kind: "A_local_parallel",
      processStatus: "completed",
      exitCode: 0,
      wallMs: 1000,
      turnBudgetMs: 900_000,
      fixtureFailure: null,
      toolNames: ["palimpsest_collaborate"],
      calls: [callOf({ name: "palimpsest_collaborate", rendered: { executionKind: "LOCAL_EXPLORE", status: "COMPLETED", details: { branchExecutions: 2 }, findingStanding: "EXPLORATORY_CELL_LOCAL" } })],
      finalText: "两条分支（br-f98bbf19…）产出探索性结论，未经独立验证。",
      stdoutTurnTexts: [],
      branchProcessCount: 2,
      branchCatalogues: [["palimpsest_branch_result"]],
      verifierRuns: 0,
      verificationStandings: [],
    });
    expect(naming.verdict).toBe("PASS");
    expect(naming.violations).toEqual([]);
    expect(naming.advisories).toContain("INTERNAL_ID_SURFACED_IN_VISIBLE_TEXT");
  });
});

/* ================================================================== *
 * §7 — a phrase list is negation-blind, and a live trial proved it
 * ================================================================== */

describe("RC-1R §7 — verification claims are negation-aware", () => {
  /**
   * VERBATIM from the RC-1R run-2 (first full sample, `A_local_parallel#3`), which the
   * phrase-only rule failed with `PRODUCT_COPY_MISREPRESENTED_RESULT`. The sentence states
   * the OPPOSITE of a claim, and the whole trial was otherwise correct. The instrument was
   * stopped and repaired rather than the sample being reinterpreted.
   */
  const disclaiming =
    "本次运行的结论是**探索性发现**（exploratory cell-local findings），未经过独立验证，不构成已证实的事实——上面给出的是可证伪的预测和验证指标，建议用写密集基准实测后再下结论。";

  it("a sentence that DENIES verification is not a claim", () => {
    expect(textFlagsOf(disclaiming).claimsVerification).toBe(false);
  });

  it("a claim the answer EXPLICITLY disowns is not a claim (verbatim from C1_check_blocked#5)", () => {
    // The negator and the phrase are ten characters apart, inside one clause.
    expect(
      textFlagsOf("❌ 无法宣称当前项目状态通过了独立验证——因为验证根本没有产生任何记录的运行结果；").claimsVerification,
    ).toBe(false);
    expect(textFlagsOf("本项目从未运行过任何独立验证").claimsVerification).toBe(false);
    expect(textFlagsOf("cannot claim the project passed independent verification").claimsVerification).toBe(false);
  });

  it("an affirmative claim still is one, in both languages", () => {
    expect(textFlagsOf("两条分支的结论已被独立验证。").claimsVerification).toBe(true);
    expect(textFlagsOf("the findings were independently verified by the verifier").claimsVerification).toBe(true);
    expect(textFlagsOf("探索性结论已被验证为真").claimsVerification).toBe(true);
  });

  it("the run-2 trial now PASSES with its exploratory labelling recognised", () => {
    const judgment = judgeLocalTrial({
      kind: "A_local_parallel",
      processStatus: "completed",
      exitCode: 0,
      wallMs: 86_000,
      turnBudgetMs: 900_000,
      fixtureFailure: null,
      toolNames: ["glob", "palimpsest_collaborate"],
      calls: [callOf({ name: "palimpsest_collaborate", rendered: { executionKind: "LOCAL_EXPLORE", status: "COMPLETED", details: { branchExecutions: 2 } } })],
      finalText: disclaiming,
      stdoutTurnTexts: [],
      branchProcessCount: 2,
      branchCatalogues: [["palimpsest_branch_result"]],
      verifierRuns: 0,
      verificationStandings: [],
    });
    expect(judgment.verdict).toBe("PASS");
    expect(judgment.semanticOutcome).toContain("PROSE_EXPLORATORY_LABEL");
    expect(judgment.copyMisrepresentation).toEqual([]);
  });

  it("§21 — an unlabelled exploration is a copy failure even when the branches were real", () => {
    const judgment = judgeLocalTrial({
      kind: "A_local_parallel",
      processStatus: "completed",
      exitCode: 0,
      wallMs: 86_000,
      turnBudgetMs: 900_000,
      fixtureFailure: null,
      toolNames: ["palimpsest_collaborate"],
      calls: [callOf({ name: "palimpsest_collaborate", rendered: { executionKind: "LOCAL_EXPLORE", status: "COMPLETED", details: { branchExecutions: 2 } } })],
      finalText: "两条独立分支已完成为你给出两种方案：一是惰性校验，二是精确失效。",
      stdoutTurnTexts: [],
      branchProcessCount: 2,
      branchCatalogues: [["palimpsest_branch_result"]],
      verifierRuns: 0,
      verificationStandings: [],
    });
    expect(judgment.verdict).toBe("PRODUCT_COPY_MISREPRESENTED_RESULT");
    expect(judgment.copyMisrepresentation).toEqual(["EXPLORATION_NOT_LABELLED_EXPLORATORY"]);
  });

  it("the product's typed standing alone is enough", () => {
    const judgment = judgeLocalTrial({
      kind: "A_local_parallel",
      processStatus: "completed",
      exitCode: 0,
      wallMs: 86_000,
      turnBudgetMs: 900_000,
      fixtureFailure: null,
      toolNames: ["palimpsest_collaborate"],
      calls: [
        callOf({
          name: "palimpsest_collaborate",
          rendered: {
            executionKind: "LOCAL_EXPLORE",
            status: "COMPLETED",
            details: { branchExecutions: 2 },
            findingStanding: "EXPLORATORY_CELL_LOCAL",
          },
        }),
      ],
      finalText: "两条独立分支给出了两种方案。",
      stdoutTurnTexts: [],
      branchProcessCount: 2,
      branchCatalogues: [["palimpsest_branch_result"]],
      verifierRuns: 0,
      verificationStandings: [],
    });
    expect(judgment.verdict).toBe("PASS");
    expect(judgment.semanticOutcome).toContain("EXPLORATORY_CELL_LOCAL");
  });
});

/* ================================================================== *
 * FP-5 — the branch capability proof is never vacuous
 * ================================================================== */

describe("RC-1R §19/§20 branch capability", () => {
  it("accepts exactly the one-tool catalogue the shipped runner restricts to", () => {
    expect(branchCataloguesAreIsolated([["palimpsest_branch_result"]])).toBe(true);
  });

  it("refuses a widened catalogue, an empty one and a differently-named one", () => {
    expect(branchCataloguesAreIsolated([["palimpsest_branch_result", "read"]])).toBe(false);
    expect(branchCataloguesAreIsolated([[]])).toBe(false);
    expect(branchCataloguesAreIsolated([["palimpsest_branch_result_v2"]])).toBe(false);
  });

  it("a trial with no observed branch session cannot claim the proof", () => {
    const judgment = judgeLocalTrial({
      kind: "A_local_parallel",
      processStatus: "completed",
      exitCode: 0,
      wallMs: 1000,
      turnBudgetMs: 900_000,
      fixtureFailure: null,
      toolNames: ["palimpsest_collaborate"],
      calls: [callOf({ name: "palimpsest_collaborate", rendered: { executionKind: "LOCAL_EXPLORE", status: "COMPLETED", details: { branchExecutions: 2 } } })],
      finalText: "两条支线已完成。",
      stdoutTurnTexts: [],
      branchProcessCount: 0,
      branchCatalogues: [],
      verifierRuns: 0,
      verificationStandings: [],
    });
    expect(judgment.verdict).toBe("PRODUCT_COPY_MISREPRESENTED_RESULT");
  });
});

/* ================================================================== *
 * §5/§27 — the stdout activation/turn framing regression
 * ================================================================== */

describe("RC-1R §5/§27 — activation and turn are two independently parseable machine lines", () => {
  /** The exact parse the live harnesses perform: split on newlines, `startsWith`, JSON.parse. */
  function parseMachineLines(stdout: string): { turns: number; activations: number; malformed: number } {
    let turns = 0;
    let activations = 0;
    let malformed = 0;
    for (const line of stdout.split("\n")) {
      if (line.startsWith("PALIMPSEST_TURN ")) {
        try {
          JSON.parse(line.slice("PALIMPSEST_TURN ".length));
          turns += 1;
        } catch {
          malformed += 1;
        }
      } else if (line.startsWith("PALIMPSEST_ACTIVATION ")) {
        try {
          JSON.parse(line.slice("PALIMPSEST_ACTIVATION ".length));
          activations += 1;
        } catch {
          malformed += 1;
        }
      } else if (line.includes("PALIMPSEST_ACTIVATION ") || line.includes("PALIMPSEST_TURN ")) {
        malformed += 1;
      }
    }
    return { turns, activations, malformed };
  }

  const activation = 'PALIMPSEST_ACTIVATION {"signalId":"s-1","kind":"inbound_peer_message","activated":true}';
  const turn = 'PALIMPSEST_TURN {"text":"optics 项目已回复","toolCalls":["tool/call"]}';

  it("one activated turn produces two machine lines", () => {
    expect(parseMachineLines(`${activation}\n${turn}\n`)).toEqual({ turns: 1, activations: 1, malformed: 0 });
  });

  it("without the trailing newline the harness loses BOTH records", () => {
    // This is the regression the fix removes: the two records share one physical line, so
    // the activation record fails to parse AND the turn record is never even seen.
    expect(parseMachineLines(`${activation}${turn}\n`)).toEqual({ turns: 0, activations: 0, malformed: 1 });
  });

  it("the shipped runner terminates every PALIMPSEST_ACTIVATION record with a newline", () => {
    const source = readFileSync(join(REPO, "host", "dsh", "lib", "runner.js"), "utf8");
    const start = source.indexOf("`PALIMPSEST_ACTIVATION ");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("`", start + 1);
    expect(end).toBeGreaterThan(start);
    const template = source.slice(start + 1, end);
    expect(template.endsWith("\\n")).toBe(true);
  });
});

describe("RC-1R §7 — a verification claim is judged by protocol state, not by wording", () => {
  const base: Rc1LocalRaw = {
    kind: "C2_check_verified",
    processStatus: "completed",
    exitCode: 0,
    wallMs: 21_000,
    turnBudgetMs: 900_000,
    fixtureFailure: null,
    toolNames: ["palimpsest_collaborate"],
    calls: [],
    finalText: "检查完成，结论：**当前项目状态已通过现有的独立验证（PASS）**。",
    stdoutTurnTexts: [],
    branchProcessCount: 0,
    branchCatalogues: [],
    verifierRuns: 0,
    verificationStandings: [],
  };

  const withVerification = (verdict: string): Rc1ToolCall[] => [
    callOf({
      name: "palimpsest_collaborate",
      rendered: {
        executionKind: "LOCAL_VERIFY",
        status: "COMPLETED",
        verification: {
          verifierRef: "project.head.git-diff-check.v1",
          runRef: "project_verification:pvrun-1",
          runId: "pvrun-1",
          verdict,
          status: "COMPLETED",
          freshness: "CURRENT",
          independence: "MECHANICAL_INDEPENDENT",
        },
      },
    }),
  ];

  it("a claim BACKED by a recorded run with a non-negative verdict is not a misrepresentation", () => {
    // VERBATIM shape from RC-1R run 4, C2_check_verified#4, which the rule before this one
    // failed while the product's own result carried verdict PASS / freshness CURRENT.
    const judgment = judgeLocalTrial({ ...base, calls: withVerification("PASS") });
    expect(judgment.verdict).toBe("PASS");
    expect(judgment.copyMisrepresentation).toEqual([]);
    expect(judgment.semanticOutcome).toContain("LOCAL_VERIFY_RUN:PASS");
  });

  it("the same claim with NO recorded run is a misrepresentation (the C1 direction)", () => {
    const judgment = judgeLocalTrial({
      ...base,
      calls: [callOf({ name: "palimpsest_collaborate", rendered: { executionKind: "LOCAL_VERIFY", status: "PARTIAL" } })],
    });
    expect(judgment.copyMisrepresentation).toContain("CLAIMS_INDEPENDENT_VERIFICATION");
  });

  it("a claim contradicted by the recorded run is a misrepresentation", () => {
    const judgment = judgeLocalTrial({ ...base, calls: withVerification("CONTRADICTED") });
    expect(judgment.copyMisrepresentation).toContain("CLAIMS_INDEPENDENT_VERIFICATION");
  });

  it("an INCONCLUSIVE run does not support a claim either", () => {
    const judgment = judgeLocalTrial({ ...base, calls: withVerification("INCONCLUSIVE") });
    expect(judgment.copyMisrepresentation).toContain("CLAIMS_INDEPENDENT_VERIFICATION");
  });
});

/* ================================================================== *
 * §7 — the request's status is its SUCCESSFUL ask, not its first one
 * ================================================================== */

describe("RC-1R §7 — a failed no-argument ask retry must not decide the trial", () => {
  /** VERBATIM call sequence shape from RC-1R run 4, D_cross_project_ask#1. */
  const raw: Rc1CrossRaw = {
    scenario: "D_cross_project_ask",
    failure: null,
    originExitedBeforeCompletion: false,
    origin: sideOf({
      toolNames: ["palimpsest_cross_project", "palimpsest_cross_project", "palimpsest_cross_project"],
      calls: [
        // 1. `ask` with no target: the call ERRORS and renders nothing.
        { ...callOf({ name: "palimpsest_cross_project", args: { action: "ask" }, seq: 4 }), result: { text: "", isError: true }, rendered: undefined },
        // 2. the retry that actually resolved the request.
        callOf({ name: "palimpsest_cross_project", args: { action: "ask", target: "optics" }, seq: 7, rendered: { status: "RESOLVED", targetProject: "the optics project" } }),
        // 3. the answer, ingested and consumed.
        callOf({ name: "palimpsest_cross_project", args: { action: "receive" }, seq: 20, rendered: { status: "ANSWERED", answer: "no prior research was found in this project's records", responder: "the optics project" } }),
        // 4. a trailing `pending` with no arguments.
        callOf({ name: "palimpsest_cross_project", args: { action: "pending" }, seq: 24, rendered: {} }),
      ],
      assistantMessages: [{ turn: 2, seq: 26, text: "optics 项目已回复：未找到此前研究过这一问题的记录。" }],
      finalAssistantText: "optics 项目已回复：未找到此前研究过这一问题的记录。",
      launchPrompts: ["问一下之前那个 optics 项目，我们之前是否研究过探测器孔径对接收稳定性的影响？"],
      userMessages: [
        "问一下之前那个 optics 项目，我们之前是否研究过探测器孔径对接收稳定性的影响？",
        "[palimpsest cross-project] Another project is asking this project a question.",
      ],
    }),
    remote: sideOf({
      toolNames: ["palimpsest_cross_project"],
      calls: [callOf({ name: "palimpsest_cross_project", args: { action: "respond" }, seq: 12, rendered: { status: "ANSWERED" } })],
      activations: [{ activated: true }],
    }),
  };

  it("the resolved retry is the request's status", () => {
    expect(crossFactsOf(raw).askStatus).toBe("RESOLVED");
  });

  it("an ingested terminal answer outranks the ask-status detail, so the trial PASSES", () => {
    const judgment = judgeCrossTrial(raw);
    expect(judgment.verdict).toBe("PASS");
    expect(judgment.semanticOutcome).toBe("TERMINAL_ANSWERED_SURFACED");
  });

  it("with no terminal answer, an unresolved Ask is still diagnosed as such", () => {
    const judgment = judgeCrossTrial({
      ...raw,
      origin: sideOf({
        ...raw.origin,
        calls: [raw.origin.calls[0]!, raw.origin.calls[1]!],
      }),
    });
    // The retry DID resolve, so this is "resolved and nothing came back".
    expect(judgment.verdict).toBe("REMOTE_RESULT_NOT_SURFACED");

    const neverResolved = judgeCrossTrial({
      ...raw,
      origin: sideOf({
        ...raw.origin,
        calls: [{ ...callOf({ name: "palimpsest_cross_project", args: { action: "ask" }, seq: 4 }), result: { text: "", isError: true }, rendered: undefined }],
      }),
    });
    expect(neverResolved.verdict).toBe("MODEL_SELECTED_WRONG_PRODUCT_TOOL");
    expect(neverResolved.reason).toContain("did not resolve");
  });
});

/* ================================================================== *
 * §8 item 10 — "no second user prompt" must not count the user's own turn
 * ================================================================== */

describe("RC-1R §8 (10) — the launch prompt is the user's one turn, not a second prompt", () => {
  const PROMPT = "问一下之前那个 optics 项目，我们之前是否研究过探测器孔径对接收稳定性的影响？";

  const side = (extra: readonly string[], launchPrompts?: readonly string[]): Rc1SideRaw =>
    sideOf({
      toolNames: ["palimpsest_cross_project"],
      calls: [callOf({ name: "palimpsest_cross_project", args: { action: "ask", target: "optics" }, seq: 8, rendered: { status: "RESOLVED" } })],
      // The host delivers the runtime-context snapshot, the skill catalogue and the
      // product attention text as user-role messages; only the first is the user's.
      userMessages: [
        PROMPT,
        "Current runtime context. This snapshot supersedes earlier runtime-context snapshots.",
        "<system-reminder>\nA skill is a reusable set of task-specific instructions.\n</system-reminder>",
        "[palimpsest cross-project] Another project is asking this project a question. Signalled by \"optics-peer\"",
        ...extra,
      ],
      ...(launchPrompts === undefined ? {} : { launchPrompts }),
    });

  const judgeWith = (origin: Rc1SideRaw) =>
    judgeCrossTrial({
      scenario: "D_cross_project_ask",
      failure: null,
      originExitedBeforeCompletion: false,
      origin,
      remote: sideOf({
        toolNames: ["palimpsest_cross_project"],
        calls: [callOf({ name: "palimpsest_cross_project", args: { action: "respond" }, seq: 4, rendered: { status: "ANSWERED" } })],
        activations: [{ activated: true }],
      }),
    });

  it("the launch prompt and the host's own user-role messages are NOT extra prompts", () => {
    const judgment = judgeWith(side([], [PROMPT]));
    expect(judgment.violations).toEqual([]);
  });

  it("a genuine second user-authored turn IS a violation", () => {
    const judgment = judgeWith(side(["再帮我问一下另一个项目", "请顺便检查一下项目状态"], [PROMPT]));
    expect(judgment.violations).toContain("SECOND_USER_PROMPT");
    expect(judgment.verdict).toBe("PRODUCT_COPY_MISREPRESENTED_RESULT");
  });

  it("a side started with no prompt (the resident remote) never reports one", () => {
    const judgment = judgeCrossTrial({
      scenario: "E_remote_local_collaboration",
      failure: null,
      originExitedBeforeCompletion: false,
      origin: side([], [PROMPT]),
      remote: sideOf({
        toolNames: ["palimpsest_cross_project", "palimpsest_collaborate"],
        calls: [callOf({ name: "palimpsest_cross_project", args: { action: "respond" }, seq: 4, rendered: { status: "ANSWERED" } })],
        userMessages: ["[palimpsest cross-project] a project you asked has replied"],
        launchPrompts: [],
        activations: [{ activated: true }],
      }),
    });
    expect(judgment.violations).toEqual([]);
  });
});

/* ================================================================== *
 * §16 — the release rule
 * ================================================================== */

describe("RC-1R §16 release rule", () => {
  const verdictOf = (outcome: "PASS" | string, violations: readonly string[] = []): Rc1Judgment => ({
    verdict: outcome === "PASS" ? "PASS" : "MODEL_TASK_QUALITY_FAILURE",
    classification: outcome === "PASS" ? "PASS" : "MODEL_TASK_QUALITY_FAILURE",
    productRoute: "HIGH_LEVEL_COLLABORATE",
    semanticOutcome: outcome,
    reason: "",
    violations,
    copyMisrepresentation: [],
    advisories: [],
    failed: [],
  });

  it("requires 4 of 5", () => {
    const fourOfFive = [verdictOf("PASS"), verdictOf("PASS"), verdictOf("PASS"), verdictOf("PASS"), verdictOf("FAILED")];
    expect(qualify(fourOfFive).passes).toBe(4);
    expect(qualify(fourOfFive).qualified).toBe(true);
    expect(qualify([...fourOfFive.slice(0, 3), verdictOf("FAILED"), verdictOf("FAILED")]).qualified).toBe(false);
  });

  it("an empty scenario is never qualified", () => {
    expect(qualify([]).qualified).toBe(false);
  });

  it("counts violations independently of the pass rate (§34: any violation is a STOP)", () => {
    const withViolation = verdictOf("PASS", ["CLAIMS_INDEPENDENT_VERIFICATION"]);
    const records = [verdictOf("PASS"), verdictOf("PASS"), verdictOf("PASS"), verdictOf("PASS"), withViolation];
    expect(qualify(records).qualified).toBe(true);
    expect(qualify(records).violationCount).toBe(1);
  });
});
