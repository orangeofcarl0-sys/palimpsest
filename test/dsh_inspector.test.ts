import { describe, expect, it } from "vitest";
// The shipped DSH host is native ESM JavaScript.
// @ts-expect-error The host bundle does not publish TypeScript declarations.
import { createInspector } from "../host/dsh/lib/inspector/observe.js";
// @ts-expect-error Same native ESM bundle.
import { drawing, drawPulse, key } from "../host/dsh/lib/inspector/graph.js";

function fixture() {
  let now = 1000, phase = "RUNNING", fail = false, reads = 0;
  const store = { projectTimeline: () => [] };
  const inspector = createInspector({
    profile: { projectId: "p" }, toolNames: ["palimpsest_work"],
    deployment: { installed: {
      controller: { store, viewCursor: () => "same-work-cursor", isProjectInitialized: () => false },
      workDelegation: { jobs: async () => {
        reads++;
        if (fail) throw new Error("worker transport unavailable");
        return [{ jobId: "j", taskId: "t", phase }];
      } }, application: {},
    } },
  }, { clock: () => now, retention: 2, interval: 10 });
  return { inspector, rpc: (method: string, payload: object) => inspector.read(method, payload),
    tick: () => { now += 20; }, phase: (s: string) => { phase = s; }, fail: () => { fail = true; }, reads: () => reads };
}

describe("DSH project inspector", () => {
  it("connects a settled result to the recorded executor and keeps pending work out of the outcomes column", () => {
    const d = drawing();
    d.node(key("project", "p"), 0, "项目", "p", null, "Work", "p");
    d.node(key("task", "t"), 2, "任务", "现场核验", null, "Work", "t");
    const sha = "f".repeat(40);
    drawPulse(d, { projectId: "p", episode: {}, delegations: [], decisionQueue: [], contributions: [], acceptedAssets: [],
      candidates: [{ id: "loop:l", standing: "CANDIDATE", title: "Work awaiting a legal next step", sourceRefs: ["task:t"] }],
      execution: { attempts: [{ taskId: "t", relay: { attribution: "PRINCIPAL_RECOVERY", executor: "PRINCIPAL", settledBy: "PRINCIPAL", resultCommit: sha } }] } });
    const { nodes, edges } = d.finish();
    expect(nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ ref: "loop:l", lane: 2, kind: "待处理事项" }),
      expect.objectContaining({ ref: sha, kind: "结算记录" }),
    ]));
    expect(edges).toContainEqual(expect.objectContaining({ from: key("task", "t"), to: key("settlement", "t", sha), kind: "最近结算结果" }));
    expect(edges).toContainEqual(expect.objectContaining({ from: key("settlement-role", "t", sha, "PRINCIPAL"), to: key("settlement", "t", sha), kind: "执行归因" }));
  });

  it("coalesces readers, observes a Worker change independent of Work, freezes the earlier graph and marks loss of coverage", async () => {
    const f = fixture();
    const [first, other] = await Promise.all([f.rpc("live", {}), f.rpc("live", {})]);
    expect(first).toEqual(other);
    expect(f.reads()).toBe(1);
    const { epoch, latest } = first.value;
    f.tick();
    expect((await f.rpc("live", { epoch, id: latest })).value.frame).toBeUndefined();
    f.phase("FINISHED"); f.tick();
    expect((await f.rpc("live", {})).value.latest).toBe(latest + 1);
    expect((await f.rpc("frame", { epoch, id: latest })).value.state.nodes).toEqual(
      expect.arrayContaining([expect.objectContaining({ ref: "j", state: "RUNNING" })]));
    f.fail(); f.tick();
    expect((await f.rpc("live", {})).value.frame.state.coverage["正式 Worker"]).toMatch(/读取失败/);
    expect((await f.rpc("frame", { epoch, id: latest })).error.code).toBe("expired");
    expect((await f.rpc("frame", { epoch: "another-boot", id: latest + 1 })).error.code).toBe("expired");
  });

  it("scopes calls by session and ID, matches PTC, and keeps prompts, results and unrelated tools out of the graph", async () => {
    const f = fixture();
    const event = (id: string, seq: number, type: string, data: object) => f.inspector.onSessionEvent({ id }, { seq, type, data });
    event("a", 1, "tool/call", { name: "palimpsest_work", callId: "c", arguments: "private text" });
    event("b", 1, "tool/ptc-dispatch-start", { name: "palimpsest_work", subCallId: "c" });
    event("b", 2, "tool/ptc-dispatch", { name: "palimpsest_work", subCallId: "c", isError: true });
    event("a", 3, "tool/result", { message: { source: { callId: "c" }, content: "private text" } });
    event("a", 4, "tool/call", { name: "unrelated", callId: "d" });
    const data = (await f.rpc("live", {})).value.frame.state;
    expect(data.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "工具调用", state: "已返回", facts: { 会话: "a", 调用序号: 1, 结果序号: 3 } }),
      expect.objectContaining({ kind: "工具调用", state: "工具错误", facts: { 会话: "b", 调用序号: 1, 结果序号: 2 } }),
    ]));
    expect(JSON.stringify(data)).not.toMatch(/private text|unrelated/);
    expect((await f.rpc("live", { projectId: "other" })).error.code).toBe("invalid");
    expect((await f.rpc("promote", {})).error.code).toBe("unknown");
  });
});
