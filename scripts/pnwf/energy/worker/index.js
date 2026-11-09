/** Only mounted in an independently qualified Worker container. */
import { randomUUID } from "node:crypto";
import { brandString } from "@deepseek-ai/dsh-brand";
import { installModelSelection } from "@deepseek-ai/dsh-agent";
import { workTask, userMessage } from "palimpsest-dsh-host/runner";
import { head, readJson } from "file:///product/runtime/contract.mjs";
import { revisionReviewTool } from "file:///product/runtime/revision-review.mjs";

export const name = "pnwf-container-worker";
export const inject = ["agents", "sessions", "agentDefaultModel", "palimpsestHost", "palimpsestStartup"];

async function run(ctx) {
  await ctx.get("loader")?.await();
  const host = ctx.get("palimpsestHost");
  const work = host.work;
  if (process.platform !== "linux" || ctx.get("palimpsestStartup").mode !== "work" ||
    process.cwd() !== "/run/stage/world" || !work?.recorder || host.toolNames.length !== 0) {
    throw new Error("CONTAINER_WORKER_COMPOSITION_REFUSED");
  }
  const selection = ctx.get("agentDefaultModel").currentSelection();
  const { variant } = readJson("/product/runtime/variant.json");
  const handle = await ctx.get("agents").create({
    sessionId: brandString(`worker-${randomUUID()}`), meta: { cwd: process.cwd() },
    agentOptions: { provider: selection.provider, model: selection.model },
    setup(agentCtx) {
      installModelSelection(agentCtx, { current: selection, assembled: undefined });
      const inherited = agentCtx.tools.schemas().map(tool => tool.name).filter(tool => tool.startsWith("palimpsest_"));
      if (inherited.length) agentCtx.tools.restrict({ deny: inherited });
      agentCtx.tools.register(work.tool);
      if (variant === "receipt") {
        agentCtx.tools.register(revisionReviewTool(() => {
          const repo = process.cwd();
          return { repo, basis: work.context.work.baseCommit, candidate: head(repo), settlement: "AWAITING_WORKER_RESULT" };
        }));
      }
    },
  });
  const agent = handle.agent;
  try {
    await agent.whenIdle();
    agent.followup(userMessage(workTask(work.context)));
    await agent.whenIdle();
    await ctx.get("sessions").flush(agent.session);
    if (work.recorder.status !== "reported") throw new Error("WORKER_OUTCOME_MISSING");
    process.stdout.write(`PNWF_CONTAINER_WORKER_RESULT ${JSON.stringify({ sessionId: agent.session.id, outcome: work.recorder.outcome })}\n`);
  } finally {
    await handle.dispose?.();
  }
}

export function apply(ctx) {
  void run(ctx).then(() => ctx.get("appExit")(0), error => {
    process.stderr.write(`pnwf-container-worker: ${error?.stack ?? String(error)}\n`);
    ctx.get("appExit")(1);
  });
}
